/* 24-json.js — JSON 格式化页
 *
 * 左边贴 JSON，右边出结果。看起来和别的页一样，难点全在「大文件」上：
 *
 *  1. 输入：超过 4 MB 不进 CodeMirror。实测 4 MB 原文 setValue 144 ms、键入 ~20 ms，
 *     能编辑；再大就改用「文件名 + 体积 + 行数 + 开头预览」，要手改点「仍要编辑」。
 *  2. 格式化：超过 300 KB 走 DBXJson.formatAsync —— 每片最多占主线程 12 ms，
 *     中间把控制权交回浏览器，所以界面照常响应，还能看进度、能取消。
 *  3. 结果：超过 10 MB 才不塞进编辑器（4 MB 原文美化后约 8 MB，属于「照常着色」）。
 *     更大的只渲染前 1 MB / 6000 行，完整内容留在内存里，导出不受影响。
 *  4. 复制：超过 128 KB 不写剪贴板（几 MB 塞进剪贴板会卡住宿主，也常粘不出来），
 *     按钮直接变成「导出」，走宿主 fileTransfer 存文件。
 *
 * 格式化内核在 ui/js/jsonfmt.js（window.DBXJson，纯函数 + 可续跑扫描器）。
 */
/* eslint-disable no-unused-vars */

