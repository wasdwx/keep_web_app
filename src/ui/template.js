export function renderAppShell(backgrounds, statusBarOptions = []) {
  const statusBarSelectOptions = statusBarOptions
    .map((item) => `<option value="${item.id}">${item.label}</option>`)
    .join('');

  return `
    <div class="app-shell">
      <aside class="control-panel">
        <section class="hero">
          <span class="hero__eyebrow">Web v1 · Canvas 实时渲染</span>
          <h1>Keep 页面截图控制台</h1>
        </section>

        <div class="section-grid">
          <section class="panel-section">
            <div class="panel-section__header">
              <h2>基础信息</h2>
              <span class="chip">资料区</span>
            </div>

            <div class="form-grid form-grid--two">
              <div class="field">
                <label for="nickname">昵称</label>
                <input id="nickname" type="text" data-path="profile.nickname" placeholder="输入昵称" />
              </div>
              <div class="field">
                <label for="sport-label">运动类型</label>
                <input id="sport-label" type="text" data-path="session.sportLabel" placeholder="例如：户外行走" />
              </div>
              <div class="field">
                <label for="date">日期</label>
                <input id="date" type="text" data-path="session.date" placeholder="YYYY/MM/DD" />
              </div>
              <div class="field">
                <label for="location">地点</label>
                <input id="location" type="text" data-path="session.location" placeholder="例如：北京市" />
              </div>
              <div class="field">
                <label for="start-time">开始时间</label>
                <input id="start-time" type="time" data-path="session.startTime" />
              </div>
              <div class="field">
                <label for="end-time">结束时间</label>
                <input id="end-time" type="time" data-path="session.endTime" />
              </div>
              <div class="field">
                <label for="weather">天气</label>
                <input id="weather" type="text" data-path="session.weather" placeholder="晴" />
              </div>
              <div class="field">
                <label for="temperature">温度</label>
                <input id="temperature" type="text" data-path="session.temperature" placeholder="16°C" />
              </div>
            </div>

            <div class="button-row" style="margin-top: 16px;">
              <button class="btn btn--secondary" id="auto-weather" type="button">\u81ea\u52a8\u83b7\u53d6\u5929\u6c14</button>
              <button class="btn btn--secondary" id="clear-manual-locks" type="button">\u6e05\u9664\u624b\u586b\u4fdd\u62a4</button>
            </div>
            <div class="status-text" id="weather-status"></div>
            <div class="status-text" id="locks-status">\u624b\u586b\u4fdd\u62a4\uff1a0 \u9879</div>

            <div class="upload-card" id="avatar-admin-hotspot" style="margin-top: 16px;">
              <div class="field">
                <label for="avatar-upload">头像上传</label>
                <input id="avatar-upload" type="file" accept="image/*" />
                <small>上传后自动写入 IndexedDB，并实时替换左上头像。</small>
              </div>
              <div class="status-text" id="avatar-file-status">当前：默认头像</div>
            </div>

            <div class="admin-panel is-hidden" id="admin-panel">
              <div class="panel-section__header">
                <h2>\u7ba1\u7406\u5458\u6a21\u5f0f</h2>
                <span class="chip">\u5168\u7ad9\u9ed8\u8ba4\u8f68\u8ff9</span>
              </div>
              <p class="panel-section__hint">
                \u4ec5\u4fdd\u5b58\u5168\u7ad9\u9ed8\u8ba4\u5e95\u56fe\u548c\u8f68\u8ff9 JSON\uff0c\u4e0d\u4e0a\u4f20\u666e\u901a\u7528\u6237\u5934\u50cf\u3001\u6635\u79f0\u6216\u5730\u70b9\u3002
              </p>
              <div class="form-grid">
                <div class="field">
                  <label for="admin-password">\u7ba1\u7406\u5458\u5bc6\u7801</label>
                  <input id="admin-password" type="password" autocomplete="current-password" />
                </div>
                <div class="button-row">
                  <button class="btn btn--secondary" id="admin-login" type="button">\u767b\u5f55\u7ba1\u7406\u5458</button>
                  <button class="btn btn--secondary" id="admin-check-default" type="button">\u68c0\u67e5\u9ed8\u8ba4\u9879\u76ee</button>
                </div>
                <div class="field">
                  <label for="admin-route-project-input">\u4e0a\u4f20\u9ed8\u8ba4\u8f68\u8ff9 JSON</label>
                  <input id="admin-route-project-input" type="file" accept="application/json" />
                  <small>\u5fc5\u987b\u662f\u8f68\u8ff9\u5b9e\u9a8c\u9875\u5bfc\u51fa\u7684 v3 JSON\uff0c\u4e14\u81ea\u5e26\u5e95\u56fe\u3002</small>
                </div>
                <div class="button-row">
                  <button class="btn btn--primary" id="admin-save-default" type="button">\u4fdd\u5b58\u4e3a\u5168\u7ad9\u9ed8\u8ba4</button>
                  <button class="btn btn--danger" id="admin-clear-default" type="button">\u5220\u9664\u5168\u7ad9\u9ed8\u8ba4</button>
                </div>
                <div class="status-text" id="admin-status">\u8fde\u7eed\u70b9\u51fb\u5934\u50cf\u533a\u57df 7 \u6b21\u53ef\u6253\u5f00\u672c\u9762\u677f\u3002</div>
              </div>
            </div>
          </section>

          <section class="panel-section">
            <div class="panel-section__header">
              <h2>操作区</h2>
              <span class="chip">导出 / 复位</span>
            </div>

            <div class="action-buttons">
              <div class="action-buttons__primary">
                <button class="btn btn--primary" id="reroll-all" type="button">\u4e00\u952e\u91cd roll</button>
                <button class="btn btn--primary" id="export-png" type="button">导出 PNG</button>
              </div>
              <div class="button-row">
                <button class="btn btn--secondary" id="reset-form" type="button">重置表单</button>
                <button class="btn btn--danger" id="restore-defaults" type="button">恢复默认</button>
              </div>
              <small>
                重置表单：保留当前头像和底图，仅恢复文案与数值。恢复默认：回到内置默认状态。
              </small>
            </div>
          </section>

          <section class="panel-section">
            <div class="panel-section__header">
              <h2>手机状态栏</h2>
              <span class="chip">顶部栏</span>
            </div>

            <p class="panel-section__hint">
              \u5f53\u524d\u4ee5\u8f68\u8ff9 JSON \u81ea\u5e26\u5e95\u56fe\u4e3a\u4e3b\uff0c\u4e5f\u652f\u6301\u624b\u52a8\u4e0a\u4f20\u56fe\u7247\u5e95\u56fe\u540e\u8c03\u6574\u7f29\u653e\u548c\u5e73\u79fb\u3002
            </p>

            <div class="form-grid form-grid--two">
              <div class="field">
                <label for="statusbar-preset">状态栏预设</label>
                <select id="statusbar-preset" data-path="statusBar.presetId">
                  ${statusBarSelectOptions}
                </select>
              </div>
              <div class="field">
                <label for="statusbar-battery">电量百分比</label>
                <input
                  id="statusbar-battery"
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  data-path="statusBar.batteryLevel"
                  data-type="number"
                  placeholder="43"
                />
              </div>
            </div>
          </section>

          <details class="panel-section panel-section--collapsible">
            <summary class="panel-section__header">
              <h2>运动数据</h2>
              <span class="chip">数值区</span>
            </summary>

            <div class="form-grid form-grid--two">
              <div class="field">
                <label for="distance-km">距离（公里）</label>
                <input id="distance-km" type="text" data-path="metrics.distanceKm" placeholder="2.89" />
              </div>
              <div class="field">
                <label for="calories">运动消耗（千卡）</label>
                <input id="calories" type="text" data-path="metrics.calories" placeholder="275" />
              </div>
              <div class="field">
                <label for="sport-duration">训练时长</label>
                <input id="sport-duration" type="text" data-path="metrics.sportDuration" placeholder="00:45:04" />
              </div>
              <div class="field">
                <label for="total-duration">总时长</label>
                <input id="total-duration" type="text" data-path="metrics.totalDuration" placeholder="00:47:04" />
              </div>
              <div class="field">
                <label for="steps">步数</label>
                <input id="steps" type="text" data-path="metrics.steps" placeholder="4091" />
              </div>
              <div class="field">
                <label for="cadence">平均步频</label>
                <input id="cadence" type="text" data-path="metrics.cadence" placeholder="90" />
              </div>
              <div class="field">
                <label for="heart-rate">平均心率</label>
                <input id="heart-rate" type="text" data-path="metrics.heartRate" placeholder="115" />
              </div>
              <div class="field">
                <label for="climb">爬升高度（米）</label>
                <input id="climb" type="text" data-path="metrics.climb" placeholder="11" />
              </div>
              <div class="field">
                <label for="exercise-load">运动负荷</label>
                <input id="exercise-load" type="text" data-path="metrics.exerciseLoad" placeholder="13" />
              </div>
            </div>
          </details>

          <details class="panel-section panel-section--collapsible">
            <summary class="panel-section__header">
              <h2>地图区域</h2>
              <span class="chip" id="map-source-chip">\u7b49\u5f85\u8f68\u8ff9 JSON</span>
            </summary>
            <p class="panel-section__hint">
              \u5f53\u524d\u4ee5\u8f68\u8ff9 JSON \u81ea\u5e26\u5e95\u56fe\u4e3a\u4e3b\uff0c\u4e5f\u652f\u6301\u624b\u52a8\u4e0a\u4f20\u56fe\u7247\u5e95\u56fe\u540e\u8c03\u6574\u7f29\u653e\u548c\u5e73\u79fb\u3002
            </p>

            <div class="upload-card" style="margin-top: 16px;">
              <div class="field">
                <label for="map-upload">\u4e0a\u4f20\u56fe\u7247\u5e95\u56fe</label>
                <input id="map-upload" type="file" accept="image/*" />
                <small>\u4e5f\u53ef\u4ee5\u76f4\u63a5\u5bfc\u5165\u8f68\u8ff9 JSON\uff0cJSON \u4f1a\u81ea\u5e26\u56fa\u5316\u5e95\u56fe\u548c\u8f68\u8ff9\u3002</small>
              </div>
              <div class="status-text" id="map-file-status">\u5f53\u524d\uff1a\u7b49\u5f85\u5bfc\u5165\u8f68\u8ff9 JSON \u6216\u4e0a\u4f20\u5e95\u56fe</div>
            </div>

            <div class="form-grid" style="margin-top: 16px;">
              <div class="field">
                <div class="field__label">地图缩放</div>
                <div class="range-stack">
                  <input type="range" min="1" max="2.4" step="0.01" data-path="map.scale" data-type="number" />
                  <div class="range-readout" id="map-scale-display">1.00x</div>
                </div>
              </div>
              <div class="field">
                <div class="field__label">水平平移</div>
                <div class="range-stack">
                  <input type="range" min="-500" max="500" step="1" data-path="map.offsetX" data-type="number" />
                  <div class="range-readout" id="map-offset-x-display">0 px</div>
                </div>
              </div>
              <div class="field">
                <div class="field__label">垂直平移</div>
                <div class="range-stack">
                  <input type="range" min="-500" max="500" step="1" data-path="map.offsetY" data-type="number" />
                  <div class="range-readout" id="map-offset-y-display">0 px</div>
                </div>
              </div>
            </div>

            <div class="button-row" style="margin-top: 16px;">
              <button class="btn btn--secondary" id="reset-map-view" type="button">\u91cd\u7f6e\u5730\u56fe\u89c6\u56fe</button>
              <button class="btn btn--secondary" id="reroll-route-map" type="button">\u91cd roll \u5730\u56fe\u89c6\u89d2</button>
              <button class="btn btn--secondary" id="reroll-route-path" type="button">\u91cd roll \u8f68\u8ff9</button>
              <button class="btn btn--secondary" id="open-route-lab" type="button">\u6253\u5f00\u8f68\u8ff9\u5236\u4f5c\u7a97\u53e3</button>
              <button class="btn btn--secondary" id="import-route-project" type="button">\u5bfc\u5165\u8f68\u8ff9 JSON</button>
              <button class="btn btn--secondary" id="restore-site-default-route" type="button">\u6062\u590d\u5168\u7ad9\u9ed8\u8ba4\u8f68\u8ff9</button>
              <button class="btn btn--danger" id="clear-route-layer" type="button">\u6e05\u9664\u8f68\u8ff9</button>
            </div>
            <input id="route-project-input" class="hidden-input" type="file" accept="application/json" />
          </details>

          <details class="panel-section panel-section--collapsible">
            <summary class="panel-section__header">
              <h2>页面设置</h2>
              <span class="chip">模板 keep-walk-v1</span>
            </summary>

            <div class="field" style="margin-top: 0;">
              <div class="field__label">预览缩放</div>
              <div class="range-stack">
                <input type="range" min="0.65" max="1.35" step="0.01" data-path="ui.previewZoom" data-type="number" />
                <div class="range-readout" id="preview-zoom-display">100%</div>
              </div>
            </div>
          </details>
        </div>
      </aside>

      <section class="preview-panel">
        <div class="preview-toolbar">
          <div>
            <h2>实时预览</h2>
            <p>预览与导出共用同一套 Canvas 渲染流程。</p>
          </div>
          <div class="render-status" id="render-status">准备中</div>
        </div>

        <div class="preview-canvas-shell" id="preview-canvas-shell">
          <canvas
            id="poster-canvas"
            width="1080"
            height="2400"
            aria-label="Keep 页面截图预览"
          ></canvas>
        </div>

        <div class="preview-footer">
          <div class="preview-footer__note">
            当前版本已支持本地上传、IndexedDB 缓存、内置底图切换、实时预览和 PNG 导出。
          </div>
          <div class="chip">1080 × 2400</div>
        </div>
      </section>
    </div>
  `;
}
