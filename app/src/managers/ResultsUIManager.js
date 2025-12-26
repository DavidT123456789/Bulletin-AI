import { appState } from '../state/State.js';
import { DOM } from '../utils/DOM.js';
import { Utils } from '../utils/Utils.js';
// import { UI } from './UIManager.js'; // REMOVED to avoid circular dependency
import { StorageManager } from './StorageManager.js';
import { ListViewManager } from './ListViewManager.js';
import { ImportWizardManager } from './ImportWizardManager.js';
import { FocusPanelManager } from './FocusPanelManager.js';

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
        const sort = DOM.sortSelect.value;
        const filter = appState.activeStatFilter;
        const activePeriod = appState.currentPeriod;
        const activePeriodIndex = Utils.getPeriods().indexOf(activePeriod);

        // CORRECTIF: Toujours repartir de la liste complète (generatedResults) filtrée par la classe courante
        // Ne JAMAIS utiliser filteredResults comme source, sinon on perd les élèves masqués quand on retire un filtre.
        const currentClassId = appState.currentClassId;
        const sourceResults = currentClassId
            ? appState.generatedResults.filter(r => r.classId === currentClassId)
            : appState.generatedResults.filter(r => !r.classId); // Mode legacy ou sans classe

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
                if (sort === 'recent') return new Date(b.timestamp) - new Date(a.timestamp);
                if (sort === 'name') return `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`);
                if (sort === 'grade') { const gA = a.studentData?.periods[a.studentData.currentPeriod]?.grade ?? -1, gB = b.studentData?.periods[b.studentData.currentPeriod]?.grade ?? -1; return gB - gA; }
                if (sort === 'progress') { const getRank = r => { const e = Utils.getRelevantEvolution(r.evolutions, r.studentData.currentPeriod); return e ? { 'very-positive': 5, 'positive': 4, 'stable': 3, 'negative': 2, 'very-negative': 1 }[e.type] || 0 : 0; }; return getRank(b) - getRank(a); }
                return 0;
            });

        appState.filteredResults = filteredAndSorted;
        DOM.resultsDiv.innerHTML = '';
        // Afficher l'état vide si la classe courante n'a pas de résultats
        if (sourceResults.length === 0) {
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
            if (DOM.statsHeader) DOM.statsHeader.style.display = 'none';
            if (DOM.statsContainer) DOM.statsContainer.style.display = 'none';
            if (DOM.outputHeader) DOM.outputHeader.style.display = 'none';
        }
        else if (filteredAndSorted.length === 0) {
            if (DOM.emptyStateCard) DOM.emptyStateCard.style.display = 'none';
            if (DOM.noResultsMessage) DOM.noResultsMessage.style.display = 'block';

            // Réafficher les statistiques si masquées précédemment
            if (DOM.statsHeader) DOM.statsHeader.style.display = '';
            if (DOM.statsContainer) DOM.statsContainer.style.display = '';
            if (DOM.outputHeader) DOM.outputHeader.style.display = '';
        }
        else {
            if (DOM.emptyStateCard) DOM.emptyStateCard.style.display = 'none';
            if (DOM.noResultsMessage) DOM.noResultsMessage.style.display = 'none';

            // Réafficher les statistiques si masquées précédemment
            if (DOM.statsHeader) DOM.statsHeader.style.display = '';
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

        // Mettre à jour le compteur d'élèves en attente et afficher/masquer le bouton
        this.updatePendingCount(sourceResults);
    },

    /**
     * Met à jour le compteur d'élèves en attente et affiche/masque le bouton de génération
     * @param {Array} results - Les résultats à analyser
     */
    updatePendingCount(results = appState.filteredResults || appState.generatedResults) {
        const currentPeriod = appState.currentPeriod;

        // CORRECTION: Vérification stricte du contenu (gestion des espaces vides et HTML résiduel)
        const pendingCount = results.filter(r => {
            const appRaw = r.studentData?.periods?.[currentPeriod]?.appreciation;
            const appCurrent = (r.studentData?.currentPeriod === currentPeriod) ? r.appreciation : null;
            const effectiveApp = appRaw || appCurrent;

            // Erreur bloquante uniquement si elle concerne la période actuelle
            const hasBlockingError = r.errorMessage && r.studentData?.currentPeriod === currentPeriod;
            if (hasBlockingError) return false;

            // Si pas de contenu défini -> En attente
            if (!effectiveApp) return true;

            // Si contenu existant, vérifier s'il est vide ou placeholder
            const textOnly = effectiveApp.replace(/<[^>]*>/g, '').trim().toLowerCase();
            const isPlaceholder = textOnly === '' ||
                textOnly.includes('en attente') ||
                textOnly.includes('aucune appréciation') ||
                textOnly.includes('cliquez sur') ||
                textOnly.startsWith('remplissez');

            return isPlaceholder;
        }).length;

        if (DOM.generateAllPendingBtn) {
            DOM.generateAllPendingBtn.style.display = pendingCount > 0 ? 'flex' : 'none';
        }
        if (DOM.pendingCountBadge) {
            DOM.pendingCountBadge.textContent = pendingCount;
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
            let successCount = 0;

            // Afficher les skeletons sur toutes les cartes concernées immédiatement
            toRegen.forEach(resultToRegen => {
                const card = document.querySelector(`.appreciation-result[data-id="${resultToRegen.id}"]`);
                if (card) {
                    card.classList.add('is-regenerating');
                    UI.showSkeletonInCard(card, 'En file', true);
                }
            });

            // Traitement séquentiel pour un effet visuel progressif
            for (const resultToRegen of toRegen) {
                const card = document.querySelector(`.appreciation-result[data-id="${resultToRegen.id}"]`);
                const appreciationEl = card?.querySelector('[data-template="appreciation"]');

                // Mettre à jour le badge pour indiquer la génération active
                UI.activateCardBadge(card);

                try {
                    const updatedStudentData = JSON.parse(JSON.stringify(resultToRegen.studentData));
                    updatedStudentData.subject = appState.useSubjectPersonalization ? appState.currentSubject : 'Générique';
                    updatedStudentData.currentAIModel = appState.currentAIModel;

                    const newResult = await Am.generateAppreciation(updatedStudentData);
                    const resultIndex = appState.generatedResults.findIndex(r => r.id === resultToRegen.id);
                    if (resultIndex > -1) {
                        newResult.id = resultToRegen.id;
                        appState.generatedResults[resultIndex] = newResult;
                        successCount++;

                        // Effet typewriter pour le succès
                        if (appreciationEl) {
                            await UI.typewriterReveal(appreciationEl, newResult.appreciation || '', { speed: 'fast' });
                            card?.classList.add('just-generated');
                            setTimeout(() => card?.classList.remove('just-generated'), 1000);
                        }
                    }
                } catch (e) {
                    const msg = Utils.translateErrorMessage(e.message);
                    const errorResult = Am.createResultObject(resultToRegen.nom, resultToRegen.prenom, '', resultToRegen.evolutions, resultToRegen.studentData, {}, {}, `Erreur IA : ${msg}.`);
                    const resultIndex = appState.generatedResults.findIndex(r => r.id === resultToRegen.id);
                    if (resultIndex > -1) {
                        errorResult.id = resultToRegen.id;
                        appState.generatedResults[resultIndex] = errorResult;

                        // Afficher l'erreur
                        if (appreciationEl) {
                            await UI.fadeOutSkeleton(appreciationEl);
                            appreciationEl.innerHTML = `<p class="error-text">⚠️ ${msg}</p>`;
                            card?.classList.add('has-error', 'just-errored');
                            setTimeout(() => card?.classList.remove('just-errored'), 1000);
                        }
                    }
                } finally {
                    card?.classList.remove('is-regenerating');
                }
            }

            UI.showNotification(`${successCount}/${toRegen.length} régénérée(s) avec succès.`, "success");
            StorageManager.saveAppState();

            // Rafraîchir filteredResults pour que le prochain clic ne cible que les erreurs restantes
            this.renderResults();
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
