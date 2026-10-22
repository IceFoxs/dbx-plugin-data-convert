/**
 * confconv.test.js — TOML / INI / .env / CSV / TSV / Query / Headers / Cookie / HTML
 *
 * 纯 Node 运行：node tests/confconv.test.js
 * 重点覆盖三件事：① 每种格式能解析出预期结构；② 往返不丢结构（JSON → X → JSON）；
 * ③ 错误只回 code + 行列，不含任何硬编码语言字符串。
 */
'use strict';

const C = require('../ui/js/confconv.js');

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

function has(text, needle, msg) {
    if (String(text).indexOf(needle) < 0) {
        throw new Error((msg || 'missing') + ': ' + needle + '\n--- in ---\n' + text);
    }
}

function lacks(text, needle, msg) {
    if (String(text).indexOf(needle) >= 0) throw new Error((msg || 'unexpected') + ': ' + needle);
}

/** 抛出的错误必须是 code + 可选 mark，不能带任何人类语言 */
function errCode(fn) {
    try {
        fn();
    } catch (e) {
        ok(typeof e.code === 'string' && e.code.length > 0, '错误缺 code: ' + e.message);
        return e;
    }
    throw new Error('本应抛错但没有');
}

console.log('\n=== TOML ===');

check('TOML 基本标量', function () {
    const o = C.parseToml('title = "hi"\nport = 8080\nratio = 3.14\nenabled = true\n');
    eq(o, { title: 'hi', port: 8080, ratio: 3.14, enabled: true });
});

check('TOML 整数支持十六进制 / 八进制 / 二进制与下划线', function () {
    const o = C.parseToml('hex = 0x1F\noct = 0o17\nbin = 0b101\nbig = 1_000_000\n');
    eq(o, { hex: 31, oct: 15, bin: 5, big: 1000000 });
});

check('TOML inf / nan', function () {
    const o = C.parseToml('a = inf\nb = -inf\nc = nan\n');
    ok(o.a === Infinity, 'inf: ' + o.a);
    ok(o.b === -Infinity, '-inf: ' + o.b);
    ok(o.c !== o.c, 'nan');
});

check('TOML 日期时间按字符串往返（JSON 没有日期类型）', function () {
    const o = C.parseToml('d = 2020-01-02\ndt = 2020-01-02T03:04:05Z\nt = 07:32:00\n');
    eq(o, { d: '2020-01-02', dt: '2020-01-02T03:04:05Z', t: '07:32:00' });
});

check('TOML 三引号多行字符串与字面字符串', function () {
    const o = C.parseToml('multi = """\nline1\nline2"""\nliteral = \'c:\\path\'\n');
    eq(o.multi, 'line1\nline2');
    eq(o.literal, 'c:\\path');
});

check('TOML 基本字符串的转义', function () {
    const o = C.parseToml('a = "x\\ty\\nz"\nb = "\\u00e9"\n');
    eq(o.a, 'x\ty\nz');
    eq(o.b, 'é');
});

check('TOML 数组可以跨行、可以有尾逗号', function () {
    const o = C.parseToml('ports = [\n  8001,\n  8002,\n]\n');
    eq(o.ports, [8001, 8002]);
});

check('TOML inline table', function () {
    const o = C.parseToml('cfg = { host = "a", port = 1, sub = { deep = true } }\n');
    eq(o.cfg, { host: 'a', port: 1, sub: { deep: true } });
});

check('TOML 表头与嵌套表', function () {
    const o = C.parseToml('[server]\nhost = "a"\n\n[server.db]\nname = "app"\n');
    eq(o, { server: { host: 'a', db: { name: 'app' } } });
});

check('TOML 数组表 [[x]] 出数组', function () {
    const o = C.parseToml('[[items]]\nsku = "A"\n\n[[items]]\nsku = "B"\n');
    eq(o.items, [{ sku: 'A' }, { sku: 'B' }]);
});

check('TOML 数组表下面还能挂子表', function () {
    const o = C.parseToml('[[items]]\nsku = "A"\n\n[items.meta]\nw = 1\n');
    eq(o.items[0], { sku: 'A', meta: { w: 1 } });
});

check('TOML quoted key 里的点不是嵌套', function () {
    const o = C.parseToml('"a.b" = 1\n');
    eq(o, { 'a.b': 1 });
});

