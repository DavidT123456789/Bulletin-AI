import { DOM } from '../utils/DOM.js';
import { DOMHelper } from '../utils/DOMHelper.js';
import { Utils } from '../utils/Utils.js';
import { appState } from '../state/State.js';
import { UI } from './UIManager.js';
import { StorageManager } from './StorageManager.js';

export const ImportManager = {
    updateMassImportPreview() {
        const text = DOM.massData.value;
        const hasText = text.trim() !== '';
        DOM.clearImportBtn.style.display = hasText ? 'inline-flex' : 'none';

        if (!hasText) {
            DOM.massImportPreview.style.display = 'none';
            return;
        }

        const lines = text.split('\n').filter(l => l.trim());

        if (lines.length === 0) {
            DOM.massImportPreview.style.display = 'none';
            return;
        }

        const separator = Utils.detectSeparator(text);
        const firstLineData = lines[0].split(separator).map(c => c.trim());
        const mappingOptions = this._getMappingOptions();

        let tableHTML = '<div class="import-preview-table-wrapper"><table class="import-preview-table"><thead><tr>';
        firstLineData.forEach((_, i) => {
            let optionsHTML = mappingOptions.map(o => `<option value="${o.v}">${o.t}</option>`).join('');
            tableHTML += `<th><select class="column-mapping-select" data-index="${i}">${optionsHTML}</select></th>`;
        });
        tableHTML += '</tr></thead><tbody>';

        const previewLines = lines.slice(0, 5);
        previewLines.forEach(line => {
            const cells = line.split(separator).map(c => c.trim());
            tableHTML += '<tr>';
            firstLineData.forEach((_, i) => {
                tableHTML += `<td>${cells[i] || ''}</td>`;
            });
            tableHTML += '</tr>';
        });
        tableHTML += '</tbody></table></div>';

        if (lines.length > 5) {
            tableHTML += `<div class="preview-more-lines">... et ${lines.length - 5} autres lignes</div>`;
        }

        DOM.massImportPreview.innerHTML = tableHTML;
        DOM.massImportPreview.style.display = 'block';

        const selects = DOM.massImportPreview.querySelectorAll('select');
        this._guessInitialMapping(Array.from(selects), firstLineData, mappingOptions);
    },

    _getMappingOptions() {
        return [
            { v: 'IGNORE', t: 'Ignorer' },
            { v: 'NOM_PRENOM', t: 'Nom & Prénom' },
            { v: 'STATUT', t: 'Statut' },
            { v: 'INSTRUCTIONS', t: 'Contexte (global)' },
            ...Utils.getPeriods().flatMap(p => [
                { v: `MOY_${p}`, t: `Moy. ${p}` },
                { v: `APP_${p}`, t: `Appr. ${p}` },
                { v: `CTX_${p}`, t: `Contexte ${p}` }
            ])
        ];
    },

    _guessInitialMapping(selects, firstLineData, availableOptions) {
        const userSavedFormatString = appState.massImportFormats[appState.periodSystem]?.[appState.currentPeriod];
        if (userSavedFormatString) {
            const savedFormat = userSavedFormatString.split(' | ').map(tag => tag.trim().replace(/[{}]/g, ''));
            selects.forEach((select, i) => {
                const savedTag = savedFormat[i];
                if (savedTag && availableOptions.some(o => o.v === savedTag)) {
                    select.value = savedTag;
                } else {
                    select.value = 'IGNORE';
                }
            });
            return;
        }

        const isHeaderLike = firstLineData.some(cell => /[a-zA-Z]{3,}/.test(cell)) && !firstLineData.some(cell => Utils.isNumeric(cell));
        if (isHeaderLike) {
            const headerKeywordMap = {
                'NOM_PRENOM': ['nom', 'prénom', 'eleve', 'élève'],
                'STATUT': ['statut'],
                'INSTRUCTIONS': ['instructions', 'contexte', 'remarque'],
            };
            const periodKeywordMap = { 'MOY_': ['moy', 'note', 'moyenne'], 'APP_': ['app', 'appréciation', 'commentaire'] };
            const guesses = Array(selects.length).fill('IGNORE');
            const assigned = new Set();

            firstLineData.forEach((header, index) => {
                const h = header.toLowerCase().replace(/[éèêë]/g, 'e');
                for (const [tag, keywords] of Object.entries(headerKeywordMap)) {
                    if (keywords.some(kw => h.includes(kw)) && !assigned.has(tag)) {
                        guesses[index] = tag;
                        assigned.add(tag);
                        return;
                    }
                }
                for (const [tagPrefix, keywords] of Object.entries(periodKeywordMap)) {
                    const periodMatch = h.match(/(t|s)\s?(\d)/);
                    if (periodMatch && keywords.some(kw => h.includes(kw))) {
                        const tag = tagPrefix + periodMatch[1].toUpperCase() + periodMatch[2];
                        if (!assigned.has(tag) && availableOptions.some(o => o.v === tag)) {
                            guesses[index] = tag;
                            assigned.add(tag);
                            return;
                        }
                    }
                }
            });

            if (guesses.includes('NOM_PRENOM')) {
                selects.forEach((select, i) => select.value = guesses[i]);
                return;
            }
        }

        const guesses = Array(selects.length).fill('IGNORE');
        const assignedIndices = new Set();

        const isLikelyGrade = (d) => Utils.isNumeric(d);
        const isLongText = (d) => typeof d === 'string' && d.length > 5;
        const isShortTextOrEmpty = (d) => typeof d === 'string' && d.length <= 10 && !isLikelyGrade(d);

        const nomIndex = firstLineData.findIndex(d => typeof d === 'string' && d.split(' ').length >= 2 && /[a-zA-Z]/.test(d));
        if (nomIndex !== -1) {
            guesses[nomIndex] = 'NOM_PRENOM';
            assignedIndices.add(nomIndex);
        }

        let instrIndex = -1;
        for (let i = guesses.length - 1; i >= 0; i--) {
            if (!assignedIndices.has(i) && typeof firstLineData[i] === 'string' && firstLineData[i].trim() !== '' && !isLikelyGrade(firstLineData[i])) {
                instrIndex = i;
                guesses[i] = 'INSTRUCTIONS';
                assignedIndices.add(i);
                break;
            }
        }

        const nomColIndex = guesses.indexOf('NOM_PRENOM');
        if (nomColIndex !== -1) {
            for (let i = nomColIndex + 1; i < guesses.length; i++) {
                if (!assignedIndices.has(i) && isShortTextOrEmpty(firstLineData[i])) {
                    guesses[i] = 'STATUT';
                    assignedIndices.add(i);
                    break;
                }
            }
        }

        const availablePeriods = Utils.getPeriods().filter(p => availableOptions.some(o => o.v === `MOY_${p}`));
        let periodIdx = 0;

        for (let i = 0; i < guesses.length; i++) {
            if (assignedIndices.has(i)) continue;

            const currentPeriod = availablePeriods[periodIdx];
            if (!currentPeriod) break;

            const moyTag = `MOY_${currentPeriod}`;
            const appTag = `APP_${currentPeriod}`;

            if (isLikelyGrade(firstLineData[i])) {
                guesses[i] = moyTag;
                assignedIndices.add(i);

                let nextUnassignedIndex = -1;
                for (let j = i + 1; j < guesses.length; j++) {
                    if (!assignedIndices.has(j)) {
                        nextUnassignedIndex = j;
                        break;
                    }
                }

                if (nextUnassignedIndex !== -1 && isLongText(firstLineData[nextUnassignedIndex])) {
                    guesses[nextUnassignedIndex] = appTag;
                    assignedIndices.add(nextUnassignedIndex);
                }
                periodIdx++;
            }
        }

        selects.forEach((select, i) => select.value = guesses[i]);
    },

    showOutputProgressArea() { const area = document.getElementById('mass-import-progress-output-area'); if (area) area.style.display = 'flex'; },
    hideOutputProgressArea() { const area = document.getElementById('mass-import-progress-output-area'); if (area) area.style.display = 'none'; },
    updateOutputProgress(cur, total) { const p = total > 0 ? (cur / total) * 100 : 0; if (DOM.outputProgressFill) DOM.outputProgressFill.style.width = `${p}%`; if (DOM.outputProgressText) DOM.outputProgressText.textContent = `${cur}/${total} traités`; },
    resetProgressBar() { this.updateOutputProgress(0, 0); },

    forgetSavedImportFormat() {
        if (appState.massImportFormats[appState.periodSystem]) {
            delete appState.massImportFormats[appState.periodSystem][appState.currentPeriod];
        }
        StorageManager.saveAppState();
        UI.showNotification("Format mémorisé oublié.", "info");

        const text = DOM.massData.value;
        const lines = text.split('\n').filter(l => l.trim());
        if (lines.length > 0) {
            const separator = Utils.detectSeparator(text);
            const firstLineData = lines[0].split(separator).map(c => c.trim());
            const selects = DOM.massImportPreview.querySelectorAll('select');
            const options = this._getMappingOptions();
            this._guessInitialMapping(Array.from(selects), firstLineData, options);
        }

        const infoBox = DOM.importSavedFormatInfo;
        if (infoBox) infoBox.style.display = 'none';

        this.updateMassImportPreview();
    }
};
