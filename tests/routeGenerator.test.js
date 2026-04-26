import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSkeletonGraph,
  computeRouteLength,
  extractWalkableMask,
  generateMaskConstrainedRoute,
} from '../src/routeLab/routeGenerator.js';

function createFilledRedMask(width, height, inset = 6) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = inset; y < height - inset; y += 1) {
    for (let x = inset; x < width - inset; x += 1) {
      const index = (y * width + x) * 4;
      data[index] = 255;
      data[index + 3] = 255;
    }
  }
  return data;
}

function createCorridorMask(width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  const paint = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const index = (y * width + x) * 4;
    data[index] = 255;
    data[index + 3] = 255;
  };

  for (let x = 12; x <= 72; x += 1) {
    for (let y = 26; y <= 34; y += 1) paint(x, y);
  }
  for (let y = 26; y <= 64; y += 1) {
    for (let x = 68; x <= 76; x += 1) paint(x, y);
  }
  return data;
}

function createLoopWithSpurMask(width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  const paint = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const index = (y * width + x) * 4;
    data[index] = 255;
    data[index + 3] = 255;
  };

  for (let x = 22; x <= 74; x += 1) {
    for (let y = 18; y <= 24; y += 1) paint(x, y);
    for (let y = 70; y <= 76; y += 1) paint(x, y);
  }
  for (let y = 18; y <= 76; y += 1) {
    for (let x = 22; x <= 28; x += 1) paint(x, y);
    for (let x = 68; x <= 74; x += 1) paint(x, y);
  }
  for (let x = 4; x <= 28; x += 1) {
    for (let y = 44; y <= 50; y += 1) paint(x, y);
  }

  return data;
}

test('相同掩码 + 相同参数 + 相同种子，会生成相同轨迹', () => {
  const width = 96;
  const height = 72;
  const imageData = createFilledRedMask(width, height);

  const first = generateMaskConstrainedRoute({
    imageData,
    width,
    height,
    targetDistanceKm: 0.18,
    seed: 'same-seed',
    metersPerPixel: 1,
  });

  const second = generateMaskConstrainedRoute({
    imageData,
    width,
    height,
    targetDistanceKm: 0.18,
    seed: 'same-seed',
    metersPerPixel: 1,
  });

  assert.deepEqual(second.points, first.points);
  assert.equal(second.totalDistancePx, first.totalDistancePx);
});

test('相同掩码 + 不同种子，会生成不同轨迹且不越出可通行区', () => {
  const width = 96;
  const height = 72;
  const imageData = createFilledRedMask(width, height);
  const walkableMask = extractWalkableMask(imageData, width, height);

  const first = generateMaskConstrainedRoute({
    imageData,
    width,
    height,
    targetDistanceKm: 0.18,
    seed: 'seed-a',
    metersPerPixel: 1,
  });

  const second = generateMaskConstrainedRoute({
    imageData,
    width,
    height,
    targetDistanceKm: 0.18,
    seed: 'seed-b',
    metersPerPixel: 1,
  });

  assert.notDeepEqual(second.points, first.points);
  for (const point of second.points) {
    const x = Math.round(point.x);
    const y = Math.round(point.y);
    assert.equal(walkableMask[y * width + x], 1);
  }
});

test('目标距离增加时，生成轨迹长度会随之增加', () => {
  const width = 96;
  const height = 72;
  const imageData = createFilledRedMask(width, height);

  const shortRoute = generateMaskConstrainedRoute({
    imageData,
    width,
    height,
    targetDistanceKm: 0.08,
    seed: 'distance-seed',
    metersPerPixel: 1,
  });

  const longRoute = generateMaskConstrainedRoute({
    imageData,
    width,
    height,
    targetDistanceKm: 0.22,
    seed: 'distance-seed',
    metersPerPixel: 1,
  });

  assert.ok(computeRouteLength(longRoute.points) > computeRouteLength(shortRoute.points));
  assert.ok(longRoute.estimatedDistanceKm > shortRoute.estimatedDistanceKm);
});

