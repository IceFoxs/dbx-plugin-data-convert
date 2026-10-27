/* 16-query-escape.js — 查询校验页 + 转义工具页 */
// 10. JSON 查询 / Schema 校验 与 转义工具
// =========================================
// 两张小表只装这两页自己的词：取不到再退到代码生成页的表，最后退主字典。
// 这样 genTipChars（"{n} 字符"）这类通用说法不用再翻一遍。
function qT(key, fallback) {
    const table = QUERY_I18N[currentLang] || {};
    const gen = GEN_I18N[currentLang] || {};
    return table[key] || QUERY_I18N.en[key] || gen[key] || GEN_I18N.en[key] ||
        (currentDict && currentDict[key]) || fallback || key;
}

function eT(key, fallback) {
    const table = ESC_I18N[currentLang] || {};
    const gen = GEN_I18N[currentLang] || {};
    return table[key] || ESC_I18N.en[key] || gen[key] || GEN_I18N.en[key] ||
        (currentDict && currentDict[key]) || fallback || key;
}

/** 把 {k} / {n} 这类具名 token 换成错误里的实际参数 */
function fillTokens(tpl, params) {
    return String(tpl).replace(/\{(\w+)\}/g, (m, k) => (
        params && params[k] !== undefined ? String(params[k]) : m
    ));
}

const queryWorkspaceEl = document.getElementById('queryWorkspace');
const navQueryLink = document.getElementById('navQuery');
const queryTabs = document.getElementById('queryTabs');
const queryPathPane = document.getElementById('queryPathPane');
const querySchemaPane = document.getElementById('querySchemaPane');
const queryExpr = document.getElementById('queryExpr');
const querySamples = document.getElementById('querySamples');
const queryHint = document.getElementById('queryHint');
const queryInput = document.getElementById('queryInput');
const queryOutput = document.getElementById('queryOutput');
const queryInBadge = document.getElementById('queryInBadge');
const queryOutBadge = document.getElementById('queryOutBadge');
const queryOutSize = document.getElementById('queryOutSize');
const queryPaths = document.getElementById('queryPaths');
const queryTip = document.getElementById('queryTip');
const schData = document.getElementById('schData');
const schSchema = document.getElementById('schSchema');
const schDataBadge = document.getElementById('schDataBadge');
const schSchemaBadge = document.getElementById('schSchemaBadge');
const schErrors = document.getElementById('schErrors');
const schHint = document.getElementById('schHint');
const schSamples = document.getElementById('schSamples');

const escWorkspaceEl = document.getElementById('escWorkspace');
const navEscapeLink = document.getElementById('navEscape');
const escDirTabs = document.getElementById('escDirTabs');
const escKinds = document.getElementById('escKinds');
const escInput = document.getElementById('escInput');
const escOutput = document.getElementById('escOutput');
const escInBadge = document.getElementById('escInBadge');
const escOutBadge = document.getElementById('escOutBadge');
const escOutSize = document.getElementById('escOutSize');
const escTip = document.getElementById('escTip');

const bytesWorkspaceEl = document.getElementById('bytesWorkspace');
const navBytesLink = document.getElementById('navBytes');
const bytesInput = document.getElementById('bytesInput');
const bytesPanel = document.getElementById('bytesPanel');
const bytesInBadge = document.getElementById('bytesInBadge');
const bytesOutBadge = document.getElementById('bytesOutBadge');
const bytesOutSize = document.getElementById('bytesOutSize');
const bytesTip = document.getElementById('bytesTip');
const bytesTableEl = document.getElementById('bytesTable');
const bytesFormsEl = document.getElementById('bytesForms');
const bytesExactValue = document.getElementById('bytesExactValue');
const bytesHuman1000 = document.getElementById('bytesHuman1000');
const bytesHuman1024 = document.getElementById('bytesHuman1024');
const bytesDecimalsEl = document.getElementById('bytesDecimals');
const bytesDecimalsSelect = initCustomSelect('bytesDecimals');

const timeWorkspaceEl = document.getElementById('timeWorkspace');
const navTimeLink = document.getElementById('navTime');
const timeInput = document.getElementById('timeInput');
const timePanel = document.getElementById('timePanel');
const timeInBadge = document.getElementById('timeInBadge');
const timeOutBadge = document.getElementById('timeOutBadge');
const timeOutSize = document.getElementById('timeOutSize');
const timeTip = document.getElementById('timeTip');
const timeRulesEl = document.getElementById('timeRules');

const chartWorkspaceEl = document.getElementById('chartWorkspace');
const navChartLink = document.getElementById('navChart');
const chartInput = document.getElementById('chartInput');
const chartStage = document.getElementById('chartStage');
const chartCanvasEl = document.getElementById('chartCanvas');
const chartEmpty = document.getElementById('chartEmpty');
const chartInBadge = document.getElementById('chartInBadge');
const chartOutBadge = document.getElementById('chartOutBadge');
const chartOutSize = document.getElementById('chartOutSize');
const chartTip = document.getElementById('chartTip');
const chartWidthInput = document.getElementById('chartWidth');
const chartHeightInput = document.getElementById('chartHeight');
const chartResetSizeBtn = document.getElementById('chartResetSize');
// 类型下拉也换成自定义的（原生 select 的弹层是系统画的，和主题不搭）
const chartTypeEl = document.getElementById('chartType');
const chartTypeSelect = initCustomSelect('chartType');
// 像素比：只影响导出的位图，不影响画布上看到的尺寸
const chartScaleEl = document.getElementById('chartScale');
const chartScaleSelect = initCustomSelect('chartScale');
const chartPickWrap = document.getElementById('chartPickWrap');
const chartPick = document.getElementById('chartPick');
const chartPickTrigger = chartPick.querySelector('.custom-select-trigger');
const chartPickLabel = chartPick.querySelector('.custom-select-trigger .label');
const chartPickOptions = document.getElementById('chartPickOptions');
let chartPickIndex = 0;
const chartZoomBar = document.getElementById('chartZoomBar');
const chartZoomOutBtn = document.getElementById('chartZoomOut');
const chartZoomFitBtn = document.getElementById('chartZoomFit');
const chartZoomValue = document.getElementById('chartZoomValue');
const chartZoomInBtn = document.getElementById('chartZoomIn');
const chartPreviewBtn = document.getElementById('chartPreviewBtn');

let queryModeActive = false;
let queryTab = 'path';
let queryTimer = null;
let escModeActive = false;
let escKind = 'url';
let escDir = 'encode';
let escTimer = null;
let bytesModeActive = false;
let bytesTimer = null;
let bytesDecimals = 2;
let bytesCopyPayload = '';
let timeModeActive = false;
let timeTimer = null;
// 时间转换：勾选哪些输出格式（默认按 time.js 的 FIELDS.def）
let timeRules = null;
let querySampleText = '';
let schSampleText = '';

// 经典 bookstore：够复杂，能试出过滤、切片、递归下降
const QUERY_SAMPLE = JSON.stringify({
    store: {
        book: [
            { category: 'reference', author: 'Nigel Rees', title: 'Sayings of the Century', price: 8.95 },
            { category: 'fiction', author: 'Evelyn Waugh', title: 'Sword of Honour', price: 12.99 },
            { category: 'fiction', author: 'Herman Melville', title: 'Moby Dick', isbn: '0-553-21311-3', price: 8.99 }
        ],
        bicycle: { color: 'red', price: 19.95 }
    },
    expensive: 10
}, null, 2);

const SCH_SAMPLES = {
    user: {
        data: '{\n  "id": 1024,\n  "name": "Ada Lovelace",\n  "email": "ada@example.com",\n  "age": 36,\n  "active": true,\n  "tags": ["vip", "beta"]\n}',
        schema: '{\n  "$schema": "http://json-schema.org/draft-07/schema#",\n  "type": "object",\n  "required": ["id", "name", "email"],\n  "properties": {\n    "id": { "type": "integer" },\n    "name": { "type": "string", "minLength": 1 },\n    "email": { "type": "string", "format": "email" },\n    "age": { "type": "integer", "minimum": 0 },\n    "active": { "type": "boolean" },\n    "tags": { "type": "array", "items": { "type": "string" } }\n  }\n}'
    },
    api: {
        data: '{\n  "code": 0,\n  "message": "ok",\n  "data": {\n    "total": 2,\n    "list": [\n      { "id": 1, "title": "First", "published": true },\n      { "id": 2, "title": "Second", "published": false }\n    ]\n  }\n}',
        schema: '{\n  "$schema": "http://json-schema.org/draft-07/schema#",\n  "type": "object",\n  "required": ["code", "data"],\n  "properties": {\n    "code": { "type": "integer" },\n    "message": { "type": "string" },\n    "data": {\n      "type": "object",\n      "required": ["total", "list"],\n      "properties": {\n        "total": { "type": "integer", "minimum": 0 },\n        "list": {\n          "type": "array",\n          "items": {\n            "type": "object",\n            "required": ["id", "title"],\n            "properties": {\n              "id": { "type": "integer" },\n              "title": { "type": "string" },\n              "published": { "type": "boolean" }\n            }\n          }\n        }\n      }\n    }\n  }\n}'
    }
};

const ESC_SAMPLE = 'https://dbx.test/api?q=中文关键词&page=1';

// 示例故意混着四种输入：纯数字、带单位、1024 制、字节序列（最后一行能出三种写法）
const BYTES_SAMPLE = [
    '1234567890',
    '1.5 GB',
    '734003200',
    '1f 8b 08 00 00 00 00 00 00 03'
].join('\n');

/* ----------------------------- 查询子页 ----------------------------- */

function querySetTip(text, cls) {
    queryTip.textContent = text || '';
    queryTip.className = 'compare-tip' + (cls ? ' ' + cls : '');
}

function queryPreview(value) {
    if (value === null) return 'null';
    if (typeof value === 'object') {
        const s = JSON.stringify(value);
        return s.length > 48 ? s.slice(0, 48) + '…' : s;
    }
    const s = String(value);
    return s.length > 48 ? s.slice(0, 48) + '…' : s;
}

// 路径列表最多渲染 200 行：再多也看不过来，DOM 却会实打实地涨
function queryRenderPaths(matches) {
    queryPaths.innerHTML = '';
    if (!matches.length) {
        queryPaths.hidden = true;
        return;
    }
    queryPaths.hidden = false;
    const frag = document.createDocumentFragment();
    const limit = Math.min(matches.length, 200);
    for (let i = 0; i < limit; i++) {
        const m = matches[i];
        const row = document.createElement('div');
        row.className = 'query-path-row';
        const idx = document.createElement('span');
        idx.className = 'idx';
        idx.textContent = (i + 1) + '.';
        const p = document.createElement('span');
        p.className = 'p';
        p.textContent = m.path;
        const v = document.createElement('span');
        v.className = 'v';
        v.textContent = queryPreview(m.value);
        row.appendChild(idx);
        row.appendChild(p);
        row.appendChild(v);
        row.title = m.path;
        row.addEventListener('click', async () => {
            try {
                await writeClipboardText(m.path);
                showToast(qT('toastCopySuccess', 'Copied'));
            } catch (err) {
                showToast(qT('toastCopyError', 'Copy failed'), 'error');
            }
        });
        frag.appendChild(row);
    }
    queryPaths.appendChild(frag);
}

function queryIdle() {
    queryOutput.value = '';
    queryOutSize.textContent = '';
    queryOutBadge.textContent = '0';
    queryRenderPaths([]);
}

