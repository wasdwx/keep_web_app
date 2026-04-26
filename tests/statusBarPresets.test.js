import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clampBatteryLevel,
  DEFAULT_STATUS_BAR_PRESET,
  STATUS_BAR_OPTIONS,
  getStatusBarPreset,
} from '../src/render/statusBarPresets.js';

test('status bar presets expose all supported presets and a safe default', () => {
  assert.equal(DEFAULT_STATUS_BAR_PRESET, 'preset1');
  assert.equal(STATUS_BAR_OPTIONS.length, 7);
  assert.equal(getStatusBarPreset('preset1').id, 'preset1');
  assert.equal(getStatusBarPreset('not-exists').id, 'preset1');
});

test('clampBatteryLevel keeps values inside 0-100', () => {
  assert.equal(clampBatteryLevel(-5), 0);
  assert.equal(clampBatteryLevel(43.2), 43);
  assert.equal(clampBatteryLevel(150), 100);
  assert.equal(clampBatteryLevel('82'), 82);
});
