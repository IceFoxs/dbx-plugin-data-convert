/*
 * 差异算法回归用例 — node tests/diff.test.js
 *
 * 重点守两件事：
 * 1. 每个 op 的 oldLine / newLine 必须真的指回原文对应行（行号错位的根因就是这里）；
 * 2. 中间段规模超限时能降级到贪心，不能卡死或爆内存。
 */
'use strict';

var path = require('path');
var assert = require('assert');

var D = require(path.join(__dirname, '..', 'ui/js/diff.js'));

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

// 校验 ops 与两侧原文完全自洽
function assertConsistent(oldText, newText, r) {
    var a = oldText.split('\n');
    var b = newText.split('\n');
    var lastOld = 0;
    var lastNew = 0;
    r.ops.forEach(function (op, idx) {
        if (op.type === 'same') {
            assert.strictEqual(a[op.oldLine - 1], op.text, '第 ' + idx + ' 步 oldLine 指向错误');
            assert.strictEqual(b[op.newLine - 1], op.text, '第 ' + idx + ' 步 newLine 指向错误');
            assert.ok(op.oldLine > lastOld && op.newLine > lastNew, 'same 行号未递增');
            lastOld = op.oldLine;
            lastNew = op.newLine;
        } else if (op.type === 'delete') {
            assert.strictEqual(a[op.oldLine - 1], op.text, '第 ' + idx + ' 步 delete 行号错误');
            assert.ok(op.oldLine > lastOld, 'delete 行号未递增');
            assert.strictEqual(op.newLine, null, 'delete 不应有 newLine');
            lastOld = op.oldLine;
        } else {
            assert.strictEqual(b[op.newLine - 1], op.text, '第 ' + idx + ' 步 insert 行号错误');
            assert.ok(op.newLine > lastNew, 'insert 行号未递增');
            assert.strictEqual(op.oldLine, null, 'insert 不应有 oldLine');
            lastNew = op.newLine;
        }
    });
}

console.log('\n[基础场景]');

test('完全相同', function () {
    var text = 'a\nb\nc';
    var r = D.diffLines(text, text);
    assert.strictEqual(r.stats.added, 0);
    assert.strictEqual(r.stats.removed, 0);
    assert.strictEqual(r.stats.unchanged, 3);
    assert.strictEqual(r.mode, 'lcs');
});

test('中间插入一行：行号对得上', function () {
    var a = 'a\nb\nc';
    var b = 'a\nx\nb\nc';
    var r = D.diffLines(a, b);
    assertConsistent(a, b, r);
    assert.strictEqual(r.stats.added, 1);
    assert.strictEqual(r.stats.removed, 0);
    var ins = r.ops.filter(function (o) { return o.type === 'insert'; })[0];
    assert.strictEqual(ins.text, 'x');
    assert.strictEqual(ins.newLine, 2);
});

test('中间删除一行：行号对得上', function () {
    var a = 'a\nb\nc\nd';
    var b = 'a\nc\nd';
    var r = D.diffLines(a, b);
    assertConsistent(a, b, r);
    assert.strictEqual(r.stats.removed, 1);
    assert.strictEqual(r.stats.added, 0);
    var del = r.ops.filter(function (o) { return o.type === 'delete'; })[0];
    assert.strictEqual(del.text, 'b');
    assert.strictEqual(del.oldLine, 2);
});

test('单行替换 = 1 删 1 增', function () {
    var a = 'a\nb\nc';
    var b = 'a\nB\nc';
    var r = D.diffLines(a, b);
    assertConsistent(a, b, r);
    assert.strictEqual(r.stats.removed, 1);
    assert.strictEqual(r.stats.added, 1);
});

test('首尾同时修改', function () {
    var a = 'a\nstay\nstay\nz';
    var b = 'A\nstay\nstay\nZ';
    var r = D.diffLines(a, b);
    assertConsistent(a, b, r);
    assert.strictEqual(r.stats.added, 2);
    assert.strictEqual(r.stats.removed, 2);
    assert.strictEqual(r.stats.unchanged, 2);
});

