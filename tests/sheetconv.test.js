/*
 * sheetconv 单测：CSV / TSV 解析、表头、类型推断、截断、JSON 生成。
 *   node tests/sheetconv.test.js
 */
'use strict';

const assert = require('assert');
const S = require('../ui/js/sheetconv.js');

let passed = 0;
const failures = [];

function test(name, fn) {
    try {
        fn();
        passed++;
    } catch (err) {
        failures.push(name + ' → ' + err.message);
    }
}

test('基础 CSV：表头 + 数字推断', () => {
    const r = S.convert('姓名,年龄,城市\n张三,18,北京\n李四,22,上海', { hasHeader: true });
    assert.strictEqual(r.records.length, 2);
    assert.deepStrictEqual(r.columns, ['姓名', '年龄', '城市']);
    assert.deepStrictEqual(r.records[0], { 姓名: '张三', 年龄: 18, 城市: '北京' });
});

test('引号包裹：逗号 / 转义双引号 / 换行', () => {
    const rows = S.parse('a,"b,c","d""e"\n"多\n行",2,3').rows;
    assert.deepStrictEqual(rows[0], ['a', 'b,c', 'd"e']);
    assert.deepStrictEqual(rows[1], ['多\n行', '2', '3']);
});

test('CRLF + 尾部空行被吃掉', () => {
    const rows = S.parse('a,b\r\n1,2\r\n\r\n').rows;
    assert.strictEqual(rows.length, 2);
    assert.deepStrictEqual(rows[1], ['1', '2']);
});

test('BOM 不影响第一个表头', () => {
    const r = S.convert('\uFEFFname,age\ntom,3', {});
    assert.deepStrictEqual(r.columns, ['name', 'age']);
});

test('分隔符自动识别：Tab / 分号', () => {
    assert.strictEqual(S.detectDelimiter('a\tb\n1\t2'), '\t');
    assert.strictEqual(S.detectDelimiter('a;b;c\n1;2;3'), ';');
    assert.strictEqual(S.parse('a;b\n1;2', {}).rows[0][1], 'b');
});

test('单列数据也能解析', () => {
    const r = S.convert('value\nfoo\nbar', {});
    assert.deepStrictEqual(r.records.map((x) => x.value), ['foo', 'bar']);
});

test('无表头时用 column_N', () => {
    const r = S.convert('张三,18\n李四,22', { hasHeader: false });
    assert.deepStrictEqual(r.columns, ['column_1', 'column_2']);
    assert.deepStrictEqual(r.records[1], { column_1: '李四', column_2: 22 });
});

test('表头去空 / 去重', () => {
    const r = S.convert('a,,a\n1,2,3', {});
    assert.deepStrictEqual(r.columns, ['a', 'column_2', 'a_2']);
});

test('数字识别：前导零、超长数字保持字符串', () => {
    assert.strictEqual(S.isNumberLiteral('18'), true);
    assert.strictEqual(S.isNumberLiteral('-1.5e3'), true);
    assert.strictEqual(S.isNumberLiteral('007'), false);
    assert.strictEqual(S.isNumberLiteral('1234567890123456'), false);
    const r = S.convert('code,price\n007,12.5', {});
    assert.deepStrictEqual(r.records[0], { code: '007', price: 12.5 });
});

test('关掉数字 / 布尔识别后全部保持字符串', () => {
    const r = S.convert('a,b\n18,true', { numbers: false, booleans: false });
    assert.deepStrictEqual(r.records[0], { a: '18', b: 'true' });
    const on = S.convert('a,b\n18,TRUE', {});
    assert.deepStrictEqual(on.records[0], { a: 18, b: true });
});

test('空单元格保持空字符串', () => {
    const r = S.convert('a,b\n1,', {});
    assert.deepStrictEqual(r.records[0], { a: 1, b: '' });
});

test('短行自动补齐列', () => {
    const r = S.convert('a,b,c\n1\n2,3,4', {});
    assert.deepStrictEqual(r.records[0], { a: 1, b: '', c: '' });
});

