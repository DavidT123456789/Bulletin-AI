/**
 * @fileoverview Shared Version History Stepper & Popover UI (SSOT)
 * Mutualized between FocusPanelHistory (student appreciation) and ClassDashboardManager (class synthesis intro).
 * @module utils/HistoryPopoverUI
 */

import * as HistoryUtils from './HistoryUtils.js';
import { Utils } from './Utils.js';
import { HistoryManager } from '../managers/HistoryManager.js';

/** @type {Map<string, { popover: HTMLElement, indicatorEl: HTMLElement|null, historyKey: string|null, closeHandler: Function|null, keydownHandler: Function|null, scrollHandler: Function|null, resizeHandler: Function|null, onClose: Function|null }>} */
const openPopovers = new Map();

/**
 * Update tooltip attribute and live Tippy instance if attached
 * @param {HTMLElement|null} el
 * @param {string} text
 */
function setTooltipText(el, text) {
    if (!el) return;
    el.setAttribute('data-tooltip', text);
    if (el._tippy) {
        el._tippy.setContent(text);
    }
}

/**
 * Toggle `.disabled` + `aria-disabled` without native `:disabled` so Tippy tooltips stay hoverable
 * @param {HTMLElement|null} btn
 * @param {boolean} isDisabled
 */
function setSoftDisabled(btn, isDisabled) {
    if (!btn) return;
    btn.disabled = false;
    btn.classList.toggle('disabled', Boolean(isDisabled));
    btn.setAttribute('aria-disabled', String(Boolean(isDisabled)));
}

/**
 * Get user-friendly label, icon and accent class for a history version entry
 * @param {Object} versionData
 * @param {number} index
 * @param {Object} [options={}]
 * @param {string} [options.defaultInitialSource='manual'] - Default source for index 0 when appreciationSource is omitted
 * @returns {{ title: string, icon: string, typeClass: string }}
 */
export function getVersionPresentation(versionData, index, options = {}) {
    const isOriginal = index === 0;
    const source = versionData?.source;
    let sourceType = versionData?.appreciationSource;

    if (!sourceType) {
        if (source === 'edit') sourceType = 'manual';
        else if (source === 'imported') sourceType = 'imported';
        else if (source === 'dictation') sourceType = 'dictation';
        else if (source === 'original' && options.defaultInitialSource === 'ai') sourceType = 'ai';
        else if (versionData?.aiModel || (isOriginal && versionData?.aiModel)) sourceType = 'ai';
        else sourceType = isOriginal ? (options.defaultInitialSource || 'manual') : 'manual';
    }

    if (source === 'dictation' || sourceType === 'dictation') {
        return {
            title: 'Dictée vocale',
            icon: '<iconify-icon icon="solar:microphone-3-linear"></iconify-icon>',
            typeClass: 'source-dictation'
        };
    }

    if (source === 'concise') {
        return {
            title: 'Version concise',
            icon: '<iconify-icon icon="solar:minimize-square-linear"></iconify-icon>',
            typeClass: 'source-concise'
        };
    }

    if (source === 'polish') {
        return {
            title: 'Version peaufinée',
            icon: '<iconify-icon icon="solar:stars-line-linear"></iconify-icon>',
            typeClass: 'source-polish'
        };
    }

    if (source === 'encouraging') {
        return {
            title: 'Version encourageante',
            icon: '<iconify-icon icon="solar:heart-linear"></iconify-icon>',
            typeClass: 'source-encouraging'
        };
    }

    if (source === 'demanding') {
        return {
            title: 'Version exigeante',
            icon: '<iconify-icon icon="solar:target-linear"></iconify-icon>',
            typeClass: 'source-demanding'
        };
    }

    if (source === 'regenerate') {
        return {
            title: 'Régénération IA',
            icon: '<iconify-icon icon="solar:stars-line-duotone"></iconify-icon>',
            typeClass: 'source-ai'
        };
    }

    if (sourceType === 'ai') {
        return {
            title: isOriginal ? 'Génération initiale' : 'Génération IA',
            icon: '<iconify-icon icon="solar:stars-line-duotone"></iconify-icon>',
            typeClass: 'source-ai'
        };
    }

    if (sourceType === 'imported' || source === 'imported') {
        return {
            title: 'Texte importé',
            icon: '<iconify-icon icon="solar:file-download-linear"></iconify-icon>',
            typeClass: 'source-imported'
        };
    }

    if (isOriginal) {
        return {
            title: 'Version initiale',
            icon: '<iconify-icon icon="solar:document-text-linear"></iconify-icon>',
            typeClass: 'source-initial'
        };
    }

    return {
        title: 'Modifié à la main',
        icon: '<iconify-icon icon="solar:pen-linear"></iconify-icon>',
        typeClass: 'source-manual'
    };
}

