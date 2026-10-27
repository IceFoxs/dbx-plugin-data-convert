/* 12-sql.js — SQL 生成页 */
// 8. SQL 生成页（批量文本 → IN / NOT IN / 值列表 / INSERT）
// =========================================
// 只给这一页用的文案单独放一张小表：不用把 14 套大字典再改一遍，
// 缺哪个语言就回退到 en（applyI18n 会把它合并进字典里一起查）。
const SQL_I18N = {
    'zh-CN': { navSql: 'SQL 转换', sqlInputLabel: '批量文本', sqlOutputLabel: 'SQL 输出', sqlTplList: '值列表', sqlQuoteLabel: '引号', sqlQuoteNone: '不加', sqlDedup: '去重', sqlMultiline: '每行一项', sqlNumbers: '数字不加引号', sqlTable: '表名', sqlColumn: '列名', sqlGenerate: '生成', sqlTipIdle: '一行一个值，粘贴后自动生成', sqlTipDone: '已生成 {t}，共 {n} 个值', sqlTipEmpty: '先输入或粘贴要转换的值', sqlDupNote: '，已去掉 {n} 个重复' },
    'zh-TW': { navSql: 'SQL 轉換', sqlInputLabel: '批次文字', sqlOutputLabel: 'SQL 輸出', sqlTplList: '值清單', sqlQuoteLabel: '引號', sqlQuoteNone: '不加', sqlDedup: '去重', sqlMultiline: '每行一項', sqlNumbers: '數字不加引號', sqlTable: '表名', sqlColumn: '欄名', sqlGenerate: '產生', sqlTipIdle: '一行一個值，貼上後自動產生', sqlTipDone: '已產生 {t}，共 {n} 個值', sqlTipEmpty: '先輸入或貼上要轉換的值', sqlDupNote: '，已移除 {n} 個重複' },
    en: { navSql: 'SQL Builder', sqlInputLabel: 'Values', sqlOutputLabel: 'SQL', sqlTplList: 'Value list', sqlQuoteLabel: 'Quote', sqlQuoteNone: 'None', sqlDedup: 'Dedupe', sqlMultiline: 'One per line', sqlNumbers: 'No quotes for numbers', sqlTable: 'Table', sqlColumn: 'Column', sqlGenerate: 'Generate', sqlTipIdle: 'One value per line — generated as you type', sqlTipDone: 'Generated {t} with {n} value(s)', sqlTipEmpty: 'Paste or type the values to convert', sqlDupNote: ', {n} duplicate(s) removed' },
    az: { navSql: 'SQL', sqlInputLabel: 'Dəyərlər', sqlOutputLabel: 'SQL', sqlTplList: 'Dəyər siyahısı', sqlQuoteLabel: 'Dırnaq', sqlQuoteNone: 'Yox', sqlDedup: 'Təkrarları sil', sqlMultiline: 'Hər sətirdə bir', sqlNumbers: 'Rəqəmlər dırnaqsız', sqlTable: 'Cədvəl', sqlColumn: 'Sütun', sqlGenerate: 'Yarat', sqlTipIdle: 'Hər sətirdə bir dəyər — yazdıqca yaradılır', sqlTipDone: '{t} yaradıldı, {n} dəyər', sqlTipEmpty: 'Çevirmək üçün dəyərləri yazın və ya yapışdırın', sqlDupNote: ', {n} təkrar silindi' },
    es: { navSql: 'SQL', sqlInputLabel: 'Valores', sqlOutputLabel: 'SQL', sqlTplList: 'Lista de valores', sqlQuoteLabel: 'Comillas', sqlQuoteNone: 'Ninguna', sqlDedup: 'Sin duplicados', sqlMultiline: 'Uno por línea', sqlNumbers: 'Números sin comillas', sqlTable: 'Tabla', sqlColumn: 'Columna', sqlGenerate: 'Generar', sqlTipIdle: 'Un valor por línea: se genera al escribir', sqlTipDone: 'Generado {t} con {n} valor(es)', sqlTipEmpty: 'Pega o escribe los valores a convertir', sqlDupNote: ', {n} duplicado(s) eliminado(s)' },
    id: { navSql: 'SQL', sqlInputLabel: 'Nilai', sqlOutputLabel: 'SQL', sqlTplList: 'Daftar nilai', sqlQuoteLabel: 'Kutip', sqlQuoteNone: 'Tanpa', sqlDedup: 'Hapus duplikat', sqlMultiline: 'Satu per baris', sqlNumbers: 'Angka tanpa kutip', sqlTable: 'Tabel', sqlColumn: 'Kolom', sqlGenerate: 'Buat', sqlTipIdle: 'Satu nilai per baris — dibuat saat mengetik', sqlTipDone: '{t} dibuat dengan {n} nilai', sqlTipEmpty: 'Tempel atau ketik nilai yang akan dikonversi', sqlDupNote: ', {n} duplikat dihapus' },
    it: { navSql: 'SQL', sqlInputLabel: 'Valori', sqlOutputLabel: 'SQL', sqlTplList: 'Elenco valori', sqlQuoteLabel: 'Virgolette', sqlQuoteNone: 'Nessuna', sqlDedup: 'Rimuovi duplicati', sqlMultiline: 'Uno per riga', sqlNumbers: 'Numeri senza virgolette', sqlTable: 'Tabella', sqlColumn: 'Colonna', sqlGenerate: 'Genera', sqlTipIdle: 'Un valore per riga: genera mentre scrivi', sqlTipDone: 'Generato {t} con {n} valori', sqlTipEmpty: 'Incolla o digita i valori da convertire', sqlDupNote: ', {n} duplicati rimossi' },
    ja: { navSql: 'SQL 変換', sqlInputLabel: '一括テキスト', sqlOutputLabel: 'SQL 出力', sqlTplList: '値リスト', sqlQuoteLabel: '引用符', sqlQuoteNone: 'なし', sqlDedup: '重複を削除', sqlMultiline: '1行1項目', sqlNumbers: '数値は引用符なし', sqlTable: 'テーブル名', sqlColumn: 'カラム名', sqlGenerate: '生成', sqlTipIdle: '1行1値 — 入力すると自動生成', sqlTipDone: '{t} を生成しました（{n} 件）', sqlTipEmpty: '変換する値を入力または貼り付けてください', sqlDupNote: '、重複 {n} 件を削除' },
    ko: { navSql: 'SQL 변환', sqlInputLabel: '일괄 텍스트', sqlOutputLabel: 'SQL 출력', sqlTplList: '값 목록', sqlQuoteLabel: '따옴표', sqlQuoteNone: '없음', sqlDedup: '중복 제거', sqlMultiline: '한 줄에 하나', sqlNumbers: '숫자는 따옴표 없이', sqlTable: '테이블', sqlColumn: '컬럼', sqlGenerate: '생성', sqlTipIdle: '한 줄에 하나 — 입력하면 자동 생성', sqlTipDone: '{t} 생성됨, 값 {n}개', sqlTipEmpty: '변환할 값을 입력하거나 붙여넣으세요', sqlDupNote: ', 중복 {n}개 제거됨' },
    pt: { navSql: 'SQL', sqlInputLabel: 'Valores', sqlOutputLabel: 'SQL', sqlTplList: 'Lista de valores', sqlQuoteLabel: 'Aspas', sqlQuoteNone: 'Nenhuma', sqlDedup: 'Remover duplicados', sqlMultiline: 'Um por linha', sqlNumbers: 'Números sem aspas', sqlTable: 'Tabela', sqlColumn: 'Coluna', sqlGenerate: 'Gerar', sqlTipIdle: 'Um valor por linha — gera enquanto digita', sqlTipDone: '{t} gerado com {n} valor(es)', sqlTipEmpty: 'Cole ou digite os valores a converter', sqlDupNote: ', {n} duplicado(s) removido(s)' },
    pl: { navSql: 'SQL', sqlInputLabel: 'Wartości', sqlOutputLabel: 'SQL', sqlTplList: 'Lista wartości', sqlQuoteLabel: 'Cudzysłowy', sqlQuoteNone: 'Brak', sqlDedup: 'Usuń duplikaty', sqlMultiline: 'Jedna na linię', sqlNumbers: 'Liczby bez cudzysłowów', sqlTable: 'Tabela', sqlColumn: 'Kolumna', sqlGenerate: 'Generuj', sqlTipIdle: 'Jedna wartość w linii — generuje w trakcie pisania', sqlTipDone: 'Wygenerowano {t} z {n} wartościami', sqlTipEmpty: 'Wklej lub wpisz wartości do konwersji', sqlDupNote: ', usunięto duplikaty: {n}' },
    ru: { navSql: 'SQL', sqlInputLabel: 'Значения', sqlOutputLabel: 'SQL', sqlTplList: 'Список значений', sqlQuoteLabel: 'Кавычки', sqlQuoteNone: 'Без', sqlDedup: 'Убрать дубли', sqlMultiline: 'По одному в строке', sqlNumbers: 'Числа без кавычек', sqlTable: 'Таблица', sqlColumn: 'Колонка', sqlGenerate: 'Создать', sqlTipIdle: 'Одно значение в строке — генерируется по мере ввода', sqlTipDone: 'Создано {t}, значений: {n}', sqlTipEmpty: 'Вставьте или введите значения для преобразования', sqlDupNote: ', удалено дублей: {n}' },
    th: { navSql: 'แปลง SQL', sqlInputLabel: 'ข้อความชุด', sqlOutputLabel: 'ผลลัพธ์ SQL', sqlTplList: 'รายการค่า', sqlQuoteLabel: 'เครื่องหมายคำพูด', sqlQuoteNone: 'ไม่ใส่', sqlDedup: 'ตัดค่าซ้ำ', sqlMultiline: 'บรรทัดละหนึ่งค่า', sqlNumbers: 'ตัวเลขไม่ใส่เครื่องหมายคำพูด', sqlTable: 'ตาราง', sqlColumn: 'คอลัมน์', sqlGenerate: 'สร้าง', sqlTipIdle: 'บรรทัดละหนึ่งค่า — สร้างอัตโนมัติเมื่อพิมพ์', sqlTipDone: 'สร้าง {t} แล้ว จำนวน {n} ค่า', sqlTipEmpty: 'วางหรือพิมพ์ค่าที่ต้องการแปลง', sqlDupNote: ' ตัดค่าซ้ำ {n} รายการ' },
    tr: { navSql: 'SQL', sqlInputLabel: 'Değerler', sqlOutputLabel: 'SQL', sqlTplList: 'Değer listesi', sqlQuoteLabel: 'Tırnak', sqlQuoteNone: 'Yok', sqlDedup: 'Tekrarları sil', sqlMultiline: 'Satırda bir', sqlNumbers: 'Sayılar tırnaksız', sqlTable: 'Tablo', sqlColumn: 'Sütun', sqlGenerate: 'Oluştur', sqlTipIdle: 'Satırda bir değer — yazdıkça oluşturulur', sqlTipDone: '{t} oluşturuldu, {n} değer', sqlTipEmpty: 'Dönüştürmek için değerleri yapıştırın veya yazın', sqlDupNote: ', {n} tekrar kaldırıldı' }
};

