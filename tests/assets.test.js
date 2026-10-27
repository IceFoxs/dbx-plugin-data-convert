/*
 * 宿主沙箱的资源接线检查。
 *
 * DBX 把插件页装进沙箱时，会用**正则**扫 index.html 收集所有 `<script src>` /
 * `<link rel="stylesheet" href>`，然后把对应文件内联进文档。所以：
 *   1. 只要正则扫到、文件不存在，整份 frame 文档就 400，页面直接打不开；
 *   2. 注释或 JS 字符串里写一个假的 `<script src="…">` 也会被扫到（真踩过）。
 * 这两条都只能靠测试守住，所以这里对着 index.html 的真实引用做一遍校验。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const UI = path.join(ROOT, 'ui');
const ENTRY = path.join(UI, 'index.html');

// 宿主 readAsset() 的上限
const HOST_ASSET_LIMIT = 8 * 1024 * 1024;

let pass = 0;
let fail = 0;

function check(name, fn) {
    try {
        fn();
        pass++;
        console.log('  ok   ' + name);
    } catch (err) {
        fail++;
        console.log('  FAIL ' + name + ' -> ' + err.message);
    }
}

function eq(a, b, label) {
    if (JSON.stringify(a) !== JSON.stringify(b)) {
        throw new Error((label || '') + ' 期望 ' + JSON.stringify(b) + '，实际 ' + JSON.stringify(a));
    }
}

const html = fs.readFileSync(ENTRY, 'utf8');
// 样式已从内联 <style> 搬到 ui/css/*.css（宿主把 <link> 内联回文档），
// 下面几条布局断言照着真实样式表跑
const css = fs.readdirSync(path.join(UI, 'css'))
    .filter((f) => /\.css$/.test(f))
    .sort()
    .map((f) => fs.readFileSync(path.join(UI, 'css', f), 'utf8'))
    .join('\n');

/** 与宿主 frameDocument() 完全一致的两条收集规则 */
function collectRefs(source) {
    const refs = [];
    for (const m of source.matchAll(/<script\b[^>]*?\bsrc\s*=\s*(["'])([^"']+)\1[^>]*>/gi)) {
        refs.push({ kind: 'script', url: m[2], at: m.index });
    }
    for (const m of source.matchAll(/<link\b([^>]*)>/gi)) {
        if (!/\brel\s*=\s*(["'])[^"']*\bstylesheet\b[^"']*\1/i.test(m[1])) continue;
        const href = m[1].match(/\bhref\s*=\s*(["'])([^"']+)\1/i);
        if (href) refs.push({ kind: 'style', url: href[2], at: m.index });
    }
    return refs;
}

const refs = collectRefs(html);

console.log('=== 宿主会内联的资源（' + refs.length + ' 个） ===');

check('每个 <script src> / <link href> 都指向真实存在的文件', () => {
    const missing = refs.filter((r) => !fs.existsSync(path.join(UI, r.url))).map((r) => r.url);
    eq(missing, [], '缺失的资源');
});

check('没有绝对路径 / 跳出 ui 目录的引用', () => {
    const bad = refs.filter((r) => path.isAbsolute(r.url) || r.url.split('/').includes('..') || /^[a-z]+:/i.test(r.url));
    eq(bad.map((r) => r.url), [], '非法引用');
});

check('每个资源都在宿主 8 MB 上限内', () => {
    const big = refs
        .map((r) => ({ url: r.url, size: fs.statSync(path.join(UI, r.url)).size }))
        .filter((x) => x.size > HOST_ASSET_LIMIT)
        .map((x) => x.url + '(' + Math.round(x.size / 1048576) + 'MB)');
    eq(big, [], '超过上限');
});

check('图表引擎的惰性副本标签在、且指向 vendor/echarts', () => {
    const holder = /<script[^>]*id="chartEngineSrc"[^>]*src="([^"]+)"/.exec(html);
    if (!holder) throw new Error('找不到 #chartEngineSrc 标签');
    eq(holder[1], 'vendor/echarts/echarts.min.js');
});

check('引擎文件本身没被挤掉（1 MB 上下）', () => {
    const size = fs.statSync(path.join(UI, 'vendor/echarts/echarts.min.js')).size;
    if (size < 500 * 1024) throw new Error('引擎文件太小：' + size + ' 字节，像是没拷进来');
    if (size > HOST_ASSET_LIMIT) throw new Error('引擎文件超过宿主上限');
});

check('注释 / 字符串里没有指向不存在文件的假标签', () => {
    // 上面第 1 条已经覆盖：正则扫到假标签、文件不存在就会被抓出来。
    // 这里额外确认 index.html 自身的 HTML 注释里没有 script/link 字样以外的花招。
    const commented = [];
    for (const m of html.matchAll(/<!--([\s\S]*?)-->/g)) {
        for (const r of collectRefs(m[1])) commented.push(r.url);
    }
    eq(commented, [], 'HTML 注释里的引用（宿主照样会去读）');
});

/* ---- 结果卡的内容截断：这条只能对样式做静态断言，jsdom 不做布局 ----
 * 踩过的坑：`max-height + overflow: hidden` 硬裁，第 4 行往后凭空消失，
 * 既没有省略号也不会滚，看上去就像「只生成了三行」。 */
function cssRule(selector) {
    const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(css))) {
        // 选择器前面可能挂着注释，会串进来，先摘掉
        const sel = strip(m[1]).split('\n').map((s) => s.trim()).filter(Boolean).join(' ');
        if (sel === selector) return strip(m[2]);
    }
    return null;
}

check('单张卡片的内容完整显示，不限行', () => {
    const rule = cssRule('.qr-grid.is-single .qr-card-text');
    if (!rule) throw new Error('找不到单张卡片的文字规则');
    if (!/display:\s*block/.test(rule)) throw new Error('还留着 -webkit-box，超出的行会被裁掉');
    if (/-webkit-line-clamp/.test(rule)) throw new Error('单张卡片还在限制行数');
    if (!/overflow-y:\s*(auto|scroll)/.test(rule)) throw new Error('超长内容要能滚，不能直接裁掉');
});

check('网格卡片截断时带省略号，别装成内容就这么多', () => {
    const rule = cssRule('.qr-card-text');
    if (!rule) throw new Error('找不到 .qr-card-text 规则');
    if (!/-webkit-line-clamp:\s*[1-9]/.test(rule)) throw new Error('缺少行数限制（要配省略号）');
    if (/(^|[;{\s])max-height\s*:/.test(rule)) throw new Error('又用 max-height 硬裁了，截断处不会出现省略号');
});

console.log('');
console.log('--- assets: ' + pass + '/' + (pass + fail) + ' passed ---');
if (fail) process.exit(1);
