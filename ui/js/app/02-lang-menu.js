/* 02-lang-menu.js — 语言菜单的渲染与切换 */
// 3. 语言菜单渲染与切换
// =========================================
const langMenu = document.getElementById('langMenu');
const langTrigger = document.getElementById('langTrigger');
const currentLangFlag = document.getElementById('currentLangFlag');
const currentLangText = document.getElementById('currentLangText');

function renderLangMenu() {
    langMenu.innerHTML = '';
    languageConfigs.filter(lang => displayLangCodes.includes(lang.code)).forEach(lang => {
        const div = document.createElement('div');
        div.className = `lang-option ${lang.code === currentLang ? 'selected' : ''}`;
                div.innerHTML = `
                    <div class="lang-option-left">
                        <span class="flag">${lang.flag}</span>
                        <span>${lang.name}</span>
                    </div>
                    ${lang.code === currentLang ? '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
                `;
        div.addEventListener('click', () => {
            setLanguage(lang.code);
            langMenu.classList.remove('open');
            renderLangMenu();
            applyI18n();
        });
        langMenu.appendChild(div);
    });

    const currentConfig = languageConfigs.find(c => c.code === currentLang);
    if (currentConfig) {
        currentLangFlag.textContent = currentConfig.flag;
        currentLangText.textContent = currentConfig.name;
    }
}

langTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    langMenu.classList.toggle('open');
});

document.addEventListener('click', () => {
    langMenu.classList.remove('open');
});

// =========================================
