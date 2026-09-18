import { createSeerClient, SeerClientError } from '../client/index.mjs';

function parseJsonMaybe(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function createTracedSeerClient(apiBase, options = {}) {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new TypeError('A fetch implementation is required.');
  const onTrace = typeof options.onTrace === 'function' ? options.onTrace : () => {};
  const signal = options.signal;

  const tracedFetch = async (url, init = {}) => {
    const method = String(init.method ?? 'GET').toUpperCase();
    const requestText = typeof init.body === 'string' ? init.body : null;
    const trace = {
      method,
      url: String(url),
      request: requestText ? parseJsonMaybe(requestText) : null,
      startedAt: new Date().toISOString(),
    };
    try {
      const response = await fetchImpl(url, { ...init, ...(signal ? { signal } : {}) });
      const responseText = await response.clone().text();
      trace.status = response.status;
      trace.ok = response.ok;
      trace.response = parseJsonMaybe(responseText);
      onTrace(Object.freeze({ ...trace }));
      return response;
    } catch (error) {
      trace.status = 0;
      trace.ok = false;
      trace.networkError = error instanceof Error ? error.message : String(error);
      onTrace(Object.freeze({ ...trace }));
      throw error;
    }
  };

  return createSeerClient(apiBase, { fetch: tracedFetch });
}

export { SeerClientError };
