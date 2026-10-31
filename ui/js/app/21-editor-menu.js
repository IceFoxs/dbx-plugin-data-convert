/*
 * 21-editor-menu.js — 全项目 CodeMirror 共用的选区右键菜单。
 *
 * 入口只有一个：document 捕获阶段的 contextmenu，命中 .CodeMirror 才接管，
 * 别处保持原生。CodeMirror 5 把实例挂在 wrapper 上（wrapper.CodeMirror），
 * 所以不需要登记 15 个编辑器，也不用 monkey-patch 它的工厂函数。
 *
 * 两条硬规矩（都是踩过的坑）：
 *   1. 打开那一刻冻结快照。右键会把选区点没，之后再 getSelection() 拿到空串，
 *      「执行所选」就会变成「执行整段」；所有动作一律用 selState 里的快照。
 *   2. 成功必须看得见。写剪贴板失败、图片体积超限、宿主不让读剪贴板，
 *      都要给出具体原因——不能「点了没反应还说成功」。
 *
 * 转换规则本身在 ui/js/selectconv.js（纯函数，node 里测），这里只做 UI 与 IO。
 */
/* eslint-disable no-unused-vars */

/* 选区菜单的文案。转换类的「X 编码 / X 解码」直接拿 ESC_I18N 的 escKind* +
   escEncode/escDecode 拼，不在这里重复 14 种语言 × 16 项。 */
