/**
 * @fileoverview Shared version history utilities (SSOT)
 * Pure state manipulation for AI-assisted text version history
 * Used by FocusPanelHistory, ClassDashboardManager, MassImportManager, AppreciationsManager, ResultsUIManager & Utils
 * @module utils/HistoryUtils
 */

export const MAX_VERSIONS = 10;

/**
 * Create a fresh manual-edit coalescing session descriptor
 * @returns {{ active: boolean, editIndex: number, originIndex: number }}
 */
export function createEditSession() {
    return { active: false, editIndex: -1, originIndex: -1 };
}

/**
 * Normalize a version entry to the object format
 * Handles backward compatibility with string-only versions
 * @param {string|Object} version - Version entry (string or object)
 * @returns {Object} Normalized version object
 */
export function normalizeVersion(version) {
    let content = typeof version === 'string' ? version : version?.content || '';

    // Auto-clean any leaked HTML spans from previous bugs (clean up historical data)
    if (content.includes('reveal-word')) {
        content = content.replace(/<span[^>]*class="reveal-word"[^>]*>(.*?)<\/span>/g, '$1')
            .replace(/<span[^>]*class="reveal-cursor"[^>]*><\/span>/g, '')
            .replace(/<span class="progressive-reveal">/g, '')
            .replace(/<\/span>$/, '');
        content = content.replace(/\s+/g, ' ').trim();
    }

    if (typeof version === 'string') {
        return {
            content,
            timestamp: null,
            source: null,
            appreciationSource: null,
            aiModel: null,
            tokenUsage: null
        };
    }

    if (version) {
        version.content = content;
    }
    return version;
}

/**
 * Get content from a version (handles both formats)
 * @param {string|Object} version
 * @returns {string}
 */
export function getVersionContent(version) {
    if (!version) return '';
    return typeof version === 'string' ? version : (version.content || '');
}

/**
 * Get appreciationSource from a version entry
 * @param {string|Object} version
 * @returns {string|null}
 */
export function getVersionSource(version) {
    if (!version || typeof version === 'string') return null;
    return version.appreciationSource ?? null;
}

/**
 * Safely clone a plain object (tokenUsage, history entries)
 * @param {*} value
 * @returns {*}
 */
function cloneValue(value) {
    if (!value || typeof value !== 'object') return value ?? null;
    if (typeof structuredClone === 'function') {
        try {
            return structuredClone(value);
        } catch (_) { /* fallback below */ }
    }
    return JSON.parse(JSON.stringify(value));
}

/**
 * Push content to history state without truncating previously generated variants.
 * If an identical version already exists in the stack, jumps to it instead of duplicating.
 * @param {Object} state - The historyState object ({ versions: [], currentIndex: -1 })
 * @param {string} content - Content to push
 * @param {string} [source='edit'] - Source of the change
 * @param {string|null} [appreciationSource=null] - Appreciation source ('ai'|'manual'|'imported'|'dictation')
 * @param {string|null} [aiModel=null] - AI Model used
 * @param {Object|null} [tokenUsage=null] - Token usage data
 * @returns {boolean} True if state changed (version added or pointer moved)
 */
export function pushToState(state, content, source = 'edit', appreciationSource = null, aiModel = null, tokenUsage = null) {
    if (!state || typeof content !== 'string') return false;
    const cleanContent = content.trim();
    if (!cleanContent) return false;
    if (!Array.isArray(state.versions)) state.versions = [];

    const currentContent = getVersionContent(state.versions[state.currentIndex]).trim();
    if (currentContent === cleanContent) return false;

    // Deduplicate: if this exact text already exists in history, jump to it without duplicating
    const existingIdx = state.versions.findIndex(v => getVersionContent(v).trim() === cleanContent);
    if (existingIdx !== -1) {
        state.currentIndex = existingIdx;
        return true;
    }

    // Non-destructive append (preserves previously tried AI variants when branching from an older version)
    state.versions.push({
        content: cleanContent,
        timestamp: Date.now(),
        source,
        appreciationSource,
        aiModel,
        tokenUsage: tokenUsage ? cloneValue(tokenUsage) : null
    });

    if (state.versions.length > MAX_VERSIONS) {
        state.versions.shift();
    }

    state.currentIndex = state.versions.length - 1;
    return true;
}

/**
 * Coalesced manual-edit update for an active focus session.
 * Creates at most one 'edit' entry per focus session and updates it in-place as the user keeps typing.
 * If the user edits the text back to the exact origin version, removes the temporary edit entry.
 *
 * @param {Object} state - The historyState object
 * @param {string} content - Current edited text
 * @param {{ active: boolean, editIndex: number, originIndex: number }} [session]
 * @param {Object} [meta={}]
 * @param {string|null} [meta.appreciationSource='manual']
 * @param {string|null} [meta.aiModel=null]
 * @param {Object|null} [meta.tokenUsage=null]
 * @returns {{ changed: boolean, session: { active: boolean, editIndex: number, originIndex: number } }}
 */
