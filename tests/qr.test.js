/*
 * QR 页的纯函数回归 —— 编码走真库（qrcode-generator），不 mock。
 *
 *   node tests/qr.test.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const Q = require('../ui/js/qr.js');

// qrcode-generator 是「var qrcode = function(){…}()」的老式全局脚本，
// require 它拿不到东西，直接求值取全局函数。
const vendorSrc = fs.readFileSync(path.join(__dirname, '../ui/vendor/qrcode/qrcode.js'), 'utf8');
const qrlib = new Function(vendorSrc + '\nreturn qrcode;')();

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
function throwsCode(fn, code) {
    try { fn(); } catch (e) {
        if (e.code !== code) throw new Error('抛错 code=' + e.code + '，期望 ' + code);
        return;
    }
    throw new Error('没有抛错，期望 code=' + code);
}

console.log('\n== QR 纯函数 ==');

check('导出齐全', () => {
    ['splitItems', 'matrixOf', 'svgMarkup', 'drawToCanvas', 'tileLayout',
        'normalizeColor', 'clampInt', 'eccOf', 'utf8Length', 'contrast', 'fitDecodeSide']
        .forEach((k) => { if (typeof Q[k] !== 'function') throw new Error('缺 ' + k); });
    eq(Q.ECC.join(''), 'LMQH');
    eq(Object.keys(Q.BYTE_CAP).sort(), ['H', 'L', 'M', 'Q']);
});

check('UTF-8 字节数：ASCII / 中文 / emoji', () => {
    eq(Q.utf8Length('abc'), 3);
    eq(Q.utf8Length('访问量'), 9);
    eq(Q.utf8Length('📦'), 4);
    eq(Q.utf8Length('a📦b'), 6);
});

check('纠错级别容错', () => {
    eq(Q.eccOf('L'), 'L');
    eq(Q.eccOf('q'), 'Q');
    eq(Q.eccOf('x'), 'M');
    eq(Q.eccOf(null), 'M');
});

check('尺寸 / 边距夹取', () => {
    eq(Q.clampInt('300', 128, 1024, 256), 300);
    eq(Q.clampInt('1', 128, 1024, 256), 128);
    eq(Q.clampInt('99999', 128, 1024, 256), 1024);
    eq(Q.clampInt('abc', 128, 1024, 256), 256);
    eq(Q.clampInt('', 0, 8, 2), 2);
});

check('颜色规范化', () => {
    eq(Q.normalizeColor('#ABC'), '#aabbcc');
    eq(Q.normalizeColor('000000'), '#000000');
    eq(Q.normalizeColor('  #12ab34 '), '#12ab34');
    eq(Q.normalizeColor('#12345'), null);
    eq(Q.normalizeColor('red'), null);
    eq(Q.normalizeColor(''), null);
});

check('对比度：黑白最亮，同色最低', () => {
    const c = Q.contrast('#000000', '#ffffff');
    if (c < 20.9 || c > 21.1) throw new Error('黑白对比度 ' + c);
    eq(Q.contrast('#123456', '#123456'), 1);
});

check('批量切行：空行跳过，行号保留原位置', () => {
    const r = Q.splitItems('第一行\n\n第二行\n   \n第三行');
    eq(r.items.map((i) => i.text), ['第一行', '第二行', '第三行']);
    eq(r.items.map((i) => i.line), [1, 3, 5]);
    eq(r.dropped, { tooLong: 0, overflow: 0 });
});

check('批量切行：超容量 / 超条数分别计数', () => {
    const long = Q.splitItems('短\n' + 'x'.repeat(40), { maxBytes: 10 });
    eq(long.items.length, 1);
    eq(long.dropped.tooLong, 1);

    const many = Q.splitItems('a\nb\nc\nd', { maxItems: 2 });
    eq(many.items.length, 2);
    eq(many.dropped.overflow, 2);
});

check('批量切行：CRLF 与 BOM', () => {
    const r = Q.splitItems('\uFEFF甲\r\n乙\r\n');
    eq(r.items.map((i) => i.text), ['甲', '乙']);
});

check('整段一个：换行原样保留，只去掉首尾空行', () => {
    const r = Q.splitWhole('\n第一行\n第二行\n\n第三行\n\n');
    eq(r.items.length, 1);
    eq(r.items[0].text, '第一行\n第二行\n\n第三行');
    eq(r.items[0].line, 1);
});

check('整段一个：CRLF 归一成 LF', () => {
    eq(Q.splitWhole('甲\r\n乙').items[0].text, '甲\n乙');
});

check('整段一个：空内容没有条目', () => {
    eq(Q.splitWhole('   \n\n  ').items.length, 0);
    eq(Q.splitWhole('').items.length, 0);
});

check('整段一个：超容量按丢弃计数', () => {
    const r = Q.splitWhole('x'.repeat(50), { maxBytes: 10 });
    eq(r.items.length, 0);
    eq(r.dropped.tooLong, 1);
});

check('编码：版本 1 是 21 × 21，矩阵是 0/1', () => {
    const m = Q.matrixOf('hi', 'M', qrlib);
    eq(m.count, 21);
    eq(m.dark.length, 21 * 21);
    let bad = 0;
    for (let i = 0; i < m.dark.length; i++) if (m.dark[i] !== 0 && m.dark[i] !== 1) bad++;
    eq(bad, 0);
});

check('编码：三个定位图案的角上是深色', () => {
    const m = Q.matrixOf('hello', 'L', qrlib);
    const n = m.count;
    const at = (r, c) => m.dark[r * n + c];
    eq(at(0, 0), 1);                 // 左上外框
    eq(at(0, n - 1), 1);             // 右上
    eq(at(n - 1, 0), 1);             // 左下
    eq(at(7, 7), 0);                 // 切掉分隔带
    eq(at(0, 7), 0);                 // 定位图案右侧分隔列
});

check('编码：同样输入两次结果一致（无随机）', () => {
    const a = Array.from(Q.matrixOf('https://example.com/a', 'Q', qrlib).dark);
    const b = Array.from(Q.matrixOf('https://example.com/a', 'Q', qrlib).dark);
    eq(a, b);
});

check('编码：纠错级别越高模块越多', () => {
    const text = 'x'.repeat(100);
    const l = Q.matrixOf(text, 'L', qrlib).count;
    const h = Q.matrixOf(text, 'H', qrlib).count;
    if (!(h > l)) throw new Error('H(' + h + ') 应大于 L(' + l + ')');
});

check('编码：超出容量报 too-long', () => {
    throwsCode(() => Q.matrixOf('x'.repeat(Q.BYTE_CAP.H + 10), 'H', qrlib), 'too-long');
});

check('SVG：viewBox 含边距，尺寸听调用的', () => {
    const m = Q.matrixOf('hi', 'M', qrlib);
    const svg = Q.svgMarkup(m, { size: 320, margin: 2, dark: '#112233', light: '#ffffff' });
    if (svg.indexOf('viewBox="0 0 ' + (m.count + 4) + ' ' + (m.count + 4) + '"') < 0) {
        throw new Error('viewBox 不对：' + svg.slice(0, 160));
    }
    if (svg.indexOf('width="320"') < 0) throw new Error('width 没跟着 size');
    if (svg.indexOf('fill="#112233"') < 0) throw new Error('前景色没写进去');
    if (svg.indexOf('<path') < 0) throw new Error('没有 path');
    // 一条 path 就够：批量 200 张时 DOM 不能是「每模块一个 rect」
    eq((svg.match(/<path/g) || []).length, 1);
    eq((svg.match(/<rect/g) || []).length, 1);
});

check('SVG：边距 0 时 viewBox 等于模块数', () => {
    const m = Q.matrixOf('hi', 'M', qrlib);
    const svg = Q.svgMarkup(m, { size: 200, margin: 0 });
    if (svg.indexOf('viewBox="0 0 ' + m.count + ' ' + m.count + '"') < 0) throw new Error('边距 0 不对');
});

check('SVG：坏颜色回落到黑白', () => {
    const m = Q.matrixOf('hi', 'M', qrlib);
    const svg = Q.svgMarkup(m, { dark: 'red', light: '' });
    if (svg.indexOf('fill="#000000"') < 0) throw new Error('前景没回落到黑');
    if (svg.indexOf('fill="#ffffff"') < 0) throw new Error('背景没回落到白');
});

check('拼图：4 个码排成 2 × 2', () => {
    const t = Q.tileLayout(4, { size: 200, pad: 20, labelH: 0, maxCols: 4 });
    eq(t.cols, 2);
    eq(t.rows, 2);
    eq(t.width, 2 * 200 + 3 * 20);
    eq(t.height, 2 * 200 + 3 * 20);
});

check('拼图：5 个码 3 列 2 行，最后一行留空', () => {
    const t = Q.tileLayout(5, { size: 200, pad: 20, maxCols: 4 });
    eq(t.cols, 3);
    eq(t.rows, 2);
    eq(t.height, 2 * 200 + 3 * 20);
});

check('拼图：单张不铺满，仍然走同一个格子', () => {
    const t = Q.tileLayout(1, { size: 300, pad: 10 });
    eq([t.cols, t.rows], [1, 1]);
    eq(t.width, 300 + 20);
});

check('拼图：超像素上限自动缩码本体', () => {
    const t = Q.tileLayout(200, { size: 1024, pad: 24, maxCols: 4 });
    eq([t.cols, t.rows], [4, 50]);
    if (t.size >= 1024) throw new Error('没有缩小：' + t.size);
    if (t.width * t.height > Q.LIMITS.tilePixels) throw new Error('仍超上限：' + t.width * t.height);
    if (t.size < 64) throw new Error('缩得比 64 还小：' + t.size);
});

check('拼图：标签高度算进每格', () => {
    // 2 个码只给 1 列 -> 上下两格，每格多出来 30 px 标签
    const t = Q.tileLayout(2, { size: 200, pad: 0, labelH: 30, maxCols: 1 });
    eq(t.width, 200);
    eq(t.height, 2 * (200 + 30));
});

check('拼图：尺寸低于下限时按 128 兜底（不铺成 100 px）', () => {
    eq(Q.tileLayout(1, { size: 100, pad: 10 }).size, Q.LIMITS.size.min);
});

check('解码缩放：小图不放大', () => {
    const f = Q.fitDecodeSide(300, 200, 1600);
    eq([f.width, f.height, f.scale], [300, 200, 1]);
});

check('解码缩放：长边压到 1600，保持比例', () => {
    const f = Q.fitDecodeSide(4000, 2000, 1600);
    eq([f.width, f.height], [1600, 800]);
});

check('解码缩放：竖图按高度算', () => {
    const f = Q.fitDecodeSide(1200, 4800, 1600);
    eq([f.width, f.height], [400, 1600]);
});

/* ---------- 端到端：编码 -> 像素 -> 解码，中文必须原样回来 ---------- */

