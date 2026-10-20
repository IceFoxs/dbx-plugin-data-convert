# 数据转换 (Data Format Converter)

A [DBX](https://dbxio.com) plugin providing seamless conversion among JSON, YAML, XML, and Properties formats. Built with a **Frontend only (universal)** template, producing a single cross-platform `universal` package without any native backend.

![Data Format Converter workbench interface](docs/screen.png)


[中文文档](README.zh-CN.md)

## Features

- **Multi-Format Support**: Seamless conversion among JSON, YAML, XML, and Properties.
- **No Backend Required**: Runs entirely in the frontend (Vanilla JS) within the DBX host environment.
- **Mock Data Generation**: Built-in mock data generator for quick testing and schema design.
- **Format Validation & Formatting**: Auto-formatting for JSON, YAML, and XML strings.
- **Structured diff**: compares two versions field by field (JSON Pointer), highlights only the values that actually changed, and lists every change in a floating report.
- **Internationalization (i18n)**: Multi-language UI support including zh-CN, zh-TW, en, ja, ko, es, id, it, pl, pt, ru, th, tr, az.
- **Theme Adaptability**: Dark mode support, automatically following the DBX host theme and shadcn/ui design tokens.
- **Clipboard Integration**: One-click copy for converted results via DBX Host API or browser fallback.

![Structured diff](docs/screen-diff.png)

## Prerequisites

- [Node.js](https://nodejs.org/) 22+
- [DBX Plugin CLI](https://www.npmjs.com/package/@dbx-app/plugin-cli)

## Quick Start

```bash
git clone <repo-url> && cd dbx-plugin-data-convert
./scripts/build.sh dev          # start the workbench on port 5190 (PORT=n to override)
```

## Build & Test

```bash
./scripts/build.sh test         # converter + diff regression tests (66 cases)
./scripts/build.sh              # run tests, then package dist/*.dbxp
./scripts/run.sh                # shorthand for `build.sh dev`

npm test                        # converter core + diff algorithm (no dependencies)
npm install && npm run test:ui  # jsdom smoke test of the UI wiring (21 checks)
```

On Windows use `scripts\build.cmd` instead (requires Git Bash).

### Project layout

```
ui/index.html          UI shell: layout, styles, wiring
ui/js/converters.js    conversion core — pure functions, no DOM, unit tested
ui/js/objdiff.js       structured diff — compares object trees by JSON Pointer
ui/js/diff.js          line diff — ops carry line numbers, degrades on huge input
tests/                 regression suite, run with plain node
scripts/build.sh       package | dev | test
```

The conversion core is deliberately DOM-free: `node tests/converters.test.js` exercises all 12
format pairs plus edge cases without a browser. `node tests/diff.test.js` verifies that every
diff step points back at the real source line, including the large-input fallback.
