import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSettings, saveSettings, lookupDefaults, speechDefaults } from '../src/settings.js';
import { parseBackup, openDatabase, closeStorage, chooseDataFile, useBrowserStorage, allWords, saveWord, importWords, storageInfo } from '../src/storage.js';
import { waitBounded } from '../src/lifecycle.js';
import { fixtures } from '../src/entries.js';

test('settings survive reload without persisting keys or arbitrary fields', () => {
  const map = new Map(); const storage = { getItem: key => map.get(key), setItem: (key, value) => map.set(key, value) };
  saveSettings(storage, 'lookup', { ...lookupDefaults, mode: 'live', model: 'custom-model', apiKey: 'secret-test' }, lookupDefaults);
  assert.ok(!map.get('lookup').includes('secret-test'));
  assert.equal(loadSettings(storage, 'lookup', lookupDefaults).mode, 'live');
  assert.equal(loadSettings(storage, 'lookup', lookupDefaults).model, 'custom-model');
  assert.equal(loadSettings(undefined, 'speech', speechDefaults).enabled, false);
  storage.setItem('lookup', '{broken'); assert.deepEqual(loadSettings(storage, 'lookup', lookupDefaults), lookupDefaults);
});
test('backups validate all entries before import and normalize deduplication keys', () => {
  const backup = JSON.stringify({ schemaVersion: 1, words: [{ id: 'untrusted-key', entry: { ...fixtures[1], diagnostics: { totalMs: 50 } }, unknown: true, favorite: false, createdAt: 1, updatedAt: 2 }] });
  const [word] = parseBackup(backup);
  assert.equal(word.id, 'maison:noun'); assert.equal(word.entry.diagnostics, undefined);
  assert.throws(() => parseBackup('{'), /JSON/);
  assert.throws(() => parseBackup(JSON.stringify({ schemaVersion: 1, words: [{ entry: fixtures[1], unknown: 'true', favorite: false }] })), /状态/);
});
test('blocked database fails visibly and can retry instead of staying pending', async t => {
  const previous = globalThis.indexedDB; t.after(() => { globalThis.indexedDB = previous; closeStorage(); });
  let request;
  globalThis.indexedDB = { open() { request = {}; return request; } };
  const first = openDatabase(); request.onblocked(); await assert.rejects(first, /旧标签/);
  const retry = openDatabase(); request.onerror(); await assert.rejects(retry, /无法打开/);
});
test('audio startup timeout and cancellation settle even when device never resumes', async () => {
  await assert.rejects(waitBounded(new Promise(() => {}), undefined, 10, 'audio timeout'), /audio timeout/);
  const controller = new AbortController(); const pending = waitBounded(new Promise(() => {}), controller.signal, 1000, 'timeout');
  controller.abort(); await assert.rejects(pending, { name: 'AbortError' });
});
test('file storage copies words, persists edits, restores selection and keeps browser data', async t => {
  const oldIDB = globalThis.indexedDB; const oldWindow = globalThis.window;
  t.after(() => { closeStorage(); globalThis.indexedDB = oldIDB; globalThis.window = oldWindow; });
  closeStorage();
  const stores = { words: new Map(), preferences: new Map() };
  const db = {
    close() {},
    transaction(name) {
      const tx = { objectStore() {
        const run = operation => { const request = { result: operation() }; setImmediate(() => tx.oncomplete?.()); return request; };
        return {
          get: key => run(() => stores[name].get(key)),
          put: (value, key) => run(() => { stores[name].set(key ?? value.id, value); return key ?? value.id; }),
          delete: key => run(() => stores[name].delete(key)),
          getAll: () => run(() => [...stores[name].values()])
        };
      }, abort() { tx.onabort?.(); } };
      return tx;
    }
  };
  globalThis.indexedDB = { open() { const request = { result: db }; setImmediate(() => request.onsuccess()); return request; } };
  let content = ''; let granted = true;
  const handle = {
    name: 'chosen-words.json', queryPermission: async () => granted ? 'granted' : 'prompt', requestPermission: async () => 'granted',
    getFile: async () => ({ size: content.length, text: async () => content }),
    createWritable: async () => ({ write: async value => { content = value; }, close: async () => {}, abort: async () => {} })
  };
  globalThis.window = { showSaveFilePicker: async () => handle, showOpenFilePicker: async () => [handle] };
  const word = { id: 'maison:noun', entry: fixtures[1], unknown: true, favorite: false, createdAt: 1, updatedAt: 2 };
  await saveWord(word);
  await chooseDataFile(true);
  assert.equal((await storageInfo()).mode, 'file');
  assert.equal(parseBackup(content).length, 1);
  await saveWord({ ...word, favorite: true, updatedAt: 3 });
  assert.equal(parseBackup(content)[0].favorite, true);
  closeStorage();
  assert.equal((await storageInfo()).name, handle.name);
  granted = false; await assert.rejects(allWords(), /重新授权/); granted = true;
  await assert.rejects(chooseDataFile(true), /已有内容/);
  await useBrowserStorage();
  assert.equal((await allWords())[0].favorite, false);
  await importWords(content);
  assert.equal((await allWords())[0].favorite, true);
});
