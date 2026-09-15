import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { queryError } from './errors.mjs';

const execFileAsync = promisify(execFile);
const DEFAULT_MAX_BUFFER = 32 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_BATCH_COUNT = 10_000;

async function firstExisting(candidates) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    try { await access(candidate); return candidate; } catch {}
  }
  return null;
}

async function resolveBinary({ explicit, envName, rootDir, basename }) {
  const candidates = [explicit, process.env[envName]];
  if (process.platform === 'win32') candidates.push(path.join(rootDir, 'prototype', 'build', `${basename}.exe`));
  candidates.push(path.join(rootDir, 'prototype', 'build', basename));
  const found = await firstExisting(candidates);
  if (!found) throw queryError('SEER_UNAVAILABLE', `Exact Seer engine binary is unavailable: ${basename}.`, { details: { binary: basename, env: envName } });
  return found;
}

function safeInteger(value, field, code) {
  const asBigInt = typeof value === 'bigint' ? value : BigInt(value);
  if (asBigInt < BigInt(Number.MIN_SAFE_INTEGER) || asBigInt > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw queryError(code, `${field} is outside the exact engine's currently supported integer domain.`, { field });
  }
  return Number(asBigInt);
}

function safeCount(value) {
  const count = safeInteger(value, 'count', 'REQUEST_TOO_LARGE');
  if (!Number.isInteger(count) || count < 1 || count > MAX_BATCH_COUNT) {
    throw queryError('REQUEST_TOO_LARGE', `Exact batch count must be between 1 and ${MAX_BATCH_COUNT}.`, { field: 'count' });
  }
  return count;
}

async function runJson(binary, args, { cwd, timeoutMs, maxBuffer }) {
  try {
    const { stdout } = await execFileAsync(binary, args, { cwd, encoding: 'utf8', timeout: timeoutMs, maxBuffer, windowsHide: true });
    return JSON.parse(stdout);
  } catch (error) {
    if (error?.code === 'ENOENT') throw queryError('SEER_UNAVAILABLE', 'Exact Seer engine executable could not be started.', { cause: error });
    if (error?.killed || error?.signal) throw queryError('SEER_UNAVAILABLE', 'Exact Seer engine timed out or was terminated.', { cause: error });
    if (error?.stdout !== undefined || error?.stderr !== undefined) {
      throw queryError('SEER_UNAVAILABLE', 'Exact Seer engine failed to produce a verified result.', { details: { exitCode: error.code ?? null }, cause: error });
    }
    if (error instanceof SyntaxError) throw queryError('SEER_UNAVAILABLE', 'Exact Seer engine emitted invalid JSON.', { cause: error });
    throw error;
  }
}

function ensureBatch(parsed, { calc, start, count }) {
  if (!parsed || parsed.schema !== 1 || parsed.calcJdn !== calc || parsed.targetStartJdn !== start || parsed.targetCount !== count || !Array.isArray(parsed.records) || parsed.records.length !== count) {
    throw queryError('SEER_UNAVAILABLE', 'Exact Seer batch engine returned an unexpected payload.');
  }
  for (let i = 0; i < parsed.records.length; i += 1) {
    const record = parsed.records[i];
    const ints = ['targetJdn', 'year', 'cutletIndex', 'dayInCutlet', 'monthIndex', 'dayInMonth', 'cutletCount', 'monthCount'];
    if (!record || typeof record !== 'object') throw queryError('SEER_UNAVAILABLE', 'Exact Seer batch engine returned a non-object record.');
    for (const key of ints) if (!Number.isInteger(record[key])) throw queryError('SEER_UNAVAILABLE', `Exact Seer batch record has invalid ${key}.`);
    if (record.targetJdn !== start + i) throw queryError('SEER_UNAVAILABLE', 'Exact Seer batch engine returned a non-contiguous target sequence.');
  }
  return parsed;
}

