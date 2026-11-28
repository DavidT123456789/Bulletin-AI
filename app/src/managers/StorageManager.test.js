/**
 * @fileoverview Tests unitaires pour StorageManager avec IndexedDB
 * @module managers/StorageManager.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StorageManager } from './StorageManager.js';
import { appState, userSettings, runtimeState } from '../state/State.js';
import { ModalUI } from './ModalUIManager.js';

// Mock DBService
vi.mock('../services/DBService.js', () => ({
    DBService: {
        open: vi.fn(),
        close: vi.fn(),
        get: vi.fn(),
        getAll: vi.fn(),
        getByIndex: vi.fn(),
        put: vi.fn(),
        putAll: vi.fn(),
        replaceAll: vi.fn(),
        saveAtomicSnapshot: vi.fn(),
        replaceAllAtomic: vi.fn(),
        delete: vi.fn(),
        clear: vi.fn()
    }
}));

// Mock state module with new structure
vi.mock('../state/State.js', () => {
    const userSettings = {
        ui: { theme: 'dark', activeView: 'list' },
        academic: {
            periodSystem: 'trimestres',
            useSubjectPersonalization: true,
            evolutionThresholds: {},
            subjects: {},
        },
        api: {
            currentAIModel: 'gemini-2.0-flash',
            enableApiFallback: true,
            openaiApiKey: '',
            googleApiKey: '',
            albertApiKey: '',
            openrouterApiKey: '',
            groqApiKey: '',
            anthropicApiKey: '',
            mistralApiKey: '',
            ollamaEnabled: false,
            ollamaBaseUrl: 'http://localhost:11434',
            ollamaInstalledModels: [],
        },
        import: {
            massImportFormats: { trimestres: {}, semestres: {} },
        },
    };
    const runtimeState = {
        session: { sessionCost: 0 },
        navigation: {
            currentPeriod: 'T1',
            currentSubject: 'Français',
            currentSettingsSubject: 'Français',
            currentInputMode: 'single',
            currentRefiningAppreciationId: null,
            activeStatFilter: null,
            modalNav: { currentIndex: -1 },
        },
        process: {
            isMassImportCancelled: false,
            importJustCompleted: false,
        },
        apiStatus: { google: 'not-configured', openai: 'not-configured', openrouter: 'not-configured' },
        validatedApiKeys: { google: false, openai: false, openrouter: false },
        data: {
            generatedResults: [],
            filteredResults: [],
            variationHistory: {},
        },
    };
    // Backwards compatible appState mock (generatedResults aliasé sur runtimeState comme le Proxy réel)
    const appState = {
        theme: 'dark',
        useSubjectPersonalization: true,
        periodSystem: 'trimestres',
        subjects: {},
        evolutionThresholds: {},
        massImportFormats: { trimestres: {}, semestres: {} },
        currentPeriod: 'T1',
        currentSubject: 'Français',
        currentSettingsSubject: 'Français',
        currentAIModel: 'gemini-2.0-flash',
        openaiApiKey: '',
        googleApiKey: '',
        openrouterApiKey: '',
        get generatedResults() { return runtimeState.data.generatedResults; },
        set generatedResults(value) { runtimeState.data.generatedResults = value; },
        activeStatFilter: null,
        currentInputMode: 'single',
        activeView: 'list',
        currentClassId: null
    };
    return { userSettings, runtimeState, appState };
});

// Mock config module (preserve PROVIDER_DEFAULT_MODELS & migrateLegacyModelId from actual Config)
vi.mock('../config/Config.js', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        CONFIG: {
            LS_APP_STATE_KEY: 'bulletin-assistant-state'
        },
        APP_VERSION: '4.3.0',
        DEFAULT_PROMPT_TEMPLATES: {
            'Français': { iaConfig: { length: 50, tone: 2, voice: 'il' } },
            'Générique': { iaConfig: { length: 50, tone: 2, voice: 'il' } }
        },
        DEFAULT_IA_CONFIG: { length: 50, tone: 2, voice: 'il', styleInstructions: '' },
        DEFAULT_EVOLUTION_THRESHOLDS: { positive: 1, veryPositive: 2, negative: -1, veryNegative: -2 },
        DEFAULT_PRIVACY_SETTINGS: { anonymizeData: false },
        DEFAULT_SEATING_STATUS_DOTS: { movements: true, devices: false, delegates: false, journal: false }
    };
});

// Mock UIManager
vi.mock('./UIManager.js', () => ({
    UI: {
        showNotification: vi.fn(),
        showUndoNotification: vi.fn(),
        showCustomConfirm: vi.fn((msg, callback) => callback()),
        updatePeriodSystemUI: vi.fn(),
        updateSettingsPromptFields: vi.fn(),
        updateSettingsFields: vi.fn(),
        renderSettingsLists: vi.fn()
    }
}));

// Mock AppManager
vi.mock('./AppManager.js', () => ({
    App: {
        renderSubjectManagementList: vi.fn(),
        updateUIOnLoad: vi.fn()
    }
}));

describe('StorageManager', () => {
    let mockLocalStorage;
    let DBService;

    beforeEach(async () => {
        // Setup mock localStorage
        mockLocalStorage = {};
        vi.stubGlobal('localStorage', {
            getItem: vi.fn((key) => mockLocalStorage[key] || null),
            setItem: vi.fn((key, value) => { mockLocalStorage[key] = value; }),
            removeItem: vi.fn((key) => { delete mockLocalStorage[key]; })
        });

        // Initialize dependencies
        const dbModule = await import('../services/DBService.js');
        DBService = dbModule.DBService;
        const { UI } = await import('./UIManager.js');
        const { App } = await import('./AppManager.js');
        StorageManager.init(UI, App);

        runtimeState.data.generatedResults = [];
        runtimeState.data.filteredResults = [];
        runtimeState.data.deletedItems = { students: [], classes: [] };
        runtimeState._dataPurgeDetected = false;
        userSettings.academic.classes = [];
        vi.clearAllMocks();
    });

    afterEach(() => {
        StorageManager.closeTabSync();
        vi.unstubAllGlobals();
    });

    describe('saveAppState', () => {
        it('should save settings to localStorage and heavy data to IndexedDB', async () => {
            const { runtimeState, userSettings } = await import('../state/State.js');
            userSettings.ui.theme = 'dark';
            runtimeState.data.generatedResults = [{ id: '1' }];

            await StorageManager.saveAppState();

            // Check LocalStorage (Settings)
            expect(localStorage.setItem).toHaveBeenCalledWith(
                'bulletin-assistant-state',
                expect.any(String)
            );
            const stateCall = localStorage.setItem.mock.calls.find(c => c[0] === 'bulletin-assistant-state');
            expect(stateCall).toBeDefined();
            const savedData = JSON.parse(stateCall[1]);
            expect(savedData.settings.theme).toBe('dark');
            expect(savedData.settings.activeView).toBe('list');
            expect(savedData.generatedResults).toBeUndefined(); // Should NOT be in LS

            // Check IndexedDB (Big Data)
            expect(DBService.putAll).toHaveBeenCalledWith('generatedResults', [{ id: '1' }]);
        });

        it('should skip IndexedDB putAll when only UI/navigation settings change without student data mutation', async () => {
            const { runtimeState, userSettings } = await import('../state/State.js');
            userSettings.ui.theme = 'dark';
            runtimeState.data.generatedResults = [{ id: 'student_1', nom: 'Dupont' }];

            await StorageManager.saveAppState();
            expect(DBService.putAll).toHaveBeenCalledTimes(1);

            DBService.putAll.mockClear();
            localStorage.setItem.mockClear();

            // Change only UI setting (theme / activeView)
            userSettings.ui.theme = 'light';
            userSettings.ui.activeView = 'plan';

            await StorageManager.saveAppState();

            // Settings must be persisted to localStorage, but IndexedDB must NOT be rewritten
            expect(localStorage.setItem).toHaveBeenCalledWith('bulletin-assistant-state', expect.any(String));
            expect(DBService.putAll).not.toHaveBeenCalled();

            // Now mutate a student -> IndexedDB MUST be updated
            runtimeState.data.generatedResults[0].nom = 'Durand';
            await StorageManager.saveAppState();
            expect(DBService.putAll).toHaveBeenCalledTimes(1);
        });

        it('should persist theme change without marking synced data as modified', async () => {
            const { userSettings } = await import('../state/State.js');
            userSettings.ui.theme = 'system';
            await StorageManager.saveAppState();

            const syncHash = StorageManager.computeCurrentDataHash();
            localStorage.setItem('bulletin_last_sync', '1000');
            localStorage.setItem('bulletin_last_modified', '1000');
            localStorage.setItem('bulletin_last_sync_hash', syncHash);

            userSettings.ui.theme = 'light';
            await StorageManager.saveAppState();

            const savedData = JSON.parse(localStorage.getItem('bulletin-assistant-state'));
            expect(savedData.settings.theme).toBe('light');
            expect(localStorage.getItem('bulletin_last_modified')).toBe('1000');
        });
    });

    describe('loadAppState', () => {
        it('should load settings from localStorage and results from IndexedDB', async () => {
            const { userSettings, runtimeState } = await import('../state/State.js');

            // Mock LocalStorage (Settings)
            const savedState = {
                version: '4.3.0',
                settings: { theme: 'light', activeView: 'plan' }
            };
            mockLocalStorage['bulletin-assistant-state'] = JSON.stringify(savedState);

            // Mock IndexedDB (Results)
            const mockDbResults = [{ id: '123' }];
            DBService.getAll.mockResolvedValue(mockDbResults);

            await StorageManager.loadAppState();

            expect(userSettings.ui.theme).toBe('light');
            expect(userSettings.ui.activeView).toBe('plan');
            expect(runtimeState.data.generatedResults).toEqual(mockDbResults);
        });

        it('should migrate data from LocalStorage to IndexedDB if found', async () => {
            const { appState } = await import('../state/State.js');

            // Mock LS with LEGACY data (generatedResults inside)
            const legacyState = {
                settings: { theme: 'dark' },
                generatedResults: [{ id: 'old', studentData: { periods: {} } }]
            };
            mockLocalStorage['bulletin-assistant-state'] = JSON.stringify(legacyState);

            await StorageManager.loadAppState();

            // Should put to DB
            expect(DBService.putAll).toHaveBeenCalledWith('generatedResults', expect.any(Array));
            // Should update LocalStorage removing generatedResults
            const updatedLS = JSON.parse(localStorage.setItem.mock.calls[0][1]);
            expect(updatedLS.generatedResults).toBeUndefined();
        });

        it('should migrate old massive JSON sync hash to a short hash representation', async () => {
            const oldHash = '{"version":"4.3.0","settings":{"theme":"dark"},"generatedResults":[{"id":"1"}]}';
            mockLocalStorage['bulletin_last_sync_hash'] = oldHash;

            DBService.getAll.mockResolvedValue([]);

            await StorageManager.loadAppState();

            const migratedHash = mockLocalStorage['bulletin_last_sync_hash'];
            expect(migratedHash).toBeDefined();
            expect(migratedHash.length).toBe(16);
            expect(migratedHash).not.toBe(oldHash);
            expect(/^[0-9a-f]{16}$/.test(migratedHash)).toBe(true);
        });

        it('should re-align the sync hash after load-time migrations only when no local change was recorded since the last sync', async () => {
            DBService.getAll.mockResolvedValue([]);

            // Nothing saved since the sync: a hash gap can only come from load-time migrations
            Object.assign(mockLocalStorage, {
                bulletin_last_sync: '5000',
                bulletin_last_modified: '5000',
                bulletin_last_sync_hash: 'legacyhash000000'
            });
            await StorageManager.loadAppState();
            expect(mockLocalStorage['bulletin_last_sync_hash']).toBe(StorageManager.computeCurrentDataHash());

            // Real unsaved changes since the sync: the sync hash is kept so they stay flagged
            StorageManager._lastSaveHash = null;
            Object.assign(mockLocalStorage, {
                bulletin_last_modified: '9000',
                bulletin_last_sync_hash: 'legacyhash000000'
            });
            await StorageManager.loadAppState();
            expect(mockLocalStorage['bulletin_last_sync_hash']).toBe('legacyhash000000');
        });

        it('should preserve standalone bulletin_theme when app state is absent', async () => {
            const { userSettings } = await import('../state/State.js');
            mockLocalStorage['bulletin_theme'] = 'dark';
            DBService.getAll.mockResolvedValue([]);

            await StorageManager.loadAppState();

            expect(userSettings.ui.theme).toBe('dark');
            // Verify deprecated model migrations to current catalog models
            mockLocalStorage['bulletin-assistant-state'] = JSON.stringify({
                version: '4.3.0',
                settings: { currentAIModel: 'gemini-3.5-flash' }
            });
            await StorageManager.loadAppState();
            expect(userSettings.api.currentAIModel).toBe('gemini-4-hydrogen');

            mockLocalStorage['bulletin-assistant-state'] = JSON.stringify({
                version: '4.3.0',
                settings: { currentAIModel: 'gemini-3.6-flash' }
            });
            await StorageManager.loadAppState();
            expect(userSettings.api.currentAIModel).toBe('gemini-3.6-flash');

            mockLocalStorage['bulletin-assistant-state'] = JSON.stringify({
                version: '4.3.0',
                settings: { currentAIModel: 'gemini-4-argon' }
            });
            await StorageManager.loadAppState();
            expect(userSettings.api.currentAIModel).toBe('gemini-4-hydrogen');

            mockLocalStorage['bulletin-assistant-state'] = JSON.stringify({
                version: '4.3.0',
                settings: { currentAIModel: 'anthropic-claude-3-7-sonnet-latest' }
            });
            await StorageManager.loadAppState();
            expect(userSettings.api.currentAIModel).toBe('anthropic-claude-sonnet-5-5');

            mockLocalStorage['bulletin-assistant-state'] = JSON.stringify({
                version: '4.3.0',
                settings: { currentAIModel: 'openai-o3-mini' }
            });
            await StorageManager.loadAppState();
            expect(userSettings.api.currentAIModel).toBe('openai-gpt-6.1-sol');
        });
    });

    describe('migrateData', () => {
        it('should migrate old format data to new format', () => {
            const oldFormatResults = [{
                id: '123',
                studentData: {
                    moyT1: 15, appT1: 'Bon', moyT2: null, appT2: '', moyT3: null,
                    quarterMode: 'T1'
                }
            }];

            const migrated = StorageManager.migrateData(oldFormatResults);
            expect(migrated[0].studentData.periods.T1.grade).toBe(15);
        });

        it('should normalize tokenUsage idempotently to { appreciation, analysis } and repair legacy nesting', () => {
            const usage = { total_tokens: 42 };
            const results = [
                { id: 'a', studentData: { periods: {} } },
                { id: 'b', studentData: { periods: {} }, tokenUsage: usage },
                { id: 'c', studentData: { periods: {} }, tokenUsage: { appreciation: { appreciation: null, sw: null, ns: null }, sw: null, ns: null } },
                { id: 'd', studentData: { periods: {} }, tokenUsage: { appreciation: usage, sw: { total_tokens: 7 }, ns: null, generationTimeMs: 320 } }
            ];

            const once = JSON.parse(JSON.stringify(StorageManager.migrateData(results)));
            expect(once.map(r => r.tokenUsage)).toEqual([
                { appreciation: null, analysis: null },
                { appreciation: usage, analysis: null },
                { appreciation: null, analysis: null },
                { appreciation: usage, analysis: null, generationTimeMs: 320 }
            ]);
            // A second load (app reload) must not change anything, otherwise the session drifts to "Non sauvegardé"
            expect(StorageManager.migrateData(once)).toEqual(once);
        });

        it('should exclude tokenUsage variations from computeCurrentDataHash()', () => {
            runtimeState.data.generatedResults = [
                { id: 's1', nom: 'Dupont', prenom: 'Jean', studentData: { periods: { T1: { grade: 14, appreciation: 'Bien' } } }, tokenUsage: { appreciation: null, sw: null, ns: null } }
            ];
            const hashLegacy = StorageManager.computeCurrentDataHash();

            runtimeState.data.generatedResults[0].tokenUsage = { appreciation: { total_tokens: 99 }, analysis: { total_tokens: 45 }, generationTimeMs: 500 };
            const hashCanonical = StorageManager.computeCurrentDataHash();

            expect(hashCanonical).toBe(hashLegacy);
        });

        it('should migrate flat strengthsWeaknesses/nextSteps into analysisPerPeriod when analysisGenerationPeriod is set', () => {
            const results = [
                {
                    id: 'stu-legacy',
                    strengthsWeaknesses: { strengths: ['Participation'], weaknesses: ['Soin'] },
                    nextSteps: ['Relire les consignes'],
                    analysisGenerationPeriod: 'T1',
                    analysisSnapshot: { period: 'T1', grade: 13 },
                    _lastModified: 5000,
                    studentData: { periods: { T1: { grade: 13 } }, currentPeriod: 'T2' }
                },
                {
                    id: 'stu-unmarked',
                    strengthsWeaknesses: 'Ancien texte sans période',
                    studentData: { periods: { T1: { grade: 11 } }, currentPeriod: 'T2' }
                }
            ];

            const migrated = StorageManager.migrateData(results);
            expect(migrated[0].analysisPerPeriod.T1).toMatchObject({
                strengths: ['Participation'],
                weaknesses: ['Soin'],
                nextSteps: ['Relire les consignes'],
                source: 'legacy',
                _lastModified: 5000
            });
            expect(migrated[0].analysisPerPeriod.T2).toBeUndefined();
            // Do not blindly guess period for unmarked legacy entries
            expect(migrated[1].analysisPerPeriod).toBeUndefined();
        });

        it('should prefer result.timestamp or 0 (never Date.now()) when migrating legacy flat analysis without _lastModified', () => {
            const oldIso = '2025-11-10T09:00:00.000Z';
            const migrated = StorageManager.migrateData([
                {
                    id: 'stu-with-ts',
                    strengthsWeaknesses: { strengths: ['Sérieux'], weaknesses: [] },
                    analysisGenerationPeriod: 'T1',
                    timestamp: oldIso,
                    studentData: { periods: { T1: { grade: 14 } }, currentPeriod: 'T1' }
                },
                {
                    id: 'stu-no-ts',
                    strengthsWeaknesses: { strengths: ['Curieux'], weaknesses: [] },
                    analysisGenerationPeriod: 'T1',
                    studentData: { periods: { T1: { grade: 12 } }, currentPeriod: 'T1' }
                }
            ]);

            expect(migrated[0].analysisPerPeriod.T1._lastModified).toBe(new Date(oldIso).getTime());
            expect(migrated[1].analysisPerPeriod.T1._lastModified).toBe(0);
            expect(StorageManager._resolveLegacyLastModified({ timestamp: oldIso })).toBe(new Date(oldIso).getTime());
            expect(StorageManager._resolveLegacyLastModified({ _lastModified: 0 })).toBe(0);
            expect(StorageManager._resolveLegacyLastModified({})).toBe(0);
        });
    });

    describe('_hashString & computeCurrentDataHash', () => {
        it('should hash strings consistently to a 16-character hex representation', () => {
            const str1 = 'hello world';
            const str2 = 'hello world';
            const str3 = 'hello world!';

            const hash1 = StorageManager._hashString(str1);
            const hash2 = StorageManager._hashString(str2);
            const hash3 = StorageManager._hashString(str3);

            expect(hash1.length).toBe(16);
            expect(/^[0-9a-f]{16}$/.test(hash1)).toBe(true);
            expect(hash1).toBe(hash2);
            expect(hash1).not.toBe(hash3);
        });

        it('should compute hash for current data', () => {
            const hash = StorageManager.computeCurrentDataHash();
            expect(hash.length).toBe(16);
            expect(/^[0-9a-f]{16}$/.test(hash)).toBe(true);
        });

        it('should keep data hash invariant when only _lastModified, seatingUpdatedAt or seatingValidatedAt changes', () => {
            runtimeState.data.generatedResults = [{
                id: 'student_1',
                _lastModified: 1000,
                studentData: {
                    nom: 'Dupont',
                    periods: {
                        T1: { grade: 14, appreciation: 'Très bon travail', _lastModified: 1000 }
                    }
                }
            }];
            userSettings.academic.classes = [{
                id: 'class_1',
                name: '3ème A',
                seatingUpdatedAt: 1000,
                seatingValidatedAt: 1000
            }];

            const initialHash = StorageManager.computeCurrentDataHash();

            // Mutate ONLY timestamps
            runtimeState.data.generatedResults[0]._lastModified = 9999999;
            runtimeState.data.generatedResults[0].studentData.periods.T1._lastModified = 8888888;
            userSettings.academic.classes[0].seatingUpdatedAt = 7777777;
            userSettings.academic.classes[0].seatingValidatedAt = 6666666;

            const newHash = StorageManager.computeCurrentDataHash();
            expect(newHash).toBe(initialHash);

            // Mutate real data -> hash MUST change
            runtimeState.data.generatedResults[0].studentData.periods.T1.appreciation = 'Travail exceptionnel';
            const changedHash = StorageManager.computeCurrentDataHash();
            expect(changedHash).not.toBe(initialHash);
        });

        it('should include synced preferences (accent, seating dots) in the data hash but ignore theme, view and navigation state', () => {
            const { theme, accentColor, activeView, isAppreciationFullView, seatingStatusDots } = userSettings.ui;
            const baseHash = StorageManager.computeCurrentDataHash();

            userSettings.ui.theme = 'light';
            userSettings.ui.activeView = 'plan';
            userSettings.ui.isAppreciationFullView = true;
            runtimeState.navigation.currentPeriod = 'T2';
            expect(StorageManager.computeCurrentDataHash()).toBe(baseHash);
            expect(StorageManager.getExportableSettings().theme).toBe('light');

            userSettings.ui.accentColor = '#ff0055';
            const accentHash = StorageManager.computeCurrentDataHash();
            expect(accentHash).not.toBe(baseHash);

            userSettings.ui.seatingStatusDots = { ppre: false };
            expect(StorageManager.computeCurrentDataHash()).not.toBe(accentHash);

            Object.assign(userSettings.ui, { theme, accentColor, activeView, isAppreciationFullView, seatingStatusDots });
            runtimeState.navigation.currentPeriod = 'T1';
            expect(StorageManager.computeCurrentDataHash()).toBe(baseHash);
        });

        it('should compute lightweight photo fingerprints and detect photo changes in computeCurrentDataHash', () => {
            expect(StorageManager._getPhotoFingerprint(null)).toBeNull();
            expect(StorageManager._getPhotoFingerprint(undefined)).toBeNull();
            expect(StorageManager._getPhotoFingerprint({ source: 'manual' })).toEqual({
                source: 'manual',
                uploadedAt: null,
                dataRef: null
            });

            const base64A = 'data:image/jpeg;base64,' + 'A'.repeat(5000) + 'END_A';
            const base64B = 'data:image/jpeg;base64,' + 'B'.repeat(5000) + 'END_B';

            runtimeState.data.generatedResults = [{
                id: 'student_photo_1',
                studentPhoto: { data: base64A, source: 'trombinoscope', uploadedAt: '2026-10-01T10:00:00Z' },
                studentData: { nom: 'Dupont', periods: {} }
            }];

            const hashA = StorageManager.computeCurrentDataHash();
            runtimeState.data.generatedResults[0].studentPhoto.data = base64B;
            const hashB = StorageManager.computeCurrentDataHash();

            expect(hashA).not.toBe(hashB);
        });
    });

    describe('mergeRemoteData', () => {
        beforeEach(() => {
            userSettings.academic.classes = [];
            userSettings.academic.currentClassId = null;
            runtimeState.data.generatedResults = [];
            runtimeState.data.filteredResults = [];
        });

        it('should add remote students that do not exist locally', async () => {
            runtimeState.data.generatedResults = [
                { id: 'student_1', studentData: { nom: 'Dupont', prenom: 'Alice' } }
            ];

            const remoteData = {
                generatedResults: [
                    { id: 'student_2', studentData: { nom: 'Martin', prenom: 'Bob' } }
                ]
            };

            const result = await StorageManager.mergeRemoteData(remoteData);

            expect(result.success).toBe(true);
            expect(result.stats.addedStudents).toBe(1);
            expect(runtimeState.data.generatedResults.length).toBe(2);
            expect(runtimeState.data.generatedResults.map(s => s.id)).toEqual(['student_1', 'student_2']);
            expect(DBService.putAll).toHaveBeenCalledWith('generatedResults', expect.any(Array));
        });

        it('should additively merge journal entries without losing local or remote notes', async () => {
            runtimeState.data.generatedResults = [
                {
                    id: 'student_1',
                    studentData: { nom: 'Dupont' },
                    journal: [
                        { id: 'j_local_1', date: '2026-09-10', note: 'Observation locale' }
                    ]
                }
            ];

            const remoteData = {
                generatedResults: [
                    {
                        id: 'student_1',
                        studentData: { nom: 'Dupont' },
                        journal: [
                            { id: 'j_remote_1', date: '2026-09-12', note: 'Note prise sur smartphone' }
                        ]
                    }
                ]
            };

            const result = await StorageManager.mergeRemoteData(remoteData);

            expect(result.success).toBe(true);
            expect(result.stats.addedJournalEntries).toBe(1);
            const student = runtimeState.data.generatedResults.find(s => s.id === 'student_1');
            expect(student.journal.length).toBe(2);
            expect(student.journal.map(j => j.id)).toContain('j_local_1');
            expect(student.journal.map(j => j.id)).toContain('j_remote_1');
        });

        it('should resolve appreciation conflicts using _lastModified timestamp', async () => {
            runtimeState.data.generatedResults = [
                {
                    id: 'student_1',
                    studentData: {
                        periods: {
                            T1: { appreciation: 'Ancienne version PC', _lastModified: 1000 }
                        }
                    }
                }
            ];

            const remoteData = {
                generatedResults: [
                    {
                        id: 'student_1',
                        studentData: {
                            periods: {
                                T1: { appreciation: 'Nouvelle version Smartphone', _lastModified: 2000 }
                            }
                        }
                    }
                ]
            };

            const result = await StorageManager.mergeRemoteData(remoteData);

            expect(result.success).toBe(true);
            expect(result.stats.updatedStudents).toBe(1);
            const student = runtimeState.data.generatedResults.find(s => s.id === 'student_1');
            expect(student.studentData.periods.T1.appreciation).toBe('Nouvelle version Smartphone');
            expect(student.studentData.periods.T1._lastModified).toBe(2000);
        });

        it('should preserve local appreciation if local timestamp is newer', async () => {
            runtimeState.data.generatedResults = [
                {
                    id: 'student_1',
                    studentData: {
                        periods: {
                            T1: { appreciation: 'Version la plus récente sur PC', _lastModified: 3000 }
                        }
                    }
                }
            ];

            const remoteData = {
                generatedResults: [
                    {
                        id: 'student_1',
                        studentData: {
                            periods: {
                                T1: { appreciation: 'Version plus ancienne Smartphone', _lastModified: 1000 }
                            }
                        }
                    }
                ]
            };

            const result = await StorageManager.mergeRemoteData(remoteData);

            expect(result.success).toBe(true);
            const student = runtimeState.data.generatedResults.find(s => s.id === 'student_1');
            expect(student.studentData.periods.T1.appreciation).toBe('Version la plus récente sur PC');
            expect(student.studentData.periods.T1._lastModified).toBe(3000);
        });

        it('should merge classes and statuses as non-destructive unions', async () => {
            userSettings.academic.classes = [{ id: 'class_a', name: '3ème A' }];
            runtimeState.data.generatedResults = [
                {
                    id: 'student_1',
                    studentData: { statuses: ['DYS'] }
                }
            ];

            const remoteData = {
                classes: [{ id: 'class_b', name: '3ème B' }],
                generatedResults: [
                    {
                        id: 'student_1',
                        studentData: { statuses: ['PAP'] }
                    }
                ]
            };

            const result = await StorageManager.mergeRemoteData(remoteData);

            expect(result.success).toBe(true);
            expect(result.stats.addedClasses).toBe(1);
            expect(userSettings.academic.classes.length).toBe(2);

            const student = runtimeState.data.generatedResults.find(s => s.id === 'student_1');
            expect(student.studentData.statuses).toEqual(['DYS', 'PAP']);
        });

        it('should not resurrect deleted students or classes when tombstones in deletedItems are newer than remote timestamps', async () => {
            userSettings.academic.classes = [{ id: 'class_a', name: '3ème A' }];
            runtimeState.data.generatedResults = [
                { id: 'student_1', classId: 'class_a', _lastModified: 1000, studentData: { nom: 'Dupont' } }
            ];
            runtimeState.data.deletedItems = {
                students: [{ id: 'student_deleted', classId: 'class_a', deletedAt: 5000 }],
                classes: [{ id: 'class_deleted', deletedAt: 5000 }]
            };

            const remoteData = {
                classes: [
                    { id: 'class_a', name: '3ème A' },
                    { id: 'class_deleted', name: 'Classe Supprimée', updatedAt: 2000 }
                ],
                generatedResults: [
                    { id: 'student_1', classId: 'class_a', _lastModified: 1000, studentData: { nom: 'Dupont' } },
                    { id: 'student_deleted', classId: 'class_a', _lastModified: 2000, studentData: { nom: 'Zombie' } }
                ]
            };

            const result = await StorageManager.mergeRemoteData(remoteData);

            expect(result.success).toBe(true);
            expect(result.stats.addedStudents).toBe(0);
            expect(result.stats.addedClasses).toBe(0);
            expect(runtimeState.data.generatedResults.map(s => s.id)).toEqual(['student_1']);
            expect(userSettings.academic.classes.map(c => c.id)).toEqual(['class_a']);
        });

        it('should distinguish addedStudents (unique persons) from addedEnrollments (existing students copied to a group)', async () => {
            userSettings.academic.classes = [
                { id: 'c_32', name: '3°2' },
                { id: 'g_papd', name: 'PAPD', isGroup: true }
            ];
            runtimeState.data.generatedResults = [
                { id: 's_khaalid_32', nom: 'AHMED MOHAMUD', prenom: 'Khaalid', classId: 'c_32', _lastModified: 1000, studentData: {} }
            ];
            runtimeState.data.deletedItems = { students: [], classes: [] };

            const remoteData = {
                classes: [
                    { id: 'c_32', name: '3°2' },
                    { id: 'g_papd', name: 'PAPD', isGroup: true }
                ],
                generatedResults: [
                    { id: 's_khaalid_32', nom: 'AHMED MOHAMUD', prenom: 'Khaalid', classId: 'c_32', _lastModified: 1000, studentData: {} },
                    { id: 's_khaalid_papd', nom: 'AHMED MOHAMUD', prenom: 'Khaalid', classId: 'g_papd', _lastModified: 2000, studentData: {} },
                    { id: 's_new_32', nom: 'MOLET', prenom: 'Nolan', classId: 'c_32', _lastModified: 2000, studentData: {} }
                ]
            };

            const result = await StorageManager.mergeRemoteData(remoteData);

            expect(result.success).toBe(true);
            expect(result.stats.addedStudents).toBe(1);
            expect(result.stats.addedEnrollments).toBe(1);
        });
    });

    describe('PreRestoreSnapshot', () => {
        beforeEach(() => {
            vi.clearAllMocks();
        });

        it('should save pre-restore snapshot without API keys when results exist', async () => {
            runtimeState.data.generatedResults = [{ id: 's1' }];
            userSettings.academic.classes = [{ id: 'c1' }];
            userSettings.api.openaiApiKey = 'sk-secret-local';

            expect(await StorageManager.savePreRestoreSnapshot()).toBe(true);

            expect(DBService.put).toHaveBeenCalledWith('appData', expect.objectContaining({
                key: 'pre_restore_backup',
                generatedResults: [{ id: 's1' }],
                settings: expect.not.objectContaining({ openaiApiKey: 'sk-secret-local' })
            }));
        });

        it('should return snapshot if within 24h and clear if expired', async () => {
            const validSnapshot = {
                key: 'pre_restore_backup',
                createdAt: Date.now() - 3600000,
                generatedResults: [{ id: 's1' }]
            };
            DBService.get.mockResolvedValueOnce(validSnapshot);

            const res = await StorageManager.getPreRestoreSnapshot();
            expect(res).toEqual(validSnapshot);

            const expiredSnapshot = {
                key: 'pre_restore_backup',
                createdAt: Date.now() - 90000000,
                generatedResults: [{ id: 's1' }]
            };
            DBService.get.mockResolvedValueOnce(expiredSnapshot);

            const expiredRes = await StorageManager.getPreRestoreSnapshot();
            expect(expiredRes).toBeNull();
            expect(DBService.delete).toHaveBeenCalledWith('appData', 'pre_restore_backup');
        });

        it('should clear snapshot from IndexedDB', async () => {
            await StorageManager.clearPreRestoreSnapshot();

            expect(DBService.delete).toHaveBeenCalledWith('appData', 'pre_restore_backup');
        });
    });

    describe('importBackup & getExportableSettings', () => {
        it('should include activeView in getExportableSettings', () => {
            userSettings.ui.activeView = 'plan';
            const settings = StorageManager.getExportableSettings();
            expect(settings.activeView).toBe('plan');
        });

        it('should restore activeView from backup when importing', async () => {
            const backupContent = JSON.stringify({
                appVersion: '4.3.0',
                settings: {
                    subjects: { Français: {} },
                    activeView: 'plan'
                }
            });

            await StorageManager.importBackup(backupContent, { mergeData: true, silent: true });
            expect(appState.activeView).toBe('plan');
        });

        it('should ignore backup.currentClassId, select first real class when no valid local class is active, and preserve active local class when still present', async () => {
            userSettings.academic.classes = [
                { id: 'demo', name: 'Classe exemple', isDemo: true }
            ];
            userSettings.academic.currentClassId = 'demo';

            const backupContent = JSON.stringify({
                appVersion: '4.3.0',
                classes: [
                    { id: 'c1', name: '3A' },
                    { id: 'c2', name: '3B' }
                ],
                currentClassId: 'c2',
                generatedResults: [
                    { id: 's1', nom: 'Dupont', prenom: 'Alice', classId: 'c1', studentData: { periods: {} } },
                    { id: 's2', nom: 'Martin', prenom: 'Bob', classId: 'c2', studentData: { periods: {} } }
                ]
            });

            // 1. Fresh/demo session -> ignores backup.currentClassId ('c2') and selects first real class ('c1')
            await StorageManager.importBackup(backupContent, { mergeData: true, silent: true });
            expect(userSettings.academic.currentClassId).toBe('c1');
            expect(appState.currentClassId).toBe('c1');
            expect(runtimeState.data.filteredResults.map(r => r.id)).toEqual(['s1']);

            // 2. Active real class ('c2') -> preserved across import even if backup specifies another class
            userSettings.academic.currentClassId = 'c2';
            appState.currentClassId = 'c2';
            const secondBackup = JSON.stringify({
                appVersion: '4.3.0',
                classes: [
                    { id: 'c1', name: '3A' },
                    { id: 'c2', name: '3B' }
                ],
                currentClassId: 'c1',
                generatedResults: [
                    { id: 's1', nom: 'Dupont', prenom: 'Alice', classId: 'c1', studentData: { periods: {} } },
                    { id: 's2', nom: 'Martin', prenom: 'Bob', classId: 'c2', studentData: { periods: {} } }
                ]
            });

            await StorageManager.importBackup(secondBackup, { mergeData: false, silent: true });
            expect(userSettings.academic.currentClassId).toBe('c2');
            expect(appState.currentClassId).toBe('c2');
            expect(runtimeState.data.filteredResults.map(r => r.id)).toEqual(['s2']);
        });

        it('should keep an active virtual class after import, resolved once students are imported', async () => {
            const classes = [
                { id: 'g1', name: '3 TECHNOLOGIE G1' },
                { id: 'g2', name: '3 TECHNOLOGIE G2' }
            ];
            const students = [
                { id: 's1', nom: 'Dupont', prenom: 'Alice', classId: 'g1', studentData: { classe: '3 1', periods: {} } },
                { id: 's2', nom: 'Martin', prenom: 'Bob', classId: 'g2', studentData: { classe: '3 1', periods: {} } },
                { id: 's3', nom: 'Durand', prenom: 'David', classId: 'g2', studentData: { classe: '3 2', periods: {} } }
            ];
            userSettings.academic.classes = [];
            runtimeState.data.generatedResults = [];
            userSettings.academic.currentClassId = 'virtual_31';

            await StorageManager.importBackup(
                JSON.stringify({ appVersion: '4.3.0', classes, generatedResults: students }),
                { mergeData: false, silent: true }
            );

            expect(userSettings.academic.currentClassId).toBe('virtual_31');
            expect(runtimeState.data.filteredResults.map(r => r.id)).toEqual(['s1', 's2']);
        });

        it('should export classes and deletedItems only at the root level, never inside settings', () => {
            userSettings.academic.classes = [{ id: 'c1', name: '3A' }];
            runtimeState.data.deletedItems = {
                students: [{ id: 's-del', deletedAt: 1234 }],
                classes: [{ id: 'c-del', deletedAt: 5678 }]
            };
            const settings = StorageManager.getExportableSettings({ includeApiKeys: true });
            expect(settings.classes).toBeUndefined();
            expect(settings.deletedItems).toBeUndefined();
            expect(settings.currentClassId).toBeUndefined();

            const downloadSpy = vi.spyOn(StorageManager, '_downloadFile').mockImplementation(() => {});
            StorageManager.exportToJson();
            expect(downloadSpy).toHaveBeenCalledTimes(1);
            const exportedPayload = JSON.parse(downloadSpy.mock.calls[0][0]);
            expect(exportedPayload.deletedItems).toEqual({
                students: [{ id: 's-del', deletedAt: 1234 }],
                classes: [{ id: 'c-del', deletedAt: 5678 }]
            });
            expect(exportedPayload.settings.deletedItems).toBeUndefined();
            downloadSpy.mockRestore();
        });

        it('should perform granular per-period, journal, class analyses, and tombstone merge during importBackup({ mergeData: true })', async () => {
            userSettings.academic.classes = [
                {
                    id: 'c1',
                    name: '3A',
                    analyses: {
                        T1: { content: '<p>Synthèse T1 récente locale</p>', timestamp: 3000 },
                        T2: { content: '<p>Synthèse T2 ancienne locale</p>', timestamp: 1000 }
                    }
                },
                { id: 'c-deleted-in-backup', name: 'Ancienne classe', updatedAt: 1000 }
            ];
            runtimeState.data.generatedResults = [
                {
                    id: 's1',
                    nom: 'Dupont',
                    prenom: 'Alise',
                    classId: 'c1',
                    _lastModified: 2000,
                    strengthsWeaknesses: 'Ancien bilan',
                    journal: [{ id: 'j-local', date: '2026-10-01', note: 'Observation locale' }],
                    studentData: {
                        nom: 'Dupont',
                        prenom: 'Alise',
                        statuses: ['DYS'],
                        periods: {
                            T1: { grade: 15, appreciation: 'T1 locale récente', _lastModified: 3000 },
                            T2: { grade: 11, appreciation: 'T2 locale ancienne', _lastModified: 1000 }
                        }
                    }
                },
                {
                    id: 's-deleted',
                    nom: 'Fantome',
                    prenom: 'Paul',
                    classId: 'c1',
                    _lastModified: 1000,
                    studentData: { periods: {} }
                }
            ];

            const backupContent = JSON.stringify({
                appVersion: '4.3.0',
                deletedItems: {
                    students: [{ id: 's-deleted', deletedAt: 5000 }],
                    classes: [{ id: 'c-deleted-in-backup', deletedAt: 5000 }]
                },
                classes: [
                    {
                        id: 'c1',
                        name: '3A',
                        analyses: {
                            T1: { content: '<p>Synthèse T1 ancienne backup</p>', timestamp: 1000 },
                            T2: { content: '<p>Synthèse T2 récente backup</p>', timestamp: 4000 },
                            T3: { content: '<p>Synthèse T3 nouvelle backup</p>', timestamp: 2000 }
                        }
                    }
                ],
                generatedResults: [
                    {
                        id: 's1',
                        nom: 'Dupont',
                        prenom: 'Alice',
                        classId: 'c1',
                        _lastModified: 4000,
                        strengthsWeaknesses: 'Nouveau bilan forces/faiblesses',
                        nextSteps: 'Nouvelles pistes de progrès',
                        historyPerPeriod: {
                            T2: { versions: [{ content: 'T2 backup récente', timestamp: 4000 }], currentIndex: 0 }
                        },
                        journal: [{ id: 'j-backup', date: '2026-10-05', note: 'Observation backup' }],
                        studentData: {
                            nom: 'Dupont',
                            prenom: 'Alice',
                            statuses: ['PAP'],
                            periods: {
                                T1: { grade: 12, appreciation: 'T1 backup ancienne', _lastModified: 1000 },
                                T2: { grade: 14, appreciation: 'T2 backup récente', _lastModified: 4000 }
                            }
                        }
                    }
                ]
            });

            await StorageManager.importBackup(backupContent, { mergeData: true, silent: true });

            // Tombstones applied to both classes and students
            expect(userSettings.academic.classes.map(c => c.id)).toEqual(['c1']);
            expect(runtimeState.data.generatedResults.map(s => s.id)).toEqual(['s1']);

            // Class AI syntheses merged per period by timestamp
            const mergedClass = userSettings.academic.classes[0];
            expect(mergedClass.analyses.T1.content).toBe('<p>Synthèse T1 récente locale</p>');
            expect(mergedClass.analyses.T2.content).toBe('<p>Synthèse T2 récente backup</p>');
            expect(mergedClass.analyses.T3.content).toBe('<p>Synthèse T3 nouvelle backup</p>');

            // Student periods, journal, statuses, and top-level fields merged granularly without losing T1 local or T2 backup
            const mergedStudent = runtimeState.data.generatedResults[0];
            expect(mergedStudent.prenom).toBe('Alice');
            expect(mergedStudent.studentData.prenom).toBe('Alice');
            expect(mergedStudent.strengthsWeaknesses).toBe('Nouveau bilan forces/faiblesses');
            expect(mergedStudent.nextSteps).toBe('Nouvelles pistes de progrès');
            expect(mergedStudent.studentData.periods.T1.appreciation).toBe('T1 locale récente');
            expect(mergedStudent.studentData.periods.T1.grade).toBe(15);
            expect(mergedStudent.studentData.periods.T2.appreciation).toBe('T2 backup récente');
            expect(mergedStudent.studentData.periods.T2.grade).toBe(14);
            expect(mergedStudent.historyPerPeriod.T2.versions[0].content).toBe('T2 backup récente');
            expect(mergedStudent.journal.map(j => j.id).sort()).toEqual(['j-backup', 'j-local']);
            expect(mergedStudent.studentData.statuses).toEqual(['DYS', 'PAP']);
        });

        it('should keep local record fields when local record is newer, and not flag identical array fields as updates', async () => {
            userSettings.academic.classes = [{ id: 'c1', name: '3A' }];
            runtimeState.data.generatedResults = [
                {
                    id: 's1',
                    nom: 'Dupont',
                    prenom: 'Alice',
                    classId: 'c1',
                    _lastModified: 5000,
                    strengthsWeaknesses: 'Bilan local récent',
                    nextSteps: ['Piste A', 'Piste B'],
                    studentData: { periods: {} }
                }
            ];

            const result = await StorageManager.mergeRemoteData({
                classes: [{ id: 'c1', name: '3A' }],
                generatedResults: [
                    {
                        id: 's1',
                        nom: 'Dupont',
                        prenom: 'Alise',
                        classId: 'c1',
                        _lastModified: 1000,
                        strengthsWeaknesses: 'Bilan distant ancien',
                        nextSteps: ['Piste A', 'Piste B'],
                        studentData: { periods: {} }
                    }
                ]
            });

            const student = runtimeState.data.generatedResults[0];
            expect(student.prenom).toBe('Alice');
            expect(student.strengthsWeaknesses).toBe('Bilan local récent');
            expect(result.stats.updatedStudents).toBe(0);
            expect(student._lastModified).toBe(5000);

            // Remote newer with identical nextSteps content -> no spurious update
            const sameContent = await StorageManager.mergeRemoteData({
                generatedResults: [
                    { ...student, _lastModified: 9000, nextSteps: ['Piste A', 'Piste B'], studentData: { periods: {} } }
                ]
            });
            expect(sameContent.stats.updatedStudents).toBe(0);
        });

        it('should merge analysisPerPeriod granularly by period timestamp without overwriting other periods', async () => {
            userSettings.academic.classes = [{ id: 'c1', name: '3A' }];
            runtimeState.data.generatedResults = [
                {
                    id: 's1',
                    nom: 'Dupont',
                    prenom: 'Alice',
                    classId: 'c1',
                    _lastModified: 2000,
                    analysisPerPeriod: {
                        T1: {
                            strengths: ['Point fort T1 local'],
                            weaknesses: [],
                            nextSteps: ['Piste T1 locale'],
                            source: 'manual',
                            _lastModified: 6000
                        }
                    },
                    studentData: { currentPeriod: 'T1', periods: {} }
                }
            ];

            await StorageManager.mergeRemoteData({
                classes: [{ id: 'c1', name: '3A' }],
                generatedResults: [
                    {
                        id: 's1',
                        nom: 'Dupont',
                        prenom: 'Alice',
                        classId: 'c1',
                        _lastModified: 7000,
                        analysisPerPeriod: {
                            T1: {
                                strengths: ['T1 distant ancien'],
                                weaknesses: ['À ignorer'],
                                nextSteps: ['À ignorer'],
                                source: 'ai',
                                _lastModified: 3000
                            },
                            T2: {
                                strengths: ['Progrès net T2'],
                                weaknesses: ['Méthodologie'],
                                nextSteps: ['Structurer les brouillons'],
                                source: 'ai',
                                _lastModified: 7000
                            }
                        },
                        studentData: { currentPeriod: 'T2', periods: {} }
                    }
                ]
            });

            const merged = runtimeState.data.generatedResults[0];
            expect(merged.analysisPerPeriod.T1.strengths).toEqual(['Point fort T1 local']);
            expect(merged.analysisPerPeriod.T2.strengths).toEqual(['Progrès net T2']);
            expect(merged.analysisPerPeriod.T2.nextSteps).toEqual(['Structurer les brouillons']);
            // Root cache reflects localStudent.studentData.currentPeriod (T1) rather than leaking T2
            expect(merged.analysisGenerationPeriod).toBe('T1');
            expect(merged.strengthsWeaknesses.strengths).toEqual(['Point fort T1 local']);
        });

        it('should evict virgin first-visit Classe exemple when merging real classes, while preserving intentional Classe exemple', async () => {
            // 1. Fresh device (only default Classe exemple) + Cloud/backup with real classes only -> evicts virgin demo class & students
            userSettings.academic.classes = [{ id: 'demo-fresh', name: 'Classe exemple', isDemo: true }];
            runtimeState.data.generatedResults = [
                { id: 'demo-s1', nom: 'Martin', prenom: 'Léo', classId: 'demo-fresh', studentData: { periods: {} } }
            ];

            await StorageManager.mergeRemoteData({
                classes: [{ id: 'c1', name: '3A' }],
                generatedResults: [{ id: 's1', nom: 'Dupont', prenom: 'Alice', classId: 'c1', studentData: { periods: {} } }]
            });

            expect(userSettings.academic.classes.map(c => c.id)).toEqual(['c1']);
            expect(runtimeState.data.generatedResults.map(s => s.id)).toEqual(['s1']);

            // 2. Fresh device (only default Classe exemple) + Cloud/backup where user kept their own Classe exemple alongside real classes -> replaces virgin demo without duplicate
            userSettings.academic.classes = [{ id: 'demo-fresh-2', name: 'Classe exemple', isDemo: true }];
            runtimeState.data.generatedResults = [
                { id: 'demo-s2', nom: 'Martin', prenom: 'Léo', classId: 'demo-fresh-2', studentData: { periods: {} } }
            ];

            await StorageManager.mergeRemoteData({
                classes: [
                    { id: 'demo-kept', name: 'Classe exemple', isDemo: true },
                    { id: 'c1', name: '3A' }
                ],
                generatedResults: [
                    { id: 's-exp', nom: 'Test', prenom: 'Sandbox', classId: 'demo-kept', studentData: { periods: {} } },
                    { id: 's1', nom: 'Dupont', prenom: 'Alice', classId: 'c1', studentData: { periods: {} } }
                ]
            });

            expect(userSettings.academic.classes.map(c => c.id)).toEqual(['demo-kept', 'c1']);
            expect(runtimeState.data.generatedResults.map(s => s.id)).toEqual(['s-exp', 's1']);

            // 3. Existing workspace (user already has real classes + Classe exemple locally) + imports another class -> keeps local Classe exemple
            await StorageManager.importBackup(
                JSON.stringify({
                    appVersion: '4.3.0',
                    classes: [{ id: 'c2', name: '4B' }],
                    generatedResults: [{ id: 's2', nom: 'Bernard', prenom: 'Emma', classId: 'c2', studentData: { periods: {} } }]
                }),
                { mergeData: true, silent: true }
            );

            expect(userSettings.academic.classes.map(c => c.id)).toEqual(['demo-kept', 'c1', 'c2']);
        });

        it('should replace an older local Classe exemple with a newer reset Classe exemple on merge without duplicates (even with distinct IDs)', async () => {
            userSettings.academic.classes = [
                { id: 'c1', name: '3A', createdAt: 1000, updatedAt: 1000 },
                { id: 'demo-old', name: 'Classe exemple', isDemo: true, createdAt: 1000, updatedAt: 1000 }
            ];
            runtimeState.data.generatedResults = [
                { id: 's1', nom: 'Dupont', prenom: 'Alice', classId: 'c1', studentData: { periods: {} } },
                { id: 'old-demo-s1', nom: 'Durand', prenom: 'Sophie', classId: 'demo-old', studentData: { periods: {} } }
            ];

            await StorageManager.mergeRemoteData({
                classes: [
                    { id: 'c1', name: '3A', createdAt: 1000, updatedAt: 1000 },
                    { id: 'demo-new', name: 'Classe exemple', isDemo: true, createdAt: 5000, updatedAt: 5000 }
                ],
                generatedResults: [
                    { id: 's1', nom: 'Dupont', prenom: 'Alice', classId: 'c1', studentData: { periods: {} } },
                    {
                        id: 'new-demo-s1',
                        nom: 'Durand',
                        prenom: 'Sophie',
                        classId: 'demo-new',
                        journal: [{ id: 'demo_j_durand_1', tags: ['progres'], note: 'Test', period: 'T1' }],
                        studentData: { periods: {} }
                    }
                ]
            });

            expect(userSettings.academic.classes.map(c => c.id)).toEqual(['c1', 'demo-new']);
            expect(runtimeState.data.generatedResults.map(s => s.id)).toEqual(['s1', 'new-demo-s1']);

            // Reverse direction: merging an older remote demo must not duplicate or resurrect old demo students
            await StorageManager.mergeRemoteData({
                classes: [
                    { id: 'c1', name: '3A', createdAt: 1000, updatedAt: 1000 },
                    { id: 'demo-stale', name: 'Classe exemple', isDemo: true, createdAt: 2000, updatedAt: 2000 }
                ],
                generatedResults: [
                    { id: 'stale-demo-s1', nom: 'Durand', prenom: 'Sophie', classId: 'demo-stale', studentData: { periods: {} } }
                ]
            });

            expect(userSettings.academic.classes.map(c => c.id)).toEqual(['c1', 'demo-new']);
            expect(runtimeState.data.generatedResults.map(s => s.id)).toEqual(['s1', 'new-demo-s1']);
        });

        it('should remove demo students when importing classes only (students category unchecked) evicts the virgin Classe exemple', async () => {
            userSettings.academic.classes = [{ id: 'demo-fresh', name: 'Classe exemple', isDemo: true }];
            runtimeState.data.generatedResults = [
                { id: 'demo-s1', nom: 'Martin', prenom: 'Léo', classId: 'demo-fresh', studentData: { periods: {} } }
            ];

            await StorageManager.importBackup(
                JSON.stringify({
                    appVersion: '4.3.0',
                    classes: [{ id: 'c1', name: '3A' }],
                    generatedResults: [{ id: 's1', nom: 'Dupont', prenom: 'Alice', classId: 'c1', studentData: { periods: {} } }]
                }),
                { mergeData: true, silent: true, categories: { classes: true, students: false } }
            );

            expect(userSettings.academic.classes.map(c => c.id)).toEqual(['c1']);
            expect(runtimeState.data.generatedResults).toEqual([]);
        });

        it('should exclude API keys and Ollama settings by default in getExportableSettings, and include API keys when includeApiKeys is true', () => {
            userSettings.api.googleApiKey = 'AIzaSyTestKey123';
            userSettings.api.openaiApiKey = 'sk-proj-test';
            userSettings.api.ollamaEnabled = true;
            userSettings.api.ollamaBaseUrl = 'http://192.168.1.50:11434';
            userSettings.api.ollamaInstalledModels = ['llama3:8b'];
            runtimeState.apiStatus = { google: 'valid' };
            runtimeState.validatedApiKeys = { google: true };

            const defaultExport = StorageManager.getExportableSettings();
            expect(defaultExport.googleApiKey).toBeUndefined();
            expect(defaultExport.openaiApiKey).toBeUndefined();
            expect(defaultExport.ollamaEnabled).toBeUndefined();
            expect(defaultExport.ollamaBaseUrl).toBeUndefined();
            expect(defaultExport.ollamaInstalledModels).toBeUndefined();
            expect(defaultExport.apiKeyStatus).toBeUndefined();
            expect(defaultExport.validatedApiKeys).toBeUndefined();

            const cloudExport = StorageManager.getExportableSettings({ includeApiKeys: true });
            expect(cloudExport.googleApiKey).toBe('AIzaSyTestKey123');
            expect(cloudExport.openaiApiKey).toBe('sk-proj-test');
            expect(cloudExport.ollamaEnabled).toBeUndefined();
            expect(cloudExport.ollamaBaseUrl).toBeUndefined();
            expect(cloudExport.ollamaInstalledModels).toBeUndefined();
            expect(cloudExport.apiKeyStatus).toBeUndefined();
            expect(cloudExport.validatedApiKeys).toBeUndefined();
        });

        it('should update computeCurrentDataHash when API keys or AI model change, but ignore Ollama and validation status', () => {
            userSettings.api.googleApiKey = 'key-v1';
            userSettings.api.currentAIModel = 'gemini-2.5-flash';
            userSettings.api.enableApiFallback = true;
            const baseHash = StorageManager.computeCurrentDataHash();

            // Changing API key must mark Cloud sync dirty (synced in private Google Drive appDataFolder)
            userSettings.api.googleApiKey = 'key-v2';
            expect(StorageManager.computeCurrentDataHash()).not.toBe(baseHash);
            userSettings.api.googleApiKey = 'key-v1';
            expect(StorageManager.computeCurrentDataHash()).toBe(baseHash);

            // Changing AI model or fallback must change data hash
            userSettings.api.currentAIModel = 'gpt-4o-mini';
            expect(StorageManager.computeCurrentDataHash()).not.toBe(baseHash);
            userSettings.api.currentAIModel = 'gemini-2.5-flash';

            userSettings.api.enableApiFallback = false;
            expect(StorageManager.computeCurrentDataHash()).not.toBe(baseHash);
            userSettings.api.enableApiFallback = true;

            // Changing local Ollama config or runtime validation state must NOT change data hash
            userSettings.api.ollamaEnabled = true;
            userSettings.api.ollamaBaseUrl = 'http://localhost:9999';
            userSettings.api.ollamaInstalledModels = ['mistral:latest'];
            runtimeState.apiStatus = { google: 'valid' };
            runtimeState.validatedApiKeys = { google: true };
            expect(StorageManager.computeCurrentDataHash()).toBe(baseHash);
        });

        it('should protect valid local API keys in merge mode, fill missing/invalid keys, reject bad ollamaBaseUrl, and allow explicit overwrite', async () => {
            userSettings.api.googleApiKey = 'existing-google-key';
            appState.googleApiKey = 'existing-google-key';
            userSettings.api.openaiApiKey = 'existing-openai-key';
            appState.openaiApiKey = 'existing-openai-key';
            userSettings.api.groqApiKey = '';
            appState.groqApiKey = '';
            userSettings.api.mistralApiKey = 'invalid-local-mistral';
            appState.mistralApiKey = 'invalid-local-mistral';
            userSettings.api.ollamaBaseUrl = 'http://localhost:11434';
            appState.ollamaBaseUrl = 'http://localhost:11434';
            runtimeState.validatedApiKeys.google = true;
            runtimeState.apiStatus.google = 'valid';
            runtimeState.validatedApiKeys.openai = true;
            runtimeState.apiStatus.openai = 'valid';
            runtimeState.apiStatus.mistral = 'invalid';

            const backupWithKeysAndExternalOllama = JSON.stringify({
                appVersion: '4.3.0',
                settings: {
                    googleApiKey: '',
                    openaiApiKey: 'new-openai-key',
                    groqApiKey: 'new-groq-key',
                    mistralApiKey: 'replacement-mistral-key',
                    ollamaBaseUrl: 'https://attacker.example.com:11434'
                }
            });

            // 1. Default importBackup (no categories.apiKeys) -> never touches API keys or ollamaBaseUrl
            const defaultRes = await StorageManager.importBackup(backupWithKeysAndExternalOllama, { mergeData: true, silent: true });
            expect(defaultRes.stats.apiKeysImported).toBe(0);
            expect(userSettings.api.googleApiKey).toBe('existing-google-key');
            expect(userSettings.api.openaiApiKey).toBe('existing-openai-key');
            expect(userSettings.api.groqApiKey).toBe('');
            expect(userSettings.api.ollamaBaseUrl).toBe('http://localhost:11434');

            // 2. Explicit categories.apiKeys = true in merge mode -> fills missing/invalid keys, preserves valid local openai key, rejects external ollamaBaseUrl
            const mergeExplicitRes = await StorageManager.importBackup(backupWithKeysAndExternalOllama, {
                mergeData: true,
                categories: { apiKeys: true },
                importOllamaConfig: true,
                silent: true
            });
            expect(mergeExplicitRes.stats.apiKeysImported).toBe(2);
            expect(userSettings.api.googleApiKey).toBe('existing-google-key');
            expect(userSettings.api.openaiApiKey).toBe('existing-openai-key');
            expect(runtimeState.validatedApiKeys.openai).toBe(true);
            expect(userSettings.api.groqApiKey).toBe('new-groq-key');
            expect(userSettings.api.mistralApiKey).toBe('replacement-mistral-key');
            expect(runtimeState.apiStatus.mistral).toBeNull();
            expect(userSettings.api.ollamaBaseUrl).toBe('http://localhost:11434');

            // 3. Non-merge overwrite with categories.apiKeys = true replaces valid key explicitly
            const replaceRes = await StorageManager.importBackup(backupWithKeysAndExternalOllama, {
                mergeData: false,
                categories: { apiKeys: true },
                silent: true
            });
            expect(replaceRes.stats.apiKeysImported).toBe(3);
            expect(userSettings.api.openaiApiKey).toBe('new-openai-key');
            expect(runtimeState.validatedApiKeys.openai).toBe(false);
        });

        it('should accept a pre-parsed object in importBackup and restore Albert API key + model when includeApiKeys is true', async () => {
            userSettings.api.albertApiKey = '';
            appState.albertApiKey = '';
            userSettings.api.currentAIModel = 'gemini-4-hydrogen';
            appState.currentAIModel = 'gemini-4-hydrogen';

            const cloudPayload = {
                _meta: { appVersion: '4.3.0', exportedAt: new Date().toISOString() },
                settings: {
                    subjects: { Français: {} },
                    albertApiKey: 'sk-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
                    currentAIModel: 'albert-openweight-medium',
                    enableApiFallback: false
                },
                classes: [{ id: 'c1', name: '3A' }],
                generatedResults: [{ id: 's1', nom: 'Dupont', prenom: 'Alice', classId: 'c1', studentData: { periods: {} } }]
            };

            const res = await StorageManager.importBackup(cloudPayload, {
                mergeData: false,
                includeApiKeys: true,
                silent: true
            });

            expect(res.success).toBe(true);
            expect(res.stats.apiKeysImported).toBe(1);
            expect(userSettings.api.albertApiKey).toBe('sk-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
            expect(appState.albertApiKey).toBe('sk-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
            expect(userSettings.api.currentAIModel).toBe('albert-openweight-medium');
            expect(appState.currentAIModel).toBe('albert-openweight-medium');
            expect(userSettings.api.enableApiFallback).toBe(false);
        });
    });

    describe('mergeRemoteData - API keys synchronization', () => {
        it('should adopt remote API key when local key is empty or invalid, and preserve valid local key against empty or different remote key', async () => {
            userSettings.api.googleApiKey = 'valid-local-google';
            appState.googleApiKey = 'valid-local-google';
            runtimeState.apiStatus.google = 'valid';
            runtimeState.validatedApiKeys.google = true;

            userSettings.api.openaiApiKey = '';
            appState.openaiApiKey = '';

            userSettings.api.openrouterApiKey = 'expired-local-or';
            appState.openrouterApiKey = 'expired-local-or';
            runtimeState.apiStatus.openrouter = 'invalid';
            runtimeState.validatedApiKeys.openrouter = false;

            const remoteData = {
                settings: {
                    googleApiKey: 'different-remote-google',
                    openaiApiKey: 'remote-openai-key',
                    openrouterApiKey: 'valid-remote-or',
                    groqApiKey: ''
                },
                generatedResults: []
            };

            await StorageManager.mergeRemoteData(remoteData);

            // Local valid key is preserved
            expect(userSettings.api.googleApiKey).toBe('valid-local-google');
            expect(runtimeState.validatedApiKeys.google).toBe(true);
            // Missing local key adopts remote key
            expect(userSettings.api.openaiApiKey).toBe('remote-openai-key');
            expect(runtimeState.validatedApiKeys.openai).toBe(false);
            // Invalid local key adopts non-empty remote key and resets status
            expect(userSettings.api.openrouterApiKey).toBe('valid-remote-or');
            expect(runtimeState.apiStatus.openrouter).toBeNull();
        });

        it('should reset Ollama config alongside Cloud API keys in resetAllSettings({ apiKeys: true })', async () => {
            userSettings.api.googleApiKey = 'local-google';
            appState.googleApiKey = 'local-google';
            userSettings.api.ollamaEnabled = true;
            appState.ollamaEnabled = true;
            userSettings.api.ollamaBaseUrl = 'http://127.0.0.1:11434';
            appState.ollamaBaseUrl = 'http://127.0.0.1:11434';
            userSettings.api.ollamaInstalledModels = ['qwen2.5:7b'];
            appState.ollamaInstalledModels = ['qwen2.5:7b'];
            runtimeState.validatedApiKeys.ollama = true;
            runtimeState.apiStatus.ollama = 'valid';

            const choicesSpy = vi.spyOn(ModalUI, 'showChoicesModal').mockResolvedValueOnce({
                confirmed: true,
                values: { apiKeys: true, subjects: false, thresholds: false, preferences: false }
            });

            await StorageManager.resetAllSettings();

            expect(choicesSpy).toHaveBeenCalled();
            expect(userSettings.api.googleApiKey).toBe('');
            expect(userSettings.api.ollamaEnabled).toBe(false);
            expect(appState.ollamaEnabled).toBe(false);
            expect(userSettings.api.ollamaBaseUrl).toBe('http://localhost:11434');
            expect(appState.ollamaBaseUrl).toBe('http://localhost:11434');
            expect(userSettings.api.ollamaInstalledModels).toEqual([]);
            expect(runtimeState.validatedApiKeys.ollama).toBe(false);
            expect(runtimeState.apiStatus.ollama).toBeNull();
        });

        it('should adopt remote currentAIModel when local device is on default model without a local API key for that provider', async () => {
            // Fresh smartphone state: default model is gemini-4-hydrogen, but no Google API key is configured locally
            userSettings.api.googleApiKey = '';
            appState.googleApiKey = '';
            userSettings.api.albertApiKey = '';
            appState.albertApiKey = '';
            userSettings.api.currentAIModel = 'gemini-4-hydrogen';
            appState.currentAIModel = 'gemini-4-hydrogen';

            await StorageManager.mergeRemoteData({
                settings: {
                    albertApiKey: 'sk-albert-remote-valid-key',
                    currentAIModel: 'albert-openweight-medium'
                },
                generatedResults: []
            });

            expect(userSettings.api.albertApiKey).toBe('sk-albert-remote-valid-key');
            expect(userSettings.api.currentAIModel).toBe('albert-openweight-medium');
            expect(appState.currentAIModel).toBe('albert-openweight-medium');

            // Now local model ('albert-openweight-medium') has a valid key -> subsequent merge with another remote model preserves local choice
            await StorageManager.mergeRemoteData({
                settings: {
                    openaiApiKey: 'sk-proj-remote-openai-key',
                    currentAIModel: 'gpt-4o-mini'
                },
                generatedResults: []
            });

            expect(userSettings.api.currentAIModel).toBe('albert-openweight-medium');
            expect(userSettings.api.openaiApiKey).toBe('sk-proj-remote-openai-key');
        });
    });

    describe('mergeRemoteData - seating chart synchronization', () => {
        it('should merge remote seatingPosition when remote class seating is newer', async () => {
            const classId = 'class-1';
            userSettings.academic.classes = [
                { id: classId, name: '3A', seatingUpdatedAt: 1000 }
            ];
            runtimeState.data.generatedResults = [
                { id: 'student-1', nom: 'DUPONT', prenom: 'Jean', classId, seatingPosition: { row: 0, col: 0, pinned: false } }
            ];

            const remoteData = {
                classes: [
                    { id: classId, name: '3A', seatingUpdatedAt: 2000, seatingLocked: true }
                ],
                generatedResults: [
                    { id: 'student-1', nom: 'DUPONT', prenom: 'Jean', classId, seatingPosition: { row: 1, col: 2, pinned: true } }
                ]
            };

            await StorageManager.mergeRemoteData(remoteData);

            const updatedStudent = runtimeState.data.generatedResults.find(r => r.id === 'student-1');
            expect(updatedStudent.seatingPosition).toEqual({ row: 1, col: 2, pinned: true });
            const updatedClass = userSettings.academic.classes.find(c => c.id === classId);
            expect(updatedClass.seatingUpdatedAt).toBe(2000);
            expect(updatedClass.seatingLocked).toBe(true);
        });
    });

    describe('loadAppState - data purge protection', () => {
        it('should not overwrite existing bulletin_last_sync_hash when IndexedDB student data is missing on load', async () => {
            const { DBService } = await import('../services/DBService.js');
            DBService.getAll.mockResolvedValueOnce([]);

            localStorage.setItem('bulletin-assistant-state', JSON.stringify({
                version: '4.3.0',
                settings: {
                    classes: [{ id: 'c1', name: '4°4' }],
                    currentClassId: 'c1'
                }
            }));
            localStorage.setItem('bulletin_sync_provider', 'google');
            localStorage.setItem('bulletin_last_sync', '1726000000000');
            localStorage.setItem('bulletin_last_modified', '1726000000000');
            localStorage.setItem('bulletin_last_sync_hash', 'hash-with-307-students');
            localStorage.setItem('bulletin_last_sync_students', '307');

            await StorageManager.loadAppState();

            expect(runtimeState._dataPurgeDetected).toBe(true);
            expect(localStorage.getItem('bulletin_last_sync_hash')).toBe('hash-with-307-students');
        });

        it('should reset _dataPurgeDetected when students are restored via importBackup', async () => {
            runtimeState._dataPurgeDetected = true;
            const backupContent = JSON.stringify({
                appVersion: '4.3.0',
                classes: [{ id: 'c1', name: '4°4' }],
                generatedResults: [{ id: 's1', nom: 'Dupont', prenom: 'Jean', classId: 'c1', studentData: { periods: {} } }]
            });

            await StorageManager.importBackup(backupContent, { mergeData: false, silent: true });

            expect(runtimeState._dataPurgeDetected).toBe(false);
        });
    });

    describe('T-02 & T-03 — Caractérisation QuotaExceededError, _lastSaveHash et migrateData', () => {
        it('T-02 (Bugs A-01 & A-03) : persiste generatedResults dans IndexedDB malgré un QuotaExceededError sur localStorage et ne verrouille pas _lastSaveHash avant la fin des écritures', async () => {
            const { DBService } = await import('../services/DBService.js');
            DBService.putAll.mockClear();

            runtimeState.data.generatedResults = [
                { id: 's1', nom: 'MARTIN', prenom: 'Lucas', classId: 'c1', studentData: { periods: { T1: { appreciation: 'Bon travail.' } } } }
            ];

            localStorage.setItem.mockImplementation((key, value) => {
                if (key === 'bulletin-assistant-state') {
                    throw new DOMException('QuotaExceededError', 'QuotaExceededError');
                }
                mockLocalStorage[key] = value;
            });

            // 1er appel : localStorage.setItem lève QuotaExceededError
            await StorageManager.saveAppState();

            // Même si localStorage échoue pour les settings, la sauvegarde IndexedDB des élèves doit aboutir
            expect(DBService.putAll).toHaveBeenCalledTimes(1);

            // Restauration de localStorage.setItem : un 2e appel avec le même état ne doit pas être court-circuité par _lastSaveHash
            localStorage.setItem.mockImplementation((key, value) => {
                mockLocalStorage[key] = value;
            });
            await StorageManager.saveAppState();

            expect(localStorage.getItem('bulletin-assistant-state')).not.toBeNull();
        });

        it('T-03 (Bug A-04) : migrateData ne détruit pas l\'appréciation et l\'historique de T1 lorsqu\'ils sont légitimement identiques à ceux de T2', () => {
            const sharedAppreciation = 'Ensemble satisfaisant.';
            const inputResults = [
                {
                    id: 'student-same-text',
                    generationPeriod: 'T2',
                    appreciation: sharedAppreciation,
                    studentData: {
                        prenom: 'Emma',
                        nom: 'Dupont',
                        currentPeriod: 'T2',
                        periods: {
                            T1: {
                                grade: 13,
                                appreciation: sharedAppreciation
                            },
                            T2: {
                                grade: 13,
                                appreciation: sharedAppreciation
                            }
                        }
                    },
                    historyPerPeriod: {
                        T1: {
                            versions: [{ content: sharedAppreciation, timestamp: '2026-01-10T10:00:00.000Z', type: 'initial' }],
                            currentIndex: 0
                        },
                        T2: {
                            versions: [{ content: sharedAppreciation, timestamp: '2026-03-15T10:00:00.000Z', type: 'initial' }],
                            currentIndex: 0
                        }
                    }
                }
            ];

            const migrated = StorageManager.migrateData(inputResults);

            expect(migrated[0].studentData.periods.T1.appreciation).toBe(sharedAppreciation);
            expect(migrated[0].historyPerPeriod.T1.versions).toHaveLength(1);
            expect(migrated[0].historyPerPeriod.T1.versions[0].content).toBe(sharedAppreciation);
            expect(migrated[0].studentData.periods.T2.appreciation).toBe(sharedAppreciation);
        });
    });

    describe('Lot 10 — BulletinAssistantDB v2, EventBus & Synchronisation multi-onglets', () => {
        it('conserve la navigation propre à l\'onglet lors d\'une synchro inter-onglets et se rabat si la classe a été supprimée', async () => {
            const students = [
                { id: 's1', classId: 'c1', studentData: { periods: {} } },
                { id: 's2', classId: 'c2', studentData: { periods: {} } }
            ];
            DBService.getAll.mockImplementation(async (storeName) => (storeName === 'generatedResults' ? students : []));
            DBService.get.mockResolvedValue(undefined);

            userSettings.academic.classes = [{ id: 'c1', name: '3A' }, { id: 'c2', name: '4B' }];
            userSettings.academic.currentClassId = 'c1';
            userSettings.ui.activeView = 'list';
            runtimeState.navigation.currentPeriod = 'T1';

            // L'autre onglet a écrit sa propre navigation (4B, T3, plan) et un thème modifié
            mockLocalStorage['bulletin-assistant-state'] = JSON.stringify({
                version: '4.3.0',
                settings: {
                    theme: 'light',
                    classes: [{ id: 'c1', name: '3A' }, { id: 'c2', name: '4B' }],
                    currentClassId: 'c2',
                    currentPeriod: 'T3',
                    activeView: 'plan'
                }
            });

            await StorageManager.loadAppState({ fromTabSync: true });

            expect(userSettings.ui.theme).toBe('light');
            expect(userSettings.academic.currentClassId).toBe('c1');
            expect(runtimeState.navigation.currentPeriod).toBe('T1');
            expect(userSettings.ui.activeView).toBe('list');
            expect(runtimeState.data.filteredResults.map(r => r.id)).toEqual(['s1']);

            // La classe active (3A) a été supprimée dans l'autre onglet -> rabat sur la première classe restante
            mockLocalStorage['bulletin-assistant-state'] = JSON.stringify({
                version: '4.3.0',
                settings: { classes: [{ id: 'c2', name: '4B' }], currentClassId: 'c2' }
            });

            await StorageManager.loadAppState({ fromTabSync: true });

            expect(userSettings.academic.currentClassId).toBe('c2');
            expect(appState.currentClassId).toBe('c2');
            expect(runtimeState.data.filteredResults.map(r => r.id)).toEqual(['s2']);
        });

        it('corrige dès le démarrage à froid une classe active obsolète avant le premier rendu', async () => {
            const students = [{ id: 's2', classId: 'c2', studentData: { periods: {} } }];
            DBService.getAll.mockImplementation(async (storeName) => (storeName === 'generatedResults' ? students : []));
            DBService.get.mockResolvedValue(undefined);

            mockLocalStorage['bulletin-assistant-state'] = JSON.stringify({
                version: '4.3.0',
                settings: { classes: [{ id: 'c2', name: '4B' }], currentClassId: 'deleted-class' }
            });

            await StorageManager.loadAppState();

            expect(userSettings.academic.currentClassId).toBe('c2');
            expect(appState.currentClassId).toBe('c2');
            expect(runtimeState.data.filteredResults.map(r => r.id)).toEqual(['s2']);
        });

        it('persiste les classes et appData (userSettings, deletedItems) dans IndexedDB v2 et émet STATE_SAVED sur EventBus', async () => {
            const { bus, EVENTS } = await import('../core/EventBus.js');
            const savedSpy = vi.fn();
            const unsub = bus.on(EVENTS.STATE_SAVED, savedSpy);

            try {
                userSettings.academic.classes = [{ id: 'c1', name: '3ème A' }];
                runtimeState.data.deletedItems = {
                    students: [{ id: 'del-s1', deletedAt: 1700000000000 }],
                    classes: [{ id: 'del-c1', deletedAt: 1700000000000 }]
                };
                runtimeState.data.generatedResults = [{ id: 's1', classId: 'c1' }];

                await StorageManager.saveAppState();

                expect(DBService.replaceAll).toHaveBeenCalledWith('classes', [{ id: 'c1', name: '3ème A' }]);
                expect(DBService.put).toHaveBeenCalledWith(
                    'appData',
                    expect.objectContaining({ key: 'userSettings', value: expect.any(Object) })
                );
                expect(DBService.put).toHaveBeenCalledWith(
                    'appData',
                    expect.objectContaining({
                        key: 'deletedItems',
                        value: runtimeState.data.deletedItems
                    })
                );
                expect(savedSpy).toHaveBeenCalledTimes(1);
            } finally {
                unsub();
            }
        });

        it('restaure les réglages, classes et tombstones depuis IndexedDB v2 si localStorage a été vidé', async () => {
            // localStorage est vide, mais IndexedDB v2 contient tout
            DBService.getAll.mockImplementation(async (storeName) => {
                if (storeName === 'generatedResults') return [{ id: 's1', classId: 'c-idb', studentData: { prenom: 'Léo' } }];
                if (storeName === 'classes') return [{ id: 'c-idb', name: '4ème IDB' }];
                return [];
            });
            DBService.get.mockImplementation(async (storeName, key) => {
                if (storeName === 'appData' && key === 'userSettings') {
                    return {
                        key: 'userSettings',
                        value: {
                            settings: { theme: 'light', currentPeriod: 'T3', currentClassId: 'c-idb' },
                            classes: [{ id: 'c-idb', name: '4ème IDB' }]
                        }
                    };
                }
                if (storeName === 'appData' && key === 'deletedItems') {
                    return {
                        key: 'deletedItems',
                        value: { students: [{ id: 'ghost-1', deletedAt: 123456 }], classes: [] }
                    };
                }
                return undefined;
            });

            await StorageManager.loadAppState();

            expect(userSettings.ui.theme).toBe('light');
            expect(runtimeState.navigation.currentPeriod).toBe('T3');
            expect(userSettings.academic.classes).toEqual([{ id: 'c-idb', name: '4ème IDB' }]);
            expect(runtimeState.data.deletedItems.students).toEqual([{ id: 'ghost-1', deletedAt: 123456 }]);
        });

        it('synchronise automatiquement l\'état entre onglets via BroadcastChannel sans boucle infinie et notifie EventBus', async () => {
            const { bus, EVENTS } = await import('../core/EventBus.js');
            const { App } = await import('./AppManager.js');
            const tabSyncSpy = vi.fn();
            const unsub = bus.on(EVENTS.TAB_SYNC_RECEIVED, tabSyncSpy);

            try {
                const loadSpy = vi.spyOn(StorageManager, 'loadAppState').mockResolvedValue();

                // 1. Un message provenant du même onglet doit être ignoré
                await StorageManager._handleTabSyncMessage({
                    type: 'STATE_UPDATED',
                    tabId: StorageManager._tabId,
                    timestamp: Date.now()
                });
                expect(loadSpy).not.toHaveBeenCalled();

                // 2. Un message provenant d'un autre onglet doit recharger l'état, rafraîchir l'UI et émettre TAB_SYNC_RECEIVED
                await StorageManager._handleTabSyncMessage({
                    type: 'STATE_UPDATED',
                    tabId: 'remote_tab_999',
                    timestamp: Date.now() + 1000
                });

                expect(loadSpy).toHaveBeenCalledTimes(1);
                expect(App.updateUIOnLoad).toHaveBeenCalled();
                expect(tabSyncSpy).toHaveBeenCalledWith(expect.objectContaining({
                    type: 'STATE_UPDATED',
                    tabId: 'remote_tab_999'
                }));

                loadSpy.mockRestore();
            } finally {
                unsub();
            }
        });

        it('assure le fallback de synchronisation multi-onglets via l\'événement window storage', async () => {
            const syncSpy = vi.spyOn(StorageManager, '_handleTabSyncMessage').mockResolvedValue();

            await StorageManager._handleStorageEvent({
                key: 'bulletin-assistant-state',
                newValue: JSON.stringify({
                    settings: { theme: 'light' },
                    sourceTabId: 'fallback_tab_42',
                    updatedAt: Date.now() + 2000
                })
            });

            expect(syncSpy).toHaveBeenCalledWith(expect.objectContaining({
                type: 'STATE_UPDATED',
                sourceTabId: 'fallback_tab_42'
            }));

            syncSpy.mockRestore();
        });

        it('fusionne classNote selon classNoteUpdatedAt dans _mergeClassesList et exclut classNoteUpdatedAt du hash de données', () => {
            userSettings.academic.classes = [
                { id: 'c1', name: '3e1', classNote: 'Ancienne note', classNoteUpdatedAt: 1000 },
                { id: 'c2', name: '4e2', classNote: 'Note locale plus récente', classNoteUpdatedAt: 3000 },
                { id: 'c3', name: '5e1', classNote: '', classNoteUpdatedAt: null }
            ];
            const remoteClasses = [
                { id: 'c1', name: '3e1', classNote: 'Nouvelle note distante', classNoteUpdatedAt: 2000 },
                { id: 'c2', name: '4e2', classNote: 'Note distante obsolète', classNoteUpdatedAt: 1500 },
                { id: 'c3', name: '5e1', classNote: 'Note importée sans horodatage local', classNoteUpdatedAt: null }
            ];

            StorageManager._mergeClassesList(remoteClasses, new Map());
            const merged = userSettings.academic.classes;
            expect(merged.find(c => c.id === 'c1').classNote).toBe('Nouvelle note distante');
            expect(merged.find(c => c.id === 'c1').classNoteUpdatedAt).toBe(2000);
            expect(merged.find(c => c.id === 'c2').classNote).toBe('Note locale plus récente');
            expect(merged.find(c => c.id === 'c2').classNoteUpdatedAt).toBe(3000);
            expect(merged.find(c => c.id === 'c3').classNote).toBe('Note importée sans horodatage local');

            userSettings.academic.classes = [{ id: 'c1', name: '3e1', classNote: 'Ch. 3', classNoteUpdatedAt: 1111, updatedAt: 1111 }];
            const hash1 = StorageManager.computeCurrentDataHash();
            userSettings.academic.classes = [{ id: 'c1', name: '3e1', classNote: 'Ch. 3', classNoteUpdatedAt: 9999, updatedAt: 9999 }];
            const hash2 = StorageManager.computeCurrentDataHash();
            expect(hash1).toBe(hash2);

            const parsed = StorageManager.parseBackupFile(JSON.stringify({
                _meta: { exportType: 'full_backup' },
                settings: { subjects: {} },
                classes: merged,
                generatedResults: []
            }));
            expect(parsed.categories.classes.description).toContain('3 mémos');
        });

        it('fusionne journalThreshold et journalIncludeInAI selon journalSettingsUpdatedAt dans _mergeClassesList et exclut journalSettingsUpdatedAt du hash', () => {
            userSettings.academic.classes = [
                { id: 'c1', name: '3e1', journalThreshold: 2, journalIncludeInAI: true, journalSettingsUpdatedAt: 1000 },
                { id: 'c2', name: '4e2', journalThreshold: 3, journalIncludeInAI: false, journalSettingsUpdatedAt: 3000 },
                { id: 'c3', name: '5e1' }
            ];
            const remoteClasses = [
                { id: 'c1', name: '3e1', journalThreshold: 1, journalIncludeInAI: false, journalSettingsUpdatedAt: 2000 },
                { id: 'c2', name: '4e2', journalThreshold: 1, journalIncludeInAI: true, journalSettingsUpdatedAt: 1500 },
                { id: 'c3', name: '5e1', journalThreshold: 3, journalIncludeInAI: true }
            ];

            StorageManager._mergeClassesList(remoteClasses, new Map());
            const merged = userSettings.academic.classes;

            expect(merged.find(c => c.id === 'c1')).toMatchObject({
                journalThreshold: 1,
                journalIncludeInAI: false,
                journalSettingsUpdatedAt: 2000
            });
            expect(merged.find(c => c.id === 'c2')).toMatchObject({
                journalThreshold: 3,
                journalIncludeInAI: false,
                journalSettingsUpdatedAt: 3000
            });
            expect(merged.find(c => c.id === 'c3')).toMatchObject({
                journalThreshold: 3,
                journalIncludeInAI: true
            });

            userSettings.academic.classes = [{ id: 'c1', name: '3e1', journalThreshold: 1, journalIncludeInAI: true, journalSettingsUpdatedAt: 1111 }];
            const hash1 = StorageManager.computeCurrentDataHash();
            userSettings.academic.classes = [{ id: 'c1', name: '3e1', journalThreshold: 1, journalIncludeInAI: true, journalSettingsUpdatedAt: 9999 }];
            const hash2 = StorageManager.computeCurrentDataHash();
            expect(hash1).toBe(hash2);

            userSettings.academic.classes = [{ id: 'c1', name: '3e1', journalThreshold: 3, journalIncludeInAI: true, journalSettingsUpdatedAt: 9999 }];
            const hash3 = StorageManager.computeCurrentDataHash();
            expect(hash3).not.toBe(hash1);
        });

        it('devrait compter les personnes uniques (et photos uniques) dans parseBackupFile quand un élève est partagé entre sa classe et un groupe', () => {
            const parsed = StorageManager.parseBackupFile(JSON.stringify({
                _meta: { exportType: 'full_backup' },
                settings: { subjects: {} },
                classes: [
                    { id: 'c1', name: '3°1', isGroup: false },
                    { id: 'g1', name: 'PAPD', isGroup: true }
                ],
                generatedResults: [
                    { id: 's1', nom: 'MIRZAI', prenom: 'Brikhna', classId: 'c1', studentPhoto: { data: 'img1' } },
                    { id: 's2', nom: 'MIRZAI', prenom: 'Brikhna', classId: 'g1', studentPhoto: { data: 'img1' } },
                    { id: 's3', nom: 'BARE', prenom: 'Timéo', classId: 'c1' }
                ]
            }));
            expect(parsed.categories.students.count).toBe(2);
            expect(parsed.categories.students.description).toContain('1 photo');
        });

        it('ne sur-compte pas updatedStudents lors d\'une fusion quand un même élève est mis à jour dans sa classe et son groupe', async () => {
            userSettings.academic.classes = [
                { id: 'c1', name: '3°1', isGroup: false },
                { id: 'g1', name: 'PAPD', isGroup: true }
            ];
            runtimeState.data.generatedResults = [
                { id: 's1', nom: 'MIRZAI', prenom: 'Brikhna', classId: 'c1', _lastModified: 1000, studentData: { statuses: [] } },
                { id: 's2', nom: 'MIRZAI', prenom: 'Brikhna', classId: 'g1', _lastModified: 1000, studentData: { statuses: [] } }
            ];
            runtimeState.data.deletedItems = { students: [], classes: [] };

            const res = await StorageManager.mergeRemoteData({
                classes: userSettings.academic.classes,
                generatedResults: [
                    { id: 's1', nom: 'MIRZAI', prenom: 'Brikhna', classId: 'c1', _lastModified: 2000, studentData: { statuses: ['PAP'] } },
                    { id: 's2', nom: 'MIRZAI', prenom: 'Brikhna', classId: 'g1', _lastModified: 2000, studentData: { statuses: ['PAP'] } }
                ]
            });

            expect(res.stats.updatedStudents).toBe(1);
        });
    });

    describe('Rappel discret de sauvegarde JSON locale (sans Cloud)', () => {
        const DAY_MS = 24 * 60 * 60 * 1000;

        it('reste silencieux sur une base vide ou contenant uniquement la Classe exemple', () => {
            expect(StorageManager.hasRealUserData()).toBe(false);
            expect(StorageManager.evaluateLocalBackupReminder(100 * DAY_MS).shouldRemind).toBe(false);

            userSettings.academic.classes = [{ id: 'demo_1', name: 'Classe exemple', isDemo: true }];
            runtimeState.data.generatedResults = [
                { id: 'd1', nom: 'Demo', prenom: 'Alice', classId: 'demo_1', studentData: { periods: {} } }
            ];
            expect(StorageManager.hasRealUserData()).toBe(false);
            expect(StorageManager.evaluateLocalBackupReminder(100 * DAY_MS).reason).toBe('no-real-data');
        });

        it('reste silencieux lorsque Google Drive est configuré', () => {
            userSettings.academic.classes = [{ id: 'c1', name: '3A' }];
            localStorage.setItem('bulletin_sync_provider', 'google');
            localStorage.setItem('bulletin_local_backup_dirty_since', String(1000));

            const res = StorageManager.evaluateLocalBackupReminder(1000 + 30 * DAY_MS);
            expect(res.shouldRemind).toBe(false);
            expect(res.reason).toBe('cloud-configured');
        });

        it('déclenche après 14 jours de modifications locales non sauvegardées puis applique un cooldown de 14 jours', () => {
            userSettings.academic.classes = [{ id: 'c1', name: '3A' }];
            const t0 = 1_700_000_000_000;
            localStorage.setItem('bulletin_local_backup_dirty_since', String(t0));

            // J+10 : trop récent
            expect(StorageManager.evaluateLocalBackupReminder(t0 + 10 * DAY_MS)).toMatchObject({
                shouldRemind: false,
                reason: 'too-recent'
            });

            // J+15 : déclenche
            const overdue = StorageManager.evaluateLocalBackupReminder(t0 + 15 * DAY_MS);
            expect(overdue).toMatchObject({
                shouldRemind: true,
                reason: 'overdue',
                daysSince: 15,
                hasPreviousBackup: false
            });

            // Cooldown 14 jours après affichage
            StorageManager.recordLocalBackupReminderShown(t0 + 15 * DAY_MS);
            expect(StorageManager.evaluateLocalBackupReminder(t0 + 20 * DAY_MS)).toMatchObject({
                shouldRemind: false,
                reason: 'cooldown'
            });
            expect(StorageManager.evaluateLocalBackupReminder(t0 + 29 * DAY_MS).shouldRemind).toBe(true);
        });

        it('enregistre la sauvegarde sur exportToJson (jamais sur exportSettings) et reste silencieux tant que les données ne changent pas', async () => {
            const downloadSpy = vi.spyOn(StorageManager, '_downloadFile').mockImplementation(() => {});
            userSettings.academic.classes = [{ id: 'c1', name: '3A' }];
            runtimeState.data.generatedResults = [
                { id: 's1', nom: 'Dupont', prenom: 'Léo', classId: 'c1', studentData: { periods: { T1: { grade: 14 } } } }
            ];

            // exportSettings ne valide PAS la sauvegarde complète
            StorageManager.exportSettings();
            expect(StorageManager.getLastLocalBackupTime()).toBeNull();

            // exportToJson valide la date et le hash
            StorageManager.exportToJson();
            const exportedAt = StorageManager.getLastLocalBackupTime();
            expect(exportedAt).toBeGreaterThan(0);

            // Même 30 jours plus tard (ex. vacances scolaires), aucune alerte si rien n'a changé
            expect(StorageManager.evaluateLocalBackupReminder(exportedAt + 30 * DAY_MS)).toMatchObject({
                shouldRemind: false,
                reason: 'up-to-date',
                hasPreviousBackup: true
            });

            // Nouvelle modification puis 15 jours écoulés -> rappel avec hasPreviousBackup: true
            const editAt = exportedAt + 2 * DAY_MS;
            runtimeState.data.generatedResults[0].studentData.periods.T1.grade = 16;
            StorageManager._trackLocalBackupDirtyState(StorageManager.computeCurrentDataHash(), true, editAt);

            const afterEdit = StorageManager.evaluateLocalBackupReminder(editAt + 14 * DAY_MS);
            expect(afterEdit).toMatchObject({
                shouldRemind: true,
                reason: 'overdue',
                daysSince: 16,
                hasPreviousBackup: true
            });

            // Retour à l'état exact sauvegardé -> efface l'état dirty sans fausse alerte
            runtimeState.data.generatedResults[0].studentData.periods.T1.grade = 14;
            StorageManager._trackLocalBackupDirtyState(StorageManager.computeCurrentDataHash(), true, editAt + 15 * DAY_MS);
            expect(StorageManager.evaluateLocalBackupReminder(editAt + 15 * DAY_MS).shouldRemind).toBe(false);

            downloadSpy.mockRestore();
        });
    });
});
