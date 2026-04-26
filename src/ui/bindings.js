import { getValueByPath } from '../state/serializers.js';

function parseInputValue(input) {
  const explicitType = input.dataset.type;

  if (explicitType === 'number') {
    const parsed = Number(input.value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  if (explicitType === 'boolean' || input.type === 'checkbox') {
    return Boolean(input.checked);
  }

  return input.value;
}

export function bindControls(root, handlers) {
  root.querySelectorAll('[data-path]').forEach((input) => {
    const eventName = input.type === 'checkbox' ? 'change' : 'input';

    input.addEventListener(eventName, () => {
      handlers.onPathChange(input.dataset.path, parseInputValue(input));
    });
  });

  root.querySelectorAll('[data-bg-id]').forEach((button) => {
    button.addEventListener('click', () => {
      handlers.onBuiltinBackgroundSelect(button.dataset.bgId);
    });
  });

  root.querySelector('#avatar-upload')?.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    handlers.onAvatarUpload(file ?? null);
    event.target.value = '';
  });

  root.querySelector('#avatar-admin-hotspot')?.addEventListener('click', (event) => {
    if (event.target?.matches?.('input, button, label, small')) {
      return;
    }
    handlers.onAdminHotspotClick?.();
  });

  root.querySelector('#map-upload')?.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    handlers.onMapUpload(file ?? null);
    event.target.value = '';
  });

  root.querySelector('#reset-map-view')?.addEventListener('click', handlers.onResetMapView);
  root.querySelector('#open-route-lab')?.addEventListener('click', handlers.onOpenRouteLab);
  root.querySelector('#import-route-project')?.addEventListener('click', () => root.querySelector('#route-project-input')?.click());
  root.querySelector('#route-project-input')?.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    handlers.onRouteProjectImport(file ?? null);
    event.target.value = '';
  });
  root.querySelector('#clear-route-layer')?.addEventListener('click', handlers.onClearRouteLayer);
  root.querySelector('#reroll-route-map')?.addEventListener('click', handlers.onRerollRouteMap);
  root.querySelector('#reroll-route-path')?.addEventListener('click', handlers.onRerollRoutePath);
  root.querySelector('#restore-site-default-route')?.addEventListener('click', handlers.onRestoreSiteDefaultRoute);
  root.querySelector('#auto-weather')?.addEventListener('click', handlers.onAutoWeather);
  root.querySelector('#reroll-all')?.addEventListener('click', handlers.onRerollAll);
  root.querySelector('#clear-manual-locks')?.addEventListener('click', handlers.onClearManualLocks);
  root.querySelector('#admin-login')?.addEventListener('click', () => {
    handlers.onAdminLogin?.(root.querySelector('#admin-password')?.value ?? '');
  });
  root.querySelector('#admin-route-project-input')?.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    handlers.onAdminRouteProjectSelect?.(file ?? null);
    event.target.value = '';
  });
  root.querySelector('#admin-save-default')?.addEventListener('click', handlers.onAdminSaveDefault);
  root.querySelector('#admin-clear-default')?.addEventListener('click', handlers.onAdminClearDefault);
  root.querySelector('#admin-check-default')?.addEventListener('click', handlers.onAdminCheckDefault);
  root.querySelector('#export-png')?.addEventListener('click', handlers.onExport);
  root.querySelector('#reset-form')?.addEventListener('click', handlers.onResetForm);
  root.querySelector('#restore-defaults')?.addEventListener('click', handlers.onRestoreDefaults);
}

export function syncFormControls(root, state) {
  root.querySelectorAll('[data-path]').forEach((input) => {
    const value = getValueByPath(state, input.dataset.path);

    if (input.type === 'checkbox') {
      input.checked = Boolean(value);
      return;
    }

    input.value = value ?? '';
  });
}

export function syncUiState(root, state, backgrounds, assetLabels) {
  root.querySelectorAll('[data-bg-id]').forEach((button) => {
    button.classList.toggle(
      'is-active',
      state.map.sourceType === 'builtin' && state.map.sourceId === button.dataset.bgId,
    );
  });

  const mapSourceChip = root.querySelector('#map-source-chip');
  if (mapSourceChip) {
    const routeSuffix = state.map.routeLayer?.enabled ? ' + \u8f68\u8ff9' : '';
    const sourceLabel = state.map.assetId ? '\u4e0a\u4f20\u5e95\u56fe' : '\u7b49\u5f85\u8f68\u8ff9 JSON';
    mapSourceChip.textContent = `${sourceLabel}${routeSuffix}`;
  }

  const avatarStatus = root.querySelector('#avatar-file-status');
  if (avatarStatus) {
    avatarStatus.textContent = `\u5f53\u524d\uff1a${assetLabels.avatarName}`;
  }

  const mapStatus = root.querySelector('#map-file-status');
  if (mapStatus) {
    mapStatus.textContent = `\u5f53\u524d\uff1a${assetLabels.mapName}${state.map.routeLayer?.enabled ? '\uff08\u5df2\u63a5\u5165\u8f68\u8ff9\uff09' : ''}`;
  }

  const locksStatus = root.querySelector('#locks-status');
  if (locksStatus) {
    const count = Array.isArray(state.locks?.manualPaths) ? state.locks.manualPaths.length : 0;
    locksStatus.textContent = `\u624b\u586b\u4fdd\u62a4\uff1a${count} \u9879`;
  }

  const hasRouteLayer = Boolean(state.map.routeLayer?.enabled);
  const clearRouteButton = root.querySelector('#clear-route-layer');
  if (clearRouteButton) {
    clearRouteButton.disabled = !hasRouteLayer;
  }

  const rerollButton = root.querySelector('#reroll-route-map');
  if (rerollButton) {
    rerollButton.disabled = !hasRouteLayer;
  }

  const rerollPathButton = root.querySelector('#reroll-route-path');
  if (rerollPathButton) {
    rerollPathButton.disabled = !hasRouteLayer || !state.map.routeProjectAssetId;
  }

  const mapScaleDisplay = root.querySelector('#map-scale-display');
  if (mapScaleDisplay) {
    mapScaleDisplay.textContent = `${Number(state.map.scale).toFixed(2)}x`;
  }

  const offsetXDisplay = root.querySelector('#map-offset-x-display');
  if (offsetXDisplay) {
    offsetXDisplay.textContent = `${Math.round(Number(state.map.offsetX))} px`;
  }

  const offsetYDisplay = root.querySelector('#map-offset-y-display');
  if (offsetYDisplay) {
    offsetYDisplay.textContent = `${Math.round(Number(state.map.offsetY))} px`;
  }

  const previewZoomDisplay = root.querySelector('#preview-zoom-display');
  if (previewZoomDisplay) {
    previewZoomDisplay.textContent = `${Math.round(Number(state.ui.previewZoom) * 100)}%`;
  }

  root.querySelectorAll('[data-bg-id]').forEach((button) => {
    const label = backgrounds.find((item) => item.id === button.dataset.bgId)?.label ?? '';
    button.title = label;
  });
}
