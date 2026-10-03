import test from 'node:test';
import assert from 'node:assert/strict';
import { lookupMarkup, lookupCandidate } from '../src/lookup-view.js';
import { fixtures } from '../src/entries.js';

test('correction explicitly displays the original query but exposes no action on misspelling', () => {
  const entry = structuredClone(fixtures[1]);
  const html = lookupMarkup({ query: 'maizon', status:'corrected', notice:null, entries:[entry] });
  assert.match(html, /maizon/);
  assert.match(html, /maison/);
  assert.match(html, /推测更正/);
  assert.doesNotMatch(html, /data-speech|data-save|data-query/);
  assert.equal(lookupCandidate({ entries:[entry] }, 0).query, 'maison');
});
test('ambiguous results require a selection without auto-saving or automatically choosing the first', () => {
  const result = { query:'typo', status:'ambiguous', notice:'请结合上下文选择。', entries:[fixtures[0], fixtures[1]] };
  const html = lookupMarkup(result);
  assert.equal((html.match(/aria-pressed="false"/g) || []).length, 2);
  assert.match(html, /选一张看看/);
  assert.doesNotMatch(html, /data-save|data-speech/);
  assert.equal(lookupCandidate(result, 1), fixtures[1]);
  assert.throws(() => lookupCandidate(result, -1));
  assert.throws(() => lookupCandidate(result, 0.5));
  assert.throws(() => lookupCandidate(result, 2));
});
test('model text and original input are escaped in notices and candidate summaries', () => {
  const result = { query:'<script>bad()</script>', status:'ambiguous', notice:'<img src=x onerror="bad()">', entries:[{...fixtures[0], query:'<svg/onload=bad()>', definitions:['<b>wrong</b>']}, fixtures[1]] };
  const html = lookupMarkup(result);
  assert.doesNotMatch(html, /<script>|<img|<svg|<b>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;b&gt;/);
});
test('not-found and exact multi-part-of-speech responses remain distinct', () => {
  const missing = lookupMarkup({ query:'?', status:'not_found', notice:'补一点上下文。', entries:[] });
  assert.match(missing, /未识别输入/);
  assert.doesNotMatch(missing, /data-candidate/);
  const multiple = lookupMarkup({ query:'word', status:'exact', notice:null, entries:[fixtures[0],fixtures[1]] });
  assert.match(multiple, /几种用法/);
  assert.doesNotMatch(multiple, /拼写候选/);
});
