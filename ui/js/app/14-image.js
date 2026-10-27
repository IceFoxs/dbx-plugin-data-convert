/* 14-image.js — 图片 ↔ Base64 页 */
// 10. 图片 ↔ Base64 页
// =========================================
// 文案放独立小表，和 SQL / SHEET 两页一个套路，免得把 14 套大字典再撑一圈
const IMG_I18N = {
    'zh-CN': {
        navImage: '图片 Base64',
        imgModeEncode: '图片转 Base64',
        imgModeDecode: 'Base64 转图片',
        imgInputTitle: '上传或粘贴图片',
        imgInputTitleB64: 'Base64 数据',
        imgResultTitle: '转换结果',
        imgPreviewTitle: '预览结果',
        imgPick: '选择图片',
        imgDropTitle: '把图片拖到这里',
        imgDropHint: '也可以 Ctrl / Cmd + V 直接粘贴截图',
        imgFormatLabel: '输出格式',
        imgFmtRaw: '纯 Base64',
        imgKindRaw: '裸 Base64',
        imgKindDataUri: 'DataURI',
        imgKindSvg: 'SVG 源码',
        imgSample: '示例图片',
        imgLimitHint: '单张 ≤ 10 MB · Base64 体积约 +33%',
        imgLimitHintDecode: '支持 DataURI / 裸 Base64 / 文本文件 · 最大 14 M 字符',
        imgImport: '导入文件',
        imgImportTip: '支持 .txt / .b64 / .json，也可以直接拖进来',
        imgImportTooLarge: '文件 {size}，超过 {max} 上限',
        imgImportNotText: '这不是文本文件，读不出 Base64',
        imgImportEmpty: '这个文件里没有内容',
        imgImportFailed: '读取文件失败，换一个试试',
        imgImported: '已导入 {name} · {size}',
        imgImportUntitled: '未命名文件',
        imgDropTextInstead: '这是文本文件，请切到「Base64 转图片」页导入',
        imgImportImageInstead: '这是一张图片，请切到「图片转 Base64」页导入',
        imgPlaceholderDecode: '在这里粘贴 DataURI 或 Base64…',
        imgExport: '导出',
        imgTipIdle: '还没有图片',
        imgTipIdleDecode: '贴一段 Base64，右边会显示图片',
        imgTipReady: '已转换',
        imgTipDecoded: '已识别',
        imgTipTooBig: '图片 {size}，超过 {max} 上限',
        imgTipTooLong: 'Base64 文本太长，最多 14 MB（约 10 MB 图片）',
        imgTipNotImage: '这不是图片文件',
        imgTipNotImageData: '解析出的不是图片（{mime}），仍可导出',
        imgTipPastedB64: '识别到 Base64，已切到解码',
        imgTipBadInput: '识别不出 Base64，检查一下是不是漏了前缀',
        imgTipHeight: '浏览器无法预览该格式，仍然可以复制 / 导出',
        imgTipTruncated: '预览已截断，完整内容请导出文件查看',
        imgTipCopyTruncated: '预览已截断，完整数据请点「导出」保存文件后查看',
        imgTipCopied: '已复制到剪贴板',
        imgTipCopyTooBig: '内容太大（{size}），建议直接导出',
        imgTipExported: '已导出',
        imgTipCancelled: '已取消导出',
        imgTipExportFail: '导出失败：{e}',
        imgTipEmpty: '还没有可导出的内容',
        imgEncoding: '正在转换 {n}%',
        imgMetaOriginal: '原始 {size}',
        imgMetaImage: '图片 {size}',
        imgMetaData: '数据 {size}',
        imgNoPreviewTitle: '无法预览',
        imgMetaB64: 'Base64 {n} 字符',
        imgMetaWarn: '（+{n}）',
        imgMetaType: '{mime}',
        imgMetaNoDims: '尺寸未知',
        imgSampleUnsupported: '当前环境不支持生成示例图',
        imgLightboxTip: '点一下看大图',
        imgLightboxHint: '滚轮缩放 · 双击切 1:1 · Esc 关闭',
        imgLightboxClose: '关闭',
        imgLightboxActual: '原尺寸 1:1'
    },
    'zh-TW': {
        navImage: '圖片 Base64',
        imgModeEncode: '圖片轉 Base64',
        imgModeDecode: 'Base64 轉圖片',
        imgInputTitle: '上傳或貼上圖片',
        imgInputTitleB64: 'Base64 資料',
        imgResultTitle: '轉換結果',
        imgPreviewTitle: '預覽結果',
        imgPick: '選擇圖片',
        imgDropTitle: '把圖片拖到這裡',
        imgDropHint: '也可以 Ctrl / Cmd + V 直接貼上截圖',
        imgFormatLabel: '輸出格式',
        imgFmtRaw: '純 Base64',
        imgKindRaw: '純 Base64',
        imgKindDataUri: 'DataURI',
        imgKindSvg: 'SVG 原始碼',
        imgSample: '範例圖片',
        imgLimitHint: '單張 ≤ 10 MB · Base64 體積約 +33%',
        imgLimitHintDecode: '支援 DataURI / 純 Base64 / 文字檔 · 最大 14 M 字元',
        imgImport: '匯入檔案',
        imgImportTip: '支援 .txt / .b64 / .json，也可以直接拖進來',
        imgImportTooLarge: '檔案 {size}，超過 {max} 上限',
        imgImportNotText: '這不是文字檔，讀不出 Base64',
        imgImportEmpty: '這個檔案裡沒有內容',
        imgImportFailed: '讀取檔案失敗，換一個試試',
        imgImported: '已匯入 {name} · {size}',
        imgImportUntitled: '未命名檔案',
        imgDropTextInstead: '這是文字檔，請切到「Base64 轉圖片」頁匯入',
        imgImportImageInstead: '這是一張圖片，請切到「圖片轉 Base64」頁匯入',
        imgPlaceholderDecode: '在這裡貼上 DataURI 或 Base64…',
        imgExport: '匯出',
        imgTipIdle: '還沒有圖片',
        imgTipIdleDecode: '貼上一段 Base64，右邊會顯示圖片',
        imgTipReady: '已轉換',
        imgTipDecoded: '已識別',
        imgTipTooBig: '圖片 {size}，超過 {max} 上限',
        imgTipTooLong: 'Base64 文字太長，最多 14 MB（約 10 MB 圖片）',
        imgTipNotImage: '這不是圖片檔',
        imgTipNotImageData: '解析出來的不是圖片（{mime}），仍可匯出',
        imgTipPastedB64: '識別到 Base64，已切到解碼',
        imgTipBadInput: '認不出 Base64，檢查一下是不是漏了前綴',
        imgTipHeight: '瀏覽器無法預覽此格式，仍可複製 / 匯出',
        imgTipTruncated: '預覽已截斷，完整內容請匯出檔案查看',
        imgTipCopyTruncated: '預覽已截斷，完整資料請點「匯出」存成檔案後查看',
        imgTipCopied: '已複製到剪貼簿',
        imgTipCopyTooBig: '內容太大（{size}），建議直接匯出',
        imgTipExported: '已匯出',
        imgTipCancelled: '已取消匯出',
        imgTipExportFail: '匯出失敗：{e}',
        imgTipEmpty: '還沒有可匯出的內容',
        imgEncoding: '正在轉換 {n}%',
        imgMetaOriginal: '原始 {size}',
        imgMetaImage: '圖片 {size}',
        imgMetaData: '資料 {size}',
        imgNoPreviewTitle: '無法預覽',
        imgMetaB64: 'Base64 {n} 字元',
        imgMetaWarn: '（+{n}）',
        imgMetaType: '{mime}',
        imgMetaNoDims: '尺寸未知',
        imgSampleUnsupported: '目前環境不支援產生範例圖',
        imgLightboxTip: '點一下看大圖',
        imgLightboxHint: '滾輪縮放 · 雙擊切 1:1 · Esc 關閉',
        imgLightboxClose: '關閉',
        imgLightboxActual: '原尺寸 1:1'
    },
    en: {
        navImage: 'Image Base64',
        imgModeEncode: 'Image to Base64',
        imgModeDecode: 'Base64 to Image',
        imgInputTitle: 'Drop or paste an image',
        imgInputTitleB64: 'Base64 data',
        imgResultTitle: 'Result',
        imgPreviewTitle: 'Preview',
        imgPick: 'Choose image',
        imgDropTitle: 'Drop an image here',
        imgDropHint: 'Ctrl / Cmd + V also pastes a screenshot',
        imgFormatLabel: 'Output',
        imgFmtRaw: 'Raw Base64',
        imgKindRaw: 'raw Base64',
        imgKindDataUri: 'DataURI',
        imgKindSvg: 'SVG source',
        imgSample: 'Sample',
        imgLimitHint: 'Up to 10 MB · Base64 is ~33% larger',
        imgLimitHintDecode: 'DataURI, raw Base64 or a text file · up to 14 M chars',
        imgImport: 'Import file',
        imgImportTip: '.txt, .b64 or .json — or just drop it here',
        imgImportTooLarge: 'File is {size}, over the {max} limit',
        imgImportNotText: 'Not a text file, no Base64 to read',
        imgImportEmpty: 'This file is empty',
        imgImportFailed: 'Could not read the file, try another one',
        imgImported: 'Imported {name} · {size}',
        imgImportUntitled: 'Untitled file',
        imgDropTextInstead: 'That is a text file — import it on the Base64 to Image page',
        imgImportImageInstead: 'That is an image — import it on the Image to Base64 page',
        imgPlaceholderDecode: 'Paste a DataURI or Base64 string…',
        imgExport: 'Export',
        imgTipIdle: 'No image yet',
        imgTipIdleDecode: 'Paste some Base64 and the image shows up on the right',
        imgTipReady: 'Converted',
        imgTipDecoded: 'Detected',
        imgTipTooBig: 'Image is {size}, over the {max} limit',
        imgTipTooLong: 'That Base64 text is too long — 14 MB max (about a 10 MB image)',
        imgTipNotImage: 'That is not an image file',
        imgTipNotImageData: 'Decoded bytes are not an image ({mime}), but export still works',
        imgTipPastedB64: 'Found Base64 on the clipboard — switched to decode',
        imgTipBadInput: 'Could not read that as Base64',
        imgTipHeight: 'The browser cannot preview this format, but copy / export still work',
        imgTipTruncated: 'Preview truncated — export the file for the full text',
        imgTipCopyTruncated: 'Preview is truncated — export the file to get the full data',
        imgTipCopied: 'Copied',
        imgTipCopyTooBig: 'Too large to copy ({size}), export it instead',
        imgTipExported: 'Exported',
        imgTipCancelled: 'Export cancelled',
        imgTipExportFail: 'Export failed: {e}',
        imgTipEmpty: 'Nothing to export yet',
        imgEncoding: 'Converting {n}%',
        imgMetaOriginal: 'Original {size}',
        imgMetaImage: 'Image {size}',
        imgMetaData: 'Data {size}',
        imgNoPreviewTitle: 'No preview',
        imgMetaB64: 'Base64 {n} chars',
        imgMetaWarn: ' (+{n})',
        imgMetaType: '{mime}',
        imgMetaNoDims: 'unknown size',
        imgSampleUnsupported: 'Sample generation is not supported here',
        imgLightboxTip: 'Click to view full size',
        imgLightboxHint: 'Scroll to zoom · double-click for 1:1 · Esc to close',
        imgLightboxClose: 'Close',
        imgLightboxActual: 'Actual size (1:1)'
    },
    'az': {
        navImage: 'Şəkil Base64',
        imgModeEncode: 'Şəkli Base64-ə',
        imgModeDecode: 'Base64-dən şəkilə',
        imgInputTitle: 'Şəkil yükləyin və ya yapışdırın',
        imgInputTitleB64: 'Base64 məlumatı',
        imgResultTitle: 'Nəticə',
        imgPreviewTitle: 'Önizləmə',
        imgPick: 'Şəkil seç',
        imgDropTitle: 'Şəkli buraya dartın',
        imgDropHint: 'Ctrl / Cmd + V ilə ekran görüntüsünü də yapışdıra bilərsiniz',
        imgFormatLabel: 'Çıxış formatı',
        imgFmtRaw: 'Təmiz Base64',
        imgKindRaw: 'Təmiz Base64',
        imgKindDataUri: 'DataURI',
        imgKindSvg: 'SVG mətni',
        imgSample: 'Nümunə şəkil',
        imgLimitHint: 'Bir şəkil ≤ 10 MB · Base64 həcmi təqribən +33%',
        imgLimitHintDecode: 'DataURI, təmiz Base64 və ya mətn faylı · maksimum 14 M simvol',
        imgImport: 'Fayl idxal et',
        imgImportTip: '.txt, .b64 və ya .json — birbaşa buraya da atın',
        imgImportTooLarge: 'Fayl {size}, {max} limitindən böyükdür',
        imgImportNotText: 'Bu mətn faylı deyil, Base64 oxunmur',
        imgImportEmpty: 'Bu fayl boşdur',
        imgImportFailed: 'Fayl oxunmadı, başqasını sınayın',
        imgImported: '{name} idxal edildi · {size}',
        imgImportUntitled: 'Adsız fayl',
        imgDropTextInstead: 'Bu mətn faylıdır — "Base64-dən şəkilə" səhifəsində idxal edin',
        imgImportImageInstead: 'Bu şəkildir — "Şəkli Base64-ə" səhifəsində idxal edin',
        imgPlaceholderDecode: 'DataURI və ya Base64 buraya yapışdırın…',
        imgExport: 'İxrac et',
        imgTipIdle: 'Hələ şəkil yoxdur',
        imgTipIdleDecode: 'Base64 yapışdırın, şəkil sağda görünəcək',
        imgTipReady: 'Çevrildi',
        imgTipDecoded: 'Tanındı',
        imgTipTooBig: 'Şəkil {size}, {max} limitini aşır',
        imgTipTooLong: 'Base64 mətni çox uzundur — maksimum 14 MB (təxminən 10 MB şəkil)',
        imgTipNotImage: 'Bu, şəkil faylı deyil',
        imgTipNotImageData: 'Açılan məlumat şəkil deyil ({mime}), amma ixrac işləyir',
        imgTipPastedB64: 'Base64 tapıldı — dekodlaşdırmaya keçildi',
        imgTipBadInput: 'Base64 tanınmadı — prefiksin əskik olub-olmadığını yoxlayın',
        imgTipHeight: 'Brauzer bu formatı önizləyə bilmir, amma kopyalamaq / ixrac etmək olar',
        imgTipTruncated: 'Önizləmə kəsildi — tam mətn üçün faylı ixrac edin',
        imgTipCopyTruncated: 'Önizləmə kəsildi — tam məlumat üçün «İxrac et» düyməsini basın',
        imgTipCopied: 'Buferə kopyalandı',
        imgTipCopyTooBig: 'Çox böyükdür ({size}), birbaşa ixrac edin',
        imgTipExported: 'İxrac edildi',
        imgTipCancelled: 'İxrac ləğv edildi',
        imgTipExportFail: 'İxrac alınmadı: {e}',
        imgTipEmpty: 'İxrac üçün heç nə yoxdur',
        imgEncoding: 'Çevrilir {n}%',
        imgMetaOriginal: 'Orijinal {size}',
        imgMetaImage: 'Şəkil {size}',
        imgMetaData: 'Məlumat {size}',
        imgNoPreviewTitle: 'Önizləmə yoxdur',
        imgMetaB64: 'Base64 {n} simvol',
        imgMetaWarn: ' (+{n})',
        imgMetaType: '{mime}',
        imgMetaNoDims: 'ölçü bilinmir',
        imgSampleUnsupported: 'Bu mühit nümunə şəkil yarada bilmir',
        imgLightboxTip: 'Böyütmək üçün klikləyin',
        imgLightboxHint: 'Təkərlə miqyas · iki klik 1:1 · Esc bağlayır',
        imgLightboxClose: 'Bağla',
        imgLightboxActual: 'Həqiqi ölçü (1:1)'
    },
    'es': {
        navImage: 'Imagen Base64',
        imgModeEncode: 'Imagen a Base64',
        imgModeDecode: 'Base64 a imagen',
        imgInputTitle: 'Sube o pega una imagen',
        imgInputTitleB64: 'Datos Base64',
        imgResultTitle: 'Resultado',
        imgPreviewTitle: 'Vista previa',
        imgPick: 'Elegir imagen',
        imgDropTitle: 'Arrastra la imagen aquí',
        imgDropHint: 'También puedes pegar una captura con Ctrl / Cmd + V',
        imgFormatLabel: 'Formato de salida',
        imgFmtRaw: 'Base64 puro',
        imgKindRaw: 'Base64 puro',
        imgKindDataUri: 'DataURI',
        imgKindSvg: 'Código SVG',
        imgSample: 'Imagen de ejemplo',
        imgLimitHint: 'Una imagen ≤ 10 MB · Base64 crece un 33% aprox.',
        imgLimitHintDecode: 'DataURI, Base64 puro o un archivo de texto · máximo 14 M caracteres',
        imgImport: 'Importar archivo',
        imgImportTip: '.txt, .b64 o .json — o arrástralo aquí',
        imgImportTooLarge: 'El archivo es {size}, supera el límite de {max}',
        imgImportNotText: 'No es un archivo de texto, no hay Base64 que leer',
        imgImportEmpty: 'Este archivo está vacío',
        imgImportFailed: 'No se pudo leer el archivo, prueba con otro',
        imgImported: 'Importado {name} · {size}',
        imgImportUntitled: 'Archivo sin nombre',
        imgDropTextInstead: 'Es un archivo de texto: impórtalo en la página Base64 a imagen',
        imgImportImageInstead: 'Es una imagen: impórtala en la página Imagen a Base64',
        imgPlaceholderDecode: 'Pega aquí un DataURI o Base64…',
        imgExport: 'Exportar',
        imgTipIdle: 'Todavía no hay imagen',
        imgTipIdleDecode: 'Pega un Base64 y la imagen aparecerá a la derecha',
        imgTipReady: 'Convertida',
        imgTipDecoded: 'Detectada',
        imgTipTooBig: 'La imagen pesa {size}, supera el límite de {max}',
        imgTipTooLong: 'Ese texto Base64 es demasiado largo: máximo 14 MB (unos 10 MB de imagen)',
        imgTipNotImage: 'Eso no es un archivo de imagen',
        imgTipNotImageData: 'Los bytes decodificados no son una imagen ({mime}), pero la exportación funciona',
        imgTipPastedB64: 'Base64 detectado: cambiado a decodificar',
        imgTipBadInput: 'No se reconoce el Base64: revisa si falta el prefijo',
        imgTipHeight: 'El navegador no puede previsualizar este formato, pero copiar y exportar sí funcionan',
        imgTipTruncated: 'Vista previa truncada: exporta el archivo para ver el texto completo',
        imgTipCopyTruncated: 'Vista previa truncada: usa «Exportar» para obtener los datos completos',
        imgTipCopied: 'Copiado al portapapeles',
        imgTipCopyTooBig: 'Demasiado grande ({size}), mejor exporta',
        imgTipExported: 'Exportado',
        imgTipCancelled: 'Exportación cancelada',
        imgTipExportFail: 'Error al exportar: {e}',
        imgTipEmpty: 'No hay nada que exportar',
        imgEncoding: 'Convirtiendo {n}%',
        imgMetaOriginal: 'Original {size}',
        imgMetaImage: 'Imagen {size}',
        imgMetaData: 'Datos {size}',
        imgNoPreviewTitle: 'Sin vista previa',
        imgMetaB64: 'Base64 {n} caracteres',
        imgMetaWarn: ' (+{n})',
        imgMetaType: '{mime}',
        imgMetaNoDims: 'tamaño desconocido',
        imgSampleUnsupported: 'Aquí no se puede generar la imagen de ejemplo',
        imgLightboxTip: 'Haz clic para ampliar',
        imgLightboxHint: 'Rueda para zoom · doble clic para 1:1 · Esc para cerrar',
        imgLightboxClose: 'Cerrar',
        imgLightboxActual: 'Tamaño real (1:1)'
    },
    'id': {
        navImage: 'Gambar Base64',
        imgModeEncode: 'Gambar ke Base64',
        imgModeDecode: 'Base64 ke gambar',
        imgInputTitle: 'Unggah atau tempel gambar',
        imgInputTitleB64: 'Data Base64',
        imgResultTitle: 'Hasil',
        imgPreviewTitle: 'Pratinjau',
        imgPick: 'Pilih gambar',
        imgDropTitle: 'Tarik gambar ke sini',
        imgDropHint: 'Tangkapan layar juga bisa ditempel dengan Ctrl / Cmd + V',
        imgFormatLabel: 'Format keluaran',
        imgFmtRaw: 'Base64 murni',
        imgKindRaw: 'Base64 murni',
        imgKindDataUri: 'DataURI',
        imgKindSvg: 'Sumber SVG',
        imgSample: 'Contoh gambar',
        imgLimitHint: 'Satu gambar ≤ 10 MB · Base64 sekitar +33%',
        imgLimitHintDecode: 'DataURI, Base64 murni, atau file teks · maksimal 14 M karakter',
        imgImport: 'Impor file',
        imgImportTip: '.txt, .b64, atau .json — atau tarik langsung ke sini',
        imgImportTooLarge: 'File {size}, melebihi batas {max}',
        imgImportNotText: 'Ini bukan file teks, tidak ada Base64 yang bisa dibaca',
        imgImportEmpty: 'File ini kosong',
        imgImportFailed: 'Gagal membaca file, coba yang lain',
        imgImported: '{name} diimpor · {size}',
        imgImportUntitled: 'File tanpa nama',
        imgDropTextInstead: 'Ini file teks — impor di halaman Base64 ke gambar',
        imgImportImageInstead: 'Ini gambar — impor di halaman Gambar ke Base64',
        imgPlaceholderDecode: 'Tempel DataURI atau Base64 di sini…',
        imgExport: 'Ekspor',
        imgTipIdle: 'Belum ada gambar',
        imgTipIdleDecode: 'Tempel Base64, gambarnya muncul di kanan',
        imgTipReady: 'Dikonversi',
        imgTipDecoded: 'Terdeteksi',
        imgTipTooBig: 'Gambar {size}, melebihi batas {max}',
        imgTipTooLong: 'Teks Base64 terlalu panjang: maksimal 14 MB (sekitar 10 MB gambar)',
        imgTipNotImage: 'Ini bukan berkas gambar',
        imgTipNotImageData: 'Hasil dekode bukan gambar ({mime}), tetapi ekspor tetap bisa',
        imgTipPastedB64: 'Base64 terdeteksi: beralih ke dekode',
        imgTipBadInput: 'Base64 tidak dikenali: periksa apakah prefiksnya hilang',
        imgTipHeight: 'Peramban tidak bisa mempratinjau format ini, tetapi salin dan ekspor tetap bisa',
        imgTipTruncated: 'Pratinjau terpotong: ekspor berkas untuk teks lengkap',
        imgTipCopyTruncated: 'Pratinjau terpotong: pakai «Ekspor» untuk data lengkap',
        imgTipCopied: 'Disalin ke papan klip',
        imgTipCopyTooBig: 'Terlalu besar ({size}), sebaiknya ekspor',
        imgTipExported: 'Diekspor',
        imgTipCancelled: 'Ekspor dibatalkan',
        imgTipExportFail: 'Ekspor gagal: {e}',
        imgTipEmpty: 'Belum ada yang bisa diekspor',
        imgEncoding: 'Mengonversi {n}%',
        imgMetaOriginal: 'Asli {size}',
        imgMetaImage: 'Gambar {size}',
        imgMetaData: 'Data {size}',
        imgNoPreviewTitle: 'Tidak ada pratinjau',
        imgMetaB64: 'Base64 {n} karakter',
        imgMetaWarn: ' (+{n})',
        imgMetaType: '{mime}',
        imgMetaNoDims: 'ukuran tak diketahui',
        imgSampleUnsupported: 'Contoh gambar tidak bisa dibuat di sini',
        imgLightboxTip: 'Klik untuk memperbesar',
        imgLightboxHint: 'Gulir untuk zoom · klik ganda untuk 1:1 · Esc untuk menutup',
        imgLightboxClose: 'Tutup',
        imgLightboxActual: 'Ukuran asli (1:1)'
    },
    'it': {
        navImage: 'Immagine Base64',
        imgModeEncode: 'Immagine in Base64',
        imgModeDecode: 'Base64 in immagine',
        imgInputTitle: 'Carica o incolla un\'immagine',
        imgInputTitleB64: 'Dati Base64',
        imgResultTitle: 'Risultato',
        imgPreviewTitle: 'Anteprima',
        imgPick: 'Scegli immagine',
        imgDropTitle: 'Trascina qui l\'immagine',
        imgDropHint: 'Puoi incollare anche uno screenshot con Ctrl / Cmd + V',
        imgFormatLabel: 'Formato di uscita',
        imgFmtRaw: 'Base64 puro',
        imgKindRaw: 'Base64 puro',
        imgKindDataUri: 'DataURI',
        imgKindSvg: 'Sorgente SVG',
        imgSample: 'Immagine di esempio',
        imgLimitHint: 'Un\'immagine ≤ 10 MB · Base64 cresce di circa il 33%',
        imgLimitHintDecode: 'DataURI, Base64 puro o un file di testo · massimo 14 M caratteri',
        imgImport: 'Importa file',
        imgImportTip: '.txt, .b64 o .json — oppure trascinalo qui',
        imgImportTooLarge: 'Il file è {size}, oltre il limite di {max}',
        imgImportNotText: 'Non è un file di testo, nessun Base64 da leggere',
        imgImportEmpty: 'Questo file è vuoto',
        imgImportFailed: 'Lettura del file non riuscita, provane un altro',
        imgImported: 'Importato {name} · {size}',
        imgImportUntitled: 'File senza nome',
        imgDropTextInstead: 'È un file di testo: importalo nella pagina Base64 in immagine',
        imgImportImageInstead: 'Questa è un\'immagine: importala nella pagina Immagine in Base64',
        imgPlaceholderDecode: 'Incolla qui un DataURI o Base64…',
        imgExport: 'Esporta',
        imgTipIdle: 'Nessuna immagine',
        imgTipIdleDecode: 'Incolla un Base64: l\'immagine appare a destra',
        imgTipReady: 'Convertita',
        imgTipDecoded: 'Riconosciuta',
        imgTipTooBig: 'L\'immagine pesa {size}, oltre il limite di {max}',
        imgTipTooLong: 'Testo Base64 troppo lungo: massimo 14 MB (circa 10 MB di immagine)',
        imgTipNotImage: 'Non è un file immagine',
        imgTipNotImageData: 'I byte decodificati non sono un\'immagine ({mime}), ma l\'esportazione funziona',
        imgTipPastedB64: 'Base64 riconosciuto: passato alla decodifica',
        imgTipBadInput: 'Base64 non riconosciuto: controlla se manca il prefisso',
        imgTipHeight: 'Il browser non può mostrare questo formato, ma copia ed esporta funzionano',
        imgTipTruncated: 'Anteprima troncata: esporta il file per il testo completo',
        imgTipCopyTruncated: 'Anteprima troncata: usa «Esporta» per i dati completi',
        imgTipCopied: 'Copiato negli appunti',
        imgTipCopyTooBig: 'Troppo grande ({size}), conviene esportare',
        imgTipExported: 'Esportato',
        imgTipCancelled: 'Esportazione annullata',
        imgTipExportFail: 'Esportazione non riuscita: {e}',
        imgTipEmpty: 'Niente da esportare',
        imgEncoding: 'Conversione {n}%',
        imgMetaOriginal: 'Originale {size}',
        imgMetaImage: 'Immagine {size}',
        imgMetaData: 'Dati {size}',
        imgNoPreviewTitle: 'Nessuna anteprima',
        imgMetaB64: 'Base64 {n} caratteri',
        imgMetaWarn: ' (+{n})',
        imgMetaType: '{mime}',
        imgMetaNoDims: 'dimensioni sconosciute',
        imgSampleUnsupported: 'Qui non si può generare l\'immagine di esempio',
        imgLightboxTip: 'Clic per ingrandire',
        imgLightboxHint: 'Rotella per lo zoom · doppio clic per 1:1 · Esc per chiudere',
        imgLightboxClose: 'Chiudi',
        imgLightboxActual: 'Dimensione reale (1:1)'
    },
    'ja': {
        navImage: '画像 Base64',
        imgModeEncode: '画像 → Base64',
        imgModeDecode: 'Base64 → 画像',
        imgInputTitle: '画像をアップロードまたは貼り付け',
        imgInputTitleB64: 'Base64 データ',
        imgResultTitle: '変換結果',
        imgPreviewTitle: 'プレビュー',
        imgPick: '画像を選択',
        imgDropTitle: '画像をここにドロップ',
        imgDropHint: 'Ctrl / Cmd + V でスクリーンショットも貼り付けられます',
        imgFormatLabel: '出力形式',
        imgFmtRaw: 'Base64 のみ',
        imgKindRaw: 'Base64 のみ',
        imgKindDataUri: 'DataURI',
        imgKindSvg: 'SVG ソース',
        imgSample: 'サンプル画像',
        imgLimitHint: '1 枚 ≤ 10 MB · Base64 は約 +33%',
        imgLimitHintDecode: 'DataURI / 生の Base64 / テキストファイル · 最大 14 M 文字',
        imgImport: 'ファイルを読み込む',
        imgImportTip: '.txt / .b64 / .json に対応、ここにドロップも可',
        imgImportTooLarge: 'ファイルは {size}、上限 {max} を超えています',
        imgImportNotText: 'テキストファイルではないため Base64 を読み出せません',
        imgImportEmpty: 'このファイルは空です',
        imgImportFailed: 'ファイルを読み込めませんでした。別のファイルをお試しください',
        imgImported: '{name} を読み込みました · {size}',
        imgImportUntitled: '名前のないファイル',
        imgDropTextInstead: 'テキストファイルです。「Base64 → 画像」ページで読み込んでください',
        imgImportImageInstead: '画像ファイルです。「画像 → Base64」ページで読み込んでください',
        imgPlaceholderDecode: 'DataURI または Base64 をここに貼り付け…',
        imgExport: '書き出し',
        imgTipIdle: '画像がまだありません',
        imgTipIdleDecode: 'Base64 を貼り付けると右側に画像が出ます',
        imgTipReady: '変換しました',
        imgTipDecoded: '認識しました',
        imgTipTooBig: '画像は {size}、上限 {max} を超えています',
        imgTipTooLong: 'Base64 テキストが長すぎます — 最大 14 MB（約 10 MB の画像）',
        imgTipNotImage: '画像ファイルではありません',
        imgTipNotImageData: 'デコード結果は画像ではありません（{mime}）。書き出しは可能です',
        imgTipPastedB64: 'Base64 を検出したのでデコードに切り替えました',
        imgTipBadInput: 'Base64 を認識できません。プレフィックスの抜けを確認してください',
        imgTipHeight: 'この形式はブラウザでプレビューできません。コピーと書き出しは可能です',
        imgTipTruncated: 'プレビューは途中までです。全文は書き出して確認してください',
        imgTipCopyTruncated: 'プレビューは途中までです。「書き出し」で完全なデータを保存してください',
        imgTipCopied: 'クリップボードにコピーしました',
        imgTipCopyTooBig: '大きすぎます（{size}）。書き出しをおすすめします',
        imgTipExported: '書き出しました',
        imgTipCancelled: '書き出しをキャンセルしました',
        imgTipExportFail: '書き出しに失敗: {e}',
        imgTipEmpty: '書き出す内容がありません',
        imgEncoding: '変換中 {n}%',
        imgMetaOriginal: '元 {size}',
        imgMetaImage: '画像 {size}',
        imgMetaData: 'データ {size}',
        imgNoPreviewTitle: 'プレビューできません',
        imgMetaB64: 'Base64 {n} 文字',
        imgMetaWarn: '（+{n}）',
        imgMetaType: '{mime}',
        imgMetaNoDims: 'サイズ不明',
        imgSampleUnsupported: 'この環境ではサンプル画像を生成できません',
        imgLightboxTip: 'クリックで拡大表示',
        imgLightboxHint: 'ホイールでズーム · ダブルクリックで 1:1 · Esc で閉じる',
        imgLightboxClose: '閉じる',
        imgLightboxActual: '原寸 (1:1)'
    },
    'ko': {
        navImage: '이미지 Base64',
        imgModeEncode: '이미지 → Base64',
        imgModeDecode: 'Base64 → 이미지',
        imgInputTitle: '이미지 업로드 또는 붙여넣기',
        imgInputTitleB64: 'Base64 데이터',
        imgResultTitle: '변환 결과',
        imgPreviewTitle: '미리보기',
        imgPick: '이미지 선택',
        imgDropTitle: '이미지를 여기로 끌어다 놓으세요',
        imgDropHint: 'Ctrl / Cmd + V 로 스크린샷도 붙여넣을 수 있습니다',
        imgFormatLabel: '출력 형식',
        imgFmtRaw: '순수 Base64',
        imgKindRaw: '순수 Base64',
        imgKindDataUri: 'DataURI',
        imgKindSvg: 'SVG 소스',
        imgSample: '예시 이미지',
        imgLimitHint: '이미지 1장 ≤ 10 MB · Base64는 약 +33%',
        imgLimitHintDecode: 'DataURI, 순수 Base64 또는 텍스트 파일 · 최대 14 M 문자',
        imgImport: '파일 가져오기',
        imgImportTip: '.txt / .b64 / .json 지원, 여기로 끌어다 놓아도 됩니다',
        imgImportTooLarge: '파일이 {size}로 {max} 한도를 초과합니다',
        imgImportNotText: '텍스트 파일이 아니어서 Base64를 읽을 수 없습니다',
        imgImportEmpty: '이 파일은 비어 있습니다',
        imgImportFailed: '파일을 읽지 못했습니다. 다른 파일을 시도해 보세요',
        imgImported: '{name} 가져옴 · {size}',
        imgImportUntitled: '이름 없는 파일',
        imgDropTextInstead: '텍스트 파일입니다. "Base64 → 이미지" 페이지에서 가져오세요',
        imgImportImageInstead: '이미지 파일입니다. "이미지 → Base64" 페이지에서 가져오세요',
        imgPlaceholderDecode: 'DataURI 또는 Base64를 여기에 붙여넣으세요…',
        imgExport: '내보내기',
        imgTipIdle: '아직 이미지가 없습니다',
        imgTipIdleDecode: 'Base64를 붙여넣으면 오른쪽에 이미지가 나타납니다',
        imgTipReady: '변환됨',
        imgTipDecoded: '인식됨',
        imgTipTooBig: '이미지가 {size}, {max} 한도를 초과합니다',
        imgTipTooLong: 'Base64 텍스트가 너무 깁니다 — 최대 14 MB (약 10 MB 이미지)',
        imgTipNotImage: '이미지 파일이 아닙니다',
        imgTipNotImageData: '디코딩 결과가 이미지가 아닙니다({mime}). 내보내기는 가능합니다',
        imgTipPastedB64: 'Base64를 찾아 디코딩으로 전환했습니다',
        imgTipBadInput: 'Base64를 인식할 수 없습니다. 접두사가 빠졌는지 확인하세요',
        imgTipHeight: '브라우저가 이 형식을 미리 볼 수 없습니다. 복사와 내보내기는 가능합니다',
        imgTipTruncated: '미리보기가 잘렸습니다. 전체 내용은 파일로 내보내 확인하세요',
        imgTipCopyTruncated: '미리보기가 잘렸습니다. 「내보내기」로 전체 데이터를 저장하세요',
        imgTipCopied: '클립보드에 복사했습니다',
        imgTipCopyTooBig: '너무 큽니다({size}). 내보내기를 권합니다',
        imgTipExported: '내보냈습니다',
        imgTipCancelled: '내보내기를 취소했습니다',
        imgTipExportFail: '내보내기 실패: {e}',
        imgTipEmpty: '내보낼 내용이 없습니다',
        imgEncoding: '변환 중 {n}%',
        imgMetaOriginal: '원본 {size}',
        imgMetaImage: '이미지 {size}',
        imgMetaData: '데이터 {size}',
        imgNoPreviewTitle: '미리보기 불가',
        imgMetaB64: 'Base64 {n} 문자',
        imgMetaWarn: ' (+{n})',
        imgMetaType: '{mime}',
        imgMetaNoDims: '크기 알 수 없음',
        imgSampleUnsupported: '이 환경에서는 예시 이미지를 만들 수 없습니다',
        imgLightboxTip: '클릭하면 크게 보기',
        imgLightboxHint: '휠로 확대·축소 · 더블클릭하면 1:1 · Esc로 닫기',
        imgLightboxClose: '닫기',
        imgLightboxActual: '원본 크기 (1:1)'
    },
    'pt': {
        navImage: 'Imagem Base64',
        imgModeEncode: 'Imagem para Base64',
        imgModeDecode: 'Base64 para imagem',
        imgInputTitle: 'Envie ou cole uma imagem',
        imgInputTitleB64: 'Dados Base64',
        imgResultTitle: 'Resultado',
        imgPreviewTitle: 'Pré-visualização',
        imgPick: 'Escolher imagem',
        imgDropTitle: 'Arraste a imagem para cá',
        imgDropHint: 'Você também pode colar uma captura com Ctrl / Cmd + V',
        imgFormatLabel: 'Formato de saída',
        imgFmtRaw: 'Base64 puro',
        imgKindRaw: 'Base64 puro',
        imgKindDataUri: 'DataURI',
        imgKindSvg: 'Código SVG',
        imgSample: 'Imagem de exemplo',
        imgLimitHint: 'Uma imagem ≤ 10 MB · Base64 cresce cerca de 33%',
        imgLimitHintDecode: 'DataURI, Base64 puro ou um arquivo de texto · máximo 14 M caracteres',
        imgImport: 'Importar arquivo',
        imgImportTip: '.txt, .b64 ou .json — ou arraste para cá',
        imgImportTooLarge: 'O arquivo tem {size}, acima do limite de {max}',
        imgImportNotText: 'Não é um arquivo de texto, não há Base64 para ler',
        imgImportEmpty: 'Este arquivo está vazio',
        imgImportFailed: 'Não foi possível ler o arquivo, tente outro',
        imgImported: 'Importado {name} · {size}',
        imgImportUntitled: 'Arquivo sem nome',
        imgDropTextInstead: 'É um arquivo de texto — importe na página Base64 para imagem',
        imgImportImageInstead: 'É uma imagem — importe na página Imagem para Base64',
        imgPlaceholderDecode: 'Cole aqui um DataURI ou Base64…',
        imgExport: 'Exportar',
        imgTipIdle: 'Ainda sem imagem',
        imgTipIdleDecode: 'Cole um Base64 e a imagem aparece à direita',
        imgTipReady: 'Convertida',
        imgTipDecoded: 'Detectada',
        imgTipTooBig: 'A imagem tem {size}, acima do limite de {max}',
        imgTipTooLong: 'Esse texto Base64 é longo demais: máximo 14 MB (cerca de 10 MB de imagem)',
        imgTipNotImage: 'Isso não é um arquivo de imagem',
        imgTipNotImageData: 'Os bytes decodificados não são uma imagem ({mime}), mas a exportação funciona',
        imgTipPastedB64: 'Base64 detectado: mudei para decodificar',
        imgTipBadInput: 'Não reconheci o Base64: veja se falta o prefixo',
        imgTipHeight: 'O navegador não pré-visualiza este formato, mas copiar e exportar funcionam',
        imgTipTruncated: 'Prévia truncada: exporte o arquivo para ver o texto completo',
        imgTipCopyTruncated: 'Prévia truncada: use «Exportar» para obter os dados completos',
        imgTipCopied: 'Copiado para a área de transferência',
        imgTipCopyTooBig: 'Grande demais ({size}), é melhor exportar',
        imgTipExported: 'Exportado',
        imgTipCancelled: 'Exportação cancelada',
        imgTipExportFail: 'Falha ao exportar: {e}',
        imgTipEmpty: 'Nada para exportar',
        imgEncoding: 'Convertendo {n}%',
        imgMetaOriginal: 'Original {size}',
        imgMetaImage: 'Imagem {size}',
        imgMetaData: 'Dados {size}',
        imgNoPreviewTitle: 'Sem prévia',
        imgMetaB64: 'Base64 {n} caracteres',
        imgMetaWarn: ' (+{n})',
        imgMetaType: '{mime}',
        imgMetaNoDims: 'tamanho desconhecido',
        imgSampleUnsupported: 'Não dá para gerar a imagem de exemplo aqui',
        imgLightboxTip: 'Clique para ampliar',
        imgLightboxHint: 'Rolagem para zoom · duplo clique para 1:1 · Esc para fechar',
        imgLightboxClose: 'Fechar',
        imgLightboxActual: 'Tamanho real (1:1)'
    },
    'pl': {
        navImage: 'Obraz Base64',
        imgModeEncode: 'Obraz na Base64',
        imgModeDecode: 'Base64 na obraz',
        imgInputTitle: 'Wgraj lub wklej obraz',
        imgInputTitleB64: 'Dane Base64',
        imgResultTitle: 'Wynik',
        imgPreviewTitle: 'Podgląd',
        imgPick: 'Wybierz obraz',
        imgDropTitle: 'Przeciągnij obraz tutaj',
        imgDropHint: 'Zrzut ekranu wkleisz też przez Ctrl / Cmd + V',
        imgFormatLabel: 'Format wyjściowy',
        imgFmtRaw: 'Czysty Base64',
        imgKindRaw: 'Czysty Base64',
        imgKindDataUri: 'DataURI',
        imgKindSvg: 'Źródło SVG',
        imgSample: 'Przykładowy obraz',
        imgLimitHint: 'Jeden obraz ≤ 10 MB · Base64 to około +33%',
        imgLimitHintDecode: 'DataURI, czysty Base64 lub plik tekstowy · maksymalnie 14 M znaków',
        imgImport: 'Importuj plik',
        imgImportTip: '.txt, .b64 lub .json — możesz też go tu przeciągnąć',
        imgImportTooLarge: 'Plik ma {size}, przekracza limit {max}',
        imgImportNotText: 'To nie jest plik tekstowy, nie ma Base64 do odczytu',
        imgImportEmpty: 'Ten plik jest pusty',
        imgImportFailed: 'Nie udało się odczytać pliku, spróbuj innego',
        imgImported: 'Zaimportowano {name} · {size}',
        imgImportUntitled: 'Plik bez nazwy',
        imgDropTextInstead: 'To plik tekstowy — zaimportuj go na stronie Base64 na obraz',
        imgImportImageInstead: 'To obraz — zaimportuj go na stronie Obraz na Base64',
        imgPlaceholderDecode: 'Wklej tutaj DataURI lub Base64…',
        imgExport: 'Eksportuj',
        imgTipIdle: 'Nie ma jeszcze obrazu',
        imgTipIdleDecode: 'Wklej Base64, a obraz pojawi się po prawej',
        imgTipReady: 'Przekonwertowano',
        imgTipDecoded: 'Rozpoznano',
        imgTipTooBig: 'Obraz ma {size}, przekracza limit {max}',
        imgTipTooLong: 'Ten tekst Base64 jest za długi: maksymalnie 14 MB (około 10 MB obrazu)',
        imgTipNotImage: 'To nie jest plik obrazu',
        imgTipNotImageData: 'Zdekodowane bajty nie są obrazem ({mime}), ale eksport działa',
        imgTipPastedB64: 'Wykryto Base64: przełączono na dekodowanie',
        imgTipBadInput: 'Nie rozpoznaję Base64: sprawdź, czy nie brakuje prefiksu',
        imgTipHeight: 'Przeglądarka nie pokaże tego formatu, ale kopiowanie i eksport działają',
        imgTipTruncated: 'Podgląd jest ucięty: wyeksportuj plik, aby zobaczyć całość',
        imgTipCopyTruncated: 'Podgląd jest ucięty: użyj «Eksportuj», aby dostać pełne dane',
        imgTipCopied: 'Skopiowano do schowka',
        imgTipCopyTooBig: 'Za duże ({size}), lepiej wyeksportować',
        imgTipExported: 'Wyeksportowano',
        imgTipCancelled: 'Eksport anulowany',
        imgTipExportFail: 'Eksport nie powiódł się: {e}',
        imgTipEmpty: 'Nie ma czego eksportować',
        imgEncoding: 'Konwersja {n}%',
        imgMetaOriginal: 'Oryginał {size}',
        imgMetaImage: 'Obraz {size}',
        imgMetaData: 'Dane {size}',
        imgNoPreviewTitle: 'Brak podglądu',
        imgMetaB64: 'Base64 {n} znaków',
        imgMetaWarn: ' (+{n})',
        imgMetaType: '{mime}',
        imgMetaNoDims: 'rozmiar nieznany',
        imgSampleUnsupported: 'Nie można tu wygenerować przykładowego obrazu',
        imgLightboxTip: 'Kliknij, aby powiększyć',
        imgLightboxHint: 'Kółko = zoom · dwuklik = 1:1 · Esc zamyka',
        imgLightboxClose: 'Zamknij',
        imgLightboxActual: 'Rozmiar rzeczywisty (1:1)'
    },
    'ru': {
        navImage: 'Изображение Base64',
        imgModeEncode: 'Изображение в Base64',
        imgModeDecode: 'Base64 в изображение',
        imgInputTitle: 'Загрузите или вставьте изображение',
        imgInputTitleB64: 'Данные Base64',
        imgResultTitle: 'Результат',
        imgPreviewTitle: 'Предпросмотр',
        imgPick: 'Выбрать изображение',
        imgDropTitle: 'Перетащите изображение сюда',
        imgDropHint: 'Скриншот можно вставить через Ctrl / Cmd + V',
        imgFormatLabel: 'Формат вывода',
        imgFmtRaw: 'Чистый Base64',
        imgKindRaw: 'Чистый Base64',
        imgKindDataUri: 'DataURI',
        imgKindSvg: 'Исходник SVG',
        imgSample: 'Пример изображения',
        imgLimitHint: 'Одно изображение ≤ 10 MB · Base64 примерно +33%',
        imgLimitHintDecode: 'DataURI, чистый Base64 или текстовый файл · максимум 14 M символов',
        imgImport: 'Импорт файла',
        imgImportTip: '.txt, .b64 или .json — можно просто перетащить сюда',
        imgImportTooLarge: 'Файл {size}, больше лимита {max}',
        imgImportNotText: 'Это не текстовый файл, Base64 не читается',
        imgImportEmpty: 'Этот файл пустой',
        imgImportFailed: 'Не удалось прочитать файл, попробуйте другой',
        imgImported: 'Импортирован {name} · {size}',
        imgImportUntitled: 'Файл без имени',
        imgDropTextInstead: 'Это текстовый файл — импортируйте его на странице «Base64 в изображение»',
        imgImportImageInstead: 'Это изображение — импортируйте его на странице «Изображение в Base64»',
        imgPlaceholderDecode: 'Вставьте сюда DataURI или Base64…',
        imgExport: 'Экспорт',
        imgTipIdle: 'Изображения пока нет',
        imgTipIdleDecode: 'Вставьте Base64 — изображение появится справа',
        imgTipReady: 'Преобразовано',
        imgTipDecoded: 'Распознано',
        imgTipTooBig: 'Изображение {size}, больше предела {max}',
        imgTipTooLong: 'Текст Base64 слишком длинный: максимум 14 MB (около 10 MB изображения)',
        imgTipNotImage: 'Это не файл изображения',
        imgTipNotImageData: 'Декодированные байты не изображение ({mime}), но экспорт работает',
        imgTipPastedB64: 'Найден Base64: переключились на декодирование',
        imgTipBadInput: 'Base64 не распознан: проверьте, не потерян ли префикс',
        imgTipHeight: 'Браузер не покажет этот формат, но копирование и экспорт работают',
        imgTipTruncated: 'Предпросмотр обрезан: экспортируйте файл, чтобы увидеть весь текст',
        imgTipCopyTruncated: 'Предпросмотр обрезан: нажмите «Экспорт», чтобы получить полные данные',
        imgTipCopied: 'Скопировано в буфер обмена',
        imgTipCopyTooBig: 'Слишком большой объём ({size}), лучше экспортировать',
        imgTipExported: 'Экспортировано',
        imgTipCancelled: 'Экспорт отменён',
        imgTipExportFail: 'Не удалось экспортировать: {e}',
        imgTipEmpty: 'Нечего экспортировать',
        imgEncoding: 'Преобразование {n}%',
        imgMetaOriginal: 'Оригинал {size}',
        imgMetaImage: 'Изображение {size}',
        imgMetaData: 'Данные {size}',
        imgNoPreviewTitle: 'Предпросмотр недоступен',
        imgMetaB64: 'Base64 {n} символов',
        imgMetaWarn: ' (+{n})',
        imgMetaType: '{mime}',
        imgMetaNoDims: 'размер неизвестен',
        imgSampleUnsupported: 'Здесь нельзя создать пример изображения',
        imgLightboxTip: 'Нажмите, чтобы увеличить',
        imgLightboxHint: 'Колесо — масштаб · двойной клик — 1:1 · Esc — закрыть',
        imgLightboxClose: 'Закрыть',
        imgLightboxActual: 'Реальный размер (1:1)'
    },
    'th': {
        navImage: 'รูปภาพ Base64',
        imgModeEncode: 'รูปภาพเป็น Base64',
        imgModeDecode: 'Base64 เป็นรูปภาพ',
        imgInputTitle: 'อัปโหลดหรือวางรูปภาพ',
        imgInputTitleB64: 'ข้อมูล Base64',
        imgResultTitle: 'ผลลัพธ์',
        imgPreviewTitle: 'ตัวอย่าง',
        imgPick: 'เลือกรูปภาพ',
        imgDropTitle: 'ลากรูปภาพมาที่นี่',
        imgDropHint: 'วางภาพหน้าจอด้วย Ctrl / Cmd + V ก็ได้',
        imgFormatLabel: 'รูปแบบเอาต์พุต',
        imgFmtRaw: 'Base64 ล้วน',
        imgKindRaw: 'Base64 ล้วน',
        imgKindDataUri: 'DataURI',
        imgKindSvg: 'ซอร์ส SVG',
        imgSample: 'รูปตัวอย่าง',
        imgLimitHint: 'รูปเดียว ≤ 10 MB · Base64 โตขึ้นราว +33%',
        imgLimitHintDecode: 'DataURI / Base64 ล้วน / ไฟล์ข้อความ · สูงสุด 14 M ตัวอักษร',
        imgImport: 'นำเข้าไฟล์',
        imgImportTip: 'รองรับ .txt / .b64 / .json หรือลากมาวางที่นี่',
        imgImportTooLarge: 'ไฟล์ขนาด {size} เกินขีดจำกัด {max}',
        imgImportNotText: 'ไม่ใช่ไฟล์ข้อความ จึงอ่าน Base64 ไม่ได้',
        imgImportEmpty: 'ไฟล์นี้ว่างเปล่า',
        imgImportFailed: 'อ่านไฟล์ไม่สำเร็จ ลองไฟล์อื่น',
        imgImported: 'นำเข้า {name} · {size}',
        imgImportUntitled: 'ไฟล์ไม่มีชื่อ',
        imgDropTextInstead: 'นี่คือไฟล์ข้อความ — นำเข้าที่หน้า Base64 เป็นรูปภาพ',
        imgImportImageInstead: 'นี่คือรูปภาพ — นำเข้าที่หน้า รูปภาพเป็น Base64',
        imgPlaceholderDecode: 'วาง DataURI หรือ Base64 ที่นี่…',
        imgExport: 'ส่งออก',
        imgTipIdle: 'ยังไม่มีรูปภาพ',
        imgTipIdleDecode: 'วาง Base64 แล้วรูปจะแสดงทางขวา',
        imgTipReady: 'แปลงแล้ว',
        imgTipDecoded: 'ตรวจพบแล้ว',
        imgTipTooBig: 'รูปขนาด {size} เกินขีดจำกัด {max}',
        imgTipTooLong: 'ข้อความ Base64 ยาวเกินไป: สูงสุด 14 MB (ราว 10 MB ของรูป)',
        imgTipNotImage: 'นี่ไม่ใช่ไฟล์รูปภาพ',
        imgTipNotImageData: 'ไบต์ที่ถอดออกมาไม่ใช่รูปภาพ ({mime}) แต่ยังส่งออกได้',
        imgTipPastedB64: 'พบ Base64: สลับไปถอดรหัสแล้ว',
        imgTipBadInput: 'จำแนก Base64 ไม่ได้: ตรวจว่าคำนำหน้าหายไปหรือไม่',
        imgTipHeight: 'เบราว์เซอร์แสดงตัวอย่างรูปแบบนี้ไม่ได้ แต่คัดลอกและส่งออกได้',
        imgTipTruncated: 'ตัวอย่างถูกตัด: ส่งออกไฟล์เพื่อดูข้อความเต็ม',
        imgTipCopyTruncated: 'ตัวอย่างถูกตัด: กด «ส่งออก» เพื่อดูข้อมูลเต็ม',
        imgTipCopied: 'คัดลอกไปยังคลิปบอร์ดแล้ว',
        imgTipCopyTooBig: 'ใหญ่เกินไป ({size}) ควรส่งออกแทน',
        imgTipExported: 'ส่งออกแล้ว',
        imgTipCancelled: 'ยกเลิกการส่งออกแล้ว',
        imgTipExportFail: 'ส่งออกไม่สำเร็จ: {e}',
        imgTipEmpty: 'ยังไม่มีอะไรให้ส่งออก',
        imgEncoding: 'กำลังแปลง {n}%',
        imgMetaOriginal: 'ต้นฉบับ {size}',
        imgMetaImage: 'รูปภาพ {size}',
        imgMetaData: 'ข้อมูล {size}',
        imgNoPreviewTitle: 'แสดงตัวอย่างไม่ได้',
        imgMetaB64: 'Base64 {n} ตัวอักษร',
        imgMetaWarn: ' (+{n})',
        imgMetaType: '{mime}',
        imgMetaNoDims: 'ไม่ทราบขนาด',
        imgSampleUnsupported: 'สภาพแวดล้อมนี้สร้างรูปตัวอย่างไม่ได้',
        imgLightboxTip: 'คลิกเพื่อดูขนาดเต็ม',
        imgLightboxHint: 'เลื่อนเพื่อซูม · ดับเบิลคลิกเป็น 1:1 · Esc เพื่อปิด',
        imgLightboxClose: 'ปิด',
        imgLightboxActual: 'ขนาดจริง (1:1)'
    },
    'tr': {
        navImage: 'Görsel Base64',
        imgModeEncode: 'Görsel → Base64',
        imgModeDecode: 'Base64 → görsel',
        imgInputTitle: 'Görsel yükle veya yapıştır',
        imgInputTitleB64: 'Base64 verisi',
        imgResultTitle: 'Sonuç',
        imgPreviewTitle: 'Önizleme',
        imgPick: 'Görsel seç',
        imgDropTitle: 'Görseli buraya sürükleyin',
        imgDropHint: 'Ctrl / Cmd + V ile ekran görüntüsü de yapıştırabilirsiniz',
        imgFormatLabel: 'Çıktı biçimi',
        imgFmtRaw: 'Saf Base64',
        imgKindRaw: 'Saf Base64',
        imgKindDataUri: 'DataURI',
        imgKindSvg: 'SVG kaynağı',
        imgSample: 'Örnek görsel',
        imgLimitHint: 'Görsel başına ≤ 10 MB · Base64 yaklaşık +%33',
        imgLimitHintDecode: 'DataURI, saf Base64 veya metin dosyası · en fazla 14 M karakter',
        imgImport: 'Dosya içe aktar',
        imgImportTip: '.txt, .b64 veya .json — buraya sürükleyebilirsiniz',
        imgImportTooLarge: 'Dosya {size}, {max} sınırını aşıyor',
        imgImportNotText: 'Bu bir metin dosyası değil, Base64 okunamıyor',
        imgImportEmpty: 'Bu dosya boş',
        imgImportFailed: 'Dosya okunamadı, başka bir tane deneyin',
        imgImported: '{name} içe aktarıldı · {size}',
        imgImportUntitled: 'Adsız dosya',
        imgDropTextInstead: 'Bu bir metin dosyası — "Base64 → görsel" sayfasında içe aktarın',
        imgImportImageInstead: 'Bu bir görsel — "Görsel → Base64" sayfasında içe aktarın',
        imgPlaceholderDecode: 'DataURI veya Base64\'ü buraya yapıştırın…',
        imgExport: 'Dışa aktar',
        imgTipIdle: 'Henüz görsel yok',
        imgTipIdleDecode: 'Base64 yapıştırın, görsel sağda görünecek',
        imgTipReady: 'Dönüştürüldü',
        imgTipDecoded: 'Tanındı',
        imgTipTooBig: 'Görsel {size}, {max} sınırını aşıyor',
        imgTipTooLong: 'Bu Base64 metni çok uzun: en fazla 14 MB (yaklaşık 10 MB görsel)',
        imgTipNotImage: 'Bu bir görsel dosyası değil',
        imgTipNotImageData: 'Çözülen baytlar görsel değil ({mime}), yine de dışa aktarılabilir',
        imgTipPastedB64: 'Base64 bulundu: çözme sekmesine geçildi',
        imgTipBadInput: 'Base64 tanınmadı: ön ekin eksik olup olmadığına bakın',
        imgTipHeight: 'Tarayıcı bu biçimi önizleyemiyor, ama kopyalama ve dışa aktarma çalışır',
        imgTipTruncated: 'Önizleme kesildi: tam metin için dosyayı dışa aktarın',
        imgTipCopyTruncated: 'Önizleme kesildi: tam veri için «Dışa aktar»ı kullanın',
        imgTipCopied: 'Panoya kopyalandı',
        imgTipCopyTooBig: 'Çok büyük ({size}), dışa aktarmak daha iyi',
        imgTipExported: 'Dışa aktarıldı',
        imgTipCancelled: 'Dışa aktarma iptal edildi',
        imgTipExportFail: 'Dışa aktarma başarısız: {e}',
        imgTipEmpty: 'Dışa aktarılacak bir şey yok',
        imgEncoding: 'Dönüştürülüyor {n}%',
        imgMetaOriginal: 'Orijinal {size}',
        imgMetaImage: 'Görsel {size}',
        imgMetaData: 'Veri {size}',
        imgNoPreviewTitle: 'Önizleme yok',
        imgMetaB64: 'Base64 {n} karakter',
        imgMetaWarn: ' (+{n})',
        imgMetaType: '{mime}',
        imgMetaNoDims: 'boyut bilinmiyor',
        imgSampleUnsupported: 'Bu ortamda örnek görsel üretilemiyor',
        imgLightboxTip: 'Büyütmek için tıklayın',
        imgLightboxHint: 'Tekerlek ile yakınlaştır · çift tık 1:1 · Esc kapatır',
        imgLightboxClose: 'Kapat',
        imgLightboxActual: 'Gerçek boyut (1:1)'
    }
};

