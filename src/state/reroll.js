import { REROLL_DEFAULTS, REROLL_LOCKABLE_PATHS } from '../config/defaults.js';
import { getValueByPath, setValueByPath } from './serializers.js';

function clone(value) {
  return structuredClone(value);
}

function randomInRange(rng, range) {
  return range.min + (range.max - range.min) * rng();
}

function randomIntInRange(rng, range) {
  return Math.round(randomInRange(rng, range));
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function formatClock(totalSeconds) {
  const safe = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function parseTimeToMinutes(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? '').trim());
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours > 23 || minutes > 59) {
    return null;
  }
  return hours * 60 + minutes;
}

function formatTimeFromMinutes(value) {
  const minutes = ((Math.round(value) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

function diffMinutes(start, end) {
  if (start === null || end === null) {
    return null;
  }
  let diff = end - start;
  if (diff <= 0) {
    diff += 1440;
  }
  return diff;
}

function isLocked(state, path) {
  return state.locks?.manualPaths?.includes(path) ?? false;
}

function setIfUnlocked(state, path, value) {
  if (isLocked(state, path)) {
    return state;
  }
  return setValueByPath(state, path, value);
}

export function addManualLock(state, path) {
  if (!REROLL_LOCKABLE_PATHS.has(path)) {
    return state;
  }
  const next = clone(state);
  const current = Array.isArray(next.locks?.manualPaths) ? next.locks.manualPaths : [];
  next.locks = {
    ...(next.locks ?? {}),
    manualPaths: current.includes(path) ? current : [...current, path],
  };
  return next;
}

export function clearManualLocks(state) {
  return {
    ...state,
    locks: {
      ...(state.locks ?? {}),
      manualPaths: [],
    },
  };
}

export function getManualLockCount(state) {
  return Array.isArray(state.locks?.manualPaths) ? state.locks.manualPaths.length : 0;
}

export function rerollPosterState(inputState, options = {}) {
  const rng = options.rng ?? Math.random;
  let state = clone(inputState);

  const durationMinutesRoll = randomIntInRange(rng, REROLL_DEFAULTS.durationMinutes);
  const startLocked = isLocked(state, 'session.startTime');
  const endLocked = isLocked(state, 'session.endTime');
  const currentStart = parseTimeToMinutes(state.session.startTime);
  const currentEnd = parseTimeToMinutes(state.session.endTime);
  let durationMinutes = durationMinutesRoll;
  let startMinutes = currentStart;
  let endMinutes = currentEnd;

  if (startLocked && endLocked) {
    durationMinutes = diffMinutes(currentStart, currentEnd) ?? durationMinutesRoll;
  } else if (startLocked) {
    startMinutes = currentStart ?? REROLL_DEFAULTS.startMinuteOfDay.min;
    endMinutes = startMinutes + durationMinutes;
    state = setIfUnlocked(state, 'session.endTime', formatTimeFromMinutes(endMinutes));
  } else if (endLocked) {
    endMinutes = currentEnd ?? REROLL_DEFAULTS.startMinuteOfDay.max;
    startMinutes = endMinutes - durationMinutes;
    state = setIfUnlocked(state, 'session.startTime', formatTimeFromMinutes(startMinutes));
  } else {
    const latestStart = Math.max(
      REROLL_DEFAULTS.startMinuteOfDay.min,
      REROLL_DEFAULTS.startMinuteOfDay.max - durationMinutes,
    );
    startMinutes = randomIntInRange(rng, {
      min: REROLL_DEFAULTS.startMinuteOfDay.min,
      max: latestStart,
    });
    endMinutes = startMinutes + durationMinutes;
    state = setIfUnlocked(state, 'session.startTime', formatTimeFromMinutes(startMinutes));
    state = setIfUnlocked(state, 'session.endTime', formatTimeFromMinutes(endMinutes));
  }

  const sportSeconds = durationMinutes * 60 + randomIntInRange(rng, { min: 0, max: 59 });
  const totalSeconds = sportSeconds + randomIntInRange(rng, REROLL_DEFAULTS.extraTotalMinutes) * 60;
  state = setIfUnlocked(state, 'metrics.sportDuration', formatClock(sportSeconds));
  state = setIfUnlocked(state, 'metrics.totalDuration', formatClock(totalSeconds));

  const lockedDistance = Number.parseFloat(String(state.metrics.distanceKm).replace(',', '.'));
  const generatedDistance = randomInRange(rng, REROLL_DEFAULTS.distanceKm);
  const distanceKm = isLocked(state, 'metrics.distanceKm') && Number.isFinite(lockedDistance)
    ? lockedDistance
    : generatedDistance;
  state = setIfUnlocked(state, 'metrics.distanceKm', distanceKm.toFixed(2));

  const stepLength = randomInRange(rng, REROLL_DEFAULTS.stepLengthMeters);
  const steps = Math.max(1, Math.round((distanceKm * 1000) / stepLength));
  const cadence = Math.max(45, Math.round(steps / Math.max(1, durationMinutes)));
  const calories = Math.max(1, Math.round(distanceKm * randomInRange(rng, REROLL_DEFAULTS.caloriesPerKm)));

  state = setIfUnlocked(state, 'metrics.steps', String(steps));
  state = setIfUnlocked(state, 'metrics.cadence', String(cadence));
  state = setIfUnlocked(state, 'metrics.calories', String(calories));
  state = setIfUnlocked(state, 'metrics.heartRate', String(randomIntInRange(rng, REROLL_DEFAULTS.heartRate)));
  state = setIfUnlocked(state, 'metrics.climb', String(randomIntInRange(rng, REROLL_DEFAULTS.climbMeters)));
  state = setIfUnlocked(state, 'metrics.exerciseLoad', String(randomIntInRange(rng, REROLL_DEFAULTS.exerciseLoad)));
  state = setIfUnlocked(state, 'statusBar.batteryLevel', randomIntInRange(rng, REROLL_DEFAULTS.batteryLevel));

  return {
    state,
    targetDistanceKm: distanceKm,
    durationMinutes,
  };
}
