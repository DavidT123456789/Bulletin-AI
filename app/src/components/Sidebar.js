import { Component } from '../core/Component.js';
import { bus } from '../core/EventBus.js';
import { DOMHelper } from '../utils/DOMHelper.js';
import { Utils } from '../utils/Utils.js';
import { appState } from '../state/State.js';
import { CONSTS } from '../config/Config.js';

export class Sidebar extends Component {
    constructor() {
        super('inputSection'); // The ID of the sidebar aside element
    }

    cacheDOM() {
        this.elements = {
            // Tabs
            singleStudentTab: document.getElementById('singleStudentTab'),
            massImportTab: document.getElementById('massImportTab'),

            // Panels
            singleStudentFormDiv: document.getElementById('singleStudentFormDiv'),
            massImportSection: document.getElementById('massImportSection'),

            // Actions Containers
            singleStudentActions: document.getElementById('singleStudentActions'),
            massImportActions: document.getElementById('massImportActions'),

            // Single Student Inputs
            loadStudentSelect: document.getElementById('loadStudentSelect'),
            nomInput: document.getElementById('nom'),
            prenomInput: document.getElementById('prenom'),
            singleStudentPeriodInputs: document.getElementById('singleStudentPeriodInputs'),
            negativeInstructions: document.getElementById('negativeInstructions'),
            micInputBtn: document.getElementById('micInputBtn'),
            brickDropdown: document.getElementById('brickDropdown'),

            // Mass Import Inputs
            massData: document.getElementById('massData'),
            importFileBtn: document.getElementById('importFileBtn'),
            loadSampleDataLink: document.getElementById('loadSampleDataLink'),
            clearImportBtn: document.getElementById('clearImportBtn'),
            importGenerateBtn: document.getElementById('importGenerateBtn'),
            cancelImportOutputBtn: document.getElementById('cancelImportOutputBtn'),
            massImportErrorActions: document.getElementById('massImportErrorActions'),

            // Single Student Buttons
            generateAppreciationBtn: document.getElementById('generateAppreciationBtn'),
            generateAndNextBtn: document.getElementById('generateAndNextBtn'),
            resetFormBtn: document.getElementById('resetFormBtn'),
            cancelEditBtn: document.getElementById('cancelEditBtn'),

            // Sidebar Toggle
            sidebarCloseBtn: document.getElementById('sidebarCloseBtn'),

            // File Input (hidden)
            fileInput: document.getElementById('fileInput') // Assuming it exists globally or I should find it
        };
    }

