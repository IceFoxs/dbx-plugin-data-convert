/*
 * Byte units — pure functions, no DOM.
 *
 * The escape page's 9th kind: everything about "how big is this", decided here
 * so it can be unit tested without a browser.
 *
 *   parse()        text -> rows of { bytes, data }  (size or byte sequence)
 *   human()        bytes -> "1.15 GiB"              (1000 or 1024 base)
 *   toHexDump()    bytes -> xxd-style text
 *   toByteArray()  bytes -> [0x1f, 0x8b, 0x08]
 *   toBinary()     bytes -> 00011111 10001011
 *
 * A line is either a size (`1234567890`, `1.15 GiB`, `10 MB`) or a byte
 * sequence (`1f 8b 08`, `[0x1f, 0x8b]`, `00011111 10001011`, xxd output).
 * Loaded as a classic script (window.DBXBytes) and as CommonJS in tests.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.DBXBytes = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var LIMITS = {
        maxBytes: 1e18,        // 输入再大就不是"文件大小"了，也超出 double 的整数精度
        maxSeq: 8 * 1024,      // 一段序列最多多少字节（hex dump 会膨胀 4 倍）
        maxLines: 200,         // 批量最多几行
        preview: 2048          // 三种写法的预览字数，复制仍拿全文
    };

    var UNITS_1000 = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    var UNITS_1024 = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];

    // 单位 -> 字节倍数；1024 制一次给全，1000 制靠 k/m/g 这类简写
    var MULT = {
        '': 1, b: 1, byte: 1, bytes: 1,
        k: 1e3, kb: 1e3, m: 1e6, mb: 1e6, g: 1e9, gb: 1e9, t: 1e12, tb: 1e12, p: 1e15, pb: 1e15,
        kib: 1024, mib: Math.pow(1024, 2), gib: Math.pow(1024, 3),
        tib: Math.pow(1024, 4), pib: Math.pow(1024, 5)
    };

    function trimZeros(s) {
        return s.indexOf('.') >= 0 ? s.replace(/\.?0+$/, '') : s;
    }

    function fixed(n, decimals) {
        var d = decimals == null ? 2 : decimals;
        if (d <= 0) return String(Math.round(n));
        return trimZeros(n.toFixed(d));
    }

    /**
     * bytes -> { value, unit, index }：取不超过该值的最大单位。
     * base 传 1000 或 1024，两套单位各自独立，不混。
     */
    function scale(bytes, base, decimals) {
        var units = base === 1024 ? UNITS_1024 : UNITS_1000;
        var step = base === 1024 ? 1024 : 1000;
        var n = Number(bytes) || 0;
        var i = 0;
        while (i < units.length - 1 && Math.abs(n) >= step) {
            n = n / step;
            i++;
        }
        return { value: fixed(n, decimals), unit: units[i], index: i };
    }

    function human(bytes, decimals, base) {
        var s = scale(bytes, base || 1024, decimals);
        return s.value + ' ' + s.unit;
    }

    // ---------- 输入解析 ----------

    function parseSize(text) {
        var m = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?)\s*([a-zA-Z]*)$/.exec(text);
        if (!m) return null;
        var unit = m[2].toLowerCase();
        // 有单位但不在表里（比如 "1234 xyz"）：不是有效的大小
        if (unit && !Object.prototype.hasOwnProperty.call(MULT, unit)) return null;
        var n = Number(m[1]);
        if (!isFinite(n) || n < 0) return { code: 'bad' };
        var bytes = n * (MULT[unit] || 1);
        if (bytes > LIMITS.maxBytes) return { code: 'too-large' };
        return { bytes: Math.round(bytes) };
    }

    function hex2(b) {
        return (b < 16 ? '0' : '') + b.toString(16);
    }

    function pad(n, width) {
        var s = String(n);
        while (s.length < width) s = '0' + s;
        return s;
    }

    /**
     * 一段文本 -> Uint8Array。认这几种：
     *   xxd 输出（含偏移列与右侧 ASCII）
     *   1f 8b 08 / 1f8b08 / 0x1f,0x8b / [0x1f, 0x8b] / 1f-8b-08
     *   00011111 10001011（二进制）
     *   200 100 50（十进制，仅当整串没有 a-f 也没有 0x 时）
     * 整串统一一种进制，避免 "1f 8b 08 00" 里 08 被当成十进制 8。
     */
    function parseSequence(text) {
        var cleaned = String(text).split(/\r?\n/).map(function (line) {
            var l = line;
            var om = /^\s*[0-9a-fA-F]{4,8}:\s?/.exec(l);
            if (!om) return l;                                     // 不是 xxd 行，原样留着
            l = l.slice(om[0].length);
            // xxd 行的右半边是 ASCII 列：有 |...| 就按竖线切，没有就按「两个以上空格」切
            var bar = l.indexOf('|');
            if (bar >= 0) return l.slice(0, bar);
            return l.split(/\s{2,}/)[0];
        }).join(' ').trim();

        if (!cleaned) return null;
        // 字节数组可能写成多行（每行一个 [...]），括号一律当分隔符
        cleaned = cleaned.replace(/[[\]]/g, ' ');

        var tokens = cleaned.split(/[\s,;\-]+/).filter(function (t) { return t; });
        if (!tokens.length) return null;

        var hasHexPrefix = false;
        var hasHexDigit = false;
        var allBinary = true;
        var allDecimal = true;
        for (var i = 0; i < tokens.length; i++) {
            var t = tokens[i];
            if (/^0x[0-9a-fA-F]+$/.test(t)) { hasHexPrefix = true; allBinary = false; allDecimal = false; continue; }
            if (/^[0-9a-fA-F]+$/.test(t)) {
                if (/[a-fA-F]/.test(t)) { hasHexDigit = true; allBinary = false; allDecimal = false; }
                else if (!/^[01]{8}$/.test(t)) allBinary = false;
                if (!/^\d{1,3}$/.test(t)) allDecimal = false;
                continue;
            }
            return null;
        }

        // xxd 是 2/4 位一组的 hex（`1f8b 0800`），纯数字 token 长过 3 位也已不是十进制字节
        var mode = (hasHexPrefix || hasHexDigit) ? 'hex'
            : (allBinary ? 'bin' : (allDecimal ? 'dec' : 'hex'));

        var bytes = [];
        for (var j = 0; j < tokens.length; j++) {
            var tok = tokens[j];
            if (mode === 'bin') {
                bytes.push(parseInt(tok, 2));
            } else if (mode === 'dec') {
                bytes.push(parseInt(tok, 10));
            } else {
                var h = tok.replace(/^0x/i, '');
                if (h.length % 2) h = '0' + h;                     // 0x1 也算 0x01
                for (var k = 0; k < h.length; k += 2) {
                    bytes.push(parseInt(h.substr(k, 2), 16));
                }
            }
            if (bytes.length > LIMITS.maxSeq) return { code: 'too-many' };
        }

        for (var b = 0; b < bytes.length; b++) {
            if (!isFinite(bytes[b]) || bytes[b] < 0 || bytes[b] > 255) return null;
        }
        return { data: new Uint8Array(bytes), seqBase: mode };
    }

    /** 一行 -> { ok, mode, bytes, data?, code? } */
    function parseLine(raw) {
        var text = String(raw == null ? '' : raw).trim();
        if (!text) return { ok: false, code: 'empty' };

        // 纯数字 / 数字+单位优先：`1234` 是 1234 字节，不是两个 hex 字节
        var size = parseSize(text);
        if (size && size.code) return { ok: false, code: size.code };
        if (size) {
            return { ok: true, mode: 'size', bytes: size.bytes, data: null, input: text };
        }

        var seq = parseSequence(text);
        if (seq && seq.code) return { ok: false, code: seq.code };
        if (seq) {
            return { ok: true, mode: 'bytes', bytes: seq.data.length, data: seq.data, seqBase: seq.seqBase, input: text };
        }
        return { ok: false, code: 'bad' };
    }

    /**
     * 整段文本 -> 批量结果。
     * { ok, rows:[...], total, okCount, firstData }
     */
    function parse(text) {
        var lines = String(text == null ? '' : text).split(/\r?\n/);
        var rows = [];
        var total = 0;
        var okCount = 0;
        var firstData = null;
        var truncated = false;

        for (var i = 0; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            if (rows.length >= LIMITS.maxLines) { truncated = true; break; }
            var row = parseLine(lines[i]);
            row.line = i + 1;
            if (row.ok) {
                okCount++;
                total += row.bytes;
                if (!firstData && row.data) firstData = row.data;
            }
            rows.push(row);
        }
        return {
            ok: okCount > 0,
            rows: rows,
            total: total,
            okCount: okCount,
            firstData: firstData,
            truncated: truncated
        };
    }

    // ---------- 三种「字节的写法」 ----------

    function toHexDump(data) {
        var perLine = 16;
        var out = [];
        for (var i = 0; i < data.length; i += perLine) {
            var slice = data.subarray(i, Math.min(i + perLine, data.length));
            var groups = [];
            for (var j = 0; j < perLine; j += 2) {
                if (j >= slice.length) { groups.push('    '); continue; }
                var pair = hex2(slice[j]);
                pair += (j + 1 < slice.length) ? hex2(slice[j + 1]) : '  ';
                groups.push(pair);
            }
            var ascii = '';
            for (var k = 0; k < slice.length; k++) {
                var c = slice[k];
                ascii += (c >= 32 && c <= 126) ? String.fromCharCode(c) : '.';
            }
            out.push(pad(i.toString(16), 8) + ': ' + groups.join(' ') + '  |' + ascii + '|');
        }
        return out.join('\n');
    }

    function toByteArray(data) {
        var perLine = 16;
        var out = [];
        for (var i = 0; i < data.length; i += perLine) {
            var slice = data.subarray(i, Math.min(i + perLine, data.length));
            var parts = [];
            for (var j = 0; j < slice.length; j++) parts.push('0x' + hex2(slice[j]));
            out.push('[' + parts.join(', ') + ']');
        }
        if (out.length === 1) return out[0];
        return out.join('\n');
    }

    function toBinary(data) {
        var perLine = 8;
        var out = [];
        for (var i = 0; i < data.length; i += perLine) {
            var slice = data.subarray(i, Math.min(i + perLine, data.length));
            var parts = [];
            for (var j = 0; j < slice.length; j++) parts.push(pad(slice[j].toString(2), 8));
            out.push(parts.join(' '));
        }
        return out.join('\n');
    }

    /** 三种写法一起出，预览各裁一刀（复制时用 full） */
    function forms(data) {
        if (!data || !data.length) return null;
        var dump = toHexDump(data);
        var arr = toByteArray(data);
        var bin = toBinary(data);
        return {
            hexDump: { full: dump, preview: dump.slice(0, LIMITS.preview), clipped: dump.length > LIMITS.preview },
            byteArray: { full: arr, preview: arr.slice(0, LIMITS.preview), clipped: arr.length > LIMITS.preview },
            binary: { full: bin, preview: bin.slice(0, LIMITS.preview), clipped: bin.length > LIMITS.preview }
        };
    }

    return {
        LIMITS: LIMITS,
        UNITS_1000: UNITS_1000,
        UNITS_1024: UNITS_1024,
        MULT: MULT,
        scale: scale,
        human: human,
        fixed: fixed,
        parseSize: parseSize,
        parseSequence: parseSequence,
        parseLine: parseLine,
        parse: parse,
        toHexDump: toHexDump,
        toByteArray: toByteArray,
        toBinary: toBinary,
        forms: forms
    };
});