test('超过行数上限时截断并标记', () => {
    const text = 'a\n' + Array.from({ length: 50 }, (_, i) => i).join('\n');
    const r = S.parse(text, { maxRows: 10 });
    assert.strictEqual(r.rows.length, 10);
    assert.strictEqual(r.truncated, true);
});

test('正好等于行数上限时不算截断', () => {
    const text = 'a\n' + Array.from({ length: 9 }, (_, i) => i).join('\n');
    const r = S.parse(text, { maxRows: 10 });
    assert.strictEqual(r.rows.length, 10);
    assert.strictEqual(r.truncated, false);
});

test('格式化：每个字段单独一行、缩进 2 格', () => {
    const json = S.toJsonText([{ a: 1, b: { c: 2 } }]);
    assert.strictEqual(json, '[\n  {\n    "a": 1,\n    "b": {\n      "c": 2\n    }\n  }\n]');
    assert.strictEqual(S.toJsonText([]), '[]');
    assert.deepStrictEqual(JSON.parse(json)[0], { a: 1, b: { c: 2 } });
});

test('紧凑格式：一条记录一行、不带缩进', () => {
    const json = S.toJsonText([{ a: 1 }, { a: 2 }], { pretty: false });
    assert.strictEqual(json, '[\n{"a":1},\n{"a":2}\n]');
    assert.strictEqual(S.toJsonText([]), '[]');
});

test('最多条数：只建前 N 条并标记 limited', () => {
    const rows = [['a'], ['1'], ['2'], ['3'], ['4']];
    const built = S.buildRecords(rows, { hasHeader: true, maxRecords: 2 });
    assert.strictEqual(built.records.length, 2);
    assert.strictEqual(built.available, 4);
    assert.strictEqual(built.limited, true);

    const all = S.buildRecords(rows, { hasHeader: true, maxRecords: 0 });
    assert.strictEqual(all.records.length, 4);
    assert.strictEqual(all.limited, false);
    assert.strictEqual(all.available, 4);
});

// 第二行是注释：只是「可能」，跳不跳由调用方决定
test('第二行为注释：skipNote 跳过说明行', () => {
    const rows = [['id', 'method'], ['编号', '请求方法'], ['1', 'GET'], ['2', 'POST']];
    const kept = S.buildRecords(rows, { hasHeader: true });
    assert.strictEqual(kept.records.length, 3);
    assert.strictEqual(kept.records[0].id, '编号');
    assert.strictEqual(kept.available, 3);

    const skipped = S.buildRecords(rows, { hasHeader: true, skipNote: true });
    assert.strictEqual(skipped.records.length, 2);
    assert.deepStrictEqual(skipped.records[0], { id: 1, method: 'GET' });
    assert.strictEqual(skipped.available, 2);
});

test('第二行为注释：无表头 / 只有两行时忽略该开关', () => {
    const noHeader = S.buildRecords([['编号'], ['1']], { hasHeader: false, skipNote: true });
    assert.strictEqual(noHeader.records.length, 2);
    const twoRows = S.buildRecords([['id'], ['1']], { hasHeader: true, skipNote: true });
    assert.strictEqual(twoRows.records.length, 1);
    assert.strictEqual(twoRows.available, 1);
});

test('suggestSkipNote：中英双表头给出建议', () => {
    const rows = [['id', 'method', 'path'], ['编号', '请求方法', '路径'], ['1', 'GET', '/a']];
    assert.strictEqual(S.suggestSkipNote(rows), true);
});

test('suggestSkipNote：正常数据表不乱给建议', () => {
    const rows = [['姓名', '年龄'], ['张三', '18'], ['李四', '22']];
    assert.strictEqual(S.suggestSkipNote(rows), false);
    const numeric = [['id', 'qty'], ['1', '10'], ['2', '20']];
    assert.strictEqual(S.suggestSkipNote(numeric), false);
    assert.strictEqual(S.suggestSkipNote([['a', 'b'], ['1', '2']]), false);
    // 英文表头 + 中文数据（第二行带数字）不能被当成说明行
    const mixed = [
        ['order_no', 'customer_name', 'amount', 'status'],
        ['SO202610001', '李四', '136.75', '已付款'],
        ['SO202610002', '王五', '174.00', '已发货']
    ];
    assert.strictEqual(S.suggestSkipNote(mixed), false);
});

