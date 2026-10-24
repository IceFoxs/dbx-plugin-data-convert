# 项目约定（长期）

## 文档与截图（用户明确要求，务必遵守）

1. **截图必须与当前版本一致**：任何改到 UI（导航项、布局、文案、主题）的版本，都要重拍 README 里用到的截图，不能留着上一版的界面。判断标准：导航项、页面结构、按钮文案要与当次打包的 `ui/index.html` 完全对得上。
2. **README 只保留核心功能页面的截图**：每个一级功能页一张（当前 7 张：格式转换主图 + JSON 对比 / SQL 转换 / 图片 Base64 / 转义工具 / 代码生成 / 查询校验 / 表格转 JSON）。细节截图（滚动、弹层、暗色、窄屏、各种状态）不进 README。
3. **及时删除无效截图**：不再被 README 引用的 `docs/*.png` 直接删掉，不要攒着占地。改完用脚本校验「README 引用 → 文件存在」和「docs 里的文件 → 是否被引用」两边都干净。
4. 截图规格：**1440×900、1x 原生像素、亮色主题**（`--force-device-scale-factor=1`；2x 缩到 795 px 显示会把 1px 边线抹掉）。示例数据全部用模拟数据，不出现真实业务内容。
5. 截图前清理 `document.querySelectorAll('.toast')`，否则会把上一个场景的「转换成功」带到下一张图里。

## README 结构约定

- 顶部：一句话简介 + 主图 + 中文文档链接。
- 「功能页一览」表格（页面 → 能做什么）先给全貌，再按页分节展开（每节 2–5 条短句 + 一张截图）。
- 通用能力（i18n / 主题 / 剪贴板 / 离线）单独一节，不混在功能页里。
- 中英文两份 README 结构、条目顺序一一对应；用例条数、目录结构、导航项文案必须同步更新。

## 国际化（用户明确要求，别再漏）

1. **新增文案必须 14 种语言齐全**：zh-CN / zh-TW / en / ja / ko / es / id / it / pl / pt / ru / th / tr / az。只补中英是最容易犯的错——宿主 locale 是日语 / 韩语 / 俄语时，页面会露出中文兜底。
2. 文案分九处：主字典 `languageConfigs[].dict`（工具栏、对比、错误定位）、`NAV_I18N`、`SQL_I18N`、`SHEET_I18N`、`IMG_I18N`、`GEN_I18N`、`CONF_I18N`、`QUERY_I18N`、`ESC_I18N`、`FLOW_I18N`。新增页面用独立小表，别把 14 份大字典再撑一圈。
3. 取值一律 `xxxT(key, '中文兜底')`，回退顺序为「当前语言 → 英文 → 主字典 → 中文」；JS 里不硬编码中文（含行列定位、单位、标点、拼接串）。
4. 占位符用具名 token（`{n}` / `{size}` / `{e}` / `{p}` / `{m}` / `{c}` / `{s}`），各语言可以调整语序，但 token 不能丢、也不能多。
5. 改完跑 `node tests/i18n.test.js`（已进 `npm test` 与 `scripts/build.sh`）：校验语言集合、键集合与 zh-CN 对齐、无空译文、占位符齐全。语言菜单只列 zh-CN / zh-TW / en，其余靠宿主 locale 自动匹配。

## 宿主兼容（DBX 会往插件 DOM 里塞东西）

1. **按钮不要裸奔**：DBX 会给没写 `title` 的按钮补一个提示，用的是**宿主自己的词表**——中文界面会冒出英文 "Paste"，还盖住相邻按钮。凡是按钮，要么写 `data-i18n-title`（文案跟着插件语言），要么接受被 `stripHostTooltips()` 摘掉；只有动态内容的提示（导出格式与后缀、当前格式对）才标 `data-keep-title` 放过。
2. 插件里不自己造 tooltip 系统：按钮都有可见文字，原生 `title` 只在「文字表达不了」时才用（图标按钮、动态内容）。
3. 宿主注入的时机不确定（加载后 / 移入时 / 重新渲染），拦截要三层：初始化 sweep + 捕获阶段 `pointerover` + `MutationObserver`（`attributeFilter: ['title']`），只监听单个属性，成本可忽略。

