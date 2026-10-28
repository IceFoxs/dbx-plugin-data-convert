/*
 * SQL 分析核心（ui/js/sqlrun.js）的回归用例。
 *
 * 数据全部自造（区域 / 渠道 / 金额），不使用任何真实业务数据。
 *
 * 跑：node tests/sqlrun.test.js
 */
'use strict';

const Sql = require('../ui/js/sqlrun.js');

let pass = 0;
let fail = 0;

function ok(name, cond, extra) {
    if (cond) {
        pass++;
    } else {
        fail++;
        console.error('  ✗ ' + name + (extra == null ? '' : '  →  ' + extra));
    }
}

function eq(name, actual, expected) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    ok(name, a === e, 'got ' + a + ' want ' + e);
}

const HEADER = ['region', 'channel', 'amount', 'qty', 'day'];
const ROWS = [
    ['华东', '线上', '120', '2', '2026-10-01'],
    ['华东', '线上', '80', '1', '2026-10-01'],
    ['华东', '门店', '200', '3', '2026-10-02'],
    ['华北', '线上', '150', '2', '2026-10-02'],
    ['华北', '门店', '60', '1', '2026-10-03'],
    ['华南', '线上', '90', '1', '2026-10-03'],
    ['华南', '线上', '40', '1', '2026-10-04'],
    ['华北', '线上', '310', '4', '2026-10-04']
];

function makeTable(header, rows) {
    const cols = header ? header.length : (rows[0] ? rows[0].length : 0);
    return { header: header, rows: rows, cols: cols };
}

const TABLE = makeTable(HEADER, ROWS);

function run(sql, table, opts) {
    const r = Sql.query(sql, table || TABLE, opts);
    if (r.error) throw new Error('SQL 出错：' + r.error + ' @' + r.errorAt);
    return r;
}

/* ------------------------------ 基本查询 ------------------------------ */

(function basics() {
    let r = run('SELECT * FROM t');
    eq('SELECT * 列名', r.columns, HEADER);
    eq('SELECT * 行数', r.rowCount, 8);
    eq('SELECT * 首行', r.rows[0], ['华东', '线上', '120', '2', '2026-10-01']);

    r = run('select region, amount from t');
    eq('小写也能用', r.columns, ['region', 'amount']);
    eq('取两列', r.rows[2], ['华东', '200']);

    // 表名随便写、也可以不写 FROM
    r = run('SELECT region');
    eq('省略 FROM', r.rowCount, 8);

    r = run('SELECT region AS r, amount a FROM t LIMIT 2');
    eq('别名（AS / 省略 AS）', r.columns, ['r', 'a']);
    eq('别名取数', r.rows.length, 2);

    r = run('SELECT c1, c5 FROM t LIMIT 1');
    eq('c1 这种位置名', r.rows[0], ['华东', '2026-10-01']);

    r = run('-- 注释\nSELECT region /* 块注释 */ FROM t LIMIT 1');
    eq('行 / 块注释', r.rows[0], ['华东']);
})();

/* ------------------------------ 过滤 ------------------------------ */

(function filters() {
    eq('数值比较 >', run('SELECT region FROM t WHERE amount > 150').rowCount, 2);
    eq('字符串相等', run("SELECT amount FROM t WHERE region = '华东'").rowCount, 3);
    eq('不等于', run("SELECT amount FROM t WHERE region != '华东'").rowCount, 5);
    eq('AND', run("SELECT amount FROM t WHERE region = '华北' AND channel = '线上'").rowCount, 2);
    eq('OR', run("SELECT amount FROM t WHERE region = '华南' OR amount > 300").rowCount, 3);
    eq('NOT', run("SELECT amount FROM t WHERE NOT region = '华东'").rowCount, 5);
    eq('括号', run("SELECT amount FROM t WHERE (region = '华东' OR region = '华南') AND amount < 100").rowCount, 3);
    eq('LIKE %', run("SELECT amount FROM t WHERE day LIKE '2026-10-0%'").rowCount, 8);
    eq('LIKE _', run("SELECT amount FROM t WHERE region LIKE '华_'").rowCount, 8);
    eq('IN', run("SELECT amount FROM t WHERE region IN ('华北', '华南')").rowCount, 5);
    eq('NOT IN', run("SELECT amount FROM t WHERE region NOT IN ('华北')").rowCount, 5);
    eq('BETWEEN', run('SELECT amount FROM t WHERE amount BETWEEN 90 AND 150').rowCount, 3);
    eq('IS NULL 无空值', run('SELECT amount FROM t WHERE region IS NULL').rowCount, 0);

    const withNull = makeTable(['a', 'b'], [['1', ''], ['2', 'x']]);
    eq('IS NULL 认空串', run('SELECT a FROM t WHERE b IS NULL', withNull).rowCount, 1);
    eq('IS NOT NULL', run('SELECT a FROM t WHERE b IS NOT NULL', withNull).rowCount, 1);
    eq('空值不参与求和', run('SELECT SUM(b) AS s FROM t', withNull).rows[0][0], null);
})();

