/* 19-datasql.js — SQL 分析页：贴一段分隔符表格，用 SELECT / WHERE / GROUP BY / ORDER BY 查 */

// =========================================
// 19. SQL 分析
// =========================================
// 引擎在纯函数库 js/sqlrun.js（window.DBXSqlRun），这里只负责界面。
//
// 为什么不是 duckdb-wasm：宿主沙箱的 CSP 是
//   default-src 'none'; script-src 'unsafe-inline' blob:; connect-src 'none';
// 既没有 'wasm-unsafe-eval'（Chromium 编译 wasm 直接 CompileError），connect-src 又是 'none'
// （连 fetch(blob:) 都拒），而 duckdb 的 wasm 一个就 35~41 MB。所以这里跑自己的小解释器：
// 纯 JS、离线、零依赖、包体零增长。
//
// 性能上的取舍（5 万行实测：分组聚合 13 ms、全表排序 25 ms、全表扫一遍 6 ms）：
//   · 数据只解析一次，改 SQL 不重新切分；解析结果按「文本摘要 + 分隔符 + 表头开关」缓存
//   · 改一个字就重跑没必要，输入防抖 220 ms；Ctrl/⌘ + Enter 立刻执行
//   · 结果最多取 1000 行，DOM 按 100 行一批追加，滚到底再补下一批

