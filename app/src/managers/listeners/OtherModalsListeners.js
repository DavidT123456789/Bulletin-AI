/**
 * @fileoverview Listeners des autres modales (détails, raffinement, aide, etc.)
 * @module managers/listeners/OtherModalsListeners
 */

import { DOM } from '../../utils/DOM.js';
import { UI } from '../UIManager.js';
import { ClassDashboardManager } from '../ClassDashboardManager.js';
import { WelcomeManager } from '../WelcomeManager.js';
import { FocusPanelManager } from '../FocusPanelManager.js';
import { SettingsModalListeners } from './SettingsModalListeners.js';

let App = null;

export const OtherModalsListeners = {
    init(appInstance) {
        App = appInstance;
    },

    /**
     * Configure les listeners des autres modales (détails, raffinement, aide, etc.).
     * @param {Function} addClickListener - Helper pour ajouter un listener click
     */
    setup(addClickListener) {
        this._setupHelpModal(addClickListener);
        this._setupClassDashboardModal(addClickListener);
        // Note: Import modal is now handled by ImportWizardManager
    },

    _setupHelpModal(addClickListener) {
        addClickListener(DOM.closeHelpModalBtn, () => UI.closeModal(DOM.helpModal));
        addClickListener(DOM.closeHelpModalFooterBtn, () => UI.closeModal(DOM.helpModal));
        DOM.helpGoToSettingsBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            UI.closeAllModals();
            UI.openModal(DOM.settingsModal);
            UI.showSettingsTab('advanced');
        });
        DOM.helpFormatSelector?.addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON' && e.target.dataset.format) {
                UI.updateHelpImportFormat(e.target.dataset.format);
            }
        });

        // "Accéder à la personnalisation" button in Help > Personnaliser tab
        const helpToPersonalizationBtn = document.getElementById('helpToPersonalizationBtn');
        helpToPersonalizationBtn?.addEventListener('click', () => {
            UI.closeAllModals();
            setTimeout(() => {
                const personalizationModal = document.getElementById('personalizationModal');
                if (personalizationModal) UI.openModal(personalizationModal);
                // Refresh Lab data on modal open
                SettingsModalListeners._updateStudentContextAndPrompt();
                // Highlight the entire style controls card for broader context
                UI.highlightSettingsElement('settings-controls-panel', {
                    tab: 'templates',
                    useParentFormGroup: false  // Target the card directly, not parent
                });
            }, 300);
        });

        // Bouton pour relancer le guide de bienvenue (dans le footer de la modale d'aide)
        const relaunchBtn = document.getElementById('relaunchWelcomeBtn');
        relaunchBtn?.addEventListener('click', (e) => {
            WelcomeManager.handleRelaunchWelcomeGuide(e);
        });

        // --- NEW: Help Provider Selector Logic ---
        const helpProviderRadios = document.querySelectorAll('input[name="helpProvider"]');
        const helpContainer = document.getElementById('helpProviderSelector');
        const helpGlider = helpContainer?.querySelector('.selector-glider');

        const updateHelpProviderUI = () => {
            const checked = document.querySelector('input[name="helpProvider"]:checked');
            if (!checked) return;

            // 1. Update Glider Position
            if (helpGlider && checked.nextElementSibling) {
                const label = checked.nextElementSibling;
                requestAnimationFrame(() => {
                    helpGlider.style.width = `${label.offsetWidth}px`;
                    helpGlider.style.left = `${label.offsetLeft}px`;
                });
            }

            // 2. Show/Hide Content
            const value = checked.value;
            const contentMap = {
                'mistral': 'helpContentMistral',
                'google': 'helpContentGoogle',
                'openrouter': 'helpContentOpenRouter'
            };

            const descMap = {
                'mistral': '<strong>Mistral AI</strong> est une solution française, performante et <strong>gratuite</strong> (1 milliard de tokens/mois).',
                'google': '<strong>Google Gemini</strong> est une alternative gratuite et très performante.',
                'openrouter': '<strong>OpenRouter</strong> est une passerelle unifiée donnant accès à tous les meilleurs modèles (DeepSeek, Claude, GPT-4…).'
            };

            const descEl = document.getElementById('helpProviderDesc');
            if (descEl && descMap[value]) descEl.innerHTML = descMap[value];

            const contents = document.querySelectorAll('.provider-help-content');
            contents.forEach(el => {
                if (el.id === contentMap[value]) {
                    el.style.display = 'block';
                    el.animate([
                        { opacity: 0, transform: 'translateY(5px)' },
                        { opacity: 1, transform: 'translateY(0)' }
                    ], {
                        duration: 300,
                        easing: 'ease-out',
                        fill: 'forwards'
                    });
                } else {
                    el.style.display = 'none';
                }
            });
        };

        if (helpProviderRadios.length > 0) {
            helpProviderRadios.forEach(radio => {
                radio.addEventListener('change', updateHelpProviderUI);
            });

            // Init on modal open or tab switch could be tricky, but we can init now 
            // and whenever the help tab is clicked.
            // A simple timeout helps ensure layout is computed if modal opens immediately
            setTimeout(updateHelpProviderUI, 200);

            // Re-calc glider when switching TABS inside help modal
            const helpTabs = document.querySelectorAll('.ui-tabs-btn');
            helpTabs.forEach(tab => {
                tab.addEventListener('click', () => {
                    if (tab.getAttribute('onclick')?.includes('help-apikey')) {
                        setTimeout(updateHelpProviderUI, 50);
                    }
                });
            });
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
        const closeBtnFooter = document.getElementById('closeDashboardFooterBtn');

        addClickListener(closeBtnHeader, () => ClassDashboardManager.closeDashboard());
        addClickListener(closeBtnFooter, () => ClassDashboardManager.closeDashboard());

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
                    FocusPanelManager.openByStudentId(studentId);
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
