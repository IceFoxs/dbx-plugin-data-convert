# 项目约定（长期）

## 硬规范
- 不打 tag、不建分支，提交由用户确认。**版本号以 `manifest.json` 为准**，`package.json` / CHANGELOG 顶段 / `.dbx-store.json` 对齐它；升不升版本由用户说。
- **每次改功能都要同步发布物料**（用户 2026-10-26「每次记得更新」）：CHANGELOG 当前段 → `manifest.json` 描述 → `.dbx-store.json` 的 description（含各语言）/ releaseNotes / tags → README 中英 → 截图；条数用实测值。
- **不用用户的真实数据**（接口、截图、表名字段），一律自造样本。
- 组件统一 shadcn，原生 `<select>` 换自绘 `.custom-select`（`.disabled` 空转，断言用 `hasAttribute`）；CSS 变量带 fallback。**下拉开合的状态类位置是固定的**：`open` 加在 `.custom-select-options` 上、`active` 加在 `.custom-select-trigger` 上（CSS 就写的 `.custom-select-options.open`），加到外层 `.custom-select` 上是「只有箭头翻过去、选项一个都不出来」，症状很像「点了没反应」。另有两条必踩：祖先 `overflow-y: auto` 会把绝对定位的浮层裁光（面板内下拉改 `position: fixed` 按触发器算位置，下方放不开翻上面）；`.pane-header` 之类默认 `overflow: hidden` 的容器里放浮层要单页放开。
- 编辑器默认 CodeMirror 5，唯一例外是图片 Base64 页（判据：会不会吞 MB 级字符串）。
- **新增功能必须能搜到**（用户 2026-10-28「之后新加功能也要这么做，作为长期记忆」）：新页面进 `NAV_SEARCH_ALIAS`，页内 tab / 方向切换进 `NAV_SUB_TABS`，新汉字进 `HANZI_SOUND`；做完顺手在冒烟里加一条「搜得到 + 选中后落在正确的页与 tab」。细则见「页级坑 → 新增功能必须进搜索」。

## 国际化
- 新文案 14 语齐全；新页面开独立小表（`QR_I18N` …），别撑大字典。回退「当前语言 → en → 主字典 → zh-CN」；占位符 `{n}` 可调序不可丢；语言头正则兼容无引号键。改完跑 `node tests/i18n.test.js`。
- **表定义在 `18-flow.js` 之后的脚本里（如 `19-datasql.js`）时，文件末尾必须再调一次 `applyI18n()`**：18 末尾那次是首屏唯一一遍扫描，那时 `typeof X_I18N === 'undefined'` 被守卫跳过，本页的 `data-i18n` / placeholder / title 首屏全是空的，切一次语言才齐。
- CodeMirror 的 `placeholder` 只在建编辑器那一刻取一次：切语言后要手动 `cm.setOption('placeholder', textarea.placeholder)`。

## 宿主 / 沙箱
- **没有本地存储**：opaque origin 下 `localStorage` / `cookie` 抛 SecurityError。用 `dbxPlugin.storage`（manifest `host.storage` + `capabilities.storage`）→ `localStorage` → `window.name`（srcdoc 重载保留，新建 iframe 丢）→ 内存。
- CSP 只放行 `script-src 'unsafe-inline' blob:`；第三方库以 `<script type="text/plain" src>` 文本副本存放，进页包成 `blob:` 执行，失败不缓存 promise。
- 宿主用正则扫 HTML 收资源：注释 / 字符串里假的 `<script src>` 也会被扫，读不到整页 400（`tests/assets.test.js` 守着）。
- 宿主给没 `title` 的按钮补英文提示：写 `data-i18n-title` 或让 `stripHostTooltips()` 摘掉，动态内容标 `data-keep-title`。
- `dbx-plugin dev` 没有 `storage` 也没有 `fileTransfer`（dev 导出不了是预期，别为它改正式逻辑）。

