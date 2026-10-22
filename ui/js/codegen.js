/*
 * Code generators core — pure functions, no DOM dependency.
 *
 * Loaded as a classic script in the plugin (exposes window.DBXCodegen) and as a
 * CommonJS module in tests:
 *
 *   DBXCodegen.generate(text, { source: 'json' | 'ddl', lang: 'ts'|'go'|'java'|'python', rootName })
 *
 * 设计原则：
 *   1. 只做「结构推断 + 模板渲染」，不联网、不 eval、不依赖任何解析库；
 *   2. 顶层对象 / 对象数组都能出模型，嵌套对象抽成独立类型（依赖先于使用者输出）；
 *   3. 输入有上限（字符数 / 类型数 / 嵌套深度 / 字段数），超了降级成 any 而不是卡死；
 *   4. 失败返回 { ok:false, code }，文案交给 UI 层按当前语言翻译。
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.DBXCodegen = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var LANGS = ['ts', 'go', 'java', 'python'];
    var LIMITS = {
        chars: 1000000,   // 输入字符上限：1 M 字符的 JSON 已经远超「贴一段样例」的范畴
        types: 120,       // 最多抽出多少个类型
        fields: 800,      // 单个类型最多多少字段
        depth: 40,        // 嵌套深度
        arraySamples: 200 // 合并数组元素类型时最多看多少条，避免大数组全量推断
    };

    var TS_RESERVED = {};
    ('break case catch class const continue debugger default delete do else enum export extends false finally for ' +
        'function if import in instanceof new null return super switch this throw true try typeof var void while with ' +
        'as implements interface let package private protected public static yield any boolean constructor declare ' +
        'get module require number set string symbol type from of').split(' ').forEach(function (w) { TS_RESERVED[w] = 1; });

    var JAVA_RESERVED = {};
    ('abstract assert boolean break byte case catch char class const continue default do double else enum extends ' +
        'final finally float for goto if implements import instanceof int interface long native new package private ' +
        'protected public return short static strictfp super switch synchronized this throw throws transient try void ' +
        'volatile while true false null var record yield sealed permits').split(' ').forEach(function (w) { JAVA_RESERVED[w] = 1; });

    var PY_RESERVED = {};
    ('False None True and as assert async await break class continue def del elif else except finally for from global ' +
        'if import in is lambda nonlocal not or pass raise return try while with yield').split(' ').forEach(function (w) { PY_RESERVED[w] = 1; });

    /* ------------------------------------------------------------ helpers */

    function isNull(v) {
        return v === null || v === undefined;
    }

    function isPlainObject(v) {
        return !!v && typeof v === 'object' && !Array.isArray(v);
    }

    function kindOf(v) {
        if (isNull(v)) return 'null';
        if (Array.isArray(v)) return 'array';
        var t = typeof v;
        if (t === 'object') return 'object';
        if (t === 'number') return Number.isInteger(v) ? 'int' : 'number';
        if (t === 'string') return 'string';
        if (t === 'boolean') return 'boolean';
        return 'any';
    }

    function words(key) {
        return String(key == null ? '' : key)
            // camelCase / PascalCase 先在大小写交界处断开，userID 才不会被当成一个词
            .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
            .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
            .split(/[^A-Za-z0-9]+/)
            .filter(function (w) { return !!w; });
    }

    var INITIALISMS = {
        id: 'ID', ids: 'IDs', uid: 'UID', gid: 'GID', uuid: 'UUID', url: 'URL', urls: 'URLs', uri: 'URI',
        api: 'API', apis: 'APIs', http: 'HTTP', https: 'HTTPS', json: 'JSON', sql: 'SQL', html: 'HTML',
        css: 'CSS', xml: 'XML', ip: 'IP', db: 'DB', os: 'OS', cpu: 'CPU', sku: 'SKU', jwt: 'JWT',
        utf8: 'UTF8', ascii: 'ASCII', tcp: 'TCP', udp: 'UDP', sdk: 'SDK', ui: 'UI', io: 'IO', ok: 'OK'
    };

    function pascal(raw, initialisms) {
        var ws = words(raw);
        if (!ws.length) return '';
        var out = ws.map(function (w) {
            var low = w.toLowerCase();
            if (initialisms && INITIALISMS[low]) return INITIALISMS[low];
            // 全大写缩写（DTO / ID）原样保留后半段，别变成 Dto
            if (w.length > 1 && w === w.toUpperCase() && /^[A-Z]+$/.test(w)) return w;
            return w.charAt(0).toUpperCase() + w.slice(1);
        }).join('');
        if (/^[0-9]/.test(out)) out = 'T' + out;
        return out;
    }

    function camel(raw) {
        var p = pascal(raw, false);
        if (!p) return '';
        return p.charAt(0).toLowerCase() + p.slice(1);
    }

    function snake(raw) {
        var ws = words(raw);
        return ws.map(function (w) { return w.toLowerCase(); }).join('_');
    }

    function sanitizeTypeName(raw) {
        return pascal(raw, true) || 'Root';
    }

    function singular(name) {
        var s = String(name == null ? '' : name);
        if (/ies$/i.test(s)) return s.slice(0, -3) + 'y';
        if (/(ses|xes|zes|ches|shes)$/i.test(s)) return s.slice(0, -2);
        if (/[^s]s$/i.test(s)) return s.slice(0, -1);
        return s;
    }

    function escapeComment(text) {
        return String(text == null ? '' : text)
            .replace(/\s+/g, ' ')
            .replace(/\*\//g, '*\\/')
            .trim();
    }

    function padEnd(str, len) {
        str = String(str);
        while (str.length < len) str += ' ';
        return str;
    }

    /* ---------------------------------------------------------- inference */

    function uniqueName(base, ctx) {
        var name = base || 'Type';
        if (!ctx.used[name]) {
            ctx.used[name] = 1;
            return name;
        }
        var i = 2;
        while (ctx.used[name + i]) i++;
        name = name + i;
        ctx.used[name] = 1;
        return name;
    }

    /**
     * 把一组「样本值」合成一个类型节点。
     * 数组是逐元素合并的关键：{a:1} 与 {a:2,b:'x'} 应该得到 a 必填、b 可选。
     */
    function inferSamples(samples, nameHint, ctx, depth) {
        depth = depth || 0;
        if (depth > LIMITS.depth) return { kind: 'any' };

        var i;
        var hasNull = false;
        var vals = [];
        for (i = 0; i < samples.length; i++) {
            if (isNull(samples[i])) hasNull = true;
            else vals.push(samples[i]);
        }
        if (!vals.length) return { kind: 'null', nullable: true };

        var kinds = [];
        for (i = 0; i < vals.length; i++) {
            var k = kindOf(vals[i]);
            if (kinds.indexOf(k) < 0) kinds.push(k);
        }

        if (kinds.length > 1) {
            var numeric = kinds.every(function (x) { return x === 'int' || x === 'number'; });
            if (numeric) return { kind: 'number', nullable: hasNull };
            // 混合标量（[1, "a"]）在 TS 里能表达成联合类型；其余语言没有对应语法，渲染时退成 any
            var scalar = kinds.every(function (x) {
                return x === 'int' || x === 'number' || x === 'string' || x === 'boolean';
            });
            if (scalar) {
                return {
                    kind: 'union',
                    of: kinds.map(function (k) { return { kind: k }; }),
                    nullable: hasNull
                };
            }
            // 字符串 + 对象、布尔 + 数字…：不猜，退成 any
            return { kind: 'any', nullable: hasNull };
        }

        var kind = kinds[0];
        if (kind === 'object') {
            var refName = defineObject(vals, nameHint, ctx, depth);
            if (!refName) return { kind: 'any', nullable: hasNull };
            return { kind: 'ref', name: refName, nullable: hasNull };
        }
        if (kind === 'array') {
            var elems = [];
            for (i = 0; i < vals.length; i++) {
                var arr = vals[i];
                for (var j = 0; j < arr.length; j++) {
                    elems.push(arr[j]);
                    if (elems.length >= LIMITS.arraySamples) break;
                }
                if (elems.length >= LIMITS.arraySamples) break;
            }
            var elem = elems.length
                ? inferSamples(elems, singular(nameHint), ctx, depth + 1)
                : { kind: 'any' };
            return { kind: 'array', elem: elem, nullable: hasNull };
        }
        return { kind: kind, nullable: hasNull };
    }

    /**
     * 合并多个对象样本，产出一个类型定义。返回类型名（失败返回 null）。
     * 先占名字再递归子字段，避免子类型把父类型想用的名字抢走。
     */
    function defineObject(objects, nameHint, ctx, depth) {
        if (ctx.defs.length >= LIMITS.types) return null;
        var name = uniqueName(pascal(nameHint, true) || 'Item', ctx);

        var keys = [];
        objects.forEach(function (obj) {
            Object.keys(obj).forEach(function (key) {
                if (keys.indexOf(key) < 0) keys.push(key);
            });
        });
        var truncated = keys.length > LIMITS.fields;
        if (truncated) keys = keys.slice(0, LIMITS.fields);

        var fields = keys.map(function (key) {
            var present = [];
            objects.forEach(function (obj) {
                if (Object.prototype.hasOwnProperty.call(obj, key)) present.push(obj[key]);
            });
            var optional = present.length < objects.length;
            var type = inferSamples(present, key, ctx, depth + 1);
            return {
                key: key,
                type: type,
                optional: optional || type.nullable === true,
                comment: ''
            };
        });

        // 子类型已经先 push 进去了，父类型排在后面 —— 依赖先于使用者
        ctx.defs.push({ name: name, fields: fields, comment: '', truncated: truncated });
        return name;
    }

    /**
     * 推断 JSON 根节点。对象 / 对象数组 / 标量都能处理。
     * 返回 { defs, root, rootName }，rootName 是用户填的根类型名（清洗过）。
     */
    function inferJSON(value, rootName) {
        var ctx = { defs: [], used: Object.create(null) };
        var wantName = sanitizeTypeName(rootName || 'Root');
        var root;
        if (isPlainObject(value)) {
            var refName = defineObject([value], wantName, ctx, 0);
            root = refName ? { kind: 'ref', name: refName } : { kind: 'any' };
        } else if (Array.isArray(value)) {
            root = inferSamples([value], wantName, ctx, 0);
        } else {
            root = inferSamples([value], wantName, ctx, 0);
        }
        return { defs: ctx.defs, root: root, rootName: wantName };
    }

    /* ------------------------------------------------------------- DDL */

    function unquoteIdent(raw) {
        var s = String(raw == null ? '' : raw).trim();
        if ((s.charAt(0) === '`' && s.charAt(s.length - 1) === '`') ||
            (s.charAt(0) === '"' && s.charAt(s.length - 1) === '"') ||
            (s.charAt(0) === '[' && s.charAt(s.length - 1) === ']')) {
            s = s.slice(1, -1);
        }
        var dot = s.lastIndexOf('.');
        if (dot >= 0) s = s.slice(dot + 1);
        return s.replace(/``/g, '`').replace(/""/g, '"');
    }

    // 去掉 -- / # / 块注释，但不动字符串与反引号里的内容
    function stripSqlComments(text) {
        var out = '';
        var i = 0;
        var n = text.length;
        var quote = null;
        while (i < n) {
            var c = text.charAt(i);
            if (quote) {
                if (c === '\\' && quote !== '`') {
                    out += c + (text.charAt(i + 1) || '');
                    i += 2;
                    continue;
                }
                if (c === quote) {
                    if (text.charAt(i + 1) === quote) {
                        out += c + c;
                        i += 2;
                        continue;
                    }
                    quote = null;
                }
                out += c;
                i++;
                continue;
            }
            if (c === "'" || c === '"' || c === '`') {
                quote = c;
                out += c;
                i++;
                continue;
            }
            if (c === '-' && text.charAt(i + 1) === '-') {
                while (i < n && text.charAt(i) !== '\n') i++;
                continue;
            }
            if (c === '#') {
                while (i < n && text.charAt(i) !== '\n') i++;
                continue;
            }
            if (c === '/' && text.charAt(i + 1) === '*') {
                i += 2;
                while (i < n && !(text.charAt(i) === '*' && text.charAt(i + 1) === '/')) i++;
                i += 2;
                continue;
            }
            out += c;
            i++;
        }
        return out;
    }

    function readIdent(text, start) {
        var i = start;
        var n = text.length;
        while (i < n && /\s/.test(text.charAt(i))) i++;
        var begin = i;
        var quote = null;
        var open = text.charAt(i);
        if (open === '`' || open === '"' || open === '[') {
            quote = open === '[' ? ']' : open;
            i++;
            while (i < n) {
                if (text.charAt(i) === quote) {
                    if (text.charAt(i + 1) === quote && quote !== ']') { i += 2; continue; }
                    i++;
                    break;
                }
                i++;
            }
        } else {
            while (i < n && /[A-Za-z0-9_$.]/.test(text.charAt(i))) i++;
        }
        return { raw: text.slice(begin, i), end: i };
    }

    // 从左括号开始按括号配对找右括号，跳过引号内的内容
    function matchParen(text, openIndex) {
        var depth = 0;
        var quote = null;
        for (var i = openIndex; i < text.length; i++) {
            var c = text.charAt(i);
            if (quote) {
                if (c === '\\' && quote !== '`') { i++; continue; }
                if (c === quote) {
                    if (text.charAt(i + 1) === quote) { i++; continue; }
                    quote = null;
                }
                continue;
            }
            if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
            if (c === '(') depth++;
            else if (c === ')') {
                depth--;
                if (depth === 0) return i;
            }
        }
        return -1;
    }

    // 顶层逗号切分（括号 / 引号里的逗号不算）
    function splitTopLevel(body) {
        var parts = [];
        var depth = 0;
        var quote = null;
        var start = 0;
        for (var i = 0; i < body.length; i++) {
            var c = body.charAt(i);
            if (quote) {
                if (c === '\\' && quote !== '`') { i++; continue; }
                if (c === quote) {
                    if (body.charAt(i + 1) === quote) { i++; continue; }
                    quote = null;
                }
                continue;
            }
            if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
            if (c === '(') depth++;
            else if (c === ')') depth--;
            else if (c === ',' && depth === 0) {
                parts.push(body.slice(start, i));
                start = i + 1;
            }
        }
        parts.push(body.slice(start));
        return parts;
    }

    var NON_COLUMN = /^(primary\s+key|unique(\s+key|\s+index)?|key|index|constraint|foreign\s+key|check|fulltext|spatial|partition)\b/i;

    var TYPE_PATTERNS = [
        /^(double\s+precision)/i,
        /^(character\s+varying(?:\s*\(\s*\d+(?:\s*,\s*\d+)?\s*\))?)/i,
        /^(bit\s+varying(?:\s*\(\s*\d+\s*\))?)/i,
        /^(timestamp(?:\s*\(\s*\d+\s*\))?\s+(?:with|without)\s+time\s+zone)/i,
        /^(time(?:\s*\(\s*\d+\s*\))?\s+(?:with|without)\s+time\s+zone)/i,
        /^(enum\s*\([^)]*\))/i,
        /^(set\s*\([^)]*\))/i,
        /^([A-Za-z][A-Za-z0-9_]*(?:\s*\(\s*[-\d]+(?:\s*,\s*[-\d]+)?\s*\))?)/i
    ];

    function readSqlType(rest) {
        var s = String(rest || '').replace(/^\s+/, '');
        for (var i = 0; i < TYPE_PATTERNS.length; i++) {
            var m = TYPE_PATTERNS[i].exec(s);
            if (m) return m[1];
        }
        return 'varchar';
    }

    // SQL 类型 → 统一类型种类。故意保守：认不出来的按字符串，不让生成结果看起来「猜过头」
    function sqlKind(typeRaw) {
        var t = String(typeRaw || '').toLowerCase().replace(/\s+/g, ' ').trim();
        if (/^tinyint\s*\(\s*1\s*\)/.test(t)) return 'boolean';
        var base = t.replace(/\s*\(.*$/, '').trim();
        if (/^(bool|boolean|bit)$/.test(base)) return 'boolean';
        if (/^(smallint|integer|int|bigint|mediumint|tinyint|serial|bigserial|smallserial|int2|int4|int8)$/.test(base)) return 'int';
        if (/^(decimal|numeric|dec|fixed|float|double precision|double|real|money|number)$/.test(base)) return 'number';
        if (/^(blob|tinyblob|mediumblob|longblob|binary|varbinary|bytea|image|bit varying)$/.test(base)) return 'binary';
        return 'string';
    }

    function parseColumn(part) {
        var s = String(part || '').trim();
        if (!s || NON_COLUMN.test(s)) return null;
        var m = /^(`[^`]+`|"[^"]+"|\[[^\]]+\]|[A-Za-z_][A-Za-z0-9_$]*)\s+([\s\S]+)$/.exec(s);
        if (!m) return null;
        var name = unquoteIdent(m[1]);
        if (!name) return null;
        var rest = m[2];
        var typeRaw = readSqlType(rest);
        var notNull = /\bnot\s+null\b/i.test(rest) || /\bprimary\s+key\b/i.test(rest);
        var cm = /\bcomment\s+'((?:[^']|'')*)'/i.exec(rest) || /\bcomment\s+"((?:[^"]|"")*)"/i.exec(rest);
        return {
            name: name,
            typeRaw: typeRaw,
            kind: sqlKind(typeRaw),
            nullable: !notNull,
            comment: cm ? cm[1].replace(/''/g, "'").replace(/""/g, '"') : ''
        };
    }

    /**
     * 解析 CREATE TABLE。返回 [{ name, comment, columns }]。
     * 支持 MySQL / PostgreSQL 常见写法：反引号、双引号、schema 前缀、IF NOT EXISTS、
     * 列级注释、表级注释、主键/索引约束（跳过）。
     */
    function parseDDL(text) {
        var sql = stripSqlComments(String(text == null ? '' : text));
        var tables = [];
        var re = /create\s+(?:or\s+replace\s+)?(?:temporary\s+|temp\s+|unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?/ig;
        var m;
        while ((m = re.exec(sql))) {
            var ident = readIdent(sql, m.index + m[0].length);
            var tableName = unquoteIdent(ident.raw);
            var open = sql.indexOf('(', ident.end);
            if (open < 0) continue;
            var close = matchParen(sql, open);
            if (close < 0) continue;
            var body = sql.slice(open + 1, close);
            var after = sql.slice(close + 1, close + 600);
            var tableComment = '';
            var tc = /\bcomment\s*=\s*'((?:[^']|'')*)'/i.exec(after);
            if (!tc) tc = /\bcomment\s+'((?:[^']|'')*)'/i.exec(after);
            if (tc) tableComment = tc[1].replace(/''/g, "'");

            var columns = [];
            splitTopLevel(body).forEach(function (part) {
                var col = parseColumn(part);
                if (col) columns.push(col);
            });
            if (tableName && columns.length) {
                tables.push({ name: tableName, comment: tableComment, columns: columns });
            }
            // 从右括号之后继续找下一条 CREATE TABLE
            re.lastIndex = close + 1;
        }
        return tables;
    }

    function ddlDefs(tables, rootNameOverride) {
        var used = Object.create(null);
        // 表名常见前缀（t_ / tb_ / tbl_ / tmp_）不进类型名：t_user → User
        function tableTypeName(raw) {
            return pascal(String(raw || '').replace(/^(t_|tb_|tbl_|tmp_)/i, ''), true) || 'Table';
        }
        var defs = tables.map(function (table, index) {
            var preferred = index === 0 && rootNameOverride ? rootNameOverride : tableTypeName(table.name);
            var name = uniqueName(pascal(preferred, true) || 'Table', { used: used });
            var fields = table.columns.slice(0, LIMITS.fields).map(function (col) {
                return {
                    // 列名 user_name 在代码里是小驼峰，原始名留给 Go 的 json tag
                    key: camel(col.name) || snake(col.name) || 'field',
                    raw: col.name,
                    type: { kind: col.kind, nullable: col.nullable },
                    optional: col.nullable,
                    comment: col.comment
                };
            });
            return { name: name, fields: fields, comment: table.comment, truncated: table.columns.length > fields.length };
        });
        return defs;
    }

    /* ----------------------------------------------------------- render */

    function tsKey(key) {
        return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
    }

    function tsType(t) {
        if (!t) return 'any';
        var base;
        switch (t.kind) {
            case 'string': base = 'string'; break;
            case 'int':
            case 'number': base = 'number'; break;
            case 'boolean': base = 'boolean'; break;
            case 'binary': base = 'Uint8Array'; break;
            // 全是 null 的字段推断不出类型，给 any 比给 null 实用
            case 'null': base = 'any'; break;
            case 'ref': base = t.name; break;
            case 'union': {
                var parts = [];
                (t.of || []).forEach(function (sub) {
                    var s = tsType(sub);
                    if (parts.indexOf(s) < 0) parts.push(s);
                });
                base = parts.length ? parts.join(' | ') : 'any';
                break;
            }
            case 'array':
                base = tsType(t.elem);
                if (base.indexOf(' | ') >= 0) base = '(' + base + ')';
                base += '[]';
                break;
            default: base = 'any';
        }
        if (t.nullable && t.kind !== 'null' && t.kind !== 'any') {
            base += ' | null';
        }
        return base;
    }

    function renderTS(defs, root, opts) {
        var out = [];
        defs.forEach(function (def) {
            var lines = [];
            if (def.comment) lines.push('/** ' + escapeComment(def.comment) + ' */');
            lines.push('export interface ' + def.name + ' {');
            def.fields.forEach(function (f) {
                if (f.comment) lines.push('  /** ' + escapeComment(f.comment) + ' */');
                var opt = f.optional ? '?' : '';
                // `?` 已经表达了「可能没有」，再挂 `| null` 只是噪音
                var type = f.optional ? tsType(f.type).replace(/ \| null$/, '') : tsType(f.type);
                lines.push('  ' + tsKey(f.key) + opt + ': ' + type + ';');
            });
            lines.push('}');
            out.push(lines.join('\n'));
        });
        var alias = aliasTS(root, opts);
        if (alias) out.push(alias);
        return out.join('\n\n') + '\n';
    }

    function aliasTS(root, opts) {
        if (!root) return '';
        if (root.kind === 'ref' && root.name === opts.rootName) return '';
        var name = opts.rootName;
        if (root.kind === 'ref') return 'export type ' + name + ' = ' + root.name + ';';
        if (root.kind === 'array' && root.elem && root.elem.kind === 'ref' && root.elem.name === name) {
            name = name + 'List';
        }
        return 'export type ' + name + ' = ' + tsType(root) + ';';
    }

    /* -------------------------------------------------------------- Go */

    function goFieldName(key) {
        var p = pascal(key, true);
        return p || 'Field';
    }

    function goType(t) {
        if (!t) return 'interface{}';
        var base;
        switch (t.kind) {
            case 'string': base = 'string'; break;
            case 'int': base = 'int64'; break;
            case 'number': base = 'float64'; break;
            case 'boolean': base = 'bool'; break;
            case 'binary': base = '[]byte'; break;
            case 'ref': base = t.name; break;
            case 'array': base = '[]' + goType(t.elem); break;
            case 'null':
            case 'any':
            default: base = 'interface{}';
        }
        // 切片 / map / interface{} 本身可为 nil，再加指针只是噪音
        if (t.nullable && !/^(\[\]|map\[|interface\{\})/.test(base)) base = '*' + base;
        return base;
    }

    function renderGo(defs, root, opts) {
        var out = ['package model'];
        defs.forEach(function (def) {
            var lines = [];
            if (def.comment) lines.push('// ' + def.name + ' ' + escapeComment(def.comment));
            else lines.push('// ' + def.name);
            lines.push('type ' + def.name + ' struct {');

            var used = Object.create(null);
            var rows = def.fields.map(function (f) {
                var name = goFieldName(f.key);
                if (used[name]) {
                    var i = 2;
                    while (used[name + i]) i++;
                    name = name + i;
                }
                used[name] = 1;
                var tag = '`json:' + JSON.stringify((f.raw || f.key) + (f.optional ? ',omitempty' : '')) + '`';
                return {
                    name: name,
                    type: goType(f.type),
                    tag: tag,
                    comment: f.comment ? escapeComment(f.comment) : ''
                };
            });
            var wName = 0;
            var wType = 0;
            var wTag = 0;
            rows.forEach(function (r) {
                wName = Math.max(wName, r.name.length);
                wType = Math.max(wType, r.type.length);
                wTag = Math.max(wTag, r.tag.length);
            });
            rows.forEach(function (r) {
                var line = '\t' + padEnd(r.name, wName) + ' ' + padEnd(r.type, wType) + ' ' + r.tag;
                if (r.comment) line += new Array(wTag - r.tag.length + 2).join(' ') + '// ' + r.comment;
                lines.push(line);
            });
            lines.push('}');
            out.push(lines.join('\n'));
        });
        var alias = aliasGo(root, opts);
        if (alias) out.push(alias);
        return out.join('\n\n') + '\n';
    }

    function aliasGo(root, opts) {
        if (!root) return '';
        if (root.kind === 'ref' && root.name === opts.rootName) return '';
        var name = opts.rootName;
        if (root.kind === 'ref') return 'type ' + name + ' = ' + root.name;
        if (root.kind === 'array' && root.elem && root.elem.kind === 'ref' && root.elem.name === name) {
            name = name + 'List';
        }
        return 'type ' + name + ' ' + goType(root);
    }

    /* ------------------------------------------------------------ Java */

    function javaFieldName(key) {
        var name = camel(key) || 'field';
        name = name.replace(/[^A-Za-z0-9_$]/g, '');
        if (!name) name = 'field';
        if (/^[0-9]/.test(name)) name = '_' + name;
        if (JAVA_RESERVED[name]) name += '_';
        return name;
    }

    function javaType(t, boxed) {
        if (!t) return 'Object';
        var base;
        switch (t.kind) {
            case 'string': base = 'String'; break;
            case 'int': base = boxed ? 'Long' : 'long'; break;
            case 'number': base = boxed ? 'Double' : 'double'; break;
            case 'boolean': base = boxed ? 'Boolean' : 'boolean'; break;
            case 'binary': base = 'byte[]'; break;
            case 'ref': base = t.name; break;
            case 'array': base = 'List<' + javaType(t.elem, true) + '>'; break;
            case 'null':
            case 'any':
            default: base = 'Object';
        }
        if (t.nullable && (t.kind === 'int' || t.kind === 'number' || t.kind === 'boolean')) {
            base = t.kind === 'int' ? 'Long' : (t.kind === 'number' ? 'Double' : 'Boolean');
        }
        return base;
    }

    function renderJava(defs, root, opts) {
        var usesList = false;
        defs.forEach(function (def) {
            def.fields.forEach(function (f) {
                if (f.type && f.type.kind === 'array') usesList = true;
            });
        });
        var blocks = [];
        defs.forEach(function (def) {
            var lines = [];
            if (def.comment) lines.push('/** ' + escapeComment(def.comment) + ' */');
            var isRoot = root && root.kind === 'ref' && root.name === def.name;
            lines.push((isRoot ? 'public class ' : 'class ') + def.name + ' {');
            var used = Object.create(null);
            // 字段名先算一遍存下来：字段声明和 getter/setter 必须用同一套名字
            var rows = def.fields.map(function (f) {
                var name = javaFieldName(f.key);
                if (used[name]) {
                    var i = 2;
                    while (used[name + i]) i++;
                    name = name + i;
                }
                used[name] = 1;
                return {
                    name: name,
                    // 一律用包装类型：数据库列可空，基础类型接不住 null
                    type: javaType(f.type, true),
                    comment: f.comment ? escapeComment(f.comment) : ''
                };
            });
            rows.forEach(function (r) {
                if (r.comment) lines.push('    /** ' + r.comment + ' */');
                lines.push('    private ' + r.type + ' ' + r.name + ';');
            });
            rows.forEach(function (r) {
                var cap = r.name.charAt(0).toUpperCase() + r.name.slice(1);
                lines.push('');
                lines.push('    public ' + r.type + ' get' + cap + '() {');
                lines.push('        return this.' + r.name + ';');
                lines.push('    }');
                lines.push('');
                lines.push('    public void set' + cap + '(' + r.type + ' ' + r.name + ') {');
                lines.push('        this.' + r.name + ' = ' + r.name + ';');
                lines.push('    }');
            });
            lines.push('}');
            blocks.push(lines.join('\n'));
        });
        var head = usesList ? 'import java.util.List;\n\n' : '';
        var alias = aliasJava(root, opts);
        if (alias) blocks.push(alias);
        return head + blocks.join('\n\n') + '\n';
    }

    function aliasJava(root, opts) {
        if (!root) return '';
        if (root.kind === 'ref' && root.name === opts.rootName) return '';
        return '// ' + opts.rootName + ' = ' + javaType(root, true);
    }

    /* ---------------------------------------------------------- Python */

    function pyFieldName(key) {
        var name = snake(key) || 'field';
        name = name.replace(/[^a-z0-9_]/g, '_');
        if (!name) name = 'field';
        if (/^[0-9]/.test(name)) name = '_' + name;
        if (PY_RESERVED[name]) name += '_';
        return name;
    }

    function pyType(t) {
        if (!t) return 'Any';
        var base;
        switch (t.kind) {
            case 'string': base = 'str'; break;
            case 'int': base = 'int'; break;
            case 'number': base = 'float'; break;
            case 'boolean': base = 'bool'; break;
            case 'binary': base = 'bytes'; break;
            case 'ref': base = t.name; break;
            case 'array': base = 'List[' + pyType(t.elem) + ']'; break;
            case 'null': base = 'Any'; break;
            case 'any':
            default: base = 'Any';
        }
        if (t.nullable && t.kind !== 'null' && t.kind !== 'any' && base !== 'Any' && base.indexOf('Optional[') !== 0) {
            base = 'Optional[' + base + ']';
        }
        return base;
    }

    function renderPython(defs, root, opts) {
        var usesList = false;
        var usesOptional = false;
        var usesAny = false;
        defs.forEach(function (def) {
            def.fields.forEach(function (f) {
                var t = f.type || { kind: 'any' };
                if (t.kind === 'array' || (t.elem && t.elem.kind === 'array')) usesList = true;
                if (t.kind === 'array') usesList = true;
                if (t.nullable || f.optional) usesOptional = true;
                if (t.kind === 'any' || t.kind === 'null' || t.kind === 'union') usesAny = true;
                if (t.kind === 'array' && (t.elem.kind === 'any' || t.elem.kind === 'null' || t.elem.kind === 'union')) usesAny = true;
            });
        });
        if (root && root.kind === 'array') usesList = true;
        if (root && root.kind === 'any') usesAny = true;

        // `from __future__ import annotations` 让「后面的类」也可以被前面的类引用
        var lines = ['from __future__ import annotations', 'from dataclasses import dataclass'];
        var typing = [];
        if (usesAny) typing.push('Any');
        if (usesList) typing.push('List');
        if (usesOptional) typing.push('Optional');
        if (typing.length) lines.push('from typing import ' + typing.join(', '));
        lines.push('');

        var blocks = [];
        defs.forEach(function (def) {
            var body = [];
            if (def.comment) body.push('    """' + escapeComment(def.comment).replace(/"""/g, '\\"\\"\\"') + '"""');
            var used = Object.create(null);
            // 有默认值的字段必须排在没默认值的后面，否则 dataclass 直接报错
            var fields = def.fields.slice().sort(function (a, b) {
                var da = a.optional ? 1 : 0;
                var db = b.optional ? 1 : 0;
                return da - db;
            });
            fields.forEach(function (f) {
                var name = pyFieldName(f.key);
                if (used[name]) {
                    var i = 2;
                    while (used[name + i]) i++;
                    name = name + i;
                }
                used[name] = 1;
                if (f.comment) body.push('    # ' + escapeComment(f.comment));
                var type = pyType(f.type);
                if (f.optional && type.indexOf('Optional[') !== 0) type = 'Optional[' + type + ']';
                body.push('    ' + name + ': ' + type + (f.optional ? ' = None' : ''));
            });
            if (!body.length) body.push('    pass');
            blocks.push('@dataclass\nclass ' + def.name + ':\n' + body.join('\n'));
        });

        var alias = aliasPython(root, opts);
        if (alias) blocks.push(alias);
        return lines.join('\n') + '\n' + blocks.join('\n\n\n') + '\n';
    }

    function aliasPython(root, opts) {
        if (!root) return '';
        if (root.kind === 'ref' && root.name === opts.rootName) return '';
        var name = opts.rootName;
        if (root.kind === 'ref') return name + ' = ' + root.name;
        if (root.kind === 'array' && root.elem && root.elem.kind === 'ref' && root.elem.name === name) {
            name = name + 'List';
        }
        return name + ' = ' + pyType(root);
    }

    /* ------------------------------------------------------------ entry */

    function countFields(defs) {
        return defs.reduce(function (sum, def) { return sum + def.fields.length; }, 0);
    }

    function render(defs, root, lang, opts) {
        if (lang === 'go') return renderGo(defs, root, opts);
        if (lang === 'java') return renderJava(defs, root, opts);
        if (lang === 'python') return renderPython(defs, root, opts);
        return renderTS(defs, root, opts);
    }

    /**
     * 主入口。
     * @param {string} text  JSON 样例或 CREATE TABLE 语句
     * @param {{source?: 'json'|'ddl', lang?: string, rootName?: string}} options
     * @returns {{ok: true, code: string, types: number, fields: number, lang: string}
     *          |{ok: false, code: string, lang: string, detail?: string}}
     */
    function generate(text, options) {
        options = options || {};
        var source = options.source === 'ddl' ? 'ddl' : 'json';
        var lang = LANGS.indexOf(options.lang) >= 0 ? options.lang : 'ts';
        var raw = String(text == null ? '' : text);
        var rootName = sanitizeTypeName(options.rootName || 'Root');

        if (!raw.trim()) return { ok: false, code: 'empty', lang: lang };
        if (raw.length > LIMITS.chars) return { ok: false, code: 'too-large', lang: lang };

        try {
            var defs;
            var root;
            if (source === 'ddl') {
                var tables = parseDDL(raw);
                if (!tables.length) return { ok: false, code: 'no-ddl', lang: lang };
                defs = ddlDefs(tables, options.rootName ? rootName : '');
                root = { kind: 'ref', name: defs[0].name };
                // DDL 的根类型就是表本身，不需要再生成 `type Root = User` 这种别名
                rootName = defs[0].name;
            } else {
                var value = JSON.parse(raw);
                var inferred = inferJSON(value, rootName);
                defs = inferred.defs;
                root = inferred.root;
                rootName = inferred.rootName;
            }
            var code = render(defs, root, lang, { rootName: rootName });
            return {
                ok: true,
                code: code,
                types: defs.length,
                fields: countFields(defs),
                lang: lang
            };
        } catch (err) {
            return {
                ok: false,
                code: source === 'ddl' ? 'no-ddl' : 'bad-json',
                lang: lang,
                detail: err && err.message ? err.message : String(err)
            };
        }
    }

    return {
        LANGS: LANGS,
        LIMITS: LIMITS,
        generate: generate,
        inferJSON: inferJSON,
        parseDDL: parseDDL,
        sqlKind: sqlKind,
        sanitizeTypeName: sanitizeTypeName,
        // 单独暴露渲染器，方便测试逐语言断言
        render: function (defs, root, lang, opts) {
            return render(defs, root, lang, opts || { rootName: 'Root' });
        }
    };
});
