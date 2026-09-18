import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as defaultQueryApi from '../query/index.mjs';
import { isSeerQueryError, queryError } from '../query/errors.mjs';
import { KISURRA_LONGITUDE } from '../query/observer.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_API_DIR = path.resolve(here, '..', 'api');
const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;

const JSON_TYPE = 'application/json; charset=utf-8';
const NDJSON_TYPE = 'application/x-ndjson; charset=utf-8';
const CSV_TYPE = 'text/csv; charset=utf-8';
const YAML_TYPE = 'application/yaml; charset=utf-8';

const DATE_GET_KEYS = new Set([
  'target', 'targetJdn', 'offsetDays',
  'calculationAt', 'calculationJdn',
  'observer', 'longitude', 'latitude', 'elevationMeters',
  'locale', 'presentation', 'include',
]);
const NOW_GET_KEYS = new Set(['observer', 'longitude', 'latitude', 'elevationMeters', 'locale', 'presentation', 'include']);
const YEAR_GET_KEYS = new Set(['calculationAt', 'calculationJdn', 'observer', 'longitude', 'latitude', 'elevationMeters', 'locale', 'presentation', 'include']);
const CALC_DAY_GET_KEYS = new Set(['at', 'observer', 'longitude', 'latitude', 'elevationMeters', 'include']);
const DOCUMENTED_NOOP_QUERY_KEYS = new Set(['latitude', 'elevationMeters']);

const STATUS_BY_CODE = new Map([
  ['INVALID_JSON', 400],
  ['UNKNOWN_PARAMETER', 400],
  ['DUPLICATE_PARAMETER', 400],
  ['MISSING_CALCULATION_SELECTOR', 400],
  ['CONFLICTING_CALCULATION', 400],
  ['MISSING_TARGET_SELECTOR', 400],
  ['MISSING_PASTAFARIAN_DATE', 400],
  ['AMBIGUOUS_TARGET', 400],
  ['AMBIGUOUS_OBSERVER', 400],
  ['INVALID_OBSERVER', 400],
  ['DUPLICATE_BATCH_ID', 400],
  ['UNSUPPORTED_PRESENTATION', 400],
  ['UNSUPPORTED_INCLUDE', 400],
  ['AMBIGUOUS_RANGE_END', 400],
  ['MISSING_RANGE_END', 400],
  ['INVALID_INTEGER', 422],
  ['INVALID_JDN', 422],
  ['INVALID_GREGORIAN_DATE', 422],
  ['INVALID_INSTANT', 422],
  ['INVALID_LONGITUDE', 422],
  ['OBSERVER_PRESET_NOT_SUPPORTED', 422],
  ['INVALID_RANGE_COUNT', 422],
  ['INVALID_RANGE_STEP', 422],
  ['UNREACHABLE_RANGE_END', 422],
  ['CALCULATION_OUT_OF_SUPPORTED_DOMAIN', 422],
  ['TARGET_OUT_OF_SUPPORTED_DOMAIN', 422],
  ['YEAR_OUT_OF_SUPPORTED_DOMAIN', 422],
  ['INVALID_PASTAFARIAN_DATE', 422],
  ['PASTAFARIAN_DATE_NOT_IN_YEAR', 422],
  ['PASTAFARIAN_DATE_CONFLICT', 422],
  ['LOCALE_NOT_SUPPORTED', 406],
  ['REQUEST_TOO_LARGE', 413],
  ['SEER_UNAVAILABLE', 503],
  ['INTERNAL_ERROR', 500],
]);

class HttpAdapterError extends Error {
  constructor(code, message, status, { field } = {}) {
    super(message);
    this.name = 'HttpAdapterError';
    this.code = code;
    this.status = status;
    if (field !== undefined) this.field = field;
  }
}

function corsHeaders() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'Accept, Content-Type',
    'access-control-max-age': '86400',
    'x-content-type-options': 'nosniff',
  };
}

function send(res, status, body = '', contentType = null, extraHeaders = {}) {
  const headers = { ...corsHeaders(), ...extraHeaders };
  if (contentType) headers['content-type'] = contentType;
  headers['content-length'] = Buffer.byteLength(body);
  res.writeHead(status, headers);
  res.end(body);
}