test('骨架图构建时会合并近距离端点，避免视觉接上但算法断开', () => {
  const graph = buildSkeletonGraph([
    { id: 'a', points: [{ x: 10, y: 10 }, { x: 50, y: 10 }] },
    { id: 'b', points: [{ x: 52, y: 10 }, { x: 90, y: 10 }] },
  ], 4);

  assert.ok(graph.nodes.some((node) => node.lineCount >= 2));
  assert.ok(graph.nodes.every((node) => node.degree >= 1));
});

test('骨架图会自动识别中段接入的分叉点，而不是只认端点', () => {
  const graph = buildSkeletonGraph([
    { id: 'main', points: [{ x: 10, y: 40 }, { x: 90, y: 40 }] },
    { id: 'branch', points: [{ x: 52, y: 20 }, { x: 52, y: 60 }] },
  ], 8, {
    intersectionSnapRadius: 8,
    closeLoopSnapRadius: 8,
  });

  const branchNodes = graph.nodes.filter((node) => node.degree >= 3 || node.lineCount >= 2);
  assert.ok(branchNodes.length >= 1);
  assert.ok(branchNodes.some((node) => Math.abs(node.x - 52) <= 6 && Math.abs(node.y - 40) <= 6));
});

test('骨架图会把首尾非常接近的折线识别成闭环并标记成环边', () => {
  const graph = buildSkeletonGraph([
    {
      id: 'loop',
      points: [{ x: 20, y: 20 }, { x: 80, y: 20 }, { x: 80, y: 80 }, { x: 20, y: 80 }, { x: 23, y: 22 }],
    },
  ], 6, {
    closeLoopSnapRadius: 8,
    intersectionSnapRadius: 6,
  });

  assert.ok(graph.edges.some((edge) => edge.inCycle));
  assert.ok(graph.cycleComponents.length >= 1);
});

test('道路端点会被吸附到骨架节点，并标记为道路边界节点', () => {
  const graph = buildSkeletonGraph([
    { id: 'main', points: [{ x: 12, y: 40 }, { x: 88, y: 40 }] },
  ], 6, {
    roadEndNodes: [
      { id: 'left-end', x: 14, y: 40 },
      { id: 'right-end', x: 86, y: 39 },
    ],
    intersectionSnapRadius: 6,
  });

  assert.equal(graph.snappedRoadEndNodes.length, 2);
  assert.ok(graph.nodes.some((node) => node.isRoadEnd));
  assert.ok(graph.nodes.some((node) => node.isBoundary && node.isRoadEnd));
  assert.ok(graph.lineBoundaryMap.get('main')?.size >= 2);
});

test('存在骨架时优先沿骨架行走，而不是半路随机切走', () => {
  const width = 96;
  const height = 96;
  const imageData = createCorridorMask(width, height);
  const route = generateMaskConstrainedRoute({
    imageData,
    width,
    height,
    targetDistanceKm: 0.15,
    seed: 'skeleton-priority',
    metersPerPixel: 1,
    smoothingWindow: 1,
    jitterAmplitudePx: 0,
    stepPx: 6,
    skeleton: {
      lines: [
        {
          id: 'line-1',
          points: [{ x: 16, y: 30 }, { x: 72, y: 30 }, { x: 72, y: 60 }],
        },
      ],
    },
  });

  assert.ok(['skeleton-guided', 'skeleton-plus-fallback'].includes(route.strategy));
  assert.ok(route.points.some((point) => point.x >= 69 && point.y >= 28 && point.y <= 34));
  assert.ok(route.points.some((point) => point.x >= 68 && point.x <= 76 && point.y >= 52));
});

