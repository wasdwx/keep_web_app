import './styles.css';

import {
  createDefaultRouteConfig,
  deserializeLabProject,
  serializeLabProject,
} from './projectCodec.js';
import {
  clampSelection,
  createDefaultSelection,
  getSelectionPixelSize,
  moveSelection,
  resizeSelectionFromCorner,
} from './selectionMath.js';
import { generateMaskConstrainedRoute } from './routeGenerator.js';
import { DEFAULT_ROUTE_STYLE, getRouteSegmentColor, normalizeRouteStyle } from '../render/routeStyle.js';

const DEFAULT_PLACE = {
  label: '示例地点',
  keyword: '北京市',
  center: { lat: 39.9042, lng: 116.4074 },
  zoom: 16,
};
const DEFAULT_IMAGE_STYLE_PRESET = 'image-only';

const MASK_BRUSH_COLOR = '#ff0000';
const SKELETON_COLOR = 'rgba(99, 102, 241, 0.9)';
const SKELETON_DRAFT_COLOR = 'rgba(129, 140, 248, 0.98)';
const SCALE_CALIBRATION_COLOR = '#f59e0b';
const CAPTURE_PADDING_PX = 80;
const IS_POSTER_CHILD = new URLSearchParams(window.location.search).get('from') === 'poster';
const DEFAULT_IMAGE_VIEW = { scale: 1, offsetX: 0, offsetY: 0 };

const STRATEGY_LABELS = {
  'mask-only': '纯掩码回退',
  'skeleton-guided': '骨架优先',
  'skeleton-plus-fallback': '骨架 + 掩码兜底',
};

const state = {
  placeLabel: DEFAULT_PLACE.label,
  placeKeyword: DEFAULT_PLACE.keyword,
  center: { ...DEFAULT_PLACE.center },
  zoom: DEFAULT_PLACE.zoom,
  pitch: 0,
  rotation: 0,
  stylePresetId: DEFAULT_IMAGE_STYLE_PRESET,
  backgroundMode: 'image',
  imageBackground: {
    dataUrl: null,
    name: '',
    width: 0,
    height: 0,
  },
  imageView: { ...DEFAULT_IMAGE_VIEW },
  selection: { x: 20, y: 20, width: 420, height: 336 },
  maskSize: { width: 420, height: 336 },
  routeConfig: createDefaultRouteConfig(),
  scaleCalibration: { points: [], distanceMeters: 100 },
  routePreview: null,
  skeleton: { lines: [] },
  roadEndNodes: [],
  activeTool: 'move',
  maskBrushSize: 18,
  showMaskOverlay: true,
  showSkeletonOverlay: true,
  showSkeletonSnapRanges: false,
  showRouteOverlay: true,
  exportPreviewWithSkeleton: false,
  status: {
    tone: 'info',
    message: '已切换为纯图片底图模式：上传底图后制作掩码、骨架和轨迹。',
  },
};

const refs = {};
let maskBitmapCanvas = null;
let maskBitmapCtx = null;
let imageBackgroundElement = null;
let selectionDrag = null;
let isMaskDrawing = false;
let lastMaskPoint = null;
let skeletonDraftPoints = [];
let skeletonHoverPoint = null;
let lineSequence = 0;
let roadEndSequence = 0;
let maskPointerId = null;
let skeletonPointerId = null;
let imagePanDrag = null;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function asNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function syncStateFromMapInstance(options = {}) {
  if (options.updateUi) {
    updateUi();
  }
  return false;
}

function renderShell() {
  return `
    <div class="tm-preview-layout">
      <aside class="tm-panel">
        <h1 class="tm-title">轨迹实验页</h1>
        <p class="tm-subtitle">这里分四步：上传底图、定选区、画掩码/骨架、测试轨迹。</p>
        <div id="status-banner" class="tm-status" data-tone="${state.status.tone}">${escapeHtml(state.status.message)}</div>

        <section class="tm-section">
          <h2 class="tm-section-title">底图</h2>
          <div class="tm-field-grid">
            <label class="tm-field tm-field--full">
              <span class="tm-label">上传图片底图</span>
              <input id="background-image-upload" class="tm-input" type="file" accept="image/*" />
            </label>
            <div id="image-background-status" class="tm-helper tm-field--full">当前未载入图片底图。</div>
            <div class="tm-helper tm-field--full">底图可用下方数值调节；鼠标移到预览区后滚轮缩放，拖拽选区外的底图可平移。</div>
            <label class="tm-field">
              <span class="tm-label">底图缩放</span>
              <input id="image-scale-input" class="tm-input" type="number" min="0.3" max="5" step="0.01" />
            </label>
            <label class="tm-field">
              <span class="tm-label">水平平移(px)</span>
              <input id="image-offset-x-input" class="tm-input" type="number" min="-3000" max="3000" step="1" />
            </label>
            <label class="tm-field">
              <span class="tm-label">垂直平移(px)</span>
              <input id="image-offset-y-input" class="tm-input" type="number" min="-3000" max="3000" step="1" />
            </label>
            <div class="tm-field">
              <span class="tm-label">底图视图</span>
              <button id="reset-image-view-button" class="tm-button tm-button--secondary" type="button">重置底图视图</button>
            </div>
          </div>
        </section>

        <section class="tm-section">
          <h2 class="tm-section-title">选区</h2>
          <p class="tm-helper">选区比例固定为 1000:800，对应未来主海报里的地图卡片。拖动蓝框移动，拖右下角可缩放。</p>
          <div class="tm-button-grid">
            <button id="reset-selection-button" class="tm-button tm-button--secondary" type="button">重置选区</button>
          </div>
        </section>

        <section class="tm-section">
          <h2 class="tm-section-title">编辑</h2>
          <div class="tm-tool-row">
            <button class="tm-tool" type="button" data-tool="move">移动选区</button>
            <button class="tm-tool" type="button" data-tool="brush">掩码画笔</button>
            <button class="tm-tool" type="button" data-tool="eraser">掩码橡皮</button>
            <button class="tm-tool" type="button" data-tool="skeleton">骨架画线</button>
            <button class="tm-tool" type="button" data-tool="skeleton-eraser">骨架擦除</button>
            <button class="tm-tool" type="button" data-tool="road-end">道路端点</button>
            <button class="tm-tool" type="button" data-tool="road-end-eraser">删除端点</button>
            <button class="tm-tool" type="button" data-tool="scale-calibrate">比例尺取点</button>
          </div>
          <div class="tm-field-grid tm-field-grid--compact">
            <label class="tm-field tm-field--full">
              <span class="tm-label">画笔大小</span>
              <div class="tm-range-row">
                <input id="brush-size-input" class="tm-range" type="range" min="6" max="48" step="1" />
                <span id="brush-size-value" class="tm-range-value">18 px</span>
              </div>
            </label>
            <label class="tm-field"><span class="tm-label">显示掩码</span><input id="toggle-mask" class="tm-checkbox" type="checkbox" checked /></label>
            <label class="tm-field"><span class="tm-label">显示骨架</span><input id="toggle-skeleton" class="tm-checkbox" type="checkbox" checked /></label>
            <label class="tm-field"><span class="tm-label">显示吸附范围</span><input id="toggle-skeleton-snap-ranges" class="tm-checkbox" type="checkbox" /></label>
            <label class="tm-field"><span class="tm-label">显示轨迹</span><input id="toggle-route" class="tm-checkbox" type="checkbox" checked /></label>
          </div>
          <div class="tm-button-grid tm-button-grid--triple" style="margin-top: 12px;">
              <button id="clear-mask-button" class="tm-button tm-button--secondary" type="button">清空掩码</button>
              <button id="delete-last-skeleton-button" class="tm-button tm-button--secondary" type="button">删除最近骨架</button>
              <button id="clear-skeleton-button" class="tm-button tm-button--secondary" type="button">清空骨架</button>
              <button id="clear-road-ends-button" class="tm-button tm-button--secondary" type="button">清空端点</button>
              <button id="export-mask-button" class="tm-button tm-button--secondary" type="button">导出掩码 PNG</button>
            </div>
          <p class="tm-helper" style="margin-top: 12px;">掩码请用红色画出可走路线带；骨架请画“中心主路线”；道路端点请标在一条道路的两端。骨架模式下：单击加点、双击或回车结束、Esc 取消。</p>
        </section>
        <section class="tm-section">
          <h2 class="tm-section-title">图片比例尺</h2>
          <p class="tm-helper">点“比例尺取点”，在选区内点一段已知长度的两端，再填写这段真实距离，会自动换算米/像素。</p>
          <div class="tm-field-grid tm-field-grid--compact">
            <label class="tm-field"><span class="tm-label">选段实际长度（m）</span><input id="scale-distance-input" class="tm-input" type="number" min="0.1" max="100000" step="0.1" /></label>
            <label class="tm-field"><span class="tm-label">米/像素</span><input id="meters-per-pixel-input" class="tm-input" type="number" min="0.001" max="1000" step="0.001" /></label>
          </div>
          <div class="tm-button-grid" style="margin-top: 12px;">
            <button id="clear-scale-calibration-button" class="tm-button tm-button--secondary" type="button">清除比例尺选段</button>
          </div>
          <p id="scale-calibration-status" class="tm-helper" style="margin-top: 10px;">尚未取点。</p>
        </section>
        <section class="tm-section">
          <h2 class="tm-section-title">轨迹策略</h2>
          <div class="tm-field-grid tm-field-grid--compact">
            <label class="tm-field"><span class="tm-label">目标距离（km）</span><input id="target-distance-input" class="tm-input" type="number" min="0.2" max="50" step="0.1" /></label>
            <label class="tm-field"><span class="tm-label">种子（留空随机）</span><input id="seed-input" class="tm-input" type="text" placeholder="留空则每次随机" /></label>
            <label class="tm-field"><span class="tm-label">回环偏好</span><input id="loop-bias-input" class="tm-input" type="number" min="0" max="1" step="0.01" /></label>
            <label class="tm-field"><span class="tm-label">步长（px）</span><input id="step-px-input" class="tm-input" type="number" min="2" max="24" step="1" /></label>
            <label class="tm-field"><span class="tm-label">平滑窗口</span><input id="smoothing-window-input" class="tm-input" type="number" min="1" max="25" step="1" /></label>
            <label class="tm-field"><span class="tm-label">扰动幅度（px）</span><input id="jitter-input" class="tm-input" type="number" min="0" max="20" step="0.05" /></label>
            <label class="tm-field"><span class="tm-label">预览位移（px）</span><input id="preview-shift-input" class="tm-input" type="number" min="0" max="80" step="1" /></label>
            <label class="tm-field"><span class="tm-label">骨架吸附半径（px）</span><input id="snap-radius-input" class="tm-input" type="number" min="4" max="36" step="1" /></label>
            <label class="tm-field"><span class="tm-label">闭环吸附半径（px）</span><input id="close-loop-radius-input" class="tm-input" type="number" min="4" max="48" step="1" /></label>
            <label class="tm-field"><span class="tm-label">交叉识别半径（px）</span><input id="intersection-radius-input" class="tm-input" type="number" min="4" max="36" step="1" /></label>
            <label class="tm-field"><span class="tm-label">骨架跟随强度</span><input id="follow-bias-input" class="tm-input" type="number" min="0" max="2" step="0.01" /></label>
            <label class="tm-field"><span class="tm-label">分岔切换惩罚</span><input id="branch-penalty-input" class="tm-input" type="number" min="0" max="3" step="0.01" /></label>
            <label class="tm-field"><span class="tm-label">死路惩罚</span><input id="dead-end-penalty-input" class="tm-input" type="number" min="0" max="4" step="0.01" /></label>
            <label class="tm-field"><span class="tm-label">掩码回退比例</span><input id="mask-fallback-bias-input" class="tm-input" type="number" min="0" max="1" step="0.01" /></label>
            <label class="tm-field"><span class="tm-label">出环惩罚</span><input id="cycle-exit-penalty-input" class="tm-input" type="number" min="0" max="4" step="0.01" /></label>
            <label class="tm-field"><span class="tm-label">最小环覆盖率</span><input id="min-loop-coverage-input" class="tm-input" type="number" min="0" max="1" step="0.01" /></label>
            <label class="tm-field"><span class="tm-label">掉头幅度（px）</span><input id="turnaround-amplitude-input" class="tm-input" type="number" min="0" max="30" step="1" /></label>
          </div>
          <div class="tm-button-grid" style="margin-top: 12px;">
            <button id="generate-route-button" class="tm-button" type="button">生成轨迹</button>
            <button id="clear-route-button" class="tm-button tm-button--secondary" type="button">清空轨迹</button>
          </div>
        </section>

        <section class="tm-section">
          <h2 class="tm-section-title">导入 / 导出</h2>
          <div class="tm-field-grid tm-field-grid--compact">
            <label class="tm-field tm-field--full">
              <span class="tm-label">导出预览时包含骨架辅助线</span>
              <input id="toggle-export-skeleton" class="tm-checkbox" type="checkbox" />
            </label>
          </div>
          <div class="tm-button-grid" style="margin-top: 12px;">
            <button id="export-project-button" class="tm-button tm-button--secondary" type="button">导出项目 JSON</button>
            <button id="import-project-button" class="tm-button tm-button--secondary" type="button">导入项目 JSON</button>
            <button id="export-preview-button" class="tm-button tm-button--secondary" type="button">导出实验预览 PNG</button>
            <button id="apply-to-poster-button" class="tm-button" type="button">应用到主页面</button>
          </div>
          <div id="apply-status" class="tm-status tm-status--inline" data-tone="info" hidden></div>
          <input id="import-project-input" class="tm-hidden-input" type="file" accept="application/json" />
        </section>
      </aside>

      <section class="tm-map-shell">
        <div class="tm-map-toolbar">
          <div>
            <h2 class="tm-map-title">底图预览</h2>
            <p class="tm-map-note">掩码、骨架和轨迹全部在本地像素坐标中叠加。</p>
          </div>
          <div id="map-meta" class="tm-map-meta"></div>
        </div>

        <div class="tm-stage-wrap">
          <div id="map-stage" class="tm-map-stage">
            <div id="map-view" class="tm-map-view"></div>
            <canvas id="mask-overlay" class="tm-overlay-canvas tm-overlay-canvas--mask"></canvas>
            <canvas id="skeleton-overlay" class="tm-overlay-canvas tm-overlay-canvas--skeleton"></canvas>
            <canvas id="route-overlay" class="tm-overlay-canvas tm-overlay-canvas--route"></canvas>
            <div id="selection-box" class="tm-selection-box">
              <div class="tm-selection-box__label">地图选区 1000:800</div>
              <div id="selection-handle" class="tm-selection-box__handle"></div>
            </div>
          </div>
        </div>

        <div class="tm-stage-footer">
          <span id="footer-selection-chip" class="tm-footer-chip"></span>
          <span id="footer-skeleton-chip" class="tm-footer-chip"></span>
          <span id="footer-route-chip" class="tm-footer-chip"></span>
          <span id="footer-cursor-chip" class="tm-footer-chip"></span>
        </div>
      </section>
    </div>
  `;
}