function sendJson(res, status, value, extraHeaders = {}) {
  send(res, status, `${JSON.stringify(value)}\n`, JSON_TYPE, extraHeaders);
}

function publicError(error) {
  return {
    error: {
      code: error.code ?? 'INTERNAL_ERROR',
      message: error.message ?? 'Internal server error.',
      ...(error.field !== undefined ? { field: error.field } : {}),
    },
  };
}

function statusForError(error) {
  if (error instanceof HttpAdapterError) return error.status;
  if (isSeerQueryError(error)) return STATUS_BY_CODE.get(error.code) ?? 500;
  return 500;
}

function ensureKnownParams(searchParams, allowed) {
  for (const key of searchParams.keys()) {
    if (!allowed.has(key)) {
      throw new HttpAdapterError('UNKNOWN_PARAMETER', `Unknown query parameter: ${key}.`, 400, { field: key });
    }
  }
  for (const key of allowed) {
    if (DOCUMENTED_NOOP_QUERY_KEYS.has(key)) continue;
    if (searchParams.getAll(key).length > 1) {
      throw new HttpAdapterError('DUPLICATE_PARAMETER', `Query parameter appears more than once: ${key}.`, 400, { field: key });
    }
  }
}

function one(searchParams, key) {
  const values = searchParams.getAll(key);
  return values.length ? values[0] : undefined;
}

function parseLongitudeText(value) {
  if (value === undefined) return undefined;
  if (!/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/.test(value)) {
    throw queryError('INVALID_LONGITUDE', 'longitude must be a finite decimal number.', { field: 'longitude' });
  }
  const number = Number(value);
  if (!Number.isFinite(number)) throw queryError('INVALID_LONGITUDE', 'longitude must be finite.', { field: 'longitude' });
  return number;
}

function parseInclude(value) {
  if (value === undefined) return undefined;
  return value.split(',').map((part) => part.trim());
}

function observerFromGet(searchParams) {
  const preset = one(searchParams, 'observer');
  const longitudeText = one(searchParams, 'longitude');
  if (preset === undefined && longitudeText === undefined) return undefined;
  return {
    ...(preset !== undefined ? { preset } : {}),
    ...(longitudeText !== undefined ? { longitude: parseLongitudeText(longitudeText) } : {}),
  };
}

function commonPresentationFromGet(searchParams) {
  return {
    ...(one(searchParams, 'locale') !== undefined ? { locale: one(searchParams, 'locale') } : {}),
    ...(one(searchParams, 'presentation') !== undefined ? { presentation: one(searchParams, 'presentation') } : {}),
    ...(one(searchParams, 'include') !== undefined ? { include: parseInclude(one(searchParams, 'include')) } : {}),
  };
}

function dateRequestFromGet(searchParams, { nowOnly = false } = {}) {
  ensureKnownParams(searchParams, nowOnly ? NOW_GET_KEYS : DATE_GET_KEYS);
  const request = { ...commonPresentationFromGet(searchParams) };
  const observer = observerFromGet(searchParams);
  if (observer !== undefined) request.observer = observer;
  if (nowOnly) return request;

  const target = {};
  if (one(searchParams, 'target') !== undefined) target.gregorian = one(searchParams, 'target');
  if (one(searchParams, 'targetJdn') !== undefined) target.jdn = one(searchParams, 'targetJdn');
  if (one(searchParams, 'offsetDays') !== undefined) target.offsetDays = one(searchParams, 'offsetDays');
  if (Object.keys(target).length) request.target = target;

  const calculation = {};
  if (one(searchParams, 'calculationAt') !== undefined) calculation.at = one(searchParams, 'calculationAt');
  if (one(searchParams, 'calculationJdn') !== undefined) calculation.jdn = one(searchParams, 'calculationJdn');
  if (Object.keys(calculation).length) request.calculation = calculation;
  return request;
}