check('TOML dotted key 会建嵌套', function () {
    const o = C.parseToml('a.b.c = 1\n');
    eq(o, { a: { b: { c: 1 } } });
});

check('TOML 注释与空行不影响解析', function () {
    const o = C.parseToml('# 开头注释\n\n[db] # 表头后的注释\nhost = "x" # 值后的注释\n');
    eq(o, { db: { host: 'x' } });
});

check('TOML 重复定义同一张表要报错', function () {
    const e = errCode(function () { C.parseToml('[a]\nx = 1\n[a]\ny = 2\n'); });
    eq(e.code, 'toml-dup-table');
    ok(e.mark && e.mark.line === 2, '应指向第 3 行: ' + JSON.stringify(e.mark));
});

check('TOML 坏值要报错并给出行列', function () {
    const e = errCode(function () { C.parseToml('a = ???\n'); });
    eq(e.code, 'toml-bad-value');
    ok(e.mark, '缺 mark');
});

check('TOML 坏键要报错', function () {
    eq(errCode(function () { C.parseToml('= 1\n'); }).code, 'toml-bad-key');
});

check('TOML 未闭合的数组要报错', function () {
    eq(errCode(function () { C.parseToml('a = [1, 2\n'); }).code, 'toml-unclosed');
});

check('TOML 非法转义要报错', function () {
    eq(errCode(function () { C.parseToml('a = "\\q"\n'); }).code, 'toml-bad-escape');
});

check('TOML 序列化：标量优先、子表在后', function () {
    const out = C.serializeToml({ title: 'x', n: 1, db: { host: 'a' } });
    has(out, 'title = "x"');
    has(out, '[db]');
    ok(out.indexOf('title') < out.indexOf('[db]'), '标量要排在子表前面');
});

check('TOML 序列化：对象数组出 [[x]]', function () {
    const out = C.serializeToml({ items: [{ sku: 'A' }, { sku: 'B' }] });
    has(out, '[[items]]');
    eq((out.match(/\[\[items\]\]/g) || []).length, 2);
});

check('TOML 序列化：标量数组保持一行', function () {
    has(C.serializeToml({ ports: [1, 2] }), 'ports = [1, 2]');
});

check('TOML 序列化：需要引号的键会加引号', function () {
    has(C.serializeToml({ 'a.b': 1 }), '"a.b" = 1');
});

check('TOML 序列化：特殊字符转义', function () {
    has(C.serializeToml({ s: 'a"b\\c\nd' }), '"a\\"b\\\\c\\nd"');
});

check('TOML 序列化：null 跳过（TOML 没有 null）', function () {
    const out = C.serializeToml({ a: 1, b: null });
    has(out, 'a = 1');
    lacks(out, 'b =', 'null 不该出现');
});

check('TOML 序列化：顶层数组包一层 items（文档根必须是表）', function () {
    const out = C.serializeToml([{ id: 1 }, { id: 2 }]);
    has(out, '[[items]]');
    eq(C.parseToml(out).items, [{ id: 1 }, { id: 2 }]);
});

check('TOML 序列化：标量无法表达要报错', function () {
    eq(errCode(function () { C.serializeToml(42); }).code, 'toml-need-object');
});

check('TOML 往返：结构一致', function () {
    const src = { title: 't', port: 1, on: true, tags: ['a'], db: { host: 'h' }, items: [{ id: 1 }] };
    const back = C.parseToml(C.serializeToml(src));
    eq(back, src);
});

console.log('\n=== INI ===');

check('INI section 是平级，不是嵌套', function () {
    const o = C.parseIni('[a]\nx = 1\n\n[b]\ny = 2\n');
    eq(o, { a: { x: '1' }, b: { y: '2' } });
});

check('INI 顶层键值（无 section）', function () {
    eq(C.parseIni('a = 1\nb = 2\n'), { a: '1', b: '2' });
});

check('INI 支持冒号分隔与 ; # 注释', function () {
    const o = C.parseIni('; comment\n# comment\nkey: value\n');
    eq(o, { key: 'value' });
});

check('INI 值是字符串（不猜类型）', function () {
    const o = C.parseIni('port = 8080\n');
    eq(o.port, '8080');
});

