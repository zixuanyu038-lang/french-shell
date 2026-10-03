import test from 'node:test';
import assert from 'node:assert/strict';
import { SpeechPlayer } from '../src/speech.js';

test('player schedules incoming PCM before done, and stop cancels request and audio', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let upstream; let requestSignal;
  globalThis.fetch = async (_, options) => {
    requestSignal = options.signal;
    return new Response(new ReadableStream({ start(controller) { upstream = controller; } }));
  };
  let source;
  const messages = [];
  const player = new SpeechPlayer((text, active) => messages.push({ text, active }));
  player.context = {
    currentTime: 0, destination: {}, resume: async () => {},
    createBuffer: (_, length, rate) => ({ duration: length / rate, copyToChannel() {} }),
    createBufferSource: () => (source = { connect() {}, disconnect() {}, start(time) { this.startTime = time; }, stop() { this.stopped = true; } })
  };
  const playing = player.play('Bonjour', { apiKey: 'fake-key', voice: 'Cherry' });
  // Allow fetch setup, then deliver the first packet without completion.
  await new Promise(resolve => setImmediate(resolve));
  upstream.enqueue(new TextEncoder().encode(JSON.stringify({ type: 'audio', data: 'AAAAAA==', sampleRate: 24000 }) + '\n'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(source.startTime, 0.025);
  assert.ok(messages.some(message => message.active && message.text.includes('首段')));
  player.stop();
  assert.equal(requestSignal.aborted, true); assert.equal(source.stopped, true);
  upstream.close(); await playing;
  assert.equal(player.session, null);
  assert.deepEqual(messages.at(-1), { text: '已停止朗读。', active: false });
});
test('player allows backend-injected saved keys and does not send invented credentials', async t => {
  const originalFetch = globalThis.fetch; t.after(() => { globalThis.fetch = originalFetch; });
  let body;
  globalThis.fetch = async (_, options) => {
    body = JSON.parse(options.body);
    return Response.json({ error: 'test backend rejection' }, { status: 400 });
  };
  const player = new SpeechPlayer(() => {});
  player.context = { resume: async () => {}, currentTime: 0 };
  await player.play('Bonjour', { apiKey: '', voice: 'Cherry' });
  assert.equal(body.config.apiKey, '');
  assert.equal(body.text, 'Bonjour');
  assert.equal(player.session, null);
});
