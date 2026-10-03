import { validateEntry, entryKey } from './entries.js';
let database;
let fileHandle;
let initialized;
let writeQueue = Promise.resolve();
export function fileStorageSupported() { return typeof window.showSaveFilePicker === 'function' && typeof window.showOpenFilePicker === 'function'; }
export function openDatabase() {
  if (database) return database;
  database = new Promise((resolve, reject) => {
    const request = indexedDB.open('french-shell', 2);
    let finished = false;
    const timer = setTimeout(() => fail('本地存储打开超时。请关闭旧标签后重试。'), 5000);
    function fail(message) { if (!finished) { finished = true; clearTimeout(timer); reject(new Error(message)); } }
    request.onblocked = () => fail('旧标签正在占用词库。请关闭旧标签后重试，不需要清除数据。');
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('words')) db.createObjectStore('words', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('preferences')) db.createObjectStore('preferences');
    };
    request.onsuccess = () => {
      if (finished) { request.result.close(); return; }
      finished = true; clearTimeout(timer);
      request.result.onversionchange = () => { request.result.close(); database = undefined; initialized = undefined; };
      resolve(request.result);
    };
    request.onerror = () => fail('无法打开本地存储，请检查浏览器权限。');
  }).catch(error => { database = undefined; throw error; });
  return database;
}
async function transact(mode, operation, name = 'words') {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(name, mode);
    const timer = setTimeout(() => transaction.abort(), 5000);
    const request = operation(transaction.objectStore(name));
    transaction.oncomplete = () => { clearTimeout(timer); resolve(request.result); };
    transaction.onerror = transaction.onabort = () => { clearTimeout(timer); reject(new Error('本地存储操作未完成，请重试。')); };
  });
}
async function initialize() {
  initialized ||= transact('readonly', store => store.get('fileHandle'), 'preferences').then(handle => { fileHandle = handle; }).catch(error => { initialized = undefined; throw error; });
  await initialized;
}
export function parseBackup(text) {
  if (text.length > 5_000_000) throw new Error('词库文件过大（上限 5 MB）。');
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('文件不是有效 JSON 词库。'); }
  if (data?.schemaVersion !== 1 || !Array.isArray(data.words) || data.words.length > 10000) throw new Error('词库版本或内容不受支持。');
  return data.words.map(word => {
    validateEntry(word?.entry);
    if (typeof word.unknown !== 'boolean' || typeof word.favorite !== 'boolean') throw new Error('词库状态字段无效。');
    const { diagnostics, ...entry } = word.entry;
    return { id: entryKey(entry), entry, unknown: word.unknown, favorite: word.favorite, createdAt: Number.isFinite(word.createdAt) ? word.createdAt : Date.now(), updatedAt: Number.isFinite(word.updatedAt) ? word.updatedAt : Date.now() };
  });
}
function serialize(words) { return JSON.stringify({ schemaVersion: 1, words }, null, 2); }
async function readFileWords() {
  if (await fileHandle.queryPermission({ mode: 'readwrite' }) !== 'granted') throw new Error('数据文件需要重新授权。请在设置中点击“重新连接文件”。');
  const file = await fileHandle.getFile();
  if (file.size > 5_000_000) throw new Error('词库文件过大（上限 5 MB）。');
  return parseBackup(await file.text());
}
async function writeFileWords(words) {
  const stream = await fileHandle.createWritable();
  try { await stream.write(serialize(words)); await stream.close(); }
  catch (error) { await stream.abort().catch(() => {}); throw error; }
}
export async function allWords() { await initialize(); return fileHandle ? readFileWords() : transact('readonly', store => store.getAll()); }
function queue(operation) { const result = writeQueue.then(operation); writeQueue = result.catch(() => {}); return result; }
export async function saveWord(word) {
  await initialize();
  if (!fileHandle) return transact('readwrite', store => store.put(word));
  return queue(async () => { const words = await readFileWords(); const index = words.findIndex(x => x.id === word.id); if (index === -1) words.push(word); else words[index] = word; await writeFileWords(words); });
}
export async function removeWord(id) {
  await initialize();
  if (!fileHandle) return transact('readwrite', store => store.delete(id));
  return queue(async () => { await writeFileWords((await readFileWords()).filter(x => x.id !== id)); });
}
export async function storageInfo() { await initialize(); return { mode: fileHandle ? 'file' : 'browser', name: fileHandle?.name || '浏览器本地词库（IndexedDB）' }; }
const pickerOptions = { types: [{ description: 'French Shell 词库', accept: { 'application/json': ['.json'] } }] };
export async function chooseDataFile(create = false) {
  if (!fileStorageSupported()) throw new Error('当前浏览器不支持直接连接文件。可使用 JSON 导入/导出，或换支持文件选择的桌面浏览器。');
  const handle = create ? await window.showSaveFilePicker({ ...pickerOptions, suggestedName: 'french-shell-words.json' }) : (await window.showOpenFilePicker({ ...pickerOptions, multiple: false }))[0];
  const file = await handle.getFile();
  if (create && file.size) throw new Error('文件已有内容，请使用“打开已有词库”，或选择新文件名。');
  if (await handle.requestPermission({ mode: 'readwrite' }) !== 'granted') throw new Error('未获得数据文件的读写权限。');
  if (create) {
    const words = await allWords(); const writable = await handle.createWritable();
    try { await writable.write(serialize(words)); await writable.close(); } catch (error) { await writable.abort().catch(() => {}); throw error; }
  } else {
    if (file.size > 5_000_000) throw new Error('词库文件过大（上限 5 MB）。');
    parseBackup(await file.text());
  }
  await writeQueue;
  await transact('readwrite', store => store.put(handle, 'fileHandle'), 'preferences'); fileHandle = handle;
}
export async function reconnectDataFile() {
  await initialize();
  if (!fileHandle) throw new Error('尚未连接数据文件。');
  if (await fileHandle.requestPermission({ mode: 'readwrite' }) !== 'granted') throw new Error('未获得文件权限。');
}
export async function useBrowserStorage() {
  await writeQueue;
  await transact('readwrite', store => store.delete('fileHandle'), 'preferences'); fileHandle = undefined;
}
export async function importWords(text) {
  const imported = parseBackup(text); await initialize();
  const merge = existing => {
    const map = new Map(existing.map(word => [word.id, word]));
    for (const word of imported) if (!map.has(word.id) || map.get(word.id).updatedAt < word.updatedAt) map.set(word.id, word);
    return [...map.values()];
  };
  if (fileHandle) await queue(async () => writeFileWords(merge(await readFileWords())));
  else {
    const merged = merge(await allWords()); const db = await openDatabase();
    await new Promise((resolve, reject) => { const tx = db.transaction('words', 'readwrite'); for (const word of merged) tx.objectStore('words').put(word); tx.oncomplete = resolve; tx.onabort = tx.onerror = () => reject(new Error('词库导入失败，数据未写入。')); });
  }
  return imported.length;
}
export function closeStorage() { if (database) database.then(db => db.close()).catch(() => {}); database = undefined; initialized = undefined; }