function imgT(key, fallback) {
    const table = IMG_I18N[currentLang] || {};
    return table[key] || IMG_I18N.en[key] || (currentDict && currentDict[key]) || fallback || key;
}

function imgTpl(key, fallback, vars) {
    let text = imgT(key, fallback);
    Object.keys(vars || {}).forEach((k) => {
        text = text.split('{' + k + '}').join(String(vars[k]));
    });
    return text;
}

const imageWorkspace = document.getElementById('imageWorkspace');
const navImageLink = document.getElementById('navImage');
const imgModeTabs = document.getElementById('imgModeTabs');
const imgFormatTabs = document.getElementById('imgFormat');
const imgSampleWrap = document.getElementById('imgSampleWrap');
const imgSampleBtn = document.getElementById('imgSample');
const imgDrop = document.getElementById('imgDrop');
const imgPreview = document.getElementById('imgPreview');
const imgNoPreview = document.getElementById('imgNoPreview');
const imgInputWrap = document.getElementById('imgInputWrap');
const imgInput = document.getElementById('imgInput');
const imgOutputWrap = document.getElementById('imgOutputWrap');
const imgOutput = document.getElementById('imgOutput');
const imgDecodeWrap = document.getElementById('imgDecodeWrap');
const imgDecodeImg = document.getElementById('imgDecodeImg');
const imgZoomBar = document.getElementById('imgZoomBar');
const imgZoomOutBtn = document.getElementById('imgZoomOut');
const imgZoomFitBtn = document.getElementById('imgZoomFit');
const imgZoomValue = document.getElementById('imgZoomValue');
const imgZoomInBtn = document.getElementById('imgZoomIn');
const imgLightbox = document.getElementById('imgLightbox');
const imgLightboxStage = document.getElementById('imgLightboxStage');
const imgLightboxImg = document.getElementById('imgLightboxImg');
const imgLightboxName = document.getElementById('imgLightboxName');
const imgLightboxZoom = document.getElementById('imgLightboxZoom');
const imgLightboxOutBtn = document.getElementById('imgLightboxOut');
const imgLightboxFitBtn = document.getElementById('imgLightboxFit');
const imgLightboxActualBtn = document.getElementById('imgLightboxActual');
const imgLightboxInBtn = document.getElementById('imgLightboxIn');
const imgLightboxCloseBtn = document.getElementById('imgLightboxClose');
const imgPickTop = document.getElementById('imgPickTop');
const imgPickBtn = document.getElementById('imgPick');
const imgCopyBtn = document.getElementById('imgCopy');
const imgExportBtn = document.getElementById('imgExport');
const imgClearBtn = document.getElementById('imgClear');
const imgInLabel = document.getElementById('imgInLabel');
const imgOutLabel = document.getElementById('imgOutLabel');
const imgInBadge = document.getElementById('imgInBadge');
const imgOutBadge = document.getElementById('imgOutBadge');
const imgOutSize = document.getElementById('imgOutSize');
const imgTip = document.getElementById('imgTip');
const imgProgress = document.getElementById('imgProgress');
const imgProgressFill = document.getElementById('imgProgressFill');
const imgLimitHint = document.getElementById('imgLimitHint');
const imgFileInput = document.getElementById('imgFileInput');
const imgTextInput = document.getElementById('imgTextInput');
const imgImportWrap = document.getElementById('imgImportWrap');
const imgImportBtn = document.getElementById('imgImport');
const imgMetaFile = document.getElementById('imgMetaFile');
const imgMetaSize = document.getElementById('imgMetaSize');
const imgMetaB64 = document.getElementById('imgMetaB64');
const imgMetaDims = document.getElementById('imgMetaDims');
const imgMetaTrunc = document.getElementById('imgMetaTrunc');