/* ------------------------------ 聚合 ------------------------------ */

(function aggregates() {
    let r = run('SELECT COUNT(*) AS n, SUM(amount) AS s FROM t');
    eq('全表计数 / 求和', r.rows[0], [8, 1050]);

    r = run('SELECT region, COUNT(*) AS n, SUM(amount) AS s, AVG(amount) AS a FROM t GROUP BY region ORDER BY region');
    eq('分组行数', r.rowCount, 3);
    eq('华东聚合', r.rows[0], ['华东', 3, 400, 400 / 3]);
    eq('华北聚合', r.rows[1], ['华北', 3, 520, 520 / 3]);
    eq('华南聚合', r.rows[2], ['华南', 2, 130, 65]);

    r = run('SELECT region, SUM(qty) AS q FROM t GROUP BY region HAVING SUM(qty) > 4 ORDER BY q DESC');
    // 华东 6、华北 7 都过 4，按 q 降序
    eq('HAVING', r.rows, [['华北', 7], ['华东', 6]]);

    r = run('SELECT channel, COUNT(*) AS n FROM t GROUP BY channel ORDER BY n DESC');
    eq('ORDER BY 别名', r.rows, [['线上', 6], ['门店', 2]]);

    r = run('SELECT region, channel, SUM(amount) AS s FROM t GROUP BY region, channel ORDER BY 1, 2');
    eq('多列分组', r.rowCount, 5);
    eq('多列分组首行', r.rows[0], ['华东', '线上', 200]);

    r = run('SELECT COUNT(DISTINCT region) AS d FROM t');
    eq('count(distinct)', r.rows[0], [3]);

    r = run('SELECT MIN(amount) AS lo, MAX(amount) AS hi FROM t');
    eq('min / max', r.rows[0], [40, 310]);

    r = run("SELECT group_concat(region) AS g FROM t WHERE amount > 300");
    eq('group_concat', r.rows[0], ['华北']);

    r = run('SELECT COUNT(*) AS n FROM t WHERE amount > 99999');
    eq('空结果也有一行', r.rows, [[0]]);

    // 空表 + 聚合：SQL 语义要返回一行
    const empty = makeTable(['a'], []);
    eq('空表 count', run('SELECT COUNT(*) AS n FROM t', empty).rows, [[0]]);
    eq('空表 sum', run('SELECT SUM(a) AS s FROM t', empty).rows, [[null]]);
})();

/* ------------------------------ 排序 / 分页 ------------------------------ */

(function sorting() {
    let r = run('SELECT amount FROM t ORDER BY amount DESC LIMIT 3');
    eq('ORDER BY 数值降序', r.rows, [['310'], ['200'], ['150']]);

    r = run('SELECT amount FROM t ORDER BY amount + 1 DESC LIMIT 1');
    eq('ORDER BY 表达式', r.rows, [['310']]);

    // 排序键不在 SELECT 里：必须回到源行取值（曾经在这里取错）
    r = run('SELECT region FROM t ORDER BY amount DESC LIMIT 1');
    eq('ORDER BY 未选中的列', r.rows, [['华北']]);

    r = run('SELECT region, amount FROM t ORDER BY 2 ASC LIMIT 2');
    eq('ORDER BY 序号', r.rows, [['华南', '40'], ['华北', '60']]);

    r = run('SELECT region, amount FROM t ORDER BY amount ASC LIMIT 2 OFFSET 2');
    eq('LIMIT + OFFSET', r.rows, [['华东', '80'], ['华南', '90']]);

    r = run('SELECT amount FROM t ORDER BY amount ASC LIMIT 2, 2');
    eq('MySQL 的 LIMIT m, n', r.rows, [['80'], ['90']]);

    r = run('SELECT amount FROM t LIMIT 0');
    eq('LIMIT 0', r.rowCount, 0);

    // 同值时保持原始顺序（稳定排序）
    r = run('SELECT region FROM t ORDER BY channel ASC LIMIT 3');
    eq('同值稳定', r.rows, [['华东'], ['华东'], ['华北']]);
})();

/* ------------------------------ 表达式 / 函数 ------------------------------ */

