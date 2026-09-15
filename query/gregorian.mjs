import { parseExactInteger } from './exact-integer.mjs';
import { queryError } from './errors.mjs';

const JDN_UNIX_EPOCH = 2440588n;
const DAYS_0000_TO_1970 = 719468n;
const DAYS_PER_400_YEARS = 146097n;

function floorDiv(a, b) {
  let q = a / b;
  const r = a % b;
  if (r !== 0n && ((r > 0n) !== (b > 0n))) q -= 1n;
  return q;
}

function isLeapAstronomical(year) {
  return year % 4n === 0n && (year % 100n !== 0n || year % 400n === 0n);
}

function daysInMonth(year, month) {
  if (month === 2) return isLeapAstronomical(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function parseEraDate(input, field = 'target.gregorian') {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw queryError('INVALID_GREGORIAN_DATE', 'gregorian must be YYYY-MM-DD or an era/year/month/day object.', { field });
  }
  const allowed = new Set(['era', 'year', 'month', 'day']);
  for (const key of Object.keys(input)) if (!allowed.has(key)) {
    throw queryError('UNKNOWN_PARAMETER', `Unknown Gregorian-date field: ${key}.`, { field: `${field}.${key}` });
  }
  if (input.era !== 'CE' && input.era !== 'BCE') {
    throw queryError('INVALID_GREGORIAN_DATE', 'era must be CE or BCE.', { field: `${field}.era` });
  }
  const yearCivil = parseExactInteger(input.year, `${field}.year`);
  if (yearCivil <= 0n) throw queryError('INVALID_GREGORIAN_DATE', 'Gregorian era year must be positive.', { field: `${field}.year` });
  if (!Number.isInteger(input.month) || input.month < 1 || input.month > 12) {
    throw queryError('INVALID_GREGORIAN_DATE', 'Gregorian month must be 1..12.', { field: `${field}.month` });
  }
  const astronomicalYear = input.era === 'CE' ? yearCivil : 1n - yearCivil;
  const maxDay = daysInMonth(astronomicalYear, input.month);
  if (!Number.isInteger(input.day) || input.day < 1 || input.day > maxDay) {
    throw queryError('INVALID_GREGORIAN_DATE', 'Gregorian day is outside the selected month.', { field: `${field}.day` });
  }
  return { astronomicalYear, month: input.month, day: input.day };
}

export function parseGregorian(input, field = 'target.gregorian') {
  if (typeof input === 'string') {
    const match = /^([1-9][0-9]{3,})-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.exec(input);
    if (!match) throw queryError('INVALID_GREGORIAN_DATE', 'Short Gregorian dates must use CE YYYY-MM-DD with no year zero.', { field });
    return parseEraDate({ era: 'CE', year: match[1], month: Number(match[2]), day: Number(match[3]) }, field);
  }
  return parseEraDate(input, field);
}

export function gregorianToJdn(input, field = 'target.gregorian') {
  const { astronomicalYear: originalYear, month, day } = parseGregorian(input, field);
  let y = originalYear;
  if (month <= 2) y -= 1n;
  const era = floorDiv(y, 400n);
  const yoe = y - era * 400n;
  const mp = BigInt(month + (month > 2 ? -3 : 9));
  const doy = floorDiv(153n * mp + 2n, 5n) + BigInt(day) - 1n;
  const doe = yoe * 365n + floorDiv(yoe, 4n) - floorDiv(yoe, 100n) + doy;
  const daysSinceEpoch = era * DAYS_PER_400_YEARS + doe - DAYS_0000_TO_1970;
  return daysSinceEpoch + JDN_UNIX_EPOCH;
}

export function jdnToGregorian(jdnInput) {
  const jdn = typeof jdnInput === 'bigint' ? jdnInput : parseExactInteger(jdnInput, 'target.jdn');
  let z = jdn - JDN_UNIX_EPOCH + DAYS_0000_TO_1970;
  const era = floorDiv(z, DAYS_PER_400_YEARS);
  const doe = z - era * DAYS_PER_400_YEARS;
  const yoe = floorDiv(doe - floorDiv(doe, 1460n) + floorDiv(doe, 36524n) - floorDiv(doe, 146096n), 365n);
  let y = yoe + era * 400n;
  const doy = doe - (365n * yoe + floorDiv(yoe, 4n) - floorDiv(yoe, 100n));
  const mp = floorDiv(5n * doy + 2n, 153n);
  const day = Number(doy - floorDiv(153n * mp + 2n, 5n) + 1n);
  const month = Number(mp + (mp < 10n ? 3n : -9n));
  if (month <= 2) y += 1n;
  if (y >= 1n) return { era: 'CE', year: y.toString(), month, day };
  return { era: 'BCE', year: (1n - y).toString(), month, day };
}
