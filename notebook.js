// Groups are a view of saved records, never a new persisted field or API request.
export const partOfSpeechLabels = Object.freeze({
  noun: '名词',
  verb: '动词',
  adjective: '形容词',
  adverb: '副词',
  pronoun: '代词',
  determiner: '限定词',
  preposition: '介词',
  conjunction: '连词',
  interjection: '感叹词',
  phrase: '短语',
  other: '其他 / 未分类',
});

const normalizeText = value => String(value ?? '').normalize('NFC').toLocaleLowerCase('fr');
const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));
const wordClass = word => Object.hasOwn(partOfSpeechLabels, word.entry.partOfSpeech)
  ? word.entry.partOfSpeech : 'other';
const updatedAt = word => Number.isFinite(word.updatedAt) ? word.updatedAt : 0;

export function notebookView(words, { query = '', partOfSpeech = 'all' } = {}) {
  const search = normalizeText(query).trim();
  const buckets = new Map(Object.keys(partOfSpeechLabels).map(key => [key, []]));
  for (const word of words) {
    const category = wordClass(word);
    if (partOfSpeech !== 'all' && category !== partOfSpeech) continue;
    const text = normalizeText([word.entry.lemma, word.entry.query, ...word.entry.definitions].join(' '));
    if (!text.includes(search)) continue;
    buckets.get(category).push(word);
  }
  const groups = [...buckets].filter(([, records]) => records.length).map(([category, records]) => ({
    partOfSpeech: category,
    label: partOfSpeechLabels[category],
    words: records.sort((a, b) => updatedAt(b) - updatedAt(a)),
  }));
  return {
    groups,
    totalCount: words.length,
    visibleCount: groups.reduce((count, group) => count + group.words.length, 0),
    isFiltered: Boolean(search) || partOfSpeech !== 'all',
  };
}

function savedWordMarkup(word) {
  return `<article class="saved-card"><div><button class="saved-title" data-open="${escape(word.id)}" lang="fr">${escape(word.entry.lemma)}</button> <span class="tag">${escape(partOfSpeechLabels[wordClass(word)])}</span><p>${word.entry.definitions.map(escape).join('；')}</p><small>${word.unknown ? '待学习' : '已熟悉'}${word.favorite ? ' · 已收藏' : ''}</small></div><div><button data-toggle="${escape(word.id)}">${word.unknown ? '标为熟悉' : '标为不会'}</button><button data-delete="${escape(word.id)}">删除</button></div></article>`;
}

export function notebookMarkup(view) {
  if (!view.visibleCount) {
    return `<div class="empty"><span aria-hidden="true">∅</span><p>${view.totalCount ? '没找到符合条件的词。' : '口袋还是空的。'}</p><small>${view.totalCount ? '试试其他词性，或换个原形、查询词、中文释义。' : '查词后点“不会”或“收藏”，D指导就帮你留着。'}</small>${view.totalCount ? '<button data-clear-notebook-filters>清除筛选</button>' : ''}</div>`;
  }
  return view.groups.map(group => `<section class="notebook-group" aria-labelledby="notebook-group-${escape(group.partOfSpeech)}"><header class="notebook-group-heading"><h2 id="notebook-group-${escape(group.partOfSpeech)}">${escape(group.label)}</h2><span>${group.words.length} 个词</span></header>${group.words.map(savedWordMarkup).join('')}</section>`).join('');
}
