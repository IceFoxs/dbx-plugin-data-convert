/*
 * xlsxread.js — 零依赖读取 .xlsx（ZIP + 原生 DecompressionStream + 轻量 XML 扫描）
 *
 * 只用 DOMParser 之外的浏览器原生能力，不再额外塞一份 SheetJS（那个包 1 MB 起）。
 * 解析策略：ZIP 中央目录找条目 → deflate-raw 解压 → 正则扫 <row>/<c> 标签，
 * 比 DOM 解析省内存，10 万行也不会把页面拖死。
 *
 * 老式 .xls（BIFF 二进制）不支持，请另存为 .xlsx 或 .csv。
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.DBXXlsx = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // 解压后的工作表 XML 上限：压缩包 10 MB 也可能膨胀到几百 MB，必须提前拦
    var MAX_ENTRY_BYTES = 80 * 1024 * 1024;

    var BUILTIN_DATE_FORMATS = {
        14: 1, 15: 1, 16: 1, 17: 1, 18: 1, 19: 1, 20: 1, 21: 1, 22: 1,
        27: 1, 30: 1, 36: 1, 45: 1, 46: 1, 47: 1, 50: 1, 57: 1
    };

    function toBytes(input) {
        if (input instanceof Uint8Array) return input;
        if (typeof ArrayBuffer !== 'undefined' && input instanceof ArrayBuffer) return new Uint8Array(input);
        if (input && input.buffer) return new Uint8Array(input.buffer, input.byteOffset || 0, input.byteLength || input.buffer.byteLength);
        throw new Error('xlsx: 需要 ArrayBuffer 或 Uint8Array');
    }

    function decodeUtf8(bytes) {
        if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(bytes);
        var out = '';
        for (var i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
        return decodeURIComponent(escape(out));
    }

    function findEocd(view) {
        var start = Math.max(0, view.byteLength - 66000);
        for (var i = view.byteLength - 22; i >= start; i--) {
            if (view.getUint32(i, true) === 0x06054b50) return i;
        }
        return -1;
    }

    // ZIP64：条目数 / 中央目录偏移超过 4 GB 时会写 0xFFFF / 0xFFFFFFFF 占位，
    // 真实值放在 EOCD 前面的 locator 指向的 ZIP64 EOCD 里
    function readZip64Eocd(view, eocd) {
        var locator = eocd - 20;
        if (locator < 0 || view.getUint32(locator, true) !== 0x07064b50) return null;
        var offLo = view.getUint32(locator + 8, true);
        var offHi = view.getUint32(locator + 12, true);
        var offset = offHi * 4294967296 + offLo;
        if (offset + 56 > view.byteLength) return null;
        if (view.getUint32(offset, true) !== 0x06064b50) return null;
        var cntLo = view.getUint32(offset + 32, true);
        var cntHi = view.getUint32(offset + 36, true);
        var cdLo = view.getUint32(offset + 48, true);
        var cdHi = view.getUint32(offset + 52, true);
        return {
            count: cntHi * 4294967296 + cntLo,
            cdOffset: cdHi * 4294967296 + cdLo
        };
    }

    // 读中央目录，得到 名字 → {method, compSize, uncompSize, offset}
    function readEntries(bytes) {
        var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        var eocd = findEocd(view);
        if (eocd < 0) throw new Error('xlsx: 不是有效的 ZIP 文件');
        var count = view.getUint16(eocd + 10, true);
        var cursor = view.getUint32(eocd + 16, true);
        if (count === 0xFFFF || cursor === 0xFFFFFFFF) {
            var z64 = readZip64Eocd(view, eocd);
            if (z64) {
                count = z64.count;
                cursor = z64.cdOffset;
            }
        }
        var entries = Object.create(null);

        for (var i = 0; i < count; i++) {
            if (cursor + 46 > view.byteLength || view.getUint32(cursor, true) !== 0x02014b50) break;
            var nameLen = view.getUint16(cursor + 28, true);
            var extraLen = view.getUint16(cursor + 30, true);
            var commentLen = view.getUint16(cursor + 32, true);
            var name = decodeUtf8(bytes.subarray(cursor + 46, cursor + 46 + nameLen));
            var compSize = view.getUint32(cursor + 20, true);
            var uncompSize = view.getUint32(cursor + 24, true);
            var offset = view.getUint32(cursor + 42, true);

            // ZIP64 扩展字段（0x0001）：按「未压缩大小、压缩大小、本地头偏移」
            // 的顺序，只补那些被写成 0xFFFFFFFF 的字段
            if (compSize === 0xFFFFFFFF || uncompSize === 0xFFFFFFFF || offset === 0xFFFFFFFF) {
                var extra = bytes.subarray(cursor + 46 + nameLen, cursor + 46 + nameLen + extraLen);
                for (var e = 0; e + 4 <= extra.length;) {
                    var headerId = extra[e] | (extra[e + 1] << 8);
                    var fieldSize = extra[e + 2] | (extra[e + 3] << 8);
                    if (headerId === 0x0001) {
                        var q = e + 4;
                        var read64 = function () {
                            var lo = (extra[q] | (extra[q + 1] << 8) | (extra[q + 2] << 16) | (extra[q + 3] << 24)) >>> 0;
                            var hi = (extra[q + 4] | (extra[q + 5] << 8) | (extra[q + 6] << 16) | (extra[q + 7] << 24)) >>> 0;
                            q += 8;
                            return hi * 4294967296 + lo;
                        };
                        if (uncompSize === 0xFFFFFFFF) uncompSize = read64();
                        if (compSize === 0xFFFFFFFF) compSize = read64();
                        if (offset === 0xFFFFFFFF) offset = read64();
                        break;
                    }
                    e += 4 + fieldSize;
                }
            }

            entries[name] = {
                method: view.getUint16(cursor + 10, true),
                compSize: compSize,
                uncompSize: uncompSize,
                offset: offset
            };
            cursor += 46 + nameLen + extraLen + commentLen;
        }
        return entries;
    }

    function defaultInflate(bytes) {
        if (typeof DecompressionStream === 'undefined') {
            return Promise.reject(new Error('xlsx: 当前环境不支持解压，请另存为 CSV'));
        }
        var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        return new Response(stream).arrayBuffer().then(function (buf) { return new Uint8Array(buf); });
    }

    function readEntry(bytes, entry, inflateRaw) {
        var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        var p = entry.offset;
        if (view.getUint32(p, true) !== 0x04034b50) throw new Error('xlsx: ZIP 条目损坏');
        var nameLen = view.getUint16(p + 26, true);
        var extraLen = view.getUint16(p + 28, true);
        var start = p + 30 + nameLen + extraLen;
        var data = bytes.subarray(start, start + entry.compSize);
        if (entry.method === 0) return Promise.resolve(data);
        if (entry.method !== 8) return Promise.reject(new Error('xlsx: 不支持的压缩方式 ' + entry.method));
        return Promise.resolve(inflateRaw(data));
    }

    function attr(tag, name) {
        var re = new RegExp('(?:^|\\s)' + name.replace(/[:.]/g, '\\$&') + '\\s*=\\s*"([^"]*)"');
        var m = re.exec(tag);
        return m ? m[1] : '';
    }

    function decodeXml(text) {
        if (text.indexOf('&') === -1) return text;
        return text.replace(/&(?:#x([0-9a-fA-F]+)|#(\d+)|(amp|lt|gt|quot|apos));/g, function (all, hex, dec, name) {
            if (hex) return String.fromCodePoint(parseInt(hex, 16));
            if (dec) return String.fromCodePoint(parseInt(dec, 10));
            if (name === 'amp') return '&';
            if (name === 'lt') return '<';
            if (name === 'gt') return '>';
            if (name === 'quot') return '"';
            return "'";
        });
    }

    function colIndex(ref) {
        var m = /^([A-Z]+)/.exec(ref || '');
        if (!m) return -1;
        var n = 0;
        for (var i = 0; i < m[1].length; i++) n = n * 26 + (m[1].charCodeAt(i) - 64);
        return n - 1;
    }

    // sharedStrings：<si> 里可能是一串富文本 <r><t>，要拼起来
    function parseSharedStrings(xml) {
        var out = [];
        if (!xml) return out;
        var siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
        var tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
        var m;
        while ((m = siRe.exec(xml))) {
            var inner = m[1];
            var text = '';
            var t;
            tRe.lastIndex = 0;
            while ((t = tRe.exec(inner))) text += t[1];
            out.push(decodeXml(text));
        }
        return out;
    }

    // 样式表：哪些单元格样式是日期（否则日期会显示成 45000 这种序列号）
    function parseStyles(xml) {
        if (!xml) return null;
        var custom = Object.create(null);
        var numFmtRe = /<numFmt\b[^>]*>/g;
        var m;
        while ((m = numFmtRe.exec(xml))) {
            var id = parseInt(attr(m[0], 'numFmtId'), 10);
            if (!isNaN(id)) custom[id] = decodeXml(attr(m[0], 'formatCode'));
        }
        var xfs = [];
        var block = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml);
        if (block) {
            var xfRe = /<xf\b[^>]*>/g;
            var xf;
            while ((xf = xfRe.exec(block[1]))) {
                xfs.push(parseInt(attr(xf[0], 'numFmtId'), 10) || 0);
            }
        }
        return { custom: custom, xfs: xfs };
    }

    function isDateStyle(styles, index) {
        if (!styles || index == null || index === '') return false;
        var numFmtId = styles.xfs[+index];
        if (!numFmtId) return false;
        if (BUILTIN_DATE_FORMATS[numFmtId]) return true;
        var code = styles.custom[numFmtId];
        if (!code) return false;
        // 去掉引号里的字面量和 [Red] 这类段落，避免把 "0.00" 误判成日期
        var clean = code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '');
        return /[ymdhs]/i.test(clean);
    }

    function serialToText(serial) {
        var ms = Math.round((serial - 25569) * 86400000);
        var d = new Date(ms);
        if (isNaN(d.getTime())) return String(serial);
        var iso = d.toISOString();
        return serial % 1 === 0 ? iso.slice(0, 10) : iso.slice(0, 19).replace('T', ' ');
    }

    function pickSheet(entries, workbookXml, relsXml) {
        var candidates = Object.keys(entries).filter(function (name) {
            return /^xl\/worksheets\/sheet\d*\.xml$/.test(name);
        });
        candidates.sort(function (a, b) {
            var na = parseInt((/(\d+)\.xml$/.exec(a) || [0, 0])[1], 10);
            var nb = parseInt((/(\d+)\.xml$/.exec(b) || [0, 0])[1], 10);
            return na - nb;
        });

        var sheetName = '';
        if (workbookXml) {
            var tag = /<sheet\b[^>]*>/.exec(workbookXml);
            if (tag) {
                sheetName = decodeXml(attr(tag[0], 'name'));
                var rid = attr(tag[0], 'r:id');
                if (rid && relsXml) {
                    var relRe = new RegExp('<Relationship\\b[^>]*Id\\s*=\\s*"' + rid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"[^>]*>');
                    var rel = relRe.exec(relsXml);
                    if (rel) {
                        var target = attr(rel[0], 'Target');
                        if (target) {
                            var path = target.charAt(0) === '/' ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
                            if (entries[path]) return { path: path, name: sheetName };
                        }
                    }
                }
            }
        }
        if (candidates.length) return { path: candidates[0], name: sheetName };
        return null;
    }

    // 扫一张工作表：返回二维字符串数组（日期已转文本，数字保持原样）
    function parseSheet(xml, ctx) {
        var rows = [];
        var maxRows = ctx.maxRows || 100000;
        var truncated = false;
        var rowRe = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
        var cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
        var vRe = /<v\b[^>]*>([\s\S]*?)<\/v>/;
        var tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
        var m;

        while ((m = rowRe.exec(xml))) {
            var cells = [];
            var inner = m[2] || '';
            cellRe.lastIndex = 0;
            var c;
            while ((c = cellRe.exec(inner))) {
                var attrs = c[1];
                var body = c[2] || '';
                var col = colIndex(attr(attrs, 'r'));
                if (col < 0) col = cells.length;
                var type = attr(attrs, 't');
                var value = '';

                if (type === 'inlineStr') {
                    var t;
                    tRe.lastIndex = 0;
                    while ((t = tRe.exec(body))) value += t[1];
                    value = decodeXml(value);
                } else {
                    var v = vRe.exec(body);
                    var raw = v ? decodeXml(v[1]) : '';
                    if (type === 's') {
                        value = ctx.shared[parseInt(raw, 10)] || '';
                    } else if (type === 'b') {
                        value = raw === '1' ? 'TRUE' : 'FALSE';
                    } else if (type === 'e') {
                        value = raw;
                    } else if (type === 'd') {
                        value = raw;
                    } else if (raw !== '' && isDateStyle(ctx.styles, attr(attrs, 's'))) {
                        var num = parseFloat(raw);
                        value = isNaN(num) ? raw : serialToText(num);
                    } else {
                        value = raw;
                    }
                }

                while (cells.length < col) cells.push('');
                cells[col] = value;
            }

            var hasValue = false;
            for (var i = 0; i < cells.length; i++) {
                if (cells[i] !== '' && cells[i] != null) { hasValue = true; break; }
            }
            if (!hasValue) continue;

            rows.push(cells);
            if (rows.length >= maxRows) {
                // 后面真的还有行才叫截断（正好等于上限时不算）
                truncated = xml.indexOf('</row>', rowRe.lastIndex) !== -1;
                break;
            }
        }

        return { rows: rows, truncated: truncated };
    }

    async function read(input, opts) {
        opts = opts || {};
        var bytes = toBytes(input);
        var inflateRaw = opts.inflateRaw || defaultInflate;
        var entries = readEntries(bytes);
        var maxEntry = opts.maxEntryBytes || MAX_ENTRY_BYTES;

        async function entryText(name) {
            var entry = entries[name];
            if (!entry) return '';
            // 0xFFFFFFFF 是 ZIP64 的占位值，走到这里说明没读到扩展字段，
            // 别把它当成 4 GB 报错，解压后再按真实长度判定
            var known = entry.uncompSize > 0 && entry.uncompSize < 0xFFFFFFFF;
            if (known && entry.uncompSize > maxEntry) {
                throw new Error('xlsx: 工作表过大（解压后 ' + Math.round(entry.uncompSize / 1048576) + ' MB），请拆分后再转换');
            }
            var data = await readEntry(bytes, entry, inflateRaw);
            if (!known && data.length > maxEntry) {
                throw new Error('xlsx: 工作表过大（解压后 ' + Math.round(data.length / 1048576) + ' MB），请拆分后再转换');
            }
            return decodeUtf8(data);
        }

        var workbookXml = await entryText('xl/workbook.xml');
        var relsXml = await entryText('xl/_rels/workbook.xml.rels');
        var sheet = pickSheet(entries, workbookXml, relsXml);
        if (!sheet) throw new Error('xlsx: 没找到工作表，文件可能不是 Excel 2007+ 格式');

        var shared = parseSharedStrings(await entryText('xl/sharedStrings.xml'));
        var styles = parseStyles(await entryText('xl/styles.xml'));
        var sheetXml = await entryText(sheet.path);
        var parsed = parseSheet(sheetXml, { shared: shared, styles: styles, maxRows: opts.maxRows });

        return {
            rows: parsed.rows,
            sheetName: sheet.name || '',
            truncated: parsed.truncated
        };
    }

    return {
        MAX_ENTRY_BYTES: MAX_ENTRY_BYTES,
        read: read,
        parseSheet: parseSheet,
        parseSharedStrings: parseSharedStrings,
        parseStyles: parseStyles,
        isDateStyle: isDateStyle,
        serialToText: serialToText,
        colIndex: colIndex,
        attr: attr
    };
});
