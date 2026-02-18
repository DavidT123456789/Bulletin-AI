/**
 * @fileoverview Tests for EventListenersManager
 * @module managers/EventListenersManager.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock all sub-modules
vi.mock('./EventHandlersManager.js', () => ({
    EventHandlersManager: {
        init: vi.fn()
    }
}));

vi.mock('./listeners/GeneralListeners.js', () => ({
    GeneralListeners: {
        init: vi.fn(),
        setup: vi.fn()
    }
}));

vi.mock('./listeners/InputListeners.js', () => ({
    InputListeners: {
        init: vi.fn(),
        setup: vi.fn()
    }
}));

vi.mock('./listeners/OutputListeners.js', () => ({
    OutputListeners: {
        setup: vi.fn()
    }
}));

vi.mock('./listeners/SettingsModalListeners.js', () => ({
    SettingsModalListeners: {
        init: vi.fn(),
        setup: vi.fn()
    }
}));

vi.mock('./listeners/OtherModalsListeners.js', () => ({
    OtherModalsListeners: {
        init: vi.fn(),
        setup: vi.fn()
    }
}));

vi.mock('./listeners/GlobalListeners.js', () => ({
    GlobalListeners: {
        setup: vi.fn()
    }
}));

import { EventListenersManager } from './EventListenersManager.js';
import { EventHandlersManager } from './EventHandlersManager.js';
import { GeneralListeners } from './listeners/GeneralListeners.js';
import { InputListeners } from './listeners/InputListeners.js';
import { OutputListeners } from './listeners/OutputListeners.js';
import { SettingsModalListeners } from './listeners/SettingsModalListeners.js';
import { OtherModalsListeners } from './listeners/OtherModalsListeners.js';
import { GlobalListeners } from './listeners/GlobalListeners.js';

describe('EventListenersManager', () => {
    let mockApp;

    beforeEach(() => {
        vi.clearAllMocks();
        mockApp = { name: 'testApp' };
    });

    describe('init', () => {
        it('should initialize EventHandlersManager', () => {
            EventListenersManager.init(mockApp);
            expect(EventHandlersManager.init).toHaveBeenCalledWith(mockApp);
        });

        it('should initialize GeneralListeners', () => {
            EventListenersManager.init(mockApp);
            expect(GeneralListeners.init).toHaveBeenCalledWith(mockApp);
        });

        it('should initialize InputListeners', () => {
            EventListenersManager.init(mockApp);
            expect(InputListeners.init).toHaveBeenCalledWith(mockApp);
        });

        it('should initialize SettingsModalListeners', () => {
            EventListenersManager.init(mockApp);
            expect(SettingsModalListeners.init).toHaveBeenCalledWith(mockApp);
        });

        it('should initialize OtherModalsListeners', () => {
            EventListenersManager.init(mockApp);
            expect(OtherModalsListeners.init).toHaveBeenCalledWith(mockApp);
        });
    });

    describe('setupEventListeners', () => {
        beforeEach(() => {
            EventListenersManager.init(mockApp);
            vi.clearAllMocks();
        });

        it('should call GeneralListeners.setup', () => {
            EventListenersManager.setupEventListeners();
            expect(GeneralListeners.setup).toHaveBeenCalledWith(expect.any(Function));
        });

        it('should call InputListeners.setup', () => {
            EventListenersManager.setupEventListeners();
            expect(InputListeners.setup).toHaveBeenCalledWith(expect.any(Function));
        });

        it('should call OutputListeners.setup', () => {
            EventListenersManager.setupEventListeners();
            expect(OutputListeners.setup).toHaveBeenCalledWith(expect.any(Function));
        });

        it('should call SettingsModalListeners.setup', () => {
            EventListenersManager.setupEventListeners();
            expect(SettingsModalListeners.setup).toHaveBeenCalledWith(expect.any(Function));
        });

        it('should call OtherModalsListeners.setup', () => {
            EventListenersManager.setupEventListeners();
            expect(OtherModalsListeners.setup).toHaveBeenCalledWith(expect.any(Function));
        });

        it('should call GlobalListeners.setup', () => {
            EventListenersManager.setupEventListeners();
            expect(GlobalListeners.setup).toHaveBeenCalled();
        });

        it('should provide a working addClickListener helper', () => {
            let capturedHelper;
            GeneralListeners.setup.mockImplementation((helper) => {
                capturedHelper = helper;
            });

            EventListenersManager.setupEventListeners();

            const mockElement = { addEventListener: vi.fn() };
            const mockHandler = vi.fn();
            capturedHelper(mockElement, mockHandler);

            expect(mockElement.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
        });

        it('should skip null elements in addClickListener helper', () => {
            let capturedHelper;
            GeneralListeners.setup.mockImplementation((helper) => {
                capturedHelper = helper;
            });

            EventListenersManager.setupEventListeners();

            expect(() => capturedHelper(null, vi.fn())).not.toThrow();
        });
    });
});
