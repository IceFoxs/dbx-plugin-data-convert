/**
 * selectconv.test.js — 编辑器选区右键菜单的转换规则（纯函数，无 DOM）
 *
 *   node tests/selectconv.test.js
 *
 * 覆盖：每条转换至少一条用例；空串 / 只有空白 / 单行 / CRLF / 超长 / JSON 非法 /
 * 数值排序混入非数字 / 引号内含引号 / Base64 往返 / SQL 与 DBXSql 对齐。
 * 菜单本身（定位、键盘、剪贴板）在 tests/ui.smoke.js 里验。
 */
'use strict';

const C = require('../ui/js/selectconv.js');
const ESC = require('../ui/js/escape.js');
const SQL = require('../ui/js/sqlgen.js');
const QR = require('../ui/js/qr.js');

const CTX = { escape: ESC, sql: SQL, qr: QR };

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

function ok(flag, msg) {
    if (!flag) throw new Error(msg || '断言失败');
}

/** 跑一条转换并拿到结果文本；不可用就抛，避免「其实没转换成功」也算过 */
function run(id, text, ctx) {
    const r = C.run(id, text, ctx || CTX);
    if (!r || !r.ok) throw new Error(id + ' 失败：' + JSON.stringify(r));
    return r.text;
}

function fails(id, text, code, ctx) {
    const r = C.run(id, text, ctx || CTX);
    ok(!r.ok, id + ' 本应失败，实际成功');
    eq(r.code, code, id + ' 的错误码');
}

console.log('\n== selectconv ==');

/* ------------------------------------------------------------------ 清单 */

check('菜单项 id 唯一，且每项都归到某个分组', () => {
    const seen = new Set();
    C.list().forEach((item) => {
        ok(!seen.has(item.id), '重复 id ' + item.id);
        seen.add(item.id);
        ok(!!item.group, item.id + ' 没有分组');
    });
    ok(seen.size >= 35, '菜单项只有 ' + seen.size + ' 条，少了');
});

check('子菜单的第一项有 first 标记，且同组只有一项', () => {
    const subs = {};
    C.list().forEach((item) => {
        if (!item.sub) return;
        subs[item.sub] = (subs[item.sub] || 0) + 1;
        if (item.first) subs[item.sub + ':first'] = (subs[item.sub + ':first'] || 0) + 1;
    });
    ['escape', 'tidy', 'join', 'quote', 'image'].forEach((name) => {
        eq(subs[name + ':first'], 1, name + ' 子菜单的第一项');
        ok(subs[name] >= 2, name + ' 子菜单只有 ' + subs[name] + ' 项');
    });
});

/* ---------------------------------------------------------------- 基础项 */

check('空串：基础项可用，转换项不可用', () => {
    ok(C.canRun('copy', ''), '复制应可用');
    ok(C.canRun('select-all', ''), '全选应可用');
    ok(!C.canRun('esc-base64-encode', ''), '空串不该能编码');
    ok(!C.canRun('tidy-dedupe', '   \n\t\n'), '只有空白也不该能整理');
});

check('超过 100 万字符：编码与整理置灰，复制仍可用', () => {
    const big = 'a'.repeat(1000001);
    ok(!C.canRun('esc-base64-encode', big), '超大文本应置灰');
    ok(!C.canRun('tidy-dedupe', big), '超大文本应置灰');
    ok(C.canRun('copy', big), '复制不该受限制');
    fails('esc-base64-encode', big, 'sel-too-large');
});

/* ---------------------------------------------------------------- 转义类 */

check('Base64 编码 / 解码往返（中文 + emoji）', () => {
    const src = '订单 120101000001417742 ✅';
    const encoded = run('esc-base64-encode', src);
    eq(run('esc-base64-decode', encoded), src);
});

check('URL 编码 / 解码往返', () => {
    const src = 'a b&c=中 文';
    eq(run('esc-url-decode', run('esc-url-encode', src)), src);
});

check('JSON 转义 / 去转义往返', () => {
    const src = 'line1\nline2 "quoted"';
    const encoded = run('esc-json-encode', src);
    eq(encoded.charAt(0), '"', 'JSON 转义要带外层引号');
    eq(run('esc-json-decode', encoded), src);
});