function structureFromYearRecords(locator, batch, includeDays) {
  const records = batch.records;
  const expectedYear = locator.year;
  if (records.length !== locator.lengthDays) throw queryError('SEER_UNAVAILABLE', 'Exact Seer year batch length does not match the located year.');
  if (records.some((record) => record.year !== expectedYear)) throw queryError('SEER_UNAVAILABLE', 'Exact Seer year batch crossed an unexpected year boundary.');
  const cutlets = [];
  let currentCutlet = null;
  const monthOrder = [];
  const monthsByIndex = new Map();
  for (let offset = 0; offset < records.length; offset += 1) {
    const record = records[offset];
    if (!currentCutlet || currentCutlet.cutletIndex !== record.cutletIndex) {
      if (currentCutlet) { currentCutlet.endOffset = offset - 1; currentCutlet.lengthDays = currentCutlet.endOffset - currentCutlet.startOffset + 1; }
      currentCutlet = { cutletIndex: record.cutletIndex, startOffset: offset, endOffset: offset, lengthDays: 1 };
      cutlets.push(currentCutlet);
    } else { currentCutlet.endOffset = offset; currentCutlet.lengthDays += 1; }
    let month = monthsByIndex.get(record.monthIndex);
    if (!month) { month = { monthIndex: record.monthIndex, lengthDays: 0 }; monthsByIndex.set(record.monthIndex, month); monthOrder.push(month); }
    month.lengthDays = Math.max(month.lengthDays, record.dayInMonth);
  }
  if (records.length) { currentCutlet.endOffset = records.length - 1; currentCutlet.lengthDays = currentCutlet.endOffset - currentCutlet.startOffset + 1; }
  const declaredCutletCount = records[0]?.cutletCount ?? 0;
  const declaredMonthCount = records[0]?.monthCount ?? 0;
  if (cutlets.length !== declaredCutletCount || monthOrder.length !== declaredMonthCount) throw queryError('SEER_UNAVAILABLE', 'Exact Seer year structure counts do not match the day records.');
  const year = { number: expectedYear, startJdn: locator.startJdn, endJdn: locator.endJdn, lengthDays: locator.lengthDays, cutlets, months: monthOrder };
  if (includeDays) year.days = records;
  return year;
}


function yearFromStructurePayload(parsed, { calc, requestedYear, includeDays }) {
  if (!parsed || parsed.schema !== 1 || parsed.calcJdn !== calc || parsed.year !== requestedYear ||
      !Number.isInteger(parsed.startJdn) || !Number.isInteger(parsed.endJdn) || !Number.isInteger(parsed.lengthDays) ||
      parsed.endJdn - parsed.startJdn + 1 !== parsed.lengthDays || parsed.lengthDays < 1 || parsed.lengthDays > MAX_BATCH_COUNT ||
      !Array.isArray(parsed.cutlets) || parsed.cutlets.length < 1 || !Array.isArray(parsed.months) || parsed.months.length < 1) {
    throw queryError('SEER_UNAVAILABLE', 'Exact Seer year-structure engine returned an unexpected payload.');
  }
  let nextOffset = 0;
  for (const cutlet of parsed.cutlets) {
    if (!cutlet || !Number.isInteger(cutlet.cutletIndex) || cutlet.cutletIndex < 0 || cutlet.cutletIndex >= 17 ||
        !Number.isInteger(cutlet.startOffset) || !Number.isInteger(cutlet.endOffset) || !Number.isInteger(cutlet.lengthDays) ||
        cutlet.startOffset !== nextOffset || cutlet.endOffset < cutlet.startOffset ||
        cutlet.lengthDays !== cutlet.endOffset - cutlet.startOffset + 1) {
      throw queryError('SEER_UNAVAILABLE', 'Exact Seer year-structure engine returned invalid cutlets.');
    }
    nextOffset = cutlet.endOffset + 1;
  }
  if (nextOffset !== parsed.lengthDays) throw queryError('SEER_UNAVAILABLE', 'Exact Seer year-structure cutlets do not cover the year.');
  let monthTotal = 0;
  const monthNames = new Set();
  for (const month of parsed.months) {
    if (!month || !Number.isInteger(month.monthIndex) || month.monthIndex < 0 || month.monthIndex >= 47 ||
        !Number.isInteger(month.lengthDays) || month.lengthDays < 4 || month.lengthDays > 123 || monthNames.has(month.monthIndex)) {
      throw queryError('SEER_UNAVAILABLE', 'Exact Seer year-structure engine returned invalid months.');
    }
    monthNames.add(month.monthIndex); monthTotal += month.lengthDays;
  }
  if (monthTotal !== parsed.lengthDays) throw queryError('SEER_UNAVAILABLE', 'Exact Seer year-structure months do not sum to the year length.');
  if (includeDays) {
    if (!Array.isArray(parsed.days) || parsed.days.length !== parsed.lengthDays) {
      throw queryError('SEER_UNAVAILABLE', 'Exact Seer year-structure engine omitted requested days.');
    }
    ensureBatch({ schema: 1, calcJdn: calc, targetStartJdn: parsed.startJdn, targetCount: parsed.lengthDays, records: parsed.days }, {
      calc, start: parsed.startJdn, count: parsed.lengthDays,
    });
    if (parsed.days.some((record) => record.year !== requestedYear || record.cutletCount !== parsed.cutlets.length || record.monthCount !== parsed.months.length)) {
      throw queryError('SEER_UNAVAILABLE', 'Exact Seer year-structure day sequence does not match the supplied structure.');
    }
  }
  return {
    number: requestedYear,
    startJdn: parsed.startJdn,
    endJdn: parsed.endJdn,
    lengthDays: parsed.lengthDays,
    cutlets: parsed.cutlets,
    months: parsed.months,
    ...(includeDays ? { days: parsed.days } : {}),
  };
}

