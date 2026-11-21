/* 23-url.js — URL 分析页
 *
 * 左边 CodeMirror：一行一条 URL（批量粘贴），右边：每一条拆开后的结果卡片。
 * 两边用「行号」这根线串起来：
 *   - 点编辑器行号槽里的行号 → 右边滚到那一行对应的卡片并闪一下；
 *   - 光标在编辑器里移动 → 右边的卡片跟着高亮（不抢滚动）；
 *   - 点卡片头上的行号徽标 → 光标回到编辑器那一行。
 * 这样一批 URL 里「第 7 条参数长什么样」不用在一屏卡片里靠眼找。
 *
 * 解析全在 ui/js/urlparse.js（window.DBXUrl，纯函数），这里只做界面与 IO。
 */
/* eslint-disable no-unused-vars */

/* 这一页自己的文案表：14 种语言，键集合与 zh-CN 严格一致（i18n.test 守着）。
   %XX / JSON / Punycode / URL 这些是格式与协议名，各语言不译。 */
const URL_I18N = {
    'zh-CN': {
        navUrl: 'URL 分析', urlSource: 'URL 列表', urlResult: '解析结果',
        urlSamples: '示例', urlSampleFull: '带用户名密码', urlSampleQuery: '多个参数', urlSampleMixed: '混合写法', urlSampleDb: '数据库连接串',
        urlDecode: '解码 %XX', urlCopyJson: '复制 JSON', urlClear: '清空',
        urlFilterAll: '全部', urlFilterErr: '只看失败',
        urlEmptyHint: '左边贴 URL，一行一条；这里会把每一条拆成协议 / 主机 / 端口 / 路径 / 参数',
        urlNoMatch: '没有失败的条目',
        urlStat: '{n} 条 · {ok} 通过 · {bad} 失败',
        urlCardLine: '第 {n} 行', urlCopyOne: '复制', urlCopyKey: '键', urlCopyValue: '值', urlCopyPair: '键=值', urlCopyCardJson: '复制这条 JSON',
        urlParams: '参数（{n}）', urlNoParams: '没有参数', urlParamNoValue: '无值', urlParamDupe: '重复键', urlDatabase: '数据库', urlSpace: '图空间', urlProps: '连接属性',
        urlScheme: '协议', urlUser: '用户名', urlPass: '密码', urlHost: '主机名', urlHostAscii: 'Punycode', urlDriver: '驱动',
        urlPort: '端口', urlPath: '路径', urlQuery: '查询串', urlHash: '片段', urlOrigin: '来源',
        urlPortDefault: '默认端口', urlRaw: '原始输入',
        urlErrBadPort: '端口不是 0–65535 的数字', urlErrBadHost: '主机名写得不对', urlErrBadHostChar: '主机名里有不能用的字符', urlErrTooLong: '这一行太长', urlErrUnknown: '解析失败',
        urlTipCopied: '已复制', urlTipCopiedJson: '已复制 JSON（{n} 条）', urlTipNothing: '没有可复制的内容',
        urlTipTruncated: '超过 {max} 行，只解析了前 {n} 条', urlLoadMore: '还有 {n} 条，点这里继续',
        urlSrcHint: '一行一条 URL'
    },
    'zh-TW': {
        navUrl: 'URL 分析', urlSource: 'URL 清單', urlResult: '解析結果',
        urlSamples: '範例', urlSampleFull: '含帳號密碼', urlSampleQuery: '多個參數', urlSampleMixed: '混合寫法', urlSampleDb: '資料庫連線字串',
        urlDecode: '解碼 %XX', urlCopyJson: '複製 JSON', urlClear: '清空',
        urlFilterAll: '全部', urlFilterErr: '只看失敗',
        urlEmptyHint: '左邊貼 URL，一行一條；這裡會把每一條拆成協定 / 主機 / 連接埠 / 路徑 / 參數',
        urlNoMatch: '沒有失敗的項目',
        urlStat: '{n} 條 · {ok} 通過 · {bad} 失敗',
        urlCardLine: '第 {n} 行', urlCopyOne: '複製', urlCopyKey: '鍵', urlCopyValue: '值', urlCopyPair: '鍵=值', urlCopyCardJson: '複製這條 JSON',
        urlParams: '參數（{n}）', urlNoParams: '沒有參數', urlParamNoValue: '無值', urlParamDupe: '重複鍵', urlDatabase: '資料庫', urlSpace: '圖空間', urlProps: '連線屬性',
        urlScheme: '協定', urlUser: '使用者名稱', urlPass: '密碼', urlHost: '主機名稱', urlHostAscii: 'Punycode', urlDriver: '驅動',
        urlPort: '連接埠', urlPath: '路徑', urlQuery: '查詢字串', urlHash: '片段', urlOrigin: '來源',
        urlPortDefault: '預設連接埠', urlRaw: '原始輸入',
        urlErrBadPort: '連接埠不是 0–65535 的數字', urlErrBadHost: '主機名稱寫錯了', urlErrBadHostChar: '主機名稱有不能用的字元', urlErrTooLong: '這一行太長', urlErrUnknown: '解析失敗',
        urlTipCopied: '已複製', urlTipCopiedJson: '已複製 JSON（{n} 條）', urlTipNothing: '沒有可複製的內容',
        urlTipTruncated: '超過 {max} 行，只解析了前 {n} 條', urlLoadMore: '還有 {n} 條，點這裡繼續',
        urlSrcHint: '一行一條 URL'
    },
    en: {
        navUrl: 'URL Parser', urlSource: 'URL list', urlResult: 'Parsed',
        urlSamples: 'Samples', urlSampleFull: 'With credentials', urlSampleQuery: 'Many params', urlSampleMixed: 'Mixed forms', urlSampleDb: 'Database URLs',
        urlDecode: 'Decode %XX', urlCopyJson: 'Copy JSON', urlClear: 'Clear',
        urlFilterAll: 'All', urlFilterErr: 'Only failures',
        urlEmptyHint: 'Paste URLs on the left, one per line — each one is split into scheme / host / port / path / params here',
        urlNoMatch: 'Nothing failed',
        urlStat: '{n} lines · {ok} ok · {bad} failed',
        urlCardLine: 'Line {n}', urlCopyOne: 'Copy', urlCopyKey: 'Key', urlCopyValue: 'Value', urlCopyPair: 'Key=Value', urlCopyCardJson: 'Copy this JSON',
        urlParams: 'Parameters ({n})', urlNoParams: 'No parameters', urlParamNoValue: 'no value', urlParamDupe: 'duplicate key', urlDatabase: 'Database', urlSpace: 'Graph space', urlProps: 'Connection properties',
        urlScheme: 'Scheme', urlUser: 'Username', urlPass: 'Password', urlHost: 'Hostname', urlHostAscii: 'Punycode', urlDriver: 'Driver',
        urlPort: 'Port', urlPath: 'Path', urlQuery: 'Query', urlHash: 'Fragment', urlOrigin: 'Origin',
        urlPortDefault: 'default port', urlRaw: 'Raw input',
        urlErrBadPort: 'Port is not a number in 0–65535', urlErrBadHost: 'Hostname looks wrong', urlErrBadHostChar: 'Hostname has characters that are not allowed', urlErrTooLong: 'This line is too long', urlErrUnknown: 'Could not parse',
        urlTipCopied: 'Copied', urlTipCopiedJson: 'Copied JSON ({n} entries)', urlTipNothing: 'Nothing to copy',
        urlTipTruncated: 'Over {max} lines — only the first {n} were parsed', urlLoadMore: '{n} more — click to continue',
        urlSrcHint: 'One URL per line'
    },
    az: {
        navUrl: 'URL analizi', urlSource: 'URL siyahısı', urlResult: 'Nəticə',
        urlSamples: 'Nümunələr', urlSampleFull: 'İstifadəçi və parolla', urlSampleQuery: 'Çoxlu parametr', urlSampleMixed: 'Qarışıq yazılış', urlSampleDb: 'Verilənlər bazası ünvanları',
        urlDecode: '%XX həll et', urlCopyJson: 'JSON kopyala', urlClear: 'Təmizlə',
        urlFilterAll: 'Hamısı', urlFilterErr: 'Yalnız xətalar',
        urlEmptyHint: 'Solda URL-ləri hər sətirdə bir dənə yapışdırın — burada hər biri sxem / host / port / yol / parametrlərə bölünür',
        urlNoMatch: 'Xəta yoxdur',
        urlStat: '{n} sətir · {ok} uğurlu · {bad} xətalı',
        urlCardLine: '{n}-ci sətir', urlCopyOne: 'Kopyala', urlCopyKey: 'Açar', urlCopyValue: 'Dəyər', urlCopyPair: 'Açar=Dəyər', urlCopyCardJson: 'Bu JSON-u kopyala',
        urlParams: 'Parametrlər ({n})', urlNoParams: 'Parametr yoxdur', urlParamNoValue: 'dəyərsiz', urlParamDupe: 'təkrar açar', urlDatabase: 'Verilənlər bazası', urlSpace: 'Qraf sahəsi', urlProps: 'Bağlantı xassələri',
        urlScheme: 'Sxem', urlUser: 'İstifadəçi', urlPass: 'Parol', urlHost: 'Host adı', urlHostAscii: 'Punycode', urlDriver: 'Sürücü',
        urlPort: 'Port', urlPath: 'Yol', urlQuery: 'Sorğu', urlHash: 'Fraqment', urlOrigin: 'Mənbə',
        urlPortDefault: 'standart port', urlRaw: 'Daxil edilən sətir',
        urlErrBadPort: 'Port 0–65535 aralığında rəqəm deyil', urlErrBadHost: 'Host adı səhv görünür', urlErrBadHostChar: 'Host adında icazəsiz simvollar var', urlErrTooLong: 'Bu sətir çox uzundur', urlErrUnknown: 'Analiz alınmadı',
        urlTipCopied: 'Kopyalandı', urlTipCopiedJson: 'JSON kopyalandı ({n} qeyd)', urlTipNothing: 'Kopyalamaq üçün məzmun yoxdur',
        urlTipTruncated: '{max} sətirdən çoxdur — yalnız ilk {n} sətri analiz edildi', urlLoadMore: 'Daha {n} sətir var — davam etmək üçün basın',
        urlSrcHint: 'Hər sətirdə bir URL'
    },
    es: {
        navUrl: 'Analizador de URL', urlSource: 'Lista de URL', urlResult: 'Resultado',
        urlSamples: 'Ejemplos', urlSampleFull: 'Con credenciales', urlSampleQuery: 'Varios parámetros', urlSampleMixed: 'Formas mixtas', urlSampleDb: 'Conexiones de base de datos',
        urlDecode: 'Decodificar %XX', urlCopyJson: 'Copiar JSON', urlClear: 'Limpiar',
        urlFilterAll: 'Todo', urlFilterErr: 'Solo fallos',
        urlEmptyHint: 'Pega las URL a la izquierda, una por línea: aquí cada una se separa en esquema / host / puerto / ruta / parámetros',
        urlNoMatch: 'No hay fallos',
        urlStat: '{n} líneas · {ok} correctas · {bad} con error',
        urlCardLine: 'Línea {n}', urlCopyOne: 'Copiar', urlCopyKey: 'Clave', urlCopyValue: 'Valor', urlCopyPair: 'Clave=Valor', urlCopyCardJson: 'Copiar este JSON',
        urlParams: 'Parámetros ({n})', urlNoParams: 'Sin parámetros', urlParamNoValue: 'sin valor', urlParamDupe: 'clave repetida', urlDatabase: 'Base de datos', urlSpace: 'Espacio de grafo', urlProps: 'Propiedades de conexión',
        urlScheme: 'Esquema', urlUser: 'Usuario', urlPass: 'Contraseña', urlHost: 'Host', urlHostAscii: 'Punycode', urlDriver: 'Controlador',
        urlPort: 'Puerto', urlPath: 'Ruta', urlQuery: 'Consulta', urlHash: 'Fragmento', urlOrigin: 'Origen',
        urlPortDefault: 'puerto por defecto', urlRaw: 'Entrada original',
        urlErrBadPort: 'El puerto no es un número entre 0 y 65535', urlErrBadHost: 'El host no parece válido', urlErrBadHostChar: 'El host tiene caracteres no permitidos', urlErrTooLong: 'Esta línea es demasiado larga', urlErrUnknown: 'No se pudo analizar',
        urlTipCopied: 'Copiado', urlTipCopiedJson: 'JSON copiado ({n} entradas)', urlTipNothing: 'Nada que copiar',
        urlTipTruncated: 'Más de {max} líneas: solo se analizaron las primeras {n}', urlLoadMore: 'Quedan {n}: pulsa para continuar',
        urlSrcHint: 'Una URL por línea'
    },
    id: {
        navUrl: 'Analisis URL', urlSource: 'Daftar URL', urlResult: 'Hasil',
        urlSamples: 'Contoh', urlSampleFull: 'Dengan kredensial', urlSampleQuery: 'Banyak parameter', urlSampleMixed: 'Bentuk campuran', urlSampleDb: 'URL database',
        urlDecode: 'Dekode %XX', urlCopyJson: 'Salin JSON', urlClear: 'Hapus',
        urlFilterAll: 'Semua', urlFilterErr: 'Hanya gagal',
        urlEmptyHint: 'Tempel URL di kiri, satu per baris — di sini tiap baris dipecah jadi skema / host / port / path / parameter',
        urlNoMatch: 'Tidak ada yang gagal',
        urlStat: '{n} baris · {ok} berhasil · {bad} gagal',
        urlCardLine: 'Baris {n}', urlCopyOne: 'Salin', urlCopyKey: 'Kunci', urlCopyValue: 'Nilai', urlCopyPair: 'Kunci=Nilai', urlCopyCardJson: 'Salin JSON ini',
        urlParams: 'Parameter ({n})', urlNoParams: 'Tanpa parameter', urlParamNoValue: 'tanpa nilai', urlParamDupe: 'kunci ganda', urlDatabase: 'Basis data', urlSpace: 'Ruang graf', urlProps: 'Properti koneksi',
        urlScheme: 'Skema', urlUser: 'Pengguna', urlPass: 'Kata sandi', urlHost: 'Host', urlHostAscii: 'Punycode', urlDriver: 'Driver',
        urlPort: 'Port', urlPath: 'Path', urlQuery: 'Kueri', urlHash: 'Fragmen', urlOrigin: 'Asal',
        urlPortDefault: 'port bawaan', urlRaw: 'Input asli',
        urlErrBadPort: 'Port bukan angka 0–65535', urlErrBadHost: 'Nama host tampak salah', urlErrBadHostChar: 'Nama host memuat karakter yang tidak diizinkan', urlErrTooLong: 'Baris ini terlalu panjang', urlErrUnknown: 'Gagal mengurai',
        urlTipCopied: 'Disalin', urlTipCopiedJson: 'JSON disalin ({n} entri)', urlTipNothing: 'Tidak ada yang bisa disalin',
        urlTipTruncated: 'Lebih dari {max} baris — hanya {n} pertama diurai', urlLoadMore: 'Masih ada {n} — klik untuk lanjut',
        urlSrcHint: 'Satu URL per baris'
    },
    it: {
        navUrl: 'Analizzatore URL', urlSource: 'Elenco URL', urlResult: 'Risultato',
        urlSamples: 'Esempi', urlSampleFull: 'Con credenziali', urlSampleQuery: 'Molti parametri', urlSampleMixed: 'Forme miste', urlSampleDb: 'Stringhe di connessione',
        urlDecode: 'Decodifica %XX', urlCopyJson: 'Copia JSON', urlClear: 'Pulisci',
        urlFilterAll: 'Tutti', urlFilterErr: 'Solo errori',
        urlEmptyHint: 'Incolla le URL a sinistra, una per riga: qui ognuna viene divisa in schema / host / porta / percorso / parametri',
        urlNoMatch: 'Nessun errore',
        urlStat: '{n} righe · {ok} valide · {bad} con errori',
        urlCardLine: 'Riga {n}', urlCopyOne: 'Copia', urlCopyKey: 'Chiave', urlCopyValue: 'Valore', urlCopyPair: 'Chiave=Valore', urlCopyCardJson: 'Copia questo JSON',
        urlParams: 'Parametri ({n})', urlNoParams: 'Nessun parametro', urlParamNoValue: 'senza valore', urlParamDupe: 'chiave duplicata', urlDatabase: 'Database', urlSpace: 'Spazio del grafo', urlProps: 'Proprietà di connessione',
        urlScheme: 'Schema', urlUser: 'Utente', urlPass: 'Password', urlHost: 'Host', urlHostAscii: 'Punycode', urlDriver: 'Driver',
        urlPort: 'Porta', urlPath: 'Percorso', urlQuery: 'Query', urlHash: 'Frammento', urlOrigin: 'Origine',
        urlPortDefault: 'porta predefinita', urlRaw: 'Testo originale',
        urlErrBadPort: 'La porta non è un numero tra 0 e 65535', urlErrBadHost: 'Il nome host sembra errato', urlErrBadHostChar: 'Il nome host contiene caratteri non consentiti', urlErrTooLong: 'Questa riga è troppo lunga', urlErrUnknown: 'Analisi non riuscita',
        urlTipCopied: 'Copiato', urlTipCopiedJson: 'JSON copiato ({n} voci)', urlTipNothing: 'Niente da copiare',
        urlTipTruncated: 'Oltre {max} righe: analizzate solo le prime {n}', urlLoadMore: 'Altre {n} — clicca per continuare',
        urlSrcHint: 'Una URL per riga'
    },
    ja: {
        navUrl: 'URL 分析', urlSource: 'URL 一覧', urlResult: '解析結果',
        urlSamples: 'サンプル', urlSampleFull: '認証情報つき', urlSampleQuery: 'パラメータ多数', urlSampleMixed: 'いろいろな書き方', urlSampleDb: 'データベース接続文字列',
        urlDecode: '%XX をデコード', urlCopyJson: 'JSON をコピー', urlClear: 'クリア',
        urlFilterAll: 'すべて', urlFilterErr: '失敗のみ',
        urlEmptyHint: '左に URL を 1 行 1 件で貼り付けてください。ここでスキーム / ホスト / ポート / パス / パラメータに分解します',
        urlNoMatch: '失敗はありません',
        urlStat: '{n} 行 · {ok} 件 OK · {bad} 件失敗',
        urlCardLine: '{n} 行目', urlCopyOne: 'コピー', urlCopyKey: 'キー', urlCopyValue: '値', urlCopyPair: 'キー=値', urlCopyCardJson: 'この JSON をコピー',
        urlParams: 'パラメータ（{n}）', urlNoParams: 'パラメータなし', urlParamNoValue: '値なし', urlParamDupe: 'キー重複', urlDatabase: 'データベース', urlSpace: 'グラフ空間', urlProps: '接続プロパティ',
        urlScheme: 'スキーム', urlUser: 'ユーザー名', urlPass: 'パスワード', urlHost: 'ホスト名', urlHostAscii: 'Punycode', urlDriver: 'ドライバー',
        urlPort: 'ポート', urlPath: 'パス', urlQuery: 'クエリ', urlHash: 'フラグメント', urlOrigin: 'オリジン',
        urlPortDefault: '既定のポート', urlRaw: '入力そのもの',
        urlErrBadPort: 'ポートが 0〜65535 の数値ではありません', urlErrBadHost: 'ホスト名が不正です', urlErrBadHostChar: 'ホスト名に使えない文字が含まれています', urlErrTooLong: 'この行は長すぎます', urlErrUnknown: '解析できません',
        urlTipCopied: 'コピーしました', urlTipCopiedJson: 'JSON をコピーしました（{n} 件）', urlTipNothing: 'コピーする内容がありません',
        urlTipTruncated: '{max} 行を超えています。先頭 {n} 件のみ解析しました', urlLoadMore: '残り {n} 件 — クリックで続きを表示',
        urlSrcHint: '1 行に 1 つの URL'
    },
    ko: {
        navUrl: 'URL 분석', urlSource: 'URL 목록', urlResult: '분석 결과',
        urlSamples: '예시', urlSampleFull: '사용자 정보 포함', urlSampleQuery: '매개변수 여러 개', urlSampleMixed: '여러 형태', urlSampleDb: '데이터베이스 연결 문자열',
        urlDecode: '%XX 디코드', urlCopyJson: 'JSON 복사', urlClear: '지우기',
        urlFilterAll: '전체', urlFilterErr: '실패만',
        urlEmptyHint: '왼쪽에 URL을 한 줄에 하나씩 붙여넣으세요. 여기서 스킴 / 호스트 / 포트 / 경로 / 매개변수로 나눕니다',
        urlNoMatch: '실패한 항목이 없습니다',
        urlStat: '{n}줄 · {ok}개 정상 · {bad}개 실패',
        urlCardLine: '{n}번째 줄', urlCopyOne: '복사', urlCopyKey: '키', urlCopyValue: '값', urlCopyPair: '키=값', urlCopyCardJson: '이 JSON 복사',
        urlParams: '매개변수 ({n})', urlNoParams: '매개변수 없음', urlParamNoValue: '값 없음', urlParamDupe: '중복 키', urlDatabase: '데이터베이스', urlSpace: '그래프 공간', urlProps: '연결 속성',
        urlScheme: '스킴', urlUser: '사용자 이름', urlPass: '비밀번호', urlHost: '호스트 이름', urlHostAscii: 'Punycode', urlDriver: '드라이버',
        urlPort: '포트', urlPath: '경로', urlQuery: '쿼리', urlHash: '프래그먼트', urlOrigin: '출처',
        urlPortDefault: '기본 포트', urlRaw: '입력 원문',
        urlErrBadPort: '포트가 0–65535 범위의 숫자가 아닙니다', urlErrBadHost: '호스트 이름이 잘못되었습니다', urlErrBadHostChar: '호스트 이름에 사용할 수 없는 문자가 있습니다', urlErrTooLong: '이 줄이 너무 깁니다', urlErrUnknown: '분석할 수 없습니다',
        urlTipCopied: '복사했습니다', urlTipCopiedJson: 'JSON을 복사했습니다 ({n}개)', urlTipNothing: '복사할 내용이 없습니다',
        urlTipTruncated: '{max}줄을 넘어 앞의 {n}개만 분석했습니다', urlLoadMore: '{n}개 더 있음 — 클릭하여 계속',
        urlSrcHint: '한 줄에 URL 하나'
    },
    pt: {
        navUrl: 'Analisador de URL', urlSource: 'Lista de URL', urlResult: 'Resultado',
        urlSamples: 'Exemplos', urlSampleFull: 'Com credenciais', urlSampleQuery: 'Vários parâmetros', urlSampleMixed: 'Formas mistas', urlSampleDb: 'Conexões de banco de dados',
        urlDecode: 'Decodificar %XX', urlCopyJson: 'Copiar JSON', urlClear: 'Limpar',
        urlFilterAll: 'Tudo', urlFilterErr: 'Só falhas',
        urlEmptyHint: 'Cole as URLs à esquerda, uma por linha: aqui cada uma é dividida em esquema / host / porta / caminho / parâmetros',
        urlNoMatch: 'Nada falhou',
        urlStat: '{n} linhas · {ok} ok · {bad} com erro',
        urlCardLine: 'Linha {n}', urlCopyOne: 'Copiar', urlCopyKey: 'Chave', urlCopyValue: 'Valor', urlCopyPair: 'Chave=Valor', urlCopyCardJson: 'Copiar este JSON',
        urlParams: 'Parâmetros ({n})', urlNoParams: 'Sem parâmetros', urlParamNoValue: 'sem valor', urlParamDupe: 'chave repetida', urlDatabase: 'Banco de dados', urlSpace: 'Espaço do grafo', urlProps: 'Propriedades de conexão',
        urlScheme: 'Esquema', urlUser: 'Usuário', urlPass: 'Senha', urlHost: 'Host', urlHostAscii: 'Punycode', urlDriver: 'Driver',
        urlPort: 'Porta', urlPath: 'Caminho', urlQuery: 'Consulta', urlHash: 'Fragmento', urlOrigin: 'Origem',
        urlPortDefault: 'porta padrão', urlRaw: 'Entrada original',
        urlErrBadPort: 'A porta não é um número entre 0 e 65535', urlErrBadHost: 'O host parece inválido', urlErrBadHostChar: 'O host tem caracteres não permitidos', urlErrTooLong: 'Esta linha é longa demais', urlErrUnknown: 'Não foi possível analisar',
        urlTipCopied: 'Copiado', urlTipCopiedJson: 'JSON copiado ({n} entradas)', urlTipNothing: 'Nada para copiar',
        urlTipTruncated: 'Mais de {max} linhas: só as primeiras {n} foram analisadas', urlLoadMore: 'Mais {n} — clique para continuar',
        urlSrcHint: 'Uma URL por linha'
    },
    pl: {
        navUrl: 'Analizator URL', urlSource: 'Lista URL', urlResult: 'Wynik',
        urlSamples: 'Przykłady', urlSampleFull: 'Z danymi logowania', urlSampleQuery: 'Wiele parametrów', urlSampleMixed: 'Różne zapisy', urlSampleDb: 'Ciągi połączeń do baz',
        urlDecode: 'Dekoduj %XX', urlCopyJson: 'Kopiuj JSON', urlClear: 'Wyczyść',
        urlFilterAll: 'Wszystkie', urlFilterErr: 'Tylko błędy',
        urlEmptyHint: 'Wklej adresy po lewej, jeden w wierszu — tutaj każdy zostanie rozbity na schemat / host / port / ścieżkę / parametry',
        urlNoMatch: 'Brak błędów',
        urlStat: '{n} wierszy · {ok} ok · {bad} błędów',
        urlCardLine: 'Wiersz {n}', urlCopyOne: 'Kopiuj', urlCopyKey: 'Klucz', urlCopyValue: 'Wartość', urlCopyPair: 'Klucz=Wartość', urlCopyCardJson: 'Kopiuj ten JSON',
        urlParams: 'Parametry ({n})', urlNoParams: 'Brak parametrów', urlParamNoValue: 'bez wartości', urlParamDupe: 'powtórzony klucz', urlDatabase: 'Baza danych', urlSpace: 'Przestrzeń grafu', urlProps: 'Właściwości połączenia',
        urlScheme: 'Schemat', urlUser: 'Użytkownik', urlPass: 'Hasło', urlHost: 'Host', urlHostAscii: 'Punycode', urlDriver: 'Sterownik',
        urlPort: 'Port', urlPath: 'Ścieżka', urlQuery: 'Zapytanie', urlHash: 'Fragment', urlOrigin: 'Pochodzenie',
        urlPortDefault: 'port domyślny', urlRaw: 'Dane wejściowe',
        urlErrBadPort: 'Port nie jest liczbą z zakresu 0–65535', urlErrBadHost: 'Nazwa hosta wygląda źle', urlErrBadHostChar: 'Nazwa hosta zawiera niedozwolone znaki', urlErrTooLong: 'Ten wiersz jest za długi', urlErrUnknown: 'Nie udało się przeanalizować',
        urlTipCopied: 'Skopiowano', urlTipCopiedJson: 'Skopiowano JSON ({n} wpisów)', urlTipNothing: 'Nie ma czego kopiować',
        urlTipTruncated: 'Ponad {max} wierszy — przeanalizowano tylko pierwsze {n}', urlLoadMore: 'Jeszcze {n} — kliknij, aby kontynuować',
        urlSrcHint: 'Jeden URL w wierszu'
    },
    ru: {
        navUrl: 'Анализ URL', urlSource: 'Список URL', urlResult: 'Результат',
        urlSamples: 'Примеры', urlSampleFull: 'С логином и паролем', urlSampleQuery: 'Много параметров', urlSampleMixed: 'Разные записи', urlSampleDb: 'Строки подключения к БД',
        urlDecode: 'Декодировать %XX', urlCopyJson: 'Копировать JSON', urlClear: 'Очистить',
        urlFilterAll: 'Все', urlFilterErr: 'Только ошибки',
        urlEmptyHint: 'Вставьте URL слева, по одному в строке — здесь каждый разбирается на схему / хост / порт / путь / параметры',
        urlNoMatch: 'Ошибок нет',
        urlStat: '{n} строк · {ok} успешно · {bad} с ошибкой',
        urlCardLine: 'Строка {n}', urlCopyOne: 'Копировать', urlCopyKey: 'Ключ', urlCopyValue: 'Значение', urlCopyPair: 'Ключ=Значение', urlCopyCardJson: 'Копировать этот JSON',
        urlParams: 'Параметры ({n})', urlNoParams: 'Нет параметров', urlParamNoValue: 'без значения', urlParamDupe: 'повтор ключа', urlDatabase: 'База данных', urlSpace: 'Графовое пространство', urlProps: 'Свойства подключения',
        urlScheme: 'Схема', urlUser: 'Пользователь', urlPass: 'Пароль', urlHost: 'Хост', urlHostAscii: 'Punycode', urlDriver: 'Драйвер',
        urlPort: 'Порт', urlPath: 'Путь', urlQuery: 'Запрос', urlHash: 'Фрагмент', urlOrigin: 'Источник',
        urlPortDefault: 'порт по умолчанию', urlRaw: 'Исходная строка',
        urlErrBadPort: 'Порт не является числом от 0 до 65535', urlErrBadHost: 'Имя хоста выглядит неверным', urlErrBadHostChar: 'В имени хоста есть недопустимые символы', urlErrTooLong: 'Строка слишком длинная', urlErrUnknown: 'Не удалось разобрать',
        urlTipCopied: 'Скопировано', urlTipCopiedJson: 'JSON скопирован ({n} записей)', urlTipNothing: 'Нечего копировать',
        urlTipTruncated: 'Больше {max} строк — разобраны только первые {n}', urlLoadMore: 'Ещё {n} — нажмите, чтобы продолжить',
        urlSrcHint: 'Один URL в строке'
    },
    th: {
        navUrl: 'วิเคราะห์ URL', urlSource: 'รายการ URL', urlResult: 'ผลการแยก',
        urlSamples: 'ตัวอย่าง', urlSampleFull: 'มีชื่อผู้ใช้และรหัส', urlSampleQuery: 'พารามิเตอร์หลายตัว', urlSampleMixed: 'หลายรูปแบบ', urlSampleDb: 'สตริงการเชื่อมต่อฐานข้อมูล',
        urlDecode: 'ถอดรหัส %XX', urlCopyJson: 'คัดลอก JSON', urlClear: 'ล้าง',
        urlFilterAll: 'ทั้งหมด', urlFilterErr: 'เฉพาะที่ผิดพลาด',
        urlEmptyHint: 'วาง URL ทางซ้าย บรรทัดละหนึ่งรายการ ที่นี่จะแยกแต่ละรายการเป็น scheme / โฮสต์ / พอร์ต / พาธ / พารามิเตอร์',
        urlNoMatch: 'ไม่มีรายการที่ผิดพลาด',
        urlStat: '{n} บรรทัด · ผ่าน {ok} · ผิดพลาด {bad}',
        urlCardLine: 'บรรทัดที่ {n}', urlCopyOne: 'คัดลอก', urlCopyKey: 'คีย์', urlCopyValue: 'ค่า', urlCopyPair: 'คีย์=ค่า', urlCopyCardJson: 'คัดลอก JSON นี้',
        urlParams: 'พารามิเตอร์ ({n})', urlNoParams: 'ไม่มีพารามิเตอร์', urlParamNoValue: 'ไม่มีค่า', urlParamDupe: 'คีย์ซ้ำ', urlDatabase: 'ฐานข้อมูล', urlSpace: 'สเปซกราฟ', urlProps: 'คุณสมบัติการเชื่อมต่อ',
        urlScheme: 'Scheme', urlUser: 'ชื่อผู้ใช้', urlPass: 'รหัสผ่าน', urlHost: 'โฮสต์', urlHostAscii: 'Punycode', urlDriver: 'ไดรเวอร์',
        urlPort: 'พอร์ต', urlPath: 'พาธ', urlQuery: 'คิวรี', urlHash: 'แฟรกเมนต์', urlOrigin: 'ต้นทาง',
        urlPortDefault: 'พอร์ตเริ่มต้น', urlRaw: 'ข้อความตั้งต้น',
        urlErrBadPort: 'พอร์ตไม่ใช่ตัวเลข 0–65535', urlErrBadHost: 'ชื่อโฮสต์ดูไม่ถูกต้อง', urlErrBadHostChar: 'ชื่อโฮสต์มีอักขระที่ไม่อนุญาต', urlErrTooLong: 'บรรทัดนี้ยาวเกินไป', urlErrUnknown: 'แยกไม่ได้',
        urlTipCopied: 'คัดลอกแล้ว', urlTipCopiedJson: 'คัดลอก JSON แล้ว ({n} รายการ)', urlTipNothing: 'ไม่มีอะไรให้คัดลอก',
        urlTipTruncated: 'เกิน {max} บรรทัด — แยกเฉพาะ {n} รายการแรก', urlLoadMore: 'เหลืออีก {n} — คลิกเพื่อดูต่อ',
        urlSrcHint: 'หนึ่ง URL ต่อบรรทัด'
    },
    tr: {
        navUrl: 'URL çözümleyici', urlSource: 'URL listesi', urlResult: 'Sonuç',
        urlSamples: 'Örnekler', urlSampleFull: 'Kimlik bilgili', urlSampleQuery: 'Çok parametreli', urlSampleMixed: 'Karışık yazım', urlSampleDb: 'Veritabanı adresleri',
        urlDecode: '%XX çöz', urlCopyJson: 'JSON kopyala', urlClear: 'Temizle',
        urlFilterAll: 'Tümü', urlFilterErr: 'Yalnız hatalar',
        urlEmptyHint: 'URL’leri sola her satıra bir tane yapıştırın — burada her biri şema / sunucu / port / yol / parametre olarak ayrılır',
        urlNoMatch: 'Hata yok',
        urlStat: '{n} satır · {ok} başarılı · {bad} hatalı',
        urlCardLine: '{n}. satır', urlCopyOne: 'Kopyala', urlCopyKey: 'Anahtar', urlCopyValue: 'Değer', urlCopyPair: 'Anahtar=Değer', urlCopyCardJson: 'Bu JSON’u kopyala',
        urlParams: 'Parametreler ({n})', urlNoParams: 'Parametre yok', urlParamNoValue: 'değersiz', urlParamDupe: 'yinelenen anahtar', urlDatabase: 'Veritabanı', urlSpace: 'Graf alanı', urlProps: 'Bağlantı özellikleri',
        urlScheme: 'Şema', urlUser: 'Kullanıcı', urlPass: 'Parola', urlHost: 'Sunucu adı', urlHostAscii: 'Punycode', urlDriver: 'Sürücü',
        urlPort: 'Port', urlPath: 'Yol', urlQuery: 'Sorgu', urlHash: 'Parça', urlOrigin: 'Kaynak',
        urlPortDefault: 'varsayılan port', urlRaw: 'Girdi',
        urlErrBadPort: 'Port 0–65535 aralığında bir sayı değil', urlErrBadHost: 'Sunucu adı hatalı görünüyor', urlErrBadHostChar: 'Sunucu adında izin verilmeyen karakterler var', urlErrTooLong: 'Bu satır çok uzun', urlErrUnknown: 'Çözümlenemedi',
        urlTipCopied: 'Kopyalandı', urlTipCopiedJson: 'JSON kopyalandı ({n} kayıt)', urlTipNothing: 'Kopyalanacak bir şey yok',
        urlTipTruncated: '{max} satırdan fazla — yalnız ilk {n} tanesi çözümlendi', urlLoadMore: '{n} tane daha — devam için tıklayın',
        urlSrcHint: 'Her satırda bir URL'
    }
};

