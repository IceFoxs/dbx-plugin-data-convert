# 项目约定（长期）

## 用户硬规范（最高优先）

1. **不打 tag、不建分支**；提交 / push 由用户确认。
2. **版本号以 `manifest.json` 为准**：`package.json` / CHANGELOG 段落 / `.dbx-store.json` 的 `source` 都对齐到 manifest，不反向改 manifest；**升不升版本由用户说**（说了「0.1.8」才升），「对齐」只在用户已改 manifest 或明确指定版本时做。
3. **不用用户给的真实数据**（接口返回、业务 JSON、截图内容、表名 / 字段名 / 指标）：代码、夹具、文档、截图、CHANGELOG、提交信息一律自造样本（`orders.json` / `items` / `访问量`）。
4. **组件样式统一 shadcn**：原生 `<select>` 弹层跟主题打架，一律自绘 `.custom-select`。
5. **CSS 变量带 fallback**：`var(--radius-md, 0.5rem)`。
6. **有性能顾虑也要用 CodeMirror**，不许退回 textarea（唯一例外：图片 Base64 页）。
7. 踩过的坑写进本文件，别只留在会话里。

## 文档与截图

1. **截图必须与当前版本一致**：改到 UI（导航、布局、文案、主题）就重拍。**动公共区域（导航）= 11 张全过时**，必须整套重拍并逐张确认（2026-10-25 教训：加「时间转换」后除新图外 10 张的导航都少一项）；0.1.8 加布局按钮 + 改 padding 同样整套重拍。
2. 重拍脚本 `/tmp/imgh/shoot-readme-all.js`（一次 11 张：1440×900、1x、亮色、清 `.toast`），手工装内容的另有 `shoot-readme-main.js`（格式转换）、`shoot-readme-fill.js`（对比）、`shoot-readme-sql.js`、`shot-readme-time.js`。三个坑：
   - **只有部分页自动装示例**（代码 / 查询 / 转义 / 字节 / 图表点导航就有；表格点「用户信息」、图片点「示例图片」）；**格式转换 / 对比 / SQL / 时间转换是空态**：格式转换 `#genMockBtn` + `#convertBtn`，对比 `#cmpJsonSamples` 的「用户信息」+ `#cmpRun`，SQL 往 `#sqlInputText` 灌值 + `#sqlGenerate`，时间页灌 5 行或点快捷按钮（空态那行用 `·` 连起来的是灰色占位）。
   - 判断内容进没进去**别读 `textarea.value`**（CodeMirror 返回空），用 `el.CodeMirror.getValue()`；懒创建的 CM 等 ~500 ms。
   - 按文字找按钮要加 `offsetParent !== null`，否则同名 chip（「用户信息」三处都有）会点到隐藏页里的那个。
3. 只留核心页（现 11 张，以 README 引用为准）；细节图（弹层 / 暗色 / 窄屏）不进 README；不再引用的 `docs/*.png` 删掉。
4. 改完双向校验「README 引用 ↔ docs 文件」。
5. README 结构：简介 + 主图 → 功能页一览表 → 按页分节（2–5 条短句 + 一张图）→ 通用能力（i18n / 主题 / 导航 / 剪贴板 / 离线）。中英条目顺序一一对应。

## 国际化

1. **新增文案必须 14 语齐全**：zh-CN / zh-TW / en / ja / ko / es / id / it / pl / pt / ru / th / tr / az。
2. 文案分表：主字典 + `NAV_I18N` / `SQL_I18N` / `SHEET_I18N` / `IMG_I18N` / `GEN_I18N` / `CONF_I18N` / `QUERY_I18N` / `ESC_I18N` / `FLOW_I18N` / `BYTES_I18N` / `CHART_I18N` / `TIME_I18N`；新页面用独立小表，别撑大字典。
3. `xxxT(key, '中文兜底')`，回退「当前语言 → en → 主字典 → zh-CN」；占位符 `{n}` / `{size}` / `{path}` 可调语序但不能丢不能多。
4. 改完跑 `node tests/i18n.test.js`（已进 `npm test` 与 `build.sh`）：语言集合、键集合对 zh-CN、无空译文、占位符齐全。语言菜单只列前三种，其余靠宿主 locale 匹配。

