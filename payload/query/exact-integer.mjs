import { queryError } from './errors.mjs';

const CANONICAL_INTEGER = /^(?:0|-?[1-9][0-9]*)$/;
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE = BigInt(Number.MIN_SAFE_INTEGER);

export function parseExactInteger(value, field = 'value') {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw queryError('INVALID_INTEGER', `${field} must be a safe integer number or a canonical decimal string.`, { field });
    }
    return BigInt(value);
  }
  if (typeof value === 'string' && CANONICAL_INTEGER.test(value)) return BigInt(value);
  throw queryError('INVALID_INTEGER', `${field} must be an integer in canonical decimal notation.`, { field });
}

export function exactIntegerString(value) {
  return (typeof value === 'bigint' ? value : parseExactInteger(value)).toString();
}

export function exactIntegerToSafeNumber(value, { field = 'value', code = 'TARGET_OUT_OF_SUPPORTED_DOMAIN' } = {}) {
  const n = typeof value === 'bigint' ? value : parseExactInteger(value, field);
  if (n < MIN_SAFE || n > MAX_SAFE) {
    throw queryError(code, `${field} is outside the numeric domain of the current provider.`, { field });
  }
  return Number(n);
}