## 性能与稳定性（硬性要求，每个版本都要守）

DBX 是宿主进程，插件页面把宿主拖崩就是事故。新增功能时按这几条自查：

1. **入口限流**：任何能吞下大对象的功能都要先划上限并在入口拦下、把上限写在界面上（当前：图片 10 MB / Base64 14 M 字符，表格 20 MB / 10 万行 / 200 列）。
2. **大字符串不驻留**：超过 2 M 字符的中间结果不要留引用，只存长度 + 切片预览，真正需要时临时拼一次并立刻释放（图片页 `imgState.text` 就是这么做的）。
3. **预览不要用 data URI**：图片预览用 `URL.createObjectURL`，并在清空 / 换图 / 重置 / 卸载时 `revokeObjectURL`，否则泄漏的是整张图的内存。
4. **长任务分块 + 可取消**：超过几十毫秒的循环每 1 MB / 4096 条 `await setTimeout(0)` 让出主线程，配进度条和取消 token；切文件时旧任务必须作废，不能覆盖新结果。
5. **预分配 + 快路径**：编解码用预分配 `Uint8Array`（`encodeUtf8` 写码点、8 KB 一段 `fromCharCode`）；正则规范化的输入先判「干净且 4 对齐」直接返回，避免对 10 MB 字符串做多次全量替换。
6. **验收数据**（改动涉及图片/表格/转换核心时必测）：冷启动 DOMContentLoaded ≈500 ms、JS 堆 ≈9.5 MB、≈535 节点；8 MB 图编码 ≈250 ms 且编码后堆不涨；反复进出页面 5 次堆与节点数不变。测法见 `/tmp/imgh/load5.js`（CDP `Runtime.evaluate` + `performance.memory`）。
7. **不引入网络依赖**：不加 CDN、不加遥测、不在首屏做同步 XHR；第三方库必须本地打包（`ui/vendor/`，构建时从 npm 取、运行时不联网）。

## 编辑器选型（用户明确要求，别再拿性能当理由退回 textarea）
1. **默认一律用 CodeMirror 5**（本地 `ui/vendor/codemirror`）：格式转换、差异对比、JSON 对比、SQL、表格输出、代码生成、查询校验、转义工具、字节转换都是 CM（字节页右侧是 HTML 结果面板，只有左侧输入是 CM），别再出现第二个纯 textarea 输入/输出页。
2. **唯一的例外是图片 Base64 页**：那里可能塞进 10 MB 图片 / 13 M 字符的 Base64，CM 会卡死宿主，才用纯文本域。判断标准是「会不会吞下 MB 级字符串」，不是「嫌 CM 重」。
3. 新哲学时期盼的产物语言如果没有内置 mode，从 npm 拉 CodeMirror 5.65.16 的同版 mode 文件、压缩后放进 `ui/vendor/codemirror/mode/` 并在 `ui/index.html` 里加 `<script>`，不要让某个语言的输出没有着色。
4. CM 与原生 textarea 之间通过 `linkTextareaToEditor()` 桥接 `.value` 读写，所以既有代码与冒烟测试继续用 `el.value` 依然成立；新页面沿用这一套路不要把读写改成 `getValue()`。

## 展示约定（用户 2026-10-22 明确要求）

1. **换算出来的数值一律不带千分位逗号**：这些值要能直接贴进代码 / 命令行 / 配置，`1,234,567,890` 在那里是语法错误。已落地在字节页（`bytesFmt` 用 `String(Number(n))`，别再改回 `toLocaleString`）；其它页面的「字符数 / 条数」这类统计仍可用 `toLocaleString`，那是给人读的计数，不是要复制走的数值。
2. **换算结果要能逐个复制**：字节页三张汇总卡各有「复制」胶囊 + 数字本身可点；表格里 `td.num` 点一下即复制（`cursor: copy` + `title`）。整体复制仍给 TSV。新增类似页面照这个模式做。

## 版本与发布

