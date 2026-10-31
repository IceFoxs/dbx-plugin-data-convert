# 方案：编辑器选区右键菜单（全项目 CodeMirror 通用）

> 一句话：在**任何一个 CodeMirror 编辑器里选中一段内容右键**，就地完成「复制 / 粘贴图片 / 编码解码 / 整理 / 生成 SQL / 转二维码」，结果直接进剪贴板，不改动用户原始内容。

---

## 1. 目标与边界

**要做**

- 全项目 ~15 个 CodeMirror 实例（格式转换、对比、SQL 转换、表格、代码生成、查询校验、转义、字节、时间、图表、SQL 分析、二维码输入）统一一个右键菜单，不逐页实现。
- 转换结果**只写剪贴板**，默认不改编辑器内容；唯一例外是「粘贴图片」——它按用户意图插入文本（见 §4）。
- 图片直接粘：剪贴板里的图片 → Base64 / Data URI / `<img>` 标签，插到光标处或替换选区。
- 选中内容 → 二维码**图片**，PNG 直接进剪贴板（写不进去就退成存文件，沿用现有降级链）。

**不做（第一版）**

- 不动 `<input>` / 非 CodeMirror 的 `<textarea>`（图片页、部分参数框保持原生行为）。
- 不做「替换选区为转换结果」（会改用户数据，风险 > 收益）。预留 `Alt + 点击菜单项 = 替换选区`，第二版再决定。
- 不做「剪贴板历史 / 多步转换管线」。

---

## 2. 菜单结构

标题行写清作用于什么：`选中 3 行 · 128 字符`；没选中时写 `未选中内容`，此时除「复制全部 / 粘贴 / 粘贴图片 / 全选」外全部置灰。

| 分组 | 菜单项 | 说明 |
|---|---|---|
| 基础 | 复制 `⌘/Ctrl+C` | 有选区复制选区，没选区复制全文 |
| | 剪切 `⌘/Ctrl+X` | 只读编辑器隐藏 |
| | 粘贴 `⌘/Ctrl+V` | 走 `readClipboardText()` |
| | **粘贴图片** ▸ | 子菜单：`Base64` / `Data URI` / `<img src>`，见 §4 |
| | 全选 `⌘/Ctrl+A` | |
| 转义 | Base64 编码 / 解码 | 复用 `DBXEscape.convert`（8 种里挑 4 组进主菜单） |
| | URL 编码 / 解码 | |
| | JSON 转义 / 去转义 | |
| | 转义换行 / 还原换行 | `\n` ⇄ 真换行，日志和代码之间来回搬时最常用 |
| | 更多转义 ▸ | HTML / Unicode / Hex / SQL 字面量 / 正则，各「编码」「解码」两项 |
| 整理 | 去首尾空白 / 去所有空白 | |
| | 按行去重 | 保留首次出现顺序 |
| | 排序 A→Z / 按数值排序 | 数值排序只认能全解析成数字的，否则置灰 |
| | 反转行序 / 加行号 | 行号 `1. ` 前缀，宽度按总行数补零 |
| | 拼接成一行（逗号 / 顿号 / 空格） | 顺带把换行吃掉，粘进 `IN (...)` 之前用得上 |
| | 大写 / 小写 / 标题式 | |
| | 包引号（单 / 双 / 反引号） | 每行各包一层，`'` 内部成对转义 |
| | JSON 美化 / JSON 压缩 | 解析不了就置灰，不做「尽力而为」 |
| SQL | 生成 `IN (…)` / `NOT IN (…)` / `INSERT … VALUES` | 复用 `DBXSql.analyze`，按行拆值、顿号也认；表名用 `your_table` 占位，不跨页取隐式状态 |
| 二维码 | 复制为二维码图片 | PNG 进剪贴板；失败退存文件 |
| | 在「二维码」页打开 | 填进去并切页，批量生成走那一页 |
| 页内扩展 | 执行所选 / 执行当前语句 / 清空 SQL | **仅**「SQL 分析」页的两个编辑器，见 §6 |

四个约束：

1. **打开即冻结**：右键会把选区弄没，`contextmenu` 里先取 `getSelection()` 与 `indexFromPos`，动作全用快照（`19-datasql.js` 的 `dataSqlCtxShow` 已经这么干）。
2. **只接管编辑器内**：`document` 上挂一个捕获阶段的 `contextmenu`，命中 `.CodeMirror` 才 `preventDefault()`，别处保持原生（宿主里原生菜单本来也被屏蔽，不额外处理）。
3. **只读编辑器**：`.CodeMirror` 上 `cm.getOption('readOnly')` 为真时，剪切 / 粘贴 / 粘贴图片隐藏，其余转换仍可用（复制不需要可写）。
4. **成功必须看得见**：每条动作给 toast：`Base64 编码 · 已复制（2.1 KB）`、`已插入图片 1280×720 · 412 KB`。失败给具体原因，不出「操作完成」这种空话。

