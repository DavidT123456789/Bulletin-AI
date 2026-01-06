/**
 * Component.js
 * Base class for all UI components.
 * Handles DOM caching and event delegation.
 */
export class Component {
    /**
     * @param {string|HTMLElement} elementOrId - The root element or its ID.
     */
    constructor(elementOrId) {
        this.root = typeof elementOrId === 'string'
            ? document.getElementById(elementOrId)
            : elementOrId;

        if (!this.root) {
            console.warn(`Component initialized with missing root element: ${elementOrId}`);
        }

        this.elements = {};
        this.subscriptions = [];
    }

    /**
     * Initialize the component.
     * Should be called after the DOM is ready.
     */
    init() {
        if (!this.root) return;
        this.cacheDOM();
        this.bindEvents();
        this.render();
    }

    /**
     * Cache DOM elements for quick access.
     * Override this method in subclasses.
     */
    cacheDOM() { }

    /**
     * Bind event listeners.
     * Override this method in subclasses.
     */
    bindEvents() { }

    /**
     * Render or update the component's UI.
     * Override this method in subclasses.
     */
    render() { }

    /**
     * Helper to add an event listener with delegation.
     * @param {string} eventType - e.g., 'click', 'change'
     * @param {string} selector - CSS selector to match target.
     * @param {Function} handler - Callback function.
     */
    addEvent(eventType, selector, handler) {
        if (!this.root) return;

        this.root.addEventListener(eventType, (e) => {
            const target = e.target.closest(selector);
            if (target && this.root.contains(target)) {
                handler(e, target);
            }
        });
    }

    /**
     * Clean up listeners and subscriptions.
     */
    destroy() {
        this.subscriptions.forEach(unsubscribe => unsubscribe());
        this.subscriptions = [];
        this.elements = {};
        // Note: Native event listeners attached to root are not automatically removed 
        // unless we store references to the wrapper functions, but since the root 
        // usually persists or is removed entirely, this is often acceptable for this scale.
    }
}
