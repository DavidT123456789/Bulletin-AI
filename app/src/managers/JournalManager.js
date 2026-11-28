/**
 * @fileoverview Journal de Bord Manager - Observation notes for students
 * Captures teacher notes (tags + text) throughout the term for AI synthesis
 * @module managers/JournalManager
 */

import { appState } from '../state/State.js';
import { StorageManager } from './StorageManager.js';
import { FocusPanelStatus } from './FocusPanelStatus.js';
import { Utils } from '../utils/Utils.js';
import { bus, EVENTS } from '../core/EventBus.js';

/**
 * Predefined tags for quick observation categorization
 * @constant {Array<{id: string, label: string, promptLabel?: string, icon: string, color: string, ink: string, category: string}>}
 */
const PREDEFINED_TAGS = [
    // POSITIF (vert) - 4 items
    { id: 'participation+', label: 'Participe', icon: 'solar:hand-shake-linear', color: 'var(--success-color)', ink: 'var(--success-text)', category: 'positive' },
    { id: 'travail+', label: 'Travail sérieux', icon: 'solar:book-2-linear', color: 'var(--success-color)', ink: 'var(--success-text)', category: 'positive' },
    { id: 'progres', label: 'Progrès', icon: 'solar:graph-up-linear', color: 'var(--success-color)', ink: 'var(--success-text)', category: 'positive' },
    { id: 'attitude+', label: 'Attitude +', promptLabel: 'Attitude positive', icon: 'solar:smile-circle-linear', color: 'var(--success-color)', ink: 'var(--success-text)', category: 'positive' },
    // NÉGATIF (rouge) - 4 items
    { id: 'bavardage', label: 'Bavardage', icon: 'solar:chat-round-dots-linear', color: 'var(--error-color)', ink: 'var(--error-text)', category: 'negative' },
    { id: 'travail-', label: 'Travail insuffisant', icon: 'solar:notebook-linear', color: 'var(--error-color)', ink: 'var(--error-text)', category: 'negative' },
    { id: 'oubli', label: 'Oubli d\'affaires', icon: 'solar:bag-linear', color: 'var(--error-color)', ink: 'var(--error-text)', category: 'negative' },
    { id: 'attitude-', label: 'Attitude -', promptLabel: 'Attitude à revoir', icon: 'solar:sad-circle-linear', color: 'var(--error-color)', ink: 'var(--error-text)', category: 'negative' },
    // NEUTRE (orange/gris) - 2 direct buttons
    { id: 'difficulte', label: 'Difficulté', icon: 'solar:danger-triangle-linear', color: 'var(--warning-color)', ink: 'var(--warning-text)', category: 'neutral' },
    { id: 'remarque', label: 'Remarque', icon: 'solar:chat-square-linear', color: 'var(--text-secondary)', ink: 'var(--text-secondary)', category: 'neutral' }
];

/**
 * Journal entry structure
 * @typedef {Object} JournalEntry
 * @property {string} id - Unique entry ID
 * @property {string} date - ISO date string
 * @property {string[]} tags - Array of tag IDs
 * @property {string} note - Short text note (optional, max 280 chars)
 * @property {string} period - Period when entry was made (T1, T2, T3)
 */

/**
 * JournalManager module
 * @namespace JournalManager
 */
