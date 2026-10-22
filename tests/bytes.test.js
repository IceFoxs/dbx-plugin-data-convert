/*
 * bytes.js 单测：单位换算、两种进制、字节序列的几种写法、批量。
 * 都是纯函数，直接 node 跑。
 */
const B = require('../ui/js/bytes.js');

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

function eq(actual, expected, label) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) throw new Error((label || '') + ' 期望 ' + e + '，实际 ' + a);
}

function bytesOf(text) {
    const r = B.parseLine(text);
    if (!r.ok) throw new Error('解析失败 ' + text + ' (' + r.code + ')');
    return r.data ? Array.from(r.data) : null;
}

console.log('=== 单位换算 ===');

check('用户给的例子：1234567890 B = 1.23 GB / 1.15 GiB', () => {
    eq(B.human(1234567890, 2, 1000), '1.23 GB');
    eq(B.human(1234567890, 2, 1024), '1.15 GiB');
});

check('两套进制分开算，不混用', () => {
    eq(B.human(1000, 2, 1000), '1 KB');       // 1000 B 正好 1 KB
    eq(B.human(1000, 2, 1024), '1000 B');     // 不到 1 KiB 就是 1000 B
    eq(B.human(1024, 2, 1024), '1 KiB');
    eq(B.human(1024, 2, 1000), '1.02 KB');
});

check('六个量级都到得了', () => {
    eq(B.human(1, 0, 1000), '1 B');
    eq(B.human(1e3, 0, 1000), '1 KB');
    eq(B.human(1e6, 0, 1000), '1 MB');
    eq(B.human(1e9, 0, 1000), '1 GB');
    eq(B.human(1e12, 0, 1000), '1 TB');
    eq(B.human(1e15, 0, 1000), '1 PB');
    eq(B.human(Math.pow(1024, 5), 0, 1024), '1 PiB');
});

check('小数位 0 / 2 / 4 生效，末尾 0 去掉', () => {
    eq(B.human(1536, 0, 1024), '2 KiB');
    eq(B.human(1536, 2, 1024), '1.5 KiB');
    eq(B.human(1234567, 4, 1024), '1.1774 MiB');
    eq(B.human(734003200, 0, 1024), '700 MiB');
});

check('0 字节不炸', () => {
    eq(B.human(0, 2, 1024), '0 B');
    eq(B.parseLine('0').bytes, 0);
});

console.log('\n=== 输入解析：大小 ===');

check('纯数字就是字节数', () => {
    eq(B.parseLine('1234567890').bytes, 1234567890);
    eq(B.parseLine('  42  ').bytes, 42);
});

check('带单位：1000 制', () => {
    eq(B.parseLine('1 KB').bytes, 1000);
    eq(B.parseLine('1.5 MB').bytes, 1500000);
    eq(B.parseLine('2GB').bytes, 2000000000);
    eq(B.parseLine('1 TB').bytes, 1e12);
    eq(B.parseLine('1 PB').bytes, 1e15);
    eq(B.parseLine('10m').bytes, 1e7);
});

check('带单位：1024 制', () => {
    eq(B.parseLine('1 KiB').bytes, 1024);
    eq(B.parseLine('1.15 GiB').bytes, Math.round(1.15 * Math.pow(1024, 3)));
    eq(B.parseLine('700 MiB').bytes, 700 * Math.pow(1024, 2));
    eq(B.parseLine('1 PiB').bytes, Math.pow(1024, 5));
});

check('单位大小写不敏感', () => {
    eq(B.parseLine('1 kib').bytes, 1024);
    eq(B.parseLine('1 GB').bytes, B.parseLine('1 gb').bytes);
});

check('看不懂的单位不当成大小', () => {
    eq(B.parseLine('1 xyz').ok, false);
});

check('超过上限报 too-large', () => {
    eq(B.parseLine('999999999999999999999').code, 'too-large');
});

console.log('\n=== 输入解析：字节序列 ===');

check('空格分隔的 hex', () => {
    eq(bytesOf('1f 8b 08'), [0x1f, 0x8b, 0x08]);
    eq(bytesOf('FF fe'), [0xff, 0xfe]);
});

check('连续 hex / 逗号 / 短横线', () => {
    eq(bytesOf('1f8b0800'), [0x1f, 0x8b, 0x08, 0x00]);
    eq(bytesOf('1f,8b,08'), [0x1f, 0x8b, 0x08]);
    eq(bytesOf('1f-8b-08'), [0x1f, 0x8b, 0x08]);
});

check('字节数组 [0x1f, 0x8b]', () => {
    eq(bytesOf('[0x1f, 0x8b, 0x08]'), [0x1f, 0x8b, 0x08]);
    eq(bytesOf('[0x00]'), [0x00]);
});

check('二进制串', () => {
    eq(bytesOf('00011111 10001011'), [0x1f, 0x8b]);
});

check('十进制数组（整串没有 a-f 时）', () => {
    eq(bytesOf('200 100 50'), [200, 100, 50]);
});

check('整串统一进制：混了 a-f 就全按 hex 解', () => {
    // 1f 10 -> 0x1f, 0x10；不能把 10 当成十进制 10
    eq(bytesOf('1f 10'), [0x1f, 0x10]);
});

