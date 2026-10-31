/* 18-flow.js — 拖放导入、批量合并与页面导入入口 */
// 13. 工作流：全局拖放 + 批量
// =========================================
// 拖进来的文件只交给「当前这一页」消化，不按扩展名换页：判断规则都在 flow.js 里
function fT(key, fallback) {
    const cur = FLOW_I18N[currentLang] || {};
    return cur[key] || (FLOW_I18N.en || {})[key] || (FLOW_I18N['zh-CN'] || {})[key] || fallback || key;
}

function fTpl(key, fallback, vars) {
    let text = fT(key, fallback);
    Object.keys(vars || {}).forEach((k) => {
        text = text.split('{' + k + '}').join(String(vars[k]));
    });
    return text;
}

// ---------- 全局拖放 ----------
// DBX 是 Tauri 应用：原生文件拖放被宿主在 WebView 层接管（wry 的 drag-drop-enabled），
// HTML5 的 dragenter/drop 根本进不到页面里，所以先走宿主给的口子
// dbxPlugin.fileTransfer（onDragState / onDrop / read），浏览器事件只作兜底。
const dropVeil = document.getElementById('dropVeil');
const dropVeilLimit = document.getElementById('dropVeilLimit');
let dragDepth = 0;
let lastDropAt = 0;
let lastDropSource = '';

function hostFT() {
    return (window.dbxPlugin && window.dbxPlugin.fileTransfer) || null;
}
function hostFTCap(name) {
    const caps = (window.dbxPlugin && window.dbxPlugin.capabilities) || {};
    return (caps.fileTransfer || {})[name];
}
function hostDropAvailable() {
    const ft = hostFT();
    if (!ft || typeof ft.onDrop !== 'function') return false;
    return hostFTCap('drop') !== false;
}

function showDropVeil(visible) {
    if (!dropVeil) return;
    if (visible) syncDropVeilLimit();
    dropVeil.hidden = !visible;
}

// 松手之前就把当前页的体积上限写在蒙层里，别等松手才弹「文件太大」
function syncDropVeilLimit() {
    if (!dropVeilLimit) return;
    const kind = importKindForPage(currentPageId());
    const max = dropLimitFor(currentPageId());
    const kindName = kind === 'image' ? fT('flowKindImage', '图片')
        : (kind === 'sheet' ? fT('flowKindSheet', '表格') : fT('flowKindText', '文本'));
    dropVeilLimit.textContent = fTpl('flowDropLimit', '{kind}文件 ≤ {max}', {
        kind: kindName,
        max: DBXImg.formatBytes(max)
    });
}
// 宿主与 HTML5 两条路偶尔会同时派发同一份文件，先到的那条算数；
// 同一个来源连着拖两次不受影响（用户就是要拖两次）
function claimDrop(source) {
    const now = Date.now();
    if (lastDropSource && lastDropSource !== source && now - lastDropAt < 800) return false;
    lastDropSource = source;
    lastDropAt = now;
    return true;
}

function dragHasFiles(e) {
    const dt = e.dataTransfer;
    if (!dt) return false;
    const types = dt.types ? Array.prototype.slice.call(dt.types) : [];
    if (types.indexOf('Files') >= 0) return true;
    // 从某些应用（文件树 / 压缩包预览）拖出来时 types 里是 uri-list 而不是 Files
    if (dt.items && dt.items.length) {
        for (let i = 0; i < dt.items.length; i++) {
            if (dt.items[i] && dt.items[i].kind === 'file') return true;
        }
    }
    return false;
}

// ---------- 宿主路径：handleId -> 字节 ----------
const HOST_CHUNK = 256 * 1024;              // 单次读多少，避免大文件一次性撑出巨型 base64
const HOST_DROP_BUDGET = 64 * 1024 * 1024;  // 一次拖入的总字节预算

function dropTooBig(name, size, max) {
    return fT('flowDropTooBig', '文件太大：{name}（{size}），上限 {max}')
        .replace('{name}', name || '—')
        .replace('{size}', DBXImg.formatBytes(size || 0))
        .replace('{max}', DBXImg.formatBytes(max || 0));
}

async function readHandleBytes(handleId, limitBytes) {
    const ft = hostFT();
    if (!ft || typeof ft.read !== 'function') throw new Error('host-read-missing');
    const parts = [];
    let size = 0;
    for (;;) {
        const res = await ft.read(handleId, size, HOST_CHUNK);
        if (!res || !res.dataBase64) break;
        const bin = atob(res.dataBase64);
        const chunk = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) chunk[i] = bin.charCodeAt(i);
        parts.push(chunk);
        size += chunk.length;
        if (limitBytes && size > limitBytes) {
            const err = new Error('too-big');
            err.size = size;
            throw err;
        }
        if (res.eof === true) break;
    }
    const merged = new Uint8Array(size);
    let pos = 0;
    for (let i = 0; i < parts.length; i++) { merged.set(parts[i], pos); pos += parts[i].length; }
    return merged;
}

// 宿主只给 handleId；转成 File 之后图片页 / 表格页 / 文本页的既有逻辑直接复用
async function hostEntryToFile(entry, limitBytes) {
    const name = entry.name || 'file';
    const declared = Number(entry.size || 0);
    if (limitBytes && declared > limitBytes) {
        const err = new Error('too-big');
        err.size = declared;
        throw err;
    }
    const bytes = await readHandleBytes(entry.handleId, limitBytes);
    return new File([bytes], name, { type: entry.contentType || '' });
}

// 不用的句柄要还给宿主，否则拖十次就在宿主侧攒十个打开的文件
function releaseEntry(entry) {
    const ft = hostFT();
    if (!entry || !entry.handleId) return;
    if (!ft || typeof ft.cancel !== 'function') return;
    try { ft.cancel(entry.handleId); } catch (err) { /* 句柄可能已回收 */ }
}

// ================= 二维码（生成 / 解码） =================
// 生成用 qrcode-generator、解码用 jsQR，两个库都以「文本副本」躺在 index.html 里，
// 进页时才包成 blob: 执行——沙箱 CSP 只放行 inline / blob:，外链脚本一律被拦。
// 纯函数库（ui/js/qr.js）。取不到时页面只是不响应，不能让整页跟着崩：
// 宿主或 jsdom 里外部脚本有可能晚于 DOMContentLoaded 执行。
const QR = window.DBXQr || null;
const QR_LIMITS = {
    decodeFiles: (QR && QR.LIMITS.decodeFiles) || 60,
    decodeBytes: (QR && QR.LIMITS.decodeBytes) || 25165824
};

function qrT(key, fallback) {
    const table = QR_I18N[currentLang] || {};
    return table[key] || (QR_I18N.en || {})[key] || (QR_I18N['zh-CN'] || {})[key] || fallback || key;
}

function qrFmt(key, vars, fallback) {
    let text = qrT(key, fallback);
    Object.keys(vars || {}).forEach((k) => {
        text = text.split('{' + k + '}').join(String(vars[k]));
    });
    return text;
}

const qrWorkspaceEl = document.getElementById('qrWorkspace');
const qrModeTabs = document.getElementById('qrModeTabs');
const qrGenGrid = document.getElementById('qrGenGrid');
const qrScanGrid = document.getElementById('qrScanGrid');
const qrOptionsEl = document.getElementById('qrOptions');
const qrInput = document.getElementById('qrInput');
const qrGridEl = document.getElementById('qrGrid');
const qrEmptyEl = document.getElementById('qrEmpty');
const qrInBadge = document.getElementById('qrInBadge');
const qrOutBadge = document.getElementById('qrOutBadge');
const qrOutSize = document.getElementById('qrOutSize');
const qrTipEl = document.getElementById('qrTip');
const qrSizeInput = document.getElementById('qrSize');
const qrMarginInput = document.getElementById('qrMargin');
const qrEccEl = document.getElementById('qrEcc');
const qrFormatEl = document.getElementById('qrFormat');
const qrSplitEl = document.getElementById('qrSplit');
const qrIconPickBtn = document.getElementById('qrIconPick');
const qrIconClearBtn = document.getElementById('qrIconClear');
const qrIconInput = document.getElementById('qrIconInput');
const qrIconThumb = document.getElementById('qrIconThumb');
const qrFgInput = document.getElementById('qrFg');
const qrBgInput = document.getElementById('qrBg');
const qrFgPicker = document.getElementById('qrFgPicker');
const qrBgPicker = document.getElementById('qrBgPicker');
const qrGenBtn = document.getElementById('qrGenBtn');
const qrDownloadAllBtn = document.getElementById('qrDownloadAll');
const qrExportMask = document.getElementById('qrExportMask');
const qrExportNameInput = document.getElementById('qrExportName');
const qrExportExtEl = document.getElementById('qrExportExt');
const qrExportFormatEl = document.getElementById('qrExportFormat');
const qrExportSizeChips = document.getElementById('qrExportSizeChips');
const qrExportSizeInput = document.getElementById('qrExportSize');
const qrExportNoteEl = document.getElementById('qrExportNote');
const qrExportOkBtn = document.getElementById('qrExportOk');
const qrExportCancelBtn = document.getElementById('qrExportCancel');
const qrExportCloseBtn = document.getElementById('qrExportClose');
const qrScanPickTop = document.getElementById('qrScanPickTop');
const qrScanCopyAllBtn = document.getElementById('qrScanCopyAll');
const qrScanPick = document.getElementById('qrPick');
const qrDropEl = document.getElementById('qrDrop');
const qrScanQueueEl = document.getElementById('qrScanQueue');
const qrScanResultEl = document.getElementById('qrScanResult');
const qrScanEmptyEl = document.getElementById('qrScanEmpty');
const qrScanInput = document.getElementById('qrScanInput');
const qrScanBadge = document.getElementById('qrScanBadge');
const qrScanOutBadge = document.getElementById('qrScanOutBadge');
const navQrLink = document.getElementById('navQr');

