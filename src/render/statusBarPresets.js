export const STATUS_BAR_OPTIONS = [ // 控制台可选的状态栏预设列表
  { id: 'preset1', label: '预设1' }, // 预设1
  { id: 'preset2', label: '预设2' }, // 预设2
  { id: 'preset3', label: '预设3' }, // 预设3
  { id: 'preset4', label: '预设4' }, // 预设4
  { id: 'preset5', label: '预设5' }, // 预设5
  { id: 'preset6', label: '预设6' }, // 预设6
  { id: 'preset7', label: '预设7' }, // 预设7
]; 

export const DEFAULT_STATUS_BAR_PRESET = 'preset1'; 

export const STATUS_BAR_COVER = { // 顶部状态栏统一清理覆盖区
  x: 0, // 覆盖区左上角 x
  y: 0, // 覆盖区左上角 y
  width: 1080, // 覆盖区宽度
  height: 80, // 覆盖区高度
}; 

const BASE_TIME_LIGHT = { // 浅色时间样式基线
  y: 30, // 时间顶部 y
  size: 36, // 时间字号
  weight: 700, // 时间字重
  family: 'SourceHanSans', // 时间字体
  color: '#111111', // 时间颜色
}; 

const BASE_TIME_MUTED = { // 灰色时间样式基线
  y: 30, 
  size: 36, 
  weight: 600,
  family: 'SourceHanSans', 
  color: '#5b6066', 
};

const BASE_TIME_DARK = { // 深色时间样式基线
  ...BASE_TIME_MUTED, // 继承灰色时间样式
  y: 17, // 向上微调
  weight: 700, // 字重更粗
  color: '#1f2937', // 颜色更深
}; // 深色时间样式基线结束

const BASE_CLUSTER_TOP = { // 右侧图标组上对齐基线
  y: 8, // 图标组顶部 y
  scale: 1.2, // 图标组缩放比例
}; // 右侧图标组上对齐基线结束

const BASE_CLUSTER_MID = { // 右侧图标组中对齐基线
  y: 10, // 图标组顶部 y
  scale: 1.2, // 图标组缩放比例
}; // 右侧图标组中对齐基线结束

const BASE_CLUSTER_LOW = { // 右侧图标组下移基线
  ...BASE_CLUSTER_MID, // 继承中对齐基线
  y: 12, // 向下微调
}; // 右侧图标组下移基线结束

const BASE_BATTERY_TEXT = { // 电池数字通用文字参数
  textSize: 30, // 电池数字字号
  textWeight: 700, // 电池数字字重
  textFamily: 'SourceHanSans', // 电池数字字体
}; // 电池数字通用文字参数结束

const STANDALONE_PILL_BASE = { // 独立电池胶囊样式基线
  mode: 'fillAndText', // 同时绘制填充和数字
  style: 'standalone-pill', // 电池单独绘制，不嵌在右侧图标组里
  emptyFillColor: '#a3a3a8', // 空槽底色
  fillColor: '#6b7280', // 电量填充色
  textColor: '#ffffff', // 电量数字颜色
  textSize: 23, // 电量数字字号
  textWeight: 700, // 电量数字字重
  textFamily: 'SourceHanSans', // 电量数字字体
}; // 独立电池胶囊样式基线结束

function createTime(base, overrides) { // 合并时间样式和局部差异
  return { ...base, ...overrides }; // 返回时间配置
} // 时间配置工厂结束

function createCluster(base, src, overrides = {}) { // 合并右侧图标组样式和局部差异
  return { // 返回图标组配置
    ...base, // 基线参数
    src, // 素材路径
    ...overrides, // 局部覆盖参数
  }; // 图标组配置结束
} // 图标组工厂结束

function createInsideBattery(config) { // 创建嵌在右侧素材内部的电池配置
  return { // 返回电池配置
    mode: 'fillAndText', // 同时绘制填充和数字
    style: 'inside-cluster', // 电池嵌在右侧图标组内部
    ...BASE_BATTERY_TEXT, // 继承电池数字通用参数
    ...config, // 覆盖局部几何和颜色
  }; // 电池配置结束
} // 内嵌电池工厂结束