function cacheDom() {
  refs.statusBanner = document.getElementById('status-banner');
  refs.backgroundImageUpload = document.getElementById('background-image-upload');
  refs.imageBackgroundStatus = document.getElementById('image-background-status');
  refs.imageScaleInput = document.getElementById('image-scale-input');
  refs.imageOffsetXInput = document.getElementById('image-offset-x-input');
  refs.imageOffsetYInput = document.getElementById('image-offset-y-input');
  refs.resetImageViewButton = document.getElementById('reset-image-view-button');
  refs.resetSelectionButton = document.getElementById('reset-selection-button');
  refs.toolButtons = [...document.querySelectorAll('[data-tool]')];
  refs.brushSizeInput = document.getElementById('brush-size-input');
  refs.brushSizeValue = document.getElementById('brush-size-value');
  refs.toggleMask = document.getElementById('toggle-mask');
  refs.toggleSkeleton = document.getElementById('toggle-skeleton');
  refs.toggleSkeletonSnapRanges = document.getElementById('toggle-skeleton-snap-ranges');
  refs.toggleRoute = document.getElementById('toggle-route');
  refs.clearMaskButton = document.getElementById('clear-mask-button');
  refs.deleteLastSkeletonButton = document.getElementById('delete-last-skeleton-button');
  refs.clearSkeletonButton = document.getElementById('clear-skeleton-button');
  refs.clearRoadEndsButton = document.getElementById('clear-road-ends-button');
  refs.exportMaskButton = document.getElementById('export-mask-button');
  refs.targetDistanceInput = document.getElementById('target-distance-input');
  refs.seedInput = document.getElementById('seed-input');
  refs.loopBiasInput = document.getElementById('loop-bias-input');
  refs.stepPxInput = document.getElementById('step-px-input');
  refs.smoothingWindowInput = document.getElementById('smoothing-window-input');
  refs.jitterInput = document.getElementById('jitter-input');
  refs.previewShiftInput = document.getElementById('preview-shift-input');
  refs.snapRadiusInput = document.getElementById('snap-radius-input');
  refs.closeLoopRadiusInput = document.getElementById('close-loop-radius-input');
  refs.intersectionRadiusInput = document.getElementById('intersection-radius-input');
  refs.followBiasInput = document.getElementById('follow-bias-input');
  refs.branchPenaltyInput = document.getElementById('branch-penalty-input');
  refs.deadEndPenaltyInput = document.getElementById('dead-end-penalty-input');
  refs.maskFallbackBiasInput = document.getElementById('mask-fallback-bias-input');
  refs.cycleExitPenaltyInput = document.getElementById('cycle-exit-penalty-input');
  refs.minLoopCoverageInput = document.getElementById('min-loop-coverage-input');
  refs.turnaroundAmplitudeInput = document.getElementById('turnaround-amplitude-input');
  refs.scaleDistanceInput = document.getElementById('scale-distance-input');
  refs.metersPerPixelInput = document.getElementById('meters-per-pixel-input');
  refs.clearScaleCalibrationButton = document.getElementById('clear-scale-calibration-button');
  refs.scaleCalibrationStatus = document.getElementById('scale-calibration-status');
  refs.generateRouteButton = document.getElementById('generate-route-button');
  refs.clearRouteButton = document.getElementById('clear-route-button');
  refs.toggleExportSkeleton = document.getElementById('toggle-export-skeleton');
  refs.exportProjectButton = document.getElementById('export-project-button');
  refs.importProjectButton = document.getElementById('import-project-button');
  refs.importProjectInput = document.getElementById('import-project-input');
  refs.exportPreviewButton = document.getElementById('export-preview-button');
  refs.applyToPosterButton = document.getElementById('apply-to-poster-button');
  refs.applyStatus = document.getElementById('apply-status');
  refs.mapMeta = document.getElementById('map-meta');
  refs.mapStage = document.getElementById('map-stage');
  refs.mapView = document.getElementById('map-view');
  refs.maskCanvas = document.getElementById('mask-overlay');
  refs.skeletonCanvas = document.getElementById('skeleton-overlay');
  refs.routeCanvas = document.getElementById('route-overlay');
  refs.selectionBox = document.getElementById('selection-box');
  refs.selectionHandle = document.getElementById('selection-handle');
  refs.footerSelectionChip = document.getElementById('footer-selection-chip');
  refs.footerSkeletonChip = document.getElementById('footer-skeleton-chip');
  refs.footerRouteChip = document.getElementById('footer-route-chip');
  refs.footerCursorChip = document.getElementById('footer-cursor-chip');
}

function setStatus(message, tone = 'info') {
  state.status = { message, tone };
  renderStatus();
}

function renderStatus() {
  refs.statusBanner.textContent = state.status.message;
  refs.statusBanner.dataset.tone = state.status.tone;
}

function setApplyStatus(message, tone = 'info') {
  if (!refs.applyStatus) {
    return;
  }
  refs.applyStatus.hidden = false;
  refs.applyStatus.textContent = message;
  refs.applyStatus.dataset.tone = tone;
}

function updateMapMeta() {
  refs.mapMeta.textContent = `图片底图：${state.imageBackground.name || '未载入'}`;
}

function renderSelectionBox() {
  const { x, y, width, height } = state.selection;
  refs.selectionBox.style.left = `${x}px`;
  refs.selectionBox.style.top = `${y}px`;
  refs.selectionBox.style.width = `${width}px`;
  refs.selectionBox.style.height = `${height}px`;
}

function updateFooterChips(cursorText = '坐标：-,-') {
  const selectionSize = getSelectionPixelSize(state.selection);
  refs.footerSelectionChip.textContent = `选区：${selectionSize.width} × ${selectionSize.height}`;
  refs.footerSkeletonChip.textContent = `骨架：${state.skeleton.lines.length} 条`;
  refs.footerSkeletonChip.textContent += ` / 端点：${state.roadEndNodes.length} 个`;
  refs.footerRouteChip.textContent = state.routePreview
    ? `轨迹：${state.routePreview.estimatedDistanceKm.toFixed(2)} km / ${STRATEGY_LABELS[state.routePreview.strategy] ?? state.routePreview.strategy}`
    : '轨迹：未生成';
  refs.footerCursorChip.textContent = cursorText;
}

