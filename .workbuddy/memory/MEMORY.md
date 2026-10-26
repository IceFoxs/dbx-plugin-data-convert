# 项目约定（长期）

## 用户硬规范（最高优先）

1. **不打 tag、不建分支**；提交 / push 由用户确认。
2. **版本号以 `manifest.json` 为准**：`package.json` / CHANGELOG / `.dbx-store.json` 的 `source` 都对齐 manifest，不反向改 manifest；**升不升版本由用户说**，「对齐」只在用户已改 manifest 或明确指定版本时做。
3. **不用用户给的真实数据**（接口返回、业务 JSON、截图内容、表名 / 字段名 / 指标）：代码、夹具、文档、截图、CHANGELOG、提交信息一律自造样本（`orders.json` / `items` / `访问量`）。
4. **组件样式统一 shadcn**：原生 `<select>` 弹层跟主题打架，一律自绘 `.custom-select`（`.disabled` 是空转，断言用 `hasAttribute('disabled')`）。
5. **CSS 变量带 fallback**：`var(--radius-md, 0.5rem)`。
6. **有性能顾虑也要用 CodeMirror**，不许退回 textarea（唯一例外：图片 Base64 页）。判断标准是「会不会吞 MB 级字符串」。
7. 踩过的坑写进本文件，别只留在会话里。

## 国际化

1. **新增文案必须 14 语齐全**：zh-CN / zh-TW / en / ja / ko / es / id / it / pl / pt / ru / th / tr / az。
2. 文案分表：主字典 + `NAV_I18N` / `SQL_I18N` / `SHEET_I18N` / `IMG_I18N` / `GEN_I18N` / `CONF_I18N` / `QUERY_I18N` / `ESC_I18N` / `FLOW_I18N` / `BYTES_I18N` / `CHART_I18N` / `TIME_I18N`；新页面用独立小表，别撑大字典。
3. `xxxT(key, '中文兜底')`，回退「当前语言 → en → 主字典 → zh-CN」；占位符 `{n}` / `{size}` / `{path}` 可调语序但不能丢不能多。
4. 改完跑 `node tests/i18n.test.js`：语言集合、键集合对 zh-CN、无空译文、占位符齐全。语言菜单只列前三种。
5. 语言头正则要兼容无引号：`/^\s+(?:'([a-zA-Z-]+)'|([a-zA-Z0-9_-]+)):\s*\{\s*$/`。

## 宿主兼容（DBX 会往 DOM 里塞东西）

1. **按钮不要裸奔**：宿主给没 `title` 的按钮补自己的提示（中文界面冒英文 "Paste"）。写 `data-i18n-title`，或被 `stripHostTooltips()` 摘掉；只有动态内容标 `data-keep-title`。三层拦截：初始化 sweep + 捕获阶段 `pointerover` + `MutationObserver({attributeFilter:['title']})`。
2. **宿主用正则扫 HTML 收要内联的资源**：注释 / 字符串里假的 `<script src>` / `<link href>` 也会被扫到，读不到文件整页 400（`tests/assets.test.js` 守着），单资源上限 8 MB。
3. 宿主 CSP 只允许 `script-src 'unsafe-inline' blob:`。
4. **沙箱里没有本地存储**：opaque origin 下 `localStorage` / `sessionStorage` / `cookie` 全抛 SecurityError。跨会话用 `dbxPlugin.storage`（manifest `host.storage` + `capabilities.storage`）；`window.name` 是唯一不受同源限制、同一 frame 刷新后还在的通道（srcdoc 重载保 name，**新建 iframe 就丢**）。
5. **`dbx-plugin dev` 注入的 API 只有** `ready` / `context` / `locale` / `theme` / `request` / `invoke` / `stream` / `notify` / `sendBinary`：没有 `storage`，也没有 `fileTransfer`（dev 里导出不可用是预期）。dev UI = 每个标签页一个 `<iframe sandbox="allow-scripts" srcdoc>`，资源被内联进同一文档。

## 性能与稳定性（每版自查）

1. **入口限流**：图片 10 MB / Base64 14 M 字符；表格 20 MB / 10 万行 / 200 列；文本导入 16 MB，一次拖入总预算 64 MB。
2. **大字符串不驻留**：>2 M 字符的中间结果只存长度 + 切片预览（`imgState.text`）。
3. **预览不用 data URI**：用 `URL.createObjectURL`，清空 / 换图 / 重置 / 卸载时 `revokeObjectURL`。
4. **长任务分块 + 可取消**：每 1 MB / 4096 条 `await setTimeout(0)` 让出主线程，配进度与取消 token；切文件时旧任务作废。
5. **验收基线**：冷启动 ≈500 ms、堆 ≈9.5 MB、≈535 节点；8 MB 图编码 ≈250 ms 且堆不涨；反复进出 5 次堆与节点不变（`/tmp/imgh/load5.js`）。
6. **不引入网络依赖**：无 CDN / 遥测 / 首屏同步 XHR；第三方库进 `ui/vendor/`（echarts 全量、CodeMirror 5.65.16）。

## 架构约定

