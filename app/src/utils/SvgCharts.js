/**
 * @fileoverview Générateurs de graphiques SVG sobres et vectoriels pour les exports PDF.
 * Aucune dépendance externe ; couleurs contrastées adaptées à l'impression papier A4.
 * @module utils/SvgCharts
 */

import { GRADE_BRACKETS } from '../config/academicConstants.js';

const BRACKET_PRINT_COLORS = Object.freeze({
    '0-4': '#dc2626',
    '4-8': '#ea580c',
    '8-12': '#d97706',
    '12-16': '#2563eb',
    '16-20': '#16a34a'
});

const escapeAttr = (val) => String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const formatGradeFr = (val) => Number(val).toFixed(1).replace('.', ',');

/**
 * Normalise une distribution (tableau de 5 entiers ou objet par tranche) vers un tableau ordonné.
 * @param {number[]|Object<string, number>|null|undefined} distribution
 * @returns {number[]}
 */
function normalizeDistribution(distribution) {
    const toSafeCount = (val) => {
        const n = Number(val);
        return Number.isFinite(n) ? Math.max(0, n) : 0;
    };
    if (Array.isArray(distribution)) {
        return GRADE_BRACKETS.map((_, i) => toSafeCount(distribution[i]));
    }
    if (distribution && typeof distribution === 'object') {
        return GRADE_BRACKETS.map(b => toSafeCount(distribution[b.id]));
    }
    return GRADE_BRACKETS.map(() => 0);
}