const JSON_I18N = {
    'zh-CN': {
        navJson: 'JSON 格式化',
        jsonInput: 'JSON 输入', jsonResult: '格式化结果', jsonInHint: '粘贴，或把 .json / .jsonl 拖进来',
        jsonSamples: '示例', jsonSampleApi: '接口返回', jsonSampleDeep: '深层嵌套', jsonSampleJsonl: '每行一条', jsonSampleBroken: '故意写错',
        jsonSortLabel: "排序", jsonSortDefault: "默认", jsonSortAsc: "升序", jsonSortDesc: "降序", jsonRun: '格式化', jsonMinify: '压缩', jsonCopy: '复制', jsonExport: '导出', jsonClear: '清空', jsonImport: "导入", jsonFold: "折叠", jsonUnfold: "展开",
        jsonItemUnit: "项", jsonFoldTooBig: "结果有 {n} 行，折叠已关闭（太大会卡）", jsonFileTooBig: "文件超过 {max}，先切小", jsonImportFail: "读取失败：{e}",
        jsonCellDone: "关闭", jsonCellTitle: "{key} · 第 {row} 行", jsonCellBig: "内容较大，用编辑器查看",
        jsonTable: "表格", jsonTableFieldAll: "全部字段", jsonTableScope: "检索范围", jsonTableSearch: "检索字段值",
        jsonTableColKey: "字段", jsonTableColValue: "值", jsonTableCount: "{shown} / {total} 行 · {cols} 列",
        jsonTableNoMatch: "没有匹配的行", jsonTableTooBig: "内容 {size}，表格上限 {max}",
        jsonEmptyHint: '左边贴 JSON，这里出结果；Ctrl / ⌘ + Enter 直接跑',
        jsonStat: '{size} · {lines} 行 · {nodes} 个值 · 深度 {depth}',
        jsonTiming: '用时 {ms} ms',
        jsonBigTag: '大文件 · 只读预览', jsonPeek: '看开头', jsonForceEdit: '仍要编辑',
        jsonBigMeta: '{size}，约 {lines} 行；超过 {max} 不进编辑器，格式化照常可以跑',
        jsonBigLoaded: '已载入 {name}（{size}）',
        jsonBigPeekNote: '只显示开头 {shown}，全文 {total}',
        jsonForceLoaded: '已载入编辑器，内容很大，编辑可能有点顿',
        jsonForceTooBig: '超过 {max} 就不往编辑器里放了',
        jsonPreviewNote: '结果较大：这里只显示前 {shown}（共 {total}），完整内容点「导出」',
        jsonErrWhere: '第 {line} 行，第 {col} 列', jsonGoto: '定位',
        jsonProgress: '正在格式化 {pct}%', jsonCancel: '取消',
        jsonCopied: '已复制', jsonExported: '已导出 {name}', jsonNothing: '没有可复制的内容', jsonCancelled: '已取消',
        jsonClipHint: '结果较大，将导出为文件',
        jsonErrEmpty: '没有内容', jsonErrTooLarge: '文件太大，先切小再试', jsonErrOutputTooLarge: '格式化结果太大，先切小再试',
        jsonErrExpectValue: '这里该有一个值', jsonErrExpectKey: '对象的键必须是带引号的字符串', jsonErrExpectColon: '键后面少了冒号',
        jsonErrExpectComma: '少了逗号或右括号', jsonErrTrailingComma: '多了一个逗号', jsonErrBadString: '字符串没有正常结束',
        jsonErrBadEscape: '转义写法不对', jsonErrBadNumber: '数字写法不对', jsonErrBadLiteral: '只认 true / false / null',
        jsonErrUnexpectedChar: '这里多了一个字符', jsonErrUnexpectedEnd: '内容提前结束了，括号可能没闭合',
        jsonErrExtraContent: '一个值后面还有内容（多行请每行一条）', jsonErrSortJsonl: '键排序只支持单条 JSON',
        jsonErrSortTooLarge: '文件太大，不做键排序', jsonErrSortBigNumber: '有大整数，键排序会丢精度，已跳过',
        jsonErrUnknown: '解析失败',
        jsonWarnSortBigNumber: "有大整数，保精度已跳过键排序，其余照常格式化",
        jsonWarnSortJsonl: "每行一条时不做键排序，已按原顺序输出",
        jsonWarnSortTooLarge: "文件较大，键排序已跳过，其余照常格式化",
        jsonWarnSortFailed: "键排序没跑成，已按原顺序输出"
    },
    'zh-TW': {
        navJson: 'JSON 格式化',
        jsonInput: 'JSON 輸入', jsonResult: '格式化結果', jsonInHint: '貼上，或把 .json / .jsonl 拖進來',
        jsonSamples: '範例', jsonSampleApi: '介面回傳', jsonSampleDeep: '深層巢狀', jsonSampleJsonl: '每行一筆', jsonSampleBroken: '故意寫錯',
        jsonSortLabel: "排序", jsonSortDefault: "預設", jsonSortAsc: "升序", jsonSortDesc: "降序", jsonRun: '格式化', jsonMinify: '壓縮', jsonCopy: '複製', jsonExport: '匯出', jsonClear: '清空', jsonImport: "匯入", jsonFold: "摺疊", jsonUnfold: "展開",
        jsonItemUnit: "項", jsonFoldTooBig: "結果有 {n} 行，摺疊已關閉（太大會卡）", jsonFileTooBig: "檔案超過 {max}，先切小", jsonImportFail: "讀取失敗：{e}",
        jsonCellDone: "關閉", jsonCellTitle: "{key} · 第 {row} 列", jsonCellBig: "內容較大，用編輯器檢視",
        jsonTable: "表格", jsonTableFieldAll: "全部欄位", jsonTableScope: "檢索範圍", jsonTableSearch: "檢索欄位值",
        jsonTableColKey: "欄位", jsonTableColValue: "值", jsonTableCount: "{shown} / {total} 列 · {cols} 欄",
        jsonTableNoMatch: "沒有符合的列", jsonTableTooBig: "內容 {size}，表格上限 {max}",
        jsonEmptyHint: '左邊貼 JSON，這裡出結果；Ctrl / ⌘ + Enter 直接跑',
        jsonStat: '{size} · {lines} 行 · {nodes} 個值 · 深度 {depth}',
        jsonTiming: '耗時 {ms} ms',
        jsonBigTag: '大檔 · 唯讀預覽', jsonPeek: '看開頭', jsonForceEdit: '仍要編輯',
        jsonBigMeta: '{size}，約 {lines} 行；超過 {max} 不進編輯器，格式化照常可以跑',
        jsonBigLoaded: '已載入 {name}（{size}）',
        jsonBigPeekNote: '只顯示開頭 {shown}，全文 {total}',
        jsonForceLoaded: '已載入編輯器，內容很大，編輯可能有點頓',
        jsonForceTooBig: '超過 {max} 就不往編輯器裡放了',
        jsonPreviewNote: '結果較大：這裡只顯示前 {shown}（共 {total}），完整內容點「匯出」',
        jsonErrWhere: '第 {line} 行，第 {col} 欄', jsonGoto: '定位',
        jsonProgress: '正在格式化 {pct}%', jsonCancel: '取消',
        jsonCopied: '已複製', jsonExported: '已匯出 {name}', jsonNothing: '沒有可複製的內容', jsonCancelled: '已取消',
        jsonClipHint: '結果較大，將匯出為檔案',
        jsonErrEmpty: '沒有內容', jsonErrTooLarge: '檔案太大，先切小再試', jsonErrOutputTooLarge: '格式化結果太大，先切小再試',
        jsonErrExpectValue: '這裡該有一個值', jsonErrExpectKey: '物件的鍵必須是加引號的字串', jsonErrExpectColon: '鍵後面少了冒號',
        jsonErrExpectComma: '少了逗號或右括號', jsonErrTrailingComma: '多了一個逗號', jsonErrBadString: '字串沒有正常結束',
        jsonErrBadEscape: '跳脫寫法不對', jsonErrBadNumber: '數字寫法不對', jsonErrBadLiteral: '只認 true / false / null',
        jsonErrUnexpectedChar: '這裡多了一個字元', jsonErrUnexpectedEnd: '內容提早結束，括號可能沒閉合',
        jsonErrExtraContent: '一個值後面還有內容（多行請每行一筆）', jsonErrSortJsonl: '鍵排序只支援單筆 JSON',
        jsonErrSortTooLarge: '檔案太大，不做鍵排序', jsonErrSortBigNumber: '有大整數，鍵排序會丟精度，已跳過',
        jsonErrUnknown: '解析失敗',
        jsonWarnSortBigNumber: "有大整數，保精度已跳過鍵排序，其餘照常格式化",
        jsonWarnSortJsonl: "每行一筆時不做鍵排序，已按原順序輸出",
        jsonWarnSortTooLarge: "檔案較大，鍵排序已跳過，其餘照常格式化",
        jsonWarnSortFailed: "鍵排序沒跑成，已按原順序輸出"
    },
    en: {
        navJson: 'JSON Formatter',
        jsonInput: 'JSON input', jsonResult: 'Formatted', jsonInHint: 'Paste here, or drop a .json / .jsonl file',
        jsonSamples: 'Samples', jsonSampleApi: 'API response', jsonSampleDeep: 'Deep nesting', jsonSampleJsonl: 'One per line', jsonSampleBroken: 'Deliberate error',
        jsonSortLabel: "Sort", jsonSortDefault: "Default", jsonSortAsc: "A–Z", jsonSortDesc: "Z–A", jsonRun: 'Format', jsonMinify: 'Minify', jsonCopy: 'Copy', jsonExport: 'Export', jsonClear: 'Clear', jsonImport: "Import", jsonFold: "Fold", jsonUnfold: "Unfold",
        jsonItemUnit: "items", jsonFoldTooBig: "Result has {n} lines — folding stays off to keep things fast", jsonFileTooBig: "File is over {max} — split it first", jsonImportFail: "Could not read the file: {e}",
        jsonCellDone: "Close", jsonCellTitle: "{key} · row {row}", jsonCellBig: "Large value — opened in the editor",
        jsonTable: "Table", jsonTableFieldAll: "All fields", jsonTableScope: "Search in", jsonTableSearch: "Search values",
        jsonTableColKey: "Field", jsonTableColValue: "Value", jsonTableCount: "{shown} / {total} rows · {cols} cols",
        jsonTableNoMatch: "No matching rows", jsonTableTooBig: "Content is {size} — table view is capped at {max}",
        jsonEmptyHint: 'Paste JSON on the left and the result shows up here; Ctrl / ⌘ + Enter runs it',
        jsonStat: '{size} · {lines} lines · {nodes} values · depth {depth}',
        jsonTiming: '{ms} ms',
        jsonBigTag: 'Large file · read-only', jsonPeek: 'Peek', jsonForceEdit: 'Edit anyway',
        jsonBigMeta: '{size}, about {lines} lines; over {max} it stays out of the editor, formatting still works',
        jsonBigLoaded: 'Loaded {name} ({size})',
        jsonBigPeekNote: 'Showing the first {shown} of {total}',
        jsonForceLoaded: 'Loaded into the editor — it is large, editing may lag',
        jsonForceTooBig: 'Over {max} it will not go into the editor',
        jsonPreviewNote: 'Large result: showing the first {shown} of {total}, use Export for the whole thing',
        jsonErrWhere: 'line {line}, column {col}', jsonGoto: 'Go to',
        jsonProgress: 'Formatting {pct}%', jsonCancel: 'Cancel',
        jsonCopied: 'Copied', jsonExported: 'Exported {name}', jsonNothing: 'Nothing to copy', jsonCancelled: 'Cancelled',
        jsonClipHint: 'Result is large — it will be exported',
        jsonErrEmpty: 'Nothing here', jsonErrTooLarge: 'File too large — split it first', jsonErrOutputTooLarge: 'Output too large — split the input first',
        jsonErrExpectValue: 'A value is expected here', jsonErrExpectKey: 'Object keys must be quoted strings', jsonErrExpectColon: 'Missing colon after the key',
        jsonErrExpectComma: 'Missing comma or closing bracket', jsonErrTrailingComma: 'Trailing comma', jsonErrBadString: 'String is not terminated',
        jsonErrBadEscape: 'Bad escape sequence', jsonErrBadNumber: 'Bad number', jsonErrBadLiteral: 'Only true / false / null',
        jsonErrUnexpectedChar: 'Unexpected character', jsonErrUnexpectedEnd: 'Input ended early — a bracket is probably unclosed',
        jsonErrExtraContent: 'Extra content after the value (for many values, put one per line)', jsonErrSortJsonl: 'Key sorting only works on a single JSON value',
        jsonErrSortTooLarge: 'Too large for key sorting', jsonErrSortBigNumber: 'Big integers present — key sorting would lose precision, skipped',
        jsonErrUnknown: 'Could not parse',
        jsonWarnSortBigNumber: "Big integers found — key sorting skipped to keep precision; everything else is formatted",
        jsonWarnSortJsonl: "Key sorting is skipped for one-per-line input; original order kept",
        jsonWarnSortTooLarge: "File is large — key sorting skipped, the rest is formatted",
        jsonWarnSortFailed: "Key sorting failed; original order kept"
    },
    az: {
        navJson: 'JSON formatlama',
        jsonInput: 'JSON girişi', jsonResult: 'Nəticə', jsonInHint: 'Buraya yapışdırın və ya .json / .jsonl faylını atın',
        jsonSamples: 'Nümunələr', jsonSampleApi: 'API cavabı', jsonSampleDeep: 'Dərin iç-içə', jsonSampleJsonl: 'Hər sətirdə bir', jsonSampleBroken: 'Qəsdən xətalı',
        jsonSortLabel: "Sıra", jsonSortDefault: "Susmaya", jsonSortAsc: "Artan", jsonSortDesc: "Azalan", jsonRun: 'Formatla', jsonMinify: 'Sıx', jsonCopy: 'Kopyala', jsonExport: 'İxrac et', jsonClear: 'Təmizlə', jsonImport: "İdxal", jsonFold: "Yığ", jsonUnfold: "Aç",
        jsonItemUnit: "element", jsonFoldTooBig: "Nəticə {n} sətirdir — donmamaq üçün yığma söndürüldü", jsonFileTooBig: "Fayl {max} -dən böyükdür — əvvəlcə bölün", jsonImportFail: "Fayl oxunmadı: {e}",
        jsonCellDone: "Bağla", jsonCellTitle: "{key} · {row}-ci sətir", jsonCellBig: "Böyük dəyər — redaktorda açılır",
        jsonTable: "Cədvəl", jsonTableFieldAll: "Bütün sahələr", jsonTableScope: "Axtarış yeri", jsonTableSearch: "Dəyərlərdə axtar",
        jsonTableColKey: "Sahə", jsonTableColValue: "Dəyər", jsonTableCount: "{shown} / {total} sətir · {cols} sütun",
        jsonTableNoMatch: "Uyğun sətir yoxdur", jsonTableTooBig: "Məzmun {size} — cədvəl həddi {max}",
        jsonEmptyHint: 'Solda JSON yapışdırın, nəticə burada görünəcək; Ctrl / ⌘ + Enter ilə işə salın',
        jsonStat: '{size} · {lines} sətir · {nodes} dəyər · dərinlik {depth}',
        jsonTiming: '{ms} ms',
        jsonBigTag: 'Böyük fayl · yalnız oxuma', jsonPeek: 'Başlanğıca bax', jsonForceEdit: 'Yenə də redaktə et',
        jsonBigMeta: '{size}, təxminən {lines} sətir; {max} -dən böyük olduqda redaktora yüklənmir, formatlama işləyir',
        jsonBigLoaded: '{name} yükləndi ({size})',
        jsonBigPeekNote: 'Yalnız başlanğıc {shown} göstərilir, hamısı {total}',
        jsonForceLoaded: 'Redaktora yükləndi — çox böyükdür, redaktə gecikə bilər',
        jsonForceTooBig: '{max} -dən böyük məzmun redaktora yüklənmir',
        jsonPreviewNote: 'Nəticə böyükdür: yalnız ilk {shown} göstərilir (cəmi {total}), hamısı üçün «İxrac et»',
        jsonErrWhere: '{line}-ci sətir, {col}-ci sütun', jsonGoto: 'Get',
        jsonProgress: 'Formatlanır {pct}%', jsonCancel: 'Ləğv et',
        jsonCopied: 'Kopyalandı', jsonExported: '{name} ixrac edildi', jsonNothing: 'Kopyalamaq üçün məzmun yoxdur', jsonCancelled: 'Ləğv edildi',
        jsonClipHint: 'Nəticə böyükdür — fayl kimi ixrac ediləcək',
        jsonErrEmpty: 'Məzmun yoxdur', jsonErrTooLarge: 'Fayl çox böyükdür — əvvəlcə bölün', jsonErrOutputTooLarge: 'Nəticə çox böyükdür — girişi bölün',
        jsonErrExpectValue: 'Burada dəyər olmalıdır', jsonErrExpectKey: 'Obyekt açarları dırnaqlı sətir olmalıdır', jsonErrExpectColon: 'Açardan sonra iki nöqtə yoxdur',
        jsonErrExpectComma: 'Vergül və ya bağlayıcı mötərizə yoxdur', jsonErrTrailingComma: 'Artıq vergül', jsonErrBadString: 'Sətir düzgün bitmir',
        jsonErrBadEscape: 'Escape yazılışı səhvdir', jsonErrBadNumber: 'Rəqəm yazılışı səhvdir', jsonErrBadLiteral: 'Yalnız true / false / null',
        jsonErrUnexpectedChar: 'Gözlənilməz simvol', jsonErrUnexpectedEnd: 'Məzmun tez bitdi — mötərizə bağlanmayıb',
        jsonErrExtraContent: 'Dəyərdən sonra artıq məzmun var (çoxsətirlidə hər sətirdə bir)', jsonErrSortJsonl: 'Açar sıralaması yalnız tək JSON üçündür',
        jsonErrSortTooLarge: 'Fayl böyükdür, açar sıralaması edilmir', jsonErrSortBigNumber: 'Böyük tam ədədlər var — dəqiqlik itərdi, keçildi',
        jsonErrUnknown: 'Analiz alınmadı',
        jsonWarnSortBigNumber: "Böyük tam ədədlər var — dəqiqlik üçün açar sıralaması keçildi, qalanı formatlandı",
        jsonWarnSortJsonl: "Hər sətirdə bir olduqda açar sıralaması edilmir, orijinal sıra saxlanıldı",
        jsonWarnSortTooLarge: "Fayl böyükdür — açar sıralaması keçildi, qalanı formatlandı",
        jsonWarnSortFailed: "Açar sıralaması alınmadı, orijinal sıra saxlanıldı"
    },
    es: {
        navJson: 'Formato JSON',
        jsonInput: 'JSON de entrada', jsonResult: 'Resultado', jsonInHint: 'Pega aquí o suelta un .json / .jsonl',
        jsonSamples: 'Ejemplos', jsonSampleApi: 'Respuesta de API', jsonSampleDeep: 'Anidado profundo', jsonSampleJsonl: 'Uno por línea', jsonSampleBroken: 'Error a propósito',
        jsonSortLabel: "Orden", jsonSortDefault: "Original", jsonSortAsc: "A–Z", jsonSortDesc: "Z–A", jsonRun: 'Formatear', jsonMinify: 'Minificar', jsonCopy: 'Copiar', jsonExport: 'Exportar', jsonClear: 'Limpiar', jsonImport: "Importar", jsonFold: "Plegar", jsonUnfold: "Desplegar",
        jsonItemUnit: "elementos", jsonFoldTooBig: "El resultado tiene {n} líneas: plegado desactivado para no bloquear", jsonFileTooBig: "El archivo supera {max}: divídelo", jsonImportFail: "No se pudo leer: {e}",
        jsonCellDone: "Cerrar", jsonCellTitle: "{key} · fila {row}", jsonCellBig: "Valor grande: se abre en el editor",
        jsonTable: "Tabla", jsonTableFieldAll: "Todos los campos", jsonTableScope: "Buscar en", jsonTableSearch: "Buscar valores",
        jsonTableColKey: "Campo", jsonTableColValue: "Valor", jsonTableCount: "{shown} / {total} filas · {cols} columnas",
        jsonTableNoMatch: "Ninguna fila coincide", jsonTableTooBig: "El contenido ocupa {size}; la tabla llega a {max}",
        jsonEmptyHint: 'Pega JSON a la izquierda y el resultado aparece aquí; Ctrl / ⌘ + Enter lo ejecuta',
        jsonStat: '{size} · {lines} líneas · {nodes} valores · profundidad {depth}',
        jsonTiming: '{ms} ms',
        jsonBigTag: 'Archivo grande · solo lectura', jsonPeek: 'Ver inicio', jsonForceEdit: 'Editar igual',
        jsonBigMeta: '{size}, unas {lines} líneas; por encima de {max} no entra al editor, formatear sigue funcionando',
        jsonBigLoaded: 'Cargado {name} ({size})',
        jsonBigPeekNote: 'Solo se muestra el inicio {shown} de {total}',
        jsonForceLoaded: 'Cargado en el editor: es grande, editar puede ir lento',
        jsonForceTooBig: 'Por encima de {max} no entra al editor',
        jsonPreviewNote: 'Resultado grande: solo se muestra {shown} de {total}; usa Exportar para todo',
        jsonErrWhere: 'línea {line}, columna {col}', jsonGoto: 'Ir',
        jsonProgress: 'Formateando {pct}%', jsonCancel: 'Cancelar',
        jsonCopied: 'Copiado', jsonExported: 'Exportado {name}', jsonNothing: 'Nada que copiar', jsonCancelled: 'Cancelado',
        jsonClipHint: 'El resultado es grande: se exportará',
        jsonErrEmpty: 'No hay contenido', jsonErrTooLarge: 'Archivo demasiado grande: divídelo', jsonErrOutputTooLarge: 'Salida demasiado grande: divide la entrada',
        jsonErrExpectValue: 'Aquí falta un valor', jsonErrExpectKey: 'Las claves deben ser cadenas entre comillas', jsonErrExpectColon: 'Falta dos puntos tras la clave',
        jsonErrExpectComma: 'Falta coma o corchete de cierre', jsonErrTrailingComma: 'Coma sobrante', jsonErrBadString: 'La cadena no termina',
        jsonErrBadEscape: 'Secuencia de escape incorrecta', jsonErrBadNumber: 'Número incorrecto', jsonErrBadLiteral: 'Solo true / false / null',
        jsonErrUnexpectedChar: 'Carácter inesperado', jsonErrUnexpectedEnd: 'El contenido termina antes: falta cerrar un corchete',
        jsonErrExtraContent: 'Hay contenido extra tras el valor (una por línea si son varios)', jsonErrSortJsonl: 'Ordenar claves solo funciona con un único JSON',
        jsonErrSortTooLarge: 'Demasiado grande para ordenar claves', jsonErrSortBigNumber: 'Hay enteros grandes: ordenar perdería precisión, omitido',
        jsonErrUnknown: 'No se pudo analizar',
        jsonWarnSortBigNumber: "Hay enteros grandes: se omite ordenar claves para no perder precisión; el resto se formatea",
        jsonWarnSortJsonl: "Con uno por línea no se ordenan claves; se mantiene el orden original",
        jsonWarnSortTooLarge: "Archivo grande: se omite ordenar claves, el resto se formatea",
        jsonWarnSortFailed: "No se pudo ordenar claves; se mantiene el orden original"
    },
    id: {
        navJson: 'Format JSON',
        jsonInput: 'Input JSON', jsonResult: 'Hasil', jsonInHint: 'Tempel di sini, atau jatuhkan .json / .jsonl',
        jsonSamples: 'Contoh', jsonSampleApi: 'Respons API', jsonSampleDeep: 'Bersarang dalam', jsonSampleJsonl: 'Satu per baris', jsonSampleBroken: 'Sengaja salah',
        jsonSortLabel: "Urutan", jsonSortDefault: "Asli", jsonSortAsc: "A–Z", jsonSortDesc: "Z–A", jsonRun: 'Format', jsonMinify: 'Padatkan', jsonCopy: 'Salin', jsonExport: 'Ekspor', jsonClear: 'Hapus', jsonImport: "Impor", jsonFold: "Lipat", jsonUnfold: "Bentangkan",
        jsonItemUnit: "item", jsonFoldTooBig: "Hasil {n} baris — pelipatan dimatikan agar tidak berat", jsonFileTooBig: "Berkas melebihi {max} — pecah dulu", jsonImportFail: "Gagal membaca: {e}",
        jsonCellDone: "Tutup", jsonCellTitle: "{key} · baris {row}", jsonCellBig: "Nilai besar — dibuka di editor",
        jsonTable: "Tabel", jsonTableFieldAll: "Semua kolom", jsonTableScope: "Cari di", jsonTableSearch: "Cari nilai",
        jsonTableColKey: "Kolom", jsonTableColValue: "Nilai", jsonTableCount: "{shown} / {total} baris · {cols} kolom",
        jsonTableNoMatch: "Tidak ada baris yang cocok", jsonTableTooBig: "Isi {size} — tabel dibatasi {max}",
        jsonEmptyHint: 'Tempel JSON di kiri, hasilnya muncul di sini; Ctrl / ⌘ + Enter untuk menjalankan',
        jsonStat: '{size} · {lines} baris · {nodes} nilai · kedalaman {depth}',
        jsonTiming: '{ms} ms',
        jsonBigTag: 'Berkas besar · hanya baca', jsonPeek: 'Lihat awal', jsonForceEdit: 'Tetap edit',
        jsonBigMeta: '{size}, sekitar {lines} baris; di atas {max} tidak masuk editor, format tetap jalan',
        jsonBigLoaded: '{name} dimuat ({size})',
        jsonBigPeekNote: 'Hanya menampilkan awal {shown} dari {total}',
        jsonForceLoaded: 'Dimuat ke editor — isinya besar, mengedit bisa tersendat',
        jsonForceTooBig: 'Di atas {max} tidak dimasukkan ke editor',
        jsonPreviewNote: 'Hasil besar: hanya menampilkan {shown} dari {total}, pakai Ekspor untuk semuanya',
        jsonErrWhere: 'baris {line}, kolom {col}', jsonGoto: 'Ke sana',
        jsonProgress: 'Memformat {pct}%', jsonCancel: 'Batal',
        jsonCopied: 'Disalin', jsonExported: '{name} diekspor', jsonNothing: 'Tidak ada yang bisa disalin', jsonCancelled: 'Dibatalkan',
        jsonClipHint: 'Hasil besar — akan diekspor',
        jsonErrEmpty: 'Tidak ada isi', jsonErrTooLarge: 'Berkas terlalu besar — pecah dulu', jsonErrOutputTooLarge: 'Hasil terlalu besar — pecah inputnya',
        jsonErrExpectValue: 'Di sini harus ada nilai', jsonErrExpectKey: 'Kunci objek harus string bertanda kutip', jsonErrExpectColon: 'Kurang titik dua setelah kunci',
        jsonErrExpectComma: 'Kurang koma atau kurung tutup', jsonErrTrailingComma: 'Koma berlebih', jsonErrBadString: 'String tidak ditutup',
        jsonErrBadEscape: 'Escape salah', jsonErrBadNumber: 'Angka salah', jsonErrBadLiteral: 'Hanya true / false / null',
        jsonErrUnexpectedChar: 'Karakter tak terduga', jsonErrUnexpectedEnd: 'Isi berakhir terlalu cepat — kurung belum ditutup',
        jsonErrExtraContent: 'Ada isi tambahan setelah nilai (banyak nilai: satu per baris)', jsonErrSortJsonl: 'Urut kunci hanya untuk satu JSON',
        jsonErrSortTooLarge: 'Terlalu besar untuk mengurutkan kunci', jsonErrSortBigNumber: 'Ada bilangan bulat besar — presisi bisa hilang, dilewati',
        jsonErrUnknown: 'Gagal mengurai',
        jsonWarnSortBigNumber: "Ada bilangan bulat besar — pengurutan kunci dilewati demi presisi, sisanya diformat",
        jsonWarnSortJsonl: "Satu per baris tidak diurutkan kuncinya; urutan asli dipertahankan",
        jsonWarnSortTooLarge: "Berkas besar — pengurutan kunci dilewati, sisanya diformat",
        jsonWarnSortFailed: "Pengurutan kunci gagal; urutan asli dipertahankan"
    },
    it: {
        navJson: 'Formato JSON',
        jsonInput: 'JSON in ingresso', jsonResult: 'Risultato', jsonInHint: 'Incolla qui o trascina un .json / .jsonl',
        jsonSamples: 'Esempi', jsonSampleApi: 'Risposta API', jsonSampleDeep: 'Annidamento profondo', jsonSampleJsonl: 'Uno per riga', jsonSampleBroken: 'Errore voluto',
        jsonSortLabel: "Ordine", jsonSortDefault: "Originale", jsonSortAsc: "A–Z", jsonSortDesc: "Z–A", jsonRun: 'Formatta', jsonMinify: 'Minifica', jsonCopy: 'Copia', jsonExport: 'Esporta', jsonClear: 'Pulisci', jsonImport: "Importa", jsonFold: "Comprimi", jsonUnfold: "Espandi",
        jsonItemUnit: "elementi", jsonFoldTooBig: "Il risultato ha {n} righe: compressione disattivata per non bloccare", jsonFileTooBig: "Il file supera {max}: dividilo", jsonImportFail: "Lettura non riuscita: {e}",
        jsonCellDone: "Chiudi", jsonCellTitle: "{key} · riga {row}", jsonCellBig: "Valore grande: aperto nell'editor",
        jsonTable: "Tabella", jsonTableFieldAll: "Tutti i campi", jsonTableScope: "Cerca in", jsonTableSearch: "Cerca valori",
        jsonTableColKey: "Campo", jsonTableColValue: "Valore", jsonTableCount: "{shown} / {total} righe · {cols} colonne",
        jsonTableNoMatch: "Nessuna riga corrisponde", jsonTableTooBig: "Contenuto {size}: la tabella arriva a {max}",
        jsonEmptyHint: 'Incolla JSON a sinistra, il risultato appare qui; Ctrl / ⌘ + Enter per eseguire',
        jsonStat: '{size} · {lines} righe · {nodes} valori · profondità {depth}',
        jsonTiming: '{ms} ms',
        jsonBigTag: 'File grande · sola lettura', jsonPeek: 'Vedi inizio', jsonForceEdit: 'Modifica comunque',
        jsonBigMeta: '{size}, circa {lines} righe; oltre {max} non entra nell’editor, la formattazione funziona lo stesso',
        jsonBigLoaded: 'Caricato {name} ({size})',
        jsonBigPeekNote: 'Mostrato solo l’inizio {shown} di {total}',
        jsonForceLoaded: 'Caricato nell’editor — è grande, la modifica può rallentare',
        jsonForceTooBig: 'Oltre {max} non va nell’editor',
        jsonPreviewNote: 'Risultato grande: mostro {shown} di {total}, usa Esporta per tutto',
        jsonErrWhere: 'riga {line}, colonna {col}', jsonGoto: 'Vai',
        jsonProgress: 'Formattazione {pct}%', jsonCancel: 'Annulla',
        jsonCopied: 'Copiato', jsonExported: 'Esportato {name}', jsonNothing: 'Niente da copiare', jsonCancelled: 'Annullato',
        jsonClipHint: 'Il risultato è grande — verrà esportato',
        jsonErrEmpty: 'Nessun contenuto', jsonErrTooLarge: 'File troppo grande — dividilo', jsonErrOutputTooLarge: 'Risultato troppo grande — dividi l’input',
        jsonErrExpectValue: 'Qui serve un valore', jsonErrExpectKey: 'Le chiavi devono essere stringhe tra virgolette', jsonErrExpectColon: 'Manca i due punti dopo la chiave',
        jsonErrExpectComma: 'Manca una virgola o la chiusura', jsonErrTrailingComma: 'Virgola in più', jsonErrBadString: 'Stringa non chiusa',
        jsonErrBadEscape: 'Sequenza di escape errata', jsonErrBadNumber: 'Numero errato', jsonErrBadLiteral: 'Solo true / false / null',
        jsonErrUnexpectedChar: 'Carattere inatteso', jsonErrUnexpectedEnd: 'Il contenuto finisce prima — manca una chiusura',
        jsonErrExtraContent: 'Contenuto extra dopo il valore (più valori: uno per riga)', jsonErrSortJsonl: 'L’ordinamento chiavi vale solo per un JSON',
        jsonErrSortTooLarge: 'Troppo grande per ordinare le chiavi', jsonErrSortBigNumber: 'Ci sono interi grandi — l’ordine perderebbe precisione, saltato',
        jsonErrUnknown: 'Analisi non riuscita',
        jsonWarnSortBigNumber: "Ci sono interi grandi: ordinamento chiavi saltato per non perdere precisione, il resto è formattato",
        jsonWarnSortJsonl: "Con uno per riga non si ordinano le chiavi; ordine originale mantenuto",
        jsonWarnSortTooLarge: "File grande: ordinamento chiavi saltato, il resto è formattato",
        jsonWarnSortFailed: "Ordinamento chiavi non riuscito; ordine originale mantenuto"
    },
    ja: {
        navJson: 'JSON 整形',
        jsonInput: 'JSON 入力', jsonResult: '整形結果', jsonInHint: 'ここに貼り付け、または .json / .jsonl をドロップ',
        jsonSamples: 'サンプル', jsonSampleApi: 'API レスポンス', jsonSampleDeep: '深いネスト', jsonSampleJsonl: '1 行 1 件', jsonSampleBroken: 'わざとエラー',
        jsonSortLabel: "並べ替え", jsonSortDefault: "そのまま", jsonSortAsc: "昇順", jsonSortDesc: "降順", jsonRun: '整形', jsonMinify: '圧縮', jsonCopy: 'コピー', jsonExport: '書き出し', jsonClear: 'クリア', jsonImport: "読み込み", jsonFold: "折りたたむ", jsonUnfold: "展開",
        jsonItemUnit: "項目", jsonFoldTooBig: "結果が {n} 行あるため、折りたたみは無効にしています（重くなるため）", jsonFileTooBig: "ファイルが {max} を超えています。分割してください", jsonImportFail: "読み込みに失敗しました：{e}",
        jsonCellDone: "閉じる", jsonCellTitle: "{key} · {row} 行目", jsonCellBig: "大きい値はエディタで表示します",
        jsonTable: "表", jsonTableFieldAll: "すべての項目", jsonTableScope: "検索範囲", jsonTableSearch: "値を検索",
        jsonTableColKey: "項目", jsonTableColValue: "値", jsonTableCount: "{shown} / {total} 行 · {cols} 列",
        jsonTableNoMatch: "一致する行がありません", jsonTableTooBig: "内容は {size}、表の上限は {max}",
        jsonEmptyHint: '左に JSON を貼ると結果がここに出ます。Ctrl / ⌘ + Enter で実行',
        jsonStat: '{size} · {lines} 行 · {nodes} 個の値 · 深さ {depth}',
        jsonTiming: '{ms} ms',
        jsonBigTag: '大きなファイル · 読み取り専用', jsonPeek: '先頭を見る', jsonForceEdit: 'それでも編集',
        jsonBigMeta: '{size}、約 {lines} 行。{max} を超えるとエディタには載せませんが、整形は実行できます',
        jsonBigLoaded: '{name} を読み込みました（{size}）',
        jsonBigPeekNote: '先頭 {shown} のみ表示（全体 {total}）',
        jsonForceLoaded: 'エディタに読み込みました。大きいので編集は重くなる場合があります',
        jsonForceTooBig: '{max} を超えるものはエディタに載せません',
        jsonPreviewNote: '結果が大きいため、先頭 {shown} のみ表示（全体 {total}）。全体は「書き出し」で',
        jsonErrWhere: '{line} 行 {col} 列', jsonGoto: '移動',
        jsonProgress: '整形中 {pct}%', jsonCancel: '中止',
        jsonCopied: 'コピーしました', jsonExported: '{name} を書き出しました', jsonNothing: 'コピーする内容がありません', jsonCancelled: '中止しました',
        jsonClipHint: '結果が大きいためファイルに書き出します',
        jsonErrEmpty: '内容がありません', jsonErrTooLarge: 'ファイルが大きすぎます。分割してください', jsonErrOutputTooLarge: '結果が大きすぎます。入力を分割してください',
        jsonErrExpectValue: 'ここには値が必要です', jsonErrExpectKey: 'オブジェクトのキーは引用符付き文字列です', jsonErrExpectColon: 'キーの後にコロンがありません',
        jsonErrExpectComma: 'カンマか閉じ括弧がありません', jsonErrTrailingComma: '余分なカンマ', jsonErrBadString: '文字列が閉じていません',
        jsonErrBadEscape: 'エスケープの書き方が違います', jsonErrBadNumber: '数値の書き方が違います', jsonErrBadLiteral: 'true / false / null のみ',
        jsonErrUnexpectedChar: '想定外の文字', jsonErrUnexpectedEnd: '途中で終わっています。括弧が閉じていません',
        jsonErrExtraContent: '値の後に余分な内容があります（複数は 1 行 1 件）', jsonErrSortJsonl: 'キー並べ替えは単一 JSON のみ',
        jsonErrSortTooLarge: '大きすぎるためキー並べ替えはしません', jsonErrSortBigNumber: '大きな整数があるため精度が落ちます。並べ替えは省略',
        jsonErrUnknown: '解析できませんでした',
        jsonWarnSortBigNumber: "大きな整数があるため、精度を保つためキー並べ替えを省略しました（他は整形済み）",
        jsonWarnSortJsonl: "1 行 1 件ではキー並べ替えをしません。元の順序のまま出力しました",
        jsonWarnSortTooLarge: "ファイルが大きいためキー並べ替えを省略しました（他は整形済み）",
        jsonWarnSortFailed: "キー並べ替えに失敗しました。元の順序のまま出力しました"
    },
    ko: {
        navJson: 'JSON 정리',
        jsonInput: 'JSON 입력', jsonResult: '정리 결과', jsonInHint: '여기에 붙여넣거나 .json / .jsonl 을 끌어다 놓으세요',
        jsonSamples: '예시', jsonSampleApi: 'API 응답', jsonSampleDeep: '깊은 중첩', jsonSampleJsonl: '한 줄에 하나', jsonSampleBroken: '일부러 오류',
        jsonSortLabel: "정렬", jsonSortDefault: "기본", jsonSortAsc: "오름차순", jsonSortDesc: "내림차순", jsonRun: '정리', jsonMinify: '압축', jsonCopy: '복사', jsonExport: '내보내기', jsonClear: '지우기', jsonImport: "가져오기", jsonFold: "접기", jsonUnfold: "펼치기",
        jsonItemUnit: "개", jsonFoldTooBig: "결과가 {n}줄이라 접기를 꺼 두었습니다(무거워짐)", jsonFileTooBig: "파일이 {max} 를 넘습니다. 먼저 나누세요", jsonImportFail: "읽지 못했습니다: {e}",
        jsonCellDone: "닫기", jsonCellTitle: "{key} · {row}행", jsonCellBig: "값이 커서 편집기로 표시합니다",
        jsonTable: "표", jsonTableFieldAll: "전체 필드", jsonTableScope: "검색 범위", jsonTableSearch: "값 검색",
        jsonTableColKey: "필드", jsonTableColValue: "값", jsonTableCount: "{shown} / {total} 행 · {cols} 열",
        jsonTableNoMatch: "일치하는 행이 없습니다", jsonTableTooBig: "내용 {size}, 표 상한 {max}",
        jsonEmptyHint: '왼쪽에 JSON을 붙여넣으면 결과가 여기에 나옵니다. Ctrl / ⌘ + Enter 로 실행',
        jsonStat: '{size} · {lines}줄 · {nodes}개 값 · 깊이 {depth}',
        jsonTiming: '{ms} ms',
        jsonBigTag: '큰 파일 · 읽기 전용', jsonPeek: '앞부분 보기', jsonForceEdit: '그래도 편집',
        jsonBigMeta: '{size}, 약 {lines}줄. {max} 를 넘으면 편집기에 올리지 않지만 정리는 그대로 됩니다',
        jsonBigLoaded: '{name} 불러옴 ({size})',
        jsonBigPeekNote: '앞부분 {shown} 만 표시 (전체 {total})',
        jsonForceLoaded: '편집기에 올렸습니다. 내용이 커서 편집이 느릴 수 있습니다',
        jsonForceTooBig: '{max} 를 넘으면 편집기에 올리지 않습니다',
        jsonPreviewNote: '결과가 커서 앞부분 {shown} 만 표시합니다 (전체 {total}). 전체는 "내보내기"',
        jsonErrWhere: '{line}행 {col}열', jsonGoto: '이동',
        jsonProgress: '정리 중 {pct}%', jsonCancel: '취소',
        jsonCopied: '복사했습니다', jsonExported: '{name} 내보냈습니다', jsonNothing: '복사할 내용이 없습니다', jsonCancelled: '취소했습니다',
        jsonClipHint: '결과가 커서 파일로 내보냅니다',
        jsonErrEmpty: '내용이 없습니다', jsonErrTooLarge: '파일이 너무 큽니다. 먼저 나누세요', jsonErrOutputTooLarge: '결과가 너무 큽니다. 입력을 나누세요',
        jsonErrExpectValue: '여기에 값이 필요합니다', jsonErrExpectKey: '객체 키는 따옴표 문자열이어야 합니다', jsonErrExpectColon: '키 뒤에 콜론이 없습니다',
        jsonErrExpectComma: '쉼표나 닫는 괄호가 없습니다', jsonErrTrailingComma: '쉼표가 남았습니다', jsonErrBadString: '문자열이 닫히지 않았습니다',
        jsonErrBadEscape: '이스케이프 표기가 잘못됐습니다', jsonErrBadNumber: '숫자 표기가 잘못됐습니다', jsonErrBadLiteral: 'true / false / null 만 됩니다',
        jsonErrUnexpectedChar: '예상치 못한 문자', jsonErrUnexpectedEnd: '내용이 일찍 끝났습니다. 괄호가 닫히지 않았습니다',
        jsonErrExtraContent: '값 뒤에 내용이 더 있습니다 (여러 개는 한 줄에 하나)', jsonErrSortJsonl: '키 정렬은 단일 JSON 만 됩니다',
        jsonErrSortTooLarge: '너무 커서 키 정렬을 하지 않습니다', jsonErrSortBigNumber: '큰 정수가 있어 정밀도가 떨어집니다. 정렬 생략',
        jsonErrUnknown: '해석하지 못했습니다',
        jsonWarnSortBigNumber: "큰 정수가 있어 정밀도를 위해 키 정렬을 건너뛰었습니다(나머지는 정리됨)",
        jsonWarnSortJsonl: "한 줄에 하나일 때는 키 정렬을 하지 않습니다. 원래 순서로 출력했습니다",
        jsonWarnSortTooLarge: "파일이 커서 키 정렬을 건너뛰었습니다(나머지는 정리됨)",
        jsonWarnSortFailed: "키 정렬에 실패했습니다. 원래 순서로 출력했습니다"
    },
    pt: {
        navJson: 'Formato JSON',
        jsonInput: 'JSON de entrada', jsonResult: 'Resultado', jsonInHint: 'Cole aqui ou solte um .json / .jsonl',
        jsonSamples: 'Exemplos', jsonSampleApi: 'Resposta de API', jsonSampleDeep: 'Aninhamento profundo', jsonSampleJsonl: 'Um por linha', jsonSampleBroken: 'Erro de propósito',
        jsonSortLabel: "Ordem", jsonSortDefault: "Original", jsonSortAsc: "A–Z", jsonSortDesc: "Z–A", jsonRun: 'Formatar', jsonMinify: 'Minificar', jsonCopy: 'Copiar', jsonExport: 'Exportar', jsonClear: 'Limpar', jsonImport: "Importar", jsonFold: "Recolher", jsonUnfold: "Expandir",
        jsonItemUnit: "itens", jsonFoldTooBig: "O resultado tem {n} linhas: recolhimento desativado para não travar", jsonFileTooBig: "O arquivo passa de {max}: divida antes", jsonImportFail: "Falha ao ler: {e}",
        jsonCellDone: "Fechar", jsonCellTitle: "{key} · linha {row}", jsonCellBig: "Valor grande — aberto no editor",
        jsonTable: "Tabela", jsonTableFieldAll: "Todos os campos", jsonTableScope: "Buscar em", jsonTableSearch: "Buscar valores",
        jsonTableColKey: "Campo", jsonTableColValue: "Valor", jsonTableCount: "{shown} / {total} linhas · {cols} colunas",
        jsonTableNoMatch: "Nenhuma linha corresponde", jsonTableTooBig: "Conteúdo {size} — tabela limitada a {max}",
        jsonEmptyHint: 'Cole o JSON à esquerda e o resultado aparece aqui; Ctrl / ⌘ + Enter executa',
        jsonStat: '{size} · {lines} linhas · {nodes} valores · profundidade {depth}',
        jsonTiming: '{ms} ms',
        jsonBigTag: 'Arquivo grande · somente leitura', jsonPeek: 'Ver início', jsonForceEdit: 'Editar mesmo assim',
        jsonBigMeta: '{size}, cerca de {lines} linhas; acima de {max} não entra no editor, formatar continua funcionando',
        jsonBigLoaded: 'Carregado {name} ({size})',
        jsonBigPeekNote: 'Mostrando apenas o início {shown} de {total}',
        jsonForceLoaded: 'Carregado no editor — é grande, editar pode ficar lento',
        jsonForceTooBig: 'Acima de {max} não vai para o editor',
        jsonPreviewNote: 'Resultado grande: mostrando {shown} de {total}; use Exportar para tudo',
        jsonErrWhere: 'linha {line}, coluna {col}', jsonGoto: 'Ir',
        jsonProgress: 'Formatando {pct}%', jsonCancel: 'Cancelar',
        jsonCopied: 'Copiado', jsonExported: 'Exportado {name}', jsonNothing: 'Nada para copiar', jsonCancelled: 'Cancelado',
        jsonClipHint: 'O resultado é grande — será exportado',
        jsonErrEmpty: 'Sem conteúdo', jsonErrTooLarge: 'Arquivo grande demais — divida antes', jsonErrOutputTooLarge: 'Saída grande demais — divida a entrada',
        jsonErrExpectValue: 'Falta um valor aqui', jsonErrExpectKey: 'Chaves de objeto precisam de aspas', jsonErrExpectColon: 'Faltam dois-pontos após a chave',
        jsonErrExpectComma: 'Falta vírgula ou fechamento', jsonErrTrailingComma: 'Vírgula sobrando', jsonErrBadString: 'A string não termina',
        jsonErrBadEscape: 'Escape inválido', jsonErrBadNumber: 'Número inválido', jsonErrBadLiteral: 'Só true / false / null',
        jsonErrUnexpectedChar: 'Caractere inesperado', jsonErrUnexpectedEnd: 'O conteúdo termina antes — falta fechar um colchete',
        jsonErrExtraContent: 'Conteúdo extra após o valor (vários: um por linha)', jsonErrSortJsonl: 'Ordenar chaves só vale para um JSON',
        jsonErrSortTooLarge: 'Grande demais para ordenar chaves', jsonErrSortBigNumber: 'Há inteiros grandes — ordenar perderia precisão, ignorado',
        jsonErrUnknown: 'Não foi possível analisar',
        jsonWarnSortBigNumber: "Há inteiros grandes: ordenação de chaves ignorada para manter a precisão; o resto foi formatado",
        jsonWarnSortJsonl: "Com um por linha não se ordenam chaves; ordem original mantida",
        jsonWarnSortTooLarge: "Arquivo grande: ordenação de chaves ignorada, o resto foi formatado",
        jsonWarnSortFailed: "Não foi possível ordenar chaves; ordem original mantida"
    },
    pl: {
        navJson: 'Formatowanie JSON',
        jsonInput: 'Wejście JSON', jsonResult: 'Wynik', jsonInHint: 'Wklej tutaj lub przeciągnij .json / .jsonl',
        jsonSamples: 'Przykłady', jsonSampleApi: 'Odpowiedź API', jsonSampleDeep: 'Głębokie zagnieżdżenie', jsonSampleJsonl: 'Jeden na wiersz', jsonSampleBroken: 'Celowy błąd',
        jsonSortLabel: "Kolejność", jsonSortDefault: "Domyślnie", jsonSortAsc: "Rosnąco", jsonSortDesc: "Malejąco", jsonRun: 'Formatuj', jsonMinify: 'Minifikuj', jsonCopy: 'Kopiuj', jsonExport: 'Eksportuj', jsonClear: 'Wyczyść', jsonImport: "Importuj", jsonFold: "Zwiń", jsonUnfold: "Rozwiń",
        jsonItemUnit: "elementów", jsonFoldTooBig: "Wynik ma {n} wierszy — zwijanie wyłączone, żeby nie zamulało", jsonFileTooBig: "Plik przekracza {max} — najpierw podziel", jsonImportFail: "Nie udało się odczytać: {e}",
        jsonCellDone: "Zamknij", jsonCellTitle: "{key} · wiersz {row}", jsonCellBig: "Duża wartość — otwarta w edytorze",
        jsonTable: "Tabela", jsonTableFieldAll: "Wszystkie pola", jsonTableScope: "Szukaj w", jsonTableSearch: "Szukaj wartości",
        jsonTableColKey: "Pole", jsonTableColValue: "Wartość", jsonTableCount: "{shown} / {total} wierszy · {cols} kolumn",
        jsonTableNoMatch: "Brak pasujących wierszy", jsonTableTooBig: "Zawartość {size} — tabela do {max}",
        jsonEmptyHint: 'Wklej JSON po lewej, wynik pojawi się tutaj; Ctrl / ⌘ + Enter uruchamia',
        jsonStat: '{size} · {lines} wierszy · {nodes} wartości · głębokość {depth}',
        jsonTiming: '{ms} ms',
        jsonBigTag: 'Duży plik · tylko odczyt', jsonPeek: 'Podejrzyj początek', jsonForceEdit: 'Mimo to edytuj',
        jsonBigMeta: '{size}, około {lines} wierszy; powyżej {max} nie trafia do edytora, formatowanie nadal działa',
        jsonBigLoaded: 'Wczytano {name} ({size})',
        jsonBigPeekNote: 'Pokazano tylko początek {shown} z {total}',
        jsonForceLoaded: 'Wczytano do edytora — jest duży, edycja może zwalniać',
        jsonForceTooBig: 'Powyżej {max} nie trafi do edytora',
        jsonPreviewNote: 'Duży wynik: pokazano {shown} z {total}, całość przez „Eksportuj”',
        jsonErrWhere: 'wiersz {line}, kolumna {col}', jsonGoto: 'Przejdź',
        jsonProgress: 'Formatowanie {pct}%', jsonCancel: 'Anuluj',
        jsonCopied: 'Skopiowano', jsonExported: 'Wyeksportowano {name}', jsonNothing: 'Nie ma czego kopiować', jsonCancelled: 'Anulowano',
        jsonClipHint: 'Wynik jest duży — zostanie wyeksportowany',
        jsonErrEmpty: 'Brak treści', jsonErrTooLarge: 'Plik za duży — najpierw podziel', jsonErrOutputTooLarge: 'Wynik za duży — podziel wejście',
        jsonErrExpectValue: 'Tutaj powinna być wartość', jsonErrExpectKey: 'Klucze obiektu muszą być w cudzysłowach', jsonErrExpectColon: 'Brak dwukropka po kluczu',
        jsonErrExpectComma: 'Brak przecinka lub nawiasu zamykającego', jsonErrTrailingComma: 'Zbędny przecinek', jsonErrBadString: 'Ciąg nie jest zamknięty',
        jsonErrBadEscape: 'Zły zapis escape', jsonErrBadNumber: 'Zły zapis liczby', jsonErrBadLiteral: 'Tylko true / false / null',
        jsonErrUnexpectedChar: 'Nieoczekiwany znak', jsonErrUnexpectedEnd: 'Treść kończy się wcześniej — nawias niezamknięty',
        jsonErrExtraContent: 'Po wartości jest dodatkowa treść (wiele: jeden na wiersz)', jsonErrSortJsonl: 'Sortowanie kluczy tylko dla jednego JSON',
        jsonErrSortTooLarge: 'Za duże na sortowanie kluczy', jsonErrSortBigNumber: 'Są duże liczby całkowite — sortowanie traci precyzję, pominięto',
        jsonErrUnknown: 'Nie udało się przetworzyć',
        jsonWarnSortBigNumber: "Są duże liczby całkowite — sortowanie kluczy pominięto dla precyzji, reszta sformatowana",
        jsonWarnSortJsonl: "Przy jednym na wiersz nie sortujemy kluczy; zachowano kolejność oryginalną",
        jsonWarnSortTooLarge: "Plik jest duży — sortowanie kluczy pominięto, resztę sformatowano",
        jsonWarnSortFailed: "Sortowanie kluczy nie udało się; zachowano kolejność oryginalną"
    },
    ru: {
        navJson: 'Форматирование JSON',
        jsonInput: 'Входной JSON', jsonResult: 'Результат', jsonInHint: 'Вставьте сюда или перетащите .json / .jsonl',
        jsonSamples: 'Примеры', jsonSampleApi: 'Ответ API', jsonSampleDeep: 'Глубокая вложенность', jsonSampleJsonl: 'По одному в строке', jsonSampleBroken: 'Специально с ошибкой',
        jsonSortLabel: "Порядок", jsonSortDefault: "Как есть", jsonSortAsc: "А–Я", jsonSortDesc: "Я–А", jsonRun: 'Форматировать', jsonMinify: 'Сжать', jsonCopy: 'Копировать', jsonExport: 'Экспорт', jsonClear: 'Очистить', jsonImport: "Импорт", jsonFold: "Свернуть", jsonUnfold: "Развернуть",
        jsonItemUnit: "элем.", jsonFoldTooBig: "В результате {n} строк — сворачивание отключено, чтобы не тормозило", jsonFileTooBig: "Файл больше {max} — разделите его", jsonImportFail: "Не удалось прочитать: {e}",
        jsonCellDone: "Закрыть", jsonCellTitle: "{key} · строка {row}", jsonCellBig: "Большое значение — открыто в редакторе",
        jsonTable: "Таблица", jsonTableFieldAll: "Все поля", jsonTableScope: "Искать в", jsonTableSearch: "Поиск по значениям",
        jsonTableColKey: "Поле", jsonTableColValue: "Значение", jsonTableCount: "{shown} / {total} строк · {cols} столбцов",
        jsonTableNoMatch: "Нет подходящих строк", jsonTableTooBig: "Содержимое {size} — таблица до {max}",
        jsonEmptyHint: 'Вставьте JSON слева, результат появится здесь; Ctrl / ⌘ + Enter запускает',
        jsonStat: '{size} · {lines} строк · {nodes} значений · глубина {depth}',
        jsonTiming: '{ms} ms',
        jsonBigTag: 'Большой файл · только чтение', jsonPeek: 'Показать начало', jsonForceEdit: 'Всё равно редактировать',
        jsonBigMeta: '{size}, около {lines} строк; больше {max} не попадает в редактор, форматирование работает',
        jsonBigLoaded: 'Загружен {name} ({size})',
        jsonBigPeekNote: 'Показано только начало {shown} из {total}',
        jsonForceLoaded: 'Загружено в редактор — файл большой, правка может тормозить',
        jsonForceTooBig: 'Больше {max} в редактор не попадёт',
        jsonPreviewNote: 'Результат большой: показано {shown} из {total}, полностью — через «Экспорт»',
        jsonErrWhere: 'строка {line}, столбец {col}', jsonGoto: 'Перейти',
        jsonProgress: 'Форматирование {pct}%', jsonCancel: 'Отмена',
        jsonCopied: 'Скопировано', jsonExported: 'Экспортирован {name}', jsonNothing: 'Нечего копировать', jsonCancelled: 'Отменено',
        jsonClipHint: 'Результат большой — будет экспортирован',
        jsonErrEmpty: 'Нет содержимого', jsonErrTooLarge: 'Файл слишком большой — разделите его', jsonErrOutputTooLarge: 'Результат слишком большой — разделите вход',
        jsonErrExpectValue: 'Здесь должно быть значение', jsonErrExpectKey: 'Ключи объекта должны быть в кавычках', jsonErrExpectColon: 'После ключа нет двоеточия',
        jsonErrExpectComma: 'Нет запятой или закрывающей скобки', jsonErrTrailingComma: 'Лишняя запятая', jsonErrBadString: 'Строка не закрыта',
        jsonErrBadEscape: 'Неверная escape-последовательность', jsonErrBadNumber: 'Неверная запись числа', jsonErrBadLiteral: 'Только true / false / null',
        jsonErrUnexpectedChar: 'Неожиданный символ', jsonErrUnexpectedEnd: 'Содержимое закончилось раньше — скобка не закрыта',
        jsonErrExtraContent: 'После значения есть лишнее (несколько — по одному в строке)', jsonErrSortJsonl: 'Сортировка ключей только для одного JSON',
        jsonErrSortTooLarge: 'Слишком большой для сортировки ключей', jsonErrSortBigNumber: 'Есть большие целые — сортировка потеряет точность, пропущено',
        jsonErrUnknown: 'Не удалось разобрать',
        jsonWarnSortBigNumber: "Есть большие целые — сортировка ключей пропущена ради точности, остальное отформатировано",
        jsonWarnSortJsonl: "При «по одному в строке» ключи не сортируются; порядок сохранён",
        jsonWarnSortTooLarge: "Файл большой — сортировка ключей пропущена, остальное отформатировано",
        jsonWarnSortFailed: "Сортировка ключей не удалась; порядок сохранён"
    },
    th: {
        navJson: 'จัดรูปแบบ JSON',
        jsonInput: 'JSON ขาเข้า', jsonResult: 'ผลลัพธ์', jsonInHint: 'วางที่นี่ หรือลากไฟล์ .json / .jsonl มาวาง',
        jsonSamples: 'ตัวอย่าง', jsonSampleApi: 'ผลตอบกลับ API', jsonSampleDeep: 'ซ้อนกันลึก', jsonSampleJsonl: 'บรรทัดละรายการ', jsonSampleBroken: 'ผิดโดยตั้งใจ',
        jsonSortLabel: "ลำดับ", jsonSortDefault: "ค่าเริ่มต้น", jsonSortAsc: "น้อยไปมาก", jsonSortDesc: "มากไปน้อย", jsonRun: 'จัดรูปแบบ', jsonMinify: 'บีบอัด', jsonCopy: 'คัดลอก', jsonExport: 'ส่งออก', jsonClear: 'ล้าง', jsonImport: "นำเข้า", jsonFold: "พับ", jsonUnfold: "ขยาย",
        jsonItemUnit: "รายการ", jsonFoldTooBig: "ผลลัพธ์มี {n} บรรทัด ปิดการพับไว้เพื่อไม่ให้หน่วง", jsonFileTooBig: "ไฟล์เกิน {max} แบ่งก่อน", jsonImportFail: "อ่านไฟล์ไม่สำเร็จ: {e}",
        jsonCellDone: "ปิด", jsonCellTitle: "{key} · แถว {row}", jsonCellBig: "ค่าขนาดใหญ่ แสดงในเอดิเตอร์",
        jsonTable: "ตาราง", jsonTableFieldAll: "ทุกฟิลด์", jsonTableScope: "ค้นหาใน", jsonTableSearch: "ค้นหาค่า",
        jsonTableColKey: "ฟิลด์", jsonTableColValue: "ค่า", jsonTableCount: "{shown} / {total} แถว · {cols} คอลัมน์",
        jsonTableNoMatch: "ไม่มีแถวที่ตรงกัน", jsonTableTooBig: "เนื้อหา {size} ตารางรับได้ถึง {max}",
        jsonEmptyHint: 'วาง JSON ทางซ้าย ผลลัพธ์จะขึ้นที่นี่; Ctrl / ⌘ + Enter เพื่อรัน',
        jsonStat: '{size} · {lines} บรรทัด · {nodes} ค่า · ความลึก {depth}',
        jsonTiming: '{ms} ms',
        jsonBigTag: 'ไฟล์ใหญ่ · อ่านอย่างเดียว', jsonPeek: 'ดูตอนต้น', jsonForceEdit: 'แก้ไขต่อไป',
        jsonBigMeta: '{size} ประมาณ {lines} บรรทัด; เกิน {max} จะไม่โหลดเข้าเอดิเตอร์ แต่จัดรูปแบบได้',
        jsonBigLoaded: 'โหลด {name} แล้ว ({size})',
        jsonBigPeekNote: 'แสดงเฉพาะตอนต้น {shown} จาก {total}',
        jsonForceLoaded: 'โหลดเข้าเอดิเตอร์แล้ว ไฟล์ใหญ่ การแก้ไขอาจหน่วง',
        jsonForceTooBig: 'เกิน {max} จะไม่โหลดเข้าเอดิเตอร์',
        jsonPreviewNote: 'ผลลัพธ์ใหญ่: แสดง {shown} จาก {total} ใช้ «ส่งออก» เพื่อดูทั้งหมด',
        jsonErrWhere: 'บรรทัด {line} คอลัมน์ {col}', jsonGoto: 'ไปที่',
        jsonProgress: 'กำลังจัดรูปแบบ {pct}%', jsonCancel: 'ยกเลิก',
        jsonCopied: 'คัดลอกแล้ว', jsonExported: 'ส่งออก {name} แล้ว', jsonNothing: 'ไม่มีอะไรให้คัดลอก', jsonCancelled: 'ยกเลิกแล้ว',
        jsonClipHint: 'ผลลัพธ์ใหญ่ จะส่งออกเป็นไฟล์',
        jsonErrEmpty: 'ไม่มีเนื้อหา', jsonErrTooLarge: 'ไฟล์ใหญ่เกินไป แบ่งก่อน', jsonErrOutputTooLarge: 'ผลลัพธ์ใหญ่เกินไป แบ่งข้อมูลขาเข้า',
        jsonErrExpectValue: 'ตรงนี้ต้องมีค่า', jsonErrExpectKey: 'คีย์ของออบเจ็กต์ต้องเป็นสตริงในเครื่องหมายคำพูด', jsonErrExpectColon: 'ขาดเครื่องหมายทวิภาคหลังคีย์',
        jsonErrExpectComma: 'ขาดจุลภาคหรือวงเล็บปิด', jsonErrTrailingComma: 'มีจุลภาคเกิน', jsonErrBadString: 'สตริงไม่ปิด',
        jsonErrBadEscape: 'การ escape ไม่ถูกต้อง', jsonErrBadNumber: 'รูปแบบตัวเลขไม่ถูกต้อง', jsonErrBadLiteral: 'รับเฉพาะ true / false / null',
        jsonErrUnexpectedChar: 'มีอักขระเกิน', jsonErrUnexpectedEnd: 'เนื้อหาจบก่อนกำหนด อาจมีวงเล็บไม่ปิด',
        jsonErrExtraContent: 'มีเนื้อหาเกินหลังค่า (หลายค่าควรบรรทัดละหนึ่ง)', jsonErrSortJsonl: 'เรียงคีย์ได้เฉพาะ JSON เดียว',
        jsonErrSortTooLarge: 'ใหญ่เกินไปสำหรับการเรียงคีย์', jsonErrSortBigNumber: 'มีจำนวนเต็มขนาดใหญ่ เรียงแล้วจะเสียความแม่นยำ ข้ามไป',
        jsonErrUnknown: 'แยกวิเคราะห์ไม่สำเร็จ',
        jsonWarnSortBigNumber: "มีจำนวนเต็มขนาดใหญ่ ข้ามการเรียงคีย์เพื่อรักษาความแม่นยำ ส่วนที่เหลือจัดรูปแบบแล้ว",
        jsonWarnSortJsonl: "แบบบรรทัดละรายการจะไม่เรียงคีย์ คงลำดับเดิมไว้",
        jsonWarnSortTooLarge: "ไฟล์ใหญ่ ข้ามการเรียงคีย์ ส่วนที่เหลือจัดรูปแบบแล้ว",
        jsonWarnSortFailed: "เรียงคีย์ไม่สำเร็จ คงลำดับเดิมไว้"
    },
    tr: {
        navJson: 'JSON Biçimlendir',
        jsonInput: 'JSON girişi', jsonResult: 'Sonuç', jsonInHint: 'Buraya yapıştırın veya .json / .jsonl sürükleyin',
        jsonSamples: 'Örnekler', jsonSampleApi: 'API yanıtı', jsonSampleDeep: 'Derin iç içe', jsonSampleJsonl: 'Her satırda bir', jsonSampleBroken: 'Kasten hatalı',
        jsonSortLabel: "Sıra", jsonSortDefault: "Varsayılan", jsonSortAsc: "A–Z", jsonSortDesc: "Z–A", jsonRun: 'Biçimlendir', jsonMinify: 'Sıkıştır', jsonCopy: 'Kopyala', jsonExport: 'Dışa aktar', jsonClear: 'Temizle', jsonImport: "İçe aktar", jsonFold: "Katla", jsonUnfold: "Aç",
        jsonItemUnit: "öğe", jsonFoldTooBig: "Sonuç {n} satır — donmaması için katlama kapalı", jsonFileTooBig: "Dosya {max} üzerinde — önce bölün", jsonImportFail: "Dosya okunamadı: {e}",
        jsonCellDone: "Kapat", jsonCellTitle: "{key} · satır {row}", jsonCellBig: "Büyük değer — düzenleyicide açıldı",
        jsonTable: "Tablo", jsonTableFieldAll: "Tüm alanlar", jsonTableScope: "Arama kapsamı", jsonTableSearch: "Değerlerde ara",
        jsonTableColKey: "Alan", jsonTableColValue: "Değer", jsonTableCount: "{shown} / {total} satır · {cols} sütun",
        jsonTableNoMatch: "Eşleşen satır yok", jsonTableTooBig: "İçerik {size} — tablo sınırı {max}",
        jsonEmptyHint: 'Sola JSON yapıştırın, sonuç burada görünür; Ctrl / ⌘ + Enter çalıştırır',
        jsonStat: '{size} · {lines} satır · {nodes} değer · derinlik {depth}',
        jsonTiming: '{ms} ms',
        jsonBigTag: 'Büyük dosya · salt okunur', jsonPeek: 'Başını gör', jsonForceEdit: 'Yine de düzenle',
        jsonBigMeta: '{size}, yaklaşık {lines} satır; {max} üzeri düzenleyiciye girmez, biçimlendirme yine çalışır',
        jsonBigLoaded: '{name} yüklendi ({size})',
        jsonBigPeekNote: 'Yalnızca baştan {shown} gösteriliyor, toplam {total}',
        jsonForceLoaded: 'Düzenleyiciye yüklendi — büyük, düzenleme yavaşlayabilir',
        jsonForceTooBig: '{max} üzeri düzenleyiciye alınmaz',
        jsonPreviewNote: 'Sonuç büyük: {total} içinden {shown} gösteriliyor, tamamı için «Dışa aktar»',
        jsonErrWhere: 'satır {line}, sütun {col}', jsonGoto: 'Git',
        jsonProgress: 'Biçimlendiriliyor {pct}%', jsonCancel: 'İptal',
        jsonCopied: 'Kopyalandı', jsonExported: '{name} dışa aktarıldı', jsonNothing: 'Kopyalanacak içerik yok', jsonCancelled: 'İptal edildi',
        jsonClipHint: 'Sonuç büyük — dosya olarak aktarılacak',
        jsonErrEmpty: 'İçerik yok', jsonErrTooLarge: 'Dosya çok büyük — önce bölün', jsonErrOutputTooLarge: 'Sonuç çok büyük — girişi bölün',
        jsonErrExpectValue: 'Burada bir değer olmalı', jsonErrExpectKey: 'Nesne anahtarları tırnaklı metin olmalı', jsonErrExpectColon: 'Anahtardan sonra iki nokta yok',
        jsonErrExpectComma: 'Virgül veya kapanış parantezi yok', jsonErrTrailingComma: 'Fazla virgül', jsonErrBadString: 'Metin kapanmıyor',
        jsonErrBadEscape: 'Kaçış dizisi hatalı', jsonErrBadNumber: 'Sayı hatalı', jsonErrBadLiteral: 'Yalnızca true / false / null',
        jsonErrUnexpectedChar: 'Beklenmeyen karakter', jsonErrUnexpectedEnd: 'İçerik erken bitti — bir parantez kapanmamış',
        jsonErrExtraContent: 'Değerden sonra fazla içerik var (çoklu için her satırda bir)', jsonErrSortJsonl: 'Anahtar sıralama tek JSON içindir',
        jsonErrSortTooLarge: 'Anahtar sıralama için çok büyük', jsonErrSortBigNumber: 'Büyük tam sayılar var — sıralama hassasiyeti bozar, atlandı',
        jsonErrUnknown: 'Ayrıştırılamadı',
        jsonWarnSortBigNumber: "Büyük tam sayılar var — hassasiyet için anahtar sıralaması atlandı, gerisi biçimlendirildi",
        jsonWarnSortJsonl: "Her satırda bir olduğunda anahtarlar sıralanmaz; özgün sıra korundu",
        jsonWarnSortTooLarge: "Dosya büyük — anahtar sıralaması atlandı, gerisi biçimlendirildi",
        jsonWarnSortFailed: "Anahtar sıralaması başarısız; özgün sıra korundu"
    }
};