## 宿主兼容（DBX 会往 DOM 里塞东西）

1. **按钮不要裸奔**：宿主给没 `title` 的按钮补自己的提示（中文界面冒英文 "Paste"）。写 `data-i18n-title`，或被 `stripHostTooltips()` 摘掉；只有动态内容标 `data-keep-title`。拦截三层：初始化 sweep + 捕获阶段 `pointerover` + `MutationObserver({attributeFilter:['title']})`。
2. **宿主用正则扫 HTML 收要内联的资源**：注释 / 字符串里假的 `<script src>` / `<link href>` 也会被扫到，读不到文件整页 400（`tests/assets.test.js` 守着）。
3. 宿主 CSP 只允许 `script-src 'unsafe-inline' blob:`。
4. **沙箱里没有本地存储**：opaque origin 下 `localStorage` / `sessionStorage` / `cookie` 全抛 SecurityError（真 Chrome 实测）。跨会话用 `dbxPlugin.storage`（manifest `host.storage` + `capabilities.storage`）；`window.name` 是唯一不受同源限制、同一 frame 刷新后还在的通道（srcdoc 重载保 name，**新建 iframe 就丢**）。
5. **`dbx-plugin dev` 注入的 API 只有** `ready` / `context` / `locale` / `theme` / `request` / `invoke` / `stream` / `notify` / `sendBinary`：没有 `storage`，也没有 `fileTransfer`（dev 里导出不可用是预期，别为 dev 改正式逻辑）。dev UI = 每个标签页一个 `<iframe sandbox="allow-scripts" srcdoc>`，前端资源被内联进同一个文档。

## 性能与稳定性（每版自查）

1. **入口限流**：图片 10 MB / Base64 14 M 字符；表格 20 MB / 10 万行 / 200 列；文本导入 16 MB，一次拖入总预算 64 MB。
2. **大字符串不驻留**：>2 M 字符的中间结果只存长度 + 切片预览（`imgState.text`）。
3. **预览不用 data URI**：用 `URL.createObjectURL`，清空 / 换图 / 重置 / 卸载时 `revokeObjectURL`。
4. **长任务分块 + 可取消**：每 1 MB / 4096 条 `await setTimeout(0)` 让出主线程，配进度与取消 token；切文件时旧任务作废。
5. **预分配 + 快路径**：`Uint8Array` 预分配、8 KB 一段 `fromCharCode`；正则规范化先判「干净且 4 对齐」直接返回。
6. **验收基线**：冷启动 ≈500 ms、堆 ≈9.5 MB、≈535 节点；8 MB 图编码 ≈250 ms 且堆不涨；反复进出 5 次堆与节点不变（`/tmp/imgh/load5.js`）。
7. **不引入网络依赖**：无 CDN / 遥测 / 首屏同步 XHR；第三方库进 `ui/vendor/`。

## 编辑器选型

1. 默认一律 CodeMirror 5（`ui/vendor/codemirror`）：格式转换 / 对比 / JSON 对比 / SQL / 表格输出 / 代码生成 / 查询 / 转义 / 字节 / 图表 / 时间。
2. **唯一例外是图片 Base64 页**（吞 MB 级字符串会卡死宿主）。判断标准是「会不会吞 MB 级字符串」，不是「嫌 CM 重」。
3. 缺 mode 从 npm 拉 5.65.16 同版 → 压缩进 `ui/vendor/codemirror/mode/` → `index.html` 加 `<script>`。
4. CM 与 textarea 用 `linkTextareaToEditor()` 桥接 `.value`，既有代码与测试继续用 `el.value`。

## 展示约定

