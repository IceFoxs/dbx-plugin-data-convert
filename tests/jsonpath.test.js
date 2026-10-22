/**
 * jsonpath.test.js — JSONPath + jq 子集查询引擎
 *
 * 纯 Node 运行：node tests/jsonpath.test.js
 * 重点覆盖三件事：① 两种方言的常见写法都能取到预期节点与路径；
 * ② 过滤器（比较 / 逻辑 / 正则）判定正确；③ 错误只回 code + pos，
 * 且大规模输入不会失控。
 */
'use strict';

const Q = require('../ui/js/jsonpath.js');

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

/** 取所有匹配值（丢掉路径，方便比较） */
function vals(data, expr) {
    return Q.query(data, expr).matches.map((m) => m.value);
}

/** 取所有匹配路径 */
function paths(data, expr) {
    return Q.query(data, expr).matches.map((m) => m.path);
}

function errCode(fn) {
    try {
        fn();
    } catch (e) {
        ok(typeof e.code === 'string' && e.code.length > 0, '错误缺 code: ' + e.message);
        return e;
    }
    throw new Error('本应抛错但没有');
}

const STORE = {
    store: {
        book: [
            { category: 'reference', author: 'Nigel Rees', title: 'Sayings', price: 8.95 },
            { category: 'fiction', author: 'Evelyn Waugh', title: 'Sword', price: 12.99, isbn: '0-553' },
            { category: 'fiction', author: 'Herman Melville', title: 'Moby Dick', price: 8.99, isbn: '0-553' }
        ],
        bicycle: { color: 'red', price: 19.95 }
    },
    expensive: 10
};

console.log('\n=== 基本取值 ===');

check('$ 返回根节点', function () {
    eq(vals(STORE, '$'), [STORE]);
    eq(paths(STORE, '$'), ['$']);
});

check('$.a.b 逐层下钻', function () {
    eq(vals(STORE, '$.store.bicycle.color'), ['red']);
    eq(paths(STORE, '$.store.bicycle.color'), ['$.store.bicycle.color']);
});

check('方括号记法与点记法等价', function () {
    eq(vals(STORE, "$['store']['bicycle']['color']"), ['red']);
    eq(paths(STORE, "$['store']['bicycle']['color']"), ['$.store.bicycle.color']);
});

check('数组下标（含负数）', function () {
    eq(vals(STORE, '$.store.book[0].author'), ['Nigel Rees']);
    eq(vals(STORE, '$.store.book[-1].title'), ['Moby Dick']);
    eq(vals(STORE, '$.store.book[-4].title'), []);
});

check('下标并集 [0,2]', function () {
    eq(vals(STORE, '$.store.book[0,2].title'), ['Sayings', 'Moby Dick']);
});

check('通配符 [*] / .*', function () {
    eq(vals(STORE, '$.store.book[*].author'), ['Nigel Rees', 'Evelyn Waugh', 'Herman Melville']);
    eq(vals(STORE, '$["store"].*.price'), [19.95]);
    eq(paths(STORE, '$.store.book[*].author'), [
        '$.store.book[0].author',
        '$.store.book[1].author',
        '$.store.book[2].author'
    ]);
});

console.log('\n=== 切片 ===');

check('[1:3] 含头不含尾', function () {
    eq(vals([1, 2, 3, 4, 5], '$[1:3]'), [2, 3]);
});

check('[:2] / [2:]', function () {
    eq(vals([1, 2, 3, 4, 5], '$[:2]'), [1, 2]);
    eq(vals([1, 2, 3, 4, 5], '$[2:]'), [3, 4, 5]);
});

check('[-2:] 取末尾', function () {
    eq(vals([1, 2, 3, 4, 5], '$[-2:]'), [4, 5]);
});

check('[::2] 步长', function () {
    eq(vals([1, 2, 3, 4, 5], '$[::2]'), [1, 3, 5]);
});

