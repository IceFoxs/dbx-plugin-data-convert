/**
 * escape.test.js — 转义工具集（URL / Base64 / HTML / JSON / Unicode / Hex / SQL / 正则）
 *
 * 纯 Node 运行：node tests/escape.test.js
 * 重点覆盖三件事：① 8 种转换双向都能还原原文（含中文与 emoji）；
 * ② 非法输入返回 code 而不是抛异常；③ 大输入不会失控。
 */
'use strict';

const E = require('../ui/js/escape.js');

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
    if (a !== b) throw new Error((msg || '') + '\n     expected: ' + b + '\n     actual:   ' + a);
}

function ok(cond, msg) {
    if (!cond) throw new Error(msg || 'assertion failed');
}

/** 编码 */
function enc(text, kind) {
    const r = E.convert(text, kind, 'encode');
    ok(r.ok, kind + ' 编码失败: ' + r.code);
    return r.text;
}

/** 解码 */
function dec(text, kind) {
    const r = E.convert(text, kind, 'decode');
    ok(r.ok, kind + ' 解码失败: ' + r.code);
    return r.text;
}

/** 编解码往返 */
function round(text, kind) {
    const mid = enc(text, kind);
    eq(dec(mid, kind), text, kind + ' 往返失败，中间结果: ' + mid);
    return mid;
}

function bad(text, kind, dir) {
    const r = E.convert(text, kind, dir);
    ok(!r.ok, '本应失败: ' + JSON.stringify(r));
    ok(typeof r.code === 'string' && r.code.indexOf('esc-') === 0, '错误码形如 esc-*: ' + r.code);
    return r.code;
}

console.log('\n=== URL ===');

check('URL 编码中文与保留字符', function () {
    eq(enc('a b', 'url'), 'a%20b');
    eq(enc('name=张三&x=1', 'url'), 'name%3D%E5%BC%A0%E4%B8%89%26x%3D1');
});

check('URL 往返', function () {
    round('https://a.cn/p?q=1&x=中文', 'url');
});

check('非法百分号序列报错', function () {
    eq(bad('%E4%', 'url', 'decode'), 'esc-bad-url');
});

console.log('\n=== Base64 ===');

check('Base64 编码 ASCII', function () {
    eq(enc('hello', 'base64'), 'aGVsbG8=');
});

check('Base64 往返（中文 / emoji）', function () {
    round('张三', 'base64');
    round('👨‍👩‍👧', 'base64');
    eq(enc('张三', 'base64'), Buffer.from('张三', 'utf8').toString('base64'));
});

check('Base64 忽略空白', function () {
    eq(dec('aGVs\nbG8=', 'base64'), 'hello');
});

check('非法 Base64 报错', function () {
    eq(bad('aGVsbG8*', 'base64', 'decode'), 'esc-bad-base64');
    eq(bad('abc', 'base64', 'decode'), 'esc-bad-base64');
});

console.log('\n=== HTML ===');

