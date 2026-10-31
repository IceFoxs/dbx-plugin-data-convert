/* 09-convert.js — 格式转换主页：下拉、编辑器、转换、保存 / 导出 */
// 5. 业务逻辑
// =========================================
function initCustomSelect(containerId) {
    const container = document.getElementById(containerId);
    const trigger = container.querySelector('.custom-select-trigger');
    const options = container.querySelector('.custom-select-options');
    const label = trigger.querySelector('.label');
    let currentValue = container.querySelector('.custom-option.selected').dataset.value;
    // 选项里带了附加信息（如像素比的「2x · 1400 × 800」）时，触发器上只放 data-label，
    // 否则窄触发器会被撑爆；没写 data-label 就照旧用整段文字。
    const shortLabel = (opt) => (opt.dataset.label || opt.textContent).trim();

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.custom-select-options').forEach(opt => {
            if (opt !== options) opt.classList.remove('open');
        });
        document.querySelectorAll('.custom-select-trigger').forEach(tr => {
            if (tr !== trigger) tr.classList.remove('active');
        });
        options.classList.toggle('open');
        trigger.classList.toggle('active');
    });

    container.querySelectorAll('.custom-option').forEach(opt => {
        opt.addEventListener('click', (e) => {
            e.stopPropagation();
            container.querySelectorAll('.custom-option').forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
            label.textContent = shortLabel(opt);
            options.classList.remove('open');
            trigger.classList.remove('active');

            const newVal = opt.dataset.value;
            if (newVal !== currentValue) {
                currentValue = newVal;
                container.dispatchEvent(new CustomEvent('change', {detail: newVal}));
            }
        });
    });

    return {
        getValue: () => currentValue,
        setValue: (val) => {
            const targetOpt = container.querySelector(`.custom-option[data-value="${val}"]`);
            if (targetOpt) {
                container.querySelectorAll('.custom-option').forEach(o => o.classList.remove('selected'));
                targetOpt.classList.add('selected');
                label.textContent = shortLabel(targetOpt);
                currentValue = val;
            }
        }
    };
}

const sourceSelect = initCustomSelect('sourceSelect');
const targetSelect = initCustomSelect('targetSelect');

/** 自定义下拉的触发器文案跟着「当前选中项」走：
    切语言后选项文字变了，触发器上那一份也得跟着换 */
function syncSelectLabel(container) {
    if (!container) return;
    const label = container.querySelector('.custom-select-trigger .label');
    const on = container.querySelector('.custom-option.selected');
    if (label && on) label.textContent = (on.dataset.label || on.textContent).trim();
}

document.addEventListener('click', () => {
    document.querySelectorAll('.custom-select-options').forEach(opt => opt.classList.remove('open'));
    document.querySelectorAll('.custom-select-trigger').forEach(tr => tr.classList.remove('active'));
});

const inputText = document.getElementById('inputText');
const outputText = document.getElementById('outputText');
const swapBtn = document.getElementById('swapBtn');
const convertBtn = document.getElementById('convertBtn');
const clearInputBtn = document.getElementById('clearInputBtn');
const genMockBtn = document.getElementById('genMockBtn');
const copyBtn = document.getElementById('copyBtn');
const outputResultLabel = document.getElementById('outputResultLabel');
const errorBar = document.getElementById('errorBar');
const errorLoc = document.getElementById('errorLoc');
const errorMsg = document.getElementById('errorMsg');
const formatInputBtn = document.getElementById('formatInputBtn');
const formatOutputBtn = document.getElementById('formatOutputBtn');
const toastContainer = document.getElementById('toastContainer');

