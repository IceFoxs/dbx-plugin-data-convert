/*
 * chart.js 单测：JSON 形状判定、数据 -> option、尺寸夹取、各种上限。
 * 纯函数，node 直接跑（不加载 echarts）。
 */
const C = require('../ui/js/chart.js');

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

function ok(value, label) {
    if (!value) throw new Error(label || '断言失败');
}

console.log('=== 文本解析 ===');

check('空文本 -> empty', () => {
    eq(C.parseText('   ').code, 'empty');
    eq(C.parseText(null).code, 'empty');
});

check('坏 JSON -> json-invalid，带出错行号', () => {
    const r = C.parseText('{\n  "a": 1,\n  "b": ,\n}');
    eq(r.code, 'json-invalid');
    ok(r.detail && typeof r.detail.message === 'string', '缺 message');
    // 不同 JS 引擎的 message 措辞不同，行号能算出来就校验一下范围
    if (r.detail.line != null) ok(r.detail.line >= 1 && r.detail.line <= 4, '行号 ' + r.detail.line);
});

check('超过字符上限直接拦下', () => {
    const big = '[' + new Array(C.LIMITS.chars).join('1') + ']';
    eq(C.parseText(big).code, 'too-big');
});

check('正常 JSON 解析出值', () => {
    eq(C.parseText('[1,2,3]').value, [1, 2, 3]);
});

console.log('=== 形状判定 ===');

check('带 series 的对象是完整 option', () => {
    eq(C.classify({ series: [{ type: 'bar', data: [1, 2] }] }), 'option');
});

check('只有 xAxis 也算 option', () => {
    eq(C.classify({ xAxis: { type: 'category' }, series: [{ type: 'line', data: [] }] }), 'option');
    eq(C.classify({ yAxis: { type: 'value' } }), 'option');
});

check('series: [] 不算 option（没东西可画）', () => {
    eq(C.classify({ series: [] }), 'unknown');
});

check('纯数字数组 -> points', () => {
    eq(C.classify([1, 2, 3]), 'points');
});

check('[{name,value}] -> points', () => {
    eq(C.classify([{ name: 'A', value: 1 }, { name: 'B', value: 2 }]), 'points');
});

check('[["周一", 12]] 这种首列是字符串的按表格数据看待', () => {
    // 目前只认 [x:number, y:number] 的散点对，字符串首列走"单数字字段"规则失败 -> unknown
    eq(C.classify([['周一', 12], ['周二', 30]]), 'unknown');
});

check('[[1,2],[3,4]] -> pairs', () => {
    eq(C.classify([[1, 2], [3, 4]]), 'pairs');
});

check('{"A":1,"B":2} -> map', () => {
    eq(C.classify({ A: 1, B: 2 }), 'map');
});

check('数组里混了字符串 -> unknown', () => {
    eq(C.classify([1, 'a']), 'unknown');
    eq(C.classify([]), 'unknown');
    eq(C.classify('x'), 'unknown');
});

check('只带一个数字字段的对象也认', () => {
    eq(C.classify([{ month: '1月', sales: 12 }, { month: '2月', sales: 30 }]), 'points');
});

console.log('=== 数据 -> option ===');

check('数字数组默认折线：类目是 1..n，值原样', () => {
    const r = C.build([1, 2, 3], {});
    ok(r.option, r.code);
    eq(r.option.series[0].type, 'line');
    eq(r.option.xAxis.data, ['1', '2', '3']);
    eq(r.option.series[0].data, [1, 2, 3]);
    eq(r.option.animation, false);
    eq(r.meta.kind, 'points');
    eq(r.meta.points, 3);
});

check('带名字的对象数组默认柱状', () => {
    const r = C.build([{ name: 'A', value: 5 }, { name: 'B', value: 8 }], {});
    eq(r.option.series[0].type, 'bar');
    eq(r.option.xAxis.data, ['A', 'B']);
    eq(r.option.series[0].data, [5, 8]);
    eq(r.option.xAxis.boundaryGap, true);
});