check('[::-1] 逆序', function () {
    eq(vals([1, 2, 3], '$[::-1]'), [3, 2, 1]);
});

check('切片下标越界不报错', function () {
    eq(vals([1, 2], '$[1:99]'), [2]);
});

console.log('\n=== 递归下降 ===');

check('$..price 取全部价格', function () {
    eq(vals(STORE, '$..price'), [8.95, 12.99, 8.99, 19.95]);
});

check('$..author 按文档序', function () {
    eq(vals(STORE, '$..author'), ['Nigel Rees', 'Evelyn Waugh', 'Herman Melville']);
});

check('$..* 取所有成员的值', function () {
    // 根的成员 a 的值 {b:1}，以及 a 的成员 b 的值 1
    eq(vals({ a: { b: 1 } }, '$..*'), [{ b: 1 }, 1]);
});

check('jq 风格 ..price', function () {
    eq(vals(STORE, '..price'), [8.95, 12.99, 8.99, 19.95]);
});

check('递归下降也能带通配符', function () {
    eq(vals(STORE, '$..book[*].isbn'), ['0-553', '0-553']);
});

console.log('\n=== 过滤器 ===');

check('数值比较', function () {
    eq(vals(STORE, '$.store.book[?(@.price < 10)].title'), ['Sayings', 'Moby Dick']);
});

check('字符串相等', function () {
    eq(vals(STORE, "$.store.book[?(@.category == 'fiction')].author"), ['Evelyn Waugh', 'Herman Melville']);
});

check('存在性判定', function () {
    eq(vals(STORE, '$.store.book[?(@.isbn)].title'), ['Sword', 'Moby Dick']);
});

check('!= 与逻辑与', function () {
    eq(vals(STORE, "$.store.book[?(@.category != 'fiction' && @.price > 5)].title"), ['Sayings']);
});

check('逻辑或', function () {
    eq(vals(STORE, "$.store.book[?(@.price > 12 || @.price < 9)].title"), ['Sayings', 'Sword', 'Moby Dick']);
});

check('取反', function () {
    eq(vals(STORE, "$.store.book[?(!(@.category == 'fiction'))].title"), ['Sayings']);
});

check('正则匹配 =~', function () {
    eq(vals(STORE, '$.store.book[?(@.author =~ /^Herman/)].title'), ['Moby Dick']);
});

check('正则字面量带 flags', function () {
    eq(vals(STORE, '$.store.book[?(@.title =~ /moby/i)].title'), ['Moby Dick']);
});

check('布尔字面量比较', function () {
    const data = { list: [{ on: true, id: 1 }, { on: false, id: 2 }] };
    eq(vals(data, '$.list[?(@.on == true)].id'), [1]);
});

check('过滤器可用 $ 指根', function () {
    eq(vals(STORE, '$.store.book[?(@.price > $.expensive)].title'), ['Sword']);
});

check('过滤器作用于对象的值集合', function () {
    const data = { a: { n: 1 }, b: { n: 9 } };
    eq(vals(data, '$[?(@.n > 5)]'), [{ n: 9 }]);
});

check('嵌套路径作为过滤条件', function () {
    const data = { list: [{ u: { age: 10 }, id: 1 }, { u: { age: 30 }, id: 2 }] };
    eq(vals(data, '$.list[?(@.u.age >= 18)].id'), [2]);
});

check('数字与字符串不跨类型比较', function () {
    const data = { list: [{ v: '10' }, { v: 10 }] };
    eq(vals(data, '$.list[?(@.v > 5)]'), [{ v: 10 }]);
});

console.log('\n=== jq 子集 ===');

check('.a.b', function () {
    eq(vals(STORE, '.store.bicycle.color'), ['red']);
});

check('.[] 迭代', function () {
    eq(vals(STORE, '.store.book[].author'), ['Nigel Rees', 'Evelyn Waugh', 'Herman Melville']);
});

