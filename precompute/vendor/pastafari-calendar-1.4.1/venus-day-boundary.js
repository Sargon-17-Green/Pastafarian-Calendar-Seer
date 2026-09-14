"use strict";

// Vendored verbatim in semantics from Pastafarian Calendar 1.4.1.
// Source blob SHA-1: 0f0c6f951863583a80a97d4a2d5889f38b360026
// Canonical rule: lower meridian transit of the center of Venus for the
// selected terrestrial observer (topocentric hour angle = 180 degrees).

export const FOUNDATION_JDN = -13_334_246n;
export const FOUNDATION_LINEAR_DAY = -15_055_671n;
export const DAY_BOUNDARY_MODEL_VERSION = "venus-lower-transit-jpl-approx-1";

const J2000_JD = 2_451_545.0;
const DAYS_PER_CENTURY = 36_525;
const UNIX_EPOCH_JD = 2_440_587.5;
const MS_PER_DAY = 86_400_000;
const AU_KM = 149_597_870.7;
const EARTH_EQUATORIAL_RADIUS_KM = 6_378.14;
const DEG = Math.PI / 180;
const ARCSEC_TO_RAD = DEG / 3600;
const LIGHT_TIME_SECONDS_PER_AU = 499.004783836;
const BOUNDARY_CACHE_LIMIT = 96;

const ORBITAL_ELEMENTS = Object.freeze({
  venus: Object.freeze({
    a: Object.freeze([0.72332102, -0.00000026]),
    e: Object.freeze([0.00676399, -0.00005107]),
    I: Object.freeze([3.39777545, 0.00043494]),
    L: Object.freeze([181.97970850, 58517.81560260]),
    peri: Object.freeze([131.76755713, 0.05679648]),
    node: Object.freeze([76.67261496, -0.27274174]),
  }),
  earthMoonBarycenter: Object.freeze({
    a: Object.freeze([1.00000018, -0.00000003]),
    e: Object.freeze([0.01673163, -0.00003661]),
    I: Object.freeze([-0.00054346, -0.01337178]),
    L: Object.freeze([100.46691572, 35999.37306329]),
    peri: Object.freeze([102.93005885, 0.31795260]),
    node: Object.freeze([-5.11260389, -0.24123856]),
  }),
});

const boundaryCache = new Map();

