# 数据转换 (Data Format Converter)

A [DBX](https://dbxio.com) plugin providing seamless conversion among JSON, YAML, XML, and Properties formats. Built with a **Frontend only (universal)** template, producing a single cross-platform `universal` package without any native backend.

![Data Format Converter workbench interface](docs/screen.png)


[中文文档](README.zh-CN.md)

## Features

- **Multi-Format Support**: Seamless conversion among JSON, YAML, XML, and Properties.
- **No Backend Required**: Runs entirely in the frontend (Vanilla JS) within the DBX host environment.
- **Mock Data Generation**: Built-in mock data generator for quick testing and schema design.
- **Format Validation & Formatting**: Auto-formatting for JSON, YAML, and XML strings.
- **Internationalization (i18n)**: Multi-language UI support including zh-CN, zh-TW, en, ja, ko, es, id, it, pl, pt, ru, th, tr, az.
- **Theme Adaptability**: Dark mode support, automatically following the DBX host theme and shadcn/ui design tokens.
- **Clipboard Integration**: One-click copy for converted results via DBX Host API or browser fallback.

## Prerequisites

- [Node.js](https://nodejs.org/) 22+
- [DBX Plugin CLI](https://www.npmjs.com/package/@dbx-app/plugin-cli)

## Quick Start

```bash
git clone <repo-url> && cd data-format-converter
dbx-plugin dev --path . --port 5190