import { KEEP_MAP_FRAME_RATIO, clampSelection } from './selectionMath.js';
import { normalizeRouteStyle } from '../render/routeStyle.js';

const IMAGE_ONLY_STYLE_PRESET = 'image-only';

function asNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function sanitizeSkeletonLines(lines) {
  if (!Array.isArray(lines)) {
    return [];
  }

  return lines
    .map((line, index) => {
      const points = Array.isArray(line?.points)
        ? line.points
          .map((point) => ({
            x: asNumber(point?.x, NaN),
            y: asNumber(point?.y, NaN),
          }))
          .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
        : [];

      return {
        id: typeof line?.id === 'string' && line.id ? line.id : `line-${index + 1}`,
        points,
      };
    })
    .filter((line) => line.points.length >= 2);
}

export function createDefaultRouteConfig() {
  return {
    targetDistanceKm: 2.8,
    seed: '',
    metersPerPixel: 1,
    loopBias: 0.72,
    stepPx: 6,
    smoothingWindow: 5,
    jitterAmplitudePx: 1.15,
    previewShiftPx: 12,
    skeletonSnapRadiusPx: 12,
    closeLoopSnapRadiusPx: 14,
    intersectionSnapRadiusPx: 10,
    skeletonFollowBias: 0.9,
    branchSwitchPenalty: 0.88,
    deadEndPenalty: 1.1,
    maskFallbackBias: 0.2,
    cycleExitPenalty: 1.45,
    minLoopCoverage: 0.72,
    turnaroundAmplitudePx: 12,
  };
}

function sanitizeScaleCalibration(calibration) {
  const points = Array.isArray(calibration?.points)
    ? calibration.points
      .map((point) => ({
        x: asNumber(point?.x, NaN),
        y: asNumber(point?.y, NaN),
      }))
      .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
      .slice(0, 2)
    : [];

  return {
    points,
    distanceMeters: clamp(asNumber(calibration?.distanceMeters, 100), 0.1, 100000),
  };
}

function sanitizeRoadEndNodes(nodes) {
  if (!Array.isArray(nodes)) {
    return [];
  }

  return nodes
    .map((node, index) => ({
      id: typeof node?.id === 'string' && node.id ? node.id : `road-end-${index + 1}`,
      x: asNumber(node?.x, NaN),
      y: asNumber(node?.y, NaN),
    }))
    .filter((node) => Number.isFinite(node.x) && Number.isFinite(node.y));
}

function sanitizeRouteLayer(routeLayer) {
  if (!routeLayer || typeof routeLayer !== 'object') {
    return null;
  }

  const points = Array.isArray(routeLayer.points)
    ? routeLayer.points
      .map((point) => ({
        x: asNumber(point?.x, NaN),
        y: asNumber(point?.y, NaN),
      }))
      .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    : [];

  if (points.length < 2) {
    return null;
  }

  const bbox = routeLayer.bbox && typeof routeLayer.bbox === 'object'
    ? {
        x: asNumber(routeLayer.bbox.x, 0),
        y: asNumber(routeLayer.bbox.y, 0),
        width: Math.max(0, asNumber(routeLayer.bbox.width, 0)),
        height: Math.max(0, asNumber(routeLayer.bbox.height, 0)),
        minX: asNumber(routeLayer.bbox.minX, asNumber(routeLayer.bbox.x, 0)),
        minY: asNumber(routeLayer.bbox.minY, asNumber(routeLayer.bbox.y, 0)),
        maxX: asNumber(routeLayer.bbox.maxX, asNumber(routeLayer.bbox.x, 0) + asNumber(routeLayer.bbox.width, 0)),
        maxY: asNumber(routeLayer.bbox.maxY, asNumber(routeLayer.bbox.y, 0) + asNumber(routeLayer.bbox.height, 0)),
      }
    : null;

  return {
    enabled: routeLayer.enabled !== false,
    points,
    width: Math.max(1, Math.round(asNumber(routeLayer.width, 1))),
    height: Math.max(1, Math.round(asNumber(routeLayer.height, 1))),
    style: normalizeRouteStyle(routeLayer.style),
    bbox,
    sourceProjectVersion: Math.max(1, Math.round(asNumber(routeLayer.sourceProjectVersion, 3))),
  };
}