function jsonT(key, vars) {
    const table = JSON_I18N[currentLang] || JSON_I18N.en || {};
    const base = JSON_I18N['zh-CN'] || {};
    let text = table[key] || (JSON_I18N.en && JSON_I18N.en[key]) || base[key] || key;
    if (vars) {
        Object.keys(vars).forEach((k) => {
            text = text.split('{' + k + '}').join(String(vars[k]));
        });
    }
    return text;
}

/* ------------------------------- 页面元素 ------------------------------- */

const jsonWorkspace = document.getElementById('jsonWorkspace');
const navJsonLink = document.getElementById('navJson');
const jsonInputEl = document.getElementById('jsonInput');
const jsonOutputEl = document.getElementById('jsonOutput');
const jsonInWrap = document.getElementById('jsonInEditorWrap');
const jsonOutWrap = document.getElementById('jsonOutEditorWrap');
const jsonInPane = jsonWorkspace ? jsonWorkspace.querySelector('.json-in-pane') : null;
const jsonOutPane = jsonWorkspace ? jsonWorkspace.querySelector('.json-out-pane') : null;
const jsonInBadge = document.getElementById('jsonInBadge');
const jsonOutBadge = document.getElementById('jsonOutBadge');
const jsonStat = document.getElementById('jsonStat');
const jsonTiming = document.getElementById('jsonTiming');
const jsonPreview = document.getElementById('jsonPreview');
const jsonPreviewPre = document.getElementById('jsonPreviewPre');
const jsonPreviewNote = document.getElementById('jsonPreviewNote');
const jsonEmpty = document.getElementById('jsonEmpty');
const jsonErrorBox = document.getElementById('jsonError');
const jsonErrorTitle = document.getElementById('jsonErrorTitle');
const jsonErrorWhere = document.getElementById('jsonErrorWhere');
const jsonErrorSnippet = document.getElementById('jsonErrorSnippet');
const jsonErrorGoto = document.getElementById('jsonErrorGoto');
const jsonBigIn = document.getElementById('jsonBigIn');
const jsonBigInName = document.getElementById('jsonBigInName');
const jsonBigInMeta = document.getElementById('jsonBigInMeta');
const jsonBigInPeek = document.getElementById('jsonBigInPeek');
const jsonBigInForce = document.getElementById('jsonBigInForce');
const jsonBigPeekPre = document.getElementById('jsonBigInPeekPre');
const jsonProgress = document.getElementById('jsonProgress');
const jsonProgressText = document.getElementById('jsonProgressText');
const jsonProgressBar = document.getElementById('jsonProgressBar');
const jsonProgressCancel = document.getElementById('jsonProgressCancel');
const jsonRunBtn = document.getElementById('jsonRun');
const jsonMinifyBtn = document.getElementById('jsonMinifyBtn');
const jsonCopyBtn = document.getElementById('jsonCopy');
const jsonClearBtn = document.getElementById('jsonClear');
const jsonImportBtn = document.getElementById('jsonImport');
const jsonFileInput = document.getElementById('jsonFile');
const jsonFoldBtn = document.getElementById('jsonFold');
const jsonUnfoldBtn = document.getElementById('jsonUnfold');
const jsonIndentTabs = document.getElementById('jsonIndent');
const jsonSort = document.getElementById('jsonSort');
const jsonSortValue = document.getElementById('jsonSortValue');
const jsonSamples = document.getElementById('jsonSamples');

