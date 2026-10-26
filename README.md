# 数据转换 (Data Format Converter)

A [DBX](https://dbxio.com) plugin that moves data between formats without leaving the workbench: JSON / YAML / XML / Properties conversion, a field-level diff, a batch-value SQL builder, Excel / CSV → JSON, Image ⇄ Base64, JSON / `CREATE TABLE` straight into model code, JSONPath / jq queries with JSON Schema validation, an escape toolbox, byte conversion (1000 and 1024 scales), timestamps and dates in every notation (local / UTC / ISO 8601 / relative, batched) and JSON straight into an ECharts chart exported as PNG / SVG. Built from the **frontend-only (universal)** template — one cross-platform `.dbxp`, no native backend, no network calls, works offline.

![Data Format Converter workbench](docs/screen.png)

[中文文档](README.zh-CN.md)

## Pages at a glance

| Page | What it does |
| --- | --- |
| **Convert** | Any of 13 formats into any other (JSON / YAML / XML / Properties / TOML / INI / `.env` / CSV / TSV / Query / Headers / Cookie / HTML), instant conversion, validation + formatting, mock data; import a file (dropped or via the button) and the source format is picked for you |
| **Compare** | Field-level JSON diff by JSON Pointer, or a line-level text diff for anything else; each side has its own import button |
| **SQL** | Paste values → `IN` / `NOT IN` / value list / `INSERT`; pasted SQL fragments parse back into clean values |
| **Sheet to JSON** | `.xlsx` / `.csv` / `.tsv` → JSON array or SQL `INSERT`, parsed entirely in the browser |
| **Image ⇄ Base64** | Image → DataURI / raw Base64 / CSS / HTML / Markdown, and Base64 (prefixed or bare) back into a picture; both sides import files, and exports import back |
| **Code Gen** | A JSON sample or a `CREATE TABLE` → TypeScript / Go / Java / Python models, nested structures split into their own types |
| **Query & Validate** | JSONPath / jq expressions over a JSON document, JSON Schema (draft-07) validation with path + reason per error, one-click schema inference from data |
| **Escape** | URL / Base64 / HTML / JSON string / `\uXXXX` / hex / SQL literal / regex — encode and decode, with a one-click direction flip |
| **Byte converter** | B / KB / MB / GB / TB / PB on both the 1000 and 1024 scales, exact value ⇄ human readable, batch totals, hex dump / byte array / binary string forms, and every value copies on its own without thousands separators |
| **Time converter** | Timestamps (seconds / milliseconds / microseconds) ⇄ dates, picking from local time, `T`-separated, UTC, ISO 8601 and relative time; one value per line for batches, Now / Today / Yesterday / Week / Month buttons append a line in one click, results fold away, the card for the line your cursor is on gets highlighted, and copying gives you results only |
| **JSON to Chart** | An ECharts option (or an array of numbers / objects) drawn as a chart; API responses, task lists and several JSONs at once are unwrapped and listed for picking; custom width & height, PNG export at 1x / 2x / 3x and vector SVG, plus a full-screen lightbox; the chart engine ships inside the package, no network |

## Convert

- **Source × target selectors** — 13 formats in any combination, grouped in the dropdown (structured: JSON / YAML / XML / Properties / TOML / INI / `.env`; table & text: CSV / TSV / Query / Headers / Cookie / HTML), with internal scrolling so a long list never spills off screen.
- **TOML** — `[db]` tables, `[[items]]` arrays of tables, inline tables, dotted keys, triple-quoted strings, hex / octal / binary / underscored numbers, `inf` / `nan` and datetimes (carried as strings) are all understood; defining the same table twice reports the line it happened on.
- **INI / `.env`** — flat `[section]` blocks (a later section never nests into the previous one), `export` prefix, quoted escapes and trailing `#` comments; nested `.env` keys flatten to `db.host`.
- **CSV / TSV** — a JSON array becomes a table, with nested objects flattened to `address.city` and arrays to `tags[0]` / `tags[1]`; reading it back restores the nesting plus numbers and booleans. Empty cells are skipped, since CSV cannot tell `null` from an empty string.
- **Query / Headers / Cookie** — paste a captured request and get structure: repeated query keys become arrays (`a=1&a=2` → `["1","2"]`), header parsing skips the request/status line, and bare cookie flags such as `HttpOnly` become `true`.
- **HTML** — an array of objects ⇄ `<table>` with `<thead>` / `<tbody>` and HTML escaping; column names are generated when there is no `<th>`.
- Auto-formatting for JSON / YAML / XML, validation errors that point at the problem, and a mock-data generator for quick schema tests.
- Both panes keep line numbers and syntax colours — TOML, `.env` (shell), Headers (HTTP) and INI (properties) each get their own.
- Everything runs locally: paste → convert happens inside the panel, nothing is uploaded.

## Compare

- **Field-level JSON diff** — both sides are parsed into trees and compared node by node (JSON Pointer), so only the values that actually changed are highlighted, plus a change list (modified / added / removed + path + new value); clicking a row scrolls both panes to it. Cross-format (json ↔ yaml) gives the list without meaningless block colouring.
- **Free-text compare** — Markdown, config files, HTML snippets, logs: compared row by row, removed lines get a red band and edge bar, added lines a green one, no strikethrough so code stays readable. If both sides are valid JSON it suggests the JSON mode instead.
- Four built-in samples per mode, so the page is usable without preparing data.
- **Each side imports its own file** — Import left and Import right load into that pane only, leaving the other one alone; a file dragged onto the window fills whichever side is still empty.

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
- **Import a file — every export comes back**: the decode side has an **Import file** button that reads `.txt` / `.b64` / `.json` (dropping the file on the pane works too), and everything the encode side exports — `.txt`, `.base64.txt`, even the CSS / HTML / Markdown wrappers — returns as a picture. Import only accepts this page's own kind: picking an image there just tells you to use Image → Base64, the page is never switched under you. Text files are capped at 16 MB and binaries are refused at the door.
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

## Query & Validate

- **Two dialects, one parser** — paste a document, type a path. JSONPath (`$`, `.key`, `['key']`, `[0]`, `[*]`, `..` recursive descent, `[start:end:step]` slices, `[?(@.price < 10 && @.cat == "fiction")]` filters with `=~` regex) and a jq subset (`|` pipes, `,` unions, `[]` iteration) both work; which one you meant is detected from the syntax, so there is nothing to configure.
- **Results you can act on** — a single match prints the value itself, several print as a JSON array with the match count on the badge. Under the result sits a **path list** (up to 200 rows, `$`-rooted), and clicking a row copies that path — handy for turning a query into a JSON Pointer or a code constant.
- **JSON Schema validation** — draft-07 subset: `type` / `enum` / `const` / `format`, string (`minLength`, `pattern`…), number, object (`properties`, `required`, `additionalProperties`, `patternProperties`), array (`items`, `contains`, `uniqueItems`, `minItems`…), `allOf` / `anyOf` / `oneOf` / `not`, `if` / `then` / `else`, and local `$ref` (`#/definitions/…`, with a visited stack so a self-referencing schema cannot explode).
- **Errors are readable, not a wall of text** — every error carries the instance path, a localized sentence and a stable code chip (`schema-type`, `schema-required`…), capped at 200 so a hopeless schema still answers instantly.
- **Schema inference** — one click turns the data you already have into a starting-point schema: types inferred, `required` filled in, `format` guessed for emails / dates / UUIDs, array items merged across elements.
- Bounded like everything else: 2 M characters of input, 1 000 result nodes, 200 000 visited nodes — past that the answer is marked truncated instead of the host stalling.

![Query and validate page](docs/screen-query.png)

## Escape toolbox

- Eight kinds in one page — **URL**, **Base64**, **HTML**, **JSON string**, **`\uXXXX`**, **hex**, **SQL literal**, **regex** — with an encode / decode switch and a **flip** button that swaps the two panes and the direction in one click, so a round-trip check takes two clicks.
- **Its own page, like the others** — it opens from the nav and stays there until you switch pages, so a long escape session never fights with the rest of the workbench. The nav item highlights like any other page, and the convert / compare / SQL pages are untouched while it is open.
- **JSON string** is a first-class kind, not a side effect of the converter: encoding wraps the text in a JSON literal and escapes `"`, `\` and control characters (`\n`, `\t`, `\u0007`…), leaving CJK and other non-ASCII readable instead of turning everything into `\uXXXX` — that is what the **Unicode** kind is for. Decoding accepts both a full literal (with the outer quotes) and a bare escaped fragment, which is what you usually have after copying from a log line.
- **Encoding is byte-correct, not Latin-1** — Base64 and hex go through a hand-written UTF-8 encoder / decoder rather than `btoa`, so `中文` comes back as `5Lit5paH` instead of mojibake, and decoding restores the text exactly, surrogate pairs included.
- **HTML / SQL / regex** escape only what has to be escaped and never double-escape (`O'Brien` → `O''Brien`, `[a-z]{2}` → `\[a-z\]\{2\}`), while the decoders leave other kinds of escapes intact.
- Invalid input fails with a code (a bad Base64 length, a `\u` without four hex digits…) instead of silently producing garbage, and inputs beyond 2 M characters are rejected up front.

![Escape toolbox page](docs/screen-escape.png)

## Byte converter

- **Unit conversion with both bases side by side** — B / KB / MB / GB / TB / PB on the 1000 scale and B / KiB / MiB / GiB / TiB / PiB on the 1024 scale, shown on the same row so 1.5 MB and 1.5 MiB never get mixed up. Decimals adjustable from 0 to 6.
- **Both directions** — type `1234567890` and get `1.23 GB` and `1.15 GiB`; paste `1.15 GiB` and get `1234567890` bytes back. Bare numbers, values with units and shorthands like `700M` all parse, case-insensitively.
- **Batch** — one value per line: mix `1234567890`, `1.5 GB` and `734003200`, and every row gets both conversions with a total at the bottom, which is how you add up a pile of file sizes. A line that cannot be parsed is flagged on its own row and leaves the others alone. Copy produces TSV, so it pastes into Excel as four clean columns.
- **The other ways to write bytes** — paste a byte sequence (`1f 8b 08`, `1f8b08`, `[0x1f, 0x8b]`, `0x1f 0x8b`, binary `00011111 10001011`, or a whole `xxd` dump) and get **hex dump** (xxd style, offsets and ASCII column included), **byte array** and **binary string**, each with its own copy button. This is a different job from the hex kind in the escape toolbox: that one encodes strings, this one is about numbers and byte representations.
- **Every value copies on its own** — each of the three summary cards (exact / base 1000 / base 1024) has its own copy button, and every number in the table is one click away from the clipboard. What lands there is just the number, or the number plus its unit — **never with thousands separators**, so it drops straight into code, a shell command or a config file. The one overall copy button still gives you the TSV.
- Input that makes no sense is rejected rather than guessed at (`zzz` is not read as hex), a single sequence is capped at 8 KB and a value at roughly 1 EiB, and hitting a limit says so instead of freezing the page.

![Byte converter page](docs/screen-bytes.png)

## Time converter

- **Quick actions fill the input for you** — a row of buttons on top: Now, Today start, Yesterday, Week start and Month start. Each click **appends a new line** with that moment to the end of the input and converts right away (Yesterday means yesterday 00:00:00; the week starts on Monday). Values are truncated to the second and written as `2026-10-25 00:00:00`, a notation this page parses, so there is no format to remember.
- **One time per line, mixed notations welcome** — paste `2020-01-01`, `2020-01-01 00:00:00`, `2020-01-01T00:00:00`, `1577836800` and `1577836800000` on their own lines and each line gets every notation it can be expressed in. A line that does not parse is flagged on its own card and the rest still convert, so one bad row never fails the batch.
- **Only the formats you ask for** — seven toggles: Unix timestamp (seconds), Unix timestamp (milliseconds), local time, local time with `T`, UTC, ISO 8601 and relative time. By default only *local time* and *local time (T)* are on, which is the everyday `2020-01-01 00:00:00` ⇄ `2020-01-01T00:00:00` swap; switch another one on and each result card grows a column.
- **Results fold away** — one card per input line, headed by its line number and the original value; clicking the heading collapses or expands it (`−` / `+`), so dozens of lines stay manageable.
- **The card follows your cursor** — move the caret to line N in the input and the results pane scrolls to the Nth card and highlights it, no counting required.
- **Copying gives you results only** — every value copies on click (with a copy cursor on hover) and **Copy row** gives one TSV line. The **Copy** button writes one output line per input line, joining the enabled fields with spaces and separating lines with newlines: no index, no original value, no field labels, ready to paste into a sheet or code. Relative time is for reading only (things like *3 years ago*) and never enters the batch copy.
- Timestamps are recognised by length (10 digits seconds, 13 milliseconds, 16 microseconds trimmed to milliseconds) and ISO strings with `Z` or `+08:00` parse as well. A batch is capped at 2000 lines, and hitting that cap is stated rather than silently ignored.

![Time converter page](docs/screen-time.png)

## JSON to Chart

- **Paste an option, get a chart** — drop a full **ECharts option** on the left (`title` / `xAxis` / `yAxis` / `series` / `dataset` all understood) and the right pane renders exactly that configuration: line, bar, pie, scatter, radar, treemap and every other ECharts chart type works. No API to memorise — copy an option from the official examples and look at it immediately.
- **Bare data is enough** — paste an array of numbers (`[820, 932, 901]`), an array of named objects (`[{ "name": "Jan", "value": 820 }]`), a mapping (`{"Jan": 820, "Feb": 932}`) or `[[x, y]]` pairs and the shape is detected and matched to a sensible type; the toolbar switches between line / bar / area / pie / scatter. For a full option the dropdown keeps working: **Auto** follows `series.type` from the JSON, and picking line / bar / area / pie / scatter overrides it (the first three just swap `series.type`, pie rebuilds from the category names plus the first series) — never leaving you with a blank canvas after a switch.
- **API responses need no unwrapping** — plenty of backends bury the option under a business key, as a string: paste `{"monthly_trend":{"echart_option":"{…}","table_data":null,"biz_data":{}}}` as it is. Keys such as `echart_option` / `chartOption` / `chart_config` / `option` / `data` / `result` are ranked together with the content, up to three layers are peeled, and a double-encoded string (JSON inside a JSON string) is decoded too. The status line says *Parsed from monthly_trend.echart_option* instead of silently swapping what you pasted.
- **Several charts in one JSON, or several JSONs at once** — when a response holds more than one chart (`{"a":{"echart_option":…},"b":{…}}`, `{"charts":[option, option]}`, sibling `option1` / `option2` keys) a **Chart** dropdown appears in the toolbar, listing them by title; picking one redraws. One JSON per line (NDJSON) or back-to-back `{…}{…}` is split as well, with paths shown as `#1…` / `#2…`, while one number per line merges into a single line chart.
- **Task-list exports work too** — the top level is an array, each task carries a field that is itself a serialized JSON string, and only after unwrapping that is it `business key → echart_option / table_data / biz_data`: six layers deep with thousands of table rows in between. Those charts are still found (paths look like `[0].payload.<business key>.echart_option`, and `null` options take no slot). The walk skips plain data rows and scales its budget with the input, so a huge table in front of the chart does not push it out; if an input really is too large to scan completely, the status line says *only the first part was scanned* instead of pretending that is all there is.
- **See the whole chart, then zoom in** — when the canvas does not fit the pane it is scaled down to fit (100% when it does), and the toolbar carries `−` / Fit / percentage / `+`: 1.25× steps, click the percentage for true 1:1, click Fit to go back. Zoom only changes what you see — the export and the conversion always use the pixels you typed. The Image ⇄ Base64 preview shares the same controls and scales proportionally, never stretched.
- **1:1 preview, never stretched** — the canvas is drawn at exactly the pixels in the size fields, with no CSS scaling (what you see is what you export). When it is wider than the pane the stage scrolls, and the left edge is reachable — the previous centred layout pushed the left half out of view where it could not be scrolled back.
- **The size is whatever you type** — the default is **700 × 400** (landscape, matching echarts-node-export-server), and changing the fields (80–4096) moves the preview *and* the export together, WYSIWYG. Out-of-range values are clamped to the bound, written back into the field and explained. Made a mess of it? **Reset size** puts 700 × 400 back.
- **Pixel ratio decides how sharp the export is** — the toolbar's **Pixel ratio** offers **1x / 2x / 3x**, i.e. the render-time `devicePixelRatio`: 1x is exactly the width and height you typed, 2x / 3x produce larger bitmaps that stay crisp in documents and print. Each option states the pixels it will yield (`2x · 1400 × 800`), the export button's tooltip repeats it, and the file name gets an `@2x` / `@3x` suffix so you can tell at a glance. Beyond 24 megapixels (say 4096 × 4096 at 3x) the ratio is stepped down automatically so the host canvas is never blown up.
- **Export PNG / SVG** — PNG comes out at width × pixel ratio, rendered through a throwaway instance created with that `devicePixelRatio` and `animation: false`, so the result never depends on how the on-screen canvas happens to be zoomed. SVG goes through ECharts' `renderToSVGString()`. Both save as files: through the host save channel inside DBX, falling back to a browser download when you open `index.html` directly. Export **ignores the interface theme**: even in dark mode the chart is drawn with ECharts' default (light) palette on a white background, so the preview and the exported file are always the same image — a chart is meant to be pasted somewhere else, where a themed background would look wrong.
- **Zoom to inspect** — **Zoom in** (or a double-click on the canvas) opens the whole chart in a full-screen lightbox: wheel zooms at the cursor, double-click toggles 1:1 and fit, `+` `−` `0` `1` are shortcuts, `Esc` closes. The lightbox renders at the selected pixel ratio too, so 300% still looks sharp. The Image ⇄ Base64 preview shares the same lightbox.
- **Failure is explained** — bad JSON, an unrecognised shape, too many points (20k per series / 50k total), too many series (30) or a chart engine that did not load each get their own message instead of a blank canvas.
- The chart engine (ECharts 6.1.0) **ships offline** and is only loaded the first time you open this page, so the first paint never pays for it. It is not pulled through an external script tag — the engine travels as inert text and is turned into a `blob:` URL on demand, which no sandbox CSP can block. Leaving the page releases the canvas and the instance right away.

![JSON to Chart page](docs/screen-chart.png)

## Workflow

- **Every page can import a file, and the page never moves** — whichever page you are on, the file is handled by that page. The whole window is a drop target (the veil even states the size limit for this page), and the Import file button in the input pane goes through exactly the same channel. On Convert, `.json` / `.yaml` / `.xml` / `.toml` / `.ini` / `.env` / `.log` / `.md` / `.csv` / `.tsv` set the source format and convert straight away, and unknown extensions (`.dat` / `.out` / `.resp` exports) are read and sniffed just the same; the Compare page has its own Import left / Import right buttons, and a dragged file fills whichever side is still empty; SQL, Escape, Bytes, Time, Chart, Codegen and Query each take their own text and run their own rule right after import. Images and spreadsheets are never read as garbage: dropped on a text page they only tell you to use Image ⇄ Base64 or Sheet → JSON — **the page is never switched for you**.
- **The limits are stated up front** — 16 MB per text file (10 MB for an image, 20 MB for a sheet). Over the limit is refused at the door with the actual size and the cap, before anything is read into memory; content that turns out to be binary (NUL bytes / a wall of replacement characters) is refused too. After an import the tip line keeps `file name · size`, and text over 2 M characters is loaded but not auto-converted (so a drop can never freeze the host) — press Convert when you are ready.
- **Drop several sheets at once** — up to 10 files are parsed with the current options and merged into **one JSON object keyed by file name** (`{"a.csv": [...], "b.csv": [...]}`), with duplicate names numbered `a (2).csv`. The preview table shows the first file, and Copy / Export work on the merged result (`batch-2.json`).
- A page's own drop zone and the window-wide entry share one rule: the Image page's zone catches the image first (page-level handlers run before the global one, which steps aside when the event was already handled), and dropping anywhere else still hands the file to the current page — same outcome either way.
- Drops go through the host channel: the DBX window is a Tauri / WebView host, which takes system file drops before the page ever sees a native `drop` event. The plugin uses `dbxPlugin.fileTransfer.onDrop` to get a `handleId`, reads the content back in 256 KB chunks, and drives the overlay from `onDragState`. Opening `index.html` directly falls back to browser events, so both paths work.

## Everywhere

- **Internationalization** — 14 languages: zh-CN, zh-TW, en, ja, ko, es, id, it, pl, pt, ru, th, tr, az. Every page (convert, compare, SQL, sheet, image, code gen, query, escape, bytes, time, chart) is translated into all 14, including the 20 schema-validation messages.
- **Theme adaptability** — follows the DBX host theme and shadcn/ui tokens, including hosts that only send theme metadata (no `data-dbx-theme`) and custom palettes. First paint already matches the host, theme switches cross-fade over 300 ms, and `prefers-reduced-motion` turns the animation off. The one exception is the chart itself on the JSON to Chart page: it is output, not interface, so it stays on the light palette with a white background.
- **Navigation layout** — the button at the far right of the top bar moves the navigation between top and left, top by default. On the left the ten entries stack into one 13rem column and the content area shifts over; the column fits every entry, so "More" never appears. The choice is remembered — host `dbxPlugin.storage` (the sandbox has no `localStorage`), falling back to browser storage or the current session — so reopening keeps the last layout.
- **Clipboard** — one-click copy through the DBX host API, with a browser fallback.
- **Offline** — no backend, no CDN, no telemetry; CodeMirror, the YAML library and ECharts (Apache-2.0, `ui/vendor/echarts/` with its LICENSE) all ship inside the package.

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
./scripts/build.sh test         # all suites (890 cases)
./scripts/build.sh              # run tests, then package dist/*.dbxp
./scripts/run.sh                # shorthand for `build.sh dev`

npm test                        # pure-function suites, no dependencies (890 cases)
npm install && npm run test:ui  # jsdom smoke test of the UI wiring (236 checks)
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
ui/js/confconv.js      format matrix — TOML / INI / .env / CSV / TSV / Query / Headers / Cookie / HTML
ui/js/jsonpath.js      JSONPath + jq subset — one parser, two dialects, result paths
ui/js/schema.js        JSON Schema draft-07 subset — validation errors + inference
ui/js/escape.js        8 escape kinds — URL / Base64 / HTML / JSON / Unicode / hex / SQL / regex
ui/js/bytes.js         byte conversion — units ⇄ bytes, batch totals, hex dump / byte array / binary
ui/js/chart.js         JSON to chart — shape detection, data → option, size clamping and limits
ui/js/time.js          time conversion — timestamps / dates / UTC / ISO / relative, batched
ui/js/flow.js          workflow — drop routing, batch merge, recent list, host selection
tests/                 regression suite, run with plain node
scripts/build.sh       package | dev | test
```

The logic layers are deliberately DOM-free, so `node tests/*.test.js` exercises every converter,
the diff algorithms, sheet parsing and Base64 round-trips without a browser.
