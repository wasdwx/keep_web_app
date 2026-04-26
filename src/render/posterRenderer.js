import { LAYOUT_PRESETS } from './layoutPreset.js';
import { clampCoverTransform, clampRouteLayerTransform, computeCoverRect } from './mapMath.js';
import { getRouteSegmentColor, normalizeRouteStyle } from './routeStyle.js';
import { clampBatteryLevel, getStatusBarPreset } from './statusBarPresets.js';

export const POSTER_WIDTH = 1080;
export const POSTER_HEIGHT = 2400;

function drawRoundRectPath(ctx, x, y, width, height, radius) {
  const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.arcTo(x + width, y, x + width, y + height, safeRadius);
  ctx.arcTo(x + width, y + height, x, y + height, safeRadius);
  ctx.arcTo(x, y + height, x, y, safeRadius);
  ctx.arcTo(x, y, x + width, y, safeRadius);
  ctx.closePath();
}

function fillRoundRect(ctx, rect, color, radius) {
  ctx.save();
  drawRoundRectPath(ctx, rect.x, rect.y, rect.width, rect.height, radius);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function fillLevelRect(ctx, rect, ratio, color, radius) {
  const width = Math.max(0, Math.min(rect.width, rect.width * ratio));
  if (width <= 0.5) {
    return;
  }

  ctx.save();
  drawRoundRectPath(ctx, rect.x, rect.y, rect.width, rect.height, radius);
  ctx.clip();
  ctx.fillStyle = color;
  ctx.fillRect(rect.x, rect.y, width, rect.height);
  ctx.restore();
}

function drawStatusBarCleanup(ctx, cover) {
  const coverHeight = Math.max(cover.height, 80);

  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(cover.x, cover.y, cover.width, coverHeight);
  ctx.fillRect(96, 24, 232, 34);
  ctx.fillRect(730, 16, 312, 36);
  ctx.restore();
}

function drawText(ctx, text, x, y, options) {
  ctx.save();
  ctx.font = `${options.weight ?? 400} ${options.size}px ${options.family ?? 'sans-serif'}`;
  ctx.fillStyle = options.color ?? '#000000';
  ctx.textBaseline = options.textBaseline ?? 'top';
  ctx.textAlign = options.textAlign ?? 'left';
  ctx.fillText(text, x, y);
  const width = ctx.measureText(text).width;
  ctx.restore();
  return width;
}

function drawCenteredText(ctx, text, rect, options) {
  ctx.save();
  ctx.font = `${options.weight ?? 400} ${options.size}px ${options.family ?? 'sans-serif'}`;
  ctx.fillStyle = options.color ?? '#000000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, rect.x + rect.width / 2, rect.y + rect.height / 2);
  ctx.restore();
}

function drawCircleImage(ctx, image, rect) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(rect.x + rect.size / 2, rect.y + rect.size / 2, rect.size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  const cover = computeCoverRect(
    { x: rect.x, y: rect.y, width: rect.size, height: rect.size },
    image.naturalWidth || image.width,
    image.naturalHeight || image.height,
  );

  ctx.drawImage(image, cover.x, cover.y, cover.width, cover.height);
  ctx.restore();
}

function resolveMapTransform(frame, image, mapState) {
  const imageWidth = image.naturalWidth || image.width;
  const imageHeight = image.naturalHeight || image.height;
  const routeLayer = mapState?.routeLayer;
  if (routeLayer?.enabled && Array.isArray(routeLayer.points) && routeLayer.points.length >= 2) {
    return clampRouteLayerTransform(frame, { width: imageWidth, height: imageHeight }, routeLayer, mapState);
  }
  return clampCoverTransform(frame, { width: imageWidth, height: imageHeight }, mapState);
}

function drawMapImage(ctx, image, frame, transform) {
  const imageWidth = image.naturalWidth || image.width;
  const imageHeight = image.naturalHeight || image.height;
  const normalized = transform ?? clampCoverTransform(frame, { width: imageWidth, height: imageHeight }, {});
  const drawRect = computeCoverRect(frame, imageWidth, imageHeight, normalized.scale, normalized.offsetX, normalized.offsetY);

  ctx.save();
  drawRoundRectPath(ctx, frame.x, frame.y, frame.width, frame.height, frame.radius);
  ctx.clip();
  ctx.drawImage(image, drawRect.x, drawRect.y, drawRect.width, drawRect.height);
  ctx.restore();
}

function drawMapRouteLayer(ctx, routeLayer, frame, transform) {
  if (!routeLayer?.enabled || !Array.isArray(routeLayer.points) || routeLayer.points.length < 2) {
    return;
  }

  const layerWidth = Number(routeLayer.width);
  const layerHeight = Number(routeLayer.height);
  if (!Number.isFinite(layerWidth) || !Number.isFinite(layerHeight) || layerWidth <= 0 || layerHeight <= 0) {
    return;
  }

  const normalized = transform ?? clampRouteLayerTransform(frame, { width: layerWidth, height: layerHeight }, routeLayer, {});
  const drawRect = computeCoverRect(frame, layerWidth, layerHeight, normalized.scale, normalized.offsetX, normalized.offsetY);
  const scaleX = drawRect.width / layerWidth;
  const scaleY = drawRect.height / layerHeight;
  const lineScale = (scaleX + scaleY) / 2;
  const style = normalizeRouteStyle(routeLayer.style);
  const lineWidth = Math.max(2, style.width * lineScale);
  const shadowWidth = Math.max(lineWidth, style.shadowWidth * lineScale);

  ctx.save();
  drawRoundRectPath(ctx, frame.x, frame.y, frame.width, frame.height, frame.radius);
  ctx.clip();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const drawPath = () => {
    ctx.beginPath();
    routeLayer.points.forEach((point, index) => {
      const x = drawRect.x + Number(point.x) * scaleX;
      const y = drawRect.y + Number(point.y) * scaleY;
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
  };

  if (style.shadowColor !== 'transparent') {
    drawPath();
    ctx.strokeStyle = style.shadowColor;
    ctx.lineWidth = shadowWidth;
    ctx.stroke();
  }

  ctx.lineWidth = lineWidth;
  for (let index = 1; index < routeLayer.points.length; index += 1) {
    const previous = routeLayer.points[index - 1];
    const current = routeLayer.points[index];
    ctx.beginPath();
    ctx.moveTo(drawRect.x + Number(previous.x) * scaleX, drawRect.y + Number(previous.y) * scaleY);
    ctx.lineTo(drawRect.x + Number(current.x) * scaleX, drawRect.y + Number(current.y) * scaleY);
    ctx.strokeStyle = getRouteSegmentColor(routeLayer.points, index - 1, style);
    ctx.stroke();
  }

  const drawMarker = (point, fillStyle) => {
    const x = drawRect.x + Number(point.x) * scaleX;
    const y = drawRect.y + Number(point.y) * scaleY;
    const radius = Math.max(5, style.markerRadius * lineScale);
    const borderWidth = Math.max(0, style.markerBorderWidth * lineScale);
    ctx.beginPath();
    ctx.fillStyle = style.markerBorderColor;
    ctx.arc(x, y, radius + borderWidth, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.fillStyle = fillStyle;
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  };

  if (style.showEndpoints !== false) {
    drawMarker(routeLayer.points[0], style.startColor);
    drawMarker(routeLayer.points.at(-1), style.endColor);
  }
  ctx.restore();
}

function drawMapCornerBadge(ctx, preset, badgeImage) {
  if (!badgeImage || !preset.mapCornerBadge) {
    return;
  }

  const frame = preset.map;
  const config = preset.mapCornerBadge;
  const scale = Number(config.scale) || 1;
  const opacity = Math.max(0, Math.min(1, Number(config.opacity) || 1));
  const margin = Number(config.margin) || 0;
  const width = (badgeImage.naturalWidth || badgeImage.width) * scale;
  const height = (badgeImage.naturalHeight || badgeImage.height) * scale;
  const x = frame.x + frame.width - margin - width;
  const y = frame.y + margin;

  ctx.save();
  drawRoundRectPath(ctx, frame.x, frame.y, frame.width, frame.height, frame.radius);
  ctx.clip();
  ctx.globalAlpha = opacity;
  ctx.drawImage(badgeImage, x, y, width, height);
  ctx.restore();
}

function parseDistance(distanceKm) {
  const parsed = Number(distanceKm);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseClockLike(value) {
  const parts = String(value || '')
    .split(':')
    .map((item) => Number(item));

  if (parts.some((item) => !Number.isFinite(item))) {
    return null;
  }

  if (parts.length === 2) {
    return parts[0] * 3600 + parts[1] * 60;
  }

  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }

  return null;
}

function formatPace(duration, distanceKm) {
  const seconds = parseClockLike(duration);
  const distance = parseDistance(distanceKm);

  if (!seconds || !distance) {
    return '--';
  }

  const secondsPerKm = Math.round(seconds / distance);
  const minutes = Math.floor(secondsPerKm / 60);
  const secondsRemain = secondsPerKm % 60;
  return `${String(minutes).padStart(2, '0')}'${String(secondsRemain).padStart(2, '0')}"`;
}

function valueOrFallback(value, suffix = '') {
  const cleaned = String(value ?? '').trim();
  if (!cleaned) {
    return '--';
  }
  return suffix ? `${cleaned}${suffix}` : cleaned;
}

function drawMetricValue(ctx, x, y, cell, preset) {
  const { valueSize, unitSize = 42, unitGap = 8, unitOffsetY = 14 } = preset.lowerData;
  const valueText = cell.value ?? '--';

  const valueWidth = drawText(ctx, valueText, x, y, {
    size: valueSize,
    family: 'QanelasBlack',
    color: '#111111',
  });

  if (cell.unit && valueText !== '--') {
    drawText(ctx, cell.unit, x + valueWidth + unitGap, y + unitOffsetY, {
      size: unitSize,
      family: 'SourceHanSans',
      color: '#111111',
      weight: 500,
    });
  }
}

function drawMetricGrid(ctx, preset, state) {
  const { columns, rows, labelSize, overlay } = preset.lowerData;
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.98)';
  ctx.fillRect(overlay.x, overlay.y, overlay.width, overlay.height);
  ctx.restore();

  const cells = [
    { label: '训练时长', value: valueOrFallback(state.metrics.sportDuration) },
    { label: '运动消耗', value: valueOrFallback(state.metrics.calories), unit: '千卡' },
    { label: '步数', value: valueOrFallback(state.metrics.steps) },
    { label: '总时长', value: valueOrFallback(state.metrics.totalDuration) },
    { label: '运动负荷', value: valueOrFallback(state.metrics.exerciseLoad) },
    { label: '平均心率', value: valueOrFallback(state.metrics.heartRate), unit: '次/分' },
    { label: '平均步频', value: valueOrFallback(state.metrics.cadence) },
    { label: '爬升高度', value: valueOrFallback(state.metrics.climb), unit: '米' },
    { label: '平均配速', value: formatPace(state.metrics.sportDuration, state.metrics.distanceKm) },
  ];

  cells.forEach((cell, index) => {
    const columnIndex = index % 3;
    const rowIndex = Math.floor(index / 3);
    const x = columns[columnIndex];
    const row = rows[rowIndex];

    drawText(ctx, cell.label, x, row.labelY, {
      size: labelSize,
      family: 'SourceHanSans',
      color: '#9ca3af',
      weight: 500,
    });

    drawMetricValue(ctx, x, row.valueY, cell, preset);
  });
}

function drawPrivacyTag(ctx, preset, privacyBadge) {
  if (!privacyBadge) {
    return;
  }

  const rect = preset.privacy;
  const scale = Number(rect.scale) || 1;
  const width = (privacyBadge.naturalWidth || privacyBadge.width) * scale;
  const height = (privacyBadge.naturalHeight || privacyBadge.height) * scale;

  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(rect.x - 8, rect.y - 8, width + 16, height + 16);
  ctx.drawImage(privacyBadge, rect.x, rect.y, width, height);
  ctx.restore();
}

function drawAiBadge(ctx, preset, aiBadge) {
  if (!aiBadge || !preset.aiBadge) {
    return;
  }

  const rect = preset.aiBadge;
  const scale = Number(rect.scale) || 1;
  const width = (aiBadge.naturalWidth || aiBadge.width) * scale;
  const height = (aiBadge.naturalHeight || aiBadge.height) * scale;
  ctx.drawImage(aiBadge, rect.x, rect.y, width, height);
}

function drawProfileMetaLine(ctx, preset, session) {
  const textStyle = {
    size: preset.profile.meta.size,
    family: 'SourceHanSans',
    color: '#9ca3af',
    weight: 400,
  };

  const firstGroup = [
    session.date,
    [session.startTime, session.endTime].filter(Boolean).join(' - '),
    session.location,
  ].filter(Boolean);
  const tailGroup = [session.weather, session.temperature].filter(Boolean);

  let cursorX = preset.profile.meta.x;
  const baseY = preset.profile.meta.y;

  firstGroup.forEach((text, index) => {
    cursorX += drawText(ctx, text, cursorX, baseY, textStyle);
    if (index < firstGroup.length - 1) {
      cursorX += 8;
    }
  });

  tailGroup.forEach((text) => {
    if (cursorX > preset.profile.meta.x) {
      cursorX += drawText(ctx, ' · ', cursorX, baseY, textStyle);
    }
    cursorX += drawText(ctx, text, cursorX, baseY, textStyle);
  });
}

function drawSportHeader(ctx, preset, sportLabel, walkIcon) {
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(
    preset.sportLabel.cover.x,
    preset.sportLabel.cover.y,
    preset.sportLabel.cover.width,
    preset.sportLabel.cover.height,
  );
  ctx.restore();

  if (walkIcon) {
    ctx.drawImage(
      walkIcon,
      preset.sportLabel.icon.x,
      preset.sportLabel.icon.y,
      preset.sportLabel.icon.width,
      preset.sportLabel.icon.height,
    );
  }

  drawText(ctx, sportLabel || '户外行走', preset.sportLabel.text.x, preset.sportLabel.text.y, {
    size: preset.sportLabel.text.size,
    family: 'SourceHanSans',
    color: '#111111',
    weight: 700,
  });
}

function drawDistance(ctx, preset, distanceKm) {
  const text = String(distanceKm || '--');
  const valueWidth = drawText(ctx, text, preset.distance.value.x, preset.distance.value.y, {
    size: preset.distance.value.size,
    family: 'QanelasBlack',
    color: '#111111',
  });

  const unitX = preset.distance.value.x + valueWidth + preset.distance.unit.gap;
  drawText(ctx, '公里', unitX, preset.distance.unit.y, {
    size: preset.distance.unit.size,
    family: 'SourceHanSans',
    color: '#111111',
    weight: 500,
  });
}

function resolveBatteryColors(config, level) {
  if (level <= 20 && config.lowFillColor) {
    return { empty: config.emptyFillColor, fill: config.lowFillColor };
  }

  return {
    empty: config.emptyFillColor,
    fill: config.fillColor,
  };
}

function scaledRect(rect, cluster, image) {
  const scale = cluster.scale ?? 1;
  const width = (image.naturalWidth || image.width) * scale;
  const height = (image.naturalHeight || image.height) * scale;
  return {
    imageWidth: width,
    imageHeight: height,
    x: cluster.x + rect.x * scale,
    y: cluster.y + rect.y * scale,
    width: rect.width * scale,
    height: rect.height * scale,
    radius: (rect.radius ?? 0) * scale,
  };
}

function drawInsideAssetBattery(ctx, batteryConfig, clusterConfig, clusterImage, batteryLevel) {
  const fillRect = scaledRect(batteryConfig.fillRect, clusterConfig, clusterImage);
  const fillRatio = clampBatteryLevel(batteryLevel) / 100;
  const colors = resolveBatteryColors(batteryConfig, clampBatteryLevel(batteryLevel));

  fillRoundRect(ctx, fillRect, colors.empty, fillRect.radius);
  fillLevelRect(ctx, fillRect, fillRatio, colors.fill, fillRect.radius);

  if (batteryConfig.mode === 'fillAndText' && batteryConfig.textRect) {
    const textRect = scaledRect(batteryConfig.textRect, clusterConfig, clusterImage);
    drawCenteredText(ctx, String(clampBatteryLevel(batteryLevel)), textRect, {
      color: batteryConfig.textColor ?? '#111111',
      size: batteryConfig.textSize ?? 15,
      weight: batteryConfig.textWeight ?? 700,
      family: batteryConfig.textFamily ?? 'SourceHanSans',
    });
  }
}

function drawStandaloneBattery(ctx, batteryConfig, batteryLevel) {
  const level = clampBatteryLevel(batteryLevel);
  const fillRatio = level / 100;
  const colors = resolveBatteryColors(batteryConfig, level);
  const rect = batteryConfig.rect;

  if (batteryConfig.maskRect) {
    fillRoundRect(
      ctx,
      batteryConfig.maskRect,
      batteryConfig.maskColor ?? '#ffffff',
      batteryConfig.maskRect.radius ?? 0,
    );
  }

  fillRoundRect(ctx, rect, colors.empty, rect.radius ?? 0);
  fillLevelRect(ctx, batteryConfig.fillRect, fillRatio, colors.fill, batteryConfig.fillRect.radius ?? 0);

  if (batteryConfig.capRect) {
    fillRoundRect(ctx, batteryConfig.capRect, colors.empty, batteryConfig.capRect.radius ?? 0);
  }

  if (batteryConfig.mode === 'fillAndText' && batteryConfig.textRect) {
    drawCenteredText(ctx, String(level), batteryConfig.textRect, {
      color: batteryConfig.textColor ?? '#111111',
      size: batteryConfig.textSize ?? 15,
      weight: batteryConfig.textWeight ?? 700,
      family: batteryConfig.textFamily ?? 'SourceHanSans',
    });
  }
}

function drawSeparateFrameBattery(ctx, batteryConfig, batteryFrameImage, batteryLevel) {
  if (!batteryFrameImage || !batteryConfig.frame) {
    return;
  }

  const level = clampBatteryLevel(batteryLevel);
  const fillRatio = level / 100;
  const colors = resolveBatteryColors(batteryConfig, level);
  const frameRect = scaledRect(
    { x: 0, y: 0, width: batteryFrameImage.naturalWidth || batteryFrameImage.width, height: batteryFrameImage.naturalHeight || batteryFrameImage.height },
    batteryConfig.frame,
    batteryFrameImage,
  );
  const fillRect = scaledRect(batteryConfig.fillRect, batteryConfig.frame, batteryFrameImage);

  fillRoundRect(ctx, fillRect, colors.empty, fillRect.radius);
  fillLevelRect(ctx, fillRect, fillRatio, colors.fill, fillRect.radius);
  ctx.drawImage(batteryFrameImage, frameRect.x, frameRect.y, frameRect.width, frameRect.height);
}

function drawStatusBar(ctx, state, preset, assets) {
  const statusBarPreset = getStatusBarPreset(state.statusBar?.presetId);
  const cover = preset.statusBar?.cover ?? { x: 0, y: 0, width: POSTER_WIDTH, height: 68 };
  const timeText = state.session.endTime || '--:--';
  const batteryLevel = state.statusBar?.batteryLevel ?? 0;

  drawStatusBarCleanup(ctx, cover);

  drawText(ctx, timeText, statusBarPreset.time.x, statusBarPreset.time.y, {
    size: statusBarPreset.time.size,
    family: statusBarPreset.time.family,
    color: statusBarPreset.time.color,
    weight: statusBarPreset.time.weight,
  });

  if (assets.statusCluster && statusBarPreset.cluster) {
    const clusterWidth = (assets.statusCluster.naturalWidth || assets.statusCluster.width) * statusBarPreset.cluster.scale;
    const clusterHeight = (assets.statusCluster.naturalHeight || assets.statusCluster.height) * statusBarPreset.cluster.scale;

    ctx.drawImage(
      assets.statusCluster,
      statusBarPreset.cluster.x,
      statusBarPreset.cluster.y,
      clusterWidth,
      clusterHeight,
    );

    if (statusBarPreset.battery.style === 'inside-cluster') {
      drawInsideAssetBattery(ctx, statusBarPreset.battery, statusBarPreset.cluster, assets.statusCluster, batteryLevel);
    }
  }

  if (statusBarPreset.battery.style === 'standalone-pill') {
    drawStandaloneBattery(ctx, statusBarPreset.battery, batteryLevel);
  }

  if (statusBarPreset.battery.style === 'separate-frame') {
    drawSeparateFrameBattery(ctx, statusBarPreset.battery, assets.statusBatteryFrame, batteryLevel);
  }
}

function drawPoster(ctx, state, preset, assets) {
  ctx.clearRect(0, 0, preset.canvas.width, preset.canvas.height);
  ctx.drawImage(assets.template, 0, 0, preset.canvas.width, preset.canvas.height);

  const mapTransform = resolveMapTransform(preset.map, assets.mapImage, state.map);
  drawMapImage(ctx, assets.mapImage, preset.map, mapTransform);
  drawMapRouteLayer(ctx, state.map?.routeLayer, preset.map, mapTransform);
  drawMapCornerBadge(ctx, preset, assets.mapCornerBadge);
  drawCircleImage(ctx, assets.avatar, preset.profile.avatar);
  drawSportHeader(ctx, preset, state.session.sportLabel, assets.walkIcon);

  drawText(ctx, state.profile.nickname || '', preset.profile.nickname.x, preset.profile.nickname.y, {
    size: preset.profile.nickname.size,
    family: 'SourceHanSans',
    color: '#111111',
    weight: 500,
  });

  drawProfileMetaLine(ctx, preset, state.session);
  drawDistance(ctx, preset, state.metrics.distanceKm);
  drawMetricGrid(ctx, preset, state);
  drawPrivacyTag(ctx, preset, assets.privacyBadge);
  drawAiBadge(ctx, preset, assets.aiBadge);
  drawStatusBar(ctx, state, preset, assets);
}

export async function renderPosterToCanvas(canvas, state, assetLoader) {
  const preset = LAYOUT_PRESETS[state.templatePreset] ?? LAYOUT_PRESETS['keep-walk-v1'];
  const ctx = canvas.getContext('2d');
  canvas.width = preset.canvas.width;
  canvas.height = preset.canvas.height;

  const assets = await assetLoader.resolveRenderAssets(state);
  drawPoster(ctx, state, preset, assets);
}

export async function exportPosterBlob(state, assetLoader) {
  const preset = LAYOUT_PRESETS[state.templatePreset] ?? LAYOUT_PRESETS['keep-walk-v1'];
  const canvas = document.createElement('canvas');
  canvas.width = preset.canvas.width;
  canvas.height = preset.canvas.height;

  const ctx = canvas.getContext('2d');
  const assets = await assetLoader.resolveRenderAssets(state);
  drawPoster(ctx, state, preset, assets);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Canvas export failed'));
        return;
      }

      resolve(blob);
    }, 'image/png');
  });
}
