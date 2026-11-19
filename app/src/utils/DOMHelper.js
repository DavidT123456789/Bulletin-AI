const DEFAULT_DROP_TAGS = new Set([
    'SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'TEMPLATE',
    'NOSCRIPT', 'TEXTAREA', 'TITLE', 'IMG', 'AUDIO', 'VIDEO', 'SOURCE',
    'LINK', 'META', 'BASE', 'FORM', 'INPUT', 'SELECT', 'OPTION'
]);

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
     * Sanitizes an HTML string using an inert document and a strict tag/attribute allowlist.
     * Drops dangerous elements along with their subtree and unwraps disallowed non-dropped tags.
     * @param {string} html - Raw HTML string to sanitize.
     * @param {Object} [options={}]
     * @param {Set<string>|string[]} [options.allowedTags=[]] - Uppercase tag names to keep.
     * @param {Set<string>|string[]} [options.dropTags] - Uppercase tag names to drop entirely with children.
     * @param {(tag: string, name: string, value: string) => (string|null|undefined)} [options.sanitizeAttr] - Returns sanitized attribute value or null/undefined to strip.
     * @returns {string} Sanitized HTML safe for innerHTML injection.
     */
    sanitizeHTML(html, { allowedTags = [], dropTags = DEFAULT_DROP_TAGS, sanitizeAttr = null } = {}) {
        if (typeof html !== 'string' || !html) return '';
        if (!html.includes('<')) return html;

        if (typeof DOMParser !== 'function' || typeof document === 'undefined' || !document.implementation?.createHTMLDocument) {
            return DOMHelper.escapeHTML(html);
        }

        const allowedSet = allowedTags instanceof Set ? allowedTags : new Set(allowedTags);
        const dropSet = dropTags instanceof Set ? dropTags : new Set(dropTags);

        const parsed = new DOMParser().parseFromString(html, 'text/html');
        const outDoc = document.implementation.createHTMLDocument('');

        const sanitizeNode = (node) => {
            if (node.nodeType === 3) {
                return outDoc.createTextNode(node.nodeValue || '');
            }
            if (node.nodeType !== 1) return null;

            const tag = node.tagName.toUpperCase();
            if (dropSet.has(tag)) return null;

            if (!allowedSet.has(tag)) {
                const frag = outDoc.createDocumentFragment();
                for (const child of Array.from(node.childNodes)) {
                    const cleanChild = sanitizeNode(child);
                    if (cleanChild) frag.appendChild(cleanChild);
                }
                return frag;
            }

            const cleanEl = outDoc.createElement(tag.toLowerCase());
            if (typeof sanitizeAttr === 'function') {
                for (const attr of Array.from(node.attributes)) {
                    const name = attr.name.toLowerCase();
                    const nextVal = sanitizeAttr(tag, name, attr.value);
                    if (typeof nextVal === 'string') {
                        cleanEl.setAttribute(name, nextVal);
                    }
                }
            }

            for (const child of Array.from(node.childNodes)) {
                const cleanChild = sanitizeNode(child);
                if (cleanChild) cleanEl.appendChild(cleanChild);
            }
            return cleanEl;
        };

        const wrapper = outDoc.createElement('div');
        for (const child of Array.from(parsed.body.childNodes)) {
            const cleanChild = sanitizeNode(child);
            if (cleanChild) wrapper.appendChild(cleanChild);
        }
        return wrapper.innerHTML;
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
    },

    /**
     * Connects a search input with its clear button (×), Escape key reset, and optional container click focus.
     * @param {HTMLInputElement|null} inputEl - The search input element.
     * @param {HTMLElement|null} clearBtnEl - The clear button element (toggles `.visible`).
     * @param {(value: string) => void} onChange - Callback fired when the search value changes or is cleared.
     * @param {HTMLElement|null} [boxEl=null] - Optional outer search box container that focuses `inputEl` on click.
     */
    bindSearchInput(inputEl, clearBtnEl, onChange, boxEl = null) {
        if (!inputEl) return;

        const clearSearch = (focusInput = false) => {
            inputEl.value = '';
            clearBtnEl?.classList.remove('visible');
            if (focusInput) inputEl.focus();
            onChange('');
        };

        inputEl.addEventListener('input', (e) => {
            const val = e.target.value || '';
            clearBtnEl?.classList.toggle('visible', val.length > 0);
            onChange(val);
        });

        inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && inputEl.value) {
                e.preventDefault();
                e.stopPropagation();
                clearSearch(false);
            }
        });

        clearBtnEl?.addEventListener('click', () => {
            clearSearch(true);
        });

        boxEl?.addEventListener('click', (e) => {
            if (!e.target.closest('input') && (!clearBtnEl || !clearBtnEl.contains(e.target))) {
                inputEl.focus();
            }
        });
    },

    /**
     * Attache la plomberie DOM standard d'édition inline `contenteditable` par délégation :
     * snapshot initial au `focusin`, `Escape` (annulation), `Enter` sans modificateur (validation),
     * collage en texte brut monoligne au `paste`, et callback de validation au `focusout`.
     * La logique métier de suppression/restauration (ex. `<li>` vs `<p>`) reste portée par les callbacks.
     * @param {HTMLElement|null} containerEl - Conteneur délégué
     * @param {Object} options
     * @param {string} options.selector - Sélecteur CSS des éléments éditables
     * @param {(editable: HTMLElement) => void} [options.onCancel] - Callback appelé sur Escape
     * @param {(editable: HTMLElement) => void} [options.onCommit] - Callback appelé sur focusout
     */
    bindInlineEditable(containerEl, { selector, onCancel, onCommit } = {}) {
        if (!containerEl || !selector) return;

        containerEl.addEventListener('focusin', (e) => {
            const editable = e.target.closest(selector);
            if (editable) {
                editable._initialTextBeforeEdit = (editable.innerText || editable.textContent || '').replace(/\s+/g, ' ').trim();
            }
        });

        containerEl.addEventListener('keydown', (e) => {
            const editable = e.target.closest(selector);
            if (!editable) return;

            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                onCancel?.(editable);
            } else if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                editable.blur();
            }
        });

        containerEl.addEventListener('paste', (e) => {
            const editable = e.target.closest(selector);
            if (!editable) return;

            e.preventDefault();
            const rawPaste = (e.clipboardData || window.clipboardData)?.getData('text/plain') || '';
            const cleanPaste = rawPaste.replace(/\s+/g, ' ');
            if (document.queryCommandSupported?.('insertText')) {
                document.execCommand('insertText', false, cleanPaste);
            } else {
                const selection = window.getSelection();
                if (selection && selection.rangeCount > 0) {
                    selection.deleteFromDocument();
                    selection.getRangeAt(0).insertNode(document.createTextNode(cleanPaste));
                    selection.collapseToEnd();
                }
            }
        });

        containerEl.addEventListener('focusout', (e) => {
            const editable = e.target.closest(selector);
            if (!editable) return;
            onCommit?.(editable);
        });
    },

    /**
     * Orchestre une session d'impression navigateur (titre, `body[data-print-mode]`, style `@page`
     * dynamique et nettoyage idempotent garanti sur `onafterprint` ou en cas d'exception).
     * @param {Object} config
     * @param {'list'|'report'|'seating'} config.mode
     * @param {string} config.title
     * @param {string} [config.pageCss='']
     * @param {Function} [config.setup]
     * @param {Function} [config.cleanup]
     */
    runPrintSession({ mode, title, pageCss = '', setup, cleanup }) {
        const originalTitle = document.title;
        const previousAfterPrint = window.onafterprint;
        document.title = title;
        document.body.dataset.printMode = mode;

        document.getElementById('print-dynamic-page-style')?.remove();
        let dynamicPageStyle = null;
        if (pageCss) {
            dynamicPageStyle = document.createElement('style');
            dynamicPageStyle.id = 'print-dynamic-page-style';
            dynamicPageStyle.textContent = pageCss;
            document.head.appendChild(dynamicPageStyle);
        }

        let cleaned = false;
        const handleAfterPrint = (invokePrevious = true) => {
            if (cleaned) return;
            cleaned = true;
            document.title = originalTitle;
            delete document.body.dataset.printMode;
            dynamicPageStyle?.remove();
            cleanup?.();
            if (window.onafterprint === handleAfterPrint) {
                window.onafterprint = previousAfterPrint || null;
            }
            if (invokePrevious && typeof previousAfterPrint === 'function') {
                previousAfterPrint();
            }
        };

        try {
            setup?.();
            window.onafterprint = handleAfterPrint;
            window.print();
        } catch (err) {
            handleAfterPrint(false);
            throw err;
        }
    }
};