function urlT(key, vars) {
    const table = URL_I18N[currentLang] || URL_I18N.en || {};
    const base = URL_I18N['zh-CN'] || {};
    let text = table[key] || (URL_I18N.en && URL_I18N.en[key]) || base[key] || key;
    if (vars) {
        Object.keys(vars).forEach((k) => {
            text = text.split('{' + k + '}').join(String(vars[k]));
        });
    }
    return text;
}

/* ------------------------------- 页面元素 ------------------------------- */

const urlWorkspace = document.getElementById('urlWorkspace');
const navUrlLink = document.getElementById('navUrl');
const urlSrcText = document.getElementById('urlSrcText');
const urlResults = document.getElementById('urlResults');
const urlSrcBadge = document.getElementById('urlSrcBadge');
const urlOutBadge = document.getElementById('urlOutBadge');
const urlStat = document.getElementById('urlStat');
const urlSamples = document.getElementById('urlSamples');
const urlDecodeBox = document.getElementById('urlDecode');
const urlFilterTabs = document.getElementById('urlFilter');
const urlCopyJsonBtn = document.getElementById('urlCopyJson');
const urlClearBtn = document.getElementById('urlClear');

/* --------------------------------- 状态 --------------------------------- */

let urlModeActive = false;
let urlEditor = null;
let urlData = { results: [], skipped: 0, totalLines: 0, truncated: false, okCount: 0 };
let urlFilter = 'all';           // all | bad
let urlRenderLimit = 120;        // 一次渲染多少张卡（够看，也不至于卡住）
let urlCardIndex = Object.create(null);   // line → 卡片元素
let urlActiveLine = 0;
let urlTimer = null;
let urlFlashTimer = null;

