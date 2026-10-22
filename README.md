# 数据转换 (Data Format Converter)

A [DBX](https://dbxio.com) plugin that moves data between formats without leaving the workbench: JSON / YAML / XML / Properties conversion, a field-level diff, a batch-value SQL builder, Excel / CSV → JSON, Image ⇄ Base64, and JSON / `CREATE TABLE` straight into model code. Built from the **frontend-only (universal)** template — one cross-platform `.dbxp`, no native backend, no network calls, works offline.

![Data Format Converter workbench](docs/screen.png)

[中文文档](README.zh-CN.md)

## Pages at a glance

| Page | What it does |
| --- | --- |
| **Convert** | All 7 pairs between JSON / YAML / XML / Properties, instant conversion, validation + formatting, mock data |
| **Compare** | Field-level JSON diff by JSON Pointer, or a line-level text diff for anything else |
| **SQL** | Paste values → `IN` / `NOT IN` / value list / `INSERT`; pasted SQL fragments parse back into clean values |
| **Sheet to JSON** | `.xlsx` / `.csv` / `.tsv` → JSON array or SQL `INSERT`, parsed entirely in the browser |
| **Image ⇄ Base64** | Image → DataURI / raw Base64 / CSS / HTML / Markdown, and Base64 (prefixed or bare) back into a picture |
| **Code Gen** | A JSON sample or a `CREATE TABLE` → TypeScript / Go / Java / Python models, nested structures split into their own types |

## Convert

- The seven format pairs live in one dropdown and the trigger shows the pair in use (`yaml转properties`); the active pair is highlighted, `Esc` or a click outside closes it. Whatever does not fit folds into "More", so the nav never grows a horizontal scrollbar.
- Auto-formatting for JSON / YAML / XML, validation errors that point at the problem, and a mock-data generator for quick schema tests.
- Everything runs locally: paste → convert happens inside the panel, nothing is uploaded.

## Compare

- **Field-level JSON diff** — both sides are parsed into trees and compared node by node (JSON Pointer), so only the values that actually changed are highlighted, plus a change list (modified / added / removed + path + new value); clicking a row scrolls both panes to it. Cross-format (json ↔ yaml) gives the list without meaningless block colouring.
- **Free-text compare** — Markdown, config files, HTML snippets, logs: compared row by row, removed lines get a red band and edge bar, added lines a green one, no strikethrough so code stays readable. If both sides are valid JSON it suggests the JSON mode instead.
- Four built-in samples per mode, so the page is usable without preparing data.

![JSON compare page](docs/screen-compare.png)

## SQL builder

- Paste one value per line (commas, semicolons and tabs work too) and get SQL on the right: `IN (...)`, `NOT IN (...)`, a plain value list, or `INSERT INTO ... VALUES ...;` — single-line or one per line.
- Quoting is a choice: single quotes, double quotes or none. Numbers are quoted by default (`'31010100003922409'`, because id columns are usually varchar), with a toggle for bare numbers so `int` indexes keep working.
- A whole `WHERE id IN ('a','b')` or `INSERT ... VALUES ('a'),('b')` fragment parses back into clean values; paired quotes are unescaped, `O'Brien` is not split, duplicates are dropped and both counts are shown.
- Generates as you type, `Cmd/Ctrl+Enter` to force it, one-click copy.

![SQL builder page](docs/screen-sql.png)

## Sheet to JSON

- Drop an `.xlsx`, `.csv` or `.tsv`: the first row becomes the keys (switchable), the delimiter is sniffed (or pinned to `,` / Tab / `;`), numbers and booleans are inferred while `007` and 15+ digit ids stay strings, short rows are padded and duplicate headers get a `_2` suffix.
- Excel dates come back as `2024-03-01` (built-in and custom `numFmt`), and shared strings / inline strings / booleans / error cells are handled. ZIP64 xlsx files read correctly.
- A live preview table sits beside the output; wide tables scroll horizontally with a persistent scrollbar, and double-clicking a cell opens a detail card with the full value plus the whole row.
- Output is **JSON** (fully indented or one record per line) or **SQL Insert** (table name editable, 500 rows per statement, `'`-escaped, `.sql` export). A **Max records** selector converts only the first N rows.
- Large files stay responsive: 20 MB / 100k rows caps, 500-row preview, chunked serialisation with a progress bar, and a cancel token so a slow file never overwrites a newer one. Exports go through the host `fileTransfer` channel, falling back to `<a download>`.

![Sheet to JSON page](docs/screen-sheet.png)

## Image ⇄ Base64

- **Encode**: pick a file, drop it, or press `Ctrl/Cmd+V` to paste a screenshot — output as DataURI, raw Base64, CSS, HTML or Markdown. Switching format never re-encodes.
- **Decode**: paste and the picture appears (300 ms debounced), with size, dimensions, character count and the +33% overhead underneath, on a checkerboard backdrop so transparent PNGs stay visible.
- **Raw Base64 equals DataURI**: a bare string with no `data:` prefix works, because the type is sniffed from magic bytes (PNG / JPEG / GIF / BMP / WEBP / ICO / AVIF / HEIC / SVG) and the tip says which one it read. Real-world variants normalise first: 76-column wrapping, url-safe `-_`, missing padding, quotes / `url("…")` / a whole CSS declaration, a partial `image/png;base64,` prefix, a UTF-8 BOM. Pasting Base64 with `Ctrl/Cmd+V` on the encode side switches to decode automatically. There is deliberately **no "read clipboard" button**: macOS WebViews pop their own *Paste* bubble next to the button, so images come in via `Ctrl/Cmd+V` or drag-and-drop — both hand over the full file data.
- **SVG counts as an image**: `.svg` files encode to `image/svg+xml`, SVG Base64 / DataURI decodes back — and since vector art *is* text, pasted **SVG source** is UTF-8 encoded and rendered too. Sniffing skips a BOM, `<?xml?>`, `<!DOCTYPE svg>` and comments, and does not mistake HTML that merely embeds an `<svg>` for an image.
- **Bounded memory, no frozen host**: 10 MB per image, 14 M characters of Base64, rejected up front. Encoding runs in 3-byte-aligned chunks with a progress bar and a cancel token (8 MB ≈ 250 ms). The preview is capped at 200 K characters and above 2 M characters of Base64 the full string is **not** held in memory — the preview is built from a slice and the text is assembled once, on export. Previews use an object URL instead of a multi-megabyte data URI, and **Copy** on a truncated preview points at Export instead of pretending to succeed.

![Image to Base64 page](docs/screen-image.png)

## Code generation

- Paste a **JSON sample** on the left and the model appears on the right: nested objects and arrays of objects become their own types (dependencies are emitted first), duplicate shapes merge, and fields missing from some samples turn optional.
- Or switch to **SQL DDL**: paste a `CREATE TABLE` (MySQL backticks, PostgreSQL double quotes / `serial` all understood) and get the matching model. Column names become lower camel case, table and column comments are carried into the code, table prefixes like `t_` / `tb_` are dropped from type names, and primary keys or index clauses never become fields. Several `CREATE TABLE` statements produce several types at once.
- Switch language at any time: **TypeScript** interfaces, **Go** structs (with `json` tags and `omitempty`), **Java** POJOs (boxed types + getter/setter), **Python** dataclasses (snake_case + `Optional`). No need to re-paste anything.
- The root type name is editable; leave it empty and it is inferred. Messy input (spaces, leading digits, CJK) is sanitised into a legal identifier instead of emitting code that will not compile.
- Inference is pure frontend — no network, no `eval`. Inputs beyond 1M characters, very large arrays and deeply nested values degrade or stop at the door, so the host never locks up.
- Both panes are real editors (CodeMirror): line numbers, syntax highlighting, bracket matching, code folding and active-line highlight. The input is coloured by source format (JSON / SQL DDL) and the output by target language (TypeScript / Go / Java / Python), switching with the tabs; `⌘ / Ctrl + Enter` re-runs in place.

![Code generation page](docs/screen-code.png)

## Everywhere

- **Internationalization** — 14 languages: zh-CN, zh-TW, en, ja, ko, es, id, it, pl, pt, ru, th, tr, az. Every page (convert, compare, SQL, sheet, image, code gen) is translated into all 14.
- **Theme adaptability** — follows the DBX host theme and shadcn/ui tokens, including hosts that only send theme metadata (no `data-dbx-theme`) and custom palettes. First paint already matches the host, theme switches cross-fade over 300 ms, and `prefers-reduced-motion` turns the animation off.
- **Clipboard** — one-click copy through the DBX host API, with a browser fallback.
- **Offline** — no backend, no CDN, no telemetry; CodeMirror and the YAML library ship inside the package.

## Prerequisites

- [Node.js](https://nodejs.org/) 22+
- [DBX Plugin CLI](https://www.npmjs.com/package/@dbx-app/plugin-cli)

## Quick start

```bash
git clone <repo-url> && cd dbx-plugin-data-convert
./scripts/build.sh dev          # workbench on port 5190 (PORT=n to override)
```

## Build & test

```bash
./scripts/build.sh test         # all suites (295 cases)
./scripts/build.sh              # run tests, then package dist/*.dbxp
./scripts/run.sh                # shorthand for `build.sh dev`

npm test                        # pure-function suites, no dependencies (295 cases)
npm install && npm run test:ui  # jsdom smoke test of the UI wiring (118 checks)
```

On Windows use `scripts\build.cmd` instead (requires Git Bash).

### Project layout

```
ui/index.html          UI shell: layout, styles, wiring
ui/js/converters.js    conversion core — pure functions, no DOM, unit tested
ui/js/objdiff.js       structured diff — compares object trees by JSON Pointer
ui/js/diff.js          line diff — ops carry line numbers, degrades on huge input
ui/js/sqlgen.js        SQL generator — batch-text parsing + IN/NOT IN/INSERT rendering
ui/js/sheetconv.js     CSV/TSV → records → JSON — delimiter sniffing, types, limits
ui/js/xlsxread.js      .xlsx reader — ZIP + DecompressionStream + XML scan, no deps
ui/js/imgconv.js       image ↔ Base64 — magic-byte sniffing, normalisation, SVG text
ui/js/codegen.js       code gen — type inference + DDL parsing + 4-language renderers
tests/                 regression suite, run with plain node
scripts/build.sh       package | dev | test
```

The logic layers are deliberately DOM-free, so `node tests/*.test.js` exercises every converter,
the diff algorithms, sheet parsing and Base64 round-trips without a browser.
