# 项目约定（长期）

## 用户硬规范（最高优先）

1. **不打 tag、不建分支**；提交 / push 由用户确认。
2. **版本号以 `manifest.json` 为准**（用户 2026-10-25 明确「以后以 manifest 为准」）：`package.json` / CHANGELOG 段落 / `.dbx-store.json` 的 `source` 跟着 manifest 走，发现不一致就对齐到 manifest，不要反过来改 manifest。**但不要自己决定升版本**——升不升、升到几由用户说（用户说「0.1.7」才升）；「对齐」只在用户已改过 manifest 或明确指定版本时做。
3. **不用用户给的真实数据**（接口返回、业务 JSON、截图内容、表名 / 字段名 / 业务指标）：代码、测试夹具、文档、截图、CHANGELOG、提交信息一律用自造样本（`orders.json` / `items` / `访问量` 这类）。
4. **组件样式统一 shadcn**：原生 `<select>` 的弹层跟主题打架，一律自绘 `.custom-select`。
5. **CSS 变量带 fallback**：`var(--radius-md, 0.5rem)`（独立浏览器里没有定义会退成 0）。
6. **有性能顾虑也要用 CodeMirror**，不许因此退回 textarea（唯一例外：图片 Base64 页）。
7. 踩过的坑写进本文件，别只留在会话里。

## 文档与截图

1. **截图与当前版本一致**：改到 UI（导航、布局、文案、主题）就重拍 README 用到的图；导航项 / 页面结构 / 按钮文案要与当次打包的 `ui/index.html` 对得上。
2. **只留核心页**：每个一级功能页一张（现 11 张：格式转换主图 + 对比 / SQL / 图片 / 转义 / 字节 / 时间 / 代码生成 / 查询校验 / 表格 / 图表，实际以 README 引用为准）。细节图（弹层、暗色、窄屏）不进 README；不再引用的 `docs/*.png` 直接删。
3. 规格：**1440×900、1x 原生像素、亮色主题**（`--force-device-scale-factor=1`）。截图前清 `.toast`，否则会把上一场景的提示带进来。
4. 改完用脚本双向校验「README 引用 → 文件存在」「docs 文件 → 是否被引用」。
5. README 结构：一句话简介 + 主图 → 功能页一览表 → 按页分节（2–5 条短句 + 一张图）→ 通用能力（i18n / 主题 / 剪贴板 / 离线）单列。中英两份条目顺序一一对应。

## 国际化

1. **新增文案必须 14 语齐全**：zh-CN / zh-TW / en / ja / ko / es / id / it / pl / pt / ru / th / tr / az。只补中英是最容易犯的错。
2. 文案分表：主字典 `languageConfigs[].dict` + `NAV_I18N` / `SQL_I18N` / `SHEET_I18N` / `IMG_I18N` / `GEN_I18N` / `CONF_I18N` / `QUERY_I18N` / `ESC_I18N` / `FLOW_I18N` / `BYTES_I18N` / `CHART_I18N`。新页面用独立小表，别再撑大字典。
3. 取值 `xxxT(key, '中文兜底')`，回退「当前语言 → en → 主字典 → zh-CN」；JS 里不硬编码中文。占位符用 `{n}` / `{size}` / `{path}` 这类具名 token，可调语序但不能丢不能多。
4. 改完跑 `node tests/i18n.test.js`（已进 `npm test` 与 `scripts/build.sh`）：语言集合、键集合与 zh-CN 对齐、无空译文、占位符齐全。语言菜单只列前三种，其余靠宿主 locale 匹配。

## 宿主兼容（DBX 会往 DOM 里塞东西）

1. **按钮不要裸奔**：DBX 给没写 `title` 的按钮补宿主词表的提示（中文界面冒出英文 "Paste"，还盖住相邻按钮）。要么写 `data-i18n-title`，要么被 `stripHostTooltips()` 摘掉；只有动态内容（导出格式与后缀）标 `data-keep-title`。
2. 拦截三层：初始化 sweep + 捕获阶段 `pointerover` + `MutationObserver({attributeFilter:['title']})`。
3. **宿主用正则扫 HTML 收集要内联的资源**：注释 / 字符串里写假的 `<script src>` / `<link href>` 也会被扫到，读不到文件整页 400（`tests/assets.test.js` 守着）。
4. 宿主 CSP 只允许 `script-src 'unsafe-inline' blob:`。

