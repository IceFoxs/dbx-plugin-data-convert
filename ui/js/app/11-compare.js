/* 11-compare.js — JSON 对比页（独立双栏） */
// 7. JSON 对比页（导航栏入口，独立双栏）
// =========================================
const compareWorkspace = document.getElementById('compareWorkspace');
const cmpLeftText = document.getElementById('cmpLeftText');
const cmpRightText = document.getElementById('cmpRightText');
const compareTip = document.getElementById('compareTip');
const compareTabs = document.getElementById('compareTabs');
const compareSamples = document.getElementById('cmpJsonSamples');
const compareTextSamples = document.getElementById('cmpTextSamples');
const navCompareLink = document.getElementById('navCompare');
const toolbarEl = document.querySelector('.toolbar');

let cmpMode = 'json';
let compareMode = false;
let cmpMarks = [];

// 示例：左右各一份，点一下就有一组「确实不一样」的数据可看
const COMPARE_SAMPLES = {
    user: {
        left: {
            status: 'success',
            code: 200,
            data: {
                users: [
                    { id: 1, name: '李明', role: 'admin' },
                    { id: 2, name: '王芳', role: 'user' },
                    { id: 3, name: '赵强', role: 'editor' }
                ],
                pagination: { total: 25, page: 1, limit: 10 }
            },
            timestamp: 1642558132,
            version: '1.0.0'
        },
        right: {
            status: 'success',
            code: 200,
            data: {
                users: [
                    { id: 1, name: '李明', role: 'admin' },
                    { id: 2, name: '王芳', role: 'user' },
                    { id: 3, name: '赵强', role: 'moderator' }
                ],
                pagination: { total: 28, page: 1, limit: 10 }
            },
            timestamp: 1652558132,
            version: '1.2.0'
        }
    },
    product: {
        left: {
            product: { id: 'p-1001', name: '无线耳机', price: 399, stock: 120, tags: ['蓝牙', '降噪'] },
            updatedAt: '2024-03-01'
        },
        right: {
            product: { id: 'p-1001', name: '无线耳机', price: 359, stock: 86, tags: ['蓝牙', '降噪', '快充'] },
            updatedAt: '2024-04-18'
        }
    },
    config: {
        left: {
            app: { theme: 'light', lang: 'zh-CN', autoSave: true },
            net: { timeout: 3000, retries: 2 }
        },
        right: {
            app: { theme: 'dark', lang: 'zh-CN', autoSave: false },
            net: { timeout: 5000, retries: 2 }
        }
    },
    api: {
        left: { code: 200, msg: 'ok', data: { list: [], total: 0 } },
        right: { code: 200, msg: 'ok', data: { list: [{ id: 1 }], total: 1 }, traceId: 'trace-9f2c' }
    }
};