const SEL_I18N = {
    'zh-CN': {
        selHead: '{lines} 行 · {chars} 字符', selNone: '未选中内容',
        selCut: '剪切', selSelectAll: '全选', selPasteImage: '粘贴图片',
        selMoreEscape: '更多转义', selMoreTidy: '更多整理',
        selJoin: '拼接成一行', selQuote: '包引号',
        selTrim: '去首尾空白', selStripWs: '去所有空白', selDedupe: '按行去重',
        selSort: '排序 A→Z', selSortNum: '按数值排序', selReverse: '反转行序', selNumber: '加行号',
        selJoinComma: '逗号分隔', selJoinCn: '顿号分隔', selJoinSpace: '空格分隔',
        selUpper: '转为大写', selLower: '转为小写', selTitle: '转为标题式',
        selQuoteSingle: '单引号', selQuoteDouble: '双引号', selQuoteBacktick: '反引号',
        selJsonPretty: 'JSON 美化', selJsonMinify: 'JSON 压缩',
        selEscNewline: '转义换行', selUnescNewline: '还原换行',
        selSqlIn: '生成 IN 列表', selSqlNotIn: '生成 NOT IN 列表', selSqlInsert: '生成 INSERT 语句',
        selQrCopy: '复制为二维码图片', selQrOpen: '在二维码页打开',
        selCopyImage: '复制图片', selSaveImage: '保存图片',
        selDevNoSave: '开发宿主不支持保存文件，请用打包后的插件再试',
        selImgB64: 'Base64 纯文本', selImgDataUri: 'Data URI', selImgTag: '<img> 标签',
        selCopied: '{what} · 已复制（{size}）',
        selTooLarge: '内容超过 {n} 字符，请到对应功能页处理',
        selNoEngine: '转换引擎未加载', selBadJson: '不是合法 JSON', selNotNumeric: '含有非数字的行',
        selEmpty: '没有可转换的内容', selFail: '操作失败',
        selNoImage: '剪贴板里没有图片',
        selClipboardDenied: '当前环境不允许读取剪贴板图片，请按 {key}V 粘贴',
        selImgTooBig: '图片 {size}，超过 {max} 上限',
        selImgWarn: '图片 {size}，转成 Base64 会更大，继续？',
        selImgInserted: '已插入图片 {w}×{h} · {size}',
        selQrSaved: '剪贴板不接收图片，已存为 {name}',
        selQrSaveAs: '保存为 PNG 图片',
    },
    'zh-TW': {
        selHead: '{lines} 列 · {chars} 字元', selNone: '未選取內容',
        selCut: '剪下', selSelectAll: '全選', selPasteImage: '貼上圖片',
        selMoreEscape: '更多轉義', selMoreTidy: '更多整理',
        selJoin: '拼接成一行', selQuote: '包引號',
        selTrim: '去頭尾空白', selStripWs: '去所有空白', selDedupe: '依列去重',
        selSort: '排序 A→Z', selSortNum: '依數值排序', selReverse: '反轉列序', selNumber: '加列號',
        selJoinComma: '逗號分隔', selJoinCn: '頓號分隔', selJoinSpace: '空格分隔',
        selUpper: '轉為大寫', selLower: '轉為小寫', selTitle: '轉為標題式',
        selQuoteSingle: '單引號', selQuoteDouble: '雙引號', selQuoteBacktick: '反引號',
        selJsonPretty: 'JSON 美化', selJsonMinify: 'JSON 壓縮',
        selEscNewline: '轉義換行', selUnescNewline: '還原換行',
        selSqlIn: '產生 IN 清單', selSqlNotIn: '產生 NOT IN 清單', selSqlInsert: '產生 INSERT 語句',
        selQrCopy: '複製為 QR 圖片', selQrOpen: '在 QR 頁開啟',
        selCopyImage: '複製圖片', selSaveImage: '儲存圖片',
        selDevNoSave: '開發宿主不支援儲存檔案，請用打包後的插件再試',
        selImgB64: 'Base64 純文字', selImgDataUri: 'Data URI', selImgTag: '<img> 標籤',
        selCopied: '{what} · 已複製（{size}）',
        selTooLarge: '內容超過 {n} 字元，請到對應功能頁處理',
        selNoEngine: '轉換引擎未載入', selBadJson: '不是合法 JSON', selNotNumeric: '含有非數字列',
        selEmpty: '沒有可轉換的內容', selFail: '操作失敗',
        selNoImage: '剪貼簿裡沒有圖片',
        selClipboardDenied: '目前環境不允許讀取剪貼簿圖片，請按 {key}V 貼上',
        selImgTooBig: '圖片 {size}，超過 {max} 上限',
        selImgWarn: '圖片 {size}，轉成 Base64 會更大，繼續？',
        selImgInserted: '已插入圖片 {w}×{h} · {size}',
        selQrSaved: '剪貼簿不收圖片，已存為 {name}',
        selQrSaveAs: '儲存為 PNG 圖片',
    },
    'en': {
        selHead: '{lines} lines · {chars} chars', selNone: 'Nothing selected',
        selCut: 'Cut', selSelectAll: 'Select all', selPasteImage: 'Paste image',
        selMoreEscape: 'More escapes', selMoreTidy: 'More cleanups',
        selJoin: 'Join into one line', selQuote: 'Wrap in quotes',
        selTrim: 'Trim each line', selStripWs: 'Strip all whitespace', selDedupe: 'Remove duplicate lines',
        selSort: 'Sort A→Z', selSortNum: 'Sort numerically', selReverse: 'Reverse line order', selNumber: 'Add line numbers',
        selJoinComma: 'Comma separated', selJoinCn: 'Ideographic comma separated', selJoinSpace: 'Space separated',
        selUpper: 'To uppercase', selLower: 'To lowercase', selTitle: 'To title case',
        selQuoteSingle: 'Single quotes', selQuoteDouble: 'Double quotes', selQuoteBacktick: 'Backticks',
        selJsonPretty: 'Pretty-print JSON', selJsonMinify: 'Minify JSON',
        selEscNewline: 'Escape newlines', selUnescNewline: 'Restore newlines',
        selSqlIn: 'Build IN list', selSqlNotIn: 'Build NOT IN list', selSqlInsert: 'Build INSERT',
        selQrCopy: 'Copy as QR image', selQrOpen: 'Open in QR page',
        selCopyImage: 'Copy image', selSaveImage: 'Save image',
        selDevNoSave: 'The dev host cannot save files — try the packaged plugin',
        selImgB64: 'Plain Base64', selImgDataUri: 'Data URI', selImgTag: '<img> tag',
        selCopied: '{what} · copied ({size})',
        selTooLarge: 'Over {n} characters — use the dedicated page',
        selNoEngine: 'Conversion engine not loaded', selBadJson: 'Not valid JSON', selNotNumeric: 'Some lines are not numeric',
        selEmpty: 'Nothing to convert', selFail: 'Action failed',
        selNoImage: 'No image in the clipboard',
        selClipboardDenied: 'This environment blocks clipboard images — press {key}V',
        selImgTooBig: 'Image is {size}, over the {max} limit',
        selImgWarn: 'Image is {size}; Base64 will be larger. Continue?',
        selImgInserted: 'Image inserted {w}×{h} · {size}',
        selQrSaved: 'Clipboard refused the image — saved as {name}',
        selQrSaveAs: 'Save as PNG image',
    },
    'az': {
        selHead: '{lines} sətir · {chars} simvol', selNone: 'Seçim yoxdur',
        selCut: 'Kəs', selSelectAll: 'Hamısını seç', selPasteImage: 'Şəkil yapışdır',
        selMoreEscape: 'Digər escaping', selMoreTidy: 'Digər tənzimləmə',
        selJoin: 'Bir sətrə birləşdir', selQuote: 'Dırnağa al',
        selTrim: 'Baş/son boşluqları sil', selStripWs: 'Bütün boşluqları sil', selDedupe: 'Təkrar sətirləri sil',
        selSort: 'Sırala A→Z', selSortNum: 'Rəqəmə görə sırala', selReverse: 'Sətir sırasını tərsinə çevir', selNumber: 'Sətir nömrəsi əlavə et',
        selJoinComma: 'Vergüllə ayır', selJoinCn: 'İdeografik vergüllə ayır', selJoinSpace: 'Boşluqla ayır',
        selUpper: 'Böyük hərfə çevir', selLower: 'Kiçik hərfə çevir', selTitle: 'Başlıq formasına çevir',
        selQuoteSingle: 'Tək dırnaq', selQuoteDouble: 'İkiqat dırnaq', selQuoteBacktick: 'Backtick',
        selJsonPretty: 'JSON-u gözəlləşdir', selJsonMinify: 'JSON-u sıx',
        selEscNewline: 'Sətir keçidini escaping et', selUnescNewline: 'Sətir keçidini bərpa et',
        selSqlIn: 'IN siyahısı yarat', selSqlNotIn: 'NOT IN siyahısı yarat', selSqlInsert: 'INSERT ifadəsi yarat',
        selQrCopy: 'QR kod kimi kopyala', selQrOpen: 'QR səhifəsində aç',
        selCopyImage: 'Şəkli kopyala', selSaveImage: 'Şəkli saxla',
        selDevNoSave: 'Dev host fayl saxlaya bilmir — paketlənmiş plaqini yoxlayın',
        selImgB64: 'Base64 mətni', selImgDataUri: 'Data URI', selImgTag: '<img> teqi',
        selCopied: '{what} · kopyalandı ({size})',
        selTooLarge: 'Mətn {n} simvolu aşır — müvafiq səhifədə işləyin',
        selNoEngine: 'Çevirmə mühərriki yüklənməyib', selBadJson: 'Düzgün JSON deyil', selNotNumeric: 'Rəqəm olmayan sətirlər var',
        selEmpty: 'Çevriləcək məzmun yoxdur', selFail: 'Əməliyyat alınmadı',
        selNoImage: 'Buferdə şəkil yoxdur',
        selClipboardDenied: 'Bu mühit buferdəki şəkli oxumağa icazə vermir — {key}V basın',
        selImgTooBig: 'Şəkil {size} — {max} həddini aşır',
        selImgWarn: 'Şəkil {size} — Base64 daha böyük olacaq, davam edilsin?',
        selImgInserted: 'Şəkil yerləşdirildi {w}×{h} · {size}',
        selQrSaved: 'Bufer şəkil qəbul etmir — {name} kimi saxlanıldı',
        selQrSaveAs: 'PNG şəkil kimi saxla',
    },
    'es': {
        selHead: '{lines} líneas · {chars} caracteres', selNone: 'Nada seleccionado',
        selCut: 'Cortar', selSelectAll: 'Seleccionar todo', selPasteImage: 'Pegar imagen',
        selMoreEscape: 'Más escapes', selMoreTidy: 'Más limpieza',
        selJoin: 'Unir en una línea', selQuote: 'Entrecomillar',
        selTrim: 'Quitar espacios de los bordes', selStripWs: 'Quitar todos los espacios', selDedupe: 'Quitar líneas repetidas',
        selSort: 'Ordenar A→Z', selSortNum: 'Ordenar por número', selReverse: 'Invertir orden de líneas', selNumber: 'Numerar líneas',
        selJoinComma: 'Separar por coma', selJoinCn: 'Separar por coma ideográfica', selJoinSpace: 'Separar por espacio',
        selUpper: 'A mayúsculas', selLower: 'A minúsculas', selTitle: 'Formato de título',
        selQuoteSingle: 'Comilla simple', selQuoteDouble: 'Comilla doble', selQuoteBacktick: 'Acento grave',
        selJsonPretty: 'Formatear JSON', selJsonMinify: 'Minificar JSON',
        selEscNewline: 'Escapar saltos de línea', selUnescNewline: 'Restaurar saltos de línea',
        selSqlIn: 'Generar lista IN', selSqlNotIn: 'Generar lista NOT IN', selSqlInsert: 'Generar INSERT',
        selQrCopy: 'Copiar como imagen QR', selQrOpen: 'Abrir en la página QR',
        selCopyImage: 'Copiar imagen', selSaveImage: 'Guardar imagen',
        selDevNoSave: 'El host de desarrollo no puede guardar archivos: prueba el plugin empaquetado',
        selImgB64: 'Base64 puro', selImgDataUri: 'Data URI', selImgTag: 'Etiqueta <img>',
        selCopied: '{what} · copiado ({size})',
        selTooLarge: 'El contenido supera {n} caracteres: usa la página correspondiente',
        selNoEngine: 'Motor de conversión no cargado', selBadJson: 'No es JSON válido', selNotNumeric: 'Hay líneas que no son números',
        selEmpty: 'No hay nada que convertir', selFail: 'La operación falló',
        selNoImage: 'No hay imágenes en el portapapeles',
        selClipboardDenied: 'Este entorno no permite leer imágenes del portapapeles: pulsa {key}V',
        selImgTooBig: 'La imagen {size} supera el límite {max}',
        selImgWarn: 'La imagen {size}: Base64 será mayor. ¿Continuar?',
        selImgInserted: 'Imagen insertada {w}×{h} · {size}',
        selQrSaved: 'El portapapeles no acepta imágenes: guardado como {name}',
        selQrSaveAs: 'Guardar como imagen PNG',
    },
    'id': {
        selHead: '{lines} baris · {chars} karakter', selNone: 'Tidak ada pilihan',
        selCut: 'Potong', selSelectAll: 'Pilih semua', selPasteImage: 'Tempel gambar',
        selMoreEscape: 'Escape lainnya', selMoreTidy: 'Rapikan lainnya',
        selJoin: 'Gabung jadi satu baris', selQuote: 'Beri tanda kutip',
        selTrim: 'Hapus spasi di ujung', selStripWs: 'Hapus semua spasi', selDedupe: 'Hapus baris duplikat',
        selSort: 'Urutkan A→Z', selSortNum: 'Urutkan berdasarkan angka', selReverse: 'Balik urutan baris', selNumber: 'Beri nomor baris',
        selJoinComma: 'Pisahkan dengan koma', selJoinCn: 'Pisahkan dengan koma ideografis', selJoinSpace: 'Pisahkan dengan spasi',
        selUpper: 'Jadi huruf besar', selLower: 'Jadi huruf kecil', selTitle: 'Jadi huruf kapital di awal',
        selQuoteSingle: 'Kutip tunggal', selQuoteDouble: 'Kutip ganda', selQuoteBacktick: 'Backtick',
        selJsonPretty: 'Rapikan JSON', selJsonMinify: 'Padatkan JSON',
        selEscNewline: 'Escape baris baru', selUnescNewline: 'Kembalikan baris baru',
        selSqlIn: 'Buat daftar IN', selSqlNotIn: 'Buat daftar NOT IN', selSqlInsert: 'Buat INSERT',
        selQrCopy: 'Salin sebagai gambar QR', selQrOpen: 'Buka di halaman QR',
        selCopyImage: 'Salin gambar', selSaveImage: 'Simpan gambar',
        selDevNoSave: 'Host dev tidak bisa menyimpan berkas — coba plugin yang sudah dipaketkan',
        selImgB64: 'Base64 murni', selImgDataUri: 'Data URI', selImgTag: 'Tag <img>',
        selCopied: '{what} · disalin ({size})',
        selTooLarge: 'Isi melebihi {n} karakter — pakai halaman fiturnya',
        selNoEngine: 'Mesin konversi belum dimuat', selBadJson: 'Bukan JSON yang valid', selNotNumeric: 'Ada baris yang bukan angka',
        selEmpty: 'Tidak ada yang bisa dikonversi', selFail: 'Operasi gagal',
        selNoImage: 'Tidak ada gambar di clipboard',
        selClipboardDenied: 'Lingkungan ini tidak mengizinkan membaca gambar dari clipboard — tekan {key}V',
        selImgTooBig: 'Gambar {size} melebihi batas {max}',
        selImgWarn: 'Gambar {size} — Base64 akan lebih besar. Lanjutkan?',
        selImgInserted: 'Gambar disisipkan {w}×{h} · {size}',
        selQrSaved: 'Clipboard tidak menerima gambar — disimpan sebagai {name}',
        selQrSaveAs: 'Simpan sebagai gambar PNG',
    },
    'it': {
        selHead: '{lines} righe · {chars} caratteri', selNone: 'Nessuna selezione',
        selCut: 'Taglia', selSelectAll: 'Seleziona tutto', selPasteImage: 'Incolla immagine',
        selMoreEscape: 'Altre codifiche', selMoreTidy: 'Altre pulizie',
        selJoin: 'Unisci in una riga', selQuote: 'Racchiudi tra apici',
        selTrim: 'Togli spazi ai bordi', selStripWs: 'Togli tutti gli spazi', selDedupe: 'Rimuovi righe duplicate',
        selSort: 'Ordina A→Z', selSortNum: 'Ordina per numero', selReverse: 'Inverti ordine righe', selNumber: 'Aggiungi numeri di riga',
        selJoinComma: 'Separati da virgola', selJoinCn: 'Separati da virgola ideografica', selJoinSpace: 'Separati da spazio',
        selUpper: 'In maiuscolo', selLower: 'In minuscolo', selTitle: 'In maiuscolo iniziale',
        selQuoteSingle: 'Apice singolo', selQuoteDouble: 'Doppio apice', selQuoteBacktick: 'Backtick',
        selJsonPretty: 'Formatta JSON', selJsonMinify: 'Minifica JSON',
        selEscNewline: 'Codifica gli a capo', selUnescNewline: 'Ripristina gli a capo',
        selSqlIn: 'Genera lista IN', selSqlNotIn: 'Genera lista NOT IN', selSqlInsert: 'Genera INSERT',
        selQrCopy: 'Copia come immagine QR', selQrOpen: 'Apri nella pagina QR',
        selCopyImage: 'Copia immagine', selSaveImage: 'Salva immagine',
        selDevNoSave: 'L\'host di sviluppo non salva file: prova il plugin pacchettizzato',
        selImgB64: 'Base64 puro', selImgDataUri: 'Data URI', selImgTag: 'Tag <img>',
        selCopied: '{what} · copiato ({size})',
        selTooLarge: 'Il contenuto supera {n} caratteri: usa la pagina dedicata',
        selNoEngine: 'Motore di conversione non caricato', selBadJson: 'Non è JSON valido', selNotNumeric: 'Ci sono righe non numeriche',
        selEmpty: 'Niente da convertire', selFail: 'Operazione non riuscita',
        selNoImage: 'Nessuna immagine negli appunti',
        selClipboardDenied: 'Questo ambiente non permette di leggere immagini dagli appunti: premi {key}V',
        selImgTooBig: "L'immagine {size} supera il limite {max}",
        selImgWarn: "L'immagine {size}: Base64 sarà più grande. Continuare?",
        selImgInserted: 'Immagine inserita {w}×{h} · {size}',
        selQrSaved: 'Gli appunti non accettano immagini: salvata come {name}',
        selQrSaveAs: 'Salva come immagine PNG',
    },
    'ja': {
        selHead: '{lines} 行 · {chars} 文字', selNone: '選択なし',
        selCut: '切り取り', selSelectAll: 'すべて選択', selPasteImage: '画像を貼り付け',
        selMoreEscape: 'その他のエスケープ', selMoreTidy: 'その他の整形',
        selJoin: '1 行に連結', selQuote: '引用符で囲む',
        selTrim: '前後の空白を削除', selStripWs: 'すべての空白を削除', selDedupe: '重複行を削除',
        selSort: 'A→Z で並べ替え', selSortNum: '数値で並べ替え', selReverse: '行順を反転', selNumber: '行番号を付与',
        selJoinComma: 'カンマ区切り', selJoinCn: '読点区切り', selJoinSpace: 'スペース区切り',
        selUpper: '大文字に変換', selLower: '小文字に変換', selTitle: 'タイトルケースに変換',
        selQuoteSingle: 'シングルクォート', selQuoteDouble: 'ダブルクォート', selQuoteBacktick: 'バッククォート',
        selJsonPretty: 'JSON を整形', selJsonMinify: 'JSON を圧縮',
        selEscNewline: '改行をエスケープ', selUnescNewline: '改行に戻す',
        selSqlIn: 'IN リストを生成', selSqlNotIn: 'NOT IN リストを生成', selSqlInsert: 'INSERT を生成',
        selQrCopy: 'QR コード画像としてコピー', selQrOpen: 'QR ページで開く',
        selCopyImage: '画像をコピー', selSaveImage: '画像を保存',
        selDevNoSave: '開発用ホストはファイルを保存できません。パッケージ版のプラグインで試してください',
        selImgB64: 'Base64 のみ', selImgDataUri: 'Data URI', selImgTag: '<img> タグ',
        selCopied: '{what} · コピーしました（{size}）',
        selTooLarge: '内容が {n} 文字を超えています。専用ページで処理してください',
        selNoEngine: '変換エンジンが読み込まれていません', selBadJson: '正しい JSON ではありません', selNotNumeric: '数値でない行があります',
        selEmpty: '変換できる内容がありません', selFail: '操作に失敗しました',
        selNoImage: 'クリップボードに画像がありません',
        selClipboardDenied: 'この環境ではクリップボードの画像を読めません。{key}V で貼り付けてください',
        selImgTooBig: '画像 {size} は上限 {max} を超えています',
        selImgWarn: '画像 {size}。Base64 はさらに大きくなります。続けますか？',
        selImgInserted: '画像を挿入しました {w}×{h} · {size}',
        selQrSaved: 'クリップボードが画像を受け付けません。{name} として保存しました',
        selQrSaveAs: 'PNG 画像として保存',
    },
    'ko': {
        selHead: '{lines}행 · {chars}자', selNone: '선택 없음',
        selCut: '잘라내기', selSelectAll: '전체 선택', selPasteImage: '이미지 붙여넣기',
        selMoreEscape: '기타 이스케이프', selMoreTidy: '기타 정리',
        selJoin: '한 줄로 합치기', selQuote: '따옴표로 감싸기',
        selTrim: '앞뒤 공백 제거', selStripWs: '모든 공백 제거', selDedupe: '중복 행 제거',
        selSort: 'A→Z 정렬', selSortNum: '숫자로 정렬', selReverse: '행 순서 뒤집기', selNumber: '행 번호 붙이기',
        selJoinComma: '쉼표로 구분', selJoinCn: '모점으로 구분', selJoinSpace: '공백으로 구분',
        selUpper: '대문자로', selLower: '소문자로', selTitle: '제목 형식으로',
        selQuoteSingle: '작은따옴표', selQuoteDouble: '큰따옴표', selQuoteBacktick: '백틱',
        selJsonPretty: 'JSON 정리', selJsonMinify: 'JSON 압축',
        selEscNewline: '줄바꿈 이스케이프', selUnescNewline: '줄바꿈 복원',
        selSqlIn: 'IN 목록 생성', selSqlNotIn: 'NOT IN 목록 생성', selSqlInsert: 'INSERT 생성',
        selQrCopy: 'QR 코드 이미지로 복사', selQrOpen: 'QR 페이지에서 열기',
        selCopyImage: '이미지 복사', selSaveImage: '이미지 저장',
        selDevNoSave: '개발 호스트는 파일을 저장할 수 없습니다. 패키징된 플러그인으로 시도해 보세요',
        selImgB64: 'Base64 원문', selImgDataUri: 'Data URI', selImgTag: '<img> 태그',
        selCopied: '{what} · 복사됨({size})',
        selTooLarge: '내용이 {n}자를 넘습니다. 해당 기능 페이지를 사용하세요',
        selNoEngine: '변환 엔진이 로드되지 않았습니다', selBadJson: '올바른 JSON이 아닙니다', selNotNumeric: '숫자가 아닌 행이 있습니다',
        selEmpty: '변환할 내용이 없습니다', selFail: '작업 실패',
        selNoImage: '클립보드에 이미지가 없습니다',
        selClipboardDenied: '이 환경에서는 클립보드 이미지를 읽을 수 없습니다. {key}V로 붙여넣으세요',
        selImgTooBig: '이미지 {size} — {max} 한도를 넘습니다',
        selImgWarn: '이미지 {size} — Base64는 더 커집니다. 계속할까요?',
        selImgInserted: '이미지 삽입됨 {w}×{h} · {size}',
        selQrSaved: '클립보드가 이미지를 받지 않습니다. {name}으로 저장했습니다',
        selQrSaveAs: 'PNG 이미지로 저장',
    },
    'pt': {
        selHead: '{lines} linhas · {chars} caracteres', selNone: 'Nada selecionado',
        selCut: 'Recortar', selSelectAll: 'Selecionar tudo', selPasteImage: 'Colar imagem',
        selMoreEscape: 'Mais escapes', selMoreTidy: 'Mais ajustes',
        selJoin: 'Juntar em uma linha', selQuote: 'Pôr entre aspas',
        selTrim: 'Tirar espaços das pontas', selStripWs: 'Tirar todos os espaços', selDedupe: 'Remover linhas repetidas',
        selSort: 'Ordenar A→Z', selSortNum: 'Ordenar por número', selReverse: 'Inverter ordem das linhas', selNumber: 'Numerar linhas',
        selJoinComma: 'Separar por vírgula', selJoinCn: 'Separar por vírgula ideográfica', selJoinSpace: 'Separar por espaço',
        selUpper: 'Maiúsculas', selLower: 'Minúsculas', selTitle: 'Formato de título',
        selQuoteSingle: 'Aspas simples', selQuoteDouble: 'Aspas duplas', selQuoteBacktick: 'Crase',
        selJsonPretty: 'Formatar JSON', selJsonMinify: 'Minificar JSON',
        selEscNewline: 'Escapar quebras de linha', selUnescNewline: 'Restaurar quebras de linha',
        selSqlIn: 'Gerar lista IN', selSqlNotIn: 'Gerar lista NOT IN', selSqlInsert: 'Gerar INSERT',
        selQrCopy: 'Copiar como imagem QR', selQrOpen: 'Abrir na página de QR',
        selCopyImage: 'Copiar imagem', selSaveImage: 'Salvar imagem',
        selDevNoSave: 'O host de desenvolvimento não salva arquivos — use o plugin empacotado',
        selImgB64: 'Base64 puro', selImgDataUri: 'Data URI', selImgTag: 'Tag <img>',
        selCopied: '{what} · copiado ({size})',
        selTooLarge: 'O conteúdo passa de {n} caracteres — use a página do recurso',
        selNoEngine: 'Motor de conversão não carregado', selBadJson: 'Não é JSON válido', selNotNumeric: 'Há linhas não numéricas',
        selEmpty: 'Nada para converter', selFail: 'Falha na operação',
        selNoImage: 'Nenhuma imagem na área de transferência',
        selClipboardDenied: 'Este ambiente não permite ler imagens da área de transferência — use {key}V',
        selImgTooBig: 'Imagem {size} passa do limite {max}',
        selImgWarn: 'Imagem {size} — o Base64 ficará maior. Continuar?',
        selImgInserted: 'Imagem inserida {w}×{h} · {size}',
        selQrSaved: 'A área de transferência não aceita imagens — salvo como {name}',
        selQrSaveAs: 'Salvar como imagem PNG',
    },
    'pl': {
        selHead: '{lines} wierszy · {chars} znaków', selNone: 'Brak zaznaczenia',
        selCut: 'Wytnij', selSelectAll: 'Zaznacz wszystko', selPasteImage: 'Wklej obraz',
        selMoreEscape: 'Więcej kodowania', selMoreTidy: 'Więcej porządkowania',
        selJoin: 'Połącz w jedną linię', selQuote: 'Ujmij w cudzysłów',
        selTrim: 'Usuń spacje na brzegach', selStripWs: 'Usuń wszystkie spacje', selDedupe: 'Usuń duplikaty wierszy',
        selSort: 'Sortuj A→Z', selSortNum: 'Sortuj liczbowo', selReverse: 'Odwróć kolejność', selNumber: 'Dodaj numery wierszy',
        selJoinComma: 'Oddziel przecinkiem', selJoinCn: 'Oddziel przecinkiem ideograficznym', selJoinSpace: 'Oddziel spacją',
        selUpper: 'Na wielkie litery', selLower: 'Na małe litery', selTitle: 'Na tytułową',
        selQuoteSingle: 'Pojedynczy cudzysłów', selQuoteDouble: 'Podwójny cudzysłów', selQuoteBacktick: 'Odwrotny apostrof',
        selJsonPretty: 'Formatuj JSON', selJsonMinify: 'Minifikuj JSON',
        selEscNewline: 'Zakoduj nowe linie', selUnescNewline: 'Przywróć nowe linie',
        selSqlIn: 'Zbuduj listę IN', selSqlNotIn: 'Zbuduj listę NOT IN', selSqlInsert: 'Zbuduj INSERT',
        selQrCopy: 'Kopiuj jako kod QR', selQrOpen: 'Otwórz na stronie QR',
        selCopyImage: 'Kopiuj obraz', selSaveImage: 'Zapisz obraz',
        selDevNoSave: 'Host deweloperski nie zapisuje plików — użyj spakowanego pluginu',
        selImgB64: 'Czysty Base64', selImgDataUri: 'Data URI', selImgTag: 'Znacznik <img>',
        selCopied: '{what} · skopiowano ({size})',
        selTooLarge: 'Treść przekracza {n} znaków — użyj osobnej strony',
        selNoEngine: 'Silnik konwersji nie jest załadowany', selBadJson: 'To nie jest poprawny JSON', selNotNumeric: 'Są wiersze nienumeryczne',
        selEmpty: 'Nie ma czego konwertować', selFail: 'Operacja nie powiodła się',
        selNoImage: 'W schowku nie ma obrazu',
        selClipboardDenied: 'To środowisko nie pozwala czytać obrazu ze schowka — naciśnij {key}V',
        selImgTooBig: 'Obraz {size} przekracza limit {max}',
        selImgWarn: 'Obraz {size} — Base64 będzie większy. Kontynuować?',
        selImgInserted: 'Wstawiono obraz {w}×{h} · {size}',
        selQrSaved: 'Schowek nie przyjmuje obrazów — zapisano jako {name}',
        selQrSaveAs: 'Zapisz jako obraz PNG',
    },
    'ru': {
        selHead: '{lines} строк · {chars} символов', selNone: 'Ничего не выделено',
        selCut: 'Вырезать', selSelectAll: 'Выделить всё', selPasteImage: 'Вставить изображение',
        selMoreEscape: 'Другие экранирования', selMoreTidy: 'Другое форматирование',
        selJoin: 'Склеить в одну строку', selQuote: 'Взять в кавычки',
        selTrim: 'Убрать пробелы по краям', selStripWs: 'Убрать все пробелы', selDedupe: 'Убрать дубли строк',
        selSort: 'Сортировать A→Z', selSortNum: 'Сортировать по числу', selReverse: 'Обратный порядок строк', selNumber: 'Добавить номера строк',
        selJoinComma: 'Через запятую', selJoinCn: 'Через идеографическую запятую', selJoinSpace: 'Через пробел',
        selUpper: 'В верхний регистр', selLower: 'В нижний регистр', selTitle: 'В заголовочный регистр',
        selQuoteSingle: 'Одинарные кавычки', selQuoteDouble: 'Двойные кавычки', selQuoteBacktick: 'Обратные кавычки',
        selJsonPretty: 'Форматировать JSON', selJsonMinify: 'Сжать JSON',
        selEscNewline: 'Экранировать переводы строк', selUnescNewline: 'Вернуть переводы строк',
        selSqlIn: 'Собрать список IN', selSqlNotIn: 'Собрать список NOT IN', selSqlInsert: 'Собрать INSERT',
        selQrCopy: 'Копировать как QR-код', selQrOpen: 'Открыть на странице QR',
        selCopyImage: 'Копировать изображение', selSaveImage: 'Сохранить изображение',
        selDevNoSave: 'Хост разработки не сохраняет файлы — используйте собранный плагин',
        selImgB64: 'Чистый Base64', selImgDataUri: 'Data URI', selImgTag: 'Тег <img>',
        selCopied: '{what} · скопировано ({size})',
        selTooLarge: 'Текст больше {n} символов — откройте отдельную страницу',
        selNoEngine: 'Движок преобразований не загружен', selBadJson: 'Это не корректный JSON', selNotNumeric: 'Есть строки без чисел',
        selEmpty: 'Нечего преобразовывать', selFail: 'Не удалось выполнить',
        selNoImage: 'В буфере обмена нет изображения',
        selClipboardDenied: 'Среда не разрешает читать изображение из буфера — нажмите {key}V',
        selImgTooBig: 'Изображение {size} превышает предел {max}',
        selImgWarn: 'Изображение {size} — Base64 будет больше. Продолжить?',
        selImgInserted: 'Вставлено изображение {w}×{h} · {size}',
        selQrSaved: 'Буфер не принимает изображения — сохранено как {name}',
        selQrSaveAs: 'Сохранить как PNG',
    },
    'th': {
        selHead: '{lines} บรรทัด · {chars} ตัวอักษร', selNone: 'ยังไม่ได้เลือก',
        selCut: 'ตัด', selSelectAll: 'เลือกทั้งหมด', selPasteImage: 'วางรูปภาพ',
        selMoreEscape: 'การ escape อื่น ๆ', selMoreTidy: 'จัดรูปแบบอื่น ๆ',
        selJoin: 'รวมเป็นบรรทัดเดียว', selQuote: 'ใส่เครื่องหมายคำพูด',
        selTrim: 'ตัดช่องว่างหัวท้าย', selStripWs: 'ลบช่องว่างทั้งหมด', selDedupe: 'ลบบรรทัดซ้ำ',
        selSort: 'เรียง A→Z', selSortNum: 'เรียงตามตัวเลข', selReverse: 'กลับลำดับบรรทัด', selNumber: 'ใส่เลขบรรทัด',
        selJoinComma: 'คั่นด้วยจุลภาค', selJoinCn: 'คั่นด้วยอิดีโอกราฟิกคอมมา', selJoinSpace: 'คั่นด้วยช่องว่าง',
        selUpper: 'เป็นตัวพิมพ์ใหญ่', selLower: 'เป็นตัวพิมพ์เล็ก', selTitle: 'เป็นตัวพิมพ์แบบหัวเรื่อง',
        selQuoteSingle: 'อัญประกาศเดี่ยว', selQuoteDouble: 'อัญประกาศคู่', selQuoteBacktick: 'แบ็กทิก',
        selJsonPretty: 'จัดรูป JSON', selJsonMinify: 'ย่อ JSON',
        selEscNewline: 'escape ตัวขึ้นบรรทัด', selUnescNewline: 'คืนค่าตัวขึ้นบรรทัด',
        selSqlIn: 'สร้างรายการ IN', selSqlNotIn: 'สร้างรายการ NOT IN', selSqlInsert: 'สร้าง INSERT',
        selQrCopy: 'คัดลอกเป็นภาพ QR', selQrOpen: 'เปิดในหน้า QR',
        selCopyImage: 'คัดลอกรูป', selSaveImage: 'บันทึกรูป',
        selDevNoSave: 'โฮสต์สำหรับพัฒนาบันทึกไฟล์ไม่ได้ — ลองใช้ปลั๊กอินที่แพ็กเกจแล้ว',
        selImgB64: 'Base64 ล้วน', selImgDataUri: 'Data URI', selImgTag: 'แท็ก <img>',
        selCopied: '{what} · คัดลอกแล้ว ({size})',
        selTooLarge: 'เนื้อหายาวเกิน {n} ตัวอักษร — ใช้หน้าฟีเจอร์นั้นแทน',
        selNoEngine: 'ยังไม่ได้โหลดเอนจินแปลง', selBadJson: 'ไม่ใช่ JSON ที่ถูกต้อง', selNotNumeric: 'มีบรรทัดที่ไม่ใช่ตัวเลข',
        selEmpty: 'ไม่มีเนื้อหาให้แปลง', selFail: 'ดำเนินการไม่สำเร็จ',
        selNoImage: 'ไม่มีรูปในคลิปบอร์ด',
        selClipboardDenied: 'สภาพแวดล้อมนี้ไม่อนุญาตให้อ่านรูปจากคลิปบอร์ด — กด {key}V',
        selImgTooBig: 'รูป {size} เกินขีดจำกัด {max}',
        selImgWarn: 'รูป {size} — Base64 จะใหญ่ขึ้น ดำเนินการต่อ?',
        selImgInserted: 'แทรกรูปแล้ว {w}×{h} · {size}',
        selQrSaved: 'คลิปบอร์ดไม่รับรูป — บันทึกเป็น {name}',
        selQrSaveAs: 'บันทึกเป็นรูป PNG',
    },
    'tr': {
        selHead: '{lines} satır · {chars} karakter', selNone: 'Seçim yok',
        selCut: 'Kes', selSelectAll: 'Tümünü seç', selPasteImage: 'Resim yapıştır',
        selMoreEscape: 'Diğer kaçışlar', selMoreTidy: 'Diğer düzenlemeler',
        selJoin: 'Tek satıra birleştir', selQuote: 'Tırnağa al',
        selTrim: 'Baş/son boşlukları at', selStripWs: 'Tüm boşlukları sil', selDedupe: 'Yinelenen satırları at',
        selSort: 'A→Z sırala', selSortNum: 'Sayıya göre sırala', selReverse: 'Satır sırasını ters çevir', selNumber: 'Satır numarası ekle',
        selJoinComma: 'Virgülle ayır', selJoinCn: 'İdeografik virgülle ayır', selJoinSpace: 'Boşlukla ayır',
        selUpper: 'Büyük harfe çevir', selLower: 'Küçük harfe çevir', selTitle: 'Başlık biçimine çevir',
        selQuoteSingle: 'Tek tırnak', selQuoteDouble: 'Çift tırnak', selQuoteBacktick: 'Ters tırnak',
        selJsonPretty: 'JSON biçimlendir', selJsonMinify: 'JSON sıkıştır',
        selEscNewline: 'Satır sonlarını kaçır', selUnescNewline: 'Satır sonlarını geri al',
        selSqlIn: 'IN listesi üret', selSqlNotIn: 'NOT IN listesi üret', selSqlInsert: 'INSERT üret',
        selQrCopy: 'QR kod olarak kopyala', selQrOpen: 'QR sayfasında aç',
        selCopyImage: 'Görseli kopyala', selSaveImage: 'Görseli kaydet',
        selDevNoSave: 'Geliştirme ana bilgisayarı dosya kaydedemiyor — paketlenmiş eklentiyi deneyin',
        selImgB64: 'Düz Base64', selImgDataUri: 'Data URI', selImgTag: '<img> etiketi',
        selCopied: '{what} · kopyalandı ({size})',
        selTooLarge: 'Metin {n} karakteri aşıyor — ilgili sayfayı kullanın',
        selNoEngine: 'Dönüştürme motoru yüklenmedi', selBadJson: 'Geçerli JSON değil', selNotNumeric: 'Sayı olmayan satırlar var',
        selEmpty: 'Dönüştürülecek içerik yok', selFail: 'İşlem başarısız',
        selNoImage: 'Panoda resim yok',
        selClipboardDenied: 'Bu ortam panodaki resmi okumaya izin vermiyor — {key}V basın',
        selImgTooBig: 'Resim {size} — {max} sınırını aşıyor',
        selImgWarn: 'Resim {size} — Base64 daha büyük olacak. Devam?',
        selImgInserted: 'Resim eklendi {w}×{h} · {size}',
        selQrSaved: 'Pano resim kabul etmiyor — {name} olarak kaydedildi',
        selQrSaveAs: 'PNG görseli olarak kaydet',
    }
};