export function upsertEditVersion(state, content, session = createEditSession(), meta = {}) {
    const safeSession = session && typeof session === 'object'
        ? { ...session }
        : createEditSession();

    if (!state || typeof content !== 'string') {
        return { changed: false, session: safeSession };
    }
    const cleanContent = content.trim();
    if (!cleanContent) {
        return { changed: false, session: safeSession };
    }
    if (!Array.isArray(state.versions)) state.versions = [];

    const appreciationSource = meta.appreciationSource !== undefined ? meta.appreciationSource : 'manual';
    const aiModel = meta.aiModel ?? null;
    const tokenUsage = meta.tokenUsage ? cloneValue(meta.tokenUsage) : null;

    // Case 1: Active edit session pointing to the current version -> update in-place
    if (
        safeSession.active &&
        safeSession.editIndex >= 0 &&
        safeSession.editIndex < state.versions.length &&
        state.currentIndex === safeSession.editIndex
    ) {
        // Reverted back to exact origin version -> drop temporary edit slot
        if (
            safeSession.originIndex >= 0 &&
            safeSession.originIndex < state.versions.length &&
            safeSession.originIndex !== safeSession.editIndex &&
            getVersionContent(state.versions[safeSession.originIndex]).trim() === cleanContent
        ) {
            state.versions.splice(safeSession.editIndex, 1);
            const nextIdx = safeSession.originIndex > safeSession.editIndex
                ? safeSession.originIndex - 1
                : safeSession.originIndex;
            state.currentIndex = Math.max(0, Math.min(nextIdx, state.versions.length - 1));
            return { changed: true, session: createEditSession() };
        }

        const existingEntry = normalizeVersion(state.versions[safeSession.editIndex]);
        if (existingEntry.content.trim() === cleanContent) {
            return { changed: false, session: safeSession };
        }

        existingEntry.content = cleanContent;
        existingEntry.timestamp = Date.now();
        existingEntry.source = existingEntry.source || 'edit';
        existingEntry.appreciationSource = appreciationSource;
        state.versions[safeSession.editIndex] = existingEntry;
        return { changed: true, session: safeSession };
    }

    // Case 2: Start of a new edit session
    const currentContent = getVersionContent(state.versions[state.currentIndex]).trim();
    if (currentContent === cleanContent) {
        return { changed: false, session: safeSession };
    }

    // If the typed content matches another existing version, jump directly to it
    const existingIdx = state.versions.findIndex(v => getVersionContent(v).trim() === cleanContent);
    if (existingIdx !== -1) {
        state.currentIndex = existingIdx;
        return { changed: true, session: createEditSession() };
    }

    let originIndex = state.currentIndex;
    state.versions.push({
        content: cleanContent,
        timestamp: Date.now(),
        source: 'edit',
        appreciationSource,
        aiModel,
        tokenUsage
    });

    if (state.versions.length > MAX_VERSIONS) {
        state.versions.shift();
        if (originIndex >= 0) {
            originIndex = originIndex > 0 ? originIndex - 1 : -1;
        }
    }

    const editIndex = state.versions.length - 1;
    state.currentIndex = editIndex;
    return {
        changed: true,
        session: { active: true, editIndex, originIndex }
    };
}

/**
 * Check if can undo
 * @param {Object} state - The historyState object
 * @returns {boolean}
 */
export function canUndo(state) {
    return Boolean(state && Array.isArray(state.versions) && state.currentIndex > 0);
}

/**
 * Check if can redo
 * @param {Object} state - The historyState object
 * @returns {boolean}
 */
export function canRedo(state) {
    return Boolean(state && Array.isArray(state.versions) && state.currentIndex < state.versions.length - 1);
}

/**
 * Move to previous version
 * @param {Object} state
 * @returns {Object|null}
 */
export function undo(state) {
    if (!canUndo(state)) return null;
    state.currentIndex--;
    return normalizeVersion(state.versions[state.currentIndex]);
}

/**
 * Move to next version
 * @param {Object} state
 * @returns {Object|null}
 */
export function redo(state) {
    if (!canRedo(state)) return null;
    state.currentIndex++;
    return normalizeVersion(state.versions[state.currentIndex]);
}

/**
 * Navigate to specific version
 * @param {Object} state
 * @param {number} index
 * @returns {Object|null}
 */
