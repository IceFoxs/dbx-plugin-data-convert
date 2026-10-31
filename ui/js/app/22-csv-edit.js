/* 22-csv-edit.js — CSV 编辑页
 *
 * 左边是 CodeMirror 源码，右边是可编辑表格。两块内容说的是同一份数据，
 * 所以下面几件事必须一直成立：
 *   1. 表格只渲染视口里的行（懒加载），十万行和十行的 DOM 一样多；
 *   2. 两边互相定位：点表格某行 → 源码光标跳到那一行；源码光标动 → 表格滚到那条记录；
 *   3. 谁改的谁负责同步：改表格 → 重写源码；改源码 → 解析回表格。
 *      中间用 csvApplyingSource / csvSourceDirty 两个闸门挡住回环。
 *   4. 失败要看得见：解析失败、文件超限、复制失败都给具体原因，不吞异常。
 *
 * 内核在 ui/js/csvedit.js（window.DBXCsv），这里只做界面与 IO。
 */
/* eslint-disable no-unused-vars */

/* 这一页自己的文案表：14 种语言，键集合与 zh-CN 严格一致（i18n.test 守着）。
   JSON / Markdown / LF / CRLF / Tab 这些是格式名，各语言不译。 */
const CSV_I18N = {
    'zh-CN': {
        navCsv: 'CSV 编辑', csvSource: 'CSV 源码', csvTable: '表格',
        csvParse: '解析到表格', csvSync: '同步源码', csvOpen: '打开 CSV',
        csvSamples: '示例', csvSampleBasic: '简单表格', csvSampleOrders: '订单流水', csvSampleQuoted: '引号与换行',
        csvCopy: '复制', csvCopyCsv: '复制 CSV', csvDownload: '下载 CSV', csvClear: '清空',
        csvDelim: '分隔符', csvDelimAuto: '自动', csvQuote: '引号',
        csvHeader: '首行为表头', csvTrim: '去首尾空白', csvSkipEmpty: '跳过空行', csvBom: 'UTF-8 BOM', csvEol: '换行',
        csvAddRow: '+ 行', csvAddCol: '+ 列', csvDelRow: '删行', csvDelCol: '删列',
        csvSortAsc: '升序', csvSortDesc: '降序', csvUndo: '撤销', csvRedo: '重做',
        csvFindPh: '查找，定位单元格', csvFindPrev: '上一个命中', csvFindNext: '下一个命中', csvOnlyHits: '只看命中', csvReplacePh: '替换为', csvReplaceAll: '全部替换', csvReplaceOne: '替换', csvEditHeader: '双击修改列名', csvTipHeadEdit: '双击列名可修改', csvCellEditTitle: '编辑单元格', csvCellSave: '保存', csvCellCancel: '取消', csvCellExpand: '放大编辑', csvCellHint: '{n} 字符 · ⌘/Ctrl + Enter 保存，Esc 取消',
        csvTabTable: '表格', csvTabJson: 'JSON', csvTabMarkdown: 'Markdown', csvMdPreview: '预览', csvMdSource: '源码',
        csvEmptyHint: '打开 CSV、贴一段文本，或把文件拖到这里',
        csvNoFile: '未选择文件',
        csvTipParsed: '{r} 行 · {c} 列 · {s}',
        csvTipCopied: '已复制（{s}）', csvTipSaved: '已保存 {name}',
        csvTipEmpty: '没有可复制的内容', csvTipTooBig: '文件 {s} 超过 {max} 上限，请先拆分',
        csvTipBig: '内容较大，改完点「解析到表格」应用',
        csvTipSel: '已定位到第 {r} 行', csvTipNoSel: '先选一个单元格', csvTipNoMatch: '没有匹配的行', csvTipNoFind: '先输入要查找的内容',
        csvTipReplaced: '已替换 {n} 处', csvTipTruncated: '超过上限，只载入了前 {n} 行',
        csvTipBadType: '只支持 .csv / .tsv / .txt', csvTipParseFail: '解析失败：{e}',
        csvStatShape: '{r} 行 × {c} 列', csvStatCells: '{n} 单元格', csvStatSize: '{s}'
    },
    'zh-TW': {
        navCsv: 'CSV 編輯', csvSource: 'CSV 原始碼', csvTable: '表格',
        csvParse: '解析到表格', csvSync: '同步原始碼', csvOpen: '開啟 CSV',
        csvSamples: '範例', csvSampleBasic: '簡單表格', csvSampleOrders: '訂單流水', csvSampleQuoted: '引號與換行',
        csvCopy: '複製', csvCopyCsv: '複製 CSV', csvDownload: '下載 CSV', csvClear: '清空',
        csvDelim: '分隔符', csvDelimAuto: '自動', csvQuote: '引號',
        csvHeader: '首列為表頭', csvTrim: '去前後空白', csvSkipEmpty: '跳過空行', csvBom: 'UTF-8 BOM', csvEol: '換行',
        csvAddRow: '+ 列', csvAddCol: '+ 欄', csvDelRow: '刪列', csvDelCol: '刪欄',
        csvSortAsc: '升冪', csvSortDesc: '降冪', csvUndo: '復原', csvRedo: '重做',
        csvFindPh: '搜尋，定位儲存格', csvFindPrev: '上一個命中', csvFindNext: '下一個命中', csvOnlyHits: '只看命中', csvReplacePh: '取代為', csvReplaceAll: '全部取代', csvReplaceOne: '取代', csvEditHeader: '雙擊修改欄名', csvTipHeadEdit: '雙擊欄名可修改', csvCellEditTitle: '編輯儲存格', csvCellSave: '儲存', csvCellCancel: '取消', csvCellExpand: '放大編輯', csvCellHint: '{n} 字元 · ⌘/Ctrl + Enter 儲存，Esc 取消',
        csvTabTable: '表格', csvTabJson: 'JSON', csvTabMarkdown: 'Markdown', csvMdPreview: '預覽', csvMdSource: '原始碼',
        csvEmptyHint: '開啟 CSV、貼上一段文字，或把檔案拖到這裡',
        csvNoFile: '未選擇檔案',
        csvTipParsed: '{r} 列 · {c} 欄 · {s}',
        csvTipCopied: '已複製（{s}）', csvTipSaved: '已儲存 {name}',
        csvTipEmpty: '沒有可複製的內容', csvTipTooBig: '檔案 {s} 超過 {max} 上限，請先拆分',
        csvTipBig: '內容較大，修改後點「解析到表格」套用',
        csvTipSel: '已定位到第 {r} 列', csvTipNoSel: '先選一個儲存格', csvTipNoMatch: '沒有符合的列', csvTipNoFind: '先輸入要尋找的內容',
        csvTipReplaced: '已取代 {n} 處', csvTipTruncated: '超過上限，只載入了前 {n} 列',
        csvTipBadType: '只支援 .csv / .tsv / .txt', csvTipParseFail: '解析失敗：{e}',
        csvStatShape: '{r} 列 × {c} 欄', csvStatCells: '{n} 儲存格', csvStatSize: '{s}'
    },
    en: {
        navCsv: 'CSV Editor', csvSource: 'CSV source', csvTable: 'Table',
        csvParse: 'Parse to table', csvSync: 'Sync source', csvOpen: 'Open CSV',
        csvSamples: 'Samples', csvSampleBasic: 'Simple table', csvSampleOrders: 'Orders', csvSampleQuoted: 'Quotes & newlines',
        csvCopy: 'Copy', csvCopyCsv: 'Copy CSV', csvDownload: 'Download CSV', csvClear: 'Clear',
        csvDelim: 'Delimiter', csvDelimAuto: 'Auto', csvQuote: 'Quote',
        csvHeader: 'First row is header', csvTrim: 'Trim cells', csvSkipEmpty: 'Skip empty rows', csvBom: 'UTF-8 BOM', csvEol: 'Line ending',
        csvAddRow: '+ Row', csvAddCol: '+ Column', csvDelRow: 'Del row', csvDelCol: 'Del column',
        csvSortAsc: 'Sort A→Z', csvSortDesc: 'Sort Z→A', csvUndo: 'Undo', csvRedo: 'Redo',
        csvFindPh: 'Find, jump to cell', csvFindPrev: 'Previous match', csvFindNext: 'Next match', csvOnlyHits: 'Only matches', csvReplacePh: 'Replace with', csvReplaceAll: 'Replace all', csvReplaceOne: 'Replace', csvEditHeader: 'Double-click to rename', csvTipHeadEdit: 'Double-click a column name to edit it', csvCellEditTitle: 'Edit cell', csvCellSave: 'Save', csvCellCancel: 'Cancel', csvCellExpand: 'Expand editor', csvCellHint: '{n} characters · ⌘/Ctrl + Enter to save, Esc to cancel',
        csvTabTable: 'Table', csvTabJson: 'JSON', csvTabMarkdown: 'Markdown', csvMdPreview: 'Preview', csvMdSource: 'Source',
        csvEmptyHint: 'Open a CSV, paste some text, or drop a file here',
        csvNoFile: 'No file selected',
        csvTipParsed: '{r} rows · {c} columns · {s}',
        csvTipCopied: 'Copied ({s})', csvTipSaved: 'Saved {name}',
        csvTipEmpty: 'Nothing to copy', csvTipTooBig: 'File is {s}, over the {max} limit — split it first',
        csvTipBig: 'Large content — click "Parse to table" to apply your edits',
        csvTipSel: 'Jumped to row {r}', csvTipNoSel: 'Select a cell first', csvTipNoMatch: 'No matching rows', csvTipNoFind: 'Type something to find first',
        csvTipReplaced: 'Replaced {n} occurrences', csvTipTruncated: 'Over the limit, only the first {n} rows were loaded',
        csvTipBadType: 'Only .csv / .tsv / .txt are supported', csvTipParseFail: 'Parse failed: {e}',
        csvStatShape: '{r} rows × {c} cols', csvStatCells: '{n} cells', csvStatSize: '{s}'
    },
    az: {
        navCsv: 'CSV redaktoru', csvSource: 'CSV mətni', csvTable: 'Cədvəl',
        csvParse: 'Cədvələ çevir', csvSync: 'Mətni yenilə', csvOpen: 'CSV aç',
        csvSamples: 'Nümunələr', csvSampleBasic: 'Sadə cədvəl', csvSampleOrders: 'Sifarişlər', csvSampleQuoted: 'Dırnaq və sətir',
        csvCopy: 'Kopyala', csvCopyCsv: 'CSV kopyala', csvDownload: 'CSV yüklə', csvClear: 'Təmizlə',
        csvDelim: 'Ayırıcı', csvDelimAuto: 'Avtomatik', csvQuote: 'Dırnaq',
        csvHeader: 'Birinci sətir başlıqdır', csvTrim: 'Boşluqları sil', csvSkipEmpty: 'Boş sətirləri keç', csvBom: 'UTF-8 BOM', csvEol: 'Sətir sonu',
        csvAddRow: '+ Sətir', csvAddCol: '+ Sütun', csvDelRow: 'Sətri sil', csvDelCol: 'Sütunu sil',
        csvSortAsc: 'Artan', csvSortDesc: 'Azalan', csvUndo: 'Geri al', csvRedo: 'Təkrarla',
        csvFindPh: 'Axtar, xanaya keç', csvFindPrev: 'Əvvəlki uyğunluq', csvFindNext: 'Növbəti uyğunluq', csvOnlyHits: 'Yalnız uyğunlar', csvReplacePh: 'Əvəz et', csvReplaceAll: 'Hamısını əvəz et', csvReplaceOne: 'Əvəz et', csvEditHeader: 'Adı dəyişmək üçün iki klik', csvTipHeadEdit: 'Sütun adını redaktə etmək üçün iki klikləyin', csvCellEditTitle: 'Xananı redaktə et', csvCellSave: 'Saxla', csvCellCancel: 'Ləğv et', csvCellExpand: 'Geniş redaktor', csvCellHint: '{n} simvol · Saxlamaq üçün ⌘/Ctrl + Enter, ləğv üçün Esc',
        csvTabTable: 'Cədvəl', csvTabJson: 'JSON', csvTabMarkdown: 'Markdown', csvMdPreview: 'Ön izləmə', csvMdSource: 'Mənbə',
        csvEmptyHint: 'CSV açın, mətn yapışdırın və ya faylı bura sürükləyin',
        csvNoFile: 'Fayl seçilməyib',
        csvTipParsed: '{r} sətir · {c} sütun · {s}',
        csvTipCopied: 'Kopyalandı ({s})', csvTipSaved: '{name} saxlanıldı',
        csvTipEmpty: 'Kopyalamaq üçün məzmun yoxdur', csvTipTooBig: 'Fayl {s}, {max} həddini aşır — əvvəlcə bölün',
        csvTipBig: 'Məzmun böyükdür — dəyişiklikləri tətbiq etmək üçün «Cədvələ çevir» düyməsini basın',
        csvTipSel: '{r}-ci sətrə keçildi', csvTipNoSel: 'Əvvəlcə xana seçin', csvTipNoMatch: 'Uyğun sətir yoxdur', csvTipNoFind: 'Əvvəlcə axtarılacaq mətni yazın',
        csvTipReplaced: '{n} yerdə əvəz edildi', csvTipTruncated: 'Hədd aşıldı, yalnız ilk {n} sətir yükləndi',
        csvTipBadType: 'Yalnız .csv / .tsv / .txt dəstəklənir', csvTipParseFail: 'Analiz alınmadı: {e}',
        csvStatShape: '{r} sətir × {c} sütun', csvStatCells: '{n} xana', csvStatSize: '{s}'
    },
    es: {
        navCsv: 'Editor CSV', csvSource: 'Código CSV', csvTable: 'Tabla',
        csvParse: 'Pasar a tabla', csvSync: 'Sincronizar', csvOpen: 'Abrir CSV',
        csvSamples: 'Ejemplos', csvSampleBasic: 'Tabla simple', csvSampleOrders: 'Pedidos', csvSampleQuoted: 'Comillas y saltos',
        csvCopy: 'Copiar', csvCopyCsv: 'Copiar CSV', csvDownload: 'Descargar CSV', csvClear: 'Limpiar',
        csvDelim: 'Separador', csvDelimAuto: 'Auto', csvQuote: 'Comillas',
        csvHeader: 'La primera fila es cabecera', csvTrim: 'Recortar celdas', csvSkipEmpty: 'Omitir filas vacías', csvBom: 'UTF-8 BOM', csvEol: 'Fin de línea',
        csvAddRow: '+ Fila', csvAddCol: '+ Columna', csvDelRow: 'Borrar fila', csvDelCol: 'Borrar columna',
        csvSortAsc: 'Ascendente', csvSortDesc: 'Descendente', csvUndo: 'Deshacer', csvRedo: 'Rehacer',
        csvFindPh: 'Buscar, ir a la celda', csvFindPrev: 'Coincidencia anterior', csvFindNext: 'Coincidencia siguiente', csvOnlyHits: 'Solo coincidencias', csvReplacePh: 'Reemplazar por', csvReplaceAll: 'Reemplazar todo', csvReplaceOne: 'Reemplazar', csvEditHeader: 'Doble clic para renombrar', csvTipHeadEdit: 'Doble clic en el nombre de columna para editarlo', csvCellEditTitle: 'Editar celda', csvCellSave: 'Guardar', csvCellCancel: 'Cancelar', csvCellExpand: 'Editor ampliado', csvCellHint: '{n} caracteres · ⌘/Ctrl + Enter para guardar, Esc para cancelar',
        csvTabTable: 'Tabla', csvTabJson: 'JSON', csvTabMarkdown: 'Markdown', csvMdPreview: 'Vista previa', csvMdSource: 'Código',
        csvEmptyHint: 'Abre un CSV, pega texto o suelta un archivo aquí',
        csvNoFile: 'Ningún archivo',
        csvTipParsed: '{r} filas · {c} columnas · {s}',
        csvTipCopied: 'Copiado ({s})', csvTipSaved: 'Guardado {name}',
        csvTipEmpty: 'Nada que copiar', csvTipTooBig: 'El archivo es {s}, supera el límite de {max}: divídelo primero',
        csvTipBig: 'Contenido grande: pulsa «Pasar a tabla» para aplicar los cambios',
        csvTipSel: 'Saltó a la fila {r}', csvTipNoSel: 'Selecciona una celda', csvTipNoMatch: 'Ninguna fila coincide', csvTipNoFind: 'Escribe antes qué buscar',
        csvTipReplaced: 'Se reemplazaron {n} coincidencias', csvTipTruncated: 'Límite superado: solo se cargaron las primeras {n} filas',
        csvTipBadType: 'Solo se admiten .csv / .tsv / .txt', csvTipParseFail: 'Error al analizar: {e}',
        csvStatShape: '{r} filas × {c} columnas', csvStatCells: '{n} celdas', csvStatSize: '{s}'
    },
    id: {
        navCsv: 'Editor CSV', csvSource: 'Sumber CSV', csvTable: 'Tabel',
        csvParse: 'Urai ke tabel', csvSync: 'Sinkron sumber', csvOpen: 'Buka CSV',
        csvSamples: 'Contoh', csvSampleBasic: 'Tabel sederhana', csvSampleOrders: 'Pesanan', csvSampleQuoted: 'Kutip & baris baru',
        csvCopy: 'Salin', csvCopyCsv: 'Salin CSV', csvDownload: 'Unduh CSV', csvClear: 'Hapus',
        csvDelim: 'Pemisah', csvDelimAuto: 'Otomatis', csvQuote: 'Kutip',
        csvHeader: 'Baris pertama header', csvTrim: 'Pangkas sel', csvSkipEmpty: 'Lewati baris kosong', csvBom: 'UTF-8 BOM', csvEol: 'Akhir baris',
        csvAddRow: '+ Baris', csvAddCol: '+ Kolom', csvDelRow: 'Hapus baris', csvDelCol: 'Hapus kolom',
        csvSortAsc: 'Naik', csvSortDesc: 'Turun', csvUndo: 'Urungkan', csvRedo: 'Ulangi',
        csvFindPh: 'Cari, lompat ke sel', csvFindPrev: 'Kecocokan sebelumnya', csvFindNext: 'Kecocokan berikutnya', csvOnlyHits: 'Hanya yang cocok', csvReplacePh: 'Ganti dengan', csvReplaceAll: 'Ganti semua', csvReplaceOne: 'Ganti', csvEditHeader: 'Klik dua kali untuk mengganti nama', csvTipHeadEdit: 'Klik dua kali nama kolom untuk mengedit', csvCellEditTitle: 'Edit sel', csvCellSave: 'Simpan', csvCellCancel: 'Batal', csvCellExpand: 'Editor besar', csvCellHint: '{n} karakter · ⌘/Ctrl + Enter untuk menyimpan, Esc untuk batal',
        csvTabTable: 'Tabel', csvTabJson: 'JSON', csvTabMarkdown: 'Markdown', csvMdPreview: 'Pratinjau', csvMdSource: 'Sumber',
        csvEmptyHint: 'Buka CSV, tempel teks, atau seret berkas ke sini',
        csvNoFile: 'Belum ada berkas',
        csvTipParsed: '{r} baris · {c} kolom · {s}',
        csvTipCopied: 'Disalin ({s})', csvTipSaved: 'Tersimpan {name}',
        csvTipEmpty: 'Tidak ada yang bisa disalin', csvTipTooBig: 'Berkas {s}, melebihi batas {max} — pecah dulu',
        csvTipBig: 'Konten besar — tekan «Urai ke tabel» untuk menerapkan perubahan',
        csvTipSel: 'Lompat ke baris {r}', csvTipNoSel: 'Pilih sel dulu', csvTipNoMatch: 'Tidak ada baris cocok', csvTipNoFind: 'Isi dulu teks yang dicari',
        csvTipReplaced: '{n} penggantian', csvTipTruncated: 'Melebihi batas, hanya {n} baris pertama dimuat',
        csvTipBadType: 'Hanya .csv / .tsv / .txt', csvTipParseFail: 'Gagal mengurai: {e}',
        csvStatShape: '{r} baris × {c} kolom', csvStatCells: '{n} sel', csvStatSize: '{s}'
    },
    it: {
        navCsv: 'Editor CSV', csvSource: 'Sorgente CSV', csvTable: 'Tabella',
        csvParse: 'Converti in tabella', csvSync: 'Sincronizza', csvOpen: 'Apri CSV',
        csvSamples: 'Esempi', csvSampleBasic: 'Tabella semplice', csvSampleOrders: 'Ordini', csvSampleQuoted: 'Virgolette e a capo',
        csvCopy: 'Copia', csvCopyCsv: 'Copia CSV', csvDownload: 'Scarica CSV', csvClear: 'Pulisci',
        csvDelim: 'Separatore', csvDelimAuto: 'Auto', csvQuote: 'Virgolette',
        csvHeader: 'Prima riga è intestazione', csvTrim: 'Rifila celle', csvSkipEmpty: 'Salta righe vuote', csvBom: 'UTF-8 BOM', csvEol: 'Fine riga',
        csvAddRow: '+ Riga', csvAddCol: '+ Colonna', csvDelRow: 'Elimina riga', csvDelCol: 'Elimina colonna',
        csvSortAsc: 'Crescente', csvSortDesc: 'Decrescente', csvUndo: 'Annulla', csvRedo: 'Ripeti',
        csvFindPh: 'Cerca, vai alla cella', csvFindPrev: 'Corrispondenza precedente', csvFindNext: 'Corrispondenza successiva', csvOnlyHits: 'Solo corrispondenze', csvReplacePh: 'Sostituisci con', csvReplaceAll: 'Sostituisci tutto', csvReplaceOne: 'Sostituisci', csvEditHeader: 'Doppio clic per rinominare', csvTipHeadEdit: 'Doppio clic sul nome della colonna per modificarlo', csvCellEditTitle: 'Modifica cella', csvCellSave: 'Salva', csvCellCancel: 'Annulla', csvCellExpand: 'Editor ingrandito', csvCellHint: '{n} caratteri · ⌘/Ctrl + Enter per salvare, Esc per annullare',
        csvTabTable: 'Tabella', csvTabJson: 'JSON', csvTabMarkdown: 'Markdown', csvMdPreview: 'Anteprima', csvMdSource: 'Sorgente',
        csvEmptyHint: 'Apri un CSV, incolla del testo o trascina un file qui',
        csvNoFile: 'Nessun file',
        csvTipParsed: '{r} righe · {c} colonne · {s}',
        csvTipCopied: 'Copiato ({s})', csvTipSaved: 'Salvato {name}',
        csvTipEmpty: 'Niente da copiare', csvTipTooBig: 'Il file è {s}, oltre il limite di {max}: dividilo prima',
        csvTipBig: 'Contenuto grande: premi «Converti in tabella» per applicare le modifiche',
        csvTipSel: 'Saltato alla riga {r}', csvTipNoSel: 'Seleziona una cella', csvTipNoMatch: 'Nessuna riga corrisponde', csvTipNoFind: 'Scrivi prima cosa cercare',
        csvTipReplaced: 'Sostituite {n} occorrenze', csvTipTruncated: 'Limite superato: caricate solo le prime {n} righe',
        csvTipBadType: 'Solo .csv / .tsv / .txt', csvTipParseFail: 'Analisi fallita: {e}',
        csvStatShape: '{r} righe × {c} colonne', csvStatCells: '{n} celle', csvStatSize: '{s}'
    },
    ja: {
        navCsv: 'CSV エディタ', csvSource: 'CSV ソース', csvTable: '表',
        csvParse: '表に反映', csvSync: 'ソースを同期', csvOpen: 'CSV を開く',
        csvSamples: 'サンプル', csvSampleBasic: 'シンプルな表', csvSampleOrders: '注文データ', csvSampleQuoted: '引用符と改行',
        csvCopy: 'コピー', csvCopyCsv: 'CSV をコピー', csvDownload: 'CSV を保存', csvClear: 'クリア',
        csvDelim: '区切り文字', csvDelimAuto: '自動', csvQuote: '引用符',
        csvHeader: '先頭行はヘッダー', csvTrim: '前後の空白を削除', csvSkipEmpty: '空行を飛ばす', csvBom: 'UTF-8 BOM', csvEol: '改行コード',
        csvAddRow: '+ 行', csvAddCol: '+ 列', csvDelRow: '行を削除', csvDelCol: '列を削除',
        csvSortAsc: '昇順', csvSortDesc: '降順', csvUndo: '元に戻す', csvRedo: 'やり直す',
        csvFindPh: '検索してセルへ移動', csvFindPrev: '前の一致', csvFindNext: '次の一致', csvOnlyHits: '一致のみ表示', csvReplacePh: '置換後', csvReplaceAll: 'すべて置換', csvReplaceOne: '置換', csvEditHeader: 'ダブルクリックで列名を変更', csvTipHeadEdit: '列名をダブルクリックすると編集できます', csvCellEditTitle: 'セルを編集', csvCellSave: '保存', csvCellCancel: 'キャンセル', csvCellExpand: '拡大編集', csvCellHint: '{n} 文字 · ⌘/Ctrl + Enter で保存、Esc で取消',
        csvTabTable: '表', csvTabJson: 'JSON', csvTabMarkdown: 'Markdown', csvMdPreview: 'プレビュー', csvMdSource: 'ソース',
        csvEmptyHint: 'CSV を開くか、テキストを貼り付けるか、ファイルをここにドロップ',
        csvNoFile: 'ファイル未選択',
        csvTipParsed: '{r} 行 · {c} 列 · {s}',
        csvTipCopied: 'コピーしました（{s}）', csvTipSaved: '{name} を保存しました',
        csvTipEmpty: 'コピーする内容がありません', csvTipTooBig: 'ファイルは {s}、上限 {max} を超えています。分割してください',
        csvTipBig: '内容が大きいため、編集後に「表に反映」を押してください',
        csvTipSel: '{r} 行目に移動しました', csvTipNoSel: '先にセルを選択してください', csvTipNoMatch: '一致する行がありません', csvTipNoFind: '先に検索する内容を入力してください',
        csvTipReplaced: '{n} か所を置換しました', csvTipTruncated: '上限を超えたため先頭 {n} 行のみ読み込みました',
        csvTipBadType: '.csv / .tsv / .txt のみ対応', csvTipParseFail: '解析に失敗：{e}',
        csvStatShape: '{r} 行 × {c} 列', csvStatCells: '{n} セル', csvStatSize: '{s}'
    },
    ko: {
        navCsv: 'CSV 편집기', csvSource: 'CSV 소스', csvTable: '표',
        csvParse: '표로 반영', csvSync: '소스 동기화', csvOpen: 'CSV 열기',
        csvSamples: '예시', csvSampleBasic: '간단한 표', csvSampleOrders: '주문 내역', csvSampleQuoted: '따옴표와 줄바꿈',
        csvCopy: '복사', csvCopyCsv: 'CSV 복사', csvDownload: 'CSV 저장', csvClear: '지우기',
        csvDelim: '구분자', csvDelimAuto: '자동', csvQuote: '따옴표',
        csvHeader: '첫 행이 헤더', csvTrim: '앞뒤 공백 제거', csvSkipEmpty: '빈 행 건너뛰기', csvBom: 'UTF-8 BOM', csvEol: '줄바꿈',
        csvAddRow: '+ 행', csvAddCol: '+ 열', csvDelRow: '행 삭제', csvDelCol: '열 삭제',
        csvSortAsc: '오름차순', csvSortDesc: '내림차순', csvUndo: '실행 취소', csvRedo: '다시 실행',
        csvFindPh: '검색 후 셀로 이동', csvFindPrev: '이전 일치', csvFindNext: '다음 일치', csvOnlyHits: '일치 항목만', csvReplacePh: '바꿀 내용', csvReplaceAll: '모두 바꾸기', csvReplaceOne: '바꾸기', csvEditHeader: '두 번 클릭하여 열 이름 변경', csvTipHeadEdit: '열 이름을 두 번 클릭하면 편집됩니다', csvCellEditTitle: '셀 편집', csvCellSave: '저장', csvCellCancel: '취소', csvCellExpand: '크게 편집', csvCellHint: '{n}자 · ⌘/Ctrl + Enter 저장, Esc 취소',
        csvTabTable: '표', csvTabJson: 'JSON', csvTabMarkdown: 'Markdown', csvMdPreview: '미리보기', csvMdSource: '소스',
        csvEmptyHint: 'CSV를 열거나 텍스트를 붙여넣거나 파일을 여기로 끌어오세요',
        csvNoFile: '선택한 파일 없음',
        csvTipParsed: '{r} 행 · {c} 열 · {s}',
        csvTipCopied: '복사됨 ({s})', csvTipSaved: '{name} 저장됨',
        csvTipEmpty: '복사할 내용이 없습니다', csvTipTooBig: '파일이 {s}로 {max} 한도를 넘습니다. 먼저 나눠 주세요',
        csvTipBig: '내용이 큽니다 — 수정 후 「표로 반영」을 누르세요',
        csvTipSel: '{r}행으로 이동했습니다', csvTipNoSel: '먼저 셀을 선택하세요', csvTipNoMatch: '일치하는 행이 없습니다', csvTipNoFind: '먼저 찾을 내용을 입력하세요',
        csvTipReplaced: '{n}곳을 바꿨습니다', csvTipTruncated: '한도를 넘어 앞 {n}행만 불러왔습니다',
        csvTipBadType: '.csv / .tsv / .txt만 지원합니다', csvTipParseFail: '구문 분석 실패: {e}',
        csvStatShape: '{r} 행 × {c} 열', csvStatCells: '{n} 셀', csvStatSize: '{s}'
    },
    pt: {
        navCsv: 'Editor CSV', csvSource: 'Fonte CSV', csvTable: 'Tabela',
        csvParse: 'Aplicar na tabela', csvSync: 'Sincronizar fonte', csvOpen: 'Abrir CSV',
        csvSamples: 'Exemplos', csvSampleBasic: 'Tabela simples', csvSampleOrders: 'Pedidos', csvSampleQuoted: 'Aspas e quebras',
        csvCopy: 'Copiar', csvCopyCsv: 'Copiar CSV', csvDownload: 'Baixar CSV', csvClear: 'Limpar',
        csvDelim: 'Separador', csvDelimAuto: 'Auto', csvQuote: 'Aspas',
        csvHeader: 'Primeira linha é cabeçalho', csvTrim: 'Aparar células', csvSkipEmpty: 'Pular linhas vazias', csvBom: 'UTF-8 BOM', csvEol: 'Fim de linha',
        csvAddRow: '+ Linha', csvAddCol: '+ Coluna', csvDelRow: 'Excluir linha', csvDelCol: 'Excluir coluna',
        csvSortAsc: 'Crescente', csvSortDesc: 'Decrescente', csvUndo: 'Desfazer', csvRedo: 'Refazer',
        csvFindPh: 'Buscar, ir à célula', csvFindPrev: 'Ocorrência anterior', csvFindNext: 'Próxima ocorrência', csvOnlyHits: 'Somente ocorrências', csvReplacePh: 'Substituir por', csvReplaceAll: 'Substituir tudo', csvReplaceOne: 'Substituir', csvEditHeader: 'Clique duplo para renomear', csvTipHeadEdit: 'Clique duas vezes no nome da coluna para editar', csvCellEditTitle: 'Editar célula', csvCellSave: 'Salvar', csvCellCancel: 'Cancelar', csvCellExpand: 'Editor ampliado', csvCellHint: '{n} caracteres · ⌘/Ctrl + Enter para salvar, Esc para cancelar',
        csvTabTable: 'Tabela', csvTabJson: 'JSON', csvTabMarkdown: 'Markdown', csvMdPreview: 'Pré-visualizar', csvMdSource: 'Código',
        csvEmptyHint: 'Abra um CSV, cole um texto ou solte um arquivo aqui',
        csvNoFile: 'Nenhum arquivo',
        csvTipParsed: '{r} linhas · {c} colunas · {s}',
        csvTipCopied: 'Copiado ({s})', csvTipSaved: 'Salvo {name}',
        csvTipEmpty: 'Nada para copiar', csvTipTooBig: 'O arquivo tem {s}, acima do limite de {max} — divida primeiro',
        csvTipBig: 'Conteúdo grande — clique em «Aplicar na tabela» para aplicar as mudanças',
        csvTipSel: 'Foi para a linha {r}', csvTipNoSel: 'Selecione uma célula', csvTipNoMatch: 'Nenhuma linha corresponde', csvTipNoFind: 'Digite antes o que buscar',
        csvTipReplaced: '{n} ocorrências substituídas', csvTipTruncated: 'Limite excedido: apenas as primeiras {n} linhas foram carregadas',
        csvTipBadType: 'Apenas .csv / .tsv / .txt', csvTipParseFail: 'Falha ao analisar: {e}',
        csvStatShape: '{r} linhas × {c} colunas', csvStatCells: '{n} células', csvStatSize: '{s}'
    },
    pl: {
        navCsv: 'Edytor CSV', csvSource: 'Źródło CSV', csvTable: 'Tabela',
        csvParse: 'Zastosuj w tabeli', csvSync: 'Synchronizuj źródło', csvOpen: 'Otwórz CSV',
        csvSamples: 'Przykłady', csvSampleBasic: 'Prosta tabela', csvSampleOrders: 'Zamówienia', csvSampleQuoted: 'Cudzysłowy i nowe linie',
        csvCopy: 'Kopiuj', csvCopyCsv: 'Kopiuj CSV', csvDownload: 'Pobierz CSV', csvClear: 'Wyczyść',
        csvDelim: 'Separator', csvDelimAuto: 'Auto', csvQuote: 'Cudzysłów',
        csvHeader: 'Pierwszy wiersz to nagłówek', csvTrim: 'Przycinaj komórki', csvSkipEmpty: 'Pomijaj puste wiersze', csvBom: 'UTF-8 BOM', csvEol: 'Koniec wiersza',
        csvAddRow: '+ Wiersz', csvAddCol: '+ Kolumna', csvDelRow: 'Usuń wiersz', csvDelCol: 'Usuń kolumnę',
        csvSortAsc: 'Rosnąco', csvSortDesc: 'Malejąco', csvUndo: 'Cofnij', csvRedo: 'Ponów',
        csvFindPh: 'Szukaj, przejdź do komórki', csvFindPrev: 'Poprzednie trafienie', csvFindNext: 'Następne trafienie', csvOnlyHits: 'Tylko trafienia', csvReplacePh: 'Zamień na', csvReplaceAll: 'Zamień wszystko', csvReplaceOne: 'Zamień', csvEditHeader: 'Kliknij dwukrotnie, aby zmienić nazwę', csvTipHeadEdit: 'Kliknij dwukrotnie nazwę kolumny, aby ją edytować', csvCellEditTitle: 'Edytuj komórkę', csvCellSave: 'Zapisz', csvCellCancel: 'Anuluj', csvCellExpand: 'Edytor powiększony', csvCellHint: '{n} znaków · ⌘/Ctrl + Enter zapisuje, Esc anuluje',
        csvTabTable: 'Tabela', csvTabJson: 'JSON', csvTabMarkdown: 'Markdown', csvMdPreview: 'Podgląd', csvMdSource: 'Źródło',
        csvEmptyHint: 'Otwórz CSV, wklej tekst lub przeciągnij plik tutaj',
        csvNoFile: 'Nie wybrano pliku',
        csvTipParsed: '{r} wierszy · {c} kolumn · {s}',
        csvTipCopied: 'Skopiowano ({s})', csvTipSaved: 'Zapisano {name}',
        csvTipEmpty: 'Nie ma czego kopiować', csvTipTooBig: 'Plik ma {s}, przekracza limit {max} — najpierw go podziel',
        csvTipBig: 'Duża zawartość — kliknij «Zastosuj w tabeli», aby zatwierdzić zmiany',
        csvTipSel: 'Przejście do wiersza {r}', csvTipNoSel: 'Najpierw wybierz komórkę', csvTipNoMatch: 'Brak pasujących wierszy', csvTipNoFind: 'Najpierw wpisz szukany tekst',
        csvTipReplaced: 'Zamieniono {n} wystąpień', csvTipTruncated: 'Przekroczono limit, wczytano pierwsze {n} wierszy',
        csvTipBadType: 'Obsługiwane tylko .csv / .tsv / .txt', csvTipParseFail: 'Błąd analizy: {e}',
        csvStatShape: '{r} wierszy × {c} kolumn', csvStatCells: '{n} komórek', csvStatSize: '{s}'
    },
    ru: {
        navCsv: 'Редактор CSV', csvSource: 'Исходный CSV', csvTable: 'Таблица',
        csvParse: 'В таблицу', csvSync: 'Обновить источник', csvOpen: 'Открыть CSV',
        csvSamples: 'Примеры', csvSampleBasic: 'Простая таблица', csvSampleOrders: 'Заказы', csvSampleQuoted: 'Кавычки и переносы',
        csvCopy: 'Копировать', csvCopyCsv: 'Копировать CSV', csvDownload: 'Скачать CSV', csvClear: 'Очистить',
        csvDelim: 'Разделитель', csvDelimAuto: 'Авто', csvQuote: 'Кавычки',
        csvHeader: 'Первая строка — заголовок', csvTrim: 'Обрезать пробелы', csvSkipEmpty: 'Пропускать пустые строки', csvBom: 'UTF-8 BOM', csvEol: 'Конец строки',
        csvAddRow: '+ Строка', csvAddCol: '+ Столбец', csvDelRow: 'Удалить строку', csvDelCol: 'Удалить столбец',
        csvSortAsc: 'По возрастанию', csvSortDesc: 'По убыванию', csvUndo: 'Отменить', csvRedo: 'Повторить',
        csvFindPh: 'Поиск и переход к ячейке', csvFindPrev: 'Предыдущее совпадение', csvFindNext: 'Следующее совпадение', csvOnlyHits: 'Только совпадения', csvReplacePh: 'Заменить на', csvReplaceAll: 'Заменить всё', csvReplaceOne: 'Заменить', csvEditHeader: 'Двойной щелчок для переименования', csvTipHeadEdit: 'Дважды щёлкните имя столбца, чтобы изменить его', csvCellEditTitle: 'Изменить ячейку', csvCellSave: 'Сохранить', csvCellCancel: 'Отмена', csvCellExpand: 'Крупный редактор', csvCellHint: '{n} символов · ⌘/Ctrl + Enter — сохранить, Esc — отмена',
        csvTabTable: 'Таблица', csvTabJson: 'JSON', csvTabMarkdown: 'Markdown', csvMdPreview: 'Просмотр', csvMdSource: 'Исходник',
        csvEmptyHint: 'Откройте CSV, вставьте текст или перетащите файл сюда',
        csvNoFile: 'Файл не выбран',
        csvTipParsed: '{r} строк · {c} столбцов · {s}',
        csvTipCopied: 'Скопировано ({s})', csvTipSaved: 'Сохранено {name}',
        csvTipEmpty: 'Копировать нечего', csvTipTooBig: 'Файл {s}, больше лимита {max} — сначала разделите его',
        csvTipBig: 'Большой объём — нажмите «В таблицу», чтобы применить изменения',
        csvTipSel: 'Переход к строке {r}', csvTipNoSel: 'Сначала выберите ячейку', csvTipNoMatch: 'Совпадений нет', csvTipNoFind: 'Сначала введите, что искать',
        csvTipReplaced: 'Заменено {n} совпадений', csvTipTruncated: 'Превышен лимит, загружены первые {n} строк',
        csvTipBadType: 'Поддерживаются только .csv / .tsv / .txt', csvTipParseFail: 'Ошибка разбора: {e}',
        csvStatShape: '{r} строк × {c} столбцов', csvStatCells: '{n} ячеек', csvStatSize: '{s}'
    },
    th: {
        navCsv: 'ตัวแก้ไข CSV', csvSource: 'ซอร์ส CSV', csvTable: 'ตาราง',
        csvParse: 'แปลงเป็นตาราง', csvSync: 'ซิงก์ซอร์ส', csvOpen: 'เปิด CSV',
        csvSamples: 'ตัวอย่าง', csvSampleBasic: 'ตารางง่าย', csvSampleOrders: 'รายการสั่งซื้อ', csvSampleQuoted: 'อัญประกาศและขึ้นบรรทัด',
        csvCopy: 'คัดลอก', csvCopyCsv: 'คัดลอก CSV', csvDownload: 'ดาวน์โหลด CSV', csvClear: 'ล้าง',
        csvDelim: 'ตัวคั่น', csvDelimAuto: 'อัตโนมัติ', csvQuote: 'อัญประกาศ',
        csvHeader: 'แถวแรกเป็นหัวตาราง', csvTrim: 'ตัดช่องว่างหัวท้าย', csvSkipEmpty: 'ข้ามแถวว่าง', csvBom: 'UTF-8 BOM', csvEol: 'การขึ้นบรรทัด',
        csvAddRow: '+ แถว', csvAddCol: '+ คอลัมน์', csvDelRow: 'ลบแถว', csvDelCol: 'ลบคอลัมน์',
        csvSortAsc: 'น้อยไปมาก', csvSortDesc: 'มากไปน้อย', csvUndo: 'เลิกทำ', csvRedo: 'ทำซ้ำ',
        csvFindPh: 'ค้นหา ไปยังเซลล์', csvFindPrev: 'รายการก่อนหน้า', csvFindNext: 'รายการถัดไป', csvOnlyHits: 'เฉพาะที่ตรงกัน', csvReplacePh: 'แทนที่ด้วย', csvReplaceAll: 'แทนที่ทั้งหมด', csvReplaceOne: 'แทนที่', csvEditHeader: 'ดับเบิลคลิกเพื่อเปลี่ยนชื่อ', csvTipHeadEdit: 'ดับเบิลคลิกชื่อคอลัมน์เพื่อแก้ไข', csvCellEditTitle: 'แก้ไขเซลล์', csvCellSave: 'บันทึก', csvCellCancel: 'ยกเลิก', csvCellExpand: 'แก้ไขแบบขยาย', csvCellHint: '{n} ตัวอักษร · ⌘/Ctrl + Enter เพื่อบันทึก, Esc เพื่อยกเลิก',
        csvTabTable: 'ตาราง', csvTabJson: 'JSON', csvTabMarkdown: 'Markdown', csvMdPreview: 'ตัวอย่าง', csvMdSource: 'ซอร์ส',
        csvEmptyHint: 'เปิด CSV วางข้อความ หรือลากไฟล์มาที่นี่',
        csvNoFile: 'ยังไม่ได้เลือกไฟล์',
        csvTipParsed: '{r} แถว · {c} คอลัมน์ · {s}',
        csvTipCopied: 'คัดลอกแล้ว ({s})', csvTipSaved: 'บันทึก {name} แล้ว',
        csvTipEmpty: 'ไม่มีข้อมูลให้คัดลอก', csvTipTooBig: 'ไฟล์ {s} เกินขีดจำกัด {max} — กรุณาแยกไฟล์ก่อน',
        csvTipBig: 'ข้อมูลมีขนาดใหญ่ — กด «แปลงเป็นตาราง» เพื่อใช้การแก้ไข',
        csvTipSel: 'ไปที่แถว {r} แล้ว', csvTipNoSel: 'เลือกเซลล์ก่อน', csvTipNoMatch: 'ไม่มีแถวที่ตรงกัน', csvTipNoFind: 'พิมพ์ข้อความที่ต้องการค้นหาก่อน',
        csvTipReplaced: 'แทนที่ {n} จุด', csvTipTruncated: 'เกินขีดจำกัด โหลดเพียง {n} แถวแรก',
        csvTipBadType: 'รองรับเฉพาะ .csv / .tsv / .txt', csvTipParseFail: 'แปลงไม่สำเร็จ: {e}',
        csvStatShape: '{r} แถว × {c} คอลัมน์', csvStatCells: '{n} เซลล์', csvStatSize: '{s}'
    },
    tr: {
        navCsv: 'CSV Düzenleyici', csvSource: 'CSV kaynağı', csvTable: 'Tablo',
        csvParse: 'Tabloya uygula', csvSync: 'Kaynağı eşitle', csvOpen: 'CSV aç',
        csvSamples: 'Örnekler', csvSampleBasic: 'Basit tablo', csvSampleOrders: 'Siparişler', csvSampleQuoted: 'Tırnak ve satır',
        csvCopy: 'Kopyala', csvCopyCsv: 'CSV kopyala', csvDownload: 'CSV indir', csvClear: 'Temizle',
        csvDelim: 'Ayırıcı', csvDelimAuto: 'Otomatik', csvQuote: 'Tırnak',
        csvHeader: 'İlk satır başlık', csvTrim: 'Hücreleri kırp', csvSkipEmpty: 'Boş satırları atla', csvBom: 'UTF-8 BOM', csvEol: 'Satır sonu',
        csvAddRow: '+ Satır', csvAddCol: '+ Sütun', csvDelRow: 'Satırı sil', csvDelCol: 'Sütunu sil',
        csvSortAsc: 'Artan', csvSortDesc: 'Azalan', csvUndo: 'Geri al', csvRedo: 'Yinele',
        csvFindPh: 'Ara, hücreye git', csvFindPrev: 'Önceki eşleşme', csvFindNext: 'Sonraki eşleşme', csvOnlyHits: 'Yalnızca eşleşenler', csvReplacePh: 'Şununla değiştir', csvReplaceAll: 'Tümünü değiştir', csvReplaceOne: 'Değiştir', csvEditHeader: 'Yeniden adlandırmak için çift tıklayın', csvTipHeadEdit: 'Sütun adını düzenlemek için çift tıklayın', csvCellEditTitle: 'Hücreyi düzenle', csvCellSave: 'Kaydet', csvCellCancel: 'İptal', csvCellExpand: 'Büyük düzenleyici', csvCellHint: '{n} karakter · Kaydetmek için ⌘/Ctrl + Enter, iptal için Esc',
        csvTabTable: 'Tablo', csvTabJson: 'JSON', csvTabMarkdown: 'Markdown', csvMdPreview: 'Önizleme', csvMdSource: 'Kaynak',
        csvEmptyHint: 'CSV açın, metin yapıştırın veya dosyayı buraya bırakın',
        csvNoFile: 'Dosya seçilmedi',
        csvTipParsed: '{r} satır · {c} sütun · {s}',
        csvTipCopied: 'Kopyalandı ({s})', csvTipSaved: '{name} kaydedildi',
        csvTipEmpty: 'Kopyalanacak içerik yok', csvTipTooBig: 'Dosya {s}, {max} sınırını aşıyor — önce bölün',
        csvTipBig: 'İçerik büyük — değişiklikler için «Tabloya uygula»ya basın',
        csvTipSel: '{r}. satıra gidildi', csvTipNoSel: 'Önce bir hücre seçin', csvTipNoMatch: 'Eşleşen satır yok', csvTipNoFind: 'Önce aranacak metni yazın',
        csvTipReplaced: '{n} yerde değiştirildi', csvTipTruncated: 'Sınır aşıldı, yalnızca ilk {n} satır yüklendi',
        csvTipBadType: 'Yalnızca .csv / .tsv / .txt', csvTipParseFail: 'Ayrıştırma hatası: {e}',
        csvStatShape: '{r} satır × {c} sütun', csvStatCells: '{n} hücre', csvStatSize: '{s}'
    }
};

