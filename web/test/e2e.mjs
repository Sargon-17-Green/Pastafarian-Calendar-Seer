import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const apiBase = process.env.SEER_E2E_BASE ?? 'http://127.0.0.1:18080';
const staticBase = process.env.SEER_E2E_STATIC_BASE ?? 'http://127.0.0.1:18081';

async function expectText(locator, pattern, timeout = 30000) {
  await locator.waitFor({ state: 'visible', timeout });
  const deadline = Date.now() + timeout;
  let value = '';
  while (Date.now() <= deadline) {
    value = (await locator.textContent()) ?? '';
    if (pattern.test(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.match(value, pattern);
}

async function choose(page, name, value) {
  await page.locator('input[name="' + name + '"][value="' + value + '"]').check();
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

try {
  await page.goto(apiBase + '/web/', { waitUntil: 'domcontentloaded' });
  await expectText(page.locator('#api-status-title'), /API reachable — ready/);
  await expectText(page.locator('#now-result'), /Current Pastafarian date/);
  await expectText(page.locator('#now-result'), /Calculation JDN/);

  await page.getByRole('button', { name: 'Date', exact: true }).click();
  await choose(page, 'calculation-mode', 'jdn');
  await page.locator('#calculation-jdn').fill('2461302');
  await choose(page, 'presentation', 'canonical');
  await choose(page, 'target-kind', 'gregorian');
  await page.locator('#target-gregorian').fill('2026-09-20');
  await page.getByRole('button', { name: 'Query date' }).click();
  await expectText(page.locator('#date-result'), /2461304/);
  await expectText(page.locator('#date-result'), /Pastafarian year/);
  await expectText(page.locator('#exchange-method'), /^POST$/);
  await expectText(page.locator('#exchange-url'), /\/v1\/date$/);
  await expectText(page.locator('#exchange-status'), /^200$/);

  await page.getByRole('button', { name: 'Reverse', exact: true }).click();
  await page.locator('#reverse-year').fill('5000');
  await page.locator('#reverse-cutlet-index').fill('5');
  await page.locator('#reverse-cutlet-day').fill('351');
  await page.locator('#reverse-month-index').fill('33');
  await page.locator('#reverse-month-day').fill('69');
  await page.getByRole('button', { name: 'Reverse convert' }).click();
  await expectText(page.locator('#reverse-result'), /2461304/, 60000);
  await expectText(page.locator('#exchange-url'), /\/v1\/reverse$/);
  await expectText(page.locator('#exchange-status'), /^200$/);

  await page.getByRole('button', { name: 'Date', exact: true }).click();
  await choose(page, 'target-kind', 'jdn');
  await page.locator('#target-jdn').fill('not-an-integer');
  await page.getByRole('button', { name: 'Query date' }).click();
  await expectText(page.locator('#date-result'), /API request rejected/);
  await expectText(page.locator('#date-result'), /INVALID_INTEGER/);
  await expectText(page.locator('#exchange-status'), /^422$/);
  await expectText(page.locator('#exchange-code'), /^INVALID_INTEGER$/);

  await page.route('**/v1/reverse', async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          code: 'SEER_UNAVAILABLE',
          message: 'Exact runtime intentionally unavailable in this UI test.',
          details: { provider: 'e2e-fixture' },
        },
      }),
    });
  });
  await page.getByRole('button', { name: 'Reverse', exact: true }).click();
  await page.getByRole('button', { name: 'Reverse convert' }).click();
  await expectText(page.locator('#reverse-result'), /Exact Seer operation unavailable/);
  await expectText(page.locator('#reverse-result'), /does not by itself mean the date is invalid/i);
  await expectText(page.locator('#exchange-code'), /^SEER_UNAVAILABLE$/);
  await page.unroute('**/v1/reverse');

  await page.getByRole('button', { name: 'Year', exact: true }).click();
  await page.locator('#year-number').fill('5000');
  await page.getByRole('button', { name: 'Load year structure' }).click();
  await expectText(page.locator('#year-result'), /Pastafarian year 5000/, 60000);
  await expectText(page.locator('#year-result'), /Not exposed by HTTP v1/);

  await page.getByRole('button', { name: 'Range', exact: true }).click();
  await page.locator('#range-start-gregorian').fill('2026-09-20');
  await page.locator('#range-count').fill('3');
  await page.locator('#range-step').fill('1');
  await page.getByRole('button', { name: 'Query range' }).click();
  await expectText(page.locator('#range-result'), /Range result — 3 rows/);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(apiBase + '/web/?mode=date&targetKind=gregorian&target=2026-09-20&calculationMode=jdn&calculation=2461302', {
    waitUntil: 'domcontentloaded',
  });
  await expectText(page.locator('#api-status-title'), /API reachable — ready/);
  assert.equal(await page.locator('#target-gregorian').inputValue(), '2026-09-20');
  assert.equal(await page.locator('#calculation-jdn').inputValue(), '2461302');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 1, 'mobile layout overflows by ' + overflow + 'px');

  await page.goto(staticBase + '/web/?apiBase=' + encodeURIComponent(apiBase) + '&mode=date', {
    waitUntil: 'domcontentloaded',
  });
  await expectText(page.locator('#api-status-title'), /API reachable — ready/);
  await choose(page, 'calculation-mode', 'jdn');
  await page.locator('#calculation-jdn').fill('2461302');
  await choose(page, 'target-kind', 'gregorian');
  await page.locator('#target-gregorian').fill('2026-09-20');
  await page.getByRole('button', { name: 'Query date' }).click();
  await expectText(page.locator('#date-result'), /2461304/);
  const tracedUrl = await page.locator('#exchange-url').textContent();
  assert.ok((tracedUrl ?? '').startsWith(apiBase), 'cross-origin query did not use configured API base');

  console.log('production web E2E PASS');
} finally {
  await browser.close();
}
