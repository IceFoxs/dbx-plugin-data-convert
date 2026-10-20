# 数据转换 (Data Format Converter)

一个 [DBX](https://dbxio.com) 插件，提供 JSON、YAML、XML 和 Properties 格式之间的无缝转换。采用 **纯前端（通用）** 模板构建，生成单个跨平台的 `universal` 包，无需任何原生后端。

![数据转换工作台界面](docs/screen.png)

## 功能特性

- **多格式支持**：JSON、YAML、XML 和 Properties 之间的无缝转换。
- **无需后端**：完全在 DBX 宿主环境的前端（Vanilla JS）中运行。
- **模拟数据生成**：内置模拟数据生成器，用于快速测试和 Schema 设计。
- **格式校验与美化**：自动格式化 JSON、YAML 和 XML 字符串。
- **国际化 (i18n)**：支持多语言 UI，包括 zh-CN、zh-TW、en、ja、ko、es、id、it、pl、pt、ru、th、tr、az。
- **主题适配**：支持深色模式，自动跟随 DBX 宿主主题及 shadcn/ui 设计令牌。
- **剪贴板集成**：通过 DBX Host API 或浏览器降级方案，一键复制转换结果。

## 环境要求

- [Node.js](https://nodejs.org/) 22+
- [DBX Plugin CLI](https://www.npmjs.com/package/@dbx-app/plugin-cli)

## 快速开始

```bash
git clone <repo-url> && cd data-format-converter
dbx-plugin dev --path . --port 5190