let qrMode = 'encode';           // 'encode' | 'decode'
let qrModeActive = false;
let qrEditor = null;
let qrTimer = null;
let qrEcc = 'M';
let qrFormat = 'png';
let qrSplit = 'line';            // 'line' 一行一个 | 'whole' 整段一个（保留换行）
let qrIcon = null;               // 中心图标：{ href, image, name }
let qrItems = [];                // [{ text, bytes, matrix }]
let qrGenLib = null;
let qrGenLibPromise = null;
let qrScanLib = null;
let qrScanLibPromise = null;
let qrScanItems = [];            // [{ file, name, size, state, text, error }]
let qrDecodePump = null;
// 收起状态按序号记（重新生成后同一格还是收着的）：{ [index]: true }
const qrCollapsed = {};
// 单张导出面板：-1 表示没开；pref 记住最近一次选的格式 / 尺寸，
// 连着导十几张时不用每张都重选
let qrExportIndex = -1;
let qrExportFormat = 'png';
let qrExportPref = null;

// 示例：一批自造内容（链接 / 资产号 / 单据号 / 联系人各一条），正好演示「一行一个码」
const QR_SAMPLE = [
    'https://example.com/item/1001',
    '设备编号 DV-2048 · 机房 A-12',
    '单据 O-0001 · 批次 B-07',
    '联系人 样例用户 · 分机 0001'
].join('\n');

/* ---------- 两个库：惰性加载 ---------- */

/** 宿主把带 src 的脚本内联成文本，这里就地把文本包成 blob: 地址 */
function qrLibSource(holderId) {
    const holder = document.getElementById(holderId);
    if (!holder) return null;
    const text = holder.textContent || '';
    if (text.length >= 4096) {
        try {
            return { url: URL.createObjectURL(new Blob([text], { type: 'text/javascript' })), revoke: true };
        } catch (err) { /* 退到相对路径 */ }
    }
    const src = holder.getAttribute('src');
    return src ? { url: src, revoke: false } : null;
}

function qrLoadLib(holderId, globalName) {
    if (typeof window[globalName] !== 'undefined') return Promise.resolve(window[globalName]);
    return new Promise((resolve, reject) => {
        const source = qrLibSource(holderId);
        if (!source) { reject(new Error('lib-missing')); return; }
        const script = document.createElement('script');
        script.async = true;
        const cleanup = () => {
            if (source.revoke) URL.revokeObjectURL(source.url);
            if (script.parentNode) script.parentNode.removeChild(script);
        };
        script.onload = () => {
            cleanup();
            const lib = window[globalName];
            if (lib) resolve(lib); else reject(new Error('global-missing'));
        };
        script.onerror = () => { cleanup(); reject(new Error('load-failed')); };
        script.src = source.url;
        document.head.appendChild(script);
    });
}

function qrEnsureGenLib() {
    if (qrGenLib) return Promise.resolve(qrGenLib);
    if (qrGenLibPromise) return qrGenLibPromise;
    qrGenLibPromise = qrLoadLib('qrGenLibSrc', 'qrcode')
        .then((lib) => { qrGenLib = lib; return lib; })
        .catch((err) => { qrGenLibPromise = null; throw err; });   // 失败不缓存，下次还能再试
    return qrGenLibPromise;
}

function qrEnsureScanLib() {
    if (qrScanLib) return Promise.resolve(qrScanLib);
    if (qrScanLibPromise) return qrScanLibPromise;
    qrScanLibPromise = qrLoadLib('qrScanLibSrc', 'jsQR')
        .then((lib) => { qrScanLib = lib; return lib; })
        .catch((err) => { qrScanLibPromise = null; throw err; });
    return qrScanLibPromise;
}

/* ---------- 参数 ---------- */

function qrOpts() {
    const base = {
        ecc: qrEcc,
        // 图标：canvas 用已加载的 Image，SVG 用 base64 data URI
        icon: qrIcon ? qrIcon.image : null,
        iconHref: qrIcon ? qrIcon.href : '',
        iconRatio: 0.22
    };
    if (!QR) {
        return Object.assign({ size: 256, margin: 2, dark: '#000000', light: '#ffffff' }, base);
    }
    return Object.assign({
        size: QR.clampInt(qrSizeInput.value, QR.LIMITS.size.min, QR.LIMITS.size.max, QR.LIMITS.size.def),
        margin: QR.clampInt(qrMarginInput.value, QR.LIMITS.margin.min, QR.LIMITS.margin.max, QR.LIMITS.margin.def),
        dark: qrColorOf(qrFgInput.value) || '#000000',
        light: qrColorOf(qrBgInput.value) || '#ffffff'
    }, base);
}

/** 颜色值校验：库没加载时也用同一条规则（#rgb / #rrggbb） */
function qrColorOf(value) {
    if (QR) return QR.normalizeColor(value);
    const s = String(value == null ? '' : value).trim();
    const hex = s.charAt(0) === '#' ? s : '#' + s;
    return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.toLowerCase() : null;
}

/** 文本框与取色器双向对齐：文本合法就推给取色器，取色器的值原样写回文本 */
function qrSyncColor(input, picker) {
    const color = qrColorOf(input.value);
    input.classList.toggle('is-invalid', !color);
    if (color && picker && picker.value !== color) picker.value = color;
    return color;
}

function qrSetTip(text, tone) {
    qrTipEl.textContent = text || '';
    qrTipEl.className = 'compare-tip' + (tone ? ' ' + tone : '');
}

function qrEl(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
}

/* ---------- 生成 ---------- */

function qrSchedule() {
    clearTimeout(qrTimer);
    qrTimer = setTimeout(() => { qrRun(); }, 320);
}

async function qrRun() {
    if (!qrModeActive || !QR) return;
    const opts = qrOpts();
    const source = qrEditor ? qrEditor.getValue() : qrInput.value;
    // 拆分方式：一行一个（批量）或整段一个（保留换行，名片 / 多行说明走这条）
    const split = qrSplit === 'whole'
        ? QR.splitWhole(source, { ecc: opts.ecc })
        : QR.splitItems(source, { ecc: opts.ecc });
    qrInBadge.textContent = split.items.length ? String(split.items.length) : '—';

    if (!split.items.length) {
        qrItems = [];
        qrRenderGrid(opts);
        qrSetTip(qrT('qrTipNone', '没有可生成的内容'), 'diff');
        return;
    }

    let lib;
    try {
        lib = await qrEnsureGenLib();
    } catch (err) {
        qrSetTip(qrT('qrLibFail', '二维码引擎加载失败'), 'err');
        return;
    }

    // 生成是同步的（每条几十微秒），200 条也就一二十毫秒，不需要分块
    const built = [];
    let longCount = split.dropped.tooLong;
    for (let i = 0; i < split.items.length; i++) {
        const item = split.items[i];
        try {
            built.push({ line: item.line, text: item.text, bytes: item.bytes, matrix: QR.matrixOf(item.text, opts.ecc, lib) });
        } catch (err) {
            longCount++;
        }
    }
    qrItems = built;
    qrRenderGrid(opts);

    const notes = [qrFmt('qrTipOk', { n: built.length }, built.length + ' generated')];
    if (longCount) {
        notes.push(qrFmt('qrTipSkipLong', { n: longCount }, longCount + ' too long'));
    }
    if (split.dropped.overflow) {
        notes.push(qrFmt('qrTipSkipMany', { n: QR.LIMITS.maxItems }, 'first ' + QR.LIMITS.maxItems + ' kept'));
    }
    // 前景和背景撞色时码扫不出来，宁可提前说一声
    const lowContrast = QR.contrast(opts.dark, opts.light) < 3;
    if (lowContrast) notes.push(qrT('qrLowContrast', '前景色与背景色太接近，可能扫不出来'));
    // 中心图标会盖掉中间一块，纠错没到 H 时全靠冗余恢复，提前提醒一句
    if (opts.iconHref && opts.ecc !== 'H') notes.push(qrT('qrIconLowEcc', '已加中心图标，建议纠错选「H」'));
    qrSetTip(notes.join(' · '), lowContrast ? 'diff' : 'ok');
}

