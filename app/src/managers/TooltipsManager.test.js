/**
 * @fileoverview Tests unitaires pour TooltipsManager
 * @module managers/TooltipsManager.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TooltipsUI } from './TooltipsManager.js';

describe('TooltipsManager', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '';
        // Reset window.tippy mock
        window.tippy = undefined;
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
                animation: 'shift-away',
                duration: [300, 200],
                allowHTML: true,
                interactive: false,
                hideOnClick: true,
                trigger: 'mouseenter'
            }));
        });

        it('should configure tippy with manual trigger on touch devices', () => {
            // Mock matchMedia for touch
            window.matchMedia = vi.fn().mockImplementation(query => ({
                matches: query === '(pointer: coarse)' ? true : false,
                media: query,
                onchange: null,
                addListener: vi.fn(),
                removeListener: vi.fn(),
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                dispatchEvent: vi.fn(),
            }));

            const mockTippy = vi.fn(() => []);
            window.tippy = mockTippy;

            TooltipsUI.initTooltips();

            expect(mockTippy).toHaveBeenCalledWith('[data-tooltip]', expect.objectContaining({
                trigger: 'manual',
                touch: ['hold', 500]
            }));
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
    });
});
