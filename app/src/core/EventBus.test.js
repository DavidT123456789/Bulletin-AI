/**
 * @fileoverview Tests for EventBus and State SSOT EventBus integration
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus, bus, EVENTS } from './EventBus.js';
import { appState } from '../state/State.js';

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

        it('should prevent duplicate registration of the exact same callback reference', () => {
            const callback = vi.fn();
            eventBus.on('test-event', callback);
            eventBus.on('test-event', callback);

            eventBus.emit('test-event', 'payload');
            expect(callback).toHaveBeenCalledTimes(1);
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

    describe('once()', () => {
        it('should invoke the listener only once and auto-unsubscribe', () => {
            const callback = vi.fn();
            eventBus.once('one-shot', callback);

            eventBus.emit('one-shot', 'first');
            eventBus.emit('one-shot', 'second');

            expect(callback).toHaveBeenCalledTimes(1);
            expect(callback).toHaveBeenCalledWith('first');
        });
    });

    describe('off() & clear()', () => {
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

        it('should clear a specific event or all events', () => {
            const cb1 = vi.fn();
            const cb2 = vi.fn();
            eventBus.on('evt1', cb1);
            eventBus.on('evt2', cb2);

            eventBus.clear('evt1');
            eventBus.emit('evt1', 'a');
            eventBus.emit('evt2', 'b');
            expect(cb1).not.toHaveBeenCalled();
            expect(cb2).toHaveBeenCalledWith('b');

            eventBus.clear();
            eventBus.emit('evt2', 'c');
            expect(cb2).toHaveBeenCalledTimes(1);
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

    describe('Singleton instance & State SSOT integration (Lot 10 / E-02)', () => {
        it('should export a singleton bus instance and standard EVENTS catalog', () => {
            expect(bus).toBeInstanceOf(EventBus);
            expect(EVENTS.STATE_CHANGED).toBe('state:changed');
            expect(EVENTS.TAB_SYNC_RECEIVED).toBe('state:tab-sync');
            expect(EVENTS.CLASS_SWITCHED).toBe('class:switched');
        });

        it('should emit state:changed and state:changed:<prop> when appState is mutated', () => {
            const genericSpy = vi.fn();
            const propSpy = vi.fn();

            const unsubGeneric = bus.on(EVENTS.STATE_CHANGED, genericSpy);
            const unsubProp = bus.on(`${EVENTS.STATE_CHANGED}:currentPeriod`, propSpy);

            try {
                const prev = appState.currentPeriod;
                const next = prev === 'T1' ? 'T2' : 'T1';
                appState.currentPeriod = next;

                expect(genericSpy).toHaveBeenCalledWith({
                    prop: 'currentPeriod',
                    value: next,
                    previousValue: prev
                });
                expect(propSpy).toHaveBeenCalledWith({
                    value: next,
                    previousValue: prev
                });

                // Restore
                appState.currentPeriod = prev;
            } finally {
                unsubGeneric();
                unsubProp();
            }
        });
    });
});
