export const KEEP_MAP_FRAME_RATIO = 1000 / 800;

const SELECTION_MARGIN = 12;
const MIN_SELECTION_WIDTH = 220;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function getSelectionPixelSize(selection) {
  return {
    width: Math.max(1, Math.round(selection.width)),
    height: Math.max(1, Math.round(selection.height)),
  };
}

export function clampSelection(selection, viewportWidth, viewportHeight, ratio = KEEP_MAP_FRAME_RATIO) {
  const maxWidth = Math.max(MIN_SELECTION_WIDTH, viewportWidth - SELECTION_MARGIN * 2);
  const maxHeight = Math.max(MIN_SELECTION_WIDTH / ratio, viewportHeight - SELECTION_MARGIN * 2);

  let width = Number(selection.width) || MIN_SELECTION_WIDTH;
  width = clamp(width, MIN_SELECTION_WIDTH, maxWidth);

  let height = width / ratio;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * ratio;
  }

  const x = clamp(Number(selection.x) || 0, SELECTION_MARGIN, viewportWidth - width - SELECTION_MARGIN);
  const y = clamp(Number(selection.y) || 0, SELECTION_MARGIN, viewportHeight - height - SELECTION_MARGIN);

  return {
    x,
    y,
    width,
    height,
  };
}

export function createDefaultSelection(viewportWidth, viewportHeight, ratio = KEEP_MAP_FRAME_RATIO) {
  const preferredWidth = Math.min(viewportWidth * 0.56, (viewportHeight - 64) * ratio);
  const width = Math.max(MIN_SELECTION_WIDTH, preferredWidth);
  const height = width / ratio;

  return clampSelection(
    {
      x: (viewportWidth - width) / 2,
      y: (viewportHeight - height) / 2,
      width,
      height,
    },
    viewportWidth,
    viewportHeight,
    ratio,
  );
}

export function moveSelection(selection, dx, dy, viewportWidth, viewportHeight, ratio = KEEP_MAP_FRAME_RATIO) {
  return clampSelection(
    {
      ...selection,
      x: selection.x + dx,
      y: selection.y + dy,
    },
    viewportWidth,
    viewportHeight,
    ratio,
  );
}

export function resizeSelectionFromCorner(selection, dx, dy, viewportWidth, viewportHeight, ratio = KEEP_MAP_FRAME_RATIO) {
  const deltaFromX = dx;
  const deltaFromY = dy * ratio;
  const dominantDelta = Math.abs(deltaFromX) >= Math.abs(deltaFromY) ? deltaFromX : deltaFromY;

  return clampSelection(
    {
      ...selection,
      width: selection.width + dominantDelta,
    },
    viewportWidth,
    viewportHeight,
    ratio,
  );
}

