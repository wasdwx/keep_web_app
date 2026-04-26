import './styles.css';
import {
  BUILTIN_BACKGROUNDS,
  createAssetLoader,
  ensurePosterFonts,
} from './render/assets.js';
import { LAYOUT_PRESETS } from './render/layoutPreset.js';
import { computePointBounds, createRouteLayerRerollTransform } from './render/mapMath.js';
import { normalizeRouteStyle } from './render/routeStyle.js';
import { STATUS_BAR_OPTIONS } from './render/statusBarPresets.js';
import { generateMaskConstrainedRoute } from './routeLab/routeGenerator.js';
import {
  exportPosterBlob,
  renderPosterToCanvas,
  POSTER_HEIGHT,
  POSTER_WIDTH,
} from './render/posterRenderer.js';
import {
  createDefaultState,
  createFormResetState,
  createHardResetState,
} from './state/defaultState.js';
import {
  addManualLock,
  clearManualLocks,
  rerollPosterState,
} from './state/reroll.js';
import {
  getAssetBlob,
  getAssetRecord,
  hasSavedState,
  loadState,
  saveAssetBlob,
  saveState,
} from './state/persistence.js';
import { getValueByPath, setValueByPath } from './state/serializers.js';
import { createStore } from './state/store.js';
import {
  bindControls,
  syncFormControls,
  syncUiState,
} from './ui/bindings.js';
import { renderAppShell } from './ui/template.js';

const appRoot = document.querySelector('#app');
appRoot.innerHTML = renderAppShell(BUILTIN_BACKGROUNDS, STATUS_BAR_OPTIONS);

const canvas = document.querySelector('#poster-canvas');
const renderStatus = document.querySelector('#render-status');
const previewCanvasShell = document.querySelector('#preview-canvas-shell');

const assetLoader = createAssetLoader();
const defaultState = createDefaultState();
const hadSavedStateOnBoot = hasSavedState();
const initialState = loadState(defaultState);
const store = createStore(initialState);

const assetLabels = {
  avatarName: '默认头像',
  mapName: findBackgroundLabel(initialState.map.sourceId),
};

let renderVersion = 0;
let lastAppliedFormSnapshot = '';
let routeLabWindow = null;
let adminClickCount = 0;
let adminClickTimer = null;
let pendingAdminRouteProject = null;

function findBackgroundLabel(id) {
  return BUILTIN_BACKGROUNDS.find((item) => item.id === id)?.label ?? '等待导入轨迹 JSON 或上传底图';
}

function setRenderStatus(text, tone = 'neutral') {
  if (!renderStatus) {
    return;
  }

  renderStatus.textContent = text;
  renderStatus.dataset.tone = tone;
}

function setAdminStatus(text, tone = 'neutral') {
  const status = appRoot.querySelector('#admin-status');
  if (!status) {
    return;
  }

  status.textContent = text;
  status.dataset.tone = tone;
}

function revealAdminPanel() {
  const panel = appRoot.querySelector('#admin-panel');
  if (!panel) {
    return;
  }

  panel.classList.remove('is-hidden');
  setAdminStatus('管理员模式已打开。先登录，再上传 v3 轨迹 JSON。', 'success');
}

function handleAdminHotspotClick() {
  adminClickCount += 1;
  clearTimeout(adminClickTimer);

  adminClickTimer = window.setTimeout(() => {
    adminClickCount = 0;
  }, 1800);

  if (adminClickCount >= 7) {
    adminClickCount = 0;
    clearTimeout(adminClickTimer);
    revealAdminPanel();
  }
}

function makeRenderableStateSnapshot(state) {
  return JSON.stringify({
    profile: state.profile,
    session: state.session,
    metrics: state.metrics,
    map: state.map,
    statusBar: state.statusBar,
    ui: state.ui,
    templatePreset: state.templatePreset,
  });
}

function applyPreviewZoom(zoom) {
  const safeZoom = Number.isFinite(zoom) ? zoom : 1;
  previewCanvasShell.style.setProperty('--preview-scale', String(safeZoom));
}