check('HTML / Unicode / Hex / SQL / 正则 正向都能出结果', () => {
    eq(run('esc-html-encode', '<a href="x">'), '&lt;a href=&quot;x&quot;&gt;');
    eq(run('esc-unicode-encode', '中'), '\\u4e2d');
    eq(run('esc-hex-encode', 'ab'), '6162');
    eq(run('esc-sql-encode', "O'Brien"), "O''Brien");
    eq(run('esc-regex-encode', 'a.b'), 'a\\.b');
});

check('非法输入返回 code，不抛异常', () => {
    fails('esc-base64-decode', '不是 base64!!', 'esc-bad-base64');
    fails('esc-hex-decode', 'zz', 'esc-bad-hex');
});

check('没注入引擎时给 sel-no-engine', () => {
    fails('esc-base64-encode', 'abc', 'sel-no-engine', {});
});

check('转义换行：CRLF / LF / TAB 各自成一个转义', () => {
    eq(run('esc-newline-encode', 'a\r\nb\nc\td'), 'a\\nb\\nc\\td');
    eq(run('esc-newline-decode', 'a\\nb\\nc\\td'), 'a\nb\nc\td');
});

check('转义换行不动反斜杠：只把真换行换成字面 \\n', () => {
    // 这条是刻意的单向转换：Windows 路径 C:\temp 不该被改写成 C:\\temp
    eq(run('esc-newline-encode', 'a\\nb'), 'a\\nb');
    eq(run('esc-newline-decode', 'a\\rb'), 'a\rb');
});

/* ---------------------------------------------------------------- 整理类 */

check('去首尾空白：逐行 trim，并去掉整段首尾空行', () => {
    eq(run('tidy-trim', '\n  甲  \n 乙\n\n'), '甲\n乙');
});

check('去所有空白：换行、制表、全角空格一起清', () => {
    eq(run('tidy-strip-ws', ' a b\n\tc\u3000d '), 'abcd');
});

check('按行去重：保留首次出现的顺序', () => {
    eq(run('tidy-dedupe', 'b\na\nb\nc\na'), 'b\na\nc');
});

check('排序：非空行升序，空行收到末尾', () => {
    eq(run('tidy-sort', 'c\n\na\nb'), 'a\nb\nc\n');
});

check('数值排序：10 排在 9 后面（不是字符串序）', () => {
    eq(run('tidy-sort-num', '10\n9\n100\n1'), '1\n9\n10\n100');
});

check('数值排序：混入非数字时置灰 + 给 sel-not-numeric', () => {
    ok(!C.canRun('tidy-sort-num', '10\nabc'), '混入非数字应置灰');
    fails('tidy-sort-num', '10\nabc', 'sel-not-numeric');
});

check('反转行序', () => {
    eq(run('tidy-reverse', 'a\nb\nc'), 'c\nb\na');
});

check('加行号：宽度按总行数补零，空行不加号', () => {
    eq(run('tidy-number', 'a\n\nb'), '1. a\n\n2. b');
    const twelve = Array.from({ length: 12 }, (_, i) => 'v' + i).join('\n');
    const numbered = run('tidy-number', twelve).split('\n');
    eq(numbered[0], '01. v0');
    eq(numbered[11], '12. v11');
});

check('拼接成一行：逗号 / 顿号 / 空格，顺带吃掉空行', () => {
    eq(run('tidy-join-comma', 'a\n\nb \n c'), 'a, b, c');
    eq(run('tidy-join-cn', 'a\nb'), 'a、b');
    eq(run('tidy-join-space', ' a \n b '), 'a b');
});

check('大小写：大写 / 小写 / 标题式', () => {
    eq(run('tidy-upper', 'aBc'), 'ABC');
    eq(run('tidy-lower', 'aBc'), 'abc');
    eq(run('tidy-title', 'hello world-foo'), 'Hello World-Foo');
});

check('包引号：每行各包一层，内部同种引号成对转义', () => {
    eq(run('tidy-quote-single', "a\nO'Brien\n\nc"), "'a'\n'O''Brien'\n'c'");
    eq(run('tidy-quote-double', 'a"b'), '"a""b"');
    eq(run('tidy-quote-backtick', 'a`b'), '`a``b`');
});