## 性能与稳定性（每版自查）

1. **入口限流**：图片 10 MB / Base64 14 M 字符；表格 20 MB / 10 万行 / 200 列；文本导入 16 MB，一次拖入总预算 64 MB。
2. **大字符串不驻留**：>2 M 字符的中间结果只存长度 + 切片预览（`imgState.text` 就这么做）。
3. **预览不用 data URI**：图片用 `URL.createObjectURL`，清空 / 换图 / 重置 / 卸载时 `revokeObjectURL`。
4. **长任务分块 + 可取消**：每 1 MB / 4096 条 `await setTimeout(0)` 让出主线程，配进度与取消 token；切文件时旧任务作废。
5. **预分配 + 快路径**：`Uint8Array` 预分配、8 KB 一段 `fromCharCode`；正则规范化先判「干净且 4 对齐」直接返回。
6. **验收基线**：冷启动 ≈500 ms、堆 ≈9.5 MB、≈535 节点；8 MB 图编码 ≈250 ms 且堆不涨；反复进出 5 次堆与节点不变（测法 `/tmp/imgh/load5.js`）。
7. **不引入网络依赖**：无 CDN / 遥测 / 首屏同步 XHR；第三方库进 `ui/vendor/`。

## 编辑器选型

1. 默认一律 CodeMirror 5（`ui/vendor/codemirror`）：格式转换、差异对比、JSON 对比、SQL、表格输出、代码生成、查询校验、转义、字节、图表都是 CM。
2. **唯一例外是图片 Base64 页**（会吞 MB 级字符串，CM 会卡死宿主）。判断标准是「会不会吞 MB 级字符串」，不是「嫌 CM 重」。
3. 缺 mode 从 npm 拉 5.65.16 同版文件 → 压缩放进 `ui/vendor/codemirror/mode/` → 在 `ui/index.html` 加 `<script>`。
4. CM 与 textarea 用 `linkTextareaToEditor()` 桥接 `.value`，所以测试与既有代码继续用 `el.value`。

## 展示约定

1. **换算出来的数值不带千分位**（要能直接贴进代码 / 配置）；字符数 / 条数这类统计仍可 `toLocaleString`。
2. **结果要能逐个复制**：汇总卡有复制胶囊、`td.num` 点一下即复制（`cursor: copy`），整体复制给 TSV。

## 版本与发布

- 版本号三处一致：`manifest.json` / `package.json` / `CHANGELOG.md` 顶部段落；`.dbx-store.json` 的 `source` 用 `tree/vX.Y.Z`，`releaseNotes` 写最新一版。
- CHANGELOG 分「新增 / 修复 / 工程化」，写现象与原因，工程化条目给实测数字。
- 打包 `./scripts/build.sh`（先跑全部单测再出 `dist/*.dbxp`）；新测试文件要同时进 `scripts/build.sh` 的 `run_tests()` 与 `package.json` 的 `test`。

## 已上线能力（改动前必读）

### 时间转换（0.1.7）

