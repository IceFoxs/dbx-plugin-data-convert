/*
 * JSON Schema validation + inference — pure functions, no DOM dependency.
 *
 * A hand-rolled draft-07 subset, because pulling in ajv would mean shipping a
 * second parser bundle into a plugin that has to stay offline and small. It
 * covers the keywords people actually write:
 *
 *   type / enum / const / format
 *   string : minLength maxLength pattern
 *   number : minimum maximum exclusiveMinimum exclusiveMaximum multipleOf
 *   object : required properties patternProperties additionalProperties
 *            propertyNames minProperties maxProperties
 *   array  : items(tuple or schema) additionalItems contains
 *            minItems maxItems uniqueItems
 *   logic  : allOf anyOf oneOf not  if/then/else
 *   ref    : $ref  (#, #/definitions/X, #/$defs/X, any local JSON pointer)
 *
 * Errors carry a `code` plus typed params ({k} name, {n} number, {t} type,
 * {v} value, {p} pattern, {f} format, {r} ref) — never a hard-coded language
 * string — so the UI can translate them in all 14 locales.
 *
 * Loaded as a classic script in the plugin (window.DBXSchema) and as CommonJS
 * in tests.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.DBXSchema = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var LIMITS = {
        errors: 200,      // 最多报多少条
        nodes: 200000,    // 校验时最多访问多少数据节点
        depth: 64,        // $ref / 嵌套深度
        inferNodes: 20000,// 推断时的节点预算
        inferDepth: 12
    };

    var DRAFT = 'http://json-schema.org/draft-07/schema#';

    function isPlainObject(v) {
        return v !== null && typeof v === 'object' && !Array.isArray(v);
    }

    function typeOf(v) {
        if (v === null) return 'null';
        if (Array.isArray(v)) return 'array';
        if (typeof v === 'number') return 'number';
        if (typeof v === 'boolean') return 'boolean';
        if (typeof v === 'string') return 'string';
        if (isPlainObject(v)) return 'object';
        return typeof v;
    }

    /** 深比较：够用即可（数组有序、对象键无序） */
    function deepEqual(a, b) {
        if (a === b) return true;
        var ta = typeOf(a);
        var tb = typeOf(b);
        if (ta !== tb) return false;
        if (ta === 'array') {
            if (a.length !== b.length) return false;
            for (var i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
            return true;
        }
        if (ta === 'object') {
            var ka = Object.keys(a);
            var kb = Object.keys(b);
            if (ka.length !== kb.length) return false;
            for (var k = 0; k < ka.length; k++) {
                if (!Object.prototype.hasOwnProperty.call(b, ka[k])) return false;
                if (!deepEqual(a[ka[k]], b[ka[k]])) return false;
            }
            return true;
        }
        return false;
    }

    /** 数组元素去重用的指纹：类型前缀 + 序列化，避免 1 与 '1' 撞车 */
    function fingerprint(v) {
        return typeOf(v) + ':' + JSON.stringify(v);
    }

    /* ==================================================================== *
     * format 校验
     * ==================================================================== */

    var EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
    var URI_RE = /^[A-Za-z][A-Za-z0-9+.-]*:(\/?\/)?[^\s]*$/;
    var DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
    var TIME_RE = /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d+)?(Z|[+-]([01]\d|2[0-3]):?[0-5]\d)?$/;
    var DATETIME_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])[Tt ]([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d+)?(Z|[+-]([01]\d|2[0-3]):?[0-5]\d)?$/;
    var UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    var HOSTNAME_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/;
    var IPV4_RE = /^((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;

    function validIpv6(v) {
        // 只做结构检查：8 组十六进制，允许一组 :: 压缩
        if (v.indexOf('::') !== v.lastIndexOf('::')) return false;
        var head = v;
        var tail = '';
        var at = v.indexOf('::');
        var groups = [];
        if (at >= 0) {
            head = v.slice(0, at);
            tail = v.slice(at + 2);
        }
        var parts = (head ? head.split(':') : []).concat(tail ? tail.split(':') : []);
        for (var i = 0; i < parts.length; i++) {
            if (!/^[0-9a-fA-F]{1,4}$/.test(parts[i])) return false;
            groups.push(parts[i]);
        }
        if (at >= 0) return groups.length <= 7 || (head === '' && tail === '');
        return groups.length === 8;
    }

    var FORMATS = {
        email: function (v) { return EMAIL_RE.test(v); },
        'idn-email': function (v) { return EMAIL_RE.test(v); },
        uri: function (v) { return URI_RE.test(v); },
        'uri-reference': function (v) { return /^[^\s]*$/.test(v) && v.indexOf('\\') < 0; },
        url: function (v) { return URI_RE.test(v); },
        date: function (v) { return DATE_RE.test(v); },
        time: function (v) { return TIME_RE.test(v); },
        'date-time': function (v) { return DATETIME_RE.test(v); },
        uuid: function (v) { return UUID_RE.test(v); },
        hostname: function (v) { return HOSTNAME_RE.test(v) && v.length <= 253; },
        ipv4: function (v) { return IPV4_RE.test(v); },
        ipv6: validIpv6,
        regex: function (v) {
            try { new RegExp(v); return true; } catch (e) { return false; }
        }
    };

    var FORMAT_NAMES = Object.keys(FORMATS);

    /* ==================================================================== *
     * 校验器
     * ==================================================================== */

    function Validator(schema, rootSchema) {
        this.root = rootSchema || schema;
        this.errors = [];
        this.nodes = 0;
        this.truncated = false;
        this.refStack = [];
    }

    Validator.prototype.add = function (path, code, params) {
        if (this.errors.length >= LIMITS.errors) {
            this.truncated = true;
            return;
        }
        this.errors.push(Object.assign({ path: path, code: code }, params || {}));
    };

    Validator.prototype.budget = function () {
        this.nodes++;
        return this.nodes <= LIMITS.nodes;
    };

    /** 解析一个 $ref（只支持本文档内的 JSON pointer） */
    Validator.prototype.resolve = function (ref) {
        if (typeof ref !== 'string') return null;
        if (ref.indexOf('#') !== 0) return null; // 外部引用不加载（离线插件）
        var pointer = ref.slice(1);
        if (pointer === '' || pointer === '/') return this.root;
        var parts = pointer.split('/').slice(1);
        var cur = this.root;
        for (var i = 0; i < parts.length; i++) {
            var key = parts[i].replace(/~1/g, '/').replace(/~0/g, '~');
            if (Array.isArray(cur)) {
                var idx = parseInt(key, 10);
                if (isNaN(idx) || idx < 0 || idx >= cur.length) return null;
                cur = cur[idx];
            } else if (isPlainObject(cur)) {
                if (!Object.prototype.hasOwnProperty.call(cur, key)) return null;
                cur = cur[key];
            } else {
                return null;
            }
        }
        return cur;
    };

    Validator.prototype.check = function (data, schema, path, depth) {
        if (depth > LIMITS.depth) return;
        if (!this.budget()) { this.truncated = true; return; }
        if (schema === true || schema === undefined) return;
        if (schema === false) {
            this.add(path, 'schema-forbidden');
            return;
        }
        if (!isPlainObject(schema)) {
            this.add(path, 'schema-bad-schema');
            return;
        }

        if (Object.prototype.hasOwnProperty.call(schema, '$ref')) {
            var ref = schema.$ref;
            // 同一个 ref 在同一条解析链上重复出现 = 递归结构，直接放行，
            // 否则 `{a:{$ref:'#'}}` 这类自引用会无限展开
            if (this.refStack.indexOf(ref) >= 0) return;
            var target = this.resolve(ref);
            if (target === null || target === undefined) {
                this.add(path, 'schema-bad-ref', { r: String(ref) });
                return;
            }
            this.refStack.push(ref);
            this.check(data, target, path, depth + 1);
            this.refStack.pop();
            return;
        }

        if (!this.checkType(data, schema, path)) return; // 类型不对就没必要再验其它

        if (has(schema, 'enum')) {
            if (!inEnum(data, schema.enum)) this.add(path, 'schema-enum', { n: String(schema.enum.length) });
        }
        if (has(schema, 'const')) {
            if (!deepEqual(data, schema.const)) this.add(path, 'schema-const');
        }

        var t = typeOf(data);
        if (t === 'string') this.checkString(data, schema, path);
        else if (t === 'number') this.checkNumber(data, schema, path);
        else if (t === 'object') this.checkObject(data, schema, path, depth);
        else if (t === 'array') this.checkArray(data, schema, path, depth);

        this.checkLogic(data, schema, path, depth);
        this.checkCondition(data, schema, path, depth);
    };

    function has(schema, key) {
        return Object.prototype.hasOwnProperty.call(schema, key);
    }

    function inEnum(value, list) {
        if (!Array.isArray(list)) return false;
        for (var i = 0; i < list.length; i++) {
            if (deepEqual(value, list[i])) return true;
        }
        return false;
    }

    Validator.prototype.checkType = function (data, schema, path) {
        if (!has(schema, 'type')) return true;
        var want = schema.type;
        var list = Array.isArray(want) ? want : [want];
        var actual = typeOf(data);
        for (var i = 0; i < list.length; i++) {
            if (matchesType(actual, data, list[i])) return true;
        }
        this.add(path, 'schema-type', { t: list.join(' / '), a: actual });
        return false;
    };

    function matchesType(actual, data, want) {
        if (want === actual) return true;
        // integer 是 number 的子集：1 对 integer 合法，1.5 不合法
        if (want === 'integer') return actual === 'number' && data % 1 === 0;
        if (want === 'number') return actual === 'number';
        return false;
    }

    Validator.prototype.checkString = function (data, schema, path) {
        var len = Array.from(data).length; // 按码点算，emoji 不占两个
        if (has(schema, 'minLength') && typeof schema.minLength === 'number' && len < schema.minLength) {
            this.add(path, 'schema-min-length', { n: String(schema.minLength) });
        }
        if (has(schema, 'maxLength') && typeof schema.maxLength === 'number' && len > schema.maxLength) {
            this.add(path, 'schema-max-length', { n: String(schema.maxLength) });
        }
        if (has(schema, 'pattern')) {
            var re = compilePattern(schema.pattern);
            if (re) {
                // 用户正则可能不带 ^$，按 draft-07 语义是「搜索」而非「全匹配」
                if (!re.test(data)) this.add(path, 'schema-pattern', { p: String(schema.pattern) });
            }
        }
        if (has(schema, 'format')) {
            var fn = FORMATS[schema.format];
            if (fn && !fn(data)) this.add(path, 'schema-format', { f: String(schema.format) });
        }
    };

    var patternCache = Object.create(null);

    function compilePattern(p) {
        if (typeof p !== 'string') return null;
        if (patternCache[p] === undefined) {
            try {
                patternCache[p] = new RegExp(p, 'u');
            } catch (e) {
                try {
                    patternCache[p] = new RegExp(p);
                } catch (e2) {
                    patternCache[p] = null; // 非法正则就当没有这条约束
                }
            }
        }
        return patternCache[p];
    }

    Validator.prototype.checkNumber = function (data, schema, path) {
        if (has(schema, 'minimum') && typeof schema.minimum === 'number' && data < schema.minimum) {
            this.add(path, 'schema-minimum', { n: String(schema.minimum) });
        }
        if (has(schema, 'maximum') && typeof schema.maximum === 'number' && data > schema.maximum) {
            this.add(path, 'schema-maximum', { n: String(schema.maximum) });
        }
        if (has(schema, 'exclusiveMinimum') && typeof schema.exclusiveMinimum === 'number' && data <= schema.exclusiveMinimum) {
            this.add(path, 'schema-ex-minimum', { n: String(schema.exclusiveMinimum) });
        }
        if (has(schema, 'exclusiveMaximum') && typeof schema.exclusiveMaximum === 'number' && data >= schema.exclusiveMaximum) {
            this.add(path, 'schema-ex-maximum', { n: String(schema.exclusiveMaximum) });
        }
        if (has(schema, 'multipleOf') && typeof schema.multipleOf === 'number' && schema.multipleOf > 0) {
            // 浮点不能直接取模：先算倍数再看离整数多远
            var ratio = data / schema.multipleOf;
            if (Math.abs(ratio - Math.round(ratio)) > 1e-9) {
                this.add(path, 'schema-multiple-of', { n: String(schema.multipleOf) });
            }
        }
    };

    Validator.prototype.checkObject = function (data, schema, path, depth) {
        var keys = Object.keys(data);
        var i, k;

        if (has(schema, 'required') && Array.isArray(schema.required)) {
            for (i = 0; i < schema.required.length; i++) {
                k = schema.required[i];
                if (!Object.prototype.hasOwnProperty.call(data, k)) {
                    this.add(path, 'schema-required', { k: String(k) });
                }
            }
        }

        if (has(schema, 'minProperties') && keys.length < schema.minProperties) {
            this.add(path, 'schema-min-props', { n: String(schema.minProperties) });
        }
        if (has(schema, 'maxProperties') && keys.length > schema.maxProperties) {
            this.add(path, 'schema-max-props', { n: String(schema.maxProperties) });
        }

        var props = has(schema, 'properties') && isPlainObject(schema.properties) ? schema.properties : null;
        var patternProps = has(schema, 'patternProperties') && isPlainObject(schema.patternProperties) ? schema.patternProperties : null;
        var additional = schema.additionalProperties;
        var patternKeys = patternProps ? Object.keys(patternProps) : [];

        for (i = 0; i < keys.length; i++) {
            k = keys[i];
            var childPath = joinPath(path, k);
            var matched = false;
            if (props && Object.prototype.hasOwnProperty.call(props, k)) {
                matched = true;
                this.check(data[k], props[k], childPath, depth + 1);
            }
            for (var p = 0; p < patternKeys.length; p++) {
                var pre = compilePattern(patternKeys[p]);
                if (pre && pre.test(k)) {
                    matched = true;
                    this.check(data[k], patternProps[patternKeys[p]], childPath, depth + 1);
                }
            }
            if (!matched && additional !== undefined && additional !== true) {
                if (additional === false) this.add(path, 'schema-additional', { k: k });
                else this.check(data[k], additional, childPath, depth + 1);
            }
        }

        if (has(schema, 'propertyNames') && isPlainObject(schema.propertyNames)) {
            for (i = 0; i < keys.length; i++) {
                var sub = new Validator(schema.propertyNames, this.root);
                sub.check(keys[i], schema.propertyNames, path, depth + 1);
                // propertyNames 只关心键本身，单独跑一次，失败时归到父路径
                if (sub.errors.length) this.add(path, 'schema-property-names', { k: keys[i] });
            }
        }
    };

    Validator.prototype.checkArray = function (data, schema, path, depth) {
        var i;
        if (has(schema, 'minItems') && data.length < schema.minItems) {
            this.add(path, 'schema-min-items', { n: String(schema.minItems) });
        }
        if (has(schema, 'maxItems') && data.length > schema.maxItems) {
            this.add(path, 'schema-max-items', { n: String(schema.maxItems) });
        }
        if (schema.uniqueItems === true) {
            var seen = Object.create(null);
            for (i = 0; i < data.length; i++) {
                var fp = fingerprint(data[i]);
                if (seen[fp]) {
                    this.add(path, 'schema-unique-items', { n: String(i) });
                    break;
                }
                seen[fp] = true;
            }
        }

        var items = schema.items;
        if (Array.isArray(items)) {
            // 元组：前 n 项逐个对应，多出来的交给 additionalItems
            for (i = 0; i < data.length; i++) {
                var childPath = path + '[' + i + ']';
                if (i < items.length) this.check(data[i], items[i], childPath, depth + 1);
                else if (has(schema, 'additionalItems') && schema.additionalItems !== true) {
                    if (schema.additionalItems === false) this.add(path, 'schema-additional-items', { n: String(i) });
                    else this.check(data[i], schema.additionalItems, childPath, depth + 1);
                }
            }
        } else if (isPlainObject(items)) {
            for (i = 0; i < data.length; i++) {
                this.check(data[i], items, path + '[' + i + ']', depth + 1);
            }
        }

        if (has(schema, 'contains') && isPlainObject(schema.contains)) {
            var hit = false;
            for (i = 0; i < data.length; i++) {
                var sub = new Validator(schema.contains, this.root);
                sub.check(data[i], schema.contains, path, depth + 1);
                if (!sub.errors.length) { hit = true; break; }
            }
            if (!hit) this.add(path, 'schema-contains');
        }
    };

    Validator.prototype.checkLogic = function (data, schema, path, depth) {
        var i;
        if (Array.isArray(schema.allOf)) {
            for (i = 0; i < schema.allOf.length; i++) {
                this.check(data, schema.allOf[i], path, depth + 1);
            }
        }
        if (Array.isArray(schema.anyOf)) {
            var anyOk = false;
            for (i = 0; i < schema.anyOf.length; i++) {
                var sub = new Validator(schema.anyOf[i], this.root);
                sub.check(data, schema.anyOf[i], path, depth + 1);
                if (!sub.errors.length) { anyOk = true; break; }
            }
            if (!anyOk && schema.anyOf.length) this.add(path, 'schema-anyof', { n: String(schema.anyOf.length) });
        }
        if (Array.isArray(schema.oneOf)) {
            var hits = 0;
            for (i = 0; i < schema.oneOf.length; i++) {
                var s2 = new Validator(schema.oneOf[i], this.root);
                s2.check(data, schema.oneOf[i], path, depth + 1);
                if (!s2.errors.length) hits++;
            }
            if (hits === 0 && schema.oneOf.length) this.add(path, 'schema-oneof', { n: String(schema.oneOf.length) });
            else if (hits > 1) this.add(path, 'schema-oneof-multi', { n: String(hits) });
        }
        if (has(schema, 'not')) {
            var s3 = new Validator(schema.not, this.root);
            s3.check(data, schema.not, path, depth + 1);
            if (!s3.errors.length) this.add(path, 'schema-not');
        }
    };

    Validator.prototype.checkCondition = function (data, schema, path, depth) {
        if (!has(schema, 'if')) return;
        var probe = new Validator(schema.if, this.root);
        probe.check(data, schema.if, path, depth + 1);
        var branch = probe.errors.length === 0 ? schema.then : schema.else;
        if (branch === undefined) return;
        this.check(data, branch, path, depth + 1);
    };

    /** 路径沿用 jsonpath 的可读写法：$.a.b[0] */
    function joinPath(base, key) {
        var s = String(key);
        if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(s)) return base + '.' + s;
        return base + '[' + JSON.stringify(s) + ']';
    }

    /**
     * validate(data, schema) → { ok, errors:[{path, code, ...params}], truncated }
     */
    function validate(data, schema) {
        if (!isPlainObject(schema) && schema !== true && schema !== false) {
            return { ok: false, errors: [{ path: '$', code: 'schema-bad-schema' }], truncated: false };
        }
        var v = new Validator(schema, schema);
        v.check(data, schema, '$', 0);
        return {
            ok: v.errors.length === 0,
            errors: v.errors,
            truncated: v.truncated
        };
    }

    /* ==================================================================== *
     * 反推 schema
     * ==================================================================== */

    function guessFormat(value) {
        if (typeof value !== 'string' || !value) return null;
        var chain = ['date-time', 'date', 'time', 'email', 'uuid', 'ipv4', 'ipv6', 'uri'];
        for (var i = 0; i < chain.length; i++) {
            var fn = FORMATS[chain[i]];
            if (fn && fn(value)) return chain[i];
        }
        return null;
    }

    function baseFor(value) {
        var t = typeOf(value);
        var out = { type: t };
        if (t === 'number') {
            if (value % 1 === 0) out.type = 'integer';
        } else if (t === 'string') {
            var f = guessFormat(value);
            if (f) out.format = f;
        }
        return out;
    }

    /** 两个同类型 schema 求并：属性合并、required 取交集、format 不同就丢掉 */
    function mergeSchemas(a, b) {
        if (!a) return b;
        if (!b) return a;
        var typeA = Array.isArray(a.type) ? a.type : [a.type];
        var typeB = Array.isArray(b.type) ? b.type : [b.type];
        var types = typeA.slice();
        for (var i = 0; i < typeB.length; i++) {
            if (types.indexOf(typeB[i]) < 0) types.push(typeB[i]);
        }
        var out = { type: types.length === 1 ? types[0] : types };
        if (a.format && a.format === b.format) out.format = a.format;

        var pa = a.properties;
        var pb = b.properties;
        if (pa && pb) {
            var props = {};
            var keys = Object.keys(pa);
            var kb = Object.keys(pb);
            for (var k = 0; k < kb.length; k++) {
                if (keys.indexOf(kb[k]) < 0) keys.push(kb[k]);
            }
            for (var j = 0; j < keys.length; j++) {
                var key = keys[j];
                props[key] = mergeSchemas(pa[key], pb[key]) || {};
            }
            out.properties = props;
            // 两边都出现的键才算必填
            var both = [];
            for (var m = 0; m < keys.length; m++) {
                if (Object.prototype.hasOwnProperty.call(pa, keys[m]) &&
                    Object.prototype.hasOwnProperty.call(pb, keys[m])) both.push(keys[m]);
            }
            if (both.length) out.required = both.sort();
        }

        var ia = a.items;
        var ib = b.items;
        if (ia && ib) out.items = mergeSchemas(ia, ib);
        else if (ia) out.items = ia;
        else if (ib) out.items = ib;
        return out;
    }

    function InferState() {
        this.nodes = 0;
    }

    function infer(value, state, depth) {
        state = state || new InferState();
        depth = depth || 0;
        state.nodes++;
        if (state.nodes > LIMITS.inferNodes || depth > LIMITS.inferDepth) return {};

        var t = typeOf(value);
        if (t === 'object') {
            var props = {};
            var keys = Object.keys(value);
            for (var i = 0; i < keys.length; i++) {
                props[keys[i]] = infer(value[keys[i]], state, depth + 1);
            }
            var out = { type: 'object', properties: props };
            if (keys.length) out.required = keys.slice().sort();
            return out;
        }
        if (t === 'array') {
            var merged = null;
            for (var k = 0; k < value.length && k < 200; k++) {
                merged = mergeSchemas(merged, infer(value[k], state, depth + 1));
            }
            return { type: 'array', items: merged || {} };
        }
        return baseFor(value);
    }

    /** 给 UI 用的入口：补上 $schema 与 title */
    function inferSchema(value, opts) {
        opts = opts || {};
        var body = infer(value, new InferState(), 0);
        var out = { $schema: DRAFT };
        if (opts.title) out.title = opts.title;
        var bodyKeys = Object.keys(body);
        for (var i = 0; i < bodyKeys.length; i++) out[bodyKeys[i]] = body[bodyKeys[i]];
        return out;
    }

    return {
        LIMITS: LIMITS,
        DRAFT: DRAFT,
        FORMATS: FORMAT_NAMES,
        validate: validate,
        infer: inferSchema,
        typeOf: typeOf
    };
});
