/* 13-sheet.js — 表格转 JSON 页（Excel / CSV） */
// 9. 表格转 JSON 页（Excel / CSV → JSON）
// =========================================
// 和 SQL 页一样，这一页的文案单独放一张小表，缺哪种语言就回退 en
const SHEET_I18N = {
    'zh-CN': {
        navSheet: '表格转 JSON',
        sheetPick: '选择 Excel / CSV 文件',
        sheetNoFile: '未选择文件',
        sheetSamples: '示例',
        sheetSampleSimple: '简单表格',
        sheetSampleUsers: '用户信息',
        sheetSampleScores: '成绩单',
        sheetPreview: '数据预览',
        sheetOutput: 'JSON 输出',
        sheetOutJson: 'JSON 输出',
        sheetOutSql: 'SQL Insert 输出',
        sheetTableName: '表名',
        sheetExportSql: '导出 SQL',
        sheetToastExportedSql: '已导出 SQL 文件',
        sheetExport: '导出 JSON',
        sheetHeader: '首行为表头',
        sheetSkipNote: '第二行为注释',
        sheetNoteHint: '第二行疑似说明，跳过？',
        sheetTipSkippedNote: '已跳过第二行说明',
        sheetCellRow: '第 {n} 条',
        sheetCellHeaderRow: '表头行',
        sheetCellEmpty: '（空）',
        sheetCellRowData: '整行数据',
        sheetCellCopy: '复制',
        sheetCellHint: '双击其他单元格可继续查看',
        sheetDelimLabel: '分隔符',
        sheetDelimAuto: '自动',
        sheetNumbers: '数字识别',
        sheetBools: '布尔识别',
        sheetLimitLabel: '最多条数',
        sheetLimitAll: '全部',
        sheetFormatPretty: '格式化',
        sheetFormatCompact: '紧凑',
        sheetLimitHint: '单文件 ≤ 20 MB · 最多 10 万行',
        sheetEmptyHint: '选择文件，或把 CSV / Excel 拖到这里',
        sheetTipIdle: '支持 .xlsx / .csv / .tsv，全程本地解析，不上传任何数据',
        sheetTipParsing: '解析中…',
        sheetTipJson: '正在生成 JSON {p}%',
        sheetTipSql: '正在生成 SQL {p}%',
        sheetTipDone: '{n} 条记录 · {c} 列 · {s}',
        sheetTipLimited: '已限制为前 {n} 条（共 {m} 条），导出同样是 {n} 条',
        sheetTipEmpty: '没有解析到数据，检查一下分隔符或表头设置',
        sheetTipTooBig: '文件 {s} 超过 {m} 上限，请先拆分再转换',
        sheetTipBadType: '不支持该文件类型，请选择 .xlsx / .csv / .tsv',
        sheetTipXls: '旧版 .xls 暂不支持，请在 Excel 里另存为 .xlsx 或 .csv',
        sheetTipNoZip: '当前环境不支持解压 xlsx，请另存为 CSV 后再转换',
        sheetTipTruncated: '已按上限截断，只转换前 {n} 行',
        sheetTipPreview: '预览已截断，复制 / 导出仍是完整内容',
        sheetToastExported: '已导出 JSON 文件',
        sheetToastExporting: '正在保存…',
        sheetToastExportCancel: '已取消导出',
        sheetToastExportFail: '导出失败：{e}',
        sheetToastBusy: '正在生成 JSON，请稍候再导出',
        sheetToastEmpty: '还没有可导出的内容',
        sheetRowsMore: '还有 {n} 行未显示',
        sheetParseFailed: '解析失败：{e}'
    },
    'zh-TW': {
        navSheet: '表格轉 JSON',
        sheetPick: '選擇 Excel / CSV 檔案',
        sheetNoFile: '未選擇檔案',
        sheetSamples: '範例',
        sheetSampleSimple: '簡單表格',
        sheetSampleUsers: '使用者資訊',
        sheetSampleScores: '成績單',
        sheetPreview: '資料預覽',
        sheetOutput: 'JSON 輸出',
        sheetOutJson: 'JSON 輸出',
        sheetOutSql: 'SQL Insert 輸出',
        sheetTableName: '表名',
        sheetExportSql: '匯出 SQL',
        sheetToastExportedSql: '已匯出 SQL 檔案',
        sheetExport: '匯出 JSON',
        sheetHeader: '首列為表頭',
        sheetSkipNote: '第二列為註解',
        sheetNoteHint: '第二列疑似說明，跳過？',
        sheetTipSkippedNote: '已跳過第二列說明',
        sheetCellRow: '第 {n} 筆',
        sheetCellHeaderRow: '表頭列',
        sheetCellEmpty: '（空）',
        sheetCellRowData: '整列資料',
        sheetCellCopy: '複製',
        sheetCellHint: '雙擊其他儲存格可繼續查看',
        sheetDelimLabel: '分隔符',
        sheetDelimAuto: '自動',
        sheetNumbers: '數字辨識',
        sheetBools: '布林辨識',
        sheetLimitLabel: '最多筆數',
        sheetLimitAll: '全部',
        sheetFormatPretty: '格式化',
        sheetFormatCompact: '緊湊',
        sheetLimitHint: '單檔 ≤ 20 MB · 最多 10 萬列',
        sheetEmptyHint: '選擇檔案，或把 CSV / Excel 拖到這裡',
        sheetTipIdle: '支援 .xlsx / .csv / .tsv，全程本機解析，不上傳任何資料',
        sheetTipParsing: '解析中…',
        sheetTipJson: '正在產生 JSON {p}%',
        sheetTipSql: '正在產生 SQL {p}%',
        sheetTipDone: '{n} 筆記錄 · {c} 欄 · {s}',
        sheetTipLimited: '已限制為前 {n} 筆（共 {m} 筆），匯出同樣是 {n} 筆',
        sheetTipEmpty: '沒有解析到資料，檢查一下分隔符或表頭設定',
        sheetTipTooBig: '檔案 {s} 超過 {m} 上限，請先拆分再轉換',
        sheetTipBadType: '不支援該檔案類型，請選擇 .xlsx / .csv / .tsv',
        sheetTipXls: '舊版 .xls 暫不支援，請在 Excel 裡另存為 .xlsx 或 .csv',
        sheetTipNoZip: '目前環境不支援解壓 xlsx，請另存為 CSV 後再轉換',
        sheetTipTruncated: '已依上限截斷，只轉換前 {n} 列',
        sheetTipPreview: '預覽已截斷，複製 / 匯出仍是完整內容',
        sheetToastExported: '已匯出 JSON 檔案',
        sheetToastExporting: '正在儲存…',
        sheetToastExportCancel: '已取消匯出',
        sheetToastExportFail: '匯出失敗：{e}',
        sheetToastBusy: '正在產生 JSON，請稍候再匯出',
        sheetToastEmpty: '還沒有可匯出的內容',
        sheetRowsMore: '還有 {n} 列未顯示',
        sheetParseFailed: '解析失敗：{e}'
    },
    en: {
        navSheet: 'Sheet to JSON',
        sheetPick: 'Choose Excel / CSV',
        sheetNoFile: 'No file selected',
        sheetSamples: 'Examples',
        sheetSampleSimple: 'Simple table',
        sheetSampleUsers: 'Users',
        sheetSampleScores: 'Scores',
        sheetPreview: 'Preview',
        sheetOutput: 'JSON output',
        sheetOutJson: 'JSON output',
        sheetOutSql: 'SQL Insert output',
        sheetTableName: 'Table',
        sheetExportSql: 'Export SQL',
        sheetToastExportedSql: 'SQL file exported',
        sheetExport: 'Export JSON',
        sheetHeader: 'First row is header',
        sheetSkipNote: 'Row 2 is a note',
        sheetNoteHint: 'Row 2 looks like a note — skip it?',
        sheetTipSkippedNote: 'Row 2 note skipped',
        sheetCellRow: 'Record {n}',
        sheetCellHeaderRow: 'Header row',
        sheetCellEmpty: '(empty)',
        sheetCellRowData: 'Whole row',
        sheetCellCopy: 'Copy',
        sheetCellHint: 'Double-click another cell to keep looking',
        sheetDelimLabel: 'Delimiter',
        sheetDelimAuto: 'Auto',
        sheetNumbers: 'Detect numbers',
        sheetBools: 'Detect booleans',
        sheetLimitLabel: 'Max records',
        sheetLimitAll: 'All',
        sheetFormatPretty: 'Formatted',
        sheetFormatCompact: 'Compact',
        sheetLimitHint: '≤ 20 MB per file · up to 100k rows',
        sheetEmptyHint: 'Choose a file, or drop a CSV / Excel here',
        sheetTipIdle: '.xlsx / .csv / .tsv — parsed locally, nothing is uploaded',
        sheetTipParsing: 'Parsing…',
        sheetTipJson: 'Building JSON {p}%',
        sheetTipSql: 'Building SQL {p}%',
        sheetTipDone: '{n} record(s) · {c} column(s) · {s}',
        sheetTipLimited: 'Limited to the first {n} of {m} records — export also has {n}',
        sheetTipEmpty: 'No rows parsed — check the delimiter or header option',
        sheetTipTooBig: 'File is {s}, above the {m} limit — split it first',
        sheetTipBadType: 'Unsupported file type, please pick .xlsx / .csv / .tsv',
        sheetTipXls: 'Legacy .xls is not supported — save as .xlsx or .csv first',
        sheetTipNoZip: 'This environment cannot unzip xlsx — please save as CSV',
        sheetTipTruncated: 'Truncated to the first {n} rows',
        sheetTipPreview: 'Preview truncated — copy / export still contains everything',
        sheetToastExported: 'JSON file exported',
        sheetToastExporting: 'Saving…',
        sheetToastExportCancel: 'Export cancelled',
        sheetToastExportFail: 'Export failed: {e}',
        sheetToastBusy: 'Still building JSON — try exporting in a moment',
        sheetToastEmpty: 'Nothing to export yet',
        sheetRowsMore: '{n} more row(s) not shown',
        sheetParseFailed: 'Parse failed: {e}'
    }
,
    'az': {
        navSheet: 'Cədvəldən JSON',
        sheetPick: 'Excel / CSV faylı seç',
        sheetNoFile: 'Fayl seçilməyib',
        sheetSamples: 'Nümunələr',
        sheetSampleSimple: 'Sadə cədvəl',
        sheetSampleUsers: 'İstifadəçi məlumatı',
        sheetSampleScores: 'Qiymət cədvəli',
        sheetPreview: 'Məlumat önizləməsi',
        sheetOutput: 'JSON çıxışı',
        sheetOutJson: 'JSON çıxışı',
        sheetOutSql: 'SQL Insert çıxışı',
        sheetTableName: 'Cədvəl adı',
        sheetExportSql: 'SQL ixrac et',
        sheetToastExportedSql: 'SQL faylı ixrac edildi',
        sheetExport: 'JSON ixrac et',
        sheetHeader: 'Birinci sətir başlıqdır',
        sheetSkipNote: 'İkinci sətir qeyddir',
        sheetNoteHint: 'İkinci sətir izaha bənzəyir — keçilsin?',
        sheetTipSkippedNote: 'İkinci sətir (izah) keçildi',
        sheetCellRow: '{n}-ci sətir',
        sheetCellHeaderRow: 'Başlıq sətri',
        sheetCellEmpty: '(boş)',
        sheetCellRowData: 'Bütün sətir',
        sheetCellCopy: 'Kopyala',
        sheetCellHint: 'Digər xanalara baxmaq üçün iki dəfə klikləyin',
        sheetDelimLabel: 'Ayırıcı',
        sheetDelimAuto: 'Avtomatik',
        sheetNumbers: 'Rəqəm tanıma',
        sheetBools: 'Məntiqi dəyər tanıma',
        sheetLimitLabel: 'Maksimum sətir',
        sheetLimitAll: 'Hamısı',
        sheetFormatPretty: 'Formatlanmış',
        sheetFormatCompact: 'Sıx',
        sheetLimitHint: 'Fayl başına ≤ 20 MB · ən çoxu 100 000 sətir',
        sheetEmptyHint: 'Fayl seçin və ya CSV / Excel-i buraya dartın',
        sheetTipIdle: '.xlsx / .csv / .tsv dəstəklənir — hər şey yerli emal olunur, heç bir məlumat yüklənmir',
        sheetTipParsing: 'Emal olunur…',
        sheetTipJson: 'JSON yaradılır {p}%',
        sheetTipSql: 'SQL yaradılır {p}%',
        sheetTipDone: '{n} qeyd · {c} sütun · {s}',
        sheetTipLimited: 'İlk {n} qeydlə məhdudlaşdırıldı (cəmi {m}), ixrac da {n} qeyd olacaq',
        sheetTipEmpty: 'Məlumat tapılmadı — ayırıcı və başlıq ayarlarını yoxlayın',
        sheetTipTooBig: 'Fayl {s}, {m} limitindən böyükdür — əvvəlcə bölün',
        sheetTipBadType: 'Bu fayl növü dəstəklənmir — .xlsx / .csv / .tsv seçin',
        sheetTipXls: 'Köhnə .xls dəstəklənmir — Excel-də .xlsx və ya .csv kimi saxlayın',
        sheetTipNoZip: 'Bu mühit xlsx açmağı dəstəkləmir — CSV kimi saxlayıb yenidən cəhd edin',
        sheetTipTruncated: 'Limitə görə kəsildi — yalnız ilk {n} sətir çevrildi',
        sheetTipPreview: 'Önizləmə kəsildi, kopyalama / ixrac tam məzmunu verir',
        sheetToastExported: 'JSON faylı ixrac edildi',
        sheetToastExporting: 'Saxlanılır…',
        sheetToastExportCancel: 'İxrac ləğv edildi',
        sheetToastExportFail: 'İxrac alınmadı: {e}',
        sheetToastBusy: 'JSON hələ yaradılır — bir az sonra ixrac edin',
        sheetToastEmpty: 'İxrac üçün heç nə yoxdur',
        sheetRowsMore: '{n} sətir hələ göstərilməyib',
        sheetParseFailed: 'Emal alınmadı: {e}'
    },
    'es': {
        navSheet: 'Hoja a JSON',
        sheetPick: 'Elegir archivo Excel / CSV',
        sheetNoFile: 'Ningún archivo',
        sheetSamples: 'Ejemplos',
        sheetSampleSimple: 'Tabla simple',
        sheetSampleUsers: 'Usuarios',
        sheetSampleScores: 'Notas',
        sheetPreview: 'Vista previa de datos',
        sheetOutput: 'Salida JSON',
        sheetOutJson: 'Salida JSON',
        sheetOutSql: 'Salida SQL Insert',
        sheetTableName: 'Nombre de tabla',
        sheetExportSql: 'Exportar SQL',
        sheetToastExportedSql: 'Archivo SQL exportado',
        sheetExport: 'Exportar JSON',
        sheetHeader: 'La primera fila es cabecera',
        sheetSkipNote: 'La segunda fila es una nota',
        sheetNoteHint: 'La segunda fila parece una descripción, ¿omitirla?',
        sheetTipSkippedNote: 'Segunda fila (descripción) omitida',
        sheetCellRow: 'Fila {n}',
        sheetCellHeaderRow: 'Fila de cabecera',
        sheetCellEmpty: '(vacío)',
        sheetCellRowData: 'Fila completa',
        sheetCellCopy: 'Copiar',
        sheetCellHint: 'Haz doble clic en otra celda para seguir viendo',
        sheetDelimLabel: 'Delimitador',
        sheetDelimAuto: 'Automático',
        sheetNumbers: 'Detectar números',
        sheetBools: 'Detectar booleanos',
        sheetLimitLabel: 'Máximo de filas',
        sheetLimitAll: 'Todas',
        sheetFormatPretty: 'Formateado',
        sheetFormatCompact: 'Compacto',
        sheetLimitHint: 'Un archivo ≤ 20 MB · máximo 100 000 filas',
        sheetEmptyHint: 'Elige un archivo o arrastra CSV / Excel aquí',
        sheetTipIdle: '.xlsx / .csv / .tsv compatibles; todo se procesa localmente, sin subir datos',
        sheetTipParsing: 'Procesando…',
        sheetTipJson: 'Generando JSON {p}%',
        sheetTipSql: 'Generando SQL {p}%',
        sheetTipDone: '{n} registros · {c} columnas · {s}',
        sheetTipLimited: 'Limitado a los primeros {n} registros (de {m}); la exportación también lleva {n}',
        sheetTipEmpty: 'No se encontraron datos: revisa el delimitador o la cabecera',
        sheetTipTooBig: 'El archivo {s} supera el límite de {m}; divídelo primero',
        sheetTipBadType: 'Tipo de archivo no compatible: elige .xlsx / .csv / .tsv',
        sheetTipXls: 'El .xls antiguo no está soportado: guárdalo como .xlsx o .csv en Excel',
        sheetTipNoZip: 'Aquí no se puede descomprimir xlsx: guárdalo como CSV y vuelve a intentarlo',
        sheetTipTruncated: 'Truncado por el límite: solo se convierten las primeras {n} filas',
        sheetTipPreview: 'Vista previa truncada; copiar y exportar siguen dando el contenido completo',
        sheetToastExported: 'Archivo JSON exportado',
        sheetToastExporting: 'Guardando…',
        sheetToastExportCancel: 'Exportación cancelada',
        sheetToastExportFail: 'Error al exportar: {e}',
        sheetToastBusy: 'Todavía se está generando el JSON, espera para exportar',
        sheetToastEmpty: 'No hay nada que exportar',
        sheetRowsMore: 'Quedan {n} filas sin mostrar',
        sheetParseFailed: 'Error al procesar: {e}'
    },
    'id': {
        navSheet: 'Tabel ke JSON',
        sheetPick: 'Pilih berkas Excel / CSV',
        sheetNoFile: 'Belum ada berkas',
        sheetSamples: 'Contoh',
        sheetSampleSimple: 'Tabel sederhana',
        sheetSampleUsers: 'Data pengguna',
        sheetSampleScores: 'Nilai rapor',
        sheetPreview: 'Pratinjau data',
        sheetOutput: 'Keluaran JSON',
        sheetOutJson: 'Keluaran JSON',
        sheetOutSql: 'Keluaran SQL Insert',
        sheetTableName: 'Nama tabel',
        sheetExportSql: 'Ekspor SQL',
        sheetToastExportedSql: 'Berkas SQL diekspor',
        sheetExport: 'Ekspor JSON',
        sheetHeader: 'Baris pertama adalah header',
        sheetSkipNote: 'Baris kedua adalah catatan',
        sheetNoteHint: 'Baris kedua tampak seperti keterangan, lewati?',
        sheetTipSkippedNote: 'Baris kedua (keterangan) dilewati',
        sheetCellRow: 'Baris {n}',
        sheetCellHeaderRow: 'Baris header',
        sheetCellEmpty: '(kosong)',
        sheetCellRowData: 'Seluruh baris',
        sheetCellCopy: 'Salin',
        sheetCellHint: 'Klik dua kali sel lain untuk melihat isinya',
        sheetDelimLabel: 'Pemisah',
        sheetDelimAuto: 'Otomatis',
        sheetNumbers: 'Deteksi angka',
        sheetBools: 'Deteksi boolean',
        sheetLimitLabel: 'Maksimum baris',
        sheetLimitAll: 'Semua',
        sheetFormatPretty: 'Terformat',
        sheetFormatCompact: 'Padat',
        sheetLimitHint: 'Satu berkas ≤ 20 MB · maksimal 100 000 baris',
        sheetEmptyHint: 'Pilih berkas atau tarik CSV / Excel ke sini',
        sheetTipIdle: '.xlsx / .csv / .tsv didukung; semua diproses lokal, tidak ada data diunggah',
        sheetTipParsing: 'Memproses…',
        sheetTipJson: 'Membuat JSON {p}%',
        sheetTipSql: 'Membuat SQL {p}%',
        sheetTipDone: '{n} catatan · {c} kolom · {s}',
        sheetTipLimited: 'Dibatasi ke {n} catatan pertama (dari {m}); ekspor juga {n}',
        sheetTipEmpty: 'Tidak ada data: periksa pemisah atau pengaturan header',
        sheetTipTooBig: 'Berkas {s} melebihi batas {m}, pecah dulu',
        sheetTipBadType: 'Jenis berkas tidak didukung: pilih .xlsx / .csv / .tsv',
        sheetTipXls: '.xls lama belum didukung: simpan sebagai .xlsx atau .csv di Excel',
        sheetTipNoZip: 'Lingkungan ini tidak bisa membuka xlsx: simpan sebagai CSV lalu coba lagi',
        sheetTipTruncated: 'Dipangkas sesuai batas: hanya {n} baris pertama yang dikonversi',
        sheetTipPreview: 'Pratinjau dipangkas; salin dan ekspor tetap lengkap',
        sheetToastExported: 'Berkas JSON diekspor',
        sheetToastExporting: 'Menyimpan…',
        sheetToastExportCancel: 'Ekspor dibatalkan',
        sheetToastExportFail: 'Ekspor gagal: {e}',
        sheetToastBusy: 'JSON masih dibuat, tunggu sebentar lalu ekspor',
        sheetToastEmpty: 'Belum ada yang bisa diekspor',
        sheetRowsMore: '{n} baris belum ditampilkan',
        sheetParseFailed: 'Gagal memproses: {e}'
    },
    'it': {
        navSheet: 'Foglio in JSON',
        sheetPick: 'Scegli file Excel / CSV',
        sheetNoFile: 'Nessun file',
        sheetSamples: 'Esempi',
        sheetSampleSimple: 'Tabella semplice',
        sheetSampleUsers: 'Utenti',
        sheetSampleScores: 'Voti',
        sheetPreview: 'Anteprima dati',
        sheetOutput: 'Uscita JSON',
        sheetOutJson: 'Uscita JSON',
        sheetOutSql: 'Uscita SQL Insert',
        sheetTableName: 'Nome tabella',
        sheetExportSql: 'Esporta SQL',
        sheetToastExportedSql: 'File SQL esportato',
        sheetExport: 'Esporta JSON',
        sheetHeader: 'La prima riga è l\'intestazione',
        sheetSkipNote: 'La seconda riga è una nota',
        sheetNoteHint: 'La seconda riga sembra una descrizione: saltarla?',
        sheetTipSkippedNote: 'Seconda riga (descrizione) saltata',
        sheetCellRow: 'Riga {n}',
        sheetCellHeaderRow: 'Riga di intestazione',
        sheetCellEmpty: '(vuoto)',
        sheetCellRowData: 'Riga intera',
        sheetCellCopy: 'Copia',
        sheetCellHint: 'Fai doppio clic su un\'altra cella per continuare',
        sheetDelimLabel: 'Separatore',
        sheetDelimAuto: 'Automatico',
        sheetNumbers: 'Rileva numeri',
        sheetBools: 'Rileva booleani',
        sheetLimitLabel: 'Massimo righe',
        sheetLimitAll: 'Tutte',
        sheetFormatPretty: 'Formattato',
        sheetFormatCompact: 'Compatto',
        sheetLimitHint: 'Un file ≤ 20 MB · massimo 100 000 righe',
        sheetEmptyHint: 'Scegli un file o trascina CSV / Excel qui',
        sheetTipIdle: '.xlsx / .csv / .tsv supportati; tutto in locale, nessun dato caricato',
        sheetTipParsing: 'Elaborazione…',
        sheetTipJson: 'Generazione JSON {p}%',
        sheetTipSql: 'Generazione SQL {p}%',
        sheetTipDone: '{n} record · {c} colonne · {s}',
        sheetTipLimited: 'Limitato ai primi {n} record (su {m}); anche l\'esportazione ne ha {n}',
        sheetTipEmpty: 'Nessun dato trovato: controlla il separatore o l\'intestazione',
        sheetTipTooBig: 'Il file {s} supera il limite di {m}: dividilo prima',
        sheetTipBadType: 'Tipo di file non supportato: scegli .xlsx / .csv / .tsv',
        sheetTipXls: 'Il vecchio .xls non è supportato: salvalo come .xlsx o .csv in Excel',
        sheetTipNoZip: 'Qui non si può scompattare xlsx: salva come CSV e riprova',
        sheetTipTruncated: 'Troncato al limite: convertite solo le prime {n} righe',
        sheetTipPreview: 'Anteprima troncata; copia ed esportazione restano complete',
        sheetToastExported: 'File JSON esportato',
        sheetToastExporting: 'Salvataggio…',
        sheetToastExportCancel: 'Esportazione annullata',
        sheetToastExportFail: 'Esportazione non riuscita: {e}',
        sheetToastBusy: 'Il JSON è ancora in generazione, attendi per esportare',
        sheetToastEmpty: 'Niente da esportare',
        sheetRowsMore: 'Restano {n} righe non mostrate',
        sheetParseFailed: 'Elaborazione non riuscita: {e}'
    },
    'ja': {
        navSheet: '表を JSON に',
        sheetPick: 'Excel / CSV ファイルを選択',
        sheetNoFile: 'ファイル未選択',
        sheetSamples: 'サンプル',
        sheetSampleSimple: 'シンプルな表',
        sheetSampleUsers: 'ユーザー情報',
        sheetSampleScores: '成績表',
        sheetPreview: 'データプレビュー',
        sheetOutput: 'JSON 出力',
        sheetOutJson: 'JSON 出力',
        sheetOutSql: 'SQL Insert 出力',
        sheetTableName: 'テーブル名',
        sheetExportSql: 'SQL を書き出す',
        sheetToastExportedSql: 'SQL ファイルを書き出しました',
        sheetExport: 'JSON を書き出す',
        sheetHeader: '1 行目はヘッダー',
        sheetSkipNote: '2 行目は注記',
        sheetNoteHint: '2 行目は説明のようです。読み飛ばしますか？',
        sheetTipSkippedNote: '2 行目（説明）を読み飛ばしました',
        sheetCellRow: '{n} 行目',
        sheetCellHeaderRow: 'ヘッダー行',
        sheetCellEmpty: '（空）',
        sheetCellRowData: '行全体',
        sheetCellCopy: 'コピー',
        sheetCellHint: '他のセルをダブルクリックすると続けて確認できます',
        sheetDelimLabel: '区切り文字',
        sheetDelimAuto: '自動',
        sheetNumbers: '数値を判定',
        sheetBools: '真偽値を判定',
        sheetLimitLabel: '最大件数',
        sheetLimitAll: 'すべて',
        sheetFormatPretty: '整形',
        sheetFormatCompact: 'コンパクト',
        sheetLimitHint: '1 ファイル ≤ 20 MB · 最大 10 万行',
        sheetEmptyHint: 'ファイルを選択するか、CSV / Excel をここにドロップ',
        sheetTipIdle: '.xlsx / .csv / .tsv に対応。すべてローカルで処理し、データは送信しません',
        sheetTipParsing: '解析中…',
        sheetTipJson: 'JSON を生成中 {p}%',
        sheetTipSql: 'SQL を生成中 {p}%',
        sheetTipDone: '{n} 件 · {c} 列 · {s}',
        sheetTipLimited: '先頭 {n} 件に制限しました（全 {m} 件）。書き出しも {n} 件です',
        sheetTipEmpty: 'データが見つかりません。区切り文字やヘッダー設定を確認してください',
        sheetTipTooBig: 'ファイル {s} は上限 {m} を超えています。分割してから変換してください',
        sheetTipBadType: 'この形式には対応していません（.xlsx / .csv / .tsv）',
        sheetTipXls: '旧式の .xls には未対応です。Excel で .xlsx か .csv として保存してください',
        sheetTipNoZip: 'この環境では xlsx を展開できません。CSV で保存してから変換してください',
        sheetTipTruncated: '上限までで切り詰め、先頭 {n} 行だけ変換しました',
        sheetTipPreview: 'プレビューは途中までです。コピーと書き出しは全体を対象にします',
        sheetToastExported: 'JSON ファイルを書き出しました',
        sheetToastExporting: '保存中…',
        sheetToastExportCancel: '書き出しをキャンセルしました',
        sheetToastExportFail: '書き出しに失敗: {e}',
        sheetToastBusy: 'JSON を生成中です。少し待ってから書き出してください',
        sheetToastEmpty: '書き出す内容がありません',
        sheetRowsMore: '未表示の行が {n} 行あります',
        sheetParseFailed: '解析に失敗: {e}'
    },
    'ko': {
        navSheet: '시트를 JSON으로',
        sheetPick: 'Excel / CSV 파일 선택',
        sheetNoFile: '선택한 파일 없음',
        sheetSamples: '예시',
        sheetSampleSimple: '간단한 표',
        sheetSampleUsers: '사용자 정보',
        sheetSampleScores: '성적표',
        sheetPreview: '데이터 미리보기',
        sheetOutput: 'JSON 출력',
        sheetOutJson: 'JSON 출력',
        sheetOutSql: 'SQL Insert 출력',
        sheetTableName: '테이블 이름',
        sheetExportSql: 'SQL 내보내기',
        sheetToastExportedSql: 'SQL 파일을 내보냈습니다',
        sheetExport: 'JSON 내보내기',
        sheetHeader: '첫 행이 헤더',
        sheetSkipNote: '둘째 행은 설명',
        sheetNoteHint: '둘째 행이 설명으로 보입니다. 건너뛸까요?',
        sheetTipSkippedNote: '둘째 행(설명)을 건너뛰었습니다',
        sheetCellRow: '{n}번째 행',
        sheetCellHeaderRow: '헤더 행',
        sheetCellEmpty: '(비어 있음)',
        sheetCellRowData: '행 전체',
        sheetCellCopy: '복사',
        sheetCellHint: '다른 셀을 두 번 클릭하면 계속 볼 수 있습니다',
        sheetDelimLabel: '구분자',
        sheetDelimAuto: '자동',
        sheetNumbers: '숫자 인식',
        sheetBools: '불리언 인식',
        sheetLimitLabel: '최대 행 수',
        sheetLimitAll: '전체',
        sheetFormatPretty: '보기 좋게',
        sheetFormatCompact: '압축',
        sheetLimitHint: '파일당 ≤ 20 MB · 최대 10만 행',
        sheetEmptyHint: '파일을 고르거나 CSV / Excel을 여기로 끌어다 놓으세요',
        sheetTipIdle: '.xlsx / .csv / .tsv 지원. 모두 로컬에서 처리하며 데이터를 전송하지 않습니다',
        sheetTipParsing: '분석 중…',
        sheetTipJson: 'JSON 생성 중 {p}%',
        sheetTipSql: 'SQL 생성 중 {p}%',
        sheetTipDone: '{n}개 레코드 · {c}개 열 · {s}',
        sheetTipLimited: '앞의 {n}개로 제한했습니다(전체 {m}개). 내보내기도 {n}개입니다',
        sheetTipEmpty: '데이터를 찾지 못했습니다. 구분자나 헤더 설정을 확인하세요',
        sheetTipTooBig: '파일 {s}이(가) {m} 한도를 넘습니다. 먼저 나눠 주세요',
        sheetTipBadType: '지원하지 않는 파일 형식입니다(.xlsx / .csv / .tsv)',
        sheetTipXls: '구형 .xls는 지원하지 않습니다. Excel에서 .xlsx 또는 .csv로 저장하세요',
        sheetTipNoZip: '이 환경에서는 xlsx 압축을 풀 수 없습니다. CSV로 저장한 뒤 다시 시도하세요',
        sheetTipTruncated: '한도에 맞춰 잘라 앞의 {n}행만 변환했습니다',
        sheetTipPreview: '미리보기는 잘렸습니다. 복사와 내보내기는 전체 내용입니다',
        sheetToastExported: 'JSON 파일을 내보냈습니다',
        sheetToastExporting: '저장 중…',
        sheetToastExportCancel: '내보내기를 취소했습니다',
        sheetToastExportFail: '내보내기 실패: {e}',
        sheetToastBusy: '아직 JSON을 생성 중입니다. 잠시 후 내보내세요',
        sheetToastEmpty: '내보낼 내용이 없습니다',
        sheetRowsMore: '{n}행이 아직 표시되지 않았습니다',
        sheetParseFailed: '분석 실패: {e}'
    },
    'pt': {
        navSheet: 'Planilha para JSON',
        sheetPick: 'Escolher arquivo Excel / CSV',
        sheetNoFile: 'Nenhum arquivo',
        sheetSamples: 'Exemplos',
        sheetSampleSimple: 'Tabela simples',
        sheetSampleUsers: 'Usuários',
        sheetSampleScores: 'Notas',
        sheetPreview: 'Prévia dos dados',
        sheetOutput: 'Saída JSON',
        sheetOutJson: 'Saída JSON',
        sheetOutSql: 'Saída SQL Insert',
        sheetTableName: 'Nome da tabela',
        sheetExportSql: 'Exportar SQL',
        sheetToastExportedSql: 'Arquivo SQL exportado',
        sheetExport: 'Exportar JSON',
        sheetHeader: 'A primeira linha é o cabeçalho',
        sheetSkipNote: 'A segunda linha é uma nota',
        sheetNoteHint: 'A segunda linha parece uma descrição, pular?',
        sheetTipSkippedNote: 'Segunda linha (descrição) ignorada',
        sheetCellRow: 'Linha {n}',
        sheetCellHeaderRow: 'Linha do cabeçalho',
        sheetCellEmpty: '(vazio)',
        sheetCellRowData: 'Linha inteira',
        sheetCellCopy: 'Copiar',
        sheetCellHint: 'Dê um duplo clique em outra célula para continuar vendo',
        sheetDelimLabel: 'Separador',
        sheetDelimAuto: 'Automático',
        sheetNumbers: 'Detectar números',
        sheetBools: 'Detectar booleanos',
        sheetLimitLabel: 'Máximo de linhas',
        sheetLimitAll: 'Todas',
        sheetFormatPretty: 'Formatado',
        sheetFormatCompact: 'Compacto',
        sheetLimitHint: 'Um arquivo ≤ 20 MB · máximo 100 000 linhas',
        sheetEmptyHint: 'Escolha um arquivo ou arraste CSV / Excel para cá',
        sheetTipIdle: '.xlsx / .csv / .tsv suportados; tudo é processado localmente, nada é enviado',
        sheetTipParsing: 'Processando…',
        sheetTipJson: 'Gerando JSON {p}%',
        sheetTipSql: 'Gerando SQL {p}%',
        sheetTipDone: '{n} registros · {c} colunas · {s}',
        sheetTipLimited: 'Limitado aos primeiros {n} registros (de {m}); a exportação também leva {n}',
        sheetTipEmpty: 'Nenhum dado encontrado: verifique o separador ou o cabeçalho',
        sheetTipTooBig: 'O arquivo {s} passa do limite de {m}; divida antes',
        sheetTipBadType: 'Tipo de arquivo não suportado: escolha .xlsx / .csv / .tsv',
        sheetTipXls: 'O .xls antigo não é suportado: salve como .xlsx ou .csv no Excel',
        sheetTipNoZip: 'Aqui não dá para descompactar xlsx: salve como CSV e tente de novo',
        sheetTipTruncated: 'Cortado no limite: só as primeiras {n} linhas foram convertidas',
        sheetTipPreview: 'Prévia truncada; copiar e exportar continuam completos',
        sheetToastExported: 'Arquivo JSON exportado',
        sheetToastExporting: 'Salvando…',
        sheetToastExportCancel: 'Exportação cancelada',
        sheetToastExportFail: 'Falha ao exportar: {e}',
        sheetToastBusy: 'O JSON ainda está sendo gerado, espere para exportar',
        sheetToastEmpty: 'Nada para exportar',
        sheetRowsMore: 'Ainda há {n} linhas não exibidas',
        sheetParseFailed: 'Falha ao processar: {e}'
    },
    'pl': {
        navSheet: 'Arkusz do JSON',
        sheetPick: 'Wybierz plik Excel / CSV',
        sheetNoFile: 'Nie wybrano pliku',
        sheetSamples: 'Przykłady',
        sheetSampleSimple: 'Prosta tabela',
        sheetSampleUsers: 'Użytkownicy',
        sheetSampleScores: 'Oceny',
        sheetPreview: 'Podgląd danych',
        sheetOutput: 'Wyjście JSON',
        sheetOutJson: 'Wyjście JSON',
        sheetOutSql: 'Wyjście SQL Insert',
        sheetTableName: 'Nazwa tabeli',
        sheetExportSql: 'Eksportuj SQL',
        sheetToastExportedSql: 'Wyeksportowano plik SQL',
        sheetExport: 'Eksportuj JSON',
        sheetHeader: 'Pierwszy wiersz to nagłówek',
        sheetSkipNote: 'Drugi wiersz to notatka',
        sheetNoteHint: 'Drugi wiersz wygląda na opis — pominąć?',
        sheetTipSkippedNote: 'Pominięto drugi wiersz (opis)',
        sheetCellRow: 'Wiersz {n}',
        sheetCellHeaderRow: 'Wiersz nagłówka',
        sheetCellEmpty: '(puste)',
        sheetCellRowData: 'Cały wiersz',
        sheetCellCopy: 'Kopiuj',
        sheetCellHint: 'Kliknij dwukrotnie inną komórkę, aby oglądać dalej',
        sheetDelimLabel: 'Separator',
        sheetDelimAuto: 'Automatycznie',
        sheetNumbers: 'Rozpoznawaj liczby',
        sheetBools: 'Rozpoznawaj wartości logiczne',
        sheetLimitLabel: 'Maksymalna liczba wierszy',
        sheetLimitAll: 'Wszystkie',
        sheetFormatPretty: 'Sformatowany',
        sheetFormatCompact: 'Kompaktowy',
        sheetLimitHint: 'Jeden plik ≤ 20 MB · maksymalnie 100 000 wierszy',
        sheetEmptyHint: 'Wybierz plik albo przeciągnij CSV / Excel tutaj',
        sheetTipIdle: 'Obsługiwane .xlsx / .csv / .tsv; wszystko liczone lokalnie, żadne dane nie są wysyłane',
        sheetTipParsing: 'Przetwarzanie…',
        sheetTipJson: 'Generowanie JSON {p}%',
        sheetTipSql: 'Generowanie SQL {p}%',
        sheetTipDone: '{n} rekordów · {c} kolumn · {s}',
        sheetTipLimited: 'Ograniczono do pierwszych {n} rekordów (z {m}); eksport też ma {n}',
        sheetTipEmpty: 'Nie znaleziono danych — sprawdź separator lub nagłówek',
        sheetTipTooBig: 'Plik {s} przekracza limit {m}; najpierw go podziel',
        sheetTipBadType: 'Nieobsługiwany typ pliku — wybierz .xlsx / .csv / .tsv',
        sheetTipXls: 'Stary .xls nie jest obsługiwany — zapisz w Excelu jako .xlsx lub .csv',
        sheetTipNoZip: 'To środowisko nie rozpakuje xlsx — zapisz jako CSV i spróbuj ponownie',
        sheetTipTruncated: 'Przycięto do limitu — przekonwertowano tylko pierwsze {n} wierszy',
        sheetTipPreview: 'Podgląd ucięty; kopiowanie i eksport nadal obejmują całość',
        sheetToastExported: 'Wyeksportowano plik JSON',
        sheetToastExporting: 'Zapisywanie…',
        sheetToastExportCancel: 'Eksport anulowany',
        sheetToastExportFail: 'Eksport nie powiódł się: {e}',
        sheetToastBusy: 'JSON wciąż się generuje — poczekaj z eksportem',
        sheetToastEmpty: 'Nie ma czego eksportować',
        sheetRowsMore: 'Pozostało {n} niewyświetlonych wierszy',
        sheetParseFailed: 'Nie udało się przetworzyć: {e}'
    },
    'ru': {
        navSheet: 'Таблица в JSON',
        sheetPick: 'Выбрать файл Excel / CSV',
        sheetNoFile: 'Файл не выбран',
        sheetSamples: 'Примеры',
        sheetSampleSimple: 'Простая таблица',
        sheetSampleUsers: 'Пользователи',
        sheetSampleScores: 'Ведомость',
        sheetPreview: 'Предпросмотр данных',
        sheetOutput: 'Вывод JSON',
        sheetOutJson: 'Вывод JSON',
        sheetOutSql: 'Вывод SQL Insert',
        sheetTableName: 'Имя таблицы',
        sheetExportSql: 'Экспорт SQL',
        sheetToastExportedSql: 'Файл SQL экспортирован',
        sheetExport: 'Экспорт JSON',
        sheetHeader: 'Первая строка — заголовок',
        sheetSkipNote: 'Вторая строка — примечание',
        sheetNoteHint: 'Вторая строка похожа на описание. Пропустить?',
        sheetTipSkippedNote: 'Вторая строка (описание) пропущена',
        sheetCellRow: 'Строка {n}',
        sheetCellHeaderRow: 'Строка заголовка',
        sheetCellEmpty: '(пусто)',
        sheetCellRowData: 'Строка целиком',
        sheetCellCopy: 'Копировать',
        sheetCellHint: 'Дважды щёлкните другую ячейку, чтобы смотреть дальше',
        sheetDelimLabel: 'Разделитель',
        sheetDelimAuto: 'Авто',
        sheetNumbers: 'Распознавать числа',
        sheetBools: 'Распознавать логические значения',
        sheetLimitLabel: 'Максимум строк',
        sheetLimitAll: 'Все',
        sheetFormatPretty: 'С отступами',
        sheetFormatCompact: 'Компактно',
        sheetLimitHint: 'Один файл ≤ 20 MB · максимум 100 000 строк',
        sheetEmptyHint: 'Выберите файл или перетащите CSV / Excel сюда',
        sheetTipIdle: 'Поддержка .xlsx / .csv / .tsv; всё считается локально, данные никуда не уходят',
        sheetTipParsing: 'Разбор…',
        sheetTipJson: 'Генерация JSON {p}%',
        sheetTipSql: 'Генерация SQL {p}%',
        sheetTipDone: '{n} записей · {c} столбцов · {s}',
        sheetTipLimited: 'Ограничено первыми {n} записями (всего {m}); экспорт тоже даёт {n}',
        sheetTipEmpty: 'Данные не найдены — проверьте разделитель или заголовок',
        sheetTipTooBig: 'Файл {s} больше предела {m}; сначала разделите его',
        sheetTipBadType: 'Этот тип файла не поддерживается — выберите .xlsx / .csv / .tsv',
        sheetTipXls: 'Старый .xls не поддерживается — сохраните в Excel как .xlsx или .csv',
        sheetTipNoZip: 'Здесь нельзя распаковать xlsx — сохраните как CSV и попробуйте снова',
        sheetTipTruncated: 'Обрезано по лимиту: преобразованы только первые {n} строк',
        sheetTipPreview: 'Предпросмотр обрезан; копирование и экспорт остаются полными',
        sheetToastExported: 'Файл JSON экспортирован',
        sheetToastExporting: 'Сохранение…',
        sheetToastExportCancel: 'Экспорт отменён',
        sheetToastExportFail: 'Не удалось экспортировать: {e}',
        sheetToastBusy: 'JSON ещё генерируется — подождите с экспортом',
        sheetToastEmpty: 'Нечего экспортировать',
        sheetRowsMore: 'Ещё {n} строк не показаны',
        sheetParseFailed: 'Не удалось разобрать: {e}'
    },
    'th': {
        navSheet: 'ตารางเป็น JSON',
        sheetPick: 'เลือกไฟล์ Excel / CSV',
        sheetNoFile: 'ยังไม่ได้เลือกไฟล์',
        sheetSamples: 'ตัวอย่าง',
        sheetSampleSimple: 'ตารางง่าย ๆ',
        sheetSampleUsers: 'ข้อมูลผู้ใช้',
        sheetSampleScores: 'ใบเกรด',
        sheetPreview: 'ตัวอย่างข้อมูล',
        sheetOutput: 'เอาต์พุต JSON',
        sheetOutJson: 'เอาต์พุต JSON',
        sheetOutSql: 'เอาต์พุต SQL Insert',
        sheetTableName: 'ชื่อตาราง',
        sheetExportSql: 'ส่งออก SQL',
        sheetToastExportedSql: 'ส่งออกไฟล์ SQL แล้ว',
        sheetExport: 'ส่งออก JSON',
        sheetHeader: 'แถวแรกเป็นหัวตาราง',
        sheetSkipNote: 'แถวที่สองเป็นหมายเหตุ',
        sheetNoteHint: 'แถวที่สองดูเหมือนคำอธิบาย ข้ามไหม?',
        sheetTipSkippedNote: 'ข้ามแถวที่สอง (คำอธิบาย) แล้ว',
        sheetCellRow: 'แถวที่ {n}',
        sheetCellHeaderRow: 'แถวหัวตาราง',
        sheetCellEmpty: '(ว่าง)',
        sheetCellRowData: 'ทั้งแถว',
        sheetCellCopy: 'คัดลอก',
        sheetCellHint: 'ดับเบิลคลิกเซลล์อื่นเพื่อดูต่อ',
        sheetDelimLabel: 'ตัวคั่น',
        sheetDelimAuto: 'อัตโนมัติ',
        sheetNumbers: 'ตรวจจับตัวเลข',
        sheetBools: 'ตรวจจับค่าบูลีน',
        sheetLimitLabel: 'จำนวนแถวสูงสุด',
        sheetLimitAll: 'ทั้งหมด',
        sheetFormatPretty: 'จัดรูปแบบ',
        sheetFormatCompact: 'กะทัดรัด',
        sheetLimitHint: 'ไฟล์เดียว ≤ 20 MB · สูงสุด 100,000 แถว',
        sheetEmptyHint: 'เลือกไฟล์ หรือลาก CSV / Excel มาที่นี่',
        sheetTipIdle: 'รองรับ .xlsx / .csv / .tsv ประมวลผลในเครื่องทั้งหมด ไม่มีการอัปโหลดข้อมูล',
        sheetTipParsing: 'กำลังวิเคราะห์…',
        sheetTipJson: 'กำลังสร้าง JSON {p}%',
        sheetTipSql: 'กำลังสร้าง SQL {p}%',
        sheetTipDone: '{n} รายการ · {c} คอลัมน์ · {s}',
        sheetTipLimited: 'จำกัดที่ {n} รายการแรก (จาก {m}) การส่งออกก็ได้ {n} เช่นกัน',
        sheetTipEmpty: 'ไม่พบข้อมูล ตรวจตัวคั่นหรือการตั้งค่าหัวตาราง',
        sheetTipTooBig: 'ไฟล์ {s} เกินขีดจำกัด {m} กรุณาแบ่งก่อน',
        sheetTipBadType: 'ไม่รองรับไฟล์ชนิดนี้ เลือก .xlsx / .csv / .tsv',
        sheetTipXls: 'ยังไม่รองรับ .xls รุ่นเก่า บันทึกเป็น .xlsx หรือ .csv ใน Excel ก่อน',
        sheetTipNoZip: 'สภาพแวดล้อมนี้แตกไฟล์ xlsx ไม่ได้ บันทึกเป็น CSV แล้วลองใหม่',
        sheetTipTruncated: 'ตัดตามขีดจำกัด แปลงเฉพาะ {n} แถวแรก',
        sheetTipPreview: 'ตัวอย่างถูกตัด แต่คัดลอกและส่งออกยังได้ข้อมูลเต็ม',
        sheetToastExported: 'ส่งออกไฟล์ JSON แล้ว',
        sheetToastExporting: 'กำลังบันทึก…',
        sheetToastExportCancel: 'ยกเลิกการส่งออกแล้ว',
        sheetToastExportFail: 'ส่งออกไม่สำเร็จ: {e}',
        sheetToastBusy: 'ยังสร้าง JSON อยู่ รอสักครู่แล้วค่อยส่งออก',
        sheetToastEmpty: 'ยังไม่มีอะไรให้ส่งออก',
        sheetRowsMore: 'ยังมีอีก {n} แถวที่ไม่ได้แสดง',
        sheetParseFailed: 'วิเคราะห์ไม่สำเร็จ: {e}'
    },
    'tr': {
        navSheet: 'Tablo → JSON',
        sheetPick: 'Excel / CSV dosyası seç',
        sheetNoFile: 'Dosya seçilmedi',
        sheetSamples: 'Örnekler',
        sheetSampleSimple: 'Basit tablo',
        sheetSampleUsers: 'Kullanıcılar',
        sheetSampleScores: 'Karne',
        sheetPreview: 'Veri önizlemesi',
        sheetOutput: 'JSON çıktısı',
        sheetOutJson: 'JSON çıktısı',
        sheetOutSql: 'SQL Insert çıktısı',
        sheetTableName: 'Tablo adı',
        sheetExportSql: 'SQL dışa aktar',
        sheetToastExportedSql: 'SQL dosyası dışa aktarıldı',
        sheetExport: 'JSON dışa aktar',
        sheetHeader: 'İlk satır başlık',
        sheetSkipNote: 'İkinci satır not',
        sheetNoteHint: 'İkinci satır açıklama gibi görünüyor, atlansın mı?',
        sheetTipSkippedNote: 'İkinci satır (açıklama) atlandı',
        sheetCellRow: '{n}. satır',
        sheetCellHeaderRow: 'Başlık satırı',
        sheetCellEmpty: '(boş)',
        sheetCellRowData: 'Satırın tamamı',
        sheetCellCopy: 'Kopyala',
        sheetCellHint: 'Görmeye devam etmek için başka bir hücreye çift tıklayın',
        sheetDelimLabel: 'Ayırıcı',
        sheetDelimAuto: 'Otomatik',
        sheetNumbers: 'Sayıları tanı',
        sheetBools: 'Mantıksal değerleri tanı',
        sheetLimitLabel: 'En fazla satır',
        sheetLimitAll: 'Tümü',
        sheetFormatPretty: 'Biçimli',
        sheetFormatCompact: 'Sıkı',
        sheetLimitHint: 'Dosya başına ≤ 20 MB · en fazla 100.000 satır',
        sheetEmptyHint: 'Dosya seçin veya CSV / Excel\'i buraya sürükleyin',
        sheetTipIdle: '.xlsx / .csv / .tsv desteklenir; her şey yerelde işlenir, hiçbir veri yüklenmez',
        sheetTipParsing: 'Ayrıştırılıyor…',
        sheetTipJson: 'JSON oluşturuluyor {p}%',
        sheetTipSql: 'SQL oluşturuluyor {p}%',
        sheetTipDone: '{n} kayıt · {c} sütun · {s}',
        sheetTipLimited: 'İlk {n} kayıtla sınırlandı (toplam {m}); dışa aktarma da {n} kayıt',
        sheetTipEmpty: 'Veri bulunamadı — ayırıcıyı veya başlık ayarını kontrol edin',
        sheetTipTooBig: 'Dosya {s}, {m} sınırını aşıyor; önce bölün',
        sheetTipBadType: 'Bu dosya türü desteklenmiyor — .xlsx / .csv / .tsv seçin',
        sheetTipXls: 'Eski .xls desteklenmiyor — Excel\'de .xlsx veya .csv olarak kaydedin',
        sheetTipNoZip: 'Bu ortamda xlsx açılamıyor — CSV olarak kaydedip yeniden deneyin',
        sheetTipTruncated: 'Sınıra göre kesildi — yalnızca ilk {n} satır dönüştürüldü',
        sheetTipPreview: 'Önizleme kesildi; kopyalama ve dışa aktarma tam içeriği verir',
        sheetToastExported: 'JSON dosyası dışa aktarıldı',
        sheetToastExporting: 'Kaydediliyor…',
        sheetToastExportCancel: 'Dışa aktarma iptal edildi',
        sheetToastExportFail: 'Dışa aktarma başarısız: {e}',
        sheetToastBusy: 'JSON hâlâ oluşturuluyor, dışa aktarmak için biraz bekleyin',
        sheetToastEmpty: 'Dışa aktarılacak bir şey yok',
        sheetRowsMore: 'Gösterilmeyen {n} satır daha var',
        sheetParseFailed: 'Ayrıştırma başarısız: {e}'
    }
};