let imgModeActive = false;
let imgMode = 'encode';
let imgFormat = 'datauri';
let imgJob = 0;
let imgDecodeTimer = null;
let imgState = { name: '', mime: '', bytes: 0, base64: '', text: '', textLen: 0, width: 0, height: 0, truncated: false };
// 预览缩放：'fit'（适应）/ 'actual'（1:1）/ 具体倍率。只影响看，图片本身不动
let imgZoom = 'fit';
// base64 超过这个长度就不再常驻全量文本，全量留给导出时临时拼一次
const IMG_LAZY_TEXT = 2 * 1024 * 1024;
// 导入的 Base64 文本文件上限：14 M 字符的 ASCII 约 14 MB，留点余量后统一在入口拦下
const IMG_TEXT_FILE_MAX = 16 * 1024 * 1024;

function imgSetTip(text, kind) {
    imgTip.textContent = text || '';
    imgTip.className = 'compare-tip' + (kind ? ' ' + kind : '');
}

function imgProgressSet(ratio) {
    if (ratio == null) {
        imgProgress.hidden = true;
        imgProgressFill.style.width = '0%';
        return;
    }
    imgProgress.hidden = false;
    imgProgressFill.style.width = Math.max(0, Math.min(1, ratio)) * 100 + '%';
}