if (!window.DBXCsv) throw new Error('ui/js/csvedit.js 未加载');
const DBXCsv = window.DBXCsv;
const CSV_LIMITS = DBXCsv.LIMITS;

const csvWorkspace = document.getElementById('csvWorkspace');
const csvFileInput = document.getElementById('csvFileInput');
const csvFileInfo = document.getElementById('csvFileInfo');
const csvSamples = document.getElementById('csvSamples');
const csvPick = document.getElementById('csvPick');
const csvCopyBtn = document.getElementById('csvCopy');
const csvDownloadBtn = document.getElementById('csvDownload');
const csvClearBtn = document.getElementById('csvClear');
const csvDelimBar = document.getElementById('csvDelim');
const csvQuoteBar = document.getElementById('csvQuote');
const csvEolBar = document.getElementById('csvEol');
const csvHeaderBox = document.getElementById('csvHeader');
const csvTrimBox = document.getElementById('csvTrim');
const csvSkipEmptyBox = document.getElementById('csvSkipEmpty');
const csvBomBox = document.getElementById('csvBom');
const csvParseBtn = document.getElementById('csvParse');
const csvSyncBtn = document.getElementById('csvSync');
const csvSrcText = document.getElementById('csvSrcText');
const csvSrcBadge = document.getElementById('csvSrcBadge');
const csvTabs = document.getElementById('csvTabs');
const csvCopyOutBtn = document.getElementById('csvCopyOut');
const csvStat = document.getElementById('csvStat');
const csvToolbar = document.getElementById('csvToolbar');
const csvAddRowBtn = document.getElementById('csvAddRow');
const csvAddColBtn = document.getElementById('csvAddCol');
const csvDelRowBtn = document.getElementById('csvDelRow');
const csvDelColBtn = document.getElementById('csvDelCol');
const csvSortAscBtn = document.getElementById('csvSortAsc');
const csvSortDescBtn = document.getElementById('csvSortDesc');
const csvUndoBtn = document.getElementById('csvUndo');
const csvRedoBtn = document.getElementById('csvRedo');
const csvFindInput = document.getElementById('csvFind');
const csvFindCount = document.getElementById('csvFindCount');
const csvFindPrevBtn = document.getElementById('csvFindPrev');
const csvFindNextBtn = document.getElementById('csvFindNext');
const csvFilterToggle = document.getElementById('csvFilterToggle');
const csvReplaceInput = document.getElementById('csvReplace');
const csvReplaceOneBtn = document.getElementById('csvReplaceOne');
const csvReplaceAllBtn = document.getElementById('csvReplaceAll');
const csvGridWrap = document.getElementById('csvGridWrap');
const csvEmpty = document.getElementById('csvEmpty');
const csvScroll = document.getElementById('csvScroll');
const csvCanvas = document.getElementById('csvCanvas');
const csvTableEl = document.getElementById('csvTable');
const csvColgroup = document.getElementById('csvColgroup');
const csvThead = document.getElementById('csvThead');
const csvTbody = document.getElementById('csvTbody');
const csvCellEdit = document.getElementById('csvCellEdit');
const csvCellModal = document.getElementById('csvCellModal');
const csvCellModalTitle = document.getElementById('csvCellModalTitle');
const csvCellModalMeta = document.getElementById('csvCellModalMeta');
const csvCellModalText = document.getElementById('csvCellModalText');
const csvCellModalHint = document.getElementById('csvCellModalHint');
const csvCellModalSave = document.getElementById('csvCellModalSave');
const csvCellModalCancel = document.getElementById('csvCellModalCancel');
const csvCellModalClose = document.getElementById('csvCellModalClose');
const csvOutWrap = document.getElementById('csvOutWrap');
const csvOutText = document.getElementById('csvOutText');
const csvMdSeg = document.getElementById('csvMdSeg');
const csvMdPreview = document.getElementById('csvMdPreview');
const navCsvLink = document.getElementById('navCsv');