const URL_RENDER_PAGE = 120;

/* 示例：全部是自造地址，用 example.com 这类保留域名，不出现真实业务数据 */
const URL_SAMPLES = {
    full: [
        'https://demo:secret@api.example.com:8443/v1/items?page=2&size=20&q=%E4%B8%AD%E6%96%87#section-2'
    ].join('\n'),
    query: [
        'https://www.example.com/search?q=hello%20world&lang=zh-CN&tag=a&tag=b&debug#results',
        'http://example.com:8080/health?probe=1&probe=2'
    ].join('\n'),
    mixed: [
        'example.com:8080/a/b?x=1',
        '//cdn.example.com/lib.js?v=1.2.3',
        '/relative/path?x=1',
        'mailto:team@example.com',
        'https://[::1]:5173/app?mode=dev',
        'jdbc:mysql://db.example.com:3306/demo?user=app&password=secret',
        'jdbc:sqlserver://db.example.com:1433;databaseName=demo;user=sa',
        'ssh://root@10.1.2.3:22/var/log/app.log',
        'sftp://deploy@files.example.com:2222/upload/inbox',
        'ftp://user:pass@ftp.example.com:21/pub/readme.txt',
        'git@github.com:team/repo.git',
        // 不带 jdbc: 的数据库地址，规则和 jdbc 那条一样
        'mysql://app:secret@db.example.com:53306/demo',
        // 国产数据库的连接串（达梦）
        'jdbc:dm://10.1.2.3:5236/DEMO'
    ].join('\n'),
    // 数据库一族的各种写法：带 / 不带 jdbc、国产库、NoSQL
    db: [
        'mysql://app:secret@db.example.com:53306/demo',
        'jdbc:mysql://db.example.com:3306/demo?user=app&password=secret&useSSL=false',
        'jdbc:postgresql://db.example.com:5432/demo?user=app',
        'jdbc:sqlserver://db.example.com:1433;databaseName=demo;user=sa',
        'jdbc:dm://10.1.2.3:5236/DEMO?schema=SYSDBA',
        'jdbc:kingbase8://10.1.2.3:54321/demo',
        'mongodb://app:secret@mongo.example.com:27017/demo?authSource=admin',
        'redis://:secret@cache.example.com:6379/0',
        // 图库与时序库：路径分别是图空间和库名，端口按各家默认值认
        'nebula://root:secret@graph.example.com:9669/demo_space',
        'jdbc:TAOS-RS://td.example.com:6041/power',
        'jdbc:iotdb://iot.example.com:6667',
        'influxdb://writer:secret@metrics.example.com:8086/ops'
    ].join('\n')
};

