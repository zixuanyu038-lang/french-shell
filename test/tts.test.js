import test from 'node:test';
import assert from 'node:assert/strict';
import { speechStream } from '../tts.mjs';
import { readLines, readSse, pcm16ToFloat } from '../src/stream.js';
import { createAppServer } from '../server.mjs';
const config = { apiKey: 'fake-tts-key', voice: 'Cherry' };
const audio = { output: { audio: { data: 'AAD/fwCA' } } };
const stop = { output: { finish_reason: 'stop' } };
function streamResponse(events) {
  const bytes = new TextEncoder().encode(events.map(event => `data: ${JSON.stringify(event)}\r\n\r\n`).join(''));
  return new Response(new ReadableStream({ start(controller) {
    for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7)); controller.close();
  } }), { headers: { 'Content-Type': 'text/event-stream' } });
}
test('TTS sends French streaming request and yields audio before completion', async () => {
  const events = [];
  for await (const event of speechStream('Bonjour', config, { fetchImpl: async (url, options) => {
    assert.equal(url, 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation');
    assert.equal(options.headers['X-DashScope-SSE'], 'enable');
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'qwen3-tts-flash'); assert.equal(body.input.language_type, 'French');
    return streamResponse([audio, stop]);
  } })) events.push(event);
  assert.deepEqual(events.map(event => event.type), ['audio', 'done']);
  assert.equal(events[0].sampleRate, 24000);
  assert.ok(!JSON.stringify(events).includes(config.apiKey));
});
test('PCM decoding is little-endian signed 16-bit and rejects partial samples', () => {
  const samples = pcm16ToFloat(Uint8Array.from(Buffer.from(audio.output.audio.data, 'base64')));
  assert.deepEqual(Array.from(samples), [0, 32767 / 32768, -1]);
  assert.throws(() => pcm16ToFloat(new Uint8Array([1])), /不完整/);
});
test('SSE handles fragmented UTF-8, CRLF and multiline data', async () => {
  const bytes = new TextEncoder().encode('data: 法语\r\ndata: test\r\n\r\n');
  const body = new ReadableStream({ start(controller) { for (const byte of bytes) controller.enqueue(new Uint8Array([byte])); controller.close(); } });
  const events = []; for await (const data of readSse(body)) events.push(data);
  assert.deepEqual(events, ['法语\ntest']);
});
test('TTS rejects missing Key, bad PCM, empty or interrupted streams and sanitizes errors', async () => {
  async function collect(text, cfg, fetchImpl) { for await (const _ of speechStream(text, cfg, { fetchImpl })) {} }
  await assert.rejects(collect('Bonjour', {}, () => { throw new Error('must not call'); }), /Key/);
  await assert.rejects(collect('Bonjour', config, async () => streamResponse([stop])), /未返回音频/);
  await assert.rejects(collect('Bonjour', config, async () => streamResponse([audio])), /中断/);
  await assert.rejects(collect('Bonjour', config, async () => streamResponse([{ output: { audio: { data: '!!!!' } } }])), /无效 PCM/);
  await assert.rejects(collect('Bonjour', config, async () => new Response(config.apiKey, { status: 401 })), /Key 无效/);
});
test('speech endpoint streams NDJSON and blocks external origins', async t => {
  const server = createAppServer({ fetchImpl: async () => streamResponse([audio, stop]) });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const options = { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ text: 'Bonjour', config }) };
  const response = await fetch(`${base}/api/speech`, options);
  assert.equal(response.status, 200);
  const events = []; for await (const line of readLines(response.body)) events.push(JSON.parse(line));
  assert.deepEqual(events.map(event => event.type), ['audio', 'done']);
  assert.equal((await fetch(`${base}/api/speech`, { ...options, headers: { ...options.headers, Origin: 'https://example.com' } })).status, 403);
});
test('first audio is available while synthesis is still running', async () => {
  let upstream;
  const response = new Response(new ReadableStream({ start(controller) { upstream = controller; } }), { headers: { 'Content-Type': 'text/event-stream' } });
  const events = speechStream('Bonjour', config, { fetchImpl: async () => response });
  upstream.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(audio)}\n\n`));
  const first = await events.next();
  assert.equal(first.value.type, 'audio');
  upstream.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(stop)}\n\n`));
  upstream.close();
  assert.equal((await events.next()).value.type, 'done');
  assert.equal((await events.next()).done, true);
});
