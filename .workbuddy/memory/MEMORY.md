# 项目约定（长期）

## 硬规范
- 不打 tag、不建分支；提交 / push 由用户确认。**版本号以 `manifest.json` 为准**，`package.json` / CHANGELOG 顶段 / `.dbx-store.json` 对齐它；**升不升版本由用户说**。
- **不用用户给的真实数据**（接口返回、截图、表名字段）：代码 / 夹具 / 文档 / 截图 / 提交信息一律自造样本。
- 组件统一 shadcn，原生 `<select>` 换自绘 `.custom-select`（`.disabled` 是空转，断言用 `hasAttribute`）；CSS 变量带 fallback。
- 编辑器默认 CodeMirror 5，唯一例外是图片 Base64 页（判据：会不会吞 MB 级字符串）。
- 踩过的坑写进本文件。

## 国际化
- 新增文案 14 语齐全（zh-CN / zh-TW / en / ja / ko / es / id / it / pl / pt / ru / th / tr / az）；新页面开独立小表（`QR_I18N` …），别撑大字典。
- 回退链「当前语言 → en → 主字典 → zh-CN」；占位符 `{n}` 可调序不可丢；语言头正则要兼容无引号键。
- 改完必跑 `node tests/i18n.test.js`。

## 宿主 / 沙箱
- **没有本地存储**：opaque origin 下 `localStorage` / `cookie` 抛 SecurityError。用 `dbxPlugin.storage`（manifest `host.storage` + `capabilities.storage`），再退 `localStorage`、`window.name`（srcdoc 重载保留，**新建 iframe 就丢**）、内存。
- CSP 只放行 `script-src 'unsafe-inline' blob:`；第三方库以 `<script type="text/plain" src>` 文本副本存放，进页包成 `blob:` 执行，失败不缓存 promise。
- **宿主用正则扫 HTML 收资源**：注释 / 字符串里假的 `<script src>` 也会被扫，读不到就整页 400（`tests/assets.test.js` 守着）。
- 宿主给没 `title` 的按钮补英文提示：写 `data-i18n-title` 或让 `stripHostTooltips()` 摘掉，动态内容标 `data-keep-title`。
- `dbx-plugin dev` 只有 `ready`/`context`/`locale`/`theme`/`request`/`invoke`/`stream`/`notify`/`sendBinary`：没有 `storage` 也没有 `fileTransfer`（dev 导出不了是预期，别为它改正式逻辑）。

## 架构
- 功能页 = 独立 `<section id="xxxWorkspace">` + `xxxModeActive` + `enter/exitXxxMode` + `exitOtherModes('xxx')`，并在 `currentPageId()` / `pageImportTargets()` 登记。
- 纯逻辑抽 `ui/js/xxx.js`（挂 `window.DBXxx`），UI 留 `index.html`；新测试文件同时进 `run_tests()` 与 `package.json` 的 `test`。
- 保存 / 导出唯一入口 `saveTextFile()` / `saveBinaryFile()`，返回 `host`/`browser`/`cancelled`/`failed` 四态，调用方一律 `saveToast(status, okText)`；中途失败先 `cancel(handleId)`。绝不能不分成败都弹「已导出」。
- **导入不换页**：`importKindForPage()` 决定这页吃什么，三入口同一通道；>2 M 字符只载入不自动转换。
- 读编辑器内容用 `el.CodeMirror.getValue()`（`textarea.value` 是空）；换算出来的数值不带千分位。

## 页级坑
- **导航**：`#navToggle` 加 `body.nav-left`，「格式转换」`#navConvert` 也进左列且菜单 `position: static`；`syncNavLeftStack()` 按 `navConvert.bottom` 定 `#navLinks.top` + `ResizeObserver`；左侧 >768px 时 `layoutNav()` 短路。**加导航项会挤掉项**（1440 下 11 项要 0.65rem padding），冒烟的导航断言（直属项数 / 「更多」菜单集合 / `pageOf`）三处都要同步。
- **二维码**：qrcode-generator 默认按 latin-1 取字节（中文必乱码），`matrixOf()` 里切 `stringToBytesFuncs['UTF-8']`；解码库 jsQR 251 KB 只在切「解码」时懒载，串行泵 + 长边压 1600 + 解完释放位图。**中心图标必须把纠错顶到 H**：按 22% 遮挡实测 L / M / Q 都解不回来（`tests/qr.test.js` 钉着），图标先缩到长边 256 的 PNG 再用，否则每张卡片的 SVG 都嵌一份原图。
- **时间转换**：结果卡要 `flex-shrink: 0`；相对时间不进批量复制；`scrollIntoView` 前判 `typeof === 'function'`（jsdom 没实现）。
- **图表**：出图不跟主题；预览 1:1 靠 `flex-start` + `margin:auto`；导出 PNG 显式传 `pixelRatio`；测试 stub 掉 echarts。
- **表格 / 拖放**：`textLooksBinary()` 拦二进制；批量表格走 `mergeFiles()`。

## 截图与文档
- **动公共区域（导航）＝全部截图过时**，必须整套重拍并逐张确认（1440×900、1x、亮色、清 `.toast`）。脚本 `/tmp/imgh/shoot-readme-all.js`，部分页需手工装内容（`shoot-readme-main/-fill/-sql/-time.js`）。判断内容进没进去用 `CodeMirror.getValue()`；按文字找按钮加 `offsetParent !== null`（同名 chip 多处）。
- 只留 README 引用的截图，改完双向校验；README = 简介 + 主图 → 一览表 → 按页分节 → 通用能力，中英一一对应。

## 工具坑
- macOS BSD grep 不支持 `\s` / `\|`：多模式用 `grep -E` 或 Grep 工具；`index.html` 一万七千行用 `sed -n`。
- 批量插 i18n 用 node 脚本按锚点插入，插完必跑 i18n 测试。
- 真 Chrome 验沙箱用 flatten 会话（`Target.setAutoAttach({flatten:true})` + `sessionId`）。
- jsdom 里外部脚本时机不稳：`window.DBXxx` 取不到就 `|| null` + 常量兜底，测例用 `beforeParse` 注入。

## 待办
- 接入宿主选中内容（`dbxPlugin.context` + `onContext()` → `flow.pickHostText()`）。
- 最近使用 / 常用片段：`flow.recentPush()` 已就绪，缺持久化与面板。