function queryRun() {
    const text = queryInput.value;
    if (!text.trim()) {
        queryIdle();
        queryInBadge.textContent = '—';
        querySetTip(qT('qTipIdle'));
        return;
    }
    const limit = window.DBXQuery ? window.DBXQuery.LIMITS.text : 2 * 1024 * 1024;
    if (text.length > limit) {
        queryIdle();
        querySetTip(qT('qErrTooLarge').replace('{n}', limit.toLocaleString()), 'err');
        return;
    }
    let data;
    try {
        data = JSON.parse(text);
    } catch (e) {
        queryIdle();
        queryInBadge.textContent = '—';
        queryTip.title = e && e.message ? e.message : '';
        querySetTip(qT('qErrBadJson'), 'err');
        return;
    }
    queryInBadge.textContent = 'JSON';
    queryTip.title = '';
    const expr = queryExpr.value;
    if (!expr.trim()) {
        queryIdle();
        queryExpr.classList.remove('is-bad');
        querySetTip(qT('qTipIdle'));
        return;
    }
    let res;
    try {
        res = window.DBXQuery.query(data, expr);
    } catch (e) {
        queryIdle();
        queryExpr.classList.add('is-bad');
        querySetTip(qT('qErrBadExpr'), 'err');
        return;
    }
    queryExpr.classList.remove('is-bad');
    const values = res.matches.map((m) => m.value);
    // 单值直接给值，多值给数组——一眼能看出"取到了什么"
    const out = values.length === 1
        ? JSON.stringify(values[0], null, 2)
        : JSON.stringify(values, null, 2);
    queryOutput.value = out;
    queryOutBadge.textContent = String(res.count);
    queryOutSize.textContent = qT('genTipChars').replace('{n}', out.length.toLocaleString());
    queryRenderPaths(res.matches);
    if (!res.count) {
        querySetTip(qT('qTipEmpty'));
    } else if (res.truncated) {
        querySetTip(qT('qTipTrunc').replace('{n}', String(res.count)), 'diff');
    } else {
        querySetTip(qT('qTipOk').replace('{n}', String(res.count)), 'ok');
    }
}

function querySchedule() {
    clearTimeout(queryTimer);
    queryTimer = setTimeout(queryRun, 220);
}

function queryRenderSamples() {
    querySamples.innerHTML = '';
    if (!window.DBXQuery) return;
    window.DBXQuery.SAMPLES.forEach((expr) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'sample-chip';
        chip.textContent = expr;
        chip.dataset.expr = expr;
        querySamples.appendChild(chip);
    });
}

/* --------------------------- Schema 子页 --------------------------- */

function schSetTip(text, cls) {
    schHint.textContent = text || '';
    schHint.className = 'sheet-hint' + (cls ? ' compare-tip ' + cls : '');
}

function schMessage(err) {
    const key = err.code;
    const table = QUERY_I18N[currentLang] || {};
    const tpl = table[key] || QUERY_I18N.en[key];
    // 没翻译的 code 直接露出来：开发看 code 反而更快定位
    if (!tpl) return err.code;
    return fillTokens(tpl, err);
}

function schRender(errors, truncated) {
    schErrors.innerHTML = '';
    if (!errors || !errors.length) {
        schErrors.hidden = false;
        const ok = document.createElement('div');
        ok.className = 'query-ok-row';
        ok.textContent = qT('qSchTipOk');
        schErrors.appendChild(ok);
        return;
    }
    schErrors.hidden = false;
    const frag = document.createDocumentFragment();
    errors.forEach((err) => {
        const row = document.createElement('div');
        row.className = 'query-error-row';
        const path = document.createElement('span');
        path.className = 'path';
        path.textContent = err.path || '$';
        const msg = document.createElement('span');
        msg.className = 'msg';
        msg.textContent = schMessage(err);
        const code = document.createElement('span');
        code.className = 'code';
        code.textContent = err.code;
        row.appendChild(path);
        row.appendChild(msg);
        row.appendChild(code);
        frag.appendChild(row);
    });
    schErrors.appendChild(frag);
}

function schClearResult() {
    schErrors.innerHTML = '';
    schErrors.hidden = true;
}

function schRun() {
    const dataText = schData.value.trim();
    const schemaText = schSchema.value.trim();
    if (!dataText || !schemaText) {
        schClearResult();
        schDataBadge.textContent = dataText ? 'JSON' : '—';
        schSchemaBadge.textContent = schemaText ? 'JSON' : '—';
        schSetTip(qT('qSchEmpty'));
        return;
    }
    let data;
    let schema;
    try {
        data = JSON.parse(dataText);
    } catch (e) {
        schClearResult();
        schDataBadge.textContent = '—';
        schSetTip(qT('qSchBadData'), ' compare-tip err');
        return;
    }
    try {
        schema = JSON.parse(schemaText);
    } catch (e) {
        schClearResult();
        schSchemaBadge.textContent = '—';
        schSetTip(qT('qSchBadSchema'), ' compare-tip err');
        return;
    }
    schDataBadge.textContent = 'JSON';
    schSchemaBadge.textContent = 'JSON';
    const res = window.DBXSchema.validate(data, schema);
    schRender(res.errors, res.truncated);
    if (res.ok) {
        schSetTip(qT('qSchTipOk'), ' compare-tip ok');
    } else if (res.truncated) {
        schSetTip(qT('qSchTipTrunc').replace('{n}', String(res.errors.length)), ' compare-tip err');
    } else {
        schSetTip(qT('qSchTipBad').replace('{n}', String(res.errors.length)), ' compare-tip err');
    }
}

function schInfer() {
    const text = schData.value.trim();
    if (!text) {
        schSetTip(qT('qSchEmpty'));
        return;
    }
    let data;
    try {
        data = JSON.parse(text);
    } catch (e) {
        schSetTip(qT('qSchBadData'), ' compare-tip err');
        return;
    }
    schSchema.value = JSON.stringify(window.DBXSchema.infer(data), null, 2);
    schSchemaBadge.textContent = 'JSON';
    schRun();
}

function schSchedule() {
    clearTimeout(schTimer);
    schTimer = setTimeout(schRun, 300);
}
let schTimer = null;

function schLoadSample(name) {
    const pair = SCH_SAMPLES[name] || SCH_SAMPLES.user;
    schSampleText = pair.data;
    schData.value = pair.data;
    schSchema.value = pair.schema;
    schRun();
}

/* ----------------------------- 转义子页 ----------------------------- */

function escSetTip(text, cls) {
    escTip.textContent = text || '';
    escTip.className = 'compare-tip' + (cls ? ' ' + cls : '');
}

function escKindLabel(id) {
    return eT('escKind' + id.charAt(0).toUpperCase() + id.slice(1), id);
}

function escRenderKinds() {
    escKinds.innerHTML = '';
    if (!window.DBXEscape) return;
    window.DBXEscape.KINDS.forEach((k) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'sample-chip' + (k.id === escKind ? ' active' : '');
        chip.textContent = escKindLabel(k.id);
        chip.dataset.kind = k.id;
        escKinds.appendChild(chip);
    });
}

function escRun() {
    const text = escInput.value;
    escInBadge.textContent = text ? text.length.toLocaleString() : '—';
    if (!text) {
        escOutput.value = '';
        escOutSize.textContent = '';
        escSetTip(eT('escTipIdle'));
        return;
    }
    const res = window.DBXEscape.convert(text, escKind, escDir);
    if (!res.ok) {
        escOutput.value = '';
        escOutSize.textContent = '';
        escSetTip(res.code === 'esc-too-large'
            ? eT('escErrTooLarge').replace('{n}', window.DBXEscape.LIMITS.chars.toLocaleString())
            : eT('escErrBad'), 'err');
        return;
    }
    escOutput.value = res.text;
    escOutSize.textContent = qT('genTipChars').replace('{n}', res.text.length.toLocaleString());
    escSetTip(eT('escTipOk').replace('{n}', res.text.length.toLocaleString()), 'ok');
}

function escSchedule() {
    clearTimeout(escTimer);
    escTimer = setTimeout(escRun, 200);
}

function escSetKind(kind) {
    if (!window.DBXEscape || window.DBXEscape.KIND_IDS.indexOf(kind) < 0) return;
    escKind = kind;
    escOutBadge.textContent = escKindLabel(kind);
    escRenderKinds();
    escRun();
}

function escSetDir(dir) {
    if (dir !== 'encode' && dir !== 'decode') return;
    escDir = dir;
    escDirTabs.querySelectorAll('.compare-tab').forEach((tab) => {
        tab.classList.toggle('active', tab.dataset.dir === dir);
    });
    escRun();
}

function escFlipSides() {
    // 对调 = 把结果搬回左边并换个方向，正好用来验证「编回去是不是原文」
    if (!escOutput.value) return;
    escInput.value = escOutput.value;
    escDir = window.DBXEscape ? window.DBXEscape.flip(escDir) : (escDir === 'encode' ? 'decode' : 'encode');
    escDirTabs.querySelectorAll('.compare-tab').forEach((tab) => {
        tab.classList.toggle('active', tab.dataset.dir === escDir);
    });
    escRun();
}

/* ----------------------------- 编辑器与页面切换 ----------------------------- */

function editorConfig(mode, placeholder, onRun) {
    return Object.assign({}, commonConfig, {
        mode: mode,
        placeholder: placeholder || '',
        extraKeys: Object.assign({}, commonConfig.extraKeys, {
            'Cmd-Enter': () => onRun(),
            'Ctrl-Enter': () => onRun()
        })
    });
}

// 查询页四个编辑器一次性建好：这一页的输入上限只有 2 M 字符，
// 且两栏同屏可见，拆成两次懒创建没有收益，只让切换时多一次布局抖动
function ensureQueryEditors() {
    if (queryDataEditor) return;
    queryDataEditor = CodeMirror.fromTextArea(queryInput, editorConfig('application/json', queryInput.placeholder, queryRun));
    queryResultEditor = CodeMirror.fromTextArea(queryOutput, Object.assign(
        editorConfig('application/json', queryOutput.placeholder, queryRun), { readOnly: true }));
    schDataEditor = CodeMirror.fromTextArea(schData, editorConfig('application/json', schData.placeholder, schRun));
    schSchemaEditor = CodeMirror.fromTextArea(schSchema, editorConfig('application/json', schSchema.placeholder, schRun));
    queryDataEditor.on('change', () => {
        const next = queryDataEditor.getValue();
        if (queryInput.value !== next) queryInput.value = next;
        querySchedule();
    });
    schDataEditor.on('change', () => {
        const next = schDataEditor.getValue();
        if (schData.value !== next) schData.value = next;
        schSchedule();
    });
    schSchemaEditor.on('change', () => {
        const next = schSchemaEditor.getValue();
        if (schSchema.value !== next) schSchema.value = next;
        schSchedule();
    });
    linkTextareaToEditor(queryInput, queryDataEditor);
    linkTextareaToEditor(queryOutput, queryResultEditor);
    linkTextareaToEditor(schData, schDataEditor);
    linkTextareaToEditor(schSchema, schSchemaEditor);
    syncEditorTheme();
}

function ensureEscEditors() {
    if (escInputEditor) return;
    escInputEditor = CodeMirror.fromTextArea(escInput, editorConfig('text/plain', escInput.placeholder, escRun));
    escOutputEditor = CodeMirror.fromTextArea(escOutput, Object.assign(
        editorConfig('text/plain', escOutput.placeholder, escRun), { readOnly: true }));
    escInputEditor.on('change', () => {
        const next = escInputEditor.getValue();
        if (escInput.value !== next) escInput.value = next;
        escSchedule();
    });
    linkTextareaToEditor(escInput, escInputEditor);
    linkTextareaToEditor(escOutput, escOutputEditor);
    syncEditorTheme();
}

