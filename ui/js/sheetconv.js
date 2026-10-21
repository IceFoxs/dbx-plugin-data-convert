/*
 * sheetconv.js — 表格文本（CSV / TSV）→ 记录数组 → JSON
 *
 * 纯函数、无 DOM、无网络：既方便单测，也方便以后挪进 Worker。
 * 大文件策略：
 *   1. 行数 / 列数 / 文件字节数都有硬上限，超了截断并回传 truncated；
 *   2. convertAsync 按批让出主线程，页面不会假死，同时回传进度。
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.DBXSheet = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // 这些上限是「体验」和「内存」之间的折中：20 MB 的 CSV 大约 10 万行 × 20 列，
    // 再大就别在浏览器里硬扛了，拆文件比加内存靠谱。
    var LIMITS = {
        maxFileBytes: 20 * 1024 * 1024,
        maxRows: 100000,
        maxCols: 200,
        previewChars: 120000,
        // 预览最多画多少行：再多就把 DOM 撑爆了，改为在表尾提示
        previewRows: 500
    };

    var NUM_RE = /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/;

    // 判定数字字面量：前导零（007、0912）当成编号，超 15 位会掉精度，都保持字符串
    function isNumberLiteral(s) {
        if (!NUM_RE.test(s)) return false;
        if (/^[-+]?0\d/.test(s)) return false;
        var digits = s.replace(/[^0-9]/g, '').replace(/^0+/, '');
        return digits.length <= 15;
    }

    // 猜分隔符：只看前 4 KB，且跳过引号里的内容（"a,b" 里的逗号不算）
    function detectDelimiter(text) {
        var candidates = [',', '\t', ';', '|'];
        var counts = [0, 0, 0, 0];
        var sample = text.slice(0, 4096);
        var inQuotes = false;
        for (var i = 0; i < sample.length; i++) {
            var ch = sample[i];
            if (ch === '"') {
                if (inQuotes && sample[i + 1] === '"') { i++; continue; }
                inQuotes = !inQuotes;
                continue;
            }
            if (inQuotes) continue;
            var idx = candidates.indexOf(ch);
            if (idx !== -1) counts[idx]++;
            if (ch === '\n' && i > 2048) break;
        }
        var best = 0;
        for (var k = 1; k < candidates.length; k++) {
            if (counts[k] > counts[best]) best = k;
        }
        // 一列都没有分隔符时按逗号算，单列数据也能出结果
        return counts[best] ? candidates[best] : ',';
    }

    // 到达行数上限后再确认一下后面还有没有内容：正好 10 万行时不该报「已截断」
    function hasContent(text, from) {
        for (var i = from; i < text.length; i++) {
            var code = text.charCodeAt(i);
            if (code !== 32 && code !== 9 && code !== 10 && code !== 13) return true;
        }
        return false;
    }

    // RFC 4180：支持引号包裹、"" 转义、"a,b" 内部逗号、跨行字段、CRLF
    function parse(text, opts) {
        opts = opts || {};
        var delimiter = !opts.delimiter || opts.delimiter === 'auto' ? detectDelimiter(text) : opts.delimiter;
        var maxRows = opts.maxRows || LIMITS.maxRows;
        var maxCols = opts.maxCols || LIMITS.maxCols;

        var rows = [];
        var row = [];
        var field = '';
        var inQuotes = false;
        var truncated = false;
        var i = text.charCodeAt(0) === 0xFEFF ? 1 : 0;
        var len = text.length;

        while (i < len) {
            var ch = text[i];

            if (inQuotes) {
                if (ch === '"') {
                    if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
                    inQuotes = false;
                    i++;
                    continue;
                }
                field += ch;
                i++;
                continue;
            }

            if (ch === '"' && field === '') { inQuotes = true; i++; continue; }

            if (ch === delimiter) {
                if (row.length < maxCols) row.push(field);
                field = '';
                i++;
                continue;
            }

            if (ch === '\r' || ch === '\n') {
                if (ch === '\r' && text[i + 1] === '\n') i++;
                i++;
                if (row.length < maxCols) row.push(field);
                field = '';
                // Excel 导出的尾部空行很多，整行空白直接丢掉
                if (!(row.length === 1 && row[0] === '')) rows.push(row);
                row = [];
                if (rows.length >= maxRows) { truncated = hasContent(text, i); break; }
                continue;
            }

            field += ch;
            i++;
        }

        if (!truncated && (field !== '' || row.length)) {
            if (row.length < maxCols) row.push(field);
            if (!(row.length === 1 && row[0] === '')) rows.push(row);
        }

        return { rows: rows, delimiter: delimiter, truncated: truncated };
    }

    // 表头：去空格、空列补 column_N、重名加 _2 后缀（JSON 键重复会悄悄覆盖，必须处理）
    function normalizeHeaders(cells, width) {
        var headers = [];
        var seen = Object.create(null);
        for (var i = 0; i < width; i++) {
            var name = cells && cells[i] != null ? String(cells[i]).trim() : '';
            if (!name) name = 'column_' + (i + 1);
            if (seen[name]) {
                seen[name]++;
                name = name + '_' + seen[name];
            } else {
                seen[name] = 1;
            }
            headers.push(name);
        }
        return headers;
    }

    function coerce(raw, numbers, booleans) {
        var s = typeof raw === 'string' ? raw : (raw == null ? '' : String(raw));
        if (s === '') return '';
        if (numbers && isNumberLiteral(s)) return Number(s);
        if (booleans) {
            var lower = s.toLowerCase();
            if (lower === 'true') return true;
            if (lower === 'false') return false;
        }
        return s;
    }

    // rows → [{列: 值}]；中间补齐短行、截掉超出的列，保证每条记录键一致
    function buildRecords(rows, opts) {
        opts = opts || {};
        var hasHeader = opts.hasHeader !== false;
        var numbers = opts.numbers !== false;
        var booleans = opts.booleans !== false;
        // 有些导出的表格第二行是中文说明（对应方法 / 方法描述…），跳过它
        var skipNote = opts.skipNote === true;
        // 0 / 不传 = 不限；大文件可以先只转前 N 条看看
        var maxRecords = opts.maxRecords > 0 ? opts.maxRecords : 0;

        var width = 0;
        for (var r = 0; r < rows.length; r++) {
            if (rows[r].length > width) width = rows[r].length;
        }

        var headers;
        var start = 0;
        if (hasHeader && rows.length) {
            headers = normalizeHeaders(rows[0], width);
            // 只有两行时第二行更可能是唯一的数据行，不跳（不然直接转出 0 条）
            start = skipNote && rows.length > 2 ? 2 : 1;
        } else {
            headers = [];
            for (var c = 0; c < width; c++) headers.push('column_' + (c + 1));
        }

        var records = [];
        for (var i = start; i < rows.length; i++) {
            if (maxRecords && records.length >= maxRecords) break;
            var row = rows[i];
            var rec = {};
            for (var j = 0; j < headers.length; j++) {
                rec[headers[j]] = coerce(row[j] === undefined ? '' : row[j], numbers, booleans);
            }
            records.push(rec);
        }

        var available = Math.max(rows.length - start, 0);
        return {
            headers: headers,
            records: records,
            width: width,
            available: available,
            limited: maxRecords > 0 && available > records.length
        };
    }

    // 有些表格的第二行不是数据，而是中文说明（接口文档导出的路由表很常见：
    // 第一行 id / method / path，第二行「编号 / 请求方法 / 路径」）。
    // 但「可能」不等于「一定」——这里只给建议，绝不自动跳过，跳不跳由用户决定。
    function cellOf(row, i) {
        var v = row && row[i] != null ? row[i] : '';
        return String(v).trim();
    }

    // 像列名：英文 / 数字 / 下划线组成的短标识符
    function looksLikeColumnName(cell) {
        return cell.length > 0 && cell.length <= 40 && /^[A-Za-z_][A-Za-z0-9_ .\/\-]*$/.test(cell);
    }

    function isAsciiOnly(cell) {
        return cell.length > 0 && !/[^\x20-\x7e]/.test(cell);
    }

    function suggestSkipNote(rows) {
        if (!rows || rows.length < 3) return false;
        var width = Math.min(rows[0].length, rows[1].length);
        if (width < 2) return false;

        var headerCells = 0;
        var headerNames = 0;
        var headerAscii = 0;
        var noteCells = 0;
        var noteNonAscii = 0;
        var noteNumbers = 0;
        for (var c = 0; c < width; c++) {
            var head = cellOf(rows[0], c);
            var note = cellOf(rows[1], c);
            if (head) {
                headerCells++;
                if (looksLikeColumnName(head)) headerNames++;
                if (isAsciiOnly(head)) headerAscii++;
            }
            if (note) {
                noteCells++;
                if (!isAsciiOnly(note)) noteNonAscii++;
                if (isNumberLiteral(note)) noteNumbers++;
            }
        }
        if (!headerCells || !noteCells) return false;
        // 第二行大面积为空，那更可能是残缺数据行，不当说明处理
        if (noteCells / width < 0.6) return false;
        // 说明行一般不含数字；带数字的多半是真实数据（如「李四 / 136.75 / 上海仓」）
        if (noteNumbers > 0) return false;

        // 信号 A：第一行几乎全是英文列名，第二行却成片是中文 → 典型「中英双表头」
        var signalA = headerNames / headerCells >= 0.7 && noteNonAscii / noteCells >= 0.3;

        // 信号 B：第二行一个数字都没有，而第三行起数字很多 → 第二行是文字说明
        var dataRows = Math.min(rows.length, 22);
        var sampleCells = 0;
        var sampleNumbers = 0;
        for (var r = 2; r < dataRows; r++) {
            for (var k = 0; k < width; k++) {
                var cell = cellOf(rows[r], k);
                if (!cell) continue;
                sampleCells++;
                if (isNumberLiteral(cell)) sampleNumbers++;
            }
        }
        var signalB = noteNumbers === 0 && sampleCells > 0 && sampleNumbers / sampleCells >= 0.3;

        return signalA || signalB;
    }

    // 一条记录一行：比 JSON.stringify(records, null, 2) 更省内存，也更好滚
    // pretty：一条记录一行、缩进 2 格；compact：一条记录一行不带缩进（体积小一半，仍可逐条读）
    // pretty：每个字段单独一行、缩进 2 格（真正的「格式化」）；
    // compact：一条记录压成一行，体积小、行数少
    function jsonRecordText(record, pretty) {
        if (!pretty) return JSON.stringify(record);
        return JSON.stringify(record, null, 2).replace(/\n/g, '\n  ');
    }

    function toJsonText(records, opts) {
        opts = opts || {};
        var pretty = opts.pretty !== false;
        if (!records.length) return '[]';
        var out = ['['];
        for (var i = 0; i < records.length; i++) {
            out.push((i ? ',' : '') + '\n' + (pretty ? '  ' : '') + jsonRecordText(records[i], pretty));
        }
        out.push('\n]');
        return out.join('');
    }

    function convert(text, opts) {
        var parsed = parse(text, opts);
        var built = buildRecords(parsed.rows, opts);
        return {
            rows: parsed.rows.length,
            columns: built.headers,
            records: built.records,
            json: toJsonText(built.records, { pretty: opts && opts.pretty }),
            delimiter: parsed.delimiter,
            available: built.available,
            limited: built.limited,
            truncated: parsed.truncated
        };
    }

    function tick() {
        return new Promise(function (resolve) { setTimeout(resolve, 0); });
    }

    // 大表分批序列化：每 4096 条让出一次主线程，页面不会假死
    async function toJsonTextAsync(records, hooks) {
        hooks = hooks || {};
        var report = hooks.onProgress || function () {};
        var stopped = hooks.isCancelled || function () { return false; };
        var pretty = hooks.pretty !== false;
        if (!records.length) return '[]';

        var indent = pretty ? '  ' : '';
        var out = ['['];
        for (var i = 0; i < records.length; i++) {
            out.push((i ? ',' : '') + '\n' + indent + jsonRecordText(records[i], pretty));
            if ((i & 4095) === 4095) {
                report({ done: i + 1, total: records.length });
                await tick();
                if (stopped()) return null;
            }
        }
        out.push('\n]');
        report({ done: records.length, total: records.length });
        return out.join('');
    }

    // ===== SQL INSERT 输出 =====
    // 单条 INSERT 拼太多 VALUES 会撞到数据库的包大小限制，这里每 500 条断一次
    var SQL_BATCH_ROWS = 500;

    function sqlQuote(text) {
        return "'" + String(text).replace(/'/g, "''") + "'";
    }

    function sqlLiteral(value) {
        if (value === null || value === undefined) return 'NULL';
        if (typeof value === 'number') return isFinite(value) ? String(value) : 'NULL';
        if (typeof value === 'boolean') return value ? '1' : '0';
        if (typeof value === 'object') return sqlQuote(JSON.stringify(value));
        return sqlQuote(String(value));
    }

    function sqlIdentifier(name) {
        // 表名 / 列名原样用，但把反引号和分号去掉，避免拼坏语句
        return String(name == null ? '' : name).replace(/[`;]/g, '').trim();
    }

    function sqlPlan(records, opts) {
        opts = opts || {};
        var table = sqlIdentifier(opts.table) || 'your_table_name';
        var columns = [];
        if (opts.columns && opts.columns.length) {
            columns = opts.columns.map(sqlIdentifier);
        } else if (records.length && records[0]) {
            columns = Object.keys(records[0]).map(sqlIdentifier);
        }
        return {
            table: table,
            columns: columns,
            head: 'INSERT INTO ' + table + ' (' + columns.join(', ') + ') VALUES'
        };
    }

    function sqlTuple(record, columns) {
        var parts = [];
        for (var i = 0; i < columns.length; i++) parts.push(sqlLiteral(record[columns[i]]));
        return '(' + parts.join(', ') + ')';
    }

    // 返回若干条 INSERT，每条带 500 个 VALUES，用分号结束
    function toSqlInsertText(records, opts) {
        opts = opts || {};
        if (!records.length) return '';
        var pretty = opts.pretty !== false;
        var plan = sqlPlan(records, opts);
        var out = [];
        for (var start = 0; start < records.length; start += SQL_BATCH_ROWS) {
            var end = Math.min(start + SQL_BATCH_ROWS, records.length);
            var lines = [];
            for (var i = start; i < end; i++) lines.push(sqlTuple(records[i], plan.columns));
            out.push(pretty
                ? plan.head + '\n' + lines.join(',\n') + ';\n'
                : plan.head + ' ' + lines.join(',') + ';\n');
        }
        return out.join(pretty ? '\n' : '');
    }

    async function toSqlInsertTextAsync(records, hooks) {
        hooks = hooks || {};
        var report = hooks.onProgress || function () {};
        var stopped = hooks.isCancelled || function () { return false; };
        if (!records.length) return '';
        var pretty = hooks.pretty !== false;
        var plan = sqlPlan(records, hooks);
        var out = [];
        for (var start = 0; start < records.length; start += SQL_BATCH_ROWS) {
            var end = Math.min(start + SQL_BATCH_ROWS, records.length);
            var lines = [];
            for (var i = start; i < end; i++) lines.push(sqlTuple(records[i], plan.columns));
            out.push(pretty
                ? plan.head + '\n' + lines.join(',\n') + ';\n'
                : plan.head + ' ' + lines.join(',') + ';\n');
            report({ done: end, total: records.length });
            await tick();
            if (stopped()) return null;
        }
        return out.join(pretty ? '\n' : '');
    }

    async function convertAsync(text, opts, hooks) {
        hooks = hooks || {};
        var report = hooks.onProgress || function () {};

        report({ phase: 'parse', done: 0, total: 0 });
        await tick();
        var parsed = parse(text, opts);
        if (hooks.isCancelled && hooks.isCancelled()) return null;

        var built = buildRecords(parsed.rows, opts);
        var json = await toJsonTextAsync(built.records, hooks);
        if (json == null) return null;

        return {
            rows: parsed.rows.length,
            columns: built.headers,
            records: built.records,
            json: json,
            delimiter: parsed.delimiter,
            available: built.available,
            limited: built.limited,
            truncated: parsed.truncated
        };
    }

    return {
        LIMITS: LIMITS,
        isNumberLiteral: isNumberLiteral,
        detectDelimiter: detectDelimiter,
        parse: parse,
        normalizeHeaders: normalizeHeaders,
        buildRecords: buildRecords,
        suggestSkipNote: suggestSkipNote,
        toJsonText: toJsonText,
        toJsonTextAsync: toJsonTextAsync,
        toSqlInsertText: toSqlInsertText,
        toSqlInsertTextAsync: toSqlInsertTextAsync,
        sqlLiteral: sqlLiteral,
        convert: convert,
        convertAsync: convertAsync
    };
});
