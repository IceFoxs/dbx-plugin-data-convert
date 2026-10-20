/*
 * 逐行差异算法（纯函数，无 DOM 依赖）
 * ------------------------------------------------
 * 页面通过经典 <script> 加载，挂到 window.DBXDiff。
 * 回归用例：node tests/diff.test.js
 *
 * 设计要点：
 * 1. ops 里每一步都带 1-based 的 oldLine / newLine，调用方不再自己累加计数，
 *    从根上避免「按 A 文本算差异、却标到 B 文本上」的行号错位。
 * 2. 先裁掉公共前后缀，再对中间段做 LCS；中间段规模超过 maxCells 时
 *    退化为线性复杂度的贪心对齐，避免二维表把内存打爆。
 */
(function (root) {
    'use strict';

    var DEFAULTS = {
        // (N+1)*(M+1) 个 Uint32，2e6 单元约 8 MB；超过就换贪心
        maxCells: 2000000,
        // 贪心对齐时的重同步窗口
        lookahead: 64
    };

    /* 用 Uint32Array 存 DP 表，同等规模下内存约为普通二维数组的 1/4 且无对象开销 */
    function lcsDiff(a, b) {
        var N = a.length;
        var M = b.length;
        var W = M + 1;
        var dp = new Uint32Array((N + 1) * W);
        var i, j, row, prev;

        for (i = 1; i <= N; i++) {
            row = i * W;
            prev = row - W;
            for (j = 1; j <= M; j++) {
                if (a[i - 1] === b[j - 1]) {
                    dp[row + j] = dp[prev + j - 1] + 1;
                } else {
                    var up = dp[prev + j];
                    var left = dp[row + j - 1];
                    dp[row + j] = up >= left ? up : left;
                }
            }
        }

        var ops = [];
        i = N;
        j = M;
        while (i > 0 || j > 0) {
            if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
                ops.push({ type: 'same', text: a[i - 1] });
                i--;
                j--;
            } else if (j > 0 && (i === 0 || dp[i * W + j - 1] >= dp[(i - 1) * W + j])) {
                ops.push({ type: 'insert', text: b[j - 1] });
                j--;
            } else {
                ops.push({ type: 'delete', text: a[i - 1] });
                i--;
            }
        }
        return ops.reverse();
    }

    /* 大文件兜底：按「能否重新对齐」跳过成块的修改，复杂度接近 O(N+M) */
    function greedyDiff(a, b, lookahead) {
        var index = new Map();
        b.forEach(function (text, k) {
            var list = index.get(text);
            if (list) list.push(k);
            else index.set(text, [k]);
        });

        var ops = [];
        var i = 0;
        var j = 0;
        while (i < a.length && j < b.length) {
            if (a[i] === b[j]) {
                ops.push({ type: 'same', text: a[i] });
                i++;
                j++;
                continue;
            }

            var resyncA = -1;
            var resyncB = -1;
            for (var k = i; k < a.length && k - i <= lookahead; k++) {
                var positions = index.get(a[k]);
                if (!positions) continue;
                for (var p = 0; p < positions.length; p++) {
                    if (positions[p] >= j) {
                        resyncA = k;
                        resyncB = positions[p];
                        break;
                    }
                }
                if (resyncA !== -1) break;
            }

            if (resyncA === -1) {
                // 后面完全对不上，整段当作替换
                ops.push({ type: 'delete', text: a[i] });
                ops.push({ type: 'insert', text: b[j] });
                i++;
                j++;
                continue;
            }

            for (var d = i; d < resyncA; d++) ops.push({ type: 'delete', text: a[d] });
            for (var n = j; n < resyncB; n++) ops.push({ type: 'insert', text: b[n] });
            i = resyncA;
            j = resyncB;
        }
        while (i < a.length) ops.push({ type: 'delete', text: a[i++] });
        while (j < b.length) ops.push({ type: 'insert', text: b[j++] });
        return ops;
    }

    /**
     * @param {string} oldText
     * @param {string} newText
     * @param {{maxCells?:number, lookahead?:number}} [options]
     * @returns {{ops: Array, mode: string, stats: {added:number, removed:number, unchanged:number}}}
     */
    function diffLines(oldText, newText, options) {
        var opts = Object.assign({}, DEFAULTS, options || {});
        var a = String(oldText == null ? '' : oldText).split('\n');
        var b = String(newText == null ? '' : newText).split('\n');

        // 1. 裁掉公共前后缀（绝大多数对比都属于「改了几行」）
        var head = 0;
        while (head < a.length && head < b.length && a[head] === b[head]) head++;

        var tailA = a.length;
        var tailB = b.length;
        while (tailA > head && tailB > head && a[tailA - 1] === b[tailB - 1]) {
            tailA--;
            tailB--;
        }

        var midA = a.slice(head, tailA);
        var midB = b.slice(head, tailB);
        var mode = 'lcs';
        var mid;

        if (!midA.length && !midB.length) {
            mid = [];
        } else if (!midA.length) {
            mid = midB.map(function (text) { return { type: 'insert', text: text }; });
        } else if (!midB.length) {
            mid = midA.map(function (text) { return { type: 'delete', text: text }; });
        } else if (midA.length * midB.length > opts.maxCells) {
            mode = 'greedy';
            mid = greedyDiff(midA, midB, opts.lookahead);
        } else {
            mid = lcsDiff(midA, midB);
        }

        // 2. 回填行号（1-based，且与 CodeMirror 的行序一致）
        var ops = [];
        var i;
        for (i = 0; i < head; i++) {
            ops.push({ type: 'same', text: a[i], oldLine: i + 1, newLine: i + 1 });
        }

        var oldNo = head + 1;
        var newNo = head + 1;
        for (i = 0; i < mid.length; i++) {
            var step = mid[i];
            if (step.type === 'same') {
                ops.push({ type: 'same', text: step.text, oldLine: oldNo, newLine: newNo });
                oldNo++;
                newNo++;
            } else if (step.type === 'delete') {
                ops.push({ type: 'delete', text: step.text, oldLine: oldNo, newLine: null });
                oldNo++;
            } else {
                ops.push({ type: 'insert', text: step.text, oldLine: null, newLine: newNo });
                newNo++;
            }
        }

        for (i = 0; i < a.length - tailA; i++) {
            ops.push({ type: 'same', text: a[tailA + i], oldLine: tailA + i + 1, newLine: tailB + i + 1 });
        }

        return { ops: ops, mode: mode, stats: countStats(ops) };
    }

    function countStats(ops) {
        var stats = { added: 0, removed: 0, unchanged: 0 };
        for (var i = 0; i < ops.length; i++) {
            if (ops[i].type === 'insert') stats.added++;
            else if (ops[i].type === 'delete') stats.removed++;
            else stats.unchanged++;
        }
        return stats;
    }

    /**
     * 把带行号的 ops 拆成两栏各自的 { line, type } 列表（0-based，直接喂给 CodeMirror）。
     */
    function sides(ops) {
        var left = [];
        var right = [];
        ops.forEach(function (op) {
            if (op.type === 'delete') left.push({ line: op.oldLine - 1, type: 'delete' });
            else if (op.type === 'insert') right.push({ line: op.newLine - 1, type: 'insert' });
            else {
                left.push({ line: op.oldLine - 1, type: 'same' });
                right.push({ line: op.newLine - 1, type: 'same' });
            }
        });
        return { left: left, right: right };
    }

    var API = {
        diffLines: diffLines,
        sides: sides,
        countStats: countStats,
        DEFAULTS: DEFAULTS
    };

    if (typeof module === 'object' && module.exports) module.exports = API;
    if (root) root.DBXDiff = API;
})(typeof window !== 'undefined' ? window : this);
