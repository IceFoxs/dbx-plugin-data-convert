/* 08-nav-search.js — 功能搜索：中文 / 英文 / 近义词 / 拼音 / 首字母 */
// 3.9 功能搜索：中文 / 英文 / 近义词 / 拼音 / 首字母都能命中
// =========================================
// 左侧布局时它常驻顶栏中间那块空白；顶部布局没有空位，点放大镜或按 Ctrl/⌘+K 时
// 顶栏把导航那一行让出来放它（不再做浮层——浮层会压在工具栏上，挡着「从 / 转为」点不到）。
// 关键词表按页面写死：中文近义词 + 英文 + 全拼 + 首字母。比引一个拼音库靠谱，
// 也不会为了搜索再塞几十上百 KB 进来。
const navSearchWrap = document.getElementById('navSearchWrap');
const navSearchInput = document.getElementById('navSearchInput');
const navSearchListEl = document.getElementById('navSearchList');
const navSearchBtn = document.getElementById('navSearchBtn');

// 快捷键在 Windows / Linux 是 Ctrl+K，macOS 是 ⌘K：提示文案按平台说，
// 别在 macOS 上写 Ctrl、也别在 Windows 上写 ⌘。
const NAV_IS_MAC = /mac|iphone|ipad|ipod/i.test(
    String((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || navigator.userAgent || '')
);
const NAV_SEARCH_KEY = NAV_IS_MAC ? '⌘K' : 'Ctrl+K';

const NAV_SEARCH_ALIAS = {
    navCompare: {
        keys: ['对比', '比较', '差异', '区别', '不同', '变更', 'diff', 'compare', 'comparison', 'json diff'],
        py: 'duibi db bijiao bj chayi cy butong bt qubie changgeng'
    },
    navSql: {
        keys: ['sql', '建表', 'ddl', 'create table', '数据库', '表结构', 'mysql', 'postgres'],
        py: 'sql zhuanhuan zh jianbiao jb biaojiegou bjg shujuku sjk'
    },
    navImage: {
        keys: ['图片', '图像', '照片', '截图', 'base64', 'image', 'img', 'png', 'jpg'],
        py: 'tupian tp tuxiang tx zhaopian zp jietu jt base64'
    },
    navEscape: {
        keys: ['转义', 'escape', 'url 编码', 'urlencode', 'urldecode', 'unicode', 'html 实体', '编码', '解码'],
        py: 'zhuanyi zy gongju gj bianma bm jiema jm url escape unicode'
    },
    navBytes: {
        keys: ['字节', 'byte', 'bytes', '单位', '换算', '大小', 'kb', 'mb', 'gb'],
        py: 'zijie zj danwei dw huansuan hs daxiao dx'
    },
    navChart: {
        keys: ['图表', '图形', '可视化', '柱状图', '折线图', '饼图', 'chart', 'echarts'],
        py: 'tubiao tb tuxing tx keshihua ksh zhuzhuangtu zzt zhexian zx bingtu bt'
    },
    navTime: {
        keys: ['时间', '时间戳', '日期', '时刻', 'timestamp', 'date', 'unix', '毫秒', '秒'],
        py: 'shijian sj shijianchuo sjc shijiancuo riqi rq shike sk haomiao hm'
    },
    navQr: {
        keys: ['二维码', '扫码', '条码', '生成码', '识别', 'qr', 'qrcode'],
        py: 'erweima ewm saoma sm tiaoma tm shengchengma scm shibie sb'
    },
    navCodegen: {
        keys: ['代码', '结构体', '实体类', '模型', 'code', 'typescript', 'golang', 'java', 'python', 'class'],
        py: 'daima dm jiegouti jgt shiti st moxing mx shengcheng sc'
    },
    navSheet: {
        keys: ['表格', '转表格', '合并', 'excel', 'csv', 'xlsx', 'sheet', 'table'],
        py: 'biaoge bg hebing hb zhuanbiaoge zbg excel csv'
    },
    navQuery: {
        keys: ['查询', '校验', '过滤', '筛选', '断言', 'jsonpath', 'jq', 'schema'],
        py: 'chaxun cx jiaoyan jy guolv gl shaixuan sx duanyan dy'
    }
};

let navSearchResults = [];
let navSearchActive = 0;

// 页面名里出现过的汉字 -> [首字母, 全拼]。只收这十几个字就够：
// 名字里的汉字有限，手写一份比塞一整套拼音表（含多音字）划算得多。
// 这样「sj」「shijian」「sjzh」「erweima」「ewm」都是自动出来的，
// 以后改了菜单文案也不用手动补拼音——名字变了它自己跟着变。
const HANZI_SOUND = {
    '对': ['d', 'dui'], '比': ['b', 'bi'], '转': ['z', 'zhuan'], '换': ['h', 'huan'],
    '图': ['t', 'tu'], '片': ['p', 'pian'], '义': ['y', 'yi'], '工': ['g', 'gong'],
    '具': ['j', 'ju'], '字': ['z', 'zi'], '节': ['j', 'jie'], '时': ['s', 'shi'],
    '间': ['j', 'jian'], '二': ['e', 'er'], '维': ['w', 'wei'], '码': ['m', 'ma'],
    '代': ['d', 'dai'], '生': ['s', 'sheng'], '成': ['c', 'cheng'], '表': ['b', 'biao'],
    '格': ['g', 'ge'], '查': ['c', 'cha'], '询': ['x', 'xun'], '校': ['x', 'xiao'],
    '验': ['y', 'yan'], '文': ['w', 'wen'], '本': ['b', 'ben'], '数': ['s', 'shu'],
    '据': ['j', 'ju'], '编': ['b', 'bian'], '解': ['j', 'jie'], '合': ['h', 'he'],
    '并': ['b', 'bing'], '排': ['p', 'pai'], '序': ['x', 'xu'], '搜': ['s', 'sou'],
    '索': ['s', 'suo'], '压': ['y', 'ya'], '缩': ['s', 'suo'], '加': ['j', 'jia'],
    '密': ['m', 'mi'], '哈': ['h', 'ha'], '希': ['x', 'xi'], '签': ['q', 'qian']
};

/**
 * 从一个显示名生成拼音变体：
 *   「JSON 对比」-> 全拼 ['json','duibi','jsonduibi']，首字母 ['json','db','jsondb']
 *   「图片 Base64」-> 全拼 ['tupian','base64','tupianbase64']，首字母 ['tp','base64','tpbase64']
 * 拉丁词（json / base64）原样保留，这样「jsondb」「tpbase64」这种混排缩写也能命中。
 */
function navNameVariants(name) {
    const parts = String(name || '').toLowerCase().split(/\s+/).filter(Boolean);
    const py = [];
    const ini = [];
    let allPy = '';
    let allIni = '';
    parts.forEach((part) => {
        let wordPy = '';
        let wordIni = '';
        for (const ch of part) {
            const sound = HANZI_SOUND[ch];
            if (sound) {
                wordPy += sound[1];
                wordIni += sound[0];
            } else if (/[a-z0-9]/.test(ch)) {
                wordPy += ch;
                wordIni += ch;
            }
        }
        if (!wordPy) return;
        py.push(wordPy);
        ini.push(wordIni);
        allPy += wordPy;
        allIni += wordIni;
    });
    // 整串（跨词）的版本：sjzh / jsondb / tupianbase64
    if (py.length > 1) {
        py.push(allPy);
        ini.push(allIni);
    }
    return { py: py, ini: ini };
}

/**
 * 索引三类东西：
 *   page     导航里的 11 个页面
 *   convert  「格式转换」下拉里的 7 个方向（json转yaml 之类），选了就直接切到那一对
 *   format   工具栏「从 / 转为」两个下拉里的 13 种格式（TOML / CSV / Cookie …），
 *            搜 toml 也能直接选上，不用先切到格式转换页再翻下拉
 * 名字取当前语言的显示文本，拼音 / 首字母由名字现算，所以切语言后不用重新维护。
 */
function navSearchEntries() {
    const out = [];
    navLinkList().forEach((link) => {
        const alias = NAV_SEARCH_ALIAS[link.id] || { keys: [], py: '' };
        const name = (link.textContent || '').trim();
        const auto = navNameVariants(name);
        const py = [];
        String(alias.py || '').split(/\s+/).filter(Boolean).concat(auto.py).forEach((s) => {
            if (py.indexOf(s) < 0) py.push(s);
        });
        out.push({
            key: link.id,
            name: name,
            keys: alias.keys || [],
            py: py,
            ini: auto.ini.filter((s, i, arr) => arr.indexOf(s) === i),
            kind: 'page',
            el: link
        });
    });
    Array.prototype.forEach.call(document.querySelectorAll('#navConvertMenu a'), (a) => {
        const name = (a.textContent || '').trim();
        if (!name) return;
        const auto = navNameVariants(name);
        const src = String(a.dataset.src || '').toLowerCase();
        const tgt = String(a.dataset.tgt || '').toLowerCase();
        out.push({
            key: 'convert:' + src + '>' + tgt,
            name: name,
            // 方向本身也当关键词：输 json yaml、yaml json 都能出来
            keys: ['格式转换', '转换', '互转', '格式', 'converter', 'convert', 'format',
                src + ' ' + tgt, src + ' to ' + tgt, src + '2' + tgt],
            py: auto.py,
            ini: auto.ini.filter((s, i, arr) => arr.indexOf(s) === i),
            kind: 'convert',
            el: a,
            tag: navT('navConvert', '格式转换')
        });
    });
    // 工具栏两个下拉里的格式：名字带方向（从 TOML / 转为 TOML），
    // 否则两条一模一样的「TOML」分不清是改哪一边
    [['sourceSelect', 'fromLabel', '从'], ['targetSelect', 'toLabel', '转为']].forEach((pair) => {
        const box = document.getElementById(pair[0]);
        if (!box) return;
        const dir = t(pair[1], pair[2]);
        Array.prototype.forEach.call(box.querySelectorAll('.custom-option[data-value]'), (opt) => {
            const value = String(opt.dataset.value || '').toLowerCase();
            const label = String(opt.dataset.label || opt.textContent || '').trim();
            if (!value || !label) return;
            const auto = navNameVariants(label);
            out.push({
                key: 'format:' + pair[0] + ':' + value,
                name: dir + ' ' + label,
                // value 当关键词：选中的是下拉里的值，跟搜的词不一定是同一个写法（.env / env）
                keys: ['格式', 'format', value, label],
                py: auto.py,
                ini: auto.ini.filter((s, i, arr) => arr.indexOf(s) === i),
                kind: 'format',
                el: opt,
                value: value,
                box: pair[0],
                tag: dir
            });
        });
    });
    return out;
}

/**
 * 打分：显示名最优先，其次是关键词（近义词 / 英文），最后是拼音。
 * q 是原样（小写、保留空格），flat 是去掉空格的版本——「shi jian」和「shijian」一样命中。
 */
function navSearchScore(entry, q, flat) {
    const name = entry.name.toLowerCase();
    let best = 0;
    let hit = '';
    if (name === q) return { score: 100, hit: entry.name };
    if (name.indexOf(q) === 0) { best = 92; hit = entry.name; }
    else if (name.indexOf(q) >= 0) { best = 84; hit = entry.name; }
    entry.keys.forEach((key) => {
        const k = key.toLowerCase();
        if (k === q) { if (best < 78) { best = 78; hit = key; } }
        else if (k.indexOf(q) === 0) { if (best < 70) { best = 70; hit = key; } }
        else if (k.indexOf(q) >= 0) { if (best < 56) { best = 56; hit = key; } }
    });
    entry.py.forEach((syllables) => {
        // 首字母 / 全拼：单字（如 s）只认前缀，免得一按就满屏
        if (syllables === flat) { if (best < 74) { best = 74; hit = syllables; } }
        else if (syllables.indexOf(flat) === 0) { if (best < 66) { best = 66; hit = syllables; } }
        else if (flat.length > 1 && syllables.indexOf(flat) >= 0) { if (best < 44) { best = 44; hit = syllables; } }
    });
    (entry.ini || []).forEach((initials) => {
        // 首字母缩写（sj / ewm / jsondb / tpbase64）：整串优先，其次前缀
        if (initials === flat) { if (best < 72) { best = 72; hit = initials; } }
        else if (initials.indexOf(flat) === 0) { if (best < 64) { best = 64; hit = initials; } }
        else if (flat.length > 1 && initials.indexOf(flat) >= 0) { if (best < 46) { best = 46; hit = initials; } }
    });
    return { score: best > 0 ? best : 0, hit: hit || entry.name };
}

// 排序先分档再比分：11 个页面永远在前，其次是「格式转换」的方向，最后是下拉里的格式。
// 只靠扣分不行——输 json 时二级入口的「完全命中」会把页面挤到后面（用户报的乱序）
const NAV_KIND_RANK = { page: 0, convert: 1, format: 2 };

function navSearchRender() {
    if (!navSearchInput || !navSearchListEl) return;
    const q = navSearchInput.value.trim().toLowerCase();
    navSearchListEl.textContent = '';
    navSearchResults = [];
    navSearchActive = 0;
    if (!q) {
        navSearchClose();
        return;
    }
    const flat = q.replace(/\s+/g, '');
    const scored = [];
    navSearchEntries().forEach((entry) => {
        const got = navSearchScore(entry, q, flat);
        if (got.score > 0) scored.push({ entry: entry, score: got.score, hit: got.hit });
    });
    // 同档同分保持导航顺序（sort 是稳定的，这里不用再补比较）
    scored.sort((a, b) => {
        const ra = NAV_KIND_RANK[a.entry.kind] || 0;
        const rb = NAV_KIND_RANK[b.entry.kind] || 0;
        return ra === rb ? b.score - a.score : ra - rb;
    });
    // 二级入口限量：11 个页面才是主要结果，方向最多 3 条、格式最多 4 条
    let convertUsed = 0;
    let formatUsed = 0;
    navSearchResults = scored.filter((item) => {
        if (item.entry.kind === 'convert') {
            if (convertUsed >= 3) return false;
            convertUsed += 1;
            return true;
        }
        if (item.entry.kind === 'format') {
            if (formatUsed >= 4) return false;
            formatUsed += 1;
            return true;
        }
        return true;
    }).slice(0, 8);

    if (!navSearchResults.length) {
        const empty = document.createElement('li');
        empty.className = 'nav-search-empty';
        empty.textContent = navT('navSearchEmpty', '没有匹配的功能');
        navSearchListEl.appendChild(empty);
    } else {
        navSearchResults.forEach((item, i) => {
            const li = document.createElement('li');
            li.className = 'nav-search-item' + (i === 0 ? ' is-active' : '');
            li.id = 'navSearchOpt' + i;
            li.setAttribute('role', 'option');
            li.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
            li.dataset.navSearchKey = item.entry.key;
            const name = document.createElement('span');
            name.className = 'ns-name';
            name.textContent = item.entry.name;
            li.appendChild(name);
            // 命中的是近义词 / 拼音时，右侧标一下「凭什么出现在这」。
            // 格式项的名字本来就带方向（从 TOML），再标一遍命中词只是重复
            const hit = String(item.hit || '');
            let hintText = '';
            if (item.entry.kind === 'convert') hintText = item.entry.tag || '';
            else if (item.entry.kind === 'page' && hit && hit.toLowerCase() !== item.entry.name.toLowerCase()) hintText = hit;
            if (hintText) {
                const hint = document.createElement('span');
                hint.className = 'ns-hit';
                hint.textContent = hintText;
                li.appendChild(hint);
            }
            navSearchListEl.appendChild(li);
        });
        navSearchInput.setAttribute('aria-activedescendant', 'navSearchOpt0');
    }
    navSearchListEl.hidden = false;
    navSearchInput.setAttribute('aria-expanded', 'true');
}

function navSearchClose(keepValue) {
    if (!navSearchListEl || !navSearchInput) return;
    navSearchListEl.hidden = true;
    navSearchListEl.textContent = '';
    navSearchResults = [];
    navSearchActive = 0;
    navSearchInput.setAttribute('aria-expanded', 'false');
    navSearchInput.removeAttribute('aria-activedescendant');
    if (!keepValue) navSearchInput.value = '';
    const wasSearching = document.body.classList.contains('nav-searching');
    document.body.classList.remove('nav-searching');
    if (navSearchBtn) navSearchBtn.setAttribute('aria-expanded', 'false');
    // 导航那一行刚回到顶栏，宽度要重新量一遍再决定收哪几项进「更多」
    if (wasSearching && typeof layoutNav === 'function') layoutNav();
}

// 打开搜索：顶部布局下顶栏把导航那一行让出来（CSS 里 body.nav-searching 负责），
// 搜索框始终在顶栏里，不会有任何东西浮到页面或工具栏上面
function navSearchOpen() {
    if (!navSearchWrap || !navSearchInput) return;
    document.body.classList.add('nav-searching');
    if (navSearchBtn) navSearchBtn.setAttribute('aria-expanded', 'true');
    navSearchInput.focus();
    navSearchInput.select();
    if (navSearchInput.value.trim()) navSearchRender();
}

// 放大镜按钮的文案：跟着语言走，并把当前平台的快捷键写进去（macOS ⌘K / 其它 Ctrl+K）
function navSyncSearchLabel() {
    if (navSearchBtn) {
        const label = navT('navSearchTitle', '搜索功能') + ' (' + NAV_SEARCH_KEY + ')';
        navSearchBtn.setAttribute('aria-label', label);
    }
    if (navSearchInput) {
        navSearchInput.setAttribute('aria-keyshortcuts', NAV_IS_MAC ? 'Meta+K' : 'Control+K');
        // placeholder 尾巴上标一下快捷键，省得用户永远不知道有这条捷径
        const base = navT('navSearchPlaceholder', '');
        if (base) navSearchInput.placeholder = base + '  ' + NAV_SEARCH_KEY;
    }
}

function navSearchPick(key) {
    const row = navSearchResults.filter((item) => item.entry.key === key)[0];
    const entry = row ? row.entry : null;
    const el = entry ? entry.el : document.getElementById(key);
    navSearchClose();
    if (navSearchInput) navSearchInput.blur();
    if (!el) return;
    // 格式项：先退出其它页回到格式转换页（下拉在那儿才看得见），再点它自己那个选项，
    // 选中高亮 + change + 重新转换都走 custom-select 原来的链路
    if (entry && entry.kind === 'format') {
        if (typeof exitOtherModes === 'function') exitOtherModes('');
        el.click();
        return;
    }
    // 页面 / 转换方向：直接调导航自己的点击处理，不再依赖「合成 click 冒泡到顶栏那条委托」。
    // 宿主是 Tauri WebView，合成点击不一定被委托收到，表现就是「回车 / 点一下，搜索框收了但页面没跳」。
    if (typeof handleNavClick === 'function') {
        handleNavClick(el);
        if (typeof closeNavMore === 'function') closeNavMore();
        if (typeof closeNavConvert === 'function') closeNavConvert();
        return;
    }
    el.click();
}

function navSearchMark() {
    Array.prototype.forEach.call(navSearchListEl.children, (li, i) => {
        const on = i === navSearchActive;
        li.classList.toggle('is-active', on);
        if (li.hasAttribute('role')) li.setAttribute('aria-selected', on ? 'true' : 'false');
        if (on && navSearchInput) {
            navSearchInput.setAttribute('aria-activedescendant', li.id);
            if (li.scrollIntoView) li.scrollIntoView({ block: 'nearest' });
        }
    });
}

function navSearchMove(delta) {
    if (!navSearchResults.length) return;
    const total = navSearchResults.length;
    navSearchActive = (navSearchActive + delta + total) % total;
    navSearchMark();
}

if (navSearchInput) {
    navSearchInput.addEventListener('input', navSearchRender);
    navSearchInput.addEventListener('focus', () => {
        if (navSearchInput.value.trim()) navSearchRender();
    });
    navSearchInput.addEventListener('keydown', (e) => {
        // 输入法正在上屏（中文 / 日文）：这一下方向键、回车都是给候选词窗的，
        // 抢过来就会「按回车想选字，结果整个搜索框没了」。等 compositionend 之后再说。
        if (e.isComposing || e.keyCode === 229) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            navSearchMove(1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            navSearchMove(-1);
        } else if (e.key === 'Enter') {
            const item = navSearchResults[navSearchActive];
            if (!item) return;
            e.preventDefault();
            navSearchPick(item.entry.key);
        } else if (e.key === 'Escape') {
            // Esc 一律收起（列表一并收，导航回到顶栏），别让它冒到「关其它面板」那层
            e.stopPropagation();
            navSearchClose();
        }
    });
}

if (navSearchListEl) {
    navSearchListEl.addEventListener('click', (e) => {
        const li = e.target.closest('[data-nav-search-key]');
        if (li) navSearchPick(li.dataset.navSearchKey);
    });
    // 鼠标划到哪一条，键盘高亮就跟到哪一条，回车不会打开「另外一条」
    navSearchListEl.addEventListener('mouseover', (e) => {
        const li = e.target.closest('[data-nav-search-key]');
        if (!li) return;
        const idx = navSearchResults.findIndex((it) => it.entry.key === li.dataset.navSearchKey);
        if (idx >= 0 && idx !== navSearchActive) {
            navSearchActive = idx;
            navSearchMark();
        }
    });
}

// 点顶栏以外的地方收起。顶栏里的按钮（语言、导航设置、布局切换）不算「点别处」——
// 边搜索边切语言是很正常的事，别把正打的词弄丢。
document.addEventListener('click', (e) => {
    if (!navSearchWrap || navSearchWrap.contains(e.target)) return;
    const bar = document.querySelector('.topbar');
    if (bar && bar.contains(e.target)) return;
    if (navSearchListEl && !navSearchListEl.hidden) navSearchClose();
    else if (document.body.classList.contains('nav-searching')) navSearchClose();
});

// 入口按钮：已经开着就收起，没开就打开
if (navSearchBtn) {
    navSearchBtn.addEventListener('click', (e) => {
        // 别让 document 上那个「点别处收起」跟着跑一遍，否则点开就立刻被关上
        e.stopPropagation();
        const open = document.body.classList.contains('nav-searching');
        if (open && document.activeElement === navSearchInput) navSearchClose();
        else navSearchOpen();
    });
}

// Ctrl+K（Windows / Linux）/ ⌘K（macOS）：两个修饰键都认，提示文案按平台显示
document.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey) || String(e.key).toLowerCase() !== 'k') return;
    if (!navSearchInput || !navSearchWrap) return;
    e.preventDefault();
    navSearchOpen();
});