function qrRenderGrid(opts) {
    if (!QR) return;
    // 重绘会换掉卡片，面板里的序号可能已经指不到原来那张，先收起
    if (qrExportMask && !qrExportMask.hidden) qrCloseExport();
    const o = opts || qrOpts();
    qrGridEl.innerHTML = '';
    const has = qrItems.length > 0;
    qrEmptyEl.hidden = has;
    qrGridEl.hidden = !has;
    // 只有一条时给一张大卡片：单码本来就该看大图，别缩在网格的小格子里
    qrGridEl.classList.toggle('is-single', qrItems.length === 1);
    if (!has) {
        qrOutBadge.textContent = '';
        qrOutSize.textContent = '';
        return;
    }
    const frag = document.createDocumentFragment();
    qrItems.forEach((item, index) => {
        const card = qrEl('div', 'qr-card');
        card.dataset.index = String(index);
        if (item.line) card.dataset.line = String(item.line);
        if (qrCollapsed[index]) card.classList.add('is-collapsed');

        // 卡片头就是折叠开关：收起后只留序号 + 一行内容，几十个码也能一眼扫完
        const toggle = qrEl('button', 'qr-card-toggle');
        toggle.type = 'button';
        toggle.setAttribute('aria-expanded', qrCollapsed[index] ? 'false' : 'true');
        toggle.title = qrT('qrToggleRow', '折叠 / 展开');
        toggle.appendChild(qrEl('span', 'qr-card-no', qrFmt('qrItemNo', { n: index + 1 }, '#' + (index + 1))));
        toggle.appendChild(qrEl('span', 'qr-card-peek', item.text));
        toggle.appendChild(qrEl('span', 'qr-card-caret'));
        toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            if (qrCollapsed[index]) delete qrCollapsed[index];
            else qrCollapsed[index] = true;
            card.classList.toggle('is-collapsed', !!qrCollapsed[index]);
            toggle.setAttribute('aria-expanded', qrCollapsed[index] ? 'false' : 'true');
            qrLocateLine(item.line, index, 'card');
        });

        const body = qrEl('div', 'qr-card-body');
        const media = qrEl('div', 'qr-card-media');
        media.insertAdjacentHTML('beforeend', QR.svgMarkup(item.matrix, o));
        // 双击码面进灯箱看大图（矢量重画，不是把这张小图拉大）
        media.title = qrT('qrZoomHint', '双击放大查看');
        media.addEventListener('dblclick', () => { qrZoom(index, media); });
        const text = qrEl('div', 'qr-card-text', item.text);
        text.title = item.text;
        const foot = qrEl('div', 'qr-card-foot');
        const exportBtn = qrEl('button', 'qr-mini', qrT('qrExportCard', '导出'));
        exportBtn.type = 'button';
        // 动态内容：标上 data-keep-title，才不会被宿主的提示清理扫掉
        exportBtn.setAttribute('data-keep-title', '');
        exportBtn.title = qrT('qrExportCardTip', '单独导出这张：可选格式、尺寸和文件名');
        exportBtn.addEventListener('click', () => { qrOpenExport(index); });
        const copy = qrEl('button', 'qr-mini', currentDict.copyBtn || '复制');
        copy.type = 'button';
        copy.addEventListener('click', () => { qrCopyText(item.text); });
        const copyImage = qrEl('button', 'qr-mini', qrImageCopyLabel());
        copyImage.type = 'button';
        copyImage.setAttribute('data-qr-copy-image', '');
        copyImage.addEventListener('click', () => {
            const p = qrCopyImage(index);
            // 兜底：异步里抛出来的错也要落到提示上。之前这里没人接异常，
            // 表现就是「点了按钮什么都不发生」
            if (p && typeof p.catch === 'function') {
                p.catch(() => {
                    showToast(currentDict.toastCopyError || '复制失败', 'error');
                });
            }
        });
        foot.appendChild(exportBtn);
        foot.appendChild(copy);
        foot.appendChild(copyImage);
        body.appendChild(media);
        body.appendChild(text);
        body.appendChild(foot);

        // 点卡片任意空白处 -> 输入框光标跳到那一行（反向定位）
        card.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            qrLocateLine(item.line, index, 'card');
        });

        card.appendChild(toggle);
        card.appendChild(body);
        frag.appendChild(card);
    });
    qrGridEl.appendChild(frag);
    qrOutBadge.textContent = qrFmt('qrBadge', { n: qrItems.length }, String(qrItems.length));
    qrOutSize.textContent = o.size + ' × ' + o.size + ' px';
}

/** 默认文件名（不含扩展名）：qr-01 / qr-02… */
function qrBaseName(index) {
    return 'qr-' + String(index + 1).padStart(2, '0');
}

function qrCanvasBase64(canvas) {
    try {
        const url = canvas.toDataURL('image/png');
        const at = url.indexOf(',');
        return at > 0 ? url.slice(at + 1) : '';
    } catch (err) {
        return '';
    }
}

/**
 * 单张落盘：格式 / 尺寸 / 文件名都由面板给。
 * 只有面板一个调用方，好处是「面板上写的」和「真正导出的」永远不会是两份东西。
 */
async function qrExportOne(index, format, size, name) {
    const item = qrItems[index];
    if (!item || !QR) return 'failed';
    const base = qrOpts();
    const opts = Object.assign({}, base, {
        size: QR.clampInt(size, QR.LIMITS.size.min, QR.LIMITS.size.max, base.size)
    });
    if (format === 'svg') {
        return saveTextFile(name, QR.svgMarkup(item.matrix, opts), 'image/svg+xml');
    }
    const canvas = document.createElement('canvas');
    if (!QR.drawToCanvas(canvas, item.matrix, opts)) return 'failed';
    const base64 = qrCanvasBase64(canvas);
    canvas.width = 0;
    canvas.height = 0;
    return base64 ? saveBinaryFile(name, base64, 'image/png') : 'failed';
}

/** 面板联动：扩展名、格式高亮、尺寸快选；SVG 是矢量，尺寸只写进 width / height */
function qrSyncExportUi() {
    const svg = qrExportFormat === 'svg';
    qrExportExtEl.textContent = svg ? '.svg' : '.png';
    qrExportFormatEl.querySelectorAll('[data-export-format]').forEach((el) => {
        el.classList.toggle('active', el.dataset.exportFormat === qrExportFormat);
    });
    const fallback = qrOpts().size;
    const size = QR
        ? String(QR.clampInt(qrExportSizeInput.value, QR.LIMITS.size.min, QR.LIMITS.size.max, fallback))
        : String(fallback);
    qrExportSizeChips.querySelectorAll('[data-export-size]').forEach((el) => {
        el.classList.toggle('active', el.dataset.exportSize === size);
    });
    qrExportNoteEl.textContent = svg
        ? qrT('qrExportSvgHint', 'SVG 是矢量图，放大不糊；尺寸只写进 width / height')
        : '';
}

/** 面板里动过格式 / 尺寸就记住，下一张不用重选（取消也算，反正是用户的选择） */
function qrRememberExportPref() {
    const opts = qrOpts();
    qrExportPref = {
        format: qrExportFormat,
        size: QR
            ? QR.clampInt(qrExportSizeInput.value, QR.LIMITS.size.min, QR.LIMITS.size.max, opts.size)
            : opts.size
    };
}

function qrOpenExport(index) {
    if (!QR || !qrItems[index]) return;
    const opts = qrOpts();
    const pref = qrExportPref || { format: qrFormat, size: opts.size };
    qrExportIndex = index;
    qrExportFormat = pref.format === 'svg' ? 'svg' : 'png';
    qrExportSizeInput.value = String(pref.size || opts.size);
    qrExportNameInput.value = qrBaseName(index);
    qrSyncExportUi();
    qrExportMask.hidden = false;
    // 名字默认全选：想改名直接打字，不改就回车
    qrExportNameInput.focus();
    if (typeof qrExportNameInput.select === 'function') qrExportNameInput.select();
}

function qrCloseExport() {
    const wasOpen = !qrExportMask.hidden;
    qrExportMask.hidden = true;
    qrExportIndex = -1;
    if (wasOpen && document.activeElement === qrExportNameInput) qrExportNameInput.blur();
}

/**
 * 双击码面：借图片页那套灯箱放大看（滚轮 / 双击切 1:1 / Esc 关闭）。
 * 这里按 ≥1024 重新矢量画一份再交给灯箱，而不是把卡片上那张小图拉伸——
 * 拉伸只会糊，重画放到 400% 边角还是硬的。
 */
function qrZoom(index, opener) {
    const item = qrItems[index];
    if (!item || !QR || typeof lbOpen !== 'function') return;
    const opts = qrOpts();
    const size = Math.max(1024, opts.size);
    let src = '';
    try {
        src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
            QR.svgMarkup(item.matrix, Object.assign({}, opts, { size: size }))
        );
    } catch (err) {
        src = '';
    }
    if (!src) {
        showToast(qrT('qrZoomFail', '放大失败，请重试'), 'error');
        return;
    }
    lbOpen(src, lbLabel(QR.shortLabel(item.text, 32), size, size), opener || null);
}

async function qrConfirmExport() {
    const index = qrExportIndex;
    if (index < 0 || !QR) {
        qrCloseExport();
        return;
    }
    const format = qrExportFormat === 'svg' ? 'svg' : 'png';
    const size = QR.clampInt(qrExportSizeInput.value, QR.LIMITS.size.min, QR.LIMITS.size.max, qrOpts().size);
    const name = QR.fileNameFor(qrExportNameInput.value, format, qrBaseName(index));
    qrExportPref = { format: format, size: size };
    qrCloseExport();
    saveToast(await qrExportOne(index, format, size, name), name);
}

/** 按宽度裁剪一段文字，末尾补省略号（拼图里的序号标签用） */
function qrClampText(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let out = '';
    for (let i = 0; i < text.length; i++) {
        if (ctx.measureText(out + text[i] + '…').width > maxWidth) break;
        out += text[i];
    }
    return out ? out + '…' : '';
}

/**
 * 全部导出：拼成一张 PNG。
 * 宿主里每存一次都要过一次保存框，200 个码逐个存等于 200 次点击；
 * 拼图只点一次，也能直接当「打印表」用。
 */
async function qrDownloadAll() {
    if (!QR) return;
    if (!qrItems.length) {
        qrSetTip(qrT('qrTipNone', '没有可生成的内容'), 'diff');
        return;
    }
    const opts = qrOpts();
    const labelH = 24;
    const layout = QR.tileLayout(qrItems.length, {
        size: opts.size,
        pad: 24,
        maxCols: 4,
        labelH: labelH
    });
    const canvas = document.createElement('canvas');
    canvas.width = layout.width;
    canvas.height = layout.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        showToast(currentDict.saveFailed || '导出失败', 'error');
        return;
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, layout.width, layout.height);
    ctx.font = '12px ' + (getComputedStyle(document.body).getPropertyValue('--font-mono') || 'monospace');
    ctx.textBaseline = 'middle';

    // 单码先画到一张离屏 canvas 上，再贴进拼图（drawToCanvas 会改画布尺寸）
    const one = document.createElement('canvas');
    qrItems.forEach((item, index) => {
        const col = index % layout.cols;
        const row = Math.floor(index / layout.cols);
        const x = layout.pad + col * (layout.size + layout.pad);
        const y = layout.pad + row * (layout.size + labelH + layout.pad);
        if (!QR.drawToCanvas(one, item.matrix, Object.assign({}, opts, { size: layout.size }))) return;
        ctx.drawImage(one, x, y);
        const label = qrFmt('qrItemNo', { n: index + 1 }, '#' + (index + 1)) + ' · ' + item.text;
        ctx.fillStyle = '#555555';
        ctx.fillText(qrClampText(ctx, label, layout.size), x, y + layout.size + labelH / 2);
    });
    one.width = 0;
    one.height = 0;

    const base64 = qrCanvasBase64(canvas);
    canvas.width = 0;
    canvas.height = 0;
    const name = 'qr-codes.png';
    if (!base64) {
        showToast(currentDict.saveFailed || '导出失败', 'error');
        return;
    }
    const status = await saveBinaryFile(name, base64, 'image/png');
    saveToast(status, name);
}

