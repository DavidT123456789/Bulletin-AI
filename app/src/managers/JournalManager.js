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
 * @constant {Array<{id: string, label: string, icon: string, color: string, ink: string, category: string}>}
 */
const PREDEFINED_TAGS = [
    // POSITIF (vert) - 4 items
    { id: 'participation+', label: 'Participe', icon: 'solar:hand-shake-linear', color: 'var(--success-color)', ink: 'var(--success-text)', category: 'positive' },
    { id: 'travail+', label: 'Travail sérieux', icon: 'solar:book-2-linear', color: 'var(--success-color)', ink: 'var(--success-text)', category: 'positive' },
    { id: 'progres', label: 'Progrès', icon: 'solar:graph-up-linear', color: 'var(--success-color)', ink: 'var(--success-text)', category: 'positive' },
    { id: 'attitude+', label: 'Attitude +', icon: 'solar:smile-circle-linear', color: 'var(--success-color)', ink: 'var(--success-text)', category: 'positive' },
    // NÉGATIF (rouge) - 4 items
    { id: 'bavardage', label: 'Bavardage', icon: 'solar:chat-round-dots-linear', color: 'var(--error-color)', ink: 'var(--error-text)', category: 'negative' },
    { id: 'travail-', label: 'Travail insuffisant', icon: 'solar:notebook-linear', color: 'var(--error-color)', ink: 'var(--error-text)', category: 'negative' },
    { id: 'oubli', label: 'Oubli d\'affaires', icon: 'solar:bag-linear', color: 'var(--error-color)', ink: 'var(--error-text)', category: 'negative' },
    { id: 'attitude-', label: 'Attitude -', icon: 'solar:sad-circle-linear', color: 'var(--error-color)', ink: 'var(--error-text)', category: 'negative' },
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
        FocusPanelStatus.refreshAppreciationStatus();
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
        FocusPanelStatus.refreshAppreciationStatus();
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
        FocusPanelStatus.refreshAppreciationStatus();
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
     * @returns {Array<{icon: string, color: string, count: number, label: string}>}
     */
    getAggregatedCounts(studentId, period = null, options = {}) {
        const tagCounts = this.countTags(studentId, period, options);

        const aggregated = [];
        Object.entries(tagCounts).forEach(([tagId, count]) => {
            if (count > 0) {
                const tag = this.getTag(tagId);
                if (tag) {
                    aggregated.push({
                        icon: tag.icon,
                        color: tag.color,
                        ink: tag.ink,
                        count: count,
                        label: tag.label
                    });
                }
            }
        });

        // Sort by count desc
        return aggregated.sort((a, b) => b.count - a.count);
    },

    /**
     * Get the effective journal threshold for a student/class
     * @param {string} [classId] - Optional class ID
     * @returns {number} Threshold value (default 2)
     */
    getThreshold(classId = null) {
        // 1. Try to get specific class
        const targetClassId = classId || appState.currentClassId;
        if (targetClassId) {
            const classObj = appState.classes?.find(c => c.id === targetClassId);
            if (classObj && classObj.journalThreshold !== undefined) {
                return classObj.journalThreshold;
            }
        }

        // 2. Fallback to global setting or default
        return appState.journalThreshold ?? 2;
    },

    /**
     * Check whether journal entries are transmitted to AI for a class (or globally)
     * When false, the journal works as a purely personal notepad.
     * @param {string|null} [classId=null] - Optional class ID
     * @returns {boolean} True if journal is included in AI prompts (default true)
     */
    isIncludedInAI(classId = null) {
        const targetClassId = classId || appState.currentClassId;
        if (targetClassId) {
            const classObj = appState.classes?.find(c => c.id === targetClassId);
            if (classObj && classObj.journalIncludeInAI !== undefined) {
                return classObj.journalIncludeInAI !== false;
            }
        }
        return appState.journalIncludeInAI !== false;
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
     * Get significant tag IDs (meeting threshold) for a student on a period, sorted by frequency
     * Excludes private entries.
     * @param {string|Object} studentOrId - Student ID or student object
     * @param {string|null} [period=null] - Optional period filter
     * @returns {string[]} Array of significant tag IDs
     */
    getSignificantTagIds(studentOrId, period = null) {
        const { entries, classId } = this._resolveStudentPeriodEntries(studentOrId, period);
        const aiEntries = entries.filter(e => !e.isPrivate);
        if (aiEntries.length === 0 || !this.isIncludedInAI(classId)) return [];
        const threshold = this.getThreshold(classId);
        const tagCounts = this.countTags(aiEntries);
        return Object.entries(tagCounts)
            .filter(([, count]) => count >= threshold)
            .sort((a, b) => b[1] - a[1])
            .map(([tagId]) => tagId);
    },

    /**
     * Build structured AI synthesis summary for UI transparency and prompt injection (SSOT).
     * Excludes private entries; includes all written non-private notes up to 12 notes / 1200 chars.
     * @param {string|Object} studentOrId - Student ID or student object
     * @param {string|null} [period=null] - Optional period filter
     * @returns {{ includedInAI: boolean, threshold: number, tags: Array<{id: string, label: string, count: number}>, notes: Array<{text: string, extraTagLabels: string[]}>, privateCount: number, totalCount: number, displayText: string }}
     */
    getAISummary(studentOrId, period = null) {
        const { entries, classId } = this._resolveStudentPeriodEntries(studentOrId, period);
        const includedInAI = this.isIncludedInAI(classId);
        const threshold = this.getThreshold(classId);
        const privateCount = entries.filter(e => e.isPrivate === true).length;
        const totalCount = entries.length;

        if (!includedInAI) {
            return {
                includedInAI: false,
                threshold,
                tags: [],
                notes: [],
                privateCount,
                totalCount,
                displayText: ''
            };
        }

        const aiEntries = entries.filter(e => !e.isPrivate);
        const tagCounts = this.countTags(aiEntries);
        const tags = Object.entries(tagCounts)
            .filter(([, count]) => count >= threshold)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([tagId, count]) => {
                const tag = this.getTag(tagId);
                return { id: tagId, label: tag ? tag.label : tagId, count };
            });

        const significantSet = new Set(tags.map(t => t.id));
        const rawNotes = aiEntries
            .filter(e => typeof e.note === 'string' && e.note.trim().length > 0)
            .slice(-12);

        const notes = [];
        let totalNoteChars = 0;
        for (let i = rawNotes.length - 1; i >= 0; i--) {
            const e = rawNotes[i];
            const text = e.note.trim();
            if (notes.length > 0 && totalNoteChars + text.length > 1200) break;
            totalNoteChars += text.length;
            const extraTagLabels = (Array.isArray(e.tags) ? e.tags : [])
                .filter(tagId => tagId && tagId !== 'remarque' && !significantSet.has(tagId))
                .map(tagId => this.getTag(tagId)?.label || tagId);
            notes.unshift({ text, extraTagLabels });
        }

        const displayParts = [
            ...tags.map(t => t.label),
            ...notes.map(n => {
                const short = n.text.length > 42 ? `${n.text.slice(0, 42).trimEnd()}…` : n.text;
                return n.extraTagLabels.length > 0
                    ? `« [${n.extraTagLabels.join(', ')}] ${short} »`
                    : `« ${short} »`;
            })
        ];

        return {
            includedInAI: true,
            threshold,
            tags,
            notes,
            privateCount,
            totalCount,
            displayText: displayParts.join(' · ')
        };
    },

    /**
     * Synthesize journal entries for prompt injection
     * Creates a compact summary suitable for the AI prompt.
     * - Returns '' when journal is set to personal notepad mode (Hors IA).
     * - Excludes private entries.
     * - Tag-only entries require meeting the threshold (default 2).
     * - Written notes (entry.note.trim().length > 0) are included (up to 12 notes / 1200 chars).
     * @param {string|Object} studentId - Student ID or student object
     * @param {string} [period] - Optional period filter (defaults to active period)
     * @returns {string} Synthesized text for prompt (empty if no entries or Hors IA)
     */
    synthesizeForPrompt(studentId, period = null) {
        const summary = this.getAISummary(studentId, period);
        if (!summary.includedInAI) return '';

        const parts = [];
        if (summary.tags.length > 0) {
            parts.push(`Observations: ${summary.tags.map(t => t.label).join(', ')}`);
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
     * Check if an entry is "isolated" (tag-only entry whose tags are all below threshold)
     * Written notes, private entries, and entries in personal notepad mode (Hors IA) are never dimmed as isolated.
     * @param {Object} entry - Journal entry object
     * @param {Object} tagCounts - Pre-computed tag counts { tagId: count }
     * @param {number} [threshold] - Threshold value (optional, computed if not provided)
     * @param {string|null} [classId=null] - Optional class ID
     * @returns {boolean} True if tag-only entry is below threshold and AI transmission is active
     */
    isEntryIsolated(entry, tagCounts, threshold = null, classId = null) {
        if (!entry || entry.isPrivate === true || !this.isIncludedInAI(classId)) return false;
        // Written observations are always transmitted to AI -> never isolated
        if (typeof entry.note === 'string' && entry.note.trim().length > 0) return false;
        const limit = threshold ?? this.getThreshold(classId || appState.currentClassId);
        // Tag-only entry is isolated if ALL its tags are below limit
        const tags = Array.isArray(entry.tags) ? entry.tags : [];
        if (tags.length === 0) return false;
        return tags.every(tagId => (tagCounts[tagId] || 0) < limit);
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
     * Render a single journal entry card HTML (shared by renderTimeline & inline edit crossfade)
     * @param {Object} entry - Journal entry
     * @param {Object} tagCounts - Pre-computed tag counts
     * @param {number} threshold - Active threshold
     * @param {string|null} [classId=null] - Student class ID
     * @param {string} [extraClass=''] - Optional animation/extra CSS class
     * @returns {string} HTML string
     */
    renderEntryCard(entry, tagCounts, threshold, classId = null, extraClass = '') {
        const tagsHTML = (Array.isArray(entry.tags) ? entry.tags : []).map(tagId => {
            const tag = this.getTag(tagId);
            if (!tag) return '';
            return `<span class="journal-tag" style="--tag-color: ${tag.color}; --tag-ink: ${tag.ink}">
                <iconify-icon icon="${tag.icon}"></iconify-icon> ${tag.label}
            </span>`;
        }).join('');

        const isPrivate = entry.isPrivate === true;
        const privateClass = isPrivate ? 'is-private' : '';
        const privateBadge = isPrivate
            ? `<span class="journal-private-badge tooltip" data-tooltip="Note personnelle (non transmise à l'IA)"><iconify-icon icon="solar:lock-keyhole-minimalistic-linear" aria-hidden="true"></iconify-icon> Privé</span>`
            : '';

        const isIsolated = this.isEntryIsolated(entry, tagCounts, threshold, classId);
        const isolatedClass = isIsolated ? 'isolated' : '';

        const infoIcon = isIsolated
            ? `<span class="journal-entry-info tooltip" data-tooltip="Observation isolée (&lt; ${threshold}×) — non transmise à l'IA (ajoutez une note ou répétez)"><iconify-icon icon="solar:info-circle-linear"></iconify-icon></span>`
            : '';

        const safeEntryId = Utils.escapeHtml(String(entry.id ?? ''));

        return `
            <div class="journal-entry ${extraClass} ${isolatedClass} ${privateClass}" data-entry-id="${safeEntryId}">
                <div class="journal-entry-date">${this.formatDate(entry.date)}</div>
                <div class="journal-entry-content">
                    <div class="journal-entry-tags">
                        ${tagsHTML}
                        ${privateBadge}
                        ${infoIcon}
                    </div>
                    ${entry.note ? `<div class="journal-entry-note">${Utils.escapeHtml(entry.note)}</div>` : ''}
                </div>
                <div class="journal-entry-actions">
                    <button type="button" class="journal-entry-action-btn journal-entry-edit tooltip" data-entry-id="${safeEntryId}" aria-label="Modifier l'observation" data-tooltip="Modifier">
                        <iconify-icon icon="solar:pen-linear"></iconify-icon>
                    </button>
                    <button type="button" class="journal-entry-action-btn journal-entry-delete tooltip" data-entry-id="${safeEntryId}" aria-label="Supprimer l'observation" data-tooltip="Supprimer">
                        <iconify-icon icon="solar:trash-bin-trash-linear"></iconify-icon>
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
        const subtitle = this.isIncludedInAI(classId)
            ? 'Faits datés au fil de la période (notes rédigées et tags répétés transmis à l\'IA)'
            : 'Mode bloc-notes personnel (non transmis à l\'IA)';
        return { title, subtitle };
    },

    /**
     * Render journal timeline HTML for Focus Panel
     * @param {string} studentId - Student ID
     * @param {string} [period] - Optional period filter
     * @param {string} [highlightEntryId] - Optional entry ID to animate
     * @returns {string} HTML string
     */
    renderTimeline(studentId, period = null, highlightEntryId = null, editingEntryId = null) {
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

        // Compute tag counts for threshold check (visual feedback — exclude private entries)
        const tagCounts = this.countTags(studentId, period, { excludePrivate: true });
        const threshold = this.getThreshold(classId);

        // Sort by date (newest first)
        const sortedEntries = [...entries].sort((a, b) =>
            new Date(b.date) - new Date(a.date)
        );

        const entriesHTML = sortedEntries.map(entry => {
            // IF EDITING THIS ENTRY: Render Inline Editor
            if (entry.id === editingEntryId) {
                return this.renderDraftPreview(entry);
            }

            const animationClass = entry.id === highlightEntryId ? 'enter' : '';
            return this.renderEntryCard(entry, tagCounts, threshold, classId, animationClass);
        }).join('');

        return `<div class="journal-timeline">${entriesHTML}</div>`;
    },

    /**
     * Render the draft preview container (or inline editor)
     * @param {Object} [entry] - Optional entry to edit. If null, renders "New Entry" mode.
     * @returns {string} HTML string
     */
    renderDraftPreview(entry = null) {
        const isEdit = !!entry;
        const noteValue = isEdit ? (entry.note || '') : '';
        const dateStr = isEdit ? entry.date : new Date().toISOString();
        const formattedDate = this.formatDate(dateStr);
        const labelText = isEdit ? 'Modifier l\'observation' : 'Nouvelle observation';

        const selectedTags = isEdit && Array.isArray(entry.tags)
            ? entry.tags.filter(tagId => tagId !== 'remarque')
            : [];
        const isPrivate = Boolean(isEdit && entry?.isPrivate);
        const canSave = isEdit && (selectedTags.length > 0 || noteValue.trim().length > 0);
        const showCharCount = noteValue.length >= 200;

        const pillButtonsHTML = this.renderTagPillButtons(selectedTags);

        return `
            <div class="journal-draft-preview ${isEdit ? 'visible is-editing' : ''}" id="journalDraftPreview">
                <div class="journal-draft-header">
                    <div class="journal-draft-title">
                        <span class="journal-draft-title-text">${labelText}</span>
                        <span class="journal-draft-date-badge">${formattedDate}</span>
                        <button type="button" id="journalNoteMicBtn" class="focus-mic-btn tooltip"
                            data-tooltip="Dictée vocale" aria-label="Dicter la note">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" stroke-width="1.4" stroke-linecap="round"
                                stroke-linejoin="round" width="15" height="15">
                                <path d="M12 19v3m7-12v2a7 7 0 0 1-14 0v-2"></path>
                                <rect width="6" height="13" x="9" y="2" rx="3"></rect>
                            </svg>
                        </button>
                    </div>
                </div>

                <div class="journal-draft-pills-row">
                    <div class="journal-draft-pills" id="journalDraftPills" role="group" aria-label="Tags d'observation">
                        ${pillButtonsHTML}
                    </div>
                </div>

                <div class="journal-draft-input-wrap">
                    <textarea class="journal-note-input" id="journalNoteInput"
                        placeholder="Précision ou contexte (optionnel)..."
                        rows="2" maxlength="280">${Utils.escapeHtml(noteValue)}</textarea>
                    <div class="journal-input-footer">
                        <span class="journal-char-count${showCharCount ? ' is-visible' : ''}"><span id="journalCharCount">${noteValue.length}</span>/280</span>
                    </div>
                </div>

                <div class="journal-draft-actions-footer">
                    <button type="button" class="journal-private-toggle${isPrivate ? ' is-active' : ''} tooltip"
                        id="journalDraftPrivateBtn" aria-pressed="${isPrivate ? 'true' : 'false'}"
                        data-tooltip="Note personnelle : exclue de l'IA">
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
