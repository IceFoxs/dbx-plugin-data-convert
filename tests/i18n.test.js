/*
 * i18n 完整性测试 —— 只在源码层面解析 ui/index.html，不需要浏览器。
 *
 * 目的：新增文案时最容易犯的错是「只补了 zh-CN / zh-TW / en 三种」，
 * 其余 11 种语言悄悄回退到英文或中文兜底。这里把八张字典全量对齐：
 *   1. 语言集合必须和 languageConfigs 一致（14 种）；
 *   2. 每张表的键集合必须和 zh-CN 完全一致（不缺、不多）；
 *   3. 不允许空字符串；
 *   4. 占位符（{n} / {size} / {e} …）必须在各语言里都出现，不能丢。
 *
 *   node tests/i18n.test.js
 */
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
// 页面拆成了「index.html 只放结构 + js/app/*.js 一个功能一个文件」，
// 字典在脚本里、data-i18n 在结构里，两处都要读，所以拼在一起再解析
function readSources() {
    var dir = path.join(ROOT, 'ui/js/app');
    var parts = [fs.readFileSync(path.join(ROOT, 'ui/index.html'), 'utf8')];
    fs.readdirSync(dir).filter(function (f) { return /\.js$/.test(f); }).sort()
        .forEach(function (f) { parts.push(fs.readFileSync(path.join(dir, f), 'utf8')); });
    return parts.join('\n');
}
var html = readSources();

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

// 从 `const NAME = {` / `const NAME = [` 开始按括号配对取出字面量并求值
function readLiteral(source, name) {
    var marker = 'const ' + name + ' = ';
    var i = source.indexOf(marker);
    if (i < 0) throw new Error('找不到 const ' + name);
    var start = i + marker.length;
    var open = source[start];
    var close = open === '{' ? '}' : ']';
    var depth = 0;
    var inStr = null;
    for (var k = start; k < source.length; k++) {
        var c = source[k];
        if (inStr) {
            if (c === '\\') { k++; continue; }
            if (c === inStr) inStr = null;
            continue;
        }
        if (c === "'" || c === '"' || c === '`') { inStr = c; continue; }
        if (c === open) depth++;
        else if (c === close) {
            depth--;
            if (depth === 0) {
                // eslint-disable-next-line no-new-func
                return new Function('return ' + source.slice(start, k + 1))();
            }
        }
    }
    throw new Error('const ' + name + ' 括号不配对');
}

var languageConfigs = readLiteral(html, 'languageConfigs');
var tables = {
    NAV_I18N: readLiteral(html, 'NAV_I18N'),
    SQL_I18N: readLiteral(html, 'SQL_I18N'),
    SHEET_I18N: readLiteral(html, 'SHEET_I18N'),
    IMG_I18N: readLiteral(html, 'IMG_I18N'),
    GEN_I18N: readLiteral(html, 'GEN_I18N'),
    CONF_I18N: readLiteral(html, 'CONF_I18N'),
    QUERY_I18N: readLiteral(html, 'QUERY_I18N'),
    ESC_I18N: readLiteral(html, 'ESC_I18N'),
    BYTES_I18N: readLiteral(html, 'BYTES_I18N'),
    TIME_I18N: readLiteral(html, 'TIME_I18N'),
    CHART_I18N: readLiteral(html, 'CHART_I18N'),
    QR_I18N: readLiteral(html, 'QR_I18N'),
    STATS_I18N: readLiteral(html, 'STATS_I18N'),
    FLOW_I18N: readLiteral(html, 'FLOW_I18N'),
    DATASQL_I18N: readLiteral(html, 'DATASQL_I18N'),
    SEL_I18N: readLiteral(html, 'SEL_I18N')
};

var langCodes = languageConfigs.map(function (l) { return l.code; });

function placeholders(text) {
    var out = [];
    var re = /\{([a-zA-Z0-9_]+)\}/g;
    var m;
    while ((m = re.exec(String(text)))) out.push(m[1]);
    return out.sort().join(',');
}

console.log('\n== i18n 完整性 ==');
console.log('  语言：' + langCodes.join(' '));