async function qrCopyText(text) {
    try {
        await writeClipboardText(String(text));
        showToast(currentDict.toastCopySuccess || '已复制');
    } catch (err) {
        showToast(currentDict.toastCopyError || '复制失败', 'error');
    }
}

/**
 * 复制图片到剪贴板。沙箱里 clipboard.write 不一定放行图片，
 * 写不进去就退成「存一张 PNG」——用户点了一次，总得拿到东西。
 */
function qrImageCopyLabel() {
    return qrImageCanCopy() ? qrImageLabel('selCopyImage', '复制图片') : qrImageLabel('selSaveImage', '保存图片');
}

/** 这个环境能不能把图片写进系统剪贴板（DBX 宿主不能：沙箱是 opaque origin，宿主桥只搬文本） */
function qrImageCanCopy() {
    if (typeof selImageClipSupported === 'function') return selImageClipSupported();
    return typeof ClipboardItem !== 'undefined'
        && !!navigator.clipboard && typeof navigator.clipboard.write === 'function';
}

/**
 * 补刷一遍卡片上的按钮文案。
 * 本文件在 21-editor-menu.js 之前加载，画卡片时环境判定可能还没就位，
 * 一律显示「保存图片」；等那边加载完再刷成真正的「复制图片 / 保存图片」。
 */
function qrRefreshCopyLabels() {
    if (!qrGridEl) return;
    const label = qrImageCopyLabel();
    qrGridEl.querySelectorAll('[data-qr-copy-image]').forEach((btn) => {
        btn.textContent = label;
    });
}

function qrImageLabel(key, fallback) {
    // 文案在 21-editor-menu.js 的 SEL_I18N 里（14 语言），两边用同一套术语
    if (typeof selT === 'function') return selT(key, fallback);
    return qrT(key, fallback);
}

/**
 * 复制 / 保存这张二维码图片。
 *
 * 直接走右键菜单那条链路（`selQrCopyJob`）：能写位图剪贴板的环境里就是「复制」，
 * DBX 宿主里落成一张 PNG。以前这里自己写了一份，还调了个根本不存在的
 * `qrFileName()`——ReferenceError 掉进 async 里没人接，点下去什么都不会发生，
 * 连提示都没有。两边共用一份代码，才不会一边正常、一边静默失效。
 */
function qrCopyImage(index) {
    const item = qrItems[index];
    if (!item || !QR) return Promise.resolve(null);
    if (typeof selQrCopyJob !== 'function') return Promise.resolve(null);
    return selQrCopyJob({
        matrix: item.matrix,
        // 用页面上的参数（尺寸 / 纠错 / 配色 / logo），不是右键那套固定值
        opts: qrOpts(),
        fileName: QR.fileNameFor('', 'png', qrBaseName(index))
    });
}

/** 输入行 ↔ 结果卡片互相定位：光标落在哪行，哪张卡片就亮起来 */
function qrLocateLine(line, index, source) {
    if (!qrGridEl) return;
    let target = null;
    if (index != null) target = qrGridEl.querySelector('.qr-card[data-index="' + index + '"]');
    if (!target && line) {
        // 那一行可能被跳过（空行 / 超容量），往下找最近的一张
        const cards = qrGridEl.querySelectorAll('.qr-card');
        for (let i = 0; i < cards.length; i++) {
            if (Number(cards[i].dataset.line || 0) >= line) { target = cards[i]; break; }
        }
        if (!target && cards.length) target = cards[cards.length - 1];
    }
    if (!target) return;
    qrGridEl.querySelectorAll('.qr-card.locate').forEach((card) => card.classList.remove('locate'));
    target.classList.add('locate');
    if (typeof target.scrollIntoView === 'function') {
        target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    // 反向：从卡片跳回输入框。光标驱动的方向不再回跳，否则两边互相打架
    if (source === 'card' && qrEditor && target.dataset.line) {
        const at = Number(target.dataset.line) - 1;
        qrEditor.setCursor({ line: at, ch: 0 });
        if (typeof qrEditor.scrollIntoView === 'function') {
            qrEditor.scrollIntoView({ line: at, ch: 0 }, 80);
        }
        qrEditor.focus();
    }
}

/* ---------- 解码 ---------- */

function qrIsImageFile(file) {
    if (!file) return false;
    if (/^image\//i.test(file.type || '')) return true;
    return /\.(png|jpe?g|gif|webp|bmp|avif)$/i.test(file.name || '');
}

function qrLoadImage(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        let settled = false;
        const release = () => {
            URL.revokeObjectURL(url);
            img.onload = null;
            img.onerror = null;
            img.src = '';
        };
        img.onload = () => {
            if (settled) return;
            settled = true;
            // 宽高必须在释放前读出来（release 之后 img 就空了）
            resolve({
                node: img,
                width: img.naturalWidth || img.width,
                height: img.naturalHeight || img.height,
                release: release
            });
        };
        img.onerror = () => {
            if (settled) return;
            settled = true;
            release();
            reject(new Error('load-failed'));
        };
        img.src = url;
    });
}

async function qrScanFiles(fileList) {
    const incoming = Array.from(fileList || []);
    const images = incoming.filter(qrIsImageFile);
    if (!images.length) {
        qrSetTip(qrT('qrScanNoImage', '请选择图片文件'), 'err');
        return;
    }
    const room = QR_LIMITS.decodeFiles - qrScanItems.length;
    if (room <= 0) {
        showToast(qrFmt('qrScanTooMany', { n: QR_LIMITS.decodeFiles }, 'too many'), 'error');
        return;
    }
    const take = images.slice(0, room);
    if (take.length < images.length) {
        showToast(qrFmt('qrScanTooMany', { n: QR_LIMITS.decodeFiles }, 'too many'), 'error');
    }
    take.forEach((file) => {
        qrScanItems.push({
            file: file,
            name: file.name || 'image',
            size: Number(file.size || 0),
            state: 'pending',
            text: '',
            error: ''
        });
    });
    qrRenderScanQueue();
    qrRenderScanResult();
    qrSetTip(qrT('qrScanPending', '识别中…'), '');
    await qrDecodeQueue();
    qrFinishScanTip();
}

/** 串行泵：一次只解一张，2000×1500 的图同时开三张就能把宿主顶住 */
async function qrDecodeQueue() {
    if (qrDecodePump) return qrDecodePump;
    qrDecodePump = (async () => {
        for (;;) {
            const next = qrScanItems.find((item) => item.state === 'pending');
            if (!next) break;
            await qrDecodeEntry(next);
            qrRenderScanQueue();
            qrRenderScanResult();
            await new Promise((resolve) => setTimeout(resolve, 0));   // 让出主线程
        }
    })();
    try {
        await qrDecodePump;
    } finally {
        qrDecodePump = null;
    }
}

async function qrDecodeEntry(entry) {
    if (!entry) return;
    if (!QR) {
        entry.state = 'error';
        entry.error = 'lib';
        entry.file = null;
        return;
    }
    if (entry.size > QR_LIMITS.decodeBytes) {
        entry.state = 'error';
        entry.error = 'too-big';
        entry.file = null;
        return;
    }
    let lib;
    try {
        lib = await qrEnsureScanLib();
    } catch (err) {
        entry.state = 'error';
        entry.error = 'lib';
        entry.file = null;
        return;
    }
    let image = null;
    try {
        image = await qrLoadImage(entry.file);
        const fit = QR.fitDecodeSide(image.width, image.height, QR.LIMITS.decodeSide);
        const canvas = document.createElement('canvas');
        canvas.width = fit.width;
        canvas.height = fit.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('no-context');
        ctx.drawImage(image.node, 0, 0, fit.width, fit.height);
        const pixels = ctx.getImageData(0, 0, fit.width, fit.height);
        canvas.width = 0;   // 立刻放掉这块位图，别攒到下一张
        canvas.height = 0;
        const result = lib(pixels.data, pixels.width, pixels.height);
        if (result && result.data) {
            entry.state = 'ok';
            entry.text = String(result.data);
        } else {
            entry.state = 'fail';
        }
    } catch (err) {
        entry.state = 'error';
        entry.error = 'io';
    } finally {
        if (image) image.release();
        entry.file = null;   // 解完就不留 File，否则整批图片一直压在内存里
    }
}

function qrFinishScanTip() {
    const done = qrScanItems.filter((item) => item.state !== 'pending');
    const okCount = done.filter((item) => item.state === 'ok').length;
    if (!okCount) {
        qrSetTip(qrFmt('qrScanTipOk', { ok: 0, n: done.length }, '0/' + done.length) +
            ' · ' + qrT('qrScanNone', '没有识别到二维码'), 'err');
        return;
    }
    qrSetTip(qrFmt('qrScanTipOk', { ok: okCount, n: done.length }, okCount + '/' + done.length), 'ok');
}

function qrRenderScanQueue() {
    qrScanQueueEl.innerHTML = '';
    if (!qrScanItems.length) {
        qrScanBadge.textContent = '—';
        return;
    }
    const frag = document.createDocumentFragment();
    qrScanItems.forEach((entry) => {
        const row = qrEl('div', 'qr-queue-item');
        row.appendChild(qrEl('span', 'qr-queue-name', entry.name));
        if (entry.size) row.appendChild(qrEl('span', 'qr-queue-meta', DBXImg.formatBytes(entry.size)));
        const state = qrEl('span', 'qr-state');
        if (entry.state === 'pending') {
            state.textContent = qrT('qrScanPending', '识别中…');
        } else if (entry.state === 'ok') {
            state.textContent = 'OK';
            state.classList.add('is-ok');
        } else if (entry.state === 'fail') {
            state.textContent = qrT('qrScanFail', '未识别');
            state.classList.add('is-err');
        } else if (entry.error === 'too-big') {
            state.textContent = qrFmt('qrScanTooBig', { size: DBXImg.formatBytes(QR_LIMITS.decodeBytes) }, 'too big');
            state.classList.add('is-err');
        } else {
            state.textContent = qrT('qrScanErr', '读取失败');
            state.classList.add('is-err');
        }
        row.appendChild(state);
        frag.appendChild(row);
    });
    qrScanQueueEl.appendChild(frag);
    qrScanBadge.textContent = String(qrScanItems.length);
}