function imgResetState() {
    imgState = { name: '', mime: '', bytes: 0, base64: '', text: '', textLen: 0, width: 0, height: 0, truncated: false };
    imgReleasePreviewUrl();
    imgPreview.removeAttribute('src');
    imgPreview.hidden = true;
    imgNoPreview.hidden = true;
    imgDrop.classList.remove('has-image');
    imgDecodeImg.removeAttribute('src');
    imgOutput.value = '';
    imgOutput.classList.remove('has-content');
    imgInBadge.textContent = '—';
    imgOutBadge.textContent = '—';
    imgOutSize.textContent = '';
    imgMetaFile.textContent = '';
    imgMetaSize.textContent = '';
    imgMetaB64.textContent = '';
    imgMetaDims.textContent = '';
    imgMetaTrunc.hidden = true;
    imgZoom = 'fit';
    imgApplyZoom();
}

// 输出文本按当前格式重新拼：切格式不用重新编码
function imgFormatLabel() {
    if (imgFormat === 'raw') return imgT('imgFmtRaw', '纯 Base64');
    if (imgFormat === 'datauri') return 'DataURI';
    if (imgFormat === 'css') return 'CSS';
    if (imgFormat === 'html') return 'HTML';
    if (imgFormat === 'markdown') return 'Markdown';
    return imgFormat;
}

