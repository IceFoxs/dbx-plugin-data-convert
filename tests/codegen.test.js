/*
 * codegen 单元测试 —— JSON / SQL DDL → TypeScript / Go / Java / Python
 *
 * 和 converters.test.js 一样：纯函数、零 DOM，node 直接跑。
 *
 *   node tests/codegen.test.js
 */
'use strict';

var G = require('../ui/js/codegen.js');

var passed = 0;
var failed = 0;

function check(name, fn) {
    try {
        fn();
        passed++;
    } catch (e) {
        failed++;
        console.log('  FAIL ' + name + ' :: ' + e.message);
    }
}

function ok(cond, msg) {
    if (!cond) throw new Error(msg || '断言失败');
}

function has(code, needle, msg) {
    if (code.indexOf(needle) < 0) {
        throw new Error((msg || '缺少片段') + ' → ' + JSON.stringify(needle) + '\n---\n' + code);
    }
}

function lacks(code, needle, msg) {
    if (code.indexOf(needle) >= 0) {
        throw new Error((msg || '不该出现') + ' → ' + JSON.stringify(needle));
    }
}

var SAMPLE = {
    id: 1024,
    name: 'Ada',
    active: true,
    score: 98.5,
    remark: null,
    address: { city: 'Shanghai', zip: '200000' },
    tags: ['vip', 'beta'],
    orders: [
        { id: 1, total: 128.5, paid: true },
        { id: 2, total: 42, note: 'urgent' }
    ]
};

var DDL = 'CREATE TABLE `t_user` (\n' +
    '  `id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT \'用户 ID\',\n' +
    '  `user_name` varchar(64) NOT NULL COMMENT \'登录名\',\n' +
    '  `email` varchar(128) DEFAULT NULL,\n' +
    '  `age` tinyint(4) DEFAULT NULL,\n' +
    '  `enabled` tinyint(1) NOT NULL DEFAULT 1,\n' +
    '  `balance` decimal(12,2) NOT NULL DEFAULT 0.00,\n' +
    '  `created_at` datetime NOT NULL,\n' +
    '  PRIMARY KEY (`id`),\n' +
    '  KEY `idx_user_name` (`user_name`)\n' +
    ') ENGINE=InnoDB COMMENT=\'用户表\';';

console.log('\n== codegen ==');

// ---------- 1. 错误分支：失败要返回可翻译的 code，不抛异常 ----------
check('空输入返回 empty', function () {
    var r = G.generate('', { lang: 'ts' });
    ok(r.ok === false && r.code === 'empty', JSON.stringify(r));
});

check('空空白输入返回 empty', function () {
    var r = G.generate('   \n\t ', { lang: 'ts' });
    ok(r.ok === false && r.code === 'empty', JSON.stringify(r));
});

check('坏 JSON 返回 bad-json', function () {
    var r = G.generate('{oops', { lang: 'ts' });
    ok(r.ok === false && r.code === 'bad-json', JSON.stringify(r));
    ok(typeof r.detail === 'string' && r.detail.length > 0, '应带 detail 便于排查');
});

check('超过 1 M 字符返回 too-large', function () {
    var r = G.generate('x'.repeat(G.LIMITS.chars + 1), { lang: 'ts' });
    ok(r.ok === false && r.code === 'too-large', JSON.stringify(r));
});

check('DDL 源里没有 CREATE TABLE 返回 no-ddl', function () {
    var r = G.generate('select 1 from dual', { source: 'ddl', lang: 'ts' });
    ok(r.ok === false && r.code === 'no-ddl', JSON.stringify(r));
});

// ---------- 2. 语言集合 ----------
check('LANGS 是 ts / go / java / python', function () {
    ok(G.LANGS.join(',') === 'ts,go,java,python', G.LANGS.join(','));
});

check('四种语言都能从同一份 JSON 生成', function () {
    G.LANGS.forEach(function (lang) {
        var r = G.generate(JSON.stringify(SAMPLE), { lang: lang, rootName: 'User' });
        ok(r.ok, lang + ' 失败: ' + r.code);
        ok(r.code && r.code.length > 20, lang + ' 输出过短');
        ok(r.types >= 3, lang + ' 类型数是 ' + r.types + '，嵌套对象应被抽出');
        ok(r.lang === lang, lang + ' 回传的 lang 不对');
    });
});

