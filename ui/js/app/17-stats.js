/* 17-stats.js — 数据统计页：贴表格 → 勾列 → 计数 / 求和 / 均值 / 最值 / 去重 / 标准差，可按列分组 */
// =========================================
// 14. 数据统计
// =========================================
// 这一页是从 hs-encrypt（JRES Encrypt Tools）的「数据统计」面板复刻过来的独立功能：
// 贴一段分隔符表格，勾选要统计的列，指定分组列，出结果表。
// 解析 / 统计 / 输出全在纯函数库 js/stats.js（window.DBXStats），这里只负责铺界面。
// 与「表格转 JSON」的分工：那页是「表格 → JSON」，这页是「表格 → 数字」，
// 所以进来的内容不会被转成 JSON，只统计。
// 输入框用 CodeMirror：有行号才谈得上「定位到第几行」，预览表每一行都能点回去。

const STATS_I18N = {
    'zh-CN': {
        navStats: '数据统计',
        statsSamples: '示例',
        statsSampleOrders: '订单流水',
        statsSampleScores: '成绩单',
        statsGroupLabel: '分组列',
        statsGroupNone: '不分组',
        statsMetricsLabel: '统计方式',
        statsInputTitle: '数据',
        statsPlaceholder: '粘贴表格数据，一行一条记录；分隔符自动识别',
        statsPreviewTitle: '数据预览',
        statsResultTitle: '统计结果',
        statsResultGroup: '分组',
        statsResultCol: '统计列',
        statsCopyResult: '复制结果',
        statsCopyCols: '复制所选列',
        statsCopyColsN: '复制所选列（{n}）',
        statsCopyCol: '复制该列全部值',
        statsLineTip: '跳到第 {n} 行',
        statsTipIdle: '贴一段数据，勾选要统计的列',
        statsTipPreview: '{r} 行 × {c} 列',
        statsTipTruncated: '超过上限，只统计前 {n} 行',
        statsTipDone: '已统计 {c} 列',
        statsEmptyNoData: '贴一段表格数据，这里实时解析',
        statsEmptyPickCols: '勾选要统计的列',
        statsEmptyPickMetrics: '选择统计方式',
        statsColIndex: '列 {n}',
        statsColNamed: '列 {n}（{name}）',
        statsMoreRows: '已显示 {shown} / {n} 行',
        statsLoadMore: '加载更多',
        statsColsAll: '全部列',
        statsColsPicked: '列 {a}/{n}',
        statsColsTitle: '选择预览里显示哪些列',
        statsToastLastCol: '至少要留一列',
        statsToastCopied: '已复制该列 {n} 行',
        statsToastResult: '已复制统计结果（{n} 行）',
        statsToastCopiedCols: '已复制 {c} 列 / {r} 行',
        statsToastNoData: '还没有可复制的数据',
        statsToastPickCols: '请先勾选要复制的列',
        statsToastCell: '已复制：{v}',
        statsToastCellEmpty: '这一格是空的',
        statsMetricCount: '计数',
        statsMetricSum: '求和',
        statsMetricMean: '均值',
        statsMetricMax: '最大',
        statsMetricMin: '最小',
        statsMetricDistinct: '去重数',
        statsMetricStddev: '标准差'
    },
    'zh-TW': {
        navStats: '資料統計',
        statsSamples: '範例',
        statsSampleOrders: '訂單流水',
        statsSampleScores: '成績單',
        statsGroupLabel: '分組欄',
        statsGroupNone: '不分組',
        statsMetricsLabel: '統計方式',
        statsInputTitle: '資料',
        statsPlaceholder: '貼上表格資料，一列一筆；分隔符自動辨識',
        statsPreviewTitle: '資料預覽',
        statsResultTitle: '統計結果',
        statsResultGroup: '分組',
        statsResultCol: '統計欄',
        statsCopyResult: '複製結果',
        statsCopyCols: '複製所選欄',
        statsCopyColsN: '複製所選欄（{n}）',
        statsCopyCol: '複製該欄全部值',
        statsLineTip: '跳到第 {n} 列',
        statsTipIdle: '貼上一段資料，勾選要統計的欄',
        statsTipPreview: '{r} 列 × {c} 欄',
        statsTipTruncated: '超過上限，只統計前 {n} 列',
        statsTipDone: '已統計 {c} 欄',
        statsEmptyNoData: '貼上一段表格資料，這裡即時解析',
        statsEmptyPickCols: '勾選要統計的欄',
        statsEmptyPickMetrics: '選擇統計方式',
        statsColIndex: '欄 {n}',
        statsColNamed: '欄 {n}（{name}）',
        statsMoreRows: '已顯示 {shown} / {n} 列',
        statsLoadMore: '載入更多',
        statsColsAll: '全部欄',
        statsColsPicked: '欄 {a}/{n}',
        statsColsTitle: '選擇預覽要顯示哪些欄',
        statsToastLastCol: '至少要留一欄',
        statsToastCopied: '已複製該欄 {n} 列',
        statsToastResult: '已複製統計結果（{n} 列）',
        statsToastCopiedCols: '已複製 {c} 欄 / {r} 列',
        statsToastNoData: '還沒有可複製的資料',
        statsToastPickCols: '請先勾選要複製的欄',
        statsToastCell: '已複製：{v}',
        statsToastCellEmpty: '這一格是空的',
        statsMetricCount: '計數',
        statsMetricSum: '求和',
        statsMetricMean: '平均',
        statsMetricMax: '最大',
        statsMetricMin: '最小',
        statsMetricDistinct: '去重數',
        statsMetricStddev: '標準差'
    },
    en: {
        navStats: 'Data stats',
        statsSamples: 'Samples',
        statsSampleOrders: 'Orders',
        statsSampleScores: 'Scores',
        statsGroupLabel: 'Group by',
        statsGroupNone: 'No grouping',
        statsMetricsLabel: 'Metrics',
        statsInputTitle: 'Data',
        statsPlaceholder: 'Paste tabular data, one record per line — the delimiter is detected for you',
        statsPreviewTitle: 'Preview',
        statsResultTitle: 'Result',
        statsResultGroup: 'Group',
        statsResultCol: 'Column',
        statsCopyResult: 'Copy result',
        statsCopyCols: 'Copy columns',
        statsCopyColsN: 'Copy columns ({n})',
        statsCopyCol: 'Copy every value in this column',
        statsLineTip: 'Jump to line {n}',
        statsTipIdle: 'Paste data, then tick the columns to measure',
        statsTipPreview: '{r} rows × {c} columns',
        statsTipTruncated: 'Over the limit — only the first {n} rows are measured',
        statsTipDone: 'Measured {c} columns',
        statsEmptyNoData: 'Paste tabular data here — parsed as you type',
        statsEmptyPickCols: 'Tick the columns to measure',
        statsEmptyPickMetrics: 'Pick at least one metric',
        statsColIndex: 'Column {n}',
        statsColNamed: 'Column {n} ({name})',
        statsMoreRows: 'Showing {shown} of {n} rows',
        statsLoadMore: 'Load more',
        statsColsAll: 'All columns',
        statsColsPicked: 'Columns {a}/{n}',
        statsColsTitle: 'Choose which columns the preview shows',
        statsToastLastCol: 'Keep at least one column',
        statsToastCopied: 'Copied {n} rows from this column',
        statsToastResult: 'Copied the result ({n} rows)',
        statsToastCopiedCols: 'Copied {c} columns / {r} rows',
        statsToastNoData: 'Nothing to copy yet',
        statsToastPickCols: 'Tick the columns to copy first',
        statsToastCell: 'Copied: {v}',
        statsToastCellEmpty: 'This cell is empty',
        statsMetricCount: 'Count',
        statsMetricSum: 'Sum',
        statsMetricMean: 'Mean',
        statsMetricMax: 'Max',
        statsMetricMin: 'Min',
        statsMetricDistinct: 'Distinct',
        statsMetricStddev: 'Std dev'
    },
    ja: {
        navStats: 'データ統計',
        statsSamples: 'サンプル',
        statsSampleOrders: '注文履歴',
        statsSampleScores: '成績表',
        statsGroupLabel: 'グループ列',
        statsGroupNone: 'グループなし',
        statsMetricsLabel: '統計方法',
        statsInputTitle: 'データ',
        statsPlaceholder: '表データを貼り付け（1行1レコード、区切り文字は自動判定）',
        statsPreviewTitle: 'データプレビュー',
        statsResultTitle: '統計結果',
        statsResultGroup: 'グループ',
        statsResultCol: '統計列',
        statsCopyResult: '結果をコピー',
        statsCopyCols: '選択列をコピー',
        statsCopyColsN: '選択列をコピー（{n}）',
        statsCopyCol: 'この列の値をすべてコピー',
        statsLineTip: '行 {n} へ移動',
        statsTipIdle: 'データを貼り付け、統計する列にチェック',
        statsTipPreview: '{r} 行 × {c} 列',
        statsTipTruncated: '上限を超えたため先頭 {n} 行のみ統計します',
        statsTipDone: '{c} 列を統計しました',
        statsEmptyNoData: '表データを貼り付けるとここに解析結果が出ます',
        statsEmptyPickCols: '統計する列にチェックしてください',
        statsEmptyPickMetrics: '統計方法を選んでください',
        statsColIndex: '列 {n}',
        statsColNamed: '列 {n}（{name}）',
        statsMoreRows: '{shown} / {n} 行を表示中',
        statsLoadMore: 'さらに読み込む',
        statsColsAll: 'すべての列',
        statsColsPicked: '列 {a}/{n}',
        statsColsTitle: 'プレビューに表示する列を選択',
        statsToastLastCol: '列は最低 1 つ残してください',
        statsToastCopied: 'この列の {n} 行をコピーしました',
        statsToastResult: '統計結果をコピーしました（{n} 行）',
        statsToastCopiedCols: '{c} 列 / {r} 行をコピーしました',
        statsToastNoData: 'コピーできるデータがありません',
        statsToastPickCols: 'コピーする列にチェックしてください',
        statsToastCell: 'コピーしました：{v}',
        statsToastCellEmpty: 'このセルは空です',
        statsMetricCount: '件数',
        statsMetricSum: '合計',
        statsMetricMean: '平均',
        statsMetricMax: '最大',
        statsMetricMin: '最小',
        statsMetricDistinct: 'ユニーク数',
        statsMetricStddev: '標準偏差'
    },
    ko: {
        navStats: '데이터 통계',
        statsSamples: '예시',
        statsSampleOrders: '주문 내역',
        statsSampleScores: '성적표',
        statsGroupLabel: '그룹 열',
        statsGroupNone: '그룹 없음',
        statsMetricsLabel: '통계 방식',
        statsInputTitle: '데이터',
        statsPlaceholder: '표 데이터를 붙여넣으세요. 한 줄에 한 건, 구분자는 자동 인식',
        statsPreviewTitle: '데이터 미리보기',
        statsResultTitle: '통계 결과',
        statsResultGroup: '그룹',
        statsResultCol: '통계 열',
        statsCopyResult: '결과 복사',
        statsCopyCols: '선택 열 복사',
        statsCopyColsN: '선택 열 복사({n})',
        statsCopyCol: '이 열의 모든 값 복사',
        statsLineTip: '{n}행으로 이동',
        statsTipIdle: '데이터를 붙여넣고 통계할 열을 선택하세요',
        statsTipPreview: '{r} 행 × {c} 열',
        statsTipTruncated: '한도를 넘어 앞 {n}행만 통계합니다',
        statsTipDone: '{c}개 열 통계 완료',
        statsEmptyNoData: '표 데이터를 붙여넣으면 여기에 표시됩니다',
        statsEmptyPickCols: '통계할 열을 선택하세요',
        statsEmptyPickMetrics: '통계 방식을 선택하세요',
        statsColIndex: '{n}열',
        statsColNamed: '{n}열({name})',
        statsMoreRows: '{shown} / {n}행 표시 중',
        statsLoadMore: '더 불러오기',
        statsColsAll: '모든 열',
        statsColsPicked: '열 {a}/{n}',
        statsColsTitle: '미리보기에 표시할 열 선택',
        statsToastLastCol: '열을 최소 하나 남겨야 합니다',
        statsToastCopied: '이 열 {n}행을 복사했습니다',
        statsToastResult: '통계 결과를 복사했습니다({n}행)',
        statsToastCopiedCols: '{c}개 열 / {r}행을 복사했습니다',
        statsToastNoData: '복사할 데이터가 없습니다',
        statsToastPickCols: '복사할 열을 먼저 선택하세요',
        statsToastCell: '복사했습니다: {v}',
        statsToastCellEmpty: '이 셀은 비어 있습니다',
        statsMetricCount: '개수',
        statsMetricSum: '합계',
        statsMetricMean: '평균',
        statsMetricMax: '최대',
        statsMetricMin: '최소',
        statsMetricDistinct: '고유값',
        statsMetricStddev: '표준편차'
    },
    es: {
        navStats: 'Estadísticas',
        statsSamples: 'Ejemplos',
        statsSampleOrders: 'Pedidos',
        statsSampleScores: 'Notas',
        statsGroupLabel: 'Agrupar por',
        statsGroupNone: 'Sin agrupar',
        statsMetricsLabel: 'Métricas',
        statsInputTitle: 'Datos',
        statsPlaceholder: 'Pega filas delimitadas, un registro por línea; el separador se detecta solo',
        statsPreviewTitle: 'Vista previa',
        statsResultTitle: 'Resultado',
        statsResultGroup: 'Grupo',
        statsResultCol: 'Columna',
        statsCopyResult: 'Copiar resultado',
        statsCopyCols: 'Copiar columnas',
        statsCopyColsN: 'Copiar columnas ({n})',
        statsCopyCol: 'Copiar todos los valores de esta columna',
        statsLineTip: 'Ir a la línea {n}',
        statsTipIdle: 'Pega los datos y marca las columnas a medir',
        statsTipPreview: '{r} filas × {c} columnas',
        statsTipTruncated: 'Se superó el límite: solo se miden las primeras {n} filas',
        statsTipDone: '{c} columnas medidas',
        statsEmptyNoData: 'Pega datos tabulares aquí; se analizan al escribir',
        statsEmptyPickCols: 'Marca las columnas a medir',
        statsEmptyPickMetrics: 'Elige al menos una métrica',
        statsColIndex: 'Columna {n}',
        statsColNamed: 'Columna {n} ({name})',
        statsMoreRows: 'Mostrando {shown} de {n} filas',
        statsLoadMore: 'Cargar más',
        statsColsAll: 'Todas las columnas',
        statsColsPicked: 'Columnas {a}/{n}',
        statsColsTitle: 'Elige qué columnas muestra la vista previa',
        statsToastLastCol: 'Deja al menos una columna',
        statsToastCopied: 'Se copiaron {n} filas de esta columna',
        statsToastResult: 'Resultado copiado ({n} filas)',
        statsToastCopiedCols: 'Se copiaron {c} columnas / {r} filas',
        statsToastNoData: 'Todavía no hay nada que copiar',
        statsToastPickCols: 'Marca primero las columnas a copiar',
        statsToastCell: 'Copiado: {v}',
        statsToastCellEmpty: 'Esta celda está vacía',
        statsMetricCount: 'Recuento',
        statsMetricSum: 'Suma',
        statsMetricMean: 'Media',
        statsMetricMax: 'Máx.',
        statsMetricMin: 'Mín.',
        statsMetricDistinct: 'Distintos',
        statsMetricStddev: 'Desv. típica'
    },
    id: {
        navStats: 'Statistik data',
        statsSamples: 'Contoh',
        statsSampleOrders: 'Riwayat pesanan',
        statsSampleScores: 'Nilai rapor',
        statsGroupLabel: 'Kelompokkan menurut',
        statsGroupNone: 'Tanpa pengelompokan',
        statsMetricsLabel: 'Metrik',
        statsInputTitle: 'Data',
        statsPlaceholder: 'Tempel baris berdelimiter, satu rekaman per baris; pemisah dideteksi otomatis',
        statsPreviewTitle: 'Pratinjau',
        statsResultTitle: 'Hasil',
        statsResultGroup: 'Grup',
        statsResultCol: 'Kolom',
        statsCopyResult: 'Salin hasil',
        statsCopyCols: 'Salin kolom',
        statsCopyColsN: 'Salin kolom ({n})',
        statsCopyCol: 'Salin semua nilai kolom ini',
        statsLineTip: 'Lompat ke baris {n}',
        statsTipIdle: 'Tempel data, lalu centang kolom yang dihitung',
        statsTipPreview: '{r} baris × {c} kolom',
        statsTipTruncated: 'Melebihi batas — hanya {n} baris pertama yang dihitung',
        statsTipDone: '{c} kolom dihitung',
        statsEmptyNoData: 'Tempel data tabel di sini — langsung diurai',
        statsEmptyPickCols: 'Centang kolom yang akan dihitung',
        statsEmptyPickMetrics: 'Pilih minimal satu metrik',
        statsColIndex: 'Kolom {n}',
        statsColNamed: 'Kolom {n} ({name})',
        statsMoreRows: 'Menampilkan {shown} dari {n} baris',
        statsLoadMore: 'Muat lebih banyak',
        statsColsAll: 'Semua kolom',
        statsColsPicked: 'Kolom {a}/{n}',
        statsColsTitle: 'Pilih kolom yang ditampilkan di pratinjau',
        statsToastLastCol: 'Sisakan minimal satu kolom',
        statsToastCopied: 'Menyalin {n} baris dari kolom ini',
        statsToastResult: 'Hasil disalin ({n} baris)',
        statsToastCopiedCols: 'Menyalin {c} kolom / {r} baris',
        statsToastNoData: 'Belum ada data untuk disalin',
        statsToastPickCols: 'Centang dulu kolom yang ingin disalin',
        statsToastCell: 'Disalin: {v}',
        statsToastCellEmpty: 'Sel ini kosong',
        statsMetricCount: 'Jumlah',
        statsMetricSum: 'Total',
        statsMetricMean: 'Rata-rata',
        statsMetricMax: 'Maks',
        statsMetricMin: 'Min',
        statsMetricDistinct: 'Unik',
        statsMetricStddev: 'Simpangan baku'
    },
    it: {
        navStats: 'Statistiche',
        statsSamples: 'Esempi',
        statsSampleOrders: 'Ordini',
        statsSampleScores: 'Pagelle',
        statsGroupLabel: 'Raggruppa per',
        statsGroupNone: 'Nessun raggruppamento',
        statsMetricsLabel: 'Metriche',
        statsInputTitle: 'Dati',
        statsPlaceholder: 'Incolla righe delimitate, un record per riga; il separatore viene rilevato da solo',
        statsPreviewTitle: 'Anteprima',
        statsResultTitle: 'Risultato',
        statsResultGroup: 'Gruppo',
        statsResultCol: 'Colonna',
        statsCopyResult: 'Copia risultato',
        statsCopyCols: 'Copia colonne',
        statsCopyColsN: 'Copia colonne ({n})',
        statsCopyCol: 'Copia tutti i valori di questa colonna',
        statsLineTip: 'Vai alla riga {n}',
        statsTipIdle: 'Incolla i dati e spunta le colonne da misurare',
        statsTipPreview: '{r} righe × {c} colonne',
        statsTipTruncated: 'Limite superato: misurate solo le prime {n} righe',
        statsTipDone: '{c} colonne misurate',
        statsEmptyNoData: 'Incolla qui i dati tabellari: vengono analizzati mentre scrivi',
        statsEmptyPickCols: 'Spunta le colonne da misurare',
        statsEmptyPickMetrics: 'Scegli almeno una metrica',
        statsColIndex: 'Colonna {n}',
        statsColNamed: 'Colonna {n} ({name})',
        statsMoreRows: 'Mostrate {shown} di {n} righe',
        statsLoadMore: 'Carica altro',
        statsColsAll: 'Tutte le colonne',
        statsColsPicked: 'Colonne {a}/{n}',
        statsColsTitle: 'Scegli quali colonne mostrare nell’anteprima',
        statsToastLastCol: 'Lascia almeno una colonna',
        statsToastCopied: 'Copiate {n} righe di questa colonna',
        statsToastResult: 'Risultato copiato ({n} righe)',
        statsToastCopiedCols: 'Copiate {c} colonne / {r} righe',
        statsToastNoData: 'Non c’è ancora nulla da copiare',
        statsToastPickCols: 'Spunta prima le colonne da copiare',
        statsToastCell: 'Copiato: {v}',
        statsToastCellEmpty: 'Questa cella è vuota',
        statsMetricCount: 'Conteggio',
        statsMetricSum: 'Somma',
        statsMetricMean: 'Media',
        statsMetricMax: 'Max',
        statsMetricMin: 'Min',
        statsMetricDistinct: 'Distinti',
        statsMetricStddev: 'Dev. std'
    },
    pl: {
        navStats: 'Statystyki',
        statsSamples: 'Przykłady',
        statsSampleOrders: 'Zamówienia',
        statsSampleScores: 'Oceny',
        statsGroupLabel: 'Grupuj według',
        statsGroupNone: 'Bez grupowania',
        statsMetricsLabel: 'Metryki',
        statsInputTitle: 'Dane',
        statsPlaceholder: 'Wklej wiersze z separatorami, jeden rekord w wierszu; separator wykrywany automatycznie',
        statsPreviewTitle: 'Podgląd',
        statsResultTitle: 'Wynik',
        statsResultGroup: 'Grupa',
        statsResultCol: 'Kolumna',
        statsCopyResult: 'Kopiuj wynik',
        statsCopyCols: 'Kopiuj kolumny',
        statsCopyColsN: 'Kopiuj kolumny ({n})',
        statsCopyCol: 'Kopiuj wszystkie wartości tej kolumny',
        statsLineTip: 'Przejdź do wiersza {n}',
        statsTipIdle: 'Wklej dane i zaznacz kolumny do obliczeń',
        statsTipPreview: '{r} wierszy × {c} kolumn',
        statsTipTruncated: 'Przekroczono limit — liczone tylko pierwsze {n} wierszy',
        statsTipDone: 'Obliczono {c} kolumn',
        statsEmptyNoData: 'Wklej tutaj dane tabelaryczne — analiza na bieżąco',
        statsEmptyPickCols: 'Zaznacz kolumny do obliczeń',
        statsEmptyPickMetrics: 'Wybierz co najmniej jedną metrykę',
        statsColIndex: 'Kolumna {n}',
        statsColNamed: 'Kolumna {n} ({name})',
        statsMoreRows: 'Pokazano {shown} z {n} wierszy',
        statsLoadMore: 'Wczytaj więcej',
        statsColsAll: 'Wszystkie kolumny',
        statsColsPicked: 'Kolumny {a}/{n}',
        statsColsTitle: 'Wybierz kolumny widoczne w podglądzie',
        statsToastLastCol: 'Zostaw co najmniej jedną kolumnę',
        statsToastCopied: 'Skopiowano {n} wierszy tej kolumny',
        statsToastResult: 'Skopiowano wynik ({n} wierszy)',
        statsToastCopiedCols: 'Skopiowano {c} kolumn / {r} wierszy',
        statsToastNoData: 'Nie ma jeszcze czego kopiować',
        statsToastPickCols: 'Najpierw zaznacz kolumny do skopiowania',
        statsToastCell: 'Skopiowano: {v}',
        statsToastCellEmpty: 'Ta komórka jest pusta',
        statsMetricCount: 'Liczba',
        statsMetricSum: 'Suma',
        statsMetricMean: 'Średnia',
        statsMetricMax: 'Maks.',
        statsMetricMin: 'Min.',
        statsMetricDistinct: 'Unikalne',
        statsMetricStddev: 'Odch. std'
    },
    pt: {
        navStats: 'Estatísticas',
        statsSamples: 'Exemplos',
        statsSampleOrders: 'Pedidos',
        statsSampleScores: 'Notas',
        statsGroupLabel: 'Agrupar por',
        statsGroupNone: 'Sem agrupamento',
        statsMetricsLabel: 'Métricas',
        statsInputTitle: 'Dados',
        statsPlaceholder: 'Cole linhas delimitadas, um registo por linha; o separador é detetado automaticamente',
        statsPreviewTitle: 'Pré-visualização',
        statsResultTitle: 'Resultado',
        statsResultGroup: 'Grupo',
        statsResultCol: 'Coluna',
        statsCopyResult: 'Copiar resultado',
        statsCopyCols: 'Copiar colunas',
        statsCopyColsN: 'Copiar colunas ({n})',
        statsCopyCol: 'Copiar todos os valores desta coluna',
        statsLineTip: 'Ir para a linha {n}',
        statsTipIdle: 'Cole os dados e marque as colunas a medir',
        statsTipPreview: '{r} linhas × {c} colunas',
        statsTipTruncated: 'Limite excedido — só as primeiras {n} linhas são medidas',
        statsTipDone: '{c} colunas medidas',
        statsEmptyNoData: 'Cole aqui dados tabulares; são analisados enquanto escreve',
        statsEmptyPickCols: 'Marque as colunas a medir',
        statsEmptyPickMetrics: 'Escolha pelo menos uma métrica',
        statsColIndex: 'Coluna {n}',
        statsColNamed: 'Coluna {n} ({name})',
        statsMoreRows: 'A mostrar {shown} de {n} linhas',
        statsLoadMore: 'Carregar mais',
        statsColsAll: 'Todas as colunas',
        statsColsPicked: 'Colunas {a}/{n}',
        statsColsTitle: 'Escolha as colunas que a pré-visualização mostra',
        statsToastLastCol: 'Deixe pelo menos uma coluna',
        statsToastCopied: 'Copiadas {n} linhas desta coluna',
        statsToastResult: 'Resultado copiado ({n} linhas)',
        statsToastCopiedCols: 'Copiadas {c} colunas / {r} linhas',
        statsToastNoData: 'Ainda não há nada para copiar',
        statsToastPickCols: 'Marque primeiro as colunas a copiar',
        statsToastCell: 'Copiado: {v}',
        statsToastCellEmpty: 'Esta célula está vazia',
        statsMetricCount: 'Contagem',
        statsMetricSum: 'Soma',
        statsMetricMean: 'Média',
        statsMetricMax: 'Máx.',
        statsMetricMin: 'Mín.',
        statsMetricDistinct: 'Distintos',
        statsMetricStddev: 'Desvio padrão'
    },
    ru: {
        navStats: 'Статистика',
        statsSamples: 'Примеры',
        statsSampleOrders: 'Заказы',
        statsSampleScores: 'Оценки',
        statsGroupLabel: 'Группировать по',
        statsGroupNone: 'Без группировки',
        statsMetricsLabel: 'Метрики',
        statsInputTitle: 'Данные',
        statsPlaceholder: 'Вставьте строки с разделителем, одна запись на строку; разделитель определяется сам',
        statsPreviewTitle: 'Предпросмотр',
        statsResultTitle: 'Результат',
        statsResultGroup: 'Группа',
        statsResultCol: 'Столбец',
        statsCopyResult: 'Копировать результат',
        statsCopyCols: 'Копировать столбцы',
        statsCopyColsN: 'Копировать столбцы ({n})',
        statsCopyCol: 'Скопировать все значения этого столбца',
        statsLineTip: 'Перейти к строке {n}',
        statsTipIdle: 'Вставьте данные и отметьте столбцы для расчёта',
        statsTipPreview: '{r} строк × {c} столбцов',
        statsTipTruncated: 'Превышен лимит — считаются только первые {n} строк',
        statsTipDone: 'Рассчитано {c} столбцов',
        statsEmptyNoData: 'Вставьте табличные данные — разбор идёт на лету',
        statsEmptyPickCols: 'Отметьте столбцы для расчёта',
        statsEmptyPickMetrics: 'Выберите хотя бы одну метрику',
        statsColIndex: 'Столбец {n}',
        statsColNamed: 'Столбец {n} ({name})',
        statsMoreRows: 'Показано {shown} из {n} строк',
        statsLoadMore: 'Загрузить ещё',
        statsColsAll: 'Все столбцы',
        statsColsPicked: 'Столбцы {a}/{n}',
        statsColsTitle: 'Выберите столбцы для предпросмотра',
        statsToastLastCol: 'Оставьте хотя бы один столбец',
        statsToastCopied: 'Скопировано {n} строк этого столбца',
        statsToastResult: 'Результат скопирован ({n} строк)',
        statsToastCopiedCols: 'Скопировано {c} столбцов / {r} строк',
        statsToastNoData: 'Пока нечего копировать',
        statsToastPickCols: 'Сначала отметьте столбцы для копирования',
        statsToastCell: 'Скопировано: {v}',
        statsToastCellEmpty: 'Эта ячейка пуста',
        statsMetricCount: 'Кол-во',
        statsMetricSum: 'Сумма',
        statsMetricMean: 'Среднее',
        statsMetricMax: 'Макс.',
        statsMetricMin: 'Мин.',
        statsMetricDistinct: 'Уникальных',
        statsMetricStddev: 'Ст. отклонение'
    },
    th: {
        navStats: 'สถิติข้อมูล',
        statsSamples: 'ตัวอย่าง',
        statsSampleOrders: 'รายการสั่งซื้อ',
        statsSampleScores: 'ใบคะแนน',
        statsGroupLabel: 'จัดกลุ่มตาม',
        statsGroupNone: 'ไม่จัดกลุ่ม',
        statsMetricsLabel: 'วิธีสถิติ',
        statsInputTitle: 'ข้อมูล',
        statsPlaceholder: 'วางข้อมูลแบบมีตัวคั่น บรรทัดละหนึ่งรายการ ระบบตรวจจับตัวคั่นให้',
        statsPreviewTitle: 'ตัวอย่างข้อมูล',
        statsResultTitle: 'ผลสถิติ',
        statsResultGroup: 'กลุ่ม',
        statsResultCol: 'คอลัมน์',
        statsCopyResult: 'คัดลอกผลลัพธ์',
        statsCopyCols: 'คัดลอกคอลัมน์ที่เลือก',
        statsCopyColsN: 'คัดลอกคอลัมน์ที่เลือก ({n})',
        statsCopyCol: 'คัดลอกค่าทั้งหมดของคอลัมน์นี้',
        statsLineTip: 'ไปที่บรรทัด {n}',
        statsTipIdle: 'วางข้อมูล แล้วติ๊กคอลัมน์ที่ต้องการสถิติ',
        statsTipPreview: '{r} แถว × {c} คอลัมน์',
        statsTipTruncated: 'เกินขีดจำกัด สถิติเฉพาะ {n} แถวแรก',
        statsTipDone: 'สถิติแล้ว {c} คอลัมน์',
        statsEmptyNoData: 'วางข้อมูลตารางที่นี่ ระบบวิเคราะห์ทันที',
        statsEmptyPickCols: 'ติ๊กคอลัมน์ที่ต้องการสถิติ',
        statsEmptyPickMetrics: 'เลือกวิธีสถิติอย่างน้อยหนึ่งอย่าง',
        statsColIndex: 'คอลัมน์ {n}',
        statsColNamed: 'คอลัมน์ {n} ({name})',
        statsMoreRows: 'แสดง {shown} จาก {n} แถว',
        statsLoadMore: 'โหลดเพิ่ม',
        statsColsAll: 'ทุกคอลัมน์',
        statsColsPicked: 'คอลัมน์ {a}/{n}',
        statsColsTitle: 'เลือกคอลัมน์ที่จะแสดงในตัวอย่าง',
        statsToastLastCol: 'ต้องเหลืออย่างน้อยหนึ่งคอลัมน์',
        statsToastCopied: 'คัดลอก {n} แถวของคอลัมน์นี้แล้ว',
        statsToastResult: 'คัดลอกผลสถิติแล้ว ({n} แถว)',
        statsToastCopiedCols: 'คัดลอก {c} คอลัมน์ / {r} แถวแล้ว',
        statsToastNoData: 'ยังไม่มีข้อมูลให้คัดลอก',
        statsToastPickCols: 'ติ๊กคอลัมน์ที่จะคัดลอกก่อน',
        statsToastCell: 'คัดลอกแล้ว: {v}',
        statsToastCellEmpty: 'เซลล์นี้ว่าง',
        statsMetricCount: 'จำนวน',
        statsMetricSum: 'ผลรวม',
        statsMetricMean: 'ค่าเฉลี่ย',
        statsMetricMax: 'มากสุด',
        statsMetricMin: 'น้อยสุด',
        statsMetricDistinct: 'ค่าไม่ซ้ำ',
        statsMetricStddev: 'ส่วนเบี่ยงเบนมาตรฐาน'
    },
    tr: {
        navStats: 'Veri istatistiği',
        statsSamples: 'Örnekler',
        statsSampleOrders: 'Siparişler',
        statsSampleScores: 'Notlar',
        statsGroupLabel: 'Grupla',
        statsGroupNone: 'Gruplama yok',
        statsMetricsLabel: 'Ölçütler',
        statsInputTitle: 'Veri',
        statsPlaceholder: 'Sınırlayıcılı satırları yapıştırın, satır başına bir kayıt; sınırlayıcı otomatik bulunur',
        statsPreviewTitle: 'Önizleme',
        statsResultTitle: 'Sonuç',
        statsResultGroup: 'Grup',
        statsResultCol: 'Sütun',
        statsCopyResult: 'Sonucu kopyala',
        statsCopyCols: 'Sütunları kopyala',
        statsCopyColsN: 'Sütunları kopyala ({n})',
        statsCopyCol: 'Bu sütunun tüm değerlerini kopyala',
        statsLineTip: '{n}. satıra git',
        statsTipIdle: 'Veriyi yapıştırın, ölçülecek sütunları işaretleyin',
        statsTipPreview: '{r} satır × {c} sütun',
        statsTipTruncated: 'Sınır aşıldı — yalnızca ilk {n} satır ölçülür',
        statsTipDone: '{c} sütun ölçüldü',
        statsEmptyNoData: 'Tablo verisini buraya yapıştırın; yazarken çözümlenir',
        statsEmptyPickCols: 'Ölçülecek sütunları işaretleyin',
        statsEmptyPickMetrics: 'En az bir ölçüt seçin',
        statsColIndex: 'Sütun {n}',
        statsColNamed: 'Sütun {n} ({name})',
        statsMoreRows: '{n} satırın {shown} tanesi gösteriliyor',
        statsLoadMore: 'Daha fazla',
        statsColsAll: 'Tüm sütunlar',
        statsColsPicked: 'Sütun {a}/{n}',
        statsColsTitle: 'Önizlemede gösterilecek sütunları seçin',
        statsToastLastCol: 'En az bir sütun bırakın',
        statsToastCopied: 'Bu sütundan {n} satır kopyalandı',
        statsToastResult: 'Sonuç kopyalandı ({n} satır)',
        statsToastCopiedCols: '{c} sütun / {r} satır kopyalandı',
        statsToastNoData: 'Henüz kopyalanacak veri yok',
        statsToastPickCols: 'Önce kopyalanacak sütunları işaretleyin',
        statsToastCell: 'Kopyalandı: {v}',
        statsToastCellEmpty: 'Bu hücre boş',
        statsMetricCount: 'Adet',
        statsMetricSum: 'Toplam',
        statsMetricMean: 'Ortalama',
        statsMetricMax: 'En büyük',
        statsMetricMin: 'En küçük',
        statsMetricDistinct: 'Benzersiz',
        statsMetricStddev: 'Std. sapma'
    },
    az: {
        navStats: 'Məlumat statistikası',
        statsSamples: 'Nümunələr',
        statsSampleOrders: 'Sifarişlər',
        statsSampleScores: 'Qiymətlər',
        statsGroupLabel: 'Qruplaşdır',
        statsGroupNone: 'Qruplaşdırma yoxdur',
        statsMetricsLabel: 'Metriklər',
        statsInputTitle: 'Məlumat',
        statsPlaceholder: 'Ayırıcılı sətirləri yapışdırın, hər sətir bir qeyd; ayırıcı avtomatik tapılır',
        statsPreviewTitle: 'Önizləmə',
        statsResultTitle: 'Nəticə',
        statsResultGroup: 'Qrup',
        statsResultCol: 'Sütun',
        statsCopyResult: 'Nəticəni kopyala',
        statsCopyCols: 'Sütunları kopyala',
        statsCopyColsN: 'Sütunları kopyala ({n})',
        statsCopyCol: 'Bu sütunun bütün dəyərlərini kopyala',
        statsLineTip: '{n}-ci sətrə keç',
        statsTipIdle: 'Məlumatı yapışdırın, ölçüləcək sütunları işarələyin',
        statsTipPreview: '{r} sətir × {c} sütun',
        statsTipTruncated: 'Limit aşıldı — yalnız ilk {n} sətir ölçülür',
        statsTipDone: '{c} sütun ölçüldü',
        statsEmptyNoData: 'Cədvəl məlumatını buraya yapışdırın; yazarkən təhlil olunur',
        statsEmptyPickCols: 'Ölçüləcək sütunları işarələyin',
        statsEmptyPickMetrics: 'Ən azı bir metrik seçin',
        statsColIndex: 'Sütun {n}',
        statsColNamed: 'Sütun {n} ({name})',
        statsMoreRows: '{n} sətirdən {shown} göstərilir',
        statsLoadMore: 'Daha çox yüklə',
        statsColsAll: 'Bütün sütunlar',
        statsColsPicked: 'Sütun {a}/{n}',
        statsColsTitle: 'Önizləmədə göstəriləcək sütunları seçin',
        statsToastLastCol: 'Ən azı bir sütun saxlayın',
        statsToastCopied: 'Bu sütundan {n} sətir kopyalandı',
        statsToastResult: 'Nəticə kopyalandı ({n} sətir)',
        statsToastCopiedCols: '{c} sütun / {r} sətir kopyalandı',
        statsToastNoData: 'Hələ kopyalanacaq məlumat yoxdur',
        statsToastPickCols: 'Əvvəlcə kopyalanacaq sütunları işarələyin',
        statsToastCell: 'Kopyalandı: {v}',
        statsToastCellEmpty: 'Bu hücrə boşdur',
        statsMetricCount: 'Say',
        statsMetricSum: 'Cəm',
        statsMetricMean: 'Orta',
        statsMetricMax: 'Maks',
        statsMetricMin: 'Min',
        statsMetricDistinct: 'Unikal',
        statsMetricStddev: 'Standart kənarlaşma'
    }
};