- 独立导航页 `navTime` + `#timeWorkspace`，架构照 bytes：纯函数在 `ui/js/time.js`（`window.DBXTime`），UI 在 `ui/index.html`；`timeModeActive` + `enterTimeMode` / `exitTimeMode` + `exitOtherModes('time')`，`currentPageId()` 认 `navTime`，`pageImportTargets()` 给它 `{ editor: timeEditor, el: timeInput, tipId: 'timeTip' }`。
- `FIELDS` 7 个字段（unixSec / unixMs / local / localT / utc / iso / relative），**默认只开 `local` + `localT`**（用户要求：`2020-01-01 00:00:00` ⇄ `2020-01-01T00:00:00`）。改默认值要同步 `tests/time.test.js` 与冒烟里的「默认只勾两项」。
- 解析：`parseTimestamp()` 按位数（10 秒 / 13 毫秒 / 16 微秒裁到毫秒）、`parseDate()` 认 `YYYY-MM-DD`、空格、`T`、`Z`、`±hh:mm`（空格与 `T` 必须出同一毫秒）；`parse()` 批量 `maxLines: 2000`，坏行只标自己，超限置 `truncated`。
- **结果卡片必须 `flex-shrink: 0`**：`.time-panel` 是纵向 flex + 滚动，卡片会被压扁（7 字段时 184 px → 57 px）。
- **相对时间特殊**：不可单独复制（不加 `data-copy-text`，加 `time-field-static` class 去掉 copy 光标与 hover 变色）、不进「复制整行」、不进批量「复制」——它是给人看的描述性文本。
- **批量复制格式固定**：每行输入一行，勾选字段值用空格连，行间换行，不带 `#序号` / 原值 / 字段名（用户反复确认过三遍）。
- 折叠箭头：**展开显示 `−`、收起显示 `+`**（`::before` 竖线只在 collapsed 时出现）。
- 光标定位：CodeMirror `cursorActivity` → `timeLocateRow(cursor.line + 1)` → `[data-line]` 加 `.locate` + `scrollIntoView`。
- 文案在独立小表 `TIME_I18N`（14 语），并入 `applyI18n` 与 `tests/i18n.test.js`。

### 导入体系（0.1.6）

- **不换页**（用户明确要求「在哪个功能就在哪个页面」）：`importKindForPage(page)` 决定这一页吃什么（图片页按 `imgMode`、表格页 sheet、其余 text）；`checkDropRoute()` 只比对并 toast 指路，绝不跳页。
- `flow.textImportable(name)`：不是图片、不是 `xlsx/xlsm/xls` 就当文本收，**扩展名不认识也收**（`.dat` / `.out`）。`flow.textFormatOf(name)` 给格式转换页定源格式。
- 三入口同一通道：隐藏 `#pageImportInput` + `[data-import-page]` 按钮（对比页 `data-import-side="left|right"`）+ 拖放 → `importTextIntoPage()` → `pageImportTargets()` → `putTextIntoPage()`。
- **>2 M 字符（`TEXT_AUTO_MAX`）只载入不自动转换**（格式转换要「解析 → 序列化」，大文件会卡住宿主）；`textLooksBinary()`（NUL / 大量 `\uFFFD`）拦二进制。
- 提示条 `setPageTip()` 写「已导入 {name} · {size}」并 toast；拖入蒙层的 `syncDropVeilLimit()` 写本页上限。格式转换页的 `#convertTip` 默认 `hidden`（不加 `min-height`，否则切页留空白）。
- 批量：一次拖多个表格 → `mergeFiles()` 成 `{ 文件名: 记录[] }`；文本页只导入第一个并 toast 说明。

### JSON 转图表（0.1.6）