const jsQR = require('../ui/vendor/jsqr/jsQR.js');

/** 把模块矩阵摊成 RGBA 像素（每模块 scale 像素，四周留 margin 个静区） */
function rasterize(matrix, margin, scale) {
    const total = (matrix.count + margin * 2) * scale;
    const data = new Uint8ClampedArray(total * total * 4);
    for (let y = 0; y < total; y++) {
        for (let x = 0; x < total; x++) {
            const mc = Math.floor(x / scale) - margin;
            const mr = Math.floor(y / scale) - margin;
            const inside = mr >= 0 && mc >= 0 && mr < matrix.count && mc < matrix.count;
            const dark = inside && matrix.dark[mr * matrix.count + mc];
            const v = dark ? 0 : 255;
            const at = (y * total + x) * 4;
            data[at] = v;
            data[at + 1] = v;
            data[at + 2] = v;
            data[at + 3] = 255;
        }
    }
    return { data: data, width: total, height: total };
}

function roundTrip(text, ecc) {
    const matrix = Q.matrixOf(text, ecc || 'M', qrlib);
    const img = rasterize(matrix, 4, 4);
    const result = jsQR(img.data, img.width, img.height);
    return result ? String(result.data) : null;
}

check('往返：ASCII 原文不变', () => {
    eq(roundTrip('https://example.com/item/1001'), 'https://example.com/item/1001');
});

