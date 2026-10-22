/*
 * flow.js 单测：拖放路由、批量合并、最近记录、宿主选区识别。
 * 都是纯函数，直接 node 跑。
 */
const flow = require('../ui/js/flow.js');

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

console.log('=== 拖放路由 ===');

check('图片扩展名送图片页', () => {
    ['a.png', 'b.JPG', 'c.jpeg', 'd.gif', 'e.webp', 'f.svg', 'g.ico', 'h.avif', 'i.heic'].forEach((name) => {
        if (flow.routeFile(name).kind !== 'image') throw new Error(name + ' 没进图片页');
    });
});

check('表格扩展名送表格页', () => {
    eq(flow.routeFile('a.csv').kind, 'sheet');
    eq(flow.routeFile('a.csv').format, 'csv');
    eq(flow.routeFile('b.tsv').format, 'tsv');
    eq(flow.routeFile('c.xlsx').format, 'xlsx');
    eq(flow.routeFile('d.xlsm').format, 'xlsm');
});

check('.xls 也送表格页（由页面提示另存）', () => {
    eq(flow.routeFile('old.xls'), { kind: 'sheet', ext: 'xls', format: 'xls' });
});

check('文本扩展名送转换页并带源格式', () => {
    eq(flow.routeFile('a.json'), { kind: 'text', ext: 'json', format: 'json' });
    eq(flow.routeFile('a.yml').format, 'yaml');
    eq(flow.routeFile('a.yaml').format, 'yaml');
    eq(flow.routeFile('a.xml').format, 'xml');
    eq(flow.routeFile('a.toml').format, 'toml');
    eq(flow.routeFile('a.ini').format, 'ini');
    eq(flow.routeFile('a.properties').format, 'properties');
    eq(flow.routeFile('.env').format, 'env');
});

check('认识的文本扩展名都带源格式', () => {
    eq(flow.routeFile('a.log'), { kind: 'text', ext: 'log', format: '' });
    eq(flow.routeFile('a.md'), { kind: 'text', ext: 'md', format: '' });
});

check('不认识的扩展名拒收（不把二进制塞进编辑器）', () => {
    eq(flow.routeFile('a.zzz').kind, 'none');
    eq(flow.routeFile('a.zip').kind, 'none');
    eq(flow.routeFile('a.exe').kind, 'none');
});

check('没有扩展名 → none', () => {
    eq(flow.routeFile('README').kind, 'none');
    eq(flow.routeFile('').kind, 'none');
    eq(flow.routeFile(null).kind, 'none');
});

check('路径里的点不会当成扩展名', () => {
    eq(flow.routeFile('/tmp/a.b/csvfile').kind, 'none');
    eq(flow.routeFile('dir.v2/data.json').ext, 'json');
});

check('一批同类文件 → 按那一类落页', () => {
    eq(flow.routeBatch(['a.png', 'b.jpg']).kind, 'image');
    eq(flow.routeBatch(['a.csv', 'b.tsv']).kind, 'sheet');
    eq(flow.routeBatch(['a.json', 'b.yaml']).kind, 'text');
});

check('混合批次记为 mixed，文本优先（最宽容）', () => {
    const r = flow.routeBatch(['a.csv', 'b.json']);
    eq(r.kind, 'text');
    eq(r.mixed, true);
    eq(r.count, 2);
});

check('空批次', () => {
    eq(flow.routeBatch([]), { kind: 'none', count: 0, items: [] });
});

check('全是不认识的扩展名 → none（不能兜底成 image）', () => {
    eq(flow.routeBatch(['a.zzz']).kind, 'none');
    eq(flow.routeBatch(['a.zip', 'b.exe']).kind, 'none');
});

console.log('=== 批量合并 ===');

