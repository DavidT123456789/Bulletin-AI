/**
 * @fileoverview Listeners des autres modales (détails, raffinement, aide, etc.)
 * @module managers/listeners/OtherModalsListeners
 */

import { DOM } from '../../utils/DOM.js';
import { UI } from '../UIManager.js';
import { loadClassDashboard, withLazyManager } from '../../utils/LazyManagers.js';
import { WelcomeManager } from '../WelcomeManager.js';
import { FocusPanelManager } from '../FocusPanelManager.js';
import { SettingsModalListeners } from './SettingsModalListeners.js';
import { getConfiguredProviders, getProviderConfig, getProviderForModel } from '../../config/providers.js';
import { appState } from '../../state/State.js';
import { bus, EVENTS } from '../../core/EventBus.js';

const HELP_REFINE_DEMO_DATA = {
    initial: {
        words: '24 mots',
        hint: 'Premier jet issu des notes · Testez une retouche ci-dessus',
        text: 'Un bon deuxième trimestre. Lucas s\'investit avec sérieux, participe activement en classe et ses résultats progressent régulièrement. Il faut poursuivre ainsi au prochain trimestre.'
    },
    concise: {
        words: '15 mots · −38%',
        hint: 'Concise : raccourcit et va droit à l\'essentiel sans perdre d\'information',
        text: 'Bon deuxième trimestre. Sérieux et actif à l\'oral, Lucas progresse régulièrement. Il faut poursuivre ainsi.'
    },
    encouraging: {
        words: '26 mots · Ton valorisant',
        hint: 'Encourageante : valorise les efforts et la dynamique avec bienveillance',
        text: 'Un deuxième trimestre très positif : l\'investissement régulier de Lucas et son rôle moteur en classe portent pleinement leurs fruits. Il faut continuer sur cette belle lancée.'
    },
    demanding: {
        words: '25 mots · Ton exigeant',
        hint: 'Exigeante : renforce le niveau d\'attente avec un ton plus ferme et direct',
        text: 'Un bon deuxième trimestre. Lucas participe activement et progresse, mais doit désormais viser davantage de rigueur et d\'autonomie à l\'écrit pour franchir un nouveau cap.'
    },
    polish: {
        words: '24 mots · Style fluide',
        hint: 'Peaufiner : corrige et fluidifie la rédaction sans modifier le fond',
        text: 'Un deuxième trimestre de qualité. Sérieux et moteur à l\'oral, Lucas affiche des résultats en progression constante qu\'il conviendra de confirmer au trimestre prochain.'
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
        DOM.helpModal?.addEventListener('click', (e) => {
            if (e.target === DOM.helpModal) {
                UI.closeModal(DOM.helpModal);
            }
        });

        const helpToPersonalizationBtn = document.getElementById('helpToPersonalizationBtn');
        helpToPersonalizationBtn?.addEventListener('click', () => {
            SettingsModalListeners.openPersonalization('iaVoiceSelector');
        });

        addClickListener(DOM.relaunchWelcomeGuideBtn, (e) => WelcomeManager.handleRelaunchWelcomeGuide(e));

        // Navigation clavier accessible (Flèches Haut/Bas/Gauche/Droite) sur les onglets latéraux (Guide & Paramètres)
        document.querySelectorAll('.ui-tabs-sidebar').forEach((tablist) => {
            tablist.addEventListener('keydown', (e) => {
                if (!['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
                const tabs = Array.from(tablist.querySelectorAll('.ui-tabs-btn'));
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
        });

        // Mise à jour dynamique du badge de statut IA et du CTA (Étape 1)
        const updateHelpProviderStatus = () => this.updateHelpProviderStatus();

        setTimeout(updateHelpProviderStatus, 200);
        DOM.helpBtn?.addEventListener('click', updateHelpProviderStatus);
        bus.on(EVENTS.MODAL_HELP_OPENED, updateHelpProviderStatus);

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
            bus.on(EVENTS.MODAL_HELP_OPENED, resetDemoQuietly);
        }
    },

    /**
     * Synchronise le badge de statut IA et la cible du bouton Configurer/Gérer les clés (Onglet Démarrage).
     */
    updateHelpProviderStatus() {
        const statusBadge = document.getElementById('helpProviderStatusBadge');
        if (!statusBadge) return;

        const configured = getConfiguredProviders({ state: appState, dom: DOM });
        const hasOllama = appState?.ollamaEnabled === true;
        const isReady = configured.length > 0 || hasOllama;

        statusBadge.classList.toggle('status-connected', isReady);
        statusBadge.classList.toggle('status-unconfigured', !isReady);
        statusBadge.innerHTML = `<span class="status-dot"></span><span>${isReady ? 'Clé configurée' : 'À configurer'}</span>`;

        const engineBtn = document.getElementById('helpOpenSettingsEngineBtn');
        if (!engineBtn) return;

        engineBtn.classList.toggle('btn-primary', !isReady);
        engineBtn.classList.toggle('btn-secondary', isReady);
        engineBtn.innerHTML = isReady
            ? '<iconify-icon class="iconify-inline" icon="solar:settings-linear"></iconify-icon> Gérer les clés'
            : '<iconify-icon class="iconify-inline" icon="solar:key-linear"></iconify-icon> Configurer l\'IA';

        let targetElement = 'albertApiKey';
        if (isReady) {
            const activeProviderId = getProviderForModel(appState?.currentAIModel);
            const activeIsReady = (activeProviderId === 'ollama' && hasOllama) ||
                configured.some(p => p.id === activeProviderId);
            const chosenProviderId = activeIsReady ? activeProviderId : configured[0]?.id;
            targetElement = getProviderConfig(chosenProviderId)?.domKey ||
                (hasOllama ? 'ollamaEnabledToggle' : 'albertApiKey');
        }
        engineBtn.dataset.targetElement = targetElement;
    },

    /**
     * Setup listeners for the new Class Dashboard modal
     */
    _setupClassDashboardModal(addClickListener) {
        const modal = document.getElementById('classDashboardModal');
        if (!modal) return;

        // Close buttons
        const closeBtnHeader = document.getElementById('closeDashboardModalBtn');

        addClickListener(closeBtnHeader, () =>
            withLazyManager(loadClassDashboard, (dashboard) => dashboard.closeDashboard())
        );

        // Generate AI Synthesis button
        const generateBtn = document.getElementById('generateSynthesisBtn');
        addClickListener(generateBtn, () =>
            withLazyManager(loadClassDashboard, (dashboard) => dashboard.generateAISynthesis())
        );

        // Copy button
        const copyBtn = document.getElementById('copyDashboardSynthesisBtn');
        addClickListener(copyBtn, () =>
            withLazyManager(loadClassDashboard, (dashboard) => dashboard.copySynthesis())
        );

        // Export Class Dashboard PDF button
        const exportPdfBtn = document.getElementById('exportClassDashboardPdfBtn');
        addClickListener(exportPdfBtn, () =>
            withLazyManager(loadClassDashboard, (dashboard) => dashboard.exportPdf())
        );

        const openStudentFromHighlight = (highlightItem) => {
            const studentId = highlightItem?.dataset?.studentId;
            if (!studentId) return;
            withLazyManager(loadClassDashboard, (dashboard) => {
                dashboard.closeDashboard();
                // Open focus panel for this student
                setTimeout(() => {
                    FocusPanelManager.open(studentId);
                }, 300);
            });
        };

        // Click & keyboard handlers for interactive student highlights
        modal.addEventListener('click', (e) => {
            const highlightItem = e.target.closest('.highlight-item[data-student-id]');
            if (highlightItem) {
                openStudentFromHighlight(highlightItem);
            }
        });

        modal.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            const highlightItem = e.target.closest('.highlight-item[data-student-id]');
            if (highlightItem) {
                e.preventDefault();
                openStudentFromHighlight(highlightItem);
            }
        });

        // Close on backdrop click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                withLazyManager(loadClassDashboard, (dashboard) => dashboard.closeDashboard());
            }
        });
    }
};