let diffLeftEditor = null;
let diffRightEditor = null;
// 对比页 / SQL 页编辑器都是懒创建的，声明提前，避免 syncEditorTheme() 首次调用时踩到 TDZ
let cmpLeftEditor = null;
let cmpRightEditor = null;
let sqlInputEditor = null;
let sqlOutputEditor = null;
let sheetOutputEditor = null;
let codeInputEditor = null;
let codeOutputEditor = null;
// 查询页（数据 / 结果 / Schema 三块）与转义页的编辑器同样懒创建
let queryDataEditor = null;
let queryResultEditor = null;
let schDataEditor = null;
let schSchemaEditor = null;
let escInputEditor = null;
let escOutputEditor = null;
let bytesEditor = null;
let timeEditor = null;
let chartEditor = null;
// 图表页的状态也提前声明：离开/进入页面、syncEditorTheme() 都会用到，
// 声明放在后面会踩 TDZ（和当初 bytesEditor 一样的坑）
let chartModeActive = false;
let chartTimer = null;
let chartSeq = 0;
let chartEngine = null;
let chartEnginePromise = null;
let chartInstance = null;
let chartResult = null;
// 最近一次解析结果（含「这份 JSON 里有几个 option」），切换下拉时不用重新解析
let chartParsed = null;
// 当前下拉对应的选项签名：只是切图（输入没变）时不能把选择重置掉
let chartPickSig = '';
// 预览缩放：'auto'（放不下才缩）/ 'fit'（强制适应）/ 'actual'（1:1）/ 具体倍率
let chartZoom = 'auto';
// 上一次渲染的尺寸：只有尺寸变了才把缩放重置回 auto
let chartZoomSize = { w: 0, h: 0 };

// =========================================
// CodeMirror 5 初始化 (本地离线 - 增强版)
// =========================================
const MODE_MAP = {
    json: 'application/json',
    yaml: 'text/x-yaml',
    xml: 'application/xml',
    properties: 'text/x-properties',
    // 新增的九种：TOML / .env(借 shell) / Headers 有专属模式，INI 借 properties，
    // HTML 表复用 xml；CSV / TSV / Query / Cookie 没有对应模式，退回纯文本
    toml: 'text/x-toml',
    ini: 'text/x-properties',
    env: 'text/x-sh',
    csv: 'text/plain',
    tsv: 'text/plain',
    query: 'text/plain',
    headers: 'message/http',
    cookie: 'text/plain',
    html: 'application/xml'
};

// 徽标上的显示名：.env 要带点，其余保持大写
const FORMAT_LABEL = { env: '.env', query: 'Query', headers: 'Headers', cookie: 'Cookie' };
function fmtLabel(value) {
    return FORMAT_LABEL[value] || String(value).toUpperCase();
}

const commonConfig = {
    lineNumbers: true,
    lineWrapping: true,
    matchBrackets: true,
    autoCloseBrackets: true,
    indentUnit: 2,
    tabSize: 2,
    styleActiveLine: true,
    foldGutter: true,
    gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"],
    matchTags: { bothTags: true },
    extraKeys: {
        "Ctrl-Q": function(cm) { cm.foldCode(cm.getCursor()); },
        "Cmd-Enter": function() { doConvert(); },
        "Ctrl-Enter": function() { doConvert(); },
        "Ctrl-F": "findPersistent",
        "Cmd-F": "findPersistent",
        "Alt-F": "findPersistent",
        "Ctrl-Alt-F": "replace",
        "Cmd-Alt-F": "replace",
        "Enter": "newlineAndIndentContinueMarkdownList"
    }
};

const inputEditor = CodeMirror.fromTextArea(inputText, Object.assign({}, commonConfig, {
    mode: MODE_MAP.json
}));

const outputEditor = CodeMirror.fromTextArea(outputText, Object.assign({}, commonConfig, {
    mode: MODE_MAP.yaml
}));

inputEditor.on('change', () => {
    const next = inputEditor.getValue();
    if (inputText.value !== next) inputText.value = next;
    // 程序化写入（模拟数据、格式化、切换格式、swap）不能当成用户编辑，
    // 否则会清掉刚算好的 currentDataObj，后续序列化就变成 null
    if (suppressAutoConvert) return;
    currentDataObj = null;
    scheduleAutoConvert();
});
outputEditor.on('change', () => {
    outputText.value = outputEditor.getValue();
});