check('INI [a.b] 嵌套写法', function () {
    eq(C.parseIni('[a.b]\nx = 1\n'), { a: { b: { x: '1' } } });
});

check('INI 坏行要报错并给出行号', function () {
    const e = errCode(function () { C.parseIni('just text\n'); });
    eq(e.code, 'ini-bad-line');
    ok(e.mark && e.mark.line === 0, 'mark: ' + JSON.stringify(e.mark));
});

check('INI 缺右括号要报错', function () {
    eq(errCode(function () { C.parseIni('[section\n'); }).code, 'ini-bad-section');
});

check('INI 序列化：子节不吞后面的键', function () {
    const out = C.serializeIni({ a: { x: '1', sub: { y: '2' }, z: '3' } });
    const parsed = C.parseIni(out);
    // 标量必须排在子节前（否则会被 [a.sub] 吃掉），因此键顺序会变、内容不变
    eq(parsed, { a: { x: '1', z: '3', sub: { y: '2' } } });
});

check('INI 序列化：顶层标量排在 section 前', function () {
    const out = C.serializeIni({ top: '1', s: { k: '2' } });
    ok(out.indexOf('top=1') < out.indexOf('[s]'), out);
});

check('INI 序列化：顶层非对象要报错', function () {
    eq(errCode(function () { C.serializeIni('x'); }).code, 'ini-need-object');
});

console.log('\n=== .env ===');

check('env 基本键值与注释', function () {
    eq(C.parseEnv('# c\nA=1\nB=two\n'), { A: '1', B: 'two' });
});

check('env 支持 export 前缀', function () {
    eq(C.parseEnv('export A=1\n'), { A: '1' });
});

check('env 双引号内解析转义、单引号保持原样', function () {
    const o = C.parseEnv('A="line1\\nline2"\nB=\'raw\'\n');
    eq(o.A, 'line1\nline2');
    eq(o.B, 'raw');
});

check('env 未加引号的值里的 # 是注释', function () {
    eq(C.parseEnv('A=abc # note\n'), { A: 'abc' });
});

check('env 空值是空字符串', function () {
    eq(C.parseEnv('A=\n'), { A: '' });
});

check('env 坏行要报错', function () {
    eq(errCode(function () { C.parseEnv('no equals here\n'); }).code, 'env-bad-line');
});

check('env 序列化：带空格的值自动加引号', function () {
    has(C.serializeEnv({ A: 'a b' }), 'A="a b"');
});

check('env 序列化：换行转成 \\n', function () {
    has(C.serializeEnv({ A: 'a\nb' }), 'A="a\\nb"');
});

check('env 嵌套对象拍平成 dotted key', function () {
    const out = C.serializeEnv({ db: { host: 'h' } });
    has(out, 'db.host=h');
});

check('env 顶层非对象要报错', function () {
    eq(errCode(function () { C.serializeEnv(42); }).code, 'env-need-object');
});

console.log('\n=== CSV / TSV ===');

check('CSV 转义引号与换行', function () {
    const o = C.parseDelimited('a,b\n"x""y","line1\nline2"\n', ',');
    eq(o, [{ a: 'x"y', b: 'line1\nline2' }]);
});

check('CSV 值做类型推断（数字 / 布尔 / 前导零保持字符串）', function () {
    const o = C.parseDelimited('n,t,f,z\n1,true,false,007\n', ',');
    eq(o, [{ n: 1, t: true, f: false, z: '007' }]);
});

check('CSV 表头里的点还原成嵌套', function () {
    const o = C.parseDelimited('id,address.city\n1,Shanghai\n', ',');
    eq(o, [{ id: 1, address: { city: 'Shanghai' } }]);
});

check('CSV 表头里的 [n] 还原成数组', function () {
    const o = C.parseDelimited('tags[0],tags[1]\na,b\n', ',');
    eq(o, [{ tags: ['a', 'b'] }]);
});

check('JSON → CSV：嵌套拍平、列的并集按出现顺序', function () {
    const csv = C.serializeDelimited([
        { id: 1, address: { city: 'A' } },
        { id: 2, address: { city: 'B' }, extra: 'x' }
    ], ',');
    eq(csv, 'id,address.city,extra\n1,A,\n2,B,x\n');
});

check('JSON → CSV：单个对象也能转（一行）', function () {
    eq(C.serializeDelimited({ a: 1 }, ','), 'a\n1\n');
});