export function goToVersion(state, index) {
    if (!state || !Array.isArray(state.versions) || index < 0 || index >= state.versions.length) return null;
    state.currentIndex = index;
    return normalizeVersion(state.versions[index]);
}

/**
 * Get modification count
 * @param {Object} state - The historyState object
 * @returns {number}
 */
export function getModificationCount(state) {
    return state && Array.isArray(state.versions) ? Math.max(0, state.versions.length - 1) : 0;
}

/**
 * Check if history has multiple versions
 * @param {Object} state - The historyState object
 * @returns {boolean}
 */
export function hasMultipleVersions(state) {
    return Boolean(state && Array.isArray(state.versions) && state.versions.length > 1);
}

/**
 * Seed initial version if state is empty and result has an appreciation
 * @param {Object} state - The historyState object for the period
 * @param {Object} result - The result object
 * @param {string} period - The period key (e.g. 'T1')
 * @returns {boolean} True if seeded
 */
export function seedInitialVersion(state, result, period) {
    if (!state || !result || (state.versions && state.versions.length > 0)) return false;

    const periodAppreciation = result.studentData?.periods?.[period]?.appreciation?.trim()
        || (period === result.generationPeriod ? result.appreciation?.trim() : '');
    if (!periodAppreciation) return false;
    if (periodAppreciation.includes('Aucune appréciation')) return false;

    const isImported = result.appreciationSource === 'imported';
    const isAI = result.wasGenerated === true || result.appreciationSource === 'ai';
    const source = isImported ? 'imported' : (isAI ? 'original' : 'edit');
    const appreciationSource = result.appreciationSource || (isAI ? 'ai' : 'manual');
    const aiModel = result.studentData?.currentAIModel ?? null;
    const tokenUsage = result.tokenUsage ? cloneValue(result.tokenUsage) : null;

    return pushToState(state, periodAppreciation, source, appreciationSource, aiModel, tokenUsage);
}

/**
 * Single Source of Truth for resolving (and migrating) a student's period-scoped history state.
 * @param {Object|null} result - Student result object
 * @param {string} period - Period key (e.g. 'T1', 'S2')
 * @param {Object} [options={}]
 * @param {boolean} [options.createIfMissing=false]
 * @param {boolean} [options.autoSeed=true]
 * @returns {{ versions: Array, currentIndex: number }|null}
 */
export function getStudentPeriodState(result, period, { createIfMissing = false, autoSeed = true } = {}) {
    if (!result || !period) return null;

    // 1. Migrate legacy historyState → historyPerPeriod using immutable generationPeriod only
    if (result.historyState?.versions?.length > 0) {
        if (!result.historyPerPeriod) result.historyPerPeriod = {};
        const legacyPeriod = result.generationPeriod;
        if (legacyPeriod && !result.historyPerPeriod[legacyPeriod]) {
            result.historyPerPeriod[legacyPeriod] = result.historyState;
        }
        result.historyState = null;
    }

    // 2. Return existing period history, or create empty state only if requested
    if (!result.historyPerPeriod?.[period]) {
        if (createIfMissing) {
            if (!result.historyPerPeriod) result.historyPerPeriod = {};
            result.historyPerPeriod[period] = { versions: [], currentIndex: -1 };
            if (autoSeed) {
                seedInitialVersion(result.historyPerPeriod[period], result, period);
            }
            return result.historyPerPeriod[period];
        }
        return { versions: [], currentIndex: -1 };
    }

    const periodState = result.historyPerPeriod[period];
    if (!Array.isArray(periodState.versions)) periodState.versions = [];
    if (typeof periodState.currentIndex !== 'number') {
        periodState.currentIndex = periodState.versions.length - 1;
    }
    if (autoSeed) {
        seedInitialVersion(periodState, result, period);
    }
    return periodState;
}

/**
 * Record a new version into a student's period-scoped history state.
 * Call `getStudentPeriodState(result, period, { createIfMissing: true, autoSeed: true })`
 * BEFORE overwriting `result.studentData.periods[period].appreciation` when replacing an existing text.
 *
 * @param {Object} result - Student result object
 * @param {string} period - Period key
 * @param {string} content - New appreciation text
 * @param {string} [source='edit'] - Version source
 * @param {Object} [meta={}]
 * @param {boolean} [meta.autoSeed=false]
 * @param {string|null} [meta.appreciationSource]
 * @param {string|null} [meta.aiModel]
 * @param {Object|null} [meta.tokenUsage]
 * @returns {boolean} True if history changed
 */
