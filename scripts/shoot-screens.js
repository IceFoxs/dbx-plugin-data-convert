#!/usr/bin/env node
// README 截图：1440×900、1x、亮色，逐页装好内容再抓，拍完直接写进 docs/。
//
//   node scripts/shoot-screens.js            全部 12 张
//   node scripts/shoot-screens.js screen-qr  只拍一张（名字见下面 SHOTS）
//
// 装内容一律走页面自己的入口（loadTextIntoConvert / putTextIntoPage /
// pageImportTargets），不去摸 CodeMirror 实例——那些实例是各文件顶层的 const，
// 外部拿不到，改了注入方式就会静默拍出空编辑器。
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs');
const PAGE = 'file://' + path.join(ROOT, 'ui', 'index.html');
const W = 1440;
const H = 900;
const PORT = 9407;

const CHROME = process.env.CHROME || [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
].find((p) => fs.existsSync(p));

if (!CHROME) {
    console.error('没找到 Chrome / Chromium，可以用 CHROME=/path/to/chrome 指定');
    process.exit(1);
}

const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------- 样本内容 ------------------------------- */
/* 全部是自造数据，别换成真实接口返回 / 真实表字段 */

const JOIN = (lines) => lines.join('\n');

const CONVERT_JSON = JOIN([
    '{',
    '  "id": 1001,',
    '  "title": "测试数据",',
    '  "author": {',
    '    "name": "张三",',
    '    "email": "zhangsan@example.com"',
    '  },',
    '  "tags": ["admin", "editor", "viewer"],',
    '  "metadata": {',
    '    "createdAt": "2023-10-27T10:00:00Z",',
    '    "version": 1.2,',
    '    "isActive": true',
    '  }',
    '}'
]);

const SQL_LINES = JOIN([
    'ORD-20240301-001', 'ORD-20240301-002', 'ORD-20240302-007', 'ORD-20240303-011',
    'ORD-20240304-023', 'ORD-20240305-031', 'ORD-20240306-004', 'ORD-20240306-018',
    'ORD-20240307-009', 'ORD-20240308-012', 'ORD-20240309-026', 'ORD-20240310-033',
    'ORD-20240311-041', 'ORD-20240312-052'
]);

const TIME_LINES = JOIN([
    '1709251200',
    '2024-03-01 08:30:00',
    '2024-03-01T09:15:00+08:00',
    '1709294400000',
    '2024-03-01T02:40:00Z'
]);

const QR_LINES = JOIN([
    'https://example.com/items/1001',
    'https://example.com/items/1002',
    'https://example.com/items/1003',
    'https://example.com/items/1004',
    'https://example.com/items/1005',
    'https://example.com/items/1006'
]);

// 混着中文与 & 才看得出转义前后差别
const ESC_TEXT = 'https://dbx.test/api?q=中文关键词&page=1';

// 故意混四种写法：纯数字、带单位、1024 制、字节序列（最后一行能出三种表示）
const BYTES_TEXT = JOIN([
    '1234567890',
    '1.5 GB',
    '734003200',
    '1f 8b 08 00 00 00 00 00 00 03'
]);

/* -------------------------------- 注入脚本 -------------------------------- */

const HELPERS = `(() => {
    window.__put = function (page, text) {
        if (page === 'convert') {
            loadTextIntoConvert(text, 'sample.json', false, 'json');
            return 'convert';
        }
        const t = pageImportTargets(page);
        if (!t) return 'no-target';
        putTextIntoPage(t, text);
        return 'ok';
    };
    // 提示气泡会定格在截图里
    window.__clean = function () {
        document.querySelectorAll('.toast').forEach(function (n) { n.remove(); });
        const box = document.getElementById('toastContainer');
        if (box) box.innerHTML = '';
    };
    // 编辑器懒创建：内容没灌进去时会静默拍出空白，这里留个自检
    window.__probe = function (page) {
        const t = pageImportTargets(page);
        return t && t.editor ? t.editor.getValue().length : -1;
    };
    return 'ok';
})()`;

/* --------------------------------- 截图表 --------------------------------- */

