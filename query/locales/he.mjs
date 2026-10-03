const isolate = (value) => `\u2068${String(value)}\u2069`;

export const CUTLET_NAMES = Object.freeze([
  'ארד', 'שועל', 'כליה', 'לגש', 'מחשבה', 'ארבעה חלקים מתשעה', 'פַּלְגּוּרַשׁ',
  'גומא', 'אשכול', 'עקרב', 'אפר', 'חיטה', 'נהר', 'צחוק', 'אכד', 'קרן', 'הכד הריק',
]);

export const MONTH_NAMES = Object.freeze([
  'טין', 'רימון', 'מרפק', 'קנאה', 'ארידו', 'משחת־שיניים', 'שלושה חלקים מחמישה',
  'כַּרְשׁוּמַב', 'נמר', 'בדיל', 'ערפל', 'לבונה', 'כישור', 'צלע', 'חרוב', 'אורוק',
  'בושה', 'גמל', 'נחושת', 'באר', 'חלמון', 'כוכב', 'דבש', 'טחול', 'אבן־גיר', 'שמחה',
  'תאנה', 'נינוה', 'צפרדע', 'זפת', 'נר', 'הדלת הסגורה', 'שומשום', 'עורף', 'כסף',
  'שושן', 'סערה', 'חמור', 'קמח', 'חרטה', 'בבל', 'לשון', 'פשתן', 'מלח', 'אגס',
  'קשת', 'חול',
]);

export function formatHebrew({ year, cutlet, month }) {
  return `שנה ${isolate(year)} — ${isolate(cutlet.name)}, יום ${isolate(cutlet.day)}; ${isolate(month.name)}, יום ${isolate(month.day)}`;
}

export const LOCALE_PACK = Object.freeze({
  schemaVersion: 1,
  version: '1.1.0',
  code: 'he',
  name: 'Hebrew',
  selfName: 'עברית',
  direction: 'rtl',
  properNamePolicy: 'localized',
  cutlets: CUTLET_NAMES,
  months: MONTH_NAMES,
  formatDate: formatHebrew,
});
