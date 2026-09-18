import { CUTLET_NAMES, MONTH_NAMES } from './en.mjs';

const isolate = (value) => `\u2068${String(value)}\u2069`;

export function formatHebrew({ year, cutlet, month }) {
  return `שנה ${isolate(year)} — ${isolate(cutlet.name)}, יום ${isolate(cutlet.day)}; ${isolate(month.name)}, יום ${isolate(month.day)}`;
}

export const LOCALE_PACK = Object.freeze({
  schemaVersion: 1,
  version: '1.0.0',
  code: 'he',
  name: 'Hebrew',
  selfName: 'עברית',
  direction: 'rtl',
  properNamePolicy: 'english-retained',
  cutlets: CUTLET_NAMES,
  months: MONTH_NAMES,
  formatDate: formatHebrew,
});