const CSV_ROW_H = CSV_LIMITS.rowHeight;
const CSV_OVERSCAN = CSV_LIMITS.overscan;

/* 示例数据全部是编的：不拿真实业务数据当样例（导出给别人看时也干净） */
const CSV_SAMPLES = {
    basic: '姓名,年龄,城市\n张三,18,北京\n李四,22,上海\n王五,31,广州',
    orders: '订单号,客户,金额,状态\nSO-1001,张三,128.00,已支付\nSO-1002,李四,59.90,待支付\nSO-1003,王五,233.50,已发货\nSO-1004,赵六,18.00,已取消',
    quoted: '编号,备注,地址\n1,"含,逗号","北京市, 朝阳区"\n2,"含""引号""","上海市, 浦东新区"\n3,"多行\n内容","广州市"'
};

let csvModeActive = false;
let csvModel = DBXCsv.blank(3, 0);
let csvView = [];                 // 过滤后可见的模型行下标
let csvPosOf = null;              // 有过滤时：模型行 -> 视图位置（null 表示恒等）
let csvFilter = '';
let csvMatches = [];              // 搜索命中：{r, c, value}
let csvHitMap = null;             // 行 -> 命中的列集合（渲染时按行查，别每格扫一遍）
let csvMatchIdx = -1;             // 当前停在第几个命中
let csvOnlyHits = false;          // 「只看命中」：过滤行，否则只高亮 + 定位
let csvSel = { r: -1, c: -1 };    // 当前选中单元格（模型下标）
let csvDelimiter = 'auto';
let csvQuoteChar = '"';
let csvEol = '\n';
let csvViewMode = 'table';
let csvMdMode = 'preview';        // Markdown 页签里看预览还是看源码
let csvSrcEditor = null;
let csvOutEditor = null;
let csvApplyingSource = false;    // 正在把模型写回源码（挡住 change 回环）
let csvSourceDirty = false;       // 源码被用户改过、还没解析进表格
let csvParseJob = 0;
let csvPushTimer = 0;
let csvParseTimer = 0;
let csvCursorTimer = 0;
let csvScrollRaf = 0;
let csvRange = { first: -1, last: -1 };
let csvHist = [];
let csvHistAt = -1;
let csvHlLines = [];              // 源码里高亮着的行（选中记录可能跨多行）
let csvCellMark = null;           // 源码里那一格的 markText 句柄
let csvSyncGuard = false;         // 程序化定位期间不反向联动
let csvFileName = '';
let csvFileSize = 0;
let csvLastText = '';             // 最近一次序列化出来的 CSV（统计体积用）
let csvOutputDirty = true;

