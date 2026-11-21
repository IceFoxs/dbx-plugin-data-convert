/**
 * urlparse.test.js — URL 解析内核（纯函数，无 DOM）
 *
 *   node tests/urlparse.test.js
 *
 * 这里钉的是「拆得对不对」，页面上的定位 / 渲染 / 复制在 tests/ui.smoke.js 里验。
 * 重点覆盖那些手写解析最容易错、而 `new URL()` 又直接抛异常的写法：
 * 没协议的、协议相对的、host:port 当协议的、IPv6、中文域名、日志里的分号参数。
 */
'use strict';

const U = require('../ui/js/urlparse.js');

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

function parse(s) {
    return U.parseLine(s);
}

// ---------------------------------------------------------------- 完整地址
check('完整地址：协议 / 用户名 / 密码 / 主机 / 端口 / 路径 / 查询 / 片段', () => {
    const r = parse('https://me:pwd@api.example.com:8443/v1/items?page=2&size=20#top');
    eq(r.ok, true);
    eq(r.scheme, 'https');
    eq(r.username, 'me');
    eq(r.password, 'pwd');
    eq(r.host, 'api.example.com');
    eq(r.port, '8443');
    eq(r.path, '/v1/items');
    eq(r.query, 'page=2&size=20');
    eq(r.hash, 'top');
    eq(r.origin, 'https://api.example.com:8443');
});

check('没有端口时 origin 不带冒号，路径为空时给空串', () => {
    const r = parse('http://example.com');
    eq(r.ok, true);
    eq(r.port, '');
    eq(r.path, '');
    eq(r.origin, 'http://example.com');
});

check('只有用户名没有密码：hasPassword 必须为 false', () => {
    const r = parse('ftp://user@ftp.example.com/pub');
    eq(r.username, 'user');
    eq(r.hasPassword, false);
    eq(r.password, '');
});

check('userinfo 里的百分号编码会解码（@ 用 %40 写出时不会被当成分隔符）', () => {
    const r = parse('https://a%40b:p%3Aw@example.com/x');
    eq(r.username, 'a@b');
    eq(r.password, 'p:w');
    eq(r.host, 'example.com');
});

// ---------------------------------------------------------------- IPv6
check('IPv6：方括号里的冒号不算端口分隔符', () => {
    const r = parse('https://[::1]:5173/app?mode=dev');
    eq(r.ok, true);
    eq(r.host, '::1');
    eq(r.hostType, 'ipv6');
    eq(r.port, '5173');
    eq(r.path, '/app');
    eq(r.origin, 'https://[::1]:5173');
});

check('IPv6 不带端口时 origin 仍带方括号', () => {
    const r = parse('http://[2001:db8::1]/a');
    eq(r.origin, 'http://[2001:db8::1]');
});

// ---------------------------------------------------------------- 端口
check('默认端口被标出来（https:443 / http:80），非默认不标', () => {
    eq(parse('https://example.com:443/').portDefault, true);
    eq(parse('http://example.com:80/').portDefault, true);
    eq(parse('https://example.com:8443/').portDefault, false);
    eq(parse('http://example.com:443/').portDefault, false);
});

check('端口超过 65535 报 badPort，其它字段照样拆出来', () => {
    const r = parse('http://example.com:99999/x');
    eq(r.ok, false);
    eq(r.errorCode, 'badPort');
    eq(r.host, 'example.com');
    eq(r.path, '/x');
});

check('冒号后面不是数字：当成坏端口，不静默丢掉', () => {
    const r = parse('http://example.com:abc/x');
    eq(r.ok, false);
    eq(r.errorCode, 'badPort');
});

// ---------------------------------------------------------------- 半截地址
check('没有协议但有端口：host:port 不能被误认成「协议 + 路径」', () => {
    const r = parse('example.com:8080/a/b');
    eq(r.ok, true);
    eq(r.scheme, '');
    eq(r.hasScheme, false);
    eq(r.host, 'example.com');
    eq(r.port, '8080');
    eq(r.path, '/a/b');
});

