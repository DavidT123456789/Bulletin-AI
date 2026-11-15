(function() {
    try {
        var standaloneTheme = localStorage.getItem('bulletin_theme');
        var standaloneAccent = localStorage.getItem('bulletin_accent');
        var theme = standaloneTheme || '';
        var accent = standaloneAccent || '';
        var rawState = localStorage.getItem('appreciationGeneratorState_v6.2') ||
                       localStorage.getItem('bulletin_app_state') ||
                       localStorage.getItem('appreciationGeneratorState');
        if (rawState) {
            var state = JSON.parse(rawState);
            if (!theme) {
                theme = (state.settings && state.settings.theme) || state.theme || (state.ui && state.ui.theme) || '';
            }
            if (!accent) {
                var stateAccent = (state.settings && state.settings.accentColor) || state.accentColor || (state.ui && state.ui.accentColor) || '';
                if (stateAccent && stateAccent !== 'blue') {
                    accent = stateAccent;
                }
            }
        }

        if (!theme) theme = 'light';
        var isSystemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        var effectiveTheme = (theme === 'system' ? (isSystemDark ? 'dark' : 'light') : theme) === 'dark' ? 'dark' : 'light';
        var bgColor = effectiveTheme === 'dark' ? '#0c0c0d' : '#f6f6f6';

        var validAccents = ['anthracite', 'blue', 'purple', 'pink', 'orange', 'green', 'teal'];
        var customAccentHex = '';
        var hexRegex = /^#[0-9a-fA-F]{6}$/;
        if (hexRegex.test(accent)) {
            customAccentHex = accent.toLowerCase();
        } else if (accent === 'custom') {
            var storedCustomAccent = localStorage.getItem('bulletin_custom_accent') || '';
            if (hexRegex.test(storedCustomAccent)) {
                customAccentHex = storedCustomAccent.toLowerCase();
            }
        }

        if (customAccentHex) {
            document.documentElement.dataset.accent = 'custom';
            var r = parseInt(customAccentHex.slice(1, 3), 16);
            var g = parseInt(customAccentHex.slice(3, 5), 16);
            var b = parseInt(customAccentHex.slice(5, 7), 16);
            document.documentElement.style.setProperty('--primary-color', customAccentHex);
            document.documentElement.style.setProperty('--primary-color-rgb', r + ', ' + g + ', ' + b);
            document.documentElement.style.setProperty('--primary-hover', customAccentHex);
            document.documentElement.style.setProperty('--primary-bright', customAccentHex);
            document.documentElement.style.setProperty('--primary-bright-rgb', r + ', ' + g + ', ' + b);
            document.documentElement.style.setProperty('--text-on-primary', (0.299 * r + 0.587 * g + 0.114 * b) > 175 ? '#171717' : '#ffffff');
        } else if (validAccents.indexOf(accent) !== -1 && accent !== 'anthracite') {
            document.documentElement.dataset.accent = accent;
        }

        document.documentElement.dataset.theme = effectiveTheme;
        document.documentElement.style.backgroundColor = bgColor;
        document.documentElement.style.colorScheme = effectiveTheme;

        var colorSchemeMeta = document.querySelector('meta[name="color-scheme"]');
        if (colorSchemeMeta) colorSchemeMeta.setAttribute('content', effectiveTheme);

        var themeMetas = document.querySelectorAll('meta[name="theme-color"]');
        for (var i = 0; i < themeMetas.length; i++) {
            themeMetas[i].setAttribute('content', bgColor);
        }

        // Restore Transition Check (0ms pre-paint)
        try {
            var restoreTransitionRaw = sessionStorage.getItem('bulletin_restore_transition');
            if (restoreTransitionRaw) {
                var restoreData = JSON.parse(restoreTransitionRaw);
                if (restoreData && restoreData.timestamp && (Date.now() - restoreData.timestamp) < 5000) {
                    document.documentElement.classList.add('is-restoring-transition');
                }
            }
            if (!localStorage.getItem('appreciationGeneratorFirstVisit_v8')) {
                document.documentElement.classList.add('is-first-visit');
            }
        } catch (_) {}

        // Self-healing boot watchdog: if a stale Service Worker cache blocks ES module execution,
        // automatically purge SW + Cache Storage once per session and reload cleanly.
        var recoverFromStaleSW = function() {
            if (window.App) return;
            try {
                if (sessionStorage.getItem('bulletin_sw_recovery') === '1') return;
                sessionStorage.setItem('bulletin_sw_recovery', '1');
            } catch (_) {
                return;
            }
            var tasks = [];
            if ('serviceWorker' in navigator && navigator.serviceWorker.getRegistrations) {
                tasks.push(navigator.serviceWorker.getRegistrations().then(function(regs) {
                    return Promise.all(regs.map(function(r) { return r.unregister(); }));
                }).catch(function() {}));
            }
            if (window.caches && window.caches.keys) {
                tasks.push(window.caches.keys().then(function(keys) {
                    return Promise.all(keys.map(function(k) { return window.caches.delete(k); }));
                }).catch(function() {}));
            }
            Promise.all(tasks).then(function() {
                window.location.reload();
            });
        };

        window.addEventListener('error', function(e) {
            var t = e && e.target;
            if (t && ((t.tagName === 'SCRIPT' && t.type === 'module') || (t.tagName === 'LINK' && t.rel === 'modulepreload'))) {
                recoverFromStaleSW();
            }
        }, true);

        window.addEventListener('load', function() {
            setTimeout(function() {
                if (!window.App) recoverFromStaleSW();
            }, 3500);
        });
    } catch (e) {
        document.documentElement.dataset.theme = 'light';
        document.documentElement.style.backgroundColor = '#f6f6f6';
        document.documentElement.style.colorScheme = 'light';
    }
})();
