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
- **导航「格式转换」下拉**：7 个格式互转入口收进一个下拉（当前选中的那对会高亮，`Esc` / 点空白收起），导航条上只留 `格式转换 / SQL 转换 / JSON 对比`；再窄就继续收进「更多」，不会出现横向滚动条。
- **国际化 (i18n)**：支持多语言 UI，包括 zh-CN、zh-TW、en、ja、ko、es、id、it、pl、pt、ru、th、tr、az。
- **主题适配**：支持深色模式，自动跟随 DBX 宿主主题及 shadcn/ui 设计令牌——即使宿主只下发主题信息、没有写 `data-dbx-theme`，也会自行判定明暗并切换编辑器语法主题；自定义调色板（含暖色皮肤）同样生效。明暗切换有 300ms 的整页颜色过渡（背景、文字、边框一起渐变，编辑器语法色在过渡中点切换），首屏按宿主主题直接落定、不会先闪白底，`prefers-reduced-motion` 下自动关掉动画。
- **剪贴板集成**：通过 DBX Host API 或浏览器降级方案，一键复制转换结果。

![结构化差异对比](docs/screen-diff.png)

![JSON 对比页](docs/screen-compare.png)

![任意文本对比](docs/screen-compare-text.png)

![SQL 生成页](docs/screen-sql.png)

![导航「格式转换」下拉](docs/screen-nav-convert.png)

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
./scripts/build.sh test         # 转换核心 + 差异算法 + SQL 生成回归用例（113 条）
./scripts/build.sh              # 先跑用例，再打包 dist/*.dbxp
./scripts/run.sh                # 等价于 build.sh dev

npm test                        # 只跑转换核心、差异算法与 SQL 生成，无第三方依赖
npm install && npm run test:ui  # jsdom 页面接线冒烟（68 项）
```

Windows 下使用 `scripts\build.cmd`（需要 Git Bash）。

### 目录结构

```
ui/index.html          UI 外壳：布局、样式、事件装配
ui/js/converters.js    转换核心 —— 纯函数、无 DOM 依赖、可单测
ui/js/objdiff.js       结构化差异 —— 按 JSON Pointer 比较对象树
ui/js/diff.js          逐行差异 —— 带行号的 ops、超限自动降级
ui/js/sqlgen.js        SQL 生成 —— 批量文本拆值 + IN/NOT IN/INSERT 渲染
tests/                 回归用例，直接 node 运行
scripts/build.sh       package | dev | test
```

转换核心与 DOM 解耦：`node tests/converters.test.js` 无需浏览器即可覆盖 12 条格式互转路径及边界情况；`node tests/diff.test.js` 校验每一步差异的行号都指回原文，并覆盖大文件降级路径。