function escSyncPlaceholders() {
    if (!escInputEditor) return;
    escInputEditor.setOption('placeholder', escInput.placeholder || '');
    escOutputEditor.setOption('placeholder', escOutput.placeholder || '');
}

function querySyncPlaceholders() {
    if (!queryDataEditor) return;
    queryDataEditor.setOption('placeholder', queryInput.placeholder || '');
    queryResultEditor.setOption('placeholder', queryOutput.placeholder || '');
    schDataEditor.setOption('placeholder', schData.placeholder || '');
    schSchemaEditor.setOption('placeholder', schSchema.placeholder || '');
    queryExpr.placeholder = qT('qExprPlaceholder');
}

function queryApplyTab() {
    queryTabs.querySelectorAll('.compare-tab').forEach((tab) => {
        tab.classList.toggle('active', tab.dataset.tab === queryTab);
    });
    queryPathPane.classList.toggle('active', queryTab === 'path');
    querySchemaPane.classList.toggle('active', queryTab === 'schema');
    if (queryTab === 'path') {
        querySetTip(queryInput.value.trim() ? queryTip.textContent : qT('qTipIdle'));
    } else {
        querySetTip(schHint.textContent || '');
    }
    requestAnimationFrame(() => {
        if (queryDataEditor) {
            queryDataEditor.refresh();
            queryResultEditor.refresh();
            schDataEditor.refresh();
            schSchemaEditor.refresh();
        }
    });
}

function querySetTab(tab) {
    if (tab !== 'path' && tab !== 'schema') return;
    if (tab === queryTab) return;
    queryTab = tab;
    queryApplyTab();
    if (tab === 'schema' && !schData.value.trim() && !schSchema.value.trim()) {
        schLoadSample('user');
    }
}

// 进入独立页前先收起「对比」内嵌视图——它挂在转换页的工作区上，不收会两页叠着显示
function exitDiffIfActive() {
    if (!isDiffMode) return;
    isDiffMode = false;
    diffReport.classList.remove('show');
    diffWorkspace.classList.remove('active');
    toggleDiffBtn.textContent = currentDict.diffBtn || '对比差异';
    toggleDiffBtn.classList.remove('btn-diff');
}

function enterQueryMode() {
    exitOtherModes('query');
    queryModeActive = true;
    markConvertActive(null);
    mainWorkspace.classList.add('hidden');
    toolbarEl.classList.add('hidden');
    ensureQueryEditors();
    queryWorkspaceEl.classList.add('active');
    navQueryLink.classList.add('active');
    queryApplyTab();
    if (!queryInput.value.trim()) {
        querySampleText = QUERY_SAMPLE;
        queryInput.value = QUERY_SAMPLE;
        queryExpr.value = window.DBXQuery ? window.DBXQuery.SAMPLES[0] : '$.store.book[*].title';
        queryRun();
    } else {
        queryRun();
    }
    requestAnimationFrame(() => {
        queryDataEditor.refresh();
        queryResultEditor.refresh();
        schDataEditor.refresh();
        schSchemaEditor.refresh();
    });
}

function exitQueryMode() {
    if (!queryModeActive) return;
    queryModeActive = false;
    clearTimeout(queryTimer);
    clearTimeout(schTimer);
    queryWorkspaceEl.classList.remove('active');
    navQueryLink.classList.remove('active');
    toolbarEl.classList.remove('hidden');
    mainWorkspace.classList.remove('hidden');
    requestAnimationFrame(() => {
        inputEditor.refresh();
        outputEditor.refresh();
    });
}

// 转义工具是独立页面（和对比 / SQL / 表格一样），进来就留着，换页即离开
function enterEscMode() {
    if (escModeActive) return;
    exitOtherModes('esc');
    escModeActive = true;
    markConvertActive(null);
    mainWorkspace.classList.add('hidden');
    toolbarEl.classList.add('hidden');
    ensureEscEditors();
    escWorkspaceEl.classList.add('active');
    navEscapeLink.classList.add('active');
    escRenderKinds();
    escOutBadge.textContent = escKindLabel(escKind);
    if (!escInput.value.trim()) {
        escInput.value = ESC_SAMPLE;
        escRun();
    } else {
        escRun();
    }
    requestAnimationFrame(() => {
        escInputEditor.refresh();
        escOutputEditor.refresh();
    });
}

function exitEscMode() {
    if (!escModeActive) return;
    escModeActive = false;
    clearTimeout(escTimer);
    escWorkspaceEl.classList.remove('active');
    navEscapeLink.classList.remove('active');
    toolbarEl.classList.remove('hidden');
    mainWorkspace.classList.remove('hidden');
    requestAnimationFrame(() => {
        inputEditor.refresh();
        outputEditor.refresh();
    });
}

function refreshQueryI18n() {
    queryRenderSamples();
    querySyncPlaceholders();
    queryExpr.placeholder = qT('qExprPlaceholder');
    if (queryModeActive) {
        queryRun();
        schRun();
    }
}

function refreshEscI18n() {
    escRenderKinds();
    escOutBadge.textContent = escKindLabel(escKind);
    escInput.placeholder = eT('escInputPlaceholder');
    escOutput.placeholder = eT('escEmpty');
    escSyncPlaceholders();
    if (escModeActive) escRun();
}

/* ----------------------------- 字节转换页 ----------------------------- */

function bT(key, fallback) {
    const table = BYTES_I18N[currentLang] || {};
    return table[key] || (BYTES_I18N.en || {})[key] || (BYTES_I18N['zh-CN'] || {})[key] || fallback || key;
}

function bytesSetTip(text, cls) {
    bytesTip.textContent = text || '';
    bytesTip.className = 'compare-tip' + (cls ? ' ' + cls : '');
}

// 数值一律不带千分位：这些值经常要直接贴进代码 / 命令行 / 配置，
// 逗号在那里是语法错误；要读位数就看下面的 1000/1024 进制。
function bytesFmt(n) {
    const v = Number(n);
    return isFinite(v) ? String(v) : '—';
}

// 单个值复制：卡片点一下、表格里某个数值点一下都走这里
async function bytesCopyOne(text) {
    const value = String(text == null ? '' : text).trim();
    if (!value || value === '—') {
        showToast(qT('toastCopyError', 'Nothing to copy'), 'error');
        return;
    }
    try {
        await writeClipboardText(value);
        showToast(qT('toastCopySuccess', 'Copied'));
    } catch (err) {
        showToast(qT('toastCopyError', 'Copy failed'), 'error');
    }
}

function ensureBytesEditor() {
    if (bytesEditor) return;
    bytesEditor = CodeMirror.fromTextArea(bytesInput, editorConfig('text/plain', bytesInput.placeholder, bytesRun));
    bytesEditor.on('change', () => {
        const next = bytesEditor.getValue();
        if (bytesInput.value !== next) bytesInput.value = next;
        bytesSchedule();
    });
    linkTextareaToEditor(bytesInput, bytesEditor);
    syncEditorTheme();
}

function bytesSchedule() {
    clearTimeout(bytesTimer);
    bytesTimer = setTimeout(bytesRun, 180);
}

// 表格：每行一条输入，末尾给合计（多行才有意义，单行不重复一遍）
function bytesRenderTable(result) {
    const B = window.DBXBytes;
    const frag = document.createDocumentFragment();

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    ['#', bT('bytesColInput'), bT('bytesColBytes'), bT('bytesUnits1000'), bT('bytesUnits1024')]
        .forEach((label) => {
            const th = document.createElement('th');
            th.textContent = label;
            headRow.appendChild(th);
        });
    thead.appendChild(headRow);
    frag.appendChild(thead);

    const tbody = document.createElement('tbody');
    result.rows.forEach((row, i) => {
        const tr = document.createElement('tr');
        if (!row.ok) tr.className = 'bad';
        const cell = (text, cls, copyable) => {
            const td = document.createElement('td');
            if (cls) td.className = cls;
            // 数值列点一下就复制这一个值（提示走 i18n，不用图标）
            if (copyable) td.title = bT('bytesCopyValue');
            td.textContent = text;
            tr.appendChild(td);
            return td;
        };
        cell(String(row.line || i + 1));
        const inCell = cell(row.input || '', 'in');
        inCell.title = row.input || '';
        if (row.ok) {
            cell(bytesFmt(row.bytes), 'num', true);
            cell(B.human(row.bytes, bytesDecimals, 1000), 'num', true);
            cell(B.human(row.bytes, bytesDecimals, 1024), 'num', true);
        } else {
            const msg = row.code === 'too-large'
                ? bT('bytesErrTooLarge').replace('{n}', B.human(B.LIMITS.maxBytes, 0, 1024))
                : (row.code === 'too-many'
                    ? bT('bytesErrTooMany').replace('{n}', String(B.LIMITS.maxSeq))
                    : bT('bytesErrBad'));
            const err = cell(msg);
            err.colSpan = 3;
        }
        tbody.appendChild(tr);
    });
    frag.appendChild(tbody);

    if (result.rows.length > 1 && result.okCount) {
        const tfoot = document.createElement('tfoot');
        const tr = document.createElement('tr');
        const total = (text, cls, copyable) => {
            const td = document.createElement('td');
            if (cls) td.className = cls;
            if (copyable) td.title = bT('bytesCopyValue');
            td.textContent = text;
            tr.appendChild(td);
        };
        total('');
        total(bT('bytesTotal'));
        total(bytesFmt(result.total), 'num', true);
        total(B.human(result.total, bytesDecimals, 1000), 'num', true);
        total(B.human(result.total, bytesDecimals, 1024), 'num', true);
        tfoot.appendChild(tr);
        frag.appendChild(tfoot);
    }

    bytesTableEl.innerHTML = '';
    bytesTableEl.appendChild(frag);
}

// 三种写法：只有拿到真实字节（即某行是字节序列）时才出内容
function bytesRenderForms(data) {
    const B = window.DBXBytes;
    bytesFormsEl.innerHTML = '';
    if (!data || !data.length) {
        const empty = document.createElement('div');
        empty.className = 'bytes-empty';
        empty.textContent = bT('bytesSeqNeeded');
        bytesFormsEl.appendChild(empty);
        return;
    }
    const set = B.forms(data);
    [['hexDump', 'bytesHexDump'], ['byteArray', 'bytesByteArray'], ['binary', 'bytesBinaryString']]
        .forEach((pair) => {
            const box = document.createElement('div');
            box.className = 'bytes-form';
            const head = document.createElement('header');
            const title = document.createElement('span');
            title.textContent = bT(pair[1]);
            const copyBtn = document.createElement('button');
            copyBtn.type = 'button';
            copyBtn.className = 'btn btn-outline';
            copyBtn.textContent = currentDict.copyBtn || '复制';
            copyBtn.dataset.copyForm = pair[0];
            copyBtn.dataset.copyText = set[pair[0]].full;
            head.appendChild(title);
            head.appendChild(copyBtn);
            const pre = document.createElement('pre');
            pre.textContent = set[pair[0]].preview + (set[pair[0]].clipped ? '\n…' : '');
            box.appendChild(head);
            box.appendChild(pre);
            bytesFormsEl.appendChild(box);
        });
}