if (!window.DBXSheet) throw new Error('ui/js/sheetconv.js 未加载');
const DBXSheet = window.DBXSheet;
const SHEET_LIMITS = DBXSheet.LIMITS;

const sheetWorkspace = document.getElementById('sheetWorkspace');
const sheetFileInput = document.getElementById('sheetFileInput');
const sheetFileInfo = document.getElementById('sheetFileInfo');
const sheetSamples = document.getElementById('sheetSamples');
const sheetTip = document.getElementById('sheetTip');
const sheetInCount = document.getElementById('sheetInCount');
const sheetOutCount = document.getElementById('sheetOutCount');
const sheetOutSize = document.getElementById('sheetOutSize');
const sheetTable = document.getElementById('sheetTable');
const sheetTableWrap = document.getElementById('sheetTableWrap');
const sheetEmpty = document.getElementById('sheetEmpty');
const sheetDelim = document.getElementById('sheetDelim');
const sheetHeaderBox = document.getElementById('sheetHeader');
const sheetSkipNoteBox = document.getElementById('sheetSkipNote');
const sheetNoteWrap = document.getElementById('sheetNoteWrap');
const sheetNoteHint = document.getElementById('sheetNoteHint');
const sheetNumbersBox = document.getElementById('sheetNumbers');
const sheetBoolsBox = document.getElementById('sheetBools');
const sheetLimitEl = document.getElementById('sheetLimit');
const sheetFormatTabs = document.getElementById('sheetFormat');
const sheetOutputModeTabs = document.getElementById('sheetOutputMode');
const sheetOutLabel = document.getElementById('sheetOutLabel');
const sheetTableNameWrap = document.getElementById('sheetTableNameWrap');
const sheetTableNameInput = document.getElementById('sheetTableName');
const sheetProgress = document.getElementById('sheetProgress');
const sheetProgressFill = document.getElementById('sheetProgressFill');
const sheetCellPop = document.getElementById('sheetCellPop');
const sheetCellPopTitle = document.getElementById('sheetCellPopTitle');
const sheetCellPopValue = document.getElementById('sheetCellPopValue');
const sheetCellPopRow = document.getElementById('sheetCellPopRow');
const sheetCellPopCopy = document.getElementById('sheetCellPopCopy');
const sheetCellPopClose = document.getElementById('sheetCellPopClose');
const sheetHScroll = document.getElementById('sheetHScroll');
const sheetHScrollTrack = document.getElementById('sheetHScrollTrack');
const sheetHScrollThumb = document.getElementById('sheetHScrollThumb');
const sheetSheetName = document.getElementById('sheetSheetName');
const navSheetLink = document.getElementById('navSheet');