check('语言表一共有 ' + langCodes.length + ' 种', function () {
    if (langCodes.length !== 14) throw new Error('语言数是 ' + langCodes.length);
    var dup = langCodes.filter(function (c, i) { return langCodes.indexOf(c) !== i; });
    if (dup.length) throw new Error('重复的 code: ' + dup.join(','));
});

Object.keys(tables).forEach(function (name) {
    var table = tables[name];
    var codes = Object.keys(table);

    check(name + ' 覆盖全部 ' + langCodes.length + ' 种语言', function () {
        var missing = langCodes.filter(function (c) { return codes.indexOf(c) < 0; });
        var extra = codes.filter(function (c) { return langCodes.indexOf(c) < 0; });
        if (missing.length) throw new Error('缺语言: ' + missing.join(','));
        if (extra.length) throw new Error('多出未定义的语言: ' + extra.join(','));
    });

    var refKeys = Object.keys(table['zh-CN'] || {});

    check(name + ' 每种语言的键都和 zh-CN 一致（共 ' + refKeys.length + ' 个）', function () {
        var problems = [];
        codes.forEach(function (code) {
            var keys = Object.keys(table[code]);
            var missing = refKeys.filter(function (k) { return keys.indexOf(k) < 0; });
            var extra = keys.filter(function (k) { return refKeys.indexOf(k) < 0; });
            if (missing.length) problems.push(code + ' 缺 ' + missing.join('/'));
            if (extra.length) problems.push(code + ' 多 ' + extra.join('/'));
        });
        if (problems.length) throw new Error(problems.join('; '));
    });

    check(name + ' 没有空译文', function () {
        var problems = [];
        codes.forEach(function (code) {
            Object.keys(table[code]).forEach(function (k) {
                var v = table[code][k];
                if (typeof v !== 'string' || !v.trim()) problems.push(code + '.' + k);
            });
        });
        if (problems.length) throw new Error(problems.slice(0, 10).join(', '));
    });

    check(name + ' 占位符在各语言里都保留', function () {
        var problems = [];
        codes.forEach(function (code) {
            refKeys.forEach(function (k) {
                var want = placeholders(table['zh-CN'][k]);
                if (!want) return;
                var got = placeholders(table[code][k]);
                if (got !== want) problems.push(code + '.' + k + ' 期望 {' + want + '} 实际 {' + got + '}');
            });
        });
        if (problems.length) throw new Error(problems.slice(0, 8).join('; '));
    });
});

check('主字典里每种语言都有错误定位文案', function () {
    var problems = languageConfigs.filter(function (l) {
        return !l.dict.errorLocLine || !l.dict.errorLocCol;
    }).map(function (l) { return l.code; });
    if (problems.length) throw new Error('缺 errorLocLine/errorLocCol: ' + problems.join(','));
});

check('HTML 里用到的 data-i18n 键都能在字典中找到', function () {
    var pool = {};
    languageConfigs.forEach(function (l) {
        Object.keys(l.dict).forEach(function (k) { pool[k] = 1; });
    });
    Object.keys(tables).forEach(function (name) {
        Object.keys((tables[name]['zh-CN'] || {})).forEach(function (k) { pool[k] = 1; });
    });
    var used = [];
    var re = /data-i18n(?:-placeholder|-title)?="([A-Za-z0-9_]+)"/g;
    var m;
    while ((m = re.exec(html))) used.push(m[1]);
    if (!used.length) throw new Error('一个 data-i18n 都没解析到，正则可能失效了');
    var missing = used.filter(function (k) { return !pool[k]; });
    missing = missing.filter(function (k, i) { return missing.indexOf(k) === i; });
    if (missing.length) throw new Error('字典里没有: ' + missing.join(', '));
});

check('主字典键数各语言一致', function () {
    var ref = Object.keys(languageConfigs[0].dict).length;
    var bad = languageConfigs.filter(function (l) {
        return Object.keys(l.dict).length !== ref;
    }).map(function (l) { return l.code + '(' + Object.keys(l.dict).length + ')'; });
    if (bad.length) throw new Error('键数不一致，基准 ' + ref + '：' + bad.join(','));
});

console.log(failed ? '\n==== ' + passed + ' passed, ' + failed + ' failed ====\n'
                   : '\n==== ' + passed + ' passed, 0 failed ====\n');
process.exit(failed ? 1 : 0);