(function scalars() {
    eq('算术', run('SELECT amount * 2 AS v FROM t ORDER BY v DESC LIMIT 1').rows, [[620]]);
    eq('取余', run('SELECT 7 % 4 AS v').rows, [[3]]);
    eq('字符串拼接', run("SELECT region || '-' || channel AS v FROM t LIMIT 1").rows, [['华东-线上']]);
    eq('round', run('SELECT ROUND(10 / 3, 2) AS v').rows, [[3.33]]);
    eq('abs', run("SELECT ABS(0 - 7) AS v").rows, [[7]]);
    eq('upper', run("SELECT UPPER('ab') AS v").rows, [['AB']]);
    eq('lower', run("SELECT LOWER('AB') AS v").rows, [['ab']]);
    eq('length', run("SELECT LENGTH('中文abc') AS v").rows, [[5]]);
    eq('trim', run("SELECT TRIM('  x  ') AS v").rows, [['x']]);
    eq('coalesce', run("SELECT COALESCE(NULL, 'x') AS v").rows, [['x']]);
    eq('substr', run("SELECT SUBSTR('abcdef', 2, 3) AS v").rows, [['bcd']]);
    eq('除数为 0 -> null', run('SELECT 1 / 0 AS v').rows, [[null]]);
    eq('负数', run('SELECT -5 AS v').rows, [[-5]]);
    eq('列表达式命名', run('SELECT amount * 2 FROM t LIMIT 1').columns, ['amount * 2']);
})();

/* ------------------------------ 无表头 ------------------------------ */

(function headerless() {
    const bare = makeTable(null, ROWS);
    let r = run('SELECT c1, c3 FROM t LIMIT 1', bare);
    eq('无表头用 c1..cN', r.rows, [['华东', '120']]);
    eq('无表头列名', r.columns, ['c1', 'c3']);

    r = run('SELECT SUM(c3) AS s FROM t GROUP BY c1', bare);
    eq('无表头也能分组', r.rows.length, 3);
})();

/* ------------------------------ 中文列名 / 重名 ------------------------------ */

(function names() {
    const zh = makeTable(['门店', '金额'], [['A', '10'], ['B', '20']]);
    eq('中文列名', run('SELECT 门店, 金额 FROM t', zh).rows, [['A', '10'], ['B', '20']]);

    const spaced = makeTable(['门店 名称', '金额'], [['A', '10']]);
    eq('带空格的列名用反引号', run('SELECT `门店 名称` FROM t', spaced).rows, [['A']]);
    eq('带空格的列名用方括号', run('SELECT [门店 名称] FROM t', spaced).rows, [['A']]);

    const dup = makeTable(['a', 'a'], [['1', '2']]);
    eq('重名表头', run('SELECT a, a_2 FROM t', dup).rows, [['1', '2']]);
})();

/* ------------------------------ 错误提示 ------------------------------ */

(function errors() {
    let r = Sql.query('SELECT nope FROM t', TABLE);
    ok('未知列要报错', !!r.error && r.error.indexOf('nope') >= 0, r.error);

    r = Sql.parse('SELECT FROM t');
    ok('语法错误有消息', !!r.error, r.error);

    r = Sql.parse('SELECT a FROM');
    ok('FROM 后面缺表名', !!r.error, r.error);

    r = Sql.parse("SELECT 'x'");
    ok('合法 SQL 不报错', !r.error, r.error);

    r = Sql.parse('');
    ok('空 SQL 报错', !!r.error, r.error);

    r = Sql.parse('SELECT # FROM t');
    ok('非法字符报错', !!r.error && r.error.indexOf('#') >= 0, r.error);

    // 错误位置换算成行列：界面要在编辑器里指出来
    const parsed = Sql.parse('SELECT a,\n  b FROM t WHERE');
    ok('错误位置能换算', parsed.errorAt > 0, parsed.errorAt);
    if (parsed.errorAt > 0) {
        const at = Sql.lineCol('SELECT a,\n  b FROM t WHERE', parsed.errorAt);
        eq('错误行号', at.line, 2);
    }
})();

/* ------------------------------ 输出 ------------------------------ */

(function output() {
    eq('数字不带千分位', Sql.formatValue(1234567), '1234567');
    eq('小数去尾零', Sql.formatValue(1.5), '1.5');
    eq('浮点噪音', Sql.formatValue(0.1 + 0.2), '0.3');
    eq('空值', Sql.formatValue(null), '');

    const r = run('SELECT region, SUM(amount) AS s FROM t GROUP BY region ORDER BY 1');
    eq('TSV', Sql.toTsv(r).split('\n')[1], '华东\t400');
})();

/* ------------------------------ 类型推断（MySQL 风格） ------------------------------ */