const SHEET_SAMPLE_DATA = {
    simple: '姓名,年龄,城市\n张三,18,北京\n李四,22,上海',
    users: '姓名,年龄,城市,邮箱,注册时间\n张三,18,北京,zhangsan@example.com,2024-03-01\n李四,22,上海,lisi@example.com,2024-05-18\n王五,31,广州,wangwu@example.com,2023-11-02\n赵六,27,成都,zhaoliu@example.com,2024-01-09',
    scores: '学号,姓名,语文,数学,英语,总分\n1001,张三,92,88,95,275\n1002,李四,78,91,84,253\n1003,王五,85,79,90,254\n1004,赵六,96,94,89,279'
};

let sheetModeActive = false;
let sheetDelimiter = 'auto';
let sheetJob = 0;
let sheetBusy = false;
// pretty：缩进 2 格；compact：一条记录一行、不带缩进
let sheetFormat = 'pretty';
// 输出方式：json / sql
let sheetOutputMode = 'json';
// 最多条数：0 = 全部
let sheetLimit = 0;
const sheetState = {
    kind: '',            // text：按文本重新解析；rows：xlsx 已解析好的矩阵
    text: '',
    rows: [],
    headers: [],
    records: [],         // 已按「最多条数」裁好的记录，切格式时直接复用
    available: 0,        // 文件里实际有多少条（裁剪前）
    limited: false,      // 是否被「最多条数」截断了
    fileName: '',
    fileSize: 0,
    sheetName: '',
    json: '',
    sql: '',
    truncated: false,
    // 第二行「疑似说明」：只用来提示，不改输出；用户点了才真的跳过
    noteSuggested: false,
    // 批量：一次拖进多个文件时，这里存合并后的结果（null 表示单文件模式）
    batch: null
};

