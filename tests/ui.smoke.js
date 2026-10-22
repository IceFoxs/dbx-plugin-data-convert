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
        Object.defineProperty(window.navigator, 'clipboard', {
            value: { readText: async function () { return ''; }, writeText: async function () {} },
            configurable: true
        });
    }
});

var win = dom.window;
var wait = function (ms) {
    return new Promise(function (resolve) {
        setTimeout(resolve, ms);
    });
};

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
        var css = doc.querySelector('style').textContent;
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
        var css = Array.prototype.map.call(doc.querySelectorAll('style'), function (s) { return s.textContent; }).join('\n');
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
        var css = Array.prototype.map.call(doc.querySelectorAll('style'), function (s) { return s.textContent; }).join('\n');
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

    // 导航：7 个格式互转收进「格式转换」下拉，导航条上只剩 3 个单元
    var navEl = doc.getElementById('navLinks');
    var moreEl = doc.getElementById('navMore');
    var moreMenu = doc.getElementById('navMoreMenu');
    var convertEl = doc.getElementById('navConvert');
    var convertMenu = doc.getElementById('navConvertMenu');

    function inlineNavLinks() {
        return [].slice.call(navEl.querySelectorAll('a')).filter(function (a) {
            return a.parentNode === navEl;
        });
    }

    check('7 个格式入口收在「格式转换」下拉里', function () {
        if (convertMenu.querySelectorAll('a').length !== 7) {
            throw new Error('下拉项数 ' + convertMenu.querySelectorAll('a').length);
        }
        // 直属项：SQL 转换 / 表格转 JSON / 代码生成 / 图片 Base64 / JSON 对比
        if (inlineNavLinks().length !== 5) throw new Error('导航条上直属项 ' + inlineNavLinks().length);
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

    check('导航装不下时把固定项也收进「更多」', function () {
        if (!moreEl.classList.contains('show')) throw new Error('「更多」未出现');
        var names = [].map.call(moreMenu.querySelectorAll('a'), function (a) { return a.textContent.trim(); });
        // 收进「更多」的先后顺序取决于「非固定项先挪、固定项兜底」，这里只校验集合
        var expect = ['SQL 转换', 'JSON 对比', '表格转 JSON', '代码生成', '图片 Base64'].sort().join('|');
        if (names.slice().sort().join('|') !== expect) {
            throw new Error('菜单项: ' + names.join(','));
        }
        if (inlineNavLinks().length !== 0) throw new Error('导航条上还剩 ' + inlineNavLinks().length + ' 项');
    });

    check('「格式转换」下拉不会被搬进「更多」', function () {
        if (!convertEl.isConnected) throw new Error('下拉被搬走了');
        if (convertEl.parentNode !== doc.querySelector('.topbar')) throw new Error('下拉不在顶栏里了');
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
        var label = item.textContent.trim();
        item.click();
        if (label === 'SQL 转换') {
            if (!doc.getElementById('sqlWorkspace').classList.contains('active')) throw new Error('未进入 SQL 页');
        } else if (label === 'JSON 对比') {
            if (!doc.getElementById('compareWorkspace').classList.contains('active')) throw new Error('未进入对比页');
        } else if (label === '表格转 JSON') {
            if (!doc.getElementById('sheetWorkspace').classList.contains('active')) throw new Error('未进入表格页');
        } else if (label === '图片 Base64') {
            if (!doc.getElementById('imageWorkspace').classList.contains('active')) throw new Error('未进入图片页');
        } else if (label === '代码生成') {
            if (!doc.getElementById('codeWorkspace').classList.contains('active')) throw new Error('未进入代码生成页');
        } else {
            throw new Error('菜单项不是页面入口: ' + label);
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
        if (inlineNavLinks().length !== 5) throw new Error('导航项数 ' + inlineNavLinks().length);
        if (convertMenu.querySelectorAll('a').length !== 7) throw new Error('下拉项数 ' + convertMenu.querySelectorAll('a').length);
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