// 任意文本示例：故意只在少数几行上有差别，方便看整行标记
const COMPARE_TEXT_SAMPLES = {
    md: {
        left: [
            '# 订单创建接口',
            '',
            '## 请求地址',
            '',
            '`POST /api/v1/order/create`',
            '',
            '## 请求参数',
            '',
            '| 参数 | 类型 | 必填 |',
            '| --- | --- | --- |',
            '| skuId | string | 是 |',
            '| count | number | 否 |',
            '',
            '## 返回示例',
            '',
                    '```json',
                    '{ "code": 0, "orderId": "o-1001" }',
                    '```',
            '',
            '> 注意：count 默认值为 1。'
        ].join('\n'),
        right: [
            '# 订单创建接口',
            '',
            '## 请求地址',
            '',
            '`POST /api/v2/order/create`',
            '',
            '## 请求参数',
            '',
            '| 参数 | 类型 | 必填 |',
            '| --- | --- | --- |',
            '| skuId | string | 是 |',
            '| count | number | 是 |',
            '| couponId | string | 否 |',
            '',
            '## 返回示例',
            '',
                    '```json',
                    '{ "code": 0, "orderId": "o-1001", "payUrl": "https://pay.example.com/o-1001" }',
                    '```',
            '',
            '> 注意：count 必填，且必须大于 0。'
        ].join('\n')
    },
    conf: {
        left: [
            '# app.conf',
            '[server]',
            'host = 127.0.0.1',
            'port = 8080',
            'workers = 4',
            '',
            '[log]',
            'level = info',
            'path = /var/log/app.log',
            'rotate = daily',
            '',
            '[cache]',
            'enabled = true',
            'ttl = 300',
            'backend = memory'
        ].join('\n'),
        right: [
            '# app.conf',
            '[server]',
            'host = 0.0.0.0',
            'port = 8080',
            'workers = 8',
            '',
            '[log]',
            'level = warn',
            'path = /var/log/app.log',
            'rotate = hourly',
            '',
            '[cache]',
            'enabled = true',
            'ttl = 600',
            'backend = redis',
            'redis_url = redis://127.0.0.1:6379/0'
        ].join('\n')
    },
    html: {
        left: [
            '<section class="card">',
            '    <h2 class="card-title">月度报表</h2>',
            '    <p class="card-desc">数据更新至 2024-03-01</p>',
            '    <ul class="card-list">',
            '        <li>订单量：1,208</li>',
            '        <li>成交额：¥ 86,400</li>',
            '    </ul>',
            '    <a href="/report/2024-03" class="btn">查看详情</a>',
            '</section>'
        ].join('\n'),
        right: [
            '<section class="card card--primary">',
            '    <h2 class="card-title">月度报表</h2>',
            '    <p class="card-desc">数据更新至 2024-04-01</p>',
            '    <ul class="card-list">',
            '        <li>订单量：1,536</li>',
            '        <li>成交额：¥ 102,900</li>',
            '        <li>退款率：1.2%</li>',
            '    </ul>',
            '    <a href="/report/2024-04" class="btn btn--ghost">查看详情</a>',
            '</section>'
        ].join('\n')
    },
    log: {
        left: [
            '2024-05-01 09:12:03 INFO  [main] app starting, version=1.2.0',
            '2024-05-01 09:12:03 INFO  [main] loaded config from /etc/app/app.conf',
            '2024-05-01 09:12:04 INFO  [db] connected to 127.0.0.1:5432 (12ms)',
            '2024-05-01 09:12:04 WARN  [cache] miss ratio 32%, consider warming up',
            '2024-05-01 09:12:05 INFO  [http] listening on 0.0.0.0:8080',
            '2024-05-01 09:12:31 INFO  [http] GET /api/orders 200 18ms',
            '2024-05-01 09:12:44 ERROR [http] POST /api/orders 500 timeout after 3000ms'
        ].join('\n'),
        right: [
            '2024-05-01 09:12:03 INFO  [main] app starting, version=1.2.1',
            '2024-05-01 09:12:03 INFO  [main] loaded config from /etc/app/app.conf',
            '2024-05-01 09:12:04 INFO  [db] connected to 127.0.0.1:5432 (9ms)',
            '2024-05-01 09:12:04 WARN  [cache] miss ratio 12%, consider warming up',
            '2024-05-01 09:12:05 INFO  [http] listening on 0.0.0.0:8080',
            '2024-05-01 09:12:31 INFO  [http] GET /api/orders 200 15ms',
            '2024-05-01 09:12:44 ERROR [http] POST /api/orders 500 timeout after 3000ms',
            '2024-05-01 09:12:45 WARN  [retry] retry 1/3 for POST /api/orders'
        ].join('\n')
    }
};

function t(key, fallback) {
    return currentDict[key] || fallback;
}

function setCompareTip(text, tone) {
    compareTip.textContent = text;
    compareTip.className = 'compare-tip' + (tone ? ' ' + tone : '');
}

function idleCompareTip() {
    setCompareTip(t('cmpTipIdle', '粘贴两侧内容后点击「对比」'));
}

function ensureCompareEditors() {
    if (cmpLeftEditor) return;
    const config = Object.assign({}, commonConfig, {
        mode: MODE_MAP.json,
        extraKeys: Object.assign({}, commonConfig.extraKeys, {
            'Cmd-Enter': () => runCompare(),
            'Ctrl-Enter': () => runCompare()
        })
    });
    cmpLeftEditor = CodeMirror.fromTextArea(cmpLeftText, Object.assign({}, config));
    cmpRightEditor = CodeMirror.fromTextArea(cmpRightText, Object.assign({}, config));
    // 懒创建时主题可能已经切过，这里补一次，避免新编辑器停在亮色主题
    syncEditorTheme();
}

