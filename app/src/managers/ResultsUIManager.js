import { appState } from '../state/State.js';
import { DOM } from '../utils/DOM.js';
import { Utils } from '../utils/Utils.js';
import { StorageManager } from './StorageManager.js';
import { ListViewManager } from './ListViewManager.js';
import { ImportWizardManager } from './ImportWizardManager.js';
import { FocusPanelManager } from './FocusPanelManager.js';
import { FocusPanelStatus } from './FocusPanelStatus.js';
import { ClassManager } from './ClassManager.js';
import { ClassUIManager } from './ClassUIManager.js';
import { StudentDataManager } from './StudentDataManager.js';
import { MassImportManager } from './MassImportManager.js';
import { TrombinoscopeManager } from './TrombinoscopeManager.js';
import { StatsService } from '../services/StatsService.js';

let Am; // AppreciationsManager reference
let UI; // UI Manager reference

export const ResultsUIManager = {
    init(appreciationsManager, uiManager) {
        Am = appreciationsManager;
        UI = uiManager;

        // Listen for repair mismatch custom event
        document.addEventListener('repairMismatchClicked', () => this.repairMismatch());
    },

    repairMismatch() {
        const currentSystem = appState.periodSystem;
        const newSystem = currentSystem === 'semestres' ? 'trimestres' : 'semestres';
        const label = newSystem === 'semestres' ? 'Semestre' : 'Trimestre';

        const radio = document.querySelector(`input[name="periodSystemRadio"][value="${newSystem}"]`);
        if (radio) {
            radio.checked = true;
            radio.dispatchEvent(new Event('change'));
            UI.showNotification(`Système basculé en mode ${label}. Vos données sont de retour.`, 'success');
        }
    },

    renderResults(highlightId = null, highlightType = 'new') {
        if (document.activeElement?.contentEditable === 'true') return;
        const term = (appState.searchQuery || '').toLowerCase();

        const filter = appState.activeStatFilter;
        const activePeriod = appState.currentPeriod;

        // CORRECTIF: Toujours repartir de la liste complète (generatedResults) filtrée par la classe courante
        // Ne JAMAIS utiliser filteredResults comme source, sinon on perd les élèves masqués quand on retire un filtre.
        const currentClassId = appState.currentClassId;
        const hasAnyClasses = ClassManager.getAllClasses().length > 0;

        // Si aucune classe n'existe, sourceResults est vide (pas de mode legacy)
        let sourceResults = [];
        if (hasAnyClasses && currentClassId) {
            sourceResults = ClassManager.getStudentsForClass(currentClassId);
        } else if (!hasAnyClasses) {
            // Aucune classe : afficher état vide
            sourceResults = [];
        } else {
            // Classes existent mais pas de classe courante sélectionnée : mode legacy
            sourceResults = appState.generatedResults.filter(r => !r.classId);
        }

        const viewableResults = sourceResults
            .map(originalResult => {
                const sd = originalResult.studentData;
                if (Utils.isStudentDepartedBeforePeriod(originalResult, activePeriod)) {
                    return null;
                }

                const periodDataForView = sd.periods?.[activePeriod] || { grade: null, appreciation: '' };
                const gradeRaw = periodDataForView.grade;
                const gradeParsed = typeof gradeRaw === 'number' ? gradeRaw : parseFloat(String(gradeRaw || '').replace(',', '.'));
                const isPlaceholder = !periodDataForView.appreciation && isNaN(gradeParsed) && !originalResult.errorMessage;

                return {
                    ...originalResult,
                    appreciation: periodDataForView.appreciation,
                    aiGenerationPeriod: originalResult.studentData.currentPeriod,
                    isPlaceholderForPeriod: isPlaceholder,
                    studentData: {
                        ...originalResult.studentData,
                        currentPeriod: activePeriod
                    }
                };
            }).filter(Boolean);

        let minGrade = Infinity;
        let maxGrade = -Infinity;
        if (filter === 'minGrade' || filter === 'maxGrade') {
            viewableResults.forEach(r => {
                const grade = StatsService.parseGrade(r.studentData.periods[activePeriod]?.grade);
                if (!isNaN(grade)) {
                    minGrade = Math.min(minGrade, grade);
                    maxGrade = Math.max(maxGrade, grade);
                }
            });
        }

        const currentClass = ClassManager.getCurrentClass();
        const currentClassName = currentClass?.name || Utils.getCurrentClassName();

        const filteredAndSorted = Utils.sortResults(
            viewableResults.filter(r => {
                if (!Utils.matchesStudent(r, term, { includeAppreciation: true, currentClassName })) return false;
                if (!filter) return true;
                if (filter === 'totalCount') return true;

                if (filter === 'minGrade') {
                    const grade = StatsService.parseGrade(r.studentData.periods[activePeriod]?.grade);
                    return !isNaN(grade) && grade === minGrade;
                }
                if (filter === 'maxGrade') {
                    const grade = StatsService.parseGrade(r.studentData.periods[activePeriod]?.grade);
                    return !isNaN(grade) && grade === maxGrade;
                }

                if (filter === 'newCount') return Utils.isStudentNew(r, activePeriod);
                if (filter === 'departedCount') return Utils.isStudentDeparted(r, activePeriod);

                // Calculer l'évolution dynamique via StatsService pour correspondre à 100% aux compteurs statistiques
                const periods = Utils.getPeriods();
                const activePeriodIndex = periods.indexOf(activePeriod);
                const previousPeriod = activePeriodIndex > 0 ? periods[activePeriodIndex - 1] : null;
                let evoCategory = null;
                if (previousPeriod) {
                    const diff = StatsService.computeEvolutionDiff(
                        r.studentData?.periods?.[activePeriod]?.grade,
                        r.studentData?.periods?.[previousPeriod]?.grade
                    );
                    evoCategory = StatsService.classifyEvolutionCategory(diff);
                }

                if (filter === 'progressCount') return evoCategory === 'progress';
                if (filter === 'stableCount') return evoCategory === 'stable';
                if (filter === 'regressionCount') return evoCategory === 'regression';

                // Filtrage par tranche de notes (histogramme)
                if (filter.startsWith('gradeRange_')) {
                    const range = filter.replace('gradeRange_', '');
                    const [min, max] = range.split('-').map(Number);
                    const grade = StatsService.parseGrade(r.studentData.periods[activePeriod]?.grade);
                    if (isNaN(grade)) return false;
                    // Inclusif sur min, exclusif sur max (sauf pour 16-20 qui est inclusif sur 20)
                    if (max === 20) {
                        return grade >= min && grade <= max;
                    }
                    return grade >= min && grade < max;
                }

                // Dashboard badge filters
                if (filter === 'generated') {
                    // Has valid appreciation for current period (not placeholder)
                    return !Utils.isPlaceholderAppreciation(Utils.getPeriodAppreciation(r, activePeriod)) && !r.errorMessage;
                }

                if (filter === 'error') {
                    return !!(r.errorMessage && r.errorPeriod === activePeriod);
                }

                if (filter === 'pending') {
                    return Utils.isPendingForPeriod(r, activePeriod);
                }

                return false;
            }),
            appState.sortState,
            activePeriod
        );

        appState.filteredResults = filteredAndSorted;

        // --- PERIOD MISMATCH DETECTION ---
        // Only flag a mismatch when data exists in the OTHER period system (semestre↔trimestre),
        // NOT when data is in a different period of the SAME system (e.g. S1 when viewing S2).
        const currentSystemPeriods = Utils.getPeriods(); // e.g. ['S1','S2'] or ['T1','T2','T3']
        let hasDataInCurrentSystem = false;
        let hasDataInOtherSystem = false;

        if (sourceResults.length > 0) {
            for (const r of sourceResults) {
                const periods = r.studentData?.periods || {};

                for (const [p, data] of Object.entries(periods)) {
                    const gradeRaw = data?.grade;
                    const gradeParsed = typeof gradeRaw === 'number' ? gradeRaw : parseFloat(String(gradeRaw || '').replace(',', '.'));
                    const hasDataInPeriod = data && ((!isNaN(gradeParsed)) || (data.appreciation && data.appreciation.replace(/<[^>]*>/g, '').trim() !== ''));
                    if (hasDataInPeriod) {
                        if (currentSystemPeriods.includes(p)) hasDataInCurrentSystem = true;
                        else hasDataInOtherSystem = true;
                    }
                }

                if (hasDataInCurrentSystem) break;
            }
        }

        const isPeriodMismatch = !hasDataInCurrentSystem && hasDataInOtherSystem;

        // Handle period mismatch banner injection
        let bannerContainer = document.getElementById('period-mismatch-container');
        if (!bannerContainer && DOM.resultsDiv?.parentNode) {
            bannerContainer = document.createElement('div');
            bannerContainer.id = 'period-mismatch-container';
            DOM.resultsDiv.parentNode.insertBefore(bannerContainer, DOM.resultsDiv);
        }

        if (isPeriodMismatch && bannerContainer) {
            const alternateSystem = appState.periodSystem === 'semestres' ? 'trimestriel' : 'semestriel';
            bannerContainer.innerHTML = `
                <div class="period-mismatch-banner">
                    <div class="period-mismatch-content">
                        <div class="period-mismatch-icon">
                            <iconify-icon icon="solar:folder-error-linear"></iconify-icon>
                        </div>
                        <div class="period-mismatch-text">
                            <h4>Aucune donnée pour cette période</h4>
                            <p>Le système <strong>${appState.periodSystem}</strong> est actif mais vos saisies semblent avoir été faites dans le système ${alternateSystem}.</p>
                        </div>
                    </div>
                    <div class="period-mismatch-action">
                        <button class="btn btn-primary" onclick="document.dispatchEvent(new CustomEvent('repairMismatchClicked'))">
                            <iconify-icon icon="solar:refresh-square-linear"></iconify-icon> Récupérer mes données
                        </button>
                    </div>
                </div>
            `;
            bannerContainer.style.display = 'block';
        } else if (bannerContainer) {
            bannerContainer.style.display = 'none';
        }

        // Afficher l'état vide si la classe courante n'a pas de résultats
        if (sourceResults.length === 0) {
            if (DOM.resultsDiv) DOM.resultsDiv.innerHTML = '';

            const emptyTemplate = document.getElementById('empty-state-template');
            if (emptyTemplate && DOM.emptyStateCard) {
                const existingHub = DOM.emptyStateCard.querySelector('.empty-state-hub');
                if (!existingHub) {
                    DOM.emptyStateCard.innerHTML = '';
                    DOM.emptyStateCard.appendChild(emptyTemplate.content.cloneNode(true));
                    this._bindEmptyStateHubEvents(DOM.emptyStateCard);
                    this._bindEmptyStateClassInput(DOM.emptyStateCard);
                }

                const currentClass = ClassManager.getCurrentClass();
                const subtitle = DOM.emptyStateCard.querySelector('.empty-state-subtitle') || DOM.emptyStateCard.querySelector('p');
                if (subtitle) {
                    subtitle.textContent = 'Comment souhaitez-vous ajouter vos élèves ?';
                }

                // Synchroniser la valeur de l'input si non focalisé par l'utilisateur
                const classInput = DOM.emptyStateCard.querySelector('#emptyStateClassInput');
                if (classInput && document.activeElement !== classInput) {
                    classInput.value = currentClass?.name || 'Nouvelle classe';
                    this._autoSizeClassInput(classInput);
                }

                // Afficher la 4e carte « Mes classes » si d'autres classes contiennent déjà des élèves
                const hasOtherStudents = ClassManager.hasStudentsInOtherClasses(appState.currentClassId);
                const hubGrid = DOM.emptyStateCard.querySelector('.empty-state-hub');
                const existingCard = DOM.emptyStateCard.querySelector('.empty-state-hub-card[data-action="existing"]');
                if (existingCard) {
                    existingCard.style.display = hasOtherStudents ? '' : 'none';
                }
                if (hubGrid) {
                    hubGrid.classList.toggle('has-existing-card', Boolean(hasOtherStudents && existingCard));
                }
            }
            if (DOM.emptyStateCard) DOM.emptyStateCard.style.display = 'flex';
            if (DOM.noResultsMessage) DOM.noResultsMessage.style.display = 'none';

            // Masquer les statistiques et dots quand il n'y a pas de données
            if (DOM.statsContainer) DOM.statsContainer.style.display = 'none';
            const statsPagination = document.getElementById('statsPagination');
            if (statsPagination) statsPagination.style.display = 'none';
        }
        else {
            const importReveal = ListViewManager.getPendingImportReveal();
            const statsWereHidden = DOM.statsContainer?.style.display === 'none';

            if (DOM.emptyStateCard) DOM.emptyStateCard.style.display = 'none';
            if (DOM.noResultsMessage) DOM.noResultsMessage.style.display = 'none';

            if (DOM.statsContainer) {
                DOM.statsContainer.style.display = '';
                if (importReveal && statsWereHidden) {
                    this._animateStatsEntrance(DOM.statsContainer, importReveal.startDelay);
                }
            }
            const statsPagination = document.getElementById('statsPagination');
            if (statsPagination) statsPagination.style.display = '';

            ListViewManager.render(filteredAndSorted, DOM.resultsDiv);
        }
        if (highlightId && highlightType === 'new') {
            if (this._highlightRowTimer) {
                clearTimeout(this._highlightRowTimer);
                this._highlightRowTimer = null;
            }
            if (this._highlightCleanupTimer) {
                clearTimeout(this._highlightCleanupTimer);
                this._highlightCleanupTimer = null;
            }
            // Liste + Focus: Cibler la ligne du tableau
            const row = document.querySelector(`.student-row[data-student-id="${highlightId}"]`);
            if (row) {
                this._highlightRowTimer = setTimeout(() => {
                    this._highlightRowTimer = null;
                    const targetRow = row.isConnected
                        ? row
                        : document.querySelector(`.student-row[data-student-id="${highlightId}"]`);
                    if (!targetRow) return;
                    targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    targetRow.classList.remove('row-animate-in', 'focus-closed-flash', 'highlight-new');
                    targetRow.style.removeProperty('--row-delay');
                    void targetRow.offsetWidth;
                    targetRow.classList.add('highlight-new');
                    this._highlightCleanupTimer = setTimeout(() => {
                        this._highlightCleanupTimer = null;
                        targetRow.classList.remove('highlight-new');
                    }, 2200);
                }, 100);
            }
        }
        UI?.updateStats?.(); UI?.updateControlButtons?.(); UI?.updateAIButtonsState?.(); StorageManager.saveAppState();
        UI?.updateActiveFilterInfo?.();
        UI?.updateHeaderContext?.();

        // Mettre à jour le bouton d'action Générer/Régénérer (inclut UI.initTooltips)
        this.updateGenerateButtonState(sourceResults);
    },

    /**
     * Anime l'entrée progressive des cartes statistiques lors d'un import qui fait sortir de l'Empty State
     * @param {HTMLElement} statsContainer
     * @param {number} [startDelay=0] - Délai avant la première carte (ms)
     * @private
     */
    _animateStatsEntrance(statsContainer, startDelay = 0) {
        if (!statsContainer) return;
        const cards = statsContainer.querySelectorAll('.stat-card');
        if (!cards.length) return;

        if (this._statsEntranceTimer) {
            clearTimeout(this._statsEntranceTimer);
        }

        const baseDelay = Math.min(startDelay, 20);
        const cardStagger = 55;
        cards.forEach((card, index) => {
            card.classList.remove('stat-card-animate-in');
            card.style.setProperty('--stat-delay', `${baseDelay + index * cardStagger}ms`);
            void card.offsetWidth;
            card.classList.add('stat-card-animate-in');
        });

        this._statsEntranceTimer = setTimeout(() => {
            this._statsEntranceTimer = null;
            cards.forEach(card => {
                card.classList.remove('stat-card-animate-in');
                card.style.removeProperty('--stat-delay');
            });
        }, baseDelay + (cards.length - 1) * cardStagger + 480);
    },

    /**
     * Updates the Generate and Update button states based on list content
     * - Generate button: only for pending (empty) appreciations
     * - Update button: for dirty (modified data) OR error appreciations
     * @param {Array} results - The results to analyze (hint only, always uses generatedResults for dirty check)
     */
    updateGenerateButtonState(results) {
        const currentPeriod = appState.currentPeriod;
        const currentClassId = appState.currentClassId;

        const sourceResults = ClassManager.getStudentsForClass(currentClassId);

        // Count pending (empty/placeholder)
        const pendingCount = sourceResults.filter(r => Utils.isPendingForPeriod(r, currentPeriod)).length;

        // Count needs update (error OR untouched AI text with modified data)
        let errorUpdateCount = 0;
        let dirtyUpdateCount = 0;
        
        sourceResults.forEach(r => {
            if (!FocusPanelStatus.isBulkRefreshable(r, currentPeriod)) return;
            if (r.errorMessage && r.errorPeriod === currentPeriod) {
                errorUpdateCount++;
            } else {
                dirtyUpdateCount++;
            }
        });
        
        const needsUpdateCount = errorUpdateCount + dirtyUpdateCount;

        const isGenerating = MassImportManager.massImportAbortController !== null;
        const isOllama = (appState.currentAIModel || '').startsWith('ollama');
        const isOfflineCloud = !navigator.onLine && !isOllama;

        // === GENERATE BUTTON ===
        const generateBtn = document.getElementById('generateBtnInline');
        if (generateBtn) {
            const badge = generateBtn.querySelector('.smart-action-badge');
            const wasHidden = generateBtn.style.display === 'none';

            generateBtn.style.display = pendingCount > 0 ? 'inline-flex' : 'none';

            if (pendingCount > 0) {
                if (badge) badge.textContent = pendingCount;
                const periodLabel = Utils.getPeriodLabel(appState.currentPeriod, false);
                generateBtn.dataset.tooltip = isOfflineCloud
                    ? "Connexion Internet requise pour générer avec l'IA"
                    : `Générer ${pendingCount} appréciation${pendingCount > 1 ? 's' : ''} en attente (${periodLabel})`;

                if (wasHidden) {
                    generateBtn.classList.add('animate-in');
                    setTimeout(() => generateBtn.classList.remove('animate-in'), 350);
                }
            }

            if (isGenerating && appState.activeMassAction === 'generate') {
                generateBtn.classList.add('loading');
                generateBtn.classList.remove('disabled');
                generateBtn.disabled = false;
                generateBtn.dataset.tooltip = 'Cliquer pour annuler la génération';
            } else if (isGenerating) {
                generateBtn.classList.remove('loading');
                generateBtn.classList.add('disabled');
                generateBtn.disabled = false;
            } else {
                generateBtn.classList.remove('loading', 'disabled');
                generateBtn.disabled = false;
            }
            if (generateBtn.dataset.tooltip) {
                UI?.updateTooltip?.(generateBtn, generateBtn.dataset.tooltip);
            }
        }

        // === UPDATE BUTTON ===
        const updateBtn = document.getElementById('updateBtnInline');
        if (updateBtn) {
            const badge = updateBtn.querySelector('.smart-action-badge');
            const wasHidden = updateBtn.style.display === 'none';

            updateBtn.style.display = needsUpdateCount > 0 ? 'inline-flex' : 'none';

            if (needsUpdateCount > 0) {
                if (badge) badge.textContent = needsUpdateCount;

                const periodLabel = Utils.getPeriodLabel(appState.currentPeriod, false);
                let tooltipText = '';
                if (isOfflineCloud) {
                    tooltipText = "Connexion Internet requise pour actualiser avec l'IA";
                } else if (errorUpdateCount > 0 && dirtyUpdateCount > 0) {
                    tooltipText = `Actualiser ${dirtyUpdateCount} modifiée${dirtyUpdateCount > 1 ? 's' : ''} et ${errorUpdateCount} en erreur (${periodLabel})`;
                } else if (errorUpdateCount > 0) {
                    tooltipText = `Régénérer ${errorUpdateCount} appréciation${errorUpdateCount > 1 ? 's' : ''} en erreur (${periodLabel})`;
                } else {
                    tooltipText = `Actualiser ${dirtyUpdateCount} appréciation${dirtyUpdateCount > 1 ? 's' : ''} modifiée${dirtyUpdateCount > 1 ? 's' : ''} (${periodLabel})`;
                }
                updateBtn.dataset.tooltip = tooltipText;

                if (wasHidden) {
                    updateBtn.classList.add('animate-in');
                    setTimeout(() => updateBtn.classList.remove('animate-in'), 350);
                }
            }

            if (isGenerating && appState.activeMassAction === 'update') {
                updateBtn.classList.add('loading');
                updateBtn.classList.remove('disabled');
                updateBtn.disabled = false;
                updateBtn.dataset.tooltip = "Cliquer pour annuler l'actualisation";
            } else if (isGenerating) {
                updateBtn.classList.remove('loading');
                updateBtn.classList.add('disabled');
                updateBtn.disabled = false;
            } else {
                updateBtn.classList.remove('loading', 'disabled');
                updateBtn.disabled = false;
            }
            if (updateBtn.dataset.tooltip) {
                UI?.updateTooltip?.(updateBtn, updateBtn.dataset.tooltip);
            }
        }

        // === SEATING CHART VIEW TOGGLE ===
        const viewToggle = document.getElementById('viewToggle');
        if (viewToggle) viewToggle.classList.toggle('visible', sourceResults.length > 0);

        // === HEADER GENERATE CHIP (idle-pending state) + Reinitialize tooltips ===
        UI?.updateDashboardCounts?.();
        // Avoid full Tippy destroy/recreate during incremental batch countdown so active cancel tooltips never flicker
        if ((!isGenerating || results !== undefined) && UI?.initTooltips) {
            UI.initTooltips();
        }
    },

    /**
     * Bind events on the inline hub cards in empty state
     * @param {HTMLElement} container - The empty state container
     * @private
     */
    _bindEmptyStateHubEvents(container) {
        const hubCards = container.querySelectorAll('.empty-state-hub-card');

        const hubActions = {
            individual: () => FocusPanelManager.openNew(),
            mass: () => ImportWizardManager.open(),
            photos: () => TrombinoscopeManager.open(),
            existing: () => ClassUIManager.showPickExistingStudentsModal()
        };

        hubCards.forEach(card => {
            card.addEventListener('click', () => {
                container.querySelector('#emptyStateClassInput')?.blur();
                hubActions[card.dataset.action]?.();
            });

            // Keyboard support
            card.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    card.click();
                }
            });
        });
    },

    /**
     * Ajuste la largeur du champ de saisie selon la longueur du nom
     * @param {HTMLInputElement} input
     * @private
     */
    _autoSizeClassInput(input) {
        if (!input) return;
        if (typeof CSS !== 'undefined' && CSS.supports?.('field-sizing', 'content')) {
            input.style.removeProperty('width');
            return;
        }
        const len = Math.max((input.value || input.placeholder || '').length, 4);
        input.style.width = `${Math.min(Math.max(Math.ceil(len * 0.85) + 1, 5), 36)}ch`;
    },

    /**
     * Attache les écouteurs sur le champ de renommage in-situ de l'Empty State
     * @param {HTMLElement} container
     * @private
     */
    _bindEmptyStateClassInput(container) {
        const input = container.querySelector('#emptyStateClassInput');
        const editBtn = container.querySelector('#emptyStateEditBtn');
        const pill = input?.closest('.empty-state-class-pill');
        if (!input) return;

        let wasFocusedOnPointerDown = false;

        input.addEventListener('mousedown', () => {
            wasFocusedOnPointerDown = (document.activeElement === input);
        });

        input.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!wasFocusedOnPointerDown) {
                input.select();
                wasFocusedOnPointerDown = true;
            }
        });

        const focusAndSelectInput = (e) => {
            if (e.target !== input) {
                e.stopPropagation();
                input.focus();
                input.select();
                wasFocusedOnPointerDown = true;
            }
        };

        pill?.addEventListener('click', focusAndSelectInput);
        editBtn?.addEventListener('click', focusAndSelectInput);

        input.addEventListener('input', () => {
            this._autoSizeClassInput(input);
            // Synchronisation en direct dans l'en-tête (Live Sync)
            const currentClass = ClassManager.getCurrentClass();
            const trimmed = input.value.trim();
            if (DOM.headerClassName) {
                DOM.headerClassName.textContent = Utils.formatClassDisplayName(trimmed || currentClass?.name || 'Nouvelle classe');
            }
        });

        const resetToCurrentName = () => {
            const currentClass = ClassManager.getCurrentClass();
            input.value = currentClass?.name || 'Nouvelle classe';
            this._autoSizeClassInput(input);
            if (DOM.headerClassName) {
                DOM.headerClassName.textContent = Utils.formatClassDisplayName(input.value);
            }
        };

        let isSaving = false;
        let escaping = false;

        const saveClassName = () => {
            if (isSaving) return;
            const currentClass = ClassManager.getCurrentClass();
            if (!currentClass) return;

            const trimmedName = input.value.trim();
            if (!trimmedName) {
                resetToCurrentName();
                return;
            }

            if (trimmedName !== currentClass.name) {
                isSaving = true;
                try {
                    ClassManager.updateClass(currentClass.id, { name: trimmedName });
                    ClassUIManager?.updateHeaderDisplay?.();
                    ClassUIManager?.renderClassList?.();

                    if (pill) {
                        pill.classList.add('saved');
                        setTimeout(() => pill.classList.remove('saved'), 500);
                    }
                } finally {
                    isSaving = false;
                }
            }
        };

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveClassName();
                input.blur();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                escaping = true;
                resetToCurrentName();
                input.blur();
            }
        });

        input.addEventListener('blur', () => {
            wasFocusedOnPointerDown = false;
            if (escaping) {
                escaping = false;
                return;
            }
            saveClassName();
        });
    },

    /**
     * Regenerates appreciations in error and untouched AI appreciations whose data changed
     * Used by the "Actualiser" button
     */
    async regenerateDirty() {
        if (!navigator.onLine && !(appState.currentAIModel || '').startsWith('ollama')) {
            UI?.showNotification("Mode hors-ligne : connexion Internet requise pour actualiser avec l'IA.", "warning");
            return;
        }
        const currentPeriod = appState.currentPeriod;
        const currentClassId = appState.currentClassId;

        const sourceResults = ClassManager.getStudentsForClass(currentClassId);

        // Teacher-written, edited or imported texts are never overwritten, sorted by current visual order
        const toRegen = Utils.sortResults(sourceResults.filter(r => FocusPanelStatus.isBulkRefreshable(r, currentPeriod)));

        if (toRegen.length === 0) {
            UI.showNotification("Aucune appréciation à actualiser.", "warning");
            return;
        }

        const errorCount = toRegen.filter(r => r.errorMessage && r.errorPeriod === currentPeriod).length;
        const dirtyCount = toRegen.length - errorCount;

        let dirtyTitle = `Actualiser ${toRegen.length} appréciation${toRegen.length > 1 ? 's' : ''} ?`;
        if (errorCount > 0 && dirtyCount > 0) {
            dirtyTitle = `Actualiser ${dirtyCount} modifiée${dirtyCount > 1 ? 's' : ''} + ${errorCount} en erreur ?`;
        } else if (errorCount > 0) {
            dirtyTitle = `Corriger ${errorCount} erreur${errorCount > 1 ? 's' : ''} ?`;
        } else {
            dirtyTitle = `Actualiser ${dirtyCount} appréciation${dirtyCount > 1 ? 's' : ''} ?`;
        }

        UI.showCustomConfirm('Les appréciations concernées seront régénérées avec les données actuelles.', async () => {
            if (MassImportManager.massImportAbortController) {
                MassImportManager.massImportAbortController.abort();
            }
            appState.activeMassAction = 'update';
            MassImportManager.massImportAbortController = new AbortController();
            const signal = MassImportManager.massImportAbortController.signal;

            let successCount = 0;
            let newErrorCount = 0;
            let wasAborted = false;
            const total = toRegen.length;

            // Afficher "En file" sur toutes les lignes concernées
            toRegen.forEach(resultToRegen => {
                ListViewManager.setRowStatus(resultToRegen.id, 'pending-skeleton');
            });

            for (let i = 0; i < total; i++) {
                if (signal.aborted) {
                    wasAborted = true;
                    break;
                }

                const resultToRegen = toRegen[i];
                const studentName = `${resultToRegen.prenom || ''} ${resultToRegen.nom || ''}`.trim();

                UI.showHeaderProgress(i + 1, total, studentName);

                let nextResult = null;
                let isSuccess = false;

                try {
                    ListViewManager.setRowStatus(resultToRegen.id, 'generating');

                    const updatedStudentData = Utils.deepClone(resultToRegen.studentData);
                    updatedStudentData.id = resultToRegen.id;
                    updatedStudentData.classId = resultToRegen.classId ?? currentClassId;
                    updatedStudentData.currentPeriod = currentPeriod;
                    updatedStudentData.subject = appState.useSubjectPersonalization ? appState.currentSubject : 'Générique';
                    updatedStudentData.currentAIModel = appState.currentAIModel;

                    nextResult = await Am.generateAppreciation(updatedStudentData, false, null, signal);
                    nextResult.classId = resultToRegen.classId ?? currentClassId;
                    nextResult.generationPeriod = currentPeriod;
                    isSuccess = true;
                } catch (e) {
                    if (e.name === 'AbortError' || signal.aborted) {
                        wasAborted = true;
                        break;
                    }

                    newErrorCount++;
                    const msg = Utils.translateErrorMessage(e.message);
                    nextResult = Am.createResultObject(
                        resultToRegen.nom,
                        resultToRegen.prenom,
                        resultToRegen.appreciation || '',
                        resultToRegen.evolutions,
                        { ...resultToRegen.studentData, currentPeriod },
                        {},
                        {},
                        `Erreur IA : ${msg}.`
                    );
                    nextResult.classId = resultToRegen.classId ?? currentClassId;
                }

                const resultIndex = appState.generatedResults.findIndex(r => r.id === resultToRegen.id);
                if (resultIndex > -1 && nextResult) {
                    const updatedResult = StudentDataManager.updateResult(
                        appState.generatedResults[resultIndex],
                        nextResult
                    );

                    const filteredIndex = appState.filteredResults.findIndex(r => r.id === resultToRegen.id);
                    if (filteredIndex > -1) {
                        appState.filteredResults[filteredIndex] = updatedResult;
                    }

                    this.updateGenerateButtonState();

                    if (isSuccess) {
                        successCount++;
                        await ListViewManager.updateRow(updatedResult.id, updatedResult, true);
                    } else {
                        ListViewManager.updateRow(updatedResult.id, updatedResult, false);
                    }
                }
            }

            appState.activeMassAction = null;
            MassImportManager.massImportAbortController = null;
            UI.hideHeaderProgress(newErrorCount > 0 || wasAborted);

            if (wasAborted) {
                const abortMsg = successCount > 0
                    ? `Actualisation interrompue (${successCount}/${total} actualisée${successCount > 1 ? 's' : ''}).`
                    : 'Actualisation annulée.';
                UI.showNotification(abortMsg, 'info');
                this.renderResults();
            } else {
                UI.showNotification(`${successCount}/${total} actualisée(s) avec succès.`, "success");
                if (successCount > 0) UI?.recordSupportMilestone?.('batch-complete');
            }
            StorageManager.saveAppState();
            UI.updateStats();
            UI.updateControlButtons();

            // CRITICAL FIX: Update button state after regeneration completes
            // This ensures the "Actualiser" button disappears when no more dirty appreciations exist
            this.updateGenerateButtonState();
        }, null, { title: dirtyTitle, isDanger: false });
    },

    clearAllResults() {
        const visibleIds = new Set(appState.filteredResults.map(r => r.id));
        const count = visibleIds.size;

        if (count === 0) {
            UI.showNotification("Aucun résultat visible à effacer.", "warning");
            return;
        }

        const confirmFn = UI.showCustomConfirm
            ? (msg, onConfirm, onCancel, opts) => UI.showCustomConfirm(msg, onConfirm, onCancel, opts)
            : (msg, onConfirm, _onCancel, opts) => UI.showConfirmModal?.(opts?.title || 'Confirmation', msg, onConfirm);

        confirmFn(
            'Cette action est irréversible et supprimera toutes leurs données. Pour ne vider que les textes générés, utilisez « Effacer les appréciations ».',
            async () => {
                const removedIds = Array.from(visibleIds);
                const deleteTasks = removedIds.map(id => StudentDataManager.deleteStudent(id));
                StorageManager._saveQueue = Promise.all([
                    (StorageManager._saveQueue || Promise.resolve()).catch(() => {}),
                    ...deleteTasks
                ]).then(() => {});

                this.renderResults();
                await Promise.all(deleteTasks);
                await StorageManager.saveAppState();
                UI.showNotification(`${count} élèves ont été supprimés.`, 'success');
            },
            null,
            {
                title: `Supprimer ${count} élève${count > 1 ? 's' : ''} ?`,
                confirmText: 'Tout supprimer',
                isDanger: true
            }
        );
    },

};
