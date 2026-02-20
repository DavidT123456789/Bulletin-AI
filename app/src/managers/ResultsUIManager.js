import { appState } from '../state/State.js';
import { DOM } from '../utils/DOM.js';
import { Utils } from '../utils/Utils.js';
// import { UI } from './UIManager.js'; // REMOVED to avoid circular dependency
import { StorageManager } from './StorageManager.js';
import { ListViewManager } from './ListViewManager.js';
import { ImportWizardManager } from './ImportWizardManager.js';
import { FocusPanelManager } from './FocusPanelManager.js';
import { FocusPanelStatus } from './FocusPanelStatus.js';
import { ClassManager } from './ClassManager.js';
import { StudentDataManager } from './StudentDataManager.js';
import { MassImportManager } from './MassImportManager.js';

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

                // Dashboard badge filters
                if (filter === 'generated') {
                    // Has valid appreciation for current period (not placeholder)
                    const appreciation = r.studentData?.periods?.[activePeriod]?.appreciation || r.appreciation;
                    if (!appreciation) return false;
                    const textOnly = appreciation.replace(/<[^>]*>/g, '').trim().toLowerCase();
                    const isPlaceholder = textOnly === '' ||
                        textOnly.includes('en attente') ||
                        textOnly.includes('aucune appréciation') ||
                        textOnly.includes('cliquez sur') ||
                        textOnly.startsWith('remplissez');
                    return !isPlaceholder && !r.errorMessage;
                }

                if (filter === 'error') {
                    return !!(r.errorMessage && r.studentData?.currentPeriod === activePeriod);
                }

                if (filter === 'pending') {
                    // No valid appreciation for current period
                    if (r.errorMessage && r.studentData?.currentPeriod === activePeriod) return false;
                    const appreciation = r.studentData?.periods?.[activePeriod]?.appreciation || r.appreciation;
                    if (!appreciation) return true;
                    const textOnly = appreciation.replace(/<[^>]*>/g, '').trim().toLowerCase();
                    return textOnly === '' ||
                        textOnly.includes('en attente') ||
                        textOnly.includes('aucune appréciation') ||
                        textOnly.includes('cliquez sur') ||
                        textOnly.startsWith('remplissez');
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
            // CRITICAL FIX: Preserve table structure (and search bar) when filter returns no results
            // Instead of clearing DOM, call ListViewManager with empty array to show "Aucun élève trouvé"
            // This keeps the search bar accessible so user can clear their search
            if (DOM.emptyStateCard) DOM.emptyStateCard.style.display = 'none';
            if (DOM.noResultsMessage) DOM.noResultsMessage.style.display = 'none';

            // Réafficher les statistiques si masquées précédemment
            if (DOM.statsContainer) DOM.statsContainer.style.display = '';
            if (DOM.outputHeader) DOM.outputHeader.style.display = '';

            // Let ListViewManager handle the empty state - it preserves the table header with search bar
            ListViewManager.render(filteredAndSorted, DOM.resultsDiv);
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
     * Updates the Generate and Update button states based on list content
     * - Generate button: only for pending (empty) appreciations
     * - Update button: for dirty (modified data) OR error appreciations
     * @param {Array} results - The results to analyze (hint only, always uses generatedResults for dirty check)
     */
    updateGenerateButtonState(results) {
        const currentPeriod = appState.currentPeriod;
        const currentClassId = appState.currentClassId;

        // CRITICAL FIX: Always use generatedResults as source of truth
        // filteredResults contains shallow copies that may be stale after data modifications
        // This mirrors the fix applied to ListViewManager.updateStudentRow
        let sourceResults = appState.generatedResults || [];

        // Filter by current class if applicable
        if (currentClassId) {
            sourceResults = sourceResults.filter(r => r.classId === currentClassId);
        }

        // Count pending (empty/placeholder)
        const pendingCount = sourceResults.filter(r => {
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

        // Count needs update (dirty OR error)
        const needsUpdateCount = sourceResults.filter(r => {
            // Error in current period
            const hasError = r.errorMessage && r.studentData?.currentPeriod === currentPeriod;
            if (hasError) return true;

            // Dirty state (data modified since creation - works for AI and manual)
            return FocusPanelStatus.checkDirtyState(r);
        }).length;

        // === GENERATE BUTTON ===
        if (DOM.generateAllPendingBtn) {
            const btn = DOM.generateAllPendingBtn;
            const hasContent = pendingCount > 0;

            btn.dataset.mode = hasContent ? 'generate' : 'disabled';
            btn.disabled = !hasContent;

            // Always use btn-primary for generate button
            btn.classList.remove('btn-neutral');
            btn.classList.add('btn-primary');

            const icon = btn.querySelector('i, iconify-icon');
            const label = btn.querySelector('span:not(.pending-badge)');
            const badge = btn.querySelector('.pending-badge');

            if (icon) {
                if (icon.tagName === 'I') {
                    // Replace with iconify-icon
                    const newIcon = document.createElement('iconify-icon');
                    newIcon.setAttribute('icon', 'solar:magic-stick-3-linear');
                    icon.replaceWith(newIcon);
                } else {
                    icon.setAttribute('icon', 'solar:magic-stick-3-linear');
                }
            }
            if (label) label.textContent = 'Générer';
            if (badge) {
                badge.style.display = hasContent ? 'inline-flex' : 'none';
                badge.textContent = pendingCount;
            }
            btn.dataset.tooltip = hasContent
                ? `Générer les ${pendingCount} appréciations en attente`
                : "Aucune appréciation en attente";
        }

        // === UPDATE BUTTON (dirty + errors) ===
        if (DOM.updateDirtyBtn) {
            const btn = DOM.updateDirtyBtn;
            const hasUpdates = needsUpdateCount > 0;

            btn.style.display = hasUpdates ? 'inline-flex' : 'none';
            btn.disabled = !hasUpdates;

            const badge = btn.querySelector('.pending-badge');
            if (badge) {
                badge.textContent = needsUpdateCount;
            }
            btn.dataset.tooltip = `Actualiser ${needsUpdateCount} appréciation${needsUpdateCount > 1 ? 's' : ''} (modifiée${needsUpdateCount > 1 ? 's' : ''} ou en erreur)`;
        }

        // === UPDATE BUTTON INLINE (in table header) ===
        const updateBtnInline = document.getElementById('updateDirtyBtnInline');
        if (updateBtnInline) {
            const hasUpdates = needsUpdateCount > 0;
            const wasHidden = updateBtnInline.style.display === 'none';

            updateBtnInline.style.display = hasUpdates ? 'inline-flex' : 'none';

            const badge = updateBtnInline.querySelector('.update-badge');
            if (badge) {
                badge.textContent = needsUpdateCount;
            }
            updateBtnInline.dataset.tooltip = `Actualiser ${needsUpdateCount} appréciation${needsUpdateCount > 1 ? 's' : ''} (modifiée${needsUpdateCount > 1 ? 's' : ''} ou en erreur)`;

            // Animate in if newly visible
            if (hasUpdates && wasHidden) {
                updateBtnInline.classList.add('animate-in');
                setTimeout(() => updateBtnInline.classList.remove('animate-in'), 350);
            }
        }

        // === GENERATE BUTTON INLINE (in table header) ===
        const generateBtnInline = document.getElementById('generatePendingBtnInline');
        if (generateBtnInline) {
            const hasPending = pendingCount > 0;
            const wasHidden = generateBtnInline.style.display === 'none';

            generateBtnInline.style.display = hasPending ? 'inline-flex' : 'none';

            const badge = generateBtnInline.querySelector('.generate-badge');
            if (badge) {
                badge.textContent = pendingCount;
            }
            generateBtnInline.dataset.tooltip = `Générer ${pendingCount} appréciation${pendingCount > 1 ? 's' : ''} en attente`;

            // Animate in if newly visible
            if (hasPending && wasHidden) {
                generateBtnInline.classList.add('animate-in');
                setTimeout(() => generateBtnInline.classList.remove('animate-in'), 350);
            }
        }

        // === ANALYZE BUTTON ===
        if (DOM.analyzeClassBtn) {
            DOM.analyzeClassBtn.disabled = sourceResults.length === 0;
        }

        // === HEADER GENERATE CHIP (idle-pending state) + Reinitialize tooltips ===
        if (UI?.updateGenerateChipState) {
            UI.updateGenerateChipState(pendingCount);
        }
        // Reinitialize tooltips to pick up updated data-tooltip on the update button
        if (UI?.initTooltips) {
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
                        // Use centralized updateResult to preserve user data (photo, journal, history)
                        const updatedResult = StudentDataManager.updateResult(
                            appState.generatedResults[resultIndex],
                            newResult
                        );
                        successCount++;

                        // CORRECTIF: Synchroniser filteredResults avec le nouveau résultat
                        const filteredIndex = appState.filteredResults.findIndex(r => r.id === resultToRegen.id);
                        if (filteredIndex > -1) {
                            appState.filteredResults[filteredIndex] = updatedResult;
                        }

                        // Mettre à jour la ligne avec animation typewriter
                        await ListViewManager.updateRow(updatedResult.id, updatedResult, true);
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
                        // Use centralized updateResult to preserve user data
                        const updatedResult = StudentDataManager.updateResult(
                            appState.generatedResults[resultIndex],
                            errorResult
                        );

                        // CORRECTIF: Synchroniser filteredResults aussi en cas d'erreur
                        const filteredIndex = appState.filteredResults.findIndex(r => r.id === resultToRegen.id);
                        if (filteredIndex > -1) {
                            appState.filteredResults[filteredIndex] = updatedResult;
                        }

                        // Mettre à jour la ligne pour afficher l'erreur
                        ListViewManager.updateRow(updatedResult.id, updatedResult, false);
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

    /**
     * Regenerates appreciations that are dirty (data modified) or have errors
     * Used by the "Actualiser" button
     */
    async regenerateDirty() {
        const currentPeriod = appState.currentPeriod;
        const currentClassId = appState.currentClassId;

        // CRITICAL FIX: Use generatedResults as source of truth (not filteredResults which may be stale)
        let sourceResults = appState.generatedResults || [];
        if (currentClassId) {
            sourceResults = sourceResults.filter(r => r.classId === currentClassId);
        }

        // Find all results that need updating (dirty OR error)
        const toRegen = sourceResults.filter(r => {
            const hasError = r.errorMessage && r.studentData?.currentPeriod === currentPeriod;
            if (hasError) return true;

            // Dirty state (data modified since creation - works for AI and manual)
            return FocusPanelStatus.checkDirtyState(r);
        });

        if (toRegen.length === 0) {
            UI.showNotification("Aucune appréciation à actualiser.", "warning");
            return;
        }

        const errorCount = toRegen.filter(r => r.errorMessage).length;
        const dirtyCount = toRegen.length - errorCount;

        let message = `Actualiser ${toRegen.length} appréciation${toRegen.length > 1 ? 's' : ''} ?`;
        if (errorCount > 0 && dirtyCount > 0) {
            message = `Actualiser ${dirtyCount} appréciation${dirtyCount > 1 ? 's' : ''} modifiée${dirtyCount > 1 ? 's' : ''} et ${errorCount} en erreur ?`;
        } else if (errorCount > 0) {
            message = `Régénérer ${errorCount} appréciation${errorCount > 1 ? 's' : ''} en erreur ?`;
        } else {
            message = `Actualiser ${dirtyCount} appréciation${dirtyCount > 1 ? 's' : ''} modifiée${dirtyCount > 1 ? 's' : ''} ?`;
        }

        UI.showCustomConfirm(message, async () => {
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

            for (let i = 0; i < toRegen.length; i++) {
                if (signal.aborted) {
                    wasAborted = true;
                    break;
                }

                const resultToRegen = toRegen[i];
                const studentName = `${resultToRegen.prenom || ''} ${resultToRegen.nom || ''}`.trim();

                UI.showHeaderProgress(i + 1, total, studentName);

                try {
                    ListViewManager.setRowStatus(resultToRegen.id, 'generating');

                    const updatedStudentData = JSON.parse(JSON.stringify(resultToRegen.studentData));
                    updatedStudentData.subject = appState.useSubjectPersonalization ? appState.currentSubject : 'Générique';
                    updatedStudentData.currentAIModel = appState.currentAIModel;

                    const newResult = await Am.generateAppreciation(updatedStudentData, false, null, signal);
                    const resultIndex = appState.generatedResults.findIndex(r => r.id === resultToRegen.id);
                    if (resultIndex > -1) {
                        // Use centralized updateResult to preserve user data
                        const updatedResult = StudentDataManager.updateResult(
                            appState.generatedResults[resultIndex],
                            newResult
                        );
                        successCount++;

                        const filteredIndex = appState.filteredResults.findIndex(r => r.id === resultToRegen.id);
                        if (filteredIndex > -1) {
                            appState.filteredResults[filteredIndex] = updatedResult;
                        }

                        await ListViewManager.updateRow(updatedResult.id, updatedResult, true);
                    }
                } catch (e) {
                    if (e.name === 'AbortError' || signal.aborted) {
                        wasAborted = true;
                        break;
                    }

                    newErrorCount++;
                    const msg = Utils.translateErrorMessage(e.message);
                    const errorResult = Am.createResultObject(resultToRegen.nom, resultToRegen.prenom, '', resultToRegen.evolutions, resultToRegen.studentData, {}, {}, `Erreur IA : ${msg}.`);
                    const resultIndex = appState.generatedResults.findIndex(r => r.id === resultToRegen.id);
                    if (resultIndex > -1) {
                        // Use centralized updateResult to preserve user data
                        const updatedResult = StudentDataManager.updateResult(
                            appState.generatedResults[resultIndex],
                            errorResult
                        );

                        const filteredIndex = appState.filteredResults.findIndex(r => r.id === resultToRegen.id);
                        if (filteredIndex > -1) {
                            appState.filteredResults[filteredIndex] = updatedResult;
                        }

                        ListViewManager.updateRow(updatedResult.id, updatedResult, false);
                    }
                }
            }

            MassImportManager.massImportAbortController = null;
            UI.hideHeaderProgress(newErrorCount > 0, newErrorCount);

            if (wasAborted) {
                UI.showNotification("Actualisation annulée.", "warning");
                this.renderResults();
            } else {
                UI.showNotification(`${successCount}/${total} actualisée(s) avec succès.`, "success");
            }

            StorageManager.saveAppState();
            UI.updateStats();
            UI.updateControlButtons();

            // CRITICAL FIX: Update button state after regeneration completes
            // This ensures the "Actualiser" button disappears when no more dirty appreciations exist
            this.updateGenerateButtonState();
        });
    },

    clearAllResults() {
        const visibleIds = new Set(appState.filteredResults.map(r => r.id));
        const count = visibleIds.size;

        if (count === 0) {
            UI.showNotification("Aucun résultat visible à effacer.", "warning");
            return;
        }

        UI.showCustomConfirm(`
            <div style="text-align:left;">
                <p><strong>Attention : Action destructrice !</strong></p>
                <p>Vous êtes sur le point de supprimer définitivement <strong>${count} élèves</strong> de la liste.</p>
                <p>Cette action supprimera :</p>
                <ul style="margin-left:20px; margin-bottom:10px;">
                    <li>Les données de scolarité (notes, absences...)</li>
                    <li>Les appréciations générées</li>
                    <li>L'historique des modifications</li>
                </ul>
                <p>Si vous souhaitez uniquement effacer les textes générés, utilisez l'option "Effacer les appréciations".</p>
            </div>
        `, () => {
            appState.generatedResults = appState.generatedResults.filter(r => !visibleIds.has(r.id));

            this.renderResults();
            StorageManager.saveAppState();
            UI.showNotification(`${count} élèves ont été supprimés.`, 'success');
        }, null, { title: 'Supprimer définitivement les élèves ?', confirmText: 'Tout supprimer', isDanger: true });
    },

    /**
     * Clears only the appreciation text for visible students
     */
    clearVisibleAppreciations() {
        const visibleIds = new Set(appState.filteredResults.map(r => r.id));
        const count = visibleIds.size;
        const currentPeriod = appState.currentPeriod;

        if (count === 0) {
            UI.showNotification("Aucun résultat visible à effacer.", "warning");
            return;
        }

        UI.showCustomConfirm(`Voulez-vous effacer le texte des ${count} appréciations visibles ?<br><span style="font-size:0.9em; opacity:0.8;">Les notes et les données élèves seront conservées.</span>`, () => {
            let clearedCount = 0;
            const now = Date.now();

            appState.generatedResults.forEach(r => {
                if (visibleIds.has(r.id)) {
                    // Clear global appreciation
                    r.appreciation = '';

                    // Clear period-specific appreciation WITH timestamp for sync
                    if (r.studentData && r.studentData.periods && r.studentData.periods[currentPeriod]) {
                        r.studentData.periods[currentPeriod].appreciation = '';
                        r.studentData.periods[currentPeriod]._lastModified = now;
                    }

                    // Update result timestamp for sync
                    r._lastModified = now;

                    r.copied = false;
                    // We don't clear history by default to allow undo/reference, but we could if requested.
                    // The user asked "Supprimer les journaux de bord", which implies a separate action.

                    clearedCount++;
                }
            });

            this.renderResults();
            StorageManager.saveAppState();
            UI.showNotification(`${clearedCount} appréciations effacées.`, 'success');
        }, null, { title: 'Effacer les appréciations ?', confirmText: 'Effacer le texte', isDanger: true });
    },
    /**
     * Clears journal entries for visible students (Reset AI Context)
     */
    clearVisibleJournals() {
        const visibleIds = new Set(appState.filteredResults.map(r => r.id));
        const count = visibleIds.size;

        if (count === 0) {
            UI.showNotification("Aucun résultat visible.", "warning");
            return;
        }

        UI.showCustomConfirm(`
            <div style="text-align:left;">
                <p><strong>Réinitialiser le contexte IA ?</strong></p>
                <p>Vous allez supprimer tous les <strong>journaux de bord</strong> des ${count} élèves affichés.</p>
                <p>Cela effacera :</p>
                <ul style="margin-left:20px; margin-bottom:10px;">
                    <li>Les observations manuelles</li>
                    <li>L'historique des interactions pour ces élèves</li>
                </ul>
                <p style="font-size:0.9em; opacity:0.8;">Les appréciations déjà générées et les notes ne seront PAS modifiées.</p>
            </div>
        `, () => {
            let clearedCount = 0;
            appState.generatedResults.forEach(r => {
                if (visibleIds.has(r.id)) {
                    if (r.journal && r.journal.length > 0) {
                        r.journal = [];
                        clearedCount++;
                    }
                }
            });

            this.renderResults();
            StorageManager.saveAppState();
            // Force refresh of focus panel if open, as it might show the journal
            const focusPanel = document.getElementById('focusPanel');
            if (focusPanel && focusPanel.classList.contains('open')) {
                // Trigger a refresh event or similar if needed, 
                // but re-rendering the list might be enough as interactions usually reload the panel data
                // However, FocusPanelJournal listens to 'journalThresholdChanged' but not necessarily generic updates
                // We'll rely on global UI refresh if possible, or user re-opening.
                // Actually ListViewManager.openFocusPanel re-renders. 
                // If the panel is open for a student whose journal was just cleared, it might be stale.
                // But this is a bulk action, usually done from the list view.
            }
            UI.showNotification(`${clearedCount} journaux de bord effacés.`, 'success');
        }, null, { title: 'Effacer les journaux ?', confirmText: 'Effacer Journaux', isDanger: true });
    }
};