test('尾部换行差异算一行空行', function () {
    var r = D.diffLines('a\nb', 'a\nb\n');
    assertConsistent('a\nb', 'a\nb\n', r);
    assert.strictEqual(r.stats.added, 1);
});

test('空文本对空文本', function () {
    var r = D.diffLines('', '');
    assert.strictEqual(r.ops.length, 1);
    assert.strictEqual(r.ops[0].type, 'same');
});

test('空文本转有内容', function () {
    var r = D.diffLines('', 'a\nb');
    assertConsistent('', 'a\nb', r);
    assert.strictEqual(r.stats.added, 2);
});

console.log('\n[规模与降级]');

test('中间段超过 maxCells 时降级为贪心且结果自洽', function () {
    var a = ['a1', 'a2', 'a3', 'a4', 'a5'].join('\n');
    var b = ['a1', 'b2', 'b3', 'b4', 'a5'].join('\n');
    var r = D.diffLines(a, b, { maxCells: 4 });
    assert.strictEqual(r.mode, 'greedy');
    assertConsistent(a, b, r);
    assert.strictEqual(r.stats.removed, 3);
    assert.strictEqual(r.stats.added, 3);
});

test('公共前后缀被裁掉，只剩中间段进 DP', function () {
    var head = [];
    var tail = [];
    for (var i = 0; i < 400; i++) head.push('h' + i);
    for (var j = 0; j < 400; j++) tail.push('t' + j);
    var a = head.concat(['old1', 'old2']).concat(tail).join('\n');
    var b = head.concat(['new1', 'new2']).concat(tail).join('\n');
    var r = D.diffLines(a, b);
    assertConsistent(a, b, r);
    assert.strictEqual(r.mode, 'lcs');
    assert.strictEqual(r.stats.removed, 2);
    assert.strictEqual(r.stats.added, 2);
    assert.strictEqual(r.stats.unchanged, 800);
});

test('5000 行完全不同时走贪心且不卡死', function () {
    var a = [];
    var b = [];
    for (var i = 0; i < 5000; i++) {
        a.push('left-' + i + '-' + 'x'.repeat(40));
        b.push('right-' + i + '-' + 'y'.repeat(40));
    }
    var oldText = a.join('\n');
    var newText = b.join('\n');
    var started = Date.now();
    var r = D.diffLines(oldText, newText);
    var cost = Date.now() - started;
    assert.strictEqual(r.mode, 'greedy', '应降级为贪心');
    assert.ok(cost < 3000, '耗时过长: ' + cost + 'ms');
    assert.strictEqual(r.stats.removed, 5000);
    assert.strictEqual(r.stats.added, 5000);
    assertConsistent(oldText, newText, r);
});

console.log('\n[两侧行号映射]');

test('sides() 给出 0-based 行号，可直接喂 CodeMirror', function () {
    var a = 'a\nb\nc';
    var b = 'a\nB\nc';
    var s = D.sides(D.diffLines(a, b).ops);
    assert.deepStrictEqual(s.left.map(function (x) { return x.line; }), [0, 1, 2]);
    assert.deepStrictEqual(s.left.map(function (x) { return x.type; }), ['same', 'delete', 'same']);
    assert.deepStrictEqual(s.right.map(function (x) { return x.line; }), [0, 1, 2]);
    assert.deepStrictEqual(s.right.map(function (x) { return x.type; }), ['same', 'insert', 'same']);
});

test('插入造成的行号偏移不会影响后续标记', function () {
    var a = 'a\nb';
    var b = 'x\na\nb';
    var s = D.sides(D.diffLines(a, b).ops);
    // 左栏原样两行，没有删除
    assert.deepStrictEqual(s.left, [{ line: 0, type: 'same' }, { line: 1, type: 'same' }]);
    // 右栏新增在第 0 行
    assert.deepStrictEqual(s.right[0], { line: 0, type: 'insert' });
});

console.log('\n==== ' + results.pass + ' passed, ' + results.fail + ' failed ====');
process.exit(results.fail ? 1 : 0);