check('协议相对地址 //host/x：标记出来，主机照常拆', () => {
    const r = parse('//cdn.example.com/lib.js?v=1.2.3');
    eq(r.ok, true);
    eq(r.protocolRelative, true);
    eq(r.host, 'cdn.example.com');
    eq(r.path, '/lib.js');
});

check('相对路径 /a/b?x=1：没有主机也不算错', () => {
    const r = parse('/relative/path?x=1');
    eq(r.ok, true);
    eq(r.host, '');
    eq(r.path, '/relative/path');
    eq(r.params.length, 1);
});

check('只有一个主机名 example.com', () => {
    const r = parse('example.com');
    eq(r.ok, true);
    eq(r.host, 'example.com');
    eq(r.hostType, 'domain');
});

check('少一条斜杠的 http:/example.com/a 仍然认出主机', () => {
    const r = parse('http:/example.com/a');
    eq(r.scheme, 'http');
    eq(r.host, 'example.com');
    eq(r.path, '/a');
});

// ---------------------------------------------------------------- 无主机协议
check('mailto: 后面那串是路径，不是「用户名 @ 主机」', () => {
    const r = parse('mailto:team@example.com');
    eq(r.ok, true);
    eq(r.opaque, true);
    eq(r.host, '');
    eq(r.path, 'team@example.com');
    eq(r.origin, 'mailto:');
});

check('tel: / data: 同样按无主机处理', () => {
    const tel = parse('tel:+8613800138000');
    eq(tel.opaque, true);
    eq(tel.path, '+8613800138000');
    const data = parse('data:text/plain;base64,SGk=');
    eq(data.opaque, true);
    eq(data.path, 'text/plain;base64,SGk=');
});

// ---------------------------------------------------------------- 查询参数
check('参数：键值对、重复键、只有键的段都标出来', () => {
    const r = parse('https://example.com/s?tag=a&tag=b&debug&x=1');
    eq(r.params.length, 4);
    eq(r.params.map((p) => p.key), ['tag', 'tag', 'debug', 'x']);
    eq(r.params[0].hasEq, true);
    eq(r.params[2].hasEq, false);
    eq(r.dupeKeys, ['tag']);
});

check('参数解码：%XX 与 + 都解成空格，原值同时留着', () => {
    const r = parse('https://example.com/s?q=hello%20world&name=a+b');
    eq(r.params[0].value, 'hello world');
    eq(r.params[0].rawValue, 'hello%20world');
    eq(r.params[1].value, 'a b');
    eq(r.params[0].encoded, true);
});

check('HTTP 不把分号当分隔符（浏览器早就不这么干了）', () => {
    const r = parse('https://example.com/s?a=1;b=2;c');
    eq(r.params.length, 1);
    eq(r.params[0].key, 'a');
    eq(r.params[0].value, '1;b=2;c');
});

check('JDBC 认分号：驱动属性就是靠它分隔的', () => {
    const r = parse('jdbc:mysql://db.example.com/demo?a=1;b=2');
    eq(r.params.map((p) => p.key), ['a', 'b']);
});

check('连续 && 与结尾 & 不产生空参数', () => {
    const r = parse('https://example.com/s?a=1&&b=2&');
    eq(r.params.map((p) => p.key), ['a', 'b']);
});

check('路径里的 ? 之后的第一个 # 才切片段，片段里允许再有 #', () => {
    const r = parse('https://example.com/a?b=1#x#y');
    eq(r.query, 'b=1');
    eq(r.hash, 'x#y');
});

check('片段里的编码会解出来，原值也留着', () => {
    const r = parse('https://example.com/a#%E4%B8%AD%E6%96%87');
    eq(r.hash, '%E4%B8%AD%E6%96%87');
    eq(r.hashDecoded, '中文');
});

check('非法百分号转义原样保留，不整行失败', () => {
    const r = parse('https://example.com/%ZZ?a=%E4');
    eq(r.ok, true);
    eq(r.path, '/%ZZ');
    eq(r.pathDecoded, '/%ZZ');
});