export function createExactEngine({ generatedDir, yearBatchBinary, yearLocatorBinary, yearStructureBinary, dataDir, timeoutMs = DEFAULT_TIMEOUT_MS, maxBuffer = DEFAULT_MAX_BUFFER } = {}) {
  if (!generatedDir) throw new TypeError('generatedDir is required');
  const rootDir = path.resolve(generatedDir, '..');
  const cwd = dataDir ?? path.join(rootDir, 'prototype', 'data');
  async function batchBinary() { return resolveBinary({ explicit: yearBatchBinary, envName: 'SEER_YEAR_BATCH_BIN', rootDir, basename: 'seer_year_batch' }); }
  async function locatorBinary() { return resolveBinary({ explicit: yearLocatorBinary, envName: 'SEER_YEAR_LOCATOR_BIN', rootDir, basename: 'seer_year_locator' }); }
  async function optionalStructureBinary() {
    const candidates = [yearStructureBinary, process.env.SEER_YEAR_STRUCTURE_BIN];
    if (process.platform === 'win32') candidates.push(path.join(rootDir, 'prototype', 'build', 'seer_year_structure.exe'));
    candidates.push(path.join(rootDir, 'prototype', 'build', 'seer_year_structure'));
    return firstExisting(candidates);
  }

  async function queryRange({ calculationJdn, targetStartJdn, count }) {
    const calc = safeInteger(calculationJdn, 'calculation.jdn', 'CALCULATION_OUT_OF_SUPPORTED_DOMAIN');
    const start = safeInteger(targetStartJdn, 'target.jdn', 'TARGET_OUT_OF_SUPPORTED_DOMAIN');
    const size = safeCount(count);
    const parsed = ensureBatch(await runJson(await batchBinary(), [String(calc), String(start), String(size)], { cwd, timeoutMs, maxBuffer }), { calc, start, count: size });
    return {
      records: parsed.records,
      provenance: { ...(typeof parsed.engine === 'string' ? { engineRevision: parsed.engine } : {}) },
    };
  }

  return Object.freeze({
    id: 'seer-v12-exact-process',
    queryRange,
    async query({ calculationJdn, targetJdn }) {
      const supplied = await queryRange({ calculationJdn, targetStartJdn: targetJdn, count: 1 });
      const record = supplied.records[0];
      return { record, structure: { cutletCount: record.cutletCount, monthCount: record.monthCount }, provenance: supplied.provenance };
    },
    async year({ calculationJdn, year, includeDays = false }) {
      const calc = safeInteger(calculationJdn, 'calculation.jdn', 'CALCULATION_OUT_OF_SUPPORTED_DOMAIN');
      const requestedYear = safeInteger(year, 'year', 'YEAR_OUT_OF_SUPPORTED_DOMAIN');
      const structureBinary = await optionalStructureBinary();
      if (structureBinary) {
        const parsed = await runJson(structureBinary, [String(calc), String(requestedYear), includeDays ? '1' : '0'], { cwd, timeoutMs, maxBuffer });
        return {
          year: yearFromStructurePayload(parsed, { calc, requestedYear, includeDays }),
          provenance: { ...(typeof parsed.engine === 'string' ? { engineRevision: parsed.engine } : {}) },
        };
      }
      // Compatibility fallback while older build environments have not yet built seer_year_structure.
      const located = await runJson(await locatorBinary(), [String(calc), String(requestedYear)], { cwd, timeoutMs, maxBuffer });
      if (!located || located.schema !== 1 || located.calcJdn !== calc || located.year !== requestedYear || !Number.isInteger(located.startJdn) || !Number.isInteger(located.endJdn) || !Number.isInteger(located.lengthDays)) throw queryError('SEER_UNAVAILABLE', 'Exact Seer year locator returned an unexpected payload.');
      if (located.lengthDays < 1 || located.lengthDays > MAX_BATCH_COUNT || located.endJdn - located.startJdn + 1 !== located.lengthDays) throw queryError('SEER_UNAVAILABLE', 'Exact Seer year locator returned invalid boundaries.');
      const supplied = await queryRange({ calculationJdn: calc, targetStartJdn: located.startJdn, count: located.lengthDays });
      const batch = { records: supplied.records };
      return { year: structureFromYearRecords(located, batch, includeDays), provenance: supplied.provenance };
    },
  });
}
