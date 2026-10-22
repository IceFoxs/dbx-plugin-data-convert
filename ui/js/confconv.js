/*
 * Config / text format converters — pure functions, no DOM dependency.
 *
 * Adds the formats developers actually paste around but that JSON/YAML/XML/
 * Properties cannot cover: TOML, INI, .env, CSV, TSV, query strings, HTTP
 * headers, cookie strings and HTML tables. Every format round-trips through
 * the same plain object graph as converters.js, so any source can be paired
 * with any target.
 *
 * Errors carry a `code` (never a hard-coded language string) so the UI can
 * translate them, plus an optional `mark` ({line, column}, 0-based) that
 * converters.locateError already understands.
 *
 * Loaded as a classic script in the plugin (window.DBXConf) and as CommonJS
 * in tests.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.DBXConf = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var FORMATS = ['toml', 'ini', 'env', 'csv', 'tsv', 'query', 'headers', 'cookie', 'html'];

    /* 入口上限：这些格式都能被"一大坨文本"喂进来，超了直接拦，不进解析 */
    var LIMITS = {
        chars: 2 * 1024 * 1024, // 2 M 字符
        rows: 50000,            // CSV / INI / env 的行数
        cols: 500,              // 单行/单表的列数
        cells: 500000           // CSV 总单元格
    };

    function isPlainObject(v) {
        return v !== null && typeof v === 'object' && !Array.isArray(v);
    }

    function stripBom(text) {
        return String(text == null ? '' : text).replace(/^\uFEFF/, '');
    }

    /**
     * 抛一个可翻译的错误。code 交给 UI 查字典，mark 交给 locateError 定位行列。
     */
    function confError(code, mark) {
        var err = new Error(code);
        err.code = code;
        if (mark) err.mark = { line: mark.line || 0, column: mark.column || 0 };
        return err;
    }

    /* ==================================================================== *
     * 通用：拍平 / 还原嵌套
     * ==================================================================== */

    /**
     * {a:{b:[1,2]}} → {'a.b[0]':1, 'a.b[1]':2}（表格类格式的列名就长这样）
     * skipEmpty=true 时空数组 / 空对象不占列——表格里一格表达不了"空容器"，
     * 留着反而会和其它行的 a.b[0] 列错位。
     */
    function flattenObject(obj, prefix, out, skipEmpty) {
        out = out || {};
        if (Array.isArray(obj)) {
            if (obj.length === 0) {
                if (prefix && !skipEmpty) out[prefix] = '[]';
                return out;
            }
            for (var i = 0; i < obj.length; i++) {
                flattenObject(obj[i], prefix + '[' + i + ']', out, skipEmpty);
            }
            return out;
        }
        if (isPlainObject(obj)) {
            var keys = Object.keys(obj);
            if (keys.length === 0) {
                if (prefix && !skipEmpty) out[prefix] = '{}';
                return out;
            }
            for (var k = 0; k < keys.length; k++) {
                flattenObject(obj[keys[k]], prefix ? prefix + '.' + keys[k] : keys[k], out, skipEmpty);
            }
            return out;
        }
        if (prefix) out[prefix] = obj;
        return out;
    }

    /** 'a.b[0]' → 写到 out.a.b[0]。与 properties 的 token 规则保持一致。 */
    function setDotted(out, key, value) {
        var tokens = [];
        key.split('.').forEach(function (segment, index) {
            var match = /^([^[\]]*)((?:\[\d+\])*)$/.exec(segment);
            if (!match) {
                tokens.push({ type: 'prop', name: segment });
                return;
            }
            if (match[1] !== '' || index === 0) tokens.push({ type: 'prop', name: match[1] });
            var indexes = match[2].match(/\[\d+\]/g) || [];
            indexes.forEach(function (raw) {
                tokens.push({ type: 'index', index: Number(raw.slice(1, -1)) });
            });
        });
        if (!tokens.length) return;

        var node = out;
        for (var i = 0; i < tokens.length; i++) {
            var token = tokens[i];
            var name = token.type === 'index' ? token.index : token.name;
            var isLast = i === tokens.length - 1;
            if (isLast) {
                node[name] = value;
                return;
            }
            var wantArray = tokens[i + 1].type === 'index';
            var existing = node[name];
            if (!isPlainObject(existing) && !Array.isArray(existing)) {
                node[name] = wantArray ? [] : {};
            } else if (wantArray && !Array.isArray(existing)) {
                node[name] = [];
            }
            node = node[name];
        }
    }

    function unflattenObject(flat) {
        var out = {};
        Object.keys(flat).forEach(function (key) {
            setDotted(out, key, flat[key]);
        });
        return out;
    }

    /* ==================================================================== *
     * TOML
     * ==================================================================== */

    function TomlScanner(src) {
        this.src = src;
        this.i = 0;
        this.line = 0;
        this.col = 0;
    }

    TomlScanner.prototype.mark = function () {
        return { line: this.line, column: this.col };
    };
    TomlScanner.prototype.eof = function () {
        return this.i >= this.src.length;
    };
    TomlScanner.prototype.peek = function (offset) {
        return this.src.charAt(this.i + (offset || 0));
    };
    TomlScanner.prototype.advance = function (n) {
        for (var k = 0; k < n && this.i < this.src.length; k++) {
            if (this.src.charAt(this.i) === '\n') {
                this.line++;
                this.col = 0;
            } else {
                this.col++;
            }
            this.i++;
        }
    };
    TomlScanner.prototype.rest = function () {
        return this.src.slice(this.i);
    };
    /** 空格 / 制表符。换行不算——TOML 里换行是有意义的。 */
    TomlScanner.prototype.skipInline = function () {
        while (!this.eof() && (this.peek() === ' ' || this.peek() === '\t')) this.advance(1);
    };
    /** 空白 + 注释 + 换行（数组 / 表头前后都能出现） */
    TomlScanner.prototype.skipAll = function () {
        while (!this.eof()) {
            var ch = this.peek();
            if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
                this.advance(1);
            } else if (ch === '#') {
                while (!this.eof() && this.peek() !== '\n') this.advance(1);
            } else {
                return;
            }
        }
    };

    var TOML_ESCAPES = { b: '\b', t: '\t', n: '\n', f: '\f', r: '\r', '"': '"', '\\': '\\' };

    TomlScanner.prototype.readBasicString = function () {
        // 调用前 peek() === '"'
        var multiline = this.peek(1) === '"' && this.peek(2) === '"';
        this.advance(multiline ? 3 : 1);
        var out = '';
        if (multiline && this.peek() === '\n') this.advance(1);
        while (!this.eof()) {
            var ch = this.peek();
            if (ch === '"') {
                if (multiline) {
                    if (this.peek(1) === '"' && this.peek(2) === '"') {
                        this.advance(3);
                        return out;
                    }
                    out += '"';
                    this.advance(1);
                    continue;
                }
                this.advance(1);
                return out;
            }
            if (ch === '\\') {
                var mark = this.mark();
                this.advance(1);
                var esc = this.peek();
                if (esc === '\n' || esc === '\r') {
                    // 行尾续行：吃掉后续空白
                    while (!this.eof() && (this.peek() === ' ' || this.peek() === '\t' || this.peek() === '\n' || this.peek() === '\r')) this.advance(1);
                    continue;
                }
                if (esc === 'u' || esc === 'U') {
                    var len = esc === 'u' ? 4 : 8;
                    var hex = this.src.substr(this.i + 1, len);
                    if (!new RegExp('^[0-9A-Fa-f]{' + len + '}$').test(hex)) throw confError('toml-bad-escape', mark);
                    out += String.fromCodePoint(parseInt(hex, 16));
                    this.advance(1 + len);
                    continue;
                }
                if (!(esc in TOML_ESCAPES)) throw confError('toml-bad-escape', mark);
                out += TOML_ESCAPES[esc];
                this.advance(1);
                continue;
            }
            out += ch;
            this.advance(1);
        }
        throw confError('toml-unclosed');
    };

    TomlScanner.prototype.readLiteralString = function () {
        var multiline = this.peek(1) === "'" && this.peek(2) === "'";
        this.advance(multiline ? 3 : 1);
        var out = '';
        if (multiline && this.peek() === '\n') this.advance(1);
        while (!this.eof()) {
            var ch = this.peek();
            if (ch === "'") {
                if (multiline) {
                    if (this.peek(1) === "'" && this.peek(2) === "'") {
                        this.advance(3);
                        return out;
                    }
                    out += "'";
                    this.advance(1);
                    continue;
                }
                this.advance(1);
                return out;
            }
            out += ch;
            this.advance(1);
        }
        throw confError('toml-unclosed');
    };

    var TOML_BARE_KEY = /^[A-Za-z0-9_-]+/;
    var TOML_INT = /^[+-]?(?:0x[0-9A-Fa-f](?:_?[0-9A-Fa-f])*|0o[0-7](?:_?[0-7])*|0b[01](?:_?[01])*|[+-]?(?:0|[1-9](?:_?\d)*))$/;
    var TOML_FLOAT = /^[+-]?(?:(?:0|[1-9](?:_?\d)*)(?:\.\d(?:_?\d)*)?(?:[eE][+-]?\d(?:_?\d)*)?|inf|nan)$/i;
    var TOML_DATETIME = /^\d{4}-\d{2}-\d{2}(?:[Tt ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:[Zz]|[+-]\d{2}:\d{2})?)?$|^\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/;

    function tomlScalars(token, mark) {
        var t = token.trim();
        if (!t) throw confError('toml-bad-value', mark);
        if (t === 'true') return true;
        if (t === 'false') return false;
        if (TOML_DATETIME.test(t)) return t; // JSON 没有日期类型，按字符串往返
        if (TOML_INT.test(t)) {
            var normalized = t.replace(/_/g, '');
            if (/^0x/i.test(normalized)) return parseInt(normalized.slice(2), 16);
            if (/^0o/i.test(normalized)) return parseInt(normalized.slice(2), 8);
            if (/^0b/i.test(normalized)) return parseInt(normalized.slice(2), 2);
            var intVal = Number(normalized);
            if (!isNaN(intVal)) return intVal;
        }
        if (TOML_FLOAT.test(t)) {
            if (/^[-+]?inf$/i.test(t)) return t.indexOf('-') === 0 ? -Infinity : Infinity;
            if (/^nan$/i.test(t)) return NaN;
            var floatVal = Number(t.replace(/_/g, ''));
            if (!isNaN(floatVal)) return floatVal;
        }
        throw confError('toml-bad-value', mark);
    }

    function parseToml(text) {
        var src = stripBom(text);
        if (!src.trim()) return {};
        var sc = new TomlScanner(src);
        var root = {};
        var explicit = typeof WeakSet === 'function' ? new WeakSet() : { add: function () {}, has: function () { return false; } };
        var current = root;

        function keyPath(allowSpaces) {
            var path = [];
            for (;;) {
                if (allowSpaces) sc.skipInline();
                var mark = sc.mark();
                var ch = sc.peek();
                var segment;
                if (ch === '"') segment = sc.readBasicString();
                else if (ch === "'") segment = sc.readLiteralString();
                else {
                    var m = TOML_BARE_KEY.exec(sc.rest());
                    if (!m) throw confError('toml-bad-key', mark);
                    segment = m[0];
                    sc.advance(m[0].length);
                }
                path.push(segment);
                if (allowSpaces) sc.skipInline();
                if (sc.peek() === '.') {
                    sc.advance(1);
                    continue;
                }
                return path;
            }
        }

        /** 沿路径取（或建）容器；最后一段是 [[数组表]] 时 push 一个新元素。 */
        function resolve(path, asArrayTable) {
            var node = root;
            for (var i = 0; i < path.length; i++) {
                var key = path[i];
                var isLast = i === path.length - 1;
                var child = node[key];

                if (isLast && asArrayTable) {
                    if (child === undefined) {
                        child = [];
                        node[key] = child;
                    }
                    if (!Array.isArray(child)) throw confError('toml-dup-table', sc.mark());
                    var fresh = {};
                    child.push(fresh);
                    explicit.add(fresh);
                    return fresh;
                }
                if (child === undefined) {
                    child = {};
                    node[key] = child;
                    if (isLast) explicit.add(child);
                } else if (Array.isArray(child)) {
                    if (!child.length) throw confError('toml-dup-table', sc.mark());
                    var last = child[child.length - 1];
                    if (!isPlainObject(last)) throw confError('toml-dup-table', sc.mark());
                    if (isLast && explicit.has(last)) throw confError('toml-dup-table', sc.mark());
                    node = last;
                    continue;
                } else if (isPlainObject(child)) {
                    if (isLast) {
                        if (explicit.has(child)) throw confError('toml-dup-table', sc.mark());
                        explicit.add(child);
                    }
                } else {
                    throw confError('toml-dup-table', sc.mark());
                }
                node = child;
            }
            return node;
        }

        function readValue() {
            var ch = sc.peek();
            if (ch === '"') return sc.readBasicString();
            if (ch === "'") return sc.readLiteralString();
            if (ch === '[') return readArray();
            if (ch === '{') return readInlineTable();
            var start = sc.i;
            // 裸值不会含 , ] } —— 遇到就停，否则 inline table / 数组里的值会吃到行尾
            while (!sc.eof() && sc.peek() !== '\n' && sc.peek() !== '#' && ',]}'.indexOf(sc.peek()) < 0) sc.advance(1);
            var token = sc.src.slice(start, sc.i);
            return tomlScalars(token, { line: sc.line, column: start });
        }

        function readArray() {
            var mark = sc.mark();
            sc.advance(1); // [
            var arr = [];
            for (;;) {
                sc.skipAll();
                if (sc.eof()) throw confError('toml-unclosed', mark);
                if (sc.peek() === ']') {
                    sc.advance(1);
                    return arr;
                }
                arr.push(readValue());
                sc.skipAll();
                if (sc.eof()) throw confError('toml-unclosed', mark);
                if (sc.peek() === ',') {
                    sc.advance(1);
                    continue;
                }
                if (sc.peek() === ']') {
                    sc.advance(1);
                    return arr;
                }
                throw confError('toml-bad-array', sc.mark());
            }
        }

        function readInlineTable() {
            var mark = sc.mark();
            sc.advance(1); // {
            var table = {};
            sc.skipInline();
            if (sc.peek() === '}') {
                sc.advance(1);
                return table;
            }
            for (;;) {
                var path = keyPath(true);
                if (sc.peek() !== '=') throw confError('toml-bad-key', sc.mark());
                sc.advance(1);
                sc.skipInline();
                var value = readValue();
                var host = table;
                for (var i = 0; i < path.length - 1; i++) {
                    if (!isPlainObject(host[path[i]])) host[path[i]] = {};
                    host = host[path[i]];
                }
                host[path[path.length - 1]] = value;
                sc.skipInline();
                if (sc.peek() === ',') {
                    sc.advance(1);
                    sc.skipInline();
                    continue;
                }
                if (sc.peek() === '}') {
                    sc.advance(1);
                    return table;
                }
                throw confError('toml-bad-table', mark);
            }
        }

        for (;;) {
            sc.skipAll();
            if (sc.eof()) break;
            var ch = sc.peek();
            if (ch === '[') {
                var headerMark = sc.mark();
                var arrayTable = sc.peek(1) === '[';
                sc.advance(arrayTable ? 2 : 1);
                var path = keyPath(true);
                sc.skipInline();
                if (arrayTable) {
                    if (sc.peek() !== ']') throw confError('toml-bad-table', headerMark);
                    sc.advance(1);
                    if (sc.peek() !== ']') throw confError('toml-bad-table', headerMark);
                    sc.advance(1);
                } else {
                    if (sc.peek() !== ']') throw confError('toml-bad-table', headerMark);
                    sc.advance(1);
                }
                current = resolve(path, arrayTable);
                continue;
            }
            var kv = keyPath(false);
            sc.skipInline(); // 键与 = 之间允许空格，键内部不允许
            if (sc.peek() !== '=') throw confError('toml-bad-key', sc.mark());
            sc.advance(1);
            sc.skipInline();
            var value = readValue();
            var host = current;
            for (var i = 0; i < kv.length - 1; i++) {
                if (!isPlainObject(host[kv[i]])) host[kv[i]] = {};
                host = host[kv[i]];
            }
            host[kv[kv.length - 1]] = value;
        }

        return root;
    }

    function tomlKey(key) {
        return /^[A-Za-z0-9_-]+$/.test(key) ? key : JSON.stringify(key);
    }

    function tomlString(value) {
        var out = '"';
        for (var i = 0; i < value.length; i++) {
            var ch = value.charAt(i);
            if (ch === '"') out += '\\"';
            else if (ch === '\\') out += '\\\\';
            else if (ch === '\b') out += '\\b';
            else if (ch === '\t') out += '\\t';
            else if (ch === '\n') out += '\\n';
            else if (ch === '\f') out += '\\f';
            else if (ch === '\r') out += '\\r';
            else if (ch.charCodeAt(0) < 0x20 || ch.charCodeAt(0) === 0x7f) {
                out += '\\u' + ('0000' + ch.charCodeAt(0).toString(16)).slice(-4);
            } else out += ch;
        }
        return out + '"';
    }

    function tomlScalar(value) {
        if (value === null || value === undefined) return null;
        if (typeof value === 'boolean') return value ? 'true' : 'false';
        if (typeof value === 'number') {
            if (value === Infinity) return 'inf';
            if (value === -Infinity) return '-inf';
            if (value !== value) return 'nan';
            return String(value);
        }
        return tomlString(String(value));
    }

    function tomlInlineValue(value) {
        if (Array.isArray(value)) {
            var parts = [];
            for (var i = 0; i < value.length; i++) {
                var item = tomlInlineValue(value[i]);
                if (item === null) continue; // TOML 没有 null，跳过
                parts.push(item);
            }
            return '[' + parts.join(', ') + ']';
        }
        if (isPlainObject(value)) {
            var entries = [];
            Object.keys(value).forEach(function (key) {
                var inner = tomlInlineValue(value[key]);
                if (inner === null) return;
                entries.push(tomlKey(key) + ' = ' + inner);
            });
            return '{' + entries.join(', ') + '}';
        }
        return tomlScalar(value);
    }

    /** 输出一张表：先标量，再子表，最后数组表（保证 [[x]] 前面一定有父表） */
    function emitToml(obj, path, lines, isArrayTable) {
        var scalars = [];
        var tables = [];
        var arrayTables = [];
        Object.keys(obj).forEach(function (key) {
            var value = obj[key];
            if (value === null || value === undefined) return; // TOML 没有 null
            if (Array.isArray(value)) {
                var allObjects = value.length > 0 && value.every(isPlainObject);
                (allObjects ? arrayTables : scalars).push(key);
            } else if (isPlainObject(value)) {
                tables.push(key);
            } else {
                scalars.push(key);
            }
        });

        if (path.length) {
            lines.push(isArrayTable ? '[[' + path.map(tomlKey).join('.') + ']]' : '[' + path.map(tomlKey).join('.') + ']');
        }
        scalars.forEach(function (key) {
            var rendered = tomlInlineValue(obj[key]);
            if (rendered === null) return;
            lines.push(tomlKey(key) + ' = ' + rendered);
        });
        tables.forEach(function (key) {
            lines.push('');
            emitToml(obj[key], path.concat([key]), lines, false);
        });
        arrayTables.forEach(function (key) {
            obj[key].forEach(function (item) {
                lines.push('');
                emitToml(item, path.concat([key]), lines, true);
            });
        });
    }

    function serializeToml(obj) {
        obj = asObject(obj, 'toml-need-object');
        var lines = [];
        emitToml(obj, [], lines, false);
        return lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '') + '\n';
    }

    /* ==================================================================== *
     * INI
     * ==================================================================== */

    function parseIni(text) {
        var result = {};
        var current = result;
        var lines = stripBom(text).split(/\r?\n/);
        for (var i = 0; i < lines.length; i++) {
            if (i >= LIMITS.rows) throw confError('conf-too-many-rows', { line: i });
            var line = lines[i].trim();
            if (!line || line.charAt(0) === ';' || line.charAt(0) === '#') continue;

            if (line.charAt(0) === '[') {
                var end = line.lastIndexOf(']');
                if (end < 0) throw confError('ini-bad-section', { line: i });
                var name = line.slice(1, end).trim();
                // section 头永远从根开始解析（[a] 之后再 [b] 是平级，不是嵌进 a）；
                // 支持 [a.b] 这种嵌套写法
                current = result;
                name.split('.').forEach(function (seg) {
                    if (!isPlainObject(current[seg])) current[seg] = {};
                    current = current[seg];
                });
                continue;
            }

            var sep = line.search(/[=:]/);
            if (sep <= 0) throw confError('ini-bad-line', { line: i });
            var key = line.slice(0, sep).trim();
            var value = line.slice(sep + 1).trim();
            // 行尾注释只在裸值后面认（INI 里 # 也可能是值的一部分，取最常见约定）
            var hash = value.indexOf(' #');
            if (hash > 0) value = value.slice(0, hash).trim();
            current[key] = value;
        }
        return result;
    }

    function iniValue(value) {
        if (value === null || value === undefined) return '';
        if (Array.isArray(value)) {
            // INI 里数组惯例是逗号连接；对象数组才退成 JSON
            var allScalars = value.every(function (item) { return item === null || !isPlainObject(item) && !Array.isArray(item); });
            return allScalars ? value.join(',') : JSON.stringify(value);
        }
        if (isPlainObject(value)) return JSON.stringify(value);
        return String(value).replace(/[\r\n]+/g, ' ');
    }

    /**
     * TOML / INI / .env / query / headers / cookie 的文档根都必须是"键值表"，
     * 表达不了裸数组。CSV / HTML 解析出来的正好是数组，这里统一包一层 items，
     * 让"任意源 → 任意目标"的矩阵能跑通；非数组非对象才是真的转不了。
     */
    function asObject(obj, code) {
        if (isPlainObject(obj)) return obj;
        if (Array.isArray(obj)) return { items: obj };
        throw confError(code);
    }

    /**
     * 先写标量再写子节——INI 里 [x] 之后的行都归属 x，
     * 所以子节必须排在标量后面，否则后面的键会被解析进子节。
     */
    function emitIni(obj, path, lines) {
        var scalars = [];
        var sections = [];
        Object.keys(obj).forEach(function (key) {
            var value = obj[key];
            if (value === null || value === undefined) return;
            (isPlainObject(value) ? sections : scalars).push(key);
        });
        scalars.forEach(function (key) {
            lines.push(key + '=' + iniValue(obj[key]));
        });
        sections.forEach(function (key) {
            lines.push('');
            lines.push('[' + path.concat([key]).join('.') + ']');
            emitIni(obj[key], path.concat([key]), lines);
        });
    }

    function serializeIni(obj) {
        obj = asObject(obj, 'ini-need-object');
        var lines = [];
        emitIni(obj, [], lines);
        return lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '') + '\n';
    }

    /* ==================================================================== *
     * .env
     * ==================================================================== */

    function parseEnv(text) {
        var result = {};
        var lines = stripBom(text).split(/\r?\n/);
        for (var i = 0; i < lines.length; i++) {
            if (i >= LIMITS.rows) throw confError('conf-too-many-rows', { line: i });
            var line = lines[i].trim();
            if (!line || line.charAt(0) === '#') continue;
            if (line.indexOf('export ') === 0) line = line.slice(7).trim();

            var eq = line.indexOf('=');
            if (eq <= 0) throw confError('env-bad-line', { line: i });
            var key = line.slice(0, eq).trim();
            var value = line.slice(eq + 1).trim();

            if (value.charAt(0) === '"') {
                var end = value.lastIndexOf('"');
                if (end < 1) throw confError('env-bad-quote', { line: i });
                value = value.slice(1, end).replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
            } else if (value.charAt(0) === "'") {
                var endQ = value.lastIndexOf("'");
                if (endQ < 1) throw confError('env-bad-quote', { line: i });
                value = value.slice(1, endQ);
            } else {
                var hash = value.indexOf(' #');
                if (hash > 0) value = value.slice(0, hash).trim();
            }
            result[key] = value;
        }
        return result;
    }

    function serializeEnv(obj) {
        obj = asObject(obj, 'env-need-object');
        var flat = flattenObject(obj);
        var lines = [];
        Object.keys(flat).forEach(function (key) {
            var value = flat[key];
            if (value === null || value === undefined) value = '';
            if (isPlainObject(value) || Array.isArray(value)) value = JSON.stringify(value);
            var text = String(value);
            var needsQuote = /[\s"'\\#$`]/.test(text) || text === '';
            if (needsQuote) text = '"' + text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r') + '"';
            lines.push(key + '=' + text);
        });
        return lines.join('\n') + '\n';
    }

    /* ==================================================================== *
     * CSV / TSV
     * ==================================================================== */

    function parseDelimited(text, delim) {
        var src = stripBom(text);
        if (!src.trim()) return [];

        var rows = [];
        var row = [];
        var field = '';
        var inQuotes = false;
        var cells = 0;
        var i = 0;

        while (i < src.length) {
            var ch = src.charAt(i);
            if (inQuotes) {
                if (ch === '"') {
                    if (src.charAt(i + 1) === '"') {
                        field += '"';
                        i += 2;
                        continue;
                    }
                    inQuotes = false;
                    i++;
                    continue;
                }
                field += ch;
                i++;
                continue;
            }
            if (ch === '"' && field === '') {
                inQuotes = true;
                i++;
                continue;
            }
            if (ch === delim) {
                row.push(field);
                field = '';
                i++;
                continue;
            }
            if (ch === '\r') {
                i++;
                continue;
            }
            if (ch === '\n') {
                row.push(field);
                if (row.length > 1 || row[0] !== '') rows.push(row);
                row = [];
                field = '';
                i++;
                if (rows.length >= LIMITS.rows) throw confError('conf-too-many-rows', { line: rows.length });
                continue;
            }
            field += ch;
            i++;
        }
        if (inQuotes) throw confError('csv-bad-quote');
        if (field !== '' || row.length) {
            row.push(field);
            rows.push(row);
        }

        if (!rows.length) return [];
        var header = rows[0];
        var out = [];
        for (var r = 1; r < rows.length; r++) {
            var line = rows[r];
            var flat = {};
            for (var c = 0; c < header.length; c++) {
                cells++;
                if (cells > LIMITS.cells) throw confError('conf-too-many-cells');
                var cell = cellValue(line[c] === undefined ? '' : line[c]);
                // 空单元格一律跳过：CSV 区分不了 null 和空串，写进去只会让
                // 其它行的同一个键变成 {0: '', 1: ''} 之类的怪结构
                if (cell === '' || cell === null) continue;
                flat[header[c]] = cell;
            }
            out.push(unflattenObject(flat));
        }
        return out;
    }

    /** CSV 里没有类型，但开发者期望 1 是数字、true 是布尔；前导零与超长数字保持字符串 */
    function cellValue(raw) {
        var s = String(raw);
        if (s === '') return '';
        if (s === 'true') return true;
        if (s === 'false') return false;
        if (s === 'null') return null;
        if (/^-?(?:0|[1-9]\d*)$/.test(s)) {
            var intVal = Number(s);
            if (Number.isSafeInteger(intVal)) return intVal;
            return s;
        }
        if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?[eE][+-]?\d+$/.test(s) || /^-?(?:0|[1-9]\d*)\.\d+$/.test(s)) {
            var floatVal = Number(s);
            if (isFinite(floatVal)) return floatVal;
        }
        return s;
    }

    function quoteCell(value, delim) {
        var s = value === null || value === undefined ? '' : String(value);
        if (s.indexOf(delim) >= 0 || s.indexOf('"') >= 0 || /[\r\n]/.test(s)) {
            return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
    }

    function serializeDelimited(obj, delim) {
        var list = Array.isArray(obj) ? obj : [obj];
        if (!list.length) return '';
        var flat = [];
        for (var i = 0; i < list.length; i++) {
            if (!isPlainObject(list[i])) throw confError('csv-need-object');
            flat.push(flattenObject(list[i], '', null, true));
        }

        var columns = [];
        var seen = Object.create(null);
        flat.forEach(function (row) {
            Object.keys(row).forEach(function (key) {
                if (seen[key]) return;
                seen[key] = 1;
                columns.push(key);
            });
        });
        if (columns.length > LIMITS.cols) throw confError('conf-too-many-cols');

        var lines = [columns.map(function (c) { return quoteCell(c, delim); }).join(delim)];
        flat.forEach(function (row) {
            lines.push(columns.map(function (c) {
                var value = row[c];
                if (value === null || value === undefined) return '';
                if (isPlainObject(value) || Array.isArray(value)) value = JSON.stringify(value);
                return quoteCell(value, delim);
            }).join(delim));
        });
        return lines.join('\n') + '\n';
    }

    /* ==================================================================== *
     * Query string / HTTP headers / Cookie
     * ==================================================================== */

    function decodeLoose(text) {
        try {
            return decodeURIComponent(String(text).replace(/\+/g, ' '));
        } catch (e) {
            return String(text);
        }
    }

    function parseQuery(text) {
        var src = stripBom(text).trim();
        if (!src) return {};
        var qIndex = src.indexOf('?');
        if (qIndex >= 0) src = src.slice(qIndex + 1);
        var flat = {};
        src.split('&').forEach(function (pair) {
            if (!pair) return;
            var eq = pair.indexOf('=');
            var key = eq < 0 ? decodeLoose(pair) : decodeLoose(pair.slice(0, eq));
            var value = eq < 0 ? '' : decodeLoose(pair.slice(eq + 1));
            if (Object.prototype.hasOwnProperty.call(flat, key)) {
                if (Array.isArray(flat[key])) flat[key].push(value);
                else flat[key] = [flat[key], value];
            } else {
                flat[key] = value;
            }
        });
        return unflattenObject(flat);
    }

    function serializeQuery(obj) {
        obj = asObject(obj, 'query-need-object');
        var parts = [];
        // 数组用重复键（a=1&a=2）而不是 a[0]=1 —— 这正是 parseQuery 认得回去的写法
        (function walk(value, prefix) {
            if (Array.isArray(value)) {
                value.forEach(function (item) { walk(item, prefix); });
                return;
            }
            if (isPlainObject(value)) {
                Object.keys(value).forEach(function (key) {
                    walk(value[key], prefix ? prefix + '.' + key : key);
                });
                return;
            }
            var text = value === null || value === undefined ? '' : String(value);
            parts.push(encodeURIComponent(prefix) + '=' + encodeURIComponent(text));
        })(obj, '');
        return parts.join('&') + '\n';
    }

    var HTTP_STATUS_LINE = /^(?:HTTP\/|[A-Z]+ [^\s]+ HTTP\/)/i;

    function parseHeaders(text) {
        var result = {};
        var lines = stripBom(text).split(/\r?\n/);
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line || line.charAt(0) === '#') continue;
            if (HTTP_STATUS_LINE.test(line)) continue; // GET /x HTTP/1.1 / HTTP/1.1 200 OK
            var colon = line.indexOf(':');
            if (colon <= 0) throw confError('headers-bad-line', { line: i });
            var key = line.slice(0, colon).trim();
            var value = line.slice(colon + 1).trim();
            if (Object.prototype.hasOwnProperty.call(result, key)) {
                if (Array.isArray(result[key])) result[key].push(value);
                else result[key] = [result[key], value];
            } else {
                result[key] = value;
            }
        }
        return result;
    }

    function serializeHeaders(obj) {
        obj = asObject(obj, 'headers-need-object');
        var lines = [];
        // 数组 = 重复头（Set-Cookie 出两行），嵌套对象 = dotted key
        (function walk(value, prefix) {
            if (Array.isArray(value)) {
                value.forEach(function (item) { walk(item, prefix); });
                return;
            }
            if (isPlainObject(value)) {
                Object.keys(value).forEach(function (key) {
                    walk(value[key], prefix ? prefix + '.' + key : key);
                });
                return;
            }
            if (value === null || value === undefined) return;
            lines.push(prefix + ': ' + String(value).replace(/[\r\n]+/g, ' '));
        })(obj, '');
        return lines.join('\n') + '\n';
    }

    function parseCookie(text) {
        var result = {};
        stripBom(text).split(';').forEach(function (pair) {
            var piece = pair.trim();
            if (!piece) return;
            var eq = piece.indexOf('=');
            if (eq < 0) {
                result[piece] = true; // HttpOnly / Secure 这类标记
                return;
            }
            var key = piece.slice(0, eq).trim();
            var value = piece.slice(eq + 1).trim();
            if ((value.charAt(0) === '"' && value.slice(-1) === '"') || (value.charAt(0) === "'" && value.slice(-1) === "'")) {
                value = value.slice(1, -1);
            } else {
                value = decodeLoose(value);
            }
            result[key] = value;
        });
        return result;
    }

    function serializeCookie(obj) {
        obj = flattenObject(asObject(obj, 'cookie-need-object'));
        var parts = [];
        Object.keys(obj).forEach(function (key) {
            var value = obj[key];
            if (value === true) {
                parts.push(key);
                return;
            }
            if (value === null || value === undefined) value = '';
            if (isPlainObject(value) || Array.isArray(value)) value = JSON.stringify(value);
            parts.push(key + '=' + encodeURIComponent(String(value)));
        });
        return parts.join('; ') + '\n';
    }

    /* ==================================================================== *
     * HTML table
     * ==================================================================== */

    function escapeHtml(text) {
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function unescapeHtml(text) {
        return String(text)
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#0*39;|&apos;/g, "'")
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&');
    }

    function jsonToHtmlTable(obj) {
        var list = Array.isArray(obj) ? obj : [obj];
        if (!list.length) return '<table>\n</table>\n';
        var flat = [];
        for (var i = 0; i < list.length; i++) {
            if (!isPlainObject(list[i])) throw confError('html-need-object');
            flat.push(flattenObject(list[i], '', null, true));
        }
        var columns = [];
        var seen = Object.create(null);
        flat.forEach(function (row) {
            Object.keys(row).forEach(function (key) {
                if (seen[key]) return;
                seen[key] = 1;
                columns.push(key);
            });
        });

        var out = ['<table>'];
        out.push('  <thead>');
        out.push('    <tr>' + columns.map(function (c) { return '<th>' + escapeHtml(c) + '</th>'; }).join('') + '</tr>');
        out.push('  </thead>');
        out.push('  <tbody>');
        flat.forEach(function (row) {
            out.push('    <tr>' + columns.map(function (c) {
                var value = row[c];
                if (value === null || value === undefined) value = '';
                if (isPlainObject(value) || Array.isArray(value)) value = JSON.stringify(value);
                return '<td>' + escapeHtml(value) + '</td>';
            }).join('') + '</tr>');
        });
        out.push('  </tbody>');
        out.push('</table>');
        return out.join('\n') + '\n';
    }

    function htmlTableToJson(text) {
        var src = stripBom(text);
        var rows = [];
        var trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
        var trMatch;
        while ((trMatch = trRe.exec(src)) !== null) {
            var cells = [];
            var cellRe = /<(t[dh])\b[^>]*>([\s\S]*?)<\/\1>/gi;
            var cellMatch;
            while ((cellMatch = cellRe.exec(trMatch[1])) !== null) {
                var raw = cellMatch[2].replace(/<[^>]*>/g, '');
                cells.push(unescapeHtml(raw).trim());
            }
            if (cells.length) rows.push(cells);
            if (rows.length >= LIMITS.rows) throw confError('conf-too-many-rows', { line: rows.length });
        }
        if (!rows.length) return [];

        var hasHeader = /<th\b/i.test(src);
        var header = hasHeader ? rows[0] : null;
        var body = hasHeader ? rows.slice(1) : rows;
        if (!header) {
            header = [];
            for (var c = 0; c < rows[0].length; c++) header.push('column' + (c + 1));
            body = rows;
        }

        var out = [];
        body.forEach(function (line) {
            var flat = {};
            for (var c = 0; c < header.length; c++) {
                var cell = cellValue(line[c] === undefined ? '' : line[c]);
                if (cell === '' || cell === null) continue;
                flat[header[c]] = cell;
            }
            out.push(unflattenObject(flat));
        });
        return out;
    }

    /* ==================================================================== *
     * 分发
     * ==================================================================== */

    function checkSize(text) {
        if (String(text == null ? '' : text).length > LIMITS.chars) throw confError('conf-too-large');
    }

    function parseData(text, format) {
        checkSize(text);
        switch (format) {
            case 'toml': return parseToml(text);
            case 'ini': return parseIni(text);
            case 'env': return parseEnv(text);
            case 'csv': return parseDelimited(text, ',');
            case 'tsv': return parseDelimited(text, '\t');
            case 'query': return parseQuery(text);
            case 'headers': return parseHeaders(text);
            case 'cookie': return parseCookie(text);
            case 'html': return htmlTableToJson(text);
            default: throw confError('conf-unknown-format');
        }
    }

    function serializeData(obj, format) {
        switch (format) {
            case 'toml': return serializeToml(obj);
            case 'ini': return serializeIni(obj);
            case 'env': return serializeEnv(obj);
            case 'csv': return serializeDelimited(obj, ',');
            case 'tsv': return serializeDelimited(obj, '\t');
            case 'query': return serializeQuery(obj);
            case 'headers': return serializeHeaders(obj);
            case 'cookie': return serializeCookie(obj);
            case 'html': return jsonToHtmlTable(obj);
            default: throw confError('conf-unknown-format');
        }
    }

    return {
        FORMATS: FORMATS,
        LIMITS: LIMITS,
        parseData: parseData,
        serializeData: serializeData,
        /* 单独导出便于写单测 */
        parseToml: parseToml,
        serializeToml: serializeToml,
        parseIni: parseIni,
        serializeIni: serializeIni,
        parseEnv: parseEnv,
        serializeEnv: serializeEnv,
        parseDelimited: parseDelimited,
        serializeDelimited: serializeDelimited,
        parseQuery: parseQuery,
        serializeQuery: serializeQuery,
        parseHeaders: parseHeaders,
        serializeHeaders: serializeHeaders,
        parseCookie: parseCookie,
        serializeCookie: serializeCookie,
        jsonToHtmlTable: jsonToHtmlTable,
        htmlTableToJson: htmlTableToJson,
        flattenObject: flattenObject,
        unflattenObject: unflattenObject
    };
});
