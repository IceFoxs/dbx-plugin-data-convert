# 数据转换 (Data Format Converter)

一个 [DBX](https://dbxio.com) 插件，把数据在工作台里转来转去：JSON / YAML / XML / Properties 互转、按字段对比、批量值生成 SQL、Excel / CSV 转 JSON、图片 ⇄ Base64，以及 JSON / `CREATE TABLE` 直接生成多语言模型代码。采用 **纯前端（通用）** 模板构建——单个跨平台 `.dbxp`，没有原生后端、不联网、可离线运行。

![数据转换工作台](docs/screen.png)

## 功能页一览

| 页面 | 能做什么 |
| --- | --- |
| **格式转换** | JSON / YAML / XML / Properties 的 7 种互转，即时转换、校验与格式化、模拟数据 |
| **对比** | 按 JSON Pointer 逐字段对比 JSON，或对任意文本逐行对比 |
| **SQL 转换** | 粘贴一列值 → `IN` / `NOT IN` / 值列表 / `INSERT`；整段 SQL 片段也能反向拆回干净的值 |
| **表格转 JSON** | `.xlsx` / `.csv` / `.tsv` → JSON 数组或 SQL `INSERT`，全程在浏览器里解析 |
| **图片 Base64** | 图片 → DataURI / 纯 Base64 / CSS / HTML / Markdown，Base64（带前缀或裸串）→ 图片 |
| **代码生成** | 一段 JSON 示例或 `CREATE TABLE` → TypeScript / Go / Java / Python 模型，嵌套结构自动拆成独立类型 |

## 格式转换

- 7 个互转对收在一个下拉里，触发器直接显示当前这一对（如 `yaml转properties`），当前项高亮，`Esc` 或点空白收起；再窄就继续收进「更多」，导航条不会出现横向滚动条。
- JSON / YAML / XML 自动美化、校验失败能指出问题所在，另有模拟数据生成器，做 Schema 试跑不用手写样本。
- 全部本地完成：贴进去就转，不请求网络。

## 对比

- **结构化 JSON 对比**——两侧先解析成对象树，按 JSON Pointer 逐节点比，只高亮真正变了的那个值，并在右下角列出变更清单（修改 / 新增 / 删除 + 路径 + 新值），点任意一行两侧同时滚到对应位置；跨格式（json ↔ yaml）只给清单，不做无意义的整块涂色。
- **任意文本对比**——Markdown、配置文件、HTML 片段、日志：按行比对，删掉的行淡红底 + 行首红条，新增的行淡绿底 + 行首绿条，不划删除线，代码也读得清；两侧都是合法 JSON 时会提示改用 JSON 对比。
- 每种模式自带 4 组示例，不准备数据也能直接试。

![JSON 对比页](docs/screen-compare.png)

## SQL 转换

- 左边一行一个值（逗号、分号、制表符也认），右边直接出 SQL：`IN (...)`、`NOT IN (...)`、值列表、`INSERT INTO ... VALUES ...;`，多行或单行随时切。
- 引号可选：单引号 / 双引号 / 不加引号。纯数字默认加引号（`'31010100003922409'`，ID 列大多是 varchar），勾上「数字不加引号」才输出裸数字，避免 int 列隐式转换丢索引。
- 从 SQL 文件里整段粘回来的 `WHERE id IN ('a','b')`、`INSERT ... VALUES ('a'),('b')` 也能反向拆出干净的值；成对引号还原、`O'Brien` 不会被拆坏、重复值自动去掉并分别显示「拆出几个 / 用了几个」。
- 输入即生成，`Cmd/Ctrl+Enter` 立即出结果，一键复制。

![SQL 生成页](docs/screen-sql.png)

## 表格转 JSON

- 拖入 `.xlsx` / `.csv` / `.tsv`：首行作表头（可关），分隔符自动嗅探（也能钉住 `,` / Tab / `;`），数字与布尔可推断，但 `007`、超过 15 位的长编号始终按字符串处理；短行补空、重名列加 `_2`。
- Excel 日期还原成 `2024-03-01`（内置与自定义 `numFmt` 都认），共享字符串 / `inlineStr` / 布尔 / `#DIV/0!` 之类错误值照原样还原，ZIP64 写出来的 xlsx 也能读。
- 旁边是实时预览表格：列多时按内容撑开、底部常驻横向滚动条，单元格被截断时双击弹出详情（完整内容 + 整行所有列）。
- 输出可切 **JSON**（逐字段缩进 / 一条记录一行）或 **SQL Insert**（表名可改、每 500 条一句、单引号转义、导出 `.sql`），「最多条数」只转前 N 条。
- 大文件不假死：单文件 20 MB / 10 万行上限，预览只画 500 行，序列化分批让出主线程并显示进度，切文件时旧任务作废；导出走宿主 `fileTransfer`，没有宿主才回退浏览器下载。

![表格转 JSON 页](docs/screen-sheet.png)

## 图片 ⇄ Base64

- **编码**：选文件、拖进来或 `Ctrl/Cmd+V` 粘贴截图，输出 DataURI、纯 Base64、CSS、HTML、Markdown——切换格式不用重新编码。
- **解码**：边贴边出图（300 ms 防抖），尺寸、体积、字符数、+33% 膨胀率都摆在图下面，棋盘格底让透明 PNG 不会糊在白底上。
- **纯 Base64 与 DataURI 等价**：没有 `data:` 前缀的裸串同样能解，类型靠魔数嗅探（PNG / JPEG / GIF / BMP / WEBP / ICO / AVIF / HEIC / SVG），提示里写明读到的是哪一种。现实变体先规范化再校验：76 字符换行、url-safe `-_`、缺补位、引号 / `url("…")` / 整条 CSS 声明、只抄了 `image/png;base64,` 半截前缀、UTF-8 BOM。在编码页 `Ctrl/Cmd+V` 粘贴一段 Base64 会自动切到解码页。页面不设「读剪贴板」按钮——macOS 的 WebView 会在按钮旁边弹一个自己的 Paste 气泡，所以贴图一律走 `Ctrl/Cmd+V` 或拖拽（两条路都拿得到完整图片数据）。
- **SVG 也算图片**：`.svg` 编码成 `image/svg+xml`，SVG 的 Base64 / DataURI 能解回图片；矢量图本来就是文本，所以**SVG 源码**也能直接贴进来，自动按 UTF-8 编码再渲染。嗅探会跳过 BOM、`<?xml?>`、`<!DOCTYPE svg>` 和注释，HTML 里恰好嵌了个 `<svg>` 不会被误判。
- **内存有界，不拖垮宿主**：单张图 10 MB、Base64 文本 14 M 字符，超了在入口拦下。编码按 3 字节对齐分块，带进度条与取消 token（8 MB 约 250 ms）。预览最多 200 K 字符，Base64 超过 2 M 字符时整串**不留在内存里**——预览由切片拼出，导出时才拼一次；预览图走 object URL 而不是几 MB 的 data URI，截断时点「复制」会引导去导出文件而不是假装成功。

![图片转 Base64 页](docs/screen-image.png)

## 代码生成

- 左边贴一段 **JSON 示例**，右边立刻出模型：嵌套对象与对象数组自动拆成独立类型（依赖先于使用者输出），同名结构合并、只有部分样本出现的字段自动变可选。
- 也可以切到 **SQL DDL**：粘一条 `CREATE TABLE`（MySQL 反引号、PostgreSQL 双引号 / `serial` 都认），直接出对应模型。列名转小驼峰、表注释与列注释带进代码、`t_` / `tb_` 这类表名前缀不进类型名、主键与索引约束不会变成字段；多条 `CREATE TABLE` 一次出多个类型。
- 四种语言随时切：**TypeScript** 接口、**Go** struct（带 `json` tag 与 `omitempty`）、**Java** POJO（包装类型 + getter/setter）、**Python** dataclass（snake_case + `Optional`）。切换不用重新输入。
- 根类型名可以自己填，留空就按输入自动命名；填了脏字符串（含空格、数字开头、中文）也会清洗成合法标识符，不会生成编译不过的代码。
- 纯前端推断，不联网、不 `eval`；输入超过 1 M 字符、超大数组、超深嵌套都会在入口降级或拦下，不会把宿主卡死。
- 输入输出都是真正的编辑器（CodeMirror）：行号、语法着色、括号自动配对、代码折叠、当前行高亮。输入按源格式上色（JSON / SQL DDL），输出跟着目标语言走（TypeScript / Go / Java / Python），切页签即换配色；`⌘ / Ctrl + Enter` 就地重跑。

![代码生成页](docs/screen-code.png)

## 通用

- **国际化**——14 种语言：zh-CN、zh-TW、en、ja、ko、es、id、it、pl、pt、ru、th、tr、az。切换器里列出前三种，其余随宿主 locale 自动匹配；格式转换、对比、SQL、表格、图片、代码生成六页的文案都已覆盖全部 14 种，缺一条会退回英文而不是中文。
- **主题适配**——跟随 DBX 宿主主题与 shadcn/ui 设计令牌，宿主只下发主题信息（不写 `data-dbx-theme`）或自定义调色板同样生效。首屏按宿主主题直接落定、不闪白底，明暗切换有 300 ms 整页过渡，`prefers-reduced-motion` 下自动关掉。
- **剪贴板**——通过 DBX Host API 一键复制，没有宿主时走浏览器降级方案。
- **离线**——无后端、无 CDN、无遥测；CodeMirror 与 YAML 库都打在包里。

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
./scripts/build.sh test         # 全部用例（295 条）
./scripts/build.sh              # 先跑用例，再打包 dist/*.dbxp
./scripts/run.sh                # 等价于 build.sh dev

npm test                        # 纯函数用例，无第三方依赖（295 条）
npm install && npm run test:ui  # jsdom 页面接线冒烟（118 项）
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
ui/js/imgconv.js       图片 ↔ Base64 —— 魔数嗅探、规范化、SVG 源码编码
ui/js/codegen.js       代码生成 —— 类型推断 + DDL 解析 + 四语言渲染
tests/                 回归用例，直接 node 运行
scripts/build.sh       package | dev | test
```

逻辑层与 DOM 解耦，`node tests/*.test.js` 无需浏览器即可覆盖全部转换路径、差异算法、表格解析与 Base64 往返。