## 架构
- 功能页 = `<section id="xxxWorkspace">` + `xxxModeActive` + `enter/exitXxxMode` + `exitOtherModes('xxx')`，并在 `currentPageId()` / `pageImportTargets()` 登记。纯逻辑抽 `ui/js/xxx.js`（挂 `window.DBXxx`）；新测试进 `run_tests()` 与 `package.json`。
- 保存 / 导出唯一入口 `saveTextFile()` / `saveBinaryFile()`，返回 `host`/`browser`/`cancelled`/`failed` 四态 + `saveToast()`；中途失败先 `cancel(handleId)`。绝不能不分成败都弹「已导出」。
- **导入不换页**：`importKindForPage()` 决定这页吃什么，三入口同一通道；>2 M 字符只载入不自动转换。
- 读编辑器用 `el.CodeMirror.getValue()`（`textarea.value` 是空）；换算出的数值不带千分位。

## 页级坑
- **功能搜索**（`08-nav-search.js`）：**绝不做浮层**——顶部布局下用 `body.nav-searching` 把导航那一行（`.nav-side` + `#navMore`）让给搜索框，浮层会压住工具栏的「从 / 转为」。选中走 `handleNavClick(el)` 而不是 `el.click()`（宿主 WebView 收不到合成点击的委托，表现是「收起但没跳页」）；点顶栏里的按钮不算 outside-click（边搜边切语言不丢输入）；`layoutNav()` 遇 `nav-searching` 直接 return（导航被隐藏时宽度全是 0，会把 11 项全搬进「更多」）；快捷键文案 mac `⌘K` / 其它 `Ctrl+K`，在 `navSyncSearchLabel()` 里、`applyI18n()` 末尾调用。
- **组合输入**：宿主是 WebKit（DBX 的 WebView），组词期间写 `input.value` 或把输入框 `display:none` 会**当场撤掉候选窗**（Blink 容忍，所以「web 正常、宿主不行」几乎都出在这类写法上）。搜索框现在 `compositionstart → compositionend` 之间什么都不做，上屏后才搜；空值只 `navSearchHideList()`（收下拉），不退出搜索态、不清值。别再往这类输入框上挂「每次 input 都重排」。
- **数据统计**（`17-stats.js` + 纯函数 `stats.js`）：输入框是 CodeMirror（懒创建、进页 `refresh()`）——`.editor-container textarea.textarea` 会被 `display:none` 给 CodeMirror 让位，**没有编辑器的页千万别用这个类**（整块输入消失，用户看到的是「一片空白、点不动」）。`parse()` 带回 `lines[]` 原文行号（表头 / 开头空行都算）做「点行跳光标 / 光标亮行」双向定位；「复制所选列」走 `columnsTsv()` 按表输出（表头 + 每行一条），别再摊平成一列。
- **新增功能必须进搜索（长期约定）**：每个功能页 / 页内二级切换都要能被搜到。页面：`NAV_SEARCH_ALIAS` 补近义词 + 拼音；页内 tab：`NAV_SUB_TABS` 加一行 `{page, box, keys}`（名字读按钮文案，脚本渲染的容器给 `fill`）；新汉字补 `HANZI_SOUND`；选中走 `kind:'tab'` 分支（先 `handleNavClick` 切页，再按 key 重新取元素去点，转义的 chip 每次进页会重建）。分档 `NAV_KIND_RANK`：page 0 → convert 1 → tab 2 → format 3。
- **导航**：`#navToggle` 加 `body.nav-left`；「格式转换」也进左列，菜单 `position: static`；`syncNavLeftStack()` 按 `navConvert.bottom` 定 `#navLinks.top` + `ResizeObserver`；左侧 >768px 时 `layoutNav()` 短路。**加导航项会挤掉项**：11 项要 `padding: .4rem .45rem` + `gap: .25rem` + `font-size: .8125rem`（1440 余 71px；`0.65rem` 只够 10 项）。**顺序 / 置顶 / 吸顶**：纯函数在 `ui/js/nav.js`，偏好存独立 key `navCustom`（`{v:1,order,pins,sticky}`，读不懂的字段原样透传；旧的 `navLayout` / `dbx-nav:` 一字未改，所以能安全回退）。`layoutNav()` 按 rank 排；**搬进「更多」后必须按 rank 重排**（先 insertBefore 再 appendChild 会让置顶项夹在中间——用户报的乱序）；`navCommit()` 要过一遍 `effectiveOrder()`，否则新置顶的留在原位。左侧粘顶靠逐行累加的 `top`，且左列**顶部内边距必须换成 `margin`**，否则滚动时内容从缝里透出来。**拖拽排序不能用 HTML5 拖放**：宿主（Tauri 的 WebView）把原生拖放接管了，`dragstart` / `dragover` / `drop` 在 DBX 里一个都不触发（浏览器里好好的），必须自己跟 `pointerdown/move/up`，监听挂 `document` + 捕获阶段（滑出面板也能收到 `up`）。冒烟导航断言（直属项数 / 「更多」集合 / `pageOf`）三处同步。
- **二维码**：qrcode-generator 默认按 latin-1 取字节（中文必乱码），`matrixOf()` 切 `stringToBytesFuncs['UTF-8']`；jsQR 251 KB 只在切「解码」时懒载，串行泵 + 长边压 1600 + 解完释放位图。**中心图标必须把纠错顶到 H**（L / M / Q 解不回，测试钉着）；图标先缩到长边 256 的 PNG，否则每张卡片都嵌一份原图。
- **单张导出面板**：卡片「导出」开模态（`#qrExportMask`），格式 / 尺寸 / 文件名当场定，落盘只走 `qrExportOne()` 一个口子；名字净化在 `QR.fileNameFor()`（纯函数，单测钉着）。`qrRenderGrid()` 与 `exitQrMode()` 都先关面板（重绘后序号会指错张）；改格式 / 尺寸即写 `qrExportPref`（只在确认时记会漏掉取消场景）。`.btn-primary` 全局 `flex:1`，面板里要 `flex:0 0 auto`。
- **卡片内容预览不许 `max-height` 硬裁**：单张（`is-single`）要完整摊开、超高才滚（20rem）；网格用 `-webkit-line-clamp: 2` 收尾带省略号。硬裁看起来就像「只生成了三行」（用户报「内容不完整」）。jsdom 不做布局，靠 `tests/assets.test.js` 静态校验样式表钉着。
- **双击放大**：码面 `dblclick` → 复用图片页灯箱 `lbOpen(src, label, opener)`（滚轮 / 双击 1:1 / Esc 全都有）。大图必须 `svgMarkup(…, size: 1024)` **重新矢量画**，别拿卡片那张 256 的位图拉伸；交给 `<img>` 用 `data:image/svg+xml;charset=utf-8,` + `encodeURIComponent`。标题 `lbLabel(QR.shortLabel(text, 32), 1024, 1024)`。**换页时 `exitQrMode()` 要 `lbClose()`**，否则灯箱跟着盖到别的页上。
- **时间**：结果卡 `flex-shrink: 0`；相对时间不进批量复制；`scrollIntoView` 前判 `typeof === 'function'`（jsdom 没实现）。
- **SQL 分析页的「编辑器周边」**（`19-datasql.js`）：
  - **行注释两处都要认**：编辑器侧（去注释 / ▶ 定位 / 切语句 / 空语句 / 已执行显示）与引擎侧（`sqlrun.js` 词法）各有一份判断，只改一边就是「▶ 认得、一执行报错」。`--` 与 `//` 认，`#` 不认（SQL Server 的 `#临时表` 会被吃成半句）。CodeMirror 自带 sql 模式只认 `--`，`//` 要自己 `markText(..., {className:'cm-comment'})`，并在刷 ▶ 的函数里一起重算。
  - **草稿记忆分档存**：≤24 KB 原样；更大先 `CompressionStream` gzip 再 base64，压完 ≤128 KB 才存；压不了又超过 128 KB 就**放弃**（别拿几百 KB 的语句去挤布局 / 主题那些真要记住的配置）。base64 按 `0x8000` 分块转，`String.fromCharCode.apply` 对 MB 级必爆栈。**异步压缩必须带序号**（`dataSqlDraftSeq`，落盘前比对），否则慢压完的旧结果会盖掉新草稿。
  - 存盘时机：800 ms 防抖 + `visibilitychange`→hidden / `exitXxxMode()` / 点运行前强制 flush；恢复只在框里为空时做，光标落到末尾。
