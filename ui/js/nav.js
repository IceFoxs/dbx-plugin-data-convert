/*
 * Navigation — pure ordering / pinning helpers, no DOM lookups.
 *
 * The nav bar holds a flat list of page links. Two things are configurable:
 *   order  which position each link takes（用户拖出来的顺序）
 *   pins   a set of links pulled to the front and never pushed into「更多」
 *
 * Both are stored as ids (the <a id="navXxx"> attribute), so a link that
 * disappears from the markup simply drops out of the saved list instead of
 * shifting everything after it.
 *
 * Loaded as a classic script (window.DBXNav) and as CommonJS in tests:
 *
 *   normalizeOrder(saved, ids)   saved ids + live ids -> full order (no holes)
 *   effectiveOrder(order, pins)  pins first, relative order kept
 *   cleanPins(pins, order)       drop pins that no longer exist
 *   moveTo(order, id, index)     id -> index (clamped, out of range = no-op)
 *   moveBy(order, id, delta)     id -> id ± delta
 *   togglePin(pins, id, maxPins) pin <-> unpin (capped)
 *   isPinned(pins, id)           membership test
 *   parsePrefs(raw)              stored JSON -> { order, pins, sticky, found }
 *   serializePrefs(prefs)        { order, pins, sticky } -> JSON
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.DBXNav = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var MAX_ITEMS = 64;   // 现在 11 项，留足余量；也防止坏数据把列表撑爆
    var MAX_PINS = 6;     // 置顶太多等于没置顶，导航条也挤不下
    var MAX_ID = 64;

    // 这一版认识的字段；其余字段当「未来版本的扩展」原样保留（见 parsePrefs）
    var RESERVED = { v: 1, order: 1, pins: 1, sticky: 1 };

    /** 任何输入 -> 干净的 id 数组（去空、去重、截断），顺序保留 */
    function idList(value) {
        var out = [];
        var seen = Object.create(null);
        var list = Array.isArray(value) ? value : [];
        for (var i = 0; i < list.length && out.length < MAX_ITEMS; i++) {
            var raw = list[i];
            if (typeof raw !== 'string') continue;
            var id = raw.trim();
            if (!id || id.length > MAX_ID) continue;
            if (seen[id]) continue;
            seen[id] = true;
            out.push(id);
        }
        return out;
    }

    /**
     * 存下来的顺序 + 当前页面里真实存在的 id -> 完整顺序。
     * 不存在的 id 丢掉（页面删了某个入口也不用迁移），新出现的 id 按 DOM 顺序补在末尾
     * （加新页面后不用用户手动排一次）。
     */
    function normalizeOrder(saved, ids) {
        var live = idList(ids);
        var known = Object.create(null);
        live.forEach(function (id) { known[id] = true; });
        var out = [];
        idList(saved).forEach(function (id) {
            if (known[id] && out.indexOf(id) < 0) out.push(id);
        });
        live.forEach(function (id) {
            if (out.indexOf(id) < 0) out.push(id);
        });
        return out;
    }

    /** 置顶项整体提到最前，其余保持相对顺序（稳定，不重排） */
    function effectiveOrder(order, pins) {
        var pinSet = Object.create(null);
        idList(pins).forEach(function (id) { pinSet[id] = true; });
        var head = [];
        var tail = [];
        idList(order).forEach(function (id) {
            (pinSet[id] ? head : tail).push(id);
        });
        return head.concat(tail);
    }

    /** 只留还存在的置顶项，顺序跟导航一致（避免面板里置顶项乱跳） */
    function cleanPins(pins, order) {
        var pos = Object.create(null);
        idList(order).forEach(function (id, i) { pos[id] = i; });
        return idList(pins)
            .filter(function (id) { return typeof pos[id] === 'number'; })
            .sort(function (a, b) { return pos[a] - pos[b]; });
    }

    /** 把 id 挪到 index；越界 / 找不到 / 原地不动都返回原顺序的副本 */
    function moveTo(order, id, index) {
        var list = idList(order);
        var at = list.indexOf(id);
        if (at < 0) return list;
        var to = Math.floor(Number(index));
        if (!isFinite(to)) return list;
        to = Math.max(0, Math.min(list.length - 1, to));
        if (to === at) return list;
        list.splice(at, 1);
        list.splice(to, 0, id);
        return list;
    }

    /** 上移 / 下移；到头了原样返回 */
    function moveBy(order, id, delta) {
        var list = idList(order);
        var at = list.indexOf(id);
        if (at < 0) return list;
        return moveTo(list, id, at + (Number(delta) || 0));
    }

    /** 置顶 <-> 取消；到上限就原样返回（调用方看长度有没有变就知道被挡住了） */
    function togglePin(pins, id, maxPins) {
        var list = idList(pins);
        if (typeof id !== 'string' || !id.trim()) return list;
        var key = id.trim();
        var at = list.indexOf(key);
        if (at >= 0) {
            list.splice(at, 1);
            return list;
        }
        var cap = typeof maxPins === 'number' && maxPins > 0 ? Math.min(maxPins, MAX_ITEMS) : MAX_PINS;
        if (list.length >= cap) return list;
        list.push(key);
        return list;
    }

    function isPinned(pins, id) {
        return idList(pins).indexOf(String(id || '').trim()) >= 0;
    }

    /** 存的一坨 JSON -> 归一后的偏好；坏数据当「没存过」处理，不抛错 */
    function parsePrefs(raw) {
        var out = { order: [], pins: [], sticky: false, found: false, extra: {} };
        if (typeof raw !== 'string' || !raw.trim()) return out;
        var parsed;
        try {
            parsed = JSON.parse(raw);
        } catch (e) {
            return out;
        }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return out;
        out.order = idList(parsed.order);
        out.pins = idList(parsed.pins);
        out.sticky = parsed.sticky === true || parsed.sticky === 1 || parsed.sticky === '1' || parsed.sticky === 'true';
        out.found = true;
        // 未来版本可能往里塞新字段（分组、图标、每项宽度…）。这一版读不懂，
        // 但原样留着再写回去，别让旧版本把新版本存的东西抹掉。
        Object.keys(parsed).forEach(function (k) {
            if (RESERVED[k]) return;
            out.extra[k] = parsed[k];
        });
        return out;
    }

    /** 反序列化再写回：v 是数据格式版本，extra 里是这一版读不懂但要保留的字段 */
    function serializePrefs(prefs) {
        var src = prefs && typeof prefs === 'object' ? prefs : {};
        var out = { v: 1 };
        var extra = src.extra && typeof src.extra === 'object' && !Array.isArray(src.extra) ? src.extra : {};
        Object.keys(extra).forEach(function (k) {
            if (RESERVED[k] || k === 'v') return;
            out[k] = extra[k];
        });
        out.order = idList(src.order);
        out.pins = idList(src.pins);
        out.sticky = src.sticky === true || src.sticky === 1 || src.sticky === '1' || src.sticky === 'true';
        return JSON.stringify(out);
    }

    return {
        MAX_ITEMS: MAX_ITEMS,
        MAX_PINS: MAX_PINS,
        normalizeOrder: normalizeOrder,
        effectiveOrder: effectiveOrder,
        cleanPins: cleanPins,
        moveTo: moveTo,
        moveBy: moveBy,
        togglePin: togglePin,
        isPinned: isPinned,
        parsePrefs: parsePrefs,
        serializePrefs: serializePrefs
    };
});
