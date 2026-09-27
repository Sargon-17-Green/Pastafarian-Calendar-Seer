import {
  buildDateRequest,
  buildNowRequest,
  buildRangeRequest,
  buildReverseRequest,
  buildYearRequest,
  dateSummary,
  errorPresentation,
  gregorianText,
  normalizeApiBase,
  readInitialUrlState,
  writeShareableUrl,
} from './model.mjs';
import { createTracedSeerClient, SeerClientError } from './transport.mjs';
import { currentUiLocale, initialUiLocale, setUiLocale, t } from './i18n.mjs';

const q = (selector, root = document) => root.querySelector(selector);
const qa = (selector, root = document) => [...root.querySelectorAll(selector)];

function node(tag, options = {}, children = []) {
  const element = document.createElement(tag);
  if (options.className) element.className = options.className;
  if (options.text !== undefined) element.textContent = String(options.text);
  for (const [key, value] of Object.entries(options.attrs ?? {})) {
    if (value !== undefined && value !== null) element.setAttribute(key, String(value));
  }
  for (const child of children) element.append(child);
  return element;
}

function paragraph(text, className) {
  return node('p', { text, className });
}

function coordinateLabel(item) {
  const name = item?.name;
  const index = item?.canonicalIndex;
  if (name && index !== undefined && index !== null) return `${name} · #${index}`;
  if (name) return String(name);
  if (index !== undefined && index !== null) return `#${index}`;
  return '—';
}

function coordinateWithDay(item) {
  if (!item) return '—';
  return `${coordinateLabel(item)}, ${t('day')} ${item.day}`;
}

function localizedErrorView(view) {
  const map = {
    'Network failure': ['networkFailure', 'networkFailureExplain'],
    'Input validation': ['inputValidation', 'inputValidationExplain'],
    'Server unavailable': ['serverUnavailable', 'apiRejectedExplain'],
    'API request rejected': ['apiRejected', 'apiRejectedExplain'],
    'Out of supported domain': ['outOfDomain', 'outOfDomainExplain'],
    'Exact Seer operation unavailable': ['exactUnavailable', 'exactUnavailableExplain'],
  };
  const keys = map[view.category];
  return keys ? { ...view, category: t(keys[0]), explanation: t(keys[1]) } : view;
}

function selectedValue(name) {
  return q(`input[name="${name}"]:checked`)?.value;
}

function setSelectedValue(name, value) {
  const item = q(`input[name="${name}"][value="${CSS.escape(value)}"]`);
  if (item) item.checked = true;
}

function sharedState() {
  return {
    presentation: selectedValue('presentation') ?? 'full',
    locale: q('#presentation-locale').value || 'en',
    calculationMode: selectedValue('calculation-mode') ?? 'live',
    calculationJdn: q('#calculation-jdn').value,
    calculationAt: q('#calculation-at').value,
    observerMode: selectedValue('observer-mode') ?? 'kisurra',
    longitude: q('#observer-longitude').value,
  };
}

function dateState() {
  return {
    ...sharedState(),
    targetKind: selectedValue('target-kind') ?? 'gregorian',
    targetGregorian: q('#target-gregorian').value,
    targetJdn: q('#target-jdn').value,
    targetOffset: q('#target-offset').value,
  };
}

function reverseState() {
  return {
    ...sharedState(),
    reverseYear: q('#reverse-year').value,
    reverseCutletIndex: q('#reverse-cutlet-index').value,
    reverseCutletDay: q('#reverse-cutlet-day').value,
    reverseMonthIndex: q('#reverse-month-index').value,
    reverseMonthDay: q('#reverse-month-day').value,
  };
}

function yearState() {
  return {
    ...sharedState(),
    yearNumber: q('#year-number').value,
  };
}

function reverseNameYearState() {
  return {
    ...sharedState(),
    presentation: 'full',
    locale: q('#presentation-locale').value || 'en',
    yearNumber: q('#reverse-year').value,
  };
}

