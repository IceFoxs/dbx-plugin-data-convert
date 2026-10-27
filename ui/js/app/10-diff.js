/* 10-diff.js — 编辑器内的差异对比 */
// 6. 对比功能逻辑
// =========================================
const toggleDiffBtn = document.getElementById('toggleDiffBtn');
const mainWorkspace = document.getElementById('mainWorkspace');
const diffWorkspace = document.getElementById('diffWorkspace');
const diffLeftText = document.getElementById('diffLeftText');
const diffRightText = document.getElementById('diffRightText');
let isDiffMode = false;

const diffLeftStat = document.getElementById('diffLeftStat');
const diffRightStat = document.getElementById('diffRightStat');

/* 差异算法分两层：
   - ui/js/diff.js    行级对比（解析不了对象时的兜底）
   - ui/js/objdiff.js 结构化对比（按 JSON Pointer 逐节点比较）
   用例：node tests/diff.test.js / node tests/objdiff.test.js */
if (!window.DBXDiff || !window.DBXObjDiff) throw new Error('ui/js/diff.js 或 ui/js/objdiff.js 未加载');
const { diffLines, sides } = window.DBXDiff;
const { diffObjects, serializeTracked, displayValue, scanJson } = window.DBXObjDiff;

const diffReport = document.getElementById('diffReport');
const diffReportTitle = document.getElementById('diffReportTitle');
const diffReportList = document.getElementById('diffReportList');
document.getElementById('diffReportClose').addEventListener('click', () => {
    diffReport.classList.remove('show');
});

let diffMarks = [];
let diffRows = [];

// JSON 先规范化再比较，否则压缩过的单行 JSON 会和格式化文本错位
function textForDiff(text, format) {
    if (!text) return text;
    if (format !== 'json') return text;
    try {
        return JSON.stringify(JSON.parse(text), null, 2);
    } catch (e) {
        return text;
    }
}

function parseSide(text, format) {
    if (!text || !text.trim()) return { ok: false, value: null };
    try {
        return { ok: true, value: parseData(text, format) };
    } catch (e) {
        return { ok: false, value: null };
    }
}

function clearDiffDecorations() {
    diffMarks.forEach((mark) => {
        try { mark.clear(); } catch (e) { /* 编辑器重建过 */ }
    });
    diffMarks = [];
    [diffLeftEditor, diffRightEditor].forEach((cm) => {
        if (!cm) return;
        const doc = cm.getDoc();
        for (let i = 0; i < doc.lineCount(); i++) {
            doc.removeLineClass(i, 'background', 'cm-deleted');
            doc.removeLineClass(i, 'background', 'cm-inserted');
            doc.removeLineClass(i, 'background', 'cm-value-changed');
        }
    });
}

function markSpan(cm, span, className) {
    if (!cm || !span) return;
    diffMarks.push(cm.getDoc().markText(
        { line: span.line, ch: span.col },
        { line: span.line, ch: span.endCol },
        { className: className }
    ));
}

// 没有对象树时的兜底：整行标红/标绿
function applyLineDiff(leftView, rightView, leftDoc, rightDoc) {
    const diff = diffLines(leftView, rightView);
    const parts = sides(diff.ops);
    parts.left.forEach((p) => {
        if (p.type === 'delete') leftDoc.addLineClass(p.line, 'background', 'cm-deleted');
    });
    parts.right.forEach((p) => {
        if (p.type === 'insert') rightDoc.addLineClass(p.line, 'background', 'cm-inserted');
    });
    if (diffLeftStat) diffLeftStat.textContent = '−' + diff.stats.removed;
    if (diffRightStat) diffRightStat.textContent = '+' + diff.stats.added;
    return diff;
}

function renderReport(changes, leftMap, rightMap) {
    diffReportList.textContent = '';
    diffRows = [];

    if (!changes.length) {
        diffReportTitle.textContent = currentDict.diffSame || 'No differences';
        const empty = document.createElement('div');
        empty.className = 'diff-report-empty';
        empty.textContent = currentDict.diffSameHint || '';
        diffReportList.appendChild(empty);
        diffReport.classList.add('show');
        return;
    }

    diffReportTitle.textContent = (currentDict.diffReportTitle || 'Structured changes: {n}')
        .replace('{n}', changes.length);

    changes.forEach((change, index) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'diff-row';

        const tag = document.createElement('span');
        tag.className = 'diff-tag ' + (change.type === 'add' ? 'tag-add' : change.type === 'remove' ? 'tag-remove' : 'tag-change');
        tag.textContent = change.type === 'add'
            ? (currentDict.diffAdd || 'Added')
            : change.type === 'remove'
                ? (currentDict.diffRemove || 'Deleted')
                : (currentDict.diffChange || 'Modified');

        const pathEl = document.createElement('code');
        pathEl.className = 'diff-path';
        pathEl.textContent = change.pointer;
        pathEl.title = change.pointer;

        const valueEl = document.createElement('span');
        valueEl.className = 'diff-val';
        valueEl.textContent = displayValue(change.type === 'remove' ? change.from : change.to);
        valueEl.title = valueEl.textContent;

        row.appendChild(tag);
        row.appendChild(pathEl);
        row.appendChild(valueEl);

        const leftLine = leftMap && leftMap[change.pointer] ? leftMap[change.pointer].line : null;
        const rightLine = rightMap && rightMap[change.pointer] ? rightMap[change.pointer].line : null;
        diffRows.push({ leftLine: leftLine, rightLine: rightLine });

        if (leftLine == null && rightLine == null) row.classList.add('no-jump');

        row.addEventListener('click', () => {
            const target = diffRows[index];
            if (!target || (target.leftLine == null && target.rightLine == null)) return;
            if (target.leftLine != null && diffLeftEditor) {
                diffLeftEditor.scrollIntoView({ line: target.leftLine, ch: 0 }, 160);
            }
            if (target.rightLine != null && diffRightEditor) {
                diffRightEditor.scrollIntoView({ line: target.rightLine, ch: 0 }, 160);
            }
        });

        diffReportList.appendChild(row);
    });

    diffReport.classList.add('show');
}