function yearRequestFromGet(searchParams) {
  ensureKnownParams(searchParams, YEAR_GET_KEYS);
  const request = { ...commonPresentationFromGet(searchParams) };
  const observer = observerFromGet(searchParams);
  if (observer !== undefined) request.observer = observer;
  const calculation = {};
  if (one(searchParams, 'calculationAt') !== undefined) calculation.at = one(searchParams, 'calculationAt');
  if (one(searchParams, 'calculationJdn') !== undefined) calculation.jdn = one(searchParams, 'calculationJdn');
  if (Object.keys(calculation).length) request.calculation = calculation;
  return request;
}

function calculationDayRequestFromGet(searchParams) {
  ensureKnownParams(searchParams, CALC_DAY_GET_KEYS);
  const request = {};
  const observer = observerFromGet(searchParams);
  if (observer !== undefined) request.observer = observer;
  if (one(searchParams, 'at') !== undefined) request.at = one(searchParams, 'at');
  if (one(searchParams, 'include') !== undefined) request.include = parseInclude(one(searchParams, 'include'));
  return request;
}

function ensureNoQuery(searchParams) {
  for (const key of searchParams.keys()) {
    throw new HttpAdapterError('UNKNOWN_PARAMETER', `This endpoint does not accept query parameter: ${key}.`, 400, { field: key });
  }
}

async function readJsonBody(req, maxBytes) {
  const contentType = String(req.headers['content-type'] ?? '').toLowerCase();
  if (!/^application\/json(?:\s*;|$)/.test(contentType)) {
    throw new HttpAdapterError('UNSUPPORTED_MEDIA_TYPE', 'POST requests require Content-Type: application/json.', 415);
  }
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new HttpAdapterError('REQUEST_TOO_LARGE', `Request body exceeds ${maxBytes} bytes.`, 413);
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new HttpAdapterError('REQUEST_TOO_LARGE', `Request body exceeds ${maxBytes} bytes.`, 413);
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text.trim()) throw new HttpAdapterError('INVALID_JSON', 'Request body must contain a JSON value.', 400);
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpAdapterError('INVALID_JSON', 'Request body is not valid JSON.', 400);
  }
}

function parseAccept(header) {
  if (!header || !header.trim()) return [{ type: '*/*', q: 1, order: 0 }];
  return header.split(',').map((raw, order) => {
    const [typePart, ...params] = raw.trim().split(';');
    let q = 1;
    for (const param of params) {
      const match = /^\s*q=([0-9.]+)\s*$/i.exec(param);
      if (match) q = Number(match[1]);
    }
    return { type: typePart.toLowerCase(), q: Number.isFinite(q) ? q : 0, order };
  }).filter((item) => item.q > 0).sort((a, b) => b.q - a.q || a.order - b.order);
}

function negotiate(req, supported, fallback) {
  for (const item of parseAccept(req.headers.accept)) {
    if (item.type === '*/*') return fallback;
    for (const type of supported) {
      if (item.type === type) return type;
      const [major] = type.split('/');
      if (item.type === `${major}/*`) return type;
    }
  }
  throw new HttpAdapterError('NOT_ACCEPTABLE', `Supported response types: ${supported.join(', ')}.`, 406);
}