if (!window.DBXSql) throw new Error('ui/js/sqlgen.js 未加载');
const DBXSql = window.DBXSql;

const sqlWorkspace = document.getElementById('sqlWorkspace');
const sqlInputText = document.getElementById('sqlInputText');
const sqlOutputText = document.getElementById('sqlOutputText');
const sqlTip = document.getElementById('sqlTip');
const sqlInCount = document.getElementById('sqlInCount');
const sqlOutCount = document.getElementById('sqlOutCount');
const sqlTemplates = document.getElementById('sqlTemplates');
const sqlQuotes = document.getElementById('sqlQuotes');
const sqlExtra = document.getElementById('sqlExtra');
const sqlTableInput = document.getElementById('sqlTable');
const sqlColumnInput = document.getElementById('sqlColumn');
const navSqlLink = document.getElementById('navSql');

let sqlModeActive = false;
let sqlAutoTimer = null;
const sqlState = { template: 'in', quote: 'single' };

function sqlT(key, fallback) {
    const table = SQL_I18N[currentLang] || {};
    return table[key] || SQL_I18N.en[key] || currentDict[key] || fallback;
}

function ensureSqlEditors() {
    if (sqlInputEditor) return;
    const config = Object.assign({}, commonConfig, {
        mode: 'text/x-sql',
        extraKeys: Object.assign({}, commonConfig.extraKeys, {
            'Cmd-Enter': () => runSql(),
            'Ctrl-Enter': () => runSql()
        })
    });
    sqlInputEditor = CodeMirror.fromTextArea(sqlInputText, Object.assign({}, config));
    // 输出栏只读：这段是用来复制走的，避免手滑改掉生成好的格式
    sqlOutputEditor = CodeMirror.fromTextArea(sqlOutputText, Object.assign({}, config, { readOnly: true }));
    sqlInputEditor.on('change', () => scheduleSql());
    // 懒创建时主题可能已经切过，补一次，避免新编辑器停在亮色主题
    syncEditorTheme();
}