check('多文件合成一个对象，键是文件名', () => {
    const r = flow.mergeFiles([
        { name: 'a.csv', records: [{ id: 1 }] },
        { name: 'b.csv', records: [{ id: 2 }, { id: 3 }] }
    ]);
    eq(r.ok, true);
    eq(Object.keys(r.data), ['a.csv', 'b.csv']);
    eq(r.keys.map((k) => k.count), [1, 2]);
});

check('重名自动加序号，扩展名不丢', () => {
    const r = flow.mergeFiles([
        { name: 'a.csv', records: [] },
        { name: 'a.csv', records: [] },
        { name: 'a.csv', records: [] }
    ]);
    eq(Object.keys(r.data), ['a.csv', 'a (2).csv', 'a (3).csv']);
});

check('解析失败的文件被跳过并记下来', () => {
    const r = flow.mergeFiles([
        { name: 'bad.csv', error: true },
        { name: 'ok.csv', records: [1] }
    ]);
    eq(Object.keys(r.data), ['ok.csv']);
    eq(r.dropped, ['bad.csv']);
});

check('超过上限的文件丢掉', () => {
    const many = [];
    for (let i = 0; i < 14; i++) many.push({ name: 'f' + i + '.csv', records: [] });
    const r = flow.mergeFiles(many);
    eq(r.keys.length, flow.LIMITS.batchFiles);
    eq(r.dropped.length, 14 - flow.LIMITS.batchFiles);
});

check('全失败 → ok:false', () => {
    eq(flow.mergeFiles([{ name: 'x.csv', error: true }]).ok, false);
    eq(flow.mergeFiles([]).ok, false);
});

check('导出文件名', () => {
    eq(flow.batchFileName([{ name: 'users.csv' }]), 'users.json');
    eq(flow.batchFileName([{ name: 'a.csv' }, { name: 'b.csv' }]), 'batch-2.json');
    eq(flow.batchFileName([]), 'batch.json');
});

console.log('=== 最近使用 ===');

check('新条目排在最前', () => {
    const list = flow.recentPush([], { src: 'json', tgt: 'yaml', text: 'a' });
    eq(list.length, 1);
    eq(list[0].src, 'json');
    eq(list[0].size, 1);
});

check('同格式对 + 同内容不重复', () => {
    let list = flow.recentPush([], { src: 'json', tgt: 'yaml', text: 'a' });
    list = flow.recentPush(list, { src: 'json', tgt: 'yaml', text: 'a' });
    eq(list.length, 1);
});

check('同内容不同格式对算两条', () => {
    let list = flow.recentPush([], { src: 'json', tgt: 'yaml', text: 'a' });
    list = flow.recentPush(list, { src: 'json', tgt: 'xml', text: 'a' });
    eq(list.length, 2);
    eq(list[0].tgt, 'xml');
});

check('超出条数丢最旧的', () => {
    let list = [];
    for (let i = 0; i < 15; i++) list = flow.recentPush(list, { src: 'json', tgt: 'yaml', text: 't' + i });
    eq(list.length, flow.LIMITS.recent);
    eq(list[0].text, 't14');
});

check('单条超长只留预览', () => {
    const big = 'x'.repeat(flow.LIMITS.recentText + 500);
    const list = flow.recentPush([], { src: 'json', tgt: 'yaml', text: big });
    eq(list[0].text.length, flow.LIMITS.recentText);
    eq(list[0].size, big.length);
});

check('总预算超了把旧条目正文降级、条目仍在', () => {
    const chunk = 'y'.repeat(flow.LIMITS.recentText);
    let list = [];
    for (let i = 0; i < 5; i++) {
        list = flow.recentPush(list, { src: 'json', tgt: 'yaml', text: chunk + i }, { maxTotal: flow.LIMITS.recentText * 2 });
    }
    const total = list.reduce((n, it) => n + (it.text || '').length, 0);
    if (total > flow.LIMITS.recentText * 2) throw new Error('总量 ' + total + ' 超预算');
    if (list.length !== 5) throw new Error('条目被删了: ' + list.length);
    if (list[list.length - 1].text !== '') throw new Error('最旧的正文没降级');
    if (!list[0].text) throw new Error('最新的正文也被降级了');
});

