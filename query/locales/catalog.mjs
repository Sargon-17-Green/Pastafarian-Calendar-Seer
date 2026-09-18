import { queryError } from '../errors.mjs';
import { LOCALE_PACK as ENGLISH } from './en.mjs';
import { LOCALE_PACK as HEBREW } from './he.mjs';

export const LOCALE_PACK_SCHEMA_VERSION = 1;
export const DEFAULT_LOCALE = 'en';

const STRUCTURAL_BCP47 = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/;

function canonicalizeLocaleCode(value, { runtimeError = false } = {}) {
  const fail = (message) => {
    if (runtimeError) throw queryError('INVALID_LOCALE', message, { field: 'locale' });
    throw new TypeError(message);
  };
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim() || !STRUCTURAL_BCP47.test(value)) {
    return fail(`Invalid BCP 47 locale code: ${String(value)}.`);
  }
  try {
    Intl.getCanonicalLocales(value);
  } catch {
    return fail(`Invalid BCP 47 locale code: ${value}.`);
  }
  const parts = value.split('-');
  return parts.map((part, index) => {
    if (index === 0) return part.toLowerCase();
    if (/^[A-Za-z]{4}$/.test(part)) return part[0].toUpperCase() + part.slice(1).toLowerCase();
    if (/^[A-Za-z]{2}$/.test(part)) return part.toUpperCase();
    return part.toLowerCase();
  }).join('-');
}

export function validateLocalePack(pack) {
  if (!pack || typeof pack !== 'object' || Array.isArray(pack)) throw new TypeError('locale pack must be an object');
  if (pack.schemaVersion !== LOCALE_PACK_SCHEMA_VERSION) throw new TypeError(`unsupported locale pack schemaVersion: ${pack.schemaVersion}`);
  if (typeof pack.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(pack.version)) throw new TypeError('locale pack version must be semver-like');
  const canonical = canonicalizeLocaleCode(pack.code);
  if (canonical !== pack.code) throw new TypeError(`locale pack code must use canonical BCP 47 casing: ${pack.code}`);
  if (typeof pack.name !== 'string' || !pack.name.trim()) throw new TypeError('locale pack name is required');
  if (typeof pack.selfName !== 'string' || !pack.selfName.trim()) throw new TypeError('locale pack selfName is required');
  if (pack.direction !== 'ltr' && pack.direction !== 'rtl') throw new TypeError('locale pack direction must be ltr or rtl');
  if (!['localized', 'english-retained'].includes(pack.properNamePolicy)) throw new TypeError('locale pack properNamePolicy is invalid');
  if (typeof pack.formatDate !== 'function') throw new TypeError('locale pack formatDate function is required');
  for (const [kind, values, expected] of [['cutlet', pack.cutlets, 17], ['month', pack.months, 47]]) {
    if (!Array.isArray(values) || values.length !== expected) throw new TypeError(`locale pack must contain exactly ${expected} ${kind} names`);
    const seen = new Set();
    for (let index = 0; index < values.length; index += 1) {
      const name = values[index];
      if (typeof name !== 'string' || !name.trim()) throw new TypeError(`locale pack ${kind} ${index + 1} is empty`);
      if (seen.has(name)) throw new TypeError(`locale pack has duplicate ${kind} display name: ${name}`);
      seen.add(name);
    }
  }
  return pack;
}

const PACKS = Object.freeze([ENGLISH, HEBREW].map(validateLocalePack));
const BY_CODE = new Map(PACKS.map((pack) => [pack.code, pack]));

export function normalizeLocaleCode(value) {
  return canonicalizeLocaleCode(value, { runtimeError: true });
}

export function getLocalePack(value = DEFAULT_LOCALE) {
  const code = normalizeLocaleCode(value);
  const pack = BY_CODE.get(code);
  if (!pack) throw queryError('LOCALE_NOT_SUPPORTED', `Unsupported locale: ${code}.`, { field: 'locale' });
  return pack;
}

export function localizedName(pack, kind, canonicalIndex) {
  const table = kind === 'cutlet' ? pack.cutlets : kind === 'month' ? pack.months : null;
  if (!table || !Number.isInteger(canonicalIndex) || canonicalIndex < 1 || canonicalIndex > table.length) {
    throw new RangeError(`invalid ${kind} canonical index ${canonicalIndex}`);
  }
  return table[canonicalIndex - 1];
}

export function listLocales() {
  return Object.freeze(PACKS.map((pack) => Object.freeze({
    tag: pack.code,
    code: pack.code,
    name: pack.name,
    selfName: pack.selfName,
    direction: pack.direction,
    default: pack.code === DEFAULT_LOCALE,
    schemaVersion: pack.schemaVersion,
    version: pack.version,
    properNamePolicy: pack.properNamePolicy,
  })));
}
