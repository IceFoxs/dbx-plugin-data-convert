/*
 * xlsxread 单测：用 zlib 现造一个最小 .xlsx（ZIP + deflate），验证解析结果。
 *   node tests/xlsxread.test.js
 */
'use strict';

const assert = require('assert');
const zlib = require('zlib');
const X = require('../ui/js/xlsxread.js');

let passed = 0;
const failures = [];

async function check(name, fn) {
    try {
        await fn();
        passed++;
    } catch (err) {
        failures.push(name + ' → ' + (err && err.message || err));
    }
}

function u16(n) {
    const b = Buffer.alloc(2);
    b.writeUInt16LE(n, 0);
    return b;
}
function u32(n) {
    const b = Buffer.alloc(4);
    b.writeUInt32LE(n, 0);
    return b;
}
function u64(n) {
    const b = Buffer.alloc(8);
    b.writeBigUInt64LE(BigInt(n), 0);
    return b;
}

// 极简 ZIP 打包：只为测试，CRC 写 0（读取端不看）
function buildZip(files) {
    const locals = [];
    const centrals = [];
    let offset = 0;
    files.forEach((file) => {
        const raw = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data, 'utf8');
        const method = file.method == null ? 8 : file.method;
        const comp = method === 8 ? zlib.deflateRawSync(raw) : raw;
        const name = Buffer.from(file.name, 'utf8');
        const local = Buffer.concat([
            u32(0x04034b50), u16(20), u16(0), u16(method), u16(0), u16(0),
            u32(0), u32(comp.length), u32(raw.length), u16(name.length), u16(0),
            name, comp
        ]);
        locals.push(local);
        centrals.push(Buffer.concat([
            u32(0x02014b50), u16(20), u16(20), u16(0), u16(method), u16(0), u16(0),
            u32(0), u32(comp.length), u32(raw.length),
            u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset),
            name
        ]));
        offset += local.length;
    });
    const central = Buffer.concat(centrals);
    const localAll = Buffer.concat(locals);
    const eocd = Buffer.concat([
        u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
        u32(central.length), u32(localAll.length), u16(0)
    ]);
    return Buffer.concat([localAll, central, eocd]);
}

// ZIP64 变体：中央目录把大小 / 偏移写成 0xFFFFFFFF，真实值放进 0x0001 扩展字段，
// 复刻 Excel / WPS 用 zip64 写出来的包（读不对就会被当成 4 GB 的工作表）
function buildZip64(files) {
    const locals = [];
    const centrals = [];
    let offset = 0;
    files.forEach((file) => {
        const raw = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data, 'utf8');
        const method = file.method == null ? 8 : file.method;
        const comp = method === 8 ? zlib.deflateRawSync(raw) : raw;
        const name = Buffer.from(file.name, 'utf8');
        const local = Buffer.concat([
            u32(0x04034b50), u16(45), u16(0), u16(method), u16(0), u16(0),
            u32(0), u32(comp.length), u32(raw.length), u16(name.length), u16(0),
            name, comp
        ]);
        const extra = Buffer.concat([
            u16(0x0001), u16(24), u64(raw.length), u64(comp.length), u64(offset)
        ]);
        centrals.push(Buffer.concat([
            u32(0x02014b50), u16(45), u16(45), u16(0), u16(method), u16(0), u16(0),
            u32(0), u32(0xFFFFFFFF), u32(0xFFFFFFFF),
            u16(name.length), u16(extra.length), u16(0), u16(0), u16(0), u32(0), u32(0xFFFFFFFF),
            name, extra
        ]));
        locals.push(local);
        offset += local.length;
    });
    const central = Buffer.concat(centrals);
    const localAll = Buffer.concat(locals);
    const z64eocd = Buffer.concat([
        u32(0x06064b50), u64(44), u16(45), u16(45), u32(0), u32(0),
        u64(files.length), u64(files.length), u64(central.length), u64(localAll.length)
    ]);
    const z64locator = Buffer.concat([
        u32(0x07064b50), u32(0), u64(localAll.length + central.length), u32(1)
    ]);
    const eocd = Buffer.concat([
        u32(0x06054b50), u16(0), u16(0), u16(0xFFFF), u16(0xFFFF),
        u32(0xFFFFFFFF), u32(0xFFFFFFFF), u16(0)
    ]);
    return Buffer.concat([localAll, central, z64eocd, z64locator, eocd]);
}

const SHEET_XML = '<?xml version="1.0" encoding="UTF-8"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
    + '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>'
    + '<row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2"><v>18</v></c><c r="C2" s="1"><v>45000</v></c></row>'
    + '<row r="3"><c r="A3" t="s"><v>4</v></c><c r="C3" s="2"><v>45031.5</v></c></row>'
    + '<row r="4"><c r="A4" t="inlineStr"><is><t xml:space="preserve">王五</t></is></c><c r="B4" t="b"><v>1</v></c></row>'
    + '<row r="5"><c r="A5"><v>3.14</v></c><c r="B5" t="e"><v>#DIV/0!</v></c></row>'
    + '</sheetData></worksheet>';