// ---------------------------------------------------------------- 主机类型
check('主机类型：ipv4 / loopback / 域名 / 中文域名', () => {
    eq(parse('http://192.168.1.10/x').hostType, 'ipv4');
    eq(parse('http://localhost:8080/x').hostType, 'loopback');
    eq(parse('http://example.com').hostType, 'domain');
    eq(parse('http://例子.测试/路径').hostType, 'idn');
});

check('中文域名顺手给出 punycode 形式', () => {
    const r = parse('http://例子.测试/路径');
    eq(r.host, '例子.测试');
    eq(r.hostAscii, 'xn--fsqu00a.xn--0zwm56d');
    eq(r.path, '/路径');
});

check('括号里包着但不是 IPv6（缺右括号）报 badHost', () => {
    const r = parse('http://[::1/x');
    eq(r.ok, false);
    eq(r.errorCode, 'badHost');
});

check('主机名里夹空格报 badHost', () => {
    const r = parse('http://exa mple.com/x');
    eq(r.ok, false);
    eq(r.errorCode, 'badHost');
});

// 表情 / 符号不能进域名：浏览器 new URL() 不报错，会硬编出废码
// （`前1😀43131312321` → `xn--143131312321-…`），所以得自己拦
check('主机名含表情：报 badHostChar，且不给 punycode', () => {
    const r = parse('http://前1😀43131312321/');
    eq(r.ok, false);
    eq(r.errorCode, 'badHostChar');
    eq(r.hostAscii, '');
});

check('主机名含标点：报 badHost', () => {
    eq(parse('http://中文,域名.com/').errorCode, 'badHost');
});

check('下划线与百分号编码的主机仍然合法', () => {
    eq(parse('http://a_b.com/').ok, true);
    eq(parse('http://exa%6Dple.com/').ok, true);
});

check('hostCharProblem 单独可用（IPv6 不按域名规则判）', () => {
    eq(U.hostCharProblem('example.com'), '');
    eq(U.hostCharProblem('例子.测试'), '');
    eq(U.hostCharProblem('::1'), '');
    eq(U.hostCharProblem('前😀.com'), 'badHostChar');
    eq(U.hostCharProblem('a@b.com'), 'badHost');
});

// ---------------------------------------------------------------- 协议族
check('协议族自动识别：web / ftp / shell / jdbc / scp / opaque / relative', () => {
    eq(parse('https://example.com/a').kind, 'web');
    eq(parse('ftp://example.com/a').kind, 'ftp');
    eq(parse('sftp://example.com/a').kind, 'ftp');
    eq(parse('ssh://example.com').kind, 'shell');
    eq(parse('jdbc:mysql://h/db').kind, 'jdbc');
    eq(parse('git@github.com:team/repo.git').kind, 'scp');
    eq(parse('mailto:a@b.com').kind, 'opaque');
    eq(parse('example.com:8080/a').kind, 'relative');
});

check('ssh / sftp / ftp 的默认端口各自认得', () => {
    eq(parse('ssh://root@host:22/').portDefault, true);
    eq(parse('sftp://host:22/').portDefault, true);
    eq(parse('sftp://host:2222/').portDefault, false);
    eq(parse('ftp://host:21/').portDefault, true);
    eq(parse('ftps://host:21/').portDefault, true);
});

check('scp 写法：user@host:path 拆成账号 + 主机 + 路径', () => {
    const r = parse('git@github.com:team/repo.git');
    eq(r.host, 'github.com');
    eq(r.username, 'git');
    eq(r.path, '/team/repo.git');
    eq(r.port, '');
});

check('user@host:22 仍然是端口，不被 scp 抢走', () => {
    const r = parse('root@host:22');
    eq(r.port, '22');
    eq(r.path, '');
});

