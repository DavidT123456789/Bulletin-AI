/**
 * @fileoverview Listeners des autres modales (détails, raffinement, aide, etc.)
 * @module managers/listeners/OtherModalsListeners
 */

import { DOM } from '../../utils/DOM.js';
import { UI } from '../UIManager.js';
import { ClassDashboardManager } from '../ClassDashboardManager.js';
import { WelcomeManager } from '../WelcomeManager.js';
import { FocusPanelManager } from '../FocusPanelManager.js';
import { PROVIDER_CONFIG, getProviderApiKey, isValidKeyFormat } from '../../config/providers.js';
import { appState } from '../../state/State.js';

const HELP_REFINE_DEMO_DATA = {
    initial: {
        words: '23 mots',
        hint: 'Premier jet généré à partir des notes et du contexte · Cliquez sur une retouche ci-dessus',
        text: 'Un bon premier trimestre. Lucas s\'investit avec sérieux en classe et ses résultats progressent régulièrement. Il faut poursuivre ainsi au prochain trimestre.'
    },
    concise: {
        words: '14 mots · −39%',
        hint: 'Concise : va droit à l\'essentiel sans perdre le sens pédagogique',
        text: 'Bon trimestre. Lucas s\'investit sérieusement et progresse avec régularité. Poursuivez sur cette dynamique.'
    },
    detailed: {
        words: '33 mots · +43%',
        hint: 'Détaillée : développe l\'analyse et intègre la participation orale',
        text: 'Un bon premier trimestre marqué par une implication constante. Lucas participe activement à l\'oral et s\'investit en groupe, ce qui explique sa belle progression. Continuez ainsi.'
    },
    encouraging: {
        words: '25 mots · Ton valorisant',
        hint: 'Encourageante : met en valeur les efforts accomplis avec bienveillance',
        text: 'Un trimestre très positif ! Lucas fait preuve d\'un bel engagement à l\'oral et ses efforts portent leurs fruits. Félicitations, continue ainsi !'
    },
    variations: {
        words: '22 mots · Reformulé',
        hint: 'Variation : propose une autre tournure pour éviter les répétitions entre élèves',
        text: 'Trimestre satisfaisant : le travail régulier et l\'attitude active de Lucas lui permettent de consolider ses acquis. Maintenez ce cap.'
    },
    polish: {
        words: '23 mots · Style fluide',
        hint: 'Peaufiner : fluidifie la syntaxe et enrichit le vocabulaire sans changer le fond',
        text: 'Un premier trimestre de qualité. Sérieux et dynamique à l\'oral, Lucas affiche des résultats en progression constante. Maintenez cet engagement.'
    }
};

