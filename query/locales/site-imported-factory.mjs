// Presentation-only locale adapter for snapshots imported from the legacy public site.
// Calendar semantics remain in Seer; this module only formats already-resolved values.

const PLACEHOLDER = /\{([A-Za-z0-9_.-]+)\}/g;

function interpolate(template, values, direction) {
  return String(template).replace(PLACEHOLDER, (match, name) => {
    if (!Object.prototype.hasOwnProperty.call(values, name)) {
      throw new RangeError(`Missing locale interpolation value ${name}.`);
    }
    const value = String(values[name]);
    return direction === 'rtl' ? `\u2068${value}\u2069` : value;
  });
}

function assertTemplate(template, expected, label) {
  if (typeof template !== 'string' || !template.trim()) {
    throw new TypeError(`Imported locale ${label} template is required.`);
  }
  const actual = [...new Set([...template.matchAll(PLACEHOLDER)].map((match) => match[1]))].sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((value, index) => value !== wanted[index])) {
    throw new TypeError(
      `Imported locale ${label} placeholders must be {${wanted.join(', ')}}; received {${actual.join(', ')}}.`,
    );
  }
}

export function createImportedLocalePack(spec) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    throw new TypeError('Imported locale snapshot entry must be an object.');
  }
  if (spec.direction !== 'ltr' && spec.direction !== 'rtl') {
    throw new TypeError(`Imported locale ${String(spec.code)} has invalid direction.`);
  }
  if (spec.sourceSupport !== 'partial') {
    throw new TypeError(
      `Imported locale ${String(spec.code)} must preserve the upstream partial support classification.`,
    );
  }
  if (!Array.isArray(spec.cutlets) || spec.cutlets.length !== 17) {
    throw new TypeError(`Imported locale ${String(spec.code)} must contain 17 cutlet names.`);
  }
  if (!Array.isArray(spec.months) || spec.months.length !== 47) {
    throw new TypeError(`Imported locale ${String(spec.code)} must contain 47 month names.`);
  }
  if (new Set(spec.cutlets).size !== 17) {
    throw new TypeError(`Imported locale ${String(spec.code)} has duplicate cutlet display names.`);
  }
  if (new Set(spec.months).size !== 47) {
    throw new TypeError(`Imported locale ${String(spec.code)} has duplicate month display names.`);
  }
  assertTemplate(spec.templates?.year, ['year'], 'year');
  assertTemplate(spec.templates?.cutlet, ['cutletName', 'dayInCutlet'], 'cutlet');
  assertTemplate(spec.templates?.month, ['dayInMonth', 'monthName'], 'month');

  const direction = spec.direction;
  const templates = Object.freeze({ ...spec.templates });
  const formatDate = ({ year, cutlet, month }) => {
    const yearLine = interpolate(templates.year, { year }, direction);
    const cutletLine = interpolate(
      templates.cutlet,
      { cutletName: cutlet.name, dayInCutlet: cutlet.day },
      direction,
    );
    const monthLine = interpolate(
      templates.month,
      { monthName: month.name, dayInMonth: month.day },
      direction,
    );
    return `${yearLine}; ${cutletLine}; ${monthLine}`;
  };

  return Object.freeze({
    schemaVersion: 1,
    version: '1.0.0',
    code: spec.code,
    name: spec.name,
    selfName: spec.selfName,
    direction,
    properNamePolicy: 'localized',
    sourceSupport: spec.sourceSupport,
    cutlets: Object.freeze([...spec.cutlets]),
    months: Object.freeze([...spec.months]),
    formatDate,
  });
}
