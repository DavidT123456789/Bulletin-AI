export const DOMHelper = {
    /**
     * Escapes HTML special characters to prevent XSS injection.
     * @param {string} str - The string to escape.
     * @returns {string} The escaped string, safe to inject via innerHTML.
     */
    escapeHTML(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    /**
     * Tagged template literal for building safe HTML strings.
     * Interpolated values are auto-escaped; template structure is preserved as-is.
     * @example safeHTML`<span class="name">${studentName}</span>`
     * @param {TemplateStringsArray} strings - Template literal string parts.
     * @param {...*} values - Interpolated values to escape.
     * @returns {string} Safe HTML string.
     */
    safeHTML(strings, ...values) {
        return strings.reduce((result, str, i) => {
            const val = i < values.length ? DOMHelper.escapeHTML(values[i]) : '';
            return result + str + val;
        }, '');
    },

    /**
     * Creates a DOM element with attributes and children.
     * @param {string} tag - The HTML tag name.
     * @param {object} [attributes={}] - Key-value pairs for attributes.
     * @param {Array<string|Node>} [children=[]] - Array of strings or DOM nodes to append.
     * @returns {HTMLElement} The created element.
     */
    createElement(tag, attributes = {}, children = []) {
        const element = document.createElement(tag);

        for (const [key, value] of Object.entries(attributes)) {
            if (key === 'className') {
                element.className = value;
            } else if (key === 'style' && typeof value === 'object') {
                Object.assign(element.style, value);
            } else if (key.startsWith('on') && typeof value === 'function') {
                element.addEventListener(key.substring(2).toLowerCase(), value);
            } else if (key === 'dataset' && typeof value === 'object') {
                Object.assign(element.dataset, value);
            } else {
                element.setAttribute(key, value);
            }
        }

        children.forEach(child => {
            if (typeof child === 'string') {
                element.appendChild(document.createTextNode(child));
            } else if (child instanceof Node) {
                element.appendChild(child);
            }
        });

        return element;
    },

    /**
     * Removes all children from an element.
     * @param {HTMLElement} element - The element to clear.
     */
    clear(element) {
        if (!element) return;
        while (element.firstChild) {
            element.removeChild(element.firstChild);
        }
    },

    /**
     * Safely adds an event listener.
     * @param {HTMLElement|string} elementOrId - The element or its ID.
     * @param {string} event - The event name.
     * @param {function} handler - The event handler.
     */
    addEvent(elementOrId, event, handler) {
        const element = typeof elementOrId === 'string' ? document.getElementById(elementOrId) : elementOrId;
        if (element) {
            element.addEventListener(event, handler);
        } else {
            console.warn(`DOMHelper: Element ${elementOrId} not found for event ${event}`);
        }
    }
};
