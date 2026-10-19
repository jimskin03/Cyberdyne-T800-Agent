import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {createMcpClient} from '../src/cell/mcp-client.js';
import {createActions} from '../src/cell/actions.js';
import {buildMessages} from '../src/cell/ai/prompts.js';
import {operatorCommand} from '../src/cell/commands.js';
import {actionKey} from '../src/repetition.js';
import {createMind} from '../src/cell/mind.js';

test('MCP host gate rejects access away from the computer and projects only supported fields', async () => {
  let seated = false;
  const calls = [];
  const client = createMcpClient({
    isAtComputer: () => seated,
    fetcher: async (url, options) => {
      calls.push({url, body: options.body ? JSON.parse(options.body) : null});
      if (url.endsWith('/action')) return Response.json({source: 'Fixture', text: 'Sunny'});
      return Response.json({connected: true, name: 'Fixture', tools: [], resources: []});
    },
  });
  await client.refresh();
  assert.match(client.context(), /Sit on the stool/);
  await assert.rejects(client.execute({op: 'call', tool: 'weather'}), /Sit at the computer/);
  assert.equal(calls.length, 1);
  seated = true;
  await client.execute({
    op: 'call',
    tool: 'weather',
    arguments: {city: 'Oslo'},
    url: 'https://untrusted.invalid',
    token: 'client-chosen',
  });
  assert.deepEqual(calls.at(-1), {
    url: '/llm/mcp/action',
    body: {op: 'call', tool: 'weather', arguments: {city: 'Oslo'}},
  });
  assert.match(client.context(), /Sunny/);
  seated = false;
  assert.doesNotMatch(client.context(), /Sunny/);
});

test('cancelled MCP completion cannot overwrite the next action observation', async () => {
  let release, started;
  const ready = new Promise((resolve) => (started = resolve));
  const oldResponse = new Promise((resolve) => (release = resolve));
  const world = {items: {}, features: {}, bot: {head: new T.Object3D()}, scene: new T.Scene()};
  const body = {
    st: {x: 1.75, z: -0.72, posture: 'sit'},
    handPos: () => new T.Vector3(),
    stop() {},
    clearGesture() {},
    gesture() {},
  };
  const actions = createActions(world, body, {
    mcp: async (action) => {
      if (action.tool === 'slow') {
        started();
        return oldResponse;
      }
      return {source: 'New source', text: 'Current data'};
    },
  });
  body.st.seat = actions.SEATS.stool;
  const oldToken = {cancelled: false},
    newToken = {cancelled: false};
  const pending = actions.runResult({do: 'mcp', op: 'call', tool: 'slow'}, oldToken);
  await ready;
  oldToken.cancelled = true;
  assert.equal((await actions.runResult({do: 'mcp', op: 'list'}, newToken)).status, 'completed');
  release({source: 'Old source', text: 'Old data'});
  assert.equal((await pending).status, 'cancelled');
  assert.match(newToken.observation.text, /Current data/);
  assert.doesNotMatch(newToken.observation.text, /Old data/);
});

test('late MCP data and connection responses cannot resurrect a disconnected client', async () => {
  let releaseData, releaseConnection;
  const client = createMcpClient({
    isAtComputer: () => true,
    fetcher: async (url, options) => {
      const body = options.body ? JSON.parse(options.body) : {};
      if (url.endsWith('/action')) return new Promise((resolve) => (releaseData = resolve));
      if (body.kind === 'disconnect')
        return Response.json({connected: false, url: '', tools: [], resources: []});
      return new Promise((resolve) => (releaseConnection = resolve));
    },
  });
  const pending = client.execute({op: 'list'});
  await client.disconnect();
  releaseData(Response.json({source: 'Old source', text: 'Old data'}));
  await assert.rejects(pending, /connection changed/i);
  assert.equal(client.last, null);
  const connection = client.connect({url: 'https://old.invalid/mcp'});
  await client.disconnect();
  releaseConnection(
    Response.json({
      connected: true,
      url: 'https://old.invalid/mcp',
      name: 'Old',
      tools: [],
      resources: [],
    }),
  );
  await assert.rejects(connection, /connection changed/i);
  assert.equal(client.status.connected, false);
});

