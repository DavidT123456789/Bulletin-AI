/**
 * @fileoverview Seating Chart — Print Exporter (Landscape Header & Print Lifecycle)
 * @module managers/seating/SeatingPrintExporter
 */

import { appState } from '../../state/State.js';
import { Utils } from '../../utils/Utils.js';
import { DOMHelper } from '../../utils/DOMHelper.js';
import { UI } from '../UIManager.js';
import { TooltipsUI } from '../TooltipsManager.js';

// A4 Landscape (297×210mm @ 96dpi ≈ 1122×794px) minus #seatingChartView padding (7mm 9mm ≈ 26×34px per edge)
const PRINT_AVAIL_WIDTH_PX = 1016;
const PRINT_PAGE_INNER_HEIGHT_PX = 740;
const PRINT_HEADER_HEIGHT_PX = 44;
const PRINT_WARNING_HEIGHT_PX = 22;
const PRINT_LEGEND_HEIGHT_PX = 28;
const PRINT_VERTICAL_BUFFER_PX = 16;
const PRINT_MIN_SCALE = 0.4;
const PRINT_MAX_SCALE = 1.55;

const PRINT_COURSE_METRICS = Object.freeze({
    cellW: 88,
    cellH: 96,
    gap: 8,
    gridPad: 8,
    deskH: 54
});

const PRINT_ACTIVITY_METRICS = Object.freeze({
    cellW: 118,
    cellH: 114,
    gap: 10,
    gridPad: 8,
    deskH: 0
});

