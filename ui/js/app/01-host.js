/* 01-host.js — DBX 宿主桥接：主题、拖放注册、工具提示清理 */
// =========================================
// 2. DBX 环境与 API 桥接
// =========================================
// 主题不能只依赖宿主替我们设置 data-dbx-theme（旧版本宿主 / 独立预览下拿不到），
// 这里做三级兜底：dbxPlugin.theme -> 宿主注入的 --color-background 亮度 -> 系统偏好。
function colorLuminance(value) {
    if (!value) return null;
    const probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none';
    probe.style.color = value;
    if (!probe.style.color) return null;
    document.body.appendChild(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    const parts = resolved.match(/[\d.]+/g);
    if (!parts || parts.length < 3) return null;
    const [r, g, b] = parts.slice(0, 3).map((n) => {
        const v = parseFloat(n) / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function detectAppearance() {
    const root = document.documentElement;
    // 有些宿主用别的方式标记明暗，先认这些线索
    const attrTheme = root.getAttribute('data-theme') || root.getAttribute('data-color-scheme');
    if (attrTheme === 'dark' || attrTheme === 'light') return attrTheme;
    const cs = getComputedStyle(root);
    for (const name of ['--color-background', '--background', '--bg-background']) {
        const lum = colorLuminance(cs.getPropertyValue(name).trim());
        if (lum !== null) return lum < 0.45 ? 'dark' : 'light';
    }
    if (root.classList.contains('dark') || root.classList.contains('theme-dark')) return 'dark';
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
    return 'light';
}

// -----------------------------------------
// 主题切换过渡
// 只在颜色真的变化时给 <html> 挂 300ms 的 theme-anim，
// 让导航、工具栏、编辑器底色、边框、文字一起渐变，而不是硬切。
// -----------------------------------------
const THEME_ANIM_MS = 300;
let themeAnimTimer = null;
let editorThemeTimer = null;    // 延后切 CodeMirror 主题，等底色渐变到一半
let themeBooted = false;        // 首屏第一次应用完成后才允许做动画
let themeSource = 'auto';       // host：宿主明确下发；auto：我们自己按环境推断
let lastAppliedTheme = null;    // 我们写进 data-dbx-theme 的值，用来区分宿主直接写属性

function prefersReducedMotion() {
    try {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) {
        return false;
    }
}

function runThemeTransition(animate) {
    const root = document.documentElement;
    if (!animate || prefersReducedMotion()) {
        clearTimeout(themeAnimTimer);
        root.classList.remove('theme-anim');
        return;
    }
    // 先挂过渡类再改颜色：同一帧里浏览器就会按「新值 + transition」插值
    root.classList.add('theme-anim');
    clearTimeout(themeAnimTimer);
    themeAnimTimer = setTimeout(() => root.classList.remove('theme-anim'), THEME_ANIM_MS + 60);
}

// 宿主直接改 data-dbx-theme 时（不经过 dbxPlugin API），也要跟上：
// 否则样式变了、CodeMirror 还停在旧主题，就成了「一半亮一半暗」。
if (window.MutationObserver) {
    new MutationObserver(() => {
        const next = document.documentElement.getAttribute('data-dbx-theme');
        if (next === lastAppliedTheme) return; // 是我们自己写的
        if (next !== 'dark' && next !== 'light') return;
        const animate = themeBooted && !prefersReducedMotion();
        themeSource = 'host';
        lastAppliedTheme = next;
        runThemeTransition(animate);
        document.documentElement.style.colorScheme = next;
        if (document.querySelector('.CodeMirror')) {
            syncEditorThemeSoon(animate ? Math.round(THEME_ANIM_MS * 0.34) : 0);
        }
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-dbx-theme'] });
}

function applyHostTheme(theme) {
    const root = document.documentElement;
    const tokens = (theme && theme.tokens) || {};
    let tokensChanged = false;
    Object.keys(tokens).forEach((name) => {
        // 只接 DBX 约定的根级令牌，避免把无关变量塞进插件
        if (!/^--(color|radius|font)-/.test(name) || typeof tokens[name] !== 'string') return;
        if (root.style.getPropertyValue(name) !== tokens[name]) tokensChanged = true;
        root.style.setProperty(name, tokens[name]);
    });

    let appearance = theme && theme.appearance;
    if (appearance !== 'dark' && appearance !== 'light') {
        // 没有明确 appearance 时：宿主自己写过属性就听它的，否则按令牌亮度/系统偏好推断。
        // 首屏兜底写进去的那个值不算宿主意见，所以只看 themeSource 是否已标记为 host。
        const declared = root.getAttribute('data-dbx-theme');
        appearance = themeSource === 'host' && (declared === 'dark' || declared === 'light')
            ? declared
            : detectAppearance();
    } else {
        themeSource = 'host';
    }

    const changed = root.getAttribute('data-dbx-theme') !== appearance;
    // 首屏第一次应用不做动画（否则会看到白底淡入深色），之后换主题/换皮肤都走过渡
    const animate = themeBooted && (changed || tokensChanged) && !prefersReducedMotion();
    if (changed) {
        runThemeTransition(animate);
        root.setAttribute('data-dbx-theme', appearance);
        lastAppliedTheme = appearance;
    } else if (animate) {
        runThemeTransition(true);
    }
    root.style.colorScheme = appearance;
    // 编辑器可能尚未创建，那种情况下由 syncEditorTheme() 在创建后读取属性
    if (document.querySelector('.CodeMirror')) {
        syncEditorThemeSoon(changed && animate ? Math.round(THEME_ANIM_MS * 0.34) : 0);
    }

    if (!themeBooted) {
        // 首屏这一次不做动画，落定后放开，之后任何切换都能平滑
        themeBooted = true;
    }
    return appearance;
}

if (window.dbxPlugin) {
    // 以前整份脚本包在一个 async 回调里，`await ready` 会挡住后面所有初始化，
    // 所以首屏一定等到宿主回话才上色。现在拆成多个文件，后面的文件不等这一次 await，
    // 宿主已经把 theme 给过来时先落一次，免得用默认配色画一帧再切过去。
    if (window.dbxPlugin.theme) applyHostTheme(window.dbxPlugin.theme);
    void (async () => {
        try {
            await window.dbxPlugin.ready;
            if (window.dbxPlugin.locale && languageConfigs.find(c => c.code === window.dbxPlugin.locale)) {
                currentLang = window.dbxPlugin.locale;
            }
            applyHostTheme(window.dbxPlugin.theme);
            window.addEventListener('dbx-plugin-init', (event) => {
                applyHostTheme(event.detail && event.detail.theme);
            });
            window.addEventListener('dbx-plugin-env', (event) => {
                const env = event.detail || {};
                if (env.locale && languageConfigs.find(c => c.code === env.locale)) {
                    currentLang = env.locale;
                    currentDict = languageConfigs.find(c => c.code === currentLang).dict;
                    renderLangMenu();
                    applyI18n();
                }
                if (env.theme) applyHostTheme(env.theme);
            });
        } catch (err) {
            console.warn('DBX init error:', err);
            applyHostTheme(null);
        }
    })();
} else {
    const userLang = navigator.language || 'zh-CN';
    if (languageConfigs.find(c => c.code === userLang)) currentLang = userLang;
    else if (userLang.startsWith('zh')) currentLang = userLang === 'zh-TW' ? 'zh-TW' : 'zh-CN';
    currentDict = languageConfigs.find(c => c.code === currentLang).dict;
    applyHostTheme(null);
    const darkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    if (darkQuery && darkQuery.addEventListener) {
        darkQuery.addEventListener('change', () => {
            if (!window.dbxPlugin) applyHostTheme(null);
        });
    }
}

currentDict = languageConfigs.find(c => c.code === currentLang).dict;

// =========================================
