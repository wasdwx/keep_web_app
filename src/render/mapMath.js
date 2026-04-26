export function computeCoverRect(frame, imageWidth, imageHeight, scale = 1, offsetX = 0, offsetY = 0) {
  const fitScale = Math.max(frame.width / imageWidth, frame.height / imageHeight);
  const finalScale = fitScale * scale;
  const width = imageWidth * finalScale;
  const height = imageHeight * finalScale;

  return {
    x: frame.x + (frame.width - width) / 2 + offsetX,
    y: frame.y + (frame.height - height) / 2 + offsetY,
    width,
    height,
  };
}

export function normalizePreviewZoom(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 1;
  }

  return Math.min(1.35, Math.max(0.65, parsed));
}

export function normalizeMapTransform(transform) {
  const readNumber = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  return {
    scale: Math.min(2.4, Math.max(1, readNumber(transform.scale, 1))),
    offsetX: Math.min(500, Math.max(-500, readNumber(transform.offsetX, 0))),
    offsetY: Math.min(500, Math.max(-500, readNumber(transform.offsetY, 0))),
  };
}

export function clampCoverTransform(frame, imageSize, transform) {
  const normalized = normalizeMapTransform(transform);
  const imageWidth = Number(imageSize?.width);
  const imageHeight = Number(imageSize?.height);
  if (!Number.isFinite(imageWidth) || !Number.isFinite(imageHeight) || imageWidth <= 0 || imageHeight <= 0) {
    return normalized;
  }

  const fitScale = Math.max(frame.width / imageWidth, frame.height / imageHeight);
  const drawWidth = imageWidth * fitScale * normalized.scale;
  const drawHeight = imageHeight * fitScale * normalized.scale;
  const maxOffsetX = Math.max(0, (drawWidth - frame.width) / 2);
  const maxOffsetY = Math.max(0, (drawHeight - frame.height) / 2);

  return {
    scale: normalized.scale,
    offsetX: Math.min(maxOffsetX, Math.max(-maxOffsetX, normalized.offsetX)),
    offsetY: Math.min(maxOffsetY, Math.max(-maxOffsetY, normalized.offsetY)),
  };
}

export function clampRouteLayerTransform(frame, imageSize, routeLayer, transform, options = {}) {
  const imageWidth = Number(imageSize?.width ?? routeLayer?.width);
  const imageHeight = Number(imageSize?.height ?? routeLayer?.height);
  const bounds = routeLayer?.bbox ?? computePointBounds(routeLayer?.points ?? []);
  const coverTransform = clampCoverTransform(frame, { width: imageWidth, height: imageHeight }, transform);

  if (!bounds || !Number.isFinite(imageWidth) || !Number.isFinite(imageHeight) || imageWidth <= 0 || imageHeight <= 0) {
    return coverTransform;
  }

  const safety = Math.max(0, Number(options.safetyPx ?? Math.min(frame.width, frame.height) * 0.045));
  const fitScale = Math.max(frame.width / imageWidth, frame.height / imageHeight);
  const finalScale = fitScale * coverTransform.scale;
  const drawWidth = imageWidth * finalScale;
  const drawHeight = imageHeight * finalScale;
  const baseX = frame.x + (frame.width - drawWidth) / 2;
  const baseY = frame.y + (frame.height - drawHeight) / 2;
  const coverMinX = -Math.max(0, (drawWidth - frame.width) / 2);
  const coverMaxX = Math.max(0, (drawWidth - frame.width) / 2);
  const coverMinY = -Math.max(0, (drawHeight - frame.height) / 2);
  const coverMaxY = Math.max(0, (drawHeight - frame.height) / 2);
  const routeMinX = frame.x + safety - baseX - bounds.minX * finalScale;
  const routeMaxX = frame.x + frame.width - safety - baseX - bounds.maxX * finalScale;
  const routeMinY = frame.y + safety - baseY - bounds.minY * finalScale;
  const routeMaxY = frame.y + frame.height - safety - baseY - bounds.maxY * finalScale;
  const minX = Math.max(coverMinX, routeMinX);
  const maxX = Math.min(coverMaxX, routeMaxX);
  const minY = Math.max(coverMinY, routeMinY);
  const maxY = Math.min(coverMaxY, routeMaxY);

  return {
    scale: coverTransform.scale,
    offsetX: minX <= maxX
      ? Math.min(maxX, Math.max(minX, coverTransform.offsetX))
      : Math.min(coverMaxX, Math.max(coverMinX, (routeMinX + routeMaxX) / 2)),
    offsetY: minY <= maxY
      ? Math.min(maxY, Math.max(minY, coverTransform.offsetY))
      : Math.min(coverMaxY, Math.max(coverMinY, (routeMinY + routeMaxY) / 2)),
  };
}

