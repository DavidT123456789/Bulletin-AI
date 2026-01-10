import { appState } from '../state/State.js';
import { DOM } from '../utils/DOM.js';
import { Utils } from '../utils/Utils.js';
// import { UI } from './UIManager.js'; // REMOVED to avoid circular dependency
import { StorageManager } from './StorageManager.js';
import { ListViewManager } from './ListViewManager.js';
import { ImportWizardManager } from './ImportWizardManager.js';
import { FocusPanelManager } from './FocusPanelManager.js';
import { ClassManager } from './ClassManager.js';

let Am; // AppreciationsManager reference
let UI; // UI Manager reference

export const ResultsUIManager = {
    init(appreciationsManager, uiManager) {
        Am = appreciationsManager;
        UI = uiManager;
    },

    renderResults(highlightId = null, highlightType = 'new') {
        if (document.activeElement?.contentEditable === 'true') return;
        const term = DOM.searchInput.value.toLowerCase();
        // const sort = DOM.sortSelect.value; // Removed for new sort system
        const filter = appState.activeStatFilter;
        const activePeriod = appState.currentPeriod;
        const activePeriodIndex = Utils.getPeriods().indexOf(activePeriod);

        // CORRECTIF: Toujours repartir de la liste complète (generatedResults) filtrée par la classe courante
        // Ne JAMAIS utiliser filteredResults comme source, sinon on perd les élèves masqués quand on retire un filtre.
        const currentClassId = appState.currentClassId;
        const hasAnyClasses = ClassManager.getAllClasses().length > 0;

        // Si aucune classe n'existe, sourceResults est vide (pas de mode legacy)
        let sourceResults = [];
        if (hasAnyClasses && currentClassId) {
            sourceResults = appState.generatedResults.filter(r => r.classId === currentClassId);
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
                const statuses = sd.statuses || [];
                const departStatus = statuses.find(s => s.startsWith('Départ'));

                if (departStatus) {
                    const departPeriodKey = departStatus.split(' ')[1];
                    const departPeriodIndex = Utils.getPeriods().indexOf(departPeriodKey);
                    if (departPeriodIndex !== -1 && departPeriodIndex < activePeriodIndex) {
                        return null;
                    }
                }

                const periodDataForView = sd.periods[activePeriod] || { grade: null, appreciation: '' };
                const isPlaceholder = !periodDataForView.appreciation && typeof periodDataForView.grade !== 'number' && !originalResult.errorMessage;

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
                const grade = r.studentData.periods[activePeriod]?.grade;
                if (typeof grade === 'number') {
                    minGrade = Math.min(minGrade, grade);
                    maxGrade = Math.max(maxGrade, grade);
                }
            });
        }

        const filteredAndSorted = viewableResults
            .filter(r => {
                if (!`${r.nom || ''} ${r.prenom || ''} ${Utils.decodeHtmlEntities(r.appreciation || '')}`.toLowerCase().includes(term)) return false;
                if (!filter) return true;
                if (filter === 'totalCount') return true;

                if (filter === 'minGrade') {
                    const grade = r.studentData.periods[activePeriod]?.grade;
                    return typeof grade === 'number' && grade === minGrade;
                }
                if (filter === 'maxGrade') {
                    const grade = r.studentData.periods[activePeriod]?.grade;
                    return typeof grade === 'number' && grade === maxGrade;
                }

                const statuses = r.studentData.statuses || [];
                if (filter === 'newCount') return statuses.some(s => s.startsWith('Nouveau') && s.endsWith(activePeriod));
                if (filter === 'departedCount') return statuses.some(s => s.startsWith('Départ') && s.endsWith(activePeriod));

                const evo = Utils.getRelevantEvolution(r.evolutions, r.studentData.currentPeriod);
                if (filter === 'progressCount') return evo && ['very-positive', 'positive'].includes(evo.type);
                if (filter === 'stableCount') return !evo || evo.type === 'stable';
                if (filter === 'regressionCount') return evo && ['very-negative', 'negative'].includes(evo.type);

                // Filtrage par tranche de notes (histogramme)
                if (filter.startsWith('gradeRange_')) {
                    const range = filter.replace('gradeRange_', '');
                    const [min, max] = range.split('-').map(Number);
                    const grade = r.studentData.periods[activePeriod]?.grade;
                    if (typeof grade !== 'number') return false;
                    // Inclusif sur min, exclusif sur max (sauf pour 16-20 qui est inclusif sur 20)
                    if (max === 20) {
                        return grade >= min && grade <= max;
                    }
                    return grade >= min && grade < max;
                }

                return false;
            })
            .sort((a, b) => {
                const { field, direction, param } = appState.sortState;
                const dir = direction === 'asc' ? 1 : -1;

                if (field === 'recent') return (new Date(b.timestamp) - new Date(a.timestamp)) * dir; // Usually desc is better for recent, but let's respect dir

                if (field === 'name') {
                    return `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`) * dir;
                }

                if (field === 'grade') {
                    const p = param || activePeriod;
                    const gA = a.studentData?.periods[p]?.grade ?? -1;
                    const gB = b.studentData?.periods[p]?.grade ?? -1;
                    // Sort nulls/undefined to bottom always? Or respect direction?
                    // Usually we want empty grades at bottom.
                    if (gA === -1 && gB !== -1) return 1;
                    if (gA !== -1 && gB === -1) return -1;
                    return (gA - gB) * dir;
                }

                if (field === 'evolution') {
                    const p = param || activePeriod;
                    const getRank = r => {
                        const e = Utils.getRelevantEvolution(r.evolutions, p); // Use specific period
                        return e ? { 'very-positive': 5, 'positive': 4, 'stable': 3, 'negative': 2, 'very-negative': 1 }[e.type] || 0 : 0;
                    };
                    return (getRank(a) - getRank(b)) * dir;
                }

                if (field === 'status') {
                    // Sort by student status tags (alphabetical)
                    // Order: Errors -> Tags (A-Z) -> Empty
                    const getStatusStr = (r) => {
                        if (r.errorMessage) return '!'; // Errors first
                        const statuses = r.studentData?.statuses || [];
                        if (statuses.length > 0) {
                            // Join tags to compare
                            return statuses.slice().sort().join(' ').toLowerCase();
                        }
                        // Empty statuses last
                        return '\uFFFF';
                    };
                    return getStatusStr(a).localeCompare(getStatusStr(b)) * dir;
                }

                return 0;
            });

        appState.filteredResults = filteredAndSorted;

        // Afficher l'état vide si la classe courante n'a pas de résultats
        if (sourceResults.length === 0) {
            // Clear for empty state
            DOM.resultsDiv.innerHTML = '';

            const emptyTemplate = document.getElementById('empty-state-template');
            if (emptyTemplate && DOM.emptyStateCard) {
                DOM.emptyStateCard.innerHTML = '';
                DOM.emptyStateCard.appendChild(emptyTemplate.content.cloneNode(true));

                // Bind events on inline hub cards
                this._bindEmptyStateHubEvents(DOM.emptyStateCard);
            }
            if (DOM.emptyStateCard) DOM.emptyStateCard.style.display = 'block';
            if (DOM.noResultsMessage) DOM.noResultsMessage.style.display = 'none';

            // Masquer les statistiques et le header de liste quand il n'y a pas de données
            if (DOM.statsContainer) DOM.statsContainer.style.display = 'none';
            if (DOM.outputHeader) DOM.outputHeader.style.display = 'none';
        }
        else if (filteredAndSorted.length === 0) {
            // Clear for no results message
            DOM.resultsDiv.innerHTML = '';

            if (DOM.emptyStateCard) DOM.emptyStateCard.style.display = 'none';
            if (DOM.noResultsMessage) DOM.noResultsMessage.style.display = 'block';

            // Réafficher les statistiques si masquées précédemment
            if (DOM.statsContainer) DOM.statsContainer.style.display = '';
            if (DOM.outputHeader) DOM.outputHeader.style.display = '';
        }
        else {
            // DON'T clear DOM here - let ListViewManager handle animation
            if (DOM.emptyStateCard) DOM.emptyStateCard.style.display = 'none';
            if (DOM.noResultsMessage) DOM.noResultsMessage.style.display = 'none';

            // Réafficher les statistiques si masquées précédemment
            if (DOM.statsContainer) DOM.statsContainer.style.display = '';
            if (DOM.outputHeader) DOM.outputHeader.style.display = '';

            // Liste + Focus UX: Utiliser ListViewManager au lieu des cartes individuelles
            ListViewManager.render(filteredAndSorted, DOM.resultsDiv);
        }
        if (highlightId && highlightType === 'new') {
            // Liste + Focus: Cibler la ligne du tableau
            const row = document.querySelector(`.student-row[data-student-id="${highlightId}"]`);
            if (row) {
                setTimeout(() => {
                    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    row.classList.add('highlight-new');
                    setTimeout(() => row.classList.remove('highlight-new'), 2000);
                }, 100);
            }
        }
        UI.updateStats(); UI.updateControlButtons(); UI.updateAIButtonsState(); UI.updateCopyAllButton(); StorageManager.saveAppState();
        UI.populateLoadStudentSelect();
        UI.updateHeaderContext();
        UI.initTooltips();

        // Mettre à jour le bouton d'action Générer/Régénérer
        this.updateGenerateButtonState(sourceResults);
    },

    /**
     * Updates the Generate/Regenerate button state based on list content
     * @param {Array} results - The results to analyze
     */
    updateGenerateButtonState(results = appState.filteredResults || appState.generatedResults) {
        const currentPeriod = appState.currentPeriod;

        // Count pending (empty/placeholder)
        const pendingCount = results.filter(r => {
            const appRaw = r.studentData?.periods?.[currentPeriod]?.appreciation;
            const appCurrent = (r.studentData?.currentPeriod === currentPeriod) ? r.appreciation : null;
            const effectiveApp = appRaw || appCurrent;
            const hasBlockingError = r.errorMessage && r.studentData?.currentPeriod === currentPeriod;

            if (hasBlockingError) return false;
            // Si pas de contenu défini -> En attente
            if (!effectiveApp) return true;

            // Si contenu existant, vérifier s'il est vide ou placeholder
            const textOnly = effectiveApp.replace(/<[^>]*>/g, '').trim().toLowerCase();
            return textOnly === '' ||
                textOnly.includes('en attente') ||
                textOnly.includes('aucune appréciation') ||
                textOnly.includes('cliquez sur') ||
                textOnly.startsWith('remplissez');
        }).length;

        if (DOM.generateAllPendingBtn) {
            const btn = DOM.generateAllPendingBtn;
            let mode = 'disabled';

            if (pendingCount > 0) {
                mode = 'generate';
            } else if (results.length > 0) {
                mode = 'regenerate';
            }

            btn.dataset.mode = mode;
            btn.disabled = (mode === 'disabled');

            // Reset base classes to ensure clean state
            btn.classList.remove('btn-primary', 'btn-neutral');

            const icon = btn.querySelector('i');
            const label = btn.querySelector('span:not(.pending-badge)');
            const badge = btn.querySelector('.pending-badge');

            if (mode === 'generate') {
                btn.classList.add('btn-primary');
                // Ensure btn-neutral is gone (handled by remove above)
                if (icon) icon.className = 'fas fa-wand-magic-sparkles';
                if (label) label.textContent = 'Générer';
                if (badge) {
                    badge.style.display = 'inline-flex';
                    badge.textContent = pendingCount;
                }
                btn.dataset.tooltip = "Générer les appréciations pour tous les élèves en attente";
            } else if (mode === 'regenerate') {
                btn.classList.add('btn-neutral'); // Use generic neutral style
                if (icon) icon.className = 'fas fa-sync-alt';
                if (label) label.textContent = 'Régénérer';
                if (badge) badge.style.display = 'none';
                btn.dataset.tooltip = "Régénérer les appréciations visibles";
            }
        }

        if (DOM.pendingCountBadge && pendingCount > 0) {
            DOM.pendingCountBadge.textContent = pendingCount;
        }

        // Bouton Analyser : disabled si aucun élève
        if (DOM.analyzeClassBtn) {
            DOM.analyzeClassBtn.disabled = results.length === 0;
        }
    },

    /**
     * Bind events on the inline hub cards in empty state
     * @param {HTMLElement} container - The empty state container
     * @private
     */
    _bindEmptyStateHubEvents(container) {
        const hubCards = container.querySelectorAll('.empty-state-hub-card');

        hubCards.forEach(card => {
            card.addEventListener('click', () => {
                const action = card.dataset.action;

                if (action === 'individual') {
                    // Open Focus Panel in creation mode
                    FocusPanelManager.openNew();
                } else if (action === 'mass') {
                    // Open Import Wizard
                    ImportWizardManager.open();
                }
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

    async regenerateVisible(onlyErrors = false) {
        // Pour les erreurs, on cherche dans TOUS les résultats, pas seulement les filtrés
        const sourceResults = onlyErrors ? appState.generatedResults : appState.filteredResults;
        const toRegen = sourceResults.filter(r => !onlyErrors || r.errorMessage);
        if (toRegen.length === 0) {
            UI.showNotification(onlyErrors ? "Aucune erreur à corriger." : "Aucune appréciation à régénérer.", "warning");
            return;
        }

        UI.showCustomConfirm(`Régénérer les ${toRegen.length} appréciations ${onlyErrors ? 'en erreur' : 'visibles'} ?`, async () => {
            // Import MassImportManager to use shared abort controller
            const { MassImportManager } = await import('./MassImportManager.js');

            // Create new abort controller for this regeneration
            MassImportManager.massImportAbortController = new AbortController();
            const signal = MassImportManager.massImportAbortController.signal;

            let successCount = 0;
            let errorCount = 0;
            let wasAborted = false;
            const total = toRegen.length;

            // Afficher "En file" (skeleton pending) sur toutes les lignes concernées immédiatement
            toRegen.forEach(resultToRegen => {
                ListViewManager.setRowStatus(resultToRegen.id, 'pending-skeleton');
            });

            // Traitement séquentiel pour un effet visuel progressif
            for (let i = 0; i < toRegen.length; i++) {
                // Check for cancellation
                if (signal.aborted) {
                    wasAborted = true;
                    break;
                }

                const resultToRegen = toRegen[i];
                const studentName = `${resultToRegen.prenom || ''} ${resultToRegen.nom || ''}`.trim();

                // Update header progress chip
                UI.showHeaderProgress(i + 1, total, studentName);

                try {
                    // Passer l'état à "Génération" (skeleton actif) juste pour celui-ci
                    ListViewManager.setRowStatus(resultToRegen.id, 'generating');

                    const updatedStudentData = JSON.parse(JSON.stringify(resultToRegen.studentData));
                    updatedStudentData.subject = appState.useSubjectPersonalization ? appState.currentSubject : 'Générique';
                    updatedStudentData.currentAIModel = appState.currentAIModel;

                    const newResult = await Am.generateAppreciation(updatedStudentData, false, null, signal);
                    const resultIndex = appState.generatedResults.findIndex(r => r.id === resultToRegen.id);
                    if (resultIndex > -1) {
                        newResult.id = resultToRegen.id;
                        appState.generatedResults[resultIndex] = newResult;
                        successCount++;

                        // CORRECTIF: Synchroniser filteredResults avec le nouveau résultat
                        const filteredIndex = appState.filteredResults.findIndex(r => r.id === resultToRegen.id);
                        if (filteredIndex > -1) {
                            appState.filteredResults[filteredIndex] = newResult;
                        }

                        // Mettre à jour la ligne avec animation typewriter
                        await ListViewManager.updateRow(newResult.id, newResult, true);
                    }
                } catch (e) {
                    // Check if aborted
                    if (e.name === 'AbortError' || signal.aborted) {
                        wasAborted = true;
                        break;
                    }

                    errorCount++;
                    const msg = Utils.translateErrorMessage(e.message);
                    const errorResult = Am.createResultObject(resultToRegen.nom, resultToRegen.prenom, '', resultToRegen.evolutions, resultToRegen.studentData, {}, {}, `Erreur IA : ${msg}.`);
                    const resultIndex = appState.generatedResults.findIndex(r => r.id === resultToRegen.id);
                    if (resultIndex > -1) {
                        errorResult.id = resultToRegen.id;
                        appState.generatedResults[resultIndex] = errorResult;

                        // CORRECTIF: Synchroniser filteredResults aussi en cas d'erreur
                        const filteredIndex = appState.filteredResults.findIndex(r => r.id === resultToRegen.id);
                        if (filteredIndex > -1) {
                            appState.filteredResults[filteredIndex] = errorResult;
                        }

                        // Mettre à jour la ligne pour afficher l'erreur
                        // ListViewManager gère l'affichage des erreurs via _getAppreciationCell
                        ListViewManager.updateRow(errorResult.id, errorResult, false);
                    }
                }
            }

            // Cleanup abort controller
            MassImportManager.massImportAbortController = null;

            // Hide progress and show errors if any
            UI.hideHeaderProgress(errorCount > 0, errorCount);

            if (wasAborted) {
                UI.showNotification("Régénération annulée.", "warning");
                // Re-render to restore all rows to their proper state
                this.renderResults();
            } else {
                UI.showNotification(`${successCount}/${toRegen.length} régénérée(s) avec succès.`, "success");
            }

            StorageManager.saveAppState();

            // Pas besoin de re-render complet, les lignes sont mises à jour individuellement
            UI.updateStats();
            UI.updateControlButtons();
        });
    },

    clearAllResults() {
        const visibleIds = new Set(appState.filteredResults.map(r => r.id));
        const count = visibleIds.size;

        if (count === 0) {
            UI.showNotification("Aucun résultat visible à effacer.", "warning");
            return;
        }

        UI.showCustomConfirm(`Voulez-vous vraiment effacer les ${count} appréciations actuellement visibles ?`, () => {
            appState.generatedResults = appState.generatedResults.filter(r => !visibleIds.has(r.id));

            this.renderResults();
            StorageManager.saveAppState();
            UI.showNotification(`${count} appréciations ont été effacées.`, 'success');
        });
    }
};
