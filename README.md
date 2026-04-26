# keep_web_app

Keep 风格运动截图生成 Web 项目。项目主体是一个独立的 **Vite + 原生 JavaScript + Canvas** 前端，可在浏览器本地实时渲染，也可通过 **Cloudflare Workers Static Assets** 部署。

> 仓库不提交个人头像、个人底图、个人轨迹 JSON、API Key 或部署密码。全站默认底图/轨迹通过部署后的管理员面板上传到 Cloudflare KV。

## 当前能力

- 左侧控制台 + 右侧实时 Canvas 预览。
- 单一 Canvas 渲染管线，预览和导出 PNG 共用同一套 renderer。
- 支持头像、昵称、时间、地点、天气、运动数据等字段编辑。
- 支持和风天气自动获取；未配置天气 key 时仍可手填。
- 支持一键重 roll：电量、时间段、散步距离（默认 2.3-4.0 km）、步数、消耗、心率、爬升、负荷、轨迹和地图视角联动生成；距离不再按固定时速从时长推导。
- 支持手填保护：用户手动改过的字段不会被自动天气或一键重 roll 覆盖，可一键清除保护。
- 支持多套手机状态栏预设，时间和电量可编辑。
- 支持上传图片底图，也支持导入轨迹实验页导出的 v3 JSON。
- 支持路线绘制层：轨迹线、速度感渐变、起终点标记、地图视角重 roll、轨迹重 roll。
- 独立轨迹实验页：上传底图、框选地图区域、绘制掩码、绘制骨架/端点、生成并导出轨迹项目 JSON。
- 本地持久化：`localStorage` 保存表单状态，`IndexedDB` 保存头像、底图、轨迹项目等大对象。
- Worker API：站点访问密码、天气代理、管理员默认轨迹项目 KV 存储。
- GitHub Actions + Cloudflare Workers 部署配置。

## 项目结构

```text
keep_web_app/
  src/
    main.js                  # 主截图控制台入口
    worker.js                # Cloudflare Worker 入口、站点登录、天气和管理员 API
    config/                  # 默认值与重 roll 配置
    render/                  # Canvas 渲染、布局、状态栏、轨迹样式
    routeLab/                # 独立轨迹实验页
    state/                   # 默认状态、序列化、重 roll、localStorage/IndexedDB 持久化
    ui/                      # 主页面模板与表单绑定
  public/assets/             # 可公开的模板/字体/图标素材
  tests/                     # Node test 单元测试
  .github/workflows/         # GitHub Actions 部署流程
```

## 本地开发

```bash
cd keep_web_app
npm install
npm run dev
```

Vite dev server 会在终端输出访问地址，通常是：

```text
http://127.0.0.1:5173
```

轨迹实验页：

```text
http://127.0.0.1:5173/route-lab.html
```

如果要本地测试 Worker API、站点密码、天气代理或 KV 相关接口，需要配置 `wrangler.jsonc` 的 KV id 后运行：

```bash
npm run cf:dev
```

本地试用和风天气时，在 `keep_web_app/.dev.vars` 写入运行时变量：

```env
QWEATHER_API_KEY=你的和风天气 API KEY
QWEATHER_API_HOST=https://你的专属APIHost.qweatherapi.com
QWEATHER_AUTH_TYPE=apikey
```

`QWEATHER_API_HOST` 建议使用和风天气控制台里显示的专属 API Host，例如 `xxxx.re.qweatherapi.com`。如果只写 host 不带 `https://`，Worker 会自动补全。旧公共域名 `https://api.qweather.com` 仍作为兜底默认值，但不建议继续依赖。

## 校验

```bash
npm test
npm run build
```

也可以一次性执行：

```bash
npm run check
```

## 轨迹 JSON 与底图绑定关系

轨迹实验页导出的 v3 JSON 已经包含底图和轨迹：

- `posterOutput.mapImageDataUrl`：主页面直接使用的固化底图。
- `posterOutput.routeLayer`：主页面直接绘制的轨迹层。
- `background.dataUrl`：原始图片底图兜底。
- `mask / skeleton / roadEndNodes / routeConfig / routePreview`：后续重 roll 轨迹所需数据。