/* ------------------------------ 渲染工具 ------------------------------ */

function urlEsc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function urlDecoded(one, value, rawValue) {
    // 「解码 %XX」勾着就显示解出来的值；取消勾选显示原样（日志里核对时更常用）
    return urlDecodeBox && urlDecodeBox.checked ? value : rawValue;
}

function urlErrorText(one) {
    const map = {
        badPort: 'urlErrBadPort',
        badHost: 'urlErrBadHost',
        badHostChar: 'urlErrBadHostChar',
        tooLong: 'urlErrTooLong'
    };
    return urlT(map[one.errorCode] || 'urlErrUnknown');
}

/* 复制图标（字段行与卡片头部共用一套，别两处各画一个） */
function urlCopySvg() {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
}

/* 数据库族的两种写法走同一套显示：`jdbc:mysql://…` 与裸的 `mysql://…` */
function urlIsDb(one) {
    return !!one && (one.kind === 'jdbc' || one.kind === 'db');
}

/* 图数据库：路径不是库名而是「图空间」（NebulaGraph 的 space）。
   `jdbc:nebula://…` 看子协议，裸 `nebula://…` 看协议。 */
function urlIsGraph(one) {
    const name = one && (one.subprotocol || one.scheme);
    return name === 'nebula' || name === 'nebulagraph';
}