function sanitizePosterOutput(posterOutput) {
  if (!posterOutput || typeof posterOutput !== 'object') {
    return null;
  }

  return {
    mapImageDataUrl: typeof posterOutput.mapImageDataUrl === 'string' ? posterOutput.mapImageDataUrl : null,
    mapImageWidth: Math.max(0, Math.round(asNumber(posterOutput.mapImageWidth, 0))),
    mapImageHeight: Math.max(0, Math.round(asNumber(posterOutput.mapImageHeight, 0))),
    capturePaddingPx: Math.max(0, Math.round(asNumber(posterOutput.capturePaddingPx, 0))),
    routeLayer: sanitizeRouteLayer(posterOutput.routeLayer),
  };
}

function sanitizeImageView(view) {
  return {
    scale: clamp(asNumber(view?.scale, 1), 0.3, 5),
    offsetX: clamp(asNumber(view?.offsetX, 0), -3000, 3000),
    offsetY: clamp(asNumber(view?.offsetY, 0), -3000, 3000),
  };
}

function serializeBackground(state, options = {}) {
  const background = options.background ?? state.background ?? {};
  const view = background.view ?? state.imageView;
  return {
    sourceType: 'image',
    dataUrl: background.dataUrl ?? state.imageBackground?.dataUrl ?? null,
    width: Math.max(0, Math.round(asNumber(background.width, state.imageBackground?.width ?? 0))),
    height: Math.max(0, Math.round(asNumber(background.height, state.imageBackground?.height ?? 0))),
    name: background.name ?? state.imageBackground?.name ?? '图片底图',
    view: sanitizeImageView(view),
  };
}

export function serializeLabProject(state, options = {}) {
  return {
    version: 3,
    background: serializeBackground(state, options),
    map: {
      placeLabel: state.placeLabel,
      placeKeyword: state.placeKeyword,
      center: { ...state.center },
      zoom: state.zoom,
      pitch: state.pitch,
      rotation: state.rotation,
      stylePresetId: state.stylePresetId,
    },
    selection: {
      x: state.selection.x,
      y: state.selection.y,
      width: state.selection.width,
      height: state.selection.height,
      ratio: KEEP_MAP_FRAME_RATIO,
    },
    mask: {
      width: state.maskSize.width,
      height: state.maskSize.height,
      dataUrl: options.maskDataUrl ?? null,
    },
    skeleton: {
      lines: sanitizeSkeletonLines(state.skeleton?.lines).map((line) => ({
        id: line.id,
        points: line.points.map((point) => ({ ...point })),
      })),
    },
    roadEndNodes: sanitizeRoadEndNodes(state.roadEndNodes).map((node) => ({ ...node })),
    scaleCalibration: sanitizeScaleCalibration(state.scaleCalibration),
    routeConfig: { ...state.routeConfig },
    routePreview: state.routePreview
      ? {
          points: state.routePreview.points.map((point) => ({ ...point })),
          totalDistancePx: state.routePreview.totalDistancePx,
          estimatedDistanceKm: state.routePreview.estimatedDistanceKm,
          metersPerPixel: state.routePreview.metersPerPixel,
          strategy: state.routePreview.strategy ?? 'mask-fallback',
          seed: state.routePreview.seed ?? '',
        }
      : null,
    posterOutput: options.posterOutput ?? null,
  };
}