- **不要自己改版本号**（用户 2026-10-24 第二次强调：「不要自己乱改版本，你为啥记不住呢」）：不升 `manifest.json` / `package.json` 的 `version`，不新建 CHANGELOG 版本段，不动 `.dbx-store.json` 里 `source` 的 `vX.Y.Z`。功能做完就留在当前版本，改不改、改成多少由用户说；**连「先升再回退」也不要干**。
- 版本号三处必须一致：`manifest.json`、`package.json`、`CHANGELOG.md` 顶部段落（`.dbx-store.json` 的 `source` 引用 vX.Y.Z、`releaseNotes` 写最新一版）。
- CHANGELOG 按「新增 / 修复 / 工程化」三类写，条目要能被用户读懂（写清现象与原因），工程化条目给实测数字。
- 打包用 `./scripts/build.sh`（会先跑全部单测再出 `dist/*.dbxp`）；新增测试文件记得同时加进 `scripts/build.sh` 的 `run_tests()` 与 `package.json` 的 `test`。
- **不打 tag、不建分支**（用户 2026-10-22 明确要求，永远遵守）：只在当前分支上提交，版本号同步到文件里就够；`git tag` / `git branch` / `git checkout -b` 一律不做，push 也要先问。

## 后续任务清单

已完成的不再列在这里（二 格式矩阵、三 查询与校验均已上线）。当前只剩下面这些。

### 四、工作流（进行中）

1. ✅ **全局拖放（按当前页，不跳页）**：`ui/js/flow.js` 的 `routeFile()` / `routeBatch()` 只判类型，**不再决定跳哪一页**（用户 2026-10-24 明确要求「在哪个功能就在哪个页面」）。`ui/index.html` 的 `checkDropRoute()` 拿 `dropKindForPage()` 比「当前页能吃哪类」，对不上只 toast 提示去哪一页；`dropLimitFor()` 统一入口体积（图片 10 MB / 表格上限 / 文本 2 MB）。宿主 `onDrop` 与浏览器 `document drop` 两条路共用这一套，`handleDroppedFiles` 也补了 `HOST_DROP_BUDGET` 总预算。
2. ✅ **批量处理**（已做）：一次拖多个表格文件 → `mergeFiles()` 合并成 `{ 文件名: 记录[] }` 的一个 JSON，导出 `batch-N.json`；`sheetState.batch` 独立于单文件状态，切 SQL 输出会退回单文件。
3. ⬜ **接入宿主选中内容**：`window.dbxPlugin.context` + `onContext()` 是宿主给数据的口子（dev-runtime 里确认过：`context` / `onInit` / `onContext`）。用 `flow.pickHostText()` 从任意形状的 context 里挖出选中文本，`classifyText()` 判 json / ddl / sql / text 后路由。**没做完，别忘。**
4. ⬜ **最近使用 / 常用片段**：`flow.recentPush()` 已就绪（条数、单条 16 KB、总预算 256 KB、正文超预算降级为元信息），还缺 localStorage 与工具栏面板。

### 五、字节转换（已完成，0.1.5）

用户先要「并进转义抽屉当第 9 种」，随后两次改口：「支持批量转换」「独立功能」——最终形态是**独立导航页**（导航第 5 项，紧跟「转义工具」），`ui/js/bytes.js` 纯函数 + `#bytesWorkspace` 独立工作区，不进 esc 的 chip 列表。

- 左侧输入一行一值（CodeMirror，非 MB 级所以照规矩用 CM）；右侧是 HTML 结果面板：汇总三卡（精确值 / 1000 制 / 1024 制）+ 批量表格（# / 输入 / 字节 / 两套换算，多行才有合计行）+ 三种写法。
- 解析优先级：`parseSize()` 先吃「数字 + 单位」（`1.5 GB` / `700M` / `1 KiB`），再吃字节序列；序列整串统一进制（混了 a-f 或 0x 就全按 hex），避免 `1f 10` 的 `10` 被当十进制；xxd 行先剥偏移列、再按 `|` 或「两个以上空格」剥 ASCII 列。
- 三种写法往返都要成立：`toHexDump`（偏移是**十六进制**、8 位）/ `toByteArray`（每行 16 个）/ `toBinary`，测试里专门验证「生成再读回」一致。
- 上限：序列 8 KB、数值 1e18、批量 200 行、预览 2 K 字符（复制拿全文）。
- i18n：`NAV_I18N.navBytes` + 新表 `BYTES_I18N`（19 键 × 14 语），i18n 测试已纳入。

