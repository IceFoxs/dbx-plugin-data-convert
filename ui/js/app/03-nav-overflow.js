/* 03-nav-overflow.js — 导航溢出：装不下的项收进「更多」 */
// 3.5 导航溢出 → 收进「更多」
// =========================================
const navMoreEl = document.getElementById('navMore');
const navMoreTrigger = document.getElementById('navMoreTrigger');
const navMoreMenu = document.getElementById('navMoreMenu');
const navLinksEl = document.getElementById('navLinks');
// 左侧布局下整列的外壳：「格式转换」和下面那排都装在里面，一起定位、一起滚动
const navSideEl = document.getElementById('navSide');
const navConvertEl = document.getElementById('navConvert');
const navConvertTrigger = document.getElementById('navConvertTrigger');
const navConvertMenu = document.getElementById('navConvertMenu');
// 默认置顶：「JSON 对比」「SQL 转换」是主入口，优先留在导航条上。
// 用户可以在「导航设置」里改（见 3.7），这份只是出厂值。
const NAV_DEFAULT_PINS = ['navCompare', 'navSql'];

function navOverflow() {
    return navLinksEl.scrollWidth - navLinksEl.clientWidth > 1;
}

// 只取导航条上的直属项；「格式转换」下拉里的 7 个入口固定待在下拉里，
// 交给 layoutNav 搬来搬去会把下拉结构拆掉
function navLinkList() {
    return Array.prototype.slice.call(
        document.querySelectorAll('#navLinks > a, #navMoreMenu > a')
    );
}

// ---- 自定义顺序 / 置顶 / 吸顶的状态（排序规则全在 js/nav.js）----
const NAV_CUSTOM_KEY = 'navCustom';
const Nav = window.DBXNav || null;
let navOrder = [];                      // 用户排出来的顺序（置顶项在前）
let navPins = NAV_DEFAULT_PINS.slice(); // 置顶项
let navSticky = false;                  // 导航条吸顶
let navExtra = {};                      // 这一版读不懂的字段，原样存回去

// 出厂顺序 = DOM 里写的那一份（captureNavOrder 记下的 data-nav-idx）
function navDefaultOrder() {
    const list = navLinkList();
    // 运行时新加的项（以后新增页面）还没记序号，补一个排在原有的后面，
    // 否则缺失会当成 0，被排到最前面
    list.forEach((el, i) => {
        if (!el.hasAttribute('data-nav-idx')) el.setAttribute('data-nav-idx', String(1000 + i));
    });
    return list
        .slice()
        .sort((a, b) => Number(a.getAttribute('data-nav-idx') || 0) - Number(b.getAttribute('data-nav-idx') || 0))
        .map((el) => el.id)
        .filter(Boolean);
}

function navIsPinned(el) {
    return !!el && navPins.indexOf(el.id) >= 0;
}

// 左侧竖排：置顶项在列内滚动时粘在栏顶。sticky 的 top 要自己算，
// 否则多个置顶项会叠在同一行（jsdom 量不到高度，offsetHeight 为 0）
function navSyncPinnedSticky(links) {
    const leftMode = document.body.classList.contains('nav-left') && window.innerWidth > 768;
    let offset = 0;
    (links || []).forEach((el) => {
        const pinned = navIsPinned(el);
        el.classList.toggle('is-pinned', pinned);
        if (!leftMode || !pinned) {
            el.style.top = '';
            return;
        }
        el.style.top = Math.round(offset) + 'px';
        offset += el.offsetHeight || 0;
    });
}

// 首次布局时记下原始顺序，之后靠它复原
function captureNavOrder() {
    navLinkList().forEach((el, i) => {
        if (!el.hasAttribute('data-nav-idx')) el.setAttribute('data-nav-idx', String(i));
    });
}

function closeNavMore() {
    navMoreEl.classList.remove('open');
    navMoreTrigger.setAttribute('aria-expanded', 'false');
}

// 装得下就全部放回导航条；装不下就把末尾的项依次收进「更多」
function layoutNav() {
    // 顺序 = 用户排的那一份（置顶项已在最前）；没排过就按 DOM 顺序
    const rank = {};
    const order = navOrder.length ? navOrder : navDefaultOrder();
    order.forEach((id, i) => { rank[id] = i; });
    const rankOf = (el) => {
        const r = rank[el.id];
        return typeof r === 'number' ? r : 999 + Number(el.getAttribute('data-nav-idx') || 0);
    };
    const links = navLinkList().sort((a, b) => rankOf(a) - rankOf(b));
    navLinksEl.classList.remove('is-empty');
    links.forEach((el) => navLinksEl.appendChild(el));
    navMoreEl.classList.remove('show');
    closeNavMore();
    navSyncPinnedSticky(links);

    if (!links.length) return;
    // 左侧竖排：宽度固定、纵向滚动，横向永远不会溢出，也就没有「更多」
    // （窄屏会退回顶部布局，那时仍要走下面的溢出逻辑）
    if (document.body.classList.contains('nav-left') && window.innerWidth > 768) {
        syncNavLeftStack();
        return;
    }
    // 放得下就不用「更多」按钮（避免占位把内容挤出去）
    if (!navOverflow()) return;

    navMoreEl.classList.add('show');
    // 从末尾往外搬：先搬没置顶的，还不够再搬置顶的
    const queue = links.filter((el) => !navIsPinned(el)).reverse()
        .concat(links.filter((el) => navIsPinned(el)).reverse());
    const moved = [];
    let guard = 0;
    while (navOverflow() && queue.length && guard++ < 64) {
        const el = queue.shift();
        // 先塞进菜单（这样 scrollWidth 才会缩），顺序最后统一摆
        navMoreMenu.appendChild(el);
        moved.push(el);
    }
    // 菜单里的顺序必须跟导航条一致（置顶的仍在最前）：
    // 上面是从末尾往前搬的，这里按 rank 重新摆一遍
    moved.sort((a, b) => rankOf(a) - rankOf(b)).forEach((el) => navMoreMenu.appendChild(el));
    // 一项都没挪出去时不该出现空菜单
    if (!navMoreMenu.children.length) navMoreEl.classList.remove('show');
    // 导航条被搬空时收起这块空白，让「更多」贴着品牌走
    if (!navLinksEl.children.length) navLinksEl.classList.add('is-empty');
}