function syncFormIfNeeded(state) {
  const snapshot = makeRenderableStateSnapshot(state);

  if (snapshot === lastAppliedFormSnapshot) {
    return;
  }

  syncFormControls(appRoot, state);
  lastAppliedFormSnapshot = snapshot;
}

async function refreshAssetLabels(state) {
  if (state.profile.avatarAssetId) {
    const avatarRecord = await getAssetRecord(state.profile.avatarAssetId);
    assetLabels.avatarName = avatarRecord?.name ?? '已上传头像';
  } else {
    assetLabels.avatarName = '默认头像';
  }

  if (state.map.sourceType === 'upload' && state.map.assetId) {
    const mapRecord = await getAssetRecord(state.map.assetId);
    assetLabels.mapName = mapRecord?.name ?? '已上传底图';
  } else {
    assetLabels.mapName = '等待导入轨迹 JSON 或上传底图';
  }

  syncUiState(appRoot, state, BUILTIN_BACKGROUNDS, assetLabels);
}

async function renderCurrentState(state) {
  const currentVersion = ++renderVersion;
  setRenderStatus('正在渲染预览…', 'neutral');

  try {
    await renderPosterToCanvas(canvas, state, assetLoader);

    if (currentVersion !== renderVersion) {
      return;
    }

    applyPreviewZoom(state.ui.previewZoom);
    setRenderStatus(`已同步 · ${POSTER_WIDTH} × ${POSTER_HEIGHT}`, 'success');
  } catch (error) {
    console.error(error);
    if (currentVersion !== renderVersion) {
      return;
    }
    setRenderStatus('渲染失败，请查看控制台', 'error');
  }
}

function updateStateAtPath(path, value) {
  store.setState((state) => addManualLock(setValueByPath(state, path, value), path), { source: 'input' });
}