function getCalibrationPixelDistance() {
  const points = state.scaleCalibration?.points ?? [];
  if (points.length < 2) {
    return 0;
  }
  return Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
}

function updateScaleCalibrationStatus() {
  if (!refs.scaleCalibrationStatus) {
    return;
  }
  const pointCount = state.scaleCalibration?.points?.length ?? 0;
  const pixelDistance = getCalibrationPixelDistance();
  if (pointCount < 2 || pixelDistance <= 0) {
    refs.scaleCalibrationStatus.textContent = pointCount === 1
      ? '已取第 1 个点，请再点第 2 个点。'
      : '尚未取点。';
    return;
  }
  refs.scaleCalibrationStatus.textContent = `选段 ${pixelDistance.toFixed(2)} px = ${Number(state.scaleCalibration.distanceMeters).toFixed(2)} m，当前 ${Number(state.routeConfig.metersPerPixel).toFixed(4)} m/px。`;
}

function recomputeMetersPerPixelFromCalibration() {
  const pixelDistance = getCalibrationPixelDistance();
  const distanceMeters = clamp(asNumber(state.scaleCalibration.distanceMeters, 100), 0.1, 100000);
  state.scaleCalibration.distanceMeters = distanceMeters;
  if (pixelDistance > 0) {
    state.routeConfig.metersPerPixel = clamp(distanceMeters / pixelDistance, 0.001, 1000);
    clearRoutePreview();
  }
  updateScaleCalibrationStatus();
  updateUi();
}

function updateUi() {
  renderStatus();
  updateMapMeta();
  refs.imageBackgroundStatus.textContent = state.imageBackground.dataUrl
    ? `当前图片：${state.imageBackground.name || '图片底图'} · ${state.imageBackground.width} × ${state.imageBackground.height}`
    : '当前未载入图片底图。';
  refs.imageScaleInput.value = String(state.imageView.scale);
  refs.imageOffsetXInput.value = String(state.imageView.offsetX);
  refs.imageOffsetYInput.value = String(state.imageView.offsetY);
  refs.brushSizeInput.value = String(state.maskBrushSize);
  refs.brushSizeValue.textContent = `${state.maskBrushSize}px`;
  refs.toggleMask.checked = state.showMaskOverlay;
  refs.toggleSkeleton.checked = state.showSkeletonOverlay;
  refs.toggleSkeletonSnapRanges.checked = state.showSkeletonSnapRanges;
  refs.toggleRoute.checked = state.showRouteOverlay;
  refs.targetDistanceInput.value = String(state.routeConfig.targetDistanceKm);
  refs.seedInput.value = state.routeConfig.seed;
  refs.scaleDistanceInput.value = String(state.scaleCalibration.distanceMeters);
  refs.metersPerPixelInput.value = String(state.routeConfig.metersPerPixel);
  refs.loopBiasInput.value = String(state.routeConfig.loopBias);
  refs.stepPxInput.value = String(state.routeConfig.stepPx);
  refs.smoothingWindowInput.value = String(state.routeConfig.smoothingWindow);
  refs.jitterInput.value = String(state.routeConfig.jitterAmplitudePx);
  refs.previewShiftInput.value = String(state.routeConfig.previewShiftPx);
  refs.snapRadiusInput.value = String(state.routeConfig.skeletonSnapRadiusPx);
  refs.closeLoopRadiusInput.value = String(state.routeConfig.closeLoopSnapRadiusPx);
  refs.intersectionRadiusInput.value = String(state.routeConfig.intersectionSnapRadiusPx);
  refs.followBiasInput.value = String(state.routeConfig.skeletonFollowBias);
  refs.branchPenaltyInput.value = String(state.routeConfig.branchSwitchPenalty);
  refs.deadEndPenaltyInput.value = String(state.routeConfig.deadEndPenalty);
  refs.maskFallbackBiasInput.value = String(state.routeConfig.maskFallbackBias);
  refs.cycleExitPenaltyInput.value = String(state.routeConfig.cycleExitPenalty);
  refs.minLoopCoverageInput.value = String(state.routeConfig.minLoopCoverage);
  refs.turnaroundAmplitudeInput.value = String(state.routeConfig.turnaroundAmplitudePx);
  refs.toggleExportSkeleton.checked = state.exportPreviewWithSkeleton;
  refs.applyToPosterButton.disabled = !IS_POSTER_CHILD && !window.opener;
  refs.toolButtons.forEach((button) => button.classList.toggle('is-active', button.dataset.tool === state.activeTool));
  updateScaleCalibrationStatus();
  renderSelectionBox();
  updateFooterChips();
}

function normalizeImageView(view = {}) {
  return {
    scale: clamp(asNumber(view.scale, 1), 0.3, 5),
    offsetX: clamp(asNumber(view.offsetX, 0), -3000, 3000),
    offsetY: clamp(asNumber(view.offsetY, 0), -3000, 3000),
  };
}

function computeImageDrawRectFromView(view) {
  if (!imageBackgroundElement) {
    return null;
  }

  const stageWidth = refs.mapStage.clientWidth;
  const stageHeight = refs.mapStage.clientHeight;
  const imageWidth = imageBackgroundElement.naturalWidth || imageBackgroundElement.width;
  const imageHeight = imageBackgroundElement.naturalHeight || imageBackgroundElement.height;
  const fitScale = Math.max(stageWidth / imageWidth, stageHeight / imageHeight);
  const finalScale = fitScale * view.scale;
  const drawWidth = imageWidth * finalScale;
  const drawHeight = imageHeight * finalScale;
  return {
    x: (stageWidth - drawWidth) / 2 + view.offsetX,
    y: (stageHeight - drawHeight) / 2 + view.offsetY,
    width: drawWidth,
    height: drawHeight,
  };
}

function computeImageDrawRect() {
  return computeImageDrawRectFromView(state.imageView);
}

function getProtectedImageStageRect() {
  const scaleX = state.selection.width / Math.max(1, state.maskSize.width);
  const scaleY = state.selection.height / Math.max(1, state.maskSize.height);
  const paddingX = CAPTURE_PADDING_PX * scaleX;
  const paddingY = CAPTURE_PADDING_PX * scaleY;
  return {
    x: state.selection.x - paddingX,
    y: state.selection.y - paddingY,
    width: state.selection.width + paddingX * 2,
    height: state.selection.height + paddingY * 2,
  };
}

function clampImageViewToProtectedArea(view = {}) {
  if (!imageBackgroundElement || !refs.mapStage) {
    return normalizeImageView(view);
  }

  const stageWidth = refs.mapStage.clientWidth;
  const stageHeight = refs.mapStage.clientHeight;
  const imageWidth = imageBackgroundElement.naturalWidth || imageBackgroundElement.width;
  const imageHeight = imageBackgroundElement.naturalHeight || imageBackgroundElement.height;
  const fitScale = Math.max(stageWidth / imageWidth, stageHeight / imageHeight);
  const protectedRect = getProtectedImageStageRect();
  let next = normalizeImageView(view);
  const minScale = Math.max(
    protectedRect.width / Math.max(1, imageWidth * fitScale),
    protectedRect.height / Math.max(1, imageHeight * fitScale),
    0.3,
  );
  next = normalizeImageView({ ...next, scale: Math.max(next.scale, minScale) });

  const rect = computeImageDrawRectFromView(next);
  if (!rect) {
    return next;
  }

  const baseX = (stageWidth - rect.width) / 2;
  const baseY = (stageHeight - rect.height) / 2;
  const minOffsetX = protectedRect.x + protectedRect.width - (baseX + rect.width);
  const maxOffsetX = protectedRect.x - baseX;
  const minOffsetY = protectedRect.y + protectedRect.height - (baseY + rect.height);
  const maxOffsetY = protectedRect.y - baseY;

  return normalizeImageView({
    ...next,
    offsetX: minOffsetX <= maxOffsetX
      ? clamp(next.offsetX, minOffsetX, maxOffsetX)
      : (minOffsetX + maxOffsetX) / 2,
    offsetY: minOffsetY <= maxOffsetY
      ? clamp(next.offsetY, minOffsetY, maxOffsetY)
      : (minOffsetY + maxOffsetY) / 2,
  });
}

function applyImageBackgroundView() {
  if (!refs.mapView) {
    return;
  }
  const rect = computeImageDrawRect();
  if (!rect) {
    refs.mapView.style.backgroundSize = 'cover';
    refs.mapView.style.backgroundPosition = 'center';
    return;
  }
  refs.mapView.style.backgroundSize = `${rect.width}px ${rect.height}px`;
  refs.mapView.style.backgroundPosition = `${rect.x}px ${rect.y}px`;
}

function setImageView(nextView) {
  state.imageView = clampImageViewToProtectedArea({ ...state.imageView, ...nextView });
  applyImageBackgroundView();
  updateUi();
}

function zoomImageViewAt(stagePoint, scaleMultiplier) {
  if (!imageBackgroundElement) {
    return;
  }
  const previousView = normalizeImageView(state.imageView);
  const previousRect = computeImageDrawRect();
  if (!previousRect || !previousRect.width || !previousRect.height) {
    return;
  }
  const focalX = (stagePoint.x - previousRect.x) / previousRect.width;
  const focalY = (stagePoint.y - previousRect.y) / previousRect.height;
  const nextScale = clamp(previousView.scale * scaleMultiplier, 0.3, 5);
  const stageWidth = refs.mapStage.clientWidth;
  const stageHeight = refs.mapStage.clientHeight;
  const imageWidth = imageBackgroundElement.naturalWidth || imageBackgroundElement.width;
  const imageHeight = imageBackgroundElement.naturalHeight || imageBackgroundElement.height;
  const fitScale = Math.max(stageWidth / imageWidth, stageHeight / imageHeight);
  const nextWidth = imageWidth * fitScale * nextScale;
  const nextHeight = imageHeight * fitScale * nextScale;
  setImageView({
    scale: nextScale,
    offsetX: stagePoint.x - focalX * nextWidth - (stageWidth - nextWidth) / 2,
    offsetY: stagePoint.y - focalY * nextHeight - (stageHeight - nextHeight) / 2,
  });
}

function getStageViewportSize() {
  return {
    width: Math.max(320, Math.round(refs.mapStage.clientWidth)),
    height: Math.max(320, Math.round(refs.mapStage.clientHeight)),
  };
}

