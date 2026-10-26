# 项目约定（长期）

## 硬规范
- 不打 tag、不建分支，提交由用户确认。**版本号以 `manifest.json` 为准**，`package.json` / CHANGELOG 顶段 / `.dbx-store.json` 对齐它；升不升版本由用户说。
- **每次改功能都要同步发布物料**（用户 2026-10-26「每次记得更新」）：CHANGELOG 当前段 → `manifest.json` 描述 → `.dbx-store.json` 的 description（含各语言）/ releaseNotes / tags → README 中英 → 截图；条数用实测值。
- **不用用户的真实数据**（接口、截图、表名字段），一律自造样本。
- 组件统一 shadcn，原生 `<select>` 换自绘 `.custom-select`（`.disabled` 空转，断言用 `hasAttribute`）；CSS 变量带 fallback。
- 编辑器默认 CodeMirror 5，唯一例外是图片 Base64 页（判据：会不会吞 MB 级字符串）。

## 国际化
- 新文案 14 语齐全；新页面开独立小表（`QR_I18N` …），别撑大字典。回退「当前语言 → en → 主字典 → zh-CN」；占位符 `{n}` 可调序不可丢；语言头正则兼容无引号键。改完跑 `node tests/i18n.test.js`。

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
- **导航**：`#navToggle` 加 `body.nav-left`；「格式转换」也进左列，菜单 `position: static`；`syncNavLeftStack()` 按 `navConvert.bottom` 定 `#navLinks.top` + `ResizeObserver`；左侧 >768px 时 `layoutNav()` 短路。**加导航项会挤掉项**：11 项要 `padding: .4rem .45rem` + `gap: .25rem` + `font-size: .8125rem`（1440 容器 948 / 内容 877，余 71px；`0.65rem` 只够 10 项）。冒烟导航断言（直属项数 / 「更多」集合 / `pageOf`）三处同步。
- **二维码**：qrcode-generator 默认按 latin-1 取字节（中文必乱码），`matrixOf()` 切 `stringToBytesFuncs['UTF-8']`；jsQR 251 KB 只在切「解码」时懒载，串行泵 + 长边压 1600 + 解完释放位图。**中心图标必须把纠错顶到 H**（L / M / Q 解不回，测试钉着）；图标先缩到长边 256 的 PNG，否则每张卡片都嵌一份原图。
- **单张导出面板**：卡片「导出」开模态（`#qrExportMask`），格式 / 尺寸 / 文件名当场定，落盘只走 `qrExportOne()` 一个口子；名字净化在 `QR.fileNameFor()`（纯函数，单测钉着）。`qrRenderGrid()` 与 `exitQrMode()` 都先关面板（重绘后序号会指错张）；改格式 / 尺寸即写 `qrExportPref`（只在确认时记会漏掉取消场景）。`.btn-primary` 全局 `flex:1`，面板里要 `flex:0 0 auto`。
- **卡片内容预览不许 `max-height` 硬裁**：单张（`is-single`）要完整摊开、超高才滚（20rem）；网格用 `-webkit-line-clamp: 2` 收尾带省略号。硬裁看起来就像「只生成了三行」（用户报「内容不完整」）。jsdom 不做布局，靠 `tests/assets.test.js` 静态校验样式表钉着。
- **双击放大**：码面 `dblclick` → 复用图片页灯箱 `lbOpen(src, label, opener)`（滚轮 / 双击 1:1 / Esc 全都有）。大图必须 `svgMarkup(…, size: 1024)` **重新矢量画**，别拿卡片那张 256 的位图拉伸；交给 `<img>` 用 `data:image/svg+xml;charset=utf-8,` + `encodeURIComponent`。标题 `lbLabel(QR.shortLabel(text, 32), 1024, 1024)`。**换页时 `exitQrMode()` 要 `lbClose()`**，否则灯箱跟着盖到别的页上。
- **时间**：结果卡 `flex-shrink: 0`；相对时间不进批量复制；`scrollIntoView` 前判 `typeof === 'function'`（jsdom 没实现）。
- **图表**：出图不跟主题；预览 1:1 靠 `flex-start` + `margin:auto`；导出 PNG 显式传 `pixelRatio`；测试 stub 掉 echarts。
- **表格 / 拖放**：`textLooksBinary()` 拦二进制；批量表格走 `mergeFiles()`。

## 截图与文档
- **动公共区域（导航）＝全部截图过时**，整套重拍并逐张确认（1440×900、1x、亮色、清 `.toast`）。脚本 `/tmp/imgh/shoot-all.js` 一次 12 张（带名字只拍一张），格式转换 / 对比 / SQL / 时间 / 二维码要手工装内容。两个坑：**灌 CodeMirror 别只写 `textarea.value`**（SQL 页没桥接，用 `el.nextElementSibling.CodeMirror`）；**脚本拼多行用 `String.fromCharCode(10)`**，`'\n'` 会成字面量。按文字找按钮加 `offsetParent !== null`。
- 只留 README 引用的截图，改完双向校验；README = 简介 + 主图 → 一览表 → 按页分节 → 通用能力，中英一一对应。

## 工具坑
- macOS BSD grep 不支持 `\s` / `\|`：用 `grep -E` 或 Grep 工具；`index.html` 用 `sed -n` 取段。
- 批量插 i18n 用 node 脚本按锚点插入，插完必跑 i18n 测试。
- 真 Chrome 验沙箱用 flatten 会话（`Target.setAutoAttach({flatten:true})` + `sessionId`）。
- jsdom 外部脚本时机不稳：`window.DBXxx` 取不到就 `|| null` + 常量兜底，测例用 `beforeParse` 注入。

## 待办
- 接宿主选中内容（`dbxPlugin.context` + `onContext()`）；最近使用缺持久化与面板（`flow.recentPush()` 已就绪）。
