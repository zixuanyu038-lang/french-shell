const names = { noun: '名词', verb: '动词', adjective: '形容词', adverb: '副词', phrase: '短语', preposition: '介词', conjunction: '连词', pronoun: '代词', determiner: '限定词', interjection: '感叹词' };
export const escapeText = value => String(value ?? '').replace(/[&<>"']/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[x]));

// The original, possibly misspelled query is display-only. Actions use an entry.
export function lookupMarkup(result) {
  const query = escapeText(result.query);
  let summary = '';
  if (result.status === 'corrected') {
    summary = `<section class="lookup-notice corrected" aria-label="拼写提示"><h2>可能想查这个？</h2><p class="query-resolution"><span>你输入</span> <strong lang="fr">${query}</strong> <span aria-hidden="true">→</span> <span>按这个词展示</span> <strong lang="fr">${escapeText(result.entries[0].query)}</strong></p><p>${escapeText(result.notice || '这是推测更正，不是确定答案；如果不是这个词，请修改输入再查。')}</p></section>`;
  } else if (result.status === 'ambiguous') {
    summary = `<section class="lookup-notice ambiguous" aria-label="拼写候选"><h2>有几个可能，本鱼不瞎选。</h2><p>你输入了 <strong lang="fr">${query}</strong>，先选一项展开词卡。</p><p>${escapeText(result.notice || '缺少上下文，无法确定你想查哪一个。')}</p></section>`;
  } else if (result.status === 'not_found') {
    summary = `<section class="lookup-notice not-found" aria-label="未识别输入"><h2>这个暂时没认出来。</h2><p>你输入了 <strong lang="fr">${query}</strong>。</p><p>${escapeText(result.notice || '请检查拼写，或加一点法语上下文再查；不生成猜出来的词条。')}</p></section>`;
  } else if (result.entries.length > 1) {
    summary = `<section class="lookup-notice exact" aria-label="多个词条"><h2>这个词有几种用法。</h2><p>按词性选一项展开，不需要重新查询。</p>${result.notice ? `<p>${escapeText(result.notice)}</p>` : ''}</section>`;
  }
  const candidates = result.entries.length > 1 ? `<div class="lookup-candidates" role="group" aria-label="选择词条">${result.entries.map((entry, index) => `<button type="button" class="lookup-candidate" data-candidate="${index}" aria-pressed="false"><span class="candidate-topline"><strong lang="fr">${escapeText(entry.query)}</strong><span class="tag">${escapeText(names[entry.partOfSpeech])}</span></span><span class="candidate-meaning">${entry.definitions.map(escapeText).join('；')}</span>${entry.query !== entry.lemma ? `<span class="candidate-lemma">原形 <span lang="fr">${escapeText(entry.lemma)}</span></span>` : ''}<span class="candidate-action">展开词卡 ↗</span></button>`).join('')}</div><p class="candidate-local-note">候选已在本次查询中一起返回。切换不再调用 API；只有你点“不会”或“收藏”的词才保存。</p>` : '';
  return `${summary}${candidates}<div class="entry-result">${result.entries.length > 1 ? '<p class="candidate-placeholder">选一张看看。暂时不会保存任何候选。</p>' : ''}</div>`;
}

export function lookupCandidate(result, index) {
  if (!Number.isInteger(index) || index < 0 || index >= result.entries.length) throw new Error('请选择有效的候选词条。');
  return result.entries[index];
}
