function clone(value) {
  return structuredClone(value);
}

function assignKnownShape(defaultValue, incomingValue) {
  if (defaultValue === null) {
    if (incomingValue === undefined || incomingValue === null) {
      return null;
    }
    if (typeof incomingValue === 'string' || (typeof incomingValue === 'object')) {
      return clone(incomingValue);
    }
    return null;
  }

  if (Array.isArray(defaultValue)) {
    return Array.isArray(incomingValue) ? clone(incomingValue) : clone(defaultValue);
  }

  if (defaultValue && typeof defaultValue === 'object') {
    const next = {};

    Object.keys(defaultValue).forEach((key) => {
      next[key] = assignKnownShape(defaultValue[key], incomingValue?.[key]);
    });

    return next;
  }

  if (typeof defaultValue === 'number') {
    const parsed = Number(incomingValue);
    return Number.isFinite(parsed) ? parsed : defaultValue;
  }

  if (typeof defaultValue === 'boolean') {
    return typeof incomingValue === 'boolean' ? incomingValue : defaultValue;
  }

  return typeof incomingValue === 'string' ? incomingValue : defaultValue;
}

export function sanitizeState(input, defaults) {
  return assignKnownShape(defaults, input);
}

export function getValueByPath(object, path) {
  return path.split('.').reduce((current, key) => current?.[key], object);
}

export function setValueByPath(object, path, value) {
  const next = clone(object);
  const parts = path.split('.');
  let current = next;

  for (let index = 0; index < parts.length - 1; index += 1) {
    current = current[parts[index]];
  }

  current[parts.at(-1)] = value;
  return next;
}

export function toStorageState(state, defaults) {
  return sanitizeState(state, defaults);
}