function xlsxFiles(method) {
    return [
        { method: method, data: '<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="销售表" sheetId="1" r:id="rId1"/></sheets></workbook>', name: 'xl/workbook.xml' },
        { method: method, data: '<?xml version="1.0"?><Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>', name: 'xl/_rels/workbook.xml.rels' },
        {
            method: method,
            name: 'xl/sharedStrings.xml',
            data: '<?xml version="1.0"?><sst count="5"><si><t>姓名</t></si><si><t>年龄</t></si><si><t>日期</t></si>'
                + '<si><t>张三</t></si><si><r><t>李</t></r><r><t>四</t></r></si></sst>'
        },
        {
            method: method,
            name: 'xl/styles.xml',
            data: '<?xml version="1.0"?><styleSheet><numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy/m/d"/></numFmts>'
                + '<cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="164"/></cellXfs></styleSheet>'
        },
        { method: method, name: 'xl/worksheets/sheet1.xml', data: SHEET_XML }
    ];
}

function makeXlsx(method) {
    return buildZip(xlsxFiles(method));
}

function makeXlsx64(method) {
    return buildZip64(xlsxFiles(method));
}

const inflateRaw = (bytes) => new Uint8Array(zlib.inflateRawSync(bytes));

(async function run() {
    const result = await X.read(makeXlsx(8), { inflateRaw: inflateRaw });

    await check('表名来自 workbook.xml', () => {
        assert.strictEqual(result.sheetName, '销售表');
    });
    await check('表头（共享字符串）', () => {
        assert.deepStrictEqual(result.rows[0], ['姓名', '年龄', '日期']);
    });
    await check('数字单元格保持原文', () => {
        assert.strictEqual(result.rows[1][1], '18');
    });
    await check('日期样式转成 yyyy-mm-dd', () => {
        assert.match(result.rows[1][2], /^\d{4}-\d{2}-\d{2}$/);
    });
    await check('带时间的日期保留时分秒', () => {
        assert.match(result.rows[2][2], /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });
    await check('富文本共享字符串拼接', () => {
        assert.strictEqual(result.rows[2][0], '李四');
    });
    await check('缺列的空单元格补空串', () => {
        assert.strictEqual(result.rows[2][1], '');
    });
    await check('inlineStr / 布尔 / 错误值', () => {
        assert.strictEqual(result.rows[3][0], '王五');
        assert.strictEqual(result.rows[3][1], 'TRUE');
        assert.strictEqual(result.rows[4][0], '3.14');
        assert.strictEqual(result.rows[4][1], '#DIV/0!');
    });

    await check('不压缩（method 0）的包也能读', async () => {
        const stored = await X.read(makeXlsx(0), { inflateRaw: inflateRaw });
        assert.deepStrictEqual(stored.rows[0], ['姓名', '年龄', '日期']);
    });

    await check('ZIP64 包（0xFFFFFFFF 占位）不会被当成超大工作表', async () => {
        const zip64 = await X.read(makeXlsx64(8), { inflateRaw: inflateRaw });
        assert.deepStrictEqual(zip64.rows[0], ['姓名', '年龄', '日期']);
        assert.strictEqual(zip64.rows[1][1], '18');
        assert.strictEqual(zip64.sheetName, '销售表');
    });

    await check('ZIP64 + 不压缩也能读', async () => {
        const zip64 = await X.read(makeXlsx64(0), { inflateRaw: inflateRaw });
        assert.strictEqual(zip64.rows[3][0], '王五');
    });

    await check('行数上限生效', async () => {
        const cut = await X.read(makeXlsx(8), { inflateRaw: inflateRaw, maxRows: 2 });
        assert.strictEqual(cut.rows.length, 2);
        assert.strictEqual(cut.truncated, true);
    });

    await check('不是 ZIP 时抛错', async () => {
        let threw = false;
        try {
            await X.read(Buffer.from('not a zip'), { inflateRaw: inflateRaw });
        } catch (err) {
            threw = /ZIP/.test(err.message);
        }
        assert.ok(threw, '应抛出 ZIP 相关错误');
    });

    await check('列名转索引', () => {
        assert.strictEqual(X.colIndex('A1'), 0);
        assert.strictEqual(X.colIndex('Z9'), 25);
        assert.strictEqual(X.colIndex('AA1'), 26);
        assert.strictEqual(X.colIndex('BC12'), 54);
    });

    await check('日期序列号转换', () => {
        assert.strictEqual(X.serialToText(45000), '2023-03-15');
        assert.match(X.serialToText(45000.75), /^2023-03-15 18:00:00$/);
    });

    if (failures.length) {
        console.error('✗ xlsxread: ' + failures.length + ' 项失败');
        failures.forEach((f) => console.error('  - ' + f));
        process.exit(1);
    }
    console.log('✓ xlsxread: ' + passed + ' 项通过');
})().catch((err) => {
    console.error('✗ xlsxread 运行时错误：' + ((err && err.stack) || err));
    process.exit(1);
});