function statsT(key, fallback) {
    const table = STATS_I18N[currentLang] || {};
    return table[key] || (STATS_I18N.en || {})[key] || (STATS_I18N['zh-CN'] || {})[key] || fallback || key;
}

function statsFmt(key, vars, fallback) {
    let text = statsT(key, fallback);
    Object.keys(vars || {}).forEach((k) => {
        text = text.split('{' + k + '}').join(String(vars[k]));
    });
    return text;
}

const Stats = window.DBXStats || null;

const statsWorkspaceEl = document.getElementById('statsWorkspace');
const navStatsLink = document.getElementById('navStats');
const statsInputEl = document.getElementById('statsInput');
const statsDelimEl = document.getElementById('statsDelim');
const statsHeaderEl = document.getElementById('statsHeader');
const statsGroupEl = document.getElementById('statsGroup');
const statsGroupTrigger = statsGroupEl ? statsGroupEl.querySelector('.custom-select-trigger') : null;
const statsGroupOptions = statsGroupEl ? statsGroupEl.querySelector('.custom-select-options') : null;
const statsGroupLabel = statsGroupTrigger ? statsGroupTrigger.querySelector('.label') : null;
const statsColsEl = document.getElementById('statsCols');
const statsColsTrigger = statsColsEl ? statsColsEl.querySelector('.custom-select-trigger') : null;
const statsColsOptionsEl = document.getElementById('statsColsOptions');
const statsColsLabel = statsColsTrigger ? statsColsTrigger.querySelector('.label') : null;
const statsMetricsEl = document.getElementById('statsMetrics');
const statsSamplesEl = document.getElementById('statsSamples');
const statsTipEl = document.getElementById('statsTip');
const statsPreviewBadge = document.getElementById('statsPreviewBadge');
const statsResultBadge = document.getElementById('statsResultBadge');
const statsPreviewEmpty = document.getElementById('statsPreviewEmpty');
const statsPreviewTable = document.getElementById('statsPreviewTable');
const statsResultEmpty = document.getElementById('statsResultEmpty');
const statsResultTable = document.getElementById('statsResultTable');
const statsCopyBtn = document.getElementById('statsCopy');
const statsCopyColsBtn = document.getElementById('statsCopyCols');
const statsClearBtn = document.getElementById('statsClear');