// 这条是用户报的「中文扫出来是乱码」的回归：库默认按 latin-1 取字节，
// 一个汉字被压成一个字节，扫码端解出来就是乱码。强制 UTF-8 后必须原样还原。
check('往返：中文原文不变', () => {
    eq(roundTrip('设备编号 DV-2048 · 机房 A-12'), '设备编号 DV-2048 · 机房 A-12');
});

check('往返：中英混排 + emoji 不变', () => {
    eq(roundTrip('访问量 12 次 📦 完成'), '访问量 12 次 📦 完成');
});

check('往返：四种纠错级别都能解回原文', () => {
    ['L', 'M', 'Q', 'H'].forEach((ecc) => {
        eq(roundTrip('批量二维码 ' + ecc, ecc), '批量二维码 ' + ecc, ecc + ' 级');
    });
});

/**
 * 中心图标在真实图片里是「白底 + 图标」，等于把中间一块模块抹白。
 * 这里按 svgMarkup 的同一套比例（图标 22% + 呼吸位）挖掉中心再解码，
 * 确认加了图标之后码还扫得出来——扫不出来比不显示图标更糟。
 */
function occludeCenter(matrix, margin, scale, ratio) {
    const img = rasterize(matrix, margin, scale);
    const total = matrix.count + margin * 2;
    const box = total * ratio;
    const pad = Math.max(0.6, box * 0.14);
    const cx = (total / 2) * scale;
    const half = (box / 2 + pad) * scale;
    for (let y = 0; y < img.height; y++) {
        if (Math.abs(y + 0.5 - cx) > half) continue;
        for (let x = 0; x < img.width; x++) {
            if (Math.abs(x + 0.5 - cx) > half) continue;
            const at = (y * img.width + x) * 4;
            img.data[at] = 255;
            img.data[at + 1] = 255;
            img.data[at + 2] = 255;
        }
    }
    return img;
}

