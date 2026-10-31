/*
 * SQL generator regression suite — no test framework, just `node tests/sqlgen.test.js`.
 * Covers the batch-text parsing (lines / commas / pasted IN(...) / quotes) and
 * every output template.
 */
'use strict';

var path = require('path');
var assert = require('assert');

var ROOT = path.join(__dirname, '..');
var S = require(path.join(ROOT, 'ui/js/sqlgen.js'));

var results = { pass: 0, fail: 0 };

function test(name, fn) {
    try {
        fn();
        results.pass++;
        console.log('  ok   ' + name);
    } catch (err) {
        results.fail++;
        console.log('  FAIL ' + name + '\n       ' + (err && err.message));
    }
}

console.log('\n[批量文本拆值]');
test('一行一个值', function () {
    assert.deepStrictEqual(S.parseValues('甲\n乙\n丙'), ['甲', '乙', '丙']);
});
test('CRLF 换行', function () {
    assert.deepStrictEqual(S.parseValues('a\r\nb\r\nc'), ['a', 'b', 'c']);
});
test('逗号 / 分号 / 制表符都算分隔', function () {
    assert.deepStrictEqual(S.parseValues('a, b; c\td'), ['a', 'b', 'c', 'd']);
});
test('空行和多余分隔符不产出空值', function () {
    assert.deepStrictEqual(S.parseValues('\n\na\n\n\nb\n\n'), ['a', 'b']);
    assert.deepStrictEqual(S.parseValues('a,,b, ,c'), ['a', 'b', 'c']);
});
test('首尾空白被去掉', function () {
    assert.deepStrictEqual(S.parseValues('  a  \n\tb\t'), ['a', 'b']);
});
test('粘贴 IN (...) 片段时只取值', function () {
    assert.deepStrictEqual(S.parseValues("WHERE id IN ('a', 'b', 'c')"), ['a', 'b', 'c']);
});
test('粘贴 NOT IN (...) 片段时只取值', function () {
    assert.deepStrictEqual(S.parseValues("status NOT IN (1, 2, 3)"), ['1', '2', '3']);
});
test('粘贴 VALUES 多行值只取值', function () {
    assert.deepStrictEqual(S.parseValues("INSERT INTO t (c) VALUES ('a'), ('b'), ('c');"), ['a', 'b', 'c']);
});
test('括号后面的 AND 子句不算值', function () {
    assert.deepStrictEqual(
        S.parseValues("WHERE code IN (\n'ORDER_LIST', 'ORDER_MONTH'\n) and service_name='iss-sts';"),
        ['ORDER_LIST', 'ORDER_MONTH']
    );
    assert.deepStrictEqual(S.parseValues("id IN ('a','b') AND x = 1"), ['a', 'b']);
    assert.deepStrictEqual(S.parseValues("id IN ('a','b') and service_name='iss-sts';"), ['a', 'b']);
});
test('VALUES 多组后面的 ON DUPLICATE / 分号不算值', function () {
    assert.deepStrictEqual(
        S.parseValues("INSERT INTO t (c) VALUES ('a'),('b') ON DUPLICATE KEY UPDATE c = 1;"),
        ['a', 'b']
    );
});
test('括号内的字符串里有括号也不影响收尾', function () {
    assert.deepStrictEqual(S.parseValues("id IN ('a(1)', 'b') AND flag = 1"), ['a(1)', 'b']);
});
test('括号没闭合时仍然尽力拆值', function () {
    assert.deepStrictEqual(S.parseValues("id IN ('a','b'"), ['a', 'b']);
});
test('只贴括号本身也按配对收尾', function () {
    assert.deepStrictEqual(S.parseValues("(\n'a',\n'b'\n) and service_name='iss-sts';"), ['a', 'b']);
    assert.deepStrictEqual(S.parseValues("('a'),('b')"), ['a', 'b']);
});
test('引号包裹的值去掉包裹引号', function () {
    assert.deepStrictEqual(S.parseValues("'abc'\n\"def\"\n`ghi`"), ['abc', 'def', 'ghi']);
});
test('引号内的逗号不被拆开', function () {
    assert.deepStrictEqual(S.parseValues("'a,b', 'c'"), ['a,b', 'c']);
});
test('成对引号转义还原为一个引号', function () {
    assert.deepStrictEqual(S.parseValues("'it''s'"), ["it's"]);
});
test('没加引号的撇号不被当成引号', function () {
    assert.deepStrictEqual(S.parseValues("O'Brien\nD'Angelo"), ["O'Brien", "D'Angelo"]);
});
test('显式空字符串保留为一个值', function () {
    assert.deepStrictEqual(S.parseValues("''\na"), ['', 'a']);
});
test('空输入返回空数组', function () {
    assert.deepStrictEqual(S.parseValues(''), []);
    assert.deepStrictEqual(S.parseValues('   \n\n '), []);
    assert.deepStrictEqual(S.parseValues(null), []);
});
test('一行里带空格的短语保持完整', function () {
    assert.deepStrictEqual(S.parseValues('New York\nLos Angeles'), ['New York', 'Los Angeles']);
});
test('顿号分隔的一列值', function () {
    assert.deepStrictEqual(
        S.parseValues('100000000000000001、100000000000000002、100000000000000003'),
        ['100000000000000001', '100000000000000002', '100000000000000003']
    );
});
test('顿号结尾 / 顿号后带空格都不产出空值', function () {
    assert.deepStrictEqual(S.parseValues('甲、乙、丙、'), ['甲', '乙', '丙']);
    assert.deepStrictEqual(S.parseValues('a、 b、\tc'), ['a', 'b', 'c']);
});
test('全角逗号 / 全角分号 / 竖线也算分隔', function () {
    assert.deepStrictEqual(S.parseValues('1，2；3'), ['1', '2', '3']);
    assert.deepStrictEqual(S.parseValues('a|b｜c'), ['a', 'b', 'c']);
});
test('中文标点混着半角一起用', function () {
    assert.deepStrictEqual(S.parseValues('a、b, c；d\ne'), ['a', 'b', 'c', 'd', 'e']);
});
test('拆完去掉首尾空白：不间断空格 / 全角空格都算', function () {
    assert.deepStrictEqual(S.parseValues(' a 、\u00a0b、\u3000c '), ['a', 'b', 'c']);
});
test('零宽字符不算值的一部分，去重也能合并', function () {
    assert.deepStrictEqual(S.parseValues('a\u200b、b\ufeff'), ['a', 'b']);
    var r = S.analyze('a\u200b、 a 、b');
    assert.strictEqual(r.count, 2);
    assert.strictEqual(r.duplicates, 1);
});
test('值中间的连续空白压成一个，但词间空格保留', function () {
    assert.deepStrictEqual(S.parseValues('  New   York \n Los Angeles '), ['New York', 'Los Angeles']);
});
test('引号里的顿号不被拆开', function () {
    assert.deepStrictEqual(S.parseValues("'甲、乙'、丙"), ['甲、乙', '丙']);
    assert.deepStrictEqual(S.parseValues("id IN ('甲、乙','丙')"), ['甲、乙', '丙']);
});
test('18 位 ID 一个字符都不丢', function () {
    var ids = ['100000000000000001', '900719925474099199'];
    assert.deepStrictEqual(S.parseValues(ids.join('、')), ids);
    assert.strictEqual(S.generateSql(ids, { template: 'list', multiline: false }), "'" + ids.join("', '") + "'");
    // 勾了「数字不加引号」也只是去掉引号，不做数字运算（超 Number.MAX_SAFE_INTEGER 也不丢精度）
    assert.strictEqual(S.generateSql(ids, { template: 'list', multiline: false, numeric: true }), ids.join(', '));
});