const DATASQL_I18N = {
    'zh-CN': {
        navDataSql: 'SQL 分析',
        dataSqlTypes: '列类型',
        dataSqlTypesTip: '查看或修改每一列的类型（参考 MySQL）',
        dataSqlTypesTitle: '列类型（参考 MySQL）',
        dataSqlTypeInfer: '重新推断',
        dataSqlTypeDdl: '复制 DDL',
        dataSqlToastDdl: '已复制 CREATE TABLE',
        dataSqlToastType: '列「{name}」改为 {type}',
        dataSqlTypeEmpty: '还没有列',
        dataSqlSamples: '示例',
        dataSqlSampleOrders: '订单明细',
        dataSqlSampleLogs: '访问日志',
        dataSqlSamplePipe: '管道分隔',
        dataSqlSampleNoHead: '无表头',
        dataSqlSnipAll: '全表',
        dataSqlSnipGroup: '分组汇总',
        dataSqlSnipDistinct: '去重',
        dataSqlSnipTop: '前 10 行',
        dataSqlNeedRun: 'SQL 或数据改过了，点「运行」更新结果',
        dataSqlSource: '数据',
        dataSqlResult: '查询结果',
        dataSqlDataPlaceholder: '粘贴表格数据，一行一条记录；分隔符自动识别',
        dataSqlQueryPlaceholder: 'SELECT region, SUM(amount) AS total FROM t GROUP BY region ORDER BY total DESC',
        dataSqlEmpty: '贴一段表格数据，上面写一句 SQL',
        dataSqlRun: '运行',
        dataSqlRunTip: '运行（Ctrl / ⌘ + Enter）',
        dataSqlCopyTsv: '复制结果',
        dataSqlStatus: '{n} 行 · {ms} ms',
        dataSqlErrAt: '第 {line} 行第 {col} 列：{msg}',
        dataSqlNoData: '还没有数据，先贴一段表格',
        dataSqlToastCopied: '已复制 {n} 行',
        dataSqlToastCell: '已复制：{v}',
        dataSqlToastEmpty: '这一格是空的',
        dataSqlMoreRows: '已显示 {shown} / {n} 行',
        dataSqlLoadMore: '加载更多',
        dataSqlTruncated: '结果超过上限，只显示前 {n} 行',
        dataSqlCancel: '取消',
        dataSqlCancelled: '已取消',
        dataSqlRunning: '运行中',
        dataSqlSorting: '排序中',
        dataSqlRunSelection: '执行所选（Ctrl / ⌘ + Enter）',
        dataSqlCutRows: '数据超过 {n} 行，只统计前 {n} 行',
        dataSqlCutChars: '文本超过 {n} 字，只读前 {n} 字',
        dataSqlNamesTip: '没有表头，列名就是 c1 / c2 …，SQL 里直接用',
        dataSqlViewText: '源码',
        dataSqlViewGrid: '表格',
        dataSqlViewTextTip: '直接编辑原始文本',
        dataSqlViewGridTip: '按解析结果预览成表格',
        dataSqlPreviewEmpty: '还没有数据，贴一段表格就能预览',
        dataSqlPreviewMore: '预览前 {shown} / {n} 行',
        dataSqlPreviewAll: '{n} 行',
        dataSqlRowsShown: '显示 {shown} / {n} 行',
        dataSqlXlsOld: '老式 .xls 读不了，请另存为 .xlsx 或 .csv',
        dataSqlImportFail: '读取失败：{name}',
        dataSqlImportEmpty: '这个文件里没有数据',
        dataSqlImportBin: '这是二进制文件，读不出文本',
        dataSqlResizeTip: '拖动调整 SQL 区高度（双击恢复默认）',
        dataSqlClearData: '清空数据',
        dataSqlClearDataTip: '清空左侧数据，SQL 语句保留',
        dataSqlClearSql: '清空 SQL',
        dataSqlClearSqlTip: '清空上面的 SQL 语句（数据保留）',
        dataSqlCtxRunSel: '执行所选',
        dataSqlCtxRunStmt: '执行当前语句',
        dataSqlCtxSelInfo: '选中 {lines} 行 · {chars} 字符',
        dataSqlCtxSelNone: '没有选中内容，将执行当前语句',
        dataSqlImportData: '导入数据',
        dataSqlImportDataTip: '导入表格数据（csv / tsv / txt / xlsx）',
        dataSqlLoadSql: '导入 SQL',
        dataSqlLoadSqlTip: '读入 .sql 文件，填进上面的编辑框',
        dataSqlInsertColTip: '点一下插入到 SQL 光标处',
        dataSqlBatchStatus: '{n} 条语句 · {ms} ms',
        dataSqlBatchRunning: '执行第 {i} / {n} 条…',
        dataSqlBatchFailed: '{n} 条成功，{m} 条出错',
        dataSqlBatchMoreErrors: '（另有 {n} 条也出错）',
        dataSqlBatchError: '第 {i} 条：{msg}',
        dataSqlBatchTab: '第 {i} 条',
        dataSqlBatchTabFail: '这一条执行出错，看上面的报错'
    },
    'zh-TW': {
        navDataSql: 'SQL 分析',
        dataSqlTypes: '欄位型別',
        dataSqlTypesTip: '檢視或修改每一欄的型別（參考 MySQL）',
        dataSqlTypesTitle: '欄位型別（參考 MySQL）',
        dataSqlTypeInfer: '重新推斷',
        dataSqlTypeDdl: '複製 DDL',
        dataSqlToastDdl: '已複製 CREATE TABLE',
        dataSqlToastType: '欄「{name}」改為 {type}',
        dataSqlTypeEmpty: '還沒有欄位',
        dataSqlSamples: '範例',
        dataSqlSampleOrders: '訂單明細',
        dataSqlSampleLogs: '存取日誌',
        dataSqlSamplePipe: '管線分隔',
        dataSqlSampleNoHead: '無表頭',
        dataSqlSnipAll: '全表',
        dataSqlSnipGroup: '分組彙總',
        dataSqlSnipDistinct: '去重',
        dataSqlSnipTop: '前 10 列',
        dataSqlNeedRun: 'SQL 或資料改過了，點「執行」更新結果',
        dataSqlSource: '資料',
        dataSqlResult: '查詢結果',
        dataSqlDataPlaceholder: '貼上表格資料，一列一筆；分隔符自動辨識',
        dataSqlQueryPlaceholder: 'SELECT region, SUM(amount) AS total FROM t GROUP BY region ORDER BY total DESC',
        dataSqlEmpty: '貼上一段表格資料，上面寫一句 SQL',
        dataSqlRun: '執行',
        dataSqlRunTip: '執行（Ctrl / ⌘ + Enter）',
        dataSqlCopyTsv: '複製結果',
        dataSqlStatus: '{n} 列 · {ms} ms',
        dataSqlErrAt: '第 {line} 列第 {col} 欄：{msg}',
        dataSqlNoData: '還沒有資料，先貼一段表格',
        dataSqlToastCopied: '已複製 {n} 列',
        dataSqlToastCell: '已複製：{v}',
        dataSqlToastEmpty: '這一格是空的',
        dataSqlMoreRows: '已顯示 {shown} / {n} 列',
        dataSqlLoadMore: '載入更多',
        dataSqlTruncated: '結果超過上限，只顯示前 {n} 列',
        dataSqlCancel: '取消',
        dataSqlCancelled: '已取消',
        dataSqlRunning: '執行中',
        dataSqlSorting: '排序中',
        dataSqlRunSelection: '執行選取範圍（Ctrl / ⌘ + Enter）',
        dataSqlCutRows: '資料超過 {n} 列，只統計前 {n} 列',
        dataSqlCutChars: '文字超過 {n} 字，只讀前 {n} 字',
        dataSqlNamesTip: '沒有表頭，欄名就是 c1 / c2 …，SQL 裡直接用',
        dataSqlViewText: '原始碼',
        dataSqlViewGrid: '表格',
        dataSqlViewTextTip: '直接編輯原始文字',
        dataSqlViewGridTip: '依解析結果預覽成表格',
        dataSqlPreviewEmpty: '還沒有資料，貼一段表格就能預覽',
        dataSqlPreviewMore: '預覽前 {shown} / {n} 列',
        dataSqlPreviewAll: '{n} 列',
        dataSqlRowsShown: '顯示 {shown} / {n} 列',
        dataSqlXlsOld: '老式 .xls 讀不了，請另存為 .xlsx 或 .csv',
        dataSqlImportFail: '讀取失敗：{name}',
        dataSqlImportEmpty: '這個檔案裡沒有資料',
        dataSqlImportBin: '這是二進位檔，讀不出文字',
        dataSqlResizeTip: '拖動調整 SQL 區高度（雙擊恢復預設）',
        dataSqlClearData: '清空資料',
        dataSqlClearDataTip: '清空左側資料，SQL 語句保留',
        dataSqlClearSql: '清空 SQL',
        dataSqlClearSqlTip: '清空上面的 SQL 語句（資料保留）',
        dataSqlCtxRunSel: '執行所選',
        dataSqlCtxRunStmt: '執行目前語句',
        dataSqlCtxSelInfo: '選取 {lines} 列 · {chars} 字元',
        dataSqlCtxSelNone: '沒有選取內容，將執行目前語句',
        dataSqlImportData: '匯入資料',
        dataSqlImportDataTip: '匯入表格資料（csv / tsv / txt / xlsx）',
        dataSqlLoadSql: '匯入 SQL',
        dataSqlLoadSqlTip: '讀入 .sql 檔案，填入上面的編輯框',
        dataSqlInsertColTip: '點一下插入到 SQL 游標處',
        dataSqlBatchStatus: '{n} 條語句 · {ms} ms',
        dataSqlBatchRunning: '執行第 {i} / {n} 條…',
        dataSqlBatchFailed: '{n} 條成功，{m} 條出錯',
        dataSqlBatchMoreErrors: '（另有 {n} 條也出錯）',
        dataSqlBatchError: '第 {i} 條：{msg}',
        dataSqlBatchTab: '第 {i} 條',
        dataSqlBatchTabFail: '這一條執行出錯，看上面的報錯'
    },
    en: {
        navDataSql: 'SQL Query',
        dataSqlTypes: 'Column types',
        dataSqlTypesTip: 'Inspect or fix each column\'s type (MySQL-style)',
        dataSqlTypesTitle: 'Column types (MySQL-style)',
        dataSqlTypeInfer: 'Infer again',
        dataSqlTypeDdl: 'Copy DDL',
        dataSqlToastDdl: 'Copied CREATE TABLE',
        dataSqlToastType: 'Column "{name}" set to {type}',
        dataSqlTypeEmpty: 'No columns yet',
        dataSqlSamples: 'Samples',
        dataSqlSampleOrders: 'Orders',
        dataSqlSampleLogs: 'Access log',
        dataSqlSamplePipe: 'Pipe-delimited',
        dataSqlSampleNoHead: 'No header',
        dataSqlSnipAll: 'All rows',
        dataSqlSnipGroup: 'Group & sum',
        dataSqlSnipDistinct: 'Distinct',
        dataSqlSnipTop: 'Top 10',
        dataSqlNeedRun: 'Changed — press Run to refresh the result',
        dataSqlSource: 'Data',
        dataSqlResult: 'Result',
        dataSqlDataPlaceholder: 'Paste a table, one record per line; the delimiter is detected',
        dataSqlQueryPlaceholder: 'SELECT region, SUM(amount) AS total FROM t GROUP BY region ORDER BY total DESC',
        dataSqlEmpty: 'Paste some data, then write a query above',
        dataSqlRun: 'Run',
        dataSqlRunTip: 'Run (Ctrl / ⌘ + Enter)',
        dataSqlCopyTsv: 'Copy result',
        dataSqlStatus: '{n} rows · {ms} ms',
        dataSqlErrAt: 'Line {line}, column {col}: {msg}',
        dataSqlNoData: 'No data yet — paste a table first',
        dataSqlToastCopied: 'Copied {n} rows',
        dataSqlToastCell: 'Copied: {v}',
        dataSqlToastEmpty: 'This cell is empty',
        dataSqlMoreRows: 'Showing {shown} / {n} rows',
        dataSqlLoadMore: 'Load more',
        dataSqlTruncated: 'Result capped at {n} rows',
        dataSqlCancel: 'Cancel',
        dataSqlCancelled: 'Cancelled',
        dataSqlRunning: 'Running',
        dataSqlSorting: 'Sorting',
        dataSqlRunSelection: 'Run selection (Ctrl / ⌘ + Enter)',
        dataSqlCutRows: 'Data exceeds {n} rows — only the first {n} are counted',
        dataSqlCutChars: 'Text exceeds {n} characters — only the first {n} are read',
        dataSqlNamesTip: 'No header row: columns are c1 / c2 … — use them in SQL as-is',
        dataSqlViewText: 'Source',
        dataSqlViewGrid: 'Table',
        dataSqlViewTextTip: 'Edit the raw text',
        dataSqlViewGridTip: 'Preview the parsed result as a table',
        dataSqlPreviewEmpty: 'No data yet — paste a table to preview it',
        dataSqlPreviewMore: 'Previewing {shown} of {n} rows',
        dataSqlPreviewAll: '{n} rows',
        dataSqlRowsShown: '{shown} of {n} rows',
        dataSqlXlsOld: 'Legacy .xls cannot be read — save it as .xlsx or .csv',
        dataSqlImportFail: 'Could not read {name}',
        dataSqlImportEmpty: 'No data in this file',
        dataSqlImportBin: 'This is a binary file — no text to read',
        dataSqlResizeTip: 'Drag to resize the SQL area (double-click to reset)',
        dataSqlClearData: 'Clear data',
        dataSqlClearDataTip: 'Clear the data on the left, keep the SQL',
        dataSqlClearSql: 'Clear SQL',
        dataSqlClearSqlTip: 'Clear the SQL above (data is kept)',
        dataSqlCtxRunSel: 'Run selected',
        dataSqlCtxRunStmt: 'Run current statement',
        dataSqlCtxSelInfo: '{lines} lines · {chars} chars selected',
        dataSqlCtxSelNone: 'Nothing selected — runs the current statement',
        dataSqlImportData: 'Import data',
        dataSqlImportDataTip: 'Import table data (csv / tsv / txt / xlsx)',
        dataSqlLoadSql: 'Import SQL',
        dataSqlLoadSqlTip: 'Load a .sql file into the editor above',
        dataSqlInsertColTip: 'Click to insert at the SQL cursor',
        dataSqlBatchStatus: '{n} statements · {ms} ms',
        dataSqlBatchRunning: 'Running statement {i} / {n}…',
        dataSqlBatchFailed: '{n} succeeded, {m} failed',
        dataSqlBatchMoreErrors: '({n} more failed)',
        dataSqlBatchError: 'Statement {i}: {msg}',
        dataSqlBatchTab: '#{i}',
        dataSqlBatchTabFail: 'This statement failed — see the error above'
    },
    az: {
        navDataSql: 'SQL sorğusu',
        dataSqlTypes: 'Sütun tipləri',
        dataSqlTypesTip: 'Hər sütunun tipini gör və düzəlt (MySQL üslubu)',
        dataSqlTypesTitle: 'Sütun tipləri (MySQL)',
        dataSqlTypeInfer: 'Yenidən təyin et',
        dataSqlTypeDdl: 'DDL-i kopyala',
        dataSqlToastDdl: 'CREATE TABLE kopyalandı',
        dataSqlToastType: '«{name}» sütunu {type} oldu',
        dataSqlTypeEmpty: 'Hələ sütun yoxdur',
        dataSqlSamples: 'Nümunələr',
        dataSqlSampleOrders: 'Sifarişlər',
        dataSqlSampleLogs: 'Giriş jurnalı',
        dataSqlSamplePipe: 'Boru ilə ayrılmış',
        dataSqlSampleNoHead: 'Başlıqsız',
        dataSqlSnipAll: 'Bütün sətirlər',
        dataSqlSnipGroup: 'Qruplaşdır',
        dataSqlSnipDistinct: 'Təkrarsız',
        dataSqlSnipTop: 'İlk 10',
        dataSqlNeedRun: 'Dəyişdi — nəticəni yeniləmək üçün «İşə sal»',
        dataSqlSource: 'Məlumat',
        dataSqlResult: 'Nəticə',
        dataSqlDataPlaceholder: 'Cədvəli yapışdırın, hər sətir bir qeyd; ayırıcı avtomatik tapılır',
        dataSqlQueryPlaceholder: 'SELECT region, SUM(amount) AS total FROM t GROUP BY region ORDER BY total DESC',
        dataSqlEmpty: 'Məlumat yapışdırın, yuxarıda sorğu yazın',
        dataSqlRun: 'İşə sal',
        dataSqlRunTip: 'İşə sal (Ctrl / ⌘ + Enter)',
        dataSqlCopyTsv: 'Nəticəni kopyala',
        dataSqlStatus: '{n} sətir · {ms} ms',
        dataSqlErrAt: '{line} sətir, {col} sütun: {msg}',
        dataSqlNoData: 'Hələ məlumat yoxdur',
        dataSqlToastCopied: '{n} sətir kopyalandı',
        dataSqlToastCell: 'Kopyalandı: {v}',
        dataSqlToastEmpty: 'Bu hücrə boşdur',
        dataSqlMoreRows: '{shown} / {n} sətir göstərilir',
        dataSqlLoadMore: 'Daha çox',
        dataSqlTruncated: 'Nəticə {n} sətirlə məhdudlaşdı',
        dataSqlCancel: 'Ləğv et',
        dataSqlCancelled: 'Ləğv edildi',
        dataSqlRunning: 'İcra olunur',
        dataSqlSorting: 'Sıralanır',
        dataSqlRunSelection: 'Seçilmişi icra et (Ctrl / ⌘ + Enter)',
        dataSqlCutRows: 'Məlumat {n} sətirdən çoxdur — yalnız ilk {n} sətir hesablanır',
        dataSqlCutChars: 'Mətn {n} simvoldan çoxdur — yalnız ilk {n} simvol oxunur',
        dataSqlNamesTip: 'Başlıq sətri yoxdur: sütunlar c1 / c2 … — SQL-də olduğu kimi istifadə edin',
        dataSqlViewText: 'Mənbə',
        dataSqlViewGrid: 'Cədvəl',
        dataSqlViewTextTip: 'Xam mətni redaktə edin',
        dataSqlViewGridTip: 'Təhlil nəticəsini cədvəl kimi göstər',
        dataSqlPreviewEmpty: 'Hələ məlumat yoxdur — cədvəl yapışdırın',
        dataSqlPreviewMore: 'İlk {shown} / {n} sətir',
        dataSqlPreviewAll: '{n} sətir',
        dataSqlRowsShown: '{shown} / {n} sətir',
        dataSqlXlsOld: 'Köhnə .xls oxunmur — .xlsx və ya .csv kimi yadda saxlayın',
        dataSqlImportFail: '{name} oxunmadı',
        dataSqlImportEmpty: 'Bu faylda məlumat yoxdur',
        dataSqlImportBin: 'Bu binar fayldır — mətn oxunmur',
        dataSqlResizeTip: 'SQL sahəsinin hündürlüyünü dəyişmək üçün dartın (iki dəfə klik = sıfırla)',
        dataSqlClearData: 'Məlumatı təmizlə',
        dataSqlClearDataTip: 'Soldakı məlumatı təmizlə, SQL qalsın',
        dataSqlClearSql: 'SQL-i təmizlə',
        dataSqlClearSqlTip: 'Yuxarıdakı SQL-i təmizlə (məlumat qalır)',
        dataSqlCtxRunSel: 'Seçilmişi işə sal',
        dataSqlCtxRunStmt: 'Cari ifadəni işə sal',
        dataSqlCtxSelInfo: '{lines} sətir · {chars} simvol seçildi',
        dataSqlCtxSelNone: 'Heç nə seçilməyib — cari ifadə işə düşəcək',
        dataSqlImportData: 'Məlumat idxal et',
        dataSqlImportDataTip: 'Cədvəl məlumatını idxal et (csv / tsv / txt / xlsx)',
        dataSqlLoadSql: 'SQL idxal et',
        dataSqlLoadSqlTip: '.sql faylını yuxarıdakı redaktora yüklə',
        dataSqlInsertColTip: 'SQL kursoruna əlavə etmək üçün klikləyin',
        dataSqlBatchStatus: '{n} ifadə · {ms} ms',
        dataSqlBatchRunning: '{i} / {n} ifadə işə düşür…',
        dataSqlBatchFailed: '{n} uğurlu, {m} xətalı',
        dataSqlBatchMoreErrors: '(daha {n} ifadə də xətalı)',
        dataSqlBatchError: '{i}-ci ifadə: {msg}',
        dataSqlBatchTab: '#{i}',
        dataSqlBatchTabFail: 'Bu ifadə alınmadı — yuxarıdakı xətaya baxın'
    },
    es: {
        navDataSql: 'Consulta SQL',
        dataSqlTypes: 'Tipos de columna',
        dataSqlTypesTip: 'Ver o corregir el tipo de cada columna (estilo MySQL)',
        dataSqlTypesTitle: 'Tipos de columna (MySQL)',
        dataSqlTypeInfer: 'Volver a inferir',
        dataSqlTypeDdl: 'Copiar DDL',
        dataSqlToastDdl: 'CREATE TABLE copiado',
        dataSqlToastType: 'Columna «{name}» ahora {type}',
        dataSqlTypeEmpty: 'Aún no hay columnas',
        dataSqlSamples: 'Ejemplos',
        dataSqlSampleOrders: 'Pedidos',
        dataSqlSampleLogs: 'Registro de accesos',
        dataSqlSamplePipe: 'Separado por barras',
        dataSqlSampleNoHead: 'Sin cabecera',
        dataSqlSnipAll: 'Todo',
        dataSqlSnipGroup: 'Agrupar',
        dataSqlSnipDistinct: 'Únicos',
        dataSqlSnipTop: 'Top 10',
        dataSqlNeedRun: 'Cambió: pulsa Ejecutar para actualizar el resultado',
        dataSqlSource: 'Datos',
        dataSqlResult: 'Resultado',
        dataSqlDataPlaceholder: 'Pega una tabla, un registro por línea; el separador se detecta',
        dataSqlQueryPlaceholder: 'SELECT region, SUM(amount) AS total FROM t GROUP BY region ORDER BY total DESC',
        dataSqlEmpty: 'Pega datos y escribe una consulta arriba',
        dataSqlRun: 'Ejecutar',
        dataSqlRunTip: 'Ejecutar (Ctrl / ⌘ + Enter)',
        dataSqlCopyTsv: 'Copiar resultado',
        dataSqlStatus: '{n} filas · {ms} ms',
        dataSqlErrAt: 'Línea {line}, columna {col}: {msg}',
        dataSqlNoData: 'Aún no hay datos',
        dataSqlToastCopied: 'Se copiaron {n} filas',
        dataSqlToastCell: 'Copiado: {v}',
        dataSqlToastEmpty: 'Esta celda está vacía',
        dataSqlMoreRows: 'Mostrando {shown} / {n} filas',
        dataSqlLoadMore: 'Cargar más',
        dataSqlTruncated: 'Resultado limitado a {n} filas',
        dataSqlCancel: 'Cancelar',
        dataSqlCancelled: 'Cancelado',
        dataSqlRunning: 'Ejecutando',
        dataSqlSorting: 'Ordenando',
        dataSqlRunSelection: 'Ejecutar selección (Ctrl / ⌘ + Enter)',
        dataSqlCutRows: 'Los datos superan {n} filas: solo se cuentan las primeras {n}',
        dataSqlCutChars: 'El texto supera {n} caracteres: solo se leen los primeros {n}',
        dataSqlNamesTip: 'Sin cabecera: las columnas son c1 / c2 … — úsalas directamente en SQL',
        dataSqlViewText: 'Código',
        dataSqlViewGrid: 'Tabla',
        dataSqlViewTextTip: 'Editar el texto original',
        dataSqlViewGridTip: 'Ver el resultado analizado como tabla',
        dataSqlPreviewEmpty: 'Aún no hay datos: pega una tabla para verla',
        dataSqlPreviewMore: 'Vista previa de {shown} de {n} filas',
        dataSqlPreviewAll: '{n} filas',
        dataSqlRowsShown: '{shown} de {n} filas',
        dataSqlXlsOld: 'El .xls antiguo no se puede leer: guarda como .xlsx o .csv',
        dataSqlImportFail: 'No se pudo leer {name}',
        dataSqlImportEmpty: 'Este archivo no tiene datos',
        dataSqlImportBin: 'Es un archivo binario: no hay texto que leer',
        dataSqlResizeTip: 'Arrastra para cambiar la altura del área SQL (doble clic para restablecer)',
        dataSqlClearData: 'Borrar datos',
        dataSqlClearDataTip: 'Borra los datos de la izquierda y conserva el SQL',
        dataSqlClearSql: 'Borrar SQL',
        dataSqlClearSqlTip: 'Borra el SQL de arriba (los datos se conservan)',
        dataSqlCtxRunSel: 'Ejecutar selección',
        dataSqlCtxRunStmt: 'Ejecutar la sentencia actual',
        dataSqlCtxSelInfo: '{lines} líneas · {chars} caracteres seleccionados',
        dataSqlCtxSelNone: 'Nada seleccionado: se ejecuta la sentencia actual',
        dataSqlImportData: 'Importar datos',
        dataSqlImportDataTip: 'Importa datos de tabla (csv / tsv / txt / xlsx)',
        dataSqlLoadSql: 'Importar SQL',
        dataSqlLoadSqlTip: 'Carga un archivo .sql en el editor de arriba',
        dataSqlInsertColTip: 'Clic para insertar en el cursor del SQL',
        dataSqlBatchStatus: '{n} sentencias · {ms} ms',
        dataSqlBatchRunning: 'Ejecutando la sentencia {i} / {n}…',
        dataSqlBatchFailed: '{n} correctas, {m} con error',
        dataSqlBatchMoreErrors: '({n} más con error)',
        dataSqlBatchError: 'Sentencia {i}: {msg}',
        dataSqlBatchTab: '#{i}',
        dataSqlBatchTabFail: 'Esta sentencia falló: mira el error de arriba'
    },
    id: {
        navDataSql: 'Kueri SQL',
        dataSqlTypes: 'Tipe kolom',
        dataSqlTypesTip: 'Lihat atau ubah tipe tiap kolom (gaya MySQL)',
        dataSqlTypesTitle: 'Tipe kolom (MySQL)',
        dataSqlTypeInfer: 'Simpulkan ulang',
        dataSqlTypeDdl: 'Salin DDL',
        dataSqlToastDdl: 'CREATE TABLE disalin',
        dataSqlToastType: 'Kolom "{name}" menjadi {type}',
        dataSqlTypeEmpty: 'Belum ada kolom',
        dataSqlSamples: 'Contoh',
        dataSqlSampleOrders: 'Detail pesanan',
        dataSqlSampleLogs: 'Log akses',
        dataSqlSamplePipe: 'Dipisah pipa',
        dataSqlSampleNoHead: 'Tanpa header',
        dataSqlSnipAll: 'Semua',
        dataSqlSnipGroup: 'Agregat grup',
        dataSqlSnipDistinct: 'Unik',
        dataSqlSnipTop: '10 teratas',
        dataSqlNeedRun: 'Berubah — tekan Jalankan untuk memperbarui hasil',
        dataSqlSource: 'Data',
        dataSqlResult: 'Hasil',
        dataSqlDataPlaceholder: 'Tempel tabel, satu baris satu data; pemisah dideteksi otomatis',
        dataSqlQueryPlaceholder: 'SELECT region, SUM(amount) AS total FROM t GROUP BY region ORDER BY total DESC',
        dataSqlEmpty: 'Tempel data, lalu tulis kueri di atas',
        dataSqlRun: 'Jalankan',
        dataSqlRunTip: 'Jalankan (Ctrl / ⌘ + Enter)',
        dataSqlCopyTsv: 'Salin hasil',
        dataSqlStatus: '{n} baris · {ms} ms',
        dataSqlErrAt: 'Baris {line}, kolom {col}: {msg}',
        dataSqlNoData: 'Belum ada data',
        dataSqlToastCopied: '{n} baris disalin',
        dataSqlToastCell: 'Disalin: {v}',
        dataSqlToastEmpty: 'Sel ini kosong',
        dataSqlMoreRows: 'Menampilkan {shown} / {n} baris',
        dataSqlLoadMore: 'Muat lagi',
        dataSqlTruncated: 'Hasil dibatasi {n} baris',
        dataSqlCancel: 'Batal',
        dataSqlCancelled: 'Dibatalkan',
        dataSqlRunning: 'Menjalankan',
        dataSqlSorting: 'Mengurutkan',
        dataSqlRunSelection: 'Jalankan pilihan (Ctrl / ⌘ + Enter)',
        dataSqlCutRows: 'Data melebihi {n} baris — hanya {n} baris pertama dihitung',
        dataSqlCutChars: 'Teks melebihi {n} karakter — hanya {n} karakter pertama dibaca',
        dataSqlNamesTip: 'Tanpa baris header: kolomnya c1 / c2 … — pakai langsung di SQL',
        dataSqlViewText: 'Sumber',
        dataSqlViewGrid: 'Tabel',
        dataSqlViewTextTip: 'Edit teks aslinya',
        dataSqlViewGridTip: 'Pratinjau hasil parsing sebagai tabel',
        dataSqlPreviewEmpty: 'Belum ada data — tempel tabel untuk pratinjau',
        dataSqlPreviewMore: 'Pratinjau {shown} dari {n} baris',
        dataSqlPreviewAll: '{n} baris',
        dataSqlRowsShown: '{shown} dari {n} baris',
        dataSqlXlsOld: '.xls lama tidak bisa dibaca — simpan sebagai .xlsx atau .csv',
        dataSqlImportFail: 'Gagal membaca {name}',
        dataSqlImportEmpty: 'File ini tidak berisi data',
        dataSqlImportBin: 'Ini file biner — tidak ada teks',
        dataSqlResizeTip: 'Seret untuk mengatur tinggi area SQL (klik dua kali untuk reset)',
        dataSqlClearData: 'Hapus data',
        dataSqlClearDataTip: 'Hapus data di kiri, SQL tetap',
        dataSqlClearSql: 'Hapus SQL',
        dataSqlClearSqlTip: 'Hapus SQL di atas (data tetap)',
        dataSqlCtxRunSel: 'Jalankan pilihan',
        dataSqlCtxRunStmt: 'Jalankan pernyataan ini',
        dataSqlCtxSelInfo: '{lines} baris · {chars} karakter dipilih',
        dataSqlCtxSelNone: 'Tidak ada yang dipilih — pernyataan ini dijalankan',
        dataSqlImportData: 'Impor data',
        dataSqlImportDataTip: 'Impor data tabel (csv / tsv / txt / xlsx)',
        dataSqlLoadSql: 'Impor SQL',
        dataSqlLoadSqlTip: 'Muat file .sql ke editor di atas',
        dataSqlInsertColTip: 'Klik untuk menyisipkan di kursor SQL',
        dataSqlBatchStatus: '{n} pernyataan · {ms} ms',
        dataSqlBatchRunning: 'Menjalankan pernyataan {i} / {n}…',
        dataSqlBatchFailed: '{n} berhasil, {m} gagal',
        dataSqlBatchMoreErrors: '({n} lainnya gagal)',
        dataSqlBatchError: 'Pernyataan {i}: {msg}',
        dataSqlBatchTab: '#{i}',
        dataSqlBatchTabFail: 'Pernyataan ini gagal — lihat galat di atas'
    },
    it: {
        navDataSql: 'Query SQL',
        dataSqlTypes: 'Tipi di colonna',
        dataSqlTypesTip: 'Vedi o correggi il tipo di ogni colonna (stile MySQL)',
        dataSqlTypesTitle: 'Tipi di colonna (MySQL)',
        dataSqlTypeInfer: 'Ricalcola',
        dataSqlTypeDdl: 'Copia DDL',
        dataSqlToastDdl: 'CREATE TABLE copiato',
        dataSqlToastType: 'Colonna «{name}» ora {type}',
        dataSqlTypeEmpty: 'Nessuna colonna',
        dataSqlSamples: 'Esempi',
        dataSqlSampleOrders: 'Ordini',
        dataSqlSampleLogs: 'Log accessi',
        dataSqlSamplePipe: 'Separato da barre',
        dataSqlSampleNoHead: 'Senza intestazione',
        dataSqlSnipAll: 'Tutto',
        dataSqlSnipGroup: 'Raggruppa',
        dataSqlSnipDistinct: 'Unici',
        dataSqlSnipTop: 'Primi 10',
        dataSqlNeedRun: 'Modificato: premi Esegui per aggiornare il risultato',
        dataSqlSource: 'Dati',
        dataSqlResult: 'Risultato',
        dataSqlDataPlaceholder: 'Incolla una tabella, un record per riga; il separatore viene rilevato',
        dataSqlQueryPlaceholder: 'SELECT region, SUM(amount) AS total FROM t GROUP BY region ORDER BY total DESC',
        dataSqlEmpty: 'Incolla i dati e scrivi una query sopra',
        dataSqlRun: 'Esegui',
        dataSqlRunTip: 'Esegui (Ctrl / ⌘ + Enter)',
        dataSqlCopyTsv: 'Copia risultato',
        dataSqlStatus: '{n} righe · {ms} ms',
        dataSqlErrAt: 'Riga {line}, colonna {col}: {msg}',
        dataSqlNoData: 'Nessun dato per ora',
        dataSqlToastCopied: 'Copiate {n} righe',
        dataSqlToastCell: 'Copiato: {v}',
        dataSqlToastEmpty: 'Questa cella è vuota',
        dataSqlMoreRows: 'Mostrate {shown} / {n} righe',
        dataSqlLoadMore: 'Carica altro',
        dataSqlTruncated: 'Risultato limitato a {n} righe',
        dataSqlCancel: 'Annulla',
        dataSqlCancelled: 'Annullato',
        dataSqlRunning: 'Esecuzione',
        dataSqlSorting: 'Ordinamento',
        dataSqlRunSelection: 'Esegui selezione (Ctrl / ⌘ + Enter)',
        dataSqlCutRows: 'I dati superano {n} righe: contano solo le prime {n}',
        dataSqlCutChars: 'Il testo supera {n} caratteri: si leggono solo i primi {n}',
        dataSqlNamesTip: 'Nessuna intestazione: le colonne sono c1 / c2 … — usale direttamente in SQL',
        dataSqlViewText: 'Sorgente',
        dataSqlViewGrid: 'Tabella',
        dataSqlViewTextTip: 'Modifica il testo originale',
        dataSqlViewGridTip: 'Anteprima del risultato analizzato come tabella',
        dataSqlPreviewEmpty: 'Ancora nessun dato: incolla una tabella per l’anteprima',
        dataSqlPreviewMore: 'Anteprima di {shown} / {n} righe',
        dataSqlPreviewAll: '{n} righe',
        dataSqlRowsShown: '{shown} di {n} righe',
        dataSqlXlsOld: 'Il vecchio .xls non è leggibile: salva come .xlsx o .csv',
        dataSqlImportFail: 'Impossibile leggere {name}',
        dataSqlImportEmpty: 'Questo file non contiene dati',
        dataSqlImportBin: 'È un file binario: nessun testo da leggere',
        dataSqlResizeTip: 'Trascina per ridimensionare l’area SQL (doppio clic per ripristinare)',
        dataSqlClearData: 'Svuota dati',
        dataSqlClearDataTip: 'Svuota i dati a sinistra, il SQL resta',
        dataSqlClearSql: 'Svuota SQL',
        dataSqlClearSqlTip: 'Svuota l’SQL sopra (i dati restano)',
        dataSqlCtxRunSel: 'Esegui selezione',
        dataSqlCtxRunStmt: 'Esegui l’istruzione corrente',
        dataSqlCtxSelInfo: '{lines} righe · {chars} caratteri selezionati',
        dataSqlCtxSelNone: 'Nessuna selezione: esegue l’istruzione corrente',
        dataSqlImportData: 'Importa dati',
        dataSqlImportDataTip: 'Importa dati tabellari (csv / tsv / txt / xlsx)',
        dataSqlLoadSql: 'Importa SQL',
        dataSqlLoadSqlTip: 'Carica un file .sql nell’editor sopra',
        dataSqlInsertColTip: 'Clic per inserire nel cursore SQL',
        dataSqlBatchStatus: '{n} istruzioni · {ms} ms',
        dataSqlBatchRunning: 'Esecuzione dell’istruzione {i} / {n}…',
        dataSqlBatchFailed: '{n} riuscite, {m} con errori',
        dataSqlBatchMoreErrors: '(altre {n} con errori)',
        dataSqlBatchError: 'Istruzione {i}: {msg}',
        dataSqlBatchTab: '#{i}',
        dataSqlBatchTabFail: 'Questa istruzione è fallita — vedi l\'errore sopra'
    },
    ja: {
        navDataSql: 'SQL 分析',
        dataSqlTypes: '列の型',
        dataSqlTypesTip: '各列の型を確認・修正（MySQL 準拠）',
        dataSqlTypesTitle: '列の型（MySQL 準拠）',
        dataSqlTypeInfer: '再推論',
        dataSqlTypeDdl: 'DDL をコピー',
        dataSqlToastDdl: 'CREATE TABLE をコピーしました',
        dataSqlToastType: '列「{name}」を {type} に変更',
        dataSqlTypeEmpty: '列がありません',
        dataSqlSamples: 'サンプル',
        dataSqlSampleOrders: '注文明細',
        dataSqlSampleLogs: 'アクセスログ',
        dataSqlSamplePipe: 'パイプ区切り',
        dataSqlSampleNoHead: 'ヘッダーなし',
        dataSqlSnipAll: '全件',
        dataSqlSnipGroup: 'グループ集計',
        dataSqlSnipDistinct: '重複排除',
        dataSqlSnipTop: '先頭 10 行',
        dataSqlNeedRun: '変更あり — 「実行」で結果を更新します',
        dataSqlSource: 'データ',
        dataSqlResult: 'クエリ結果',
        dataSqlDataPlaceholder: '表データを貼り付け（1 行 1 レコード、区切り文字は自動判定）',
        dataSqlQueryPlaceholder: 'SELECT region, SUM(amount) AS total FROM t GROUP BY region ORDER BY total DESC',
        dataSqlEmpty: 'データを貼り付け、上に SQL を書いてください',
        dataSqlRun: '実行',
        dataSqlRunTip: '実行（Ctrl / ⌘ + Enter）',
        dataSqlCopyTsv: '結果をコピー',
        dataSqlStatus: '{n} 行 · {ms} ms',
        dataSqlErrAt: '{line} 行 {col} 列：{msg}',
        dataSqlNoData: 'データがありません',
        dataSqlToastCopied: '{n} 行をコピーしました',
        dataSqlToastCell: 'コピーしました：{v}',
        dataSqlToastEmpty: 'このセルは空です',
        dataSqlMoreRows: '{shown} / {n} 行を表示中',
        dataSqlLoadMore: 'さらに読み込む',
        dataSqlTruncated: '上限を超えたため先頭 {n} 行のみ',
        dataSqlCancel: 'キャンセル',
        dataSqlCancelled: 'キャンセルしました',
        dataSqlRunning: '実行中',
        dataSqlSorting: '並べ替え中',
        dataSqlRunSelection: '選択範囲を実行（Ctrl / ⌘ + Enter）',
        dataSqlCutRows: 'データが {n} 行を超えています。先頭 {n} 行のみ集計します',
        dataSqlCutChars: 'テキストが {n} 文字を超えています。先頭 {n} 文字のみ読み込みます',
        dataSqlNamesTip: 'ヘッダー行がない場合、列名は c1 / c2 … です。SQL でそのまま使えます',
        dataSqlViewText: 'ソース',
        dataSqlViewGrid: '表',
        dataSqlViewTextTip: '元のテキストを編集',
        dataSqlViewGridTip: '解析結果を表でプレビュー',
        dataSqlPreviewEmpty: 'データがまだありません。表を貼り付けるとプレビューできます',
        dataSqlPreviewMore: '先頭 {shown} / {n} 行を表示',
        dataSqlPreviewAll: '{n} 行',
        dataSqlRowsShown: '{shown} / {n} 行を表示',
        dataSqlXlsOld: '旧形式の .xls は読めません。.xlsx か .csv で保存してください',
        dataSqlImportFail: '{name} を読み込めませんでした',
        dataSqlImportEmpty: 'このファイルにはデータがありません',
        dataSqlImportBin: 'バイナリファイルのためテキストとして読めません',
        dataSqlResizeTip: 'ドラッグで SQL 領域の高さを変更（ダブルクリックで既定に戻す）',
        dataSqlClearData: 'データをクリア',
        dataSqlClearDataTip: '左のデータを消す（SQL は残る）',
        dataSqlClearSql: 'SQL をクリア',
        dataSqlClearSqlTip: '上の SQL を消す（データは残る）',
        dataSqlCtxRunSel: '選択範囲を実行',
        dataSqlCtxRunStmt: '現在のステートメントを実行',
        dataSqlCtxSelInfo: '{lines} 行・{chars} 文字を選択中',
        dataSqlCtxSelNone: '選択なし（現在のステートメントを実行）',
        dataSqlImportData: 'データを読み込む',
        dataSqlImportDataTip: '表データを読み込む（csv / tsv / txt / xlsx）',
        dataSqlLoadSql: 'SQL を読み込む',
        dataSqlLoadSqlTip: '.sql ファイルを上のエディタに読み込む',
        dataSqlInsertColTip: 'クリックで SQL のカーソル位置に挿入',
        dataSqlBatchStatus: '{n} ステートメント · {ms} ms',
        dataSqlBatchRunning: '{i} / {n} 件目を実行中…',
        dataSqlBatchFailed: '{n} 件成功、{m} 件エラー',
        dataSqlBatchMoreErrors: '（ほか {n} 件もエラー）',
        dataSqlBatchError: '{i} 件目: {msg}',
        dataSqlBatchTab: '#{i}',
        dataSqlBatchTabFail: 'このステートメントは失敗しました（上のエラーを参照）'
    },
    ko: {
        navDataSql: 'SQL 분석',
        dataSqlTypes: '열 유형',
        dataSqlTypesTip: '각 열의 유형 확인·수정 (MySQL 기준)',
        dataSqlTypesTitle: '열 유형 (MySQL 기준)',
        dataSqlTypeInfer: '다시 추론',
        dataSqlTypeDdl: 'DDL 복사',
        dataSqlToastDdl: 'CREATE TABLE 복사됨',
        dataSqlToastType: '"{name}" 열을 {type}(으)로 변경',
        dataSqlTypeEmpty: '열이 없습니다',
        dataSqlSamples: '예시',
        dataSqlSampleOrders: '주문 내역',
        dataSqlSampleLogs: '접근 로그',
        dataSqlSamplePipe: '파이프 구분',
        dataSqlSampleNoHead: '헤더 없음',
        dataSqlSnipAll: '전체',
        dataSqlSnipGroup: '그룹 집계',
        dataSqlSnipDistinct: '중복 제거',
        dataSqlSnipTop: '상위 10행',
        dataSqlNeedRun: '변경됨 — "실행"을 누르면 결과가 갱신됩니다',
        dataSqlSource: '데이터',
        dataSqlResult: '쿼리 결과',
        dataSqlDataPlaceholder: '표 데이터를 붙여넣으세요. 한 줄에 한 건, 구분자는 자동 인식',
        dataSqlQueryPlaceholder: 'SELECT region, SUM(amount) AS total FROM t GROUP BY region ORDER BY total DESC',
        dataSqlEmpty: '데이터를 붙여넣고 위에 SQL을 작성하세요',
        dataSqlRun: '실행',
        dataSqlRunTip: '실행 (Ctrl / ⌘ + Enter)',
        dataSqlCopyTsv: '결과 복사',
        dataSqlStatus: '{n}행 · {ms} ms',
        dataSqlErrAt: '{line}행 {col}열: {msg}',
        dataSqlNoData: '데이터가 없습니다',
        dataSqlToastCopied: '{n}행을 복사했습니다',
        dataSqlToastCell: '복사됨: {v}',
        dataSqlToastEmpty: '빈 셀입니다',
        dataSqlMoreRows: '{shown} / {n}행 표시 중',
        dataSqlLoadMore: '더 보기',
        dataSqlTruncated: '결과가 상한을 넘어 앞 {n}행만 표시',
        dataSqlCancel: '취소',
        dataSqlCancelled: '취소됨',
        dataSqlRunning: '실행 중',
        dataSqlSorting: '정렬 중',
        dataSqlRunSelection: '선택 영역 실행 (Ctrl / ⌘ + Enter)',
        dataSqlCutRows: '데이터가 {n}행을 넘습니다. 앞 {n}행만 집계합니다',
        dataSqlCutChars: '텍스트가 {n}자를 넘습니다. 앞 {n}자만 읽습니다',
        dataSqlNamesTip: '헤더 행이 없으면 열 이름은 c1 / c2 … 입니다. SQL에서 그대로 쓰세요',
        dataSqlViewText: '소스',
        dataSqlViewGrid: '표',
        dataSqlViewTextTip: '원본 텍스트 편집',
        dataSqlViewGridTip: '파싱 결과를 표로 미리보기',
        dataSqlPreviewEmpty: '아직 데이터가 없습니다. 표를 붙여넣으면 미리 볼 수 있습니다',
        dataSqlPreviewMore: '앞 {shown} / {n}행 미리보기',
        dataSqlPreviewAll: '{n}행',
        dataSqlRowsShown: '{shown} / {n}행 표시',
        dataSqlXlsOld: '구형 .xls는 읽을 수 없습니다. .xlsx 또는 .csv로 저장하세요',
        dataSqlImportFail: '{name}을(를) 읽지 못했습니다',
        dataSqlImportEmpty: '이 파일에는 데이터가 없습니다',
        dataSqlImportBin: '바이너리 파일이라 텍스트를 읽을 수 없습니다',
        dataSqlResizeTip: '드래그해서 SQL 영역 높이 조절 (더블클릭하면 기본값)',
        dataSqlClearData: '데이터 지우기',
        dataSqlClearDataTip: '왼쪽 데이터를 지우고 SQL은 유지',
        dataSqlClearSql: 'SQL 지우기',
        dataSqlClearSqlTip: '위의 SQL을 지웁니다 (데이터는 유지)',
        dataSqlCtxRunSel: '선택 실행',
        dataSqlCtxRunStmt: '현재 문 실행',
        dataSqlCtxSelInfo: '{lines}행 · {chars}자 선택됨',
        dataSqlCtxSelNone: '선택 없음 — 현재 문을 실행합니다',
        dataSqlImportData: '데이터 가져오기',
        dataSqlImportDataTip: '표 데이터 가져오기 (csv / tsv / txt / xlsx)',
        dataSqlLoadSql: 'SQL 가져오기',
        dataSqlLoadSqlTip: '.sql 파일을 위 편집기에 불러오기',
        dataSqlInsertColTip: '클릭하면 SQL 커서 위치에 삽입',
        dataSqlBatchStatus: '{n}개 문 · {ms} ms',
        dataSqlBatchRunning: '{i} / {n}번째 실행 중…',
        dataSqlBatchFailed: '{n}개 성공, {m}개 오류',
        dataSqlBatchMoreErrors: '(그 외 {n}개 오류)',
        dataSqlBatchError: '{i}번째: {msg}',
        dataSqlBatchTab: '#{i}',
        dataSqlBatchTabFail: '이 구문은 실패했습니다. 위 오류를 확인하세요'
    },
    pt: {
        navDataSql: 'Consulta SQL',
        dataSqlTypes: 'Tipos de coluna',
        dataSqlTypesTip: 'Ver ou corrigir o tipo de cada coluna (estilo MySQL)',
        dataSqlTypesTitle: 'Tipos de coluna (MySQL)',
        dataSqlTypeInfer: 'Inferir de novo',
        dataSqlTypeDdl: 'Copiar DDL',
        dataSqlToastDdl: 'CREATE TABLE copiado',
        dataSqlToastType: 'Coluna "{name}" agora {type}',
        dataSqlTypeEmpty: 'Ainda não há colunas',
        dataSqlSamples: 'Exemplos',
        dataSqlSampleOrders: 'Pedidos',
        dataSqlSampleLogs: 'Registro de acesso',
        dataSqlSamplePipe: 'Separado por barra',
        dataSqlSampleNoHead: 'Sem cabeçalho',
        dataSqlSnipAll: 'Tudo',
        dataSqlSnipGroup: 'Agrupar',
        dataSqlSnipDistinct: 'Únicos',
        dataSqlSnipTop: 'Top 10',
        dataSqlNeedRun: 'Alterado — clique em Executar para atualizar o resultado',
        dataSqlSource: 'Dados',
        dataSqlResult: 'Resultado',
        dataSqlDataPlaceholder: 'Cole uma tabela, um registro por linha; o separador é detectado',
        dataSqlQueryPlaceholder: 'SELECT region, SUM(amount) AS total FROM t GROUP BY region ORDER BY total DESC',
        dataSqlEmpty: 'Cole os dados e escreva uma consulta acima',
        dataSqlRun: 'Executar',
        dataSqlRunTip: 'Executar (Ctrl / ⌘ + Enter)',
        dataSqlCopyTsv: 'Copiar resultado',
        dataSqlStatus: '{n} linhas · {ms} ms',
        dataSqlErrAt: 'Linha {line}, coluna {col}: {msg}',
        dataSqlNoData: 'Ainda não há dados',
        dataSqlToastCopied: '{n} linhas copiadas',
        dataSqlToastCell: 'Copiado: {v}',
        dataSqlToastEmpty: 'Esta célula está vazia',
        dataSqlMoreRows: 'Mostrando {shown} / {n} linhas',
        dataSqlLoadMore: 'Carregar mais',
        dataSqlTruncated: 'Resultado limitado a {n} linhas',
        dataSqlCancel: 'Cancelar',
        dataSqlCancelled: 'Cancelado',
        dataSqlRunning: 'Executando',
        dataSqlSorting: 'Ordenando',
        dataSqlRunSelection: 'Executar seleção (Ctrl / ⌘ + Enter)',
        dataSqlCutRows: 'Os dados passam de {n} linhas — só as primeiras {n} são contadas',
        dataSqlCutChars: 'O texto passa de {n} caracteres — só os primeiros {n} são lidos',
        dataSqlNamesTip: 'Sem cabeçalho: as colunas são c1 / c2 … — use direto no SQL',
        dataSqlViewText: 'Código',
        dataSqlViewGrid: 'Tabela',
        dataSqlViewTextTip: 'Editar o texto original',
        dataSqlViewGridTip: 'Pré-visualizar o resultado analisado como tabela',
        dataSqlPreviewEmpty: 'Ainda sem dados: cole uma tabela para pré-visualizar',
        dataSqlPreviewMore: 'Prévia de {shown} / {n} linhas',
        dataSqlPreviewAll: '{n} linhas',
        dataSqlRowsShown: '{shown} de {n} linhas',
        dataSqlXlsOld: 'O .xls antigo não é legível: salve como .xlsx ou .csv',
        dataSqlImportFail: 'Não foi possível ler {name}',
        dataSqlImportEmpty: 'Este arquivo não tem dados',
        dataSqlImportBin: 'É um arquivo binário: não há texto para ler',
        dataSqlResizeTip: 'Arraste para ajustar a altura da área SQL (duplo clique restaura)',
        dataSqlClearData: 'Limpar dados',
        dataSqlClearDataTip: 'Limpa os dados à esquerda e mantém o SQL',
        dataSqlClearSql: 'Limpar SQL',
        dataSqlClearSqlTip: 'Limpa o SQL acima (os dados são mantidos)',
        dataSqlCtxRunSel: 'Executar seleção',
        dataSqlCtxRunStmt: 'Executar a instrução atual',
        dataSqlCtxSelInfo: '{lines} linhas · {chars} caracteres selecionados',
        dataSqlCtxSelNone: 'Nada selecionado — executa a instrução atual',
        dataSqlImportData: 'Importar dados',
        dataSqlImportDataTip: 'Importa dados de tabela (csv / tsv / txt / xlsx)',
        dataSqlLoadSql: 'Importar SQL',
        dataSqlLoadSqlTip: 'Carrega um arquivo .sql no editor acima',
        dataSqlInsertColTip: 'Clique para inserir no cursor do SQL',
        dataSqlBatchStatus: '{n} instruções · {ms} ms',
        dataSqlBatchRunning: 'Executando a instrução {i} / {n}…',
        dataSqlBatchFailed: '{n} com sucesso, {m} com erro',
        dataSqlBatchMoreErrors: '({n} mais com erro)',
        dataSqlBatchError: 'Instrução {i}: {msg}',
        dataSqlBatchTab: '#{i}',
        dataSqlBatchTabFail: 'Esta instrução falhou — veja o erro acima'
    },
    pl: {
        navDataSql: 'Zapytanie SQL',
        dataSqlTypes: 'Typy kolumn',
        dataSqlTypesTip: 'Sprawdź lub popraw typ każdej kolumny (styl MySQL)',
        dataSqlTypesTitle: 'Typy kolumn (MySQL)',
        dataSqlTypeInfer: 'Wnioskuj ponownie',
        dataSqlTypeDdl: 'Kopiuj DDL',
        dataSqlToastDdl: 'Skopiowano CREATE TABLE',
        dataSqlToastType: 'Kolumna „{name}” ma teraz {type}',
        dataSqlTypeEmpty: 'Brak kolumn',
        dataSqlSamples: 'Przykłady',
        dataSqlSampleOrders: 'Zamówienia',
        dataSqlSampleLogs: 'Dziennik dostępu',
        dataSqlSamplePipe: 'Rozdzielone pionową kreską',
        dataSqlSampleNoHead: 'Bez nagłówka',
        dataSqlSnipAll: 'Wszystko',
        dataSqlSnipGroup: 'Grupuj',
        dataSqlSnipDistinct: 'Unikalne',
        dataSqlSnipTop: 'Pierwsze 10',
        dataSqlNeedRun: 'Zmieniono — kliknij Uruchom, aby odświeżyć wynik',
        dataSqlSource: 'Dane',
        dataSqlResult: 'Wynik',
        dataSqlDataPlaceholder: 'Wklej tabelę, jeden rekord w wierszu; separator zostanie wykryty',
        dataSqlQueryPlaceholder: 'SELECT region, SUM(amount) AS total FROM t GROUP BY region ORDER BY total DESC',
        dataSqlEmpty: 'Wklej dane i wpisz zapytanie powyżej',
        dataSqlRun: 'Uruchom',
        dataSqlRunTip: 'Uruchom (Ctrl / ⌘ + Enter)',
        dataSqlCopyTsv: 'Kopiuj wynik',
        dataSqlStatus: '{n} wierszy · {ms} ms',
        dataSqlErrAt: 'Wiersz {line}, kolumna {col}: {msg}',
        dataSqlNoData: 'Brak danych',
        dataSqlToastCopied: 'Skopiowano {n} wierszy',
        dataSqlToastCell: 'Skopiowano: {v}',
        dataSqlToastEmpty: 'Ta komórka jest pusta',
        dataSqlMoreRows: 'Pokazano {shown} / {n} wierszy',
        dataSqlLoadMore: 'Wczytaj więcej',
        dataSqlTruncated: 'Wynik ograniczony do {n} wierszy',
        dataSqlCancel: 'Anuluj',
        dataSqlCancelled: 'Anulowano',
        dataSqlRunning: 'Wykonywanie',
        dataSqlSorting: 'Sortowanie',
        dataSqlRunSelection: 'Wykonaj zaznaczenie (Ctrl / ⌘ + Enter)',
        dataSqlCutRows: 'Dane przekraczają {n} wierszy — liczone jest tylko pierwszych {n}',
        dataSqlCutChars: 'Tekst przekracza {n} znaków — czytane jest tylko pierwszych {n}',
        dataSqlNamesTip: 'Brak nagłówka: kolumny to c1 / c2 … — używaj ich w SQL bezpośrednio',
        dataSqlViewText: 'Źródło',
        dataSqlViewGrid: 'Tabela',
        dataSqlViewTextTip: 'Edytuj tekst źródłowy',
        dataSqlViewGridTip: 'Podgląd wyniku analizy jako tabeli',
        dataSqlPreviewEmpty: 'Nie ma jeszcze danych — wklej tabelę, aby zobaczyć podgląd',
        dataSqlPreviewMore: 'Podgląd {shown} / {n} wierszy',
        dataSqlPreviewAll: '{n} wierszy',
        dataSqlRowsShown: '{shown} z {n} wierszy',
        dataSqlXlsOld: 'Starego .xls nie da się odczytać — zapisz jako .xlsx lub .csv',
        dataSqlImportFail: 'Nie udało się odczytać {name}',
        dataSqlImportEmpty: 'Ten plik nie zawiera danych',
        dataSqlImportBin: 'To plik binarny — brak tekstu do odczytu',
        dataSqlResizeTip: 'Przeciągnij, aby zmienić wysokość obszaru SQL (dwuklik przywraca domyślną)',
        dataSqlClearData: 'Wyczyść dane',
        dataSqlClearDataTip: 'Czyści dane po lewej, SQL zostaje',
        dataSqlClearSql: 'Wyczyść SQL',
        dataSqlClearSqlTip: 'Czyści SQL powyżej (dane zostają)',
        dataSqlCtxRunSel: 'Wykonaj zaznaczone',
        dataSqlCtxRunStmt: 'Wykonaj bieżące polecenie',
        dataSqlCtxSelInfo: 'Zaznaczono {lines} wierszy · {chars} znaków',
        dataSqlCtxSelNone: 'Brak zaznaczenia — wykona bieżące polecenie',
        dataSqlImportData: 'Importuj dane',
        dataSqlImportDataTip: 'Importuje dane tabeli (csv / tsv / txt / xlsx)',
        dataSqlLoadSql: 'Importuj SQL',
        dataSqlLoadSqlTip: 'Wczytuje plik .sql do edytora powyżej',
        dataSqlInsertColTip: 'Kliknij, aby wstawić w miejscu kursora SQL',
        dataSqlBatchStatus: '{n} instrukcji · {ms} ms',
        dataSqlBatchRunning: 'Wykonywanie {i} / {n}…',
        dataSqlBatchFailed: '{n} udanych, {m} z błędem',
        dataSqlBatchMoreErrors: '(jeszcze {n} z błędem)',
        dataSqlBatchError: 'Instrukcja {i}: {msg}',
        dataSqlBatchTab: '#{i}',
        dataSqlBatchTabFail: 'To zapytanie nie powiodło się — zobacz błąd powyżej'
    },
    ru: {
        navDataSql: 'SQL-запрос',
        dataSqlTypes: 'Типы столбцов',
        dataSqlTypesTip: 'Посмотреть или исправить тип каждого столбца (в духе MySQL)',
        dataSqlTypesTitle: 'Типы столбцов (MySQL)',
        dataSqlTypeInfer: 'Определить заново',
        dataSqlTypeDdl: 'Копировать DDL',
        dataSqlToastDdl: 'CREATE TABLE скопирован',
        dataSqlToastType: 'Столбец «{name}» теперь {type}',
        dataSqlTypeEmpty: 'Столбцов пока нет',
        dataSqlSamples: 'Примеры',
        dataSqlSampleOrders: 'Заказы',
        dataSqlSampleLogs: 'Журнал доступа',
        dataSqlSamplePipe: 'Через вертикальную черту',
        dataSqlSampleNoHead: 'Без заголовка',
        dataSqlSnipAll: 'Всё',
        dataSqlSnipGroup: 'Группировка',
        dataSqlSnipDistinct: 'Уникальные',
        dataSqlSnipTop: 'Первые 10',
        dataSqlNeedRun: 'Изменено — нажмите «Выполнить», чтобы обновить результат',
        dataSqlSource: 'Данные',
        dataSqlResult: 'Результат',
        dataSqlDataPlaceholder: 'Вставьте таблицу, одна запись в строке; разделитель определится сам',
        dataSqlQueryPlaceholder: 'SELECT region, SUM(amount) AS total FROM t GROUP BY region ORDER BY total DESC',
        dataSqlEmpty: 'Вставьте данные и напишите запрос выше',
        dataSqlRun: 'Выполнить',
        dataSqlRunTip: 'Выполнить (Ctrl / ⌘ + Enter)',
        dataSqlCopyTsv: 'Копировать результат',
        dataSqlStatus: '{n} строк · {ms} мс',
        dataSqlErrAt: 'Строка {line}, столбец {col}: {msg}',
        dataSqlNoData: 'Данных пока нет',
        dataSqlToastCopied: 'Скопировано строк: {n}',
        dataSqlToastCell: 'Скопировано: {v}',
        dataSqlToastEmpty: 'Эта ячейка пуста',
        dataSqlMoreRows: 'Показано {shown} / {n} строк',
        dataSqlLoadMore: 'Показать ещё',
        dataSqlTruncated: 'Результат ограничен {n} строками',
        dataSqlCancel: 'Отмена',
        dataSqlCancelled: 'Отменено',
        dataSqlRunning: 'Выполняется',
        dataSqlSorting: 'Сортировка',
        dataSqlRunSelection: 'Выполнить выделенное (Ctrl / ⌘ + Enter)',
        dataSqlCutRows: 'Данных больше {n} строк — учитываются только первые {n}',
        dataSqlCutChars: 'Текст длиннее {n} символов — читаются только первые {n}',
        dataSqlNamesTip: 'Заголовка нет: столбцы называются c1 / c2 … — используйте их в SQL как есть',
        dataSqlViewText: 'Исходник',
        dataSqlViewGrid: 'Таблица',
        dataSqlViewTextTip: 'Редактировать исходный текст',
        dataSqlViewGridTip: 'Показать результат разбора таблицей',
        dataSqlPreviewEmpty: 'Данных пока нет — вставьте таблицу для предпросмотра',
        dataSqlPreviewMore: 'Предпросмотр {shown} из {n} строк',
        dataSqlPreviewAll: '{n} строк',
        dataSqlRowsShown: 'показано {shown} из {n} строк',
        dataSqlXlsOld: 'Старый .xls не читается — сохраните как .xlsx или .csv',
        dataSqlImportFail: 'Не удалось прочитать {name}',
        dataSqlImportEmpty: 'В этом файле нет данных',
        dataSqlImportBin: 'Это двоичный файл — текста нет',
        dataSqlResizeTip: 'Потяните, чтобы изменить высоту области SQL (двойной клик — сброс)',
        dataSqlClearData: 'Очистить данные',
        dataSqlClearDataTip: 'Очистить данные слева, SQL остаётся',
        dataSqlClearSql: 'Очистить SQL',
        dataSqlClearSqlTip: 'Очистить SQL выше (данные остаются)',
        dataSqlCtxRunSel: 'Выполнить выделенное',
        dataSqlCtxRunStmt: 'Выполнить текущую инструкцию',
        dataSqlCtxSelInfo: 'Выбрано {lines} строк · {chars} симв.',
        dataSqlCtxSelNone: 'Ничего не выбрано — выполнится текущая инструкция',
        dataSqlImportData: 'Импорт данных',
        dataSqlImportDataTip: 'Импорт табличных данных (csv / tsv / txt / xlsx)',
        dataSqlLoadSql: 'Импорт SQL',
        dataSqlLoadSqlTip: 'Загрузить .sql в редактор выше',
        dataSqlInsertColTip: 'Нажмите, чтобы вставить в позицию курсора SQL',
        dataSqlBatchStatus: '{n} инструкций · {ms} мс',
        dataSqlBatchRunning: 'Выполняется {i} / {n}…',
        dataSqlBatchFailed: '{n} успешно, {m} с ошибкой',
        dataSqlBatchMoreErrors: '(ещё {n} с ошибкой)',
        dataSqlBatchError: 'Инструкция {i}: {msg}',
        dataSqlBatchTab: '#{i}',
        dataSqlBatchTabFail: 'Этот запрос не выполнен — смотрите ошибку выше'
    },
    th: {
        navDataSql: 'วิเคราะห์ SQL',
        dataSqlTypes: 'ชนิดคอลัมน์',
        dataSqlTypesTip: 'ดูหรือแก้ชนิดของแต่ละคอลัมน์ (แบบ MySQL)',
        dataSqlTypesTitle: 'ชนิดคอลัมน์ (แบบ MySQL)',
        dataSqlTypeInfer: 'วิเคราะห์ใหม่',
        dataSqlTypeDdl: 'คัดลอก DDL',
        dataSqlToastDdl: 'คัดลอก CREATE TABLE แล้ว',
        dataSqlToastType: 'คอลัมน์ "{name}" เปลี่ยนเป็น {type}',
        dataSqlTypeEmpty: 'ยังไม่มีคอลัมน์',
        dataSqlSamples: 'ตัวอย่าง',
        dataSqlSampleOrders: 'รายการคำสั่งซื้อ',
        dataSqlSampleLogs: 'บันทึกการเข้าถึง',
        dataSqlSamplePipe: 'คั่นด้วยไพป์',
        dataSqlSampleNoHead: 'ไม่มีหัวตาราง',
        dataSqlSnipAll: 'ทั้งหมด',
        dataSqlSnipGroup: 'สรุปตามกลุ่ม',
        dataSqlSnipDistinct: 'ไม่ซ้ำ',
        dataSqlSnipTop: '10 แถวแรก',
        dataSqlNeedRun: 'มีการแก้ไข — กด "เรียกใช้" เพื่ออัปเดตผลลัพธ์',
        dataSqlSource: 'ข้อมูล',
        dataSqlResult: 'ผลลัพธ์',
        dataSqlDataPlaceholder: 'วางตาราง หนึ่งบรรทัดต่อหนึ่งรายการ ระบบตรวจจับตัวคั่นเอง',
        dataSqlQueryPlaceholder: 'SELECT region, SUM(amount) AS total FROM t GROUP BY region ORDER BY total DESC',
        dataSqlEmpty: 'วางข้อมูล แล้วเขียนคำสั่ง SQL ด้านบน',
        dataSqlRun: 'รัน',
        dataSqlRunTip: 'รัน (Ctrl / ⌘ + Enter)',
        dataSqlCopyTsv: 'คัดลอกผลลัพธ์',
        dataSqlStatus: '{n} แถว · {ms} ms',
        dataSqlErrAt: 'บรรทัด {line} คอลัมน์ {col}: {msg}',
        dataSqlNoData: 'ยังไม่มีข้อมูล',
        dataSqlToastCopied: 'คัดลอกแล้ว {n} แถว',
        dataSqlToastCell: 'คัดลอกแล้ว: {v}',
        dataSqlToastEmpty: 'ช่องนี้ว่าง',
        dataSqlMoreRows: 'แสดง {shown} / {n} แถว',
        dataSqlLoadMore: 'โหลดเพิ่ม',
        dataSqlTruncated: 'ผลลัพธ์จำกัดที่ {n} แถว',
        dataSqlCancel: 'ยกเลิก',
        dataSqlCancelled: 'ยกเลิกแล้ว',
        dataSqlRunning: 'กำลังทำงาน',
        dataSqlSorting: 'กำลังเรียงลำดับ',
        dataSqlRunSelection: 'ทำงานกับส่วนที่เลือก (Ctrl / ⌘ + Enter)',
        dataSqlCutRows: 'ข้อมูลเกิน {n} แถว — นับเฉพาะ {n} แถวแรก',
        dataSqlCutChars: 'ข้อความเกิน {n} ตัวอักษร — อ่านเฉพาะ {n} ตัวแรก',
        dataSqlNamesTip: 'ไม่มีแถวหัวตาราง ชื่อคอลัมน์คือ c1 / c2 … ใช้ใน SQL ได้เลย',
        dataSqlViewText: 'ซอร์ส',
        dataSqlViewGrid: 'ตาราง',
        dataSqlViewTextTip: 'แก้ไขข้อความต้นฉบับ',
        dataSqlViewGridTip: 'แสดงผลลัพธ์ที่แยกแล้วเป็นตาราง',
        dataSqlPreviewEmpty: 'ยังไม่มีข้อมูล วางตารางเพื่อดูตัวอย่าง',
        dataSqlPreviewMore: 'แสดงตัวอย่าง {shown} / {n} แถว',
        dataSqlPreviewAll: '{n} แถว',
        dataSqlRowsShown: 'แสดง {shown} / {n} แถว',
        dataSqlXlsOld: 'อ่าน .xls แบบเก่าไม่ได้ กรุณาบันทึกเป็น .xlsx หรือ .csv',
        dataSqlImportFail: 'อ่าน {name} ไม่สำเร็จ',
        dataSqlImportEmpty: 'ไฟล์นี้ไม่มีข้อมูล',
        dataSqlImportBin: 'เป็นไฟล์ไบนารี จึงอ่านเป็นข้อความไม่ได้',
        dataSqlResizeTip: 'ลากเพื่อปรับความสูงของพื้นที่ SQL (ดับเบิลคลิกเพื่อรีเซ็ต)',
        dataSqlClearData: 'ล้างข้อมูล',
        dataSqlClearDataTip: 'ล้างข้อมูลด้านซ้าย เก็บ SQL ไว้',
        dataSqlClearSql: 'ล้าง SQL',
        dataSqlClearSqlTip: 'ล้าง SQL ด้านบน (ข้อมูลยังอยู่)',
        dataSqlCtxRunSel: 'รันที่เลือก',
        dataSqlCtxRunStmt: 'รันคำสั่งปัจจุบัน',
        dataSqlCtxSelInfo: 'เลือก {lines} แถว · {chars} ตัวอักษร',
        dataSqlCtxSelNone: 'ไม่ได้เลือก — จะรันคำสั่งปัจจุบัน',
        dataSqlImportData: 'นำเข้าข้อมูล',
        dataSqlImportDataTip: 'นำเข้าข้อมูลตาราง (csv / tsv / txt / xlsx)',
        dataSqlLoadSql: 'นำเข้า SQL',
        dataSqlLoadSqlTip: 'โหลดไฟล์ .sql ขึ้นไปยังช่องแก้ไขด้านบน',
        dataSqlInsertColTip: 'คลิกเพื่อแทรกที่ตำแหน่งเคอร์เซอร์ SQL',
        dataSqlBatchStatus: '{n} คำสั่ง · {ms} ms',
        dataSqlBatchRunning: 'กำลังรันคำสั่งที่ {i} / {n}…',
        dataSqlBatchFailed: 'สำเร็จ {n} คำสั่ง ผิดพลาด {m}',
        dataSqlBatchMoreErrors: '(ผิดพลาดอีก {n} คำสั่ง)',
        dataSqlBatchError: 'คำสั่งที่ {i}: {msg}',
        dataSqlBatchTab: '#{i}',
        dataSqlBatchTabFail: 'คำสั่งนี้ล้มเหลว — ดูข้อผิดพลาดด้านบน'
    },
    tr: {
        navDataSql: 'SQL Sorgusu',
        dataSqlTypes: 'Sütun türleri',
        dataSqlTypesTip: 'Her sütunun türünü gör veya düzelt (MySQL tarzı)',
        dataSqlTypesTitle: 'Sütun türleri (MySQL)',
        dataSqlTypeInfer: 'Yeniden çıkar',
        dataSqlTypeDdl: 'DDL kopyala',
        dataSqlToastDdl: 'CREATE TABLE kopyalandı',
        dataSqlToastType: '"{name}" sütunu artık {type}',
        dataSqlTypeEmpty: 'Henüz sütun yok',
        dataSqlSamples: 'Örnekler',
        dataSqlSampleOrders: 'Siparişler',
        dataSqlSampleLogs: 'Erişim günlüğü',
        dataSqlSamplePipe: 'Dikey çizgiyle ayrılmış',
        dataSqlSampleNoHead: 'Başlıksız',
        dataSqlSnipAll: 'Tümü',
        dataSqlSnipGroup: 'Grupla',
        dataSqlSnipDistinct: 'Tekil',
        dataSqlSnipTop: 'İlk 10',
        dataSqlNeedRun: 'Değişti — sonucu güncellemek için Çalıştır',
        dataSqlSource: 'Veri',
        dataSqlResult: 'Sonuç',
        dataSqlDataPlaceholder: 'Tabloyu yapıştırın, her satır bir kayıt; ayırıcı otomatik bulunur',
        dataSqlQueryPlaceholder: 'SELECT region, SUM(amount) AS total FROM t GROUP BY region ORDER BY total DESC',
        dataSqlEmpty: 'Veriyi yapıştırın, yukarıya sorgu yazın',
        dataSqlRun: 'Çalıştır',
        dataSqlRunTip: 'Çalıştır (Ctrl / ⌘ + Enter)',
        dataSqlCopyTsv: 'Sonucu kopyala',
        dataSqlStatus: '{n} satır · {ms} ms',
        dataSqlErrAt: 'Satır {line}, sütun {col}: {msg}',
        dataSqlNoData: 'Henüz veri yok',
        dataSqlToastCopied: '{n} satır kopyalandı',
        dataSqlToastCell: 'Kopyalandı: {v}',
        dataSqlToastEmpty: 'Bu hücre boş',
        dataSqlMoreRows: '{shown} / {n} satır gösteriliyor',
        dataSqlLoadMore: 'Daha fazla',
        dataSqlTruncated: 'Sonuç {n} satırla sınırlandı',
        dataSqlCancel: 'İptal',
        dataSqlCancelled: 'İptal edildi',
        dataSqlRunning: 'Çalışıyor',
        dataSqlSorting: 'Sıralanıyor',
        dataSqlRunSelection: 'Seçimi çalıştır (Ctrl / ⌘ + Enter)',
        dataSqlCutRows: 'Veri {n} satırı aşıyor — yalnızca ilk {n} satır sayılır',
        dataSqlCutChars: 'Metin {n} karakteri aşıyor — yalnızca ilk {n} karakter okunur',
        dataSqlNamesTip: 'Başlık satırı yok: sütunlar c1 / c2 … — SQL içinde doğrudan kullanın',
        dataSqlViewText: 'Kaynak',
        dataSqlViewGrid: 'Tablo',
        dataSqlViewTextTip: 'Ham metni düzenle',
        dataSqlViewGridTip: 'Ayrıştırma sonucunu tablo olarak önizle',
        dataSqlPreviewEmpty: 'Henüz veri yok — önizlemek için bir tablo yapıştırın',
        dataSqlPreviewMore: 'İlk {shown} / {n} satır önizleniyor',
        dataSqlPreviewAll: '{n} satır',
        dataSqlRowsShown: '{shown} / {n} satır',
        dataSqlXlsOld: 'Eski .xls okunamıyor — .xlsx veya .csv olarak kaydedin',
        dataSqlImportFail: '{name} okunamadı',
        dataSqlImportEmpty: 'Bu dosyada veri yok',
        dataSqlImportBin: 'Bu ikili (binary) bir dosya — metin yok',
        dataSqlResizeTip: 'SQL alanının yüksekliğini değiştirmek için sürükleyin (çift tık = sıfırla)',
        dataSqlClearData: 'Veriyi temizle',
        dataSqlClearDataTip: 'Soldaki veriyi temizle, SQL kalsın',
        dataSqlClearSql: 'SQL\'i temizle',
        dataSqlClearSqlTip: 'Yukarıdaki SQL\'i temizle (veri kalır)',
        dataSqlCtxRunSel: 'Seçileni çalıştır',
        dataSqlCtxRunStmt: 'Geçerli ifadeyi çalıştır',
        dataSqlCtxSelInfo: '{lines} satır · {chars} karakter seçili',
        dataSqlCtxSelNone: 'Seçim yok — geçerli ifade çalışır',
        dataSqlImportData: 'Veri içe aktar',
        dataSqlImportDataTip: 'Tablo verisini içe aktar (csv / tsv / txt / xlsx)',
        dataSqlLoadSql: 'SQL içe aktar',
        dataSqlLoadSqlTip: '.sql dosyasını yukarıdaki düzenleyiciye yükle',
        dataSqlInsertColTip: 'SQL imlecine eklemek için tıklayın',
        dataSqlBatchStatus: '{n} ifade · {ms} ms',
        dataSqlBatchRunning: '{i} / {n} ifade çalışıyor…',
        dataSqlBatchFailed: '{n} başarılı, {m} hatalı',
        dataSqlBatchMoreErrors: '(ayrıca {n} hatalı)',
        dataSqlBatchError: '{i}. ifade: {msg}',
        dataSqlBatchTab: '#{i}',
        dataSqlBatchTabFail: 'Bu ifade başarısız oldu — yukarıdaki hataya bakın'
    }
};

