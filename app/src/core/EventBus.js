/**
 * EventBus.js
 * A simple Pub/Sub system for decoupled communication between components.
 */
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
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(callback);

        return () => this.off(event, callback);
    }

    /**
     * Unsubscribe from an event.
     * @param {string} event - The event name.
     * @param {Function} callback - The callback to remove.
     */
    off(event, callback) {
        if (!this.listeners[event]) return;
        this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }

    /**
     * Emit an event.
     * @param {string} event - The event name.
     * @param {*} data - Data to pass to listeners.
     */
    emit(event, data) {
        if (!this.listeners[event]) return;
        this.listeners[event].forEach(callback => {
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
