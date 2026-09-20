import { execFile, spawn } from 'node:child_process';
import { access, appendFile, readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { promisify } from 'node:util';
import { queryError } from './errors.mjs';
import { createExactAdmission } from './concurrency.mjs';
import { prebuiltRuntimeHint, resolvePrebuiltBinary } from './prebuilt-runtime.mjs';

const execFileAsync = promisify(execFile);
const DEFAULT_MAX_BUFFER = 32 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_BATCH_COUNT = 10_000;
const DOMAIN_ERROR_CODES = new Set([
  'CALCULATION_OUT_OF_SUPPORTED_DOMAIN',
  'TARGET_OUT_OF_SUPPORTED_DOMAIN',
  'YEAR_OUT_OF_SUPPORTED_DOMAIN',
]);

const PROCESS_EXACT_ADMISSION = createExactAdmission();
const SERVICE_REGISTRY = new Map();
const SERVICE_HASH_CACHE = new Map();
const DEFAULT_SERVICE_REGISTRY_MAX = 4;
const DEFAULT_SERVICE_QUEUE_MAX = 64;
const SERVICE_STDOUT_BUFFER_MAX = 32 * 1024 * 1024;
const SERVICE_STDERR_TAIL_MAX = 8192;

function envPositiveInteger(name, fallback, min = 1, max = 64) {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

async function sha256File(file) {
  const meta = await stat(file);
  const cacheKey = `${file}\0${meta.size}\0${meta.mtimeMs}`;
  let pending = SERVICE_HASH_CACHE.get(cacheKey);
  if (!pending) {
    pending = readFile(file).then((bytes) => createHash('sha256').update(bytes).digest('hex'));
    SERVICE_HASH_CACHE.set(cacheKey, pending);
  }
  return pending;
}

async function engineServiceIdentity(binary, cwd) {
  const positiveGates = path.join(cwd, 'gates_100k_u16.bin');
  const negativeGates = path.join(cwd, 'gates_negative_100k_u16.bin');
  const [binaryHash, positiveHash, negativeHash] = await Promise.all([
    sha256File(binary),
    sha256File(positiveGates),
    sha256File(negativeGates),
  ]);
  return `${binaryHash}:${positiveHash}:${negativeHash}`;
}

function serviceFailure(kind, message, cause) {
  const error = new Error(message, cause === undefined ? undefined : { cause });
  error.name = 'EngineServiceError';
  error.serviceFailure = kind;
  return error;
}

class EngineServiceClient {
  constructor(binary, cwd, onDead, spawnRunner = spawn) {
    this.binary = binary;
    this.cwd = cwd;
    this.onDead = onDead;
    this.writeQueue = [];
    this.inFlight = [];
    this.stdoutBuffer = '';
    this.stderrTail = '';
    this.waitingForDrain = false;
    this.dead = false;
    this.maxPending = envPositiveInteger('SEER_SERVICE_QUEUE_MAX', DEFAULT_SERVICE_QUEUE_MAX, 1, 4096);
    this.child = spawnRunner(binary, [], {
      cwd,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child.stdout.setEncoding('utf8');
    this.child.stderr.setEncoding('utf8');
    this.child.stdout.on('data', (chunk) => this.#onStdout(chunk));
    this.child.stderr.on('data', (chunk) => {
      if (this.dead) return;
      this.stderrTail = (this.stderrTail + chunk).slice(-SERVICE_STDERR_TAIL_MAX);
    });
    this.child.stdin.on('error', (error) => {
      this.#fail(serviceFailure('io', 'persistent Seer engine service stdin failed', error));
    });
    this.child.stdout.on('error', (error) => {
      this.#fail(serviceFailure('io', 'persistent Seer engine service stdout failed', error));
    });
    this.child.stderr.on('error', (error) => {
      this.#fail(serviceFailure('io', 'persistent Seer engine service stderr failed', error));
    });
    this.child.on('error', (error) => {
      this.#fail(serviceFailure('spawn', 'persistent Seer engine service process failed', error));
    });
    this.child.on('exit', (code, signal) => {
      if (!this.dead) {
        const suffix = this.stderrTail.trim();
        this.#fail(serviceFailure(
          'exit',
          `persistent Seer engine service exited (${code ?? 'null'}, ${signal ?? 'none'})${suffix ? `: ${suffix}` : ''}`,
        ));
      }
    });
  }

  #setReferenced(value) {
    const method = value ? 'ref' : 'unref';
    this.child?.[method]?.();
    this.child?.stdin?.[method]?.();
    this.child?.stdout?.[method]?.();
    this.child?.stderr?.[method]?.();
  }

  #settle(waiter, method, value) {
    if (!waiter || waiter.settled) return;
    waiter.settled = true;
    if (waiter.timer) {
      clearTimeout(waiter.timer);
      waiter.timer = null;
    }
    waiter[method](value);
  }

  #maybeUnref() {
    if (!this.dead && this.writeQueue.length === 0 && this.inFlight.length === 0) {
      this.#setReferenced(false);
    }
  }

  #onStdout(chunk) {
    if (this.dead) return;
    this.stdoutBuffer += chunk;
    for (;;) {
      const newline = this.stdoutBuffer.indexOf('\n');
      if (newline < 0) break;
      if (newline > SERVICE_STDOUT_BUFFER_MAX) {
        this.#fail(serviceFailure('protocol', 'persistent Seer engine service emitted an oversized response line'));
        return;
      }
      const line = this.stdoutBuffer.slice(0, newline).replace(/\r$/, '');
      this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1);
      if (!line) continue;
      const waiter = this.inFlight[0];
      if (!waiter) {
        this.#fail(serviceFailure('protocol', 'persistent Seer engine service emitted an unsolicited response'));
        return;
      }

      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch (error) {
        this.#fail(serviceFailure('protocol', 'persistent Seer engine service emitted invalid JSON', error));
        return;
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        this.#fail(serviceFailure('protocol', 'persistent Seer engine service emitted a non-object response'));
        return;
      }

      this.inFlight.shift();
      if (parsed.ok === false) {
        const error = new Error(typeof parsed.error === 'string' ? parsed.error : 'persistent Seer engine service rejected the request');
        if (typeof parsed.code === 'string') error.seerCode = parsed.code;
        error.serviceFailure = 'request';
        this.#settle(waiter, 'reject', error);
      } else {
        this.#settle(waiter, 'resolve', parsed);
      }
      this.#maybeUnref();
    }

    if (this.stdoutBuffer.length > SERVICE_STDOUT_BUFFER_MAX) {
      this.#fail(serviceFailure('protocol', 'persistent Seer engine service stdout line exceeded the bounded buffer'));
    }
  }

  #flushWrites() {
    if (this.dead || this.waitingForDrain) return;
    while (!this.dead && this.writeQueue.length > 0) {
      const waiter = this.writeQueue.shift();
      if (!waiter || waiter.settled) continue;
      this.inFlight.push(waiter);
      let accepted;
      try {
        accepted = this.child.stdin.write(waiter.payload);
      } catch (error) {
        this.#fail(serviceFailure('io', 'persistent Seer engine service request write failed', error));
        return;
      }
      if (!accepted) {
        this.waitingForDrain = true;
        this.child.stdin.once('drain', () => {
          if (this.dead) return;
          this.waitingForDrain = false;
          this.#flushWrites();
        });
        return;
      }
    }
  }

  #terminateChild() {
    try { this.child.stdin.destroy(); } catch {}
    try { this.child.stdout.destroy(); } catch {}
    try { this.child.stderr.destroy(); } catch {}
    try {
      if (!this.child.killed) this.child.kill('SIGKILL');
    } catch {
      try { this.child.kill(); } catch {}
    }
  }

  #fail(error) {
    if (this.dead) return;
    this.dead = true;
    this.stdoutBuffer = '';
    this.waitingForDrain = false;
    const failure = error?.serviceFailure
      ? error
      : serviceFailure('process', error?.message ?? 'persistent Seer engine service failed', error);
    const waiters = [...this.inFlight.splice(0), ...this.writeQueue.splice(0)];
    for (const waiter of waiters) this.#settle(waiter, 'reject', failure);
    this.#setReferenced(false);
    this.#terminateChild();
    this.onDead?.(this);
  }

  request(fields, { timeoutMs } = {}) {
    if (this.dead) {
      return Promise.reject(serviceFailure('unavailable', 'persistent Seer engine service is unavailable'));
    }
    if (this.inFlight.length + this.writeQueue.length >= this.maxPending) {
      return Promise.reject(serviceFailure(
        'overloaded',
        `persistent Seer engine service queue is full (limit ${this.maxPending})`,
      ));
    }
    this.#setReferenced(true);
    return new Promise((resolve, reject) => {
      const waiter = {
        resolve,
        reject,
        settled: false,
        timer: null,
        payload: `${fields.join('\t')}\n`,
      };
      if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
        waiter.timer = setTimeout(() => {
          if (waiter.settled || this.dead) return;
          this.#fail(serviceFailure(
            'timeout',
            `persistent Seer engine service exceeded the ${timeoutMs} ms request deadline`,
          ));
        }, timeoutMs);
        waiter.timer.unref?.();
      }
      this.writeQueue.push(waiter);
      this.#flushWrites();
    });
  }

  close() {
    if (this.dead) return;
    this.#fail(serviceFailure('closed', 'persistent Seer engine service closed'));
  }
}

