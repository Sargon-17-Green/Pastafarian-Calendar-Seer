import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseExactInteger, exactIntegerString } from './exact-integer.mjs';
import { gregorianToJdn, jdnToGregorian } from './gregorian.mjs';
import { resolveObserver } from './observer.mjs';
import { DEFAULT_LOCALE, getLocalePack, listLocales, localizedName } from './locales/catalog.mjs';
import { queryError, SeerQueryError } from './errors.mjs';
import { defaultDayBoundaryService } from './day-boundary.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeRoot = path.resolve(here, '..');
export const DEFAULT_GENERATED_DIR = path.join(runtimeRoot, 'generated');

const DATE_KEYS = new Set(['observer', 'calculation', 'target', 'locale', 'presentation', 'include']);
const CALC_KEYS = new Set(['jdn', 'at']);
const TARGET_KEYS = new Set(['jdn', 'gregorian', 'offsetDays']);
const DATE_INCLUDES = new Set(['structure', 'boundaries', 'provenance', 'resolution']);
const BATCH_KEYS = new Set(['defaults', 'queries']);
const BATCH_DEFAULT_KEYS = new Set(['observer', 'calculation', 'locale', 'presentation', 'include']);
const BATCH_ITEM_KEYS = new Set(['id', ...DATE_KEYS]);
const RANGE_KEYS = new Set(['observer', 'calculation', 'start', 'count', 'endInclusive', 'stepDays', 'calculationMode', 'locale', 'presentation', 'include']);
const CALCULATION_DAY_KEYS = new Set(['at', 'observer', 'include']);
const CALCULATION_DAY_INCLUDES = new Set(['boundaries']);
const YEAR_KEYS = new Set(['observer', 'calculation', 'locale', 'presentation', 'include']);
const YEAR_INCLUDES = new Set(['days', 'provenance', 'resolution']);
const REVERSE_KEYS = new Set(['observer', 'calculation', 'pastafarianDate', 'locale', 'presentation', 'include']);
const PASTAFARIAN_DATE_KEYS = new Set(['year', 'cutlet', 'month']);
const PASTAFARIAN_COORD_KEYS = new Set(['canonicalIndex', 'day']);
const DEFAULT_MAX_BATCH_ITEMS = 10_000;
const DEFAULT_MAX_RANGE_ITEMS = 10_000;