    bindEvents() {
        // Tab Switching - Mass Import now opens the wizard modal
        this.elements.singleStudentTab?.addEventListener('click', () => this.setInputMode(CONSTS.INPUT_MODE.SINGLE));
        this.elements.massImportTab?.addEventListener('click', async () => {
            const { ImportWizardManager } = await import('../managers/ImportWizardManager.js');
            ImportWizardManager.open();
        });

        // Mass Import Actions
        this.elements.importGenerateBtn?.addEventListener('click', () => bus.emit('mass-import-trigger'));
        this.elements.clearImportBtn?.addEventListener('click', () => this.handleClearImport());
        this.elements.loadSampleDataLink?.addEventListener('click', () => bus.emit('load-sample-data'));
        this.elements.cancelImportOutputBtn?.addEventListener('click', () => {
            // Import dynamique pour éviter la dépendance circulaire
            import('../managers/MassImportManager.js').then(({ MassImportManager }) => {
                MassImportManager.cancelImport();
            });
        });
        this.elements.importFileBtn?.addEventListener('click', () => bus.emit('trigger-file-input'));

        // Mass Data Input
        this.elements.massData?.addEventListener('input', Utils.debounce(() => {
            bus.emit('mass-data-changed', this.elements.massData.value);
        }, 300));

        this.elements.massData?.addEventListener('paste', () => {
            setTimeout(() => {
                bus.emit('mass-data-changed', this.elements.massData.value);
                this.elements.importGenerateBtn?.focus();
            }, 100);
        });

        // Premium Drop Zone Drag Events
        const dropZone = document.getElementById('dropZone');
        if (dropZone) {
            // Prevent default drag behaviors
            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
                dropZone.addEventListener(eventName, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                });
            });

            // Add dragging class for premium animation
            ['dragenter', 'dragover'].forEach(eventName => {
                dropZone.addEventListener(eventName, () => {
                    dropZone.classList.add('dragging');
                });
            });

            ['dragleave', 'drop'].forEach(eventName => {
                dropZone.addEventListener(eventName, () => {
                    dropZone.classList.remove('dragging');
                });
            });

            // Handle file drop
            dropZone.addEventListener('drop', (e) => {
                const files = e.dataTransfer.files;
                if (files.length > 0) {
                    bus.emit('file-dropped', files[0]);
                }
            });

            // Make entire drop zone clickable
            dropZone.addEventListener('click', (e) => {
                // Don't trigger if clicking on the button inside
                if (e.target.closest('button')) return;
                bus.emit('trigger-file-input');
            });
        }

        // Single Student Actions
        this.elements.generateAppreciationBtn?.addEventListener('click', () => {
            if (appState.currentEditingId) {
                bus.emit('update-single-appreciation');
            } else {
                bus.emit('generate-single-appreciation');
            }
        });

        this.elements.generateAndNextBtn?.addEventListener('click', () => bus.emit('generate-single-appreciation'));
        this.elements.resetFormBtn?.addEventListener('click', () => bus.emit('reset-form'));
        this.elements.cancelEditBtn?.addEventListener('click', () => bus.emit('reset-form'));

        this.elements.loadStudentSelect?.addEventListener('change', (e) => bus.emit('load-student', e.target.value));

        // Instructions & Mic
        this.setupInstructionField(this.elements.negativeInstructions, this.elements.brickDropdown);
        // micInputBtn listener is handled in setupSpeechRecognition


        // Sidebar Close
        this.elements.sidebarCloseBtn?.addEventListener('click', () => bus.emit('toggle-sidebar'));

        // Listen for external updates
        bus.on('app-state-loaded', () => this.render());
        bus.on('period-changed', () => this.updatePeriodInputs());

        // Initialize Speech Recognition
        this.setupSpeechRecognition();
    }

    setupInputListeners() {
        // This method is now largely redundant as bindEvents handles it, 
        // but we keep specific logic here if needed or merge it into bindEvents.
        // For now, bindEvents covers the button clicks.
        // We need to handle the specific logic for mass import preview updates here or in the event handler.
    }

    setupSpeechRecognition() {
        const micBtn = this.elements.micInputBtn;
        const textarea = this.elements.negativeInstructions;

        if (!micBtn || !textarea) return;

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            micBtn.style.display = 'none';
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.lang = 'fr-FR';
        recognition.continuous = false;
        recognition.interimResults = false;

        let isRecording = false;

        micBtn.addEventListener('click', () => {
            if (isRecording) {
                recognition.stop();
            } else {
                recognition.start();
            }
        });

        recognition.onstart = () => {
            isRecording = true;
            micBtn.classList.add('recording');
        };

        recognition.onend = () => {
            isRecording = false;
            micBtn.classList.remove('recording');
        };

        recognition.onresult = (event) => {
            // Get the last result only
            const lastResultIndex = event.resultIndex;
            const result = event.results[lastResultIndex];

            // Only process final results to avoid duplicates/stuttering
            if (result.isFinal) {
                const transcript = result[0].transcript;
                const currentVal = textarea.value;
                const prefix = currentVal.length > 0 && !/\s$/.test(currentVal) ? ' ' : '';
                textarea.value += prefix + transcript;
                textarea.dispatchEvent(new Event('input'));
                textarea.focus();
            }
        };

        recognition.onerror = (event) => {
            console.error("Erreur micro:", event.error);
            isRecording = false;
            micBtn.classList.remove('recording');
            bus.emit('notification', { message: "Erreur micro. Vérifiez les permissions.", type: 'error' });
        };
    }

    render() {
        this.updatePeriodInputs();
        this.setInputMode(appState.currentInputMode || CONSTS.INPUT_MODE.SINGLE, true);
    }

    setInputMode(mode, force = false) {
        if (!force && appState.currentInputMode === mode) return;

        appState.currentInputMode = mode;
        const isMass = mode === CONSTS.INPUT_MODE.MASS;

        if (this.elements.massImportSection) this.elements.massImportSection.style.display = isMass ? 'block' : 'none';
        if (this.elements.singleStudentFormDiv) this.elements.singleStudentFormDiv.style.display = isMass ? 'none' : 'block';

        if (this.elements.massImportActions) this.elements.massImportActions.style.display = isMass ? 'flex' : 'none';
        if (this.elements.singleStudentActions) this.elements.singleStudentActions.style.display = isMass ? 'none' : 'flex';

        if (this.elements.massImportTab) {
            this.elements.massImportTab.classList.toggle('active', isMass);
            this.elements.massImportTab.setAttribute('aria-selected', String(isMass));
        }
        if (this.elements.singleStudentTab) {
            this.elements.singleStudentTab.classList.toggle('active', !isMass);
            this.elements.singleStudentTab.setAttribute('aria-selected', String(!isMass));
        }

        if (!isMass) {
            bus.emit('reset-form');
            setTimeout(() => (this.elements.loadStudentSelect || this.elements.nomInput)?.focus(), 100);
        } else {
            setTimeout(() => this.elements.massData?.focus(), 100);
        }

        bus.emit('save-app-state');
    }

    handleClearImport() {
        if (this.elements.massData) {
            this.elements.massData.value = '';
            bus.emit('mass-data-changed', '');
            if (this.elements.massImportErrorActions) {
                DOMHelper.clear(this.elements.massImportErrorActions);
            }
        }
    }

    setupInstructionField(textarea, dropdown) {
        if (!textarea || !dropdown) return;
        // Assuming UI.showInstructionSuggestions is still needed or moved. 
        // For now, I'll emit an event or call a helper if I can't move it yet.
        // Ideally Sidebar should handle its own suggestions or delegate to a helper.
        textarea.addEventListener('focus', () => bus.emit('show-instruction-suggestions', { textarea, dropdown }));
        textarea.addEventListener('input', () => bus.emit('show-instruction-suggestions', { textarea, dropdown }));

        textarea.addEventListener('blur', (e) => {
            bus.emit('update-instruction-history', e.target.value);
            setTimeout(() => {
                if (!dropdown.matches(':hover')) {
                    dropdown.parentElement.classList.remove('show');
                }
            }, 200);
        });
    }

    updatePeriodInputs() {
        if (!this.elements.singleStudentPeriodInputs) return;

        const periods = Utils.getPeriods();
        if (!appState.currentPeriod) {
            appState.currentPeriod = periods[periods.length - 1];
        }

        const currentPeriodIndex = periods.indexOf(appState.currentPeriod);
        DOMHelper.clear(this.elements.singleStudentPeriodInputs);

        for (let i = 0; i <= currentPeriodIndex; i++) {
            const p = periods[i];
            const isCurrent = (i === currentPeriodIndex);
            let group;

            if (isCurrent) {
                const movementOptions = [`Nouveau ${p}`, `Départ ${p}`];
                const statusOptions = ["PPRE", "PAP", "ULIS", "Délégué"];

                const pillsContainer = DOMHelper.createElement('div', { className: 'status-pills-container' });
                [...movementOptions, ...statusOptions].forEach(opt => {
                    const id = `statut-${opt.replace(' ', '-')}`;
                    pillsContainer.appendChild(DOMHelper.createElement('input', { type: 'checkbox', id: id, name: 'statuses', value: opt }));
                    pillsContainer.appendChild(DOMHelper.createElement('label', { htmlFor: id }, [opt.split(' ')[0]]));
                });

                group = DOMHelper.createElement('div', { className: 'period-input-group' }, [
                    DOMHelper.createElement('h3', {}, [
                        DOMHelper.createElement('iconify-icon', { icon: 'solar:calendar-check-bold' }),
                        ` ${Utils.getPeriodLabel(p, true)} `,
                        DOMHelper.createElement('span', { className: 'detail-chip-small' }, ['(Période Actuelle)'])
                    ]),
                    DOMHelper.createElement('div', { className: 'form-row period-main-row' }, [
                        DOMHelper.createElement('div', { className: 'form-group current-grade-group' }, [
                            DOMHelper.createElement('label', { htmlFor: `moy${p}` }, [`Moyenne ${p}\u00A0:`]),
                            DOMHelper.createElement('input', { type: 'text', id: `moy${p}`, placeholder: '14.5' }),
                            DOMHelper.createElement('div', { className: 'error-message', id: `moy${p}Error` })
                        ]),
                        DOMHelper.createElement('div', { className: 'form-group' }, [
                            DOMHelper.createElement('label', {}, ['Statuts (optionnel)\u00A0:']),
                            pillsContainer
                        ])
                    ])
                ]);
            } else {
                group = DOMHelper.createElement('div', { className: 'period-input-group previous-period-group' }, [
                    DOMHelper.createElement('h4', {}, [
                        DOMHelper.createElement('iconify-icon', { icon: 'solar:history-bold' }),
                        ` ${Utils.getPeriodLabel(p, true)} `,
                        DOMHelper.createElement('span', { className: 'detail-chip-small' }, ['(Période précédente)'])
                    ]),
                    DOMHelper.createElement('div', { className: 'form-row' }, [
                        DOMHelper.createElement('div', { className: 'form-group previous-grade-group' }, [
                            DOMHelper.createElement('label', { htmlFor: `moy${p}` }, [`Moyenne ${p}\u00A0:`]),
                            DOMHelper.createElement('input', { type: 'text', id: `moy${p}`, placeholder: '14.5' }),
                            DOMHelper.createElement('div', { className: 'error-message', id: `moy${p}Error` })
                        ]),
                        DOMHelper.createElement('div', { className: 'form-group' }, [
                            DOMHelper.createElement('label', { htmlFor: `app${p}` }, [`Appréciation ${p}\u00A0:`]),
                            DOMHelper.createElement('textarea', { id: `app${p}`, className: 'period-app-textarea', rows: '1' })
                        ])
                    ])
                ]);
            }
            this.elements.singleStudentPeriodInputs.appendChild(group);
        }

        this.elements.singleStudentPeriodInputs.querySelectorAll('input[type="text"]').forEach(input =>
            input.addEventListener('input', () => Utils.validateGrade(input))
        );
    }
}
