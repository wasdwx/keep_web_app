export const DEFAULT_ROUTE_STYLE = {
  color: '#00dfd8',
  width: 10,
  shadowColor: 'rgba(12, 56, 58, 0.22)',
  shadowWidth: 10,
  markerRadius: 12,
  markerBorderWidth: 6,
  markerBorderColor: '#ffffff',
  startColor: '#ff5c6c',
  endColor: '#18c99a',
  showEndpoints: true,
  gradientEnabled: true,
  gradientColors: ['#00cfaf', '#00d2b5', '#01d7b9', '#00d9c6', '#10d5cd', '#00dfd8'],
  fastColor: '#00dfd8',
  slowColor: '#00cfaf',
  endpointSlowRatio: 0.16,
  turnSlowAngle: 0.55,
};

export const ROUTE_STYLE_LIMITS = {
  minWidth: 2,
  maxWidth: Math.max(DEFAULT_ROUTE_STYLE.width, 2),
  minShadowWidth: 0,
  maxShadowWidth: Math.max(DEFAULT_ROUTE_STYLE.shadowWidth, 0),
  minMarkerRadius: 4,
  maxMarkerRadius: Math.max(DEFAULT_ROUTE_STYLE.markerRadius, 4),
  minMarkerBorderWidth: 0,
  maxMarkerBorderWidth: Math.max(DEFAULT_ROUTE_STYLE.markerBorderWidth, 0),
};

function numberOr(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeRouteStyle() {
  return {
    color: DEFAULT_ROUTE_STYLE.color,
    width: clamp(
      numberOr(DEFAULT_ROUTE_STYLE.width, 8),
      ROUTE_STYLE_LIMITS.minWidth,
      ROUTE_STYLE_LIMITS.maxWidth,
    ),
    shadowColor: DEFAULT_ROUTE_STYLE.shadowColor,
    shadowWidth: clamp(
      numberOr(DEFAULT_ROUTE_STYLE.shadowWidth, 12),
      ROUTE_STYLE_LIMITS.minShadowWidth,
      ROUTE_STYLE_LIMITS.maxShadowWidth,
    ),
    markerRadius: clamp(
      numberOr(DEFAULT_ROUTE_STYLE.markerRadius, 7),
      ROUTE_STYLE_LIMITS.minMarkerRadius,
      ROUTE_STYLE_LIMITS.maxMarkerRadius,
    ),
    markerBorderWidth: clamp(
      numberOr(DEFAULT_ROUTE_STYLE.markerBorderWidth, 4),
      ROUTE_STYLE_LIMITS.minMarkerBorderWidth,
      ROUTE_STYLE_LIMITS.maxMarkerBorderWidth,
    ),
    markerBorderColor: DEFAULT_ROUTE_STYLE.markerBorderColor,
    startColor: DEFAULT_ROUTE_STYLE.startColor,
    endColor: DEFAULT_ROUTE_STYLE.endColor,
    showEndpoints: DEFAULT_ROUTE_STYLE.showEndpoints !== false,
    gradientEnabled: DEFAULT_ROUTE_STYLE.gradientEnabled !== false,
    gradientColors: DEFAULT_ROUTE_STYLE.gradientColors,
    fastColor: DEFAULT_ROUTE_STYLE.fastColor,
    slowColor: DEFAULT_ROUTE_STYLE.slowColor,
    endpointSlowRatio: DEFAULT_ROUTE_STYLE.endpointSlowRatio,
    turnSlowAngle: DEFAULT_ROUTE_STYLE.turnSlowAngle,
  };
}

function parseHexColor(color) {
  const hex = String(color || '').trim().replace(/^#/, '');
  if (!/^[0-9a-f]{6}$/i.test(hex)) {
    return { r: 0, g: 223, b: 216 };
  }
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  };
}

function toHex(value) {
  return Math.round(clamp(value, 0, 255)).toString(16).padStart(2, '0');
}

function mixColor(a, b, t) {
  const ratio = clamp(t, 0, 1);
  const start = parseHexColor(a);
  const end = parseHexColor(b);
  return `#${toHex(start.r + (end.r - start.r) * ratio)}${toHex(start.g + (end.g - start.g) * ratio)}${toHex(start.b + (end.b - start.b) * ratio)}`;
}

function paletteColor(colors, t) {
  const palette = Array.isArray(colors) && colors.length >= 2 ? colors : DEFAULT_ROUTE_STYLE.gradientColors;
  const ratio = clamp(t, 0, 1);
  const scaled = ratio * (palette.length - 1);
  const index = Math.min(palette.length - 2, Math.floor(scaled));
  return mixColor(palette[index], palette[index + 1], scaled - index);
}

function pointDistance(a, b) {
  return Math.hypot(Number(a?.x) - Number(b?.x), Number(a?.y) - Number(b?.y));
}

function localTurnAngle(points, index) {
  const prev = points[index - 1];
  const curr = points[index];
  const next = points[index + 1];
  if (!prev || !curr || !next) {
    return 0;
  }
  const ax = Number(curr.x) - Number(prev.x);
  const ay = Number(curr.y) - Number(prev.y);
  const bx = Number(next.x) - Number(curr.x);
  const by = Number(next.y) - Number(curr.y);
  const lenA = Math.hypot(ax, ay);
  const lenB = Math.hypot(bx, by);
  if (lenA < 0.001 || lenB < 0.001) {
    return 0;
  }
  const cos = clamp((ax * bx + ay * by) / (lenA * lenB), -1, 1);
  return Math.acos(cos);
}

export function getRouteSegmentColor(points, segmentIndex, style = normalizeRouteStyle()) {
  if (!style.gradientEnabled) {
    return style.color;
  }

  const totalSegments = Math.max(1, points.length - 1);
  const centerIndex = clamp(segmentIndex + 0.5, 0, totalSegments);
  const progress = centerIndex / totalSegments;
  const endpointRatio = clamp(Number(style.endpointSlowRatio) || 0.16, 0.01, 0.48);
  const distanceToEndpoint = Math.min(progress, 1 - progress);
  const endpointSlow = clamp(1 - distanceToEndpoint / endpointRatio, 0, 1);
  const angle = Math.max(
    localTurnAngle(points, segmentIndex),
    localTurnAngle(points, segmentIndex + 1),
  );
  const turnSlow = clamp(angle / Math.max(0.01, Number(style.turnSlowAngle) || 0.55), 0, 1);
  const currentDistance = pointDistance(points[segmentIndex], points[segmentIndex + 1]);
  const previousDistance = pointDistance(points[Math.max(0, segmentIndex - 1)], points[segmentIndex]);
  const nextDistance = pointDistance(points[segmentIndex + 1], points[Math.min(points.length - 1, segmentIndex + 2)]);
  const avgDistance = (previousDistance + currentDistance + nextDistance) / 3 || currentDistance || 1;
  const longStepFast = clamp(currentDistance / Math.max(1, avgDistance * 1.25), 0, 1);
  const slowFactor = clamp(Math.max(endpointSlow, turnSlow), 0, 1);
  const fastFactor = clamp((1 - slowFactor) * (0.72 + longStepFast * 0.28), 0, 1);

  return paletteColor(style.gradientColors, fastFactor);
}
