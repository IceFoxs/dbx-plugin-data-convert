/*
 * 结构化差异回归用例：node tests/objdiff.test.js
 */
'use strict';

var assert = require('assert');
var path = require('path');
var ROOT = path.resolve(__dirname, '..');

var O = require(path.join(ROOT, 'ui/js/objdiff.js'));

var passed = 0;
var failed = 0;

function test(name, fn) {
    try {
        fn();
        passed++;
        console.log('  ok   ' + name);
    } catch (err) {
        failed++;
        console.log('  FAIL ' + name);
        console.log('       ' + err.message);
    }
}

function pointers(result) {
    return result.changes.map(function (c) {
        return c.type + ' ' + c.pointer;
    });
}

console.log('\n== 结构化差异 diffObjects ==');

test('相同的树没有差异', function () {
    var a = { a: 1, b: [1, 2, { c: 'x' }] };
    var r = O.diffObjects(a, JSON.parse(JSON.stringify(a)));
    assert.deepStrictEqual(r.changes, []);
    assert.strictEqual(r.stats.total, 0);
});

test('标量变化带路径与新旧值', function () {
    var r = O.diffObjects({ products: [{ price: 4999 }] }, { products: [{ price: 5299 }] });
    assert.strictEqual(r.changes.length, 1);
    assert.strictEqual(r.changes[0].pointer, '/products/0/price');
    assert.strictEqual(r.changes[0].type, 'change');
    assert.strictEqual(r.changes[0].from, 4999);
    assert.strictEqual(r.changes[0].to, 5299);
    assert.deepStrictEqual(r.stats, { added: 0, removed: 0, changed: 1, total: 1 });
});

test('多字段修改逐个上报，不合并', function () {
    var a = { p: [{ price: 4999, inventory: 100, specs: { model: 'Mi 11', color: '黑色' } }] };
    var b = { p: [{ price: 5299, inventory: 85, specs: { model: 'Mi 11 Pro', color: '蓝色' } }] };
    var r = O.diffObjects(a, b);
    assert.deepStrictEqual(pointers(r), [
        'change /p/0/price',
        'change /p/0/inventory',
        'change /p/0/specs/model',
        'change /p/0/specs/color'
    ]);
    assert.strictEqual(r.stats.changed, 4);
});

test('新增与删除字段', function () {
    var r = O.diffObjects({ a: 1, b: 2 }, { a: 1, c: 3 });
    assert.deepStrictEqual(pointers(r).sort(), ['add /c', 'remove /b']);
    assert.deepStrictEqual(r.stats, { added: 1, removed: 1, changed: 0, total: 2 });
});

test('数组长度变化归为新增/删除', function () {
    var r = O.diffObjects({ list: [1, 2] }, { list: [1, 2, 3] });
    assert.deepStrictEqual(pointers(r), ['add /list/2']);
    var r2 = O.diffObjects({ list: [1, 2, 3] }, { list: [1] });
    assert.deepStrictEqual(pointers(r2), ['remove /list/1', 'remove /list/2']);
});

test('类型变化整体上报，不下钻', function () {
    var r = O.diffObjects({ a: { b: 1 } }, { a: [1] });
    assert.strictEqual(r.changes.length, 1);
    assert.strictEqual(r.changes[0].pointer, '/a');
    assert.strictEqual(r.changes[0].type, 'change');
});

test('null 与缺失字段区分开', function () {
    var r = O.diffObjects({ a: null }, { a: 0 });
    assert.strictEqual(r.changes.length, 1);
    assert.strictEqual(r.changes[0].type, 'change');
    var r2 = O.diffObjects({ a: null }, {});
    assert.strictEqual(r2.changes[0].type, 'remove');
    assert.strictEqual(r2.changes[0].from, null);
});

test('数字与字符串不算相同', function () {
    var r = O.diffObjects({ a: 1001 }, { a: '1001' });
    assert.strictEqual(r.changes.length, 1);
});

test('特殊字符键名按 JSON Pointer 转义', function () {
    var r = O.diffObjects({ 'a/b': 1, 'c~d': 2 }, { 'a/b': 9, 'c~d': 8 });
    assert.deepStrictEqual(pointers(r), ['change /a~1b', 'change /c~0d']);
});

test('顶层是数组也能比较', function () {
    var r = O.diffObjects([{ a: 1 }], [{ a: 2 }]);
    assert.deepStrictEqual(pointers(r), ['change /0/a']);
});

console.log('\n== serializeTracked 行号映射 ==');

test('输出与 JSON.stringify(...,2) 完全一致', function () {
    var cases = [
        { a: 1, b: { c: [1, 2] } },
        [],
        {},
        [1, [2, [3]]],
        { 'x y': [1, 2, 3], z: null },
        { s: '中文', n: -1.5, t: true, f: false },
        [[], {}, { a: [] }]
    ];
    cases.forEach(function (c) {
        assert.strictEqual(O.serializeTracked(c).text, JSON.stringify(c, null, 2));
    });
});