check('未知语言回退到 ts 而不是崩溃', function () {
    var r = G.generate('{"a":1}', { lang: 'ruby' });
    ok(r.ok, JSON.stringify(r));
    has(r.code, 'interface', '未知语言应回退成 TypeScript');
});

// ---------- 3. TypeScript ----------
var TS = G.generate(JSON.stringify(SAMPLE), { lang: 'ts', rootName: 'User' }).code;

check('TS 根类型名来自 rootName', function () {
    has(TS, 'export interface User {');
});

check('TS 字段类型推断正确', function () {
    has(TS, 'id: number;');
    has(TS, 'name: string;');
    has(TS, 'active: boolean;');
    has(TS, 'score: number;');
});

check('TS 可空字段加 ?', function () {
    has(TS, 'remark?:');
});

check('TS 嵌套对象抽成独立 interface', function () {
    has(TS, 'export interface Address {');
    has(TS, 'address: Address;');
});

check('TS 对象数组抽成独立 interface 并用数组引用', function () {
    has(TS, 'export interface Order {');
    has(TS, 'orders: Order[];');
});

check('TS 字符串数组是 string[]', function () {
    has(TS, 'tags: string[];');
});

check('TS 依赖类型先于使用它的类型输出', function () {
    ok(TS.indexOf('interface UserOrdersItem') < TS.indexOf('interface User'),
        '子类型必须先定义');
});

check('TS 非法标识符会加引号', function () {
    var r = G.generate('{"user-name": 1, "2fa": true, "$ref": "x"}', { lang: 'ts' });
    ok(r.ok, r.code);
    has(r.code, '"user-name"', '连字符键必须加引号');
    has(r.code, '"2fa"', '数字开头必须加引号');
});

check('Java 保留字不会原样当字段名', function () {
    var r = G.generate('{"class": 1, "default": 2, "int": 3}', { lang: 'java' });
    ok(r.ok, r.code);
    lacks(r.code, 'private Long class;', 'class 是保留字');
    lacks(r.code, 'private Long int;', 'int 是保留字');
    has(r.code, 'class_');
});

// ---------- 4. Go ----------
var GO = G.generate(JSON.stringify(SAMPLE), { lang: 'go', rootName: 'User' }).code;

check('Go 输出 package 与 struct', function () {
    has(GO, 'package model');
    has(GO, 'type User struct {');
});

check('Go 字段导出首字母大写', function () {
    has(GO, 'ID ');
    has(GO, 'Name ');
});

check('Go 带 json tag', function () {
    has(GO, '`json:"id"`');
    has(GO, '`json:"paid,omitempty"`', '可选字段要有 omitempty');
});

check('Go 类型是 Go 原生类型', function () {
    has(GO, 'float64');
    has(GO, 'bool');
    lacks(GO, ': string;', '不能把 TS 语法带进 Go');
});

check('Go 嵌套结构体独立定义', function () {
    has(GO, 'type Address struct {');
    has(GO, '[]Order');
});

// ---------- 5. Java ----------
var JAVA = G.generate(JSON.stringify(SAMPLE), { lang: 'java', rootName: 'User' }).code;

check('Java 输出 public class', function () {
    has(JAVA, 'public class User {');
});

check('Java 用包装类型而不是基础类型', function () {
    has(JAVA, 'Long id;');
    has(JAVA, 'Boolean active;');
    has(JAVA, 'Double score;');
});

check('Java 是 private 字段并带 getter/setter', function () {
    has(JAVA, 'private String name;');
    has(JAVA, 'public String getName() {');
    has(JAVA, 'public void setName(String name) {');
});

check('Java 嵌套类独立定义', function () {
    has(JAVA, 'class Address {');
    has(JAVA, 'class Order {');
    has(JAVA, 'private List<Order> orders;');
});

