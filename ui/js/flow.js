/*
 * Workflow helpers — pure functions, no DOM dependency.
 *
 * Four things that make the plugin behave like a workbench tool instead of a
 * web page, all decided here so they can be unit tested without a browser:
 *
 *   routeFile()    dropped filename  -> which page should open, with which format
 *   mergeFiles()   many parsed files -> one JSON object keyed by file name
 *   recentPush()   the "recent" list -> capped, de-duplicated, size bounded
 *   pickHostText() host context blob -> the selected text inside it
 *   classifyText() a selection       -> json / ddl / sql / text
 *
 * Nothing here touches storage, the DOM or the network; the UI layer decides
 * where the result goes. Loaded as a classic script (window.DBXFlow) and as
 * CommonJS in tests.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.DBXFlow = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var LIMITS = {
        batchFiles: 10,          // 一次最多几个文件
        recent: 10,              // 最近使用最多几条
        recentText: 16 * 1024,   // 单条最多存多少字符，超了只留预览
        recentTotal: 256 * 1024, // 整张列表的文本预算
        hostText: 2 * 1024 * 1024
    };

    var IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'ico', 'avif', 'heic', 'heif', 'svg'];
    var SHEET_EXT = ['xlsx', 'xlsm', 'xls', 'csv', 'tsv', 'txt'];
    // 这些扩展名进「格式转换」页，值就是源格式 id（空串表示让 UI 按内容嗅探）
    var TEXT_EXT = {
        json: 'json', yaml: 'yaml', yml: 'yaml', xml: 'xml',
        toml: 'toml', ini: 'ini', properties: 'properties', env: 'env',
        log: '', md: ''
    };

    function extOf(name) {
        var m = /\.([^.\\/]+)$/.exec(String(name || ''));
        return m ? m[1].toLowerCase() : '';
    }

    function baseName(name) {
        var s = String(name || '');
        var i = s.lastIndexOf('.');
        return i > 0 ? s.slice(0, i) : s;
    }

    /**
     * 一个文件名 → 该去哪一页。
     * kind: 'image' | 'sheet' | 'text' | 'none'
     */
    function routeFile(name) {
        var ext = extOf(name);
        if (!ext) return { kind: 'none', ext: '', format: '' };
        if (IMAGE_EXT.indexOf(ext) >= 0) return { kind: 'image', ext: ext, format: '' };
        // .xls 也送到表格页：那里会明确提示「另存为 xlsx / csv」
        if (SHEET_EXT.indexOf(ext) >= 0) {
            return { kind: 'sheet', ext: ext, format: ext === 'txt' ? 'csv' : ext };
        }
        if (Object.prototype.hasOwnProperty.call(TEXT_EXT, ext)) {
            return { kind: 'text', ext: ext, format: TEXT_EXT[ext] };
        }
        // 其余（.zip / .exe / .png 之外的二进制……）一律不收，免得把乱码塞进编辑器
        return { kind: 'none', ext: ext, format: '' };
    }

    /**
     * 一批文件里如果有多个，主页面由「最具体的那个」决定：
     * 全是图片 → image，全是表格 → sheet，其余 → text（文本页最宽容）。
     */
    function routeBatch(names) {
        var kinds = {};
        var list = (names || []).map(routeFile);
        list.forEach(function (r) { kinds[r.kind] = (kinds[r.kind] || 0) + 1; });
        if (!list.length) return { kind: 'none', count: 0, items: list };
        var kind = 'none';
        if (kinds.image && !kinds.sheet && !kinds.text) kind = 'image';
        else if (kinds.sheet && !kinds.image && !kinds.text) kind = 'sheet';
        else if (kinds.text && !kinds.image && !kinds.sheet) kind = 'text';
        // 混合批次：文本最宽容，其次表格；一个都认不出时必须是 none，不能兜底成 image
        else kind = kinds.text ? 'text' : (kinds.sheet ? 'sheet' : (kinds.image ? 'image' : 'none'));
        return { kind: kind, count: list.length, items: list, mixed: Object.keys(kinds).length > 1 };
    }

    /**
     * 多文件 → 一个对象，键是文件名（重名自动加 (2)，扩展名不丢）。
     * 输入 [{ name, records }]，输出 { ok, keys:[{key,name,count}], data, dropped }
     */
    function mergeFiles(entries, opts) {
        var max = (opts && opts.maxFiles) || LIMITS.batchFiles;
        var list = entries || [];
        var data = {};
        var keys = [];
        var dropped = [];
        var used = {};

        for (var i = 0; i < list.length; i++) {
            var item = list[i] || {};
            var name = String(item.name || ('file' + (i + 1)));
            if (keys.length >= max) { dropped.push(name); continue; }
            if (item.error) { dropped.push(name); continue; }

            var key = name;
            if (used[key]) {
                var base = baseName(name);
                var ext = extOf(name);
                var n = 2;
                do {
                    key = base + ' (' + n + ')' + (ext ? '.' + ext : '');
                    n++;
                } while (used[key]);
            }
            used[key] = true;
            data[key] = item.records || [];
            keys.push({ key: key, name: name, count: (item.records || []).length });
        }
        return { ok: keys.length > 0, keys: keys, data: data, dropped: dropped };
    }

    /** 稳定的字符串散列，用来给「最近使用」去重（不需要密码学强度） */
    function hashText(text) {
        var h = 5381;
        var s = String(text || '');
        for (var i = 0; i < s.length; i++) {
            h = ((h << 5) + h + s.charCodeAt(i)) | 0;
        }
        return (h >>> 0).toString(36);
    }

    function clip(text, max) {
        var s = String(text || '');
        var limit = max || LIMITS.recentText;
        return s.length <= limit ? s : s.slice(0, limit);
    }

    /**
     * 往「最近使用」里塞一条。同格式对 + 同内容只留最新的一条；
     * 条数超上限丢最旧的；文本总量超预算时把旧的正文降级成预览（key 还在）。
     *
     * entry: { src, tgt, text, ts? }
     */
    function recentPush(list, entry, opts) {
        var max = (opts && opts.maxItems) || LIMITS.recent;
        var maxText = (opts && opts.maxText) || LIMITS.recentText;
        var budget = (opts && opts.maxTotal) || LIMITS.recentTotal;
        var src = String(entry.src || '');
        var tgt = String(entry.tgt || '');
        var text = String(entry.text || '');
        if (!text) return (list || []).slice();

        var hash = hashText(text);
        var next = [{ src: src, tgt: tgt, hash: hash, size: text.length, text: clip(text, maxText), ts: entry.ts || 0 }];
        (list || []).forEach(function (item) {
            if (!item) return;
            if (item.src === src && item.tgt === tgt && item.hash === hash) return;
            next.push(item);
        });
        if (next.length > max) next = next.slice(0, max);

        // 文本预算：从最旧的一端开始把正文丢掉，只留元信息
        var total = 0;
        for (var i = 0; i < next.length; i++) {
            var body = next[i].text || '';
            total += body.length;
            if (total > budget) {
                next[i] = { src: next[i].src, tgt: next[i].tgt, hash: next[i].hash, size: next[i].size, text: '', ts: next[i].ts };
            }
        }
        return next;
    }

    /**
     * 宿主 context 的形状没有文档保证：可能直接把选中的文本放在 context.selection，
     * 也可能是 context.selection.text、context.editor.selectedText……
     * 这里按「越像正文越优先」的顺序挖三层，找不到就返回 null。
     */
    var HOST_KEYS = ['selectedText', 'selection', 'selected', 'text', 'content', 'value', 'sql', 'code', 'input', 'payload'];

    function pickHostText(ctx) {
        if (!ctx || typeof ctx !== 'object') {
            if (typeof ctx === 'string') return wrapHost(ctx, '$');
            return null;
        }
        var queue = [{ node: ctx, path: '$' }];
        var seen = 0;
        while (queue.length && seen++ < 40) {
            var cur = queue.shift();
            var node = cur.node;
            if (typeof node === 'string') {
                if (node.trim()) return wrapHost(node, cur.path);
                continue;
            }
            if (!node || typeof node !== 'object') continue;
            for (var i = 0; i < HOST_KEYS.length; i++) {
                var key = HOST_KEYS[i];
                if (!Object.prototype.hasOwnProperty.call(node, key)) continue;
                var val = node[key];
                if (typeof val === 'string') {
                    if (val.trim()) return wrapHost(val, cur.path + '.' + key);
                } else if (val && typeof val === 'object') {
                    queue.push({ node: val, path: cur.path + '.' + key });
                }
            }
            // 已知键里没有：把剩下的对象也排进队列（context.editor.selectedText 这种，
            // 外层键名不在词表里），靠 seen 计数兜住广度，不怕宿主塞一大坨。
            for (var k in node) {
                if (!Object.prototype.hasOwnProperty.call(node, k)) continue;
                if (HOST_KEYS.indexOf(k) >= 0) continue;
                var child = node[k];
                if (child && typeof child === 'object') queue.push({ node: child, path: cur.path + '.' + k });
            }
        }
        return null;
    }

    function wrapHost(text, path) {
        var s = String(text);
        var clipped = s.length > LIMITS.hostText;
        return { text: clipped ? s.slice(0, LIMITS.hostText) : s, path: path, size: s.length, clipped: clipped };
    }

    /** 选区内容是什么：json / ddl / sql / text（只做形态判断，不解析） */
    function classifyText(text) {
        var s = String(text || '').trim();
        if (!s) return 'text';
        if (/^[[{]/.test(s)) {
            try {
                JSON.parse(s);
                return 'json';
            } catch (err) { /* 不是完整 JSON，继续看别的 */ }
        }
        if (/\bcreate\s+(temporary\s+)?table\b/i.test(s)) return 'ddl';
        if (/^(select|with|insert|update|delete|replace)\b/i.test(s)) return 'sql';
        if (/\bselect\b[\s\S]*\bfrom\b/i.test(s) && s.indexOf('\n') < 0) return 'sql';
        return 'text';
    }

    /** 文本 → 建议的源格式（格式转换页用），认不出就给 json 让解析器报错 */
    function guessFormat(text) {
        var s = String(text || '').trim();
        if (!s) return 'json';
        // 先真解析一次再判 JSON：TOML 的 [table] 也以 [ 开头，只按首字符判会判错
        if (/^[[{]/.test(s)) {
            try {
                JSON.parse(s);
                return 'json';
            } catch (err) { /* 不是 JSON，继续往下判 */ }
        }
        if (/^\s*<\?xml|^\s*<[a-z][\w:-]*(\s|>)/i.test(s)) return 'xml';
        if (/^\s*\[[^\]]+\]\s*$/m.test(s) && /=/.test(s)) return 'toml';
        // 键值文本：行首是 key=value 还是 key: value，决定 properties / YAML
        if (/^[A-Za-z_][\w.]*\s*[:=]/m.test(s) && s.indexOf('\n') >= 0) {
            var hasEq = /^[A-Za-z_][\w.]*\s*=/m.test(s);
            var hasColon = /^[A-Za-z_][\w.]*\s*:/m.test(s);
            if (hasEq && !hasColon) return 'properties';
            return 'yaml';
        }
        return 'json';
    }

    /** 合并后的导出文件名：三份以上用 batch-N，否则用第一份的名字 */
    function batchFileName(keys) {
        var list = keys || [];
        if (!list.length) return 'batch.json';
        if (list.length === 1) return baseName(list[0].name) + '.json';
        return 'batch-' + list.length + '.json';
    }

    return {
        LIMITS: LIMITS,
        extOf: extOf,
        baseName: baseName,
        routeFile: routeFile,
        routeBatch: routeBatch,
        mergeFiles: mergeFiles,
        hashText: hashText,
        recentPush: recentPush,
        pickHostText: pickHostText,
        classifyText: classifyText,
        guessFormat: guessFormat,
        batchFileName: batchFileName
    };
});
