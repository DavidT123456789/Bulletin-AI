/**
 * @fileoverview Gestionnaire des exports de données.
 * 
 * Ce module gère toutes les fonctionnalités d'export :
 * - Copie d'appréciations individuelles
 * - Copie de toutes les appréciations visibles
 * - Export CSV
 * - Export PDF (impression)
 * 
 * @module managers/ExportManager
 */

import { appState } from '../state/State.js';
import { DOM } from '../utils/DOM.js';
import { Utils } from '../utils/Utils.js';
import { UI } from './UIManager.js';
import { StorageManager } from './StorageManager.js';

/** @type {import('./AppManager.js').App|null} */
let App = null;

/**
 * Module de gestion des exports.
 * @namespace ExportManager
 */
export const ExportManager = {
    /**
     * Initialise le module avec une référence à l'application principale.
     * @param {Object} appInstance - Instance de l'application principale
     */
    init(appInstance) {
        App = appInstance;
    },

    /**
     * Copie une appréciation dans le presse-papiers.
     * @param {string} id - Identifiant de l'appréciation
     * @param {HTMLElement} buttonEl - Bouton qui a déclenché l'action
     */
    copyAppreciation(id, buttonEl) {
        const resultIndex = appState.generatedResults.findIndex(r => r.id === id);
        if (resultIndex === -1) return;

        const visibleResult = appState.filteredResults.find(r => r.id === id);
        const appreciationToCopy = visibleResult ? visibleResult.appreciation : appState.generatedResults[resultIndex].appreciation;

        if (!appreciationToCopy) {
            UI.showNotification('Appréciation vide.', 'error');
            return;
        }

        navigator.clipboard.writeText(Utils.stripMarkdown(Utils.decodeHtmlEntities(appreciationToCopy))).then(() => {
            appState.generatedResults[resultIndex].copied = true;
            StorageManager.saveAppState();

            if (buttonEl) {
                const originalIcon = buttonEl.innerHTML;
                const hasText = buttonEl.textContent.trim().length > 0;

                // Si le bouton contient du texte (ex: menu contextuel), on affiche "Copié !"
                // Sinon (ex: icône seule), on change juste l'icône
                buttonEl.innerHTML = hasText
                    ? '<iconify-icon icon="ph:check"></iconify-icon> Copié !'
                    : '<iconify-icon icon="ph:check"></iconify-icon>';

                buttonEl.classList.add('copied', 'copy-success');
                setTimeout(() => {
                    buttonEl.classList.remove('copied', 'copy-success');
                    if (appState.generatedResults[resultIndex]?.copied) {
                        buttonEl.classList.add('was-copied');
                    }
                    // Restore original content
                    buttonEl.innerHTML = originalIcon;
                }, 1500);
            }

        }).catch(err => {
            UI.showNotification('Échec copie.', 'error');
            console.error('Erreur :', err);
        });
    },

    /**
     * Copie le texte original ou suggéré depuis la modale de raffinement.
     * @param {'original'|'suggested'} type - Type de texte à copier
     */
    copyRefinementText(type) {
        const el = type === 'original' ? DOM.originalAppreciationText : DOM.suggestedAppreciationText;
        const text = el.textContent.trim();

        if (text && !el.classList.contains('placeholder')) {
            navigator.clipboard.writeText(text).then(() => {

                const btn = DOM.refinementModal.querySelector(`[data-action="copy-${type}"]`);
                if (btn) {
                    btn.innerHTML = '<iconify-icon icon="ph:check"></iconify-icon>';
                    btn.classList.add('copied');
                    setTimeout(() => {
                        btn.innerHTML = '<iconify-icon icon="solar:copy-linear"></iconify-icon>';
                        btn.classList.remove('copied');
                    }, 2000);
                }
            });
        } else {
            UI.showNotification('Aucun texte à copier.', 'warning');
        }
    },

    /**
     * Copie toutes les appréciations visibles dans le presse-papiers.
     */
    copyAllResults() {
        const button = document.getElementById('copyAllBtn-shortcut');

        if (appState.filteredResults.length === 0) {
            UI.showNotification("Rien à copier.", "warning");
            return;
        }

        const text = appState.filteredResults.map(r =>
            `${r.nom} ${r.prenom}\n${Utils.stripMarkdown(Utils.decodeHtmlEntities(r.appreciation))}`
        ).join('\n\n');

        navigator.clipboard.writeText(text).then(() => {
            if (button) {
                const originalIcon = button.innerHTML;
                button.innerHTML = '<iconify-icon icon="ph:check"></iconify-icon>';
                button.disabled = true;
                setTimeout(() => {
                    button.innerHTML = originalIcon;
                    button.disabled = false;
                }, 2000);
            }
        });
    },

    /**
     * Exporte les appréciations visibles au format CSV.
     * Scope : classe active, périodes actuelles et précédentes uniquement.
     */
    exportToCsv() {
        const results = appState.filteredResults;

        if (!results || results.length === 0) {
            UI.showNotification('Aucune donnée à exporter.', 'warning');
            return;
        }

        const allPeriods = Utils.getPeriods();
        const currentPeriod = appState.currentPeriod;

        const headers = [
            "Nom", "Prénom", "Statuts",
            ...allPeriods.flatMap(p => [`Moy ${p}`, `Évo ${p}`, `App ${p}`]),
            "Matière", "Instructions", "Forces/Faiblesses", "Pistes", "Date"
        ];

        const clean = (txt) => {
            if (txt == null) return '';
            let str = Utils.stripMarkdown(String(txt));
            str = str.replace(/[\n\r]+/g, ' ').trim();
            str = str.replace(/"/g, '""');
            return (/[",;]/).test(str) ? `"${str}"` : str;
        };

        const rows = results.map(r => {
            const sd = r.studentData || {};
            let row = [r.nom, r.prenom, (sd.statuses || []).join(', ')];

            allPeriods.forEach(p => {
                const d = sd.periods?.[p];
                const grade = d?.grade;
                
                // Calcul de l'évolution
                let evolutionStr = '';
                const evo = Utils.getRelevantEvolution(r.evolutions, p);
                if (evo && typeof evo.delta === 'number') {
                    const sign = evo.delta > 0 ? '+' : '';
                    evolutionStr = `${sign}${String(evo.delta).replace('.', ',')}`;
                }

                // SINGLE SOURCE OF TRUTH:
                // 1. If an appreciation is actively assigned to this period in periods[p], use it.
                // 2. Fallback: If AI generated an appreciation for *this* period but hasn't synced to periods[p] yet, use it.
                let targetApp = d?.appreciation || '';
                if (!targetApp && r.generationPeriod === p && r.appreciation) {
                    targetApp = r.appreciation;
                }

                row.push(
                    typeof grade === 'number' ? String(grade).replace('.', ',') : '',
                    evolutionStr,
                    targetApp
                );
            });

            row.push(
                sd.subject || appState.currentSubject || '',
                sd.periods?.[currentPeriod]?.context || '',
                r.strengthsWeaknesses ?? '',
                r.nextSteps?.join('; ') ?? '',
                r.timestamp ? new Date(r.timestamp).toLocaleString() : ''
            );

            return row.map(clean).join(';');
        });

        const csvContent = "\uFEFF" + headers.join(';') + '\n' + rows.join('\n');

        const classLabel = appState.classes?.find(c => c.id === appState.currentClassId)?.name || '';
        const safeName = classLabel ? `_${classLabel.replace(/[^a-zA-Z0-9À-ÿ\-_ ]/g, '').trim().replace(/\s+/g, '-')}` : '';
        const filename = `bulletin-ai${safeName}_${currentPeriod}_${new Date().toISOString().slice(0, 10)}.csv`;

        StorageManager._downloadFile(csvContent, filename, 'text/csv;charset=utf-8;');

        const count = results.length;
        UI.showNotification(`CSV exporté (${count} élève${count > 1 ? 's' : ''}, ${Utils.getPeriodLabel(currentPeriod, true)}).`, 'success');
    },

    /**
     * Lance l'impression de la page pour générer un PDF.
     * Injecte un en-tête imprimable avec classe, période et date.
     */
    exportToPdf() {
        if (appState.filteredResults.length === 0) {
            UI.showNotification('Aucune donnée à exporter.', 'warning');
            return;
        }

        const classLabel = appState.classes?.find(c => c.id === appState.currentClassId)?.name || '';
        const periodLabel = Utils.getPeriodLabel(appState.currentPeriod, true);
        const dateStr = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

        const originalTitle = document.title;
        document.title = `Appréciations${classLabel ? ` - ${classLabel}` : ''} - ${periodLabel}`;

        const printHeader = document.createElement('div');
        printHeader.id = 'print-header';
        printHeader.setAttribute('style',
            'display:none; padding: 12px 0 8px; margin-bottom: 12px; border-bottom: 2px solid #111;'
        );
        printHeader.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:baseline;">
                <h1 style="margin:0; font-size:16pt; font-weight:700; color:#111;">
                    ${classLabel || 'Appréciations'}
                    <span style="font-weight:400; font-size:12pt; color:#6b7280; margin-left:8px;">${periodLabel}</span>
                </h1>
                <span style="font-size:9pt; color:#9ca3af;">${dateStr}</span>
            </div>
        `;

        const mainContent = document.querySelector('.main-content');
        mainContent?.insertBefore(printHeader, mainContent.firstChild);

        const printStyle = document.createElement('style');
        printStyle.id = 'print-header-style';
        printStyle.textContent = '@media print { #print-header { display: block !important; } }';
        document.head.appendChild(printStyle);

        const cleanup = () => {
            document.title = originalTitle;
            printHeader.remove();
            printStyle.remove();
            window.onafterprint = null;
        };

        window.onafterprint = cleanup;
        window.print();
    },

    /**
     * Copie les appréciations de plusieurs élèves
     * @param {Array<string>} ids - Liste des IDs
     * @returns {Promise<number>} Nombre d'appréciations copiées
     */
    async copyBulkAppreciations(ids) {
        if (!ids || ids.length === 0) return 0;

        const resultsToCopy = appState.generatedResults.filter(r => ids.includes(r.id));
        const activeResults = resultsToCopy.filter(r => r.appreciation && r.appreciation.trim());

        if (activeResults.length === 0) {
            UI.showNotification('Aucune appréciation à copier parmi la sélection.', 'warning');
            return 0;
        }

        const text = activeResults.map(r =>
            `${r.nom} ${r.prenom}\n${Utils.stripMarkdown(Utils.decodeHtmlEntities(r.appreciation))}`
        ).join('\n\n');

        try {
            await navigator.clipboard.writeText(text);

            // Marquer comme copiés
            activeResults.forEach(r => {
                r.copied = true;
            });

            StorageManager.saveAppState();
            return activeResults.length;
        } catch (err) {
            console.error('Erreur bulk copy:', err);
            UI.showNotification('Échec de la copie groupée.', 'error');
            return 0;
        }
    }
};