function clearCompareMarks() {
    cmpMarks.forEach((mark) => {
        try { mark.clear(); } catch (e) { /* 编辑器重建过 */ }
    });
    cmpMarks = [];
    [cmpLeftEditor, cmpRightEditor].forEach((cm) => {
        if (!cm) return;
        const doc = cm.getDoc();
        for (let i = 0; i < doc.lineCount(); i++) {
            doc.removeLineClass(i, 'background', 'cm-value-changed');
            doc.removeLineClass(i, 'background', 'cm-deleted');
            doc.removeLineClass(i, 'background', 'cm-inserted');
            doc.removeLineClass(i, 'wrap', 'cm-text-del');
            doc.removeLineClass(i, 'wrap', 'cm-text-ins');
        }
    });
}

function markCompareSpan(cm, span, className) {
    if (!cm || !span) return;
    cmpMarks.push(cm.getDoc().markText(
        { line: span.line, ch: span.col },
        { line: span.endLine == null ? span.line : span.endLine, ch: span.endCol },
        { className: className }
    ));
}

function markCompareChange(change, leftMap, rightMap) {
    const ls = leftMap[change.pointer];
    const rs = rightMap[change.pointer];
    if (change.type === 'change') {
        if (ls) {
            cmpLeftEditor.getDoc().addLineClass(ls.line, 'background', 'cm-value-changed');
            markCompareSpan(cmpLeftEditor, ls, 'cm-diff-old');
        }
        if (rs) {
            cmpRightEditor.getDoc().addLineClass(rs.line, 'background', 'cm-value-changed');
            markCompareSpan(cmpRightEditor, rs, 'cm-diff-new');
        }
        return;
    }
    if (change.type === 'remove') {
        if (ls) {
            cmpLeftEditor.getDoc().addLineClass(ls.line, 'background', 'cm-deleted');
            markCompareSpan(cmpLeftEditor, ls, 'cm-diff-old');
        }
        return;
    }
    if (rs) {
        cmpRightEditor.getDoc().addLineClass(rs.line, 'background', 'cm-inserted');
        markCompareSpan(cmpRightEditor, rs, 'cm-diff-new');
    }
}

function runCompare() {
    ensureCompareEditors();
    clearCompareMarks();

    const leftRaw = cmpLeftEditor.getValue();
    const rightRaw = cmpRightEditor.getValue();
    if (!leftRaw.trim() || !rightRaw.trim()) {
        idleCompareTip();
        return;
    }

    if (cmpMode === 'json') {
        let leftObj, leftMap, rightObj, rightMap;
        try {
            leftObj = JSON.parse(leftRaw);
            leftMap = scanJson(leftRaw).map;
        } catch (err) {
            setCompareTip(t('cmpTipError', '解析失败') + ' · ' + t('cmpLeftSide', '左侧') + ' · ' + err.message, 'err');
            return;
        }
        try {
            rightObj = JSON.parse(rightRaw);
            rightMap = scanJson(rightRaw).map;
        } catch (err) {
            setCompareTip(t('cmpTipError', '解析失败') + ' · ' + t('cmpRightSide', '右侧') + ' · ' + err.message, 'err');
            return;
        }

        const changes = diffObjects(leftObj, rightObj).changes;
        changes.forEach((change) => markCompareChange(change, leftMap, rightMap));

        if (!changes.length) {
            setCompareTip(t('cmpTipSame', '两侧内容完全一致'), 'ok');
        } else {
            setCompareTip(t('cmpTipJson', '两侧 JSON 比对完成，共有 {n} 处不一致！').replace('{n}', changes.length), 'diff');
        }
        return;
    }

    // 任意文本：逐行对比，不要求能解析成对象
    const diff = diffLines(leftRaw, rightRaw);
    const parts = sides(diff.ops);
    const leftDoc = cmpLeftEditor.getDoc();
    const rightDoc = cmpRightEditor.getDoc();
    parts.left.forEach((p) => {
        if (p.type !== 'delete') return;
        leftDoc.addLineClass(p.line, 'background', 'cm-deleted');
        leftDoc.addLineClass(p.line, 'wrap', 'cm-text-del');
    });
    parts.right.forEach((p) => {
        if (p.type !== 'insert') return;
        rightDoc.addLineClass(p.line, 'background', 'cm-inserted');
        rightDoc.addLineClass(p.line, 'wrap', 'cm-text-ins');
    });

    const changedLines = Math.max(diff.stats.removed, diff.stats.added);
    if (!changedLines) {
        setCompareTip(t('cmpTipSame', '两侧内容完全一致'), 'ok');
    } else {
        let tip = t('cmpTipText', '两侧文本比对完成，共有 {n} 行不同').replace('{n}', changedLines);
        // 贴的是 JSON 却用文本模式比，提醒一下能换成字段级对比
        if (looksLikeJson(leftRaw) && looksLikeJson(rightRaw)) {
            tip += ' · ' + t('cmpTipUseJson', '两侧都是 JSON，切到「JSON 对比」可精确到字段');
        }
        setCompareTip(tip, 'diff');
    }
}

