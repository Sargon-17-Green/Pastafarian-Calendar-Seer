const UI_LOCALES = Object.freeze({
  en: Object.freeze({ code: 'en', direction: 'ltr', selfName: 'English' }),
  he: Object.freeze({ code: 'he', direction: 'rtl', selfName: 'עברית' }),
});

const HE = Object.freeze({
  'Pastafarian Calendar Seer': 'לוח השנה הפסטפרי — Seer',
  'Skip to queries': 'דלג לשאילתות',
  'Pastafarian Calendar': 'לוח השנה הפסטפרי',
  'Seer': 'Seer',
  'Look up Pastafarian dates and calendar structures. Advanced API controls remain available when you need them.':
    'חפש תאריכים ומבני לוח פסטפריים. פקדי API מתקדמים נשארים זמינים בעת הצורך.',
  'Checking API…': 'בודק את ה־API…',
  'No status response yet.': 'טרם התקבלה תשובת מצב.',
  'Refresh status': 'רענן מצב',
  'Seer connection and shared query controls': 'חיבור ל־Seer ופקדים משותפים לשאילתות',
  'Connection & API diagnostics (advanced)': 'חיבור ואבחון API (מתקדם)',
  'API base URL': 'כתובת בסיס של ה־API',
  'Same origin (empty) or https://seer.example': 'אותו מקור (ריק) או https://seer.example',
  'Empty means same origin. A runtime config.js or ?apiBase= can set a remote API.':
    'שדה ריק פירושו אותו מקור. config.js בזמן ריצה או ?apiBase= יכולים להגדיר API מרוחק.',
  'Empty means same origin. A runtime': 'שדה ריק פירושו אותו מקור. קובץ',
  'or': 'בזמן ריצה או',
  'can set a remote API.': 'יכולים להגדיר API מרוחק.',
  'Apply API base': 'החל כתובת API',
  'API diagnostics': 'אבחון API',
  'API version': 'גרסת API',
  'Locales': 'שפות תצוגה',
  'Reverse': 'המרה לאחור',
  'Raw API metadata': 'מטא־נתוני API גולמיים',
  'No metadata loaded.': 'לא נטענו מטא־נתונים.',
  'Presentation': 'תצוגה',
  'Interface language': 'שפת הממשק',
  'Response presentation': 'אופן הצגת התשובה',
  'Full': 'מלאה',
  'Canonical': 'קאנונית',
  'Presentation locale': 'שפת תוצאת התאריך',
  'Locale choices are discovered from /v1/locales. Canonical presentation ignores locale.':
    'אפשרויות שפת התוצאה מתקבלות מ־/v1/locales. תצוגה קאנונית מתעלמת משפה.',
  'Locale choices are discovered from': 'אפשרויות שפת התוצאה מתקבלות מ־',
  '. Canonical presentation ignores locale.': '. תצוגה קאנונית מתעלמת מן השפה.',
  'Calculation day': 'יום המעשה',
  'Calculation day controls the mapping. Target day is the day being asked about. They are distinct inputs.':
    'יום המעשה קובע את המיפוי. היום הנשאל הוא היום שאת תאריכו מבקשים. אלה שני קלטים נפרדים.',
  'controls the mapping.': 'קובע את המיפוי.',
  'Target day': 'היום הנשאל',
  'is the day being asked about. They are distinct inputs.': 'הוא היום שרוצים לדעת את תאריכו. אלה שני קלטים נפרדים.',
  'Calculation selector': 'בחירת יום המעשה',
  'Automatic / live': 'אוטומטי / חי',
  'Explicit JDN': 'JDN מפורש',
  'Explicit instant': 'רגע מפורש',
  'Calculation JDN': 'JDN של יום המעשה',
  'Calculation instant (RFC 3339)': 'רגע יום המעשה (RFC 3339)',
  '“Today / Now” always uses live mode. Other query modes use this selector.':
    '„היום / עכשיו” משתמש תמיד במצב חי. שאר סוגי השאילתות משתמשים בבחירה הזאת.',
  'Observer': 'צופה',
  'Observer selector': 'בחירת צופה',
  'Kisurra preset': 'ברירת המחדל קיסורה',
  'Custom longitude': 'קו אורך מותאם',
  'Longitude (degrees, east-positive)': 'קו אורך (מעלות, מזרח חיובי)',
  'Latitude and elevation are not shown because they are compatibility no-ops in HTTP v1.':
    'קו רוחב וגובה אינם מוצגים משום שב־HTTP v1 הם שדות תאימות שאינם משפיעים על החישוב.',
  'Query modes': 'סוגי שאילתה',
  'Today / Now': 'היום / עכשיו',
  'Date': 'תאריך',
  'Reverse': 'המרה לאחור',
  'Year': 'שנה',
  'Range': 'טווח',
  'Resolve the currently active calculation day and show its Pastafarian date.':
    'חשב את יום המעשה הפעיל כעת והצג את התאריך הפסטפרי שלו.',
  'Refresh now': 'רענן עכשיו',
  'No query yet.': 'טרם בוצעה שאילתה.',
  'Date query': 'שאילתת תאריך',
  'Target selector — choose exactly one': 'בחירת היום הנשאל — יש לבחור אפשרות אחת בלבד',
  'Gregorian date': 'תאריך גרגוריאני',
  'Gregorian target date': 'התאריך הגרגוריאני של היום הנשאל',
  'Target JDN': 'JDN של היום הנשאל',
  'offsetDays': 'היסט ימים',
  'Target offset days': 'היסט הימים של היום הנשאל',
  'Only the selected target field is enabled and sent to the API.':
    'רק שדה היעד שנבחר מופעל ונשלח ל־API.',
  'Query date': 'חשב תאריך',
  'Reverse conversion': 'המרה לאחור',
  'Pastafarian year': 'שנה פסטפרית',
  'Choose units by name': 'בחר יחידות לפי שם',
  "Load this year's structure to choose cutlet and month names. The API still receives canonical indices.":
    'טען את מבנה השנה כדי לבחור שמות של קציצה וחודש. ה־API עדיין מקבל אינדקסים קאנוניים.',
  'Load names for this year': 'טען שמות לשנה הזאת',
  'Cutlet by name': 'קציצה לפי שם',
  'Month by name': 'חודש לפי שם',
  'Load names first': 'טען שמות תחילה',
  'Cutlet canonical index (manual or filled from name)': 'אינדקס קאנוני של הקציצה (ידני או ממולא לפי השם)',
  'Day in cutlet': 'יום בקציצה',
  'Month canonical index (manual or filled from name)': 'אינדקס קאנוני של החודש (ידני או ממולא לפי השם)',
  'Day in month': 'יום בחודש',
  'Reverse convert': 'המר לאחור',
  'Name choices are helpers only. Reverse conversion still sends the complete canonical tuple, and contradictory coordinates return the complete Seer error code.':
    'בחירת השמות היא שכבת עזר בלבד. ההמרה לאחור עדיין שולחת את החמישייה הקאנונית המלאה, וקואורדינטות סותרות מחזירות את קוד השגיאה המלא של Seer.',
  'Year structure': 'מבנה שנה',
  'Load every day (advanced; response can be large)': 'טען כל יום (מתקדם; התשובה עלולה להיות גדולה)',
  'Load year structure': 'טען מבנה שנה',
  'Range query': 'שאילתת טווח',
  'Start selector': 'בחירת תחילת הטווח',
  'Gregorian': 'גרגוריאני',
  'Range start Gregorian': 'תחילת הטווח — גרגוריאני',
  'Range start JDN': 'תחילת הטווח — JDN',
  'Range start offset': 'תחילת הטווח — היסט',
  'Range end': 'סוף הטווח',
  'Count': 'מספר תוצאות',
  'endInclusive': 'סוף כולל',
  'endInclusive selector': 'בחירת סוף כולל',
  'Range end Gregorian': 'סוף הטווח — גרגוריאני',
  'Range end JDN': 'סוף הטווח — JDN',
  'Range end offset': 'סוף הטווח — היסט',
  'stepDays': 'צעד בימים',
  'Calculation mode': 'מצב יום המעשה',
  'fixed': 'קבוע',
  'same-as-target': 'זהה ליום הנשאל',
  'Query range': 'חשב טווח',
  'Latest API exchange (advanced)': 'חילופי ה־API האחרונים (מתקדם)',
  'Transport details from the actual browser client request.': 'פרטי התעבורה של בקשת הדפדפן בפועל.',
  'Copy response JSON': 'העתק JSON של התשובה',
  'Method': 'שיטה',
  'Route / URL': 'נתיב / URL',
  'HTTP status': 'מצב HTTP',
  'Seer error code': 'קוד שגיאה של Seer',
  'Request payload': 'מטען הבקשה',
  'No request captured.': 'לא נלכדה בקשה.',
  'Raw response': 'תשובה גולמית',
  'No response captured.': 'לא נלכדה תשובה.',
  'This interface delegates all calendar semantics to pastafarian-calendar-seer/client and HTTP v1.':
    'הממשק מעביר את כל סמנטיקת הלוח ל־pastafarian-calendar-seer/client ול־HTTP v1.',
  'This interface delegates all calendar semantics to': 'הממשק מעביר את כל סמנטיקת הלוח אל',
  'and HTTP v1.': 'ואל HTTP v1.',
});