check('JDBC：路径是库名，分号后面的属性一样要拆', () => {
    const ss = parse('jdbc:sqlserver://db.example.com:1433;databaseName=demo;user=sa');
    eq(ss.database, 'demo');
    eq(ss.params.map((p) => p.key), ['databaseName', 'user']);
    eq(ss.host, 'db.example.com');
    eq(ss.port, '1433');
    const my = parse('jdbc:mysql://db.example.com:3306/demo?user=app');
    eq(my.database, 'demo');
    eq(my.path, '/demo');
});

check('JDBC 没有 // 时也拆分号属性（jdbc:h2:mem:test;KEY=1）', () => {
    const r = parse('jdbc:h2:mem:test;DB_CLOSE_DELAY=-1');
    eq(r.path, 'h2:mem:test');
    eq(r.params[0].key, 'DB_CLOSE_DELAY');
});

// ---------------------------------------------------------------- 边界
check('空串 / 纯空白：errorCode = empty', () => {
    eq(parse('').errorCode, 'empty');
    eq(parse('   ').errorCode, 'empty');
});

check('超长行报 tooLong，不抛异常', () => {
    const r = parse('https://example.com/' + 'a'.repeat(U.LIMITS.maxLineChars + 10));
    eq(r.ok, false);
    eq(r.errorCode, 'tooLong');
});

check('只有 #frag：没有主机也没有路径，算坏地址', () => {
    const r = parse('#frag');
    eq(r.ok, false);
    eq(r.errorCode, 'badHost');
});

// ---------------------------------------------------------------- JDBC
check('JDBC 连接串：协议 jdbc、驱动 mysql、主机 / 端口 / 库名分开', () => {
    const r = parse('jdbc:mysql://db.example.com:3306/demo?user=app&password=secret');
    eq(r.ok, true);
    eq(r.opaque, false);
    eq(r.scheme, 'jdbc');
    eq(r.subprotocol, 'mysql');
    eq(r.schemeFull, 'jdbc:mysql');
    eq(r.host, 'db.example.com');
    eq(r.port, '3306');
    eq(r.path, '/demo');
    eq(r.database, 'demo');
    eq(r.params.map((p) => p.key), ['user', 'password']);
    eq(r.origin, 'jdbc:mysql://db.example.com:3306');
});

check('JDBC 默认端口按子协议认（mysql 3306 / postgresql 5432）', () => {
    eq(parse('jdbc:mysql://db.example.com:3306/demo').portDefault, true);
    eq(parse('jdbc:postgresql://db.example.com:5432/app').portDefault, true);
    eq(parse('jdbc:mysql://db.example.com:3307/demo').portDefault, false);
});

check('没有 // 的 JDBC 写法保持「无主机」：jdbc:h2:mem:test / jdbc:sqlite:', () => {
    const h2 = parse('jdbc:h2:mem:test');
    eq(h2.opaque, true);
    eq(h2.host, '');
    eq(h2.path, 'h2:mem:test');
    const sqlite = parse('jdbc:sqlite:/tmp/a.db');
    eq(sqlite.opaque, true);
    eq(sqlite.scheme, 'jdbc');
});

// ------------------------------------------------- 裸数据库地址（不带 jdbc:）
check('裸数据库地址 mysql://user:pass@host:port/db 与 jdbc 同一套规则', () => {
    const r = parse('mysql://app:secret@db.example.com:53306/demo');
    eq(r.ok, true);
    eq(r.kind, 'db');
    eq(r.scheme, 'mysql');
    eq(r.hasScheme, true);
    eq(r.username, 'app');
    eq(r.password, 'secret');
    eq(r.host, 'db.example.com');
    eq(r.port, '53306');
    eq(r.path, '/demo');
    eq(r.database, 'demo');
    eq(r.origin, 'mysql://db.example.com:53306');
});