const SHOTS = [
    {
        name: 'screen',
        label: '格式转换',
        async run(ev) {
            await ev(`__put('convert', ${JSON.stringify(CONVERT_JSON)})`);
            await sleep(600);
        }
    },
    {
        name: 'screen-compare',
        label: 'JSON 对比',
        async run(ev) {
            await ev(`handleNavClick(document.getElementById('navCompare'))`);
            await sleep(450);
            await ev(`applySample('user')`);
            await sleep(700);
        }
    },
    {
        name: 'screen-sql',
        label: 'SQL 转换',
        async run(ev) {
            await ev(`handleNavClick(document.getElementById('navSql'))`);
            await sleep(400);
            await ev(`__put('navSql', ${JSON.stringify(SQL_LINES)})`);
            await sleep(700);
        }
    },
    {
        name: 'screen-image',
        label: '图片 Base64',
        async run(ev) {
            await ev(`handleNavClick(document.getElementById('navImage'))`);
            await sleep(400);
            await ev(`imgMakeSample()`);
            await sleep(800);
        }
    },
    {
        name: 'screen-code',
        label: '代码生成',
        async run(ev) {
            await ev(`handleNavClick(document.getElementById('navCodegen'))`);
            await sleep(500);
            await ev(`codeLoadSample('user')`);
            await sleep(700);
        }
    },
    {
        name: 'screen-query',
        label: '查询校验',
        async run(ev) {
            // 第一次进这页会自动填 bookstore 示例并跑一次，不用再灌
            await ev(`handleNavClick(document.getElementById('navQuery'))`);
            await sleep(900);
        }
    },
    {
        name: 'screen-escape',
        label: '转义工具',
        async run(ev) {
            await ev(`handleNavClick(document.getElementById('navEscape'))`);
            await sleep(400);
            await ev(`__put('navEscape', ${JSON.stringify(ESC_TEXT)})`);
            await sleep(700);
        }
    },
    {
        name: 'screen-bytes',
        label: '字节转换',
        async run(ev) {
            await ev(`handleNavClick(document.getElementById('navBytes'))`);
            await sleep(400);
            await ev(`__put('navBytes', ${JSON.stringify(BYTES_TEXT)})`);
            await sleep(700);
        }
    },
    {
        name: 'screen-time',
        label: '时间转换',
        async run(ev) {
            await ev(`handleNavClick(document.getElementById('navTime'))`);
            await sleep(400);
            await ev(`__put('navTime', ${JSON.stringify(TIME_LINES)})`);
            await sleep(800);
        }
    },
    {
        name: 'screen-chart',
        label: 'JSON 转图表',
        async run(ev) {
            await ev(`handleNavClick(document.getElementById('navChart'))`);
            await sleep(600);
            await ev(`document.getElementById('chartSample').click()`);
            // ECharts 是懒加载的，首帧画出来要等
            await sleep(1600);
        }
    },
    {
        name: 'screen-qr',
        label: '二维码转换',
        async run(ev) {
            await ev(`handleNavClick(document.getElementById('navQr'))`);
            await sleep(500);
            await ev(`__put('navQr', ${JSON.stringify(QR_LINES)})`);
            // 六张码是一次性排队的，别拍到只画了一半的网格
            await sleep(2000);
        }
    },
    {
        name: 'screen-sheet',
        label: '表格转 JSON',
        async run(ev) {
            await ev(`handleNavClick(document.getElementById('navSheet'))`);
            await sleep(400);
            await ev(`openSheetSample('users')`);
            await sleep(1000);
        }
    }
];

/* ---------------------------------- 跑 ---------------------------------- */

const todo = only.length ? SHOTS.filter((s) => only.indexOf(s.name) !== -1) : SHOTS;
if (!todo.length) {
    console.error('没有这张截图：' + only.join(', '));
    console.error('可选：' + SHOTS.map((s) => s.name).join(' '));
    process.exit(1);
}

const profile = path.join(os.tmpdir(), 'dbx-shot-profile');
const proc = spawn(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--mute-audio',
    '--force-device-scale-factor=1',
    '--force-color-profile=srgb',
    `--remote-debugging-port=${PORT}`,
    `--window-size=${W},${H}`,
    `--user-data-dir=${profile}`,
    'about:blank'
], { stdio: 'ignore' });

let ws = null;
let failed = 0;

function shutdown(code) {
    try { if (ws) ws.close(); } catch (e) { /* ignore */ }
    try { proc.kill(); } catch (e) { /* ignore */ }
    process.exit(code);
}

(async () => {
    let target = null;
    for (let i = 0; i < 100 && !target; i++) {
        try {
            const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
            target = list.find((x) => x.type === 'page');
        } catch (e) { /* 还没起来 */ }
        if (!target) await sleep(200);
    }
    if (!target) throw new Error('Chrome 没能在 20 秒内起来');

    ws = new WebSocket(target.webSocketDebuggerUrl);
    let seq = 0;
    const pending = new Map();
    ws.addEventListener('message', (evt) => {
        const m = JSON.parse(evt.data);
        if (m.id && pending.has(m.id)) {
            pending.get(m.id)(m.result);
            pending.delete(m.id);
        }
    });
    await new Promise((r) => ws.addEventListener('open', r));

    const send = (method, params) => new Promise((res) => {
        const id = ++seq;
        pending.set(id, res);
        ws.send(JSON.stringify({ id, method, params }));
    });

    const ev = async (expression) => {
        const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (r && r.exceptionDetails) {
            throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) ||
                r.exceptionDetails.text);
        }
        return r && r.result ? r.result.value : null;
    };

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    // 宿主要求亮色，别跟着系统走
    await send('Emulation.setEmulatedMedia', {
        media: 'screen',
        features: [{ name: 'prefers-color-scheme', value: 'light' }]
    });
    await send('Page.navigate', { url: PAGE });
    await sleep(2600);

    await ev(HELPERS);
    const pageCount = await ev(`document.querySelectorAll('#navLinks a').length`);
    console.log(`页面就绪：导航 ${pageCount} 项，输出到 docs/`);

    for (const shot of todo) {
        try {
            await shot.run(ev);
            await ev(`__clean()`);
            await sleep(280);
            const r = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
            const file = path.join(OUT, shot.name + '.png');
            fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
            const kb = Math.round(fs.statSync(file).size / 1024);
            console.log(`  ok   ${shot.name}.png  ${String(kb).padStart(4)} KB   ${shot.label}`);
        } catch (err) {
            failed++;
            console.log(`  FAIL ${shot.name}  ${err.message}`);
            try {
                const r = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
                fs.writeFileSync(path.join(os.tmpdir(), 'shot-fail-' + shot.name + '.png'),
                    Buffer.from(r.data, 'base64'));
            } catch (e) { /* ignore */ }
        }
    }

    console.log(failed ? `\n${failed} 张失败` : `\n全部 ${todo.length} 张完成`);
    shutdown(failed ? 1 : 0);
})().catch((err) => {
    console.error('ERR', err && err.message);
    shutdown(1);
});
