export function emitTelemetry(telemetry, method, event) {
  try {
    const sink = telemetry?.[method];
    if (typeof sink !== 'function') return;
    const result = sink(Object.freeze({ ...event }));
    if (result && typeof result.catch === 'function') result.catch(() => {});
  } catch {
    // Observability is fail-open and must never change query semantics.
  }
}