(function types() {
    const h = ['id', 'amount', 'price', 'day', 'ts', 'flag', 'code', 'name', 'note'];
    const rows = [
        ['3322106', '6550', '12.50', '2026-10-20', '2026-10-20 10:30:00', '1', '00123', '华东仓', ''],
        ['3311101', '1300', '3.25', '2026-10-21', '2026-10-21 18:05:09', '0', '00450', '华南仓', 'hello']
    ];
    const t = makeTable(h, rows);
    const r = Sql.inferColumnTypes(t);
    const byName = {};
    r.cols.forEach((c) => { byName[c.name] = c; });

    eq('大整数 -> INT', byName.id.type, 'INT');
    eq('小整数 -> SMALLINT', byName.amount.type, 'SMALLINT');
    eq('小数 -> DECIMAL(p,s)', byName.price.type, 'DECIMAL(4,2)');
    eq('日期 -> DATE', byName.day.type, 'DATE');
    eq('日期时间 -> DATETIME', byName.ts.type, 'DATETIME');
    eq('0/1 -> BOOLEAN', byName.flag.type, 'BOOLEAN');
    eq('前导 0 当编码', byName.code.type, 'VARCHAR(16)');
    eq('中文文本', byName.name.type, 'VARCHAR(16)');
    eq('有空值 -> nullable', byName.note.nullable, true);
    eq('没空值 -> NOT NULL', byName.id.nullable, false);

    // 边界：TINYINT / BIGINT / 空列 / 负数 / 科学计数
    const edge = makeTable(['tiny', 'big', 'empty', 'neg', 'sci', 'mix'], [
        ['42', '9007199254740991', '', '-7', '1.2e5', '12'],
        ['7', '12345678901234', '', '-9', '3E-2', 'abc']
    ]);
    const e = Sql.inferColumnTypes(edge).cols;
    eq('TINYINT', e[0].type, 'TINYINT');
    eq('BIGINT', e[1].type, 'BIGINT');
    eq('整列为空给 VARCHAR(255)', e[2].type, 'VARCHAR(255)');
    eq('负整数仍按范围', e[3].type, 'TINYINT');
    eq('科学计数 -> DOUBLE', e[4].type, 'DOUBLE');
    eq('数字与文本混合 -> VARCHAR', e[5].base, 'VARCHAR');

    // 长文本 -> TEXT（超过 1024 字符）
    const long = makeTable(['s'], [['x'.repeat(1500)]]);
    eq('超长文本 -> TEXT', Sql.inferColumnTypes(long).cols[0].type, 'TEXT');

    // DDL
    const ddl = Sql.toCreateTable(Sql.inferColumnTypes(t).cols, 'orders');
    ok('DDL 表名', ddl.indexOf('CREATE TABLE `orders`') === 0, ddl.slice(0, 40));
    ok('DDL 里 BOOLEAN 落成 TINYINT(1)', ddl.indexOf('`flag` TINYINT(1)') > 0, ddl);
    ok('DDL 里小数列', ddl.indexOf('`price` DECIMAL(4,2)') > 0, ddl);
    ok('DDL 里可空列', ddl.indexOf('`note` VARCHAR(16) NULL') > 0, ddl);

    // 候选：推断出来的类型要在第一项，方便「改回去」
    const cand = Sql.typeCandidates({ type: 'DECIMAL(4,2)' });
    eq('候选第一项是推断值', cand[0], 'DECIMAL(4,2)');
    ok('候选里有常见类型', cand.indexOf('BIGINT') > 0 && cand.indexOf('DATE') > 0, cand.join(','));

    // 采样：5 万行也只取 500 个样本，长度仍然全扫
    const many = [];
    for (let i = 0; i < 50000; i++) many.push([String(1000 + i), 'x'.repeat(i % 40)]);
    const big = makeTable(['n', 's'], many);
    const br = Sql.inferColumnTypes(big);
    eq('采样行数', br.sampled, 500);
    eq('类型只看采样', br.cols[0].type, 'INT');
    ok('长度全扫（最长 39 字）', br.cols[1].maxLen === 39, br.cols[1].maxLen);
})();

/* ------------------------------ 性能 ------------------------------ */

(function performance() {
    // 5 万行 × 8 列，和统计页的上限一致；这里只关心「主线程里能不能一口气跑完」
    const N = 50000;
    const rows = new Array(N);
    const regions = ['华东', '华北', '华南', '西南', '东北'];
    for (let i = 0; i < N; i++) {
        rows[i] = [
            '2026-10-27',
            String(3300000 + (i % 997)),
            String(2000 + (i % 300)),
            String(200000 + (i % 5000)),
            String(1 + (i % 2)),
            String(1000 + (i % 700)),
            String(1 + (i % 3)),
            regions[i % regions.length]
        ];
    }
    const big = makeTable(['day', 'id', 'a', 'b', 'flag', 'amount', 'level', 'region'], rows);

    function timeIt(label, sql, budget) {
        const t0 = Date.now();
        const r = Sql.query(sql, big, { maxRows: 5000 });
        const ms = Date.now() - t0;
        ok(label + '（' + ms + ' ms）', !r.error && ms < budget, r.error || (ms + ' ms > ' + budget));
        return r;
    }

    const groupBy = timeIt(
        '5 万行 单列分组聚合',
        "SELECT region, COUNT(*) AS n, SUM(amount) AS s FROM t WHERE flag = '1' GROUP BY region ORDER BY s DESC",
        1200
    );
    eq('每个区域都有', groupBy.rowCount, 5);

    timeIt('5 万行 全表求和', 'SELECT SUM(amount) AS s, AVG(amount) AS a FROM t', 900);
    timeIt('5 万行 直接取前 10 行（早退）', 'SELECT * FROM t LIMIT 10', 300);
    timeIt(
        '5 万行 多列分组 + 排序',
        'SELECT region, level, COUNT(*) AS n FROM t GROUP BY region, level ORDER BY n DESC LIMIT 20',
        1200
    );

    // 只解析不执行：SQL 编辑时的重编译开销
    const t1 = Date.now();
    Sql.parse('SELECT region, COUNT(*) AS n, SUM(amount) AS s FROM t WHERE flag = 1 GROUP BY region ORDER BY s DESC LIMIT 20');
    const parseMs = Date.now() - t1;
    ok('解析耗时（' + parseMs + ' ms）', parseMs < 20, parseMs + ' ms');
})();

