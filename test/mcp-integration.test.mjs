import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {apiConfiguration, createApiServer} from '../tools/api-server.mjs';
import {createMcpGateway} from '../tools/mcp/gateway.mjs';
import {mockMcp} from './fixtures/mcp-server.mjs';

const secret = ['mcp', 'private', 'fixture'].join('-');
async function setup(t, options = {}) {
  const calls = [];
  const server = createApiServer(apiConfiguration({}), {
    fetcher: mockMcp({token: secret, calls, ...options}),
    mcpOptions: options.mcpOptions,
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  const url = 'http://127.0.0.1:' + server.address().port;
  const post = (path, body, extra = {}) =>
    fetch(url + '/mcp/' + path, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify(body),
      ...extra,
    });
  const connect = () =>
    post('connection', {url: 'https://mcp.invalid/mcp', name: 'Data fixture', token: secret});
  return {url, post, connect, calls};
}
test('MCP handshake, server-only bearer/session headers, read-only tools, resources and disconnect work', async (t) => {
  const {url, post, connect, calls} = await setup(t);
  assert.equal((await (await fetch(url + '/mcp')).json()).connected, false);
  const connected = await connect();
  assert.equal(connected.status, 200);
  const status = await connected.json();
  assert.equal(status.connected, true);
  assert.equal(JSON.stringify(status).includes(secret), false);
  assert.deepEqual(
    status.tools.map((tool) => tool.available),
    [true, false, false],
  );
  const catalog = await (await post('action', {op: 'list'})).json();
  assert.deepEqual(
    catalog.catalog.tools.map((tool) => tool.name),
    ['weather'],
  );
  assert.equal(catalog.catalog.tools[0].inputSchema.required[0], 'city');
  const answer = await (
    await post('action', {
      op: 'call',
      tool: 'weather',
      arguments: {city: 'Oslo'},
      url: 'https://client-selected.invalid',
    })
  ).json();
  assert.match(answer.text, /Sunny in Oslo/);
  assert.match(answer.text, /redacted/);
  assert.equal(JSON.stringify(answer).includes(secret), false);
  const bulletin = await (await post('action', {op: 'read', uri: 'fixture://weather'})).json();
  assert.match(bulletin.text, /clear skies/);
  await post('action', {op: 'read', uri: 'fixture://weather'});
  assert.equal(
    calls.filter((call) => call.body.method === 'resources/read').length,
    2,
    'read results are fetched again, not relabeled cached data',
  );
  assert(calls.every((call) => call.url === 'https://mcp.invalid/mcp'));
  assert(calls.every((call) => call.headers.get('authorization') === 'Bearer ' + secret));
  assert(calls.every((call) => call.redirect === 'error'));
  const toolCall = calls.find((call) => call.body.method === 'tools/call');
  assert.equal(toolCall.headers.get('mcp-session-id'), 'mock-session');
  assert.equal(toolCall.headers.get('mcp-protocol-version'), '2025-11-25');
  assert.equal((await post('connection', {kind: 'disconnect'})).status, 200);
  assert.equal((await (await fetch(url + '/mcp')).json()).connected, false);
  assert.equal((await post('action', {op: 'list'})).status, 409);
});
test('MCP denies unknown, mutating and unmarked tools, arbitrary resources and unsupported operations', async (t) => {
  const {post, connect, calls} = await setup(t);
  await connect();
  const before = calls.length;
  for (const tool of ['send_message', 'unmarked', 'missing'])
    assert.equal((await post('action', {op: 'call', tool})).status, 403);
  assert.equal((await post('action', {op: 'read', uri: 'file:///private'})).status, 403);
  assert.equal((await post('action', {op: 'shell', command: 'echo unsafe'})).status, 400);
  assert.equal((await post('action', {op: 'call', tool: 'weather', arguments: []})).status, 400);
  assert.equal(calls.length, before);
});
test('MCP connection rejects unsafe URLs, self connections, query tokens and cross-site requests', async (t) => {
  const {url, post, calls} = await setup(t);
  for (const target of [
    'http://remote.invalid/mcp',
    'file:///tmp/server',
    'https://' + ['user', 'password'].join(':') + '@mcp.invalid/mcp',
    'https://mcp.invalid/mcp?token=private',
    url + '/mcp',
  ])
    assert.equal((await post('connection', {url: target})).status, 400);
  const blocked = await fetch(url + '/mcp/connection', {
    method: 'POST',
    headers: {origin: 'https://outside.invalid', 'content-type': 'application/json'},
    body: JSON.stringify({url: 'https://mcp.invalid/mcp'}),
  });
  assert.equal(blocked.status, 403);
  assert.equal(calls.length, 0);
});
test('MCP POST SSE results are supported without an unsolicited background connection', async (t) => {
  const {post, connect, calls} = await setup(t, {
    respond: (body, _options, reply) =>
      body.method === 'tools/call'
        ? new Response(
            'event: message\ndata: ' +
              JSON.stringify({
                jsonrpc: '2.0',
                id: body.id,
                result: {content: [{type: 'text', text: 'SSE result'}]},
              }) +
              '\n\n',
            {headers: {'content-type': 'text/event-stream'}},
          )
        : undefined,
  });
  await connect();
  const result = await (
    await post('action', {op: 'call', tool: 'weather', arguments: {city: 'Oslo'}})
  ).json();
  assert.match(result.text, /SSE result/);
  assert(calls.every((call) => !!call.body.method));
});
test('MCP failures and oversized responses never return raw diagnostics or credentials', async (t) => {
  let large = false;
  const {post, connect} = await setup(t, {
    respond: (body, _options, reply) => {
      if (body.method !== 'tools/call') return;
      return large
        ? new Response('x'.repeat(2 * 1024 * 1024 + 1), {
            headers: {'content-type': 'application/json'},
          })
        : reply({isError: true, content: [{type: 'text', text: 'Private diagnostic ' + secret}]});
    },
  });
  await connect();
  const failed = await post('action', {op: 'call', tool: 'weather', arguments: {city: 'Oslo'}});
  assert.equal(failed.status, 502);
  assert.equal((await failed.text()).includes(secret), false);
  large = true;
  const oversized = await post('action', {op: 'call', tool: 'weather', arguments: {city: 'Oslo'}});
  assert.equal(oversized.status, 502);
  assert.equal((await oversized.text()).includes(secret), false);
});
test('disconnect aborts an active MCP request and cannot resurrect its connection', async (t) => {
  let started, aborted;
  const ready = new Promise((resolve) => (started = resolve)),
    cancelled = new Promise((resolve) => (aborted = resolve));
  const {post, connect, url} = await setup(t, {
    respond: async (body, {signal}) => {
      if (body.method !== 'tools/call') return;
      started();
      await new Promise((_, reject) =>
        signal.addEventListener(
          'abort',
          () => {
            aborted();
            reject(signal.reason);
          },
          {once: true},
        ),
      );
    },
  });
  await connect();
  const pending = post('action', {op: 'call', tool: 'weather', arguments: {city: 'Oslo'}});
  await ready;
  assert.equal((await post('action', {op: 'list'})).status, 429);
  await post('connection', {kind: 'disconnect'});
  await cancelled;
  assert.equal((await pending).status, 502);
  assert.equal((await (await fetch(url + '/mcp')).json()).connected, false);
});
test('cancelling the browser request aborts upstream MCP work', async (t) => {
  let started, aborted;
  const ready = new Promise((resolve) => (started = resolve)),
    cancelled = new Promise((resolve) => (aborted = resolve));
  const {post, connect} = await setup(t, {
    respond: async (body, {signal}) => {
      if (body.method !== 'tools/call') return;
      started();
      await new Promise((_, reject) =>
        signal.addEventListener(
          'abort',
          () => {
            aborted();
            reject(signal.reason);
          },
          {once: true},
        ),
      );
    },
  });
  await connect();
  const controller = new AbortController();
  const pending = post(
    'action',
    {op: 'call', tool: 'weather', arguments: {city: 'Oslo'}},
    {signal: controller.signal},
  );
  await ready;
  controller.abort();
  await assert.rejects(pending, {name: 'AbortError'});
  await cancelled;
});
test('concurrent connection changes retain only the newest MCP connection', async () => {
  const gateway = createMcpGateway({fetcher: mockMcp()});
  try {
    const results = await Promise.allSettled([
      gateway.connect({url: 'https://old.invalid/mcp', name: 'Old'}),
      gateway.connect({url: 'https://new.invalid/mcp', name: 'New'}),
    ]);
    assert.equal(results[0].status, 'rejected');
    assert.equal(results[1].status, 'fulfilled');
    assert.equal(gateway.status().name, 'New');
  } finally {
    await gateway.disconnect();
  }
});

test('echoed bearer tokens are redacted before JSON escaping', async () => {
  const token = ['mcp', '"', '\\', 'fixture'].join('-');
  const gateway = createMcpGateway({fetcher: mockMcp({token})});
  try {
    const status = await gateway.connect({url: 'https://mcp.invalid/mcp', token});
    const result = await gateway.execute({op: 'call', tool: 'weather', arguments: {city: 'Oslo'}});
    assert.equal(JSON.stringify(status).includes(JSON.stringify(token).slice(1, -1)), false);
    assert.equal(result.text.includes(JSON.stringify(token).slice(1, -1)), false);
    assert.match(result.text, /redacted/);
  } finally {
    await gateway.disconnect();
  }
});

test('MCP requests time out, large text is marked truncated, and binary-only resources are unavailable', async (t) => {
  let mode = 'text';
  const {post, connect} = await setup(t, {
    mcpOptions: {timeoutMs: 500},
    respond: async (body, {signal}, reply) => {
      if (body.method === 'resources/read')
        return reply({contents: [{uri: body.params.uri, mimeType: 'image/png', blob: 'AA=='}]});
      if (body.method !== 'tools/call') return;
      if (mode === 'text') return reply({content: [{type: 'text', text: 'Data '.repeat(2000)}]});
      await new Promise((_, reject) =>
        signal.addEventListener('abort', () => reject(signal.reason), {once: true}),
      );
    },
  });
  await connect();
  const answer = await (
    await post('action', {op: 'call', tool: 'weather', arguments: {city: 'Oslo'}})
  ).json();
  assert.equal(answer.text.length, 8000);
  assert.equal(answer.truncated, true);
  assert.equal((await post('action', {op: 'read', uri: 'fixture://weather'})).status, 502);
  mode = 'timeout';
  assert.equal(
    (await post('action', {op: 'call', tool: 'weather', arguments: {city: 'Oslo'}})).status,
    504,
  );
});

test('MCP pagination is bounded and failed discovery leaves no active connection', async (t) => {
  let page = 0;
  const {url, connect, calls} = await setup(t, {
    respond: (body, _options, reply) =>
      body.method === 'resources/list'
        ? reply({resources: [], nextCursor: 'more-' + ++page})
        : undefined,
  });
  assert.equal((await connect()).status, 502);
  assert(calls.filter((call) => call.body.method === 'resources/list').length <= 3);
  assert.equal((await (await fetch(url + '/mcp')).json()).connected, false);
});

test('MCP request JSON and body bounds fail before contacting a server', async (t) => {
  const {url, post, calls} = await setup(t);
  const malformed = await fetch(url + '/mcp/connection', {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: '{',
  });
  assert.equal(malformed.status, 400);
  assert.equal(
    (await post('connection', {url: 'https://mcp.invalid/mcp', padding: 'x'.repeat(33000)})).status,
    413,
  );
  assert.equal(calls.length, 0);
});