/* 卡片头上的协议标签：一眼分清这行是网页地址、文件传输还是数据库连接串。
   没写协议的行（`example.com:8080/a`）不贴，贴了反而像是补出来的。 */
function urlKindLabel(one) {
    if (!one.kind || one.kind === 'relative') return '';
    if (one.kind === 'jdbc') return 'JDBC';
    // 驱动名有固定写法，直接大写（MYSQL / POSTGRESQL）看着像乱码
    var pretty = {
        mysql: 'MySQL', mariadb: 'MariaDB', postgres: 'PostgreSQL', postgresql: 'PostgreSQL',
        sqlserver: 'SQL Server', mssql: 'SQL Server', oracle: 'Oracle', db2: 'DB2',
        redis: 'Redis', rediss: 'Redis', mongodb: 'MongoDB', 'mongodb+srv': 'MongoDB',
        clickhouse: 'ClickHouse', cassandra: 'Cassandra',
        // 国产数据库用厂商的通用写法（DM 就是达梦，Kingbase 就是人大金仓）
        dm: 'DM', kingbase: 'Kingbase', kingbase8: 'Kingbase', oscar: 'Oscar',
        gbase: 'GBase', gbase8a: 'GBase', gbase8s: 'GBase', highgo: 'HighGo',
        opengauss: 'openGauss', gaussdb: 'GaussDB', vastbase: 'Vastbase', xugu: 'Xugu',
        oceanbase: 'OceanBase', tidb: 'TiDB', polardb: 'PolarDB', goldendb: 'GoldenDB',
        nebula: 'NebulaGraph', nebulagraph: 'NebulaGraph',
        // 时序库：TDengine 的三种驱动写法区分开，免得以为连错了端口
        taos: 'TDengine', tdengine: 'TDengine', 'taos-rs': 'TDengine REST',
        'taos-ws': 'TDengine WS', iotdb: 'IoTDB', influxdb: 'InfluxDB',
        // 消息与注册中心：`mqtt+ws` 这类协议名全大写会读成一串标点
        mqtt: 'MQTT', mqtts: 'MQTT', 'mqtt+ws': 'MQTT/WS', 'mqtt+wss': 'MQTT/WSS',
        etcd: 'etcd'
    };
    var scheme = String(one.scheme || '');
    if (pretty[scheme]) return pretty[scheme];
    return String(scheme || one.kind).toUpperCase();
}