check('饼图把 name/value 直接交给 data', () => {
    const r = C.build([{ name: 'A', value: 5 }, { name: 'B', value: 8 }], { type: 'pie' });
    eq(r.option.series[0].type, 'pie');
    eq(r.option.series[0].data, [{ name: 'A', value: 5 }, { name: 'B', value: 8 }]);
    eq(r.option.tooltip.trigger, 'item');
});

check('area 是带 areaStyle 的折线', () => {
    const r = C.build([3, 1, 4], { type: 'area' });
    eq(r.option.series[0].type, 'line');
    eq(r.option.series[0].areaStyle, {});
    eq(r.option.series[0].smooth, true);
});

check('散点：[x,y] 对直接画，类目型折线不参与', () => {
    const r = C.build([[1, 2], [3, 4]], {});
    eq(r.option.series[0].type, 'scatter');
    eq(r.option.series[0].data, [[1, 2], [3, 4]]);
    eq(r.option.xAxis.type, 'value');
});

check('字典默认柱状，类目是键', () => {
    const r = C.build({ 一月: 10, 二月: 20 }, {});
    eq(r.option.series[0].type, 'bar');
    eq(r.option.xAxis.data, ['一月', '二月']);
    eq(r.option.series[0].data, [10, 20]);
});

check('显式指定类型会覆盖自动推断', () => {
    eq(C.build([1, 2], { type: 'bar' }).option.series[0].type, 'bar');
    eq(C.build([{ name: 'A', value: 1 }], { type: 'line' }).option.series[0].type, 'line');
});

check('底色跟着主题塞进 option', () => {
    eq(C.build([1], { background: '#ffffff' }).option.backgroundColor, '#ffffff');
    eq(C.build([1], { background: '#0b0b0c' }).option.backgroundColor, '#0b0b0c');
});

console.log('=== 完整 option 原样透传 ===');

check('animation 一定被压成 false（导出要确定性）', () => {
    const r = C.build({ series: [{ type: 'bar', data: [1, 2] }] }, {});
    eq(r.option.animation, false);
});

check('series 写成单个对象也包成数组', () => {
    const r = C.build({ series: { type: 'line', data: [1] } }, {});
    ok(Array.isArray(r.option.series), '没包成数组');
    eq(r.meta.series, 1);
});

check('统计系列数与点数', () => {
    const r = C.build({
        series: [
            { type: 'bar', data: [1, 2, 3] },
            { type: 'line', data: [4, 5, 6] }
        ]
    }, {});
    eq(r.meta.series, 2);
    eq(r.meta.points, 6);
    eq(r.meta.types, ['bar', 'line']);
    eq(r.meta.kind, 'option');
});

check('用户自己写了底色就不覆盖', () => {
    const r = C.build({ series: [{ type: 'bar', data: [1] }], backgroundColor: '#123456' }, { background: '#ffffff' });
    eq(r.option.backgroundColor, '#123456');
});

check('不改动传进来的对象', () => {
    const input = { series: [{ type: 'bar', data: [1, 2] }] };
    C.build(input, { background: '#fff' });
    eq(input.animation, undefined);
    eq(input.series[0].data, [1, 2]);
});

check('dataset 不数点，也不算超限', () => {
    const r = C.build({ dataset: { source: [[1, 2], [3, 4]] }, series: [{ type: 'bar' }] }, {});
    eq(r.meta.points, 0);
    ok(r.option, '不该报错');
});

// ---------- 完整 option 改类型（类型下拉不再是摆设） ----------

console.log('=== 完整 option 改类型 ===');

const OPT_BAR = () => ({
    title: { text: '月度订单量' },
    grid: { left: 16 },
    xAxis: { type: 'category', boundaryGap: false, data: ['1月', '2月', '3月'] },
    yAxis: { type: 'value' },
    series: [{ name: '线上订单', type: 'bar', barWidth: '46%', data: [120, 180, 150] }]
});

