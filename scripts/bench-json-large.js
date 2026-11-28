/* 一次性性能测量：4MB / 8MB JSON 在 CodeMirror 5 里的代价
 * 只用来自造数据，不含任何真实业务内容。
 * 用法：node scripts/bench-json-large.js [输入MB ...]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { JSDOM, VirtualConsole } = require(path.join(ROOT, 'node_modules/jsdom'));

const CM_JS = fs.readFileSync(path.join(ROOT, 'ui/vendor/codemirror/codemirror.min.js'), 'utf8');
const DBXJson = require(path.join(ROOT, 'ui/js/jsonfmt.js'));

function makeWin() {
    const vc = new VirtualConsole();
    vc.on('jsdomError', () => {});
    const dom = new JSDOM('<!doctype html><html><body><div id="host"></div></body></html>', {
        url: 'file://' + ROOT + '/ui/bench.html',
        runScripts: 'dangerously',
        pretendToBeVisual: true,
        virtualConsole: vc,
        beforeParse(win) {
            const zeroRect = () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 });
            const emptyRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} });
            win.Range.prototype.getBoundingClientRect = zeroRect;
            win.Range.prototype.getClientRects = emptyRects;
            win.Element.prototype.getBoundingClientRect = zeroRect;
            win.Element.prototype.getClientRects = emptyRects;
        }
    });
    const win = dom.window;
    win.eval(CM_JS);
    ['addon/fold/foldcode.min.js', 'addon/fold/foldgutter.min.js', 'addon/fold/brace-fold.min.js'].forEach((f) => {
        win.eval(fs.readFileSync(path.join(ROOT, 'ui/vendor/codemirror/' + f), 'utf8'));
    });
    win.eval(fs.readFileSync(path.join(ROOT, 'ui/vendor/codemirror/mode/javascript.min.js'), 'utf8'));
    return win;
}

/* 造数据：模拟接口返回，字段都是自造的中性词 */
function makeJson(targetBytes) {
    const rows = [];
    let i = 0;
    let size = 2;
    while (size < targetBytes) {
        const row = {
            id: 'ROW-' + String(++i).padStart(7, '0'),
            name: 'sample name ' + i,
            status: ['active', 'paused', 'done'][i % 3],
            amount: Number((i * 3.7).toFixed(2)),
            tags: ['alpha', 'beta', 'gamma'],
            nested: { lv1: { lv2: { flag: i % 2 === 0, note: 'ok-' + i } } }
        };
        const s = JSON.stringify(row);
        size += s.length + 2;
        rows.push(s);
    }
    return '{"items":[' + rows.join(',') + '],"total":' + rows.length + '}';
}

function makeEditor(win, opts) {
    const host = win.document.getElementById('host');
    host.innerHTML = '';
    const box = win.document.createElement('div');
    host.appendChild(box);
    const config = { value: '', mode: opts.mode, readOnly: 'nocursor', lineNumbers: true };
    if (opts.fold) {
        config.foldGutter = true;
        config.gutters = ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'];
        config.foldOptions = { rangeFinder: win.CodeMirror.fold.brace };
    }
    return win.CodeMirror(box, config);
}

const r1 = (x) => Math.round(x * 10) / 10;
const MB = 1024 * 1024;

(async function main() {
    const win = makeWin();
    const sizes = process.argv.slice(2).map(Number).filter(Boolean);
    const list = sizes.length ? sizes : [4, 8];

    for (const mb of list) {
        const raw = makeJson(mb * MB);
        console.log('\n=== 输入约 ' + mb + ' MB（字符 ' + (raw.length / MB).toFixed(2) + ' MB） ===');

        let t = Date.now();
        const res = DBXJson.format(raw, { indent: 2 });
        const out = res.text;
        console.log('  同步格式化         ' + r1(Date.now() - t) + ' ms → 输出 ' + (out.length / MB).toFixed(2) + ' MB / ' + res.stats.lines + ' 行');

        t = Date.now();
        let slices = 0;
        const r2 = await DBXJson.formatAsync(raw, { indent: 2 }, { sliceMs: 12, onProgress: () => { slices++; } });
        console.log('  分片格式化         ' + r1(Date.now() - t) + ' ms，进度回调 ' + slices + ' 次，结果一致=' + (r2.text.length === out.length));

        for (const mode of ['text/plain', 'application/json']) {
            const cm = makeEditor(win, { mode: mode });
            t = Date.now();
            cm.setValue(out);
            const setMs = Date.now() - t;
            t = Date.now();
            cm.getValue();
            const getMs = Date.now() - t;
            t = Date.now();
            cm.refresh();
            const refMs = Date.now() - t;

            // 视口里一次重绘要着色的量：按 200 行算
            t = Date.now();
            let tok = 0;
            for (let ln = 0; ln < 200; ln++) {
                try { tok += cm.getLineTokens(ln, true).length; } catch (e) { /* 越界忽略 */ }
            }
            const tokMs = Date.now() - t;
            console.log('  CM ' + mode.padEnd(17) + ' setValue ' + r1(setMs) + ' ms  getValue ' + r1(getMs) + ' ms  refresh ' + r1(refMs) + ' ms  着色200行 ' + r1(tokMs) + ' ms/' + tok + ' token');
        }

        // 输入编辑器：4MB 文本进 CM 后，敲一个字要付多少
        if (mb <= 4) {
            const host2 = win.document.getElementById('host');
            host2.innerHTML = '';
            const box = win.document.createElement('div');
            host2.appendChild(box);
            const cmIn = win.CodeMirror(box, {
                value: '', mode: 'application/json', lineWrapping: true,
                matchBrackets: true, styleActiveLine: true, foldGutter: true,
                gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter']
            });
            t = Date.now();
            cmIn.setValue(raw);
            console.log('  输入编辑器 setValue ' + r1(Date.now() - t) + ' ms（' + (raw.length / MB).toFixed(2) + ' MB 原文）');
            t = Date.now();
            for (let k = 0; k < 5; k++) cmIn.replaceRange('x', { line: 0, ch: 0 });
            console.log('  单次键入(含重绘)   ' + r1((Date.now() - t) / 5) + ' ms');
            t = Date.now();
            const v = cmIn.getValue();
            console.log('  getValue(全文)     ' + r1(Date.now() - t) + ' ms，长度 ' + v.length);
            t = Date.now();
            DBXJson.utf8Bytes(v);
            console.log('  utf8Bytes(全文)    ' + r1(Date.now() - t) + ' ms');
        }

        const cmFold = makeEditor(win, { mode: 'application/json', fold: true });
        t = Date.now();
        cmFold.setValue(out);
        console.log('  折叠槽版 setValue   ' + r1(Date.now() - t) + ' ms');
        t = Date.now();
        cmFold.refresh();
        console.log('  foldGutter 刷新     ' + r1(Date.now() - t) + ' ms');
        t = Date.now();
        cmFold.foldCode({ line: 0, ch: 0 }, cmFold.getOption('foldOptions'), 'fold');
        console.log('  折最外层            ' + r1(Date.now() - t) + ' ms');
    }
    process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