function bytesTsv(result) {
    const B = window.DBXBytes;
    const rows = [[bT('bytesColInput'), bT('bytesColBytes'), bT('bytesUnits1000'), bT('bytesUnits1024')].join('\t')];
    result.rows.forEach((row) => {
        if (!row.ok) {
            rows.push([row.input || '', '', '', ''].join('\t'));
            return;
        }
        rows.push([
            row.input || '',
            String(row.bytes),
            B.human(row.bytes, bytesDecimals, 1000),
            B.human(row.bytes, bytesDecimals, 1024)
        ].join('\t'));
    });
    if (result.rows.length > 1 && result.okCount) {
        rows.push([
            bT('bytesTotal'),
            String(result.total),
            B.human(result.total, bytesDecimals, 1000),
            B.human(result.total, bytesDecimals, 1024)
        ].join('\t'));
    }
    return rows.join('\n');
}

function bytesRun() {
    const B = window.DBXBytes;
    if (!B) return;
    const text = bytesInput.value;
    const result = B.parse(text);
    const lineCount = result.rows.length;

    bytesInBadge.textContent = lineCount ? String(lineCount) : '—';

    if (!lineCount) {
        bytesExactValue.textContent = '—';
        bytesHuman1000.textContent = '—';
        bytesHuman1024.textContent = '—';
        bytesOutSize.textContent = '';
        bytesOutBadge.textContent = 'B';
        bytesTableEl.innerHTML = '';
        bytesRenderForms(null);
        bytesCopyPayload = '';
        bytesSetTip(bT('bytesEmpty'));
        return;
    }

    bytesRenderTable(result);
    const first = result.rows.filter((r) => r.ok)[0] || null;
    bytesExactValue.textContent = first ? bytesFmt(first.bytes) + ' B' : '—';
    bytesHuman1000.textContent = first ? B.human(first.bytes, bytesDecimals, 1000) : '—';
    bytesHuman1024.textContent = first ? B.human(first.bytes, bytesDecimals, 1024) : '—';
    bytesOutSize.textContent = first ? bytesFmt(first.bytes) + ' B' : '';
    bytesOutBadge.textContent = first && first.seqBase ? first.seqBase.toUpperCase() : 'B';
    bytesRenderForms(result.firstData);
    bytesCopyPayload = bytesTsv(result);

    if (result.okCount) {
        const totalText = result.rows.length > 1
            ? B.human(result.total, bytesDecimals, 1024) + ' / ' + B.human(result.total, bytesDecimals, 1000)
            : B.human(first.bytes, bytesDecimals, 1024);
        bytesSetTip(bT('bytesTipOk')
            .replace('{n}', String(result.rows.length))
            .replace('{total}', totalText), 'ok');
    } else {
        bytesSetTip(bT('bytesErrBad'), 'err');
    }
}

function enterBytesMode() {
    if (bytesModeActive) return;
    exitOtherModes('bytes');
    bytesModeActive = true;
    markConvertActive(null);
    mainWorkspace.classList.add('hidden');
    toolbarEl.classList.add('hidden');
    ensureBytesEditor();
    bytesWorkspaceEl.classList.add('active');
    navBytesLink.classList.add('active');
    if (!bytesInput.value.trim()) {
        bytesInput.value = BYTES_SAMPLE;
        bytesEditor.setValue(BYTES_SAMPLE);
    }
    bytesRun();
    requestAnimationFrame(() => bytesEditor.refresh());
}

function exitBytesMode() {
    if (!bytesModeActive) return;
    bytesModeActive = false;
    clearTimeout(bytesTimer);
    bytesWorkspaceEl.classList.remove('active');
    navBytesLink.classList.remove('active');
    toolbarEl.classList.remove('hidden');
    mainWorkspace.classList.remove('hidden');
    requestAnimationFrame(() => {
        inputEditor.refresh();
        outputEditor.refresh();
    });
}

function refreshBytesI18n() {
    if (!bytesEditor) return;
    bytesEditor.setOption('placeholder', bytesInput.placeholder || '');
    if (bytesModeActive) bytesRun();
}

bytesDecimalsEl.addEventListener('change', () => {
    const value = Number(bytesDecimalsSelect.getValue());
    bytesDecimals = isFinite(value) ? value : 2;
    bytesRun();
});
document.getElementById('bytesCopy').addEventListener('click', async () => {
    if (!bytesCopyPayload) {
        showToast(qT('toastCopyError', 'Nothing to copy'), 'error');
        return;
    }
    try {
        await writeClipboardText(bytesCopyPayload);
        showToast(qT('toastCopySuccess', 'Copied'));
    } catch (err) {
        showToast(qT('toastCopyError', 'Copy failed'), 'error');
    }
});
document.getElementById('bytesClear').addEventListener('click', () => {
    clearTimeout(bytesTimer);
    bytesInput.value = '';
    if (bytesEditor) bytesEditor.setValue('');
    bytesRun();
});
// 单个值复制：汇总卡片的数字（或它旁边的「复制」）与表格里每个换算结果
bytesPanel.addEventListener('click', (e) => {
    const figure = e.target.closest('[data-copy-id]');
    if (figure) {
        const target = document.getElementById(figure.dataset.copyId || '');
        bytesCopyOne(target ? target.textContent : '');
        return;
    }
    const cell = e.target.closest('#bytesTable td.num');
    if (cell) bytesCopyOne(cell.textContent);
});
bytesFormsEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-copy-form]');
    if (!btn) return;
    try {
        await writeClipboardText(btn.dataset.copyText || '');
        showToast(qT('toastCopySuccess', 'Copied'));
    } catch (err) {
        showToast(qT('toastCopyError', 'Copy failed'), 'error');
    }
});

/* ----------------------------- 时间转换 ----------------------------- */

function timeT(key, fallback) {
    const table = TIME_I18N[currentLang] || {};
    return table[key] || (TIME_I18N.en || {})[key] || (TIME_I18N['zh-CN'] || {})[key] || fallback || key;
}

function timeSetTip(text, cls) {
    timeTip.textContent = text || '';
    timeTip.className = 'compare-tip' + (cls ? ' ' + cls : '');
}

// 勾选状态：time.js 里 FIELDS 的 key 为准，默认按 def 勾选
function timeInitRules() {
    const T = window.DBXTime;
    if (!T) return;
    timeRules = {};
    Object.keys(T.FIELDS).forEach((key) => {
        timeRules[key] = !!T.FIELDS[key].def;
    });
}

function timeRenderRules() {
    const T = window.DBXTime;
    if (!T || !timeRules) return;
    timeRulesEl.innerHTML = '';
    Object.keys(T.FIELDS).forEach((key) => {
        const chip = document.createElement('span');
        chip.className = 'time-rule';
        chip.setAttribute('role', 'checkbox');
        chip.setAttribute('aria-checked', timeRules[key] ? 'true' : 'false');
        chip.dataset.field = key;
        chip.textContent = timeT('timeF' + key.charAt(0).toUpperCase() + key.slice(1), key);
        timeRulesEl.appendChild(chip);
    });
}

// 相对时间：把 time.js 的 { n, unit, future } 换成当前语言
function timeRelative(d) {
    if (!d || d.n === 0) return timeT('timeNow', '刚刚');
    const unit = timeT('unit' + d.unit.charAt(0).toUpperCase() + d.unit.slice(1), d.unit);
    const tpl = d.future ? timeT('timeIn', '{n} {unit}后') : timeT('timeAgo', '{n} {unit}前');
    return tpl.replace('{n}', String(d.n)).replace('{unit}', unit);
}

function timeFieldLabel(key) {
    return timeT('timeF' + key.charAt(0).toUpperCase() + key.slice(1), key);
}

// 一行结果 -> 一个 time-row 卡片（字段按勾选顺序排，值可逐个复制）
// 头部点击折叠/展开，超长字段值省略显示、悬停看全文、点击复制
function timeRenderRow(row) {
    const T = window.DBXTime;
    const wrap = document.createElement('div');
    wrap.className = 'time-row' + (row.ok ? '' : ' bad');
    wrap.dataset.line = String(row.line);

    const header = document.createElement('header');
    const arrow = document.createElement('span');
    arrow.className = 'time-row-arrow';
    header.appendChild(arrow);

    const lineEl = document.createElement('span');
    lineEl.className = 'time-row-line';
    lineEl.textContent = '#' + row.line;
    header.appendChild(lineEl);

    const inputEl = document.createElement('span');
    inputEl.className = 'time-row-input';
    inputEl.textContent = row.input || '';
    inputEl.title = row.input || '';
    header.appendChild(inputEl);

    if (row.ok) {
        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'btn btn-outline time-row-copy';
        copyBtn.dataset.copyRow = row.line;
        copyBtn.textContent = timeT('timeCopyRow', '复制整行');
        header.appendChild(copyBtn);
    }
    wrap.appendChild(header);

    if (!row.ok) {
        const err = document.createElement('div');
        err.className = 'time-row-err';
        err.textContent = timeT('timeErrAll', '无法识别');
        wrap.appendChild(err);
        return wrap;
    }

    const f = T.fields(row.ms);
    const enabled = Object.keys(T.FIELDS).filter((k) => timeRules[k]);
    const grid = document.createElement('div');
    grid.className = 'time-fields';
    enabled.forEach((key) => {
        const val = key === 'relative' ? timeRelative(f.relative) : f[key];
        const field = document.createElement('div');
        field.className = 'time-field';
        const label = document.createElement('span');
        label.className = 'time-field-label';
        label.textContent = timeFieldLabel(key);
        const value = document.createElement('span');
        value.className = 'time-field-value' + (key === 'relative' ? ' time-field-static' : '');
        value.textContent = val;
        // 相对时间结果不参与单独复制（也不进批量复制）
        if (key !== 'relative') value.dataset.copyText = val;
        value.title = val;
        field.appendChild(label);
        field.appendChild(value);
        grid.appendChild(field);
    });
    wrap.appendChild(grid);

    // 头部点击折叠/展开（点「复制整行」按钮不折叠）
    header.addEventListener('click', (e) => {
        if (e.target.closest('[data-copy-row]')) return;
        wrap.classList.toggle('collapsed');
    });

    return wrap;
}

function timeRun() {
    const T = window.DBXTime;
    if (!T) return;
    // 规则没初始化就按默认勾选补上（拖放 / 导入可能绕过 enterTimeMode 直接进到这里）
    if (!timeRules) { timeInitRules(); timeRenderRules(); }
    const result = T.parse(timeInput.value);

    timeInBadge.textContent = result.rows.length ? String(result.rows.length) : '—';
    timeOutBadge.textContent = '';
    timeOutSize.textContent = '';

    timePanel.innerHTML = '';
    const frag = document.createDocumentFragment();
    result.rows.forEach((row) => frag.appendChild(timeRenderRow(row)));
    timePanel.appendChild(frag);

    if (!result.rows.length) {
        timeSetTip(timeT('timeEmpty'));
        return;
    }
    let note = timeT('timeTipOk').replace('{ok}', String(result.okCount)).replace('{fail}', String(result.failCount));
    if (result.truncated) note = timeT('timeTruncated').replace('{n}', String(result.rows.length)) + ' · ' + note;
    timeSetTip(note, result.okCount ? 'ok' : 'err');
}

function timeEnsureEditor() {
    if (timeEditor) return;
    timeEditor = CodeMirror.fromTextArea(timeInput, editorConfig('text/plain', timeInput.placeholder, timeRun));
    timeEditor.on('change', () => {
        const next = timeEditor.getValue();
        if (timeInput.value !== next) timeInput.value = next;
        timeSchedule();
    });
    // 光标在哪一行，右侧就定位并高亮对应的结果卡片（按行快速定位）
    timeEditor.on('cursorActivity', () => {
        if (!timeModeActive) return;
        const cursor = timeEditor.getCursor();
        timeLocateRow(cursor.line + 1);
    });
    linkTextareaToEditor(timeInput, timeEditor);
    syncEditorTheme();
}