function dataSqlT(key, fallback) {
    const table = DATASQL_I18N[currentLang] || {};
    return table[key] || (DATASQL_I18N.en || {})[key] || (DATASQL_I18N['zh-CN'] || {})[key] || fallback || key;
}

function dataSqlFmt(key, vars, fallback) {
    let text = dataSqlT(key, fallback);
    Object.keys(vars || {}).forEach((k) => {
        text = text.split('{' + k + '}').join(String(vars[k]));
    });
    return text;
}

const Sql = window.DBXSqlRun || null;
// 名字带页前缀：这个目录里的脚本共用全局词法作用域，17-stats.js 已经占了 Stats
const dataSqlStats = window.DBXStats || null;

/* ------------------------------ 示例（全部自造） ------------------------------ */

const DATASQL_SAMPLES = {
    orders: {
        text: [
            'region\tchannel\tamount\torders\tday',
            '华东\t线上\t12800\t42\t2026-10-20',
            '华东\t门店\t6400\t21\t2026-10-20',
            '华北\t线上\t9600\t31\t2026-10-21',
            '华北\t门店\t3200\t11\t2026-10-21',
            '华南\t线上\t7400\t25\t2026-10-22',
            '华南\t门店\t2600\t9\t2026-10-22',
            '西南\t线上\t5100\t18\t2026-10-23'
        ].join('\n'),
        sql: 'SELECT region, SUM(orders) AS orders, SUM(amount) AS amount\nFROM t\nGROUP BY region\nORDER BY amount DESC;'
    },
    logs: {
        text: [
            'day\tpath\tstatus\tms',
            '2026-10-20\t/api/list\t200\t38',
            '2026-10-20\t/api/list\t200\t52',
            '2026-10-20\t/api/detail\t500\t410',
            '2026-10-21\t/api/list\t200\t41',
            '2026-10-21\t/api/detail\t200\t96',
            '2026-10-21\t/api/export\t504\t1200',
            '2026-10-22\t/api/list\t304\t17',
            '2026-10-22\t/api/detail\t200\t88'
        ].join('\n'),
        sql: 'SELECT status, COUNT(*) AS n, AVG(ms) AS avg_ms, MAX(ms) AS max_ms\nFROM t\nGROUP BY status\nORDER BY n DESC;'
    },
    pipe: {
        text: [
            '20261020|A-1001|12|36|1|650|2|1',
            '20261020|A-1001|12|36|1|120|1|1',
            '20261020|A-1002|20|23|2|235|2|1',
            '20261020|A-1002|25|19|2|130|1|1',
            '20261021|A-1002|11|13|2|90|1|1',
            '20261021|A-1003|12|36|1|655|2|1',
            '20261021|A-1003|12|36|1|210|1|1',
            '20261022|A-1001|20|23|2|305|2|1'
        ].join('\n'),
        // 没有表头：列名就是 c1..cN
        sql: 'SELECT c2, SUM(c6) AS total, COUNT(*) AS n\nFROM t\nGROUP BY c2\nORDER BY total DESC;'
    },
    // 没表头的普通表格：列名自动是 c1..cN，SQL 里就写 c3 / c5
    nohead: {
        text: [
            '20261020\tA-1001\t华东\t12\t128',
            '20261020\tA-1002\t华北\t20\t96',
            '20261021\tA-1001\t华东\t11\t64',
            '20261021\tA-1003\t华南\t12\t130',
            '20261022\tA-1002\t华北\t18\t210',
            '20261022\tA-1003\t华南\t9\t58'
        ].join('\n'),
        sql: 'SELECT c3, COUNT(*) AS n, SUM(c5) AS total\nFROM t\nGROUP BY c3\nORDER BY total DESC;'
    }
};

