/**
 * @fileoverview Tests unitaires pour TooltipsManager
 * @module managers/TooltipsManager.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TooltipsUI } from './TooltipsManager.js';

vi.mock('./ModalUIManager.js', () => ({
    ModalUI: {
        _isIgnoringTooltips: false
    }
}));

describe('TooltipsManager', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '';
        // Reset window.tippy mock
        window.tippy = undefined;
        // Clean up touch indicators
        delete window.ontouchstart;
        Object.defineProperty(window.navigator, 'maxTouchPoints', { value: 0, writable: true });

        // Mock matchMedia for mouse by default
        window.matchMedia = vi.fn().mockImplementation(query => ({
            matches: query === '(pointer: coarse)' ? false : true,
            media: query,
            onchange: null,
            addListener: vi.fn(), // Deprecated
            removeListener: vi.fn(), // Deprecated
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        }));
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    describe('isIgnoringTooltips', () => {
        it('should default to false', () => {
            // Reset the module state
            TooltipsUI.isIgnoringTooltips = false;
            expect(TooltipsUI.isIgnoringTooltips).toBe(false);
        });

        it('should allow setting to true', () => {
            TooltipsUI.isIgnoringTooltips = true;
            expect(TooltipsUI.isIgnoringTooltips).toBe(true);
            // Reset
            TooltipsUI.isIgnoringTooltips = false;
        });
    });

    describe('initTooltips', () => {
        it('should not throw when tippy is not available', () => {
            window.tippy = undefined;
            expect(() => TooltipsUI.initTooltips()).not.toThrow();
        });

        it('should call tippy when available', () => {
            const mockTippy = vi.fn(() => []);
            window.tippy = mockTippy;

            // Add elements with data-tooltip
            const el = document.createElement('div');
            el.setAttribute('data-tooltip', 'Test tooltip');
            document.body.appendChild(el);

            TooltipsUI.initTooltips();

            expect(mockTippy).toHaveBeenCalledWith('[data-tooltip]', expect.any(Object));
        });

        it('should destroy existing instances before creating new ones', () => {
            const mockDestroy = vi.fn();
            const mockInstances = [{ destroy: mockDestroy }, { destroy: mockDestroy }];
            const mockTippy = vi.fn(() => mockInstances);
            window.tippy = mockTippy;

            // First init
            TooltipsUI.initTooltips();

            // Second init should destroy previous instances
            TooltipsUI.initTooltips();

            expect(mockDestroy).toHaveBeenCalled();
        });

        it('should configure tippy with correct options', () => {
            const mockTippy = vi.fn(() => []);
            window.tippy = mockTippy;

            TooltipsUI.initTooltips();

            expect(mockTippy).toHaveBeenCalledWith('[data-tooltip]', expect.objectContaining({
                theme: 'custom-theme',
                animation: 'organic-scale',
                duration: [250, 150],
                allowHTML: true,
                interactive: false,
                hideOnClick: true,
                trigger: 'mouseenter'
            }));
        });

        it('should always include touch hold config', () => {
            const mockTippy = vi.fn(() => []);
            window.tippy = mockTippy;

            TooltipsUI.initTooltips();

            expect(mockTippy).toHaveBeenCalledWith('[data-tooltip]', expect.objectContaining({
                touch: ['hold', 500]
            }));
        });

        it('should scope tooltip cleanup and initialization to a container when provided without destroying outside tooltips', () => {
            const outsideEl = document.createElement('button');
            outsideEl.setAttribute('data-tooltip', 'Header btn');
            document.body.appendChild(outsideEl);

            const scopedContainer = document.createElement('div');
            const insideEl = document.createElement('button');
            insideEl.setAttribute('data-tooltip', 'Cell pin');
            scopedContainer.appendChild(insideEl);
            document.body.appendChild(scopedContainer);

            const outsideDestroy = vi.fn();
            const insideDestroy = vi.fn();
            const outsideInstance = { reference: outsideEl, destroy: outsideDestroy };
            const insideInstance = { reference: insideEl, destroy: insideDestroy };
            outsideEl._tippy = outsideInstance;
            insideEl._tippy = insideInstance;

            const mockTippy = vi.fn((target) => {
                if (target === '[data-tooltip]') return [outsideInstance, insideInstance];
                return [{ reference: insideEl, destroy: vi.fn() }];
            });
            window.tippy = mockTippy;

            // Global init first
            TooltipsUI.initTooltips();
            expect(TooltipsUI.getInstanceCount()).toBe(2);

            // Scoped re-init on scopedContainer
            TooltipsUI.initTooltips(scopedContainer);

            expect(insideDestroy).toHaveBeenCalled();
            expect(outsideDestroy).not.toHaveBeenCalled();
            expect(TooltipsUI.getInstanceCount()).toBe(2);
        });
    });

    describe('destroyTooltips', () => {
        it('should destroy all tooltip instances', () => {
            const mockDestroy = vi.fn();
            const mockInstances = [{ destroy: mockDestroy }, { destroy: mockDestroy }];
            const mockTippy = vi.fn(() => mockInstances);
            window.tippy = mockTippy;

            TooltipsUI.initTooltips();
            TooltipsUI.destroyTooltips();

            expect(mockDestroy).toHaveBeenCalledTimes(2);
        });

        it('should not throw when no instances exist', () => {
            expect(() => TooltipsUI.destroyTooltips()).not.toThrow();
        });
    });

    describe('getInstanceCount', () => {
        it('should return 0 when no tooltips initialized', () => {
            TooltipsUI.destroyTooltips();
            expect(TooltipsUI.getInstanceCount()).toBe(0);
        });

        it('should return correct count after initialization', () => {
            const mockInstances = [{}, {}, {}];
            const mockTippy = vi.fn(() => mockInstances);
            window.tippy = mockTippy;

            TooltipsUI.initTooltips();

            expect(TooltipsUI.getInstanceCount()).toBe(3);
        });
    });

    describe('onShow behavior', () => {
        it('should prevent show when isIgnoringTooltips is true', () => {
            let capturedOnShow;
            const mockTippy = vi.fn((selector, options) => {
                capturedOnShow = options.onShow;
                return [];
            });
            window.tippy = mockTippy;

            TooltipsUI.initTooltips();
            TooltipsUI.isIgnoringTooltips = true;

            const mockInstance = { state: { isFocused: false }, reference: { matches: () => false } };
            const result = capturedOnShow(mockInstance);

            expect(result).toBe(false);

            // Reset
            TooltipsUI.isIgnoringTooltips = false;
        });

        it('should allow show when isIgnoringTooltips is false', () => {
            let capturedOnShow;
            const mockTippy = vi.fn((selector, options) => {
                capturedOnShow = options.onShow;
                return [];
            });
            window.tippy = mockTippy;

            TooltipsUI.initTooltips();
            TooltipsUI.isIgnoringTooltips = false;

            const mockInstance = { state: { isFocused: false }, reference: { matches: () => false } };
            const result = capturedOnShow(mockInstance);

            expect(result).toBe(true);
        });

        it('should synchronize getReferenceClientRect in onShow and use fixed Popper strategy so scaled ancestors never offset tooltips', () => {
            let capturedOptions;
            const mockTippy = vi.fn((selector, options) => {
                capturedOptions = options;
                return [];
            });
            window.tippy = mockTippy;

            TooltipsUI.initTooltips();
            expect(capturedOptions.popperOptions).toEqual({ strategy: 'fixed' });

            const expectedRect = { left: 240, top: 180, width: 110, height: 120 };
            const setPropsSpy = vi.fn();
            const mockInstance = {
                state: { isFocused: false },
                reference: {
                    matches: () => false,
                    getBoundingClientRect: () => expectedRect
                },
                setProps: setPropsSpy
            };

            const result = capturedOptions.onShow(mockInstance);
            expect(result).toBe(true);
            expect(setPropsSpy).toHaveBeenCalledWith({
                getReferenceClientRect: expect.any(Function)
            });
            const rectFn = setPropsSpy.mock.calls[0][0].getReferenceClientRect;
            expect(rectFn()).toBe(expectedRect);
        });
    });

    describe('hideAll', () => {
        it('should hide visible tooltip instances when hideAll is called', () => {
            const hideSpy = vi.fn();
            const mockInstances = [
                { state: { isVisible: true }, hide: hideSpy },
                { state: { isVisible: false }, hide: hideSpy }
            ];
            window.tippy = vi.fn(() => mockInstances);

            TooltipsUI.initTooltips();
            TooltipsUI.hideAll();

            expect(hideSpy).toHaveBeenCalledTimes(1);
        });
    });
});
