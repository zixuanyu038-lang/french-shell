// Incremental framing: HTTP chunks do not necessarily align with UTF-8 or lines.
export async function* readLines(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      pending += done ? decoder.decode() : decoder.decode(value, { stream: true });
      if (pending.length > 2_000_000) throw new Error('音频响应单帧过大。');
      let index;
      while ((index = pending.indexOf('\n')) !== -1) {
        yield pending.slice(0, index).replace(/\r$/, '');
        pending = pending.slice(index + 1);
      }
      if (done) { if (pending) yield pending; return; }
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export async function* readSse(body) {
  let data = [];
  for await (const line of readLines(body)) {
    if (line === '') {
      if (data.length) { yield data.join('\n'); data = []; }
    } else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
  }
  if (data.length) yield data.join('\n');
}

export function pcm16ToFloat(bytes) {
  if (bytes.length % 2) throw new Error('PCM 音频帧不完整。');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const samples = new Float32Array(bytes.length / 2);
  for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(i * 2, true) / 32768;
  return samples;
}
