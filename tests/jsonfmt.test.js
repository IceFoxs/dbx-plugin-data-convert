/**
 * jsonfmt.test.js — JSON 格式化内核（纯函数 + 可续跑扫描器，无 DOM）
 *
 *   node tests/jsonfmt.test.js
 *
 * 这里钉三件事：
 *   1. 格式化结果对不对（缩进、压缩、JSONL、大整数精度、键排序）；
 *   2. 报错码和行列号准不准（页面靠它把光标送到出错那一行）；
 *   3. 分片扫描是不是真的「可续跑」——切很多片跑出来的结果必须和一次跑完逐字节相同，
 *      取消要立刻停，深嵌套 / 超大输出不能把宿主拖死。
 * 页面上的渲染、复制 / 导出、大文件摘要卡在 tests/ui.smoke.js 里验。
 */
'use strict';

const J = require('../ui/js/jsonfmt.js');

let passed = 0;
let failed = 0;
const failures = [];

function check(name, fn) {
    try {
        fn();
        passed++;
        console.log('  ok   ' + name);
    } catch (err) {
        failed++;
        failures.push(name + ' → ' + err.message);
        console.error('  FAIL ' + name + '\n       ' + err.message);
    }
}

function eq(actual, expected, msg) {
    const a = JSON.stringify(actual);
    const b = JSON.stringify(expected);
    if (a !== b) throw new Error((msg ? msg + '：' : '') + '期望 ' + b + '，实际 ' + a);
}

function ok(value, msg) {
    if (!value) throw new Error(msg || '断言失败');
}

function fmt(s, opts) {
    return J.format(s, opts);
}

// ---------------------------------------------------------------- 基本格式化
console.log('\n== 基本格式化 ==');

check('对象按 2 空格缩进、冒号后留一个空格', () => {
    eq(fmt('{"a":1,"b":"x"}').text, '{\n  "a": 1,\n  "b": "x"\n}');
});

check('数组一行一项', () => {
    eq(fmt('[1,2,3]').text, '[\n  1,\n  2,\n  3\n]');
});

check('嵌套按层递增', () => {
    eq(fmt('{"a":{"b":[1]}}').text, '{\n  "a": {\n    "b": [\n      1\n    ]\n  }\n}');
});

check('空对象 / 空数组不换行', () => {
    eq(fmt('{}').text, '{}');
    eq(fmt('[]').text, '[]');
    eq(fmt('{"a":{},"b":[]}').text, '{\n  "a": {},\n  "b": []\n}');
});

check('缩进 4 / Tab 都可选', () => {
    eq(fmt('{"a":1}', { indent: 4 }).text, '{\n    "a": 1\n}');
    eq(fmt('{"a":1}', { indent: '\t' }).text, '{\n\t"a": 1\n}');
});

check('压缩成一行', () => {
    eq(J.minify('{\n  "a": 1,\n  "b": [1, 2]\n}').text, '{"a":1,"b":[1,2]}');
    eq(J.minify('{ "a" : 1 }').text, '{"a":1}');
});

check('输入里的空白全部忽略（含 CRLF）', () => {
    eq(fmt('{\r\n\t"a"\t:\r\n 1 \r\n}').text, '{\n  "a": 1\n}');
});

check('字符串原样保留：转义、中文、emoji 都不动', () => {
    const src = '{"s":"a\\"b\\\\c\\nd\\u4e2d\\uD83D\\uDE00"}';
    const r = fmt(src);
    ok(r.ok, '应该成功');
    ok(r.text.indexOf('"a\\"b\\\\c\\nd\\u4e2d\\uD83D\\uDE00"') > 0, r.text);
});

check('数字按原文抄，大整数一位不丢', () => {
    eq(fmt('9007199254740993').text, '9007199254740993');
    eq(fmt('{"id":123456789012345678901}').text, '{\n  "id": 123456789012345678901\n}');
    eq(fmt('-0.000e+10').text, '-0.000e+10');
    eq(fmt('[1e3,-2.5,0]').text, '[\n  1e3,\n  -2.5,\n  0\n]');
});