/* --------------------------------- 状态 --------------------------------- */

let jsonModeActive = false;
let jsonInEditor = null;
let jsonOutEditor = null;
let jsonBusy = false;
let jsonTimer = null;
let jsonBadgeTimer = null;
let jsonResizeWatch = null;      // 大文本的徽标体积算得慢，300 ms 防抖
let jsonIndent = 2;
let jsonSortOrder = 'none';     // none | asc | desc
let jsonBig = null;             // { name, text }：大文件模式下的原文
let jsonLast = null;            // 最近一次结果 { ok, text, error, stats, ms, minify }
let jsonAbortSignal = null;
let jsonSeq = 0;                // 输入每变一次 +1，旧的异步结果作废
let jsonSuppress = false;       // 程序化写编辑器时不触发连锁反应
let jsonGotoMark = null;

const JSON_ERR_KEY = {
    empty: 'jsonErrEmpty',
    tooLarge: 'jsonErrTooLarge',
    outputTooLarge: 'jsonErrOutputTooLarge',
    expectValue: 'jsonErrExpectValue',
    expectKey: 'jsonErrExpectKey',
    expectColon: 'jsonErrExpectColon',
    expectComma: 'jsonErrExpectComma',
    trailingComma: 'jsonErrTrailingComma',
    badString: 'jsonErrBadString',
    badEscape: 'jsonErrBadEscape',
    badNumber: 'jsonErrBadNumber',
    badLiteral: 'jsonErrBadLiteral',
    unexpectedChar: 'jsonErrUnexpectedChar',
    unexpectedEnd: 'jsonErrUnexpectedEnd',
    extraContent: 'jsonErrExtraContent',
    sortJsonl: 'jsonErrSortJsonl',
    sortTooLarge: 'jsonErrSortTooLarge',
    sortBigNumber: 'jsonErrSortBigNumber'
};