1. 每个功能页 = 独立 `<section class="xxx-workspace" id="xxxWorkspace">` + `xxxModeActive` + `enterXxxMode` / `exitXxxMode` + `exitOtherModes('xxx')`；`currentPageId()` 认自己的导航 id，`pageImportTargets()` 里登记 `{ editor, el, tipId }`。
2. 纯逻辑抽到 `ui/js/xxx.js`（`window.DBXxx`），UI 留在 `ui/index.html`；新测试文件要同时进 `run_tests()` 与 `package.json` 的 `test`。
3. CM 与 textarea 用 `linkTextareaToEditor()` 桥接 `.value`；读内容用 `el.CodeMirror.getValue()`（`textarea.value` 是空）。
4. **保存 / 导出唯一入口** `saveTextFile()` / `saveBinaryFile()`，返回 `host` / `browser` / `cancelled` / `failed` 四态，调用方一律 `saveToast(status, okText)`；写盘在 IIFE 里 await，中途失败先 `cancel(handleId)`。别写「不管成败都弹已导出」。
5. **导入不换页**：`importKindForPage()` 决定这页吃什么，三入口（隐藏 input / `[data-import-page]` 按钮 / 拖放）同一通道 → `importTextIntoPage()`。
6. 换算出来的数值不带千分位；结果要能逐个复制（复制胶囊 + 点击即复制）。

## 已上线能力的坑（改前必读）

- **导航布局（0.1.8）**：默认顶部，`#navToggle` 加 `body.nav-left`；左侧 13rem 竖排，「格式转换」`#navConvert` 也进左列且 `.nav-convert-menu` 改 `position: static`（别用绝对定位浮层），`syncNavLeftStack()` 按 `navConvert.bottom` 设 `#navLinks.style.top`，配 `ResizeObserver`（字体加载差 5 px）。偏好四级降级：宿主 storage → localStorage → `window.name`（`dbx-nav:left|top`）→ 本会话。`layoutNav()` 在左侧 >768px 短路；窄屏隐藏按钮。**加导航项会挤掉项**：1440 下要 `0.65rem` 左右 padding。
- **时间转换（0.1.7）**：`ui/js/time.js`；`FIELDS` 默认只开 `local` + `localT`；结果卡 `.time-row` 必须 `flex-shrink: 0`（否则被压到 57 px）；折叠箭头展开 `−` 收起 `+`；相对时间不可单独复制、不进批量复制；批量复制 = 每行输入一行、勾选值空格连；`scrollIntoView` 前判 `typeof === 'function'`（jsdom 没实现）。
- **JSON 转图表**：出图不跟主题（`CHART_BG='#ffffff'`）；预览 1:1 靠 `.chart-stage{justify-content:flex-start}` + `.chart-canvas{margin:auto}`；导出 PNG 显式传 `pixelRatio`；echarts 懒加载、失败不缓存 promise、离页 dispose；测试要 stub echarts（jsdom 里真 echarts 必崩）。
- **导入体系**：>2 M 字符只载入不自动转换；`textLooksBinary()` 拦二进制；批量表格 `mergeFiles()`。

## 文档与截图

1. **截图必须与当前版本一致**。动公共区域（导航）= 全部截图过时，必须整套重拍（1440×900、1x、亮色、清 `.toast`）。
2. 脚本 `/tmp/imgh/shoot-readme-all.js`（一次全拍）；部分页需手工装内容（`shoot-readme-main.js` / `-fill.js` / `-sql.js` / `-time.js`）。坑：**只有部分页自动装示例**；判断内容进没进去用 `CodeMirror.getValue()`；按文字找按钮要加 `offsetParent !== null`（同名 chip 有三处）。
3. 只留核心页截图（以 README 引用为准），不再引用的删掉；改完双向校验「README 引用 ↔ docs 文件」。
4. README 结构：简介 + 主图 → 功能页一览表 → 按页分节（2–5 条短句 + 一张图）→ 通用能力。中英条目一一对应。

## 版本与发布

- 版本：`manifest.json` 为准，`package.json` / CHANGELOG 顶部段 / `.dbx-store.json`（`source` 的 `tree/vX.Y.Z` 与 `releaseNotes`）对齐。
- CHANGELOG 分「新增 / 修复 / 工程化」，写现象与原因，工程化条目给实测数字。
- 打包 `./scripts/build.sh`（先跑全部单测再出 `dist/*.dbxp`）。

## 工具坑

1. macOS **BSD grep 不支持 `\s` / `\|` / `{0,300}`**：多模式用 `grep -E "a|b"`；优先用 Grep 工具。
2. `ui/index.html` 一万六千行：用 Grep 工具或 `sed -n`，别裸 grep 拼管道。
3. 批量插 i18n 用 node 脚本按锚点键插入，插完必跑 `tests/i18n.test.js`（漏逗号、切断 `l'immagine` 都发生过）。
4. 真 Chrome 验沙箱行为要用 flatten 会话（OOPIF 的 iframe，`Target.setAutoAttach({flatten:true})` + `sessionId`）。

## 待办（未完成）

1. **接入宿主选中内容**：`window.dbxPlugin.context` + `onContext()`，用 `flow.pickHostText()` 挖选中文本 → `classifyText()` 路由。
2. **最近使用 / 常用片段**：`flow.recentPush()` 已就绪，缺持久化与面板（沙箱只能用宿主 storage）。