因此：**从轨迹实验页导出 v3 JSON，再在主页面导入，就可以恢复对应底图和轨迹。**

## 管理员默认轨迹项目（Cloudflare KV）

`DEFAULT_ROUTE_PROJECT_URL` 方案已废弃。全站默认底图/轨迹由管理员在网页内上传，并保存到 Cloudflare KV。

使用流程：

1. 部署后打开主页面。
2. 连续点击头像上传区域 7 次，打开隐藏管理员面板。
3. 输入管理员密码登录。
4. 上传轨迹实验页导出的 v3 JSON。
5. 点击“保存为全站默认”。
6. 新用户首次打开页面时，会从 Worker KV 自动拉取这个默认项目。

普通用户数据不会上传到 Worker，包括：头像、昵称、地点、手填字段、用户自己的本地导入项目等。这些只保存在用户浏览器的 `localStorage` 和 `IndexedDB`。

## Cloudflare Workers 部署

### 1. 创建 KV namespace

```bash
npx wrangler kv namespace create DEFAULTS_KV
npx wrangler kv namespace create DEFAULTS_KV --preview
```

本地部署时，把返回的 namespace id 填入 `wrangler.jsonc`：

```jsonc
"kv_namespaces": [
  {
    "binding": "DEFAULTS_KV",
    "id": "your DEFAULTS_KV id",
    "preview_id": "your DEFAULTS_KV preview id"
  }
]
```

### 2. 配置 Worker secrets

管理员密码建议必配：

```bash
npx wrangler secret put ADMIN_PASSWORD
```

可选：

```bash
npx wrangler secret put APP_PASSWORD
npx wrangler secret put QWEATHER_API_KEY
npx wrangler secret put QWEATHER_API_HOST
npx wrangler secret put QWEATHER_AUTH_TYPE
```

说明：

- `ADMIN_PASSWORD`：管理员默认轨迹项目上传密码。
- `APP_PASSWORD`：站点访问密码；不配置则公开访问。
- `QWEATHER_API_KEY`：和风天气 API KEY 或 JWT；默认按 API KEY 方式发送。
- `QWEATHER_API_HOST`：和风天气 API Host，建议使用控制台里的专属 `*.qweatherapi.com` 地址；默认兜底为 `https://api.qweather.com`。
- `QWEATHER_AUTH_TYPE`：可选，默认 `apikey`，如果 `QWEATHER_API_KEY` 填的是 JWT，可设为 `jwt`。

天气接口有全局限速：

- 每分钟最多 5 次。
- 每天最多 700 次。
- 计数使用 Cloudflare KV，按北京时间日期/分钟分桶。

### 3. 部署

```bash
npm run build
npx wrangler deploy
```

也可以使用：

```bash
npm run deploy
```

### 4. GitHub Actions 一键部署

仓库 Secrets 需要配置：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `DEFAULTS_KV_NAMESPACE_ID`
- `ADMIN_PASSWORD`

推荐/可选：

- `DEFAULTS_KV_PREVIEW_NAMESPACE_ID`
- `APP_PASSWORD`
- `QWEATHER_API_KEY`
- `QWEATHER_API_HOST`
- `QWEATHER_AUTH_TYPE`

然后推送到 `main` 或手动运行 `Deploy to Cloudflare Workers` workflow。


## 参考与借鉴

本项目的代码结构、渲染和轨迹实验模块是当前仓库内重新实现的 Vite/Canvas 版本。视觉与交互目标参考过以下开源/公开项目的页面效果和思路：

- [Carzit/KeepSultan](https://github.com/Carzit/KeepSultan)
- [eltsen00/KeepGeneration-Web](https://github.com/eltsen00/KeepGeneration-Web)
- [itrfcn/KeepSultan-Web](https://github.com/itrfcn/KeepSultan-Web)

主要借鉴点：Keep 风格截图的版式、模板合成思路、表单分组体验、以及“底图 + 掩码/路径图”生成轨迹的工作流。当前项目不再依赖这些仓库运行；如后续直接复制其代码或素材，需要按对应仓库许可证继续补充版权声明。