function rangeState() {
  return {
    ...sharedState(),
    rangeStartKind: selectedValue('range-start-kind') ?? 'gregorian',
    rangeStartGregorian: q('#range-start-gregorian').value,
    rangeStartJdn: q('#range-start-jdn').value,
    rangeStartOffset: q('#range-start-offset').value,
    rangeEndMode: selectedValue('range-end-mode') ?? 'count',
    rangeCount: q('#range-count').value,
    rangeEndKind: selectedValue('range-end-kind') ?? 'gregorian',
    rangeEndGregorian: q('#range-end-gregorian').value,
    rangeEndJdn: q('#range-end-jdn').value,
    rangeEndOffset: q('#range-end-offset').value,
    rangeStepDays: q('#range-step').value,
    rangeCalculationMode: q('#range-calculation-mode').value,
  };
}

let apiBase = '';
let activeMode = 'now';
let queryController = null;
let querySerial = 0;
let latestTrace = null;
let requestedLocale = null;
let reverseNameSignature = null;
let localeMetadata = new Map([['en', Object.freeze({ code: 'en', direction: 'ltr', default: true })]]);

function formatJson(value) {
  if (value === undefined) return '—';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function updateExchange(trace) {
  latestTrace = trace;
  q('#exchange-method').textContent = trace?.method ?? '—';
  q('#exchange-url').textContent = trace?.url ?? '—';
  q('#exchange-status').textContent = trace?.status ? String(trace.status) : (trace?.networkError ? t('networkFailure') : '—');
  q('#exchange-code').textContent = trace?.response?.error?.code ?? '—';
  q('#raw-request').textContent = trace?.request === null
    ? t('noJsonBody')
    : formatJson(trace?.request);
  q('#raw-response').textContent = trace?.networkError
    ? `${t('networkFailure')}: ${trace.networkError}`
    : formatJson(trace?.response);
  q('#copy-response').disabled = trace?.response === undefined;
}

function tracedClient(signal, serial) {
  return createTracedSeerClient(apiBase, {
    signal,
    onTrace(trace) {
      if (serial === querySerial) updateExchange(trace);
    },
  });
}

function plainClient() {
  return createTracedSeerClient(apiBase);
}

function reverseNameLookupSignature() {
  const state = reverseNameYearState();
  return JSON.stringify({
    apiBase,
    year: state.yearNumber,
    locale: state.locale,
    calculationMode: state.calculationMode,
    calculationJdn: state.calculationJdn,
    calculationAt: state.calculationAt,
    observerMode: state.observerMode,
    longitude: state.longitude,
  });
}

function resetReverseNameChoices({ clearStatus = true } = {}) {
  reverseNameSignature = null;
  for (const selector of ['#reverse-cutlet-choice', '#reverse-month-choice']) {
    const select = q(selector);
    select.replaceChildren(node('option', { text: t('reverseNamesLoadFirst'), attrs: { value: '' } }));
    select.disabled = true;
  }
  if (clearStatus) q('#reverse-name-status').textContent = '';
}

function populateReverseNameChoices(result, signature) {
  const year = result?.year;
  if (!year || !Array.isArray(year.cutlets) || !Array.isArray(year.months)) {
    throw new Error(t('reverseNamesMalformed'));
  }
  const cutlet = q('#reverse-cutlet-choice');
  const month = q('#reverse-month-choice');
  const cutletValue = q('#reverse-cutlet-index').value;
  const monthValue = q('#reverse-month-index').value;
  cutlet.replaceChildren(
    node('option', { text: t('chooseCutlet'), attrs: { value: '' } }),
    ...year.cutlets.map((item) => node('option', {
      text: coordinateLabel(item),
      attrs: { value: item.canonicalIndex },
    })),
  );
  month.replaceChildren(
    node('option', { text: t('chooseMonth'), attrs: { value: '' } }),
    ...year.months.map((item) => node('option', {
      text: coordinateLabel(item),
      attrs: { value: item.canonicalIndex },
    })),
  );
  cutlet.disabled = false;
  month.disabled = false;
  if ([...cutlet.options].some((option) => option.value === cutletValue)) cutlet.value = cutletValue;
  if ([...month.options].some((option) => option.value === monthValue)) month.value = monthValue;
  reverseNameSignature = signature;
  q('#reverse-name-status').textContent = t('reverseNamesLoaded', { year: year.number });
}

async function loadReverseNames() {
  const button = q('#reverse-load-names');
  const status = q('#reverse-name-status');
  button.disabled = true;
  status.textContent = t('reverseNamesLoading');
  const signature = reverseNameLookupSignature();
  try {
    const { year, request } = buildYearRequest(reverseNameYearState());
    const result = await plainClient().queryYear(year, request);
    if (signature !== reverseNameLookupSignature()) {
      resetReverseNameChoices({ clearStatus: false });
      status.textContent = t('reverseNamesContextChanged');
      return;
    }
    populateReverseNameChoices(result, signature);
  } catch (error) {
    resetReverseNameChoices({ clearStatus: false });
    const view = localizedErrorView(errorPresentation(error));
    status.textContent = t('reverseNamesLoadFailed', { message: view.message || view.category });
  } finally {
    button.disabled = false;
  }
}

function syncReverseChoice(selectSelector, inputSelector) {
  const select = q(selectSelector);
  const input = q(inputSelector);
  select.addEventListener('change', () => {
    if (select.value) input.value = select.value;
  });
  input.addEventListener('input', () => {
    if (select.disabled) return;
    select.value = [...select.options].some((option) => option.value === input.value) ? input.value : '';
  });
}

function loading(host, label) {
  host.setAttribute('aria-busy', 'true');
  host.replaceChildren(paragraph(label, 'muted'));
}

function finish(host) {
  host.removeAttribute('aria-busy');
  host.focus({ preventScroll: false });
}

function renderError(host, error) {
  const view = localizedErrorView(errorPresentation(error));
  const box = node('section', { className: 'error-box', attrs: { role: 'alert' } });
  box.append(node('h3', { text: view.category }));
  box.append(paragraph(view.explanation));
  const dl = node('dl', { className: 'compact-dl' });
  const values = [
    [t('httpStatus'), view.status ?? t('noHttp')],
    [t('seerErrorCode'), view.code ?? t('noSeerCode')],
    [t('message'), view.message || t('requestFailed')],
    [t('field'), view.field ?? '—'],
  ];
  for (const [term, value] of values) {
    dl.append(node('div', {}, [node('dt', { text: term }), node('dd', { text: value })]));
  }
  box.append(dl);
  if (view.details !== null) {
    box.append(node('details', {}, [
      node('summary', { text: t('errorDetails') }),
      node('pre', { className: 'raw-block', text: formatJson(view.details) }),
    ]));
  }
  host.replaceChildren(box);
  finish(host);
}

async function runQuery(host, label, task, render) {
  if (queryController) queryController.abort();
  queryController = new AbortController();
  const serial = ++querySerial;
  loading(host, label);
  try {
    const result = await task(tracedClient(queryController.signal, serial));
    if (serial !== querySerial) return;
    render(host, result);
    finish(host);
  } catch (error) {
    if (serial !== querySerial || error?.name === 'AbortError') return;
    renderError(host, error);
  }
}

function summaryDl(entries) {
  const dl = node('dl', { className: 'summary-grid' });
  for (const [term, value] of entries) {
    dl.append(node('div', {}, [
      node('dt', { text: term }),
      node('dd', { text: value ?? '—' }),
    ]));
  }
  return dl;
}

function renderDate(host, result, title) {
  const summary = dateSummary(result);
  const observer = summary.observer === '—'
    ? (result?.resolution?.observerSource ? result.resolution.observerSource : t('observerUnused'))
    : summary.observer;
  const card = node('section', { className: 'result-card' });
  card.append(node('h3', { text: title }));
  card.append(summaryDl([
    [t('yearLabel'), summary.year],
    [t('cutlet'), coordinateWithDay(result?.pastafarianDate?.cutlet)],
    [t('month'), coordinateWithDay(result?.pastafarianDate?.month)],
    [t('gregorianTarget'), summary.gregorian],
    [t('targetJdn'), summary.targetJdn],
    [t('calculationJdn'), summary.calculationJdn],
    [t('observer'), observer],
  ]));
  if (summary.formatted) {
    const direction = localeMetadata.get(result?.locale)?.direction ?? 'auto';
    card.append(node('p', {
      className: 'formatted',
      text: summary.formatted,
      attrs: { dir: direction, lang: result?.locale ?? undefined },
    }));
  }
  host.replaceChildren(card);
}

function table(headers, rows, captionText) {
  const tableElement = node('table');
  tableElement.append(node('caption', { text: captionText }));
  const thead = node('thead');
  const headerRow = node('tr');
  for (const header of headers) headerRow.append(node('th', { text: header, attrs: { scope: 'col' } }));
  thead.append(headerRow);
  tableElement.append(thead);
  const tbody = node('tbody');
  for (const row of rows) {
    const tr = node('tr');
    for (const value of row) tr.append(node('td', { text: value ?? '—' }));
    tbody.append(tr);
  }
  tableElement.append(tbody);
  return node('div', { className: 'table-wrap' }, [tableElement]);
}

function pagedTable(container, { headers, rows, caption, pageSize = 200 }) {
  let visible = Math.min(pageSize, rows.length);
  const render = () => {
    const items = [
      table(headers, rows.slice(0, visible), caption),
    ];
    if (visible < rows.length) {
      const button = node('button', { text: t('showNext', { count: Math.min(pageSize, rows.length - visible) }), className: 'secondary' });
      button.type = 'button';
      button.addEventListener('click', () => {
        visible = Math.min(rows.length, visible + pageSize);
        render();
      });
      items.push(node('div', { className: 'pagination-row' }, [
        paragraph(t('showingRows', { visible, total: rows.length }), 'muted'),
        button,
      ]));
    } else {
      items.push(paragraph(t('showingAll', { total: rows.length }), 'muted'));
    }
    container.replaceChildren(...items);
  };
  render();
}

function renderYear(host, result) {
  const year = result.year;
  const wrapper = node('section', { className: 'result-card' });
  wrapper.append(node('h3', { text: t('yearTitle', { year: year.number }) }));
  wrapper.append(summaryDl([
    [t('startJdn'), year.startJdn],
    [t('endJdn'), year.endJdn],
    [t('totalDays'), year.lengthDays],
    [t('cutlets'), year.cutlets.length],
    [t('months'), year.months.length],
    [t('calculationJdn'), result.calculationDay?.jdn],
  ]));
  wrapper.append(table(
    [t('canonicalIndex'), t('name'), t('length'), t('startOffset'), t('endOffset')],
    year.cutlets.map((item) => [
      item.canonicalIndex,
      item.name ?? '—',
      item.lengthDays,
      item.startOffset,
      item.endOffset,
    ]),
    t('cutletsInYear'),
  ));
  wrapper.append(table(
    [t('canonicalIndex'), t('name'), t('length'), t('offsets')],
    year.months.map((item) => [
      item.canonicalIndex,
      item.name ?? '—',
      item.lengthDays,
      t('notExposed'),
    ]),
    t('monthsInYear'),
  ));
  wrapper.append(paragraph(t('monthOffsetsHint'), 'hint'));

  if (Array.isArray(year.days)) {
    const daysHost = node('div');
    wrapper.append(node('h3', { text: t('everyDay') }));
    wrapper.append(daysHost);
    pagedTable(daysHost, {
      headers: [t('jdn'), t('gregorian'), t('year'), t('cutlet'), t('dayInCutlet'), t('month'), t('dayInMonth')],
      rows: year.days.map((item) => [
        item.targetDay?.jdn,
        gregorianText(item.targetDay?.gregorian),
        item.pastafarianDate?.year,
        coordinateLabel(item.pastafarianDate?.cutlet),
        item.pastafarianDate?.cutlet?.day,
        coordinateLabel(item.pastafarianDate?.month),
        item.pastafarianDate?.month?.day,
      ]),
      caption: t('daysReturned'),
    });
  }
  host.replaceChildren(wrapper);
}

function renderRange(host, result) {
  const results = Array.isArray(result.results) ? result.results : [];
  const wrapper = node('section', { className: 'result-card' });
  wrapper.append(node('h3', { text: t('rangeResultTitle', { count: results.length }) }));
  const tableHost = node('div');
  wrapper.append(tableHost);
  pagedTable(tableHost, {
    headers: [t('rangeCalculationJdn'), t('rangeTargetJdn'), t('gregorian'), t('year'), t('cutlet'), t('cutletDay'), t('month'), t('monthDay')],
    rows: results.map((item) => [
      item.calculationDay?.jdn,
      item.targetDay?.jdn,
      gregorianText(item.targetDay?.gregorian),
      item.pastafarianDate?.year,
      coordinateLabel(item.pastafarianDate?.cutlet),
      item.pastafarianDate?.cutlet?.day,
      coordinateLabel(item.pastafarianDate?.month),
      item.pastafarianDate?.month?.day,
    ]),
    caption: t('rangeResults'),
  });
  host.replaceChildren(wrapper);
}

function selectorInputs(group, mapping) {
  const update = () => {
    const current = selectedValue(group);
    for (const [value, selector] of Object.entries(mapping)) {
      const input = q(selector);
      input.disabled = value !== current;
    }
  };
  for (const radio of qa(`input[name="${group}"]`)) radio.addEventListener('change', update);
  update();
  return update;
}

const updateTargetInputs = selectorInputs('target-kind', {
  gregorian: '#target-gregorian',
  jdn: '#target-jdn',
  offset: '#target-offset',
});
const updateRangeStartInputs = selectorInputs('range-start-kind', {
  gregorian: '#range-start-gregorian',
  jdn: '#range-start-jdn',
  offset: '#range-start-offset',
});
const updateRangeEndInputs = selectorInputs('range-end-kind', {
  gregorian: '#range-end-gregorian',
  jdn: '#range-end-jdn',
  offset: '#range-end-offset',
});

function updateCalculationInputs() {
  const mode = selectedValue('calculation-mode') ?? 'live';
  q('#calculation-jdn').disabled = mode !== 'jdn';
  q('#calculation-at').disabled = mode !== 'instant';
}

function updateObserverInputs() {
  q('#observer-longitude').disabled = selectedValue('observer-mode') !== 'custom';
}

function updateRangeEndMode() {
  const useEnd = selectedValue('range-end-mode') === 'end';
  q('#range-count').disabled = useEnd;
  q('#range-end-fields').hidden = !useEnd;
  if (useEnd) updateRangeEndInputs();
}

function updatePresentationInputs() {
  q('#presentation-locale').disabled = selectedValue('presentation') === 'canonical' || localeMetadata.size === 0;
}

for (const item of qa('input[name="presentation"]')) item.addEventListener('change', updatePresentationInputs);
for (const item of qa('input[name="calculation-mode"]')) item.addEventListener('change', updateCalculationInputs);
for (const item of qa('input[name="observer-mode"]')) item.addEventListener('change', updateObserverInputs);
for (const item of qa('input[name="range-end-mode"]')) item.addEventListener('change', updateRangeEndMode);
updatePresentationInputs();
updateCalculationInputs();
updateObserverInputs();
updateRangeEndMode();

function currentShareState() {
  const date = dateState();
  const target = date.targetKind === 'jdn'
    ? date.targetJdn
    : (date.targetKind === 'offset' ? date.targetOffset : date.targetGregorian);
  const calculation = date.calculationMode === 'jdn'
    ? date.calculationJdn
    : (date.calculationMode === 'instant' ? date.calculationAt : '');
  return {
    mode: activeMode,
    apiBase,
    targetKind: date.targetKind,
    target,
    calculationMode: date.calculationMode,
    calculation,
    presentation: date.presentation,
    locale: date.locale,
  };
}

function syncUrl() {
  const next = writeShareableUrl(currentShareState());
  history.replaceState(null, '', next);
}

function setMode(mode, { sync = true } = {}) {
  const allowed = new Set(['now', 'date', 'reverse', 'year', 'range']);
  activeMode = allowed.has(mode) ? mode : 'now';
  for (const panel of qa('[data-panel]')) panel.hidden = panel.dataset.panel !== activeMode;
  for (const button of qa('[data-mode]')) {
    if (button.dataset.mode === activeMode) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  if (sync) syncUrl();
}

for (const button of qa('[data-mode]')) {
  button.addEventListener('click', () => {
    setMode(button.dataset.mode);
    q(`[data-panel="${button.dataset.mode}"]`)?.focus({ preventScroll: false });
  });
}

async function refreshDiagnostics() {
  const title = q('#api-status-title');
  const detail = q('#api-status-detail');
  const indicator = q('#api-indicator');
  title.textContent = t('checkingApi');
  detail.textContent = apiBase || t('sameOriginApi');
  indicator.dataset.state = 'checking';

  const client = plainClient();
  let reachable = false;
  try {
    const status = await client.getStatus();
    reachable = true;
    title.textContent = status?.status === 'ok' ? t('apiReady') : t('apiReachable', { status: status?.status ?? 'unknown' });
    detail.textContent = apiBase || t('sameOrigin');
    indicator.dataset.state = status?.status === 'ok' ? 'ok' : 'bad';
  } catch (error) {
    if (error instanceof SeerClientError && error.status > 0) {
      reachable = true;
      title.textContent = t('apiReachableUnavailable');
      detail.textContent = t('readinessHttp', { status: error.status });
      indicator.dataset.state = 'bad';
    } else {
      title.textContent = t('apiUnavailable');
      detail.textContent = error instanceof Error ? error.message : String(error);
      indicator.dataset.state = 'bad';
    }
  }

  const [metaResult, localeResult] = await Promise.allSettled([
    client.getMeta(),
    client.getLocales(),
  ]);
  if (metaResult.status === 'fulfilled') {
    const meta = metaResult.value;
    q('#meta-version').textContent = meta.apiVersion ?? '—';
    q('#meta-reverse').textContent = meta.reverse?.status ?? '—';
    q('#meta-json').textContent = formatJson(meta);
  } else {
    q('#meta-version').textContent = reachable ? t('metadataUnavailable') : '—';
    q('#meta-reverse').textContent = '—';
    q('#meta-json').textContent = t('metadataUnavailableText');
  }
  if (localeResult.status === 'fulfilled') {
    const locales = Array.isArray(localeResult.value.locales) ? localeResult.value.locales : [];
    q('#meta-locales').textContent = locales.map((item) => item.selfName ?? item.name ?? item.code ?? item.tag).join(', ') || '—';

    const select = q('#presentation-locale');
    const previous = requestedLocale ?? select.value;
    localeMetadata = new Map(locales.map((item) => [
      item.code ?? item.tag,
      Object.freeze({
        code: item.code ?? item.tag,
        direction: item.direction ?? 'ltr',
        default: item.default === true,
      }),
    ]));
    const options = locales.map((item) => node('option', {
      text: item.selfName ? `${item.selfName} — ${item.name ?? item.code ?? item.tag}` : (item.name ?? item.code ?? item.tag),
      attrs: { value: item.code ?? item.tag },
    }));
    select.replaceChildren(...options);
    const codes = new Set(locales.map((item) => item.code ?? item.tag));
    const fallback = locales.find((item) => item.default)?.code
      ?? locales.find((item) => item.default)?.tag
      ?? locales[0]?.code
      ?? locales[0]?.tag
      ?? '';
    select.value = codes.has(previous) ? previous : fallback;
    requestedLocale = null;
    updatePresentationInputs();
    resetReverseNameChoices();
  } else {
    q('#meta-locales').textContent = '—';
  }
}

function applyApiBase(raw) {
  apiBase = normalizeApiBase(raw);
  q('#api-base').value = apiBase;
  resetReverseNameChoices();
  syncUrl();
  return refreshDiagnostics();
}

q('#connection-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await applyApiBase(q('#api-base').value);
  } catch (error) {
    renderError(q('#now-result'), error);
  }
});