---

## 3. 交互细节

- 定位：`fixed` 挂 `body`，按指针位置摆再按视口收边（复用 `dataSqlCtxShow` 的算法）；子菜单左侧放不下就翻到左边。
- 键盘：`↑↓` 移动（跳过分隔线与禁用项）、`→` 展开子菜单、`←` 收起、`Enter` 执行、`Esc` 关闭；菜单打开期间 `stopPropagation`，否则 `⌘C` 会被 CodeMirror 先吃掉。
- 收起时机：点别处、`Esc`、滚动、改窗口大小（沿用现有实现）。
- 触发方式只有右键；不抢 CodeMirror 自带的 `⌘D`/`⌘F` 等快捷键。
- 大文本保护：选区 > 1 M 字符时只保留「复制 / 生成 SQL / 二维码页打开」，编码与整理置灰并提示「内容过大」（`DBXEscape.LIMITS.chars` 的上限对齐）。

---

## 4. 粘贴图片

**三条取图路径，按顺序尝试，全部失败才提示**

1. `navigator.clipboard.read()`（Chromium / 浏览器预览）：拿 `image/*` 的 Blob。
2. 宿主 `dbxPlugin.clipboard.readImage()`：有就用（宿主若没这个能力，跳过）。
3. `paste` 事件兜底：菜单项文案改成「按 `⌘V` 粘贴图片」，同时在每个编辑器上挂 `paste` 监听，`e.clipboardData.items` 里出现 `image/*` 就拦下来自己处理——这是宿主 WebView 里唯一稳的一条路。

> 关键：第 1、2 步被拒时**不要静默失败**，要说清「当前环境不允许读剪贴板图片，请用 ⌘V」。这是本项目踩过的坑（导出、剪贴板都栽在「点了没反应还说成功」上）。

**三种输出**（子菜单）

| 选项 | 结果 |
|---|---|
| Base64 | 裸串（与「图片 Base64」页默认一致） |
| Data URI | `data:image/png;base64,…` |
| `<img>` 标签 | `<img src="data:image/png;base64,…" alt="" />` |

**落点与阈值**

- 有选区 → 替换选区；无选区 → 插到光标处。插入后 `cm.setCursor` 移到末尾、`scrollIntoView`。
- 体积：≤ 2 MB 直接用；2–10 MB 先问一次（toast 说明 Base64 会更大）；> 10 MB 拒绝（`DBXImg.LIMITS.maxImageBytes`）。
- 编码走 `DBXImg.bytesToBase64Async`（分块，不卡主线程），大图期间菜单已关，给一个「正在转换…」的 toast 占位。

---

## 5. 二维码

- **容量**：单张二维码字节容量按纠错级别封顶（`BYTE_CAP = {L:2953, M:2331, Q:1663, H:1273}`）。选中内容超出时菜单项置灰，标题写「超出单张容量，改用二维码页批量生成」，点了就跳到二维码页。
- **参数固定**：512×512、纠错 M、前后景纯黑白、边距 4——不读二维码页上一次的实验值，右键的结果要可预期。
- **复制**：`DBXQr.matrixOf` → `drawToCanvas` → `canvas.toBlob('image/png')` → `ClipboardItem`；写不进去就用现成的 `qrCopyImage()` 降级链存 PNG 并给出文件名。**这段逻辑直接抽成公共函数**，二维码页与新菜单共用，不再写第二份。

---

## 6. 与「SQL 分析」现有右键菜单的关系（**最终实现：不合并，让路**）

> 原本的方案是删掉 `19-datasql.js` 的 `#dataSqlCtx`、改成注册扩展项。实施时按需求改为**一行都不动 SQL 分析页**：那一页的「执行所选 / 执行当前语句 / 清空 SQL」保持原样，新菜单主动让开。

新模块提供 `EditorMenu.exclude(cm)`：登记过的编辑器，通用菜单的 `contextmenu` / `paste` 监听直接跳过（`selCmOf()` 返回 `null`），事件继续走到这一页自己的监听上。