/* ====================================================================== *
 * 状态
 * ====================================================================== */

const selMenuEl = document.getElementById('selMenu');
const selMenuHeadEl = document.getElementById('selMenuHead');
const selMenuListEl = document.getElementById('selMenuList');
const selMenuSubEl = document.getElementById('selMenuSub');

let selState = null;            // 打开那一刻的快照（cm / 选区 / 文本 / 索引 / 只读）
let selPendingSnap = null;      // mousedown(button=2) 时抓的快照，contextmenu 时取用
let selRootNodes = [];          // 主菜单可导航项 [{ el, id, sub, enabled }]
let selSubNodes = [];
let selActive = 0;
let selSubActive = -1;
let selOpenSub = null;          // 当前展开的子菜单名
let selSubAnchor = null;        // 展开子菜单的那一项
let selExtraItems = null;       // WeakMap<cm, items[]>
let selExcluded = null;         // WeakSet<cm>：这些编辑器有自己的菜单，别接管
let selAwaitPaste = null;       // 等用户按 ⌘V 粘图的上下文

/* ====================================================================== *
 * 小工具
 * ====================================================================== */

function selT(key, fallback) {
    const table = SEL_I18N[currentLang] || SEL_I18N['zh-CN'];
    return table[key] || fallback || key;
}

