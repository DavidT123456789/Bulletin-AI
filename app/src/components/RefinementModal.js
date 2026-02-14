import { Component } from '../core/Component.js';
import { Utils } from '../utils/Utils.js';
import { bus } from '../core/EventBus.js';

export class RefinementModal extends Component {
    constructor() {
        super('refinementModal');
    }

    init() {
        this.cacheDOM();
        this.bindEvents();
    }

    cacheDOM() {
        super.cacheDOM();
        this.elements = {
            modal: document.getElementById('refinementModal'),
            title: document.getElementById('refinementModalTitle'),
            prevBtn: document.getElementById('prevRefinementStudentBtn'),
            nextBtn: document.getElementById('nextRefinementStudentBtn'),
            context: document.getElementById('refinementContext'),
            refineContextBtn: document.getElementById('refineWithContextBtn'),
            styleOptions: document.getElementById('refineStyleOptions'),
            errorActions: document.getElementById('refinement-error-actions'),
            originalCount: document.getElementById('originalWordCount'),
            resetBtn: document.getElementById('resetRefinementBtn'),
            originalText: document.getElementById('originalAppreciationText'),
            swapBtn: document.getElementById('swapRefinementBtn'),
            suggestedCount: document.getElementById('suggestedWordCount'),
            suggestedText: document.getElementById('suggestedAppreciationText'),
            cancelBtn: document.getElementById('cancelRefinementBtn'),
            applyBtn: document.getElementById('applyRefinedAppreciationBtn')
        };
    }

    bindEvents() {
        // Navigation buttons - attach directly to cached elements
        this.elements.prevBtn?.addEventListener('click', () => {
            if (this.currentId) bus.emit('navigate-refinement', { direction: 'prev', currentId: this.currentId });
        });

        this.elements.nextBtn?.addEventListener('click', () => {
            if (this.currentId) bus.emit('navigate-refinement', { direction: 'next', currentId: this.currentId });
        });

        // Close buttons
        document.getElementById('closeRefinementModalBtn')?.addEventListener('click', () => this.close());
        this.elements.cancelBtn?.addEventListener('click', () => this.close());

        // Action buttons
        this.elements.applyBtn?.addEventListener('click', () => {
            bus.emit('apply-refinement');
        });

        this.elements.refineContextBtn?.addEventListener('click', () => {
            bus.emit('refine-appreciation', { type: 'context', button: this.elements.refineContextBtn });
        });

        this.elements.swapBtn?.addEventListener('click', () => {
            bus.emit('accept-refinement');
        });

        this.elements.resetBtn?.addEventListener('click', () => {
            bus.emit('reset-refinement', this.currentId);
        });

        // Style options delegation
        if (this.elements.styleOptions) {
            this.elements.styleOptions.addEventListener('click', (e) => {
                const btn = e.target.closest('button[data-refine-type]');
                if (btn) {
                    bus.emit('refine-appreciation', { type: btn.dataset.refineType, button: btn });
                }
            });
        }

        // Copy buttons delegation
        this.root.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-action]');
            if (btn) {
                const action = btn.dataset.action;
                if (action === 'copy-original') bus.emit('copy-refinement-text', 'original');
                if (action === 'copy-suggested') bus.emit('copy-refinement-text', 'suggested');
            }
        });

        // Original text edit listener to update word count
        this.elements.originalText?.addEventListener('input', () => {
            bus.emit('original-text-changed', this.elements.originalText.textContent);
        });
    }

    open() {
        if (this.root) {
            this.root.style.display = 'flex'; // Refinement modal uses flex
            this.root.setAttribute('aria-hidden', 'false');
        }
    }

    close() {
        if (this.root) {
            this.root.style.display = 'none';
            this.root.setAttribute('aria-hidden', 'true');
        }
    }

    updateContent(result, editedData = null) {
        if (!result) return;
        this.currentId = result.id;

        this.elements.title.innerHTML = Utils.createModalTitleHTML(result, 'refine');

        const activePeriod = result.studentData.currentPeriod;
        const periodData = result.studentData.periods[activePeriod] || {};
        const appreciationForPeriod = periodData.appreciation; // Or result.appreciation? Usually result.appreciation is the current one.

        const textToShow = editedData ? editedData.originalText : (result.appreciation || appreciationForPeriod);
        this.elements.originalText.innerHTML = textToShow; // innerHTML for editable div

        if (editedData && editedData.context) {
            this.elements.context.value = editedData.context;
        } else {
            this.elements.context.value = '';
        }

        this.elements.suggestedText.innerHTML = '<div class="placeholder-text">Sélectionnez une option d\'amélioration ci-dessus...</div>';
        this.elements.suggestedText.classList.add('placeholder');

        // Reset buttons
        this.elements.styleOptions.querySelectorAll('button').forEach(b => b.classList.remove('active'));

        // Reset Apply/Swap buttons to default state
        this.elements.applyBtn.disabled = true;
        this.elements.applyBtn.innerHTML = '<iconify-icon icon="solar:disk-bold"></iconify-icon> Appliquer et fermer';
        this.elements.applyBtn.classList.remove('btn-success');
        this.elements.applyBtn.classList.add('btn-primary');

        const swapBtn = document.getElementById('swapRefinementBtn');
        if (swapBtn) {
            swapBtn.innerHTML = '<iconify-icon icon="solar:arrow-left-bold"></iconify-icon> Accepter';
            swapBtn.setAttribute('data-tooltip', 'Accepter cette suggestion et l\'éditer');
        }

        // Error actions
        const isOriginalAIGeneration = (activePeriod === result.studentData.currentPeriod);
        const regenBtnHTML = `<button class="btn btn-warning btn-small" data-action="regenerate" data-id="${result.id}">Régénérer l'original</button>`;
        this.elements.errorActions.innerHTML = result.errorMessage && isOriginalAIGeneration ? regenBtnHTML : '';
        this.elements.errorActions.style.display = result.errorMessage && isOriginalAIGeneration ? 'flex' : 'none';

        // Word counts
        // We need a utility or event to update word counts. 
        // For now, let's just trigger an input event or manually update if we have the utility.
        // Utils.countWords is available.
        this.updateWordCount('original', this.elements.originalText.textContent);
        this.updateWordCount('suggested', '');
    }

    updateWordCount(type, text) {
        const count = Utils.countWords(text);
        const label = `${count} mot${count > 1 ? 's' : ''}`;
        if (type === 'original') this.elements.originalCount.textContent = label;
        if (type === 'suggested') this.elements.suggestedCount.textContent = label;
    }
}
