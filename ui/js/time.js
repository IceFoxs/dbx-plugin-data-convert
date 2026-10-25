/*
 * Time conversion — pure functions, no DOM.
 *
 * A batch tool: one time value per line, converted into many common forms.
 * Loaded as a classic script (window.DBXTime) and as CommonJS in tests.
 *
 *   parseLine()  "2020-01-01" / "2020-01-01 00:00:00" / "2020-01-01T00:00:00" /
 *                "1577836800" (s) / "1577836800000" (ms) -> { ok, ms, input }
 *   parse()      whole text -> { rows, okCount, failCount }
 *   fields(ms)   ms -> { unixSec, unixMs, local, localT, utc, iso, yearMonthDay, time, relative }
 *   describe(ms) ms -> "3 天前 / 5 分钟后"  (relative, at parse time)
 *   quick(kind)  'now' / 'today' / 'yesterday' / 'week' / 'month' -> ms（截到整秒）
 *
 * Timestamps are ambiguous: a 10-digit integer is treated as seconds, 13-digit
 * as milliseconds, 16-digit (microseconds) is trimmed to ms. A bare 10/13 digit
 * number with no date is a Unix timestamp, never a calendar date.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.DBXTime = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var LIMITS = {
        maxLines: 2000,     // 批量最多几行
        minMs: -8.64e15,    // Date 能表示的边界（约 ±27 万年）
        maxMs: 8.64e15
    };

    // 转换规则（field key -> 是否默认开启）。用户能勾选要输出哪些格式，
    // 不需要把所有格式都算一遍。默认只勾「本地时间」两种写法（空格 / T 分隔），
    // 正是最常见的「2020-01-01 00:00:00 ↔ 2020-01-01T00:00:00」互转。
    var FIELDS = {
        unixSec: { label: 'unixSec', def: false },      // Unix 时间戳（秒）
        unixMs: { label: 'unixMs', def: false },        // Unix 时间戳（毫秒）
        local: { label: 'local', def: true },           // 本地时间 "2020-01-01 00:00:00"
        localT: { label: 'localT', def: true },         // 本地时间 "2020-01-01T00:00:00"
        utc: { label: 'utc', def: false },              // UTC "2020-01-01 00:00:00 UTC"
        iso: { label: 'iso', def: false },              // ISO 8601 "2020-01-01T00:00:00.000Z"
        relative: { label: 'relative', def: false }     // 相对时间 "3 天前"
    };

    function pad2(n) { return (n < 10 ? '0' : '') + n; }
    function pad3(n) { return (n < 10 ? '00' : n < 100 ? '0' : '') + n; }

    function formatDateParts(y, mo, d, h, mi, s, ms) {
        return pad2(y) + '-' + pad2(mo) + '-' + pad2(d) + ' '
            + pad2(h) + ':' + pad2(mi) + ':' + pad2(s);
    }

    // ---------- 输入解析 ----------

    // 纯数字：按位数判断秒 / 毫秒 / 微秒
    function parseTimestamp(text) {
        var m = /^[+-]?\d{9,16}$/.exec(text);
        if (!m) return null;
        var n = Number(text);
        if (!isFinite(n)) return null;
        var digits = text.replace(/^[+-]/, '').length;
        if (digits <= 10) return n * 1000;            // 秒
        if (digits <= 13) return n;                   // 毫秒
        return Math.floor(n / 1000);                  // 微秒 -> 毫秒
    }

    // 常见日期写法：2020-01-01 / 2020-01-01 00:00:00 / 2020-01-01T00:00:00(.123)(Z|±hh:mm)
    // 只认「年月日」齐全的（月和日可是一位数），不全的交给 Date 兜底。
    function parseDate(text) {
        var s = String(text).trim();
        var m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{1,2})(?::(\d{1,2})(?:\.(\d{1,3}))?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/.exec(s);
        if (!m) return null;
        var y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
        var h = m[4] != null ? Number(m[4]) : 0;
        var mi = m[5] != null ? Number(m[5]) : 0;
        var sec = m[6] != null ? Number(m[6]) : 0;
        var frac = m[7] != null ? Number(m[7].slice(0, 3).padEnd(3, '0')) : 0;
        var tz = m[8] || '';
        // 基础校验
        if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || sec > 59) return null;

        var ms;
        if (tz === 'Z' || tz === 'z') {
            ms = Date.UTC(y, mo - 1, d, h, mi, sec, frac);
        } else if (tz) {
            var sign = tz.charAt(0) === '-' ? -1 : 1;
            var zh = Number(tz.slice(1, 3));
            var zm = Number(tz.slice(tz.length - 2));
            ms = Date.UTC(y, mo - 1, d, h, mi, sec, frac) - sign * (zh * 60 + zm) * 60000;
        } else {
            // 无时区：当本地时间
            ms = new Date(y, mo - 1, d, h, mi, sec, frac).getTime();
        }
        return ms;
    }

    function inRange(ms) {
        return isFinite(ms) && ms >= LIMITS.minMs && ms <= LIMITS.maxMs;
    }

    /** 一行 -> { ok, ms?, code? } */
    function parseLine(raw) {
        var text = String(raw == null ? '' : raw).trim();
        if (!text) return { ok: false, code: 'empty' };

        var ts = parseTimestamp(text);
        if (ts != null) {
            return inRange(ts) ? { ok: true, ms: ts } : { ok: false, code: 'range' };
        }

        var dt = parseDate(text);
        if (dt != null) {
            return inRange(dt) ? { ok: true, ms: dt } : { ok: false, code: 'range' };
        }

        // 兜底：交给 Date 试试（如 "Jan 1, 2020"、相对英文等），能读出来就收
        var d = new Date(text);
        var t = d.getTime();
        if (isNaN(t)) return { ok: false, code: 'bad' };
        return inRange(t) ? { ok: true, ms: t } : { ok: false, code: 'range' };
    }

    /**
     * 整段文本 -> 批量结果。
     * { ok, rows:[{line,ok,ms?,code?}], okCount, failCount }
     */
    function parse(text) {
        var lines = String(text == null ? '' : text).split(/\r?\n/);
        var rows = [];
        var okCount = 0, failCount = 0, truncated = false;

        for (var i = 0; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            if (rows.length >= LIMITS.maxLines) { truncated = true; break; }
            var row = parseLine(lines[i]);
            row.line = i + 1;
            row.input = lines[i].trim();
            if (row.ok) okCount++; else failCount++;
            rows.push(row);
        }
        return { ok: okCount > 0, rows: rows, okCount: okCount, failCount: failCount, truncated: truncated };
    }

    // ---------- 输出 ----------

    /** ms -> 各字段。local* 用宿主时区，utc/iso 用 UTC。 */
    function fields(ms) {
        var d = new Date(ms);
        var lu = d.getUTCFullYear(), lmo = d.getUTCMonth(), ld = d.getUTCDate();
        var lh = d.getUTCHours(), lmi = d.getUTCMinutes(), ls = d.getUTCSeconds(), lms = d.getUTCMilliseconds();
        var local = new Date(ms);
        var y = local.getFullYear(), mo = local.getMonth(), dd = local.getDate();
        var h = local.getHours(), mi = local.getMinutes(), s = local.getSeconds();

        var localStr = formatDateParts(y, mo + 1, dd, h, mi, s);
        var utcStr = formatDateParts(lu, lmo + 1, ld, lh, lmi, ls);

        return {
            unixSec: String(Math.floor(ms / 1000)),
            unixMs: String(ms),
            local: localStr,
            localT: localStr.replace(' ', 'T'),
            utc: utcStr + ' UTC',
            iso: utcStr.replace(' ', 'T') + '.' + pad3(lms) + 'Z',
            relative: describe(ms)
        };
    }

    // ---------- 快捷时刻 ----------

    // 页面顶部「快捷操作」用的五个常用时刻。除「当前时间」外都取「起点」：
    // 今天 / 昨天 / 本周一 / 本月 1 日的 00:00:00，一律截到整秒，
    // 这样填进输入框的是干净的 "YYYY-MM-DD HH:mm:ss"，不带毫秒尾巴。
    // 传入 now 便于测试；kind 不认识时返回 null。
    function quick(kind, now) {
        var base = (typeof now === 'number' && isFinite(now)) ? now : Date.now();
        var d = new Date(base);
        var y = d.getFullYear(), mo = d.getMonth(), day = d.getDate();
        var ms;
        switch (kind) {
            case 'now':
                ms = base;
                break;
            case 'today':
                ms = new Date(y, mo, day).getTime();
                break;
            case 'yesterday':
                ms = new Date(y, mo, day - 1).getTime();
                break;
            case 'week': {
                // 周一为一周起点（getDay() 里周日是 0，先换成周一=0）
                var back = (d.getDay() + 6) % 7;
                ms = new Date(y, mo, day - back).getTime();
                break;
            }
            case 'month':
                ms = new Date(y, mo, 1).getTime();
                break;
            default:
                return null;
        }
        if (!inRange(ms)) return null;
        return Math.floor(ms / 1000) * 1000;
    }

    // 相对时间：中文里最常用的「多久前 / 多久后」。跨语言文案在页面层做，
    // 这里只给一个稳定的 { delta, future } 描述，方便 i18n。
    function describe(ms) {
        var delta = ms - Date.now();
        var abs = Math.abs(delta);
        var future = delta > 0;
        var UNITS = [
            [31536000000, 'year'], [2592000000, 'month'], [604800000, 'week'],
            [86400000, 'day'], [3600000, 'hour'], [60000, 'minute'], [1000, 'second']
        ];
        for (var i = 0; i < UNITS.length; i++) {
            if (abs >= UNITS[i][0]) {
                var n = Math.floor(abs / UNITS[i][0]);
                return { n: n, unit: UNITS[i][1], future: future, ms: delta };
            }
        }
        return { n: 0, unit: 'second', future: future, ms: delta };
    }

    return {
        LIMITS: LIMITS,
        FIELDS: FIELDS,
        parseTimestamp: parseTimestamp,
        parseDate: parseDate,
        parseLine: parseLine,
        parse: parse,
        fields: fields,
        describe: describe,
        quick: quick
    };
});