function selFmt(key, vars, fallback) {
    let text = selT(key, fallback);
    const data = vars || {};
    Object.keys(data).forEach((name) => {
        text = text.split('{' + name + '}').join(String(data[name]));
    });
    return text;
}

/** macOS 上写 ⌘，其余写 Ctrl —— 菜单里的快捷键提示别给错 */
function selIsMac() {
    const platform = (navigator && (navigator.platform || navigator.userAgent)) || '';
    return /mac|iphone|ipad/i.test(platform);
}

function selKey(name) {
    return (selIsMac() ? '⌘' : 'Ctrl+') + name;
}

/** 字节数 → '1.2 KB'；优先借图片页的 formatBytes，没有就自己算 */
function selSize(bytes) {
    const n = Math.max(0, Number(bytes) || 0);
    if (window.DBXImg && typeof DBXImg.formatBytes === 'function') return DBXImg.formatBytes(n);
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
}

function selTextBytes(text) {
    const s = String(text == null ? '' : text);
    if (window.DBXQr && typeof DBXQr.utf8Length === 'function') return DBXQr.utf8Length(s);
    if (window.DBXEscape && typeof DBXEscape.utf8Bytes === 'function') return DBXEscape.utf8Bytes(s).length;
    return s.length;
}

/** 错误码 → 一句人话（不暴露内部 code） */
function selErrorText(code) {
    switch (code) {
        case 'sel-too-large': return selFmt('selTooLarge', { n: 1000000 });
        case 'sel-no-engine': return selT('selNoEngine');
        case 'sel-bad-json': return selT('selBadJson');
        case 'sel-not-numeric': return selT('selNotNumeric');
        case 'sel-empty': return selT('selEmpty');
        case 'esc-bad-json': return selT('selBadJson');
        default: return selT('selFail') + (code ? '（' + code + '）' : '');
    }
}