const DYNAMIC = Object.freeze({
  en: Object.freeze({
    networkFailure: 'Network failure',
    networkFailureExplain: 'The browser could not reach the Seer API. Check the API base URL, network, HTTPS, and CORS.',
    inputValidation: 'Input validation',
    inputValidationExplain: 'The browser did not send this request because the selected form inputs are incomplete or malformed.',
    serverUnavailable: 'Server unavailable',
    apiRejected: 'API request rejected',
    apiRejectedExplain: 'The Seer API rejected the request. The HTTP status and Seer error code below are authoritative.',
    outOfDomain: 'Out of supported domain',
    outOfDomainExplain: 'The Seer API reports that this operation is outside its supported exact domain.',
    exactUnavailable: 'Exact Seer operation unavailable',
    exactUnavailableExplain: 'The Seer service cannot currently perform this exact operation. This does not by itself mean the date is invalid.',
    requestFailed: 'Request failed.',
    noHttp: 'No HTTP response',
    noSeerCode: 'No Seer error code',
    httpStatus: 'HTTP status',
    seerErrorCode: 'Seer error code',
    message: 'Message',
    field: 'Field',
    errorDetails: 'Error details',
    noJsonBody: 'No JSON request body (GET or empty request).',
    currentDate: 'Current Pastafarian date',
    dateResult: 'Date result',
    reverseResult: 'Resolved reverse conversion',
    reverseNamesLoadFirst: 'Load names first',
    reverseNamesLoading: 'Loading names from this year structure…',
    reverseNamesLoaded: 'Names loaded for Pastafarian year {year}. Choosing a name fills its canonical index.',
    reverseNamesContextChanged: 'The year or calculation context changed while names were loading. Load the names again.',
    reverseNamesLoadFailed: 'Could not load names: {message}',
    reverseNamesMalformed: 'The year response did not contain cutlet/month structure.',
    chooseCutlet: 'Choose a cutlet',
    chooseMonth: 'Choose a month',
    localeSupportComplete: 'Source support: complete. The pinned presentation source is marked complete for this locale.',
    localeSupportPartial: 'Source support: partial. Seer has complete date formatting and all 17+47 names, but the pinned source has not completed broader linguistic/UI review.',
    localeSupportUnknown: 'Source support status is not available for this locale.',
    yearLabel: 'Pastafarian year',
    cutlet: 'Cutlet',
    month: 'Month',
    day: 'day',
    gregorianTarget: 'Gregorian target',
    targetJdn: 'Target JDN',
    calculationJdn: 'Calculation JDN',
    observer: 'Observer',
    observerUnused: 'Not used by this request',
    startJdn: 'Start JDN',
    endJdn: 'End JDN',
    totalDays: 'Total days',
    cutlets: 'Cutlets',
    months: 'Months',
    canonicalIndex: 'Canonical index',
    name: 'Name',
    length: 'Length',
    startOffset: 'Start offset',
    endOffset: 'End offset',
    offsets: 'Offsets',
    notExposed: 'Not exposed by HTTP v1',
    cutletsInYear: 'Cutlets in this year',
    monthsInYear: 'Months in this year',
    monthOffsetsHint: 'Month offsets are not part of the current YearResponse contract; the web app does not synthesize calendar semantics.',
    everyDay: 'Every day',
    jdn: 'JDN',
    gregorian: 'Gregorian',
    year: 'Year',
    dayInCutlet: 'Day in cutlet',
    dayInMonth: 'Day in month',
    daysReturned: 'Days returned by include=days',
    rangeCalculationJdn: 'Calculation JDN',
    rangeTargetJdn: 'Target JDN',
    cutletDay: 'Cutlet day',
    monthDay: 'Month day',
    rangeResults: 'Range query results',
    resolvingNow: 'Resolving the current Pastafarian date…',
    queryingDate: 'Querying date…',
    reverseConverting: 'Reverse converting…',
    loadingYear: 'Loading year structure…',
    loadingFullYear: 'Loading full year including every day…',
    queryingRange: 'Querying range…',
    checkingApi: 'Checking API…',
    sameOriginApi: 'Same-origin API',
    sameOrigin: 'Same origin',
    apiReady: 'API reachable — ready',
    apiReachable: 'API reachable — {status}',
    apiReachableUnavailable: 'API reachable — Seer unavailable',
    readinessHttp: 'HTTP {status}. The service answered but readiness is not OK.',
    apiUnavailable: 'API unavailable',
    metadataUnavailable: 'metadata unavailable',
    metadataUnavailableText: 'Metadata unavailable.',
    copied: 'Copied',
    copyFailed: 'Copy failed',
    copyResponse: 'Copy response JSON',
    showNext: 'Show next {count} rows',
    showingRows: 'Showing {visible} of {total} rows.',
    showingAll: 'Showing all {total} rows.',
    rangeResultTitle: 'Range result — {count} rows',
    yearTitle: 'Pastafarian year {year}',
  }),
  he: Object.freeze({
    networkFailure: 'כשל רשת',
    networkFailureExplain: 'הדפדפן לא הצליח להגיע ל־API של Seer. יש לבדוק את כתובת הבסיס של ה־API, את הרשת, HTTPS ו־CORS.',
    inputValidation: 'אימות קלט',
    inputValidationExplain: 'הדפדפן לא שלח את הבקשה מפני שהקלט שנבחר בטופס חסר או שגוי.',
    serverUnavailable: 'השרת אינו זמין',
    apiRejected: 'בקשת ה־API נדחתה',
    apiRejectedExplain: 'ה־API של Seer דחה את הבקשה. מצב HTTP וקוד השגיאה של Seer המוצגים להלן הם הנתונים הסמכותיים.',
    outOfDomain: 'מחוץ לתחום הנתמך',
    outOfDomainExplain: 'ה־API של Seer מדווח שהפעולה נמצאת מחוץ לתחום המדויק הנתמך.',
    exactUnavailable: 'פעולת Seer המדויקת אינה זמינה',
    exactUnavailableExplain: 'שירות Seer אינו יכול לבצע כעת את הפעולה המדויקת הזאת. מכך כשלעצמו לא נובע שהתאריך אינו תקין.',
    requestFailed: 'הבקשה נכשלה.',
    noHttp: 'אין תשובת HTTP',
    noSeerCode: 'אין קוד שגיאה של Seer',
    httpStatus: 'מצב HTTP',
    seerErrorCode: 'קוד שגיאה של Seer',
    message: 'הודעה',
    field: 'שדה',
    errorDetails: 'פרטי השגיאה',
    noJsonBody: 'אין גוף בקשת JSON (בקשת GET או בקשה ריקה).',
    currentDate: 'התאריך הפסטפרי הנוכחי',
    dateResult: 'תוצאת התאריך',
    reverseResult: 'תוצאת ההמרה לאחור',
    reverseNamesLoadFirst: 'טען שמות תחילה',
    reverseNamesLoading: 'טוען שמות ממבנה השנה…',
    reverseNamesLoaded: 'השמות נטענו לשנה הפסטפרית {year}. בחירת שם ממלאת את האינדקס הקאנוני שלו.',
    reverseNamesContextChanged: 'השנה או הקשר החישוב השתנו בזמן טעינת השמות. יש לטעון אותם מחדש.',
    reverseNamesLoadFailed: 'לא ניתן לטעון את השמות: {message}',
    reverseNamesMalformed: 'תשובת השנה לא כללה מבנה קציצות/חודשים.',
    chooseCutlet: 'בחר קציצה',
    chooseMonth: 'בחר חודש',
    localeSupportComplete: 'מעמד מקור: מלא. מקור התצוגה המקובע מסומן כמלא עבור השפה הזאת.',
    localeSupportPartial: 'מעמד מקור: חלקי. ל־Seer יש תבנית תאריך מלאה וכל 17+47 השמות, אך המקור המקובע עדיין לא השלים QA לשוני/ממשקי רחב יותר.',
    localeSupportUnknown: 'מעמד מקור התרגום אינו זמין עבור השפה הזאת.',
    yearLabel: 'שנה פסטפרית',
    cutlet: 'קציצה',
    month: 'חודש',
    day: 'יום',
    gregorianTarget: 'היום הנשאל — גרגוריאני',
    targetJdn: 'JDN של היום הנשאל',
    calculationJdn: 'JDN של יום המעשה',
    observer: 'צופה',
    observerUnused: 'לא נעשה בו שימוש בבקשה הזאת',
    startJdn: 'JDN התחלה',
    endJdn: 'JDN סיום',
    totalDays: 'מספר ימים',
    cutlets: 'קציצות',
    months: 'חודשים',
    canonicalIndex: 'אינדקס קאנוני',
    name: 'שם',
    length: 'אורך',
    startOffset: 'היסט התחלה',
    endOffset: 'היסט סיום',
    offsets: 'היסטים',
    notExposed: 'אינו נחשף ב־HTTP v1',
    cutletsInYear: 'קציצות בשנה הזאת',
    monthsInYear: 'חודשים בשנה הזאת',
    monthOffsetsHint: 'היסטי החודשים אינם חלק מחוזה YearResponse הנוכחי; יישום הווב אינו ממציא סמנטיקה של הלוח בדפדפן.',
    everyDay: 'כל הימים',
    jdn: 'JDN',
    gregorian: 'גרגוריאני',
    year: 'שנה',
    dayInCutlet: 'יום בקציצה',
    dayInMonth: 'יום בחודש',
    daysReturned: 'הימים שהוחזרו באמצעות include=days',
    rangeCalculationJdn: 'JDN של יום המעשה',
    rangeTargetJdn: 'JDN של היום הנשאל',
    cutletDay: 'יום בקציצה',
    monthDay: 'יום בחודש',
    rangeResults: 'תוצאות שאילתת הטווח',
    resolvingNow: 'מחשב את התאריך הפסטפרי הנוכחי…',
    queryingDate: 'מחשב תאריך…',
    reverseConverting: 'מבצע המרה לאחור…',
    loadingYear: 'טוען מבנה שנה…',
    loadingFullYear: 'טוען שנה מלאה, כולל כל הימים…',
    queryingRange: 'מחשב טווח…',
    checkingApi: 'בודק את ה־API…',
    sameOriginApi: 'API מאותו מקור',
    sameOrigin: 'אותו מקור',
    apiReady: 'ה־API נגיש — מוכן',
    apiReachable: 'ה־API נגיש — {status}',
    apiReachableUnavailable: 'ה־API נגיש — Seer אינו זמין',
    readinessHttp: 'HTTP {status}. השירות השיב, אך מצב המוכנות אינו תקין.',
    apiUnavailable: 'ה־API אינו זמין',
    metadataUnavailable: 'מטא־נתונים אינם זמינים',
    metadataUnavailableText: 'המטא־נתונים אינם זמינים.',
    copied: 'הועתק',
    copyFailed: 'ההעתקה נכשלה',
    copyResponse: 'העתק JSON של התשובה',
    showNext: 'הצג את {count} השורות הבאות',
    showingRows: 'מוצגות {visible} מתוך {total} שורות.',
    showingAll: 'מוצגות כל {total} השורות.',
    rangeResultTitle: 'תוצאת טווח — {count} שורות',
    yearTitle: 'שנה פסטפרית {year}',
  }),
});

