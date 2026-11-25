import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SeatingChartManager } from '../SeatingChartManager';
import { appState, userSettings } from '../../state/State';
import { ClassManager } from '../ClassManager';

vi.mock('../../services/DBService.js', () => ({
    DBService: {
        open: vi.fn(),
        get: vi.fn(),
        getAll: vi.fn().mockResolvedValue([]),
        put: vi.fn(),
        putAll: vi.fn().mockResolvedValue(true),
        clear: vi.fn()
    }
}));

function setupPrintFixture({ rows = 5, cols = 8, planMode = 'course', locked = true, students = [], placeStudents } = {}) {
    document.body.innerHTML = `
        <div class="main-content-wrapper" data-view="plan">
            <div class="main-content">
                <div class="output-section"></div>
            </div>
        </div>
    `;

    userSettings.academic.classes = [];
    userSettings.academic.currentClassId = null;
    userSettings.academic.seatingGrid = { rows, cols, locked, specialLayout: {} };
    userSettings.academic.seatingActivityGrid = { rows, cols, locked, specialLayout: {} };
    appState.classes = userSettings.academic.classes;
    appState.seatingGrid = userSettings.academic.seatingGrid;
    appState.seatingActivityGrid = userSettings.academic.seatingActivityGrid;
    appState.currentPeriod = 'T1';
    appState.activeView = 'plan';
    appState.seatingStatusDots = { movements: true, devices: true, delegates: true };

    const cls = ClassManager.createClass('Classe Démo');
    cls.seatingLocked = locked;
    cls.seatingActivityLocked = locked;
    appState.currentClassId = cls.id;
    userSettings.academic.currentClassId = cls.id;

    appState.generatedResults = students.map(s => ({ ...s, classId: cls.id }));

    SeatingChartManager._isActive = true;
    SeatingChartManager._planMode = planMode;
    SeatingChartManager._isLocked = locked;
    SeatingChartManager._orientation = 'teacher';
    SeatingChartManager._students = appState.generatedResults;
    SeatingChartManager._initGrid(rows, cols);
    placeStudents?.(SeatingChartManager._gridState);

    SeatingChartManager.init();
    SeatingChartManager._applyLockState(locked, { skipSmartFit: true });
    SeatingChartManager._render();

    return cls;
}

