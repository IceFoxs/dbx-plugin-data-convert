/*
 * csvedit.js — CSV 编辑器内核（纯函数，无 DOM、无网络）
 *
 * 这一页和「表格转 JSON」不是一回事：那边是「读进来 → 输出 JSON」的一次性转换，
 * 这边是「改数据」——单元格可编辑、行列可增删、可排序、可撤销，
 * 同时源码与表格双向定位。所以模型必须是可变的行列矩阵，而不是只读的记录数组。
 *
 * 三条设计约束（都是这一页的硬需求）：
 *   1. 大文件不能卡死：解析走状态机，parseAsync 按块让出主线程；
 *      表格只渲染视口内的几十行（懒加载），与总行数无关。
 *   2. 长 ID 不能掉精度：整个过程只有字符串，JSON 输出时小于 15 位才算数字，
 *      前导零（007）一律当字符串——和 sheetconv 同一套判定。
 *   3. 撤销要省内存：存「操作」而不是整表快照。10 万行 × 20 列的快照一份就是
 *      几十兆，几十步就把内存撑爆；操作里只带被改动的那点数据。
 *
 * 模型（model）：
 *   {
 *     header:   string[]            列名（没有表头时是自动生成的「列 1、列 2…」）
 *     rows:     string[][]          数据行，宽度与 header 对齐
 *     hasHeader:boolean             文件里真的有表头行（决定序列化时要不要输出）
 *     lineOf:   number[]            每行在源码里的起始行号（0 基，双向定位用）
 *   }
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.DBXCsv = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var LIMITS = {
        // 浏览器里能舒服处理的上限；再大就该拆文件了（和表格页同一档）
        maxBytes: 20 * 1024 * 1024,
        maxRows: 100000,
        maxCols: 200,
        // 一次解析多少字符就让出主线程（128 KB 大约 2~6 ms，肉眼看不到停顿）
        chunkChars: 128 * 1024,
        // 单元格编辑框里能塞多少字（再多就不像「一格」了）
        maxCellChars: 200000,
        // 表格行高靠 CSS 固定，虚拟滚动按这个值算位移，两边必须一致
        rowHeight: 30,
        // 视口外多渲染几行，滚动时不会看到白边
        overscan: 6,
        // 输出面板的字符上限：JSON 美化到几 MB 时浏览器会明显卡顿
        maxOutputChars: 8 * 1024 * 1024,
        // 列宽估算最多看多少行（全表扫一遍只为量宽度不值）
        widthSampleRows: 200
    };

    var NUM_RE = /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/;

    /* 数字字面量：前导零当编号（007），超过 15 位会掉精度，都保持字符串 */
    function isNumberLiteral(s) {
        if (typeof s !== 'string' || !NUM_RE.test(s)) return false;
        if (/^[-+]?0\d/.test(s)) return false;
        var digits = s.replace(/[^0-9]/g, '').replace(/^0+/, '');
        return digits.length <= 15;
    }

    function isBoolLiteral(s) {
        var t = String(s).toLowerCase();
        return t === 'true' || t === 'false';
    }

    /* 猜分隔符：只看前 4 KB，跳过引号里的内容，表格列数太少时按逗号算 */
    function detectDelimiter(text) {
        var candidates = [',', '\t', ';', '|'];
        var counts = [0, 0, 0, 0];
        var sample = String(text || '').slice(0, 4096);
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
        return counts[best] ? candidates[best] : ',';
    }

    function normalizeOpts(opts) {
        opts = opts || {};
        return {
            delimiter: !opts.delimiter || opts.delimiter === 'auto' ? '' : String(opts.delimiter),
            quote: opts.quote === undefined ? '"' : opts.quote,
            header: opts.header !== false,
            trim: !!opts.trim,
            skipEmpty: opts.skipEmpty !== false,
            maxRows: opts.maxRows || LIMITS.maxRows,
            maxCols: opts.maxCols || LIMITS.maxCols
        };
    }

    // ---------------------------------------------------------------- 解析
    /*
     * 状态机分块跑：step(until) 吃到 text[until] 之前，finish() 收尾。
     * 这样同步解析（小文件）和异步分块解析（大文件）共用一份逻辑，
     * 不会出现「大文件解析出来的结果和小文件不一致」这种最难查的 bug。
     */
    function Parser(text, opts) {
        this.text = String(text == null ? '' : text);
        this.opts = normalizeOpts(opts);
        this.bom = this.text.charCodeAt(0) === 0xFEFF;
        this.i = this.bom ? 1 : 0;
        this.delimiter = this.opts.delimiter || detectDelimiter(this.text);
        this.quote = this.opts.quote;
        this.rows = [];
        this.row = [];
        this.field = '';
        this.inQuotes = false;
        this.line = 0;          // 已消费到的源码行号（0 基）
        this.rowLine = 0;       // 当前行起始行号
        this.lineOf = [];
        // maxRows 说的是「数据行」，有表头时多放一行进来，否则上限会少一条
        this.rowLimit = this.opts.maxRows + (this.opts.header ? 1 : 0);
        this.truncated = false;
        this.colsTruncated = false;
        this.done = false;
    }

    Parser.prototype.pushField = function () {
        var v = this.field;
        if (this.opts.trim) v = v.trim();
        if (this.row.length < this.opts.maxCols) this.row.push(v);
        else this.colsTruncated = true;
        this.field = '';
    };

    Parser.prototype.endRow = function () {
        this.pushField();
        var blank = this.row.length === 1 && this.row[0] === '';
        if (!(this.opts.skipEmpty && blank)) {
            this.lineOf.push(this.rowLine);
            this.rows.push(this.row);
            if (this.rows.length >= this.rowLimit) {
                this.truncated = true;
                this.done = true;
            }
        }
        this.row = [];
        this.rowLine = this.line + 1;
    };

    Parser.prototype.step = function (until) {
        if (this.done) return;
        var text = this.text;
        var end = Math.min(text.length, until === undefined ? text.length : until);
        var quote = this.quote;
        var delim = this.delimiter;
        while (this.i < end) {
            var ch = text[this.i];
            if (this.inQuotes) {
                if (quote && ch === quote) {
                    if (text[this.i + 1] === quote) { this.field += quote; this.i += 2; continue; }
                    this.inQuotes = false;
                    this.i++;
                    continue;
                }
                if (ch === '\r' || ch === '\n') {
                    // 引号里的换行属于单元格内容：照样算一行，但不结束记录
                    if (ch === '\r' && text[this.i + 1] === '\n') { this.field += '\r\n'; this.i += 2; this.line++; continue; }
                    this.field += ch;
                    this.line++;
                    this.i++;
                    continue;
                }
                this.field += ch;
                this.i++;
                continue;
            }
            if (quote && ch === quote && this.field === '') {
                this.inQuotes = true;
                this.i++;
                continue;
            }
            if (ch === delim) {
                this.pushField();
                this.i++;
                continue;
            }
            if (ch === '\r' || ch === '\n') {
                if (ch === '\r' && text[this.i + 1] === '\n') this.i++;
                this.i++;
                this.endRow();
                this.line++;
                this.rowLine = this.line;
                if (this.done) return;
                continue;
            }
            this.field += ch;
            this.i++;
        }
    };

    Parser.prototype.finish = function () {
        this.step(this.text.length);
        if (!this.done && (this.field !== '' || this.row.length)) this.endRow();
        this.done = true;
        return this.result();
    };

    Parser.prototype.result = function () {
        var opts = this.opts;
        var rows = this.rows;
        var lineOf = this.lineOf;
        var header = null;
        var headLine = 0;
        if (opts.header && rows.length) {
            header = rows.shift();
            headLine = lineOf.shift();
        }
        var width = header ? header.length : 0;
        for (var i = 0; i < rows.length; i++) {
            if (rows[i].length > width) width = rows[i].length;
        }
        if (width > opts.maxCols) width = opts.maxCols;

        var generated = !header;
        if (!header) header = [];
        for (var c = 0; c < width; c++) {
            if (header[c] === undefined || header[c] === '') header[c] = '列 ' + (c + 1);
        }
        // 表头比数据短：补上占位列名，别让单元格读出来是 undefined
        if (header.length > width) header.length = width;

        for (var r = 0; r < rows.length; r++) {
            var row = rows[r];
            if (row.length > width) row.length = width;
            for (var k = row.length; k < width; k++) row.push('');
        }

        return {
            ok: true,
            header: header,
            rows: rows,
            hasHeader: !generated,
            lineOf: lineOf,
            headLine: headLine,
            delimiter: this.delimiter,
            bom: this.bom,
            truncated: this.truncated,
            colsTruncated: this.colsTruncated,
            // 文本总行数：源码面板的行号徽标用得上
            totalLines: this.line + 1
        };
    };

    function parse(text, opts) {
        return new Parser(text, opts).finish();
    }

    /*
     * 分块解析：大文件（比如 20 MB）同步跑要几百毫秒，宿主里就是一秒的假死。
     * 这里每 chunkChars 字符让出一帧，顺便回传进度。
     * onProgress 可能被调用几十次，别在里面做重活。
     */
    function parseAsync(text, opts, onProgress) {
        var parser = new Parser(text, opts);
        var total = parser.text.length || 1;
        return new Promise(function (resolve) {
            function tick() {
                try {
                    parser.step(parser.i + LIMITS.chunkChars);
                    if (onProgress) onProgress(Math.min(1, parser.i / total));
                    if (parser.done || parser.i >= parser.text.length) {
                        resolve(parser.finish());
                        return;
                    }
                } catch (e) {
                    resolve({ ok: false, error: e && e.message ? e.message : String(e) });
                    return;
                }
                setTimeout(tick, 0);
            }
            tick();
        });
    }

    // ---------------------------------------------------------------- 序列化
    function countBreaks(s) {
        var n = 0;
        for (var i = 0; i < s.length; i++) {
            var ch = s.charCodeAt(i);
            if (ch === 10) n++;
            else if (ch === 13) { if (s.charCodeAt(i + 1) === 10) i++; n++; }
        }
        return n;
    }

    function encodeCell(value, delim, quote, mode) {
        var s = value == null ? '' : String(value);
        if (!quote || mode === 'never') return s;
        var need = mode === 'always'
            || s.indexOf(delim) >= 0
            || s.indexOf(quote) >= 0
            || s.indexOf('\n') >= 0
            || s.indexOf('\r') >= 0
            // 首尾空格不包引号的话，再读回来会被 trim 掉（有些工具还会直接吃掉）
            || s !== s.trim();
        if (!need) return s;
        return quote + s.split(quote).join(quote + quote) + quote;
    }

    function encodeRow(cells, delim, quote, mode) {
        var out = [];
        for (var i = 0; i < cells.length; i++) out.push(encodeCell(cells[i], delim, quote, mode));
        return out.join(delim);
    }

    /*
     * 模型 -> 文本。顺便回传 lineOf（数据行 i 从源码第几行开始），
     * 表格改完源码重新生成后，双向定位靠的就是它。
     *
     * opts: { delimiter, quote, quoteMode: 'auto'|'always'|'never',
     *         eol: '\n'|'\r\n', bom, header }
     */
    function serialize(model, opts) {
        opts = opts || {};
        var delim = opts.delimiter || ',';
        var quote = opts.quote === undefined ? '"' : opts.quote;
        var mode = opts.quoteMode || 'auto';
        var eol = opts.eol === '\r\n' ? '\r\n' : '\n';
        var wantHeader = opts.header !== false && model.hasHeader !== false;
        var parts = [];
        var lineOf = [];
        var line = 0;

        if (wantHeader) {
            var head = encodeRow(model.header, delim, quote, mode);
            parts.push(head);
            line += countBreaks(head) + 1;
        }
        var rows = model.rows;
        for (var i = 0; i < rows.length; i++) {
            lineOf.push(line);
            var text = encodeRow(rows[i], delim, quote, mode);
            parts.push(text);
            line += countBreaks(text) + 1;
        }
        var body = parts.join(eol);
        if (body && opts.trailing !== false) body += eol;
        if (opts.bom) body = '\uFEFF' + body;
        return { text: body, lineOf: lineOf };
    }

    /*
     * 一条记录的原文里，每一格占的字符区间（[start, end)，含引号）。
     * 用途：选中某个单元格时，在源码面板里把那一段精确高亮出来——
     * 只亮整行的话，一行十几列根本看不出选的是哪一格。
     *
     * 解析规则必须和 Parser 一致（引号包裹、"" 转义、引号后的残留字符），
     * 否则两边对不上，高亮会歪到隔壁格子。
     */
    function fieldSpans(text, delimiter, quote) {
        var s = String(text == null ? '' : text);
        var delim = delimiter || ',';
        var q = quote || '"';
        var spans = [];
        var i = 0;
        var n = s.length;
        while (i <= n) {
            var start = i;
            var end = i;
            if (s.charAt(i) === q) {
                i++;
                while (i < n) {
                    var ch = s.charAt(i);
                    if (ch === q) {
                        if (s.charAt(i + 1) === q) { i += 2; continue; }
                        i++;
                        break;
                    }
                    i++;
                }
                end = i;
                // 闭合引号后面还可能跟点脏东西（"a"b），一起算进这一格
                while (i < n && s.charAt(i) !== delim && s.charAt(i) !== '\n' && s.charAt(i) !== '\r') i++;
                end = i;
            } else {
                while (i < n && s.charAt(i) !== delim && s.charAt(i) !== '\n' && s.charAt(i) !== '\r') i++;
                end = i;
            }
            spans.push({ start: start, end: end });
            if (i >= n) break;
            if (s.charAt(i) === delim) { i++; continue; }
            break;
        }
        return spans;
    }

    /* 字符偏移 -> 源码坐标（行号相对文本起点，ch 是列），给 CodeMirror 用 */
    function offsetToPos(text, offset, baseLine) {
        var s = String(text == null ? '' : text);
        var line = baseLine || 0;
        var ch = 0;
        var limit = Math.max(0, Math.min(offset, s.length));
        for (var i = 0; i < limit; i++) {
            var code = s.charCodeAt(i);
            if (code === 10) { line++; ch = 0; }
            else if (code === 13) {
                if (s.charCodeAt(i + 1) === 10) {
                    if (i + 1 < limit) i++;
                }
                line++; ch = 0;
            } else ch++;
        }
        return { line: line, ch: ch };
    }

    // ---------------------------------------------------------------- 输出格式
    function uniqueKeys(header) {
        var seen = Object.create(null);
        var keys = [];
        for (var i = 0; i < header.length; i++) {
            var base = header[i] || ('列 ' + (i + 1));
            var key = base;
            var n = 2;
            while (seen[key]) { key = base + ' (' + n + ')'; n++; }
            seen[key] = true;
            keys.push(key);
        }
        return keys;
    }

    function cellValue(raw, types) {
        if (!types) return raw;
        if (isNumberLiteral(raw)) return Number(raw);
        if (isBoolLiteral(raw)) return raw.toLowerCase() === 'true';
        return raw;
    }

    /* 记录数组：导出 JSON / 给别人复用时用 */
    function toRecords(model, opts) {
        opts = opts || {};
        var keys = uniqueKeys(model.header);
        var out = [];
        for (var r = 0; r < model.rows.length; r++) {
            var row = model.rows[r];
            var rec = {};
            for (var c = 0; c < keys.length; c++) rec[keys[c]] = cellValue(row[c], opts.types);
            out.push(rec);
        }
        return out;
    }

    function toJson(model, opts) {
        opts = opts || {};
        var records = toRecords(model, opts);
        var text;
        try {
            text = opts.pretty === false ? JSON.stringify(records) : JSON.stringify(records, null, 2);
        } catch (e) {
            return '';
        }
        return text;
    }

    function mdCell(v) {
        var s = v == null ? '' : String(v);
        if (/[|\r\n]/.test(s)) s = s.replace(/\|/g, '\\|').replace(/\r\n|\r|\n/g, '<br>');
        return s;
    }

    function toMarkdown(model, opts) {
        opts = opts || {};
        var head = model.header.map(mdCell);
        var lines = [];
        if (opts.header !== false && model.hasHeader !== false) {
            lines.push('| ' + head.join(' | ') + ' |');
            var sep = [];
            for (var i = 0; i < head.length; i++) sep.push('---');
            lines.push('| ' + sep.join(' | ') + ' |');
        }
        for (var r = 0; r < model.rows.length; r++) {
            var row = model.rows[r].map(mdCell);
            lines.push('| ' + row.join(' | ') + ' |');
        }
        return lines.join('\n');
    }

    /*
     * Markdown 表格文本 -> HTML 表格（GFM 语法，够用就行）。
     * 为什么要它：Markdown 页签光看源码看不出表长什么样，预览得真渲染一遍。
     * 只认表格本身：HTML 转义、\| 还原成 |、<br> 保留、**粗体** 与 `code` 过一遍。
     * 认不出表格就返回空串，调用方自己给提示，别硬渲染一堆垃圾。
     */
    function mdEscHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function mdInline(s) {
        var out = mdEscHtml(s);
        // 我们自己生成的换行是 <br>，转义后要还原回来（不能反过来先还原再转义，那就成 XSS 口子了）
        out = out.replace(/&lt;br\s*\/?&gt;/gi, '<br>');
        out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
        out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        out = out.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
        return out;
    }

    /* 拆一行表格：首尾的 | 去掉，\| 不当作分隔符 */
    function splitMdRow(line) {
        var s = String(line == null ? '' : line).trim();
        if (s.charAt(0) === '|') s = s.slice(1);
        if (s.charAt(s.length - 1) === '|' && s.charAt(s.length - 2) !== '\\') s = s.slice(0, -1);
        var cells = [];
        var buf = '';
        for (var i = 0; i < s.length; i++) {
            var ch = s.charAt(i);
            if (ch === '\\' && s.charAt(i + 1) === '|') { buf += '|'; i++; continue; }
            if (ch === '|') { cells.push(buf); buf = ''; continue; }
            buf += ch;
        }
        cells.push(buf);
        var out = [];
        for (var j = 0; j < cells.length; j++) out.push(cells[j].trim());
        return out;
    }

    /* 分隔行：| --- | :--: | 之类，有它才认这是表格 */
    function isMdSeparator(line) {
        var s = String(line == null ? '' : line).trim();
        if (s.indexOf('-') < 0) return false;
        return /^\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?$/.test(s);
    }

    function mdAlignOf(cell) {
        var t = String(cell == null ? '' : cell).replace(/\s/g, '');
        var left = t.charAt(0) === ':';
        var right = t.charAt(t.length - 1) === ':';
        if (left && right) return 'center';
        if (right) return 'right';
        if (left) return 'left';
        return '';
    }

    function markdownTableToHtml(md) {
        var lines = String(md == null ? '' : md).split(/\r\n|\r|\n/);
        var start = -1;
        for (var i = 0; i + 1 < lines.length; i++) {
            if (lines[i].indexOf('|') < 0) continue;
            if (isMdSeparator(lines[i + 1])) { start = i; break; }
        }
        if (start < 0) return '';
        var head = splitMdRow(lines[start]);
        var colAlign = [];
        var sep = splitMdRow(lines[start + 1]);
        for (var a = 0; a < head.length; a++) colAlign.push(mdAlignOf(sep[a]));
        var cols = head.length;
        var out = ['<table class="md-table"><thead><tr>'];
        for (var c = 0; c < cols; c++) {
            out.push('<th' + (colAlign[c] ? ' style="text-align:' + colAlign[c] + '"' : '') + '>'
                + mdInline(head[c]) + '</th>');
        }
        out.push('</tr></thead><tbody>');
        for (var r = start + 2; r < lines.length; r++) {
            var line = lines[r];
            if (!line.trim()) break;            // 空行 = 表格结束
            if (line.indexOf('|') < 0) break;
            var cells = splitMdRow(line);
            out.push('<tr>');
            for (var k = 0; k < cols; k++) {
                out.push('<td' + (colAlign[k] ? ' style="text-align:' + colAlign[k] + '"' : '') + '>'
                    + mdInline(cells[k] || '') + '</td>');
            }
            out.push('</tr>');
        }
        out.push('</tbody></table>');
        return out.join('');
    }

    // ---------------------------------------------------------------- 列宽
    /* 中日韩字符按两格算：否则「张三」和「abc」量出来一样宽，列挤成一团 */
    function textWidth(s) {
        var w = 0;
        var str = String(s == null ? '' : s);
        for (var i = 0; i < str.length; i++) {
            var code = str.charCodeAt(i);
            w += code > 0x2e80 && code !== 0xfffd ? 2 : 1;
        }
        return w;
    }

    /* 估算每列像素宽：只采样前 N 行，夹在 [72, 320] 之间 */
    function colWidths(model, opts) {
        opts = opts || {};
        var min = opts.min || 72;
        var max = opts.max || 320;
        var sample = Math.min(model.rows.length, opts.sample || LIMITS.widthSampleRows);
        var widths = [];
        for (var c = 0; c < model.header.length; c++) {
            var w = textWidth(model.header[c]) + 4;
            for (var r = 0; r < sample; r++) {
                var v = model.rows[r][c];
                // 超长单元格不参与量宽度：一个 5000 字的备注会把整列撑到上限
                if (v && v.length > 120) continue;
                var tw = textWidth(v);
                if (tw > w) w = tw;
            }
            widths.push(Math.max(min, Math.min(max, Math.round(w * 7.2) + 18)));
        }
        return widths;
    }

    // ---------------------------------------------------------------- 操作（撤销用）
    /*
     * 每个 op 都能正着执行一次、反着撤销一次，且只带自己需要的数据：
     *   cell   改一个单元格        { r, c, from, to }
     *   cells  批量改（全部替换）  { items: [{ r, c, from, to }] }
     *   rowIns 插入空行            { at, count }
     *   rowDel 删除行              { at, rows: [...] }
     *   colIns 插入空列            { at, name }
     *   colDel 删除列              { at, name, values: [...] }
     *   head   改列名              { at, from, to }
     *   order  重排（排序/移动）   { order: [旧下标...] }
     */
    function opCell(r, c, from, to) { return { t: 'cell', r: r, c: c, from: from, to: to }; }
    function opCells(items) { return { t: 'cells', items: items }; }
    function opRowIns(at, count) { return { t: 'rowIns', at: at, count: count || 1 }; }
    function opRowDel(at, rows) { return { t: 'rowDel', at: at, rows: rows }; }
    function opColIns(at, name) { return { t: 'colIns', at: at, name: name || ('列 ' + (at + 1)) }; }
    function opColDel(at, name, values) { return { t: 'colDel', at: at, name: name, values: values }; }
    function opHead(at, from, to) { return { t: 'head', at: at, from: from, to: to }; }
    function opOrder(order) { return { t: 'order', order: order }; }

    function emptyRow(width) {
        var row = [];
        for (var i = 0; i < width; i++) row.push('');
        return row;
    }

    function invertOrder(order) {
        var inv = new Array(order.length);
        for (var i = 0; i < order.length; i++) inv[order[i]] = i;
        return inv;
    }

    /* dir > 0 执行，dir < 0 撤销。原地改 model，返回被改动的位置（调用方拿去滚动定位） */
    function applyOp(model, op, dir) {
        if (!op || !model) return null;
        var rows = model.rows;
        var header = model.header;
        var i;
        switch (op.t) {
            case 'cell':
                if (!rows[op.r]) return null;
                rows[op.r][op.c] = dir > 0 ? op.to : op.from;
                return { r: op.r, c: op.c };
            case 'cells':
                for (i = 0; i < op.items.length; i++) {
                    var it = op.items[i];
                    if (!rows[it.r]) continue;
                    rows[it.r][it.c] = dir > 0 ? it.to : it.from;
                }
                return op.items.length ? { r: op.items[0].r, c: op.items[0].c } : null;
            case 'rowIns':
                if (dir > 0) {
                    var add = [];
                    for (i = 0; i < op.count; i++) add.push(emptyRow(header.length));
                    rows.splice.apply(rows, [op.at, 0].concat(add));
                    return { r: op.at, c: 0 };
                }
                rows.splice(op.at, op.count);
                return { r: Math.min(op.at, rows.length - 1), c: 0 };
            case 'rowDel':
                if (dir > 0) {
                    rows.splice(op.at, op.rows.length);
                    return { r: Math.min(op.at, rows.length - 1), c: 0 };
                }
                rows.splice.apply(rows, [op.at, 0].concat(op.rows));
                return { r: op.at, c: 0 };
            case 'colIns':
                if (dir > 0) {
                    header.splice(op.at, 0, op.name);
                    for (i = 0; i < rows.length; i++) rows[i].splice(op.at, 0, '');
                    return { r: 0, c: op.at };
                }
                header.splice(op.at, 1);
                for (i = 0; i < rows.length; i++) rows[i].splice(op.at, 1);
                return { r: 0, c: Math.max(0, op.at - 1) };
            case 'colDel':
                if (dir > 0) {
                    header.splice(op.at, 1);
                    for (i = 0; i < rows.length; i++) rows[i].splice(op.at, 1);
                    return { r: 0, c: Math.max(0, op.at - 1) };
                }
                header.splice(op.at, 0, op.name);
                for (i = 0; i < rows.length; i++) rows[i].splice(op.at, 0, op.values[i] === undefined ? '' : op.values[i]);
                return { r: 0, c: op.at };
            case 'head':
                header[op.at] = dir > 0 ? op.to : op.from;
                return { r: 0, c: op.at };
            case 'order': {
                var order = dir > 0 ? op.order : invertOrder(op.order);
                var next = [];
                for (i = 0; i < order.length; i++) next.push(rows[order[i]]);
                model.rows = next;
                return { r: 0, c: 0 };
            }
            default:
                return null;
        }
    }

    /* 排序：返回 order（新第 i 行来自旧第几行），不动原数组，交给 opOrder 统一走撤销栈 */
    function sortOrder(rows, col, opts) {
        opts = opts || {};
        var desc = !!opts.desc;
        var numeric = opts.numeric !== false;
        var idx = [];
        for (var i = 0; i < rows.length; i++) idx.push(i);
        idx.sort(function (a, b) {
            var av = rows[a][col] == null ? '' : String(rows[a][col]);
            var bv = rows[b][col] == null ? '' : String(rows[b][col]);
            // 空值永远沉底，不管升序还是降序（用户体验上「空的」不该占头部）
            if (av === '' && bv === '') return a - b;
            if (av === '') return 1;
            if (bv === '') return -1;
            var cmp;
            if (numeric && isNumberLiteral(av) && isNumberLiteral(bv)) cmp = Number(av) - Number(bv);
            else cmp = av.localeCompare(bv, undefined, { numeric: numeric, sensitivity: 'base' });
            if (cmp === 0) return a - b;
            return desc ? -cmp : cmp;
        });
        return idx;
    }

    /* 过滤：返回命中行的下标数组（视图层用，不改数据） */
    function filterIndices(rows, query, col) {
        var q = String(query || '').trim().toLowerCase();
        var out = [];
        if (!q) {
            for (var i = 0; i < rows.length; i++) out.push(i);
            return out;
        }
        var single = typeof col === 'number' && col >= 0;
        for (var r = 0; r < rows.length; r++) {
            var row = rows[r];
            if (single) {
                if (String(row[col] == null ? '' : row[col]).toLowerCase().indexOf(q) >= 0) out.push(r);
                continue;
            }
            for (var c = 0; c < row.length; c++) {
                if (String(row[c] == null ? '' : row[c]).toLowerCase().indexOf(q) >= 0) { out.push(r); break; }
            }
        }
        return out;
    }

    /* 全部替换：返回待改项，交给 opCells 一次性进撤销栈 */
    function findMatches(rows, query, col, exactCase) {
        var q = String(query == null ? '' : query);
        if (!q) return [];
        var hay = exactCase ? q : q.toLowerCase();
        var out = [];
        var single = typeof col === 'number' && col >= 0;
        for (var r = 0; r < rows.length; r++) {
            var row = rows[r];
            var from = single ? col : 0;
            var to = single ? col : row.length - 1;
            for (var c = from; c <= to; c++) {
                var v = String(row[c] == null ? '' : row[c]);
                if ((exactCase ? v : v.toLowerCase()).indexOf(hay) >= 0) out.push({ r: r, c: c, value: v });
            }
        }
        return out;
    }

    function replaceValue(value, query, replacement, exactCase) {
        var q = String(query == null ? '' : query);
        if (!q) return value;
        var src = String(value);
        var rep = replacement == null ? '' : String(replacement);
        if (exactCase) return src.split(q).join(rep);
        // 大小写不敏感：正则里要转义元字符，不能用 split
        var safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return src.replace(new RegExp(safe, 'gi'), rep);
    }

    // ---------------------------------------------------------------- 小工具
    function formatBytes(n) {
        var v = Number(n) || 0;
        if (v < 1024) return v + ' B';
        if (v < 1024 * 1024) return (v / 1024).toFixed(v < 10240 ? 1 : 0) + ' KB';
        return (v / 1024 / 1024).toFixed(1) + ' MB';
    }

    function formatInt(n) {
        var v = Math.round(Number(n) || 0);
        return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    /* 单元格在源码里的行号：二分找最后一个 lineOf[i] <= line */
    function rowAtLine(lineOf, line) {
        if (!lineOf || !lineOf.length) return -1;
        var lo = 0;
        var hi = lineOf.length - 1;
        while (lo < hi) {
            var mid = (lo + hi + 1) >> 1;
            if (lineOf[mid] <= line) lo = mid;
            else hi = mid - 1;
        }
        return lineOf[lo] <= line ? lo : -1;
    }

    /* 新建一张空表：从零开始时给个 3 × 5 的样板，总比空白画布好上手 */
    function blank(cols, rows) {
        var n = Math.max(1, cols || 3);
        var m = Math.max(0, rows === undefined ? 5 : rows);
        var header = [];
        for (var c = 0; c < n; c++) header.push('列 ' + (c + 1));
        var data = [];
        for (var r = 0; r < m; r++) data.push(emptyRow(n));
        return { header: header, rows: data, hasHeader: true, lineOf: [] };
    }

    return {
        LIMITS: LIMITS,
        isNumberLiteral: isNumberLiteral,
        detectDelimiter: detectDelimiter,
        parse: parse,
        parseAsync: parseAsync,
        serialize: serialize,
        encodeCell: encodeCell,
        fieldSpans: fieldSpans,
        offsetToPos: offsetToPos,
        toRecords: toRecords,
        toJson: toJson,
        toMarkdown: toMarkdown,
        markdownTableToHtml: markdownTableToHtml,
        colWidths: colWidths,
        textWidth: textWidth,
        uniqueKeys: uniqueKeys,
        opCell: opCell,
        opCells: opCells,
        opRowIns: opRowIns,
        opRowDel: opRowDel,
        opColIns: opColIns,
        opColDel: opColDel,
        opHead: opHead,
        opOrder: opOrder,
        applyOp: applyOp,
        invertOrder: invertOrder,
        sortOrder: sortOrder,
        filterIndices: filterIndices,
        findMatches: findMatches,
        replaceValue: replaceValue,
        rowAtLine: rowAtLine,
        formatBytes: formatBytes,
        formatInt: formatInt,
        blank: blank
    };
});