test('每个节点的行列与实际文本对得上', function () {
    var obj = {
        products: [
            { id: 'p001', price: 4999, specs: { model: 'Mi 11' } },
            { id: 'p002', price: 6999 }
        ],
        total: 2
    };
    var tracked = O.serializeTracked(obj);
    var lines = tracked.text.split('\n');
    var keys = Object.keys(tracked.map);

    assert.ok(keys.length >= 10, '应记录到所有节点，实际 ' + keys.length);
    keys.forEach(function (p) {
        var span = tracked.map[p];
        var lineText = lines[span.line];
        var slice = lineText.slice(span.col, span.endCol);
        if (slice === '') throw new Error('空片段: ' + p);
        // 片段必须能在该行里独立解析（对象/数组取首字符判断）
        var first = slice[0];
        if (first !== '{' && first !== '[') {
            var parsed;
            try {
                parsed = JSON.parse(slice);
            } catch (e) {
                throw new Error(p + ' 片段不可解析: ' + JSON.stringify(slice));
            }
            assert.notStrictEqual(parsed, undefined, p);
        }
    });

    var price = tracked.map['/products/0/price'];
    assert.strictEqual(lines[price.line].slice(price.col, price.endCol), '4999');
    var model = tracked.map['/products/0/specs/model'];
    assert.strictEqual(lines[model.line].slice(model.col, model.endCol), '"Mi 11"');
});

test('嵌套数组的下标路径可定位', function () {
    var obj = { m: [[1, 2], [3, 4]] };
    var t = O.serializeTracked(obj);
    var lines = t.text.split('\n');
    var span = t.map['/m/1/0'];
    assert.strictEqual(lines[span.line].slice(span.col, span.endCol), '3');
});

test('空对象/空数组有位置记录', function () {
    var t = O.serializeTracked({ a: [], b: {} });
    assert.strictEqual(t.text.split('\n')[t.map['/a'].line].slice(t.map['/a'].col, t.map['/a'].endCol), '[]');
    assert.strictEqual(t.text.split('\n')[t.map['/b'].line].slice(t.map['/b'].col, t.map['/b'].endCol), '{}');
});

console.log('\n== scanJson 原文定位 ==');

function sliceAt(text, span) {
    var lines = text.split('\n');
    return lines[span.line].slice(span.col, span.endCol);
}

test('缩进文本里每个值都能按行列取回', function () {
    var text = '{\n  "a": 1,\n  "b": [\n    "x",\n    {"c/d": true}\n  ]\n}';
    var map = O.scanJson(text).map;
    assert.strictEqual(sliceAt(text, map['/a']), '1');
    assert.strictEqual(sliceAt(text, map['/b/0']), '"x"');
    assert.strictEqual(sliceAt(text, map['/b/1']), '{');
    assert.strictEqual(sliceAt(text, map['/b/1/c~1d']), 'true');
    assert.strictEqual(map['/a'].line, 1);
    assert.strictEqual(map['/b/0'].line, 3);
});

test('压缩成一行也能精确定位', function () {
    var text = '{"x":{"y":[1,2]},"z":null}';
    var map = O.scanJson(text).map;
    assert.strictEqual(sliceAt(text, map['/x/y/0']), '1');
    assert.strictEqual(sliceAt(text, map['/x/y/1']), '2');
    assert.strictEqual(sliceAt(text, map['/z']), 'null');
    assert.strictEqual(map['/x/y/1'].line, 0);
});

test('字符串里的转义不破坏定位', function () {
    var text = '{\n  "k": "a\\"b\\\\c",\n  "n": 2\n}';
    var map = O.scanJson(text).map;
    assert.strictEqual(sliceAt(text, map['/k']), '"a\\"b\\\\c"');
    assert.strictEqual(map['/n'].line, 2);
});

test('中文与 emoji 的值整段可取回', function () {
    var text = '{\n  "name": "张三",\n  "icon": "🚀"\n}';
    var map = O.scanJson(text).map;
    assert.strictEqual(sliceAt(text, map['/name']), '"张三"');
    assert.strictEqual(sliceAt(text, map['/icon']), '"🚀"');
});

test('非法 JSON 抛错并给出行列', function () {
    assert.throws(function () {
        O.scanJson('{\n  "a": 1,\n}');
    }, /第 3 行/);
    assert.throws(function () {
        O.scanJson('{"a":1} trailing');
    });
});

test('空对象/空数组有定位', function () {
    var text = '{\n  "a": [],\n  "b": {}\n}';
    var map = O.scanJson(text).map;
    assert.strictEqual(sliceAt(text, map['/a']), '[');
    assert.strictEqual(sliceAt(text, map['/b']), '{');
});

console.log('\n== displayValue ==');
test('字符串不加引号，数字照原样', function () {
    assert.strictEqual(O.displayValue('256GB'), '256GB');
    assert.strictEqual(O.displayValue(5299), '5299');
    assert.strictEqual(O.displayValue(true), 'true');
    assert.strictEqual(O.displayValue(null), 'null');
});

test('对象折叠为一行并截断', function () {
    assert.strictEqual(O.displayValue({ a: 1 }), '{"a":1}');
    var long = { s: new Array(200).join('x') };
    assert.ok(O.displayValue(long).length <= 96);
});

console.log('\n==== ' + passed + ' passed, ' + failed + ' failed ====');
process.exit(failed ? 1 : 0);
