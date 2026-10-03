import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fixtures, entryKey } from '../src/entries.js';
import { parseBackup } from '../src/storage.js';
import { partOfSpeechLabels, notebookView, notebookMarkup } from '../src/notebook.js';

const order = ['noun', 'verb', 'adjective', 'adverb', 'pronoun', 'determiner', 'preposition', 'conjunction', 'interjection', 'phrase', 'other'];
const flatten = view => view.groups.flatMap(group => group.words);
const escapeText = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
function word(entry, updatedAt = 1, extra = {}) {
  const snapshot = structuredClone(entry);
  return { id: entryKey(snapshot), entry: snapshot, unknown: true, favorite: false, createdAt: 1, updatedAt, ...extra };
}
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function sections(markup) {
  return [...markup.matchAll(/<section\b(?=[^>]*\bclass="[^"]*\bnotebook-group\b)[^>]*>[\s\S]*?<\/section>/g)].map(match => match[0]);
}

test('notebook labels cover every supported word class plus a readable unclassified fallback', () => {
  assert.deepEqual(Object.keys(partOfSpeechLabels).sort(), [...order].sort());
  for (const partOfSpeech of order) assert.ok(typeof partOfSpeechLabels[partOfSpeech] === 'string' && partOfSpeechLabels[partOfSpeech].trim());
  assert.equal(partOfSpeechLabels.other, '其他 / 未分类');
});

test('nonempty groups use the fixed word-class order, never input or timestamp order', () => {
  // Synthetic word-class variants exercise the data shape, not French dictionary facts.
  const words = [...order].reverse().map((partOfSpeech, index) => word({ ...fixtures[1], lemma: 'fixture-' + partOfSpeech, query: 'fixture-' + partOfSpeech, partOfSpeech }, index + 1));
  const view = notebookView(words);
  assert.deepEqual(view.groups.map(group => group.partOfSpeech), order);
  assert.deepEqual(view.groups.map(group => group.label), order.map(partOfSpeech => partOfSpeechLabels[partOfSpeech]));
  assert.equal(view.totalCount, words.length);
  assert.equal(view.visibleCount, words.length);
  assert.equal(view.isFiltered, false);
  assert.equal(flatten(view).length, words.length);
});

test('each group sorts by updatedAt descending without sorting or editing frozen inputs', () => {
  const words = [word(fixtures[1], 2), word(fixtures[0], 50), word(fixtures[5], 8), word(fixtures[3], 4), word(fixtures[2], 5)];
  const before = structuredClone(words);
  const options = { query: '', partOfSpeech: 'all' };
  freeze(words); freeze(options);
  const view = notebookView(words, options);
  assert.deepEqual(view.groups.map(group => group.partOfSpeech), ['noun', 'verb', 'adjective']);
  assert.deepEqual(view.groups[0].words.map(saved => saved.entry.lemma), ['salle', 'bonjour', 'maison']);
  assert.deepEqual(view.groups[0].words.map(saved => saved.updatedAt), [8, 4, 2]);
  assert.deepEqual(words, before);
  assert.deepEqual(options, { query: '', partOfSpeech: 'all' });
  freeze(view);
  assert.doesNotThrow(() => notebookMarkup(view));
  assert.deepEqual(words, before);
});

test('unsupported, missing and prototype-like word-class values fall into other without losing words', () => {
  const unsupported = ['future-class', undefined, null, '', 'NOUN', 'constructor', '__proto__'];
  const words = unsupported.map((partOfSpeech, index) => word({ ...fixtures[1], partOfSpeech }, index + 1, { id: 'unclassified-' + index }));
  const view = notebookView(words);
  assert.deepEqual(view.groups.map(group => group.partOfSpeech), ['other']);
  assert.equal(view.groups[0].label, partOfSpeechLabels.other);
  assert.equal(view.visibleCount, unsupported.length);
  assert.deepEqual(view.groups[0].words.map(saved => saved.id), [...words].reverse().map(saved => saved.id));
  assert.equal(notebookView(words, { partOfSpeech: 'other' }).visibleCount, unsupported.length);
  assert.equal(notebookView(words, { partOfSpeech: 'noun' }).visibleCount, 0);
});

test('non-finite or missing update dates sort as zero without changing the stored records', () => {
  const words = [
    word(fixtures[1], 2, { id: 'newest' }),
    word(fixtures[1], NaN, { id: 'nan' }),
    word(fixtures[1], Infinity, { id: 'infinite' }),
    word(fixtures[1], undefined, { id: 'missing', updatedAt: undefined }),
    word(fixtures[1], -1, { id: 'older' }),
  ];
  const before = structuredClone(words);
  freeze(words);
  const sorted = flatten(notebookView(words));
  assert.equal(sorted[0].id, 'newest');
  assert.equal(sorted.at(-1).id, 'older');
  assert.deepEqual(sorted.slice(1, -1).map(saved => saved.id).sort(), ['infinite', 'missing', 'nan']);
  assert.deepEqual(words, before);
});

