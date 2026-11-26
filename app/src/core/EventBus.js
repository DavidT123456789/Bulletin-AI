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
    CLASS_CHANGED: 'class:changed',
    SYNC_STATUS_CHANGED: 'sync:status-changed',
    SYNC_CONNECTED: 'sync:connected',
    SYNC_DISCONNECTED: 'sync:disconnected',
    PERIOD_CHANGED: 'period:changed',
    STUDENT_UPDATED: 'student:updated',
    STUDENTS_UPDATED: 'students:updated',
    STUDENT_DIRTY_STATE_CHANGED: 'student:dirty-state-changed',
    APP_SETTINGS_CHANGED: 'settings:changed',
    PERSONALIZATION_RESET: 'settings:personalization-reset',
    SEATING_STATUS_CHANGED: 'seating:status-changed',
    JOURNAL_THRESHOLD_CHANGED: 'journal:threshold-changed',
    JOURNAL_UPDATED: 'journal:updated',
    AI_GENERATION_START: 'ai:generation-start',
    AI_FALLBACK: 'ai:fallback',
    AI_GENERATION_END: 'ai:generation-end',
    MODAL_SETTINGS_OPEN: 'modal:settings-open',
    MODAL_SETTINGS_CLOSE: 'modal:settings-close',
    MODAL_WELCOME_CLOSE: 'modal:welcome-close',
    MODAL_HELP_OPENED: 'modal:help-opened',
    APP_UPDATE_AVAILABLE: 'app:update-available',
    APP_DATA_RESTORED: 'app:data-restored',
    LOCAL_BACKUP_UPDATED: 'storage:local-backup-updated',
});

export class EventBus {
    constructor() {
        this.listeners = {};
    }

    /**
     * Subscribe to an event.
     * @param {string} event - The event name.
     * @param {Function} callback - The function to call when the event is emitted.
     * @param {{ signal?: AbortSignal }} [options] - Optional AbortSignal for automatic cleanup.
     * @returns {Function} - A function to unsubscribe.
     */
    on(event, callback, { signal } = {}) {
        if (typeof callback !== 'function' || signal?.aborted) {
            return () => {};
        }
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        if (!this.listeners[event].includes(callback)) {
            this.listeners[event].push(callback);
        }

        const unsubscribe = () => this.off(event, callback);
        if (signal) {
            signal.addEventListener('abort', unsubscribe, { once: true });
        }
        return unsubscribe;
    }

    /**
     * Subscribe to an event once.
     * @param {string} event - The event name.
     * @param {Function} callback - The function to call once when the event is emitted.
     * @param {{ signal?: AbortSignal }} [options] - Optional AbortSignal for automatic cleanup.
     * @returns {Function} - A function to unsubscribe before it fires.
     */
    once(event, callback, { signal } = {}) {
        if (typeof callback !== 'function' || signal?.aborted) {
            return () => {};
        }
        const wrapper = (data) => {
            this.off(event, wrapper);
            callback(data);
        };
        return this.on(event, wrapper, { signal });
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