function looksLikeJson(text) {
    const s = text.trim();
    if (s.charAt(0) !== '{' && s.charAt(0) !== '[') return false;
    try {
        JSON.parse(s);
        return true;
    } catch (e) {
        return false;
    }
}

function beautifyCompare() {
    ensureCompareEditors();
    let failed = false;
    [cmpLeftEditor, cmpRightEditor].forEach((cm) => {
        const raw = cm.getValue().trim();
        if (!raw) return;
        if (cmpMode !== 'json') {
            if (raw !== cm.getValue()) cm.setValue(raw);
            return;
        }
        try {
            cm.setValue(JSON.stringify(JSON.parse(raw), null, 2));
        } catch (err) {
            failed = true;
        }
    });
    clearCompareMarks();
    if (failed) {
        setCompareTip(t('cmpTipError', '解析失败'), 'err');
    } else {
        idleCompareTip();
    }
}

function clearCompare() {
    ensureCompareEditors();
    cmpLeftEditor.setValue('');
    cmpRightEditor.setValue('');
    clearCompareMarks();
    idleCompareTip();
}

function applySample(name) {
    ensureCompareEditors();
    const textSample = COMPARE_TEXT_SAMPLES[name];
    if (textSample) {
        if (cmpMode !== 'text') setCompareMode('text');
        cmpLeftEditor.setValue(textSample.left);
        cmpRightEditor.setValue(textSample.right);
        runCompare();
        return;
    }
    const sample = COMPARE_SAMPLES[name];
    if (!sample) return;
    if (cmpMode !== 'json') setCompareMode('json');
    cmpLeftEditor.setValue(JSON.stringify(sample.left, null, 2));
    cmpRightEditor.setValue(JSON.stringify(sample.right, null, 2));
    runCompare();
}

// 两个示例区按当前模式互斥显示
function syncSampleGroups() {
    if (compareSamples) compareSamples.classList.toggle('is-hidden', cmpMode !== 'json');
    if (compareTextSamples) compareTextSamples.classList.toggle('is-hidden', cmpMode !== 'text');
}

function setCompareMode(mode) {
    cmpMode = mode === 'text' ? 'text' : 'json';
    compareTabs.querySelectorAll('.compare-tab').forEach((tab) => {
        tab.classList.toggle('active', tab.dataset.mode === cmpMode);
    });
    syncSampleGroups();
    if (cmpLeftEditor) {
        const target = cmpMode === 'json' ? MODE_MAP.json : 'text/plain';
        cmpLeftEditor.setOption('mode', target);
        cmpRightEditor.setOption('mode', target);
        clearCompareMarks();
        // 切模式后重新按新模式算一遍，避免旧的标记和新的提示对不上
        if (cmpLeftEditor.getValue().trim() && cmpRightEditor.getValue().trim()) {
            runCompare();
            return;
        }
    }
    idleCompareTip();
}