export const SvgCharts = {
    /**
     * Génère un histogramme SVG sobre de répartition des notes sur les 5 tranches canoniques.
     * @param {number[]|Object<string, number>|null|undefined} distribution
     * @param {Object} [options={}]
     * @param {number} [options.width=360]
     * @param {number} [options.height=136]
     * @returns {string} Balise <svg> complète
     */
    renderDistributionHistogramSvg(distribution, options = {}) {
        const width = options.width || 360;
        const height = options.height || 136;
        const counts = normalizeDistribution(distribution);
        const total = counts.reduce((sum, n) => sum + n, 0);
        const maxCount = Math.max(...counts, 0);

        if (total === 0 || maxCount === 0) {
            return `
                <svg class="print-chart-svg" viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="Répartition des notes indisponible">
                    <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="6" fill="#fafafa" stroke="#e5e7eb" />
                    <text x="${width / 2}" y="${height / 2 + 4}" text-anchor="middle" font-size="11" fill="#6b7280">Aucune note disponible pour tracer la répartition</text>
                </svg>
            `.trim();
        }

        const padLeft = 14;
        const padRight = 14;
        const padTop = 26;
        const padBottom = 26;
        const plotW = width - padLeft - padRight;
        const plotH = height - padTop - padBottom;
        const slotW = plotW / GRADE_BRACKETS.length;
        const barW = Math.min(38, Math.round(slotW * 0.56));
        const baselineY = padTop + plotH;

        const barsMarkup = GRADE_BRACKETS.map((bracket, idx) => {
            const count = counts[idx];
            const pct = Math.round((count / total) * 100);
            const rawBarH = count > 0 ? Math.max(6, Math.round((count / maxCount) * plotH)) : 0;
            const x = Math.round(padLeft + idx * slotW + (slotW - barW) / 2);
            const y = baselineY - rawBarH;
            const centerX = Math.round(padLeft + idx * slotW + slotW / 2);
            const fill = BRACKET_PRINT_COLORS[bracket.id] || '#475569';

            const countLabel = count > 0
                ? `<text x="${centerX}" y="${y - 6}" text-anchor="middle" font-size="10.5" font-weight="700" fill="#111827">${count} <tspan font-weight="500" font-size="9" fill="#6b7280">(${pct}%)</tspan></text>`
                : `<text x="${centerX}" y="${baselineY - 6}" text-anchor="middle" font-size="9.5" fill="#9ca3af">0</text>`;

            const barRect = count > 0
                ? `<rect x="${x}" y="${y}" width="${barW}" height="${rawBarH}" rx="4" fill="${fill}" fill-opacity="0.86" />`
                : `<rect x="${x}" y="${baselineY - 2}" width="${barW}" height="2" rx="1" fill="#e5e7eb" />`;

            return `
                <g>
                    ${barRect}
                    ${countLabel}
                    <text x="${centerX}" y="${baselineY + 15}" text-anchor="middle" font-size="10" font-weight="600" fill="#374151">${escapeAttr(bracket.label)}</text>
                </g>
            `;
        }).join('');

        return `
            <svg class="print-chart-svg" viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="Histogramme de répartition des notes">
                <line x1="${padLeft}" y1="${baselineY}" x2="${width - padRight}" y2="${baselineY}" stroke="#d1d5db" stroke-width="1" />
                ${barsMarkup}
            </svg>
        `.trim();
    },

    /**
     * Génère une courbe SVG d'évolution sur les périodes (T1 → T2 → T3 ou S1 → S2).
     * Supporte une série unique (moyenne de classe) ou double (élève vs moyenne de classe).
     * @param {Object} data
     * @param {string[]} data.periods - Liste ordonnée des périodes (ex: ['T1', 'T2', 'T3'])
     * @param {Array<number|null>} [data.studentGrades=null] - Notes de l'élève alignées sur periods
     * @param {Array<number|null>} [data.classAverages=[]] - Moyennes de classe alignées sur periods
     * @param {Object} [options={}]
     * @param {number} [options.width=360]
     * @param {number} [options.height=136]
     * @param {string} [options.studentLabel='Élève']
     * @param {string} [options.classLabel='Moyenne classe']
     * @returns {string} Balise <svg> complète
     */
    renderTrajectorySvg(data = {}, options = {}) {
        const width = options.width || 360;
        const height = options.height || 136;
        const periods = Array.isArray(data.periods) ? data.periods : [];
        const hasStudentSeries = Array.isArray(data.studentGrades);
        const studentGrades = hasStudentSeries ? data.studentGrades : [];
        const classAverages = Array.isArray(data.classAverages) ? data.classAverages : [];

        const validValues = [];
        periods.forEach((_, idx) => {
            const s = studentGrades[idx];
            const c = classAverages[idx];
            if (typeof s === 'number' && Number.isFinite(s)) validValues.push(s);
            if (typeof c === 'number' && Number.isFinite(c)) validValues.push(c);
        });

        if (periods.length === 0 || validValues.length === 0) {
            return `
                <svg class="print-chart-svg" viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="Trajectoire indisponible">
                    <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="6" fill="#fafafa" stroke="#e5e7eb" />
                    <text x="${width / 2}" y="${height / 2 + 4}" text-anchor="middle" font-size="11" fill="#6b7280">Données insuffisantes pour la courbe d'évolution</text>
                </svg>
            `.trim();
        }

        const rawMin = Math.min(...validValues);
        const rawMax = Math.max(...validValues);
        let minY = Math.max(0, Math.floor(rawMin - 2));
        let maxY = Math.min(20, Math.ceil(rawMax + 2));
        if (maxY - minY < 4) {
            minY = Math.max(0, Math.floor((rawMin + rawMax) / 2) - 2);
            maxY = Math.min(20, minY + 4);
        }
        // Inclure la ligne de référence 10/20 si proche de la plage affichée
        if (minY > 8 && minY <= 10) minY = 8;
        if (maxY < 12 && maxY >= 10) maxY = 12;

        const padLeft = 32;
        const padRight = 22;
        const showLegend = hasStudentSeries && studentGrades.some(v => typeof v === 'number' && Number.isFinite(v))
            && classAverages.some(v => typeof v === 'number' && Number.isFinite(v));
        const padTop = showLegend ? 34 : 22;
        const padBottom = 26;
        const plotW = width - padLeft - padRight;
        const plotH = height - padTop - padBottom;

        const getX = (idx) => {
            if (periods.length === 1) return Math.round(padLeft + plotW / 2);
            return Math.round(padLeft + (idx / (periods.length - 1)) * plotW);
        };
        const getY = (val) => {
            const ratio = (val - minY) / (maxY - minY || 1);
            return Math.round(padTop + plotH - ratio * plotH);
        };

        // Repères horizontaux (min, 10/20 si dans la plage, max)
        const gridValues = [minY, maxY];
        if (minY < 10 && maxY > 10) gridValues.splice(1, 0, 10);

        const gridMarkup = gridValues.map(val => {
            const y = getY(val);
            const isPassLine = val === 10;
            return `
                <line x1="${padLeft}" y1="${y}" x2="${width - padRight}" y2="${y}"
                    stroke="${isPassLine ? '#cbd5e1' : '#f1f5f9'}"
                    stroke-width="1"
                    ${isPassLine ? 'stroke-dasharray="3 3"' : ''} />
                <text x="${padLeft - 6}" y="${y + 3}" text-anchor="end" font-size="9" fill="${isPassLine ? '#64748b' : '#9ca3af'}">${val}</text>
            `;
        }).join('');

        const buildSeriesPoints = (values) => periods
            .map((p, idx) => {
                const v = values[idx];
                if (typeof v !== 'number' || !Number.isFinite(v)) return null;
                return { idx, period: p, value: v, x: getX(idx), y: getY(v) };
            })
            .filter(Boolean);

        const classPts = buildSeriesPoints(classAverages);
        const studentPts = buildSeriesPoints(studentGrades);
        const isClassPrimary = !hasStudentSeries || studentPts.length === 0;
        const studentByIdx = new Map(studentPts.map(p => [p.idx, p]));
        const classByIdx = new Map(classPts.map(p => [p.idx, p]));
        const minLabelY = showLegend ? 24 : 12;
        const maxLabelY = height - 16;
        const clampLabelY = (y) => Math.min(maxLabelY, Math.max(minLabelY, y));

        let classMarkup = '';
        if (classPts.length > 0) {
            const polyline = classPts.length >= 2
                ? `<polyline fill="none" stroke="${isClassPrimary ? '#1d4ed8' : '#64748b'}" stroke-width="${isClassPrimary ? '2.2' : '1.7'}" ${isClassPrimary ? '' : 'stroke-dasharray="4 3"'} points="${classPts.map(p => `${p.x},${p.y}`).join(' ')}" />`
                : '';
            const dots = classPts.map(p => {
                const studentPeer = studentByIdx.get(p.idx);
                // Place the higher value's label above and the lower value's label below to prevent overlaps
                const placeAbove = isClassPrimary || (studentPeer ? p.value > studentPeer.value : false);
                const rawLabelY = placeAbove ? p.y - 8 : p.y + 13;
                const labelEl = `<text x="${p.x}" y="${clampLabelY(rawLabelY)}" text-anchor="middle" font-size="9.5" font-weight="${isClassPrimary ? '700' : '600'}" fill="${isClassPrimary ? '#1e3a8a' : '#64748b'}">${formatGradeFr(p.value)}</text>`;
                const circle = isClassPrimary
                    ? `<circle cx="${p.x}" cy="${p.y}" r="4" fill="#1d4ed8" stroke="#ffffff" stroke-width="1.5" />`
                    : `<circle cx="${p.x}" cy="${p.y}" r="3.2" fill="#ffffff" stroke="#64748b" stroke-width="1.6" />`;
                return `${circle}${labelEl}`;
            }).join('');
            classMarkup = `${polyline}${dots}`;
        }

        let studentMarkup = '';
        if (studentPts.length > 0) {
            const polyline = studentPts.length >= 2
                ? `<polyline fill="none" stroke="#1d4ed8" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" points="${studentPts.map(p => `${p.x},${p.y}`).join(' ')}" />`
                : '';
            const dots = studentPts.map(p => {
                const classPeer = classByIdx.get(p.idx);
                const placeAbove = !classPeer || p.value >= classPeer.value;
                const rawLabelY = placeAbove ? p.y - 8 : p.y + 14;
                return `
                    <circle cx="${p.x}" cy="${p.y}" r="4.2" fill="#1d4ed8" stroke="#ffffff" stroke-width="1.6" />
                    <text x="${p.x}" y="${clampLabelY(rawLabelY)}" text-anchor="middle" font-size="10.5" font-weight="700" fill="#111827">${formatGradeFr(p.value)}</text>
                `;
            }).join('');
            studentMarkup = `${polyline}${dots}`;
        }

        const xLabels = periods.map((p, idx) => `
            <text x="${getX(idx)}" y="${height - 5}" text-anchor="middle" font-size="10" font-weight="600" fill="#374151">${escapeAttr(p)}</text>
        `).join('');

        const rawStudentLabel = String(options.studentLabel || 'Élève');
        const studentLabel = escapeAttr(rawStudentLabel);
        const classLabel = escapeAttr(options.classLabel || 'Moyenne classe');
        const classLegendX = Math.max(80, Math.round(28 + rawStudentLabel.length * 5.8));
        const legendMarkup = showLegend ? `
            <g transform="translate(${padLeft}, 9)">
                <line x1="0" y1="0" x2="14" y2="0" stroke="#1d4ed8" stroke-width="2.4" />
                <circle cx="7" cy="0" r="2.8" fill="#1d4ed8" />
                <text x="19" y="3" font-size="9.5" font-weight="600" fill="#111827">${studentLabel}</text>
                <line x1="${classLegendX}" y1="0" x2="${classLegendX + 14}" y2="0" stroke="#64748b" stroke-width="1.7" stroke-dasharray="3 2" />
                <circle cx="${classLegendX + 7}" cy="0" r="2.5" fill="#ffffff" stroke="#64748b" stroke-width="1.4" />
                <text x="${classLegendX + 19}" y="3" font-size="9.5" font-weight="500" fill="#64748b">${classLabel}</text>
            </g>
        ` : '';

        return `
            <svg class="print-chart-svg" viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="Courbe d'évolution des notes">
                ${legendMarkup}
                ${gridMarkup}
                ${classMarkup}
                ${studentMarkup}
                ${xLabels}
            </svg>
        `.trim();
    }
};
