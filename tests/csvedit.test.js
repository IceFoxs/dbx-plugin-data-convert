/**
 * csvedit.test.js — CSV 编辑器内核（纯函数，无 DOM）
 *
 *   node tests/csvedit.test.js
 *
 * 覆盖：解析（引号 / 换行 / BOM / trim / 空行 / 表头生成）、序列化（引号与行尾）、
 * 行号映射（双向定位靠它）、行列操作与撤销、排序、过滤、查找替换、边界上限。
 * 页面交互（懒加载、弹窗、定位）在 tests/ui.smoke.js 里验。
 */
'use strict';

const C = require('../ui/js/csvedit.js');

let passed = 0;
let failed = 0;
const failures = [];

function check(name, fn) {
    try {
        fn();
        passed++;
        console.log('  ok   ' + name);
    } catch (err) {
        failed++;
        failures.push(name + ' → ' + err.message);
        console.error('  FAIL ' + name + '\n       ' + err.message);
    }
}

function eq(actual, expected, msg) {
    const a = JSON.stringify(actual);
    const b = JSON.stringify(expected);
    if (a !== b) throw new Error((msg ? msg + '：' : '') + '期望 ' + b + '，实际 ' + a);
}

function ok(value, msg) {
    if (!value) throw new Error(msg || '断言失败');
}

// ---------------------------------------------------------------- 解析
check('基本解析：首行做表头，行宽对齐', () => {
    const m = C.parse('姓名,年龄\n张三,18\n李四,22', { header: true });
    eq(m.header, ['姓名', '年龄']);
    eq(m.rows, [['张三', '18'], ['李四', '22']]);
    eq(m.hasHeader, true);
    eq(m.delimiter, ',');
});

check('表头短于数据：补占位列名，不出现 undefined', () => {
    const m = C.parse('a,b\n1,2,3', { header: true });
    eq(m.header, ['a', 'b', '列 3']);
    eq(m.rows, [['1', '2', '3']]);
});

check('没有表头：生成「列 N」，hasHeader 为 false', () => {
    const m = C.parse('1,2\n3,4', { header: false });
    eq(m.header, ['列 1', '列 2']);
    eq(m.rows, [['1', '2'], ['3', '4']]);
    eq(m.hasHeader, false);
});

check('引号里的逗号不拆列', () => {
    const m = C.parse('a,b\n"北京, 朝阳",1', { header: true });
    eq(m.rows[0], ['北京, 朝阳', '1']);
});

check('引号里的换行属于单元格，但行号要跟着走', () => {
    const m = C.parse('a,b\n"多行\n内容",1\nx,2', { header: true });
    eq(m.rows[0], ['多行\n内容', '1']);
    // 第 0 条数据从第 1 行开始，第 1 条从第 3 行开始（中间那行属于上一个单元格）
    eq(m.lineOf, [1, 3]);
});

check('双引号转义："" 还原成一个引号', () => {
    const m = C.parse('a\n"含""引号"""', { header: true });
    eq(m.rows[0], ['含"引号"']);
});

check('BOM 被剥掉，不会粘在第一个列名上', () => {
    const m = C.parse('\uFEFFa,b\n1,2', { header: true });
    eq(m.header, ['a', 'b']);
    eq(m.bom, true);
});

check('CRLF 与孤立的 CR 都当行尾', () => {
    const m = C.parse('a,b\r\n1,2\r3,4', { header: true });
    eq(m.rows, [['1', '2'], ['3', '4']]);
});

check('trim：去首尾空白，值中间的空格保留', () => {
    const m = C.parse('a,b\n  New York , 1 ', { header: true, trim: true });
    eq(m.rows[0], ['New York', '1']);
});

check('skipEmpty：整行空白丢掉；关掉就保留', () => {
    const on = C.parse('a\n\n1\n', { header: true, skipEmpty: true });
    eq(on.rows, [['1']]);
    const off = C.parse('a\n\n1', { header: true, skipEmpty: false });
    eq(off.rows, [[''], ['1']]);
});