function qrRenderScanResult() {
    qrScanResultEl.innerHTML = '';
    const done = qrScanItems.filter((item) => item.state !== 'pending');
    const has = done.length > 0;
    qrScanEmptyEl.hidden = has;
    qrScanResultEl.hidden = !has;
    if (!has) {
        qrScanOutBadge.textContent = '';
        return;
    }
    const frag = document.createDocumentFragment();
    done.forEach((entry) => {
        const ok = entry.state === 'ok';
        const card = qrEl('div', 'qr-result-item' + (ok ? '' : ' is-failed'));
        const head = qrEl('div', 'qr-result-head');
        head.appendChild(qrEl('span', 'qr-result-name', entry.name));
        const body = qrEl('div', 'qr-result-body');
        if (ok) {
            body.textContent = entry.text;
            const copy = qrEl('button', 'qr-mini', currentDict.copyBtn || '复制');
            copy.type = 'button';
            copy.style.flex = 'none';
            copy.addEventListener('click', () => { qrCopyText(entry.text); });
            head.appendChild(copy);
        } else if (entry.state === 'fail') {
            body.textContent = qrT('qrScanFail', '未识别到二维码');
        } else if (entry.error === 'too-big') {
            body.textContent = qrFmt('qrScanTooBig', { size: DBXImg.formatBytes(QR_LIMITS.decodeBytes) }, 'too big');
        } else {
            body.textContent = qrT('qrScanErr', '读取失败');
        }
        card.appendChild(head);
        card.appendChild(body);
        frag.appendChild(card);
    });
    qrScanResultEl.appendChild(frag);
    const okCount = done.filter((item) => item.state === 'ok').length;
    qrScanOutBadge.textContent = okCount + '/' + done.length;
}

/* ---------- 模式 / 进出页面 ---------- */

function qrApplyMode() {
    const encode = qrMode === 'encode';
    qrModeTabs.querySelectorAll('.compare-tab').forEach((tab) => {
        tab.classList.toggle('active', tab.dataset.qrMode === qrMode);
    });
    qrGenGrid.hidden = !encode;
    qrScanGrid.hidden = encode;
    qrOptionsEl.hidden = !encode;
    qrGenBtn.hidden = !encode;
    qrDownloadAllBtn.hidden = !encode;
    qrScanPickTop.hidden = encode;
    qrScanCopyAllBtn.hidden = encode;
    if (encode) {
        qrSetTip(qrItems.length
            ? qrFmt('qrTipOk', { n: qrItems.length }, qrItems.length + ' generated')
            : qrT('qrTipIdle', '每行一条内容'), qrItems.length ? 'ok' : '');
        qrRun();
    } else {
        qrRenderScanQueue();
        qrRenderScanResult();
        qrSetTip(qrScanItems.length ? '' : qrT('qrScanHint', '支持直接粘贴截图，可一次多张'), '');
    }
}

function qrEnsureEditor() {
    if (qrEditor) return;
    qrEditor = CodeMirror.fromTextArea(qrInput, editorConfig('text/plain', qrInput.placeholder, qrSchedule));
    qrEditor.on('change', () => {
        const next = qrEditor.getValue();
        if (qrInput.value !== next) qrInput.value = next;
        qrSchedule();
    });
    // 光标落在第几行，右边就高亮第几个码（和时间页同一套定位手感）
    qrEditor.on('cursorActivity', () => {
        if (!qrModeActive || qrMode !== 'encode') return;
        qrLocateLine(qrEditor.getCursor().line + 1);
    });
    linkTextareaToEditor(qrInput, qrEditor);
    syncEditorTheme();
}

function enterQrMode() {
    if (qrModeActive) return;
    exitOtherModes('qr');
    qrModeActive = true;
    markConvertActive(null);
    mainWorkspace.classList.add('hidden');
    toolbarEl.classList.add('hidden');
    qrEnsureEditor();
    qrWorkspaceEl.classList.add('active');
    navQrLink.classList.add('active');
    qrApplyMode();
    requestAnimationFrame(() => { if (qrEditor) qrEditor.refresh(); });
}

function exitQrMode() {
    if (!qrModeActive) return;
    qrModeActive = false;
    qrCloseExport();
    // 灯箱是全局的：换页时要把二维码那张大图关掉，别带到别的页面上
    if (typeof lbClose === 'function' && imgLightbox && !imgLightbox.hidden) lbClose();
    clearTimeout(qrTimer);
    qrWorkspaceEl.classList.remove('active');
    navQrLink.classList.remove('active');
    toolbarEl.classList.remove('hidden');
    mainWorkspace.classList.remove('hidden');
    requestAnimationFrame(() => {
        inputEditor.refresh();
        outputEditor.refresh();
    });
}

function refreshQrI18n() {
    if (qrEditor) qrEditor.setOption('placeholder', qrInput.placeholder || '');
    qrRenderGrid(qrOpts());
    qrRenderScanQueue();
    qrRenderScanResult();
    if (qrModeActive) qrRun();
}

/* ---------- 交互 ---------- */

qrModeTabs.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-qr-mode]');
    if (!tab || tab.dataset.qrMode === qrMode) return;
    qrMode = tab.dataset.qrMode;
    qrApplyMode();
});

/** 切纠错级别：状态 + 高亮一起改（上传图标时要自动提到 H，也走同一条路） */
function qrSetEcc(level) {
    const next = String(level || '').toUpperCase();
    const chip = qrEccEl.querySelector('[data-ecc="' + next + '"]');
    if (!chip) return false;
    qrEcc = next;
    qrEccEl.querySelectorAll('.compare-tab').forEach((el) => {
        el.classList.toggle('active', el === chip);
    });
    return true;
}

qrEccEl.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-ecc]');
    if (!chip) return;
    if (!qrSetEcc(chip.dataset.ecc)) return;
    qrRun();
});

qrFormatEl.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-format]');
    if (!chip) return;
    qrFormat = chip.dataset.format;
    qrFormatEl.querySelectorAll('.compare-tab').forEach((el) => {
        el.classList.toggle('active', el === chip);
    });
});

qrSplitEl.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-split]');
    if (!chip || chip.dataset.split === qrSplit) return;
    qrSplit = chip.dataset.split;
    qrSplitEl.querySelectorAll('.compare-tab').forEach((el) => {
        el.classList.toggle('active', el === chip);
    });
    // 卡片数量变了，收起来的序号就对不上了，全部展开重来
    Object.keys(qrCollapsed).forEach((key) => { delete qrCollapsed[key]; });
    qrRun();
});

/* ---------- 中心图标 ---------- */

const QR_ICON_BYTES = 8 * 1024 * 1024;   // 原图上限，再大就不是「图标」了
// 归一化后的长边：每张卡片都会嵌一份 base64，原图（尤其照片 JPG）直接塞会把 DOM 撑爆
const QR_ICON_SIDE = 256;

function qrIconExtOk(name) {
    return /\.(png|jpe?g|jfif|webp|gif|bmp|svg|ico|avif)$/i.test(String(name || ''));
}

/** 任意图片 -> 长边不超过 256 的 PNG data URI（透明区保留，照片也不会带出噪点） */
function qrNormalizeIcon(image) {
    const w = image.naturalWidth || image.width || 0;
    const h = image.naturalHeight || image.height || 0;
    if (!w || !h) return '';
    const scale = Math.min(1, QR_ICON_SIDE / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    let href = '';
    try {
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        href = canvas.toDataURL('image/png');
    } catch (err) {
        href = '';
    }
    canvas.width = 0;
    canvas.height = 0;
    return href;
}

function qrApplyIconUi() {
    const has = !!qrIcon;
    qrIconThumb.hidden = !has;
    qrIconClearBtn.hidden = !has;
    if (has) qrIconThumb.src = qrIcon.href;
    else qrIconThumb.removeAttribute('src');
}

function qrIconFail() {
    showToast(qrT('qrIconFail', '图标读取失败，请换一张图片'), 'error');
}

/** 图标落地：href 给 SVG，image 给 canvas，两边用同一份归一化后的图 */
function qrSetIcon(href, image, name) {
    qrIcon = { href: href, image: image, name: name || 'icon' };
    qrApplyIconUi();
    // 中心被图标盖掉一块，实测只有 H 级扛得住：L / M / Q 都会让码直接扫不出来，
    // 所以贴图标就把纠错顶到 H，别生成一张「看着有图、扫了没反应」的码
    const bumped = qrEcc !== 'H' && qrSetEcc('H');
    qrRun();   // 走完整流程，顺带把提示刷出来
    showToast(
        bumped ? qrT('qrIconOkEcc', '图标已应用，纠错已调到 H') : qrT('qrIconOk', '图标已应用'),
        'success'
    );
}

function qrReadIconFile(file) {
    if (!file) return;
    // 只看 file.type 会漏：有些环境拿到的 MIME 是空的（拖进来的、改过扩展名的），
    // 这时按扩展名兜一次，再不匹配就明确报错——静默 return 是最难查的一类反馈
    if (!/^image\//i.test(file.type || '') && !qrIconExtOk(file.name)) {
        showToast(qrT('qrIconNotImage', '请选择图片文件（PNG / JPG / SVG）'), 'error');
        return;
    }
    if (Number(file.size || 0) > QR_ICON_BYTES) {
        showToast(qrFmt('qrIconTooBig', { size: '8 MB' }, '图标不能超过 8 MB'), 'error');
        return;
    }
    const reader = new FileReader();
    reader.onload = () => {
        const raw = String(reader.result || '');
        if (raw.indexOf('data:image/') !== 0) { qrIconFail(); return; }
        const big = new Image();
        big.onload = () => {
            const href = qrNormalizeIcon(big) || raw;
            // 归一化后再解一张小的交给 canvas，原图（可能几十 MB）不常驻内存
            const small = new Image();
            small.onload = () => { qrSetIcon(href, small, file.name); };
            small.onerror = () => { qrSetIcon(href, big, file.name); };
            small.src = href;
        };
        big.onerror = () => { qrIconFail(); };
        big.src = raw;
    };
    reader.onerror = () => { qrIconFail(); };
    reader.readAsDataURL(file);
}

qrIconPickBtn.addEventListener('click', () => { qrIconInput.click(); });
qrIconInput.addEventListener('change', () => {
    const file = (qrIconInput.files || [])[0];
    qrIconInput.value = '';
    if (file) qrReadIconFile(file);
});
qrIconClearBtn.addEventListener('click', () => {
    qrIcon = null;
    qrApplyIconUi();
    qrRenderGrid(qrOpts());
});

[qrSizeInput, qrMarginInput].forEach((input) => {
    input.addEventListener('input', () => { qrSchedule(); });
    input.addEventListener('blur', () => {
        // 失焦时把越界值写回输入框，别让用户以为 5000 生效了
        const opts = qrOpts();
        input.value = String(input === qrSizeInput ? opts.size : opts.margin);
        qrRenderGrid(opts);
    });
});

[[qrFgInput, qrFgPicker], [qrBgInput, qrBgPicker]].forEach(([input, picker]) => {
    input.addEventListener('input', () => {
        if (qrSyncColor(input, picker)) qrSchedule();
    });
    input.addEventListener('blur', () => {
        const color = qrSyncColor(input, picker);
        if (!color) {
            input.value = input === qrFgInput ? '#000000' : '#ffffff';
            qrSyncColor(input, picker);
        }
        qrRenderGrid(qrOpts());
    });
    // 取色器：系统调色板选完立刻出图，文本框跟着更新
    picker.addEventListener('input', () => {
        input.value = picker.value;
        input.classList.remove('is-invalid');
        qrSchedule();
    });
});

qrGenBtn.addEventListener('click', () => { qrRun(); });
qrDownloadAllBtn.addEventListener('click', () => { qrDownloadAll(); });

/* ---------- 单张导出面板 ---------- */

qrExportFormatEl.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-export-format]');
    if (!chip) return;
    qrExportFormat = chip.dataset.exportFormat === 'svg' ? 'svg' : 'png';
    qrSyncExportUi();
    qrRememberExportPref();
});