test('SQL Insert：数字裸写、引号转义、布尔转 1/0', () => {
    const sql = S.toSqlInsertText([{ a: 1, b: "O'Brien", c: '', d: true }], { table: 'users' });
    assert.strictEqual(sql, "INSERT INTO users (a, b, c, d) VALUES\n(1, 'O''Brien', '', 1);\n");
});

test('SQL Insert：表名留空回退、反引号与分号被清掉', () => {
    const noTable = S.toSqlInsertText([{ a: 'x' }], {});
    assert.ok(noTable.indexOf('INSERT INTO your_table_name (a) VALUES') === 0, noTable);
    const cleaned = S.toSqlInsertText([{ a: 'x' }], { table: '`my;table`' });
    assert.ok(cleaned.indexOf('INSERT INTO mytable (a) VALUES') === 0, cleaned);
});

test('SQL Insert：每 500 条一条语句，避免超长', () => {
    const records = Array.from({ length: 501 }, (_, i) => ({ id: i }));
    const sql = S.toSqlInsertText(records, { table: 't' });
    assert.strictEqual(sql.split('INSERT INTO').length - 1, 2);
    assert.strictEqual(sql.split(';\n').length - 1, 2);
    assert.ok(sql.indexOf('(500)') !== -1, '最后一条应在第二条语句里');
});

test('SQL 紧凑：整句一行', () => {
    const sql = S.toSqlInsertText([{ a: 1 }, { a: 2 }], { table: 't', pretty: false });
    assert.strictEqual(sql, 'INSERT INTO t (a) VALUES (1),(2);\n');
});

test('SQL Insert：空记录返回空串', () => {
    assert.strictEqual(S.toSqlInsertText([]), '');
});

test('空输入返回空结果而不是抛错', () => {
    const r = S.convert('', {});
    assert.strictEqual(r.records.length, 0);
    assert.strictEqual(r.json, '[]');
});

(function asyncTests() {
    const jobs = [];

    jobs.push(S.toJsonTextAsync([{ a: 1 }, { b: 2 }]).then((json) => {
        assert.strictEqual(json, '[\n  {\n    "a": 1\n  },\n  {\n    "b": 2\n  }\n]');
    }).catch((err) => { failures.push('toJsonTextAsync → ' + err.message); }));

    jobs.push(S.toJsonTextAsync([{ a: 1 }, { b: 2 }], { pretty: false }).then((json) => {
        assert.strictEqual(json, '[\n{"a":1},\n{"b":2}\n]');
    }).catch((err) => { failures.push('toJsonTextAsync compact → ' + err.message); }));

    jobs.push(S.toSqlInsertTextAsync([{ a: 1 }, { a: 2 }], { table: 't' }).then((sql) => {
        assert.strictEqual(sql, 'INSERT INTO t (a) VALUES\n(1),\n(2);\n');
    }).catch((err) => { failures.push('toSqlInsertTextAsync → ' + err.message); }));

    jobs.push(S.convertAsync('a,b\n1,2', { hasHeader: true }).then((r) => {
        assert.strictEqual(r.json, '[\n  {\n    "a": 1,\n    "b": 2\n  }\n]');
    }).catch((err) => { failures.push('convertAsync → ' + err.message); }));

    jobs.push(S.convertAsync('a\n' + '1\n'.repeat(9000), {}, {
        isCancelled: () => true
    }).then((r) => {
        assert.strictEqual(r, null);
    }).catch((err) => { failures.push('convertAsync cancel → ' + err.message); }));

    Promise.all(jobs).then(() => {
        passed += jobs.length;
        if (failures.length) {
            console.error('✗ sheetconv: ' + failures.length + ' 项失败');
            failures.forEach((f) => console.error('  - ' + f));
            process.exit(1);
        }
        console.log('✓ sheetconv: ' + passed + ' 项通过');
    });
})();