q('#refresh-status').addEventListener('click', refreshDiagnostics);

q('#now-refresh').addEventListener('click', () => {
  syncUrl();
  runQuery(
    q('#now-result'),
    t('resolvingNow'),
    (client) => client.queryNow(buildNowRequest(sharedState())),
    (host, result) => renderDate(host, result, t('currentDate')),
  );
});

q('#date-form').addEventListener('submit', (event) => {
  event.preventDefault();
  syncUrl();
  runQuery(
    q('#date-result'),
    t('queryingDate'),
    (client) => client.queryDate(buildDateRequest(dateState())),
    (host, result) => renderDate(host, result, t('dateResult')),
  );
});

q('#reverse-load-names').addEventListener('click', loadReverseNames);
syncReverseChoice('#reverse-cutlet-choice', '#reverse-cutlet-index');
syncReverseChoice('#reverse-month-choice', '#reverse-month-index');
q('#reverse-year').addEventListener('input', () => resetReverseNameChoices());
q('#presentation-locale').addEventListener('change', () => resetReverseNameChoices());
for (const selector of [
  'input[name="calculation-mode"]',
  '#calculation-jdn',
  '#calculation-at',
  'input[name="observer-mode"]',
  '#observer-longitude',
]) {
  for (const control of qa(selector)) {
    control.addEventListener(control.matches('input[type="radio"]') ? 'change' : 'input', () => resetReverseNameChoices());
  }
}

