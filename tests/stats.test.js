/*
 * stats.js 单测：分隔符嗅探、表格解析、列统计、分组聚合、输出格式。
 * 都是纯函数，直接 node 跑。
 */
const S = require('../ui/js/stats.js');

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

function near(actual, expected, label, eps) {
    if (!(Math.abs(actual - expected) <= (eps || 1e-9))) {
        throw new Error((label || '') + ' 期望 ' + expected + '，实际 ' + actual);
    }
}

console.log('=== 分隔符嗅探 ===');

check('Tab 优先（从表格软件复制出来的就是 Tab）', () => {
    eq(S.sniff('a\tb\tc\n1\t2\t3'), '\t');
});

check('竖线：每行列数一致就是它', () => {
    eq(S.sniff('20261027|3322106|2257|225706\n20261028|3322107|2258|225707'), '|');
});

check('逗号 CSV', () => {
    eq(S.sniff('name,qty\napple,3\npear,5'), ',');
});

check('列数不一致时挑最一致的那个', () => {
    // 逗号每行都切成 1 段（<2），竖线每行都是 3 段
    eq(S.sniff('a|b,c|d\n1|2,3|4'), '|');
});

check('只有一列 / 空文本退成 Tab', () => {
    eq(S.sniff('只有一列'), '\t');
    eq(S.sniff(''), '\t');
});

console.log('=== 解析 ===');

const TAB = 'date|channel|amount\n2026-01|线上|120\n2026-01|线下|80\n2026-02|线上|200';

check('首行当表头，行数不含表头', () => {
    const p = S.parse(TAB, { hasHeader: true });
    eq(p.header, ['date', 'channel', 'amount']);
    eq(p.rows.length, 3);
    eq(p.cols, 3);
    eq(p.totalRows, 3);
    eq(p.truncated, false);
});

check('没有表头时第一行也是数据', () => {
    const p = S.parse(TAB, { hasHeader: false });
    eq(p.header, null);
    eq(p.rows.length, 4);
    eq(p.rows[0], ['date', 'channel', 'amount']);
});

check('指定分隔符就不嗅了', () => {
    const p = S.parse('a,b|c\n1,2|3', { delimiter: ',', hasHeader: false });
    eq(p.delimiter, ',');
    eq(p.rows[0], ['a', 'b|c']);
});

check('末尾空行丢掉，短行补齐到最多列', () => {
    const p = S.parse('a|b|c\n1|2\n\n3|4|5\n\n', { hasHeader: true });
    eq(p.rows.length, 3);
    eq(p.rows[0], ['1', '2', '']);
    eq(p.rows[2], ['3', '4', '5']);
});

check('超长单元格截断加省略号（统计仍用原值前的部分）', () => {
    const long = 'x'.repeat(S.LIMITS.cell + 20);
    const p = S.parse('h\n' + long, { hasHeader: true });
    eq(p.rows[0][0].length, S.LIMITS.cell + 1);
    eq(p.rows[0][0].slice(-1), '…');
});

check('超行数上限：截断并置 truncated（上限算的是总行数，含表头）', () => {
    const lines = ['n'];
    for (let i = 0; i < S.LIMITS.rows + 5; i++) lines.push(String(i));
    const p = S.parse(lines.join('\n'), { hasHeader: true });
    eq(p.truncated, true);
    eq(p.rows.length, S.LIMITS.rows - 1);
});

// 行号是给「点预览行跳回编辑器那一行」用的：必须是原文里的行号，
// 不能是数据行的序号（中间有表头、有空行，两者会错开）
check('行号：有表头时数据行从第 2 行起', () => {
    const p = S.parse(TAB, { hasHeader: true });
    eq(p.lines, [2, 3, 4]);
    eq(p.headerLine, 1);
});

check('行号：没有表头时第 1 行就是数据', () => {
    const p = S.parse(TAB, { hasHeader: false });
    eq(p.lines, [1, 2, 3, 4]);
    eq(p.headerLine, 0);
});

check('行号：中间的空行也占一行，后面的行号跟着错开', () => {
    const p = S.parse('a|b|c\n1|2\n\n3|4|5\n\n', { hasHeader: true });
    eq(p.lines, [2, 3, 4]);
});

check('行号：开头空行被丢掉时从第 2 行算起', () => {
    const p = S.parse('\na|b\n1|2\n3|4', { hasHeader: true });
    eq(p.headerLine, 2);
    eq(p.lines, [3, 4]);
});

console.log('=== 数字识别 ===');

check('整数 / 小数 / 正负号 / 指数', () => {
    eq(S.toNumber('12'), 12);
    eq(S.toNumber(' 12.5 '), 12.5);
    eq(S.toNumber('-3'), -3);
    eq(S.toNumber('+4.25'), 4.25);
    eq(S.toNumber('1e3'), 1000);
});

check('千分位认，别的不认', () => {
    eq(S.toNumber('1,280.50'), 1280.5);
    eq(S.toNumber('1,28'), null);
    eq(S.toNumber('12%'), null);
    eq(S.toNumber('¥12'), null);
});

check('空值 / 文本 / null 都不是数字', () => {
    eq(S.toNumber(''), null);
    eq(S.toNumber('   '), null);
    eq(S.toNumber('abc'), null);
    eq(S.toNumber(null), null);
    eq(S.toNumber(undefined), null);
});

console.log('=== 列统计 ===');