function csvT(key, fallback) {
    const table = CSV_I18N[currentLang] || CSV_I18N.en || {};
    const base = CSV_I18N['zh-CN'] || {};
    return table[key] || (CSV_I18N.en && CSV_I18N.en[key]) || base[key] || fallback || key;
}

function csvFill(text, vars) {
    return String(text).replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] !== undefined ? vars[k] : m));
}

function csvEsc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function csvDelimiterValue() {
    return csvDelimiter === 'auto' ? (csvModel.delimiter || ',') : csvDelimiter;
}

function csvSerializeOpts() {
    return {
        delimiter: csvDelimiterValue(),
        quote: csvQuoteChar,
        quoteMode: 'auto',
        eol: csvEol,
        bom: csvBomBox.checked,
        header: csvHeaderBox.checked && csvModel.hasHeader
    };
}

// ---------------------------------------------------------------- 提示 / 状态
/* 页内反馈统一走右下角的 toast（原来工具栏末尾那行小字看不清，也容易被按钮挤掉）。
   默认每次都弹——用户点一下就该看到一下。
   第三个参数是节流毫秒数：源码面板里连着敲字会反复触发同一句话（比如「文件太大」），
   那种提示传个大值，免得 toast 叠成一摞。 */
const csvNotifyAt = Object.create(null);
function csvNotify(text, kind, throttle) {
    const msg = text == null ? '' : String(text);
    if (!msg) return;
    const isErr = kind === 'error';
    const key = (isErr ? 'e|' : 'i|') + msg;
    const now = Date.now();
    const wait = typeof throttle === 'number' ? throttle : 0;
    if (wait > 0 && csvNotifyAt[key] && now - csvNotifyAt[key] < wait) return;
    csvNotifyAt[key] = now;
    showToast(msg, isErr ? 'error' : 'success', isErr ? 4200 : 2400);
}

function csvShowError(err) {
    csvNotify(String(err && err.message ? err.message : err), 'error');
}

function csvUpdateStats() {
    const rows = csvModel.rows.length;
    const cols = csvModel.header.length;
    const size = csvLastText ? csvLastText.length : 0;
    if (csvStat) {
        csvStat.textContent = csvFill(csvT('csvStatShape'), { r: DBXCsv.formatInt(rows), c: cols });
        csvStat.title = [
            csvFill(csvT('csvStatCells'), { n: DBXCsv.formatInt(rows * cols) }),
            csvFill(csvT('csvStatSize'), { s: DBXCsv.formatBytes(size) })
        ].join(' · ');
    }
    if (csvFindInput) {
        csvFindInput.classList.toggle('has-filter', csvOnlyHits && !!csvFilter);
    }
}

function csvMarkSel() {
    if (!csvTbody) return;
    const prev = csvTbody.querySelectorAll('.is-sel');
    for (let i = 0; i < prev.length; i++) prev[i].classList.remove('is-sel');
    if (csvSel.r < 0) return;
    const row = csvRowEl(csvSel.r);
    if (!row) return;
    row.classList.add('is-sel');
    const cell = row.querySelector('[data-c="' + csvSel.c + '"]');
    if (cell) cell.classList.add('is-sel');
}

function csvRowEl(r) {
    return csvTbody ? csvTbody.querySelector('tr[data-r="' + r + '"]') : null;
}

// ---------------------------------------------------------------- 视图
function csvRefreshView() {
    csvView = DBXCsv.filterIndices(csvModel.rows, csvFilter, -1);
    if (csvFilter && csvView.length !== csvModel.rows.length) {
        csvPosOf = new Int32Array(csvModel.rows.length).fill(-1);
        for (let i = 0; i < csvView.length; i++) csvPosOf[csvView[i]] = i;
    } else {
        csvPosOf = null;
    }
}

function csvViewPos(r) {
    if (r < 0) return -1;
    if (!csvPosOf) return r < csvModel.rows.length ? r : -1;
    return csvPosOf[r];
}

function csvRenderHead() {
    const widths = DBXCsv.colWidths(csvModel);
    const cols = ['<col style="width:44px">'];
    for (let i = 0; i < widths.length; i++) cols.push('<col style="width:' + widths[i] + 'px">');
    csvColgroup.innerHTML = cols.join('');

    const head = ['<tr><th class="csv-rowno-head">#</th>'];
    for (let c = 0; c < csvModel.header.length; c++) {
        const name = csvModel.header[c];
        const mark = c === csvSel.c ? ' is-sel' : '';
        head.push('<th class="csv-th' + mark + '" data-c="' + c + '" title="' + csvEsc(name) + '">'
            + csvEsc(name) + '</th>');
    }
    head.push('</tr>');
    csvThead.innerHTML = head.join('');
}