check('true / false / null', () => {
    eq(fmt('[true,false,null]').text, '[\n  true,\n  false,\n  null\n]');
});

check('BOM 当没看见', () => {
    eq(fmt('\ufeff{"a":1}').text, '{\n  "a": 1\n}');
});

// ---------------------------------------------------------------- JSONL
console.log('\n== JSONL ==');

check('一行一条：每条各自格式化', () => {
    const r = fmt('{"a":1}\n{"b":2}');
    ok(r.ok, '应该成功');
    eq(r.text, '{\n  "a": 1\n}\n{\n  "b": 2\n}');
    eq(r.stats.records, 2);
});

check('单条正常时 records 是 1', () => {
    eq(fmt('{"a":1}').stats.records, 1);
});

check('同一行上跟第二个值 → extraContent', () => {
    eq(fmt('1 2').error.code, 'extraContent');
    eq(fmt('{"a":1} {"b":2}').error.code, 'extraContent');
});

check('jsonl:false 时明确只收一个值', () => {
    eq(fmt('{"a":1}\n{"b":2}', { jsonl: false }).error.code, 'extraContent');
});

check('JSONL 压缩：每条压一行，记录之间仍换行', () => {
    eq(J.minify('{"a":1}\n{"b":2}').text, '{"a":1}\n{"b":2}');
});

// ---------------------------------------------------------------- 错误与定位
console.log('\n== 错误与定位 ==');

check('空 / 全空白', () => {
    eq(fmt('').error.code, 'empty');
    eq(fmt('   \n\t ').error.code, 'empty');
});

check('缺值', () => {
    eq(fmt('{"a":}').error.code, 'expectValue');
    eq(fmt('[1,,2]').error.code, 'expectValue');
});

check('键没引号', () => {
    eq(fmt('{a:1}').error.code, 'expectKey');
});

check('键后面没冒号', () => {
    eq(fmt('{"a" 1}').error.code, 'expectColon');
});

check('两个值之间没逗号', () => {
    eq(fmt('[1 2]').error.code, 'expectComma');
    eq(fmt('{"a":1 "b":2}').error.code, 'expectComma');
});

check('多余逗号', () => {
    eq(fmt('[1,2,]').error.code, 'trailingComma');
    eq(fmt('{"a":1,}').error.code, 'trailingComma');
});

check('字符串没闭合 / 里面有裸控制字符', () => {
    eq(fmt('{"a":"x}').error.code, 'badString');
    eq(fmt('{"a":"x\ny"}').error.code, 'badString');
});

check('转义写法不对', () => {
    eq(fmt('{"a":"\\q"}').error.code, 'badEscape');
    eq(fmt('{"a":"\\u12"}').error.code, 'badEscape');
    eq(fmt('{"a":"\\uZZZZ"}').error.code, 'badEscape');
});

check('数字写法不对', () => {
    eq(fmt('01').error.code, 'badNumber');
    eq(fmt('1.').error.code, 'badNumber');
    eq(fmt('.5').error.code, 'expectValue');   // 值的位置不能以小数点开头
});

check('字面量写错', () => {
    eq(fmt('tru').error.code, 'badLiteral');
    eq(fmt('[True]').error.code, 'expectValue');   // 大写 True 不是合法的字面量起始
});

check('括号没闭合', () => {
    eq(fmt('{"a":1').error.code, 'unexpectedEnd');
    eq(fmt('[1,2').error.code, 'unexpectedEnd');
});

check('括号对不上', () => {
    eq(fmt('{"a":1]').error.code, 'unexpectedChar');
});

check('行号列号指到出错的那个字符', () => {
    const r = fmt('{\n  "a": 1,\n  "b": ,\n  "c": 2\n}');
    ok(!r.ok, '应该失败');
    eq(r.error.code, 'expectValue');
    eq(r.error.line, 3);
    eq(r.error.col, 8);
});