1. **换算出来的数值不带千分位**（要能直接贴进代码 / 配置）；字符数 / 条数这类统计仍可 `toLocaleString`。
2. **结果要能逐个复制**：汇总卡有复制胶囊、`td.num` 点一下即复制（`cursor: copy`），整体复制给 TSV。

## 版本与发布

- 版本号：`manifest.json` 为准，`package.json` / CHANGELOG 顶部段 / `.dbx-store.json` 的 `source`（`tree/vX.Y.Z`）与 `releaseNotes` 一起对齐。
- CHANGELOG 分「新增 / 修复 / 工程化」，写现象与原因，工程化条目给实测数字。
- 打包 `./scripts/build.sh`（先跑全部单测再出 `dist/*.dbxp`）；新测试文件要同时进 `run_tests()` 与 `package.json` 的 `test`。

## 已上线能力（改动前必读）

### 导航位置切换（0.1.8）

- 默认顶部。顶栏最右 `#navToggle` 切换，给 `body` 加 `nav-left`。左侧：`#navLinks` 变 `position: fixed; top: 3.5rem; left: 0; bottom: 0; width: 13rem` 竖排，`.main-container` 让出同宽，`#navMore` 隐藏，`.lang-switcher { margin-left: auto }` 顶到右边。
- **「格式转换」也进左列**（2026-10-26 用户报「json转properties 没有切换到左侧」= 面板悬在栏上盖住导航项）：`nav-left` 下 `#navConvert` 变 `position: fixed; top: 3.5rem; left: 0; width: 13rem; flex-direction: column`，`.nav-convert-menu` 改 `position: static; display: none`、`.open` 时 `display: block`——菜单参与排版，展开时把 10 项往下推，**不要再用绝对定位浮层**。
- 高度靠 `syncNavLeftStack()`：把 `#navLinks.style.top` 设为 `navConvert.getBoundingClientRect().bottom`；`toggleNavConvert` / `closeNavConvert` / `navApplyLayout` / resize 都调，另加 `ResizeObserver` 盯 `#navConvert`（字体加载、展开收起、切语言都会重算）。量不到尺寸（jsdom `bottom === 0`）就保持 CSS 的 3.5rem。
- **偏好四级降级**：`dbxPlugin.storage`（键 `navLayout`，值 `top` / `left`）→ 浏览器 `localStorage` → `window.name`（记号 `dbx-nav:left|top`，保留原有 name 内容）→ 仅本会话。启动先同步读（localStorage / name）避免闪，再 `await ready` 用宿主值校正。
- `layoutNav()` 在 `nav-left` 且 `innerWidth > 768` 时短路（竖排横向不溢出，别把项搬进隐藏的 `#navMore`）；窄屏 ≤768 只保留顶部布局、按钮隐藏。
- **加按钮会挤掉导航项**：1440 下 10 项原本刚好排满，`.nav-links a` 左右 padding 从 `0.8rem` 收到 `0.65rem` 才保住 10 项（0.6 / 0.65 都行）；左侧项 `padding: 0.5rem 0.75rem` 单独设。

### 时间转换（0.1.7）

