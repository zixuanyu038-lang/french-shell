export function waitBounded(promise, signal, milliseconds, message) {
  return new Promise((resolve, reject) => {
    let timer;
    const clean = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
    const abort = () => { clean(); reject(signal.reason || new DOMException('取消操作', 'AbortError')); };
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => { clean(); reject(new Error(message)); }, milliseconds);
    Promise.resolve(promise).then(value => { clean(); resolve(value); }, error => { clean(); reject(error); });
  });
}
