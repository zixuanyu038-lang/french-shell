// All providers must produce this common entry contract. Unknown fields use null.
export const fixtures = [
  {
    schemaVersion: 1, query: 'mangeais', lemma: 'manger', ipa: '/mɑ̃.ʒe/',
    queryIpa: '/mɑ̃.ʒɛ/', partOfSpeech: 'verb', definitions: ['吃；进食'],
    inputAnalysis: 'manger 的直陈式未完成过去时，第一或第二人称单数（je / tu）。',
    grammar: { group: '第一组', auxiliary: 'avoir', transitivity: '可作及物或不及物动词' },
    forms: [{ label: '过去分词', text: 'mangé' }, { label: '现在分词', text: 'mangeant' }],
    conjugations: [{ mood: '直陈式', tense: '现在时', rows: [['je', 'mange'], ['tu', 'manges'], ['il / elle / on', 'mange'], ['nous', 'mangeons'], ['vous', 'mangez'], ['ils / elles', 'mangent']] }],
    examples: [{ fr: 'Je mange du pain.', zh: '我吃面包。' }],
    note: 'nous mangeons 保留 e，使 g 仍发 /ʒ/ 音。'
  },
  {
    schemaVersion: 1, query: 'maison', lemma: 'maison', ipa: '/mɛ.zɔ̃/', queryIpa: '/mɛ.zɔ̃/',
    partOfSpeech: 'noun', definitions: ['房子；住宅；家'], inputAnalysis: '阴性名词的单数形式。',
    grammar: { gender: '阴性', article: 'une / la' }, forms: [{ label: '单数', text: 'une maison' }, { label: '复数', text: 'des maisons' }],
    conjugations: [], examples: [{ fr: 'Elle habite dans une petite maison.', zh: '她住在一所小房子里。' }], note: '建议连同冠词一起记：une maison。'
  },
  {
    schemaVersion: 1, query: 'heureuse', lemma: 'heureux', ipa: '/ø.ʁø/', queryIpa: '/ø.ʁøz/',
    partOfSpeech: 'adjective', definitions: ['幸福的；高兴的'], inputAnalysis: 'heureux 的阴性单数形式。',
    grammar: { agreement: '与所修饰的名词或主语保持性、数一致' },
    forms: [{ label: '阳性单数', text: 'heureux' }, { label: '阴性单数', text: 'heureuse' }, { label: '阳性复数', text: 'heureux' }, { label: '阴性复数', text: 'heureuses' }],
    conjugations: [], examples: [{ fr: 'Elle est heureuse.', zh: '她很高兴。' }], note: '阴性形式中的 s 发 /z/ 音。'
  },
  // Fixture facts checked against Larousse; examples below are our own simple sentences.
  // https://www.larousse.fr/dictionnaires/college/bonjour/4938
  {
    schemaVersion: 1, query: 'bonjour', lemma: 'bonjour', ipa: '/bɔ̃.ʒuʁ/', queryIpa: '/bɔ̃.ʒuʁ/',
    partOfSpeech: 'noun', definitions: ['你好；早上好（日间见面时的问候）'], inputAnalysis: '日间见面时的问候语，也可作阳性名词。',
    grammar: { gender: '阳性', article: 'un / le', usage: '打招呼时通常不加冠词' },
    forms: [{ label: '名词单数', text: 'un bonjour' }, { label: '名词复数', text: 'des bonjours' }],
    conjugations: [], examples: [{ fr: 'Bonjour, Marie !', zh: '你好，玛丽！' }], note: '直接问候时说 Bonjour !；dire bonjour 意为打招呼。'
  },
  // https://www.larousse.fr/dictionnaires/francais/sale/70649
  // https://www.larousse.fr/dictionnaires/college/salle/35983
  {
    schemaVersion: 1, query: 'sale', lemma: 'sale', ipa: '/sal/', queryIpa: '/sal/',
    partOfSpeech: 'adjective', definitions: ['脏的；不干净的'], inputAnalysis: '形容词的单数形式，阳性和阴性同形。',
    grammar: { agreement: '单数不分阴阳性；复数加 s' },
    forms: [{ label: '阳性单数', text: 'sale' }, { label: '阴性单数', text: 'sale' }, { label: '阳性复数', text: 'sales' }, { label: '阴性复数', text: 'sales' }],
    conjugations: [], examples: [{ fr: 'Cette chemise est sale.', zh: '这件衬衫很脏。' }], note: '与 salle（房间）同音；sale 也可能是 saler 的变位。'
  },
  {
    schemaVersion: 1, query: 'salle', lemma: 'salle', ipa: '/sal/', queryIpa: '/sal/',
    partOfSpeech: 'noun', definitions: ['房间；厅；供特定用途的室'], inputAnalysis: '阴性名词的单数形式。',
    grammar: { gender: '阴性', article: 'une / la' },
    forms: [{ label: '单数', text: 'une salle' }, { label: '复数', text: 'des salles' }],
    conjugations: [], examples: [{ fr: 'La salle est grande.', zh: '这个房间很大。' }], note: 'salle de classe 是教室；与 sale（脏的）同音。'
  }
];
export function validateEntry(entry) {
  if (!entry || entry.schemaVersion !== 1 || typeof entry.query !== 'string' || !entry.query.trim() || typeof entry.lemma !== 'string' || !entry.lemma.trim()) throw new Error('词条缺少查询词或原形。');
  if (!['noun', 'verb', 'adjective', 'adverb', 'preposition', 'conjunction', 'pronoun', 'determiner', 'interjection', 'phrase'].includes(entry.partOfSpeech)) throw new Error('词性不符合约定。');
  for (const key of ['ipa', 'queryIpa', 'inputAnalysis', 'note']) if (entry[key] !== null && typeof entry[key] !== 'string') throw new Error(`词条字段 ${key} 格式错误。`);
  if (!Array.isArray(entry.definitions) || !entry.definitions.length || !entry.definitions.every(x => typeof x === 'string')) throw new Error('释义格式错误。');
  if (!entry.grammar || Array.isArray(entry.grammar) || typeof entry.grammar !== 'object' || !Object.values(entry.grammar).every(x => x === null || typeof x === 'string')) throw new Error('语法信息格式错误。');
  if (!Array.isArray(entry.forms) || !entry.forms.every(x => typeof x.label === 'string' && typeof x.text === 'string')) throw new Error('词形格式错误。');
  if (!Array.isArray(entry.examples) || !entry.examples.every(x => typeof x.fr === 'string' && typeof x.zh === 'string')) throw new Error('例句格式错误。');
  if (!Array.isArray(entry.conjugations) || !entry.conjugations.every(x => typeof x.mood === 'string' && typeof x.tense === 'string' && Array.isArray(x.rows) && x.rows.every(row => Array.isArray(row) && row.length === 2 && row.every(cell => typeof cell === 'string')))) throw new Error('变位格式错误。');
  return entry;
}
export async function lookupDemo(query) {
  const normalized = query.trim().normalize('NFC').toLocaleLowerCase('fr');
  const entry = fixtures.find(x => x.query === normalized || x.lemma === normalized);
  if (!entry) throw new Error('演示模式只支持 manger / mangeais、maison、heureux / heureuse、bonjour、sale、salle。');
  const result = structuredClone(entry);
  result.query = query.trim();
  if (normalized === entry.lemma && normalized !== entry.query) {
    result.queryIpa = entry.ipa;
    result.inputAnalysis = entry.partOfSpeech === 'verb' ? '动词不定式。' : '形容词的阳性单数形式。';
  }
  return validateEntry(result);
}
// New responses use a field whitelist and bounded strings. Legacy saved schema-1
// entries still pass validateEntry unchanged, so old notebooks/backups stay usable.
export function normalizeEntry(raw) {
  validateEntry(raw);
  const text = (value, max, field, optional = false) => {
    if (optional && value === null) return null;
    if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`词条字段 ${field} 长度或内容错误。`);
    return value.trim().normalize('NFC');
  };
  const list = (values, max, field) => {
    if (!Array.isArray(values) || values.length > max) throw new Error(`词条字段 ${field} 数量过多。`);
    return values;
  };
  const grammar = Object.entries(raw.grammar);
  if (grammar.length > 12) throw new Error('语法信息数量过多。');
  return {
    schemaVersion: 1,
    query: text(raw.query, 200, 'query'), lemma: text(raw.lemma, 200, 'lemma'),
    ipa: text(raw.ipa, 200, 'ipa', true), queryIpa: text(raw.queryIpa, 200, 'queryIpa', true),
    partOfSpeech: raw.partOfSpeech,
    definitions: list(raw.definitions, 4, 'definitions').map(value => text(value, 200, 'definitions')),
    inputAnalysis: text(raw.inputAnalysis, 400, 'inputAnalysis', true),
    grammar: Object.fromEntries(grammar.map(([key, value]) => [text(key, 80, 'grammar key'), text(value, 200, 'grammar value', true)])),
    forms: list(raw.forms, 12, 'forms').map(value => ({ label: text(value.label, 80, 'forms label'), text: text(value.text, 200, 'forms text') })),
    conjugations: list(raw.conjugations, 4, 'conjugations').map(value => ({
      mood: text(value.mood, 80, 'mood'), tense: text(value.tense, 80, 'tense'),
      rows: list(value.rows, 8, 'conjugation rows').map(row => row.map(cell => text(cell, 200, 'conjugation cell')))
    })),
    examples: list(raw.examples, 2, 'examples').map(value => ({ fr: text(value.fr, 400, 'example fr'), zh: text(value.zh, 400, 'example zh') })),
    note: text(raw.note, 400, 'note', true)
  };
}
export function entryKey(entry) { return `${entry.lemma.normalize('NFC').toLocaleLowerCase('fr')}:${entry.partOfSpeech}`; }