qrExportSizeChips.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-export-size]');
    if (!chip) return;
    qrExportSizeInput.value = chip.dataset.exportSize;
    qrSyncExportUi();
    qrRememberExportPref();
});

// 手输尺寸时只同步高亮，不就地夹值（边打边夹的话，敲「1」就被吃掉了）
qrExportSizeInput.addEventListener('input', () => { qrSyncExportUi(); });
qrExportSizeInput.addEventListener('blur', () => {
    const opts = qrOpts();
    qrExportSizeInput.value = String(QR
        ? QR.clampInt(qrExportSizeInput.value, QR.LIMITS.size.min, QR.LIMITS.size.max, opts.size)
        : opts.size);
    qrSyncExportUi();
    qrRememberExportPref();
});

qrExportMask.addEventListener('click', (e) => {
    if (e.target === qrExportMask) qrCloseExport();   // 点遮罩空白处 = 取消
});
qrExportMask.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); qrCloseExport(); return; }
    if (e.key === 'Enter') { e.preventDefault(); qrConfirmExport(); }
});
qrExportCancelBtn.addEventListener('click', () => { qrCloseExport(); });
qrExportCloseBtn.addEventListener('click', () => { qrCloseExport(); });
qrExportOkBtn.addEventListener('click', () => { qrConfirmExport(); });

document.getElementById('qrSample').addEventListener('click', () => {
    if (qrEditor) qrEditor.setValue(QR_SAMPLE);
    else qrInput.value = QR_SAMPLE;
    qrRun();
});

document.getElementById('qrClear').addEventListener('click', () => {
    if (qrMode === 'encode') {
        clearTimeout(qrTimer);
        if (qrEditor) qrEditor.setValue('');
        else qrInput.value = '';
        qrItems = [];
        qrInBadge.textContent = '—';
        qrRenderGrid(qrOpts());
        qrSetTip(qrT('qrTipIdle', '每行一条内容'), '');
    } else {
        qrScanItems = [];
        qrRenderScanQueue();
        qrRenderScanResult();
        qrSetTip('', '');
    }
});

qrScanPick.addEventListener('click', (e) => {
    e.stopPropagation();
    qrScanInput.click();
});
qrScanPickTop.addEventListener('click', () => { qrScanInput.click(); });
qrDropEl.addEventListener('click', () => { qrScanInput.click(); });
qrScanInput.addEventListener('change', () => {
    const files = Array.from(qrScanInput.files || []);
    qrScanInput.value = '';   // 允许重复选同一批文件
    if (files.length) qrScanFiles(files);
});

['dragenter', 'dragover'].forEach((type) => {
    qrDropEl.addEventListener(type, (e) => {
        e.preventDefault();
        qrDropEl.classList.add('dragover');
    });
});
['dragleave', 'dragend'].forEach((type) => {
    qrDropEl.addEventListener(type, () => qrDropEl.classList.remove('dragover'));
});
qrDropEl.addEventListener('drop', (e) => {
    e.preventDefault();
    qrDropEl.classList.remove('dragover');
    const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
    if (files.length) qrScanFiles(files);
});

qrScanCopyAllBtn.addEventListener('click', () => {
    const lines = qrScanItems.filter((item) => item.state === 'ok').map((item) => item.text);
    if (!lines.length) {
        qrSetTip(qrT('qrScanNone', '没有识别到二维码'), 'diff');
        return;
    }
    qrCopyText(lines.join('\n'));
});

// 粘贴截图：只在解码模式下接管，图片页那条监听各管各的
document.addEventListener('paste', (e) => {
    if (!qrModeActive || qrMode !== 'decode') return;
    const items = (e.clipboardData && e.clipboardData.items) || [];
    const files = [];
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file' && /^image\//i.test(item.type || '')) {
            const file = item.getAsFile();
            if (file) files.push(file);
        }
    }
    if (!files.length) return;
    e.preventDefault();
    qrScanFiles(files);
});

// ---------- 统一的文件导入（拖进来 / 点「导入文件」） ----------
// 各页能接什么：图片页编码只吃图片、解码只吃文本；表格页只吃表格；
// 其余页面都是「文本页」——除了图片和二进制表格，扩展名不认识也照收，
// 因为大量导出文件叫 .dat / .out / .resp，按扩展名拒收等于把人挡在门外。
function importKindForPage(page) {
    if (page === 'navImage') return imgMode === 'encode' ? 'image' : 'text';
    if (page === 'navQr') return qrMode === 'encode' ? 'text' : 'image';
    if (page === 'navSheet') return 'sheet';
    return 'text';
}

// 文本单文件上限：16 MB（原来是 2 MB，直接把常见几 MB 的接口导出挡在外面）
const TEXT_IMPORT_MAX = 16 * 1024 * 1024;
// 超过这么多字符就不在导入瞬间自动转换：格式转换要「解析 → 重新序列化」一遍，
// 大文件在拖入的瞬间跑完整转换会把宿主卡住，宁可让用户自己点「执行转换」
const TEXT_AUTO_MAX = 2 * 1024 * 1024;

// 每个文本页的写入目标：优先写 CodeMirror（会触发页面自己的 change 处理），
// 编辑器还没建起来（懒创建）就写 textarea，等它 fromTextArea 时照样能读到
function pageImportTargets(page, side) {
    const byId = (id) => document.getElementById(id);
    // 格式转换页的 pageId 是空串（导航上的 dataset 里写的是 convert）
    if (page === '' || page === 'convert') return { editor: inputEditor, el: inputText, tipId: 'convertTip', convert: true };
    if (page === 'navCompare') {
        // 对比页左右各自有导入按钮；拖进来（没有 side）时先填空着的那一侧
        const leftHas = (cmpLeftEditor ? cmpLeftEditor.getValue() : cmpLeftText.value).trim();
        const rightHas = (cmpRightEditor ? cmpRightEditor.getValue() : cmpRightText.value).trim();
        const toRight = side === 'right' || (!side && !!leftHas && !rightHas);
        return toRight
            ? { editor: cmpRightEditor, el: cmpRightText, tipId: 'compareTip' }
            : { editor: cmpLeftEditor, el: cmpLeftText, tipId: 'compareTip' };
    }
    if (page === 'navSql') return { editor: sqlInputEditor, el: sqlInputText, tipId: 'sqlTip' };
    if (page === 'navEscape') return { editor: escInputEditor, el: escInput, tipId: 'escTip' };
    if (page === 'navBytes') return { editor: bytesEditor, el: bytesInput, tipId: 'bytesTip' };
    if (page === 'navTime') return { editor: timeEditor, el: timeInput, tipId: 'timeTip' };
    // 二维码页只有「生成」吃文本；「解码」吃图片，走 qrScanFiles（见 importKindForPage）
    if (page === 'navQr') return qrMode === 'encode' ? { editor: qrEditor, el: qrInput, tipId: 'qrTip' } : null;
    if (page === 'navChart') return { editor: chartEditor, el: chartInput, tipId: 'chartTip' };
    // 统计页的编辑器是懒创建的，没进过这页时 editor 还是 null，此时退回 textarea
    if (page === 'navStats') return { editor: statsEditor, el: statsInputEl, tipId: 'statsTip' };
    // SQL 分析页：数据进左边的编辑器（编辑器也是懒创建的，没进过这页时退回 textarea）
    if (page === 'navDataSql') {
        return {
            editor: typeof dataSqlDataEditor !== 'undefined' ? dataSqlDataEditor : null,
            el: document.getElementById('dataSqlInput'),
            tipId: 'dataSqlTip'
        };
    }
    if (page === 'navCodegen') return { editor: codeInputEditor, el: codeInput, tipId: 'codeTip' };
    if (page === 'navQuery') {
        const schemaPane = byId('querySchemaPane');
        const onSchema = !!schemaPane && schemaPane.classList.contains('active');
        return onSchema
            ? { editor: schDataEditor, el: schData, tipId: 'queryTip' }
            : { editor: queryDataEditor, el: queryInput, tipId: 'queryTip' };
    }
    return null;
}

