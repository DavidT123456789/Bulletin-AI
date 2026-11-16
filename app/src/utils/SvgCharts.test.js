/**
 * @fileoverview Tests unitaires pour SvgCharts
 */

import { describe, it, expect } from 'vitest';
import { SvgCharts } from './SvgCharts.js';

describe('SvgCharts', () => {
    describe('renderDistributionHistogramSvg', () => {
        it('retourne un SVG de repli lisible lorsque la distribution est vide ou nulle', () => {
            const emptyArrSvg = SvgCharts.renderDistributionHistogramSvg([0, 0, 0, 0, 0]);
            expect(emptyArrSvg).toContain('<svg');
            expect(emptyArrSvg).toContain('Aucune note disponible');
            expect(emptyArrSvg).not.toContain('rx="4"');

            const nullSvg = SvgCharts.renderDistributionHistogramSvg(null);
            expect(nullSvg).toContain('Aucune note disponible');
        });

        it('rend les 5 tranches et les pourcentages depuis un tableau ordonné', () => {
            const svg = SvgCharts.renderDistributionHistogramSvg([1, 2, 3, 2, 2]);
            expect(svg).toContain('<svg class="print-chart-svg"');
            expect(svg).toContain('&lt; 4');
            expect(svg).toContain('4 – 8');
            expect(svg).toContain('8 – 12');
            expect(svg).toContain('12 – 16');
            expect(svg).toContain('16 – 20');
            expect(svg).toContain('3 <tspan');
            expect(svg).toContain('(30%)');
        });

        it('accepte également un objet de distribution mappé par identifiant de tranche', () => {
            const svg = SvgCharts.renderDistributionHistogramSvg({
                '0-4': 0,
                '4-8': 1,
                '8-12': 4,
                '12-16': 5,
                '16-20': 0
            });
            expect(svg).toContain('(50%)');
            expect(svg).toContain('(40%)');
            expect(svg).toContain('>0</text>');
        });
    });

    describe('renderTrajectorySvg', () => {
        it('retourne un SVG de repli lorsque aucune note valide n est fournie', () => {
            const svg = SvgCharts.renderTrajectorySvg({
                periods: ['T1', 'T2'],
                studentGrades: [null, null],
                classAverages: [null, null]
            });
            expect(svg).toContain('<svg');
            expect(svg).toContain('Données insuffisantes');
        });

        it('trace une courbe classe seule sans légende double', () => {
            const svg = SvgCharts.renderTrajectorySvg({
                periods: ['T1', 'T2', 'T3'],
                classAverages: [11.2, 12.5, 13.0]
            });
            expect(svg).toContain('<polyline');
            expect(svg).toContain('11,2');
            expect(svg).toContain('12,5');
            expect(svg).toContain('13,0');
            expect(svg).not.toContain('Moyenne classe');
        });

        it('trace la série élève + moyenne classe avec légende et gère les trous null', () => {
            const svg = SvgCharts.renderTrajectorySvg({
                periods: ['T1', 'T2', 'T3'],
                studentGrades: [14.5, null, 16.0],
                classAverages: [11.0, 11.5, 12.0]
            });
            expect(svg).toContain('Élève');
            expect(svg).toContain('Moyenne classe');
            expect(svg).toContain('14,5');
            expect(svg).toContain('16,0');
            expect(svg).toContain('11,5');
            expect(svg).toContain('T1');
            expect(svg).toContain('T2');
            expect(svg).toContain('T3');
        });

        it('échappe les labels personnalisés contre les injections SVG/XSS', () => {
            const svg = SvgCharts.renderTrajectorySvg(
                { periods: ['S1', 'S2'], studentGrades: [12, 14], classAverages: [11, 12] },
                { studentLabel: '<script>alert(1)</script>', classLabel: '3°1 "A"' }
            );
            expect(svg).not.toContain('<script>');
            expect(svg).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
            expect(svg).toContain('3°1 &quot;A&quot;');
        });
    });
});
