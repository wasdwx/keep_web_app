import test from 'node:test';
import assert from 'node:assert/strict';

import {
  computeCoverRect,
  createRouteLayerRerollTransform,
  normalizeMapTransform,
  normalizePreviewZoom,
} from '../src/render/mapMath.js';

test('computeCoverRect 使用 cover 规则填满目标区域', () => {
  const frame = { x: 40, y: 720, width: 1000, height: 800 };
  const rect = computeCoverRect(frame, 900, 1600, 1, 0, 0);

  assert.equal(rect.width, 1000);
  assert.equal(rect.height, 1777.7777777777778);
  assert.equal(rect.x, 40);
  assert.equal(Math.round(rect.y), 231);
});

test('normalizePreviewZoom 和 normalizeMapTransform 会做边界钳制', () => {
  assert.equal(normalizePreviewZoom(5), 1.35);
  assert.equal(normalizePreviewZoom(-1), 0.65);

  const transform = normalizeMapTransform({ scale: 10, offsetX: -999, offsetY: 'abc' });
  assert.deepEqual(transform, {
    scale: 2.4,
    offsetX: -500,
    offsetY: 0,
  });
});

test('createRouteLayerRerollTransform 会让轨迹 bbox 尽量靠近地图框中心', () => {
  const frame = { x: 40, y: 720, width: 1000, height: 800 };
  const routeLayer = {
    width: 1160,
    height: 960,
    points: [{ x: 420, y: 380 }, { x: 740, y: 580 }],
    bbox: { x: 420, y: 380, width: 320, height: 200, minX: 420, minY: 380, maxX: 740, maxY: 580 },
  };
  const values = [0.5, 0.5, 0.5];
  const transform = createRouteLayerRerollTransform(frame, { width: 1160, height: 960 }, routeLayer, () => values.shift() ?? 0.5);
  const rect = computeCoverRect(frame, 1160, 960, transform.scale, transform.offsetX, transform.offsetY);
  const scaleX = rect.width / 1160;
  const scaleY = rect.height / 960;
  const centerX = rect.x + (routeLayer.bbox.x + routeLayer.bbox.width / 2) * scaleX;
  const centerY = rect.y + (routeLayer.bbox.y + routeLayer.bbox.height / 2) * scaleY;

  assert.ok(Math.abs(centerX - (frame.x + frame.width / 2)) < 80);
  assert.ok(Math.abs(centerY - (frame.y + frame.height / 2)) < 80);
});