function selConvertCtx() {
    return { escape: window.DBXEscape, sql: window.DBXSql, qr: window.DBXQr };
}

/** 从事件目标找到 CodeMirror 实例；不是编辑器 / 已声明自管右键就返回 null（不接管） */
function selCmOf(target) {
    const wrapper = target && target.closest ? target.closest('.CodeMirror') : null;
    if (!wrapper) return null;
    const cm = wrapper.CodeMirror || null;
    if (!cm) return null;
    if (selExcluded && selExcluded.has(cm)) return null;
    return cm;
}

function selSnapshot(cm) {
    const selected = cm.getSelection ? cm.getSelection() : '';
    const from = cm.getCursor('from');
    const to = cm.getCursor('to');
    const hasSel = !!selected;
    return {
        cm: cm,
        text: hasSel ? selected : cm.getValue(),
        hasSel: hasSel,
        from: from,
        to: to,
        fromIndex: cm.indexFromPos(from),
        toIndex: cm.indexFromPos(to),
        readOnly: !!cm.getOption('readOnly')
    };
}

/* ====================================================================== *
 * 菜单项：文案 / 快捷键 / 可用性
 * ====================================================================== */

function selEscKindLabel(kind) {
    const table = ESC_I18N[currentLang] || ESC_I18N['zh-CN'];
    const key = 'escKind' + kind.charAt(0).toUpperCase() + kind.slice(1);
    return table[key] || kind;
}

function selEscDirLabel(dir) {
    const table = ESC_I18N[currentLang] || ESC_I18N['zh-CN'];
    return dir === 'decode' ? (table.escDecode || 'Decode') : (table.escEncode || 'Encode');
}

const SEL_LABEL_KEYS = {
    'paste-image': 'selPasteImage',
    'paste-image-b64': 'selImgB64',
    'paste-image-datauri': 'selImgDataUri',
    'paste-image-tag': 'selImgTag',
    'select-all': 'selSelectAll',
    'more-escape': 'selMoreEscape',
    'more-tidy': 'selMoreTidy',
    'more-join': 'selJoin',
    'more-quote': 'selQuote',
    'tidy-trim': 'selTrim',
    'tidy-strip-ws': 'selStripWs',
    'tidy-dedupe': 'selDedupe',
    'tidy-sort': 'selSort',
    'tidy-sort-num': 'selSortNum',
    'tidy-reverse': 'selReverse',
    'tidy-number': 'selNumber',
    'tidy-join-comma': 'selJoinComma',
    'tidy-join-cn': 'selJoinCn',
    'tidy-join-space': 'selJoinSpace',
    'tidy-upper': 'selUpper',
    'tidy-lower': 'selLower',
    'tidy-title': 'selTitle',
    'tidy-quote-single': 'selQuoteSingle',
    'tidy-quote-double': 'selQuoteDouble',
    'tidy-quote-backtick': 'selQuoteBacktick',
    'tidy-json-pretty': 'selJsonPretty',
    'tidy-json-minify': 'selJsonMinify',
    'esc-newline-encode': 'selEscNewline',
    'esc-newline-decode': 'selUnescNewline',
    'sql-in': 'selSqlIn',
    'sql-not-in': 'selSqlNotIn',
    'sql-insert': 'selSqlInsert',
    'qr-open': 'selQrOpen'
};

function selLabelOf(item) {
    if (item.page && typeof item.page.label === 'function') return item.page.label();
    if (item.esc) return selEscKindLabel(item.esc.kind) + ' ' + selEscDirLabel(item.esc.dir);
    if (item.id === 'copy') return (currentDict && currentDict.copyBtn) || 'Copy';
    if (item.id === 'paste') return (currentDict && currentDict.pasteBtn) || 'Paste';
    if (item.id === 'cut') return selT('selCut');
    // 同一个位置：宿主能写图片剪贴板就叫「复制」，写不了就老实叫「保存」
    if (item.id === 'qr-copy') return selT(selImageClipSupported() ? 'selQrCopy' : 'selQrSaveAs');
    const key = SEL_LABEL_KEYS[item.id];
    return key ? selT(key) : item.id;
}

function selKbdOf(id) {
    if (id === 'copy') return selKey('C');
    if (id === 'cut') return selKey('X');
    if (id === 'paste') return selKey('V');
    if (id === 'select-all') return selKey('A');
    return '';
}

function selEnabledOf(item) {
    const st = selState;
    if (!st) return false;
    const pageItems = item.page;
    if (pageItems) {
        try {
            return typeof pageItems.enabled === 'function' ? !!pageItems.enabled(st) : true;
        } catch (err) {
            return true;
        }
    }
    switch (item.id) {
        case 'copy':
        case 'select-all':
            return true;
        case 'cut':
            return st.hasSel && !st.readOnly;
        case 'paste':
        case 'paste-image':
        case 'paste-image-b64':
        case 'paste-image-datauri':
        case 'paste-image-tag':
            return !st.readOnly;
        default:
            break;
    }
    // 没选中内容时转换一律置灰：那时候 text 是全文，一点就复制整份文档，太容易误触
    if (!st.hasSel) return false;
    // 子菜单入口：子项全都不可用时，入口本身也别亮着
    if (item.sub && item.first && item.id !== 'paste-image') return selSubHasEnabled(item.sub);
    return !!(window.DBXSelectConv && DBXSelectConv.canRun(item.id, st.text, selConvertCtx()));
}

/* ====================================================================== *
 * 菜单 DOM
 * ====================================================================== */

function selNode(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
}

function selMakeItem(item) {
    const enabled = selEnabledOf(item);
    const btn = selNode('div', 'sel-menu-item' + (enabled ? '' : ' is-disabled'));
    btn.setAttribute('role', 'menuitem');
    btn.setAttribute('tabindex', '-1');
    btn.dataset.selId = item.id;
    if (!enabled) btn.setAttribute('aria-disabled', 'true');
    btn.appendChild(selNode('span', 'sel-label', selLabelOf(item)));
    const kbd = selKbdOf(item.id);
    if (kbd) btn.appendChild(selNode('span', 'sel-kbd', kbd));
    if (item.sub) btn.appendChild(selNode('span', 'sel-arrow', '›'));
    return { el: btn, id: item.id, sub: item.sub, enabled: enabled, item: item };
}

/** 主菜单：基础/转义/整理/SQL/二维码 + 页内注册项，按组画分隔线 */
function selBuildMain() {
    selMenuListEl.textContent = '';
    selRootNodes = [];

    const items = (window.DBXSelectConv ? DBXSelectConv.list() : []).filter((it) => !it.sub || it.first);
    const extras = selState && selExtraItems ? (selExtraItems.get(selState.cm) || []) : [];
    const groups = [];

    let lastGroup = null;
    items.forEach((item) => {
        const node = selMakeItem(item);
        if (item.group !== lastGroup && selRootNodes.length) {
            selMenuListEl.appendChild(selNode('div', 'sel-menu-sep'));
        }
        lastGroup = item.group;
        selMenuListEl.appendChild(node.el);
        selRootNodes.push(node);
    });

    if (extras.length) {
        if (selRootNodes.length) selMenuListEl.appendChild(selNode('div', 'sel-menu-sep'));
        extras.forEach((raw) => {
            const item = Object.assign({ group: 'page' }, raw);
            item.page = raw;
            const node = selMakeItem(item);
            selMenuListEl.appendChild(node.el);
            selRootNodes.push(node);
        });
    }
}

