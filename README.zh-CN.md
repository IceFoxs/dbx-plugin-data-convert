# 数据转换 (Data Format Converter)

一个 [DBX](https://dbxio.com) 插件，提供 JSON、YAML、XML 和 Properties 格式之间的无缝转换。采用 **纯前端（通用）** 模板构建，生成单个跨平台的 `universal` 包，无需任何原生后端。

![数据转换工作台界面](docs/screen.png)

## 功能特性

- **多格式支持**：JSON、YAML、XML 和 Properties 之间的无缝转换。
- **无需后端**：完全在 DBX 宿主环境的前端（Vanilla JS）中运行。
- **模拟数据生成**：内置模拟数据生成器，用于快速测试和 Schema 设计。
- **格式校验与美化**：自动格式化 JSON、YAML 和 XML 字符串。
- **结构化差异对比**：按字段（JSON Pointer）比较两版数据，只高亮真正变了的那个值，并在右下角列出变更清单。
- **JSON 对比页**：导航栏独立入口，左右两栏各贴一份 JSON，一键标出所有不一致的值并给出「共 N 处」提示，另附 4 组示例与「任意文本」模式。
- **任意文本对比**：切到该模式后示例换成 Markdown / 配置文件 / HTML 片段 / 日志输出四组真实文本，按行对比——删掉的行整行淡红底 + 行首红条，新增的行整行淡绿底 + 行首绿条（不划删除线，代码也读得清），底部提示「共 N 行不同」；两侧都是 JSON 时会提示改用「JSON 对比」。
- **SQL 生成页（批量文本）**：导航栏独立入口。左边一行一个值（也认逗号、分号、制表符），右边直接出 SQL：`IN (...)` / `NOT IN (...)` / 值列表 / `INSERT INTO ... VALUES ...;` 四种模板，多行或单行随时切；单引号、双引号、不加引号三选一；纯数字默认也按字符串加引号（`'31010100003922409'`，ID 列大多是 varchar），勾上「数字不加引号」才输出裸数字（避免 int 列隐式转换丢索引），三个开关改完立刻重算。自动去重并分别显示「拆出几个值 / 用了几个值」。从 SQL 文件里整段粘回来的 `WHERE id IN ('a','b')`、`INSERT ... VALUES ('a'),('b')` 同样能反向拆出干净的值，输入即生成，可一键复制。
- **表格转 JSON 页（Excel / CSV）**：导航栏独立入口。把 `.xlsx` / `.csv` / `.tsv` 拖进预览区（或点按钮选择），左边立刻出解析后的数据预览表格，右边是 JSON 数组。首行表头可关（关掉键名是 `column_1..N`），分隔符自动嗅探也能手动钉住 `,` / `Tab` / `;`；数字与布尔分别可关，`007`、0912 这类前导零编号和超过 15 位的长数字始终按字符串处理（否则 JSON 掉精度），短行补空串、空表头补 `column_N`、重名列加 `_2`。Excel 的日期样式（内置 + 自定义 `numFmt`）会还原成 `2024-03-01`，共享字符串富文本、`inlineStr`、布尔与 `#DIV/0!` 之类错误值都照原样还原。输出栏只读、一条记录一行，可复制或「导出 JSON」（走宿主的 fileTransfer 保存通道，webview 里也能落盘）；单文件 20 MB / 10 万行上限，可用「最多条数」（全部 / 100 / 500 / 1000 / 5000 / 10000，自绘下拉、和顶栏「从 / 转为」同一套样式）只转前 N 条，预览最多画 500 行、输出预览超 12 万字符截断（复制与导出跟着条数上限走），序列化分批让出主线程并显示进度，切文件时旧任务自动作废。输出栏可在 `JSON` 与 `SQL Insert` 之间切换：SQL 按表名生成 `INSERT INTO t (...) VALUES (...);`（每 500 条断一条语句、单引号转义、数字裸写、空值 `NULL`），导出后缀自动变 `.sql`；JSON 还能选「格式化（逐字段换行缩进）/ 紧凑（一条记录一行）」。旧版 `.xls` 会提示另存为 `.xlsx` / `.csv`。
- **「第二行为注释」可选跳过**：有些表格第一行是英文列名、第二行是中文说明（`id / method` 上面一行 `编号 / 请求方法`），说明行会被当成一条数据。现在选项行有独立开关，勾上才跳过；同时用启发式判断「第二行像不像说明」（第一行几乎全英文列名、第二行成片中文且不含数字）——**只提示不擅自改结果**，点头上的「第二行疑似说明，跳过？」确认后才生效，取消勾选立刻恢复。
- **预览表横向滚动 + 双击看详情**：列多时表格按内容撑开（不再挤在面板宽度里把列压没），底部有一条常驻的横向滚动条（自绘、可拖动；macOS 的悬浮滚动条不滚就不出现，容易以为「就这几列」）。单元格内容被省略号截断时，双击弹出详情：左边是完整内容，下面是整行所有列的值（被横向截掉的列也能看全），可一键复制。

- **导航「格式转换」下拉**：7 个格式互转入口收进一个下拉，触发器直接显示当前这一对（如 `yaml转properties`，改格式时立刻跟着变；窄窗口退成 `YAML→Props`，`title` 仍是完整文案；当前项在下拉里高亮，`Esc` / 点空白收起），导航条上只留 `格式转换 / SQL 转换 / 表格转 JSON / JSON 对比`；再窄就继续收进「更多」，不会出现横向滚动条。
- **国际化 (i18n)**：支持多语言 UI，包括 zh-CN、zh-TW、en、ja、ko、es、id、it、pl、pt、ru、th、tr、az。
- **主题适配**：支持深色模式，自动跟随 DBX 宿主主题及 shadcn/ui 设计令牌——即使宿主只下发主题信息、没有写 `data-dbx-theme`，也会自行判定明暗并切换编辑器语法主题；自定义调色板（含暖色皮肤）同样生效。明暗切换有 300ms 的整页颜色过渡（背景、文字、边框一起渐变，编辑器语法色在过渡中点切换），首屏按宿主主题直接落定、不会先闪白底，`prefers-reduced-motion` 下自动关掉动画。
- **剪贴板集成**：通过 DBX Host API 或浏览器降级方案，一键复制转换结果。

![结构化差异对比](docs/screen-diff.png)

![JSON 对比页](docs/screen-compare.png)

![任意文本对比](docs/screen-compare-text.png)

![SQL 生成页](docs/screen-sql.png)

![导航「格式转换」下拉](docs/screen-nav-convert.png)

![表格转 JSON 页](docs/screen-sheet.png)

![表格转 JSON 页（横向滚动）](docs/screen-sheet-scroll.png)

![双击单元格查看详情](docs/screen-sheet-cell.png)

![第二行疑似注释提示](docs/screen-sheet-note.png)

![表格转 JSON 页（SQL Insert 输出）](docs/screen-sheet-sql.png)

![表格转 JSON 页（暗色）](docs/screen-sheet-dark.png)

## 环境要求

- [Node.js](https://nodejs.org/) 22+
- [DBX Plugin CLI](https://www.npmjs.com/package/@dbx-app/plugin-cli)

## 快速开始

```bash
git clone <repo-url> && cd dbx-plugin-data-convert
./scripts/build.sh dev          # 启动本地工作台，默认端口 5190（PORT=n 可覆盖）
```

## 构建与测试

```bash
./scripts/build.sh test         # 转换核心 + 差异算法 + SQL 生成 + 表格解析 / SQL Insert 用例（160 条）
./scripts/build.sh              # 先跑用例，再打包 dist/*.dbxp
./scripts/run.sh                # 等价于 build.sh dev

npm test                        # 只跑转换核心、差异算法、SQL 生成与表格解析，无第三方依赖
npm install && npm run test:ui  # jsdom 页面接线冒烟（93 项）
```

Windows 下使用 `scripts\build.cmd`（需要 Git Bash）。

### 目录结构

```
ui/index.html          UI 外壳：布局、样式、事件装配
ui/js/converters.js    转换核心 —— 纯函数、无 DOM 依赖、可单测
ui/js/objdiff.js       结构化差异 —— 按 JSON Pointer 比较对象树
ui/js/diff.js          逐行差异 —— 带行号的 ops、超限自动降级
ui/js/sqlgen.js        SQL 生成 —— 批量文本拆值 + IN/NOT IN/INSERT 渲染
ui/js/sheetconv.js     表格文本 → 记录 → JSON —— 分隔符嗅探、类型推断、限流
ui/js/xlsxread.js      .xlsx 读取 —— ZIP + DecompressionStream + XML 扫描，零依赖
tests/                 回归用例，直接 node 运行
scripts/build.sh       package | dev | test
```

转换核心与 DOM 解耦：`node tests/converters.test.js` 无需浏览器即可覆盖 12 条格式互转路径及边界情况；`node tests/diff.test.js` 校验每一步差异的行号都指回原文，并覆盖大文件降级路径。