// 布局一切换，浮层就没有存在的理由了（左侧布局有自己的位置）
if (navToggleBtn) navToggleBtn.addEventListener('click', () => navSearchClose());

function applyI18n() {
    // SQL 页与导航下拉的文案各放一张小表（见第 8 节 / 上面），这里合并进来查，
    // 免得把 14 套大字典再撑一圈
    const dict = Object.assign(
        {},
        currentDict,
        NAV_I18N[currentLang] || NAV_I18N.en || {},
        SQL_I18N[currentLang] || SQL_I18N.en || {},
        SHEET_I18N[currentLang] || SHEET_I18N.en || {},
        IMG_I18N[currentLang] || IMG_I18N.en || {},
        GEN_I18N[currentLang] || GEN_I18N.en || {},
        QUERY_I18N[currentLang] || QUERY_I18N.en || {},
        ESC_I18N[currentLang] || ESC_I18N.en || {},
        BYTES_I18N[currentLang] || BYTES_I18N.en || {},
        TIME_I18N[currentLang] || TIME_I18N.en || {},
        CHART_I18N[currentLang] || CHART_I18N.en || {},
        QR_I18N[currentLang] || QR_I18N.en || {},
        FLOW_I18N[currentLang] || FLOW_I18N.en || {}
    );
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (dict[key]) el.textContent = dict[key];
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (dict[key]) el.placeholder = dict[key];
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        if (dict[key]) el.title = dict[key];
    });

    const diffBtn = document.getElementById('toggleDiffBtn');
    if (diffBtn) {
        if (diffBtn.classList.contains('btn-diff')) {
            diffBtn.textContent = currentDict.diffExitBtn || 'Exit Compare';
        } else {
            diffBtn.textContent = currentDict.diffBtn || 'Compare';
        }
    }

    updateOutputLabel();
    // 文案长度随语言变化，重新决定收哪几项进「更多」
    if (typeof layoutNav === 'function') layoutNav();
    // 导航位置切换按钮的 title / aria-label 也跟着语言走
    if (typeof navSyncToggleLabel === 'function') navSyncToggleLabel();
    // 导航设置按钮与（开着的）面板文案
    if (typeof refreshNavPanelI18n === 'function') refreshNavPanelI18n();
    // SQL 页的提示语是按当前语言拼出来的，切语言后重算一次
    if (typeof refreshSqlI18n === 'function') refreshSqlI18n();
    // 表格页的文件信息 / 提示语同理
    if (typeof refreshSheetI18n === 'function') refreshSheetI18n();
    // 图片页的格式后缀、占位符、右上角按钮都是拼出来的
    if (typeof refreshImgI18n === 'function') refreshImgI18n();
    // 代码生成页的页签、占位符、统计文案同理
    if (typeof refreshCodeI18n === 'function') refreshCodeI18n();
    // 查询页的两个子页（表达式提示、结果统计）与转义页的类型 chip
    if (typeof refreshQueryI18n === 'function') refreshQueryI18n();
    if (typeof refreshEscI18n === 'function') refreshEscI18n();
    // 字节转换页的列头、三种写法标题、提示语
    if (typeof refreshBytesI18n === 'function') refreshBytesI18n();
    // 时间转换页的格式 chip、字段标签、提示语
    if (typeof refreshTimeI18n === 'function') refreshTimeI18n();
    // 图表页的提示语与占位符
    if (typeof refreshChartI18n === 'function') refreshChartI18n();
    // 二维码页的卡片序号、解码状态、提示语
    if (typeof refreshQrI18n === 'function') refreshQrI18n();
    // 搜索按钮的文案与 placeholder 尾巴上的快捷键（要放在 placeholder 那一轮之后）
    navSyncSearchLabel();
    // 正在搜的话，结果里的名字是上一门语言，重算一遍；否则会中英混排
    if (navSearchInput && navSearchInput.value.trim() && navSearchListEl && !navSearchListEl.hidden) navSearchRender();
}