function openDiff() {
    mainWorkspace.classList.add('hidden');
    diffWorkspace.classList.add('active');
    toggleDiffBtn.textContent = currentDict.diffExitBtn || '退出对比';
    toggleDiffBtn.classList.add('btn-diff');

    if (!diffLeftEditor) {
        diffLeftEditor = CodeMirror.fromTextArea(diffLeftText, Object.assign({}, commonConfig, {
            readOnly: 'nocursor',
            mode: MODE_MAP.json
        }));
        diffRightEditor = CodeMirror.fromTextArea(diffRightText, Object.assign({}, commonConfig, {
            readOnly: 'nocursor',
            mode: MODE_MAP.json
        }));
    }

    clearDiffDecorations();
    diffReport.classList.remove('show');

    const srcFmt = sourceFormat.value;
    const tgtFmt = targetFormat.value;
    const left = parseSide(inputText.value, srcFmt);
    const right = parseSide(outputText.value, tgtFmt);
    const bothJson = srcFmt === 'json' && tgtFmt === 'json' && left.ok && right.ok;

    let leftView = textForDiff(inputText.value, srcFmt);
    let rightView = textForDiff(outputText.value, tgtFmt);
    let leftMap = null;
    let rightMap = null;

    // 两侧都是 JSON 时用带位置映射的打印结果，页面才能只标「变了的那个值」
    if (bothJson) {
        const trackedLeft = serializeTracked(left.value);
        const trackedRight = serializeTracked(right.value);
        leftView = trackedLeft.text;
        rightView = trackedRight.text;
        leftMap = trackedLeft.map;
        rightMap = trackedRight.map;
    }

    const leftDoc = diffLeftEditor.getDoc();
    const rightDoc = diffRightEditor.getDoc();
    leftDoc.setValue(leftView);
    leftDoc.clearHistory();
    rightDoc.setValue(rightView);
    rightDoc.clearHistory();

    if (left.ok && right.ok) {
        const result = diffObjects(left.value, right.value);
        const changes = result.changes;
        const stats = result.stats;

        if (bothJson) {
            changes.forEach((change) => {
                const ls = leftMap[change.pointer];
                const rs = rightMap[change.pointer];
                if (change.type === 'change') {
                    if (ls) {
                        leftDoc.addLineClass(ls.line, 'background', 'cm-value-changed');
                        markSpan(diffLeftEditor, ls, 'cm-diff-old');
                    }
                    if (rs) {
                        rightDoc.addLineClass(rs.line, 'background', 'cm-value-changed');
                        markSpan(diffRightEditor, rs, 'cm-diff-new');
                    }
                } else if (change.type === 'remove') {
                    if (ls) {
                        leftDoc.addLineClass(ls.line, 'background', 'cm-deleted');
                        markSpan(diffLeftEditor, ls, 'cm-diff-old');
                    }
                } else if (rs) {
                    rightDoc.addLineClass(rs.line, 'background', 'cm-inserted');
                    markSpan(diffRightEditor, rs, 'cm-diff-new');
                }
            });
            if (diffLeftStat) diffLeftStat.textContent = '−' + (stats.changed + stats.removed);
            if (diffRightStat) diffRightStat.textContent = '+' + (stats.changed + stats.added);
            renderReport(changes, leftMap, rightMap);
        } else if (srcFmt === tgtFmt) {
            // 同格式但不是 JSON（yaml→yaml 等）：逐行标记仍然有意义
            applyLineDiff(leftView, rightView, leftDoc, rightDoc);
            renderReport(changes, null, null);
        } else {
            // 跨格式（json ↔ yaml）：两份文本本来就没有行对应关系，
            // 整块涂红只会误导，这里只给结构化清单
            if (diffLeftStat) diffLeftStat.textContent = '−' + (stats.changed + stats.removed);
            if (diffRightStat) diffRightStat.textContent = '+' + (stats.changed + stats.added);
            renderReport(changes, null, null);
        }
    } else {
        applyLineDiff(leftView, rightView, leftDoc, rightDoc);
    }

    diffLeftEditor.setOption('mode', MODE_MAP[srcFmt] || 'text/plain');
    diffRightEditor.setOption('mode', MODE_MAP[tgtFmt] || 'text/plain');
    syncEditorTheme();

    requestAnimationFrame(() => {
        diffLeftEditor.refresh();
        diffRightEditor.refresh();
    });
}

toggleDiffBtn.addEventListener('click', () => {
    isDiffMode = !isDiffMode;
    if (isDiffMode) {
        openDiff();
    } else {
        diffReport.classList.remove('show');
        diffWorkspace.classList.remove('active');
        mainWorkspace.classList.remove('hidden');
        toggleDiffBtn.textContent = currentDict.diffBtn || '对比差异';
        toggleDiffBtn.classList.remove('btn-diff');
        requestAnimationFrame(() => {
            inputEditor.refresh();
            outputEditor.refresh();
        });
    }
});

// =========================================
