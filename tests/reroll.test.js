import test from 'node:test';
import assert from 'node:assert/strict';

import { createDefaultState } from '../src/state/defaultState.js';
import { addManualLock, clearManualLocks, rerollPosterState } from '../src/state/reroll.js';

function fixedRng(values) {
  let index = 0;
  return () => {
    const value = values[index % values.length];
    index += 1;
    return value;
  };
}

test('一键重 roll 不覆盖手填锁定字段', () => {
  let state = createDefaultState();
  state.metrics.distanceKm = '9.99';
  state.session.weather = '多云';
  state = addManualLock(state, 'metrics.distanceKm');
  state = addManualLock(state, 'session.weather');

  const result = rerollPosterState(state, { rng: fixedRng([0.5, 0.2, 0.7, 0.3]) });

  assert.equal(result.state.metrics.distanceKm, '9.99');
  assert.equal(result.state.session.weather, '多云');
  assert.notEqual(result.state.metrics.steps, state.metrics.steps);
  assert.ok(result.targetDistanceKm > 0);
});

test('清除手填保护后字段可被重 roll 覆盖', () => {
  let state = createDefaultState();
  state.metrics.distanceKm = '9.99';
  state = addManualLock(state, 'metrics.distanceKm');
  state = clearManualLocks(state);

  const result = rerollPosterState(state, { rng: fixedRng([0.5, 0.2, 0.7, 0.3]) });

  assert.notEqual(result.state.metrics.distanceKm, '9.99');
  assert.equal(result.state.locks.manualPaths.length, 0);
});

test('一键重 roll 默认生成散步距离 2.3-4.0 公里', () => {
  const state = createDefaultState();

  const minResult = rerollPosterState(state, { rng: () => 0 });
  const maxResult = rerollPosterState(state, { rng: () => 1 });

  assert.equal(minResult.state.metrics.distanceKm, '2.30');
  assert.equal(maxResult.state.metrics.distanceKm, '4.00');
  assert.equal(minResult.targetDistanceKm, 2.3);
  assert.equal(maxResult.targetDistanceKm, 4);
});

test('永久排除字段不会被加入手填保护', () => {
  let state = createDefaultState();
  state = addManualLock(state, 'profile.nickname');
  state = addManualLock(state, 'session.location');

  assert.deepEqual(state.locks.manualPaths, []);
});