check('JSON 美化 / 压缩：非法 JSON 置灰并回 sel-bad-json', () => {
    eq(run('tidy-json-pretty', '{"a":1,"b":[2,3]}'), '{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}');
    eq(run('tidy-json-minify', '{ "a" : 1 }'), '{"a":1}');
    ok(!C.canRun('tidy-json-pretty', '{a:1}'), '非法 JSON 应置灰');
    fails('tidy-json-pretty', '{a:1}', 'sel-bad-json');
});

check('JSON 美化保得住大整数与中文（不经过 Number 中转）', () => {
    const src = '{"id":120101000001417742,"name":"中文"}';
    const out = run('tidy-json-pretty', src);
    ok(out.indexOf('120101000001417742') >= 0, '长整数被改写：' + out);
    ok(out.indexOf('中文') >= 0, '中文丢了');
});

/* ----------------------------------------------------------------- SQL */

check('生成 IN：一行一个值，字符串加引号', () => {
    const out = run('sql-in', '100000000000000001\n100000000000000002');
    eq(out, "IN (\n  '100000000000000001',\n  '100000000000000002'\n)");
});

check('生成 IN：顿号分隔也认（复用 DBXSql 的分隔规则）', () => {
    const out = run('sql-in', '100000000000000001、100000000000000002、100000000000000001');
    eq(out, "IN (\n  '100000000000000001',\n  '100000000000000002'\n)");
});

check('生成 NOT IN', () => {
    ok(run('sql-not-in', 'a\nb').indexOf('NOT IN (') === 0, '模板不对');
});

check('生成 INSERT：表名用 your_table 占位', () => {
    const out = run('sql-insert', 'a\nb');
    eq(out, "INSERT INTO your_table VALUES\n  ('a'),\n  ('b');");
});

check('SQL 生成与 DBXSql.analyze 的结果逐字符一致', () => {
    const src = 'a、b,c\nb';
    const want = SQL.analyze(src, {
        template: 'in', quote: 'single', multiline: true, dedupe: true, table: 'your_table'
    }).sql;
    eq(run('sql-in', src), want);
});

check('SQL：全是分隔符时置灰', () => {
    ok(!C.canRun('sql-in', '、、\n\n'), '没有值时应置灰');
    fails('sql-in', '、、', 'sel-empty');
});

/* --------------------------------------------------------------- 二维码 */

check('二维码：容量内可用，超出按 M 级上限置灰', () => {
    ok(C.canRun('qr-copy', 'hello', CTX), '短文本应可用');
    const fit = 'a'.repeat(QR.BYTE_CAP.M);
    const over = 'a'.repeat(QR.BYTE_CAP.M + 1);
    ok(C.canRun('qr-copy', fit, CTX), '刚好到上限应可用');
    ok(!C.canRun('qr-copy', over, CTX), '超出上限应置灰');
    ok(!C.canRun('qr-open', over, CTX), '超容量时「打开」也置灰');
});

check('二维码：中文按 UTF-8 字节算容量', () => {
    // M 级 2331 字节，一个汉字 3 字节 → 777 个汉字刚好，778 个超
    ok(C.canRun('qr-copy', '汉'.repeat(777), CTX), '777 个汉字应可用');
    ok(!C.canRun('qr-copy', '汉'.repeat(778), CTX), '778 个汉字应超容量');
});

/* ------------------------------------------------------------ 统一出口 */

check('未知 id → sel-unknown', () => {
    fails('no-such-action', 'abc', 'sel-unknown');
});

check('run 不改输入（纯函数）', () => {
    const src = 'b\na\nb';
    run('tidy-dedupe', src);
    run('tidy-sort', src);
    run('tidy-quote-single', src);
    eq(src, 'b\na\nb');
});

const total = passed + failed;
console.log('\n--- selectconv: ' + passed + '/' + total + ' passed ---');
if (failed) {
    console.error('\n失败用例:');
    failures.forEach((f) => console.error('  - ' + f));
    process.exit(1);
}