function readSqlOptions() {
    return {
        template: sqlState.template,
        quote: sqlState.quote,
        multiline: document.getElementById('sqlMultiline').checked,
        dedupe: document.getElementById('sqlDedup').checked,
        numeric: document.getElementById('sqlNumeric').checked,
        table: sqlTableInput.value.trim(),
        column: sqlColumnInput.value.trim()
    };
}

function sqlTemplateLabel(template) {
    if (template === 'list') return sqlT('sqlTplList', '值列表');
    if (template === 'insert') return 'INSERT';
    if (template === 'notin') return 'NOT IN';
    return 'IN';
}

function setSqlTip(text, tone) {
    sqlTip.textContent = text;
    sqlTip.className = 'compare-tip' + (tone ? ' ' + tone : '');
}

function idleSqlTip() {
    setSqlTip(sqlT('sqlTipIdle', '一行一个值，粘贴后自动生成'));
}

function runSql() {
    ensureSqlEditors();
    const options = readSqlOptions();
    const result = DBXSql.analyze(sqlInputEditor.getValue(), options);
    if (sqlOutputEditor.getValue() !== result.sql) sqlOutputEditor.setValue(result.sql);
    sqlInCount.textContent = String(result.values.length);
    sqlOutCount.textContent = String(result.count);

    if (!result.values.length) {
        setSqlTip(sqlT('sqlTipEmpty', '先输入或粘贴要转换的值'));
        return;
    }
    let tip = sqlT('sqlTipDone', '已生成 {t}，共 {n} 个值')
        .replace('{t}', sqlTemplateLabel(options.template))
        .replace('{n}', String(result.count));
    if (result.duplicates) {
        tip += sqlT('sqlDupNote', '，已去掉 {n} 个重复').replace('{n}', String(result.duplicates));
    }
    setSqlTip(tip, 'ok');
}