check('JSON → CSV：空数组不占列', function () {
    const csv = C.serializeDelimited([{ tags: [] }, { tags: ['a'] }], ',');
    eq(csv, 'tags[0]\n\na\n');
    lacks(csv, 'tags\n', '不该出现裸 tags 列');
});

check('JSON → CSV：非对象元素要报错', function () {
    eq(errCode(function () { C.serializeDelimited([1, 2], ','); }).code, 'csv-need-object');
});

check('CSV 未闭合的引号要报错', function () {
    eq(errCode(function () { C.parseDelimited('a,b\n"x,y\n', ','); }).code, 'csv-bad-quote');
});

check('TSV 用制表符分隔', function () {
    const tsv = C.serializeDelimited([{ a: 1, b: 2 }], '\t');
    eq(tsv, 'a\tb\n1\t2\n');
    eq(C.parseDelimited(tsv, '\t'), [{ a: 1, b: 2 }]);
});

check('CSV 往返：结构还原', function () {
    const src = [{ id: 1, name: 'Ada', ok: true, nested: { k: 'v' } }];
    eq(C.parseDelimited(C.serializeDelimited(src, ','), ','), src);
});

console.log('\n=== Query / Headers / Cookie ===');

check('Query 重复键变数组', function () {
    eq(C.parseQuery('a=1&a=2'), { a: ['1', '2'] });
});

check('Query 支持 ? 前缀与 URL 解码', function () {
    eq(C.parseQuery('http://x/y?name=ada%20b'), { name: 'ada b' });
});

check('Query 加号解码成空格', function () {
    eq(C.parseQuery('q=a+b'), { q: 'a b' });
});

check('Query 无等号视为空值', function () {
    eq(C.parseQuery('flag'), { flag: '' });
});

check('Query dotted key 展开', function () {
    eq(C.parseQuery('a.b=1'), { a: { b: '1' } });
});

check('Query 序列化：数组用重复键', function () {
    eq(C.serializeQuery({ a: ['1', '2'] }), 'a=1&a=2\n');
});

check('Query 序列化：URL 编码', function () {
    eq(C.serializeQuery({ q: 'a b&c' }), 'q=a%20b%26c\n');
});

check('Query 往返', function () {
    const src = { a: '1', b: 'x y', c: { d: '2' } };
    eq(C.parseQuery(C.serializeQuery(src)), src);
});

check('Query 顶层非对象要报错', function () {
    eq(errCode(function () { C.serializeQuery('x'); }).code, 'query-need-object');
});

check('Headers 跳过请求行 / 状态行', function () {
    const o = C.parseHeaders('GET /api HTTP/1.1\nHost: a.com\nHTTP/1.1 200 OK\nX: 1\n');
    eq(o, { Host: 'a.com', X: '1' });
});

check('Headers 重复头变数组', function () {
    eq(C.parseHeaders('Set-Cookie: a=1\nSet-Cookie: b=2\n')['Set-Cookie'], ['a=1', 'b=2']);
});

check('Headers 坏行要报错', function () {
    eq(errCode(function () { C.parseHeaders('not a header\n'); }).code, 'headers-bad-line');
});

check('Headers 序列化：数组出多行', function () {
    eq(C.serializeHeaders({ 'Set-Cookie': ['a=1', 'b=2'] }), 'Set-Cookie: a=1\nSet-Cookie: b=2\n');
});

check('Headers 往返', function () {
    const src = { Host: 'a.com', 'Content-Type': 'application/json' };
    eq(C.parseHeaders(C.serializeHeaders(src)), src);
});

check('Cookie 键值与裸标记', function () {
    eq(C.parseCookie('sid=abc; HttpOnly; Secure'), { sid: 'abc', HttpOnly: true, Secure: true });
});

check('Cookie URL 解码', function () {
    eq(C.parseCookie('v=a%20b').v, 'a b');
});

check('Cookie 序列化：true 只出键名', function () {
    eq(C.serializeCookie({ sid: 'abc', HttpOnly: true }), 'sid=abc; HttpOnly\n');
});

check('Cookie 顶层非对象要报错', function () {
    eq(errCode(function () { C.serializeCookie(1); }).code, 'cookie-need-object');
});

