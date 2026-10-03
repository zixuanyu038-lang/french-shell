import { LookupError } from './provider.mjs';
import { readSse } from './src/stream.js';
import { speechDefaults } from './src/settings.js';

export async function* speechStream(text, config, { fetchImpl = fetch, signal } = {}) {
  if (typeof text !== 'string' || !text.trim() || Array.from(text).length > 500) throw new LookupError('请选择 1–500 个字符的法语文本。');
  if (!config || typeof config.apiKey !== 'string' || !config.apiKey.trim() || config.apiKey.length > 4096 || /[\r\n]/.test(config.apiKey)) throw new LookupError('请先在设置中填写百炼 TTS API Key。');
  const voice = config.voice || speechDefaults.voice;
  if (typeof voice !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/.test(voice)) throw new LookupError('音色名格式不正确。');
  const model = config.model || speechDefaults.model;
  if (typeof model !== 'string' || !/^qwen3-tts-[a-z0-9-]{1,100}$/.test(model) || model.includes('realtime')) throw new LookupError('此适配器只支持 Qwen3 HTTP TTS，不能使用 realtime 模型。');
  const language = config.language || speechDefaults.language;
  if (!['French', 'English', 'Chinese', 'German', 'Italian', 'Portuguese', 'Spanish', 'Japanese', 'Korean', 'Russian'].includes(language)) throw new LookupError('朗读语言不受支持。');
  let endpoint;
  try { endpoint = new URL(config.endpoint || speechDefaults.endpoint); } catch { throw new LookupError('TTS 接口地址无效。'); }
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new LookupError('TTS 接口必须是无账号或参数的 HTTPS 地址。');
  const requestSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000);
  const startedAt = performance.now();
  try {
    const response = await fetchImpl(endpoint.href, {
      method: 'POST', redirect: 'error', signal: requestSignal,
      headers: { Authorization: `Bearer ${config.apiKey.trim()}`, 'Content-Type': 'application/json', 'X-DashScope-SSE': 'enable' },
      body: JSON.stringify({ model, input: { text: text.trim(), voice, language_type: language } })
    });
    if (!response.ok) {
      const messages = { 401: '百炼 Key 无效，请检查是否为北京地域的 Key。', 403: '百炼拒绝访问，请检查模型权限和地域。', 402: '百炼余额不足。', 429: '语音请求过于频繁或额度不足，请稍后重试。', 400: '语音参数不被服务支持，请检查音色名。' };
      throw new LookupError(messages[response.status] || '语音服务暂时不可用。', 502);
    }
    if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) throw new LookupError('语音服务未返回流式音频，请检查服务配置。', 502);
    let receivedAudio = false;
    let completed = false;
    let firstAudioMs;
    for await (const data of readSse(response.body)) {
      if (data === '[DONE]') break;
      let event;
      try { event = JSON.parse(data); } catch { throw new LookupError('语音服务返回的数据格式异常。', 502); }
      if (event.code || (event.status_code && event.status_code !== 200)) throw new LookupError('语音合成失败，请检查 Key、模型权限或音色。', 502);
      const audio = event.output?.audio?.data;
      if (typeof audio === 'string' && audio) {
        if (!/^[A-Za-z0-9+/]+={0,2}$/.test(audio) || audio.length % 4 !== 0 || Buffer.from(audio, 'base64').length % 2 !== 0) throw new LookupError('语音服务返回了无效 PCM 数据。', 502);
        firstAudioMs ??= Math.round(performance.now() - startedAt);
        receivedAudio = true;
        yield { type: 'audio', data: audio, sampleRate: 24000, firstAudioMs };
      }
      if (event.output?.finish_reason === 'stop') { completed = true; break; }
    }
    if (!receivedAudio) throw new LookupError('服务未返回音频，请换一段法语文本重试。', 502);
    if (!completed) throw new LookupError('音频连接中断，请重新朗读。', 502);
    yield { type: 'done', firstAudioMs, generationMs: Math.round(performance.now() - startedAt), model, voice };
  } catch (error) {
    if (requestSignal.aborted) throw new LookupError('语音请求已取消或超过 30 秒。', 504);
    if (error instanceof LookupError) throw error;
    throw new LookupError('无法连接百炼语音服务，请检查网络后重试。', 502);
  }
}