test('query search matches lemma, recognized input form and every Chinese definition', () => {
  const words = [word(fixtures[0]), word(fixtures[1]), word(fixtures[2])];
  for (const query of ['manger', ' MANGEAIS ', '进食']) {
    const view = notebookView(words, { query });
    assert.deepEqual(flatten(view).map(saved => saved.id), [entryKey(fixtures[0])]);
    assert.equal(view.totalCount, 3);
    assert.equal(view.visibleCount, 1);
    assert.equal(view.isFiltered, true);
  }
  assert.equal(flatten(notebookView(words, { query: '高兴' }))[0].entry.lemma, 'heureux');
  const multipleDefinitions = word({ ...fixtures[1], definitions: ['第一条释义', '第二条：住宅'] });
  assert.equal(notebookView([multipleDefinitions], { query: '住宅' }).visibleCount, 1);
});

test('French search uses NFC and locale lowercase, but preserves meaningful accents', () => {
  const accented = word({ ...fixtures[1], lemma: 'ÉCOLE', query: 'ÉCOLES', definitions: ['学校'] });
  for (const query of ['école', 'E\u0301COLE', ' éCoLeS ']) assert.equal(notebookView([accented], { query }).visibleCount, 1);
  for (const query of ['ecole', 'ecoles']) assert.equal(notebookView([accented], { query }).visibleCount, 0);
  const decomposed = word({ ...fixtures[1], lemma: 'e\u0301cole', query: 'e\u0301coles' });
  assert.equal(notebookView([decomposed], { query: 'ÉCOLE' }).visibleCount, 1);
});

test('text and word-class filters intersect and counts retain the complete notebook size', () => {
  const words = [word(fixtures[0]), word(fixtures[1]), word(fixtures[2]), word(fixtures[4])];
  const adjectiveView = notebookView(words, { query: '高兴', partOfSpeech: 'adjective' });
  assert.deepEqual(adjectiveView.groups.map(group => group.partOfSpeech), ['adjective']);
  assert.deepEqual(flatten(adjectiveView).map(saved => saved.entry.lemma), ['heureux']);
  assert.equal(adjectiveView.totalCount, 4);
  assert.equal(adjectiveView.visibleCount, 1);
  assert.equal(adjectiveView.isFiltered, true);
  const noMatch = notebookView(words, { query: '高兴', partOfSpeech: 'noun' });
  assert.deepEqual(noMatch.groups, []);
  assert.equal(noMatch.totalCount, 4);
  assert.equal(noMatch.visibleCount, 0);
  assert.equal(noMatch.isFiltered, true);
  assert.equal(notebookView(words, { partOfSpeech: 'adjective' }).visibleCount, 2);
  assert.equal(notebookView(words, { partOfSpeech: 'adjective' }).isFiltered, true);
  assert.equal(notebookView(words, { query: ' \t ', partOfSpeech: 'all' }).isFiltered, false);
});

test('an unsupported filter value never silently falls back to the complete notebook', () => {
  const words = [word(fixtures[1]), word(fixtures[0])];
  for (const partOfSpeech of ['unsupported', '__proto__', 'constructor']) {
    const view = notebookView(words, { partOfSpeech });
    assert.deepEqual(view.groups, []);
    assert.equal(view.totalCount, 2);
    assert.equal(view.visibleCount, 0);
    assert.equal(view.isFiltered, true);
  }
});

test('schemaVersion 1 backups retain saved flags and same-lemma entries with distinct word classes', () => {
  const noun = word({ ...fixtures[1], lemma: 'sourire', query: 'sourire', definitions: ['微笑（名词）'] }, 4, { id: 'old-untrusted-noun-id', unknown: false, favorite: true });
  const verb = word({ ...fixtures[0], lemma: 'sourire', query: 'sourire', definitions: ['微笑（动词）'] }, 8, { id: 'old-untrusted-verb-id' });
  const restored = parseBackup(JSON.stringify({ schemaVersion: 1, words: [verb, noun] }));
  const before = structuredClone(restored);
  freeze(restored);
  const view = notebookView(restored, { query: 'sourire' });
  assert.deepEqual(view.groups.map(group => group.partOfSpeech), ['noun', 'verb']);
  assert.equal(view.totalCount, 2);
  assert.equal(view.visibleCount, 2);
  assert.deepEqual(flatten(view).map(saved => saved.id), ['sourire:noun', 'sourire:verb']);
  assert.equal(view.groups[0].words[0].unknown, false);
  assert.equal(view.groups[0].words[0].favorite, true);
  assert.deepEqual(restored, before);
  const markup = notebookMarkup(view);
  for (const id of ['sourire:noun', 'sourire:verb']) {
    for (const action of ['open', 'toggle', 'delete']) assert.ok(markup.includes(`data-${action}="${id}"`));
  }
  assert.match(markup, /已熟悉/);
  assert.match(markup, /已收藏/);
});

