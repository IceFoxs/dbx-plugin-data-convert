'use strict';

const T = require('../ui/js/time.js');

let passed = 0, failed = 0;
function check(name, fn) {
    try { fn(); passed++; console.log('  ok  ' + name); }
    catch (e) { failed++; console.error('  FAIL ' + name + '\n       ' + e.message); }
}
function eq(a, b, msg) {
    if (a !== b) throw new Error((msg || '') + '\n  期望: ' + JSON.stringify(b) + '\n  实际: ' + JSON.stringify(a));
}

// 用固定时间跑相对时间，避免依赖真实时钟
const NOW = Date.UTC(2020, 0, 1, 0, 0, 0); // 2020-01-01T00:00:00Z

check('纯函数导出齐全', () => {
    eq(typeof T.parse, 'function');
    eq(typeof T.fields, 'function');
    eq(typeof T.parseLine, 'function');
});

check('秒级时间戳', () => {
    const r = T.parseLine('1577836800'); // 2020-01-01T00:00:00Z
    eq(r.ok, true);
    eq(r.ms, 1577836800000);
});

check('毫秒级时间戳', () => {
    const r = T.parseLine('1577836800000');
    eq(r.ok, true);
    eq(r.ms, 1577836800000);
});

check('微秒级时间戳裁剪到毫秒', () => {
    const r = T.parseLine('1577836800000000');
    eq(r.ok, true);
    eq(r.ms, 1577836800000);
});

check('日期 YYYY-MM-DD', () => {
    const r = T.parseLine('2020-01-01');
    eq(r.ok, true);
    eq(isFinite(r.ms), true);
});

check('空格分隔 YYYY-MM-DD HH:mm:ss', () => {
    const r = T.parseLine('2020-01-01 00:00:00');
    eq(r.ok, true);
    // 本地时区，不依赖具体值，但必须有限
    eq(isFinite(r.ms), true);
});

check('T 分隔 YYYY-MM-DDTHH:mm:ss', () => {
    const r = T.parseLine('2020-01-01T00:00:00');
    eq(r.ok, true);
    eq(isFinite(r.ms), true);
});

check('带 Z 的 ISO', () => {
    const r = T.parseLine('2020-01-01T00:00:00.000Z');
    eq(r.ok, true);
    eq(r.ms, 1577836800000);
});

check('带毫秒与 +08:00 时区', () => {
    const r = T.parseLine('2020-01-01T08:00:00.000+08:00');
    eq(r.ok, true);
    eq(r.ms, 1577836800000); // 08:00 +08:00 = 00:00 UTC
});

check('空格与 T 分隔解析出同一时刻', () => {
    const a = T.parseLine('2020-01-01 00:00:00');
    const b = T.parseLine('2020-01-01T00:00:00');
    eq(a.ok, true);
    eq(b.ok, true);
    eq(a.ms, b.ms, '空格分隔与 T 分隔应解析为同一毫秒值');
});

check('非法输入', () => {
    eq(T.parseLine('not a date').ok, false);
    eq(T.parseLine('').ok, false);
});

check('fields 输出：空格与 T 两种本地写法', () => {
    // 用本地时间构造，保证 local 字段可预期
    const local = new Date(2020, 0, 1, 0, 0, 0);
    const f = T.fields(local.getTime());
    eq(f.local, '2020-01-01 00:00:00');
    eq(f.localT, '2020-01-01T00:00:00');
    eq(typeof f.unixSec, 'string');
    eq(typeof f.unixMs, 'string');
    eq(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC$/.test(f.utc), true, 'utc 形如 YYYY-MM-DD HH:mm:ss UTC');
    eq(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(f.iso), true, 'iso 形如 ISO8601');
    eq(typeof f.relative, 'object');
});

check('批量 parse：统计与行号', () => {
    const r = T.parse('2020-01-01\n1577836800\nbad line\n\n2020-01-02T12:30:00');
    eq(r.okCount, 3);
    eq(r.failCount, 1);
    eq(r.rows.length, 4);
    eq(r.rows[2].ok, false);
    eq(r.rows[2].code, 'bad');
    eq(r.rows[0].line, 1);
});

check('批量上限截断', () => {
    const lines = [];
    for (let i = 0; i < T.LIMITS.maxLines + 10; i++) lines.push('2020-01-01');
    const r = T.parse(lines.join('\n'));
    eq(r.truncated, true);
    eq(r.rows.length, T.LIMITS.maxLines);
});

check('FIELDS 规则表默认开关：只勾本地时间两种写法', () => {
    eq(T.FIELDS.local.def, true);
    eq(T.FIELDS.localT.def, true);
    eq(T.FIELDS.unixSec.def, false);
    eq(T.FIELDS.unixMs.def, false);
    eq(T.FIELDS.utc.def, false);
    eq(T.FIELDS.iso.def, false);
    eq(T.FIELDS.relative.def, false);
});

console.log('\n  ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