function csvCell(value) {
  const text = value === undefined || value === null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function rangeCsv(results) {
  const columns = [
    'calculationAt', 'calculationJdn', 'observerLongitude', 'targetJdn',
    'gregorianEra', 'gregorianYear', 'gregorianMonth', 'gregorianDay',
    'pastafarianYear', 'cutletCanonicalIndex', 'cutletName', 'dayInCutlet',
    'monthCanonicalIndex', 'monthName', 'dayInMonth', 'locale', 'formatted',
    'structureJson', 'boundariesJson', 'provenanceJson', 'resolutionJson',
  ];
  const lines = [columns.join(',')];
  for (const item of results) {
    const row = [
      item.calculationAt,
      item.calculationDay?.jdn,
      item.observer?.longitude,
      item.targetDay?.jdn,
      item.targetDay?.gregorian?.era,
      item.targetDay?.gregorian?.year,
      item.targetDay?.gregorian?.month,
      item.targetDay?.gregorian?.day,
      item.pastafarianDate?.year,
      item.pastafarianDate?.cutlet?.canonicalIndex,
      item.pastafarianDate?.cutlet?.name,
      item.pastafarianDate?.cutlet?.day,
      item.pastafarianDate?.month?.canonicalIndex,
      item.pastafarianDate?.month?.name,
      item.pastafarianDate?.month?.day,
      item.locale,
      item.formatted,
      item.structure === undefined ? '' : JSON.stringify(item.structure),
      item.boundaries === undefined ? '' : JSON.stringify(item.boundaries),
      item.provenance === undefined ? '' : JSON.stringify(item.provenance),
      item.resolution === undefined ? '' : JSON.stringify(item.resolution),
    ];
    lines.push(row.map(csvCell).join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}

function rangeNdjson(results) {
  return results.map((item) => JSON.stringify(item)).join('\n') + (results.length ? '\n' : '');
}

function knownPath(pathname) {
  return pathname === '/v1/now' || pathname === '/v1/date' || pathname === '/v1/batch' ||
    pathname === '/v1/range' || pathname === '/v1/reverse' || pathname === '/v1/calculation-day' || pathname === '/v1/locales' ||
    pathname === '/v1/meta' || pathname === '/v1/status' || pathname === '/openapi.json' ||
    pathname === '/openapi.yaml' || /^\/v1\/year\/[^/]+$/.test(pathname);
}

export function createSeerHttpHandler(options = {}) {
  const queryApi = options.queryApi ?? defaultQueryApi;
  const apiDir = options.apiDir ?? DEFAULT_API_DIR;
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  const nowFactory = options.nowFactory ?? (() => new Date());
  const logger = options.logger ?? console;
  const baseQueryOptions = options.queryOptions ?? {};

  return async function seerHttpHandler(req, res) {
    const requestInstant = nowFactory();
    try {
      const url = new URL(req.url ?? '/', 'http://seer.invalid');
      const pathname = url.pathname;
      const method = String(req.method ?? 'GET').toUpperCase();
      if (method === 'OPTIONS') {
        send(res, 204, '', null);
        return;
      }
      if (!knownPath(pathname)) throw new HttpAdapterError('NOT_FOUND', 'Endpoint not found.', 404);

      const queryOptions = { ...baseQueryOptions, now: requestInstant };

      if (pathname === '/openapi.json' && method === 'GET') {
        ensureNoQuery(url.searchParams);
        const body = await readFile(path.join(apiDir, 'openapi.json'), 'utf8');
        send(res, 200, body.endsWith('\n') ? body : `${body}\n`, JSON_TYPE, { 'cache-control': 'public, max-age=300' });
        return;
      }
      if (pathname === '/openapi.yaml' && method === 'GET') {
        ensureNoQuery(url.searchParams);
        const body = await readFile(path.join(apiDir, 'openapi.yaml'), 'utf8');
        send(res, 200, body.endsWith('\n') ? body : `${body}\n`, YAML_TYPE, { 'cache-control': 'public, max-age=300' });
        return;
      }

      if (pathname === '/v1/locales' && method === 'GET') {
        ensureNoQuery(url.searchParams);
        negotiate(req, ['application/json'], 'application/json');
        sendJson(res, 200, { locales: [{ tag: 'en', name: 'English', direction: 'ltr' }] }, { 'cache-control': 'public, max-age=300' });
        return;
      }
      if (pathname === '/v1/meta' && method === 'GET') {
        ensureNoQuery(url.searchParams);
        negotiate(req, ['application/json'], 'application/json');
        sendJson(res, 200, {
          apiVersion: 'v1',
          presentations: ['full', 'canonical'],
          includes: ['structure', 'boundaries', 'provenance', 'resolution'],
          observerPresets: [{ id: 'kisurra', longitude: KISURRA_LONGITUDE }],
          reverse: { status: 'implemented', endpoint: '/v1/reverse', requiresCompleteTuple: true },
        }, { 'cache-control': 'public, max-age=300' });
        return;
      }
      if (pathname === '/v1/status' && method === 'GET') {
        ensureNoQuery(url.searchParams);
        negotiate(req, ['application/json'], 'application/json');
        try {
          await queryApi.queryDate({}, queryOptions);
          sendJson(res, 200, { status: 'ok' }, { 'cache-control': 'no-store' });
        } catch {
          sendJson(res, 503, { status: 'unavailable' }, { 'cache-control': 'no-store' });
        }
        return;
      }

      if (pathname === '/v1/now' && method === 'GET') {
        negotiate(req, ['application/json'], 'application/json');
        const result = await queryApi.queryDate(dateRequestFromGet(url.searchParams, { nowOnly: true }), queryOptions);
        sendJson(res, 200, result, { 'cache-control': 'no-store' });
        return;
      }
      if (pathname === '/v1/date' && method === 'GET') {
        negotiate(req, ['application/json'], 'application/json');
        const result = await queryApi.queryDate(dateRequestFromGet(url.searchParams), queryOptions);
        sendJson(res, 200, result, { 'cache-control': 'no-store' });
        return;
      }
      if (pathname === '/v1/date' && method === 'POST') {
        ensureNoQuery(url.searchParams);
        negotiate(req, ['application/json'], 'application/json');
        const body = await readJsonBody(req, maxBodyBytes);
        const result = await queryApi.queryDate(body, queryOptions);
        sendJson(res, 200, result, { 'cache-control': 'no-store' });
        return;
      }
      if (pathname === '/v1/batch' && method === 'POST') {
        ensureNoQuery(url.searchParams);
        negotiate(req, ['application/json'], 'application/json');
        const body = await readJsonBody(req, maxBodyBytes);
        const result = await queryApi.queryBatch(body, queryOptions);
        sendJson(res, 200, result, { 'cache-control': 'no-store' });
        return;
      }
      if (pathname === '/v1/range' && method === 'POST') {
        ensureNoQuery(url.searchParams);
        const media = negotiate(req, ['application/json', 'application/x-ndjson', 'text/csv'], 'application/json');
        const body = await readJsonBody(req, maxBodyBytes);
        const result = await queryApi.queryRange(body, queryOptions);
        if (media === 'application/x-ndjson') send(res, 200, rangeNdjson(result.results), NDJSON_TYPE, { 'cache-control': 'no-store' });
        else if (media === 'text/csv') send(res, 200, rangeCsv(result.results), CSV_TYPE, { 'cache-control': 'no-store' });
        else sendJson(res, 200, result, { 'cache-control': 'no-store' });
        return;
      }
      if (pathname === '/v1/reverse' && method === 'POST') {
        ensureNoQuery(url.searchParams);
        negotiate(req, ['application/json'], 'application/json');
        const body = await readJsonBody(req, maxBodyBytes);
        const result = await queryApi.queryReverse(body, queryOptions);
        sendJson(res, 200, result, { 'cache-control': 'no-store' });
        return;
      }
      if (pathname === '/v1/calculation-day' && method === 'GET') {
        negotiate(req, ['application/json'], 'application/json');
        const result = await queryApi.queryCalculationDay(calculationDayRequestFromGet(url.searchParams), queryOptions);
        sendJson(res, 200, result, { 'cache-control': 'no-store' });
        return;
      }
      const yearMatch = /^\/v1\/year\/([^/]+)$/.exec(pathname);
      if (yearMatch && method === 'GET') {
        negotiate(req, ['application/json'], 'application/json');
        const yearInput = decodeURIComponent(yearMatch[1]);
        const result = await queryApi.queryYear(yearInput, yearRequestFromGet(url.searchParams), queryOptions);
        sendJson(res, 200, result, { 'cache-control': 'no-store' });
        return;
      }

      throw new HttpAdapterError('METHOD_NOT_ALLOWED', 'Method not allowed for this endpoint.', 405);
    } catch (error) {
      const status = statusForError(error);
      if (status === 500 && !isSeerQueryError(error) && !(error instanceof HttpAdapterError)) {
        logger.error?.('Seer HTTP internal error', error);
        sendJson(res, 500, { error: { code: 'INTERNAL_ERROR', message: 'Internal server error.' } }, { 'cache-control': 'no-store' });
        return;
      }
      sendJson(res, status, publicError(error), {
        'cache-control': 'no-store',
        ...(status === 405 ? { allow: 'GET, POST, OPTIONS' } : {}),
      });
    }
  };
}
