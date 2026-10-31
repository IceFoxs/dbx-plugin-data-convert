/*
 * UI smoke test — loads ui/index.html in jsdom and exercises the wiring:
 * auto-convert, manual convert, error bar + line marker, swap, properties input.
 *
 *   npm install && node tests/ui.smoke.js
 *
 * jsdom has no layout engine, so Range/Element rects are stubbed to zeros;
 * CodeMirror still runs its model layer, which is what the assertions rely on.
 */
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');

var JSDOM;
try {
    JSDOM = require('jsdom').JSDOM;
} catch (e) {
    console.error('需要先安装 jsdom：npm install');
    process.exit(2);
}

var html = fs.readFileSync(path.join(ROOT, 'ui/index.html'), 'utf8');
// 样式已经搬到 ui/css/app.css（index.html 里只剩 <link>），布局断言直接读样式表
var CSS_TEXT = fs.readFileSync(path.join(ROOT, 'ui/css/app.css'), 'utf8');
var pageErrors = [];
var results = [];

var dom = new JSDOM(html, {
    url: 'file://' + path.join(ROOT, 'ui/index.html'),
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    virtualConsole: (function () {
        var vc = new (require('jsdom').VirtualConsole)();
        vc.on('jsdomError', function (e) {
            pageErrors.push(e.message);
        });
        return vc;
    })(),
    beforeParse: function (window) {
        window.matchMedia = function () {
            return { matches: false, addEventListener: function () {}, removeEventListener: function () {} };
        };
        var zeroRect = function () {
            return { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 };
        };
        var emptyRects = function () {
            return { length: 0, item: function () { return null; }, [Symbol.iterator]: function* () {} };
        };
        window.Range.prototype.getBoundingClientRect = zeroRect;
        window.Range.prototype.getClientRects = emptyRects;
        window.Element.prototype.getBoundingClientRect = zeroRect;
        window.Element.prototype.getClientRects = emptyRects;
        window.__clip = [];
        Object.defineProperty(window.navigator, 'clipboard', {
            value: {
                readText: async function () { return ''; },
                writeText: async function (text) { window.__clip.push(String(text)); }
            },
            configurable: true
        });
        // 二维码的两个库：jsdom 里外部脚本可能晚于 DOMContentLoaded 执行，
        // 这里直接挂到 window 上，让「进页 → 生成 → 定位 → 折叠」这条链路有得测。
        // 真实的惰性加载（blob 副本）在 Chrome 里验。
        window.DBXQr = require(path.join(ROOT, 'ui/js/qr.js'));
        window.qrcode = new Function(
            fs.readFileSync(path.join(ROOT, 'ui/vendor/qrcode/qrcode.js'), 'utf8') + '\nreturn qrcode;'
        )();
    }
});

var win = dom.window;
var wait = function (ms) {
    return new Promise(function (resolve) {
        setTimeout(resolve, ms);
    });
};

// jsdom 没有 canvas：echarts 就算加载成功，init 也会在 canvas 上抛错。
// 这里统一拦掉 echarts 的请求，让全流程走「引擎加载失败也不崩」这条最糟的路径；
// 真正的渲染 / PNG / SVG 导出由 /tmp/imgh/check-chart.js 在 Chrome 里验收。
(function stubEchartsLoad() {
    var doc0 = win.document;
    var realAppend = doc0.head.appendChild.bind(doc0.head);
    doc0.head.appendChild = function (el) {
        var src = el && el.getAttribute ? String(el.getAttribute('src') || '') : '';
        if (el && el.tagName === 'SCRIPT' && src.indexOf('echarts') >= 0) {
            setTimeout(function () {
                if (typeof el.onerror === 'function') el.onerror(new win.Event('error'));
            }, 0);
            return el;
        }
        return realAppend(el);
    };
})();

function check(name, fn) {
    try {
        fn();
        results.push(['ok  ', name]);
    } catch (e) {
        results.push(['FAIL', name + ' :: ' + e.message]);
    }
}