async function getEngineServiceClient(binary, cwd, { spawnRunner = spawn } = {}) {
  const identity = await engineServiceIdentity(binary, cwd);
  const existing = SERVICE_REGISTRY.get(identity);
  if (existing && !existing.client.dead) {
    SERVICE_REGISTRY.delete(identity);
    SERVICE_REGISTRY.set(identity, existing);
    return existing.client;
  }

  let client;
  client = new EngineServiceClient(binary, cwd, () => {
    const current = SERVICE_REGISTRY.get(identity);
    if (current?.client === client) SERVICE_REGISTRY.delete(identity);
  }, spawnRunner);
  SERVICE_REGISTRY.set(identity, { client });

  const maxEntries = envPositiveInteger('SEER_SERVICE_REGISTRY_MAX', DEFAULT_SERVICE_REGISTRY_MAX);
  while (SERVICE_REGISTRY.size > maxEntries) {
    const oldestKey = SERVICE_REGISTRY.keys().next().value;
    const oldest = SERVICE_REGISTRY.get(oldestKey);
    SERVICE_REGISTRY.delete(oldestKey);
    oldest?.client.close();
  }

  if (process.env.SEER_TEST_SERVICE_SPAWN_COUNTER_FILE) {
    await appendFile(process.env.SEER_TEST_SERVICE_SPAWN_COUNTER_FILE, `${identity}\n`, 'utf8').catch(() => {});
  }
  return client;
}