/* 示例：一个是正常接口返回，一个是深嵌套，一个是 JSONL，一个是「能看出错在哪」的 */
const JSON_SAMPLES = {
    api: '{\n  "code": 0,\n  "msg": "ok",\n  "data": {\n    "total": 2,\n    "items": [\n      { "id": 100000000000000001, "name": "示例 A", "tags": ["x", "y"], "ok": true },\n      { "id": 100000000000000002, "name": "示例 B", "tags": [], "ok": false }\n    ]\n  }\n}',
    deep: '{"a":{"b":{"c":{"d":{"e":[{"f":1},{"g":[true,false,null]}]}}}},"list":[[[1,2],[3]],[4]]}',
    jsonl: '{"id":1,"name":"甲","ok":true}\n{"id":2,"name":"乙","ok":false}\n{"id":3,"name":"丙","ok":true}',
    broken: '{\n  "code": 0,\n  "items": [\n    { "id": 1, "name": "甲" },\n    { "id": 2, "name": "乙" }\n  ]\n  "next": "少了逗号"\n}'
};

/* -------------------------------- 小工具 -------------------------------- */

function jsonNow() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
}

function jsonFmtBytes(n) {
    return DBXJson ? DBXJson.formatBytes(n) : String(n);
}

function jsonCountLines(text) {
    let n = 1;
    for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) n++;
    return n;
}

function jsonIndentValue() {
    return jsonIndent === 'tab' ? '\t' : Number(jsonIndent) || 2;
}

/* ------------------------------ 大小分流判断 ------------------------------ */

function jsonIsBigInput(text) {
    return text.length > DBXJson.LIMITS.cmInput;
}

function jsonClipTooBig(text) {
    return text.length > DBXJson.LIMITS.clipboard;
}

/* -------------------------------- 编辑器 -------------------------------- */

function jsonSyncEditorTheme() {
    if (!window.CodeMirror) return;
    const theme = document.documentElement.getAttribute('data-dbx-theme') === 'dark' ? 'material-darker' : 'default';
    [jsonInEditor, jsonOutEditor].forEach((cm) => {
        if (!cm) return;
        const switching = cm.getOption('theme') !== theme;
        cm.setOption('theme', theme);
        if (!switching) cm.refresh();
    });
}

function ensureJsonInEditor() {
    if (jsonInEditor || !window.CodeMirror || !window.CodeMirror.fromTextArea) return;
    jsonInEditor = CodeMirror.fromTextArea(jsonInputEl, Object.assign({}, commonConfig, {
        mode: 'application/json',
        lineWrapping: true,
        extraKeys: {
            'Cmd-Enter': () => jsonRun('format'),
            'Ctrl-Enter': () => jsonRun('format'),
            'Shift-Cmd-M': () => jsonRun('minify'),
            'Shift-Ctrl-M': () => jsonRun('minify'),
            'Cmd-F': 'findPersistent',
            'Ctrl-F': 'findPersistent',
            'Ctrl-Q': (cm) => cm.foldCode(cm.getCursor())
        }
    }));
    jsonInEditor.on('change', () => {
        if (jsonSuppress) return;
        jsonInputEl.value = jsonInEditor.getValue();
        jsonSeq++;
        jsonScheduleBadge();
        jsonMaybeAuto();
    });
    jsonSyncEditorTheme();
}

function ensureJsonOutEditor() {
    if (jsonOutEditor || !window.CodeMirror || !window.CodeMirror.fromTextArea) return;
    /* JSON 走的是 javascript mode（`application/json` 是它的 MIME），fold helper 按 mode 名
       注册成 'javascript'，gutter 这边不一定认得上——直接点名用 brace 折叠，
       `{` / `[` 该有的三角就都出来了。 */
    const braceFold = (CodeMirror.fold && CodeMirror.fold.brace) || null;
    const foldOpts = {
        widget: function (from, to) {
            if (!jsonOutEditor) return '{ … }';
            const line = jsonOutEditor.getLine(from.line) || '';
            // brace-fold 给的 from.ch 是开括号**后面一位**，直接看这个位置上的字符
            // 永远是空格/换行，数组就被当成对象、显示成 `{ … }`。往回找括号本身。
            const at = Math.max(0, Math.min(from.ch, line.length));
            const openCh = Math.max(line.lastIndexOf('{', at), line.lastIndexOf('[', at));
            const opener = openCh >= 0 ? line.charAt(openCh) : '{';
            const body = opener === '[' ? '[ … ]' : '{ … }';
            // 区间太长就不数了：折叠要的是快，不是精确统计
            if (to.line - from.line > 300) return body;
            const src = jsonOutEditor.getRange(
                { line: from.line, ch: Math.max(0, openCh) },
                { line: to.line, ch: to.ch }
            );
            const n = jsonCountMembers(src);
            // 参考样式：`[ … ]  // 3 items` —— 折起来还能看到里面有几条
            return n > 0 ? body + '  // ' + n + ' ' + jsonT('jsonItemUnit') : body;
        }
    };
    if (braceFold) foldOpts.rangeFinder = braceFold;
    jsonOutEditor = CodeMirror.fromTextArea(jsonOutputEl, Object.assign({}, commonConfig, {
        mode: 'application/json',
        readOnly: true,
        lineWrapping: false,
        styleActiveLine: false,
        autoCloseBrackets: false,
        matchBrackets: false,
        foldGutter: true,
        gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
        /* 折起来显示「{ … } · 8」而不是干巴巴一个省略号：折叠是为了扫结构，
           不告诉里面有几个成员，还得反复展开看 */
        foldOptions: foldOpts,
        extraKeys: {
            'Cmd-F': 'findPersistent',
            'Ctrl-F': 'findPersistent',
            'Ctrl-Q': (cm) => cm.foldCode(cm.getCursor())
        }
    }));
    jsonSyncEditorTheme();
}

/* ------------------------------- 输入的处理 ------------------------------- */

function jsonCurrentText() {
    if (jsonBig) return jsonBig.text;
    if (jsonInEditor) return jsonInEditor.getValue();
    return jsonInputEl ? jsonInputEl.value : '';
}

function jsonUpdateInBadge() {
    if (!jsonInBadge) return;
    const text = jsonCurrentText();
    if (!text) { jsonInBadge.textContent = '0'; return; }
    jsonInBadge.textContent = jsonFmtBytes(DBXJson.utf8Bytes(text));
}

/* 徽标上的体积要扫全文（4 MB 约 20 ms）。大文本再按字敲会一顿一顿的，
   300 ms 防抖，小文本照旧即时更新 */
function jsonScheduleBadge() {
    if (jsonCurrentText().length <= 512 * 1024) {
        clearTimeout(jsonBadgeTimer);
        jsonUpdateInBadge();
        return;
    }
    clearTimeout(jsonBadgeTimer);
    jsonBadgeTimer = setTimeout(jsonUpdateInBadge, 300);
}

/* 进大文件模式：不把几 MB 的文本交给 CodeMirror，只给摘要 */
function jsonUseBig(text, name) {
    jsonBig = { name: name || 'data.json', text: text };
    // 上一份内容还留在编辑器里就清掉，免得切换后看到两份不一样的
    if (jsonInEditor) {
        jsonSuppress = true;
        jsonInEditor.setValue('');
        jsonSuppress = false;
    }
    if (jsonInputEl) jsonInputEl.value = '';
    if (jsonInPane) jsonInPane.classList.add('is-big');
    if (jsonBigIn) jsonBigIn.hidden = false;
    if (jsonBigPeekPre) { jsonBigPeekPre.hidden = true; jsonBigPeekPre.textContent = ''; }
    if (jsonBigInPeek) jsonBigInPeek.setAttribute('aria-expanded', 'false');
    jsonFillBigMeta();
}

function jsonFillBigMeta() {
    if (!jsonBig) return;
    if (jsonBigInName) jsonBigInName.textContent = jsonBig.name;
    if (jsonBigInMeta) {
        const lines = jsonCountLines(jsonBig.text);
        jsonBigInMeta.textContent = jsonT('jsonBigMeta', {
            size: jsonFmtBytes(DBXJson.utf8Bytes(jsonBig.text)),
            lines: lines.toLocaleString(currentLang === 'zh-CN' || currentLang === 'zh-TW' ? 'zh-CN' : undefined),
            max: jsonFmtBytes(DBXJson.LIMITS.cmInput)
        });
    }
}

/* 清空左侧输入：编辑器、大文件摘要卡一起归零（导入 / 拖入前先走这一步） */
function jsonClearInput() {
    jsonBig = null;
    if (jsonInPane) jsonInPane.classList.remove('is-big');
    if (jsonBigIn) jsonBigIn.hidden = true;
    if (jsonBigPeekPre) { jsonBigPeekPre.hidden = true; jsonBigPeekPre.textContent = ''; }
    if (jsonInEditor) {
        jsonSuppress = true;
        if (jsonInEditor.getValue()) jsonInEditor.setValue('');
        jsonSuppress = false;
    }
    if (jsonInputEl) jsonInputEl.value = '';
}

function jsonUseSmall(text) {
    jsonBig = null;
    if (jsonInPane) jsonInPane.classList.remove('is-big');
    if (jsonBigIn) jsonBigIn.hidden = true;
    ensureJsonInEditor();
    if (jsonInEditor) {
        // 一整行几 MB 的输入，matchBrackets 每次键入都要扫到底（实测 120 ms），
        // 超过 512 KB 就不做了——大文件是来看结构的，不是来对括号的
        const heavy = text.length > 512 * 1024;
        if (jsonInEditor.getOption('matchBrackets') === heavy) {
            jsonInEditor.setOption('matchBrackets', !heavy);
        }
        jsonSuppress = true;
        const cur = jsonInEditor.getValue();
        if (cur !== text) jsonInEditor.setValue(text);
        jsonSuppress = false;
    } else if (jsonInputEl) {
        jsonInputEl.value = text;
    }
}

/**
 * 统一入口：拖文件（18-flow）、示例、截图脚本都走这里。
 * 超过 cmInput 就只留摘要——这一步是「不卡死」的第一道闸。
 */
function jsonLoadText(text, name, quiet) {
    const t = String(text == null ? '' : text);
    // 先把左边清干净：上一个文件的内容留在编辑器里，看起来像是「两个文件叠在一起」
    jsonClearInput();
    jsonClearResult();
    jsonSeq++;
    if (jsonIsBigInput(t)) {
        jsonUseBig(t, name || 'data.json');
        if (!quiet) showToast(jsonT('jsonBigLoaded', { name: name || 'data.json', size: jsonFmtBytes(DBXJson.utf8Bytes(t)) }));
        jsonShowIdleHint();
    } else {
        jsonUseSmall(t);
        if (!quiet && name) showToast(jsonT('jsonBigLoaded', { name: name, size: jsonFmtBytes(DBXJson.utf8Bytes(t)) }));
    }
    jsonUpdateInBadge();
    // 导进来 / 拖进来就顺手把结果出来：没人想再点一次「格式化」。
    // 大文件走分片，界面照常能点；停在别的页面时先不跑（别在后台白烧 CPU）
    jsonMaybeAutoRunLoaded(t);
}