check('自定义分隔符（制表符）与单引号引用', () => {
    const m = C.parse("a\tb\n'x\ty'\t2", { header: true, delimiter: '\t', quote: "'" });
    eq(m.header, ['a', 'b']);
    eq(m.rows[0], ['x\ty', '2']);
});

check('自动识别分隔符：制表符 / 分号 / 竖线', () => {
    eq(C.detectDelimiter('a\tb\n1\t2'), '\t');
    eq(C.detectDelimiter('a;b\n1;2'), ';');
    eq(C.detectDelimiter('a|b\n1|2'), '|');
    eq(C.detectDelimiter('单列数据'), ',');
});

check('超过列上限：截断并回传标记', () => {
    const m = C.parse('a,b,c\n1,2,3', { header: true, maxCols: 2 });
    eq(m.header, ['a', 'b']);
    eq(m.colsTruncated, true);
});

check('超过行上限：截断并回传 truncated', () => {
    const m = C.parse('a\n1\n2\n3', { header: true, maxRows: 2 });
    eq(m.rows.length, 2);
    eq(m.truncated, true);
});

check('parseAsync 与 parse 结果一致', async () => {
    const text = 'a,b\n' + Array.from({ length: 300 }, (_, i) => i + ',v' + i).join('\n');
    return C.parseAsync(text, { header: true }).then((m) => {
        eq(m.header, ['a', 'b']);
        eq(m.rows.length, 300);
    });
});

// ---------------------------------------------------------------- 序列化
check('序列化：该加引号的加，不该加的别乱加', () => {
    const model = {
        header: ['a', 'b'],
        rows: [['x,y', 'z'], ['plain', 'has"quote']],
        hasHeader: true
    };
    const out = C.serialize(model, { delimiter: ',', quote: '"', eol: '\n' });
    eq(out.text, 'a,b\n"x,y",z\nplain,"has""quote"\n');
});

check('序列化：首尾空格要包引号（否则再读回来会被 trim 掉）', () => {
    const model = { header: ['a'], rows: [[' x ']], hasHeader: true };
    const out = C.serialize(model, { delimiter: ',' });
    eq(out.text, 'a\n" x "\n');
});

check('序列化：CRLF 与 BOM', () => {
    const model = { header: ['a'], rows: [['1']], hasHeader: true };
    const out = C.serialize(model, { eol: '\r\n', bom: true });
    eq(out.text, '\uFEFFa\r\n1\r\n');
});

check('序列化：没有表头时不输出表头行', () => {
    const model = { header: ['列 1'], rows: [['1']], hasHeader: false };
    eq(C.serialize(model, {}).text, '1\n');
});

check('序列化回传的 lineOf 能和解析对上（往返一致）', () => {
    const src = 'a,b\n"多行\n内容",1\nx,2\n';
    const first = C.parse(src, { header: true });
    const out = C.serialize(first, { delimiter: ',', eol: '\n' });
    const second = C.parse(out.text, { header: true });
    eq(second.rows, first.rows);
    eq(out.lineOf, second.lineOf);
});

check('往返：10 万以内的长 ID 不掉精度', () => {
    const id = '120101000001417742';
    const m = C.parse('id\n' + id, { header: true });
    const json = C.toJson(m, { types: true, pretty: false });
    eq(JSON.parse(json)[0].id, id);
    ok(typeof JSON.parse(json)[0].id === 'string', '长 ID 应该还是字符串');
});

// ---------------------------------------------------------------- 输出格式
check('toJson：数字与布尔按类型输出，前导零还是字符串', () => {
    const m = C.parse('n,b,z\n18,true,007', { header: true });
    const rec = JSON.parse(C.toJson(m, { types: true, pretty: false }))[0];
    eq(rec.n, 18);
    eq(rec.b, true);
    eq(rec.z, '007');
});

check('toJson：重名列自动加后缀，不会互相覆盖', () => {
    const m = { header: ['a', 'a'], rows: [['1', '2']], hasHeader: true };
    const rec = JSON.parse(C.toJson(m, { pretty: false }))[0];
    eq(rec.a, '1');
    eq(rec['a (2)'], '2');
});

