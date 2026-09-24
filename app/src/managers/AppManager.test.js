/**
 * @fileoverview Tests unitaires pour AppManager (rehydrateAll)
 * @module managers/AppManager.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { App } from './AppManager.js';
import { appState, userSettings } from '../state/State.js';
import { StorageManager } from './StorageManager.js';
import { ClassManager } from './ClassManager.js';
import { ClassUIManager } from './ClassUIManager.js';
import { SeatingChartManager } from './SeatingChartManager.js';

vi.mock('./StorageManager.js', () => ({
    StorageManager: {
        loadAppState: vi.fn().mockResolvedValue(true),
        saveAppState: vi.fn().mockResolvedValue(true),
        init: vi.fn()
    }
}));

vi.mock('./ClassManager.js', () => ({
    ClassManager: {
        getAllClasses: vi.fn().mockReturnValue([{ id: 'c1', name: '3A' }]),
        switchClass: vi.fn().mockResolvedValue(true),
        _filterResultsByClass: vi.fn().mockResolvedValue(true),
        getCurrentClass: vi.fn().mockReturnValue({ id: 'c1', name: '3A' })
    }
}));

vi.mock('./ClassUIManager.js', () => ({
    ClassUIManager: {
        updateHeaderDisplay: vi.fn()
    }
}));

vi.mock('./SeatingChartManager.js', () => ({
    SeatingChartManager: {
        init: vi.fn(),
        restoreActiveView: vi.fn(),
        onClassChange: vi.fn()
    }
}));

vi.mock('./UIManager.js', () => ({
    UI: {
        init: vi.fn(),
        applyTheme: vi.fn(),
        updateDarkModeButtonIcon: vi.fn(),
        setPeriod: vi.fn(),
        getPeriods: vi.fn().mockReturnValue(['T1', 'T2', 'T3']),
        updatePeriodSystemUI: vi.fn(),
        setInputMode: vi.fn(),
        updateGenerateButtonState: vi.fn(),
        updateHeaderPremiumLook: vi.fn(),
        updateStatsTooltips: vi.fn()
    }
}));

vi.mock('./AppreciationsManager.js', () => ({
    AppreciationsManager: {
        init: vi.fn(),
        renderResults: vi.fn(),
        resetForm: vi.fn()
    }
}));

vi.mock('./SettingsUIManager.js', () => ({
    SettingsUIManager: {
        updatePersonalizationState: vi.fn(),
        updateApiStatusDisplay: vi.fn(),
        updateOllamaToggleDisplay: vi.fn()
    }
}));

describe('AppManager — rehydrateAll', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        appState.currentClassId = 'c1';
        appState.activeView = 'plan';
    });

    it('devrait préserver la vue active (plan) et appeler restoreActiveView sans onClassChange', async () => {
        await App.rehydrateAll();

        expect(StorageManager.loadAppState).toHaveBeenCalledWith({ checkPendingRestore: false });
        expect(ClassManager._filterResultsByClass).toHaveBeenCalledWith('c1');
        expect(ClassUIManager.updateHeaderDisplay).toHaveBeenCalled();
        expect(SeatingChartManager.restoreActiveView).toHaveBeenCalled();
        expect(SeatingChartManager.onClassChange).not.toHaveBeenCalled();
    });

    it('devrait basculer vers la première classe si la classe courante n\'existe pas', async () => {
        appState.currentClassId = 'c_inexistant';
        ClassManager.getAllClasses.mockReturnValue([{ id: 'c1', name: '3A' }]);

        await App.rehydrateAll();

        expect(ClassManager.switchClass).toHaveBeenCalledWith('c1');
        expect(SeatingChartManager.restoreActiveView).toHaveBeenCalled();
    });
});