/* ------------------------------ DOM ------------------------------ */

const dataSqlWorkspaceEl = document.getElementById('dataSqlWorkspace');
const navDataSqlLink = document.getElementById('navDataSql');
const dataSqlQueryEl = document.getElementById('dataSqlQuery');
const dataSqlInputEl = document.getElementById('dataSqlInput');
const dataSqlDelimEl = document.getElementById('dataSqlDelim');
const dataSqlHeaderEl = document.getElementById('dataSqlHeader');
const dataSqlSamplesEl = document.getElementById('dataSqlSamples');
const dataSqlTipEl = document.getElementById('dataSqlTip');
const dataSqlStatusEl = document.getElementById('dataSqlStatus');
const dataSqlErrorEl = document.getElementById('dataSqlError');
const dataSqlSourceBadge = document.getElementById('dataSqlSourceBadge');
const dataSqlRowBadge = document.getElementById('dataSqlRowBadge');
const dataSqlEmptyEl = document.getElementById('dataSqlEmpty');
const dataSqlTableEl = document.getElementById('dataSqlTable');
const dataSqlRunBtn = document.getElementById('dataSqlRun');
const dataSqlCancelBtn = document.getElementById('dataSqlCancel');
const dataSqlProgressEl = document.getElementById('dataSqlProgress');
const dataSqlProgressFill = document.getElementById('dataSqlProgressFill');
const dataSqlProgressText = document.getElementById('dataSqlProgressText');
const dataSqlNamesHint = document.getElementById('dataSqlNamesHint');
const dataSqlCopyBtn = document.getElementById('dataSqlCopy');
const dataSqlClearBtn = document.getElementById('dataSqlClear');
const dataSqlClearSqlBtn = document.getElementById('dataSqlClearSql');
const dataSqlLoadSqlBtn = document.getElementById('dataSqlLoadSql');
const dataSqlLoadInput = document.getElementById('dataSqlLoadInput');
const dataSqlCtxEl = document.getElementById('dataSqlCtx');
const dataSqlCtxHead = document.getElementById('dataSqlCtxHead');
const dataSqlBatchEl = document.getElementById('dataSqlBatch');
const dataSqlResizer = document.getElementById('dataSqlResizer');
const dataSqlViewEl = document.getElementById('dataSqlView');
const dataSqlTextWrap = document.getElementById('dataSqlTextWrap');
const dataSqlPreviewWrap = document.getElementById('dataSqlPreviewWrap');
const dataSqlPreviewNote = document.getElementById('dataSqlPreviewNote');
const dataSqlPreviewEmpty = document.getElementById('dataSqlPreviewEmpty');
const dataSqlPreviewTable = document.getElementById('dataSqlPreviewTable');

// 结果上限：再多也看不过来，而且真正的瓶颈是 DOM；分批只画已滚到的部分
const DATASQL_MAX_ROWS = 1000;
const DATASQL_BATCH = 100;
// 输入侧的两道闸（「不要盲目加载和统计」）：
//   · 文本超过 2 M 字符就不再往下解析（再大也是贴错了，解析本身就把主线程占满）
//   · 数据行超过统计库的 5 万行上限，只算前面这些（parsed.truncated），提示写在右上角
const DATASQL_MAX_CHARS = 2 * 1024 * 1024;
// 异步执行一片多少行：5 万行扫一遍 ≈ 6 ms，8000 行一片就是 1 ms 上下，
// 片间让出主线程，进度条能动、取消按钮点得动
const DATASQL_CHUNK = 8000;
// 表格预览一批画多少行、最多画到多少行（再多也看不过来，DOM 撑不住）
const DATASQL_PREVIEW_BATCH = 50;
const DATASQL_PREVIEW_MAX = 2000;
// SQL 区高度（rem）：默认值 + 上下限 + 偏好 key。拖分隔条改，双击回默认
const DATASQL_SQL_H = { def: 9.5, min: 3.5, max: 26 };
const DATASQL_SQL_H_KEY = 'datasqlSqlHeight';

let dataSqlModeActive = false;
let dataSqlQueryEditor = null;     // CodeMirror（懒创建）
let dataSqlDataEditor = null;
let dataSqlDelimiter = 'auto';
let dataSqlParsed = null;
let dataSqlParsedKey = '';
let dataSqlResult = null;
let dataSqlRendered = 0;           // 结果表已经画了多少行
let dataSqlTimer = 0;
let dataSqlAutoText = '';           // 上次程序化写进编辑器的 SQL：!= 这句就说明用户改了
let dataSqlHeaderAuto = true;       // 「首行为表头」还没被用户手动点过，就先自己判断
let dataSqlRunSeq = 0;             // 每次运行 +1：旧的一次看到序号变了就自己作废
let dataSqlRunning = false;
let dataSqlCancelFlag = false;     // 「取消」按钮按下的标记，执行器每片问一次
let dataSqlLastProgress = null;    // 切语言时按它重画进度文字
let dataSqlAutoWriting = false;    // 正在程序化写 SQL（不算用户改过）
let dataSqlViewMode = 'text';      // text = 源码，grid = 表格预览
let dataSqlHeightRestored = false; // SQL 区高度只在第一次进页时从偏好里读一次
let dataSqlErrorOffset = 0;        // 只跑其中一条语句时，错误位置要加回在主文本里的偏移
let dataSqlPreviewRows = 0;        // 预览表已经画了多少行（懒加载的游标）
let dataSqlPreviewNames = [];      // 预览的列名
let dataSqlPreviewFlags = [];      // 哪几列数字（右对齐）
let dataSqlTipLockUntil = 0;       // 刚弹过导入提示：这段时间内别让「3 × 3」摘要盖掉它
let dataSqlLastRunText = '';       // 上一次执行时编辑器里的 SQL：一样就说明没改过
let dataSqlBatch = [];             // 批量执行时每条语句的结果（[{sql, result}]）
let dataSqlBatchIndex = 0;         // 当前页签显示第几条

/* ------------------------------ 取值 ------------------------------ */

function dataSqlQueryText() {
    if (dataSqlQueryEditor) return dataSqlQueryEditor.getValue();
    return dataSqlQueryEl ? dataSqlQueryEl.value : '';
}

function dataSqlDataText() {
    if (dataSqlDataEditor) return dataSqlDataEditor.getValue();
    return dataSqlInputEl ? dataSqlInputEl.value : '';
}

function dataSqlSetQuery(text) {
    if (dataSqlQueryEditor) {
        if (dataSqlQueryEditor.getValue() !== text) dataSqlQueryEditor.setValue(text);
    } else if (dataSqlQueryEl) {
        dataSqlQueryEl.value = text;
    }
}

function dataSqlSetData(text) {
    if (dataSqlDataEditor) {
        if (dataSqlDataEditor.getValue() !== text) dataSqlDataEditor.setValue(text);
    } else if (dataSqlInputEl) {
        dataSqlInputEl.value = text;
    }
}

/* ------------------------------ 解析（带缓存） ------------------------------ */

// 只看前 24 行判断有没有表头：整段 split 一遍 2 M 的文本没必要
function dataSqlPeekHeader(text) {
    if (!Sql || typeof Sql.detectHeader !== 'function' || !dataSqlStats) return null;
    let cut = -1;
    let lines = 0;
    for (let i = 0; i < text.length; i++) {
        if (text.charCodeAt(i) !== 10) continue;
        lines++;
        if (lines >= 24) { cut = i; break; }
    }
    const head = cut > 0 ? text.slice(0, cut) : text;
    const peek = dataSqlStats.parse(head, { delimiter: dataSqlDelimiter, hasHeader: false, raw: true });
    if (!peek || !peek.rows || !peek.rows.length) return null;
    return Sql.detectHeader(peek.rows, peek.cols);
}

function dataSqlParse() {
    const text = dataSqlDataText();
    if (!text.trim() || !dataSqlStats) {
        dataSqlParsed = null;
        dataSqlParsedKey = '';
        return null;
    }
    // 第一行到底是不是表头：用户没手动点过勾选框时，按内容自己判断
    let hasHeader = !!(dataSqlHeaderEl && dataSqlHeaderEl.checked);
    if (dataSqlHeaderAuto) {
        const guess = dataSqlPeekHeader(text);
        if (guess != null && guess !== hasHeader) {
            hasHeader = guess;
            // 直接写 checked，不改就是用户的意思——.checked 赋值不会触发 change
            if (dataSqlHeaderEl) dataSqlHeaderEl.checked = guess;
        }
    }
    // 5 万行的文本不能每次都比一遍：长度 + 首尾片段足够认出一段被改过的输入
    const key = text.length + '|' + dataSqlDelimiter + '|' + hasHeader + '|'
        + text.slice(0, 48) + '|' + text.slice(-48);
    if (dataSqlParsed && dataSqlParsedKey === key) return dataSqlParsed;

    // 超长文本先截断：粘贴几 MB 进来的话，切行 + 切列这一下就够卡住宿主。
    // 截的位置退到最后一个换行，免得半行被当成一条记录（会多出一行脏数据）
    let source = text;
    let cutChars = 0;
    if (source.length > DATASQL_MAX_CHARS) {
        cutChars = text.length;
        source = source.slice(0, DATASQL_MAX_CHARS);
        const nl = source.lastIndexOf('\n');
        if (nl > 0) source = source.slice(0, nl);
    }
    // raw：SQL 要拿完整单元格算，预览才需要把长值裁到 200 字
    dataSqlParsed = dataSqlStats.parse(source, { delimiter: dataSqlDelimiter, hasHeader: hasHeader, raw: true });
    dataSqlParsed.cutChars = cutChars;
    dataSqlParsedKey = key;
    return dataSqlParsed;
}

/* ------------------------------ 运行 ------------------------------ */

// 这一列叫什么：有表头照表头；没表头就是 c1..cN（不再按内容猜 day / amount 那种名字，
// 猜出来的名字没规律，用户还得多记一套。c1..cN 同时也是引擎里的永久别名）
function dataSqlColumnNames(parsed) {
    if (!parsed || !parsed.cols) return [];
    if (Sql && typeof Sql.suggestColumnNames === 'function') {
        return Sql.suggestColumnNames({ header: parsed.header, rows: parsed.rows, cols: parsed.cols });
    }
    if (parsed.header && parsed.header.length) return parsed.header.slice();
    return Array.from({ length: parsed.cols }, (_, i) => 'c' + (i + 1));
}