// 高亮 + 滚动到第 line 行对应的结果卡片（行号从 1 起）
function timeLocateRow(line) {
    const target = timePanel.querySelector('.time-row[data-line="' + line + '"]');
    if (!target) return;
    timePanel.querySelectorAll('.time-row.locate').forEach((r) => r.classList.remove('locate'));
    target.classList.add('locate');
    // jsdom 里没有 scrollIntoView，别让定位把整页带崩
    if (typeof target.scrollIntoView === 'function') {
        target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
}

function timeSchedule() {
    clearTimeout(timeTimer);
    timeTimer = setTimeout(timeRun, 180);
}

// 快捷操作：算出常用时刻，换行追加到输入框最后一行，再定位到新加的那行
// 统一填本地时间 "YYYY-MM-DD HH:mm:ss"——不管勾了哪些输出格式都能解析回来
function timeQuickInsert(kind) {
    const T = window.DBXTime;
    if (!T || !T.quick) return;
    if (!timeRules) { timeInitRules(); timeRenderRules(); }
    const ms = T.quick(kind, Date.now());
    if (ms == null) return;

    const text = T.fields(ms).local;
    // 有 CodeMirror 时以编辑器为准（textarea.value 由桥接维护，不一定最新）
    const cur = String((timeEditor ? timeEditor.getValue() : timeInput.value) || '');
    const prev = cur.replace(/\s+$/, '');
    const next = prev ? prev + '\n' + text : text;
    timeInput.value = next;
    if (timeEditor) timeEditor.setValue(next);
    clearTimeout(timeTimer);
    timeRun();

    const line = next.split('\n').length;
    if (timeEditor) {
        timeEditor.setCursor({ line: line - 1, ch: text.length });
        timeEditor.focus();
    }
    timeLocateRow(line);
}

document.getElementById('timeQuickActions').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-quick]');
    if (!btn) return;
    timeQuickInsert(btn.dataset.quick);
});

function enterTimeMode() {
    if (timeModeActive) return;
    exitOtherModes('time');
    timeModeActive = true;
    markConvertActive(null);
    mainWorkspace.classList.add('hidden');
    toolbarEl.classList.add('hidden');
    timeEnsureEditor();
    if (!timeRules) timeInitRules();
    timeRenderRules();
    timeWorkspaceEl.classList.add('active');
    navTimeLink.classList.add('active');
    timeRun();
    requestAnimationFrame(() => timeEditor.refresh());
}

function exitTimeMode() {
    if (!timeModeActive) return;
    timeModeActive = false;
    clearTimeout(timeTimer);
    timeWorkspaceEl.classList.remove('active');
    navTimeLink.classList.remove('active');
    toolbarEl.classList.remove('hidden');
    mainWorkspace.classList.remove('hidden');
    requestAnimationFrame(() => {
        inputEditor.refresh();
        outputEditor.refresh();
    });
}

function refreshTimeI18n() {
    if (!timeEditor) return;
    timeEditor.setOption('placeholder', timeInput.placeholder || '');
    timeRenderRules();
    if (timeModeActive) timeRun();
}

timeRulesEl.addEventListener('click', (e) => {
    const chip = e.target.closest('.time-rule');
    if (!chip || !chip.dataset.field) return;
    const key = chip.dataset.field;
    timeRules[key] = !timeRules[key];
    chip.setAttribute('aria-checked', timeRules[key] ? 'true' : 'false');
    timeRun();
});
document.getElementById('timeRun').addEventListener('click', timeRun);
document.getElementById('timeClear').addEventListener('click', () => {
    clearTimeout(timeTimer);
    timeInput.value = '';
    if (timeEditor) timeEditor.setValue('');
    timeRun();
});
document.getElementById('timeCopy').addEventListener('click', async () => {
    const T = window.DBXTime;
    if (!T) return;
    const result = T.parse(timeInput.value);
    // 排除相对时间：复制按钮不带相对时间结果
    const keys = Object.keys(T.FIELDS).filter((k) => timeRules[k] && k !== 'relative');
    // 每行输入 -> 一行（该行勾选字段的值用空格连起来），行间换行；
    // 不带 #序号、不带输入原值、不带字段标签
    const lines = [];
    result.rows.forEach((row) => {
        if (!row.ok) return;
        const f = T.fields(row.ms);
        const cells = keys.map((k) => (k === 'relative' ? timeRelative(f.relative) : f[k]));
        lines.push(cells.join(' '));
    });
    if (!lines.length) {
        showToast(qT('toastCopyError', 'Nothing to copy'), 'error');
        return;
    }
    try {
        await writeClipboardText(lines.join('\n'));
        showToast(qT('toastCopySuccess', 'Copied'));
    } catch (err) {
        showToast(qT('toastCopyError', 'Copy failed'), 'error');
    }
});
// 单个值复制：点字段值复制该值；点「复制整行」复制这一行的所有字段（TSV）
timePanel.addEventListener('click', async (e) => {
    const cell = e.target.closest('[data-copy-text]');
    if (cell) {
        try {
            await writeClipboardText(cell.dataset.copyText || '');
            showToast(qT('toastCopySuccess', 'Copied'));
        } catch (err) {
            showToast(qT('toastCopyError', 'Copy failed'), 'error');
        }
        return;
    }
    const btn = e.target.closest('[data-copy-row]');
    if (btn) {
        const line = btn.dataset.copyRow;
        const T = window.DBXTime;
        const result = T.parse(timeInput.value);
        const row = result.rows.find((r) => String(r.line) === String(line));
        if (!row || !row.ok) return;
        const keys = Object.keys(T.FIELDS).filter((k) => timeRules[k] && k !== 'relative');
        const f = T.fields(row.ms);
        const cells = keys.map((k) => (k === 'relative' ? timeRelative(f.relative) : f[k]));
        try {
            await writeClipboardText(cells.join('\t'));
            showToast(qT('toastCopySuccess', 'Copied'));
        } catch (err) {
            showToast(qT('toastCopyError', 'Copy failed'), 'error');
        }
    }
});

/* ----------------------------- JSON 转图表 ----------------------------- */

// 示例：横版默认画布（700 × 400）下也好看的柱状图
const CHART_SAMPLE = [
    '{',
    '    "title": { "text": "月度访问量", "subtext": "2026 上半年", "left": "center" },',
    '    "tooltip": { "trigger": "axis" },',
    '    "grid": { "left": 16, "right": 20, "top": 76, "bottom": 16, "containLabel": true },',
    '    "xAxis": {',
    '        "type": "category",',
    '        "data": ["1月", "2月", "3月", "4月", "5月", "6月"],',
    '        "axisLabel": { "interval": 0 }',
    '    },',
    '    "yAxis": { "type": "value" },',
    '    "series": [{',
    '        "name": "访问量",',
    '        "type": "bar",',
    '        "barWidth": "46%",',
    '        "itemStyle": { "borderRadius": [4, 4, 0, 0] },',
    '        "data": [820, 932, 901, 934, 1290, 1330]',
    '    }]',
    '}'
].join('\n');

function cT(key, fallback) {
    const table = CHART_I18N[currentLang] || {};
    return table[key] || (CHART_I18N.en || {})[key] || (CHART_I18N['zh-CN'] || {})[key] || fallback || key;
}

function chartSetTip(text, cls) {
    chartTip.textContent = text || '';
    chartTip.className = 'compare-tip' + (cls ? ' ' + cls : '');
}

/* 出图不跟主题走：画出来的图是要拿去贴到别处的（文档、聊天、报告），
   宿主界面是暗色时也照样按浅色默认配色 + 白底出图——
   预览与导出共用同一份 option，所以「看到的」和「存下来的」永远是同一张。 */
const CHART_BG = '#ffffff';

function chartBg() {
    return CHART_BG;
}

/** 图表一律用 ECharts 默认（浅色）配色，不切 dark 主题 */
function chartThemeName() {
    return null;
}

function chartSizeNow() {
    const C = window.DBXChart;
    const w = C.clampSize(chartWidthInput.value, 'width');
    const h = C.clampSize(chartHeightInput.value, 'height');
    return { width: w.value, height: h.value, wCode: w.code, hCode: h.code };
}

/** 导出 PNG 的像素比（1x / 2x / 3x）。1x = 输入框写的像素，2x/3x 只放大位图，不改画布。
    注意别叫 chartScaleNow：那个名字被下面的「预览缩放」占了（(w, h) 参数那版）。 */
function chartPixelRatio() {
    const n = Math.round(Number(chartScaleSelect.getValue()));
    return n >= 1 && n <= 3 ? n : 1;
}

/* 4096 × 4096 再乘 3 就是 1.5 亿像素（RGBA 600 MB），画布和内存都扛不住，
   所以按总像素封顶自动降档；降了就按实际倍率命名，不骗人。 */
const CHART_MAX_PIXELS = 24e6;
function chartSafeScale(k, width, height) {
    const area = Math.max(1, (width || 0) * (height || 0));
    let eff = k;
    while (eff > 1 && area * eff * eff > CHART_MAX_PIXELS) eff -= 1;
    return eff;
}

/** 每个倍率后标出该档实际得到的像素，用户不用自己乘 */
function chartFillScale() {
    if (!window.DBXChart) return;
    const size = chartSizeNow();
    chartScaleEl.querySelectorAll('.custom-option').forEach((opt) => {
        const k = Math.round(Number(opt.dataset.value)) || 1;
        const badge = opt.querySelector('.chart-opt-size');
        if (badge) badge.textContent = (size.width * k) + ' × ' + (size.height * k);
    });
}

/** 导出按钮的 title 跟着尺寸 × 倍率走（动态内容，按钮上标了 data-keep-title） */
function chartSyncExportTitle() {
    const btn = document.getElementById('chartExportPng');
    if (!btn || !window.DBXChart) return;
    const size = chartSizeNow();
    const k = chartPixelRatio();
    btn.title = cT('chartExportPng', '导出 PNG') + ' · ' +
        (size.width * k) + ' × ' + (size.height * k) +
        (k > 1 ? ' · ' + k + 'x' : '');
}

function ensureChartEditor() {
    if (chartEditor) return;
    chartEditor = CodeMirror.fromTextArea(chartInput, editorConfig('application/json', chartInput.placeholder, () => chartRender(true)));
    chartEditor.on('change', () => {
        const next = chartEditor.getValue();
        if (chartInput.value !== next) chartInput.value = next;
        chartSchedule();
    });
    linkTextareaToEditor(chartInput, chartEditor);
    syncEditorTheme();
}

function chartSchedule() {
    // 尺寸一改，像素比下拉里的「实际像素」立刻跟着变
    chartFillScale();
    chartSyncExportTitle();
    clearTimeout(chartTimer);
    chartTimer = setTimeout(() => chartRender(false), 320);
}

const CHART_ENGINE_PATH = 'vendor/echarts/echarts.min.js';

/**
 * 宿主把插件页关进沙箱，CSP 是 `script-src 'unsafe-inline' blob:`——
 * 外部脚本（哪怕是同目录的本地文件）一律被拦，console 里是
 * "Loading the script '…/vendor/echarts/echarts.min.js' violates … Content Security Policy"。
 * 所以引擎不能靠外链脚本标签加载（连注释里写一个假标签都不行：
 * 宿主用正则扫 HTML 收集要内联的资源，扫到就真去读，读不到整页 400）。
 * 见下方 chartInlineEngine / chartRawAssetUrl 的三级加载。
 */
