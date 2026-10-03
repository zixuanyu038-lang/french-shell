export const lookupDefaults = { mode: 'demo', provider: 'deepseek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash' };
export const speechDefaults = { enabled: false, endpoint: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation', model: 'qwen3-tts-flash', voice: 'Cherry', language: 'French' };
export function loadSettings(storage, key, defaults) {
  const result = { ...defaults };
  try {
    const saved = JSON.parse(storage.getItem(key) || 'null');
    for (const field of Object.keys(defaults)) if (typeof saved?.[field] === typeof defaults[field]) result[field] = saved[field];
  } catch { /* Optional settings must never block initialization. */ }
  return result;
}
export function saveSettings(storage, key, value, defaults) {
  const safe = Object.fromEntries(Object.keys(defaults).map(field => [field, value[field] ?? defaults[field]]));
  storage.setItem(key, JSON.stringify(safe));
}