check('snipshot 里带上下文（用 ⏎ 表示换行）', () => {
    const r = fmt('{"a":1,}');
    ok(r.error.snippet.indexOf('⏎') < 0, '单行不该有换行标记');
    ok(r.error.snippet.length > 0, '要有原文片段');
});

check('错误结果不带半成品文本', () => {
    const r = fmt('{"a":1,"b":}');
    eq(r.text, '');
    eq(r.ok, false);
});

// ---------------------------------------------------------------- 极端输入
console.log('\n== 极端输入 ==');

check('一万层嵌套不爆栈，深度记得准', () => {
    const n = 10000;
    const r = fmt('['.repeat(n) + '1' + ']'.repeat(n));
    ok(r.ok, '应该成功');
    eq(r.stats.maxDepth, n);
});

check('深嵌套的输出不会按层数平方膨胀（缩进封顶）', () => {
    const n = 20000;
    const r = fmt('['.repeat(n) + '1' + ']'.repeat(n));
    ok(r.ok, '应该成功：' + (r.error && r.error.code));
    ok(r.text.length < 8 * 1024 * 1024, '输出 ' + r.text.length + ' 字符，太大');
    ok(r.stats.maxDepth === n, '深度 ' + r.stats.maxDepth);
});

check('超过输入上限直接拒绝，不去扫', () => {
    const r = fmt('a'.repeat(J.LIMITS.maxInput + 1));
    eq(r.error.code, 'tooLarge');
});

check('输出超上限报错，不硬拼到内存耗尽', () => {
    const old = J.LIMITS.maxOutput;
    J.LIMITS.maxOutput = 1024;
    try {
        const r = fmt('[' + new Array(500).fill('{"k":"vvvvvvvv"}').join(',') + ']');
        eq(r.ok, false);
        eq(r.error.code, 'outputTooLarge');
    } finally {
        J.LIMITS.maxOutput = old;
    }
});

// ---------------------------------------------------------------- 统计
console.log('\n== 统计 ==');

check('各类节点的计数', () => {
    const r = fmt('{"a":1,"b":[true,null,"s"],"c":{}}');
    eq(r.stats.objects, 2);
    eq(r.stats.arrays, 1);
    eq(r.stats.keys, 3);
    eq(r.stats.numbers, 1);
    eq(r.stats.strings, 4);      // 3 个键 + "s"
    eq(r.stats.literals, 2);
    eq(r.stats.nodes, 7);        // 1 数字 + 1 数组 + 2 字面量 + 1 字符串 + 1 空对象 + ...（容器各算一个）
    eq(r.stats.lines, r.text.split('\n').length);
});

check('字节数和字符数不是一回事', () => {
    const r = fmt('{"名":"中"}');
    ok(r.stats.bytes > r.stats.chars, 'UTF-8 里中文 3 字节');
});

// ---------------------------------------------------------------- 键排序
console.log('\n== 键排序 ==');

check('键按字典序重排，数组顺序不动', () => {
    eq(fmt('{"b":1,"a":{"d":2,"c":3},"arr":[3,1,2]}', { sortKeys: true }).text,
        '{\n  "a": {\n    "c": 3,\n    "d": 2\n  },\n  "arr": [\n    3,\n    1,\n    2\n  ],\n  "b": 1\n}');
});

check('JSONL 不做键排序，但结果照给（只提示）', () => {
    const r = fmt('{"a":1}\n{"b":2}', { sortKeys: true });
    eq(r.ok, true);
    eq(r.warnings[0].code, 'sortJsonl');
    eq(r.text, '{\n  "a": 1\n}\n{\n  "b": 2\n}');
});

check('大整数照样排序，且精度一位不丢', () => {
    const r = fmt('{"b":9007199254740993,"a":1}', { sortOrder: 'asc' });
    eq(r.ok, true);
    eq(r.warnings.length, 0);
    eq(r.text, '{\n  "a": 1,\n  "b": 9007199254740993\n}');
});

check('降序：同级键倒着排，深层也跟着倒', () => {
    const r = fmt('{"a":1,"c":{"x":1,"y":2},"b":3}', { sortOrder: 'desc' });
    eq(r.text, '{\n  "c": {\n    "y": 2,\n    "x": 1\n  },\n  "b": 3,\n  "a": 1\n}');
});

