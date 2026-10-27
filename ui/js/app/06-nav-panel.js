/* 06-nav-panel.js — 导航设置面板：顺序 / 置顶 / 吸顶 / 拖动排序 */
// 3.7 导航设置面板：自定义顺序 / 置顶 / 吸顶
// =========================================
const navCustomizeBtn = document.getElementById('navCustomize');
const navPanelMask = document.getElementById('navPanelMask');
const navPanelList = document.getElementById('navPanelList');
const navPanelCloseBtn = document.getElementById('navPanelClose');
const navPanelDoneBtn = document.getElementById('navPanelDone');
const navPanelResetBtn = document.getElementById('navPanelReset');
const navStickyToggleEl = document.getElementById('navStickyToggle');
// 拖拽靠自己跟 pointer 事件（见下方 navPanelList 那段注释），这里只记状态
const navDrag = { id: '', row: null, startY: 0, active: false, pointerId: null };

const NAV_ICON = {
    pin: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>',
    up: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>',
    down: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>'
};

function navSyncCustomizeLabel() {
    if (!navCustomizeBtn) return;
    const label = navT('navCustomize', '自定义导航');
    navCustomizeBtn.setAttribute('aria-label', label);
    // 宿主会给没 title 的按钮塞自己的提示词，这个要留着自己的
    navCustomizeBtn.title = label;
}

function navPanelButton(act, id, label, icon) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nv-btn nv-btn-' + act;
    btn.dataset.navAct = act;
    btn.dataset.navFor = id;
    // title 是动态的（置顶 / 取消置顶），别被宿主的提示清理扫掉
    btn.setAttribute('data-keep-title', '');
    btn.setAttribute('aria-label', label);
    btn.title = label;
    btn.innerHTML = icon;
    return btn;
}

// 行内容按当前顺序重画：置顶的排在最前（navOrder 本身就保持这个不变量）
function navPanelRender() {
    if (!navPanelList) return;
    const base = navOrder.length ? navOrder : navDefaultOrder();
    // 以后新增的页面还没进过用户顺序，这里现补到末尾，面板里马上能排
    const ids = Nav ? Nav.normalizeOrder(base, navDefaultOrder()) : base;
    const pinnedCount = ids.filter((id) => navPins.indexOf(id) >= 0).length;
    navPanelList.textContent = '';
    ids.forEach((id, i) => {
        const link = document.getElementById(id);
        if (!link) return;
        const pinned = navPins.indexOf(id) >= 0;
        const row = document.createElement('li');
        row.className = 'nv-row' + (pinned ? ' is-pinned' : '');
        row.dataset.navRow = id;
        // 不走 HTML5 拖放：DBX 宿主（Tauri 的 WebView）把原生拖放接管了，
        // 页面的 dragstart / dragover 收不到，行拖不动也就没有落点（见下方 pointer 那段）
        row.draggable = false;

        const grip = document.createElement('span');
        grip.className = 'nv-grip';
        grip.setAttribute('aria-hidden', 'true');
        grip.textContent = '⠿';
        row.appendChild(grip);

        const name = document.createElement('span');
        name.className = 'nv-name';
        name.textContent = link.textContent.trim();
        row.appendChild(name);

        const pinBtn = navPanelButton('pin', id,
            pinned ? navT('navUnpin', '取消置顶') : navT('navPin', '置顶'), NAV_ICON.pin);
        pinBtn.classList.toggle('on', pinned);
        pinBtn.setAttribute('aria-pressed', pinned ? 'true' : 'false');
        row.appendChild(pinBtn);

        const up = navPanelButton('up', id, navT('navMoveUp', '上移'), NAV_ICON.up);
        const down = navPanelButton('down', id, navT('navMoveDown', '下移'), NAV_ICON.down);
        // 置顶块与非置顶块之间不靠箭头跨（用置顶按钮切），其余到两头就禁用
        up.disabled = i === 0 || (!pinned && i === pinnedCount);
        down.disabled = i === ids.length - 1 || (pinned && i === pinnedCount - 1);
        row.appendChild(up);
        row.appendChild(down);

        navPanelList.appendChild(row);
    });
    if (navStickyToggleEl) navStickyToggleEl.checked = !!navSticky;
}

function navPanelMove(id, delta) {
    if (!Nav) return;
    navOrder = Nav.moveBy(navOrder.length ? navOrder : navDefaultOrder(), id, delta);
    navCommit();
    navPanelRender();
}

