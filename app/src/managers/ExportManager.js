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
                    ? '<iconify-icon icon="solar:check-circle-bold"></iconify-icon> Copié !'
                    : '<iconify-icon icon="solar:check-circle-bold"></iconify-icon>';

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
                    btn.innerHTML = '<iconify-icon icon="solar:check-circle-bold"></iconify-icon>';
                    btn.classList.add('copied');
                    setTimeout(() => {
                        btn.innerHTML = '<iconify-icon icon="solar:copy-bold"></iconify-icon>';
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
            UI.showNotification(`${appState.filteredResults.length} appréciations copiées !`, 'success');
            if (button) {
                const originalIcon = button.innerHTML;
                button.innerHTML = '<iconify-icon icon="solar:check-circle-bold"></iconify-icon>';
                button.disabled = true;
                setTimeout(() => {
                    button.innerHTML = originalIcon;
                    button.disabled = false;
                }, 2000);
            }
        });
    },

    /**
     * Exporte toutes les appréciations au format CSV.
     */
    exportToCsv() {
        if (appState.generatedResults.length === 0) {
            UI.showNotification('Aucune donnée à exporter.', 'warning');
            return;
        }

        const periods = Utils.getPeriods();
        const headers = [
            "Nom", "Prénom", "Statuts",
            ...periods.flatMap(p => [`Moy ${p}`, `App ${p}`]),
            "App Générée", "Période", "Matière", "Instructions",
            "Forces/Faiblesses", "Pistes", "Date", "Erreur"
        ];

        const clean = (txt) => {
            if (txt == null) return '';
            let str = String(txt).replace(/"/g, '""');
            return (/[",;\n\r]/).test(str) ? `"${str}"` : str;
        };

        const rows = appState.generatedResults.map(r => {
            let row = [r.nom, r.prenom, (r.studentData.statuses || []).join(', ')];

            periods.forEach(p => {
                const d = r.studentData.periods[p];
                const grade = d?.grade;
                row.push(
                    typeof grade === 'number' ? String(grade).replace('.', ',') : '',
                    p === r.studentData.currentPeriod ? '' : d?.appreciation || ''
                );
            });

            row.push(
                Utils.stripMarkdown(r.appreciation),
                r.studentData.currentPeriod,
                r.studentData.subject,
                r.studentData.periods?.[r.studentData.currentPeriod]?.context || '',
                r.strengthsWeaknesses,
                r.nextSteps?.join('; '),
                new Date(r.timestamp).toLocaleString(),
                r.errorMessage
            );

            return row.map(clean).join(';');
        });

        const csvContent = "\uFEFF" + headers.join(';') + '\n' + rows.join('\n');
        const filename = `bulletin-assistant_export_${new Date().toISOString().slice(0, 10)}.csv`;

        StorageManager._downloadFile(csvContent, filename, 'text/csv;charset=utf-8;');
        UI.showNotification('Exporté en CSV.', 'success');
    },

    /**
     * Lance l'impression de la page pour générer un PDF.
     */
    exportToPdf() {
        if (appState.filteredResults.length === 0) {
            UI.showNotification('Aucune donnée à exporter.', 'warning');
            return;
        }

        UI.showNotification('Préparation de l\'export PDF...', 'info');

        const originalTitle = document.title;
        document.title = `Appréciations - ${appState.currentSubject} - ${Utils.getPeriodLabel(appState.currentPeriod, true)}`;

        window.onafterprint = () => {
            document.title = originalTitle;
            window.onafterprint = null;
        };

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