check('选「自动」不动 JSON 里的类型', () => {
    const r = C.build(OPT_BAR(), { type: 'auto' });
    eq(r.meta.types, ['bar']);
    eq(r.option.xAxis.boundaryGap, false);   // 用户自己写的，别改
});

check('切折线：series.type 换掉，柱宽之类原样留着', () => {
    const r = C.build(OPT_BAR(), { type: 'line' });
    eq(r.meta.types, ['line']);
    eq(r.option.series[0].barWidth, '46%');
    eq(r.option.series[0].areaStyle, undefined);
    eq(r.option.xAxis.boundaryGap, false);   // 折线贴边
});

check('切柱状：类目轴 boundaryGap 改成留缝', () => {
    const r = C.build(OPT_BAR(), { type: 'bar' });
    eq(r.meta.types, ['bar']);
    eq(r.option.xAxis.boundaryGap, true);
});

check('切面积：折线 + areaStyle', () => {
    const r = C.build(OPT_BAR(), { type: 'area' });
    eq(r.meta.types, ['line']);
    eq(r.option.series[0].areaStyle, {});
});

check('切饼图：类目名进 name、坐标轴收走', () => {
    const r = C.build(OPT_BAR(), { type: 'pie' });
    eq(r.meta.types, ['pie']);
    eq(r.option.xAxis, undefined);
    eq(r.option.yAxis, undefined);
    eq(r.option.tooltip, { trigger: 'item' });
    eq(r.option.series[0].data, [
        { name: '1月', value: 120 },
        { name: '2月', value: 180 },
        { name: '3月', value: 150 }
    ]);
});

check('多条系列一起换类型', () => {
    const r = C.build({
        xAxis: { type: 'category', data: ['a', 'b'] },
        yAxis: { type: 'value' },
        series: [
            { type: 'bar', data: [1, 2] },
            { type: 'bar', data: [3, 4] }
        ]
    }, { type: 'line' });
    eq(r.meta.types, ['line', 'line']);
});

check('饼图配置改成折线：自动补类目轴，数据摊成数值', () => {
    const r = C.build({ series: [{ type: 'pie', data: [{ name: 'A', value: 3 }, { name: 'B', value: 5 }] }] }, { type: 'line' });
    eq(r.meta.types, ['line']);
    eq(r.option.xAxis.data, ['A', 'B']);
    eq(r.option.series[0].data, [3, 5]);
});

check('饼图配置改成散点：补数值轴', () => {
    const r = C.build({ series: [{ type: 'pie', data: [{ name: 'A', value: 3 }, { name: 'B', value: 5 }] }] }, { type: 'scatter' });
    eq(r.meta.types, ['scatter']);
    eq(r.option.xAxis.type, 'value');
});

check('数据不是一列数值时，不硬转饼图', () => {
    const r = C.build({ series: [{ type: 'line', data: [] }] }, { type: 'pie' });
    ok(r.option, '不该报错');
    eq(r.meta.types, ['line']);   // 保持原样
});

check('applyType 不认得的类型：原样返回', () => {
    const input = OPT_BAR();
    const out = C.applyType(input, 'nope');
    eq(out.series[0].type, 'bar');
});

console.log('=== 上限与报错 ===');

check('看不懂的形状 -> shape', () => {
    eq(C.build('x', {}).code, 'shape');
    eq(C.build([1, 'a'], {}).code, 'shape');
    eq(C.build({}, {}).code, 'shape');
    eq(C.build({ series: [] }, {}).code, 'shape');
});

check('系列数超过上限 -> too-many-series', () => {
    const series = [];
    for (let i = 0; i < C.LIMITS.series + 1; i++) series.push({ type: 'line', data: [i] });
    const r = C.build({ series }, {});
    eq(r.code, 'too-many-series');
    eq(r.detail.limit, C.LIMITS.series);
});

