import { entryKey } from './entries.js';
import { lookupDemoResult, validateLookupResult } from './lookup.js';
import { lookupMarkup, lookupCandidate } from './lookup-view.js';
import { partOfSpeechLabels as names, notebookView, notebookMarkup } from './notebook.js';
import { allWords, saveWord, removeWord, storageInfo, chooseDataFile, reconnectDataFile, useBrowserStorage, importWords, fileStorageSupported, closeStorage } from './storage.js';
import { SpeechPlayer } from './speech.js';
import { lookupDefaults, speechDefaults, loadSettings, saveSettings } from './settings.js';
import { Mascot } from './mascot.js';
import { readLines } from './stream.js';

const $ = selector => document.querySelector(selector);
let settingsStorage;
try { settingsStorage = localStorage; } catch {}
const mascot = new Mascot({
  root:$('.companion'),sprite:$('#mascot-sprite'),nudge:$('#mascot-nudge'),
  unavailable: $('#mascot-unavailable'), collapse: $('#mascot-collapse'),
  source: $('#mascot-source'), message: $('#fish-message'), caption: $('#fish-caption'), actionStatus: $('#mascot-action-status')
}, { storage: settingsStorage });
function fishSays(message, caption = 'D指导说', state = 'idle') { mascot.setState(state, message, caption); }
function syncMascotSettings() {
  $('#mascot-visible').checked = mascot.settings.enabled;
}
syncMascotSettings();
$('#mascot-nudge').addEventListener('click', () => mascot.nudge());
$('#mascot-apply').addEventListener('click', () => {
  const persisted = mascot.apply({enabled:$('#mascot-visible').checked});
  syncMascotSettings();
  $('#mascot-settings-status').textContent = persisted ? '设置已保存。' : '本次已生效，但未能保存，下次打开需重新设置。';
});
let remembered = {};
async function credentials(action = 'status', kind, config, apiKey) {
  const response = await fetch('/api/credentials', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, kind, config, apiKey }), signal: AbortSignal.timeout(5000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '无法读取本机密钥状态。');
  remembered = data;
  for (const [type, prefix] of [['lookup', 'api'], ['speech', 'tts']]) {
    $(`#${prefix}-saved`).textContent = data[type]?.configured ? '本机已保存密钥（不回显）。仅用于保存时确认的接口地址。' : '本机未保存密钥。';
    $(`#${prefix}-delete`).disabled = !data[type]?.configured;
  }
}
function hasSaved(kind, config) {
  try {
    const url = new URL(kind === 'lookup' ? config.baseUrl : config.endpoint).href.replace(/\/+$/, '');
    return remembered[kind]?.binding === `${kind === 'lookup' ? config.provider : 'qwen-http'}:${url}`;
  } catch { return false; }
}
const credentialsReady = credentials().catch(() => { $('#api-saved').textContent = $('#tts-saved').textContent = '无法读取本机密钥状态，请重新应用设置。'; });
for (const [kind, prefix] of [['lookup', 'api'], ['speech', 'tts']]) {
  $(`#${prefix}-delete`).addEventListener('click', async () => {
    try {
      await credentials('delete', kind);
      if (kind === 'lookup') config.apiKey = ''; else { ttsConfig.apiKey = ''; player.stop(''); }
      $(`#${prefix}-key`).value = ''; $(`#${prefix}-remember`).checked = false;
      toast('已删除本机保存的密钥并清除本页密钥；不影响生词本。');
    } catch (error) { toast(error.message); }
  });
}
let ttsConfig = { ...loadSettings(settingsStorage, 'french-shell-speech-settings', speechDefaults), apiKey: '' };
$('#tts-enabled').checked = ttsConfig.enabled;
$('#tts-endpoint').value = ttsConfig.endpoint;
$('#tts-model').value = ttsConfig.model;
$('#tts-language').value = ttsConfig.language;
$('#tts-voice').value = ttsConfig.voice;
const player = new SpeechPlayer((message, active) => {
  $('#speech-bar').hidden = !message;
  $('#speech-status').textContent = message;
  $('#stop-speech').hidden = !active;
  if (active) {
    if (mascot.state !== 'speaking') {
      mascot.beforeSpeech = { state: mascot.state, message: $('#fish-message').textContent, caption: $('#fish-caption').textContent };
      fishSays('开麦了。先听这一句。', '朗读中', 'speaking');
    }
  } else if (mascot.state === 'speaking' && mascot.beforeSpeech) {
    const previous = mascot.beforeSpeech; mascot.beforeSpeech = undefined;
    fishSays(previous.message, previous.caption, previous.state);
  }
});
$('#stop-speech').addEventListener('click', () => player.stop());
$('#tts-form').addEventListener('submit', async event => {
  event.preventDefault(); player.stop('');
  const next = { enabled: $('#tts-enabled').checked, apiKey: $('#tts-key').value.trim(), voice: $('#tts-voice').value.trim(), model: $('#tts-model').value.trim(), endpoint: $('#tts-endpoint').value.trim(), language: $('#tts-language').value };
  await credentialsReady;
  if (next.enabled && !next.apiKey && !hasSaved('speech', next)) { $('#tts-settings-status').textContent = '此接口需要填写 TTS Key；旧密钥不能用于新地址。'; return; }
  if ($('#tts-remember').checked) {
    try { await credentials('save', 'speech', next, next.apiKey); next.apiKey = ''; $('#tts-key').value = ''; $('#tts-remember').checked = false; }
    catch (error) { $('#tts-settings-status').textContent = error.message; return; }
  }
  ttsConfig = next;
  try { saveSettings(settingsStorage, 'french-shell-speech-settings', next, speechDefaults); } catch { toast('设置仅在本次会话生效，浏览器未允许保存。'); }
  $('#tts-settings-status').textContent = next.enabled ? '朗读已启用，可点击试听。未保存的密钥刷新后清除。' : '朗读已关闭。';
});
function speak(text) { if (!ttsConfig.enabled) { toast('朗读默认关闭，请在设置中启用。'); return; } if (!ttsConfig.apiKey && !hasSaved('speech', ttsConfig)) { toast('此语音接口未保存密钥，请在设置填写并应用。'); return; } player.play(text, ttsConfig); }
$('#tts-preview').addEventListener('click', () => speak('Bonjour'));
const escape = value => String(value ?? '').replace(/[&<>"']/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[x]));
let currentEntry;
let currentLookup;
let words = [];
let selectedText = '';
let toastTimer;
let queryController;
let config = { ...loadSettings(settingsStorage, 'french-shell-settings', lookupDefaults), apiKey: '' };
$('#lookup-mode').value = config.mode;
function updateModeNote() { $('#mode-note').textContent = config.mode === 'live' ? `已接线 · ${config.model} · 点击查词才调用接口` : '试玩模式，不花 API 钱。任意查词先去设置接线。'; }
updateModeNote();
$('#provider').value = config.provider;
$('#base-url').value = config.baseUrl;
$('#model').value = config.model;
function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').hidden = true, 4500); }
function showQueryError(message = '') { $('#query-error').textContent = message; $('#query-error').hidden = !message; }
function speechButton(text) { return `<button class="speech" data-speech="${escape(text)}" aria-label="朗读 ${escape(text)}">▷</button>`; }
function renderEntry(entry) {
  const target = $('#result .entry-result') || $('#result');
  target.innerHTML = `<article class="card word-card"><div class="word-heading"><div><span class="tag">${escape(names[entry.partOfSpeech] || entry.partOfSpeech)}</span><h2 lang="fr">${escape(entry.lemma)} ${speechButton(entry.lemma)}</h2><span class="ipa">${escape(entry.ipa || '音标未知')}</span></div><div class="save-actions"><button data-save="unknown">＋ 不会</button><button data-save="favorite">☆ 收藏</button></div></div><p class="meaning">${entry.definitions.map(escape).join('；')}</p><div class="analysis"><span>识别形式</span><p><span lang="fr">${escape(entry.query)}</span> <span class="ipa">${escape(entry.queryIpa || '')}</span> ${speechButton(entry.query)}<br>${escape(entry.inputAnalysis)}</p></div><div class="grammar">${Object.values(entry.grammar).filter(Boolean).map(x => `<span>${escape(x)}</span>`).join('')}</div><div class="forms">${entry.forms.map(x => `<div><small>${escape(x.label)}</small><span lang="fr">${escape(x.text)} ${speechButton(x.text)}</span></div>`).join('')}</div>${entry.conjugations.map(group => `<details><summary>${escape(group.mood)} · ${escape(group.tense)}变位</summary><div class="conjugations">${group.rows.map(([pronoun, form]) => `<div><span lang="fr">${escape(pronoun)}</span><strong lang="fr">${escape(form)}</strong>${speechButton(`${pronoun === 'il / elle / on' ? 'il' : pronoun === 'ils / elles' ? 'ils' : pronoun} ${form}`)}</div>`).join('')}</div></details>`).join('')}<div class="examples"><small>在句子里记住它</small>${entry.examples.map(x => `<p lang="fr">${escape(x.fr)} ${speechButton(x.fr)}</p><p class="translation">${escape(x.zh)}</p>`).join('')}</div>${entry.note ? `<p class="note">学习提示 · ${escape(entry.note)}</p>` : ''}<small class="demo-note">来源：人工演示样例</small></article>`;
}
function updateAttribution(entry) {
  if (entry.source?.kind === 'llm') $('#result .word-card > .demo-note').textContent = `AI 生成 · ${entry.source.model} · 有疑问时请核对`;
}
function renderRequestInfo(d) {
  if (d) {
    const panel = document.createElement('details'); panel.className = 'request-info';
    panel.innerHTML = `<summary>${escape(d.requestedModel)} · ${d.thinking === 'disabled' ? '非思考' : '供应商默认模式'} · 总耗时 ${(d.totalMs / 1000).toFixed(2)} 秒</summary><p>请求模型：${escape(d.requestedModel)}<br>服务返回模型：${escape(d.returnedModel || '服务未提供')}${d.firstDeltaMs === null || d.firstDeltaMs === undefined ? '' : `<br>首字到达：${(d.firstDeltaMs / 1000).toFixed(2)} 秒`}<br>接口耗时：${(d.upstreamMs / 1000).toFixed(2)} 秒（含网络、生成、校验及重试）<br>端到端耗时：${(d.totalMs / 1000).toFixed(2)} 秒<br>调用次数：${d.attempts}${d.outputTokens === null ? '' : `<br>最后一次输出 tokens：${d.outputTokens}`}<br>生成过程实时显示在进度条；词卡仍等整条 JSON 校验通过后一次渲染。</p>`;
    $('#result').append(panel);
  }
}
function chooseLookupCandidate(index) {
  currentEntry = lookupCandidate(currentLookup, index);
  renderEntry(currentEntry); updateAttribution(currentEntry);
  document.querySelectorAll('#result [data-candidate]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.candidate) === index)));
  $('#selection-speech').hidden = true; selectedText = '';
  fishSays(currentLookup.status === 'corrected' ? '按这个拼法出卡了。不是你想找的？再改改输入。' : currentLookup.entries.length > 1 ? '先看这张。选错了还能换，不用再调用。' : '出卡了。不会就留着，别硬背。', 'D指导交卷', 'result');
}
function renderLookup(result) {
  currentLookup = result; currentEntry = undefined;
  $('#result').innerHTML = lookupMarkup(result);
  $('#search-view').classList.add('has-result');
  if (result.entries.length === 1) chooseLookupCandidate(0);
  else if (result.entries.length > 1) fishSays('这几个都说得通。选一个，本鱼再展开。', '等你选词', 'result');
  else fishSays('没敢瞎编。换个拼法，或加一点上下文。', '还没认出来', 'error');
  if (result.source?.kind === 'llm' && result.entries.length !== 1) {
    const origin = document.createElement('p'); origin.className = 'lookup-origin';
    origin.textContent = `AI 生成 · ${result.source.model} · ${result.status === 'ambiguous' ? '拼写候选是推测，请结合上下文选择。' : '有疑问时请核对。'}`;
    $('#result').append(origin);
  }
  renderRequestInfo(result.diagnostics);
}
function renderNotebook() {
  const view = notebookView(words, { query: $('#filter').value, partOfSpeech: $('#part-of-speech-filter').value });
  $('#count').textContent = view.totalCount;
  $('#notebook-total').textContent = view.totalCount;
  $('#notebook-match-count').textContent = view.isFiltered
    ? `显示 ${view.visibleCount} / ${view.totalCount} 个词 · 每组按最近更新排序`
    : '按词性分组 · 每组按最近更新排序';
  $('#notebook').innerHTML = notebookMarkup(view);
}
async function refresh() {
  try {
    const info = await storageInfo(); $('#storage-status').textContent = `当前存储：${info.name}${info.mode === 'file' ? '（用户选择的数据文件）' : ''}`;
    words = (await allWords()).sort((a, b) => b.updatedAt - a.updatedAt); renderNotebook();
  } catch (error) { $('#storage-status').textContent = error.message; $('#notebook').textContent = error.message; throw error; }
}
function showView(view) {
  for (const name of ['search', 'notebook', 'settings']) $(`#${name}-view`).hidden = name !== view;
  $('#tts-settings').hidden = $('#data-settings').hidden = $('#mascot-settings').hidden = view !== 'settings';
  $('#view-label').textContent = {search:'查词', notebook:'生词本', settings:'设置'}[view];
  mascot.setView(view);
  document.querySelectorAll('[data-view]').forEach(button => {
    button.classList.toggle('active', button.dataset.view === view);
    if (button.dataset.view === view) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  window.scrollTo({ top: 0, behavior: 'instant' });
}
async function search(query) {
  if (!query.trim()) return;
  showQueryError();
  await credentialsReady;
  if (config.mode === 'live' && !config.apiKey && !hasSaved('lookup', config)) { showQueryError('此接口未保存密钥，请在设置填写 Key 并应用。'); return; }
  queryController?.abort();
  const controller = new AbortController(); queryController = controller;
  const deadline = setTimeout(() => controller.abort(new Error('查词超过 50 秒，请检查网络后重试。')), 50000);
  const startedAt = performance.now();
  currentEntry = undefined; currentLookup = undefined; $('#result').replaceChildren(); $('#selection-speech').hidden = true;
  $('#search-view').classList.remove('has-result');
  $('#lookup-guides').hidden = true;
  fishSays('收到，本鱼翻翻笔记。', '正在查词', 'thinking');
  $('#query-status').hidden = false; $('#search-form button').disabled = true;
  const label = `${config.model} · ${config.provider === 'deepseek' ? '非思考' : '供应商默认模式'}`;
  // While the model streams, show what has arrived; the timer only fills the gaps.
  let streamNote = '';
  let pending = '';
  let earlyLemma;
  const progress = () => { if (queryController === controller) $('#query-progress').textContent = streamNote || `${config.mode === 'demo' ? '演示查询' : label} · 已等待 ${((performance.now() - startedAt) / 1000).toFixed(1)} 秒`; };
  progress(); const progressTimer = setInterval(progress, 100);
  try {
    let result;
    if (config.mode === 'demo') result = await lookupDemoResult(query);
    else {
      const response = await fetch('/api/lookup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query, config }), signal: controller.signal });
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || '查询失败，请重试。'); }
      for await (const line of readLines(response.body)) {
        if (queryController !== controller) return;
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        if (event.type === 'error') throw new Error(event.error);
        if (event.type === 'delta') {
          // A partial frame is only a progress hint; the lemma is shown as plain text.
          if (!earlyLemma) {
            pending += event.text;
            const found = pending.match(/"lemma"\s*:\s*"([^"]*)"/);
            if (found) { earlyLemma = found[1].slice(0, 40); pending = ''; }
          }
          streamNote = `${label} · 已生成 ${event.received} 字符${earlyLemma ? ` · ${earlyLemma}` : ''}`;
          progress();
        } else if (event.type === 'result') result = event.result;
      }
      if (!result) throw new Error('查询未完成，请重试。');
      validateLookupResult(result, query);
    }
    if (queryController !== controller || controller.signal.aborted) return;
    if (result.diagnostics) result.diagnostics.totalMs = Math.round(performance.now() - startedAt);
    renderLookup(result);
  } catch (error) { if (queryController === controller) {
    const cancelled = controller.signal.aborted && controller.signal.reason?.name !== 'Error';
    const message = controller.signal.aborted ? (cancelled ? '已取消查询。' : controller.signal.reason.message) : error.message;
    if (cancelled) toast(message); else showQueryError(message);
    fishSays(cancelled ? '行，先不查。D指导继续待命。' : '这把没查成。具体原因看提示，改好再来。', cancelled ? '已取消' : '查词未完成', cancelled ? 'cancelled' : 'error');
    $('#lookup-guides').hidden = false;
  } }
  finally { clearTimeout(deadline); clearInterval(progressTimer); if (queryController === controller) { $('#query-status').hidden = true; $('#search-form button').disabled = false; } }
}
$('#cancel-query').addEventListener('click', () => queryController?.abort());
$('#settings-form').addEventListener('submit', async event => {
  event.preventDefault();
  const next = { mode: $('#lookup-mode').value, provider: $('#provider').value, baseUrl: $('#base-url').value.trim(), model: $('#model').value.trim(), apiKey: $('#api-key').value.trim() };
  await credentialsReady;
  if (next.mode === 'live' && !next.apiKey && !hasSaved('lookup', next)) { $('#settings-status').textContent = '此接口需要填写 API Key；旧密钥不能用于新地址。'; return; }
  if ($('#api-remember').checked) {
    try { await credentials('save', 'lookup', next, next.apiKey); next.apiKey = ''; $('#api-key').value = ''; $('#api-remember').checked = false; }
    catch (error) { $('#settings-status').textContent = error.message; return; }
  }
  config = next;
  try { saveSettings(settingsStorage, 'french-shell-settings', next, lookupDefaults); } catch { toast('设置仅在本次会话生效，浏览器未允许保存。'); }
  updateModeNote();
  $('#settings-status').textContent = '设置已应用。已保存密钥刷新后自动使用；未保存密钥仅本次会话生效。';
});
$('#search-form').addEventListener('submit', event => { event.preventDefault(); search($('#query').value); });
$('#filter').addEventListener('input', renderNotebook);
$('#part-of-speech-filter').addEventListener('change', renderNotebook);
document.addEventListener('click', async event => {
  const button = event.target.closest('button'); if (!button) return;
  try {
    if (button.dataset.view) showView(button.dataset.view);
    if (button.hasAttribute('data-clear-notebook-filters')) {
      $('#filter').value = ''; $('#part-of-speech-filter').value = 'all';
      renderNotebook(); $('#filter').focus();
    }
    if (button.dataset.query) { $('#query').value = button.dataset.query; await search(button.dataset.query); }
    if (button.dataset.candidate !== undefined && currentLookup) chooseLookupCandidate(Number(button.dataset.candidate));
    if (button.dataset.save && currentEntry) {
      const id = entryKey(currentEntry); const previous = words.find(x => x.id === id);
      const { diagnostics, ...savedEntry } = currentEntry;
      await saveWord({ id, entry: savedEntry, unknown: previous?.unknown || button.dataset.save === 'unknown', favorite: previous?.favorite || button.dataset.save === 'favorite', createdAt: previous?.createdAt || Date.now(), updatedAt: Date.now() });
      await refresh(); toast('已保存到这台设备的生词本。');
      fishSays('拿下。这个词本鱼替你留着了。', '已保存', 'saved');
    }
    if (button.dataset.open) {
      queryController?.abort(); queryController = undefined; currentLookup = undefined;
      $('#query-status').hidden = true; $('#search-form button').disabled = false; showQueryError();
      $('#result').replaceChildren(); $('#selection-speech').hidden = true; selectedText = '';
      currentEntry = words.find(x => x.id === button.dataset.open).entry;
      renderEntry(currentEntry); updateAttribution(currentEntry); $('#query').value = currentEntry.query;
      $('#search-view').classList.add('has-result'); $('#lookup-guides').hidden = true;
      fishSays(`${currentEntry.lemma}，又见面了。这次是本地存的，不花 API 钱。`, '复习一下', 'review'); showView('search');
    }
    if (button.dataset.toggle) { const word = words.find(x => x.id === button.dataset.toggle); await saveWord({ ...word, unknown: !word.unknown, updatedAt: Date.now() }); await refresh(); }
    if (button.dataset.delete) { await removeWord(button.dataset.delete); await refresh(); toast('词条已移除，重新查词后可以再次保存。'); }
    if (button.dataset.speech || button.id === 'selection-speech') speak(button.dataset.speech || selectedText);
  } catch (error) { toast(error.message); }
});
async function exportBackup() {
  try {
  const words = await allWords();
  const url = URL.createObjectURL(new Blob([JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), words }, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'french-shell-words.json'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) { toast(error.message); }
}
$('#export').addEventListener('click', exportBackup);
$('#data-export').addEventListener('click', exportBackup);
const supported = fileStorageSupported();
$('#file-support').textContent = supported ? '当前浏览器支持连接数据文件；文件位置由系统选择窗口决定。' : '当前浏览器不支持连接文件。仍可导入/导出；下载位置由浏览器设置决定。';
$('#create-file').disabled = $('#open-file').disabled = !supported;
for (const [selector, action] of [['#create-file', () => chooseDataFile(true)], ['#open-file', () => chooseDataFile(false)], ['#reconnect-file', reconnectDataFile], ['#use-browser', useBrowserStorage], ['#retry-storage', async () => {}]]) {
  $(selector).addEventListener('click', async () => {
    try { await action(); await refresh(); toast('词库已连接。'); }
    catch (error) { if (error.name !== 'AbortError') toast(error.message); }
  });
}
$('#import-file').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  try { if (file.size > 5_000_000) throw new Error('备份文件过大（上限 5 MB）。'); const count = await importWords(await file.text()); await refresh(); toast(`已处理 ${count} 条词条，按更新时间合并。`); }
  catch (error) { toast(error.message); } finally { event.target.value = ''; }
});
window.addEventListener('pagehide', () => { queryController?.abort(); player.dispose(); mascot.dispose(); closeStorage(); });
document.addEventListener('mouseup', event => {
  if (event.target.closest('#selection-speech')) return;
  const selection = window.getSelection(); selectedText = selection.toString().trim();
  const area = selection.anchorNode?.parentElement?.closest('#result .word-card, #notebook');
  const endArea = selection.focusNode?.parentElement?.closest('#result .word-card, #notebook');
  // Never pronounce the display-only, potentially misspelled original query.
  $('#selection-speech').hidden = !selectedText || selectedText.length > 500 || !area || area !== endArea;
});
$('#selection-speech').addEventListener('mousedown', event => event.preventDefault());
refresh().catch(error => toast(error.message));
