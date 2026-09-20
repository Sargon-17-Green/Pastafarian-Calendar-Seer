import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const REQUEST_ID_HEADER = 'X-Request-ID';
export const CORS_EXPOSE_HEADERS = REQUEST_ID_HEADER;

let packageVersion = 'unknown';
try {
  const parsed = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  if (typeof parsed.version === 'string' && parsed.version) packageVersion = parsed.version;
} catch {
  // Package metadata is optional in unusual embedding environments.
}

const RELEASE_ENV = Object.freeze({
  releaseTag: 'SEER_RELEASE_TAG',
  commit: 'SEER_RELEASE_COMMIT',
  engineFingerprint: 'SEER_ENGINE_FINGERPRINT',
  cacheRevision: 'SEER_CACHE_REVISION',
});

export function generateRequestId() {
  return randomBytes(18).toString('base64url');
}
export function defaultReleaseIdentity(env = process.env) {
  const identity = { packageVersion };
  for (const [key, name] of Object.entries(RELEASE_ENV)) {
    const value = String(env?.[name] ?? '').trim();
    if (value) identity[key] = value;
  }
  return Object.freeze(identity);
}

function safeReleaseIdentity(value) {
  const out = {};
  for (const key of ['packageVersion', 'releaseTag', 'commit', 'engineFingerprint', 'cacheRevision']) {
    const item = value?.[key];
    if (typeof item === 'string' && item) out[key] = item;
  }
  return Object.freeze(out);
}

export function routeTemplateFor(pathname) {
  if (/^\/v1\/year\/[^/]+$/.test(pathname)) return '/v1/year/{year}';
  if (/^\/schemas\/[A-Za-z0-9.-]+\.schema\.json$/.test(pathname)) return '/schemas/{schema}';
  if (pathname === '/' || pathname === '/web' || pathname.startsWith('/web/')) return '/web/*';
  if (pathname === '/client/index.mjs') return '/client/index.mjs';
  const fixed = new Set([
    '/v1/now', '/v1/date', '/v1/batch', '/v1/range', '/v1/reverse',
    '/v1/calculation-day', '/v1/locales', '/v1/meta', '/v1/status',
    '/_health/live', '/_health/ready', '/openapi.json', '/openapi.yaml',
  ]);
  return fixed.has(pathname) ? pathname : 'unmatched';
}

export function resourceClassFor(route) {
  if (route.startsWith('/_health/') || route === '/v1/status') return 'health';
  if (route === '/v1/meta' || route === '/v1/locales' || route.startsWith('/openapi') || route.startsWith('/schemas/')) return 'metadata';
  if (route === '/v1/date' || route === '/v1/now') return 'exact-single';
  if (route === '/v1/batch' || route === '/v1/range') return 'exact-bulk';
  if (route === '/v1/year/{year}') return 'exact-year';
  if (route === '/v1/reverse') return 'reverse';
  if (route === '/v1/calculation-day') return 'calculation-day';
  if (route === '/web/*' || route === '/client/index.mjs') return 'static';
  return 'unknown';
}

export function createStructuredLogger(sink = console) {
  function emit(level, record) {
    try {
      const fn = sink?.[level] ?? sink?.log;
      if (typeof fn === 'function') fn.call(sink, record);
    } catch {
      // Logging is fail-open.
    }
  }
  return Object.freeze({
    info(record) { emit('info', record); },
    error(record) { emit('error', record); },
  });
}

export function createMetricsHooks(sink = {}) {
  function emit(kind, name, value, attributes = {}) {
    try {
      const fn = sink?.[kind];
      if (typeof fn !== 'function') return;
      const result = fn.call(sink, name, value, Object.freeze({ ...attributes }));
      if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch {
      // Metrics are fail-open.
    }
  }
  return Object.freeze({
    counter(name, value = 1, attributes) { emit('counter', name, value, attributes); },
    histogram(name, value, attributes) { emit('histogram', name, value, attributes); },
    gauge(name, value, attributes) { emit('gauge', name, value, attributes); },
  });
}

export function createQueryTelemetry(metrics) {
  return Object.freeze({
    cache(event) {
      metrics.counter('seer.cache.count', 1, { outcome: event.outcome });
    },
    exactWork(event) {
      metrics.counter('seer.exact.work', event.items ?? 1, {
        operation: event.operation ?? 'unknown',
        unit: event.unit ?? 'item',
      });
    },
    queue(event) {
      const attrs = { scope: event.scope ?? 'unknown' };
      metrics.gauge('seer.queue.depth', event.queued ?? 0, attrs);
      metrics.gauge('seer.queue.active', event.active ?? 0, attrs);
      metrics.gauge('seer.queue.saturated', event.saturated ? 1 : 0, attrs);
      if (event.rejected) metrics.counter('seer.saturation.count', 1, attrs);
    },
    error(event) {
      metrics.counter('seer.error.count', 1, {
        code: event.code ?? 'UNKNOWN',
        scope: event.scope ?? 'query',
      });
    },
  });
}

export function beginHttpRequest({
  req,
  res,
  logger,
  metrics,
  releaseIdentity,
  requestIdFactory = generateRequestId,
  clock = () => process.hrtime.bigint(),
}) {
  let requestId;
  try { requestId = String(requestIdFactory()); } catch { requestId = generateRequestId(); }
  if (!requestId || requestId.length > 128) requestId = generateRequestId();
  res.setHeader(REQUEST_ID_HEADER, requestId);

  const started = clock();
  const method = String(req.method ?? 'GET').toUpperCase();
  const release = safeReleaseIdentity(releaseIdentity);
  let route = 'unmatched';
  let resourceClass = 'unknown';
  let errorCode = null;
  let explicitOutcome = null;
  let finished = false;

  function setRoute(pathname) {
    route = routeTemplateFor(pathname);
    resourceClass = resourceClassFor(route);
  }

  function markError(code, outcome = 'error') {
    errorCode = typeof code === 'string' && code ? code : 'INTERNAL_ERROR';
    explicitOutcome = outcome;
  }

  function markOutcome(outcome) {
    explicitOutcome = outcome;
  }

  function complete(status = res.statusCode) {
    if (finished) return;
    finished = true;
    const latencyMs = Number(clock() - started) / 1e6;
    const numericStatus = Number.isInteger(status) ? status : 500;
    const outcome = explicitOutcome ?? (numericStatus >= 400 ? 'error' : 'success');
    const typedCode = errorCode ?? (numericStatus >= 400 ? `HTTP_${numericStatus}` : null);
    const attributes = {
      method,
      route,
      status: numericStatus,
      resourceClass,
      outcome,
      ...(typedCode ? { errorCode: typedCode } : {}),
    };
    const record = {
      event: 'http.request',
      requestId,
      ...attributes,
      latencyMs,
      release,
    };
    (numericStatus >= 500 ? logger.error : logger.info)(record);
    metrics.counter('http.request.count', 1, attributes);
    metrics.histogram('http.request.latency_ms', latencyMs, attributes);
    if (typedCode) metrics.counter('http.error.count', 1, {
      method, route, status: numericStatus, resourceClass, errorCode: typedCode,
    });
  }
  res.once?.('finish', () => complete());
  res.once?.('close', () => {
    if (!finished && !res.writableFinished) {
      markError('CLIENT_DISCONNECTED', 'aborted');
      complete(res.headersSent ? res.statusCode : 499);
    }
  });

  return Object.freeze({
    requestId,
    setRoute,
    markError,
    markOutcome,
    complete,
    queryTelemetry: createQueryTelemetry(metrics),
  });
}