### 六、JSON 转图表（已完成，0.1.6）

独立导航页（第 9 项，紧跟「字节转换」），`ui/js/chart.js` 纯函数 + `#chartWorkspace`。用户明确要过「参考 `striezel/echarts-node-export-server`」「用官方 6.1.0」「**默认宽 700 × 高 400**」。

- 输入既可以是完整 ECharts option（`series` 存在即认），也可以只是数据：`points` / `pairs` / `map`，自动判形状挑类型；完整 option 时类型下拉禁用。
- **智能解析是这块的核心竞争力**（用户拿真实接口返回提的需求）：`findInside()` 递归剥外层（≤3 层，键名+内容双打分），认 `{"biz":{"echart_option":"{…}"}}` 这种「业务 key + 序列化字符串」；`collectOptions()` 收集一份或多份 JSON 里的所有 option（预算 300 节点），UI 用 `#chartPick` 下拉切换；`splitJsonDocs()` 自己配平括号切 NDJSON / `{…}{…}`。改这块先看 `tests/chart.test.js` 的「智能解析」「多个 option」「多份 JSON」三节。
- **预览必须 1:1**：`.chart-stage` 是 `justify-content: flex-start` + `.chart-canvas{margin:auto}`（居中布局会让超宽画布左半截滚不回去），并在 `chartApply()` 里用 important 钉住 `max-width/height:none` 防宿主把 canvas 压扁。别加 `object-fit:none`（HiDPI 会毁渲染）。
- **导出与预览共用同一份 `chartResult.option`**（都 `animation:false`）：PNG 走 `chartRenderPng()`（临时实例 + `devicePixelRatio` + 显式 `pixelRatio`，见上节），SVG 走 `ssr:true` 实例 + `renderToSVGString()`。别把这两条路改成各自 build 一次 option，否则两边会不一样。
- 引擎 `ui/vendor/echarts/echarts.min.js`（6.1.0 全量 1.1 MB，Apache-2.0，附 LICENSE）。**不能用 `echarts.simple.min.js`**（缺 radar / treemap / dataZoom）。`loadChartEngine()` 懒加载，失败不缓存 promise；离开页面 dispose。
- 上限：输入 2 M 字符、30 系列、总点 5 万、单系列 2 万、宽高 80–4096（越界夹取并回写输入框 + 说明原因）。
- jsdom 里 echarts 必崩（`clearRect` / `dpr`），所以冒烟测试 stub 掉 echarts 请求只验降级路径；真渲染用 `/tmp/imgh/check-chart.js`（CDP，21 项）。改到图表页后必须跑这三层：`chart.test.js`、`ui.smoke.js`、`check-chart.js`。
- i18n：`NAV_I18N.navChart` + 新表 `CHART_I18N`（32 键 × 14 语）。

### 七、图片页导入（已完成，0.1.6）

1. 解码页（Base64 转图片）选项行有「导入文件」（`#imgImport` → `#imgTextInput`），只读文本：`.txt` / `.b64` / `.json` / `.md` 等；编码页的「选择图片」只吃图片。拖拽两侧都能用。
2. **不换页是硬规矩**（用户 2026-10-24 明确要求）：`imgImportFile()` 先看 `imgMode`，类型不对只 `imgSetTip` 提示（`imgDropTextInstead` / `imgImportImageInstead`），绝不 `setImgMode()`。改这里前先想「会不会把用户从当前页踢走」。
3. 「导出 → 导入」闭环靠 `DBXImg.parseInput()` 里的 `data:` 正则，所以 CSS / HTML / Markdown 三种包装导出的文件也能抓出 Base64 还原成图片。
4. 入口限流：文件 16 MB（`IMG_TEXT_FILE_MAX`），读出后再按 `maxBase64Chars`（14 M 字符）卡一次——字节数过关不代表字符数过关，超了不塞进 textarea（14 M 字符的框会先卡）。
5. 测试：`tests/ui.smoke.js` 三条（入口可见性 / 导入解析 / 二进制拦下），`/tmp/sb/check-imgimport.js` 23 项（含不换页、导出→导入闭环、图片文件被拦）。