- 独立页 `navTime` + `#timeWorkspace`，架构照 bytes：纯函数在 `ui/js/time.js`（`window.DBXTime`），UI 在 `ui/index.html`；`timeModeActive` + `enterTimeMode` / `exitTimeMode` + `exitOtherModes('time')`，`currentPageId()` 认 `navTime`，`pageImportTargets()` 给它 `{ editor: timeEditor, el: timeInput, tipId: 'timeTip' }`。
- `FIELDS` 7 个字段（unixSec / unixMs / local / localT / utc / iso / relative），**默认只开 `local` + `localT`**（`2020-01-01 00:00:00` ⇄ `2020-01-01T00:00:00`）；改默认值要同步 `tests/time.test.js` 与冒烟的「默认只勾两项」。
- 解析：`parseTimestamp()` 按位数（10 秒 / 13 毫秒 / 16 微秒裁到毫秒）、`parseDate()` 认 `YYYY-MM-DD`、空格、`T`、`Z`、`±hh:mm`（空格与 `T` 必须出同一毫秒）；`parse()` 批量 `maxLines: 2000`，坏行只标自己，超限置 `truncated`。
- **结果卡片必须 `flex-shrink: 0`**（`.time-panel` 是纵向 flex + 滚动，否则 7 字段卡片被压到 57 px）。
- **相对时间特殊**：不可单独复制（不加 `data-copy-text`、加 `time-field-static` 去掉 copy 光标与 hover 变色）、不进「复制整行」、不进批量「复制」。
- **批量复制格式固定**：每行输入一行，勾选字段值用空格连，行间换行，不带 `#序号` / 原值 / 字段名（用户确认过三遍）。
- 折叠箭头：**展开 `−`、收起 `+`**（`::before` 竖线只在 collapsed 时出现）。
- 光标定位：CM `cursorActivity` → `timeLocateRow(line)` → `[data-line]` 加 `.locate` + `scrollIntoView`；**调 `scrollIntoView` 前判 `typeof === 'function'`**（jsdom 没实现，快捷填入会主动定位，不判就在冒烟里抛错）。
- **快捷操作**：`#timeQuickActions` 五个按钮 `data-quick="now|today|yesterday|week|month"`，值由 `T.quick(kind, now)` 给（截到整秒，起点都在 00:00:00，本周按周一，跨月交给 `new Date(y, mo, day)`）。点击 → 取 `fields(ms).local` **换行追加** → `timeRun()` → 光标落到新行 → 高亮对应卡片；读旧值用 `timeEditor.getValue()`。每个按钮一个 `--quick` 变量（蓝 / 绿 / 青 / 琥珀 / 灰），暗色逐个覆盖，hover 只换 `--accent-bg` 不反转字色。卡片同样 `flex-shrink: 0`。

### 导入体系（0.1.6）

- **不换页**（用户要求「在哪个功能就在哪个页面」）：`importKindForPage(page)` 决定这页吃什么；`checkDropRoute()` 只比对并 toast 指路，绝不跳页。
- `flow.textImportable(name)`：不是图片、不是 `xlsx/xlsm/xls` 就当文本收，**扩展名不认识也收**（`.dat` / `.out`）；`flow.textFormatOf(name)` 给格式转换页定源格式。
- 三入口同一通道：隐藏 `#pageImportInput` + `[data-import-page]` 按钮（对比页 `data-import-side="left|right"`）+ 拖放 → `importTextIntoPage()` → `pageImportTargets()` → `putTextIntoPage()`。
- **>2 M 字符（`TEXT_AUTO_MAX`）只载入不自动转换**；`textLooksBinary()`（NUL / 大量 `\uFFFD`）拦二进制。
- 提示条 `setPageTip()` 写「已导入 {name} · {size}」并 toast；`syncDropVeilLimit()` 写本页上限。格式转换页 `#convertTip` 默认 `hidden`（不加 `min-height`，否则切页留空白）。
- 批量：一次拖多个表格 → `mergeFiles()` 成 `{ 文件名: 记录[] }`；文本页只导入第一个并 toast 说明。

### JSON 转图表（0.1.6）