export const JournalManager = {
    /** Available tags */
    tags: PREDEFINED_TAGS,

    /**
     * Initialize the journal manager
     */
    init() {
        // Nothing to initialize for now
    },

    /**
     * Generate a unique ID for entries
     * @private
     * @returns {string}
     */
    _generateId() {
        return `j_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    },

    /**
     * Get journal entries for a student
     * @param {string} studentId - Student ID
     * @returns {JournalEntry[]} Array of journal entries
     */
    getEntries(studentId) {
        if (!studentId) return [];

        const student = appState.generatedResults?.find(s => s.id === studentId);
        if (!student) return [];

        return student.journal || [];
    },

    /**
     * Get entries for a specific period
     * @param {string} studentId - Student ID
     * @param {string} period - Period (T1, T2, T3)
     * @returns {JournalEntry[]}
     */
    getEntriesForPeriod(studentId, period) {
        const entries = this.getEntries(studentId);
        return entries.filter(e => e.period === period);
    },

    /**
     * Add a new journal entry for a student
     * @param {string} studentId - Student ID
     * @param {Object} entryData - Entry data
     * @param {string[]} entryData.tags - Array of tag IDs
     * @param {string} [entryData.note] - Optional note text
     * @param {boolean} [entryData.isPrivate=false] - Exclude entry from AI synthesis (personal reminder)
     * @returns {JournalEntry|null} Created entry or null if failed
     */
    addEntry(studentId, { tags = [], note = '', isPrivate = false }) {
        const trimmedNote = (note || '').trim().slice(0, 280);
        let finalTags = Array.isArray(tags) ? [...tags] : [];

        // If no tags specified but note is provided, automatically categorize as 'remarque'
        if (finalTags.length === 0 && trimmedNote.length > 0) {
            finalTags = ['remarque'];
        }

        if (!studentId || (finalTags.length === 0 && trimmedNote.length === 0)) {
            console.warn('[JournalManager] Invalid entry data: studentId, tags or note required');
            return null;
        }

        const studentIndex = appState.generatedResults?.findIndex(s => s.id === studentId);
        if (studentIndex === -1 || studentIndex === undefined) {
            console.warn('[JournalManager] Student not found:', studentId);
            return null;
        }

        // Create entry
        const now = Date.now();
        const entry = {
            id: this._generateId(),
            date: new Date().toISOString(),
            tags: finalTags,
            note: trimmedNote,
            period: appState.currentPeriod || 'T1',
            ...(isPrivate ? { isPrivate: true } : {}),
            _lastModified: now // For sync conflict resolution
        };

        // Initialize journal array if doesn't exist
        if (!appState.generatedResults[studentIndex].journal) {
            appState.generatedResults[studentIndex].journal = [];
        }

        // Add entry
        appState.generatedResults[studentIndex].journal.push(entry);

        // Persist to storage
        StorageManager.saveAppState();

        // Trigger status refresh to detect dirty state
        FocusPanelStatus.refreshAppreciationStatus({ dirtyOnly: true });
        bus.emit(EVENTS.JOURNAL_UPDATED, { studentId });

        return entry;
    },

    /**
     * Delete a journal entry
     * @param {string} studentId - Student ID
     * @param {string} entryId - Entry ID to delete
     * @returns {boolean} Success
     */
    deleteEntry(studentId, entryId) {
        const studentIndex = appState.generatedResults?.findIndex(s => s.id === studentId);
        if (studentIndex === -1 || studentIndex === undefined) return false;

        const journal = appState.generatedResults[studentIndex].journal;
        if (!journal) return false;

        const entryIndex = journal.findIndex(e => e.id === entryId);
        if (entryIndex === -1) return false;

        journal.splice(entryIndex, 1);
        StorageManager.saveAppState();

        // Trigger status refresh to detect dirty state
        FocusPanelStatus.refreshAppreciationStatus({ dirtyOnly: true });
        bus.emit(EVENTS.JOURNAL_UPDATED, { studentId });

        return true;
    },

    /**
     * Get a specific journal entry
     * @param {string} studentId
     * @param {string} entryId
     * @returns {JournalEntry|null}
     */
    getEntry(studentId, entryId) {
        const entries = this.getEntries(studentId);
        return entries.find(e => e.id === entryId) || null;
    },

    /**
     * Update a journal entry
     * @param {string} studentId
     * @param {string} entryId
     * @param {Object} updates - { tags, note, isPrivate }
     * @returns {JournalEntry|null} Updated entry or null
     */
    updateEntry(studentId, entryId, { tags, note, isPrivate }) {
        const studentIndex = appState.generatedResults?.findIndex(s => s.id === studentId);
        if (studentIndex === -1 || studentIndex === undefined) return null;

        const journal = appState.generatedResults[studentIndex].journal;
        if (!journal) return null;

        const entry = journal.find(e => e.id === entryId);
        if (!entry) return null;

        // Apply updates
        let finalTags = tags !== undefined ? (Array.isArray(tags) ? [...tags] : []) : entry.tags;
        const trimmedNote = note !== undefined ? note.trim().slice(0, 280) : entry.note;

        // If all tags removed but note remains, default to 'remarque'
        if (finalTags.length === 0 && trimmedNote.length > 0) {
            finalTags = ['remarque'];
        }

        entry.tags = finalTags;
        entry.note = trimmedNote;
        if (isPrivate !== undefined) {
            if (isPrivate) {
                entry.isPrivate = true;
            } else {
                delete entry.isPrivate;
            }
        }
        entry._lastModified = Date.now(); // Update timestamp for sync

        StorageManager.saveAppState();

        // Trigger status refresh to detect dirty state
        FocusPanelStatus.refreshAppreciationStatus({ dirtyOnly: true });
        bus.emit(EVENTS.JOURNAL_UPDATED, { studentId });

        return entry;
    },

    /**
     * Count tags for a student (for synthesis)
     * @param {string|JournalEntry[]} studentId - Student ID or entries array
     * @param {string|null} [period] - Optional period filter
     * @param {Object} [options={}]
     * @param {boolean} [options.excludePrivate=false] - Ignore private entries
     * @returns {Object} Tag counts { tagId: count }
     */
    countTags(studentId, period = null, { excludePrivate = false } = {}) {
        const entries = Array.isArray(studentId) ? studentId : (period
            ? this.getEntriesForPeriod(studentId, period)
            : this.getEntries(studentId));

        const counts = {};
        entries.forEach(entry => {
            if (excludePrivate && entry?.isPrivate === true) return;
            if (Array.isArray(entry?.tags)) {
                entry.tags.forEach(tagId => {
                    counts[tagId] = (counts[tagId] || 0) + 1;
                });
            }
        });

        return counts;
    },

    /**
     * Get aggregated tag counts by icon/color for header display
     * @param {string} studentId
     * @param {string|null} period
     * @param {Object} [options={}]
     * @param {boolean} [options.excludePrivate=false] - Ignore private entries
     * @param {boolean} [options.excludeRemarque=false] - Exclude technical fallback tag 'remarque'
     * @returns {Array<{id: string, icon: string, color: string, ink: string, count: number, label: string, promptLabel: string}>}
     */
    getAggregatedCounts(studentId, period = null, options = {}) {
        const { excludeRemarque = false } = options;
        const tagCounts = this.countTags(studentId, period, options);

        const aggregated = [];
        Object.entries(tagCounts).forEach(([tagId, count]) => {
            if (excludeRemarque && tagId === 'remarque') return;
            if (count > 0) {
                const tag = this.getTag(tagId);
                if (tag) {
                    aggregated.push({
                        id: tagId,
                        icon: tag.icon,
                        color: tag.color,
                        ink: tag.ink,
                        count: count,
                        label: tag.label,
                        promptLabel: tag.promptLabel || tag.label
                    });
                }
            }
        });

        // Sort by count desc
        return aggregated.sort((a, b) => b.count - a.count);
    },

    /**
     * Resolve a journal AI transmission channel flag for a class (or globally),
     * with backward-compatible fallback on legacy `journalIncludeInAI`.
     * @param {'journalIncludeNotes'|'journalIncludeTags'} key
     * @param {string|null} [classId=null]
     * @returns {boolean}
     * @private
     */
    _isChannelIncludedInAI(key, classId = null) {
        const targetClassId = classId || appState.currentClassId;
        if (targetClassId) {
            const classObj = appState.classes?.find(c => c.id === targetClassId);
            if (classObj) {
                if (classObj[key] !== undefined) return classObj[key] !== false;
                if (classObj.journalIncludeInAI !== undefined) return classObj.journalIncludeInAI !== false;
            }
        }
        if (appState[key] !== undefined) return appState[key] !== false;
        return appState.journalIncludeInAI !== false;
    },

    /**
     * Check whether written journal observations are transmitted to AI for a class (or globally).
     * @param {string|null} [classId=null] - Optional class ID
     * @returns {boolean} True if written notes are included in AI prompts (default true)
     */
    isNotesIncludedInAI(classId = null) {
        return this._isChannelIncludedInAI('journalIncludeNotes', classId);
    },

    /**
     * Check whether journal tags are transmitted to AI for a class (or globally).
     * @param {string|null} [classId=null] - Optional class ID
     * @returns {boolean} True if tags are included in AI prompts (default true)
     */
    isTagsIncludedInAI(classId = null) {
        return this._isChannelIncludedInAI('journalIncludeTags', classId);
    },

    /**
     * Check whether at least one journal channel (notes or tags) is transmitted to AI.
     * When false, the journal works as a purely personal notepad (Hors IA).
     * @param {string|null} [classId=null] - Optional class ID
     * @returns {boolean} True if notes or tags are included in AI prompts (default true)
     */
    isIncludedInAI(classId = null) {
        return this.isNotesIncludedInAI(classId) || this.isTagsIncludedInAI(classId);
    },

    /**
     * Resolve period journal entries and classId for a student ID or student object
     * @param {string|Object} studentOrId - Student ID or student object ({ id, classId, journal })
     * @param {string|null} [period=null] - Period filter
     * @returns {{entries: JournalEntry[], classId: string|null}}
     * @private
     */
    _resolveStudentPeriodEntries(studentOrId, period = null) {
        const targetPeriod = period || appState.currentPeriod;
        const isObj = Boolean(studentOrId && typeof studentOrId === 'object');
        const studentId = isObj ? studentOrId.id : studentOrId;
        const studentInState = studentId ? appState.generatedResults?.find(s => s.id === studentId) : null;
        const rawEntries = isObj && Array.isArray(studentOrId.journal)
            ? studentOrId.journal
            : (isObj && Array.isArray(studentOrId.studentData?.journal)
                ? studentOrId.studentData.journal
                : (studentInState?.journal || []));
        const entries = rawEntries.filter(e => e && (!e.period || e.period === targetPeriod));
        const classId = (isObj ? studentOrId.classId : null) || studentInState?.classId || null;
        return { entries, classId };
    },

    /**
     * Get recurrent tag IDs for class-wide trend aggregation (e.g., ClassDashboardManager).
     * Uses an internal recurrence floor (default 2) and excludes private entries.
     * @param {string|Object} studentOrId - Student ID or student object
     * @param {string|null} [period=null] - Optional period filter
     * @param {Object} [options={}]
     * @param {number} [options.minCount=2] - Minimum occurrences to qualify as a class trend
     * @returns {string[]} Array of recurrent tag IDs sorted by frequency
     */
    getSignificantTagIds(studentOrId, period = null, { minCount = 2 } = {}) {
        const { entries, classId } = this._resolveStudentPeriodEntries(studentOrId, period);
        const aiEntries = entries.filter(e => !e.isPrivate);
        if (aiEntries.length === 0 || !this.isTagsIncludedInAI(classId)) return [];
        const tagCounts = this.countTags(aiEntries);
        return Object.entries(tagCounts)
            .filter(([tagId, count]) => tagId !== 'remarque' && count >= minCount)
            .sort((a, b) => b[1] - a[1])
            .map(([tagId]) => tagId);
    },

    /**
     * Check whether a journal entry contains a non-empty written note
     * @param {Object|null|undefined} entry
     * @returns {boolean}
     * @private
     */
    _hasWrittenNote(entry) {
        return typeof entry?.note === 'string' && entry.note.trim().length > 0;
    },

    /**
     * Build structured AI synthesis summary for UI transparency and prompt injection (SSOT).
     * Independently respects `includeNotes` and `includeTags`, excludes private entries and technical
     * fallback tag 'remarque', formats tags with their frequency `(N×)`, and caps written notes to 12 / 1200 chars.
     * @param {string|Object} studentOrId - Student ID or student object
     * @param {string|null} [period=null] - Optional period filter
     * @returns {{ includedInAI: boolean, includeNotes: boolean, includeTags: boolean, tags: Array<{id: string, label: string, count: number, formattedLabel: string}>, notes: Array<{text: string, extraTagLabels: string[], uiTagLabels: string[]}>, standaloneLabels: string[], transmittedTagIds: string[], transmittedCount: number, privateCount: number, totalCount: number, displayText: string, compactText: string }}
     */
    getAISummary(studentOrId, period = null) {
        const { entries, classId } = this._resolveStudentPeriodEntries(studentOrId, period);
        const includeNotes = this.isNotesIncludedInAI(classId);
        const includeTags = this.isTagsIncludedInAI(classId);
        const includedInAI = includeNotes || includeTags;
        const privateCount = entries.filter(e => e.isPrivate === true).length;
        const totalCount = entries.length;

        if (!includedInAI) {
            return {
                includedInAI: false,
                includeNotes: false,
                includeTags: false,
                tags: [],
                notes: [],
                standaloneLabels: [],
                transmittedTagIds: [],
                transmittedCount: 0,
                privateCount,
                totalCount,
                displayText: '',
                compactText: ''
            };
        }

        const aiEntries = entries.filter(e => !e.isPrivate);
        const tagCounts = {};
        const tagOnlyCounts = {};
        const writtenEntries = [];

        for (const entry of aiEntries) {
            const hasNote = this._hasWrittenNote(entry);
            if (hasNote) writtenEntries.push(entry);
            if (Array.isArray(entry.tags)) {
                for (const tagId of entry.tags) {
                    tagCounts[tagId] = (tagCounts[tagId] || 0) + 1;
                    if (!hasNote) tagOnlyCounts[tagId] = (tagOnlyCounts[tagId] || 0) + 1;
                }
            }
        }

        const tags = includeTags
            ? Object.entries(tagCounts)
                .filter(([tagId, count]) => tagId !== 'remarque' && count > 0)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([tagId, count]) => {
                    const label = this.getPromptLabel(tagId);
                    return {
                        id: tagId,
                        label,
                        count,
                        formattedLabel: `${label} (${count}×)`
                    };
                })
            : [];

        // Standalone tags: when notes are also active, tags that only appear once on a single written note
        // are attached directly to that note as "[Label (1×)]" to avoid repeating the same tag twice.
        const standaloneTags = includeNotes
            ? tags.filter(t => t.count >= 2 || (tagOnlyCounts[t.id] || 0) > 0)
            : tags;
        const standaloneTagSet = new Set(standaloneTags.map(t => t.id));
        const transmittedTagIdSet = new Set(tags.map(t => t.id));

        const rawNotes = includeNotes ? writtenEntries.slice(-12) : [];
        const notes = [];
        const noteDisplayParts = [];
        const includedNoteEntries = new Set();
        let totalNoteChars = 0;

        for (let i = rawNotes.length - 1; i >= 0; i--) {
            const e = rawNotes[i];
            const text = e.note.trim();
            if (notes.length > 0 && totalNoteChars + text.length > 1200) break;
            totalNoteChars += text.length;
            includedNoteEntries.add(e);

            const explicitTagIds = includeTags
                ? (Array.isArray(e.tags) ? e.tags : []).filter(tagId => tagId && tagId !== 'remarque')
                : [];
            const extraTagLabels = [];

            for (const tagId of explicitTagIds) {
                transmittedTagIdSet.add(tagId);
                if (!standaloneTagSet.has(tagId)) {
                    const count = tagCounts[tagId] || 1;
                    extraTagLabels.push(`${this.getPromptLabel(tagId)} (${count}×)`);
                }
            }

            notes.unshift({ text, extraTagLabels, uiTagLabels: extraTagLabels });
            const short = text.length > 42 ? `${text.slice(0, 42).trimEnd()}…` : text;
            noteDisplayParts.unshift(
                extraTagLabels.length > 0 ? `${extraTagLabels.join(', ')} : « ${short} »` : `« ${short} »`
            );
        }

        const standaloneLabels = standaloneTags.map(t => t.formattedLabel);
        const transmittedCount = aiEntries.filter(e =>
            includedNoteEntries.has(e) ||
            (includeTags && Array.isArray(e.tags) && e.tags.some(tagId => transmittedTagIdSet.has(tagId)))
        ).length;
        const transmittedTagCount = includeTags ? transmittedTagIdSet.size : 0;
        const writtenCount = notes.length;

        let compactText = '';
        if (transmittedTagCount > 0 && writtenCount > 0) {
            const tagPart = `${transmittedTagCount} tag${transmittedTagCount > 1 ? 's' : ''}`;
            const writtenPart = `${writtenCount} obs. écrite${writtenCount > 1 ? 's' : ''}`;
            compactText = `${tagPart} · ${writtenPart}`;
        } else if (writtenCount > 0) {
            compactText = `${writtenCount} observation${writtenCount > 1 ? 's' : ''} écrite${writtenCount > 1 ? 's' : ''}`;
        } else if (transmittedTagCount > 0) {
            compactText = `${transmittedTagCount} tag${transmittedTagCount > 1 ? 's' : ''}`;
        }

        return {
            includedInAI: true,
            includeNotes,
            includeTags,
            tags,
            notes,
            standaloneLabels,
            transmittedTagIds: Array.from(transmittedTagIdSet),
            transmittedCount,
            privateCount,
            totalCount,
            displayText: [...standaloneLabels, ...noteDisplayParts].join(' · '),
            compactText
        };
    },

    /**
     * Synthesize journal entries for prompt injection
     * Creates a compact summary suitable for the AI prompt.
     * - Returns '' when both channels are off (Hors IA).
     * - Excludes private entries.
     * - Includes non-private tags with explicit frequency `(N×)` when `includeTags` is active.
     * - Includes written notes (up to 12 notes / 1200 chars) when `includeNotes` is active.
     * @param {string|Object} studentId - Student ID or student object
     * @param {string} [period] - Optional period filter (defaults to active period)
     * @returns {string} Synthesized text for prompt (empty if no entries or Hors IA)
     */
    synthesizeForPrompt(studentId, period = null) {
        const summary = this.getAISummary(studentId, period);
        if (!summary.includedInAI) return '';

        const parts = [];
        if (summary.standaloneLabels.length > 0) {
            parts.push(`Observations: ${summary.standaloneLabels.join(', ')}`);
        }

        if (summary.notes.length > 0) {
            const writtenNotes = summary.notes
                .map(n => (n.extraTagLabels.length > 0
                    ? `"[${n.extraTagLabels.join(', ')}] ${n.text}"`
                    : `"${n.text}"`))
                .join(' | ');
            parts.push(`Notes: ${writtenNotes}`);
        }

        return parts.join('. ');
    },

    /**
     * Get tag info by ID
     * @param {string} tagId - Tag ID
     * @returns {Object|null} Tag object or null
     */
    getTag(tagId) {
        return this.tags.find(t => t.id === tagId) || null;
    },

    /**
     * Get explicit AI-safe label for a tag ID (falls back to UI label or raw ID).
     * Keeps UI pills compact while preventing ambiguous shorthand (e.g. "Attitude -") in LLM prompts.
     * @param {string} tagId - Tag ID
     * @returns {string}
     */
    getPromptLabel(tagId) {
        const tag = this.getTag(tagId);
        return tag ? (tag.promptLabel || tag.label) : tagId;
    },

    /**
     * Format entry date for display
     * @param {string} isoDate - ISO date string
     * @returns {string} Formatted date (e.g., "15 jan")
     */
    formatDate(isoDate) {
        const date = new Date(isoDate);
        const day = date.getDate();
        const months = ['jan', 'fév', 'mar', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];
        return `${day} ${months[date.getMonth()]}`;
    },

    /**
     * Get contextual placeholder text for the draft textarea according to AI transmission channels (SSOT)
     * @param {boolean} [includeNotes=true]
     * @param {boolean} [includeTags=true]
     * @returns {string}
     */
    getDraftPlaceholder(includeNotes = true, includeTags = true) {
        if (includeNotes) {
            return "Observation écrite (optionnel, transmise à l'IA)…";
        }
        return includeTags
            ? "Note personnelle (optionnel, non transmise à l'IA)…"
            : 'Observation personnelle (optionnel)…';
    },

    /**
     * Render a single journal entry card HTML (shared by renderTimeline & inline edit crossfade)
     * @param {Object} entry - Journal entry
     * @param {string} [extraClass=''] - Optional animation/extra CSS class
     * @returns {string} HTML string
     */
    renderEntryCard(entry, extraClass = '') {
        const isPrivate = entry?.isPrivate === true;
        const visibleTagIds = (Array.isArray(entry?.tags) ? entry.tags : []).filter(tagId => tagId !== 'remarque');

        const tagsHTML = visibleTagIds.map(tagId => {
            const tag = this.getTag(tagId);
            if (!tag) return '';
            return `<span class="journal-tag" data-tag-id="${Utils.escapeHtml(String(tagId))}" style="--tag-color: ${tag.color}; --tag-ink: ${tag.ink}">
                <iconify-icon icon="${tag.icon}"></iconify-icon> ${tag.label}
            </span>`;
        }).join('');

        const privateClass = isPrivate ? 'is-private' : '';
        const privateBadge = isPrivate
            ? `<span class="journal-private-badge tooltip" data-tooltip="Observation personnelle (non transmise à l'IA)"><iconify-icon icon="solar:lock-keyhole-minimalistic-linear" aria-hidden="true"></iconify-icon> Privé</span>`
            : '';

        const safeEntryId = Utils.escapeHtml(String(entry.id ?? ''));
        const hasTagHeader = Boolean(tagsHTML);
        const noteTextHtml = entry.note ? Utils.escapeHtml(entry.note) : '';
        const contentBodyHTML = hasTagHeader
            ? `
                    <div class="journal-entry-tags">
                        ${tagsHTML}
                        ${privateBadge}
                    </div>
                    ${noteTextHtml ? `<div class="journal-entry-note">${noteTextHtml}</div>` : ''}`
            : `<div class="journal-entry-note journal-entry-note--standalone">${noteTextHtml}${privateBadge ? (noteTextHtml ? ' ' : '') + privateBadge : ''}</div>`;

        return `
            <div class="journal-entry ${extraClass} ${privateClass}" data-entry-id="${safeEntryId}">
                <div class="journal-entry-date">${this.formatDate(entry.date)}</div>
                <div class="journal-entry-content">${contentBodyHTML}
                </div>
                <div class="journal-entry-actions">
                    <button type="button" class="journal-entry-action-btn journal-entry-edit tooltip" data-entry-id="${safeEntryId}" aria-label="Modifier l'observation" data-tooltip="Modifier">
                        <iconify-icon icon="solar:pen-linear"></iconify-icon>
                    </button>
                    <button type="button" class="journal-entry-action-btn journal-entry-delete tooltip" data-entry-id="${safeEntryId}" aria-label="Supprimer l'observation" data-tooltip="Supprimer">
                        <iconify-icon icon="solar:trash-bin-trash-linear"></iconify-icon>
                        <span class="journal-delete-confirm-label" aria-hidden="true">Supprimer ?</span>
                    </button>
                </div>
            </div>
        `;
    },

    /**
     * Get empty-state title and subtitle for a class & period (SSOT)
     * @param {string|null} [classId=null]
     * @param {string|null} [period=null]
     * @returns {{ title: string, subtitle: string }}
     */
    getEmptyStateCopy(classId = null, period = null) {
        const targetPeriod = period || appState.currentPeriod;
        const periodLabel = targetPeriod ? Utils.getPeriodLabel(targetPeriod, false) : '';
        const title = periodLabel
            ? `Aucune observation pour le ${periodLabel}`
            : 'Aucune observation pour cette période';
        const includeNotes = this.isNotesIncludedInAI(classId);
        const includeTags = this.isTagsIncludedInAI(classId);
        let subtitle;
        if (includeNotes && includeTags) {
            subtitle = 'Faits datés au fil de la période (observations écrites et tags transmis à l\'IA)';
        } else if (includeNotes) {
            subtitle = 'Faits datés au fil de la période (observations écrites transmises à l\'IA)';
        } else if (includeTags) {
            subtitle = 'Faits datés au fil de la période (tags transmis à l\'IA)';
        } else {
            subtitle = 'Mode bloc-notes personnel (non transmis à l\'IA)';
        }
        return { title, subtitle };
    },

    /**
     * Render journal timeline HTML for Focus Panel
     * @param {string} studentId - Student ID
     * @param {string} [period] - Optional period filter
     * @param {string} [highlightEntryId] - Optional entry ID to animate
     * @param {string|null} [editingEntryId=null] - Entry ID currently edited inline
     * @param {string} [highlightClass='enter'] - CSS animation class for highlighted entry
     * @returns {string} HTML string
     */
    renderTimeline(studentId, period = null, highlightEntryId = null, editingEntryId = null, highlightClass = 'enter') {
        const targetPeriod = period || appState.currentPeriod;
        const entries = Array.isArray(studentId) ? studentId : (targetPeriod
            ? this.getEntriesForPeriod(studentId, targetPeriod)
            : this.getEntries(studentId));

        const student = Array.isArray(studentId) ? null : appState.generatedResults?.find(s => s.id === studentId);
        const classId = student?.classId || null;

        if (entries.length === 0) {
            const { title: emptyTitle, subtitle: emptySubtitle } = this.getEmptyStateCopy(classId, targetPeriod);
            return `
                <div class="journal-empty journal-empty-interactive" role="button" tabindex="0" aria-label="Ajouter une observation">
                    <div class="journal-empty-content">
                        <span class="journal-empty-title">${emptyTitle}</span>
                        <span class="journal-empty-subtitle">${emptySubtitle}</span>
                    </div>
                    <span class="journal-empty-cta-badge">
                        <iconify-icon icon="ph:plus" aria-hidden="true"></iconify-icon>
                        <span>Ajouter</span>
                    </span>
                </div>
            `;
        }

        // Sort by date (newest first)
        const sortedEntries = [...entries].sort((a, b) =>
            new Date(b.date) - new Date(a.date)
        );

        const entriesHTML = sortedEntries.map(entry => {
            // IF EDITING THIS ENTRY: Render Inline Editor
            if (entry.id === editingEntryId) {
                return this.renderDraftPreview(entry, classId);
            }

            const animationClass = entry.id === highlightEntryId ? highlightClass : '';
            return this.renderEntryCard(entry, animationClass);
        }).join('');

        return `<div class="journal-timeline">${entriesHTML}</div>`;
    },

    /**
     * Render the draft preview container (or inline editor)
     * @param {Object|null} [entry=null] - Optional entry to edit. If null, renders "New Entry" mode.
     * @param {string|null} [classId=null] - Optional class ID for AI-aware placeholder copy
     * @returns {string} HTML string
     */
    renderDraftPreview(entry = null, classId = null) {
        const isEdit = !!entry;
        const noteValue = isEdit ? (entry.note || '') : '';
        const dateStr = isEdit ? entry.date : new Date().toISOString();
        const formattedDate = this.formatDate(dateStr);
        const labelText = isEdit ? 'Modifier l\'observation' : 'Nouvelle observation';
        const includeNotes = this.isNotesIncludedInAI(classId);
        const includeTags = this.isTagsIncludedInAI(classId);
        const placeholderText = this.getDraftPlaceholder(includeNotes, includeTags);

        const selectedTags = isEdit && Array.isArray(entry.tags)
            ? entry.tags.filter(tagId => tagId !== 'remarque')
            : [];
        const isPrivate = Boolean(isEdit && entry?.isPrivate);
        const canSave = isEdit && (selectedTags.length > 0 || noteValue.trim().length > 0);
        const showCharCount = noteValue.length >= 200;

        const pillButtonsHTML = this.renderTagPillButtons(selectedTags);

        return `
            <div class="journal-draft-preview ${isEdit ? 'visible is-editing' : ''}" id="journalDraftPreview">
                <div class="journal-draft-inner">
                    <div class="journal-draft-card">
                        <div class="journal-draft-header">
                            <div class="journal-draft-title">
                                <span class="journal-draft-title-text">${labelText}</span>
                                <span class="journal-draft-date-badge">${formattedDate}</span>
                            </div>
                        </div>

                        <div class="journal-draft-pills-row">
                            <div class="journal-draft-pills" id="journalDraftPills" role="group" aria-label="Tags d'observation">
                                ${pillButtonsHTML}
                            </div>
                        </div>

                        <div class="journal-draft-input-wrap">
                            <textarea class="journal-note-input" id="journalNoteInput"
                                placeholder="${Utils.escapeHtml(placeholderText)}"
                                rows="2" maxlength="280">${Utils.escapeHtml(noteValue)}</textarea>
                            <button type="button" id="journalNoteMicBtn" class="focus-mic-btn tooltip"
                                data-tooltip="Dictée vocale" aria-label="Dicter la note">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                                    stroke="currentColor" stroke-width="1.4" stroke-linecap="round"
                                    stroke-linejoin="round" width="15" height="15">
                                    <path d="M12 19v3m7-12v2a7 7 0 0 1-14 0v-2"></path>
                                    <rect width="6" height="13" x="9" y="2" rx="3"></rect>
                                </svg>
                            </button>
                            <div class="journal-input-footer">
                                <span class="journal-char-count${showCharCount ? ' is-visible' : ''}"><span id="journalCharCount">${noteValue.length}</span>/280</span>
                            </div>
                        </div>

                        <div class="journal-draft-actions-footer">
                            <button type="button" class="journal-private-toggle${isPrivate ? ' is-active' : ''} tooltip"
                                id="journalDraftPrivateBtn" aria-pressed="${isPrivate ? 'true' : 'false'}"
                                data-tooltip="Observation personnelle : exclue de l'IA">
                                <iconify-icon icon="solar:lock-keyhole-minimalistic-linear" aria-hidden="true"></iconify-icon>
                                <span>Privé</span>
                            </button>
                            <button type="button" class="journal-footer-btn journal-cancel-btn" id="journalDraftCancelFooterBtn">
                                Annuler
                            </button>
                            <button type="button" class="journal-footer-btn journal-save-btn" id="journalDraftSaveBtn" ${canSave ? '' : 'disabled'}>
                                <span>${isEdit ? 'Mettre à jour' : 'Enregistrer'}</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Render flat direct-toggle pill buttons grouped by polarity (positive vs vigilance)
     * Excludes 'remarque' which is assigned automatically when saving a text-only note.
     * @param {string[]} [selectedTagIds=[]] - Tag IDs pre-selected in edit mode
     * @returns {string} HTML string
     */
    renderTagPillButtons(selectedTagIds = []) {
        const selectedSet = new Set(Array.isArray(selectedTagIds) ? selectedTagIds : []);
        const positiveTags = this.tags.filter(t => t.category === 'positive');
        const vigilanceTags = this.tags.filter(t => t.category !== 'positive' && t.id !== 'remarque');

        const renderPill = (tag) => {
            const isSelected = selectedSet.has(tag.id);
            return `
                <button type="button" class="journal-pill-btn journal-pill-direct${isSelected ? ' selected' : ''}"
                    data-tag-id="${tag.id}" aria-pressed="${isSelected ? 'true' : 'false'}"
                    style="--pill-color: ${tag.color}; --pill-ink: ${tag.ink}">
                    <iconify-icon icon="${tag.icon}" aria-hidden="true"></iconify-icon>
                    <span>${tag.label}</span>
                </button>
            `;
        };

        return `
            <div class="journal-pills-group" data-polarity="positive">
                ${positiveTags.map(renderPill).join('')}
            </div>
            <div class="journal-pills-group" data-polarity="vigilance">
                ${vigilanceTags.map(renderPill).join('')}
            </div>
        `;
    },


};
