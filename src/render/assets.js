import { getAssetBlob } from '../state/persistence.js';
import { STATUS_BAR_PRESETS } from './statusBarPresets.js';

export const BUILTIN_BACKGROUNDS = [];

const TEMPLATE_SRC = '/assets/images/poster-template.png';
const DEFAULT_AVATAR_SRC = '/assets/images/avatar-default.png';
const WALK_ICON_SRC = '/assets/images/icon-walk.png';
const PRIVACY_BADGE_SRC = '/assets/images/badge-privacy.png';
const AI_BADGE_SRC = '/assets/images/badge-ai.png';
const MAP_CORNER_BADGE_SRC = '/assets/images/badge-map-corner.png';
const DEFAULT_MAP_SRC = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="800" viewBox="0 0 1000 800">
  <rect width="1000" height="800" rx="28" fill="#f7f8f6"/>
  <path d="M0 210h1000M0 410h1000M0 610h1000M190 0v800M390 0v800M590 0v800M790 0v800" stroke="#ffffff" stroke-width="18"/>
  <path d="M0 210h1000M0 410h1000M0 610h1000M190 0v800M390 0v800M590 0v800M790 0v800" stroke="#e6e8e4" stroke-width="3"/>
  <text x="500" y="380" text-anchor="middle" font-family="sans-serif" font-size="34" fill="#9aa3af">Import route JSON or upload map</text>
</svg>
`)}`;
const STATUS_BAR_IMAGE_SRCS = [...new Set(
  Object.values(STATUS_BAR_PRESETS)
    .flatMap((preset) => [preset.cluster?.src, preset.battery?.frameSrc])
    .filter(Boolean),
)];

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

export function createAssetLoader() {
  const imageCache = new Map();
  const objectUrlCache = new Map();

  async function getImageByKey(key, loader) {
    if (!imageCache.has(key)) {
      imageCache.set(key, loader());
    }

    return imageCache.get(key);
  }

  async function getTemplate() {
    return getImageByKey('builtin:template', () => loadImage(TEMPLATE_SRC));
  }

  async function getDefaultAvatar() {
    return getImageByKey('builtin:default-avatar', () => loadImage(DEFAULT_AVATAR_SRC));
  }

  async function getWalkIcon() {
    return getImageByKey('builtin:walk-icon', () => loadImage(WALK_ICON_SRC));
  }

  async function getPrivacyBadge() {
    return getImageByKey('builtin:privacy-badge', () => loadImage(PRIVACY_BADGE_SRC));
  }

  async function getAiBadge() {
    return getImageByKey('builtin:ai-badge', () => loadImage(AI_BADGE_SRC));
  }

  async function getMapCornerBadge() {
    return getImageByKey('builtin:map-corner-badge', () => loadImage(MAP_CORNER_BADGE_SRC));
  }

  async function getStatusBarImage(src) {
    if (!src) {
      return null;
    }

    return getImageByKey(`statusbar:${src}`, () => loadImage(src));
  }

  async function getBuiltinBackground(backgroundId) {
    const selected = BUILTIN_BACKGROUNDS.find((item) => item.id === backgroundId);
    if (!selected) {
      return getImageByKey('builtin:default-map-placeholder', () => loadImage(DEFAULT_MAP_SRC));
    }
    return getImageByKey(`builtin:${selected.id}`, () => loadImage(selected.src));
  }

  async function getUploadedImage(assetId) {
    if (!assetId) {
      return null;
    }

    return getImageByKey(`upload:${assetId}`, async () => {
      const blob = await getAssetBlob(assetId);
      if (!blob) {
        return null;
      }

      const objectUrl = URL.createObjectURL(blob);
      objectUrlCache.set(assetId, objectUrl);
      return loadImage(objectUrl);
    });
  }

  async function preloadCoreAssets() {
    await Promise.all([
      getTemplate(),
      getDefaultAvatar(),
      getWalkIcon(),
      getPrivacyBadge(),
      getAiBadge(),
      getMapCornerBadge(),
      ...STATUS_BAR_IMAGE_SRCS.map((src) => getStatusBarImage(src)),
      getBuiltinBackground(null),
    ]);
  }

  async function resolveRenderAssets(state) {
    const template = await getTemplate();
    const defaultAvatar = await getDefaultAvatar();
    const walkIcon = await getWalkIcon();
    const privacyBadge = await getPrivacyBadge();
    const aiBadge = await getAiBadge();
    const mapCornerBadge = await getMapCornerBadge();
    const builtinBackground = await getBuiltinBackground(state.map.sourceId);
    const statusPreset = STATUS_BAR_PRESETS[state.statusBar?.presetId] ?? Object.values(STATUS_BAR_PRESETS)[0];
    const statusCluster = await getStatusBarImage(statusPreset.cluster?.src);
    const statusBatteryFrame = await getStatusBarImage(statusPreset.battery?.frameSrc);

    let avatar = defaultAvatar;
    if (state.profile.avatarAssetId) {
      avatar = (await getUploadedImage(state.profile.avatarAssetId)) ?? defaultAvatar;
    }

    let mapImage = builtinBackground;
    if (state.map.sourceType === 'upload' && state.map.assetId) {
      mapImage = (await getUploadedImage(state.map.assetId)) ?? builtinBackground;
    } else if (state.map.sourceType === 'builtin') {
      mapImage = builtinBackground;
    }

    return {
      template,
      avatar,
      mapImage,
      walkIcon,
      privacyBadge,
      aiBadge,
      mapCornerBadge,
      statusCluster,
      statusBatteryFrame,
    };
  }

  function dispose() {
    objectUrlCache.forEach((url) => URL.revokeObjectURL(url));
    objectUrlCache.clear();
    imageCache.clear();
  }

  return {
    dispose,
    preloadCoreAssets,
    resolveRenderAssets,
  };
}

export async function ensurePosterFonts() {
  if (!('fonts' in document)) {
    return;
  }

  await Promise.allSettled([
    document.fonts.load('40px SourceHanSans'),
    document.fonts.load('180px QanelasBlack'),
  ]);
}
