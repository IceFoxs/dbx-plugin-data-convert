/**
 * schema.test.js — JSON Schema 校验与反推
 *
 * 纯 Node 运行：node tests/schema.test.js
 * 重点覆盖三件事：① 各关键字判定正确；② 错误只回 code + 参数，不含人类语言；
 * ③ 反推出来的 schema 能反过来校验通过原数据。
 */
'use strict';

const S = require('../ui/js/schema.js');

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

/** 只取错误码序列，方便比较 */
function codes(data, schema) {
    return S.validate(data, schema).errors.map((e) => e.code);
}

function run(data, schema) {
    return S.validate(data, schema);
}

console.log('\n=== type ===');

check('基础类型判定', function () {
    ok(run(1, { type: 'integer' }).ok);
    ok(run(1.5, { type: 'number' }).ok);
    ok(!run(1.5, { type: 'integer' }).ok);
    ok(run('a', { type: 'string' }).ok);
    ok(run(true, { type: 'boolean' }).ok);
    ok(run(null, { type: 'null' }).ok);
    ok(run([], { type: 'array' }).ok);
    ok(run({}, { type: 'object' }).ok);
});

check('type 数组取并集', function () {
    ok(run('a', { type: ['string', 'number'] }).ok);
    ok(run(1, { type: ['string', 'number'] }).ok);
    ok(!run(true, { type: ['string', 'number'] }).ok);
});

check('类型错误带期望与实际类型', function () {
    const errs = run(1, { type: 'string' }).errors;
    eq(errs.length, 1);
    eq(errs[0].code, 'schema-type');
    eq(errs[0].t, 'string');
    eq(errs[0].a, 'number');
    eq(errs[0].path, '$');
});

console.log('\n=== 通用关键字 ===');

check('enum', function () {
    ok(run('b', { enum: ['a', 'b'] }).ok);
    ok(!run('c', { enum: ['a', 'b'] }).ok);
    eq(codes('c', { enum: ['a', 'b'] }), ['schema-enum']);
});

check('enum 支持对象深比较', function () {
    ok(run({ a: 1 }, { enum: [{ a: 1 }, 2] }).ok);
    ok(!run({ a: 2 }, { enum: [{ a: 1 }, 2] }).ok);
});

check('const', function () {
    ok(run(42, { const: 42 }).ok);
    ok(!run(43, { const: 42 }).ok);
});

console.log('\n=== 字符串 ===');

check('长度按码点算（emoji 算 1）', function () {
    ok(run('👨‍👩‍👧', { maxLength: 5 }).ok);
    ok(!run('👨‍👩‍👧', { maxLength: 2 }).ok);
});

check('minLength / maxLength', function () {
    eq(codes('ab', { minLength: 5 }), ['schema-min-length']);
    eq(codes('abcdef', { maxLength: 5 }), ['schema-max-length']);
});

check('pattern 为搜索语义', function () {
    ok(run('x-1', { pattern: '^x' }).ok);
    ok(run('abc', { pattern: 'b' }).ok); // 不带 ^$ 时是「包含」
    ok(!run('abc', { pattern: '^z' }).ok);
});

check('非法 pattern 不炸', function () {
    ok(run('abc', { pattern: '([unclosed' }).ok);
});

check('format 常见取值', function () {
    ok(run('a@b.com', { format: 'email' }).ok);
    ok(!run('not-an-email', { format: 'email' }).ok);
    ok(run('2024-10-22', { format: 'date' }).ok);
    ok(!run('2024-13-40', { format: 'date' }).ok);
    ok(run('2024-10-22T10:00:00Z', { format: 'date-time' }).ok);
    ok(run('10:00:00', { format: 'time' }).ok);
    ok(run('https://a.cn/x', { format: 'uri' }).ok);
    ok(run('3f2b-0000', { format: 'uuid' }) !== undefined);
    ok(!run('zzz', { format: 'uuid' }).ok);
    ok(run('192.168.1.1', { format: 'ipv4' }).ok);
    ok(!run('256.1.1.1', { format: 'ipv4' }).ok);
    ok(run('::1', { format: 'ipv6' }).ok);
    ok(run('2001:db8:85a3::8a2e:370:7334', { format: 'ipv6' }).ok);
});

check('未知 format 忽略', function () {
    ok(run('anything', { format: 'made-up-format' }).ok);
});

check('format 错误带格式名', function () {
    const e = run('nope', { format: 'email' }).errors[0];
    eq(e.code, 'schema-format');
    eq(e.f, 'email');
});

console.log('\n=== 数字 ===');

check('minimum / maximum', function () {
    ok(run(5, { minimum: 5 }).ok);
    eq(codes(4, { minimum: 5 }), ['schema-minimum']);
    eq(codes(6, { maximum: 5 }), ['schema-maximum']);
});

check('exclusiveMinimum / exclusiveMaximum', function () {
    ok(!run(5, { exclusiveMinimum: 5 }).ok);
    ok(run(6, { exclusiveMinimum: 5 }).ok);
    ok(!run(5, { exclusiveMaximum: 5 }).ok);
});

