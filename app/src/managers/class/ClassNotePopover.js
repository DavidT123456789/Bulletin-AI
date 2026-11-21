/**
 * @fileoverview Sous-module de la « Bulle Mémo » de classe (ClassUIManager)
 * Gère le bouton d'en-tête, la pastille du menu déroulant, le popover de saisie,
 * le redimensionnement automatique et l'historique Annuler/Rétablir (Undo/Redo).
 *
 * @module managers/class/ClassNotePopover
 */

import { DOM } from '../../utils/DOM.js';
import { appState } from '../../state/State.js';
import { ClassManager } from '../ClassManager.js';
import { HistoryManager } from '../HistoryManager.js';
import { TooltipsUI } from '../TooltipsManager.js';

export const ClassNotePopover = {
    /**
     * Attache les écouteurs d'événements propres à la Bulle Mémo
     * @private
     */
    _bindNotePopoverEvents() {
        DOM.headerClassNoteBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleNotePopover();
        });

        DOM.closeClassNotePopoverBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeNotePopover();
        });

        DOM.undoClassNoteBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.undoClassNote();
        });

        DOM.redoClassNoteBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.redoClassNote();
        });

        DOM.clearClassNoteBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!DOM.classNoteTextarea) return;
            const prevVal = DOM.classNoteTextarea.value ?? '';
            if (!prevVal.trim()) return;
            if (this._noteTypingBurstTimer) {
                clearTimeout(this._noteTypingBurstTimer);
                this._noteTypingBurstTimer = null;
            }
            const targetId = this._noteTargetClassId || appState.currentClassId;
            if (targetId) {
                this._recordNoteSnapshot(targetId, prevVal);
                const history = this._getNoteHistory(targetId, '');
                history.lastCommitted = '';
            }
            DOM.classNoteTextarea.value = '';
            this._handleNoteTextareaInput({ recordHistory: false });
            this._syncNoteHistoryButtons(targetId);
            DOM.classNoteTextarea.focus();
        });

        DOM.classNoteTextarea?.addEventListener('input', () => {
            this._handleNoteTextareaInput({ recordHistory: true });
        });

        DOM.classNoteTextarea?.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                this.closeNotePopover();
                DOM.headerClassNoteBtn?.focus?.();
                return;
            }
            const isMod = e.ctrlKey || e.metaKey;
            if (isMod && !e.altKey && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                e.stopPropagation();
                if (e.shiftKey) {
                    this.redoClassNote();
                } else {
                    this.undoClassNote();
                }
                return;
            }
            if (isMod && !e.altKey && e.key.toLowerCase() === 'y') {
                e.preventDefault();
                e.stopPropagation();
                this.redoClassNote();
            }
        });
    },

    /**
     * Formate un mémo de classe pour affichage dans une infobulle HTML (échappement XSS + sauts de ligne <br>)
     * @param {string} [rawNote='']
     * @returns {string}
     * @private
     */
    _formatNoteTooltip(rawNote = '') {
        const trimmed = typeof rawNote === 'string' ? rawNote.trim() : '';
        if (!trimmed) return '';
        const html = this._escapeHtml(trimmed).replace(/\r?\n/g, '<br>');
        return html.includes('<br>') ? `<div class='tooltip-note-multiline'>${html}</div>` : html;
    },

    /**
     * Formate l'horodatage court du mémo pour l'en-tête de la bulle (ex. "· aujourd'hui", "· hier", "· mar. 3 nov.")
     * @param {number|null} [timestamp=null]
     * @returns {string}
     * @private
     */
    _formatNoteUpdatedMeta(timestamp = null) {
        if (!timestamp || typeof timestamp !== 'number') return '';
        const d = new Date(timestamp);
        if (Number.isNaN(d.getTime())) return '';

        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const startOfNoteDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        const diffDays = Math.round((startOfToday - startOfNoteDay) / 86400000);

        if (diffDays <= 0) return '· aujourd\'hui';
        if (diffDays === 1) return '· hier';
        const formatted = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
        return `· ${formatted}`;
    },

    /**
     * Met à jour le sous-texte de date dans l'en-tête de la bulle Mémo
     * @param {Object|null} [cls=null]
     * @private
     */
    _syncNotePopoverMeta(cls = null) {
        const metaEl = DOM.classNotePopoverMeta || document.getElementById('classNotePopoverMeta');
        if (!metaEl) return;
        const targetClass = cls || (this._noteTargetClassId ? ClassManager.getClassById(this._noteTargetClassId) : ClassManager.getCurrentClass());
        const hasNote = Boolean(targetClass && typeof targetClass.classNote === 'string' && targetClass.classNote.trim());
        const metaText = hasNote ? this._formatNoteUpdatedMeta(targetClass.classNoteUpdatedAt) : '';
        metaEl.textContent = metaText;
        metaEl.style.display = metaText ? 'inline' : 'none';
    },

    /**
     * Synchronise sur place la pastille de mémo d'une classe dans le menu déroulant
     * @param {string} classId
     * @param {string} [rawNote]
     * @private
     */
    _syncDropdownNoteBadge(classId, rawNote = '') {
        const badge = DOM.classDropdownList?.querySelector(`.class-note-badge[data-class-id="${classId}"]`);
        if (!badge) return;
        const noteText = typeof rawNote === 'string' ? rawNote.trim() : '';
        const hasNote = Boolean(noteText);
        badge.classList.toggle('is-hidden', !hasNote);
        badge.classList.toggle('tooltip', hasNote);
        if (hasNote) {
            const formatted = this._formatNoteTooltip(noteText);
            badge.setAttribute('data-tooltip', formatted);
            TooltipsUI?.updateTooltip?.(badge, formatted);
        } else {
            badge.removeAttribute('data-tooltip');
            badge._tippy?.destroy?.();
        }
    },

    /**
     * Synchronise le bouton Mémo du header (#headerClassNoteBtn) avec la classe active
     */
    syncHeaderNoteButton() {
        const btn = DOM.headerClassNoteBtn || document.getElementById('headerClassNoteBtn');
        if (!btn) return;

        const currentClass = ClassManager.getCurrentClass();
        const isVirtual = currentClass ? ClassManager.isVirtualClass(currentClass.id) : false;

        if (!currentClass || isVirtual) {
            btn.style.display = 'none';
            if (this._isNotePopoverOpen) {
                this.closeNotePopover();
            }
            return;
        }

        btn.style.display = 'inline-flex';
        const noteText = typeof currentClass.classNote === 'string' ? currentClass.classNote.trim() : '';
        const hasNote = Boolean(noteText);

        btn.classList.toggle('has-note', hasNote);
        btn.classList.toggle('is-empty', !hasNote);

        const iconEl = btn.querySelector('iconify-icon');
        const targetIcon = hasNote ? 'solar:bookmark-bold' : 'solar:bookmark-linear';
        if (iconEl && iconEl.getAttribute('icon') !== targetIcon) {
            iconEl.setAttribute('icon', targetIcon);
        }

        const tooltipText = hasNote
            ? this._formatNoteTooltip(noteText)
            : 'Ajouter un mémo de classe';
        btn.setAttribute('aria-label', hasNote ? `Mémo de la classe : ${noteText}` : 'Ajouter un mémo de classe');
        btn.setAttribute('data-tooltip', tooltipText);
        TooltipsUI?.updateTooltip?.(btn, tooltipText);
    },

    /**
     * Bascule l'ouverture de la bulle Mémo de la classe
     * @param {string|null} [classId=null]
     */
    toggleNotePopover(classId = null) {
        if (this._isNotePopoverOpen) {
            this.closeNotePopover();
        } else {
            this.openNotePopover(classId);
        }
    },

    /**
     * Positionne la bulle Mémo sous le bouton du header
     * @private
     */
    _positionNotePopover() {
        const popover = DOM.classNotePopover || document.getElementById('classNotePopover');
        if (!popover) return;

        const btn = DOM.headerClassNoteBtn || document.getElementById('headerClassNoteBtn');
        const anchorEl = (btn && btn.offsetWidth > 0) ? btn : DOM.headerClassChip;
        const rect = anchorEl?.getBoundingClientRect();
        const headerRect = document.querySelector('.header')?.getBoundingClientRect();
        const headerBottom = headerRect?.bottom > 0 ? headerRect.bottom : 56;
        const anchorBottom = rect?.bottom > 0 ? rect.bottom : headerBottom;

        popover.style.position = 'fixed';
        popover.style.top = `${Math.round(Math.max(headerBottom, anchorBottom) + 8)}px`;
        popover.style.zIndex = '9999';

        if (window.innerWidth <= 600) {
            popover.style.left = '12px';
            popover.style.right = '12px';
            popover.style.width = 'auto';
        } else {
            const width = 340;
            const maxLeft = Math.max(12, window.innerWidth - width - 12);
            const targetLeft = Math.min(Math.max(12, Math.round(rect?.left || 16)), maxLeft);
            popover.style.left = `${targetLeft}px`;
            popover.style.right = 'unset';
            popover.style.width = `${width}px`;
        }
    },

    /**
     * Ajuste automatiquement la hauteur du textarea de la bulle Mémo
     * @private
     */
    _autoResizeNoteTextarea() {
        const textarea = DOM.classNoteTextarea || document.getElementById('classNoteTextarea');
        if (!textarea) return;
        textarea.style.height = 'auto';
        const scrollH = textarea.scrollHeight || 82;
        const nextHeight = Math.min(Math.max(scrollH, 82), 180);
        textarea.style.height = `${nextHeight}px`;
        textarea.style.overflowY = scrollH > 180 ? 'auto' : 'hidden';
    },

    /**
     * Récupère ou initialise l'historique Undo/Redo du mémo d'une classe
     * @param {string} classId
     * @param {string} [initialValue='']
     * @returns {{ past: string[], future: string[], lastCommitted: string }}
     * @private
     */
    _getNoteHistory(classId, initialValue = '') {
        if (!this._noteHistoryByClassId.has(classId)) {
            this._noteHistoryByClassId.set(classId, {
                past: [],
                future: [],
                lastCommitted: initialValue ?? ''
            });
        }
        return this._noteHistoryByClassId.get(classId);
    },

    /**
     * Enregistre un état précédent dans la pile Undo du mémo d'une classe
     * @param {string} classId
     * @param {string} previousValue
     * @private
     */
    _recordNoteSnapshot(classId, previousValue) {
        if (!classId) return;
        const history = this._getNoteHistory(classId, previousValue);
        const val = previousValue ?? '';
        if (history.past.length === 0 || history.past[history.past.length - 1] !== val) {
            history.past.push(val);
            if (history.past.length > 20) {
                history.past.shift();
            }
        }
        history.future = [];
    },

    /**
     * Synchronise l'état actif/désactivé des boutons Annuler / Rétablir du mémo
     * @param {string|null} [classId=null]
     * @private
     */
    _syncNoteHistoryButtons(classId = null) {
        const targetId = classId || this._noteTargetClassId || appState.currentClassId;
        const history = targetId ? this._noteHistoryByClassId.get(targetId) : null;
        const canUndo = Boolean(history && history.past.length > 0);
        const canRedo = Boolean(history && history.future.length > 0);

        const undoBtn = DOM.undoClassNoteBtn || document.getElementById('undoClassNoteBtn');
        if (undoBtn) {
            undoBtn.classList.toggle('disabled', !canUndo);
            undoBtn.setAttribute('aria-disabled', String(!canUndo));
        }

        const redoBtn = DOM.redoClassNoteBtn || document.getElementById('redoClassNoteBtn');
        if (redoBtn) {
            redoBtn.classList.toggle('disabled', !canRedo);
            redoBtn.setAttribute('aria-disabled', String(!canRedo));
        }
    },

    /**
     * Annule la dernière modification du mémo de la classe active
     */
    undoClassNote() {
        const targetId = this._noteTargetClassId || appState.currentClassId;
        const textarea = DOM.classNoteTextarea || document.getElementById('classNoteTextarea');
        if (!targetId || !textarea) return;

        if (this._noteTypingBurstTimer) {
            clearTimeout(this._noteTypingBurstTimer);
            this._noteTypingBurstTimer = null;
        }

        const currentVal = textarea.value ?? '';
        const history = this._getNoteHistory(targetId, currentVal);
        if (history.past.length === 0) return;

        const previousVal = history.past.pop();
        history.future.push(currentVal);
        history.lastCommitted = previousVal;

        textarea.value = previousVal;
        this._handleNoteTextareaInput({ recordHistory: false });
        this._syncNoteHistoryButtons(targetId);
        textarea.focus({ preventScroll: true });
    },

    /**
     * Rétablit la modification annulée du mémo de la classe active
     */
    redoClassNote() {
        const targetId = this._noteTargetClassId || appState.currentClassId;
        const textarea = DOM.classNoteTextarea || document.getElementById('classNoteTextarea');
        if (!targetId || !textarea) return;

        if (this._noteTypingBurstTimer) {
            clearTimeout(this._noteTypingBurstTimer);
            this._noteTypingBurstTimer = null;
        }

        const currentVal = textarea.value ?? '';
        const history = this._getNoteHistory(targetId, currentVal);
        if (history.future.length === 0) return;

        const nextVal = history.future.pop();
        history.past.push(currentVal);
        history.lastCommitted = nextVal;

        textarea.value = nextVal;
        this._handleNoteTextareaInput({ recordHistory: false });
        this._syncNoteHistoryButtons(targetId);
        textarea.focus({ preventScroll: true });
    },

    /**
     * Gère la saisie en temps réel dans la bulle Mémo
     * @param {Object} [options={}]
     * @param {boolean} [options.recordHistory=true]
     * @private
     */
    _handleNoteTextareaInput({ recordHistory = true } = {}) {
        const textarea = DOM.classNoteTextarea || document.getElementById('classNoteTextarea');
        if (!textarea) return;

        this._autoResizeNoteTextarea();
        const rawValue = textarea.value ?? '';
        const nextTrimmed = rawValue.trim();

        const clearBtn = DOM.clearClassNoteBtn || document.getElementById('clearClassNoteBtn');
        if (clearBtn) {
            clearBtn.style.display = nextTrimmed.length > 0 ? 'inline-flex' : 'none';
        }

        const targetId = this._noteTargetClassId || appState.currentClassId;
        const cls = ClassManager.getClassById(targetId);
        if (recordHistory && targetId) {
            const history = this._getNoteHistory(targetId, cls?.classNote || '');
            if (!this._noteTypingBurstTimer && history.lastCommitted !== rawValue) {
                this._recordNoteSnapshot(targetId, history.lastCommitted);
                this._syncNoteHistoryButtons(targetId);
            }
            if (this._noteTypingBurstTimer) {
                clearTimeout(this._noteTypingBurstTimer);
            }
            this._noteTypingBurstTimer = setTimeout(() => {
                this._noteTypingBurstTimer = null;
                history.lastCommitted = textarea.value ?? '';
            }, 600);
        }

        if (cls && !cls.isVirtual && (cls.classNote || '') !== nextTrimmed) {
            ClassManager.updateClass(targetId, {
                classNote: nextTrimmed,
                classNoteUpdatedAt: Date.now()
            });
            this.syncHeaderNoteButton();
            this._syncDropdownNoteBadge(targetId, nextTrimmed);
            this._syncNotePopoverMeta(cls);
        }
    },

    /**
     * Ouvre la bulle Mémo de la classe
     * @param {string|null} [classId=null]
     */
    openNotePopover(classId = null) {
        const popover = DOM.classNotePopover || document.getElementById('classNotePopover');
        if (!popover) return;

        const targetClass = classId ? ClassManager.getClassById(classId) : ClassManager.getCurrentClass();
        if (!targetClass || ClassManager.isVirtualClass(targetClass.id)) return;

        if (this._isDropdownOpen) {
            this.closeDropdown({ replaceNext: true });
        }

        if (this._closeNotePopoverTimer) {
            clearTimeout(this._closeNotePopoverTimer);
            this._closeNotePopoverTimer = null;
        }

        HistoryManager.pushState('classNotePopover', (options) => this.closeNotePopover(options));

        this._isNotePopoverOpen = true;
        this._noteTargetClassId = targetClass.id;

        const btn = DOM.headerClassNoteBtn || document.getElementById('headerClassNoteBtn');
        btn?.classList.add('active');
        btn?.setAttribute('aria-expanded', 'true');
        btn?._tippy?.hide?.();
        TooltipsUI?.hideAll?.();

        const currentNote = typeof targetClass.classNote === 'string' ? targetClass.classNote : '';
        const history = this._getNoteHistory(targetClass.id, currentNote);
        history.lastCommitted = currentNote;
        this._syncNoteHistoryButtons(targetClass.id);
        this._syncNotePopoverMeta(targetClass);

        const textarea = DOM.classNoteTextarea || document.getElementById('classNoteTextarea');
        if (textarea) {
            textarea.value = currentNote;
        }

        const clearBtn = DOM.clearClassNoteBtn || document.getElementById('clearClassNoteBtn');
        if (clearBtn) {
            clearBtn.style.display = currentNote.trim().length > 0 ? 'inline-flex' : 'none';
        }

        if (popover.parentElement !== document.body) {
            this._originalNotePopoverParent = popover.parentElement;
            document.body.appendChild(popover);
        }

        this._positionNotePopover();
        popover.style.display = 'flex';
        this._autoResizeNoteTextarea();
        TooltipsUI?.initTooltips?.(popover);

        void popover.offsetWidth;
        requestAnimationFrame(() => {
            if (this._isNotePopoverOpen) {
                popover.classList.add('visible');
            }
        });

        if (textarea) {
            textarea.focus({ preventScroll: true });
            if (currentNote && textarea.setSelectionRange) {
                const len = textarea.value.length;
                textarea.setSelectionRange(len, len);
            }
        }
    },

    /**
     * Ferme la bulle Mémo de la classe
     * @param {Object} [options={}]
     */
    closeNotePopover(options = {}) {
        const popover = DOM.classNotePopover || document.getElementById('classNotePopover');
        if (!popover) return;

        if (!options?.causedByHistory && this._isNotePopoverOpen) {
            HistoryManager.handleManualClose('classNotePopover', { replaceNext: Boolean(options?.replaceNext) });
        }

        if (this._noteTypingBurstTimer) {
            clearTimeout(this._noteTypingBurstTimer);
            this._noteTypingBurstTimer = null;
            if (this._noteTargetClassId) {
                const history = this._noteHistoryByClassId.get(this._noteTargetClassId);
                const textarea = DOM.classNoteTextarea || document.getElementById('classNoteTextarea');
                if (history && textarea) {
                    history.lastCommitted = textarea.value ?? '';
                }
            }
        }

        this._isNotePopoverOpen = false;
        this._noteTargetClassId = null;

        const btn = DOM.headerClassNoteBtn || document.getElementById('headerClassNoteBtn');
        btn?.classList.remove('active');
        btn?.setAttribute('aria-expanded', 'false');
        btn?.blur?.();

        popover.classList.remove('visible');
        TooltipsUI?.cleanupTooltipsIn?.(popover);

        if (this._closeNotePopoverTimer) {
            clearTimeout(this._closeNotePopoverTimer);
        }

        this._closeNotePopoverTimer = setTimeout(() => {
            this._closeNotePopoverTimer = null;
            if (!this._isNotePopoverOpen) {
                popover.style.display = 'none';
                if (this._originalNotePopoverParent && popover.parentElement === document.body) {
                    this._originalNotePopoverParent.appendChild(popover);
                    popover.style.position = '';
                    popover.style.top = '';
                    popover.style.left = '';
                    popover.style.right = '';
                    popover.style.width = '';
                    popover.style.zIndex = '';
                    this._originalNotePopoverParent = null;
                }
            }
        }, 200);
    }
};