check('HTML 转义五个字符', function () {
    eq(enc(`<a href="x">&'</a>`, 'html'), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
});

check('HTML 往返', function () {
    round(`<div class='a'>中文 & "引号"</div>`, 'html');
});

check('数字实体与命名实体', function () {
    eq(dec('&#20013;&#x6587;&amp;', 'html'), '中文&');
    eq(dec('&nbsp;', 'html'), '\u00A0');
});

check('未知实体原样保留', function () {
    eq(dec('&nope;', 'html'), '&nope;');
});

console.log('\n=== JSON 字符串 ===');

check('JSON 编码带引号与换行', function () {
    eq(enc('a"b\nc', 'json'), '"a\\"b\\nc"');
});

check('JSON 往返', function () {
    round('{"a": "中文"}', 'json');
});

check('不带外层引号也能解', function () {
    eq(dec('a\\"b\\nc', 'json'), 'a"b\nc');
});

check('非法 JSON 字符串报错', function () {
    eq(bad('a"b', 'json', 'decode'), 'esc-bad-json');
});

console.log('\n=== Unicode ===');

check('Unicode 转义中文', function () {
    eq(enc('中', 'unicode'), '\\u4e2d');
});

check('Unicode 保留可打印 ASCII', function () {
    eq(enc('a Z 0', 'unicode'), 'a Z 0');
});

check('Unicode 往返（含 emoji 代理对）', function () {
    round('中文 abc', 'unicode');
    round('👋', 'unicode');
    const mid = enc('👋', 'unicode');
    eq(mid, '\\ud83d\\udc4b');
    eq(dec(mid, 'unicode'), '👋');
});

check('控制字符也转义', function () {
    eq(enc('\n', 'unicode'), '\\u000a');
    eq(dec('\\u000a', 'unicode'), '\n');
});

console.log('\n=== Hex ===');

check('Hex 编码 UTF-8 字节', function () {
    eq(enc('A', 'hex'), '41');
    eq(enc('中', 'hex'), 'e4b8ad');
});

check('Hex 往返', function () {
    round('中文 hello', 'hex');
});

check('Hex 容忍空格与 0x 前缀', function () {
    eq(dec('e4 b8 ad', 'hex'), '中');
    eq(dec('0x41', 'hex'), 'A');
});

check('奇数字节 / 非法字符报错', function () {
    eq(bad('abc', 'hex', 'decode'), 'esc-bad-hex');
    eq(bad('zz', 'hex', 'decode'), 'esc-bad-hex');
});

console.log('\n=== SQL ===');

check('SQL 单引号翻倍', function () {
    eq(enc("O'Reilly", 'sql'), "O''Reilly");
});

check('SQL 往返', function () {
    round("it's a 'test'", 'sql');
});

console.log('\n=== 正则 ===');

check('正则转义元字符', function () {
    eq(enc('a.b*c', 'regex'), 'a\\.b\\*c');
    eq(enc('[a-z]{2}', 'regex'), '\\[a-z\\]\\{2\\}');
});

check('正则转义后能当字面量匹配', function () {
    const lit = enc('1+1=2', 'regex');
    ok(new RegExp(lit).test('xx1+1=2xx'), '应能匹配');
});

check('反转义保留预定义类', function () {
    eq(dec('\\d+\\s\\w', 'regex'), '\\d+\\s\\w');
    eq(dec('a\\.b', 'regex'), 'a.b');
});

check('正则往返', function () {
    round('file(1).txt', 'regex');
});

console.log('\n=== 入口与限流 ===');

check('未知类型报错', function () {
    eq(E.convert('x', 'nope', 'encode').code, 'esc-unknown-kind');
});

check('dir 缺省按编码处理', function () {
    eq(E.convert('a b', 'url').text, 'a%20b');
});

check('超长输入被拦', function () {
    const big = 'a'.repeat(E.LIMITS.chars + 1);
    eq(E.convert(big, 'url', 'encode').code, 'esc-too-large');
});

check('flip 对调方向', function () {
    eq(E.flip('encode'), 'decode');
    eq(E.flip('decode'), 'encode');
});

check('2 M 字符编码不失控（时间有界）', function () {
    const big = '中文abc123'.repeat(200000); // 约 2 M 字符
    const started = Date.now();
    const r = E.convert(big, 'base64', 'encode');
    ok(r.ok, '编码应成功');
    ok(Date.now() - started < 8000, '耗时过长: ' + (Date.now() - started) + 'ms');
    ok(r.text.length > big.length, '应有输出');
});

check('UTF-8 字节换算与 Node 一致', function () {
    const s = '中文👋a';
    eq(Array.from(E.utf8Bytes(s)), Array.from(Buffer.from(s, 'utf8')));
    eq(E.bytesUtf8(E.utf8Bytes(s)), s);
});

check('空字符串不报错', function () {
    E.KIND_IDS.forEach(function (k) {
        const r = E.convert('', k, 'encode');
        ok(r.ok, k + ' 空串编码失败');
    });
});

const total = passed + failed;
console.log('\n--- escape: ' + passed + '/' + total + ' passed ---');
if (failed) {
    console.error('\n失败用例:');
    failures.forEach((f) => console.error('  - ' + f));
    process.exit(1);
}