function replaceState(nextState, source = 'programmatic') {
  store.setState(() => nextState, { source });
  syncFormIfNeeded(nextState);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(dataUrl) {
  const response = await fetch(dataUrl);
  return response.blob();
}

function createRandomRouteSeed() {
  if (crypto?.randomUUID) {
    return `poster-reroll-${crypto.randomUUID()}`;
  }
  return `poster-reroll-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

async function dataUrlToImageData(dataUrl, width, height) {
  const image = await loadImageElement(dataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(Number(width) || image.naturalWidth || image.width));
  canvas.height = Math.max(1, Math.round(Number(height) || image.naturalHeight || image.height));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function createRouteLayerFromRouteResult(route, payload, currentRouteLayer = null) {
  const padding = Math.max(0, Number(payload?.posterOutput?.capturePaddingPx) || 0);
  const width = Math.max(
    1,
    Math.round(Number(currentRouteLayer?.width) || Number(payload?.posterOutput?.mapImageWidth) || Number(payload?.mask?.width) + padding * 2 || 1),
  );
  const height = Math.max(
    1,
    Math.round(Number(currentRouteLayer?.height) || Number(payload?.posterOutput?.mapImageHeight) || Number(payload?.mask?.height) + padding * 2 || 1),
  );
  const points = route.points.map((point) => ({
    x: Number((Number(point.x) + padding).toFixed(2)),
    y: Number((Number(point.y) + padding).toFixed(2)),
  }));

  return {
    enabled: true,
    points,
    width,
    height,
    style: normalizeRouteStyle(currentRouteLayer?.style ?? payload?.posterOutput?.routeLayer?.style),
    bbox: computePointBounds(points),
    sourceProjectVersion: Number(payload?.version) || 3,
  };
}

function createRouteLayerFromProjectPayload(payload) {
  const posterOutput = payload?.posterOutput;
  if (posterOutput?.routeLayer?.points?.length >= 2) {
    return {
      ...posterOutput.routeLayer,
      enabled: posterOutput.routeLayer.enabled !== false,
      style: normalizeRouteStyle(posterOutput.routeLayer.style),
      bbox: posterOutput.routeLayer.bbox ?? computePointBounds(posterOutput.routeLayer.points),
    };
  }

  const routePoints = payload?.routePreview?.points;
  if (!Array.isArray(routePoints) || routePoints.length < 2) {
    return null;
  }

  const padding = Math.max(0, Number(posterOutput?.capturePaddingPx) || 0);
  const points = routePoints.map((point) => ({
    x: Number((Number(point.x) + padding).toFixed(2)),
    y: Number((Number(point.y) + padding).toFixed(2)),
  }));
  const width = Math.max(
    1,
    Math.round(Number(posterOutput?.mapImageWidth) || Number(payload?.mask?.width) + padding * 2 || 1),
  );
  const height = Math.max(
    1,
    Math.round(Number(posterOutput?.mapImageHeight) || Number(payload?.mask?.height) + padding * 2 || 1),
  );

  return {
    enabled: true,
    points,
    width,
    height,
    style: normalizeRouteStyle(),
    bbox: computePointBounds(points),
    sourceProjectVersion: Number(payload?.version) || 3,
  };
}

async function resolveCurrentMapDataUrl(state) {
  if (state.map.sourceType === 'upload' && state.map.assetId) {
    const blob = await getAssetBlob(state.map.assetId);
    if (blob) {
      return {
        dataUrl: await blobToDataUrl(blob),
        name: assetLabels.mapName || '当前上传底图',
      };
    }
  }

  return null;
}

function rerollRouteMapView(state) {
  if (!state.map.routeLayer?.enabled) {
    return state;
  }

  const preset = LAYOUT_PRESETS[state.templatePreset] ?? LAYOUT_PRESETS['keep-walk-v1'];
  const nextTransform = createRouteLayerRerollTransform(
    preset.map,
    {
      width: state.map.routeLayer.width,
      height: state.map.routeLayer.height,
    },
    state.map.routeLayer,
  );

  state.map.scale = nextTransform.scale;
  state.map.offsetX = nextTransform.offsetX;
  state.map.offsetY = nextTransform.offsetY;
  return state;
}

async function buildRouteLabInitPayload() {
  const state = store.getState();
  const mapImage = await resolveCurrentMapDataUrl(state);
  let routeProject = null;
  if (state.map.routeProjectAssetId) {
    const projectBlob = await getAssetBlob(state.map.routeProjectAssetId);
    if (projectBlob) {
      routeProject = JSON.parse(await projectBlob.text());
    }
  }
  return {
    type: 'keep-route-lab:init',
    payload: {
      background: mapImage
        ? {
            sourceType: 'image',
            dataUrl: mapImage.dataUrl,
            name: mapImage.name,
          }
        : null,
      routeProject,
      routeLayer: state.map.routeLayer,
      mapTransform: {
        scale: state.map.scale,
        offsetX: state.map.offsetX,
        offsetY: state.map.offsetY,
      },
    },
  };
}

async function applyRouteProjectPayload(payload) {
  const posterOutput = payload?.posterOutput;
  const routeLayer = createRouteLayerFromProjectPayload(payload);
  if (!routeLayer) {
    throw new Error('轨迹 JSON 缺少 routeLayer 或 routePreview.points，无法应用到主页面。');
  }

  let saved = null;
  if (posterOutput?.mapImageDataUrl) {
    const blob = await dataUrlToBlob(posterOutput.mapImageDataUrl);
    saved = await saveAssetBlob(blob, {
      slot: 'map',
      name: payload.background?.name || '轨迹底图',
      type: blob.type || 'image/png',
    });
  } else if (payload?.background?.sourceType === 'image' && payload.background.dataUrl) {
    const blob = await dataUrlToBlob(payload.background.dataUrl);
    saved = await saveAssetBlob(blob, {
      slot: 'map',
      name: payload.background?.name || '轨迹底图',
      type: blob.type || 'image/png',
    });
  }

  const projectRecord = await saveAssetBlob(new Blob([JSON.stringify(payload)], { type: 'application/json;charset=utf-8' }), {
    slot: 'route-project',
    name: '轨迹项目.json',
    type: 'application/json',
  });

  const state = store.getState();
  if (saved) {
    state.map.sourceType = 'upload';
    state.map.assetId = saved.id;
  }
  state.map.routeLayer = routeLayer;
  state.map.routeProject = null;
  state.map.routeProjectAssetId = projectRecord.id;
  rerollRouteMapView(state);
  replaceState(state, 'route-project-apply');
  await refreshAssetLabels(state);
}

async function handleRouteProjectImport(file) {
  if (!file) {
    return;
  }

  setRenderStatus('正在导入轨迹 JSON…', 'neutral');
  try {
    const text = await file.text();
    const payload = JSON.parse(text);
    await applyRouteProjectPayload(payload);
    setRenderStatus('轨迹 JSON 已应用到主页面', 'success');
  } catch (error) {
    console.error(error);
    setRenderStatus(error.message || '轨迹 JSON 导入失败', 'error');
  }
}

function validateRouteProjectForDefault(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('默认轨迹项目必须是合法 JSON 对象。');
  }
  if (Number(payload.version) < 3) {
    throw new Error('默认轨迹项目必须是 v3 或更新版本。');
  }

  const routeLayer = createRouteLayerFromProjectPayload(payload);
  if (!routeLayer) {
    throw new Error('轨迹 JSON 缺少 routeLayer 或 routePreview.points。');
  }
  if (!payload?.posterOutput?.mapImageDataUrl && !payload?.background?.dataUrl) {
    throw new Error('轨迹 JSON 缺少底图 dataUrl。');
  }

  return routeLayer;
}

async function readRouteProjectJsonFile(file) {
  if (!file) {
    throw new Error('请先选择轨迹 JSON 文件。');
  }

  const text = await file.text();
  const payload = JSON.parse(text);
  validateRouteProjectForDefault(payload);
  return payload;
}

async function fetchDefaultRouteProject() {
  const response = await fetch('/api/default-route-project', { cache: 'no-store' });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    let errorMessage = `默认项目读取失败：${response.status}`;
    try {
      const body = await response.json();
      errorMessage = body.error || errorMessage;
    } catch {
      // ignore non-json error body
    }
    throw new Error(errorMessage);
  }

  const payload = await response.json();
  validateRouteProjectForDefault(payload);
  return payload;
}

function normalizeWeatherDate(value) {
  const raw = String(value || '').trim().replaceAll('/', '-');
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
}

function isManualLocked(state, path) {
  return state.locks?.manualPaths?.includes(path) ?? false;
}

function setWeatherStatus(text, tone = 'neutral') {
  const status = appRoot.querySelector('#weather-status');
  if (!status) {
    return;
  }
  status.textContent = text;
  status.dataset.tone = tone;
}

async function handleAutoWeather() {
  const state = store.getState();
  const city = state.session.location || '北京市';
  const date = normalizeWeatherDate(state.session.date);
  if (!date) {
    setWeatherStatus('日期格式需要是 YYYY/MM/DD 或 YYYY-MM-DD。', 'error');
    return;
  }

  setWeatherStatus('正在自动获取天气…', 'neutral');
  try {
    const response = await fetch(`/api/weather?city=${encodeURIComponent(city)}&date=${encodeURIComponent(date)}`, {
      cache: 'no-store',
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.ok === false) {
      throw new Error(body.error || '自动天气获取失败。');
    }

    const nextState = store.getState();
    if (!isManualLocked(nextState, 'session.weather')) {
      nextState.session.weather = body.weather || nextState.session.weather;
    }
    if (!isManualLocked(nextState, 'session.temperature')) {
      nextState.session.temperature = body.temperature || nextState.session.temperature;
    }
    replaceState(nextState, 'auto-weather');
    setWeatherStatus(`已获取天气：${body.weather ?? '-'} ${body.temperature ?? ''}`, 'success');
  } catch (error) {
    console.error(error);
    setWeatherStatus(error.message || '自动天气获取失败，保留手填。', 'error');
  }
}

async function handleAdminLogin(password) {
  setAdminStatus('正在登录管理员…', 'neutral');
  try {
    const response = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.ok === false) {
      throw new Error(body.error || '管理员登录失败。');
    }
    setAdminStatus('管理员登录成功，可以上传并保存默认轨迹项目。', 'success');
  } catch (error) {
    console.error(error);
    setAdminStatus(error.message || '管理员登录失败。', 'error');
  }
}

async function handleAdminRouteProjectSelect(file) {
  try {
    pendingAdminRouteProject = await readRouteProjectJsonFile(file);
    const pointCount =
      pendingAdminRouteProject.posterOutput?.routeLayer?.points?.length ??
      pendingAdminRouteProject.routePreview?.points?.length ??
      0;
    setAdminStatus(`已选择默认轨迹 JSON：${pointCount} 个轨迹点，点击“保存为全站默认”。`, 'success');
  } catch (error) {
    console.error(error);
    pendingAdminRouteProject = null;
    setAdminStatus(error.message || '轨迹 JSON 校验失败。', 'error');
  }
}

async function handleAdminSaveDefault() {
  if (!pendingAdminRouteProject) {
    setAdminStatus('请先选择并校验一个 v3 轨迹 JSON。', 'error');
    return;
  }

  setAdminStatus('正在保存全站默认轨迹项目…', 'neutral');
  try {
    const response = await fetch('/api/admin/default-route-project', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(pendingAdminRouteProject),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.ok === false) {
      throw new Error(body.error || '保存默认项目失败。');
    }
    setAdminStatus('全站默认轨迹项目已保存。新用户首次打开会自动加载它。', 'success');
  } catch (error) {
    console.error(error);
    setAdminStatus(error.message || '保存默认项目失败。', 'error');
  }
}

async function handleAdminClearDefault() {
  setAdminStatus('正在删除全站默认轨迹项目…', 'neutral');
  try {
    const response = await fetch('/api/admin/default-route-project', { method: 'DELETE' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.ok === false) {
      throw new Error(body.error || '删除默认项目失败。');
    }
    setAdminStatus('全站默认轨迹项目已删除。', 'success');
  } catch (error) {
    console.error(error);
    setAdminStatus(error.message || '删除默认项目失败。', 'error');
  }
}

async function handleAdminCheckDefault() {
  setAdminStatus('正在检查全站默认轨迹项目…', 'neutral');
  try {
    const payload = await fetchDefaultRouteProject();
    if (!payload) {
      setAdminStatus('当前还没有配置全站默认轨迹项目。', 'neutral');
      return;
    }
    const pointCount =
      payload.posterOutput?.routeLayer?.points?.length ??
      payload.routePreview?.points?.length ??
      0;
    setAdminStatus(`已配置全站默认轨迹项目：v${payload.version}，${pointCount} 个轨迹点。`, 'success');
  } catch (error) {
    console.error(error);
    setAdminStatus(error.message || '检查默认项目失败。', 'error');
  }
}

async function restoreSiteDefaultRoute() {
  setRenderStatus('正在恢复全站默认轨迹…', 'neutral');
  try {
    const payload = await fetchDefaultRouteProject();
    if (!payload) {
      setRenderStatus('当前没有配置全站默认轨迹项目', 'neutral');
      return;
    }
    await applyRouteProjectPayload(payload);
    setRenderStatus('已恢复全站默认轨迹项目', 'success');
  } catch (error) {
    console.error(error);
    setRenderStatus(error.message || '恢复全站默认轨迹失败', 'error');
  }
}

async function loadSiteDefaultRouteForNewUser() {
  const state = store.getState();
  if (state.map.assetId || state.map.routeLayer?.enabled || state.map.routeProjectAssetId) {
    return;
  }

  try {
    const payload = await fetchDefaultRouteProject();
    if (!payload) {
      return;
    }
    await applyRouteProjectPayload(payload);
    setRenderStatus('已自动加载全站默认轨迹项目', 'success');
  } catch (error) {
    console.warn('Failed to load site default route project:', error);
  }
}

async function sendRouteLabInit(targetWindow) {
  if (!targetWindow || targetWindow.closed) {
    return;
  }

  try {
    const message = await buildRouteLabInitPayload();
    targetWindow.postMessage(message, window.location.origin);
  } catch (error) {
    console.error(error);
    setRenderStatus('发送当前底图到轨迹窗口失败', 'error');
  }
}

function openRouteLab() {
  routeLabWindow = window.open('/route-lab.html?from=poster', 'keep-route-lab');
  if (!routeLabWindow) {
    setRenderStatus('轨迹制作窗口被浏览器拦截，请允许弹窗', 'error');
    return;
  }
  setRenderStatus('已打开轨迹制作窗口', 'neutral');
  setTimeout(() => {
    void sendRouteLabInit(routeLabWindow);
  }, 700);
}

function clearRouteLayer() {
  const state = store.getState();
  state.map.routeLayer = null;
  state.map.routeProject = null;
  state.map.routeProjectAssetId = null;
  replaceState(state, 'clear-route-layer');
  refreshAssetLabels(state);
}

function rerollCurrentRouteMap() {
  const state = store.getState();
  if (!state.map.routeLayer?.enabled) {
    setRenderStatus('当前没有可重 roll 的轨迹层', 'neutral');
    return;
  }
  rerollRouteMapView(state);
  replaceState(state, 'reroll-route-map');
  setRenderStatus('已重 roll 地图视角', 'success');
}

async function rerollCurrentRoutePath(options = {}) {
  const state = store.getState();
  if (!state.map.routeLayer?.enabled || !state.map.routeProjectAssetId) {
    if (!options.silent) {
      setRenderStatus('当前没有可重 roll 的轨迹项目 JSON', 'neutral');
    }
    return;
  }

  if (!options.silent) {
    setRenderStatus('正在重 roll 轨迹…', 'neutral');
  }
  try {
    const projectBlob = await getAssetBlob(state.map.routeProjectAssetId);
    if (!projectBlob) {
      throw new Error('找不到已导入的轨迹项目 JSON。');
    }
    const payload = JSON.parse(await projectBlob.text());
    const maskDataUrl = payload?.mask?.dataUrl;
    if (!maskDataUrl) {
      throw new Error('轨迹项目 JSON 里没有掩码图，无法重新生成轨迹。');
    }

    const maskWidth = Math.max(1, Math.round(Number(payload.mask.width) || 1));
    const maskHeight = Math.max(1, Math.round(Number(payload.mask.height) || 1));
    const imageData = await dataUrlToImageData(maskDataUrl, maskWidth, maskHeight);
    const routeConfig = payload.routeConfig ?? {};
    const targetDistanceKm = Number(options.targetDistanceKm) || Number(routeConfig.targetDistanceKm) || 2.8;
    const seed = createRandomRouteSeed();
    const route = generateMaskConstrainedRoute({
      imageData,
      width: maskWidth,
      height: maskHeight,
      targetDistanceKm,
      seed,
      metersPerPixel: Number(routeConfig.metersPerPixel) || Number(payload.routePreview?.metersPerPixel) || 1,
      loopBias: Number(routeConfig.loopBias) || 0.72,
      stepPx: Number(routeConfig.stepPx) || 6,
      smoothingWindow: Number(routeConfig.smoothingWindow) || 5,
      jitterAmplitudePx: Number(routeConfig.jitterAmplitudePx) || 1.15,
      skeleton: payload.skeleton ?? { lines: [] },
      roadEndNodes: payload.roadEndNodes ?? [],
      skeletonSnapRadiusPx: Number(routeConfig.skeletonSnapRadiusPx) || 12,
      closeLoopSnapRadiusPx: Number(routeConfig.closeLoopSnapRadiusPx) || 14,
      intersectionSnapRadiusPx: Number(routeConfig.intersectionSnapRadiusPx) || 10,
      skeletonFollowBias: Number(routeConfig.skeletonFollowBias) || 0.9,
      branchSwitchPenalty: Number(routeConfig.branchSwitchPenalty) || 0.88,
      deadEndPenalty: Number(routeConfig.deadEndPenalty) || 1.1,
      maskFallbackBias: Number(routeConfig.maskFallbackBias) || 0.2,
      cycleExitPenalty: Number(routeConfig.cycleExitPenalty) || 1.45,
      minLoopCoverage: Number(routeConfig.minLoopCoverage) || 0.72,
      turnaroundAmplitudePx: Number(routeConfig.turnaroundAmplitudePx) || 12,
    });

    const nextRouteLayer = createRouteLayerFromRouteResult(route, payload, state.map.routeLayer);
    payload.routeConfig = {
      ...routeConfig,
      targetDistanceKm,
      seed: '',
      metersPerPixel: route.metersPerPixel,
    };
    payload.routePreview = {
      points: route.points,
      totalDistancePx: route.totalDistancePx,
      estimatedDistanceKm: route.estimatedDistanceKm,
      metersPerPixel: route.metersPerPixel,
      strategy: route.strategy,
      seed,
    };
    payload.posterOutput = {
      ...(payload.posterOutput ?? {}),
      mapImageWidth: nextRouteLayer.width,
      mapImageHeight: nextRouteLayer.height,
      routeLayer: nextRouteLayer,
    };

    const projectRecord = await saveAssetBlob(new Blob([JSON.stringify(payload)], { type: 'application/json;charset=utf-8' }), {
      slot: 'route-project',
      name: '轨迹项目-reroll.json',
      type: 'application/json',
    });

    state.map.routeLayer = nextRouteLayer;
    state.map.routeProjectAssetId = projectRecord.id;
    rerollRouteMapView(state);
    replaceState(state, 'reroll-route-path');
    await refreshAssetLabels(state);
    if (!options.silent) {
      setRenderStatus(`已重 roll 轨迹 · ${route.estimatedDistanceKm.toFixed(2)} km`, 'success');
    }
  } catch (error) {
    console.error(error);
    if (!options.silent) {
      setRenderStatus(error.message || '重 roll 轨迹失败', 'error');
    }
    throw error;
  }
}

async function handleAvatarUpload(file) {
  if (!file) {
    return;
  }

  const saved = await saveAssetBlob(file, {
    slot: 'avatar',
    name: file.name,
    type: file.type,
  });

  const nextState = store.getState();
  nextState.profile.avatarAssetId = saved.id;
  replaceState(nextState, 'asset-upload');
  await refreshAssetLabels(nextState);
}

async function handleMapUpload(file) {
  if (!file) {
    return;
  }

  const saved = await saveAssetBlob(file, {
    slot: 'map',
    name: file.name,
    type: file.type,
  });

  const nextState = store.getState();
  nextState.map.sourceType = 'upload';
  nextState.map.assetId = saved.id;
  nextState.map.routeLayer = null;
  nextState.map.routeProject = null;
  nextState.map.routeProjectAssetId = null;
  replaceState(nextState, 'asset-upload');
  await refreshAssetLabels(nextState);
}

function exportFilename(state) {
  const nickname = (state.profile.nickname || 'keep-poster').replace(/[\\/:*?"<>|]/g, '-').trim();
  const date = state.session.date || 'undated';
  return `${nickname}-${date}.png`;
}

async function handleExport() {
  const state = store.getState();
  setRenderStatus('正在导出 PNG…', 'neutral');

  try {
    const blob = await exportPosterBlob(state, assetLoader);
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = exportFilename(state);
    link.click();
    URL.revokeObjectURL(downloadUrl);
    setRenderStatus('导出完成', 'success');
  } catch (error) {
    console.error(error);
    setRenderStatus('导出失败，请查看控制台', 'error');
  }
}

function resetMapView() {
  const state = store.getState();
  state.map.scale = defaultState.map.scale;
  state.map.offsetX = defaultState.map.offsetX;
  state.map.offsetY = defaultState.map.offsetY;
  replaceState(state, 'reset-map-view');
}

function resetFormFields() {
  const state = store.getState();
  const nextState = createFormResetState(state);
  replaceState(nextState, 'reset-form');
  refreshAssetLabels(nextState);
}

function restoreDefaults() {
  const nextState = createHardResetState();
  replaceState(nextState, 'restore-defaults');
  refreshAssetLabels(nextState);
}

function handleClearManualLocks() {
  const nextState = clearManualLocks(store.getState());
  replaceState(nextState, 'clear-manual-locks');
  setRenderStatus('已清除手填保护', 'success');
}

async function handleRerollAll() {
  setRenderStatus('正在一键重 roll…', 'neutral');
  const result = rerollPosterState(store.getState());
  replaceState(result.state, 'reroll-all');
  await refreshAssetLabels(result.state);

  if (result.state.map.routeLayer?.enabled && result.state.map.routeProjectAssetId) {
    try {
      await rerollCurrentRoutePath({
        targetDistanceKm: result.targetDistanceKm,
        silent: true,
      });
      setRenderStatus(`一键重 roll 完成 · ${result.targetDistanceKm.toFixed(2)} km`, 'success');
    } catch (error) {
      console.error(error);
      setRenderStatus(error.message || '基础数据已重 roll，但轨迹重 roll 失败', 'error');
    }
    return;
  }

  setRenderStatus(`一键重 roll 完成 · ${result.targetDistanceKm.toFixed(2)} km`, 'success');
}

bindControls(appRoot, {
  onPathChange(path, value) {
    updateStateAtPath(path, value);
  },
  onBuiltinBackgroundSelect(backgroundId) {
    const state = store.getState();
    state.map.sourceType = 'builtin';
    state.map.sourceId = backgroundId;
    state.map.routeLayer = null;
    state.map.routeProject = null;
    state.map.routeProjectAssetId = null;
    replaceState(state, 'builtin-background');
    refreshAssetLabels(state);
  },
  onAvatarUpload: handleAvatarUpload,
  onMapUpload: handleMapUpload,
  onResetMapView: resetMapView,
  onOpenRouteLab: openRouteLab,
  onRouteProjectImport: handleRouteProjectImport,
  onClearRouteLayer: clearRouteLayer,
  onRerollRouteMap: rerollCurrentRouteMap,
  onRerollRoutePath: rerollCurrentRoutePath,
  onRerollAll: handleRerollAll,
  onRestoreSiteDefaultRoute: restoreSiteDefaultRoute,
  onAutoWeather: handleAutoWeather,
  onClearManualLocks: handleClearManualLocks,
  onAdminHotspotClick: handleAdminHotspotClick,
  onAdminLogin: handleAdminLogin,
  onAdminRouteProjectSelect: handleAdminRouteProjectSelect,
  onAdminSaveDefault: handleAdminSaveDefault,
  onAdminClearDefault: handleAdminClearDefault,
  onAdminCheckDefault: handleAdminCheckDefault,
  onExport: handleExport,
  onResetForm: resetFormFields,
  onRestoreDefaults: restoreDefaults,
});

window.addEventListener('message', (event) => {
  if (event.origin !== window.location.origin || !event.data?.type) {
    return;
  }

  if (event.data.type === 'keep-route-lab:ready') {
    routeLabWindow = event.source;
    void sendRouteLabInit(event.source);
  }

  if (event.data.type === 'keep-route-lab:apply') {
    applyRouteProjectPayload(event.data.payload)
      .then(() => setRenderStatus('轨迹已从制作窗口应用', 'success'))
      .catch((error) => {
        console.error(error);
        setRenderStatus(error.message || '轨迹应用失败', 'error');
      });
  }
});

store.subscribe((state, previousState) => {
  saveState(state);
  syncUiState(appRoot, state, BUILTIN_BACKGROUNDS, assetLabels);
  renderCurrentState(state);

  if (
    getValueByPath(previousState, 'map.sourceType') !== getValueByPath(state, 'map.sourceType') ||
    getValueByPath(previousState, 'map.sourceId') !== getValueByPath(state, 'map.sourceId') ||
    getValueByPath(previousState, 'map.assetId') !== getValueByPath(state, 'map.assetId') ||
    getValueByPath(previousState, 'profile.avatarAssetId') !== getValueByPath(state, 'profile.avatarAssetId')
  ) {
    refreshAssetLabels(state);
  }
});

async function init() {
  await assetLoader.preloadCoreAssets();
  await ensurePosterFonts();
  syncFormControls(appRoot, initialState);
  await refreshAssetLabels(initialState);
  syncUiState(appRoot, initialState, BUILTIN_BACKGROUNDS, assetLabels);
  applyPreviewZoom(initialState.ui.previewZoom);
  lastAppliedFormSnapshot = makeRenderableStateSnapshot(initialState);
  renderCurrentState(initialState);
  await loadSiteDefaultRouteForNewUser();
}

init().catch((error) => {
  console.error(error);
  setRenderStatus('初始化失败，请查看控制台', 'error');
});