export const SeatingPrintExporter = {
    // ========================================================================
    // PRINT
    // ========================================================================

    _computePrintScale({ rows, cols, isActivity = false, hasWarning = false, hasLegend = false } = {}) {
        const safeRows = Math.max(1, Number(rows) || 1);
        const safeCols = Math.max(1, Number(cols) || 1);
        const metrics = isActivity ? PRINT_ACTIVITY_METRICS : PRINT_COURSE_METRICS;

        const boardW = safeCols * metrics.cellW + Math.max(0, safeCols - 1) * metrics.gap + metrics.gridPad;
        const boardH = safeRows * metrics.cellH + Math.max(0, safeRows - 1) * metrics.gap + metrics.gridPad + metrics.deskH;

        const reservedH = PRINT_HEADER_HEIGHT_PX
            + (hasWarning ? PRINT_WARNING_HEIGHT_PX : 0)
            + (hasLegend ? PRINT_LEGEND_HEIGHT_PX : 0)
            + PRINT_VERTICAL_BUFFER_PX;
        const availH = Math.max(200, PRINT_PAGE_INNER_HEIGHT_PX - reservedH);

        const rawScale = Math.min(PRINT_AVAIL_WIDTH_PX / boardW, availH / boardH);
        const floored = Math.floor(rawScale * 100) / 100;
        return Math.min(PRINT_MAX_SCALE, Math.max(PRINT_MIN_SCALE, floored));
    },

    _collectPrintLegendItems() {
        const placedIds = this._getPlacedIds?.();
        if (!placedIds || placedIds.size === 0 || !Array.isArray(this._students)) return [];

        const seenTypes = new Set();
        const ulisTokens = new Set();
        const deviceTokens = new Set();

        for (const student of this._students) {
            if (!student || !placedIds.has(student.id)) continue;
            const badgeInfo = this._getStudentStatusBadgeInfo?.(student);
            if (!badgeInfo?.type) continue;
            seenTypes.add(badgeInfo.type);
            if (badgeInfo.type === 'ulis' && badgeInfo.label) {
                badgeInfo.label.split(' • ').forEach(token => {
                    const t = token.trim();
                    if (t === 'ULIS' || t === 'AESH') ulisTokens.add(t);
                });
            } else if (badgeInfo.type === 'device' && badgeInfo.label) {
                badgeInfo.label.split(' • ').forEach(token => {
                    const t = token.trim();
                    if (t) deviceTokens.add(t);
                });
            }
        }

        const items = [];
        if (seenTypes.has('new')) {
            items.push({ type: 'new', className: 'sc-badge-new', label: 'Nouveau' });
        }
        if (seenTypes.has('depart')) {
            items.push({ type: 'depart', className: 'sc-badge-depart', label: 'Départ' });
        }
        if (seenTypes.has('ulis')) {
            const label = ulisTokens.size > 0 ? Array.from(ulisTokens).join(' / ') : 'ULIS / AESH';
            items.push({ type: 'ulis', className: 'sc-badge-ulis', label });
        }
        if (seenTypes.has('device')) {
            const label = deviceTokens.size > 0 ? Array.from(deviceTokens).join(', ') : 'Dispositif';
            items.push({ type: 'device', className: 'sc-badge-device', label });
        }
        if (seenTypes.has('delegate')) {
            items.push({ type: 'delegate', className: 'sc-badge-delegate', label: 'Délégué' });
        }
        return items;
    },

    _printChart() {
        this._closeStatusDotsPopover?.();
        const classData = this._getCurrentClass() || appState.classes?.find(c => c.id === appState.currentClassId);
        const baseClassName = classData?.name || 'Plan de classe';
        const className = this._isVirtualClass(classData) ? `${baseClassName} (Reconstituée)` : baseClassName;
        const activeStudents = (this._students || []).filter(s => !this._isStudentDeparted(s));
        const studentCount = activeStudents.length;
        const dateStr = new Date().toLocaleDateString('fr-FR');

        const safeName = className.replace(/[^a-zA-Z0-9À-ÿ\-_ ]/g, '').trim().replace(/\s+/g, '-');
        const filePrefix = this._isActivityMode() ? 'Plan-activite' : 'Plan-de-classe';
        const title = `${filePrefix}_${safeName}_${new Date().toISOString().slice(0, 10)}`;

        const placedIds = this._getPlacedIds();
        const placed = activeStudents.filter(s => placedIds.has(s.id)).length;
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
            <span class="sc-print-class">${Utils.escapeHtml(className)}${modeLabel}${orientationLabel} <span class="sc-print-count">${countLabel}</span></span>
            <span class="sc-print-brand">Bulletin AI</span>
            ${unplacedHtml}
        `;

        const legendItems = this._collectPrintLegendItems();
        let legend = null;
        if (legendItems.length > 0) {
            legend = document.createElement('div');
            legend.className = 'sc-print-legend';
            legend.innerHTML = legendItems.map(item => `
                <span class="sc-print-legend-item">
                    <span class="sc-print-legend-dot ${item.className}" aria-hidden="true"></span>
                    <span>${Utils.escapeHtml(item.label)}</span>
                </span>
            `).join('');
        }

        const view = document.getElementById('seatingChartView');
        const board = document.getElementById('scClassroomBoard');
        const shouldCropForPrint = isActivity && !this._isLocked;

        DOMHelper.runPrintSession({
            mode: 'seating',
            title,
            pageCss: '@page { size: landscape; margin: 0 !important; }',
            setup: () => {
                view?.insertBefore(header, view.firstChild);
                if (legend) view?.appendChild(legend);
                if (shouldCropForPrint) {
                    this._isPrinting = true;
                    this._renderGrid();
                }
                const bounds = this._getEffectiveGridBounds?.() || {
                    rowCount: this._getRows?.() || 5,
                    colCount: this._getCols?.() || 6
                };
                const printScale = this._computePrintScale({
                    rows: bounds.rowCount,
                    cols: bounds.colCount,
                    isActivity,
                    hasWarning: unplaced > 0,
                    hasLegend: legendItems.length > 0
                });
                board?.style.setProperty('--sc-print-scale', String(printScale));
            },
            cleanup: () => {
                board?.style.removeProperty('--sc-print-scale');
                if (shouldCropForPrint) {
                    this._isPrinting = false;
                    this._renderGrid();
                    TooltipsUI?.initTooltips?.(document.getElementById('scGridContainer'));
                    if (this._activeSearchTerm) {
                        this._applySearchHighlight?.(this._activeSearchTerm);
                    }
                }
                header.remove();
                legend?.remove();
            }
        });
        if (placed >= 8) {
            UI?.recordSupportMilestone?.('seating-action', 1, { classId: classData?.id, isPrint: true });
        }
    }
};