check('裸数据库地址覆盖 postgres / redis / mongodb，库名各就各位', () => {
    const pg = parse('postgresql://app:secret@db.example.com:5432/demo');
    eq(pg.kind, 'db');
    eq(pg.database, 'demo');
    eq(pg.portDefault, true);

    // redis 的 `/0` 是库号，同样落在 database
    const redis = parse('redis://:secret@cache.example.com:6379/0');
    eq(redis.kind, 'db');
    eq(redis.hasUser, true);
    eq(redis.username, '');
    eq(redis.password, 'secret');
    eq(redis.database, '0');

    const mongo = parse('mongodb://user:secret@mongo.example.com:27017/demo?authSource=admin');
    eq(mongo.kind, 'db');
    eq(mongo.database, 'demo');
    eq(mongo.params.map((p) => p.key), ['authSource']);
});

check('裸数据库地址也认 `;` 写的连接属性', () => {
    const r = parse('mysql://root@10.1.2.3/demo;user=sa&password=x');
    eq(r.host, '10.1.2.3');
    eq(r.database, 'demo');
    eq(r.params.map((p) => p.key), ['user', 'password']);
});

check('没有库名的裸数据库地址：不硬编一个 database', () => {
    const r = parse('mysql://root@10.1.2.3:3306');
    eq(r.ok, true);
    eq(r.database, '');
    eq(r.portDefault, true);
});

// ---------------------------------------------------------------- 国产数据库
check('国产数据库 JDBC：达梦 / 金仓 / 神通 / GBase / 瀚高 都能拆', () => {
    const cases = [
        ['jdbc:dm://10.1.2.3:5236/DEMO', 'dm', '5236', 'DEMO'],
        ['jdbc:kingbase8://10.1.2.3:54321/demo', 'kingbase8', '54321', 'demo'],
        ['jdbc:oscar://10.1.2.3:2003/osrdb', 'oscar', '2003', 'osrdb'],
        ['jdbc:gbase://10.1.2.3:5258/demo', 'gbase', '5258', 'demo'],
        ['jdbc:highgo://10.1.2.3:5866/demo', 'highgo', '5866', 'demo']
    ];
    cases.forEach(([url, driver, port, db]) => {
        const r = parse(url);
        eq(r.ok, true);
        eq(r.kind, 'jdbc');
        eq(r.scheme, 'jdbc');
        eq(r.subprotocol, driver);
        eq(r.schemeFull, 'jdbc:' + driver);
        eq(r.host, '10.1.2.3');
        eq(r.port, port);
        eq(r.portDefault, true);
        eq(r.database, db);
    });
});

check('国产数据库 JDBC：openGauss / GaussDB / Vastbase / 优炫 / OceanBase / TiDB 同样处理', () => {
    const cases = [
        ['jdbc:opengauss://10.1.2.3:5432/demo', 'opengauss', '5432'],
        ['jdbc:gaussdb://10.1.2.3:8000/demo', 'gaussdb', '8000'],
        ['jdbc:vastbase://10.1.2.3:5432/demo', 'vastbase', '5432'],
        ['jdbc:xugu://10.1.2.3:5138/demo', 'xugu', '5138'],
        ['jdbc:oceanbase://10.1.2.3:2881/demo', 'oceanbase', '2881'],
        ['jdbc:tidb://10.1.2.3:4000/demo', 'tidb', '4000']
    ];
    cases.forEach(([url, driver, port]) => {
        const r = parse(url);
        eq(r.subprotocol, driver);
        eq(r.port, port);
        eq(r.portDefault, true);
        eq(r.database, 'demo');
    });
});

check('国产数据库裸写法 dm:// 也归到数据库族', () => {
    const r = parse('dm://SYSDBA:secret@10.1.2.3:5236/DEMO');
    eq(r.kind, 'db');
    eq(r.scheme, 'dm');
    eq(r.username, 'SYSDBA');
    eq(r.database, 'DEMO');
    eq(r.portDefault, true);
});