/* 一行「标签 → 值」，值可点复制 */
function urlRow(label, value, opts) {
    const options = opts || {};
    const row = document.createElement('div');
    row.className = 'url-field' + (options.muted ? ' is-muted' : '');

    const name = document.createElement('span');
    name.className = 'url-field-label';
    name.textContent = label;

    const val = document.createElement('span');
    val.className = 'url-field-value' + (options.mono === false ? '' : ' is-mono');
    val.textContent = value;
    if (options.titleText) val.title = options.titleText;

    row.appendChild(name);
    row.appendChild(val);

    // 小标记（「默认端口」这类）贴着值放，不摆到行尾——摆行尾会和值隔开半个面板
    if (options.flag) {
        const flag = document.createElement('span');
        flag.className = 'url-field-flag';
        flag.textContent = options.flag;
        val.appendChild(flag);
    }

    if (value && value !== '—') {
        const copy = document.createElement('button');
        copy.type = 'button';
        copy.className = 'url-field-copy';
        copy.setAttribute('data-copy', value);
        copy.title = urlT('urlCopyOne');
        copy.setAttribute('aria-label', urlT('urlCopyOne'));
        copy.innerHTML = urlCopySvg();
        row.appendChild(copy);
    }
    return row;
}

/* 一张结果卡：头部（行号 + scheme://host/path）+ 字段表 + 参数表 */
function urlCard(one) {
    const card = document.createElement('div');
    card.className = 'url-card' + (one.ok ? '' : ' is-bad');
    card.setAttribute('data-line', String(one.line));

    const head = document.createElement('div');
    head.className = 'url-card-head';

    const badge = document.createElement('button');
    badge.type = 'button';
    badge.className = 'url-line-badge';
    badge.textContent = String(one.line);
    badge.title = urlT('urlCardLine', { n: one.line });
    badge.setAttribute('aria-label', urlT('urlCardLine', { n: one.line }));
    head.appendChild(badge);

    const kindText = urlKindLabel(one);
    if (kindText) {
        const kind = document.createElement('span');
        kind.className = 'url-kind is-' + one.kind;
        kind.textContent = kindText;
        kind.title = kindText;
        head.appendChild(kind);
    }

    const title = document.createElement('span');
    title.className = 'url-card-title';
    if (one.ok) {
        title.textContent = (one.schemeFull ? one.schemeFull + '://' : '') + (one.hostDisplay || one.host || '') +
            (one.port ? ':' + one.port : '') + (one.path || '');
    } else {
        title.textContent = one.raw.trim();
    }
    title.title = one.raw.trim();
    head.appendChild(title);

    if (!one.ok) {
        const bad = document.createElement('span');
        bad.className = 'url-card-bad';
        bad.textContent = urlErrorText(one);
        head.appendChild(bad);
    }

    /* 单条结果的 JSON：排查时常常只要这一条，先导整页再去掉别的太绕。
       坏行也允许复制——`error` 那一段正是要贴给别人的东西。 */
    const copyJson = document.createElement('button');
    copyJson.type = 'button';
    copyJson.className = 'url-card-copy';
    copyJson.title = urlT('urlCopyCardJson');
    copyJson.setAttribute('aria-label', urlT('urlCopyCardJson'));
    copyJson.innerHTML = urlCopySvg();
    copyJson.setAttribute('data-copy', DBXUrl.toJsonText([one]));
    head.appendChild(copyJson);

    card.appendChild(head);

    const body = document.createElement('div');
    body.className = 'url-card-body';

    if (!one.ok) {
        /* 坏行的身体：先把它拆出来的部分摆出来（能拆到哪儿算哪儿），
           最后一行才是原始输入——把原文标成「查询串」会让人以为整串都是查询串。 */
        if (one.hasScheme) body.appendChild(urlRow(urlT('urlScheme'), one.scheme));
    // JDBC 的驱动单独一行：`jdbc` 是协议，`mysql` 才是驱动，混成 `jdbc:mysql` 对不上文档
    if (one.subprotocol) body.appendChild(urlRow(urlT('urlDriver'), one.subprotocol));
        if (one.host) body.appendChild(urlRow(urlT('urlHost'), one.host));
        if (one.port) body.appendChild(urlRow(urlT('urlPort'), one.port));
        if (one.path) body.appendChild(urlRow(urlT('urlPath'), one.path));
        body.appendChild(urlRow(urlT('urlRaw'), one.raw.trim(), { mono: true, muted: true }));
        card.appendChild(body);
        return card;
    }

    // 协议 / 用户名 / 密码 / 主机 / 端口
    // 协议按原样写（https / jdbc:mysql），后面不再补冒号：
    // 补了之后 `jdbc:mysql:` 看着像多打了一个，和卡片标题里的 `://` 也重复
    if (one.hasScheme) body.appendChild(urlRow(urlT('urlScheme'), one.scheme));
    // JDBC 的驱动单独一行：`jdbc` 是协议，`mysql` 才是驱动，混成 `jdbc:mysql` 对不上文档
    if (one.subprotocol) body.appendChild(urlRow(urlT('urlDriver'), one.subprotocol));
    if (one.hasUser) body.appendChild(urlRow(urlT('urlUser'), one.username || '—'));
    if (one.hasPassword) body.appendChild(urlRow(urlT('urlPass'), one.password || '—'));
    if (one.host) {
        body.appendChild(urlRow(urlT('urlHost'), one.host));
        if (one.hostAscii) body.appendChild(urlRow(urlT('urlHostAscii'), one.hostAscii, { muted: true }));
    }
    if (one.port) {
        body.appendChild(urlRow(urlT('urlPort'), one.port, {
            flag: one.portDefault ? urlT('urlPortDefault') : ''
        }));
    }
    // 数据库族的 `/<库名>` 不是「路径」，文件的路径才叫路径；FTP / SSH 没写路径就不显示
    if (urlIsDb(one)) {
        // 图数据库的路径是「图空间」，叫「数据库」会让人以为连的是关系库
        if (one.database) body.appendChild(urlRow(urlT(urlIsGraph(one) ? 'urlSpace' : 'urlDatabase'), one.database));
    } else if (one.path || one.kind === 'web' || one.kind === 'ftp') {
        body.appendChild(urlRow(urlT('urlPath'), one.path || '/'));
    }
    if (one.query) {
        const decoded = urlDecoded(one, one.queryDecoded, one.query);
        body.appendChild(urlRow(urlT('urlQuery'), decoded, {
            titleText: decoded !== one.query ? one.query : ''
        }));
    }
    if (one.hash) {
        body.appendChild(urlRow(urlT('urlHash'), urlDecoded(one, one.hashDecoded, one.hash)));
    }
    if (one.origin) body.appendChild(urlRow(urlT('urlOrigin'), one.origin, { muted: true }));

    // 参数表：一条一行，重复键与「只有键没有值」都单独标出来
    if (one.params.length) {
        const params = document.createElement('div');
        params.className = 'url-params';
        const head2 = document.createElement('div');
        head2.className = 'url-params-head';
        head2.textContent = urlIsDb(one)
            ? urlT('urlProps', { n: one.params.length })
            : urlT('urlParams', { n: one.params.length });
        params.appendChild(head2);

        one.params.forEach((p) => {
            const row = document.createElement('div');
            row.className = 'url-param';

            const key = document.createElement('span');
            key.className = 'url-param-key';
            key.textContent = urlDecoded(one, p.key, p.rawKey);
            row.appendChild(key);

            const eq = document.createElement('span');
            eq.className = 'url-param-eq';
            eq.textContent = '=';
            row.appendChild(eq);

            const val = document.createElement('span');
            val.className = 'url-param-val';
            if (p.hasEq) {
                val.textContent = urlDecoded(one, p.value, p.rawValue);
            } else {
                val.textContent = urlT('urlParamNoValue');
                val.classList.add('is-muted');
            }
            row.appendChild(val);

            if (one.dupeKeys.indexOf(p.key) >= 0) {
                const dupe = document.createElement('span');
                dupe.className = 'url-param-flag';
                dupe.textContent = urlT('urlParamDupe');
                row.appendChild(dupe);
            }

            /* 三个复制入口：键、值、键=值。
               只给一个「复制键值对」不够用——查 SQL 时常常只要值，
               拼别的请求时又只要键，来回手改不如各点一下。 */
            const keyText = urlDecoded(one, p.key, p.rawKey);
            const valText = p.hasEq ? urlDecoded(one, p.value, p.rawValue) : '';
            const pairText = p.hasEq ? keyText + '=' + valText : keyText;
            const acts = document.createElement('span');
            acts.className = 'url-param-acts';
            [
                { label: urlT('urlCopyKey'), text: keyText },
                { label: urlT('urlCopyValue'), text: valText, skip: !p.hasEq },
                { label: urlT('urlCopyPair'), text: pairText }
            ].forEach((item) => {
                if (item.skip) return;
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'url-param-act';
                btn.textContent = item.label;
                btn.title = item.label + (item.text ? '：' + item.text : '');
                btn.setAttribute('data-copy', item.text);
                acts.appendChild(btn);
            });
            row.appendChild(acts);

            params.appendChild(row);
        });
        body.appendChild(params);
    }

    card.appendChild(body);
    return card;
}