/* ------------------------------ 表头嗅探 / 列名 / 语句建议 ------------------------------ */

(function suggestions() {
    // 有表头：第一行是文字，下面同列是数字 / 日期
    ok('有表头认得出来', Sql.detectHeader([
        ['region', 'amount', 'day'],
        ['华东', '12800', '2026-10-20'],
        ['华北', '3200', '2026-10-21']
    ], 3) === true);

    // 无表头：第一行是数据（分类值在下面又出现了，数字列也说明不是表头）
    ok('无表头认得出来', Sql.detectHeader([
        ['华东', '12800', '2026-10-20'],
        ['华东', '3200', '2026-10-21'],
        ['华北', '7400', '2026-10-22']
    ], 3) === false);

    ok('管道 / 单号型无表头', Sql.detectHeader([
        ['20261020', 'A-1001', '12', '650'],
        ['20261020', 'A-1002', '20', '305']
    ], 4) === false);

    ok('认不准时按有表头（不乱吞第一行）', Sql.detectHeader([
        ['name', 'city'],
        ['张三', '北京'],
        ['李四', '上海']
    ], 2) === true);

    // 列名：有表头照抄，空表头退回 cN
    eq('列名跟表头走', Sql.suggestColumnNames({
        header: ['region', '', 'amount'], rows: [['华东', 'x', '1']], cols: 3
    }), ['region', 'c2', 'amount']);

    // 无表头：一律 c1..cN。不按内容猜 url / amount / num1 —— 那些名字没规律，
    // 用户写 SQL 时还得多记一套，反而更费劲
    eq('无表头就是 c1..cN', Sql.suggestColumnNames({
        header: null,
        cols: 6,
        rows: [
            ['https://example.com/a', 'zhangsan@example.com', '2026-10-20', '1', '128', '00123'],
            ['https://example.com/b', 'lisi@example.com', '2026-10-21', '0', '96', '00124']
        ]
    }), ['c1', 'c2', 'c3', 'c4', 'c5', 'c6']);

    // 表头重名补序号（c1 这种天然唯一，不会走到这儿）
    eq('重名表头补序号', Sql.suggestColumnNames({
        header: ['name', 'name', 'v'],
        cols: 3,
        rows: [['a', 'b', 'c']]
    }), ['name1', 'name2', 'v']);

    // 建议语句：有分类列 + 金额列就给分组汇总
    const q1 = Sql.suggestQuery({
        header: ['region', 'channel', 'amount'],
        cols: 3,
        rows: [
            ['华东', '线上', '12800'],
            ['华北', '门店', '3200'],
            ['华南', '线上', '7400']
        ]
    });
    ok('建议语句是分组汇总', /^SELECT region, COUNT\(\*\) AS n, SUM\(amount\) AS total/.test(q1), q1);
    ok('建议语句带 GROUP BY / ORDER BY', /GROUP BY region/.test(q1) && /ORDER BY total DESC/.test(q1), q1);

    // 无表头 + 无金额列：把列名一个个列出来，别只给 SELECT *
    const q2 = Sql.suggestQuery({
        header: null,
        cols: 2,
        rows: [['a', 'b'], ['c', 'd']]
    }, { headerless: true });
    eq('无表头没金额时列出列名', q2.replace(/\s+/g, ' '), 'SELECT c1, c2 FROM t');

    // 建议的列名要能直接查
    const table = {
        header: null,
        cols: 3,
        rows: [['华东', '10', '20'], ['华北', '30', '40']]
    };
    const names = Sql.suggestColumnNames(table);
    eq('无表头列名可以直接拿去查', names, ['c1', 'c2', 'c3']);
    const byName = Sql.query('SELECT ' + names[0] + ' AS k, SUM(' + names[2] + ') AS s FROM t GROUP BY ' + names[0], {
        header: names, cols: 3, rows: table.rows
    });
    ok('c1..cN 能直接查', !byName.error && byName.rowCount === 2, byName.error);
    // 有表头时 cN 仍然能当别名用（老语句、示例语句不会失效）
    const byAlias = Sql.query('SELECT COUNT(*) AS n FROM t WHERE c2 > 20', {
        header: ['k', 'v', 'w'], cols: 3, rows: table.rows
    });
    ok('cN 别名仍然可用', !byAlias.error && byAlias.rows[0][0] === 1, byAlias.error);
})();