// 无表头时把列名摆在工具栏上（现在就是 c1..cN，顺带把表名 t 说明白）
function dataSqlRenderNames(parsed, names) {
    if (!dataSqlNamesHint) return;
    const headerless = !(parsed && parsed.header && parsed.header.length);
    if (!headerless || !names || !names.length) {
        dataSqlNamesHint.hidden = true;
        dataSqlNamesHint.textContent = '';
        return;
    }
    const shown = names.slice(0, 8).join(' / ') + (names.length > 8 ? ' …' : '');
    dataSqlNamesHint.textContent = 't · ' + shown;
    dataSqlNamesHint.title = dataSqlT('dataSqlNamesTip', '没有表头，列名就是 c1 / c2 …，SQL 里直接用');
    dataSqlNamesHint.hidden = false;
}

/* ------------------------------ 数据表格预览 ------------------------------ */
/*
 * 「源码 / 表格」两种看法：
 *   · 源码  → CodeMirror 里改原始文本
 *   · 表格  → 按解析结果铺成表（前 100 行），一眼看出分隔符认错没、表头吃对没
 * 导入、粘贴、点示例之后自动切到表格；自己敲字改文本时不打断（停在源码）。
 */
function dataSqlSetView(mode) {
    const next = mode === 'grid' ? 'grid' : 'text';
    dataSqlViewMode = next;
    if (dataSqlViewEl) {
        dataSqlViewEl.querySelectorAll('.compare-tab').forEach((tab) => {
            const on = tab.dataset.view === next;
            tab.classList.toggle('active', on);
            tab.setAttribute('aria-selected', on ? 'true' : 'false');
        });
    }
    if (dataSqlTextWrap) dataSqlTextWrap.hidden = next !== 'text';
    if (dataSqlPreviewWrap) dataSqlPreviewWrap.hidden = next !== 'grid';
    if (next === 'text') {
        // 隐着的时候 CodeMirror 量到的宽度是 0，回到源码要重新量一次
        requestAnimationFrame(() => {
            if (dataSqlDataEditor) dataSqlDataEditor.refresh();
        });
    } else {
        dataSqlRenderPreview(dataSqlParsed, dataSqlColumnNames(dataSqlParsed));
    }
}

// 预览表头 + 清空已画的行：数据变了就整张重来
function dataSqlRenderPreview(parsed, names) {
    if (!dataSqlPreviewTable) return;
    const rows = parsed && parsed.rows ? parsed.rows : [];
    if (!rows.length || !parsed.cols) {
        dataSqlPreviewTable.hidden = true;
        dataSqlPreviewTable.innerHTML = '';
        dataSqlPreviewRows = 0;
        if (dataSqlPreviewNote) {
            dataSqlPreviewNote.hidden = true;
            dataSqlPreviewNote.textContent = '';
        }
        if (dataSqlPreviewEmpty) dataSqlPreviewEmpty.hidden = false;
        return;
    }
    const cols = parsed.cols;
    const list = names && names.length ? names : Array.from({ length: cols }, (_, i) => 'c' + (i + 1));
    dataSqlPreviewNames = list;
    // 数字列右对齐：借结果表那套判断（先看列类型，认不出按值猜）
    dataSqlPreviewFlags = dataSqlNumericCols({ columns: list, rows: rows.slice(0, 50) });
    let html = '<thead><tr>';
    const insertTip = dataSqlT('dataSqlInsertColTip', '');
    for (let c = 0; c < cols; c++) {
        const name = list[c] == null ? 'c' + (c + 1) : String(list[c]);
        // 表头可点：把列名插到 SQL 光标处（写中文列名很费手，点一下更省事）
        html += '<th class="datasql-preview-th' + (dataSqlPreviewFlags[c] ? ' is-num' : '') + '"'
            + ' data-col="' + dataSqlEsc(name) + '" data-keep-title'
            + ' title="' + dataSqlEsc(insertTip ? name + ' · ' + insertTip : name) + '">'
            + dataSqlEsc(name) + '</th>';
    }
    html += '</tr></thead><tbody></tbody>';
    dataSqlPreviewTable.innerHTML = html;
    dataSqlPreviewTable.hidden = false;
    dataSqlPreviewRows = 0;
    if (dataSqlPreviewEmpty) dataSqlPreviewEmpty.hidden = true;
    if (dataSqlPreviewNote) dataSqlPreviewNote.hidden = false;
    // 重画后回到顶部：sticky 表头 + 残留的 scrollTop 会让第一行顶进表头里
    if (dataSqlPreviewScroll) dataSqlPreviewScroll.scrollTop = 0;
    dataSqlAppendPreview(DATASQL_PREVIEW_BATCH);
}

// 一批一批往预览里加：滚到底继续加，跟结果表一个手感
function dataSqlAppendPreview(batch) {
    const parsed = dataSqlParsed;
    if (!parsed || !dataSqlPreviewTable) return;
    const tbody = dataSqlPreviewTable.querySelector('tbody');
    if (!tbody) return;
    const rows = parsed.rows || [];
    const cols = parsed.cols || 0;
    const total = Math.min(rows.length, DATASQL_PREVIEW_MAX);
    const start = dataSqlPreviewRows;
    const end = Math.min(total, start + (batch || DATASQL_PREVIEW_BATCH));
    if (end <= start) return;

    let html = '';
    for (let r = start; r < end; r++) {
        const row = rows[r] || [];
        html += '<tr>';
        for (let c = 0; c < cols; c++) {
            const raw = row[c];
            const text = raw == null ? '' : String(raw);
            html += '<td' + (dataSqlPreviewFlags[c] ? ' class="is-num"' : '')
                + ' data-copy="' + dataSqlEsc(text) + '" title="' + dataSqlEsc(text) + '">'
                + (text === '' ? '<span class="datasql-null">—</span>' : dataSqlEsc(text))
                + '</td>';
        }
        html += '</tr>';
    }
    // 上一批留下的「加载更多」行先摘掉
    const more = tbody.querySelector('.stats-more');
    if (more) more.remove();
    tbody.insertAdjacentHTML('beforeend', html);
    dataSqlPreviewRows = end;

    if (end < total) {
        tbody.insertAdjacentHTML('beforeend',
            '<tr class="stats-more"><td colspan="' + Math.max(1, cols) + '">'
            + '<span class="stats-more-inner"><span>' + dataSqlEsc(
                dataSqlFmt('dataSqlMoreRows', { shown: end, n: total }, '')) + '</span>'
            + '<button type="button" class="stats-more-btn" data-datasql-pmore="1">'
            + dataSqlEsc(dataSqlT('dataSqlLoadMore', 'Load more')) + '</button></span></td></tr>');
    }
    if (dataSqlPreviewNote) {
        const all = parsed.totalRows || rows.length;
        const count = all > end
            ? dataSqlFmt('dataSqlPreviewMore', { shown: end, n: all }, '')
            : dataSqlFmt('dataSqlPreviewAll', { n: all }, '');
        // 顺带说一句表头能点：不然「点表头插列名」这个动作没人会发现
        const tip = dataSqlT('dataSqlInsertColTip', '');
        dataSqlPreviewNote.textContent = tip ? count + ' · ' + tip : count;
    }
}

// 粘贴 / 改数据 / 导入之后，SQL 还是「没动过」的状态就顺手生成一句能跑的
function dataSqlApplyAutoQuery(parsed) {
    if (!Sql || typeof Sql.suggestQuery !== 'function') return;
    const names = dataSqlColumnNames(parsed);
    // 数据正好是内置示例：用它自带的推荐语句（比按列类型猜的那句更贴题）。
    // 点示例时并不写进去，只有用户自己按「运行」且框里是空的，才在这里生成
    let query = '';
    const dataText = dataSqlDataText();
    Object.keys(DATASQL_SAMPLES).forEach((k) => {
        const sample = DATASQL_SAMPLES[k];
        if (!query && sample.sql && sample.text === dataText) query = sample.sql;
    });
    if (!query) {
        query = String(Sql.suggestQuery(
            { header: names, rows: parsed.rows, cols: parsed.cols },
            { headerless: !(parsed.header && parsed.header.length) }
        ) || '').trim();
    }
    query = String(query || '').trim();
    // 末尾补分号：和快捷语句一致，多条语句拼在一起时也有明确边界
    if (query && query.slice(-1) !== ';') query += ';';
    if (!query || query === dataSqlQueryText().trim()) return;
    dataSqlAutoWriting = true;
    try {
        dataSqlSetQuery(query);
    } finally {
        dataSqlAutoWriting = false;
    }
    dataSqlAutoText = query.trim();
}

function dataSqlSchedule() {
    clearTimeout(dataSqlTimer);
    // 不自动执行：停手 220 ms 后只把列名 / 类型 / 预览刷一遍，
    // 状态栏提一句「点运行」。跑不跑由人决定，别一边打字一边把结果抽走
    dataSqlTimer = setTimeout(() => {
        const parsed = dataSqlRefresh();
        if (!parsed || !parsed.parsed || !parsed.parsed.rows.length) return;
        const text = dataSqlQueryText().trim();
        // 清空 SQL 之后框里是空的，别再提「改过了，点运行」——没语句可跑
        if (!text) return;
        // 刚跑过、SQL 一个字没动：状态栏留着「4 行 · 16 ms」，别改成「改过了」
        if (text === dataSqlLastRunText) return;
        if (dataSqlStatusEl && !dataSqlRunning) {
            dataSqlStatusEl.textContent = dataSqlT('dataSqlNeedRun', '');
        }
    }, 220);
}

// 选中执行：编辑器里有选区就只跑那一段，没有就整段跑。
// CodeMirror 的 getSelection() 多光标时用换行拼起来，正好也是合法 SQL 片段串
function dataSqlSelectedSql() {
    if (dataSqlQueryEditor && typeof dataSqlQueryEditor.getSelection === 'function') {
        const picked = String(dataSqlQueryEditor.getSelection() || '').trim();
        if (picked) return picked;
    }
    if (dataSqlQueryEl && typeof dataSqlQueryEl.selectionStart === 'number') {
        const a = dataSqlQueryEl.selectionStart;
        const b = dataSqlQueryEl.selectionEnd;
        if (b > a) return String(dataSqlQueryEl.value.slice(a, b) || '').trim();
    }
    return '';
}

/*
 * 按分号把编辑器里的 SQL 切成几条（跳过字符串 / 注释里的分号），
 * 然后取「光标所在的那条」——一个框里写着几条语句时，不用先选中就能跑手上这条。
 */
function dataSqlSplitStatements(text) {
    const parts = [];
    let start = 0;
    let quote = '';
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (quote) {
            if (ch === quote) {
                if (text[i + 1] === quote) { i++; continue; }   // '' 转义
                quote = '';
            }
            continue;
        }
        if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
        if (ch === '-' && text[i + 1] === '-') {
            const nl = text.indexOf('\n', i);
            i = nl < 0 ? text.length : nl;
            continue;
        }
        if (ch === '/' && text[i + 1] === '*') {
            const close = text.indexOf('*/', i + 2);
            i = close < 0 ? text.length : close + 1;
            continue;
        }
        if (ch === ';' || ch === '\uFF1B') {
            parts.push({ start, end: i, text: text.slice(start, i) });
            start = i + 1;
        }
    }
    parts.push({ start, end: text.length, text: text.slice(start) });
    return parts;
}

function dataSqlStatementAtCursor() {
    const cm = dataSqlQueryEditor;
    if (!cm || typeof cm.indexFromPos !== 'function') return null;
    const text = cm.getValue();
    if (!text.trim()) return null;
    const parts = dataSqlSplitStatements(text);
    if (parts.length < 2) return null;   // 只有一条，交给上层用全文
    const at = cm.indexFromPos(cm.getCursor());
    let hit = -1;
    for (let i = 0; i < parts.length; i++) {
        // 分号本身算前一条的尾巴，光标停在分号后面就是下一条了
        if (at >= parts[i].start && at <= parts[i].end + (i < parts.length - 1 ? 1 : 0)) { hit = i; break; }
    }
    if (hit < 0) hit = parts.length - 1;
    // 光标落在空白段（比如最后那个分号后面）就往前找第一条有内容的
    for (let i = hit; i >= 0; i--) {
        if (parts[i].text.trim()) {
            const lead = parts[i].text.length - parts[i].text.trimStart().length;
            return { text: parts[i].text, offset: parts[i].start + lead };
        }
    }
    return null;
}

// 有选区时按钮的提示换成「执行所选」，让人知道只会跑选中的那一段
function dataSqlSyncRunLabel() {
    if (!dataSqlRunBtn) return;
    const key = dataSqlSelectedSql() ? 'dataSqlRunSelection' : 'dataSqlRunTip';
    if (dataSqlRunBtn.getAttribute('data-i18n-title') === key) return;
    dataSqlRunBtn.setAttribute('data-i18n-title', key);
    dataSqlRunBtn.title = dataSqlT(key, key === 'dataSqlRunSelection' ? 'Run selection' : 'Run');
}

function dataSqlSetRunning(running) {
    dataSqlRunning = running;
    if (dataSqlRunBtn) dataSqlRunBtn.disabled = running;
    if (dataSqlCancelBtn) {
        dataSqlCancelBtn.hidden = !running;
        if (!running) dataSqlCancelBtn.disabled = false;
    }
    if (dataSqlProgressEl) dataSqlProgressEl.hidden = !running;
    if (!running && dataSqlProgressFill) dataSqlProgressFill.style.width = '0%';
}

function dataSqlShowProgress(p) {
    dataSqlLastProgress = p;
    const pct = Math.max(0, Math.min(100, Math.round((p.ratio || 0) * 100)));
    if (dataSqlProgressFill) dataSqlProgressFill.style.width = pct + '%';
    if (!dataSqlProgressText) return;
    const counts = p.done != null && p.total ? p.done + ' / ' + p.total + ' · ' + pct + '%' : pct + '%';
    // 排序那一步没有「多少行」可数（Array#sort 是原子的），只报阶段；
    // 跑完（done）也不再写「运行中」，但进度条留着——执行过程要看得见，不是跑完就没
    dataSqlProgressText.textContent = p.phase === 'cancelled'
        ? dataSqlT('dataSqlCancelled', 'Cancelled')
        : p.phase === 'sort'
            ? dataSqlT('dataSqlSorting', 'Sorting') + ' · ' + pct + '%'
            : p.phase === 'done'
                ? counts
                : dataSqlT('dataSqlRunning', 'Running') + ' ' + counts;
}

// 取消：只置标记，执行器在下一片边界自己停（不打断当前这一片，避免半路抛异常）
function dataSqlCancel() {
    if (!dataSqlRunning) return;
    dataSqlCancelFlag = true;
    if (dataSqlCancelBtn) dataSqlCancelBtn.disabled = true;
    if (dataSqlProgressText) dataSqlProgressText.textContent = dataSqlT('dataSqlCancelled', 'Cancelled');
}

// 解析数据 + 刷列名 / 类型 / 预览：改数据、改分隔符、键入 SQL 都走这里，但不执行查询
function dataSqlRefresh() {
    const parsed = dataSqlParse();
    const names = dataSqlColumnNames(parsed);
    if (dataSqlSourceBadge) {
        dataSqlSourceBadge.textContent = parsed ? (parsed.totalRows + ' × ' + parsed.cols) : '0 × 0';
    }
    dataSqlRenderNames(parsed, names);
    // 类型跟着表头走：改数据 / 改 SQL 都不重推断
    dataSqlSyncTypes(parsed, names);
    dataSqlRenderTip(parsed);
    // 数据面板的表格预览跟着解析结果走（源码视图下也照画，切过去就是最新的）
    dataSqlRenderPreview(parsed, names);
    if (!parsed || !parsed.rows.length) {
        dataSqlResult = null;
        dataSqlRendered = 0;
        dataSqlHideError();
        dataSqlRenderEmpty();
        if (dataSqlStatusEl) dataSqlStatusEl.textContent = '';
        if (dataSqlRowBadge) dataSqlRowBadge.textContent = '';
    }
    return { parsed: parsed, names: names };
}

// 数据 / SQL 换了之后，屏幕上那张旧结果就跟不上了：收掉，别让人对着它读
function dataSqlInvalidateResult() {
    dataSqlResult = null;
    dataSqlRendered = 0;
    dataSqlBatch = [];
    dataSqlBatchIndex = 0;
    if (dataSqlBatchEl) {
        dataSqlBatchEl.hidden = true;
        dataSqlBatchEl.innerHTML = '';
    }
    dataSqlRenderEmpty();
    dataSqlEmptyHint('');
    if (dataSqlRowBadge) dataSqlRowBadge.textContent = '';
}

/*
 * 数据或解析条件变了：只重画，绝不执行。
 * 「任何情况下不要自动执行 SQL」——跑不跑由人点「运行」/ Ctrl+Enter / 右键菜单。
 * 顺手把旧结果收掉：列都变了还挂着上一张表，比空白更容易误读。
 */
function dataSqlDataChanged() {
    const refreshed = dataSqlRefresh();
    dataSqlInvalidateResult();
    const hasRows = !!(refreshed && refreshed.parsed && refreshed.parsed.rows.length);
    if (dataSqlStatusEl) {
        dataSqlStatusEl.textContent = hasRows ? dataSqlT('dataSqlNeedRun', '') : '';
    }
    return refreshed;
}

/*
 * options（都可省）：
 *   sql             直接指定要跑的那段文本（右键菜单「执行所选」用：菜单一关，
 *                   选区可能已经被点没了，不能再靠 getSelection 现取）
 *   at              这段文本在编辑器里的起点（报错位置换算用）
 *   ignoreSelection 忽略选区
 *   statement       只跑光标所在的那一条（右键菜单「执行当前语句」）
 */
async function dataSqlRun(options) {
    const opts = options || {};
    clearTimeout(dataSqlTimer);
    // 一进来就领号：之前还在跑的那次随即作废，免得旧结果盖到新输入上。
    // 早退的几条路径都在 await 之前，号还没被别人接走，顺手把「运行中」收掉
    const seq = ++dataSqlRunSeq;
    dataSqlCancelFlag = false;
    if (!Sql) {
        dataSqlSetRunning(false);
        dataSqlShowError('SQL 引擎没有加载（js/sqlrun.js）', -1);
        return;
    }
    const refreshed = dataSqlRefresh();
    const parsed = refreshed.parsed;
    const names = refreshed.names;
    if (!parsed || !parsed.rows.length) {
        dataSqlSetRunning(false);
        return;
    }

    // 数据刚粘贴 / 改过 / 导入过，而 SQL 还是自动生成的那一版（或压根是空的）：重新生成一句。
    // 判断依据是文本本身——用户动手改过一个字就不再覆盖
    const currentSql = dataSqlQueryText().trim();
    if (!currentSql || currentSql === dataSqlAutoText.trim()) {
        dataSqlApplyAutoQuery(parsed);
    }

    /*
     * 跑哪一段，按这个优先级：
     *   1. 右键菜单直接指定的那段（dataSqlRun 的入参）
     *   2. 有选区 → 只跑选中
     *   3. 右键「执行当前语句」→ 光标所在那条
     *   4. 其余情况 → 整个框。多语句时下面会拆成批量逐条跑，
     *      所以「点运行」永远是「把我写的都跑一遍」，不会偷偷只跑一条
     * 报错位置要能换算回编辑器：选区 / 语句的起点都算「偏移」
     */
    let baseOffset = typeof opts.at === 'number' ? opts.at : 0;
    let sql = typeof opts.sql === 'string' ? opts.sql.trim() : '';
    if (!sql && !opts.ignoreSelection) {
        sql = dataSqlSelectedSql();
        if (sql && dataSqlQueryEditor && typeof dataSqlQueryEditor.indexFromPos === 'function') {
            baseOffset = dataSqlQueryEditor.indexFromPos(dataSqlQueryEditor.getCursor(true));
        }
    }
    if (!sql && opts.statement) {
        const stmt = dataSqlStatementAtCursor();
        if (stmt) {
            sql = stmt.text;
            baseOffset = stmt.offset;
        }
    }
    if (!sql) sql = dataSqlQueryText();
    const lead = sql.length - sql.trimStart().length;
    dataSqlErrorOffset = baseOffset + lead;
    sql = sql.trim();
    if (!sql) {
        dataSqlSetRunning(false);
        dataSqlResult = null;
        dataSqlRenderEmpty();
        dataSqlShowError(dataSqlT('dataSqlEmpty', '写一句 SQL'), -1);
        return;
    }

    dataSqlHideError();
    dataSqlSetRunning(true);
    if (dataSqlStatusEl) dataSqlStatusEl.textContent = '';
    // 记住「执行时编辑器里是什么」：跑完之后从输入触发的 refresh 不该再喊「改过了」
    dataSqlLastRunText = dataSqlQueryText().trim();

    const table = { header: names, rows: parsed.rows, cols: parsed.cols };

    // 一个框里写好几句（用 ; 隔开）：逐条跑，结果各留一份，用页签分开看
    const stmts = dataSqlSplitStatements(sql)
        .map((s) => ({ text: String(s.text || '').trim(), offset: s.offset || 0 }))
        .filter((s) => s.text);
    if (stmts.length > 1) {
        await dataSqlRunBatch(stmts, seq, table);
        return;
    }

    let result;
    try {
        result = await Sql.queryAsync(sql, table, {
            maxRows: DATASQL_MAX_ROWS,
            chunk: DATASQL_CHUNK,
            onProgress: (p) => {
                if (seq === dataSqlRunSeq) dataSqlShowProgress(p);
            },
            // 点了取消、或者已经被更新的一次运行顶掉，都在片边界停下
            isCancelled: () => dataSqlCancelFlag || seq !== dataSqlRunSeq
        });
    } catch (err) {
        result = { error: String((err && err.message) || err) };
    }
    if (seq !== dataSqlRunSeq) return;   // 被新的一次运行接管了，界面留给它
    dataSqlSetRunning(false);

    if (result && result.cancelled) {
        // 取消时保留上一次的结果（不是清屏），进度条也留着写明「已取消」
        if (dataSqlProgressEl) dataSqlProgressEl.hidden = false;
        if (dataSqlProgressText) dataSqlProgressText.textContent = dataSqlT('dataSqlCancelled', 'Cancelled');
        if (dataSqlStatusEl) dataSqlStatusEl.textContent = dataSqlT('dataSqlCancelled', 'Cancelled');
        return;
    }
    if (!result || result.error) {
        dataSqlResult = null;
        dataSqlRendered = 0;
        dataSqlRenderEmpty();
        dataSqlShowError(result ? result.error : '执行失败', result && result.errorAt != null ? result.errorAt : -1);
        if (dataSqlStatusEl) dataSqlStatusEl.textContent = '';
        if (dataSqlRowBadge) dataSqlRowBadge.textContent = '';
        return;
    }

    dataSqlHideError();
    dataSqlResult = result;
    dataSqlRendered = 0;
    // 只跑了一条：把上一次批量留下的页签收掉，免得点开是旧语句的结果
    dataSqlBatch = [];
    dataSqlBatchIndex = 0;
    if (dataSqlBatchEl) {
        dataSqlBatchEl.hidden = true;
        dataSqlBatchEl.innerHTML = '';
    }
    dataSqlRenderResult();
    dataSqlUpdateStatus(result);
    // 跑完了也把过程留着：进度条停在 100%，旁边写着扫了多少行
    dataSqlFinishProgress();
}