/** 子菜单内容：转义 / 整理 / 拼接 / 包引号 / 粘贴图片 */
function selBuildSub(name) {
    selMenuSubEl.textContent = '';
    selSubNodes = [];
    const items = (window.DBXSelectConv ? DBXSelectConv.list() : []).filter((it) => it.sub === name && !it.first);
    items.forEach((item) => {
        const node = selMakeItem(item);
        selMenuSubEl.appendChild(node.el);
        selSubNodes.push(node);
    });
    selSubActive = -1;
}

function selSubOf(name) {
    return (window.DBXSelectConv ? DBXSelectConv.list() : []).filter((it) => it.sub === name && !it.first);
}

function selSubHasEnabled(name) {
    const list = selSubOf(name);
    for (let i = 0; i < list.length; i++) {
        if (selEnabledOf(list[i])) return true;
    }
    return false;
}

/* ====================================================================== *
 * 展开 / 收起 / 定位
 * ====================================================================== */

function selCloseSub() {
    if (!selOpenSub) return false;
    selOpenSub = null;
    selSubAnchor = null;
    selSubNodes = [];
    selSubActive = -1;
    if (selMenuSubEl) {
        selMenuSubEl.hidden = true;
        selMenuSubEl.textContent = '';
    }
    selRootNodes.forEach((n) => n.el.classList.remove('is-active'));
    return true;
}

function selOpenSubMenu(node) {
    if (!node || !node.sub) return;
    if (selOpenSub === node.sub) return;
    selCloseSub();
    selOpenSub = node.sub;
    selSubAnchor = node.el;
    selBuildSub(node.sub);
    selRootNodes.forEach((n) => n.el.classList.toggle('is-active', n === node));

    selMenuSubEl.hidden = false;
    // 先按右对齐摆一次，再看视口决定要不要翻到左边、要不要上移
    selMenuSubEl.classList.remove('is-flipped');
    selMenuSubEl.style.top = '0px';
    const menuRect = selMenuEl.getBoundingClientRect();
    const subRect = selMenuSubEl.getBoundingClientRect();
    const vw = window.innerWidth || 0;
    const vh = window.innerHeight || 0;

    let top = node.el.offsetTop - (selMenuListEl ? selMenuListEl.scrollTop : 0) - 6;
    if (vh && menuRect.top + top + subRect.height > vh - 8) {
        top = Math.max(4, vh - 8 - subRect.height - menuRect.top);
    }
    selMenuSubEl.style.top = top + 'px';
    if (vw && menuRect.left + menuRect.width + subRect.width > vw - 8) {
        selMenuSubEl.classList.add('is-flipped');
    }
    selMenuSubEl.scrollTop = 0;
}

function selHide() {
    if (!selMenuEl) return;
    selCloseSub();
    selMenuEl.hidden = true;
    selRootNodes.forEach((n) => n.el.classList.remove('is-active'));
    selRootNodes = [];
    selMenuListEl.textContent = '';
    selState = null;
}

function selPlace(x, y) {
    selMenuEl.hidden = false;
    selMenuEl.style.left = x + 'px';
    selMenuEl.style.top = y + 'px';
    const rect = selMenuEl.getBoundingClientRect();
    const vw = window.innerWidth || 0;
    const vh = window.innerHeight || 0;
    const left = vw ? Math.max(8, Math.min(x, vw - rect.width - 8)) : x;
    const top = vh ? Math.max(8, Math.min(y, vh - rect.height - 8)) : y;
    selMenuEl.style.left = left + 'px';
    selMenuEl.style.top = top + 'px';
}

/* ====================================================================== *
 * 键盘
 * ====================================================================== */

function selVisibleNodes() {
    return selOpenSub ? selSubNodes : selRootNodes;
}

function selActiveIndex() {
    return selOpenSub ? selSubActive : selActive;
}

function selSetActive(index, noScroll) {
    const nodes = selVisibleNodes();
    if (!nodes.length) return;
    let i = index;
    // 跳过禁用项与分隔线（禁用项也在 nodes 里，但没有 enabled）
    let guard = 0;
    while (guard++ < nodes.length && !nodes[(i + nodes.length) % nodes.length].enabled) {
        i++;
    }
    const at = ((i % nodes.length) + nodes.length) % nodes.length;
    nodes.forEach((n, k) => n.el.classList.toggle('is-active', k === at && n.enabled));
    if (selOpenSub) selSubActive = at;
    else selActive = at;
    const node = nodes[at];
    if (!noScroll && node && node.el.scrollIntoView) node.el.scrollIntoView({ block: 'nearest' });
}

function selMove(delta) {
    const nodes = selVisibleNodes();
    if (!nodes.length) return;
    const from = selActiveIndex();
    selSetActive((from < 0 ? (delta > 0 ? 0 : nodes.length - 1) : from + delta));
}

function selRunActive() {
    const nodes = selVisibleNodes();
    const at = selActiveIndex();
    const node = nodes[at];
    if (!node) return;
    if (!node.enabled) return;
    if (node.sub) {
        selOpenSubMenu(node);
        return;
    }
    void selDispatch(node.id, node.item);
}

function selOnKeyDown(e) {
    if (!selMenuEl || selMenuEl.hidden) return;
    const key = e.key;
    // 菜单打开期间按键一律自己消化：否则 ⌘C / ⌘A 会先被 CodeMirror 吃掉
    e.stopPropagation();
    if (key === 'Escape' || e.keyCode === 27) {
        e.preventDefault();
        if (!selCloseSub()) selHide();
        return;
    }
    if (key === 'ArrowDown' || e.keyCode === 40) { e.preventDefault(); selMove(1); return; }
    if (key === 'ArrowUp' || e.keyCode === 38) { e.preventDefault(); selMove(-1); return; }
    if (key === 'ArrowRight' || e.keyCode === 39) {
        e.preventDefault();
        const nodes = selVisibleNodes();
        const node = nodes[selActiveIndex()];
        if (!selOpenSub && node && node.sub) selOpenSubMenu(node);
        return;
    }
    if (key === 'ArrowLeft' || e.keyCode === 37) {
        e.preventDefault();
        if (selOpenSub) {
            const back = selRootNodes.indexOf(selRootNodes.filter((n) => n.el === selSubAnchor)[0]);
            selCloseSub();
            if (back >= 0) selSetActive(back);
        }
        return;
    }
    if (key === 'Enter' || key === ' ' || e.keyCode === 13 || e.keyCode === 32) {
        e.preventDefault();
        selRunActive();
        return;
    }
    if (key === 'Tab') e.preventDefault();
}

/* ====================================================================== *
 * 打开
 * ====================================================================== */

function selOpenAt(x, y, cm) {
    if (!selMenuEl || !cm) return;
    const snap = selPendingSnap && selPendingSnap.cm === cm ? selPendingSnap : selSnapshot(cm);
    selPendingSnap = null;
    selState = snap;

    // 标题：让用户确认「这一下作用于什么」
    if (selMenuHeadEl) {
        if (snap.hasSel) {
            const lines = snap.text.split('\n').length;
            selMenuHeadEl.textContent = selFmt('selHead', { lines: lines, chars: snap.text.length });
        } else {
            selMenuHeadEl.textContent = selT('selNone');
        }
    }

    selBuildMain();
    selOpenSub = null;
    selActive = 0;
    selSubActive = -1;
    selPlace(x, y);

    // 让键盘立刻能接管（焦点进菜单，但别抢滚动位置）
    const first = selRootNodes.filter((n) => n.enabled)[0];
    if (first) {
        // 打开时不要 scrollIntoView：菜单刚摆到指针处，再滚一下页面会「跳一格」
        selSetActive(selRootNodes.indexOf(first), true);
        if (first.el.focus) {
            try { first.el.focus({ preventScroll: true }); } catch (err) { /* 老环境忽略 */ }
        }
    }
}

/* ====================================================================== *
 * 剪贴板 / 文本插入
 * ====================================================================== */

async function selCopyText(text, what) {
    try {
        await writeClipboardText(text);
        showToast(selFmt('selCopied', { what: what, size: selSize(selTextBytes(text)) }));
        return true;
    } catch (err) {
        showToast(selT('selFail'), 'error');
        return false;
    }
}

function selInsertText(st, text) {
    if (!st || !st.cm) return;
    st.cm.replaceRange(text, st.from, st.to);
    if (typeof st.cm.posFromIndex === 'function' && typeof st.cm.setCursor === 'function') {
        const at = st.cm.posFromIndex(st.fromIndex + text.length);
        st.cm.setCursor(at);
        if (typeof st.cm.scrollIntoView === 'function') st.cm.scrollIntoView({ line: at.line, ch: at.ch }, 80);
    }
    st.cm.focus();
}

/* ====================================================================== *
 * 图片：取图（三条路）/ 三种输出 / 体积阈值
 * ====================================================================== */

function selBlobBase64(blob) {
    return new Promise((resolve) => {
        if (window.DBXImg && typeof DBXImg.bytesToBase64Async === 'function'
            && typeof blob.arrayBuffer === 'function') {
            blob.arrayBuffer().then((buf) => DBXImg.bytesToBase64Async(new Uint8Array(buf)))
                .then(resolve, () => resolve(''));
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            const url = String(reader.result || '');
            const at = url.indexOf(',');
            resolve(at > 0 ? url.slice(at + 1) : '');
        };
        reader.onerror = () => resolve('');
        reader.readAsDataURL(blob);
    });
}

/** 宿主 readImage 的返回形状没有强约定：字符串 / {base64|data} / {mime,bytes} 都接住 */
function selHostImage(res) {
    if (!res) return null;
    if (typeof res === 'string') {
        if (res.slice(0, 5) === 'data:') {
            const at = res.indexOf(',');
            const mime = res.slice(5, at).split(';')[0] || 'image/png';
            return { base64: res.slice(at + 1), mime: mime };
        }
        return { base64: res, mime: 'image/png' };
    }
    const base64 = res.base64 || res.data || res.image;
    if (typeof base64 === 'string' && base64) {
        return { base64: base64, mime: res.mime || res.type || 'image/png' };
    }
    return null;
}