/**
 * 沙箱里宿主把带 src 的脚本内联成文本，引擎源码就在 #chartEngineSrc 里躺着。
 * 有内容就包成 blob: 地址（CSP 放行 blob:），长度太小说明只是普通浏览器里的空标签。
 */
function chartInlineEngine() {
    const holder = document.getElementById('chartEngineSrc');
    const text = holder ? (holder.textContent || '') : '';
    if (text.length < 4096) return '';
    try {
        return URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
    } catch (err) {
        return '';
    }
}

function chartEngineUrl() {
    // 1) 宿主内联好的文本 → blob（沙箱里最稳的一条，已实测过 CSP）
    const inline = chartInlineEngine();
    if (inline) return Promise.resolve(inline);
    // 2) 宿主提供读文件接口 → 自己包 blob（沙箱但不内联的宿主）
    const api = window.dbxPlugin;
    if (api && typeof api.readAssetUrl === 'function') {
        try {
            return Promise.resolve(api.readAssetUrl(CHART_ENGINE_PATH)).catch(chartRawAssetUrl);
        } catch (err) { /* 同步抛错的老宿主：走底层通道 */ }
    }
    // 3) 普通浏览器 / 非沙箱宿主：相对路径就行
    return chartRawAssetUrl();
}

/** 老宿主没有 readAssetUrl，但底层的 request + decodeBase64 在读盘这条路上是通的 */
function chartRawAssetUrl() {
    const api = window.dbxPlugin;
    if (api && typeof api.request === 'function' && typeof api.decodeBase64 === 'function') {
        return Promise.resolve(api.request('ui.readAsset', { path: CHART_ENGINE_PATH }))
            .then((asset) => {
                const bytes = api.decodeBase64(asset.dataBase64);
                return URL.createObjectURL(new Blob([bytes], { type: asset.contentType || 'text/javascript' }));
            })
            .catch(() => CHART_ENGINE_PATH);
    }
    return Promise.resolve(CHART_ENGINE_PATH);
}

/**
 * 引擎按需加载：全量 echarts 压缩后 1.1 MB，只有进这一页才解析。
 * 首屏不为用不到的页面付费（和图片页、代码生成页的懒创建同一思路）。
 */
function loadChartEngine() {
    if (chartEngine) return Promise.resolve(chartEngine);
    if (chartEnginePromise) return chartEnginePromise;
    chartEnginePromise = chartEngineUrl().then((url) => new Promise((resolve, reject) => {
        const isBlob = url.indexOf('blob:') === 0;
        const script = document.createElement('script');
        script.async = true;
        // 脚本执行完就撤：blob 地址释放、标签也从 head 摘掉，反复进出页面不留垃圾
        const revoke = () => {
            if (isBlob) URL.revokeObjectURL(url);
            if (script.parentNode) script.parentNode.removeChild(script);
        };
        script.onload = () => {
            revoke();
            chartEngine = window.echarts || null;
            if (chartEngine) resolve(chartEngine);
            else reject(new Error('global-missing'));
        };
        script.onerror = () => { revoke(); reject(new Error('load-failed')); };
        script.src = url;
        document.head.appendChild(script);
    })).catch((err) => {
        chartEnginePromise = null;   // 失败不缓存，下次进页还能再试一次
        throw err;
    });
    return chartEnginePromise;
}

// 一张 4096 × 4096 的 canvas 能吃掉几十 MB，离开页面 / 报错时一律放掉
function disposeChart() {
    if (chartInstance) {
        // 画布被宿主回收 / 环境没有 2D 上下文时 dispose() 自己会抛，别让它带崩页面
        try {
            if (!chartInstance.isDisposed()) chartInstance.dispose();
        } catch (err) { /* 已经不可用，继续清引用 */ }
    }
    chartInstance = null;
    chartCanvasEl.innerHTML = '';
    chartCanvasEl.hidden = true;
}

function chartShowEmpty(text) {
    chartEmpty.hidden = !text;
    chartEmpty.textContent = text || '';
    chartCanvasEl.hidden = true;
    if (chartZoomBar) chartZoomBar.hidden = true;
    if (chartPreviewBtn) chartPreviewBtn.hidden = true;
}

/**
 * 点「放大查看」/ 双击画布：把当前这一帧导成 PNG 丢进灯箱。
 * 为什么不直接把 canvas 搬到灯箱里：ECharts 的实例绑着原来的容器，
 * 搬走之后 resize / 重绘都会错位；用 getDataURL 拿一份位图最省事，
 * 而且和「导出 PNG」走同一条路径（pixelRatio: 1，像素和导出的完全一致）。
 */
function chartOpenPreview() {
    if (!chartResult || !chartInstance || chartInstance.isDisposed()) return;
    let url = '';
    // 「放大查看」跟导出用同一条出图路径：1x 时点进去放大就糊了，所以也按像素比出图
    const k = chartSafeScale(chartPixelRatio(), chartResult.width, chartResult.height);
    try {
        url = chartRenderPng(chartResult.option, chartResult.width, chartResult.height, k);
    } catch (e) {
        url = '';
    }
    if (!url || url.indexOf('data:image') !== 0) return;
    const kind = (chartOutBadge.textContent || '').trim();
    lbOpen(url, lbLabel(kind, chartResult.width * k, chartResult.height * k, 0) +
        (k > 1 ? ' · ' + k + 'x' : ''), chartPreviewBtn);
}

function chartErrorText(code, detail) {
    const d = detail || {};
    const num = (v) => String(v);
    if (code === 'json-invalid') {
        return cT('chartErrJson', 'JSON 解析失败：{msg}').replace('{msg}', d.message || '');
    }
    if (code === 'too-big') {
        return cT('chartErrTooBig', '输入太大（{n} 字符，上限 {limit}）')
            .replace('{n}', num(d.n)).replace('{limit}', num(d.limit));
    }
    if (code === 'too-many-points') {
        return cT('chartErrTooManyPoints', '数据点太多（{n}，上限 {limit}）')
            .replace('{n}', num(d.n)).replace('{limit}', num(d.limit));
    }
    if (code === 'too-many-series') {
        return cT('chartErrTooManySeries', '系列太多（{n}，上限 {limit}）')
            .replace('{n}', num(d.n)).replace('{limit}', num(d.limit));
    }
    if (code === 'engine') return cT('chartErrEngine', '图表引擎加载失败');
    if (code === 'render') {
        return cT('chartErrRender', '渲染失败：{msg}').replace('{msg}', d.message || '');
    }
    return cT('chartErrShape', '这段 JSON 画不出图');
}

function chartFail(code, detail) {
    chartResult = null;
    disposeChart();
    chartOutBadge.textContent = '—';
    chartOutSize.textContent = '';
    const text = chartErrorText(code, detail);
    chartShowEmpty(text);
    chartSetTip(text, 'err');
}

function chartApply(option, size) {
    const ec = chartEngine;
    const px = (n) => n + 'px';
    const resized = chartInstance && !chartInstance.isDisposed()
        && (chartInstance.getWidth() !== size.width || chartInstance.getHeight() !== size.height);
    if (!chartInstance || chartInstance.isDisposed()) {
        chartCanvasEl.hidden = false;
        chartCanvasEl.style.width = px(size.width);
        chartCanvasEl.style.height = px(size.height);
        chartInstance = ec.init(chartCanvasEl, chartThemeName(), {
            renderer: 'canvas',
            width: size.width,
            height: size.height
        });
    } else if (resized) {
        chartCanvasEl.style.width = px(size.width);
        chartCanvasEl.style.height = px(size.height);
        chartInstance.resize({ width: size.width, height: size.height });
    }
    // notMerge：上一份 option 的标题 / 图例 / 系列不能漏到这一份里
    chartInstance.setOption(option, true);
    chartCanvasEl.hidden = false;
    chartEmpty.hidden = true;
    // 宿主样式里若有一条 canvas{max-width:100%}，画布会被压扁成和面板一样宽——
    // 那样预览就不是导出拿到的那张图了，这里用 important 把尺寸钉成原样
    const guard = (el) => {
        if (!el || !el.style) return;
        el.style.setProperty('max-width', 'none', 'important');
        el.style.setProperty('max-height', 'none', 'important');
    };
    guard(chartCanvasEl);
    Array.prototype.forEach.call(chartCanvasEl.querySelectorAll('canvas'), guard);
}

// ---------- 预览缩放（只改显示，导出永远是 1:1 原始像素） ----------

/**
 * 画布装不进面板时按比例缩到看得见整张图；
 * 但只缩小一点点（>85%）就不折腾了，直接 1:1，免得莫名其妙糊一点。
 */
function chartFitScale(w, h) {
    const pad = 24;
    const availW = Math.max((chartStage.clientWidth || 0) - pad, 60);
    const availH = Math.max((chartStage.clientHeight || 0) - pad, 60);
    return Math.min(1, availW / w, availH / h);
}

function chartScaleNow(w, h) {
    if (chartZoom === 'fit') return chartFitScale(w, h);
    // auto：放得下就 1:1，明显放不下才缩（<85%），免得无谓地糊一点
    if (chartZoom === 'auto') {
        const f = chartFitScale(w, h);
        return f < 0.85 ? f : 1;
    }
    if (chartZoom === 'actual') return 1;
    return typeof chartZoom === 'number' ? chartZoom : 1;   // 'auto'
}

/**
 * 把缩放落到画布上：
 *   外层 div 的宽高改成「缩放过」的尺寸（滚动条才对得上），
 *   内层 canvas 用 transform 缩，位图仍是 w × h —— 导出的还是原图。
 */
function chartApplyZoom() {
    if (!chartResult) return;
    const w = chartResult.width;
    const h = chartResult.height;
    const k = Math.min(Math.max(chartScaleNow(w, h), 0.05), 4);
    chartZoomBar.hidden = false;
    if (chartPreviewBtn) chartPreviewBtn.hidden = false;
    chartCanvasEl.style.width = Math.max(Math.round(w * k), 1) + 'px';
    chartCanvasEl.style.height = Math.max(Math.round(h * k), 1) + 'px';
    const canvas = chartCanvasEl.querySelector('canvas');
    if (canvas) {
        canvas.style.transformOrigin = 'top left';
        canvas.style.transform = k === 1 ? '' : 'scale(' + k + ')';
    }
    // 缩小时画布可能超出外层 div（transform 不改布局），裁掉别露到边框外
    chartCanvasEl.style.overflow = 'hidden';
    chartZoomValue.textContent = Math.round(k * 100) + '%';
    chartZoomValue.classList.toggle('is-active', k !== 1);
    chartZoomFit.classList.toggle('is-active', chartZoom === 'fit');
}

/** 切换缩放模式后重算一次（不重画图表，只挪显示） */
function chartZoomStep(factor) {
    if (!chartResult) return;
    const w = chartResult.width;
    const h = chartResult.height;
    const base = chartScaleNow(w, h) || 1;
    chartZoom = Math.min(Math.max(base * factor, 0.05), 4);
    chartApplyZoom();
}

function chartZoomTo(mode) {
    chartZoom = mode;
    chartApplyZoom();
}