/* 只渲染视口内的行：十万行和十行的 DOM 一样多，滚动时按 rAF 补齐 */
function csvRenderRows(force) {
    if (!csvTbody) return;
    const total = csvView.length;
    const hasRows = total > 0;
    if (csvEmpty) csvEmpty.hidden = hasRows;
    if (csvTableEl) csvTableEl.hidden = !hasRows;
    if (!hasRows) {
        csvTbody.innerHTML = '';
        csvRange = { first: -1, last: -1 };
        return;
    }
    const viewH = csvScroll.clientHeight || 480;
    const top = csvScroll.scrollTop;
    let first = Math.max(0, Math.floor(top / CSV_ROW_H) - CSV_OVERSCAN);
    let last = Math.min(total, Math.ceil((top + viewH) / CSV_ROW_H) + CSV_OVERSCAN);
    if (last <= first) last = Math.min(total, first + 1);
    if (!force && first === csvRange.first && last === csvRange.last) {
        csvMarkSel();
        return;
    }
    csvRange = { first: first, last: last };

    const span = csvModel.header.length + 1;
    const icoTitle = csvEsc(csvT('csvCellExpand'));
    const parts = [];
    if (first > 0) {
        parts.push('<tr class="csv-spacer"><td colspan="' + span + '" style="height:'
            + (first * CSV_ROW_H) + 'px"></td></tr>');
    }
    for (let vi = first; vi < last; vi++) {
        const r = csvView[vi];
        const row = csvModel.rows[r];
        const selRow = r === csvSel.r ? ' is-sel' : '';
        const cells = ['<td class="csv-rowno' + selRow + '" data-r="' + r + '">' + (vi + 1) + '</td>'];
        const hits = csvHitMap ? csvHitMap.get(r) : null;
        for (let c = 0; c < csvModel.header.length; c++) {
            const v = row[c] == null ? '' : row[c];
            const selCell = (r === csvSel.r && c === csvSel.c) ? ' is-sel' : '';
            const filled = v === '' ? ' is-empty' : '';
            const isHit = !!(hits && hits.has(c));
            const cur = csvMatches[csvMatchIdx];
            const hitCls = isHit ? (cur && cur.r === r && cur.c === c ? ' is-hit is-cur' : ' is-hit') : '';
            // 每格右上角一个小铅笔：点它才进放大弹窗，直接点格子是行内编辑
            cells.push('<td class="csv-cell' + filled + selCell + hitCls + '" data-r="' + r + '" data-c="' + c + '" title="'
                + csvEsc(v.length > 60 ? v.slice(0, 60) + '…' : v) + '">' + csvEsc(v)
                + '<button type="button" class="csv-cell-ico" data-ico="1" tabindex="-1" title="' + icoTitle
                + '" aria-label="' + icoTitle + '"></button></td>');
        }
        parts.push('<tr class="csv-row' + selRow + '" data-r="' + r + '">' + cells.join('') + '</tr>');
    }
    if (last < total) {
        parts.push('<tr class="csv-spacer"><td colspan="' + span + '" style="height:'
            + ((total - last) * CSV_ROW_H) + 'px"></td></tr>');
    }
    csvTbody.innerHTML = parts.join('');
}

function csvRender() {
    csvRefreshView();
    csvRenderHead();
    csvRange = { first: -1, last: -1 };
    csvRenderRows(true);
    csvUpdateStats();
    csvMarkSel();
}

function csvScrollToRow(r, center) {
    const vi = csvViewPos(r);
    if (vi < 0) return;
    const viewH = csvScroll.clientHeight || 480;
    const target = center === false ? vi * CSV_ROW_H : (vi * CSV_ROW_H) - Math.floor(viewH / 2) + CSV_ROW_H;
    csvScroll.scrollTop = Math.max(0, target);
    csvRenderRows(true);
    csvMarkSel();
}

// ---------------------------------------------------------------- 双向定位
function csvClearSourceHighlight() {
    if (!csvSrcEditor) return;
    for (let i = 0; i < csvHlLines.length; i++) {
        try {
            csvSrcEditor.removeLineClass(csvHlLines[i], 'background', 'csv-line-hl');
            csvSrcEditor.removeLineClass(csvHlLines[i], 'gutter', 'csv-gutter-mark');
        } catch (e) { /* 行可能已被删掉 */ }
    }
    csvHlLines = [];
    if (csvCellMark) {
        try { csvCellMark.clear(); } catch (e) { /* mark 可能随文本一起没了 */ }
        csvCellMark = null;
    }
}

/* 原文里的一格 -> 值：去首尾空白、剥引号、"" 还原成 "（和解析器同一套规则） */
function csvDecodeField(rawCell, quote) {
    let s = String(rawCell == null ? '' : rawCell).trim();
    if (quote && s.charAt(0) === quote) {
        s = s.slice(1);
        if (s.charAt(s.length - 1) === quote) s = s.slice(0, -1);
        s = s.split(quote + quote).join(quote);
    }
    return s;
}

/* 从 start 行往下取一条记录的原文与逐格区间；下一条记录的起始行决定它在哪儿结束 */
function csvRecordAt(start) {
    if (!csvSrcEditor) return null;
    const total = csvSrcEditor.lineCount();
    if (start < 0 || start >= total) return null;
    let next = total;
    const lineOf = csvModel.lineOf;
    for (let i = 0; i < lineOf.length; i++) {
        if (lineOf[i] > start && lineOf[i] < next) next = lineOf[i];
    }
    const endLine = Math.max(start, next - 1);
    const raw = csvSrcEditor.getRange({ line: start, ch: 0 },
        { line: endLine, ch: csvSrcEditor.getLine(endLine).length });
    return {
        start: start,
        endLine: endLine,
        raw: raw,
        spans: DBXCsv.fieldSpans(raw, csvDelimiterValue(), csvQuoteChar)
    };
}

/* 这一行是不是某条记录的第一行：拿首格的值对一下行首（带不带引号都要认） */
function csvLineStartsRecord(lineIdx, firstValue) {
    if (!firstValue) return true;      // 首格为空，没得比，别轻易否定
    const line = csvSrcEditor.getLine(lineIdx) || '';
    return line.slice(0, firstValue.length + 4).indexOf(firstValue) >= 0;
}

/* 这一行记录到底从源码第几行开始：优先信 lineOf，对不上就在附近按行首找回来 */
function csvFindRecordStart(r) {
    const hint = csvModel.lineOf[r];
    const row = csvModel.rows[r] || [];
    const first = row[0] == null ? '' : String(row[0]);
    const total = csvSrcEditor.lineCount();
    const inRange = typeof hint === 'number' && hint >= 0 && hint < total;
    if (inRange && csvLineStartsRecord(hint, first)) return hint;
    // 跨行单元格、手改过源码、增删过行列之后都可能差几行，往两边找最近的一条
    for (let d = 1; d <= 80; d++) {
        const down = hint + d;
        const up = hint - d;
        if (down < total && csvLineStartsRecord(down, first)) return down;
        if (up >= 0 && csvLineStartsRecord(up, first)) return up;
    }
    return inRange ? hint : -1;
}

/*
 * 选中格那一格在源码里的区间。
 *
 * lineOf 是解析 / 序列化算出来的，正常情况直接就能用；但改过行列、手改过源码、
 * 或者某条记录跨好几行之后，它可能差一两行——照旧直接标就会「高亮偏一格/偏一行」。
 * 所以这里不盲信：先把记录原文解回来和模型这行按值对一遍，一对都对不上就不标格子
 * （宁可只亮整行，也不把亮标按到错的格子上）。
 */
function csvCellSpan(r, c) {
    if (!csvSrcEditor || csvSourceDirty || r < 0 || c < 0) return null;   // 源码改了还没解析回来：先不指
    const start = csvFindRecordStart(r);
    if (start < 0) return null;
    const rec = csvRecordAt(start);
    if (!rec || !rec.spans.length) return null;
    const model = csvModel.rows[r] || [];
    const want = csvCellValue(r, c);
    const quote = csvQuoteChar;
    const decoded = [];
    let score = 0;
    for (let i = 0; i < rec.spans.length; i++) {
        const v = csvDecodeField(rec.raw.slice(rec.spans[i].start, rec.spans[i].end), quote);
        decoded.push(v);
        if (i < model.length && v === csvDecodeField(model[i], quote)) score++;
    }
    if (!score) return null;
    let idx = decoded[c] === csvDecodeField(want, quote) ? c : -1;
    if (idx < 0 && want !== '') {
        // 列对不上：按值找同值的那一格；空值到处都是，不猜
        const needle = csvDecodeField(want, quote);
        for (let i = 0; i < decoded.length; i++) {
            if (decoded[i] === needle) { idx = i; break; }
        }
    }
    if (idx < 0) return null;
    const hit = rec.spans[idx];
    if (!hit || hit.end <= hit.start) return null;
    return {
        lines: { from: rec.start, to: rec.endLine },
        from: DBXCsv.offsetToPos(rec.raw, hit.start, rec.start),
        to: DBXCsv.offsetToPos(rec.raw, hit.end, rec.start)
    };
}

/* 选中的单元格 -> 源码里亮起来（整行淡底 + 该格浓底），回传该格起点给滚动用 */
function csvHighlightSelection() {
    if (!csvSrcEditor) return null;
    csvClearSourceHighlight();
    const r = csvSel.r;
    if (r < 0 || r >= csvModel.rows.length) return null;
    const span = csvCellSpan(r, csvSel.c);
    // 整行范围：优先用核对过的那条记录，没核对上就退回 lineOf
    let from = csvModel.lineOf[r];
    let to = from;
    if (span) {
        from = span.lines.from;
        to = span.lines.to;
    } else if (typeof from === 'number') {
        const total = csvSrcEditor.lineCount();
        const nextStart = (r + 1 < csvModel.rows.length && typeof csvModel.lineOf[r + 1] === 'number')
            ? csvModel.lineOf[r + 1] : total;
        to = Math.max(from, Math.min(nextStart, total) - 1);
    }
    if (typeof from !== 'number' || from < 0) return null;
    for (let ln = from; ln <= to; ln++) {
        try {
            csvSrcEditor.addLineClass(ln, 'background', 'csv-line-hl');
            // 行号槽上再挂一枚标记：正文底色淡、横向滚动时还容易被冲淡，行号旁边这条最醒目
            if (ln === from) csvSrcEditor.addLineClass(ln, 'gutter', 'csv-gutter-mark');
            csvHlLines.push(ln);
        } catch (e) { /* 越界就算了，不值当为高亮报错 */ }
    }
    if (!span) return null;
    try {
        csvCellMark = csvSrcEditor.markText(span.from, span.to, { className: 'csv-cell-hl' });
    } catch (e) {
        csvCellMark = null;
        return null;
    }
    return span.from;
}

/* 表格 -> 源码：选中某格时把源码光标挪到那条记录，并把该格滚进视野（横向也要滚） */
function csvLocateSource(r) {
    if (!csvSrcEditor) return;
    const line = csvModel.lineOf[r];
    if (typeof line !== 'number' || line < 0) return;
    csvSyncGuard = true;
    const pos = csvHighlightSelection();
    csvSrcEditor.setCursor({ line: line, ch: 0 });
    csvSrcEditor.scrollIntoView(pos || { line: line, ch: 0 }, 40);
    // 光标移动会触发 cursorActivity，等它跑完再放行
    setTimeout(() => { csvSyncGuard = false; }, 80);
}

/* 源码 -> 表格：光标所在行属于哪条记录，就滚到那条记录 */
function csvLocateTable(line) {
    const idx = DBXCsv.rowAtLine(csvModel.lineOf, line);
    if (idx < 0) return;
    csvSel = { r: idx, c: csvSel.c < 0 ? 0 : csvSel.c };
    csvScrollToRow(idx);
}

function csvOnSourceCursor() {
    if (!csvSrcEditor || csvSyncGuard || !csvModel.lineOf.length) return;
    clearTimeout(csvCursorTimer);
    csvCursorTimer = setTimeout(() => {
        if (!csvModeActive) return;
        csvLocateTable(csvSrcEditor.getCursor().line);
    }, 120);
}

// ---------------------------------------------------------------- 源码同步
function csvSourceText() {
    if (csvSrcEditor) return csvSrcEditor.getValue();
    return csvSrcText.value || '';
}

function csvSetSourceText(text, keepView) {
    if (!csvSrcEditor) {
        csvSrcText.value = text;
        return;
    }
    const info = csvSrcEditor.getScrollInfo();
    const cur = csvSrcEditor.getCursor();
    csvApplyingSource = true;
    const lastLine = csvSrcEditor.lastLine();
    csvSrcEditor.replaceRange(text, { line: 0, ch: 0 },
        { line: lastLine, ch: csvSrcEditor.getLine(lastLine).length });
    if (keepView) {
        csvSrcEditor.scrollTo(info.left, info.top);
        csvSrcEditor.setCursor(cur);
    }
    csvApplyingSource = false;
}

function csvRowText(r) {
    const opts = csvSerializeOpts();
    const row = csvModel.rows[r] || [];
    const out = [];
    for (let c = 0; c < row.length; c++) {
        out.push(DBXCsv.encodeCell(row[c], opts.delimiter, opts.quote, opts.quoteMode));
    }
    return out.join(opts.delimiter);
}

/*
 * 改单元格后的快路径：只替换源码里对应的那一行，不重建整份文本。
 * 十万行时整份重建要几十毫秒，连续输入会一顿一顿的。
 * 只有「这一行在源码里正好占一行」才敢这么干，跨行（单元格里带换行）走全量。
 */
function csvPatchSourceRow(r) {
    if (!csvSrcEditor || csvSourceDirty) return false;
    const lineOf = csvModel.lineOf;
    const line = lineOf[r];
    if (typeof line !== 'number' || line < 0) return false;
    const next = (r + 1 < lineOf.length) ? lineOf[r + 1] : csvSrcEditor.lineCount();
    if (next - line !== 1) return false;
    const text = csvRowText(r);
    if (/[\r\n]/.test(text)) return false;
    const cur = csvSrcEditor.getLine(line);
    if (cur === text) return true;
    csvApplyingSource = true;
    csvSrcEditor.replaceRange(text, { line: line, ch: 0 }, { line: line, ch: cur.length });
    csvApplyingSource = false;
    csvLastText = null;
    return true;
}

/* 结构变了（增删行列、排序）：整份重写，顺便拿到新的 lineOf */
function csvPushSource(force) {
    if (!csvSrcEditor) return;
    if (csvSourceDirty && !force) return;   // 用户正在改源码，别覆盖人家
    const out = DBXCsv.serialize(csvModel, csvSerializeOpts());
    csvModel.lineOf = out.lineOf;
    csvLastText = out.text;
    const same = csvSourceText() === out.text;
    if (!same) csvSetSourceText(out.text, true);
    csvSourceDirty = false;
    csvUpdateSourceBadge();
    csvUpdateStats();
    csvSyncOutput();
    // 整份重写会把 markText 一并冲掉，重画一次选中格的高亮
    csvHighlightSelection();
}

function csvUpdateSourceBadge() {
    if (!csvSrcEditor) return;
    const lines = csvSrcEditor.lineCount();
    csvSrcBadge.textContent = DBXCsv.formatInt(lines);
    csvSrcBadge.title = DBXCsv.formatBytes(csvLastText ? csvLastText.length : csvSourceText().length);
}

function csvSchedulePush() {
    clearTimeout(csvPushTimer);
    csvPushTimer = setTimeout(() => csvPushSource(false), 220);
}

/* 源码被改：小文件自动解析，大文件让用户自己按「解析到表格」 */
function csvOnSourceChange() {
    if (csvApplyingSource) return;
    csvSourceDirty = true;
    csvUpdateSourceBadge();
    clearTimeout(csvParseTimer);
    const len = csvSourceText().length;
    if (len > 512 * 1024) {
        // 大文件不自动解析，改一个字就提示一次太吵，压到 15 秒一句
        csvNotify(csvT('csvTipBig'), '', 15000);
        return;
    }
    csvParseTimer = setTimeout(() => csvParseSource(false), 260);
}