function createMaskBitmap(width, height) {
  maskBitmapCanvas = document.createElement('canvas');
  maskBitmapCanvas.width = width;
  maskBitmapCanvas.height = height;
  maskBitmapCtx = maskBitmapCanvas.getContext('2d', { willReadFrequently: true });
  maskBitmapCtx.clearRect(0, 0, width, height);
}

function scaleSkeletonToMaskSize(previousSize, nextSize) {
  if (!previousSize.width || !previousSize.height || !nextSize.width || !nextSize.height) {
    return;
  }
  const scaleX = nextSize.width / previousSize.width;
  const scaleY = nextSize.height / previousSize.height;
  state.skeleton.lines = state.skeleton.lines.map((line) => ({
    ...line,
    points: line.points.map((point) => ({ x: Number((point.x * scaleX).toFixed(2)), y: Number((point.y * scaleY).toFixed(2)) })),
  }));
  skeletonDraftPoints = skeletonDraftPoints.map((point) => ({ x: Number((point.x * scaleX).toFixed(2)), y: Number((point.y * scaleY).toFixed(2)) }));
  state.roadEndNodes = state.roadEndNodes.map((node) => ({
    ...node,
    x: Number((node.x * scaleX).toFixed(2)),
    y: Number((node.y * scaleY).toFixed(2)),
  }));
}

function resizeMaskBitmapToSelection(preserveExisting = true) {
  const previousSize = { ...state.maskSize };
  const nextSize = getSelectionPixelSize(state.selection);
  if (!maskBitmapCanvas) {
    state.maskSize = nextSize;
    createMaskBitmap(nextSize.width, nextSize.height);
    return;
  }
  if (previousSize.width === nextSize.width && previousSize.height === nextSize.height) {
    return;
  }
  const previousCanvas = maskBitmapCanvas;
  state.maskSize = nextSize;
  createMaskBitmap(nextSize.width, nextSize.height);
  if (preserveExisting && previousCanvas.width && previousCanvas.height) {
    maskBitmapCtx.drawImage(previousCanvas, 0, 0, previousCanvas.width, previousCanvas.height, 0, 0, nextSize.width, nextSize.height);
    scaleSkeletonToMaskSize(previousSize, nextSize);
  }
  state.routePreview = null;
}
function syncStageSize() {
  const viewport = getStageViewportSize();
  [refs.maskCanvas, refs.skeletonCanvas, refs.routeCanvas].forEach((canvas) => {
    if (canvas.width !== viewport.width || canvas.height !== viewport.height) {
      canvas.width = viewport.width;
      canvas.height = viewport.height;
    }
  });

  const clampedSelection = state.selection
    ? clampSelection(state.selection, viewport.width, viewport.height)
    : createDefaultSelection(viewport.width, viewport.height);
  const sizeChanged = Math.round(clampedSelection.width) !== Math.round(state.selection.width)
    || Math.round(clampedSelection.height) !== Math.round(state.selection.height);
  state.selection = clampedSelection;
  if (!maskBitmapCanvas) {
    state.maskSize = getSelectionPixelSize(state.selection);
    createMaskBitmap(state.maskSize.width, state.maskSize.height);
  } else if (sizeChanged) {
    resizeMaskBitmapToSelection(true);
  }

  state.imageView = clampImageViewToProtectedArea(state.imageView);
  applyImageBackgroundView();
  renderSelectionBox();
  renderMaskOverlay();
  renderSkeletonOverlay();
  renderRouteOverlay();
  updateFooterChips();
}

function setActiveTool(tool) {
  if (state.activeTool === 'skeleton' && tool !== 'skeleton') {
    commitSkeletonDraft();
  }
  state.activeTool = tool;
  const drawingMask = tool === 'brush' || tool === 'eraser';
  const drawingSkeleton = tool === 'skeleton' || tool === 'skeleton-eraser' || tool === 'road-end' || tool === 'road-end-eraser' || tool === 'scale-calibrate';
  refs.mapView.style.pointerEvents = tool === 'move' ? 'auto' : 'none';
  refs.maskCanvas.classList.toggle('is-drawing', drawingMask);
  refs.skeletonCanvas.classList.toggle('is-drawing', drawingSkeleton);
  refs.selectionBox.classList.toggle('is-disabled', tool !== 'move');
  refs.selectionBox.style.pointerEvents = tool === 'move' ? 'auto' : 'none';
  refs.mapStage.style.touchAction = tool === 'move' ? 'auto' : 'none';
  updateUi();
  renderSkeletonOverlay();
}

function stagePointToMaskPoint(clientX, clientY) {
  const stageRect = refs.mapStage.getBoundingClientRect();
  const stageX = clientX - stageRect.left;
  const stageY = clientY - stageRect.top;
  const localX = ((stageX - state.selection.x) / state.selection.width) * state.maskSize.width;
  const localY = ((stageY - state.selection.y) / state.selection.height) * state.maskSize.height;
  return {
    x: clamp(localX, 0, state.maskSize.width),
    y: clamp(localY, 0, state.maskSize.height),
    inside: stageX >= state.selection.x && stageY >= state.selection.y && stageX <= state.selection.x + state.selection.width && stageY <= state.selection.y + state.selection.height,
  };
}

function maskPointToStagePoint(point) {
  return {
    x: state.selection.x + (point.x / state.maskSize.width) * state.selection.width,
    y: state.selection.y + (point.y / state.maskSize.height) * state.selection.height,
  };
}

function getCursorTextFromClient(clientX, clientY) {
  const point = stagePointToMaskPoint(clientX, clientY);
  if (!point.inside) {
    return `坐标：-,- / 选区缩放：${Math.round((state.selection.width / state.maskSize.width) * 100)}%`;
  }
  return `坐标：${Math.round(point.x)}, ${Math.round(point.y)} / 选区缩放：${Math.round((state.selection.width / state.maskSize.width) * 100)}%`;
}

function updateCursorMeta(clientX, clientY) {
  updateFooterChips(typeof clientX === 'number' ? getCursorTextFromClient(clientX, clientY) : '坐标：-,-');
}

function drawMaskStroke(from, to, mode, size) {
  if (!maskBitmapCtx) {
    return;
  }
  maskBitmapCtx.save();
  if (mode === 'eraser') {
    maskBitmapCtx.globalCompositeOperation = 'destination-out';
    maskBitmapCtx.strokeStyle = 'rgba(0,0,0,1)';
    maskBitmapCtx.fillStyle = 'rgba(0,0,0,1)';
  } else {
    maskBitmapCtx.globalCompositeOperation = 'source-over';
    maskBitmapCtx.strokeStyle = MASK_BRUSH_COLOR;
    maskBitmapCtx.fillStyle = MASK_BRUSH_COLOR;
  }
  maskBitmapCtx.lineWidth = size;
  maskBitmapCtx.lineCap = 'round';
  maskBitmapCtx.lineJoin = 'round';
  maskBitmapCtx.beginPath();
  maskBitmapCtx.moveTo(from.x, from.y);
  maskBitmapCtx.lineTo(to.x, to.y);
  maskBitmapCtx.stroke();
  maskBitmapCtx.beginPath();
  maskBitmapCtx.arc(to.x, to.y, size / 2, 0, Math.PI * 2);
  maskBitmapCtx.fill();
  maskBitmapCtx.restore();
}

function renderMaskOverlay() {
  const ctx = refs.maskCanvas.getContext('2d');
  ctx.clearRect(0, 0, refs.maskCanvas.width, refs.maskCanvas.height);
  if (!state.showMaskOverlay || !maskBitmapCanvas) {
    return;
  }
  ctx.save();
  ctx.globalAlpha = 0.65;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(maskBitmapCanvas, 0, 0, maskBitmapCanvas.width, maskBitmapCanvas.height, state.selection.x, state.selection.y, state.selection.width, state.selection.height);
  ctx.restore();
}

function drawPolyline(ctx, points, options = {}) {
  if (points.length < 2) {
    return;
  }
  ctx.save();
  ctx.strokeStyle = options.strokeStyle ?? '#000';
  ctx.lineWidth = options.lineWidth ?? 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash(options.dash ?? []);
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) {
    ctx.lineTo(points[index].x, points[index].y);
  }
  ctx.stroke();
  ctx.restore();
}