/** 图表下拉的开合：和顶栏 .custom-select 同一套手感（点外面 / Esc 收） */
function chartPickToggle(open) {
    const next = typeof open === 'boolean' ? open : !chartPickOptions.classList.contains('open');
    chartPickOptions.classList.toggle('open', next);
    chartPickTrigger.classList.toggle('active', next);
    if (!next) return;
    // 选项多时把当前项滚进可视区（面板自己滚，不动页面）
    const on = chartPickOptions.querySelector('.custom-option.selected');
    if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });
}

function chartPickSetValue(idx) {
    const opts = chartPickOptions.querySelectorAll('.custom-option');
    const target = Math.min(Math.max(Number(idx) || 0, 0), Math.max(opts.length - 1, 0));
    opts.forEach((opt, i) => opt.classList.toggle('selected', i === target));
    chartPickIndex = target;
    chartPick.dataset.value = String(target);
    const cur = opts[target];
    chartPickLabel.textContent = cur ? (cur.getAttribute('data-label') || cur.textContent) : '—';
}

/** 一份 JSON 里找到多个 option 时才显示下拉，让用户挑一个画 */
function chartFillPick(parsed, keepPick) {
    const list = (parsed && parsed.options) || [];
    const sig = list.map((o) => o.path + '|' + o.title).join('\u0001');
    // 只是切换「画哪个图」，选项没变：别重建下拉，否则选中值会掉回第一个
    if (keepPick && sig === chartPickSig) return;
    chartPickSig = sig;
    chartPickOptions.innerHTML = '';
    chartPickToggle(false);
    if (list.length < 2) {
        chartPickWrap.hidden = true;
        chartPickSetValue(0);
        return;
    }
    for (let i = 0; i < list.length; i++) {
        const item = list[i];
        const text = item.title || item.path || '#' + (i + 1);
        const opt = document.createElement('div');
        opt.className = 'custom-option';
        opt.setAttribute('role', 'option');
        opt.dataset.value = String(i);
        opt.dataset.label = text;
        // 名字长到面板装不下时省略，悬停能看到完整路径
        opt.title = item.path || text;
        const span = document.createElement('span');
        span.className = 'chart-pick-label';
        span.textContent = text;
        opt.appendChild(span);
        chartPickOptions.appendChild(opt);
    }
    chartPickSetValue(0);
    chartPickWrap.hidden = false;
}

async function chartRender(keepPick) {
    const C = window.DBXChart;
    if (!C) return;
    const seq = ++chartSeq;
    const parsed = C.parseText(chartInput.value);
    chartInBadge.textContent = 'JSON';

    if (parsed.code === 'empty') {
        chartResult = null;
        chartParsed = null;
        chartFillPick(null);
        disposeChart();
        chartOutBadge.textContent = '—';
        chartOutSize.textContent = '';
        chartShowEmpty(cT('chartTipIdle', '贴一段 JSON 就能出图'));
        chartSetTip(cT('chartTipIdle', '贴一段 JSON 就能出图'));
        return;
    }
    if (parsed.code) {
        chartParsed = null;
        chartFillPick(null);
        chartFail(parsed.code, parsed.detail);
        return;
    }

    // 解析结果留着：切换「哪个图」时不用重新解析一遍文本
    chartParsed = parsed;
    chartFillPick(parsed, keepPick === true);
    const list = parsed.options || [];
    const idx = Math.min(Math.max(Number(chartPick.dataset.value) || 0, 0), Math.max(list.length - 1, 0));
    const picked = list.length ? list[idx] : null;
    const viaPath = picked ? picked.path : parsed.via;

    const built = C.build(picked ? picked.value : parsed.value, {
        type: chartTypeSelect.getValue(),
        background: chartBg()
    });
    // 类型下拉一直可用：完整 option 也能被覆盖（自动 = 听 JSON 里的 series.type）
    chartTypeEl.title = built.meta && built.meta.kind === 'option'
        ? cT('chartTypeOverride', '自动 = 按 JSON 里的 series.type；选了就按你选的画')
        : '';
    if (built.code) {
        chartFail(built.code, built.detail);
        return;
    }

    chartInBadge.textContent = built.meta.kind === 'option' ? 'option' : cT('chartKindData', '数据');
    if (!chartEngine) {
        chartStage.classList.add('is-loading');
        chartShowEmpty(cT('chartTipLoading', '正在加载图表引擎…'));
        chartSetTip(cT('chartTipLoading', '正在加载图表引擎…'));
    }
    try {
        await loadChartEngine();
    } catch (err) {
        if (seq !== chartSeq) return;
        chartStage.classList.remove('is-loading');
        // 宿主 CSP 拦脚本时，这里就是唯一线索，别让它静默消失
        console.warn('[chart] engine load failed:', (err && err.message) || err);
        chartFail('engine');
        return;
    }
    chartStage.classList.remove('is-loading');
    if (seq !== chartSeq) return;   // 加载期间又改了输入，这次结果作废

    const size = chartSizeNow();
    try {
        chartApply(built.option, size);
    } catch (err) {
        chartFail('render', { message: (err && err.message) || String(err) });
        return;
    }

    chartResult = { option: built.option, width: size.width, height: size.height, meta: built.meta };
    chartOutBadge.textContent = built.meta.types.join(' + ') || '—';
    chartOutSize.textContent = size.width + ' × ' + size.height;

    // 尺寸变了就回到「自动」缩放；只换类型时保留用户当前的放大倍数
    if (chartZoomSize.w !== size.width || chartZoomSize.h !== size.height) {
        chartZoomSize = { w: size.width, h: size.height };
        chartZoom = 'auto';
    }
    chartApplyZoom();

    // 宽高越界时只在这里提示一句，**不回写输入框**——
    // 输入过程中用户会经过 9 / 90 这类中间值，此时回写会把人正在敲的字弹掉，
    // 输入根本进行不下去（这就是「输入之后老是变」的根因）。
    // 真正把非法值夹回边界，放在 blur（失焦）里做一次即可。
    const notes = [];
    if (parsed.truncated) notes.push(cT('chartTruncated', '内容太多，只扫描了前面一部分'));

    if (size.wCode || size.hCode) {
        const C2 = window.DBXChart;
        notes.push(cT('chartErrSize', '宽高超出范围，已按边界处理')
            .replace('{min}', String(C2.LIMITS.width.min))
            .replace('{max}', String(C2.LIMITS.width.max)));
        chartSetTip(notes.join(' · '), 'err');
    } else {
        let tipText = cT('chartTipOk', '{series} 个系列 · {points} 个点 · {w} × {h} px')
            .replace('{series}', String(built.meta.series))
            .replace('{points}', String(built.meta.points))
            .replace('{w}', String(size.width))
            .replace('{h}', String(size.height));
        // 外层被自动剥开时告诉用户「图是从哪个键里挖出来的」，否则会疑惑为什么少了字段
        if (viaPath) tipText = cT('chartUnwrapped', '已自动解析 {path}').replace('{path}', viaPath) + ' · ' + tipText;
        notes.push(tipText);
        chartSetTip(notes.join(' · '), 'ok');
    }
}

// SVG 不经过 canvas：照参考实现用 ssr + renderToSVGString，尺寸就是输入框里那两个数
function chartRenderSvg(option, width, height) {
    const ec = chartEngine;
    try {
        const temp = ec.init(null, chartThemeName(), { renderer: 'svg', ssr: true, width: width, height: height });
        try {
            temp.setOption(option, true);
            return temp.renderToSVGString();
        } finally {
            try { temp.dispose(); } catch (e) { /* 画布类资源已经没了，忽略 */ }
        }
    } catch (err) {
        // 万一当前环境不支持 ssr，就挂一个屏幕外的真实节点兜底
        const host = document.createElement('div');
        host.style.cssText = 'position:absolute;left:-99999px;top:0;width:' + width + 'px;height:' + height + 'px;';
        document.body.appendChild(host);
        const temp = ec.init(host, chartThemeName(), { renderer: 'svg', width: width, height: height });
        try {
            temp.setOption(option, true);
            if (typeof temp.renderToSVGString === 'function') return temp.renderToSVGString();
            return new XMLSerializer().serializeToString(host.querySelector('svg'));
        } finally {
            try { temp.dispose(); } catch (e) { /* 同上 */ }
            host.remove();
        }
    }
}

/* PNG 照参考实现（echarts-node-export-server 那套）：单独起一个临时实例，
   把像素比交给 devicePixelRatio，再把它的画布取成 PNG。
   这样导出结果与画布上当前的缩放/交互状态完全无关，尺寸就是 width×ratio 与 height×ratio。 */
function chartRenderPng(option, width, height, ratio) {
    const ec = chartEngine;
    const host = document.createElement('div');
    host.style.cssText = 'position:absolute;left:-99999px;top:0;width:' + width + 'px;height:' + height + 'px;';
    document.body.appendChild(host);
    const temp = ec.init(host, chartThemeName(), {
        renderer: 'canvas',
        width: width,
        height: height,
        devicePixelRatio: ratio
    });
    try {
        temp.setOption(option, true);
        // devicePixelRatio 只决定这个临时实例自己的画布分辨率；
        // 取图时 zrender 用的是「逻辑宽高 × pixelRatio」，不读实例的 dpr，
        // 所以这里必须把倍率再传一遍（实测 pixelRatio:1 会老老实实给 700×400）。
        return temp.getDataURL({ type: 'png', pixelRatio: ratio, backgroundColor: chartBg() });
    } finally {
        try { temp.dispose(); } catch (e) { /* 画布类资源已经没了，忽略 */ }
        host.remove();
    }
}

async function chartExport(kind) {
    if (!chartResult) {
        showToast(cT('chartExportEmpty', '还没有可导出的图表'), 'error');
        return;
    }
    const btn = document.getElementById(kind === 'svg' ? 'chartExportSvg' : 'chartExportPng');
    btn.disabled = true;
    try {
        if (kind === 'svg') {
            const svg = chartRenderSvg(chartResult.option, chartResult.width, chartResult.height);
            if (!svg || svg.indexOf('<svg') < 0) throw new Error('empty-svg');
            const status = await saveTextFile('chart.svg', svg, 'image/svg+xml;charset=utf-8');
            saveToast(status, cT('chartToastExported', '已导出') + ' · chart.svg');
        } else {
            // 按选择的像素比出图：1x = 输入框的宽高，2x / 3x 出更大的位图
            const k = chartSafeScale(chartPixelRatio(), chartResult.width, chartResult.height);
            const url = chartRenderPng(chartResult.option, chartResult.width, chartResult.height, k);
            const comma = url.indexOf(',');
            if (comma < 0) throw new Error('empty-png');
            const name = 'chart' + (k > 1 ? '@' + k + 'x' : '') + '.png';
            const status = await saveBinaryFile(name, url.slice(comma + 1), 'image/png');
            saveToast(status, cT('chartToastExported', '已导出') + ' · ' + name +
                ' · ' + (chartResult.width * k) + ' × ' + (chartResult.height * k));
        }
    } catch (err) {
        showToast(cT('chartErrExport', '导出失败：{msg}').replace('{msg}', (err && err.message) || ''), 'error');
    } finally {
        btn.disabled = false;
    }
}

/* 换主题不重画：图表的配色固定浅色、底色固定白，
   跟界面是亮是暗无关，重建实例只会白白丢一次渲染。 */

function enterChartMode() {
    if (chartModeActive) return;
    exitOtherModes('chart');
    chartModeActive = true;
    markConvertActive(null);
    mainWorkspace.classList.add('hidden');
    toolbarEl.classList.add('hidden');
    chartWorkspaceEl.classList.add('active');
    navChartLink.classList.add('active');
    ensureChartEditor();
    if (!chartInput.value.trim()) {
        chartInput.value = CHART_SAMPLE;
        chartEditor.setValue(CHART_SAMPLE);
    }
    chartRender();
    requestAnimationFrame(() => chartEditor.refresh());
}

