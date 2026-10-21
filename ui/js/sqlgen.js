/*
 * SQL value-list generator — pure functions, no DOM dependency.
 *
 * Turns pasted batch text (one value per line, or a comma separated row, or a
 * whole `IN (...)` / `VALUES (...)` fragment copied back out of a SQL file)
 * into a value list, then renders it as a SQL snippet.
 *
 * Loaded as a classic script in the plugin (exposes window.DBXSql) and as a
 * CommonJS module in tests:
 *   node tests/sqlgen.test.js
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.DBXSql = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    // 引号外的分隔符：逗号、分号、换行、制表符、括号（兼容直接粘 IN (...) / VALUES (...)）
    var DELIMITERS = { ',': 1, ';': 1, '\n': 1, '\r': 1, '\t': 1, '(': 1, ')': 1, '[': 1, ']': 1 };
    var QUOTES = { "'": 1, '"': 1, '`': 1 };
    var NUMERIC = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/;
    var SQL_HEAD = /(?:^|[\s),])(?:not\s+in|in|values)\s*\(/i;

    var DEFAULT_OPTIONS = {
        template: 'in',   // in | notin | list | insert
        quote: 'single',  // single | double | backtick | none
        multiline: true,
        dedupe: true,
        numeric: false,   // true = 纯数字不加引号（int 列用），默认一律按字符串加引号
        table: '',
        column: ''
    };

    function extend(base, patch) {
        var out = {};
        var key;
        for (key in base) if (Object.prototype.hasOwnProperty.call(base, key)) out[key] = base[key];
        for (key in patch) if (Object.prototype.hasOwnProperty.call(patch, key)) out[key] = patch[key];
        return out;
    }

    /* -------------------------------------------------------------- scanning */

    // 找到与 start 处引号配对的结束位置（'' / "" / `` 视为转义）
    function findClosing(src, start, quote) {
        var i = start + 1;
        while (i < src.length) {
            if (src.charAt(i) === quote) {
                if (src.charAt(i + 1) === quote) {
                    i += 2;
                    continue;
                }
                return i;
            }
            i++;
        }
        return -1;
    }

    // 从 openIndex 处的 '(' 起找配对的 ')'，跳过引号里的内容
    function matchParen(src, openIndex) {
        var depth = 0;
        var i = openIndex;
        while (i < src.length) {
            var ch = src.charAt(i);
            if (QUOTES[ch]) {
                var end = findClosing(src, i, ch);
                if (end !== -1) {
                    i = end + 1;
                    continue;
                }
            }
            if (ch === '(') {
                depth++;
            } else if (ch === ')') {
                depth--;
                if (depth === 0) return i;
            }
            i++;
        }
        return -1;
    }

    // 直接贴了 `WHERE id IN ('a','b') AND x=1;`：括号之前和括号之后的 SQL 片段都切掉，
    // 只留括号里的值（否则 `and service_name='iss-sts'` 会被当成最后一个值）
    function stripSqlHead(src) {
        var match = SQL_HEAD.exec(src);
        var open;
        if (match) {
            open = match.index + match[0].length - 1;
        } else {
            // 只贴了括号本身（`('a','b')\n) and x=1;`）：也从括号开始配对
            var lead = src.length - src.replace(/^\s+/, '').length;
            if (src.charAt(lead) !== '(') return src;
            open = lead;
        }
        var close = matchParen(src, open);
        // 括号没闭合（粘了半截）：保持老行为，从 '(' 之后一直取到结尾
        if (close === -1) return src.slice(open + 1);

        // `VALUES ('a'),('b')` 这种多组写法：紧跟其后的括号继续算进范围
        var end = close;
        for (;;) {
            var next = end + 1;
            while (next < src.length && /[\s,]/.test(src.charAt(next))) next++;
            if (src.charAt(next) !== '(') break;
            var groupEnd = matchParen(src, next);
            if (groupEnd === -1) break;
            end = groupEnd;
        }
        return src.slice(open + 1, end);
    }

    // 按分隔符切分；只有出现在 token 起始位置的引号才当作包裹引号，
    // 这样 O'Brien 这种没加引号的值不会被拆坏
    function scan(src) {
        var tokens = [];
        var buf = '';
        var quoted = false;
        var i = 0;

        // 只有空白不算一个值；但引号解析出来的空串是「显式的空值」，要保留
        function hasContent() {
            return quoted || /\S/.test(buf);
        }

        function flush() {
            if (hasContent()) tokens.push({ value: buf, quoted: quoted });
            buf = '';
            quoted = false;
        }

        while (i < src.length) {
            var ch = src.charAt(i);
            if (DELIMITERS[ch]) {
                flush();
                i++;
                continue;
            }
            // 分隔符后的空白不该让下一个引号变成普通字符
            if (QUOTES[ch] && !hasContent()) {
                var end = findClosing(src, i, ch);
                if (end !== -1) {
                    buf = src.slice(i + 1, end).split(ch + ch).join(ch);
                    quoted = true;
                    i = end + 1;
                    continue;
                }
            }
            buf += ch;
            i++;
        }
        flush();
        return tokens;
    }

    /* ---------------------------------------------------------------- parse */

    function parseValues(text) {
        var src = String(text == null ? '' : text).replace(/\r\n?/g, '\n');
        if (!src) return [];
        var tokens = scan(stripSqlHead(src));
        var values = [];
        for (var i = 0; i < tokens.length; i++) {
            var value = tokens[i].value.trim();
            // 空行、多余分隔符直接跳过；但显式写的 '' 是一个值
            if (!value && !tokens[i].quoted) continue;
            values.push(value);
        }
        return values;
    }

    function uniqueValues(values) {
        var seen = Object.create(null);
        var out = [];
        var dropped = 0;
        for (var i = 0; i < values.length; i++) {
            var key = '$' + values[i];
            if (seen[key]) {
                dropped++;
                continue;
            }
            seen[key] = 1;
            out.push(values[i]);
        }
        return { values: out, dropped: dropped };
    }

    /* -------------------------------------------------------------- quoting */

    function isNumericLiteral(text) {
        if (!NUMERIC.test(text)) return false;
        // 007 / 0123 这类前导零多半是编号，按字符串处理，别让数据库当成 7 / 123
        if (/^[-+]?0\d/.test(text)) return false;
        return true;
    }

    function quoteValue(value, options) {
        var o = extend(DEFAULT_OPTIONS, options || {});
        var text = String(value);
        if (o.quote === 'none') return text;
        if (o.quote === 'backtick') return '`' + text.replace(/`/g, '``') + '`';
        // 默认按字符串加引号（ID 列多半是 varchar）；勾了「数字不加引号」才输出裸数字，
        // 避免 1 被当成字符串跟 int 列比较（MySQL 隐式转换会丢索引）
        if (o.numeric !== false && isNumericLiteral(text)) return text;
        if (o.quote === 'double') return '"' + text.replace(/"/g, '""') + '"';
        return "'" + text.replace(/'/g, "''") + "'";
    }

    /* --------------------------------------------------------------- render */

    function wrapList(keyword, literals, multiline) {
        if (!multiline) return keyword + ' (' + literals.join(', ') + ')';
        return keyword + ' (\n  ' + literals.join(',\n  ') + '\n)';
    }

    function generateSql(values, options) {
        var o = extend(DEFAULT_OPTIONS, options || {});
        var list = o.dedupe ? uniqueValues(values).values : values.slice();
        if (!list.length) return '';

        var literals = [];
        for (var i = 0; i < list.length; i++) literals.push(quoteValue(list[i], o));

        switch (o.template) {
            case 'notin':
                return wrapList('NOT IN', literals, o.multiline);
            case 'list':
                return literals.join(o.multiline ? ',\n' : ', ');
            case 'insert':
                var table = String(o.table || '').trim() || 'your_table';
                var column = String(o.column || '').trim();
                var head = 'INSERT INTO ' + table + (column ? ' (' + column + ')' : '') + ' VALUES';
                if (!o.multiline) {
                    return head + ' ' + literals.map(function (v) { return '(' + v + ')'; }).join(', ') + ';';
                }
                return head + '\n  ' + literals.map(function (v) { return '(' + v + ')'; }).join(',\n  ') + ';';
            case 'in':
            default:
                return wrapList('IN', literals, o.multiline);
        }
    }

    /* -------------------------------------------------------------- analyze */

    // 一次给出「生成的 SQL + 计数 + 去掉的重复项」，页面直接消费
    function analyze(text, options) {
        var o = extend(DEFAULT_OPTIONS, options || {});
        var values = parseValues(text);
        var unique = uniqueValues(values);
        return {
            values: values,
            count: o.dedupe ? unique.values.length : values.length,
            duplicates: o.dedupe ? unique.dropped : 0,
            sql: generateSql(values, o)
        };
    }

    return {
        DEFAULT_OPTIONS: DEFAULT_OPTIONS,
        parseValues: parseValues,
        uniqueValues: uniqueValues,
        quoteValue: quoteValue,
        generateSql: generateSql,
        analyze: analyze
    };
});