// 「第二行为注释」只有在有表头时才有意义（没表头就没有第一行列名可比）
function sheetSkipNoteValue() {
    return sheetHeaderBox.checked && sheetSkipNoteBox.checked;
}

function applySheetNoteUi() {
    const enabled = sheetHeaderBox.checked;
    sheetNoteWrap.classList.toggle('is-disabled', !enabled);
    sheetSkipNoteBox.disabled = !enabled;
    // 已勾选就不必再提示；没有表头时也无所谓第二行是注释
    sheetNoteHint.hidden = !(sheetState.noteSuggested && enabled && !sheetSkipNoteBox.checked);
}

// 每次数据变了都重新判断一次：可能像、可能不像，判断结果只影响提示
function refreshSheetNoteSuggest() {
    sheetState.noteSuggested = sheetState.rows.length
        ? DBXSheet.suggestSkipNote(sheetState.rows)
        : false;
    applySheetNoteUi();
}

// 「最多条数」：0 = 全部
function sheetLimitValue() {
    return sheetLimit;
}

// 复用顶栏那个 .custom-select（原生 select 的弹层是系统绘制的，跟主题不搭）
const sheetLimitSelect = initCustomSelect('sheetLimit');

function applySheetLimitUi() {
    if (sheetLimitSelect) sheetLimitSelect.setValue(String(sheetLimit));
}