// ---------------------------------------------------------------- 图库与时序库
check('NebulaGraph：nebula:// 与 jdbc:nebula:// 都归数据库族，默认 9669', () => {
    const bare = parse('nebula://root:secret@graph.example.com:9669/demo_space');
    eq(bare.kind, 'db');
    eq(bare.scheme, 'nebula');
    eq(bare.username, 'root');
    eq(bare.host, 'graph.example.com');
    eq(bare.port, '9669');
    eq(bare.portDefault, true);
    // 路径是图空间，按数据库族的规则装进 database（不是 path）
    eq(bare.database, 'demo_space');

    const jdbc = parse('jdbc:nebula://graph.example.com:9669/demo_space');
    eq(jdbc.kind, 'jdbc');
    eq(jdbc.subprotocol, 'nebula');
    eq(jdbc.portDefault, true);
    eq(jdbc.database, 'demo_space');

    // 不写库名时不硬编一个
    eq(parse('nebula://graph.example.com').database, '');
});

check('TDengine：TAOS 6030、TAOS-RS / TAOS-WS 6041，端口按驱动分档', () => {
    const native = parse('jdbc:TAOS://td.example.com:6030/power?charset=UTF-8');
    eq(native.subprotocol, 'taos');
    eq(native.port, '6030');
    eq(native.portDefault, true);
    eq(native.database, 'power');
    eq(native.params.map((p) => p.key), ['charset']);

    const rest = parse('jdbc:TAOS-RS://td.example.com:6041/power');
    eq(rest.subprotocol, 'taos-rs');
    eq(rest.portDefault, true);
    eq(rest.database, 'power');

    const ws = parse('jdbc:TAOS-WS://td.example.com:6041/power');
    eq(ws.subprotocol, 'taos-ws');
    eq(ws.portDefault, true);

    // 写了 6030 的 REST 连接串不该被标成默认端口
    eq(parse('jdbc:TAOS-RS://td.example.com:6030/power').portDefault, false);

    const bare = parse('taos://root:taosdata@td.example.com:6030/power');
    eq(bare.kind, 'db');
    eq(bare.portDefault, true);
    eq(bare.database, 'power');
});

check('Apache IoTDB：6667，库里常不写路径，参数照样拆', () => {
    const r = parse('jdbc:iotdb://iot.example.com:6667?user=root&password=root');
    eq(r.kind, 'jdbc');
    eq(r.subprotocol, 'iotdb');
    eq(r.port, '6667');
    eq(r.portDefault, true);
    eq(r.database, '');
    eq(r.params.map((p) => p.key), ['user', 'password']);

    const bare = parse('iotdb://root:root@iot.example.com:6667');
    eq(bare.kind, 'db');
    eq(bare.hasPassword, true);
    eq(bare.portDefault, true);
});

check('InfluxDB：8086，路径当库名', () => {
    const r = parse('influxdb://writer:secret@metrics.example.com:8086/ops');
    eq(r.kind, 'db');
    eq(r.host, 'metrics.example.com');
    eq(r.port, '8086');
    eq(r.portDefault, true);
    eq(r.database, 'ops');
    eq(r.path, '/ops');
    // 8087 不是默认端口，不标
    eq(parse('influxdb://metrics.example.com:8087/ops').portDefault, false);
});

check('MQTT over WebSocket：mqtt+ws 8083 / mqtt+wss 8084，路径是 topic', () => {
    const ws = parse('mqtt+ws://broker.example.com:8083/mqtt?clientId=app-1');
    eq(ws.ok, true);
    eq(ws.scheme, 'mqtt+ws');
    eq(ws.host, 'broker.example.com');
    eq(ws.port, '8083');
    eq(ws.portDefault, true);
    // topic 走路径，不当库名（这是消息通道，不是数据库）
    eq(ws.path, '/mqtt');
    eq(ws.database, '');
    eq(ws.params.map((p) => p.key), ['clientId']);

    const wss = parse('mqtt+wss://broker.example.com:8084/mqtt');
    eq(wss.scheme, 'mqtt+wss');
    eq(wss.portDefault, true);

    // 直接写 ws:// 的客户端很多，按 web 规则解，别误判成 MQTT
    const plain = parse('ws://broker.example.com:8083/mqtt');
    eq(plain.kind, 'web');
    eq(plain.path, '/mqtt');
    eq(plain.portDefault, false);

    // 原生 MQTT 端口不变
    eq(parse('mqtt://broker.example.com:1883').portDefault, true);
    eq(parse('mqtts://broker.example.com:8883').portDefault, true);
});