function navPanelTogglePin(id) {
    if (!Nav) return;
    const wasPinned = Nav.isPinned(navPins, id);
    if (!wasPinned && navPins.length >= Nav.MAX_PINS) {
        showToast(navT('navPinFull', '最多置顶 {n} 项').replace('{n}', String(Nav.MAX_PINS)), 'error');
        return;
    }
    navPins = Nav.togglePin(navPins, id, Nav.MAX_PINS);
    navCommit();
    navPanelRender();
}

function navOpenPanel() {
    if (!navPanelMask) return;
    navPanelRender();
    navPanelMask.hidden = false;
    if (navPanelDoneBtn) navPanelDoneBtn.focus();
}
function navClosePanel() {
    // 拖拽中途按 Esc / 点遮罩关面板：先把 document 上的指针监听收掉，
    // 否则松手时会对着已经不在屏幕上的行提交一次顺序
    if (navDrag.row && typeof navDragEnd === 'function') navDragEnd();
    if (!navPanelMask || navPanelMask.hidden) return;
    navPanelMask.hidden = true;
    // 关掉后把焦点送回入口，键盘用户不会掉到 body 上
    if (navCustomizeBtn && typeof navCustomizeBtn.focus === 'function') navCustomizeBtn.focus();
}
// 切语言后：按钮提示和（开着的）面板文案都跟着重画
function refreshNavPanelI18n() {
    navSyncCustomizeLabel();
    // 收起 / 展开按钮的提示语也在小表里，跟着当前语言重画
    navApplyCollapsed();
    if (navPanelMask && !navPanelMask.hidden) navPanelRender();
}

if (navCustomizeBtn) navCustomizeBtn.addEventListener('click', () => { navOpenPanel(); });
if (navPanelMask) {
    // 点遮罩空白处关闭（点面板内部不关）
    navPanelMask.addEventListener('click', (e) => {
        if (e.target === navPanelMask) navClosePanel();
    });
}
[navPanelCloseBtn, navPanelDoneBtn].forEach((btn) => {
    if (btn) btn.addEventListener('click', navClosePanel);
});
if (navPanelResetBtn) {
    navPanelResetBtn.addEventListener('click', () => {
        navOrder = navDefaultOrder();
        navPins = NAV_DEFAULT_PINS.slice();
        navSticky = false;
        navCollapsed = false;
        navCommit();
        navPanelRender();
        showToast(navT('navResetDone', '导航已恢复默认'), 'success');
    });
}
if (navStickyToggleEl) {
    navStickyToggleEl.addEventListener('change', () => {
        navSticky = !!navStickyToggleEl.checked;
        navCommit();
    });
}