```js
// 19-datasql.js 的 dataSqlBindCtxMenu() 里加十行
const cm = el.CodeMirror;
if (window.EditorMenu) window.EditorMenu.exclude(cm);
else (window.__selMenuExcludes = window.__selMenuExcludes || []).push(cm);
// 21 在初始化时消费队列（19 先加载，那时 EditorMenu 还没定义）
```

- 回归点：SQL 页右键仍然只弹「执行所选 / 执行当前语句 / 清空 SQL」，通用菜单不出现；`⌘V` 粘文本的行为也不变（通用菜单不接管这一页的 paste）。
- `EditorMenu.register(cm, items)` 仍然保留：以后哪一页想「通用项 + 自己的几项」，直接登记即可，不用改新模块。

---

## 7. 代码结构

**新增**

| 文件 | 职责 | 体积估计 |
|---|---|---|
| `ui/js/selectconv.js` | 纯函数：选区文本 → 转换结果，**无 DOM**（转义类内部调 `DBXEscape`，SQL 类调 `DBXSql`，均以注入方式拿） | ~9 KB |
| `ui/js/app/21-editor-menu.js` | 菜单 UI：结构生成、定位、子菜单、键盘、动作派发、剪贴板、图片粘贴、二维码复制；`SEL_I18N` 表 | ~14 KB |
| `tests/selectconv.test.js` | 纯函数回归（~40 条） | — |

**修改**

| 文件 | 改动 |
|---|---|
| `ui/index.html` | `<div id="selMenu" class="sel-menu" hidden role="menu">`（静态骨架 + 分隔线，菜单项由 JS 按分组生成）；末尾加 `js/app/21-editor-menu.js` |
| `ui/css/app.css` | `.sel-menu` 系列：直接复用 `.datasql-ctx` 的令牌与尺寸，只加 `.sel-menu-sub`（二级面板）与 `.sel-menu-item .kbd`（快捷键提示） |
| `ui/js/app/19-datasql.js` | 删旧菜单与绑定，改调 `EditorMenu.register` |
| `ui/js/app/18-flow.js` | `qrCopyImage()` 里的「画布 → PNG → 剪贴板 → 降级存盘」抽成公共函数，两处共用 |
| `tests/i18n.test.js` | `tables` 列表加 `SEL_I18N` |
| `tests/ui.smoke.js` | +6 条：右键弹菜单、无选区时禁用、点「Base64 编码」写剪贴板、粘贴图片插入 Base64、二维码超容量置灰、SQL 页扩展项在 |
| `package.json` / `scripts/build.sh` | 测试链加 `tests/selectconv.test.js` |

**接口草图**

```js
// ui/js/selectconv.js  —— 纯函数，node 可测
Convert.list()                        // [{ id, group, shortcut? }] 供菜单渲染
Convert.run(id, text, ctx)            // -> { ok: true, text, note } | { ok: false, code }
Convert.LIMITS                        // { maxChars: 1e6 }
// ctx: { escape: DBXEscape, sql: DBXSql, table: 'your_table' }

// ui/js/app/21-editor-menu.js  —— UI
EditorMenu.bind()                     // 页面加载时调一次：挂 document 捕获阶段 contextmenu
EditorMenu.register(cm, items)        // 页内扩展项（SQL 分析用）
EditorMenu.open(x, y, cm)             // 内部：冻结选区 → 建菜单 → 定位
```

---

## 8. 文案与 i18n（14 语言）

**复用（不新增翻译）**

- 主字典：`copyBtn` / `pasteBtn` / `clearBtn`。
- `ESC_I18N`：`escKindUrl|Base64|Html|Json|Unicode|Hex|Sql|Regex` × `escEncode|escDecode` → 「Base64 编码」这类标签直接拼出来，16 个菜单项零成本。
- `NAV_I18N.navQr`（二维码页名）、`SQL_I18N.sqlTplList` 等。

**新增约 22 个键**（× 14 语言 = 308 条）

```
selHead('{lines} 行 · {chars} 字符')  selNone      selCopyAll   selCut      selPasteImage
selImgB64   selImgDataUri  selImgTag   selMoreEscape  selTidy
selTrim     selStripWs     selDedupe   selSort      selSortNum  selReverse  selNumber
selJoinComma selJoinSpace  selUpper    selLower     selTitle    selQuote
selJsonPretty selJsonMinify selSqlIn   selSqlNotIn  selSqlInsert
selQrCopy   selQrOpen      selQrTooLong selNoImage  selImgTooBig selClipboardDenied
selCopied('{what} · 已复制（{size}）')
```