check('Java 有 List 导入', function () {
    has(JAVA, 'import java.util.List;');
});

// ---------- 6. Python ----------
var PY = G.generate(JSON.stringify(SAMPLE), { lang: 'python', rootName: 'User' }).code;

check('Python 输出 dataclass', function () {
    has(PY, '@dataclass');
    has(PY, 'class User:');
});

check('Python 有 from __future__ 与 typing 导入', function () {
    has(PY, 'from __future__ import annotations');
    has(PY, 'from dataclasses import dataclass');
    has(PY, 'from typing import');
});

check('Python 字段名转 snake_case', function () {
    var r = G.generate('{"userName": 1, "createdAt": "x"}', { lang: 'python', rootName: 'User' });
    ok(r.ok, r.code);
    has(r.code, 'user_name: int');
    has(r.code, 'created_at: str');
});

check('Python 嵌套类独立定义', function () {
    has(PY, 'class Address:');
    has(PY, 'class Order:');
    has(PY, 'orders: List[Order]');
});

check('Python 可空用 Optional', function () {
    has(PY, 'Optional[');
});

// ---------- 7. DDL ----------
check('DDL 四语言都能出码', function () {
    G.LANGS.forEach(function (lang) {
        var r = G.generate(DDL, { source: 'ddl', lang: lang });
        ok(r.ok, lang + ' 失败: ' + r.code);
        ok(r.fields >= 7, lang + ' 字段数 ' + r.fields);
    });
});

var DDL_TS = G.generate(DDL, { source: 'ddl', lang: 'ts' }).code;

check('DDL 表名转 Pascal 根类型（去掉 t_ 前缀）', function () {
    has(DDL_TS, 'interface User {');
    has(DDL_TS, '/** 用户表 */', '表注释要带出来');
});

check('DDL 列名转小驼峰并保留注释', function () {
    has(DDL_TS, 'userName: string;');
    has(DDL_TS, '用户 ID');
});

check('DDL 数值类型映射正确', function () {
    has(DDL_TS, 'id: number;');
    has(DDL_TS, 'balance: number;'); // decimal → number
});

check('DDL 可空列加 ?', function () {
    has(DDL_TS, 'email?: string;');
    has(DDL_TS, 'age?: number;');
    lacks(DDL_TS, 'string | null', '`?` 已经表达可空，不该再挂 | null');
});

check('DDL 的 Go 输出用原始列名做 json tag', function () {
    var go = G.generate(DDL, { source: 'ddl', lang: 'go' }).code;
    has(go, 'package model');
    has(go, '`json:"user_name"`', 'tag 必须是原始列名而不是小驼峰');
    ok(/UserName\s+string/.test(go), '字段名仍要小驼峰转 Pascal：\n' + go);
    ok(/Email\s+\*string/.test(go), '可空列用指针：\n' + go);
});

check('DDL tinyint(1) 当布尔', function () {
    has(DDL_TS, 'enabled: boolean;');
});

check('DDL 时间类型当字符串', function () {
    has(DDL_TS, 'createdAt: string;');
});

check('DDL 的 PRIMARY KEY 被跳过', function () {
    lacks(DDL_TS, 'PRIMARY', '主键约束不该变成字段');
});

check('DDL 多条语句会出多个类型', function () {
    var two = DDL + '\nCREATE TABLE t_order (\n  `id` bigint NOT NULL,\n  `user_id` bigint NOT NULL,\n  PRIMARY KEY (`id`)\n);';
    var r = G.generate(two, { source: 'ddl', lang: 'ts' });
    ok(r.ok, r.code);
    has(r.code, 'interface User');
    has(r.code, 'interface Order');
    ok(r.types >= 2, '类型数 ' + r.types);
});

check('DDL 支持无反引号的 PostgreSQL 写法', function () {
    var pg = 'CREATE TABLE public.users (\n' +
        '  id serial PRIMARY KEY,\n' +
        '  full_name text NOT NULL,\n' +
        '  created_at timestamp NOT NULL\n' +
        ');';
    var r = G.generate(pg, { source: 'ddl', lang: 'ts' });
    ok(r.ok, r.code);
    has(r.code, 'fullName: string;');
    has(r.code, 'createdAt: string;');
});

