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
        doc.querySelector('#navLinks a[data-src="json"][data-tgt="yaml"]').click();
        if (doc.getElementById('compareWorkspace').classList.contains('active')) throw new Error('对比页仍在显示');
        if (doc.querySelector('.toolbar').classList.contains('hidden')) throw new Error('工具栏仍隐藏');
        if (doc.getElementById('navCompare').classList.contains('active')) throw new Error('导航仍高亮');
    });


    // 导航溢出 → 「更多」：jsdom 没有布局，宽高靠 stub
    var navEl = doc.getElementById('navLinks');
    var moreEl = doc.getElementById('navMore');
    var moreMenu = doc.getElementById('navMoreMenu');

    check('宽度足够时不显示「更多」', function () {
        if (moreEl.classList.contains('show')) throw new Error('「更多」不该出现');
        if (navEl.querySelectorAll('a').length !== 8) throw new Error('导航项数 ' + navEl.querySelectorAll('a').length);
        if (doc.getElementById('navMoreTrigger').textContent.indexOf('更多') === -1) throw new Error('「更多」文案缺失');
    });

    Object.defineProperty(navEl, 'clientWidth', { configurable: true, get: function () { return 260; } });
    Object.defineProperty(navEl, 'scrollWidth', { configurable: true, get: function () { return navEl.children.length * 90; } });
    dom.window.dispatchEvent(new dom.window.Event('resize'));
    await wait(250);

    check('导航装不下时把末尾项收进「更多」', function () {
        if (!moreEl.classList.contains('show')) throw new Error('「更多」未出现');
        var inline = navEl.querySelectorAll('a').length;
        var inMenu = moreMenu.querySelectorAll('a').length;
        if (inline + inMenu !== 8) throw new Error('项数不守恒 ' + inline + '+' + inMenu);
        if (inMenu === 0) throw new Error('菜单为空');
        // 留在导航条上的应当是从头开始的连续几项，收进去的是剩下的后缀，顺序不变
        var ORDER = ['yaml转json', 'yaml转properties', 'json转properties', 'json转xml',
                     'xml转yaml', 'json转yaml', 'yaml转xml'];
        var kept = [].map.call(navEl.querySelectorAll('a'), function (a) {
            return a.id === 'navCompare' ? 'JSON 对比' : a.textContent.trim();
        });
        var moved = [].map.call(moreMenu.querySelectorAll('a'), function (a) { return a.textContent.trim(); });
        var keptConv = kept.filter(function (t) { return t !== 'JSON 对比'; });
        var expectKept = ORDER.slice(0, keptConv.length);
        var expectMoved = ORDER.slice(keptConv.length);
        if (keptConv.join('|') !== expectKept.join('|')) throw new Error('保留项不是前缀: ' + keptConv.join(','));
        if (moved.join('|') !== expectMoved.join('|')) throw new Error('菜单项顺序不对: ' + moved.join(','));
    });

    check('「JSON 对比」优先留在导航条上', function () {
        if (!navEl.querySelector('#navCompare')) throw new Error('主入口被收进「更多」了');
    });

    check('点「更多」可展开、再点页面空白可收起', function () {
        doc.getElementById('navMoreTrigger').click();
        if (!moreEl.classList.contains('open')) throw new Error('未展开');
        if (doc.getElementById('navMoreTrigger').getAttribute('aria-expanded') !== 'true') throw new Error('aria-expanded 未同步');
        doc.body.click();
        if (moreEl.classList.contains('open')) throw new Error('未收起');
    });

    check('菜单里的导航项照样能切换格式', function () {
        var item = moreMenu.querySelector('a');
        var src = item.dataset.src;
        var tgt = item.dataset.tgt;
        item.click();
        var srcLabel = doc.querySelector('#sourceSelect .custom-select-trigger .label').textContent.trim();
        var tgtLabel = doc.querySelector('#targetSelect .custom-select-trigger .label').textContent.trim();
        if (srcLabel.toLowerCase() !== src || tgtLabel.toLowerCase() !== tgt) {
            throw new Error('变成了 ' + srcLabel + '→' + tgtLabel + '，期望 ' + src + '→' + tgt);
        }
        if (moreEl.classList.contains('open')) throw new Error('选完未收起');
    });

    Object.defineProperty(navEl, 'clientWidth', { configurable: true, get: function () { return 4000; } });
    dom.window.dispatchEvent(new dom.window.Event('resize'));
    await wait(250);

    check('宽度恢复后导航项全部回到导航条', function () {
        if (moreEl.classList.contains('show')) throw new Error('「更多」仍显示');
        if (moreMenu.querySelectorAll('a').length !== 0) throw new Error('菜单仍有残留');
        if (navEl.querySelectorAll('a').length !== 8) throw new Error('导航项数 ' + navEl.querySelectorAll('a').length);
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

        hostDom.window.close();
    })();

    results.forEach(function (r) {
        console.log('  ' + r[0] + ' ' + r[1]);
    });
    var failed = results.filter(function (r) {
        return r[0] === 'FAIL';
    }).length;
    console.log('\n==== ' + (results.length - failed) + ' passed, ' + failed + ' failed ====');
    dom.window.close();
    process.exit(failed ? 1 : 0);
})();
