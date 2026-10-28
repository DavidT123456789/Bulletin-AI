/**
 * @fileoverview Tests unitaires pour StorageManager avec IndexedDB
 * @module managers/StorageManager.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StorageManager } from './StorageManager.js';
import { appState, userSettings, runtimeState } from '../state/State.js';

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
            currentEditingId: null,
            currentRefiningAppreciationId: null,
            activeStatFilter: null,
            modalNav: { currentIndex: -1 },
        },
        process: {
            isMassImportCancelled: false,
            importJustCompleted: false,
            pendingRefinementGeneration: null,
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

// Mock config module
vi.mock('../config/Config.js', () => ({
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
    DEFAULT_SEATING_STATUS_DOTS: { movements: true, devices: false, delegates: false }
}));

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

        it('should preserve standalone bulletin_theme when app state is absent', async () => {
            const { userSettings } = await import('../state/State.js');
            mockLocalStorage['bulletin_theme'] = 'dark';
            DBService.getAll.mockResolvedValue([]);

            await StorageManager.loadAppState();

            expect(userSettings.ui.theme).toBe('dark');
            // Verify deprecated gemini-3.5-flash migration to gemini-3.6-flash
            mockLocalStorage['bulletin-assistant-state'] = JSON.stringify({
                version: '4.3.0',
                settings: { currentAIModel: 'gemini-3.5-flash' }
            });
            await StorageManager.loadAppState();
            expect(userSettings.api.currentAIModel).toBe('gemini-3.6-flash');
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
    });

    describe('PreRestoreSnapshot and _checkPendingRestore', () => {
        beforeEach(() => {
            vi.clearAllMocks();
        });

        it('should save pre-restore snapshot when results exist', async () => {
            runtimeState.data.generatedResults = [{ id: 's1' }];
            userSettings.academic.classes = [{ id: 'c1' }];

            await StorageManager.savePreRestoreSnapshot();

            expect(DBService.put).toHaveBeenCalledWith('appData', expect.objectContaining({
                key: 'pre_restore_backup',
                generatedResults: [{ id: 's1' }]
            }));
            expect(localStorage.setItem).toHaveBeenCalledWith('bulletin_restore_pending', expect.any(String));
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

        it('should clear snapshot and pending flag', async () => {
            await StorageManager.clearPreRestoreSnapshot();

            expect(DBService.delete).toHaveBeenCalledWith('appData', 'pre_restore_backup');
            expect(localStorage.removeItem).toHaveBeenCalledWith('bulletin_restore_pending');
        });

        it('should trigger UI.showUndoNotification on _checkPendingRestore when flag is set', async () => {
            vi.useFakeTimers();
            const { UI } = await import('./UIManager.js');
            mockLocalStorage['bulletin_restore_pending'] = Date.now().toString();

            const snapshot = {
                key: 'pre_restore_backup',
                createdAt: Date.now(),
                generatedResults: [{ id: 's1' }, { id: 's2' }]
            };
            DBService.get.mockResolvedValue(snapshot);

            await StorageManager._checkPendingRestore();
            vi.advanceTimersByTime(1000);

            expect(UI.showUndoNotification).toHaveBeenCalledWith(
                expect.stringContaining('2 élèves'),
                expect.any(Function),
                expect.objectContaining({ duration: 7000, type: 'success', title: 'Restauration réussie' })
            );

            // Execute undo callback
            const undoCallback = UI.showUndoNotification.mock.calls[0][1];
            const restoreSpy = vi.spyOn(StorageManager, 'restorePreRestoreSnapshot').mockResolvedValue(true);
            await undoCallback();
            expect(restoreSpy).toHaveBeenCalled();
            expect(UI.showNotification).toHaveBeenCalledWith('État précédent restauré.', 'success');

            vi.useRealTimers();
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

            // Changing API key must change data hash
            userSettings.api.googleApiKey = 'key-v2';
            const hashWithNewKey = StorageManager.computeCurrentDataHash();
            expect(hashWithNewKey).not.toBe(baseHash);

            // Reverting API key restores exact same hash
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

        it('should not overwrite API keys or ollamaBaseUrl by default during importBackup, and only import non-empty API keys when categories.apiKeys is true', async () => {
            userSettings.api.googleApiKey = 'existing-google-key';
            appState.googleApiKey = 'existing-google-key';
            userSettings.api.openaiApiKey = 'existing-openai-key';
            appState.openaiApiKey = 'existing-openai-key';
            userSettings.api.ollamaBaseUrl = 'http://localhost:11434';
            appState.ollamaBaseUrl = 'http://localhost:11434';
            runtimeState.validatedApiKeys.google = true;
            runtimeState.apiStatus.google = 'valid';
            runtimeState.validatedApiKeys.openai = true;
            runtimeState.apiStatus.openai = 'valid';

            const backupWithKeysAndExternalOllama = JSON.stringify({
                appVersion: '4.3.0',
                settings: {
                    googleApiKey: '',
                    openaiApiKey: 'new-openai-key',
                    ollamaBaseUrl: 'https://attacker.example.com:11434'
                }
            });

            // 1. Default importBackup (no categories.apiKeys) -> never overwrites API keys or ollamaBaseUrl
            const defaultRes = await StorageManager.importBackup(backupWithKeysAndExternalOllama, { mergeData: true, silent: true });
            expect(defaultRes.stats.apiKeysImported).toBe(0);
            expect(userSettings.api.googleApiKey).toBe('existing-google-key');
            expect(userSettings.api.openaiApiKey).toBe('existing-openai-key');
            expect(userSettings.api.ollamaBaseUrl).toBe('http://localhost:11434');

            // 2. Explicit categories.apiKeys = true -> imports non-empty key, ignores empty key, and still rejects external ollamaBaseUrl
            const explicitRes = await StorageManager.importBackup(backupWithKeysAndExternalOllama, {
                mergeData: true,
                categories: { apiKeys: true },
                importOllamaConfig: true,
                silent: true
            });
            expect(explicitRes.stats.apiKeysImported).toBe(1);
            expect(userSettings.api.googleApiKey).toBe('existing-google-key');
            expect(runtimeState.validatedApiKeys.google).toBe(true);
            expect(userSettings.api.openaiApiKey).toBe('new-openai-key');
            expect(runtimeState.validatedApiKeys.openai).toBe(false);
            expect(runtimeState.apiStatus.openai).toBeNull();
            expect(userSettings.api.ollamaBaseUrl).toBe('http://localhost:11434');
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

            await StorageManager.loadAppState({ checkPendingRestore: false });

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

            await StorageManager.loadAppState({ checkPendingRestore: false, fromTabSync: true });

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

            await StorageManager.loadAppState({ checkPendingRestore: false, fromTabSync: true });

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

            await StorageManager.loadAppState({ checkPendingRestore: false });

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
    });
});