// 预览表一批画几行：滚到底再追加，几万行也不会一次塞进 DOM
const STATS_PREVIEW_BATCH = Stats && Stats.LIMITS && Stats.LIMITS.batch ? Stats.LIMITS.batch : 100;

let statsModeActive = false;
let statsEditor = null;                              // CodeMirror（懒创建，进页时才建）
let statsParsed = null;
let statsPreviewLoaded = 0;                          // 预览表已经画了多少行
let statsSel = [];                                   // 勾选的列下标
let statsHiddenCols = [];                            // 预览里藏起来的列（不影响统计）
let statsGroupCol = -1;                              // -1 = 不分组
let statsDelimiter = 'auto';
let statsResult = null;
let statsLocating = false;                           // 防止「定位 -> 光标动 -> 再定位」绕圈
let statsMetricSel = (Stats ? Stats.DEFAULT_METRICS : ['count', 'sum', 'mean', 'distinct']).slice();

// 示例数据：自造的订单流水与成绩单，别拿用户真实数据当样例
const STATS_SAMPLE_DATA = {
    orders: [
        '日期|渠道|地区|金额|数量|状态',
        '2026-01-05|线上|华东|1280.50|12|已付',
        '2026-01-06|线下|华北|860|6|已付',
        '2026-01-08|线上|华南|2399.90|21|待付',
        '2026-01-11|线上|华东|560|4|已付',
        '2026-01-12|线下|华南|1720|9|退款',
        '2026-01-15|线上|华北|3150|27|已付',
        '2026-01-18|线下|华东|430|3|已付',
        '2026-01-21|线上|华南|990.20|7|待付'
    ].join('\n'),
    scores: [
        '学号,姓名,语文,数学,英语',
        '1001,张三,92,88,95',
        '1002,李四,78,91,84',
        '1003,王五,85,79,90',
        '1004,赵六,96,94,89',
        '1005,钱七,72,68,80'
    ].join('\n')
};

