import { readLines, pcm16ToFloat } from './stream.js';
import { waitBounded } from './lifecycle.js';

export class SpeechPlayer {
  constructor(onStatus) { this.onStatus = onStatus; this.context = null; this.session = null; }
  stop(message = '已停止朗读。') {
    const session = this.session;
    this.session = null;
    if (session) {
      session.controller.abort(); clearTimeout(session.timer); clearTimeout(session.deadline);
      for (const source of session.sources) { try { source.stop(); } catch {} }
      session.sources.clear();
    }
    this.onStatus(message, false);
  }
  dispose() { this.stop(''); const context = this.context; this.context = null; if (context?.close) context.close().catch(() => {}); }
  async play(text, config) {
    this.stop('');
    // The local backend can inject a remembered, endpoint-bound credential.
    // An empty frontend key must not block that path; backend validates it.
    if (!text?.trim() || Array.from(text).length > 500) { this.onStatus('请选择 1–500 个字符的法语文本。', false); return; }
    const session = { controller: new AbortController(), sources: new Set(), timer: null, deadline: null };
    this.session = session;
    const startedAt = performance.now();
    const label = text.trim().length > 45 ? `${text.trim().slice(0, 45)}…` : text.trim();
    this.onStatus(`正在合成「${label}」 · ${config.model || 'qwen3-tts-flash'}…`, true);
    session.deadline = setTimeout(() => { if (this.session === session) this.stop('语音请求超过 35 秒，请检查网络或点击重试。'); }, 35000);
    try {
      // Resume synchronously from the user's click, before waiting for the network.
      this.context ||= new AudioContext({ latencyHint: 'interactive' });
      await waitBounded(this.context.resume(), session.controller.signal, 5000, '音频设备启动超时，请重新点击朗读。');
      if (this.session !== session) return;
      let nextTime = this.context.currentTime;
      let firstPlaybackMs;
      let done = false;
      const response = await fetch('/api/speech', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, config }), signal: session.controller.signal });
      if (!response.ok) { const error = await response.json(); throw new Error(error.error || '语音请求失败。'); }
      for await (const line of readLines(response.body)) {
        if (this.session !== session) return;
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        if (event.type === 'error') throw new Error(event.error);
        if (event.type === 'audio') {
          if (event.sampleRate !== 24000) throw new Error('音频采样率不符合预期。');
          const bytes = Uint8Array.from(atob(event.data), char => char.charCodeAt(0));
          const samples = pcm16ToFloat(bytes);
          if (!samples.length) continue;
          const buffer = this.context.createBuffer(1, samples.length, event.sampleRate);
          buffer.copyToChannel(samples, 0);
          const source = this.context.createBufferSource(); source.buffer = buffer; source.connect(this.context.destination);
          nextTime = Math.max(nextTime, this.context.currentTime + 0.025);
          source.start(nextTime); nextTime += buffer.duration;
          session.sources.add(source); source.onended = () => { session.sources.delete(source); source.disconnect(); };
          if (firstPlaybackMs === undefined) {
            firstPlaybackMs = Math.round(performance.now() - startedAt + 25);
            this.onStatus(`正在朗读「${label}」 · 首段安排播放 ${(firstPlaybackMs / 1000).toFixed(2)} 秒`, true);
          }
        } else if (event.type === 'done') {
          done = true;
          clearTimeout(session.deadline);
          const summary = `「${label}」 · 首段安排播放 ${((firstPlaybackMs || 0) / 1000).toFixed(2)} 秒 · 合成 ${(event.generationMs / 1000).toFixed(2)} 秒`;
          this.onStatus(`正在播放 · ${summary}`, true);
          session.timer = setTimeout(() => {
            if (this.session === session) { this.session = null; this.onStatus(`朗读完成 · ${summary}`, false); }
          }, Math.max(0, (nextTime - this.context.currentTime) * 1000 + 100));
        }
      }
      if (!done) throw new Error('音频连接中断，请重试。');
    } catch (error) {
      if (this.session !== session) return;
      this.stop(error.name === 'AbortError' ? '语音请求已取消。' : error.message);
    }
  }
}
