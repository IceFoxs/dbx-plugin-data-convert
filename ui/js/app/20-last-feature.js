/* 20-last-feature.js — 记住最后一次用的功能，下次打开直接回到那里 */
// =========================================
// 3.7 最后一次使用的功能：跨会话恢复
// =========================================
// 存的是「哪一项」，不是页面内容：独立页存导航项 id（`navQr` 这种），
// 格式转换存「从 / 转为」这一对格式名（`json` → `yaml`）。
// 放在最后一个加载：恢复时要调 enter*Mode，那些函数在 09 ~ 19 里，
// 早于它们加载的话 20 里拿到的全是 undefined。
//
// 版本回退与功能升级都要扛住（存下来的东西可能来自任何一版）：
//   1. 形状不认识 / 缺字段 -> 当没存过，留在默认页，绝不跳去一个不存在的入口；
//   2. 导航项改名或被删掉 -> 对着 DOM 查，查不到就不恢复；
//   3. 未来版本塞进来的字段 -> 收进 extra，写回去时原样带上（见 Nav.parseLastFeature）。
const LAST_FEATURE_KEY = 'lastFeature';
const LAST_FEATURE_TAG = 'dbx-lastf:';
// 最近一次写出去 / 恢复过的原文：宿主那份回来时如果和它一样，就不必再跳一次
let lastFeatureApplied = '';
// 这一版读不懂但要原样带回去的字段
let lastFeatureExtra = {};

function lastFeatureParse(raw) {
    return Nav ? Nav.parseLastFeature(raw) : { kind: '', id: '', src: '', tgt: '', found: false, extra: {} };
}

// 从一串存档恢复：入口真在页面上才跳，否则留在格式转换页
function lastFeatureApply(raw) {
    const rec = lastFeatureParse(raw);
    if (!rec) return false;
    // 哪怕这一条用不上，未来版本的字段也要留着，下次写回时一并带出去
    if (rec.extra && Object.keys(rec.extra).length) lastFeatureExtra = rec.extra;
    if (!rec.found || typeof handleNavClick !== 'function') return false;

    if (rec.kind === 'page') {
        const el = document.getElementById(rec.id);
        if (!el) return false;      // 这一版没有这一项了：静默留在默认页
        handleNavClick(el);
        lastFeatureApplied = raw || '';
        return true;
    }
    if (rec.kind === 'convert') {
        // 不用 querySelector 拼属性选择器：存档里的字符串可能是任何东西，
        // 挨个比 dataset 更稳（多走一次循环，菜单就十几项）
        let hit = null;
        Array.prototype.forEach.call(
            document.querySelectorAll('#navConvertMenu a[data-src][data-tgt]'),
            (a) => { if (!hit && a.dataset.src === rec.src && a.dataset.tgt === rec.tgt) hit = a; }
        );
        if (hit) {
            handleNavClick(hit);
            lastFeatureApplied = raw || '';
            return true;
        }
        // 菜单里只有几对常用格式，用户在「从 / 转为」里配过的组合大多不在其中。
        // 格式名以页面上真实的选项为准：两个方向都认得才切过去，
        // 认不得（旧版本删掉的格式 / 新版本才有的格式）就安静地留在默认那一对。
        const hasFormat = (sel, value) => {
            let ok = false;
            Array.prototype.forEach.call(
                document.querySelectorAll('#' + sel + ' .custom-option[data-value]'),
                (o) => { if (o.dataset.value === value) ok = true; }
            );
            return ok;
        };
        if (!hasFormat('sourceSelect', rec.src) || !hasFormat('targetSelect', rec.tgt)) return false;
        if (typeof enterConvertPair !== 'function') return false;
        enterConvertPair(null, rec.src, rec.tgt);
        lastFeatureApplied = raw || '';
        return true;
    }
    return false;
}

function lastFeatureSave(rec) {
    const raw = Nav ? Nav.serializeLastFeature(rec) : '';
    if (!raw) return;
    lastFeatureApplied = raw;
    prefWriteLocal(LAST_FEATURE_KEY, raw);
    prefNameSet(LAST_FEATURE_TAG, raw);
    prefHostSet(LAST_FEATURE_KEY, raw);
}

// 点的是「格式转换」里某一对格式
function lastFeatureRememberConvert(src, tgt) {
    lastFeatureSave({ kind: 'convert', src: src, tgt: tgt, extra: lastFeatureExtra });
}
// 点的是导航里某一页
function lastFeatureRememberPage(id) {
    lastFeatureSave({ kind: 'page', id: id, extra: lastFeatureExtra });
}
function lastFeatureRemember(link) {
    if (!link) return;
    if (link.dataset && link.dataset.src && link.dataset.tgt) {
        lastFeatureRememberConvert(link.dataset.src, link.dataset.tgt);
        return;
    }
    if (link.id) lastFeatureRememberPage(link.id);
}

// ---- 启动恢复 ----
// 先按同步来源（localStorage / window.name）恢复，避免闪一下默认页；
// 宿主存储是权威来源（沙箱里只有它能在重开后记住），到手后再覆盖一次。
const lastFeatureLocal = prefReadLocal(LAST_FEATURE_KEY) || prefNameGet(LAST_FEATURE_TAG);
if (lastFeatureLocal) lastFeatureApply(lastFeatureLocal);

prefHostGet(LAST_FEATURE_KEY).then((raw) => {
    // 和已经恢复过的那份一样就别再跳一次（进页有副作用：建编辑器、清输入）
    if (!raw || raw === lastFeatureApplied) return;
    lastFeatureApply(raw);
}).catch(() => { });

// =========================================