export function recordStudentVersion(result, period, content, source = 'edit', meta = {}) {
    if (!result || !period || typeof content !== 'string') return false;
    const clean = content.trim();
    if (!clean || clean.includes('Aucune appréciation')) return false;

    const state = getStudentPeriodState(result, period, {
        createIfMissing: true,
        autoSeed: meta.autoSeed === true
    });
    if (!state) return false;

    const appreciationSource = meta.appreciationSource !== undefined
        ? meta.appreciationSource
        : (result.appreciationSource ?? null);
    const aiModel = meta.aiModel !== undefined
        ? meta.aiModel
        : (result.studentData?.currentAIModel ?? null);
    const tokenUsage = meta.tokenUsage !== undefined
        ? meta.tokenUsage
        : (result.tokenUsage ? cloneValue(result.tokenUsage) : null);

    return pushToState(state, clean, source, appreciationSource, aiModel, tokenUsage);
}

/**
 * Normalize/hydrate a generic persisted history state (e.g. Class Synthesis introHistory).
 * Ensures valid `{ versions, currentIndex }` and seeds fallbackContent if empty.
 *
 * @param {Object|Array|null|undefined} rawState
 * @param {string} [fallbackContent='']
 * @param {Object} [fallbackMeta={}]
 * @returns {{ versions: Array, currentIndex: number }}
 */
export function normalizeHistoryState(rawState, fallbackContent = '', fallbackMeta = {}) {
    const state = { versions: [], currentIndex: -1 };

    if (rawState && typeof rawState === 'object' && Array.isArray(rawState.versions)) {
        state.versions = rawState.versions
            .map(v => normalizeVersion(cloneValue(v)))
            .filter(v => v && typeof v.content === 'string' && v.content.trim().length > 0)
            .slice(-MAX_VERSIONS);
        if (state.versions.length > 0) {
            const rawIdx = typeof rawState.currentIndex === 'number'
                ? rawState.currentIndex
                : state.versions.length - 1;
            state.currentIndex = Math.max(0, Math.min(rawIdx, state.versions.length - 1));
        }
    }

    const cleanFallback = typeof fallbackContent === 'string' ? fallbackContent.trim() : '';
    if (cleanFallback) {
        if (state.versions.length === 0) {
            pushToState(
                state,
                cleanFallback,
                fallbackMeta.source || 'original',
                fallbackMeta.appreciationSource ?? 'ai',
                fallbackMeta.aiModel ?? null,
                null
            );
        } else {
            const activeContent = getVersionContent(state.versions[state.currentIndex]).trim();
            if (activeContent !== cleanFallback) {
                pushToState(
                    state,
                    cleanFallback,
                    fallbackMeta.syncSource || 'edit',
                    fallbackMeta.syncAppreciationSource ?? 'manual',
                    fallbackMeta.aiModel ?? null,
                    null
                );
            }
        }
    }

    return state;
}

/**
 * Remap period keys of a `historyPerPeriod` map when switching between Trimestres and Semestres.
 * @param {Object|null|undefined} historyPerPeriod
 * @param {(period: string) => string} mapPeriodCode
 * @returns {Object|null|undefined}
 */
export function remapHistoryPeriods(historyPerPeriod, mapPeriodCode) {
    if (!historyPerPeriod || typeof historyPerPeriod !== 'object' || typeof mapPeriodCode !== 'function') {
        return historyPerPeriod;
    }

    const remapped = {};
    for (const [period, state] of Object.entries(historyPerPeriod)) {
        const mappedKey = mapPeriodCode(period);
        const existing = remapped[mappedKey];
        const incomingCount = Array.isArray(state?.versions) ? state.versions.length : 0;
        const existingCount = Array.isArray(existing?.versions) ? existing.versions.length : 0;
        if (!existing || incomingCount > existingCount) {
            remapped[mappedKey] = state;
        }
    }
    return remapped;
}

/**
 * Merge two `historyPerPeriod` maps (keeping the richer version list per period).
 * @param {Object|null|undefined} localHistory
 * @param {Object|null|undefined} remoteHistory
 * @returns {Object|undefined}
 */
export function mergeHistoryPerPeriod(localHistory, remoteHistory) {
    if (!remoteHistory || typeof remoteHistory !== 'object') return localHistory;
    const merged = localHistory && typeof localHistory === 'object' ? { ...localHistory } : {};

    for (const [period, remoteState] of Object.entries(remoteHistory)) {
        const remoteCount = Array.isArray(remoteState?.versions) ? remoteState.versions.length : 0;
        if (remoteCount === 0) continue;
        const localCount = Array.isArray(merged[period]?.versions) ? merged[period].versions.length : 0;
        if (remoteCount >= localCount) {
            merged[period] = cloneValue(remoteState);
        }
    }
    return merged;
}