// 宿主（DBX）会给没写 title 的按钮补一个提示，用的却是宿主自己的词表：
// 界面明明是中文，鼠标停在「粘贴」上却弹出英文 "Paste"，还正好挡住旁边的「选择图片」。
// 插件里的按钮都带可见文字，tooltip 只是重复一遍，所以统一摘掉；只有两种情况保留：
//   1. 我们自己写了 data-i18n-title（文案跟着插件语言走）；
//   2. 标了 data-keep-title（title 是动态内容，比如导出按钮显示格式与文件名）。
function stripHostTooltips() {
    const sel = 'button[title]:not([data-i18n-title]):not([data-keep-title])';
    const sweep = () => document.querySelectorAll(sel).forEach((el) => el.removeAttribute('title'));
    sweep();
    // 宿主也可能等鼠标移上去才补：捕获阶段先摘一次，原生提示就来不及显示
    document.addEventListener('pointerover', (e) => {
        const el = e.target && e.target.closest ? e.target.closest(sel) : null;
        if (el) el.removeAttribute('title');
    }, true);
    // 加载后再补的情况由观察器兜住；只监听 title 一个属性，成本可以忽略
    if (typeof MutationObserver === 'function') {
        new MutationObserver(sweep).observe(document.documentElement, {
            subtree: true,
            attributes: true,
            attributeFilter: ['title']
        });
    }
}

// =========================================
