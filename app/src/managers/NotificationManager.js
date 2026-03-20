/**
 * @fileoverview Intelligent Notification Coalescing System
 * 
 * Prevents notification storms during batch operations (mass generation, fallbacks).
 * Instead of showing N individual toasts, coalesces repeated notifications into
 * a single updating toast with a counter badge.
 * 
 * Also handles tab visibility: when the tab is hidden, notifications are queued
 * and a single summary is shown when the user returns.
 * 
 * @module managers/NotificationManager
 */

const MAX_VISIBLE_NOTIFICATIONS = 3;
const COALESCE_WINDOW_MS = 5000;
const VISIBILITY_SUMMARY_DELAY_MS = 300;

export const NotificationCoalescer = {
    /** @type {Map<string, {count: number, element: HTMLElement, timeoutId: number, lastMessage: string}>} */
    _activeGroups: new Map(),

    /** @type {Array<{group: string, type: string, message: string, timestamp: number}>} */
    _hiddenQueue: [],

    _visibilityListenerAttached: false,
    _tabHidden: false,

    init() {
        if (this._visibilityListenerAttached) return;
        this._visibilityListenerAttached = true;

        document.addEventListener('visibilitychange', () => {
            this._tabHidden = document.hidden;

            if (!document.hidden && this._hiddenQueue.length > 0) {
                setTimeout(() => this._flushHiddenQueue(), VISIBILITY_SUMMARY_DELAY_MS);
            }
        });

        this._tabHidden = document.hidden;
    },

    /**
     * Determines if a notification should be shown, coalesced, or queued.
     * @param {string} message - Notification message
     * @param {string} type - Notification type (success, error, warning, info)
     * @param {Object} [options] - Options
     * @param {string} [options.group] - Coalescing group key (e.g. 'fallback', 'rate-limit')
     * @param {boolean} [options.bypassCoalescing=false] - Skip coalescing for unique notifications
     * @returns {{ action: 'show'|'coalesce'|'queue'|'skip', existingElement?: HTMLElement, count?: number }}
     */
    evaluate(message, type, options = {}) {
        const group = options.group || `${type}:${this._normalizeMessage(message)}`;

        if (this._tabHidden && !options.bypassCoalescing) {
            this._hiddenQueue.push({ group, type, message, timestamp: Date.now() });
            return { action: 'queue' };
        }

        const existing = this._activeGroups.get(group);
        if (existing && !options.bypassCoalescing) {
            existing.count++;
            existing.lastMessage = message;
            return { action: 'coalesce', existingElement: existing.element, count: existing.count };
        }

        const container = document.getElementById('notification-container');
        const visibleCount = container?.querySelectorAll('.notification.show')?.length || 0;
        if (visibleCount >= MAX_VISIBLE_NOTIFICATIONS && !options.bypassCoalescing) {
            this._hiddenQueue.push({ group, type, message, timestamp: Date.now() });
            return { action: 'queue' };
        }

        return { action: 'show' };
    },

    /**
     * Registers an active notification for coalescing tracking.
     * @param {string} message - Original message
     * @param {string} type - Notification type
     * @param {HTMLElement} element - The DOM element
     * @param {number} timeoutId - The auto-dismiss timeout ID
     * @param {Object} [options]
     * @param {string} [options.group] - Custom group key
     */
    register(message, type, element, timeoutId, options = {}) {
        if (!element) return;
        const group = options.group || `${type}:${this._normalizeMessage(message)}`;

        this._activeGroups.set(group, {
            count: 1,
            element,
            timeoutId,
            lastMessage: message
        });

        const cleanup = () => this._activeGroups.delete(group);
        element.addEventListener('transitionend', () => {
            if (!element.classList.contains('show')) cleanup();
        });
        setTimeout(cleanup, COALESCE_WINDOW_MS + 5000);
    },

    /**
     * Updates the counter badge on an existing coalesced notification.
     * @param {HTMLElement} element - The notification element
     * @param {number} count - New count
     */
    updateBadge(element, count) {
        let badge = element.querySelector('.notification-coalesce-badge');
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'notification-coalesce-badge';
            element.appendChild(badge);
        }

        badge.textContent = `×${count}`;
        badge.classList.remove('badge-bump');
        void badge.offsetWidth;
        badge.classList.add('badge-bump');
    },

    /**
     * Flushes the hidden queue into a single summary notification on tab return.
     * @private
     */
    _flushHiddenQueue() {
        if (this._hiddenQueue.length === 0) return;

        const grouped = new Map();
        for (const item of this._hiddenQueue) {
            const key = item.group;
            if (!grouped.has(key)) {
                grouped.set(key, { type: item.type, message: item.message, count: 0 });
            }
            grouped.get(key).count++;
        }

        const queueLength = this._hiddenQueue.length;
        this._hiddenQueue = [];

        if (queueLength === 1) {
            const [entry] = [...grouped.values()];
            window.UI?.showNotification(entry.message, entry.type);
            return;
        }

        const lines = [];
        for (const [, data] of grouped) {
            const shortMsg = this._truncate(data.message.replace(/<[^>]*>/g, ''), 50);
            lines.push(data.count > 1 ? `${shortMsg} <strong>×${data.count}</strong>` : shortMsg);
        }

        const summaryMessage = lines.length <= 3
            ? lines.join('<br>')
            : `${lines.slice(0, 2).join('<br>')}<br><em>+${lines.length - 2} autre(s)</em>`;

        window.UI?.showNotification(
            `📋 <strong>${queueLength} notification${queueLength > 1 ? 's' : ''}</strong> pendant votre absence<br>${summaryMessage}`,
            'info',
            6000,
            { bypassCoalescing: true }
        );
    },

    /**
     * Normalizes a message for grouping (strips HTML, numbers, timestamps).
     * @private
     */
    _normalizeMessage(message) {
        return message
            .replace(/<[^>]*>/g, '')
            .replace(/\d+([.,]\d+)?/g, '#')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 60);
    },

    /**
     * @private
     */
    _truncate(str, maxLen) {
        return str.length > maxLen ? str.substring(0, maxLen) + '…' : str;
    },

    /**
     * Clears all tracked groups. Called when mass operations end.
     */
    reset() {
        this._activeGroups.clear();
        this._hiddenQueue = [];
    }
};