/* 导入 / 拖入之后自动跑一次：这是「文件进来就给结果」的那条路径 */
function jsonMaybeAutoRunLoaded(text) {
    if (!text.trim()) return;
    clearTimeout(jsonTimer);
    if (jsonModeActive || text.length <= 2 * 1024 * 1024) {
        jsonRun('format');
        return;
    }
    jsonShowIdleHint();
}

/* 小文件边打字边跑；大文件、或者输入本身很大时不自动跑（一口一口来） */
function jsonMaybeAuto() {
    clearTimeout(jsonTimer);
    const text = jsonCurrentText();
    if (!text.trim()) {
        jsonClearResult();
        return;
    }
    if (jsonBig || text.length > DBXJson.LIMITS.autoFormat) {
        jsonShowIdleHint();
        return;
    }
    jsonTimer = setTimeout(() => jsonRun('format'), 380);
}

function jsonShowIdleHint() {
    if (jsonStat) jsonStat.textContent = '';
    if (jsonTiming) jsonTiming.textContent = '';
}

/* ------------------------------- 跑格式化 ------------------------------- */

function jsonSetBusy(busy) {
    jsonBusy = busy;
    [jsonRunBtn, jsonMinifyBtn, jsonClearBtn].forEach((b) => { if (b) b.disabled = busy; });
    if (jsonProgressCancel) jsonProgressCancel.disabled = false;
    if (jsonCopyBtn) jsonCopyBtn.disabled = busy;
}

function jsonShowProgress(pct) {
    if (!jsonProgress) return;
    jsonProgress.hidden = false;
    if (jsonProgressBar) jsonProgressBar.style.width = Math.max(0, Math.min(100, pct)) + '%';
    if (jsonProgressText) jsonProgressText.textContent = jsonT('jsonProgress', { pct: pct });
}

function jsonHideProgress() {
    if (jsonProgress) jsonProgress.hidden = true;
    if (jsonProgressBar) jsonProgressBar.style.width = '0%';
}

let jsonRerunMode = null;

/* 任何时候都能叫它：正在跑就记一笔，跑完再补一次，
   免得「导入后点了格式化但正好在上一次运行中」被静默丢掉 */
async function jsonRun(mode) {
    if (jsonBusy) { jsonRerunMode = mode || 'format'; return; }
    try {
        await jsonRunNow(mode);
    } finally {
        const again = jsonRerunMode;
        jsonRerunMode = null;
        if (again) jsonRun(again);
    }
}

async function jsonRunNow(mode) {
    clearTimeout(jsonTimer);
    const text = jsonCurrentText();
    if (!text.trim()) {
        jsonClearResult();
        showToast(jsonT('jsonNothing'), 'error');
        return;
    }
    const opts = {
        indent: jsonIndentValue(),
        minify: mode === 'minify',
        sortOrder: jsonSortOrder
    };
    const seq = ++jsonSeq;
    const t0 = jsonNow();
    jsonSetBusy(true);

    let res;
    if (text.length > DBXJson.LIMITS.autoFormat) {
        // 大文件：分片跑，每片只占几毫秒主线程，进度条能走、按钮能点
        jsonAbortSignal = { aborted: false };
        jsonShowProgress(0);
        res = await DBXJson.formatAsync(text, opts, {
            sliceMs: DBXJson.LIMITS.sliceMs,
            signal: jsonAbortSignal,
            onProgress: (p) => jsonShowProgress(Math.round(p.ratio * 100))
        });
        jsonHideProgress();
        jsonAbortSignal = null;
    } else {
        res = DBXJson.format(text, opts);
    }

    const ms = jsonNow() - t0;
    jsonSetBusy(false);
    if (seq !== jsonSeq) return;      // 跑的这期间输入又改了，这次结果作废
    if (res.aborted) {
        showToast(jsonT('jsonCancelled'), 'error');
        return;
    }
    jsonLast = {
        ok: res.ok, text: res.text, error: res.error, stats: res.stats,
        warnings: res.warnings || [], ms: ms, minify: opts.minify
    };
    jsonRenderResult();
}

/* ------------------------------- 结果的渲染 ------------------------------- */

function jsonShowEmpty(show) {
    if (!jsonEmpty) return;
    jsonEmpty.hidden = !show;
}

function jsonHideNotice() {
    if (!jsonErrorBox) return;
    jsonErrorBox.hidden = true;
    jsonErrorBox.classList.remove('is-warn');
    const mark = jsonErrorBox.querySelector('.json-error-mark');
    if (mark) mark.textContent = '!';
}

function jsonHideError() {
    jsonHideNotice();
    if (jsonGotoMark && jsonInEditor) {
        try { jsonGotoMark.clear(); } catch (e) { /* 编辑器重建过，标记已经没了 */ }
    }
    jsonGotoMark = null;
}

function jsonClearOutputView() {
    if (jsonPreview) jsonPreview.hidden = true;
    if (jsonOutWrap) jsonOutWrap.classList.remove('is-hidden');
    if (jsonOutEditor) {
        jsonSuppress = true;
        jsonOutEditor.setValue('');
        jsonSuppress = false;
    } else if (jsonOutputEl) {
        jsonOutputEl.value = '';
    }
    if (jsonOutBadge) jsonOutBadge.textContent = '0';
    if (jsonTiming) jsonTiming.textContent = '';
}

function jsonClearResult() {
    if (jsonTableOn) jsonTableHide();
    jsonLast = null;
    jsonHideError();
    jsonClearOutputView();
    jsonShowEmpty(true);
    jsonSyncCopyBtn();
}

/* 提示走 data-tip（宿主里原生 title 不弹，07-tip.js 悬停时还会把它摘掉），
   顺手补 aria-label，禁用状态下读屏也能知道为什么 */
function jsonSetHint(el, text) {
    if (!el) return;
    if (text) {
        el.setAttribute('data-tip', text);
        el.setAttribute('aria-label', text);
    } else {
        el.removeAttribute('data-tip');
        el.setAttribute('aria-label', (el.textContent || '').trim());
    }
}

function jsonRenderResult() {
    // 结果一换，表格里的模型就过期了：先收起来，别让人对着一张旧表检索
    if (jsonTableOn) jsonTableHide();
    const r = jsonLast;
    if (!r) { jsonClearResult(); return; }
    jsonSyncCopyBtn();
    if (jsonTiming) jsonTiming.textContent = r.ok || r.error ? jsonT('jsonTiming', { ms: Math.round(r.ms) }) : '';

    if (!r.ok) {
        jsonShowEmpty(false);
        jsonShowError(r.error);
        return;
    }
    jsonShowNotice(r.warnings);
    jsonShowEmpty(false);

    const stats = r.stats || {};
    const text = r.text || '';
    // 结果进编辑器用同一套闸：太大就只渲染前一段，全文留着导出。
    // 现在这道闸按字节算（10 MB），行数不单独设限——CM 实测 46 万行 setValue 220 ms，
    // 行多不贵，字节多才贵。
    const tooBigForEditor = text.length > DBXJson.LIMITS.renderEdit;

    if (tooBigForEditor) {
        jsonShowPreview(text);
    } else {
        jsonShowInEditor(text, stats.lines || 0);
    }

    if (jsonOutBadge) jsonOutBadge.textContent = jsonFmtBytes(DBXJson.utf8Bytes(text));
    // 预览模式（<pre>）里没有源码树可折；行数超了也没折叠槽，按钮一起禁掉，
    // 并在 title 里说清为什么——比点了没反应强
    const lines = stats.lines || 0;
    const canFold = !!jsonOutEditor && !(jsonPreview && !jsonPreview.hidden) && lines <= JSON_FOLD_MAX_LINES;
    const foldWhy = canFold ? '' : jsonT('jsonFoldTooBig', { n: lines });
    if (jsonFoldBtn) { jsonFoldBtn.disabled = !canFold; jsonSetHint(jsonFoldBtn, foldWhy); }
    if (jsonUnfoldBtn) { jsonUnfoldBtn.disabled = !canFold; jsonSetHint(jsonUnfoldBtn, foldWhy); }
    if (jsonStat) {
        jsonStat.textContent = jsonT('jsonStat', {
            size: jsonFmtBytes(DBXJson.utf8Bytes(text)),
            lines: (stats.lines || 0).toLocaleString(),
            nodes: (stats.nodes || 0).toLocaleString(),
            depth: stats.maxDepth || 0
        });
    }
}

/* CodeMirror 的 gutter 宽度是「露面那一刻」量的：结果先走预览（jsonOutWrap 是 display:none），
   切回编辑器时量到 0，行号就会压在正文上。露面之后补一次重排，把 gutters 重量一遍。
   60 ms 防抖——拖窗口大小时不要每帧都重排。 */
let jsonRefreshTimer = null;
function jsonRefreshOutSoon() {
    clearTimeout(jsonRefreshTimer);
    jsonRefreshTimer = setTimeout(() => {
        const cm = jsonOutEditor;
        if (!cm) return;
        try {
            // 只 refresh：别去 setOption('gutters')，那会把 gutters 列表重建一遍，
            // 行号和折叠槽一起消失（踩过）
            cm.refresh();
        } catch (e) { /* 编辑器重建过就算了，别为排版把页面搞挂 */ }
    }, 60);
}

function jsonShowInEditor(text, lines) {
    ensureJsonOutEditor();
    if (jsonPreview) jsonPreview.hidden = true;
    if (jsonOutWrap) jsonOutWrap.classList.remove('is-hidden');
    if (!jsonOutEditor) {
        if (jsonOutputEl) jsonOutputEl.value = text;
        return;
    }
    // 进编辑器的就着色：CM 只 tokenize 视口里那两三百行，实测 7 ms/200 行，
    // 跟文档总大小无关，所以这里不再按体积关着色
    const colorize = text.length <= DBXJson.LIMITS.renderEdit;
    if (jsonOutEditor.getOption('mode') !== (colorize ? 'application/json' : 'text/plain')) {
        jsonOutEditor.setOption('mode', colorize ? 'application/json' : 'text/plain');
    }
    // 折叠槽一直在：折最外层那种操作才贵，切槽反而让人以为功能没了。
    // 真正贵的那一步（一键折叠）由 JSON_FOLD_MAX_LINES 拦住。
    const cur = jsonOutEditor.getValue();
    if (cur !== text) {
        jsonOutEditor.setValue(text);
        // 只读结果不需要撤销栈；不清的话每次重跑都留一份全文，几 MB 的文档能把内存吃穿
        if (text.length > 1024 * 1024) jsonOutEditor.clearHistory();
    }
    jsonRefreshOutSoon();
}

function jsonShowPreview(text) {
    if (jsonOutWrap) jsonOutWrap.classList.add('is-hidden');
    const limit = DBXJson.LIMITS.preview;
    const maxLines = DBXJson.LIMITS.previewLines;
    let shown = text.length > limit ? text.slice(0, limit) : text;
    let cutByByte = text.length > limit;
    if (cutByByte) {
        // 尽量切在行尾，别把一条记录劈成两半
        const nl = shown.lastIndexOf('\n');
        if (nl > limit * 0.6) shown = shown.slice(0, nl);
    }
    const lines = shown.split('\n');
    if (lines.length > maxLines) {
        shown = lines.slice(0, maxLines).join('\n');
        cutByByte = true;
    }
    if (jsonPreviewPre) jsonPreviewPre.textContent = shown;
    if (jsonPreview) jsonPreview.hidden = false;
    if (jsonPreviewNote) {
        jsonPreviewNote.textContent = jsonT('jsonPreviewNote', {
            shown: jsonFmtBytes(DBXJson.utf8Bytes(shown)),
            total: jsonFmtBytes(DBXJson.utf8Bytes(text))
        });
    }
}

/* 键排序跳过之类：结果是对的，只是有个附加动作没做。用黄色提示，别用红色错误——
   红色会让人以为整条结果都不能用。 */
const JSON_WARN_KEY = {
    sortBigNumber: 'jsonWarnSortBigNumber',
    sortJsonl: 'jsonWarnSortJsonl',
    sortTooLarge: 'jsonWarnSortTooLarge',
    sortFailed: 'jsonWarnSortFailed'
};

function jsonShowNotice(warnings) {
    if (!warnings || !warnings.length) {
        jsonHideError();
        return;
    }
    if (!jsonErrorBox) return;
    jsonHideError();
    jsonErrorBox.hidden = false;
    jsonErrorBox.classList.add('is-warn');
    const mark = jsonErrorBox.querySelector('.json-error-mark');
    if (mark) mark.textContent = 'i';
    if (jsonErrorTitle) jsonErrorTitle.textContent = jsonT(JSON_WARN_KEY[warnings[0].code] || 'jsonWarnSortFailed');
    if (jsonErrorWhere) jsonErrorWhere.textContent = '';
    if (jsonErrorSnippet) jsonErrorSnippet.textContent = '';
    if (jsonErrorGoto) jsonErrorGoto.hidden = true;
}

function jsonShowError(err) {
    jsonClearOutputView();
    // 报错时统计留着上一次的数字会误导（看起来像「这次也成功了」）
    if (jsonStat) jsonStat.textContent = '';
    if (!err) return;
    if (jsonErrorBox) {
        jsonErrorBox.hidden = false;
        jsonErrorBox.classList.remove('is-warn');
    }
    const mark = jsonErrorBox ? jsonErrorBox.querySelector('.json-error-mark') : null;
    if (mark) mark.textContent = '!';
    if (jsonErrorTitle) jsonErrorTitle.textContent = jsonT(JSON_ERR_KEY[err.code] || 'jsonErrUnknown');
    if (jsonErrorWhere) {
        jsonErrorWhere.textContent = err.line ? jsonT('jsonErrWhere', { line: err.line, col: err.col }) : '';
    }
    if (jsonErrorSnippet) jsonErrorSnippet.textContent = err.snippet || '';
    // 大文件模式没有编辑器，定位按钮没意义
    if (jsonErrorGoto) jsonErrorGoto.hidden = !err.line || !!jsonBig;
    jsonShowEmpty(false);
}

/* --------------------------------- 复制 --------------------------------- */

/* 结果大就不写剪贴板：几 MB 塞进去会卡住宿主，而且多数环境粘不出来 */
function jsonSyncCopyBtn() {
    if (!jsonCopyBtn) return;
    const text = jsonLast && jsonLast.ok ? jsonLast.text : '';
    const big = jsonClipTooBig(text);
    jsonCopyBtn.textContent = big ? jsonT('jsonExport') : jsonT('jsonCopy');
    jsonCopyBtn.title = big ? jsonT('jsonClipHint') : '';
    jsonCopyBtn.disabled = !text || jsonBusy;
}

function jsonOutFileName() {
    let base = 'data';
    if (jsonBig && jsonBig.name) base = String(jsonBig.name).replace(/\.[^.]+$/, '');
    return base + (jsonLast && jsonLast.minify ? '.min.json' : '.formatted.json');
}

async function jsonCopyOrExport() {
    const text = jsonLast && jsonLast.ok ? jsonLast.text : '';
    if (!text) {
        showToast(jsonT('jsonNothing'), 'error');
        return;
    }
    if (jsonClipTooBig(text)) {
        // 大文件走导出：宿主通道 → 浏览器下载，失败原因如实报（见 13-sheet 的四种状态）
        const name = jsonOutFileName();
        const status = await saveTextFile(name, text, 'application/json;charset=utf-8');
        saveToast(status, jsonT('jsonExported', { name: name }));
        return;
    }
    try {
        await writeClipboardText(text);
        showToast(jsonT('jsonCopied'));
    } catch (err) {
        showToast(jsonT('jsonNothing'), 'error');
    }
}

/* ------------------------------- 错误定位 ------------------------------- */

function jsonGotoError() {
    const err = jsonLast && jsonLast.error;
    if (!err || !err.line) return;
    if (jsonBig) return;                        // 大文件没有编辑器，无处可去
    ensureJsonInEditor();
    if (!jsonInEditor) return;
    const line = Math.max(0, err.line - 1);
    const ch = Math.max(0, (err.col || 1) - 1);
    jsonInEditor.setCursor({ line: line, ch: ch });
    jsonInEditor.scrollIntoView({ line: line, ch: ch }, 80);
    jsonInEditor.focus();
    try {
        if (jsonGotoMark) jsonGotoMark.clear();
        jsonGotoMark = jsonInEditor.markText(
            { line: line, ch: 0 },
            { line: line, ch: (jsonInEditor.getLine(line) || '').length },
            { className: 'json-err-line' }
        );
        setTimeout(() => {
            if (!jsonGotoMark) return;
            try { jsonGotoMark.clear(); } catch (e) { /* noop */ }
            jsonGotoMark = null;
        }, 1600);
    } catch (e) { /* 定位失败不影响读错误信息 */ }
}

/* -------------------------------- 页面进出 -------------------------------- */

function enterJsonMode() {
    if (typeof exitOtherModes === 'function') exitOtherModes('json');
    if (typeof markConvertActive === 'function') markConvertActive(null);
    if (typeof mainWorkspace !== 'undefined' && mainWorkspace) mainWorkspace.classList.add('hidden');
    if (typeof toolbarEl !== 'undefined' && toolbarEl) toolbarEl.classList.add('hidden');
    jsonModeActive = true;
    if (jsonWorkspace) jsonWorkspace.classList.add('active');
    if (navJsonLink) navJsonLink.classList.add('active');

    if (!jsonBig) ensureJsonInEditor();
    ensureJsonOutEditor();
    jsonApplyI18n();
    jsonUpdateInBadge();
    requestAnimationFrame(() => {
        if (jsonInEditor) jsonInEditor.refresh();
        if (jsonOutEditor) jsonOutEditor.refresh();
    });
    jsonRefreshOutSoon();
    // 面板宽度会变（导航收起、窗口缩放），宽度一变就重排一次
    if (!jsonResizeWatch && jsonOutPane && typeof ResizeObserver === 'function') {
        jsonResizeWatch = new ResizeObserver(() => jsonRefreshOutSoon());
        jsonResizeWatch.observe(jsonOutPane);
    }
}