q('#reverse-form').addEventListener('submit', (event) => {
  event.preventDefault();
  syncUrl();
  runQuery(
    q('#reverse-result'),
    t('reverseConverting'),
    (client) => client.queryReverse(buildReverseRequest(reverseState())),
    (host, result) => renderDate(host, result, t('reverseResult')),
  );
});

q('#year-form').addEventListener('submit', (event) => {
  event.preventDefault();
  syncUrl();
  const { year, request } = buildYearRequest(yearState(), { includeDays: q('#year-include-days').checked });
  runQuery(
    q('#year-result'),
    q('#year-include-days').checked ? t('loadingFullYear') : t('loadingYear'),
    (client) => client.queryYear(year, request),
    renderYear,
  );
});

q('#range-form').addEventListener('submit', (event) => {
  event.preventDefault();
  syncUrl();
  runQuery(
    q('#range-result'),
    t('queryingRange'),
    (client) => client.queryRange(buildRangeRequest(rangeState())),
    renderRange,
  );
});

q('#copy-response').addEventListener('click', async () => {
  if (latestTrace?.response === undefined) return;
  const button = q('#copy-response');
  try {
    await navigator.clipboard.writeText(formatJson(latestTrace.response));
    button.textContent = t('copied');
  } catch {
    button.textContent = t('copyFailed');
  }
  setTimeout(() => { button.textContent = t('copyResponse'); }, 1200);
});