`tests/i18n.test.js` 会强制「14 种语言键集合一致 + 无空译文 + 占位符不丢」，漏一种就红。

---

## 9. 测试计划

| 层 | 内容 |
|---|---|
| 纯函数（`tests/selectconv.test.js`） | 每个 action 至少一条；边界：空串、只有空白、单行、CRLF、超长（触发 `selTooLarge`）、JSON 非法（置灰而不是报错）、数值排序混入非数字、引号内含 `'`、Base64 往返一致、SQL 生成与 `DBXSql.analyze` 结果对齐 |
| UI smoke（jsdom） | 右键在编辑器上 → 菜单出现且 `hidden=false`；点空白处 → 收起；无选区 → 转换项 `disabled`；点「Base64 编码」→ 桩 `dbxPlugin.copy` 收到正确字符串；`paste` 带 `image/png` → 编辑器内容以 `data:image/png;base64,` 开头；SQL 页右键 → 三个扩展项在 |
| i18n | 新表 14 语言一致（自动） |
| 手工矩阵 | Chrome 预览 / DBX 宿主 × 亮暗主题 × 左侧/顶部布局；只读编辑器；超大选区；宿主的 `⌘V` 粘图 |

---

## 10. 体积与性能

- 新增源码约 30 KB（其中 i18n 约 5 KB），包体 1.20 MB → 约 1.23 MB，离宿主 8 MB 上限很远。
- 纯 JS 无依赖，与现有「不联网、离线可用」一致。
- 菜单是**用时才建**：`bind()` 只挂一个监听；点击右键才建 DOM（约 30 个节点），关闭即 `hidden`，不销毁重建（参考 `pane-badge` 那类反复重绘踩过的坑）。
- 大文本转换在主线程做，1 M 字符以上先拦（编码类可能到 4 倍膨胀）。

---

## 11. 风险与取舍

| 风险 | 处理 |
|---|---|
| 宿主 WebView 拒绝 `clipboard.read()` | 走 `paste` 事件兜底 + 明确文案，不假装成功 |
| 宿主拒绝 `clipboard.write([ClipboardItem])` | 复用现有「存文件」降级，toast 报出文件名 |
| 右键清空选区 | 打开菜单前冻结快照（现有代码已有先例） |
| 菜单与 CodeMirror 快捷键打架 | 菜单打开时 `stopPropagation`，关闭后恢复 |
| 两套右键菜单并存 | 删旧的 `#dataSqlCtx`，统一入口 + 注册扩展项 |
| 菜单项太多（30+）不好找 | 主菜单只留高频 12 项，其余进「更多转义 / 粘贴图片 / 生成」子菜单 |
| 转换悄悄改了内容 | 除「粘贴图片」外只写剪贴板；「粘贴图片」在 toast 里说明插入了什么、多大 |

---

## 12. 里程碑（每步都能单独交付）

1. **M1 骨架**：`21-editor-menu.js` + HTML/CSS + 基础五项（复制/剪切/粘贴/全选/关闭逻辑）+ 定位与键盘。此时已经是可用的「统一右键菜单」。
2. **M2 转换**：`selectconv.js` 的整理类 + 转义类（复用 `DBXEscape`），含 JSON 美化/压缩置灰规则；`tests/selectconv.test.js` 跟上。
3. **M3 SQL 与避让**：生成 IN / NOT IN / INSERT；给 `EditorMenu` 加 `exclude()`，SQL 分析页登记后保持原菜单（原计划的「删旧菜单合并」已取消）。
4. **M4 二维码**：抽公共 `copyPngToClipboard()`，接「复制为二维码图片」「在二维码页打开」。
5. **M5 粘贴图片**：三条取图路径 + 三种输出 + 体积阈值。
6. **M6 收尾**：i18n 14 语言补齐、smoke 用例、README / CHANGELOG / 描述 / releaseNotes 同步（**不自己改版本号**，由你定）。

实施中补的两条交互修正：

- **菜单内滚动不能关菜单**：`scroll` 不冒泡，但捕获阶段 window 会收到菜单内部滚动，原先「一滚就收起」表现为「滚轮点不动」。`selOnScroll` 跳过菜单内部目标。
- **隐藏滚动条**：`.sel-menu-list` / `.sel-menu-sub` 用 `scrollbar-width: none` + `::-webkit-scrollbar { width: 0 }`，滚动能力保留、视觉上不出现灰槽。

工作量粗估：M1–M3 是主体（约 500 行），M4–M5 各约 120 行，M6 主要是文案与验证。
