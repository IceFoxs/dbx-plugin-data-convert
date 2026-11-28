/*
 * jsonfmt.js — JSON 格式化内核（纯函数 / 可续跑扫描器，无 DOM、无网络）
 *
 * 为什么不用 `JSON.parse` + `JSON.stringify(text, null, 2)`：
 *  1. 大文件会翻倍吃内存——parse 出来的对象树比原文大好几倍，再 stringify 一份，
 *     一个 20 MB 的 JSON 很容易把宿主 webview 顶到几百 MB；
 *  2. `JSON.parse` 只给一句 "Unexpected token } in JSON at position 12345"，
 *     真要定位还得自己再数一遍行列（Chrome 有行列，别的宿主不一定有）；
 *  3. 数字会被转成 double：`9007199254740993` 这种大整数 parse 完就变了，
 *     而这一页最常见的用途恰恰是看接口返回（ID 经常超过 2^53）。
 *  4. 递归下降解析深嵌套会爆栈（`[[[[…]]]]` 一万层）。
 *
 * 这里是一遍扫描：边看字符边决定缩进、换行、逗号，只产出字符串，不建对象树。
 * 数字按原文抄回去（不经过 Number，所以大整数一位不丢），嵌套深度用栈，
 * 多深都不爆栈。同一个扫描器顺手记行号列号，报错能指到具体位置。
 *
 * ★ 不卡死宿主的关键：扫描状态全部存在闭包里，`step(budgetMs)` 干一会儿就把
 *   控制权交出去（大文件走 formatAsync，每片 ≤12 ms，页面始终能响应），
 *   下次 step 从原处接着扫。所以 20 MB 的 JSON 也不会把界面冻住，
 *   还能报进度、能中途取消。小文件仍是同步一遍扫完（无额外开销）。
 *
 * 边界：纯字符串处理；输入上限见 LIMITS；JSONL（一行一条）也支持。
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.DBXJson = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var LIMITS = {
        // 超过这个大小直接拒绝：再大浏览器里也点不动，先让人分段处理
        maxInput: 24 * 1024 * 1024,
        // 输入超过这个大小就不再「边打字边格式化」——每敲一个字全量扫一遍太贵
        autoFormat: 300 * 1024,
        // 输入进 CodeMirror 的上限。实测 4 MB 原文 setValue 144 ms，键入一次 ~20 ms
        // （关掉 matchBrackets，不然一整行 4 MB 的括号匹配要 120 ms），属于「能编辑」。
        cmInput: 4 * 1024 * 1024,
        // 结果进编辑器渲染（只读）的上限。4 MB 原文美化后约 8 MB / 46 万行，
        // 实测 setValue 220–380 ms，点一次等一下可以接受；再大就老实走预览。
        renderEdit: 10 * 1024 * 1024,
        // 结果比 renderEdit 还大时，只渲染前一段（导出仍是完整内容）
        preview: 1024 * 1024,
        // 预览最多这么多行（行数比字节更吃 DOM）
        previewLines: 6000,
        // 超过这个大小不写剪贴板，改走「导出文件」——往剪贴板塞几 MB 会卡住宿主
        clipboard: 128 * 1024,
        // 键排序要建对象树，只能在小文件上做
        sortKeys: 1024 * 1024,
        // 异步扫描每片最多占用主线程多久（毫秒）
        sliceMs: 12,
        // 缩进最多长到这么多层。`[[[[…]]]]` 两万层时，缩进随深度线性增长的输出
        // 是「层数² × 缩进」——两万层就有 8 亿字符，直接撞字符串上限（RangeError）。
        // 到顶之后保持同样缩进，视觉上不再往右推，但结构仍然合法、行数不变。
        maxIndentDepth: 64,
        // 输出总量上限：撞上就报 outputTooLarge，绝不硬拼到内存耗尽
        maxOutput: 64 * 1024 * 1024
    };

    // 扫描状态
    var S_VALUE = 1;        // 该来一个值（根、数组元素、对象成员值）
    var S_KEY_OR_END = 2;   // 刚进对象：键或 `}`
    var S_KEY = 3;          // 逗号之后：只能是键（`}` 就是多余逗号）
    var S_COLON = 4;        // 键之后：等冒号
    var S_AFTER = 5;        // 值之后：逗号或闭合
    var S_ROOT_END = 6;     // 根值之后：只允许空白（JSONL 时允许下一条）

    var NUM_RE = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/;

    function nowMs() {
        return (typeof performance !== 'undefined' && performance && typeof performance.now === 'function')
            ? performance.now() : Date.now();
    }

    /* 让出主线程：MessageChannel 是浏览器里最快的（postMessage 排到任务队尾，
       没有 setTimeout 的 4 ms 钳制）。node（测试）与老环境退回定时器——
       node 里挂着的 MessageChannel 会让进程一直不退出。 */
    var yieldToHost = (function () {
        var isNode = typeof process !== 'undefined' && process.versions && process.versions.node;
        if (isNode || typeof MessageChannel !== 'function') {
            return function (fn) { setTimeout(fn, 0); };
        }
        var ch = new MessageChannel();
        var queue = [];
        ch.port1.onmessage = function () {
            var fn = queue.shift();
            if (fn) fn();
        };
        return function (fn) {
            queue.push(fn);
            ch.port2.postMessage(0);
        };
    })();

    function spaces(n) {
        var s = '';
        for (var i = 0; i < n; i++) s += ' ';
        return s;
    }

    function utf8Bytes(s) {
        var bytes = 0;
        for (var i = 0; i < s.length; i++) {
            var c = s.charCodeAt(i);
            if (c < 0x80) bytes += 1;
            else if (c < 0x800) bytes += 2;
            else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
                var d = s.charCodeAt(i + 1);
                if (d >= 0xdc00 && d <= 0xdfff) { bytes += 4; i++; }
                else bytes += 3;
            } else bytes += 3;
        }
        return bytes;
    }

    function emptyStats() {
        return {
            chars: 0, bytes: 0, lines: 0, nodes: 0, maxDepth: 0,
            objects: 0, arrays: 0, keys: 0, numbers: 0, strings: 0,
            literals: 0, records: 0
        };
    }

    /* 出错时才算行号列号：扫一遍前缀，比每读一个字符都维护行列便宜 */
    function locate(text, index) {
        var line = 1, col = 1;
        var end = Math.max(0, Math.min(index, text.length));
        for (var i = 0; i < end; i++) {
            if (text.charCodeAt(i) === 10) { line++; col = 1; }
            else col++;
        }
        return { line: line, col: col };
    }

    function snippetOf(text, index) {
        var from = Math.max(0, index - 30);
        var to = Math.min(text.length, index + 30);
        var s = text.slice(from, to).replace(/\r?\n/g, '⏎');
        return (from > 0 ? '…' : '') + s + (to < text.length ? '…' : '');
    }

    function mkError(code, index, text) {
        var at = locate(text, index);
        return {
            code: code,
            index: index,
            line: at.line,
            col: at.col,
            snippet: snippetOf(text, index)
        };
    }

    function isWs(c) {
        return c === 32 || c === 9 || c === 10 || c === 13;
    }

    function isDigit(c) {
        return c >= 48 && c <= 57;
    }

    function isHex(c) {
        return (c >= 48 && c <= 57) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102);
    }

    function isNumChar(c) {
        return isDigit(c) || c === 43 || c === 45 || c === 46 || c === 69 || c === 101;
    }

    function isLower(c) {
        return c >= 97 && c <= 122;
    }

    function hasContent(raw) {
        for (var i = 0; i < raw.length; i++) {
            if (!isWs(raw.charCodeAt(i))) return true;
        }
        return false;
    }

    /**
     * 建一个可续跑的扫描器。
     * options:
     *   indent     2 | 4 | '\t'
     *   minify     true 时压成一行（多行 JSONL 仍按记录分行）
     *   jsonl      false 时遇到第二个根值就报错；默认 true（自动）
     *   sortKeys   true 时按键名升序重排（仅单条、且体积在 LIMITS.sortKeys 内）
     *   sortOrder  'asc' | 'desc'，比 sortKeys 更细；'none' / 不传表示不排序
     */
    function createScanner(text, options) {
        var opts = options || {};
        var raw = String(text == null ? '' : text);
        if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);

        var stats = emptyStats();
        stats.chars = raw.length;

        var unit = opts.indent === '\t' ? '\t' : spaces(Math.max(1, Math.min(8, Number(opts.indent) || 2)));
        var minify = !!opts.minify;
        // 排序方向：sortOrder 优先；老调用传 sortKeys:true 就是升序
        var sortOrder = opts.sortOrder === 'desc' ? 'desc'
            : (opts.sortOrder === 'asc' || opts.sortKeys) ? 'asc' : '';
        var allowJsonl = opts.jsonl !== false;
        var len = raw.length;

        var out = [];
        var buf = '';
        var stack = [];
        var state = S_VALUE;
        var strKind = 0;        // 1 = 键，2 = 值
        var esc = false;
        var error = null;
        var i = 0;
        var rootEndAt = 0;
        var maxIntegerDigits = 0;
        var indents = [''];

        /* 预检：空 / 超上限。放在扫描前，避免对 100 MB 的输入白扫 */
        var fatal = null;
        if (!hasContent(raw)) fatal = mkError('empty', 0, raw);
        else if (raw.length > LIMITS.maxInput) fatal = mkError('tooLarge', 0, raw);

        var finished = false;
        var cached = null;
        var aborted = false;
        var outChars = 0;
        var warnings = [];      // 非致命提示（例如「有大整数，键排序跳过了」）

        /* 一段一段攒再入数组：8 MB 的 JSON 有上百万个片段，
           逐个 push 到数组里，光数组本身就够呛 */
        function emit(s) {
            if (!s) return;
            outChars += s.length;
            if (outChars > LIMITS.maxOutput) {
                // 缩进膨胀 / 极端结构：宁可报错也不能一路拼到内存耗尽把宿主拖死
                error = { code: 'outputTooLarge', index: i };
                return;
            }
            buf += s;
            if (buf.length >= 1048576) {
                out.push(buf);
                buf = '';
            }
        }

        function indentOf(n) {
            if (n > LIMITS.maxIndentDepth) n = LIMITS.maxIndentDepth;
            if (indents[n] === undefined) indents[n] = indents[n - 1] + unit;
            return indents[n];
        }

        /* 换行 + 缩进整段缓存：每个成员都要换行，40 万个成员就是 40 万个
           `'\n' + indent` 的新字符串——这些分配是 GC 尖峰的主要来源。
           缓存之后只有几十个常量，压测里 6.6 MB 的最大单片停顿从 33 ms 降到个位数。 */
        var nlIndents = ['\n'];
        function nlIndentOf(n) {
            if (n > LIMITS.maxIndentDepth) n = LIMITS.maxIndentDepth;
            if (nlIndents[n] === undefined) nlIndents[n] = '\n' + indentOf(n);
            return nlIndents[n];
        }

        function breakLine() {
            if (minify) return;
            emit(nlIndentOf(stack.length));
        }

        function startMember() {
            if (!stack.length) return;
            var top = stack[stack.length - 1];
            if (top.breakLine) {
                breakLine();
                top.breakLine = false;
            }
        }

        function finishValue() {
            stats.nodes++;
            if (!stack.length) {
                state = S_ROOT_END;
                rootEndAt = i;
                stats.records++;
                return;
            }
            var top = stack[stack.length - 1];
            top.count++;
            state = S_AFTER;
        }

        // 关掉一个容器；`{}` / `[]` 不换行
        function closeContainer(chCode) {
            var top = stack[stack.length - 1];
            var want = top && top.ch === 123 ? 125 : 93;
            if (!top || want !== chCode) {
                error = { code: 'expectValue', index: i };
                return;
            }
            if (top.count > 0) {
                if (!minify) emit(nlIndentOf(stack.length - 1));
            }
            stack.pop();
            emit(chCode === 125 ? '}' : ']');
            finishValue();
        }

        /**
         * 扫一片。budgetMs 用完就返回 'more'（状态留在闭包里，下次接着扫）。
         * 返回 'done' 表示扫完了（或者已经出错 / 被取消）。
         */
        function step(budgetMs) {
            // 取消之后立刻停：不能「点了取消还接着扫完」——那等于没取消
            if (finished || fatal || aborted) return 'done';
            var deadline = (budgetMs >= 1e9) ? Infinity : nowMs() + Math.max(1, budgetMs);
            var tick = 0;

            while (i < len && !error) {
                // 每 2048 个字符看一次表：8 MB 的输入也只多调 4000 次，可忽略
                if ((++tick & 1023) === 0 && nowMs() > deadline) return 'more';

                var c = raw.charCodeAt(i);

                /* ---------------------------- 字符串 ---------------------------- */
                if (strKind) {
                    var segStart = i;
                    var closed = false;
                    while (i < len) {
                        if ((++tick & 1023) === 0 && nowMs() > deadline) {
                            // 已经扫过的这一段先吐出去，回来时从 i 接着扫，不重扫
                            emit(raw.slice(segStart, i));
                            return 'more';
                        }
                        var sc = raw.charCodeAt(i);
                        if (esc) {
                            if (sc === 117) {           // \uXXXX
                                if (i + 4 >= len) { i = len; break; }
                                if (!isHex(raw.charCodeAt(i + 1)) || !isHex(raw.charCodeAt(i + 2)) ||
                                    !isHex(raw.charCodeAt(i + 3)) || !isHex(raw.charCodeAt(i + 4))) {
                                    error = { code: 'badEscape', index: i };
                                    break;
                                }
                                i += 5;
                                esc = false;
                                continue;
                            }
                            if (sc !== 34 && sc !== 92 && sc !== 47 && sc !== 98 && sc !== 102 &&
                                sc !== 110 && sc !== 114 && sc !== 116) {
                                error = { code: 'badEscape', index: i - 1 };
                                break;
                            }
                            esc = false;
                            i++;
                            continue;
                        }
                        if (sc === 92) { esc = true; i++; continue; }
                        if (sc === 34) {
                            i++;
                            emit(raw.slice(segStart, i));
                            closed = true;
                            break;
                        }
                        if (sc < 32) {
                            error = { code: 'badString', index: i };
                            break;
                        }
                        i++;
                    }
                    if (error) break;
                    if (!closed) {
                        error = { code: 'badString', index: i };
                        break;
                    }
                    if (strKind === 1) {
                        stats.strings++;
                        stats.keys++;
                        state = S_COLON;
                    } else {
                        stats.strings++;
                        finishValue();
                    }
                    strKind = 0;
                    continue;
                }

                // 空白：JSON 只认这四个，其余（NBSP 之类）当非法字符
                if (isWs(c)) { i++; continue; }

                /* ---------------------------- 各状态 ---------------------------- */
                if (state === S_VALUE) {
                    if (c === 93 || c === 125) {
                        /* 值的位置上遇到闭合：只有 `[]` 这一种合法（空数组），
                           `{}` 走的是 S_KEY_OR_END，`{"a":}` 这种就是缺值。 */
                        if (c === 125 || !stack.length || stack[stack.length - 1].ch !== 91) {
                            error = { code: 'expectValue', index: i };
                            break;
                        }
                        if (stack[stack.length - 1].count > 0) {
                            // `[1,]`：多余逗号
                            error = { code: 'trailingComma', index: i };
                            break;
                        }
                        closeContainer(93);
                        i++;
                        continue;
                    }

                    if (stack.length) startMember();

                    if (c === 123) {                 // {
                        stack.push({ ch: 123, count: 0, breakLine: true });
                        emit('{');
                        if (stack.length > stats.maxDepth) stats.maxDepth = stack.length;
                        stats.objects++;
                        state = S_KEY_OR_END;
                        i++;
                        continue;
                    }
                    if (c === 91) {                  // [
                        stack.push({ ch: 91, count: 0, breakLine: true });
                        emit('[');
                        if (stack.length > stats.maxDepth) stats.maxDepth = stack.length;
                        stats.arrays++;
                        state = S_VALUE;
                        i++;
                        continue;
                    }
                    if (c === 34) {                  // "
                        strKind = 2;
                        emit('"');
                        i++;
                        continue;
                    }
                    if (c === 45 || isDigit(c)) {    // 数字：整段抄走，不经过 Number
                        var nEnd = i + 1;
                        while (nEnd < len && isNumChar(raw.charCodeAt(nEnd))) nEnd++;
                        var num = raw.slice(i, nEnd);
                        if (!NUM_RE.test(num)) { error = { code: 'badNumber', index: i }; break; }
                        var intPart = num.replace(/^[-+]/, '').split(/[.eE]/)[0];
                        if (intPart.replace(/^0+/, '').length > maxIntegerDigits) {
                            maxIntegerDigits = intPart.replace(/^0+/, '').length;
                        }
                        stats.numbers++;
                        emit(num);
                        i = nEnd;
                        finishValue();
                        continue;
                    }
                    if (c === 116 || c === 102 || c === 110) {   // true / false / null
                        var lEnd = i + 1;
                        while (lEnd < len && isLower(raw.charCodeAt(lEnd))) lEnd++;
                        var lit = raw.slice(i, lEnd);
                        if (lit !== 'true' && lit !== 'false' && lit !== 'null') {
                            error = { code: 'badLiteral', index: i };
                            break;
                        }
                        stats.literals++;
                        emit(lit);
                        i = lEnd;
                        finishValue();
                        continue;
                    }
                    error = { code: 'expectValue', index: i };
                    break;
                }

                if (state === S_KEY_OR_END || state === S_KEY) {
                    if (c === 125) {
                        if (state === S_KEY) { error = { code: 'trailingComma', index: i }; break; }
                        closeContainer(125);
                        i++;
                        continue;
                    }
                    if (c !== 34) { error = { code: 'expectKey', index: i }; break; }
                    startMember();
                    strKind = 1;
                    emit('"');
                    i++;
                    continue;
                }

                if (state === S_COLON) {
                    if (c !== 58) { error = { code: 'expectColon', index: i }; break; }
                    emit(minify ? ':' : ': ');
                    state = S_VALUE;
                    i++;
                    continue;
                }

                if (state === S_AFTER) {
                    var stackTop = stack[stack.length - 1];
                    if (c === 44) {                  // ,
                        emit(',');
                        if (stackTop) stackTop.breakLine = true;
                        state = stackTop && stackTop.ch === 123 ? S_KEY : S_VALUE;
                        i++;
                        continue;
                    }
                    if (c === 125 || c === 93) {
                        if (!stackTop || ((c === 125) !== (stackTop.ch === 123))) {
                            error = { code: 'unexpectedChar', index: i };
                            break;
                        }
                        closeContainer(c);
                        i++;
                        continue;
                    }
                    error = { code: 'expectComma', index: i };
                    break;
                }

                if (state === S_ROOT_END) {
                    // 还有内容：要么是多余内容，要么是 JSONL 的下一条
                    if (!allowJsonl) { error = { code: 'extraContent', index: i }; break; }
                    if (raw.slice(rootEndAt, i).indexOf('\n') < 0) {
                        // NDJSON 要求一条一行；同一行上跟第二个值多半是漏了逗号或少写了括号
                        error = { code: 'extraContent', index: i };
                        break;
                    }
                    emit('\n');
                    state = S_VALUE;
                    // 不消费这个字符，回到循环顶部按新的根值处理
                    continue;
                }

                error = { code: 'unexpectedChar', index: i };
                break;
            }

            if (error) return 'done';
            return i >= len ? 'done' : 'more';
        }

        /** 收尾：判错 → 组装字符串 → 键排序 → 统计。可以重复调用，结果缓存。 */
        function result() {
            if (cached) return cached;

            if (fatal) {
                stats.bytes = utf8Bytes(raw);
                cached = { ok: false, text: '', error: fatal, stats: stats, aborted: false, warnings: warnings };
                finished = true;
                return cached;
            }

            // 还没扫完就有人来要结果：一口气扫干净（同步调用方就是这么用的）
            if (!finished) {
                while (step(Infinity) === 'more') { /* 一直扫 */ }
                finished = true;
            }

            if (aborted) {
                stats.bytes = utf8Bytes(raw);
                cached = {
                    ok: false, text: '', aborted: true,
                    error: { code: 'cancelled', index: i, line: 0, col: 0, snippet: '' },
                    stats: stats, warnings: warnings
                };
                return cached;
            }

            var err = error;
            if (!err && strKind) err = { code: 'badString', index: len };
            if (!err && esc) err = { code: 'badString', index: len };
            if (!err && (state !== S_ROOT_END || stack.length)) err = { code: 'unexpectedEnd', index: len };

            if (err) {
                if (!err.line) {
                    var at = locate(raw, err.index);
                    err.line = at.line;
                    err.col = at.col;
                    err.snippet = snippetOf(raw, err.index);
                }
                stats.bytes = utf8Bytes(raw);
                cached = { ok: false, text: '', error: err, stats: stats, aborted: false, warnings: warnings };
                return cached;
            }

            if (buf) { out.push(buf); buf = ''; }
            var text = out.join('');

            // 键排序：建一棵「原样树」再重排，数字不经过 Number，所以大整数也能排、且一位不丢。
            // 只有这两种情况做不了（每行一条 / 超过 1 MB），跳过排序、照常给出格式化结果，
            // 再带一条 warning 让页面提示一句——不能因为排序做不了就让用户拿不到结果。
            if (sortOrder) {
                var skip = '';
                if (stats.records > 1) skip = 'sortJsonl';
                else if (raw.length > LIMITS.sortKeys) skip = 'sortTooLarge';
                if (skip) {
                    warnings.push({ code: skip });
                } else {
                    try {
                        text = serializeTree(parseTree(raw), unit, minify, sortOrder === 'desc');
                    } catch (e) {
                        // 扫描器已经验过合法，这里失败只可能是极端结构；跳过排序，别丢结果
                        warnings.push({ code: 'sortFailed' });
                    }
                }
            }

            stats.bytes = utf8Bytes(text);
            var nl = 0;
            for (var k = 0; k < text.length; k++) if (text.charCodeAt(k) === 10) nl++;
            stats.lines = nl + 1;
            stats.chars = text.length;

            cached = { ok: true, text: text, error: null, stats: stats, aborted: false, warnings: warnings, maxIntegerDigits: maxIntegerDigits };
            return cached;
        }

        return {
            step: step,
            result: result,
            abort: function () { aborted = true; },
            isDone: function () { return finished || !!error || !!fatal; },
            progress: function () {
                return { processed: i, total: len, ratio: len ? i / len : 1 };
            },
            peekStats: function () { return stats; }
        };
    }

    // 递归排序对象的键（数组顺序保持）；desc 时倒着排
    /*
     * 键排序要建树，但不能用 JSON.parse —— 它会把 9007199254740993 变成 ...992，
     * 用户勾一下「排序」就把 ID 悄悄改了，比不排序严重得多。
     *
     * 所以自己切一棵「原样树」：数字 / 字符串 / 字面量都存原文（raw），
     * 只有对象和数组有结构。排序只动对象成员的顺序，值一个字节都不碰。
     *
     * 解析和序列化都用显式栈（不用递归）：一万层的 [[[…]]] 也不会爆栈。
     * 只在 LIMITS.sortKeys（1 MB）以内调用，树撑死几万个节点。
     */
    function parseTree(raw) {
        var i = 0;
        var len = raw.length;
        var stack = [];
        var root = null;

        function attach(node) {
            var top = stack[stack.length - 1];
            if (!top) { root = node; return; }
            if (top.node.kind === 'arr') top.node.items.push(node);
            else {
                top.node.entries.push({ key: top.key, sort: keySortText(top.key), value: node });
                top.key = null;
            }
        }

        while (i < len) {
            var c = raw.charCodeAt(i);
            if (isWs(c)) { i++; continue; }

            if (c === 123) {                                   // {
                var obj = { kind: 'obj', entries: [] };
                attach(obj);
                stack.push({ node: obj, key: null });
                i++;
                continue;
            }
            if (c === 91) {                                    // [
                var arr = { kind: 'arr', items: [] };
                attach(arr);
                stack.push({ node: arr });
                i++;
                continue;
            }
            if (c === 125 || c === 93) { stack.pop(); i++; continue; }
            if (c === 44 || c === 58) { i++; continue; }        // ,  :

            var start = i;
            if (c === 34) {                                    // 字符串：整段连引号抄走
                i++;
                while (i < len) {
                    var ch = raw.charCodeAt(i);
                    if (ch === 92) { i += 2; continue; }
                    i++;
                    if (ch === 34) break;
                }
            } else {                                           // 数字 / true / false / null
                while (i < len) {
                    var cc = raw.charCodeAt(i);
                    if (cc === 44 || cc === 93 || cc === 125 || cc === 58 || isWs(cc)) break;
                    i++;
                }
            }
            var token = raw.slice(start, i);
            var top = stack[stack.length - 1];
            // 对象里、且还没读到键 → 这个 token 是键；其余都是值
            if (top && top.node.kind === 'obj' && top.key === null) top.key = token;
            else attach({ kind: 'raw', text: token });
        }
        return root;
    }

    /* 排序用的比较文本：不含转义就直接比原文，省掉一次 JSON.parse */
    function keySortText(keyText) {
        if (!keyText || keyText.indexOf('\\') < 0) return keyText || '';
        try { return JSON.parse(keyText); } catch (e) { return keyText; }
    }

    function serializeTree(root, unit, minify, desc) {
        var out = [];
        var buf = '';
        function emit(s) {
            if (!s) return;
            buf += s;
            if (buf.length >= 1048576) { out.push(buf); buf = ''; }
        }
        function nlIndent(depth) {
            if (minify) return '';
            var d = depth > LIMITS.maxIndentDepth ? LIMITS.maxIndentDepth : depth;
            var pad = '';
            for (var i = 0; i < d; i++) pad += unit;
            return '\n' + pad;
        }

        var stack = [{ node: root, depth: 0 }];
        while (stack.length) {
            var task = stack.pop();
            if (task.text !== undefined) { emit(task.text); continue; }
            var n = task.node;
            var depth = task.depth;
            if (!n) continue;
            if (n.kind === 'raw') { emit(n.text); continue; }

            if (n.kind === 'arr') {
                if (!n.items.length) { emit('[]'); continue; }
                emit('[');
                var seqA = [];
                for (var i = 0; i < n.items.length; i++) {
                    if (i) seqA.push({ text: ',' });
                    seqA.push({ text: nlIndent(depth + 1) });
                    seqA.push({ node: n.items[i], depth: depth + 1 });
                }
                seqA.push({ text: nlIndent(depth) });
                seqA.push({ text: ']' });
                for (var a = seqA.length - 1; a >= 0; a--) stack.push(seqA[a]);
                continue;
            }

            var entries = n.entries.slice();
            entries.sort(function (x, y) {
                var s1 = x.sort;
                var s2 = y.sort;
                if (s1 === s2) return 0;
                return desc ? (s1 < s2 ? 1 : -1) : (s1 < s2 ? -1 : 1);
            });
            if (!entries.length) { emit('{}'); continue; }
            emit('{');
            var seqO = [];
            for (var j = 0; j < entries.length; j++) {
                if (j) seqO.push({ text: ',' });
                seqO.push({ text: nlIndent(depth + 1) });
                seqO.push({ text: entries[j].key });
                seqO.push({ text: minify ? ':' : ': ' });
                seqO.push({ node: entries[j].value, depth: depth + 1 });
            }
            seqO.push({ text: nlIndent(depth) });
            seqO.push({ text: '}' });
            for (var b = seqO.length - 1; b >= 0; b--) stack.push(seqO[b]);
        }
        if (buf) out.push(buf);
        return out.join('');
    }

    /** 同步格式化：小文件、测试、以及「一次跑完也无所谓」的地方用它。 */
    function format(text, options) {
        return createScanner(text, options).result();
    }

    /**
     * 分片格式化：每片最多占主线程 sliceMs 毫秒，中间让出，界面不冻。
     * hooks: { sliceMs, onProgress({processed,total,ratio}), signal:{aborted} }
     * 返回 Promise<format 结果>；被取消时结果带 aborted:true 且 error.code==='cancelled'。
     */
    function formatAsync(text, options, hooks) {
        var h = hooks || {};
        var slice = Number(h.sliceMs) > 0 ? Number(h.sliceMs) : LIMITS.sliceMs;
        var sc = createScanner(text, options);
        return new Promise(function (resolve) {
            function pump() {
                try {
                    if (h.signal && h.signal.aborted) {
                        sc.abort();
                        resolve(sc.result());
                        return;
                    }
                    var state = sc.step(slice);
                    if (h.onProgress) {
                        try { h.onProgress(sc.progress()); } catch (e) { /* 回调出错不能中断扫描 */ }
                    }
                    if (state === 'more') {
                        yieldToHost(pump);
                        return;
                    }
                    resolve(sc.result());
                } catch (err) {
                    // 扫描器本身不该抛；真抛了也不能让 Promise 永远挂着
                    resolve({
                        ok: false, text: '', error: { code: 'unexpectedEnd', index: 0, line: 1, col: 1, snippet: '' },
                        stats: sc.peekStats(), aborted: false, threw: String((err && err.message) || err)
                    });
                }
            }
            pump();
        });
    }

    function minify(text, options) {
        var opts = {};
        var src = options || {};
        for (var k in src) if (Object.prototype.hasOwnProperty.call(src, k)) opts[k] = src[k];
        opts.minify = true;
        return format(text, opts);
    }

    function validate(text, options) {
        var res = format(text, options);
        return { ok: res.ok, error: res.error, stats: res.stats };
    }

    /* 把任意文本转成一个 JSON 字符串字面量（带引号），塞进 JSON 里用 */
    function escapeText(text) {
        return JSON.stringify(String(text == null ? '' : text));
    }

    /* 反转义：\n \t \" \\ \uXXXX 都还原；不认的转义原样留着（粘贴 Windows 路径时不至于报错） */
    function unescapeText(text) {
        var src = String(text == null ? '' : text).trim();
        var quoted = src.length >= 2 && src.charCodeAt(0) === 34 && src.charCodeAt(src.length - 1) === 34;
        var body = quoted ? src.slice(1, -1) : src;
        var out = [];
        var lenient = 0;

        for (var i = 0; i < body.length; i++) {
            var c = body.charCodeAt(i);
            if (c !== 92) { out.push(body.charAt(i)); continue; }
            var next = body.charAt(i + 1);
            if (!next) { out.push('\\'); break; }
            if (next === 'n') { out.push('\n'); i++; }
            else if (next === 't') { out.push('\t'); i++; }
            else if (next === 'r') { out.push('\r'); i++; }
            else if (next === 'b') { out.push('\b'); i++; }
            else if (next === 'f') { out.push('\f'); i++; }
            else if (next === 'v') { out.push('\v'); i++; }
            else if (next === '0') { out.push('\0'); i++; }
            else if (next === '"' || next === '\\' || next === '/') { out.push(next); i++; }
            else if (next === 'u') {
                var hex = body.slice(i + 2, i + 6);
                if (/^[0-9a-fA-F]{4}$/.test(hex)) {
                    var code = parseInt(hex, 16);
                    // 代理对：高 + 低合成一个字符，否则原样输出
                    if (code >= 0xd800 && code <= 0xdbff) {
                        var hex2 = body.slice(i + 8, i + 12);
                        if (body.charAt(i + 6) === '\\' && body.charAt(i + 7) === 'u' &&
                            /^[0-9a-fA-F]{4}$/.test(hex2)) {
                            var low = parseInt(hex2, 16);
                            if (low >= 0xdc00 && low <= 0xdfff) {
                                out.push(String.fromCharCode(code, low));
                                i += 11;
                                continue;
                            }
                        }
                    }
                    out.push(String.fromCharCode(code));
                    i += 5;
                } else {
                    lenient++;
                    out.push('\\u');
                    i += 1;
                }
            } else {
                lenient++;
                out.push('\\' + next);
                i++;
            }
        }

        return { ok: true, text: out.join(''), lenient: lenient, quoted: quoted };
    }

    function formatBytes(n) {
        var v = Number(n) || 0;
        if (v < 1024) return v + ' B';
        if (v < 1024 * 1024) return (v / 1024).toFixed(v < 10 * 1024 ? 1 : 0) + ' KB';
        return (v / (1024 * 1024)).toFixed(v < 10 * 1024 * 1024 ? 1 : 0) + ' MB';
    }

    return {
        LIMITS: LIMITS,
        format: format,
        formatAsync: formatAsync,
        createScanner: createScanner,
        minify: minify,
        validate: validate,
        escapeText: escapeText,
        unescapeText: unescapeText,
        utf8Bytes: utf8Bytes,
        formatBytes: formatBytes
    };
});