function drawSkeletonSnapRanges(ctx) {
  if (!state.showSkeletonSnapRanges) {
    return;
  }

  const scaleX = state.selection.width / Math.max(1, state.maskSize.width);
  const scaleY = state.selection.height / Math.max(1, state.maskSize.height);
  const radiusX = state.routeConfig.skeletonSnapRadiusPx * scaleX;
  const radiusY = state.routeConfig.skeletonSnapRadiusPx * scaleY;
  const uniquePoints = new Map();

  for (const line of state.skeleton.lines) {
    for (const point of line.points) {
      uniquePoints.set(`${point.x.toFixed(2)},${point.y.toFixed(2)}`, point);
    }
  }
  for (const point of skeletonDraftPoints) {
    uniquePoints.set(`draft:${point.x.toFixed(2)},${point.y.toFixed(2)}`, point);
  }
  for (const point of state.roadEndNodes) {
    uniquePoints.set(`road-end:${point.x.toFixed(2)},${point.y.toFixed(2)}`, point);
  }
  if (skeletonHoverPoint) {
    uniquePoints.set(`hover:${skeletonHoverPoint.x.toFixed(2)},${skeletonHoverPoint.y.toFixed(2)}`, skeletonHoverPoint);
  }

  ctx.save();
  ctx.strokeStyle = 'rgba(99, 102, 241, 0.35)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.fillStyle = 'rgba(99, 102, 241, 0.05)';
  for (const point of uniquePoints.values()) {
    const stagePoint = maskPointToStagePoint(point);
    ctx.beginPath();
    ctx.ellipse(stagePoint.x, stagePoint.y, radiusX, radiusY, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawRoadEndNodes(ctx) {
  if (!state.roadEndNodes.length) {
    return;
  }

  ctx.save();
  for (const point of state.roadEndNodes) {
    const stagePoint = maskPointToStagePoint(point);

    ctx.beginPath();
    ctx.fillStyle = 'rgba(249, 115, 22, 0.18)';
    ctx.arc(stagePoint.x, stagePoint.y, 9, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.fillStyle = '#f97316';
    ctx.arc(stagePoint.x, stagePoint.y, 5.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.fillStyle = '#ffffff';
    ctx.arc(stagePoint.x, stagePoint.y, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawScaleCalibration(ctx) {
  const points = state.scaleCalibration?.points ?? [];
  if (!points.length) {
    return;
  }

  const stagePoints = points.map(maskPointToStagePoint);
  ctx.save();
  if (stagePoints.length >= 2) {
    drawPolyline(ctx, stagePoints, { strokeStyle: SCALE_CALIBRATION_COLOR, lineWidth: 3, dash: [8, 5] });
    const middle = {
      x: (stagePoints[0].x + stagePoints[1].x) / 2,
      y: (stagePoints[0].y + stagePoints[1].y) / 2,
    };
    const pixelDistance = getCalibrationPixelDistance();
    const label = `${Number(state.scaleCalibration.distanceMeters).toFixed(1)} m / ${pixelDistance.toFixed(1)} px`;
    ctx.font = '700 13px system-ui, sans-serif';
    const metrics = ctx.measureText(label);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
    ctx.beginPath();
    ctx.roundRect(middle.x - metrics.width / 2 - 8, middle.y - 28, metrics.width + 16, 22, 11);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(label, middle.x - metrics.width / 2, middle.y - 13);
  }

  for (const point of stagePoints) {
    ctx.beginPath();
    ctx.fillStyle = '#fff7ed';
    ctx.strokeStyle = SCALE_CALIBRATION_COLOR;
    ctx.lineWidth = 3;
    ctx.arc(point.x, point.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function renderSkeletonOverlay() {
  const ctx = refs.skeletonCanvas.getContext('2d');
  ctx.clearRect(0, 0, refs.skeletonCanvas.width, refs.skeletonCanvas.height);
  if (!state.showSkeletonOverlay) {
    return;
  }
  drawSkeletonSnapRanges(ctx);
  for (const line of state.skeleton.lines) {
    const stagePoints = line.points.map(maskPointToStagePoint);
    drawPolyline(ctx, stagePoints, { strokeStyle: SKELETON_COLOR, lineWidth: 2.6 });
    ctx.save();
    ctx.fillStyle = '#4f46e5';
    for (const point of stagePoints) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  drawRoadEndNodes(ctx);
  drawScaleCalibration(ctx);
  if (skeletonDraftPoints.length) {
    const draftStagePoints = skeletonDraftPoints.map(maskPointToStagePoint);
    if (skeletonHoverPoint) {
      draftStagePoints.push(maskPointToStagePoint(skeletonHoverPoint));
    }
    drawPolyline(ctx, draftStagePoints, { strokeStyle: SKELETON_DRAFT_COLOR, lineWidth: 2, dash: [6, 6] });
    ctx.save();
    ctx.fillStyle = '#818cf8';
    for (const point of draftStagePoints.slice(0, skeletonDraftPoints.length)) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 3.1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function renderRouteOverlay() {
  const ctx = refs.routeCanvas.getContext('2d');
  ctx.clearRect(0, 0, refs.routeCanvas.width, refs.routeCanvas.height);
  if (!state.showRouteOverlay || !state.routePreview?.points?.length) {
    return;
  }
  const stagePoints = state.routePreview.points.map(maskPointToStagePoint);
  const routeStyle = normalizeRouteStyle();
  const markerBorderWidth = Math.max(0, routeStyle.markerBorderWidth);
  const markerRadius = Math.max(1, routeStyle.markerRadius);
  ctx.save();
  ctx.strokeStyle = routeStyle.shadowColor;
  ctx.lineWidth = routeStyle.shadowWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(stagePoints[0].x, stagePoints[0].y);
  for (let index = 1; index < stagePoints.length; index += 1) {
    ctx.lineTo(stagePoints[index].x, stagePoints[index].y);
  }
  ctx.stroke();
  ctx.lineWidth = routeStyle.width;
  for (let index = 1; index < stagePoints.length; index += 1) {
    ctx.beginPath();
    ctx.moveTo(stagePoints[index - 1].x, stagePoints[index - 1].y);
    ctx.lineTo(stagePoints[index].x, stagePoints[index].y);
    ctx.strokeStyle = getRouteSegmentColor(state.routePreview.points, index - 1, routeStyle);
    ctx.stroke();
  }
  const drawEndpoint = (point, color) => {
    ctx.beginPath();
    ctx.fillStyle = routeStyle.markerBorderColor;
    ctx.arc(point.x, point.y, markerRadius + markerBorderWidth, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.arc(point.x, point.y, markerRadius, 0, Math.PI * 2);
    ctx.fill();
  };
  drawEndpoint(stagePoints[0], routeStyle.startColor);
  drawEndpoint(stagePoints.at(-1), routeStyle.endColor);
  ctx.restore();
}

function clearRoutePreview() {
  state.routePreview = null;
  renderRouteOverlay();
  updateFooterChips();
}
function commitSkeletonDraft() {
  if (skeletonDraftPoints.length < 2) {
    skeletonDraftPoints = [];
    skeletonHoverPoint = null;
    renderSkeletonOverlay();
    return;
  }
  lineSequence += 1;
  state.skeleton.lines.push({
    id: `line-${lineSequence}`,
    points: skeletonDraftPoints.map((point) => ({ x: Number(point.x.toFixed(2)), y: Number(point.y.toFixed(2)) })),
  });
  skeletonDraftPoints = [];
  skeletonHoverPoint = null;
  clearRoutePreview();
  renderSkeletonOverlay();
  updateFooterChips();
  setStatus(`已新增第 ${state.skeleton.lines.length} 条骨架线。`, 'info');
}

function cancelSkeletonDraft() {
  skeletonDraftPoints = [];
  skeletonHoverPoint = null;
  renderSkeletonOverlay();
}

function getAllSnapCandidates() {
  return [
    ...state.skeleton.lines.flatMap((line) => line.points),
    ...skeletonDraftPoints,
    ...state.roadEndNodes,
  ];
}

function snapPointToSkeleton(point) {
  const radius = state.routeConfig.skeletonSnapRadiusPx;
  let best = null;
  let bestDistance = radius;
  for (const candidate of getAllSnapCandidates()) {
    const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
    if (distance <= bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best ? { x: best.x, y: best.y } : point;
}

function distancePointToSegment(point, from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = (dx * dx) + (dy * dy);
  if (lengthSquared === 0) {
    return Math.hypot(point.x - from.x, point.y - from.y);
  }
  const t = clamp((((point.x - from.x) * dx) + ((point.y - from.y) * dy)) / lengthSquared, 0, 1);
  const projection = { x: from.x + dx * t, y: from.y + dy * t };
  return Math.hypot(point.x - projection.x, point.y - projection.y);
}

function distancePointToPolyline(point, polyline) {
  if (polyline.length === 1) {
    return Math.hypot(point.x - polyline[0].x, point.y - polyline[0].y);
  }
  let best = Number.POSITIVE_INFINITY;
  for (let index = 1; index < polyline.length; index += 1) {
    best = Math.min(best, distancePointToSegment(point, polyline[index - 1], polyline[index]));
  }
  return best;
}

function removeNearestSkeletonLine(point) {
  if (!state.skeleton.lines.length) {
    return;
  }
  let bestIndex = -1;
  let bestDistance = state.routeConfig.skeletonSnapRadiusPx * 1.5;
  state.skeleton.lines.forEach((line, index) => {
    const distance = distancePointToPolyline(point, line.points);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  if (bestIndex >= 0) {
    state.skeleton.lines.splice(bestIndex, 1);
    clearRoutePreview();
    renderSkeletonOverlay();
    updateFooterChips();
  }
}

function addRoadEndNode(point) {
  const snappedPoint = snapPointToSkeleton(point);
  const existing = state.roadEndNodes.find((node) => Math.hypot(node.x - snappedPoint.x, node.y - snappedPoint.y) <= Math.max(2, state.routeConfig.skeletonSnapRadiusPx * 0.55));
  if (existing) {
    return false;
  }

  roadEndSequence += 1;
  state.roadEndNodes.push({
    id: `road-end-${roadEndSequence}`,
    x: Number(snappedPoint.x.toFixed(2)),
    y: Number(snappedPoint.y.toFixed(2)),
  });
  clearRoutePreview();
  renderSkeletonOverlay();
  updateFooterChips();
  return true;
}

function removeNearestRoadEndNode(point) {
  if (!state.roadEndNodes.length) {
    return false;
  }

  let bestIndex = -1;
  let bestDistance = Math.max(8, state.routeConfig.skeletonSnapRadiusPx * 1.15);
  state.roadEndNodes.forEach((node, index) => {
    const distance = Math.hypot(node.x - point.x, node.y - point.y);
    if (distance <= bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });

  if (bestIndex < 0) {
    return false;
  }

  state.roadEndNodes.splice(bestIndex, 1);
  clearRoutePreview();
  renderSkeletonOverlay();
  updateFooterChips();
  return true;
}

function handleMaskPointerDown(event) {
  if (state.activeTool !== 'brush' && state.activeTool !== 'eraser') {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  maskPointerId = event.pointerId;
  refs.maskCanvas.setPointerCapture?.(event.pointerId);
  const point = stagePointToMaskPoint(event.clientX, event.clientY);
  isMaskDrawing = true;
  lastMaskPoint = { x: point.x, y: point.y };
  drawMaskStroke(lastMaskPoint, lastMaskPoint, state.activeTool, state.maskBrushSize);
  clearRoutePreview();
  renderMaskOverlay();
  updateCursorMeta(event.clientX, event.clientY);
}

function handleMaskPointerMove(event) {
  if (state.activeTool !== 'brush' && state.activeTool !== 'eraser') {
    updateCursorMeta(event.clientX, event.clientY);
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  updateCursorMeta(event.clientX, event.clientY);
  if (!isMaskDrawing || event.pointerId !== maskPointerId) {
    return;
  }
  const point = stagePointToMaskPoint(event.clientX, event.clientY);
  const nextPoint = { x: point.x, y: point.y };
  drawMaskStroke(lastMaskPoint, nextPoint, state.activeTool, state.maskBrushSize);
  lastMaskPoint = nextPoint;
  renderMaskOverlay();
}

function stopMaskDrawing() {
  isMaskDrawing = false;
  lastMaskPoint = null;
  maskPointerId = null;
}

function handleImageWheel(event) {
  if (!imageBackgroundElement) {
    return;
  }
  event.preventDefault();
  const stageRect = refs.mapStage.getBoundingClientRect();
  const stagePoint = {
    x: event.clientX - stageRect.left,
    y: event.clientY - stageRect.top,
  };
  const multiplier = Math.exp(-event.deltaY * 0.0012);
  zoomImageViewAt(stagePoint, multiplier);
}

function handleImagePanPointerDown(event) {
  if (state.activeTool !== 'move' || !imageBackgroundElement || event.button !== 0) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  refs.mapView.setPointerCapture?.(event.pointerId);
  imagePanDrag = {
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    baseView: { ...state.imageView },
  };
}

function addScaleCalibrationPoint(point) {
  const nextPoints = state.scaleCalibration.points.length >= 2 ? [] : [...state.scaleCalibration.points];
  nextPoints.push({ x: Number(point.x.toFixed(2)), y: Number(point.y.toFixed(2)) });
  state.scaleCalibration.points = nextPoints;
  if (nextPoints.length >= 2) {
    recomputeMetersPerPixelFromCalibration();
    setStatus('比例尺已更新，后续生成轨迹会按新的米/像素换算距离。', 'info');
  } else {
    updateScaleCalibrationStatus();
    updateUi();
  }
  renderSkeletonOverlay();
}

function handleSkeletonPointerDown(event) {
  if (!['skeleton', 'skeleton-eraser', 'road-end', 'road-end-eraser', 'scale-calibrate'].includes(state.activeTool)) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  skeletonPointerId = event.pointerId;
  refs.skeletonCanvas.setPointerCapture?.(event.pointerId);
  const point = stagePointToMaskPoint(event.clientX, event.clientY);
  if (!point.inside) {
    return;
  }
  if (state.activeTool === 'scale-calibrate') {
    addScaleCalibrationPoint({ x: point.x, y: point.y });
    return;
  }
  if (state.activeTool === 'skeleton-eraser') {
    removeNearestSkeletonLine({ x: point.x, y: point.y });
    return;
  }
  if (state.activeTool === 'road-end') {
    addRoadEndNode({ x: point.x, y: point.y });
    skeletonHoverPoint = null;
    return;
  }
  if (state.activeTool === 'road-end-eraser') {
    removeNearestRoadEndNode({ x: point.x, y: point.y });
    skeletonHoverPoint = null;
    return;
  }
  skeletonDraftPoints = [...skeletonDraftPoints, snapPointToSkeleton({ x: point.x, y: point.y })];
  skeletonHoverPoint = null;
  renderSkeletonOverlay();
  updateFooterChips(getCursorTextFromClient(event.clientX, event.clientY));
}

function handleSkeletonPointerMove(event) {
  updateCursorMeta(event.clientX, event.clientY);
  if (!['skeleton', 'road-end', 'road-end-eraser', 'scale-calibrate'].includes(state.activeTool)) {
    skeletonHoverPoint = null;
    return;
  }
  if (state.activeTool === 'scale-calibrate') {
    return;
  }
  const point = stagePointToMaskPoint(event.clientX, event.clientY);
  skeletonHoverPoint = point.inside ? snapPointToSkeleton({ x: point.x, y: point.y }) : null;
  renderSkeletonOverlay();
}

function handleSkeletonDoubleClick(event) {
  if (state.activeTool !== 'skeleton') {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  if (skeletonDraftPoints.length >= 2) {
    commitSkeletonDraft();
  }
}

function handleWindowPointerMove(event) {
  updateCursorMeta(event.clientX, event.clientY);
  if (imagePanDrag && event.pointerId === imagePanDrag.pointerId) {
    const dx = event.clientX - imagePanDrag.startClientX;
    const dy = event.clientY - imagePanDrag.startClientY;
    setImageView({
      offsetX: imagePanDrag.baseView.offsetX + dx,
      offsetY: imagePanDrag.baseView.offsetY + dy,
    });
    return;
  }
  if (!selectionDrag) {
    return;
  }
  const viewport = getStageViewportSize();
  const dx = event.clientX - selectionDrag.startClientX;
  const dy = event.clientY - selectionDrag.startClientY;
  if (selectionDrag.mode === 'move') {
    state.selection = moveSelection(selectionDrag.baseSelection, dx, dy, viewport.width, viewport.height);
  } else {
    state.selection = resizeSelectionFromCorner(selectionDrag.baseSelection, dx, dy, viewport.width, viewport.height);
    resizeMaskBitmapToSelection(true);
  }
  state.imageView = clampImageViewToProtectedArea(state.imageView);
  applyImageBackgroundView();
  renderSelectionBox();
  renderMaskOverlay();
  renderSkeletonOverlay();
  renderRouteOverlay();
  updateFooterChips(getCursorTextFromClient(event.clientX, event.clientY));
}

function handleWindowPointerUp() {
  selectionDrag = null;
  imagePanDrag = null;
  stopMaskDrawing();
  skeletonPointerId = null;
}

function handleWindowKeydown(event) {
  const tagName = event.target?.tagName?.toLowerCase();
  if (['input', 'textarea', 'select'].includes(tagName)) {
    return;
  }
  if (state.activeTool !== 'skeleton') {
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    commitSkeletonDraft();
  } else if (event.key === 'Escape') {
    event.preventDefault();
    cancelSkeletonDraft();
  } else if ((event.key === 'Backspace' || event.key === 'Delete') && skeletonDraftPoints.length) {
    event.preventDefault();
    skeletonDraftPoints = skeletonDraftPoints.slice(0, -1);
    renderSkeletonOverlay();
  }
}
function bindSelectionInteractions() {
  refs.selectionBox.addEventListener('pointerdown', (event) => {
    if (state.activeTool !== 'move' || event.target === refs.selectionHandle) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    selectionDrag = {
      mode: 'move',
      startClientX: event.clientX,
      startClientY: event.clientY,
      baseSelection: { ...state.selection },
    };
  });

  refs.selectionHandle.addEventListener('pointerdown', (event) => {
    if (state.activeTool !== 'move') {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    selectionDrag = {
      mode: 'resize',
      startClientX: event.clientX,
      startClientY: event.clientY,
      baseSelection: { ...state.selection },
    };
  });
}

function bindRouteConfigInput(element, key, min, max) {
  element.addEventListener('change', (event) => {
    state.routeConfig[key] = clamp(asNumber(event.target.value, state.routeConfig[key]), min, max);
    event.target.value = String(state.routeConfig[key]);
  });
}

function bindControls() {
  refs.imageScaleInput.addEventListener('input', (event) => {
    setImageView({ scale: event.target.value });
  });
  refs.imageOffsetXInput.addEventListener('input', (event) => {
    setImageView({ offsetX: event.target.value });
  });
  refs.imageOffsetYInput.addEventListener('input', (event) => {
    setImageView({ offsetY: event.target.value });
  });
  refs.resetImageViewButton.addEventListener('click', () => {
    setImageView(DEFAULT_IMAGE_VIEW);
  });
  refs.resetSelectionButton.addEventListener('click', () => {
    const viewport = getStageViewportSize();
    state.selection = createDefaultSelection(viewport.width, viewport.height);
    resizeMaskBitmapToSelection(true);
    state.imageView = clampImageViewToProtectedArea(state.imageView);
    applyImageBackgroundView();
    renderSelectionBox();
    renderMaskOverlay();
    renderSkeletonOverlay();
    renderRouteOverlay();
    updateFooterChips();
  });

  refs.toolButtons.forEach((button) => button.addEventListener('click', () => setActiveTool(button.dataset.tool)));
  refs.brushSizeInput.addEventListener('input', (event) => {
    state.maskBrushSize = clamp(asNumber(event.target.value, 18), 6, 48);
    refs.brushSizeValue.textContent = `${state.maskBrushSize}px`;
  });
  refs.toggleMask.addEventListener('change', (event) => { state.showMaskOverlay = event.target.checked; renderMaskOverlay(); });
  refs.toggleSkeleton.addEventListener('change', (event) => { state.showSkeletonOverlay = event.target.checked; renderSkeletonOverlay(); });
  refs.toggleSkeletonSnapRanges.addEventListener('change', (event) => {
    state.showSkeletonSnapRanges = event.target.checked;
    renderSkeletonOverlay();
  });
    refs.toggleRoute.addEventListener('change', (event) => { state.showRouteOverlay = event.target.checked; renderRouteOverlay(); });
  refs.clearMaskButton.addEventListener('click', () => {
    if (!maskBitmapCtx) return;
    maskBitmapCtx.clearRect(0, 0, maskBitmapCanvas.width, maskBitmapCanvas.height);
    clearRoutePreview();
    renderMaskOverlay();
  });
  refs.deleteLastSkeletonButton.addEventListener('click', () => {
    if (skeletonDraftPoints.length) {
      skeletonDraftPoints = skeletonDraftPoints.slice(0, -1);
    } else {
      state.skeleton.lines = state.skeleton.lines.slice(0, -1);
    }
    clearRoutePreview();
    renderSkeletonOverlay();
    updateFooterChips();
  });
    refs.clearSkeletonButton.addEventListener('click', () => {
      state.skeleton.lines = [];
      skeletonDraftPoints = [];
      skeletonHoverPoint = null;
      clearRoutePreview();
      renderSkeletonOverlay();
      updateFooterChips();
    });
    refs.clearRoadEndsButton.addEventListener('click', () => {
      state.roadEndNodes = [];
      clearRoutePreview();
      renderSkeletonOverlay();
      updateFooterChips();
    });
  refs.exportMaskButton.addEventListener('click', () => {
    if (!maskBitmapCanvas) return;
    maskBitmapCanvas.toBlob((blob) => { if (blob) downloadBlob(blob, buildExportName('mask', 'png')); }, 'image/png');
  });
  refs.scaleDistanceInput.addEventListener('change', (event) => {
    state.scaleCalibration.distanceMeters = clamp(asNumber(event.target.value, state.scaleCalibration.distanceMeters), 0.1, 100000);
    recomputeMetersPerPixelFromCalibration();
    renderSkeletonOverlay();
  });
  refs.metersPerPixelInput.addEventListener('change', (event) => {
    state.routeConfig.metersPerPixel = clamp(asNumber(event.target.value, state.routeConfig.metersPerPixel), 0.001, 1000);
    const pixelDistance = getCalibrationPixelDistance();
    if (pixelDistance > 0) {
      state.scaleCalibration.distanceMeters = Number((state.routeConfig.metersPerPixel * pixelDistance).toFixed(3));
    }
    clearRoutePreview();
    updateUi();
    renderSkeletonOverlay();
  });
  refs.clearScaleCalibrationButton.addEventListener('click', () => {
    state.scaleCalibration.points = [];
    clearRoutePreview();
    updateUi();
    renderSkeletonOverlay();
  });

  bindRouteConfigInput(refs.targetDistanceInput, 'targetDistanceKm', 0.2, 50);
  bindRouteConfigInput(refs.loopBiasInput, 'loopBias', 0, 1);
  bindRouteConfigInput(refs.stepPxInput, 'stepPx', 2, 24);
  bindRouteConfigInput(refs.smoothingWindowInput, 'smoothingWindow', 1, 25);
  bindRouteConfigInput(refs.jitterInput, 'jitterAmplitudePx', 0, 20);
  bindRouteConfigInput(refs.previewShiftInput, 'previewShiftPx', 0, 80);
  bindRouteConfigInput(refs.snapRadiusInput, 'skeletonSnapRadiusPx', 4, 36);
  bindRouteConfigInput(refs.closeLoopRadiusInput, 'closeLoopSnapRadiusPx', 4, 48);
  bindRouteConfigInput(refs.intersectionRadiusInput, 'intersectionSnapRadiusPx', 4, 36);
  bindRouteConfigInput(refs.followBiasInput, 'skeletonFollowBias', 0, 2);
  bindRouteConfigInput(refs.branchPenaltyInput, 'branchSwitchPenalty', 0, 3);
  bindRouteConfigInput(refs.deadEndPenaltyInput, 'deadEndPenalty', 0, 4);
  bindRouteConfigInput(refs.maskFallbackBiasInput, 'maskFallbackBias', 0, 1);
  bindRouteConfigInput(refs.cycleExitPenaltyInput, 'cycleExitPenalty', 0, 4);
  bindRouteConfigInput(refs.minLoopCoverageInput, 'minLoopCoverage', 0, 1);
  bindRouteConfigInput(refs.turnaroundAmplitudeInput, 'turnaroundAmplitudePx', 0, 30);
  refs.seedInput.addEventListener('change', (event) => { state.routeConfig.seed = event.target.value.trim(); });

  refs.generateRouteButton.addEventListener('click', handleGenerateRoute);
  refs.clearRouteButton.addEventListener('click', clearRoutePreview);
  refs.toggleExportSkeleton.addEventListener('change', (event) => { state.exportPreviewWithSkeleton = event.target.checked; });
  refs.exportProjectButton.addEventListener('click', () => { void exportProjectJson(); });
  refs.importProjectButton.addEventListener('click', () => refs.importProjectInput.click());
  refs.importProjectInput.addEventListener('change', (event) => { void importProjectJson(event); });
  refs.exportPreviewButton.addEventListener('click', () => { void exportPreviewPng(); });
  refs.applyToPosterButton.addEventListener('click', () => { void applyToPoster(); });
  refs.backgroundImageUpload.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) {
      void handleImageBackgroundUpload(file);
    }
  });

  refs.maskCanvas.addEventListener('pointerdown', handleMaskPointerDown);
  refs.maskCanvas.addEventListener('pointermove', handleMaskPointerMove);
  refs.maskCanvas.addEventListener('pointerup', stopMaskDrawing);
  refs.maskCanvas.addEventListener('pointerleave', stopMaskDrawing);
  refs.maskCanvas.addEventListener('pointercancel', stopMaskDrawing);
  refs.mapStage.addEventListener('wheel', handleImageWheel, { passive: false });
  refs.mapView.addEventListener('pointerdown', handleImagePanPointerDown);
  refs.skeletonCanvas.addEventListener('pointerdown', handleSkeletonPointerDown);
  refs.skeletonCanvas.addEventListener('pointermove', handleSkeletonPointerMove);
  refs.skeletonCanvas.addEventListener('dblclick', handleSkeletonDoubleClick);
  bindSelectionInteractions();
  window.addEventListener('pointermove', handleWindowPointerMove);
  window.addEventListener('pointerup', handleWindowPointerUp);
  window.addEventListener('keydown', handleWindowKeydown);
  window.addEventListener('resize', syncStageSize);
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function setImageBackground(dataUrl, name = '图片底图') {
  if (!dataUrl) {
    imageBackgroundElement = null;
    state.imageBackground = { dataUrl: null, name: '', width: 0, height: 0 };
    state.imageView = { ...DEFAULT_IMAGE_VIEW };
    return;
  }

  const image = await loadImageElement(dataUrl);
  imageBackgroundElement = image;
  state.imageBackground = {
    dataUrl,
    name,
    width: image.naturalWidth || image.width,
    height: image.naturalHeight || image.height,
  };
  state.imageView = clampImageViewToProtectedArea(DEFAULT_IMAGE_VIEW);
  applyImageBackgroundView();
}

async function handleImageBackgroundUpload(file) {
  try {
    const dataUrl = await fileToDataUrl(file);
    await setImageBackground(dataUrl, file.name);
    state.backgroundMode = 'image';
    updateUi();
    await renderMap();
    setStatus(`图片底图已载入：${file.name}`, 'info');
  } catch (error) {
    console.error(error);
    setStatus('图片底图载入失败。', 'error');
  }
}

function renderImageBackground() {
  refs.mapView.innerHTML = state.imageBackground.dataUrl
    ? ''
    : '<div class="tm-image-placeholder">上传图片底图，或从主页面打开时自动带入当前底图。</div>';
  refs.mapView.style.backgroundImage = state.imageBackground.dataUrl ? `url("${state.imageBackground.dataUrl}")` : '';
  refs.mapView.style.backgroundRepeat = 'no-repeat';
  applyImageBackgroundView();
  setStatus(state.imageBackground.dataUrl ? `图片底图已加载：${state.imageBackground.name || '图片底图'}` : '当前是图片底图模式，请上传底图或从主页面打开。', state.imageBackground.dataUrl ? 'info' : 'warn');
}

async function renderMap() {
  renderImageBackground();
  updateMapMeta();
}

function handleGenerateRoute() {
  if (!maskBitmapCtx) {
    return;
  }
  try {
    syncStateFromMapInstance({ updateUi: true });
    const imageData = maskBitmapCtx.getImageData(0, 0, state.maskSize.width, state.maskSize.height);
    const effectiveSeed = state.routeConfig.seed || createRandomRouteSeed();
    const route = generateMaskConstrainedRoute({
      imageData,
      width: state.maskSize.width,
      height: state.maskSize.height,
      targetDistanceKm: state.routeConfig.targetDistanceKm,
      seed: effectiveSeed,
      loopBias: state.routeConfig.loopBias,
      stepPx: state.routeConfig.stepPx,
      smoothingWindow: state.routeConfig.smoothingWindow,
      jitterAmplitudePx: state.routeConfig.jitterAmplitudePx,
      latitude: state.center.lat,
      zoom: state.zoom,
      metersPerPixel: state.routeConfig.metersPerPixel,
      skeleton: state.skeleton,
      roadEndNodes: state.roadEndNodes,
      skeletonSnapRadiusPx: state.routeConfig.skeletonSnapRadiusPx,
      closeLoopSnapRadiusPx: state.routeConfig.closeLoopSnapRadiusPx,
      intersectionSnapRadiusPx: state.routeConfig.intersectionSnapRadiusPx,
      skeletonFollowBias: state.routeConfig.skeletonFollowBias,
      branchSwitchPenalty: state.routeConfig.branchSwitchPenalty,
      deadEndPenalty: state.routeConfig.deadEndPenalty,
      maskFallbackBias: state.routeConfig.maskFallbackBias,
      cycleExitPenalty: state.routeConfig.cycleExitPenalty,
      minLoopCoverage: state.routeConfig.minLoopCoverage,
      turnaroundAmplitudePx: state.routeConfig.turnaroundAmplitudePx,
    });
    state.routePreview = {
      points: route.points,
      totalDistancePx: route.totalDistancePx,
      estimatedDistanceKm: route.estimatedDistanceKm,
      metersPerPixel: route.metersPerPixel,
      strategy: route.strategy,
      seed: effectiveSeed,
    };
    renderRouteOverlay();
    updateFooterChips();
    const randomSeedText = state.routeConfig.seed ? '' : ` / 随机种子：${effectiveSeed}`;
    setStatus(`轨迹生成完成：${route.estimatedDistanceKm.toFixed(2)} km / ${STRATEGY_LABELS[route.strategy] ?? route.strategy}${randomSeedText}`, 'info');
  } catch (error) {
    console.error(error);
    setStatus(error.message || '轨迹生成失败，请检查掩码和骨架是否连贯。', 'error');
  }
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function buildExportName(prefix, extension) {
  const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
  return `${prefix}-${stamp}.${extension}`;
}

function createRandomRouteSeed() {
  const randomPart = Math.random().toString(36).slice(2, 10);
  const timePart = Date.now().toString(36);
  return `route-${timePart}-${randomPart}`;
}

async function exportProjectJson() {
  const payload = await buildProjectPayload({ requirePosterOutput: false });
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  downloadBlob(blob, buildExportName('route-lab', 'json'));
}

async function loadMaskDataUrl(dataUrl) {
  if (!dataUrl) {
    return;
  }
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  maskBitmapCtx.clearRect(0, 0, state.maskSize.width, state.maskSize.height);
  maskBitmapCtx.drawImage(image, 0, 0, state.maskSize.width, state.maskSize.height);
}

async function importProjectJson(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }
  try {
    const text = await file.text();
    await restoreProjectPayload(JSON.parse(text));
    setStatus('项目 JSON 已导入。', 'info');
  } catch (error) {
    console.error(error);
    setStatus(`导入项目失败：${error.message}`, 'error');
  } finally {
    refs.importProjectInput.value = '';
  }
}

async function restoreProjectPayload(payload) {
  const viewport = getStageViewportSize();
  const restored = deserializeLabProject(payload, viewport.width, viewport.height);
  state.placeLabel = restored.map.placeLabel;
  state.placeKeyword = restored.map.placeKeyword;
  state.center = restored.map.center;
  state.zoom = restored.map.zoom;
  state.pitch = restored.map.pitch;
  state.rotation = restored.map.rotation;
  state.stylePresetId = restored.map.stylePresetId;
  state.selection = restored.selection;
  state.maskSize = { width: restored.mask.width, height: restored.mask.height };
  state.routeConfig = restored.routeConfig;
  state.scaleCalibration = restored.scaleCalibration ?? { points: [], distanceMeters: 100 };
  state.routePreview = restored.routePreview;
  state.skeleton = restored.skeleton;
  state.roadEndNodes = restored.roadEndNodes;
  if (restored.background?.sourceType === 'image') {
    state.backgroundMode = 'image';
    await setImageBackground(restored.background.dataUrl, restored.background.name);
    state.imageView = clampImageViewToProtectedArea(restored.background.view);
    applyImageBackgroundView();
  } else {
    state.backgroundMode = 'image';
    await setImageBackground(null);
    setStatus('这个项目没有内置图片底图，请重新上传底图后继续。', 'warn');
  }
  lineSequence = state.skeleton.lines.length;
  roadEndSequence = state.roadEndNodes.length;
  createMaskBitmap(restored.mask.width, restored.mask.height);
  if (restored.mask.dataUrl) {
    await loadMaskDataUrl(restored.mask.dataUrl);
  }
  skeletonDraftPoints = [];
  skeletonHoverPoint = null;
  updateUi();
  syncStageSize();
  await renderMap();
}

function drawStageLayerToCanvas(targetCtx, sourceCanvas, stageRect, selection, destWidth, destHeight) {
  if (!sourceCanvas) {
    return;
  }
  const sourceWidth = sourceCanvas.width || sourceCanvas.naturalWidth || stageRect.width;
  const sourceHeight = sourceCanvas.height || sourceCanvas.naturalHeight || stageRect.height;
  if (!sourceWidth || !sourceHeight) {
    return;
  }
  const elementRect = typeof sourceCanvas.getBoundingClientRect === 'function'
    ? sourceCanvas.getBoundingClientRect()
    : null;
  const stageLeft = Number(stageRect.left) || 0;
  const stageTop = Number(stageRect.top) || 0;
  const elementX = elementRect ? elementRect.left - stageLeft : 0;
  const elementY = elementRect ? elementRect.top - stageTop : 0;
  const elementWidth = elementRect?.width || stageRect.width || sourceWidth;
  const elementHeight = elementRect?.height || stageRect.height || sourceHeight;
  const destScaleX = destWidth / selection.width;
  const destScaleY = destHeight / selection.height;
  targetCtx.drawImage(
    sourceCanvas,
    (elementX - selection.x) * destScaleX,
    (elementY - selection.y) * destScaleY,
    elementWidth * destScaleX,
    elementHeight * destScaleY,
  );
}

function computePointBounds(points = []) {
  if (!points.length) {
    return null;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  points.forEach((point) => {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  });

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
    minX,
    minY,
    maxX,
    maxY,
  };
}

function getCaptureGeometry(paddingPx = CAPTURE_PADDING_PX) {
  const scaleX = state.selection.width / Math.max(1, state.maskSize.width);
  const scaleY = state.selection.height / Math.max(1, state.maskSize.height);
  const stagePaddingX = paddingPx * scaleX;
  const stagePaddingY = paddingPx * scaleY;
  return {
    paddingPx,
    outputWidth: state.maskSize.width + paddingPx * 2,
    outputHeight: state.maskSize.height + paddingPx * 2,
    stageSelection: {
      x: state.selection.x - stagePaddingX,
      y: state.selection.y - stagePaddingY,
      width: state.selection.width + stagePaddingX * 2,
      height: state.selection.height + stagePaddingY * 2,
    },
  };
}

function drawImageBackgroundCapture(ctx, geometry) {
  if (!imageBackgroundElement) {
    throw new Error('图片底图模式下还没有载入图片。');
  }

  const drawRect = computeImageDrawRect();
  if (!drawRect) {
    throw new Error('图片底图视图计算失败。');
  }
  const destScaleX = geometry.outputWidth / geometry.stageSelection.width;
  const destScaleY = geometry.outputHeight / geometry.stageSelection.height;

  ctx.drawImage(
    imageBackgroundElement,
    (drawRect.x - geometry.stageSelection.x) * destScaleX,
    (drawRect.y - geometry.stageSelection.y) * destScaleY,
    drawRect.width * destScaleX,
    drawRect.height * destScaleY,
  );
  return true;
}

function captureBaseMapDataUrl(paddingPx = CAPTURE_PADDING_PX) {
  const geometry = getCaptureGeometry(paddingPx);
  const canvas = document.createElement('canvas');
  canvas.width = geometry.outputWidth;
  canvas.height = geometry.outputHeight;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  let capturedBase = false;
  capturedBase = drawImageBackgroundCapture(ctx, geometry);

  return {
    dataUrl: canvas.toDataURL('image/png'),
    width: canvas.width,
    height: canvas.height,
    paddingPx,
    capturedBase,
    captureSource: 'image-background',
  };
}

function createPosterRouteLayer(paddingPx = CAPTURE_PADDING_PX, outputWidth, outputHeight) {
  if (!state.routePreview?.points?.length) {
    return null;
  }

  const points = state.routePreview.points.map((point) => ({
    x: Number((point.x + paddingPx).toFixed(2)),
    y: Number((point.y + paddingPx).toFixed(2)),
  }));

  return {
    enabled: true,
    points,
    width: outputWidth,
    height: outputHeight,
    style: {
      ...DEFAULT_ROUTE_STYLE,
    },
    bbox: computePointBounds(points),
    sourceProjectVersion: 3,
  };
}

function createBackgroundPayload() {
  return {
    sourceType: 'image',
    dataUrl: state.imageBackground.dataUrl,
    width: state.imageBackground.width,
    height: state.imageBackground.height,
    name: state.imageBackground.name || '图片底图',
    view: { ...state.imageView },
  };
}

async function createPosterOutput(options = {}) {
  if (!state.routePreview?.points?.length) {
    if (options.required) {
      throw new Error('请先生成轨迹，再应用到主页面。');
    }
    return null;
  }

  let baseMap = null;
  try {
    baseMap = captureBaseMapDataUrl(CAPTURE_PADDING_PX);
  } catch (error) {
    console.warn('图片底图固化失败。', error);
    if (options.required) {
      throw new Error(`图片底图固化失败：${error.message || '请先上传图片底图'}。`);
    }
  }

  const outputWidth = baseMap?.width ?? state.maskSize.width;
  const outputHeight = baseMap?.height ?? state.maskSize.height;
  const paddingPx = baseMap?.paddingPx ?? 0;
  const routeLayer = createPosterRouteLayer(paddingPx, outputWidth, outputHeight);
  return {
    mapImageDataUrl: baseMap?.dataUrl ?? null,
    mapImageWidth: outputWidth,
    mapImageHeight: outputHeight,
    capturePaddingPx: paddingPx,
    mapImageCaptureError: baseMap ? null : 'base-map-capture-failed',
    mapImageCaptureSource: baseMap?.captureSource ?? null,
    routeLayer,
  };
}

async function buildProjectPayload(options = {}) {
  syncStateFromMapInstance({ updateUi: true });
  let posterOutput = null;
  try {
    posterOutput = await createPosterOutput({
      required: options.requirePosterOutput,
      allowScreenCaptureFallback: options.allowScreenCaptureFallback,
    });
  } catch (error) {
    if (options.requirePosterOutput) {
      throw error;
    }
    console.warn('生成 posterOutput 失败，本次只导出实验项目数据。', error);
  }

  return serializeLabProject(state, {
    background: createBackgroundPayload(),
    maskDataUrl: maskBitmapCanvas?.toDataURL('image/png') ?? null,
    posterOutput,
  });
}

async function applyToPoster() {
  try {
    setApplyStatus('正在固化当前显示地图和轨迹数据…', 'info');
    const payload = await buildProjectPayload({
      requirePosterOutput: true,
      allowScreenCaptureFallback: true,
    });
    if (!window.opener) {
      setApplyStatus('当前不是从主页面打开，无法自动应用；请导出 JSON 后在主页面导入。', 'warn');
      return;
    }
    window.opener.postMessage({ type: 'keep-route-lab:apply', payload }, window.location.origin);
    setApplyStatus('已发送到主页面。', 'info');
  } catch (error) {
    console.error(error);
    setApplyStatus(error.message || '应用到主页面失败。', 'error');
  }
}

async function exportPreviewPng() {
  syncStateFromMapInstance({ updateUi: true });
  const size = getSelectionPixelSize(state.selection);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  let capturedBase = false;
  try {
    drawImageBackgroundCapture(ctx, {
      outputWidth: canvas.width,
      outputHeight: canvas.height,
      stageSelection: state.selection,
    });
    capturedBase = true;
  } catch (error) {
    console.warn('导出底图截图失败，已退化为仅导出叠加层。', error);
  }
  if (!capturedBase) {
    ctx.fillStyle = '#f8fbff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  if (state.showMaskOverlay) {
    drawStageLayerToCanvas(ctx, refs.maskCanvas, { width: refs.maskCanvas.width, height: refs.maskCanvas.height }, state.selection, canvas.width, canvas.height);
  }
  if (state.exportPreviewWithSkeleton && state.showSkeletonOverlay) {
    drawStageLayerToCanvas(ctx, refs.skeletonCanvas, { width: refs.skeletonCanvas.width, height: refs.skeletonCanvas.height }, state.selection, canvas.width, canvas.height);
  }
  if (state.showRouteOverlay) {
    drawStageLayerToCanvas(ctx, refs.routeCanvas, { width: refs.routeCanvas.width, height: refs.routeCanvas.height }, state.selection, canvas.width, canvas.height);
  }
  canvas.toBlob((blob) => {
    if (!blob) return;
    downloadBlob(blob, buildExportName('route-preview', 'png'));
    setStatus(capturedBase ? '实验预览 PNG 已导出。' : '实验预览 PNG 已导出（本次未抓到底图，只导出了叠加层）。', capturedBase ? 'info' : 'warn');
  }, 'image/png');
}

function initializeStateAndStage() {
  const viewport = getStageViewportSize();
  state.selection = createDefaultSelection(viewport.width, viewport.height);
  state.maskSize = getSelectionPixelSize(state.selection);
  createMaskBitmap(state.maskSize.width, state.maskSize.height);
}

async function initialize() {
  const app = document.getElementById('app');
  app.innerHTML = renderShell();
  cacheDom();
  initializeStateAndStage();
  bindControls();
  updateUi();
  syncStageSize();
  setActiveTool(state.activeTool);
  renderMaskOverlay();
  renderSkeletonOverlay();
  renderRouteOverlay();
  await renderMap();
  if (IS_POSTER_CHILD && window.opener) {
    window.opener.postMessage({ type: 'keep-route-lab:ready' }, window.location.origin);
  }
}

window.addEventListener('message', (event) => {
  if (event.origin !== window.location.origin || event.data?.type !== 'keep-route-lab:init') {
    return;
  }

  const payload = event.data.payload ?? {};
  (async () => {
    try {
      if (payload.routeProject) {
        await restoreProjectPayload(payload.routeProject);
      } else if (payload.background?.dataUrl) {
        await setImageBackground(payload.background.dataUrl, payload.background.name ?? '主页面底图');
        state.backgroundMode = 'image';
        updateUi();
        await renderMap();
      }
      setStatus(payload.routeProject || payload.background?.dataUrl ? '已接收主页面当前数据。' : '主页面没有可传入的底图，请在这里上传图片底图。', payload.routeProject || payload.background?.dataUrl ? 'info' : 'warn');
    } catch (error) {
      console.error(error);
      setStatus(`接收主页面数据失败：${error.message}`, 'error');
    }
  })();
});

void initialize();