/* ------------------------------ 小工具 ------------------------------ */

function statsSetTip(text, cls) {
    if (!statsTipEl) return;
    statsTipEl.textContent = text || '';
    statsTipEl.className = 'compare-tip' + (cls ? ' ' + cls : '');
}

// 列名：有表头用表头，没有就「列 N」；结果表里带上序号，免得两个同名列分不清
function statsColName(idx, withIndex) {
    const head = statsParsed && statsParsed.header ? statsParsed.header[idx] : '';
    const name = head && String(head).trim() ? String(head).trim() : '';
    if (withIndex) {
        return name ? statsFmt('statsColNamed', { n: idx + 1, name: name }, '列 {n}（{name}）')
            : statsFmt('statsColIndex', { n: idx + 1 }, '列 {n}');
    }
    return name || statsFmt('statsColIndex', { n: idx + 1 }, '列 {n}');
}

function statsMetricLabel(m) {
    const key = 'statsMetric' + m.charAt(0).toUpperCase() + m.slice(1);
    return statsT(key, m);
}

function statsTotalRows() {
    return statsParsed ? statsParsed.rows.length : 0;
}

/* ------------------------------ 编辑器 ------------------------------ */

// 和别的页一样用 CodeMirror：有行号才谈得上「定位到第几行」，
// 也能跟着主题走；textarea 只在编辑器还没建起来时兜底
function statsEnsureEditor() {
    if (statsEditor || !statsInputEl) return;
    statsEditor = CodeMirror.fromTextArea(statsInputEl,
        editorConfig('text/plain', statsInputEl.placeholder, statsRun));
    statsEditor.on('change', () => {
        const next = statsEditor.getValue();
        if (statsInputEl.value !== next) statsInputEl.value = next;
        statsRefresh();
    });
    // 光标落在哪一行，右边的预览表就亮起哪一行（表格 → 编辑器方向见 statsLocateRow）
    statsEditor.on('cursorActivity', () => {
        if (!statsModeActive || statsLocating) return;
        statsLocateRow(statsEditor.getCursor().line + 1, 'editor');
    });
    linkTextareaToEditor(statsInputEl, statsEditor);
    syncEditorTheme();
}

