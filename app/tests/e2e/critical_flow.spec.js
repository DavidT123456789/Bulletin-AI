import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';

function createSeedStudents() {
    return [
        {
            id: 'stu-martin-lucas',
            nom: 'MARTIN',
            prenom: 'Lucas',
            classId: 'class-1',
            status: 'présent',
            statusDetails: [],
            studentData: {
                periods: {
                    T1: {
                        grade: '15',
                        rawGrade: 15,
                        rawData: '15 | Bon travail',
                        appreciation: '',
                        context: 'Sérieux en classe'
                    }
                },
                context: 'Sérieux en classe'
            },
            historyPerPeriod: { T1: { versions: [], currentIndex: -1 } }
        },
        {
            id: 'stu-dupont-emma',
            nom: 'DUPONT',
            prenom: 'Emma',
            classId: 'class-1',
            status: 'présent',
            statusDetails: [],
            studentData: {
                periods: {
                    T1: {
                        grade: '12',
                        rawGrade: 12,
                        rawData: '12 | Peut mieux faire',
                        appreciation: '',
                        context: 'Participation timide'
                    }
                },
                context: 'Participation timide'
            },
            historyPerPeriod: { T1: { versions: [], currentIndex: -1 } }
        }
    ];
}

async function seedAppState(page, { students = [] } = {}) {
    const initialState = {
        settings: {
            googleApiKey: 'dummy_test_key',
            theme: 'dark',
            currentAIModel: 'gemini-3.6-flash',
            periodSystem: 'trimestres',
            currentPeriod: 'T1',
            currentSubject: 'Maths',
            classes: [{ id: 'class-1', name: 'Classe Test', year: '2026', subject: 'Maths', periodSystem: 'trimestres' }],
            currentClassId: 'class-1'
        },
        ...(students.length > 0 ? { generatedResults: students } : {})
    };

    await page.addInitScript((state) => {
        if (sessionStorage.getItem('__e2e_seeded')) return;
        sessionStorage.setItem('__e2e_seeded', '1');
        localStorage.clear();
        localStorage.setItem('appreciationGeneratorFirstVisit_v8', 'true');
        localStorage.setItem('appreciationGeneratorState_v6.2', JSON.stringify(state));
    }, initialState);

    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto('/app.html');
    await expect(page).toHaveTitle(/Bulletin AI/);
    return pageErrors;
}

async function mockGeminiResponse(page, responseText) {
    await page.route('**/generativelanguage.googleapis.com/**', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                candidates: [
                    {
                        content: {
                            parts: [{ text: responseText }]
                        }
                    }
                ],
                usageMetadata: {
                    promptTokenCount: 30,
                    candidatesTokenCount: 45
                }
            })
        });
    });
}