function setSheetLimit(value) {
    const n = parseInt(value, 10);
    sheetLimit = isFinite(n) && n > 0 ? n : 0;
    applySheetLimitUi();
    // 换了上限就要重新裁记录（CSV 重新解析，xlsx 直接用已解好的矩阵）
    if (sheetState.kind) sheetRebuild();
}

function sheetT(key, fallback) {
    const table = SHEET_I18N[currentLang] || {};
    return table[key] || SHEET_I18N.en[key] || currentDict[key] || fallback || key;
}

function setSheetTip(text, tone) {
    sheetTip.textContent = text;
    sheetTip.className = 'compare-tip' + (tone ? ' ' + tone : '');
}

function sheetIdleTip() {
    setSheetTip(sheetT('sheetTipIdle', '支持 .xlsx / .csv / .tsv，全程本地解析，不上传任何数据'));
}

function formatSheetBytes(n) {
    if (!n) return '0 B';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(1) + ' MB';
}

function sheetProgressSet(ratio) {
    if (ratio == null) {
        sheetProgress.classList.remove('show');
        sheetProgressFill.style.width = '0%';
        return;
    }
    sheetProgress.classList.add('show');
    sheetProgressFill.style.width = Math.max(3, Math.round(ratio * 100)) + '%';
}

function escapeSheetHtml(value) {
    return String(value).replace(/[&<>"]/g, (ch) => (
        ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : '&quot;'
    ));
}

