class ValidationError extends Error {
  constructor(paramName, message) {
    super(message || `Invalid value for parameter "${paramName}"`);
    this.name = 'ValidationError';
    this.paramName = paramName;
  }
}

function toSingleValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function parseNumber(value, {
  paramName,
  min,
  max,
  defaultValue,
  integer = false,
} = {}) {
  const rawValue = toSingleValue(value);

  if (rawValue === undefined || rawValue === null) {
    return defaultValue;
  }

  const normalized = String(rawValue).trim();
  if (!normalized) {
    if (defaultValue !== undefined) return defaultValue;
    throw new ValidationError(paramName, `Invalid value for "${paramName}": expected a number`);
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    throw new ValidationError(paramName, `Invalid value for "${paramName}": expected a number`);
  }

  if (integer && !Number.isInteger(parsed)) {
    throw new ValidationError(paramName, `Invalid value for "${paramName}": expected an integer`);
  }

  if (min !== undefined && parsed < min) {
    throw new ValidationError(paramName, `Invalid value for "${paramName}": must be between ${min} and ${max ?? '∞'}`);
  }

  if (max !== undefined && parsed > max) {
    throw new ValidationError(paramName, `Invalid value for "${paramName}": must be between ${min ?? '-∞'} and ${max}`);
  }

  return parsed;
}

function parsePositiveInt(value, { min = 1, max, defaultValue, paramName } = {}) {
  return parseNumber(value, {
    paramName,
    min,
    max,
    defaultValue,
    integer: true,
  });
}

module.exports = {
  ValidationError,
  parseNumber,
  parsePositiveInt,
};
