/*
 * JSONPath + jq (subset) query engine — pure functions, no DOM dependency.
 *
 * One parser handles both dialects, because the useful parts overlap almost
 * completely: `$.a.b[0]` and `.a.b[0]` mean the same thing. The style is
 * detected from the first character (`$` → JSONPath, otherwise jq) and only
 * decides which extras are accepted:
 *
 *   JSONPath : $  .name  ['name']  [0]  [-1]  [1:3]  [1:3:2]  [*]  .*  ..key
 *              [?(@.price < 10)]  union with ','
 *   jq       : .name  .name?  [0]  []  [1:3]  ..  pipe with '|'  union with ','
 *
 * Filters support the comparison operators == != < <= > >= and =~ (regex),
 * the boolean operators && || !, parentheses, and the two anchors @ (current
 * node) and $ (document root).
 *
 * Errors carry a `code` (never a hard-coded language string) plus `pos` so the
 * UI can translate them and point at the offending character.
 *
 * Loaded as a classic script in the plugin (window.DBXQuery) and as CommonJS
 * in tests.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.DBXQuery = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var LIMITS = {
        expr: 2000,      // 表达式长度
        results: 1000,   // 返回条数
        nodes: 200000,   // 递归下降时最多访问多少节点
        text: 2 * 1024 * 1024 // 输入 JSON 的字符上限
    };

    function isPlainObject(v) {
        return v !== null && typeof v === 'object' && !Array.isArray(v);
    }

    /** 错误只带 code（UI 查字典）与 pos（UI 定位） */
    function qError(code, pos) {
        var e = new Error(code);
        e.code = code;
        if (pos != null) e.pos = pos;
        return e;
    }

    /* ==================================================================== *
     * 1. 词法/语法分析
     * ==================================================================== */

    // 名字：标识符，或方括号里的单/双引号字符串
    var IDENT_RE = /[A-Za-z_$][A-Za-z0-9_$]*/;

    function Parser(src, style) {
        this.s = src;
        this.n = src.length;
        this.i = 0;
        this.style = style; // 'jsonpath' | 'jq'
        this.sawDollar = false;
    }

    Parser.prototype.skipWs = function () {
        while (this.i < this.n && (this.s[this.i] === ' ' || this.s[this.i] === '\t' ||
            this.s[this.i] === '\n' || this.s[this.i] === '\r')) this.i++;
    };

    Parser.prototype.peek = function () {
        return this.i < this.n ? this.s[this.i] : '';
    };

    Parser.prototype.peekAt = function (k) {
        return this.i + k < this.n ? this.s[this.i + k] : '';
    };

    Parser.prototype.eat = function (ch) {
        if (this.peek() === ch) { this.i++; return true; }
        return false;
    };

    Parser.prototype.expect = function (ch) {
        if (!this.eat(ch)) throw qError('query-bad-expr', this.i);
    };

    /** 读一个裸标识符；带连字符的名字必须走引号形式 */
    Parser.prototype.readIdent = function () {
        var m = IDENT_RE.exec(this.s.slice(this.i));
        if (!m || m.index !== 0) throw qError('query-bad-name', this.i);
        this.i += m[0].length;
        return m[0];
    };

    Parser.prototype.readQuoted = function () {
        var quote = this.peek();
        if (quote !== '"' && quote !== "'") throw qError('query-bad-name', this.i);
        this.i++;
        var out = '';
        var closed = false;
        while (this.i < this.n) {
            var c = this.s[this.i];
            if (c === '\\') {
                var nx = this.peekAt(1);
                out += nx;
                this.i += 2;
                continue;
            }
            if (c === quote) { this.i++; closed = true; break; }
            out += c;
            this.i++;
        }
        if (!closed) throw qError('query-unclosed', this.i);
        return out;
    };

    Parser.prototype.readNumber = function () {
        var m = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(this.s.slice(this.i));
        if (!m) throw qError('query-bad-number', this.i);
        this.i += m[0].length;
        return parseFloat(m[0]);
    };

    /* ---------------------------------------------------------------- *
     * 路径段（不含根）
     * ---------------------------------------------------------------- */

    /**
     * 解析一段选择器序列，直到遇到 , | ) ] 或结束。
     * soft=true 时（过滤器内部的 @.a.b）碰到不认识的字面量就停下，
     * 交给外层的比较运算符处理；顶层则要报错，免得 `$.a)` 被静默吞掉。
     */
    Parser.prototype.readSteps = function (soft) {
        var steps = [];
        while (this.i < this.n) {
            this.skipWs();
            var c = this.peek();
            if (c === '' || c === ',' || c === '|' || c === ')' || c === ']') break;

            if (c === '.') {
                this.i++;
                if (this.eat('.')) {
                    // 递归下降：..name / ..* / ..['name']
                    steps.push({ type: 'descend', sel: this.readLeafSelector(true) });
                } else if (this.peek() === '*') {
                    this.i++;
                    steps.push({ type: 'wild' });
                } else {
                    var name = this.readIdent();
                    // jq 的 .foo? —— 缺字段不算错（本来也只是不匹配，解析时吃掉即可）
                    if (this.eat('?')) { /* optional，语义同上 */ }
                    steps.push({ type: 'child', names: [name] });
                }
                continue;
            }

            if (c === '[') {
                steps.push(this.readBracket());
                continue;
            }

            // 走到这里说明出现了无法识别的字符
            if (soft) break;
            throw qError('query-bad-expr', this.i);
        }
        return steps;
    };

    /** ..['a'] / ..a / ..* 里紧跟的名字部分 */
    Parser.prototype.readLeafSelector = function (allowBracket) {
        this.skipWs();
        var c = this.peek();
        if (c === '*') { this.i++; return { type: 'wild' }; }
        if (c === '[' && allowBracket) return this.readBracket();
        return { type: 'child', names: [this.readIdent()] };
    };

    /**
     * 方括号：[*] [] [0] [-1] ['a'] [1:3] [1:3:2] [0,2] [?(...)]
     */
    Parser.prototype.readBracket = function () {
        this.expect('[');
        this.skipWs();

        if (this.eat('?')) {
            this.skipWs();
            this.expect('(');
            var ast = this.readFilter();
            this.skipWs();
            this.expect(')');
            this.skipWs();
            this.expect(']');
            return { type: 'filter', ast: ast };
        }

        if (this.eat('*')) {
            this.skipWs();
            this.expect(']');
            return { type: 'wild' };
        }

        // 空括号 = 迭代（jq 的 .[]）
        if (this.peek() === ']') {
            this.i++;
            return { type: 'wild' };
        }

        // 切片：冒号出现即为切片语法
        if (this.peek() === ':' || /^[-+]?\d/.test(this.s.slice(this.i))) {
            var maybeSlice = this.tryReadSlice();
            if (maybeSlice) return maybeSlice;
        }

        // 否则是名字 / 索引的并集
        var names = [];
        var idx = [];
        for (;;) {
            this.skipWs();
            var c = this.peek();
            if (c === '"' || c === "'") {
                names.push(this.readQuoted());
            } else if (/^-?\d+/.test(this.s.slice(this.i))) {
                var m = /^-?\d+/.exec(this.s.slice(this.i));
                idx.push(parseInt(m[0], 10));
                this.i += m[0].length;
            } else {
                throw qError('query-bad-index', this.i);
            }
            this.skipWs();
            if (this.eat(',')) continue;
            break;
        }
        this.skipWs();
        this.expect(']');
        if (names.length && idx.length) throw qError('query-bad-index', this.i);
        if (names.length) return { type: 'child', names: names };
        return { type: 'index', idx: idx };
    };

    /** 尝试按 [start:end:step] 解析；不成型就回退，交给名字/索引解析 */
    Parser.prototype.tryReadSlice = function () {
        var save = this.i;
        var parts = ['', '', ''];
        var at = 0;
        var sawColon = false;
        while (at < 3) {
            this.skipWs();
            var m = /^[-+]?\d+/.exec(this.s.slice(this.i));
            if (m) {
                parts[at] = m[0];
                this.i += m[0].length;
            }
            this.skipWs();
            if (this.peek() === ':') {
                sawColon = true;
                this.i++;
                at++;
                continue;
            }
            break;
        }
        if (!sawColon || this.peek() !== ']') {
            this.i = save;
            return null;
        }
        this.i++;
        var start = parts[0] === '' ? null : parseInt(parts[0], 10);
        var end = parts[1] === '' ? null : parseInt(parts[1], 10);
        var stepRaw = parts[2] === '' ? '1' : parts[2];
        var step = parseInt(stepRaw, 10);
        if (step === 0) throw qError('query-bad-slice', save);
        return { type: 'slice', start: start, end: end, step: step };
    };

    /* ---------------------------------------------------------------- *
     * 过滤器表达式
     * ---------------------------------------------------------------- */

    Parser.prototype.readFilter = function () {
        var node = this.readOr();
        return node;
    };

    Parser.prototype.readOr = function () {
        var left = this.readAnd();
        while (true) {
            this.skipWs();
            if (this.s.slice(this.i, this.i + 2) === '||') {
                this.i += 2;
                var right = this.readAnd();
                left = { type: 'or', left: left, right: right };
                continue;
            }
            return left;
        }
    };

    Parser.prototype.readAnd = function () {
        var left = this.readCmp();
        while (true) {
            this.skipWs();
            if (this.s.slice(this.i, this.i + 2) === '&&') {
                this.i += 2;
                var right = this.readCmp();
                left = { type: 'and', left: left, right: right };
                continue;
            }
            return left;
        }
    };

    Parser.prototype.readCmp = function () {
        var left = this.readOperand();
        this.skipWs();
        var two = this.s.slice(this.i, this.i + 2);
        var op = null;
        if (two === '==' || two === '!=' || two === '<=' || two === '>=' || two === '=~') op = two;
        else if (this.peek() === '<' || this.peek() === '>') op = this.peek();
        if (!op) return left;
        this.i += op.length;
        var right = this.readOperand();
        return { type: 'cmp', op: op, left: left, right: right };
    };

    Parser.prototype.readOperand = function () {
        this.skipWs();
        var c = this.peek();
        if (c === '!') {
            this.i++;
            return { type: 'not', arg: this.readOperand() };
        }
        if (c === '(') {
            this.i++;
            var inner = this.readOr();
            this.skipWs();
            this.expect(')');
            return inner;
        }
        if (c === '"' || c === "'") {
            return { type: 'lit', value: this.readQuoted() };
        }
        if (c === '@' || c === '$') {
            var anchor = c;
            this.i++;
            var steps = this.readSteps(true);
            return { type: anchor === '@' ? 'current' : 'root', path: steps };
        }
        if (c === '/') {
            // /pattern/flags
            var end = this.s.indexOf('/', this.i + 1);
            if (end < 0) throw qError('query-bad-regex', this.i);
            var src = this.s.slice(this.i + 1, end);
            this.i = end + 1;
            var flags = '';
            while (this.i < this.n && /[gimsuy]/.test(this.peek())) { flags += this.s[this.i]; this.i++; }
            try {
                new RegExp(src, flags);
            } catch (e) {
                throw qError('query-bad-regex', this.i);
            }
            return { type: 'regex', source: src, flags: flags };
        }
        if (this.s.slice(this.i, this.i + 4) === 'true') { this.i += 4; return { type: 'lit', value: true }; }
        if (this.s.slice(this.i, this.i + 5) === 'false') { this.i += 5; return { type: 'lit', value: false }; }
        if (this.s.slice(this.i, this.i + 4) === 'null') { this.i += 4; return { type: 'lit', value: null }; }
        if (/^-?\d/.test(this.s.slice(this.i))) {
            return { type: 'lit', value: this.readNumber() };
        }
        throw qError('query-bad-expr', this.i);
    };

    /* ---------------------------------------------------------------- *
     * 顶层：program := stage ( '|' stage )*   stage := path ( ',' path )*
     * ---------------------------------------------------------------- */

    Parser.prototype.parse = function () {
        this.skipWs();
        // 风格判定：$ 开头是 JSONPath，其余按 jq 处理（必须以 . 开头）
        if (this.peek() === '$') {
            this.style = 'jsonpath';
            this.i++;
            this.sawDollar = true;
        } else if (this.peek() === '.') {
            this.style = 'jq';
        } else {
            throw qError('query-bad-start', this.i);
        }

        var stages = [];
        for (;;) {
            var branches = [this.readSteps()];
            for (;;) {
                this.skipWs();
                if (this.peek() !== ',') break;
                this.i++;
                this.skipWs();
                // union 的后续分支允许再写一次根符号（$.a, $.b）
                if (this.peek() === '$') this.i++;
                branches.push(this.readSteps());
            }
            if (branches.length === 1) stages.push(branches[0]);
            else stages.push({ type: 'union', branches: branches });

            this.skipWs();
            if (this.peek() === '|') { this.i++; continue; }
            break;
        }
        this.skipWs();
        if (this.i < this.n) throw qError('query-bad-expr', this.i);
        return { style: this.style, stages: stages };
    };

    function compile(expr) {
        var text = String(expr == null ? '' : expr);
        if (!text.trim()) throw qError('query-empty', 0);
        if (text.length > LIMITS.expr) throw qError('query-too-long', 0);
        var p = new Parser(text, text.charAt(0) === '$' ? 'jsonpath' : 'jq');
        return p.parse();
    }

    /* ==================================================================== *
     * 2. 求值
     * ==================================================================== */

    /** 路径段字符串：能裸写就裸写，其余加引号 */
    function pathJoin(base, key) {
        if (typeof key === 'number') return base + '[' + key + ']';
        var s = String(key);
        if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(s)) return base + '.' + s;
        return base + '[' + JSON.stringify(s) + ']';
    }

    /**
     * 一次查询的共享上下文：结果/节点的预算记在这里，文档根也放这里——
     * 过滤器里的 `$` 指的是整篇文档，而求值时手边只有当前节点。
     */
    function Ctx(root) {
        this.root = root;
        this.nodes = 0;
        this.truncated = false;
    }

    /** 对单个节点应用一个 step，产出 [{value, path}] */
    function applyStep(node, step, basePath, ctx) {
        var out = [];
        var i;
        if (step.type === 'child') {
            if (!isPlainObject(node)) return out;
            for (i = 0; i < step.names.length; i++) {
                var name = step.names[i];
                if (Object.prototype.hasOwnProperty.call(node, name)) {
                    out.push({ value: node[name], path: pathJoin(basePath, name) });
                }
            }
            return out;
        }
        if (step.type === 'wild') {
            if (Array.isArray(node)) {
                for (i = 0; i < node.length; i++) out.push({ value: node[i], path: pathJoin(basePath, i) });
            } else if (isPlainObject(node)) {
                var keys = Object.keys(node);
                for (i = 0; i < keys.length; i++) out.push({ value: node[keys[i]], path: pathJoin(basePath, keys[i]) });
            }
            return out;
        }
        if (step.type === 'index') {
            var arr = Array.isArray(node) ? node : null;
            for (i = 0; i < step.idx.length; i++) {
                var want = step.idx[i];
                if (arr) {
                    var at = want < 0 ? arr.length + want : want;
                    if (at >= 0 && at < arr.length) out.push({ value: arr[at], path: pathJoin(basePath, at) });
                } else if (isPlainObject(node) && Object.prototype.hasOwnProperty.call(node, String(want))) {
                    out.push({ value: node[String(want)], path: pathJoin(basePath, String(want)) });
                }
            }
            return out;
        }
        if (step.type === 'slice') {
            if (!Array.isArray(node)) return out;
            return sliceArray(node, step.start, step.end, step.step).map(function (item) {
                return { value: item.value, path: pathJoin(basePath, item.index) };
            });
        }
        if (step.type === 'filter') {
            if (Array.isArray(node)) {
                for (i = 0; i < node.length; i++) {
                    if (truthy(evalFilter(step.ast, node[i], ctx))) {
                        out.push({ value: node[i], path: pathJoin(basePath, i) });
                    }
                }
            } else if (isPlainObject(node)) {
                var ks = Object.keys(node);
                for (i = 0; i < ks.length; i++) {
                    if (truthy(evalFilter(step.ast, node[ks[i]], ctx))) {
                        out.push({ value: node[ks[i]], path: pathJoin(basePath, ks[i]) });
                    }
                }
            }
            return out;
        }
        if (step.type === 'descend') {
            return collectDescend(node, step.sel, basePath, ctx);
        }
        return out;
    }

    function sliceArray(arr, start, end, step) {
        var len = arr.length;
        var out = [];
        var from = start === null ? (step > 0 ? 0 : len - 1) : normalizeIndex(start, len, step > 0);
        var to = end === null ? (step > 0 ? len : -1) : normalizeIndex(end, len, step > 0);
        for (var i = from; step > 0 ? i < to : i > to; i += step) {
            if (i < 0 || i >= len) continue;
            out.push({ index: i, value: arr[i] });
        }
        return out;
    }

    function normalizeIndex(v, len, forward) {
        if (v < 0) return Math.max(v + len, forward ? 0 : -1);
        return Math.min(v, len);
    }

    /** 递归下降：先按文档序收齐候选节点，再对它们应用 selector */
    function collectDescend(node, sel, basePath, ctx) {
        var out = [];

        function walk(current, path) {
            ctx.nodes++;
            if (ctx.nodes > LIMITS.nodes) { ctx.truncated = true; return; }
            // 根自身也参与匹配（$..a 能拿到顶层的 a）
            pushSel(current, path);
            if (Array.isArray(current)) {
                for (var i = 0; i < current.length; i++) {
                    if (ctx.nodes > LIMITS.nodes) return;
                    walk(current[i], pathJoin(path, i));
                }
            } else if (isPlainObject(current)) {
                var keys = Object.keys(current);
                for (var k = 0; k < keys.length; k++) {
                    if (ctx.nodes > LIMITS.nodes) return;
                    walk(current[keys[k]], pathJoin(path, keys[k]));
                }
            }
        }

        function pushSel(current, path) {
            var res = applyStep(current, sel, path, ctx);
            for (var i = 0; i < res.length; i++) out.push(res[i]);
        }

        walk(node, basePath);
        return out;
    }

    /* ---------------------------- 过滤器求值 ---------------------------- */

    function truthy(v) {
        return v !== undefined && v !== null && v !== false;
    }

    function evalFilter(ast, node, ctx) {
        return evalNode(ast, node, ctx ? ctx.root : node, ctx);
    }

    function evalNode(ast, current, root, ctx) {
        if (!ast) return undefined;
        switch (ast.type) {
            case 'lit':
                return ast.value;
            case 'regex':
                return ast;
            case 'current':
                return evalPath(ast.path, current, root, ctx);
            case 'root':
                return evalPath(ast.path, root, root, ctx);
            case 'not':
                return !truthy(evalNode(ast.arg, current, root, ctx));
            case 'and':
                return truthy(evalNode(ast.left, current, root, ctx)) && truthy(evalNode(ast.right, current, root, ctx));
            case 'or':
                return truthy(evalNode(ast.left, current, root, ctx)) || truthy(evalNode(ast.right, current, root, ctx));
            case 'cmp':
                return compare(ast.op, evalNode(ast.left, current, root, ctx), evalNode(ast.right, current, root, ctx));
            default:
                return undefined;
        }
    }

    /** 过滤器里的 @.a.b[0]：逐级取值，取不到就是 undefined */
    function evalPath(steps, start, root, ctx) {
        var cur = start;
        // 过滤器体量很小：没传 ctx 就用一次性上下文，不占用主查询的预算
        var local = ctx || new Ctx(root);
        for (var i = 0; i < steps.length; i++) {
            if (cur === undefined || cur === null) return undefined;
            var res = applyStep(cur, steps[i], '$', local);
            if (!res.length) return undefined;
            cur = res[0].value;
        }
        return cur;
    }

    function compare(op, a, b) {
        if (op === '=~') {
            var re = toRegExp(b);
            if (!re) return false;
            if (a === undefined || a === null) return false;
            return re.test(typeof a === 'string' ? a : String(a));
        }
        if (op === '==') return a === b;
        if (op === '!=') return a !== b;
        // 排序比较只在同类型之间进行：数字比数字，字符串比字符串
        if (typeof a !== typeof b) return false;
        if (typeof a === 'number') {
            if (op === '<') return a < b;
            if (op === '<=') return a <= b;
            if (op === '>') return a > b;
            if (op === '>=') return a >= b;
        } else if (typeof a === 'string') {
            if (op === '<') return a < b;
            if (op === '<=') return a <= b;
            if (op === '>') return a > b;
            if (op === '>=') return a >= b;
        }
        return false;
    }

    var regexCache = Object.create(null);

    function toRegExp(v) {
        if (v && v.type === 'regex') {
            if (!regexCache[v.source + ' ' + v.flags]) {
                try {
                    regexCache[v.source + ' ' + v.flags] = new RegExp(v.source, v.flags);
                } catch (e) {
                    return null;
                }
            }
            return regexCache[v.source + ' ' + v.flags];
        }
        if (typeof v === 'string') {
            if (!regexCache['s ' + v]) {
                try {
                    regexCache['s ' + v] = new RegExp(v);
                } catch (e) {
                    return null;
                }
            }
            return regexCache['s ' + v];
        }
        return null;
    }

    /* ---------------------------- 主流程 ---------------------------- */

    /**
     * query(data, expr) → { ok:true, style, count, matches:[{path,value}], truncated }
     * 失败抛 qError（code + pos），由 UI 查字典。
     */
    function query(data, expr) {
        var plan = compile(expr);
        var ctx = new Ctx(data);
        var current = [{ value: data, path: '$' }];

        for (var s = 0; s < plan.stages.length; s++) {
            var stage = plan.stages[s];
            var next = [];
            if (stage.type === 'union') {
                for (var b = 0; b < stage.branches.length; b++) {
                    runSteps(current, stage.branches[b], next, ctx);
                }
            } else {
                runSteps(current, stage, next, ctx);
            }
            current = truncate(next, ctx);
            if (!current.length) break;
        }

        return {
            ok: true,
            style: plan.style,
            count: current.length,
            matches: current,
            truncated: ctx.truncated
        };
    }

    /** 中间结果也要有天花板：最终结果不可能超过 LIMITS.results，超了就记一次截断 */
    function truncate(list, ctx) {
        if (list.length <= LIMITS.results) return list;
        ctx.truncated = true;
        return list.slice(0, LIMITS.results);
    }

    function runSteps(nodes, steps, out, ctx) {
        if (!steps.length) {
            for (var z = 0; z < nodes.length; z++) out.push(nodes[z]);
            return;
        }
        var frontier = nodes;
        for (var i = 0; i < steps.length; i++) {
            var next = [];
            for (var f = 0; f < frontier.length; f++) {
                var res = applyStep(frontier[f].value, steps[i], frontier[f].path, ctx);
                for (var r = 0; r < res.length; r++) next.push(res[r]);
                if (next.length > LIMITS.results) break;
            }
            frontier = truncate(next, ctx);
            if (!frontier.length) return;
        }
        for (var k = 0; k < frontier.length; k++) out.push(frontier[k]);
    }

    /**
     * 给 UI 的示例表达式。表达式本身是代码，不需要翻译；
     * 挑的都是对内置示例数据（bookstore）能立刻出结果的写法，
     * 顺带覆盖点记法、过滤器、切片、递归下降和 jq 风格管道。
     */
    var SAMPLES = [
        '$.store.book[*].author',
        '$.store.book[?(@.price < 10)].title',
        '$.store.book[-1:]',
        '$..price',
        '.store.book[0].title',
        '.store.book[] | .author',
        '$..book[*].isbn',
        '$.store.bicycle.color'
    ];

    return {
        LIMITS: LIMITS,
        SAMPLES: SAMPLES,
        query: query,
        compile: compile,
        /** 只做语法检查，UI 用它做实时提示 */
        check: function (expr) {
            try {
                compile(expr);
                return { ok: true };
            } catch (e) {
                return { ok: false, code: e.code || 'query-bad-expr', pos: e.pos };
            }
        }
    };
});