function ensureSheetEditor() {
    if (sheetOutputEditor) return;
    // 输出栏只读：这里放的是给复制 / 导出用的成品
    sheetOutputEditor = CodeMirror.fromTextArea(sheetOutputText, Object.assign({}, commonConfig, {
        mode: MODE_MAP.json,
        readOnly: true
    }));
    syncEditorTheme();
}

function updateSheetFileInfo() {
    const hasFile = !!sheetState.fileName;
    sheetFileInfo.classList.toggle('has-file', hasFile);
    if (!hasFile) {
        sheetFileInfo.textContent = sheetT('sheetNoFile', '未选择文件');
        sheetSheetName.textContent = '';
        return;
    }
    const bits = [sheetState.fileName];
    if (sheetState.fileSize) bits.push(formatSheetBytes(sheetState.fileSize));
    sheetFileInfo.textContent = bits.join(' · ');
    sheetFileInfo.title = sheetFileInfo.textContent;
    sheetSheetName.textContent = sheetState.sheetName || '';
}

// 预览最多画 SHEET_LIMITS.previewRows 行：10 万行全塞进 DOM 会直接把页面卡死。
// 「最多条数」比它还小时，就按条数限制收窄，预览与 JSON 保持一致。
function renderSheetTable() {
    const rows = sheetState.rows;
    const hasHeader = sheetHeaderBox.checked;
    if (!rows.length) {
        sheetTable.innerHTML = '';
        sheetEmpty.classList.remove('hidden');
        sheetInCount.textContent = '0 × 0';
        return;
    }
    sheetEmpty.classList.add('hidden');

    const width = Math.min(Math.max(sheetState.headers.length, 1), 40);
    const start = hasHeader ? (sheetSkipNoteValue() ? 2 : 1) : 0;
    const dataRows = Math.max(rows.length - start, 0);
    const limit = sheetLimitValue();
    const windowRows = limit ? Math.min(limit, SHEET_LIMITS.previewRows) : SHEET_LIMITS.previewRows;
    const end = Math.min(rows.length, start + windowRows);
    const shown = end - start;
    const html = ['<thead><tr>'];
    for (let c = 0; c < width; c++) {
        const name = sheetState.headers[c] || ('column_' + (c + 1));
        html.push('<th>' + escapeSheetHtml(name) + '</th>');
    }
    html.push('</tr></thead><tbody>');
    for (let r = start; r < end; r++) {
        html.push('<tr>');
        for (let c = 0; c < width; c++) {
            const raw = rows[r][c] == null ? '' : String(rows[r][c]);
            const numeric = raw !== '' && DBXSheet.isNumberLiteral(raw);
            // data-row / data-col 给双击看详情用（行号是文件里的真实下标）
            html.push('<td data-row="' + r + '" data-col="' + c + '"' +
                (numeric ? ' class="is-num"' : '') + '>' + escapeSheetHtml(raw) + '</td>');
        }
        html.push('</tr>');
    }
    html.push('</tbody>');
    // 表尾显示的是「文件里还有多少条没画出来」，不是「还没转换」
    const hidden = dataRows - shown;
    if (hidden > 0) {
        html.push('<tfoot><tr><td colspan="' + width + '" class="sheet-more">' +
            escapeSheetHtml(sheetT('sheetRowsMore', '还有 {n} 行未显示').replace('{n}', String(hidden))) +
            '</td></tr></tfoot>');
    }
    sheetTable.innerHTML = html.join('');
    // 徽标用「数据行 × 列」，和 JSON 的条数对得上
    sheetInCount.textContent = dataRows + ' × ' + sheetState.headers.length;
    scheduleSyncSheetHScroll();
}

// 横向滚动条：macOS 的悬浮滚动条不滚就不出现，列多的时候容易以为「就这几列」。
// 这里按 scrollWidth / clientWidth 自己画一条常驻的，拖动它也直接改 scrollLeft。
function syncSheetHScroll() {
    const overflow = sheetTableWrap.scrollWidth - sheetTableWrap.clientWidth;
    if (overflow <= 1) {
        sheetHScroll.hidden = true;
        return;
    }
    sheetHScroll.hidden = false;
    const trackWidth = sheetHScrollTrack.clientWidth;
    if (!trackWidth) return;
    const width = Math.max(36, Math.round(trackWidth * sheetTableWrap.clientWidth / sheetTableWrap.scrollWidth));
    const maxLeft = Math.max(trackWidth - width, 0);
    const left = maxLeft ? Math.round(maxLeft * (sheetTableWrap.scrollLeft / overflow)) : 0;
    sheetHScrollThumb.style.width = width + 'px';
    sheetHScrollThumb.style.left = Math.min(Math.max(left, 0), maxLeft) + 'px';
}

function scheduleSyncSheetHScroll() {
    // 刚写完 innerHTML，尺寸要等一帧才准
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(syncSheetHScroll);
    else setTimeout(syncSheetHScroll, 0);
}

function sheetOutputLabel() {
    return sheetOutputMode === 'sql'
        ? sheetT('sheetOutSql', 'SQL Insert 输出')
        : sheetT('sheetOutJson', 'JSON 输出');
}

// 第一行数据在 rows 里的下标（有表头就跳过 1 行，勾了「第二行为注释」再跳 1 行）
function sheetDataStart() {
    return sheetHeaderBox.checked ? (sheetSkipNoteValue() ? 2 : 1) : 0;
}

function closeSheetCellPop() {
    sheetCellPop.hidden = true;
    sheetCellPop.dataset.value = '';
}

// 双击单元格：列名 + 完整内容 + 整行，横向被截掉的列在这都能看全
function openSheetCellPop(rowIndex, colIndex) {
    const row = sheetState.rows[rowIndex];
    if (!row) return;
    const header = sheetState.headers[colIndex] || ('column_' + (colIndex + 1));
    const cell = row[colIndex] == null ? '' : String(row[colIndex]);
    const rowNo = rowIndex - sheetDataStart() + 1;
    const where = rowNo > 0
        ? sheetT('sheetCellRow', '第 {n} 条').replace('{n}', String(rowNo))
        : sheetT('sheetCellHeaderRow', '表头行');
    sheetCellPopTitle.textContent = header + ' · ' + where;
    sheetCellPopValue.textContent = cell === '' ? sheetT('sheetCellEmpty', '（空）') : cell;
    sheetCellPopValue.classList.toggle('is-empty', cell === '');

    const width = Math.max(sheetState.headers.length, row.length);
    const parts = [];
    for (let c = 0; c < width; c++) {
        const name = sheetState.headers[c] || ('column_' + (c + 1));
        const value = row[c] == null ? '' : String(row[c]);
        parts.push('<tr' + (c === colIndex ? ' class="is-current"' : '') + '><td>' +
            escapeSheetHtml(name) + '</td><td>' +
            escapeSheetHtml(value === '' ? '—' : value) + '</td></tr>');
    }
    sheetCellPopRow.innerHTML = parts.join('');
    sheetCellPop.dataset.value = cell;
    sheetCellPop.hidden = false;
    sheetCellPopValue.scrollTop = 0;
}

function currentSheetText() {
    return sheetOutputMode === 'sql' ? sheetState.sql : sheetState.json;
}

// 顶栏：JSON 模式才显示「格式化 / 紧凑」，SQL 模式换成表名输入框
function applySheetOutputModeUi() {
    const isSql = sheetOutputMode === 'sql';
    sheetOutputModeTabs.querySelectorAll('.compare-tab').forEach((tab) => {
        tab.classList.toggle('active', tab.dataset.mode === sheetOutputMode);
    });
    sheetTableNameWrap.hidden = !isSql;
    // 「格式化 / 紧凑」两种输出都保留：JSON 是缩进与不缩进，SQL 是逐行与整句一行
    sheetOutLabel.setAttribute('data-i18n', isSql ? 'sheetOutSql' : 'sheetOutput');
    sheetOutLabel.textContent = sheetOutputLabel();
    const exportBtn = document.getElementById('sheetExport');
    exportBtn.setAttribute('data-i18n', isSql ? 'sheetExportSql' : 'sheetExport');
    exportBtn.textContent = sheetT(isSql ? 'sheetExportSql' : 'sheetExport', '导出 JSON');
}

function setSheetOutputMode(mode) {
    const next = mode === 'sql' ? 'sql' : 'json';
    if (next === sheetOutputMode) return;
    // 批量结果是「多文件合并的 JSON」，切成 SQL 没有对应语义，直接退回单文件预览
    if (next === 'sql') sheetState.batch = null;
    sheetOutputMode = next;
    applySheetOutputModeUi();
    if (sheetState.records.length) sheetReserialize();
    else renderSheetOutput('', 0);
}

function renderSheetOutput(text, count) {
    ensureSheetEditor();
    let preview = text;
    const limit = SHEET_LIMITS.previewChars;
    if (text.length > limit) {
        const cut = text.lastIndexOf('\n', limit);
        preview = text.slice(0, cut > 0 ? cut : limit) + '\n…（' + sheetT('sheetTipPreview', '预览已截断，复制 / 导出仍是完整内容') + '）';
    }
    if (sheetOutputEditor.getValue() !== preview) sheetOutputEditor.setValue(preview);
    sheetOutCount.textContent = String(count);
    sheetOutSize.textContent = text ? formatSheetBytes(text.length) : '';
    sheetOutLabel.textContent = sheetOutputLabel();
}

function sheetDoneTip(count, columns) {
    let text = sheetT('sheetTipDone', '{n} 条记录 · {c} 列 · {s}')
        .replace('{n}', String(count))
        .replace('{c}', String(columns))
        .replace('{s}', formatSheetBytes(currentSheetText().length));
    if (sheetState.limited) {
        text += ' · ' + sheetT('sheetTipLimited', '已限制为前 {n} 条（共 {m} 条），导出同样是 {n} 条')
            .replace(/\{n\}/g, String(count))
            .replace('{m}', String(sheetState.available));
    }
    if (sheetSkipNoteValue()) {
        text += ' · ' + sheetT('sheetTipSkippedNote', '已跳过第二行说明');
    }
    return text;
}

function tickSheet() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

// 按当前输出方式（JSON / SQL）序列化，进度与取消都走同一个 token
async function buildSheetOutputText(records, token) {
    const onProgress = (p) => {
        if (token !== sheetJob) return;
        const ratio = p.total ? p.done / p.total : 0;
        sheetProgressSet(ratio);
        const key = sheetOutputMode === 'sql' ? 'sheetTipSql' : 'sheetTipJson';
        setSheetTip(sheetT(key, '正在生成 JSON {p}%').replace('{p}', String(Math.round(ratio * 100))));
    };
    const isCancelled = () => token !== sheetJob;
    if (sheetOutputMode === 'sql') {
        return await DBXSheet.toSqlInsertTextAsync(records, {
            table: sheetTableNameInput.value,
            columns: sheetState.headers,
            pretty: sheetFormat === 'pretty',
            onProgress: onProgress,
            isCancelled: isCancelled
        });
    }
    return await DBXSheet.toJsonTextAsync(records, {
        pretty: sheetFormat === 'pretty',
        onProgress: onProgress,
        isCancelled: isCancelled
    });
}