check('toMarkdown：转义竖线，换行变 <br>', () => {
    const m = { header: ['a'], rows: [['x|y\nz']], hasHeader: true };
    const md = C.toMarkdown(m);
    eq(md.split('\n')[0], '| a |');
    eq(md.split('\n')[1], '| --- |');
    eq(md.split('\n')[2], '| x\\|y<br>z |');
});

// ---------------------------------------------------------------- 操作与撤销
function base() {
    return {
        header: ['a', 'b'],
        rows: [['1', '2'], ['3', '4'], ['5', '6']],
        hasHeader: true
    };
}

check('cell：改一格，撤销还原', () => {
    const m = base();
    const op = C.opCell(1, 1, '4', 'x');
    C.applyOp(m, op, 1);
    eq(m.rows[1][1], 'x');
    C.applyOp(m, op, -1);
    eq(m.rows[1][1], '4');
});

check('cells：批量替换，撤销一次全回来', () => {
    const m = base();
    const op = C.opCells([{ r: 0, c: 0, from: '1', to: '9' }, { r: 2, c: 1, from: '6', to: '8' }]);
    C.applyOp(m, op, 1);
    eq([m.rows[0][0], m.rows[2][1]], ['9', '8']);
    C.applyOp(m, op, -1);
    eq([m.rows[0][0], m.rows[2][1]], ['1', '6']);
});

check('rowIns / rowDel：插一行、删一行都能撤销', () => {
    const m = base();
    const ins = C.opRowIns(1, 1);
    C.applyOp(m, ins, 1);
    eq(m.rows.length, 4);
    eq(m.rows[1], ['', '']);
    C.applyOp(m, ins, -1);
    eq(m.rows.length, 3);

    const del = C.opRowDel(0, [m.rows[0].slice()]);
    C.applyOp(m, del, 1);
    eq(m.rows[0], ['3', '4']);
    C.applyOp(m, del, -1);
    eq(m.rows[0], ['1', '2']);
});

check('colIns / colDel：列的数据也要跟着回来', () => {
    const m = base();
    const ins = C.opColIns(1, '新列');
    C.applyOp(m, ins, 1);
    eq(m.header, ['a', '新列', 'b']);
    eq(m.rows[0], ['1', '', '2']);
    C.applyOp(m, ins, -1);
    eq(m.header, ['a', 'b']);

    const del = C.opColDel(0, 'a', ['1', '3', '5']);
    C.applyOp(m, del, 1);
    eq(m.header, ['b']);
    C.applyOp(m, del, -1);
    eq(m.header, ['a', 'b']);
    eq(m.rows[2], ['5', '6']);
});

check('head：改列名可撤销', () => {
    const m = base();
    const op = C.opHead(0, 'a', '姓名');
    C.applyOp(m, op, 1);
    eq(m.header[0], '姓名');
    C.applyOp(m, op, -1);
    eq(m.header[0], 'a');
});

check('order：排序后撤销回原顺序', () => {
    const m = base();
    const order = C.sortOrder(m.rows, 0, { desc: false });
    const op = C.opOrder(order);
    C.applyOp(m, op, 1);
    eq(m.rows.map((r) => r[0]), ['1', '3', '5']);
    C.applyOp(m, op, -1);
    eq(m.rows.map((r) => r[0]), ['1', '3', '5']);
    // 倒序排一次再验
    const desc = C.opOrder(C.sortOrder(m.rows, 0, { desc: true }));
    C.applyOp(m, desc, 1);
    eq(m.rows.map((r) => r[0]), ['5', '3', '1']);
    C.applyOp(m, desc, -1);
    eq(m.rows.map((r) => r[0]), ['1', '3', '5']);
});

check('applyOp 遇到非法下标不抛错', () => {
    const m = base();
    C.applyOp(m, C.opCell(99, 0, 'x', 'y'), 1);
    C.applyOp(m, null, 1);
});

// ---------------------------------------------------------------- 排序 / 过滤
check('排序：数字按数值大小，不是按字符串', () => {
    const rows = [['10'], ['9'], ['100']];
    eq(C.sortOrder(rows, 0, { numeric: true }).map((i) => rows[i][0]), ['9', '10', '100']);
    eq(C.sortOrder(rows, 0, { numeric: false }).map((i) => rows[i][0]), ['10', '100', '9']);
});

