#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { queryBatch, queryCalculationDay, queryDate, queryNow, queryRange, queryReverse, queryYear, SeerQueryError } from './index.mjs';

function usage(stream = process.stderr) {
  stream.write(`usage:
  node query/cli.mjs [date] [date options]
  node query/cli.mjs now [date presentation options]
  node query/cli.mjs calculation-day [--at RFC3339] [--longitude DEG] [--include boundaries]
  node query/cli.mjs range [range options]
  node query/cli.mjs reverse --year YEAR --cutlet INDEX --day-in-cutlet DAY --month INDEX --day-in-month DAY [options]
  node query/cli.mjs year YEAR [year options]
  node query/cli.mjs batch REQUEST.json

Date options:
  --target YYYY-MM-DD | --target-jdn JDN | --offset-days N
  --calculation-at RFC3339 | --calculation-jdn JDN
  --longitude DEG | --preset kisurra
  --locale CODE
  --canonical
  --include name,name

Range options:
  --start YYYY-MM-DD | --start-jdn JDN | --start-offset N
  --count N | --end YYYY-MM-DD | --end-jdn JDN | --end-offset N
  --step-days N
  --same-as-target
  plus calculation/observer/presentation options above
`);
}

function valueAfter(args, state) {
  if (state.i + 1 >= args.length) { usage(); process.exit(2); }
  return args[++state.i];
}

function setObserver(request, key, value) {
  request.observer ??= {};
  request.observer[key] = value;
}

function parseCommon(args, request, state, { allowTarget = true, allowCalculation = true } = {}) {
  const arg = args[state.i];
  const next = () => valueAfter(args, state);
  if (allowTarget && arg === '--target') request.target = { gregorian: next() };
  else if (allowTarget && arg === '--target-jdn') request.target = { jdn: next() };
  else if (allowTarget && arg === '--offset-days') request.target = { offsetDays: next() };
  else if (allowCalculation && arg === '--calculation-at') request.calculation = { at: next() };
  else if (allowCalculation && arg === '--calculation-jdn') request.calculation = { jdn: next() };
  else if (arg === '--longitude') setObserver(request, 'longitude', Number(next()));
  else if (arg === '--preset') setObserver(request, 'preset', next());
  else if (arg === '--locale') request.locale = next();
  else if (arg === '--canonical') request.presentation = 'canonical';
  else if (arg === '--include') request.include = next().split(',').filter(Boolean);
  else return false;
  return true;
}

function dateRequest(args) {
  const request = {};
  const state = { i: 0 };
  for (; state.i < args.length; state.i += 1) {
    if (!parseCommon(args, request, state)) throw new Error(`unknown argument: ${args[state.i]}`);
  }
  return request;
}

function rangeRequest(args) {
  const request = {};
  const state = { i: 0 };
  for (; state.i < args.length; state.i += 1) {
    const arg = args[state.i];
    const next = () => valueAfter(args, state);
    if (arg === '--start') request.start = { gregorian: next() };
    else if (arg === '--start-jdn') request.start = { jdn: next() };
    else if (arg === '--start-offset') request.start = { offsetDays: next() };
    else if (arg === '--count') request.count = next();
    else if (arg === '--end') request.endInclusive = { gregorian: next() };
    else if (arg === '--end-jdn') request.endInclusive = { jdn: next() };
    else if (arg === '--end-offset') request.endInclusive = { offsetDays: next() };
    else if (arg === '--step-days') request.stepDays = next();
    else if (arg === '--same-as-target') request.calculationMode = 'same-as-target';
    else if (!parseCommon(args, request, state, { allowTarget: false })) throw new Error(`unknown argument: ${arg}`);
  }
  return request;
}

function reverseRequest(args) {
  const request = { pastafarianDate: { cutlet: {}, month: {} } };
  const state = { i: 0 };
  for (; state.i < args.length; state.i += 1) {
    const arg = args[state.i];
    const next = () => valueAfter(args, state);
    if (arg === '--year') request.pastafarianDate.year = next();
    else if (arg === '--cutlet') request.pastafarianDate.cutlet.canonicalIndex = next();
    else if (arg === '--day-in-cutlet') request.pastafarianDate.cutlet.day = next();
    else if (arg === '--month') request.pastafarianDate.month.canonicalIndex = next();
    else if (arg === '--day-in-month') request.pastafarianDate.month.day = next();
    else if (!parseCommon(args, request, state, { allowTarget: false })) throw new Error(`unknown argument: ${arg}`);
  }
  return request;
}
function calculationDayRequest(args) {
  const request = {};
  const state = { i: 0 };
  for (; state.i < args.length; state.i += 1) {
    const arg = args[state.i];
    const next = () => valueAfter(args, state);
    if (arg === '--at') request.at = next();
    else if (arg === '--longitude') setObserver(request, 'longitude', Number(next()));
    else if (arg === '--preset') setObserver(request, 'preset', next());
    else if (arg === '--include') request.include = next().split(',').filter(Boolean);
    else throw new Error(`unknown argument: ${arg}`);
  }
  return request;
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 1 && (argv[0] === '--help' || argv[0] === '-h')) {
    usage(process.stdout);
    return undefined;
  }
  const known = new Set(['date', 'now', 'calculation-day', 'range', 'reverse', 'year', 'batch']);
  const command = argv.length > 0 && known.has(argv[0]) ? argv.shift() : 'date';
  if (command === 'date') return queryDate(dateRequest(argv));
  if (command === 'now') return queryNow(dateRequest(argv));
  if (command === 'calculation-day') return queryCalculationDay(calculationDayRequest(argv));
  if (command === 'range') return queryRange(rangeRequest(argv));
  if (command === 'reverse') return queryReverse(reverseRequest(argv));
  if (command === 'year') {
    if (argv.length === 0) throw new Error('year requires YEAR');
    const year = argv.shift();
    return queryYear(year, dateRequest(argv));
  }
  if (command === 'batch') {
    if (argv.length !== 1) throw new Error('batch requires exactly one JSON file');
    return queryBatch(JSON.parse(await readFile(argv[0], 'utf8')));
  }
  throw new Error(`unsupported command: ${command}`);
}

try {
  const result = await main();
  if (result !== undefined) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  if (error instanceof SeerQueryError) {
    console.error(JSON.stringify({ error: { code: error.code, message: error.message, ...(error.field ? { field: error.field } : {}), ...(error.details !== undefined ? { details: error.details } : {}) } }));
    process.exit(error.code === 'SEER_UNAVAILABLE' ? 3 : 2);
  }
  console.error(error?.stack ?? String(error));
  usage();
  process.exit(1);
}
