export class SeerQueryError extends Error {
  constructor(code, message, { field, details, cause } = {}) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'SeerQueryError';
    this.code = code;
    if (field !== undefined) this.field = field;
    if (details !== undefined) this.details = details;
  }
}

export function queryError(code, message, options) {
  return new SeerQueryError(code, message, options);
}

export function isSeerQueryError(value) {
  return value instanceof SeerQueryError;
}