function urlVisibleResults() {
    if (urlFilter === 'bad') return urlData.results.filter((r) => !r.ok);
    return urlData.results;
}

/* 整块重铺：只在「解析结果变了 / 筛选变了 / 解码开关变了」时走，
   光标移动只改 class，绝不重铺（否则滚动位置会被拽回去） */
function urlRender() {
    const list = urlVisibleResults();
    urlResults.innerHTML = '';
    urlCardIndex = Object.create(null);
    urlRenderLimit = Math.max(URL_RENDER_PAGE, Math.min(urlRenderLimit, list.length || URL_RENDER_PAGE));

    if (!urlData.results.length) {
        const empty = document.createElement('div');
        empty.className = 'url-empty';
        empty.textContent = urlT('urlEmptyHint');
        urlResults.appendChild(empty);
        urlSyncStats();
        return;
    }
    if (!list.length) {
        const empty = document.createElement('div');
        empty.className = 'url-empty';
        empty.textContent = urlT('urlNoMatch');
        urlResults.appendChild(empty);
        urlSyncStats();
        return;
    }

    const frag = document.createDocumentFragment();
    const upto = Math.min(list.length, urlRenderLimit);
    for (let i = 0; i < upto; i++) {
        const card = urlCard(list[i]);
        urlCardIndex[list[i].line] = card;
        frag.appendChild(card);
    }
    urlResults.appendChild(frag);

    if (list.length > upto) {
        const more = document.createElement('button');
        more.type = 'button';
        more.className = 'url-more';
        more.textContent = urlT('urlLoadMore', { n: list.length - upto });
        more.addEventListener('click', () => {
            urlRenderLimit = upto + URL_RENDER_PAGE;
            urlRender();
            urlMarkActive(urlActiveLine, false);
        });
        urlResults.appendChild(more);
    }

    urlSyncStats();
}

function urlSyncStats() {
    const total = urlData.results.length;
    const ok = urlData.okCount;
    const bad = total - ok;
    if (urlSrcBadge) urlSrcBadge.textContent = String(total);
    if (urlOutBadge) urlOutBadge.textContent = String(ok);
    if (urlStat) {
        urlStat.textContent = total
            ? urlT('urlStat', { n: total, ok: ok, bad: bad })
            : '';
    }
}

/* ---------------------------- 左右互相定位 ---------------------------- */

function urlMarkActive(line, scroll) {
    urlActiveLine = line;
    Object.keys(urlCardIndex).forEach((k) => {
        const el = urlCardIndex[k];
        if (el) el.classList.toggle('is-active', Number(k) === line);
    });
    const card = urlCardIndex[line];
    if (card && scroll) {
        card.scrollIntoView({ block: 'nearest' });
    }
    return card;
}

/* 点行号 / 点卡片徽标都走这里：确保那张卡已经渲染出来，再滚过去闪一下 */
function urlFocusLine(line) {
    const list = urlVisibleResults();
    const inList = list.some((r) => r.line === line);
    if (!inList) return false;
    // 目标在渲染窗口之外：把上限拉到能盖住它，重新铺一次
    const idx = list.findIndex((r) => r.line === line);
    if (idx >= urlRenderLimit) {
        urlRenderLimit = idx + URL_RENDER_PAGE;
        urlRender();
    }
    urlMarkActive(line, false);
    const card = urlCardIndex[line];
    if (!card) return false;
    card.scrollIntoView({ block: 'center' });
    card.classList.remove('is-flash');
    // 重启动画：先移除再加回，连续点同一个行号才不会「只闪第一次」
    void card.offsetWidth;
    card.classList.add('is-flash');
    clearTimeout(urlFlashTimer);
    urlFlashTimer = setTimeout(() => card.classList.remove('is-flash'), 1200);
    return true;
}

/* 反向：光标挪到哪一行，右边对应卡片就亮起来 */
function urlOnCursor() {
    if (!urlEditor || !urlModeActive) return;
    const line = urlEditor.getCursor().line + 1;
    if (line === urlActiveLine) return;
    const has = urlData.results.some((r) => r.line === line);
    if (!has) return;
    urlMarkActive(line, true);
}

/* ------------------------------ 解析与同步 ------------------------------ */

function urlUpdateBadges() {
    const text = urlEditor ? urlEditor.getValue() : (urlSrcText ? urlSrcText.value : '');
    if (!text.trim()) {
        urlData = { results: [], skipped: 0, totalLines: 0, truncated: false, okCount: 0 };
        urlRender();
        return;
    }
    const parsed = DBXUrl.parseText(text);
    urlData = parsed;
    urlRender();
    if (parsed.truncated) {
        showToast(urlT('urlTipTruncated', {
            max: DBXUrl.LIMITS.maxLines,
            n: parsed.results.length
        }), 'error', 6000);
    }
}

function urlSchedule() {
    clearTimeout(urlTimer);
    urlTimer = setTimeout(() => urlUpdateBadges(), 220);
}

/* 供截图脚本 / 手工调试用：塞文本并立刻解析（拖进来的文件走 18-flow 的统一入口） */
function urlLoadText(text, label) {
    if (!urlEditor) ensureUrlEditor();
    if (!urlEditor) return;
    urlEditor.setValue(String(text == null ? '' : text));
    urlUpdateBadges();
    if (label) showToast(label);
}

/* -------------------------------- 编辑器 -------------------------------- */

function urlSyncEditorTheme() {
    if (!urlEditor || !window.CodeMirror) return;
    const theme = document.documentElement.getAttribute('data-dbx-theme') === 'dark' ? 'material-darker' : 'default';
    urlEditor.setOption('theme', theme);
    urlEditor.refresh();
}