captureNavOrder();

// 左侧模式下「格式转换」占了左列顶部一块，导航条得跟着往下让出这块高度
// （顶部布局 / 窄屏不用管，CSS 里是 3.5rem，把 inline 值清掉即可）
// 左列现在是一整列 flex（#navSide），上下两块由排版自己排，
// 「按 #navConvert 的底边给 #navLinks 算 top」那套不用了：留着只会写一个无效的 top
function syncNavLeftStack() {
    if (navLinksEl) navLinksEl.style.top = '';
}
// 字体加载、下拉展开、切语言都会改这块的高度，盯住它比在某一刻量一次稳
function watchNavLeftStack() {
    if (typeof ResizeObserver !== 'function' || !navConvertEl) return;
    try {
        new ResizeObserver(() => syncNavLeftStack()).observe(navConvertEl);
    } catch (e) { /* 老宿主没有 ResizeObserver 就只靠手动调用 */ }
}
watchNavLeftStack();

function closeNavConvert() {
    navConvertEl.classList.remove('open');
    navConvertTrigger.setAttribute('aria-expanded', 'false');
    syncNavLeftStack();
}

function toggleNavConvert() {
    const open = navConvertEl.classList.toggle('open');
    navConvertTrigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    syncNavLeftStack();
}

// 按当前「从 / 转为」两个下拉，捞出对应的那一条
function syncConvertActive() {
    const sel = 'a[data-src="' + sourceFormat.value + '"][data-tgt="' + targetFormat.value + '"]';
    markConvertActive(navConvertMenu.querySelector(sel));
}

function markConvertActive(link) {
    navConvertMenu.querySelectorAll('a').forEach((el) => {
        el.classList.toggle('active', el === link);
    });
    navConvertEl.classList.toggle('active', !!link);
}

// 触发器上直接写当前这一对格式（yaml转properties），不用点开下拉才知道
const FORMAT_NAMES = {
    json: 'JSON', yaml: 'YAML', xml: 'XML', properties: 'Properties',
    toml: 'TOML', ini: 'INI', env: '.env', csv: 'CSV', tsv: 'TSV',
    query: 'Query', headers: 'Headers', cookie: 'Cookie', html: 'HTML'
};
// 窄屏那份用了缩写，长文案在 370px 的侧栏里放不下
const FORMAT_SHORT = {
    json: 'JSON', yaml: 'YAML', xml: 'XML', properties: 'Props',
    toml: 'TOML', ini: 'INI', env: '.env', csv: 'CSV', tsv: 'TSV',
    query: 'Query', headers: 'Hdrs', cookie: 'Cookie', html: 'HTML'
};
let navLabelTimer = null;
function updateConvertLabel() {
    const label = document.getElementById('navConvertLabel');
    const short = document.getElementById('navConvertShort');
    if (!label || !navConvertMenu) return;
    const src = sourceFormat.value;
    const tgt = targetFormat.value;
    const item = navConvertMenu.querySelector('a[data-src="' + src + '"][data-tgt="' + tgt + '"]');
    const text = item
        ? item.textContent.trim()
        // 下拉里没有这一对（例如点互换后变成 properties→yaml）时，用格式名拼一个
        : (FORMAT_NAMES[src] || src.toUpperCase()) + ' → ' + (FORMAT_NAMES[tgt] || tgt.toUpperCase());
    // 窄屏那份也要跟着变，否则只剩一个永远不变的「格式转换」
    const shortText = (FORMAT_SHORT[src] || src.toUpperCase()) + '→' + (FORMAT_SHORT[tgt] || tgt.toUpperCase());
    const changed = label.textContent !== text || (short && short.textContent !== shortText);
    label.textContent = text;
    if (short) short.textContent = shortText;
    navConvertTrigger.title = text;
    if (!changed) return;
    // 文字长短换了，导航条能塞下的项数也跟着变
    clearTimeout(navLabelTimer);
    navLabelTimer = setTimeout(layoutNav, 0);
}

let navResizeTimer = null;
window.addEventListener('resize', () => {
    clearTimeout(navResizeTimer);
    navResizeTimer = setTimeout(() => {
        layoutNav();
        syncNavLeftStack();
        // 跨过 768px 时左列有没有效会变，收起状态要重算（否则窄屏下栏被设成 inert）
        navApplyCollapsed();
    }, 80);
});
// 字体/样式就绪后宽度会变，再算一次
window.addEventListener('load', layoutNav);
if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => layoutNav()).catch(() => {});
}

navMoreTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = navMoreEl.classList.toggle('open');
    navMoreTrigger.setAttribute('aria-expanded', open ? 'true' : 'false');
});

navConvertTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleNavConvert();
});

document.addEventListener('click', (e) => {
    if (!navMoreEl.contains(e.target)) closeNavMore();
    if (!navConvertEl.contains(e.target)) closeNavConvert();
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeNavMore();
        closeNavConvert();
        if (typeof navClosePanel === 'function') navClosePanel();
        // 悬浮提示也一起收掉，别留一个气泡挂在屏幕上
        if (typeof tipHide === 'function') tipHide();
    }
});