function scheduleSql() {
    clearTimeout(sqlAutoTimer);
    sqlAutoTimer = setTimeout(runSql, 160);
}

function setSqlTemplate(template) {
    sqlState.template = template;
    sqlTemplates.querySelectorAll('.compare-tab').forEach((tab) => {
        tab.classList.toggle('active', tab.dataset.template === template);
    });
    // 表名 / 列名只有 INSERT 用得上
    sqlExtra.classList.toggle('show', template === 'insert');
    if (sqlInputEditor) runSql();
}

function setSqlQuote(quote) {
    sqlState.quote = quote;
    sqlQuotes.querySelectorAll('.compare-tab').forEach((tab) => {
        tab.classList.toggle('active', tab.dataset.quote === quote);
    });
    if (sqlInputEditor) runSql();
}

function refreshSqlI18n() {
    // 页面还没创建过编辑器就不用动；进过页面的话按新语言重算提示语
    if (!sqlInputEditor) return;
    runSql();
}

function enterSqlMode() {
    exitOtherModes('sql');
    if (isDiffMode) {
        isDiffMode = false;
        diffReport.classList.remove('show');
        diffWorkspace.classList.remove('active');
        toggleDiffBtn.textContent = currentDict.diffBtn || '对比差异';
        toggleDiffBtn.classList.remove('btn-diff');
    }
    sqlModeActive = true;
    markConvertActive(null);
    mainWorkspace.classList.add('hidden');
    toolbarEl.classList.add('hidden');
    sqlWorkspace.classList.add('active');
    navSqlLink.classList.add('active');

    ensureSqlEditors();
    if (sqlInputEditor.getValue().trim()) {
        runSql();
    } else {
        idleSqlTip();
    }
    requestAnimationFrame(() => {
        sqlInputEditor.refresh();
        sqlOutputEditor.refresh();
    });
}