check('图标遮挡：纠错 H 下中心被盖住仍能解回原文', () => {
    const text = 'https://example.com/visit?id=42';
    const m = Q.matrixOf(text, 'H', qrlib);
    const img = occludeCenter(m, 4, 6, 0.22);
    const r = jsQR(img.data, img.width, img.height);
    eq(r ? String(r.data) : null, text);
});

// 这条不是在考「能解」，而是把「为什么贴图标必须强制 H」钉住：
// 同样的遮挡下 L / M / Q 全都解不出来。哪天调小了图标比例让 M 也能过，
// 这条会失败，提醒回来重新评估「强制 H」还要不要。
check('图标遮挡：L / M / Q 下都解不出来（所以贴图标要强制 H）', () => {
    const text = 'https://example.com/visit?id=42';
    ['L', 'M', 'Q'].forEach((ecc) => {
        const m = Q.matrixOf(text, ecc, qrlib);
        const img = occludeCenter(m, 4, 6, 0.22);
        const r = jsQR(img.data, img.width, img.height);
        eq(r ? String(r.data) : null, null, ecc + ' 级');
    });
});

// 整段一个：换行必须真的进了码里，扫出来还是多行
check('往返：多行内容当成一个码，换行原样回来', () => {
    const text = '设备编号 DV-2048\n机房 A-12\n联系人 样例用户';
    eq(roundTrip(text, 'H'), text);
});

/* ---------- 中心图标 ---------- */

check('SVG：没有图标时不产生 image 标签', () => {
    const m = Q.matrixOf('hi', 'M', qrlib);
    const svg = Q.svgMarkup(m, { size: 200 });
    eq(svg.indexOf('<image'), -1);
});

check('SVG：带图标时垫白底 + 一张 image，位置居中', () => {
    const m = Q.matrixOf('hi', 'M', qrlib);
    const href = 'data:image/png;base64,iVBORw0KGgo=';
    const svg = Q.svgMarkup(m, { size: 200, iconHref: href, iconRatio: 0.22, light: '#ffffff' });
    if (svg.indexOf('<image') < 0) throw new Error('没有 image');
    if (svg.indexOf(href) < 0) throw new Error('href 没写进去');
    if (svg.indexOf('preserveAspectRatio="xMidYMid meet"') < 0) throw new Error('缺 preserveAspectRatio');
    // 图标底下先垫一块圆角白底，否则图标和码点糊在一起
    const rects = svg.match(/<rect/g) || [];
    eq(rects.length, 2);
});

check('SVG：非 data:image 的 href 直接忽略（不把外链写进导出文件）', () => {
    const m = Q.matrixOf('hi', 'M', qrlib);
    const svg = Q.svgMarkup(m, { size: 200, iconHref: 'https://example.com/a.png' });
    eq(svg.indexOf('<image'), -1);
});

check('SVG：图标比例有上下限', () => {
    const m = Q.matrixOf('hi', 'M', qrlib);
    const href = 'data:image/png;base64,AA==';
    const small = Q.svgMarkup(m, { size: 200, iconHref: href, iconRatio: 1 });
    const big = Q.svgMarkup(m, { size: 200, iconHref: href, iconRatio: 0.01 });
    const width = (svg) => Number(/<image[^>]*width="([\d.]+)"/.exec(svg)[1]);
    // 边距 2 → total = 21 + 2 * 2 = 25；比例 1 夹到 0.3，0.01 夹到 0.12
    eq(width(small), Number((25 * 0.3).toFixed(3)));
    eq(width(big), Number((25 * 0.12).toFixed(3)));
});

console.log('\n--- qr: ' + passed + '/' + (passed + failed) + ' passed ---\n');
process.exit(failed ? 1 : 0);
