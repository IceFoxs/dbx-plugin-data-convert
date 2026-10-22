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

- 版本号三处必须一致：`manifest.json`、`package.json`、`CHANGELOG.md` 顶部段落（`.dbx-store.json` 的 `source` 引用 vX.Y.Z、`releaseNotes` 写最新一版）。
- CHANGELOG 按「新增 / 修复 / 工程化」三类写，条目要能被用户读懂（写清现象与原因），工程化条目给实测数字。
- 打包用 `./scripts/build.sh`（会先跑全部单测再出 `dist/*.dbxp`）；新增测试文件记得同时加进 `scripts/build.sh` 的 `run_tests()` 与 `package.json` 的 `test`。
- **不打 tag、不建分支**（用户 2026-10-22 明确要求，永远遵守）：只在当前分支上提交，版本号同步到文件里就够；`git tag` / `git branch` / `git checkout -b` 一律不做，push 也要先问。

## 后续任务清单

已完成的不再列在这里（二 格式矩阵、三 查询与校验均已上线）。当前只剩下面这些。

### 四、工作流（进行中）

1. ✅ **全局拖放路由**（已做）：`ui/js/flow.js` 的 `routeFile()` / `routeBatch()` 判定落页，window 级 dragenter/dragover/drop 接管，图片→图片页、xlsx/csv/tsv→表格页、json/yaml/xml/toml/ini/.env/log/md→格式转换页，未知扩展名拒收并提示。
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

### 每次开工前都要想起的两条约束

1. 每加一页 ≈ 20–50 个 i18n 键 × 14 种语言；`ui/index.html` 已 11.9 k 行，新文案进独立小字典（`BYTES_I18N` / `FLOW_I18N` 那套路，现在共 10 张表），别继续堆主字典。
2. 新功能一旦要碰 DOM / 大文本，先按「性能与稳定性」七条自查，尤其入口限流与大字符串不驻留。
