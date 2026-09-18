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
  q('#exchange-status').textContent = trace?.status ? String(trace.status) : (trace?.networkError ? 'Network failure' : '—');
  q('#exchange-code').textContent = trace?.response?.error?.code ?? '—';
  q('#raw-request').textContent = trace?.request === null
    ? 'No JSON request body (GET or empty request).'
    : formatJson(trace?.request);
  q('#raw-response').textContent = trace?.networkError
    ? `Network failure: ${trace.networkError}`
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

function loading(host, label) {
  host.setAttribute('aria-busy', 'true');
  host.replaceChildren(paragraph(label, 'muted'));
}

function finish(host) {
  host.removeAttribute('aria-busy');
  host.focus({ preventScroll: false });
}

function renderError(host, error) {
  const view = errorPresentation(error);
  const box = node('section', { className: 'error-box', attrs: { role: 'alert' } });
  box.append(node('h3', { text: view.category }));
  box.append(paragraph(view.explanation));
  const dl = node('dl', { className: 'compact-dl' });
  const values = [
    ['HTTP status', view.status ?? 'No HTTP response'],
    ['Seer error code', view.code ?? 'No Seer error code'],
    ['Message', view.message],
    ['Field', view.field ?? '—'],
  ];
  for (const [term, value] of values) {
    dl.append(node('div', {}, [node('dt', { text: term }), node('dd', { text: value })]));
  }
  box.append(dl);
  if (view.details !== null) {
    box.append(node('details', {}, [
      node('summary', { text: 'Error details' }),
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
    ? (result?.resolution?.observerSource ? result.resolution.observerSource : 'Not used by this request')
    : summary.observer;
  const card = node('section', { className: 'result-card' });
  card.append(node('h3', { text: title }));
  card.append(summaryDl([
    ['Pastafarian year', summary.year],
    ['Cutlet', summary.cutlet],
    ['Month', summary.month],
    ['Gregorian target', summary.gregorian],
    ['Target JDN', summary.targetJdn],
    ['Calculation JDN', summary.calculationJdn],
    ['Observer', observer],
  ]));
  if (summary.formatted) card.append(paragraph(summary.formatted, 'formatted'));
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
      const button = node('button', { text: `Show next ${Math.min(pageSize, rows.length - visible)} rows`, className: 'secondary' });
      button.type = 'button';
      button.addEventListener('click', () => {
        visible = Math.min(rows.length, visible + pageSize);
        render();
      });
      items.push(node('div', { className: 'pagination-row' }, [
        paragraph(`Showing ${visible} of ${rows.length} rows.`, 'muted'),
        button,
      ]));
    } else {
      items.push(paragraph(`Showing all ${rows.length} rows.`, 'muted'));
    }
    container.replaceChildren(...items);
  };
  render();
}

function renderYear(host, result) {
  const year = result.year;
  const wrapper = node('section', { className: 'result-card' });
  wrapper.append(node('h3', { text: `Pastafarian year ${year.number}` }));
  wrapper.append(summaryDl([
    ['Start JDN', year.startJdn],
    ['End JDN', year.endJdn],
    ['Total days', year.lengthDays],
    ['Cutlets', year.cutlets.length],
    ['Months', year.months.length],
    ['Calculation JDN', result.calculationDay?.jdn],
  ]));
  wrapper.append(table(
    ['Canonical index', 'Name', 'Length', 'Start offset', 'End offset'],
    year.cutlets.map((item) => [
      item.canonicalIndex,
      item.name ?? '—',
      item.lengthDays,
      item.startOffset,
      item.endOffset,
    ]),
    'Cutlets in this year',
  ));
  wrapper.append(table(
    ['Canonical index', 'Name', 'Length', 'Offsets'],
    year.months.map((item) => [
      item.canonicalIndex,
      item.name ?? '—',
      item.lengthDays,
      'Not exposed by HTTP v1',
    ]),
    'Months in this year',
  ));
  wrapper.append(paragraph('Month offsets are not part of the current YearResponse contract; the web app does not synthesize calendar semantics.', 'hint'));

  if (Array.isArray(year.days)) {
    const daysHost = node('div');
    wrapper.append(node('h3', { text: 'Every day' }));
    wrapper.append(daysHost);
    pagedTable(daysHost, {
      headers: ['JDN', 'Gregorian', 'Year', 'Cutlet', 'Day in cutlet', 'Month', 'Day in month'],
      rows: year.days.map((item) => [
        item.targetDay?.jdn,
        gregorianText(item.targetDay?.gregorian),
        item.pastafarianDate?.year,
        item.pastafarianDate?.cutlet?.canonicalIndex,
        item.pastafarianDate?.cutlet?.day,
        item.pastafarianDate?.month?.canonicalIndex,
        item.pastafarianDate?.month?.day,
      ]),
      caption: 'Days returned by include=days',
    });
  }
  host.replaceChildren(wrapper);
}

function renderRange(host, result) {
  const results = Array.isArray(result.results) ? result.results : [];
  const wrapper = node('section', { className: 'result-card' });
  wrapper.append(node('h3', { text: `Range result — ${results.length} rows` }));
  const tableHost = node('div');
  wrapper.append(tableHost);
  pagedTable(tableHost, {
    headers: ['Calculation JDN', 'Target JDN', 'Gregorian', 'Year', 'Cutlet', 'Cutlet day', 'Month', 'Month day'],
    rows: results.map((item) => [
      item.calculationDay?.jdn,
      item.targetDay?.jdn,
      gregorianText(item.targetDay?.gregorian),
      item.pastafarianDate?.year,
      item.pastafarianDate?.cutlet?.canonicalIndex,
      item.pastafarianDate?.cutlet?.day,
      item.pastafarianDate?.month?.canonicalIndex,
      item.pastafarianDate?.month?.day,
    ]),
    caption: 'Range query results',
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

for (const item of qa('input[name="calculation-mode"]')) item.addEventListener('change', updateCalculationInputs);
for (const item of qa('input[name="observer-mode"]')) item.addEventListener('change', updateObserverInputs);
for (const item of qa('input[name="range-end-mode"]')) item.addEventListener('change', updateRangeEndMode);
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
  title.textContent = 'Checking API…';
  detail.textContent = apiBase || 'Same-origin API';
  indicator.dataset.state = 'checking';

  const client = plainClient();
  let reachable = false;
  try {
    const status = await client.getStatus();
    reachable = true;
    title.textContent = status?.status === 'ok' ? 'API reachable — ready' : `API reachable — ${status?.status ?? 'unknown'}`;
    detail.textContent = apiBase || 'Same origin';
    indicator.dataset.state = status?.status === 'ok' ? 'ok' : 'bad';
  } catch (error) {
    if (error instanceof SeerClientError && error.status > 0) {
      reachable = true;
      title.textContent = 'API reachable — Seer unavailable';
      detail.textContent = `HTTP ${error.status}. The service answered but readiness is not OK.`;
      indicator.dataset.state = 'bad';
    } else {
      title.textContent = 'API unavailable';
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
    q('#meta-version').textContent = reachable ? 'metadata unavailable' : '—';
    q('#meta-reverse').textContent = '—';
    q('#meta-json').textContent = 'Metadata unavailable.';
  }
  if (localeResult.status === 'fulfilled') {
    q('#meta-locales').textContent = (localeResult.value.locales ?? []).map((item) => item.name ?? item.tag).join(', ') || '—';
  } else {
    q('#meta-locales').textContent = '—';
  }
}

function applyApiBase(raw) {
  apiBase = normalizeApiBase(raw);
  q('#api-base').value = apiBase;
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
    'Resolving the current Pastafarian date…',
    (client) => client.queryNow(buildNowRequest(sharedState())),
    (host, result) => renderDate(host, result, 'Current Pastafarian date'),
  );
});

q('#date-form').addEventListener('submit', (event) => {
  event.preventDefault();
  syncUrl();
  runQuery(
    q('#date-result'),
    'Querying date…',
    (client) => client.queryDate(buildDateRequest(dateState())),
    (host, result) => renderDate(host, result, 'Date result'),
  );
});

q('#reverse-form').addEventListener('submit', (event) => {
  event.preventDefault();
  syncUrl();
  runQuery(
    q('#reverse-result'),
    'Reverse converting…',
    (client) => client.queryReverse(buildReverseRequest(reverseState())),
    (host, result) => renderDate(host, result, 'Resolved reverse conversion'),
  );
});

q('#year-form').addEventListener('submit', (event) => {
  event.preventDefault();
  syncUrl();
  const { year, request } = buildYearRequest(yearState(), { includeDays: q('#year-include-days').checked });
  runQuery(
    q('#year-result'),
    q('#year-include-days').checked ? 'Loading full year including every day…' : 'Loading year structure…',
    (client) => client.queryYear(year, request),
    renderYear,
  );
});

q('#range-form').addEventListener('submit', (event) => {
  event.preventDefault();
  syncUrl();
  runQuery(
    q('#range-result'),
    'Querying range…',
    (client) => client.queryRange(buildRangeRequest(rangeState())),
    renderRange,
  );
});

q('#copy-response').addEventListener('click', async () => {
  if (latestTrace?.response === undefined) return;
  const button = q('#copy-response');
  try {
    await navigator.clipboard.writeText(formatJson(latestTrace.response));
    button.textContent = 'Copied';
  } catch {
    button.textContent = 'Copy failed';
  }
  setTimeout(() => { button.textContent = 'Copy response JSON'; }, 1200);
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
  updateTargetInputs();
  updateCalculationInputs();
  setMode(initial.mode ?? 'now', { sync: false });
}

for (const control of qa('.controls input, .controls select, #date-form input')) {
  control.addEventListener('change', syncUrl);
}
applyInitialUrlState();
await refreshDiagnostics();
await runQuery(
  q('#now-result'),
  'Resolving the current Pastafarian date…',
  (client) => client.queryNow(buildNowRequest(sharedState())),
  (host, result) => renderDate(host, result, 'Current Pastafarian date'),
);
