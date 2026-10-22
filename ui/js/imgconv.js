/*
 * imgconv.js — 图片 ↔ Base64 的纯逻辑
 *
 * 不碰 DOM、不联网：编解码、MIME 嗅探、DataURI 解析、输出格式化都在这里，
 * 页面只负责拿字节 / 贴文本 / 显示。
 *
 * 大文件策略（10 MB 图 ≈ 13.3 M 字符的 Base64）：
 *   1. 编码按 3 字节对齐分块，每块拼一次，避免超长字符串拼接的二次方退化；
 *   2. 每 N 块让出一次主线程（async 版），页面能画进度条、能被取消；
 *   3. 入口就卡体积（maxImageBytes / maxBase64Chars），别等 OOM 才发现。
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.DBXImg = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var LIMITS = {
        // 单张图片上限：再大 Base64 会到 80 MB 量级，textarea / 剪贴板都扛不住
        maxImageBytes: 10 * 1024 * 1024,
        // 超过这个体积就提醒「Base64 会更大」，但不拦
        warnBytes: 2 * 1024 * 1024,
        // Base64 文本上限（≈ 10 MB 二进制），防止把 100 MB 的 txt 贴进来
        maxBase64Chars: 14 * 1024 * 1024,
        // 每块字节数，必须是 3 的倍数（编码后每块独立、拼起来就是合法 Base64）
        chunkBytes: 96 * 1024,
        // 预览文本上限：再长就只显示前这么多，复制 / 导出仍是全量
        previewChars: 200000
    };

    var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    // 编码时把字符塞进预分配的 Uint8Array，最后统一 fromCharCode。
    // 早期版本是「每组 4 个字符 push 进数组再 join」，8 MB 要 1.7 s；
    // 换成写码点 + 8 KB 一段 fromCharCode 后降到 300 ms 左右。
    var B64_CODE = (function () {
        var arr = new Uint8Array(64);
        for (var i = 0; i < B64.length; i++) arr[i] = B64.charCodeAt(i);
        return arr;
    })();
    var FROM_CHAR_CHUNK = 8192;
    var B64_LOOKUP = (function () {
        var map = new Int16Array(256).fill(-1);
        for (var i = 0; i < B64.length; i++) map[B64.charCodeAt(i)] = i;
        // URL-safe 变体也认
        map['-'.charCodeAt(0)] = 62;
        map['_'.charCodeAt(0)] = 63;
        return map;
    })();

    // ---------- MIME ----------

    function startsWith(bytes, sig, offset) {
        var at = offset || 0;
        if (bytes.length < at + sig.length) return false;
        for (var i = 0; i < sig.length; i++) {
            if (bytes[at + i] !== sig[i]) return false;
        }
        return true;
    }

    // 只看魔数，不信文件后缀：拖进来的 .png 有可能是 jpeg，甚至根本不是图
    function sniffMime(bytes) {
        if (!bytes || !bytes.length) return '';
        if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
        if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
        if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return 'image/gif';
        if (startsWith(bytes, [0x42, 0x4d])) return 'image/bmp';
        if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
        if (startsWith(bytes, [0x00, 0x00, 0x01, 0x00])) return 'image/x-icon';
        if (startsWith(bytes, [0x00, 0x00, 0x02, 0x00])) return 'image/x-icon';
        // ftypheic / ftypavif（前面是 box 长度）
        if (startsWith(bytes, [0x66, 0x74, 0x79, 0x70], 4)) {
            var brand = '';
            for (var i = 8; i < Math.min(bytes.length, 12); i++) brand += String.fromCharCode(bytes[i]);
            if (/avi[fs]/.test(brand)) return 'image/avif';
            if (/hei[cf]|mif1|msf1/.test(brand)) return 'image/heic';
        }
        // SVG 是文本：前面可能有 BOM / 空白 / XML 声明 / DOCTYPE / 注释，
        // 而且 <svg> 未必落在头 512 字节里，所以看头 4 KB 再找开标签
        var head = headOf(bytes, 4096).replace(/^\uFEFF/, '').replace(/^\xEF\xBB\xBF/, '');
        if (isSvgMarkup(head)) return 'image/svg+xml';
        return '';
    }

    function headOf(bytes, limit) {
        var n = Math.min(bytes.length, limit);
        var out = '';
        var step = 1024;
        for (var i = 0; i < n; i += step) {
            out += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + step, n)));
        }
        return out;
    }

    // 判断一段文本是不是 SVG 标记（而不是 HTML 里恰好嵌了个 <svg>）
    function isSvgMarkup(text) {
        var s = String(text || '');
        if (!/^\s*(?:<\?xml|<!doctype|<!--|<svg)/i.test(s)) return false;
        if (/<html[\s>]/i.test(s)) return false;
        return /<svg[\s>]/i.test(s);
    }

    var EXT_BY_MIME = {
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/gif': 'gif',
        'image/webp': 'webp',
        'image/bmp': 'bmp',
        'image/x-icon': 'ico',
        'image/avif': 'avif',
        'image/heic': 'heic',
        'image/svg+xml': 'svg'
    };

    function extForMime(mime) {
        return EXT_BY_MIME[String(mime || '').toLowerCase()] || 'bin';
    }

    function isImageMime(mime) {
        return /^image\//i.test(String(mime || ''));
    }

    function formatBytes(n) {
        var size = Number(n) || 0;
        if (size < 1024) return size + ' B';
        if (size < 1024 * 1024) return trimZero((size / 1024).toFixed(1)) + ' KB';
        if (size < 1024 * 1024 * 1024) return trimZero((size / (1024 * 1024)).toFixed(2)) + ' MB';
        return trimZero((size / (1024 * 1024 * 1024)).toFixed(2)) + ' GB';
    }

    function trimZero(text) {
        return String(text).replace(/\.?0+$/, '');
    }

    // 编码后长度（不含 data: 前缀），用来在编码前就提示体积
    function estimateBase64Length(byteLength) {
        var n = Number(byteLength) || 0;
        return Math.ceil(n / 3) * 4;
    }

    // ---------- 编码 ----------

    function bytesToBase64(bytes) {
        var n = bytes.length;
        if (!n) return '';
        var outLen = Math.ceil(n / 3) * 4;
        var codes = new Uint8Array(outLen);
        var p = 0;
        var i = 0;
        var limit = n - (n % 3);
        for (; i < limit; i += 3) {
            var t = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
            codes[p++] = B64_CODE[(t >> 18) & 63];
            codes[p++] = B64_CODE[(t >> 12) & 63];
            codes[p++] = B64_CODE[(t >> 6) & 63];
            codes[p++] = B64_CODE[t & 63];
        }
        var rest = n - limit;
        if (rest === 1) {
            var a = bytes[limit] << 16;
            codes[p++] = B64_CODE[(a >> 18) & 63];
            codes[p++] = B64_CODE[(a >> 12) & 63];
            codes[p++] = 61; // '='
            codes[p++] = 61;
        } else if (rest === 2) {
            var b = (bytes[limit] << 16) | (bytes[limit + 1] << 8);
            codes[p++] = B64_CODE[(b >> 18) & 63];
            codes[p++] = B64_CODE[(b >> 12) & 63];
            codes[p++] = B64_CODE[(b >> 6) & 63];
            codes[p++] = 61; // '='
        }
        if (outLen <= FROM_CHAR_CHUNK) return String.fromCharCode.apply(null, codes);
        var parts = [];
        for (var s = 0; s < outLen; s += FROM_CHAR_CHUNK) {
            parts.push(String.fromCharCode.apply(null, codes.subarray(s, Math.min(s + FROM_CHAR_CHUNK, outLen))));
        }
        return parts.join('');
    }

    // 分块编码：每块字节数是 3 的倍数，所以每块独立编码后直接拼接就是合法 Base64
    async function bytesToBase64Async(bytes, hooks) {
        var opts = hooks || {};
        var chunk = opts.chunkBytes > 0 ? opts.chunkBytes : LIMITS.chunkBytes;
        chunk -= chunk % 3;
        if (chunk < 3) chunk = 3;
        var total = bytes.length;
        var parts = [];
        var done = 0;
        var sinceYield = 0;
        for (var offset = 0; offset < total; offset += chunk) {
            if (opts.isCancelled && opts.isCancelled()) {
                var err = new Error('cancelled');
                err.cancelled = true;
                throw err;
            }
            var end = Math.min(offset + chunk, total);
            parts.push(bytesToBase64(bytes.subarray(offset, end)));
            done = end;
            if (typeof opts.onProgress === 'function') opts.onProgress(done, total);
            // 每处理 1 MB 左右让出一次，浏览器才有机会重绘进度条
            sinceYield += end - offset;
            if (sinceYield >= 1024 * 1024) {
                sinceYield = 0;
                await yieldToHost();
            }
        }
        return parts.join('');
    }

    function yieldToHost() {
        if (typeof setTimeout !== 'function') return Promise.resolve();
        return new Promise(function (resolve) { setTimeout(resolve, 0); });
    }

    // ---------- 解码 ----------

    // 已经是「干净」的 Base64：字母表内 + 只有尾部补位 + 长度 4 的倍数
    var CLEAN_B64 = /^[A-Za-z0-9+/]+={0,2}$/;

    // 只做规范化，不算长度：去空白 / 去引号 / url-safe → 标准 / 补 padding
    function normalizeBase64(text) {
        var s = String(text == null ? '' : text);
        if (!s) return '';
        // 快路径：绝大多数输入本来就是干净的，没必要为它做八九次全量替换。
        // 13 M 字符时每次替换都会多出一份 26 MB 的中间串，宿主很容易被顶爆。
        if (s.length % 4 === 0 && CLEAN_B64.test(s)) return s;
        s = s.replace(/^\uFEFF/, '');
        s = s.replace(/^data:[^,]*,/i, '');
        // 有的人只抄了后半截：`image/png;base64,xxx` / 甚至 `base64,xxx`
        // Base64 字母表里没有逗号，所以第一个逗号前必是前缀，不会误伤
        s = s.replace(/^[^,\s]{0,80}base64,/i, '');
        s = s.replace(/[\s\r\n\t]+/g, '');
        // 兜底：被 CSS url("...") / 引号 / 分号包住的整段。
        // 只掐「外壳」字符，不动 #@$ 这类真正的非法字符，免得把普通文本误判成 Base64
        s = s.replace(/^url\(\s*["']?/i, '');
        s = s.replace(/^["']+/, '');
        s = s.replace(/["');\]]+$/, '');
        s = s.replace(/-/g, '+').replace(/_/g, '/');
        s = s.replace(/=+$/, '');
        var mod = s.length % 4;
        if (mod === 1) {
            // 长度 %4==1 一定是坏数据，砍掉最后一个字符再试
            s = s.slice(0, -1);
            mod = s.length % 4;
        }
        if (mod === 2) s += '==';
        else if (mod === 3) s += '=';
        return s;
    }

    function hasInvalidChar(text) {
        return /[^A-Za-z0-9+/=]/.test(String(text || ''));
    }

    function base64ToBytes(b64) {
        var s = normalizeBase64(b64);
        if (!s) return new Uint8Array(0);
        if (/[^A-Za-z0-9+/=]/.test(s)) throw new Error('invalid base64');
        var padding = s.indexOf('=') >= 0 ? s.length - s.indexOf('=') : 0;
        var byteLength = (s.length / 4) * 3 - padding;
        var bytes = new Uint8Array(byteLength);
        var p = 0;
        for (var i = 0; i < s.length; i += 4) {
            var c0 = B64_LOOKUP[s.charCodeAt(i)];
            var c1 = B64_LOOKUP[s.charCodeAt(i + 1)];
            var c2 = B64_LOOKUP[s.charCodeAt(i + 2)];
            var c3 = B64_LOOKUP[s.charCodeAt(i + 3)];
            if (c0 < 0 || c1 < 0) throw new Error('invalid base64');
            var triple = (c0 << 18) | (c1 << 12) | ((c2 < 0 ? 0 : c2) << 6) | (c3 < 0 ? 0 : c3);
            if (p < byteLength) bytes[p++] = (triple >> 16) & 0xff;
            if (p < byteLength) bytes[p++] = (triple >> 8) & 0xff;
            if (p < byteLength) bytes[p++] = triple & 0xff;
        }
        return bytes;
    }

    // 分块解码：只按 4 字符对齐切，每块独立可解，拼起来的字节流和整段解一致
    async function base64ToBytesAsync(b64, hooks) {
        var opts = hooks || {};
        var s = normalizeBase64(b64);
        if (!s) return new Uint8Array(0);
        var chunkChars = (opts.chunkChars > 0 ? opts.chunkChars : LIMITS.chunkBytes * 4 / 3 | 0);
        chunkChars -= chunkChars % 4;
        if (chunkChars < 4) chunkChars = 4;
        var total = s.length;
        var parts = [];
        var sinceYield = 0;
        for (var offset = 0; offset < total; offset += chunkChars) {
            if (opts.isCancelled && opts.isCancelled()) {
                var err = new Error('cancelled');
                err.cancelled = true;
                throw err;
            }
            var end = Math.min(offset + chunkChars, total);
            parts.push(base64ToBytes(s.slice(offset, end)));
            if (typeof opts.onProgress === 'function') opts.onProgress(end, total);
            sinceYield += end - offset;
            if (sinceYield >= 1024 * 1024) {
                sinceYield = 0;
                await yieldToHost();
            }
        }
        var size = 0;
        for (var k = 0; k < parts.length; k++) size += parts[k].length;
        var out = new Uint8Array(size);
        var at = 0;
        for (var m = 0; m < parts.length; m++) {
            out.set(parts[m], at);
            at += parts[m].length;
        }
        return out;
    }

    // ---------- 输入识别 ----------

    function extractDataUri(text) {
        var s = String(text || '');
        var m = /data:([^;,\s"')]+)?(?:;[^,]*)?;base64,[A-Za-z0-9+/=\r\n\t ]+/i.exec(s);
        if (!m) return null;
        return {
            mime: (m[1] || '').toLowerCase(),
            raw: m[0]
        };
    }

    /*
     * 判断贴进来的是什么：
     *   empty / datauri / base64 / none
     * datauri 会顺带给出 mime；base64 的 mime 只能靠解码后嗅探。
     *
     * 裸 Base64 的现实形态很多：`base64 a.png` 出来的 76 字符换行、
     * url-safe 的 -_、少了 padding 的尾巴、被引号 / url("...") 包着的一整段。
     * 所以先规范化再校验字符——否则 -_ 会被当成「识别不出」。
     */
    function parseInput(text) {
        var s = String(text == null ? '' : text).trim();
        if (!s) return { kind: 'empty', base64: '', mime: '' };

        var uri = extractDataUri(s);
        if (uri) {
            var data = uri.raw.replace(/^data:[^,]*,/i, '');
            return { kind: 'datauri', base64: normalizeBase64(data), mime: uri.mime || '' };
        }
        if (/^data:/i.test(s)) {
            // 不是 base64 的 data URI（比如 data:text/plain,xxx），当非法
            return { kind: 'none', base64: '', mime: '', reason: 'not-base64' };
        }

        var normalized = normalizeBase64(s);
        if (normalized.length < 8) return { kind: 'none', base64: '', mime: '', reason: 'too-short' };
        if (hasInvalidChar(normalized)) {
            return { kind: 'none', base64: '', mime: '', reason: 'invalid-char' };
        }
        return { kind: 'base64', base64: normalized, mime: '' };
    }

    // ---------- SVG 源码 ----------

    function utf8Bytes(text) {
        var s = String(text == null ? '' : text);
        var out = [];
        for (var i = 0; i < s.length; i++) {
            var code = s.charCodeAt(i);
            if (code >= 0xd800 && code <= 0xdbff && i + 1 < s.length) {
                var next = s.charCodeAt(i + 1);
                if (next >= 0xdc00 && next <= 0xdfff) {
                    code = ((code - 0xd800) << 10) + (next - 0xdc00) + 0x10000;
                    i++;
                }
            }
            if (code < 0x80) out.push(code);
            else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 63));
            else if (code < 0x10000) out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
            else out.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 63),
                0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
        }
        return Uint8Array.from(out);
    }

    // 贴进来的不是 Base64 而是 SVG 源码：矢量图本来就是文本，直接编码成字节
    function looksLikeSvgText(text) {
        var s = String(text == null ? '' : text).replace(/^\uFEFF/, '').trim();
        if (s.length < 11) return false;
        return isSvgMarkup(s);
    }

    function svgTextToBase64(text) {
        return bytesToBase64(utf8Bytes(String(text == null ? '' : text).trim()));
    }

    // ---------- 输出格式 ----------
    var FORMATS = ['datauri', 'raw', 'css', 'html', 'markdown'];

    function dataUriOf(base64, mime) {
        return 'data:' + (mime || 'application/octet-stream') + ';base64,' + base64;
    }

    function buildText(base64, mime, format, opts) {
        var options = opts || {};
        var uri = dataUriOf(base64, mime);
        switch (format) {
            case 'raw':
                return base64;
            case 'css':
                return (options.selector || '.bg-image') + ' {\n  background-image: url("' + uri + '");\n}\n';
            case 'html':
                return '<img src="' + uri + '" alt="' + (options.alt || '') + '" />\n';
            case 'markdown':
                return '![' + (options.alt || 'image') + '](' + uri + ')\n';
            case 'datauri':
            default:
                return uri;
        }
    }

    // 预览用：超长只留前面一段，避免 textarea 被 13 M 字符卡死
    function previewText(text, limit) {
        var max = limit > 0 ? limit : LIMITS.previewChars;
        var s = String(text == null ? '' : text);
        if (s.length <= max) return { text: s, truncated: false, total: s.length };
        return { text: s.slice(0, max), truncated: true, total: s.length };
    }

    return {
        LIMITS: LIMITS,
        FORMATS: FORMATS,
        sniffMime: sniffMime,
        extForMime: extForMime,
        isImageMime: isImageMime,
        formatBytes: formatBytes,
        estimateBase64Length: estimateBase64Length,
        bytesToBase64: bytesToBase64,
        bytesToBase64Async: bytesToBase64Async,
        base64ToBytes: base64ToBytes,
        base64ToBytesAsync: base64ToBytesAsync,
        normalizeBase64: normalizeBase64,
        parseInput: parseInput,
        looksLikeSvgText: looksLikeSvgText,
        svgTextToBase64: svgTextToBase64,
        extractDataUri: extractDataUri,
        dataUriOf: dataUriOf,
        buildText: buildText,
        previewText: previewText
    };
});