function statsText() {
    if (statsEditor) return statsEditor.getValue();
    return statsInputEl ? statsInputEl.value : '';
}

function statsSetText(text) {
    if (statsEditor) statsEditor.setValue(text);
    else if (statsInputEl) {
        statsInputEl.value = text;
        statsRefresh();
    }
}

/**
 * 数据行 <-> 编辑器光标，两个方向共用一条通道。
 * 预览只画前 20 行，光标在更靠后的行时就近亮最后一行，
 * 免得「滚到第 300 行却什么都没选中」，看着像没反应。
 */
function statsLocateRow(line, source) {
    if (!statsPreviewTable || !statsParsed) return;
    const rows = statsPreviewTable.querySelectorAll('tbody tr[data-line]');
    if (!rows.length) return;
    let target = null;
    let targetLine = 0;
    rows.forEach((tr) => {
        const ln = Number(tr.dataset.line || 0);
        if (ln === line) { target = tr; targetLine = ln; return; }
        if (ln < line && (!target || ln > targetLine)) { target = tr; targetLine = ln; }
    });
    // 光标停在表头 / 空行上：清掉高亮，别让上一次的选择留在那儿
    if (!target) {
        statsPreviewTable.querySelectorAll('tr.locate').forEach((tr) => tr.classList.remove('locate'));
        return;
    }
    statsPreviewTable.querySelectorAll('tr.locate').forEach((tr) => tr.classList.remove('locate'));
    target.classList.add('locate');
    if (typeof target.scrollIntoView === 'function') target.scrollIntoView({ block: 'nearest' });

    if (source !== 'preview' || !statsEditor) return;
    const at = targetLine - 1;
    statsLocating = true;
    try {
        statsEditor.setCursor({ line: at, ch: 0 });
        if (typeof statsEditor.scrollIntoView === 'function') {
            statsEditor.scrollIntoView({ line: at, ch: 0 }, 80);
        }
        statsEditor.focus();
    } finally {
        statsLocating = false;
    }
}

/** 预览行被点：把编辑器光标挪到它对应的那一行 */
function statsLocateFromRow(tr) {
    if (!tr) return;
    const line = Number(tr.dataset.line || 0);
    if (line) statsLocateRow(line, 'preview');
}

/* ------------------------------ 勾选状态 ------------------------------ */

// 统计方式 chips：只渲染一次，点一下切 aria-checked
function statsRenderMetrics() {
    if (!statsMetricsEl) return;
    statsMetricsEl.innerHTML = '';
    (Stats ? Stats.METRICS : ['count', 'sum', 'mean', 'max', 'min', 'distinct', 'stddev']).forEach((m) => {
        const chip = document.createElement('span');
        chip.className = 'stats-rule';
        chip.setAttribute('role', 'checkbox');
        chip.dataset.metric = m;
        chip.setAttribute('aria-checked', statsMetricSel.indexOf(m) >= 0 ? 'true' : 'false');
        chip.textContent = statsMetricLabel(m);
        chip.addEventListener('click', () => {
            const on = statsMetricSel.indexOf(m) >= 0;
            statsMetricSel = on ? statsMetricSel.filter((x) => x !== m) : statsMetricSel.concat([m]);
            chip.setAttribute('aria-checked', on ? 'false' : 'true');
            statsRun();
        });
        statsMetricsEl.appendChild(chip);
    });
}

