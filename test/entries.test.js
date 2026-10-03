import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtures, validateEntry, lookupDemo, entryKey } from '../src/entries.js';
import { createAppServer } from '../server.mjs';

test('all supported word classes satisfy the entry contract', () => {
  for (const entry of fixtures) assert.equal(validateEntry(entry), entry);
});
test('inflected query keeps its own IPA, while infinitive uses lemma IPA', async () => {
  const inflected = await lookupDemo(' MANGEAIS ');
  const infinitive = await lookupDemo('manger');
  assert.notEqual(inflected.queryIpa, inflected.ipa);
  assert.equal(infinitive.queryIpa, infinitive.ipa);
  assert.equal(infinitive.inputAnalysis, '动词不定式。');
  assert.equal(entryKey(inflected), entryKey(infinitive));
});
test('adjective lemma and feminine query are distinguished', async () => {
  const feminine = await lookupDemo('heureuse');
  const masculine = await lookupDemo('heureux');
  assert.notEqual(feminine.queryIpa, masculine.queryIpa);
  assert.equal(masculine.queryIpa, masculine.ipa);
});
test('unsupported queries and invalid provider responses are rejected', async () => {
  await assert.rejects(lookupDemo('zzzzzz'), /演示模式/);
  assert.throws(() => validateEntry({ ...fixtures[0], definitions: '吃' }), /释义/);
  assert.throws(() => validateEntry({ ...fixtures[0], conjugations: [{ mood: '直陈式', tense: '现在时', rows: [['je']] }] }), /变位/);
});
test('local server serves UI assets and blocks source/config exposure', async t => {
  const server = createAppServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const home = await fetch(base);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /D指导法语/);
  assert.equal((await fetch(`${base}/src/app.js`)).status, 200);
  assert.equal((await fetch(`${base}/package.json`)).status, 404);
  assert.equal((await fetch(`${base}/%2e%2e%2findex.html`)).status, 404);
});
