/**
 * EventBus.js
 * Bus d'événements Pub/Sub découplé pour la communication inter-modules et la synchronisation d'état.
 */
export const EVENTS = Object.freeze({
    STATE_CHANGED: 'state:changed',
    STATE_SAVED: 'state:saved',
    STATE_LOADED: 'state:loaded',
    TAB_SYNC_RECEIVED: 'state:tab-sync',
    CLASS_CREATED: 'class:created',
    CLASS_UPDATED: 'class:updated',
    CLASS_DELETED: 'class:deleted',
    CLASS_SWITCHED: 'class:switched',
    CLASSES_UPDATED: 'classes:updated',
    SYNC_STATUS_CHANGED: 'sync:status-changed',
    SYNC_CONNECTED: 'sync:connected',
    SYNC_DISCONNECTED: 'sync:disconnected',
});

export class EventBus {
    constructor() {
        this.listeners = {};
    }

    /**
     * Subscribe to an event.
     * @param {string} event - The event name.
     * @param {Function} callback - The function to call when the event is emitted.
     * @returns {Function} - A function to unsubscribe.
     */
    on(event, callback) {
        if (typeof callback !== 'function') {
            return () => {};
        }
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        if (!this.listeners[event].includes(callback)) {
            this.listeners[event].push(callback);
        }

        return () => this.off(event, callback);
    }

    /**
     * Subscribe to an event once.
     * @param {string} event - The event name.
     * @param {Function} callback - The function to call once when the event is emitted.
     * @returns {Function} - A function to unsubscribe before it fires.
     */
    once(event, callback) {
        if (typeof callback !== 'function') {
            return () => {};
        }
        const wrapper = (data) => {
            this.off(event, wrapper);
            callback(data);
        };
        return this.on(event, wrapper);
    }

    /**
     * Unsubscribe from an event.
     * @param {string} event - The event name.
     * @param {Function} callback - The callback to remove.
     */
    off(event, callback) {
        if (!this.listeners[event]) return;
        this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
        if (this.listeners[event].length === 0) {
            delete this.listeners[event];
        }
    }

    /**
     * Clear all listeners for a specific event, or all events if none specified.
     * @param {string} [event] - Optional event name to clear.
     */
    clear(event) {
        if (event) {
            delete this.listeners[event];
        } else {
            this.listeners = {};
        }
    }

    /**
     * Emit an event.
     * @param {string} event - The event name.
     * @param {*} data - Data to pass to listeners.
     */
    emit(event, data) {
        if (!this.listeners[event]) return;
        [...this.listeners[event]].forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                console.error(`Error in EventBus listener for "${event}":`, error);
            }
        });
    }
}

// Export a singleton instance
export const bus = new EventBus();
