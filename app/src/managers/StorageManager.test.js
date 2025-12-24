/**
 * @fileoverview Tests unitaires pour StorageManager avec IndexedDB
 * @module managers/StorageManager.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StorageManager } from './StorageManager.js';

// Mock DBService
vi.mock('../services/DBService.js', () => ({
    DBService: {
        open: vi.fn(),
        get: vi.fn(),
        getAll: vi.fn(),
        put: vi.fn(),
        putAll: vi.fn(),
        clear: vi.fn()
    }
}));

// Mock state module with new structure
vi.mock('../state/State.js', () => ({
    userSettings: {
        ui: { theme: 'dark' },
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
        },
        import: {
            massImportFormats: { trimestres: {}, semestres: {} },
        },
    },
    runtimeState: {
        session: { sessionCost: 0, isDemoMode: false },
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
            refinementEdits: {},
            variationHistory: {},
        },
    },
    // Backwards compatible appState mock
    appState: {
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
        generatedResults: [],
        refinementEdits: {},
        activeStatFilter: null,
        currentInputMode: 'single'
    }
}));

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
    DEFAULT_EVOLUTION_THRESHOLDS: { positive: 1, veryPositive: 2, negative: -1, veryNegative: -2 }
}));

// Mock UIManager
vi.mock('./UIManager.js', () => ({
    UI: {
        showNotification: vi.fn(),
        showCustomConfirm: vi.fn((msg, callback) => callback()),
        updatePeriodSystemUI: vi.fn(),
        updateSettingsPromptFields: vi.fn(),
        updateSettingsFields: vi.fn(),
        renderSettingsLists: vi.fn()
    }
}));

// Mock AppManager
vi.mock('./AppManager_v2.js', () => ({
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
        const { App } = await import('./AppManager_v2.js');
        StorageManager.init(UI, App);

        vi.clearAllMocks();
    });

    afterEach(() => {
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
            const savedData = JSON.parse(localStorage.setItem.mock.calls[0][1]);
            expect(savedData.settings.theme).toBe('dark');
            expect(savedData.generatedResults).toBeUndefined(); // Should NOT be in LS

            // Check IndexedDB (Big Data)
            expect(DBService.putAll).toHaveBeenCalledWith('generatedResults', [{ id: '1' }]);
        });
    });

    describe('loadAppState', () => {
        it('should load settings from localStorage and results from IndexedDB', async () => {
            const { userSettings, runtimeState } = await import('../state/State.js');

            // Mock LocalStorage (Settings)
            const savedState = {
                version: '4.3.0',
                settings: { theme: 'light' }
            };
            mockLocalStorage['bulletin-assistant-state'] = JSON.stringify(savedState);

            // Mock IndexedDB (Results)
            const mockDbResults = [{ id: '123' }];
            DBService.getAll.mockResolvedValue(mockDbResults);

            await StorageManager.loadAppState();

            expect(userSettings.ui.theme).toBe('light');
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
});