check('总点数超过上限 -> too-many-points', () => {
    const data = new Array(C.LIMITS.points + 1).fill(1);
    const r = C.build({ series: [{ type: 'line', data }] }, {});
    eq(r.code, 'too-many-points');
});

check('单个系列超过每系列上限 -> too-many-points', () => {
    const per = C.LIMITS.pointsPerSeries + 1000;
    const series = [
        { type: 'line', data: new Array(per).fill(1) },
        { type: 'line', data: new Array(per).fill(1) }
    ];
    ok(per * 2 <= C.LIMITS.points, '用例本身没超过总上限');
    const r = C.build({ series }, {});
    eq(r.code, 'too-many-points');
    eq(r.detail.limit, C.LIMITS.pointsPerSeries);
});

console.log('=== 尺寸 ===');

check('默认宽 700 / 高 400', () => {
    eq(C.LIMITS.width.def, 700);
    eq(C.LIMITS.height.def, 400);
    eq(C.clampSize('', 'width'), { value: 700, code: 'bad' });
    eq(C.clampSize(null, 'height'), { value: 400, code: 'bad' });
});

check('正常值原样返回', () => {
    eq(C.clampSize('1200', 'width'), { value: 1200, code: null });
    eq(C.clampSize(900, 'height'), { value: 900, code: null });
});

check('太小 / 太大夹到边界并给出原因', () => {
    eq(C.clampSize(10, 'width'), { value: C.LIMITS.width.min, code: 'small' });
    eq(C.clampSize(99999, 'height'), { value: C.LIMITS.height.max, code: 'big' });
});

check('小数四舍五入成整数', () => {
    eq(C.clampSize(500.6, 'width').value, 501);
});

// ---------- 智能解析：接口在 option 外面又包了一层 ----------

console.log('=== 智能解析（接口包装） ===');

const OPT = {
    title: { text: '月度订单量', left: 'center' },
    xAxis: { type: 'category', data: ['12月', '1月'] },
    yAxis: { type: 'value' },
    series: [{ name: '线上订单', type: 'line', data: [800, 800] }]
};
const OPT_TEXT = JSON.stringify(OPT);

check('业务 key 里塞了 echart_option 字符串也能认', () => {
    const text = JSON.stringify({ monthly_trend: { echart_option: OPT_TEXT, table_data: null, biz_data: {} } });
    const r = C.parseText(text);
    eq(r.code, undefined);
    eq(r.via, 'monthly_trend.echart_option');
    eq(r.options.length, 1);
    // 剥出来的就是原始的 option 本体
    eq(r.value.series[0].name, '线上订单');
    const built = C.build(r.value, {});
    eq(built.meta.kind, 'option');
    eq(built.meta.series, 1);
    eq(built.meta.points, 2);
    eq(built.option.title.text, '月度订单量');
    eq(built.option.animation, false);
});

check('option 本身写成 JSON 字符串（二次编码）也认', () => {
    const r = C.parseText(JSON.stringify(OPT_TEXT));
    eq(r.options.length, 1);
    eq(r.options[0].path, '');
    eq(C.build(r.value, {}).meta.kind, 'option');
});

check('外面再套 data / result 两层也剥得动', () => {
    const text = JSON.stringify({ code: 0, data: { result: { chartOption: OPT_TEXT } } });
    const r = C.parseText(text);
    eq(r.options.length, 1);
    eq(r.via, 'data.result.chartOption');
    eq(C.build(r.value, {}).meta.kind, 'option');
});

check('纯数据包在外层键里（没有 option）也能剥出来画', () => {
    const r = C.parseText(JSON.stringify({ code: 0, data: { rows: [10, 20, 30] } }));
    eq(r.options.length, 0);
    eq(r.via, 'data.rows');
    eq(C.classify(r.value), 'points');
});

check('普通数据不受影响：字符串不当成 JSON 乱解', () => {
    eq(C.parseText(JSON.stringify(['12月', '1月'])).value, ['12月', '1月']);
    const r = C.parseText(JSON.stringify({ a: 1, b: 2 }));
    eq(r.via, '');
    eq(C.classify(r.value), 'map');
});

