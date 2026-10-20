/*
 * Converter regression suite — no test framework, just `node tests/converters.test.js`.
 *
 * The vendored libs are browser builds, so we stage them on globalThis the same
 * way the plugin page does before requiring the converters module.
 */
'use strict';

var path = require('path');
var assert = require('assert');

var ROOT = path.join(__dirname, '..');

// js-yaml ships UMD, require it directly.
globalThis.jsyaml = require(path.join(ROOT, 'ui/js-yaml.min.js'));

// xml-js is a classic script that attaches to `window`.
globalThis.window = globalThis;
require(path.join(ROOT, 'ui/xml-js.min.js'));

var C = require(path.join(ROOT, 'ui/js/converters.js'));

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

var SAMPLE = {
    id: 1001,
    name: '测试数据',
    tags: ['admin', 'editor'],
    meta: { active: true, version: 1.2 }
};

console.log('\n[12 条两两互转]');
C.FORMATS.forEach(function (src) {
    C.FORMATS.forEach(function (tgt) {
        test(src + ' -> ' + tgt, function () {
            var source = C.serializeData(SAMPLE, src);
            var out = C.convert(source, src, tgt);
            assert.ok(typeof out === 'string' && out.length > 0, '输出为空');
            // output must be parseable by the target format
            assert.doesNotThrow(function () {
                C.parseData(out, tgt);
            }, '输出无法按 ' + tgt + ' 解析');
        });
    });
});

console.log('\n[json <-> yaml 保真]');
test('json -> yaml -> json 结构与类型不变', function () {
    var yamlText = C.convert(C.serializeData(SAMPLE, 'json'), 'json', 'yaml');
    var back = C.parseData(yamlText, 'yaml');
    assert.deepStrictEqual(back, SAMPLE);
});

test('yaml 容错：把 JSON 文本当 yaml 读', function () {
    var parsed = C.parseData('{"a": 1}', 'yaml');
    assert.deepStrictEqual(parsed, { a: 1 });
});

test('json 容错：把 YAML 文本当 json 读', function () {
    var parsed = C.parseData('a: 1\nb: 2', 'json');
    assert.deepStrictEqual(parsed, { a: 1, b: 2 });
});

console.log('\n[properties]');
test('json -> properties 使用 a.b / a[0] 路径', function () {
    var out = C.convert('{"a":{"b":"1"},"list":["x","y"]}', 'json', 'properties');
    assert.strictEqual(out, 'a.b=1\nlist[0]=x\nlist[1]=y');
});

test('properties -> json 还原嵌套与数组', function () {
    var obj = C.parseData('a.b=1\nlist[0]=x\nlist[1]=y\n# comment\n', 'properties');
    assert.deepStrictEqual(obj, { a: { b: '1' }, list: ['x', 'y'] });
});

test('properties 根级数字键不再丢失（回归）', function () {
    var obj = C.parseData('0=zero\nname=n', 'properties');
    assert.strictEqual(obj['0'], 'zero');
    assert.strictEqual(obj.name, 'n');
});

test('properties 忽略注释与空行', function () {
    assert.deepStrictEqual(C.parseData('\n# c\n! c2\n\nk=v\n', 'properties'), { k: 'v' });
});

test('properties 深层下标往返不增层（回归：0.0[0][0]…）', function () {
    var text = '0.0[0][0][0][0][0].metadata.isActive=true\n1.1[1][1][1][1][1].metadata.isActive=true';
    var obj = C.parseData(text, 'properties');
    // 点号后的数字是对象键，方括号才是数组：0.0 是两层对象，其后正好 5 层数组
    assert.strictEqual(Array.isArray(obj['0']), false, '0 应为对象');
    var node = obj['0']['0'];
    for (var i = 0; i < 5; i++) {
        assert.ok(Array.isArray(node), '第 ' + (i + 1) + ' 层应为数组');
        node = node[0];
    }
    assert.deepStrictEqual(node, { metadata: { isActive: 'true' } });
    assert.strictEqual(C.serializeData(obj, 'properties'), text, '往返后内容发生变化');
});

