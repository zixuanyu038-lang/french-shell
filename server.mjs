import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { lookupRemoteStream, LookupError } from './provider.mjs';
import { speechStream } from './tts.mjs';
import { createCredentialStore, defaultCredentialFile } from './credentials.mjs';

const root = path.resolve(fileURLToPath(new URL('./', import.meta.url)));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp' };
const samePath = (left, right) => path.relative(left, right) === '';
function inside(directory, target) {
  const relative = path.relative(directory, target);
  return relative !== '' && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}
function isStaticPath(target, directory) {
  return samePath(target, path.join(directory, 'index.html')) || inside(path.join(directory, 'src'), target);
}
export function createAppServer({ fetchImpl, credentialFile = process.env.FRENCH_SHELL_CREDENTIAL_FILE ?? defaultCredentialFile, credentialStore = createCredentialStore(credentialFile) } = {}) {
  // An injected store can expose filePath; otherwise pass its private location as credentialFile.
  const privateFiles = [...new Set([credentialFile, credentialStore.filePath].filter(file => typeof file === 'string' && file).map(file => path.resolve(file)))];
  return createServer(async (req, res) => {
    const send = (status, data) => res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }).end(JSON.stringify(data));
    try {
      if (!/^127\.0\.0\.1:\d+$/.test(req.headers.host || '')) { send(403, { error: '仅允许本机访问。' }); return; }
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (['/api/lookup', '/api/speech', '/api/credentials'].includes(pathname)) {
        if (req.method !== 'POST') { send(405, { error: '请使用 POST。' }); return; }
        if ((req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) || !req.headers['content-type']?.startsWith('application/json')) { send(403, { error: '请求来源或格式不符合要求。' }); return; }
        const chunks = []; let size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > 16384) { send(413, { error: '请求过大。' }); return; } chunks.push(chunk); }
        let data;
        try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { send(400, { error: '请求必须是 JSON。' }); return; }
        if (pathname === '/api/credentials') {
          if (req.headers.origin !== `http://${req.headers.host}`) { send(403, { error: '密钥管理仅允许同源页面。' }); return; }
          try {
            if (data.action === 'save') await credentialStore.save(data.kind, data.config, data.apiKey);
            else if (data.action === 'delete') await credentialStore.remove(data.kind);
            else if (data.action !== 'status') throw new LookupError('未知密钥操作。');
            send(200, await credentialStore.status());
          } catch (error) { send(error instanceof LookupError ? error.status : 500, { error: error instanceof LookupError ? error.message : '密钥操作失败。' }); }
          return;
        }
        try { data.config = await credentialStore.resolve(pathname === '/api/lookup' ? 'lookup' : 'speech', data?.config); }
        catch (error) { send(error instanceof LookupError ? error.status : 500, { error: error instanceof LookupError ? error.message : '无法读取密钥。' }); return; }
        const controller = new AbortController();
        res.on('close', () => { if (!res.writableEnded) controller.abort(); });
        const write = async event => {
          if (controller.signal.aborted) throw new Error('cancelled');
          if (!res.headersSent) res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
          if (!res.write(JSON.stringify(event) + '\n')) await new Promise((resolve, reject) => {
            const clean = () => { res.off('drain', drain); res.off('close', close); };
            const drain = () => { clean(); resolve(); };
            const close = () => { clean(); reject(new Error('cancelled')); };
            res.once('drain', drain); res.once('close', close);
          });
        };
        // Both endpoints stream NDJSON, so an error after the first chunk can no
        // longer change the status code and has to arrive as a terminal event.
        const stream = async (source, fallback) => {
          try {
            for await (const event of source) await write(event);
            res.end();
          } catch (error) {
            if (controller.signal.aborted) return;
            const message = error instanceof LookupError ? error.message : fallback;
            if (res.headersSent) { res.end(JSON.stringify({ type: 'error', error: message }) + '\n'); }
            else send(error instanceof LookupError ? error.status : 500, { error: message });
          }
        };
        if (pathname === '/api/speech') {
          await stream(speechStream(data?.text, data?.config, { fetchImpl, signal: controller.signal }), '语音播放失败，请重试。');
          return;
        }
        await stream(lookupRemoteStream(data?.query, data?.config, { fetchImpl, signal: controller.signal }), '查询失败，请重试。');
        return;
      }
      if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
      const target = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!types[path.extname(target)] || !isStaticPath(target, root) || privateFiles.some(file => samePath(file, target))) {
        res.writeHead(404).end('Not found'); return;
      }
      // Check the physical target, not just its URL spelling: links/junctions may leave src.
      const [physicalRoot, physicalTarget] = await Promise.all([realpath(root), realpath(target)]);
      const privateTargets = await Promise.all(privateFiles.map(file => realpath(file).catch(error => {
        if (error.code === 'ENOENT') return file;
        throw error;
      })));
      const type = types[path.extname(physicalTarget)];
      if (!type || !isStaticPath(physicalTarget, physicalRoot) || privateTargets.some(file => samePath(file, physicalTarget))) {
        res.writeHead(404).end('Not found'); return;
      }
      const content = await readFile(physicalTarget);
      res.writeHead(200, { 'Content-Type': type, 'Content-Length': content.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }).end(req.method === 'HEAD' ? undefined : content);
    } catch { res.writeHead(404).end('Not found'); }
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4317);
  createAppServer().listen(port, '127.0.0.1', () => console.log(`French Shell: http://127.0.0.1:${port}`));
}
