/*
 * Data converters core — pure functions, no DOM dependency.
 *
 * Loaded as a classic script in the plugin (exposes window.DBXConvert) and as a
 * CommonJS module in tests. Third-party parsers are looked up lazily on
 * globalThis so the file works in both environments:
 *   browser: jsyaml / xml2js / js2xml come from the vendored bundles
 *   node:    tests assign them to globalThis before requiring this file
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.DBXConvert = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var FORMATS = ['json', 'yaml', 'xml', 'properties'];

    function globalLib(name) {
        return typeof globalThis !== 'undefined' ? globalThis[name] : undefined;
    }

    function stripBom(text) {
        return String(text == null ? '' : text).replace(/^\uFEFF/, '');
    }

    /* ---------------------------------------------------------------- parse */

    function parseData(text, format) {
        var raw = stripBom(text);
        if (format === 'json') {
            try {
                return JSON.parse(raw);
            } catch (jsonErr) {
                var yaml = globalLib('jsyaml');
                if (yaml && typeof yaml.load === 'function') {
                    try {
                        return yaml.load(raw);
                    } catch (yamlErr) {
                        throw new Error('既不是合法 JSON 也不是合法 YAML: ' + jsonErr.message);
                    }
                }
                throw jsonErr;
            }
        }
        if (format === 'yaml') {
            var y = globalLib('jsyaml');
            if (!y || typeof y.load !== 'function') throw new Error('js-yaml 未加载');
            try {
                return y.load(raw);
            } catch (yamlErr) {
                try {
                    return JSON.parse(raw);
                } catch (jsonErr) {
                    throw yamlErr;
                }
            }
        }
        if (format === 'xml') return xmlToObj(raw);
        if (format === 'properties') return propertiesToObj(raw);
        throw new Error('未知格式: ' + format);
    }

    /* ------------------------------------------------------------ serialize */

    function serializeData(obj, format) {
        if (format === 'json') {
            // 一律用原生 2 空格缩进：转换器/格式化按钮的输出要能和其它工具逐字对齐，
            // 早先引入的 pretty-compact 写法会把短对象压成 {"a": 1, "b": {...}} 一行，
            // 点「格式化」看起来像没生效，因此不再使用。
            return JSON.stringify(obj, null, 2);
        }
        if (format === 'yaml') {
            var y = globalLib('jsyaml');
            if (!y || typeof y.dump !== 'function') throw new Error('js-yaml 未加载');
            return y.dump(obj, { noRefs: true, lineWidth: 120 });
        }
        if (format === 'xml') return objToXml(obj);
        if (format === 'properties') return objToProperties(obj);
        throw new Error('未知格式: ' + format);
    }

    /**
     * One-shot conversion used by every UI entry point.
     * Same-format conversions never round-trip through the object graph, so
     * XML keeps its root element and properties keeps its exact text shape.
     */
    function convert(text, srcFormat, tgtFormat) {
        var raw = stripBom(text);
        if (!raw.trim()) return '';
        if (srcFormat === tgtFormat) {
            if (tgtFormat === 'xml') {
                xmlToObj(raw); // 先校验，非法 XML 不应被"格式化"成看似正常的结果
                return formatXmlString(raw);
            }
            return serializeData(parseData(raw, srcFormat), tgtFormat);
        }
        return serializeData(parseData(raw, srcFormat), tgtFormat);
    }

    /* ------------------------------------------------------------------ xml */

    function formatXmlString(xml) {
        var xml2js = globalLib('xml2js');
        var js2xml = globalLib('js2xml');
        if (typeof xml2js === 'function' && typeof js2xml === 'function') {
            try {
                var tree = xml2js(xml, { compact: false, spaces: 2 });
                return js2xml(tree, { compact: false, spaces: 2 });
            } catch (e) {
                /* fall back to the regex formatter below */
            }
        }

        var formatted = '';
        var body = String(xml).replace(/>\s*</g, '><').trim();
        var decl = '';
        var declMatch = body.match(/^<\?xml.*?\?>/);
        if (declMatch) {
            decl = declMatch[0];
            body = body.replace(declMatch[0], '').trim();
        }
        var pad = 0;
        body.replace(/(>)(<)(\/*)/g, '$1\n$2$3').split('\n').forEach(function (node) {
            var indent = 0;
            if (node.match(/.+<\/\w[^>]*>$/)) indent = 0;
            else if (node.match(/^<\/\w/)) {
                if (pad !== 0) pad -= 1;
            } else if (node.match(/^<\w[^>]*[^/]>.*$/)) indent = 1;
            formatted += new Array(pad + 1).join('  ') + node + '\n';
            pad += indent;
        });
        return (decl ? decl + '\n' : '') + formatted.trim();
    }

    function xmlToObj(xmlStr) {
        var raw = stripBom(xmlStr).trim();
        if (raw.startsWith('<?xml')) raw = raw.replace(/<\?xml.*?\?>/, '').trim();
        // xml-js needs exactly one document element; wrap unless the caller
        // already provided a <root> envelope.
        var cleanXml = raw.startsWith('<root>') ? raw : '<root>' + raw + '</root>';

        var xml2js = globalLib('xml2js');
        if (typeof xml2js === 'function') {
            try {
                var result = xml2js(cleanXml, { compact: true, trim: true });

                function cleanNode(node) {
                    if (typeof node !== 'object' || node === null) return node;
                    if (Array.isArray(node)) return node.map(cleanNode);
                    var keys = Object.keys(node);
                    if (keys.length === 1 && keys[0] === '_text') return node._text;
                    var cleaned = {};
                    keys.forEach(function (key) {
                        cleaned[key] = cleanNode(node[key]);
                    });
                    return cleaned;
                }

                return cleanNode(result.root !== undefined ? result.root : result);
            } catch (e) {
                /* fall through to DOMParser */
            }
        }

        if (typeof DOMParser === 'undefined') {
            throw new Error('XML 解析失败：缺少 xml-js 或 DOMParser');
        }
        var doc = new DOMParser().parseFromString(cleanXml, 'text/xml');
        if (doc.querySelector('parsererror')) throw new Error('XML 格式错误');

        function nodeToObjInner(node) {
            if (node.children.length === 0) return node.textContent;
            var obj = {};
            for (var i = 0; i < node.children.length; i++) {
                var child = node.children[i];
                if (obj[child.nodeName] !== undefined) {
                    if (!Array.isArray(obj[child.nodeName])) obj[child.nodeName] = [obj[child.nodeName]];
                    obj[child.nodeName].push(nodeToObjInner(child));
                } else {
                    obj[child.nodeName] = nodeToObjInner(child);
                }
            }
            return obj;
        }
        return nodeToObjInner(doc.documentElement);
    }

    function objToXml(obj) {
        var js2xml = globalLib('js2xml');
        if (typeof js2xml === 'function') {
            try {
                var xml = js2xml({ root: obj }, { compact: true, ignoreComment: true, spaces: 2 });
                if (xml.startsWith('<root>') && xml.endsWith('</root>')) {
                    return formatXmlString(xml.replace(/<\/?root>/g, '').trim());
                }
                return xml;
            } catch (e) {
                /* fall back to the hand-rolled builder below */
            }
        }

        var out = '';
        function build(value, name, depth) {
            var indent = new Array(depth + 1).join('  ');
            if (Array.isArray(value)) {
                value.forEach(function (item) {
                    build(item, name || 'item', depth);
                });
            } else if (typeof value === 'object' && value !== null) {
                var keys = Object.keys(value);
                if (keys.length === 0) {
                    out += indent + '<' + name + '/>\n';
                    return;
                }
                out += indent + '<' + name + '>\n';
                keys.forEach(function (key) {
                    build(value[key], key, depth + 1);
                });
                out += indent + '</' + name + '>\n';
            } else {
                var safe = String(value === null ? '' : value)
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;');
                out += indent + '<' + name + '>' + safe + '</' + name + '>\n';
            }
        }
        Object.keys(obj).forEach(function (key) {
            build(obj[key], key, 0);
        });
        return '<?xml version="1.0" encoding="UTF-8"?>\n' + out.trim();
    }

    /* ----------------------------------------------------------- properties */

    /*
     * 把 a.b[0][1].c 拆成 token 序列。
     * 关键点：点号后的纯数字是「对象键」，方括号里的数字才是「数组下标」，
     * 旧实现用 key.split(/\.|\[|\]/) 把两者混成一样的数字，
     * 于是 0.0[0] 会被当成三层数组，往返一次就多一层。
     */
    function propertyTokens(key) {
        var tokens = [];
        key.split('.').forEach(function (segment) {
            if (segment === '') return;
            var match = segment.match(/^([^\[\]]*)((?:\[\d+\])*)$/);
            if (!match) {
                tokens.push({ type: 'prop', name: segment });
                return;
            }
            if (match[1] !== '') tokens.push({ type: 'prop', name: match[1] });
            var indexes = match[2].match(/\[\d+\]/g) || [];
            indexes.forEach(function (token) {
                tokens.push({ type: 'index', index: Number(token.slice(1, -1)) });
            });
        });
        return tokens;
    }

    function propertiesToObj(str) {
        var result = {};
        stripBom(str).split(/\r?\n/).forEach(function (line) {
            line = line.trim();
            if (!line || line[0] === '#' || line[0] === '!') return;
            var eq = line.indexOf('=');
            if (eq <= 0) return;

            var key = line.slice(0, eq).trim();
            var value = line.slice(eq + 1).trim();
            var tokens = propertyTokens(key);
            if (!tokens.length) return;

            var current = result;
            for (var i = 0; i < tokens.length; i++) {
                var token = tokens[i];
                var name = token.type === 'index' ? token.index : token.name;
                var isLast = i === tokens.length - 1;

                if (isLast) {
                    current[name] = value;
                    continue;
                }

                var next = tokens[i + 1];
                var wantArray = next.type === 'index';
                var existing = current[name];

                if (typeof existing !== 'object' || existing === null) {
                    current[name] = wantArray ? [] : {};
                } else if (wantArray && !Array.isArray(existing)) {
                    // 先出现 a.b=… 再出现 a[0]=… 时，以数组为准（否则下标无处安放）
                    current[name] = [];
                }
                current = current[name];
            }
        });
        return result;
    }

    function objToProperties(obj, prefix) {
        var out = [];
        var isArray = Array.isArray(obj);
        Object.keys(obj).forEach(function (key) {
            var value = obj[key];
            // 数组空洞（null 占位）没有对应行，跳过以免凭空生成 key=
            if (isArray && (value === null || value === undefined)) return;

            var fullKey = prefix === undefined || prefix === ''
                ? String(key)
                : (isArray ? prefix + '[' + key + ']' : prefix + '.' + key);

            if (value !== null && typeof value === 'object') {
                var nested = objToProperties(value, fullKey);
                if (nested) out.push(nested);
            } else {
                out.push(fullKey + '=' + (value === null || value === undefined ? '' : value));
            }
        });
        return out.join('\n');
    }

    /* -------------------------------------------------------------- helpers */

    /** Map a parser error onto line/column of the original input. */
    function locateError(err, text) {
        var message = String((err && err.message) || err || '');
        var line = null;
        var column = null;

        // js-yaml attaches a mark with 0-based line/column
        if (err && err.mark && typeof err.mark.line === 'number') {
            line = err.mark.line + 1;
            column = err.mark.column + 1;
            return { line: line, column: column, message: message };
        }

        var byPos = message.match(/position\s+(\d+)/i);
        if (byPos) {
            var pos = Math.min(Number(byPos[1]), text.length);
            var before = text.slice(0, pos);
            line = before.split('\n').length;
            column = pos - before.lastIndexOf('\n');
            return { line: line, column: column, message: message };
        }

        var byMark = message.match(/line\s+(\d+),?\s*column\s+(\d+)/i);
        if (byMark) {
            line = Number(byMark[1]);
            column = Number(byMark[2]);
        }
        return { line: line, column: column, message: message };
    }

    return {
        FORMATS: FORMATS,
        parseData: parseData,
        serializeData: serializeData,
        convert: convert,
        formatXmlString: formatXmlString,
        xmlToObj: xmlToObj,
        objToXml: objToXml,
        propertiesToObj: propertiesToObj,
        objToProperties: objToProperties,
        locateError: locateError
    };
});