function exitJsonMode() {
    if (!jsonModeActive) return;
    jsonModeActive = false;
    if (jsonWorkspace) jsonWorkspace.classList.remove('active');
    if (navJsonLink) navJsonLink.classList.remove('active');
    if (typeof toolbarEl !== 'undefined' && toolbarEl) toolbarEl.classList.remove('hidden');
    if (typeof mainWorkspace !== 'undefined' && mainWorkspace) mainWorkspace.classList.remove('hidden');
    // 走开就把正在跑的大文件停掉，别让它在后台白烧 CPU
    if (jsonBusy && jsonAbortSignal) jsonAbortSignal.aborted = true;
    requestAnimationFrame(() => {
        if (typeof inputEditor !== 'undefined' && inputEditor) inputEditor.refresh();
        if (typeof outputEditor !== 'undefined' && outputEditor) outputEditor.refresh();
    });
}

/* ------------------------------ 文案重铺 ------------------------------ */

function jsonApplyI18n() {
    if (jsonSortValue) jsonSortValue.textContent = jsonSortLabelOf(jsonSortOrder);
    if (jsonBig) jsonFillBigMeta();
    if (jsonLast) {
        if (jsonTiming && (jsonLast.ok || jsonLast.error)) {
            jsonTiming.textContent = jsonT('jsonTiming', { ms: Math.round(jsonLast.ms || 0) });
        }
        jsonSyncCopyBtn();
        if (jsonLast.ok) {
            const stats = jsonLast.stats || {};
            if (jsonStat) {
                jsonStat.textContent = jsonT('jsonStat', {
                    size: jsonFmtBytes(DBXJson.utf8Bytes(jsonLast.text)),
                    lines: (stats.lines || 0).toLocaleString(),
                    nodes: (stats.nodes || 0).toLocaleString(),
                    depth: stats.maxDepth || 0
                });
            }
            if (jsonPreview && !jsonPreview.hidden) jsonShowPreview(jsonLast.text);
            jsonShowNotice(jsonLast.warnings);
        } else if (jsonLast.error) {
            jsonShowError(jsonLast.error);
        }
    }
    jsonTableRefresh();
    if (jsonSamples) {
        const opts = jsonSamples.querySelector('.custom-select-options');
        if (opts) opts.classList.remove('open');
    }
}

/* -------------------------------- 交互绑定 -------------------------------- */

if (jsonRunBtn) jsonRunBtn.addEventListener('click', () => jsonRun('format'));
if (jsonMinifyBtn) jsonMinifyBtn.addEventListener('click', () => jsonRun('minify'));
if (jsonCopyBtn) jsonCopyBtn.addEventListener('click', () => jsonCopyOrExport());
if (jsonErrorGoto) jsonErrorGoto.addEventListener('click', jsonGotoError);

if (jsonClearBtn) {
    jsonClearBtn.addEventListener('click', () => {
        jsonSeq++;
        clearTimeout(jsonTimer);
        if (jsonInEditor) {
            jsonSuppress = true;
            jsonInEditor.setValue('');
            jsonSuppress = false;
        }
        if (jsonInputEl) jsonInputEl.value = '';
        jsonUseSmall('');
        jsonClearResult();
        jsonUpdateInBadge();
        if (jsonInEditor) jsonInEditor.focus();
    });
}

if (jsonIndentTabs) {
    jsonIndentTabs.addEventListener('click', (e) => {
        const tab = e.target.closest ? e.target.closest('.compare-tab') : null;
        if (!tab) return;
        jsonIndent = tab.dataset.indent || '2';
        jsonIndentTabs.querySelectorAll('.compare-tab').forEach((t) => t.classList.toggle('active', t === tab));
        if (jsonLast && jsonLast.ok) jsonRun('format');      // 换了缩进马上重排
    });
}

/* 排序下拉：默认 / 升序 / 降序。换了就重跑一次——排序本来就是这个页面的即时效果 */
function jsonSortOpen(open) {
    if (!jsonSort) return;
    const opts = jsonSort.querySelector('.custom-select-options');
    const trig = jsonSort.querySelector('.custom-select-trigger');
    if (opts) opts.classList.toggle('open', !!open);
    if (trig) {
        trig.classList.toggle('active', !!open);
        trig.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
}

function jsonSortLabelOf(value) {
    if (value === 'asc') return jsonT('jsonSortAsc');
    if (value === 'desc') return jsonT('jsonSortDesc');
    return jsonT('jsonSortDefault');
}

function jsonSortApply(value) {
    jsonSortOrder = value === 'asc' || value === 'desc' ? value : 'none';
    if (jsonSortValue) jsonSortValue.textContent = jsonSortLabelOf(jsonSortOrder);
    if (jsonSort) {
        jsonSort.querySelectorAll('.custom-option').forEach((o) => {
            o.classList.toggle('active', (o.dataset.sort || 'none') === jsonSortOrder);
        });
    }
    if (jsonLast && jsonLast.ok) jsonRun('format');
}

if (jsonSort) {
    jsonSort.addEventListener('click', (e) => {
        const pick = e.target.closest ? e.target.closest('.custom-option') : null;
        if (pick) {
            e.stopPropagation();
            jsonSortOpen(false);
            jsonSortApply(pick.dataset.sort || 'none');
            return;
        }
        const opts = jsonSort.querySelector('.custom-select-options');
        jsonSortOpen(!opts.classList.contains('open'));
        e.stopPropagation();
    });
    jsonSort.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            const trig = e.target.closest ? e.target.closest('.custom-select-trigger') : null;
            if (!trig) return;
            e.preventDefault();
            const opts = jsonSort.querySelector('.custom-select-options');
            jsonSortOpen(!opts.classList.contains('open'));
        } else if (e.key === 'Escape') {
            jsonSortOpen(false);
        }
    });
}

if (jsonProgressCancel) {
    jsonProgressCancel.addEventListener('click', () => {
        if (jsonAbortSignal) jsonAbortSignal.aborted = true;
        if (jsonProgressCancel) jsonProgressCancel.disabled = true;
    });
}

/* 大文件卡：看开头 / 仍要编辑 */
if (jsonBigInPeek) {
    jsonBigInPeek.addEventListener('click', () => {
        if (!jsonBig || !jsonBigPeekPre) return;
        const open = jsonBigPeekPre.hidden;
        if (open) {
            const head = jsonBig.text.slice(0, 4000);
            const lines = head.split('\n').slice(0, 60).join('\n');
            const more = jsonBig.text.length > lines.length;
            jsonBigPeekPre.textContent = lines + (more ? '\n…' : '');
            jsonBigPeekPre.hidden = false;
            jsonBigInPeek.setAttribute('aria-expanded', 'true');
        } else {
            jsonBigPeekPre.hidden = true;
            jsonBigInPeek.setAttribute('aria-expanded', 'false');
        }
    });
}

if (jsonBigInForce) {
    jsonBigInForce.addEventListener('click', () => {
        if (!jsonBig) return;
        const limit = 2 * 1024 * 1024;
        if (jsonBig.text.length > limit) {
            showToast(jsonT('jsonForceTooBig', { max: jsonFmtBytes(limit) }), 'error', 4500);
            return;
        }
        const text = jsonBig.text;
        jsonBig = null;
        if (jsonInPane) jsonInPane.classList.remove('is-big');
        if (jsonBigIn) jsonBigIn.hidden = true;
        ensureJsonInEditor();
        // 先让提示渲染出来，再塞编辑器：这几百毫秒的卡顿至少是「有解释的」
        showToast(jsonT('jsonForceLoaded'));
        setTimeout(() => {
            if (!jsonInEditor) return;
            jsonSuppress = true;
            jsonInEditor.setValue(text);
            jsonSuppress = false;
            jsonUpdateInBadge();
            jsonInEditor.refresh();
        }, 60);
    });
}

/* 示例下拉：沿用全局约定（options 加 open、trigger 加 active），点别处由 09 收起 */
function jsonSampleOpen(open) {
    if (!jsonSamples) return;
    const opts = jsonSamples.querySelector('.custom-select-options');
    const trig = jsonSamples.querySelector('.custom-select-trigger');
    if (opts) opts.classList.toggle('open', !!open);
    if (trig) {
        trig.classList.toggle('active', !!open);
        trig.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
}

if (jsonSamples) {
    jsonSamples.addEventListener('click', (e) => {
        const pick = e.target.closest ? e.target.closest('.custom-option') : null;
        if (pick) {
            e.stopPropagation();
            jsonSampleOpen(false);
            const sample = JSON_SAMPLES[pick.dataset.sample];
            if (sample) {
                jsonLoadText(sample, '', true);
                if (jsonInEditor) jsonInEditor.focus();
            }
            return;
        }
        const opts = jsonSamples.querySelector('.custom-select-options');
        jsonSampleOpen(!opts.classList.contains('open'));
        e.stopPropagation();
    });
    jsonSamples.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            const trig = e.target.closest ? e.target.closest('.custom-select-trigger') : null;
            if (!trig) return;
            e.preventDefault();
            const opts = jsonSamples.querySelector('.custom-select-options');
            jsonSampleOpen(!opts.classList.contains('open'));
        } else if (e.key === 'Escape') {
            jsonSampleOpen(false);
        }
    });
}

/* 拖文件由 18-flow 的统一入口接管（pageImportTargets 里有 navJson，走 jsonLoadText），
   这一页不再自己挂 drop：两套监听会各读一遍文件，还会绕过体积上限。 */

/* -------------------------------- 导入文件 --------------------------------
   只收文本：.json / .jsonl / .ndjson / .txt。上限跟拖拽那条路一致（16 MB）；
   读进来之后同样走 jsonLoadText——超过 1 MB 就是「摘要 + 预览」，不塞编辑器，所以不会卡。 */
const JSON_IMPORT_MAX = 16 * 1024 * 1024;

function jsonReadFileText(file) {
    if (file && typeof file.text === 'function') return file.text();
    return new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result || ''));
        fr.onerror = () => reject(fr.error || new Error('read'));
        fr.readAsText(file, 'utf-8');
    });
}

async function jsonImportFile(file) {
    if (!file) return;
    // 选文件那一刻就把左边腾空：读盘要几十毫秒，这期间别让人对着上一个文件犯迷糊
    jsonClearInput();
    if (jsonInBadge) jsonInBadge.textContent = '0';
    if (file.size > JSON_IMPORT_MAX) {
        showToast(jsonT('jsonFileTooBig', { max: jsonFmtBytes(JSON_IMPORT_MAX) }), 'error', 4500);
        return;
    }
    let text = '';
    try {
        text = await jsonReadFileText(file);
    } catch (err) {
        showToast(jsonT('jsonImportFail', { e: (err && err.message) || 'error' }), 'error', 4500);
        return;
    }
    if (!text) {
        showToast(jsonT('jsonNothing'), 'error');
        return;
    }
    jsonLoadText(text, file.name || 'data.json');
    if (jsonInEditor) jsonInEditor.focus();
}

if (jsonImportBtn) {
    jsonImportBtn.addEventListener('click', () => {
        if (!jsonFileInput) return;
        jsonFileInput.value = '';       // 同一个文件连选两次也要能触发 change
        jsonFileInput.click();
    });
}

if (jsonFileInput) {
    jsonFileInput.addEventListener('change', () => {
        const files = jsonFileInput.files;
        if (!files || !files.length) return;
        jsonImportFile(files[0]);
    });
}

/* -------------------------------- 折叠 / 展开 --------------------------------
   只对编辑器里的结果生效（预览模式没有源码树可折）。行数太多时直接拒绝：
   几千行逐行折一遍本身就要几百毫秒，不如让人用搜索 / 导出。 */
const JSON_FOLD_MAX_LINES = 4000;

/* 数一个容器里直接有几个成员：只看深度 0 的逗号，字符串里的不算 */
function jsonCountMembers(src) {
    let depth = 0;
    let count = 0;
    let inStr = false;
    let esc = false;
    let seen = false;
    for (let i = 1; i < src.length; i++) {
        const c = src.charAt(i);
        if (inStr) {
            if (esc) { esc = false; continue; }
            if (c === '\\') { esc = true; continue; }
            if (c === '"') inStr = false;
            continue;
        }
        if (c === '"') { inStr = true; if (depth === 0) seen = true; continue; }
        if (c === '{' || c === '[') { depth++; seen = true; continue; }
        // 收括号：碰到容器自己的收尾就停（src 可能带、也可能不带这个字符）
        if (c === '}' || c === ']') { if (depth === 0) break; depth--; continue; }
        if (depth === 0 && c === ',') { count++; continue; }
        if (depth === 0 && !/\s/.test(c)) seen = true;
    }
    return seen ? count + 1 : 0;
}