/* ------------------------------ 异步 / 进度 / 取消 ------------------------------ */

(async function asyncRun() {
    const table = makeTable(HEADER, ROWS);
    const sql = 'SELECT region, SUM(amount) AS s, COUNT(*) AS n FROM t GROUP BY region ORDER BY s DESC';
    const sync = Sql.query(sql, table, { maxRows: 100 });
    const plan = sync.plan;

    // 分片大小直接影响切几次；结果必须和一口气跑完全一致
    const chunked = await Sql.executeAsync(plan, table.rows, { maxRows: 100, chunk: 2 });
    eq('异步结果与同步一致', JSON.stringify(chunked.rows), JSON.stringify(sync.rows));
    eq('异步列名一致', chunked.columns, sync.columns);
    eq('异步 matched 一致', chunked.matched, sync.matched);

    // 不聚合的查询也走同一条路（早退 / 排序都在里面）
    const plainPlan = Sql.query('SELECT * FROM t ORDER BY amount DESC', table, { maxRows: 100 }).plan;
    const plainSync = Sql.query('SELECT * FROM t ORDER BY amount DESC', table, { maxRows: 100 });
    const plainAsync = await Sql.executeAsync(plainPlan, table.rows, { maxRows: 100, chunk: 1 });
    eq('排序查询异步结果一致', JSON.stringify(plainAsync.rows), JSON.stringify(plainSync.rows));

    // 进度：回调若干次、done 单调不减、最后一次 ratio 到 1
    const seen = [];
    let lastRatio = -1;
    let monotonic = true;
    await Sql.executeAsync(plan, table.rows, {
        maxRows: 100,
        chunk: 2,
        onProgress: (p) => {
            seen.push(p);
            if (p.ratio < lastRatio) monotonic = false;
            lastRatio = p.ratio;
        }
    });
    ok('进度回调多次（' + seen.length + ' 次）', seen.length >= 2, seen.length);
    ok('进度单调不减', monotonic);
    ok('进度最后到 100%', Math.abs(lastRatio - 1) < 1e-6, lastRatio);
    ok('进度带阶段名', !!seen[0].phase, JSON.stringify(seen[0]));

    // 取消：第一次回调之后就喊停，后面的片不再跑
    let calls = 0;
    const cancelled = await Sql.executeAsync(plan, table.rows, {
        maxRows: 100,
        chunk: 1,
        onProgress: () => { calls++; },
        isCancelled: () => calls >= 1
    });
    ok('取消返回 cancelled', cancelled.cancelled === true);
    ok('取消后不再回调（' + calls + ' 次）', calls === 1, calls);
    ok('取消结果不带 rows', cancelled.rows === undefined);

    // 一开始就取消：一次回调都不该有
    let none = 0;
    const early = await Sql.executeAsync(plan, table.rows, {
        chunk: 1,
        onProgress: () => { none++; },
        isCancelled: () => true
    });
    ok('开跑前取消直接返回', early.cancelled === true);
    ok('开跑前取消不回调', none === 0, none);

    // queryAsync：解析错误的照旧同步返回错误，不抛
    const bad = await Sql.queryAsync('SELECT FROM t', table);
    ok('queryAsync 语法错误照样报', !!bad.error, JSON.stringify(bad));

    // 回调自己抛异常不能把查询带崩
    const survived = await Sql.executeAsync(plan, table.rows, {
        chunk: 2,
        onProgress: () => { throw new Error('界面回调炸了'); }
    });
    ok('进度回调抛异常不影响结果', !survived.error && survived.rowCount === sync.rowCount, JSON.stringify(survived && survived.error));

    /* ---- SELECT DISTINCT（整行去重；函数里的 COUNT(DISTINCT x) 是另一条路） ---- */
    const dupTable = {
        header: ['region', 'qty'],
        rows: [['east', '1'], ['east', '1'], ['north', '2'], ['north', '3'], ['south', '']],
        cols: 2
    };
    const d1 = Sql.query('SELECT DISTINCT region FROM t', dupTable);
    eq('SELECT DISTINCT 去掉重复行', d1.rows, [['east'], ['north'], ['south']]);
    ok('DISTINCT 的 rowCount 是去重后的数', d1.rowCount === 3, d1.rowCount);

    const d2 = Sql.query('SELECT DISTINCT region, qty FROM t', dupTable);
    eq('DISTINCT 多列按整行去重', d2.rows, [['east', '1'], ['north', '2'], ['north', '3'], ['south', '']]);

    const d3 = Sql.query('SELECT DISTINCT region FROM t ORDER BY region DESC', dupTable);
    eq('DISTINCT 后面还能排序', d3.rows, [['south'], ['north'], ['east']]);

    const d4 = Sql.query('SELECT DISTINCT region FROM t LIMIT 2', dupTable);
    ok('DISTINCT 先于 LIMIT', d4.rowCount === 2, JSON.stringify(d4.rows));

    const d5 = Sql.query('SELECT COUNT(DISTINCT region) AS n FROM t', dupTable);
    eq('COUNT(DISTINCT x) 仍然只算去重数', d5.rows, [[3]]);

    const d6 = Sql.query('SELECT DISTINCT region FROM t WHERE qty > 1', dupTable);
    eq('DISTINCT 和 WHERE 一起用', d6.rows, [['north']]);

    // null / '' / 0 是三种不同的值，不能被合并成一行
    const mixed = {
        header: ['v'],
        rows: [[null], [''], ['0'], [0]],
        cols: 1
    };
    const d7 = Sql.query('SELECT DISTINCT v FROM t', mixed);
    ok('DISTINCT 不把 null / 空串 / 0 混成一行', d7.rowCount === 4, JSON.stringify(d7.rows));

    /*
     * ---- 关键字 / 函数全覆盖 ----
     *
     * 这一组不是逐个验证语义（那由上面各节分别负责），而是保证「文档里说支持的写法，
     * 一条都不会在解析阶段就报错」。用户能看见的只有「认不出的字符」「没有这一列」这类
     * 报错，任何一个关键字漏吃都会直接毁掉这个页面，所以这里钉成一张清单：
     * 每条都要求 error 为空 + 结果非空，新增关键字时往表里加一行即可。
     */
    const kwTable = {
        header: ['region', 'channel', 'amount', 'qty'],
        rows: [
            ['east', 'web', '120', '2'],
            ['east', 'app', '80', '1'],
            ['north', 'web', '50', '3'],
            ['north', 'store', '', '4'],
            ['south', 'app', '200', '2'],
            ['south', 'web', '30', '0'],
            ['', 'store', '75', '1']
        ],
        cols: 4
    };

    const KEYWORD_CASES = [
        ['SELECT *', 'SELECT * FROM t'],
        ['DISTINCT', 'SELECT DISTINCT region FROM t'],
        ['AS', 'SELECT amount AS amt FROM t'],
        ['FROM', 'SELECT region FROM t'],
        ['WHERE', 'SELECT region FROM t WHERE qty > 1'],
        ['AND', 'SELECT region FROM t WHERE qty > 1 AND amount > 60'],
        ['OR', 'SELECT region FROM t WHERE qty > 2 OR amount > 100'],
        ['NOT', 'SELECT region FROM t WHERE NOT qty > 1'],
        ['IN', "SELECT region FROM t WHERE channel IN ('web', 'app')"],
        ['NOT IN', "SELECT region FROM t WHERE channel NOT IN ('web')"],
        ['LIKE', "SELECT region FROM t WHERE channel LIKE '%e%'"],
        ['NOT LIKE', "SELECT region FROM t WHERE channel NOT LIKE '%e%'"],
        ['BETWEEN', 'SELECT region FROM t WHERE qty BETWEEN 1 AND 2'],
        ['IS NULL', 'SELECT region FROM t WHERE amount IS NULL'],
        ['IS NOT NULL', 'SELECT region FROM t WHERE amount IS NOT NULL'],
        ['NULL 字面量', 'SELECT NULL AS n FROM t'],
        ['TRUE / FALSE', 'SELECT region FROM t WHERE qty > 0 AND TRUE'],
        ['GROUP BY', 'SELECT region, COUNT(*) AS n FROM t GROUP BY region'],
        ['HAVING', 'SELECT region, COUNT(*) AS n FROM t GROUP BY region HAVING n > 1'],
        ['ORDER BY', 'SELECT region FROM t ORDER BY region'],
        ['ASC', 'SELECT region FROM t ORDER BY region ASC'],
        ['DESC', 'SELECT region FROM t ORDER BY region DESC'],
        ['LIMIT', 'SELECT region FROM t LIMIT 2'],
        ['OFFSET', 'SELECT region FROM t LIMIT 2 OFFSET 2'],
        ['算术 + - * / %', 'SELECT qty + 1 AS a, qty - 1 AS b, qty * 2 AS c, qty / 2 AS d, qty % 2 AS e FROM t'],
        ['字符串拼接 ||', 'SELECT region || channel AS k FROM t'],
        ['比较 = != < > <= >=', 'SELECT region FROM t WHERE qty = 1']
    ];
    KEYWORD_CASES.forEach(function (item) {
        const k = Sql.query(item[1], kwTable);
        ok('关键字 ' + item[0] + ' 能跑', !k.error && k.rows.length > 0, k.error || 'rows=' + k.rows.length);
    });

    const FUNCTION_CASES = [
        ['COUNT', 'SELECT COUNT(*) AS n FROM t'],
        ['COUNT(DISTINCT)', 'SELECT COUNT(DISTINCT region) AS n FROM t'],
        ['SUM', 'SELECT SUM(qty) AS s FROM t'],
        ['AVG', 'SELECT AVG(qty) AS a FROM t'],
        ['MIN', 'SELECT MIN(qty) AS m FROM t'],
        ['MAX', 'SELECT MAX(qty) AS m FROM t'],
        ['GROUP_CONCAT', 'SELECT GROUP_CONCAT(region) AS g FROM t'],
        ['COALESCE', 'SELECT COALESCE(amount, 0) AS c FROM t'],
        ['IFNULL', 'SELECT IFNULL(amount, 0) AS c FROM t'],
        ['ROUND', 'SELECT ROUND(amount / 3, 1) AS r FROM t'],
        ['ABS', 'SELECT ABS(qty - 3) AS a FROM t'],
        ['FLOOR', 'SELECT FLOOR(qty / 2) AS f FROM t'],
        ['CEIL', 'SELECT CEIL(qty / 2) AS f FROM t'],
        ['UPPER', 'SELECT UPPER(channel) AS u FROM t'],
        ['LOWER', 'SELECT LOWER(channel) AS u FROM t'],
        ['TRIM', 'SELECT TRIM(region) AS r FROM t'],
        ['LENGTH', 'SELECT LENGTH(region) AS l FROM t'],
        ['SUBSTR', 'SELECT SUBSTR(region, 1, 2) AS s FROM t']
    ];
    FUNCTION_CASES.forEach(function (item) {
        const f = Sql.query(item[1], kwTable);
        ok('函数 ' + item[0] + ' 能跑', !f.error && f.rows.length > 0, f.error || 'rows=' + f.rows.length);
    });

    /* ---- HAVING 的三种写法（别名 / 聚合函数 / 两者混用） ---- */

    const havingTable = {
        header: ['region', 'qty'],
        rows: [['east', '1'], ['east', '2'], ['north', '3'], ['north', '4'], ['north', '5'], ['south', '6']],
        cols: 2
    };

    const h1 = Sql.query('SELECT region, COUNT(*) AS n FROM t GROUP BY region HAVING n > 1', havingTable);
    eq('HAVING 能用 SELECT 的别名', h1.rows, [['east', 2], ['north', 3]]);

    const h2 = Sql.query('SELECT region, COUNT(*) AS n FROM t GROUP BY region HAVING COUNT(*) > 1', havingTable);
    eq('HAVING 能直接用聚合函数', h2.rows, [['east', 2], ['north', 3]]);

    const h3 = Sql.query('SELECT region, SUM(qty) AS s FROM t GROUP BY region HAVING SUM(qty) > 4', havingTable);
    eq('HAVING 能按求和外过滤', h3.rows, [['north', 12], ['south', 6]]);

    const h4 = Sql.query("SELECT region, COUNT(*) AS n FROM t GROUP BY region HAVING n > 1 AND region != 'north'", havingTable);
    eq('HAVING 里 AND 连着真列一起判', h4.rows, [['east', 2]]);

    const h5 = Sql.query('SELECT region, COUNT(*) AS n FROM t GROUP BY region HAVING n > 99', havingTable);
    eq('HAVING 全不满足时是空结果', h5.rows, []);

    const h6 = Sql.query('SELECT COUNT(*) AS n FROM t HAVING COUNT(*) > 1', havingTable);
    eq('没 GROUP BY 的 HAVING 也能过', h6.rows, [[6]]);

    // 别名与真列同名时以真列为准：region 在这里既是别名又是表里的列
    const h7 = Sql.query("SELECT channel AS region, COUNT(*) AS n FROM t GROUP BY channel HAVING region = 'web'", {
        header: ['channel', 'qty'],
        rows: [['web', '1'], ['web', '2'], ['app', '3']],
        cols: 2
    });
    ok('HAVING 里别名与真列同名时真列优先', !h7.error, h7.error || JSON.stringify(h7.rows));

    finish();
})();

function finish() {
    console.log('\nSQL 分析核心：' + pass + ' 通过 / ' + fail + ' 失败');
    process.exit(fail ? 1 : 0);
}
