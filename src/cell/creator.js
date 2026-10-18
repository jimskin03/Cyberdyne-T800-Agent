import {validateCreation} from './creation-model.js';

export function buildCreation(code, {signal} = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException('3D build cancelled.', 'AbortError'));
      return;
    }
    const worker = new Worker(new URL('./creation-worker.js', import.meta.url), {type: 'module'});
    let settled = false;
    const abort = () =>
      finish(signal?.reason ?? new DOMException('3D build cancelled.', 'AbortError'));
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      worker.terminate();
      error ? reject(error) : resolve(value);
    };
    const timer = setTimeout(
      () => finish(Error('3D builder exceeded its 3 second execution limit')),
      3000,
    );
    signal?.addEventListener('abort', abort, {once: true});
    worker.onerror = (e) => finish(Error(e.message || '3D builder failed'));
    worker.onmessage = ({data}) => {
      try {
        if (data.error) throw Error(data.error);
        const object = validateCreation(data.json);
        finish(null, {object, json: data.json});
      } catch (e) {
        finish(e);
      }
    };
    worker.postMessage({code});
  });
}
