import { describe, it, expect, beforeEach, vi } from 'vitest';
import { appState, runtimeState } from '../../state/State.js';
import { TooltipsUI } from '../TooltipsManager.js';
import { FocusPanelGrades } from './FocusPanelGrades.js';
import { FocusPanelManager } from '../FocusPanelManager.js';

vi.mock('../../services/DBService.js', () => ({
    DBService: {
        putAll: vi.fn().mockResolvedValue(true)
    }
}));

describe('FocusPanelGrades.parseGradeInput() & formatGradeValue()', () => {
    it('parses French comma and dot decimals, integers, and empty values', () => {
        expect(FocusPanelGrades.parseGradeInput('')).toEqual({ empty: true, valid: true, value: null, clamped: false });
        expect(FocusPanelGrades.parseGradeInput('   ')).toEqual({ empty: true, valid: true, value: null, clamped: false });
        expect(FocusPanelGrades.parseGradeInput(null)).toEqual({ empty: true, valid: true, value: null, clamped: false });
        expect(FocusPanelGrades.parseGradeInput('12')).toEqual({ empty: false, valid: true, value: 12, clamped: false });
        expect(FocusPanelGrades.parseGradeInput('10,5')).toEqual({ empty: false, valid: true, value: 10.5, clamped: false });
        expect(FocusPanelGrades.parseGradeInput('10.5')).toEqual({ empty: false, valid: true, value: 10.5, clamped: false });
        expect(FocusPanelGrades.parseGradeInput('12,75')).toEqual({ empty: false, valid: true, value: 12.8, clamped: false });
        expect(FocusPanelGrades.parseGradeInput('0')).toEqual({ empty: false, valid: true, value: 0, clamped: false });
    });

    it('clamps values above 20 and rejects negative or non-numeric garbage', () => {
        expect(FocusPanelGrades.parseGradeInput('25')).toEqual({ empty: false, valid: true, value: 20, clamped: true });
        expect(FocusPanelGrades.parseGradeInput('20,5')).toEqual({ empty: false, valid: true, value: 20, clamped: true });
        expect(FocusPanelGrades.parseGradeInput('-3')).toEqual({ empty: false, valid: false, value: null, clamped: false });
        expect(FocusPanelGrades.parseGradeInput('12abc')).toEqual({ empty: false, valid: false, value: null, clamped: false });
        expect(FocusPanelGrades.parseGradeInput('10,5,2')).toEqual({ empty: false, valid: false, value: null, clamped: false });
    });

    it('formats numeric grades with French comma and handles null/NaN safely', () => {
        expect(FocusPanelGrades.formatGradeValue(12)).toBe('12,0');
        expect(FocusPanelGrades.formatGradeValue(10.5)).toBe('10,5');
        expect(FocusPanelGrades.formatGradeValue(null)).toBe('');
        expect(FocusPanelGrades.formatGradeValue(NaN)).toBe('');
    });
});

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

    it('includes edit hint and never includes appreciation preview for the current period', () => {
        const tooltip = FocusPanelGrades.getTooltipText('S2', 14, 2, true, 'Ne doit pas apparaître');
        expect(tooltip).toBe('Semestre 2 (Période actuelle) : 14,0 (Moyenne sur 2 évaluations)<br><span class="grade-tooltip-hint">Cliquer pour modifier</span>');
        expect(tooltip).not.toContain('grade-tooltip-appreciation');
    });
});