- **图表**：出图不跟主题；预览 1:1 靠 `flex-start` + `margin:auto`；导出 PNG 显式传 `pixelRatio`；测试 stub 掉 echarts。
- **表格 / 拖放**：`textLooksBinary()` 拦二进制；批量表格走 `mergeFiles()`。

## 截图与文档
- **动公共区域（导航）＝全部截图过时**，整套重拍并逐张确认（1440×900、1x、亮色、清 `.toast`）。脚本 `/tmp/imgh/shoot-all.js` 一次 12 张（带名字只拍一张），格式转换 / 对比 / SQL / 时间 / 二维码要手工装内容。两个坑：**灌 CodeMirror 别只写 `textarea.value`**（SQL 页没桥接，用 `el.nextElementSibling.CodeMirror`）；**脚本拼多行用 `String.fromCharCode(10)`**，`'\n'` 会成字面量。按文字找按钮加 `offsetParent !== null`。
- 只留 README 引用的截图，改完双向校验；README = 简介 + 主图 → 一览表 → 按页分节 → 通用能力，中英一一对应。

## CI（GitHub Actions）
- **锁文件里不许留本机镜像地址**：本机 npm 配的是 `mirrors.cloud.tencent.com`，一执行 `npm install` 就把 `package-lock.json` 的 `resolved` 全写成镜像；GitHub runner 连不上，装依赖 1.5 分钟后以 **112 / 152** 退出（不是 1，看板只报 1 error，很像测试挂）。现在锁文件是 `registry.npmjs.org`（integrity 已核对，两边同一份 tarball），并用 `.npmrc` 的 `replace-registry-host=always` 兜底：安装时按当前 registry 换 host，本机走镜像、CI 走公共源，互不影响（npm 默认 `npmjs` 只替换 npmjs 那个 host，救不了反方向）。CI 用 `npm ci`（锁与依赖对不上就当场失败）。
- **CI 里的脚本静态检查要先摘 HTML 注释**：`/<script>([\s\S]*?)<\/script>/` 会被注释里那句纯文字 `<script>` 骗到，把注释尾巴当代码解析，报 `Invalid or unexpected token`（真踩过）。`tests/assets.test.js` 也有一条同样的断言守着内联脚本，注释里别写裸 `<script>`。
- CI 跑的是 `npm ci` → `npm test`（20 个套件）→ 冒烟 → 清单 / 内联脚本 / classic script 检查；`actions/*` 用 v5（v4 跑在 Node 20 上会挂 deprecation 警告）。

