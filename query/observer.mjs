import { queryError } from './errors.mjs';

export const KISURRA_LONGITUDE = 45.481;
const ALLOWED = new Set(['preset', 'longitude', 'latitude', 'elevationMeters']);

export function normalizeLongitude(value, field = 'observer.longitude') {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < -180 || value > 180) {
    throw queryError('INVALID_LONGITUDE', 'Longitude must be a finite number between -180 and 180 degrees.', { field });
  }
  let normalized = value === 180 ? -180 : value;
  if (Object.is(normalized, -0)) normalized = 0;
  return normalized;
}

export function resolveObserver(input, { relevant = true } = {}) {
  if (input === undefined) {
    return relevant ? { longitude: KISURRA_LONGITUDE, source: 'default-preset' } : null;
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw queryError('INVALID_OBSERVER', 'observer must be an object.', { field: 'observer' });
  }
  for (const key of Object.keys(input)) {
    if (!ALLOWED.has(key)) throw queryError('UNKNOWN_PARAMETER', `Unknown observer field: ${key}.`, { field: `observer.${key}` });
  }

  const presetPresent = Object.prototype.hasOwnProperty.call(input, 'preset');
  const longitudePresent = Object.prototype.hasOwnProperty.call(input, 'longitude');
  if (presetPresent && input.preset !== null && typeof input.preset !== 'string') {
    throw queryError('INVALID_OBSERVER', 'observer.preset must be a string or null.', { field: 'observer.preset' });
  }
  if (longitudePresent && input.longitude !== null && typeof input.longitude !== 'number') {
    throw queryError('INVALID_OBSERVER', 'observer.longitude must be a number or null.', { field: 'observer.longitude' });
  }
  if (!relevant) return null;

  // Null selectors are schema-valid no-ops. latitude/elevationMeters are documented no-ops.
  const hasPreset = presetPresent && input.preset !== null;
  const hasLongitude = longitudePresent && input.longitude !== null;
  if (hasPreset && hasLongitude) {
    throw queryError('AMBIGUOUS_OBSERVER', 'Use either observer.preset or observer.longitude, not both.', { field: 'observer' });
  }
  if (hasPreset) {
    if (input.preset !== 'kisurra') {
      throw queryError('OBSERVER_PRESET_NOT_SUPPORTED', `Unsupported observer preset: ${String(input.preset)}.`, { field: 'observer.preset' });
    }
    return { longitude: KISURRA_LONGITUDE, source: 'preset' };
  }
  if (hasLongitude) return { longitude: normalizeLongitude(input.longitude), source: 'longitude' };
  return { longitude: KISURRA_LONGITUDE, source: 'default-preset' };
}

export function astronomyObserver(longitude) {
  // Latitude and elevation do not affect the lower-meridian-transit instant;
  // internal constants satisfy the vendored function's input shape only.
  return Object.freeze({ latitude: 0, longitude, elevationM: 0 });
}