check('xxd 输出（偏移列 + ASCII 列都能吃掉）', () => {
    const xxd = [
        '00000000: 1f8b 0800 0000 0000 0003  ................',
        '00000010: 0a                       .'
    ].join('\n');
    eq(bytesOf(xxd), [0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03, 0x0a]);
});

check('带 0x 前缀混写', () => {
    eq(bytesOf('0x1f 0x8b 0x08'), [0x1f, 0x8b, 0x08]);
});

check('非法 token 拒收', () => {
    eq(B.parseLine('zz zz').ok, false);
    eq(B.parseLine('1f 2f 3f kk').ok, false);
});

console.log('\n=== 三种写法 ===');

const sample = new Uint8Array([0x1f, 0x8b, 0x08, 0x00, 0x41, 0x42, 0x7f]);

check('hex dump 是 xxd 风格：偏移 8 位 + 16 字节 + ASCII 列', () => {
    const dump = B.toHexDump(sample);
    const lines = dump.split('\n');
    eq(lines.length, 1);
    if (lines[0].indexOf('00000000: 1f8b 0800 4142 7f') !== 0) {
        throw new Error('开头不对: ' + lines[0]);
    }
    if (lines[0].indexOf('|....AB.|') < 0) throw new Error('ASCII 列不对: ' + lines[0]);
});

check('hex dump 满 16 字节换行', () => {
    const data = new Uint8Array(20);
    const lines = B.toHexDump(data).split('\n');
    eq(lines.length, 2);
    if (lines[0].indexOf('00000000:') !== 0) throw new Error('首行偏移不对');
    if (lines[1].indexOf('00000010:') !== 0) throw new Error('次行偏移不对');
});

check('字节数组：0x 前缀、逗号分隔', () => {
    eq(B.toByteArray(sample), '[0x1f, 0x8b, 0x08, 0x00, 0x41, 0x42, 0x7f]');
});

check('二进制串：每字节 8 位', () => {
    eq(B.toBinary(new Uint8Array([0x1f, 0x8b])), '00011111 10001011');
});

check('三种写法都能被 parseSequence 读回去（往返一致）', () => {
    const forms = [
        B.toHexDump(sample),
        B.toByteArray(sample),
        B.toBinary(sample),
        '1f 8b 08 00 41 42 7f'
    ];
    forms.forEach((text) => {
        eq(bytesOf(text), Array.from(sample), text.slice(0, 20));
    });
});

check('大一点的数据往返也一致', () => {
    const data = new Uint8Array(64);
    for (let i = 0; i < data.length; i++) data[i] = i * 3;
    eq(bytesOf(B.toHexDump(data)), Array.from(data));
    eq(bytesOf(B.toByteArray(data)), Array.from(data));
    eq(bytesOf(B.toBinary(data)), Array.from(data));
});

check('forms() 给了全文和预览，超长时标记截断', () => {
    const big = new Uint8Array(2048);
    const f = B.forms(big);
    eq(f.hexDump.clipped, true);
    eq(f.hexDump.preview.length, B.LIMITS.preview);
    if (f.hexDump.full.length <= B.LIMITS.preview) throw new Error('全文不该被裁');
    const small = B.forms(sample);
    eq(small.byteArray.clipped, false);
});

console.log('\n=== 批量 ===');

check('多行逐条解析、空行跳过', () => {
    const r = B.parse('1234567890\n\n1.5 GB\n734003200\n');
    eq(r.rows.length, 3);
    eq(r.okCount, 3);
    eq(r.total, 1234567890 + 1500000000 + 734003200);
});

check('坏行单独标出来，不影响其它行', () => {
    const r = B.parse('100\nzzz\n200');
    eq(r.rows.length, 3);
    eq(r.rows[1].ok, false);
    eq(r.okCount, 2);
    eq(r.total, 300);
});

check('批量里夹一行字节序列：total 按字节数算，firstData 拿到内容', () => {
    const r = B.parse('10\n1f 8b 08');
    eq(r.total, 13);
    eq(Array.from(r.firstData), [0x1f, 0x8b, 0x08]);
});

check('全是坏行时 ok=false', () => {
    const r = B.parse('zzz\nyyy');
    eq(r.ok, false);
    eq(r.okCount, 0);
});

check('空输入返回空结果', () => {
    const r = B.parse('   \n  ');
    eq(r.rows.length, 0);
    eq(r.total, 0);
});

check('行数超上限会标记 truncated', () => {
    const lines = [];
    for (let i = 0; i < B.LIMITS.maxLines + 10; i++) lines.push(String(i + 1));
    const r = B.parse(lines.join('\n'));
    eq(r.rows.length, B.LIMITS.maxLines);
    eq(r.truncated, true);
});

check('单个序列超字节上限报 too-many', () => {
    const tokens = [];
    for (let i = 0; i < B.LIMITS.maxSeq + 1; i++) tokens.push('00');
    eq(B.parseLine(tokens.join(' ')).code, 'too-many');
});

console.log('\n--- bytes: ' + pass + '/' + (pass + fail) + ' passed ---');
if (fail) process.exit(1);