check('排序：空值永远沉底（升序降序都是）', () => {
    const rows = [[''], ['b'], ['a']];
    eq(C.sortOrder(rows, 0, { desc: false }).map((i) => rows[i][0]), ['a', 'b', '']);
    eq(C.sortOrder(rows, 0, { desc: true }).map((i) => rows[i][0]), ['b', 'a', '']);
});

check('排序：稳定（同值保持原顺序）', () => {
    const rows = [['1', 'a'], ['1', 'b'], ['0', 'c']];
    eq(C.sortOrder(rows, 0, {}).map((i) => rows[i][1]), ['c', 'a', 'b']);
});

check('过滤：大小写不敏感，全列为空时返回全部', () => {
    const rows = [['Alpha', 'x'], ['beta', 'y']];
    eq(C.filterIndices(rows, 'alp', -1), [0]);
    eq(C.filterIndices(rows, 'BETA', 0), [1]);
    eq(C.filterIndices(rows, '', -1).length, 2);
});

check('查找：返回每个命中的行列，替换保留大小写不敏感', () => {
    const rows = [['Foo', 'foo'], ['bar', 'FOO']];
    const hits = C.findMatches(rows, 'foo', -1);
    eq(hits.map((h) => [h.r, h.c]), [[0, 0], [0, 1], [1, 1]]);
    eq(C.replaceValue('a Foo foo', 'foo', 'X'), 'a X X');
    eq(C.replaceValue('a.b', '.', '-'), 'a-b');
});

// ---------------------------------------------------------------- 其他
check('rowAtLine：找每行对应的源码行（二分）', () => {
    const lineOf = [1, 2, 5, 6];
    eq(C.rowAtLine(lineOf, 0), -1);
    eq(C.rowAtLine(lineOf, 1), 0);
    eq(C.rowAtLine(lineOf, 4), 1);
    eq(C.rowAtLine(lineOf, 5), 2);
    eq(C.rowAtLine(lineOf, 99), 3);
});

check('colWidths：夹在上下限之间，长文本不把列撑爆', () => {
    const m = { header: ['a'], rows: [['x'.repeat(5000)]], hasHeader: true };
    const w = C.colWidths(m);
    ok(w[0] >= 72 && w[0] <= 320, '宽度 ' + w[0]);
});

check('colWidths：中文按两格算，比同长度的英文宽', () => {
    const cn = C.colWidths({ header: ['姓名'], rows: [['张三']] }, { min: 10, max: 1000 });
    const en = C.colWidths({ header: ['ab'], rows: [['ab']] }, { min: 10, max: 1000 });
    ok(cn[0] > en[0], '中文列没有更宽');
});

check('formatBytes / formatInt', () => {
    eq(C.formatBytes(512), '512 B');
    eq(C.formatBytes(2048), '2.0 KB');
    eq(C.formatBytes(5 * 1024 * 1024), '5.0 MB');
    eq(C.formatInt(1234567), '1,234,567');
});

check('blank：给一张有列名、全空的小表', () => {
    const m = C.blank(3, 2);
    eq(m.header, ['列 1', '列 2', '列 3']);
    eq(m.rows.length, 2);
    eq(m.rows[0], ['', '', '']);
});

check('encodeCell：不引号 / 总是引号 / 从不引号', () => {
    eq(C.encodeCell('a,b', ',', '"', 'auto'), '"a,b"');
    eq(C.encodeCell('ab', ',', '"', 'always'), '"ab"');
    eq(C.encodeCell('a,b', ',', '"', 'never'), 'a,b');
    eq(C.encodeCell('ab', ',', '', 'auto'), 'ab');
});

/* 选中单元格 -> 源码里精确高亮：靠这两个函数把「第几格」翻成字符区间 */
check('fieldSpans：普通一行，逐格区间不含分隔符', () => {
    const spans = C.fieldSpans('a,bb,ccc', ',', '"');
    eq(spans.length, 3);
    eq('a,bb,ccc'.slice(spans[0].start, spans[0].end), 'a');
    eq('a,bb,ccc'.slice(spans[1].start, spans[1].end), 'bb');
    eq('a,bb,ccc'.slice(spans[2].start, spans[2].end), 'ccc');
});

