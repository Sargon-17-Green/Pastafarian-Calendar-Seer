export class SeerClientError extends Error {
  constructor(message, { status = 0, code, field, details, response } = {}) {
    super(message);
    this.name = 'SeerClientError';
    this.status = status;
    if (code !== undefined) this.code = code;
    if (field !== undefined) this.field = field;
    if (details !== undefined) this.details = details;
    if (response !== undefined) this.response = response;
  }
}

function basePath(baseUrl, pathname) {
  const base = String(baseUrl ?? '').replace(/\/+$/, '');
  return `${base}${pathname}`;
}

function add(params, key, value) {
  if (value !== undefined && value !== null) params.set(key, String(value));
}

function addObserver(params, observer) {
  if (observer === undefined || observer === null) return;
  if (typeof observer === 'string') {
    add(params, 'observer', observer);
    return;
  }
  if (typeof observer !== 'object' || Array.isArray(observer)) {
    throw new TypeError('observer must be a preset string or object.');
  }
  add(params, 'observer', observer.preset);
  add(params, 'longitude', observer.longitude);
  add(params, 'latitude', observer.latitude);
  add(params, 'elevationMeters', observer.elevationMeters);
}

function addCommon(params, request) {
  addObserver(params, request?.observer);
  add(params, 'locale', request?.locale);
  add(params, 'presentation', request?.presentation);
  if (request?.include !== undefined) {
    if (!Array.isArray(request.include)) throw new TypeError('include must be an array.');
    add(params, 'include', request.include.join(','));
  }
}

function querySuffix(params) {
  const text = params.toString();
  return text ? `?${text}` : '';
}

async function parseBody(response) {
  const text = await response.text();
  if (!text) return null;
  const type = String(response.headers?.get?.('content-type') ?? '').toLowerCase();
  if (type.includes('json')) {
    try { return JSON.parse(text); } catch { return text; }
  }
  return text;
}
async function checkedFetch(fetchImpl, url, init) {
  const response = await fetchImpl(url, init);
  const body = await parseBody(response);
  if (response.ok) return body;
  const serverError = body && typeof body === 'object' ? body.error : null;
  throw new SeerClientError(
    serverError?.message ?? `Seer HTTP request failed with status ${response.status}.`,
    {
      status: response.status,
      code: serverError?.code,
      field: serverError?.field,
      details: serverError?.details,
      response: body,
    },
  );
}

function jsonPost(fetchImpl, baseUrl, pathname, request) {
  return checkedFetch(fetchImpl, basePath(baseUrl, pathname), {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(request ?? {}),
  });
}

function jsonGet(fetchImpl, baseUrl, pathname, params = new URLSearchParams()) {
  return checkedFetch(fetchImpl, `${basePath(baseUrl, pathname)}${querySuffix(params)}`, {
    method: 'GET',
    headers: { accept: 'application/json' },
  });
}
function nowParams(request = {}) {
  const params = new URLSearchParams();
  addCommon(params, request);
  return params;
}

function yearParams(request = {}) {
  const params = new URLSearchParams();
  addCommon(params, request);
  add(params, 'calculationAt', request?.calculation?.at);
  add(params, 'calculationJdn', request?.calculation?.jdn);
  return params;
}

function calculationDayParams(request = {}) {
  const params = new URLSearchParams();
  addObserver(params, request?.observer);
  add(params, 'at', request?.at);
  if (request?.include !== undefined) {
    if (!Array.isArray(request.include)) throw new TypeError('include must be an array.');
    add(params, 'include', request.include.join(','));
  }
  return params;
}

export function createSeerClient(baseUrl = '', options = {}) {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new TypeError('A fetch implementation is required.');
  const fixedBase = String(baseUrl ?? '').replace(/\/+$/, '');

  return Object.freeze({
    baseUrl: fixedBase,
    queryDate(request = {}) {
      return jsonPost(fetchImpl, fixedBase, '/v1/date', request);
    },
    queryNow(request = {}) {
      return jsonGet(fetchImpl, fixedBase, '/v1/now', nowParams(request));
    },
    queryBatch(request) {
      return jsonPost(fetchImpl, fixedBase, '/v1/batch', request);
    },
    queryRange(request) {
      return jsonPost(fetchImpl, fixedBase, '/v1/range', request);
    },
    queryReverse(request) {
      return jsonPost(fetchImpl, fixedBase, '/v1/reverse', request);
    },
    queryCalculationDay(request = {}) {
      return jsonGet(fetchImpl, fixedBase, '/v1/calculation-day', calculationDayParams(request));
    },
    queryYear(year, request = {}) {
      if (year === undefined || year === null || String(year).length === 0) {
        throw new TypeError('year is required.');
      }
      return jsonGet(fetchImpl, fixedBase, `/v1/year/${encodeURIComponent(String(year))}`, yearParams(request));
    },
    getLocales() {
      return jsonGet(fetchImpl, fixedBase, '/v1/locales');
    },
    getMeta() {
      return jsonGet(fetchImpl, fixedBase, '/v1/meta');
    },
    getStatus() {
      return jsonGet(fetchImpl, fixedBase, '/v1/status');
    },
    getOpenApi() {
      return jsonGet(fetchImpl, fixedBase, '/openapi.json');
    },
  });
}
