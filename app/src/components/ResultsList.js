import { Component } from '../core/Component.js';
import { bus } from '../core/EventBus.js';
import { DOMHelper } from '../utils/DOMHelper.js';
import { Utils } from '../utils/Utils.js';
import { appState } from '../state/State.js';
import { CONSTS, DEFAULT_IA_CONFIG, CONFIG } from '../config/Config.js';

export class ResultsList extends Component {
    constructor() {
        super('outputSection');
    }

    cacheDOM() {
        this.elements = {
            statsContainer: document.getElementById('statsContainer'),
            outputList: document.getElementById('outputList'),
            searchInput: document.getElementById('searchInput'),
            sortSelect: document.getElementById('sortSelect'),
            actionsBtnToggle: document.getElementById('actionsBtnToggle'),
            actionsDropdown: document.querySelector('.actions-dropdown-content'), // Assuming structure


            // Global Actions
            copyAllBtn: document.getElementById('copyAllBtn-shortcut'),
            regenerateAllBtn: document.getElementById('regenerateAllBtn'),
            clearAllResultsBtn: document.getElementById('clearAllResultsBtn-shortcut'),
            exportJsonBtn: document.getElementById('exportJsonBtn'),
            exportCsvBtn: document.getElementById('exportCsvBtn'),
            exportPdfBtn: document.getElementById('exportPdfBtn'),
            analyzeClassBtn: document.getElementById('analyzeClassBtn')
        };
    }