function imgUpdateExportLabel() {
    if (imgMode === 'encode') {
        imgExportBtn.textContent = imgT('imgExport', '导出') + ' .txt';
        imgExportBtn.title = imgT('imgExport', '导出') + ' ' + imgFormatLabel() + ' → ' +
            (imgFormat === 'raw' ? '.base64.txt' : '.txt');
        return;
    }
    imgExportBtn.textContent = imgT('imgExport', '导出') + ' ' + (imgState.mime
        ? DBXImg.extForMime(imgState.mime).toUpperCase()
        : 'BIN');
    imgExportBtn.title = imgState.mime || '';
}

function imgRenderOutput() {
    if (imgMode !== 'encode' || !imgState.base64) {
        imgOutput.value = '';
        imgOutput.classList.remove('has-content');
        imgOutBadge.textContent = '—';
        imgState.truncated = false;
        return;
    }
    if (imgState.base64.length > IMG_LAZY_TEXT) {
        // 大图先别拼全量字符串：10 MB 图 → 13.3 M 字符，拼一次常驻 27 MB，
        // 拼两次（原串 + dataURI）就 55 MB，宿主进程扛不住。
        // 预览只拼「切下来的这一段」，全量等导出时再拼。
        const slice = imgState.base64.slice(0, DBXImg.LIMITS.previewChars);
        const partial = DBXImg.buildText(slice, imgState.mime, imgFormat, {
            alt: imgState.name || 'image'
        });
        const overhead = DBXImg.buildText('', imgState.mime, imgFormat, {
            alt: imgState.name || 'image'
        }).length;
        imgState.text = '';
        imgState.textLen = imgState.base64.length + overhead;
        imgState.truncated = true;
        imgOutput.value = partial.slice(0, DBXImg.LIMITS.previewChars);
        imgOutput.classList.add('has-content');
        imgOutBadge.textContent = DBXImg.formatBytes(imgState.textLen);
        imgMetaTrunc.hidden = false;
        imgMetaTrunc.textContent = imgT('imgTipTruncated', '预览已截断，完整内容请导出文件查看');
        return;
    }
    imgState.text = DBXImg.buildText(imgState.base64, imgState.mime, imgFormat, {
        alt: imgState.name || 'image'
    });
    const preview = DBXImg.previewText(imgState.text);
    imgState.truncated = preview.truncated;
    imgState.textLen = imgState.text.length;
    imgOutput.value = preview.text;
    imgOutput.classList.toggle('has-content', !!preview.text);
    imgOutBadge.textContent = DBXImg.formatBytes(imgState.text.length);
    imgMetaTrunc.hidden = !preview.truncated;
    if (preview.truncated) imgMetaTrunc.textContent = imgT('imgTipTruncated', '预览已截断，完整内容请导出文件查看');
}