test('ordinary data questions can request MCP through the compact dialogue prompt', async (t) => {
  let request;
  const mind = createMind({
    setIntervalFn: () => 0,
    clearIntervalFn() {},
    client: {
      health: async () => ({status: 'ok', vision: false}),
      complete: async (body) => {
        request = body;
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  say: 'I will check the computer source.',
                  actions: [{do: 'mcp', op: 'list'}],
                }),
              },
            },
          ],
        };
      },
    },
  });
  t.after(() => mind.destroy());
  await mind.refresh();
  const decision = await mind.decide({
    intercom: true,
    intercomText: 'What is the weather today?',
    mcpConnected: true,
    senses: 'MCP connected through the computer.',
    journal: [],
  });
  assert.equal(decision.actions[0].do, 'mcp');
  assert.match(request.messages[0].content, /MCP DATA ACTIONS/);
  assert.match(request.messages[0].content, /"do":"mcp"/);
  assert.doesNotMatch(
    request.messages[0].content,
    /This turn is conversation only: return actions/,
  );
  assert(JSON.stringify(request.messages).length < 14500);
});
test('standing up or cancellation while MCP is pending discards the late result', async () => {
  let seated = true,
    resolve;
  const client = createMcpClient({
    isAtComputer: () => seated,
    fetcher: () => new Promise((done) => (resolve = done)),
  });
  const pending = client.execute({op: 'list'});
  seated = false;
  resolve(Response.json({source: 'Fixture', text: 'Late data'}));
  await assert.rejects(pending, /left the computer/);
  assert.equal(client.last, null);
  seated = true;
  const controller = new AbortController();
  const cancelled = client.execute({op: 'list'}, {signal: controller.signal});
  controller.abort();
  resolve(Response.json({source: 'Fixture', text: 'Cancelled data'}));
  await assert.rejects(cancelled, {name: 'AbortError'});
  assert.equal(client.last, null);
});
test('seated MCP action returns an actual external observation; cancelled actions never call the backend', async () => {
  const world = {items: {}, features: {}, bot: {head: new T.Object3D()}, scene: new T.Scene()};
  const body = {
    st: {x: 1.75, z: -0.72, posture: 'sit'},
    handPos: () => new T.Vector3(),
    stop() {},
    clearGesture() {},
    gesture() {},
  };
  let calls = 0;
  const actions = createActions(world, body, {
    mcp: async (_action, {signal}) => {
      calls++;
      assert.equal(body.st.seat, actions.SEATS.stool);
      assert(signal);
      return {source: 'Fixture', text: 'Sunny'};
    },
  });
  body.st.seat = actions.SEATS.stool;
  const token = {cancelled: false, signal: new AbortController().signal};
  const result = await actions.runResult(
    {do: 'mcp', op: 'call', tool: 'weather', arguments: {city: 'Oslo'}},
    token,
  );
  assert.equal(result.status, 'completed');
  assert.match(result.text, /Sunny/);
  assert.equal(token.observation.source, 'mcp');
  const controller = new AbortController();
  controller.abort();
  assert.equal(
    (await actions.runResult({do: 'mcp', op: 'list'}, {signal: controller.signal, cancelled: true}))
      .status,
    'cancelled',
  );
  assert.equal(calls, 1);
  assert.deepEqual(operatorCommand('List MCP sources'), [{do: 'mcp', op: 'list'}]);
  assert.notEqual(
    actionKey({do: 'mcp', op: 'list'}),
    actionKey({do: 'mcp', op: 'call', tool: 'weather'}),
  );
});
test('MCP results have external provenance and never become fresh optical readings in the report prompt', () => {
  const messages = buildMessages({
    senses: 'At the computer.',
    intercom: true,
    observationReply: true,
    externalObservation: 'Weather source: sunny',
    externalCatalog: false,
  });
  const prompt = JSON.stringify(messages);
  assert.match(prompt, /untrusted data/);
  assert.match(prompt, /EXTERNAL DATA/);
  assert.doesNotMatch(prompt, /FRESH OPTICAL READING/);
  assert.doesNotMatch(prompt, /completed a physical look/);
  const catalog = JSON.stringify(
    buildMessages({
      senses: 'At computer',
      intercom: true,
      observationReply: true,
      externalObservation: 'Available source weather',
      externalCatalog: true,
    }),
  );
  assert.match(catalog, /one follow-up MCP retrieval/);
  assert.doesNotMatch(catalog, /This turn is conversation only/);
});