function exitChartMode() {
    if (!chartModeActive) return;
    chartModeActive = false;
    clearTimeout(chartTimer);
    chartWorkspaceEl.classList.remove('active');
    navChartLink.classList.remove('active');
    toolbarEl.classList.remove('hidden');
    mainWorkspace.classList.remove('hidden');
    disposeChart();
    requestAnimationFrame(() => {
        inputEditor.refresh();
        outputEditor.refresh();
    });
}

function refreshChartI18n() {
    // 类型下拉的触发器显示「当前选中项」，切语言后要换成新语言的文案
    syncSelectLabel(chartTypeEl);
    syncSelectLabel(chartScaleEl);
    chartFillScale();
    chartSyncExportTitle();
    if (!chartEditor) return;
    chartEditor.setOption('placeholder', chartInput.placeholder || '');
    if (chartModeActive) chartRender();
}

chartWidthInput.addEventListener('input', chartSchedule);
chartHeightInput.addEventListener('input', chartSchedule);
// 输入体验：
// 1. 聚焦即全选，点进去直接敲数字覆盖，不用先手动删；
// 2. 输入过程中绝不回写输入框（否则敲 9 会被立刻弹成 80，输入进行不下去）；
// 3. 失焦时才把空值 / 非数字 / 越界值夹回边界，一次校正到位。
[chartWidthInput, chartHeightInput].forEach((el) => {
    el.addEventListener('focus', () => el.select());
    el.addEventListener('blur', () => {
        const C = window.DBXChart;
        if (!C) return;
        const axis = el === chartWidthInput ? 'width' : 'height';
        const r = C.clampSize(el.value, axis);
        const cur = parseInt(String(el.value).trim(), 10);
        if (r.value !== cur || r.code) {
            el.value = String(r.value);
            chartSchedule();
        }
    });
});
// 一键回到默认宽高（700 × 400）：改乱了不用记原值
chartResetSizeBtn.addEventListener('click', () => {
    const C = window.DBXChart;
    if (!C) return;
    chartWidthInput.value = String(C.LIMITS.width.def);
    chartHeightInput.value = String(C.LIMITS.height.def);
    if (chartModeActive) chartRender();
});
imgZoomInBtn.addEventListener('click', () => imgZoomStep(1.25));
imgZoomOutBtn.addEventListener('click', () => imgZoomStep(1 / 1.25));
imgZoomFitBtn.addEventListener('click', () => imgZoomTo('fit'));
imgZoomValue.addEventListener('click', () => imgZoomTo('actual'));

// ---------- 灯箱 ----------
// 点图放大：面板里只能看到「适应大小」的图，细节得整屏看
imgPreview.addEventListener('click', () => {
    const src = imgPreview.getAttribute('src');
    if (imgPreview.hidden || !src) return;
    lbOpen(src, lbLabel(imgState.name, imgState.width, imgState.height, imgState.bytes), imgPreview);
});
imgDecodeImg.addEventListener('click', () => {
    const src = imgDecodeImg.getAttribute('src');
    if (imgDecodeWrap.hidden || !src) return;
    lbOpen(src, lbLabel(imgState.name, imgState.width, imgState.height, imgState.bytes), imgDecodeImg);
});
imgLightboxOutBtn.addEventListener('click', () => lbSetScale(lbScaleNow() / 1.25));
imgLightboxInBtn.addEventListener('click', () => lbSetScale(lbScaleNow() * 1.25));
imgLightboxFitBtn.addEventListener('click', () => { lbZoom = 'fit'; lbApply(); });
imgLightboxActualBtn.addEventListener('click', () => { lbZoom = 1; lbApply(); });
imgLightboxCloseBtn.addEventListener('click', lbClose);
// 滚轮缩放（往光标那一点放大）：必须 passive:false，否则 preventDefault 无效、整页跟着滚
imgLightboxStage.addEventListener('wheel', (e) => {
    if (imgLightbox.hidden) return;
    e.preventDefault();
    lbSetScale(lbScaleNow() * Math.pow(1.0016, -e.deltaY), { x: e.clientX, y: e.clientY });
}, { passive: false });
// 双击在「适应」和「1:1」之间来回切
imgLightboxImg.addEventListener('dblclick', () => {
    const actual = Math.abs(lbScaleNow() - 1) < 0.005;
    lbZoom = actual ? 'fit' : 1;
    lbApply();
});
// 点图外的空白关掉；点在图上是拖看 / 双击，不关
imgLightboxStage.addEventListener('click', (e) => {
    if (e.target === imgLightboxStage) lbClose();
});
document.addEventListener('keydown', (e) => {
    if (imgLightbox.hidden) return;
    if (e.key === 'Escape') { lbClose(); return; }
    if (e.key === '+' || e.key === '=') { e.preventDefault(); lbSetScale(lbScaleNow() * 1.25); return; }
    if (e.key === '-' || e.key === '_') { e.preventDefault(); lbSetScale(lbScaleNow() / 1.25); return; }
    if (e.key === '0') { lbZoom = 'fit'; lbApply(); return; }
    if (e.key === '1') { lbZoom = 1; lbApply(); }
});

chartTypeEl.addEventListener('change', () => chartRender());
// 像素比只影响导出，不用重绘图表
chartScaleEl.addEventListener('change', () => {
    chartSyncExportTitle();
    chartFillScale();
});
// 图表下拉：点选项就画，点触发器只开合（shadcn Select 的交互）
chartPick.addEventListener('click', (e) => {
    const opt = e.target.closest ? e.target.closest('.custom-option') : null;
    const onTrigger = !!(e.target.closest && e.target.closest('.custom-select-trigger'));
    if (!opt && !onTrigger) return;
    // 页面上有个「点哪儿都收起下拉」的全局监听（给顶栏那两个下拉用的），
    // 这里必须掐断冒泡，否则刚展开就被它收回去
    e.stopPropagation();
    if (opt) {
        chartPickSetValue(opt.dataset.value);
        chartPickToggle(false);
        chartRender(true);
        return;
    }
    chartPickToggle();
});
chartPickTrigger.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        chartPickToggle();
        return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const n = chartPickOptions.children.length;
        if (n < 2) return;
        e.preventDefault();
        chartPickSetValue((chartPickIndex + (e.key === 'ArrowDown' ? 1 : -1) + n) % n);
        chartPickToggle(false);
        chartRender(true);
    }
});
document.addEventListener('click', (e) => {
    if (!chartPickWrap.contains(e.target)) chartPickToggle(false);
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && chartPickOptions.classList.contains('open')) chartPickToggle(false);
});
chartZoomInBtn.addEventListener('click', () => chartZoomStep(1.25));
chartZoomOutBtn.addEventListener('click', () => chartZoomStep(1 / 1.25));
chartZoomFitBtn.addEventListener('click', () => chartZoomTo('fit'));
chartZoomValue.addEventListener('click', () => chartZoomTo('actual'));
// 图表也能整屏看：按钮 + 双击画布（单击留给图例开关 / 交互，别抢）
chartPreviewBtn.addEventListener('click', chartOpenPreview);
chartCanvasEl.addEventListener('dblclick', () => {
    if (chartResult && !chartCanvasEl.hidden) chartOpenPreview();
});
// 面板大小变了（切分栏 / 改窗口）跟着重新适应，别让图卡在半截
let chartResizeTimer = null;
window.addEventListener('resize', () => {
    if (imageWorkspace.classList.contains('active')) imgApplyZoom();
    if (!imgLightbox.hidden && lbZoom === 'fit') lbApply();
    if (!chartModeActive || !chartResult) return;
    clearTimeout(chartResizeTimer);
    chartResizeTimer = setTimeout(() => {
        if (chartZoom === 'auto' || chartZoom === 'fit') chartApplyZoom();
    }, 160);
});
document.getElementById('chartSample').addEventListener('click', () => {
    chartInput.value = CHART_SAMPLE;
    if (chartEditor) chartEditor.setValue(CHART_SAMPLE);
    chartRender();
});
document.getElementById('chartClear').addEventListener('click', () => {
    clearTimeout(chartTimer);
    chartInput.value = '';
    if (chartEditor) chartEditor.setValue('');
    chartRender();
});
document.getElementById('chartExportPng').addEventListener('click', () => chartExport('png'));
document.getElementById('chartExportSvg').addEventListener('click', () => chartExport('svg'));

queryTabs.addEventListener('click', (e) => {
    const tab = e.target.closest('.compare-tab');
    if (tab) querySetTab(tab.dataset.tab);
});
querySamples.addEventListener('click', (e) => {
    const chip = e.target.closest('.sample-chip');
    if (!chip) return;
    queryExpr.value = chip.dataset.expr;
    queryRun();
});
queryExpr.addEventListener('input', querySchedule);
queryExpr.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') queryRun();
});
schSamples.addEventListener('click', (e) => {
    const chip = e.target.closest('.sample-chip');
    if (chip) schLoadSample(chip.dataset.sample);
});
document.getElementById('schRun').addEventListener('click', schRun);
document.getElementById('schInfer').addEventListener('click', schInfer);
document.getElementById('queryCopy').addEventListener('click', async () => {
    // 复制右侧那一栏：查询子页是结果，Schema 子页是 Schema
    const text = queryTab === 'path' ? queryOutput.value : schSchema.value;
    if (!text.trim()) {
        showToast(qT('toastCopyError', 'Nothing to copy'), 'error');
        return;
    }
    try {
        await writeClipboardText(text);
        showToast(qT('toastCopySuccess', 'Copied'));
    } catch (err) {
        showToast(qT('toastCopyError', 'Copy failed'), 'error');
    }
});
document.getElementById('queryClear').addEventListener('click', () => {
    clearTimeout(queryTimer);
    clearTimeout(schTimer);
    if (queryTab === 'path') {
        queryInput.value = '';
        querySampleText = '';
        queryIdle();
        queryInBadge.textContent = '—';
        querySetTip(qT('qTipIdle'));
    } else {
        schData.value = '';
        schSchema.value = '';
        schSampleText = '';
        schDataBadge.textContent = '—';
        schSchemaBadge.textContent = '—';
        schClearResult();
        schSetTip(qT('qSchEmpty'));
    }
});

escDirTabs.addEventListener('click', (e) => {
    const tab = e.target.closest('.compare-tab');
    if (tab) escSetDir(tab.dataset.dir);
});
escKinds.addEventListener('click', (e) => {
    const chip = e.target.closest('.sample-chip');
    if (chip) escSetKind(chip.dataset.kind);
});
document.getElementById('escFlip').addEventListener('click', escFlipSides);
document.getElementById('escCopy').addEventListener('click', async () => {
    if (!escOutput.value.trim()) {
        showToast(eT('toastCopyError', 'Nothing to copy'), 'error');
        return;
    }
    try {
        await writeClipboardText(escOutput.value);
        showToast(eT('toastCopySuccess', 'Copied'));
    } catch (err) {
        showToast(eT('toastCopyError', 'Copy failed'), 'error');
    }
});
document.getElementById('escClear').addEventListener('click', () => {
    clearTimeout(escTimer);
    escInput.value = '';
    escOutput.value = '';
    escOutSize.textContent = '';
    escInBadge.textContent = '—';
    escSetTip(eT('escTipIdle'));
});

// =========================================