test('遇到环路加支路时，会优先沿环继续而不是半圈提前出环', () => {
  const width = 96;
  const height = 96;
  const imageData = createLoopWithSpurMask(width, height);
  const route = generateMaskConstrainedRoute({
    imageData,
    width,
    height,
    targetDistanceKm: 0.26,
    seed: 'loop-priority',
    metersPerPixel: 1,
    smoothingWindow: 1,
    jitterAmplitudePx: 0,
    stepPx: 6,
    loopBias: 0.9,
    cycleExitPenalty: 2.2,
    minLoopCoverage: 0.7,
    maskFallbackBias: 0.05,
    skeleton: {
      lines: [
        {
          id: 'loop',
          points: [{ x: 25, y: 21 }, { x: 71, y: 21 }, { x: 71, y: 73 }, { x: 25, y: 73 }, { x: 27, y: 23 }],
        },
        {
          id: 'spur',
          points: [{ x: 25, y: 47 }, { x: 8, y: 47 }],
        },
      ],
    },
  });

  assert.ok(['skeleton-guided', 'skeleton-plus-fallback'].includes(route.strategy));
  assert.ok(route.points.some((point) => point.x >= 66 && point.y >= 18 && point.y <= 28));
  assert.ok(route.points.some((point) => point.x >= 66 && point.y >= 66 && point.y <= 76));
  assert.ok(route.points.some((point) => point.x <= 30 && point.y >= 66 && point.y <= 76));
});

test('标注道路端点后，轨迹不会在道路中段轻易切到支路', () => {
  const width = 112;
  const height = 88;
  const imageData = createCorridorMask(width, height);
  // 在主干道中段增加一条支路
  for (let y = 10; y <= 30; y += 1) {
    for (let x = 44; x <= 52; x += 1) {
      const index = (y * width + x) * 4;
      imageData[index] = 255;
      imageData[index + 3] = 255;
    }
  }

  const route = generateMaskConstrainedRoute({
    imageData,
    width,
    height,
    targetDistanceKm: 0.16,
    seed: 'road-end-priority',
    metersPerPixel: 1,
    smoothingWindow: 1,
    jitterAmplitudePx: 0,
    stepPx: 6,
    skeleton: {
      lines: [
        { id: 'main', points: [{ x: 14, y: 30 }, { x: 92, y: 30 }] },
        { id: 'spur', points: [{ x: 48, y: 30 }, { x: 48, y: 10 }] },
      ],
    },
    roadEndNodes: [
      { id: 'main-left', x: 14, y: 30 },
      { id: 'main-right', x: 92, y: 30 },
    ],
    maskFallbackBias: 0,
  });

  assert.ok(['skeleton-guided', 'skeleton-plus-fallback'].includes(route.strategy));
  assert.ok(route.points.some((point) => point.x <= 18 && point.y >= 26 && point.y <= 34));
  assert.ok(route.points.every((point) => point.y >= 24));
  const leftBoundaryIndex = route.points.findIndex((point) => point.x <= 18 && point.y >= 26 && point.y <= 34);
  assert.ok(leftBoundaryIndex >= 0);
  assert.ok(route.points.slice(leftBoundaryIndex + 1).some((point) => point.x >= 70 && point.y >= 26 && point.y <= 34));
});

test('掉头时会生成可见的转弯弧线，并逐步收敛回主路线', () => {
  const width = 128;
  const height = 88;
  const imageData = createFilledRedMask(width, height, 4);
  const route = generateMaskConstrainedRoute({
    imageData,
    width,
    height,
    targetDistanceKm: 0.22,
    seed: 'turnaround-shape',
    metersPerPixel: 1,
    smoothingWindow: 1,
    jitterAmplitudePx: 0,
    stepPx: 6,
    turnaroundAmplitudePx: 12,
    maskFallbackBias: 0,
    skeleton: {
      lines: [
        { id: 'straight', points: [{ x: 18, y: 44 }, { x: 110, y: 44 }] },
      ],
    },
    roadEndNodes: [
      { id: 'left-end', x: 18, y: 44 },
      { id: 'right-end', x: 110, y: 44 },
    ],
  });

  const maxDeviation = Math.max(...route.points.map((point) => Math.abs(point.y - 44)));
  assert.ok(maxDeviation >= 5);
  assert.ok(route.points.some((point) => point.x >= 90));
  assert.ok(route.points.some((point) => point.x <= 35));
});