check('没有可用的选项时不硬猜（原样返回 -> shape）', () => {
    const r = C.parseText(JSON.stringify({ a: { b: 'c' }, d: null }));
    eq(r.options.length, 0);
    eq(C.build(r.value, {}).code, 'shape');
});

check('用户自己写的底色不被覆盖，动画照旧关掉', () => {
    const opt = { backgroundColor: '#f8f8f8', series: [{ type: 'bar', data: [1, 2] }] };
    const r = C.parseText(JSON.stringify({ x: { echart_option: JSON.stringify(opt) } }));
    const built = C.build(r.value, { background: '#000000' });
    eq(built.option.backgroundColor, '#f8f8f8');
    eq(built.option.animation, false);
});

// ---------- 一份 JSON 里多个 option ----------

console.log('=== 多个 option ===');

const O1 = JSON.stringify({ title: { text: '图一' }, xAxis: { type: 'category', data: ['a'] }, yAxis: { type: 'value' }, series: [{ type: 'bar', data: [1] }] });
const O2 = JSON.stringify({ title: { text: '图二' }, xAxis: { type: 'category', data: ['b'] }, yAxis: { type: 'value' }, series: [{ type: 'line', data: [2] }] });
const O3 = JSON.stringify({ radians: [1] });

check('多个业务键各自带一个 option：全部列出，顺序稳定', () => {
    const text = JSON.stringify({ trend_online: { echart_option: O1 }, trend_retail: { echart_option: O2 } });
    const r = C.parseText(text);
    eq(r.options.length, 2);
    eq(r.options.map((o) => o.path), ['trend_online.echart_option', 'trend_retail.echart_option']);
    eq(r.options.map((o) => o.title), ['图一', '图二']);
    // 默认取第一个
    eq(C.build(r.value, {}).option.title.text, '图一');
    eq(C.build(r.options[1].value, {}).option.title.text, '图二');
});

check('数组里包着多份 option（带下标路径）', () => {
    const r = C.parseText(JSON.stringify([{ echart_option: O1 }, { echart_option: O2 }]));
    eq(r.options.length, 2);
    eq(r.options.map((o) => o.path), ['[0].echart_option', '[1].echart_option']);
});

check('顶层就是 option 时只有一个候选、路径为空', () => {
    const r = C.parseText(JSON.stringify(OPT));
    eq(r.options.length, 1);
    eq(r.options[0].path, '');
    eq(r.options[0].title, '月度订单量');
});

check('没有 title 的 option 用路径做备选名', () => {
    const r = C.parseText(JSON.stringify({ a: { echart_option: JSON.stringify({ series: [{ type: 'pie', data: [1] }] }) } }));
    eq(r.options[0].title, '');
    eq(r.options[0].path, 'a.echart_option');
});

check('collectOptions 不把 series 里的东西当根', () => {
    const list = C.collectOptions(OPT);
    eq(list.length, 1);
    eq(list[0].value.series.length, 1);
});

check('一份 option 里混着别的对象不会重复计数', () => {
    const opt = JSON.stringify({ series: [{ type: 'bar', data: [1] }], myMeta: { echart_option: O3 } });
    const r = C.parseText(JSON.stringify({ wrap: opt }));
    // 外层命中 option 就不再往下挖，只有 1 个
    eq(r.options.length, 1);
});

check('同一层挂多个 option 键（option1 / option2）', () => {
    const r = C.parseText(JSON.stringify({ option1: O1, option2: O2 }));
    eq(r.options.length, 2);
    eq(r.options.map((o) => o.path), ['option1', 'option2']);
    eq(r.options.map((o) => o.title), ['图一', '图二']);
});

check('一个 JSON 里用数组装多份 option', () => {
    const r = C.parseText(JSON.stringify({ charts: [JSON.parse(O1), JSON.parse(O2)] }));
    eq(r.options.length, 2);
    eq(r.options.map((o) => o.path), ['charts[0]', 'charts[1]']);
});