function linkTextareaToEditor(textarea, editor) {
    const proto = Object.getPrototypeOf(textarea);
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    Object.defineProperty(textarea, 'value', {
        configurable: true,
        get() { return desc.get.call(this); },
        set(v) {
            desc.set.call(this, v);
            if (editor.getValue() !== v) {
                editor.setValue(v);
            }
        }
    });
}
linkTextareaToEditor(inputText, inputEditor);
linkTextareaToEditor(outputText, outputEditor);

function syncEditorModes() {
    inputEditor.setOption('mode', MODE_MAP[sourceFormat.value] || 'text/plain');
    outputEditor.setOption('mode', MODE_MAP[targetFormat.value] || 'text/plain');
}

function syncEditorTheme() {
    const isDark = document.documentElement.getAttribute('data-dbx-theme') === 'dark';
    const theme = isDark ? 'material-darker' : 'default';
    [inputEditor, outputEditor, diffLeftEditor, diffRightEditor, cmpLeftEditor, cmpRightEditor,
        sqlInputEditor, sqlOutputEditor, sheetOutputEditor, codeInputEditor, codeOutputEditor,
        queryDataEditor, queryResultEditor, schDataEditor, schSchemaEditor, escInputEditor, escOutputEditor,
        bytesEditor, timeEditor, chartEditor].forEach((cm) => {
        if (!cm) return;
        const switching = cm.getOption('theme') !== theme;
        cm.setOption('theme', theme);
        // setOption('theme') 内部已经 refresh 过一次，只有主题没变（仅换了皮肤令牌）时才需要手动刷新
        if (!switching) cm.refresh();
    });
    // 图表页不用管：出图配色与底色固定，见 chartBg() / chartThemeName()
}

// CodeMirror 的语法配色是整块换 class 的，文字颜色没法跟着 CSS 过渡走。
// 所以在底色渐变到一半（约 135ms）时再换主题：那时底色是中间调，
// 新旧两种文字色都还看得清，切换点被整体渐变盖住。
function syncEditorThemeSoon(delay) {
    clearTimeout(editorThemeTimer);
    if (!delay) {
        syncEditorTheme();
        return;
    }
    editorThemeTimer = setTimeout(syncEditorTheme, delay);
}
syncEditorTheme();

// =========================================
// 业务变量与事件
// =========================================
let sourceFormat = {value: sourceSelect.getValue()};
let targetFormat = {value: targetSelect.getValue()};

let currentDataObj = null;
let autoTimer = null;
let suppressAutoConvert = false;

/* ----------------------------------------------------------------
 * 转换核心已抽离到 ui/js/converters.js（纯函数，无 DOM 依赖）
 * 回归用例：node tests/converters.test.js
 * ---------------------------------------------------------------- */
if (!window.DBXConvert) throw new Error('ui/js/converters.js 未加载');
const { parseData, serializeData, convert, locateError } = window.DBXConvert;

/* ----------------------------------------------------------------
 * 转换调度
 * ---------------------------------------------------------------- */

// 只在内容真正变化时写回，避免覆盖 CodeMirror 光标
function setOutput(text) {
    if (outputText.value === text) return;
    outputText.value = text;
}

// 单次解析 + 单次序列化；同格式 XML 走格式化路径以保住根元素
function computeConversion(raw, src, tgt) {
    if (src === tgt && tgt === 'xml') {
        return { text: convert(raw, src, tgt), obj: null };
    }
    const obj = parseData(raw, src);
    return { text: serializeData(obj, tgt), obj: obj };
}

// 输入即转换：400ms 静默执行，失败时保留上一次结果并提示位置
function scheduleAutoConvert() {
    if (suppressAutoConvert) return;
    clearTimeout(autoTimer);
    autoTimer = setTimeout(() => {
        const raw = inputText.value.trim();
        if (!raw) {
            setOutput('');
            clearError();
            currentDataObj = null;
            return;
        }
        try {
            const result = computeConversion(raw, sourceFormat.value, targetFormat.value);
            currentDataObj = result.obj;
            setOutput(result.text);
            clearError();
        } catch (err) {
            currentDataObj = null;
            showParseError(err, raw);
        }
    }, 400);
}