// 分组列下拉：选项跟着表头变，所以自己重建（顶栏那两个是静态的，走 initCustomSelect）
function statsBuildGroupOptions() {
    if (!statsGroupOptions) return;
    const cols = statsParsed ? statsParsed.cols : 0;
    if (statsGroupCol >= cols) statsGroupCol = -1;
    statsGroupOptions.innerHTML = '';
    const none = document.createElement('div');
    none.className = 'custom-option' + (statsGroupCol < 0 ? ' selected' : '');
    none.setAttribute('role', 'option');
    none.dataset.value = '-1';
    none.textContent = statsT('statsGroupNone', '不分组');
    statsGroupOptions.appendChild(none);
    for (let i = 0; i < cols; i++) {
        const opt = document.createElement('div');
        opt.className = 'custom-option' + (statsGroupCol === i ? ' selected' : '');
        opt.setAttribute('role', 'option');
        opt.dataset.value = String(i);
        opt.textContent = statsColName(i, false);
        statsGroupOptions.appendChild(opt);
    }
    statsSyncGroupLabel();
}

function statsSyncGroupLabel() {
    if (!statsGroupLabel) return;
    statsGroupLabel.textContent = statsGroupCol < 0
        ? statsT('statsGroupNone', '不分组')
        : statsColName(statsGroupCol, false);
    if (statsGroupEl) statsGroupEl.dataset.value = String(statsGroupCol);
}

function statsGroupToggle(open) {
    if (!statsGroupOptions) return;
    const next = typeof open === 'boolean' ? open : !statsGroupOptions.classList.contains('open');
    statsGroupOptions.classList.toggle('open', next);
    if (statsGroupTrigger) statsGroupTrigger.classList.toggle('active', next);
}

/* ------------------------------ 预览显示哪些列 ------------------------------ */

// 藏起来的列只是不画出来：统计与复制仍是整张表（只想统计可见列的话，去表头勾选）
function statsColVisible(idx) {
    return statsHiddenCols.indexOf(idx) < 0;
}

function statsVisibleCols() {
    const out = [];
    const cols = statsParsed ? statsParsed.cols : 0;
    for (let i = 0; i < cols; i++) if (statsColVisible(i)) out.push(i);
    return out;
}

// 列名跟着表头变，所以每次重新解析都重建一遍（勾选状态按列下标保留）
function statsBuildColsOptions() {
    if (!statsColsOptionsEl) return;
    const cols = statsParsed ? statsParsed.cols : 0;
    statsHiddenCols = statsHiddenCols.filter((c) => c < cols);
    statsColsOptionsEl.innerHTML = '';
    for (let i = 0; i < cols; i++) {
        const opt = document.createElement('div');
        opt.className = 'custom-option stats-col-opt';
        opt.setAttribute('role', 'option');
        opt.dataset.value = String(i);
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.checked = statsColVisible(i);
        box.dataset.col = String(i);
        box.setAttribute('aria-label', statsColName(i, false));
        const name = document.createElement('span');
        name.className = 'stats-col-opt-name';
        name.textContent = statsColName(i, false);
        name.title = name.textContent;
        opt.appendChild(box);
        opt.appendChild(name);
        statsColsOptionsEl.appendChild(opt);
    }
    statsSyncColsLabel();
}

function statsSyncColsLabel() {
    if (!statsColsLabel) return;
    const cols = statsParsed ? statsParsed.cols : 0;
    const shown = statsVisibleCols().length;
    statsColsLabel.textContent = !cols || shown === cols
        ? statsT('statsColsAll', '全部列')
        : statsFmt('statsColsPicked', { a: shown, n: cols }, '列 {a}/{n}');
}

function statsColsToggle(open) {
    if (!statsColsOptionsEl) return;
    const next = typeof open === 'boolean' ? open : !statsColsOptionsEl.classList.contains('open');
    statsColsOptionsEl.classList.toggle('open', next);
    if (statsColsTrigger) statsColsTrigger.classList.toggle('active', next);
}

function statsToggleCol(idx) {
    const on = statsColVisible(idx);
    const next = on ? statsHiddenCols.concat([idx]) : statsHiddenCols.filter((c) => c !== idx);
    // 至少留一列：全藏了预览就只剩行号，看着像坏了
    const rest = [];
    const cols = statsParsed ? statsParsed.cols : 0;
    for (let i = 0; i < cols; i++) if (next.indexOf(i) < 0) rest.push(i);
    if (!rest.length) {
        // 点在勾选框上时浏览器已经把它取消了，状态却不认——得把它掰回勾上
        const keep = statsColsOptionsEl
            ? statsColsOptionsEl.querySelector('input[data-col="' + idx + '"]')
            : null;
        if (keep) keep.checked = true;
        showToast(statsT('statsToastLastCol', '至少要留一列'), 'error');
        return;
    }
    statsHiddenCols = next;
    const box = statsColsOptionsEl
        ? statsColsOptionsEl.querySelector('input[data-col="' + idx + '"]')
        : null;
    if (box) box.checked = !on;
    statsSyncColsLabel();
    statsRenderPreview();
}

/* ------------------------------ 解析与渲染 ------------------------------ */

// 表头一行：勾选框 + 列名 + 复制这一列。
// 列名要能省略号收尾（真实表头常常一长串数字/下划线），复制按钮常驻最右、不跟着文字挤
function statsHeaderCell(idx) {
    const th = document.createElement('th');
    const wrap = document.createElement('div');
    wrap.className = 'stats-th';

    const label = document.createElement('label');
    label.className = 'stats-col-head';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = statsSel.indexOf(idx) >= 0;
    box.dataset.col = String(idx);
    box.setAttribute('aria-label', statsColName(idx, false));
    box.addEventListener('change', () => {
        statsSel = box.checked
            ? statsSel.concat([idx]).sort((a, b) => a - b)
            : statsSel.filter((c) => c !== idx);
        statsSyncCopyCols();
        statsRun();
    });
    const text = document.createElement('span');
    text.className = 'stats-col-name';
    text.textContent = statsColName(idx, false);
    text.title = statsColName(idx, false);
    label.appendChild(box);
    label.appendChild(text);
    wrap.appendChild(label);

    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'stats-col-copy';
    copy.dataset.col = String(idx);
    copy.setAttribute('data-keep-title', '');
    copy.title = statsT('statsCopyCol', '复制该列全部值');
    copy.setAttribute('aria-label', statsT('statsCopyCol', '复制该列全部值'));
    copy.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="11" height="11"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></svg>';
    copy.addEventListener('click', (e) => {
        e.stopPropagation();
        statsCopyColumn(idx);
    });
    wrap.appendChild(copy);
    th.appendChild(wrap);
    return th;
}

/** 预览表最左边的行号列：和编辑器行号对得上，点一下也能跳过去 */
function statsLineHeadCell() {
    const th = document.createElement('th');
    th.className = 'stats-line-col';
    th.textContent = '#';
    return th;
}

function statsRenderPreview() {
    if (!statsPreviewTable || !statsPreviewEmpty) return;
    const parsed = statsParsed;
    const hasData = !!(parsed && parsed.rows.length);
    statsPreviewEmpty.classList.toggle('hidden', hasData);
    statsPreviewTable.hidden = !hasData;
    // 空表也写成「0 × 0」：解析过的空文本不该显示成「0 行 × 0 列」，两种空态要长得一样
    statsPreviewBadge.textContent = hasData
        ? statsFmt('statsTipPreview', { r: parsed.rows.length, c: parsed.cols }, '{r} 行 × {c} 列')
        : '0 × 0';
    if (!hasData) {
        statsPreviewTable.innerHTML = '';
        statsPreviewLoaded = 0;
        return;
    }

    const thead = document.createElement('thead');
    const hrow = document.createElement('tr');
    hrow.appendChild(statsLineHeadCell());
    statsVisibleCols().forEach((i) => { hrow.appendChild(statsHeaderCell(i)); });
    thead.appendChild(hrow);

    statsPreviewTable.innerHTML = '';
    statsPreviewTable.appendChild(thead);
    statsPreviewTable.appendChild(document.createElement('tbody'));
    statsPreviewLoaded = 0;
    // 先画一批（够铺满一屏），剩下的滚到底再追加
    statsAppendPreviewRows(STATS_PREVIEW_BATCH);
    // 重画会把高亮一起冲掉，按当前光标再点亮一次（编辑后行号会变，必须重算）
    statsSyncLocate();
}

/* 预览表的懒加载：一批 STATS_PREVIEW_BATCH 行，滚到底再追加下一批。
   几万行一次塞进 DOM 滚轮会卡成幻灯片；首屏只画一批，往下滚时才补。 */

function statsPreviewTbody() {
    return statsPreviewTable ? statsPreviewTable.querySelector('tbody') : null;
}

function statsPreviewRow(parsed, idx) {
    const row = parsed.rows[idx] || [];
    const tr = document.createElement('tr');
    // 行号来自原文（表头 / 开头空行都算进去了），点一下就能跳回编辑器那一行
    const line = parsed.lines ? parsed.lines[idx] : idx + 1;
    tr.dataset.line = String(line);
    const lineTd = document.createElement('td');
    lineTd.className = 'stats-line-no';
    lineTd.textContent = String(line);
    // 数据格里点一下是「复制这一格」，跳编辑器留给行号列——两种手势分开，
    // 复制完不会顺手把焦点扔进编辑器（不然下一次粘贴就粘到数据里了）
    lineTd.title = statsFmt('statsLineTip', { n: line }, '跳到第 {n} 行');
    lineTd.setAttribute('data-keep-title', '');
    tr.appendChild(lineTd);
    row.forEach((value, col) => {
        if (!statsColVisible(col)) return;   // 被藏起来的列不画
        const td = document.createElement('td');
        td.textContent = value;
        if (value !== '' && Stats && Stats.toNumber(value) !== null) td.classList.add('is-num');
        tr.appendChild(td);
    });
    return tr;
}