(async function () {
    await new Promise(function (resolve) {
        win.addEventListener('load', resolve, { once: true });
    });
    await wait(300);

    var doc = win.document;
    var input = doc.getElementById('inputText');
    var output = doc.getElementById('outputText');
    var errorBar = doc.getElementById('errorBar');
    var errorLoc = doc.getElementById('errorLoc');
    var resultLabel = doc.getElementById('outputResultLabel');

    check('页面脚本无加载错误', function () {
        if (pageErrors.length) throw new Error(pageErrors.join(' | '));
    });

    check('CodeMirror 挂载成功', function () {
        if (!doc.querySelector('.CodeMirror')) throw new Error('未找到 .CodeMirror');
    });

    check('转换核心已注册', function () {
        if (!win.DBXConvert) throw new Error('window.DBXConvert 缺失');
    });

    // 布局守卫：两栏必须结构一致，否则编辑器高度会再次错位
    check('左右两栏结构一致（pane-header + editor-container）', function () {
        var panes = Array.prototype.slice.call(doc.querySelectorAll('#mainWorkspace > .pane'));
        if (panes.length !== 2) throw new Error('pane 数量 ' + panes.length);
        panes.forEach(function (pane, i) {
            var kids = Array.prototype.map.call(pane.children, function (el) {
                return (el.className || '').split(' ')[0];
            });
            if (kids.join(',') !== 'pane-header,editor-container') {
                throw new Error('第 ' + (i + 1) + ' 栏子节点: ' + kids.join(','));
            }
        });
    });

    check('错误条浮在编辑器内部，不参与布局', function () {
        if (!errorBar.closest('.editor-container')) throw new Error('errorBar 已不在 editor-container 内');
    });

    check('工作区行高锁定为 1fr', function () {
        var css = CSS_TEXT;
        if (css.indexOf('grid-template-rows: minmax(0, 1fr)') === -1) {
            throw new Error('缺少 grid-template-rows: minmax(0, 1fr)');
        }
    });

    check('输出标签显示目标格式', function () {
        if (!resultLabel || resultLabel.textContent.indexOf('YAML') === -1) {
            throw new Error('标签内容: ' + (resultLabel && resultLabel.textContent));
        }
    });

    input.value = '{"a":1,"b":[1,2]}';
    await wait(700);
    check('输入后自动转换 JSON -> YAML', function () {
        if (output.value.indexOf('a: 1') === -1) throw new Error('输出: ' + JSON.stringify(output.value));
    });

    doc.getElementById('convertBtn').click();
    await wait(100);
    check('点击执行转换', function () {
        if (output.value.trim() === '') throw new Error('输出为空');
        if (errorBar.classList.contains('show')) throw new Error('意外报错: ' + errorLoc.textContent);
    });

    var good = output.value;
    input.value = '{\n  "a": 1\n  "b": 2\n}';
    await wait(700);
    check('解析失败时保留上一次结果', function () {
        if (output.value !== good) throw new Error('输出被覆盖: ' + JSON.stringify(output.value));
    });

    check('错误条显示行列', function () {
        if (!errorBar.classList.contains('show')) throw new Error('错误条未显示');
        if (errorLoc.textContent.indexOf('第 3 行') === -1) throw new Error('位置: ' + errorLoc.textContent);
    });

    check('出错行被标记', function () {
        var cm = doc.querySelector('.CodeMirror').CodeMirror;
        var handle = cm.getLineHandle(2);
        var viaDom = !!doc.querySelector('.cm-error-line');
        var viaModel = handle && String(handle.bgClass || '').indexOf('cm-error-line') !== -1;
        if (!viaDom && !viaModel) throw new Error('未标记出错行');
    });

    input.value = '{"a":1}';
    await wait(700);
    check('修好后错误条隐藏', function () {
        if (errorBar.classList.contains('show')) throw new Error('错误条仍在: ' + errorLoc.textContent);
        if (output.value.indexOf('a: 1') === -1) throw new Error('输出: ' + JSON.stringify(output.value));
    });

    doc.getElementById('swapBtn').click();
    await wait(200);
    check('交换格式后方向反转', function () {
        if (resultLabel.textContent.indexOf('JSON') === -1) throw new Error('标签: ' + resultLabel.textContent);
        if (output.value.indexOf('"a"') === -1) throw new Error('输出: ' + JSON.stringify(output.value));
    });

    input.value = 'a.b=1\nlist[0]=x';
    await wait(700);
    check('properties 输入可被识别', function () {
        if (output.value.trim() === '') throw new Error('输出为空');
    });

    // 模拟数据会把生成的文本写回输入框，写入会触发 CodeMirror change；
    // 若 change 处理把 currentDataObj 清空，序列化就只剩 "null"（曾出现的 bug）。
    var sourceSelect = doc.getElementById('sourceSelect');
    var targetSelect = doc.getElementById('targetSelect');
    var errorMsg = doc.getElementById('errorMsg');

    // ---------------- 格式矩阵：TOML / INI / .env / CSV / TSV / Query / Headers / Cookie / HTML ----------------
    check('两个下拉各有 13 种可选格式', function () {
        if (sourceSelect.querySelectorAll('.custom-option').length !== 13) {
            throw new Error('源格式数: ' + sourceSelect.querySelectorAll('.custom-option').length);
        }
        if (targetSelect.querySelectorAll('.custom-option').length !== 13) {
            throw new Error('目标格式数: ' + targetSelect.querySelectorAll('.custom-option').length);
        }
    });

    check('下拉里的分组标题不可选（没有 data-value，但要有翻译键）', function () {
        var groups = sourceSelect.querySelectorAll('.custom-option-group');
        if (groups.length !== 2) throw new Error('分组数: ' + groups.length);
        var keys = [groups[0].getAttribute('data-i18n'), groups[1].getAttribute('data-i18n')];
        if (keys.join(',') !== 'fmtGroupStructured,fmtGroupTable') throw new Error('分组键: ' + keys.join(','));
        if (groups[0].hasAttribute('data-value')) throw new Error('分组标题不该有 data-value');
    });

    async function pickFormat(src, tgt) {
        sourceSelect.querySelector('.custom-option[data-value="' + src + '"]').click();
        targetSelect.querySelector('.custom-option[data-value="' + tgt + '"]').click();
        await wait(300);
    }

    input.value = '{"name":"demo","port":8080,"db":{"host":"h"}}';
    await wait(700);

    await pickFormat('json', 'toml');
    check('JSON → TOML：标量 + 子表，徽标显示 TOML', function () {
        if (output.value.indexOf('name = "demo"') === -1) throw new Error(JSON.stringify(output.value));
        if (output.value.indexOf('[db]') === -1) throw new Error('缺子表: ' + JSON.stringify(output.value));
        if (resultLabel.textContent !== 'TOML') throw new Error('徽标: ' + resultLabel.textContent);
    });

    check('输出编辑器 mode 跟着目标格式走（TOML）', function () {
        var cms = doc.querySelectorAll('#mainWorkspace .CodeMirror');
        var mode = cms[cms.length - 1].CodeMirror.getOption('mode');
        if (mode !== 'text/x-toml') throw new Error('mode: ' + mode);
    });

    await pickFormat('json', 'csv');
    check('JSON → CSV：首行列名（嵌套拍平成 a.b）、次行数据', function () {
        var lines = output.value.trim().split('\n');
        if (lines[0].indexOf('name') === -1 || lines[0].indexOf('db.host') === -1) throw new Error('表头: ' + lines[0]);
        if (lines[1].indexOf('demo') === -1) throw new Error('数据行: ' + lines[1]);
    });

    await pickFormat('json', 'env');
    check('JSON → .env：嵌套拍平成 dotted key，徽标带点', function () {
        if (output.value.indexOf('db.host=h') === -1) throw new Error(JSON.stringify(output.value));
        if (resultLabel.textContent !== '.env') throw new Error('徽标: ' + resultLabel.textContent);
    });

    await pickFormat('json', 'headers');
    check('JSON → Headers：Name: value', function () {
        if (output.value.indexOf('name: demo') === -1) throw new Error(JSON.stringify(output.value));
    });

    await pickFormat('json', 'html');
    check('JSON → HTML：出 <table> 与 <th>', function () {
        if (output.value.indexOf('<table>') === -1) throw new Error(JSON.stringify(output.value));
        if (output.value.indexOf('<th>name</th>') === -1) throw new Error('缺表头: ' + output.value);
    });

    await pickFormat('csv', 'json');
    input.value = 'id,name\n1,Ada\n2,Bob';
    await wait(700);
    check('CSV → JSON：解析成对象数组，数字仍是数字', function () {
        var parsed = JSON.parse(output.value);
        if (!Array.isArray(parsed) || parsed.length !== 2) throw new Error(JSON.stringify(output.value));
        if (parsed[0].id !== 1 || parsed[0].name !== 'Ada') throw new Error('内容: ' + JSON.stringify(parsed[0]));
    });

    await pickFormat('toml', 'json');
    input.value = 'a = ???';
    await wait(700);
    check('TOML 解析失败：错误条给的是译文，不是 code', function () {
        if (!errorBar.classList.contains('show')) throw new Error('错误条没出现');
        if (!errorMsg.textContent.trim()) throw new Error('错误文案为空');
        if (errorMsg.textContent.indexOf('toml') >= 0) throw new Error('露出了 code: ' + errorMsg.textContent);
    });

    input.value = 'a = 1';
    await wait(700);
    check('TOML 修好后恢复并转出 JSON', function () {
        if (errorBar.classList.contains('show')) throw new Error('错误条仍在: ' + errorMsg.textContent);
        if (output.value.indexOf('"a": 1') === -1) throw new Error('输出: ' + JSON.stringify(output.value));
    });
    var targets = ['json', 'yaml', 'xml', 'properties'];
    for (var ti = 0; ti < targets.length; ti++) {
        sourceSelect.querySelector('.custom-option[data-value="properties"]').click();
        targetSelect.querySelector('.custom-option[data-value="' + targets[ti] + '"]').click();
        await wait(150);
        doc.getElementById('genMockBtn').click();
        await wait(400);
        check('模拟数据 properties -> ' + targets[ti] + ' 输出非空且非 null', function () {
            var o = output.value.trim();
            if (!o) throw new Error('输出为空');
            if (o === 'null') throw new Error('输出是 null');
            if (o.indexOf('1001') === -1) throw new Error('内容丢失: ' + o.slice(0, 60));
        });
    }

    // 差异视图：比较用的文本必须等于展示的文本，否则高亮行号必然错位
    sourceSelect.querySelector('.custom-option[data-value="json"]').click();
    targetSelect.querySelector('.custom-option[data-value="json"]').click();
    await wait(200);
    input.value = '{"a":1,"b":2,"c":{"d":3}}';
    await wait(700);
    doc.getElementById('toggleDiffBtn').click();
    await wait(300);

    function countMarks(cm, cls) {
        var d = cm.getDoc();
        var n = 0;
        for (var li = 0; li < d.lineCount(); li++) {
            var handle = d.getLineHandle(li);
            if (handle && String(handle.bgClass || '').indexOf(cls) !== -1) n++;
        }
        return n;
    }

    check('对比视图展示的是规范化后的 JSON（与比较文本一致）', function () {
        var cms = doc.querySelectorAll('#diffWorkspace .CodeMirror');
        if (cms.length !== 2) throw new Error('diff 编辑器数量: ' + cms.length);
        var expected = JSON.stringify(JSON.parse('{"a":1,"b":2,"c":{"d":3}}'), null, 2);
        var leftText = cms[0].CodeMirror.getValue();
        var rightText = cms[1].CodeMirror.getValue();
        if (leftText !== expected) throw new Error('左栏未规范化: ' + JSON.stringify(leftText));
        if (rightText !== expected) throw new Error('右栏未规范化: ' + JSON.stringify(rightText));
        if (leftText.split('\n').length < 3) throw new Error('仍是单行，高亮会错位');
    });

    check('内容相同则不产生任何差异标记', function () {
        var cms = doc.querySelectorAll('#diffWorkspace .CodeMirror');
        var marked = countMarks(cms[0].CodeMirror, 'cm-deleted') + countMarks(cms[1].CodeMirror, 'cm-inserted');
        if (marked !== 0) throw new Error('误标 ' + marked + ' 行');
    });

    // 结构化差异：只标变了的那个值，并按 JSON Pointer 列清单
    doc.getElementById('toggleDiffBtn').click();
    await wait(200);
    output.value = '{"a":1,"b":9,"c":{"d":3}}';
    await wait(300);
    doc.getElementById('toggleDiffBtn').click();
    await wait(300);

    check('结构化差异清单只列真正变化的字段', function () {
        var rows = doc.querySelectorAll('#diffReport .diff-row');
        if (rows.length !== 1) throw new Error('清单行数: ' + rows.length);
        var text = rows[0].textContent;
        if (text.indexOf('/b') === -1) throw new Error('路径不对: ' + text);
        if (text.indexOf('9') === -1) throw new Error('新值缺失: ' + text);
        if (!doc.getElementById('diffReport').classList.contains('show')) throw new Error('面板未显示');
    });

    check('只高亮变更值所在行，其余行保持干净', function () {
        var cms = doc.querySelectorAll('#diffWorkspace .CodeMirror');
        var changed = countMarks(cms[0].CodeMirror, 'cm-value-changed') +
            countMarks(cms[1].CodeMirror, 'cm-value-changed');
        if (changed !== 2) throw new Error('变更行标记: ' + changed);
        var deleted = countMarks(cms[0].CodeMirror, 'cm-deleted');
        if (deleted !== 0) throw new Error('整行删除标记: ' + deleted);
    });

    check('变更值本身被精确标记（左侧旧值、右侧新值）', function () {
        var cms = doc.querySelectorAll('#diffWorkspace .CodeMirror');
        function marks(cm, cls) {
            return cm.getDoc().getAllMarks()
                .filter(function (m) { return String(m.className || '').indexOf(cls) !== -1; })
                .map(function (m) {
                    var span = m.find();
                    return cm.getDoc().getRange(span.from, span.to);
                });
        }
        var oldMarks = marks(cms[0].CodeMirror, 'cm-diff-old');
        var newMarks = marks(cms[1].CodeMirror, 'cm-diff-new');
        if (oldMarks.length !== 1 || oldMarks[0] !== '2') throw new Error('左侧标记: ' + JSON.stringify(oldMarks));
        if (newMarks.length !== 1 || newMarks[0] !== '9') throw new Error('右侧标记: ' + JSON.stringify(newMarks));
    });

    // 两版一致时，面板要给出「无差异」而不是空白
    doc.getElementById('toggleDiffBtn').click();
    await wait(200);
    output.value = '{"a":1,"b":2,"c":{"d":3}}';
    await wait(300);
    doc.getElementById('toggleDiffBtn').click();
    await wait(300);
    check('两版一致时面板给出「无差异」而不是空白', function () {
        var rows = doc.querySelectorAll('#diffReport .diff-row');
        var empty = doc.querySelector('#diffReport .diff-report-empty');
        if (rows.length !== 0) throw new Error('仍有 ' + rows.length + ' 条差异');
        if (!empty) throw new Error('缺少无差异提示');
    });


    // 导航栏新增的「JSON 对比」独立页面
    doc.getElementById('navCompare').click();
    await wait(300);

    check('导航可进入 JSON 对比页', function () {
        if (!doc.getElementById('compareWorkspace').classList.contains('active')) throw new Error('未进入对比页');
        if (!doc.querySelector('.toolbar').classList.contains('hidden')) throw new Error('工具栏未隐藏');
        if (!doc.getElementById('navCompare').classList.contains('active')) throw new Error('导航未高亮');
        if (doc.querySelectorAll('#compareWorkspace .CodeMirror').length !== 2) throw new Error('编辑器数量不对');
    });

    doc.querySelector('.sample-chip[data-sample="user"]').click();
    await wait(400);

    check('示例数据给出 4 处结构化差异', function () {
        var tip = doc.getElementById('compareTip').textContent;
        if (tip.indexOf('4') === -1) throw new Error('提示文案: ' + tip);
        var cms = doc.querySelectorAll('#compareWorkspace .CodeMirror');
        function marks(cm, cls) {
            return cm.getDoc().getAllMarks().filter(function (m) {
                return String(m.className || '').indexOf(cls) !== -1;
            }).length;
        }
        var left = marks(cms[0].CodeMirror, 'cm-diff-old');
        var right = marks(cms[1].CodeMirror, 'cm-diff-new');
        if (left !== 4 || right !== 4) throw new Error('标记数 左' + left + ' 右' + right);
    });

    check('对比页清空后不留标记', function () {
        doc.getElementById('cmpClear').click();
        var cms = doc.querySelectorAll('#compareWorkspace .CodeMirror');
        if (cms[0].CodeMirror.getValue() !== '' || cms[1].CodeMirror.getValue() !== '') throw new Error('内容未清空');
        var marks = cms[0].CodeMirror.getDoc().getAllMarks().filter(function (m) {
            return /cm-diff/.test(m.className || '');
        });
        if (marks.length) throw new Error('仍残留 ' + marks.length + ' 个标记');
    });

    check('非法 JSON 在对比页给出解析错误', function () {
        var cms = doc.querySelectorAll('#compareWorkspace .CodeMirror');
        cms[0].CodeMirror.setValue('{"a":1}');
        cms[1].CodeMirror.setValue('{"a":1,}');
        doc.getElementById('cmpRun').click();
        var tip = doc.getElementById('compareTip');
        if (tip.textContent.indexOf('解析失败') === -1) throw new Error('提示: ' + tip.textContent);
        if (tip.className.indexOf('err') === -1) throw new Error('未标记为错误态');
    });

    // 任意文本模式：示例区换成文本样本，左右整行标记
    doc.querySelector('.compare-tab[data-mode="text"]').click();
    await wait(250);

    check('切到任意文本模式后示例区互换', function () {
        var jsonGroup = doc.getElementById('cmpJsonSamples');
        var textGroup = doc.getElementById('cmpTextSamples');
        if (!jsonGroup.classList.contains('is-hidden')) throw new Error('JSON 示例区仍在显示');
        if (textGroup.classList.contains('is-hidden')) throw new Error('文本示例区未显示');
        if (textGroup.querySelectorAll('.sample-chip').length !== 4) throw new Error('文本示例数量不对');
    });

    doc.querySelector('#cmpTextSamples .sample-chip[data-sample="md"]').click();
    await wait(300);

    check('Markdown 示例按整行标出两侧差异', function () {
        var cms = doc.querySelectorAll('#compareWorkspace .CodeMirror');
        function withCls(cm, prop, cls) {
            var d = cm.getDoc();
            var n = 0;
            for (var i = 0; i < d.lineCount(); i++) {
                var h = d.getLineHandle(i);
                if (h && String(h[prop] || '').indexOf(cls) !== -1) n++;
            }
            return n;
        }
        var del = withCls(cms[0].CodeMirror, 'wrapClass', 'cm-text-del');
        var ins = withCls(cms[1].CodeMirror, 'wrapClass', 'cm-text-ins');
        if (!del) throw new Error('左侧没有删除行');
        if (!ins) throw new Error('右侧没有新增行');
        if (cms[0].CodeMirror.getDoc().getAllMarks().length) throw new Error('文本模式不应有内联标记');
        var tip = doc.getElementById('compareTip').textContent;
        if (tip.indexOf('行不同') === -1) throw new Error('提示文案: ' + tip);
    });

    check('文本示例只放文本、不带 JSON 引号', function () {
        var cms = doc.querySelectorAll('#compareWorkspace .CodeMirror');
        var left = cms[0].CodeMirror.getValue();
        if (left.charAt(0) === '{') throw new Error('左侧仍是 JSON');
        if (left.indexOf('# 订单创建接口') !== 0) throw new Error('左侧不是 Markdown 示例: ' + left.slice(0, 24));
    });

    // 文本模式下贴的是 JSON：仍然逐行标，但要提示可以换成字段级对比
    check('文本模式遇到 JSON 内容会建议切回 JSON 对比', function () {
        var cms = doc.querySelectorAll('#compareWorkspace .CodeMirror');
        cms[0].CodeMirror.setValue('{\n  "a": 1,\n  "b": 2\n}');
        cms[1].CodeMirror.setValue('{\n  "a": 9,\n  "b": 2\n}');
        doc.getElementById('cmpRun').click();
        var tip = doc.getElementById('compareTip').textContent;
        if (tip.indexOf('行不同') === -1) throw new Error('缺少行数统计: ' + tip);
        if (tip.indexOf('JSON') === -1) throw new Error('缺少切换建议: ' + tip);
    });

    doc.querySelector('.compare-tab[data-mode="json"]').click();
    await wait(250);

    check('切回 JSON 模式示例区复原', function () {
        var jsonGroup = doc.getElementById('cmpJsonSamples');
        var textGroup = doc.getElementById('cmpTextSamples');
        if (jsonGroup.classList.contains('is-hidden')) throw new Error('JSON 示例区未复原');
        if (!textGroup.classList.contains('is-hidden')) throw new Error('文本示例区仍在显示');
    });

    check('回到转换页后入口状态复原', function () {
        doc.querySelector('#navConvertMenu a[data-src="json"][data-tgt="yaml"]').click();
        if (doc.getElementById('compareWorkspace').classList.contains('active')) throw new Error('对比页仍在显示');
        if (doc.querySelector('.toolbar').classList.contains('hidden')) throw new Error('工具栏仍隐藏');
        if (doc.getElementById('navCompare').classList.contains('active')) throw new Error('导航仍高亮');
    });


    // 导航栏新增的「SQL 转换」独立页面：批量文本 → IN / NOT IN / 值列表 / INSERT
    doc.getElementById('navSql').click();
    await wait(250);

    check('导航可进入 SQL 生成页', function () {
        if (!doc.getElementById('sqlWorkspace').classList.contains('active')) throw new Error('未进入 SQL 页');
        if (!doc.querySelector('.toolbar').classList.contains('hidden')) throw new Error('工具栏未隐藏');
        if (!doc.getElementById('navSql').classList.contains('active')) throw new Error('导航未高亮');
        if (doc.querySelectorAll('#sqlWorkspace .CodeMirror').length !== 2) throw new Error('编辑器数量不对');
    });

    var sqlCms = doc.querySelectorAll('#sqlWorkspace .CodeMirror');
    sqlCms[0].CodeMirror.setValue('a\nb\na\n123');
    await wait(350);

    check('批量文本生成 IN 列表（去重 + 数字默认也加引号）', function () {
        var out = sqlCms[1].CodeMirror.getValue();
        var want = "IN (\n  'a',\n  'b',\n  '123'\n)";
        if (out !== want) throw new Error('实际输出:\n' + out);
    });

    // 勾上「数字不加引号」要立刻生效，不能等下一次输入
    var numericBox = doc.getElementById('sqlNumeric');
    numericBox.checked = true;
    numericBox.dispatchEvent(new win.Event('change', { bubbles: true }));
    await wait(120);
    check('勾上「数字不加引号」后立刻输出裸数字', function () {
        var out = sqlCms[1].CodeMirror.getValue();
        if (out.indexOf('123') === -1 || out.indexOf("'123'") !== -1) throw new Error('实际输出:\n' + out);
    });

    numericBox.checked = false;
    numericBox.dispatchEvent(new win.Event('change', { bubbles: true }));
    await wait(120);
    check('取消勾选后数字又带上引号', function () {
        var out = sqlCms[1].CodeMirror.getValue();
        if (out.indexOf("'123'") === -1) throw new Error('实际输出:\n' + out);
    });

    check('输入/输出徽标分别显示原始个数与去重后个数', function () {
        var inBadge = doc.getElementById('sqlInCount').textContent;
        var outBadge = doc.getElementById('sqlOutCount').textContent;
        if (inBadge !== '4' || outBadge !== '3') throw new Error('输入 ' + inBadge + ' 输出 ' + outBadge);
        var tip = doc.getElementById('sqlTip').textContent;
        if (tip.indexOf('3') === -1) throw new Error('提示文案: ' + tip);
    });

    doc.querySelector('#sqlTemplates .compare-tab[data-template="notin"]').click();
    await wait(150);

    check('切到 NOT IN 模板', function () {
        var out = sqlCms[1].CodeMirror.getValue();
        if (out.indexOf('NOT IN (') !== 0) throw new Error('实际输出:\n' + out);
        if (!doc.querySelector('#sqlTemplates .compare-tab[data-template="notin"]').classList.contains('active')) {
            throw new Error('模板按钮未高亮');
        }
    });

    doc.querySelector('#sqlQuotes .compare-tab[data-quote="double"]').click();
    await wait(150);

    check('切到双引号后字面量跟着变', function () {
        var out = sqlCms[1].CodeMirror.getValue();
        if (out.indexOf('"a"') === -1) throw new Error('实际输出:\n' + out);
    });

    doc.querySelector('#sqlTemplates .compare-tab[data-template="insert"]').click();
    doc.getElementById('sqlTable').value = 'user';
    doc.getElementById('sqlColumn').value = 'status';
    doc.getElementById('sqlGenerate').click();
    await wait(150);

    check('INSERT 模板才显示表名/列名输入框', function () {
        if (!doc.getElementById('sqlExtra').classList.contains('show')) throw new Error('输入框未显示');
    });

    check('INSERT 语句带表名与列名', function () {
        var out = sqlCms[1].CodeMirror.getValue();
        var want = 'INSERT INTO user (status) VALUES\n  ("a"),\n  ("b"),\n  ("123");';
        if (out !== want) throw new Error('实际输出:\n' + out);
    });

    doc.querySelector('#sqlTemplates .compare-tab[data-template="in"]').click();
    doc.querySelector('#sqlQuotes .compare-tab[data-quote="single"]').click();
    sqlCms[0].CodeMirror.setValue("WHERE id IN ('p-1', 'p-2')");
    await wait(350);

    check('粘贴 IN (...) 片段反过来能拆出干净的值', function () {
        var out = sqlCms[1].CodeMirror.getValue();
        var want = "IN (\n  'p-1',\n  'p-2'\n)";
        if (out !== want) throw new Error('实际输出:\n' + out);
    });

    // 真实场景：整段 SQL 粘回来，括号后面还挂着 and service_name='iss-sts';
    sqlCms[0].CodeMirror.setValue("WHERE code IN (\n'p-1', 'p-2'\n) and service_name='iss-sts';");
    await wait(350);
    check('括号后面的 and / 分号不会被当成最后一个值', function () {
        var out = sqlCms[1].CodeMirror.getValue();
        if (out.indexOf('service_name') !== -1) throw new Error('尾句子句被当成值:\n' + out);
        var badge = doc.getElementById('sqlOutCount').textContent;
        if (badge !== '2') throw new Error('值个数 ' + badge);
    });

    check('输出栏是只读的（防止改坏生成结果）', function () {
        var ro = sqlCms[1].CodeMirror.getOption('readOnly');
        if (!ro) throw new Error('输出栏未设只读');
    });

    check('切换语言后 SQL 页文案跟着变', function () {
        function pick(name) {
            return [].slice.call(doc.querySelectorAll('#langMenu > *')).filter(function (el) {
                return el.textContent.indexOf(name) !== -1;
            })[0];
        }
        var en = pick('English');
        if (!en) throw new Error('找不到 English 菜单项');
        en.click();
        var label = doc.querySelector('#sqlWorkspace [data-i18n="sqlInputLabel"]');
        if (label.textContent !== 'Values') throw new Error('输入栏标题: ' + label.textContent);
        var gen = doc.querySelector('#sqlGenerate');
        if (gen.textContent.trim() !== 'Generate') throw new Error('生成按钮: ' + gen.textContent);
        var zh = pick('简体中文');
        if (!zh) throw new Error('找不到中文菜单项');
        zh.click();
        if (doc.querySelector('#sqlWorkspace [data-i18n="sqlInputLabel"]').textContent !== '批量文本') {
            throw new Error('切回中文失败');
        }
    });

    check('SQL 页清空后回到待输入提示', function () {
        doc.getElementById('sqlClear').click();
        if (sqlCms[0].CodeMirror.getValue() !== '') throw new Error('输入未清空');
        if (sqlCms[1].CodeMirror.getValue() !== '') throw new Error('输出未清空');
        if (doc.getElementById('sqlOutCount').textContent !== '0') throw new Error('计数未归零');
    });

    check('离开 SQL 页后入口状态复原', function () {
        doc.querySelector('#navConvertMenu a[data-src="json"][data-tgt="yaml"]').click();
        if (doc.getElementById('sqlWorkspace').classList.contains('active')) throw new Error('SQL 页仍在显示');
        if (doc.querySelector('.toolbar').classList.contains('hidden')) throw new Error('工具栏仍隐藏');
        if (doc.getElementById('navSql').classList.contains('active')) throw new Error('导航仍高亮');
    });

    // ---- 表格转 JSON 页：Excel / CSV → JSON ----
    doc.getElementById('navSheet').click();
    await wait(200);

    check('导航可进入表格转 JSON 页', function () {
        if (!doc.getElementById('sheetWorkspace').classList.contains('active')) throw new Error('未进入表格页');
        if (!doc.querySelector('.toolbar').classList.contains('hidden')) throw new Error('工具栏未隐藏');
        if (!doc.getElementById('navSheet').classList.contains('active')) throw new Error('导航未高亮');
        if (!doc.querySelector('#sheetWorkspace .CodeMirror')) throw new Error('输出编辑器未创建');
    });

    doc.querySelector('#sheetSamples .sample-chip[data-sample="simple"]').click();
    await wait(400);

    check('示例 CSV 转成 JSON（数字自动识别）', function () {
        var cm = doc.querySelector('#sheetWorkspace .CodeMirror').CodeMirror;
        var arr = JSON.parse(cm.getValue());
        if (arr.length !== 2) throw new Error('记录数 ' + arr.length);
        if (arr[0].姓名 !== '张三' || arr[0].年龄 !== 18) throw new Error('内容: ' + JSON.stringify(arr[0]));
        if (doc.getElementById('sheetOutCount').textContent !== '2') throw new Error('计数徽标未更新');
    });

    check('预览表格显示表头与行列徽标', function () {
        var heads = [].map.call(doc.querySelectorAll('#sheetTable th'), function (th) { return th.textContent; });
        if (heads.join('|') !== '姓名|年龄|城市') throw new Error('表头: ' + heads.join(','));
        if (doc.querySelectorAll('#sheetTable tbody tr').length !== 2) throw new Error('预览行数不对');
        if (doc.getElementById('sheetInCount').textContent.indexOf('3') === -1) throw new Error('行列徽标: ' + doc.getElementById('sheetInCount').textContent);
    });

    // 关掉表头再打开：两条路径都跑一遍
    var headerBox = doc.getElementById('sheetHeader');
    headerBox.checked = false;
    headerBox.dispatchEvent(new win.Event('change', { bubbles: true }));
    await wait(350);

    check('关掉「首行为表头」后改用 column_N', function () {
        var arr = JSON.parse(doc.querySelector('#sheetWorkspace .CodeMirror').CodeMirror.getValue());
        if (!arr[0].column_1) throw new Error('键名: ' + Object.keys(arr[0]).join(','));
        if (arr.length !== 3) throw new Error('记录数 ' + arr.length);
    });

    headerBox.checked = true;
    headerBox.dispatchEvent(new win.Event('change', { bubbles: true }));
    await wait(350);

    check('导出按钮生成 .json 下载', function () {
        var blobs = [];
        var clicked = null;
        var origCreate = win.URL.createObjectURL;
        var origRevoke = win.URL.revokeObjectURL;
        var origClick = win.HTMLAnchorElement.prototype.click;
        win.URL.createObjectURL = function (blob) { blobs.push(blob); return 'https://example.com/x.json'; };
        win.URL.revokeObjectURL = function () {};
        win.HTMLAnchorElement.prototype.click = function () { clicked = { href: this.getAttribute('href'), download: this.download }; };
        try {
            doc.getElementById('sheetExport').click();
        } finally {
            win.URL.createObjectURL = origCreate;
            win.URL.revokeObjectURL = origRevoke;
            win.HTMLAnchorElement.prototype.click = origClick;
        }
        if (!clicked) throw new Error('没有触发下载');
        if (!/\.json$/.test(clicked.download)) throw new Error('文件名: ' + clicked.download);
        if (!blobs.length) throw new Error('没有生成 Blob');
    });

    // 上一轮点击是异步收尾的（按钮 disabled 到 finally 才恢复），先等一拍再点
    await wait(150);

    // 宿主（DBX）里有 fileTransfer 时不能再走 <a download>，否则点了没反应
    var hostSave = { name: '', chunks: [], finished: false, cancelled: false };
    win.dbxPlugin = {
        capabilities: { fileTransfer: {} },
        fileTransfer: {
            beginSave: function (opts) {
                hostSave.name = opts.name;
                return Promise.resolve({ handleId: 'h1', chunkBytes: 16 });
            },
            write: function (handleId, offset, base64) {
                hostSave.chunks.push({ offset: offset, base64: base64 });
                return Promise.resolve(true);
            },
            finish: function () { hostSave.finished = true; return Promise.resolve(true); },
            cancel: function () { hostSave.cancelled = true; return Promise.resolve(true); }
        }
    };

    check('宿主可用时走 fileTransfer 保存', function () {
        var anchorClicked = false;
        var origClick = win.HTMLAnchorElement.prototype.click;
        win.HTMLAnchorElement.prototype.click = function () { anchorClicked = true; };
        try {
            doc.getElementById('sheetExport').click();
        } finally {
            win.HTMLAnchorElement.prototype.click = origClick;
        }
        return new Promise(function (resolve) { setTimeout(resolve, 250); }).then(function () {
            if (anchorClicked) throw new Error('仍然走了浏览器下载');
            if (!hostSave.finished) throw new Error('没有调用 finish');
            if (hostSave.cancelled) throw new Error('不应取消句柄');
            if (!/\.json$/.test(hostSave.name)) throw new Error('文件名: ' + hostSave.name);
            if (hostSave.chunks.length < 2) throw new Error('没有分块写入');
            var bytes = Buffer.concat(hostSave.chunks.map(function (c) { return Buffer.from(c.base64, 'base64'); }));
            var text = bytes.toString('utf8');
            var arr = JSON.parse(text);
            if (arr.length !== 2 || arr[0].姓名 !== '张三') throw new Error('内容: ' + text.slice(0, 60));
            if (doc.getElementById('sheetExport').disabled) throw new Error('按钮没有恢复');
        });
    });

    // ---- 条数限制：丢一个 150 行的 CSV 进来，再限制成 100 条 ----
    var limitRows = ['id,name'];
    for (var li = 1; li <= 150; li++) limitRows.push(li + ',用户' + li);
    var limitFile = new win.File([limitRows.join('\n')], 'limit.csv');
    var limitDrop = new win.Event('drop', { bubbles: true });
    limitDrop.dataTransfer = { files: [limitFile] };
    doc.getElementById('sheetTableWrap').dispatchEvent(limitDrop);
    await wait(800);

    // 「最多条数」是自绘下拉（跟顶栏 从/转为 同一套样式），点选项即生效
    function pickSheetLimit(value) {
        doc.querySelector('#sheetLimit .custom-option[data-value="' + value + '"]').click();
    }

    pickSheetLimit('100');
    await wait(800);

    check('「最多条数」限制转换与预览', function () {
        var arr = JSON.parse(doc.querySelector('#sheetWorkspace .CodeMirror').CodeMirror.getValue());
        if (arr.length !== 100) throw new Error('记录数 ' + arr.length);
        if (doc.getElementById('sheetOutCount').textContent !== '100') throw new Error('徽标: ' + doc.getElementById('sheetOutCount').textContent);
        if (doc.querySelectorAll('#sheetTable tbody tr').length !== 100) throw new Error('预览行数没跟着限制');
        var tip = doc.getElementById('sheetTip').textContent;
        if (tip.indexOf('150') === -1) throw new Error('提示没说明总数: ' + tip);
    });

    check('「最多条数」是自绘下拉，跟顶栏下拉一套样式', function () {
        if (doc.querySelector('#sheetLimit select')) throw new Error('还在用原生 select');
        var label = doc.querySelector('#sheetLimit .custom-select-trigger .label');
        if (label.textContent.trim() !== '100') throw new Error('触发器没显示当前值: ' + label.textContent);
        if (doc.querySelectorAll('#sheetLimit .custom-option').length !== 6) throw new Error('选项数不对');
    });

    check('下拉菜单贴在触发器下方（.custom-select 自己定位）', function () {
        var css = CSS_TEXT;
        // 以前只有 .select-group 带 relative，表格页这个下拉没有定位祖先，
        // 菜单被算到页面底部、再被 overflow: hidden 裁掉，点了只有箭头翻转
        if (!/\.custom-select\s*\{[^}]*position:\s*relative/.test(css)) {
            throw new Error('.custom-select 缺 position: relative');
        }
        var trig = doc.querySelector('#sheetLimit .custom-select-trigger');
        var menu = doc.querySelector('#sheetLimit .custom-select-options');
        trig.click();
        if (!menu.classList.contains('open')) throw new Error('点开没加 open');
        trig.click();
        if (menu.classList.contains('open')) throw new Error('再点一下没关上');
    });

    pickSheetLimit('0');
    await wait(800);

    doc.querySelector('#sheetFormat .compare-tab[data-format="compact"]').click();
    await wait(300);

    check('输出可切成紧凑格式（无缩进）', function () {
        var value = doc.querySelector('#sheetWorkspace .CodeMirror').CodeMirror.getValue();
        if (value.indexOf('\n{') === -1) throw new Error('仍是缩进格式: ' + JSON.stringify(value.slice(0, 24)));
        JSON.parse(value);
    });

    doc.querySelector('#sheetFormat .compare-tab[data-format="pretty"]').click();
    await wait(300);

    check('切回格式化后恢复 2 空格缩进', function () {
        var value = doc.querySelector('#sheetWorkspace .CodeMirror').CodeMirror.getValue();
        if (value.indexOf('\n  {') === -1) throw new Error('缩进没回来: ' + JSON.stringify(value.slice(0, 24)));
        delete win.dbxPlugin;
    });

    // ---- 输出方式：JSON / SQL Insert ----
    doc.querySelector('#sheetOutputMode .compare-tab[data-mode="sql"]').click();
    await wait(300);

    check('可切换到 SQL Insert 输出', function () {
        var value = doc.querySelector('#sheetWorkspace .CodeMirror').CodeMirror.getValue();
        if (value.indexOf('INSERT INTO your_table_name (id, name) VALUES') !== 0) {
            throw new Error('SQL 头: ' + value.slice(0, 80));
        }
        if (value.indexOf("(1, '用户1')") === -1) throw new Error('元组: ' + value.slice(0, 120));
        if (doc.getElementById('sheetTableNameWrap').hidden) throw new Error('表名输入框没显示');
        if (doc.getElementById('sheetOutLabel').textContent.indexOf('SQL') === -1) {
            throw new Error('标题没跟着变: ' + doc.getElementById('sheetOutLabel').textContent);
        }
        if (doc.getElementById('sheetExport').textContent.indexOf('SQL') === -1) throw new Error('导出按钮文案没变');
        if (doc.getElementById('sheetFormat').style.display === 'none') throw new Error('SQL 模式下也要保留格式化开关');
    });

    doc.getElementById('sheetTableName').value = 'route_table';
    doc.getElementById('sheetTableName').dispatchEvent(new win.Event('change', { bubbles: true }));
    await wait(350);

    check('改表名后 SQL 重新生成', function () {
        var value = doc.querySelector('#sheetWorkspace .CodeMirror').CodeMirror.getValue();
        if (value.indexOf('INSERT INTO route_table') !== 0) throw new Error(value.slice(0, 60));
    });

    doc.querySelector('#sheetFormat .compare-tab[data-format="compact"]').click();
    await wait(350);

    check('SQL 也能切紧凑（整句一行）', function () {
        var value = doc.querySelector('#sheetWorkspace .CodeMirror').CodeMirror.getValue();
        if (value.indexOf(' VALUES (') === -1) throw new Error('紧凑后应是 VALUES (' + value.slice(0, 80));
        if (value.indexOf('\n(') !== -1) throw new Error('还有换行元组');
        if (value.indexOf(';') === -1) throw new Error('缺少分号');
    });

    doc.querySelector('#sheetFormat .compare-tab[data-format="pretty"]').click();
    await wait(350);

    doc.querySelector('#sheetOutputMode .compare-tab[data-mode="json"]').click();
    await wait(300);

    check('切回 JSON 后标签与内容一起复原', function () {
        var value = doc.querySelector('#sheetWorkspace .CodeMirror').CodeMirror.getValue();
        if (value.charAt(0) !== '[') throw new Error('不是 JSON: ' + value.slice(0, 20));
        if (!doc.getElementById('sheetTableNameWrap').hidden) throw new Error('表名输入框没藏起来');
        if (doc.getElementById('sheetOutLabel').textContent.indexOf('JSON') === -1) throw new Error('标题没复原');
    });

    // ---- 第二行是注释（中英双表头）：只是「可能」，要用户点一下才跳过 ----
    var noteCsv = 'id,method,path\n编号,请求方法,路径\n1,GET,/a\n2,POST,/b';
    var noteDrop = new win.Event('drop', { bubbles: true });
    noteDrop.dataTransfer = { files: [new win.File([noteCsv], 'note.csv')] };
    doc.getElementById('sheetTableWrap').dispatchEvent(noteDrop);
    await wait(800);

    function sheetRecords() {
        return JSON.parse(doc.querySelector('#sheetWorkspace .CodeMirror').CodeMirror.getValue());
    }

    check('第二行说明默认仍按数据处理（只提示，不擅自跳过）', function () {
        if (sheetRecords().length !== 3) throw new Error('记录数 ' + sheetRecords().length);
        if (doc.getElementById('sheetNoteHint').hidden) throw new Error('没给出「第二行像注释」的提示');
    });

    doc.getElementById('sheetNoteHint').click();
    await wait(800);

    check('点提示后跳过第二行', function () {
        var arr = sheetRecords();
        if (arr.length !== 2) throw new Error('记录数 ' + arr.length);
        if (arr[0].id !== 1 || arr[0].method !== 'GET') throw new Error('首条: ' + JSON.stringify(arr[0]));
        if (doc.getElementById('sheetTip').textContent.indexOf('跳过') === -1) throw new Error('提示没说明已跳过');
        if (!doc.getElementById('sheetNoteHint').hidden) throw new Error('勾选后提示应消失');
    });

    doc.getElementById('sheetSkipNote').click();
    await wait(800);

    check('取消勾选后第二行恢复成数据', function () {
        if (sheetRecords().length !== 3) throw new Error('记录数 ' + sheetRecords().length);
    });

    // ---- 预览表横向滚动 + 双击看详情 ----
    check('预览表按内容撑开，带常驻的横向滚动条', function () {
        var css = CSS_TEXT;
        if (css.indexOf('.sheet-hscroll-thumb') === -1) throw new Error('没有自绘横向滚动条样式');
        if (!/\.sheet-table\s*\{[^}]*width:\s*max-content/.test(css)) throw new Error('表格没按内容撑开');
        if (!doc.querySelector('#sheetTableWrap table')) throw new Error('预览表丢了');
        if (!doc.getElementById('sheetHScroll')) throw new Error('缺横向滚动条节点');
        if (!doc.getElementById('sheetHScroll').hidden) throw new Error('没有横向溢出时不该出现');
    });

    var firstCell = doc.querySelector('#sheetTable tbody tr td');
    firstCell.dispatchEvent(new win.MouseEvent('dblclick', { bubbles: true }));

    check('双击单元格弹出详情（列名 + 全文 + 整行）', function () {
        var pop = doc.getElementById('sheetCellPop');
        if (pop.hidden) throw new Error('弹层没打开');
        var title = doc.getElementById('sheetCellPopTitle').textContent;
        if (title.indexOf('id') !== 0) throw new Error('标题: ' + title);
        if (!doc.getElementById('sheetCellPopValue').textContent) throw new Error('没显示单元格内容');
        if (doc.querySelectorAll('#sheetCellPopRow tr').length !== 3) throw new Error('整行数据列数不对');
    });

    doc.getElementById('sheetCellPopClose').click();

    check('详情弹层可关闭', function () {
        if (!doc.getElementById('sheetCellPop').hidden) throw new Error('没关掉');
    });

    // 大文件：直接造一个 21 MB 的 File，走 drop 入口
    var bigFile = new win.File(['x'], 'big.csv');
    Object.defineProperty(bigFile, 'size', { value: 21 * 1024 * 1024 });
    var dropEvent = new win.Event('drop', { bubbles: true });
    dropEvent.dataTransfer = { files: [bigFile] };
    doc.getElementById('sheetTableWrap').dispatchEvent(dropEvent);
    await wait(150);

    check('超过 20 MB 的文件被拦下', function () {
        var tip = doc.getElementById('sheetTip').textContent;
        if (tip.indexOf('20 MB') === -1) throw new Error('提示: ' + tip);
    });

    var oldFile = new win.File(['x'], 'legacy.xls');
    var dropOld = new win.Event('drop', { bubbles: true });
    dropOld.dataTransfer = { files: [oldFile] };
    doc.getElementById('sheetTableWrap').dispatchEvent(dropOld);
    await wait(150);

    check('旧版 .xls 给出另存提示', function () {
        var tip = doc.getElementById('sheetTip').textContent;
        if (tip.indexOf('.xlsx') === -1) throw new Error('提示: ' + tip);
    });

    doc.getElementById('sheetClear').click();

    check('清空后回到待开始状态', function () {
        var cm = doc.querySelector('#sheetWorkspace .CodeMirror').CodeMirror;
        if (cm.getValue() !== '') throw new Error('输出未清空');
        if (doc.getElementById('sheetOutCount').textContent !== '0') throw new Error('计数未归零');
        if (doc.getElementById('sheetEmpty').classList.contains('hidden')) throw new Error('空状态未恢复');
    });

    check('离开表格页后入口状态复原', function () {
        doc.querySelector('#navConvertMenu a[data-src="json"][data-tgt="yaml"]').click();
        if (doc.getElementById('sheetWorkspace').classList.contains('active')) throw new Error('表格页仍在显示');
        if (doc.querySelector('.toolbar').classList.contains('hidden')) throw new Error('工具栏仍隐藏');
        if (doc.getElementById('navSheet').classList.contains('active')) throw new Error('导航仍高亮');
    });

    // ---------------- 图片 ↔ Base64 ----------------
    var imgWs = doc.getElementById('imageWorkspace');
    var imgDrop = doc.getElementById('imgDrop');
    var imgInputWrap = doc.getElementById('imgInputWrap');
    var imgOutputWrap = doc.getElementById('imgOutputWrap');
    var imgFormatTabs = doc.getElementById('imgFormat');
    var imgSampleWrap = doc.getElementById('imgSampleWrap');
    var imgImportWrap = doc.getElementById('imgImportWrap');
    var imgImportBtn = doc.getElementById('imgImport');
    var imgTextInput = doc.getElementById('imgTextInput');
    var imgCopyBtn = doc.getElementById('imgCopy');
    var imgTip = doc.getElementById('imgTip');
    var imgMetaB64 = doc.getElementById('imgMetaB64');
    var imgOutBadge = doc.getElementById('imgOutBadge');

    // 1x1 PNG：用来验证「裸 Base64 直接解析成图片」
    var PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    check('导航可进入图片 Base64 页', function () {
        doc.getElementById('navImage').click();
        if (!imgWs.classList.contains('active')) throw new Error('图片页没显示');
        if (!doc.querySelector('.toolbar').classList.contains('hidden')) throw new Error('工具栏没隐藏');
        if (!doc.getElementById('navImage').classList.contains('active')) throw new Error('导航没高亮');
    });

    check('默认是编码页：拖拽区 + 格式页签 + 示例按钮都在', function () {
        if (imgDrop.hidden) throw new Error('拖拽区被藏了');
        if (!imgInputWrap.hidden) throw new Error('解码用的输入框不该显示');
        if (imgOutputWrap.hidden) throw new Error('输出区不该藏');
        if (imgFormatTabs.hidden) throw new Error('格式页签不该藏');
        if (imgSampleWrap.hidden) throw new Error('示例按钮不该藏');
        if (imgCopyBtn.hidden) throw new Error('复制按钮不该藏');
        if (doc.getElementById('imgPaste')) throw new Error('粘贴按钮已经移除，不该还在');
    });

    check('「纯 Base64」页签写的是纯字符串，导出也跟着变', function () {
        var rawTab = imgFormatTabs.querySelector('[data-format="raw"]');
        if (!rawTab) throw new Error('缺少 raw 页签');
        if (rawTab.textContent.indexOf('纯 Base64') < 0) throw new Error('页签文案没写清是纯 Base64：' + rawTab.textContent);
        rawTab.click();
        var title = doc.getElementById('imgExport').title || '';
        if (title.indexOf('纯 Base64') < 0) throw new Error('导出提示没跟着切：' + title);
        if (title.indexOf('.base64.txt') < 0) throw new Error('纯 Base64 应该导出成 .base64.txt：' + title);
        imgFormatTabs.querySelector('[data-format="datauri"]').click();
    });

    check('空状态引导用快捷键粘贴（按钮已去掉）', function () {
        var hint = doc.getElementById('imgEmpty').textContent;
        if (hint.indexOf('Ctrl') < 0) throw new Error('没提示 Ctrl/Cmd+V：' + hint);
    });

    check('切到解码页：输入框出现、拖拽区与格式页签藏起来', function () {
        doc.querySelector('#imgModeTabs [data-mode="decode"]').click();
        if (!imgDrop.hidden) throw new Error('解码页还显示拖拽区');
        if (imgInputWrap.hidden) throw new Error('Base64 输入框没出来');
        if (!imgOutputWrap.hidden) throw new Error('编码结果区不该显示');
        if (!imgFormatTabs.hidden) throw new Error('格式页签应该藏起来');
        if (!imgSampleWrap.hidden) throw new Error('示例按钮应该藏起来');
        if (!imgCopyBtn.hidden) throw new Error('复制按钮只属于编码页');
        if (doc.getElementById('imgPaste')) throw new Error('解码页也不该有粘贴按钮');
    });

    // 1x1 PNG：用来验证「裸 Base64 直接解析成图片」
    var PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    var imgTextarea = doc.getElementById('imgInput');
    imgTextarea.value = PNG_B64;
    imgTextarea.dispatchEvent(new win.Event('input', { bubbles: true }));
    await wait(600);

    check('裸 Base64（没有 data: 前缀）被自动解析成图片', function () {
        if (imgTip.textContent.indexOf('已识别') < 0) throw new Error('没识别出来：' + imgTip.textContent);
        if (imgTip.textContent.indexOf('裸 Base64') < 0) throw new Error('没标出是裸 Base64：' + imgTip.textContent);
        if (imgTip.textContent.indexOf('image/png') < 0) throw new Error('没嗅探出 PNG：' + imgTip.textContent);
        var src = doc.getElementById('imgDecodeImg').getAttribute('src') || '';
        if (src.indexOf('data:image/png;base64,') !== 0) throw new Error('预览图不是 PNG DataURI');
        if (imgOutBadge.textContent === '—') throw new Error('输出徽标没更新');
        if (imgMetaB64.textContent.indexOf('Base64') < 0) throw new Error('字符数没显示');
    });

    imgTextarea.value = 'data:image/png;base64,' + PNG_B64;
    imgTextarea.dispatchEvent(new win.Event('input', { bubbles: true }));
    await wait(600);

    check('带 data: 前缀的 DataURI 同样能解，且标注为 DataURI', function () {
        if (imgTip.textContent.indexOf('DataURI') < 0) throw new Error('没标出 DataURI：' + imgTip.textContent);
        if (imgTip.textContent.indexOf('image/png') < 0) throw new Error('没识别出 PNG');
    });

    check('解码页有「导入文件」，编码页不显示', function () {
        if (imgImportWrap.hidden) throw new Error('解码页没显示导入入口');
        if (!imgImportBtn || imgImportBtn.hidden) throw new Error('导入按钮不可见');
        var accept = imgTextInput.getAttribute('accept') || '';
        if (accept.indexOf('.txt') < 0 || accept.indexOf('.b64') < 0) {
            throw new Error('accept 没放开文本类型：' + accept);
        }
        doc.querySelector('#imgModeTabs [data-mode="encode"]').click();
        if (!imgImportWrap.hidden) throw new Error('编码页不该显示导入入口（那里有选择图片）');
        doc.querySelector('#imgModeTabs [data-mode="decode"]').click();
        if (imgImportWrap.hidden) throw new Error('切回解码页后导入入口没回来');
    });

    // 导入闭环：图片页导出的 .txt（DataURI）能被解码页直接读回来
    var importFile = new win.File(['data:image/png;base64,' + PNG_B64], 'exported.txt', { type: 'text/plain' });
    Object.defineProperty(imgTextInput, 'files', { value: [importFile], configurable: true });
    imgTextInput.dispatchEvent(new win.Event('change'));
    await wait(600);

    check('导入 .txt 文件：内容进输入框、自动解析成图片', function () {
        if (imgTextarea.value.indexOf('data:image/png;base64,') !== 0) {
            throw new Error('文件内容没读进输入框：' + String(imgTextarea.value).slice(0, 40));
        }
        var src = doc.getElementById('imgDecodeImg').getAttribute('src') || '';
        if (src.indexOf('data:image/png;base64,') !== 0) throw new Error('导入后没解析出图片');
        if (imgTip.textContent.indexOf('image/png') < 0) throw new Error('没嗅探出 PNG：' + imgTip.textContent);
    });

    check('导入非文本文件被拦下（不硬读成乱码）', function () {
        var bin = new win.File([new Uint8Array([1, 2, 3, 4])], 'blob.bin', { type: 'application/octet-stream' });
        Object.defineProperty(imgTextInput, 'files', { value: [bin], configurable: true });
        imgTextInput.dispatchEvent(new win.Event('change'));
        if (imgTip.textContent.indexOf('不是文本文件') < 0) throw new Error('提示不对：' + imgTip.textContent);
        if (imgTip.className.indexOf('err') < 0) throw new Error('没标成错误态');
    });

    imgTextarea.value = 'hello world ###';
    imgTextarea.dispatchEvent(new win.Event('input', { bubbles: true }));
    await wait(600);

    check('普通文本给出「识别不出 Base64」而不是硬解', function () {
        if (imgTip.textContent.indexOf('识别不出') < 0) throw new Error('提示不对：' + imgTip.textContent);
        if (imgTip.className.indexOf('err') < 0) throw new Error('没标成错误态');
    });

    check('解码页清空后回到待输入提示', function () {
        doc.getElementById('imgClear').click();
        if (imgTextarea.value !== '') throw new Error('输入框没清空');
        if (imgTip.textContent.indexOf('贴一段 Base64') < 0) throw new Error('提示没复位：' + imgTip.textContent);
        if (imgOutBadge.textContent !== '—') throw new Error('徽标没复位');
    });

    check('宿主补的 tooltip 会被摘掉（中文界面不再冒出英文 Paste）', function () {
        // 模拟宿主给按钮补 title 的两种时机：加载后补（观察器）与移入时补（捕获阶段）
        var pickTop = doc.getElementById('imgPickTop');
        pickTop.setAttribute('title', 'Paste');
        pickTop.dispatchEvent(new win.Event('pointerover', { bubbles: true }));
        if (pickTop.hasAttribute('title')) throw new Error('移入时没有摘掉宿主补的 title：' + pickTop.getAttribute('title'));
        // 我们自己写的 data-i18n-title 要留着（转换页「复制」按钮）
        if (!doc.getElementById('copyBtn').getAttribute('title')) throw new Error('自带文案的按钮提示被误删');
    });

    check('离开图片页后入口状态复原', function () {
        doc.querySelector('#navConvertMenu a[data-src="yaml"][data-tgt="json"]').click();
        if (imgWs.classList.contains('active')) throw new Error('图片页仍在显示');
        if (doc.querySelector('.toolbar').classList.contains('hidden')) throw new Error('工具栏仍隐藏');
        if (doc.getElementById('navImage').classList.contains('active')) throw new Error('导航仍高亮');
        // 复位成默认的 json→yaml：后面的导航用例按这个状态断言触发器文案
        doc.querySelector('#navConvertMenu a[data-src="json"][data-tgt="yaml"]').click();
    });

    check('纯 Base64 输出不带 data: 前缀（可被解码页原样吃回去）', function () {
        var raw = win.DBXImg.buildText(PNG_B64, 'image/png', 'raw');
        if (raw !== PNG_B64) throw new Error('raw 输出被改动了');
        var parsed = win.DBXImg.parseInput(raw);
        if (parsed.kind !== 'base64') throw new Error('导出的纯 Base64 反解不回来：' + parsed.kind);
        if (parsed.base64 !== PNG_B64) throw new Error('往返后内容不一致');
    });


    // ---------------- 代码生成：JSON / SQL DDL → TS / Go / Java / Python ----------------
    var codeWs = doc.getElementById('codeWorkspace');
    var codeInput = doc.getElementById('codeInput');
    var codeOutput = doc.getElementById('codeOutput');
    var codeRoot = doc.getElementById('codeRoot');
    var codeTip = doc.getElementById('codeTip');
    var codeOutBadge = doc.getElementById('codeOutBadge');
    var codeInBadge = doc.getElementById('codeInBadge');

    function codeEditors() {
        return doc.querySelectorAll('#codeWorkspace .CodeMirror');
    }

    check('编辑器懒创建：没进过这一页时不付代价', function () {
        if (codeEditors().length !== 0) throw new Error('还没进页面就已经有 ' + codeEditors().length + ' 个编辑器');
    });

    function typeIn(el, value) {
        el.value = value;
        el.dispatchEvent(new win.Event('input', { bubbles: true }));
    }

    check('导航可进入代码生成页', function () {
        doc.getElementById('navCodegen').click();
        if (!codeWs.classList.contains('active')) throw new Error('代码页没显示');
        if (!doc.querySelector('.toolbar').classList.contains('hidden')) throw new Error('工具栏没隐藏');
        if (!doc.getElementById('navCodegen').classList.contains('active')) throw new Error('导航没高亮');
    });

    check('空着进来自动装一份示例并立刻出 TypeScript', function () {
        if (!codeInput.value.trim()) throw new Error('没自动装示例');
        if (codeOutput.value.indexOf('export interface') !== 0) {
            throw new Error('默认没出 TypeScript：' + codeOutput.value.slice(0, 60));
        }
        var langs = [].map.call(doc.querySelectorAll('#codeLangTabs .compare-tab'), function (t) {
            return t.dataset.lang;
        });
        if (langs.join(',') !== 'ts,go,java,python') throw new Error('语言页签: ' + langs.join(','));
        if (codeOutBadge.textContent !== 'TypeScript') throw new Error('输出徽标: ' + codeOutBadge.textContent);
        if (codeInBadge.textContent !== 'JSON') throw new Error('输入徽标: ' + codeInBadge.textContent);
    });

    check('输入输出都换成 CodeMirror 编辑器', function () {
        if (codeEditors().length !== 2) throw new Error('编辑器数量 ' + codeEditors().length + '，应当有输入 + 输出两个');
        if (!doc.querySelector('#codeWorkspace .CodeMirror-scroll')) throw new Error('没有滚动层，CM 没初始化完');
        if (codeInput.style.display === '' && codeInput.parentElement.querySelector('.CodeMirror')) {
            // CM 会把原 textarea 藏起来，别再指望靠它显示内容
            throw new Error('原 textarea 没被隐藏，会出现两坨内容');
        }
    });

    check('切语言即时重新生成，徽标跟着走', function () {
        doc.querySelector('#codeLangTabs [data-lang="go"]').click();
        if (codeOutput.value.indexOf('package model') !== 0) throw new Error('没切到 Go：' + codeOutput.value.slice(0, 40));
        if (codeOutBadge.textContent !== 'Go') throw new Error('徽标没跟着切');
        doc.querySelector('#codeLangTabs [data-lang="java"]').click();
        if (codeOutput.value.indexOf('public class') < 0) throw new Error('没切到 Java');
        doc.querySelector('#codeLangTabs [data-lang="python"]').click();
        if (codeOutput.value.indexOf('from __future__') !== 0) throw new Error('没切到 Python');
        doc.querySelector('#codeLangTabs [data-lang="ts"]').click();
    });

    typeIn(codeRoot, 'MyDto');
    await wait(300);

    check('根类型名跟着输入框走', function () {
        if (codeOutput.value.indexOf('interface MyDto') < 0) throw new Error('没用上自定义类型名：' + codeOutput.value.slice(0, 80));
    });

    typeIn(codeRoot, '');
    typeIn(codeInput, '{"id":1,"user_name":"ada"}');
    await wait(300);

    check('输入的 JSON 被推断成模型，snake_case 键保持原样', function () {
        if (codeOutput.value.indexOf('user_name: string;') < 0) {
            throw new Error('JSON 的键不该被改名：' + codeOutput.value);
        }
        if (codeTip.textContent.indexOf('1') < 0) throw new Error('没给出类型/字段统计：' + codeTip.textContent);
    });

    typeIn(codeInput, '{oops');
    await wait(300);

    check('坏 JSON 给出错误提示且不产出代码', function () {
        if (codeOutput.value !== '') throw new Error('出错还留着旧结果');
        if (codeTip.textContent.indexOf('解析失败') < 0) throw new Error('提示不是「JSON 解析失败」：' + codeTip.textContent);
        if (codeTip.className.indexOf('err') < 0) throw new Error('没标成错误态');
    });

    // 换页签只在「空着 / 内容还是示例」时自动装新示例，所以先清掉刚才的坏 JSON
    typeIn(codeInput, '');
    await wait(250);

    check('切到 DDL 页签：标题、徽标、示例都换成 DDL 的', function () {
        doc.querySelector('#codeSourceTabs [data-source="ddl"]').click();
        if (codeInBadge.textContent !== 'DDL') throw new Error('输入徽标: ' + codeInBadge.textContent);
        if (codeInput.value.indexOf('CREATE TABLE') < 0) throw new Error('没换上 DDL 示例');
        if (doc.getElementById('codeInLabel').textContent.indexOf('CREATE TABLE') < 0) {
            throw new Error('输入区标题没换：' + doc.getElementById('codeInLabel').textContent);
        }
        if (doc.getElementById('codeJsonSamples').classList.contains('is-hidden') === false) {
            throw new Error('JSON 示例组该藏起来');
        }
    });

    check('DDL 列名转小驼峰、表注释带出来', function () {
        if (codeOutput.value.indexOf('userName: string;') < 0) {
            throw new Error('DDL 列名没转小驼峰：' + codeOutput.value);
        }
        if (codeOutput.value.indexOf('用户表') < 0) throw new Error('表注释没带出来');
    });

    typeIn(codeInput, 'select 1 from dual');
    await wait(300);

    check('DDL 里没有 CREATE TABLE 时给出对应提示', function () {
        if (codeOutput.value !== '') throw new Error('出错还留着旧结果');
        if (codeTip.textContent.indexOf('CREATE TABLE') < 0) {
            throw new Error('提示没提到 CREATE TABLE：' + codeTip.textContent);
        }
        if (codeTip.className.indexOf('err') < 0) throw new Error('没标成错误态');
    });

    check('清空后回到待输入提示', function () {
        doc.getElementById('codeClear').click();
        if (codeInput.value !== '') throw new Error('输入框没清空');
        if (codeOutput.value !== '') throw new Error('输出没清空');
        if (codeTip.textContent.indexOf('输入即生成') < 0) throw new Error('提示没复位：' + codeTip.textContent);
    });

    check('离开代码生成页后入口状态复原', function () {
        doc.querySelector('#navConvertMenu a[data-src="json"][data-tgt="yaml"]').click();
        if (codeWs.classList.contains('active')) throw new Error('代码页仍在显示');
        if (doc.querySelector('.toolbar').classList.contains('hidden')) throw new Error('工具栏仍隐藏');
        if (doc.getElementById('navCodegen').classList.contains('active')) throw new Error('导航仍高亮');
    });

    // ---------------- JSON 查询（JSONPath / jq） ----------------
    var queryWs = doc.getElementById('queryWorkspace');
    var queryInput = doc.getElementById('queryInput');
    var queryOutput = doc.getElementById('queryOutput');
    var queryExpr = doc.getElementById('queryExpr');
    var queryTip = doc.getElementById('queryTip');
    var queryOutBadge = doc.getElementById('queryOutBadge');
    var queryPaths = doc.getElementById('queryPaths');

    function queryEditors() {
        return doc.querySelectorAll('#queryWorkspace .CodeMirror');
    }

    check('查询页编辑器懒创建：没进过这一页时不付代价', function () {
        if (queryEditors().length !== 0) throw new Error('提前创建了 ' + queryEditors().length + ' 个');
    });

    check('导航可进入查询页', function () {
        doc.getElementById('navQuery').click();
        if (!queryWs.classList.contains('active')) throw new Error('查询页没显示');
        if (!doc.querySelector('.toolbar').classList.contains('hidden')) throw new Error('工具栏没隐藏');
        if (!doc.getElementById('navQuery').classList.contains('active')) throw new Error('导航没高亮');
    });

    check('空着进来装示例数据、填默认表达式并立刻出结果', function () {
        if (queryInput.value.indexOf('"store"') < 0) throw new Error('没装示例数据');
        if (queryExpr.value.indexOf('$') !== 0) throw new Error('表达式没填：' + queryExpr.value);
        if (queryOutput.value.indexOf('Nigel Rees') < 0) throw new Error('没查出作者：' + queryOutput.value.slice(0, 80));
        if (queryOutBadge.textContent !== '3') throw new Error('匹配条数徽标: ' + queryOutBadge.textContent);
    });

    check('数据 / 结果 / Schema 四块都换成 CodeMirror', function () {
        if (queryEditors().length !== 4) throw new Error('编辑器数量 ' + queryEditors().length + '，应为 4');
        if (!doc.querySelector('#queryWorkspace .CodeMirror-scroll')) throw new Error('CM 没初始化完');
    });

    check('匹配路径列表逐条列出，首行是第一条结果', function () {
        if (queryPaths.hidden) throw new Error('路径列表没显示');
        var rows = queryPaths.querySelectorAll('.query-path-row');
        if (rows.length !== 3) throw new Error('路径行数 ' + rows.length);
        var first = rows[0].querySelector('.p').textContent;
        if (first !== '$.store.book[0].author') throw new Error('首行路径: ' + first);
    });

    check('点示例表达式立刻换结果', function () {
        var chip = doc.querySelector('#querySamples .sample-chip[data-expr="$..price"]');
        if (!chip) throw new Error('示例里没有 $..price');
        chip.click();
        if (queryExpr.value !== '$..price') throw new Error('表达式没进输入框');
        if (queryOutBadge.textContent !== '4') throw new Error('价格条数 ' + queryOutBadge.textContent);
    });

    typeIn(queryExpr, '$.store.book[?(@.price < 10)].title');
    await wait(320);

    check('过滤器表达式生效', function () {
        if (queryOutput.value.indexOf('Sayings') < 0) throw new Error('结果: ' + queryOutput.value.slice(0, 80));
        if (queryOutBadge.textContent !== '2') throw new Error('条数 ' + queryOutBadge.textContent);
    });

    typeIn(queryExpr, '$.store.book[');
    await wait(320);

    check('表达式语法错误：输入框标红并给出提示', function () {
        if (queryExpr.className.indexOf('is-bad') < 0) throw new Error('输入框没标红');
        if (queryTip.textContent.indexOf('表达式') < 0) throw new Error('提示: ' + queryTip.textContent);
        if (queryTip.className.indexOf('err') < 0) throw new Error('没标成错误态');
    });

    typeIn(queryExpr, '$.store.book[*].author');
    typeIn(queryInput, '{oops');
    await wait(320);

    check('坏 JSON 给出提示且不产出结果', function () {
        if (queryOutput.value !== '') throw new Error('出错还留着旧结果');
        if (queryTip.textContent.indexOf('解析失败') < 0) throw new Error('提示: ' + queryTip.textContent);
    });

    typeIn(queryInput, '{"a":1,"b":[1,2]}');
    await wait(320);

    check('恢复合法 JSON 后重新出结果', function () {
        if (queryTip.textContent.indexOf('没有匹配项') < 0) throw new Error('提示: ' + queryTip.textContent);
        if (queryOutBadge.textContent !== '0') throw new Error('条数 ' + queryOutBadge.textContent);
    });

    // ---------------- JSON Schema 校验 ----------------
    var schData = doc.getElementById('schData');
    var schSchema = doc.getElementById('schSchema');
    var schErrors = doc.getElementById('schErrors');
    var schHint = doc.getElementById('schHint');

    check('切到 Schema 子页：两个子页互斥显示', function () {
        doc.querySelector('#queryTabs [data-tab="schema"]').click();
        if (!doc.getElementById('querySchemaPane').classList.contains('active')) throw new Error('Schema 子页没显示');
        if (doc.getElementById('queryPathPane').classList.contains('active')) throw new Error('查询子页没隐藏');
    });

    check('空着进来装一份示例并校验通过', function () {
        if (schData.value.indexOf('"id"') < 0) throw new Error('没装示例数据');
        if (schSchema.value.indexOf('"required"') < 0) throw new Error('没装示例 schema');
        if (!schErrors.querySelector('.query-ok-row')) throw new Error('没显示通过行');
        if (schHint.textContent.indexOf('通过') < 0) throw new Error('提示: ' + schHint.textContent);
    });

    typeIn(schData, '{"id":"不是数字"}');
    await wait(420);

    check('校验失败：错误列表给出路径与本地化的原因', function () {
        var rows = schErrors.querySelectorAll('.query-error-row');
        if (!rows.length) throw new Error('没有错误行');
        var text = [].map.call(rows, function (r) { return r.textContent; }).join(' | ');
        if (text.indexOf('类型应为') < 0) throw new Error('没报类型错: ' + text);
        if (text.indexOf('缺少必填字段') < 0) throw new Error('没报缺字段: ' + text);
        if (text.indexOf('$.id') < 0) throw new Error('没给出路径: ' + text);
        if (schHint.textContent.indexOf('问题') < 0) throw new Error('提示没给问题数: ' + schHint.textContent);
    });

    check('生成 Schema：从数据反推并重写右栏', function () {
        doc.getElementById('schInfer').click();
        var parsed = JSON.parse(schSchema.value);
        if (parsed.type !== 'object') throw new Error('推断类型: ' + parsed.type);
        if (!parsed.properties || !parsed.properties.id) throw new Error('没有 id 属性');
        if (parsed.properties.id.type !== 'string') throw new Error('id 类型: ' + parsed.properties.id.type);
        if (!schErrors.querySelector('.query-ok-row')) throw new Error('反推的 schema 应当校验通过');
    });

    check('Schema 子页清空后回到待输入提示', function () {
        doc.getElementById('queryClear').click();
        if (schData.value !== '' || schSchema.value !== '') throw new Error('没清空');
        if (schErrors.hidden !== true) throw new Error('错误列表没收起');
    });

    check('离开查询页后入口状态复原', function () {
        doc.querySelector('#navConvertMenu a[data-src="json"][data-tgt="yaml"]').click();
        if (queryWs.classList.contains('active')) throw new Error('查询页仍在显示');
        if (doc.querySelector('.toolbar').classList.contains('hidden')) throw new Error('工具栏仍隐藏');
        if (doc.getElementById('navQuery').classList.contains('active')) throw new Error('导航仍高亮');
    });

    // ---------------- 转义工具集 ----------------
    var escWs = doc.getElementById('escWorkspace');
    var escInput = doc.getElementById('escInput');
    var escOutput = doc.getElementById('escOutput');
    var escTip = doc.getElementById('escTip');

    check('转义页编辑器懒创建', function () {
        if (doc.querySelectorAll('#escWorkspace .CodeMirror').length !== 0) throw new Error('提前创建了');
    });

    check('转义页默认是关着的', function () {
        if (escWs.classList.contains('active')) throw new Error('默认就显示了');
        if (doc.getElementById('navEscape').classList.contains('active')) throw new Error('导航默认就高亮');
    });

    check('导航可进入转义页', function () {
        doc.getElementById('navEscape').click();
        if (!escWs.classList.contains('active')) throw new Error('转义页没显示');
        if (!doc.getElementById('navEscape').classList.contains('active')) throw new Error('导航没高亮');
    });

    check('空着进来装示例并按 URL 编码', function () {
        if (escInput.value.indexOf('https://') < 0) throw new Error('没装示例');
        if (escOutput.value.indexOf('%E4%B8%AD') < 0) throw new Error('没编码中文: ' + escOutput.value.slice(0, 60));
        if (doc.querySelectorAll('#escWorkspace .CodeMirror').length !== 2) throw new Error('编辑器应为 2 个');
        if (doc.getElementById('escOutBadge').textContent !== 'URL') throw new Error('徽标: ' + doc.getElementById('escOutBadge').textContent);
    });

    check('八种转换类型都在选择条上', function () {
        var kinds = [].map.call(doc.querySelectorAll('#escKinds .sample-chip'), function (c) { return c.dataset.kind; });
        if (kinds.join(',') !== 'url,base64,html,json,unicode,hex,sql,regex') throw new Error('类型: ' + kinds.join(','));
    });

    check('切到 Base64 立刻换算法，徽标跟着走', function () {
        doc.querySelector('#escKinds [data-kind="base64"]').click();
        if (escOutput.value.indexOf('%') >= 0) throw new Error('还在用 URL 编码');
        if (!/^[A-Za-z0-9+/=]+$/.test(escOutput.value)) throw new Error('输出不是 Base64: ' + escOutput.value.slice(0, 40));
        if (doc.getElementById('escOutBadge').textContent !== 'Base64') throw new Error('徽标没跟着切');
    });

    check('对调：把结果搬回左边并转成解码，能还原原文', function () {
        doc.getElementById('escFlip').click();
        if (escOutput.value.indexOf('https://') !== 0) throw new Error('没解回原文: ' + escOutput.value.slice(0, 40));
        var active = doc.querySelector('#escDirTabs .compare-tab.active');
        if (active.dataset.dir !== 'decode') throw new Error('方向没切: ' + active.dataset.dir);
    });

    typeIn(escInput, '!!!not base64!!!');
    await wait(320);

    check('解码非法输入时给出提示且不产出结果', function () {
        if (escOutput.value !== '') throw new Error('出错还留着旧结果');
        if (escTip.textContent.indexOf('无法') < 0) throw new Error('提示: ' + escTip.textContent);
        if (escTip.className.indexOf('err') < 0) throw new Error('没标成错误态');
    });

    check('转义页清空后回到待输入提示', function () {
        doc.getElementById('escClear').click();
        if (escInput.value !== '' || escOutput.value !== '') throw new Error('没清空');
        if (escTip.textContent.indexOf('自动转换') < 0) throw new Error('提示没复位: ' + escTip.textContent);
    });

    check('离开转义页后入口状态复原', function () {
        doc.querySelector('#navConvertMenu a[data-src="json"][data-tgt="yaml"]').click();
        if (escWs.classList.contains('active')) throw new Error('转义页仍在显示');
        if (doc.getElementById('navEscape').classList.contains('active')) throw new Error('导航仍高亮');
    });

    // 回归：曾经的 bug —— 转义页开着时点「JSON 对比」，两页会上下叠在一起
    check('转义页 → 对比页：只留对比页（回归）', function () {
        var compareWs = doc.getElementById('compareWorkspace');
        doc.getElementById('navEscape').click();
        if (!escWs.classList.contains('active')) throw new Error('转义页没开');
        doc.getElementById('navCompare').click();
        if (escWs.classList.contains('active')) throw new Error('转义页没被收起');
        if (!compareWs.classList.contains('active')) throw new Error('对比页没显示');
        if (doc.getElementById('navEscape').classList.contains('active')) throw new Error('转义导航仍高亮');
    });

    check('对比页 → 转义页：对比页收起来（回归）', function () {
        var compareWs = doc.getElementById('compareWorkspace');
        doc.getElementById('navEscape').click();
        if (!escWs.classList.contains('active')) throw new Error('转义页没开');
        if (compareWs.classList.contains('active')) throw new Error('对比页还在显示');
        if (doc.getElementById('navCompare').classList.contains('active')) throw new Error('对比导航仍高亮');
    });

    check('转义工具是独立页：再点一次不会收起自己', function () {
        doc.getElementById('navEscape').click();
        if (!escWs.classList.contains('active')) throw new Error('转义页没开');
        doc.getElementById('navEscape').click();
        if (!escWs.classList.contains('active')) throw new Error('点第二下把页面关了');
        if (!doc.getElementById('navEscape').classList.contains('active')) throw new Error('导航没高亮');
    });

    check('转义页没有「收起」按钮（不是抽屉）', function () {
        if (doc.getElementById('escClose')) throw new Error('关闭按钮还在');
    });

    check('转义页按 Esc 不会离开', function () {
        doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        if (!escWs.classList.contains('active')) throw new Error('Esc 把页面关了');
    });

    check('全部页面两两不共存：点一圈只剩当前页', function () {
        var pages = [
            ['navCompare', 'compareWorkspace'],
            ['navSql', 'sqlWorkspace'],
            ['navSheet', 'sheetWorkspace'],
            ['navImage', 'imageWorkspace'],
            ['navCodegen', 'codeWorkspace'],
            ['navQuery', 'queryWorkspace'],
            ['navEscape', 'escWorkspace'],
            ['navBytes', 'bytesWorkspace'],
            ['navChart', 'chartWorkspace'],
            ['navDataSql', 'dataSqlWorkspace']
        ];
        pages.forEach(function (pair) {
            doc.getElementById(pair[0]).click();
            pages.forEach(function (other) {
                var on = doc.getElementById(other[1]).classList.contains('active');
                if (other[1] === pair[1] && !on) throw new Error(pair[1] + ' 没打开');
                if (other[1] !== pair[1] && on) throw new Error('进 ' + pair[1] + ' 时 ' + other[1] + ' 还开着');
            });
        });
        // 收尾：回到格式转换页，后面的用例还要用
        doc.querySelector('#navConvertMenu a[data-src="json"][data-tgt="yaml"]').click();
    });

    // ---------------- 字节转换页 ----------------
    var bytesWs = doc.getElementById('bytesWorkspace');

    doc.getElementById('navBytes').click();
    await wait(350);

    function bytesSetInput(text) {
        var wrap = doc.getElementById('bytesInput').nextElementSibling;
        if (wrap && wrap.CodeMirror) wrap.CodeMirror.setValue(text);
        else doc.getElementById('bytesInput').value = text;
    }

    function bytesRows() {
        return [].slice.call(doc.querySelectorAll('#bytesTable tbody tr'));
    }

    function bytesCellText(id) {
        var el = doc.getElementById(id);
        return el ? el.textContent.trim() : '';
    }

    check('点导航进字节页：只在页里，输入框换成了编辑器', function () {
        if (!bytesWs.classList.contains('active')) throw new Error('没进字节页');
        // 右侧是 HTML 结果面板（汇总 + 表格 + 三种写法），只有左侧一个编辑器
        if (doc.querySelectorAll('#bytesWorkspace .CodeMirror').length !== 1) {
            throw new Error('编辑器数量 ' + doc.querySelectorAll('#bytesWorkspace .CodeMirror').length);
        }
        if (!doc.querySelector('.toolbar').classList.contains('hidden')) throw new Error('转换页工具栏没藏');
        if (doc.getElementById('escWorkspace').classList.contains('active')) throw new Error('转义页还开着');
    });

    check('默认示例：4 行、有合计、最后一行是序列所以出三种写法', function () {
        if (bytesRows().length !== 4) throw new Error('行数 ' + bytesRows().length);
        if (!doc.querySelector('#bytesTable tfoot')) throw new Error('多行没有合计行');
        var forms = doc.querySelectorAll('#bytesForms .bytes-form');
        if (forms.length !== 3) throw new Error('三种写法数量 ' + forms.length);
    });

    bytesSetInput('1234567890');
    await wait(300);

    check('单行：精确值 + 两套进制分开算（1234567890 → 1.23 GB / 1.15 GiB）', function () {
        // 精确值不带千分位：这些数字要能直接贴进代码 / 命令行
        if (bytesCellText('bytesExactValue') !== '1234567890 B') {
            throw new Error('精确值 ' + bytesCellText('bytesExactValue'));
        }
        if (bytesCellText('bytesHuman1000') !== '1.23 GB') throw new Error('1000 制 ' + bytesCellText('bytesHuman1000'));
        if (bytesCellText('bytesHuman1024') !== '1.15 GiB') throw new Error('1024 制 ' + bytesCellText('bytesHuman1024'));
        if (bytesRows().length !== 1) throw new Error('单行不该有合计行');
        if (doc.querySelector('#bytesTable tfoot')) throw new Error('单行还画了合计');
    });

    win.__clip.length = 0;
    doc.querySelector('.bytes-value[data-copy-id="bytesExactValue"]').click();
    doc.querySelector('.bytes-value[data-copy-id="bytesHuman1024"]').click();
    doc.querySelector('.bytes-value-copy[data-copy-id="bytesHuman1000"]').click();
    doc.querySelector('#bytesTable td.num').click();
    await wait(80);

    check('每个换算值都能单独复制：卡片、卡片上的复制按钮、表格数值', function () {
        if (win.__clip.length !== 4) throw new Error('复制次数 ' + win.__clip.length);
        if (win.__clip[0] !== '1234567890 B') throw new Error('精确值复制 ' + win.__clip[0]);
        if (win.__clip[1] !== '1.15 GiB') throw new Error('1024 制复制 ' + win.__clip[1]);
        if (win.__clip[2] !== '1.23 GB') throw new Error('复制按钮给了 ' + win.__clip[2]);
        if (win.__clip[3] !== '1234567890') throw new Error('表格字节列复制 ' + win.__clip[3]);
    });

    check('复制出来的值一个逗号都没有', function () {
        win.__clip.forEach(function (text) {
            if (text.indexOf(',') >= 0) throw new Error('带千分位: ' + text);
        });
        [].slice.call(doc.querySelectorAll('#bytesTable td.num')).forEach(function (td) {
            if (td.textContent.indexOf(',') >= 0) throw new Error('表格显示带千分位: ' + td.textContent);
        });
    });

    check('单行是数量时不出三种写法，只给一句提示', function () {
        if (doc.querySelectorAll('#bytesForms .bytes-form').length !== 0) throw new Error('数量不该有写法');
        var hint = doc.querySelector('#bytesForms .bytes-empty');
        if (!hint || hint.textContent.indexOf('字节序列') < 0) throw new Error('缺少提示');
    });

    bytesSetInput('1.5 GB\n734003200\n1f 8b 08');
    await wait(300);

    check('批量：逐行换算 + 末尾合计', function () {
        var rows = bytesRows();
        if (rows.length !== 3) throw new Error('行数 ' + rows.length);
        var foot = doc.querySelector('#bytesTable tfoot');
        if (!foot) throw new Error('没有合计行');
        var total = foot.querySelectorAll('td')[2].textContent;
        if (total !== String(1500000000 + 734003200 + 3)) {
            throw new Error('合计 ' + total);
        }
    });

    check('批量里夹一行字节序列：三种写法按那 3 个字节出', function () {
        var forms = doc.querySelectorAll('#bytesForms .bytes-form');
        if (forms.length !== 3) throw new Error('没有写法');
        var arr = forms[1].querySelector('pre').textContent;
        if (arr.indexOf('0x1f') < 0 || arr.indexOf('0x8b') < 0) throw new Error('字节数组 ' + arr);
    });

    bytesSetInput('100\nzzz\n200');
    await wait(300);

    check('坏行单独标红，不影响其它行', function () {
        var rows = bytesRows();
        if (rows.length !== 3) throw new Error('行数 ' + rows.length);
        if (!rows[1].classList.contains('bad')) throw new Error('坏行没标出来');
        if (rows[1].textContent.indexOf('看不懂') < 0) throw new Error('坏行没写原因');
        if (rows[0].classList.contains('bad')) throw new Error('好行被误标');
    });

    doc.getElementById('bytesDecimals').value = '0';
    doc.getElementById('bytesDecimals').dispatchEvent(new win.Event('change'));
    await wait(200);

    check('小数位切到 0：人类可读不再带小数', function () {
        var human = bytesCellText('bytesHuman1024');
        if (human.indexOf('.') >= 0) throw new Error('还有小数: ' + human);
    });

    doc.getElementById('bytesDecimals').value = '2';
    doc.getElementById('bytesDecimals').dispatchEvent(new win.Event('change'));
    await wait(150);

    doc.getElementById('bytesClear').click();
    await wait(250);

    check('清空后回到空态：表格与写法都收起来', function () {
        if (bytesRows().length !== 0) throw new Error('表格没清');
        if (bytesCellText('bytesExactValue') !== '—') throw new Error('精确值没重置');
        if (doc.querySelectorAll('#bytesForms .bytes-form').length !== 0) throw new Error('写法没清');
    });

    // ---------------- 时间转换 ----------------
    var timeWs = doc.getElementById('timeWorkspace');

    doc.getElementById('navTime').click();
    await wait(350);

    function timeSetInput(text) {
        var wrap = doc.getElementById('timeInput').nextElementSibling;
        if (wrap && wrap.CodeMirror) wrap.CodeMirror.setValue(text);
        else doc.getElementById('timeInput').value = text;
    }
    function timeRows() {
        return [].slice.call(doc.querySelectorAll('#timePanel .time-row'));
    }
    // CodeMirror 接管后 textarea.value 不一定是最新值，统一从这里读
    function timeInputText() {
        var wrap = doc.getElementById('timeInput').nextElementSibling;
        return wrap && wrap.CodeMirror ? wrap.CodeMirror.getValue() : doc.getElementById('timeInput').value;
    }
    function timeRuleStates() {
        var out = {};
        doc.querySelectorAll('.time-rule').forEach(function (c) {
            out[c.textContent.trim()] = c.getAttribute('aria-checked');
        });
        return out;
    }

    check('点导航进时间转换页：只在页里、一个编辑器', function () {
        if (!timeWs.classList.contains('active')) throw new Error('没进时间页');
        if (doc.getElementById('bytesWorkspace').classList.contains('active')) throw new Error('字节页还开着');
        if (doc.querySelectorAll('#timeWorkspace .CodeMirror').length !== 1) {
            throw new Error('编辑器数量 ' + doc.querySelectorAll('#timeWorkspace .CodeMirror').length);
        }
    });

    check('默认只勾「本地时间」和「本地时间(T)」两项', function () {
        var s = timeRuleStates();
        var on = Object.keys(s).filter(function (k) { return s[k] === 'true'; });
        if (on.length !== 2) throw new Error('勾选数 ' + on.length + '：' + on.join('/'));
        if (on.indexOf('本地时间') < 0 || on.indexOf('本地时间（T）') < 0) {
            throw new Error('勾选的不是本地时间两项：' + on.join('/'));
        }
    });

    timeSetInput('2020-01-01\n2020-01-01 00:00:00\n2020-01-01T00:00:00\n1577836800');
    await wait(350);

    check('批量转换：空格与 T 分隔都能转出两种本地写法', function () {
        var rows = timeRows();
        if (rows.length !== 4) throw new Error('行数 ' + rows.length);
        // 每行默认两个字段：本地时间 + 本地时间(T)
        var fields = rows[1].querySelectorAll('.time-field');
        if (fields.length !== 2) throw new Error('字段数 ' + fields.length);
        var vals = [].map.call(fields, function (f) { return f.querySelector('.time-field-value').textContent; });
        if (vals[0] !== '2020-01-01 00:00:00') throw new Error('空格写法 ' + vals[0]);
        if (vals[1] !== '2020-01-01T00:00:00') throw new Error('T 写法 ' + vals[1]);
    });

    check('点字段值能复制', function () {
        win.__clip.length = 0;
        var firstVal = timeRows()[0].querySelector('.time-field-value');
        firstVal.click();
        if (win.__clip.length !== 1) throw new Error('复制次数 ' + win.__clip.length);
        if (win.__clip[0] !== '2020-01-01 00:00:00') throw new Error('字段值 ' + win.__clip[0]);
    });

    check('点「复制整行」复制整行 TSV', function () {
        win.__clip.length = 0;
        timeRows()[0].querySelector('[data-copy-row]').click();
        if (win.__clip.length !== 1) throw new Error('整行复制次数 ' + win.__clip.length);
        if (win.__clip[0].indexOf('\t') < 0) throw new Error('整行不是 TSV: ' + win.__clip[0]);
    });

    check('「复制」按钮：每行输入一行，字段值空格分隔，不带原值和序号', function () {
        win.__clip.length = 0;
        doc.getElementById('timeCopy').click();
        if (win.__clip.length !== 1) throw new Error('复制次数 ' + win.__clip.length);
        // 4 行输入，每行 2 个字段（本地时间 + 本地时间T），空格连接，行间换行 = 4 行
        var lines = win.__clip[0].split('\n');
        if (lines.length !== 4) throw new Error('行数 ' + lines.length + '：' + win.__clip[0]);
        // 每行两个字段值用空格连接（注意本地时间值内部自带空格）
        if (lines[0] !== '2020-01-01 00:00:00 2020-01-01T00:00:00') {
            throw new Error('首行内容 ' + lines[0]);
        }
        // 不带 #序号、不带输入原值（时间戳 1577836800 是第 4 行的输入原值）
        if (win.__clip[0].indexOf('#1') >= 0) throw new Error('带了 #序号');
        if (win.__clip[0].indexOf('1577836800') >= 0) throw new Error('带了输入原值时间戳');
    });

    check('点 header 折叠 / 展开', function () {
        var row = timeRows()[0];
        var header = row.querySelector('header');
        if (row.classList.contains('collapsed')) throw new Error('默认不该折叠');
        header.click();
        if (!row.classList.contains('collapsed')) throw new Error('没折叠');
        header.click();
        if (row.classList.contains('collapsed')) throw new Error('没展开');
    });

    check('勾选更多规则：字段数跟着变', function () {
        var rule = doc.querySelector('.time-rule[data-field="unixSec"]');
        rule.click();
        if (timeRows()[0].querySelectorAll('.time-field').length !== 3) {
            throw new Error('勾选 unixSec 后字段数 ' + timeRows()[0].querySelectorAll('.time-field').length);
        }
        // 还原
        rule.click();
        if (timeRows()[0].querySelectorAll('.time-field').length !== 2) throw new Error('还原后字段数不对');
    });

    doc.getElementById('timeClear').click();
    await wait(300);

    check('快捷操作：五个按钮按顺序排列', function () {
        var btns = [].slice.call(doc.querySelectorAll('#timeQuickActions [data-quick]'));
        if (btns.length !== 5) throw new Error('按钮数 ' + btns.length);
        var kinds = btns.map(function (b) { return b.getAttribute('data-quick'); }).join(',');
        if (kinds !== 'now,today,yesterday,week,month') throw new Error('按钮顺序 ' + kinds);
        if (btns[0].textContent.trim() !== '当前时间') throw new Error('按钮文案 ' + btns[0].textContent);
    });

    doc.querySelector('#timeQuickActions [data-quick="now"]').click();
    await wait(300);

    check('快捷操作：点「当前时间」换行填入一行', function () {
        var lines = timeInputText().split('\n');
        if (lines.length !== 1) throw new Error('行数 ' + lines.length + '：' + timeInputText());
        if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(lines[0])) throw new Error('格式 ' + lines[0]);
        if (timeRows().length !== 1) throw new Error('结果卡片数 ' + timeRows().length);
    });

    doc.querySelector('#timeQuickActions [data-quick="today"]').click();
    await wait(300);

    check('快捷操作：再点一个另起一行，不打乱已有内容', function () {
        var lines = timeInputText().split('\n');
        if (lines.length !== 2) throw new Error('行数 ' + lines.length + '：' + timeInputText());
        if (!/^(\d{4}-\d{2}-\d{2}) 00:00:00$/.test(lines[1])) throw new Error('今天开始 ' + lines[1]);
        if (timeRows().length !== 2) throw new Error('结果卡片数 ' + timeRows().length);
    });

    check('快捷操作：新行定位高亮到最后一张卡片', function () {
        var located = doc.querySelectorAll('#timePanel .time-row.locate');
        if (located.length !== 1) throw new Error('高亮数 ' + located.length);
        if (located[0].getAttribute('data-line') !== '2') throw new Error('高亮行 ' + located[0].getAttribute('data-line'));
    });

    doc.getElementById('timeClear').click();
    await wait(200);

    doc.getElementById('navBytes').click();
    await wait(200);
    check('切走再切回：时间页状态复位', function () {
        if (timeWs.classList.contains('active')) throw new Error('离开后还 active');
    });

    doc.getElementById('navTime').click();
    await wait(200);
    check('切回来还是时间页', function () {
        if (!timeWs.classList.contains('active')) throw new Error('没回到时间页');
    });

    // ---------------- 数据统计 ----------------
    var statsWs = doc.getElementById('statsWorkspace');

    function statsCM() {
        var wrap = doc.getElementById('statsInput').nextElementSibling;
        return wrap && wrap.CodeMirror;
    }
    function statsPreviewRows() {
        return [].slice.call(doc.querySelectorAll('#statsPreviewTable tbody tr[data-line]'));
    }
    function statsResultRows() {
        return doc.querySelectorAll('#statsResultTable tbody tr').length;
    }
    function statsLocated() {
        return [].slice.call(doc.querySelectorAll('#statsPreviewTable tbody tr.locate'));
    }

    doc.getElementById('navStats').click();
    await wait(400);

    check('点导航进数据统计页：只在页里，输入框交给编辑器', function () {
        if (!statsWs.classList.contains('active')) throw new Error('没进统计页');
        if (doc.getElementById('timeWorkspace').classList.contains('active')) throw new Error('时间页还开着');
        if (doc.querySelectorAll('#statsWorkspace .CodeMirror').length !== 1) {
            throw new Error('编辑器数量 ' + doc.querySelectorAll('#statsWorkspace .CodeMirror').length);
        }
        if (!statsCM()) throw new Error('拿不到 CodeMirror 实例');
    });

    check('统计页自带「导入文件」入口，指向本页', function () {
        var btn = doc.getElementById('statsImport');
        if (!btn) throw new Error('缺少导入入口');
        if (btn.dataset.importPage !== 'navStats') throw new Error('入口指向 ' + btn.dataset.importPage);
    });

    doc.querySelector('#statsSamples .sample-chip[data-sample="orders"]').click();
    await wait(350);

    check('贴示例：解析出 8 行 × 6 列，自动勾上两列数字', function () {
        if (statsPreviewRows().length !== 8) throw new Error('预览行数 ' + statsPreviewRows().length);
        var checked = doc.querySelectorAll('#statsPreviewTable thead input[type="checkbox"]:checked').length;
        if (checked !== 2) throw new Error('自动勾选列数 ' + checked);
        if (statsResultRows() !== 2) throw new Error('结果行数 ' + statsResultRows());
    });

    check('预览表带原文行号：表头占第 1 行，数据从第 2 行起', function () {
        var rows = statsPreviewRows();
        if (rows[0].dataset.line !== '2') throw new Error('首行行号 ' + rows[0].dataset.line);
        var no = rows[0].querySelector('.stats-line-no');
        if (!no || no.textContent !== '2') throw new Error('行号列没画出来');
    });

    check('点行号格：光标跳到同一行，且只亮这一行', function () {
        // 第 4 条数据在原文第 5 行（第 1 行是表头）
        statsPreviewRows()[3].querySelector('.stats-line-no').click();
        var cm = statsCM();
        if (cm.getCursor().line + 1 !== 5) throw new Error('光标行 ' + (cm.getCursor().line + 1));
        var lit = statsLocated();
        if (lit.length !== 1) throw new Error('高亮数 ' + lit.length);
        if (lit[0].dataset.line !== '5') throw new Error('高亮行 ' + lit[0].dataset.line);
    });

    win.__clip.length = 0;
    var cellAmount = statsPreviewRows()[0].querySelectorAll('td')[4];   // 首条记录的「金额」
    cellAmount.click();
    await wait(120);

    check('点预览单元格：剪贴板里只有这一格的值', function () {
        if (!win.__clip.length) throw new Error('没写剪贴板');
        if (win.__clip[0] !== '1280.50') throw new Error('复制到 ' + JSON.stringify(win.__clip[0]));
        if (!cellAmount.classList.contains('cell-copied')) throw new Error('格子没闪');
        // 复制单元格不该把焦点扔进编辑器（不然下一次粘贴就粘进数据里了）
        var cm = statsCM();
        if (cm.getCursor().line + 1 !== 5) throw new Error('光标被带走了：' + (cm.getCursor().line + 1));
    });

    win.__clip.length = 0;
    statsPreviewRows()[0].querySelectorAll('td')[1].click();            // 日期格
    await wait(120);

    check('再点别的格：复制的就是新那一格', function () {
        if (win.__clip[0] !== '2026-01-05') throw new Error('复制到 ' + JSON.stringify(win.__clip[0]));
        if (cellAmount.classList.contains('cell-copied')) throw new Error('上一格的闪光没退');
    });

    statsCM().setCursor({ line: 6, ch: 0 });
    await wait(150);

    check('编辑器里移动光标：预览表跟着亮对应行', function () {
        var lit = statsLocated();
        if (lit.length !== 1) throw new Error('高亮数 ' + lit.length);
        if (lit[0].dataset.line !== '7') throw new Error('高亮行 ' + lit[0].dataset.line);
    });

    check('编辑器里改内容：预览表当场重算', function () {
        var cm = statsCM();
        cm.setValue(cm.getValue() + String.fromCharCode(10) + '2026-02-02|线上|华东|100|1|已付');
        if (statsPreviewRows().length !== 9) throw new Error('预览行数 ' + statsPreviewRows().length);
        if (doc.getElementById('statsPreviewBadge').textContent !== '9 行 × 6 列') {
            throw new Error('徽标 ' + doc.getElementById('statsPreviewBadge').textContent);
        }
    });

    doc.querySelector('#statsGroup .custom-select-trigger').click();
    await wait(120);
    check('分组下拉里列出每一列', function () {
        var opts = doc.querySelectorAll('#statsGroup .custom-option');
        if (opts.length !== 7) throw new Error('选项数 ' + opts.length);   // 不分组 + 6 列
    });
    doc.querySelector('#statsGroup .custom-option[data-value="1"]').click();
    await wait(300);

    check('按渠道分组：两列 × 两组 = 四行结果', function () {
        if (statsResultRows() !== 4) throw new Error('结果行数 ' + statsResultRows());
        if (doc.querySelector('#statsGroup .custom-select-trigger .label').textContent !== '渠道') {
            throw new Error('触发器没显示分组列');
        }
    });

    win.__clip.length = 0;
    var resCells = doc.querySelectorAll('#statsResultTable tbody tr')[0].querySelectorAll('td');
    resCells[resCells.length - 1].click();                              // 最后一格：最后一个指标
    await wait(120);

    check('点统计结果单元格：复制的就是这一格显示的数', function () {
        if (!win.__clip.length) throw new Error('没写剪贴板');
        if (win.__clip[0] !== resCells[resCells.length - 1].textContent) {
            throw new Error('复制到 ' + JSON.stringify(win.__clip[0]));
        }
    });

    win.__clip.length = 0;
    resCells[0].click();                                                // 分组列的格子
    await wait(120);

    check('结果表的分组格也能单独复制', function () {
        if (win.__clip[0] !== '线上') throw new Error('复制到 ' + JSON.stringify(win.__clip[0]));
    });

    win.__clip.length = 0;
    doc.getElementById('statsCopyCols').click();
    await wait(250);

    check('复制所选列：带表头、一行一条记录（不是摊成一列）', function () {
        if (!win.__clip.length) throw new Error('没写剪贴板');
        var lines = win.__clip[0].split('\n');
        if (lines[0] !== '金额\t数量') throw new Error('表头 ' + lines[0]);
        if (lines.length !== 10) throw new Error('行数 ' + lines.length);   // 表头 + 9 条数据
        var cols = lines[1].split('\t').length;
        if (cols !== 2) throw new Error('第一行有 ' + cols + ' 列');
    });

    win.__clip.length = 0;
    doc.getElementById('statsCopy').click();
    await wait(250);

    check('复制结果：制表符分隔，首行是表头', function () {
        if (!win.__clip.length) throw new Error('没写剪贴板');
        var head = win.__clip[0].split('\n')[0];
        if (head.indexOf('\t') < 0) throw new Error('不是 TSV: ' + head);
        if (head.indexOf('分组') < 0 || head.indexOf('统计列') < 0) throw new Error('表头缺列名: ' + head);
    });

    doc.getElementById('statsImport').click();
    await wait(60);
    Object.defineProperty(doc.getElementById('pageImportInput'), 'files', {
        configurable: true,
        value: [new win.File(['id|name|qty\n1|Ada|3\n2|Bob|5'], 'items.txt', { type: 'text/plain' })]
    });
    doc.getElementById('pageImportInput').dispatchEvent(new win.Event('change', { bubbles: true }));
    await wait(500);

    check('按钮导入：内容进编辑器，按新表重算', function () {
        if (statsCM().getValue().indexOf('Ada') < 0) throw new Error('没载入');
        if (statsPreviewRows().length !== 2) throw new Error('预览行数 ' + statsPreviewRows().length);
        if (doc.getElementById('statsTip').textContent.indexOf('items.txt') < 0) {
            throw new Error('提示里没有文件名: ' + doc.getElementById('statsTip').textContent);
        }
    });

    doc.getElementById('statsClear').click();
    await wait(200);

    check('清空：预览、结果、徽标一起回到空态', function () {
        if (statsPreviewRows().length !== 0) throw new Error('预览没清');
        if (statsResultRows() !== 0) throw new Error('结果没清');
        if (doc.getElementById('statsPreviewBadge').textContent !== '0 × 0') throw new Error('徽标没复位');
        if (statsCM().getValue() !== '') throw new Error('编辑器没清');
    });

    // 150 行：首屏只画一批，剩下的靠「加载更多」/ 滚到底补
    var bigLines = ['名称,金额'];
    for (var bi = 1; bi <= 150; bi++) bigLines.push('item' + bi + ',' + (bi * 2));
    statsCM().setValue(bigLines.join(String.fromCharCode(10)));
    await wait(450);

    check('数据多时预览按批画：先 100 行，表尾写明已显示多少', function () {
        if (statsPreviewRows().length !== 100) throw new Error('首屏行数 ' + statsPreviewRows().length);
        var more = doc.querySelector('#statsPreviewTable tr.stats-more');
        if (!more) throw new Error('没有表尾');
        var txt = more.textContent;
        if (txt.indexOf('100') < 0 || txt.indexOf('150') < 0) throw new Error('表尾文案 ' + txt);
        if (!more.querySelector('.stats-more-btn')) throw new Error('没有加载更多按钮');
    });

    check('点「加载更多」：补齐剩下的行，表尾消失', function () {
        doc.querySelector('#statsPreviewTable .stats-more-btn').click();
        if (statsPreviewRows().length !== 150) throw new Error('行数 ' + statsPreviewRows().length);
        if (doc.querySelector('#statsPreviewTable tr.stats-more')) throw new Error('表尾还在');
    });

    check('列选择：默认全部列都在', function () {
        var label = doc.querySelector('#statsCols .custom-select-trigger .label');
        if (label.textContent !== '全部列') throw new Error('标签 ' + label.textContent);
        if (doc.querySelectorAll('#statsColsOptions .custom-option').length !== 2) {
            throw new Error('选项数 ' + doc.querySelectorAll('#statsColsOptions .custom-option').length);
        }
        if (doc.querySelectorAll('#statsPreviewTable thead th').length !== 3) {
            throw new Error('表头格数 ' + doc.querySelectorAll('#statsPreviewTable thead th').length);
        }
    });

    doc.querySelector('#statsCols .custom-select-trigger').click();
    await wait(120);
    doc.querySelector('#statsColsOptions .custom-option[data-value="1"]').click();
    await wait(250);

    check('取消一列：预览里那一列真的消失，标签变成 列 1/2', function () {
        var head = doc.querySelectorAll('#statsPreviewTable thead th');
        if (head.length !== 2) throw new Error('表头格数 ' + head.length);        // 行号 + 剩下一列
        var cells = statsPreviewRows()[0].querySelectorAll('td');
        if (cells.length !== 2) throw new Error('行内格数 ' + cells.length);
        if (cells[1].textContent !== 'item1') throw new Error('剩下的是 ' + cells[1].textContent);
        var label = doc.querySelector('#statsCols .custom-select-trigger .label');
        if (label.textContent !== '列 1/2') throw new Error('标签 ' + label.textContent);
        // 藏列只是不画：统计照样按整张表算
        if (statsResultRows() === 0) throw new Error('藏列把统计也弄没了');
    });

    check('至少留一列：全关掉会被拦下，勾选框还得勾着', function () {
        // 真点勾选框本身：浏览器会先把它取消，代码得掰回来
        var box = doc.querySelector('#statsColsOptions .custom-option[data-value="0"] input');
        box.click();
        if (doc.querySelectorAll('#statsPreviewTable thead th').length !== 2) throw new Error('列被藏光了');
        if (!box.checked) throw new Error('勾选框被取消了，列却还在');
        if (doc.querySelector('#statsCols .custom-select-trigger .label').textContent !== '列 1/2') {
            throw new Error('标签 ' + doc.querySelector('#statsCols .custom-select-trigger .label').textContent);
        }
    });

    // 还原成全显示，后面的用例按 2 列算
    doc.querySelector('#statsColsOptions .custom-option[data-value="0"]').click();
    doc.querySelector('#statsColsOptions .custom-option[data-value="1"]').click();
    await wait(200);

    // ---------------- JSON 转图表 ----------------
    // jsdom 里没有 canvas，echarts 也加载不了：这里只校验「不依赖引擎」的那半边
    // —— 形状判定、报错文案、尺寸夹取、导出前的空态。真渲染由 CDP 截图脚本验收。
    var chartWs = doc.getElementById('chartWorkspace');

    // jsdom 没有 canvas，echarts 也画不出来：文件开头已经拦掉了引擎请求，
    // 所以这里覆盖的是「引擎加载失败也不崩页面」这条最糟的路径。
    doc.getElementById('navChart').click();
    await wait(400);

    function chartSetInput(text) {
        var wrap = doc.getElementById('chartInput').nextElementSibling;
        if (wrap && wrap.CodeMirror) wrap.CodeMirror.setValue(text);
        else doc.getElementById('chartInput').value = text;
    }

    function chartTipText() {
        return doc.getElementById('chartTip').textContent.trim();
    }

    function chartBadge(id) {
        var el = doc.getElementById(id);
        return el ? el.textContent.trim() : '';
    }

    check('点导航进图表页：只在页里、一个编辑器、默认示例是完整 option', function () {
        if (!chartWs.classList.contains('active')) throw new Error('没进图表页');
        if (doc.getElementById('bytesWorkspace').classList.contains('active')) throw new Error('字节页还开着');
        if (doc.querySelectorAll('#chartWorkspace .CodeMirror').length !== 1) {
            throw new Error('编辑器数量 ' + doc.querySelectorAll('#chartWorkspace .CodeMirror').length);
        }
        var text = doc.getElementById('chartInput').value;
        if (text.indexOf('"series"') < 0) throw new Error('默认示例没加载');
        if (chartBadge('chartInBadge') !== 'option') throw new Error('来源徽标 ' + chartBadge('chartInBadge'));
        // option 自带类型时下拉仍可用（自动 = 听 JSON，选了就覆盖）
        if (doc.getElementById('chartType').hasAttribute('disabled')) throw new Error('类型下拉不该禁用');
        if (doc.getElementById('chartType').title.indexOf('series.type') < 0) {
            throw new Error('没说明自动和覆盖的关系: ' + doc.getElementById('chartType').title);
        }
    });

    check('宽高默认 700 × 400', function () {
        if (doc.getElementById('chartWidth').value !== '700') throw new Error('宽 ' + doc.getElementById('chartWidth').value);
        if (doc.getElementById('chartHeight').value !== '400') throw new Error('高 ' + doc.getElementById('chartHeight').value);
    });

    check('改宽高：输入过程中不被弹回，失焦才夹取边界', function () {
        var w = doc.getElementById('chartWidth');
        // 输入合法中间值 9：过程中绝不能被夹成 80（否则「700 改 900」根本敲不进去）
        w.value = '9';
        w.dispatchEvent(new win.Event('input', { bubbles: true }));
        if (w.value !== '9') throw new Error('输入中就被改了: ' + w.value);
        // 失焦后 9 < 80，才夹回 80
        w.dispatchEvent(new win.Event('blur', { bubbles: true }));
        if (w.value !== '80') throw new Error('失焦没夹到 80: ' + w.value);
        // 恢复默认，别影响后面的用例
        w.value = '700';
        w.dispatchEvent(new win.Event('input', { bubbles: true }));
    });

    check('引擎加载失败：只提示，页面不崩', function () {
        var tip = chartTipText();
        if (tip.indexOf('图表引擎') < 0) throw new Error('提示: ' + tip);
        if (!chartWs.classList.contains('active')) throw new Error('页面被带崩了');
        if (!doc.getElementById('chartCanvas').hidden) throw new Error('画布不该露出来');
    });

    chartSetInput('{');
    await wait(420);

    check('坏 JSON：提示解析失败，画布收起', function () {
        if (chartTipText().indexOf('解析') < 0) throw new Error('提示: ' + chartTipText());
        if (!doc.getElementById('chartCanvas').hidden) throw new Error('画布没收起');
        if (doc.getElementById('chartEmpty').hidden) throw new Error('空态提示没显示');
    });

    chartSetInput('[1, 2, 3]');
    await wait(420);

    check('一组数字：判定为数据，类型下拉放开', function () {
        if (chartBadge('chartInBadge') !== '数据') throw new Error('徽标 ' + chartBadge('chartInBadge'));
        if (doc.getElementById('chartType').hasAttribute('disabled')) throw new Error('类型下拉还禁用着');
    });

    chartSetInput('"just a string"');
    await wait(420);

    check('画不出的 JSON：提示怎么给数据', function () {
        var tip = chartTipText();
        if (tip.indexOf('画不出图') < 0) throw new Error('提示: ' + tip);
        if (tip.indexOf('option') < 0) throw new Error('没给出可用形状');
    });

    // 接口返回的形状：业务 key 里塞一个 echart_option 字符串（很多后台都是这么给的）
    var SMOKE_OPT1 = JSON.stringify({
        title: { text: '月度订单量' },
        xAxis: { type: 'category', data: ['12月', '1月'] },
        yAxis: { type: 'value' },
        series: [{ name: '线上订单', type: 'line', data: [800, 800] }]
    });
    var SMOKE_OPT2 = JSON.stringify({
        title: { text: '另一个图' },
        xAxis: { type: 'category', data: ['a'] },
        yAxis: { type: 'value' },
        series: [{ name: 's', type: 'bar', data: [1] }]
    });
    var wrapped = JSON.stringify({
        monthly_trend: { echart_option: SMOKE_OPT1, table_data: null, biz_data: {} }
    });

    chartSetInput(wrapped);
    await wait(460);

    check('接口返回（业务 key 里包 echart_option 字符串）能自动剥出来', function () {
        // 引擎在 jsdom 里加载不了，这里能看到的证据是「形状判定已经变成 option」
        if (chartBadge('chartInBadge') !== 'option') throw new Error('徽标 ' + chartBadge('chartInBadge'));
        if (doc.getElementById('chartType').hasAttribute('disabled')) throw new Error('类型下拉不该禁用（完整 option 也允许改类型）');
        // 只有一个图时不该冒出选择器
        if (!doc.getElementById('chartPickWrap').hidden) throw new Error('单图还显示了选择器');
    });

    var multi = JSON.stringify({
        trend_online: { echart_option: SMOKE_OPT1 },
        trend_retail: { echart_option: SMOKE_OPT2 }
    });

    chartSetInput(multi);
    await wait(460);

    check('一份 JSON 里多个 option：出选择器、按标题列出', function () {
        if (doc.getElementById('chartPickWrap').hidden) throw new Error('选择器没出现');
        var pick = doc.getElementById('chartPick');
        var opts = doc.getElementById('chartPickOptions').children;
        if (opts.length !== 2) throw new Error('选项数 ' + opts.length);
        if (opts[0].textContent !== '月度订单量') throw new Error('第一项 ' + opts[0].textContent);
        if (opts[1].textContent !== '另一个图') throw new Error('第二项 ' + opts[1].textContent);
        if (pick.dataset.value !== '0') throw new Error('默认没选第一个: ' + pick.dataset.value);
        // shadcn 风格下拉：触发器显示当前项，选中项左边打勾
        var label = pick.querySelector('.custom-select-trigger .label');
        if (label.textContent !== '月度订单量') throw new Error('触发器文案 ' + label.textContent);
        if (!opts[0].classList.contains('selected')) throw new Error('第一项没标选中');
        if (chartBadge('chartInBadge') !== 'option') throw new Error('徽标 ' + chartBadge('chartInBadge'));
    });

    doc.getElementById('chartPickOptions').children[1].click();
    await wait(300);

    check('切到第二个图：还是 option、选择器保持选中', function () {
        if (doc.getElementById('chartPick').dataset.value !== '1') throw new Error('选择丢了');
        if (chartBadge('chartInBadge') !== 'option') throw new Error('徽标 ' + chartBadge('chartInBadge'));
        if (doc.getElementById('chartPickWrap').hidden) throw new Error('选择器被收起来了');
        // 二号图只有一个点，状态条不会被引擎错误盖掉之前就已经算过尺寸，这里只校验没抛错
        if (!chartWs.classList.contains('active')) throw new Error('页面被带崩了');
    });

    var ndjson = JSON.stringify({ trend_online: { echart_option: SMOKE_OPT1 } }) + '\n'
        + JSON.stringify({ trend_retail: { echart_option: SMOKE_OPT2 } });

    chartSetInput(ndjson);
    await wait(460);

    check('换行粘贴多份 JSON（一行一份）：也能各自解析并列出', function () {
        if (doc.getElementById('chartPickWrap').hidden) throw new Error('选择器没出现');
        if (doc.getElementById('chartPickOptions').children.length !== 2) throw new Error('选项数 ' + doc.getElementById('chartPickOptions').children.length);
        if (chartBadge('chartInBadge') !== 'option') throw new Error('徽标 ' + chartBadge('chartInBadge'));
    });

    // 任务列表：顶层是数组，每条的负载是二次序列化的 JSON，图埋在第 6 层，
    // 中间还夹着表格数据 —— 这是后台导出的典型形状，必须能挑出每一张图。
    function smokeTask(tag, key, title) {
        var payload = {};
        payload[key] = {
            echart_option: JSON.stringify({
                title: { text: title },
                xAxis: { type: 'category', data: ['甲', '乙'] },
                yAxis: { type: 'value' },
                series: [{ name: tag, type: 'bar', data: [3, 5] }]
            }),
            table_data: [{ seq: 1, label: '行1', amount: 3 }, { seq: 2, label: '行2', amount: 5 }],
            biz_data: { region: '东' }
        };
        payload[key + '_empty'] = { echart_option: null, table_data: [], biz_data: {} };
        return { id: 'task-' + tag, tag: tag, collected_at: '2024-05-06 07:08:09', payload: JSON.stringify(payload) };
    }

    var taskList = JSON.stringify([
        smokeTask('a', 'alpha', '图甲'),
        smokeTask('b', 'beta', '图乙'),
        smokeTask('c', 'gamma', '图丙')
    ]);

    chartSetInput(taskList);
    await wait(520);

    check('任务列表（负载是二次序列化的 JSON）：每份图都列出来，空值不占位', function () {
        if (doc.getElementById('chartPickWrap').hidden) throw new Error('选择器没出现');
        var opts = doc.getElementById('chartPickOptions').children;
        // 3 条任务 × 2 个业务键，其中 3 个 echart_option 是 null
        if (opts.length !== 3) throw new Error('选项数 ' + opts.length);
        if (opts[0].textContent !== '图甲') throw new Error('第一项 ' + opts[0].textContent);
        if (opts[2].textContent !== '图丙') throw new Error('第三项 ' + opts[2].textContent);
        if (chartBadge('chartInBadge') !== 'option') throw new Error('徽标 ' + chartBadge('chartInBadge'));
        // 路径写进了 title，鼠标悬停能看到图在哪一层
        if (opts[1].title.indexOf('echart_option') < 0) throw new Error('悬停没给路径: ' + opts[1].title);
    });

    chartSetInput('[1, 2, 3]');
    await wait(460);

    check('换回纯数据：选择器收起、类型下拉放开', function () {
        if (!doc.getElementById('chartPickWrap').hidden) throw new Error('选择器没收起');
        if (chartBadge('chartInBadge') !== '数据') throw new Error('徽标 ' + chartBadge('chartInBadge'));
        if (doc.getElementById('chartType').hasAttribute('disabled')) throw new Error('类型下拉还禁用着');
    });

    doc.getElementById('chartClear').click();
    await wait(300);

    check('清空后回到空态', function () {
        if (doc.getElementById('chartInput').value !== '') throw new Error('输入没清');
        if (chartTipText().indexOf('贴一段 JSON') < 0) throw new Error('提示: ' + chartTipText());
        if (!doc.getElementById('chartPickWrap').hidden) throw new Error('清空后选择器还留着');
        if (doc.getElementById('chartPickOptions').children.length !== 0) throw new Error('选择器还有旧选项');
    });

    check('预览缩放条：四个控件都在，空态时收起', function () {
        ['chartZoomOut', 'chartZoomFit', 'chartZoomValue', 'chartZoomIn'].forEach(function (id) {
            if (!doc.getElementById(id)) throw new Error('缺控件 ' + id);
        });
        if (!doc.getElementById('chartZoomBar').hidden) throw new Error('没图时缩放条该收起');
        if (doc.getElementById('chartZoomValue').textContent !== '100%') {
            throw new Error('默认比例 ' + doc.getElementById('chartZoomValue').textContent);
        }
        // 图片页用同一套控件（缩放只影响看，不改原始像素）
        ['imgZoomOut', 'imgZoomFit', 'imgZoomValue', 'imgZoomIn'].forEach(function (id) {
            if (!doc.getElementById(id)) throw new Error('图片页缺缩放控件 ' + id);
        });
        if (!doc.getElementById('imgZoomBar').hidden) throw new Error('没图时图片缩放条该收起');
    });

    check('重置宽高：按钮在，点了回到 700 × 400', function () {
        var btn = doc.getElementById('chartResetSize');
        if (!btn) throw new Error('缺「重置宽高」按钮');
        if (btn.textContent.trim() !== '重置宽高') throw new Error('按钮文案 ' + btn.textContent);
        doc.getElementById('chartWidth').value = '1200';
        doc.getElementById('chartHeight').value = '900';
        btn.click();
        if (doc.getElementById('chartWidth').value !== '700') throw new Error('宽没复位: ' + doc.getElementById('chartWidth').value);
        if (doc.getElementById('chartHeight').value !== '400') throw new Error('高没复位: ' + doc.getElementById('chartHeight').value);
    });

    check('类型下拉（shadcn 风格）：点选项就换、触发器跟着走', function () {
        // 原生 select 的弹层是系统画的，这里换成自定义下拉：选项在 .custom-select-options 里
        var typeBox = doc.getElementById('chartType');
        var label = typeBox.querySelector('.custom-select-trigger .label');
        var options = typeBox.querySelectorAll('.custom-option');
        if (options.length !== 6) throw new Error('类型选项数 ' + options.length);
        if (!typeBox.querySelector('.custom-option.selected')) throw new Error('没有默认选中项');
        var line = typeBox.querySelector('.custom-option[data-value="line"]');
        line.click();
        if (label.textContent !== '折线') throw new Error('触发器没跟着换: ' + label.textContent);
        if (!line.classList.contains('selected')) throw new Error('选中态没移过去');
        if (typeBox.querySelector('.custom-option[data-value="auto"]').classList.contains('selected')) {
            throw new Error('旧选项还占着 selected');
        }
        typeBox.querySelector('.custom-option[data-value="auto"]').click();
        if (label.textContent !== '自动') throw new Error('复位失败: ' + label.textContent);
    });

    check('像素比下拉：默认 1x、三档、选项标出实际像素', function () {
        var box = doc.getElementById('chartScale');
        if (!box) throw new Error('缺像素比下拉');
        var label = box.querySelector('.custom-select-trigger .label');
        if (label.textContent.trim() !== '1x') throw new Error('默认值不是 1x: ' + label.textContent);
        var options = box.querySelectorAll('.custom-option');
        if (options.length !== 3) throw new Error('档位数 ' + options.length);
        // 每档后面要写清这一档导出多少像素（尺寸 700 × 400 时：700/1400/2100）
        var expect = ['700 × 400', '1400 × 800', '2100 × 1200'];
        options.forEach(function (opt, i) {
            var badge = opt.querySelector('.chart-opt-size');
            if (!badge) throw new Error('第 ' + (i + 1) + ' 档缺实际像素');
            if (badge.textContent.trim() !== expect[i]) {
                throw new Error('第 ' + (i + 1) + ' 档标的是 ' + badge.textContent + '，应为 ' + expect[i]);
            }
        });
        // 触发器只放短标签（2x），不把尺寸塞进去
        options[1].click();
        if (label.textContent.trim() !== '2x') throw new Error('切 2x 后触发器是 ' + label.textContent);
        if (!options[1].classList.contains('selected')) throw new Error('选中态没移过去');
        var title = doc.getElementById('chartExportPng').title || '';
        if (title.indexOf('1400 × 800') < 0) throw new Error('导出按钮 title 没跟上: ' + title);
        options[0].click();
        if (label.textContent.trim() !== '1x') throw new Error('复位失败: ' + label.textContent);
    });

    check('灯箱：控件齐全、默认收起、Esc 能关', function () {
        ['imgLightbox', 'imgLightboxStage', 'imgLightboxImg', 'imgLightboxZoom',
            'imgLightboxOut', 'imgLightboxFit', 'imgLightboxActual', 'imgLightboxIn', 'imgLightboxClose']
            .forEach(function (id) {
                if (!doc.getElementById(id)) throw new Error('灯箱缺控件 ' + id);
            });
        if (!doc.getElementById('imgLightbox').hidden) throw new Error('灯箱默认不该展开');
        // 面板里的预览图要能被点（空态下没有 src，点了不该开）
        var prev = doc.getElementById('imgPreview');
        prev.hidden = false;
        prev.click();
        if (!doc.getElementById('imgLightbox').hidden) throw new Error('没图也打开了灯箱');
        prev.setAttribute('src', 'data:image/png;base64,iVBORw0KGgo=');
        prev.click();
        if (doc.getElementById('imgLightbox').hidden) throw new Error('有图却没打开灯箱');
        if (doc.getElementById('imgLightboxImg').getAttribute('src') !== 'data:image/png;base64,iVBORw0KGgo=') {
            throw new Error('灯箱没拿到图');
        }
        doc.getElementById('imgLightboxClose').click();
        if (!doc.getElementById('imgLightbox').hidden) throw new Error('关不掉');
        // 再开一次，用 Esc 收（键盘用户的主路径）
        prev.click();
        doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        if (!doc.getElementById('imgLightbox').hidden) throw new Error('Esc 关不掉');
        // 收拾干净，别影响后面的图片页用例
        prev.hidden = true;
        prev.removeAttribute('src');
    });

    doc.getElementById('chartExportPng').click();
    await wait(120);

    check('没有图时点导出：只提示，不抛错', function () {
        var toasts = [].map.call(doc.querySelectorAll('.toast'), function (t) { return t.textContent; }).join('|');
        if (toasts.indexOf('还没有可导出的图表') < 0) throw new Error('toast: ' + toasts);
    });

    check('图表页不碰格式化页的编辑器', function () {
        if (!doc.getElementById('mainWorkspace').classList.contains('hidden')) throw new Error('转换页没藏');
    });

    doc.getElementById('navBytes').click();
    await wait(200);

    check('离开图表页：工作区收起、回到字节页', function () {
        if (chartWs.classList.contains('active')) throw new Error('图表页没关');
        if (!doc.getElementById('bytesWorkspace').classList.contains('active')) throw new Error('没回到字节页');
    });

    // 收尾：回到格式转换页，后面的用例还要用
    doc.querySelector('#navConvertMenu a[data-src="json"][data-tgt="yaml"]').click();
    await wait(200);

    // ---------------- 全局拖放 ----------------
    // 表格输出走 CodeMirror，读 textarea.value 拿不到内容
    function cmText(id) {
        var el = doc.getElementById(id);
        var wrap = el && el.nextElementSibling;
        if (wrap && wrap.CodeMirror) return wrap.CodeMirror.getValue();
        return el ? el.value : '';
    }

    function dropFiles(entries, target) {
        var files = entries.map(function (e) {
            return new win.File([e.text], e.name, { type: e.type || 'text/plain' });
        });
        var ev = new win.Event('drop', { bubbles: true, cancelable: true });
        Object.defineProperty(ev, 'dataTransfer', { value: { files: files, types: ['Files'] } });
        (target || doc.body).dispatchEvent(ev);
        return ev;
    }

    dropFiles([{ name: 'data.json', text: '{"a":1,"b":[1,2]}' }]);
    await wait(500);

    check('拖入 JSON：留在格式转换页并认出源格式', function () {
        if (doc.querySelector('.toolbar').classList.contains('hidden')) throw new Error('不在转换页');
        if (input.value.indexOf('"a"') < 0) throw new Error('内容没载入');
        var src = doc.querySelector('#sourceSelect .custom-select-trigger .label').textContent.trim().toLowerCase();
        if (src !== 'json') throw new Error('源格式是 ' + src);
        if (!output.value.trim()) throw new Error('没有自动转换');
    });

    check('导入后提示条写出文件名与体积', function () {
        var tip = doc.getElementById('convertTip').textContent;
        if (tip.indexOf('data.json') < 0) throw new Error('提示里没有文件名: ' + tip);
        if (!/[0-9]+\s*(B|KB|MB)$/.test(tip.trim())) throw new Error('提示里没有体积: ' + tip);
    });

    dropFiles([{ name: 'users.csv', text: 'id,name\n1,Ada\n2,Bob\n' }]);
    await wait(700);

    check('在格式转换页拖 CSV：按页面自己支持的 CSV 读进来并转出结果', function () {
        if (doc.querySelector('.toolbar').classList.contains('hidden')) throw new Error('页面被换走了');
        if (doc.getElementById('sheetWorkspace').classList.contains('active')) throw new Error('不该自动进表格页');
        if (input.value.indexOf('Ada') < 0) throw new Error('CSV 内容没载入');
        var src = doc.querySelector('#sourceSelect .custom-select-trigger .label').textContent.trim().toLowerCase();
        if (src !== 'csv') throw new Error('源格式是 ' + src);
        if (!output.value.trim()) throw new Error('没有自动转换');
    });

    dropFiles([{ name: 'book.xlsx', text: 'PK' }]);
    await wait(400);

    check('文本页收到二进制表格：指路到表格页，不硬读', function () {
        var msg = [].map.call(doc.querySelectorAll('.toast'), function (t) { return t.textContent; }).join('|');
        if (msg.indexOf('表格') < 0) throw new Error('没有指路: ' + msg);
        if (input.value.indexOf('Ada') < 0) throw new Error('不该覆盖已有内容');
    });

    // ---------------- 「导入文件」按钮：所有文本页共用一条通道 ----------------
    check('各个文本页都有「导入文件」入口', function () {
        ['convertImport', 'cmpImportLeft', 'cmpImportRight', 'sqlImport', 'escImport', 'bytesImport',
            'chartImport', 'codeImport', 'queryImport', 'statsImport'].forEach(function (id) {
            if (!doc.getElementById(id)) throw new Error('缺少入口: ' + id);
        });
    });

    check('没导入过时格式转换页不留空白行', function () {
        var tip = doc.getElementById('convertTip');
        if (!tip.hidden && !tip.textContent) throw new Error('空提示行还占着位置');
    });

    doc.getElementById('convertImport').click();
    await wait(60);
    Object.defineProperty(doc.getElementById('pageImportInput'), 'files', {
        configurable: true,
        value: [new win.File(['{"btn":true}'], 'btn.json', { type: 'application/json' })]
    });
    doc.getElementById('pageImportInput').dispatchEvent(new win.Event('change', { bubbles: true }));
    await wait(600);

    check('点「导入文件」按钮也能读进当前页，并写出文件名', function () {
        if (input.value.indexOf('"btn"') < 0) throw new Error('按钮导入没生效');
        var tip = doc.getElementById('convertTip').textContent;
        if (tip.indexOf('btn.json') < 0) throw new Error('提示里没有文件名: ' + tip);
    });

    // 对比页左右各自导入：点哪边写哪边
    doc.getElementById('navCompare').click();
    await wait(500);
    Object.defineProperty(doc.getElementById('pageImportInput'), 'files', {
        configurable: true,
        value: [new win.File(['{"side":"right"}'], 'right.json', { type: 'application/json' })]
    });
    doc.getElementById('cmpImportRight').click();
    doc.getElementById('pageImportInput').dispatchEvent(new win.Event('change', { bubbles: true }));
    await wait(600);

    check('对比页「导入右侧」只写右栏，左栏不动', function () {
        if (cmText('cmpRightText').indexOf('side') < 0) throw new Error('右栏没载入');
        if (cmText('cmpLeftText').indexOf('side') >= 0) throw new Error('不该写进左栏');
        if (doc.getElementById('compareTip').textContent.indexOf('right.json') < 0) throw new Error('提示里没有文件名');
    });

    doc.querySelector('#navConvertMenu a[data-src="json"][data-tgt="yaml"]').click();
    await wait(300);

    doc.getElementById('navSheet').click();
    await wait(300);
    dropFiles([{ name: 'users.csv', text: 'id,name\n1,Ada\n2,Bob\n' }]);
    await wait(900);

    check('进了表格页再拖 CSV：解析出记录', function () {
        if (!doc.getElementById('sheetWorkspace').classList.contains('active')) throw new Error('不在表格页');
        if (cmText('sheetOutputText').indexOf('Ada') < 0) throw new Error('没解析出数据');
    });

    dropFiles([
        { name: 'a.csv', text: 'id,name\n1,Ada\n' },
        { name: 'b.csv', text: 'id,name\n2,Bob\n3,Cid\n' }
    ]);
    await wait(1500);

    check('一次拖两个 CSV：合并成一个 JSON（批量）', function () {
        var out = cmText('sheetOutputText');
        if (out.indexOf('"a.csv"') < 0 || out.indexOf('"b.csv"') < 0) throw new Error('没按文件名分组: ' + out.slice(0, 120));
        if (out.indexOf('Ada') < 0 || out.indexOf('Cid') < 0) throw new Error('数据没合并进来');
        if (doc.getElementById('sheetTip').textContent.indexOf('2') < 0) throw new Error('提示没写文件数');
        if (doc.getElementById('sheetFileInfo').textContent.indexOf('batch') < 0) throw new Error('文件名没切成批量名');
    });

    doc.querySelector('#sheetFormat [data-format="compact"]').click();
    await wait(300);

    check('批量结果能切换紧凑格式，仍然是合并 JSON', function () {
        var out = cmText('sheetOutputText');
        if (out.split('\n').length > 3) throw new Error('紧凑模式还是多行');
        if (out.indexOf('"b.csv"') < 0) throw new Error('紧凑后丢了文件');
    });

    doc.querySelector('#navConvertMenu a[data-src="json"][data-tgt="yaml"]').click();
    await wait(200);
    dropFiles([{ name: 'weird.zzz', text: '{"k":1}' }]);
    await wait(500);

    check('不认识的扩展名也当文本读进来（不按扩展名拒收）', function () {
        if (doc.querySelector('.toolbar').classList.contains('hidden')) throw new Error('被切页了');
        if (input.value.indexOf('"k"') < 0) throw new Error('内容没载入');
        if (!output.value.trim()) throw new Error('没有自动转换');
    });

    // 导航：7 个格式互转收进「格式转换」下拉，导航条上只剩 3 个单元
    var navEl = doc.getElementById('navLinks');
    // 左侧布局下整列是同一个容器（#navSide），收起时标记打在它身上
    var navSide = doc.getElementById('navSide');
    var moreEl = doc.getElementById('navMore');
    var moreMenu = doc.getElementById('navMoreMenu');
    var convertEl = doc.getElementById('navConvert');
    var convertMenu = doc.getElementById('navConvertMenu');

    function inlineNavLinks() {
        return [].slice.call(navEl.querySelectorAll('a')).filter(function (a) {
            return a.parentNode === navEl;
        });
    }

    // ---------- 二维码页（生成 / 解码） ----------
    var qrWs = doc.getElementById('qrWorkspace');

    function qrSetInput(text) {
        var wrap = doc.getElementById('qrInput').nextElementSibling;
        if (wrap && wrap.CodeMirror) wrap.CodeMirror.setValue(text);
        else doc.getElementById('qrInput').value = text;
    }
    function qrCards() {
        return [].slice.call(doc.querySelectorAll('#qrGrid .qr-card'));
    }

    doc.getElementById('navQr').click();
    await wait(160);

    check('点导航进二维码转换页：只在页里、一个编辑器', function () {
        if (!qrWs.classList.contains('active')) throw new Error('没进二维码页');
        if (!doc.querySelector('.toolbar').classList.contains('hidden')) throw new Error('格式转换工具栏还开着');
        if (doc.querySelectorAll('#qrWorkspace .CodeMirror').length !== 1) {
            throw new Error('编辑器数量 ' + doc.querySelectorAll('#qrWorkspace .CodeMirror').length);
        }
    });

    check('默认生成模式：参数行在、解码区收起', function () {
        if (doc.getElementById('qrGenGrid').hidden) throw new Error('生成区被藏了');
        if (!doc.getElementById('qrScanGrid').hidden) throw new Error('解码区没藏');
        if (doc.getElementById('qrOptions').hidden) throw new Error('参数行没显示');
        if (doc.getElementById('qrDownloadAll').hidden) throw new Error('「全部导出」没显示');
        if (!doc.getElementById('qrScanPickTop').hidden) throw new Error('解码按钮显示了');
    });

    qrSetInput('设备编号 DV-2048\n\n访问量 12 次');
    await wait(600);

    check('一行一个码：空行跳过，行号跟着原位置', function () {
        var cards = qrCards();
        if (cards.length !== 2) throw new Error('卡片数 ' + cards.length);
        if (cards[0].getAttribute('data-line') !== '1') throw new Error('第一张行号 ' + cards[0].getAttribute('data-line'));
        if (cards[1].getAttribute('data-line') !== '3') throw new Error('第二张行号 ' + cards[1].getAttribute('data-line'));
    });

    check('每张卡都有 SVG 码面和序号', function () {
        var card = qrCards()[0];
        if (!card.querySelector('.qr-card-media svg')) throw new Error('没有 SVG');
        if (card.querySelectorAll('.qr-card-media path').length !== 1) throw new Error('path 不是一条');
        var no = card.querySelector('.qr-card-no').textContent.trim();
        if (no !== '第 1 个') throw new Error('序号: ' + no);
    });

    qrSetInput('只有一条内容');
    await wait(600);

    check('单条内容用大卡片展示', function () {
        if (!doc.getElementById('qrGrid').classList.contains('is-single')) throw new Error('没切到大卡片');
        if (qrCards().length !== 1) throw new Error('卡片数 ' + qrCards().length);
    });

    check('点卡片头可以折叠 / 展开', function () {
        var card = qrCards()[0];
        var toggle = card.querySelector('.qr-card-toggle');
        toggle.click();
        if (!card.classList.contains('is-collapsed')) throw new Error('没收起');
        if (toggle.getAttribute('aria-expanded') !== 'false') {
            throw new Error('aria-expanded: ' + toggle.getAttribute('aria-expanded'));
        }
        toggle.click();
        if (card.classList.contains('is-collapsed')) throw new Error('没收回展开');
        if (toggle.getAttribute('aria-expanded') !== 'true') throw new Error('收起来后 aria-expanded 没复原');
    });

    qrSetInput('第一行\n第二行\n第三行');
    await wait(600);

    var qrWrap = doc.getElementById('qrInput').nextElementSibling;
    qrWrap.CodeMirror.setCursor({ line: 2, ch: 0 });

    check('光标落在第 3 行 -> 对应卡片高亮', function () {
        var card = doc.querySelector('#qrGrid .qr-card[data-line="3"]');
        if (!card) throw new Error('找不到第 3 行的卡片');
        if (!card.classList.contains('locate')) throw new Error('没高亮');
        if (doc.querySelectorAll('#qrGrid .qr-card.locate').length !== 1) throw new Error('高亮不止一个');
    });

    check('取色器与十六进制输入框双向同步', function () {
        var picker = doc.getElementById('qrFgPicker');
        var text = doc.getElementById('qrFg');
        picker.value = '#123456';
        picker.dispatchEvent(new win.Event('input', { bubbles: true }));
        if (text.value !== '#123456') throw new Error('取色器没写回文本框: ' + text.value);
        text.value = '#abc';
        text.dispatchEvent(new win.Event('input', { bubbles: true }));
        if (picker.value !== '#aabbcc') throw new Error('文本框没推给取色器: ' + picker.value);
        text.value = '#000000';
        text.dispatchEvent(new win.Event('input', { bubbles: true }));
    });

    var qrExportMaskEl = doc.getElementById('qrExportMask');

    check('单张导出：卡片按钮打开面板，默认文件名是 qr-01', function () {
        var btn = qrCards()[0].querySelector('.qr-mini');
        if (!btn || btn.textContent.trim() !== '导出') {
            throw new Error('按钮文字: ' + (btn && btn.textContent.trim()));
        }
        if (!qrExportMaskEl.hidden) throw new Error('面板一开始就是开的');
        btn.click();
        if (qrExportMaskEl.hidden) throw new Error('点了没开面板');
        if (doc.getElementById('qrExportName').value !== 'qr-01') {
            throw new Error('默认文件名: ' + doc.getElementById('qrExportName').value);
        }
        if (doc.getElementById('qrExportExt').textContent !== '.png') {
            throw new Error('后缀: ' + doc.getElementById('qrExportExt').textContent);
        }
        var fmt = doc.querySelector('#qrExportFormat .compare-tab.active');
        if (!fmt || fmt.dataset.exportFormat !== 'png') throw new Error('格式没高亮 PNG');
    });

    check('导出面板：切 SVG 后后缀、提示、尺寸快选一起变', function () {
        doc.querySelector('#qrExportFormat [data-export-format="svg"]').click();
        if (doc.getElementById('qrExportExt').textContent !== '.svg') throw new Error('后缀没变');
        if (!doc.getElementById('qrExportNote').textContent) throw new Error('没有矢量提示');
        doc.querySelector('#qrExportSizeChips [data-export-size="1024"]').click();
        if (doc.getElementById('qrExportSize').value !== '1024') throw new Error('尺寸没写进输入框');
        var chip = doc.querySelector('#qrExportSizeChips .compare-tab.active');
        if (!chip || chip.dataset.exportSize !== '1024') throw new Error('快选没高亮');
    });

    check('导出面板：Esc 关闭，下一张默认名字跟序号、格式记得上次', function () {
        qrExportMaskEl.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        if (!qrExportMaskEl.hidden) throw new Error('Esc 没关掉');
        qrCards()[1].querySelector('.qr-mini').click();
        if (doc.getElementById('qrExportName').value !== 'qr-02') {
            throw new Error('第二张的默认名字: ' + doc.getElementById('qrExportName').value);
        }
        if (doc.getElementById('qrExportExt').textContent !== '.svg') throw new Error('没记住上次的格式');
    });

    check('导出面板：点遮罩空白处也关闭', function () {
        qrExportMaskEl.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
        if (!qrExportMaskEl.hidden) throw new Error('点遮罩没关');
    });

    check('双击码面：灯箱里是重新矢量画的大图，标题带内容与尺寸', function () {
        var lb = doc.getElementById('imgLightbox');
        if (!lb) throw new Error('页面里没有灯箱');
        if (!lb.hidden) throw new Error('灯箱一开始就是开的');
        var media = qrCards()[1].querySelector('.qr-card-media');
        if (media.getAttribute('title') !== '双击放大查看') {
            throw new Error('码面提示: ' + media.getAttribute('title'));
        }
        media.dispatchEvent(new win.MouseEvent('dblclick', { bubbles: true }));
        if (lb.hidden) throw new Error('双击没开灯箱');
        var src = doc.getElementById('imgLightboxImg').getAttribute('src') || '';
        if (src.indexOf('data:image/svg+xml') !== 0) throw new Error('大图源不是 SVG: ' + src.slice(0, 40));
        var label = doc.getElementById('imgLightboxName').textContent;
        if (!label.trim()) throw new Error('标题是空的');
        if (label.indexOf('1024') < 0) throw new Error('标题里没有尺寸: ' + label);
    });

    check('灯箱：Esc 关闭，点图外空白也关闭', function () {
        var lb = doc.getElementById('imgLightbox');
        doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        if (!lb.hidden) throw new Error('Esc 没关掉灯箱');
        qrCards()[0].querySelector('.qr-card-media').dispatchEvent(new win.MouseEvent('dblclick', { bubbles: true }));
        if (lb.hidden) throw new Error('第二张双击没开');
        doc.getElementById('imgLightboxStage').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
        if (!lb.hidden) throw new Error('点空白没关掉');
    });

    doc.querySelector('#qrModeTabs [data-qr-mode="decode"]').click();

    check('切到解码模式：参数行收起、上传区出现', function () {
        if (!doc.getElementById('qrGenGrid').hidden) throw new Error('生成区没藏');
        if (doc.getElementById('qrScanGrid').hidden) throw new Error('解码区没显示');
        if (!doc.getElementById('qrOptions').hidden) throw new Error('参数行没收起');
        if (doc.getElementById('qrScanPickTop').hidden) throw new Error('「选择图片」没显示');
        if (!doc.getElementById('qrDownloadAll').hidden) throw new Error('「全部导出」还在');
    });

    check('解码区初始是空态', function () {
        if (doc.getElementById('qrScanEmpty').hidden) throw new Error('右侧空态没显示');
    });

    doc.querySelector('#qrModeTabs [data-qr-mode="encode"]').click();
    // 灯箱开着的时候换页：不该把二维码大图带到格式转换页上
    qrCards()[0].querySelector('.qr-card-media').dispatchEvent(new win.MouseEvent('dblclick', { bubbles: true }));
    doc.querySelector('#navConvertMenu a[data-src="json"][data-tgt="yaml"]').click();

    check('从二维码页回到格式转换页：工具栏回来', function () {
        if (doc.querySelector('.toolbar').classList.contains('hidden')) throw new Error('工具栏还藏着');
        if (qrWs.classList.contains('active')) throw new Error('二维码页还开着');
        if (!doc.getElementById('imgLightbox').hidden) throw new Error('灯箱还盖在页面上');
    });

    check('7 个格式入口收在「格式转换」下拉里', function () {
        if (convertMenu.querySelectorAll('a').length !== 7) {
            throw new Error('下拉项数 ' + convertMenu.querySelectorAll('a').length);
        }
        // 直属项（从左到右）：JSON 对比 / SQL 转换 / 图片 Base64 / 转义工具 / 字节转换 / JSON 转图表 / 时间转换 / 二维码转换 / 代码生成 / 表格转 JSON / 数据统计 / 查询校验
        if (inlineNavLinks().length !== 13) throw new Error('导航条上直属项 ' + inlineNavLinks().length);
        if (!doc.getElementById('navConvertTrigger')) throw new Error('缺少「格式转换」触发器');
        // 触发器直接显示当前这一对格式，而不是固定的「格式转换」
        var label = doc.getElementById('navConvertLabel').textContent.trim();
        if (label !== 'json转yaml') throw new Error('触发器文案: ' + label);
        if (doc.getElementById('navConvertTrigger').title !== 'json转yaml') throw new Error('触发器 title 未同步');
    });

    check('宽度足够时不显示「更多」', function () {
        if (moreEl.classList.contains('show')) throw new Error('「更多」不该出现');
        if (doc.getElementById('navMoreTrigger').textContent.indexOf('更多') === -1) throw new Error('「更多」文案缺失');
    });

    // 导航位置切换：默认顶部，可切到左侧（偏好由宿主 storage 记忆，这里只验布局）
    check('默认是顶部导航，切换按钮在', function () {
        if (!doc.getElementById('navToggle')) throw new Error('缺少切换按钮');
        if (doc.body.classList.contains('nav-left')) throw new Error('默认不该是左侧');
        if (inlineNavLinks().length !== 13) throw new Error('顶部直属项 ' + inlineNavLinks().length);
        var label = doc.getElementById('navToggle').getAttribute('aria-label') || '';
        if (label.indexOf('左侧') === -1) throw new Error('提示文案: ' + label);
    });

    doc.getElementById('navToggle').click();
    check('点切换后导航变左侧', function () {
        if (!doc.body.classList.contains('nav-left')) throw new Error('没切到左侧');
        // 竖排能放下全部项，不该再收进「更多」
        if (inlineNavLinks().length !== 13) throw new Error('左侧直属项 ' + inlineNavLinks().length);
        if (moreEl.classList.contains('show')) throw new Error('左侧模式不该出现「更多」');
        var label = doc.getElementById('navToggle').getAttribute('aria-label') || '';
        if (label.indexOf('顶部') === -1) throw new Error('提示没切成「顶部」: ' + label);
    });

    check('左侧模式下布局偏好也写进 window.name（沙箱兜底）', function () {
        var name = String(win.name || '');
        if (name.indexOf('dbx-nav:left') === -1) throw new Error('window.name: ' + JSON.stringify(name));
    });

    check('左侧模式下「格式转换」下拉照常切换格式', function () {
        doc.getElementById('navConvertTrigger').click();
        if (!convertEl.classList.contains('open')) throw new Error('没展开');
        convertMenu.querySelector('a[data-src="json"][data-tgt="properties"]').click();
        if (convertEl.classList.contains('open')) throw new Error('选完未收起');
        var label = doc.getElementById('navConvertLabel').textContent.trim();
        if (label !== 'json转properties') throw new Error('触发器: ' + label);
    });

    // ---- 左列收起 / 展开 ----
    var navCollapseBtn = doc.getElementById('navCollapse');

    function storedPrefs() {
        // window.name 里是 `dbx-nav:left dbx-navc:%7B...`，值做过 URL 编码
        var name = String(win.name || '');
        var at = name.indexOf('dbx-navc:');
        if (at < 0) return {};
        try { return JSON.parse(decodeURIComponent(name.slice(at + 'dbx-navc:'.length))) || {}; } catch (e) { return {}; }
    }

    check('左侧导航能收起：整列让开、栏从无障碍树里摘掉', function () {
        if (!navCollapseBtn) throw new Error('缺少收起按钮');
        if (navCollapseBtn.getAttribute('aria-expanded') !== 'true') {
            throw new Error('初始 aria-expanded: ' + navCollapseBtn.getAttribute('aria-expanded'));
        }
        if ((navCollapseBtn.getAttribute('aria-label') || '').indexOf('收起') === -1) {
            throw new Error('初始提示: ' + navCollapseBtn.getAttribute('aria-label'));
        }
        navCollapseBtn.click();
        if (!doc.body.classList.contains('nav-collapsed')) throw new Error('没加上 nav-collapsed');
        if (!navSide.hasAttribute('inert')) throw new Error('收起后 Tab 还能进导航');
        if (navSide.getAttribute('aria-hidden') !== 'true') throw new Error('没标 aria-hidden');
        if (navCollapseBtn.getAttribute('aria-expanded') !== 'false') throw new Error('aria-expanded 没跟着变');
        if ((navCollapseBtn.getAttribute('aria-label') || '').indexOf('展开') === -1) {
            throw new Error('提示没切成展开: ' + navCollapseBtn.getAttribute('aria-label'));
        }
        if (storedPrefs().collapsed !== true) throw new Error('没写进偏好: ' + String(win.name || '').slice(0, 80));
    });

    check('再点一次展开：类摘掉、导航重新可点', function () {
        navCollapseBtn.click();
        if (doc.body.classList.contains('nav-collapsed')) throw new Error('nav-collapsed 还在');
        if (navSide.hasAttribute('inert')) throw new Error('展开后还是 inert');
        if (navSide.hasAttribute('aria-hidden')) throw new Error('aria-hidden 没摘掉');
        if (navCollapseBtn.getAttribute('aria-expanded') !== 'true') throw new Error('aria-expanded 没还原');
        if (storedPrefs().collapsed !== false) throw new Error('偏好没更新');
    });

    check('收起状态跨布局保留：切到顶部自动失效，切回左侧还是收起的', function () {
        navCollapseBtn.click();                       // 收起
        doc.getElementById('navToggle').click();      // 切到顶部
        if (doc.body.classList.contains('nav-left')) throw new Error('没切到顶部');
        // 顶部布局下收起不成立：类要摘掉，否则顶部导航整条都点不到
        if (doc.body.classList.contains('nav-collapsed')) throw new Error('顶部布局还带着收起类');
        if (navSide.hasAttribute('inert')) throw new Error('顶部布局的导航被设成 inert');
        if (inlineNavLinks().length !== 13) throw new Error('顶部直属项 ' + inlineNavLinks().length);
        doc.getElementById('navToggle').click();      // 切回左侧
        if (!doc.body.classList.contains('nav-collapsed')) throw new Error('切回左侧没恢复收起状态');
        if (!navSide.hasAttribute('inert')) throw new Error('恢复收起后没设 inert');
        navCollapseBtn.click();                       // 展开，给后面的用例留干净状态
        if (doc.body.classList.contains('nav-collapsed')) throw new Error('收尾没展开');
    });

    // ---- 图标按钮的悬浮提示（自己画的气泡，不靠原生 title） ----
    var tipEl = doc.getElementById('tip');
    var tipTitleBefore = navCollapseBtn.getAttribute('title');
    navCollapseBtn.dispatchEvent(new win.MouseEvent('mouseover', { bubbles: true }));
    await wait(220);

    check('图标按钮悬停后弹出功能提示（不靠原生 title）', function () {
        if (!tipEl) throw new Error('缺少提示气泡');
        if (tipEl.hidden) throw new Error('悬停 220ms 还没出现');
        if (!tipEl.classList.contains('show')) throw new Error('没进入显示状态');
        if (tipEl.textContent !== navCollapseBtn.getAttribute('aria-label')) {
            throw new Error('文案没跟着按钮走: ' + tipEl.textContent);
        }
        if (tipEl.textContent.indexOf('收起') === -1) throw new Error('文案: ' + tipEl.textContent);
        // 原生 title 会另弹一个气泡叠在上面，悬停期间先摘掉
        if (navCollapseBtn.hasAttribute('title')) throw new Error('title 还挂着，会跟自绘气泡重叠');
        if (tipEl.getAttribute('role') !== 'tooltip') throw new Error('没标 role=tooltip');
    });

    navCollapseBtn.dispatchEvent(new win.MouseEvent('mouseout', { bubbles: true, relatedTarget: doc.body }));
    check('移开指针：气泡收起，title 还回去', function () {
        if (!tipEl.hidden) throw new Error('移开没收起');
        if (tipEl.classList.contains('show')) throw new Error('show 类没摘掉');
        if (navCollapseBtn.getAttribute('title') !== tipTitleBefore) {
            throw new Error('title 没还原: ' + navCollapseBtn.getAttribute('title'));
        }
    });

    check('键盘聚焦也弹提示，Esc 收起', function () {
        navCollapseBtn.dispatchEvent(new win.FocusEvent('focusin', { bubbles: true }));
        if (tipEl.hidden) throw new Error('聚焦没弹提示');
        doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        if (!tipEl.hidden) throw new Error('Esc 没收起');
    });

    // ---- 功能搜索：中文 / 近义词 / 英文 / 全拼 / 首字母缩写 ----
    var searchInput = doc.getElementById('navSearchInput');
    var searchList = doc.getElementById('navSearchList');

    function typeSearch(q) {
        searchInput.value = q;
        searchInput.dispatchEvent(new win.Event('input', { bubbles: true }));
        // 空态那一条没有 key，别把它当成结果
        return [].map.call(searchList.children, function (li) { return li.dataset.navSearchKey || ''; })
            .filter(function (k) { return !!k; });
    }

    check('搜索框在、提示语走 i18n、初始不显示结果', function () {
        if (!searchInput) throw new Error('缺少搜索框');
        if (searchInput.getAttribute('data-i18n-placeholder') !== 'navSearchPlaceholder') {
            throw new Error('占位符没接 i18n');
        }
        if (searchInput.placeholder.indexOf('搜索') === -1) throw new Error('占位符: ' + searchInput.placeholder);
        if (!searchList.hidden) throw new Error('初始就显示结果');
    });

    check('首字母缩写能命中：ewm / sj / tp / jsondb / sjzh', function () {
        var ewm = typeSearch('ewm');
        if (ewm[0] !== 'navQr') throw new Error('ewm -> ' + ewm.join(','));
        var sj = typeSearch('sj');
        if (sj[0] !== 'navTime') throw new Error('sj -> ' + sj.join(','));
        var tp = typeSearch('tp');
        if (tp[0] !== 'navImage') throw new Error('tp -> ' + tp.join(','));
        var jsondb = typeSearch('jsondb');
        if (jsondb[0] !== 'navCompare') throw new Error('jsondb -> ' + jsondb.join(','));
        var sjzh = typeSearch('sjzh');
        if (sjzh[0] !== 'navTime') throw new Error('sjzh -> ' + sjzh.join(','));
    });

    check('全拼与中文近义词都能命中', function () {
        var shijian = typeSearch('shijian');
        if (shijian[0] !== 'navTime') throw new Error('shijian -> ' + shijian.join(','));
        var tupian = typeSearch('tupian');
        if (tupian[0] !== 'navImage') throw new Error('tupian -> ' + tupian.join(','));
        var ts = typeSearch('时间戳');
        if (ts[0] !== 'navTime') throw new Error('时间戳 -> ' + ts.join(','));
        var diff = typeSearch('差异');
        if (diff[0] !== 'navCompare') throw new Error('差异 -> ' + diff.join(','));
        var excel = typeSearch('excel');
        if (excel[0] !== 'navSheet') throw new Error('excel -> ' + excel.join(','));
    });

    check('数据统计能搜到：sjtj / tongji / 求和 / stats / sum', function () {
        ['sjtj', 'tongji', 'tj', '统计', '求和', '分组', 'stats', 'statistics', 'sum', 'mean', 'group by']
            .forEach(function (q) {
                var keys = typeSearch(q);
                if (keys.indexOf('navStats') < 0) throw new Error(q + ' -> ' + keys.join(','));
            });
    });

    check('命中近义词时右侧标出命中的词，找不到就给空态文案', function () {
        typeSearch('差异');
        var first = searchList.querySelector('[data-nav-search-key]');
        var hint = first && first.querySelector('.ns-hit');
        if (!hint || hint.textContent !== '差异') throw new Error('没标命中词: ' + (hint && hint.textContent));
        var none = typeSearch('zzz');
        if (none.length) throw new Error('不该有结果: ' + none.join(','));
        var empty = searchList.querySelector('.nav-search-empty');
        if (!empty || empty.textContent.indexOf('没有') === -1) throw new Error('空态没出来');
    });

    check('回车打开第一条（直接调导航的点击处理），打开后收起并清空', function () {
        // 桩打在 handleNavClick 上：搜索选中不靠「合成 click 冒泡到顶栏」，
        // 宿主（Tauri WebView）里那条委托收不到合成点击，就是「回车收起但页面没跳」
        var realPick = win.handleNavClick;
        var picked = '';
        win.handleNavClick = function (el) { picked = el && el.id; };
        try {
            typeSearch('ewm');
            searchInput.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
            if (picked !== 'navQr') throw new Error('回车没打开第一条: ' + picked);
            if (!searchList.hidden) throw new Error('打开后没收起');
            if (searchInput.value !== '') throw new Error('打开后没清空');
            if (searchInput.getAttribute('aria-expanded') !== 'false') throw new Error('aria-expanded 没复位');
        } finally {
            win.handleNavClick = realPick;
        }
    });

    check('格式转换下拉里的方向也能搜到，页面排在它们前面', function () {
        var yaml = typeSearch('yaml');
        var convertRows = yaml.filter(function (k) { return k.indexOf('convert:') === 0; });
        if (!convertRows.length) throw new Error('没搜到转换方向: ' + yaml.join(','));
        if (convertRows.length > 3) throw new Error('转换方向太多了: ' + convertRows.length);
        var json = typeSearch('json');
        // 页面（JSON 对比 / JSON 转图表 / 表格转 JSON）必须排在二级入口前面
        var isSecondary = function (k) {
            return k.indexOf('convert:') === 0 || k.indexOf('format:') === 0 || k.indexOf('tab:') === 0;
        };
        var firstSecondary = -1;
        for (var i = 0; i < json.length; i++) {
            if (isSecondary(json[i])) { firstSecondary = i; break; }
        }
        var pageCount = json.filter(function (k) { return !isSecondary(k); }).length;
        if (firstSecondary >= 0 && firstSecondary < pageCount) throw new Error('二级入口插到页面前面了: ' + json.join(','));
        typeSearch('格式转换');
        if (!searchList.querySelector('[data-nav-search-key] .ns-hit')) throw new Error('转换方向没标「格式转换」');
    });

    check('选一个转换方向：直接调导航的点击处理，切到那一对', function () {
        var realPick = win.handleNavClick;
        var picked = '';
        win.handleNavClick = function (el) {
            picked = (el.dataset.src || '') + '>' + (el.dataset.tgt || '');
        };
        try {
            typeSearch('yaml转json');
            searchInput.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
            if (picked !== 'yaml>json') throw new Error('没选中转换方向: ' + picked);
            if (!searchList.hidden) throw new Error('选完没收起');
        } finally {
            win.handleNavClick = realPick;
        }
    });

    check('工具栏「从 / 转为」里的格式也能搜到：名字带方向', function () {
        var rows = typeSearch('toml');
        if (rows.indexOf('format:sourceSelect:toml') < 0) throw new Error('没搜到「从 TOML」: ' + rows.join(','));
        if (rows.indexOf('format:targetSelect:toml') < 0) throw new Error('没搜到「转为 TOML」: ' + rows.join(','));
        var names = [].map.call(searchList.querySelectorAll('.ns-name'), function (el) { return el.textContent; });
        if (names.indexOf('从 TOML') < 0 || names.indexOf('转为 TOML') < 0) throw new Error('名字没带方向: ' + names.join('|'));
        // 下拉值当关键词：.env 这种显示文字和值不一样的也搜得到
        var env = typeSearch('env');
        if (env.indexOf('format:sourceSelect:env') < 0) throw new Error('env 没搜到 .env: ' + env.join(','));
        // 页面仍然排在格式前面
        var csv = typeSearch('csv');
        if (csv[0] !== 'navSheet') throw new Error('csv 第一条应该是表格页: ' + csv.join(','));
    });

    doc.getElementById('navQr').click();
    await wait(160);

    check('在别的页面搜格式：选完先回格式转换页，再把那一栏切过去', function () {
        if (!doc.getElementById('qrWorkspace').classList.contains('active')) throw new Error('没进二维码页');
        var inWrap = doc.getElementById('inputText').nextElementSibling;
        if (inWrap && inWrap.CodeMirror) inWrap.CodeMirror.setValue('');
        var rows = typeSearch('toml');
        var idx = rows.indexOf('format:targetSelect:toml');
        if (idx < 0) throw new Error('没搜到「转为 TOML」: ' + rows.join(','));
        for (var i = 0; i < idx; i++) {
            searchInput.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        }
        searchInput.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        if (doc.getElementById('qrWorkspace').classList.contains('active')) throw new Error('没退出二维码页');
        if (doc.querySelector('.toolbar').classList.contains('hidden')) throw new Error('格式转换工具栏没回来');
        var on = doc.querySelector('#targetSelect .custom-option.selected');
        if (!on || on.dataset.value !== 'toml') throw new Error('转为那一栏没切到 toml: ' + (on && on.dataset.value));
        var label = doc.querySelector('#targetSelect .custom-select-trigger .label').textContent.trim();
        if (label.toLowerCase() !== 'toml') throw new Error('触发器文案 ' + label);
    });

    check('上下键循环选中，Esc 一下收干净（列表、输入、顶栏都还回去）', function () {
        var rows = typeSearch('t');
        if (rows.length < 2) throw new Error('结果太少，测不出上下键: ' + rows.join(','));
        if (!searchList.querySelector('.is-active')) throw new Error('没有默认高亮');
        searchInput.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        var active = [].findIndex.call(searchList.children, function (li) {
            return li.classList.contains('is-active');
        });
        if (active !== 1) throw new Error('下键没换到第二条: ' + active);
        searchInput.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
        var back = [].findIndex.call(searchList.children, function (li) {
            return li.classList.contains('is-active');
        });
        if (back !== 0) throw new Error('上键没回到第一条: ' + back);
        searchInput.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        if (!searchList.hidden) throw new Error('Esc 没收列表');
        if (searchInput.value !== '') throw new Error('Esc 没收输入');
        if (doc.body.classList.contains('nav-searching')) throw new Error('Esc 后顶栏还没还回来');
    });

    // ---- 搜索入口：放大镜按钮 / 快捷键，以及「回车真的跳页」----
    var searchBtn = doc.getElementById('navSearchBtn');

    check('搜索按钮的文案带当前平台的快捷键（⌘K / Ctrl+K）', function () {
        if (!searchBtn) throw new Error('缺少搜索按钮');
        var label = searchBtn.getAttribute('aria-label') || '';
        if (label.indexOf('搜索') === -1) throw new Error('按钮没有说明: ' + label);
        if (!/⌘K|Ctrl\+K/.test(label)) throw new Error('文案里没有快捷键: ' + label);
        var keys = searchInput.getAttribute('aria-keyshortcuts') || '';
        if (keys !== 'Meta+K' && keys !== 'Control+K') throw new Error('aria-keyshortcuts: ' + keys);
        if (!/⌘K|Ctrl\+K/.test(searchInput.placeholder)) throw new Error('placeholder 没标快捷键: ' + searchInput.placeholder);
    });

    check('点放大镜打开搜索：顶栏让出导航那一行，再点收起还回来', function () {
        searchBtn.click();
        if (!doc.body.classList.contains('nav-searching')) throw new Error('没进搜索态');
        if (searchBtn.getAttribute('aria-expanded') !== 'true') throw new Error('aria-expanded 没同步');
        if (doc.activeElement !== searchInput) throw new Error('没自动聚焦输入框');
        // 顶部布局下导航那一行与「更多」要让出来（靠 CSS 隐藏，jsdom 不做布局，读样式表确认规则在）
        if (CSS_TEXT.indexOf('body:not(.nav-left).nav-searching .nav-side') === -1) {
            throw new Error('缺少「搜索时让出导航」的样式规则');
        }
        searchBtn.click();
        if (doc.body.classList.contains('nav-searching')) throw new Error('再点没收起');
        if (searchBtn.getAttribute('aria-expanded') !== 'false') throw new Error('aria-expanded 没复位');
        if (inlineNavLinks().length !== 13) throw new Error('收起后导航没回来: ' + inlineNavLinks().length);
    });

    check('Ctrl+K / ⌘K 也能唤起搜索', function () {
        doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
        if (!doc.body.classList.contains('nav-searching')) throw new Error('Ctrl+K 没打开');
        doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }));
        if (!doc.body.classList.contains('nav-searching')) throw new Error('⌘K 没打开');
        doc.getElementById('navSearchInput').dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        if (doc.body.classList.contains('nav-searching')) throw new Error('Esc 没收起');
    });

    check('输入法上屏过程中的回车不抢：列表还在，页面也不动', function () {
        searchBtn.click();
        typeSearch('sj');
        if (searchList.hidden) throw new Error('没出结果');
        searchInput.dispatchEvent(new win.KeyboardEvent('keydown', {
            key: 'Enter', keyCode: 229, isComposing: true, bubbles: true
        }));
        if (searchList.hidden) throw new Error('上屏时的回车把列表收了');
        if (searchInput.value !== 'sj') throw new Error('输入被清掉了: ' + searchInput.value);
        searchInput.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    check('点顶栏里的语言按钮不会把搜索收掉（边搜边切语言是常事）', function () {
        searchBtn.click();
        typeSearch('sj');
        doc.getElementById('langTrigger').click();
        if (!doc.body.classList.contains('nav-searching')) throw new Error('点语言按钮把搜索关了');
        if (!doc.getElementById('langMenu').classList.contains('open')) throw new Error('语言菜单没打开');
        doc.getElementById('langTrigger').click();
        searchInput.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    check('组词期间不重排：搜索框和列表都不动，等上屏再搜', function () {
        if (!doc.body.classList.contains('nav-searching')) searchBtn.click();
        typeSearch('sj');
        if (searchList.hidden) throw new Error('前置：没出结果');
        var before = searchList.children.length;
        searchInput.dispatchEvent(new win.Event('compositionstart'));
        // 组词中很多宿主给的 value 还是空的——以前这一下会走 navSearchClose()，
        // 把输入框 display:none 掉并清空 value，候选窗当场就没了
        searchInput.value = '';
        searchInput.dispatchEvent(new win.Event('input', { bubbles: true }));
        if (!doc.body.classList.contains('nav-searching')) throw new Error('组词把搜索框收了');
        if (searchList.hidden) throw new Error('组词时列表被收了');
        if (searchList.children.length !== before) throw new Error('组词时重排了列表');
        // 上屏：这时 value 里才是真正的汉字
        searchInput.value = '时间';
        searchInput.dispatchEvent(new win.Event('compositionend'));
        if (searchList.hidden) throw new Error('上屏后没出结果');
        var top = searchList.querySelector('.nav-search-item');
        if (!top || top.dataset.navSearchKey !== 'navTime') {
            throw new Error('上屏后没命中时间转换: ' + (top && top.dataset.navSearchKey));
        }
        searchInput.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    check('输入清空时只收下拉、不收搜索框（清掉重打不会把框弄没）', function () {
        if (!doc.body.classList.contains('nav-searching')) searchBtn.click();
        typeSearch('sj');
        searchInput.value = '';
        searchInput.dispatchEvent(new win.Event('input', { bubbles: true }));
        if (!searchList.hidden) throw new Error('空值没收起下拉');
        if (!doc.body.classList.contains('nav-searching')) throw new Error('空值把搜索框也收了');
        if (searchInput.getAttribute('aria-expanded') !== 'false') throw new Error('aria-expanded 没复位');
        // 还能接着打
        var rows = typeSearch('ewm');
        if (rows[0] !== 'navQr') throw new Error('清空后不能接着搜: ' + rows.join(','));
        searchInput.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    check('组词中按数字键选词不被打断（keydown 一律放过）', function () {
        if (!doc.body.classList.contains('nav-searching')) searchBtn.click();
        typeSearch('sj');
        searchInput.dispatchEvent(new win.Event('compositionstart'));
        var pick = '';
        var realPick = win.handleNavClick;
        win.handleNavClick = function () { pick = 'picked'; };
        try {
            ['1', '2', '3'].forEach(function (k) {
                var evt = new win.KeyboardEvent('keydown', { key: k, keyCode: 229, bubbles: true });
                searchInput.dispatchEvent(evt);
            });
            if (pick) throw new Error('组词中按数字键被当成选结果');
            if (!doc.body.classList.contains('nav-searching')) throw new Error('组词中数字键把搜索收了');
            if (searchInput.value !== 'sj') throw new Error('组词中数字键把输入清了: ' + searchInput.value);
        } finally {
            win.handleNavClick = realPick;
            searchInput.dispatchEvent(new win.Event('compositionend'));
            searchInput.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        }
    });

    check('页内二级功能也能搜到：搜「转图片」先切页、再按下那个 tab', function () {
        if (!doc.body.classList.contains('nav-searching')) searchBtn.click();
        var rows = typeSearch('转图片');
        if (rows.indexOf('tab:imgModeTabs:decode') < 0) {
            throw new Error('没索引到「Base64 转图片」: ' + rows.join(','));
        }
        searchInput.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        if (!doc.getElementById('imageWorkspace').classList.contains('active')) throw new Error('没切到图片页');
        var decodeTab = doc.querySelector('#imgModeTabs [data-mode="decode"]');
        if (!decodeTab.classList.contains('active')) throw new Error('「Base64 转图片」没按下去');
        // 回格式转换页，别把后面的用例带跑
        doc.querySelector('#navConvertMenu a[data-src="yaml"][data-tgt="json"]').click();
        if (doc.getElementById('imageWorkspace').classList.contains('active')) throw new Error('没回到格式转换页');
    });

    check('tab 名字分得清：INSERT / Schema 各自命中，右侧标着所属页面', function () {
        if (!doc.body.classList.contains('nav-searching')) searchBtn.click();
        var sql = typeSearch('insert');
        if (sql.indexOf('tab:sqlTemplates:insert') < 0) throw new Error('没命中 SQL 模板 INSERT: ' + sql.join(','));
        var schema = typeSearch('schema');
        if (schema.indexOf('tab:queryTabs:schema') < 0) throw new Error('没命中 Schema 校验: ' + schema.join(','));
        // hint 里带页面名，两个「解码」才分得清
        var esc = typeSearch('解码');
        if (esc.indexOf('tab:escDirTabs:decode') < 0) throw new Error('没命中转义解码: ' + esc.join(','));
        var qr = typeSearch('二维码');
        if (qr.indexOf('tab:qrModeTabs:decode') < 0) throw new Error('没命中二维码解码: ' + qr.join(','));
        // 转义的种类 chip 是脚本渲染的：第一次建索引时得先催出来
        var b64 = typeSearch('base64');
        if (b64.indexOf('tab:escKinds:base64') < 0) throw new Error('没命中转义 Base64: ' + b64.join(','));
        var hint = searchList.querySelector('.ns-hit');
        if (!hint || !hint.textContent.trim()) throw new Error('tab 结果右侧没有所属页面');
        searchInput.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    check('回车真的切到那一页（不靠合成点击冒泡）', function () {
        doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
        typeSearch('sj');
        searchInput.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        if (!doc.getElementById('timeWorkspace').classList.contains('active')) throw new Error('没切到时间转换页');
        if (doc.body.classList.contains('nav-searching')) throw new Error('切完还占着顶栏');
        if (!doc.getElementById('navTime').classList.contains('active')) throw new Error('导航项没高亮');
        // 回格式转换页，别把后面的用例带跑
        doc.querySelector('#navConvertMenu a[data-src="yaml"][data-tgt="json"]').click();
        if (doc.getElementById('timeWorkspace').classList.contains('active')) throw new Error('没回到格式转换页');
    });

    doc.getElementById('navToggle').click();
    check('再点一次回到顶部导航', function () {
        if (doc.body.classList.contains('nav-left')) throw new Error('没切回顶部');
        if (inlineNavLinks().length !== 13) throw new Error('回顶部后直属项 ' + inlineNavLinks().length);
        var label = doc.getElementById('navToggle').getAttribute('aria-label') || '';
        if (label.indexOf('左侧') === -1) throw new Error('提示没切成「左侧」: ' + label);
        if (String(win.name || '').indexOf('dbx-nav:top') === -1) throw new Error('window.name 没跟着回到 top: ' + win.name);
    });

    check('「格式转换」下拉点开、点空白收起', function () {
        doc.getElementById('navConvertTrigger').click();
        if (!convertEl.classList.contains('open')) throw new Error('未展开');
        if (doc.getElementById('navConvertTrigger').getAttribute('aria-expanded') !== 'true') throw new Error('aria-expanded 未同步');
        doc.body.click();
        if (convertEl.classList.contains('open')) throw new Error('未收起');
        doc.getElementById('navConvertTrigger').click();
        doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        if (convertEl.classList.contains('open')) throw new Error('Escape 未收起');
    });

    check('下拉里的格式入口能切换格式、选中项高亮', function () {
        var item = convertMenu.querySelector('a[data-src="json"][data-tgt="xml"]');
        item.click();
        var srcLabel = doc.querySelector('#sourceSelect .custom-select-trigger .label').textContent.trim();
        var tgtLabel = doc.querySelector('#targetSelect .custom-select-trigger .label').textContent.trim();
        if (srcLabel.toLowerCase() !== 'json' || tgtLabel.toLowerCase() !== 'xml') {
            throw new Error('变成了 ' + srcLabel + '→' + tgtLabel);
        }
        if (!item.classList.contains('active')) throw new Error('选中项未高亮');
        if (convertEl.classList.contains('open')) throw new Error('选完未收起');
        if (doc.getElementById('navConvertLabel').textContent.trim() !== 'json转xml') {
            throw new Error('触发器没跟着变: ' + doc.getElementById('navConvertLabel').textContent.trim());
        }
    });

    // 导航溢出 → 「更多」：jsdom 没有布局，宽高靠 stub
    Object.defineProperty(navEl, 'clientWidth', { configurable: true, get: function () { return 120; } });
    Object.defineProperty(navEl, 'scrollWidth', { configurable: true, get: function () { return navEl.children.length * 90; } });
    dom.window.dispatchEvent(new dom.window.Event('resize'));
    await wait(250);

    check('导航装不下时连置顶项也会被收进「更多」，顺序仍按导航来', function () {
        if (!moreEl.classList.contains('show')) throw new Error('「更多」未出现');
        var names = [].map.call(moreMenu.querySelectorAll('a'), function (a) { return a.textContent.trim(); });
        // 120px 只塞得下一项：先是非置顶的搬走，还不够才动置顶项，塞得下就停；
        // 菜单顺序必须接着导航条往下排（置顶项在最前）
        var expect = ['SQL 转换', '图片 Base64', '转义工具', '字节转换', 'JSON 转图表',
            '时间转换', '二维码转换', '代码生成', '表格转 JSON', '数据统计', 'SQL 分析', '查询校验'];
        if (names.join('|') !== expect.join('|')) {
            throw new Error('菜单项: ' + names.join(','));
        }
        var inline = inlineNavLinks().map(function (a) { return a.id; });
        if (inline.join(',') !== 'navCompare') throw new Error('导航条上还剩 ' + inline.join(','));
    });

    check('「格式转换」下拉不会被搬进「更多」', function () {
        if (!convertEl.isConnected) throw new Error('下拉被搬走了');
        // 「格式转换」和那排导航项一起装在 #navSide 里（顶部布局下它是 display: contents）
        if (convertEl.parentNode !== doc.getElementById('navSide')) throw new Error('下拉不在导航容器里了');
        if (moreMenu.querySelector('#navConvertTrigger')) throw new Error('触发器进了「更多」');
        if (navEl.querySelector('#navConvert')) throw new Error('下拉又被塞回 nav-links，菜单会被 overflow 裁掉');
    });

    check('点「更多」可展开、再点页面空白可收起', function () {
        doc.getElementById('navMoreTrigger').click();
        if (!moreEl.classList.contains('open')) throw new Error('未展开');
        if (doc.getElementById('navMoreTrigger').getAttribute('aria-expanded') !== 'true') throw new Error('aria-expanded 未同步');
        doc.body.click();
        if (moreEl.classList.contains('open')) throw new Error('未收起');
    });

    check('「更多」里的页面入口照样能进对应页面', function () {
        var item = moreMenu.querySelector('a');
        var id = item.id;
        item.click();
        var pageOf = {
            navSql: 'sqlWorkspace',
            navCompare: 'compareWorkspace',
            navSheet: 'sheetWorkspace',
            navImage: 'imageWorkspace',
            navCodegen: 'codeWorkspace',
            navQuery: 'queryWorkspace',
            navEscape: 'escWorkspace',
            navBytes: 'bytesWorkspace',
            navChart: 'chartWorkspace',
            navTime: 'timeWorkspace',
            navQr: 'qrWorkspace',
            navStats: 'statsWorkspace',
            navDataSql: 'dataSqlWorkspace'
        };
        if (!pageOf[id]) throw new Error('菜单项不是页面入口: ' + item.textContent.trim());
        if (!doc.getElementById(pageOf[id]).classList.contains('active')) {
            throw new Error('未进入 ' + pageOf[id]);
        }
        if (moreEl.classList.contains('open')) throw new Error('选完未收起');
        // 回到转换页，后面的用例还要接着用
        doc.querySelector('#navConvertMenu a[data-src="json"][data-tgt="yaml"]').click();
        if (doc.querySelector('.toolbar').classList.contains('hidden')) throw new Error('没回到转换页');
    });

    Object.defineProperty(navEl, 'clientWidth', { configurable: true, get: function () { return 4000; } });
    dom.window.dispatchEvent(new dom.window.Event('resize'));
    await wait(250);

    check('宽度恢复后导航项全部回到导航条', function () {
        if (moreEl.classList.contains('show')) throw new Error('「更多」仍显示');
        if (moreMenu.querySelectorAll('a').length !== 0) throw new Error('菜单仍有残留');
        if (inlineNavLinks().length !== 13) throw new Error('导航项数 ' + inlineNavLinks().length);
        if (convertMenu.querySelectorAll('a').length !== 7) throw new Error('下拉项数 ' + convertMenu.querySelectorAll('a').length);
    });

    // ---- 导航设置：自定义顺序 / 置顶 / 吸顶 ----
    var navCustomizeBtn = doc.getElementById('navCustomize');
    var navPanelMask = doc.getElementById('navPanelMask');
    var navPanelList = doc.getElementById('navPanelList');
    var navStickyToggle = doc.getElementById('navStickyToggle');

    function panelRows() {
        return [].map.call(navPanelList.children, function (row) { return row.dataset.navRow; });
    }
    function panelPinned() {
        return [].filter.call(navPanelList.children, function (row) {
            return row.classList.contains('is-pinned');
        }).map(function (row) { return row.dataset.navRow; });
    }
    function navIds() {
        return inlineNavLinks().map(function (a) { return a.id; });
    }

    check('顶栏有「自定义导航」入口，面板默认收起', function () {
        if (!navCustomizeBtn) throw new Error('缺少按钮');
        if ((navCustomizeBtn.getAttribute('aria-label') || '').indexOf('自定义') === -1) {
            throw new Error('提示文案: ' + navCustomizeBtn.getAttribute('aria-label'));
        }
        if (navCustomizeBtn.title.indexOf('自定义') === -1) throw new Error('缺 title');
        if (!navPanelMask.hidden) throw new Error('面板默认就开着');
    });

    navCustomizeBtn.click();
    check('面板列出全部 13 项，顺序跟导航条一致', function () {
        if (navPanelMask.hidden) throw new Error('面板没打开');
        var rows = panelRows();
        if (rows.length !== 13) throw new Error('行数 ' + rows.length);
        if (rows.join(',') !== navIds().join(',')) {
            throw new Error('面板 ' + rows.join(',') + ' / 导航 ' + navIds().join(','));
        }
    });

    check('默认置顶就是原来那两个主入口', function () {
        if (panelPinned().join(',') !== 'navCompare,navSql') throw new Error('置顶项: ' + panelPinned().join(','));
        var btn = navPanelList.querySelector('[data-nav-row="navCompare"] [data-nav-act="pin"]');
        if (btn.getAttribute('aria-pressed') !== 'true') throw new Error('置顶按钮没标 aria-pressed');
        if (!btn.classList.contains('on')) throw new Error('置顶按钮没高亮');
    });

    check('点置顶：该项跳到置顶块末尾，导航条同步', function () {
        navPanelList.querySelector('[data-nav-row="navQr"] [data-nav-act="pin"]').click();
        if (navIds().slice(0, 3).join(',') !== 'navCompare,navSql,navQr') {
            throw new Error('导航顺序: ' + navIds().join(','));
        }
        if (panelRows().slice(0, 3).join(',') !== 'navCompare,navSql,navQr') {
            throw new Error('面板顺序: ' + panelRows().join(','));
        }
        if (panelPinned().length !== 3) throw new Error('置顶数 ' + panelPinned().length);
    });

    check('取消置顶：回到普通块的最前面', function () {
        navPanelList.querySelector('[data-nav-row="navQr"] [data-nav-act="pin"]').click();
        var rows = panelRows();
        if (rows.slice(0, 3).join(',') !== 'navCompare,navSql,navQr') {
            throw new Error('取消置顶后位置: ' + rows.slice(0, 3).join(','));
        }
        if (panelPinned().join(',') !== 'navCompare,navSql') throw new Error('置顶项: ' + panelPinned().join(','));
    });

    check('箭头：上移 / 下移改顺序，导航条跟着变', function () {
        var before = panelRows();
        navPanelList.querySelector('[data-nav-row="' + before[2] + '"] [data-nav-act="down"]').click();
        var after = panelRows();
        if (after[2] !== before[3] || after[3] !== before[2]) {
            throw new Error('没换位: ' + before.slice(2, 4).join(',') + ' -> ' + after.slice(2, 4).join(','));
        }
        navPanelList.querySelector('[data-nav-row="' + before[2] + '"] [data-nav-act="up"]').click();
        if (panelRows().join(',') !== before.join(',')) throw new Error('上移没还原: ' + panelRows().join(','));
        if (navIds().join(',') !== before.join(',')) throw new Error('导航条没跟着: ' + navIds().join(','));
    });

    check('两头和置顶边界上的箭头禁用（不能靠箭头跨块）', function () {
        if (!navPanelList.children[0].querySelector('[data-nav-act="up"]').disabled) {
            throw new Error('首项还能上移');
        }
        var boundary = navPanelList.children[2].querySelector('[data-nav-act="up"]');
        if (!boundary.disabled) throw new Error('普通块首项还能上移挤进置顶块');
    });

    // ---- 拖拽排序：宿主里 HTML5 拖放收不到事件，走的是自己的 pointer 实现 ----
    // jsdom 不做布局，这里临时给 .nv-row 造一套「30px 一行、按当前索引堆叠」的几何
    function stubRowRects(fn) {
        var proto = win.Element.prototype;
        var orig = proto.getBoundingClientRect;
        proto.getBoundingClientRect = function () {
            if (this.classList && this.classList.contains('nv-row') && this.parentNode === navPanelList) {
                var i = [].indexOf.call(navPanelList.children, this);
                return { top: i * 30, bottom: i * 30 + 30, height: 30, left: 0, right: 200, width: 200, x: 0, y: i * 30 };
            }
            return { top: 0, bottom: 0, height: 0, left: 0, right: 0, width: 0, x: 0, y: 0 };
        };
        try { return fn(); } finally { proto.getBoundingClientRect = orig; }
    }
    function pointerDownOn(row, y) {
        row.querySelector('.nv-grip').dispatchEvent(new win.PointerEvent('pointerdown', {
            bubbles: true, cancelable: true, clientY: y, button: 0, pointerId: 1
        }));
    }
    function pointerMoveTo(y) {
        doc.dispatchEvent(new win.PointerEvent('pointermove', { bubbles: true, cancelable: true, clientY: y, pointerId: 1 }));
    }
    function pointerUpAt(y) {
        doc.dispatchEvent(new win.PointerEvent('pointerup', { bubbles: true, clientY: y, pointerId: 1 }));
    }

    check('拖拽排序：按住行往上拖，拖动中顺序就跟着变，松手落库', function () {
        stubRowRects(function () {
            var rows = panelRows();
            var pinCount = panelPinned().length;
            var srcId = rows[pinCount + 3];           // 置顶块之后第 4 条，肯定不是置顶
            var row = navPanelList.querySelector('[data-nav-row="' + srcId + '"]');
            pointerDownOn(row, (pinCount + 3) * 30 + 15);
            if (row.classList.contains('dragging')) throw new Error('刚按下就标了 dragging');
            // 拖到普通块第一行的上半区：应该插到普通块最前面（置顶块之后）
            pointerMoveTo(pinCount * 30 + 5);
            if (!row.classList.contains('dragging')) throw new Error('拖动中没标 dragging');
            if (!doc.body.classList.contains('nv-sorting')) throw new Error('拖动中没加 nv-sorting');
            if (panelRows()[pinCount] !== srcId) throw new Error('拖动中没插到位: ' + panelRows().join(','));
            pointerUpAt(pinCount * 30 + 5);
            if (panelRows()[pinCount] !== srcId) throw new Error('松手后顺序回弹: ' + panelRows().join(','));
            if (navIds()[pinCount] !== srcId) throw new Error('导航条没跟着: ' + navIds().join(','));
            if (row.classList.contains('dragging')) throw new Error('松手没摘 dragging');
            if (doc.body.classList.contains('nv-sorting')) throw new Error('松手没摘 nv-sorting');
            if (panelPinned().indexOf(srcId) !== -1) throw new Error('拖一下变成置顶了');
        });
    });

    check('拖拽不许跨过置顶块（往上拖到顶也只能落在普通块首位）', function () {
        stubRowRects(function () {
            var pinCount = panelPinned().length;
            var rows = panelRows();
            var srcId = rows[rows.length - 1];        // 最后一条往上拖
            pointerDownOn(navPanelList.querySelector('[data-nav-row="' + srcId + '"]'), (rows.length - 1) * 30 + 15);
            pointerMoveTo(0);                          // 拖到置顶块正中也不行
            pointerUpAt(0);
            if (panelRows()[pinCount] !== srcId) throw new Error('位置: ' + panelRows().join(','));
            if (panelPinned().length !== pinCount) throw new Error('置顶块被改动了');
        });
    });

    check('只点不拖（位移不到 4px）不算排序，点按钮照常生效', function () {
        stubRowRects(function () {
            var before = panelRows();
            var last = before[before.length - 1];
            pointerDownOn(navPanelList.querySelector('[data-nav-row="' + last + '"]'), 100);
            pointerMoveTo(102);
            pointerUpAt(102);
            if (panelRows().join(',') !== before.join(',')) throw new Error('抖动一下就被当成拖拽: ' + panelRows().join(','));
            // 按钮上的按下不进入拖拽状态
            var pinBtn = navPanelList.querySelector('[data-nav-row="' + last + '"] [data-nav-act="pin"]');
            pinBtn.dispatchEvent(new win.PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientY: 100, button: 0, pointerId: 2 }));
            pointerMoveTo(200);
            pointerUpAt(200);
            if (panelRows().join(',') !== before.join(',')) throw new Error('按在按钮上也开始拖了: ' + panelRows().join(','));
        });
    });

    check('拖到一半按 Esc 关面板：顺序照样落库，指针监听收掉不会继续跟手', function () {
        stubRowRects(function () {
            var rows = panelRows();
            var pinCount = panelPinned().length;
            var srcId = rows[rows.length - 1];
            pointerDownOn(navPanelList.querySelector('[data-nav-row="' + srcId + '"]'), (rows.length - 1) * 30 + 15);
            pointerMoveTo(pinCount * 30 + 5);
            if (panelRows()[pinCount] !== srcId) throw new Error('拖动中没插到位: ' + panelRows().join(','));
            doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            if (!navPanelMask.hidden) throw new Error('Esc 没关面板');
            if (panelRows()[pinCount] !== srcId) throw new Error('顺序没保留: ' + panelRows().join(','));
            if (doc.body.classList.contains('nv-sorting')) throw new Error('nv-sorting 没摘掉');
            // 监听已收：关面板后再移动指针不该继续改顺序
            var frozen = panelRows().join(',');
            pointerMoveTo(0);
            pointerUpAt(0);
            if (panelRows().join(',') !== frozen) throw new Error('指针监听没收掉: ' + panelRows().join(','));
        });
        navCustomizeBtn.click();
    });

    check('吸顶开关：打开加类、关掉摘掉', function () {
        if (navStickyToggle.checked) throw new Error('默认不该开');
        navStickyToggle.checked = true;
        navStickyToggle.dispatchEvent(new win.Event('change'));
        if (!doc.body.classList.contains('nav-sticky')) throw new Error('没加上 nav-sticky');
        navStickyToggle.checked = false;
        navStickyToggle.dispatchEvent(new win.Event('change'));
        if (doc.body.classList.contains('nav-sticky')) throw new Error('关掉后类还在');
    });

    check('恢复默认：顺序、置顶、吸顶一起回出厂', function () {
        navPanelList.querySelector('[data-nav-row="navQr"] [data-nav-act="pin"]').click();
        doc.getElementById('navPanelReset').click();
        if (navIds().slice(0, 3).join(',') !== 'navCompare,navSql,navImage') {
            throw new Error('顺序: ' + navIds().join(','));
        }
        if (panelPinned().join(',') !== 'navCompare,navSql') throw new Error('置顶项: ' + panelPinned().join(','));
        if (navStickyToggle.checked) throw new Error('吸顶没复位');
    });

    // 以后新增页面：直接往导航条里加一个 <a>，不改任何已存偏好也得能排上
    var navFuture = doc.createElement('a');
    navFuture.id = 'navFuture';
    navFuture.textContent = '未来功能';
    navEl.appendChild(navFuture);
    dom.window.dispatchEvent(new dom.window.Event('resize'));
    await wait(250);

    // 重新打开面板：行是在打开时按当前导航现画的
    navCustomizeBtn.click();
    check('新增的导航项自动排在末尾（不用迁移已存偏好）', function () {
        var ids = navIds();
        if (ids[ids.length - 1] !== 'navFuture') throw new Error('顺序: ' + ids.join(','));
        if (panelRows().indexOf('navFuture') === -1) throw new Error('面板里没出现新项: ' + panelRows().join(','));
    });
    check('新项也能置顶、也能被记住', function () {
        navPanelList.querySelector('[data-nav-row="navFuture"] [data-nav-act="pin"]').click();
        if (navIds()[2] !== 'navFuture') throw new Error('置顶后顺序: ' + navIds().join(','));
        var name = String(win.name || '');
        if (name.indexOf('navFuture') === -1) throw new Error('没写进窗口记忆: ' + name);
        // 面板行数跟着长到 13
        if (panelRows().length !== 14) throw new Error('行数 ' + panelRows().length);
    });

    check('偏好存在独立 key/token 里，旧版本那套读写不会碰它', function () {
        var name = String(win.name || '');
        if (name.indexOf('dbx-navc:') === -1) throw new Error('缺 dbx-navc token: ' + name);
        if (name.indexOf('dbx-nav:') === -1) throw new Error('旧的 dbx-nav token 丢了: ' + name);
        // 0.1.8 的写法：把 dbx-nav:xxx 整段替换掉再写回
        var legacy = name.replace(/(?:^|\s)dbx-nav:(left|top)(?=\s|$)/g, '').trim();
        if (legacy.indexOf('dbx-navc:') === -1) throw new Error('回退到旧版本后新 token 被抹掉: ' + legacy);
        if (legacy.indexOf('dbx-nav:') !== -1) throw new Error('旧版本没清掉自己的 token: ' + legacy);
        // 布局偏好仍然是 left / top 两个值，没被 JSON 污染
        var layoutOk = true;
        try {
            var v = win.localStorage.getItem('navLayout');
            layoutOk = !v || v === 'left' || v === 'top';
        } catch (e) { /* 沙箱里 localStorage 会抛，走 window.name 那一路 */ }
        if (!layoutOk) throw new Error('navLayout 被写脏');
    });

    check('Esc 与点遮罩都能关面板', function () {
        doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        if (!navPanelMask.hidden) throw new Error('Esc 没关');
        navCustomizeBtn.click();
        if (navPanelMask.hidden) throw new Error('没重新打开');
        navPanelMask.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
        if (!navPanelMask.hidden) throw new Error('点遮罩没关');
        navCustomizeBtn.click();
        doc.getElementById('navPanelDone').click();
        if (!navPanelMask.hidden) throw new Error('「完成」没关');
    });

    // 收尾：把临时加的项摘掉，顺序恢复出厂，后面的用例按默认状态断言
    navFuture.parentNode.removeChild(navFuture);
    navCustomizeBtn.click();
    doc.getElementById('navPanelReset').click();
    doc.getElementById('navPanelDone').click();
    dom.window.dispatchEvent(new dom.window.Event('resize'));
    await wait(250);

    check('摘掉临时项后回到 13 项、出厂顺序', function () {
        if (inlineNavLinks().length !== 13) throw new Error('项数 ' + inlineNavLinks().length);
        if (navIds().slice(0, 2).join(',') !== 'navCompare,navSql') throw new Error('顺序: ' + navIds().join(','));
    });


    // 宿主主题：模拟 DBX 只通过 dbxPlugin.theme 下发、自己没写 data-dbx-theme 的情况
    await (async function () {
        var hostDom = new JSDOM(html, {
            url: 'file://' + path.join(ROOT, 'ui/index.html'),
            runScripts: 'dangerously',
            resources: 'usable',
            pretendToBeVisual: true,
            virtualConsole: new (require('jsdom').VirtualConsole)(),
            beforeParse: function (window) {
                window.matchMedia = function () {
                    return { matches: false, addEventListener: function () {}, removeEventListener: function () {} };
                };
                var zeroRect = function () {
                    return { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 };
                };
                var emptyRects = function () {
                    return { length: 0, item: function () { return null; }, [Symbol.iterator]: function* () {} };
                };
                window.Range.prototype.getBoundingClientRect = zeroRect;
                window.Range.prototype.getClientRects = emptyRects;
                window.Element.prototype.getBoundingClientRect = zeroRect;
                window.Element.prototype.getClientRects = emptyRects;
                window.dbxPlugin = {
                    ready: Promise.resolve({}),
                    locale: 'zh-CN',
                    theme: { appearance: 'dark', tokens: { '--color-background': '#302b21' } },
                    capabilities: {}
                };
            }
        });
        await new Promise(function (resolve) {
            hostDom.window.addEventListener('load', resolve, { once: true });
        });
        await wait(250);
        var hdoc = hostDom.window.document;

        check('宿主给暗色主题时自动进入暗色（不依赖宿主写 data 属性）', function () {
            var actual = hdoc.documentElement.getAttribute('data-dbx-theme');
            if (actual !== 'dark') throw new Error('data-dbx-theme=' + actual);
        });

        check('暗色下编辑器切成 material-darker', function () {
            var cm = hdoc.querySelector('.CodeMirror');
            if (!cm) throw new Error('没找到编辑器');
            if (cm.className.indexOf('cm-s-material-darker') === -1) throw new Error('编辑器主题: ' + cm.className);
        });

        // ---- 主题切换过渡 ----
        check('首屏应用主题时不挂过渡类（避免白底淡入）', function () {
            if (hdoc.documentElement.classList.contains('theme-anim')) throw new Error('首屏就挂了 theme-anim');
        });

        function pushTheme(theme) {
            hostDom.window.dispatchEvent(new hostDom.window.CustomEvent('dbx-plugin-env', { detail: { theme: theme } }));
        }

        pushTheme({ appearance: 'light', tokens: { '--color-background': '#fdfcf9' } });
        check('切换主题时立即挂上过渡类', function () {
            if (!hdoc.documentElement.classList.contains('theme-anim')) throw new Error('没挂 theme-anim');
            if (hdoc.documentElement.getAttribute('data-dbx-theme') !== 'light') throw new Error('主题没切');
        });

        check('编辑器主题延后到过渡中点才换（避免暗底压深字）', function () {
            var cm = hdoc.querySelector('.CodeMirror');
            if (cm.className.indexOf('cm-s-material-darker') === -1) {
                throw new Error('第 0ms 就换掉了: ' + cm.className);
            }
        });

        await wait(180);
        check('过渡中段编辑器已切成 default', function () {
            var cm = hdoc.querySelector('.CodeMirror');
            if (cm.className.indexOf('cm-s-default') === -1) throw new Error('还没换: ' + cm.className);
        });

        await wait(260);
        check('过渡结束会摘掉过渡类', function () {
            if (hdoc.documentElement.classList.contains('theme-anim')) throw new Error('theme-anim 没清掉');
        });

        pushTheme({ appearance: 'light', tokens: { '--color-background': '#ff0000' } });
        check('只换皮肤（明暗不变）也走过渡', function () {
            if (!hdoc.documentElement.classList.contains('theme-anim')) throw new Error('换皮肤没过渡');
        });
        await wait(420);

        hostDom.window.close();

        // reduce-motion：不做过渡
        var calmDom = new JSDOM(html, {
            url: 'file://' + path.join(ROOT, 'ui/index.html'),
            runScripts: 'dangerously',
            resources: 'usable',
            pretendToBeVisual: true,
            virtualConsole: new (require('jsdom').VirtualConsole)(),
            beforeParse: function (window) {
                window.matchMedia = function (query) {
                    return { matches: String(query).indexOf('prefers-reduced-motion') !== -1, addEventListener: function () {}, removeEventListener: function () {} };
                };
                var zeroRect = function () {
                    return { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 };
                };
                var emptyRects = function () {
                    return { length: 0, item: function () { return null; }, [Symbol.iterator]: function* () {} };
                };
                window.Range.prototype.getBoundingClientRect = zeroRect;
                window.Range.prototype.getClientRects = emptyRects;
                window.Element.prototype.getBoundingClientRect = zeroRect;
                window.Element.prototype.getClientRects = emptyRects;
                window.dbxPlugin = {
                    ready: Promise.resolve({}),
                    locale: 'zh-CN',
                    theme: { appearance: 'dark', tokens: { '--color-background': '#302b21' } },
                    capabilities: {}
                };
            }
        });
        await new Promise(function (resolve) {
            calmDom.window.addEventListener('load', resolve, { once: true });
        });
        await wait(250);
        calmDom.window.dispatchEvent(new calmDom.window.CustomEvent('dbx-plugin-env', {
            detail: { theme: { appearance: 'light', tokens: { '--color-background': '#ffffff' } } }
        }));
        check('reduce-motion 下不挂过渡类（直接切）', function () {
            var doc = calmDom.window.document;
            if (doc.documentElement.classList.contains('theme-anim')) throw new Error('仍然挂了 theme-anim');
            if (doc.documentElement.getAttribute('data-dbx-theme') !== 'light') throw new Error('主题没切');
        });
        calmDom.window.close();
    })();

    // ---------------- 宿主 fileTransfer 路径 ----------------
    // DBX 是 Tauri 应用，原生拖放被 WebView 层接管，页面里收不到 HTML5 drop，
    // 只能吃 dbxPlugin.fileTransfer.onDrop 给的 handleId。这里模拟宿主把文件塞进来。
    await (async function () {
        var buffers = {};
        var seq = 0;
        var dropCb = null;
        var dragCb = null;

        function stubLayout(window) {
            window.matchMedia = function () {
                return { matches: false, addEventListener: function () {}, removeEventListener: function () {} };
            };
            var zeroRect = function () {
                return { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 };
            };
            var emptyRects = function () {
                return { length: 0, item: function () { return null; }, [Symbol.iterator]: function* () {} };
            };
            window.Range.prototype.getBoundingClientRect = zeroRect;
            window.Range.prototype.getClientRects = emptyRects;
            window.Element.prototype.getBoundingClientRect = zeroRect;
            window.Element.prototype.getClientRects = emptyRects;
        }

        var dom2 = new JSDOM(html, {
            url: 'file://' + path.join(ROOT, 'ui/index.html'),
            runScripts: 'dangerously',
            resources: 'usable',
            pretendToBeVisual: true,
            virtualConsole: new (require('jsdom').VirtualConsole)(),
            beforeParse: function (window) {
                stubLayout(window);
                // 宿主只有在 ready 之后才挂 fileTransfer，跟真实运行时一致
                window.dbxPlugin = {
                    ready: Promise.resolve({}),
                    locale: 'zh-CN',
                    theme: { appearance: 'light', tokens: {} },
                    capabilities: { fileTransfer: { drop: true } },
                    fileTransfer: {
                        onDrop: function (cb) { dropCb = cb; },
                        onDragState: function (cb) { dragCb = cb; },
                        read: function (handleId, offset, len) {
                            var buf = buffers[handleId];
                            if (!buf) return Promise.reject(new Error('bad handle'));
                            var end = Math.min(offset + len, buf.length);
                            return Promise.resolve({
                                dataBase64: Buffer.from(buf.slice(offset, end)).toString('base64'),
                                eof: end >= buf.length
                            });
                        }
                    }
                };
            }
        });
        var w2 = dom2.window;
        var d2 = w2.document;
        await new Promise(function (resolve) {
            w2.addEventListener('load', resolve, { once: true });
        });
        await wait(300);

        // 投喂：{ name, text, size? } -> 走宿主 onDrop 的 entry 形状
        function feed(entries) {
            var list = entries.map(function (e) {
                var id = 'h' + (++seq);
                var bytes = Buffer.from(e.text || '', 'utf8');
                buffers[id] = new Uint8Array(bytes);
                return {
                    name: e.name,
                    handleId: e.handleId === null ? undefined : id,
                    size: e.size != null ? e.size : bytes.length,
                    contentType: e.type || 'text/plain'
                };
            });
            return dropCb(list);
        }
        function toastText() {
            return [].map.call(d2.querySelectorAll('.toast'), function (t) { return t.textContent; }).join('|');
        }
        function cmText2(id) {
            var el = d2.getElementById(id);
            var wrap = el && el.nextElementSibling;
            if (wrap && wrap.CodeMirror) return wrap.CodeMirror.getValue();
            return el ? el.value : '';
        }

        check('宿主 ready 后注册了 onDrop / onDragState', function () {
            if (typeof dropCb !== 'function') throw new Error('没注册 onDrop');
            if (typeof dragCb !== 'function') throw new Error('没注册 onDragState');
        });

        check('宿主拖入时显示蒙层，离开后收起', function () {
            dragCb(true);
            if (d2.getElementById('dropVeil').hidden) throw new Error('拖入没显示蒙层');
            dragCb(false);
            if (!d2.getElementById('dropVeil').hidden) throw new Error('离开没收起蒙层');
        });

        await feed([{ name: 'data.json', text: '{"a":1,"b":[1,2]}' }]);
        await wait(600);

        check('宿主拖入 JSON：留在格式转换页、认出源格式并自动转换', function () {
            var input = d2.getElementById('inputText');
            if (!input || input.value.indexOf('"a"') < 0) throw new Error('内容没载入');
            if (d2.querySelector('.toolbar').classList.contains('hidden')) throw new Error('不在转换页');
            var src = d2.querySelector('#sourceSelect .custom-select-trigger .label').textContent.trim().toLowerCase();
            if (src !== 'json') throw new Error('源格式是 ' + src);
            if (!d2.getElementById('outputText').value.trim()) throw new Error('没有自动转换');
        });

        await feed([{ name: 'users.csv', text: 'id,name\n1,Ada\n2,Bob\n' }]);
        await wait(700);

        check('宿主在格式转换页拖 CSV：照 CSV 读进来，不自动跳页', function () {
            if (d2.getElementById('sheetWorkspace').classList.contains('active')) throw new Error('不该自动进表格页');
            if (d2.querySelector('.toolbar').classList.contains('hidden')) throw new Error('页面被换走了');
            if (d2.getElementById('inputText').value.indexOf('Ada') < 0) throw new Error('CSV 内容没载入');
            var src2 = d2.querySelector('#sourceSelect .custom-select-trigger .label').textContent.trim().toLowerCase();
            if (src2 !== 'csv') throw new Error('源格式是 ' + src2);
        });

        d2.getElementById('navSheet').click();
        await wait(300);
        await feed([{ name: 'users.csv', text: 'id,name\n1,Ada\n2,Bob\n' }]);
        await wait(900);

        check('宿主在表格页拖 CSV：解析出记录', function () {
            if (!d2.getElementById('sheetWorkspace').classList.contains('active')) throw new Error('不在表格页');
            if (cmText2('sheetOutputText').indexOf('Ada') < 0) throw new Error('没解析出数据');
        });

        await feed([
            { name: 'a.csv', text: 'id,name\n1,Ada\n' },
            { name: 'b.csv', text: 'id,name\n2,Bob\n3,Cid\n' }
        ]);
        await wait(1500);

        check('宿主一次拖两个 CSV：合并成一个 JSON', function () {
            var out = cmText2('sheetOutputText');
            if (out.indexOf('"a.csv"') < 0 || out.indexOf('"b.csv"') < 0) throw new Error('没按文件名分组: ' + out.slice(0, 120));
            if (out.indexOf('Cid') < 0) throw new Error('数据没合并进来');
        });

        d2.querySelector('#navConvertMenu a[data-src="json"][data-tgt="yaml"]').click();
        await wait(200);
        await feed([{ name: 'weird.zzz', text: '{"k":1}' }]);
        await wait(500);

        check('宿主拖入不认识的扩展名：当文本读进来，不报错也不切页', function () {
            if (d2.querySelector('.toolbar').classList.contains('hidden')) throw new Error('被切页了');
            if (d2.getElementById('inputText').value.indexOf('"k"') < 0) throw new Error('内容没载入');
        });

        await feed([{ name: 'huge.json', text: '{}', size: 999 * 1024 * 1024 }]);
        await wait(400);

        check('宿主拖入超过上限的文件：提示大小并放弃', function () {
            var msg = toastText();
            if (msg.indexOf('huge.json') < 0) throw new Error('提示里没有文件名: ' + msg);
            if (msg.indexOf('MB') < 0 && msg.indexOf('GB') < 0) throw new Error('提示里没有大小: ' + msg);
        });

        await feed([{ name: 'broken.json', text: '{"a":1}', handleId: null }]);
        await wait(400);

        check('宿主给的 handle 读不出来：提示读取失败，不抛到页面', function () {
            var msg = toastText();
            if (msg.indexOf('broken.json') < 0) throw new Error('提示里没有文件名: ' + msg);
        });

        var many = [];
        for (var i = 0; i < 12; i++) many.push({ name: 'f' + i + '.json', text: '{"i":' + i + '}' });
        await feed(many);
        await wait(700);

        check('宿主一次拖 12 个：文本页只导入第一个并说明', function () {
            var msg = toastText();
            if (msg.indexOf('f0.json') < 0) throw new Error('没提示用了哪个文件: ' + msg);
            // 转换会把输入重新排版，这里只认键名，不比对原始空格
            if (d2.getElementById('inputText').value.indexOf('"i"') < 0) throw new Error('第一个文件没载入');
        });

        dom2.window.close();
    })();

    /* ---------------- SQL 草稿：存 / 压 / 不存的分档 ---------------- */

    check('SQL 草稿：小语句原样存、大语句压缩、压完超标就不存', function () {
        var plan = win.dataSqlDraftPlan;
        if (typeof plan !== 'function') throw new Error('dataSqlDraftPlan 没挂出来');
        if (plan(1024, 300) !== 'plain') throw new Error('小语句应原样存');
        if (plan(24 * 1024, 0) !== 'plain') throw new Error('24 KB 边界应原样存');
        if (plan(80 * 1024, 20 * 1024) !== 'gzip') throw new Error('大语句应压缩');
        if (plan(60 * 1024, 0) !== 'plain') throw new Error('压不了但整段还塞得下，应原样存');
        if (plan(400 * 1024, 200 * 1024) !== 'skip') throw new Error('压完仍超标应放弃');
        if (plan(400 * 1024, 0) !== 'skip') throw new Error('压不了又塞不下应放弃');
    });

    /* ---------------- SQL 页吃 JSON 数组 ---------------- */

    check('SQL 页：JSON 数组摊成表，不是数组的一律回绝', function () {
        var toRows = win.DBXStats && win.DBXStats.jsonToRows;
        if (typeof toRows !== 'function') throw new Error('DBXStats.jsonToRows 没挂出来');
        var r = toRows('[{"region":"华东","orders":12},{"region":"华南","orders":7}]');
        if (!r.ok) throw new Error('对象数组应能摊成表');
        if (r.header.join(',') !== 'region,orders') throw new Error('列名应是键：' + r.header);
        if (r.rows.length !== 2 || r.rows[0][1] !== '12') throw new Error('数据行不对');
        // 只取一级：嵌套值整体当一个单元格，不摊成 user.name
        var nested = toRows('[{"id":1,"user":{"name":"A"}}]');
        if (nested.header.join(',') !== 'id,user') throw new Error('嵌套不该摊平');
        if (nested.rows[0][1] !== '{"name":"A"}') throw new Error('嵌套值应成 JSON 串');
        // 顶层是对象 / 坏 JSON 都要回绝（页面据此报「数据格式有误」）
        if (toRows('{"data":[{"a":1}]}').ok) throw new Error('包一层的对象该回绝');
        if (toRows('[{"a":1}').ok) throw new Error('坏 JSON 该回绝');
        if (toRows('a\tb\n1\t2').ok) throw new Error('分隔符文本不该被当 JSON');
    });

    /* ---------------- 编辑器选区右键菜单（全站共用一套） ---------------- */

    var homeCm = doc.querySelector('#mainWorkspace .CodeMirror').CodeMirror;
    var homeWrap = homeCm.getWrapperElement();
    var selMenuEl = doc.getElementById('selMenu');

    function rightClick(cm) {
        var wrap = cm.getWrapperElement();
        wrap.dispatchEvent(new win.MouseEvent('mousedown', { bubbles: true, button: 2, clientX: 40, clientY: 60 }));
        wrap.dispatchEvent(new win.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 60 }));
        return wrap;
    }

    homeCm.setValue('alpha\nbeta\nbeta');
    homeCm.setSelection({ line: 0, ch: 0 }, { line: 2, ch: 4 });
    rightClick(homeCm);

    check('编辑器里右键弹出统一菜单，标题报选中行数', function () {
        if (selMenuEl.hidden) throw new Error('菜单没出现');
        var head = doc.getElementById('selMenuHead').textContent;
        if (head.indexOf('3 行') === -1) throw new Error('标题: ' + head);
    });

    check('菜单按基础 / 转义 / 整理 / SQL / 二维码分组', function () {
        var ids = Array.prototype.map.call(
            doc.querySelectorAll('#selMenuList [data-sel-id]'),
            function (el) { return el.dataset.selId; }
        );
        ['copy', 'cut', 'paste', 'select-all', 'esc-base64-encode', 'tidy-dedupe', 'sql-in', 'qr-copy']
            .forEach(function (id) {
                if (ids.indexOf(id) === -1) throw new Error('缺 ' + id + '：' + ids.join(','));
            });
        if (doc.querySelectorAll('#selMenuList .sel-menu-sep').length < 3) {
            throw new Error('分组分隔线不够');
        }
    });

    check('在菜单里滚动不会把菜单关掉（否则滚轮像点了没反应）', function () {
        doc.getElementById('selMenuList').dispatchEvent(new win.Event('scroll'));
        if (selMenuEl.hidden) throw new Error('菜单被自己的滚动关掉了');
    });

    check('滚页面仍然收起菜单', function () {
        (doc.scrollingElement || doc.documentElement).dispatchEvent(new win.Event('scroll'));
        if (!selMenuEl.hidden) throw new Error('滚页面时菜单没关');
    });

    rightClick(homeCm);
    doc.querySelector('#selMenuList [data-sel-id="esc-base64-encode"]').click();
    await wait(120);

    check('点「Base64 编码」把结果写进剪贴板', function () {
        var want = win.DBXEscape.convert('alpha\nbeta\nbeta', 'base64', 'encode').text;
        var got = win.__clip[win.__clip.length - 1];
        if (got !== want) throw new Error('剪贴板: ' + got);
    });

    check('转换只写剪贴板，不动编辑器内容', function () {
        if (homeCm.getValue() !== 'alpha\nbeta\nbeta') throw new Error('内容被改了: ' + homeCm.getValue());
    });

    homeCm.setCursor({ line: 0, ch: 0 });
    rightClick(homeCm);

    check('没选中内容时转换项置灰，复制仍可用', function () {
        if (!doc.querySelector('#selMenuList [data-sel-id="esc-base64-encode"]').classList.contains('is-disabled')) {
            throw new Error('转换项没置灰');
        }
        if (doc.querySelector('#selMenuList [data-sel-id="copy"]').classList.contains('is-disabled')) {
            throw new Error('复制不该置灰');
        }
        if (doc.getElementById('selMenuHead').textContent.indexOf('未选中') === -1) {
            throw new Error('标题: ' + doc.getElementById('selMenuHead').textContent);
        }
    });

    // ⌘V 粘图片：宿主 WebView 里唯一稳的一条路，走 paste 事件
    win.EditorMenu.hide();
    homeCm.setValue('X');
    homeCm.setSelection({ line: 0, ch: 0 }, { line: 0, ch: 1 });
    var pasteEvent = new win.Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(pasteEvent, 'clipboardData', {
        value: {
            items: [{
                type: 'image/png',
                getAsFile: function () {
                    return new win.File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], 'p.png', { type: 'image/png' });
                }
            }]
        }
    });
    homeWrap.dispatchEvent(pasteEvent);
    await wait(250);

    check('⌘V 粘图片：Data URI 落进编辑器并替换选区', function () {
        var value = homeCm.getValue();
        if (value.indexOf('data:image/png;base64,') !== 0) throw new Error('内容: ' + value.slice(0, 60));
    });

    /* ---------------- 二维码项：写不进图片剪贴板就老实改叫「保存」 ---------------- */

    // jsdom 默认没有 ClipboardItem / clipboard.write，等价于 DBX 宿主：
    // 那一项必须是「保存为 PNG 图片」，点下去真的走 saveBinaryFile，不是假装复制
    homeCm.setValue('hello');
    homeCm.setSelection({ line: 0, ch: 0 }, { line: 0, ch: 5 });
    rightClick(homeCm);

    var qrItem = doc.querySelector('#selMenuList [data-sel-id="qr-copy"]');
    check('二维码项：环境写不了图片剪贴板时改叫「保存为 PNG 图片」', function () {
        if (!qrItem) throw new Error('没找到 qr-copy 这一项');
        if (qrItem.textContent.indexOf('保存') === -1) {
            throw new Error('文案是「' + qrItem.textContent + '」，应当说明是保存');
        }
    });

    var savedName = null;
    var realSaveBinary = win.saveBinaryFile;
    win.saveBinaryFile = function (name) {
        savedName = name;
        return Promise.resolve('host');
    };
    var pngBlob = new win.Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
    var copyRes = await win.copyPngToClipboard(pngBlob, 'selection.png');
    win.saveBinaryFile = realSaveBinary;
    check('二维码图片：没有 Clipboard API 时走存盘，并如实回报 via=file', function () {
        if (!copyRes || copyRes.via !== 'file') throw new Error('结果 ' + JSON.stringify(copyRes));
        if (savedName !== 'selection.png') throw new Error('存盘文件名: ' + savedName);
    });

    // 有 ClipboardItem + clipboard.write 时（浏览器 / 预览），名字回到「复制」
    win.ClipboardItem = function () {};
    win.navigator.clipboard.write = async function () {};
    homeCm.setSelection({ line: 0, ch: 0 }, { line: 0, ch: 5 });
    rightClick(homeCm);
    var qrItem2 = doc.querySelector('#selMenuList [data-sel-id="qr-copy"]');
    check('二维码项：能写位图时叫「复制为二维码图片」', function () {
        if (!qrItem2) throw new Error('没找到 qr-copy 这一项');
        if (qrItem2.textContent.indexOf('复制') === -1) {
            throw new Error('文案是「' + qrItem2.textContent + '」');
        }
    });
    delete win.ClipboardItem;
    win.EditorMenu.hide();

    /* ---------------- 二维码页卡片上的按钮：点下去必须有结果 ---------------- */

    // 这条用例是被真实 bug 逼出来的：qrCopyImage 里调了个不存在的 qrFileName()，
    // ReferenceError 掉进 async 里没人接，按钮点了完全没反应、连提示都没有。
    // 光测右键菜单测不出来——必须点页面上那颗按钮。
    var canvasProto = win.HTMLCanvasElement.prototype;
    var realGetContext = canvasProto.getContext;
    var realToDataURL = canvasProto.toDataURL;
    canvasProto.getContext = function () {
        return {
            fillStyle: '', fillRect: function () {}, clearRect: function () {},
            drawImage: function () {}, beginPath: function () {}, arc: function () {},
            fill: function () {}, save: function () {}, restore: function () {},
            clip: function () {}, getImageData: function () { return { data: [] }; }
        };
    };
    canvasProto.toDataURL = function () { return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=='; };

    doc.getElementById('navQr').click();
    await wait(200);
    qrSetInput('二维码页按钮回归');
    await wait(500);

    var cardBtn = doc.querySelector('#qrGrid .qr-card [data-qr-copy-image]');
    check('二维码页卡片上有「复制图片 / 保存图片」按钮', function () {
        if (!cardBtn) throw new Error('卡片上没找到按钮');
        if (!/图片/.test(cardBtn.textContent)) throw new Error('按钮文案 ' + cardBtn.textContent);
    });

    var pageSavedName = null;
    var realSaveBinary3 = win.saveBinaryFile;
    win.saveBinaryFile = function (name) {
        pageSavedName = name;
        return Promise.resolve('host');
    };
    if (cardBtn) cardBtn.click();
    await wait(500);
    win.saveBinaryFile = realSaveBinary3;
    canvasProto.getContext = realGetContext;
    canvasProto.toDataURL = realToDataURL;

    check('二维码页按钮：点下去真的落成 PNG，不是点了没反应', function () {
        if (!pageSavedName) throw new Error('没有调用 saveBinaryFile');
        if (!/\.png$/.test(pageSavedName)) throw new Error('文件名 ' + pageSavedName);
    });

    /* ---------------- SQL 分析页的右键菜单保持原样 ---------------- */

    doc.getElementById('navDataSql').click();
    await wait(350);
    var dataCmWrap = doc.querySelector('#dataSqlWorkspace .CodeMirror');
    if (dataCmWrap) {
        dataCmWrap.dispatchEvent(new win.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 30, clientY: 40 }));
        check('SQL 分析页右键：出本页菜单，通用菜单让路', function () {
            if (!selMenuEl.hidden) throw new Error('通用菜单抢了 SQL 分析页');
            if (doc.getElementById('dataSqlCtx').hidden) throw new Error('本页菜单没出来');
        });
        var runStmt = doc.querySelector('#dataSqlCtx [data-ctx="run-stmt"]');
        if (runStmt) runStmt.click();
        check('SQL 分析页点完菜单项照常收起', function () {
            if (!doc.getElementById('dataSqlCtx').hidden) throw new Error('点完没收起');
        });
    }

    results.forEach(function (r) {
        console.log('  ' + r[0] + ' ' + r[1]);
    });
    var failed = results.filter(function (r) {
        return r[0] === 'FAIL';
    }).length;
    console.log('\n==== ' + (results.length - failed) + ' passed, ' + failed + ' failed ====');
    // 直接退出：主窗口里挂着 CodeMirror 的定时器，close() 反而可能卡在拆解阶段
    process.exit(failed ? 1 : 0);
})().catch(function (err) {
    results.forEach(function (r) {
        console.log('  ' + r[0] + ' ' + r[1]);
    });
    console.error('smoke 运行时错误：' + ((err && err.stack) || err));
    process.exit(1);
});