/**
 * 取剪贴板里的图片。返回 { blob, mime } / { empty } / { denied }。
 * 三条路按可靠性倒序：标准 API → 宿主 API → 交给 paste 事件兜底。
 */
async function selClipboardImage() {
    if (navigator.clipboard && typeof navigator.clipboard.read === 'function') {
        try {
            const items = await navigator.clipboard.read();
            for (let i = 0; i < items.length; i++) {
                const types = items[i].types || [];
                const type = types.find((t) => /^image\//.test(t));
                if (type) {
                    const blob = await items[i].getType(type);
                    return { blob: blob, mime: type || blob.type || 'image/png' };
                }
            }
            return { empty: true };
        } catch (err) { /* 无权限 / 不支持：继续试宿主 */ }
    }
    const host = window.dbxPlugin;
    if (host && host.clipboard && typeof host.clipboard.readImage === 'function') {
        try {
            const got = selHostImage(await host.clipboard.readImage());
            if (got) {
                const bytes = window.DBXImg && DBXImg.base64ToBytes
                    ? DBXImg.base64ToBytes(got.base64)
                    : null;
                if (bytes) return { blob: new Blob([bytes], { type: got.mime }), mime: got.mime };
                return { base64: got.base64, mime: got.mime };
            }
            return { empty: true };
        } catch (err) { /* 宿主能力声明了但没实现，按被拒处理 */ }
    }
    return { denied: true };
}

function selImageText(base64, mime, format) {
    if (format === 'b64') return base64;
    const uri = 'data:' + (mime || 'image/png') + ';base64,' + base64;
    if (format === 'tag') return '<img src="' + uri + '" alt="" />';
    return uri;
}

function selImageSize(blob) {
    if (!blob || typeof createImageBitmap !== 'function') return Promise.resolve(null);
    return createImageBitmap(blob).then((bmp) => {
        const dim = { w: bmp.width, h: bmp.height };
        if (bmp.close) bmp.close();
        return dim;
    }, () => null);
}

/** 插一张图：体积先过阈值，再转 Base64，最后按 format 落进编辑器 */
async function selInsertImage(st, format, source) {
    const img = source || await selClipboardImage();

    if (img.denied) {
        // 说清「为什么不行」并挂上等待态：用户按 ⌘V 就由 paste 监听接手
        selAwaitPaste = { st: st, format: format };
        showToast(selFmt('selClipboardDenied', { key: selIsMac() ? '⌘' : 'Ctrl+' }), 'error');
        return;
    }
    if (img.empty || (!img.blob && !img.base64)) {
        showToast(selT('selNoImage'), 'error');
        return;
    }

    const limits = (window.DBXImg && DBXImg.LIMITS) || { maxImageBytes: 10 * 1024 * 1024, warnBytes: 2 * 1024 * 1024 };
    const bytes = img.blob ? img.blob.size : Math.floor(String(img.base64).length * 3 / 4);
    if (bytes > limits.maxImageBytes) {
        showToast(selFmt('selImgTooBig', { size: selSize(bytes), max: selSize(limits.maxImageBytes) }), 'error');
        return;
    }
    if (bytes > limits.warnBytes) {
        // 先问一次：Base64 会再胖三分之一，大图粘贴完编辑器会明显卡一下
        const go = typeof window.confirm === 'function'
            ? window.confirm(selFmt('selImgWarn', { size: selSize(bytes) }))
            : true;
        if (!go) return;
    }

    const base64 = img.blob ? await selBlobBase64(img.blob) : String(img.base64);
    if (!base64) {
        showToast(selT('selNoImage'), 'error');
        return;
    }
    const dim = img.blob ? await selImageSize(img.blob) : null;
    const text = selImageText(base64, img.mime || 'image/png', format);
    selInsertText(st, text);
    showToast(selFmt('selImgInserted', {
        w: dim ? dim.w : '?',
        h: dim ? dim.h : '?',
        size: selSize(selTextBytes(text))
    }));
}

/* ====================================================================== *
 * 二维码：画布 → PNG → 剪贴板（写不进就存文件）
 * ====================================================================== */

function selCanvasPng(canvas) {
    return new Promise((resolve) => {
        if (typeof canvas.toBlob !== 'function') { resolve(selCanvasBlobSync(canvas)); return; }
        canvas.toBlob((blob) => resolve(blob || null), 'image/png');
    });
}

function selDataUrlBlob(url) {
    const text = String(url || '');
    const at = text.indexOf(',');
    if (at < 0) return null;
    try {
        const bin = atob(text.slice(at + 1));
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new Blob([bytes], { type: 'image/png' });
    } catch (err) {
        return null;
    }
}

/**
 * 同步拿到 PNG。
 *
 * 为什么不用 `canvas.toBlob()`：它是异步的，回调落在下一个任务里，
 * 而 WebKit 的「用户手势」到那个任务边界就没了——`navigator.clipboard.write`
 * 会以 NotAllowedError 拒绝，表现就是「点了复制什么也没发生」。
 * `toDataURL()` 是同步的，从这里到 write 全程不出这个任务，手势才还在。
 */
function selCanvasBlobSync(canvas) {
    if (!canvas || typeof canvas.toDataURL !== 'function') return null;
    try {
        const url = canvas.toDataURL('image/png');
        if (!url || url.indexOf('data:image/png') !== 0) return null;
        return selDataUrlBlob(url);
    } catch (err) {
        return null;
    }
}

/**
 * 能不能直接把图片写进系统剪贴板。
 *
 * 只有标准 Clipboard API 这一条路能写「位图」；宿主桥（dbxPlugin.copy /
 * clipboard.writeText）参数是字符串，写不了图片。没有它就只能存文件——
 * 调用方要么把菜单项改名，要么把话说清楚，不能点「复制」却弹出保存框。
 */
// 一次失败就记住：有些宿主「API 在但不放行」，不该每点一次都白试一遍，
// 菜单项名字也要跟着从「复制」变成「保存」
let selImageClipVerdict = null;   // null 还没试过 / true 能用 / false 用不了
let selImageClipError = '';       // 最近一次失败的错误名，失败提示里带上

function selImageClipSupported() {
    if (selImageClipVerdict === false) return false;
    return typeof ClipboardItem !== 'undefined'
        && !!navigator.clipboard && typeof navigator.clipboard.write === 'function';
}

/** 写一张 PNG 进剪贴板；顺带把「这个环境到底能不能写」记下来 */
async function selWriteImage(blob) {
    if (!selImageClipSupported()) return { ok: false, error: 'no-api' };
    try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        selImageClipVerdict = true;
        return { ok: true };
    } catch (err) {
        selImageClipVerdict = false;
        selImageClipError = (err && (err.name || err.message)) || 'error';
        return { ok: false, error: selImageClipError };
    }
}

/** 复制 / 存盘失败的原因翻成人话；带 detail 时把错误名缀在后面，省得再猜 */
function selImageFailText(code, detail) {
    if (code === 'cancelled') return (currentDict && currentDict.saveCancelled) || 'Export cancelled';
    if (code === 'sel-dev-no-save') return selT('selDevNoSave');
    const base = selT('selFail');
    return detail ? base + ' (' + detail + ')' : base;
}

function selHostFileTransfer() {
    return (window.dbxPlugin && window.dbxPlugin.fileTransfer) || null;
}

/**
 * 把一张 PNG 送进剪贴板。
 * 返回 { ok:true, via:'clipboard' } | { ok:true, via:'file', name } | { ok:false, code }。
 *
 * 顺序：标准 Clipboard API → 存盘。存盘是「备选」不是「默认」：
 * opts.saveFallback === false 时直接报 sel-img-clip-unsupported，让调用方把话说明白，
 * 而不是点「复制」弹出保存框。
 */
async function copyPngToClipboard(blob, fileName, opts) {
    if (!blob) return { ok: false, code: 'sel-fail' };
    const written = await selWriteImage(blob);
    if (written.ok) return { ok: true, via: 'clipboard' };
    if (opts && opts.saveFallback === false) {
        return { ok: false, code: 'sel-img-clip-unsupported', detail: written.error };
    }
    if (typeof saveBinaryFile !== 'function') return { ok: false, code: 'sel-fail' };
    const base64 = await selBlobBase64(blob);
    if (!base64) return { ok: false, code: 'sel-fail' };
    const status = await saveBinaryFile(fileName, base64, 'image/png');
    // 开发宿主（dbx-plugin dev）没有 fileTransfer，iframe 又没有 allow-downloads，
    // <a download> 会被静默拦掉。saveBinaryFile 那边只看到「点了链接」，回报 browser——
    // 照它说「已保存」，就成了「什么都拿到了」的假成功。这里拆开说清楚。
    if (status === 'browser' && window.dbxPlugin && !selHostFileTransfer()) {
        return { ok: false, code: 'sel-dev-no-save' };
    }
    if (status === 'cancelled' || status === 'failed') return { ok: false, code: status };
    return { ok: true, via: 'file', name: fileName };
}

/**
 * 右键菜单里的二维码动作：参数固定（512 / M / 黑白 / 边距 4），结果可预期。
 *
 * 写不进图片剪贴板的环境（DBX 宿主就是：沙箱是 opaque origin，navigator.clipboard
 * 整个不可用，宿主桥只搬文本）就退成「存一张 PNG」。菜单项名字会跟着变，
 * 叫「保存为 PNG 图片」，点下去真的存文件——不做「点了复制却弹保存框」这种事。
 */