async function csvParseSource(manual) {
    if (!csvSrcEditor) return;
    const text = csvSourceText();
    const job = ++csvParseJob;
    const opts = {
        delimiter: csvDelimiter,
        quote: csvQuoteChar,
        header: csvHeaderBox.checked,
        trim: csvTrimBox.checked,
        skipEmpty: csvSkipEmptyBox.checked
    };
    let res;
    try {
        if (text.length > CSV_LIMITS.chunkChars) {
            res = await DBXCsv.parseAsync(text, opts, (p) => {
                if (job === csvParseJob) csvSrcBadge.textContent = Math.round(p * 100) + '%';
            });
        } else {
            res = DBXCsv.parse(text, opts);
        }
    } catch (e) {
        csvShowError(csvFill(csvT('csvTipParseFail'), { e: e.message || e }));
        return;
    }
    if (job !== csvParseJob) return;
    if (!res || res.ok === false) {
        csvShowError(csvFill(csvT('csvTipParseFail'), { e: res && res.error ? res.error : '' }));
        return;
    }
    csvSourceDirty = false;
    csvModel = {
        header: res.header,
        rows: res.rows,
        hasHeader: res.hasHeader,
        lineOf: res.lineOf,
        delimiter: res.delimiter
    };
    csvHist = [];
    csvHistAt = -1;
    csvSel = res.rows.length ? { r: 0, c: 0 } : { r: -1, c: -1 };
    csvLastText = text;
    csvRender();
    csvUpdateSourceBadge();
    csvSyncOutput();
    if (csvFindInput.value.trim()) csvFindRefresh(false);
    if (res.truncated) csvNotify(csvFill(csvT('csvTipTruncated'), { n: DBXCsv.formatInt(CSV_LIMITS.maxRows) }), 'error', 8000);
    else if (manual) csvNotify(csvFill(csvT('csvTipParsed'), {
        r: DBXCsv.formatInt(res.rows.length),
        c: res.header.length,
        s: DBXCsv.formatBytes(text.length)
    }));
}

// ---------------------------------------------------------------- 输出面板
function csvOutputText() {
    if (csvViewMode === 'json') return DBXCsv.toJson(csvModel, { pretty: true, types: true });
    if (csvViewMode === 'md') return DBXCsv.toMarkdown(csvModel);
    return DBXCsv.serialize(csvModel, csvSerializeOpts()).text;
}

/* Markdown 页签的预览：把生成的 Markdown 真渲染成表格，
   光看源码看不出表长什么样（引号、换行、对齐都得渲染出来才算数） */
function csvRenderMdPreview() {
    if (!csvMdPreview) return;
    const html = DBXCsv.markdownTableToHtml(DBXCsv.toMarkdown(csvModel));
    if (!html) {
        csvMdPreview.innerHTML = '<p class="csv-md-empty">' + csvEsc(csvT('csvTipEmpty')) + '</p>';
        return;
    }
    csvMdPreview.innerHTML = html;
}

function csvApplyMdMode() {
    const isMd = csvViewMode === 'md';
    const preview = isMd && csvMdMode === 'preview';
    if (csvMdSeg) {
        csvMdSeg.hidden = !isMd;
        Array.prototype.forEach.call(csvMdSeg.querySelectorAll('.compare-tab'), (btn) => {
            btn.classList.toggle('active', btn.dataset.md === csvMdMode);
        });
    }
    if (csvOutWrap) csvOutWrap.classList.toggle('is-preview', preview);
    if (csvMdPreview) csvMdPreview.hidden = !preview;
}

function csvSyncOutput() {
    if (csvViewMode === 'table') return;
    if (csvViewMode === 'md' && csvMdMode === 'preview') {
        csvRenderMdPreview();
        return;
    }
    if (!csvOutEditor) return;
    const text = csvOutputText();
    if (csvOutEditor.getValue() !== text) {
        const info = csvOutEditor.getScrollInfo();
        csvOutEditor.setValue(text);
        csvOutEditor.scrollTo(info.left, info.top);
    }
}

function csvScheduleOutput() {
    csvOutputDirty = true;
    clearTimeout(csvSyncOutput._t);
    csvSyncOutput._t = setTimeout(() => {
        csvOutputDirty = false;
        csvSyncOutput();
    }, 160);
}

function csvSetViewMode(mode) {
    csvViewMode = mode;
    Array.prototype.forEach.call(csvTabs.querySelectorAll('.compare-tab'), (btn) => {
        btn.classList.toggle('active', btn.dataset.view === mode);
    });
    const isTable = mode === 'table';
    csvGridWrap.hidden = !isTable;
    csvToolbar.hidden = !isTable;
    csvOutWrap.hidden = isTable;
    csvCopyOutBtn.hidden = isTable;
    csvApplyMdMode();
    if (!isTable) {
        // 预览模式下不用建编辑器，省一份 CodeMirror
        if (!(mode === 'md' && csvMdMode === 'preview')) ensureCsvOutEditor();
        csvSyncOutput();
    } else {
        requestAnimationFrame(() => csvRenderRows(true));
    }
}

// ---------------------------------------------------------------- 历史
function csvPushOp(op) {
    csvHist = csvHist.slice(0, csvHistAt + 1);
    csvHist.push(op);
    if (csvHist.length > 120) {
        csvHist.shift();
    }
    csvHistAt = csvHist.length - 1;
    csvUpdateHistoryButtons();
}

function csvUpdateHistoryButtons() {
    if (csvUndoBtn) csvUndoBtn.disabled = csvHistAt < 0;
    if (csvRedoBtn) csvRedoBtn.disabled = csvHistAt >= csvHist.length - 1;
}

function csvUndo() {
    if (csvHistAt < 0) return;
    const op = csvHist[csvHistAt];
    csvHistAt--;
    const at = DBXCsv.applyOp(csvModel, op, -1);
    csvUpdateHistoryButtons();
    csvAfterStructure(at);
}

function csvRedo() {
    if (csvHistAt >= csvHist.length - 1) return;
    csvHistAt++;
    const op = csvHist[csvHistAt];
    const at = DBXCsv.applyOp(csvModel, op, 1);
    csvUpdateHistoryButtons();
    csvAfterStructure(at);
}

/* 结构变化后的统一收尾：重画 + 整份重写源码 */
function csvAfterStructure(at) {
    if (at && at.r >= 0 && at.r < csvModel.rows.length) csvSel = { r: at.r, c: Math.max(0, Math.min(csvSel.c, csvModel.header.length - 1)) };
    csvRender();
    csvPushSource(true);
    if (csvFindInput.value.trim()) csvFindRefresh(false);
}

// ---------------------------------------------------------------- 表格交互
function csvSelectCell(r, c, locate) {
    csvSel = { r: r, c: c };
    csvMarkSel();
    if (locate !== false) csvLocateSource(r);
}

function csvCellValue(r, c) {
    const row = csvModel.rows[r];
    return row && row[c] != null ? row[c] : '';
}

let csvEditCtx = null;   // { r, c, from }
let csvModalCtx = null;  // 放大编辑弹窗正在改的那一格

function csvOpenEditor(r, c, isHeader) {
    if (!csvCanvas) return;
    const cell = isHeader
        ? csvThead.querySelector('th[data-c="' + c + '"]')
        : csvTbody.querySelector('td[data-c="' + c + '"][data-r="' + r + '"]');
    if (!cell) return;
    csvEditCtx = { r: isHeader ? -1 : r, c: c, from: isHeader ? csvModel.header[c] : csvCellValue(r, c) };
    csvCellEdit.hidden = false;
    csvCellEdit.value = csvEditCtx.from;
    csvCellEdit.style.left = cell.offsetLeft + 'px';
    csvCellEdit.style.top = cell.offsetTop + 'px';
    csvCellEdit.style.width = Math.max(64, cell.offsetWidth) + 'px';
    csvCellEdit.style.height = CSV_ROW_H + 'px';
    csvCellEdit.focus();
    csvCellEdit.select();
}

/* 单元格里除了文字还有那颗「放大编辑」小铅笔，所以不能整格 textContent = value，
   那样图标会被一起抹掉。只改第一个文本节点。 */
function csvSetCellText(td, value) {
    const first = td.firstChild;
    if (first && first.nodeType === 3) first.nodeValue = value;
    else td.insertBefore(document.createTextNode(value), first);
}

/* 行内编辑的统一入口：值里带换行时行内只有 30px，改起来是灾难，转放大弹窗 */
function csvBeginInlineEdit(r, c, isHeader) {
    if (!isHeader && csvCellValue(r, c).indexOf('\n') >= 0) {
        csvOpenCellModal(r, c);
        return;
    }
    csvOpenEditor(r, c, isHeader);
}

/* 提交一个单元格的值：行内编辑和放大弹窗都走这里，逻辑不要两份 */
function csvCommitCell(r, c, value) {
    const from = csvCellValue(r, c);
    if (value === from) return false;
    csvModel.rows[r][c] = value;
    csvPushOp(DBXCsv.opCell(r, c, from, value));
    const td = csvTbody.querySelector('td[data-c="' + c + '"][data-r="' + r + '"]');
    if (td) {
        csvSetCellText(td, value);
        td.classList.toggle('is-empty', value === '');
    }
    // 单元格变了：单行打补丁就够，跨行或没映射时才整份重写
    if (!csvPatchSourceRow(r)) csvSchedulePush();
    else csvUpdateStats();
    csvScheduleOutput();
    if (csvFindInput.value.trim()) csvFindRefresh(false);
    csvHighlightSelection();
    return true;
}

function csvCloseEditor(commit) {
    // 上下文丢了也要把框收起来（重画 / 切页之后可能只剩一个还显示着的框）
    if (csvCellEdit.hidden) return;
    const ctx = csvEditCtx;
    const value = csvCellEdit.value;
    csvCellEdit.hidden = true;
    csvEditCtx = null;
    if (!commit || !ctx || value === ctx.from) return;
    if (ctx.r < 0) {
        // 列名
        csvModel.header[ctx.c] = value;
        csvPushOp(DBXCsv.opHead(ctx.c, ctx.from, value));
        csvRenderHead();
        csvPushSource(true);
        return;
    }
    csvCommitCell(ctx.r, ctx.c, value);
}

/* ---------------- 单元格放大编辑弹窗 ----------------
 * 行内编辑器只有一行高，遇到带换行的长文本（备注、JSON 片段）就是灾难：
 * 双击单元格改为弹窗，里面用 CodeMirror（行号 + 软换行），
 * ⌘/Ctrl + Enter 保存、Esc 取消。 */
let csvModalCm = null;
let csvModalSetting = false;

function ensureCsvModalEditor() {
    if (csvModalCm || !window.CodeMirror || !csvCellModalText) return;
    csvModalCm = CodeMirror.fromTextArea(csvCellModalText, Object.assign({}, commonConfig, {
        mode: 'text/plain',
        lineWrapping: true,
        foldGutter: false,
        gutters: ['CodeMirror-linenumbers'],
        extraKeys: {
            'Cmd-Enter': () => csvCloseCellModal(true),
            'Ctrl-Enter': () => csvCloseCellModal(true),
            'Esc': () => csvCloseCellModal(false)
        }
    }));
    csvModalCm.on('change', () => {
        if (csvModalSetting) return;
        csvCellModalHint.textContent = csvFill(csvT('csvCellHint'), { n: csvModalCm.getValue().length });
    });
    csvSyncEditorTheme();
}

function csvOpenCellModal(r, c) {
    if (!csvCellModal || r < 0 || c < 0) return;
    csvCloseEditor(true);
    csvModalCtx = { r: r, c: c, from: csvCellValue(r, c) };
    csvSel = { r: r, c: c };
    csvMarkSel();
    csvLocateSource(r);
    ensureCsvModalEditor();
    csvCellModalTitle.textContent = csvT('csvCellEditTitle');
    csvCellModalMeta.textContent = (csvModel.header[c] || ('列 ' + (c + 1))) + ' · ' + (r + 1);
    const value = csvModalCtx.from;
    if (csvModalCm) {
        csvModalSetting = true;
        csvModalCm.setValue(value);
        csvModalSetting = false;
    } else {
        csvCellModalText.value = value;
    }
    csvCellModalHint.textContent = csvFill(csvT('csvCellHint'), { n: value.length });
    csvCellModal.hidden = false;
    requestAnimationFrame(() => {
        if (csvModalCm) {
            csvModalCm.refresh();
            csvModalCm.focus();
            const last = csvModalCm.lastLine();
            // 光标放末尾：多半是来「补一段」，不是来重写
            csvModalCm.setCursor({ line: last, ch: csvModalCm.getLine(last).length });
            csvModalCm.scrollIntoView({ line: last, ch: 0 }, 0);
        } else {
            csvCellModalText.focus();
            csvCellModalText.setSelectionRange(value.length, value.length);
        }
    });
}

function csvModalValue() {
    return csvModalCm ? csvModalCm.getValue() : csvCellModalText.value;
}

function csvCloseCellModal(save) {
    if (!csvCellModal || csvCellModal.hidden) return;
    const ctx = csvModalCtx;
    const value = csvModalValue();
    csvCellModal.hidden = true;
    csvModalCtx = null;
    csvScroll.focus();
    if (ctx) csvSel = { r: ctx.r, c: ctx.c };
    if (save && ctx) {
        csvCommitCell(ctx.r, ctx.c, value);
        csvRenderRows(true);
        csvMarkSel();
    }
}

function csvEditValueForPaste(text) {
    // 粘贴进来的表格数据：多行多列就铺开，单值就写一格
    return String(text || '').replace(/\r\n|\r/g, '\n').replace(/\n+$/, '');
}

function csvHandlePaste(e) {
    if (!csvEditCtx || csvCellEdit.hidden) return;
    const text = (e.clipboardData || window.clipboardData).getData('text');
    if (!text) return;
    const value = csvEditValueForPaste(text);
    if (/[\t\n]/.test(value) && value.indexOf('\n') > 0) {
        e.preventDefault();
        const ctx = csvEditCtx;
        csvCloseEditor(true);
        csvPasteBlock(value, ctx.r, ctx.c);
    }
}

/* 从某格开始铺一块数据（从 Excel 复制过来的就是制表符分隔） */
function csvPasteBlock(text, r0, c0) {
    const parsed = DBXCsv.parse(text, { delimiter: '\t', header: false, quote: '"', skipEmpty: false, trim: false });
    const block = parsed.rows;
    if (!block.length) return;
    const needRows = r0 + block.length;
    const needCols = c0 + Math.max.apply(null, block.map((row) => row.length));
    const items = [];
    // 不够的行/列先补齐（补出来的空行也算进撤销栈）
    if (needCols > csvModel.header.length) {
        for (let c = csvModel.header.length; c < needCols; c++) {
            const op = DBXCsv.opColIns(c, '列 ' + (c + 1));
            DBXCsv.applyOp(csvModel, op, 1);
            csvPushOp(op);
        }
    }
    if (needRows > csvModel.rows.length) {
        const add = needRows - csvModel.rows.length;
        const op = DBXCsv.opRowIns(csvModel.rows.length, add);
        DBXCsv.applyOp(csvModel, op, 1);
        csvPushOp(op);
    }
    for (let i = 0; i < block.length; i++) {
        for (let j = 0; j < block[i].length; j++) {
            const r = r0 + i;
            const c = c0 + j;
            const from = csvModel.rows[r][c] == null ? '' : csvModel.rows[r][c];
            const to = block[i][j];
            if (from !== to) items.push({ r: r, c: c, from: from, to: to, });
            csvModel.rows[r][c] = to;
        }
    }
    if (items.length) csvPushOp(DBXCsv.opCells(items));
    csvSel = { r: r0, c: c0 };
    csvRender();
    csvPushSource(true);
    showToast(csvFill(csvT('csvTipReplaced'), { n: items.length }));
}