check('DDL 支持双引号标识符', function () {
    var r = G.generate('CREATE TABLE "t_log" (\n  "id" bigint NOT NULL,\n  "msg" text\n);', { source: 'ddl', lang: 'ts' });
    ok(r.ok, r.code);
    has(r.code, 'interface Log');
    has(r.code, 'msg?: string;');
});

// ---------- 8. 边界与稳定性 ----------
check('顶层数组也能生成', function () {
    var r = G.generate(JSON.stringify([{ id: 1 }, { id: 2, name: 'b' }]), { lang: 'ts', rootName: 'Item' });
    ok(r.ok, r.code);
    has(r.code, 'interface Item');
    has(r.code, 'name?: string;'); // 两条合并后可空
});

check('空数组是 any[]', function () {
    var r = G.generate('{"list": []}', { lang: 'ts' });
    ok(r.ok, r.code);
    has(r.code, 'list: any[];');
});

check('混合类型数组降级成联合', function () {
    var r = G.generate('{"m": [1, "a"]}', { lang: 'ts' });
    ok(r.ok, r.code);
    ok(/m: \(number \| string\)\[\];/.test(r.code), r.code);
});

check('深层嵌套不会爆栈', function () {
    var deep = {};
    var cur = deep;
    for (var i = 0; i < 200; i++) { cur.nest = {}; cur = cur.nest; }
    cur.leaf = 1;
    var r = G.generate(JSON.stringify(deep), { lang: 'ts' });
    ok(r.ok, 'code=' + r.code);
});

check('大数组不会卡死（抽查而非全量）', function () {
    var arr = [];
    for (var i = 0; i < 5000; i++) arr.push({ id: i, name: 'n' + i });
    var t0 = Date.now();
    var r = G.generate(JSON.stringify(arr), { lang: 'ts' });
    ok(r.ok, r.code);
    ok(Date.now() - t0 < 3000, '耗时 ' + (Date.now() - t0) + ' ms');
});

check('rootName 为空时自动命名', function () {
    var r = G.generate('{"a":1}', { lang: 'ts', rootName: '' });
    ok(r.ok, r.code);
    ok(/interface \w+ \{/.test(r.code), r.code);
});

check('rootName 是脏字符串也不会产出非法代码', function () {
    ['my user', '123abc', 'a-b', '用户表', '!!!', '   '].forEach(function (raw) {
        var r = G.generate('{"a":1}', { lang: 'ts', rootName: raw });
        ok(r.ok, 'rootName=' + raw + ' → ' + r.code);
        ok(/interface [A-Za-z_$][A-Za-z0-9_$]* \{/.test(r.code),
            'rootName=' + raw + ' 产出了非法类型名:\n' + r.code);
    });
});

check('sanitizeTypeName 清洗非法标识符', function () {
    ok(G.sanitizeTypeName('my user') === 'MyUser', G.sanitizeTypeName('my user'));
    ok(G.sanitizeTypeName('123abc').charAt(0) !== '1', G.sanitizeTypeName('123abc'));
    ok(/^[A-Za-z_$]/.test(G.sanitizeTypeName('!!x')), G.sanitizeTypeName('!!x'));
});

check('循环引用不会导致无限递归（JSON 不可能有，防御性）', function () {
    var r = G.generate('{"a":{"b":{"c":[1,2,{"d":null}]}}}', { lang: 'go' });
    ok(r.ok, r.code);
});

check('Unicode 键与中文值不破坏输出', function () {
    var r = G.generate('{"用户名": "张三", "是否启用": true}', { lang: 'python' });
    ok(r.ok, r.code);
    ok(r.code.indexOf('class ') >= 0, r.code);
});

console.log(failed ? '\n==== ' + passed + ' passed, ' + failed + ' failed ====\n'
                   : '\n==== ' + passed + ' passed, 0 failed ====\n');
process.exit(failed ? 1 : 0);
