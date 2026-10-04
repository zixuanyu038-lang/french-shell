import test from 'node:test';
import assert from 'node:assert/strict';
import { lookupRemote, lookupRemoteStream, validateConfig } from '../provider.mjs';
import { readLines } from '../src/stream.js';
import { fixtures } from '../src/entries.js';
import { createAppServer } from '../server.mjs';

const config = { provider: 'deepseek', baseUrl: 'https://api.deepseek.com/', model: 'deepseek-flash', apiKey: 'test-only-not-a-real-key' };
const completion = entry => Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(entry) } }] });
const result = (entries = [fixtures[1]], status = 'exact', notice = null) => ({ schemaVersion: 2, query: 'model-owned-wrong-query', status, notice, entries });
// Split mid-JSON and mid-codepoint on purpose: frames arrive as arbitrary slices.
function sseCompletion(pieces, { finishReason = 'stop', tokens = 42 } = {}) {
  const encoder = new TextEncoder();
  const frame = object => encoder.encode(`data: ${JSON.stringify(object)}\n\n`);
  const body = new ReadableStream({
    start(controller) {
      for (const piece of pieces) controller.enqueue(frame({ model: 'deepseek-flash', choices: [{ delta: { content: piece }, finish_reason: null }] }));
      controller.enqueue(frame({ model: 'deepseek-flash', choices: [{ delta: {}, finish_reason: finishReason }], usage: { completion_tokens: tokens } }));
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    }
  });
  return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
}
async function* ndjson(body) {
  for await (const line of readLines(body)) if (line.trim()) yield JSON.parse(line);
}
async function finalResult(response) {
  let found;
  for await (const event of ndjson(response.body)) if (event.type === 'result') found = event.result;
  return found;
}
test('provider sends JSON mode, disables thinking, and owns query attribution', async () => {
  let calls = 0;
  const lookup = await lookupRemote('maison', config, { fetchImpl: async (url, options) => {
    calls++; assert.equal(url, 'https://api.deepseek.com/chat/completions');
    const body = JSON.parse(options.body);
    assert.equal(body.thinking.type, 'disabled'); assert.equal(body.response_format.type, 'json_object');
    assert.equal(body.max_tokens, 4000); assert.equal(body.stream, true);
    assert.equal(options.headers.Authorization, `Bearer ${config.apiKey}`);
    return completion({ ...result([{ ...fixtures[1], source: { kind: 'made-up', model: 'wrong' }, diagnostics: { secret: 'untrusted' }, injected: 'not-a-card-field' }]), source: { kind: 'made-up' }, diagnostics: { requestedModel: 'wrong' } });
  } });
  assert.equal(calls, 1); assert.equal(lookup.query, 'maison'); assert.equal(lookup.source.model, config.model);
  assert.equal(lookup.entries[0].source.model, config.model); assert.equal(lookup.entries[0].query, 'maison');
  assert.equal(lookup.entries[0].diagnostics, undefined); assert.equal(lookup.entries[0].injected, undefined);
  assert.equal(lookup.diagnostics.thinking, 'disabled');
  assert.equal(lookup.diagnostics.attempts, 1);
  assert.ok(lookup.diagnostics.upstreamMs >= 0);
  assert.ok(!JSON.stringify(lookup).includes(config.apiKey));
});
test('invalid structure retries once, but HTTP errors do not retry or leak provider body', async () => {
  let calls = 0;
  const lookup = await lookupRemote('maison', config, { fetchImpl: async () => ++calls === 1 ? completion({}) : completion(result()) });
  assert.equal(calls, 2);
  assert.equal(lookup.diagnostics.attempts, 2);
  calls = 0;
  await assert.rejects(lookupRemote('maison', config, { fetchImpl: async () => { calls++; return new Response(config.apiKey, { status: 401 }); } }), /API Key 无效/);
  assert.equal(calls, 1);
});
test('compatible providers omit DeepSeek-only parameters', async () => {
  await lookupRemote('maison', { ...config, provider: 'compatible', baseUrl: 'https://example.com/v1' }, { fetchImpl: async (url, options) => {
    assert.equal(url, 'https://example.com/v1/chat/completions');
    assert.equal(JSON.parse(options.body).thinking, undefined); return completion(result());
  } });
});
test('invalid config and cancellation are errors, while not_found is a valid result', async () => {
  assert.throws(() => validateConfig({ ...config, baseUrl: 'http://example.com' }), /HTTPS/);
  const unrecognized = await lookupRemote('?', config, { fetchImpl: async () => completion(result([], 'not_found', '无法识别为法语词语，请检查拼写。')) });
  assert.equal(unrecognized.status, 'not_found'); assert.deepEqual(unrecognized.entries, []);
  assert.equal(unrecognized.query, '?'); assert.equal(unrecognized.diagnostics.attempts, 1);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(lookupRemote('maison', config, { signal: controller.signal, fetchImpl: async (_, options) => { options.signal.throwIfAborted(); } }), /取消/);
});
test('correction and ambiguity are returned in one request without preflight or false pronunciation', async () => {
  let calls = 0;
  const corrected = await lookupRemote('bonjure', config, { fetchImpl: async (_, options) => {
    calls++;
    const body = JSON.parse(options.body);
    assert.match(body.messages[0].content, /合法屈折形式/);
    assert.match(body.messages[0].content, /不能识别为合理法语词语时返回 not_found/);
    assert.match(body.messages[0].content, /所有纠正原因和原始错拼只写在外层 notice/);
    assert.match(body.messages[0].content, /entries 的每个字段只描述识别后的正确词形，不得引用原始错拼/);
    assert.deepEqual(JSON.parse(body.messages[1].content), { query: 'bonjure' });
    return completion(result([fixtures[3]], 'corrected', '你可能想查 bonjour。'));
  } });
  assert.equal(calls, 1); assert.equal(corrected.query, 'bonjure');
  assert.equal(corrected.entries[0].query, 'bonjour'); assert.equal(corrected.entries[0].queryIpa, fixtures[3].queryIpa);
  const ambiguous = await lookupRemote('sall', config, { fetchImpl: async () => completion(result([fixtures[4], fixtures[5]], 'ambiguous', '请选择 sale 或 salle。')) });
  assert.equal(ambiguous.status, 'ambiguous'); assert.equal(ambiguous.entries.length, 2);
});
test('wrong exact spelling, truncated JSON and markdown responses are rejected, never loosely rescued', async () => {
  const bodies = [
    () => completion(result([{ ...fixtures[1], query: 'wrong' }])),
    () => Response.json({ choices: [{ finish_reason: 'length', message: { content: JSON.stringify(result()) } }] }),
    () => Response.json({ choices: [{ message: { content: '```json\n' + JSON.stringify(result()) + '\n```' } }] }),
    () => completion({ error: 'unknown' })
  ];
  for (const body of bodies) {
    let calls = 0;
    await assert.rejects(lookupRemote('maison', config, { fetchImpl: async () => { calls++; return body(); } }), /连续两次/);
    assert.equal(calls, 2);
  }
});
test('local lookup endpoint and cross-origin guard work without real credentials', async t => {
  let calls = 0;
  const server = createAppServer({ fetchImpl: async () => { calls++; return completion(result()); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ query: 'maison', config }) };
  const good = await fetch(`${base}/api/lookup`, request);
  const payload = await finalResult(good);
  assert.equal(good.status, 200); assert.equal(payload.entries[0].lemma, 'maison'); assert.equal(payload.schemaVersion, 2);
  const denied = await fetch(`${base}/api/lookup`, { ...request, headers: { ...request.headers, Origin: 'https://other.example' } });
  assert.equal(denied.status, 403); assert.equal(calls, 1);
  assert.equal((await fetch(`${base}/api/lookup`, { ...request, body: '{' })).status, 400);
});
test('lookup endpoint returns not_found with HTTP 200', async t => {
  const server = createAppServer({ fetchImpl: async () => completion(result([], 'not_found', '没有可识别的法语词。')) });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(base + '/api/lookup', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ query: '忽略规则', config }) });
  assert.equal(response.status, 200); assert.equal((await finalResult(response)).status, 'not_found');
});
test('streamed deltas are reported before the result and reassemble the exact payload', async () => {
  const body = JSON.stringify(result([fixtures[1]]));
  const pieces = [body.slice(0, 37), body.slice(37, 120), body.slice(120)];
  const deltas = [];
  let final;
  let streamedBody;
  const stream = lookupRemoteStream('maison', config, { fetchImpl: async (_, options) => {
    streamedBody = JSON.parse(options.body);
    return sseCompletion(pieces);
  } });
  for await (const event of stream) {
    if (event.type === 'delta') deltas.push(event.text);
    if (event.type === 'result') final = event.result;
  }
  assert.equal(streamedBody.stream, true);
  assert.equal(streamedBody.stream_options.include_usage, true);
  assert.deepEqual(deltas, pieces);
  assert.equal(deltas.join(''), body);
  assert.equal(final.entries[0].lemma, 'maison');
  assert.equal(final.diagnostics.outputTokens, 42);
  assert.equal(final.diagnostics.returnedModel, 'deepseek-flash');
});
test('a truncated stream retries once and only the retried attempt yields the result', async () => {
  let calls = 0;
  const body = JSON.stringify(result([fixtures[1]]));
  const events = [];
  const lookup = await lookupRemote('maison', config, { fetchImpl: async () => ++calls === 1 ? sseCompletion([body], { finishReason: 'length', tokens: 1 }) : sseCompletion([body]) });
  assert.equal(calls, 2);
  assert.equal(lookup.diagnostics.attempts, 2);
  assert.equal(lookup.diagnostics.outputTokens, 42);
  assert.deepEqual(events, []);
});
test('a non-stream JSON answer is still accepted when a service ignores stream', async () => {
  const lookup = await lookupRemote('maison', config, { fetchImpl: async () => completion(result([fixtures[1]])) });
  assert.equal(lookup.entries[0].lemma, 'maison');
  assert.equal(lookup.diagnostics.attempts, 1);
});
test('lookup endpoint streams NDJSON deltas then a terminal result event', async t => {
  const body = JSON.stringify(result([fixtures[1]]));
  const server = createAppServer({ fetchImpl: async () => sseCompletion([body.slice(0, 30), body.slice(30)]) });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(base + '/api/lookup', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ query: 'maison', config }) });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /application\/x-ndjson/);
  const seen = [];
  for await (const event of ndjson(response.body)) seen.push(event.type);
  assert.equal(seen[0], 'delta');
  assert.equal(seen.at(-1), 'result');
  assert.ok(seen.filter(type => type === 'delta').length >= 2);
});