test('properties 下标与数字键互不混淆', function () {
    assert.deepStrictEqual(C.parseData('1.1=k', 'properties'), { 1: { 1: 'k' } });
    var arr = C.parseData('a[1]=k', 'properties').a;
    assert.ok(Array.isArray(arr), 'a 应为数组');
    assert.strictEqual(arr[1], 'k');
});

test('properties 混合路径往返幂等', function () {
    var text = 'list[0].name=x\nlist[0].age=1\nlist[1].name=y\nfoo.bar[2].baz=3';
    var once = C.serializeData(C.parseData(text, 'properties'), 'properties');
    var twice = C.serializeData(C.parseData(once, 'properties'), 'properties');
    assert.strictEqual(once, text);
    assert.strictEqual(twice, once);
});

console.log('\n[xml]');
test('xml -> xml 保留根元素（回归）', function () {
    var out = C.convert('<config><a>1</a><b>2</b></config>', 'xml', 'xml');
    assert.ok(out.indexOf('<config>') !== -1, '根元素丢失: ' + out);
    assert.ok(out.indexOf('<a>1</a>') !== -1);
});

test('xml -> json 解析嵌套与重复元素', function () {
    var obj = C.parseData('<root><item>a</item><item>b</item></root>', 'xml');
    assert.deepStrictEqual(obj, { item: ['a', 'b'] });
});

test('json -> xml 元素名与文本正确', function () {
    var out = C.convert('{"user":{"name":"张三"}}', 'json', 'xml');
    assert.ok(out.indexOf('<name>张三</name>') !== -1, '输出: ' + out);
});

test('非法 XML 抛错而不是静默返回空', function () {
    assert.throws(function () {
        C.parseData('<a><b></a>', 'xml');
    });
});

test('xml -> xml 非法输入也会抛错（不能被"格式化"掩盖）', function () {
    assert.throws(function () {
        C.convert('<a><b></a>', 'xml', 'xml');
    });
});

console.log('\n[同格式幂等与边界]');
test('同格式二次格式化结果稳定', function () {
    C.FORMATS.forEach(function (fmt) {
        var once = C.convert(C.serializeData(SAMPLE, fmt), fmt, fmt);
        var twice = C.convert(once, fmt, fmt);
        assert.strictEqual(twice, once, fmt + ' 不幂等');
    });
});

test('空输入返回空串', function () {
    assert.strictEqual(C.convert('   \n', 'json', 'yaml'), '');
});

test('BOM 前缀不影响解析', function () {
    assert.deepStrictEqual(C.parseData('\uFEFF{"a":1}', 'json'), { a: 1 });
});

test('JSON 输出恒为 2 空格缩进（「格式化」要真的换行）', function () {
    var obj = { a: 1, b: { c: [1, 2] } };
    var out = C.serializeData(obj, 'json');
    assert.strictEqual(out, JSON.stringify(obj, null, 2));
    assert.ok(out.indexOf('\n') !== -1, '短对象也必须换行: ' + JSON.stringify(out));
    assert.ok(out.indexOf('  "a": 1') !== -1, '缩进不是 2 空格: ' + JSON.stringify(out));
});

console.log('\n[错误定位]');
test('JSON position 映射到行列', function () {
    var text = '{\n  "a": 1\n  "b": 2\n}';
    try {
        C.parseData(text, 'json');
        throw new Error('应当抛错');
    } catch (err) {
        var loc = C.locateError(err, text);
        assert.strictEqual(loc.line, 3, '行号: ' + loc.line);
        assert.strictEqual(loc.column, 3, '列号: ' + loc.column);
    }
});

test('yaml mark 映射到行列', function () {
    var text = 'a: 1\nb: [1, 2\nc: 3';
    try {
        C.parseData(text, 'yaml');
        throw new Error('应当抛错');
    } catch (err) {
        var loc = C.locateError(err, text);
        assert.ok(loc.line >= 2, '行号: ' + loc.line);
    }
});

console.log('\n==== ' + results.pass + ' passed, ' + results.fail + ' failed ====');
process.exit(results.fail === 0 ? 0 : 1);
