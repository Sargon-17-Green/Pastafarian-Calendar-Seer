export const WEB_API_ROUTES = Object.freeze([
  '/v1/status',
  '/v1/meta',
  '/v1/locales',
  '/v1/now',
  '/v1/date',
  '/v1/reverse',
  '/v1/year/{year}',
  '/v1/range',
]);

function required(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new TypeError(`${label} is required.`);
  return text;
}

export function normalizeApiBase(value) {
  const text = String(value ?? '').trim().replace(/\/+$/, '');
  if (!text) return '';
  if (text.startsWith('/')) {
    if (text.includes('?') || text.includes('#')) throw new TypeError('API base path cannot contain a query or fragment.');
    return text;
  }
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new TypeError('API base must be empty, an origin-relative path, or an HTTP(S) URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new TypeError('API base must use HTTP or HTTPS.');
  }
  if (url.username || url.password) throw new TypeError('Credentials are not allowed in the API base URL.');
  url.hash = '';
  url.search = '';
  return url.href.replace(/\/+$/, '');
}

export function buildObserver(state) {
  if (state.observerMode === 'custom') {
    const longitudeText = required(state.longitude, 'Longitude');
    const longitude = Number(longitudeText);
    if (!Number.isFinite(longitude)) throw new TypeError('Longitude must be a finite number.');
    return { longitude };
  }
  return { preset: 'kisurra' };
}

export function buildCalculation(state) {
  if (state.calculationMode === 'jdn') return { jdn: required(state.calculationJdn, 'Calculation JDN') };
  if (state.calculationMode === 'instant') return { at: required(state.calculationAt, 'Calculation instant') };
  return undefined;
}

export function assertSingleSelector(selector, label = 'Target') {
  const keys = ['gregorian', 'jdn', 'offsetDays'].filter((key) => {
    const value = selector?.[key];
    return value !== undefined && value !== null && String(value).trim() !== '';
  });
  if (keys.length !== 1) throw new TypeError(`${label} must use exactly one selector.`);
  return selector;
}

export function buildTarget(kind, values, label = 'Target') {
  let target;
  if (kind === 'jdn') target = { jdn: required(values.jdn, `${label} JDN`) };
  else if (kind === 'offset') target = { offsetDays: required(values.offsetDays, `${label} offset`) };
  else target = { gregorian: required(values.gregorian, `${label} Gregorian date`) };
  return assertSingleSelector(target, label);
}

function presentationFields(state) {
  const presentation = state.presentation === 'canonical' ? 'canonical' : 'full';
  return presentation === 'full'
    ? { presentation, locale: 'en' }
    : { presentation };
}

function commonFields(state) {
  const calculation = buildCalculation(state);
  return {
    observer: buildObserver(state),
    ...(calculation ? { calculation } : {}),
    ...presentationFields(state),
  };
}

export function buildDateRequest(state) {
  return {
    ...commonFields(state),
    target: buildTarget(state.targetKind, {
      gregorian: state.targetGregorian,
      jdn: state.targetJdn,
      offsetDays: state.targetOffset,
    }),
    include: ['resolution'],
  };
}

export function buildNowRequest(state) {
  return {
    observer: buildObserver(state),
    ...presentationFields(state),
    include: ['resolution'],
  };
}

export function buildReverseRequest(state) {
  return {
    ...commonFields(state),
    pastafarianDate: {
      year: required(state.reverseYear, 'Pastafarian year'),
      cutlet: {
        canonicalIndex: required(state.reverseCutletIndex, 'Cutlet canonical index'),
        day: required(state.reverseCutletDay, 'Day in cutlet'),
      },
      month: {
        canonicalIndex: required(state.reverseMonthIndex, 'Month canonical index'),
        day: required(state.reverseMonthDay, 'Day in month'),
      },
    },
    include: ['resolution'],
  };
}

export function buildYearRequest(state, { includeDays = false } = {}) {
  return {
    year: required(state.yearNumber, 'Pastafarian year'),
    request: {
      ...commonFields(state),
      include: includeDays ? ['resolution', 'days'] : ['resolution'],
    },
  };
}