- 独立导航页，`ui/js/chart.js` 纯函数 + `#chartWorkspace`；默认 **700 × 400**，宽高 80–4096。
- **智能解析**：`findInside()`（≤3 层，键名 + 内容双打分）认 `{"biz":{"echart_option":"{…}"}}`；`collectReport(value, budget)` 收集多 option（`COLLECT_DEPTH=8`、`budgetFor(chars)=min(60000,max(300,chars/6))`，多份文档按份数摊）；`isScalarRow()` 的纯数据行**跳过且不计预算**（但值里有字符串化 JSON 的不能剪）；`looksEmbedded()` 只看前 8 字符；`parseEmbedded()` 别 `trim()` 整串。扫不完如实 `truncated` → 状态条 `chartTruncated`。
- **出图不跟主题**（用户 2026-10-25 要求）：`CHART_BG='#ffffff'`、`chartThemeName()` 恒 `null`，预览与导出共用同一份 option；换主题不再重建实例。
- **预览 1:1**：`.chart-stage` 用 `justify-content:flex-start` + `.chart-canvas{margin:auto}`，`chartApply()` 用 important 钉 `max-width/height:none`；别加 `object-fit:none`。
- 导出：PNG 走 `chartRenderPng()`（临时实例 + `devicePixelRatio` + **显式 `pixelRatio`**，zrender 不读实例 dpr），SVG 走 `ssr:true` + `renderToSVGString()`；两条路共用 `chartResult.option`，别各自 build 一次。
- 引擎 `ui/vendor/echarts/echarts.min.js`（6.1.0 全量，Apache-2.0）。**不能用 simple 版**（缺 radar / treemap / dataZoom）。懒加载、失败不缓存 promise、离开页 dispose。
- 上限：输入 2 M 字符、30 系列、总点 5 万、单系列 2 万；像素比 1x/2x/3x，`chartSafeScale()` 按 2400 万像素封顶降档。
- 测试三层：`tests/chart.test.js`（含「任务列表」6 条）、`ui.smoke.js`（stub 掉 echarts，jsdom 里真 echarts 必崩）、`/tmp/imgh/check-chart.js`（真 Chrome 43 项）。

### 图片页导入（0.1.6）

- 解码页「导入文件」只读文本（16 MB，再按 14 M 字符卡一次）；编码页「选择图片」只吃图片。
- **不换页**：`imgImportFile()` 类型不对只 `imgSetTip` 提示，绝不 `setImgMode()`。
- 导出 → 导入闭环靠 `DBXImg.parseInput()` 的 `data:` 正则（CSS / HTML / Markdown 包装都能读回）。

### 保存 / 导出（0.1.6 定型）

1. **唯一入口** `saveTextFile()` / `saveBinaryFile()`，返回 **`host` / `browser` / `cancelled` / `failed`** 四态，调用方一律 `saveToast(status, okText)`。**不要再出现「不管成败都弹已导出」**。
2. 写法照 aes-tools：`beginSave` 同步调用先进 try/catch 拿 Promise，写盘在 IIFE 里 await；中途失败先 `cancel(handleId)` 再回退浏览器下载。别写 `const h = await ft.beginSave(...)`。
3. **`dbx-plugin dev` 里导出不可用是预期**（无 `fileTransfer`，iframe 禁下载），别为 dev 改正式逻辑。
4. 验证：拦 `URL.createObjectURL` 拿 Blob，直接读 PNG 的 IHDR（第 16..24 字节大端宽高）。

## 工具坑

1. macOS **BSD grep 不支持 `\s` / `\|` / `{0,300}`**：多模式用 `grep -E "a|b"`。裸 grep 无输出时先怀疑语法，别当成「文件里没有」。
2. 十几万行的 `ui/index.html` 用 `Grep` 工具或 `sed -n`，别裸 grep 拼管道。
3. 批量插 i18n 用 node 脚本按锚点键插入，插完必跑 `tests/i18n.test.js`（漏逗号、切断 `l'immagine` 都发生过）。
4. **语言头正则要兼容无引号**：`CHART_I18N` 里只有 `zh-CN` / `zh-TW` 带引号。用 `/^\s+(?:'([a-zA-Z-]+)'|([a-zA-Z0-9_-]+)):\s*\{\s*$/`，否则 `cur` 不前进、13 个语言全写成繁体而测试照样过。
5. **自绘下拉的 `.disabled` 是空转**（`<div>`）：断言一律 `el.hasAttribute('disabled')`。
6. 新增页面 ≈ 20–50 个 i18n 键 × 14 语，新文案进独立小表。

## 待办（未完成）

1. **接入宿主选中内容**：`window.dbxPlugin.context` + `onContext()`（dev-runtime 里确认过 `context` / `onInit` / `onContext`）。用 `flow.pickHostText()` 挖选中文本，`classifyText()` 判 json / ddl / sql / text 后路由。
2. **最近使用 / 常用片段**：`flow.recentPush()` 已就绪（单条 16 KB、总预算 256 KB、超预算降级元信息），还缺 localStorage 与工具栏面板。