function createStandalonePillBattery(config) { // 创建独立电池胶囊配置
  return { // 返回独立电池配置
    ...STANDALONE_PILL_BASE, // 继承独立电池胶囊样式基线
    ...config, // 覆盖位置和遮罩参数
  }; // 独立电池配置结束
} // 独立电池工厂结束

export const STATUS_BAR_PRESETS = { // 状态栏预设总表
  preset1: { // 预设1开始
    id: 'preset1', // 预设 id
    label: '预设1', // 显示名称
    time: createTime(BASE_TIME_LIGHT, { x: 45 }), // 左侧时间配置
    cluster: createCluster(BASE_CLUSTER_TOP, '/assets/images/status/preset1-cluster.png', { x: 750 }), // 右侧图标组配置
    battery: { // 电池配置开始
      mode: 'fillOnly', // 只绘制填充，不绘制数字
      style: 'separate-frame', // 电池框单独绘制
      frameSrc: '/assets/images/status/preset1-battery-frame.png', // 独立电池框素材
      frame: { x: 943, y: 8, scale: 1.2 }, // 电池框位置和缩放
      fillRect: { x: 7, y: 18, width: 46, height: 23, radius: 10 }, // 相对电池框素材的内部填充区域
      emptyFillColor: '#ffffff', // 空槽底色
      fillColor: '#111111', // 电量填充色
    }, // 电池配置结束
  }, // 预设1结束

  preset2: { // 预设2开始
    id: 'preset2', // 预设 id
    label: '预设2', // 显示名称
    time: createTime(BASE_TIME_MUTED, { x: 48 }), // 左侧时间配置
    cluster: createCluster(BASE_CLUSTER_MID, '/assets/images/status/preset2-cluster.png', { x: 760 }), // 右侧图标组配置
    battery: createInsideBattery({ // 电池配置开始
      fillRect: { x: 145, y: 18, width: 44, height: 18, radius: 6 }, // 内部有效填充区域
      textRect: { x: 148, y: 14, width: 36, height: 22 }, // 电量数字重绘区域
      emptyFillColor: '#ffffff', // 空槽底色
      fillColor: '#e5e7eb', // 电量填充色
      textColor: '#565b61', // 电量数字颜色
    }), // 电池配置结束
  }, // 预设2结束

  preset3: { // 预设3开始
    id: 'preset3', // 预设 id
    label: '预设3', // 显示名称
    time: createTime(BASE_TIME_MUTED, { x: 48 }), // 左侧时间配置
    cluster: createCluster(BASE_CLUSTER_MID, '/assets/images/status/preset3-cluster.png', { x: 730 }), // 右侧图标组配置
    battery: createInsideBattery({ // 电池配置开始
      fillRect: { x: 163, y: 13, width: 44, height: 24, radius: 6 }, // 内部有效填充区域
      textRect: { x: 170, y: 13, width: 32, height: 22 }, // 电量数字重绘区域
      emptyFillColor: '#ffffff', // 空槽底色
      fillColor: '#e5e7eb', // 电量填充色
      textColor: '#565b61', // 电量数字颜色
    }), // 电池配置结束
  }, // 预设3结束

  preset4: { // 预设4开始
    id: 'preset4', // 预设 id
    label: '预设4', // 显示名称
    time: createTime(BASE_TIME_DARK, { x: 48 }), // 左侧时间配置
    cluster: createCluster(BASE_CLUSTER_MID, '/assets/images/status/preset4-cluster.png', { x: 730 }), // 右侧图标组配置
    battery: createStandalonePillBattery({ // 电池配置开始
      maskRect: { x: 936, y: 18, width: 66, height: 40, radius: 11 }, // 盖掉原素材内旧电池图标的遮罩区域
      maskColor: '#ffffff', // 遮罩底色
      rect: { x: 938, y: 22, width: 60, height: 33, radius: 11 }, // 电池主体外框区域
      capRect: { x: 997, y: 33, width: 5, height: 11, radius: 2 }, // 电池右侧小帽区域
      fillRect: { x: 938, y: 22, width: 60, height: 33, radius: 11 }, // 电池内部有效填充区域
      textRect: { x: 949, y: 26, width: 36, height: 22 }, // 电量数字重绘区域
    }), // 电池配置结束
  }, // 预设4结束

  preset5: { // 预设5开始
    id: 'preset5', // 预设 id
    label: '预设5', // 显示名称
    time: createTime(BASE_TIME_DARK, { x: 48 }), // 左侧时间配置
    cluster: createCluster(BASE_CLUSTER_MID, '/assets/images/status/preset5-cluster.png', { x: 730 }), // 右侧图标组配置
    battery: createStandalonePillBattery({ // 电池配置开始
      maskRect: { x: 924, y: 23, width: 66, height: 37, radius: 11 }, // 盖掉原素材内旧电池图标的遮罩区域
      maskColor: '#ffffff', // 遮罩底色
      rect: { x: 926, y: 25, width: 60, height: 33, radius: 11 }, // 电池主体外框区域
      capRect: { x: 985, y: 36, width: 5, height: 11, radius: 2 }, // 电池右侧小帽区域
      fillRect: { x: 926, y: 25, width: 60, height: 33, radius: 11 }, // 电池内部有效填充区域
      textRect: { x: 937, y: 29, width: 36, height: 22 }, // 电量数字重绘区域
    }), // 电池配置结束
  }, // 预设5结束

  preset6: { // 预设6开始
    id: 'preset6', // 预设 id
    label: '预设6', // 显示名称
    time: createTime(BASE_TIME_MUTED, { x: 48 }), // 左侧时间配置
    cluster: createCluster(BASE_CLUSTER_LOW, '/assets/images/status/preset6-cluster.png', { x: 750 }), // 右侧图标组配置
    battery: createStandalonePillBattery({ // 电池配置开始
      maskRect: { x: 923, y: 30, width: 66, height: 37, radius: 11 }, // 盖掉原素材内旧电池图标的遮罩区域
      maskColor: '#ffffff', // 遮罩底色
      rect: { x: 925, y: 32, width: 60, height: 33, radius: 11 }, // 电池主体外框区域
      capRect: { x: 984, y: 43, width: 5, height: 11, radius: 2 }, // 电池右侧小帽区域
      fillRect: { x: 925, y: 32, width: 60, height: 33, radius: 11 }, // 电池内部有效填充区域
      textRect: { x: 936, y: 36, width: 36, height: 22 }, // 电量数字重绘区域
    }), // 电池配置结束
  }, // 预设6结束

  preset7: { // 预设7开始
    id: 'preset7', // 预设 id
    label: '预设7', // 显示名称
    time: createTime(BASE_TIME_MUTED, { x: 48 }), // 左侧时间配置
    cluster: createCluster({ ...BASE_CLUSTER_LOW, scale: 1.4 }, '/assets/images/status/preset7-cluster.png', { x: 760 }), // 右侧图标组配置
    battery: createStandalonePillBattery({ // 电池配置开始
      rect: { x: 955, y: 34, width: 60, height: 33, radius: 11 }, // 电池主体外框区域
      capRect: { x: 1014, y: 45, width: 5, height: 11, radius: 2 }, // 电池右侧小帽区域
      fillRect: { x: 955, y: 34, width: 60, height: 33, radius: 11 }, // 电池内部有效填充区域
      textRect: { x: 966, y: 38, width: 36, height: 22 }, // 电量数字重绘区域
    }), // 电池配置结束
  }, // 预设7结束
}; // 状态栏预设表结束

export function getStatusBarPreset(presetId) { // 根据预设 id 取状态栏预设
  return STATUS_BAR_PRESETS[presetId] ?? STATUS_BAR_PRESETS[DEFAULT_STATUS_BAR_PRESET]; // 未命中时回退默认预设
} // 取状态栏预设函数结束

export function clampBatteryLevel(value) { // 把外部输入的电量限制到 0~100
  const parsed = Number(value); // 先尝试转成数字
  if (!Number.isFinite(parsed)) { // 如果不是合法数字
    return 0; // 非法值直接回退 0
  } // 非法值判断结束
  return Math.max(0, Math.min(100, Math.round(parsed))); // 返回 0~100 的整数电量
} // 电量钳制函数结束