// 表尾：还没画完时给「已显示 x / y 行」和一个「加载更多」（滚到底也会自动补）
function statsUpdatePreviewFooter(parsed) {
    const tbody = statsPreviewTbody();
    if (!tbody) return;
    const total = parsed.rows.length;
    let tr = tbody.querySelector('tr.stats-more');
    if (statsPreviewLoaded >= total) {
        if (tr) tr.remove();
        return;
    }
    if (!tr) {
        tr = document.createElement('tr');
        tr.className = 'stats-more';
        const cell = document.createElement('td');
        cell.className = 'stats-more-cell';
        tr.appendChild(cell);
        tbody.appendChild(tr);
    }
    const cell = tr.firstChild;
    cell.colSpan = statsVisibleCols().length + 1;
    cell.innerHTML = '';
    // td 里再包一层：按钮和文字要横排，直接给 td 上 flex 会把表格布局搅乱
    const inner = document.createElement('div');
    inner.className = 'stats-more-inner';

    const text = document.createElement('span');
    text.className = 'stats-more-text';
    text.textContent = statsFmt('statsMoreRows',
        { shown: statsPreviewLoaded, n: total }, '已显示 {shown} / {n} 行');
    inner.appendChild(text);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'stats-more-btn';
    btn.textContent = statsT('statsLoadMore', '加载更多');
    btn.setAttribute('data-keep-title', '');
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        statsAppendPreviewRows(STATS_PREVIEW_BATCH);
    });
    inner.appendChild(btn);
    cell.appendChild(inner);
}

/** 追加一批预览行，返回这次真正画了几行 */
function statsAppendPreviewRows(count) {
    const parsed = statsParsed;
    const tbody = statsPreviewTbody();
    if (!parsed || !tbody) return 0;
    const total = parsed.rows.length;
    const start = statsPreviewLoaded;
    const end = Math.min(total, start + Math.max(1, count || STATS_PREVIEW_BATCH));
    if (end <= start) return 0;

    const frag = document.createDocumentFragment();
    for (let i = start; i < end; i++) frag.appendChild(statsPreviewRow(parsed, i));
    // 表尾永远留在最后一行
    const footer = tbody.querySelector('tr.stats-more');
    if (footer) tbody.insertBefore(frag, footer);
    else tbody.appendChild(frag);
    statsPreviewLoaded = end;
    statsUpdatePreviewFooter(parsed);
    return end - start;
}

function statsSyncLocate() {
    if (!statsModeActive || !statsEditor) return;
    statsLocateRow(statsEditor.getCursor().line + 1, 'editor');
}

function statsRenderResult() {
    if (!statsResultTable || !statsResultEmpty) return;
    const result = statsResult;
    const hasCols = !!(statsParsed && statsSel.length);
    const hasRows = !!(result && result.rows.length);

    statsResultEmpty.classList.toggle('hidden', hasRows);
    statsResultTable.hidden = !hasRows;
    if (!hasCols) {
        statsResultEmpty.textContent = statsT('statsEmptyPickCols', '勾选要统计的列');
    } else if (!statsMetricSel.length) {
        statsResultEmpty.textContent = statsT('statsEmptyPickMetrics', '选择统计方式');
    }
    statsResultBadge.textContent = hasRows ? String(result.rows.length) : '';
    if (!hasRows) {
        statsResultTable.innerHTML = '';
        return;
    }

    const thead = document.createElement('thead');
    const hrow = document.createElement('tr');
    if (result.groupCol >= 0) {
        const th = document.createElement('th');
        th.textContent = statsT('statsResultGroup', '分组');
        hrow.appendChild(th);
    }
    const thCol = document.createElement('th');
    thCol.textContent = statsT('statsResultCol', '统计列');
    hrow.appendChild(thCol);
    result.metrics.forEach((m) => {
        const th = document.createElement('th');
        th.textContent = statsMetricLabel(m);
        hrow.appendChild(th);
    });
    thead.appendChild(hrow);

    const tbody = document.createElement('tbody');
    result.rows.forEach((row) => {
        const tr = document.createElement('tr');
        if (result.groupCol >= 0) {
            const td = document.createElement('td');
            td.textContent = row.group === '' ? '—' : row.group;
            // 复制的是本来的值，不是占位的「—」
            td.dataset.copy = row.group == null ? '' : String(row.group);
            tr.appendChild(td);
        }
        const tdCol = document.createElement('td');
        tdCol.textContent = statsColName(row.col, true);
        tr.appendChild(tdCol);
        result.metrics.forEach((m) => {
            const td = document.createElement('td');
            td.className = 'is-num';
            td.textContent = Stats ? Stats.formatNum(row[m]) : String(row[m]);
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });

    statsResultTable.innerHTML = '';
    statsResultTable.appendChild(thead);
    statsResultTable.appendChild(tbody);
}

function statsSyncCopyCols() {
    if (!statsCopyColsBtn) return;
    const n = statsSel.length;
    const hasData = !!(statsParsed && statsParsed.rows.length);
    statsCopyColsBtn.disabled = !n || !hasData;
    statsCopyColsBtn.textContent = n > 1
        ? statsFmt('statsCopyColsN', { n: n }, '复制所选列（{n}）')
        : statsT('statsCopyCols', '复制所选列');
}

// 一列都没勾时，先勾上「看着是数字」的列，进来就有结果可看
function statsAutoCols(parsed) {
    if (!parsed || !parsed.rows.length) return [];
    const numeric = [];
    for (let c = 0; c < parsed.cols; c++) {
        let num = 0;
        for (let r = 0; r < Math.min(parsed.rows.length, 50); r++) {
            if (Stats && Stats.toNumber(parsed.rows[r][c]) !== null) num += 1;
        }
        if (num > 0) numeric.push(c);
    }
    return numeric.length ? numeric : parsed.rows[0].map((_, i) => i).slice(0, 8);
}

function statsRun() {
    const parsed = statsParsed;
    statsSyncCopyCols();
    if (!parsed || !parsed.rows.length) {
        statsResult = null;
        statsRenderResult();
        statsSetTip(statsT('statsTipIdle', '贴一段数据，勾选要统计的列'));
        return;
    }
    if (!statsSel.length) {
        statsResult = null;
        statsRenderResult();
        statsSetTip(statsT('statsEmptyPickCols', '勾选要统计的列'));
        return;
    }
    if (!statsMetricSel.length) {
        statsResult = null;
        statsRenderResult();
        statsSetTip(statsT('statsEmptyPickMetrics', '选择统计方式'));
        return;
    }

    // 统计方式按 METRICS 的固定顺序排，不受点击先后影响，表格列才不会跳来跳去
    const order = Stats ? Stats.METRICS : [];
    const metrics = order.filter((m) => statsMetricSel.indexOf(m) >= 0);
    statsResult = Stats
        ? Stats.aggregate(parsed, { cols: statsSel, groupCol: statsGroupCol, metrics: metrics })
        : null;
    statsRenderResult();
    statsSetTip(parsed.truncated
        ? statsFmt('statsTipTruncated', { n: parsed.totalRows }, '超过上限，只统计前 {n} 行')
        : statsFmt('statsTipDone', { c: statsSel.length }, '已统计 {c} 列'),
    parsed.truncated ? 'warn' : 'ok');
}

// 输入 / 分隔符 / 表头 变了：重新解析，勾选状态尽量保留
function statsRefresh() {
    if (!Stats || !statsInputEl) return;
    const parsed = Stats.parse(statsText(), {
        delimiter: statsDelimiter,
        hasHeader: statsHeaderEl ? statsHeaderEl.checked : true
    });
    statsParsed = parsed;

    const kept = statsSel.filter((c) => c < parsed.cols);
    statsSel = kept.length ? kept : statsAutoCols(parsed);

    statsBuildGroupOptions();
    statsBuildColsOptions();
    statsRenderPreview();
    statsRun();
}

/* ------------------------------ 复制 ------------------------------ */

/* 单元格复制：点一下就把这一格拿走。
   两张表都是「算一次整表重画」，所以监听挂在 table 上做委托，不逐个 td 绑。
   dataset.copy 是「要复制的原值」——结果表里空分组画成「—」，复制不能拿那个破折号。 */
function statsCellValue(td) {
    if (!td) return '';
    if (td.dataset && td.dataset.copy != null) return String(td.dataset.copy);
    return td.textContent == null ? '' : String(td.textContent);
}

// toast 一行放不下整格：长的收尾打省略号，剪贴板里仍是全值
function statsClipPreview(text) {
    const s = String(text == null ? '' : text);
    return s.length > 36 ? s.slice(0, 36) + '…' : s;
}

// 复制成功的格子闪一下：一屏几十行，光靠 toast 找不到刚点的是哪一格
let statsFlashedTd = null;
function statsFlashCell(td) {
    if (!td || !td.classList) return;
    // 只留最新那一格在闪，连点时前一个立刻退掉，屏幕上不会同时亮好几块
    if (statsFlashedTd && statsFlashedTd !== td) statsFlashedTd.classList.remove('cell-copied');
    statsFlashedTd = td;
    td.classList.remove('cell-copied');
    if (typeof td.offsetWidth === 'number') void td.offsetWidth;   // 连点同一格也能重放
    td.classList.add('cell-copied');
    setTimeout(() => td.classList.remove('cell-copied'), 700);
}

async function statsCopyCell(td) {
    const value = statsCellValue(td);
    if (!value) {
        showToast(statsT('statsToastCellEmpty', '这一格是空的'), 'error');
        return;
    }
    try {
        await writeClipboardText(value);
        statsFlashCell(td);
        showToast(statsFmt('statsToastCell', { v: statsClipPreview(value) }, '已复制：{v}'));
    } catch (err) {
        showToast(String((err && err.message) || err), 'error');
    }
}

async function statsCopyColumn(idx) {
    const values = Stats ? Stats.columnText(statsParsed, idx) : [];
    if (!values.length) {
        showToast(statsT('statsToastNoData', '还没有可复制的数据'), 'error');
        return;
    }
    try {
        await writeClipboardText(values.join('\n'));
        showToast(statsFmt('statsToastCopied', { n: values.length }, '已复制该列 {n} 行'));
    } catch (err) {
        showToast(String((err && err.message) || err), 'error');
    }
}

async function statsCopySelectedColumns() {
    if (!statsSel.length) {
        showToast(statsT('statsToastPickCols', '请先勾选要复制的列'), 'error');
        return;
    }
    // 按「表」复制：表头一行 + 每行一条记录（Tab 分隔）。
    // 早先是把所有值摊平成一列，粘回表格软件全挤在一列里，等于白复制
    const text = Stats
        ? Stats.columnsTsv(statsParsed, statsSel, (idx) => statsColName(idx, false))
        : '';
    if (!text) {
        showToast(statsT('statsToastNoData', '还没有可复制的数据'), 'error');
        return;
    }
    try {
        await writeClipboardText(text);
        showToast(statsFmt('statsToastCopiedCols', {
            c: statsSel.length,
            r: statsParsed ? statsParsed.rows.length : 0
        }, '已复制 {c} 列 / {r} 行'));
    } catch (err) {
        showToast(String((err && err.message) || err), 'error');
    }
}

async function statsCopyResult() {
    if (!statsResult || !statsResult.rows.length) {
        showToast(statsT('statsToastNoData', '还没有可复制的数据'), 'error');
        return;
    }
    const text = Stats.toTsv(statsResult, {
        group: statsT('statsResultGroup', '分组'),
        col: statsT('statsResultCol', '统计列'),
        metric: (m) => statsMetricLabel(m),
        colName: (idx) => statsColName(idx, true)
    });
    try {
        await writeClipboardText(text);
        showToast(statsFmt('statsToastResult', { n: statsResult.rows.length }, '已复制统计结果（{n} 行）'));
    } catch (err) {
        showToast(String((err && err.message) || err), 'error');
    }
}

/* ------------------------------ 进出页面 ------------------------------ */

function enterStatsMode() {
    exitOtherModes('stats');
    statsModeActive = true;
    markConvertActive(null);
    mainWorkspace.classList.add('hidden');
    toolbarEl.classList.add('hidden');
    statsWorkspaceEl.classList.add('active');
    navStatsLink.classList.add('active');
    // 编辑器在隐藏容器里建出来会量到 0 宽，等这一帧上了屏再 refresh
    statsEnsureEditor();
    // 进来先算一遍：从别的页切回来时输入还在，结果也得跟着在
    if (!statsParsed) statsRefresh();
    else {
        statsBuildGroupOptions();
        statsBuildColsOptions();
        statsRenderPreview();
        statsRun();
    }
    requestAnimationFrame(() => {
        if (statsEditor) statsEditor.refresh();
        statsSyncLocate();
    });
}

function exitStatsMode() {
    if (!statsModeActive) return;
    statsModeActive = false;
    statsWorkspaceEl.classList.remove('active');
    navStatsLink.classList.remove('active');
    statsGroupToggle(false);
    statsColsToggle(false);
    toolbarEl.classList.remove('hidden');
    mainWorkspace.classList.remove('hidden');
}

/* ------------------------------ 事件 ------------------------------ */

if (statsInputEl) {
    statsInputEl.addEventListener('input', statsRefresh);
}
if (statsDelimEl) {
    statsDelimEl.addEventListener('click', (e) => {
        const tab = e.target.closest('.compare-tab');
        if (!tab) return;
        statsDelimEl.querySelectorAll('.compare-tab').forEach((t) => {
            t.classList.toggle('active', t === tab);
        });
        statsDelimiter = tab.dataset.delim || 'auto';
        statsRefresh();
    });
}
if (statsHeaderEl) {
    statsHeaderEl.addEventListener('change', statsRefresh);
}
if (statsSamplesEl) {
    statsSamplesEl.addEventListener('click', (e) => {
        const chip = e.target.closest('.sample-chip');
        if (!chip) return;
        const text = STATS_SAMPLE_DATA[chip.dataset.sample];
        if (!text) return;
        // 换样本时把勾选和分组都清掉，按新表重新自动勾数字列
        statsSel = [];
        statsGroupCol = -1;
        statsDelimiter = 'auto';
        if (statsDelimEl) {
            statsDelimEl.querySelectorAll('.compare-tab').forEach((t) => {
                t.classList.toggle('active', t.dataset.delim === 'auto');
            });
        }
        statsSetText(text);   // 编辑器在就走 setValue（change 里会刷新）
        statsRefresh();
    });
}
if (statsCopyBtn) statsCopyBtn.addEventListener('click', statsCopyResult);
if (statsCopyColsBtn) statsCopyColsBtn.addEventListener('click', statsCopySelectedColumns);

// 预览表：行号列 = 跳编辑器那一行，数据格 = 复制这一格
if (statsPreviewTable) {
    statsPreviewTable.addEventListener('click', (e) => {
        const td = e.target && e.target.closest ? e.target.closest('td') : null;
        if (!td || !statsPreviewTable.contains(td)) return;
        const tr = td.parentElement;
        if (!tr || tr.classList.contains('stats-more')) return;   // 「还有 N 行」那行不是数据
        if (td.classList.contains('stats-line-no')) {
            statsLocateFromRow(tr);
            return;
        }
        statsCopyCell(td);
    });
}
// 结果表：每一格（分组 / 统计列 / 每个指标）都能单独复制
if (statsResultTable) {
    statsResultTable.addEventListener('click', (e) => {
        const td = e.target && e.target.closest ? e.target.closest('td') : null;
        if (!td || !statsResultTable.contains(td)) return;
        statsCopyCell(td);
    });
}
if (statsClearBtn) {
    statsClearBtn.addEventListener('click', () => {
        statsSel = [];
        statsHiddenCols = [];
        statsGroupCol = -1;
        statsResult = null;
        statsParsed = null;
        statsSetText('');
        statsBuildGroupOptions();
        statsRenderPreview();
        statsRun();
        if (statsEditor) statsEditor.focus();
        else statsInputEl.focus();
    });
}

// 分组列下拉：触发器开合，选项走委托（选项是动态重建的，不能逐个绑）
if (statsGroupEl) {
    statsGroupEl.addEventListener('click', (e) => {
        const opt = e.target.closest ? e.target.closest('.custom-option') : null;
        const onTrigger = !!(e.target.closest && e.target.closest('.custom-select-trigger'));
        if (!opt && !onTrigger) return;
        // 顶栏那两个下拉有个「点页面任何地方就收起」的监听，这里要掐断冒泡
        e.stopPropagation();
        if (opt) {
            statsGroupCol = Number(opt.dataset.value);
            statsGroupOptions.querySelectorAll('.custom-option').forEach((o) => {
                o.classList.toggle('selected', o === opt);
            });
            statsSyncGroupLabel();
            statsGroupToggle(false);
            statsRun();
            return;
        }
        statsGroupToggle();
    });
    statsGroupEl.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') statsGroupToggle(false);
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            statsGroupToggle();
        }
    });
}

