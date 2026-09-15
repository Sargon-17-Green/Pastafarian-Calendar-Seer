import { astronomyObserver } from './observer.mjs';

export async function calculationDayAt(instant, longitude) {
  const { currentDayAt } = await import('../precompute/vendor/pastafari-calendar-1.4.1/venus-day-boundary.js');
  return currentDayAt(instant, astronomyObserver(longitude)).jdn;
}

export async function dayBoundaries(calculationJdn, longitude) {
  const { boundaryForDayJdn } = await import('../precompute/vendor/pastafari-calendar-1.4.1/venus-day-boundary.js');
  const observer = astronomyObserver(longitude);
  const start = boundaryForDayJdn(calculationJdn, observer);
  const end = boundaryForDayJdn(calculationJdn + 1n, observer);
  return { startsAt: start.instant.toISOString(), endsAt: end.instant.toISOString() };
}

export const defaultDayBoundaryService = Object.freeze({ calculationDayAt, dayBoundaries });