function stashSheetOutput(text) {
    if (sheetOutputMode === 'sql') sheetState.sql = text;
    else sheetState.json = text;
}

async function sheetRebuild() {
    // 批量模式下选项变了：拿还留着的文件重新解析一遍，而不是从空 rows 重建
    if (sheetState.batch && sheetState.batch.files) return openSheetBatch(sheetState.batch.files);
    const token = ++sheetJob;
    ensureSheetEditor();
    if (!sheetState.kind) {
        sheetIdleTip();
        return;
    }

    sheetBusy = true;
    try {
        if (sheetState.kind === 'text') {
            sheetProgressSet(0);
            setSheetTip(sheetT('sheetTipParsing', '解析中…'));
            await tickSheet();
            if (token !== sheetJob) return;
            const parsed = DBXSheet.parse(sheetState.text, {
                delimiter: sheetDelimiter,
                maxRows: SHEET_LIMITS.maxRows,
                maxCols: SHEET_LIMITS.maxCols
            });
            sheetState.rows = parsed.rows;
            sheetState.truncated = parsed.truncated;
        }

        if (!sheetState.rows.length) {
            sheetProgressSet(null);
            sheetState.headers = [];
            sheetState.json = '';
            sheetState.sql = '';
            renderSheetTable();
            renderSheetOutput('', 0);
            setSheetTip(sheetT('sheetTipEmpty', '没有解析到数据，检查一下分隔符或表头设置'), 'err');
            return;
        }

        refreshSheetNoteSuggest();
        const built = DBXSheet.buildRecords(sheetState.rows, {
            hasHeader: sheetHeaderBox.checked,
            numbers: sheetNumbersBox.checked,
            booleans: sheetBoolsBox.checked,
            skipNote: sheetSkipNoteValue(),
            maxRecords: sheetLimitValue()
        });
        sheetState.headers = built.headers;
        sheetState.records = built.records;
        sheetState.available = built.available;
        sheetState.limited = built.limited;

        const text = await buildSheetOutputText(built.records, token);
        if (text == null || token !== sheetJob) return;

        stashSheetOutput(text);
        sheetProgressSet(null);
        renderSheetTable();
        renderSheetOutput(text, built.records.length);
        setSheetTip(sheetDoneTip(built.records.length, built.headers.length), 'ok');
    } finally {
        if (token === sheetJob) sheetBusy = false;
    }
}

// 只改输出方式 / 格式 / 表名时不用重新解析，拿缓存的记录重排就行
async function sheetReserialize() {
    if (sheetState.batch) {
        const text = buildBatchText();
        ensureSheetEditor();
        sheetState.json = text;
        renderSheetOutput(text, sheetState.batch.keys.reduce((n, k) => n + k.count, 0));
        return;
    }
    if (!sheetState.records.length) return;
    const token = ++sheetJob;
    ensureSheetEditor();
    sheetBusy = true;
    sheetProgressSet(0);
    try {
        const text = await buildSheetOutputText(sheetState.records, token);
        if (text == null || token !== sheetJob) return;
        stashSheetOutput(text);
        sheetProgressSet(null);
        renderSheetOutput(text, sheetState.records.length);
        setSheetTip(sheetDoneTip(sheetState.records.length, sheetState.headers.length), 'ok');
    } finally {
        if (token === sheetJob) sheetBusy = false;
    }
}

// 文件解码：先按 UTF-8，出现替换字符再试 GBK（Excel 导出的中文 CSV 常见）
async function readSheetText(file) {
    const buffer = await file.arrayBuffer();
    let text = new TextDecoder('utf-8').decode(buffer);
    if (text.indexOf('\uFFFD') !== -1) {
        try {
            const gbk = new TextDecoder('gbk').decode(buffer);
            if (gbk.indexOf('\uFFFD') === -1) text = gbk;
        } catch (err) { /* 环境不支持 gbk，保持 utf-8 结果 */ }
    }
    return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
}

function setSheetDelimiter(value) {
    sheetDelimiter = value;
    sheetDelim.querySelectorAll('.compare-tab').forEach((tab) => {
        tab.classList.toggle('active', tab.dataset.delim === value);
    });
}

function setSheetFormat(value) {
    sheetFormat = value === 'compact' ? 'compact' : 'pretty';
    sheetFormatTabs.querySelectorAll('.compare-tab').forEach((tab) => {
        tab.classList.toggle('active', tab.dataset.format === sheetFormat);
    });
    // 已经有结果就只重排，不用再解析一遍文件
    if (sheetState.records.length) sheetReserialize();
}

function resetSheetState() {
    sheetState.kind = '';
    sheetState.text = '';
    sheetState.rows = [];
    sheetState.headers = [];
    sheetState.records = [];
    sheetState.available = 0;
    sheetState.limited = false;
    sheetState.fileName = '';
    sheetState.fileSize = 0;
    sheetState.sheetName = '';
    sheetState.json = '';
    sheetState.sql = '';
    sheetState.truncated = false;
    sheetState.noteSuggested = false;
    sheetState.batch = null;
    applySheetNoteUi();
    closeSheetCellPop();
    sheetHScroll.hidden = true;
}

async function openSheetFile(file) {
    if (!file) return;
    const ext = (/\.([^.]+)$/.exec(file.name || '') || [null, ''])[1].toLowerCase();
    const limitMb = Math.round(SHEET_LIMITS.maxFileBytes / 1024 / 1024);

    resetSheetState();
    sheetState.fileName = file.name || 'data';
    sheetState.fileSize = file.size || 0;
    updateSheetFileInfo();

    if (file.size > SHEET_LIMITS.maxFileBytes) {
        setSheetTip(sheetT('sheetTipTooBig', '文件 {s} 超过 {m} 上限，请先拆分再转换')
            .replace('{s}', formatSheetBytes(file.size))
            .replace('{m}', limitMb + ' MB'), 'err');
        return;
    }
    if (ext === 'xls') {
        setSheetTip(sheetT('sheetTipXls', '旧版 .xls 暂不支持，请在 Excel 里另存为 .xlsx 或 .csv'), 'err');
        return;
    }
    const isXlsx = ext === 'xlsx' || ext === 'xlsm';
    if (!isXlsx && ['csv', 'tsv', 'txt'].indexOf(ext) === -1) {
        setSheetTip(sheetT('sheetTipBadType', '不支持该文件类型，请选择 .xlsx / .csv / .tsv'), 'err');
        return;
    }

    const token = ++sheetJob;
    sheetBusy = true;
    sheetProgressSet(0);
    setSheetTip(sheetT('sheetTipParsing', '解析中…'));

    try {
        if (isXlsx) {
            if (!window.DBXXlsx) throw new Error('xlsx reader missing');
            const buffer = await file.arrayBuffer();
            if (token !== sheetJob) return;
            const result = await window.DBXXlsx.read(buffer, { maxRows: SHEET_LIMITS.maxRows });
            if (token !== sheetJob) return;
            sheetState.kind = 'rows';
            sheetState.rows = result.rows;
            sheetState.sheetName = result.sheetName || '';
            sheetState.truncated = result.truncated;
            sheetDelim.classList.add('is-disabled');
        } else {
            const text = await readSheetText(file);
            if (token !== sheetJob) return;
            sheetState.kind = 'text';
            sheetState.text = text;
            setSheetDelimiter('auto');
            sheetDelim.classList.remove('is-disabled');
        }
        updateSheetFileInfo();
        await sheetRebuild();
        if (sheetState.truncated && sheetState.json) {
            setSheetTip(sheetT('sheetTipTruncated', '已按上限截断，只转换前 {n} 行')
                .replace('{n}', String(SHEET_LIMITS.maxRows)), 'diff');
        }
    } catch (err) {
        sheetProgressSet(null);
        const message = String((err && err.message) || err);
        const text = /不支持解压|DecompressionStream/.test(message)
            ? sheetT('sheetTipNoZip', '当前环境不支持解压 xlsx，请另存为 CSV 后再转换')
            : sheetT('sheetParseFailed', '解析失败：{e}').replace('{e}', message);
        setSheetTip(text, 'err');
    } finally {
        if (token === sheetJob) sheetBusy = false;
    }
}

function openSheetSample(name) {
    const text = SHEET_SAMPLE_DATA[name];
    if (!text) return;
    ++sheetJob;
    resetSheetState();
    sheetState.kind = 'text';
    sheetState.text = text;
    sheetState.fileName = 'sample-' + name + '.csv';
    sheetState.fileSize = text.length;
    setSheetDelimiter('auto');
    sheetDelim.classList.remove('is-disabled');
    updateSheetFileInfo();
    sheetRebuild();
}

// 宿主的保存通道：DBX 的 webview 里 <a download> 常被拦掉（点了没反应），
// 所以优先走 dbxPlugin.fileTransfer.beginSave → write → finish，实在没有才回退到浏览器下载。
function getHostFileTransfer() {
    const ft = window.dbxPlugin && window.dbxPlugin.fileTransfer;
    if (!ft) return null;
    if (typeof ft.beginSave !== 'function' || typeof ft.write !== 'function' || typeof ft.finish !== 'function') return null;
    const caps = (window.dbxPlugin.capabilities || {}).fileTransfer || {};
    if (caps.beginSave === false) return null;
    return ft;
}

/* 保存结果的统一口径（saveTextFile / saveBinaryFile 只返回这四种）：
     host       宿主通道写盘成功（正式包里正常路径）
     browser    没有宿主通道（或宿主失败）→ 已发起浏览器下载
     cancelled  用户在选择框里点了取消
     failed     两条路都不通（比如浏览器下载 API 不可用）
   早先失败也返回 browser、调用方又一律 toast「已导出」，于是「点了没反应还说成功」，
   用户只能看到一句成功提示却找不到文件。现在调用方一律用 saveToast() 如实报。 */
function saveToast(status, okText) {
    if (status === 'cancelled') {
        showToast(currentDict.saveCancelled || '已取消导出', 'error');
        return;
    }
    if (status === 'failed') {
        showToast(currentDict.saveFailed || '导出失败', 'error');
        return;
    }
    showToast(okText);
}

function encodeSheetChunk(bytes) {
    let binary = '';
    const step = 0x8000;
    for (let i = 0; i < bytes.length; i += step) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
    }
    return btoa(binary);
}

// 优先用原生 TextEncoder；没有时才手工编 UTF-8。
// 手工版必须预分配：早期用数组 push 再 Uint8Array.from，13 M 字符的
// Base64 会先长出十几万个装箱数字，宿主直接爆内存。
function encodeUtf8(text) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text);
    var s = String(text);
    var out = new Uint8Array(s.length * 3);
    var p = 0;
    for (var i = 0; i < s.length; i++) {
        var code = s.charCodeAt(i);
        if (code >= 0xd800 && code <= 0xdbff && i + 1 < s.length) {
            var next = s.charCodeAt(i + 1);
            if (next >= 0xdc00 && next <= 0xdfff) {
                code = ((code - 0xd800) << 10) + (next - 0xdc00) + 0x10000;
                i++;
            }
        }
        if (code < 0x80) {
            out[p++] = code;
        } else if (code < 0x800) {
            out[p++] = 0xc0 | (code >> 6);
            out[p++] = 0x80 | (code & 63);
        } else if (code < 0x10000) {
            out[p++] = 0xe0 | (code >> 12);
            out[p++] = 0x80 | ((code >> 6) & 63);
            out[p++] = 0x80 | (code & 63);
        } else {
            out[p++] = 0xf0 | (code >> 18);
            out[p++] = 0x80 | ((code >> 12) & 63);
            out[p++] = 0x80 | ((code >> 6) & 63);
            out[p++] = 0x80 | (code & 63);
        }
    }
    return out.subarray(0, p);
}

