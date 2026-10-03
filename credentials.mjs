import { readFile, mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { LookupError } from './provider.mjs';

export const defaultCredentialFile = path.join(homedir(), '.french-shell', 'credentials.json');
function binding(kind, config) {
  if (!['lookup', 'speech'].includes(kind)) throw new LookupError('未知密钥类型。');
  let url;
  try { url = new URL(kind === 'lookup' ? config?.baseUrl : config?.endpoint); } catch { throw new LookupError('请填写有效接口地址。'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new LookupError('密钥只可绑定无凭据或参数的 HTTPS 地址。');
  if (kind === 'lookup' && !['deepseek', 'compatible'].includes(config?.provider)) throw new LookupError('请选择接口类型。');
  return `${kind === 'lookup' ? config.provider : 'qwen-http'}:${url.href.replace(/\/+$/, '')}`;
}
export function createCredentialStore(file = defaultCredentialFile) {
  let queue = Promise.resolve();
  async function read() {
    try {
      const data = JSON.parse(await readFile(file, 'utf8'));
      if (data.schemaVersion !== 1 || !data.keys || typeof data.keys !== 'object') throw new Error();
      return data;
    } catch (error) {
      if (error.code === 'ENOENT') return { schemaVersion: 1, keys: {} };
      throw new LookupError('无法读取本机密钥配置，请检查文件权限或格式。', 503);
    }
  }
  function update(action) {
    const task = queue.then(async () => {
      const data = await read(); action(data.keys);
      if (!Object.keys(data.keys).length) { await rm(file, { force: true }); return; }
      await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
      const temporary = `${file}.${randomUUID()}.tmp`;
      try { await writeFile(temporary, JSON.stringify(data), { mode: 0o600, flag: 'wx' }); await rename(temporary, file); }
      finally { await rm(temporary, { force: true }); }
    }).catch(error => { throw error instanceof LookupError ? error : new LookupError('无法更新本机密钥配置，请检查文件权限。', 503); });
    queue = task.catch(() => {}); return task;
  }
  return {
    async status() {
      await queue; const data = await read();
      return Object.fromEntries(['lookup', 'speech'].map(kind => [kind, data.keys[kind] ? { configured: true, binding: data.keys[kind].binding } : { configured: false }]));
    },
    save(kind, config, key) {
      const bound = binding(kind, config);
      if (typeof key !== 'string' || !key.trim() || key.length > 4096 || /[\r\n]/.test(key)) throw new LookupError('请填写有效密钥后再保存。');
      return update(keys => { keys[kind] = { binding: bound, key: key.trim() }; });
    },
    remove(kind) {
      if (!['lookup', 'speech'].includes(kind)) throw new LookupError('未知密钥类型。');
      return update(keys => { delete keys[kind]; });
    },
    async resolve(kind, config) {
      if (config?.apiKey?.trim()) return config;
      const bound = binding(kind, config); await queue;
      const saved = (await read()).keys[kind];
      if (!saved || saved.binding !== bound) throw new LookupError('此接口没有已保存的密钥，请重新填写并确认。');
      return { ...config, apiKey: saved.key };
    }
  };
}
