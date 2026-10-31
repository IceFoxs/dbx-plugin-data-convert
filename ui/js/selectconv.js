/*
 * Selection conversions — pure functions, no DOM.
 *
 * 编辑器选区右键菜单的「算」这一半：转义编码 / 整理 / 生成 SQL / 二维码容量判断。
 * 只负责「一段文本进、一段文本出」，不碰剪贴板、不碰 CodeMirror——那些在
 * ui/js/app/21-editor-menu.js 里。这样 40 来条转换规则能直接在 node 里跑回归。
 *
 * 依赖以注入方式传进来（ctx.escape / ctx.sql / ctx.qr），没注入的引擎对应的项
 * 直接判为不可用并给出 sel-no-engine，而不是抛异常。
 *
 * convert.run(id, text, ctx) → { ok:true, text, note? } | { ok:false, code }
 * convert.canRun(id, text, ctx) → boolean（菜单在打开时用它决定置灰）
 * convert.list() → 菜单项定义（id / group / sub / esc / 键盘提示）
 *
 * 载入方式：插件里挂 window.DBXSelectConv，测试里走 CommonJS。
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.DBXSelectConv = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var LIMITS = {
        // 单个选区一次转换的上限。编码类最坏膨胀 4 倍（Hex），4 M 字符已经
        // 会明显卡主线程；超过就置灰，让用户去对应的独立页面（那边分块）。
        maxChars: 1000000
    };

    var SUB_ESCAPE = 'escape';
    var SUB_TIDY = 'tidy';
    var SUB_JOIN = 'join';
    var SUB_QUOTE = 'quote';
    var SUB_IMAGE = 'image';

    /*
     * 菜单项定义。字段：
     *   id     动作标识（UI 派发用，测试也按它断言）
     *   group  分组（basic / escape / tidy / sql / qr），分隔线按组画
     *   esc    { kind, dir } —— 交给 DBXEscape 处理；label 由 escKind* 拼
     *   sub    属于哪个子菜单（不在主菜单上单独出现）
     *   first  子菜单里的第一项（UI 用来画子菜单标题）
     */
    var ITEMS = [
        // ---- 基础 ----
        { id: 'copy', group: 'basic' },
        { id: 'cut', group: 'basic' },
        { id: 'paste', group: 'basic' },
        { id: 'paste-image', group: 'basic', sub: SUB_IMAGE, first: true },
        { id: 'paste-image-b64', group: 'basic', sub: SUB_IMAGE },
        { id: 'paste-image-datauri', group: 'basic', sub: SUB_IMAGE },
        { id: 'paste-image-tag', group: 'basic', sub: SUB_IMAGE },
        { id: 'select-all', group: 'basic' },

        // ---- 转义（高频的直接在主菜单）----
        { id: 'esc-base64-encode', group: 'escape', esc: { kind: 'base64', dir: 'encode' } },
        { id: 'esc-base64-decode', group: 'escape', esc: { kind: 'base64', dir: 'decode' } },
        { id: 'esc-url-encode', group: 'escape', esc: { kind: 'url', dir: 'encode' } },
        { id: 'esc-url-decode', group: 'escape', esc: { kind: 'url', dir: 'decode' } },
        { id: 'esc-json-encode', group: 'escape', esc: { kind: 'json', dir: 'encode' } },
        { id: 'esc-json-decode', group: 'escape', esc: { kind: 'json', dir: 'decode' } },
        { id: 'esc-newline-encode', group: 'escape' },
        { id: 'esc-newline-decode', group: 'escape' },
        { id: 'more-escape', group: 'escape', sub: SUB_ESCAPE, first: true },
        { id: 'esc-html-encode', group: 'escape', sub: SUB_ESCAPE, esc: { kind: 'html', dir: 'encode' } },
        { id: 'esc-html-decode', group: 'escape', sub: SUB_ESCAPE, esc: { kind: 'html', dir: 'decode' } },
        { id: 'esc-unicode-encode', group: 'escape', sub: SUB_ESCAPE, esc: { kind: 'unicode', dir: 'encode' } },
        { id: 'esc-unicode-decode', group: 'escape', sub: SUB_ESCAPE, esc: { kind: 'unicode', dir: 'decode' } },
        { id: 'esc-hex-encode', group: 'escape', sub: SUB_ESCAPE, esc: { kind: 'hex', dir: 'encode' } },
        { id: 'esc-hex-decode', group: 'escape', sub: SUB_ESCAPE, esc: { kind: 'hex', dir: 'decode' } },
        { id: 'esc-sql-encode', group: 'escape', sub: SUB_ESCAPE, esc: { kind: 'sql', dir: 'encode' } },
        { id: 'esc-sql-decode', group: 'escape', sub: SUB_ESCAPE, esc: { kind: 'sql', dir: 'decode' } },
        { id: 'esc-regex-encode', group: 'escape', sub: SUB_ESCAPE, esc: { kind: 'regex', dir: 'encode' } },
        { id: 'esc-regex-decode', group: 'escape', sub: SUB_ESCAPE, esc: { kind: 'regex', dir: 'decode' } },

        // ---- 整理 ----
        { id: 'tidy-trim', group: 'tidy' },
        { id: 'tidy-strip-ws', group: 'tidy' },
        { id: 'tidy-dedupe', group: 'tidy' },
        { id: 'tidy-sort', group: 'tidy' },
        { id: 'tidy-reverse', group: 'tidy' },
        { id: 'tidy-json-pretty', group: 'tidy' },
        { id: 'tidy-json-minify', group: 'tidy' },
        { id: 'more-tidy', group: 'tidy', sub: SUB_TIDY, first: true },
        { id: 'tidy-sort-num', group: 'tidy', sub: SUB_TIDY },
        { id: 'tidy-number', group: 'tidy', sub: SUB_TIDY },
        { id: 'tidy-upper', group: 'tidy', sub: SUB_TIDY },
        { id: 'tidy-lower', group: 'tidy', sub: SUB_TIDY },
        { id: 'tidy-title', group: 'tidy', sub: SUB_TIDY },
        { id: 'more-join', group: 'tidy', sub: SUB_JOIN, first: true },
        { id: 'tidy-join-comma', group: 'tidy', sub: SUB_JOIN },
        { id: 'tidy-join-cn', group: 'tidy', sub: SUB_JOIN },
        { id: 'tidy-join-space', group: 'tidy', sub: SUB_JOIN },
        { id: 'more-quote', group: 'tidy', sub: SUB_QUOTE, first: true },
        { id: 'tidy-quote-single', group: 'tidy', sub: SUB_QUOTE },
        { id: 'tidy-quote-double', group: 'tidy', sub: SUB_QUOTE },
        { id: 'tidy-quote-backtick', group: 'tidy', sub: SUB_QUOTE },

        // ---- SQL ----
        { id: 'sql-in', group: 'sql' },
        { id: 'sql-not-in', group: 'sql' },
        { id: 'sql-insert', group: 'sql' },

        // ---- 二维码 ----
        { id: 'qr-copy', group: 'qr' },
        { id: 'qr-open', group: 'qr' }
    ];

    var BY_ID = Object.create(null);
    for (var i = 0; i < ITEMS.length; i++) BY_ID[ITEMS[i].id] = ITEMS[i];

    /* ==================================================================== *
     * 基础工具
     * ==================================================================== */

    function str(text) {
        return String(text == null ? '' : text);
    }

    function linesOf(text) {
        return str(text).replace(/\r\n?/g, '\n').split('\n');
    }

    function ok(text, note) {
        var out = { ok: true, text: text };
        if (note !== undefined) out.note = note;
        return out;
    }

    function bad(code) {
        return { ok: false, code: code };
    }

    function isBlank(line) {
        return !String(line).trim();
    }

    /* ==================================================================== *
     * 换行 ⇄ \n
     * ==================================================================== */

    function escapeNewlines(text) {
        // \r\n 先整体压成一个 \n，否则 Windows 换行会写出 "\r\n" 两个转义
        return str(text).replace(/\r\n|\r|\n/g, '\\n').replace(/\t/g, '\\t');
    }

    function unescapeNewlines(text) {
        var s = str(text);
        var out = '';
        var i = 0;
        while (i < s.length) {
            var c = s.charAt(i);
            if (c === '\\' && i + 1 < s.length) {
                var n = s.charAt(i + 1);
                if (n === 'n') { out += '\n'; i += 2; continue; }
                if (n === 'r') { out += '\r'; i += 2; continue; }
                if (n === 't') { out += '\t'; i += 2; continue; }
                if (n === '\\') { out += '\\'; i += 2; continue; }
            }
            out += c;
            i++;
        }
        return out;
    }

    /* ==================================================================== *
     * 整理
     * ==================================================================== */

    /** 每行去首尾空白，并丢掉整段首尾的空行（中间的空行留着，那是用户的分组） */
    function tidyTrim(text) {
        var lines = linesOf(text);
        for (var i = 0; i < lines.length; i++) lines[i] = lines[i].trim();
        while (lines.length && lines[0] === '') lines.shift();
        while (lines.length && lines[lines.length - 1] === '') lines.pop();
        return lines.join('\n');
    }

    function tidyStripWs(text) {
        return str(text).replace(/\s+/g, '');
    }

    function tidyDedupe(text) {
        var lines = linesOf(text);
        var seen = Object.create(null);
        var out = [];
        for (var i = 0; i < lines.length; i++) {
            var key = '$' + lines[i];
            if (seen[key]) continue;
            seen[key] = 1;
            out.push(lines[i]);
        }
        return out.join('\n');
    }

    /** 排序：非空行按 localeCompare 升序，空行集中收到末尾（保持行数不变） */
    function tidySort(text) {
        var lines = linesOf(text);
        var rest = [];
        var blanks = 0;
        for (var i = 0; i < lines.length; i++) {
            if (isBlank(lines[i])) blanks++;
            else rest.push(lines[i]);
        }
        rest.sort(function (a, b) { return a.localeCompare(b); });
        while (blanks--) rest.push('');
        return rest.join('\n');
    }

    function numericLines(text) {
        var lines = linesOf(text);
        var rest = [];
        var blanks = 0;
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line) { blanks++; continue; }
            var n = Number(line);
            // 空串 / Infinity / 0x1f 这类都当「不是数字」，宁可置灰也别排出乱序
            if (!isFinite(n) || line === '') return null;
            rest.push({ text: lines[i], n: n });
        }
        rest.sort(function (a, b) { return a.n - b.n; });
        var out = [];
        for (var k = 0; k < rest.length; k++) out.push(rest[k].text);
        while (blanks--) out.push('');
        return out.join('\n');
    }

    function tidyReverse(text) {
        return linesOf(text).reverse().join('\n');
    }

    /** 加行号：宽度按最大行号补零，空行不加号（也不会把编号撑歪） */
    function tidyNumber(text) {
        var lines = linesOf(text);
        var total = 0;
        for (var i = 0; i < lines.length; i++) if (!isBlank(lines[i])) total++;
        var width = String(total).length;
        var n = 0;
        var out = [];
        for (var k = 0; k < lines.length; k++) {
            if (isBlank(lines[k])) { out.push(lines[k]); continue; }
            n++;
            var no = String(n);
            while (no.length < width) no = '0' + no;
            out.push(no + '. ' + lines[k]);
        }
        return out.join('\n');
    }

    function tidyJoin(text, sep) {
        var lines = linesOf(text);
        var out = [];
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (line) out.push(line);
        }
        return out.join(sep);
    }

    function tidyCase(text, mode) {
        var s = str(text);
        if (mode === 'upper') return s.toUpperCase();
        if (mode === 'lower') return s.toLowerCase();
        // 标题式：只把词首的 ASCII 字母抬起来，中文与已有的大写原样保留
        return s.replace(/(^|[\s\-_/([{'".,;:!?])([a-z])/g, function (m, lead, ch) {
            return lead + ch.toUpperCase();
        });
    }

    /** 每行包一层引号；内部同种引号成对转义（SQL / MySQL 标识符的写法） */
    function tidyQuote(text, quote) {
        var lines = linesOf(text);
        var out = [];
        var doubled = quote + quote;
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line) continue;
            out.push(quote + line.split(quote).join(doubled) + quote);
        }
        return out.join('\n');
    }

    function parseJson(text) {
        try {
            return { ok: true, value: JSON.parse(str(text)) };
        } catch (e) {
            return { ok: false };
        }
    }

    /*
     * JSON 美化 / 压缩走「词法切分 + 重排空白」，不走 JSON.parse → stringify。
     * 后者会把 120101000001417742 变成 120101000001417740：JS 的 Number 只有
     * 53 位有效位，18~19 位 ID 一过手就废了——而这类 ID 恰恰是这个插件里最常见的数据。
     * JSON.parse 仍然跑一遍，只用来判定「合不合法」，输出用原文里的数字字面量。
     */
    var JSON_PUNCT = '{}[],:';

    function jsonTokens(src) {
        var s = str(src);
        var out = [];
        var i = 0;
        while (i < s.length) {
            var c = s.charAt(i);
            if (/\s/.test(c)) { i++; continue; }
            if (c === '"') {
                var start = i;
                i++;
                while (i < s.length) {
                    if (s.charAt(i) === '\\') { i += 2; continue; }
                    if (s.charAt(i) === '"') { i++; break; }
                    i++;
                }
                out.push(s.slice(start, i));
                continue;
            }
            if (JSON_PUNCT.indexOf(c) >= 0) {
                out.push(c);
                i++;
                continue;
            }
            var word = i;
            while (i < s.length && !/\s/.test(s.charAt(i)) && JSON_PUNCT.indexOf(s.charAt(i)) < 0) i++;
            out.push(s.slice(word, i));
        }
        return out;
    }

    function isPunct(token) {
        return token != null && token.length === 1 && JSON_PUNCT.indexOf(token) >= 0;
    }

    function prettyJson(src) {
        var tokens = jsonTokens(src);
        var out = [];
        var depth = 0;
        var pad = function (n) { return new Array(n + 1).join('  '); };
        for (var i = 0; i < tokens.length; i++) {
            var t = tokens[i];
            if (!isPunct(t)) { out.push(t); continue; }
            if (t === '{' || t === '[') {
                var close = t === '{' ? '}' : ']';
                if (tokens[i + 1] === close) {
                    out.push(t + close);
                    i++;
                } else {
                    depth++;
                    out.push(t + '\n' + pad(depth));
                }
            } else if (t === '}' || t === ']') {
                depth--;
                out.push('\n' + pad(depth) + t);
            } else if (t === ',') {
                out.push(',\n' + pad(depth));
            } else {
                out.push(': ');
            }
        }
        return out.join('');
    }

    function tidyJson(text, pretty) {
        var parsed = parseJson(text);
        if (!parsed.ok) return bad('sel-bad-json');
        var src = str(text).trim();
        return ok(pretty ? prettyJson(src) : jsonTokens(src).join(''));
    }

    /* ==================================================================== *
     * SQL
     * ==================================================================== */

    var SQL_TEMPLATES = { in: 'in', 'not-in': 'notin', insert: 'insert' };

    function sqlOf(text, which, ctx) {
        var engine = ctx && ctx.sql;
        if (!engine || typeof engine.analyze !== 'function') return bad('sel-no-engine');
        var res = engine.analyze(str(text), {
            template: SQL_TEMPLATES[which] || 'in',
            quote: 'single',
            multiline: true,
            dedupe: true,
            table: 'your_table'
        });
        if (!res || !res.count) return bad('sel-empty');
        return ok(res.sql, res.count);
    }

    /* ==================================================================== *
     * 可用性判断（菜单置灰）
     * ==================================================================== */

    function escapeEngine(ctx) {
        var engine = ctx && ctx.escape;
        return engine && typeof engine.convert === 'function' ? engine : null;
    }

    // 菜单一次要问 3 个 SQL 项「能不能用」，同一段文本别拆三遍
    var sqlCountKey = null;
    var sqlCountVal = 0;

    function sqlCount(text, ctx) {
        var engine = ctx && ctx.sql;
        if (!engine || typeof engine.analyze !== 'function') return 0;
        if (sqlCountKey === text) return sqlCountVal;
        var res = engine.analyze(text, { template: 'in' });
        sqlCountKey = text;
        sqlCountVal = (res && res.count) || 0;
        return sqlCountVal;
    }

    function canRun(id, text, ctx) {
        var item = BY_ID[id];
        if (!item) return false;

        // 基础项不依赖选区内容：复制全选永远可用，剪切粘贴看只读（UI 判断）
        if (item.group === 'basic') return true;

        var s = str(text);
        if (!s.trim()) return false;
        if (s.length > LIMITS.maxChars) return false;

        if (item.esc) return !!escapeEngine(ctx);

        switch (id) {
            case 'esc-newline-encode':
            case 'esc-newline-decode':
                return true;
            case 'tidy-json-pretty':
            case 'tidy-json-minify':
                return parseJson(s).ok;
            case 'tidy-sort-num':
                return numericLines(s) !== null;
            case 'sql-in':
            case 'sql-not-in':
            case 'sql-insert':
                return sqlCount(s, ctx) > 0;
            case 'qr-copy':
            case 'qr-open': {
                var qr = ctx && ctx.qr;
                if (!qr || typeof qr.utf8Length !== 'function') return false;
                // 单张二维码按 M 级纠错算容量（和右键菜单固定的参数一致）
                return qr.utf8Length(s) <= qr.BYTE_CAP.M;
            }
            default:
                return true;
        }
    }

    /* ==================================================================== *
     * 执行
     * ==================================================================== */

    function run(id, text, ctx) {
        var item = BY_ID[id];
        if (!item) return bad('sel-unknown');
        var s = str(text);

        if (item.group !== 'basic') {
            if (!s.trim()) return bad('sel-empty');
            if (s.length > LIMITS.maxChars) return bad('sel-too-large');
        }

        if (item.esc) {
            var engine = escapeEngine(ctx);
            if (!engine) return bad('sel-no-engine');
            var res = engine.convert(s, item.esc.kind, item.esc.dir);
            if (!res || !res.ok) return bad((res && res.code) || 'sel-convert-failed');
            return ok(res.text);
        }

        switch (id) {
            case 'esc-newline-encode': return ok(escapeNewlines(s));
            case 'esc-newline-decode': return ok(unescapeNewlines(s));

            case 'tidy-trim': return ok(tidyTrim(s));
            case 'tidy-strip-ws': return ok(tidyStripWs(s));
            case 'tidy-dedupe': return ok(tidyDedupe(s));
            case 'tidy-sort': return ok(tidySort(s));
            case 'tidy-reverse': return ok(tidyReverse(s));
            case 'tidy-number': return ok(tidyNumber(s));
            case 'tidy-join-comma': return ok(tidyJoin(s, ', '));
            case 'tidy-join-cn': return ok(tidyJoin(s, '、'));
            case 'tidy-join-space': return ok(tidyJoin(s, ' '));
            case 'tidy-upper': return ok(tidyCase(s, 'upper'));
            case 'tidy-lower': return ok(tidyCase(s, 'lower'));
            case 'tidy-title': return ok(tidyCase(s, 'title'));
            case 'tidy-quote-single': return ok(tidyQuote(s, "'"));
            case 'tidy-quote-double': return ok(tidyQuote(s, '"'));
            case 'tidy-quote-backtick': return ok(tidyQuote(s, '`'));
            case 'tidy-json-pretty': return tidyJson(s, true);
            case 'tidy-json-minify': return tidyJson(s, false);
            case 'tidy-sort-num': {
                var sorted = numericLines(s);
                return sorted === null ? bad('sel-not-numeric') : ok(sorted);
            }

            case 'sql-in': return sqlOf(s, 'in', ctx);
            case 'sql-not-in': return sqlOf(s, 'not-in', ctx);
            case 'sql-insert': return sqlOf(s, 'insert', ctx);

            default:
                return bad('sel-not-transform');
        }
    }

    function list() {
        return ITEMS.slice();
    }

    return {
        LIMITS: LIMITS,
        ITEMS: ITEMS,
        list: list,
        run: run,
        canRun: canRun,
        // 下面几个导出给测试与 UI 复用（菜单标题里的行/字符统计也走它）
        linesOf: linesOf,
        escapeNewlines: escapeNewlines,
        unescapeNewlines: unescapeNewlines,
        parseJson: parseJson
    };
});