export function computePointBounds(points = []) {
  const validPoints = points.filter((point) => (
    Number.isFinite(Number(point?.x)) && Number.isFinite(Number(point?.y))
  ));

  if (!validPoints.length) {
    return null;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  validPoints.forEach((point) => {
    const x = Number(point.x);
    const y = Number(point.y);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  });

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
    minX,
    minY,
    maxX,
    maxY,
  };
}

export function createRouteLayerRerollTransform(frame, imageSize, routeLayer, rng = Math.random) {
  const imageWidth = Number(imageSize?.width ?? routeLayer?.width);
  const imageHeight = Number(imageSize?.height ?? routeLayer?.height);
  const bounds = routeLayer?.bbox ?? computePointBounds(routeLayer?.points ?? []);

  if (!Number.isFinite(imageWidth) || !Number.isFinite(imageHeight) || imageWidth <= 0 || imageHeight <= 0 || !bounds) {
    return normalizeMapTransform({
      scale: 1 + rng() * 0.08,
      offsetX: (rng() - 0.5) * 60,
      offsetY: (rng() - 0.5) * 50,
    });
  }

  const routeCenterX = bounds.x + bounds.width / 2;
  const routeCenterY = bounds.y + bounds.height / 2;
  const routeWidthRatio = bounds.width / Math.max(1, imageWidth);
  const routeHeightRatio = bounds.height / Math.max(1, imageHeight);
  const routeCoverage = Math.max(routeWidthRatio, routeHeightRatio);
  const baseRandom = 1.04 + rng() * 0.12;
  const roomyScale = routeCoverage > 0.78 ? 1.0 + rng() * 0.05 : baseRandom;
  const scale = Math.min(1.22, Math.max(0.96, roomyScale));
  const fitScale = Math.max(frame.width / imageWidth, frame.height / imageHeight);
  const finalScale = fitScale * scale;
  const drawWidth = imageWidth * finalScale;
  const drawHeight = imageHeight * finalScale;
  const frameCenterX = frame.x + frame.width / 2;
  const frameCenterY = frame.y + frame.height / 2;
  const jitterX = (rng() - 0.5) * Math.min(48, frame.width * 0.045);
  const jitterY = (rng() - 0.5) * Math.min(40, frame.height * 0.045);
  let offsetX = frameCenterX + jitterX - (frame.x + (frame.width - drawWidth) / 2 + routeCenterX * finalScale);
  let offsetY = frameCenterY + jitterY - (frame.y + (frame.height - drawHeight) / 2 + routeCenterY * finalScale);

  const safety = Math.min(frame.width, frame.height) * 0.07;
  const transformedMinX = frame.x + (frame.width - drawWidth) / 2 + offsetX + bounds.minX * finalScale;
  const transformedMaxX = frame.x + (frame.width - drawWidth) / 2 + offsetX + bounds.maxX * finalScale;
  const transformedMinY = frame.y + (frame.height - drawHeight) / 2 + offsetY + bounds.minY * finalScale;
  const transformedMaxY = frame.y + (frame.height - drawHeight) / 2 + offsetY + bounds.maxY * finalScale;

  if (transformedMinX < frame.x + safety) {
    offsetX += frame.x + safety - transformedMinX;
  }
  if (transformedMaxX > frame.x + frame.width - safety) {
    offsetX -= transformedMaxX - (frame.x + frame.width - safety);
  }
  if (transformedMinY < frame.y + safety) {
    offsetY += frame.y + safety - transformedMinY;
  }
  if (transformedMaxY > frame.y + frame.height - safety) {
    offsetY -= transformedMaxY - (frame.y + frame.height - safety);
  }

  return clampRouteLayerTransform(frame, { width: imageWidth, height: imageHeight }, routeLayer, { scale, offsetX, offsetY });
}