/* ------------------------------ 批量执行（一个框里好几条） ------------------------------ */
/*
 * 逐条顺序跑，每条结果各留一份，页签点哪条看哪条。
 * 一条失败不影响其它：记下错误接着跑下一条——批量跑脚本时最怕「第三条写错了，
 * 后面五条全没跑」，还得手动一条条挑出来重跑。
 * 失败的页签标成红色，点开能看到那条的报错；底部提示条给第一条错误，并说明还有几条。
 * 进度按「第 i / n 条」走，取消按钮照旧有效（每片的 isCancelled 会被问到）。
 */
async function dataSqlRunBatch(stmts, seq, table) {
    const started = Date.now();
    const items = stmts.map((s) => ({ sql: s.text, offset: s.offset || 0, result: null, error: null }));
    let cancelled = false;

    for (let i = 0; i < items.length; i++) {
        if (seq !== dataSqlRunSeq) return;
        if (dataSqlStatusEl) {
            dataSqlStatusEl.textContent = dataSqlFmt('dataSqlBatchRunning', { i: i + 1, n: items.length }, '');
        }
        let result = null;
        try {
            result = await Sql.queryAsync(items[i].sql, table, {
                maxRows: DATASQL_MAX_ROWS,
                chunk: DATASQL_CHUNK,
                onProgress: (p) => {
                    if (seq === dataSqlRunSeq) dataSqlShowProgress(p);
                },
                isCancelled: () => dataSqlCancelFlag || seq !== dataSqlRunSeq
            });
        } catch (err) {
            result = { error: String((err && err.message) || err), errorAt: -1 };
        }
        if (seq !== dataSqlRunSeq) return;
        if (result && result.cancelled) {
            cancelled = true;
            break;
        }
        if (!result || result.error) {
            items[i].error = {
                msg: (result && result.error) || '执行失败',
                at: (result && result.errorAt != null ? result.errorAt : -1) + (items[i].offset || 0)
            };
            continue;                       // 记下来接着跑下一条
        }
        items[i].result = result;
    }

    dataSqlSetRunning(false);
    if (seq !== dataSqlRunSeq) return;

    const ms = Math.max(1, Math.round(Date.now() - started));
    const okIdx = [];
    items.forEach((it, i) => { if (it.result) okIdx.push(i); });
    const bad = items.filter((it) => it.error);

    dataSqlBatch = items;
    // 默认停在最后一条成功的（脚本通常最后那句才是想看的结果）
    dataSqlBatchIndex = okIdx.length ? okIdx[okIdx.length - 1] : 0;
    dataSqlRenderBatchTabs();
    dataSqlSelectBatch(dataSqlBatchIndex, true);
    if (okIdx.length) dataSqlFinishProgress();

    if (dataSqlStatusEl) {
        dataSqlStatusEl.textContent = cancelled
            ? dataSqlT('dataSqlCancelled', 'Cancelled')
            : bad.length
                ? dataSqlFmt('dataSqlBatchFailed', { n: okIdx.length, m: bad.length }, '')
                : dataSqlFmt('dataSqlBatchStatus', { n: items.length, ms: ms }, '');
    }
}

// 页签：第几条语句；失败的标出来，点一下看它的结果（或报错）
function dataSqlRenderBatchTabs() {
    if (!dataSqlBatchEl) return;
    if (dataSqlBatch.length < 2) {
        dataSqlBatchEl.hidden = true;
        dataSqlBatchEl.innerHTML = '';
        return;
    }
    let html = '';
    dataSqlBatch.forEach((item, i) => {
        const on = i === dataSqlBatchIndex;
        const oneLine = String(item.sql || '').replace(/\s+/g, ' ').trim();
        const label = dataSqlFmt('dataSqlBatchTab', { i: i + 1 }, '#' + (i + 1));
        html += '<button type="button" class="datasql-batch-tab' + (on ? ' active' : '')
            + (item.error ? ' is-error' : '') + '"'
            + ' data-batch="' + i + '" data-keep-title title="' + dataSqlEsc(oneLine.slice(0, 120)) + '">'
            + dataSqlEsc(label) + '</button>';
    });
    dataSqlBatchEl.innerHTML = html;
    dataSqlBatchEl.hidden = false;
}

// 提示条内容：优先当前这条的错，否则整批里的第一条错；还有几条就一起说出来
function dataSqlBatchErrorInfo() {
    const bad = dataSqlBatch.filter((it) => it.error);
    if (!bad.length) return null;
    const sel = dataSqlBatch[dataSqlBatchIndex];
    const target = sel && sel.error ? sel : bad[0];
    const idx = dataSqlBatch.indexOf(target);
    let text = dataSqlFmt('dataSqlBatchError', { i: idx + 1, msg: target.error.msg }, target.error.msg);
    if (bad.length > 1) text += ' ' + dataSqlFmt('dataSqlBatchMoreErrors', { n: bad.length - 1 }, '');
    return { text: text, at: target.error.at };
}

/*
 * 只改选中态。
 * 切页签时整块重画 innerHTML 会把手上那个按钮变成游离节点——连点两次第二条时，
 * 第二次的点击落在已经不在树上的旧节点上，什么都不发生（看着像「点不动」），
 * 焦点也一起丢了。所以选中态只切 class。
 */
function dataSqlSyncBatchTabs() {
    if (!dataSqlBatchEl) return;
    const tabs = dataSqlBatchEl.querySelectorAll('.datasql-batch-tab');
    for (let i = 0; i < tabs.length; i++) {
        tabs[i].classList.toggle('active', i === dataSqlBatchIndex);
    }
}

/*
 * 空态那句话分两种：没跑过是「贴数据写 SQL」，这一条报错时不能还这么说——
 * 照着「写一句 SQL」去写，人会以为自己根本没写。
 * 直接改 textContent 会跟 applyI18n 打架（元素上有 data-i18n 会被重置），所以先摘掉属性。
 */
function dataSqlEmptyHint(kind) {
    if (!dataSqlEmptyEl) return;
    if (kind === 'error') {
        dataSqlEmptyEl.removeAttribute('data-i18n');
        dataSqlEmptyEl.textContent = dataSqlT('dataSqlBatchTabFail', 'This statement failed — see the error above');
        return;
    }
    if (dataSqlEmptyEl.getAttribute('data-i18n') !== 'dataSqlEmpty') {
        dataSqlEmptyEl.setAttribute('data-i18n', 'dataSqlEmpty');
        dataSqlEmptyEl.textContent = dataSqlT('dataSqlEmpty', 'Paste a table, write a SQL query');
    }
}

/*
 * 切到某一条：成功的摆结果，失败的把表换成空态并报错。
 * quiet = 批量刚跑完那一下，状态栏留给整批统计，别覆盖成单条的「N 行 · ms」
 */
function dataSqlSelectBatch(index, quiet) {
    const item = dataSqlBatch[index];
    if (!item) return;
    dataSqlBatchIndex = index;
    dataSqlSyncBatchTabs();

    if (item.error || !item.result) {
        dataSqlResult = null;
        dataSqlRendered = 0;
        dataSqlRenderEmpty();
        dataSqlEmptyHint('error');
        if (dataSqlRowBadge) {
            dataSqlRowBadge.textContent = '';
            dataSqlRowBadge.title = '';
        }
    } else {
        dataSqlResult = item.result;
        dataSqlRendered = 0;
        dataSqlRenderResult();
        dataSqlEmptyHint('');
        dataSqlUpdateBadge(item.result);
    }

    const info = dataSqlBatchErrorInfo();
    if (info) dataSqlShowError(info.text, info.at);
    else dataSqlHideError();

    if (!quiet && dataSqlStatusEl) dataSqlStatusEl.textContent = '';
}

/*
 * 收尾：先把进度条亮到 100%（证明真跑完了，不是半路卡住），
 * 过一会儿自己收起来——一直顶着一条满格的青线，「运行」旁边永远多一坨装饰。
 */
let dataSqlProgressHideTimer = 0;
function dataSqlFinishProgress() {
    if (!dataSqlProgressEl) return;
    const last = dataSqlLastProgress || {};
    dataSqlProgressEl.hidden = false;
    dataSqlShowProgress({
        phase: 'done',
        ratio: 1,
        done: last.total ? last.total : (last.done || 0),
        total: last.total || 0
    });
    clearTimeout(dataSqlProgressHideTimer);
    dataSqlProgressHideTimer = setTimeout(() => {
        if (dataSqlRunning) return;
        if (dataSqlProgressEl) dataSqlProgressEl.hidden = true;
    }, 900);
}

// 右上角那行小字：正常是「行 × 列」，被截断时说清是被哪道上限拦的
function dataSqlRenderTip(parsed) {
    if (!dataSqlTipEl) return;
    // 刚弹过「已导入 xxx」这类消息：别立刻被「3 × 3」这种摘要盖掉，
    // 那条消息说完就没了，摘要右上角的数据徽标里一直都有
    if (typeof dataSqlTipLockUntil === 'number' && Date.now() < dataSqlTipLockUntil) return;
    if (!parsed) {
        dataSqlTipEl.textContent = '';
        return;
    }
    if (parsed.cutChars) {
        dataSqlTipEl.textContent = dataSqlFmt('dataSqlCutChars',
            { n: Math.round(DATASQL_MAX_CHARS / 1024 / 1024) + ' M' }, '');
    } else if (parsed.truncated) {
        dataSqlTipEl.textContent = dataSqlFmt('dataSqlCutRows', { n: parsed.totalRows }, '');
    } else {
        dataSqlTipEl.textContent = parsed.totalRows + ' × ' + parsed.cols;
    }
}

function dataSqlShowError(msg, at) {
    if (!dataSqlErrorEl) return;
    let text = String(msg || '');
    if (at >= 0 && Sql && Sql.lineCol) {
        const lc = Sql.lineCol(dataSqlQueryText(), at + (dataSqlErrorOffset || 0));
        text = dataSqlFmt('dataSqlErrAt', { line: lc.line, col: lc.col, msg: text }, text);
    }
    dataSqlErrorEl.textContent = text;
    dataSqlErrorEl.hidden = false;
}

function dataSqlHideError() {
    if (!dataSqlErrorEl) return;
    dataSqlErrorEl.hidden = true;
    dataSqlErrorEl.textContent = '';
}

function dataSqlUpdateStatus(result) {
    if (dataSqlStatusEl) {
        dataSqlStatusEl.textContent = dataSqlFmt('dataSqlStatus',
            { n: result.rowCount, ms: Math.max(1, Math.round(result.ms)) }, '');
    }
    dataSqlUpdateBadge(result);
}

// 标题旁那枚徽标：批量执行时状态栏写的是「几条语句」，这枚只负责当前这条的行数
function dataSqlUpdateBadge(result) {
    if (dataSqlRowBadge) {
        // 条数一直亮在标题旁：没被截断就是「N 行」，被上限截了就说清「已显示 / 符合」
        dataSqlRowBadge.textContent = result.truncated
            ? dataSqlFmt('dataSqlRowsShown',
                { shown: result.rowCount, n: result.matched != null ? result.matched : result.rowCount }, '')
            : dataSqlFmt('dataSqlPreviewAll', { n: result.rowCount }, '');
        dataSqlRowBadge.title = result.truncated
            ? dataSqlFmt('dataSqlTruncated', { n: result.rowCount }, '')
            : '';
    }
}

/* ------------------------------ 渲染 ------------------------------ */