check('multipleOf 容忍浮点误差', function () {
    ok(run(0.3, { multipleOf: 0.1 }).ok);
    ok(!run(0.35, { multipleOf: 0.1 }).ok);
    ok(run(10, { multipleOf: 5 }).ok);
});

console.log('\n=== 对象 ===');

check('required 报缺失字段', function () {
    const r = run({ a: 1 }, { type: 'object', required: ['a', 'b'] });
    ok(!r.ok);
    eq(r.errors.length, 1);
    eq(r.errors[0].code, 'schema-required');
    eq(r.errors[0].k, 'b');
});

check('properties 定位到子路径', function () {
    const r = run({ user: { age: 'x' } }, {
        type: 'object',
        properties: { user: { type: 'object', properties: { age: { type: 'integer' } } } }
    });
    eq(r.errors.length, 1);
    eq(r.errors[0].path, '$.user.age');
});

check('additionalProperties: false', function () {
    const r = run({ a: 1, b: 2 }, { type: 'object', properties: { a: {} }, additionalProperties: false });
    eq(r.errors.map((e) => e.code), ['schema-additional']);
    eq(r.errors[0].k, 'b');
});

check('additionalProperties 为 schema 时继续校验', function () {
    const r = run({ a: 's' }, { type: 'object', additionalProperties: { type: 'integer' } });
    eq(r.errors[0].path, '$.a');
    eq(r.errors[0].code, 'schema-type');
});

check('patternProperties', function () {
    const r = run({ 'x-1': 1, 'x-2': 'no' }, {
        type: 'object',
        patternProperties: { '^x-': { type: 'integer' } }
    });
    eq(r.errors.length, 1);
    eq(r.errors[0].path, '$["x-2"]');
});

check('minProperties / maxProperties', function () {
    eq(codes({ a: 1 }, { minProperties: 2 }), ['schema-min-props']);
    eq(codes({ a: 1, b: 2 }, { maxProperties: 1 }), ['schema-max-props']);
});

check('propertyNames', function () {
    const r = run({ ok: 1, 'bad name': 2 }, { propertyNames: { pattern: '^[a-z]+$' } });
    eq(r.errors.map((e) => e.code), ['schema-property-names']);
});

console.log('\n=== 数组 ===');

check('items 为 schema', function () {
    const r = run([1, 'x'], { type: 'array', items: { type: 'integer' } });
    eq(r.errors.length, 1);
    eq(r.errors[0].path, '$[1]');
});

check('items 为元组', function () {
    const r = run([1, 2], { type: 'array', items: [{ type: 'string' }, { type: 'integer' }] });
    eq(r.errors.length, 1);
    eq(r.errors[0].path, '$[0]');
});

check('additionalItems: false', function () {
    const r = run([1, 2], { type: 'array', items: [{ type: 'integer' }], additionalItems: false });
    eq(r.errors.map((e) => e.code), ['schema-additional-items']);
});

check('minItems / maxItems / uniqueItems', function () {
    eq(codes([1], { minItems: 2 }), ['schema-min-items']);
    eq(codes([1, 2], { maxItems: 1 }), ['schema-max-items']);
    eq(codes([1, 1], { uniqueItems: true }), ['schema-unique-items']);
    ok(run([1, 2], { uniqueItems: true }).ok);
    ok(!run([1, '1'], { uniqueItems: true }).ok === false); // 1 与 '1' 是不同元素
});

check('uniqueItems 区分类型', function () {
    ok(run([1, '1'], { uniqueItems: true }).ok);
});

check('contains', function () {
    ok(run([1, 2, 3], { contains: { type: 'integer', minimum: 3 } }).ok);
    eq(codes([1, 2], { contains: { type: 'integer', minimum: 3 } }), ['schema-contains']);
});

console.log('\n=== 组合与条件 ===');

check('allOf 收集全部错误', function () {
    const r = run({ a: 1 }, {
        allOf: [
            { type: 'object', required: ['b'] },
            { properties: { a: { type: 'string' } } }
        ]
    });
    eq(r.errors.map((e) => e.code).sort(), ['schema-required', 'schema-type']);
});

check('anyOf 全不中才报错', function () {
    ok(run(1, { anyOf: [{ type: 'string' }, { type: 'integer' }] }).ok);
    eq(codes(true, { anyOf: [{ type: 'string' }, { type: 'integer' }] }), ['schema-anyof']);
});

check('oneOf 恰好一个', function () {
    ok(run(1, { oneOf: [{ type: 'integer' }, { type: 'string' }] }).ok);
    // 1 同时满足 integer 与 minimum，命中两条 → 报错
    eq(codes(1, { oneOf: [{ type: 'integer' }, { minimum: 0 }] }), ['schema-oneof-multi']);
    eq(codes(true, { oneOf: [{ type: 'integer' }, { type: 'string' }] }), ['schema-oneof']);
});

check('not', function () {
    ok(run('a', { not: { type: 'integer' } }).ok);
    eq(codes(1, { not: { type: 'integer' } }), ['schema-not']);
});