// 提示条按 id 写：各页的 .compare-tip 结构一样，只有格式转换页多了 convert-tip 类
function setPageTip(tipId, text, tone) {
    const node = tipId ? document.getElementById(tipId) : null;
    if (!node) return;
    node.textContent = text;
    node.hidden = false;
    node.classList.remove('ok', 'err', 'diff');
    if (tone) node.classList.add(tone);
}

// 文本按 UTF-8 读出来之后，二进制会变成 NUL 或大量替换符，这种直接拦下
function textLooksBinary(text) {
    const head = text.length > 8192 ? text.slice(0, 8192) : text;
    if (head.indexOf('\u0000') >= 0) return true;
    let bad = 0;
    for (let i = 0; i < head.length; i++) {
        if (head.charCodeAt(i) === 0xFFFD) bad++;
    }
    return head.length > 64 && bad / head.length > 0.1;
}

// 导入文本时定「格式转换」的源格式：扩展名能确定就用它，其余按内容认；
// 认不出结构但看着像表格就按 CSV，比直接抛一句 JSON 解析错有用
function convertSourceFormat(name, text) {
    const flow = window.DBXFlow;
    if (!flow) return 'json';
    const byExt = flow.textFormatOf(name || '');
    if (byExt) return byExt;
    const guess = flow.guessFormat(text);
    if (guess !== 'json') return guess;
    if (flow.classifyText(text) === 'json') return 'json';
    const lines = String(text).split('\n').slice(0, 20).filter((l) => l.trim());
    if (lines.length >= 2) {
        const hits = lines.filter((l) => l.indexOf(',') >= 0 || l.indexOf('\t') >= 0).length;
        if (hits / lines.length >= 0.8) return 'csv';
    }
    return 'json';
}

function putTextIntoPage(t, text) {
    if (t.editor && typeof t.editor.setValue === 'function') {
        t.editor.setValue(text);
        return;
    }
    if (!t.el) return;
    t.el.value = text;
    t.el.dispatchEvent(new Event('input', { bubbles: true }));
}

// 格式转换页有自己的入口：要先定源格式、抑制自动转换
function loadTextIntoConvert(text, name, heavy, forceSrc) {
    const src = forceSrc || convertSourceFormat(name, text);
    exitOtherModes('');
    toolbarEl.classList.remove('hidden');
    mainWorkspace.classList.remove('hidden');
    markConvertActive(null);
    clearTimeout(autoTimer);
    suppressAutoConvert = true;
    inputText.value = text;
    suppressAutoConvert = false;
    currentDataObj = null;
    clearError();
    const tgt = targetFormat.value === src ? (src === 'json' ? 'yaml' : 'json') : targetFormat.value;
    if (heavy) {
        // 只把格式选好，不跑转换：几十 MB 的内容在导入瞬间解析会把宿主卡住
        sourceFormat.value = src;
        targetFormat.value = tgt;
        sourceSelect.setValue(src);
        targetSelect.setValue(tgt);
        updateOutputLabel();
        syncEditorModes();
        setOutput('');
        return;
    }
    handleFormatChange(src, tgt);
}

async function importTextIntoPage(page, file, side) {
    const t = pageImportTargets(page, side);
    if (!t || !file) return;
    // SQL 分析页自己接（xlsx 要先解压读表，csv / txt 走文本，最后都变成同一份分隔符文本）
    if (page === 'navDataSql' && typeof dataSqlImportFile === 'function') {
        await dataSqlImportFile(file);
        return;
    }
    const size = Number(file.size || 0);
    if (size > TEXT_IMPORT_MAX) {
        showToast(dropTooBig(file.name, size, TEXT_IMPORT_MAX), 'error');
        return;
    }
    let text = '';
    try {
        text = await readFileText(file);
    } catch (err) {
        showToast(fT('flowDropFail', '读取失败：{name}').replace('{name}', file.name || '—'), 'error');
        return;
    }
    if (textLooksBinary(text)) {
        showToast(fT('flowDropNotText', '这不是文本文件，读不出内容'), 'error');
        return;
    }
    const heavy = text.length > TEXT_AUTO_MAX;
    if (t.convert) loadTextIntoConvert(text, file.name || '', heavy);
    else putTextIntoPage(t, text);

    // 导入结果说两遍：提示条里常驻（页面自己刷新提示时可能被覆盖），
    // 再加一条 toast 保证「文件名 + 体积」这次一定看得到
    const note = fTpl(heavy ? 'flowImportedHeavy' : 'flowImported',
        heavy ? '已导入 {name} · {size} · 文件较大，已跳过自动处理' : '已导入 {name} · {size}',
        { name: file.name || '—', size: DBXImg.formatBytes(size) });
    setPageTip(t.tipId, note, heavy ? 'diff' : 'ok');
    showToast(note);
}

// 拖放前的守门：只看「当前页能不能吃这个文件」，绝不替用户切页
function checkDropRoute(names) {
    const page = currentPageId();
    const flow = window.DBXFlow;
    const kind = importKindForPage(page);
    const list = names || [];
    for (let i = 0; i < list.length; i++) {
        const name = list[i];
        const routed = flow ? flow.routeFile(name) : { kind: 'none' };
        if (kind === 'image') {
            if (routed.kind === 'image') continue;
            return { ok: false, msg: imgT('imgDropTextInstead', '这是文本文件，请切到「Base64 转图片」页导入') };
        }
        if (kind === 'sheet') {
            if (routed.kind === 'sheet') continue;
            return {
                ok: false,
                msg: routed.kind === 'image'
                    ? fT('flowDropImageOnly', '这是图片，请到「图片 Base64」页导入')
                    : fT('flowDropNotSheet', '这一页只收表格文件（xlsx / xlsm / csv / tsv / txt）')
            };
        }
        // SQL 分析页两种都吃：文本按分隔符解析，xlsx 读成 TSV 再走同一条路
        if (page === 'navDataSql' && routed.kind === 'sheet') continue;
        // 文本页：图片与二进制表格之外，扩展名不认识也照收
        if (!flow || flow.textImportable(name)) continue;
        return {
            ok: false,
            msg: routed.kind === 'image'
                ? fT('flowDropImageOnly', '这是图片，请到「图片 Base64」页导入')
                : fT('flowDropSheetOnly', '这是表格文件（xlsx / xls），请到「表格转 JSON」页导入')
        };
    }
    return { ok: true };
}

// 每页在入口就该拦下的体积（读完之前先按声明的 size 拦一次，别先读进内存）
function dropLimitFor(page) {
    const kind = importKindForPage(page);
    if (kind === 'image') {
        // 二维码解码只读像素，不吃原图尺寸，24 MB 比图片页宽一档
        return page === 'navQr' ? QR_LIMITS.decodeBytes : DBXImg.LIMITS.maxImageBytes;
    }
    if (kind === 'sheet') return SHEET_LIMITS.maxFileBytes;
    // SQL 分析页能吃 xlsx，上限按表格文件走（文本那一路自己还有 16 MB 的闸）
    if (page === 'navDataSql') return Math.max(TEXT_IMPORT_MAX, SHEET_LIMITS.maxFileBytes);
    return TEXT_IMPORT_MAX;
}

// 过滤完的文件交给当前页：图片页一张、表格页可批量、其余页一次一个
function dispatchDroppedFiles(files) {
    if (!files || !files.length) return;
    const page = currentPageId();
    const kind = importKindForPage(page);
    if (page === 'navImage') {
        // 编码页收图片，解码页收 Base64 文本文件——两条路都在 imgImportFile 里判
        if (kind === 'image') imgOpenFile(files[0]);
        else imgImportFile(files[0]);
        return;
    }
    if (page === 'navQr' && kind === 'image') {
        // 二维码解码页一次能吃多张，直接进识别队列
        qrScanFiles(files);
        return;
    }
    if (kind === 'sheet') {
        if (files.length > 1) openSheetBatch(files);
        else openSheetFile(files[0]);
        return;
    }
    if (files.length > 1) {
        showToast(fTpl('flowDropOneOnly', '这一页一次只导入一个文件，已用 {name}', { name: files[0].name || '—' }), 'diff');
    }
    importTextIntoPage(page, files[0]);
}

async function handleHostDrop(entries) {
    const flow = window.DBXFlow;
    if (!flow || !entries || !entries.length) return;
    showDropVeil(false);
    const page = currentPageId();
    const kind = importKindForPage(page);
    // 表格页能批量合并、二维码解码页能批量识别，其它页一次只读一个
    const max = kind === 'sheet'
        ? flow.LIMITS.batchFiles
        : (page === 'navQr' ? QR_LIMITS.decodeFiles : 1);
    let list = entries;
    if (list.length > max) {
        if (kind === 'sheet') {
            showToast(fT('flowDropMany', '一次最多 {n} 个文件').replace('{n}', String(max)), 'error');
        }
        list.slice(max).forEach(releaseEntry);
        list = list.slice(0, max);
    }
    const verdict = checkDropRoute(list.map((e) => (e && e.name) || ''));
    if (!verdict.ok) {
        list.forEach(releaseEntry);
        showToast(verdict.msg, 'error');
        return;
    }
    const perFile = dropLimitFor(page);
    const files = [];
    let used = 0;
    for (let i = 0; i < list.length; i++) {
        const entry = list[i] || {};
        const declared = Number(entry.size || 0);
        if (declared && used + declared > HOST_DROP_BUDGET) {
            releaseEntry(entry);
            showToast(dropTooBig(entry.name, declared, HOST_DROP_BUDGET), 'error');
            break;
        }
        try {
            const file = await hostEntryToFile(entry, perFile);
            used += file.size;
            files.push(file);
        } catch (err) {
            releaseEntry(entry);
            if (err && err.message === 'too-big') {
                showToast(dropTooBig(entry.name, err.size || declared, perFile), 'error');
            } else {
                showToast(fT('flowDropFail', '读取失败：{name}').replace('{name}', entry.name || '—'), 'error');
            }
        }
    }
    if (!files.length) return;
    dispatchDroppedFiles(files);
}