export function closeExactEngineServicesForTests() {
  for (const { client } of SERVICE_REGISTRY.values()) client.close();
  SERVICE_REGISTRY.clear();
}

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
  if (found) return found;

  try {
    const prebuilt = await resolvePrebuiltBinary({ rootDir, basename });
    if (prebuilt) return prebuilt;
  } catch (error) {
    throw queryError('SEER_UNAVAILABLE', error.message, {
      details: { binary: basename, env: envName, ...(error.details ?? {}) },
      cause: error,
    });
  }

  const hint = await prebuiltRuntimeHint({ rootDir });
  throw queryError('SEER_UNAVAILABLE', `Exact Seer engine binary is unavailable: ${basename}. ${hint.message}`, {
    details: { binary: basename, env: envName, ...hint.details },
  });
}

function safeInteger(value, field, code) {
  if (typeof value === 'string') {
    const unsigned = value[0] === '-' ? value.slice(1) : value;
    if (/^[0-9]+$/.test(unsigned) && unsigned.length > 16) {
      throw queryError(code, `${field} is outside the exact engine's currently supported integer domain.`, { field });
    }
  }
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

function classifyNativeDomainFailure(error, domainKind) {
  const stderr = typeof error?.stderr === 'string' ? error.stderr : '';
  const message = typeof error?.message === 'string' ? error.message : '';
  const text = `${stderr}\n${message}`;
  if (/day beyond bidirectional gate corpus|no anchor candidates in gate corpus/.test(text)) {
    return 'CALCULATION_OUT_OF_SUPPORTED_DOMAIN';
  }
  if (/no previous year in gate corpus|no next year in gate corpus|gate index/.test(text)) {
    if (domainKind === 'range') return 'TARGET_OUT_OF_SUPPORTED_DOMAIN';
    if (domainKind === 'year') return 'YEAR_OUT_OF_SUPPORTED_DOMAIN';
  }
  return null;
}

function domainErrorMessage(code) {
  if (code === 'CALCULATION_OUT_OF_SUPPORTED_DOMAIN') return 'Calculation day is outside the exact engine gate domain.';
  if (code === 'TARGET_OUT_OF_SUPPORTED_DOMAIN') return 'Target day or range is outside the exact engine gate domain.';
  return 'Requested year is outside the exact engine gate domain.';
}
async function runJson(binary, args, { cwd, timeoutMs, maxBuffer, execFileRunner = execFileAsync, domainKind }) {
  try {
    const { stdout } = await execFileRunner(binary, args, { cwd, encoding: 'utf8', timeout: timeoutMs, maxBuffer, windowsHide: true });
    return JSON.parse(stdout);
  } catch (error) {
    if (error?.code === 'ENOENT') throw queryError('SEER_UNAVAILABLE', 'Exact Seer engine executable could not be started.', { cause: error });
    if (error?.killed || error?.signal) throw queryError('SEER_UNAVAILABLE', 'Exact Seer engine timed out or was terminated.', { cause: error });
    const domainCode = classifyNativeDomainFailure(error, domainKind);
    if (domainCode) throw queryError(domainCode, domainErrorMessage(domainCode), { cause: error });
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

function ensureDiagonal(parsed, { start, count, step }) {
  if (!parsed || parsed.schema !== 1 || parsed.targetStartJdn !== start ||
      parsed.targetCount !== count || parsed.stepDays !== step ||
      !Array.isArray(parsed.records) || parsed.records.length !== count) {
    throw queryError('SEER_UNAVAILABLE', 'Exact Seer diagonal engine returned an unexpected payload.');
  }
  for (let i = 0; i < parsed.records.length; i += 1) {
    const record = parsed.records[i];
    const ints = ['targetJdn', 'year', 'cutletIndex', 'dayInCutlet', 'monthIndex', 'dayInMonth', 'cutletCount', 'monthCount'];
    if (!record || typeof record !== 'object') throw queryError('SEER_UNAVAILABLE', 'Exact Seer diagonal engine returned a non-object record.');
    for (const key of ints) if (!Number.isInteger(record[key])) throw queryError('SEER_UNAVAILABLE', `Exact Seer diagonal record has invalid ${key}.`);
    if (record.targetJdn !== start + i * step) throw queryError('SEER_UNAVAILABLE', 'Exact Seer diagonal engine returned an unexpected target sequence.');
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

export function createExactEngine({ generatedDir, yearBatchBinary, yearLocatorBinary, yearStructureBinary, engineServiceBinary, dataDir, timeoutMs = DEFAULT_TIMEOUT_MS, maxBuffer = DEFAULT_MAX_BUFFER, execFileRunner = execFileAsync, serviceSpawnRunner = spawn, maxConcurrency, maxQueue } = {}) {
  if (!generatedDir) throw new TypeError('generatedDir is required');
  const rootDir = path.resolve(generatedDir, '..');
  const cwd = dataDir ?? path.join(rootDir, 'prototype', 'data');
  const admission = createExactAdmission({ maxConcurrency, maxQueue });
  async function batchBinary() { return resolveBinary({ explicit: yearBatchBinary, envName: 'SEER_YEAR_BATCH_BIN', rootDir, basename: 'seer_year_batch' }); }
  async function locatorBinary() { return resolveBinary({ explicit: yearLocatorBinary, envName: 'SEER_YEAR_LOCATOR_BIN', rootDir, basename: 'seer_year_locator' }); }
  async function optionalStructureBinary() {
    const candidates = [yearStructureBinary, process.env.SEER_YEAR_STRUCTURE_BIN];
    if (process.platform === 'win32') candidates.push(path.join(rootDir, 'prototype', 'build', 'seer_year_structure.exe'));
    candidates.push(path.join(rootDir, 'prototype', 'build', 'seer_year_structure'));
    const found = await firstExisting(candidates);
    if (found) return found;
    try {
      return await resolvePrebuiltBinary({ rootDir, basename: 'seer_year_structure' });
    } catch (error) {
      throw queryError('SEER_UNAVAILABLE', error.message, {
        details: { binary: 'seer_year_structure', env: 'SEER_YEAR_STRUCTURE_BIN', ...(error.details ?? {}) },
        cause: error,
      });
    }
  }

  async function optionalServiceBinary() {
    const candidates = [engineServiceBinary, process.env.SEER_ENGINE_SERVICE_BIN];
    if (process.platform === 'win32') candidates.push(path.join(rootDir, 'prototype', 'build', 'seer_engine_service.exe'));
    candidates.push(path.join(rootDir, 'prototype', 'build', 'seer_engine_service'));
    const found = await firstExisting(candidates);
    if (found) return found;
    return resolvePrebuiltBinary({ rootDir, basename: 'seer_engine_service' });
  }

  const requireService = process.env.SEER_REQUIRE_ENGINE_SERVICE === '1';

  async function serviceRequest(fields, { allowUnsupportedCommand = false } = {}) {
    const binary = await optionalServiceBinary();
    if (!binary) {
      if (requireService) throw queryError('SEER_UNAVAILABLE', 'Persistent Seer engine service is required but unavailable.');
      return null;
    }
    try {
      const client = await getEngineServiceClient(binary, cwd, { spawnRunner: serviceSpawnRunner });
      return await client.request(fields, { timeoutMs });
    } catch (error) {
      if (allowUnsupportedCommand && error?.serviceFailure === 'request' &&
          /unknown service command/i.test(String(error?.message ?? ''))) {
        return null;
      }
      if (DOMAIN_ERROR_CODES.has(error?.seerCode)) {
        throw queryError(error.seerCode, domainErrorMessage(error.seerCode), { cause: error });
      }
      const failure = typeof error?.serviceFailure === 'string' ? error.serviceFailure : 'failed';
      if (requireService || failure === 'overloaded') {
        throw queryError(
          'SEER_UNAVAILABLE',
          failure === 'timeout'
            ? 'Persistent Seer engine service timed out.'
            : failure === 'overloaded'
              ? 'Persistent Seer engine service is overloaded.'
              : 'Persistent Seer engine service failed.',
          { details: { serviceFailure: failure }, cause: error },
        );
      }
      return null;
    }
  }

  async function queryRangeRaw({ calculationJdn, targetStartJdn, count }) {
    const calc = safeInteger(calculationJdn, 'calculation.jdn', 'CALCULATION_OUT_OF_SUPPORTED_DOMAIN');
    const start = safeInteger(targetStartJdn, 'target.jdn', 'TARGET_OUT_OF_SUPPORTED_DOMAIN');
    const size = safeCount(count);
    const serviceParsed = await serviceRequest(['R', String(calc), String(start), String(size)]);
    const parsed = serviceParsed
      ? ensureBatch(serviceParsed, { calc, start, count: size })
      : ensureBatch(await runJson(await batchBinary(), [String(calc), String(start), String(size)], { cwd, timeoutMs, maxBuffer, execFileRunner, domainKind: 'range' }), { calc, start, count: size });
    return {
      records: parsed.records,
      provenance: { ...(typeof parsed.engine === 'string' ? { engineRevision: parsed.engine } : {}) },
    };
  }

  async function queryDiagonalRaw({ targetStartJdn, count, stepDays = 1 }) {
    const start = safeInteger(targetStartJdn, 'target.jdn', 'CALCULATION_OUT_OF_SUPPORTED_DOMAIN');
    const size = safeCount(count);
    const step = safeInteger(stepDays, 'stepDays', 'CALCULATION_OUT_OF_SUPPORTED_DOMAIN');
    if (step === 0) throw queryError('INVALID_RANGE_STEP', 'stepDays must not be zero.', { field: 'stepDays' });
    const last = BigInt(start) + BigInt(size - 1) * BigInt(step);
    if (last < BigInt(Number.MIN_SAFE_INTEGER) || last > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw queryError('CALCULATION_OUT_OF_SUPPORTED_DOMAIN', 'Diagonal range is outside the exact engine integer domain.');
    }

    const serviceParsed = await serviceRequest(
      ['D', String(start), String(size), String(step)],
      { allowUnsupportedCommand: true },
    );
    if (serviceParsed) {
      const parsed = ensureDiagonal(serviceParsed, { start, count: size, step });
      return {
        records: parsed.records,
        provenance: { ...(typeof parsed.engine === 'string' ? { engineRevision: parsed.engine } : {}) },
      };
    }

    const records = [];
    let provenance = {};
    for (let i = 0; i < size; i += 1) {
      const day = start + i * step;
      const supplied = await queryRangeRaw({ calculationJdn: day, targetStartJdn: day, count: 1 });
      records.push(supplied.records[0]);
      if (i === 0) provenance = supplied.provenance;
    }
    return { records, provenance };
  }
  async function yearRaw({ calculationJdn, year, includeDays = false }) {
    const calc = safeInteger(calculationJdn, 'calculation.jdn', 'CALCULATION_OUT_OF_SUPPORTED_DOMAIN');
    const requestedYear = safeInteger(year, 'year', 'YEAR_OUT_OF_SUPPORTED_DOMAIN');
    const serviceParsed = await serviceRequest(['Y', String(calc), String(requestedYear), includeDays ? '1' : '0']);
    if (serviceParsed) {
      return {
        year: yearFromStructurePayload(serviceParsed, { calc, requestedYear, includeDays }),
        provenance: { ...(typeof serviceParsed.engine === 'string' ? { engineRevision: serviceParsed.engine } : {}) },
      };
    }
    const structureBinary = await optionalStructureBinary();
    if (structureBinary) {
      const parsed = await runJson(structureBinary, [String(calc), String(requestedYear), includeDays ? '1' : '0'], { cwd, timeoutMs, maxBuffer, execFileRunner, domainKind: 'year' });
      return {
        year: yearFromStructurePayload(parsed, { calc, requestedYear, includeDays }),
        provenance: { ...(typeof parsed.engine === 'string' ? { engineRevision: parsed.engine } : {}) },
      };
    }
    // Compatibility fallback while older build environments have not yet built seer_year_structure.
    const located = await runJson(await locatorBinary(), [String(calc), String(requestedYear)], { cwd, timeoutMs, maxBuffer, execFileRunner, domainKind: 'year' });
    if (!located || located.schema !== 1 || located.calcJdn !== calc || located.year !== requestedYear || !Number.isInteger(located.startJdn) || !Number.isInteger(located.endJdn) || !Number.isInteger(located.lengthDays)) throw queryError('SEER_UNAVAILABLE', 'Exact Seer year locator returned an unexpected payload.');
    if (located.lengthDays < 1 || located.lengthDays > MAX_BATCH_COUNT || located.endJdn - located.startJdn + 1 !== located.lengthDays) throw queryError('SEER_UNAVAILABLE', 'Exact Seer year locator returned invalid boundaries.');
    const supplied = await queryRangeRaw({ calculationJdn: calc, targetStartJdn: located.startJdn, count: located.lengthDays });
    const batch = { records: supplied.records };
    return { year: structureFromYearRecords(located, batch, includeDays), provenance: supplied.provenance };
  }

  function runAdmitted(task) {
    return admission.run(() => PROCESS_EXACT_ADMISSION.run(task));
  }

  async function probe({ timeoutMs: probeTimeoutMs = Math.min(timeoutMs, 1000) } = {}) {
    const deadlineMs = Number.isFinite(probeTimeoutMs) && probeTimeoutMs > 0
      ? Math.max(1, Math.floor(probeTimeoutMs))
      : 1000;
    const serviceBinary = await optionalServiceBinary();
    if (serviceBinary) {
      try {
        const client = await getEngineServiceClient(serviceBinary, cwd, { spawnRunner: serviceSpawnRunner });
        const response = await client.request(['S'], { timeoutMs: deadlineMs });
        if (!response || response.schema !== 1 || typeof response.engine !== 'string' || !response.stats || typeof response.stats !== 'object') {
          throw serviceFailure('protocol', 'persistent Seer engine service health response was invalid');
        }
        return Object.freeze({ mode: 'service' });
      } catch (error) {
        if (requireService) {
          const failure = typeof error?.serviceFailure === 'string' ? error.serviceFailure : 'failed';
          throw queryError('SEER_UNAVAILABLE', 'Persistent Seer engine service health probe failed.', {
            details: { serviceFailure: failure }, cause: error,
          });
        }
      }
    } else if (requireService) {
      throw queryError('SEER_UNAVAILABLE', 'Persistent Seer engine service is required but unavailable.');
    }

    await Promise.all([
      batchBinary(),
      locatorBinary(),
      access(path.join(cwd, 'gates_100k_u16.bin')),
      access(path.join(cwd, 'gates_negative_100k_u16.bin')),
    ]).catch((error) => {
      throw queryError('SEER_UNAVAILABLE', 'Exact Seer engine runtime is unavailable.', { cause: error });
    });
    return Object.freeze({ mode: 'oneshot' });
  }

  return Object.freeze({
    id: 'seer-v12-exact-process',
    probe,
    queryRange(args) {
      return runAdmitted(() => queryRangeRaw(args));
    },
    queryDiagonal(args) {
      return runAdmitted(() => queryDiagonalRaw(args));
    },
    query({ calculationJdn, targetJdn }) {
      return runAdmitted(async () => {
        const supplied = await queryRangeRaw({ calculationJdn, targetStartJdn: targetJdn, count: 1 });
        const record = supplied.records[0];
        return { record, structure: { cutletCount: record.cutletCount, monthCount: record.monthCount }, provenance: supplied.provenance };
      });
    },
    year(args) {
      return runAdmitted(() => yearRaw(args));
    },
  });
}