function applyInitialUrlState() {
  const initial = readInitialUrlState();
  const runtimeBase = globalThis.SEER_WEB_CONFIG?.apiBase ?? '';
  const chosenBase = initial.apiBase !== null ? initial.apiBase : runtimeBase;
  try {
    apiBase = normalizeApiBase(chosenBase);
  } catch {
    apiBase = '';
  }
  q('#api-base').value = apiBase;
  if (initial.presentation && ['full', 'canonical'].includes(initial.presentation)) {
    setSelectedValue('presentation', initial.presentation);
  }
  if (initial.locale) requestedLocale = initial.locale;
  if (initial.targetKind && ['gregorian', 'jdn', 'offset'].includes(initial.targetKind)) {
    setSelectedValue('target-kind', initial.targetKind);
    if (initial.target !== null) {
      const input = initial.targetKind === 'jdn'
        ? q('#target-jdn')
        : (initial.targetKind === 'offset' ? q('#target-offset') : q('#target-gregorian'));
      input.value = initial.target;
    }
  }
  if (initial.calculationMode && ['live', 'jdn', 'instant'].includes(initial.calculationMode)) {
    setSelectedValue('calculation-mode', initial.calculationMode);
    if (initial.calculation !== null) {
      if (initial.calculationMode === 'jdn') q('#calculation-jdn').value = initial.calculation;
      if (initial.calculationMode === 'instant') q('#calculation-at').value = initial.calculation;
    }
  }
  updatePresentationInputs();
  updateTargetInputs();
  updateCalculationInputs();
  setMode(initial.mode ?? 'now', { sync: false });
}

for (const control of qa('.controls input, .controls select, #date-form input')) {
  control.addEventListener('change', syncUrl);
}
setUiLocale(initialUiLocale(), { persist: false });
q('#ui-locale').value = currentUiLocale();
q('#ui-locale').addEventListener('change', () => {
  setUiLocale(q('#ui-locale').value);
  location.reload();
});
applyInitialUrlState();
await refreshDiagnostics();
await runQuery(
  q('#now-result'),
  t('resolvingNow'),
  (client) => client.queryNow(buildNowRequest(sharedState())),
  (host, result) => renderDate(host, result, t('currentDate')),
);