check('空文本不入列表', () => {
    eq(flow.recentPush([], { src: 'json', tgt: 'yaml', text: '' }).length, 0);
});

check('散列稳定且不同内容不同值', () => {
    eq(flow.hashText('abc'), flow.hashText('abc'));
    if (flow.hashText('abc') === flow.hashText('abd')) throw new Error('碰撞了');
});

console.log('=== 宿主选区 ===');

check('直接是字符串', () => {
    eq(flow.pickHostText('{"a":1}').text, '{"a":1}');
});

check('context.text', () => {
    eq(flow.pickHostText({ text: 'SELECT 1' }).text, 'SELECT 1');
});

check('context.selection.text（最常见的一种）', () => {
    const r = flow.pickHostText({ selection: { text: '{"a":1}', languageId: 'json' } });
    eq(r.text, '{"a":1}');
    eq(r.path, '$.selection.text');
});

check('context.editor.selectedText', () => {
    eq(flow.pickHostText({ editor: { selectedText: 'x=1' } }).path, '$.editor.selectedText');
});

check('空字段跳过，取第一个非空', () => {
    eq(flow.pickHostText({ selection: '   ', text: 'real' }).text, 'real');
});

check('找不到就给 null', () => {
    eq(flow.pickHostText({}), null);
    eq(flow.pickHostText({ connectionId: 'c1', providerId: 'pg' }), null);
    eq(flow.pickHostText(null), null);
    eq(flow.pickHostText(42), null);
});

check('超长被截断并标记', () => {
    const big = 'z'.repeat(flow.LIMITS.hostText + 10);
    const r = flow.pickHostText({ text: big });
    eq(r.text.length, flow.LIMITS.hostText);
    eq(r.clipped, true);
    eq(r.size, big.length);
});

check('自引用对象不会死循环', () => {
    const a = { text: '' };
    a.self = a;
    eq(flow.pickHostText(a), null);
});

console.log('=== 选区分类 ===');

check('完整 JSON', () => {
    eq(flow.classifyText('{"a":1}'), 'json');
    eq(flow.classifyText('[1,2]'), 'json');
});

check('不是完整 JSON 就当文本', () => {
    eq(flow.classifyText('{"a":1'), 'text');
});

check('DDL 优先于 SQL', () => {
    eq(flow.classifyText('CREATE TABLE t (id int)'), 'ddl');
    eq(flow.classifyText('create temporary table t (id int)'), 'ddl');
});

check('SELECT / INSERT / WITH', () => {
    eq(flow.classifyText('select * from t'), 'sql');
    eq(flow.classifyText('INSERT INTO t VALUES (1)'), 'sql');
    eq(flow.classifyText('with a as (select 1) select * from a'), 'sql');
});

check('单行 SELECT ... FROM 也认', () => {
    eq(flow.classifyText('SELECT id FROM users WHERE id IN (1,2)'), 'sql');
});

check('普通文本', () => {
    eq(flow.classifyText('hello world'), 'text');
    eq(flow.classifyText(''), 'text');
});

check('guessFormat：JSON / XML / TOML / properties / YAML', () => {
    eq(flow.guessFormat('{"a":1}'), 'json');
    eq(flow.guessFormat('<?xml version="1.0"?><a/>'), 'xml');
    eq(flow.guessFormat('[db]\nhost = "x"\n'), 'toml');
    eq(flow.guessFormat('a.b=1\nc=2\n'), 'properties');
    eq(flow.guessFormat('name: x\nage: 2\n'), 'yaml');
    eq(flow.guessFormat(''), 'json');
});

console.log('\n--- flow: ' + pass + '/' + (pass + fail) + ' passed ---');
if (fail) process.exit(1);
