import { APP_DEFAULTS } from '../config/defaults.js';

function pad(value) {
  return String(value).padStart(2, '0');
}

function formatDate(now) {
  return `${now.getFullYear()}/${pad(now.getMonth() + 1)}/${pad(now.getDate())}`;
}

function formatTime(now) {
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function subtractMinutes(now, minutes) {
  const next = new Date(now.getTime());
  next.setMinutes(next.getMinutes() - minutes);
  return next;
}

export function createDefaultState() {
  const now = new Date();
  const start = subtractMinutes(now, 45);

  return {
    templatePreset: 'keep-walk-v1',
    profile: {
      nickname: APP_DEFAULTS.profileNickname,
      avatarAssetId: null,
    },
    session: {
      sportLabel: APP_DEFAULTS.sportLabel,
      date: formatDate(now),
      startTime: formatTime(start),
      endTime: formatTime(now),
      location: APP_DEFAULTS.city,
      weather: APP_DEFAULTS.weather,
      temperature: APP_DEFAULTS.temperature,
    },
    metrics: {
      distanceKm: '2.89',
      sportDuration: '00:45:04',
      totalDuration: '00:47:04',
      calories: '275',
      steps: '4091',
      cadence: '90',
      heartRate: '115',
      climb: '11',
      exerciseLoad: '13',
    },
    map: {
      sourceType: 'upload',
      sourceId: null,
      assetId: null,
      scale: 1.1,
      offsetX: 0,
      offsetY: 0,
      routeLayer: null,
      routeProject: null,
      routeProjectAssetId: null,
    },
    statusBar: {
      presetId: 'preset1',
      batteryLevel: 43,
    },
    ui: {
      previewZoom: 1,
    },
    locks: {
      manualPaths: [],
    },
  };
}

export function createFormResetState(currentState) {
  const defaults = createDefaultState();

  return {
    ...defaults,
    profile: {
      ...defaults.profile,
      avatarAssetId: currentState.profile.avatarAssetId,
    },
    map: {
      ...currentState.map,
      routeLayer: null,
    },
    locks: {
      manualPaths: [],
    },
  };
}

export function createHardResetState() {
  return createDefaultState();
}