## 保存 / 导出（0.1.6 定型，改之前先读这段）

1. **唯一入口**：`saveTextFile(name, text, mime)` / `saveBinaryFile(name, base64, mime)`（`ui/index.html` 约 7200 行）。返回 **`host` / `browser` / `cancelled` / `failed`** 四态，调用方一律 `saveToast(status, okText)` 报结果。**不要再出现「不管成功失败都弹已导出」**——那正是用户两次反馈「导出不生效」的直接原因。
2. **写法照 aes-tools**：`beginSave` 同步调用放进 try/catch 先拿 Promise（宿主同步抛错也能当场接住），写盘在 IIFE 里 `await`；中途失败先 `ft.cancel(handleId)` 再回退浏览器下载。**不要写成 `const handle = await ft.beginSave(...)`**。
3. **`dbx-plugin dev` 里导出不可用是预期**（dev 宿主没有 `fileTransfer`，iframe 是 `sandbox="allow-scripts"` 禁下载）。用户已确认这一点，别为 dev 改正式逻辑，也别在 dev 下假装成功。
4. **验证方法**：`/tmp/sb/check-scale.js` 的思路——拦 `URL.createObjectURL` 拿 Blob，直接读 PNG 的 IHDR（第 16..24 字节大端宽高），比加载图片更可靠。

## 图表像素比（1x / 2x / 3x）

1. 下拉 `#chartScale`（`.custom-select` 自绘），`data-label` 存触发器短标签（`2x`）、`data-value` 存倍率；选项里 `<span class="chart-opt-size">` 显示该档实际像素，`chartFillScale()` 在尺寸变化时重算。
2. `initCustomSelect` / `syncSelectLabel` 取文案优先用 `opt.dataset.label`，否则含附加信息的选项会把窄触发器撑爆。
3. 导出 PNG 走 `chartRenderPng(option, w, h, ratio)`：单独起临时实例（`devicePixelRatio: ratio` + `animation:false`）再取图。**取图时必须显式传 `pixelRatio: ratio`**——zrender 用的是「逻辑宽高 × pixelRatio」，不读实例的 dpr，只传 1 会老实地返回 700×400（已实测）。
4. 「放大查看」灯箱也走同一条路，标题写真实像素 + 倍率；`chartSafeScale()` 按 2400 万像素封顶自动降档（4096²@3x → 1x）。
5. **命名要查全局**：`chartScaleNow` 已被预览缩放占用（`(w,h)` 那版），像素比函数叫 `chartPixelRatio()`。同名函数声明会互相覆盖，症状是「UI 都对了但取值永远是 1」。

## 工具坑（省时间）

1. macOS 自带 **BSD grep 不支持 `\s`、`\|`、`{0,300}`**：多模式一律 `grep -E "a|b"`，需要 `\s` 就用 `[[:space:]]` 或 node 脚本；否则会得到「空结果」并且误判成「文件里没有」。
2. 十几万行的 `ui/index.html` 用 `Grep` 工具或 `sed -n`，别用裸 `grep` 拼管道。
3. 批量插 i18n 用 node 脚本按锚点键逐语言插入（`/tmp/patch-*.js` 那套路），插完必须跑 `node tests/i18n.test.js`——漏逗号、切断字符串（意大利语 `l\'immagine`）都真发生过。

### 每次开工前都要想起的两条约束

1. 每加一页 ≈ 20–50 个 i18n 键 × 14 种语言；`ui/index.html` 已 12.9 k 行，新文案进独立小字典（`BYTES_I18N` / `CHART_I18N` / `FLOW_I18N` 那套路，现在共 11 张表），别继续堆主字典。
2. 新功能一旦要碰 DOM / 大文本，先按「性能与稳定性」七条自查，尤其入口限流与大字符串不驻留。
