import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createDefaultRouteConfig,
  deserializeLabProject,
  serializeLabProject,
} from '../src/routeLab/projectCodec.js';

test('项目 JSON 导出与恢复会保留地图、选区、掩码、骨架和轨迹配置', () => {
  const sourceState = {
    placeLabel: '示例公园',
    placeKeyword: '示例地点',
    center: { lat: 39.9, lng: 116.4 },
    zoom: 16.9,
    pitch: 0,
    rotation: 0,
    stylePresetId: 'keep-like-default',
    backgroundMode: 'image',
    imageBackground: {
      dataUrl: 'data:image/png;base64,bg',
      name: '测试底图',
      width: 640,
      height: 512,
    },
    imageView: { scale: 1.35, offsetX: 22, offsetY: -18 },
    selection: { x: 24, y: 36, width: 500, height: 400 },
    maskSize: { width: 500, height: 400 },
    skeleton: {
      lines: [
        {
          id: 'line-1',
          points: [{ x: 20, y: 30 }, { x: 80, y: 90 }, { x: 120, y: 110 }],
        },
      ],
    },
    roadEndNodes: [
      { id: 'road-end-1', x: 20, y: 30 },
      { id: 'road-end-2', x: 120, y: 110 },
    ],
    routeConfig: {
      ...createDefaultRouteConfig(),
      seed: 'codec-seed',
      metersPerPixel: 0.72,
      targetDistanceKm: 3.2,
      skeletonFollowBias: 0.95,
      closeLoopSnapRadiusPx: 18,
      cycleExitPenalty: 1.8,
      minLoopCoverage: 0.84,
      turnaroundAmplitudePx: 13,
    },
    scaleCalibration: {
      points: [{ x: 10, y: 20 }, { x: 110, y: 20 }],
      distanceMeters: 72,
    },
    routePreview: {
      points: [{ x: 12, y: 18 }, { x: 60, y: 42 }],
      totalDistancePx: 52.4,
      estimatedDistanceKm: 2.7,
      metersPerPixel: 3.1,
      strategy: 'skeleton-guided',
    },
  };

  const serialized = serializeLabProject(sourceState, {
    maskDataUrl: 'data:image/png;base64,mask',
    posterOutput: {
      mapImageDataUrl: 'data:image/png;base64,poster',
      mapImageWidth: 660,
      mapImageHeight: 536,
      capturePaddingPx: 80,
      routeLayer: {
        enabled: true,
        width: 660,
        height: 536,
        points: [{ x: 92, y: 98 }, { x: 140, y: 122 }],
        style: { color: '#26c99a', width: 12, shadowColor: 'rgba(0,0,0,0.2)', shadowWidth: 20 },
        bbox: { x: 92, y: 98, width: 48, height: 24, minX: 92, minY: 98, maxX: 140, maxY: 122 },
        sourceProjectVersion: 3,
      },
    },
  });

  const restored = deserializeLabProject(serialized, 1200, 900);

  assert.equal(serialized.version, 3);
  assert.equal(restored.background.sourceType, 'image');
  assert.equal(restored.background.name, '测试底图');
  assert.deepEqual(restored.background.view, sourceState.imageView);
  assert.equal(restored.posterOutput.routeLayer.points.length, 2);
  assert.equal(restored.posterOutput.routeLayer.width, 660);
  assert.equal(restored.map.placeLabel, sourceState.placeLabel);
  assert.equal(restored.map.stylePresetId, sourceState.stylePresetId);
  assert.equal(restored.selection.width, sourceState.selection.width);
  assert.equal(restored.selection.height, sourceState.selection.height);
  assert.equal(restored.mask.dataUrl, 'data:image/png;base64,mask');
  assert.equal(restored.routeConfig.seed, 'codec-seed');
  assert.equal(restored.routeConfig.metersPerPixel, 0.72);
  assert.equal(restored.routeConfig.skeletonFollowBias, 0.95);
  assert.equal(restored.routeConfig.closeLoopSnapRadiusPx, 18);
  assert.equal(restored.routeConfig.cycleExitPenalty, 1.8);
  assert.equal(restored.routeConfig.minLoopCoverage, 0.84);
  assert.equal(restored.routeConfig.turnaroundAmplitudePx, 13);
  assert.equal(restored.routePreview.points.length, 2);
  assert.equal(restored.routePreview.strategy, 'skeleton-guided');
  assert.equal(restored.skeleton.lines.length, 1);
  assert.equal(restored.skeleton.lines[0].points.length, 3);
  assert.equal(restored.roadEndNodes.length, 2);
  assert.equal(restored.scaleCalibration.points.length, 2);
  assert.equal(restored.scaleCalibration.distanceMeters, 72);
});

test('项目 JSON 恢复时会对新增骨架参数做钳制', () => {
  const restored = deserializeLabProject({
    map: {},
    selection: { x: 0, y: 0, width: 300, height: 240 },
    mask: { width: 300, height: 240 },
    routeConfig: {
      skeletonSnapRadiusPx: 999,
      metersPerPixel: -4,
      closeLoopSnapRadiusPx: 999,
      intersectionSnapRadiusPx: -5,
      skeletonFollowBias: -1,
      branchSwitchPenalty: 99,
      deadEndPenalty: -5,
      maskFallbackBias: 9,
      cycleExitPenalty: 99,
      minLoopCoverage: -5,
      turnaroundAmplitudePx: 999,
    },
    skeleton: {
      lines: [{ id: 'bad', points: [{ x: 1, y: 2 }] }],
    },
    roadEndNodes: [{ id: '', x: 12, y: 18 }, { x: 'bad', y: 1 }],
  }, 1000, 800);

  assert.equal(restored.routeConfig.skeletonSnapRadiusPx, 36);
  assert.equal(restored.routeConfig.metersPerPixel, 0.001);
  assert.equal(restored.routeConfig.closeLoopSnapRadiusPx, 48);
  assert.equal(restored.routeConfig.intersectionSnapRadiusPx, 4);
  assert.equal(restored.routeConfig.skeletonFollowBias, 0);
  assert.equal(restored.routeConfig.branchSwitchPenalty, 3);
  assert.equal(restored.routeConfig.deadEndPenalty, 0);
  assert.equal(restored.routeConfig.maskFallbackBias, 1);
  assert.equal(restored.routeConfig.cycleExitPenalty, 4);
  assert.equal(restored.routeConfig.minLoopCoverage, 0);
  assert.equal(restored.routeConfig.turnaroundAmplitudePx, 30);
  assert.equal(restored.skeleton.lines.length, 0);
  assert.equal(restored.roadEndNodes.length, 1);
});

test('旧版 v2 项目 JSON 恢复时会退回图片底图模式', () => {
  const restored = deserializeLabProject({
    version: 2,
    map: {
      placeLabel: '旧项目地点',
      placeKeyword: '旧项目',
      center: { lat: 38.9, lng: 115.5 },
      zoom: 16.3,
      stylePresetId: 'custom-style',
    },
    selection: { x: 0, y: 0, width: 300, height: 240 },
    mask: { width: 300, height: 240 },
    routeConfig: {},
  }, 1000, 800);

  assert.equal(restored.version, 2);
  assert.equal(restored.background.sourceType, 'image');
  assert.equal(restored.background.dataUrl, null);
  assert.deepEqual(restored.background.view, { scale: 1, offsetX: 0, offsetY: 0 });
  assert.equal(restored.routeConfig.metersPerPixel, 1);
  assert.equal(restored.routeConfig.turnaroundAmplitudePx, 12);
  assert.equal(restored.routePreview, null);
});
