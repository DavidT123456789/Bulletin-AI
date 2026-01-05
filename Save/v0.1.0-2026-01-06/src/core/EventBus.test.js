/**
 * @fileoverview Tests for EventBus
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus, bus } from './EventBus.js';

describe('EventBus', () => {
    let eventBus;

    beforeEach(() => {
        eventBus = new EventBus();
    });

    describe('on()', () => {
        it('should register a callback for an event', () => {
            const callback = vi.fn();
            eventBus.on('test-event', callback);

            eventBus.emit('test-event', { data: 'test' });

            expect(callback).toHaveBeenCalledWith({ data: 'test' });
        });

        it('should allow multiple callbacks for the same event', () => {
            const callback1 = vi.fn();
            const callback2 = vi.fn();

            eventBus.on('test-event', callback1);
            eventBus.on('test-event', callback2);

            eventBus.emit('test-event', 'data');

            expect(callback1).toHaveBeenCalledWith('data');
            expect(callback2).toHaveBeenCalledWith('data');
        });

        it('should return an unsubscribe function', () => {
            const callback = vi.fn();
            const unsubscribe = eventBus.on('test-event', callback);

            // First emit should work
            eventBus.emit('test-event', 'first');
            expect(callback).toHaveBeenCalledTimes(1);

            // Unsubscribe
            unsubscribe();

            // Second emit should not call the callback
            eventBus.emit('test-event', 'second');
            expect(callback).toHaveBeenCalledTimes(1);
        });
    });

    describe('off()', () => {
        it('should remove a specific callback from an event', () => {
            const callback1 = vi.fn();
            const callback2 = vi.fn();

            eventBus.on('test-event', callback1);
            eventBus.on('test-event', callback2);

            eventBus.off('test-event', callback1);
            eventBus.emit('test-event', 'data');

            expect(callback1).not.toHaveBeenCalled();
            expect(callback2).toHaveBeenCalledWith('data');
        });

        it('should handle removing callback from non-existent event', () => {
            const callback = vi.fn();

            // Should not throw
            expect(() => eventBus.off('non-existent', callback)).not.toThrow();
        });
    });

    describe('emit()', () => {
        it('should not throw when emitting to event with no listeners', () => {
            expect(() => eventBus.emit('non-existent', 'data')).not.toThrow();
        });

        it('should pass data to all listeners', () => {
            const callback = vi.fn();
            eventBus.on('test-event', callback);

            const testData = { id: 1, name: 'Test' };
            eventBus.emit('test-event', testData);

            expect(callback).toHaveBeenCalledWith(testData);
        });

        it('should catch errors in listeners and continue executing others', () => {
            const errorCallback = vi.fn(() => {
                throw new Error('Test error');
            });
            const normalCallback = vi.fn();

            // Suppress console.error for this test
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

            eventBus.on('test-event', errorCallback);
            eventBus.on('test-event', normalCallback);

            eventBus.emit('test-event', 'data');

            expect(errorCallback).toHaveBeenCalled();
            expect(normalCallback).toHaveBeenCalledWith('data');
            expect(consoleSpy).toHaveBeenCalled();

            consoleSpy.mockRestore();
        });
    });

    describe('Singleton instance', () => {
        it('should export a singleton bus instance', () => {
            expect(bus).toBeInstanceOf(EventBus);
        });
    });
});