function dataSqlEsc(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// 哪几列是数字（右对齐用）：先看列类型，类型不认识（表达式列）再按值猜
function dataSqlNumericCols(result) {
    if (result._numCols) return result._numCols;
    const byName = Object.create(null);
    dataSqlTypes.forEach((col) => { byName[col.name] = col.base; });
    const rows = result.rows.slice(0, 50);
    const flags = result.columns.map((name, c) => {
        const base = byName[name];
        if (base) return !!DATASQL_NUM_BASES[base];
        let nums = 0;
        let filled = 0;
        rows.forEach((row) => {
            const v = row[c];
            if (v == null || v === '') return;
            filled++;
            if (typeof v === 'number' || (Sql && Sql.toNum(v) !== null)) nums++;
        });
        return filled > 0 && nums / filled >= 0.6;
    });
    result._numCols = flags;
    return flags;
}

function dataSqlRenderEmpty() {
    if (dataSqlTableEl) {
        dataSqlTableEl.hidden = true;
        dataSqlTableEl.innerHTML = '';
    }
    if (dataSqlEmptyEl) dataSqlEmptyEl.hidden = false;
}

function dataSqlRenderResult() {
    if (!dataSqlTableEl || !dataSqlResult) return;
    const cols = dataSqlResult.columns;
    const flags = dataSqlNumericCols(dataSqlResult);
    let head = '<thead><tr>';
    cols.forEach((name, i) => {
        head += '<th' + (flags[i] ? ' class="is-num"' : '') + ' title="' + dataSqlEsc(name) + '">'
            + dataSqlEsc(name) + '</th>';
    });
    head += '</tr></thead><tbody></tbody>';
    dataSqlTableEl.innerHTML = head;
    dataSqlTableEl.hidden = false;
    if (dataSqlEmptyEl) dataSqlEmptyEl.hidden = true;
    dataSqlAppendRows(DATASQL_BATCH);
}

function dataSqlAppendRows(batch) {
    if (!dataSqlResult || !dataSqlTableEl) return;
    const tbody = dataSqlTableEl.querySelector('tbody');
    if (!tbody) return;
    const cols = dataSqlResult.columns.length;
    const flags = dataSqlNumericCols(dataSqlResult);
    const total = dataSqlResult.rowCount;
    const start = dataSqlRendered;
    const end = Math.min(total, start + batch);
    // 上一次的「加载更多」行先摘掉，追加完再按需补一行
    const more = tbody.querySelector('.stats-more');
    if (more) more.remove();

    let html = '';
    for (let r = start; r < end; r++) {
        const row = dataSqlResult.rows[r];
        html += '<tr>';
        for (let c = 0; c < cols; c++) {
            const raw = row[c];
            const text = Sql ? Sql.formatValue(raw) : String(raw == null ? '' : raw);
            html += '<td' + (flags[c] ? ' class="is-num"' : '')
                + ' data-copy="' + dataSqlEsc(raw == null ? '' : text) + '"'
                + ' title="' + dataSqlEsc(text) + '">'
                + (text === '' ? '<span class="datasql-null">—</span>' : dataSqlEsc(text))
                + '</td>';
        }
        html += '</tr>';
    }
    tbody.insertAdjacentHTML('beforeend', html);
    dataSqlRendered = end;

    if (end < total) {
        const shown = dataSqlFmt('dataSqlMoreRows', { shown: end, n: total }, '');
        const label = dataSqlT('dataSqlLoadMore', 'Load more');
        tbody.insertAdjacentHTML('beforeend',
            '<tr class="stats-more"><td colspan="' + Math.max(1, cols) + '">'
            + '<span class="stats-more-inner"><span>' + dataSqlEsc(shown) + '</span>'
            + '<button type="button" class="stats-more-btn" data-datasql-more="1">'
            + dataSqlEsc(label) + '</button></span></td></tr>');
    }
}

function dataSqlFlashCell(td) {
    if (!td) return;
    td.classList.add('cell-copied');
    setTimeout(() => td.classList.remove('cell-copied'), 700);
}

async function dataSqlCopyCell(td) {
    const value = td.dataset ? td.dataset.copy : '';
    const text = value == null ? '' : String(value);
    if (!text) {
        showToast(dataSqlT('dataSqlToastEmpty', '这一格是空的'), 'error');
        return;
    }
    try {
        await writeClipboardText(text);
        dataSqlFlashCell(td);
        showToast(dataSqlFmt('dataSqlToastCell', { v: text.length > 40 ? text.slice(0, 40) + '…' : text }, ''));
    } catch (err) {
        showToast(String((err && err.message) || err), 'error');
    }
}

async function dataSqlCopyResult() {
    if (!dataSqlResult || !dataSqlResult.rowCount) {
        showToast(dataSqlT('dataSqlNoData', '还没有数据'), 'error');
        return;
    }
    try {
        await writeClipboardText(Sql.toTsv(dataSqlResult));
        showToast(dataSqlFmt('dataSqlToastCopied', { n: dataSqlResult.rowCount }, ''));
    } catch (err) {
        showToast(String((err && err.message) || err), 'error');
    }
}

/* ------------------------------ 进出页面 ------------------------------ */

function dataSqlEnsureEditors() {
    if (dataSqlQueryEditor && dataSqlDataEditor) return;
    if (!dataSqlQueryEditor && dataSqlQueryEl && typeof CodeMirror !== 'undefined') {
        dataSqlQueryEditor = CodeMirror.fromTextArea(dataSqlQueryEl,
            editorConfig('text/x-sql', dataSqlQueryEl.placeholder, () => dataSqlRun()));
        dataSqlQueryEditor.on('change', () => {
            const next = dataSqlQueryEditor.getValue();
            if (dataSqlQueryEl.value !== next) dataSqlQueryEl.value = next;
            dataSqlSchedule();
        });
        // 选中 / 取消选中都换一次按钮提示（有选区就只跑那一段）
        dataSqlQueryEditor.on('cursorActivity', () => dataSqlSyncRunLabel());

        // ---- 补全：打完字自动弹，Ctrl / ⌘ + Space 手动叫 ----
        // 组词期间（中文输入法）绝不能弹：宿主是 WebKit，弹框会把候选窗顶掉
        let composing = false;
        const field = dataSqlQueryEditor.getInputField ? dataSqlQueryEditor.getInputField() : null;
        const popHint = () => {
            if (composing || dataSqlQueryEditor.state.completionActive) return;
            // completeSingle:false —— 只有一个候选时也不擅自上屏，别改我打的字
            dataSqlQueryEditor.showHint({ hint: dataSqlHint, completeSingle: false });
        };
        if (field) {
            field.addEventListener('compositionstart', () => { composing = true; }, true);
            field.addEventListener('compositionend', () => {
                composing = false;
                // 上屏那一下的 change 是在组词期间发出的、被 composing 挡掉了，
                // 这里补一次：中文列名基本都靠这一下才弹得出来
                setTimeout(popHint, 0);
            }, true);
        }
        dataSqlQueryEditor.setOption('extraKeys', Object.assign(
            {}, dataSqlQueryEditor.getOption('extraKeys') || {},
            { 'Ctrl-Space': () => popHint(), 'Cmd-Space': () => popHint() }
        ));
        // 打完什么字符值得弹：
        //   · 词字符（含汉字）—— 中文列名一个字也是词的一部分，只认 \w 会永远弹不出来
        //   · 逗号 —— 列清单里刚写完一个，正要写下一个
        //   · SELECT / WHERE / AND … 后面的空格 —— 多数人是在这里开始写列名
        dataSqlQueryEditor.on('inputRead', (cm, change) => {
            if (!change || (change.origin && change.origin !== '+input')) return;
            const typed = (change.text || []).join('');
            if (!typed) return;
            if (/^[\w.\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3000-\u303f]$/.test(typed)) {
                popHint();
                return;
            }
            if (typed === ',' || typed === '，') {
                popHint();
                return;
            }
            if (/^\s$/.test(typed)) {
                const line = cm.getLine(change.from.line) || '';
                const before = line.slice(0, change.from.ch);
                if (/(^|[\s(,])(select|distinct|where|and|or|not|by|having|on|as|in|like|between)$/i.test(before)) {
                    popHint();
                }
            }
        });
        linkTextareaToEditor(dataSqlQueryEl, dataSqlQueryEditor);
        // 右键：选中一段 SQL 就地跑（编辑器是 WebKit 里的 contenteditable，事件挂包装层）
        dataSqlBindCtxMenu(dataSqlQueryEditor.getWrapperElement
            ? dataSqlQueryEditor.getWrapperElement() : dataSqlQueryEl);
    }
    if (!dataSqlDataEditor && dataSqlInputEl && typeof CodeMirror !== 'undefined') {
        dataSqlDataEditor = CodeMirror.fromTextArea(dataSqlInputEl,
            editorConfig('text/plain', dataSqlInputEl.placeholder, () => dataSqlRun()));
        dataSqlDataEditor.on('change', () => {
            const next = dataSqlDataEditor.getValue();
            if (dataSqlInputEl.value !== next) dataSqlInputEl.value = next;
            dataSqlSchedule();
        });
        linkTextareaToEditor(dataSqlInputEl, dataSqlDataEditor);
    }
    dataSqlSyncTheme();
}

// 主题切换由 09-convert.js 的 syncEditorTheme 统一处理，但那份列表是硬编码的；
// 新页自己跟 data-dbx-theme 属性，省得去改别人的列表（09 在 19 之前加载，直接引用会 TDZ）
function dataSqlSyncTheme() {
    if (typeof document === 'undefined') return;
    const dark = document.documentElement.getAttribute('data-dbx-theme') === 'dark';
    const theme = dark ? 'material-darker' : 'default';
    [dataSqlQueryEditor, dataSqlDataEditor].forEach((cm) => {
        if (!cm || cm.getOption('theme') === theme) return;
        cm.setOption('theme', theme);
    });
}

if (typeof MutationObserver === 'function') {
    new MutationObserver(dataSqlSyncTheme).observe(document.documentElement, {
        attributes: true, attributeFilter: ['data-dbx-theme']
    });
}

function enterDataSqlMode() {
    exitOtherModes('dataSql');
    dataSqlModeActive = true;
    markConvertActive(null);
    mainWorkspace.classList.add('hidden');
    toolbarEl.classList.add('hidden');
    dataSqlWorkspaceEl.classList.add('active');
    navDataSqlLink.classList.add('active');
    // 编辑器在隐藏容器里建出来会量到 0 宽，等上屏那一帧再 refresh
    dataSqlEnsureEditors();
    dataSqlSyncRunLabel();
    if (!dataSqlHeightRestored) {
        dataSqlHeightRestored = true;
        dataSqlRestoreHeight();
    }
    requestAnimationFrame(() => {
        if (dataSqlQueryEditor) dataSqlQueryEditor.refresh();
        if (dataSqlDataEditor) dataSqlDataEditor.refresh();
        // 进页只把数据解析一遍；已经有结果就留着，没有就等用户点「运行」
        // ——「任何情况下不要自动执行 SQL」
        if (!dataSqlResult) dataSqlDataChanged();
    });
}

function exitDataSqlMode() {
    if (!dataSqlModeActive) return;
    dataSqlModeActive = false;
    // 还在跑就把号一变，执行器下一片自己收摊（切走了没必要把 CPU 继续烧完）
    if (dataSqlRunning) {
        dataSqlRunSeq++;
        dataSqlCancelFlag = true;
        dataSqlSetRunning(false);
    }
    dataSqlWorkspaceEl.classList.remove('active');
    navDataSqlLink.classList.remove('active');
    // 面板挂在 body 下，不跟着 section 隐藏，得自己收
    if (typeof dataSqlCloseTypes === 'function') dataSqlCloseTypes();
    // 右键菜单同理：换页了不能还挂在屏幕上
    dataSqlCtxHide();
    toolbarEl.classList.remove('hidden');
    mainWorkspace.classList.remove('hidden');
}

// 切语言后动态文案（行数 / 耗时 / 加载更多）要重画；applyI18n 用 typeof 守卫调它
function dataSqlOnLangChange() {
    if (!dataSqlModeActive) return;
    if (dataSqlResult) {
        dataSqlRendered = 0;
        dataSqlRenderResult();
        dataSqlAppendRows(DATASQL_BATCH);
        dataSqlRenderBatchTabs();
        if (dataSqlBatch.length > 1) {
            // 批量结果：徽标跟着当前那条，状态栏留着整批的统计
            dataSqlUpdateBadge(dataSqlResult);
            let ms = 0;
            dataSqlBatch.forEach((it) => { ms += (it.result && it.result.ms) || 0; });
            if (dataSqlStatusEl) {
                dataSqlStatusEl.textContent = dataSqlFmt('dataSqlBatchStatus',
                    { n: dataSqlBatch.length, ms: Math.max(1, Math.round(ms)) }, '');
            }
        } else {
            dataSqlUpdateStatus(dataSqlResult);
        }
    }
    // 预览顶部那行「前 100 / 1,234 行」也是拼出来的
    dataSqlRenderPreview(dataSqlParsed, dataSqlColumnNames(dataSqlParsed));
    // 进度文字是拼出来的（「运行中 12,000 / 50,000」），切语言时按最后一次进度重画
    if (dataSqlRunning && dataSqlLastProgress) dataSqlShowProgress(dataSqlLastProgress);
    // CodeMirror 的 placeholder 是建编辑器那一刻取的，切语言后得手动同步过去，
    // 否则上面 applyI18n 只改了 textarea 的属性，框里那行灰字还是旧语言
    if (dataSqlQueryEditor) {
        dataSqlQueryEditor.setOption('placeholder', (dataSqlQueryEl && dataSqlQueryEl.placeholder) || '');
    }
    if (dataSqlDataEditor) {
        dataSqlDataEditor.setOption('placeholder', (dataSqlInputEl && dataSqlInputEl.placeholder) || '');
    }
    dataSqlSyncRunLabel();
}

/* ------------------------------ 导入文件 ------------------------------ */
/*
 * 三种都能进这页：
 *   · .txt / .tsv / .csv / 无扩展名 → 原样读文本，分隔符照旧自动识别
 *   · .xlsx / .xlsm → 零依赖的 xlsxread 读第一个工作表，转成 TSV 再走同一条解析
 *   · .xls（BIFF 二进制）读不了，给一句明确的话，别让人对着空白页猜
 * 导入完自动切到表格预览：文件刚进来第一件事就是看列对不对。
 */
function dataSqlRowsToTsv(rows) {
    let out = '';
    for (let r = 0; r < rows.length; r++) {
        const row = rows[r] || [];
        const line = [];
        for (let c = 0; c < row.length; c++) {
            const v = row[c];
            // 单元格里的换行 / 制表符会把一列劈成两列，换成空格
            line.push(String(v == null ? '' : v).replace(/[\t\r\n]+/g, ' '));
        }
        out += line.join('\t') + '\n';
        if (out.length > DATASQL_MAX_CHARS) break;
    }
    return out;
}

function dataSqlImportNote(name, size, tone) {
    const text = typeof fTpl === 'function'
        ? fTpl('flowImported', '已导入 {name} · {size}', { name: name || '—', size: DBXImg.formatBytes(size || 0) })
        : (name || '');
    dataSqlTipLockUntil = Date.now() + 2500;
    if (typeof setPageTip === 'function') setPageTip('dataSqlTip', text, tone || 'ok');
    if (typeof showToast === 'function') showToast(text);
    return text;
}

function dataSqlImportFail(key, fallback, name) {
    const text = dataSqlFmt(key, { name: name || '—' }, fallback);
    dataSqlTipLockUntil = Date.now() + 2500;
    if (typeof setPageTip === 'function') setPageTip('dataSqlTip', text, 'err');
    if (typeof showToast === 'function') showToast(text, 'error');
}

async function dataSqlImportFile(file) {
    if (!file) return;
    const name = String(file.name || '');

    // .sql 是语句不是数据，走另一条路（填进查询框、顺手跑一次）
    if (/\.sql$/i.test(name)) {
        await dataSqlLoadSqlFile(file);
        return;
    }

    const isXlsx = /\.(xlsx|xlsm)$/i.test(name);

    if (!isXlsx && /\.xls$/i.test(name)) {
        dataSqlImportFail('dataSqlXlsOld', '', name);
        return;
    }

    // 体积闸：xlsx 按表格文件的上限，文本按文本上限（读进来之前先拦，别先吃进内存）
    const limit = isXlsx
        ? (typeof SHEET_LIMITS !== 'undefined' ? SHEET_LIMITS.maxFileBytes : 0)
        : (typeof TEXT_IMPORT_MAX !== 'undefined' ? TEXT_IMPORT_MAX : 0);
    if (limit && Number(file.size || 0) > limit && typeof dropTooBig === 'function') {
        if (typeof showToast === 'function') showToast(dropTooBig(name, Number(file.size || 0), limit), 'error');
        return;
    }

    if (isXlsx) {
        if (!window.DBXXlsx) {
            dataSqlImportFail('dataSqlImportFail', '', name);
            return;
        }
        let rows = [];
        try {
            const buffer = await file.arrayBuffer();
            const res = await window.DBXXlsx.read(buffer, { maxRows: 50000 });
            rows = (res && res.rows) || [];
        } catch (err) {
            dataSqlImportFail('dataSqlImportFail', '', name);
            return;
        }
        const text = dataSqlRowsToTsv(rows);
        if (!text.trim()) {
            dataSqlImportFail('dataSqlImportEmpty', '', name);
            return;
        }
        dataSqlSetData(text);
        // 导入只负责把数据放进来，不自动跑：跑不跑由人决定
        dataSqlDataChanged();
        dataSqlImportNote(name, file.size);
        return;
    }

    let text = '';
    try {
        text = await readFileText(file);
    } catch (err) {
        dataSqlImportFail('dataSqlImportFail', '', name);
        return;
    }
    if (typeof textLooksBinary === 'function' && textLooksBinary(text)) {
        dataSqlImportFail('dataSqlImportBin', '', name);
        return;
    }
    if (!text.trim()) {
        dataSqlImportFail('dataSqlImportEmpty', '', name);
        return;
    }
    dataSqlSetData(text);
    // 同上：导入只填数据，不自动执行
    dataSqlDataChanged();
    dataSqlImportNote(name, file.size);
}

/* ------------------------------ 导入 .sql ------------------------------ */
/*
 * .sql 不按数据读：它就是语句本身。读进来直接填进查询框，有数据就顺手跑一次
 * ——导一句 SQL 进来的目的就是看结果，没必要再让人找「运行」。
 */
async function dataSqlLoadSqlFile(file) {
    if (!file) return;
    const name = String(file.name || '');
    const limit = typeof TEXT_IMPORT_MAX !== 'undefined' ? TEXT_IMPORT_MAX : 0;
    if (limit && Number(file.size || 0) > limit && typeof dropTooBig === 'function') {
        if (typeof showToast === 'function') showToast(dropTooBig(name, Number(file.size || 0), limit), 'error');
        return;
    }
    let text = '';
    try {
        text = await readFileText(file);
    } catch (err) {
        dataSqlImportFail('dataSqlImportFail', '', name);
        return;
    }
    if (typeof textLooksBinary === 'function' && textLooksBinary(text)) {
        dataSqlImportFail('dataSqlImportBin', '', name);
        return;
    }
    // BOM / CRLF 先规整：记事本存的文件常带着它们，直接进编辑器会多出一个看不见的字符
    text = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
    if (!text) {
        dataSqlImportFail('dataSqlImportEmpty', '', name);
        return;
    }
    if (text.length > DATASQL_MAX_CHARS) text = text.slice(0, DATASQL_MAX_CHARS);

    dataSqlSetQuery(text);
    dataSqlAutoText = '';        // 文件里的是「用户的 SQL」，别被自动生成的那句盖掉
    dataSqlHideError();
    if (dataSqlQueryEditor) {
        dataSqlQueryEditor.setCursor({ line: 0, ch: 0 });
        dataSqlQueryEditor.refresh();
        dataSqlQueryEditor.focus();
    } else if (dataSqlQueryEl) {
        dataSqlQueryEl.focus();
    }
    // 光标在开头 → 只有一条就整条跑，好几条就先跑第一条（其余留着，按需改光标位置）。
    // 注意别自动执行：填进来只是「把语句放到手边」，跑不跑由人决定
    dataSqlInvalidateResult();
    if (dataSqlStatusEl) dataSqlStatusEl.textContent = dataSqlT('dataSqlNeedRun', '');
    dataSqlImportNote(name, file.size);
}

/* ------------------------------ 快捷语句 ------------------------------ */
/*
 * 点一下就插一句完整的 SELECT（不是片段），列名按当前数据来：
 * 分组列挑第一个文本列，求和列挑第一个小数 / 整数列（跳过 id 那种长整数）。
 * 有选区就替换选区，没有就插在光标处；编辑器是空的就整段填上。
 */
function dataSqlSnippetContext() {
    const names = dataSqlColumnNames(dataSqlParsed);
    const rows = (dataSqlParsed && dataSqlParsed.rows) || [];
    const cols = (dataSqlParsed && dataSqlParsed.cols) || 0;
    const sample = rows.slice(0, 200);
    const list = names.length ? names : Array.from({ length: cols }, (_, i) => 'c' + (i + 1));

    const numeric = [];
    const dates = [];
    let groupIdx = -1;
    let groupDistinct = 0;
    dataSqlTypes.forEach((col, i) => {
        const base = col.base || '';
        if (DATASQL_NUM_BASES[base]) numeric.push(i);
        if (base === 'DATE' || base === 'DATETIME' || base === 'TIMESTAMP') dates.push(i);
        if (base !== 'VARCHAR' && base !== 'TEXT') return;
        // 2~15 个取值的那一列才是「分类」，全是唯一值的是主键，不适合分组
        const set = new Set();
        for (let r = 0; r < sample.length; r++) {
            const v = sample[r][i];
            if (v != null && v !== '') set.add(String(v));
            if (set.size > 20) break;
        }
        if (set.size >= 2 && set.size <= 15 && set.size > groupDistinct) {
            groupDistinct = set.size;
            groupIdx = i;
        }
    });

    // 求和列：小数优先，其次整数；跳过 0/1 标记和 8 位以上的长整数（那是编号，加起来没意义）
    const summable = numeric.filter((i) => {
        const col = dataSqlTypes[i] || {};
        if (col.maxLen <= 1) return false;
        if (/INT$/.test(col.base || '') && col.length >= 8) return false;
        return true;
    });
    const decimals = summable.filter((i) => {
        const base = (dataSqlTypes[i] || {}).base || '';
        return base === 'DECIMAL' || base === 'DOUBLE' || base === 'FLOAT';
    });
    const sumIdx = decimals.length ? decimals[0] : (summable.length ? summable[0] : -1);

    // 排序依据：能求和的数值 > 日期 > 第一列
    const orderIdx = sumIdx >= 0 ? sumIdx : (dates.length ? dates[0] : (groupIdx >= 0 ? groupIdx : 0));

    return {
        names: list,
        group: groupIdx >= 0 ? list[groupIdx] : (list[0] || 'c1'),
        sum: sumIdx >= 0 ? list[sumIdx] : '',
        order: list[orderIdx] || list[0] || 'c1',
        hasGroup: groupIdx >= 0
    };
}

const DATASQL_SNIPPETS = {
    all: () => 'SELECT *\nFROM t\nLIMIT 100',
    group: (ctx) => 'SELECT ' + ctx.group + ', COUNT(*) AS n'
        + (ctx.sum ? ', SUM(' + ctx.sum + ') AS total' : '')
        + '\nFROM t\nGROUP BY ' + ctx.group
        + (ctx.sum ? '\nORDER BY total DESC' : '\nORDER BY n DESC'),
    distinct: (ctx) => 'SELECT DISTINCT ' + ctx.group + '\nFROM t\nORDER BY ' + ctx.group,
    top: (ctx) => 'SELECT *\nFROM t\nORDER BY ' + ctx.order + ' DESC\nLIMIT 10'
};

/*
 * 点预览表的表头 = 把这一列的名字插到 SQL 光标处。
 * 中文列名靠输入法一个字一个字打太费手，看着表点一下最省事；
 * 前面紧跟着标识符 / 右括号 / 引号时自动补一个「, 」，免得粘成 SELECT考核指标目标值。
 */
function dataSqlInsertColumn(name) {
    const col = String(name == null ? '' : name);
    if (!col) return;
    const cm = dataSqlQueryEditor;
    if (!cm) return;
    const picked = dataSqlSelectedSql();
    let lead = '';
    if (!picked) {
        const pos = cm.getCursor();
        const before = cm.getRange({ line: pos.line, ch: 0 }, pos);
        const lastChar = before.slice(-1);
        if (lastChar && /[\w\)"'`\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(lastChar)) lead = ', ';
    }
    if (picked) {
        cm.replaceSelection(lead + col);
    } else {
        cm.replaceRange(lead + col, cm.getCursor());
    }
    cm.focus();
}

function dataSqlInsertSnippet(kind) {
    const make = DATASQL_SNIPPETS[kind];
    if (!make) return;
    const sql = make(dataSqlSnippetContext());
    if (dataSqlQueryEditor) {
        const cm = dataSqlQueryEditor;
        const text = cm.getValue();
        // 一律追加到末尾（不插在光标处）：光标常停在编辑器中间，插进去会把语句劈成两半。
        // 前面有内容就空一行隔开，末尾统一带分号
        const last = cm.lastLine();
        const end = { line: last, ch: (cm.getLine(last) || '').length };
        const ins = (text.trim() ? '\n\n' : '') + sql + ';';
        cm.replaceRange(ins, end);
        const last2 = cm.lastLine();
        cm.setCursor({ line: last2, ch: (cm.getLine(last2) || '').length });
        cm.focus();
        cm.scrollIntoView({ line: last2, ch: 0 }, 40);
    } else if (dataSqlQueryEl) {
        const text = dataSqlQueryEl.value;
        dataSqlQueryEl.value = (text.trim() ? text.replace(/\s+$/, '') + '\n\n' : '') + sql + ';';
    }
    // 插进去的算用户写的：后续不要被「自动生成」冲掉。
    // 只插入、不执行——跑不跑由人点「运行」（或 Ctrl / ⌘ + Enter）
    dataSqlAutoText = '';
    if (dataSqlStatusEl) dataSqlStatusEl.textContent = dataSqlT('dataSqlNeedRun', '');
}

/* ------------------------------ SQL 补全 ------------------------------ */
/*
 * 只补「这一页真能跑的东西」：引擎支持的关键字 / 函数 + 表名 t + 当前数据的列名。
 * 上下文很简单就能判：光标前最后一个词是 FROM / JOIN 就只给表名，其余给列名 + 关键字。
 * 打完字母自动弹（单条不自动上屏，避免把你写的字吃掉），Ctrl-Space 手动叫人。
 */
const DATASQL_KEYWORDS = [
    'SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'OFFSET',
    'AS', 'AND', 'OR', 'NOT', 'IN', 'IS NULL', 'IS NOT NULL', 'LIKE', 'BETWEEN',
    'DISTINCT', 'ASC', 'DESC', 'COUNT(*)'
];
const DATASQL_FUNCS = [
    'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'GROUP_CONCAT',
    'ROUND', 'ABS', 'UPPER', 'LOWER', 'LENGTH', 'TRIM', 'SUBSTR', 'COALESCE', 'IFNULL'
];

function dataSqlHintItem(text, kind) {
    return {
        text: text,
        className: 'datasql-hint-item datasql-hint-' + kind,
        // 右边挂个短标签：一眼分出「这是列名还是关键字」（col / t / fn / kw）
        render(el) {
            el.textContent = text;
            const tag = document.createElement('span');
            tag.className = 'datasql-hint-kind';
            tag.textContent = kind === 'col' ? 'col' : kind === 'table' ? 't' : kind;
            el.appendChild(tag);
        }
    };
}

function dataSqlHint(cm) {
    const cursor = cm.getCursor();
    const beforeLine = cm.getLine(cursor.line).slice(0, cursor.ch);
    // 词边界要认汉字：列名常是「考核指标」这种，用 \w 匹配会一个字都取不到
    const word = (beforeLine.match(/[\w.\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]*$/) || [''])[0];
    const rest = beforeLine.slice(0, cursor.ch - word.length);
    const prevWord = (rest.match(/([A-Za-z_]+)\s*$/) || [])[1] || '';
    // FROM / JOIN 后面要的是表，不是列
    const wantTable = /^(from|join|into|table)$/i.test(prevWord);

    const names = dataSqlColumnNames(dataSqlParsed);
    const seen = Object.create(null);
    const list = [];
    const push = (text, kind) => {
        const key = kind + ':' + text;
        if (seen[key]) return;
        seen[key] = 1;
        list.push(dataSqlHintItem(text, kind));
    };

    if (wantTable) {
        push('t', 'table');
    } else {
        names.forEach((n) => push(String(n), 'col'));
        push('t', 'table');
        DATASQL_FUNCS.forEach((f) => push(f, 'fn'));
        DATASQL_KEYWORDS.forEach((k) => push(k, 'kw'));
    }

    const lower = word.toLowerCase();
    // 中文列名常是「取一段就用」：打「指标」也该提示「考核指标」。
    // ASCII 只做前缀匹配，否则打一个 s 会被 COALESCE / LENGTH 之类淹掉
    const cjk = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(lower);
    const filtered = list.filter((item) => {
        if (!lower) return true;
        const t = item.text.toLowerCase();
        return cjk ? t.indexOf(lower) >= 0 : t.indexOf(lower) === 0;
    });
    // 前缀命中的排前面，其次短的在前（打 "s" 时 SELECT / SUM 比 GROUP_CONCAT 更可能）
    filtered.sort((a, b) => {
        const ap = a.text.toLowerCase().indexOf(lower) === 0 ? 0 : 1;
        const bp = b.text.toLowerCase().indexOf(lower) === 0 ? 0 : 1;
        if (ap !== bp) return ap - bp;
        return a.text.length - b.text.length;
    });
    if (!filtered.length) return null;
    return {
        list: filtered.slice(0, 40),
        from: CodeMirror.Pos(cursor.line, cursor.ch - word.length),
        to: cursor
    };
}

if (typeof CodeMirror !== 'undefined' && CodeMirror.registerHelper) {
    CodeMirror.registerHelper('hint', 'sql', dataSqlHint);
    CodeMirror.registerHelper('hint', 'text/x-sql', dataSqlHint);
}

/* ------------------------------ 事件 ------------------------------ */

if (dataSqlRunBtn) dataSqlRunBtn.addEventListener('click', () => dataSqlRun());
if (dataSqlCancelBtn) dataSqlCancelBtn.addEventListener('click', dataSqlCancel);
if (dataSqlCopyBtn) dataSqlCopyBtn.addEventListener('click', dataSqlCopyResult);

/* ------------------------------ 源码 / 表格 切换 ------------------------------ */

if (dataSqlViewEl) {
    dataSqlViewEl.addEventListener('click', (e) => {
        const tab = e.target.closest('.compare-tab');
        if (!tab) return;
        dataSqlSetView(tab.dataset.view);
    });
}

const dataSqlSnippetsEl = document.getElementById('dataSqlSnippets');
if (dataSqlSnippetsEl) {
    dataSqlSnippetsEl.addEventListener('click', (e) => {
        const chip = e.target.closest('.sample-chip');
        if (!chip) return;
        dataSqlInsertSnippet(chip.dataset.snippet);
    });
}

/* ------------------------------ SQL 区高度（可拖） ------------------------------ */

function dataSqlRootPx() {
    const raw = typeof getComputedStyle === 'function'
        ? parseFloat(getComputedStyle(document.documentElement).fontSize)
        : 16;
    return raw > 0 ? raw : 16;
}

function dataSqlHeightRem() {
    const raw = dataSqlWorkspaceEl
        ? dataSqlWorkspaceEl.style.getPropertyValue('--datasql-sql-h')
        : '';
    const v = parseFloat(raw);
    return Number.isFinite(v) ? v : DATASQL_SQL_H.def;
}

// 上限不能只看绝对 rem：窗口矮的时候 26rem 会把下面的表格挤没，
// 所以再按面板高度收一次（SQL 区最多占七成）
function dataSqlClampHeight(rem) {
    const px = dataSqlRootPx();
    let max = DATASQL_SQL_H.max;
    if (dataSqlWorkspaceEl && dataSqlWorkspaceEl.clientHeight > 0) {
        const fit = (dataSqlWorkspaceEl.clientHeight - 7 * px) / px;
        if (fit > DATASQL_SQL_H.min && fit < max) max = fit;
    }
    return Math.min(max, Math.max(DATASQL_SQL_H.min, rem));
}

function dataSqlApplyHeight(rem, opts) {
    const h = dataSqlClampHeight(rem);
    if (dataSqlWorkspaceEl) dataSqlWorkspaceEl.style.setProperty('--datasql-sql-h', h + 'rem');
    // CodeMirror 自己量高度，容器变了要让它重排一次
    if (dataSqlQueryEditor) dataSqlQueryEditor.refresh();
    if (opts && opts.save) {
        const raw = String(Math.round(h * 10) / 10);
        prefWriteLocal(DATASQL_SQL_H_KEY, raw);
        prefNameSet('dbx-dsql:', raw);
        prefHostSet(DATASQL_SQL_H_KEY, raw);
    }
    return h;
}

async function dataSqlRestoreHeight() {
    let raw = prefReadLocal(DATASQL_SQL_H_KEY) || prefNameGet('dbx-dsql:');
    if (!raw) raw = await prefHostGet(DATASQL_SQL_H_KEY);
    const v = parseFloat(raw);
    if (Number.isFinite(v)) dataSqlApplyHeight(v);
}

if (dataSqlResizer) {
    let drag = null;
    // 宿主是 WebKit，两套事件都得能接：有 PointerEvent 就用它（能拿指针捕获），
    // 老环境退回 mouse*——不然「按住拖不动」这种问题在某个宿主上又是哑的
    const hasPointer = typeof window.PointerEvent === 'function';
    const downEvent = hasPointer ? 'pointerdown' : 'mousedown';
    const moveEvent = hasPointer ? 'pointermove' : 'mousemove';
    const upEvent = hasPointer ? 'pointerup' : 'mouseup';

    function endDrag() {
        if (!drag) return;
        drag = null;
        dataSqlResizer.classList.remove('dragging');
        document.body.classList.remove('datasql-resizing');
        dataSqlApplyHeight(dataSqlHeightRem(), { save: true });
    }

    function startDrag(clientY, pointerId) {
        drag = { y: clientY, h: dataSqlHeightRem() };
        dataSqlResizer.classList.add('dragging');
        document.body.classList.add('datasql-resizing');
        if (pointerId != null) {
            try { dataSqlResizer.setPointerCapture(pointerId); } catch (err) { /* 老宿主没有 */ }
        }
    }

    dataSqlResizer.addEventListener(downEvent, (e) => {
        if (e.button != null && e.button !== 0) return;
        startDrag(e.clientY, hasPointer ? e.pointerId : null);
        e.preventDefault();
    });
    // move / up 挂 document 且走捕获：拖出面板、拖到别处松手也收得到
    document.addEventListener(moveEvent, (e) => {
        if (!drag) return;
        dataSqlApplyHeight(drag.h + (e.clientY - drag.y) / dataSqlRootPx());
    }, true);
    document.addEventListener(upEvent, endDrag, true);
    // 双击回默认高度（有人习惯双击试试）
    dataSqlResizer.addEventListener('dblclick', () => {
        dataSqlApplyHeight(DATASQL_SQL_H.def, { save: true });
    });
    // 分隔条能 Tab 到，也得能用键盘调（不然只有鼠标能用）
    dataSqlResizer.addEventListener('keydown', (e) => {
        const step = e.shiftKey ? 1.5 : 0.5;
        if (e.key === 'ArrowUp') dataSqlApplyHeight(dataSqlHeightRem() - step, { save: true });
        else if (e.key === 'ArrowDown') dataSqlApplyHeight(dataSqlHeightRem() + step, { save: true });
        else if (e.key === 'Home' || e.key === 'Enter') dataSqlApplyHeight(DATASQL_SQL_H.def, { save: true });
        else return;
        e.preventDefault();
    });
}

if (dataSqlDelimEl) {
    dataSqlDelimEl.addEventListener('click', (e) => {
        const tab = e.target.closest('.compare-tab');
        if (!tab) return;
        dataSqlDelimEl.querySelectorAll('.compare-tab').forEach((t) => {
            t.classList.toggle('active', t === tab);
        });
        dataSqlDelimiter = tab.dataset.delim || 'auto';
        // 换分隔符只重新解析，不自动跑（旧结果同时收掉，列已经不一样了）
        dataSqlDataChanged();
    });
}
if (dataSqlHeaderEl) {
    dataSqlHeaderEl.addEventListener('change', () => {
        // 点过一次就以用户为准，后面不再自动勾选
        dataSqlHeaderAuto = false;
        dataSqlDataChanged();
    });
}

if (dataSqlSamplesEl) {
    dataSqlSamplesEl.addEventListener('click', (e) => {
        const chip = e.target.closest('.sample-chip');
        if (!chip) return;
        const sample = DATASQL_SAMPLES[chip.dataset.sample];
        if (!sample) return;
        dataSqlDelimiter = 'auto';
        if (dataSqlDelimEl) {
            dataSqlDelimEl.querySelectorAll('.compare-tab').forEach((t) => {
                t.classList.toggle('active', t.dataset.delim === 'auto');
            });
        }
        // 「管道分隔」「无表头」这两个示例本来就没有表头，勾选框跟着关掉
        if (dataSqlHeaderEl) {
            dataSqlHeaderEl.checked = chip.dataset.sample !== 'pipe' && chip.dataset.sample !== 'nohead';
        }
        // 只装数据，不碰 SQL 框：示例是用来试数据的，不该把人家正在写的语句换掉，
        // 也不自动执行（点「运行」时若框里还是空的，才会按当前数据生成一句）
        dataSqlSetData(sample.text);
        dataSqlDataChanged();
    });
}

// 批量结果的页签：点哪条看哪条
if (dataSqlBatchEl) {
    dataSqlBatchEl.addEventListener('click', (e) => {
        const tab = e.target.closest ? e.target.closest('[data-batch]') : null;
        if (!tab) return;
        dataSqlSelectBatch(Number(tab.dataset.batch) || 0);
    });
}

/* ------------------------------ 两个「清空」+ 导入 SQL ------------------------------ */
// 「清空数据」只动左边：SQL 留着，方便换一份数据接着跑同一句
if (dataSqlClearBtn) {
    dataSqlClearBtn.addEventListener('click', () => {
        dataSqlResult = null;
        dataSqlRendered = 0;
        dataSqlParsed = null;
        dataSqlParsedKey = '';
        dataSqlSetData('');
        dataSqlHideError();
        dataSqlRenderEmpty();
        dataSqlRenderPreview(null, []);
        dataSqlSetView('text');
        if (dataSqlStatusEl) dataSqlStatusEl.textContent = '';
        if (dataSqlRowBadge) dataSqlRowBadge.textContent = '';
        if (dataSqlSourceBadge) dataSqlSourceBadge.textContent = '0 × 0';
        if (dataSqlTipEl) dataSqlTipEl.textContent = '';
        if (dataSqlDataEditor) dataSqlDataEditor.focus();
        else if (dataSqlInputEl) dataSqlInputEl.focus();
    });
}

// 「清空 SQL」只动查询框：数据和上一次的结果都留着
// （写新语句时通常还要对着旧结果看，一起清掉反而碍事）
function dataSqlClearSql() {
    dataSqlSetQuery('');
    dataSqlAutoText = '';
    dataSqlHideError();
    dataSqlCtxHide();
    if (dataSqlStatusEl) dataSqlStatusEl.textContent = '';
    if (dataSqlQueryEditor) {
        dataSqlQueryEditor.setCursor({ line: 0, ch: 0 });
        dataSqlQueryEditor.focus();
    } else if (dataSqlQueryEl) {
        dataSqlQueryEl.focus();
    }
}

if (dataSqlClearSqlBtn) dataSqlClearSqlBtn.addEventListener('click', () => dataSqlClearSql());

if (dataSqlLoadSqlBtn && dataSqlLoadInput) {
    dataSqlLoadSqlBtn.addEventListener('click', () => {
        dataSqlLoadInput.value = '';        // 同一个文件选第二次也要能触发 change
        dataSqlLoadInput.click();
    });
    dataSqlLoadInput.addEventListener('change', () => {
        const file = dataSqlLoadInput.files && dataSqlLoadInput.files[0];
        if (file) dataSqlLoadSqlFile(file);
    });
}

/* ------------------------------ 编辑器右键菜单 ------------------------------ */
/*
 * 选中一段 SQL 就地右键 → 「执行所选」，不用再横跨整个面板去够右下角的按钮。
 * 菜单挂 body 下、fixed 定位（pane 有 overflow，挂里面会被裁）。
 * 打开那一刻就把选区文本存下来：点菜单项时选区通常已经被点没了，
 * 到那时再 getSelection() 拿到的是空串，会误跑整段。
 */
let dataSqlCtxSql = '';
let dataSqlCtxAt = 0;

function dataSqlCtxHide() {
    if (dataSqlCtxEl) dataSqlCtxEl.hidden = true;
}

function dataSqlCtxShow(x, y) {
    if (!dataSqlCtxEl) return;
    const picked = dataSqlSelectedSql();
    dataSqlCtxSql = picked;
    dataSqlCtxAt = picked && dataSqlQueryEditor && typeof dataSqlQueryEditor.indexFromPos === 'function'
        ? dataSqlQueryEditor.indexFromPos(dataSqlQueryEditor.getCursor(true))
        : 0;
    if (dataSqlCtxHead) {
        dataSqlCtxHead.textContent = picked
            ? dataSqlFmt('dataSqlCtxSelInfo', { lines: picked.split('\n').length, chars: picked.length }, '')
            : dataSqlT('dataSqlCtxSelNone', '');
    }
    const selBtn = dataSqlCtxEl.querySelector('[data-ctx="run-sel"]');
    if (selBtn) selBtn.disabled = !picked;

    dataSqlCtxEl.hidden = false;
    // 先摆到指针处再按视口收：在右下角右键时不能弹到屏幕外
    dataSqlCtxEl.style.left = x + 'px';
    dataSqlCtxEl.style.top = y + 'px';
    const rect = dataSqlCtxEl.getBoundingClientRect();
    const w = rect.width || 0;
    const h = rect.height || 0;
    const vw = window.innerWidth || 0;
    const vh = window.innerHeight || 0;
    dataSqlCtxEl.style.left = Math.max(8, Math.min(x, vw ? vw - w - 8 : x)) + 'px';
    dataSqlCtxEl.style.top = Math.max(8, Math.min(y, vh ? vh - h - 8 : y)) + 'px';
}

function dataSqlBindCtxMenu(el) {
    if (!el || el.__dataSqlCtxBound) return;
    el.__dataSqlCtxBound = true;
    el.addEventListener('contextmenu', (e) => {
        // 编辑器里右键一律用自己的菜单（原生菜单在宿主里也是被屏蔽的）
        e.preventDefault();
        dataSqlCtxShow(e.clientX, e.clientY);
    });
}

if (dataSqlCtxEl) {
    dataSqlCtxEl.addEventListener('click', (e) => {
        const item = e.target.closest ? e.target.closest('[data-ctx]') : null;
        if (!item) return;
        const kind = item.dataset.ctx;
        dataSqlCtxHide();
        if (kind === 'run-sel') {
            if (!dataSqlCtxSql) return;
            dataSqlRun({ sql: dataSqlCtxSql, at: dataSqlCtxAt });
        } else if (kind === 'run-stmt') {
            dataSqlRun({ ignoreSelection: true, statement: true });
        } else if (kind === 'clear') {
            dataSqlClearSql();
        }
    });
    // 点到别处 / Esc / 滚动 / 改窗口大小就收起来
    document.addEventListener('mousedown', (e) => {
        if (dataSqlCtxEl.hidden) return;
        if (e.target === dataSqlCtxEl || dataSqlCtxEl.contains(e.target)) return;
        dataSqlCtxHide();
    }, true);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' || e.keyCode === 27) dataSqlCtxHide();
    }, true);
    window.addEventListener('resize', dataSqlCtxHide);
    window.addEventListener('scroll', dataSqlCtxHide, true);
}

// 结果表：点单元格复制，点「加载更多」继续画（表是整体重画的，必须走委托）
if (dataSqlTableEl) {
    dataSqlTableEl.addEventListener('click', (e) => {
        const more = e.target.closest ? e.target.closest('[data-datasql-more]') : null;
        if (more) {
            dataSqlAppendRows(DATASQL_BATCH);
            return;
        }
        const td = e.target.closest ? e.target.closest('td') : null;
        if (!td || !dataSqlTableEl.contains(td)) return;
        if (td.parentElement && td.parentElement.classList.contains('stats-more')) return;
        dataSqlCopyCell(td);
    });
}

// 滚到接近底部就把下一批画上，滚起来不会「先白一下再冒出来」
const dataSqlResultWrap = dataSqlTableEl && dataSqlTableEl.closest
    ? dataSqlTableEl.closest('.sheet-table-wrap') : null;
if (dataSqlResultWrap) {
    dataSqlResultWrap.addEventListener('scroll', () => {
        if (!dataSqlResult || dataSqlRendered >= dataSqlResult.rowCount) return;
        const gap = dataSqlResultWrap.scrollHeight - dataSqlResultWrap.scrollTop - dataSqlResultWrap.clientHeight;
        if (gap < 120) dataSqlAppendRows(DATASQL_BATCH);
    }, { passive: true });
}

// 数据预览同理：滚到底继续画下一批，点「加载更多」也行
const dataSqlPreviewScroll = dataSqlPreviewTable && dataSqlPreviewTable.closest
    ? dataSqlPreviewTable.closest('.datasql-preview-scroll') : null;
if (dataSqlPreviewScroll) {
    dataSqlPreviewScroll.addEventListener('scroll', () => {
        if (!dataSqlParsed || !dataSqlParsed.rows) return;
        const gap = dataSqlPreviewScroll.scrollHeight - dataSqlPreviewScroll.scrollTop - dataSqlPreviewScroll.clientHeight;
        if (gap > 120) return;
        if (dataSqlPreviewRows >= Math.min(dataSqlParsed.rows.length, DATASQL_PREVIEW_MAX)) return;
        dataSqlAppendPreview(DATASQL_PREVIEW_BATCH);
    }, { passive: true });
}
if (dataSqlPreviewTable) {
    dataSqlPreviewTable.addEventListener('click', (e) => {
        const more = e.target.closest ? e.target.closest('[data-datasql-pmore]') : null;
        if (more) {
            dataSqlAppendPreview(DATASQL_PREVIEW_BATCH);
            return;
        }
        // 点表头 = 把这个列名插到 SQL 光标处（不用手打中文列名）
        const th = e.target.closest ? e.target.closest('th[data-col]') : null;
        if (th) {
            dataSqlInsertColumn(th.dataset.col);
            return;
        }
        // 点单元格复制原值：预览里看到脏数据，正好复制出去改
        const td = e.target.closest ? e.target.closest('td') : null;
        if (!td || !dataSqlPreviewTable.contains(td)) return;
        if (td.parentElement && td.parentElement.classList.contains('stats-more')) return;
        dataSqlCopyCell(td);
    });
}

/* ------------------------------ 列类型（参考 MySQL） ------------------------------ */

const dataSqlTypesBtn = document.getElementById('dataSqlTypesBtn');
const dataSqlTypesCount = document.getElementById('dataSqlTypesCount');
const dataSqlTypesPop = document.getElementById('dataSqlTypesPop');
const dataSqlTypesList = document.getElementById('dataSqlTypesList');
const dataSqlTypesClose = document.getElementById('dataSqlTypesClose');
const dataSqlTypeInferBtn = document.getElementById('dataSqlTypeInfer');
const dataSqlTypeDdlBtn = document.getElementById('dataSqlTypeDdl');

let dataSqlTypes = [];              // 当前每列的类型（推断 + 手动覆盖之后）
let dataSqlTypeOverrides = {};      // 手动改过的：列名 -> 类型，换数据也留着
let dataSqlTypeKey = '';            // 表头签名：只有换了表才重新推断

const DATASQL_CHEVRON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"'
    + ' stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
    + '<polyline points="6 9 12 15 18 9"/></svg>';

const DATASQL_NUM_BASES = {
    TINYINT: 1, SMALLINT: 1, INT: 1, BIGINT: 1, DECIMAL: 1, DOUBLE: 1, FLOAT: 1, BOOLEAN: 1
};

function dataSqlUpdateTypeBadge() {
    if (!dataSqlTypesCount) return;
    dataSqlTypesCount.textContent = dataSqlTypes.length ? String(dataSqlTypes.length) : '';
}

/**
 * 推断 + 套用手动覆盖。
 * 只有表头变了才重新推断：改一个数据格、改一句 SQL 都不该把类型全刷一遍
 * （推断本身是 5 万行全扫长度 + 500 行采样，重跑一次 ~10 ms，但没必要）。
 */
function dataSqlSyncTypes(parsed, names) {
    if (!Sql || typeof Sql.inferColumnTypes !== 'function') return;
    if (!parsed || !parsed.cols || !parsed.rows.length) {
        dataSqlTypes = [];
        dataSqlTypeKey = '';
        dataSqlUpdateTypeBadge();
        return;
    }
    const cols = names && names.length ? names : (parsed.header && parsed.header.length
        ? parsed.header
        : Array.from({ length: parsed.cols }, (_, i) => 'c' + (i + 1)));
    const key = cols.join('\u0001');
    if (key === dataSqlTypeKey && dataSqlTypes.length) return;
    dataSqlTypeKey = key;
    const inferred = Sql.inferColumnTypes({ header: cols, rows: parsed.rows, cols: parsed.cols });
    dataSqlTypes = inferred.cols.map((col) => {
        const over = dataSqlTypeOverrides[col.name];
        if (!over) return col;
        return Object.assign({}, col, { type: over, base: String(over).replace(/\(.*/, '') });
    });
    dataSqlUpdateTypeBadge();
    if (dataSqlTypesPop && !dataSqlTypesPop.hidden) dataSqlRenderTypes();
}

function dataSqlRenderTypes() {
    if (!dataSqlTypesList) return;
    if (!dataSqlTypes.length) {
        dataSqlTypesList.innerHTML = '<div class="datasql-types-empty">'
            + dataSqlEsc(dataSqlT('dataSqlTypeEmpty', '还没有列')) + '</div>';
        return;
    }
    let html = '';
    dataSqlTypes.forEach((col, i) => {
        const candidates = Sql && Sql.typeCandidates ? Sql.typeCandidates(col) : [col.type];
        let opts = '';
        candidates.forEach((type) => {
            opts += '<div class="custom-option' + (type === col.type ? ' selected' : '')
                + '" data-value="' + dataSqlEsc(type) + '">' + dataSqlEsc(type) + '</div>';
        });
        html += '<div class="datasql-type-row">'
            + '<span class="datasql-type-name" title="' + dataSqlEsc(col.name) + '">'
            + dataSqlEsc(col.name) + '</span>'
            + '<div class="custom-select select-compact datasql-type-pick" data-col="' + i + '">'
            + '<div class="custom-select-trigger" role="button" tabindex="0" aria-haspopup="listbox">'
            + '<span class="label">' + dataSqlEsc(col.type) + '</span>' + DATASQL_CHEVRON
            + '</div>'
            + '<div class="custom-select-options" role="listbox">' + opts + '</div>'
            + '</div></div>';
    });
    dataSqlTypesList.innerHTML = html;
}

function dataSqlPositionTypes() {
    if (!dataSqlTypesPop || !dataSqlTypesBtn || dataSqlTypesPop.hidden) return;
    const box = dataSqlTypesBtn.getBoundingClientRect();
    const w = dataSqlTypesPop.offsetWidth || 340;
    const h = dataSqlTypesPop.offsetHeight || 320;
    let left = Math.min(box.right - w, window.innerWidth - w - 8);
    left = Math.max(8, left);
    let top = box.bottom + 6;
    if (top + h > window.innerHeight - 8) top = Math.max(8, box.top - h - 6);
    dataSqlTypesPop.style.left = left + 'px';
    dataSqlTypesPop.style.top = top + 'px';
}

function dataSqlOpenTypes() {
    if (!dataSqlTypesPop || !dataSqlTypesBtn) return;
    dataSqlRenderTypes();
    dataSqlTypesPop.hidden = false;
    dataSqlTypesBtn.classList.add('active');
    dataSqlPositionTypes();
}

function dataSqlCloseTypes() {
    if (!dataSqlTypesPop) return;
    dataSqlTypesPop.hidden = true;
    if (dataSqlTypesBtn) dataSqlTypesBtn.classList.remove('active');
    if (dataSqlTypesList) {
        dataSqlTypesList.querySelectorAll('.custom-select.open').forEach((el) => el.classList.remove('open'));
        dataSqlTypesList.querySelectorAll('.custom-select-trigger.active').forEach((el) => el.classList.remove('active'));
    }
}

function dataSqlSetColumnType(index, type) {
    const col = dataSqlTypes[index];
    if (!col || !type || col.type === type) return;
    col.type = type;
    col.base = String(type).replace(/\(.*/, '');
    dataSqlTypeOverrides[col.name] = type;
    dataSqlRenderTypes();
    dataSqlPositionTypes();
    // 对齐跟着类型走：手动把数字列改成 VARCHAR，右对齐也该跟着取消
    if (dataSqlResult) {
        delete dataSqlResult._numCols;
        dataSqlRendered = 0;
        dataSqlRenderResult();
        dataSqlAppendRows(DATASQL_BATCH);
    }
    showToast(dataSqlFmt('dataSqlToastType', { name: col.name, type: type }, ''));
}

async function dataSqlCopyDdl() {
    if (!dataSqlTypes.length) {
        showToast(dataSqlT('dataSqlTypeEmpty', '还没有列'), 'error');
        return;
    }
    try {
        await writeClipboardText(Sql.toCreateTable(dataSqlTypes, 't'));
        showToast(dataSqlT('dataSqlToastDdl', '已复制 CREATE TABLE'));
    } catch (err) {
        showToast(String((err && err.message) || err), 'error');
    }
}

if (dataSqlTypesBtn) {
    dataSqlTypesBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (dataSqlTypesPop && !dataSqlTypesPop.hidden) dataSqlCloseTypes();
        else dataSqlOpenTypes();
    });
}
if (dataSqlTypesClose) dataSqlTypesClose.addEventListener('click', dataSqlCloseTypes);
if (dataSqlTypeInferBtn) {
    dataSqlTypeInferBtn.addEventListener('click', () => {
        dataSqlTypeOverrides = {};
        dataSqlTypeKey = '';
        dataSqlSyncTypes(dataSqlParse());
        dataSqlRenderTypes();
        dataSqlPositionTypes();
    });
}
if (dataSqlTypeDdlBtn) dataSqlTypeDdlBtn.addEventListener('click', dataSqlCopyDdl);

// 面板内的开合与选项：面板内容每次重建，必须走委托
if (dataSqlTypesList) {
    dataSqlTypesList.addEventListener('click', (e) => {
        e.stopPropagation();
        const pick = e.target.closest ? e.target.closest('.datasql-type-pick') : null;
        if (!pick) return;
        const option = e.target.closest('.custom-option');
        const onTrigger = !!(e.target.closest && e.target.closest('.custom-select-trigger'));
        if (!option && !onTrigger) return;
        if (option) {
            dataSqlSetColumnType(Number(pick.dataset.col), option.dataset.value);
            pick.classList.remove('open');
            const trig = pick.querySelector('.custom-select-trigger');
            if (trig) trig.classList.remove('active');
            return;
        }
        // 一次只开一个：面板里十来列，同时摊开就看不见了
        dataSqlTypesList.querySelectorAll('.custom-select').forEach((el) => {
            if (el !== pick) el.classList.remove('open');
        });
        dataSqlTypesList.querySelectorAll('.custom-select-trigger').forEach((el) => {
            if (el.parentElement !== pick) el.classList.remove('active');
        });
        pick.classList.toggle('open');
        const trigger = pick.querySelector('.custom-select-trigger');
        if (trigger) trigger.classList.toggle('active');
        dataSqlPositionTypes();
    });
    dataSqlTypesList.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') dataSqlCloseTypes();
    });
}

// 点面板外面 / 按 Esc 都收起来
document.addEventListener('click', (e) => {
    if (!dataSqlTypesPop || dataSqlTypesPop.hidden) return;
    if (dataSqlTypesPop.contains(e.target)) return;
    if (dataSqlTypesBtn && dataSqlTypesBtn.contains(e.target)) return;
    dataSqlCloseTypes();
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dataSqlTypesPop && !dataSqlTypesPop.hidden) dataSqlCloseTypes();
});
window.addEventListener('resize', dataSqlPositionTypes);

/*
 * 这一页的文案表（DATASQL_I18N）在 18-flow.js 末尾那次 applyI18n() 之后才定义，
 * 所以首屏那一遍扫不到本页的 data-i18n / placeholder / title —— 表现是输入框里
 * 一行灰字提示、按钮提示全空着，切一次语言才齐全。这里补扫一遍。
 */
if (typeof applyI18n === 'function') applyI18n();