function imgRenderMeta() {
    const mime = imgState.mime || '';
    if (!mime && !imgState.bytes) {
        imgMetaFile.textContent = '';
        imgMetaSize.textContent = '';
        imgMetaB64.textContent = '';
        imgMetaDims.textContent = '';
        imgMetaTrunc.hidden = true;
        imgInBadge.textContent = '—';
        imgOutBadge.textContent = '—';
        imgOutSize.textContent = '';
        imgUpdateExportLabel();
        return;
    }
    imgMetaFile.textContent = imgState.name || '';
    if (imgMode === 'encode') {
        const grow = imgState.base64.length - imgState.bytes;
        const pct = imgState.bytes ? Math.round((grow / imgState.bytes) * 100) : 0;
        imgMetaSize.textContent = imgTpl('imgMetaOriginal', '原始 {size}', {
            size: DBXImg.formatBytes(imgState.bytes)
        });
        imgMetaB64.textContent = imgTpl('imgMetaB64', 'Base64 {n} 字符', {
            n: imgState.base64.length.toLocaleString('en-US')
        }) + (pct > 0 ? imgTpl('imgMetaWarn', '（+{n}）', { n: pct + '%' }) : '');
        imgInBadge.textContent = DBXImg.formatBytes(imgState.bytes);
        imgOutBadge.textContent = DBXImg.formatBytes(imgState.textLen || imgState.base64.length);
    } else {
        imgMetaSize.textContent = DBXImg.isImageMime(imgState.mime)
            ? imgTpl('imgMetaImage', '图片 {size}', { size: DBXImg.formatBytes(imgState.bytes) })
            : imgTpl('imgMetaData', '数据 {size}', { size: DBXImg.formatBytes(imgState.bytes) });
        imgMetaB64.textContent = imgTpl('imgMetaB64', 'Base64 {n} 字符', {
            n: imgState.base64.length.toLocaleString('en-US')
        });
        imgInBadge.textContent = DBXImg.formatBytes(imgInput.value.length);
        imgOutBadge.textContent = DBXImg.formatBytes(imgState.bytes);
    }
    imgMetaDims.textContent = imgState.width && imgState.height
        ? imgState.width + ' × ' + imgState.height
        : imgT('imgMetaNoDims', '尺寸未知');
    imgOutSize.textContent = imgState.width && imgState.height
        ? imgState.width + ' × ' + imgState.height
        : '';
    imgUpdateExportLabel();
}

let imgPreviewUrl = '';

function imgReleasePreviewUrl() {
    if (!imgPreviewUrl) return;
    try { URL.revokeObjectURL(imgPreviewUrl); } catch (e) { /* 已经释放过 */ }
    imgPreviewUrl = '';
}

// 优先 objectURL（不复制内容），拿不到再退回 dataURI
function imgShowPreviewOfFile(file, mime) {
    imgReleasePreviewUrl();
    try {
        if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
            imgPreviewUrl = URL.createObjectURL(file);
        }
    } catch (e) {
        imgPreviewUrl = '';
    }
    imgShowPreview(imgPreviewUrl || DBXImg.dataUriOf(imgState.base64, mime));
}

// ---------- 预览缩放（和图表页同一套：只缩放显示，不动原始像素） ----------

/** 当前该缩放哪张预览图：解码页优先（编码页左半边常驻另一张） */
function imgZoomTarget() {
    if (!imgDecodeWrap.hidden && imgDecodeImg.getAttribute('src')) return imgDecodeImg;
    if (!imgPreview.hidden && imgPreview.getAttribute('src')) return imgPreview;
    return null;
}

function imgFitScale(img) {
    const box = img.parentElement;
    const pad = 28;
    const aw = Math.max(((box && box.clientWidth) || 0) - pad, 40);
    const ah = Math.max(((box && box.clientHeight) || 0) - pad, 40);
    const nw = img.naturalWidth || 0;
    const nh = img.naturalHeight || 0;
    if (!nw || !nh) return 1;
    return Math.min(1, aw / nw, ah / nh);
}

function imgApplyZoom() {
    const img = imgZoomTarget();
    if (!img || !img.naturalWidth || !img.naturalHeight) {
        imgZoomBar.hidden = true;
        if (imgPreview.parentElement) imgPreview.parentElement.classList.remove('is-zoomed');
        imgDecodeWrap.classList.remove('is-zoomed');
        return;
    }
    imgZoomBar.hidden = false;
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    const fit = imgFitScale(img);
    const mode = imgZoom === 'fit' ? fit : (imgZoom === 'actual' ? 1 : Number(imgZoom) || 1);
    const k = Math.min(Math.max(mode, 0.05), 8);
    const zoomed = imgZoom !== 'fit';
    const box = img.parentElement;

    // 适应：交回 CSS（max-width/height 100%），浏览器等比缩，绝不拉伸
    // 放大：写死宽高（同比例），容器改成可滚动
    img.style.maxWidth = zoomed ? 'none' : '';
    img.style.maxHeight = zoomed ? 'none' : '';
    img.style.width = zoomed ? Math.round(nw * k) + 'px' : '';
    img.style.height = zoomed ? Math.round(nh * k) + 'px' : '';
    if (box) box.classList.toggle('is-zoomed', zoomed);

    imgZoomValue.textContent = Math.round(k * 100) + '%';
    imgZoomValue.classList.toggle('is-active', zoomed && k !== 1);
    imgZoomFitBtn.classList.toggle('is-active', imgZoom === 'fit');
}

function imgZoomStep(factor) {
    const img = imgZoomTarget();
    if (!img || !img.naturalWidth) return;
    const base = imgZoom === 'fit' ? imgFitScale(img)
        : (imgZoom === 'actual' ? 1 : (Number(imgZoom) || 1));
    imgZoom = Math.min(Math.max(base * factor, 0.05), 8);
    imgApplyZoom();
}

function imgZoomTo(mode) {
    imgZoom = mode;
    imgApplyZoom();
}

// ---------- 灯箱：点图看大图 ----------
// 面板里永远是「适应面板大小」的图，细节（文字、1px 边框、像素级差异）
// 只能靠整屏看。这里同样只改显示尺寸，复制 / 导出拿到的还是原始像素。

let lbZoom = 'fit';   // 'fit' | 数字
let lbOpener = null;  // 关闭后把焦点还回去，键盘用户不会掉到 body 上

function lbFitScale() {
    const nw = imgLightboxImg.naturalWidth || 0;
    const nh = imgLightboxImg.naturalHeight || 0;
    if (!nw || !nh) return 1;
    const aw = Math.max((imgLightboxStage.clientWidth || 0) - 32, 40);
    const ah = Math.max((imgLightboxStage.clientHeight || 0) - 32, 40);
    return Math.min(1, aw / nw, ah / nh);
}

function lbScaleNow() {
    const k = lbZoom === 'fit' ? lbFitScale() : Number(lbZoom);
    if (!isFinite(k) || k <= 0) return lbFitScale();
    return Math.min(Math.max(k, 0.05), 16);
}

function lbApply() {
    const nw = imgLightboxImg.naturalWidth || 0;
    const nh = imgLightboxImg.naturalHeight || 0;
    if (!nw || !nh) return;
    const k = lbScaleNow();
    // 宽高写死成等比缩放后的像素（不是 transform）：滚动条范围才对得上光标位置
    imgLightboxImg.style.width = Math.round(nw * k) + 'px';
    imgLightboxImg.style.height = Math.round(nh * k) + 'px';
    imgLightboxZoom.textContent = Math.round(k * 100) + '%';
    const actual = Math.abs(k - 1) < 0.005;
    imgLightboxImg.classList.toggle('is-actual', actual);
    imgLightboxFitBtn.classList.toggle('is-active', lbZoom === 'fit');
    imgLightboxActualBtn.classList.toggle('is-active', lbZoom !== 'fit' && actual);
}

/** 缩放到 next，并把 anchor（视口坐标）下面的那个像素留在原处 */
function lbSetScale(next, anchor) {
    const nw = imgLightboxImg.naturalWidth || 0;
    if (!nw) return;
    const before = lbScaleNow();
    const after = Math.min(Math.max(Number(next) || before, 0.05), 16);
    if (Math.abs(after - before) < 1e-6) return;
    const stage = imgLightboxStage;
    const rect = stage.getBoundingClientRect();
    const cx = anchor && typeof anchor.x === 'number' ? anchor.x - rect.left : rect.width / 2;
    const cy = anchor && typeof anchor.y === 'number' ? anchor.y - rect.top : rect.height / 2;
    const px = (stage.scrollLeft + cx) / before;
    const py = (stage.scrollTop + cy) / before;
    lbZoom = after;
    lbApply();
    stage.scrollLeft = px * after - cx;
    stage.scrollTop = py * after - cy;
}

/** 名称 · 尺寸 · 体积，一行说清「我在看哪张图」 */
function lbLabel(name, w, h, bytes) {
    const bits = [];
    if (name) bits.push(name);
    if (w && h) bits.push(w + ' × ' + h);
    if (bytes) bits.push(DBXImg.formatBytes(bytes));
    return bits.join(' · ');
}

function lbOpen(src, label, opener) {
    if (!src || !imgLightbox) return;
    lbZoom = 'fit';
    lbOpener = opener || null;
    imgLightboxName.textContent = label || '';
    imgLightboxName.hidden = !label;
    imgLightbox.hidden = false;
    imgLightboxImg.onload = () => lbApply();
    imgLightboxImg.src = src;
    // 同一张图刚看过时浏览器直接命中缓存，onload 不会再触发
    if (imgLightboxImg.complete && imgLightboxImg.naturalWidth) lbApply();
    if (imgLightboxStage.focus) imgLightboxStage.focus({ preventScroll: true });
}

function lbClose() {
    if (!imgLightbox || imgLightbox.hidden) return;
    imgLightbox.hidden = true;
    // 摘 src 只是停掉解码，原图有自己的 src，不受影响
    imgLightboxImg.removeAttribute('src');
    imgLightboxImg.style.width = '';
    imgLightboxImg.style.height = '';
    imgLightboxImg.classList.remove('is-actual');
    lbZoom = 'fit';
    if (lbOpener && lbOpener.focus) {
        try { lbOpener.focus({ preventScroll: true }); } catch (e) { /* 图可能已经被换掉 */ }
    }
    lbOpener = null;
}

function imgShowPreview(src) {
    const onLoad = () => {
        imgState.width = imgPreview.naturalWidth;
        imgState.height = imgPreview.naturalHeight;
        imgNoPreview.hidden = true;
        imgRenderMeta();
        imgZoom = 'fit';
        imgApplyZoom();
    };
    imgPreview.onload = onLoad;
    imgPreview.onerror = () => {
        // 格式不被浏览器支持（HEIC / 假图片）：换成占位文案，
        // 但提示语保留「已转换」——编码本身是成功的
        imgState.width = 0;
        imgState.height = 0;
        imgPreview.hidden = true;
        imgNoPreview.hidden = false;
        imgRenderMeta();
    };
    imgPreview.hidden = false;
    imgNoPreview.hidden = true;
    imgDrop.classList.add('has-image');
    imgPreview.src = src;
    // 有些环境里图片是同步就绪的，onload 不会再触发
    if (imgPreview.complete && imgPreview.naturalWidth) onLoad();
}