check('计数含空值，求和/均值只算数字', () => {
    const s = S.colStats(['10', '20', '', 'abc']);
    eq(s.count, 4);
    eq(s.filled, 3);
    eq(s.numeric, 2);
    eq(s.sum, 30);
    eq(s.mean, 15);
    eq(s.max, 20);
    eq(s.min, 10);
});

check('去重数不算空值', () => {
    const s = S.colStats(['a', 'a', 'b', '', '']);
    eq(s.distinct, 2);
});

check('总体标准差（除以 n）', () => {
    const s = S.colStats(['2', '4', '4', '4', '5', '5', '7', '9']);
    near(s.mean, 5, 'mean');
    near(s.stddev, 2, 'stddev');
});

check('没有数字时数值类指标是 NaN，不会变成 0', () => {
    const s = S.colStats(['a', 'b', '']);
    eq(Number.isNaN(s.sum), true);
    eq(Number.isNaN(s.mean), true);
    eq(Number.isNaN(s.stddev), true);
    eq(s.count, 3);
});

console.log('=== 分组聚合 ===');

const P = S.parse(TAB, { hasHeader: true });

check('不分组：每个勾选列一行', () => {
    const r = S.aggregate(P, { cols: [2], metrics: ['count', 'sum'] });
    eq(r.groupCol, -1);
    eq(r.rows.length, 1);
    eq(r.rows[0].group, '');
    eq(r.rows[0].col, 2);
    eq(r.rows[0].sum, 400);
    eq(r.rows[0].count, 3);
});

check('按第 2 列分组：组按首次出现排序，组内每列一行', () => {
    const r = S.aggregate(P, { cols: [2], groupCol: 1, metrics: ['sum', 'mean'] });
    eq(r.rows.map((x) => x.group), ['线上', '线下']);
    eq(r.rows.map((x) => x.sum), [320, 80]);
    eq(r.rows.map((x) => x.mean), [160, 80]);
});

check('多列统计：列顺序按传入的 cols 走', () => {
    const r = S.aggregate(P, { cols: [1, 0], metrics: ['count'] });
    eq(r.rows.map((x) => x.col), [1, 0]);
});

check('越界的列下标被忽略；没有合法列就没有行', () => {
    const r = S.aggregate(P, { cols: [9, -1], metrics: ['count'] });
    eq(r.rows.length, 0);
});

check('分组列越界按不分组处理', () => {
    const r = S.aggregate(P, { cols: [2], groupCol: 9, metrics: ['count'] });
    eq(r.groupCol, -1);
    eq(r.rows.length, 1);
});

check('未知统计方式被过滤，只剩认识的', () => {
    const r = S.aggregate(P, { cols: [2], metrics: ['sum', 'nope'] });
    eq(r.metrics, ['sum']);
});

check('一个统计方式都不给就用默认那四个', () => {
    const r = S.aggregate(P, { cols: [2], metrics: [] });
    eq(r.metrics, S.DEFAULT_METRICS);
});

console.log('=== 输出 ===');

check('整数不带小数点，小数留四位', () => {
    eq(S.formatNum(12), '12');
    eq(S.formatNum(12.5), '12.5');
    eq(S.formatNum(1 / 3), '0.3333');
    eq(S.formatNum(0.1 + 0.2), '0.3');
});

check('NaN / Infinity / null 都是破折号', () => {
    eq(S.formatNum(NaN), '—');
    eq(S.formatNum(Infinity), '—');
    eq(S.formatNum(null), '—');
    eq(S.formatNum(undefined), '—');
});

check('单列取全部值（不受预览 20 行限制）', () => {
    eq(S.columnText(P, 1), ['线上', '线下', '线上']);
});

check('多列复制：表头 + 每行一条记录，Tab 分隔', () => {
    const tsv = S.columnsTsv(P, [0, 1], (i) => P.header[i]);
    eq(tsv.split('\n'), [
        'date\tchannel',
        '2026-01\t线上',
        '2026-01\t线下',
        '2026-02\t线上'
    ]);
});

check('多列复制：不给列名就用序号，越界列被丢掉，空选择返回空串', () => {
    eq(S.columnsTsv(P, [2]).split('\n')[0], '3');
    // 9 越界被丢掉，只剩第 1 列，名字按「序号」给
    const only = S.columnsTsv(P, [0, 9]).split('\n');
    eq(only[0], '1');
    eq(only.length, 4);        // 表头 + 3 行
    eq(S.columnsTsv(P, []), '');
    eq(S.columnsTsv(P, [9]), '');
});

check('toTsv：表头 + 每行，制表符分隔', () => {
    const r = S.aggregate(P, { cols: [2], groupCol: 1, metrics: ['count', 'sum'] });
    const tsv = S.toTsv(r, {
        group: '分组',
        col: '统计列',
        metric: (m) => ({ count: '计数', sum: '求和' }[m] || m),
        colName: (i) => '列' + (i + 1) + (P.header && P.header[i] ? '(' + P.header[i] + ')' : '')
    });
    eq(tsv.split('\n'), [
        '分组\t统计列\t计数\t求和',
        '线上\t列3(amount)\t2\t320',
        '线下\t列3(amount)\t1\t80'
    ]);
});

check('不分组时输出没有分组列', () => {
    const r = S.aggregate(P, { cols: [2], metrics: ['count'] });
    const tsv = S.toTsv(r, { col: 'col', metric: (m) => m, colName: (i) => 'C' + i });
    eq(tsv.split('\n'), ['col\tcount', 'C2\t3']);
});

console.log('\n--- stats: ' + pass + '/' + (pass + fail) + ' passed ---');
if (fail) process.exit(1);
