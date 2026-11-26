import { describe, it, expect, beforeEach } from 'vitest';
import { appState } from '../../state/State.js';
import { FocusPanelGrades } from './FocusPanelGrades.js';

describe('FocusPanelGrades.getTooltipText()', () => {
    beforeEach(() => {
        appState.periodSystem = 'semestres';
    });

    it('renders base grade tooltip when no past appreciation exists', () => {
        const tooltip = FocusPanelGrades.getTooltipText('S1', 12.5, 4, false, '');
        expect(tooltip).toBe('Semestre 1 : 12,5 (Moyenne sur 4 évaluations)');
    });

    it('includes escaped and truncated past appreciation preview for previous periods', () => {
        const longText = '**Très bon** <img src=x onerror=alert(1)> a < b & "ok" ' + 'a'.repeat(200);
        const tooltip = FocusPanelGrades.getTooltipText('S1', 15, undefined, false, longText);

        expect(tooltip).toContain('Semestre 1 : 15,0');
        expect(tooltip).toContain('<span class="grade-tooltip-appreciation">« Très bon a &lt; b &amp; &quot;ok&quot; ');
        expect(tooltip).toContain('… »</span>');
        expect(tooltip).not.toContain('<img');
        expect(tooltip).not.toContain('**');
    });

    it('never includes appreciation preview for the current period', () => {
        const tooltip = FocusPanelGrades.getTooltipText('S2', 14, 2, true, 'Ne doit pas apparaître');
        expect(tooltip).toBe('Semestre 2 (Période actuelle) : 14,0 (Moyenne sur 2 évaluations)');
        expect(tooltip).not.toContain('grade-tooltip-appreciation');
    });
});