describe('FocusPanelGrades inline interactions & accessibility', () => {
    beforeEach(() => {
        appState.periodSystem = 'semestres';
        appState.currentPeriod = 'S2';
        runtimeState.data.generatedResults = [
            {
                id: 's1',
                nom: 'DURAND',
                prenom: 'Sophie',
                studentData: {
                    statuses: [],
                    periods: {
                        S1: { grade: 9.0, appreciation: 'Des efforts à poursuivre.' },
                        S2: { grade: 10.5, appreciation: '' }
                    }
                }
            }
        ];
        appState.generatedResults = runtimeState.data.generatedResults;
        appState.filteredResults = runtimeState.data.generatedResults;

        document.body.innerHTML = `
            <div id="focusPanel" class="open" tabindex="-1">
                <div class="focus-main-page">
                    <div class="focus-header">
                        <div id="focusStudentName"></div>
                        <div class="focus-header-read"></div>
                        <div class="focus-header-edit"></div>
                        <div id="focusAvatarContainer"></div>
                        <div id="focusStatusBadges"></div>
                        <div class="focus-grades-strip">
                            <div class="grades-wrapper">
                                <div id="focusPreviousGrades" class="previous-grades-inline"></div>
                                <div class="context-grade-group">
                                    <label for="focusCurrentGradeInput" id="focusCurrentGradeLabel">S2</label>
                                    <input type="text" id="focusCurrentGradeInput" class="context-grade-input" />
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="focus-content">
                        <textarea id="focusContextInput"></textarea>
                        <span id="focusAppreciationTitle"></span>
                        <span id="focusAppreciationBadge"></span>
                        <div id="focusAppreciationText" contenteditable="true"></div>
                        <button id="focusGenerateBtn"></button>
                        <button id="focusCopyBtn"><span class="btn-copy-label">Copier</span></button>
                        <div id="focusRefinementOptions"></div>
                        <div id="focusWordCount"></div>
                        <div id="focusSourceIndicator"></div>
                        <div id="focusJournalSection"></div>
                        <div id="focusJournalContent"></div>
                    </div>
                </div>
            </div>
            <div id="focusPanelBackdrop"></div>
        `;

        FocusPanelManager._listenersAttached = false;
        FocusPanelManager.init(null, null);
        FocusPanelManager.currentStudentId = 's1';
        FocusPanelGrades.renderGradesAndContext(FocusPanelManager, appState.generatedResults[0], 'S2');
    });

    it('makes past grade chip with appreciation keyboard-focusable, configures Tippy click/touch props, and toggles via keyboard', () => {
        const setPropsMock = vi.fn();
        const tippyMock = {
            state: { isVisible: false },
            setProps: setPropsMock,
            show: vi.fn(() => { tippyMock.state.isVisible = true; }),
            hide: vi.fn(() => { tippyMock.state.isVisible = false; })
        };
        const initSpy = vi.spyOn(TooltipsUI, 'initTooltips').mockImplementation((container) => {
            container?.querySelectorAll?.('.previous-grade-chip.has-appreciation').forEach((el) => {
                el._tippy = tippyMock;
            });
        });

        FocusPanelGrades.renderGradesAndContext(FocusPanelManager, appState.generatedResults[0], 'S2');

        const chip = document.querySelector('#focusPreviousGrades .previous-grade-chip.has-appreciation');
        expect(chip).not.toBeNull();
        expect(chip.getAttribute('role')).toBe('button');
        expect(chip.tabIndex).toBe(0);
        expect(chip.getAttribute('aria-label')).toContain('Semestre 1');
        expect(setPropsMock).toHaveBeenCalledWith({ trigger: 'mouseenter focus click', touch: true });

        chip.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        expect(tippyMock.show).toHaveBeenCalledTimes(1);
        chip.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        expect(tippyMock.hide).toHaveBeenCalledTimes(1);
        initSpy.mockRestore();
    });

    it('re-initializes evolution arrow tooltip when current grade is edited', () => {
        const cleanupSpy = vi.spyOn(TooltipsUI, 'cleanupTooltipsIn');
        const initSpy = vi.spyOn(TooltipsUI, 'initTooltips');
        const gradeInput = document.getElementById('focusCurrentGradeInput');
        const arrowEl = document.getElementById('focusCurrentEvolutionArrow');

        gradeInput.value = '14';
        gradeInput.dispatchEvent(new Event('input', { bubbles: true }));

        expect(cleanupSpy).toHaveBeenCalledWith(arrowEl);
        expect(initSpy).toHaveBeenCalledWith(arrowEl);
        expect(arrowEl.innerHTML).toContain('+5,0 pts');
        cleanupSpy.mockRestore();
        initSpy.mockRestore();
    });

    it('handles empty-string stored grades without rendering NaN and applies live color in creation mode', () => {
        appState.generatedResults[0].studentData.periods.S2.grade = '';
        FocusPanelGrades.renderGradesAndContext(FocusPanelManager, appState.generatedResults[0], 'S2');

        const gradeInput = document.getElementById('focusCurrentGradeInput');
        expect(gradeInput.value).toBe('');
        expect(gradeInput.value).not.toContain('NaN');

        // Creation mode: live input still styles the grade with its range color class
        FocusPanelManager.currentStudentId = null;
        FocusPanelGrades.renderCreationModePeriod(FocusPanelManager, 'S2');
        gradeInput.value = '17,5';
        gradeInput.dispatchEvent(new Event('input', { bubbles: true }));
        expect(gradeInput.classList.contains('grade-range-16-20')).toBe(true);
    });

    it('resets focus grade snapshot when switching students so Escape never leaks a previous student grade', () => {
        const gradeInput = document.getElementById('focusCurrentGradeInput');
        gradeInput.dispatchEvent(new FocusEvent('focus'));
        expect(FocusPanelManager._hasGradeBeforeFocus).toBe(true);

        const secondStudent = {
            id: 's2',
            nom: 'MARTIN',
            prenom: 'Léo',
            studentData: { statuses: [], periods: { S1: { grade: 11 }, S2: { grade: 15 } } }
        };
        appState.generatedResults.push(secondStudent);
        FocusPanelManager.currentStudentId = 's2';
        FocusPanelGrades.renderGradesAndContext(FocusPanelManager, secondStudent, 'S2');

        expect(FocusPanelManager._hasGradeBeforeFocus).toBe(false);
        expect(FocusPanelManager._gradeBeforeFocus).toBeNull();
        expect(gradeInput.value).toBe('15,0');
    });

    it('formats and clamps grade on blur (12 -> 12,0; 25 -> 20,0) and reverts invalid input', () => {
        const gradeInput = document.getElementById('focusCurrentGradeInput');
        gradeInput.dispatchEvent(new FocusEvent('focus'));

        gradeInput.value = '12';
        gradeInput.dispatchEvent(new Event('input', { bubbles: true }));
        gradeInput.dispatchEvent(new FocusEvent('blur'));
        expect(gradeInput.value).toBe('12,0');
        expect(appState.generatedResults[0].studentData.periods.S2.grade).toBe(12);

        gradeInput.dispatchEvent(new FocusEvent('focus'));
        gradeInput.value = '25';
        gradeInput.dispatchEvent(new Event('input', { bubbles: true }));
        gradeInput.dispatchEvent(new FocusEvent('blur'));
        expect(gradeInput.value).toBe('20,0');
        expect(appState.generatedResults[0].studentData.periods.S2.grade).toBe(20);

        gradeInput.dispatchEvent(new FocusEvent('focus'));
        gradeInput.value = 'abc';
        gradeInput.dispatchEvent(new Event('input', { bubbles: true }));
        gradeInput.dispatchEvent(new FocusEvent('blur'));
        expect(gradeInput.value).toBe('20,0');
        expect(appState.generatedResults[0].studentData.periods.S2.grade).toBe(20);
    });

    it('reverts grade and keeps Focus Panel open when pressing Escape inside grade input', () => {
        const closeSpy = vi.spyOn(FocusPanelManager, 'close');
        const gradeInput = document.getElementById('focusCurrentGradeInput');
        gradeInput.dispatchEvent(new FocusEvent('focus'));

        gradeInput.value = '18';
        gradeInput.dispatchEvent(new Event('input', { bubbles: true }));
        expect(appState.generatedResults[0].studentData.periods.S2.grade).toBe(18);

        gradeInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

        expect(closeSpy).not.toHaveBeenCalled();
        expect(gradeInput.value).toBe('10,5');
        expect(appState.generatedResults[0].studentData.periods.S2.grade).toBe(10.5);
        closeSpy.mockRestore();
    });

    it('commits grade cleanly when pressing Enter inside grade input', () => {
        const gradeInput = document.getElementById('focusCurrentGradeInput');
        const blurSpy = vi.spyOn(gradeInput, 'blur');
        gradeInput.dispatchEvent(new FocusEvent('focus'));
        gradeInput.value = '14';
        gradeInput.dispatchEvent(new Event('input', { bubbles: true }));

        gradeInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        expect(blurSpy).toHaveBeenCalledTimes(1);
    });
});