let activeLocale = 'en';
const textSources = new WeakMap();
const attrSources = new WeakMap();

function interpolate(value, vars) {
  return String(value).replace(/\{([A-Za-z0-9_]+)\}/g, (_, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : `{${key}}`);
}

export function supportedUiLocales() {
  return Object.values(UI_LOCALES);
}

export function currentUiLocale() {
  return activeLocale;
}

export function t(key, vars = {}) {
  const table = DYNAMIC[activeLocale] ?? DYNAMIC.en;
  const fallback = DYNAMIC.en[key] ?? key;
  return interpolate(table[key] ?? fallback, vars);
}

function translatedStatic(source) {
  if (activeLocale === 'he') return HE[source] ?? source;
  return source;
}

function translateTextNode(node) {
  if (!textSources.has(node)) textSources.set(node, node.nodeValue);
  const source = textSources.get(node);
  const trimmed = source.trim();
  if (!trimmed) return;
  const translated = translatedStatic(trimmed);
  const leading = source.match(/^\s*/)?.[0] ?? '';
  const trailing = source.match(/\s*$/)?.[0] ?? '';
  node.nodeValue = leading + translated + trailing;
}

function translateAttributes(element) {
  const names = ['aria-label', 'placeholder', 'title'];
  let sources = attrSources.get(element);
  if (!sources) {
    sources = new Map();
    attrSources.set(element, sources);
  }
  for (const name of names) {
    if (!element.hasAttribute(name)) continue;
    if (!sources.has(name)) sources.set(name, element.getAttribute(name));
    element.setAttribute(name, translatedStatic(sources.get(name)));
  }
}

export function translateStatic(root = document) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const parent = node.parentElement;
    if (!parent || ['SCRIPT', 'STYLE', 'CODE', 'PRE'].includes(parent.tagName)) continue;
    translateTextNode(node);
  }
  const elements = root.querySelectorAll?.('[aria-label], [placeholder], [title]') ?? [];
  for (const element of elements) translateAttributes(element);
}

export function setUiLocale(locale, { persist = true } = {}) {
  activeLocale = Object.prototype.hasOwnProperty.call(UI_LOCALES, locale) ? locale : 'en';
  const meta = UI_LOCALES[activeLocale];
  document.documentElement.lang = meta.code;
  document.documentElement.dir = meta.direction;
  translateStatic(document);
  const select = document.querySelector('#ui-locale');
  if (select) select.value = activeLocale;
  if (persist) {
    try { localStorage.setItem('seer.uiLocale', activeLocale); } catch {}
  }
  document.dispatchEvent(new CustomEvent('seer-ui-locale-change', { detail: { locale: activeLocale } }));
  return activeLocale;
}

export function initialUiLocale() {
  let stored = null;
  try { stored = localStorage.getItem('seer.uiLocale'); } catch {}
  if (stored && Object.prototype.hasOwnProperty.call(UI_LOCALES, stored)) return stored;
  const browser = String(globalThis.navigator?.language ?? '').toLowerCase();
  return browser.startsWith('he') ? 'he' : 'en';
}
