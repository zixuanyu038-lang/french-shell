import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createCredentialStore } from '../credentials.mjs';
import { createAppServer } from '../server.mjs';
import { fixtures } from '../src/entries.js';

const config = { provider: 'deepseek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash' };
const key = 'test-only-secret';
async function setup(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'french-shell-credentials-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'credentials.json');
  return { file, store: createCredentialStore(file) };
}
test('credentials persist, status hides keys, binding prevents reuse, deletion removes file', async t => {
  const { file, store } = await setup(t);
  await store.save('lookup', config, key);
  assert.ok((await readFile(file, 'utf8')).includes(key));
  const restarted = createCredentialStore(file);
  assert.equal((await restarted.status()).lookup.configured, true);
  assert.ok(!JSON.stringify(await restarted.status()).includes(key));
  assert.equal((await restarted.resolve('lookup', { ...config, baseUrl: config.baseUrl + '/' })).apiKey, key);
  await assert.rejects(restarted.resolve('lookup', { ...config, baseUrl: 'https://other.example' }), /重新填写/);
  await assert.rejects(restarted.resolve('lookup', { ...config, provider: 'compatible' }), /重新填写/);
  assert.throws(() => store.save('lookup', { ...config, baseUrl: 'http://example.com' }, key), /HTTPS/);
  assert.throws(() => store.save('lookup', config, 'bad\nkey'), /有效密钥/);
  await restarted.remove('lookup');
  assert.equal((await restarted.status()).lookup.configured, false);
  await assert.rejects(readFile(file), { code: 'ENOENT' });
});
test('credential routes require same origin, stored lookup works without sending secret to page', async t => {
  const { store } = await setup(t); let calls = 0;
  const server = createAppServer({ credentialStore: store, fetchImpl: async (_, options) => {
    calls++; assert.equal(options.headers.Authorization, `Bearer ${key}`);
    return Response.json({ choices: [{ message: { content: JSON.stringify({ schemaVersion: 2, query: 'maison', status: 'exact', notice: null, entries: [fixtures[1]] }) } }] });
  } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (endpoint, body, origin = base) => fetch(base + endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body) });
  assert.equal((await request('/api/credentials', { action: 'status' }, '')).status, 403);
  assert.equal((await request('/api/credentials', { action: 'save', kind: 'lookup', config, apiKey: key }, 'https://evil.example')).status, 403);
  const saved = await request('/api/credentials', { action: 'save', kind: 'lookup', config, apiKey: key });
  assert.equal(saved.status, 200); assert.ok(!(await saved.text()).includes(key));
  assert.equal((await request('/api/lookup', { query: 'maison', config })).status, 200);
  assert.equal((await request('/api/lookup', { query: 'maison', config: { ...config, baseUrl: 'https://evil.example' } })).status, 400);
  assert.equal(calls, 1);
  assert.equal((await fetch(base + '/credentials.json')).status, 404);
  assert.equal((await request('/api/credentials', { action: 'delete', kind: 'lookup' })).status, 200);
  assert.equal((await request('/api/lookup', { query: 'maison', config })).status, 400);
});
test('speech credentials are independent and temporary keys never replace saved keys', async t => {
  const { store } = await setup(t);
  const speech = { endpoint: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation', model: 'qwen3-tts-flash' };
  await Promise.all([store.save('lookup', config, key), store.save('speech', speech, 'speech-test-key')]);
  assert.equal((await store.resolve('speech', speech)).apiKey, 'speech-test-key');
  assert.equal((await store.resolve('lookup', { ...config, apiKey: 'temporary-key' })).apiKey, 'temporary-key');
  assert.equal((await store.resolve('lookup', config)).apiKey, key);
  await assert.rejects(store.resolve('speech', { ...speech, endpoint: 'https://other.example/tts' }), /重新填写/);
  await store.remove('lookup');
  assert.equal((await store.status()).speech.configured, true);
  assert.equal((await store.resolve('speech', { ...speech, model: 'another-model' })).apiKey, 'speech-test-key');
});