test.describe('Critical Journeys: Import, Focus Panel, Plan de classe, Export, Dashboard & Navigation', () => {
    test('1. Import Wizard: multi-step CSV/tab import persists across reload', async ({ page }) => {
        const pageErrors = await seedAppState(page);

        await page.locator('#addStudentFab').click();
        await expect(page.locator('#importHubBackdrop')).toHaveClass(/active/);

        await page.locator('.import-hub-card[data-action="mass"]').click();
        await expect(page.locator('#importWizardModal')).toHaveClass(/visible/);

        const tabularData = 'MARTIN\tLucas\t15\tBon travail\nDUPONT\tEmma\t12\tPeut mieux faire';
        await page.locator('#wizardDataTextarea').fill(tabularData);

        const step1NextBtn = page.locator('#wizardStep1NextBtn');
        await expect(step1NextBtn).toBeEnabled();
        await step1NextBtn.click();

        const step2NextBtn = page.locator('#wizardStep2NextBtn');
        await expect(step2NextBtn).toBeVisible();
        await step2NextBtn.click();

        const importOnlyBtn = page.locator('#wizardImportOnlyBtn');
        await expect(importOnlyBtn).toBeVisible();
        await importOnlyBtn.click();

        await expect(page.locator('#importWizardModal')).not.toHaveClass(/visible/);

        const rows = page.locator('#outputList tr.student-row');
        await expect(rows).toHaveCount(2);
        await expect(page.locator('#outputList')).toContainText('MARTIN');
        await expect(page.locator('#outputList')).toContainText('DUPONT');

        await page.reload();
        await expect(page.locator('#outputList tr.student-row')).toHaveCount(2);
        await expect(page.locator('#outputList')).toContainText('Lucas');
        await expect(page.locator('#outputList')).toContainText('Emma');
        expect(pageErrors).toEqual([]);
    });

    test('2. Focus Panel: edit context/grade, generate mocked AI appreciation and persist after reload', async ({ page }) => {
        const pageErrors = await seedAppState(page, { students: createSeedStudents() });
        const expectedAppreciation = 'Élève sérieux et impliqué en mathématiques, résultats très satisfaisants ce trimestre.';
        await mockGeminiResponse(page, expectedAppreciation);

        const martinRow = page.locator('#outputList tr.student-row', { hasText: 'MARTIN' });
        await expect(martinRow).toBeVisible();
        await martinRow.click();

        const focusPanel = page.locator('#focusPanel');
        await expect(focusPanel).toBeVisible();
        await expect(page.locator('#focusStudentName')).toContainText('MARTIN');

        await page.locator('#focusCurrentGradeInput').fill('16');
        await page.locator('#focusContextInput').fill('Très bonne participation orale');

        await page.locator('#focusGenerateBtn').click();
        await expect(page.locator('#focusAppreciationText')).toContainText(expectedAppreciation);

        await page.locator('#focusBackBtn').click();
        await expect(focusPanel).not.toHaveClass(/open|active/);

        await page.reload();
        const reloadedMartinRow = page.locator('#outputList tr.student-row', { hasText: 'MARTIN' });
        await expect(reloadedMartinRow).toContainText('16');
        await reloadedMartinRow.click();
        await expect(page.locator('#focusAppreciationText')).toContainText(expectedAppreciation);
        await expect(page.locator('#focusContextInput')).toHaveValue('Très bonne participation orale');
        expect(pageErrors).toEqual([]);
    });

    test('3. Plan de classe: switch to Plan view, auto-place students and persist placement', async ({ page }) => {
        const pageErrors = await seedAppState(page, { students: createSeedStudents() });

        const planToggleBtn = page.locator('#viewToggle [data-view="plan"]');
        await expect(planToggleBtn).toBeVisible();
        await planToggleBtn.click();

        const seatingView = page.locator('#seatingChartView');
        await expect(seatingView).toBeVisible();
        await expect(page.locator('#scStudentList .sc-student-chip')).toHaveCount(2);

        await page.locator('#scAutoPlaceBtn').click();
        await page.locator('#scPlacementPopover .sc-popover-item[data-mode="alpha-asc"]').click();

        await expect(page.locator('#scGridContainer .sc-cell.occupied')).toHaveCount(2);
        await expect(page.locator('#scStudentList .sc-student-chip')).toHaveCount(0);

        await page.reload();
        if (!(await page.locator('#seatingChartView').isVisible())) {
            await page.locator('#viewToggle [data-view="plan"]').click();
        }
        await expect(page.locator('#seatingChartView')).toBeVisible();
        await expect(page.locator('#scGridContainer .sc-cell.occupied')).toHaveCount(2);
        expect(pageErrors).toEqual([]);
    });

    test('4. Settings & Backup: switch tabs cleanly and download valid full JSON backup', async ({ page }) => {
        const pageErrors = await seedAppState(page, { students: createSeedStudents() });

        await page.locator('#headerMenuBtn').click();
        await page.locator('#settingsButton').click();

        const modal = page.locator('#appSettingsModal');
        await expect(modal).toBeVisible();
        await expect(page.locator('#settingsModalTitle')).toContainText('Paramètres');

        await page.locator('#appSettingsModal .ui-tabs-btn[data-tab="settings-data"]').click();
        const exportBtn = page.locator('#exportFullBackupBtn');
        await expect(exportBtn).toBeVisible();

        const [download] = await Promise.all([
            page.waitForEvent('download'),
            exportBtn.click()
        ]);

        expect(download.suggestedFilename()).toMatch(/^bulletin-ai_backup_\d{4}-\d{2}-\d{2}\.json$/);
        const filePath = await download.path();
        expect(filePath).toBeTruthy();
        const payload = JSON.parse(await fs.readFile(filePath, 'utf8'));
        expect(payload._meta?.exportType).toBe('full_backup');
        expect(payload.classes?.some((c) => c.name === 'Classe Test')).toBe(true);
        expect(payload.generatedResults).toHaveLength(2);

        await page.locator('#closeSettingsModalBtn').click();
        await expect(modal).not.toBeVisible();
        expect(pageErrors).toEqual([]);
    });

    test('5. Class Dashboard: compute stats and generate mocked AI class synthesis', async ({ page }) => {
        const pageErrors = await seedAppState(page, { students: createSeedStudents() });
        const synthesisPayload = JSON.stringify({
            synthesis: 'Classe dynamique avec une progression solide ce trimestre.',
            strengths: ['Bonne participation collective'],
            vigilances: ['Attention à la régularité du travail personnel'],
            recommendations: ['Consolider la méthodologie en exercices']
        });
        await mockGeminiResponse(page, synthesisPayload);

        await page.locator('#tableActionsBtnToggle').click();
        await page.locator('#analyzeClassBtn-shortcut').click();

        const dashboardModal = page.locator('#classDashboardModal');
        await expect(dashboardModal).toBeVisible();
        await expect(page.locator('#dashboardStudentCount')).toContainText('2');

        await page.locator('#generateSynthesisPlaceholderBtn').click();
        const synthesisContent = page.locator('#aiSynthesisContent');
        await expect(synthesisContent).toContainText('Classe dynamique avec une progression solide ce trimestre.');
        await expect(synthesisContent).toContainText('Bonne participation collective');
        await expect(page.locator('#copyDashboardSynthesisBtn')).toBeVisible();

        await page.locator('#closeDashboardModalBtn').click();
        await expect(dashboardModal).not.toBeVisible();
        expect(pageErrors).toEqual([]);
    });

    test('6. Help & Delegated Navigation: switch help tabs and navigate via data-action without onclick', async ({ page }) => {
        const pageErrors = await seedAppState(page, { students: createSeedStudents() });

        await page.locator('#headerMenuBtn').click();
        await page.locator('#helpButton').click();

        const helpModal = page.locator('#helpModal');
        await expect(helpModal).toBeVisible();

        await page.locator('#helpTabBtnWriting').click();
        await expect(page.locator('#help-writing')).toHaveClass(/active/);

        await page.locator('#helpTabBtnData').click();
        await expect(page.locator('#help-data')).toHaveClass(/active/);

        await page.locator('#helpTabBtnApikey').click();
        await expect(page.locator('#help-apikey')).toHaveClass(/active/);

        await page.locator('#helpOpenSettingsEngineBtn').click();
        await expect(page.locator('#appSettingsModal')).toBeVisible();
        await expect(page.locator('#appSettingsModal .ui-tabs-btn[data-tab="settings-engine"]')).toHaveClass(/active/);

        await page.locator('#closeSettingsModalBtn').click();
        expect(pageErrors).toEqual([]);
    });
});
