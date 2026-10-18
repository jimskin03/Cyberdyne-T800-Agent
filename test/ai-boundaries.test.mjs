import test from 'node:test';
import assert from 'node:assert/strict';
import {createLlmClient} from '../src/cell/ai/llm-client.js';
import {createConnectionState, applyConnectionHealth} from '../src/cell/ai/connection-state.js';
import {createCreativeGenerator} from '../src/cell/ai/creative.js';

test('llm client preserves the service-neutral local health and completion contracts', async () => {
  const calls = [];
  const client = createLlmClient({
    fetcher: async (url, options = {}) => {
      calls.push({url, options});
      return {ok: true, json: async () => ({url})};
    },
  });

  assert.deepEqual(await client.health({signal: 'health-signal'}), {url: '/llm/health'});
  assert.deepEqual(
    await client.complete({model: 'agent', messages: []}, {signal: 'reply-signal'}),
    {url: '/llm/v1/chat/completions'},
  );
  assert.equal(calls[0].options.cache, 'no-store');
  assert.equal(calls[0].options.signal, 'health-signal');
  assert.equal(calls[1].options.method, 'POST');
  assert.equal(calls[1].options.signal, 'reply-signal');
  assert.deepEqual(JSON.parse(calls[1].options.body), {model: 'agent', messages: []});
});

test('connection state accepts only supported metadata and sanitizes the displayed host', () => {
  const state = createConnectionState(false);
  applyConnectionHealth(state, {
    status: 'ok',
    vision: true,
    agent: {name: '  Test Agent  '},
    auth: {mode: 'oauth', connected: true, loginUrl: '/llm/auth/login'},
    connection: {
      source: 'session',
      kind: 'invite',
      alternative: 'local',
      host: '127.0.0.1',
    },
  });
  assert.equal(state.enabled, false);
  assert.equal(state.online, true);
  assert.equal(state.vision, true);
  assert.equal(state.agentName, 'Test Agent');
  assert.deepEqual(state.auth, {
    mode: 'oauth',
    connected: true,
    loginUrl: '/llm/auth/login',
  });
  assert.equal(state.connection.host, '127.0.0.1');

  applyConnectionHealth(state, {
    status: 'auth_required',
    auth: {mode: 'unknown', connected: false, loginUrl: 'https://example.test/login'},
    connection: {
      source: 'other',
      kind: 'other',
      alternative: 'other',
      host: '<script>alert(1)</script>',
    },
  });
  assert.equal(state.online, false);
  assert.equal(state.authRequired, true);
  assert.deepEqual(state.auth, {mode: 'none', connected: false});
  assert.deepEqual(state.connection, {
    source: 'env',
    kind: 'none',
    alternative: '',
    host: '',
  });
});

test('creative generator routes drawing, code and 3D generation through the creative alias', async () => {
  const bodies = [];
  const replies = [
    {
      choices: [
        {
          message: {
            content: JSON.stringify({
              title: 'Arc',
              strokes: [
                [
                  [0, 0],
                  [10, 10],
                ],
              ],
            }),
          },
        },
      ],
    },
    {
      choices: [
        {
          message: {
            content:
              'TITLE: Clock\nSUMMARY: A tiny clock.\n\`\`\`html\n<!doctype html><html><body><script>document.body.textContent=Date.now()</script></body></html>\n\`\`\`',
          },
        },
      ],
    },
    {
      choices: [
        {
          message: {
            content: JSON.stringify({
              name: 'Stool',
              description: 'A small stool',
              code: 'const g=new THREE.Group(); return g;',
            }),
          },
        },
      ],
    },
  ];
  const generator = createCreativeGenerator({
    client: {
      complete: async (body) => {
        bodies.push(body);
        return replies.shift();
      },
    },
    state: {vision: true},
    now: (() => {
      let value = 0;
      return () => (value += 5);
    })(),
  });

  assert.equal(
    (
      await generator.draw({
        subject: 'arc',
        style: '',
        surface: {name: 'wall', W: 2, H: 2, marks: ''},
        box: [1, 1],
        image: 'data:image/jpeg;base64,x',
      })
    ).title,
    'Arc',
  );
  assert.equal((await generator.code({name: 'Clock', idea: 'show time'})).title, 'Clock');
  assert.equal((await generator.create3D({name: 'Stool', idea: 'seat'})).name, 'Stool');
  assert.deepEqual(
    bodies.map((body) => body.model),
    ['creative', 'creative', 'creative'],
  );
});
