/*
 * JSON -> ECharts option — pure functions, no DOM, no echarts dependency.
 *
 * 这一层只做"把贴进来的 JSON 变成一份能交给 echarts.setOption 的 option"，
 * 渲染、导出留在 ui/index.html（那里才会用到 echarts 本体）。
 * 所以它能被 node 直接 require 跑单测，而不用起浏览器。
 *
 *   parseText(text)     文本 -> { value } | { code, detail }
 *   classify(value)     'option' | 'points' | 'pairs' | 'map' | 'unknown'
 *   build(value, opts)  -> { option, meta } | { code, detail }
 *   clampSize(raw, ax)  宽/高取值 + 越界说明
 *
 * 参考实现：echarts-node-export-server（option 原样交给 setOption、导出前 animation=false、
 * 尺寸缺失时回落到默认值），这里把同一套语义搬到浏览器里做「所见即所得」的预览。
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.DBXChart = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    // 上限都是"会在入口拦下并说清楚"的数字，不是拍脑袋的软限制：
    // 2 M 字符 ≈ 一份 3000 行的 option；5 万点是 canvas 在 webview 里还画得动的量级。
    var LIMITS = {
        chars: 2 * 1024 * 1024,
        // 默认 700 × 400（横版）：和 echarts-node-export-server 的默认一致
        width: { min: 80, max: 4096, def: 700 },
        height: { min: 80, max: 4096, def: 400 },
        series: 30,
        points: 50000,
        pointsPerSeries: 20000
    };

    var TYPES = ['auto', 'line', 'bar', 'area', 'pie', 'scatter'];

    // classify 用：出现这些键就认为贴的是完整 option，别去猜数据形状
    var OPTION_KEYS = [
        'series', 'xAxis', 'yAxis', 'radar', 'angleAxis', 'radiusAxis', 'polar',
        'geo', 'dataset', 'singleAxis', 'calendar', 'graphic', 'visualMap'
    ];

    function isPlainObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    function isNum(value) {
        return typeof value === 'number' && isFinite(value);
    }

    function clone(value) {
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (err) {
            return null;
        }
    }

    // ---------- 输入 ----------

    // ---------- 智能解析：接口返回常常在 option 外面再包一层 ----------
    //
    //   {"monthly_trend":{"echart_option":"{\"series\":[…]}","table_data":null,"biz_data":{}}}
    //
    // option 被序列化成了字符串，外面还套着业务 key。这里按「键名 + 内容」双重打分
    // 找出真正的配置，最多剥 4 层，剥不动就原样返回，绝不猜坏。

    function flattenKey(key) {
        return String(key).toLowerCase().replace(/[_\-.\s]/g, '');
    }

    /** 键名有多像"图配置"：echart_option 最高，data / result 这类弱一些 */
    function keyScore(key) {
        var k = flattenKey(key);
        if (/echarts?option|chartoption|echarts?config|chartconfig|echarts?spec/.test(k)) return 100;
        if (/option|config|spec|profile/.test(k)) return 60;
        if (/echarts?|chart|graph/.test(k)) return 50;
        if (/data|result|payload|body|content|list|rows|records|table|series|value/.test(k)) return 30;
        return 10;
    }

    /** 字符串里藏着 JSON（接口把 option 序列化成了字符串）就取出来，否则 null */
    function parseEmbedded(value) {
        if (typeof value !== 'string') return null;
        var s = value.trim();
        if (!s) return null;
        // 只有以 { 或 [ 开头的才当"藏了 JSON"，普通字符串不试解析
        if (s.charAt(0) !== '{' && s.charAt(0) !== '[') return null;
        try {
            return JSON.parse(s);
        } catch (err) {
            return null;
        }
    }

    /** 候选值有多值得当成"真正的配置"：完整 option 比纯数据更值得 */
    /**
     * 在一个节点里找「真正能画的东西」：{ value, via, score, kind } 或 null。
     * 递归最多 3 层（{"code":0,"data":{"result":{"chartOption":"…"}}} 够用了），
     * 已经是 option / 数据就直接返回，不再往里挖。
     */
    function findInside(node, depth) {
        if (depth > 3) return null;
        var parsed = parseEmbedded(node);
        var cur = parsed === null ? node : parsed;
        var prefix = parsed === null ? '' : 'JSON';
        var kind = classify(cur);
        if (kind !== 'unknown') {
            return { value: cur, score: kind === 'option' ? 60 : 20, kind: kind, via: prefix };
        }
        if (Array.isArray(cur)) {
            // 只认「长度为 1 的数组包着东西」；多元素数组本身可能就是数据
            if (cur.length !== 1) return null;
            var one = findInside(cur[0], depth + 1);
            if (!one) return null;
            return {
                value: one.value,
                score: one.score,
                kind: one.kind,
                via: '[0]' + (one.via && one.via !== 'JSON' ? '.' + one.via : '')
            };
        }
        if (!isPlainObject(cur)) return null;

        var best = null;
        var keys = Object.keys(cur);
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            var got = findInside(cur[key], depth + 1);
            if (!got || !got.score) continue;
            var score = keyScore(key) + got.score;
            if (!best || score > best.score) {
                best = {
                    value: got.value,
                    score: score,
                    kind: got.kind,
                    via: got.via === 'JSON' ? key : (got.via ? key + '.' + got.via : key)
                };
            }
        }
        return best;
    }

    /**
     * unwrap(value) -> { value, via, layers }
     *   via   走过的键路径（'monthly_trend.echart_option'），整串就是一层字符串时为空
     *   layers 剥了几层（路径段数）
     */
    function unwrap(value) {
        var found = findInside(value, 0);
        if (!found) return { value: value, via: '', layers: 0 };
        var via = found.via === 'JSON' ? '' : found.via;
        return { value: found.value, via: via, layers: via ? via.split('.').length : 0 };
    }

    // ---------- 一份 JSON 里藏着多个 option ----------
    //
    //   {"前端":{"echart_option":"{…}"},"后台":{"echart_option":"{…}"}}
    //   [{"echart_option":"{…}"},{"echart_option":"{…}"}]
    //
    // 只挑一个出来会丢掉别的，所以把找到的都列出来（带路径与标题），由界面让用户选。

    function optionTitle(value) {
        if (!isPlainObject(value)) return '';
        var t = value.title;
        if (typeof t === 'string') return t;
        if (isPlainObject(t) && typeof t.text === 'string') return t.text;
        if (Array.isArray(t) && t.length && isPlainObject(t[0]) && typeof t[0].text === 'string') return t[0].text;
        return '';
    }

    /**
     * collectOptions(value) -> [{ path, value, title }]
     * 广度优先、最多看 COLLECT_BUDGET 个节点（病态输入也不会把主线程占住），
     * 命中 option 就不再往下挖（避免把 series 当根）。
     */
    var COLLECT_BUDGET = 300;
    var COLLECT_DEPTH = 4;

    function collectOptions(value) {
        var out = [];
        var budget = COLLECT_BUDGET;

        function walk(node, path, depth) {
            if (budget <= 0 || depth > COLLECT_DEPTH) return;
            budget--;
            if (typeof node === 'string') {
                var parsed = parseEmbedded(node);
                if (parsed !== null) walk(parsed, path, depth + 1);
                return;
            }
            if (Array.isArray(node)) {
                for (var i = 0; i < node.length; i++) {
                    walk(node[i], path ? path + '[' + i + ']' : '[' + i + ']', depth + 1);
                }
                return;
            }
            if (!isPlainObject(node)) return;
            if (classify(node) === 'option') {
                out.push({ path: path, value: node, title: optionTitle(node) });
                return;
            }
            var keys = Object.keys(node);
            for (var j = 0; j < keys.length; j++) {
                walk(node[keys[j]], path ? path + '.' + keys[j] : keys[j], depth + 1);
            }
        }

        walk(value, '', 0);
        return out;
    }

    // ---------- 换行 / 拼接的多个 JSON ----------
    //
    //   一行一个 JSON（NDJSON、日志导出、curl 批量结果）：
    //       {"echart_option":"{…}"}
    //       {"echart_option":"{…}"}
    //   或者干脆首尾相接 {"a":1}{"b":2}。
    // 整串 JSON.parse 会失败，这里自己按括号配平切开，切不动就返回 null（交回原报错）。

    var MAX_DOCS = 200;

    function splitJsonDocs(text) {
        var raw = String(text == null ? '' : text);
        if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);   // 带 BOM 的文件
        var out = [];
        var n = raw.length;
        var i = 0;

        function isWs(c) {
            return c === ' ' || c === '\n' || c === '\r' || c === '\t';
        }

        while (i < n) {
            while (i < n && isWs(raw.charAt(i))) i++;
            if (i >= n) break;
            if (out.length >= MAX_DOCS) return null;

            var start = i;
            var ch = raw.charAt(i);
            if (ch === '{' || ch === '[') {
                var depth = 0;
                var inStr = false;
                var escaped = false;
                for (; i < n; i++) {
                    var c = raw.charAt(i);
                    if (inStr) {
                        if (escaped) escaped = false;
                        else if (c === '\\') escaped = true;
                        else if (c === '"') inStr = false;
                        continue;
                    }
                    if (c === '"') { inStr = true; continue; }
                    if (c === '{' || c === '[') depth++;
                    else if (c === '}' || c === ']') {
                        depth--;
                        if (depth === 0) { i++; break; }
                    }
                }
                if (depth !== 0) return null;              // 括号没闭合，不是「多份」而是坏 JSON
            } else if (ch === '"') {
                var esc2 = false;
                i++;
                var closed = false;
                for (; i < n; i++) {
                    var c2 = raw.charAt(i);
                    if (esc2) { esc2 = false; continue; }
                    if (c2 === '\\') { esc2 = true; continue; }
                    if (c2 === '"') { i++; closed = true; break; }
                }
                if (!closed) return null;
            } else {
                // 数字 / true / false / null：吃到空白或分隔符为止
                while (i < n && !/[,\s\]}]/.test(raw.charAt(i))) i++;
            }

            var piece = raw.slice(start, i);
            try {
                out.push(JSON.parse(piece));
            } catch (err) {
                return null;
            }
            // 首尾相接时下一段可能紧跟逗号（手写的 JSON 数组拆开后常见）
            while (i < n && (isWs(raw.charAt(i)) || raw.charAt(i) === ',')) i++;
        }

        return out.length ? out : null;
    }

    /**
     * 文本 -> JSON 值。错误里带行列，UI 直接照抄进提示条。
     * 解析成功后自动剥外层包装（echart_option / data / result…），
     * 并把「一共找到几个 option、分别在哪」带出去，供界面做选择器。
     * 整串不是单个 JSON 但能切成多份（一行一个 / 首尾相接）时也照这个流程走。
     * JSON.parse 自带的信息在 V8 / JSC 上不完全一致，所以只做保守解析。
     */
    function parseText(text) {
        var raw = String(text == null ? '' : text);
        if (!raw.trim()) return { code: 'empty' };
        if (raw.length > LIMITS.chars) return { code: 'too-big', detail: { n: raw.length, limit: LIMITS.chars } };

        var docs = null;
        var parsedValue;
        try {
            parsedValue = JSON.parse(raw);
        } catch (err) {
            docs = splitJsonDocs(raw);
            if (!docs) {
                var msg = String((err && err.message) || err || '');
                var at = /position\s+(\d+)/i.exec(msg);
                var line = null;
                if (at) {
                    var pos = Math.min(Number(at[1]), raw.length);
                    line = raw.slice(0, pos).split('\n').length;
                }
                return { code: 'json-invalid', detail: { message: msg, line: line } };
            }
        }

        // 多份文档：把每一份里的 option 都收集起来，路径带上 #序号
        if (docs) {
            var many = [];
            for (var d = 0; d < docs.length; d++) {
                var list = collectOptions(docs[d]);
                for (var k = 0; k < list.length; k++) {
                    many.push({
                        path: '#' + (d + 1) + (list[k].path ? '.' + list[k].path : ''),
                        title: list[k].title,
                        value: list[k].value
                    });
                }
            }
            if (many.length) {
                return { value: many[0].value, via: many[0].path, layers: 1, options: many, docs: docs.length };
            }
            // 没有 option：当成一串数据（一行一个点也能画）
            return { value: docs, via: '', layers: 0, options: [], docs: docs.length };
        }

        var found = collectOptions(parsedValue);
        if (found.length) {
            return {
                value: found[0].value,
                via: found[0].path,
                layers: 1,
                options: found.map(function (o) {
                    return { path: o.path, title: o.title, value: o.value };
                })
            };
        }

        var res = unwrap(parsedValue);
        return { value: res.value, via: res.via, layers: res.layers, options: [] };
    }

    // ---------- 形状判定 ----------

    function pointOf(item, index) {
        if (isNum(item)) return { name: String(index + 1), value: item };
        if (Array.isArray(item) && item.length >= 2 && isNum(item[0]) && isNum(item[1])) {
            return { pair: [item[0], item[1]] };
        }
        if (!isPlainObject(item)) return null;
        if (isNum(item.value)) {
            var label = item.name != null ? item.name : (item.label != null ? item.label : item.key);
            return { name: label == null ? String(index + 1) : String(label), value: item.value };
        }
        // 只带一个数字字段的对象也认：{"month":"1月","sales":12}
        var numKeys = Object.keys(item).filter(function (k) { return isNum(item[k]); });
        if (numKeys.length !== 1) return null;
        var strKeys = Object.keys(item).filter(function (k) { return typeof item[k] === 'string'; });
        return {
            name: strKeys.length ? String(item[strKeys[0]]) : String(index + 1),
            value: item[numKeys[0]]
        };
    }

    function classify(value) {
        if (Array.isArray(value)) {
            if (!value.length) return 'unknown';
            var seen = { num: 0, pair: 0, point: 0 };
            for (var i = 0; i < value.length; i++) {
                if (isNum(value[i])) { seen.num++; continue; }
                if (Array.isArray(value[i]) && value[i].length >= 2 && isNum(value[i][0]) && isNum(value[i][1])) {
                    seen.pair++;
                    continue;
                }
                if (pointOf(value[i], i)) { seen.point++; continue; }
                return 'unknown';
            }
            if (seen.pair === value.length) return 'pairs';
            if (seen.num + seen.point === value.length) return 'points';
            return 'unknown';
        }
        if (!isPlainObject(value)) return 'unknown';

        for (var k = 0; k < OPTION_KEYS.length; k++) {
            if (Object.prototype.hasOwnProperty.call(value, OPTION_KEYS[k])) {
                if (OPTION_KEYS[k] === 'series') {
                    var s = value.series;
                    if (Array.isArray(s) ? s.length > 0 : isPlainObject(s)) return 'option';
                    continue;
                }
                return 'option';
            }
        }
        // {"A": 12, "B": 30} 这种平铺的字典
        var keys = Object.keys(value);
        if (!keys.length) return 'unknown';
        for (var j = 0; j < keys.length; j++) {
            if (!isNum(value[keys[j]])) return 'unknown';
        }
        return 'map';
    }

    // ---------- 尺寸 ----------

    /** 返回 { value, code }：code 为 'bad' / 'small' / 'big' 时 value 已被夹到合法值。 */
    function clampSize(raw, axis) {
        var spec = axis === 'height' ? LIMITS.height : LIMITS.width;
        var n = typeof raw === 'number' ? raw : parseInt(String(raw == null ? '' : raw).trim(), 10);
        if (!isFinite(n) || n <= 0) return { value: spec.def, code: 'bad' };
        if (n < spec.min) return { value: spec.min, code: 'small' };
        if (n > spec.max) return { value: spec.max, code: 'big' };
        return { value: Math.round(n), code: null };
    }

    // ---------- 数据形状 -> series ----------

    function readPoints(list) {
        var out = [];
        for (var i = 0; i < list.length; i++) {
            var p = pointOf(list[i], i);
            if (!p || p.pair) return null;
            out.push(p);
        }
        return out;
    }

    function readPairs(list) {
        var out = [];
        for (var i = 0; i < list.length; i++) {
            var item = list[i];
            if (Array.isArray(item) && item.length >= 2 && isNum(item[0]) && isNum(item[1])) {
                out.push([item[0], item[1]]);
            } else if (isPlainObject(item) && isNum(item.x) && isNum(item.y)) {
                out.push([item.x, item.y]);
            } else {
                return null;
            }
        }
        return out;
    }

    function pick(type, hasNames, isPair) {
        if (type && type !== 'auto') return type;
        if (isPair) return 'scatter';
        return hasNames ? 'bar' : 'line';
    }

    function dataOption(kind, list, type, background) {
        var pairs = kind === 'pairs' ? readPairs(list) : null;
        var points = pairs ? null : readPoints(list);
        if (!pairs && !points) return { code: 'shape' };

        var isPair = !!pairs;
        var chosen = pick(type, !isPair && points.some(function (p, i) { return p.name !== String(i + 1); }), isPair);
        var option = {
            animation: false,
            backgroundColor: background,
            tooltip: { trigger: (chosen === 'pie' || chosen === 'scatter') ? 'item' : 'axis' }
        };

        if (chosen === 'pie') {
            var pieData = (points || []).map(function (p) { return { name: p.name, value: p.value }; });
            if (isPair) {
                pieData = pairs.map(function (p) { return { name: String(p[0]), value: p[1] }; });
            }
            option.series = [{
                type: 'pie',
                radius: ['38%', '68%'],
                center: ['50%', '52%'],
                label: { show: true, formatter: '{b} {d}%' },
                data: pieData
            }];
            return { option: option, types: ['pie'] };
        }

        if (chosen === 'scatter') {
            option.xAxis = { type: 'value', splitLine: { show: true } };
            option.yAxis = { type: 'value', splitLine: { show: true } };
            option.grid = { left: 12, right: 18, top: 28, bottom: 10, containLabel: true };
            option.series = [{
                type: 'scatter',
                symbolSize: 8,
                data: isPair ? pairs : (points || []).map(function (p, i) { return [i, p.value]; })
            }];
            return { option: option, types: ['scatter'] };
        }

        var categories = (points || []).map(function (p) { return p.name; });
        var values = (points || []).map(function (p) { return p.value; });
        var isArea = chosen === 'area';
        option.grid = { left: 12, right: 18, top: 28, bottom: 10, containLabel: true };
        option.xAxis = {
            type: 'category',
            data: categories,
            axisLabel: { hideOverlap: true },
            boundaryGap: chosen === 'bar'
        };
        option.yAxis = { type: 'value' };
        option.series = [{
            type: isArea ? 'line' : chosen,
            areaStyle: isArea ? {} : null,
            smooth: isArea,
            data: values
        }];
        if (!isArea) delete option.series[0].areaStyle;
        return { option: option, types: [isArea ? 'line' : chosen] };
    }

    /** 平铺字典 {"A":1,"B":2} -> 与数组同样的数据通道 */
    function mapToList(map) {
        return Object.keys(map).map(function (k) { return { name: k, value: map[k] }; });
    }

    // ---------- 完整 option 改类型 ----------

    /** xAxis 可能是数组 / 对象，取出类目名 */
    function axisNames(axis) {
        var first = Array.isArray(axis) ? axis[0] : axis;
        if (!isPlainObject(first)) return [];
        return Array.isArray(first.data) ? first.data.map(function (v) { return String(v); }) : [];
    }

    /** 把 [3,5] / [{name,value}] / [[x,y]] 统一压成纯数值，折线柱状才画得出来 */
    function flattenValues(list) {
        var out = [];
        for (var i = 0; i < list.length; i++) {
            var p = pointOf(list[i], i);
            out.push(p ? p.value : list[i]);
        }
        return out;
    }

    /**
     * 完整 option 也允许改类型：用户选了什么就按什么画。
     *   line / bar / area / scatter  只改 series.type（area 顺手补 areaStyle），其余配置原样保留
     *   pie                          用第一条系列 + 类目名拼一份饼图数据，坐标轴一并收走
     *   auto                         不动，JSON 里的 series.type 说了算
     * 返回改完的 option（原地改，入参已经是 clone）。
     */
    function applyType(option, type) {
        if (['line', 'bar', 'area', 'pie', 'scatter'].indexOf(type) < 0) return option;
        var list = Array.isArray(option.series) ? option.series : (option.series ? [option.series] : []);
        if (!list.length) return option;

        if (type === 'pie') {
            var names = axisNames(option.xAxis);
            var first = isPlainObject(list[0]) ? list[0] : {};
            var raw = Array.isArray(first.data) ? first.data : [];
            var pieData = [];
            for (var i = 0; i < raw.length; i++) {
                var p = pointOf(raw[i], i);
                if (!p) continue;
                var label = (p.name && p.name !== String(i + 1)) ? p.name : (names[i] || String(i + 1));
                pieData.push({ name: label, value: p.value });
            }
            if (!pieData.length) return option;   // 不是「一行一个值」，别硬转成饼图
            delete option.xAxis;
            delete option.yAxis;
            delete option.grid;
            delete option.dataZoom;
            delete option.dataZoom;
            option.tooltip = { trigger: 'item' };
            option.series = [{
                type: 'pie',
                name: first.name || '',
                radius: ['38%', '68%'],
                center: ['50%', '52%'],
                label: { show: true, formatter: '{b} {d}%' },
                data: pieData
            }];
            return option;
        }

        var target = type === 'area' ? 'line' : type;
        for (var j = 0; j < list.length; j++) {
            var s = list[j];
            if (!isPlainObject(s)) continue;
            s.type = target;
            if (type === 'area') s.areaStyle = s.areaStyle || {};
            else if (s.areaStyle) delete s.areaStyle;
        }

        if (type === 'scatter') {
            // 散点要两条数值轴；原 option 是类目轴就换成数值轴，数据摊成 [i, v]
            if (!option.xAxis) {
                for (var k = 0; k < list.length; k++) {
                    if (isPlainObject(list[k]) && Array.isArray(list[k].data)) {
                        list[k].data = flattenValues(list[k].data).map(function (v, idx) { return [idx, v]; });
                    }
                }
                option.xAxis = { type: 'value' };
                option.yAxis = option.yAxis || { type: 'value' };
                option.grid = option.grid || { left: 12, right: 18, top: 28, bottom: 10, containLabel: true };
            }
            return option;
        }

        // 原 option 没有坐标轴（比如本来是饼图）：补一套类目轴，否则改了类型也是一片空白
        if (!option.xAxis) {
            var cat = axisNames(option.xAxis);
            for (var m = 0; m < list.length; m++) {
                if (isPlainObject(list[m]) && Array.isArray(list[m].data)) {
                    if (!cat.length) cat = list[m].data.map(function (d, idx) { var q = pointOf(d, idx); return q ? q.name : String(idx + 1); });
                    list[m].data = flattenValues(list[m].data);
                }
            }
            option.xAxis = {
                type: 'category',
                data: cat,
                boundaryGap: type === 'bar',
                axisLabel: { hideOverlap: true }
            };
            option.yAxis = option.yAxis || { type: 'value' };
            option.grid = option.grid || { left: 12, right: 18, top: 28, bottom: 10, containLabel: true };
        } else if (type === 'bar' || type === 'line' || type === 'area') {
            // 类目轴上的 boundaryGap：柱状要留缝，折线贴边
            var x = Array.isArray(option.xAxis) ? option.xAxis[0] : option.xAxis;
            if (isPlainObject(x) && (x.type === 'category' || x.type == null)) x.boundaryGap = type === 'bar';
        }
        option.tooltip = option.tooltip || { trigger: 'axis' };
        return option;
    }

    // ---------- 统计 ----------

    function countSeries(series) {
        if (Array.isArray(series)) return series.length;
        return series ? 1 : 0;
    }

    function countPoints(series) {
        var list = Array.isArray(series) ? series : (series ? [series] : []);
        var total = 0;
        var perSeries = 0;
        for (var i = 0; i < list.length; i++) {
            var item = list[i];
            if (!isPlainObject(item)) continue;
            var data = item.data;
            var n = Array.isArray(data) ? data.length : 0;
            if (n > perSeries) perSeries = n;
            total += n;
        }
        return { total: total, max: perSeries };
    }

    function seriesTypes(series) {
        var list = Array.isArray(series) ? series : (series ? [series] : []);
        return list.map(function (s) { return isPlainObject(s) && s.type ? String(s.type) : 'line'; });
    }

    // ---------- 主入口 ----------

    /**
     * build(value, opts)
     *   opts.type        'auto' | 'line' | 'bar' | 'area' | 'pie' | 'scatter'
     *   opts.background  预览 / 导出共用的底色（跟着主题走）
     * 返回 { option, meta } 或 { code, detail }
     */
    function build(value, opts) {
        var options = opts || {};
        var background = options.background || 'transparent';
        var type = TYPES.indexOf(options.type) >= 0 ? options.type : 'auto';
        var kind = classify(value);

        if (kind === 'unknown') return { code: 'shape' };

        if (kind === 'option') {
            var source = clone(value);
            if (!isPlainObject(source)) return { code: 'shape' };
            var series = source.series;
            if (series && !Array.isArray(series)) series = [series];
            if (Array.isArray(series) && !series.length) return { code: 'shape' };

            var count = countPoints(series);
            if (countSeries(series) > LIMITS.series) {
                return { code: 'too-many-series', detail: { n: countSeries(series), limit: LIMITS.series } };
            }
            if (count.total > LIMITS.points) {
                return { code: 'too-many-points', detail: { n: count.total, limit: LIMITS.points } };
            }
            if (count.max > LIMITS.pointsPerSeries) {
                return { code: 'too-many-points', detail: { n: count.max, limit: LIMITS.pointsPerSeries } };
            }

            source.series = series;
            source.animation = false;
            // 拖到类型下拉就按用户选的画；选「自动」才完全听 JSON 的
            if (type !== 'auto') applyType(source, type);
            // 底色跟预览一致：导出的图不会变成透明底或白底黑字看不清
            if (background !== 'transparent' && source.backgroundColor == null) {
                source.backgroundColor = background;
            }
            return {
                option: source,
                meta: {
                    kind: 'option',
                    series: countSeries(source.series),
                    points: countPoints(source.series).total,
                    types: seriesTypes(source.series)
                }
            };
        }

        var list = kind === 'map' ? mapToList(value) : value;
        var built = dataOption(kind, list, type, background);
        if (!built || built.code === 'shape') return { code: 'shape' };

        var data = built.option.series;
        var c = countPoints(data);
        if (c.max > LIMITS.pointsPerSeries || c.total > LIMITS.points) {
            return { code: 'too-many-points', detail: { n: c.total, limit: LIMITS.points } };
        }
        return {
            option: built.option,
            meta: {
                kind: kind,
                series: countSeries(data),
                points: c.total,
                types: built.types
            }
        };
    }

    return {
        LIMITS: LIMITS,
        TYPES: TYPES,
        OPTION_KEYS: OPTION_KEYS,
        parseText: parseText,
        classify: classify,
        clampSize: clampSize,
        build: build,
        applyType: applyType,
        countPoints: countPoints,
        mapToList: mapToList,
        unwrap: unwrap,
        collectOptions: collectOptions
    };
});
