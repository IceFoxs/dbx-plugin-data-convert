/*
 * Escape / unescape toolkit — pure functions, no DOM dependency.
 *
 * The eight conversions developers reach for while debugging a payload:
 * URL, Base64, HTML, JSON string, \uXXXX, hex, SQL literal and regex.
 *
 * All of them are byte/char loops over text that can be pasted in bulk, so
 * every conversion walks the input in 8 KB blocks and joins the pieces at the
 * end — building one giant array of per-character strings is what turns a
 * 2 MB paste into a multi-hundred-MB allocation.
 *
 * Failures come back as { ok:false, code } — never a hard-coded language
 * string — so the UI can translate them.
 *
 * Loaded as a classic script in the plugin (window.DBXEscape) and as CommonJS
 * in tests.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.DBXEscape = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var LIMITS = { chars: 2 * 1024 * 1024 }; // 2 M 字符入口上限
    var BLOCK = 8192;                        // 分块大小：够大以摊薄开销，够小以控制峰值内存

    var KINDS = [
        { id: 'url', decode: true },
        { id: 'base64', decode: true },
        { id: 'html', decode: true },
        { id: 'json', decode: true },
        { id: 'unicode', decode: true },
        { id: 'hex', decode: true },
        { id: 'sql', decode: true },
        { id: 'regex', decode: true }
    ];

    var KIND_IDS = KINDS.map(function (k) { return k.id; });

    /* ==================================================================== *
     * UTF-8 字节互转（不依赖 btoa / TextEncoder，Web 与 Node 行为一致）
     * ==================================================================== */

    function utf8Bytes(str) {
        var buf = new Uint8Array(str.length * 3 + 3); // 最坏情况：每个字符 3 字节
        var pos = 0;
        for (var i = 0; i < str.length; i++) {
            var c = str.charCodeAt(i);
            if (c < 0x80) {
                buf[pos++] = c;
            } else if (c < 0x800) {
                buf[pos++] = 0xC0 | (c >> 6);
                buf[pos++] = 0x80 | (c & 63);
            } else if (c >= 0xD800 && c <= 0xDBFF && i + 1 < str.length) {
                var c2 = str.charCodeAt(i + 1);
                if (c2 >= 0xDC00 && c2 <= 0xDFFF) {
                    i++;
                    var cp = 0x10000 + ((c - 0xD800) << 10) + (c2 - 0xDC00);
                    buf[pos++] = 0xF0 | (cp >> 18);
                    buf[pos++] = 0x80 | ((cp >> 12) & 63);
                    buf[pos++] = 0x80 | ((cp >> 6) & 63);
                    buf[pos++] = 0x80 | (cp & 63);
                } else {
                    buf[pos++] = 0xEF; buf[pos++] = 0xBF; buf[pos++] = 0xBD;
                }
            } else if (c >= 0xD800 && c <= 0xDFFF) {
                buf[pos++] = 0xEF; buf[pos++] = 0xBF; buf[pos++] = 0xBD;
            } else {
                buf[pos++] = 0xE0 | (c >> 12);
                buf[pos++] = 0x80 | ((c >> 6) & 63);
                buf[pos++] = 0x80 | (c & 63);
            }
        }
        return buf.subarray(0, pos);
    }

    /**
     * UTF-8 字节 → 字符串。逐字节按 RFC 3629 还原码点，再拆成 UTF-16 码元；
     * 拿每个字节当一个 charCode 是常见错法，中文会变成 "ä¸­æ" 这种 Latin-1 串。
     */
    function bytesUtf8(bytes) {
        var parts = [];
        var chunk = new Array(BLOCK + 2);
        var filled = 0;
        var i = 0;
        while (i < bytes.length) {
            var b = bytes[i++];
            var cp;
            if (b < 0x80) {
                cp = b;
            } else if (b >= 0xC0 && b < 0xE0) {
                cp = ((b & 31) << 6) | (bytes[i++] & 63);
            } else if (b >= 0xE0 && b < 0xF0) {
                cp = ((b & 15) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63);
            } else if (b >= 0xF0 && b < 0xF8) {
                cp = ((b & 7) << 18) | ((bytes[i++] & 63) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63);
            } else {
                cp = 0xFFFD; // 非法字节 → 替换字符
            }
            if (cp > 0xFFFF) {
                cp -= 0x10000;
                chunk[filled++] = 0xD800 + (cp >> 10);
                chunk[filled++] = 0xDC00 + (cp & 1023);
            } else {
                chunk[filled++] = cp;
            }
            if (filled >= BLOCK) {
                parts.push(String.fromCharCode.apply(null, chunk.slice(0, filled)));
                filled = 0;
            }
        }
        if (filled) parts.push(String.fromCharCode.apply(null, chunk.slice(0, filled)));
        return parts.join('');
    }

    /** 把字符串按块喂给 mapChar，避免中间数组随输入线性膨胀 */
    function mapText(str, mapChar) {
        var parts = [];
        var buf = '';
        var i = 0;
        var len = str.length;
        while (i < len) {
            var end = Math.min(i + BLOCK, len);
            var chars = new Array(end - i);
            for (var j = i; j < end; j++) chars[j - i] = mapChar(str, j);
            buf += chars.join('');
            if (buf.length > BLOCK * 4) { parts.push(buf); buf = ''; }
            i = end;
        }
        parts.push(buf);
        return parts.join('');
    }

    /* ==================================================================== *
     * URL
     * ==================================================================== */

    function urlEncode(text) {
        return encodeURIComponent(text);
    }

    function urlDecode(text) {
        try {
            return decodeURIComponent(text);
        } catch (e) {
            return null;
        }
    }

    /* ==================================================================== *
     * Base64
     * ==================================================================== */

    var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

    function base64Encode(text) {
        var bytes = utf8Bytes(text);
        var parts = [];
        var i = 0;
        var line = '';
        while (i < bytes.length) {
            var b0 = bytes[i++];
            var b1 = i < bytes.length ? bytes[i++] : -1;
            var b2 = i < bytes.length ? bytes[i++] : -1;
            line += B64.charAt(b0 >> 2);
            line += B64.charAt(((b0 & 3) << 4) | (b1 < 0 ? 0 : b1 >> 4));
            line += b1 < 0 ? '=' : B64.charAt(((b1 & 15) << 2) | (b2 < 0 ? 0 : b2 >> 6));
            line += b2 < 0 ? '=' : B64.charAt(b2 & 63);
            if (line.length > BLOCK * 4) { parts.push(line); line = ''; }
        }
        parts.push(line);
        return parts.join('');
    }

    var B64_INDEX = (function () {
        var map = Object.create(null);
        for (var i = 0; i < B64.length; i++) map[B64.charAt(i)] = i;
        return map;
    })();

    function base64Decode(text) {
        var clean = String(text).replace(/\s+/g, '');
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) return null;
        if (clean.length % 4 !== 0) return null;
        var payload = clean.replace(/=+$/, '');
        var out = new Uint8Array(Math.floor(payload.length * 3 / 4) + 3);
        var pos = 0;
        for (var i = 0; i < payload.length; i += 4) {
            var chunk = payload.slice(i, i + 4);
            var acc = 0;
            var bits = 0;
            for (var k = 0; k < chunk.length; k++) {
                var v = B64_INDEX[chunk.charAt(k)];
                if (v === undefined) return null;
                acc = (acc << 6) | v;
                bits += 6;
            }
            while (bits >= 8) {
                bits -= 8;
                out[pos++] = (acc >> bits) & 0xFF;
            }
        }
        return bytesUtf8(out.subarray(0, pos));
    }

    /* ==================================================================== *
     * HTML
     * ==================================================================== */

    var HTML_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    var HTML_NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00A0' };

    function htmlEncode(text) {
        return String(text).replace(/[&<>"']/g, function (c) { return HTML_MAP[c]; });
    }

    function htmlDecode(text) {
        return String(text).replace(/&(#x?[0-9a-fA-F]+|[A-Za-z][A-Za-z0-9]*);/g, function (m, body) {
            if (body.charAt(0) === '#') {
                var num = body.charAt(1) === 'x' || body.charAt(1) === 'X'
                    ? parseInt(body.slice(2), 16)
                    : parseInt(body.slice(1), 10);
                if (!isFinite(num) || num < 0 || num > 0x10FFFF) return m;
                try {
                    return String.fromCodePoint(num);
                } catch (e) {
                    return m;
                }
            }
            var named = HTML_NAMED[body];
            return named === undefined ? m : named;
        });
    }

    /* ==================================================================== *
     * JSON 字符串
     * ==================================================================== */

    function jsonEncode(text) {
        return JSON.stringify(String(text));
    }

    function jsonDecode(text) {
        var raw = String(text).trim();
        var candidates = [raw];
        // 用户常常把里层内容单独复制出来（不带外层引号），补一对引号再试
        if (!(raw.length >= 2 && raw.charAt(0) === '"' && raw.charAt(raw.length - 1) === '"')) {
            candidates.push('"' + raw + '"');
        }
        for (var i = 0; i < candidates.length; i++) {
            try {
                var v = JSON.parse(candidates[i]);
                if (typeof v === 'string') return v;
            } catch (e) { /* 换下一种写法 */ }
        }
        return null;
    }

    /* ==================================================================== *
     * \uXXXX
     * ==================================================================== */

    var HEX4 = '0123456789abcdef';

    function unicodeEncode(text) {
        var str = String(text);
        return mapText(str, function (s, i) {
            var c = s.charCodeAt(i);
            // 只转义不可打印 ASCII 与非 ASCII；可打印原样保留，方便肉眼看
            if (c > 0x7E || c < 0x20 || c === 0x7F) {
                return '\\u' + HEX4[(c >> 12) & 15] + HEX4[(c >> 8) & 15] + HEX4[(c >> 4) & 15] + HEX4[c & 15];
            }
            return s.charAt(i);
        });
    }

    function unicodeDecode(text) {
        var str = String(text);
        var out = '';
        var i = 0;
        while (i < str.length) {
            var c = str.charAt(i);
            if (c === '\\') {
                var nx = str.charAt(i + 1);
                if (nx === 'u' || nx === 'U') {
                    var hex = str.substr(i + 2, 4);
                    if (/^[0-9a-fA-F]{4}$/.test(hex)) {
                        var code = parseInt(hex, 16);
                        // 代理对要合成一个码点，否则 emoji 会变成两个乱码
                        if (code >= 0xD800 && code <= 0xDBFF && str.substr(i + 6, 2) === '\\u') {
                            var hex2 = str.substr(i + 8, 4);
                            if (/^[0-9a-fA-F]{4}$/.test(hex2)) {
                                var lo = parseInt(hex2, 16);
                                if (lo >= 0xDC00 && lo <= 0xDFFF) {
                                    out += String.fromCodePoint(0x10000 + ((code - 0xD800) << 10) + (lo - 0xDC00));
                                    i += 12;
                                    continue;
                                }
                            }
                        }
                        out += String.fromCharCode(code);
                        i += 6;
                        continue;
                    }
                }
                out += c;
                i++;
                continue;
            }
            out += c;
            i++;
        }
        return out;
    }

    /* ==================================================================== *
     * 十六进制
     * ==================================================================== */

    function hexEncode(text) {
        var bytes = utf8Bytes(String(text));
        var parts = [];
        var line = '';
        for (var i = 0; i < bytes.length; i++) {
            line += HEX4[bytes[i] >> 4] + HEX4[bytes[i] & 15];
            if (line.length > BLOCK * 4) { parts.push(line); line = ''; }
        }
        parts.push(line);
        return parts.join('');
    }

    function hexDecode(text) {
        var clean = String(text).replace(/\s+/g, '').replace(/^0x/i, '');
        // 允许 0x1F 这种带前缀、用空格分隔的写法
        clean = clean.replace(/(^|[^0-9a-fA-F])0x/gi, '$1');
        if (!/^[0-9a-fA-F]*$/.test(clean)) return null;
        if (clean.length % 2 !== 0) return null;
        var out = new Uint8Array(clean.length / 2);
        for (var i = 0; i < out.length; i++) {
            out[i] = parseInt(clean.substr(i * 2, 2), 16);
        }
        return bytesUtf8(out);
    }

    /* ==================================================================== *
     * SQL 字面量
     * ==================================================================== */

    function sqlEncode(text) {
        return String(text).replace(/'/g, "''");
    }

    function sqlDecode(text) {
        return String(text).replace(/''/g, "'");
    }

    /* ==================================================================== *
     * 正则
     * ==================================================================== */

    var RE_SPECIAL = /[.*+?^${}()|[\]\\]/g;

    function regexEncode(text) {
        return String(text).replace(RE_SPECIAL, '\\$&');
    }

    // 这些 \x 是正则自己的语法，不能被当成"多余的反斜杠"剥掉
    var RE_KEEP = /^[dDwWsSbBnrtfvu0xkpcCAZzGQEy]$/;

    function regexDecode(text) {
        var str = String(text);
        var out = '';
        for (var i = 0; i < str.length; i++) {
            var c = str.charAt(i);
            if (c !== '\\' || i + 1 >= str.length) { out += c; continue; }
            var nx = str.charAt(i + 1);
            if (RE_KEEP.test(nx)) {
                out += c + nx;
            } else {
                out += nx;
            }
            i++;
        }
        return out;
    }

    /* ==================================================================== *
     * 入口
     * ==================================================================== */

    var IMPL = {
        url: { encode: urlEncode, decode: urlDecode },
        base64: { encode: base64Encode, decode: base64Decode },
        html: { encode: htmlEncode, decode: htmlDecode },
        json: { encode: jsonEncode, decode: jsonDecode },
        unicode: { encode: unicodeEncode, decode: unicodeDecode },
        hex: { encode: hexEncode, decode: hexDecode },
        sql: { encode: sqlEncode, decode: sqlDecode },
        regex: { encode: regexEncode, decode: regexDecode }
    };

    /**
     * convert(text, kind, dir) → { ok:true, text } | { ok:false, code }
     * dir 省略时按 encode 处理。
     */
    function convert(text, kind, dir) {
        var str = String(text == null ? '' : text);
        if (str.length > LIMITS.chars) return { ok: false, code: 'esc-too-large' };
        var impl = IMPL[kind];
        if (!impl) return { ok: false, code: 'esc-unknown-kind' };
        var fn = dir === 'decode' ? impl.decode : impl.encode;
        var out = fn(str);
        if (out === null || out === undefined) {
            return { ok: false, code: 'esc-bad-' + kind };
        }
        return { ok: true, text: out };
    }

    /** 反向操作：给 UI 的「对调」按钮用 */
    function flip(dir) {
        return dir === 'decode' ? 'encode' : 'decode';
    }

    return {
        LIMITS: LIMITS,
        KINDS: KINDS,
        KIND_IDS: KIND_IDS,
        convert: convert,
        flip: flip,
        utf8Bytes: utf8Bytes,
        bytesUtf8: bytesUtf8
    };
});
