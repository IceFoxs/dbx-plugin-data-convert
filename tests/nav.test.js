/*
 * 导航顺序 / 置顶的纯函数回归 —— 排序规则全在 ui/js/nav.js，不碰 DOM。
 *
 *   node tests/nav.test.js
 */
'use strict';

const N = require('../ui/js/nav.js');

let passed = 0, failed = 0;
function check(name, fn) {
    try { fn(); passed++; console.log('  ok  ' + name); }
    catch (e) { failed++; console.error('  FAIL ' + name + '\n       ' + e.message); }
}
function eq(a, b, msg) {
    if (JSON.stringify(a) !== JSON.stringify(b)) {
        throw new Error((msg || '') + '\n  期望: ' + JSON.stringify(b) + '\n  实际: ' + JSON.stringify(a));
    }
}

const IDS = ['navCompare', 'navSql', 'navImage', 'navEscape', 'navBytes', 'navChart'];

console.log('\nnav.normalizeOrder');

check('没有存过：按页面顺序原样返回', () => {
    eq(N.normalizeOrder([], IDS), IDS);
    eq(N.normalizeOrder(null, IDS), IDS);
});

check('存过的顺序被采纳', () => {
    eq(N.normalizeOrder(['navChart', 'navCompare'], IDS),
        ['navChart', 'navCompare', 'navSql', 'navImage', 'navEscape', 'navBytes']);
});

check('页面里已删除的 id 被丢掉', () => {
    eq(N.normalizeOrder(['navGone', 'navSql', 'navCompare'], IDS),
        ['navSql', 'navCompare', 'navImage', 'navEscape', 'navBytes', 'navChart']);
});

check('新加的页面补在末尾，不打乱已有顺序', () => {
    eq(N.normalizeOrder(['navSql', 'navCompare'], ['navCompare', 'navSql', 'navNew']),
        ['navSql', 'navCompare', 'navNew']);
});

check('重复 / 空 / 非字符串的 id 被清理', () => {
    eq(N.normalizeOrder(['navSql', 'navSql', '', '  ', 42, null, 'navCompare'], IDS),
        ['navSql', 'navCompare', 'navImage', 'navEscape', 'navBytes', 'navChart']);
});

console.log('\nnav.effectiveOrder');

check('置顶项整体提到最前，其余保持相对顺序', () => {
    eq(N.effectiveOrder(IDS, ['navBytes', 'navSql']),
        ['navSql', 'navBytes', 'navCompare', 'navImage', 'navEscape', 'navChart']);
});

check('没有置顶项时顺序不变', () => {
    eq(N.effectiveOrder(IDS, []), IDS);
    eq(N.effectiveOrder(IDS, null), IDS);
});

check('置顶集里的陌生 id 不影响结果', () => {
    eq(N.effectiveOrder(IDS, ['navGhost']), IDS);
});

check('清空置顶后能回到纯自定义顺序', () => {
    const ordered = N.effectiveOrder(IDS, ['navChart', 'navBytes']);
    eq(ordered, ['navBytes', 'navChart', 'navCompare', 'navSql', 'navImage', 'navEscape']);
    eq(N.effectiveOrder(ordered, []), ['navBytes', 'navChart', 'navCompare', 'navSql', 'navImage', 'navEscape']);
});

console.log('\nnav.cleanPins');

check('只留还存在的置顶项，并按导航顺序重排', () => {
    eq(N.cleanPins(['navChart', 'navGhost', 'navSql'], IDS), ['navSql', 'navChart']);
    eq(N.cleanPins(['navChart', 'navSql'], IDS), ['navSql', 'navChart']);
});

check('置顶项为空 / 坏数据返回空数组', () => {
    eq(N.cleanPins([], IDS), []);
    eq(N.cleanPins(null, IDS), []);
});

console.log('\nnav.moveTo / moveBy');

check('上移一位、下移一位', () => {
    eq(N.moveBy(IDS, 'navImage', -1).slice(0, 3), ['navCompare', 'navImage', 'navSql']);
    eq(N.moveBy(IDS, 'navImage', 1).slice(1, 4), ['navSql', 'navEscape', 'navImage']);
});

check('已经在两头时原样返回', () => {
    eq(N.moveBy(IDS, 'navCompare', -1), IDS);
    eq(N.moveBy(IDS, 'navChart', 1), IDS);
});

check('挪到指定下标（拖放用）', () => {
    eq(N.moveTo(IDS, 'navChart', 0)[0], 'navChart');
    eq(N.moveTo(IDS, 'navCompare', 5), ['navSql', 'navImage', 'navEscape', 'navBytes', 'navChart', 'navCompare']);
});