export function deserializeLabProject(payload, viewportWidth, viewportHeight) {
  const safePayload = payload && typeof payload === 'object' ? payload : {};
  const map = safePayload.map && typeof safePayload.map === 'object' ? safePayload.map : {};
  const selection = safePayload.selection && typeof safePayload.selection === 'object' ? safePayload.selection : {};
  const mask = safePayload.mask && typeof safePayload.mask === 'object' ? safePayload.mask : {};
  const skeleton = safePayload.skeleton && typeof safePayload.skeleton === 'object' ? safePayload.skeleton : {};
  const routeConfig = safePayload.routeConfig && typeof safePayload.routeConfig === 'object'
    ? safePayload.routeConfig
    : {};
  const routePreview = safePayload.routePreview && typeof safePayload.routePreview === 'object'
    ? safePayload.routePreview
    : null;
  const background = safePayload.background && typeof safePayload.background === 'object'
    ? safePayload.background
    : null;
  const posterOutput = safePayload.posterOutput && typeof safePayload.posterOutput === 'object'
    ? safePayload.posterOutput
    : null;
  const version = Math.max(2, Math.round(asNumber(safePayload.version, 2)));

  return {
    version,
    background: {
      sourceType: 'image',
      dataUrl: typeof background?.dataUrl === 'string' ? background.dataUrl : null,
      width: Math.max(0, Math.round(asNumber(background?.width, 0))),
      height: Math.max(0, Math.round(asNumber(background?.height, 0))),
      name: typeof background?.name === 'string' && background.name ? background.name : '图片底图',
      view: sanitizeImageView(background?.view),
    },
    map: {
      placeLabel: typeof map.placeLabel === 'string' && map.placeLabel ? map.placeLabel : '示例地点',
      placeKeyword: typeof map.placeKeyword === 'string' && map.placeKeyword ? map.placeKeyword : '北京市',
      center: {
        lat: asNumber(map.center?.lat, 40.0063),
        lng: asNumber(map.center?.lng, 116.3269),
      },
      zoom: clamp(asNumber(map.zoom, 16.9), 3, 20),
      pitch: clamp(asNumber(map.pitch, 0), 0, 45),
      rotation: clamp(asNumber(map.rotation, 0), 0, 360),
      stylePresetId: typeof map.stylePresetId === 'string' && map.stylePresetId
        ? map.stylePresetId
        : IMAGE_ONLY_STYLE_PRESET,
    },
    selection: clampSelection(
      {
        x: asNumber(selection.x, 20),
        y: asNumber(selection.y, 20),
        width: asNumber(selection.width, 420),
        height: asNumber(selection.height, 336),
      },
      viewportWidth,
      viewportHeight,
    ),
    mask: {
      width: Math.max(1, Math.round(asNumber(mask.width, selection.width ?? 420))),
      height: Math.max(1, Math.round(asNumber(mask.height, selection.height ?? 336))),
      dataUrl: typeof mask.dataUrl === 'string' ? mask.dataUrl : null,
    },
    skeleton: {
      lines: sanitizeSkeletonLines(skeleton.lines),
    },
    roadEndNodes: sanitizeRoadEndNodes(safePayload.roadEndNodes),
    scaleCalibration: sanitizeScaleCalibration(safePayload.scaleCalibration),
    routeConfig: {
      targetDistanceKm: clamp(asNumber(routeConfig.targetDistanceKm, 2.8), 0.2, 50),
      seed: typeof routeConfig.seed === 'string' ? routeConfig.seed : '',
      metersPerPixel: clamp(asNumber(routeConfig.metersPerPixel, 1), 0.001, 1000),
      loopBias: clamp(asNumber(routeConfig.loopBias, 0.72), 0, 1),
      stepPx: clamp(asNumber(routeConfig.stepPx, 6), 2, 24),
      smoothingWindow: clamp(asNumber(routeConfig.smoothingWindow, 5), 1, 25),
      jitterAmplitudePx: clamp(asNumber(routeConfig.jitterAmplitudePx, 1.15), 0, 20),
      previewShiftPx: clamp(asNumber(routeConfig.previewShiftPx, 12), 0, 80),
      skeletonSnapRadiusPx: clamp(asNumber(routeConfig.skeletonSnapRadiusPx, 12), 4, 36),
      closeLoopSnapRadiusPx: clamp(asNumber(routeConfig.closeLoopSnapRadiusPx, 14), 4, 48),
      intersectionSnapRadiusPx: clamp(asNumber(routeConfig.intersectionSnapRadiusPx, 10), 4, 36),
      skeletonFollowBias: clamp(asNumber(routeConfig.skeletonFollowBias, 0.9), 0, 2),
      branchSwitchPenalty: clamp(asNumber(routeConfig.branchSwitchPenalty, 0.88), 0, 3),
      deadEndPenalty: clamp(asNumber(routeConfig.deadEndPenalty, 1.1), 0, 4),
      maskFallbackBias: clamp(asNumber(routeConfig.maskFallbackBias, 0.2), 0, 1),
      cycleExitPenalty: clamp(asNumber(routeConfig.cycleExitPenalty, 1.45), 0, 4),
      minLoopCoverage: clamp(asNumber(routeConfig.minLoopCoverage, 0.72), 0, 1),
      turnaroundAmplitudePx: clamp(asNumber(routeConfig.turnaroundAmplitudePx, 12), 0, 30),
    },
    routePreview: routePreview
      ? {
          points: Array.isArray(routePreview.points)
            ? routePreview.points
              .map((point) => ({
                x: asNumber(point.x, 0),
                y: asNumber(point.y, 0),
              }))
              .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
            : [],
          totalDistancePx: asNumber(routePreview.totalDistancePx, 0),
          estimatedDistanceKm: asNumber(routePreview.estimatedDistanceKm, 0),
          metersPerPixel: asNumber(routePreview.metersPerPixel, 0),
          strategy: typeof routePreview.strategy === 'string' ? routePreview.strategy : 'mask-fallback',
          seed: typeof routePreview.seed === 'string' ? routePreview.seed : '',
        }
      : null,
    posterOutput: sanitizePosterOutput(posterOutput),
  };
}