/**
 * Format a timestamp as relative time in French
 * @param {number|null|undefined} timestamp - Unix timestamp in milliseconds
 * @returns {string}
 */
export function formatRelativeTime(timestamp) {
    if (!timestamp) return '';

    const diff = Date.now() - timestamp;

    if (diff < 60 * 1000) {
        return "à l'instant";
    }

    if (diff < 60 * 60 * 1000) {
        const minutes = Math.floor(diff / (60 * 1000));
        return `il y a ${minutes} min`;
    }

    if (diff < 24 * 60 * 60 * 1000) {
        const hours = Math.floor(diff / (60 * 60 * 1000));
        return `il y a ${hours}h`;
    }

    if (diff < 7 * 24 * 60 * 60 * 1000) {
        const days = Math.floor(diff / (24 * 60 * 60 * 1000));
        return `il y a ${days}j`;
    }

    const date = new Date(timestamp);
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

/**
 * Build standard stepper pill HTML (`< x/y >`) matching `#historyNavigationGroup`
 * @param {Object} [options={}]
 * @param {string} [options.groupClass='']
 * @param {string} [options.prevAction='']
 * @param {string} [options.indicatorAction='']
 * @param {string} [options.nextAction='']
 * @returns {string}
 */
export function buildStepperHTML({
    groupClass = '',
    prevAction = '',
    indicatorAction = '',
    nextAction = ''
} = {}) {
    const extraClass = groupClass ? ` ${groupClass}` : '';
    const prevAttr = prevAction ? ` data-action="${prevAction}"` : '';
    const indAttr = indicatorAction ? ` data-action="${indicatorAction}"` : '';
    const nextAttr = nextAction ? ` data-action="${nextAction}"` : '';

    return `
        <div class="history-navigation-group${extraClass}" style="display: none;">
            <button type="button" class="history-nav-btn disabled tooltip"${prevAttr}
                data-tooltip="Version précédente (Ctrl+Z)" aria-label="Version précédente" aria-disabled="true">
                <iconify-icon icon="solar:alt-arrow-left-linear" aria-hidden="true"></iconify-icon>
            </button>
            <button type="button" class="history-indicator-btn tooltip"${indAttr}
                data-tooltip="Historique des versions" aria-label="Historique des versions">
                <span class="history-count">0</span>
            </button>
            <button type="button" class="history-nav-btn disabled tooltip"${nextAttr}
                data-tooltip="Version suivante (Ctrl+Y/Shift+Z)" aria-label="Version suivante" aria-disabled="true">
                <iconify-icon icon="solar:alt-arrow-right-linear" aria-hidden="true"></iconify-icon>
            </button>
        </div>
    `;
}

/**
 * Synchronize stepper pill visibility, version counter, tooltips and soft-disabled states.
 * Shows the pill whenever `total > 1` OR when the editor was cleared while `total === 1` (recovery safety net).
 *
 * @param {Object} config
 * @param {HTMLElement|null} config.groupEl
 * @param {HTMLElement|null} config.prevBtn
 * @param {HTMLElement|null} config.indicatorBtn
 * @param {HTMLElement|null} config.nextBtn
 * @param {Object|null} config.state - `{ versions, currentIndex }`
 * @param {boolean} [config.isCurrentlyEmpty=false]
 * @param {boolean} [config.isBusy=false]
 * @param {Function|null} [config.onHide=null]
 */
export function syncStepperUI({
    groupEl,
    prevBtn,
    indicatorBtn,
    nextBtn,
    state,
    isCurrentlyEmpty = false,
    isBusy = false,
    onHide = null
}) {
    if (!groupEl || !indicatorBtn) return;

    const total = Array.isArray(state?.versions) ? state.versions.length : 0;
    const current = total > 0 ? Math.max(0, state.currentIndex ?? 0) + 1 : 0;
    const shouldShow = total > 1 || (total === 1 && isCurrentlyEmpty);

    if (shouldShow) {
        groupEl.style.display = 'inline-flex';
        groupEl.classList.toggle('is-busy', Boolean(isBusy));

        const countEl = indicatorBtn.querySelector('.history-count');
        if (countEl) {
            countEl.textContent = isCurrentlyEmpty ? `0/${total}` : `${current}/${total}`;
        }

        const indicatorTooltip = isCurrentlyEmpty
            ? "Texte effacé • Cliquez pour restaurer une version"
            : `Version ${current} sur ${total} • Cliquez pour l'historique`;
        setTooltipText(indicatorBtn, indicatorTooltip);
        setSoftDisabled(indicatorBtn, isBusy);

        const canStepBack = HistoryUtils.canUndo(state) || isCurrentlyEmpty;
        const canStepForward = !isCurrentlyEmpty && HistoryUtils.canRedo(state);

        setSoftDisabled(prevBtn, isBusy || !canStepBack);
        setSoftDisabled(nextBtn, isBusy || !canStepForward);

        if (prevBtn) {
            setTooltipText(
                prevBtn,
                isCurrentlyEmpty ? 'Restaurer la version précédente (Ctrl+Z)' : 'Version précédente (Ctrl+Z)'
            );
        }
    } else {
        groupEl.style.display = 'none';
        groupEl.classList.remove('is-busy');
        indicatorBtn.classList.remove('active');
        onHide?.();
    }
}

/**
 * Close an open history popover by ID
 * @param {string} popoverId
 * @param {Object} [options={}]
 * @param {boolean} [options.causedByHistory=false]
 * @param {boolean} [options.silentHistory=false]
 */
export function closePopover(popoverId, options = {}) {
    const entry = openPopovers.get(popoverId);
    if (entry) {
        openPopovers.delete(popoverId);
        if (entry.closeHandler) {
            document.removeEventListener('click', entry.closeHandler);
        }
        if (entry.keydownHandler) {
            document.removeEventListener('keydown', entry.keydownHandler, true);
        }
        if (entry.scrollHandler) {
            window.removeEventListener('scroll', entry.scrollHandler, true);
        }
        if (entry.resizeHandler) {
            window.removeEventListener('resize', entry.resizeHandler);
        }
        entry.indicatorEl?.classList.remove('active');
        if (entry.popover?.isConnected) {
            entry.popover.remove();
        }
        if (!options?.causedByHistory && !options?.silentHistory && entry.historyKey && HistoryManager.isOpen(entry.historyKey)) {
            HistoryManager.handleManualClose(entry.historyKey);
        }
        entry.onClose?.();
        return;
    }

    // Fallback cleanup if DOM node exists outside map
    const existing = document.getElementById(popoverId);
    if (existing) {
        existing.remove();
    }
}

/**
 * Close all open history popovers (e.g. before opening another one)
 * @param {Object} [options={}]
 */
export function closeAllPopovers(options = {}) {
    for (const id of [...openPopovers.keys()]) {
        closePopover(id, options);
    }
}

/**
 * Open (or toggle closed) the shared version history popover anchored to `indicatorEl`.
 * @param {Object} config
 * @param {string} config.popoverId - DOM ID (e.g. 'historyPopover' or 'synthesisHistoryPopover')
 * @param {string} config.historyKey - HistoryManager key (e.g. 'focusHistoryPopover')
 * @param {HTMLElement|null} config.indicatorEl - Anchor element
 * @param {Object|null} config.state - `{ versions, currentIndex }`
 * @param {boolean} [config.isCurrentlyEmpty=false]
 * @param {(index: number) => void} config.onSelectVersion
 * @param {Function|null} [config.onClose=null]
 * @param {Function|null} [config.bindScrollAffordances=null]
 * @param {Object} [config.presentationOptions={}]
 * @returns {boolean} True if opened, false if toggled closed or unavailable
 */
export function togglePopover({
    popoverId,
    historyKey,
    indicatorEl,
    state,
    isCurrentlyEmpty = false,
    onSelectVersion,
    onClose = null,
    bindScrollAffordances = null,
    presentationOptions = {}
}) {
    if (document.getElementById(popoverId)) {
        closePopover(popoverId);
        return false;
    }

    const total = Array.isArray(state?.versions) ? state.versions.length : 0;
    const canShowPopover = total > 1 || (total === 1 && isCurrentlyEmpty);
    if (!canShowPopover) return false;

    // Close any other history popover before opening this one
    closeAllPopovers();

    indicatorEl?._tippy?.hide?.();
    indicatorEl?.classList.add('active');

    const popover = document.createElement('div');
    popover.id = popoverId;
    popover.className = 'history-popover';
    popover.setAttribute('role', 'dialog');
    popover.setAttribute('aria-label', 'Historique des versions');

    let html = '<div class="history-popover-title"><iconify-icon icon="solar:history-linear" aria-hidden="true"></iconify-icon> Historique des versions</div>';
    html += '<div class="history-popover-list">';

    for (let i = state.versions.length - 1; i >= 0; i--) {
        const versionData = HistoryUtils.normalizeVersion(state.versions[i]);
        const content = versionData.content;
        const isCurrent = !isCurrentlyEmpty && i === state.currentIndex;
        const presentation = getVersionPresentation(versionData, i, presentationOptions);
        const wordCount = Utils.countWords(content);
        const metaParts = [];
        if (wordCount > 0) metaParts.push(`${wordCount} ${wordCount > 1 ? 'mots' : 'mot'}`);
        if (versionData.timestamp) metaParts.push(formatRelativeTime(versionData.timestamp));
        const timeHtml = metaParts.length > 0
            ? `<span class="history-time">${metaParts.join(' · ')}</span>`
            : '';
        const currentBadgeHtml = isCurrent ? '<span class="history-badge-current">Actuelle</span>' : '';
        const escapedContent = Utils.escapeHtml(content);

        html += `
            <button type="button" class="history-version-item${isCurrent ? ' current' : ''}" data-index="${i}"${isCurrent ? ' aria-current="true"' : ''}>
                <div class="history-version-header">
                    <div class="history-version-title-group">
                        <span class="history-source-icon ${presentation.typeClass}" aria-hidden="true">
                            ${presentation.icon}
                        </span>
                        <span class="history-version-label">${presentation.title}</span>
                        ${currentBadgeHtml}
                    </div>
                    ${timeHtml}
                </div>
                <span class="history-version-preview">${escapedContent}</span>
            </button>
        `;
    }

    html += '</div>';
    popover.innerHTML = html;

    document.body.appendChild(popover);

    const listEl = popover.querySelector('.history-popover-list');
    if (indicatorEl) {
        const anchorEl = indicatorEl.closest?.('.history-navigation-group') || indicatorEl;
        const rect = anchorEl.getBoundingClientRect();
        const viewportW = window.innerWidth || 1024;
        const viewportH = window.innerHeight || 768;
        const spaceBelow = viewportH - rect.bottom - 20;
        const spaceAbove = rect.top - 20;
        const titleHeight = 46;

        popover.style.position = 'fixed';
        const placeAbove = spaceAbove > spaceBelow;
        popover.classList.toggle('place-above', placeAbove);

        if (viewportW <= 440) {
            popover.style.left = '12px';
            popover.style.right = '12px';
            popover.style.minWidth = '0';
            popover.style.maxWidth = 'none';
            popover.style.transformOrigin = placeAbove ? 'bottom center' : 'top center';
        } else {
            const popoverWidth = popover.offsetWidth || 340;
            const anchorCenterX = rect.left + rect.width / 2;
            const idealLeft = anchorCenterX - popoverWidth / 2;
            const clampedLeft = Math.max(12, Math.min(idealLeft, viewportW - popoverWidth - 12));
            popover.style.left = `${Math.round(clampedLeft)}px`;

            const originX = Math.round(Math.max(16, Math.min(popoverWidth - 16, anchorCenterX - clampedLeft)));
            popover.style.transformOrigin = `${originX}px ${placeAbove ? 'bottom' : 'top'}`;
        }

        if (placeAbove) {
            popover.style.bottom = `${viewportH - rect.top + 8}px`;
        } else {
            popover.style.top = `${rect.bottom + 8}px`;
        }

        const availableSpace = placeAbove ? spaceAbove : spaceBelow;
        if (listEl) {
            const maxListHeight = Math.min(400, Math.max(150, availableSpace - titleHeight));
            listEl.style.maxHeight = `${maxListHeight}px`;
        }
    }

    const record = {
        popover,
        indicatorEl: indicatorEl || null,
        historyKey: historyKey || null,
        closeHandler: null,
        keydownHandler: null,
        scrollHandler: null,
        resizeHandler: null,
        onClose
    };
    openPopovers.set(popoverId, record);

    const keydownHandler = (e) => {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        e.stopPropagation();
        const shouldRestoreFocus = popover.contains(document.activeElement);
        closePopover(popoverId);
        if (shouldRestoreFocus) {
            indicatorEl?.focus?.();
        }
    };
    record.keydownHandler = keydownHandler;
    document.addEventListener('keydown', keydownHandler, true);

    if (historyKey) {
        HistoryManager.pushState(historyKey, (opts) => closePopover(popoverId, opts));
    }

    if (listEl) {
        if (typeof bindScrollAffordances === 'function') {
            bindScrollAffordances(listEl);
        } else {
            const syncListScrims = () => {
                const maxScroll = Math.max(0, listEl.scrollHeight - listEl.clientHeight);
                listEl.classList.toggle('can-scroll-top', maxScroll > 4 && listEl.scrollTop > 4);
                listEl.classList.toggle('can-scroll-bottom', maxScroll > 4 && (maxScroll - listEl.scrollTop) > 4);
            };
            listEl.addEventListener('scroll', syncListScrims, { passive: true });
            if (typeof requestAnimationFrame === 'function') {
                requestAnimationFrame(syncListScrims);
            } else {
                syncListScrims();
            }
        }
    }

    popover.querySelectorAll('.history-version-item').forEach(item => {
        item.addEventListener('click', () => {
            const idx = parseInt(item.dataset.index, 10);
            onSelectVersion?.(idx);
            closePopover(popoverId);
        });
    });

    const scrollHandler = (e) => {
        if (e.target && popover.contains(e.target)) return;
        closePopover(popoverId);
    };
    const resizeHandler = () => closePopover(popoverId);
    record.scrollHandler = scrollHandler;
    record.resizeHandler = resizeHandler;
    window.addEventListener('scroll', scrollHandler, { capture: true, passive: true });
    window.addEventListener('resize', resizeHandler, { passive: true });

    setTimeout(() => {
        if (!document.body.contains(popover) || openPopovers.get(popoverId) !== record) return;
        const closeHandler = (e) => {
            if (!popover.contains(e.target) && !indicatorEl?.contains(e.target)) {
                closePopover(popoverId);
            }
        };
        record.closeHandler = closeHandler;
        document.addEventListener('click', closeHandler);
    }, 100);

    return true;
}