// 每进一个页面先退出其它页面。以前是每个 enter*Mode 里手写一串
// `if (xxxMode) exitXxxMode()`，后来加的页面（查询校验 / 转义工具）
// 没人回头补，于是「转义页 → JSON 对比」会两层叠在一起。
// 现在只在这里维护一张表，新增页面加一行即可，不会再漏。
function exitOtherModes(keep) {
    if (keep !== 'diff' && isDiffMode) exitDiffIfActive();
    if (keep !== 'compare' && compareMode) exitCompareMode();
    if (keep !== 'sql' && sqlModeActive) exitSqlMode();
    if (keep !== 'sheet' && sheetModeActive) exitSheetMode();
    if (keep !== 'image' && imgModeActive) exitImageMode();
    if (keep !== 'code' && codeModeActive) exitCodeMode();
    if (keep !== 'query' && queryModeActive) exitQueryMode();
    if (keep !== 'bytes' && bytesModeActive) exitBytesMode();
    if (keep !== 'chart' && chartModeActive) exitChartMode();
    if (keep !== 'esc' && escModeActive) exitEscMode();
    if (keep !== 'time' && timeModeActive) exitTimeMode();
    if (keep !== 'qr' && qrModeActive) exitQrMode();
}

// 当前停在哪一页（关掉快捷页时用来回原处），'' 表示格式转换页
function currentPageId() {
    if (compareMode) return 'navCompare';
    if (sqlModeActive) return 'navSql';
    if (sheetModeActive) return 'navSheet';
    if (imgModeActive) return 'navImage';
    if (codeModeActive) return 'navCodegen';
    if (queryModeActive) return 'navQuery';
    if (bytesModeActive) return 'navBytes';
    if (chartModeActive) return 'navChart';
    if (timeModeActive) return 'navTime';
    if (qrModeActive) return 'navQr';
    return '';
}

function enterCompareMode() {
    exitOtherModes('compare');
    if (isDiffMode) {
        isDiffMode = false;
        diffReport.classList.remove('show');
        diffWorkspace.classList.remove('active');
        toggleDiffBtn.textContent = currentDict.diffBtn || '对比差异';
        toggleDiffBtn.classList.remove('btn-diff');
    }
    compareMode = true;
    markConvertActive(null);
    mainWorkspace.classList.add('hidden');
    toolbarEl.classList.add('hidden');
    compareWorkspace.classList.add('active');
    navCompareLink.classList.add('active');

    ensureCompareEditors();
    compareTabs.querySelectorAll('.compare-tab').forEach((tab) => {
        tab.classList.toggle('active', tab.dataset.mode === cmpMode);
    });
    syncSampleGroups();
    cmpLeftEditor.setOption('mode', cmpMode === 'json' ? MODE_MAP.json : 'text/plain');
    cmpRightEditor.setOption('mode', cmpMode === 'json' ? MODE_MAP.json : 'text/plain');

    // 之前已经填过内容的话，重新进入时直接给出结果，免得标记和提示不一致
    if (cmpLeftEditor.getValue().trim() && cmpRightEditor.getValue().trim()) {
        runCompare();
    } else {
        idleCompareTip();
    }

    requestAnimationFrame(() => {
        cmpLeftEditor.refresh();
        cmpRightEditor.refresh();
    });
}

function exitCompareMode() {
    if (!compareMode) return;
    compareMode = false;
    compareWorkspace.classList.remove('active');
    toolbarEl.classList.remove('hidden');
    mainWorkspace.classList.remove('hidden');
    navCompareLink.classList.remove('active');
    requestAnimationFrame(() => {
        inputEditor.refresh();
        outputEditor.refresh();
    });
}

compareTabs.addEventListener('click', (e) => {
    const tab = e.target.closest('.compare-tab');
    if (tab) setCompareMode(tab.dataset.mode);
});
function bindSampleGroup(el) {
    if (!el) return;
    el.addEventListener('click', (e) => {
        const chip = e.target.closest('.sample-chip');
        if (chip) applySample(chip.dataset.sample);
    });
}
bindSampleGroup(compareSamples);
bindSampleGroup(compareTextSamples);
document.getElementById('cmpRun').addEventListener('click', runCompare);
document.getElementById('cmpBeautify').addEventListener('click', beautifyCompare);
document.getElementById('cmpClear').addEventListener('click', clearCompare);

// =========================================