check('管道 |', function () {
    const data = { items: [{ sku: 'A' }, { sku: 'B' }] };
    eq(vals(data, '.items[] | .sku'), ['A', 'B']);
});

check('管道后可接多段', function () {
    const data = { a: { b: [{ c: 1 }, { c: 2 }] } };
    eq(vals(data, '.a.b[] | .c'), [1, 2]);
});

check('jq 的 .foo? 可选', function () {
    eq(vals({ a: 1 }, '.missing?.x'), []);
});

check('jq union 逗号', function () {
    eq(vals({ a: 1, b: 2 }, '.a, .b'), [1, 2]);
});

check('以 . 开头的 style 判定为 jq', function () {
    eq(Q.query(STORE, '.store.bicycle').style, 'jq');
    eq(Q.query(STORE, '$.store').style, 'jsonpath');
});

console.log('\n=== 路径格式 ===');

check('需要引号的键用方括号记法', function () {
    const data = { 'a-b': { 'c d': 1 } };
    eq(paths(data, "$['a-b']"), ['$["a-b"]']);
});

check('数字键写成下标', function () {
    eq(paths({ '0': 'x' }, "$['0']"), ['$["0"]']);
});

console.log('\n=== 边界与错误 ===');

check('空表达式', function () {
    eq(errCode(() => Q.query({}, '')).code, 'query-empty');
    eq(errCode(() => Q.query({}, '   ')).code, 'query-empty');
});

check('不以 $ 或 . 开头', function () {
    eq(errCode(() => Q.query({}, 'store.book')).code, 'query-bad-start');
});

check('多余字符', function () {
    eq(errCode(() => Q.query({}, '$.a)')).code, 'query-bad-expr');
});

check('未闭合引号', function () {
    eq(errCode(() => Q.query({}, "$['abc")).code, 'query-unclosed');
});

check('非法正则', function () {
    eq(errCode(() => Q.query({}, '$.a[?(@.b =~ /([/)]')).code, 'query-bad-regex');
});

check('表达式过长被拦', function () {
    const e = errCode(() => Q.query({}, '$' + '.a'.repeat(2000)));
    eq(e.code, 'query-too-long');
});

check('check() 只报错不抛', function () {
    eq(Q.check('$.a'), { ok: true });
    eq(Q.check('$..').ok, false);
    ok(typeof Q.check('$..').code === 'string');
});

check('取不到的路径返回空数组而不是报错', function () {
    eq(vals(STORE, '$.nope.deep'), []);
    eq(vals(STORE, '$.store.book[9].title'), []);
    eq(vals('scalar', '$.a'), []);
});

check('过滤器缺字段视为不匹配', function () {
    eq(vals(STORE, '$.store.book[?(@.missing == 1)]'), []);
});

check('非数组/非对象上的通配符返回空', function () {
    eq(vals(STORE, '$.expensive[*]'), []);
});

console.log('\n=== 限流 ===');

check('结果条数封顶并标记截断', function () {
    const arr = [];
    for (let i = 0; i < 5000; i++) arr.push(i);
    const res = Q.query({ list: arr }, '$.list[*]');
    eq(res.count, Q.LIMITS.results);
    eq(res.truncated, true);
});

check('节点预算不会让大文档失控', function () {
    // 5 万条 × 2 字段，递归下降时节点数超过预算就停
    const list = [];
    for (let i = 0; i < 50000; i++) list.push({ id: i, tag: 'x' });
    const res = Q.query({ list: list }, '$..id');
    ok(res.count <= Q.LIMITS.results, '结果应在上限内');
    ok(res.truncated === true, '超预算应标记截断');
});

const total = passed + failed;
console.log('\n--- jsonpath: ' + passed + '/' + total + ' passed ---');
if (failed) {
    console.error('\n失败用例:');
    failures.forEach((f) => console.error('  - ' + f));
    process.exit(1);
}