    bindEvents() {
        // Search & Sort
        this.elements.searchInput?.addEventListener('input', Utils.debounce(() => bus.emit('search-input', this.elements.searchInput.value), 300));
        this.elements.sortSelect?.addEventListener('change', () => bus.emit('sort-change', this.elements.sortSelect.value));

        // Toolbar Actions
        this.elements.actionsBtnToggle?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.elements.actionsDropdown?.parentElement.classList.toggle('show');
        });

        document.addEventListener('click', (e) => {
            if (this.elements.actionsDropdown && !this.elements.actionsDropdown.parentElement.contains(e.target)) {
                this.elements.actionsDropdown.parentElement.classList.remove('show');
            }
        });

        this.elements.copyAllBtn?.addEventListener('click', () => bus.emit('copy-all'));
        this.elements.regenerateAllBtn?.addEventListener('click', () => bus.emit('regenerate-all'));
        this.elements.clearAllResultsBtn?.addEventListener('click', () => bus.emit('clear-all'));
        this.elements.exportJsonBtn?.addEventListener('click', () => bus.emit('export-json'));
        this.elements.exportCsvBtn?.addEventListener('click', () => bus.emit('export-csv'));
        this.elements.exportPdfBtn?.addEventListener('click', () => bus.emit('export-pdf'));
        this.elements.analyzeClassBtn?.addEventListener('click', () => bus.emit('analyze-class'));

        // Card Actions (Delegation)
        this.addEvent('click', '[data-action]', (e, target) => {
            const action = target.dataset.action;
            const card = target.closest('.appreciation-result');
            const id = card?.dataset.id;

            if (!id && action !== 'open-help' && action !== 'toggle-favorite') return; // Some actions might not be on a card

            switch (action) {
                case 'copy': bus.emit('copy-single', id); break;
                case 'edit': bus.emit('edit-single', id); break;
                case 'regenerate': bus.emit('regenerate-single', id); break;
                case 'delete': bus.emit('delete-single', id); break;
                case 'details': bus.emit('show-details', id); break;
                case 'variations': bus.emit('show-variations', id); break;
                case 'undo-variation': bus.emit('undo-variation', id); break;
            }
        });

        // Listen for updates
        bus.on('render-results', (results) => this.renderResults(results));
        bus.on('render-skeletons', (count) => this.renderSkeletons(count));
        bus.on('update-stats', () => this.updateStats());
        bus.on('update-result-card', ({ id, options }) => {
            const result = appState.generatedResults.find(r => r.id === id);
            if (result) this.updateResultCard(id, result, options);
        });
        bus.on('add-result-card', (result) => this.addResultCard(result));
    }

    renderResults(results) {
        if (!this.elements.outputList) return;

        this.currentResults = results || [];
        this.renderedCount = 0;
        this.CHUNK_SIZE = 20;

        // Clear existing
        this.elements.outputList.innerHTML = '';

        if (this.currentResults.length === 0) {
            document.getElementById('noResultsMessage').style.display = 'block';
            document.getElementById('empty-state-card').style.display = 'block';
            return;
        }

        document.getElementById('noResultsMessage').style.display = 'none';
        document.getElementById('empty-state-card').style.display = 'none';

        this.renderNextChunk();
        this.setupInfiniteScroll();
    }

    setupInfiniteScroll() {
        if (this.observer) this.observer.disconnect();

        this.observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                this.renderNextChunk();
            }
        }, { root: null, rootMargin: '200px', threshold: 0.1 });

        // Create sentinel if not exists
        let sentinel = document.getElementById('scroll-sentinel');
        if (!sentinel) {
            sentinel = document.createElement('div');
            sentinel.id = 'scroll-sentinel';
            sentinel.style.height = '20px';
            sentinel.style.width = '100%';
            this.elements.outputList.parentNode.appendChild(sentinel);
        }
        this.observer.observe(sentinel);
    }

    renderNextChunk() {
        if (!this.currentResults || this.renderedCount >= this.currentResults.length) return;

        const nextBatch = this.currentResults.slice(this.renderedCount, this.renderedCount + this.CHUNK_SIZE);
        const fragment = document.createDocumentFragment();

        nextBatch.forEach(result => {
            const card = this.createResultCard(result);
            fragment.appendChild(card);
        });

        this.elements.outputList.appendChild(fragment);
        this.renderedCount += nextBatch.length;
        this.updateStats();
    }

    renderSkeletons(count = 3) {
        if (!this.elements.outputList) return;
        this.elements.outputList.innerHTML = '';
        document.getElementById('noResultsMessage').style.display = 'none';
        document.getElementById('empty-state-card').style.display = 'none';

        const fragment = document.createDocumentFragment();
        for (let i = 0; i < count; i++) {
            const skeleton = document.createElement('div');
            skeleton.className = 'skeleton-card';
            skeleton.innerHTML = `
                <div class="card-header">
                    <div class="skeleton skeleton-title"></div>
                    <div class="skeleton skeleton-badge"></div>
                </div>
                <div class="card-content-wrapper">
                    <div class="skeleton skeleton-text"></div>
                    <div class="skeleton skeleton-text"></div>
                    <div class="skeleton skeleton-text" style="width: 80%;"></div>
                </div>
            `;
            fragment.appendChild(skeleton);
        }
        this.elements.outputList.appendChild(fragment);
    }

    addResultCard(result) {
        if (!this.elements.outputList) return;

        const card = this.createResultCard(result);
        const skeleton = this.elements.outputList.querySelector('.skeleton-card');

        if (skeleton) {
            this.elements.outputList.replaceChild(card, skeleton);
        } else {
            this.elements.outputList.appendChild(card);
        }
        this.updateStats();
    }

    createResultCard(result) {
        const template = document.getElementById('student-result-template');
        if (!template) {
            console.error("Template 'student-result-template' not found!");
            return document.createElement('div'); // Fallback
        }

        const clone = template.content.cloneNode(true);
        const card = clone.querySelector('.appreciation-result');
        card.dataset.id = result.id;

        // Populate Name
        const nameEl = card.querySelector('[data-template="name"]');
        if (nameEl) nameEl.textContent = `${result.studentData.nom} ${result.studentData.prenom}`;

        // Populate Subject
        const subjectEl = card.querySelector('[data-template="subject"]');
        if (subjectEl) subjectEl.textContent = result.studentData.subject || 'Générique';

        // Populate Grades
        const gradesContainer = card.querySelector('[data-template="grades"]');
        if (gradesContainer) {
            const periods = Utils.getPeriods();
            periods.forEach(p => {
                const pData = result.studentData.periods[p];
                if (pData && pData.grade !== undefined && pData.grade !== null) {
                    const badge = document.createElement('span');
                    badge.className = 'grade-badge';
                    badge.textContent = Utils.formatLabel(p, pData.grade);
                    gradesContainer.appendChild(badge);
                }
            });
        }

        // Populate Appreciation
        const appText = card.querySelector('[data-template="appreciation"]');
        if (appText) {
            appText.textContent = result.appreciation;
            appText.contentEditable = 'true'; // Ensure it's editable as per previous logic

            // Auto-save on manual edit
            appText.addEventListener('blur', () => {
                bus.emit('manual-edit-appreciation', { id: result.id, text: appText.textContent });
            });
        }

        // Populate Word Count (only words, characters in tooltip)
        const wcChip = card.querySelector('[data-template="wordCount"]');
        if (wcChip) {
            const wordCount = Utils.countWords(result.appreciation);
            const charCount = Utils.countCharacters(result.appreciation);
            wcChip.textContent = `${wordCount} mot${wordCount > 1 ? 's' : ''}`;
            wcChip.dataset.tooltip = `${charCount} caractères`;
        }

        return card;
    }

    updateResultCard(id, result, options = {}) {
        const card = this.elements.outputList.querySelector(`.appreciation-result[data-id="${id}"]`);
        if (!card) return;

        const newCard = this.createResultCard(result);
        const newWrapper = newCard.querySelector('.card-content-wrapper');
        const oldWrapper = card.querySelector('.card-content-wrapper');

        if (oldWrapper && newWrapper) {
            card.replaceChild(newWrapper, oldWrapper);
        }

        if (options.animate) {
            newWrapper.classList.add('is-updating');
            newWrapper.addEventListener('animationend', () => newWrapper.classList.remove('is-updating'), { once: true });
        }
    }
}