export function buildRangeRequest(state) {
  const request = {
    ...commonFields(state),
    start: buildTarget(state.rangeStartKind, {
      gregorian: state.rangeStartGregorian,
      jdn: state.rangeStartJdn,
      offsetDays: state.rangeStartOffset,
    }, 'Range start'),
    stepDays: required(state.rangeStepDays || '1', 'Step days'),
    calculationMode: state.rangeCalculationMode === 'same-as-target' ? 'same-as-target' : 'fixed',
  };
  if (state.rangeEndMode === 'end') {
    request.endInclusive = buildTarget(state.rangeEndKind, {
      gregorian: state.rangeEndGregorian,
      jdn: state.rangeEndJdn,
      offsetDays: state.rangeEndOffset,
    }, 'Range end');
  } else {
    request.count = required(state.rangeCount, 'Range count');
  }
  return request;
}

export function gregorianText(value) {
  if (!value) return '—';
  const year = value.era === 'BCE' ? `${value.year} BCE` : value.year;
  return `${year}-${String(value.month).padStart(2, '0')}-${String(value.day).padStart(2, '0')}`;
}

export function coordinateText(value) {
  if (!value) return '—';
  const name = value.name ? `${value.name} · ` : '';
  return `${name}#${value.canonicalIndex}, day ${value.day}`;
}

export function dateSummary(result) {
  return {
    calculationJdn: result?.calculationDay?.jdn ?? '—',
    observer: result?.observer?.longitude === undefined ? '—' : `${result.observer.longitude}°`,
    targetJdn: result?.targetDay?.jdn ?? '—',
    gregorian: gregorianText(result?.targetDay?.gregorian),
    year: result?.pastafarianDate?.year ?? '—',
    cutlet: coordinateText(result?.pastafarianDate?.cutlet),
    month: coordinateText(result?.pastafarianDate?.month),
    formatted: result?.formatted ?? null,
  };
}

export function errorPresentation(error) {
  const status = Number(error?.status ?? 0);
  const code = error?.code ? String(error.code) : null;
  let category = 'Network failure';
  let explanation = 'The browser could not reach the Seer API. Check the API base URL, network, HTTPS, and CORS.';
  if (status === 0 && error?.name === 'TypeError') {
    category = 'Input validation';
    explanation = 'The browser did not send this request because the selected form inputs are incomplete or malformed.';
  }
  if (status > 0) {
    category = status >= 500 ? 'Server unavailable' : 'API request rejected';
    explanation = 'The Seer API rejected the request. The HTTP status and Seer error code below are authoritative.';
  }
  if (code && code.includes('OUT_OF_SUPPORTED_DOMAIN')) {
    category = 'Out of supported domain';
    explanation = 'The Seer API reports that this operation is outside its supported exact domain.';
  }
  if (code === 'SEER_UNAVAILABLE') {
    category = 'Exact Seer operation unavailable';
    explanation = 'The Seer service cannot currently perform this exact operation. This does not by itself mean the date is invalid.';
  }
  return {
    category,
    explanation,
    status: status || null,
    code,
    message: error?.message ? String(error.message) : 'Request failed.',
    field: error?.field === undefined ? null : String(error.field),
    details: error?.details ?? null,
  };
}

export function readInitialUrlState(url = globalThis.location?.href ?? 'http://localhost/') {
  const parsed = new URL(url);
  const params = parsed.searchParams;
  return {
    mode: params.get('mode'),
    apiBase: params.get('apiBase'),
    targetKind: params.get('targetKind'),
    target: params.get('target'),
    calculationMode: params.get('calculationMode'),
    calculation: params.get('calculation'),
  };
}

export function writeShareableUrl(state, url = globalThis.location?.href ?? 'http://localhost/') {
  const parsed = new URL(url);
  const params = parsed.searchParams;
  const set = (key, value) => value ? params.set(key, value) : params.delete(key);
  set('mode', state.mode);
  set('apiBase', state.apiBase);
  set('targetKind', state.targetKind);
  set('target', state.target);
  set('calculationMode', state.calculationMode);
  set('calculation', state.calculation);
  parsed.search = params.toString();
  return parsed.toString();
}
