/* 05-nav-layout.js — 顶部 ⇄ 左侧布局，偏好四级持久化 */
// =========================================
// 3.6 导航位置：顶部（默认）⇄ 左侧，偏好持久化
// =========================================
// DBX 工作台是 opaque origin 的沙箱，localStorage 会直接抛 SecurityError，
// 跨会话记忆只能靠宿主的 window.dbxPlugin.storage（需 host.storage 权限，
// 初始化后看 capabilities.storage）。所以做成四级：
//   宿主 storage（沙箱里唯一能跨会话记住的）
//   → 浏览器 localStorage（浏览器预览）
//   → window.name（dev 宿主：没有 storage，localStorage 也抛，但同一 frame 刷新后还在）
//   → 只在本会话生效
const NAV_PREF_KEY = 'navLayout';
const navToggleBtn = document.getElementById('navToggle');
const navCollapseBtn = document.getElementById('navCollapse');
let navLeft = false;
// 左列是否收起：只在左侧布局 + 宽屏下真正生效，状态跟顺序 / 置顶一起存
let navCollapsed = false;

// ---- 四级存储：下面这组读写由「导航布局」和「导航自定义」共用 ----
// 一个 key 一个字符串：布局存 'left' / 'top'，自定义存一段 JSON
function prefReadLocal(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
}
function prefWriteLocal(key, value) {
    // 沙箱里这里必然抛，忽略即可，宿主存储才是真正生效的那一路
    try { localStorage.setItem(key, value); } catch (e) { /* noop */ }
}
// 再兜一层 window.name：opaque origin 的沙箱里 localStorage / cookie 全抛
// SecurityError，但 window.name 不受同源限制，同一个 frame 反复刷新也还在
// （dev 宿主每个标签页就是一个 srcdoc iframe，重载只换内容不换元素）。
// token 形如 dbx-nav:left / dbx-navc:%7B...，值做 URL 编码，不然 JSON 里的空格会把 token 切断
function prefNameEscape(tag) {
    return tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function prefNameGet(tag) {
    try {
        const m = String(window.name || '').match(new RegExp('(?:^|\\s)' + prefNameEscape(tag) + '([^\\s]*)'));
        return m ? decodeURIComponent(m[1]) : null;
    } catch (e) { return null; }
}
function prefNameSet(tag, value) {
    try {
        const rest = String(window.name || '').split(/\s+/)
            .filter((t) => t && t.indexOf(tag) !== 0).join(' ');
        window.name = (rest ? rest + ' ' : '') + tag + encodeURIComponent(value);
    } catch (e) { /* noop */ }
}
function navHostStore() {
    const api = window.dbxPlugin;
    if (!api || !api.storage) return null;
    if (!(api.capabilities || {}).storage) return null;
    return api.storage;
}
async function prefHostGet(key) {
    try {
        const api = window.dbxPlugin;
        if (!api) return null;
        // capabilities 与 storage 都要等 init 消息（ready）之后才挂好
        if (api.ready && typeof api.ready.then === 'function') await api.ready;
        const store = navHostStore();
        if (!store) return null;
        return await store.get(key);
    } catch (e) { return null; }
}
async function prefHostSet(key, value) {
    try {
        const api = window.dbxPlugin;
        if (!api) return;
        if (api.ready && typeof api.ready.then === 'function') await api.ready;
        const store = navHostStore();
        if (store) await store.set(key, value);
    } catch (e) { /* 旧宿主 / 未授权：静默降级，不打扰用户 */ }
}

function navReadLocal() {
    const v = prefReadLocal(NAV_PREF_KEY);
    return v === 'left' || v === 'top' ? v : null;
}
function navWriteLocal(v) { prefWriteLocal(NAV_PREF_KEY, v); }
function navReadName() {
    const v = prefNameGet('dbx-nav:');
    return v === 'left' || v === 'top' ? v : null;
}
function navWriteName(v) { prefNameSet('dbx-nav:', v); }
async function navReadHost() {
    const v = await prefHostGet(NAV_PREF_KEY);
    return v === 'left' || v === 'top' ? v : null;
}
async function navWriteHost(v) { await prefHostSet(NAV_PREF_KEY, v); }

function navSyncToggleLabel() {
    if (!navToggleBtn) return;
    const label = navLeft
        ? navT('navToggleToTop', '切换到顶部导航')
        : navT('navToggleToLeft', '切换到左侧导航');
    navToggleBtn.setAttribute('aria-label', label);
    // 宿主会给没 title 的按钮塞自己的提示词，这个要留着自己的
    navToggleBtn.title = label;
}

/**
 * 收起 / 展开左列：只改一个 body 类，宽度与位移全交给 CSS。
 * 顶部布局（或窄屏，≤768px 用顶部布局）下收起没有意义，
 * 类要摘掉——否则切回顶部时栏还是藏着的。
 */
function navApplyCollapsed() {
    // 窄屏走顶部布局，CSS 里的左列规则根本不生效，这时候不能把栏设成 inert
    const hidden = navLeft && navCollapsed && window.innerWidth > 768;
    document.body.classList.toggle('nav-collapsed', hidden);
    // 整列现在是同一个容器（#navSide），标记一次就够，不用挨个标里面的块
    if (navSideEl) {
        // 收起的栏只是视觉上滑出去，不加 inert 的话 Tab / 读屏还能进去
        if (hidden) {
            navSideEl.setAttribute('inert', '');
            navSideEl.setAttribute('aria-hidden', 'true');
        } else {
            navSideEl.removeAttribute('inert');
            navSideEl.removeAttribute('aria-hidden');
        }
    }
    if (!navCollapseBtn) return;
    const label = hidden ? navT('navExpand', '展开侧边栏') : navT('navCollapse', '收起侧边栏');
    navCollapseBtn.setAttribute('aria-label', label);
    navCollapseBtn.title = label;
    navCollapseBtn.setAttribute('aria-expanded', hidden ? 'false' : 'true');
}

// ---- 自定义顺序 / 置顶 / 吸顶的读写 ----
// 存的是 { v, order, pins, sticky, … }：v 是数据格式版本，以后加了新字段
// （分组、密度之类）旧版本也要原样带着走，不能一保存就把新版本的设置抹了
function navSavePrefs() {
    const raw = Nav
        ? Nav.serializePrefs({ order: navOrder, pins: navPins, sticky: navSticky, collapsed: navCollapsed, extra: navExtra })
        : JSON.stringify({ order: navOrder, pins: navPins, sticky: navSticky, collapsed: navCollapsed });
    prefWriteLocal(NAV_CUSTOM_KEY, raw);
    prefNameSet('dbx-navc:', raw);
    prefHostSet(NAV_CUSTOM_KEY, raw);
}

// 读回一份偏好：陌生的 id 丢掉、新加的导航项接在末尾（见 Nav.normalizeOrder）
function navAdoptPrefs(raw) {
    const prefs = Nav ? Nav.parsePrefs(raw) : { found: false };
    if (!prefs.found) {
        navOrder = navDefaultOrder();
        navPins = NAV_DEFAULT_PINS.slice();
        navSticky = false;
        navCollapsed = false;
        navExtra = {};
    } else {
        navOrder = Nav.normalizeOrder(prefs.order, navDefaultOrder());
        navPins = Nav.cleanPins(prefs.pins, navOrder);
        navSticky = !!prefs.sticky;
        // 老版本存的 JSON 里没有这个字段 -> 展开，行为跟升级前一致
        navCollapsed = !!prefs.collapsed;
        navExtra = prefs.extra || {};
    }
    document.body.classList.toggle('nav-sticky', !!navSticky);
    navApplyCollapsed();
}

// 任何一次改动都走这里：归一 -> 应用 -> 三个来源一起存
function navCommit() {
    if (Nav) {
        navOrder = Nav.normalizeOrder(navOrder, navDefaultOrder());
        navPins = Nav.cleanPins(navPins, navOrder);
        // 置顶项必须落在最前：新置顶的夹在中间，这里一并提上去
        navOrder = Nav.effectiveOrder(navOrder, navPins);
    }
    document.body.classList.toggle('nav-sticky', !!navSticky);
    navApplyCollapsed();
    layoutNav();
    syncNavLeftStack();
    navSavePrefs();
}

function navApplyLayout() {
    document.body.classList.toggle('nav-left', navLeft);
    navSyncToggleLabel();
    // 顶部布局下「收起」不成立，这里要跟着摘掉收起类（否则切回来还是藏着的）
    navApplyCollapsed();
    // 横排 / 竖排换了，谁该收进「更多」也要重算
    layoutNav();
    syncNavLeftStack();
}

if (navToggleBtn) {
    navToggleBtn.addEventListener('click', () => {
        navLeft = !navLeft;
        const pref = navLeft ? 'left' : 'top';
        navWriteLocal(pref);
        navWriteName(pref);
        navWriteHost(pref);
        navApplyLayout();
    });
}

if (navCollapseBtn) {
    navCollapseBtn.addEventListener('click', () => {
        navCollapsed = !navCollapsed;
        // 跟顺序 / 置顶存在同一份偏好里，跨会话记住
        navCommit();
    });
}

// 先按同步来源恢复（localStorage / window.name），避免闪一下顶部
const navLocalPref = navReadLocal() || navReadName();
if (navLocalPref) navLeft = navLocalPref === 'left';
// 顺序 / 置顶 / 吸顶同样先取同步来源，宿主存储到手后再覆盖一次
navAdoptPrefs(prefReadLocal(NAV_CUSTOM_KEY) || prefNameGet('dbx-navc:'));
if (navLeft) {
    document.body.classList.add('nav-left');
    // 先量一次，别让导航条和「格式转换」叠在一起闪一下
    syncNavLeftStack();
}
navSyncToggleLabel();

// 宿主存储是权威来源：沙箱里只有它能在重开 / 重启后记住
navReadHost().then((v) => {
    if (!v) return;
    const want = v === 'left';
    if (want === navLeft) return;
    navLeft = want;
    navApplyLayout();
}).catch(() => {});

// 自定义顺序也以宿主存储为准（换设备 / 重装后跟着账号走）
prefHostGet(NAV_CUSTOM_KEY).then((raw) => {
    if (!raw || !Nav) return;
    if (!Nav.parsePrefs(raw).found) return;
    navAdoptPrefs(raw);
    layoutNav();
    syncNavLeftStack();
}).catch(() => {});

// =========================================