describe('SeatingPrintExporter — Auto-fit, Légende & Cycle de vie', () => {
    afterEach(() => {
        window.onafterprint?.();
        vi.restoreAllMocks();
        document.body.innerHTML = '';
        delete document.body.dataset.printMode;
    });

    describe('_computePrintScale', () => {
        it('agrandit une grille moyenne (8×5 Cours) pour remplir la feuille A4 paysage', () => {
            const scale = SeatingChartManager._computePrintScale({ rows: 5, cols: 8, isActivity: false });
            expect(scale).toBeGreaterThan(1.1);
            expect(scale).toBeLessThanOrEqual(1.55);
        });

        it('plafonne les petites grilles (2×2) à 1.55 pour éviter des cartes disproportionnées', () => {
            expect(SeatingChartManager._computePrintScale({ rows: 2, cols: 2, isActivity: false })).toBe(1.55);
            expect(SeatingChartManager._computePrintScale({ rows: 2, cols: 2, isActivity: true })).toBe(1.55);
        });

        it('réduit automatiquement les grandes grilles (7 à 10 rangées) pour tenir sur 1 seule page', () => {
            const scale7Rows = SeatingChartManager._computePrintScale({ rows: 7, cols: 8, isActivity: false });
            const scale10Course = SeatingChartManager._computePrintScale({ rows: 10, cols: 10, isActivity: false });
            const scale10Activity = SeatingChartManager._computePrintScale({ rows: 10, cols: 10, isActivity: true });

            expect(scale7Rows).toBeLessThan(1);
            expect(scale7Rows).toBeGreaterThan(0.8);
            expect(scale10Course).toBeLessThan(0.7);
            expect(scale10Course).toBeGreaterThanOrEqual(0.4);
            expect(scale10Activity).toBeLessThan(0.65);
            expect(scale10Activity).toBeGreaterThanOrEqual(0.4);
        });

        it('réduit la hauteur disponible si un avertissement ou une légende est affiché', () => {
            const base = SeatingChartManager._computePrintScale({ rows: 8, cols: 6, isActivity: false, hasWarning: false, hasLegend: false });
            const withBoth = SeatingChartManager._computePrintScale({ rows: 8, cols: 6, isActivity: false, hasWarning: true, hasLegend: true });
            expect(withBoth).toBeLessThan(base);
        });

        it('gère les entrées limites (null, undefined, 0, valeurs négatives) sans NaN ni dépassement', () => {
            for (const input of [undefined, {}, { rows: 0, cols: 0 }, { rows: -3, cols: null }]) {
                const s = SeatingChartManager._computePrintScale(input);
                expect(Number.isFinite(s)).toBe(true);
                expect(s).toBeGreaterThanOrEqual(0.4);
                expect(s).toBeLessThanOrEqual(1.55);
            }
        });
    });

    describe('_collectPrintLegendItems', () => {
        it('retourne une liste vide si aucune pastille n’est visible sur les élèves placés', () => {
            setupPrintFixture({
                students: [
                    { id: 's1', nom: 'Martin', prenom: 'Lucas', studentData: { statuses: [] } },
                    { id: 's2', nom: 'Dupont', prenom: 'Clara', studentData: { statuses: ['ULIS'] } } // non placée
                ],
                placeStudents: (grid) => { grid[0][0] = 's1'; }
            });

            expect(SeatingChartManager._collectPrintLegendItems()).toEqual([]);
        });

        it('collecte uniquement les types présents sur le plan dans l’ordre canonique avec les sigles exacts', () => {
            setupPrintFixture({
                students: [
                    { id: 's1', nom: 'A', prenom: 'Clara', studentData: { statuses: ['ULIS'] } },
                    { id: 's2', nom: 'B', prenom: 'Sophie', studentData: { statuses: ['PAP'] } },
                    { id: 's3', nom: 'C', prenom: 'Antoine', studentData: { statuses: ['PAI'] } },
                    { id: 's4', nom: 'D', prenom: 'Emma', studentData: { statuses: ['Délégué'] } },
                    { id: 's5', nom: 'E', prenom: 'Hugo', studentData: { statuses: ['Nouveau'] } }
                ],
                placeStudents: (grid) => {
                    grid[0][0] = 's1';
                    grid[0][1] = 's2';
                    grid[0][2] = 's3';
                    grid[0][3] = 's4';
                    grid[0][4] = 's5';
                }
            });

            const items = SeatingChartManager._collectPrintLegendItems();
            expect(items).toEqual([
                { type: 'new', className: 'sc-badge-new', label: 'Nouveau' },
                { type: 'ulis', className: 'sc-badge-ulis', label: 'ULIS' },
                { type: 'device', className: 'sc-badge-device', label: 'PAP, PAI' },
                { type: 'delegate', className: 'sc-badge-delegate', label: 'Délégué' }
            ]);
        });
    });

    describe('_printChart lifecycle', () => {
        it('applique --sc-print-scale et injecte la légende pendant l’impression puis nettoie tout après', () => {
            setupPrintFixture({
                rows: 5,
                cols: 8,
                students: [
                    { id: 's1', nom: 'A', prenom: 'Clara', studentData: { statuses: ['ULIS'] } },
                    { id: 's2', nom: 'B', prenom: 'Sophie', studentData: { statuses: ['PAP'] } }
                ],
                placeStudents: (grid) => {
                    grid[2][3] = 's1';
                    grid[4][2] = 's2';
                }
            });

            let scaleDuringPrint = '';
            let legendTextDuringPrint = '';
            const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {
                const board = document.getElementById('scClassroomBoard');
                scaleDuringPrint = board?.style.getPropertyValue('--sc-print-scale') || '';
                legendTextDuringPrint = document.querySelector('#seatingChartView .sc-print-legend')?.textContent || '';
            });

            SeatingChartManager._printChart();

            expect(Number(scaleDuringPrint)).toBeGreaterThan(1.05);
            expect(legendTextDuringPrint).toContain('ULIS');
            expect(legendTextDuringPrint).toContain('PAP');

            window.onafterprint?.();
            expect(document.getElementById('scClassroomBoard')?.style.getPropertyValue('--sc-print-scale')).toBe('');
            expect(document.querySelector('#seatingChartView .sc-print-legend')).toBeNull();
            expect(document.querySelector('#seatingChartView .sc-print-header')).toBeNull();
            printSpy.mockRestore();
        });

        it('calcule --sc-print-scale sur la grille recadrée en mode Activité non verrouillé', () => {
            setupPrintFixture({
                rows: 8,
                cols: 10,
                planMode: 'activity',
                locked: false,
                students: [
                    { id: 's1', nom: 'A', prenom: 'Alice', studentData: { statuses: [] } },
                    { id: 's2', nom: 'B', prenom: 'Bob', studentData: { statuses: [] } }
                ],
                placeStudents: (grid) => {
                    grid[1][2] = 's1';
                    grid[2][3] = 's2';
                }
            });

            let scaleDuringPrint = 0;
            const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {
                scaleDuringPrint = Number(document.getElementById('scClassroomBoard')?.style.getPropertyValue('--sc-print-scale'));
            });

            SeatingChartManager._printChart();

            // Grille recadrée à 2×2 postes → échelle maximale 1.55 (alors qu'en 8×10 elle serait < 0.8)
            expect(scaleDuringPrint).toBe(1.55);
            expect(document.querySelector('#seatingChartView .sc-print-legend')).toBeNull();

            window.onafterprint?.();
            printSpy.mockRestore();
        });

        it('nettoie --sc-print-scale et la légende même si window.print lève une exception', () => {
            setupPrintFixture({
                students: [
                    { id: 's1', nom: 'A', prenom: 'Clara', studentData: { statuses: ['ULIS'] } }
                ],
                placeStudents: (grid) => { grid[0][0] = 's1'; }
            });

            vi.spyOn(window, 'print').mockImplementation(() => {
                throw new Error('print blocked');
            });

            expect(() => SeatingChartManager._printChart()).toThrow('print blocked');
            expect(document.getElementById('scClassroomBoard')?.style.getPropertyValue('--sc-print-scale')).toBe('');
            expect(document.querySelector('#seatingChartView .sc-print-legend')).toBeNull();
            expect(document.querySelector('#seatingChartView .sc-print-header')).toBeNull();
        });
    });
});
