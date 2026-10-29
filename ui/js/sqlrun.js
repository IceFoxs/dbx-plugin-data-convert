/*
 * SQL 分析 —— 纯函数库，无 DOM。
 *
 * 为什么不是 duckdb-wasm：宿主沙箱的 CSP 是
 *   default-src 'none'; script-src 'unsafe-inline' blob:; connect-src 'none';
 * 既没有 'wasm-unsafe-eval'（Chromium 直接 CompileError），connect-src 又是 'none'
 * （连 fetch(blob:) 都拒），再加上 duckdb 的 wasm 一个就 35~41 MB。
 * 所以这里手写一个 SQL 子集：离线、零依赖、包体 0 增长、CSP 无关。
 *
 * 语法（大小写不敏感）：
 *   SELECT <项>[, ...]              * / 表达式 / 聚合 / 别名（AS 可省）
 *   [FROM <表名>]                   单表，表名随便写（不校验）
 *   [WHERE <条件>]
 *   [GROUP BY <表达式>[, ...]]
 *   [HAVING <条件>]
 *   [ORDER BY <表达式|别名|序号> [ASC|DESC][, ...]]
 *   [LIMIT <n> [OFFSET <m>]]        也认 MySQL 的 LIMIT m, n
 *
 * 聚合：count(*) / count(x) / count(distinct x) / sum / avg / min / max / group_concat
 * 标量：round / abs / floor / ceil / upper / lower / trim / length / coalesce / ifnull / substr
 * 运算：+ - * / % ||，= == != <> > >= < <=，AND OR NOT，LIKE（% _），IN，BETWEEN，IS [NOT] NULL
 *
 * 性能上的三个决定（数据是 5 万行级别，主线程里跑）：
 *   1. 词法 + 语法各扫一遍，解析结果可缓存——改 SQL 才重编译，改数据只重跑
 *   2. 表达式编译成闭包树，行过滤 / 取值都是直接调用，不做逐节点 switch
 *   3. 聚合单遍扫描；GROUP BY 用 Map；没有 ORDER BY 时命中 LIMIT 立刻停
 *
 * 对外：
 *   tokenize(sql)                 -> tokens（调试 / 测试用）
 *   parse(sql)                    -> { ast, error, errorAt }
 *   compile(ast, table)           -> { plan } | { error }
 *   execute(plan, rows, options)  -> { columns, rows, rowCount, truncated, ms }
 *   executeAsync(plan, rows, opts)-> Promise<上面那个 | { cancelled } | { error }>
 *                                    分片跑、每片回调 onProgress、每片问一次 isCancelled
 *   query(sql, table, options)    -> 上面两步合一（顺手把 plan 挂到结果上，便于缓存）
 *   queryAsync(sql, table, opts)  -> 异步版
 *   formatValue(v)                -> 展示用字符串（null -> ''，数字不带千分位）
 *   toTsv(result)                 -> 表头 + 每行一条，Tab 分隔
 *
 * table: { header: string[]|null, rows: string[][], cols: number }
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.DBXSqlRun = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var LIMITS = {
        result: 5000,      // 一次最多吐这么多行给界面（再多也看不过来，渲染才是瓶颈）
        sql: 20000,        // SQL 文本长度上限，防手滑贴进来一整篇
        depth: 64          // 表达式嵌套上限，防止坏输入把栈打穿
    };

    var AGG = {
        count: 1, sum: 1, avg: 1, min: 1, max: 1, group_concat: 1
    };

    // 这些词不能当别名 / 列名用（`SELECT a from` 里 from 不是别名）
    var RESERVED = {
        select: 1, from: 1, where: 1, group: 1, by: 1, having: 1, order: 1,
        limit: 1, offset: 1, as: 1, and: 1, or: 1, not: 1, in: 1, is: 1,
        null: 1, like: 1, between: 1, asc: 1, desc: 1, distinct: 1, true: 1, false: 1,
        case: 1, when: 1, then: 1, else: 1, end: 1
    };

    /* ------------------------------ 词法 ------------------------------ */

    function isDigit(ch) {
        return ch >= '0' && ch <= '9';
    }

    function isIdentStart(ch) {
        if (!ch) return false;
        if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_') return true;
        // 中文列名很常见（表头直接是「订单金额」），不认中文等于逼人改表头
        return ch >= '\u4e00' && ch <= '\u9fff';
    }

    function isIdentPart(ch) {
        return isIdentStart(ch) || isDigit(ch) || ch === '$';
    }

    function tokenize(sql) {
        var text = String(sql == null ? '' : sql);
        var out = [];
        var i = 0;
        var n = text.length;
        while (i < n) {
            var ch = text[i];
            if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\u3000') {
                i++;
                continue;
            }
            /*
             * 行注释：-- 与 //。
             * 从 JS / C 那边过来的人顺手就打 //，只认 -- 的话一句说明就能把整条
             * 语句顶成语法错误。`#` 不在此列：MySQL 拿它当注释，可 SQL Server 的
             *  #临时表 也是它，认下来会把 `SELECT * FROM #tmp` 吃成半句。
             */
            if ((ch === '-' && text[i + 1] === '-') || (ch === '/' && text[i + 1] === '/')) {
                while (i < n && text[i] !== '\n') i++;
                continue;
            }
            if (ch === '/' && text[i + 1] === '*') {
                i += 2;
                while (i < n && !(text[i] === '*' && text[i + 1] === '/')) i++;
                i += 2;
                continue;
            }
            // 字符串：单引号，'' 转义；双引号也当字符串（简化，不当标识符引用）
            if (ch === "'" || ch === '"') {
                var quote = ch;
                var start = i;
                var buf = '';
                i++;
                while (i < n) {
                    if (text[i] === quote) {
                        if (text[i + 1] === quote) { buf += quote; i += 2; continue; }
                        i++;
                        break;
                    }
                    buf += text[i];
                    i++;
                }
                out.push({ t: 'str', v: buf, start: start, end: i });
                continue;
            }
            // 数字：123 / 12.5 / .5 / 1e9
            if (isDigit(ch) || (ch === '.' && isDigit(text[i + 1]))) {
                var s0 = i;
                while (i < n && isDigit(text[i])) i++;
                if (text[i] === '.') {
                    i++;
                    while (i < n && isDigit(text[i])) i++;
                }
                if (text[i] === 'e' || text[i] === 'E') {
                    var save = i;
                    i++;
                    if (text[i] === '+' || text[i] === '-') i++;
                    if (isDigit(text[i])) {
                        while (i < n && isDigit(text[i])) i++;
                    } else {
                        i = save;
                    }
                }
                out.push({ t: 'num', v: Number(text.slice(s0, i)), start: s0, end: i });
                continue;
            }
            // `带 空格 的列名` / [带 空格 的列名]
            if (ch === '`' || ch === '[') {
                var close = ch === '`' ? '`' : ']';
                var s1 = i;
                var name = '';
                i++;
                while (i < n && text[i] !== close) { name += text[i]; i++; }
                i++;
                out.push({ t: 'ident', v: name, start: s1, end: i });
                continue;
            }
            if (isIdentStart(ch)) {
                var s2 = i;
                while (i < n && isIdentPart(text[i])) i++;
                out.push({ t: 'ident', v: text.slice(s2, i), start: s2, end: i });
                continue;
            }
            // 多字符运算符
            var two = text.slice(i, i + 2);
            if (two === '<=' || two === '>=' || two === '!=' || two === '<>' || two === '==') {
                out.push({ t: 'op', v: two === '==' ? '=' : (two === '<>' ? '!=' : two), start: i, end: i + 2 });
                i += 2;
                continue;
            }
            if (two === '||') {
                out.push({ t: 'op', v: '||', start: i, end: i + 2 });
                i += 2;
                continue;
            }
            if ('+-*/%(),.=<>'.indexOf(ch) >= 0 || ch === ';') {
                out.push({ t: 'op', v: ch, start: i, end: i + 1 });
                i++;
                continue;
            }
            // 中文输入法打出来的全角分号 / 逗号：SQL 里几乎没有别的含义，直接当半角用
            if (ch === '\uFF1B' || ch === '\uFF0C') {
                out.push({ t: 'op', v: ch === '\uFF1B' ? ';' : ',', start: i, end: i + 1 });
                i++;
                continue;
            }
            // 认不出来的字符：当场报，别一路吃到底再给个莫名其妙的「缺少 FROM」
            out.push({ t: 'bad', v: ch, start: i, end: i + 1 });
            i++;
        }
        out.push({ t: 'eof', v: '', start: n, end: n });
        return out;
    }

    /* ------------------------------ 语法 ------------------------------ */

    function SqlError(message, index) {
        var err = new Error(message);
        err.sqlIndex = index;
        return err;
    }

    function parse(sql) {
        var text = String(sql == null ? '' : sql);
        if (!text.trim()) return { ast: null, error: 'SQL 是空的', errorAt: 0 };
        if (text.length > LIMITS.sql) {
            return { ast: null, error: 'SQL 太长（超过 ' + LIMITS.sql + ' 个字符）', errorAt: 0 };
        }
        var tokens = tokenize(text);
        for (var b = 0; b < tokens.length; b++) {
            if (tokens[b].t === 'bad') {
                return { ast: null, error: '认不出的字符「' + tokens[b].v + '」', errorAt: tokens[b].start };
            }
        }
        var pos = 0;
        var depth = 0;

        function peek() { return tokens[pos]; }
        function next() { return tokens[pos++]; }

        function isKw(tok, kw) {
            return !!tok && tok.t === 'ident' && tok.v.toUpperCase() === kw;
        }

        function eatKw(kw) {
            if (isKw(peek(), kw)) { pos++; return true; }
            return false;
        }

        function expectKw(kw) {
            if (eatKw(kw)) return;
            throw SqlError('这里应该是 ' + kw, peek().start);
        }

        function eatOp(op) {
            var tok = peek();
            if (tok.t === 'op' && tok.v === op) { pos++; return true; }
            return false;
        }

        function expectOp(op) {
            if (eatOp(op)) return;
            throw SqlError('这里应该是「' + op + '」', peek().start);
        }

        function enter() {
            depth++;
            if (depth > LIMITS.depth) throw SqlError('表达式嵌套太深了', peek().start);
        }

        function leave() { depth--; }

        /* ---- 表达式 ---- */

        function parseOr() {
            var left = parseAnd();
            while (isKw(peek(), 'OR')) {
                var at = next().start;
                left = { k: 'bin', op: 'or', l: left, r: parseAnd(), at: at };
            }
            return left;
        }

        function parseAnd() {
            var left = parseNot();
            while (isKw(peek(), 'AND')) {
                var at = next().start;
                left = { k: 'bin', op: 'and', l: left, r: parseNot(), at: at };
            }
            return left;
        }

        function parseNot() {
            if (isKw(peek(), 'NOT')) {
                var at = next().start;
                enter();
                var inner = parseNot();
                leave();
                return { k: 'un', op: 'not', x: inner, at: at };
            }
            return parseCompare();
        }

        function parseCompare() {
            var left = parseAdd();
            var tok = peek();

            // IS [NOT] NULL
            if (isKw(tok, 'IS')) {
                var at = next().start;
                var negated = eatKw('NOT');
                if (!isKw(peek(), 'NULL')) throw SqlError('IS 后面只支持 NULL', peek().start);
                next();
                return { k: 'isnull', x: left, not: negated, at: at };
            }

            var notBefore = false;
            if (isKw(tok, 'NOT')) {
                // NOT LIKE / NOT IN / NOT BETWEEN
                var save = pos;
                next();
                if (isKw(peek(), 'LIKE') || isKw(peek(), 'IN') || isKw(peek(), 'BETWEEN')) {
                    notBefore = true;
                    tok = peek();
                } else {
                    pos = save;
                    return left;
                }
            }

            if (isKw(tok, 'LIKE')) {
                var atL = next().start;
                return { k: 'like', x: left, pat: parseAdd(), not: notBefore, at: atL };
            }

            if (isKw(tok, 'BETWEEN')) {
                var atB = next().start;
                var lo = parseAdd();
                expectKw('AND');
                var hi = parseAdd();
                return { k: 'between', x: left, lo: lo, hi: hi, not: notBefore, at: atB };
            }

            if (isKw(tok, 'IN')) {
                var atI = next().start;
                expectOp('(');
                var list = [];
                if (!eatOp(')')) {
                    do {
                        list.push(parseOr());
                    } while (eatOp(','));
                    expectOp(')');
                }
                return { k: 'in', x: left, list: list, not: notBefore, at: atI };
            }

            if (notBefore) {
                // NOT 后面不是 LIKE/IN/BETWEEN，说明写错了
                throw SqlError('NOT 后面应该是 LIKE / IN / BETWEEN', tok.start);
            }

            if (tok.t === 'op' && (tok.v === '=' || tok.v === '!=' || tok.v === '>' || tok.v === '>=' || tok.v === '<' || tok.v === '<=')) {
                var atC = next().start;
                return { k: 'bin', op: tok.v, l: left, r: parseAdd(), at: atC };
            }
            return left;
        }

        function parseAdd() {
            var left = parseMul();
            for (;;) {
                var tok = peek();
                if (tok.t === 'op' && (tok.v === '+' || tok.v === '-' || tok.v === '||')) {
                    var at = next().start;
                    left = { k: 'bin', op: tok.v, l: left, r: parseMul(), at: at };
                    continue;
                }
                return left;
            }
        }

        function parseMul() {
            var left = parseUnary();
            for (;;) {
                var tok = peek();
                if (tok.t === 'op' && (tok.v === '*' || tok.v === '/' || tok.v === '%')) {
                    var at = next().start;
                    left = { k: 'bin', op: tok.v, l: left, r: parseUnary(), at: at };
                    continue;
                }
                return left;
            }
        }

        function parseUnary() {
            var tok = peek();
            if (tok.t === 'op' && (tok.v === '-' || tok.v === '+')) {
                next();
                enter();
                var inner = parseUnary();
                leave();
                return tok.v === '-' ? { k: 'un', op: 'neg', x: inner, at: tok.start } : inner;
            }
            return parsePrimary();
        }

        function parsePrimary() {
            var tok = peek();
            if (tok.t === 'num') { next(); return { k: 'num', v: tok.v, at: tok.start }; }
            if (tok.t === 'str') { next(); return { k: 'str', v: tok.v, at: tok.start }; }

            if (tok.t === 'op' && tok.v === '(') {
                next();
                enter();
                var inner = parseOr();
                leave();
                expectOp(')');
                return inner;
            }

            if (tok.t === 'op' && tok.v === '*') {
                next();
                return { k: 'star', at: tok.start };
            }

            if (tok.t === 'ident') {
                var name = tok.v;
                // CASE WHEN ... THEN ... [ELSE ...] END
                if (name.toUpperCase() === 'CASE') {
                    var caseAt = next().start;   // 吃掉 CASE
                    enter();
                    var whens = [];
                    // 简单 CASE：CASE expr WHEN val THEN result ...
                    var caseExpr = null;
                    if (!isKw(peek(), 'WHEN')) {
                        caseExpr = parseOr();
                    }
                    while (isKw(peek(), 'WHEN')) {
                        next();
                        var whenCond = parseOr();
                        expectKw('THEN');
                        var thenVal = parseOr();
                        whens.push({ when: whenCond, then: thenVal });
                    }
                    if (!whens.length) {
                        throw SqlError('CASE 后面至少要有一个 WHEN', peek().start);
                    }
                    var elseVal = null;
                    if (eatKw('ELSE')) {
                        elseVal = parseOr();
                    }
                    expectKw('END');
                    leave();
                    return { k: 'case', caseExpr: caseExpr, whens: whens, else: elseVal, at: caseAt };
                }
                next();
                // 函数调用：看完下一个 token 才知道（刚才这里看的是 name 那枚，导致 SUM(b) 里的括号被当成多余的）
                var after = peek();
                if (after.t === 'op' && after.v === '(') {
                    next();
                    enter();
                    var args = [];
                    var distinct = false;
                    if (isKw(peek(), 'DISTINCT')) { next(); distinct = true; }
                    if (!eatOp(')')) {
                        do {
                            args.push(parseOr());
                        } while (eatOp(','));
                        expectOp(')');
                    }
                    leave();
                    return { k: 'call', name: name.toLowerCase(), args: args, distinct: distinct, at: tok.start };
                }
                var upper = name.toUpperCase();
                if (upper === 'NULL') return { k: 'null', at: tok.start };
                if (upper === 'TRUE') return { k: 'num', v: 1, at: tok.start };
                if (upper === 'FALSE') return { k: 'num', v: 0, at: tok.start };
                // 关键字不能当列名：`SELECT FROM t` 要当场报错，别悄悄把 FROM 当列
                if (RESERVED[upper.toLowerCase()]) {
                    throw SqlError('这里应该是一个值或列名，「' + name + '」是关键字', tok.start);
                }
                return { k: 'col', name: name, at: tok.start };
            }

            throw SqlError('这里应该是一个值或列名', tok.start);
        }

        /* ---- 语句 ---- */

        try {
            expectKw('SELECT');
            // SELECT DISTINCT：整行去重（函数里的 COUNT(DISTINCT x) 是另一回事，在 parseOr 里处理）
            var distinctRows = eatKw('DISTINCT');
            var items = [];
            do {
                var expr = parseOr();
                var alias = null;
                if (eatKw('AS')) {
                    var aliasTok = peek();
                    if (aliasTok.t !== 'ident') throw SqlError('AS 后面应该是别名', aliasTok.start);
                    alias = aliasTok.v;
                    next();
                } else if (peek().t === 'ident' && !RESERVED[peek().v.toLowerCase()]) {
                    alias = peek().v;
                    next();
                }
                items.push({ expr: expr, alias: alias });
            } while (eatOp(','));

            var from = null;
            if (eatKw('FROM')) {
                var tableTok = peek();
                if (tableTok.t !== 'ident') throw SqlError('FROM 后面应该是表名', tableTok.start);
                from = tableTok.v;
                next();
                // 表别名（可有可无，直接用不到）
                if (peek().t === 'ident' && !RESERVED[peek().v.toLowerCase()]) next();
            }

            var where = null;
            if (eatKw('WHERE')) where = parseOr();

            var groupBy = null;
            if (eatKw('GROUP')) {
                expectKw('BY');
                groupBy = [];
                do {
                    groupBy.push(parseOr());
                } while (eatOp(','));
            }

            var having = null;
            if (eatKw('HAVING')) having = parseOr();

            var orderBy = null;
            if (eatKw('ORDER')) {
                expectKw('BY');
                orderBy = [];
                do {
                    var key = parseOr();
                    var desc = false;
                    if (eatKw('DESC')) desc = true;
                    else eatKw('ASC');
                    orderBy.push({ expr: key, desc: desc });
                } while (eatOp(','));
            }

            var limit = null;
            var offset = 0;
            if (eatKw('LIMIT')) {
                var first = parseOr();
                if (eatOp(',')) {
                    // MySQL: LIMIT offset, count
                    offset = first;
                    limit = parseOr();
                } else {
                    limit = first;
                    if (eatKw('OFFSET')) offset = parseOr();
                }
            }

            // 分号收尾（允许多个）
            while (eatOp(';')) { /* 空 */ }
            if (peek().t !== 'eof') {
                // 明显是「又写了一条」：与其说「多了一段」，不如直接说清楚怎么办
                var extra = peek();
                if (extra.t === 'ident' && /^(SELECT|INSERT|UPDATE|DELETE|WITH)$/i.test(extra.v)) {
                    throw SqlError('一次只能跑一条 SQL：把光标放到要跑的那条里，或先选中它', extra.start);
                }
                throw SqlError('这里多了一段，看不懂：「' + extra.v + '」', extra.start);
            }

            return {
                ast: {
                    items: items,
                    from: from,
                    distinct: distinctRows,
                    where: where,
                    groupBy: groupBy,
                    having: having,
                    orderBy: orderBy,
                    limit: limit,
                    offset: offset
                },
                error: null,
                errorAt: -1
            };
        } catch (err) {
            if (err && err.sqlIndex != null) {
                return { ast: null, error: err.message, errorAt: err.sqlIndex };
            }
            return { ast: null, error: (err && err.message) || 'SQL 解析失败', errorAt: peek().start };
        }
    }

    /* ------------------------------ 工具 ------------------------------ */

    function toNum(v) {
        if (v == null) return null;
        if (typeof v === 'number') return isFinite(v) ? v : null;
        var raw = String(v).trim();
        if (!raw) return null;
        // 千分位：跟统计页一致（"1,234.5" 当数字）
        if (raw.indexOf(',') > 0 && /^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(raw)) raw = raw.replace(/,/g, '');
        if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(raw)) return null;
        var n = Number(raw);
        return isFinite(n) ? n : null;
    }

    function truthy(v) {
        if (v == null) return false;
        // 比较的结果本身就是布尔：别让 false 走到最后那行 return true
        if (typeof v === 'boolean') return v;
        if (typeof v === 'number') return v !== 0;
        if (v === '' || v === '0' || v === 'false') return false;
        return true;
    }

    // 比较：两边都是数字就按数字，否则按字符串（中文按 UTF-16 比，稳定且不慢）
    function compareValues(a, b) {
        var na = toNum(a);
        var nb = toNum(b);
        if (na !== null && nb !== null) return na < nb ? -1 : (na > nb ? 1 : 0);
        var sa = a == null ? '' : String(a);
        var sb = b == null ? '' : String(b);
        return sa < sb ? -1 : (sa > sb ? 1 : 0);
    }

    /* ------------------------------ 编译 ------------------------------ */

    // 表头 -> { names, index }；重名依次加 _2、_3
    function columnIndex(table) {
        var cols = [];
        var index = Object.create(null);
        var n = table && table.cols ? table.cols : 0;
        var header = table && table.header ? table.header : null;
        for (var i = 0; i < n; i++) {
            var raw = header && header[i] != null ? String(header[i]).trim() : '';
            var name = raw || ('c' + (i + 1));
            var key = name.toLowerCase();
            if (index[key] != null) {
                var k = 2;
                while (index[key + '_' + k] != null) k++;
                key = key + '_' + k;
            }
            index[key] = i;
            cols.push(name);
        }
        return { names: cols, index: index };
    }

    function compile(ast, table) {
        var info = columnIndex(table);
        var ncols = info.names.length;
        if (!ncols) return { error: '表里还没有列，先贴一段数据' };

        function resolve(name) {
            var key = String(name).trim().toLowerCase();
            var at = info.index[key];
            if (at != null) return at;
            // c1 / 第1列
            var m = /^c(\d+)$/.exec(key);
            if (m) {
                var idx = Number(m[1]) - 1;
                if (idx >= 0 && idx < ncols) return idx;
            }
            m = /^第(\d+)列$/.exec(key);
            if (m) {
                var idx2 = Number(m[1]) - 1;
                if (idx2 >= 0 && idx2 < ncols) return idx2;
            }
            var sample = info.names.slice(0, 6).join('、');
            throw SqlError('没有这一列「' + name + '」，可用的是：' + sample + (ncols > 6 ? ' …' : ''),
                null);
        }

        // 聚合节点 -> 槽位
        var aggNodes = [];
        var aggSlot = new Map();

        function collectAgg(node) {
            if (!node || typeof node !== 'object') return;
            if (node.k === 'call' && AGG[node.name]) {
                if (!aggSlot.has(node)) {
                    aggSlot.set(node, aggNodes.length);
                    aggNodes.push(node);
                }
                // 聚合参数里再有聚合就没意义了，不递归
                return;
            }
            if (node.k === 'bin') { collectAgg(node.l); collectAgg(node.r); return; }
            if (node.k === 'un') { collectAgg(node.x); return; }
            if (node.k === 'like') { collectAgg(node.x); collectAgg(node.pat); return; }
            if (node.k === 'between') { collectAgg(node.x); collectAgg(node.lo); collectAgg(node.hi); return; }
            if (node.k === 'in') {
                collectAgg(node.x);
                (node.list || []).forEach(collectAgg);
                return;
            }
            if (node.k === 'isnull') { collectAgg(node.x); return; }
            if (node.k === 'call') (node.args || []).forEach(collectAgg);
            if (node.k === 'case') {
                if (node.caseExpr) collectAgg(node.caseExpr);
                node.whens.forEach(function (w) { collectAgg(w.when); collectAgg(w.then); });
                if (node.else) collectAgg(node.else);
            }
        }

        // 行上下文：列引用直接读 row[idx]
        function rowExpr(node) {
            if (!node) return function () { return null; };
            switch (node.k) {
                case 'num': {
                    var nv = node.v;
                    return function () { return nv; };
                }
                case 'str': {
                    var sv = node.v;
                    return function () { return sv; };
                }
                case 'null':
                    return function () { return null; };
                case 'col': {
                    var idx = resolve(node.name);
                    return function (row) { return row[idx]; };
                }
                case 'star':
                    // 只在 count(*) 里合法
                    return function () { return 1; };
                case 'un': {
                    if (node.op === 'not') {
                        var xi = rowExpr(node.x);
                        return function (row) { return truthy(xi(row)) ? 0 : 1; };
                    }
                    var xn = rowExpr(node.x);
                    return function (row) {
                        var v = toNum(xn(row));
                        return v === null ? null : -v;
                    };
                }
                case 'bin': {
                    var l = rowExpr(node.l);
                    var r = rowExpr(node.r);
                    return binary(node.op, l, r);
                }
                case 'like': {
                    var xl = rowExpr(node.x);
                    var pl = rowExpr(node.pat);
                    var re = likeRegex(node.pat);
                    var negL = !!node.not;
                    if (re) {
                        return function (row) {
                            var v = xl(row);
                            if (v == null || v === '') return 0;
                            var hit = re.test(String(v));
                            return negL ? (hit ? 0 : 1) : (hit ? 1 : 0);
                        };
                    }
                    return function (row) {   // 模式是列，只能逐行构造
                        var v = xl(row);
                        if (v == null || v === '') return 0;
                        var hit = likeTest(String(v), String(pl(row) == null ? '' : pl(row)));
                        return negL ? (hit ? 0 : 1) : (hit ? 1 : 0);
                    };
                }
                case 'between': {
                    var xb = rowExpr(node.x);
                    var lo = rowExpr(node.lo);
                    var hi = rowExpr(node.hi);
                    var negB = !!node.not;
                    return function (row) {
                        var v = xb(row);
                        if (v == null || v === '') return 0;
                        var hit = compareValues(v, lo(row)) >= 0 && compareValues(v, hi(row)) <= 0;
                        return negB ? (hit ? 0 : 1) : (hit ? 1 : 0);
                    };
                }
                case 'in': {
                    var xi2 = rowExpr(node.x);
                    var fns = (node.list || []).map(rowExpr);
                    var negI = !!node.not;
                    return function (row) {
                        var v = xi2(row);
                        // NULL NOT IN (...) 在 SQL 里是 NULL（falsy），NULL IN (...) 也一样
                        if (v == null || v === '') return negI ? null : 0;
                        var hasNull = false;
                        var hit = false;
                        for (var i = 0; i < fns.length; i++) {
                            var fv = fns[i](row);
                            if (fv == null || fv === '') { hasNull = true; continue; }
                            if (compareValues(v, fv) === 0) { hit = true; break; }
                        }
                        if (hit) return negI ? 0 : 1;
                        if (hasNull) return null;   // NOT IN 搭配 NULL 元素 → NULL
                        return negI ? 1 : 0;
                    };
                }
                case 'isnull': {
                    var xn2 = rowExpr(node.x);
                    var negN = !!node.not;
                    return function (row) {
                        var v = xn2(row);
                        var empty = v == null || v === '';
                        return negN ? !empty : empty;
                    };
                }
                case 'call':
                    return scalarCall(node, rowExpr);
                case 'case': {
                    // 简单 CASE：CASE expr WHEN val THEN result
                    // 搜索 CASE：CASE WHEN cond THEN result
                    var caseExprFn = node.caseExpr ? rowExpr(node.caseExpr) : null;
                    var whenFns = node.whens.map(function (w) {
                        return { when: rowExpr(w.when), then: rowExpr(w.then) };
                    });
                    var elseFn = node.else ? rowExpr(node.else) : null;
                    return function (row) {
                        var caseVal = caseExprFn ? caseExprFn(row) : null;
                        for (var i = 0; i < whenFns.length; i++) {
                            if (caseExprFn) {
                                // 简单 CASE：拿 caseVal 跟 WHEN 值比
                                var wv = whenFns[i].when(row);
                                if (caseVal != null && caseVal !== '' &&
                                    wv != null && wv !== '' &&
                                    compareValues(caseVal, wv) === 0) {
                                    return whenFns[i].then(row);
                                }
                            } else {
                                // 搜索 CASE：WHEN 条件为真
                                if (truthy(whenFns[i].when(row))) {
                                    return whenFns[i].then(row);
                                }
                            }
                        }
                        return elseFn ? elseFn(row) : null;
                    };
                }
                default:
                    return function () { return null; };
            }
        }

        // 组上下文：聚合读累加器，普通列取这一组的第一行
        function groupExpr(node) {
            if (!node) return function () { return null; };
            if (node.k === 'call' && AGG[node.name]) {
                var slot = aggSlot.get(node);
                // 累加器是中间态（{n, sum} / {has, v}），取值时必须走 finalize
                return function (g) { return finalize(aggPlan[slot], g.acc[slot]); };
            }
            switch (node.k) {
                /*
                 * 已经算好的取值函数（HAVING 里的 SELECT 别名会被换成这种节点，
                 * 见下面的 substituteAliases）。函数本身就是最终值，直接调用即可。
                 */
                case 'val':
                    return typeof node.fn === 'function' ? node.fn : function () { return null; };
                case 'col': {
                    var idx = resolve(node.name);
                    return function (g) { return g.first ? g.first[idx] : null; };
                }
                case 'bin': {
                    var l = groupExpr(node.l);
                    var r = groupExpr(node.r);
                    return binary(node.op, l, r);
                }
                case 'un': {
                    if (node.op === 'not') {
                        var xi = groupExpr(node.x);
                        return function (g) { return truthy(xi(g)) ? 0 : 1; };
                    }
                    var xn = groupExpr(node.x);
                    return function (g) {
                        var v = toNum(xn(g));
                        return v === null ? null : -v;
                    };
                }
                case 'like':
                case 'between':
                case 'in':
                case 'isnull': {
                    // 这些条件里若带聚合，就按组求值；不带聚合走行求值更快
                    var hasAgg = containsAgg(node);
                    if (!hasAgg) return wrapRowAsGroup(rowExpr(node));
                    return predicateGroup(node);
                }
                case 'call':
                    return scalarCall(node, groupExpr);
                case 'case': {
                    var caseExprFnG = node.caseExpr ? groupExpr(node.caseExpr) : null;
                    var whenFnsG = node.whens.map(function (w) {
                        return { when: groupExpr(w.when), then: groupExpr(w.then) };
                    });
                    var elseFnG = node.else ? groupExpr(node.else) : null;
                    return function (g) {
                        var caseVal = caseExprFnG ? caseExprFnG(g) : null;
                        for (var i = 0; i < whenFnsG.length; i++) {
                            if (caseExprFnG) {
                                var wv = whenFnsG[i].when(g);
                                if (caseVal != null && caseVal !== '' &&
                                    wv != null && wv !== '' &&
                                    compareValues(caseVal, wv) === 0) {
                                    return whenFnsG[i].then(g);
                                }
                            } else {
                                if (truthy(whenFnsG[i].when(g))) {
                                    return whenFnsG[i].then(g);
                                }
                            }
                        }
                        return elseFnG ? elseFnG(g) : null;
                    };
                }
                default:
                    return rowExpr(node) ? wrapRowAsGroup(rowExpr(node)) : function () { return null; };
            }
        }

        function wrapRowAsGroup(fn) {
            return function (g) { return fn(g.first || []); };
        }

        function containsAgg(node) {
            if (!node || typeof node !== 'object') return false;
            if (node.k === 'call' && AGG[node.name]) return true;
            if (node.k === 'bin') return containsAgg(node.l) || containsAgg(node.r);
            if (node.k === 'un') return containsAgg(node.x);
            if (node.k === 'call') return (node.args || []).some(containsAgg);
            if (node.k === 'in') return containsAgg(node.x) || (node.list || []).some(containsAgg);
            if (node.k === 'between') return containsAgg(node.x) || containsAgg(node.lo) || containsAgg(node.hi);
            if (node.k === 'like') return containsAgg(node.x) || containsAgg(node.pat);
            if (node.k === 'isnull') return containsAgg(node.x);
            if (node.k === 'case') {
                if (node.caseExpr && containsAgg(node.caseExpr)) return true;
                return node.whens.some(function (w) { return containsAgg(w.when) || containsAgg(w.then); })
                    || (node.else && containsAgg(node.else));
            }
            return false;
        }

        // 语句里有没有引用表列：没有 FROM 又没引用列（SELECT 1+1）就只出一行
        function hasColRef(node) {
            if (!node || typeof node !== 'object') return false;
            if (node.k === 'col') return true;
            if (node.k === 'bin') return hasColRef(node.l) || hasColRef(node.r);
            if (node.k === 'un') return hasColRef(node.x);
            if (node.k === 'call') return (node.args || []).some(hasColRef);
            if (node.k === 'in') return hasColRef(node.x) || (node.list || []).some(hasColRef);
            if (node.k === 'between') return hasColRef(node.x) || hasColRef(node.lo) || hasColRef(node.hi);
            if (node.k === 'like') return hasColRef(node.x) || hasColRef(node.pat);
            if (node.k === 'isnull') return hasColRef(node.x);
            if (node.k === 'case') {
                if (node.caseExpr && hasColRef(node.caseExpr)) return true;
                return node.whens.some(function (w) { return hasColRef(w.when) || hasColRef(w.then); })
                    || (node.else && hasColRef(node.else));
            }
            return false;
        }

        function predicateGroup(node) {
            var k = node.k;
            if (k === 'bin' && (node.op === 'and' || node.op === 'or')) {
                var l = predicateGroup(node.l);
                var r = predicateGroup(node.r);
                if (node.op === 'and') return function (g) { return l(g) && r(g); };
                return function (g) { return l(g) || r(g); };
            }
            var v = groupExpr(node);
            return function (g) { return truthy(v(g)); };
        }

        /* ---- 聚合累加器 ---- */

        // 注意：aggNodes 要等 SELECT 子句扫完（collectAgg）才有内容，
        // 所以这里只留一个空的，等下面 outCols 建好再真正算一遍。
        var aggPlan = [];

        function buildAggPlan() {
            return aggNodes.map(function (node) {
                var name = node.name;
                var argNode = node.args && node.args.length ? node.args[0] : null;
                var star = !argNode || argNode.k === 'star';
                var argFn = star ? null : rowExpr(argNode);
                // group_concat 的第二个参数是分隔符（字符串字面量）
                var sep = ',';
                if (name === 'group_concat' && node.args && node.args.length >= 2) {
                    var sepNode = node.args[1];
                    if (sepNode && sepNode.k === 'str') sep = sepNode.v;
                }
                return {
                    name: name,
                    argFn: argFn,
                    star: star,
                    distinct: !!node.distinct,
                    many: name === 'group_concat',
                    sep: sep
                };
            });
        }

        /**
         * 每个聚合一个 state，更新器按类型建一次。
         * 单遍扫描：5 万行 × 3 个聚合 = 15 万次闭包调用，实测在 10 ms 内。
         */
        function newState(plan) {
            if (plan.name === 'count') return plan.distinct ? { set: new Set(), n: 0 } : { n: 0 };
            if (plan.name === 'sum' || plan.name === 'avg') {
                return plan.distinct ? { set: new Set(), sum: 0, n: 0 } : { sum: 0, n: 0 };
            }
            if (plan.name === 'min' || plan.name === 'max') return { has: false, v: null };
            if (plan.name === 'group_concat') return { set: new Set(), parts: [] };
            return {};
        }

        function updater(plan, slotName) {
            var fn = plan.argFn;
            if (plan.name === 'count') {
                if (plan.distinct) {
                    return function (st, row) {
                        var v = fn(row);
                        if (v == null || v === '') return;
                        var key = String(v);
                        if (!st.set.has(key)) { st.set.add(key); st.n++; }
                    };
                }
                if (plan.star) {
                    return function (st) { st.n++; };
                }
                return function (st, row) {
                    var v = fn(row);
                    if (v != null && v !== '') st.n++;
                };
            }
            if (plan.name === 'sum' || plan.name === 'avg') {
                if (plan.distinct) {
                    return function (st, row) {
                        var v = fn(row);
                        if (v == null || v === '') return;
                        var key = String(v);
                        if (st.set.has(key)) return;
                        st.set.add(key);
                        var n = toNum(v);
                        if (n !== null) { st.sum += n; st.n++; }
                    };
                }
                return function (st, row) {
                    var n = toNum(fn(row));
                    if (n !== null) { st.sum += n; st.n++; }
                };
            }
            if (plan.name === 'min') {
                return function (st, row) {
                    var v = fn(row);
                    if (v == null || v === '') return;
                    // 数值列存数字（toNum），文本列存原值
                    var n = toNum(v);
                    var cv = n !== null ? n : v;
                    if (!st.has) { st.has = true; st.v = cv; return; }
                    var na = toNum(st.v), nb = toNum(v);
                    if (na !== null && nb !== null) { if (nb < na) st.v = nb; }
                    else if (String(v) < String(st.v)) st.v = v;
                };
            }
            if (plan.name === 'max') {
                return function (st, row) {
                    var v = fn(row);
                    if (v == null || v === '') return;
                    var n = toNum(v);
                    var cv = n !== null ? n : v;
                    if (!st.has) { st.has = true; st.v = cv; return; }
                    var na = toNum(st.v), nb = toNum(v);
                    if (na !== null && nb !== null) { if (nb > na) st.v = nb; }
                    else if (String(v) > String(st.v)) st.v = v;
                };
            }
            return function (st, row) {
                var v = fn(row);
                if (v == null) return;
                var key = String(v);
                if (st.set.has(key)) return;
                if (st.parts.length >= 200) return;   // 一组几万个值拼起来没意义
                st.set.add(key);
                st.parts.push(key);
            };
        }

        function finalize(plan, st) {
            if (!st) return null;
            if (plan.name === 'count') return st.n;
            if (plan.name === 'sum') return st.n ? st.sum : null;
            if (plan.name === 'avg') return st.n ? st.sum / st.n : null;
            if (plan.name === 'min' || plan.name === 'max') return st.has ? st.v : null;
            if (plan.name === 'group_concat') return st.parts.length ? st.parts.join(plan.sep || ',') : null;
            return null;
        }

        /* ---- 结果列 ---- */

        // 输出列：star 展开的直接记住源列下标（idx），表达式列留 node 待编译
        var outCols = [];

        ast.items.forEach(function (item) {
            if (item.expr.k === 'star') {
                if (item.alias) {
                    // SELECT * AS x 没意义，当第一列处理
                    outCols.push({ name: item.alias, node: { k: 'col', name: 'c1' }, idx: null });
                    return;
                }
                for (var i = 0; i < ncols; i++) {
                    outCols.push({ name: info.names[i], node: null, idx: i });
                }
                return;
            }
            collectAgg(item.expr);
            outCols.push({
                name: item.alias || exprLabel(item.expr, info.names),
                node: item.expr,
                idx: null
            });
        });

        // HAVING / ORDER BY 里的聚合是另一份 AST 节点，也要各占一个槽位：
        // 只在 SELECT 里收集会让 `HAVING SUM(x) > 4` 拿到 undefined 的累加器
        if (ast.having) collectAgg(ast.having);
        if (ast.orderBy) ast.orderBy.forEach(function (o) { collectAgg(o.expr); });

        // 聚合查询的判定：有 GROUP BY，或任一子句里出现聚合函数
        var isAggQuery = !!(ast.groupBy && ast.groupBy.length)
            || outCols.some(function (c) { return c.node && containsAgg(c.node); });
        if (ast.having) isAggQuery = isAggQuery || containsAgg(ast.having);
        if (ast.orderBy) {
            ast.orderBy.forEach(function (o) { isAggQuery = isAggQuery || containsAgg(o.expr); });
        }
        // 非聚合查询里出现聚合函数（SELECT count(*) 但不分组）也算聚合：
        // collectAgg 已经把槽位分好，isAggQuery 由 containsAgg 覆盖。

        // SELECT 子句扫完了，聚合槽位都齐了，这时候才能把累加器计划定下来
        aggPlan = buildAggPlan();

        var updaters = aggPlan.map(updater);

        var groupFns = null;
        if (ast.groupBy && ast.groupBy.length) {
            /*
             * GROUP BY 支持 SELECT 别名：SELECT region AS r ... GROUP BY r
             * 别名不是表里的列，所以先看 SELECT 输出列里有没有同名别名，
             * 有就把别名对应的原始表达式拿过来编译（不是替换成 groupExpr 闭包——
             * GROUP BY 要按行求值，不是按组）。
             * 与真列同名时以真列优先。
             */
            groupFns = ast.groupBy.map(function (e) {
                if (e.k === 'col') {
                    var key = String(e.name == null ? '' : e.name).trim().toLowerCase();
                    if (info.index[key] == null) {
                        // 不是表里的真列 → 在 SELECT 别名里找
                        for (var i = 0; i < outCols.length; i++) {
                            if (String(outCols[i].name || '').toLowerCase() === key && outCols[i].node) {
                                return rowExpr(outCols[i].node);
                            }
                        }
                    }
                }
                return rowExpr(e);
            });
        }

        var whereFn = ast.where ? rowExpr(ast.where) : null;

        /*
         * HAVING 里能直接用 SELECT 的别名（MySQL / SQLite 都这么写：「HAVING n > 1」）。
         * 别名不是表里的列，所以先把 AST 里命中别名的 col 节点换成「取输出列的值」的节点，
         * 求值链路一个字都不用改。与真列同名时以真列优先——那是用户表里本来就有的列。
         */
        function shallowCopy(obj) {
            var out = {};
            for (var key in obj) out[key] = obj[key];
            return out;
        }

        function aliasValueNode(col) {
            // HAVING 只在分组路径上求值，所以别名一律按「组」取：聚合列走累加器，
            // 普通列取这一组的第一行——两种都能由 groupExpr 一个入口搞定
            if (col.node) return { k: 'val', fn: groupExpr(col.node) };
            var idx = col.idx;
            return { k: 'val', fn: function (g) { return g && g.first ? g.first[idx] : null; } };
        }

        function substituteAliases(node) {
            if (!node || typeof node !== 'object') return node;
            if (node.k === 'col') {
                var key = String(node.name == null ? '' : node.name).trim().toLowerCase();
                if (info.index[key] != null) return node;
                for (var i = 0; i < outCols.length; i++) {
                    if (String(outCols[i].name || '').toLowerCase() === key) return aliasValueNode(outCols[i]);
                }
                return node;
            }
            /*
             * 聚合调用整个原样返回：累加器槽位（aggSlot）是按节点身份登记的，
             * 克隆一个新节点会让 aggSlot.get() 取不到，`HAVING SUM(b) > 4` 就永远为假。
             * 聚合的参数只可能是表里真有的列，本来也不需要换别名。
             */
            if (node.k === 'call' && AGG[node.name]) return node;
            // CASE 节点：递归处理 caseExpr / whens / else
            if (node.k === 'case') {
                var cloned2 = null;
                if (node.caseExpr) {
                    var ce = substituteAliases(node.caseExpr);
                    if (ce !== node.caseExpr) { cloned2 = cloned2 || shallowCopy(node); cloned2.caseExpr = ce; }
                }
                var newWhens = node.whens.map(function (w) {
                    var nw = substituteAliases(w.when);
                    var nt = substituteAliases(w.then);
                    if (nw === w.when && nt === w.then) return w;
                    cloned2 = cloned2 || shallowCopy(node);
                    return { when: nw, then: nt };
                });
                if (newWhens !== node.whens) { cloned2 = cloned2 || shallowCopy(node); cloned2.whens = newWhens; }
                if (node.else) {
                    var ne = substituteAliases(node.else);
                    if (ne !== node.else) { cloned2 = cloned2 || shallowCopy(node); cloned2.else = ne; }
                }
                return cloned2 || node;
            }
            var cloned = null;
            var kids = ['l', 'r', 'x', 'lo', 'hi', 'pat'];
            for (var k = 0; k < kids.length; k++) {
                if (!node[kids[k]]) continue;
                var next = substituteAliases(node[kids[k]]);
                if (next === node[kids[k]]) continue;
                cloned = cloned || shallowCopy(node);
                cloned[kids[k]] = next;
            }
            var lists = ['list', 'args'];
            for (var j = 0; j < lists.length; j++) {
                var arr = node[lists[j]];
                if (!arr || !arr.length) continue;
                var mapped = arr.map(substituteAliases);
                if (mapped.every(function (v, n) { return v === arr[n]; })) continue;
                cloned = cloned || shallowCopy(node);
                cloned[lists[j]] = mapped;
            }
            return cloned || node;
        }

        var havingFn = ast.having ? predicateGroup(substituteAliases(ast.having)) : null;

        // 输出列取值：聚合查询用 groupExpr（组内第一行 / 累加器），否则用 rowExpr
        var valueFns = outCols.map(function (col) {
            if (!col.node) return null;   // star 展开的列按 idx 直接取
            return isAggQuery ? groupExpr(col.node) : rowExpr(col.node);
        });

        // 每一列的取值函数（对「源」求值：非聚合查询是 row，聚合查询是 group）
        function colAccessor(i) {
            var col = outCols[i];
            if (col.idx != null) {
                var idx = col.idx;
                if (isAggQuery) {
                    return function (src) { return src && src.first ? src.first[idx] : null; };
                }
                return function (src) { return src[idx]; };
            }
            return valueFns[i];
        }

        // ORDER BY：别名 / 序号 / 表达式，统一对「源」求值
        var orderFns = null;
        var orderDescs = null;
        if (ast.orderBy && ast.orderBy.length) {
            orderFns = [];
            orderDescs = [];
            ast.orderBy.forEach(function (o) {
                orderDescs.push(!!o.desc);
                var e = o.expr;
                // ORDER BY 1 = 第一个输出列
                if (e.k === 'num') {
                    var n = Math.floor(e.v);
                    if (n >= 1 && n <= outCols.length) {
                        orderFns.push(colAccessor(n - 1));
                        return;
                    }
                }
                if (e.k === 'col') {
                    var lower = e.name.toLowerCase();
                    for (var i = 0; i < outCols.length; i++) {
                        if (String(outCols[i].name).toLowerCase() === lower) {
                            orderFns.push(colAccessor(i));
                            return;
                        }
                    }
                }
                // ORDER BY 表达式里可能含 SELECT 别名（ORDER BY n + 1）：
                // 先替换别名再编译
                orderFns.push(isAggQuery ? groupExpr(substituteAliases(e)) : rowExpr(substituteAliases(e)));
            });
        }

        var limitFn = ast.limit;
        var offsetFn = ast.offset;

        // 没写 FROM 又没碰任何列：SELECT 7 % 4 这种只该出一行
        var singleton = !ast.from
            && !outCols.some(function (c) { return c.node && hasColRef(c.node); });

        return {
            plan: {
                table: { names: info.names, ncols: ncols },
                outCols: outCols.map(function (c) { return c.name; }),
                colIdx: outCols.map(function (c) { return c.idx; }),
                accessors: outCols.map(function (_, i) { return colAccessor(i); }),
                singleton: singleton,
                isAggQuery: isAggQuery,
                distinct: !!ast.distinct,
                hasGroup: !!groupFns,
                whereFn: whereFn,
                havingFn: havingFn,
                groupFns: groupFns,
                orderFns: orderFns,
                orderDescs: orderDescs,
                limit: limitFn,
                offset: offsetFn,
                aggPlan: aggPlan,
                updaters: updaters,
                newState: newState,
                finalize: finalize
            }
        };
    }

    function likeRegex(node) {
        if (!node || node.k !== 'str') return null;
        return likePattern(node.v);
    }

    var likeCache = new Map();

    function likePattern(pat) {
        var cached = likeCache.get(pat);
        if (cached) return cached;
        var src = '';
        for (var i = 0; i < pat.length; i++) {
            var ch = pat[i];
            if (ch === '%') src += '[\\s\\S]*';
            else if (ch === '_') src += '[\\s\\S]';
            else src += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }
        var re;
        try {
            re = new RegExp('^' + src + '$', 'i');
        } catch (e) {
            re = null;
        }
        if (likeCache.size > 200) likeCache.clear();
        if (re) likeCache.set(pat, re);
        return re;
    }

    function likeTest(value, pat) {
        var re = likePattern(pat);
        return re ? re.test(value) : false;
    }

    // 二元运算的四种形态：比较 / 算术 / 逻辑 / 拼接
    function binary(op, l, r) {
        if (op === 'and') {
            return function (x) { return (truthy(l(x)) && truthy(r(x))) ? 1 : 0; };
        }
        if (op === 'or') {
            return function (x) { return (truthy(l(x)) || truthy(r(x))) ? 1 : 0; };
        }
        if (op === '||') {
            return function (x) {
                var a = l(x);
                var b = r(x);
                return (a == null ? '' : String(a)) + (b == null ? '' : String(b));
            };
        }
        if (op === '=' || op === '!=') {
            var neg = op === '!=';
            return function (x) {
                var a = l(x);
                var b = r(x);
                // SQL 三值逻辑：任一侧为 NULL（空串按 null 处理）时，比较结果为 NULL（falsy）
                if (a == null || a === '' || b == null || b === '') return null;
                var eq = compareValues(a, b) === 0;
                return neg ? (eq ? 0 : 1) : (eq ? 1 : 0);
            };
        }
        if (op === '>' || op === '>=' || op === '<' || op === '<=') {
            return function (x) {
                var a = l(x);
                var b = r(x);
                if (a == null || a === '' || b == null || b === '') return null;
                var c = compareValues(a, b);
                if (op === '>') return c > 0 ? 1 : 0;
                if (op === '>=') return c >= 0 ? 1 : 0;
                if (op === '<') return c < 0 ? 1 : 0;
                return c <= 0 ? 1 : 0;
            };
        }
        return function (x) {
            var a = toNum(l(x));
            var b = toNum(r(x));
            if (a === null || b === null) return null;
            if (op === '+') return a + b;
            if (op === '-') return a - b;
            if (op === '*') return a * b;
            if (op === '/') return b === 0 ? null : a / b;
            if (op === '%') return b === 0 ? null : a % b;
            return null;
        };
    }

    function scalarCall(node, build) {
        var name = node.name;
        var args = (node.args || []).map(build);

        if (name === 'coalesce' || name === 'ifnull') {
            return function (x) {
                for (var i = 0; i < args.length; i++) {
                    var v = args[i](x);
                    if (v != null && v !== '') return v;
                }
                return null;
            };
        }
        if (name === 'round') {
            return function (x) {
                var v = toNum(args[0] ? args[0](x) : null);
                if (v === null) return null;
                var digits = args[1] ? toNum(args[1](x)) : 0;
                digits = digits === null ? 0 : Math.max(0, Math.min(10, Math.floor(digits)));
                var p = Math.pow(10, digits);
                return Math.round(v * p) / p;
            };
        }
        if (name === 'abs') {
            return function (x) {
                var v = toNum(args[0] ? args[0](x) : null);
                return v === null ? null : Math.abs(v);
            };
        }
        if (name === 'floor' || name === 'ceil') {
            var fn = name === 'floor' ? Math.floor : Math.ceil;
            return function (x) {
                var v = toNum(args[0] ? args[0](x) : null);
                return v === null ? null : fn(v);
            };
        }
        if (name === 'upper' || name === 'lower') {
            var up = name === 'upper';
            return function (x) {
                var v = args[0] ? args[0](x) : null;
                if (v == null) return null;
                var s = String(v);
                return up ? s.toUpperCase() : s.toLowerCase();
            };
        }
        if (name === 'trim') {
            return function (x) {
                var v = args[0] ? args[0](x) : null;
                return v == null ? null : String(v).trim();
            };
        }
        if (name === 'length') {
            return function (x) {
                var v = args[0] ? args[0](x) : null;
                return v == null ? 0 : String(v).length;
            };
        }
        if (name === 'substr' || name === 'substring') {
            return function (x) {
                var v = args[0] ? args[0](x) : null;
                if (v == null) return null;
                var s = String(v);
                var start = toNum(args[1] ? args[1](x) : 1);
                start = start === null ? 1 : Math.floor(start);
                if (start < 0) start = Math.max(0, s.length + start);
                else start = Math.max(0, start - 1);
                if (!args[2]) return s.slice(start);
                var len = toNum(args[2](x));
                return s.slice(start, start + (len === null ? 0 : Math.max(0, Math.floor(len))));
            };
        }
        // 认不出的函数：报错，别静默返回 null（用户拼错 SUMM 以为结果是对的）
        throw SqlError('认不出的函数「' + name + '」', node.at || -1);
    }

    function exprLabel(node, names) {
        if (!node) return '?';
        if (node.k === 'col') {
            var at = names.indexOf(node.name);
            return at >= 0 ? names[at] : node.name;
        }
        if (node.k === 'call') {
            var inner = (node.args || []).map(function (a) { return exprLabel(a, names); }).join(', ');
            return node.name + '(' + (node.distinct ? 'distinct ' : '') + inner + ')';
        }
        if (node.k === 'num') return String(node.v);
        if (node.k === 'str') return "'" + node.v + "'";
        if (node.k === 'bin') return exprLabel(node.l, names) + ' ' + node.op + ' ' + exprLabel(node.r, names);
        if (node.k === 'un') return node.op + ' ' + exprLabel(node.x, names);
        if (node.k === 'star') return '*';
        if (node.k === 'case') {
            var parts = ['CASE'];
            if (node.caseExpr) parts.push(exprLabel(node.caseExpr, names));
            node.whens.forEach(function (w) {
                parts.push('WHEN', exprLabel(w.when, names), 'THEN', exprLabel(w.then, names));
            });
            if (node.else) parts.push('ELSE', exprLabel(node.else, names));
            parts.push('END');
            return parts.join(' ');
        }
        return '表达式';
    }

    /* ------------------------------ 执行 ------------------------------ */

    /*
     * 执行拆成「可切片」的跑批器：step(budget) 处理 budget 行就返回，
     * 全部做完才返回 true。两个入口共用它——
     *   execute()       一口气跑完（测试、小数据、纯函数场景）
     *   executeAsync()  每片之间让出主线程，带进度回调与取消检查（界面用）
     *
     * 为什么不让出主线程不行：5 万行聚合在桌面上 13 ms 没事，但十万行 × 十几列、
     * 或者宿主跑在低配机器上，一次跑完就是几百毫秒的白屏——宿主 WebView 会当成卡死。
     */
    function createRunner(plan, rows, options) {
        var opts = options || {};
        var maxRows = typeof opts.maxRows === 'number' && opts.maxRows > 0 ? opts.maxRows : LIMITS.result;
        var data = plan.singleton ? [[]] : (rows || []);
        var started = now();

        var accessors = plan.accessors;
        var nOut = accessors.length;
        var limit = evalBound(plan.limit);
        var offset = Math.max(0, evalBound(plan.offset) || 0);
        // 有 offset 时得多取 offset 行才够切，否则「第 2 页」会短一截。
        // DISTINCT 例外：去重前不知道多少行才够，只能扫完（不然 LIMIT 4 会先切掉
        // 前 4 行再去重，结果只剩两行）
        var want = plan.distinct
            ? Infinity
            : (limit == null ? maxRows : Math.min(maxRows, limit)) + offset;
        var entries = [];      // { v: 输出行, src: 源行 / 组 } —— 排序键要对源求值
        var truncated = false;
        var matched = 0;

        var needSort = !!plan.orderFns;
        var whereFn = plan.whereFn;
        var phase = 'scan';
        var i = 0;
        var done = false;
        var result = null;

        // 聚合用
        var groupFns = plan.groupFns;
        var gcount = groupFns ? groupFns.length : 0;
        var updaters = plan.updaters;
        var aggPlans = plan.aggPlan || [];
        var nAgg = aggPlans.length;
        var groups = plan.isAggQuery ? new Map() : null;
        var groupList = null;
        var gi = 0;

        function scanRows(stop) {
            for (; i < stop; i++) {
                var row = data[i];
                if (whereFn && !truthy(whereFn(row))) continue;
                var vals = new Array(nOut);
                for (var c = 0; c < nOut; c++) vals[c] = accessors[c](row);
                entries.push({ v: vals, src: row });
                // 不排序时命中上限就停：5 万行里要前 20 行，没必要扫完
                if (!needSort && entries.length >= want) { i = data.length; break; }
            }
        }

        function scanGroups(stop) {
            var keyBuf;
            for (; i < stop; i++) {
                var rw = data[i];
                if (whereFn && !truthy(whereFn(rw))) continue;
                var key;
                if (!groupFns) {
                    key = '\u0000';
                } else if (gcount === 1) {
                    key = String(groupFns[0](rw));
                } else {
                    keyBuf = new Array(gcount);
                    for (var g = 0; g < gcount; g++) keyBuf[g] = groupFns[g](rw);
                    key = keyBuf.join('\u0001');
                }
                var grp = groups.get(key);
                if (!grp) {
                    grp = { first: rw, acc: new Array(nAgg) };
                    for (var a = 0; a < nAgg; a++) grp.acc[a] = plan.newState(aggPlans[a]);
                    groups.set(key, grp);
                }
                for (var u = 0; u < nAgg; u++) updaters[u](grp.acc[u], rw);
            }
        }

        function finishGroups(stop) {
            for (; gi < stop; gi++) {
                var grp = groupList[gi];
                if (plan.havingFn && !truthy(plan.havingFn(grp))) continue;
                var vals = new Array(nOut);
                for (var c = 0; c < nOut; c++) vals[c] = accessors[c](grp);
                entries.push({ v: vals, src: grp });
            }
        }

        /*
         * SELECT DISTINCT 的整行去重。
         * 键里带上类型：null / '' / 0 / false 是四种不同的值，只用 String() 拼会把它们并成一行。
         */
        function distinctEntries(list) {
            var seen = Object.create(null);
            var out = [];
            for (var k = 0; k < list.length; k++) {
                var vals = list[k].v;
                var key = '';
                for (var c = 0; c < vals.length; c++) {
                    var v = vals[c];
                    key += (v === null || v === undefined ? '\u0001null' : typeof v + ':' + String(v)) + '\u0002';
                }
                if (seen[key]) continue;
                seen[key] = 1;
                out.push(list[k]);
            }
            return out;
        }

        return {
            totalRows: data.length,
            // 处理 budget 行（budget 很大时就是一口气跑完）；返回 true 表示全部完成
            step: function (budget) {
                if (done) return true;
                var n = typeof budget === 'number' && budget > 0 ? budget : 1000000;

                if (phase === 'scan') {
                    if (!plan.isAggQuery) {
                        scanRows(Math.min(data.length, i + n));
                        if (i >= data.length) phase = needSort ? 'sort' : 'slice';
                    } else {
                        scanGroups(Math.min(data.length, i + n));
                        if (i >= data.length) {
                            if (!groups.size && !groupFns) {
                                // 空表 + 没有 GROUP BY：SQL 语义要返回一行（count = 0，其余 null）
                                var empty = { first: null, acc: new Array(nAgg) };
                                for (var e = 0; e < nAgg; e++) empty.acc[e] = plan.newState(aggPlans[e]);
                                groups.set('\u0000', empty);
                            }
                            groupList = [];
                            groups.forEach(function (g) { groupList.push(g); });
                            groups = null;
                            gi = 0;
                            phase = 'groups';
                        }
                    }
                } else if (phase === 'groups') {
                    finishGroups(Math.min(groupList.length, gi + n));
                    if (gi >= groupList.length) {
                        groupList = null;
                        phase = needSort ? 'sort' : 'slice';
                    }
                } else if (phase === 'sort') {
                    // 排序没法再切（Array#sort 是原子的）：5 万行 25 ms，单独一片可以接受
                    entries = sortEntries(entries, plan);
                    phase = 'slice';
                } else if (phase === 'slice') {
                    // SELECT DISTINCT：排序后再去重，留下第一次出现的那条（顺序仍是 ORDER BY 的结果）
                    if (plan.distinct) entries = distinctEntries(entries);
                    matched = entries.length;
                    var sliceTo = offset + (limit == null ? maxRows : Math.min(maxRows, limit));
                    // 只有「没写 LIMIT 但结果被上限砍掉」才算截断；写了 LIMIT 是用户自己要的
                    if (limit == null && matched > sliceTo) truncated = true;
                    entries = entries.slice(offset, sliceTo);
                    done = true;
                }
                return done;
            },
            // 进度：done / total 是「当前阶段的行」，ratio 是跨阶段的整体百分比
            // （扫描占大头，分组收尾 / 排序 / 切片各留一点，保证整体单调不减）
            progress: function () {
                if (phase === 'scan') {
                    var total = data.length;
                    var r = total ? i / total : 1;
                    return {
                        phase: 'scan', done: i, total: total,
                        ratio: r * (plan.isAggQuery ? 0.85 : 0.97)
                    };
                }
                if (phase === 'groups') {
                    var gt = groupList ? groupList.length : 0;
                    var gr = gt ? gi / gt : 1;
                    return { phase: 'groups', done: gi, total: gt, ratio: 0.85 + gr * 0.12 };
                }
                if (phase === 'sort') return { phase: 'sort', done: 0, total: 0, ratio: 0.98 };
                return { phase: 'slice', done: 1, total: 1, ratio: 1 };
            },
            result: function () {
                if (!done) return null;
                if (result) return result;
                var grid = new Array(entries.length);
                for (var k = 0; k < entries.length; k++) {
                    var line = entries[k].v;
                    for (var m = 0; m < line.length; m++) {
                        if (line[m] === undefined) line[m] = null;
                    }
                    grid[k] = line;
                }
                result = {
                    columns: plan.outCols,
                    rows: grid,
                    rowCount: grid.length,
                    matched: matched,
                    truncated: truncated,
                    ms: now() - started
                };
                return result;
            }
        };
    }

    function execute(plan, rows, options) {
        var runner = createRunner(plan, rows, options);
        while (!runner.step()) { /* 一口气跑完 */ }
        return runner.result();
    }

    // 让出主线程：setTimeout(0) 在各家 WebView 里都稳（rAF 在后台标签会停，
    // 而插件被切走时用户可能正等着结果回来）
    function defaultSchedule(fn) {
        if (typeof setTimeout === 'function') setTimeout(fn, 0);
        else fn();
    }

    /*
     * 异步执行：每片 budget 行，然后让出主线程。
     *   options.onProgress({ phase, done, total, ratio })   每片一次
     *   options.isCancelled() -> true                        每片边界问一次，立刻停
     *   options.chunk = 8000                                 一片多少行（默认 8000）
     *   options.schedule(fn)                                 自定义让出方式（测试可同步跑）
     * 返回 { columns, rows, ... } 或 { cancelled: true, ms } 或 { error }
     */
    function executeAsync(plan, rows, options) {
        var opts = options || {};
        var chunk = typeof opts.chunk === 'number' && opts.chunk > 0 ? opts.chunk : 8000;
        var onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;
        var isCancelled = typeof opts.isCancelled === 'function' ? opts.isCancelled : null;
        var schedule = typeof opts.schedule === 'function' ? opts.schedule : defaultSchedule;
        var runner = createRunner(plan, rows, opts);
        var started = now();

        return new Promise(function (resolve) {
            function tick() {
                if (isCancelled && isCancelled()) {
                    resolve({ cancelled: true, ms: now() - started });
                    return;
                }
                var finished;
                try {
                    finished = runner.step(chunk);
                } catch (err) {
                    resolve({ error: String((err && err.message) || err), ms: now() - started });
                    return;
                }
                if (onProgress) {
                    var p = runner.progress();
                    if (p.ratio == null) p.ratio = p.total ? Math.min(1, p.done / p.total) : 0;
                    p.ms = now() - started;
                    try { onProgress(p); } catch (e) { /* 界面回调自己炸了不该拖垮查询 */ }
                }
                if (finished) { resolve(runner.result()); return; }
                schedule(tick);
            }
            schedule(tick);
        });
    }

    // ORDER BY：先把排序键算出来并且转好类型，比较时不再重复求值 / 重复识别数字
    function sortEntries(entries, plan) {
        var fns = plan.orderFns;
        var descs = plan.orderDescs;
        var n = fns.length;
        for (var i = 0; i < entries.length; i++) {
            var e = entries[i];
            var keys = new Array(n);
            for (var k = 0; k < n; k++) {
                var v = fns[k](e.src);
                var num = toNum(v);
                // 能当数字的存数字，其余存字符串：比较时只看 typeof，不再跑正则
                keys[k] = num !== null ? num : (v == null ? '' : String(v));
            }
            e.k = keys;
            e.i = i;
        }
        entries.sort(function (a, b) {
            for (var k = 0; k < n; k++) {
                var ka = a.k[k];
                var kb = b.k[k];
                var c;
                if (typeof ka === 'number' && typeof kb === 'number') {
                    c = ka < kb ? -1 : (ka > kb ? 1 : 0);
                } else {
                    var sa = typeof ka === 'number' ? String(ka) : ka;
                    var sb = typeof kb === 'number' ? String(kb) : kb;
                    c = sa < sb ? -1 : (sa > sb ? 1 : 0);
                }
                if (c) return descs[k] ? -c : c;
            }
            return a.i - b.i;
        });
        return entries;
    }

    // LIMIT / OFFSET 只接受可求值为常量的表达式（数字、负号、简单算术）
    function evalBound(node) {
        if (!node) return null;
        if (node.k === 'num') return Math.max(0, Math.floor(node.v));
        if (node.k === 'un' && node.op === 'neg' && node.x) {
            var v = evalBound(node.x);
            return v === null ? null : 0;   // LIMIT -x → 0
        }
        if (node.k === 'bin') {
            var a = evalBound(node.l);
            var b = evalBound(node.r);
            if (a === null || b === null) return null;
            if (node.op === '+') return Math.max(0, Math.floor(a + b));
            if (node.op === '-') return Math.max(0, Math.floor(a - b));
            if (node.op === '*') return Math.max(0, Math.floor(a * b));
            if (node.op === '/') return b === 0 ? null : Math.max(0, Math.floor(a / b));
            return null;
        }
        return null;
    }

    function now() {
        if (typeof performance !== 'undefined' && performance && typeof performance.now === 'function') {
            return performance.now();
        }
        return Date.now();
    }

    /* ------------------------------ 类型推断 ------------------------------ */

    /*
     * 参考 MySQL 的类型体系给每一列一个「像数据库里那样」的类型：
     *   TINYINT / SMALLINT / INT / BIGINT / DECIMAL(p,s) / DOUBLE
     *   DATE / DATETIME / TIME / BOOLEAN / VARCHAR(n) / TEXT
     *
     * 判断顺序（一个值一个值地投票，全列一致才成立）：
     *   空 -> 不计票；0/1/true/false -> BOOLEAN；
     *   ISO 日期/时间 -> DATE / DATETIME / TIME；
     *   整数（带前导 0 的除外，那是编码不是数字）-> 按范围往上升；
     *   小数 -> DECIMAL(p,s)，p 取「整数位 + 小数位」的最大值；
     *   科学计数法 / 超长数字 -> DOUBLE；
     *   其余 -> VARCHAR(最大字符数)，超过 1024 字符就当 TEXT。
     *
     * 性能：类型只看采样（默认 500 行：开头 200 行 + 均匀抽），
     * 长度必须全扫（只取 length，不算正则），5 万行 × 8 列在 10 ms 量级。
     */

    var SAMPLE_HEAD = 200;
    var SAMPLE_TOTAL = 500;

    function sampleRows(total, limit) {
        if (total <= limit) {
            var all = new Array(total);
            for (var a = 0; a < total; a++) all[a] = a;
            return all;
        }
        var head = Math.min(SAMPLE_HEAD, limit);
        var out = new Array(limit);
        for (var h = 0; h < head; h++) out[h] = h;
        var rest = limit - head;
        var step = (total - head) / rest;
        for (var r = 0; r < rest; r++) out[head + r] = head + Math.floor(r * step);
        return out;
    }

    function isDateValue(s) {
        return /^\d{4}-\d{1,2}-\d{1,2}$/.test(s) && validYmd(s);
    }

    function isDatetimeValue(s) {
        var m = /^(\d{4}-\d{1,2}-\d{1,2})[ T]\d{1,2}:\d{2}(:\d{2})?(\.\d+)?$/.exec(s);
        return !!m && validYmd(m[1]);
    }

    function validYmd(s) {
        var m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
        if (!m) return false;
        var y = Number(m[1]);
        var mo = Number(m[2]);
        var d = Number(m[3]);
        if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
        if (y < 1000 || y > 9999) return false;
        var dim = [31, (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28,
            31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
        return d <= dim;
    }

    function isTimeValue(s) {
        return /^\d{1,2}:\d{2}(:\d{2})?(\.\d+)?$/.test(s);
    }

    function intRangeType(maxAbs) {
        if (maxAbs <= 127) return 'TINYINT';
        if (maxAbs <= 32767) return 'SMALLINT';
        if (maxAbs <= 2147483647) return 'INT';
        return 'BIGINT';
    }

    function niceLength(n) {
        var steps = [16, 32, 64, 128, 255, 512, 1024];
        for (var i = 0; i < steps.length; i++) {
            if (n <= steps[i]) return steps[i];
        }
        return 0;   // 0 表示太长，用 TEXT
    }

    function inferColumnTypes(table, options) {
        var opts = options || {};
        var ncols = table && table.cols ? table.cols : 0;
        var rows = (table && table.rows) || [];
        var detail = opts.detail !== false;
        var cols = [];
        var i;

        for (i = 0; i < ncols; i++) {
            cols.push({
                index: i,
                name: table.header && table.header[i] ? String(table.header[i]).trim() || ('c' + (i + 1)) : ('c' + (i + 1)),
                type: 'VARCHAR(255)',
                base: 'VARCHAR',
                length: 0,
                precision: 0,
                scale: 0,
                nullable: false,
                samples: []
            });
        }
        if (!ncols) return { cols: cols, rows: rows.length, sampled: 0 };

        var idxs = sampleRows(rows.length, opts.samples || SAMPLE_TOTAL);
        var votes = new Array(ncols);
        for (i = 0; i < ncols; i++) {
            votes[i] = {
                empty: 0, bool: 0, int: 0, decimal: 0, date: 0, datetime: 0, time: 0, double: 0, text: 0,
                maxAbs: 0, maxScale: 0, maxIntDigits: 0, maxLen: 0, total: 0
            };
        }

        // 一遍扫完：长度每行都算（要准），类型只对采样行投票
        var sampleSet = null;
        if (rows.length > idxs.length) {
            sampleSet = new Uint8Array(rows.length);
            for (i = 0; i < idxs.length; i++) sampleSet[idxs[i]] = 1;
        }
        var emit = detail ? new Array(ncols) : null;
        for (i = 0; i < ncols; i++) if (detail) emit[i] = [];

        for (var r = 0; r < rows.length; r++) {
            var row = rows[r];
            var sampled = !sampleSet || sampleSet[r] === 1;
            for (var c = 0; c < ncols; c++) {
                var raw = row[c];
                var v = raw == null ? '' : String(raw).trim();
                var st = votes[c];
                if (v.length > st.maxLen) st.maxLen = v.length;
                if (!v) {
                    if (sampled) st.empty++;
                    continue;
                }
                if (!sampled) continue;
                st.total++;
                if (detail && emit[c].length < 3) emit[c].push(v);
                classifyValue(v, st);
            }
        }

        for (i = 0; i < ncols; i++) {
            var st2 = votes[i];
            var col = cols[i];
            col.maxLen = st2.maxLen;      // 原始最长字符数（采样之外也全扫过）
            col.length = st2.maxLen;
            col.nullable = st2.empty > 0 || rows.length === 0;
            col.samples = detail ? emit[i] : [];

            if (st2.total === 0) {
                // 整列空：给个能装下任何东西的，别硬猜
                col.type = 'VARCHAR(255)';
                col.base = 'VARCHAR';
                col.length = 255;
                continue;
            }
            if (st2.bool === st2.total) {
                col.type = 'BOOLEAN';
                col.base = 'BOOLEAN';
                continue;
            }
            if (st2.date === st2.total) { col.type = 'DATE'; col.base = 'DATE'; continue; }
            if (st2.datetime === st2.total) { col.type = 'DATETIME'; col.base = 'DATETIME'; continue; }
            if (st2.time === st2.total) { col.type = 'TIME'; col.base = 'TIME'; continue; }
            if (st2.int === st2.total) {
                var it = intRangeType(st2.maxAbs);
                col.type = it;
                col.base = it;
                continue;
            }
            if ((st2.int + st2.decimal) === st2.total) {
                var scale = st2.maxScale;
                var digits = st2.maxIntDigits + scale;
                if (digits > 18 || scale > 30) {
                    col.type = 'DOUBLE';
                    col.base = 'DOUBLE';
                    continue;
                }
                col.precision = Math.max(1, digits);
                col.scale = scale;
                col.type = 'DECIMAL(' + col.precision + ',' + scale + ')';
                col.base = 'DECIMAL';
                continue;
            }
            if (st2.double === st2.total) { col.type = 'DOUBLE'; col.base = 'DOUBLE'; continue; }

            var len = niceLength(st2.maxLen);
            if (!len) {
                col.type = 'TEXT';
                col.base = 'TEXT';
            } else {
                col.type = 'VARCHAR(' + len + ')';
                col.base = 'VARCHAR';
                col.length = len;
            }
        }
        return { cols: cols, rows: rows.length, sampled: idxs.length };
    }

    /* ------------------------------ 表头嗅探 ------------------------------ */

    /*
     * 「第一行到底是不是表头」——粘贴进来的表格这两种都常见，别让用户每次自己点。
     *
     * 判据（按列投票，rows 只传前二三十行就够）：
     *   1. 第一行是文字、下面的同一列大多是数字 / 日期 → 强证据，是表头；
     *   2. 第一行的某个值在下面又出现了 → 说明它是数据（分类值、单号），不是表头；
     *   3. 第一行整行都是数字 / 日期 → 是数据。
     * 三条都不成立时按「有表头」处理——和界面原来的默认勾选一致，认不准就不乱改。
     */
    function detectHeader(rows, cols) {
        var ncols = cols || (rows && rows[0] ? rows[0].length : 0);
        if (!rows || rows.length < 2 || !ncols) return false;
        var head = rows[0];
        var body = rows.slice(1, 60);
        var strong = 0;      // 文字表头 + 数字列
        var repeats = 0;     // 第一行的值在正文里又出现
        var numericHead = 0; // 第一行本身是数字 / 日期
        var c;
        var r;

        for (c = 0; c < ncols; c++) {
            var h = head[c] == null ? '' : String(head[c]).trim();
            if (!h) continue;
            var bodyNumeric = 0;
            var bodyFilled = 0;
            var seen = false;
            for (r = 0; r < body.length; r++) {
                var v = body[r][c];
                if (v == null || v === '') continue;
                var s = String(v).trim();
                bodyFilled++;
                if (isDateValue(s) || isDatetimeValue(s) || isTimeValue(s)
                    || /^[+-]?\d{1,3}(,\d{3})*(\.\d+)?$/.test(s) || /^[+-]?\d+(\.\d+)?$/.test(s)) {
                    bodyNumeric++;
                }
                if (!seen && s === h) seen = true;
            }
            var headNumeric = isDateValue(h) || isDatetimeValue(h) || isTimeValue(h)
                || /^[+-]?\d{1,3}(,\d{3})*(\.\d+)?$/.test(h) || /^[+-]?\d+(\.\d+)?$/.test(h);
            if (headNumeric) numericHead++;
            if (seen) repeats++;
            else if (bodyFilled && !headNumeric && bodyNumeric / bodyFilled >= 0.6) strong++;
        }

        if (strong >= 1) return true;
        if (numericHead >= Math.ceil(ncols / 2)) return false;
        if (repeats >= Math.ceil(ncols / 2)) return false;
        return true;
    }

    /* ------------------------------ 列名 / 语句建议 ------------------------------ */
    /*
     * 列名规则只有两条：
     *   有表头 → 照抄（空单元格 / 重名补序号 / 撞关键字加前缀）；
     *   没表头 → c1..cN。
     * 曾经试过按内容猜名字（url / amount / day / num1…），看着聪明，实际是让用户
     * 去记一串没规律的词——写 SQL 时还得多打几个字符，得不偿失。
     * `c1..cN` 同时也是 compile 阶段永久保留的别名，老语句不会失效。
     */
    function suggestColumnNames(table, options) {
        var ncols = table && table.cols ? table.cols : 0;
        if (!ncols) return [];
        var names = [];
        for (var i = 0; i < ncols; i++) {
            var head = table.header && table.header.length && table.header[i] != null
                ? String(table.header[i]).trim()
                : '';
            names.push(head || ('c' + (i + 1)));
        }
        return uniqueNames(names);
    }

    function uniqueNames(names) {
        var count = Object.create(null);
        names.forEach(function (n) { count[n] = (count[n] || 0) + 1; });
        var seen = Object.create(null);
        return names.map(function (n) {
            var name = n;
            if (count[n] > 1) {
                seen[n] = (seen[n] || 0) + 1;
                name = n + seen[n];
            }
            if (RESERVED[String(name).toLowerCase()]) name = 'col_' + name;
            return name;
        });
    }

    // 名字里有空格 / 连字符之类，得用反引号裹起来才解析得到
    function sqlIdent(name) {
        var s = String(name == null ? '' : name);
        return /^[A-Za-z_\u4e00-\u9fff][\w\u4e00-\u9fff]*$/.test(s) ? s : '`' + s.replace(/`/g, '') + '`';
    }

    /*
     * 一键生成一句能跑的 SELECT：有「一列少量取值的文本 + 一列金额」就给分组汇总，
     * 否则 `SELECT * FROM t`。只读采样（前 200 行）判断，几万行也是毫秒级。
     */
    function suggestQuery(table, options) {
        var names = suggestColumnNames(table, options);
        var ncols = names.length;
        if (!ncols) return 'SELECT * FROM t';
        var opts = options || {};
        var limit = typeof opts.sampleRows === 'number' && opts.sampleRows > 0 ? opts.sampleRows : 200;
        var rows = (table && table.rows) || [];
        var info = inferColumnTypes(table, { detail: false, samples: 500 });
        var sample = sampleRows(rows.length, Math.min(limit, rows.length));
        var i;

        var groupIdx = -1;
        var groupDistinct = 0;
        for (i = 0; i < ncols; i++) {
            var base = info.cols[i].base;
            if (base !== 'VARCHAR' && base !== 'TEXT') continue;
            var set = new Set();
            for (var k = 0; k < sample.length; k++) {
                var v = rows[sample[k]][i];
                if (v != null && v !== '') set.add(String(v));
                if (set.size > 20) break;
            }
            // 2~15 个取值才适合分组；一列全是唯一值那是主键，不是分类
            if (set.size >= 2 && set.size <= 15 && set.size > groupDistinct) {
                groupIdx = i;
                groupDistinct = set.size;
            }
        }

        // 求和列：先找小数（金额通常是小数），再找整数；跳过分组列本身、
        // 跳过长整数（≥8 位，把主键加起来没有意义）和单位数（0/1 标记）
        var sumIdx = -1;
        var passes = [['DECIMAL', 'DOUBLE', 'FLOAT'], ['INT', 'BIGINT', 'SMALLINT', 'TINYINT']];
        for (var p = 0; p < passes.length && sumIdx < 0; p++) {
            for (i = 0; i < ncols; i++) {
                if (i === groupIdx) continue;
                var col = info.cols[i];
                if (passes[p].indexOf(col.base) < 0) continue;
                if (col.maxLen <= 1) continue;
                if (/INT$/.test(col.base) && col.length >= 8) continue;
                sumIdx = i;
                break;
            }
        }

        if (groupIdx >= 0 && sumIdx >= 0 && rows.length > 1) {
            var g = sqlIdent(names[groupIdx]);
            var s = sqlIdent(names[sumIdx]);
            return 'SELECT ' + g + ', COUNT(*) AS n, SUM(' + s + ') AS total\n'
                + 'FROM t\nGROUP BY ' + g + '\nORDER BY total DESC';
        }
        // 没表头又凑不出汇总句：把列名一个个列出来，比 SELECT * 好读
        if (opts.headerless && ncols > 1) {
            return 'SELECT ' + names.slice(0, 6).map(sqlIdent).join(', ') + '\nFROM t';
        }
        return 'SELECT * FROM t';
    }

    function classifyValue(v, st) {
        if (v === '0' || v === '1' || v === 'true' || v === 'false'
            || v === 'TRUE' || v === 'FALSE') {
            st.bool++;
            // 0/1 同时也是合法的整数，两边都记一份，最后按「全是 0/1」判 BOOLEAN
            if (v === '0' || v === '1') {
                st.int++;
                if (v === '1') st.maxIntDigits = Math.max(st.maxIntDigits, 1);
                st.maxAbs = Math.max(st.maxAbs, Number(v));
            }
            return;
        }
        if (isDateValue(v)) { st.date++; return; }
        if (isDatetimeValue(v)) { st.datetime++; return; }
        if (isTimeValue(v)) { st.time++; return; }

        var digits = v.replace(/,/g, '');
        if (/^[+-]?\d+$/.test(digits)) {
            var neg = digits[0] === '-';
            var body = neg ? digits.slice(1) : digits.replace(/^\+/, '');
            // 前导 0：00123 这种是编码 / 单号，不是数字
            if (body.length > 1 && body[0] === '0') { st.text++; return; }
            var n = Number(digits);
            if (isFinite(n)) {
                st.int++;
                st.maxAbs = Math.max(st.maxAbs, Math.abs(n));
                st.maxIntDigits = Math.max(st.maxIntDigits, body.length);
            } else {
                st.double++;
            }
            return;
        }
        if (/^[+-]?(\d+\.\d+|\.\d+)$/.test(digits)) {
            var dot = digits.indexOf('.');
            var scale = digits.length - dot - 1;
            var intPart = digits.slice(0, dot).replace(/^[+-]/, '');
            st.decimal++;
            st.maxScale = Math.max(st.maxScale, scale);
            st.maxIntDigits = Math.max(st.maxIntDigits, intPart.replace(/^0+/, '').length);
            return;
        }
        if (/^[+-]?(\d+\.?\d*|\.\d+)[eE][+-]?\d+$/.test(digits)) { st.double++; return; }

        st.text++;
    }

    // 给面板用的候选类型（第一项永远是推断出来的那个）
    function typeCandidates(col) {
        var common = ['BIGINT', 'INT', 'SMALLINT', 'DECIMAL(18,2)', 'DOUBLE',
            'DATE', 'DATETIME', 'TIME', 'BOOLEAN', 'VARCHAR(32)', 'VARCHAR(255)', 'TEXT'];
        var out = [];
        if (col && col.type && common.indexOf(col.type) < 0) out.push(col.type);
        return out.concat(common);
    }

    /** MySQL 的 CREATE TABLE：列名反引号，空值按推断给 NULL */
    function toCreateTable(cols, tableName) {
        var name = tableName || 't';
        var lines = (cols || []).map(function (col) {
            var type = col.type === 'BOOLEAN' ? 'TINYINT(1)' : col.type;
            var colName = String(col.name == null ? '' : col.name).replace(/`/g, '``');
            return '  `' + colName + '` ' + type + (col.nullable ? ' NULL' : ' NOT NULL');
        });
        return 'CREATE TABLE `' + String(name).replace(/`/g, '``') + '` (\n'
            + lines.join(',\n') + '\n);';
    }

    /* ------------------------------ 输出 ------------------------------ */

    function formatValue(v) {
        if (v == null) return '';
        if (typeof v === 'boolean') return v ? '1' : '0';
        if (typeof v === 'number') {
            if (!isFinite(v)) return '';
            if (Number.isInteger(v) && Math.abs(v) < 1e21) return String(v);
            // 最多 6 位小数，去掉尾部的 0（0.1+0.2 这类浮点噪音不外露）
            var s = v.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
            return s === '-0' ? '0' : s;
        }
        return String(v);
    }

    function toTsv(result) {
        if (!result || !result.rows) return '';
        var lines = [result.columns.join('\t')];
        result.rows.forEach(function (row) {
            lines.push(row.map(formatValue).join('\t'));
        });
        return lines.join('\n');
    }

    function query(sql, table, options) {
        var parsed = parse(sql);
        if (parsed.error) return { error: parsed.error, errorAt: parsed.errorAt };
        var compiled;
        try {
            compiled = compile(parsed.ast, table || { header: null, rows: [], cols: 0 });
        } catch (err) {
            return { error: (err && err.message) || 'SQL 编译失败', errorAt: err && err.sqlIndex != null ? err.sqlIndex : -1 };
        }
        if (compiled.error) return { error: compiled.error, errorAt: -1 };
        var result = execute(compiled.plan, table ? table.rows : [], options);
        result.plan = compiled.plan;
        result.ast = parsed.ast;
        return result;
    }

    // 异步版：解析 / 编译太快（毫秒以下）照旧同步做，只有扫描那一步切片
    function queryAsync(sql, table, options) {
        var opts = options || {};
        var parsed = parse(sql);
        if (parsed.error) return Promise.resolve({ error: parsed.error, errorAt: parsed.errorAt });
        var compiled;
        try {
            compiled = compile(parsed.ast, table || { header: null, rows: [], cols: 0 });
        } catch (err) {
            return Promise.resolve({
                error: (err && err.message) || 'SQL 编译失败',
                errorAt: err && err.sqlIndex != null ? err.sqlIndex : -1
            });
        }
        if (compiled.error) return Promise.resolve({ error: compiled.error, errorAt: -1 });
        return executeAsync(compiled.plan, table ? table.rows : [], opts).then(function (result) {
            if (result && !result.error && !result.cancelled) {
                result.plan = compiled.plan;
                result.ast = parsed.ast;
            }
            return result;
        });
    }

    return {
        LIMITS: LIMITS,
        AGG: AGG,
        tokenize: tokenize,
        parse: parse,
        compile: compile,
        execute: execute,
        executeAsync: executeAsync,
        query: query,
        queryAsync: queryAsync,
        formatValue: formatValue,
        toTsv: toTsv,
        compareValues: compareValues,
        toNum: toNum,
        inferColumnTypes: inferColumnTypes,
        detectHeader: detectHeader,
        suggestColumnNames: suggestColumnNames,
        suggestQuery: suggestQuery,
        typeCandidates: typeCandidates,
        toCreateTable: toCreateTable,
        lineCol: function (text, index) {
            var src = String(text == null ? '' : text);
            var at = Math.max(0, Math.min(src.length, index || 0));
            var line = 1;
            var last = 0;
            for (var i = 0; i < at; i++) {
                if (src[i] === '\n') { line++; last = i + 1; }
            }
            return { line: line, col: at - last + 1 };
        }
    };
});