test('group markup exposes readable headings and counts while preserving all existing word actions', () => {
  const words = [word(fixtures[1]), word(fixtures[5]), word(fixtures[0])];
  const markup = notebookMarkup(notebookView(words));
  const groups = sections(markup);
  assert.equal(groups.length, 2);
  assert.match(groups[0], /<h2\b[^>]*>[\s\S]*?名词[\s\S]*?<\/h2>/);
  assert.match(groups[1], /<h2\b[^>]*>[\s\S]*?动词[\s\S]*?<\/h2>/);
  assert.match(groups[0], /(?:>\s*2\s*<|2\s*个)/);
  assert.match(groups[1], /(?:>\s*1\s*<|1\s*个)/);
  for (const saved of words) for (const action of ['open', 'toggle', 'delete']) assert.ok(markup.includes(`data-${action}="${escapeText(saved.id)}"`));
});

test('notebook markup escapes stored text and action attributes instead of creating executable HTML', () => {
  const id = 'bad" onclick="alert(1)\'&<';
  const lemma = '<img src=x onerror="alert(2)">&"\'';
  const meaning = '<script>alert(3)</script> & <svg onload="alert(4)">';
  const saved = word({ ...fixtures[1], lemma, query: '<script>alert(5)</script>', definitions: [meaning], partOfSpeech: '__proto__' }, 1, { id });
  const view = notebookView([saved]);
  const markup = notebookMarkup(view);
  assert.equal(view.groups[0].partOfSpeech, 'other');
  assert.ok(markup.includes(escapeText(lemma)));
  assert.ok(markup.includes(escapeText(meaning)));
  for (const action of ['open', 'toggle', 'delete']) assert.ok(markup.includes(`data-${action}="${escapeText(id)}"`));
  assert.doesNotMatch(markup, /<(?:script|img|svg)\b/i);
  // Attribute lexer consumes quoted values, including escaped quotes, before checking real attribute names.
  for (const tag of markup.matchAll(/<[^>]+>/g)) {
    for (const attribute of tag[0].matchAll(/(?:^|\s)([\w:-]+)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?/g)) assert.ok(!/^on/i.test(attribute[1]), 'unexpected executable attribute');
  }
});

test('empty notebook and an active filter with no matches have different empty-state messages', () => {
  const empty = notebookView([]);
  assert.deepEqual(empty.groups, []);
  assert.equal(empty.totalCount, 0);
  assert.equal(empty.visibleCount, 0);
  assert.equal(empty.isFiltered, false);
  const emptyMarkup = notebookMarkup(empty);
  assert.match(emptyMarkup, /口袋还是空的|生词本.*空|还没有.*词/);
  assert.doesNotMatch(emptyMarkup, /没找到符合条件的词/);
  const noMatch = notebookMarkup(notebookView([word(fixtures[1])], { query: 'does-not-match' }));
  assert.match(noMatch, /没找到符合条件的词/);
  assert.match(noMatch, /<button\b[^>]*\bdata-clear-notebook-filters(?:\s|>)/);
  assert.doesNotMatch(emptyMarkup, /data-clear-notebook-filters/);
  assert.notEqual(noMatch, emptyMarkup);
  assert.equal(sections(emptyMarkup).length, 0);
  assert.equal(sections(noMatch).length, 0);
});

test('notebook word-class dropdown and live match count are wired to existing filtering controls', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  const dropdown = html.match(/<select\b(?=[^>]*\bid="part-of-speech-filter")[^>]*>[\s\S]*?<\/select>/)?.[0];
  assert.ok(dropdown, 'missing word-class filter dropdown');
  for (const partOfSpeech of ['all', ...order]) assert.match(dropdown, new RegExp('<option\\b[^>]*\\bvalue="' + partOfSpeech + '"'));
  for (const label of Object.values(partOfSpeechLabels)) assert.ok(dropdown.includes(escapeText(label)), 'missing visible word-class label');
  assert.match(html, /<[^>]+\bid="notebook-match-count"[^>]*\baria-live="polite"|<[^>]+\baria-live="polite"[^>]*\bid="notebook-match-count"/);
  assert.match(app, /\$\(\s*['"]#part-of-speech-filter['"]\s*\)\.addEventListener\(\s*['"]change['"]\s*,\s*renderNotebook\s*\)/);
  assert.match(app, /#notebook-match-count/);
  assert.match(app, /notebookView\s*\(/);
  assert.match(app, /notebookMarkup\s*\(/);
});

test('clear-filters action tests attribute presence and resets both filters before restoring focus', async () => {
  const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  const handler = app.match(/if\s*\(\s*button\.hasAttribute\(\s*['"]data-clear-notebook-filters['"]\s*\)\s*\)\s*\{([\s\S]*?)\}/)?.[1];
  assert.ok(handler, 'a boolean data attribute must use hasAttribute, not a falsy empty dataset value');
  assert.match(handler, /\$\(\s*['"]#filter['"]\s*\)\.value\s*=\s*['"]['"]/);
  assert.match(handler, /\$\(\s*['"]#part-of-speech-filter['"]\s*\)\.value\s*=\s*['"]all['"]/);
  assert.match(handler, /renderNotebook\s*\(\s*\)/);
  assert.match(handler, /\$\(\s*['"]#filter['"]\s*\)\.focus\s*\(\s*\)/);
});
