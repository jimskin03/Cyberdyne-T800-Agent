import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {apiConfiguration, createApiServer} from '../tools/api-server.mjs';
import {createLlmClient} from '../src/cell/ai/llm-client.js';
import {LlmRequestError, requestErrorMessage} from '../src/cell/ai/request-errors.js';
import {createMind} from '../src/cell/mind.js';

const key = ['private', 'mock', 'credential'].join('-');
const privateText = 'Private prompt and account diagnostic ' + key;
const input = {intercom: true, intercomText: 'Hello?', senses: 'A quiet cell.', journal: []};
const request = {model: 'agent', messages: [{role: 'user', content: privateText}]};

async function adapter(t, fetcher) {
  const server = createApiServer(apiConfiguration({}), {fetcher});
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => {server.close(resolve); server.closeAllConnections();}));
  const url = 'http://127.0.0.1:' + server.address().port;
  const settings = {kind: 'openai-compatible', baseUrl: 'https://openrouter.ai/api/v1/', apiKey: key, textModel: 'openrouter/free'};
  const post = (path, body) => fetch(url + path, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)});
  assert.equal((await post('/connection/models', settings)).status, 200);
  assert.equal((await post('/connection', settings)).status, 200);
  const client = createLlmClient({fetcher: (path, options) => fetch(url + path.replace(/^\/llm/, ''), options)});
  return {post, client};
}

for (const [status, error, code] of [
  [401, {}, 'provider_authentication'],
  [402, {}, 'provider_payment_required'],
  [403, {}, 'provider_permission_denied'],
  [404, {}, 'provider_model_unavailable'],
  [429, {}, 'provider_rate_limited'],
  [429, {code: 'insufficient_quota'}, 'provider_payment_required'],
  [400, {}, 'provider_invalid_request'],
  [400, {code: 'context_length_exceeded'}, 'provider_context_limit'],
  [503, {}, 'provider_unavailable'],
  [504, {}, 'provider_timeout'],
  [200, {code: 429}, 'provider_rate_limited'],
  [200, {code: 404}, 'provider_model_unavailable'],
  [200, {code: 400, metadata: {error_type: 'context_length_exceeded', raw: privateText}}, 'provider_context_limit'],
  [200, {code: 403, metadata: {error_type: 'content_policy_violation'}}, 'provider_content_policy'],
]) {
  test(`model discovery can succeed while chat fails: ${status} ${code}`, async t => {
    let calls = 0;
    const {post, client} = await adapter(t, async endpoint => {
      if (endpoint.endsWith('/models')) return Response.json({data: [{id: 'unit-model'}]});
      calls++;
      return Response.json({error: {...error, message: privateText}}, {status});
    });
    const response = await post('/v1/chat/completions', request);
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), {code, error: requestErrorMessage(code)});
    const mind = createMind({client, setIntervalFn: () => 0, clearIntervalFn() {}});
    t.after(() => mind.destroy());
    await mind.refresh();
    assert.equal(mind.online, true);
    assert.equal(await mind.decide(input), null);
    assert.equal(mind.st.lastError, requestErrorMessage(code));
    assert.equal(mind.st.lastError.includes(key), false);
    assert.equal(mind.st.phase, 'idle');
    assert.equal(mind.st.inflight, null);
    assert.equal(calls, 2, 'one direct probe and one mind request, with no immediate retry');
  });
}

test('embedded choice errors reject partial output and reasoning is never presented as an answer', async t => {
  const responses = [
    {choices: [{message: {content: '{"say":"This action succeeded","actions":[]}'}, finish_reason: 'error', error: {code: 503, message: privateText}}]},
    {choices: [{message: {content: '', reasoning: privateText}, finish_reason: 'length'}]},
    {choices: [{message: {content: null, reasoning: privateText}, finish_reason: 'stop'}]},
    {choices: [{message: {content: null, refusal: privateText}, finish_reason: 'content_filter'}]},
    null,
  ];
  const {post} = await adapter(t, async endpoint => endpoint.endsWith('/models')
    ? Response.json({data: []}) : Response.json(responses.shift()));
  for (const code of ['provider_unavailable', 'provider_output_limit', 'provider_empty_response', 'provider_content_policy', 'provider_invalid_response']) {
    const response = await post('/v1/chat/completions', request);
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), {code, error: requestErrorMessage(code)});
  }
});

