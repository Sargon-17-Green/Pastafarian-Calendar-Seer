import { createSeerClient, SeerClientError } from '../../client/index.mjs';

const form = document.querySelector('#query-form');
const apiBase = document.querySelector('#api-base');
const targetDate = document.querySelector('#target-date');
const nowButton = document.querySelector('#now-button');
const status = document.querySelector('#status');
const answer = document.querySelector('#answer');

function client() {
  return createSeerClient(apiBase.value.trim());
}

function gregorianText(value) {
  if (!value) return '';
  const year = value.era === 'BCE' ? `${value.year} BCE` : value.year;
  return `${year}-${String(value.month).padStart(2, '0')}-${String(value.day).padStart(2, '0')}`;
}

function coordinateText(value) {
  const name = value.name ? `${value.name} · ` : '';
  return `${name}#${value.canonicalIndex}, day ${value.day}`;
}

function render(result) {
  document.querySelector('#target-jdn').textContent = result.targetDay.jdn;
  document.querySelector('#target-gregorian').textContent = gregorianText(result.targetDay.gregorian);
  document.querySelector('#pf-year').textContent = result.pastafarianDate.year;
  document.querySelector('#pf-cutlet').textContent = coordinateText(result.pastafarianDate.cutlet);
  document.querySelector('#pf-month').textContent = coordinateText(result.pastafarianDate.month);
  document.querySelector('#raw-json').textContent = JSON.stringify(result, null, 2);
  answer.hidden = false;
  status.textContent = 'Query succeeded.';
  status.classList.remove('error');
}

function renderError(error) {
  answer.hidden = true;
  status.classList.add('error');
  if (error instanceof SeerClientError) {
    const code = error.code ? ` [${error.code}]` : '';
    status.textContent = `HTTP ${error.status}${code}: ${error.message}`;
    return;
  }
  status.textContent = error instanceof Error ? error.message : String(error);
}

async function run(task) {
  status.classList.remove('error');
  status.textContent = 'Querying…';
  answer.hidden = true;
  try {
    render(await task());
  } catch (error) {
    renderError(error);
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const value = targetDate.value;
  if (!value) {
    renderError(new Error('Choose a Gregorian target date, or use “Query now”.'));
    return;
  }
  run(() => client().queryDate({
    target: { gregorian: value },
    presentation: 'canonical',
  }));
});

nowButton.addEventListener('click', () => {
  run(() => client().queryNow({ presentation: 'canonical' }));
});
