/*
 * Table statistics — pure functions, no DOM.
 *
 * Ported from the 数据统计 panel of the JRES Encrypt Tools plugin
 * (hs-encrypt): paste delimited text, tick the columns you care about,
 * get count / sum / mean / min / max / distinct / stddev per column,
 * optionally grouped by another column.
 *
 *   sniff()          text -> the delimiter that actually fits
 *   parse()          text -> { header, rows, cols, truncated }
 *   colStats()       values -> { count, filled, numeric, sum, mean, ... }
 *   aggregate()      parsed + options -> one row per (group, column)
 *   formatNum()      number -> "1234.5" / "—"
 *   toTsv()          result -> text you can paste straight into Excel
 *   columnText()     one column's values, one per line
 *   columnsTsv()     several columns -> TSV with a header, rows kept as rows
 *
 * Loaded as a classic script (window.DBXStats) and as CommonJS in tests.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.DBXStats = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var LIMITS = {
        rows: 50000,      // 再多就不是「贴一段表」了，解析也会卡住主线程
        cols: 200,
        cell: 200,        // 单元格预览长度；统计用的是完整值（下面 clip 只影响展示）
        preview: 20       // 预览表最多画几行
    };

    var METRICS = ['count', 'sum', 'mean', 'max', 'min', 'distinct', 'stddev'];
    var DEFAULT_METRICS = ['count', 'sum', 'mean', 'distinct'];

    // 候选分隔符：Tab 优先（从 Excel / 表格软件复制出来的就是它）
    var CANDIDATES = ['\t', '|', ',', ';'];

    /* ------------------------------ 解析 ------------------------------ */

    // 每行切出的列数最一致、且大于 1 的那个分隔符胜出；都不行就按 Tab 处理
    function sniff(text) {
        var lines = String(text || '').split(/\r?\n/).filter(function (line) {
            return line.length > 0;
        }).slice(0, 50);
        if (!lines.length) return '\t';
        var best = null;
        CANDIDATES.forEach(function (d) {
            var counts = lines.map(function (line) { return line.split(d).length; });
            var first = counts[0];
            if (first < 2) return;
            var same = counts.filter(function (n) { return n === first; }).length;
            // 一致性优先，其次列数多的（`a,b|c` 这种脏数据里，能切出更多列的那个更像真的）
            var score = (same / counts.length) * 1000 + first;
            if (!best || score > best.score) best = { delim: d, score: score };
        });
        return best ? best.delim : '\t';
    }

    // 数字识别：纯数字，允许千分位、前后空格、正负号、小数
    function toNumber(value) {
        var raw = value == null ? '' : String(value).trim();
        if (!raw) return null;
        if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(raw)) raw = raw.replace(/,/g, '');
        if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(raw)) return null;
        var n = Number(raw);
        return isFinite(n) ? n : null;
    }

    function clip(value) {
        var s = value == null ? '' : String(value);
        return s.length > LIMITS.cell ? s.slice(0, LIMITS.cell) + '…' : s;
    }

    /**
     * @param {string} text
     * @param {{delimiter?: string, hasHeader?: boolean}} options
     *        delimiter 传 'auto' 或不传就自己嗅；hasHeader 默认 true
     * @returns {{delimiter: string, header: string[]|null, rows: string[][],
     *            cols: number, totalRows: number, truncated: boolean,
     *            lines: number[]}}
     *          lines 与 rows 一一对应，是这一行在原文里的行号（1 起）——
     *          界面靠它做「点预览行 ↔ 编辑器光标」互相定位
     */
    function parse(text, options) {
        var opts = options || {};
        var hasHeader = opts.hasHeader !== false;
        var delimiter = !opts.delimiter || opts.delimiter === 'auto'
            ? sniff(text)
            : String(opts.delimiter);

        var lines = String(text == null ? '' : text).split(/\r?\n/);
        // 末尾的空行是复制时带上的，不算数据；中间的空行算一行（可能真是空行）
        while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
        // 开头的空行被丢掉，所以第一行在原文里不一定是第 1 行，行号从它算起
        var firstLineNo = 1;
        if (lines.length && lines[0].trim() === '') {
            lines.shift();
            firstLineNo = 2;
        }
        var lineNo = lines.map(function (_, i) { return i + firstLineNo; });

        var totalRows = Math.max(0, hasHeader ? lines.length - 1 : lines.length);
        var truncated = false;
        if (lines.length > LIMITS.rows) {
            lines = lines.slice(0, LIMITS.rows);
            lineNo = lineNo.slice(0, LIMITS.rows);
            truncated = true;
            totalRows = Math.min(totalRows, LIMITS.rows);
        }

        var cells = lines.map(function (line) {
            return line.split(delimiter).map(clip);
        });

        var header = null;
        var rows = cells;
        var rowLines = lineNo;
        if (hasHeader && cells.length) {
            header = cells[0];
            rows = cells.slice(1);
            rowLines = lineNo.slice(1);
        }

        var cols = 0;
        cells.forEach(function (row) { if (row.length > cols) cols = row.length; });
        if (cols > LIMITS.cols) {
            cols = LIMITS.cols;
            if (header) header = header.slice(0, cols);
            rows = rows.map(function (row) { return row.slice(0, cols); });
        }
        // 补齐短行：预览表要对齐，统计时缺列按空值算
        var wrap = function (row) {
            var out = row.slice(0, cols);
            while (out.length < cols) out.push('');
            return out;
        };
        if (header) header = wrap(header);
        rows = rows.map(wrap);

        return {
            delimiter: delimiter,
            header: header,
            rows: rows,
            cols: cols,
            totalRows: totalRows,
            truncated: truncated,
            lines: rowLines,
            headerLine: header ? firstLineNo : 0
        };
    }

    /* ------------------------------ 统计 ------------------------------ */

    function colStats(values) {
        var list = (values || []).map(function (v) {
            return v == null ? '' : String(v).trim();
        });
        var filled = list.filter(function (v) { return v !== ''; });
        var nums = [];
        list.forEach(function (v) {
            var n = toNumber(v);
            if (n !== null) nums.push(n);
        });

        var sum = 0;
        nums.forEach(function (n) { sum += n; });
        var mean = nums.length ? sum / nums.length : NaN;
        var variance = 0;
        if (nums.length) {
            nums.forEach(function (n) { variance += (n - mean) * (n - mean); });
            variance /= nums.length;
        }

        var seen = {};
        var distinct = 0;
        filled.forEach(function (v) {
            if (!Object.prototype.hasOwnProperty.call(seen, v)) {
                seen[v] = 1;
                distinct += 1;
            }
        });

        return {
            count: list.length,                       // 行数（含空值），和原实现一致
            filled: filled.length,                    // 非空
            numeric: nums.length,                     // 能当数字的
            sum: nums.length ? sum : NaN,
            mean: nums.length ? mean : NaN,
            max: nums.length ? Math.max.apply(null, nums) : NaN,
            min: nums.length ? Math.min.apply(null, nums) : NaN,
            distinct: distinct,
            stddev: nums.length ? Math.sqrt(variance) : NaN
        };
    }

    /**
     * 按（可选）分组列把每一列的统计算出来。
     *
     * @param {object} parsed  parse() 的返回值
     * @param {{cols: number[], groupCol?: number, metrics?: string[]}} options
     *        groupCol 是 0 起的列下标，-1 / 不传表示不分组
     * @returns {{rows: object[], metrics: string[], groupCol: number}}
     *          每行 { group: string, col: number, count, sum, ... }
     */
    function aggregate(parsed, options) {
        var opts = options || {};
        var metrics = (opts.metrics && opts.metrics.length ? opts.metrics : DEFAULT_METRICS)
            .filter(function (m) { return METRICS.indexOf(m) >= 0; });
        var cols = (opts.cols || []).filter(function (c) {
            return c >= 0 && c < (parsed ? parsed.cols : 0);
        });
        var groupCol = typeof opts.groupCol === 'number' ? opts.groupCol : -1;
        var rows = (parsed && parsed.rows) || [];
        var out = [];

        var buckets = [];
        if (groupCol >= 0 && groupCol < (parsed ? parsed.cols : 0)) {
            // 分组顺序按首次出现，和直觉一致（不想被字典序打乱）
            var index = {};
            rows.forEach(function (row) {
                var key = row[groupCol] == null ? '' : String(row[groupCol]);
                if (!Object.prototype.hasOwnProperty.call(index, key)) {
                    index[key] = buckets.length;
                    buckets.push({ key: key, rows: [] });
                }
                buckets[index[key]].rows.push(row);
            });
        } else {
            groupCol = -1;
            buckets.push({ key: '', rows: rows });
        }

        buckets.forEach(function (bucket) {
            cols.forEach(function (col) {
                var values = bucket.rows.map(function (row) {
                    return row[col] == null ? '' : row[col];
                });
                var stats = colStats(values);
                out.push({
                    group: bucket.key,
                    col: col,
                    count: stats.count,
                    filled: stats.filled,
                    numeric: stats.numeric,
                    sum: stats.sum,
                    mean: stats.mean,
                    max: stats.max,
                    min: stats.min,
                    distinct: stats.distinct,
                    stddev: stats.stddev
                });
            });
        });

        return { rows: out, metrics: metrics, groupCol: groupCol };
    }

    /* ------------------------------ 输出 ------------------------------ */

    function formatNum(n) {
        if (n == null || typeof n !== 'number' || !isFinite(n)) return '—';
        if (Number.isInteger(n)) return String(n);
        // 四位小数够看，又不会把 0.30000000000000004 这种东西甩到界面上
        var rounded = Math.round(n * 1e4) / 1e4;
        return String(rounded);
    }

    function columnText(parsed, col) {
        return ((parsed && parsed.rows) || []).map(function (row) {
            var v = row[col];
            return v == null ? '' : String(v);
        });
    }

    // 行优先展开：第 1 行第 1 列、第 1 行第 2 列……和 Excel 一列一列粘的顺序一致
    function columnsTsv(parsed, cols, nameOf) {
        var list = (cols || []).filter(function (c) {
            return c >= 0 && c < (parsed ? parsed.cols : 0);
        });
        if (!list.length) return '';
        var name = typeof nameOf === 'function'
            ? nameOf
            : function (i) { return String(i + 1); };
        // 带表头：贴回表格软件是一张能认列的表，而不是一堆没名字的值
        var lines = [list.map(function (c) { return name(c); }).join('\t')];
        ((parsed && parsed.rows) || []).forEach(function (row) {
            lines.push(list.map(function (c) {
                var v = row[c];
                return v == null ? '' : String(v);
            }).join('\t'));
        });
        return lines.join('\n');
    }

    /**
     * 结果表 -> 制表符分隔文本（贴进 Excel / 飞书表格就是一整张表）
     * @param {object} result aggregate() 的返回值
     * @param {{group?: string, col?: string, metric: function(string):string}} labels
     *        表头文案由页面按当前语言给，纯函数不碰 i18n
     */
    function toTsv(result, labels) {
        var lab = labels || {};
        var metrics = (result && result.metrics) || [];
        var head = [];
        if (result && result.groupCol >= 0) head.push(lab.group || 'group');
        head.push(lab.col || 'column');
        metrics.forEach(function (m) { head.push(lab.metric ? lab.metric(m) : m); });

        var lines = [head.join('\t')];
        ((result && result.rows) || []).forEach(function (row) {
            var cells = [];
            if (result.groupCol >= 0) cells.push(row.group);
            cells.push(lab.colName ? lab.colName(row.col) : String(row.col + 1));
            metrics.forEach(function (m) { cells.push(formatNum(row[m])); });
            lines.push(cells.join('\t'));
        });
        return lines.join('\n');
    }

    return {
        LIMITS: LIMITS,
        METRICS: METRICS,
        DEFAULT_METRICS: DEFAULT_METRICS,
        sniff: sniff,
        toNumber: toNumber,
        parse: parse,
        colStats: colStats,
        aggregate: aggregate,
        formatNum: formatNum,
        columnText: columnText,
        columnsTsv: columnsTsv,
        toTsv: toTsv
    };
});