function setupHostDrop() {
    const ft = hostFT();
    try {
        ft.onDrop((files) => {
            if (!claimDrop('host')) return;
            showDropVeil(false);
            handleHostDrop(files).catch((err) => {
                console.error('[flow] host drop failed', err);
                showToast(fT('flowDropFail', '读取失败：{name}').replace('{name}', '—'), 'error');
            });
        });
    } catch (err) {
        console.error('[flow] onDrop 注册失败', err);
    }
    if (typeof ft.onDragState === 'function') {
        try {
            ft.onDragState((dragging) => showDropVeil(!!dragging));
        } catch (err) { /* 老版本宿主没有这个能力，蒙层不显示而已 */ }
    }
}

// ---------- 浏览器兜底（开发预览 / 宿主没给 fileTransfer 时） ----------
function setupBrowserDrop() {
    // 进/出只负责蒙层与阻止导航，用捕获阶段兜住任何层级的 stopPropagation
    window.addEventListener('dragenter', (e) => {
        if (!dragHasFiles(e)) return;
        e.preventDefault();
        dragDepth++;
        showDropVeil(true);
    }, true);
    window.addEventListener('dragover', (e) => {
        // 不拦的话 WebView 会把文件当导航打开，等于离开插件；页内拖文本 / 拖行不干预
        if (!dragHasFiles(e)) return;
        e.preventDefault();
        if (e.dataTransfer) {
            try { e.dataTransfer.dropEffect = 'copy'; } catch (err) { /* 只读属性，忽略 */ }
        }
    }, true);
    window.addEventListener('dragleave', (e) => {
        if (!dragHasFiles(e)) return;
        dragDepth = Math.max(0, dragDepth - 1);
        if (!dragDepth) showDropVeil(false);
    }, true);
    // 松手只收蒙层：真正的处理留给冒泡，页面自己的投放区（图片页 / 表格页）优先
    window.addEventListener('drop', () => {
        dragDepth = 0;
        showDropVeil(false);
    }, true);
    document.addEventListener('drop', (e) => {
        if (e.defaultPrevented) return;
        const files = e.dataTransfer && e.dataTransfer.files;
        if (!files || !files.length) return;
        e.preventDefault();
        if (!claimDrop('browser')) return;
        handleDroppedFiles([].slice.call(files));
    });
}

// 浏览器兜底先挂上：开发预览直接打开 index.html 时靠它
setupBrowserDrop();
// 宿主的 fileTransfer 要等 ready 之后才挂好，太早读只会拿到 undefined
function initHostDrop() {
    if (hostDropAvailable()) setupHostDrop();
}
if (window.dbxPlugin && window.dbxPlugin.ready && typeof window.dbxPlugin.ready.then === 'function') {
    window.dbxPlugin.ready.then(initHostDrop).catch(() => { /* 老宿主没有 ready，忽略 */ });
} else {
    initHostDrop();
}

function readFileText(file) {
    if (typeof file.text === 'function') return file.text();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
    });
}

async function loadTextFileIntoConvert(file, format) {
    const text = await readFileText(file);
    const src = format || convertSourceFormat(file.name, text);
    loadTextIntoConvert(text, file.name || '', false, src);
}

// 一个表格文件 → 记录（批量与单文件共用同一套选项）
async function parseSheetRecords(file) {
    const ext = (/\.([^.]+)$/.exec(file.name || '') || [null, ''])[1].toLowerCase();
    if (file.size > SHEET_LIMITS.maxFileBytes) throw new Error('too-big');
    if (ext === 'xls') throw new Error('old-xls');
    const isXlsx = ext === 'xlsx' || ext === 'xlsm';
    if (!isXlsx && ['csv', 'tsv', 'txt'].indexOf(ext) === -1) throw new Error('bad-type');

    let rows;
    if (isXlsx) {
        if (!window.DBXXlsx) throw new Error('xlsx missing');
        const buffer = await file.arrayBuffer();
        rows = (await window.DBXXlsx.read(buffer, { maxRows: SHEET_LIMITS.maxRows })).rows;
    } else {
        const text = await readSheetText(file);
        rows = DBXSheet.parse(text, {
            delimiter: sheetDelimiter,
            maxRows: SHEET_LIMITS.maxRows,
            maxCols: SHEET_LIMITS.maxCols
        }).rows;
    }
    const built = DBXSheet.buildRecords(rows, {
        hasHeader: sheetHeaderBox.checked,
        numbers: sheetNumbersBox.checked,
        booleans: sheetBoolsBox.checked,
        skipNote: sheetSkipNoteValue(),
        maxRecords: sheetLimitValue()
    });
    return { name: file.name, records: built.records, headers: built.headers };
}

// 批量：多个文件合并成一个 { 文件名: 记录[] } 的 JSON，只出 JSON
async function openSheetBatch(files) {
    const flow = window.DBXFlow;
    if (!flow) return;
    resetSheetState();
    ensureSheetEditor();
    sheetBusy = true;
    sheetProgressSet(0);
    const entries = [];
    for (let i = 0; i < files.length; i++) {
        sheetProgressSet(i / files.length);
        setSheetTip(sheetT('sheetTipParsing', '解析中…'));
        try {
            entries.push(await parseSheetRecords(files[i]));
        } catch (err) {
            entries.push({ name: files[i].name, error: true });
        }
    }
    const merged = flow.mergeFiles(entries);
    sheetBusy = false;
    sheetProgressSet(null);
    if (!merged.ok) {
        renderSheetOutput('', 0);
        setSheetTip(sheetT('sheetTipEmpty', '没有解析到数据，检查一下分隔符或表头设置'), 'err');
        return;
    }

    const first = entries.filter((e) => !e.error)[0] || { records: [], headers: [] };
    sheetState.kind = 'rows';
    sheetState.rows = [];
    sheetState.records = first.records;
    sheetState.headers = first.headers || [];
    sheetState.available = first.records.length;
    sheetState.fileName = flow.batchFileName(merged.keys);
    sheetState.fileSize = 0;
    sheetState.batch = { keys: merged.keys, data: merged.data, preview: first.name, files: files };
    updateSheetFileInfo();
    const text = buildBatchText();
    sheetState.json = text;
    sheetState.sql = '';
    renderSheetTable();
    const total = merged.keys.reduce((n, k) => n + k.count, 0);
    renderSheetOutput(text, total);
    setSheetTip(fT('flowBatchTip', '{n} 个文件 · {m} 条记录，已合并成一个 JSON')
        .replace('{n}', String(merged.keys.length))
        .replace('{m}', String(total)), 'ok');
}

function buildBatchText() {
    const data = sheetState.batch ? sheetState.batch.data : {};
    return sheetFormat === 'compact' ? JSON.stringify(data) : JSON.stringify(data, null, 2);
}

function handleDroppedFiles(files) {
    const flow = window.DBXFlow;
    if (!flow || !files.length) return;
    const page = currentPageId();
    const kind = importKindForPage(page);
    // 表格页能批量合并，其它页一次只读一个
    const max = kind === 'sheet' ? flow.LIMITS.batchFiles : 1;
    let list = files;
    if (list.length > max) {
        if (kind === 'sheet') {
            showToast(fT('flowDropMany', '一次最多 {n} 个文件').replace('{n}', String(max)), 'error');
        }
        list = list.slice(0, max);
    }
    const verdict = checkDropRoute(list.map((f) => f.name));
    if (!verdict.ok) {
        showToast(verdict.msg, 'error');
        return;
    }
    // 浏览器路径以前不看体积：拖一个几百 MB 的 txt 会整段读进内存再塞进编辑器。
    // 现在和宿主路径同一个入口上限，读之前就拦掉
    const perFile = dropLimitFor(page);
    let used = 0;
    const keep = [];
    for (let i = 0; i < list.length; i++) {
        const f = list[i];
        const size = Number(f.size || 0);
        if (size > perFile) {
            showToast(dropTooBig(f.name, size, perFile), 'error');
            continue;
        }
        if (used + size > HOST_DROP_BUDGET) {
            showToast(dropTooBig(f.name, size, HOST_DROP_BUDGET), 'error');
            break;
        }
        used += size;
        keep.push(f);
    }
    if (!keep.length) return;
    dispatchDroppedFiles(keep);
}

// 「导入文件」按钮：所有页面共用一个隐藏选择框，点哪一页的按钮就按哪一页的规则读
const pageImportInput = document.getElementById('pageImportInput');
let pageImportFor = '';
let pageImportSide = '';
document.querySelectorAll('[data-import-page]').forEach((btn) => {
    btn.addEventListener('click', () => {
        pageImportFor = btn.dataset.importPage || 'convert';
        pageImportSide = btn.dataset.importSide || '';
        pageImportInput.click();
    });
});
pageImportInput.addEventListener('change', () => {
    const file = pageImportInput.files && pageImportInput.files[0];
    try { pageImportInput.value = ''; } catch (err) { /* 有些环境不让改 file input 的值，不影响读取 */ }
    if (!file) return;
    const page = pageImportFor || currentPageId();
    if (page === 'navImage') { imgImportFile(file); return; }
    if (page === 'navQr' && qrMode === 'decode') { qrScanFiles([file]); return; }
    if (page === 'navSheet') { openSheetFile(file); return; }
    // 和拖入走同一套守门：图片 / 二进制表格指路到对应页面，别读成乱码
    const verdict = checkDropRoute([file.name]);
    if (!verdict.ok) { showToast(verdict.msg, 'error'); return; }
    importTextIntoPage(page, file, pageImportSide);
});

renderLangMenu();
applyI18n();
stripHostTooltips();
updateOutputLabel();
syncConvertActive();
clearError();
syncEditorModes();
syncEditorTheme();
requestAnimationFrame(() => {
    inputEditor.refresh();
    outputEditor.refresh();
});