// 显示哪些列：触发器开合，勾选走委托（选项随表头重建，逐个绑会全丢）
if (statsColsEl) {
    statsColsEl.addEventListener('click', (e) => {
        const opt = e.target && e.target.closest ? e.target.closest('.custom-option') : null;
        const onTrigger = !!(e.target && e.target.closest && e.target.closest('.custom-select-trigger'));
        if (!opt && !onTrigger) return;
        // 顶栏那套「点页面任何地方就收起」的监听不该在面板里生效
        e.stopPropagation();
        if (opt) {
            statsToggleCol(Number(opt.dataset.value));
            return;
        }
        // 开自己之前先把别的下拉收掉，免得两个面板叠在一起
        document.querySelectorAll('.custom-select-options').forEach((o) => {
            if (o !== statsColsOptionsEl) o.classList.remove('open');
        });
        document.querySelectorAll('.custom-select-trigger').forEach((t) => {
            if (t !== statsColsTrigger) t.classList.remove('active');
        });
        statsColsToggle();
    });
    statsColsEl.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') statsColsToggle(false);
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            statsColsToggle();
        }
    });
}

// 预览懒加载：滚到离底 120px 就先把下一批画上，滚起来不会「先白一下再冒出来」。
// 表尾那个「加载更多」是给键盘 / 不想滚到底的人留的
const statsPreviewWrap = statsPreviewTable && statsPreviewTable.closest
    ? statsPreviewTable.closest('.sheet-table-wrap')
    : null;
if (statsPreviewWrap) {
    statsPreviewWrap.addEventListener('scroll', () => {
        if (!statsParsed || statsPreviewLoaded >= statsParsed.rows.length) return;
        const gap = statsPreviewWrap.scrollHeight - statsPreviewWrap.scrollTop - statsPreviewWrap.clientHeight;
        if (gap < 120) statsAppendPreviewRows(STATS_PREVIEW_BATCH);
    });
}

/* ------------------------------ 切语言 ------------------------------ */

// 文案是拼出来的（列名、徽标、提示、chip），切语言后整体重画一遍
function refreshStatsI18n() {
    if (statsEditor) statsEditor.setOption('placeholder', statsInputEl.placeholder || '');
    statsRenderMetrics();
    statsBuildGroupOptions();
    statsBuildColsOptions();
    statsRenderPreview();
    statsRun();
}

// 进页之前先把 chip 与分组下拉铺好；applyI18n 之后还会重画一次，代价可以忽略
statsRenderMetrics();
statsBuildGroupOptions();
statsBuildColsOptions();