// 图片 → Base64：探测类型、卡体积、分块编码
async function imgOpenFile(file) {
    if (!file) return;
    const name = file.name || '';
    const looksImage = DBXImg.isImageMime(file.type) || /\.(png|jpe?g|gif|webp|bmp|ico|avif|svg)$/i.test(name);
    if (!looksImage && file.type && !/^image\//i.test(file.type)) {
        imgSetTip(imgT('imgTipNotImage', '这不是图片文件'), 'err');
        showToast(imgT('imgTipNotImage', '这不是图片文件'), 'error');
        return;
    }
    if (file.size > DBXImg.LIMITS.maxImageBytes) {
        imgSetTip(imgTpl('imgTipTooBig', '图片 {size}，超过 {max} 上限', {
            size: DBXImg.formatBytes(file.size),
            max: DBXImg.formatBytes(DBXImg.LIMITS.maxImageBytes)
        }), 'err');
        showToast(imgT('imgTipTooBig', '图片太大').replace('{size}', DBXImg.formatBytes(file.size))
            .replace('{max}', DBXImg.formatBytes(DBXImg.LIMITS.maxImageBytes)), 'error');
        return;
    }
    if (imgMode !== 'encode') return;
    const job = ++imgJob;
    imgProgressSet(0);
    imgSetTip('');
    try {
        const buffer = typeof file.arrayBuffer === 'function'
            ? await file.arrayBuffer()
            : await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(reader.error || new Error('read failed'));
                reader.readAsArrayBuffer(file);
            });
        if (job !== imgJob) return;
        const bytes = new Uint8Array(buffer);
        const mime = DBXImg.sniffMime(bytes) || file.type || 'application/octet-stream';
        const base64 = await DBXImg.bytesToBase64Async(bytes, {
            onProgress: (done, total) => {
                if (job !== imgJob) return;
                imgProgressSet(total ? done / total : 1);
                imgSetTip(imgTpl('imgEncoding', '正在转换 {n}%', {
                    n: Math.round((total ? done / total : 1) * 100)
                }));
            },
            isCancelled: () => job !== imgJob
        });
        if (job !== imgJob) return;
        imgState = {
            name: name || ('image.' + DBXImg.extForMime(mime)),
            mime: mime,
            bytes: bytes.length,
            base64: base64,
            text: '',
            width: 0,
            height: 0,
            truncated: false,
            textLen: 0
        };
        imgRenderOutput();
        // 预览用 File 的 objectURL：不用再把 13 M 字符的 base64
        // 拼成 dataURI 塞给 <img>，峰值内存能省一半
        imgShowPreviewOfFile(file, mime);
        imgRenderMeta();
        imgSetTip(imgTpl('imgTipReady', '已转换', {}) + ' · ' +
            DBXImg.formatBytes(bytes.length) + ' → ' +
            DBXImg.formatBytes(base64.length), 'ok');
    } catch (err) {
        if (err && err.cancelled) return;
        const message = String((err && err.message) || err);
        imgSetTip(message, 'err');
        console.error('[Image] encode failed:', err);
    } finally {
        if (job === imgJob) imgProgressSet(null);
    }
}

// 解码页的文件入口：文本文件当 Base64 读进来，图片自动转去编码页。
// 选择框、拖放都先过这里，判定只写一份
const IMG_TEXT_EXT = /\.(txt|b64|text|json|md|log|ya?ml|csv|env)$/i;