function own(object, key) { return Object.prototype.hasOwnProperty.call(object, key); }
function parseRangeCount(value, maxItems) {
  if (typeof value === 'string' && /^(?:0|[1-9][0-9]*)$/.test(value)) {
    if (value === '0') throw queryError('INVALID_RANGE_COUNT', 'count must be positive.', { field: 'count' });
    const limit = maxItems.toString();
    if (value.length > limit.length || (value.length === limit.length && value > limit)) {
      throw queryError('REQUEST_TOO_LARGE', `Range exceeds the configured limit of ${maxItems} items.`, { field: 'count' });
    }
  }
  const count = parseExactInteger(value, 'count');
  if (count <= 0n) throw queryError('INVALID_RANGE_COUNT', 'count must be positive.', { field: 'count' });
  return count;
}
function assertObject(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw queryError('UNKNOWN_PARAMETER', `${field} must be an object.`, { field });
  }
}
function rejectUnknown(object, allowed, prefix = '') {
  for (const key of Object.keys(object)) if (!allowed.has(key)) {
    throw queryError('UNKNOWN_PARAMETER', `Unknown field: ${prefix}${key}.`, { field: `${prefix}${key}` });
  }
}
function parseInstant(value, field) {
  if (typeof value !== 'string' || !/(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(value)) {
    throw queryError('INVALID_INSTANT', `${field} must be an RFC 3339 timestamp with an explicit UTC offset.`, { field });
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw queryError('INVALID_INSTANT', `${field} is not a valid timestamp.`, { field });
  return date;
}
function requestNow(options = {}) {
  const now = options.now instanceof Date ? new Date(options.now) : options.now === undefined ? new Date() : new Date(options.now);
  if (!Number.isFinite(now.getTime())) throw queryError('INVALID_INSTANT', 'options.now is invalid.');
  return now;
}
function normalizeInclude(value, supported, field = 'include') {
  if (value === undefined) return new Set();
  if (!Array.isArray(value)) throw queryError('UNSUPPORTED_INCLUDE', `${field} must be an array.`, { field });
  const result = new Set();
  for (const item of value) {
    if (typeof item !== 'string' || !supported.has(item)) {
      throw queryError('UNSUPPORTED_INCLUDE', `Unsupported include: ${String(item)}.`, { field });
    }
    if (result.has(item)) {
      throw queryError('UNSUPPORTED_INCLUDE', `Duplicate include: ${item}.`, { field });
    }
    result.add(item);
  }
  return result;
}
function resolvePresentation(request) {
  const presentation = request.presentation ?? 'full';
  if (presentation !== 'full' && presentation !== 'canonical') {
    throw queryError('UNSUPPORTED_PRESENTATION', `Unsupported presentation: ${String(presentation)}.`, { field: 'presentation' });
  }
  if (own(request, 'locale') && (typeof request.locale !== 'string' || request.locale.length === 0)) {
    throw queryError('INVALID_LOCALE', 'locale must be a non-empty string.', { field: 'locale' });
  }
  if (presentation === 'canonical') return { presentation, locale: null, localePack: null };
  const localePack = getLocalePack(request.locale ?? DEFAULT_LOCALE);
  return { presentation, locale: localePack.code, localePack };
}
async function providerFromOptions(options = {}) {
  if (options.provider) return options.provider;
  const { createPrecomputedProvider } = await import('./provider-precomputed.mjs');
  return createPrecomputedProvider({
    generatedDir: options.generatedDir ?? process.env.SEER_CACHE_DIR ?? DEFAULT_GENERATED_DIR,
    runtimeRoot,
    maxExactConcurrency: options.maxExactConcurrency,
    maxExactQueue: options.maxExactQueue,
  });
}
function boundaryServiceFromOptions(options = {}) {
  return options.dayBoundaryService ?? defaultDayBoundaryService;
}

async function resolveCalculation(calculationInput, observerInput, include, now, boundaryService) {
  let calculationSource;
  let calculationAt = null;
  let calculationJdn;
  let calculationNeedsObserver = false;
  if (calculationInput === undefined) {
    calculationSource = 'request-instant';
    calculationAt = now;
    calculationNeedsObserver = true;
  } else {
    assertObject(calculationInput, 'calculation');
    rejectUnknown(calculationInput, CALC_KEYS, 'calculation.');
    const hasJdn = own(calculationInput, 'jdn');
    const hasAt = own(calculationInput, 'at');
    if (!hasJdn && !hasAt) throw queryError('MISSING_CALCULATION_SELECTOR', 'calculation needs jdn or at.', { field: 'calculation' });
    if (hasJdn && hasAt) throw queryError('CONFLICTING_CALCULATION', 'Use calculation.jdn or calculation.at, not both.', { field: 'calculation' });
    if (hasJdn) {
      calculationSource = 'explicit-jdn';
      calculationJdn = parseExactInteger(calculationInput.jdn, 'calculation.jdn');
    } else {
      calculationSource = 'explicit-instant';
      calculationAt = parseInstant(calculationInput.at, 'calculation.at');
      calculationNeedsObserver = true;
    }
  }

  const observerRelevant = calculationNeedsObserver || include.has('boundaries');
  const observer = resolveObserver(observerInput, { relevant: observerRelevant });
  if (calculationNeedsObserver) calculationJdn = await boundaryService.calculationDayAt(calculationAt, observer.longitude);
  return { calculationSource, calculationAt, calculationJdn, observer };
}

function resolveTarget(input, calculationJdn, field = 'target') {
  if (input === undefined) return { source: 'same-as-calculation', jdn: calculationJdn };
  assertObject(input, field);
  rejectUnknown(input, TARGET_KEYS, `${field}.`);
  const selectors = ['jdn', 'gregorian', 'offsetDays'].filter((key) => own(input, key));
  if (selectors.length === 0) throw queryError('MISSING_TARGET_SELECTOR', `${field} needs jdn, gregorian, or offsetDays.`, { field });
  if (selectors.length > 1) throw queryError('AMBIGUOUS_TARGET', `Use exactly one ${field} selector.`, { field });
  if (selectors[0] === 'jdn') return { source: 'jdn', jdn: parseExactInteger(input.jdn, `${field}.jdn`) };
  if (selectors[0] === 'gregorian') return { source: 'gregorian', jdn: gregorianToJdn(input.gregorian, `${field}.gregorian`) };
  return { source: 'offset', jdn: calculationJdn + parseExactInteger(input.offsetDays, `${field}.offsetDays`) };
}

async function resolveDateRequest(request, now, boundaryService) {
  if (request === undefined) request = {};
  assertObject(request, 'request');
  rejectUnknown(request, DATE_KEYS);
  const include = normalizeInclude(request.include, DATE_INCLUDES);
  const { presentation, locale, localePack } = resolvePresentation(request);
  const calculation = await resolveCalculation(request.calculation, request.observer, include, now, boundaryService);
  const target = resolveTarget(request.target, calculation.calculationJdn, 'target');
  return { include, presentation, locale, localePack, ...calculation, targetSource: target.source, targetJdn: target.jdn };
}

function presentRecord(record, presentation, localePack = null) {
  const cutletIndex = record.cutletIndex + 1;
  const monthIndex = record.monthIndex + 1;
  if (!Number.isInteger(cutletIndex) || cutletIndex < 1 || cutletIndex > 17) throw queryError('INTERNAL_ERROR', 'Invalid internal cutlet index.');
  if (!Number.isInteger(monthIndex) || monthIndex < 1 || monthIndex > 47) throw queryError('INTERNAL_ERROR', 'Invalid internal month index.');
  const cutlet = { canonicalIndex: cutletIndex, day: record.dayInCutlet };
  const month = { canonicalIndex: monthIndex, day: record.dayInMonth };
  const date = { year: String(record.year), cutlet, month };
  if (presentation === 'full') {
    if (!localePack) throw queryError('INTERNAL_ERROR', 'Full presentation requires a resolved locale pack.');
    cutlet.name = localizedName(localePack, 'cutlet', cutletIndex);
    month.name = localizedName(localePack, 'month', monthIndex);
  }
  return date;
}

function parsePastafarianCoordinate(value, field, maxIndex, maxDay) {
  assertObject(value, field);
  rejectUnknown(value, PASTAFARIAN_COORD_KEYS, `${field}.`);
  if (!own(value, 'canonicalIndex') || !own(value, 'day')) {
    throw queryError('MISSING_PASTAFARIAN_DATE', `${field} requires canonicalIndex and day.`, { field });
  }
  const canonicalIndex = parseExactInteger(value.canonicalIndex, `${field}.canonicalIndex`);
  const day = parseExactInteger(value.day, `${field}.day`);
  if (canonicalIndex < 1n || canonicalIndex > BigInt(maxIndex) || day < 1n || day > BigInt(maxDay)) {
    throw queryError('INVALID_PASTAFARIAN_DATE', `${field} is outside the canonical calendar bounds.`, { field });
  }
  return { canonicalIndex: Number(canonicalIndex), day: Number(day) };
}

function normalizePastafarianDateInput(value) {
  assertObject(value, 'pastafarianDate');
  rejectUnknown(value, PASTAFARIAN_DATE_KEYS, 'pastafarianDate.');
  if (!own(value, 'year') || !own(value, 'cutlet') || !own(value, 'month')) {
    throw queryError('MISSING_PASTAFARIAN_DATE', 'pastafarianDate requires year, cutlet and month.', { field: 'pastafarianDate' });
  }
  return {
    year: parseExactInteger(value.year, 'pastafarianDate.year'),
    cutlet: parsePastafarianCoordinate(value.cutlet, 'pastafarianDate.cutlet', 17, 5778),
    month: parsePastafarianCoordinate(value.month, 'pastafarianDate.month', 47, 123),
  };
}
function structureFromSupplied(supplied) {
  const result = {};
  const raw = supplied.structure ?? {};
  const record = supplied.record ?? {};
  const keys = ['dayInYear', 'yearLengthDays', 'cutletCount', 'currentCutletLengthDays', 'monthCount', 'currentMonthLengthDays'];
  for (const key of keys) {
    const value = own(raw, key) ? raw[key] : own(record, key) ? record[key] : undefined;
    if (Number.isInteger(value) && value > 0) result[key] = value;
  }
  return result;
}

function resolutionObject(resolved) {
  return {
    calculationSource: resolved.calculationSource,
    targetSource: resolved.targetSource,
    ...(resolved.observer ? { observerSource: resolved.observer.source } : {}),
  };
}

export async function queryDate(request = {}, options = {}) {
  const now = requestNow(options);
  const boundaryService = boundaryServiceFromOptions(options);
  const resolved = await resolveDateRequest(request, now, boundaryService);
  const provider = await providerFromOptions(options);
  const supplied = await provider.query({ calculationJdn: resolved.calculationJdn, targetJdn: resolved.targetJdn });
  const pastafarianDate = presentRecord(supplied.record, resolved.presentation, resolved.localePack);
  const response = {
    ...(resolved.calculationAt ? { calculationAt: resolved.calculationAt.toISOString() } : {}),
    calculationDay: { jdn: exactIntegerString(resolved.calculationJdn) },
    ...(resolved.observer ? { observer: { longitude: resolved.observer.longitude } } : {}),
    targetDay: { jdn: exactIntegerString(resolved.targetJdn), gregorian: jdnToGregorian(resolved.targetJdn) },
    pastafarianDate,
  };
  if (resolved.presentation === 'full') {
    response.locale = resolved.locale;
    response.formatted = resolved.localePack.formatDate(pastafarianDate);
  }
  if (resolved.include.has('structure')) {
    const structure = structureFromSupplied(supplied);
    if (Object.keys(structure).length === 0) throw queryError('SEER_UNAVAILABLE', 'The configured Seer provider did not supply requested structure information.');
    response.structure = structure;
  }
  if (resolved.include.has('boundaries')) response.boundaries = await boundaryService.dayBoundaries(resolved.calculationJdn, resolved.observer.longitude);
  if (resolved.include.has('provenance')) response.provenance = supplied.provenance ?? {};
  if (resolved.include.has('resolution')) response.resolution = resolutionObject(resolved);
  return response;
}

export async function queryReverse(request = {}, options = {}) {
  assertObject(request, 'request');
  rejectUnknown(request, REVERSE_KEYS);
  if (!own(request, 'pastafarianDate')) {
    throw queryError('MISSING_PASTAFARIAN_DATE', 'pastafarianDate is required.', { field: 'pastafarianDate' });
  }
  const include = normalizeInclude(request.include, DATE_INCLUDES);
  const { presentation, locale, localePack } = resolvePresentation(request);
  const now = requestNow(options);
  const boundaryService = boundaryServiceFromOptions(options);
  const calculation = await resolveCalculation(request.calculation, request.observer, include, now, boundaryService);
  const wanted = normalizePastafarianDateInput(request.pastafarianDate);
  const provider = await providerFromOptions(options);
  if (typeof provider.year !== 'function') {
    throw queryError('SEER_UNAVAILABLE', 'The configured Seer provider cannot locate a complete Pastafarian year.', { details: { provider: provider.id ?? 'unknown' } });
  }
  const yearSupplied = await provider.year({ calculationJdn: calculation.calculationJdn, year: wanted.year, includeDays: false });
  const rawYear = yearSupplied?.year;
  if (!rawYear || BigInt(rawYear.number) !== wanted.year || !Array.isArray(rawYear.cutlets) || !Array.isArray(rawYear.months)) {
    throw queryError('SEER_UNAVAILABLE', 'The configured Seer provider returned an inconsistent year structure.');
  }
  const rawCutlet = rawYear.cutlets.find((item) => item.cutletIndex === wanted.cutlet.canonicalIndex - 1);
  if (!rawCutlet || wanted.cutlet.day > rawCutlet.lengthDays) {
    throw queryError('PASTAFARIAN_DATE_NOT_IN_YEAR', 'The requested cutlet coordinate does not occur in that Pastafarian year.', { field: 'pastafarianDate.cutlet' });
  }
  const rawMonth = rawYear.months.find((item) => item.monthIndex === wanted.month.canonicalIndex - 1);
  if (!rawMonth || wanted.month.day > rawMonth.lengthDays) {
    throw queryError('PASTAFARIAN_DATE_NOT_IN_YEAR', 'The requested month coordinate does not occur in that Pastafarian year.', { field: 'pastafarianDate.month' });
  }
  if (!Number.isInteger(rawCutlet.startOffset) || rawCutlet.startOffset < 0) {
    throw queryError('SEER_UNAVAILABLE', 'The configured Seer provider returned an invalid cutlet offset.');
  }
  const targetJdn = BigInt(rawYear.startJdn) + BigInt(rawCutlet.startOffset + wanted.cutlet.day - 1);
  const supplied = await provider.query({ calculationJdn: calculation.calculationJdn, targetJdn });
  const record = supplied?.record;
  if (!record || BigInt(record.year) !== wanted.year || record.cutletIndex !== wanted.cutlet.canonicalIndex - 1 || record.dayInCutlet !== wanted.cutlet.day) {
    throw queryError('SEER_UNAVAILABLE', 'The configured Seer provider returned a day inconsistent with its year structure.');
  }
  if (record.monthIndex !== wanted.month.canonicalIndex - 1 || record.dayInMonth !== wanted.month.day) {
    throw queryError('PASTAFARIAN_DATE_CONFLICT', 'The supplied cutlet and month coordinates identify different Pastafarian days.', { field: 'pastafarianDate' });
  }
  const pastafarianDate = presentRecord(record, presentation, localePack);
  const response = {
    ...(calculation.calculationAt ? { calculationAt: calculation.calculationAt.toISOString() } : {}),
    calculationDay: { jdn: exactIntegerString(calculation.calculationJdn) },
    ...(calculation.observer ? { observer: { longitude: calculation.observer.longitude } } : {}),
    targetDay: { jdn: exactIntegerString(targetJdn), gregorian: jdnToGregorian(targetJdn) },
    pastafarianDate,
  };
  if (presentation === 'full') {
    response.locale = locale;
    response.formatted = localePack.formatDate(pastafarianDate);
  }
  if (include.has('structure')) {
    const structure = structureFromSupplied(supplied);
    if (Object.keys(structure).length === 0) throw queryError('SEER_UNAVAILABLE', 'The configured Seer provider did not supply requested structure information.');
    response.structure = structure;
  }
  if (include.has('boundaries')) response.boundaries = await boundaryService.dayBoundaries(calculation.calculationJdn, calculation.observer.longitude);
  if (include.has('provenance')) response.provenance = supplied.provenance ?? yearSupplied.provenance ?? {};
  if (include.has('resolution')) response.resolution = {
    calculationSource: calculation.calculationSource,
    targetSource: 'pastafarian-date',
    ...(calculation.observer ? { observerSource: calculation.observer.source } : {}),
  };
  return response;
}
export async function queryNow(options = {}) {
  const {
    generatedDir,
    provider,
    now,
    dayBoundaryService,
    maxExactConcurrency,
    maxExactQueue,
    ...requestOptions
  } = options;
  return queryDate(requestOptions, {
    generatedDir,
    provider,
    now,
    dayBoundaryService,
    maxExactConcurrency,
    maxExactQueue,
  });
}

function publicError(error) {
  return {
    code: error.code,
    message: error.message,
    ...(error.field !== undefined ? { field: error.field } : {}),
    ...(error.details !== undefined ? { details: error.details } : {}),
  };
}

export async function queryBatch(request, options = {}) {
  assertObject(request, 'request');
  rejectUnknown(request, BATCH_KEYS);
  if (!Array.isArray(request.queries) || request.queries.length === 0) {
    throw queryError('UNKNOWN_PARAMETER', 'queries must be a non-empty array.', { field: 'queries' });
  }
  const maxItems = options.maxBatchItems ?? DEFAULT_MAX_BATCH_ITEMS;
  if (request.queries.length > maxItems) throw queryError('REQUEST_TOO_LARGE', `Batch exceeds the configured limit of ${maxItems} items.`, { field: 'queries' });
  const defaults = request.defaults ?? {};
  assertObject(defaults, 'defaults');
  rejectUnknown(defaults, BATCH_DEFAULT_KEYS, 'defaults.');
  const ids = new Set();
  for (let index = 0; index < request.queries.length; index += 1) {
    const item = request.queries[index];
    assertObject(item, `queries[${index}]`);
    rejectUnknown(item, BATCH_ITEM_KEYS, `queries[${index}].`);
    if (own(item, 'id')) {
      if (typeof item.id !== 'string') throw queryError('UNKNOWN_PARAMETER', 'Batch id must be a string.', { field: `queries[${index}].id` });
      if (ids.has(item.id)) throw queryError('DUPLICATE_BATCH_ID', `Duplicate batch id: ${item.id}.`, { field: `queries[${index}].id` });
      ids.add(item.id);
    }
  }

  const now = requestNow(options);
  const provider = await providerFromOptions(options);
  const sharedOptions = { ...options, now, provider };
  const results = await Promise.all(request.queries.map(async (item) => {
    const { id, ...itemRequest } = item;
    const merged = { ...defaults, ...itemRequest };
    try {
      const result = await queryDate(merged, sharedOptions);
      return { ...(id !== undefined ? { id } : {}), ok: true, result };
    } catch (error) {
      if (!(error instanceof SeerQueryError)) throw error;
      return { ...(id !== undefined ? { id } : {}), ok: false, error: publicError(error) };
    }
  }));
  return { results };
}

function rangeCommonDateRequest(request) {
  const out = {};
  for (const key of ['observer', 'calculation', 'locale', 'presentation', 'include']) if (own(request, key)) out[key] = request[key];
  return out;
}

export async function queryRange(request, options = {}) {
  assertObject(request, 'request');
  rejectUnknown(request, RANGE_KEYS);
  const hasCount = own(request, 'count');
  const hasEnd = own(request, 'endInclusive');
  if (hasCount && hasEnd) throw queryError('AMBIGUOUS_RANGE_END', 'Use count or endInclusive, not both.', { field: 'endInclusive' });
  if (!hasCount && !hasEnd) throw queryError('MISSING_RANGE_END', 'Range requires count or endInclusive.', { field: 'count' });
  const step = own(request, 'stepDays') ? parseExactInteger(request.stepDays, 'stepDays') : 1n;
  if (step === 0n) throw queryError('INVALID_RANGE_STEP', 'stepDays must not be zero.', { field: 'stepDays' });
  const mode = request.calculationMode ?? 'fixed';
  if (mode !== 'fixed' && mode !== 'same-as-target') throw queryError('UNKNOWN_PARAMETER', `Unsupported calculationMode: ${String(mode)}.`, { field: 'calculationMode' });

  const now = requestNow(options);
  const boundaryService = boundaryServiceFromOptions(options);
  const commonRequest = rangeCommonDateRequest(request);
  const include = normalizeInclude(commonRequest.include, DATE_INCLUDES);
  resolvePresentation(commonRequest);
  const usesOffset = (target) => target !== undefined && target !== null && typeof target === 'object' && !Array.isArray(target) && own(target, 'offsetDays');
  const needsBaseCalculation = mode === 'fixed' || request.start === undefined || usesOffset(request.start) || (hasEnd && usesOffset(request.endInclusive));
  const baseCalculation = needsBaseCalculation
    ? await resolveCalculation(commonRequest.calculation, commonRequest.observer, include, now, boundaryService)
    : { calculationJdn: 0n };
  const start = resolveTarget(request.start, baseCalculation.calculationJdn, 'start');

  const maxItems = BigInt(options.maxRangeItems ?? DEFAULT_MAX_RANGE_ITEMS);
  let count;
  if (hasCount) {
    count = parseRangeCount(request.count, maxItems);
  } else {
    const end = resolveTarget(request.endInclusive, baseCalculation.calculationJdn, 'endInclusive');
    const diff = end.jdn - start.jdn;
    if ((diff > 0n && step < 0n) || (diff < 0n && step > 0n) || diff % step !== 0n) {
      throw queryError('UNREACHABLE_RANGE_END', 'endInclusive is not reachable exactly from start using stepDays.', { field: 'endInclusive' });
    }
    count = diff / step + 1n;
    if (count <= 0n) throw queryError('UNREACHABLE_RANGE_END', 'endInclusive is not reachable exactly from start using stepDays.', { field: 'endInclusive' });
  }

  if (count > maxItems) throw queryError('REQUEST_TOO_LARGE', `Range exceeds the configured limit of ${maxItems} items.`, { field: hasCount ? 'count' : 'endInclusive' });

  const pending = [];
  const provider = await providerFromOptions(options);
  const sharedOptions = { ...options, now, provider };
  for (let i = 0n; i < count; i += 1n) {
    const targetJdn = start.jdn + i * step;
    let dateRequest;
    if (mode === 'fixed') {
      dateRequest = { ...commonRequest, target: { jdn: exactIntegerString(targetJdn) } };
    } else {
      dateRequest = {
        ...commonRequest,
        calculation: { jdn: exactIntegerString(targetJdn) },
        target: { jdn: exactIntegerString(targetJdn) },
      };
    }
    pending.push(queryDate(dateRequest, sharedOptions));
  }
  return { results: await Promise.all(pending) };
}

export async function queryCalculationDay(request = {}, options = {}) {
  assertObject(request, 'request');
  rejectUnknown(request, CALCULATION_DAY_KEYS);
  const include = normalizeInclude(request.include, CALCULATION_DAY_INCLUDES);
  const now = requestNow(options);
  const at = own(request, 'at') ? parseInstant(request.at, 'at') : now;
  const observer = resolveObserver(request.observer, { relevant: true });
  const boundaryService = boundaryServiceFromOptions(options);
  const jdn = await boundaryService.calculationDayAt(at, observer.longitude);
  const response = {
    at: at.toISOString(),
    jdn: exactIntegerString(jdn),
    observer: { longitude: observer.longitude },
  };
  if (include.has('boundaries')) response.boundaries = await boundaryService.dayBoundaries(jdn, observer.longitude);
  return response;
}

function presentYearStructure(rawYear, presentation, includeDays, localePack = null) {
  const number = exactIntegerString(rawYear.number);
  const startJdn = exactIntegerString(rawYear.startJdn);
  const endJdn = exactIntegerString(rawYear.endJdn);
  if (!Number.isInteger(rawYear.lengthDays) || rawYear.lengthDays <= 0) throw queryError('INTERNAL_ERROR', 'Provider returned an invalid year length.');
  const cutlets = rawYear.cutlets.map((item) => {
    const canonicalIndex = item.cutletIndex + 1;
    if (!Number.isInteger(canonicalIndex) || canonicalIndex < 1 || canonicalIndex > 17) throw queryError('INTERNAL_ERROR', 'Provider returned an invalid cutlet index.');
    const out = {
      canonicalIndex,
      ...(presentation === 'full' ? { name: localizedName(localePack, 'cutlet', canonicalIndex) } : {}),
      lengthDays: item.lengthDays,
      startOffset: item.startOffset,
      endOffset: item.endOffset,
    };
    return out;
  });
  const months = rawYear.months.map((item) => {
    const canonicalIndex = item.monthIndex + 1;
    if (!Number.isInteger(canonicalIndex) || canonicalIndex < 1 || canonicalIndex > 47) throw queryError('INTERNAL_ERROR', 'Provider returned an invalid month index.');
    return {
      canonicalIndex,
      ...(presentation === 'full' ? { name: localizedName(localePack, 'month', canonicalIndex) } : {}),
      lengthDays: item.lengthDays,
    };
  });
  const year = { number, lengthDays: rawYear.lengthDays, startJdn, endJdn, cutlets, months };
  if (includeDays) {
    if (!Array.isArray(rawYear.days) || rawYear.days.length !== rawYear.lengthDays) {
      throw queryError('SEER_UNAVAILABLE', 'The selected provider did not supply the complete requested year-day sequence.');
    }
    year.days = rawYear.days.map((record) => ({
      targetDay: { jdn: exactIntegerString(record.targetJdn), gregorian: jdnToGregorian(BigInt(record.targetJdn)) },
      pastafarianDate: presentRecord(record, presentation, localePack),
    }));
  }
  return year;
}

export async function queryYear(yearInput, request = {}, options = {}) {
  assertObject(request, 'request');
  rejectUnknown(request, YEAR_KEYS);
  const include = normalizeInclude(request.include, YEAR_INCLUDES);
  const { presentation, locale, localePack } = resolvePresentation(request);
  const now = requestNow(options);
  const boundaryService = boundaryServiceFromOptions(options);
  const calculation = await resolveCalculation(request.calculation, request.observer, new Set(), now, boundaryService);
  const yearNumber = parseExactInteger(yearInput, 'year');
  const provider = await providerFromOptions(options);
  if (typeof provider.year !== 'function') {
    throw queryError('SEER_UNAVAILABLE', 'The configured Seer provider cannot supply complete year structures.', { details: { provider: provider.id ?? 'unknown' } });
  }
  const supplied = await provider.year({ calculationJdn: calculation.calculationJdn, year: yearNumber, includeDays: include.has('days') });
  const response = {
    ...(calculation.calculationAt ? { calculationAt: calculation.calculationAt.toISOString() } : {}),
    calculationDay: { jdn: exactIntegerString(calculation.calculationJdn) },
    ...(calculation.observer ? { observer: { longitude: calculation.observer.longitude } } : {}),
    ...(presentation === 'full' ? { locale } : {}),
    year: presentYearStructure(supplied.year, presentation, include.has('days'), localePack),
  };
  if (include.has('provenance')) response.provenance = supplied.provenance ?? {};
  if (include.has('resolution')) {
    response.resolution = {
      calculationSource: calculation.calculationSource,
      ...(calculation.observer ? { observerSource: calculation.observer.source } : {}),
    };
  }
  return response;
}

export { SeerQueryError } from './errors.mjs';
export { gregorianToJdn, jdnToGregorian } from './gregorian.mjs';
export { DEFAULT_LOCALE, listLocales };