export const OtherModalsListeners = {
    init() { },

    /**
     * Configure les listeners des autres modales (détails, raffinement, aide, etc.).
     * @param {Function} addClickListener - Helper pour ajouter un listener click
     */
    setup(addClickListener) {
        this._setupHelpModal(addClickListener);
        this._setupClassDashboardModal(addClickListener);
    },

    _setupHelpModal(addClickListener) {
        addClickListener(DOM.closeHelpModalBtn, () => UI.closeModal(DOM.helpModal));
        addClickListener(DOM.closeHelpModalFooterBtn, () => UI.closeModal(DOM.helpModal));

        const helpToPersonalizationBtn = document.getElementById('helpToPersonalizationBtn');
        helpToPersonalizationBtn?.addEventListener('click', () => {
            UI.closeAllModals();
            setTimeout(() => {
                const personalizationModal = document.getElementById('personalizationModal');
                if (personalizationModal) UI.openModal(personalizationModal);
                UI.highlightSettingsElement('settings-controls-panel', {
                    tab: 'templates',
                    useParentFormGroup: false
                });
            }, 300);
        });

        const relaunchBtn = document.getElementById('relaunchWelcomeGuideBtn');
        relaunchBtn?.addEventListener('click', (e) => {
            WelcomeManager.handleRelaunchWelcomeGuide(e);
        });

        // Navigation clavier accessible (Flèches Haut/Bas/Gauche/Droite) sur les onglets du Guide
        const tablist = DOM.helpModal?.querySelector('.ui-tabs-sidebar[role="tablist"]');
        tablist?.addEventListener('keydown', (e) => {
            if (!['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
            const tabs = Array.from(tablist.querySelectorAll('.ui-tabs-btn[role="tab"]'));
            const currentIndex = tabs.indexOf(document.activeElement);
            if (currentIndex === -1) return;

            e.preventDefault();
            let nextIndex = currentIndex;
            if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
                nextIndex = (currentIndex + 1) % tabs.length;
            } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
                nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
            } else if (e.key === 'Home') {
                nextIndex = 0;
            } else if (e.key === 'End') {
                nextIndex = tabs.length - 1;
            }
            tabs[nextIndex]?.focus();
            tabs[nextIndex]?.click();
        });

        // Sélecteur de fournisseur IA (Étape 1) avec statut de clé en temps réel
        const helpProviderRadios = document.querySelectorAll('input[name="helpProvider"]');
        const helpContainer = document.getElementById('helpProviderSelector');
        const helpGlider = helpContainer?.querySelector('.ui-glider');

        const syncActiveProviderRadio = () => {
            const supported = ['google', 'groq', 'mistral', 'openrouter'];
            const current = appState?.currentProvider;
            let targetProvider = supported.includes(current) ? current : null;
            if (!targetProvider) {
                targetProvider = supported.find(id => isValidKeyFormat(getProviderApiKey(id, { state: appState, dom: DOM }))) || 'google';
            }
            const targetRadio = document.querySelector(`input[name="helpProvider"][value="${targetProvider}"]`);
            if (targetRadio && !targetRadio.checked) {
                targetRadio.checked = true;
            }
        };

        const updateHelpProviderUI = (animate = false) => {
            const checked = document.querySelector('input[name="helpProvider"]:checked');
            if (!checked) return;

            if (helpGlider && checked.nextElementSibling) {
                const label = checked.nextElementSibling;
                requestAnimationFrame(() => {
                    if (label.offsetWidth > 0) {
                        helpGlider.style.width = `${label.offsetWidth}px`;
                        helpGlider.style.left = `${label.offsetLeft}px`;
                    }
                });
            }

            const value = checked.value;
            const contentMap = {
                google: 'helpContentGoogle',
                groq: 'helpContentGroq',
                mistral: 'helpContentMistral',
                openrouter: 'helpContentOpenRouter'
            };

            const descEl = document.getElementById('helpProviderDesc');
            const providerInfo = PROVIDER_CONFIG[value];
            if (descEl && providerInfo?.description) {
                descEl.innerHTML = providerInfo.description;
            }

            const statusBadge = document.getElementById('helpProviderStatusBadge');
            if (statusBadge) {
                const rawKey = getProviderApiKey(value, { state: appState, dom: DOM });
                const hasKey = isValidKeyFormat(rawKey);
                statusBadge.classList.toggle('status-connected', hasKey);
                statusBadge.classList.toggle('status-unconfigured', !hasKey);
                statusBadge.innerHTML = `<span class="status-dot"></span><span>${hasKey ? 'Clé configurée' : 'Non configuré'}</span>`;
            }

            const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
            const contents = document.querySelectorAll('.provider-help-content');
            contents.forEach(el => {
                const isTarget = el.id === contentMap[value];
                el.hidden = !isTarget;
                if (isTarget) {
                    if (animate && !reducedMotion && typeof el.animate === 'function') {
                        el.animate([
                            { opacity: 0, transform: 'translateY(4px)' },
                            { opacity: 1, transform: 'translateY(0)' }
                        ], {
                            duration: 200,
                            easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
                            fill: 'forwards'
                        });
                    }
                }
            });
        };

        if (helpProviderRadios.length > 0) {
            helpProviderRadios.forEach(radio => {
                radio.addEventListener('change', () => updateHelpProviderUI(true));
            });

            setTimeout(() => {
                syncActiveProviderRadio();
                updateHelpProviderUI(false);
            }, 200);

            const refreshHelpProviderOnOpen = () => {
                syncActiveProviderRadio();
                setTimeout(() => updateHelpProviderUI(false), 60);
            };

            DOM.helpBtn?.addEventListener('click', refreshHelpProviderOnOpen);
            window.addEventListener('help-modal-opened', refreshHelpProviderOnOpen);

            const helpTabs = DOM.helpModal?.querySelectorAll('.ui-tabs-btn') || [];
            helpTabs.forEach(tab => {
                tab.addEventListener('click', () => {
                    if (tab.getAttribute('aria-controls') === 'help-apikey') {
                        setTimeout(() => updateHelpProviderUI(false), 50);
                    }
                });
            });
        }

        // Simulateur interactif utilisant les vrais boutons .btn-ai-outline[data-refine-type]
        const refineDemoContainer = document.getElementById('helpRefineDemo');
        if (refineDemoContainer) {
            const demoBtns = refineDemoContainer.querySelectorAll('[data-refine-type]');
            const resetBtn = document.getElementById('helpRefineResetBtn');
            const demoTextEl = document.getElementById('helpRefineDemoText');
            const demoWordsEl = document.getElementById('helpRefineDemoWords');
            const demoHintEl = document.getElementById('helpRefineDemoHint');
            let demoRevealTimer = null;

            const streamDemoText = (text, skipAnimation) => {
                if (!demoTextEl) return;
                if (demoRevealTimer) {
                    clearTimeout(demoRevealTimer);
                    demoRevealTimer = null;
                }
                if (skipAnimation) {
                    demoTextEl.textContent = text;
                    return;
                }

                const tokens = text.split(/(\s+)/);
                const fragment = document.createDocumentFragment();
                let wordIdx = 0;
                let maxDelay = 0;

                tokens.forEach(token => {
                    if (!token.trim()) {
                        fragment.appendChild(document.createTextNode(token));
                        return;
                    }
                    const span = document.createElement('span');
                    span.className = 'reveal-word fast';
                    span.textContent = token;
                    const delay = wordIdx * 16;
                    span.style.animationDelay = `${delay}ms`;
                    fragment.appendChild(span);
                    wordIdx++;
                    if (delay > maxDelay) maxDelay = delay;
                });

                demoTextEl.innerHTML = '';
                demoTextEl.appendChild(fragment);

                demoRevealTimer = setTimeout(() => {
                    demoTextEl.textContent = text;
                    demoRevealTimer = null;
                }, maxDelay + 340);
            };

            const applyDemoMode = (mode, animate = true) => {
                const data = HELP_REFINE_DEMO_DATA[mode] || HELP_REFINE_DEMO_DATA.initial;
                demoBtns.forEach(btn => {
                    const isTarget = btn.dataset.refineType === mode;
                    btn.classList.toggle('active', isTarget);
                    btn.setAttribute('aria-pressed', isTarget ? 'true' : 'false');
                });
                if (resetBtn) {
                    resetBtn.hidden = mode === 'initial';
                }
                if (demoWordsEl) demoWordsEl.textContent = data.words;
                if (demoHintEl) demoHintEl.textContent = data.hint;

                const skipAnimation = !animate || window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
                streamDemoText(data.text, skipAnimation);
            };

            demoBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    const type = btn.dataset.refineType;
                    const isAlreadyActive = btn.classList.contains('active');
                    applyDemoMode(isAlreadyActive ? 'initial' : type, true);
                });
            });

            resetBtn?.addEventListener('click', () => applyDemoMode('initial', true));

            const resetDemoQuietly = () => applyDemoMode('initial', false);
            DOM.helpBtn?.addEventListener('click', resetDemoQuietly);
            DOM.closeHelpModalBtn?.addEventListener('click', resetDemoQuietly);
            DOM.closeHelpModalFooterBtn?.addEventListener('click', resetDemoQuietly);
            window.addEventListener('help-modal-opened', resetDemoQuietly);
        }
    },

    /**
     * Setup listeners for the new Class Dashboard modal
     */
    _setupClassDashboardModal(addClickListener) {
        const modal = document.getElementById('classDashboardModal');
        if (!modal) return;

        // Close buttons
        const closeBtnHeader = document.getElementById('closeDashboardModalBtn');

        addClickListener(closeBtnHeader, () => ClassDashboardManager.closeDashboard());

        // Generate AI Synthesis button
        const generateBtn = document.getElementById('generateSynthesisBtn');
        addClickListener(generateBtn, () => ClassDashboardManager.generateAISynthesis());

        // Copy button
        const copyBtn = document.getElementById('copyDashboardSynthesisBtn');
        addClickListener(copyBtn, () => ClassDashboardManager.copySynthesis());

        // Click handlers for interactive elements
        modal.addEventListener('click', (e) => {
            // Click on student highlight to focus on them
            const highlightItem = e.target.closest('.highlight-item[data-student-id]');
            if (highlightItem) {
                const studentId = highlightItem.dataset.studentId;
                ClassDashboardManager.closeDashboard();
                // Open focus panel for this student
                setTimeout(() => {
                    FocusPanelManager.open(studentId);
                }, 300);
            }
        });

        // Close on backdrop click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                ClassDashboardManager.closeDashboard();
            }
        });
    }
};