## 工具坑
- macOS BSD grep 不支持 `\s` / `\|`：用 `grep -E` 或 Grep 工具；`index.html` 用 `sed -n` 取段。
- 批量插 i18n 用 node 脚本按锚点插入，插完必跑 i18n 测试。**插在一段最后一项后面要自己补逗号**（项本身常常没逗号），漏了就 `SyntaxError: Unexpected identifier`。
- 真 Chrome 验沙箱用 flatten 会话（`Target.setAutoAttach({flatten:true})` + `sessionId`）。
- jsdom 外部脚本时机不稳：`window.DBXxx` 取不到就 `|| null` + 常量兜底，测例用 `beforeParse` 注入。**整页 jsdom 在本机会被系统杀掉（exit 137）**，全流程只能上真 Chrome。
- **headless Chrome 必须加 `--no-sandbox --in-process-gpu`**，否则 `sandbox initialization failed` → `GPU process isn't usable` → exit 133 什么都不输出。
- **截图别反复 `--screenshot`**（每张都要重启一次 Chrome，还会反复触发「Chrome 清理自签副本」的权限确认）：写一个 CDP 脚本（node 22 自带 `WebSocket`，不用 puppeteer）一次启动跑完步骤表，`Page.captureScreenshot` 逐张落盘。
- 判元素可见**别用 `offsetParent !== null`**：`position: fixed` 的浮层 offsetParent 恒为 null，会被误判成隐藏。用 `hidden` + `getBoundingClientRect()` 的宽高。

## 主题变量
- **只写 `var(--x, #fff)` 而不定义 `--x`，等于暗色主题永远取白**：`--surface` / `--surface-muted` 就这么把 SQL 编辑区变成暗色里的一块白板。新增变量一律在 `:root` 与 `[data-dbx-theme="dark"]` 两处都定义（优先跟随宿主 `--color-*`）。
- 空徽标 / 空胶囊一律 `:empty { display: none }`，别让占位元素冒充内容。

## 待办
- 接宿主选中内容（`dbxPlugin.context` + `onContext()`）；最近使用缺持久化与面板（`flow.recentPush()` 已就绪）。
