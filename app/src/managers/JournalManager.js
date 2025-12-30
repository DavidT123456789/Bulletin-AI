/**
 * @fileoverview Journal de Bord Manager - Observation notes for students
 * Captures teacher notes (tags + text) throughout the term for AI synthesis
 * @module managers/JournalManager
 */

import { appState } from '../state/State.js';
import { StorageManager } from './StorageManager.js';

/**
 * Predefined tags for quick observation categorization
 * @constant {Array<{id: string, label: string, icon: string, color: string}>}
 */
const PREDEFINED_TAGS = [
    { id: 'participation', label: 'Participation', icon: 'fa-hand', color: '#10b981' },
    { id: 'comportement', label: 'Comportement', icon: 'fa-user', color: '#f59e0b' },
    { id: 'travail', label: 'Travail', icon: 'fa-book', color: '#3b82f6' },
    { id: 'progres', label: 'Progrès', icon: 'fa-arrow-up', color: '#8b5cf6' },
    { id: 'difficulte', label: 'Difficulté', icon: 'fa-triangle-exclamation', color: '#ef4444' },
    { id: 'remarque', label: 'Remarque', icon: 'fa-comment', color: '#6b7280' }
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
     * @returns {JournalEntry|null} Created entry or null if failed
     */
    addEntry(studentId, { tags, note = '' }) {
        if (!studentId || !tags || tags.length === 0) {
            console.warn('[JournalManager] Invalid entry data');
            return null;
        }

        const studentIndex = appState.generatedResults?.findIndex(s => s.id === studentId);
        if (studentIndex === -1 || studentIndex === undefined) {
            console.warn('[JournalManager] Student not found:', studentId);
            return null;
        }

        // Create entry
        const entry = {
            id: this._generateId(),
            date: new Date().toISOString(),
            tags: tags,
            note: note.trim().slice(0, 280), // Max 280 chars
            period: appState.currentPeriod || 'T1'
        };

        // Initialize journal array if doesn't exist
        if (!appState.generatedResults[studentIndex].journal) {
            appState.generatedResults[studentIndex].journal = [];
        }

        // Add entry
        appState.generatedResults[studentIndex].journal.push(entry);

        // Persist to storage
        StorageManager.saveAppState();


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


        return true;
    },

    /**
     * Count tags for a student (for synthesis)
     * @param {string} studentId - Student ID
     * @param {string} [period] - Optional period filter
     * @returns {Object} Tag counts { tagId: count }
     */
    countTags(studentId, period = null) {
        const entries = period
            ? this.getEntriesForPeriod(studentId, period)
            : this.getEntries(studentId);

        const counts = {};
        entries.forEach(entry => {
            entry.tags.forEach(tagId => {
                counts[tagId] = (counts[tagId] || 0) + 1;
            });
        });

        return counts;
    },

    /**
     * Synthesize journal entries for prompt injection
     * Creates a compact summary suitable for the AI prompt
     * @param {string} studentId - Student ID
     * @param {string} [period] - Optional period filter (defaults to active period)
     * @returns {string} Synthesized text for prompt (empty if no entries)
     */
    synthesizeForPrompt(studentId, period = null) {
        const targetPeriod = period || appState.activePeriod;
        const entries = this.getEntriesForPeriod(studentId, targetPeriod);

        if (entries.length === 0) return '';

        // Count tags
        const tagCounts = this.countTags(studentId, targetPeriod);

        // Build summary parts
        const parts = [];

        // Tag counts (most frequent first)
        const sortedTags = Object.entries(tagCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5); // Top 5 tags

        if (sortedTags.length > 0) {
            const tagSummaries = sortedTags.map(([tagId, count]) => {
                const tag = this.tags.find(t => t.id === tagId);
                const label = tag ? tag.label : tagId;
                return `${label}: ${count}x`;
            });
            parts.push(`Observations (${entries.length}): ${tagSummaries.join(', ')}`);
        }

        // Include recent notes (last 3 with text)
        const recentNotes = entries
            .filter(e => e.note && e.note.length > 0)
            .slice(-3)
            .map(e => `"${e.note}"`)
            .join(' | ');

        if (recentNotes) {
            parts.push(`Notes récentes: ${recentNotes}`);
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
     * Render journal timeline HTML for Focus Panel
     * @param {string} studentId - Student ID
     * @param {string} [period] - Optional period filter
     * @param {string} [highlightEntryId] - Optional entry ID to animate
     * @returns {string} HTML string
     */
    renderTimeline(studentId, period = null, highlightEntryId = null) {
        const entries = period
            ? this.getEntriesForPeriod(studentId, period)
            : this.getEntries(studentId);

        if (entries.length === 0) {
            return `
                <div class="journal-empty">
                    <i class="fas fa-book-open"></i>
                    <span>Aucune observation</span>
                </div>
            `;
        }

        // Sort by date (newest first)
        const sortedEntries = [...entries].sort((a, b) =>
            new Date(b.date) - new Date(a.date)
        );

        const entriesHTML = sortedEntries.map(entry => {
            const tagsHTML = entry.tags.map(tagId => {
                const tag = this.getTag(tagId);
                if (!tag) return '';
                return `<span class="journal-tag" style="--tag-color: ${tag.color}">
                    <i class="fas ${tag.icon}"></i> ${tag.label}
                </span>`;
            }).join('');

            const animationClass = entry.id === highlightEntryId ? 'enter' : '';

            return `
                <div class="journal-entry ${animationClass}" data-entry-id="${entry.id}">
                    <div class="journal-entry-date">${this.formatDate(entry.date)}</div>
                    <div class="journal-entry-content">
                        <div class="journal-entry-tags">${tagsHTML}</div>
                        ${entry.note ? `<div class="journal-entry-note">${entry.note}</div>` : ''}
                    </div>
                    <button class="journal-entry-delete" data-entry-id="${entry.id}" aria-label="Supprimer">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
        }).join('');

        return `<div class="journal-timeline">${entriesHTML}</div>`;
    },

    /**
     * Render quick-add tag buttons
     * @returns {string} HTML string
     */
    renderTagButtons() {
        return this.tags.map(tag => `
            <button class="journal-tag-btn" data-tag-id="${tag.id}" style="--tag-color: ${tag.color}">
                <i class="fas ${tag.icon}"></i>
                <span>${tag.label}</span>
            </button>
        `).join('');
    }
};
