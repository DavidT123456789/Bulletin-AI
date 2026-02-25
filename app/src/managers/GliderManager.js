/**
 * @fileoverview Glider Manager — Animated sliding indicator for segmented controls
 * Extracted from UIManager.js (Phase 2 — God Object Decomposition)
 * @module managers/GliderManager
 */

const GLIDER_TRANSITION = 'left 0.35s cubic-bezier(0.4, 0, 0.2, 1), width 0.35s cubic-bezier(0.4, 0, 0.2, 1)';

export const GliderManager = {

    /** @type {ResizeObserver|null} */
    _observer: null,

    /** @type {boolean} */
    _resizeListenerAdded: false,

    /**
     * Initialise les animations "Glider" pour les sélecteurs.
     */
    init() {
        const containers = document.querySelectorAll('.input-mode-tabs, .provider-pills:not(#welcomeModal .provider-pills), .ui-segmented-control');

        if (!this._observer) {
            this._observer = new ResizeObserver((entries) => {
                entries.forEach(entry => {
                    requestAnimationFrame(() => this.update(entry.target, true));
                });
            });
        }

        containers.forEach(container => {
            if (container.classList.contains('css-driven')) return;

            let glider = container.querySelector('.ui-glider');
            const isNewGlider = !glider;

            if (isNewGlider) {
                glider = document.createElement('div');
                glider.className = 'ui-glider';
                container.prepend(glider);
                container.classList.add('has-glider');
            }

            glider.style.transition = GLIDER_TRANSITION;

            this._observer.observe(container);

            if (isNewGlider) {
                requestAnimationFrame(() => this.update(container, true));
            }

            const isRadioSelector = container.querySelector('input[type="radio"]') !== null;
            if (isRadioSelector && !container.dataset.gliderListenersAttached) {
                container.querySelectorAll('input[type="radio"]').forEach(input => {
                    input.addEventListener('change', () => this.update(container));
                });
                container.dataset.gliderListenersAttached = 'true';
            }
        });

        if (!this._resizeListenerAdded) {
            let resizeTimer;
            window.addEventListener('resize', () => {
                clearTimeout(resizeTimer);
                document.querySelectorAll('.has-glider').forEach(c => {
                    this.update(c, true);
                });
                resizeTimer = setTimeout(() => {
                    document.querySelectorAll('.has-glider').forEach(c => this.update(c));
                }, 100);
            });
            this._resizeListenerAdded = true;
        }
    },

    /**
     * Met à jour la position du Glider pour un conteneur donné.
     * @param {HTMLElement} container - Le conteneur du sélecteur
     * @param {boolean} immediate - Si true, désactive la transition pour un déplacement instantané
     */
    update(container, immediate = false) {
        if (!container) return;
        const glider = container.querySelector('.ui-glider');
        if (!glider) return;

        let activeEl;
        const isRadioSelector = container.querySelector('input[type="radio"]') !== null;
        if (isRadioSelector) {
            const checked = container.querySelector('input:checked');
            if (checked) {
                activeEl = container.querySelector(`label[for="${checked.id}"]`);
                if (!activeEl) {
                    activeEl = checked.nextElementSibling;
                }
            }
        } else if (container.classList.contains('provider-pills')) {
            activeEl = container.querySelector('.provider-pill.active');
        } else {
            activeEl = container.querySelector('.active');
        }

        if (activeEl) {
            const width = activeEl.offsetWidth;
            const left = activeEl.offsetLeft;

            if (width > 0) {
                if (immediate) {
                    glider.style.transition = 'none';
                } else {
                    glider.style.transition = GLIDER_TRANSITION;
                }

                glider.style.width = `${width}px`;
                glider.style.left = `${left}px`;
                glider.offsetHeight;
                requestAnimationFrame(() => {
                    glider.style.transition = GLIDER_TRANSITION;
                });
            } else {
                glider.style.transition = GLIDER_TRANSITION;
                glider.style.width = `${width}px`;
                glider.style.left = `${left}px`;
            }
        } else {
            glider.style.width = '0';
        }
    }
};