check('越界下标被夹住，找不到的 id 不报错', () => {
    eq(N.moveTo(IDS, 'navChart', 999).slice(-1)[0], 'navChart');
    eq(N.moveTo(IDS, 'navChart', -3)[0], 'navChart');
    eq(N.moveTo(IDS, 'navGhost', 2), IDS);
    eq(N.moveTo(IDS, 'navSql', 1), IDS, '原地不动应当原样返回');
});

check('moveTo 不改原数组', () => {
    const copy = IDS.slice();
    N.moveTo(IDS, 'navChart', 0);
    eq(IDS, copy);
});

console.log('\nnav.togglePin');

check('第一次点置顶会加上，再点取消', () => {
    const pins = N.togglePin([], 'navSql');
    eq(pins, ['navSql']);
    eq(N.togglePin(pins, 'navSql'), []);
});

check('超出上限就原样返回（调用方靠长度判断）', () => {
    const full = ['navCompare', 'navSql', 'navImage', 'navEscape', 'navBytes', 'navChart'];
    eq(N.togglePin(full, 'navTime'), full);
    eq(N.togglePin(full, 'navSql').length, full.length - 1);
});

check('上限可调，默认 6 项', () => {
    eq(N.MAX_PINS, 6);
    eq(N.togglePin(['navCompare'], 'navSql', 2), ['navCompare', 'navSql']);
    eq(N.togglePin(['navCompare', 'navSql'], 'navImage', 2), ['navCompare', 'navSql']);
});

check('isPinned 认 set，也容忍空值与多余空格', () => {
    eq(N.isPinned(['navSql'], ' navSql '), true);
    eq(N.isPinned(['navSql'], 'navCompare'), false);
    eq(N.isPinned(null, 'navSql'), false);
});

console.log('\nnav.parsePrefs / serializePrefs');

check('没存过 / 空串 -> found=false', () => {
    eq(N.parsePrefs(null).found, false);
    eq(N.parsePrefs('').found, false);
    eq(N.parsePrefs('   ').found, false);
});

check('坏 JSON / 非对象 -> found=false，不抛错', () => {
    eq(N.parsePrefs('{oops').found, false);
    eq(N.parsePrefs('null').found, false);
    eq(N.parsePrefs('[1,2]').found, false);
    eq(N.parsePrefs('"navSql"').found, false);
});

check('正常读回顺序、置顶与吸顶', () => {
    const raw = JSON.stringify({ v: 1, order: ['navSql', 'navCompare'], pins: ['navSql'], sticky: true });
    const p = N.parsePrefs(raw);
    eq(p.found, true);
    eq(p.order, ['navSql', 'navCompare']);
    eq(p.pins, ['navSql']);
    eq(p.sticky, true);
});

check('字段类型不对时退回默认值', () => {
    const p = N.parsePrefs(JSON.stringify({ order: 'navSql', pins: { a: 1 }, sticky: 'yes' }));
    eq(p.found, true);
    eq(p.order, []);
    eq(p.pins, []);
    eq(p.sticky, false);
});

check('序列化后能原样读回', () => {
    const raw = N.serializePrefs({ order: ['navChart', 'navSql'], pins: ['navChart'], sticky: true });
    const back = N.parsePrefs(raw);
    eq(back.order, ['navChart', 'navSql']);
    eq(back.pins, ['navChart']);
    eq(back.sticky, true);
});

check('序列化会去掉重复与非法值', () => {
    const back = N.parsePrefs(N.serializePrefs({ order: ['navSql', 'navSql', ''], pins: null, sticky: 0 }));
    eq(back.order, ['navSql']);
    eq(back.pins, []);
    eq(back.sticky, false);
});

check('写回时保留这一版读不懂的新字段（旧版本不抹掉新版本的设置）', () => {
    const raw = JSON.stringify({ v: 2, order: ['navSql'], pins: [], sticky: false, groups: { a: 1 }, density: 'compact' });
    const p = N.parsePrefs(raw);
    eq(p.extra, { groups: { a: 1 }, density: 'compact' });
    const back = N.parsePrefs(N.serializePrefs(p));
    eq(back.extra, { groups: { a: 1 }, density: 'compact' });
    eq(back.order, ['navSql']);
});

check('扩展字段不能顶掉这一版的字段', () => {
    const back = N.parsePrefs(N.serializePrefs({
        order: ['navSql'], pins: ['navSql'], sticky: true,
        extra: { order: ['navGhost'], v: 9 }
    }));
    eq(back.order, ['navSql']);
    eq(back.pins, ['navSql']);
    eq(back.sticky, true);
});

console.log('\n--- nav: ' + passed + '/' + (passed + failed) + ' passed ---\n');
if (failed) process.exit(1);
