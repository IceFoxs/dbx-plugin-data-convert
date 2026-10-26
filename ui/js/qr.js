/*
 * QR code — pure helpers, no DOM lookups.
 *
 * Two directions, both batched:
 *   encode  one item per line -> { count, dark } module matrix -> SVG string / canvas
 *   decode  (the scanning itself lives in the vendor jsQR build; this file only
 *           owns the geometry + colour + capacity rules around it)
 *
 * Loaded as a classic script (window.DBXQr) and as CommonJS in tests:
 *
 *   splitItems(text, { maxBytes })  whole text -> { items, dropped }
 *   matrixOf(text, ecc, lib)        text -> { count, dark: Uint8Array }   (lib = qrcode factory)
 *   svgMarkup(matrix, opts)          matrix -> "<svg …>" string (crisp, one <path>)
 *   drawToCanvas(canvas, matrix, o)  matrix -> painted canvas
 *   tileLayout(n, opts)              n codes -> one sheet's geometry
 *   fileNameFor(base, ext, fallback) export name -> "base.ext" (sanitised)
 *
 * A QR symbol has four error-correction levels; the byte-mode capacity of
 * version 40 caps how much text one symbol can hold. Both are enforced here so
 * the page can mark a line as too long before handing it to the encoder.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.DBXQr = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var LIMITS = {
        maxItems: 200,          // 一次最多生成多少个
        maxLines: 4000,         // 输入行数上限（含空行），防止把整份大文件塞进来
        size: { min: 128, max: 1024, def: 256 },
        margin: { min: 0, max: 8, def: 2 },
        decodeFiles: 60,        // 一次最多解码多少张图
        decodeBytes: 24 * 1024 * 1024,   // 单张图上限
        decodeSide: 1600,       // 解码前把长边缩到这个尺寸（大图纯属浪费）
        tilePixels: 24 * 1000 * 1000     // 拼图总像素上限（约 24 MP，和图表导出一致）
    };

    // 纠错级别：L 7% / M 15% / Q 25% / H 30%（越高越抗污损，容量越小）
    var ECC = ['L', 'M', 'Q', 'H'];

    // version 40、byte 模式下的容量上限（字节，UTF-8 计）
    var BYTE_CAP = { L: 2953, M: 2331, Q: 1663, H: 1273 };

    var DEF_OPTS = {
        size: LIMITS.size.def,
        margin: LIMITS.margin.def,
        ecc: 'M',
        dark: '#000000',
        light: '#ffffff'
    };

    /** UTF-8 字节数（逐码点，代理对按 4 字节算） */
    function utf8Length(text) {
        var s = String(text == null ? '' : text);
        var bytes = 0;
        for (var i = 0; i < s.length; i++) {
            var c = s.charCodeAt(i);
            if (c < 0x80) bytes += 1;
            else if (c < 0x800) bytes += 2;
            else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
                var next = s.charCodeAt(i + 1);
                if (next >= 0xdc00 && next <= 0xdfff) { bytes += 4; i++; }
                else bytes += 3;
            } else bytes += 3;
        }
        return bytes;
    }

    function eccOf(value) {
        var v = String(value == null ? '' : value).trim().toUpperCase();
        return ECC.indexOf(v) >= 0 ? v : DEF_OPTS.ecc;
    }

    /** 整数夹取：坏值一律回落默认，输入框里打什么都不会把渲染搞崩 */
    function clampInt(value, min, max, def) {
        var n = parseInt(String(value == null ? '' : value).trim(), 10);
        if (!isFinite(n)) return def;
        if (n < min) return min;
        if (n > max) return max;
        return n;
    }

    /** "#abc" / "abc" / "#aabbcc" -> "#aabbcc"；认不出返回 null */
    function normalizeColor(value) {
        var s = String(value == null ? '' : value).trim();
        if (!s) return null;
        if (s.charAt(0) !== '#') s = '#' + s;
        if (/^#[0-9a-fA-F]{3}$/.test(s)) {
            s = '#' + s.charAt(1) + s.charAt(1) + s.charAt(2) + s.charAt(2) + s.charAt(3) + s.charAt(3);
        }
        if (!/^#[0-9a-fA-F]{6}$/.test(s)) return null;
        return s.toLowerCase();
    }

    function rgbOf(hex) {
        var c = normalizeColor(hex);
        if (!c) return null;
        return {
            r: parseInt(c.slice(1, 3), 16),
            g: parseInt(c.slice(3, 5), 16),
            b: parseInt(c.slice(5, 7), 16)
        };
    }

    /** 相对亮度（WCAG），0 = 全黑，1 = 全白 */
    function luminance(hex) {
        var rgb = rgbOf(hex);
        if (!rgb) return 0;
        var ch = [rgb.r, rgb.g, rgb.b].map(function (v) {
            var s = v / 255;
            return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
    }

    /** 前景 / 背景对比度，低于 3 差不多就扫不出了（反转成亮码暗底还算能用，会提示） */
    function contrast(a, b) {
        var la = luminance(a);
        var lb = luminance(b);
        var hi = Math.max(la, lb);
        var lo = Math.min(la, lb);
        return (hi + 0.05) / (lo + 0.05);
    }

    /**
     * 批量输入 -> 待生成条目。每行一条，空行跳过（不计入丢弃数），
     * 超容量 / 超条数的各自计数，页面据此提示「跳过了几行」。
     */
    function splitItems(source, opt) {
        opt = opt || {};
        var maxItems = opt.maxItems || LIMITS.maxItems;
        var maxLines = opt.maxLines || LIMITS.maxLines;
        var maxBytes = opt.maxBytes || BYTE_CAP[eccOf(opt.ecc)];
        var raw = String(source == null ? '' : source).split(/\r?\n/);
        var items = [];
        var dropped = { tooLong: 0, overflow: 0 };

        if (raw.length > maxLines) raw = raw.slice(0, maxLines);

        for (var i = 0; i < raw.length; i++) {
            var line = raw[i].replace(/^\uFEFF/, '').trim();
            if (!line) continue;
            if (utf8Length(line) > maxBytes) { dropped.tooLong++; continue; }
            if (items.length >= maxItems) { dropped.overflow++; continue; }
            items.push({ line: i + 1, text: line, bytes: utf8Length(line) });
        }
        return { items: items, dropped: dropped };
    }

    /**
     * 整段一个码：不做行拆分，换行原样进二维码（名片、地址、多行说明都靠这个）。
     * 只去掉首尾空行——中间的空行是内容的一部分。
     */
    function splitWhole(source, opt) {
        opt = opt || {};
        var maxBytes = opt.maxBytes || BYTE_CAP[eccOf(opt.ecc)];
        var text = String(source == null ? '' : source)
            .replace(/\r\n?/g, '\n')
            .replace(/^\n+|\n+$/g, '');
        // 全是空白跟空内容一样，别生成一张空码
        if (!text.trim()) return { items: [], dropped: { tooLong: 0, overflow: 0 } };
        var bytes = utf8Length(text);
        if (bytes > maxBytes) return { items: [], dropped: { tooLong: 1, overflow: 0 } };
        return { items: [{ line: 1, text: text, bytes: bytes }], dropped: { tooLong: 0, overflow: 0 } };
    }

    /** 文本 -> 模块矩阵（1 = 深色）。lib 传 qrcode 工厂，测试里也走真库 */
    function matrixOf(text, ecc, lib) {
        var factory = lib || (typeof qrcode === 'function' ? qrcode : null);
        if (!factory) {
            var err = new Error('qrcode-missing');
            err.code = 'qrcode-missing';
            throw err;
        }
        // 这个库默认按 latin-1 取字节（charCodeAt & 0xff），一个汉字被压成一个
        // 字节，扫出来必然是乱码。库自带 UTF-8 转换，进来就切过去。
        if (factory.stringToBytesFuncs && factory.stringToBytesFuncs['UTF-8']) {
            factory.stringToBytes = factory.stringToBytesFuncs['UTF-8'];
        }
        var qr = factory(0, eccOf(ecc));
        qr.addData(String(text == null ? '' : text));
        try {
            qr.make();
        } catch (e) {
            var tooLong = new Error('too-long');
            tooLong.code = 'too-long';
            throw tooLong;
        }
        var count = qr.getModuleCount();
        var dark = new Uint8Array(count * count);
        for (var r = 0; r < count; r++) {
            for (var c = 0; c < count; c++) {
                dark[r * count + c] = qr.isDark(r, c) ? 1 : 0;
            }
        }
        return { count: count, dark: dark };
    }

    /** 圆角矩形路径（ctx.roundRect 还不是哪儿都有） */
    function roundRectPath(ctx, x, y, w, h, r) {
        var radius = Math.max(0, Math.min(r, Math.min(w, h) / 2));
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + w - radius, y);
        ctx.arcTo(x + w, y, x + w, y + radius, radius);
        ctx.lineTo(x + w, y + h - radius);
        ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
        ctx.lineTo(x + radius, y + h);
        ctx.arcTo(x, y + h, x, y + h - radius, radius);
        ctx.lineTo(x, y + radius);
        ctx.arcTo(x, y, x + radius, y, radius);
        ctx.closePath();
    }

    /** 中心图标占码面的比例（盖太多就扫不出来了，0.12 - 0.3） */
    function iconRatioOf(value) {
        var n = parseFloat(value);
        if (!isFinite(n)) return 0.22;
        if (n < 0.12) return 0.12;
        if (n > 0.3) return 0.3;
        return n;
    }

    /**
     * 矩阵 -> 一条 path 的 SVG。每行把连续的深色模块并成一段水平线，
     * 比一个模块一个 <rect> 小一个数量级，批量出图时 DOM 也不至于炸掉。
     */
    function svgMarkup(matrix, opt) {
        opt = opt || {};
        var margin = clampInt(opt.margin, LIMITS.margin.min, LIMITS.margin.max, DEF_OPTS.margin);
        var size = clampInt(opt.size, LIMITS.size.min, LIMITS.size.max, DEF_OPTS.size);
        var dark = normalizeColor(opt.dark) || DEF_OPTS.dark;
        var light = normalizeColor(opt.light) || DEF_OPTS.light;
        var n = matrix.count;
        var total = n + margin * 2;
        var d = '';
        for (var r = 0; r < n; r++) {
            var c = 0;
            while (c < n) {
                if (!matrix.dark[r * n + c]) { c++; continue; }
                var start = c;
                while (c < n && matrix.dark[r * n + c]) c++;
                d += 'M' + (start + margin) + ' ' + (r + margin) + 'h' + (c - start) + 'v1h-' + (c - start) + 'z';
            }
        }
        var icon = '';
        var href = opt.iconHref ? String(opt.iconHref) : '';
        if (href && /^data:image\//i.test(href)) {
            var box = total * iconRatioOf(opt.iconRatio);
            var pad = Math.max(0.6, box * 0.14);
            var at = (total - box) / 2;
            icon = '<rect x="' + (at - pad).toFixed(3) + '" y="' + (at - pad).toFixed(3) +
                '" width="' + (box + pad * 2).toFixed(3) + '" height="' + (box + pad * 2).toFixed(3) +
                '" rx="' + (box * 0.18).toFixed(3) + '" fill="' + light + '"/>' +
                '<image x="' + at.toFixed(3) + '" y="' + at.toFixed(3) +
                '" width="' + box.toFixed(3) + '" height="' + box.toFixed(3) +
                '" preserveAspectRatio="xMidYMid meet" href="' + href.replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '"/>';
        }
        return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size +
            '" viewBox="0 0 ' + total + ' ' + total + '" shape-rendering="crispEdges">' +
            '<rect width="' + total + '" height="' + total + '" fill="' + light + '"/>' +
            (d ? '<path fill="' + dark + '" d="' + d + '"/>' : '') +
            icon +
            '</svg>';
    }

    /**
     * 直接画到 canvas（导出 / 拼图用）：模块边界按像素取整，
     * 避免小尺寸下一条条缝里透出背景色。
     */
    function drawToCanvas(canvas, matrix, opt) {
        opt = opt || {};
        var margin = clampInt(opt.margin, LIMITS.margin.min, LIMITS.margin.max, DEF_OPTS.margin);
        var size = clampInt(opt.size, LIMITS.size.min, LIMITS.size.max, DEF_OPTS.size);
        var scale = opt.scale && opt.scale > 0 ? opt.scale : 1;
        var dark = normalizeColor(opt.dark) || DEF_OPTS.dark;
        var light = normalizeColor(opt.light) || DEF_OPTS.light;
        var n = matrix.count;
        var total = n + margin * 2;
        var px = Math.round(size * scale);

        canvas.width = px;
        canvas.height = px;
        var ctx = canvas.getContext('2d');
        if (!ctx) return false;

        ctx.fillStyle = light;
        ctx.fillRect(0, 0, px, px);
        ctx.fillStyle = dark;
        var cell = px / total;
        for (var r = 0; r < n; r++) {
            var y0 = Math.round((r + margin) * cell);
            var y1 = Math.round((r + margin + 1) * cell);
            var c = 0;
            while (c < n) {
                if (!matrix.dark[r * n + c]) { c++; continue; }
                var start = c;
                while (c < n && matrix.dark[r * n + c]) c++;
                var x0 = Math.round((start + margin) * cell);
                var x1 = Math.round((c + margin) * cell);
                ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
            }
        }
        // 中心图标：先垫一块白底再按 contain 贴图，四周留一点呼吸位，
        // 免得图标和码点缝在一起（真实扫的时候中心最容易糊）
        var icon = opt.icon;
        if (icon) {
            // 部分 SVG / 畸形图拿不到内在尺寸（naturalWidth 为 0），
            // 这时按正方形兜底，别整块图标被静默跳过
            var iw0 = icon.naturalWidth || icon.width || 0;
            var ih0 = icon.naturalHeight || icon.height || 0;
            if (!iw0 || !ih0) { iw0 = iw0 || 1; ih0 = ih0 || 1; }
            var box = Math.round(px * iconRatioOf(opt.iconRatio));
            var pad = Math.max(2, Math.round(cell * 1.2));
            var bx = Math.round((px - box) / 2);
            ctx.fillStyle = light;
            roundRectPath(ctx, bx - pad, bx - pad, box + pad * 2, box + pad * 2, Math.round(box * 0.18));
            ctx.fill();
            var fitIcon = Math.min(box / iw0, box / ih0);
            var iw = Math.max(1, Math.round(iw0 * fitIcon));
            var ih = Math.max(1, Math.round(ih0 * fitIcon));
            try {
                ctx.drawImage(icon, bx + Math.round((box - iw) / 2), bx + Math.round((box - ih) / 2), iw, ih);
            } catch (e) { /* 图标还没解码完就先只留白底，别把整张码拖挂 */ }
        }
        return true;
    }

    /**
     * 批量拼图：挑一个接近正方形的列数，总像素超上限就把码本体缩小
     * （边距 / 标签不缩，保证一眼能分辨）。
     */
    function tileLayout(count, opt) {
        opt = opt || {};
        var n = Math.max(1, Math.round(count) || 1);
        var pad = opt.pad == null ? 24 : opt.pad;
        var labelH = opt.labelH == null ? 0 : opt.labelH;
        var maxCols = Math.max(1, opt.maxCols || 4);
        var maxPixels = opt.maxPixels || LIMITS.tilePixels;
        var size = clampInt(opt.size, LIMITS.size.min, LIMITS.size.max, DEF_OPTS.size);
        var cols = Math.min(maxCols, Math.max(1, Math.ceil(Math.sqrt(n))));
        var rows = Math.ceil(n / cols);

        function frame(s) {
            return {
                width: cols * s + (cols + 1) * pad,
                height: rows * (s + labelH) + (rows + 1) * pad
            };
        }
        var f = frame(size);
        var guard = 0;
        while (f.width * f.height > maxPixels && size > 64 && guard < 40) {
            size = Math.max(64, Math.floor(size * 0.9));
            f = frame(size);
            guard++;
        }
        return {
            cols: cols,
            rows: rows,
            size: size,
            pad: pad,
            labelH: labelH,
            width: f.width,
            height: f.height
        };
    }

    /**
     * 文件名净化：用户会在导出面板里自己改名，名字最终进的是宿主保存框。
     * 路径分隔符和 Windows 保留字符一律剔掉（带进去轻则存不下来，重则存到别处）；
     * 结尾的空格和点要被系统吞掉，一并去掉；太长也截断，免得超文件系统上限。
     */
    function safeFileName(base, fallback) {
        var name = String(base == null ? '' : base)
            .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
            .replace(/^[\s.]+/, '')
            .replace(/[\s.]+$/, '');
        name = name.slice(0, 64);
        return name || String(fallback || 'qr');
    }

    /** 拼出「名字.扩展名」；用户自己把后缀打进去了就别叠成 qr-01.png.png */
    function fileNameFor(base, ext, fallback) {
        var e = String(ext || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
        var name = safeFileName(base, fallback);
        if (name.length > e.length + 1 && name.slice(-(e.length + 1)).toLowerCase() === '.' + e) {
            name = safeFileName(name.slice(0, -(e.length + 1)), fallback);
        }
        // 只打了个「.png」时净化完只剩下后缀本身，这时用兜底名
        if (name.toLowerCase() === e) name = safeFileName(fallback, 'qr');
        return name + '.' + e;
    }

    /** 解码前的缩放尺寸：只缩不放，长边不超过 maxSide */
    function fitDecodeSide(width, height, maxSide) {
        var w = Math.max(1, Math.round(width) || 1);
        var h = Math.max(1, Math.round(height) || 1);
        var max = maxSide || LIMITS.decodeSide;
        var longest = Math.max(w, h);
        if (longest <= max) return { width: w, height: h, scale: 1 };
        var scale = max / longest;
        return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)), scale: scale };
    }

    return {
        LIMITS: LIMITS,
        ECC: ECC,
        BYTE_CAP: BYTE_CAP,
        DEF_OPTS: DEF_OPTS,
        utf8Length: utf8Length,
        eccOf: eccOf,
        clampInt: clampInt,
        normalizeColor: normalizeColor,
        rgbOf: rgbOf,
        luminance: luminance,
        contrast: contrast,
        splitItems: splitItems,
        splitWhole: splitWhole,
        matrixOf: matrixOf,
        svgMarkup: svgMarkup,
        drawToCanvas: drawToCanvas,
        tileLayout: tileLayout,
        safeFileName: safeFileName,
        fileNameFor: fileNameFor,
        fitDecodeSide: fitDecodeSide
    };
});