function assertFinite(value, name) {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite.`);
  return value;
}

export function normalizeObserver(observer) {
  const latitude = assertFinite(Number(observer?.latitude), "latitude");
  const longitude = assertFinite(Number(observer?.longitude), "longitude");
  const elevationM = observer?.elevationM == null ? 0 : assertFinite(Number(observer.elevationM), "elevationM");
  if (latitude < -90 || latitude > 90) throw new RangeError("latitude must be in -90..90 degrees.");
  if (longitude < -180 || longitude > 180) throw new RangeError("longitude must be in -180..180 degrees.");
  return Object.freeze({ latitude, longitude, elevationM });
}

function wrapDegrees180(value) {
  let result = ((value + 180) % 360 + 360) % 360 - 180;
  if (Object.is(result, -0)) result = 0;
  return result;
}

function wrapRadiansPi(value) {
  let result = ((value + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  if (Object.is(result, -0)) result = 0;
  return result;
}

function elementAt([base, rate], centuries) {
  return base + rate * centuries;
}

function heliocentricEcliptic(body, jd) {
  const table = ORBITAL_ELEMENTS[body];
  if (!table) throw new RangeError(`Unsupported body: ${body}`);
  const T = (jd - J2000_JD) / DAYS_PER_CENTURY;
  const approximateYear = 2000 + 100 * T;
  if (approximateYear < -3000 || approximateYear > 3000) {
    throw new RangeError("Venus day-boundary model is defined only for 3000 BC through 3000 AD.");
  }

  const a = elementAt(table.a, T);
  const e = elementAt(table.e, T);
  const inclination = elementAt(table.I, T) * DEG;
  const meanLongitude = elementAt(table.L, T);
  const longitudePerihelion = elementAt(table.peri, T);
  const longitudeNode = elementAt(table.node, T) * DEG;
  const argumentPerihelion = (longitudePerihelion - elementAt(table.node, T)) * DEG;
  const meanAnomalyDegrees = wrapDegrees180(meanLongitude - longitudePerihelion);

  const eccentricityDegrees = (180 / Math.PI) * e;
  let eccentricAnomalyDegrees = meanAnomalyDegrees
    + eccentricityDegrees * Math.sin(meanAnomalyDegrees * DEG);
  for (let iteration = 0; iteration < 12; iteration += 1) {
    const E = eccentricAnomalyDegrees * DEG;
    const deltaMean = meanAnomalyDegrees
      - (eccentricAnomalyDegrees - eccentricityDegrees * Math.sin(E));
    const deltaE = deltaMean / (1 - e * Math.cos(E));
    eccentricAnomalyDegrees += deltaE;
    if (Math.abs(deltaE) <= 1e-9) break;
  }

  const E = eccentricAnomalyDegrees * DEG;
  const xPrime = a * (Math.cos(E) - e);
  const yPrime = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cosW = Math.cos(argumentPerihelion);
  const sinW = Math.sin(argumentPerihelion);
  const cosO = Math.cos(longitudeNode);
  const sinO = Math.sin(longitudeNode);
  const cosI = Math.cos(inclination);
  const sinI = Math.sin(inclination);

  return Object.freeze({
    x: (cosW * cosO - sinW * sinO * cosI) * xPrime
      + (-sinW * cosO - cosW * sinO * cosI) * yPrime,
    y: (cosW * sinO + sinW * cosO * cosI) * xPrime
      + (-sinW * sinO + cosW * cosO * cosI) * yPrime,
    z: sinW * sinI * xPrime + cosW * sinI * yPrime,
  });
}

function subtract(left, right) {
  return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}

function vectorLength(vector) {
  return Math.hypot(vector.x, vector.y, vector.z);
}

function precessJ2000ToDate(ra, dec, jd) {
  const T = (jd - J2000_JD) / DAYS_PER_CENTURY;
  const zeta = (2306.2181 * T + 0.30188 * T * T + 0.017998 * T * T * T) * ARCSEC_TO_RAD;
  const z = (2306.2181 * T + 1.09468 * T * T + 0.018203 * T * T * T) * ARCSEC_TO_RAD;
  const theta = (2004.3109 * T - 0.42665 * T * T - 0.041833 * T * T * T) * ARCSEC_TO_RAD;

  const A = Math.cos(dec) * Math.sin(ra + zeta);
  const B = Math.cos(theta) * Math.cos(dec) * Math.cos(ra + zeta) - Math.sin(theta) * Math.sin(dec);
  const C = Math.sin(theta) * Math.cos(dec) * Math.cos(ra + zeta) + Math.cos(theta) * Math.sin(dec);
  return {
    ra: ((Math.atan2(A, B) + z) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI),
    dec: Math.asin(Math.max(-1, Math.min(1, C))),
  };
}

function venusGeocentricEquatorial(jd) {
  const earth = heliocentricEcliptic("earthMoonBarycenter", jd);
  let venus = heliocentricEcliptic("venus", jd);
  for (let iteration = 0; iteration < 2; iteration += 1) {
    const relative = subtract(venus, earth);
    const lightDays = vectorLength(relative) * LIGHT_TIME_SECONDS_PER_AU / 86_400;
    venus = heliocentricEcliptic("venus", jd - lightDays);
  }

  const relative = subtract(venus, earth);
  const distanceAu = vectorLength(relative);
  const obliquityJ2000 = 23.43928 * DEG;
  const x = relative.x;
  const y = Math.cos(obliquityJ2000) * relative.y - Math.sin(obliquityJ2000) * relative.z;
  const z = Math.sin(obliquityJ2000) * relative.y + Math.cos(obliquityJ2000) * relative.z;
  const raJ2000 = ((Math.atan2(y, x) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const decJ2000 = Math.atan2(z, Math.hypot(x, y));
  const ofDate = precessJ2000ToDate(raJ2000, decJ2000, jd);
  return { ...ofDate, distanceAu };
}

function greenwichMeanSiderealRadians(jd) {
  const T = (jd - J2000_JD) / DAYS_PER_CENTURY;
  const degrees = 280.46061837
    + 360.98564736629 * (jd - J2000_JD)
    + 0.000387933 * T * T
    - T * T * T / 38_710_000;
  return (((degrees % 360) + 360) % 360) * DEG;
}

function topocentricHourAngle(jd, observer) {
  const { latitude, longitude, elevationM } = observer;
  const { ra, dec, distanceAu } = venusGeocentricEquatorial(jd);
  const localSidereal = greenwichMeanSiderealRadians(jd) + longitude * DEG;
  const geocentricHourAngle = ((localSidereal - ra) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);

  const phi = latitude * DEG;
  const horizontalParallax = Math.asin(EARTH_EQUATORIAL_RADIUS_KM / (distanceAu * AU_KM));
  const u = Math.atan(0.99664719 * Math.tan(phi));
  const heightRatio = elevationM / (EARTH_EQUATORIAL_RADIUS_KM * 1000);
  const rhoSinPhiPrime = 0.99664719 * Math.sin(u) + heightRatio * Math.sin(phi);
  const rhoCosPhiPrime = Math.cos(u) + heightRatio * Math.cos(phi);
  const deltaRa = Math.atan2(
    -rhoCosPhiPrime * Math.sin(horizontalParallax) * Math.sin(geocentricHourAngle),
    Math.cos(dec) - rhoCosPhiPrime * Math.sin(horizontalParallax) * Math.cos(geocentricHourAngle),
  );

  return ((geocentricHourAngle - deltaRa) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
}

function lowerTransitPhase(jd, observer) {
  return wrapRadiansPi(topocentricHourAngle(jd, observer) - Math.PI);
}

function observerCacheKey(observer) {
  return `${observer.latitude.toFixed(6)},${observer.longitude.toFixed(6)},${observer.elevationM.toFixed(1)}`;
}

function rememberBoundary(key, value) {
  if (boundaryCache.has(key)) boundaryCache.delete(key);
  boundaryCache.set(key, value);
  while (boundaryCache.size > BOUNDARY_CACHE_LIMIT) {
    boundaryCache.delete(boundaryCache.keys().next().value);
  }
}

export function boundaryForDayJdn(dayJdnInput, observerInput) {
  const dayJdn = typeof dayJdnInput === "bigint" ? dayJdnInput : BigInt(dayJdnInput);
  const observer = normalizeObserver(observerInput);
  const key = `${DAY_BOUNDARY_MODEL_VERSION}|${observerCacheKey(observer)}|${dayJdn}`;
  const cached = boundaryCache.get(key);
  if (cached) return cached;

  const seed = Number(dayJdn) - 0.5 - observer.longitude / 360;
  if (!Number.isSafeInteger(Number(dayJdn))) throw new RangeError("day JDN is outside the safe numeric range.");

  const halfWindowDays = 0.45;
  const scanStepDays = 15 / 1440;
  const points = [];
  for (let jd = seed - halfWindowDays; jd <= seed + halfWindowDays + 1e-12; jd += scanStepDays) {
    points.push([jd, lowerTransitPhase(jd, observer)]);
  }

  const brackets = [];
  for (let index = 1; index < points.length; index += 1) {
    const [leftJd, leftPhase] = points[index - 1];
    const [rightJd, rightPhase] = points[index];
    const smoothCrossing = leftPhase === 0
      || rightPhase === 0
      || (leftPhase * rightPhase < 0 && Math.abs(leftPhase - rightPhase) < Math.PI);
    if (smoothCrossing) brackets.push([leftJd, rightJd, leftPhase, rightPhase]);
  }
  if (brackets.length === 0) throw new RangeError("Could not bracket the Venus lower transit for this day.");

  brackets.sort((a, b) => Math.abs((a[0] + a[1]) / 2 - seed) - Math.abs((b[0] + b[1]) / 2 - seed));
  let [left, right, leftPhase, rightPhase] = brackets[0];
  for (let iteration = 0; iteration < 60 && (right - left) * 86_400 > 0.05; iteration += 1) {
    const middle = (left + right) / 2;
    const middlePhase = lowerTransitPhase(middle, observer);
    if (leftPhase === 0 || leftPhase * middlePhase <= 0) {
      right = middle;
      rightPhase = middlePhase;
    } else {
      left = middle;
      leftPhase = middlePhase;
    }
  }
  const jd = (left + right) / 2;
  const boundary = Object.freeze({
    dayJdn,
    jd,
    instant: new Date((jd - UNIX_EPOCH_JD) * MS_PER_DAY),
    observer,
    modelVersion: DAY_BOUNDARY_MODEL_VERSION,
  });
  rememberBoundary(key, boundary);
  return boundary;
}

export function currentDayAt(instantInput, observerInput) {
  const instant = instantInput instanceof Date ? instantInput : new Date(instantInput);
  const timeMs = instant.getTime();
  if (!Number.isFinite(timeMs)) throw new RangeError("instant must be a valid date/time.");
  const observer = normalizeObserver(observerInput);
  const jd = timeMs / MS_PER_DAY + UNIX_EPOCH_JD;

  let dayJdn = BigInt(Math.floor(jd + 0.5 + observer.longitude / 360));
  let previous = boundaryForDayJdn(dayJdn, observer);
  if (jd < previous.jd) {
    dayJdn -= 1n;
    previous = boundaryForDayJdn(dayJdn, observer);
  }
  let next = boundaryForDayJdn(dayJdn + 1n, observer);
  if (jd >= next.jd) {
    dayJdn += 1n;
    previous = next;
    next = boundaryForDayJdn(dayJdn + 1n, observer);
  }

  return Object.freeze({
    jdn: dayJdn,
    foundationOffset: dayJdn - FOUNDATION_JDN,
    previousBoundary: previous,
    nextBoundary: next,
    observer,
    modelVersion: DAY_BOUNDARY_MODEL_VERSION,
  });
}
