/**
 * @fileoverview Shared history utilities
 * Single place for history state manipulation logic
 * Used by FocusPanelHistory and AppreciationsManager
 * @module utils/HistoryUtils
 */

const MAX_VERSIONS = 10;

/**
 * Count words in a string
 * @param {string} text
 * @returns {number}
 */
function countWords(text) {
    if (!text) return 0;
    return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

/**
 * Normalize a version entry to the new object format
 * Handles backward compatibility with string-only versions
 * @param {string|Object} version - Version entry (string or object)
 * @returns {Object} Normalized version object
 */
export function normalizeVersion(version) {
    if (typeof version === 'string') {
        return { content: version, timestamp: null, source: null, wordCount: countWords(version) };
    }
    // Ensure wordCount is calculated if missing
    if (version && !version.wordCount && version.content) {
        version.wordCount = countWords(version.content);
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
    return typeof version === 'string' ? version : version.content;
}

/**
 * Get or create history state on a result object
 * @param {Object} result - The result object
 * @returns {Object} The historyState object
 */
export function getHistoryState(result) {
    if (!result.historyState) {
        result.historyState = { versions: [], currentIndex: -1 };
        if (result.appreciation) {
            result.historyState.versions.push({
                content: result.appreciation,
                timestamp: Date.now(),
                source: 'original',
                wordCount: countWords(result.appreciation)
            });
            result.historyState.currentIndex = 0;
        }
    }
    return result.historyState;
}

/**
 * Push content to history state
 * @param {Object} state - The historyState object
 * @param {string} content - Content to push
 * @param {string} [source='edit'] - Source of the change (edit, concise, detailed, encouraging, variation, regenerate)
 * @returns {boolean} True if content was added
 */
export function pushToState(state, content, source = 'edit') {
    if (!state || !content) return false;

    // Get current version content (handle both formats)
    const currentContent = getVersionContent(state.versions[state.currentIndex]);

    // Don't add if same as current version (prevents destroying future on blur after undo)
    if (currentContent === content) return false;

    // Truncate future versions if not at the end
    if (state.currentIndex >= 0 && state.currentIndex < state.versions.length - 1) {
        state.versions = state.versions.slice(0, state.currentIndex + 1);
    }

    // Get last version content
    const lastContent = getVersionContent(state.versions[state.versions.length - 1]);

    // Don't add duplicate of last
    if (lastContent === content) return false;

    // Add new version with metadata
    state.versions.push({
        content: content,
        timestamp: Date.now(),
        source: source,
        wordCount: countWords(content)
    });

    // Limit to max versions
    if (state.versions.length > MAX_VERSIONS) {
        state.versions.shift();
    }

    state.currentIndex = state.versions.length - 1;
    return true;
}

/**
 * Check if can undo
 * @param {Object} state - The historyState object
 * @returns {boolean}
 */
export function canUndo(state) {
    return state && state.currentIndex > 0;
}

/**
 * Check if can redo
 * @param {Object} state - The historyState object
 * @returns {boolean}
 */
export function canRedo(state) {
    return state && state.currentIndex < state.versions.length - 1;
}

/**
 * Move to previous version
 * @param {Object} state - The historyState object
 * @returns {string|null} The content at new index, or null if can't undo
 */
export function undo(state) {
    if (!canUndo(state)) return null;
    state.currentIndex--;
    return getVersionContent(state.versions[state.currentIndex]);
}

/**
 * Move to next version
 * @param {Object} state - The historyState object
 * @returns {string|null} The content at new index, or null if can't redo
 */
export function redo(state) {
    if (!canRedo(state)) return null;
    state.currentIndex++;
    return getVersionContent(state.versions[state.currentIndex]);
}

/**
 * Navigate to specific version
 * @param {Object} state - The historyState object
 * @param {number} index - Target index
 * @returns {string|null} The content at index, or null if invalid
 */
export function goToVersion(state, index) {
    if (!state || index < 0 || index >= state.versions.length) return null;
    state.currentIndex = index;
    return getVersionContent(state.versions[index]);
}

/**
 * Get modification count
 * @param {Object} state - The historyState object
 * @returns {number}
 */
export function getModificationCount(state) {
    return state ? Math.max(0, state.versions.length - 1) : 0;
}

/**
 * Check if history has multiple versions
 * @param {Object} state - The historyState object
 * @returns {boolean}
 */
export function hasMultipleVersions(state) {
    return state && state.versions.length > 1;
}
