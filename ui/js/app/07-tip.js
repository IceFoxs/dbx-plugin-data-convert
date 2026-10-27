/* 07-tip.js — 图标按钮的悬浮提示（宿主里 title 不弹） */
// 3.8 图标按钮的悬浮提示
// =========================================
// 只有图标的按钮（收起 / 自定义导航 / 布局切换）没有文字说明，鼠标悬停时给一句话。
// 宿主是 WebView，原生 title 气泡不一定弹（也会被宿主补的英文提示占掉），所以自己画一个：
// 所有 [data-tip] 元素共用，文案取 data-tip，只写空属性时取 aria-label——aria-label
// 本来就是跟着语言变的，切语言不用再维护一份。
const tipEl = document.getElementById('tip');
let tipTimer = 0;
let tipTarget = null;
let tipPending = null;

function tipTextOf(el) {
    if (!el) return '';
    const own = el.getAttribute('data-tip');
    return (own && own.trim()) || el.getAttribute('aria-label') || '';
}

function tipPlace(el) {
    if (!tipEl) return;
    const box = el.getBoundingClientRect();
    const w = tipEl.offsetWidth;
    const h = tipEl.offsetHeight;
    const gap = 8;
    // 按钮上方放得下就放上面，放不下（顶栏按钮必然放不下）就贴到下面
    const above = box.top - h - gap >= 4;
    const rawX = box.left + box.width / 2;
    const x = Math.max(8 + w / 2, Math.min(window.innerWidth - 8 - w / 2, rawX));
    const y = above ? box.top - h - gap : box.bottom + gap;
    tipEl.style.left = Math.round(x) + 'px';
    tipEl.style.top = Math.round(y) + 'px';
    tipEl.classList.toggle('is-above', above);
    // 贴边被夹住时气泡不在按钮正下方了，三角要跟着挪过去指着按钮
    const arrow = Math.max(8, Math.min(w - 8, rawX - (x - w / 2)));
    tipEl.style.setProperty('--tip-arrow', Math.round(arrow) + 'px');
}

function tipShow(el) {
    if (!tipEl || !el) return;
    const text = tipTextOf(el);
    if (!text) return;
    tipTarget = el;
    tipPending = null;
    tipEl.textContent = text;
    tipEl.hidden = false;
    tipEl.classList.remove('show');
    // 原生 title 会再弹一个原生气泡，悬停期间先摘掉，离开时还回去
    if (el.hasAttribute('title')) {
        el.setAttribute('data-tip-title', el.getAttribute('title'));
        el.removeAttribute('title');
    }
    // 先摆位置再亮，避免看到气泡从左上角飞过来
    tipPlace(el);
    requestAnimationFrame(() => { if (tipTarget === el) tipEl.classList.add('show'); });
}

function tipHide() {
    clearTimeout(tipTimer);
    tipTimer = 0;
    tipPending = null;
    if (tipTarget && tipTarget.hasAttribute('data-tip-title')) {
        tipTarget.setAttribute('title', tipTarget.getAttribute('data-tip-title'));
        tipTarget.removeAttribute('data-tip-title');
    }
    tipTarget = null;
    if (!tipEl) return;
    tipEl.classList.remove('show');
    tipEl.hidden = true;
}

if (tipEl) {
    document.addEventListener('mouseover', (e) => {
        const el = e.target.closest && e.target.closest('[data-tip]');
        if (!el || el === tipTarget || el === tipPending) return;
        clearTimeout(tipTimer);
        tipPending = el;
        // 停一下再出：扫过去不算，免得一路都是气泡
        tipTimer = setTimeout(() => tipShow(el), 120);
    });
    document.addEventListener('mouseout', (e) => {
        const el = e.target.closest && e.target.closest('[data-tip]');
        if (!el) return;
        // 指针在按钮内部换到子元素不算离开
        if (e.relatedTarget && el.contains(e.relatedTarget)) return;
        tipHide();
    });
    // 键盘 Tab 过来也给提示
    document.addEventListener('focusin', (e) => {
        const el = e.target.closest && e.target.closest('[data-tip]');
        if (el) tipShow(el);
    });
    document.addEventListener('focusout', () => tipHide());
    // 位置会变的情况都收起来，别留一个飘在空中的气泡
    window.addEventListener('scroll', tipHide, true);
    window.addEventListener('resize', tipHide);
    document.addEventListener('click', tipHide);
}

// =========================================