check('排序不动数组顺序（数组是有序的，不能排）', () => {
    const r = fmt('[3,1,2]', { sortOrder: 'asc' });
    eq(r.text, '[\n  3,\n  1,\n  2\n]');
});

check('排序压同时工作', () => {
    eq(fmt('{"b":2,"a":1}', { sortOrder: 'asc', minify: true }).text, '{"a":1,"b":2}');
    eq(fmt('{"b":2,"a":1}', { sortOrder: 'desc', minify: true }).text, '{"b":2,"a":1}');
});

check('排序后的结构与原输出一致（只换了成员顺序）', () => {
    const src = '{"b":[1,{"z":1,"y":[]}],"a":"x"}';
    const plain = fmt(src).text;
    const sorted = fmt(src, { sortOrder: 'asc' }).text;
    // 把「没排序的输出」再排一次，应与「直接排」逐字节相同——说明只是换了成员顺序
    eq(fmt(plain, { sortOrder: 'asc' }).text, sorted);
    // 已经是升序的再排一次不变（幂等）
    eq(fmt(sorted, { sortOrder: 'asc' }).text, sorted);
    ok(sorted.indexOf('"a"') < sorted.indexOf('"b"'), 'a 应排在 b 前');
});

check('排序也能扛一万层嵌套（不递归）', () => {
    const n = 10000;
    const src = '['.repeat(n) + '{"b":1,"a":2}' + ']'.repeat(n);
    const r = fmt(src, { sortOrder: 'asc' });
    eq(r.ok, true);
    eq(r.stats.maxDepth, n + 1);
    ok(r.text.indexOf('"a": 2') < r.text.indexOf('"b": 1'), '深层的对象也要排');
});

check('超体积跳过键排序，结果照给', () => {
    const old = J.LIMITS.sortKeys;
    J.LIMITS.sortKeys = 5;
    try {
        const r = fmt('{"b":2,"a":1}', { sortKeys: true });
        eq(r.ok, true);
        eq(r.warnings[0].code, 'sortTooLarge');
        ok(r.text.indexOf('"b"') < r.text.indexOf('"a"'), '没排序就是原顺序');
    } finally {
        J.LIMITS.sortKeys = old;
    }
});

// ---------------------------------------------------------------- 分片扫描
console.log('\n== 分片扫描（大文件不卡宿主） ==');

function bigJson(n) {
    const rows = [];
    for (let i = 0; i < n; i++) {
        rows.push({ orderNo: 'NO' + i, amount: i * 3.5, note: '备注文本' + i, tags: ['a', 'b'], ok: i % 2 === 0 });
    }
    return JSON.stringify(rows);
}

check('切很多片跑出来的结果和一次跑完逐字节相同', () => {
    const src = bigJson(1200);
    const sync = fmt(src);
    ok(sync.ok, '同步应该成功');
    const sc = J.createScanner(src, {});
    let slices = 0;
    for (;;) {
        slices++;
        if (sc.step(0.01) === 'done') break;
        if (slices > 100000) throw new Error('切片数失控');
    }
    const asyncRes = sc.result();
    ok(slices > 3, '应该切了好几片，实际 ' + slices);
    eq(asyncRes.text.length, sync.text.length, '长度');
    ok(asyncRes.text === sync.text, '内容必须完全一致');
    eq(asyncRes.stats.nodes, sync.stats.nodes);
});

check('每片真的有上限：一小片扫不完整个文件', () => {
    const src = bigJson(2000);
    const sc = J.createScanner(src, {});
    const first = sc.step(0.5);
    const p = sc.progress();
    ok(first === 'more', '第一片不该一次扫完');
    ok(p.ratio < 1, '进度应该还没到 100%');
    ok(p.processed > 0, '进度应该有推进');
    // 收尾时必须还能跑完
    while (sc.step(0.5) === 'more') { /* 继续 */ }
    ok(sc.result().ok, '最终应该成功');
});