function jsonFoldAll(open) {
    if (!jsonLast || !jsonLast.ok) return;
    if (!jsonOutEditor || (jsonPreview && !jsonPreview.hidden)) return;
    const cm = jsonOutEditor;
    if (cm.lineCount() > JSON_FOLD_MAX_LINES) {
        showToast(jsonT('jsonFoldTooBig', { n: cm.lineCount() }), 'error', 4000);
        return;
    }
    const foldOpts = cm.getOption('foldOptions');
    cm.operation(() => {
        cm.eachLine((handle) => {
            // 只挑「以开括号收尾」的行（格式化后的容器行），光标定位到那个括号上。
            // 传 foldOpts 是必须的：`foldCode(pos, null)` 会退回按 mode 名找 helper，
            // JSON 走的是 javascript mode，这条路在宿主里不一定认得上，点了就是没反应。
            const text = handle.text;
            if (!/[{\[]\s*$/.test(text)) return;
            const line = cm.getLineNumber(handle);
            const ch = text.lastIndexOf('{') > text.lastIndexOf('[') ? text.lastIndexOf('{') : text.lastIndexOf('[');
            cm.foldCode({ line: line, ch: ch < 0 ? 0 : ch }, foldOpts, open ? 'unfold' : 'fold');
        });
    });
    cm.refresh();
}

if (jsonFoldBtn) jsonFoldBtn.addEventListener('click', () => jsonFoldAll(false));
if (jsonUnfoldBtn) jsonUnfoldBtn.addEventListener('click', () => jsonFoldAll(true));


/* ------------------------------- 表格视图 -------------------------------
   第一层键摊成表：根对象 → 「字段 / 值」；对象数组 → 一行一条、列取键的并集。
   行只渲染视口里那几十条（虚拟滚动），单元格文本按需生成（懒加载），
   所以几万行也只是「滚动时慢一点」，不会打开就卡住。 */

const jsonTableBtn = document.getElementById('jsonTableBtn');
const jsonTableEl = document.getElementById('jsonTable');
const jsonTableScroll = document.getElementById('jsonTableScroll');
const jsonTableInner = document.getElementById('jsonTableInner');
const jsonTableHead = document.getElementById('jsonTableHead');
const jsonTableSpacer = document.getElementById('jsonTableSpacer');
const jsonTableRowsEl = document.getElementById('jsonTableRows');
const jsonTableCountEl = document.getElementById('jsonTableCount');
const jsonTableQueryEl = document.getElementById('jsonTableQuery');
const jsonTableNoMatch = document.getElementById('jsonTableNoMatch');
const jsonTableScopeEl = document.getElementById('jsonTableScope');
const jsonTableScopeOpts = document.getElementById('jsonTableScopeOpts');
const jsonTableScopeValue = document.getElementById('jsonTableScopeValue');

const JSON_TABLE_ROW_H = 32;        // 跟 CSS 里的 --json-table-row-h 对齐
const JSON_CELL_EDITOR_MIN = 8000;  // 超过这么多字符就用编辑器看，pre 里读不动
const JSON_TABLE_CELL_CHARS = 400;  // 一格最多显示这么多字符，再多点开导出看

let jsonTableOn = false;
let jsonTableModel = null;
let jsonTableScopeKey = '';         // '' = 全部字段
let jsonTableRows = [];             // 过滤后的行下标
let jsonTableFilterSeq = 0;
let jsonTableScrollRAF = 0;
let jsonTableTimer = 0;
let jsonTablePrev = null;           // 打开前那一层是编辑器还是预览
let jsonTableCellTemplate = '';     // 列宽模板，head 和每行都用同一份

function jsonTableEsc(text) {
    return String(text == null ? '' : text).replace(/[&<>"]/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
    ));
}

/* 关键字命中处高亮。先转义再匹配，免得把标签当 HTML 注进去 */
function jsonTableMark(text, needle) {
    const safe = jsonTableEsc(text);
    if (!needle) return safe;
    const pat = jsonTableEsc(needle).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    try {
        return safe.replace(new RegExp(pat, 'ig'), (m) => '<mark>' + m + '</mark>');
    } catch (e) {
        return safe;
    }
}

function jsonTableColLabel(model, col) {
    if (col.key === '#key') return jsonT('jsonTableColKey');
    if (col.key === '#value') return jsonT('jsonTableColValue');
    return col.key === '' ? '—' : col.key;
}

/* 关掉表格（不负责把编辑器/预览放回来——那一步交给渲染流程） */
function jsonTableHide() {
    jsonTableOn = false;
    jsonTableModel = null;
    jsonTableRows = [];
    jsonTableFilterSeq++;
    clearTimeout(jsonTableTimer);
    if (jsonTableEl) jsonTableEl.hidden = true;
    if (jsonTableRowsEl) jsonTableRowsEl.innerHTML = '';
    if (jsonTableHead) jsonTableHead.innerHTML = '';
    if (jsonTableBtn) {
        jsonTableBtn.classList.remove('is-on');
        jsonTableBtn.setAttribute('aria-pressed', 'false');
    }
}

function jsonTableShowCount() {
    if (!jsonTableCountEl || !jsonTableModel) return;
    jsonTableCountEl.textContent = jsonT('jsonTableCount', {
        shown: jsonTableRows.length.toLocaleString(),
        total: jsonTableModel.rowCount.toLocaleString(),
        cols: jsonTableModel.columns.length.toLocaleString()
    });
}

/* 只渲染视口那几十行；滚动时重算窗口，DOM 数量跟总行数无关 */
function jsonTableRenderWindow() {
    if (!jsonTableOn || !jsonTableModel || !jsonTableRowsEl) return;
    const total = jsonTableRows.length;
    const h = jsonTableScroll ? (jsonTableScroll.clientHeight || 400) : 400;
    const top = jsonTableScroll ? jsonTableScroll.scrollTop : 0;
    let start = Math.floor(top / JSON_TABLE_ROW_H) - 4;
    if (start < 0) start = 0;
    let end = start + Math.ceil(h / JSON_TABLE_ROW_H) + 8;
    if (end > total) end = total;

    const model = jsonTableModel;
    const cols = model.columns;
    const needle = jsonTableQueryEl ? jsonTableQueryEl.value.trim() : '';
    const out = [];
    for (let i = start; i < end; i++) {
        const row = model.rows[jsonTableRows[i]];
        const cells = [];
        for (let c = 0; c < cols.length; c++) {
            const text = DBXJson.tableCell(row, cols[c].key, model.kind, JSON_TABLE_CELL_CHARS);
            let cls = '';
            if (c === 0 && model.kind === 'kv') cls += ' is-key';
            if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(text)) cls += ' is-num';
            cells.push('<div class="json-table-cell' + cls + '">' + jsonTableMark(text, needle) + '</div>');
        }
        out.push('<div class="json-table-row" style="top:' + (i * JSON_TABLE_ROW_H) + 'px;grid-template-columns:' +
            (jsonTableCellTemplate || 'repeat(2, minmax(160px, 1fr))') + '">' + cells.join('') + '</div>');
    }
    jsonTableRowsEl.innerHTML = out.join('');
    if (jsonTableNoMatch) jsonTableNoMatch.hidden = total > 0;
}

function jsonTableLayoutAfterFilter() {
    const total = jsonTableRows.length;
    if (jsonTableSpacer) jsonTableSpacer.style.height = (total * JSON_TABLE_ROW_H) + 'px';
    if (jsonTableScroll) jsonTableScroll.scrollTop = 0;
    jsonTableRenderWindow();
    jsonTableShowCount();
}

/* 检索：大表分片扫，一片 4000 行，中间还主线程给 DOM */
function jsonTableRefilter() {
    if (!jsonTableModel) return;
    const model = jsonTableModel;
    const q = jsonTableQueryEl ? jsonTableQueryEl.value.trim() : '';
    const seq = ++jsonTableFilterSeq;

    if (!q) {
        const all = new Array(model.rowCount);
        for (let i = 0; i < model.rowCount; i++) all[i] = i;
        jsonTableRows = all;
        jsonTableLayoutAfterFilter();
        return;
    }

    jsonTableRows = [];
    let i = 0;
    const step = () => {
        if (seq !== jsonTableFilterSeq) return;
        const end = Math.min(model.rowCount, i + 4000);
        for (; i < end; i++) {
            if (DBXJson.tableRowMatches(model, model.rows[i], jsonTableScopeKey, q)) jsonTableRows.push(i);
        }
        if (i < model.rowCount) {
            jsonTableShowCount();
            setTimeout(step, 0);
            return;
        }
        jsonTableLayoutAfterFilter();
    };
    step();
}

function jsonTableRenderHead() {
    if (!jsonTableModel) return;
    const model = jsonTableModel;
    const cols = Math.max(1, model.columns.length);
    jsonTableCellTemplate = 'repeat(' + cols + ', minmax(160px, 1fr))';
    if (jsonTableInner) jsonTableInner.style.setProperty('--json-table-cols', jsonTableCellTemplate);
    if (jsonTableHead) {
        jsonTableHead.style.gridTemplateColumns = jsonTableCellTemplate;
        jsonTableHead.innerHTML = model.columns.map((c) => (
            '<div class="json-table-head-cell">' + jsonTableEsc(jsonTableColLabel(model, c)) + '</div>'
        )).join('');
    }
}

function jsonTableRenderScope() {
    if (!jsonTableScopeOpts || !jsonTableModel) return;
    const model = jsonTableModel;
    const parts = ['<div class="custom-option' + (jsonTableScopeKey ? '' : ' active') + '" data-key="">' +
        jsonTableEsc(jsonT('jsonTableFieldAll')) + '</div>'];
    model.columns.forEach((c) => {
        const key = jsonTableEsc(c.key);
        parts.push('<div class="custom-option' + (jsonTableScopeKey === c.key ? ' active' : '') + '" data-key="' + key + '">' +
            jsonTableEsc(jsonTableColLabel(model, c)) + '</div>');
    });
    jsonTableScopeOpts.innerHTML = parts.join('');
    if (jsonTableScopeValue) {
        const hit = model.columns.find((c) => c.key === jsonTableScopeKey);
        jsonTableScopeValue.textContent = hit ? jsonTableColLabel(model, hit) : jsonT('jsonTableFieldAll');
    }
}

function jsonTableOpen() {
    if (!jsonLast || !jsonLast.ok) {
        showToast(jsonT('jsonNothing'), 'error');
        return;
    }
    // 表建在「输入」上，而不是格式化结果上：结果可能是每行一条被美化成多行，
    // 也可能被排序过——表格要看的是原始数据结构（第一层键）
    const text = jsonCurrentText() || (jsonLast && jsonLast.text) || '';
    const model = DBXJson.buildTable(text);
    if (!model.ok) {
        const err = model.error || {};
        if (err.code === 'tooLarge') {
            showToast(jsonT('jsonTableTooBig', {
                size: jsonFmtBytes(DBXJson.utf8Bytes(text)),
                max: jsonFmtBytes(DBXJson.LIMITS.tableInput)
            }), 'error', 4200);
        } else if (err.code === 'empty') {
            showToast(jsonT('jsonNothing'), 'error');
        } else {
            showToast(jsonT('jsonErrUnknown'), 'error');
        }
        return;
    }

    jsonTableModel = model;
    jsonTableScopeKey = '';
    jsonTablePrev = {
        editorHidden: jsonOutWrap ? jsonOutWrap.classList.contains('is-hidden') : false,
        previewHidden: jsonPreview ? jsonPreview.hidden : true,
        emptyHidden: jsonEmpty ? jsonEmpty.hidden : true
    };
    jsonTableOn = true;
    if (jsonTableEl) jsonTableEl.hidden = false;
    if (jsonOutWrap) jsonOutWrap.classList.add('is-hidden');
    if (jsonPreview) jsonPreview.hidden = true;
    if (jsonEmpty) jsonEmpty.hidden = true;
    if (jsonTableBtn) {
        jsonTableBtn.classList.add('is-on');
        jsonTableBtn.setAttribute('aria-pressed', 'true');
    }
    if (jsonTableQueryEl) jsonTableQueryEl.value = '';
    jsonTableRenderHead();
    jsonTableRenderScope();
    jsonTableRefilter();
    jsonTableShowCount();
}

function jsonTableToggle() {
    if (!jsonTableOn) {
        jsonTableOpen();
        return;
    }
    const prev = jsonTablePrev;
    jsonTableHide();
    jsonTablePrev = null;
    // 把刚才藏起来的那一层放回来（原来是编辑器的还是编辑器，是预览的还是预览）
    if (prev) {
        if (jsonOutWrap) jsonOutWrap.classList.toggle('is-hidden', prev.editorHidden);
        if (jsonPreview) jsonPreview.hidden = prev.previewHidden;
        if (jsonEmpty) jsonEmpty.hidden = prev.emptyHidden;
    }
}

if (jsonTableBtn) jsonTableBtn.addEventListener('click', jsonTableToggle);

if (jsonTableScroll) {
    jsonTableScroll.addEventListener('scroll', () => {
        if (jsonTableScrollRAF) return;
        jsonTableScrollRAF = requestAnimationFrame(() => {
            jsonTableScrollRAF = 0;
            jsonTableRenderWindow();
        });
    });
}

if (jsonTableQueryEl) {
    jsonTableQueryEl.addEventListener('input', () => {
        clearTimeout(jsonTableTimer);
        jsonTableTimer = setTimeout(jsonTableRefilter, 220);
    });
}

function jsonTableScopeOpen(open) {
    if (!jsonTableScopeEl) return;
    const opts = jsonTableScopeEl.querySelector('.custom-select-options');
    const trig = jsonTableScopeEl.querySelector('.custom-select-trigger');
    if (opts) opts.classList.toggle('open', !!open);
    if (trig) {
        trig.classList.toggle('active', !!open);
        trig.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
}

if (jsonTableScopeEl) {
    jsonTableScopeEl.addEventListener('click', (e) => {
        const pick = e.target.closest ? e.target.closest('.custom-option') : null;
        if (pick) {
            jsonTableScopeOpen(false);
            jsonTableScopeKey = pick.getAttribute('data-key') || '';
            jsonTableRenderScope();
            jsonTableRefilter();
            e.stopPropagation();
            return;
        }
        const opts = jsonTableScopeEl.querySelector('.custom-select-options');
        jsonTableScopeOpen(!opts.classList.contains('open'));
        e.stopPropagation();
    });
    jsonTableScopeEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            const trig = e.target.closest ? e.target.closest('.custom-select-trigger') : null;
            if (!trig) return;
            e.preventDefault();
            const opts = jsonTableScopeEl.querySelector('.custom-select-options');
            jsonTableScopeOpen(!opts.classList.contains('open'));
        } else if (e.key === 'Escape') {
            jsonTableScopeOpen(false);
        }
    });
}

/* ---------------------------- 单元格详情 ----------------------------
   表格一格只显示前几百字符，点开才给全文：短的用 <pre>，长的（或容器）丢进
   只读编辑器——几 MB 的 JSON 摊在 pre 里既难读也卡。 */

const jsonCellModal = document.getElementById('jsonCellModal');
const jsonCellBox = jsonCellModal ? jsonCellModal.querySelector('.json-cell-modal-box') : null;
const jsonCellTitleEl = document.getElementById('jsonCellTitle');
const jsonCellMeta = document.getElementById('jsonCellMeta');
const jsonCellPre = document.getElementById('jsonCellPre');
const jsonCellEditorWrap = document.getElementById('jsonCellEditorWrap');
const jsonCellEditorText = document.getElementById('jsonCellEditorText');
const jsonCellHint = document.getElementById('jsonCellHint');
const jsonCellCopyBtn = document.getElementById('jsonCellCopyBtn');
const jsonCellDoneBtn = document.getElementById('jsonCellDoneBtn');

let jsonCellEditor = null;
let jsonCellText = '';

function jsonCellEnsureEditor() {
    if (jsonCellEditor || !window.CodeMirror || !window.CodeMirror.fromTextArea) return;
    jsonCellEditor = CodeMirror.fromTextArea(jsonCellEditorText, Object.assign({}, commonConfig, {
        mode: 'application/json',
        readOnly: true,
        lineWrapping: true,
        foldGutter: false,
        gutters: ['CodeMirror-linenumbers'],
        styleActiveLine: false,
        autoCloseBrackets: false,
        matchBrackets: false
    }));
    jsonSyncEditorTheme();
}

function jsonCellOpen(colIndex, rowIndex) {
    if (!jsonTableModel || !jsonCellModal) return;
    const model = jsonTableModel;
    const rowAt = jsonTableRows[rowIndex];
    if (rowAt == null) return;
    const row = model.rows[rowAt];
    const col = model.columns[colIndex];
    if (!row || !col) return;

    const full = DBXJson.tableCellFull(row, col.key, model.kind);
    jsonCellText = full;
    if (jsonCellTitleEl) {
        jsonCellTitleEl.textContent = jsonT('jsonCellTitle', {
            key: jsonTableColLabel(model, col),
            row: rowAt + 1
        });
    }
    if (jsonCellMeta) {
        jsonCellMeta.textContent = jsonFmtBytes(DBXJson.utf8Bytes(full));
    }

    // 大文本 / 容器：用只读编辑器；小值用 pre 更轻
    const big = full.length > JSON_CELL_EDITOR_MIN;
    if (big) {
        jsonCellEnsureEditor();
        if (jsonCellEditor) {
            const mode = /^\s*[[{]/.test(full) ? 'application/json' : 'text/plain';
            jsonCellEditor.setOption('mode', mode);
            jsonCellEditor.setValue(full);
            jsonCellEditor.clearHistory();
        } else if (jsonCellPre) {
            jsonCellPre.textContent = full;
        }
    } else if (jsonCellPre) {
        jsonCellPre.textContent = full;
    }

    if (jsonCellPre) jsonCellPre.hidden = big;
    if (jsonCellEditorWrap) jsonCellEditorWrap.hidden = !big;
    // 小值不要撑成一块大白板，盒子跟着内容收
    if (jsonCellBox) jsonCellBox.classList.toggle('is-compact', !big);
    if (jsonCellHint) jsonCellHint.textContent = big ? jsonT('jsonCellBig') : '';
    jsonCellModal.hidden = false;
    if (big && jsonCellEditor) {
        requestAnimationFrame(() => {
            try { jsonCellEditor.refresh(); } catch (e) { /* noop */ }
            jsonCellEditor.focus();
        });
    }
}

function jsonCellClose() {
    if (!jsonCellModal || jsonCellModal.hidden) return;
    jsonCellModal.hidden = true;
    if (jsonCellEditor) {
        jsonCellEditor.setValue('');
        jsonCellEditor.clearHistory();
    }
    if (jsonCellPre) jsonCellPre.textContent = '';
    jsonCellText = '';
}

async function jsonCellCopy() {
    if (!jsonCellText) {
        showToast(jsonT('jsonNothing'), 'error');
        return;
    }
    if (jsonCellText.length > DBXJson.LIMITS.clipboard) {
        // 跟主复制按钮同一套原则：太大就存文件，不往剪贴板里塞几 MB
        const status = await saveTextFile('cell-value.json', jsonCellText, 'application/json;charset=utf-8');
        saveToast(status, jsonT('jsonExported', { name: 'cell-value.json' }));
        return;
    }
    try {
        await writeClipboardText(jsonCellText);
        showToast(jsonT('jsonCopied'));
    } catch (e) {
        showToast(jsonT('jsonNothing'), 'error');
    }
}

if (jsonTableRowsEl) {
    jsonTableRowsEl.addEventListener('click', (e) => {
        const cell = e.target.closest ? e.target.closest('.json-table-cell') : null;
        if (!cell) return;
        const rowEl = cell.parentElement;
        if (!rowEl) return;
        const colIndex = Array.prototype.indexOf.call(rowEl.children, cell);
        const top = parseFloat(rowEl.style.top) || 0;
        jsonCellOpen(colIndex, Math.round(top / JSON_TABLE_ROW_H));
    });
}

const jsonCellCloseBtn = document.getElementById('jsonCellClose');
if (jsonCellDoneBtn) jsonCellDoneBtn.addEventListener('click', jsonCellClose);
if (jsonCellCloseBtn) jsonCellCloseBtn.addEventListener('click', jsonCellClose);
if (jsonCellCopyBtn) jsonCellCopyBtn.addEventListener('click', jsonCellCopy);
if (jsonCellModal) {
    jsonCellModal.addEventListener('click', (e) => {
        if (e.target === jsonCellModal) jsonCellClose();
    });
}
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && jsonCellModal && !jsonCellModal.hidden) jsonCellClose();
});

/* 表格开着的时候换语言 / 窗口变化，头和列都要重铺一次 */
function jsonTableRefresh() {
    if (!jsonTableOn || !jsonTableModel) return;
    jsonTableRenderHead();
    jsonTableRenderScope();
    jsonTableRenderWindow();
    jsonTableShowCount();
}

// 首次进页面前把编辑器建好：徽标、空态都要它
ensureJsonInEditor();
ensureJsonOutEditor();
jsonShowEmpty(true);
jsonSyncCopyBtn();

/* 换主题时刷这一页的编辑器（09 的 syncEditorTheme 是硬编码清单，后加载的页进不去） */
if (typeof onEditorTheme === 'function') onEditorTheme(jsonSyncEditorTheme);

/* 切语言：静态文案由 applyI18n 铺，统计 / 错误 / 预览提示是本页拼的，得自己重铺一次 */
document.addEventListener('click', (e) => {
    if (!jsonModeActive) return;
    if (!e.target.closest || !e.target.closest('#langMenu .lang-option')) return;
    setTimeout(jsonApplyI18n, 0);
});

// 导航 / 切语言后重铺一次本页文案（24 在 08 之后加载，首次 applyI18n 时这张表还不在）
applyI18n();
