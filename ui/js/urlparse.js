/*
 * urlparse.js — URL 解析内核（纯函数，无 DOM、无网络）
 *
 * 为什么不用 `new URL()` 当主体：它有三个硬伤，正好都撞在这页的用途上。
 *   1. 必须带协议。粘一把 `example.com:8080/a`、`//cdn.x.com/a.js` 进来直接抛，
 *      而这页最常见的用法就是「从日志 / 抓包里捞出来的一堆半截 URL」。
 *   2. 会**改写**你写的东西：默认端口被抹掉（https:443 → 没有端口）、
 *      主机大小写被统一、路径里的 `%41` 被解码成 `A`。这一页是给人核对数据的，
 *      改写过的值看着和原值一样，反而更容易误判。
 *   3. 报错只有一句 "Invalid URL"，说不出坏在哪。
 *
 * 所以这里自己按 RFC 3986 的五个组成部分切（scheme / authority / path / query /
 * fragment），切不动的地方给具体的错误码，由界面翻成当前语言的一句话。
 * `URL` 只在需要 punycode（中文域名）时借一次，拿不到就算了。
 *
 * 边界：纯字符串处理，不做任何网络请求；单行过长 / 总行数过多有上限（LIMITS）。
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.DBXUrl = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var LIMITS = {
        // 一行 URL 的长度上限。真实 URL 到 2 KB 已经很夸张了，留足余量
        maxLineChars: 8192,
        // 一次最多解析多少行（再多就不是「看一眼」而是「跑批」了，交给脚本）
        maxLines: 2000,
        // 整段文本上限
        maxChars: 512 * 1024
    };

    // 认得的协议：带这些前缀就一定是协议，否则「a:b」还得看后面长得像不像端口
    var KNOWN_SCHEMES = {
        http: 1, https: 1, ws: 1, wss: 1, ftp: 1, ftps: 1, sftp: 1, ssh: 1, git: 1,
        file: 1, mailto: 1, tel: 1, sms: 1, data: 1, urn: 1, blob: 1, ldap: 1,
        irc: 1, ircs: 1, mqtt: 1, mqtts: 1, amqp: 1, amqps: 1, redis: 1, rediss: 1,
        mongodb: 1, mysql: 1, postgres: 1, postgresql: 1, jdbc: 1, rtsp: 1, svn: 1,
        /* 国产数据库：达梦、人大金仓、神通、GBase、瀚高、openGauss / GaussDB、
           Vastbase、优炫、OceanBase、TiDB、PolarDB、GoldenDB。
           驱动名各家用得不一样（`kingbase8` / `kingbase`、`gbase` / `gbase8a`），
           常用的几个都列上，写错一个字母也不至于整行解不开。 */
        dm: 1, kingbase: 1, kingbase8: 1, oscar: 1, gbase: 1, gbase8a: 1, gbase8s: 1,
        highgo: 1, opengauss: 1, gaussdb: 1, vastbase: 1, xugu: 1,
        oceanbase: 1, tidb: 1, polardb: 1, goldendb: 1,
        // 图数据库：NebulaGraph 的 `nebula://root:pass@host:9669/space`
        nebula: 1, nebulagraph: 1,
        // 时序库 TDengine：`taos://root:pass@host:6030/db`
        taos: 1, tdengine: 1,
        // 时序库 Apache IoTDB：`iotdb://root:pass@host:6667`
        iotdb: 1,
        // 时序库 InfluxDB：`influxdb://user:pass@host:8086/db`（HTTP API 端口就是 8086）
        influxdb: 1,
        /* MQTT over WebSocket 的两种写法：`mqtt+ws://broker:8083/mqtt`。
           不少客户端库也直接写 `ws://broker:8083/mqtt`，那种按 web 规则解就行，
           协议的标签会写成 WS，不会被误认成 MQTT。 */
        'mqtt+ws': 1, 'mqtt+wss': 1,
        // etcd 客户端地址：`etcd://user:pass@host:2379`
        etcd: 1
    };

    // 这些协议后面即使写成一个斜杠，剩下的也是主机（浏览器同样这么处理）
    var HOST_SCHEMES = { http: 1, https: 1, ws: 1, wss: 1, ftp: 1, ftps: 1, sftp: 1, ssh: 1, git: 1, rtsp: 1 };

    // 没有主机概念的协议：`mailto:me@example.com` 里那串是路径，不是「用户名@主机」
    // （jdbc 不在这里：`jdbc:mysql://…` 是套一层的地址，见 parseLine 里的分支）
    var OPAQUE_SCHEMES = { mailto: 1, tel: 1, sms: 1, data: 1, urn: 1, blob: 1 };

    // 默认端口：命中时提示「这个端口是默认的，可省略」
    var DEFAULT_PORT = {
        http: '80', https: '443', ws: '80', wss: '443',
        ftp: '21', ftps: '21', sftp: '22', ssh: '22', smtp: '25', ldap: '389',
        mysql: '3306', postgres: '5432', postgresql: '5432', mongodb: '27017',
        redis: '6379', amqp: '5672', amqps: '5671', mqtt: '1883', mqtts: '8883',
        // 国产数据库的安装默认端口（各家文档里的默认值）
        dm: '5236',            // 达梦 DM8
        kingbase: '54321', kingbase8: '54321',   // 人大金仓 KingbaseES
        oscar: '2003',         // 神通
        gbase: '5258', gbase8a: '5258', gbase8s: '9088',  // 南大通用
        highgo: '5866',        // 瀚高
        opengauss: '5432', gaussdb: '8000',
        vastbase: '5432',      // 海量
        xugu: '5138',          // 优炫
        oceanbase: '2881', tidb: '4000', polardb: '3306', goldendb: '3306',
        // 图数据库：NebulaGraph 的 graphd 默认 9669（metad 9559 / storaged 9779 不是入口）
        nebula: '9669', nebulagraph: '9669',
        /* 时序库 TDengine：原生连接 6030，REST / WebSocket 连接 6041。
           驱动分别写作 `TAOS` / `TAOS-RS` / `TAOS-WS`，端口因此要分三档认。 */
        taos: '6030', tdengine: '6030', 'taos-rs': '6041', 'taos-ws': '6041',
        // 时序库 Apache IoTDB：原生 RPC 6667（REST 18080 不是 JDBC 入口）
        iotdb: '6667',
        // 时序库 InfluxDB：HTTP API 8086（1.x 是 8086，2.x 默认同样 8086）
        influxdb: '8086',
        // MQTT over WebSocket：EMQX 这类 broker 的 ws 是 8083、wss 是 8084
        'mqtt+ws': '8083', 'mqtt+wss': '8084',
        // etcd：客户端 2379，节点间 2380（连接串只该写 2379）
        etcd: '2379'
    };

    /* 协议族：同一族里「怎么切」是一样的，跨族才换规则。
         web    http / https / ws / wss —— 浏览器口径：路径默认 `/`、`;` 不是分隔符
         ftp    ftp / ftps / sftp      —— 同 web 的切法，但账号密码是常态，端口常非默认
         shell  ssh / scp / git        —— 路径可省，端口默认 22
         jdbc   jdbc:<子协议>          —— 路径是库名，参数是驱动属性，`;` 也是分隔符
         db     mysql:// 这类裸写法     —— 和 jdbc 同一套：路径是库名，参数是连接属性
       其余（opaque 的 mailto / data、相对地址、没见过的协议）走通用规则。 */
    var KIND_OF = {
        http: 'web', https: 'web', ws: 'web', wss: 'web',
        ftp: 'ftp', ftps: 'ftp', sftp: 'ftp',
        ssh: 'shell', scp: 'shell', git: 'shell',
        /* 数据库的裸地址：`mysql://user:pass@host:3306/db`。
           语义和 `jdbc:mysql://…` 完全一样（路径是库名、参数是连接属性），
           只是少了 jdbc 那层前缀，所以归到同一套规则里，只是 kind 分开记。 */
        mysql: 'db', mariadb: 'db', postgres: 'db', postgresql: 'db',
        sqlserver: 'db', mssql: 'db', oracle: 'db', db2: 'db',
        redis: 'db', rediss: 'db', mongodb: 'db', 'mongodb+srv': 'db',
        clickhouse: 'db', cassandra: 'db',
        // 国产数据库（`dm://…` 这种裸写法也照此办）
        dm: 'db', kingbase: 'db', kingbase8: 'db', oscar: 'db',
        gbase: 'db', gbase8a: 'db', gbase8s: 'db', highgo: 'db',
        opengauss: 'db', gaussdb: 'db', vastbase: 'db', xugu: 'db',
        oceanbase: 'db', tidb: 'db', polardb: 'db', goldendb: 'db',
        // 图数据库的路径是「图空间」，切法同数据库族（路径当库名、参数当连接属性）
        nebula: 'db', nebulagraph: 'db',
        // 时序库：TDengine / IoTDB 的路径同样是库名（IoTDB 常不写）
        taos: 'db', tdengine: 'db', iotdb: 'db',
        // InfluxDB 的路径是库名（1.x）或 bucket 所在路径（2.x），一律当库名显示
        influxdb: 'db'
    };

    // 数据库族的两种写法（jdbc 套一层 / 裸 mysql://）在「怎么切」上没有区别
    function isDbKind(kind) {
        return kind === 'jdbc' || kind === 'db';
    }

    /* 数据库族常把属性写成 `;key=value` 直接串在后面（SQL Server 最常见），
       没有 `?`。`mysql://host:1433;databaseName=demo;user=sa` 里那串分号
       如果留在地址里，会一路被当成库名（或主机名）吞掉。 */
    function splitSemiProps(text) {
        var at = text.indexOf(';');
        if (at < 0) return { head: text, props: '' };
        return { head: text.slice(0, at), props: text.slice(at + 1) };
    }

    /* ------------------------------- 小工具 ------------------------------- */

    // 百分号解码：`+` 在 query 里代表空格，路径里不是（所以两个开关分开）
    // 非法转义（`%ZZ`、`%E4`）保留原样，不抛——这一页宁可显示原值也不整行失败
    function decodePart(s, plusAsSpace) {
        var text = String(s == null ? '' : s);
        if (text.indexOf('%') < 0 && !(plusAsSpace && text.indexOf('+') >= 0)) return text;
        if (plusAsSpace) text = text.replace(/\+/g, ' ');
        return text.replace(/(?:%[0-9A-Fa-f]{2})+/g, function (seq) {
            try {
                return decodeURIComponent(seq);
            } catch (e) {
                return seq;
            }
        });
    }

    // UTF-8 字节数（徽标上显示「多大」，中英文都算得准）
    function utf8Bytes(s) {
        var text = String(s == null ? '' : s);
        var n = 0;
        for (var i = 0; i < text.length; i++) {
            var c = text.charCodeAt(i);
            if (c < 0x80) n += 1;
            else if (c < 0x800) n += 2;
            else if (c >= 0xd800 && c <= 0xdbff) { n += 4; i++; }
            else n += 3;
        }
        return n;
    }

    function looksLikePort(s) {
        return /^[0-9]{1,5}$/.test(s);
    }

    /* 主机名的字符校验。
       ASCII 侧只认字母 / 数字 / `.` / `-` / `_`（内网主机常用）与百分号编码
       （`exa%6Dple.com` 是合法写法，浏览器会先解码再判）；非 ASCII 侧只认字母、
       组合符、数字——表情、货币符号、标点、空白、控制符都不属于域名。

       这一道必须自己判，不能指望 `new URL()`：宽松模式下它不报错，会把
       `前1😀43131312321` 硬编成 `xn--143131312321-di6tl0218b` 这种废码，
       看着像解析成功，实际拿去请求一定失败。 */
    var HOST_BAD_ASCII = /[^A-Za-z0-9._%\-]/;
    var HOST_BAD_NON_ASCII = /[^\x00-\x7F\p{L}\p{M}\p{N}]/u;

    function hostCharProblem(host) {
        var h = String(host || '');
        if (!h) return '';
        // IPv6 不按域名规则走（`::1` 里的冒号不是端口）；端口在这一步已经拆走了
        if (h.charAt(0) === '[' || h.indexOf(':') >= 0) return '';
        // 两段分开判：ASCII 与 Unicode 的合法字符集不一样，
        // 混在一起会把中文域名（`例子.测试`）误杀
        if (HOST_BAD_ASCII.test(h.replace(/[^\x00-\x7F]/g, ''))) return 'badHost';
        if (HOST_BAD_NON_ASCII.test(h)) return 'badHostChar';
        return '';
    }

    function classifyHost(host) {
        var h = String(host || '');
        if (!h) return 'none';
        if (h.charAt(0) === '[' || h.indexOf(':') >= 0) return 'ipv6';
        if (/^localhost$/i.test(h) || /^127\./.test(h) || h === '::1') return 'loopback';
        if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
            var ok = h.split('.').every(function (p) { return Number(p) <= 255; });
            return ok ? 'ipv4' : 'unknown';
        }
        if (/[^\x00-\x7F]/.test(h)) return 'idn';
        return 'domain';
    }

    /* ------------------------------ 逐段解析 ------------------------------ */

    /**
     * 解析一行。
     * 返回的对象字段是「界面要显示的最终值」，错误的行也保留 raw，
     * 上层可以照常把它列出来并标红，不用为坏数据另写一套分支。
     */
    function parseLine(raw) {
        var input = String(raw == null ? '' : raw);
        var text = input.trim();
        var res = {
            raw: input,
            ok: false,
            errorCode: '',
            // 协议族（web / ftp / shell / jdbc / opaque / other / relative / scp）
            kind: '',
            scheme: '',
            // 带驱动的完整写法（`jdbc` + `mysql` → `jdbc:mysql`），标题与来源用它
            schemeFull: '',
            subprotocol: '',
            hasScheme: false,
            protocolRelative: false,
            opaque: false,
            username: '',
            password: '',
            hasUser: false,
            hasPassword: false,
            host: '',
            hostAscii: '',
            hostType: 'none',
            // JDBC 才有：`/demo` 里的库名
            database: '',
            port: '',
            portDefault: false,
            path: '',
            pathDecoded: '',
            query: '',
            queryDecoded: '',
            hash: '',
            hashDecoded: '',
            origin: '',
            params: [],
            dupeKeys: [],
            bytes: utf8Bytes(input)
        };

        if (!text) { res.errorCode = 'empty'; return res; }
        if (text.length > LIMITS.maxLineChars) { res.errorCode = 'tooLong'; return res; }

        var rest = text;

        // 1. 片段（第一个 # 之后全是它，里面允许再有 # 与 ?）
        var hashAt = rest.indexOf('#');
        if (hashAt >= 0) {
            res.hash = rest.slice(hashAt + 1);
            rest = rest.slice(0, hashAt);
        }

        // 2. 查询串（第一个 ? 之后全是它）
        var queryAt = rest.indexOf('?');
        if (queryAt >= 0) {
            res.query = rest.slice(queryAt + 1);
            rest = rest.slice(0, queryAt);
        }

        // 3. 协议。这里要区分三种「带冒号但不是协议」的写法：
        //      example.com:8080/a   → 主机 + 端口（冒号后面是纯数字）
        //      me:pwd@host/a        → 用户名 + 密码（冒号后面有 @）
        //      mailto:me@host       → 真协议，后面没有 // 也不算主机
        var schemeMatch = /^([A-Za-z][A-Za-z0-9+.\-]*):/.exec(rest);
        if (schemeMatch) {
            var candidate = schemeMatch[1].toLowerCase();
            var afterColon = rest.slice(schemeMatch[0].length);
            var hasSlashSlash = afterColon.indexOf('//') === 0;
            var atBeforeSlash = afterColon.split('/')[0].indexOf('@') >= 0;

            if (hasSlashSlash) {
                res.scheme = candidate;
                res.hasScheme = true;
                res.kind = KIND_OF[candidate] || 'other';
                rest = afterColon.slice(2);
                // 裸数据库地址同样认 `;` 属性：`mysql://host:3306;user=sa/demo`
                if (res.kind === 'db') {
                    var semiBare = splitSemiProps(rest);
                    if (semiBare.props) {
                        rest = semiBare.head;
                        res.query = res.query ? semiBare.props + '&' + res.query : semiBare.props;
                    }
                }
            } else if (candidate === 'jdbc') {
                /* JDBC 是「套一层的地址」：`jdbc:mysql://host:port/db?user=…`。
                   真按 opaque 处理的话，主机 / 端口 / 库名全挤在「路径」里，
                   而这一页最常见的用途恰恰是核对连接串——所以拆进去，
                   协议写成 `jdbc:mysql`（和原文一致），子协议另存一份用来认默认端口。
                   没有 `//` 的写法（jdbc:h2:mem:test、jdbc:sqlite:/tmp/a.db）保持 opaque。 */
                res.kind = 'jdbc';
                const inner = /^([A-Za-z][A-Za-z0-9+.\-]*):\/\/([\s\S]*)$/.exec(afterColon);
                if (inner) {
                    res.subprotocol = inner[1].toLowerCase();
                    // 协议只写 jdbc，mysql 是驱动（子协议）——两行分开看才对得上文档
                    res.scheme = 'jdbc';
                    res.hasScheme = true;
                    rest = inner[2];
                    /* SQL Server 一族把属性写成 `;databaseName=x;user=sa` 直接跟在后面，
                       没有 `?`。摘出来当参数，免得整串被当成主机名判成非法
                       （`host:1433;databaseName=…`）。 */
                    var semiJdbc = splitSemiProps(rest);
                    if (semiJdbc.props) {
                        rest = semiJdbc.head;
                        res.query = res.query ? semiJdbc.props + '&' + res.query : semiJdbc.props;
                    }
                } else {
                    res.scheme = 'jdbc';
                    res.hasScheme = true;
                    res.opaque = true;
                    rest = afterColon;
                }
            } else if (KNOWN_SCHEMES[candidate]) {
                res.scheme = candidate;
                res.hasScheme = true;
                res.kind = OPAQUE_SCHEMES[candidate] ? 'opaque' : (KIND_OF[candidate] || 'other');
                if (OPAQUE_SCHEMES[candidate]) {
                    res.opaque = true;
                    rest = afterColon;
                } else if (HOST_SCHEMES[candidate] === 1) {
                    // 例如 http:/example.com（少打一条斜杠）：协议保留，剩下按主机 + 路径解
                    rest = afterColon.replace(/^\/+/, '');
                } else {
                    rest = afterColon;
                }
            } else if (looksLikePort(afterColon.split('/')[0]) && afterColon.split('/')[0].indexOf('@') < 0) {
                // host:port —— 不动 rest，交给下面的 authority 分支
            } else if (atBeforeSlash) {
                // user:pass@host —— 同理，交给 authority
            } else if (/^[0-9]/.test(afterColon) === false && afterColon.indexOf('/') !== 0) {
                // 真协议但写法是 opaque 的（mailto: / data: / tel: 等）
                res.scheme = candidate;
                res.hasScheme = true;
                res.opaque = true;
                rest = afterColon;
            }
        }

        if (res.opaque) {
            res.kind = res.kind || 'opaque';
            // 没有 `//` 的 JDBC（jdbc:h2:mem:test;DB_CLOSE_DELAY=-1）同样是「; 后面是属性」
            if (isDbKind(res.kind)) {
                var semiOpaque = rest.indexOf(';');
                if (semiOpaque >= 0) {
                    res.query = res.query
                        ? rest.slice(semiOpaque + 1) + '&' + res.query
                        : rest.slice(semiOpaque + 1);
                    rest = rest.slice(0, semiOpaque);
                }
            }
            res.path = rest;
            res.pathDecoded = decodePart(rest, false);
            res.params = parseQuery(res.query, isDbKind(res.kind));
            res.dupeKeys = dupeKeysOf(res.params);
            res.origin = res.scheme + ':';
            res.hostType = 'none';
            res.ok = true;
            return res;
        }

        /* scp 写法：`git@github.com:org/repo.git`、`ssh deploy@10.0.0.5:/var/www`。
           没有协议也没有 `//`，冒号后面不是端口而是路径——运维笔记里到处都是，
           按普通 URL 解会变成「主机 github.com:org」+ 端口非法。
           冒号后是纯数字的（`root@host:22`）仍然按端口理解，别抢了正常写法。 */
        if (!res.hasScheme && !res.path && res.query === '') {
            var scpMatch = /^([^@\s\/]+)@([^:@\s\/]+):(.+)$/.exec(rest);
            if (scpMatch && !/^\d+$/.test(scpMatch[3])) {
                res.kind = 'scp';
                res.scheme = 'scp';
                res.schemeFull = 'scp';
                res.hasScheme = true;
                res.username = scpMatch[1];
                res.hasUser = true;
                res.host = scpMatch[2];
                res.path = '/' + scpMatch[3].replace(/^\/+/, '');
                res.pathDecoded = decodePart(res.path, false);
                res.hostType = classifyHost(res.host);
                res.hostDisplay = res.host;
                res.origin = 'scp://' + res.host;
                res.params = [];
                res.dupeKeys = [];
                res.errorCode = hostCharProblem(res.host);
                res.ok = !res.errorCode;
                return res;
            }
        }

        // 4. 主机段（authority）：先看有没有 //
        if (rest.indexOf('//') === 0) {
            res.protocolRelative = !res.hasScheme;
            rest = rest.slice(2);
        }

        var slashAt = rest.indexOf('/');
        var authority = slashAt >= 0 ? rest.slice(0, slashAt) : rest;
        var pathPart = slashAt >= 0 ? rest.slice(slashAt) : '';

        // 5. 用户名 / 密码：最后一个 @ 之前是 userinfo（路径里出现的 @ 不算）
        var at = authority.lastIndexOf('@');
        if (at >= 0) {
            var userinfo = authority.slice(0, at);
            authority = authority.slice(at + 1);
            var colon = userinfo.indexOf(':');
            if (colon >= 0) {
                res.username = decodePart(userinfo.slice(0, colon), false);
                res.password = decodePart(userinfo.slice(colon + 1), false);
                res.hasPassword = true;
            } else {
                res.username = decodePart(userinfo, false);
            }
            res.hasUser = true;
        }

        // 6. 主机与端口。IPv6 必须带方括号，否则冒号会被当成分隔符
        if (authority.charAt(0) === '[') {
            var close = authority.indexOf(']');
            if (close < 0) {
                res.errorCode = 'badHost';
                res.host = authority;
                return res;
            }
            res.host = authority.slice(1, close);
            var afterClose = authority.slice(close + 1);
            if (afterClose) {
                if (afterClose.charAt(0) !== ':') { res.errorCode = 'badHost'; return res; }
                res.port = afterClose.slice(1);
            }
        } else if (authority) {
            var lastColon = authority.lastIndexOf(':');
            if (lastColon >= 0) {
                var maybePort = authority.slice(lastColon + 1);
                if (looksLikePort(maybePort) || maybePort === '') {
                    res.host = authority.slice(0, lastColon);
                    res.port = maybePort;
                } else {
                    // 冒号后面不是端口：很可能漏了方括号的 IPv6，或者域名里混了冒号
                    res.host = authority;
                    res.errorCode = 'badPort';
                }
            } else {
                res.host = authority;
            }
        }

        if (res.port && !/^[0-9]{1,5}$/.test(res.port)) {
            res.errorCode = 'badPort';
        } else if (res.port && Number(res.port) > 65535) {
            res.errorCode = 'badPort';
        }

        // JDBC 的 scheme 是 `jdbc:mysql` 这种复合名，默认端口得按子协议查
        var portKey = res.subprotocol || res.scheme;
        res.portDefault = !!res.port && DEFAULT_PORT[portKey] === String(Number(res.port));
        res.hostType = classifyHost(res.host);
        // IPv6 在来源 / 标题里要带方括号，否则 `https://::1:5173` 看着像坏数据
        res.hostDisplay = res.hostType === 'ipv6' ? '[' + res.host + ']' : res.host;

        // 主机名里不允许空格 / 反斜杠这类明显不是主机的字符（半角空格已经 trim 过，
        // 这里管的是中间那种：「exa mple.com」），以及表情这类根本不能进域名的字符
        var hostProblem = hostCharProblem(res.host);
        if (!res.errorCode && hostProblem) res.errorCode = hostProblem;

        // 7. 路径
        // 没写协议的（`example.com:8080/a`、`//cdn/a.js`）归到 relative，
        // 界面上不显示协议，但规则跟 web 一样
        if (!res.kind) res.kind = res.hasScheme ? 'other' : 'relative';
        res.path = pathPart;
        res.pathDecoded = decodePart(pathPart, false);
        // 数据库族的路径是库名：`/demo` → demo（`mysql://…/demo` 同理）
        if (isDbKind(res.kind) && pathPart && pathPart !== '/') {
            res.database = pathPart.replace(/^\/+/, '');
        }

        // 8. 查询串与参数。分隔符按协议族分：
        //    JDBC 认 `&` 和 `;`（SQL Server 一族全是分号），
        //    HTTP / FTP 只认 `&`——浏览器早就不拿分号当分隔符了，
        //    把 `?ids=1;2;3` 拆成三段反而是错的。
        res.params = parseQuery(res.query, isDbKind(res.kind));
        // SQL Server 一族的库名不在路径里，而是写成属性：`;databaseName=demo`
        if (isDbKind(res.kind) && !res.database) {
            var dbParam = res.params.filter(function (p) {
                return p.key.toLowerCase() === 'databasename' && p.value;
            })[0];
            if (dbParam) res.database = dbParam.value;
        }
        res.dupeKeys = dupeKeysOf(res.params);
        res.queryDecoded = res.params.map(function (p) {
            return p.hasEq ? p.key + '=' + p.value : p.key;
        }).join('&');
        res.hashDecoded = decodePart(res.hash, true);

        // 9. 来源（scheme + host + port，浏览器的 origin 口径）。
        // 协议要带上驱动：只看 `scheme` 会把 `jdbc:mysql://…` 写成 `jdbc://…`
        res.schemeFull = res.subprotocol ? res.scheme + ':' + res.subprotocol : res.scheme;
        if (res.host) {
            res.origin = (res.schemeFull ? res.schemeFull + ':' : '') + '//' + res.hostDisplay + (res.port ? ':' + res.port : '');
        }

        // 10. 中文域名顺手给一个 punycode 形式（借一次 URL，拿不到就算了）。
        // 主机已经判为非法时不再编：编出来的是废码，比不给更误导
        if (res.hostType === 'idn' && !res.errorCode && typeof URL === 'function') {
            try {
                var probe = new URL('http://' + res.host + (res.port ? ':' + res.port : '') + '/');
                if (probe.hostname && probe.hostname !== res.host) res.hostAscii = probe.hostname;
            } catch (e) { /* 不是合法主机就算了，别把整行搞成错误 */ }
        }

        // 既没有主机也没有路径，也不是 opaque：多半是空串或者只有个 "#x"
        if (!res.host && !res.path && !res.query) {
            res.errorCode = res.errorCode || 'badHost';
            return res;
        }
        if (!res.errorCode) res.ok = true;
        return res;
    }

    /**
     * 查询串 → 参数数组。
     * 分隔符由调用方决定：JDBC 认 `&` 和 `;`，其余只认 `&`。
     * 没有 `=` 的段是「只有键」，界面上要单独标出来——`?debug` 和 `?debug=` 是两回事。
     */
    function parseQuery(query, semi) {
        var text = String(query == null ? '' : query);
        if (!text) return [];
        var out = [];
        var parts = text.split(semi ? /[&;]/ : /&/);
        for (var i = 0; i < parts.length; i++) {
            var piece = parts[i];
            if (!piece) continue;
            var eq = piece.indexOf('=');
            var rawKey = eq >= 0 ? piece.slice(0, eq) : piece;
            var rawValue = eq >= 0 ? piece.slice(eq + 1) : '';
            out.push({
                key: decodePart(rawKey, true),
                value: decodePart(rawValue, true),
                rawKey: rawKey,
                rawValue: rawValue,
                hasEq: eq >= 0,
                encoded: rawKey !== decodePart(rawKey, true) || rawValue !== decodePart(rawValue, true)
            });
        }
        return out;
    }

    function dupeKeysOf(params) {
        var seen = {};
        var dupes = [];
        (params || []).forEach(function (p) {
            if (seen[p.key]) {
                if (dupes.indexOf(p.key) < 0) dupes.push(p.key);
            }
            seen[p.key] = (seen[p.key] || 0) + 1;
        });
        return dupes;
    }

    /**
     * 整段文本 → 结果列表。空行跳过（粘贴时最容易带进来一堆空行），
     * 但行号按原文算，界面上的「第 3 行」和编辑器里的第 3 行必须对上。
     */
    function parseText(text, opts) {
        var options = opts || {};
        var maxLines = options.maxLines || LIMITS.maxLines;
        var source = String(text == null ? '' : text);
        var truncated = false;
        if (source.length > LIMITS.maxChars) {
            source = source.slice(0, LIMITS.maxChars);
            truncated = true;
        }
        var lines = source.split(/\r\n|\r|\n/);
        var results = [];
        var skipped = 0;
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            if (!line.trim()) { skipped++; continue; }
            if (results.length >= maxLines) { truncated = true; break; }
            var one = parseLine(line);
            one.line = i + 1;
            results.push(one);
        }
        return {
            results: results,
            skipped: skipped,
            totalLines: lines.length,
            truncated: truncated,
            okCount: countOk(results)
        };
    }

    function countOk(results) {
        var n = 0;
        (results || []).forEach(function (r) { if (r.ok) n++; });
        return n;
    }

    // 复制用的 JSON：一条一行对象的数组，字段名固定（方便直接喂给别的脚本）
    function toPlain(one) {
        var o = {
            line: one.line,
            input: one.raw.trim(),
            ok: one.ok
        };
        if (!one.ok) {
            o.error = one.errorCode;
            return o;
        }
        // 协议族：拿到 JSON 的一方不用自己再猜这串是网页地址还是连接串
        if (one.kind) o.kind = one.kind;
        if (one.hasScheme) o.scheme = one.scheme;
        if (one.subprotocol) o.subprotocol = one.subprotocol;
        if (one.hasUser) o.username = one.username;
        if (one.hasPassword) o.password = one.password;
        if (one.host) o.host = one.host;
        if (one.hostAscii) o.hostAscii = one.hostAscii;
        if (one.port) o.port = Number(one.port);
        if (one.path) o.path = one.path;
        if (one.database) o.database = one.database;
        if (one.query) o.query = one.query;
        if (one.hash) o.hash = one.hash;
        if (one.params.length) {
            o.params = one.params.map(function (p) {
                return p.hasEq ? { key: p.key, value: p.value } : { key: p.key };
            });
        }
        if (one.origin) o.origin = one.origin;
        return o;
    }

    function toJsonText(results) {
        var list = (results || []).map(toPlain);
        return JSON.stringify(list.length === 1 ? list[0] : list, null, 2);
    }

    // 参数表 → TSV（「复制参数」用，粘进表格正好一行一个）
    function paramsToTsv(one) {
        var lines = [];
        (one && one.params ? one.params : []).forEach(function (p) {
            lines.push(p.key + '\t' + (p.hasEq ? p.value : ''));
        });
        return lines.join('\n');
    }

    function formatBytes(n) {
        var v = Number(n) || 0;
        if (v < 1024) return v + ' B';
        if (v < 1024 * 1024) return (v / 1024).toFixed(v < 10240 ? 1 : 0) + ' KB';
        return (v / 1024 / 1024).toFixed(1) + ' MB';
    }

    return {
        LIMITS: LIMITS,
        DEFAULT_PORT: DEFAULT_PORT,
        KNOWN_SCHEMES: KNOWN_SCHEMES,
        KIND_OF: KIND_OF,
        isDbKind: isDbKind,
        parseLine: parseLine,
        parseQuery: parseQuery,
        parseText: parseText,
        toPlain: toPlain,
        toJsonText: toJsonText,
        paramsToTsv: paramsToTsv,
        classifyHost: classifyHost,
        hostCharProblem: hostCharProblem,
        decodePart: decodePart,
        utf8Bytes: utf8Bytes,
        formatBytes: formatBytes
    };
});