check('进度只增不减，最后到 1', () => {
    const src = bigJson(300);
    const sc = J.createScanner(src, {});
    let last = -1;
    let guard = 0;
    for (;;) {
        guard++;
        if (sc.step(0.02) === 'done') break;
        const r = sc.progress().ratio;
        ok(r >= last, '进度倒退了：' + last + ' → ' + r);
        last = r;
        if (guard > 100000) throw new Error('切片数失控');
    }
    eq(sc.progress().ratio, 1);
});

check('取消之后立刻停，不再扫改', () => {
    const src = bigJson(500);
    const sc = J.createScanner(src, {});
    sc.step(0.02);
    sc.abort();
    const before = sc.progress().processed;
    eq(sc.step(0.02), 'done');
    eq(sc.progress().processed, before, '取消后不该再前进');
    const r = sc.result();
    eq(r.aborted, true);
    eq(r.error.code, 'cancelled');
    eq(r.text, '');
});

check('结果可以重复取，第二次走缓存', () => {
    const sc = J.createScanner('{"a":1}', {});
    const a = sc.result();
    const b = sc.result();
    ok(a === b, '应该返回同一个对象');
});

check('formatAsync：结果与同步一致，进度有回调', async () => {
    const src = bigJson(800);
    const sync = fmt(src);
    const seen = [];
    const res = await J.formatAsync(src, {}, {
        sliceMs: 0.05,
        onProgress: (p) => seen.push(p.ratio)
    });
    ok(res.text === sync.text, '内容必须一致');
    ok(seen.length >= 2, '应该有多次进度回调，实际 ' + seen.length);
    eq(seen[seen.length - 1], 1);
});

check('formatAsync：signal 一置位就返回 cancelled', async () => {
    const src = bigJson(800);
    const signal = { aborted: false };
    let n = 0;
    const res = await J.formatAsync(src, {}, {
        sliceMs: 0.05,
        signal: signal,
        onProgress: () => { if (++n === 2) signal.aborted = true; }
    });
    eq(res.aborted, true);
    eq(res.error.code, 'cancelled');
});

// ---------------------------------------------------------------- 转义工具
console.log('\n== 转义 / 反转义 ==');

check('escapeText 产出带引号的 JSON 字符串', () => {
    eq(J.escapeText('a"b\nc'), '"a\\"b\\nc"');
});

check('unescapeText 还原常见转义', () => {
    eq(J.unescapeText('"a\\nb"').text, 'a\nb');
    eq(J.unescapeText('"a\\tb"').text, 'a\tb');
    eq(J.unescapeText('"a\\\\b"').text, 'a\\b');
    eq(J.unescapeText('"a\\"b"').text, 'a"b');
    eq(J.unescapeText('\\u4e2d').text, '中');
    eq(J.unescapeText('"\\u4e2d"').quoted, true);
});

check('unescapeText 认代理对', () => {
    eq(J.unescapeText('"\\uD83D\\uDE00"').text, '😀');
});

check('unescapeText 对不认识的转义手软：原样留，不报错', () => {
    const r = J.unescapeText('C:\\Users\\x');
    ok(r.ok, '不该失败');
    ok(r.text.indexOf('\\U') > 0 || r.text.indexOf('\\Users') > 0, r.text);
    ok(r.lenient >= 1, '应记下宽松次数');
});

check('formatBytes / utf8Bytes', () => {
    eq(J.formatBytes(512), '512 B');
    eq(J.formatBytes(2048), '2.0 KB');
    eq(J.formatBytes(2 * 1024 * 1024), '2.0 MB');
    eq(J.utf8Bytes('abc'), 3);
    eq(J.utf8Bytes('中文'), 6);
    eq(J.utf8Bytes('😀'), 4);
});

// ---------------------------------------------------------------- 汇总
console.log('\n--- jsonfmt: ' + passed + '/' + (passed + failed) + ' passed ---');
if (failed) {
    console.log('\n失败：');
    failures.forEach((f) => console.log('  - ' + f));
}
process.exit(failed ? 1 : 0);