async function selQrCopyToClipboard(st) {
    const QR = window.DBXQr;
    if (!QR || typeof qrEnsureGenLib !== 'function') {
        showToast(selT('selNoEngine'), 'error');
        return;
    }
    let lib;
    try {
        lib = await qrEnsureGenLib();
    } catch (err) {
        showToast(selT('selNoEngine'), 'error');
        return;
    }
    let matrix;
    try {
        matrix = QR.matrixOf(st.text, 'M', lib);
    } catch (err) {
        showToast(selT('selFail'), 'error');
        return;
    }
    const canvas = document.createElement('canvas');
    const opts = { size: 512, margin: 4, ecc: 'M', dark: '#000000', light: '#ffffff' };
    if (!QR.drawToCanvas(canvas, matrix, opts)) {
        showToast(selT('selFail'), 'error');
        return;
    }
    // 同步出 PNG：从这里到 clipboard.write 不跨任务，用户手势还在
    const blob = selCanvasBlobSync(canvas);
    canvas.width = 0;
    canvas.height = 0;
    const res = await copyPngToClipboard(blob, 'selection.png');
    if (st.cm && typeof st.cm.focus === 'function') {
        try { st.cm.focus(); } catch (err) { /* 编辑器已销毁：无所谓 */ }
    }
    if (!res.ok) {
        showToast(selImageFailText(res.code, res.detail), 'error');
        return;
    }
    if (res.via === 'file') {
        // 存盘这条路：二维码页用的是同一句提示，术语对齐
        showToast(selFmt('selQrSaved', { name: res.name }));
        return;
    }
    showToast(selT('selQrCopy'));
}

function selOpenQrPage(st) {
    if (typeof enterQrMode !== 'function') return;
    enterQrMode();
    if (typeof qrEnsureEditor === 'function') qrEnsureEditor();
    if (qrEditor) {
        qrEditor.setValue(st.text);
        if (typeof qrEditor.refresh === 'function') qrEditor.refresh();
        qrEditor.focus();
    }
}

/* ====================================================================== *
 * 动作派发
 * ====================================================================== */

async function selDispatch(id, item) {
    const st = selState;
    selHide();
    if (!st) return;

    // 页内注册项（SQL 页的「执行所选」等）
    if (item && item.page && typeof item.page.run === 'function') {
        item.page.run(st);
        return;
    }

    if (id === 'copy') {
        const text = st.hasSel ? st.text : st.cm.getValue();
        await selCopyText(text, (currentDict && currentDict.copyBtn) || 'Copy');
        return;
    }
    if (id === 'cut') {
        if (st.readOnly) return;
        const done = await selCopyText(st.text, selT('selCut'));
        if (done) {
            st.cm.replaceRange('', st.from, st.to);
            st.cm.focus();
        }
        return;
    }
    if (id === 'paste') {
        try {
            const text = await readClipboardText();
            if (text) selInsertText(st, text);
        } catch (err) {
            showToast((currentDict && currentDict.toastPasteUnsupported) || selT('selFail'), 'error');
        }
        return;
    }
    if (id === 'select-all') {
        if (typeof st.cm.execCommand === 'function') st.cm.execCommand('selectAll');
        st.cm.focus();
        return;
    }
    if (id.indexOf('paste-image') === 0) {
        const format = id === 'paste-image-b64' ? 'b64'
            : id === 'paste-image-tag' ? 'tag' : 'datauri';
        await selInsertImage(st, format);
        return;
    }
    if (id === 'qr-copy') {
        await selQrCopyToClipboard(st);
        return;
    }
    if (id === 'qr-open') {
        selOpenQrPage(st);
        return;
    }

    // 其余都是纯函数转换：算完就进剪贴板
    if (!window.DBXSelectConv) {
        showToast(selT('selNoEngine'), 'error');
        return;
    }
    const res = DBXSelectConv.run(id, st.text, selConvertCtx());
    if (!res || !res.ok) {
        showToast(selErrorText(res && res.code), 'error');
        return;
    }
    let what = item ? selLabelOf(item) : id;
    if (res.note && (id === 'sql-in' || id === 'sql-not-in' || id === 'sql-insert')) {
        what += ' · ' + res.note;
    }
    await selCopyText(res.text, what);
}

/* ====================================================================== *
 * 事件接线
 * ====================================================================== */

function selOnContextMenu(e) {
    const cm = selCmOf(e.target);
    if (!cm) {
        if (selMenuEl && !selMenuEl.hidden) selHide();
        return;   // 编辑器以外保持原生菜单
    }
    e.preventDefault();
    e.stopPropagation();
    if (!selMenuEl) return;
    selOpenAt(e.clientX, e.clientY, cm);
}

function selOnMouseDown(e) {
    // 右键那一刻先把选区存下来：CodeMirror 的右键处理可能把光标挪走，等
    // contextmenu 再读就只剩一个空光标了（「执行所选」会变成「执行整段」）
    if (e.button === 2) {
        const cm = selCmOf(e.target);
        selPendingSnap = cm ? selSnapshot(cm) : null;
        return;
    }
    if (!selMenuEl || selMenuEl.hidden) return;
    if (selMenuEl.contains(e.target)) return;
    selHide();
}

function selOnDocClick(e) {
    if (!selMenuEl || selMenuEl.hidden) return;
    const inMenu = selMenuEl.contains(e.target);
    const entry = e.target.closest ? e.target.closest('[data-sel-id]') : null;
    if (!inMenu) return;
    if (entry && !entry.classList.contains('is-disabled')) {
        const node = selRootNodes.concat(selSubNodes).filter((n) => n.el === entry)[0];
        void selDispatch(entry.dataset.selId, node ? node.item : null);
        return;
    }
    // 点在有子菜单的项上：展开；点空白处：什么也不做
    const hit = selRootNodes.filter((n) => n.el === entry)[0];
    if (hit && hit.sub && hit.enabled) selOpenSubMenu(hit);
}

function selOnHover(e) {
    if (!selMenuEl || selMenuEl.hidden) return;
    const entry = e.target.closest ? e.target.closest('[data-sel-id]') : null;
    if (!entry) return;
    const inSub = selMenuSubEl && selMenuSubEl.contains(entry);
    if (inSub) {
        const node = selSubNodes.filter((n) => n.el === entry)[0];
        if (node) {
            selSubNodes.forEach((n) => n.el.classList.toggle('is-active', n === node));
            selSubActive = selSubNodes.indexOf(node);
        }
        return;
    }
    const node = selRootNodes.filter((n) => n.el === entry)[0];
    if (!node) return;
    selRootNodes.forEach((n) => n.el.classList.toggle('is-active', n === node));
    selActive = selRootNodes.indexOf(node);
    if (node.sub && node.enabled) selOpenSubMenu(node);
    else if (selOpenSub) selCloseSub();
}

/**
 * ⌘V 粘图片：
 *   - 菜单里点「粘贴图片」但环境不让读剪贴板时，selAwaitPaste 会记下格式；
 *   - 用户直接按 ⌘V 也可以，此时按 Data URI 处理。
 * 只在「有图片且没有文本」时才拦，别影响正常粘贴文字。
 */
function selOnPaste(e) {
    const cm = selCmOf(e.target);
    if (!cm) return;
    const data = e.clipboardData;
    if (!data || !data.items) return;

    let imageItem = null;
    let hasText = false;
    for (let i = 0; i < data.items.length; i++) {
        const item = data.items[i];
        if (/^image\//.test(item.type || '')) imageItem = item;
        else if ((item.type || '').indexOf('text/') === 0) hasText = true;
    }
    if (!imageItem || hasText) return;

    e.preventDefault();
    e.stopPropagation();

    const file = imageItem.getAsFile ? imageItem.getAsFile() : null;
    if (!file) {
        showToast(selT('selNoImage'), 'error');
        return;
    }
    const waiting = selAwaitPaste && selAwaitPaste.st;
    const st = waiting || selSnapshot(cm);
    const format = waiting ? selAwaitPaste.format : 'datauri';
    selAwaitPaste = null;
    void selInsertImage(st, format, { blob: file, mime: file.type || imageItem.type });
}

/**
 * 滚动就收起菜单 —— 但菜单自己的列表不算。
 * 捕获阶段的 scroll 会收到菜单内部的滚动（scroll 不冒泡，capture 照样经过），
 * 不排除的话在菜单里滚一下整张菜单就没了，看起来像「滚轮点不动」。
 */
function selOnScroll(e) {
    if (!selMenuEl || selMenuEl.hidden) return;
    if (e && e.target && selMenuEl.contains(e.target)) return;
    selHide();
}

function selBind() {
    if (!selMenuEl) return;
    // 捕获阶段接管：CodeMirror 自己的 contextmenu 处理不会先跑掉
    document.addEventListener('contextmenu', selOnContextMenu, true);
    document.addEventListener('mousedown', selOnMouseDown, true);
    document.addEventListener('keydown', selOnKeyDown, true);
    document.addEventListener('paste', selOnPaste, true);
    selMenuEl.addEventListener('click', selOnDocClick);
    selMenuEl.addEventListener('mousemove', selOnHover);
    window.addEventListener('resize', selHide);
    window.addEventListener('scroll', selOnScroll, true);
    window.addEventListener('blur', selHide);
}

/* ====================================================================== *
 * 对外接口
 * ====================================================================== */

const EditorMenu = (function () {
    if (!selExtraItems && typeof WeakMap === 'function') selExtraItems = new WeakMap();
    if (!selExcluded && typeof WeakSet === 'function') selExcluded = new WeakSet();

    /** 登记页内扩展项：排在通用转换项之后，单独一组 */
    function register(cm, items) {
        if (!cm || !items || !selExtraItems) return;
        selExtraItems.set(cm, items.slice());
    }

    /**
     * 声明「这个编辑器自己管右键」：通用菜单从此不接管它的 contextmenu / paste。
     * SQL 分析页就这么用——它那套「执行所选 / 执行当前语句」是本页专属的。
     */
    function exclude(cm) {
        if (cm && selExcluded) selExcluded.add(cm);
    }

    function refresh() {
        if (!selMenuEl || selMenuEl.hidden) return;
        const wasOpen = selState;
        selBuildMain();
        if (wasOpen) selSetActive(Math.max(0, selActive));
    }

    // 19-datasql.js 在本文件之前加载：它排队登记的扩展项 / 排除项在这里补上
    // （那时 EditorMenu 还没定义，只能先挂到 window 上）
    const queued = window.__selMenuQueue || [];
    queued.forEach((pair) => register(pair[0], pair[1]));
    window.__selMenuQueue = [];
    const excludes = window.__selMenuExcludes || [];
    excludes.forEach((cm) => exclude(cm));
    window.__selMenuExcludes = [];

    return {
        bind: selBind,
        register: register,
        exclude: exclude,
        hide: selHide,
        refresh: refresh
    };
})();

window.EditorMenu = EditorMenu;
selBind();
