import test from 'node:test';
import assert from 'node:assert/strict';

import { createDefaultState } from '../src/state/defaultState.js';
import { getValueByPath, sanitizeState, setValueByPath } from '../src/state/serializers.js';

test('sanitizeState 只保留已知结构并修正类型', () => {
  const defaults = createDefaultState();
  const sanitized = sanitizeState(
    {
      profile: { nickname: '新的昵称', avatarAssetId: 12 },
      map: { scale: '1.7', offsetX: '15', sourceType: 'upload' },
      statusBar: { presetId: 'preset4', batteryLevel: '82' },
      unknown: 'ignored',
    },
    defaults,
  );

  assert.equal(sanitized.profile.nickname, '新的昵称');
  assert.equal(sanitized.profile.avatarAssetId, defaults.profile.avatarAssetId);
  assert.equal(sanitized.map.scale, 1.7);
  assert.equal(sanitized.map.offsetX, 15);
  assert.equal(sanitized.map.sourceType, 'upload');
  assert.equal(sanitized.statusBar.presetId, 'preset4');
  assert.equal(sanitized.statusBar.batteryLevel, 82);
  assert.equal(sanitized.unknown, undefined);
});

test('setValueByPath 返回新对象且不破坏其他字段', () => {
  const original = createDefaultState();
  const next = setValueByPath(original, 'metrics.distanceKm', '3.11');
  const nextStatusBar = setValueByPath(next, 'statusBar.batteryLevel', 75);

  assert.notEqual(original, next);
  assert.equal(getValueByPath(original, 'metrics.distanceKm'), '2.89');
  assert.equal(getValueByPath(next, 'metrics.distanceKm'), '3.11');
  assert.equal(getValueByPath(nextStatusBar, 'statusBar.batteryLevel'), 75);
  assert.equal(getValueByPath(nextStatusBar, 'session.sportLabel'), original.session.sportLabel);
});