function exitSqlMode() {
    if (!sqlModeActive) return;
    sqlModeActive = false;
    sqlWorkspace.classList.remove('active');
    navSqlLink.classList.remove('active');
    toolbarEl.classList.remove('hidden');
    mainWorkspace.classList.remove('hidden');
    requestAnimationFrame(() => {
        inputEditor.refresh();
        outputEditor.refresh();
    });
}

sqlTemplates.addEventListener('click', (e) => {
    const tab = e.target.closest('.compare-tab');
    if (tab) setSqlTemplate(tab.dataset.template);
});
sqlQuotes.addEventListener('click', (e) => {
    const tab = e.target.closest('.compare-tab');
    if (tab) setSqlQuote(tab.dataset.quote);
});
[sqlTableInput, sqlColumnInput].forEach((el) => el.addEventListener('input', scheduleSql));
// 三个开关（去重 / 每行一项 / 数字不加引号）改动后要立刻重算，
// 否则要等下一次输入才生效，看起来像「勾了没反应」
['sqlDedup', 'sqlMultiline', 'sqlNumeric'].forEach((id) => {
    document.getElementById(id).addEventListener('change', () => {
        if (sqlInputEditor) runSql();
    });
});
document.getElementById('sqlGenerate').addEventListener('click', runSql);
document.getElementById('sqlClear').addEventListener('click', () => {
    ensureSqlEditors();
    sqlInputEditor.setValue('');
    sqlOutputEditor.setValue('');
    sqlInCount.textContent = '0';
    sqlOutCount.textContent = '0';
    idleSqlTip();
    sqlInputEditor.focus();
});
document.getElementById('sqlCopy').addEventListener('click', async () => {
    ensureSqlEditors();
    if (!sqlOutputEditor.getValue().trim()) {
        showToast(currentDict.toastEmptyInput || '请输入内容', 'error');
        return;
    }
    try {
        await writeClipboardText(sqlOutputEditor.getValue());
        showToast(currentDict.toastCopySuccess || '已复制');
    } catch (err) {
        showToast(currentDict.toastCopyError || '复制失败', 'error');
    }
});
document.getElementById('sqlPaste').addEventListener('click', async () => {
    ensureSqlEditors();
    try {
        sqlInputEditor.setValue(await readClipboardText());
        runSql();
        showToast(currentDict.toastPasteSuccess || '已粘贴');
    } catch (err) {
        showToast(err && err.message === 'clipboardRead unsupported'
            ? (currentDict.toastPasteUnsupported || '当前环境不支持读取剪贴板，请手动粘贴')
            : (currentDict.toastPasteError || '读取剪贴板失败'), 'error');
    }
});

// =========================================