test('non-JSON HTTP failures retain their safe status category', async t => {
  const {post} = await adapter(t, async endpoint => endpoint.endsWith('/models')
    ? Response.json({data: []}) : new Response('<html>' + privateText + '</html>', {status: 402}));
  const response = await post('/v1/chat/completions', request);
  assert.deepEqual(await response.json(), {code: 'provider_payment_required', error: requestErrorMessage('provider_payment_required')});
});

test('client rejects unrecognized error codes and ignores raw adapter error text', async () => {
  for (const code of ['unknown', '__proto__', {toString: null}, null]) {
    const client = createLlmClient({fetcher: async () => Response.json({code, error: privateText}, {status: 502})});
    await assert.rejects(client.complete(request), error => {
      assert(error instanceof LlmRequestError);
      assert.equal(error.status, 502);
      assert.equal(error.code, '');
      assert.match(error.message, /HTTP 502/);
      assert.equal(error.message.includes(key), false);
      return true;
    });
  }
  const client = createLlmClient({fetcher: async () => new Response('Not JSON: ' + privateText, {status: 429})});
  await assert.rejects(client.complete(request), /adapter is busy/);
});

test('a successful question after a provider failure clears the error and failure count', async t => {
  let calls = 0;
  const {client} = await adapter(t, async endpoint => {
    if (endpoint.endsWith('/models')) return Response.json({data: []});
    calls++;
    return calls === 1 ? Response.json({error: {code: 429}}, {status: 429}) :
      Response.json({choices: [{message: {content: '{"say":"Hello there.","actions":[]}'}}]});
  });
  const mind = createMind({client, setIntervalFn: () => 0, clearIntervalFn() {}});
  t.after(() => mind.destroy());
  await mind.refresh();
  assert.equal(await mind.decide(input), null);
  assert.equal(mind.st.fails, 1);
  assert.equal((await mind.decide(input)).say, 'Hello there.');
  assert.equal(mind.st.lastError, '');
  assert.equal(mind.st.fails, 0);
  assert.equal(calls, 2);
});

test('repeated provider failures retain the diagnostic while the adapter remains reachable', async t => {
  const {client} = await adapter(t, async endpoint => endpoint.endsWith('/models')
    ? Response.json({data: []}) : Response.json({error: {code: 402}}, {status: 402}));
  const mind = createMind({client, setIntervalFn: () => 0, clearIntervalFn() {}});
  t.after(() => mind.destroy());
  await mind.refresh();
  for (let attempt = 0; attempt < 6; attempt++) assert.equal(await mind.decide(input), null);
  assert.equal(mind.online, true);
  assert.equal(mind.st.fails, 6);
  assert.equal(mind.st.lastError, requestErrorMessage('provider_payment_required'));
});

test('OpenRouter free chat uses its documented low reasoning preference without raising the token budget', async t => {
  let upstream;
  const {client} = await adapter(t, async (endpoint, options) => {
    if (endpoint.endsWith('/models')) return Response.json({data: [{id: 'openrouter/free'}]});
    upstream = {endpoint, body: JSON.parse(options.body)};
    return Response.json({choices: [{message: {content: '{"say":"Hello there.","actions":[]}'}}]});
  });
  const mind = createMind({client, setIntervalFn: () => 0, clearIntervalFn() {}});
  t.after(() => mind.destroy());
  await mind.refresh();
  assert.equal((await mind.decide(input)).say, 'Hello there.');
  assert.equal(upstream.endpoint, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(upstream.body.model, 'openrouter/free');
  assert.deepEqual(upstream.body.reasoning, {effort: 'low'});
  assert.equal(upstream.body.max_tokens, 1500);
  assert.equal(Object.hasOwn(upstream.body, 'effort'), false);
});