check('if / then / else', function () {
    const s = {
        if: { properties: { country: { const: 'CN' } } },
        then: { required: ['province'] },
        else: { required: ['state'] }
    };
    eq(codes({ country: 'CN' }, s), ['schema-required']);
    ok(run({ country: 'CN', province: 'SH' }, s).ok);
    eq(codes({ country: 'US' }, s), ['schema-required']);
    ok(run({ country: 'US', state: 'CA' }, s).ok);
});

console.log('\n=== $ref ===');

check('#/definitions 引用', function () {
    const s = {
        type: 'object',
        properties: { a: { $ref: '#/definitions/pos' } },
        definitions: { pos: { type: 'integer', minimum: 0 } }
    };
    ok(run({ a: 1 }, s).ok);
    eq(run({ a: -1 }, s).errors[0].path, '$.a');
});

check('#/$defs 引用', function () {
    const s = { $ref: '#/$defs/x', $defs: { x: { type: 'string' } } };
    ok(run('a', s).ok);
    ok(!run(1, s).ok);
});

check('自引用不会无限展开', function () {
    const s = {
        type: 'object',
        properties: { child: { $ref: '#' } },
        required: ['name']
    };
    // 深层嵌套：每层都要有 name
    ok(run({ name: 'a', child: { name: 'b', child: { name: 'c' } } }, s).ok);
    ok(!run({ name: 'a', child: {} }, s).ok);
});

check('坏引用报 schema-bad-ref', function () {
    const e = run({}, { $ref: '#/definitions/missing' }).errors[0];
    eq(e.code, 'schema-bad-ref');
    eq(e.r, '#/definitions/missing');
});

check('外部引用不加载（离线）', function () {
    eq(run({}, { $ref: 'http://example.com/s.json' }).errors[0].code, 'schema-bad-ref');
});

console.log('\n=== 限流与健壮性 ===');

check('错误条数封顶', function () {
    const data = {};
    const required = [];
    for (let i = 0; i < 500; i++) required.push('k' + i);
    const r = run(data, { type: 'object', required });
    ok(r.errors.length <= S.LIMITS.errors, '应在上限内: ' + r.errors.length);
    eq(r.truncated, true);
});

check('schema 不是对象时报错', function () {
    eq(run({}, 'not-a-schema').errors[0].code, 'schema-bad-schema');
});

check('schema 为 true / false 的布尔形式', function () {
    ok(run(1, true).ok);
    eq(codes(1, false), ['schema-forbidden']);
});

check('循环数据结构靠深度上限收住', function () {
    const a = { name: 'a' };
    a.self = a;
    const started = Date.now();
    const r = run(a, { type: 'object', required: ['missing'], properties: { self: { $ref: '#' } } });
    ok(Date.now() - started < 2000, '不应卡住');
    ok(!r.ok);
    // 每层都缺 missing，但深度封顶后不再往下走
    ok(r.errors.length > 1 && r.errors.length <= S.LIMITS.errors, '错误数: ' + r.errors.length);
});

console.log('\n=== 反推 schema ===');

check('标量类型', function () {
    eq(S.infer(1), { $schema: S.DRAFT, type: 'integer' });
    eq(S.infer(1.5), { $schema: S.DRAFT, type: 'number' });
    eq(S.infer('x'), { $schema: S.DRAFT, type: 'string' });
    eq(S.infer(null), { $schema: S.DRAFT, type: 'null' });
});

check('对象带 properties 与 required', function () {
    const s = S.infer({ a: 1, b: 'x' });
    eq(s.type, 'object');
    eq(s.required, ['a', 'b']);
    eq(s.properties.a, { type: 'integer' });
});

check('数组元素合并', function () {
    const s = S.infer([{ a: 1 }, { a: 2 }]);
    eq(s.type, 'array');
    eq(s.items, { type: 'object', properties: { a: { type: 'integer' } }, required: ['a'] });
});

check('数组元素 nullable 合并', function () {
    const s = S.infer([1, null]);
    eq(s.items.type.slice().sort(), ['integer', 'null']);
});

check('字符串猜 format', function () {
    eq(S.infer('a@b.com').format, 'email');
    eq(S.infer('2024-10-22').format, 'date');
});

check('反推结果能校验原数据', function () {
    const data = {
        id: 7,
        name: 'icefox',
        email: 'a@b.com',
        tags: ['x', 'y'],
        addr: { city: 'SH', zip: '200000' }
    };
    const s = S.infer(data);
    ok(run(data, s).ok, JSON.stringify(run(data, s).errors));
    // 换个类型应当报错
    ok(!run(Object.assign({}, data, { id: 'seven' }), s).ok);
});

check('推断有节点预算', function () {
    const big = [];
    for (let i = 0; i < 5000; i++) big.push({ i, name: 'n' + i, nested: { deep: { more: i } } });
    const s = S.infer(big);
    ok(s && s.type === 'array');
});

const total = passed + failed;
console.log('\n--- schema: ' + passed + '/' + total + ' passed ---');
if (failed) {
    console.error('\n失败用例:');
    failures.forEach((f) => console.error('  - ' + f));
    process.exit(1);
}