// ---------- 任务列表（负载是二次序列化的 JSON） ----------
//
// 顶层是任务数组，每条任务的某个字段又是一段 JSON 字符串，展开之后才是
// 「业务键 -> { echart_option, table_data, biz_data }」。option 落在第 6 层，
// 中间还夹着上千行表格数据。这里的样本全是自己编的。

console.log('=== 任务列表 ===');

function bizOption(title, n) {
    return JSON.stringify({
        title: { text: title },
        xAxis: { type: 'category', data: ['甲', '乙'] },
        yAxis: { type: 'value' },
        series: [{ type: 'bar', data: [n, n + 1] }]
    });
}

function tableRows(n) {
    const rows = [];
    for (let i = 0; i < n; i++) rows.push({ seq: i + 1, label: '行' + (i + 1), amount: i * 3, memo: 'memo-' + i });
    return rows;
}

function taskOf(tag, payloadMap) {
    return {
        id: 'task-1',
        tag: tag,
        collected_at: '2024-05-06 07:08:09',
        payload: JSON.stringify(payloadMap)
    };
}

check('任务列表：每条的负载里各带图表，全部列出来（含空值跳过）', () => {
    const tasks = [
        taskOf('t1', {
            alpha: { echart_option: bizOption('图甲', 1), table_data: tableRows(3), biz_data: { region: '东' } },
            beta: { echart_option: null, table_data: tableRows(2), biz_data: {} }
        }),
        taskOf('t2', {
            gamma: { echart_option: bizOption('图乙', 5), table_data: tableRows(4), biz_data: { region: '西' } }
        })
    ];
    const r = C.parseText(JSON.stringify(tasks));
    eq(r.options.map((o) => o.path), [
        '[0].payload.alpha.echart_option',
        '[1].payload.gamma.echart_option'
    ]);
    eq(r.options.map((o) => o.title), ['图甲', '图乙']);
    eq(C.build(r.value, {}).meta.kind, 'option');
    eq(C.build(r.options[1].value, {}).option.title.text, '图乙');
});

check('任务列表：前面一大坨表格也压不垮（预算按文本长度放大）', () => {
    const tasks = [
        taskOf('t1', {
            wide_table: { echart_option: null, table_data: tableRows(3000), biz_data: { rows: 3000 } },
            after_table: { echart_option: bizOption('排在表格后面', 2), table_data: tableRows(2), biz_data: {} }
        })
    ];
    const r = C.parseText(JSON.stringify(tasks));
    eq(r.options.length, 1);
    eq(r.options[0].path, '[0].payload.after_table.echart_option');
    eq(r.options[0].title, '排在表格后面');
});

check('纯数据行被跳过：预算不会被行数吃掉', () => {
    // 300 个节点的默认预算下，几千行数据照样能扫到后面的业务键
    const payload = JSON.parse(JSON.stringify({
        rows: { echart_option: null, table_data: tableRows(500), biz_data: {} },
        tail: { echart_option: bizOption('尾图', 9), table_data: [], biz_data: {} }
    }));
    const list = C.collectOptions(payload, 300);
    eq(list.length, 1);
    eq(list[0].path, 'tail.echart_option');
});

check('预算被用光时如实报告 truncated，不假装扫完了', () => {
    const tasks = [];
    for (let i = 0; i < 4; i++) {
        tasks.push(taskOf('t' + i, {
            a: { echart_option: bizOption('一', i), table_data: tableRows(3), biz_data: {} },
            b: { echart_option: bizOption('二', i), table_data: tableRows(3), biz_data: {} }
        }));
    }
    const text = JSON.stringify(tasks);
    // 预算故意给得极小：一定扫不完，得说清楚
    const small = C.collectReport(JSON.parse(text), 10);
    eq(small.truncated, true);
    ok(small.options.length < 8, '只该找到一部分，实际 ' + small.options.length);
    // 正常预算下扫完，不该报 truncated
    const full = C.collectReport(JSON.parse(text), C.budgetFor(text.length));
    eq(full.truncated, false);
    eq(full.options.length, 8);
});