console.log('\n[去重]');
test('重复值只留第一次出现', function () {
    var r = S.uniqueValues(['a', 'b', 'a', 'c', 'b']);
    assert.deepStrictEqual(r.values, ['a', 'b', 'c']);
    assert.strictEqual(r.dropped, 2);
});
test('去重区分大小写', function () {
    assert.deepStrictEqual(S.uniqueValues(['a', 'A']).values, ['a', 'A']);
});

console.log('\n[引号与数字]');
test('默认单引号并转义单引号', function () {
    assert.strictEqual(S.quoteValue("it's", {}), "'it''s'");
});
test('双引号模式转义双引号', function () {
    assert.strictEqual(S.quoteValue('say "hi"', { quote: 'double' }), '"say ""hi"""');
});
test('反引号模式包裹标识符', function () {
    assert.strictEqual(S.quoteValue('user table', { quote: 'backtick' }), '`user table`');
});
test('不加引号模式原样输出', function () {
    assert.strictEqual(S.quoteValue("it's", { quote: 'none' }), "it's");
});
test('纯数字默认也加引号（ID 列多是 varchar）', function () {
    assert.strictEqual(S.quoteValue('123', {}), "'123'");
    assert.strictEqual(S.quoteValue('-1.5', {}), "'-1.5'");
    assert.strictEqual(S.quoteValue('1e3', {}), "'1e3'");
    assert.strictEqual(S.quoteValue('31010100003922409', {}), "'31010100003922409'");
});
test('勾选「数字不加引号」后数字才裸输出', function () {
    assert.strictEqual(S.quoteValue('123', { numeric: true }), '123');
    assert.strictEqual(S.quoteValue('-1.5', { numeric: true }), '-1.5');
    assert.strictEqual(S.quoteValue('1e3', { numeric: true }), '1e3');
});
test('数字识别不影响前导零等非数字形态', function () {
    assert.strictEqual(S.quoteValue('007', {}), "'007'");
    assert.strictEqual(S.quoteValue('0', { numeric: true }), '0');
    assert.strictEqual(S.quoteValue('0.5', { numeric: true }), '0.5');
    assert.strictEqual(S.quoteValue('1.2.3', { numeric: true }), "'1.2.3'");
});

