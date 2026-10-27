/**
 * @fileoverview Seating Chart — Print Exporter (Landscape Header & Print Lifecycle)
 * @module managers/seating/SeatingPrintExporter
 */

import { appState } from '../../state/State.js';
import { Utils } from '../../utils/Utils.js';

export const SeatingPrintExporter = {
    // ========================================================================
    // PRINT
    // ========================================================================

    _printChart() {
        const classData = this._getCurrentClass() || appState.classes?.find(c => c.id === appState.currentClassId);
        const baseClassName = classData?.name || 'Plan de classe';
        const className = this._isVirtualClass(classData) ? `${baseClassName} (Reconstituée)` : baseClassName;
        const activeStudents = (this._students || []).filter(s => !this._isStudentDeparted(s));
        const studentCount = activeStudents.length;
        const dateStr = new Date().toLocaleDateString('fr-FR');

        const originalTitle = document.title;
        const safeName = className.replace(/[^a-zA-Z0-9À-ÿ\-_ ]/g, '').trim().replace(/\s+/g, '-');
        const filePrefix = this._isActivityMode() ? 'Plan-activite' : 'Plan-de-classe';
        document.title = `${filePrefix}_${safeName}_${new Date().toISOString().slice(0, 10)}`;

        const placed = activeStudents.filter(s => this._getPlacedIds().has(s.id)).length;
        const unplaced = Math.max(0, studentCount - placed);
        const unplacedHtml = unplaced > 0
            ? `<div class="sc-print-warning">⚠ ${unplaced} élève${unplaced > 1 ? 's' : ''} non placé${unplaced > 1 ? 's' : ''}</div>`
            : '';

        const isActivity = this._isActivityMode();
        const isStudent = this._isStudentOrientation();
        const modeLabel = isActivity ? ' — Mode Activité' : '';
        const orientationLabel = isActivity ? '' : (isStudent ? ' — Vue Élèves (Projection)' : ' — Vue Enseignant');
        let occupiedStations = 0;
        if (isActivity && this._gridState) {
            for (let r = 0; r < this._gridState.length; r++) {
                for (let c = 0; c < (this._gridState[r]?.length || 0); c++) {
                    if (this._getCellStudentIds(r, c).length > 0) occupiedStations++;
                }
            }
        }
        const countLabel = isActivity && occupiedStations > 0
            ? `(${studentCount} élèves · ${occupiedStations} poste${occupiedStations > 1 ? 's' : ''})`
            : `(${studentCount} élèves)`;

        const header = document.createElement('div');
        header.className = 'sc-print-header';
        header.innerHTML = `
            <span class="sc-print-date">${dateStr}</span>
            <span class="sc-print-class">${className}${modeLabel}${orientationLabel} <span class="sc-print-count">${countLabel}</span></span>
            <span class="sc-print-brand">Bulletin AI</span>
            ${unplacedHtml}
        `;

        const pageStyle = document.createElement('style');
        pageStyle.textContent = '@page { margin: 0 !important; }';
        document.head.appendChild(pageStyle);

        const view = document.getElementById('seatingChartView');
        view?.insertBefore(header, view.firstChild);

        const cleanup = () => {
            document.title = originalTitle;
            header.remove();
            pageStyle.remove();
            window.onafterprint = null;
        };

        window.onafterprint = cleanup;
        window.print();
    }
};