- 独立页，`ui/js/chart.js` 纯函数 + `#chartWorkspace`；默认 **700 × 400**，宽高 80–4096。
- **智能解析**：`findInside()`（≤3 层，键名 + 内容双打分）认 `{"biz":{"echart_option":"{…}"}}`；`collectReport()`（`COLLECT_DEPTH=8`、`budgetFor(chars)=min(60000,max(300,chars/6))`）收多份，`isScalarRow()` 的纯数据行跳过且不计预算（值里含字符串化 JSON 的不能剪）；`looksEmbedded()` 只看前 8 字符；`parseEmbedded()` 别 `trim()` 整串；扫不完如实 `truncated`。
- **出图不跟主题**（用户要求）：`CHART_BG='#ffffff'`、`chartThemeName()` 恒 `null`，预览与导出共用同一份 option。
- **预览 1:1**：`.chart-stage { justify-content: flex-start }` + `.chart-canvas { margin: auto }`，`chartApply()` 用 important 钉 `max-width/height:none`；别加 `object-fit:none`。
- 导出：PNG 走 `chartRenderPng()`（临时实例 + **显式 `pixelRatio`**，zrender 不读实例 dpr），SVG 走 `ssr:true` + `renderToSVGString()`；两条路共用 `chartResult.option`。
- 引擎 `ui/vendor/echarts/echarts.min.js`（6.1.0 **全量**，simple 版缺 radar / treemap / dataZoom）；懒加载、失败不缓存 promise、离开页 dispose。
- 上限：输入 2 M 字符、30 系列、总点 5 万、单系列 2 万；像素比 1x/2x/3x，`chartSafeScale()` 按 2400 万像素封顶降档。
- 测试三层：`tests/chart.test.js`、`ui.smoke.js`（stub 掉 echarts，jsdom 里真 echarts 必崩）、`/tmp/imgh/check-chart.js`。

### 图片页导入（0.1.6）

- 解码页「导入文件」只读文本（16 MB，再按 14 M 字符卡一次）；编码页「选择图片」只吃图片。
- **不换页**：`imgImportFile()` 类型不对只 `imgSetTip`，绝不 `setImgMode()`。
- 导出 → 导入闭环靠 `DBXImg.parseInput()` 的 `data:` 正则（CSS / HTML / Markdown 包装都能读回）。

### 保存 / 导出（0.1.6 定型）

1. **唯一入口** `saveTextFile()` / `saveBinaryFile()`，返回 **`host` / `browser` / `cancelled` / `failed`** 四态，调用方一律 `saveToast(status, okText)`；**不要再出现「不管成败都弹已导出」**。
2. 写法照 aes-tools：`beginSave` 同步调用进 try/catch 拿 Promise，写盘在 IIFE 里 await；中途失败先 `cancel(handleId)` 再回退浏览器下载。别写 `const h = await ft.beginSave(...)`。
3. 验证：拦 `URL.createObjectURL` 拿 Blob，读 PNG 的 IHDR（第 16..24 字节大端宽高）。

## 工具坑

1. macOS **BSD grep 不支持 `\s` / `\|` / `{0,300}`**：多模式用 `grep -E "a|b"`。裸 grep 无输出时先怀疑语法，别当成「文件里没有」。
2. 十几万行的 `ui/index.html` 用 Grep 工具或 `sed -n`，别裸 grep 拼管道。
3. 批量插 i18n 用 node 脚本按锚点键插入，插完必跑 `tests/i18n.test.js`（漏逗号、切断 `l'immagine` 都发生过）。
4. **语言头正则要兼容无引号**：`CHART_I18N` 里只有 `zh-CN` / `zh-TW` 带引号，用 `/^\s+(?:'([a-zA-Z-]+)'|([a-zA-Z0-9_-]+)):\s*\{\s*$/`。
5. **自绘下拉的 `.disabled` 是空转**（`<div>`）：断言一律 `el.hasAttribute('disabled')`。
6. 新增页面 ≈ 20–50 个 i18n 键 × 14 语，新文案进独立小表。
7. **真 Chrome 验沙箱行为要用 flatten 会话**：`sandbox="allow-scripts"` 的 iframe 是 OOPIF，`Page.getFrameTree` 看不到它，得 `Target.setAutoAttach({flatten:true})` 后用 `sessionId` 发 `Runtime.evaluate`。

## 待办（未完成）

1. **接入宿主选中内容**：`window.dbxPlugin.context` + `onContext()`（dev-runtime 里有 `context` / `onInit` / `onContext`）。用 `flow.pickHostText()` 挖选中文本，`classifyText()` 判 json / ddl / sql / text 后路由。
2. **最近使用 / 常用片段**：`flow.recentPush()` 已就绪（单条 16 KB、总预算 256 KB），还缺持久化与工具栏面板（注意沙箱里只能用宿主 storage）。
