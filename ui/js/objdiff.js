/*
 * 结构化差异（纯函数，无 DOM 依赖）
 * ----------------------------------------------------------------
 * 页面通过经典 <script> 加载，挂到 window.DBXObjDiff。
 * 回归用例：node tests/objdiff.test.js
 *
 * 逐行 diff 只能告诉你「第 5 行变了」，用户还得自己找是哪个字段变了。
 * 这里先把两侧文本解析成对象树，再按 JSON Pointer 逐节点比较，得到：
 *   [{ pointer:'/products/0/price', type:'change', from:4999, to:5299 }]
 *
 * serializeTracked() 负责把对象重新打印成 2 空格缩进的 JSON，
 * 同时记录每个节点的行列范围 —— 页面据此只高亮「真正变了的那个值」，
 * 而不是整块标红。
 */
(function (root) {
    'use strict';

    var hasOwn = Object.prototype.hasOwnProperty;

    function isObject(value) {
        return value !== null && typeof value === 'object';
    }

    function kindOf(value) {
        if (value === null) return 'null';
        if (Array.isArray(value)) return 'array';
        return typeof value;
    }

    /* JSON Pointer 转义：~ -> ~0，/ -> ~1 */
    function escapeToken(token) {
        return String(token).replace(/~/g, '~0').replace(/\//g, '~1');
    }

    function sameLeaf(a, b) {
        if (kindOf(a) !== kindOf(b)) return false;
        if (isObject(a)) return false;
        if (typeof a === 'number' && typeof b === 'number') {
            return a === b || (isNaN(a) && isNaN(b));
        }
        return a === b;
    }

    function pushChange(out, change) {
        out.push(change);
    }

    function walk(a, b, pointer, out) {
        var ta = kindOf(a);
        var tb = kindOf(b);

        if (!isObject(a) || !isObject(b)) {
            if (!sameLeaf(a, b)) {
                pushChange(out, { pointer: pointer || '/', type: 'change', from: a, to: b });
            }
            return;
        }

        var aArr = Array.isArray(a);
        var bArr = Array.isArray(b);
        if (aArr !== bArr) {
            pushChange(out, { pointer: pointer || '/', type: 'change', from: a, to: b });
            return;
        }

        var i;
        if (aArr) {
            var len = Math.max(a.length, b.length);
            for (i = 0; i < len; i++) {
                var childPointer = pointer + '/' + i;
                if (i >= a.length) {
                    pushChange(out, { pointer: childPointer, type: 'add', to: b[i] });
                } else if (i >= b.length) {
                    pushChange(out, { pointer: childPointer, type: 'remove', from: a[i] });
                } else {
                    walk(a[i], b[i], childPointer, out);
                }
            }
            return;
        }

        var keys = Object.keys(a);
        Object.keys(b).forEach(function (key) {
            if (!hasOwn.call(a, key)) keys.push(key);
        });

        for (i = 0; i < keys.length; i++) {
            var key = keys[i];
            var p = pointer + '/' + escapeToken(key);
            var inA = hasOwn.call(a, key);
            var inB = hasOwn.call(b, key);
            if (!inB) {
                pushChange(out, { pointer: p, type: 'remove', from: a[key], key: key });
            } else if (!inA) {
                pushChange(out, { pointer: p, type: 'add', to: b[key], key: key });
            } else {
                walk(a[key], b[key], p, out);
            }
        }
    }

    /**
     * 比较两棵对象树。
     * @param {*} a 旧值
     * @param {*} b 新值
     * @returns {{changes: Array, stats: {added:number, removed:number, changed:number, total:number}}}
     */
    function diffObjects(a, b) {
        var changes = [];
        walk(a, b, '', changes);
        return { changes: changes, stats: countStats(changes) };
    }

    function countStats(changes) {
        var stats = { added: 0, removed: 0, changed: 0, total: changes.length };
        for (var i = 0; i < changes.length; i++) {
            if (changes[i].type === 'add') stats.added++;
            else if (changes[i].type === 'remove') stats.removed++;
            else stats.changed++;
        }
        return stats;
    }

    /* ------------------------------------------------------------ 打印并记录位置 */

    function Builder() {
        this.lines = [''];
        this.line = 0;
        this.col = 0;
    }
    Builder.prototype.write = function (text) {
        this.lines[this.line] += text;
        this.col += text.length;
    };
    Builder.prototype.newline = function () {
        this.line++;
        this.col = 0;
        this.lines.push('');
    };
    Builder.prototype.text = function () {
        return this.lines.join('\n');
    };

    function scalarText(value) {
        return JSON.stringify(value);
    }

    function pad(width) {
        return new Array(width + 1).join(' ');
    }

    function emit(builder, value, pointer, indent, map) {
        if (Array.isArray(value)) {
            if (!value.length) {
                var emptyArrStart = builder.col;
                builder.write('[]');
                map[pointer] = { line: builder.line, col: emptyArrStart, endCol: builder.col };
                return;
            }
            var arrLine = builder.line;
            var arrCol = builder.col;
            builder.write('[');
            for (var i = 0; i < value.length; i++) {
                builder.newline();
                builder.write(pad(indent + 2));
                emit(builder, value[i], pointer + '/' + i, indent + 2, map);
                if (i < value.length - 1) builder.write(',');
            }
            builder.newline();
            builder.write(pad(indent));
            builder.write(']');
            // 容器只记起始括号的位置：整块新增/删除时用它作为高亮锚点
            map[pointer] = { line: arrLine, col: arrCol, endCol: arrCol + 1 };
            return;
        }

        if (isObject(value)) {
            var keys = Object.keys(value);
            if (!keys.length) {
                var emptyObjStart = builder.col;
                builder.write('{}');
                map[pointer] = { line: builder.line, col: emptyObjStart, endCol: builder.col };
                return;
            }
            var objLine = builder.line;
            var objCol = builder.col;
            builder.write('{');
            for (var k = 0; k < keys.length; k++) {
                var key = keys[k];
                builder.newline();
                builder.write(pad(indent + 2));
                builder.write(JSON.stringify(key) + ': ');
                emit(builder, value[key], pointer + '/' + escapeToken(key), indent + 2, map);
                if (k < keys.length - 1) builder.write(',');
            }
            builder.newline();
            builder.write(pad(indent));
            builder.write('}');
            map[pointer] = { line: objLine, col: objCol, endCol: objCol + 1 };
            return;
        }

        var startCol = builder.col;
        builder.write(scalarText(value));
        map[pointer] = { line: builder.line, col: startCol, endCol: builder.col };
    }

    /**
     * 按 JSON.stringify(obj, null, 2) 的格式打印，并给出每个 JSON Pointer 的行列范围。
     * @param {*} obj
     * @returns {{text: string, map: Object}}
     */
    function serializeTracked(obj) {
        var builder = new Builder();
        var map = Object.create(null);
        emit(builder, obj, '', 0, map);
        return { text: builder.text(), map: map };
    }

    /* 面板里展示的值：字符串不加引号，对象折叠成一行摘要 */
    function displayValue(value) {
        if (value === undefined) return '';
        if (value === null) return 'null';
        if (typeof value === 'string') return value;
        if (typeof value === 'number' || typeof value === 'boolean') return String(value);
        var text;
        try {
            text = JSON.stringify(value);
        } catch (e) {
            text = String(value);
        }
        if (text && text.length > 96) text = text.slice(0, 93) + '...';
        return text;
    }

    /* ------------------------------------------------------------ 原文位置扫描 */

    /**
     * 解析 JSON 文本，同时记录每个值的行列范围（不改动原文）。
     * 对比页直接标注用户自己那两份文本，不走「格式化后再比较」的弯路。
     * @param {string} text
     * @returns {{map: Object}}
     */
    function scanJson(text) {
        var pos = 0;
        var line = 0;
        var col = 0;
        var map = Object.create(null);

        function fail(message) {
            throw new SyntaxError(message + '（第 ' + (line + 1) + ' 行，第 ' + (col + 1) + ' 列）');
        }

        function skipWhitespace() {
            while (pos < text.length) {
                var ch = text[pos];
                if (ch === '\n') {
                    pos++;
                    line++;
                    col = 0;
                } else if (ch === ' ' || ch === '\t' || ch === '\r') {
                    pos++;
                    col++;
                } else {
                    break;
                }
            }
        }

        function recordContainer(pointer) {
            map[pointer] = { line: line, col: col, endLine: line, endCol: col + 1 };
        }

        function parseString() {
            var startLine = line;
            var startCol = col;
            pos++;
            col++;
            while (pos < text.length) {
                var ch = text[pos];
                if (ch === '\\') {
                    pos++;
                    col++;
                    if (text[pos] === 'u') {
                        pos += 5;
                        col += 5;
                    } else {
                        pos++;
                        col++;
                    }
                    continue;
                }
                if (ch === '\n') fail('字符串未结束');
                pos++;
                col++;
                if (ch === '"') {
                    return { line: startLine, col: startCol, endLine: startLine, endCol: col };
                }
            }
            fail('字符串未结束');
        }

        function parseNumber() {
            var startLine = line;
            var startCol = col;
            while (pos < text.length && '0123456789+-.eE'.indexOf(text[pos]) !== -1) {
                pos++;
                col++;
            }
            return { line: startLine, col: startCol, endLine: line, endCol: col };
        }

        function parseLiteral(word) {
            if (text.slice(pos, pos + word.length) !== word) fail('无法识别的值');
            var startLine = line;
            var startCol = col;
            pos += word.length;
            col += word.length;
            return { line: startLine, col: startCol, endLine: startLine, endCol: startCol + word.length };
        }

        function parseObject(pointer) {
            recordContainer(pointer);
            pos++;
            col++;
            skipWhitespace();
            if (text[pos] === '}') {
                pos++;
                col++;
                return;
            }
            while (true) {
                skipWhitespace();
                if (text[pos] !== '"') fail('对象的键必须是字符串');
                var keyStart = pos;
                parseString();
                var key = JSON.parse(text.slice(keyStart, pos));
                skipWhitespace();
                if (text[pos] !== ':') fail('缺少冒号');
                pos++;
                col++;
                parseValue(pointer + '/' + escapeToken(key));
                skipWhitespace();
                if (text[pos] === ',') {
                    pos++;
                    col++;
                    skipWhitespace();
                    continue;
                }
                if (text[pos] === '}') {
                    pos++;
                    col++;
                    return;
                }
                fail('对象未正确结束');
            }
        }

        function parseArray(pointer) {
            recordContainer(pointer);
            pos++;
            col++;
            skipWhitespace();
            if (text[pos] === ']') {
                pos++;
                col++;
                return;
            }
            var index = 0;
            while (true) {
                parseValue(pointer + '/' + index);
                index++;
                skipWhitespace();
                if (text[pos] === ',') {
                    pos++;
                    col++;
                    continue;
                }
                if (text[pos] === ']') {
                    pos++;
                    col++;
                    return;
                }
                fail('数组未正确结束');
            }
        }

        function parseValue(pointer) {
            skipWhitespace();
            var ch = text[pos];
            if (ch === undefined) fail('内容意外结束');
            if (ch === '{') return parseObject(pointer);
            if (ch === '[') return parseArray(pointer);
            if (ch === '"') {
                map[pointer] = parseString();
                return;
            }
            if (ch === 't') {
                map[pointer] = parseLiteral('true');
                return;
            }
            if (ch === 'f') {
                map[pointer] = parseLiteral('false');
                return;
            }
            if (ch === 'n') {
                map[pointer] = parseLiteral('null');
                return;
            }
            if (ch === '-' || (ch >= '0' && ch <= '9')) {
                map[pointer] = parseNumber();
                return;
            }
            fail('无法识别的字符 "' + ch + '"');
        }

        parseValue('');
        skipWhitespace();
        if (pos < text.length) fail('JSON 结束后仍有多余内容');

        return { map: map };
    }

    var API = {
        diffObjects: diffObjects,
        serializeTracked: serializeTracked,
        scanJson: scanJson,
        displayValue: displayValue,
        escapeToken: escapeToken
    };

    if (typeof module === 'object' && module.exports) module.exports = API;
    if (root) root.DBXObjDiff = API;
})(typeof window !== 'undefined' ? window : this);