function ensureUrlEditor() {
    if (urlEditor || !window.CodeMirror || !window.CodeMirror.fromTextArea) return;
    urlEditor = CodeMirror.fromTextArea(urlSrcText, Object.assign({}, commonConfig, {
        mode: 'text/plain',
        // 必须折行：URL 动辄上百个字符，一横向滚动行号槽就被推出去，
        // 而这一页的「点行号定位结果」全靠它
        lineWrapping: true,
        lineNumbers: true,
        foldGutter: false,
        gutters: ['CodeMirror-linenumbers'],
        extraKeys: {
            'Cmd-Enter': () => urlUpdateBadges(),
            'Ctrl-Enter': () => urlUpdateBadges(),
            'Cmd-F': 'findPersistent',
            'Ctrl-F': 'findPersistent'
        }
    }));
    urlEditor.on('change', urlSchedule);
    urlEditor.on('cursorActivity', urlOnCursor);

    /* 「点行号定位结果」：CodeMirror 的行号是 gutter 里的 div，
       点它本身会把光标挪到那一行（CM 自带行为），这里额外负责把右边滚过去。
       用捕获阶段，避免被 CM 自己的 gutter 处理吞掉。 */
    const wrapper = urlEditor.getWrapperElement();
    wrapper.addEventListener('mousedown', (e) => {
        const lineNo = e.target.closest ? e.target.closest('.CodeMirror-linenumber') : null;
        if (!lineNo) return;
        const line = parseInt(String(lineNo.textContent || '').trim(), 10);
        if (!line) return;
        // CM 会在这一拍之后才更新光标，所以放到下一帧再定位
        setTimeout(() => urlFocusLine(line), 0);
    }, true);

    urlSyncEditorTheme();
}

/* -------------------------------- 页面进出 -------------------------------- */

function enterUrlMode() {
    if (typeof exitOtherModes === 'function') exitOtherModes('url');
    if (typeof markConvertActive === 'function') markConvertActive(null);
    if (typeof mainWorkspace !== 'undefined' && mainWorkspace) mainWorkspace.classList.add('hidden');
    if (typeof toolbarEl !== 'undefined' && toolbarEl) toolbarEl.classList.add('hidden');
    urlModeActive = true;
    urlWorkspace.classList.add('active');
    if (navUrlLink) navUrlLink.classList.add('active');
    ensureUrlEditor();
    urlUpdateBadges();
    requestAnimationFrame(() => {
        if (urlEditor) urlEditor.refresh();
    });
}

function exitUrlMode() {
    if (!urlModeActive) return;
    urlModeActive = false;
    urlWorkspace.classList.remove('active');
    if (navUrlLink) navUrlLink.classList.remove('active');
    if (typeof toolbarEl !== 'undefined' && toolbarEl) toolbarEl.classList.remove('hidden');
    if (typeof mainWorkspace !== 'undefined' && mainWorkspace) mainWorkspace.classList.remove('hidden');
    requestAnimationFrame(() => {
        if (typeof inputEditor !== 'undefined' && inputEditor) inputEditor.refresh();
        if (typeof outputEditor !== 'undefined' && outputEditor) outputEditor.refresh();
    });
}

/* -------------------------------- 交互绑定 -------------------------------- */

/* 结果区里所有「复制」按钮走一条委托：卡片是动态铺的，逐个绑定会在重铺后失效 */
urlResults.addEventListener('click', (e) => {
    const btn = e.target.closest ? e.target.closest('[data-copy]') : null;
    if (!btn) return;
    const text = btn.getAttribute('data-copy') || '';
    if (!text) {
        showToast(urlT('urlTipNothing'), 'error');
        return;
    }
    writeClipboardText(text).then(() => {
        showToast(urlT('urlTipCopied'));
    }).catch(() => {
        showToast(urlT('urlTipNothing'), 'error');
    });
});

/* 点卡片上的行号徽标 → 编辑器跳到那一行（反向定位） */
urlResults.addEventListener('click', (e) => {
    const badge = e.target.closest ? e.target.closest('.url-line-badge') : null;
    if (!badge) return;
    const line = parseInt(String(badge.textContent || '').trim(), 10);
    if (!line || !urlEditor) return;
    urlEditor.setCursor({ line: line - 1, ch: 0 });
    urlEditor.scrollIntoView({ line: line - 1, ch: 0 }, 60);
    urlEditor.focus();
    urlMarkActive(line, true);
});

if (urlCopyJsonBtn) {
    urlCopyJsonBtn.addEventListener('click', () => {
        if (!urlData.results.length) {
            showToast(urlT('urlTipNothing'), 'error');
            return;
        }
        const text = DBXUrl.toJsonText(urlData.results);
        writeClipboardText(text).then(() => {
            showToast(urlT('urlTipCopiedJson', { n: urlData.results.length }));
        }).catch(() => {
            showToast(urlT('urlTipNothing'), 'error');
        });
    });
}

if (urlClearBtn) {
    urlClearBtn.addEventListener('click', () => {
        if (urlEditor) urlEditor.setValue('');
        else if (urlSrcText) urlSrcText.value = '';
        urlUpdateBadges();
        if (urlEditor) urlEditor.focus();
    });
}

if (urlDecodeBox) {
    urlDecodeBox.addEventListener('change', () => urlRender());
}

/* 筛选：全部 / 只看失败 */
if (urlFilterTabs) {
    urlFilterTabs.addEventListener('click', (e) => {
        const tab = e.target.closest ? e.target.closest('.compare-tab') : null;
        if (!tab) return;
        urlFilter = tab.dataset.filter || 'all';
        urlFilterTabs.querySelectorAll('.compare-tab').forEach((t) => {
            t.classList.toggle('active', t === tab);
        });
        urlRender();
        urlMarkActive(urlActiveLine, false);
    });
}

/* 示例下拉：沿用全局约定（options 加 open、trigger 加 active），点别处由 09 收起 */
function urlSampleOpen(open) {
    if (!urlSamples) return;
    const opts = urlSamples.querySelector('.custom-select-options');
    const trig = urlSamples.querySelector('.custom-select-trigger');
    if (opts) opts.classList.toggle('open', !!open);
    if (trig) {
        trig.classList.toggle('active', !!open);
        trig.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
}

if (urlSamples) {
    urlSamples.addEventListener('click', (e) => {
        const pick = e.target.closest ? e.target.closest('.custom-option') : null;
        if (pick) {
            e.stopPropagation();
            urlSampleOpen(false);
            const sample = URL_SAMPLES[pick.dataset.sample];
            if (sample) {
                urlLoadText(sample);
                if (urlEditor) urlEditor.focus();
            }
            return;
        }
        urlSampleOpen(!urlSamples.querySelector('.custom-select-options').classList.contains('open'));
        e.stopPropagation();
    });
    urlSamples.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            const trig = e.target.closest ? e.target.closest('.custom-select-trigger') : null;
            if (!trig) return;
            e.preventDefault();
            urlSampleOpen(!urlSamples.querySelector('.custom-select-options').classList.contains('open'));
        } else if (e.key === 'Escape') {
            urlSampleOpen(false);
        }
    });
}

/* 拖文件进来由 18-flow 的统一入口接管（pageImportTargets 里有 navUrl 这一项），
   这一页不再自己挂 drop：两套监听会各读一遍文件，还会绕过体积上限。 */

// 首次进页面前把编辑器建好：徽标、空态都要它
ensureUrlEditor();

/* 换主题时刷这一页的编辑器：09-convert.js 的 syncEditorTheme 是硬编码清单，
   这一页的编辑器建得晚，进不去那份名单（同 22-csv-edit.js 的处理，只是走注册） */
if (typeof onEditorTheme === 'function') onEditorTheme(urlSyncEditorTheme);

/* 切语言：静态文案由 applyI18n 铺，卡片里的字段名 / 统计 / 空态是本页拼的，
   得自己重铺一次。监听语言菜单的点击，等 setLanguage + applyI18n 跑完再来。 */
document.addEventListener('click', (e) => {
    if (!urlModeActive) return;
    if (!e.target.closest || !e.target.closest('#langMenu .lang-option')) return;
    setTimeout(() => {
        urlRender();
        urlMarkActive(urlActiveLine, false);
    }, 0);
});

// 导航 / 切语言后重铺一次本页文案（23 在 08 之后加载，首次 applyI18n 时这张表还不在）
applyI18n();
urlUpdateBadges();
