import assert from 'node:assert/strict';
import test from 'node:test';
import { KISURRA_OBSERVER } from '../vendor/pastafari-calendar-1.4.1/observer-location.js';
import { DAY_BOUNDARY_MODEL_VERSION, boundaryForDayJdn, currentDayAt } from '../vendor/pastafari-calendar-1.4.1/venus-day-boundary.js';

test('vendored Kisurra coordinates are the 1.4.1 canonical defaults', () => {
  assert.deepEqual(KISURRA_OBSERVER, {
    latitude: 31.8383,
    longitude: 45.481,
    elevationM: 0,
    source: 'kisurra',
    assumed: true,
  });
});

test('Kisurra Venus boundaries are consecutive and switch the day exactly at the boundary', () => {
  const day = 2_461_268n;
  const boundary = boundaryForDayJdn(day, KISURRA_OBSERVER);
  const next = boundaryForDayJdn(day + 1n, KISURRA_OBSERVER);
  const hours = (next.instant.getTime() - boundary.instant.getTime()) / 3_600_000;
  assert.ok(hours > 22 && hours < 26);
  assert.equal(currentDayAt(new Date(boundary.instant.getTime() - 1_000), KISURRA_OBSERVER).jdn, day - 1n);
  assert.equal(currentDayAt(new Date(boundary.instant.getTime() + 1_000), KISURRA_OBSERVER).jdn, day);
  assert.equal(currentDayAt(new Date(boundary.instant.getTime() + 1_000), KISURRA_OBSERVER).modelVersion, DAY_BOUNDARY_MODEL_VERSION);
});