check('etcd：客户端 2379 认默认，2380 不认', () => {
    const r = parse('etcd://root:secret@etcd.example.com:2379/v3/kv');
    eq(r.scheme, 'etcd');
    eq(r.username, 'root');
    eq(r.port, '2379');
    eq(r.portDefault, true);
    // etcd 的路径是 API 前缀，不是库名
    eq(r.path, '/v3/kv');
    eq(r.database, '');
    eq(parse('etcd://etcd.example.com:2380').portDefault, false);
});

// ---------------------------------------------------------------- 批量
check('批量：空行跳过，但行号按原文算', () => {
    const out = U.parseText('a.example.com\n\n\nb.example.com');
    eq(out.results.length, 2);
    eq(out.results[0].line, 1);
    eq(out.results[1].line, 4);
    eq(out.skipped, 2);
});

check('批量：CRLF 与 CR 都当换行', () => {
    const out = U.parseText('a.example.com\r\nb.example.com\rc.example.com');
    eq(out.results.map((r) => r.line), [1, 2, 3]);
});

check('批量：超过上限只解析前 N 条并标记 truncated', () => {
    const many = [];
    for (let i = 0; i < 12; i++) many.push('h' + i + '.example.com');
    const out = U.parseText(many.join('\n'), { maxLines: 10 });
    eq(out.results.length, 10);
    eq(out.truncated, true);
});

check('批量：okCount 只数通过的', () => {
    const out = U.parseText('http://a.com\nhttp://b.com:99999\nhttp://c.com');
    eq(out.results.length, 3);
    eq(out.okCount, 2);
});

// ---------------------------------------------------------------- 导出
check('toJsonText：单条出对象、多条出数组，端口给数字', () => {
    const one = U.parseLine('https://u:p@example.com:8443/a?k=v#h');
    one.line = 1;
    const single = JSON.parse(U.toJsonText([one]));
    eq(single.ok, true);
    eq(single.port, 8443);
    eq(single.params, [{ key: 'k', value: 'v' }]);
    eq(single.username, 'u');

    const bad = U.parseLine('http://example.com:99999');
    bad.line = 2;
    const both = JSON.parse(U.toJsonText([one, bad]));
    ok(Array.isArray(both), '多条应该是数组');
    eq(both[0].params.length, 1);
    eq(both[1].ok, false);
});

check('toJsonText：只有键没有值的参数不带 value 字段', () => {
    const r = U.parseLine('https://example.com/?flag');
    r.line = 1;
    const out = JSON.parse(U.toJsonText([r]));
    eq(out.params, [{ key: 'flag' }]);
});

check('paramsToTsv：一行一个 key<TAB>value', () => {
    const r = U.parseLine('https://example.com/?a=1&b=2');
    eq(U.paramsToTsv(r), 'a\t1\nb\t2');
});

// ---------------------------------------------------------------- 小工具
check('formatBytes / utf8Bytes', () => {
    eq(U.formatBytes(0), '0 B');
    eq(U.formatBytes(512), '512 B');
    eq(U.utf8Bytes('abc'), 3);
    eq(U.utf8Bytes('中文'), 6);
    eq(U.utf8Bytes('😀'), 4);
});

check('decodePart：非法序列原样返回，不抛', () => {
    eq(U.decodePart('%ZZ', false), '%ZZ');
    eq(U.decodePart('%E4%B8%AD', false), '中');
    eq(U.decodePart('a+b', true), 'a b');
    eq(U.decodePart('a+b', false), 'a+b');
});

// ---------------------------------------------------------------- 汇总
console.log('\n--- urlparse: ' + passed + '/' + (passed + failed) + ' passed ---');
if (failed) {
    console.log('\n失败：');
    failures.forEach((f) => console.log('  - ' + f));
}
process.exit(failed ? 1 : 0);