function imgLooksTextFile(file) {
    const type = (file.type || '').toLowerCase();
    if (/^text\//.test(type)) return true;
    if (type === 'application/json' || type === 'application/xml') return true;
    return !type && IMG_TEXT_EXT.test(file.name || '');
}

function imgImportFile(file) {
    if (!file) return;
    const name = file.name || '';
    const looksImage = DBXImg.isImageMime(file.type) ||
        /\.(png|jpe?g|gif|webp|bmp|ico|avif|svg)$/i.test(name);

    // 不做「按类型换页」：这一页的导入只认自己那一类，另一种只提示去哪一页，
    // 免得拖一次文件页面就被换走
    if (imgMode === 'encode') {
        if (!looksImage) {
            imgSetTip(imgT('imgDropTextInstead', '这是文本文件，请切到「Base64 转图片」页导入'), 'err');
            return;
        }
        imgOpenFile(file);
        return;
    }
    if (looksImage) {
        imgSetTip(imgT('imgImportImageInstead', '这是一张图片，请切到「图片转 Base64」页导入'), 'err');
        return;
    }
    if (file.size > IMG_TEXT_FILE_MAX) {
        imgSetTip(imgTpl('imgImportTooLarge', '文件 {size}，超过 {max} 上限', {
            size: DBXImg.formatBytes(file.size),
            max: DBXImg.formatBytes(IMG_TEXT_FILE_MAX)
        }), 'err');
        return;
    }
    if (!imgLooksTextFile(file)) {
        imgSetTip(imgT('imgImportNotText', '这不是文本文件，读不出 Base64'), 'err');
        return;
    }
    const job = ++imgJob;
    const reader = new FileReader();
    reader.onload = () => {
        if (job !== imgJob) return;
        const text = String(reader.result || '');
        if (!text.trim()) {
            imgSetTip(imgT('imgImportEmpty', '这个文件里没有内容'), 'err');
            return;
        }
        // 字节数过关不代表字符数过关（UTF-8 中文 1 字符占 3 字节）；
        // 超了就别塞进 textarea，否则 14 M 字符的框会先把页面拖慢
        if (text.length > DBXImg.LIMITS.maxBase64Chars) {
            imgSetTip(imgT('imgTipTooLong', 'Base64 文本太长，最多 14 MB（约 10 MB 图片）'), 'err');
            return;
        }
        imgInput.value = text;
        imgSetTip(imgTpl('imgImported', '已导入 {name} · {size}', {
            name: name || imgT('imgImportUntitled', '未命名文件'),
            size: DBXImg.formatBytes(file.size)
        }), 'ok');
        imgDecodeNow();
    };
    reader.onerror = () => {
        if (job !== imgJob) return;
        imgSetTip(imgT('imgImportFailed', '读取文件失败，换一个试试'), 'err');
    };
    reader.readAsText(file);
}

// Base64 → 图片：防抖解析，别每敲一个字符就解一遍
async function imgDecodeNow() {
    let raw = imgInput.value;
    if (!raw.trim()) {
        imgResetState();
        imgSetTip(imgT('imgTipIdleDecode', '贴一段 Base64，右边会显示图片'));
        return;
    }
    if (raw.length > DBXImg.LIMITS.maxBase64Chars) {
        // 不报具体体积：14 MB + 几字节也会被格式化成「14 MB」，反而看不懂
        imgSetTip(imgT('imgTipTooLong', 'Base64 文本太长，最多 14 MB（约 10 MB 图片）'), 'err');
        return;
    }
    // SVG 本来就是文本：贴源码也行，编码成 data URI 后走同一条渲染路径
    const svgSource = DBXImg.looksLikeSvgText(raw);
    if (svgSource) raw = DBXImg.dataUriOf(DBXImg.svgTextToBase64(raw), 'image/svg+xml');
    const parsed = DBXImg.parseInput(raw);
    if (parsed.kind !== 'base64' && parsed.kind !== 'datauri') {
        imgSetTip(imgT('imgTipBadInput', '识别不出 Base64，检查一下是不是漏了前缀'), 'err');
        imgDecodeImg.removeAttribute('src');
        imgOutBadge.textContent = '—';
        return;
    }
    const job = ++imgJob;
    try {
        const bytes = await DBXImg.base64ToBytesAsync(parsed.base64, {
            onProgress: (done, total) => {
                if (job !== imgJob) return;
                if (total > 2097152) imgProgressSet(done / total);
            },
            isCancelled: () => job !== imgJob
        });
        if (job !== imgJob) return;
        // 裸 Base64 没有 mime，只能靠魔数嗅探；嗅不出来就当二进制流，
        // 不硬塞 data:image/* 让 <img> 去猜（那样只会触发 onerror）
        const mime = (parsed.mime && DBXImg.isImageMime(parsed.mime))
            ? parsed.mime
            : (DBXImg.sniffMime(bytes) || parsed.mime || 'application/octet-stream');
        const asImage = DBXImg.isImageMime(mime);
        imgState = {
            name: (asImage ? 'image.' : 'data.') + DBXImg.extForMime(mime),
            mime: mime,
            bytes: bytes.length,
            base64: parsed.base64,
            text: '',
            width: 0,
            height: 0,
            truncated: false,
            textLen: 0
        };
        imgDecodeImg.onload = () => {
            imgState.width = imgDecodeImg.naturalWidth;
            imgState.height = imgDecodeImg.naturalHeight;
            imgZoom = 'fit';
            imgApplyZoom();
            imgRenderMeta();
        };
        imgDecodeImg.onerror = () => {
            imgState.width = 0;
            imgState.height = 0;
            imgRenderMeta();
            imgSetTip(imgT('imgTipHeight', '浏览器无法预览该格式，仍然可以复制 / 导出'), 'diff');
        };
        imgRenderMeta();
        if (!asImage) {
            // 解出来不是图片（很常见：把一段普通文本当成 Base64 贴进来）。
            // 别把 src 塞给 <img>，否则只会多一个碎图标
            imgDecodeImg.removeAttribute('src');
            imgState.width = 0;
            imgState.height = 0;
            imgRenderMeta();
            imgSetTip(imgTpl('imgTipNotImageData', '解析出的不是图片（{mime}），仍可导出', {
                mime: mime
            }), 'diff');
            return;
        }
        imgDecodeImg.src = DBXImg.dataUriOf(parsed.base64, mime);
        // 告诉用户这段是「带 data: 前缀」还是「裸 Base64」，省得以为只认 DataURI
        const kindLabel = svgSource
            ? imgT('imgKindSvg', 'SVG 源码')
            : (parsed.kind === 'datauri'
                ? imgT('imgKindDataUri', 'DataURI')
                : imgT('imgKindRaw', '裸 Base64'));
        imgSetTip(imgT('imgTipDecoded', '已识别') + ' · ' + kindLabel + ' · ' + mime + ' · ' +
            DBXImg.formatBytes(bytes.length), 'ok');
    } catch (err) {
        if (err && err.cancelled) return;
        imgSetTip(imgT('imgTipBadInput', '识别不出 Base64，检查一下是不是漏了前缀'), 'err');
    } finally {
        if (job === imgJob) imgProgressSet(null);
    }
}

function scheduleImgDecode() {
    clearTimeout(imgDecodeTimer);
    imgDecodeTimer = setTimeout(imgDecodeNow, 300);
}

function applyImgModeUi() {
    const isEncode = imgMode === 'encode';
    imgModeTabs.querySelectorAll('.compare-tab').forEach((tab) => {
        tab.classList.toggle('active', tab.dataset.mode === imgMode);
    });
    imgDrop.hidden = !isEncode;
    imgInputWrap.hidden = isEncode;
    imgOutputWrap.hidden = !isEncode;
    imgDecodeWrap.hidden = isEncode;
    imgFormatTabs.hidden = !isEncode;
    imgFormatTabs.parentNode.querySelector('[data-i18n="imgFormatLabel"]').hidden = !isEncode;
    imgSampleWrap.hidden = !isEncode;
    imgImportWrap.hidden = isEncode;
    imgCopyBtn.hidden = !isEncode;
    imgPickTop.hidden = !isEncode;
    imgInLabel.textContent = isEncode
        ? imgT('imgInputTitle', '上传或粘贴图片')
        : imgT('imgInputTitleB64', 'Base64 数据');
    imgInLabel.setAttribute('data-i18n', isEncode ? 'imgInputTitle' : 'imgInputTitleB64');
    imgOutLabel.textContent = isEncode
        ? imgT('imgResultTitle', '转换结果')
        : imgT('imgPreviewTitle', '预览结果');
    imgOutLabel.setAttribute('data-i18n', isEncode ? 'imgResultTitle' : 'imgPreviewTitle');
    imgInput.placeholder = imgT('imgPlaceholderDecode', '在这里粘贴 DataURI 或 Base64…');
    const hintKey = isEncode ? 'imgLimitHint' : 'imgLimitHintDecode';
    imgLimitHint.textContent = isEncode
        ? imgT('imgLimitHint', '单张 ≤ 10 MB · Base64 体积约 +33%')
        : imgT('imgLimitHintDecode', '支持 DataURI / 裸 Base64 / 文本文件 · 最大 14 M 字符');
    // data-i18n 也要跟着换，否则切语言时会被 encode 的文案覆盖回去
    imgLimitHint.setAttribute('data-i18n', hintKey);
    imgExportBtn.textContent = isEncode
        ? imgT('imgExport', '导出') + ' .txt'
        : imgT('imgExport', '导出') + ' ' + (imgState.mime
            ? DBXImg.extForMime(imgState.mime).toUpperCase()
            : 'BIN');
    imgRenderMeta();
    if (isEncode) {
        if (!imgState.base64) imgSetTip(imgT('imgTipIdle', '还没有图片'));
        imgRenderOutput();
    } else {
        imgOutput.value = '';
        if (!imgInput.value.trim()) imgSetTip(imgT('imgTipIdleDecode', '贴一段 Base64，右边会显示图片'));
    }
    // 两侧预览高度不同，切模式后重新算一次缩放
    requestAnimationFrame(() => imgApplyZoom());
}

function setImgMode(mode) {
    if (mode !== 'encode' && mode !== 'decode') return;
    if (imgMode === mode) {
        applyImgModeUi();
        return;
    }
    imgMode = mode;
    ++imgJob;
    imgProgressSet(null);
    imgResetState();
    if (mode === 'decode') {
        // 回到解码页时把上次的图清掉，避免误以为已经解析出结果
        imgDecodeImg.removeAttribute('src');
        if (imgInput.value.trim()) imgDecodeNow();
    }
    applyImgModeUi();
    if (mode === 'decode') {
        requestAnimationFrame(() => imgInput.focus());
    }
}

function setImgFormat(format) {
    if (DBXImg.FORMATS.indexOf(format) < 0) return;
    imgFormat = format;
    imgFormatTabs.querySelectorAll('.compare-tab').forEach((tab) => {
        tab.classList.toggle('active', tab.dataset.format === format);
    });
    if (imgMode === 'encode') {
        imgRenderOutput();
        imgUpdateExportLabel();
    }
}

function enterImageMode() {
    exitOtherModes('image');
    if (isDiffMode) {
        isDiffMode = false;
        diffReport.classList.remove('show');
        diffWorkspace.classList.remove('active');
        toggleDiffBtn.textContent = currentDict.diffBtn || '对比差异';
        toggleDiffBtn.classList.remove('btn-diff');
    }
    imgModeActive = true;
    markConvertActive(null);
    mainWorkspace.classList.add('hidden');
    toolbarEl.classList.add('hidden');
    imageWorkspace.classList.add('active');
    navImageLink.classList.add('active');
    applyImgModeUi();
    requestAnimationFrame(() => {
        imgOutput.scrollTop = 0;
    });
}

function exitImageMode() {
    if (!imgModeActive) return;
    imgModeActive = false;
    ++imgJob;
    imageWorkspace.classList.remove('active');
    navImageLink.classList.remove('active');
    toolbarEl.classList.remove('hidden');
    mainWorkspace.classList.remove('hidden');
    requestAnimationFrame(() => {
        inputEditor.refresh();
        outputEditor.refresh();
    });
}

// 宿主保存通道只认 base64 分片，正好省掉二次编码
function saveBinaryFile(name, base64, mime) {
    const ft = getHostFileTransfer();
    if (!ft) {
        return Promise.resolve(browserSaveBinary(name, base64, mime) ? 'browser' : 'failed');
    }
    let savePromise;
    try {
        savePromise = ft.beginSave({ name: name, contentType: mime });
    } catch (err) {
        console.error('[Save] beginSave() threw synchronously:', err);
        return Promise.resolve(browserSaveBinary(name, base64, mime) ? 'browser' : 'failed');
    }
    return (async () => {
        let handleId = null;
        try {
            const handle = await savePromise;
            if (!handle || !handle.handleId) return 'cancelled';
            handleId = handle.handleId;
            const chunkBytes = handle.chunkBytes > 0 ? handle.chunkBytes : 1024 * 1024;
            // 每片必须是 4 字符的倍数，否则拼起来不是合法 Base64
            let chunkChars = Math.floor(chunkBytes / 3) * 4;
            if (chunkChars < 4) chunkChars = 4;
            let byteOffset = 0;
            for (let i = 0; i < base64.length; i += chunkChars) {
                const piece = base64.slice(i, i + chunkChars);
                await ft.write(handleId, byteOffset, piece);
                const pad = piece.endsWith('==') ? 2 : (piece.endsWith('=') ? 1 : 0);
                byteOffset += (piece.length / 4) * 3 - pad;
            }
            await ft.finish(handleId);
            handleId = null;
            return 'host';
        } catch (err) {
            if (handleId && typeof ft.cancel === 'function') {
                try { await ft.cancel(handleId); } catch (e) { /* 句柄可能已经关了 */ }
            }
            console.error('[Save] host save failed, fallback to download:', err);
            return browserSaveBinary(name, base64, mime) ? 'browser' : 'failed';
        }
    })();
}

async function imgCopy() {
    if (imgMode === 'decode') {
        showToast(imgT('imgTipEmpty', '还没有可导出的内容'), 'error');
        return;
    }
    // 预览是截断的：剪贴板里放全量文本既慢又容易失败，
    // 干脆别假装复制成功，直接引导去导出（大图的文本此时也没拼）
    if (imgState.truncated || (imgState.base64 && !imgState.text)) {
        showToast(imgT('imgTipCopyTruncated', '预览已截断，完整数据请点「导出」保存文件后查看'), 'error');
        return;
    }
    if (!imgState.text) {
        showToast(imgT('imgTipEmpty', '还没有可导出的内容'), 'error');
        return;
    }
    // 剪贴板塞 10 MB 文本在部分环境会直接失败，先给个更实际的建议
    if (imgState.text.length > 8 * 1024 * 1024) {
        showToast(imgTpl('imgTipCopyTooBig', '内容太大（{size}），建议直接导出', {
            size: DBXImg.formatBytes(imgState.text.length)
        }), 'error');
        return;
    }
    try {
        await writeClipboardText(imgState.text);
        showToast(imgT('imgTipCopied', '已复制到剪贴板'));
    } catch (err) {
        showToast(currentDict.toastCopyError || '复制失败', 'error');
    }
}

async function imgExportCurrent() {
    imgExportBtn.disabled = true;
    try {
        if (imgMode === 'encode') {
            if (!imgState.base64) {
                showToast(imgT('imgTipEmpty', '还没有可导出的内容'), 'error');
                return;
            }
            const base = (imgState.name || 'image').replace(/\.[^.]+$/, '') || 'image';
            // 纯 Base64 单独用 .base64.txt，免得跟 DataURI 的 .txt 混在一起分不清
            const suffix = imgFormat === 'raw' ? '.base64.txt' : '.txt';
            // 大图的文本平时不驻留内存，这里临时拼一次；拼完立刻放掉
            let text = imgState.text;
            if (!text) {
                imgExportBtn.textContent = imgT('imgEncoding', '正在转换 {n}%').replace('{n}', '100');
                await new Promise((resolve) => setTimeout(resolve, 30));
                text = DBXImg.buildText(imgState.base64, imgState.mime, imgFormat, {
                    alt: imgState.name || 'image'
                });
            }
            const status = await saveTextFile(base + suffix, text, 'text/plain;charset=utf-8');
            imgState.text = text.length <= IMG_LAZY_TEXT ? text : '';
            saveToast(status, imgT('imgTipExported', '已导出') + ' · ' + imgFormatLabel() + ' · ' +
                base + suffix);
        } else {
            if (!imgState.base64) {
                showToast(imgT('imgTipEmpty', '还没有可导出的内容'), 'error');
                return;
            }
            const name = imgState.name || ('image.' + DBXImg.extForMime(imgState.mime));
            const status = await saveBinaryFile(name, imgState.base64, imgState.mime || 'application/octet-stream');
            saveToast(status, imgT('imgTipExported', '已导出') + ' · ' + name);
        }
    } catch (err) {
        const message = String((err && err.message) || err);
        showToast(imgTpl('imgTipExportFail', '导出失败：{e}', { e: message }), 'error');
    } finally {
        imgExportBtn.disabled = false;
    }
}

function refreshImgI18n() {
    if (!imgModeActive) return;
    applyImgModeUi();
    if (imgMode === 'encode') imgRenderOutput();
}

// 示例图：画一张带渐变的小卡片，省得用户还要先找图。
// 用 JPEG 而不是 PNG：平滑渐变存 PNG 会膨胀到 160 KB 以上，
// 一上来就撞到「预览截断」，示例反而不好用
function imgMakeSample() {
    const canvas = document.createElement('canvas');
    if (!canvas.getContext || !canvas.getContext('2d')) {
        showToast(imgT('imgSampleUnsupported', '当前环境不支持生成示例图'), 'error');
        return;
    }
    const w = 480;
    const h = 300;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#6366f1');
    grad.addColorStop(1, '#22d3ee');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.94)';
    ctx.font = '600 34px -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Base64', w / 2, h / 2 - 6);
    ctx.font = '400 16px -apple-system, "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    ctx.fillText('480 × 300 · sample.jpg', w / 2, h / 2 + 30);

    const mime = 'image/jpeg';
    const quality = 0.82;
    const openBytes = (bytes) => {
        imgOpenFile(new File([bytes], 'sample.jpg', { type: mime }));
    };
    // 先走同步的 toDataURL：不依赖异步回调，任何环境都拿得到
    try {
        const dataUri = canvas.toDataURL(mime, quality);
        const comma = dataUri ? dataUri.indexOf(',') : -1;
        if (comma > 0) {
            openBytes(DBXImg.base64ToBytes(dataUri.slice(comma + 1)));
            return;
        }
    } catch (err) {
        // 被 tainted / 不支持，落到 toBlob
    }
    if (typeof canvas.toBlob === 'function') {
        canvas.toBlob((blob) => {
            if (!blob) {
                showToast(imgT('imgSampleUnsupported', '当前环境不支持生成示例图'), 'error');
                return;
            }
            // File 直接吃 blob，省一次拷贝
            imgOpenFile(new File([blob], 'sample.jpg', { type: mime }));
        }, mime, quality);
        return;
    }
    showToast(imgT('imgSampleUnsupported', '当前环境不支持生成示例图'), 'error');
}

imgModeTabs.addEventListener('click', (e) => {
    const tab = e.target.closest('.compare-tab');
    if (tab) setImgMode(tab.dataset.mode);
});
imgFormatTabs.addEventListener('click', (e) => {
    const tab = e.target.closest('.compare-tab');
    if (tab) setImgFormat(tab.dataset.format);
});
imgPickBtn.addEventListener('click', () => imgFileInput.click());
imgPickTop.addEventListener('click', () => imgFileInput.click());
imgFileInput.addEventListener('change', () => {
    const file = imgFileInput.files && imgFileInput.files[0];
    if (file) imgImportFile(file);
    imgFileInput.value = '';
});
// 解码页的「导入文件」：导出的 .txt / .b64 直接读回来，和导出闭环
imgImportBtn.addEventListener('click', () => imgTextInput.click());
imgTextInput.addEventListener('change', () => {
    const file = imgTextInput.files && imgTextInput.files[0];
    if (file) imgImportFile(file);
    imgTextInput.value = '';
});
imgSampleBtn.addEventListener('click', imgMakeSample);
imgCopyBtn.addEventListener('click', imgCopy);
imgExportBtn.addEventListener('click', imgExportCurrent);
imgClearBtn.addEventListener('click', () => {
    ++imgJob;
    clearTimeout(imgDecodeTimer);
    imgResetState();
    imgInput.value = '';
    imgSetTip(imgMode === 'encode'
        ? imgT('imgTipIdle', '还没有图片')
        : imgT('imgTipIdleDecode', '贴一段 Base64，右边会显示图片'));
    applyImgModeUi();
});
imgInput.addEventListener('input', scheduleImgDecode);

// 粘贴截图：编码页直接吃图片；解码页的粘贴交给 textarea 自己
document.addEventListener('paste', (e) => {
    if (!imgModeActive || imgMode !== 'encode') return;
    const target = e.target;
    if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')) return;
    const items = (e.clipboardData && e.clipboardData.items) || [];
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file' && /^image\//i.test(item.type)) {
            const file = item.getAsFile();
            if (file) {
                e.preventDefault();
                imgOpenFile(file);
                return;
            }
        }
    }
    // 编码页也可能被贴进来一段裸 Base64（用户其实想看图）：识别到就切解码
    const text = (e.clipboardData && typeof e.clipboardData.getData === 'function')
        ? e.clipboardData.getData('text')
        : '';
    if (text && text.trim().length >= 64) {
        const guess = DBXImg.parseInput(text);
        if (guess.kind === 'base64' || guess.kind === 'datauri') {
            e.preventDefault();
            imgInput.value = text.trim();
            setImgMode('decode');
            showToast(imgT('imgTipPastedB64', '识别到 Base64，已切到解码'));
        }
    }
});

['dragenter', 'dragover'].forEach((type) => {
    imgDrop.addEventListener(type, (e) => {
        e.preventDefault();
        imgDrop.classList.add('dragover');
    });
});
['dragleave', 'dragend'].forEach((type) => {
    imgDrop.addEventListener(type, () => imgDrop.classList.remove('dragover'));
});
imgDrop.addEventListener('drop', (e) => {
    e.preventDefault();
    imgDrop.classList.remove('dragover');
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) imgImportFile(file);
});
// 解码页也能直接丢：图片转去编码，文本文件读进来当 Base64
imgInputWrap.addEventListener('dragover', (e) => e.preventDefault());
imgInputWrap.addEventListener('drop', (e) => {
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!file) return;
    e.preventDefault();
    imgImportFile(file);
});

// =========================================
