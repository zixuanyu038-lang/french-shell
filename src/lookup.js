import { normalizeEntry, lookupDemo } from './entries.js';

const statuses = ['exact', 'corrected', 'ambiguous', 'not_found'];
const compareQuery = value => value.trim().normalize('NFC').toLocaleLowerCase('fr');
function assertQuery(query) {
  if (typeof query !== 'string' || !query.trim() || query.length > 200) throw new Error('查询文本必须为 1–200 个字符。');
}

// Validate without modifying trusted server metadata; callers may keep the value.
export function validateLookupResult(value, originalQuery = value?.query) {
  assertQuery(originalQuery);
  if (!value || value.schemaVersion !== 2 || !statuses.includes(value.status)) throw new Error('查词结果版本或状态不符合约定。');
  assertQuery(value.query);
  if (value.query !== originalQuery.trim()) throw new Error('查词结果与当前查询不匹配。');
  if (value.notice !== null && (typeof value.notice !== 'string' || !value.notice.trim() || value.notice.length > 400)) throw new Error('查词提示长度或内容错误。');
  if (!Array.isArray(value.entries) || value.entries.length > 3) throw new Error('词条候选数量不符合约定。');
  const count = value.entries.length;
  if ((value.status === 'exact' && count < 1) || (value.status === 'corrected' && count !== 1) || (value.status === 'ambiguous' && count < 2) || (value.status === 'not_found' && count !== 0)) throw new Error('查词状态与候选数量不一致。');
  if (value.status !== 'exact' && (value.notice === null || !value.notice.trim())) throw new Error('纠正、歧义或未识别结果必须有提示。');
  const input = compareQuery(originalQuery);
  const candidates = new Set();
  for (const entry of value.entries) {
    normalizeEntry(entry);
    const recognized = compareQuery(entry.query);
    if (value.status === 'exact' && recognized !== input) throw new Error('完全匹配的词条不能改变输入拼写。');
    if (value.status === 'corrected' && recognized === input) throw new Error('纠正结果必须提供不同于原输入的正确形式。');
    if (value.status === 'ambiguous' && recognized === input) throw new Error('合法匹配不能标为拼写歧义；同形多词性应使用 exact。');
    const key = `${recognized}\u0000${entry.partOfSpeech}`;
    if (candidates.has(key)) throw new Error('候选词条重复。');
    candidates.add(key);
  }
  return value;
}

// Model-generated envelope.query/source/diagnostics and extra entry fields are
// never trusted. Request ownership and attribution are added by our server.
export function normalizeLookupResult(raw, originalQuery) {
  assertQuery(originalQuery);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('查词响应不是 JSON 对象。');
  if (!Array.isArray(raw.entries) || raw.entries.length > 3) throw new Error('查词响应的候选词条数量不符合约定。');
  const result = {
    schemaVersion: raw.schemaVersion,
    query: originalQuery.trim(), status: raw.status,
    notice: typeof raw.notice === 'string' ? raw.notice.trim().normalize('NFC') : raw.notice,
    entries: raw.entries.map(normalizeEntry)
  };
  return validateLookupResult(result, originalQuery);
}

export async function lookupDemoResult(query) {
  assertQuery(query);
  const input = compareQuery(query);
  const corrections = { bonjure: 'bonjour', maizon: 'maison', mangais: 'mangeais' };
  let status = 'exact', notice = null, entries;
  if (input === 'sall') {
    status = 'ambiguous';
    notice = '“sall” 的拼写不明确，你可能想查 sale（脏的）或 salle（房间）。选一个看看。';
    entries = await Promise.all(['sale', 'salle'].map(lookupDemo));
  } else if (Object.hasOwn(corrections, input)) {
    status = 'corrected';
    notice = `演示纠正：你可能想查“${corrections[input]}”。`;
    entries = [await lookupDemo(corrections[input])];
  } else {
    try { entries = [await lookupDemo(query)]; }
    catch {
      status = 'not_found'; entries = [];
      notice = '演示模式是固定样例，只支持 manger / mangeais、maison、heureux / heureuse、bonjour、sale、salle，以及 bonjure、maizon、mangais、sall 这几种错拼。接上 API 后才可查任意词。';
    }
  }
  const source = { kind: 'demo' };
  const result = normalizeLookupResult({ schemaVersion: 2, status, notice, entries }, query);
  return { ...result, source, entries: result.entries.map(entry => ({ ...entry, source })) };
}