function csvMoveSel(dr, dc) {
    if (!csvModel.rows.length) return;
    const rows = csvModel.rows.length;
    const cols = csvModel.header.length;
    let r = csvSel.r < 0 ? 0 : csvSel.r + dr;
    let c = csvSel.c < 0 ? 0 : csvSel.c + dc;
    r = Math.max(0, Math.min(rows - 1, r));
    c = Math.max(0, Math.min(cols - 1, c));
    csvSelectCell(r, c, true);
    const vi = csvViewPos(r);
    if (vi < 0) return;
    const top = vi * CSV_ROW_H;
    const viewH = csvScroll.clientHeight || 480;
    if (top < csvScroll.scrollTop || top + CSV_ROW_H > csvScroll.scrollTop + viewH) csvScrollToRow(r, false);
}

function csvOnGridKey(e) {
    if (csvEditCtx && !csvCellEdit.hidden) return;
    // 事件是从输入框里冒上来的（行内编辑框、查找框…）：那是人家在打字，别抢键
    const tag = e.target && e.target.tagName ? e.target.tagName : '';
    if (tag === 'TEXTAREA' || tag === 'INPUT') return;
    const meta = e.metaKey || e.ctrlKey;
    if (meta && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) csvRedo(); else csvUndo();
        return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); csvMoveSel(1, 0); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); csvMoveSel(-1, 0); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); csvMoveSel(0, 1); return; }
    if (e.key === 'ArrowLeft') { e.preventDefault(); csvMoveSel(0, -1); return; }
    if (e.key === 'Tab') {
        e.preventDefault();
        if (e.shiftKey) csvMoveSel(0, -1); else csvMoveSel(0, 1);
        return;
    }
    if (e.key === 'Enter' || e.key === 'F2') {
        if (csvSel.r < 0) return;
        e.preventDefault();
        csvBeginInlineEdit(csvSel.r, csvSel.c);
        return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
        if (csvSel.r < 0) return;
        const from = csvCellValue(csvSel.r, csvSel.c);
        if (!from) return;
        e.preventDefault();
        csvModel.rows[csvSel.r][csvSel.c] = '';
        csvPushOp(DBXCsv.opCell(csvSel.r, csvSel.c, from, ''));
        csvRenderRows(true);
        if (!csvPatchSourceRow(csvSel.r)) csvSchedulePush();
        csvScheduleOutput();
    }
}

// ---------------------------------------------------------------- 行列操作
function csvEnsureSelection() {
    if (csvSel.r < 0 || csvSel.c < 0) {
        csvNotify(csvT('csvTipNoSel'), 'error');
        return false;
    }
    return true;
}

function csvAddRow() {
    const at = csvSel.r >= 0 ? csvSel.r + 1 : csvModel.rows.length;
    const op = DBXCsv.opRowIns(at, 1);
    DBXCsv.applyOp(csvModel, op, 1);
    csvPushOp(op);
    csvSel = { r: at, c: csvSel.c < 0 ? 0 : csvSel.c };
    csvAfterStructure({ r: at, c: csvSel.c });
    csvScrollToRow(at);
}

function csvAddCol() {
    const at = csvModel.header.length;
    const op = DBXCsv.opColIns(at, '列 ' + (at + 1));
    DBXCsv.applyOp(csvModel, op, 1);
    csvPushOp(op);
    csvSel = { r: csvSel.r < 0 ? 0 : csvSel.r, c: at };
    csvAfterStructure({ r: csvSel.r, c: at });
}

function csvDelRow() {
    if (!csvEnsureSelection()) return;
    if (csvModel.rows.length <= 1) return;
    const r = csvSel.r;
    const op = DBXCsv.opRowDel(r, [csvModel.rows[r].slice()]);
    DBXCsv.applyOp(csvModel, op, 1);
    csvPushOp(op);
    csvSel = { r: Math.min(r, csvModel.rows.length - 1), c: csvSel.c };
    csvAfterStructure(csvSel);
    csvScrollToRow(csvSel.r);
}

function csvDelCol() {
    if (!csvEnsureSelection()) return;
    if (csvModel.header.length <= 1) return;
    const c = csvSel.c;
    const values = [];
    for (let r = 0; r < csvModel.rows.length; r++) values.push(csvModel.rows[r][c]);
    const op = DBXCsv.opColDel(c, csvModel.header[c], values);
    DBXCsv.applyOp(csvModel, op, 1);
    csvPushOp(op);
    csvSel = { r: csvSel.r, c: Math.max(0, c - 1) };
    csvAfterStructure(csvSel);
}

function csvSort(desc) {
    if (!csvEnsureSelection()) return;
    const order = DBXCsv.sortOrder(csvModel.rows, csvSel.c, { desc: desc, numeric: true });
    const op = DBXCsv.opOrder(order);
    DBXCsv.applyOp(csvModel, op, 1);
    csvPushOp(op);
    csvAfterStructure(csvSel);
}

/* 单个替换：只改当前停着的那一格，然后自动跳到下一个命中，可以一路按下去 */
function csvReplaceOne() {
    const find = csvFindInput.value.trim();
    if (!find) {
        csvNotify(csvT('csvTipNoFind'), 'error');
        return;
    }
    if (!csvMatches.length) {
        csvFindRefresh(false);
        if (!csvMatches.length) {
            csvNotify(csvT('csvTipNoMatch'), 'error');
            return;
        }
    }
    if (csvMatchIdx < 0) csvMatchIdx = 0;
    const m = csvMatches[csvMatchIdx];
    const from = csvModel.rows[m.r][m.c] == null ? '' : csvModel.rows[m.r][m.c];
    const to = DBXCsv.replaceValue(from, find, csvReplaceInput.value);
    if (to === from) {
        csvJumpMatch(1);
        return;
    }
    csvModel.rows[m.r][m.c] = to;
    csvPushOp(DBXCsv.opCell(m.r, m.c, from, to));
    // 改了数据就得把源码同步掉：只更新表格会让两边说法不一致
    if (!csvPatchSourceRow(m.r)) csvSchedulePush();
    csvScheduleOutput();
    // 重新扫一遍命中（这一格可能还有别的关键字），再从刚才那一格往后跳
    csvFindRefresh(false);
    const next = csvMatches.findIndex((x) => x.r > m.r || (x.r === m.r && x.c > m.c));
    if (csvMatches.length) csvJumpMatch(next < 0 ? 0 : next, true);
    csvRenderRows(true);
    csvUpdateStats();
}

function csvReplaceAll() {
    const find = csvFindInput.value;
    if (!find) {
        csvNotify(csvT('csvTipNoFind'), 'error');
        return;
    }
    const rep = csvReplaceInput.value;
    const hits = DBXCsv.findMatches(csvModel.rows, find, -1);
    if (!hits.length) {
        csvNotify(csvT('csvTipNoMatch'), 'error');
        return;
    }
    const items = [];
    for (let i = 0; i < hits.length; i++) {
        const h = hits[i];
        const next = DBXCsv.replaceValue(h.value, find, rep);
        if (next !== h.value) items.push({ r: h.r, c: h.c, from: h.value, to: next });
    }
    if (!items.length) {
        csvNotify(csvT('csvTipNoMatch'), 'error');
        return;
    }
    for (let i = 0; i < items.length; i++) csvModel.rows[items[i].r][items[i].c] = items[i].to;
    csvPushOp(DBXCsv.opCells(items));
    csvRender();
    csvPushSource(true);
    showToast(csvFill(csvT('csvTipReplaced'), { n: items.length }));
}

// ---------------------------------------------------------------- 文件与导出
function csvSerializeNow() {
    const out = DBXCsv.serialize(csvModel, csvSerializeOpts());
    csvModel.lineOf = out.lineOf;
    csvLastText = out.text;
    return out.text;
}

async function csvCopyCsv() {
    const text = csvSerializeNow();
    if (!text) {
        csvNotify(csvT('csvTipEmpty'), 'error');
        return;
    }
    try {
        await writeClipboardText(text);
        csvNotify(csvFill(csvT('csvTipCopied'), { s: DBXCsv.formatBytes(text.length) }));
    } catch (e) {
        csvNotify(String(e && e.message ? e.message : e), 'error');
    }
}

async function csvDownloadCsv() {
    const text = csvSerializeNow();
    if (!text) {
        csvNotify(csvT('csvTipEmpty'), 'error');
        return;
    }
    const name = csvFileName ? csvFileName.replace(/\.(csv|tsv|txt)$/i, '') + '.csv' : 'data.csv';
    const status = await saveTextFile(name, text, 'text/csv;charset=utf-8');
    if (status === 'cancelled' || status === 'failed') saveToast(status, '');
    else csvNotify(csvFill(csvT('csvTipSaved'), { name: name }));
}

function csvReset() {
    csvModel = DBXCsv.blank(3, 0);
    csvHist = [];
    csvHistAt = -1;
    csvSel = { r: -1, c: -1 };
    csvFilter = '';
    csvMatches = [];
    csvHitMap = null;
    csvMatchIdx = -1;
    csvOnlyHits = false;
    if (csvFilterToggle) {
        csvFilterToggle.classList.remove('is-on');
        csvFilterToggle.setAttribute('aria-pressed', 'false');
    }
    csvFindInput.value = '';
    csvUpdateFindCount();
    csvReplaceInput.value = '';
    csvFileName = '';
    csvFileSize = 0;
    csvLastText = '';
    csvUpdateFileInfo();
    csvClearSourceHighlight();
    csvRender();
    csvSetSourceText('', true);
    csvSourceDirty = false;
    csvUpdateSourceBadge();
    csvSyncOutput();
    csvUpdateHistoryButtons();
}

function csvUpdateFileInfo() {
    if (!csvFileInfo) return;
    if (csvFileName) {
        csvFileInfo.textContent = csvFileName + (csvFileSize ? ' · ' + DBXCsv.formatBytes(csvFileSize) : '');
        csvFileInfo.classList.add('has-file');
    } else {
        csvFileInfo.textContent = csvT('csvNoFile');
        csvFileInfo.classList.remove('has-file');
    }
    csvFileInfo.title = csvFileInfo.textContent;
}

function csvLoadText(text, name, size) {
    csvFileName = name || '';
    csvFileSize = size || text.length;
    csvUpdateFileInfo();
    csvParseJob++;
    csvSourceDirty = false;
    csvSetSourceText(text, true);
    csvParseSource(false);
}

async function csvOpenFile(file) {
    if (!file) return;
    if (!/\.(csv|tsv|txt)$/i.test(file.name)) {
        csvNotify(csvT('csvTipBadType'), 'error');
        return;
    }
    if (file.size > CSV_LIMITS.maxBytes) {
        csvNotify(csvFill(csvT('csvTipTooBig'), { s: DBXCsv.formatBytes(file.size), max: DBXCsv.formatBytes(CSV_LIMITS.maxBytes) }), 'error', 8000);
        return;
    }
    let text = '';
    try {
        text = await file.text();
    } catch (e) {
        csvShowError(e);
        return;
    }
    csvLoadText(text, file.name, file.size);
}

/* 供 18-flow 的拖拽 / 统一导入按钮调用 */
function csvOpenFileFromFlow(file) {
    if (!csvModeActive && typeof enterCsvMode === 'function') enterCsvMode();
    csvOpenFile(file);
}

// ---------------------------------------------------------------- 页面进出
/* 09-convert.js 的 syncEditorTheme 是硬编码的编辑器清单，这一页三个编辑器建得晚，
   进不去那份名单，主题会一直停在 light。这里自己补一次。 */
function csvSyncEditorTheme() {
    if (!window.CodeMirror) return;
    const theme = document.documentElement.getAttribute('data-dbx-theme') === 'dark' ? 'material-darker' : 'default';
    [csvSrcEditor, csvOutEditor, csvModalCm].forEach((cm) => {
        if (!cm) return;
        cm.setOption('theme', theme);
        cm.refresh();
    });
}

function ensureCsvEditors() {
    if (!csvSrcEditor && window.CodeMirror) {
        csvSrcEditor = CodeMirror.fromTextArea(csvSrcText, Object.assign({}, commonConfig, {
            mode: MODE_MAP.csv,
            lineWrapping: false,
            foldGutter: false,
            gutters: ['CodeMirror-linenumbers'],
            extraKeys: {
                'Cmd-Enter': () => csvParseSource(true),
                'Ctrl-Enter': () => csvParseSource(true),
                'Cmd-F': 'findPersistent',
                'Ctrl-F': 'findPersistent'
            }
        }));
        csvSrcEditor.on('change', () => { if (!csvApplyingSource) csvOnSourceChange(); });
        csvSrcEditor.on('cursorActivity', csvOnSourceCursor);
        csvSyncEditorTheme();
    }
    csvUpdateSourceBadge();
}

function ensureCsvOutEditor() {
    if (csvOutEditor || !window.CodeMirror) return;
    csvOutEditor = CodeMirror.fromTextArea(csvOutText, Object.assign({}, commonConfig, {
        mode: MODE_MAP.json,
        lineWrapping: false,
        readOnly: true,
        foldGutter: false,
        gutters: ['CodeMirror-linenumbers']
    }));
    csvSyncEditorTheme();
}

function enterCsvMode() {
    if (typeof exitOtherModes === 'function') exitOtherModes('csv');
    if (typeof markConvertActive === 'function') markConvertActive(null);
    if (typeof mainWorkspace !== 'undefined' && mainWorkspace) mainWorkspace.classList.add('hidden');
    if (typeof toolbarEl !== 'undefined' && toolbarEl) toolbarEl.classList.add('hidden');
    csvModeActive = true;
    csvWorkspace.classList.add('active');
    navCsvLink.classList.add('active');
    ensureCsvEditors();
    // 不再默认塞一份示例：空着进来，等用户「打开 CSV」或者从「示例」下拉里自己挑一份
    if (!csvSourceDirty && !csvModel.rows.length && !csvSourceText()) {
        csvRender();
        csvSyncOutput();
    } else {
        csvParseSource(false);
    }
    requestAnimationFrame(() => {
        if (csvSrcEditor) csvSrcEditor.refresh();
        csvRenderRows(true);
    });
}

