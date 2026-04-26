export const APP_DEFAULTS = {
  profileNickname: 'Keeper',
  city: '北京市',
  sportLabel: '户外行走',
  weather: '晴',
  temperature: '16°C',
};

export const REROLL_DEFAULTS = {
  batteryLevel: { min: 40, max: 90 },
  durationMinutes: { min: 45, max: 71 },
  distanceKm: { min: 2.3, max: 4.0 },
  stepLengthMeters: { min: 0.62, max: 0.78 },
  caloriesPerKm: { min: 90, max: 115 },
  heartRate: { min: 96, max: 118 },
  climbMeters: { min: 0, max: 12 },
  exerciseLoad: { min: 8, max: 14 },
  extraTotalMinutes: { min: 1, max: 12 },
  startMinuteOfDay: { min: 6 * 60 + 30, max: 21 * 60 },
};

export const NEVER_REROLL_PATHS = new Set([
  'profile.nickname',
  'profile.avatarAssetId',
  'session.location',
  'session.sportLabel',
  'statusBar.presetId',
  'map.sourceType',
  'map.sourceId',
  'map.assetId',
  'map.routeLayer',
  'map.routeProject',
  'map.routeProjectAssetId',
  'ui.previewZoom',
]);

export const REROLL_LOCKABLE_PATHS = new Set([
  'session.date',
  'session.startTime',
  'session.endTime',
  'session.weather',
  'session.temperature',
  'metrics.distanceKm',
  'metrics.sportDuration',
  'metrics.totalDuration',
  'metrics.calories',
  'metrics.steps',
  'metrics.cadence',
  'metrics.heartRate',
  'metrics.climb',
  'metrics.exerciseLoad',
  'statusBar.batteryLevel',
]);