check('任务列表里一个能画的都没有：给 shape，不硬猜', () => {
    const tasks = [taskOf('t1', { a: { echart_option: '', table_data: tableRows(2), biz_data: {} } })];
    const r = C.parseText(JSON.stringify(tasks));
    eq(r.options.length, 0);
    eq(C.build(r.value, {}).code, 'shape');
});

check('对象里带字符串化 JSON 的不会被当成纯数据行跳过', () => {
    // 一行里全是字符串，但有一个字符串本身就是负载 —— 不能剪掉
    const list = C.collectOptions({ row: { note: 'ok', extra: JSON.stringify({ inner: { echart_option: bizOption('藏在字符串里', 3) } }) } });
    eq(list.length, 1);
    eq(list[0].path, 'row.extra.inner.echart_option');
});

// ---------- 换行 / 首尾相接的多份 JSON ----------

console.log('=== 多份 JSON ===');

check('一行一个 JSON（NDJSON）各带一个 option：路径带 #序号', () => {
    const text = JSON.stringify({ trend_online: { echart_option: O1 } }) + '\n'
        + JSON.stringify({ trend_retail: { echart_option: O2 } }) + '\n';
    const r = C.parseText(text);
    eq(r.docs, 2);
    eq(r.options.length, 2);
    eq(r.options.map((o) => o.path), ['#1.trend_online.echart_option', '#2.trend_retail.echart_option']);
    eq(r.options.map((o) => o.title), ['图一', '图二']);
    eq(C.build(r.value, {}).meta.kind, 'option');
});

check('一行一个数字：合并成一条数据', () => {
    const r = C.parseText('10\n20\n30');
    eq(r.docs, 3);
    eq(r.options.length, 0);
    eq(r.value, [10, 20, 30]);
    eq(C.classify(r.value), 'points');
});

check('一行一个 name-value 对象：也是 points', () => {
    const r = C.parseText('{"month":"1月","sales":12}\n{"month":"2月","sales":20}');
    eq(r.docs, 2);
    eq(C.classify(r.value), 'points');
    const built = C.build(r.value, {});
    eq(built.meta.points, 2);
});

check('首尾相接（中间没有空白）也能切开', () => {
    const r = C.parseText('{"a":1}{"b":2}');
    eq(r.docs, 2);
    eq(r.value, [{ a: 1 }, { b: 2 }]);
});

check('带逗号分隔的多份也认（数组被拆开后常见）', () => {
    const r = C.parseText('{"a":1},\n{"b":2},');
    eq(r.docs, 2);
});

check('开头有 BOM 不影响', () => {
    const r = C.parseText('\ufeff{"a":1}\n{"b":2}');
    eq(r.docs, 2);
});

check('半截的多份 JSON 仍然报 json-invalid，不硬猜', () => {
    eq(C.parseText('{"a":1}\n{"b":').code, 'json-invalid');
    eq(C.parseText('{"a": 1').code, 'json-invalid');
    eq(C.parseText('{a:1}').code, 'json-invalid');
});

check('字符串里的括号不会被当成结构', () => {
    const r = C.parseText('{"t":"a}b]c"}\n{"t":"{"}');
    eq(r.docs, 2);
    eq(r.value[0].t, 'a}b]c');
    eq(r.value[1].t, '{');
});

check('多份 JSON 里的 option 优先于数据（能画图就画图）', () => {
    const text = '{"rows":[1,2,3]}\n' + JSON.stringify({ c: { echart_option: O2 } });
    const r = C.parseText(text);
    eq(r.options.length, 1);
    eq(r.options[0].path, '#2.c.echart_option');
});

console.log('');
console.log('--- chart: ' + pass + '/' + (pass + fail) + ' passed ---');
if (fail) process.exit(1);