console.log('\n[生成 SQL]');
test('IN 多行', function () {
    assert.strictEqual(
        S.generateSql(['a', 'b'], { template: 'in', multiline: true }),
        "IN (\n  'a',\n  'b'\n)"
    );
});
test('IN 单行', function () {
    assert.strictEqual(S.generateSql(['a', 'b'], { template: 'in', multiline: false }), "IN ('a', 'b')");
});
test('NOT IN 多行', function () {
    assert.strictEqual(
        S.generateSql(['1', '2'], { template: 'notin', multiline: true }),
        "NOT IN (\n  '1',\n  '2'\n)"
    );
    assert.strictEqual(
        S.generateSql(['1', '2'], { template: 'notin', multiline: true, numeric: true }),
        'NOT IN (\n  1,\n  2\n)'
    );
});
test('值列表模板不带 IN 包裹', function () {
    assert.strictEqual(S.generateSql(['a', 'b'], { template: 'list', multiline: false }), "'a', 'b'");
    assert.strictEqual(S.generateSql(['a', 'b'], { template: 'list', multiline: true }), "'a',\n'b'");
});
test('INSERT 多行带表名列名', function () {
    assert.strictEqual(
        S.generateSql(['a', 'b'], { template: 'insert', table: 'user', column: 'status' }),
        "INSERT INTO user (status) VALUES\n  ('a'),\n  ('b');"
    );
});
test('INSERT 没填列名时省略列表', function () {
    assert.strictEqual(
        S.generateSql(['a'], { template: 'insert', table: 'user', column: '' }),
        "INSERT INTO user VALUES\n  ('a');"
    );
});
test('INSERT 表名为空时用占位符', function () {
    assert.ok(S.generateSql(['a'], { template: 'insert' }).indexOf('INSERT INTO your_table VALUES') === 0);
});
test('生成时去重生效', function () {
    assert.strictEqual(S.generateSql(['a', 'a'], { template: 'list', multiline: false }), "'a'");
});
test('关掉去重后重复项保留', function () {
    assert.strictEqual(S.generateSql(['a', 'a'], { template: 'list', multiline: false, dedupe: false }), "'a', 'a'");
});
test('空值列表生成空串', function () {
    assert.strictEqual(S.generateSql([], { template: 'in' }), '');
});

console.log('\n[analyze 汇总]');
test('计数、去重数、SQL 一次给出', function () {
    var r = S.analyze("a\nb\na\n1");
    assert.strictEqual(r.count, 3);
    assert.strictEqual(r.duplicates, 1);
    assert.strictEqual(r.sql, "IN (\n  'a',\n  'b',\n  '1'\n)");
});
test('端到端：从 IN 片段生成 NOT IN 片段', function () {
    var r = S.analyze("WHERE id IN ('p-1', 'p-2', 'p-1')", { template: 'notin', multiline: false });
    assert.strictEqual(r.count, 2);
    assert.strictEqual(r.sql, "NOT IN ('p-1', 'p-2')");
});

console.log('\n==== ' + results.pass + ' passed, ' + results.fail + ' failed ====');
process.exit(results.fail === 0 ? 0 : 1);