inputText.addEventListener('input', () => {
    currentDataObj = null;
});
outputText.addEventListener('input', () => {
    if (outputText.value.trim() === '') {
        currentDataObj = null;
    }
});

/* duration 可选：默认 3 秒。报错类提示会读得久一点，调用方可以单独给。 */
function showToast(message, type = 'success', duration = 3000) {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type === 'error' ? 'error' : ''}`;
    toast.innerHTML = `<span>${message}</span>`;
    toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('hide');
        setTimeout(() => toast.remove(), 300);
    }, duration > 0 ? duration : 3000);
}

async function readClipboardText() {
    if (!window.dbxPlugin) {
        if (navigator.clipboard && navigator.clipboard.readText) {
            return await navigator.clipboard.readText();
        }
        throw new Error('clipboardRead unsupported');
    }
    const caps = window.dbxPlugin.capabilities || {};
    if (!caps.clipboardRead || !window.dbxPlugin.clipboard || typeof window.dbxPlugin.clipboard.readText !== 'function') {
        throw new Error('clipboardRead unsupported');
    }
    return await window.dbxPlugin.clipboard.readText();
}

async function writeClipboardText(text) {
    if (window.dbxPlugin && (typeof window.dbxPlugin.copy === 'function' || (window.dbxPlugin.clipboard && window.dbxPlugin.clipboard.writeText))) {
        const caps = window.dbxPlugin.capabilities || {};
        if (caps.clipboardWrite === false) {
            throw new Error('clipboardWrite unsupported');
        }
        if (typeof window.dbxPlugin.copy === 'function') {
            await window.dbxPlugin.copy(text);
        } else {
            await window.dbxPlugin.clipboard.writeText(text);
        }
        return;
    }
    if (!navigator.clipboard || !navigator.clipboard.writeText) {
        throw new Error('clipboardWrite unsupported');
    }
    await navigator.clipboard.writeText(text);
}

// 导航项会被「更多」下拉搬来搬去，所以用事件委托而不是逐个绑定
function handleNavClick(link) {
    navGoto(link);
    // 宿主的页签名跟着当前功能走（setTitle / document.title），切页后同步一次
    if (typeof syncDocTitle === 'function') syncDocTitle();
}

function navGoto(link) {
    // 记下这一次用的是哪一项，下次打开直接回到这里（20-last-feature.js 里读）
    if (typeof lastFeatureRemember === 'function') lastFeatureRemember(link);
    // 导航里的「SQL 转换」进入批量文本生成 SQL 的独立页
    if (link.id === 'navSql') {
        enterSqlMode();
        return;
    }
    // 导航里的「JSON 对比」进入独立对比页，其余仍是格式转换入口
    if (link.id === 'navCompare') {
        enterCompareMode();
        return;
    }
    // 「表格转 JSON」是 Excel / CSV 转 JSON 的独立页
    if (link.id === 'navSheet') {
        enterSheetMode();
        return;
    }
    // 「CSV 编辑」是源码 / 表格双向编辑的独立页
    if (link.id === 'navCsv') {
        enterCsvMode();
        return;
    }
    // 「图片 Base64」是图片 ↔ Base64 的独立页
    if (link.id === 'navImage') {
        enterImageMode();
        return;
    }
    // 「代码生成」是 JSON / DDL → 多语言模型的独立页
    if (link.id === 'navCodegen') {
        enterCodeMode();
        return;
    }
    // 「查询校验」是 JSONPath / jq 查询 + JSON Schema 校验的独立页
    if (link.id === 'navQuery') {
        enterQueryMode();
        return;
    }
    // 「转义工具」是八种编码互转的独立页
    if (link.id === 'navEscape') {
        enterEscMode();
        return;
    }
    // 「字节转换」是单位换算 + 字节序列写法的独立页
    if (link.id === 'navBytes') {
        enterBytesMode();
        return;
    }
    // 「JSON 转图表」是 JSON -> ECharts 的独立页
    if (link.id === 'navChart') {
        enterChartMode();
        return;
    }
    // 「时间转换」是批量时间戳 / 日期互转的独立页
    if (link.id === 'navTime') {
        enterTimeMode();
        return;
    }
    // 「二维码」是批量生成 / 解码二维码的独立页
    if (link.id === 'navQr') {
        enterQrMode();
        return;
    }
    // 「数据统计」是贴表格 -> 计数 / 求和 / 分组聚合的独立页
    if (link.id === 'navStats') {
        enterStatsMode();
        return;
    }
    // 「SQL 分析」是贴表格 -> 写 SELECT 查询的独立页
    if (link.id === 'navDataSql') {
        if (typeof enterDataSqlMode === 'function') enterDataSqlMode();
        return;
    }
    // 剩下的是「格式转换」的十几对格式之一
    enterConvertPair(link, link.dataset.src, link.dataset.tgt);
}

/**
 * 回到格式转换页，并把「从 / 转为」设成这一对。
 * 从导航菜单点进来（link 有值，菜单里那一项要高亮）和从「上次用的功能」恢复
 * （link 为 null，这一对可能压根不在菜单里）都走这里，免得清场逻辑写两遍、写歪一处。
 */
function enterConvertPair(link, src, tgt) {
    if (compareMode) exitCompareMode();
    if (sqlModeActive) exitSqlMode();
    if (sheetModeActive) exitSheetMode();
    if (imgModeActive) exitImageMode();
    if (codeModeActive) exitCodeMode();
    if (queryModeActive) exitQueryMode();
    if (bytesModeActive) exitBytesMode();
    if (chartModeActive) exitChartMode();
    if (escModeActive) exitEscMode();
    if (timeModeActive) exitTimeMode();
    if (qrModeActive) exitQrMode();
    if (statsModeActive) exitStatsMode();
    markConvertActive(link || null);
    clearTimeout(autoTimer);
    suppressAutoConvert = true;
    inputText.value = '';
    setOutput('');
    suppressAutoConvert = false;
    currentDataObj = null;
    clearError();
    handleFormatChange(src, tgt);
}

document.querySelector('.topbar').addEventListener('click', (e) => {
    const link = e.target.closest('#navLinks a, #navMoreMenu a, #navConvertMenu a');
    if (!link) return;
    e.preventDefault();
    handleNavClick(link);
    closeNavMore();
    closeNavConvert();
});

document.getElementById('sourceSelect').addEventListener('change', (e) => {
    sourceFormat.value = e.detail;
    updateOutputLabel();
    syncEditorModes();
    if (currentDataObj) {
        try {
            suppressAutoConvert = true;
            inputText.value = serializeData(currentDataObj, sourceFormat.value);
            suppressAutoConvert = false;
        } catch (err) {
            setOutput('');
        }
    }
    doConvertSilent();
});

document.getElementById('targetSelect').addEventListener('change', (e) => {
    targetFormat.value = e.detail;
    updateOutputLabel();
    syncEditorModes();
    doConvertSilent();
});

swapBtn.addEventListener('click', () => {
    const temp = sourceFormat.value;
    sourceFormat.value = targetFormat.value;
    targetFormat.value = temp;

    sourceSelect.setValue(sourceFormat.value);
    targetSelect.setValue(targetFormat.value);
    syncEditorModes();

    const currentOutput = outputText.value.trim();
    if (currentOutput) {
        suppressAutoConvert = true;
        inputText.value = currentOutput;
        suppressAutoConvert = false;
        currentDataObj = null;
    }
    updateOutputLabel();
    doConvertSilent();
});

function updateOutputLabel() {
    // 下拉里也有一份「当前格式对」的高亮，改格式时顺手同步
    if (typeof syncConvertActive === 'function') syncConvertActive();
    if (typeof updateConvertLabel === 'function') updateConvertLabel();
    const label = fmtLabel(targetFormat.value);
    outputResultLabel.textContent = label;
    outputResultLabel.title = `${(currentDict && currentDict.outputLabel) || 'Output'} (${label})`;
}

// 格式矩阵（TOML / INI / .env / CSV / TSV / Query / Headers / Cookie / HTML）的错误
// 由 confconv.js 以 code + 行列抛出，不含任何硬编码语言，文案在这里按当前语言取。
const CONF_LIMIT_KEY = {
    'conf-too-large': 'chars',
    'conf-too-many-rows': 'rows',
    'conf-too-many-cols': 'cols',
    'conf-too-many-cells': 'cells'
};

function confErrorText(err) {
    if (!err || !err.code) return '';
    const cur = CONF_I18N[currentLang] || {};
    const tpl = cur[err.code] || (CONF_I18N.en || {})[err.code] || (CONF_I18N['zh-CN'] || {})[err.code] || '';
    if (!tpl) return '';
    // 上限数字不写死在译文里，从模块自己的 LIMITS 取
    const limitKey = CONF_LIMIT_KEY[err.code];
    if (limitKey && window.DBXConf && window.DBXConf.LIMITS) {
        return tpl.replace('{n}', window.DBXConf.LIMITS[limitKey].toLocaleString());
    }
    return tpl;
}

// 错误提示条：失败时保留上一次成功的结果，只在这里提示位置
let errorLineHandle = null;

function clearError() {
    errorBar.classList.remove('show');
    errorLoc.textContent = '';
    errorMsg.textContent = '';
    if (errorLineHandle) {
        inputEditor.removeLineClass(errorLineHandle, 'background', 'cm-error-line');
        errorLineHandle = null;
    }
}

function showParseError(err, text) {
    const loc = locateError(err, text || inputText.value);
    // 行 / 列的说法各语言不一样（中文「第 3 行 第 5 列」、英文「line 3, column 5」），
    // 分隔符直接写进译文里，这里只负责替换数字
    const lineTpl = (currentDict && currentDict.errorLocLine) || '第 {n} 行';
    const colTpl = (currentDict && currentDict.errorLocCol) || ' 第 {n} 列';
    const where = loc.line
        ? lineTpl.replace('{n}', loc.line) + (loc.column ? colTpl.replace('{n}', loc.column) : '')
        : '';
    errorLoc.textContent = where;
    const confMsg = confErrorText(err);
    errorMsg.textContent = confMsg || loc.message;
    errorMsg.title = confMsg || loc.message;
    errorBar.classList.add('show');

    if (errorLineHandle) {
        inputEditor.removeLineClass(errorLineHandle, 'background', 'cm-error-line');
        errorLineHandle = null;
    }
    if (loc.line && loc.line <= inputEditor.lineCount()) {
        errorLineHandle = inputEditor.addLineClass(loc.line - 1, 'background', 'cm-error-line');
        inputEditor.scrollIntoView({ line: loc.line - 1, ch: 0 }, 120);
    }
}

function handleFormatChange(newSrc, newTgt) {
    // 直接动「从 / 转为」下拉（不是点导航项）也算换了功能，同样记下来
    if (typeof lastFeatureRememberConvert === 'function') lastFeatureRememberConvert(newSrc, newTgt);
    sourceFormat.value = newSrc;
    targetFormat.value = newTgt;
    sourceSelect.setValue(newSrc);
    targetSelect.setValue(newTgt);
    updateOutputLabel();
    syncEditorModes();

    const raw = inputText.value.trim();
    if (!raw) {
        setOutput('');
        currentDataObj = null;
        clearError();
        return;
    }
    try {
        const srcText = convert(raw, newSrc, newSrc);
        suppressAutoConvert = true;
        inputText.value = srcText;
        suppressAutoConvert = false;
        const result = computeConversion(srcText, newSrc, newTgt);
        currentDataObj = result.obj;
        setOutput(result.text);
        clearError();
    } catch (err) {
        console.error('Format change conversion failed:', err);
        currentDataObj = null;
        setOutput('');
        showParseError(err, raw);
    }
}

function doConvertSilent() {
    const raw = inputText.value.trim();
    if (!raw) {
        setOutput('');
        clearError();
        return;
    }

    try {
        const result = computeConversion(raw, sourceFormat.value, targetFormat.value);
        currentDataObj = result.obj;
        clearError();
        setOutput(result.text);
    } catch (err) {
        currentDataObj = null;
        showParseError(err, raw);
    }
}

genMockBtn.addEventListener('click', () => {
    const src = sourceFormat.value;
    const tgt = targetFormat.value;

    currentDataObj = {
        id: 1001,
        title: "测试数据",
        author: {
            name: "张三",
            email: "zhangsan@example.com"
        },
        tags: ["admin", "editor", "viewer"],
        metadata: {
            createdAt: "2023-10-27T10:00:00Z",
            version: 1.2,
            isActive: true
        }
    };

    try {
        // 先算出两份文本再写入，避免写入触发的 change 影响序列化结果
        const inputStr = serializeData(currentDataObj, src);
        const outputStr = serializeData(currentDataObj, tgt);
        suppressAutoConvert = true;
        inputText.value = inputStr;
        setOutput(outputStr);
        suppressAutoConvert = false;
        clearError();
        showToast(currentDict.toastMockSuccess);
    } catch (err) {
        suppressAutoConvert = false;
        showToast(currentDict.toastFormatError, 'error');
    }
});

formatInputBtn.addEventListener('click', () => {
    const raw = inputText.value.trim();
    if (!raw) return;
    try {
        suppressAutoConvert = true;
        inputText.value = convert(raw, sourceFormat.value, sourceFormat.value);
        suppressAutoConvert = false;
        if (sourceFormat.value !== 'xml') currentDataObj = parseData(raw, sourceFormat.value);
        clearError();
        showToast(currentDict.toastFormatInput);
    } catch (err) {
        suppressAutoConvert = false;
        showParseError(err, raw);
        showToast(currentDict.toastFormatError, 'error');
    }
});

formatOutputBtn.addEventListener('click', () => {
    const raw = outputText.value.trim();
    if (!raw) return;
    try {
        setOutput(convert(raw, targetFormat.value, targetFormat.value));
        showToast(currentDict.toastFormatOutput);
    } catch (err) {
        showParseError(err, raw);
        showToast(currentDict.toastFormatError, 'error');
    }
});

function doConvert() {
    const raw = inputText.value.trim();
    if (!raw) {
        showToast(currentDict.toastEmptyInput, 'error');
        return;
    }
    try {
        const result = computeConversion(raw, sourceFormat.value, targetFormat.value);
        currentDataObj = result.obj;
        setOutput(result.text);
        clearError();
        showToast(currentDict.toastConvertSuccess);
    } catch (err) {
        // 保留上一次成功的结果，仅提示错误位置
        currentDataObj = null;
        showParseError(err, raw);
        showToast(currentDict.toastConvertError, 'error');
    }
}

convertBtn.addEventListener('click', doConvert);

clearInputBtn.addEventListener('click', () => {
    clearTimeout(autoTimer);
    suppressAutoConvert = true;
    inputText.value = '';
    setOutput('');
    suppressAutoConvert = false;
    currentDataObj = null;
    clearError();
});

document.getElementById('pasteInputBtn').addEventListener('click', async () => {
    try {
        const text = await readClipboardText();
        if (text == null) return;
        inputText.value = text;
        currentDataObj = null;
        showToast(currentDict.toastPasteSuccess);
    } catch (e) {
        const msg = (e && e.message === 'clipboardRead unsupported')
            ? (currentDict.toastPasteUnsupported || currentDict.toastPasteError)
            : currentDict.toastPasteError;
        showToast(msg, 'error');
    }
});

copyBtn.addEventListener('click', async () => {
    const text = outputText.value;
    if (!text) return;
    try {
        await writeClipboardText(text);
        showToast(currentDict.toastCopySuccess);
    } catch (e) {
        showToast(currentDict.toastCopyError, 'error');
    }
});

// =========================================