if (navPanelList) {
    navPanelList.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-nav-act]');
        if (!btn || btn.disabled) return;
        const id = btn.dataset.navFor;
        const act = btn.dataset.navAct;
        if (act === 'pin') navPanelTogglePin(id);
        else if (act === 'up') navPanelMove(id, -1);
        else if (act === 'down') navPanelMove(id, 1);
    });

    // 拖拽排序：自己跟 pointer 事件，不用 HTML5 拖放。
    // DBX 是 Tauri 应用，原生拖放由 WebView 层接管（同一个原因让文件拖入也得走宿主
    // onDragState），页面里既收不到 dragstart 也收不到 drop —— 行设为 draggable 在浏览器
    // 里能拖，在宿主里就是「拖不动」。这里改成 pointerdown / move / up：鼠标、触屏、
    // 手写笔同一套，宿主拦不拦都无所谓。拖动中直接挪 DOM（视觉即时），松手再按 DOM 落库。
    const NAV_DRAG_EVT = window.PointerEvent
        ? { down: 'pointerdown', move: 'pointermove', up: 'pointerup', cancel: 'pointercancel' }
        : { down: 'mousedown', move: 'mousemove', up: 'mouseup', cancel: '' };

    // 同一条拖拽里，置顶块和非置顶块之间不许互相插队（跨块用置顶按钮切）
    function navDragSameGroup(row) {
        const a = navDrag.id;
        const b = row && row.dataset ? row.dataset.navRow : '';
        if (!a || !b) return false;
        if (!Nav) return true;
        return Nav.isPinned(navPins, a) === Nav.isPinned(navPins, b);
    }

    // 按指针的 y 找落点：第一行「中线」在指针下方就插到它前面，都不满足就贴到同组末尾
    function navDragPlace(y) {
        const row = navDrag.row;
        if (!row) return;
        const rows = Array.prototype.slice.call(navPanelList.children)
            .filter((el) => el !== row && navDragSameGroup(el));
        let before = null;
        for (let i = 0; i < rows.length; i++) {
            const rect = rows[i].getBoundingClientRect();
            if (y < rect.top + rect.height / 2) { before = rows[i]; break; }
        }
        if (before) {
            if (row.nextElementSibling !== before) navPanelList.insertBefore(row, before);
            return;
        }
        const last = rows.length ? rows[rows.length - 1] : null;
        if (!last) return;
        const after = last.nextElementSibling;
        if (after !== row) navPanelList.insertBefore(row, after);
    }

    // 指针贴近列表上下沿就滚一点，行多的时候也能拖到看不见的地方
    function navDragAutoScroll(y) {
        const rect = navPanelList.getBoundingClientRect();
        if (!rect || rect.height <= 0) return;
        if (y < rect.top + 20) navPanelList.scrollTop -= 12;
        else if (y > rect.bottom - 20) navPanelList.scrollTop += 12;
    }

    function navDragMove(e) {
        if (!navDrag.row) return;
        // 多点触控时只跟当初按下的那根手指
        if (navDrag.pointerId !== null && typeof e.pointerId === 'number' && e.pointerId !== navDrag.pointerId) return;
        const y = e.clientY;
        if (!navDrag.active) {
            // 差几个像素才算拖：单纯点一下（想点按钮、想触摸滚动）不该被当成排序
            if (Math.abs(y - navDrag.startY) < 4) return;
            navDrag.active = true;
            navDrag.row.classList.add('dragging');
            document.body.classList.add('nv-sorting');
        }
        if (e.cancelable) e.preventDefault();
        navDragPlace(y);
        navDragAutoScroll(y);
    }

    function navDragEnd(e) {
        // 别的指头松开不算（Esc 关闭面板时是手动调用，没有 event）
        if (e && navDrag.pointerId !== null && typeof e.pointerId === 'number' && e.pointerId !== navDrag.pointerId) return;
        document.removeEventListener(NAV_DRAG_EVT.move, navDragMove, true);
        document.removeEventListener(NAV_DRAG_EVT.up, navDragEnd, true);
        if (NAV_DRAG_EVT.cancel) document.removeEventListener(NAV_DRAG_EVT.cancel, navDragEnd, true);
        const row = navDrag.row;
        const moved = navDrag.active;
        navDrag.row = null;
        navDrag.id = '';
        navDrag.active = false;
        navDrag.pointerId = null;
        document.body.classList.remove('nv-sorting');
        if (row) row.classList.remove('dragging');
        if (!moved) return;
        const list = Array.prototype.map.call(navPanelList.children, (el) => el.dataset.navRow);
        if (list.length) navOrder = list;
        navCommit();
        // 重画一次：箭头禁用状态、置顶块的边框都跟着新顺序走
        navPanelRender();
    }

    navPanelList.addEventListener(NAV_DRAG_EVT.down, (e) => {
        // 只认左键 / 主指针；按钮上的按下留给 click
        if (typeof e.button === 'number' && e.button !== 0) return;
        const row = e.target.closest('.nv-row');
        if (!row || e.target.closest('button')) return;
        // 触屏只认抓手：整行都能拖的话，列表滚动就没了
        if (e.pointerType === 'touch' && !e.target.closest('.nv-grip')) return;
        if (navDrag.row) navDragEnd();
        navDrag.row = row;
        navDrag.id = row.dataset.navRow;
        navDrag.startY = e.clientY;
        navDrag.active = false;
        navDrag.pointerId = typeof e.pointerId === 'number' ? e.pointerId : null;
        // 挂在 document 上并走捕获：指针滑出面板（甚至出窗口）也能收到 up，不会卡在「拖拽中」
        document.addEventListener(NAV_DRAG_EVT.move, navDragMove, true);
        document.addEventListener(NAV_DRAG_EVT.up, navDragEnd, true);
        if (NAV_DRAG_EVT.cancel) document.addEventListener(NAV_DRAG_EVT.cancel, navDragEnd, true);
    });
}

// =========================================