check('fieldSpans：引号内的逗号不算分隔符，区间含引号', () => {
    const text = '1,"含,逗号",x';
    const spans = C.fieldSpans(text, ',', '"');
    eq(spans.length, 3);
    eq(text.slice(spans[1].start, spans[1].end), '"含,逗号"');
    eq(text.slice(spans[2].start, spans[2].end), 'x');
});

check('fieldSpans："" 转义不提前收尾，跨行字段区间含换行', () => {
    const text = '1,"含""引号""","多行\n内容",3';
    const spans = C.fieldSpans(text, ',', '"');
    eq(spans.length, 4);
    eq(text.slice(spans[1].start, spans[1].end), '"含""引号"""');
    ok(text.slice(spans[2].start, spans[2].end).indexOf('\n') > 0, '跨行字段没带上换行');
});

check('fieldSpans：空行 / 尾随分隔符都算一格', () => {
    eq(C.fieldSpans('', ',', '"').length, 1);
    eq(C.fieldSpans('a,', ',', '"').length, 2);
    eq(C.fieldSpans('a,,c', ',', '"').length, 3);
});

check('offsetToPos：偏移翻成源码坐标，跨行也对', () => {
    const text = 'ab\ncd';
    eq(C.offsetToPos(text, 0, 0), { line: 0, ch: 0 });
    eq(C.offsetToPos(text, 2, 0), { line: 0, ch: 2 });
    const p = C.offsetToPos(text, 4, 0);
    eq(p.line, 1);
    eq(p.ch, 1);
    // baseLine：记录不在第 0 行时，行号要整体偏移
    eq(C.offsetToPos('ab', 1, 7).line, 7);
});

/* Markdown 表格预览：把生成的 Markdown 真渲染成表格 */
check('markdownTableToHtml：表头 / 对齐 / 管道转义都对', () => {
    const md = '| 名称 | 数量 |\n| :--- | ---: |\n| a\\|b | 1 |';
    const html = C.markdownTableToHtml(md);
    ok(html.indexOf('<table') === 0, '不是一个表格');
    ok(html.indexOf('<th') > 0, '没有表头单元格');
    ok(html.indexOf('text-align:left') > 0, '左对齐没出来');
    ok(html.indexOf('text-align:right') > 0, '右对齐没出来');
    ok(html.indexOf('a|b') > 0, '转义的管道没还原');
});

check('markdownTableToHtml：认不出表格返回空串，HTML 一律转义', () => {
    eq(C.markdownTableToHtml('这是一段普通文字'), '');
    eq(C.markdownTableToHtml(''), '');
    const html = C.markdownTableToHtml('| 内容 |\n| --- |\n| <img src=x onerror=alert(1)> |');
    ok(html.indexOf('&lt;img') > 0, 'HTML 没转义');
    ok(html.indexOf('<img') < 0, 'HTML 被原样塞进去了');
});

check('markdownTableToHtml：单元格换行渲染成 <br>（toMarkdown 往返）', () => {
    const m = { header: ['备注'], rows: [['第一行\n第二行']], hasHeader: true };
    const html = C.markdownTableToHtml(C.toMarkdown(m));
    ok(html.indexOf('<br>') > 0, '换行没保留：' + html);
});

check('markdownTableToHtml：整张表 38 列也不掉格子', () => {
    const header = [];
    const row = [];
    for (let i = 0; i < 38; i++) { header.push('c' + i); row.push('v' + i); }
    const html = C.markdownTableToHtml(C.toMarkdown({ header: header, rows: [row], hasHeader: true }));
    eq((html.match(/<th[ >]/g) || []).length, 38);
    eq((html.match(/<td[ >]/g) || []).length, 38);
    ok(html.indexOf('>v37<') > 0, '最后一列丢了');
});

const total = passed + failed;
console.log('\n--- csvedit: ' + passed + '/' + total + ' passed ---');
if (failed) {
    console.error('\n失败用例:');
    failures.forEach((f) => console.error('  - ' + f));
    process.exit(1);
}