function browserSaveFile(name, text, mime) {
    try {
        const blob = new Blob([text], { type: mime });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = name;
        link.rel = 'noopener';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        return true;
    } catch (err) {
        console.error('[Save] browser download failed:', err);
        return false;
    }
}

function browserSaveBinary(name, base64, mime) {
    try {
        const bytes = DBXImg.base64ToBytes(base64);
        const blob = new Blob([bytes], { type: mime || 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = name;
        link.rel = 'noopener';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        return true;
    } catch (err) {
        console.error('[Save] browser download (binary) failed:', err);
        return false;
    }
}

/* 返回 'host' / 'browser' / 'cancelled' / 'failed'
   宿主通道照 aes-tools 的写法：beginSave 同步取 Promise（它同步抛错也能当场接住），
   写盘放到 IIFE 里 await；中途任何一步失败都先 cancel 句柄，再退回浏览器下载。
   直接 `await beginSave()` 在宿主里出过「点了没反应也不报错」的问题，别改回去。 */
function saveTextFile(name, text, mime) {
    const ft = getHostFileTransfer();
    if (!ft) {
        return Promise.resolve(browserSaveFile(name, text, mime) ? 'browser' : 'failed');
    }
    let savePromise;
    try {
        savePromise = ft.beginSave({ name: name, contentType: mime });
    } catch (err) {
        console.error('[Save] beginSave() threw synchronously:', err);
        return Promise.resolve(browserSaveFile(name, text, mime) ? 'browser' : 'failed');
    }
    return (async () => {
        let handleId = null;
        try {
            const handle = await savePromise;
            // 用户在选择框里点了取消
            if (!handle || !handle.handleId) return 'cancelled';
            handleId = handle.handleId;
            const chunkBytes = handle.chunkBytes > 0 ? handle.chunkBytes : 1024 * 1024;
            const bytes = encodeUtf8(text);
            for (let offset = 0; offset < bytes.length; offset += chunkBytes) {
                const end = Math.min(offset + chunkBytes, bytes.length);
                await ft.write(handleId, offset, encodeSheetChunk(bytes.subarray(offset, end)));
            }
            await ft.finish(handleId);
            handleId = null;
            return 'host';
        } catch (err) {
            if (handleId && typeof ft.cancel === 'function') {
                try { await ft.cancel(handleId); } catch (e) { /* 句柄可能已经关了 */ }
            }
            console.error('[Save] host save failed, fallback to download:', err);
            return browserSaveFile(name, text, mime) ? 'browser' : 'failed';
        }
    })();
}

async function exportSheetJson() {
    const btn = document.getElementById('sheetExport');
    if (sheetBusy) {
        showToast(sheetT('sheetToastBusy', '正在生成 JSON，请稍候再导出'), 'error');
        return;
    }
    const text = currentSheetText();
    if (!text || (!sheetState.records.length && !sheetState.batch)) {
        showToast(sheetT('sheetToastEmpty', '还没有可导出的内容'), 'error');
        return;
    }
    const isSql = sheetOutputMode === 'sql';
    const base = (sheetState.fileName || 'data').replace(/\.[^.]+$/, '') || 'data';
    btn.disabled = true;
    try {
        const status = await saveTextFile(
            base + (isSql ? '.sql' : '.json'),
            text,
            isSql ? 'text/plain;charset=utf-8' : 'application/json;charset=utf-8'
        );
        saveToast(status, sheetT(isSql ? 'sheetToastExportedSql' : 'sheetToastExported', '已导出 JSON 文件'));
    } catch (err) {
        const message = String((err && err.message) || err);
        showToast(sheetT('sheetToastExportFail', '导出失败：{e}').replace('{e}', message), 'error');
    } finally {
        btn.disabled = false;
    }
}

function refreshSheetI18n() {
    updateSheetFileInfo();
    applySheetOutputModeUi();
    applySheetLimitUi();
    applySheetNoteUi();
    if (!sheetState.rows.length) {
        sheetIdleTip();
        return;
    }
    if (sheetState.json) {
        setSheetTip(sheetDoneTip(sheetState.records.length, sheetState.headers.length), 'ok');
    }
    // 分隔符、条数等控件的文案是动态拼的，切语言后重画一次预览表
    renderSheetTable();
}

function enterSheetMode() {
    exitOtherModes('sheet');
    if (isDiffMode) {
        isDiffMode = false;
        diffReport.classList.remove('show');
        diffWorkspace.classList.remove('active');
        toggleDiffBtn.textContent = currentDict.diffBtn || '对比差异';
        toggleDiffBtn.classList.remove('btn-diff');
    }
    sheetModeActive = true;
    markConvertActive(null);
    mainWorkspace.classList.add('hidden');
    toolbarEl.classList.add('hidden');
    sheetWorkspace.classList.add('active');
    navSheetLink.classList.add('active');

    ensureSheetEditor();
    updateSheetFileInfo();
    if (!sheetState.json) sheetIdleTip();
    requestAnimationFrame(() => sheetOutputEditor.refresh());
}

function exitSheetMode() {
    if (!sheetModeActive) return;
    sheetModeActive = false;
    sheetWorkspace.classList.remove('active');
    navSheetLink.classList.remove('active');
    toolbarEl.classList.remove('hidden');
    mainWorkspace.classList.remove('hidden');
    requestAnimationFrame(() => {
        inputEditor.refresh();
        outputEditor.refresh();
    });
}

document.getElementById('sheetPick').addEventListener('click', () => sheetFileInput.click());
sheetFileInput.addEventListener('change', () => {
    const file = sheetFileInput.files && sheetFileInput.files[0];
    if (file) openSheetFile(file);
    // 同一个文件再选一次也要能触发 change
    sheetFileInput.value = '';
});
sheetSamples.addEventListener('click', (e) => {
    const chip = e.target.closest('.sample-chip');
    if (chip) openSheetSample(chip.dataset.sample);
});
sheetDelim.addEventListener('click', (e) => {
    const tab = e.target.closest('.compare-tab');
    if (!tab || sheetDelim.classList.contains('is-disabled')) return;
    setSheetDelimiter(tab.dataset.delim);
    if (sheetState.kind === 'text') sheetRebuild();
});
[sheetHeaderBox, sheetNumbersBox, sheetBoolsBox].forEach((box) => {
    box.addEventListener('change', () => {
        // 表头开关会影响「第二行为注释」是否可选，先同步 UI 再重算
        if (box === sheetHeaderBox) applySheetNoteUi();
        if (sheetState.kind) sheetRebuild();
    });
});
// 第二行是数据还是说明，交给用户定：勾选才跳过，取消即恢复
sheetSkipNoteBox.addEventListener('change', () => {
    applySheetNoteUi();
    if (sheetState.kind) sheetRebuild();
});
sheetNoteHint.addEventListener('click', () => {
    sheetSkipNoteBox.checked = true;
    applySheetNoteUi();
    if (sheetState.kind) sheetRebuild();
});
// 条数上限：下拉是自己画的组件，选中后它抛 change（detail 是新值）
sheetLimitEl.addEventListener('change', (e) => setSheetLimit(e.detail));
// 预览里内容会被省略号截断，双击看全文
sheetTable.addEventListener('dblclick', (e) => {
    const td = e.target.closest('td[data-row]');
    if (!td) return;
    openSheetCellPop(parseInt(td.dataset.row, 10), parseInt(td.dataset.col, 10));
});
sheetCellPopClose.addEventListener('click', closeSheetCellPop);
// 横向滚动条：拖动 / 点轨道 / 面板尺寸变化都要跟着走
sheetTableWrap.addEventListener('scroll', syncSheetHScroll);
window.addEventListener('resize', scheduleSyncSheetHScroll);
if (typeof ResizeObserver === 'function') {
    new ResizeObserver(scheduleSyncSheetHScroll).observe(sheetTableWrap);
}
sheetHScrollThumb.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const overflow = sheetTableWrap.scrollWidth - sheetTableWrap.clientWidth;
    const maxLeft = sheetHScrollTrack.clientWidth - sheetHScrollThumb.offsetWidth;
    if (overflow <= 0 || maxLeft <= 0) return;
    const startX = e.clientX;
    const startScroll = sheetTableWrap.scrollLeft;
    sheetHScroll.classList.add('dragging');
    const onMove = (ev) => {
        const delta = (ev.clientX - startX) * (overflow / maxLeft);
        sheetTableWrap.scrollLeft = Math.min(overflow, Math.max(0, startScroll + delta));
    };
    const onUp = () => {
        sheetHScroll.classList.remove('dragging');
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
});
sheetHScrollTrack.addEventListener('pointerdown', (e) => {
    if (e.target === sheetHScrollThumb) return;
    const rect = sheetHScrollTrack.getBoundingClientRect();
    const thumbW = sheetHScrollThumb.offsetWidth;
    const span = rect.width - thumbW;
    if (span <= 0) return;
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left - thumbW / 2) / span));
    sheetTableWrap.scrollLeft = ratio * (sheetTableWrap.scrollWidth - sheetTableWrap.clientWidth);
    syncSheetHScroll();
});
sheetCellPop.addEventListener('click', (e) => {
    if (e.target === sheetCellPop) closeSheetCellPop();
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !sheetCellPop.hidden) closeSheetCellPop();
});
sheetCellPopCopy.addEventListener('click', async () => {
    try {
        await writeClipboardText(sheetCellPop.dataset.value || '');
        showToast(currentDict.toastCopySuccess || '已复制');
    } catch (err) {
        showToast(currentDict.toastCopyError || '复制失败', 'error');
    }
});
sheetFormatTabs.addEventListener('click', (e) => {
    const tab = e.target.closest('.compare-tab');
    if (!tab || tab.classList.contains('active')) return;
    setSheetFormat(tab.dataset.format);
});
sheetOutputModeTabs.addEventListener('click', (e) => {
    const tab = e.target.closest('.compare-tab');
    if (!tab || tab.classList.contains('active')) return;
    setSheetOutputMode(tab.dataset.mode);
});
// 表名只在失焦 / 回车时重排，避免每敲一个字符就重算整张表
sheetTableNameInput.addEventListener('change', () => {
    if (sheetOutputMode === 'sql' && sheetState.records.length) sheetReserialize();
});
document.getElementById('sheetExport').addEventListener('click', exportSheetJson);
document.getElementById('sheetCopy').addEventListener('click', async () => {
    const text = currentSheetText();
    if (!text) {
        showToast(sheetT('sheetToastEmpty', '还没有可导出的内容'), 'error');
        return;
    }
    try {
        await writeClipboardText(text);
        showToast(currentDict.toastCopySuccess || '已复制');
    } catch (err) {
        showToast(currentDict.toastCopyError || '复制失败', 'error');
    }
});
document.getElementById('sheetClear').addEventListener('click', () => {
    ++sheetJob;
    resetSheetState();
    setSheetDelimiter('auto');
    sheetDelim.classList.remove('is-disabled');
    updateSheetFileInfo();
    sheetProgressSet(null);
    sheetEmpty.classList.remove('hidden');
    sheetTable.innerHTML = '';
    sheetInCount.textContent = '0 × 0';
    ensureSheetEditor();
    renderSheetOutput('', 0);
    sheetIdleTip();
});
// 拖拽：直接把文件丢到预览区
['dragenter', 'dragover'].forEach((type) => {
    sheetTableWrap.addEventListener(type, (e) => {
        e.preventDefault();
        sheetTableWrap.classList.add('dragover');
    });
});
['dragleave', 'dragend'].forEach((type) => {
    sheetTableWrap.addEventListener(type, () => sheetTableWrap.classList.remove('dragover'));
});
sheetTableWrap.addEventListener('drop', (e) => {
    e.preventDefault();
    sheetTableWrap.classList.remove('dragover');
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) openSheetFile(file);
});

// =========================================