console.log('\n=== HTML table ===');

check('JSON → HTML：表头用列名、tbody 出数据', function () {
    const html = C.jsonToHtmlTable([{ id: 1, name: 'Ada' }]);
    has(html, '<th>id</th>');
    has(html, '<td>1</td>');
    has(html, '<tbody>');
});

check('JSON → HTML：值做 HTML 转义', function () {
    has(C.jsonToHtmlTable([{ s: '<a>&"b' }]), '&lt;a&gt;&amp;&quot;b');
});

check('HTML → JSON：读 th 当表头', function () {
    const o = C.htmlTableToJson('<table><tr><th>a</th><th>b</th></tr><tr><td>1</td><td>2</td></tr></table>');
    eq(o, [{ a: 1, b: 2 }]);
});

check('HTML → JSON：没有 th 时自动生成列名', function () {
    const o = C.htmlTableToJson('<table><tr><td>x</td><td>y</td></tr></table>');
    eq(o, [{ column1: 'x', column2: 'y' }]);
});

check('HTML → JSON：实体反转义', function () {
    eq(C.htmlTableToJson('<table><tr><th>a</th></tr><tr><td>&lt;b&gt;</td></tr></table>'), [{ a: '<b>' }]);
});

check('HTML 往返', function () {
    const src = [{ id: 1, nested: { k: 'v' } }];
    eq(C.htmlTableToJson(C.jsonToHtmlTable(src)), src);
});

check('HTML 非对象元素要报错', function () {
    eq(errCode(function () { C.jsonToHtmlTable([1]); }).code, 'html-need-object');
});

console.log('\n=== 通用 ===');

check('分发：parseData / serializeData 覆盖全部 9 种', function () {
    const obj = { a: 1, b: 'x' };
    C.FORMATS.forEach(function (f) {
        const text = C.serializeData(obj, f);
        ok(typeof text === 'string', f + ' 序列化失败');
        ok(text.length > 0, f + ' 输出为空');
    });
});

check('分发：未知格式要报错', function () {
    eq(errCode(function () { C.parseData('x', 'nope'); }).code, 'conf-unknown-format');
});

check('入口限流：超过 2 M 字符直接拦下', function () {
    const e = errCode(function () { C.parseData('a'.repeat(2 * 1024 * 1024 + 10), 'toml'); });
    eq(e.code, 'conf-too-large');
});

check('拍平：嵌套对象与数组', function () {
    eq(C.flattenObject({ a: { b: 1 }, c: [2, 3] }), { 'a.b': 1, 'c[0]': 2, 'c[1]': 3 });
});

check('还原：a.b[0] 回到嵌套结构', function () {
    eq(C.unflattenObject({ 'a.b[0]': 1 }), { a: { b: [1] } });
});

check('顶层数组也能转成以表为根的格式（CSV → TOML 这类）', function () {
    const csv = C.serializeDelimited([{ id: 1 }, { id: 2 }], ',');
    const arr = C.parseDelimited(csv, ',');
    ok(Array.isArray(arr), 'CSV 解析出数组');
    eq(C.parseToml(C.serializeToml(arr)).items, [{ id: 1 }, { id: 2 }]);
    has(C.serializeHeaders(arr), 'items');
});

check('任意源 → 任意目标都能跑通（矩阵抽查）', function () {
    const src = { name: 'demo', port: 8080, tags: ['a'], db: { host: 'h' } };
    ['json', 'toml', 'ini', 'env', 'csv', 'query', 'headers', 'html'].forEach(function (from) {
        const serialized = from === 'json' ? JSON.stringify(src) : C.serializeData(src, from);
        const parsed = from === 'json' ? JSON.parse(serialized) : C.parseData(serialized, from);
        ['yaml', 'toml', 'csv', 'html'].forEach(function (to) {
            if (to === 'yaml') return; // yaml 由 js-yaml 负责，这里不引第三方
            const out = C.serializeData(parsed, to);
            ok(typeof out === 'string' && out.length > 0, from + ' → ' + to);
        });
    });
});

console.log('\n' + (failed ? 'FAILED' : 'PASSED') + ': ' + passed + ' passed, ' + failed + ' failed');
if (failed) {
    failures.forEach(function (f) { console.error(' - ' + f); });
    process.exit(1);
}
