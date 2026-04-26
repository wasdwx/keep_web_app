import test from 'node:test';
import assert from 'node:assert/strict';

import {
  KEEP_MAP_FRAME_RATIO,
  clampSelection,
  createDefaultSelection,
  resizeSelectionFromCorner,
} from '../src/routeLab/selectionMath.js';

test('默认选区会保持 Keep 地图框比例并落在舞台内', () => {
  const selection = createDefaultSelection(1200, 800);
  assert.equal(Number((selection.width / selection.height).toFixed(2)), Number(KEEP_MAP_FRAME_RATIO.toFixed(2)));
  assert.ok(selection.x >= 0);
  assert.ok(selection.y >= 0);
  assert.ok(selection.x + selection.width <= 1200);
  assert.ok(selection.y + selection.height <= 800);
});

test('选区缩放和边界钳制会保持固定比例', () => {
  const base = clampSelection({ x: 40, y: 60, width: 420, height: 336 }, 900, 700);
  const resized = resizeSelectionFromCorner(base, 180, 90, 900, 700);

  assert.equal(Number((resized.width / resized.height).toFixed(2)), Number(KEEP_MAP_FRAME_RATIO.toFixed(2)));
  assert.ok(resized.x + resized.width <= 900);
  assert.ok(resized.y + resized.height <= 700);
});