function exitCsvMode() {
    if (!csvModeActive) return;
    csvModeActive = false;
    csvWorkspace.classList.remove('active');
    navCsvLink.classList.remove('active');
    csvClearSourceHighlight();
    if (typeof toolbarEl !== 'undefined' && toolbarEl) toolbarEl.classList.remove('hidden');
    if (typeof mainWorkspace !== 'undefined' && mainWorkspace) mainWorkspace.classList.remove('hidden');
    requestAnimationFrame(() => {
        if (typeof inputEditor !== 'undefined' && inputEditor) inputEditor.refresh();
        if (typeof outputEditor !== 'undefined' && outputEditor) outputEditor.refresh();
    });
}

// ---------------------------------------------------------------- 事件绑定
csvPick.addEventListener('click', () => csvFileInput.click());
csvFileInput.addEventListener('change', () => {
    const file = csvFileInput.files && csvFileInput.files[0];
    if (file) csvOpenFile(file);
    csvFileInput.value = '';
});
/* 示例从三个 chip 收成一个下拉：点触发器开合，点某一条就把那份样例载进去。
   开合沿用全局约定（options 加 `open`、trigger 加 `active`）——09-convert.js 里
   「点页面别处收下拉」认的就是这两个类，别自己另来一套。 */
function csvSampleOpen(open) {
    if (!csvSamples) return;
    const opts = csvSamples.querySelector('.custom-select-options');
    const trig = csvSamples.querySelector('.custom-select-trigger');
    if (opts) opts.classList.toggle('open', !!open);
    if (trig) {
        trig.classList.toggle('active', !!open);
        trig.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
}

if (csvSamples) {
    csvSamples.addEventListener('click', (e) => {
        const pick = e.target.closest ? e.target.closest('.custom-option') : null;
        if (pick) {
            // 点完就收：菜单留着会挡住源码
            e.stopPropagation();
            csvSampleOpen(false);
            const text = CSV_SAMPLES[pick.dataset.sample];
            if (text) csvLoadText(text, '', text.length);
            return;
        }
        if (!e.target.closest || !e.target.closest('.custom-select-trigger')) return;
        // 别让「点页面任意处收下拉」当场把它收掉
        e.stopPropagation();
        const opts = csvSamples.querySelector('.custom-select-options');
        const willOpen = !(opts && opts.classList.contains('open'));
        document.querySelectorAll('.custom-select-options').forEach((el) => {
            if (el !== opts) el.classList.remove('open');
        });
        document.querySelectorAll('.custom-select-trigger').forEach((el) => {
            if (!csvSamples.contains(el)) el.classList.remove('active');
        });
        csvSampleOpen(willOpen);
    });
    csvSamples.addEventListener('keydown', (e) => {
        const trig = csvSamples.querySelector('.custom-select-trigger');
        if (e.key === 'Escape') {
            csvSampleOpen(false);
            e.stopPropagation();
            return;
        }
        if ((e.key === 'Enter' || e.key === ' ') && trig && trig.contains(e.target)) {
            e.preventDefault();
            const opts = csvSamples.querySelector('.custom-select-options');
            csvSampleOpen(!(opts && opts.classList.contains('open')));
        }
    });
}
csvCopyBtn.addEventListener('click', () => { csvCopyCsv(); });
csvDownloadBtn.addEventListener('click', () => { csvDownloadCsv(); });
csvClearBtn.addEventListener('click', () => csvReset());
csvParseBtn.addEventListener('click', () => csvParseSource(true));
csvSyncBtn.addEventListener('click', () => {
    csvSourceDirty = false;
    csvPushSource(true);
});

function csvBindSeg(bar, onPick) {
    if (!bar) return;
    bar.addEventListener('click', (e) => {
        const btn = e.target.closest('.compare-tab');
        if (!btn) return;
        Array.prototype.forEach.call(bar.querySelectorAll('.compare-tab'), (b) => b.classList.toggle('active', b === btn));
        onPick(btn.dataset);
    });
}

csvBindSeg(csvDelimBar, (data) => {
    csvDelimiter = data.delim;
    csvSourceDirty = false;
    csvParseSource(true);
});
csvBindSeg(csvQuoteBar, (data) => {
    csvQuoteChar = data.quote || '';
    csvSourceDirty = false;
    csvParseSource(true);
});
csvBindSeg(csvEolBar, (data) => {
    csvEol = data.eol === '\r\n' ? '\r\n' : '\n';
    csvPushSource(true);
});
[csvHeaderBox, csvTrimBox, csvSkipEmptyBox].forEach((box) => {
    box.addEventListener('change', () => {
        csvSourceDirty = false;
        csvParseSource(true);
    });
});
csvBomBox.addEventListener('change', () => csvPushSource(true));

csvTabs.addEventListener('click', (e) => {
    const btn = e.target.closest('.compare-tab');
    if (btn) csvSetViewMode(btn.dataset.view);
});
if (csvMdSeg) {
    csvMdSeg.addEventListener('click', (e) => {
        const btn = e.target.closest('.compare-tab');
        if (!btn) return;
        csvMdMode = btn.dataset.md === 'source' ? 'source' : 'preview';
        csvApplyMdMode();
        if (csvMdMode === 'source') {
            ensureCsvOutEditor();
            csvSyncOutput();
            requestAnimationFrame(() => { if (csvOutEditor) csvOutEditor.refresh(); });
        } else {
            csvSyncOutput();
        }
    });
}
csvCopyOutBtn.addEventListener('click', async () => {
    const text = csvOutputText();
    if (!text) {
        csvNotify(csvT('csvTipEmpty'), 'error');
        return;
    }
    try {
        await writeClipboardText(text);
        csvNotify(csvFill(csvT('csvTipCopied'), { s: DBXCsv.formatBytes(text.length) }));
    } catch (e) {
        csvNotify(String(e && e.message ? e.message : e), 'error');
    }
});

csvAddRowBtn.addEventListener('click', csvAddRow);
csvAddColBtn.addEventListener('click', csvAddCol);
csvDelRowBtn.addEventListener('click', csvDelRow);
csvDelColBtn.addEventListener('click', csvDelCol);
csvSortAscBtn.addEventListener('click', () => csvSort(false));
csvSortDescBtn.addEventListener('click', () => csvSort(true));
csvUndoBtn.addEventListener('click', csvUndo);
csvRedoBtn.addEventListener('click', csvRedo);
csvReplaceOneBtn.addEventListener('click', csvReplaceOne);
csvReplaceAllBtn.addEventListener('click', csvReplaceAll);

/* ---------------- 搜索：高亮命中单元格 + 逐个定位 ----------------
 * 搜索和「只看命中」是两件事：默认只高亮并把表格滚到命中处（不改数据视图），
 * 想看「只留包含关键字的行」再按下那个开关。这样搜一个词不会把整表藏起来。 */
function csvUpdateFindCount() {
    if (!csvFindCount) return;
    if (!csvFindInput.value.trim()) {
        csvFindCount.textContent = '';
        return;
    }
    csvFindCount.textContent = csvMatches.length
        ? (csvMatchIdx + 1) + ' / ' + DBXCsv.formatInt(csvMatches.length)
        : '0';
    csvFindCount.classList.toggle('is-empty', !csvMatches.length);
}

function csvFindRefresh(jumpToFirst) {
    const q = csvFindInput.value.trim();
    csvMatches = q ? DBXCsv.findMatches(csvModel.rows, q, -1).slice(0, 20000) : [];
    csvHitMap = new Map();
    for (let i = 0; i < csvMatches.length; i++) {
        const m = csvMatches[i];
        let set = csvHitMap.get(m.r);
        if (!set) { set = new Set(); csvHitMap.set(m.r, set); }
        set.add(m.c);
    }
    csvMatchIdx = csvMatches.length ? 0 : -1;
    // 「只看命中」：命中的行才留在视图里；关掉就恢复全部行
    csvFilter = csvOnlyHits ? q : '';
    csvRefreshView();
    csvRange = { first: -1, last: -1 };
    csvRenderRows(true);
    csvUpdateFindCount();
    // 搜不到时不再单独提示：输入框右边的「0」已经说明白了，弹 toast 只会跟着按键重复弹
    if (jumpToFirst && csvMatches.length) csvJumpMatch(0, true);
    csvUpdateStats();
}

function csvJumpMatch(delta, absolute) {
    if (!csvMatches.length) {
        csvUpdateFindCount();
        return;
    }
    csvMatchIdx = absolute ? delta : (csvMatchIdx + delta + csvMatches.length) % csvMatches.length;
    const m = csvMatches[csvMatchIdx];
    // 命中的行可能被「只看命中」以外的过滤挡住；这时先放开过滤再定位
    csvSel = { r: m.r, c: m.c };
    csvScrollToRow(m.r);
    csvRenderRows(true);
    csvMarkSel();
    csvUpdateFindCount();
    csvLocateSource(m.r);
    // 这里不弹 toast：连点「下一个命中」会像撒纸片，表格选中态 + 计数「3 / 12」已经够清楚
}

let csvFindTimer = 0;
csvFindInput.addEventListener('input', () => {
    clearTimeout(csvFindTimer);
    // 十万行 × 二十列的匹配要几十毫秒，按键就扫会让输入框发涩
    // 边打边定位到第一个命中：占位符写的就是「查找，定位单元格」
    csvFindTimer = setTimeout(() => csvFindRefresh(true), 180);
});
csvFindInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        if (!csvMatches.length) csvFindRefresh(true);
        else csvJumpMatch(e.shiftKey ? -1 : 1);
    }
    if (e.key === 'Escape') {
        csvFindInput.value = '';
        csvFindRefresh(false);
        csvScroll.focus();
    }
});
csvFindNextBtn.addEventListener('click', () => csvJumpMatch(1));
csvFindPrevBtn.addEventListener('click', () => csvJumpMatch(-1));
csvFilterToggle.addEventListener('click', () => {
    csvOnlyHits = !csvOnlyHits;
    csvFilterToggle.classList.toggle('is-on', csvOnlyHits);
    csvFilterToggle.setAttribute('aria-pressed', csvOnlyHits ? 'true' : 'false');
    csvFindRefresh(false);
});

// 表格：点选 / 双击行内编辑 / 点小铅笔放大编辑 / 键盘导航 / 粘贴一块
csvTbody.addEventListener('click', (e) => {
    const td = e.target.closest('td[data-c]');
    if (!td) return;
    const r = Number(td.dataset.r);
    const c = Number(td.dataset.c);
    csvSelectCell(r, c, true);
    // 只有点那颗小铅笔才进放大弹窗；点格子本身是选中（双击才改）
    if (e.target.closest('.csv-cell-ico')) {
        e.preventDefault();
        csvOpenCellModal(r, c);
    }
});
csvTbody.addEventListener('dblclick', (e) => {
    const td = e.target.closest('td[data-c]');
    if (!td || e.target.closest('.csv-cell-ico')) return;
    const r = Number(td.dataset.r);
    const c = Number(td.dataset.c);
    // 默认行内编辑；值里带换行的行内只能看一行，直接给弹窗
    csvBeginInlineEdit(r, c);
});
csvThead.addEventListener('click', (e) => {
    const th = e.target.closest('th[data-c]');
    if (!th) return;
    csvSel = { r: csvSel.r < 0 ? 0 : csvSel.r, c: Number(th.dataset.c) };
    csvRenderHead();
    csvMarkSel();
});
csvThead.addEventListener('dblclick', (e) => {
    const th = e.target.closest('th[data-c]');
    if (th) csvOpenEditor(-1, Number(th.dataset.c), true);
});
csvScroll.addEventListener('keydown', csvOnGridKey);
csvScroll.addEventListener('scroll', () => {
    if (csvScrollRaf) return;
    csvScrollRaf = requestAnimationFrame(() => {
        csvScrollRaf = 0;
        csvRenderRows(false);
        if (csvEditCtx) {
            const visible = csvViewPos(csvEditCtx.r);
            if (visible < 0 || visible < csvRange.first || visible >= csvRange.last) csvCloseEditor(true);
        }
    });
});
csvScroll.addEventListener('paste', (e) => {
    if (csvEditCtx && !csvCellEdit.hidden) return;
    const text = (e.clipboardData || window.clipboardData).getData('text');
    if (!text) return;
    e.preventDefault();
    const r = csvSel.r < 0 ? 0 : csvSel.r;
    const c = csvSel.c < 0 ? 0 : csvSel.c;
    csvPasteBlock(text, r, c);
});

csvCellEdit.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const ctx = csvEditCtx;
        csvCloseEditor(true);
        if (ctx && ctx.r >= 0) csvMoveSel(1, 0);
        return;
    }
    if (e.key === 'Tab') {
        e.preventDefault();
        const ctx = csvEditCtx;
        const dc = e.shiftKey ? -1 : 1;
        csvCloseEditor(true);
        if (ctx && ctx.r >= 0) csvMoveSel(0, dc);
        return;
    }
    if (e.key === 'Escape') {
        e.preventDefault();
        csvCloseEditor(false);
        csvScroll.focus();
    }
});
csvCellEdit.addEventListener('blur', () => csvCloseEditor(true));
csvCellEdit.addEventListener('paste', csvHandlePaste);

// 放大编辑弹窗
csvCellModalSave.addEventListener('click', () => csvCloseCellModal(true));
csvCellModalCancel.addEventListener('click', () => csvCloseCellModal(false));
csvCellModalClose.addEventListener('click', () => csvCloseCellModal(false));
csvCellModal.addEventListener('mousedown', (e) => {
    if (e.target === csvCellModal) csvCloseCellModal(false);
});
csvCellModalText.addEventListener('input', () => {
    csvCellModalHint.textContent = csvFill(csvT('csvCellHint'), { n: csvCellModalText.value.length });
});
csvCellModalText.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        e.preventDefault();
        csvCloseCellModal(false);
        return;
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        csvCloseCellModal(true);
    }
});

// 快捷键只在页面可见时接管，别把格式转换页的 ⌘Z 也吃掉了
document.addEventListener('keydown', (e) => {
    if (!csvModeActive) return;
    const meta = e.metaKey || e.ctrlKey;
    if (!meta) return;
    if (e.key === 'z' || e.key === 'Z') {
        // 源码编辑器里交给 CodeMirror 自己的撤销栈
        if (csvSrcEditor && csvSrcEditor.hasFocus()) return;
        if (csvCellEdit && document.activeElement === csvCellEdit) return;
        e.preventDefault();
        if (e.shiftKey) csvRedo(); else csvUndo();
    }
});

// 弹窗挂到 body 上：宿主的页面容器有自己的滚动 / 裁剪上下文，
// 留在 section 里 position:fixed 会被算在那个容器上，遮罩盖不满、弹窗也不居中
if (csvCellModal && csvCellModal.parentNode !== document.body) document.body.appendChild(csvCellModal);

// 导航 / 切语言后重铺一次本页文案（22 在 18 之后加载，首次 applyI18n 时这张表还不在）
applyI18n();
csvUpdateFileInfo();
csvUpdateHistoryButtons();
csvSetViewMode('table');
