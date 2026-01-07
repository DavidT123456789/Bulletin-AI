/**
 * @fileoverview Journal de Bord Manager - Observation notes for students
 * Captures teacher notes (tags + text) throughout the term for AI synthesis
 * @module managers/JournalManager
 */

import { appState } from '../state/State.js';
import { StorageManager } from './StorageManager.js';

// Lazy import to avoid circular dependency - resolved when needed
let FocusPanelManager = null;
const getFocusPanelManager = async () => {
    if (!FocusPanelManager) {
        const module = await import('./FocusPanelManager.js');
        FocusPanelManager = module.FocusPanelManager;
    }
    return FocusPanelManager;
};

/**
 * Predefined tags for quick observation categorization
 * @constant {Array<{id: string, label: string, icon: string, color: string}>}
 */
const PREDEFINED_TAGS = [
    // POSITIF (vert) - 4 items
    { id: 'participation+', label: 'Participe', icon: 'fa-hand', color: '#10b981', category: 'positive' },
    { id: 'travail+', label: 'Travail sérieux', icon: 'fa-book-open', color: '#10b981', category: 'positive' },
    { id: 'progres', label: 'Progrès', icon: 'fa-arrow-trend-up', color: '#10b981', category: 'positive' },
    { id: 'attitude+', label: 'Attitude +', icon: 'fa-face-smile', color: '#10b981', category: 'positive' },
    // NÉGATIF (rouge) - 4 items
    { id: 'bavardage', label: 'Bavardage', icon: 'fa-comments', color: '#ef4444', category: 'negative' },
    { id: 'travail-', label: 'Travail insuffisant', icon: 'fa-book', color: '#ef4444', category: 'negative' },
    { id: 'oubli', label: 'Oubli d\'affaires', icon: 'fa-bag-shopping', color: '#ef4444', category: 'negative' },
    { id: 'attitude-', label: 'Attitude -', icon: 'fa-face-frown', color: '#ef4444', category: 'negative' },
    // NEUTRE (orange/gris) - 2 direct buttons
    { id: 'difficulte', label: 'Difficulté', icon: 'fa-triangle-exclamation', color: '#f59e0b', category: 'neutral' },
    { id: 'remarque', label: 'Remarque', icon: 'fa-comment', color: '#6b7280', category: 'neutral' }
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

        // Trigger status refresh to detect dirty state
        getFocusPanelManager().then(fpm => fpm._refreshAppreciationStatus());

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
        getFocusPanelManager().then(fpm => fpm._refreshAppreciationStatus());

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
     * @param {Object} updates - { tags, note }
     * @returns {JournalEntry|null} Updated entry or null
     */
    updateEntry(studentId, entryId, { tags, note }) {
        const studentIndex = appState.generatedResults?.findIndex(s => s.id === studentId);
        if (studentIndex === -1) return null;

        const journal = appState.generatedResults[studentIndex].journal;
        if (!journal) return null;

        const entry = journal.find(e => e.id === entryId);
        if (!entry) return null;

        // Apply updates
        if (tags) entry.tags = tags;
        if (note !== undefined) entry.note = note.trim().slice(0, 280);

        StorageManager.saveAppState();
        return entry;
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
     * Check if an entry is "isolated" (all its tags are below threshold)
     * Used for visual feedback - isolated entries won't influence AI
     * @param {Object} entry - Journal entry object
     * @param {Object} tagCounts - Pre-computed tag counts { tagId: count }
     * @returns {boolean} True if ALL tags in entry are below threshold
     */
    isEntryIsolated(entry, tagCounts) {
        const threshold = appState.journalThreshold ?? 2;
        // Entry is isolated if ALL its tags are below threshold
        return entry.tags.every(tagId => (tagCounts[tagId] || 0) < threshold);
    },

    /**
     * Synthesize journal entries for prompt injection
     * Creates a compact summary suitable for the AI prompt
     * Only includes tags that meet the threshold (default 2)
     * @param {string} studentId - Student ID
     * @param {string} [period] - Optional period filter (defaults to active period)
     * @returns {string} Synthesized text for prompt (empty if no entries)
     */
    synthesizeForPrompt(studentId, period = null) {
        const targetPeriod = period || appState.currentPeriod;
        const entries = this.getEntriesForPeriod(studentId, targetPeriod);

        if (entries.length === 0) return '';

        // Get threshold from settings (default 1 = include everything by default)
        const threshold = appState.journalThreshold ?? 1;

        // Count tags
        const tagCounts = this.countTags(studentId, targetPeriod);

        // Build summary parts
        const parts = [];

        // Filter tags by threshold, then sort by frequency
        const significantTags = Object.entries(tagCounts)
            .filter(([tagId, count]) => count >= threshold)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5); // Top 5 significant tags

        if (significantTags.length > 0) {
            const tagLabels = significantTags.map(([tagId]) => {
                const tag = this.tags.find(t => t.id === tagId);
                return tag ? tag.label : tagId;
            });
            parts.push(`Observations: ${tagLabels.join(', ')}`);
        }

        // Include recent notes only from entries with significant tags
        const significantTagIds = new Set(significantTags.map(([id]) => id));
        const significantNotes = entries
            .filter(e => e.note && e.note.length > 0 && e.tags.some(t => significantTagIds.has(t)))
            .slice(-3)
            .map(e => `"${e.note}"`)
            .join(' | ');

        if (significantNotes) {
            parts.push(`Notes: ${significantNotes}`);
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
    renderTimeline(studentId, period = null, highlightEntryId = null, editingEntryId = null) {
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

        // Compute tag counts for threshold check (visual feedback)
        const tagCounts = this.countTags(studentId, period);
        const threshold = appState.journalThreshold ?? 2;

        // Sort by date (newest first)
        const sortedEntries = [...entries].sort((a, b) =>
            new Date(b.date) - new Date(a.date)
        );

        const entriesHTML = sortedEntries.map(entry => {
            // IF EDITING THIS ENTRY: Render Inline Editor
            if (entry.id === editingEntryId) {
                return this.renderDraftPreview(entry);
            }

            // OTHERWISE: Render Standard Card
            const tagsHTML = entry.tags.map(tagId => {
                const tag = this.getTag(tagId);
                if (!tag) return '';
                const count = tagCounts[tagId] || 0;
                // Show count badge if significant (≥ threshold)
                const countBadge = count >= threshold ? ` <small style="opacity:0.7">×${count}</small>` : '';
                return `<span class="journal-tag" style="--tag-color: ${tag.color}">
                    <i class="fas ${tag.icon}"></i> ${tag.label}${countBadge}
                </span>`;
            }).join('');

            const animationClass = entry.id === highlightEntryId ? 'enter' : '';
            const isIsolated = this.isEntryIsolated(entry, tagCounts);
            const isolatedClass = isIsolated ? 'isolated' : '';
            const isolatedTooltip = isIsolated
                ? `data-tooltip="Observation isolée (< ${threshold}×) — non transmise à l'IA"`
                : '';

            return `
                <div class="journal-entry ${animationClass} ${isolatedClass}" data-entry-id="${entry.id}" ${isolatedTooltip}>
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
     * Render the draft preview container (or inline editor)
     * @param {Object} [entry] - Optional entry to edit. If null, renders "New Entry" mode.
     * @returns {string} HTML string
     */
    renderDraftPreview(entry = null) {
        // Mode detection
        const isEdit = !!entry;
        const noteValue = isEdit ? entry.note : '';
        const dateStr = isEdit ? entry.date : new Date().toISOString();
        const formattedDate = this.formatDate(dateStr);

        // Header Label
        const labelIcon = isEdit ? 'fa-pen-to-square' : 'fa-pencil';
        const labelText = isEdit ? 'Modifier' : 'Brouillon';

        // Pre-render selected tags if editing
        let chipsHTML = '';
        if (isEdit && entry.tags) {
            chipsHTML = entry.tags.map(tagId => {
                const tag = this.getTag(tagId);
                if (!tag) return '';
                // Note: The click handlers for 'remove' are attached dynamically in FocusPanelManager
                // We just render the structure here to avoid layout shifts
                return `
                    <span class="journal-selected-chip" style="--tag-color: ${tag.color}" data-tag-id="${tagId}">
                        <i class="fas ${tag.icon}"></i>
                        <span>${tag.label}</span>
                        <button class="journal-chip-remove" aria-label="Retirer">
                            <i class="fas fa-times"></i>
                        </button>
                    </span>
                `;
            }).join('');
        }

        // Render pill buttons for tag selection (in header)
        const pillButtonsHTML = this.renderTagPillButtons();

        return `
            <div class="journal-draft-preview ${isEdit ? 'visible' : ''}" id="journalDraftPreview" style="${isEdit ? 'margin-bottom: 8px;' : ''}">
                <div class="journal-draft-header">
                    <div class="journal-draft-pills" id="journalDraftPills">
                        ${pillButtonsHTML}
                    </div>
                    <div class="journal-draft-actions header-actions">
                        <button class="btn-icon-ghost" id="journalDraftCancelBtn" aria-label="Annuler">
                            <i class="fas fa-times"></i>
                        </button>
                        <button class="btn-icon-primary" id="journalDraftSaveBtn" ${isEdit ? '' : 'disabled'} aria-label="Enregistrer">
                            <i class="fas fa-check"></i>
                        </button>
                    </div>
                </div>
                <div class="journal-draft-entry">
                    <div class="journal-entry-date">${formattedDate}</div>
                    <div class="journal-entry-content">
                        <div class="journal-entry-tags" id="journalSelectedTags">
                            ${chipsHTML}
                        </div>
                        <textarea class="journal-note-input" id="journalNoteInput" 
                            placeholder="Précision (optionnel)" 
                            rows="2" maxlength="280">${noteValue}</textarea>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Render pill buttons with dropdowns for tag selection (inside draft)
     * @returns {string} HTML string
     */
    renderTagPillButtons() {
        const positiveTags = this.tags.filter(t => t.category === 'positive');
        const negativeTags = this.tags.filter(t => t.category === 'negative');
        const neutralTags = this.tags.filter(t => t.category === 'neutral');

        const renderPillDropdown = (category, label, icon, tags, color) => {
            const optionsHTML = tags.map(tag => `
                <button class="journal-dropdown-option" data-tag-id="${tag.id}" style="--tag-color: ${tag.color}">
                    <i class="fas ${tag.icon}"></i>
                    <span>${tag.label}</span>
                </button>
            `).join('');

            return `
                <div class="journal-pill-dropdown" data-category="${category}">
                    <button class="journal-pill-btn" style="--pill-color: ${color}">
                        <i class="fas ${icon}"></i>
                        <span>${label}</span>
                        <i class="fas fa-chevron-down journal-pill-arrow"></i>
                    </button>
                    <div class="journal-pill-menu">
                        ${optionsHTML}
                    </div>
                </div>
            `;
        };

        // Neutral tags are rendered as direct buttons (no dropdown)
        const neutralBtnsHTML = neutralTags.map(tag => `
            <button class="journal-pill-btn journal-pill-direct" data-tag-id="${tag.id}" style="--pill-color: ${tag.color}">
                <i class="fas ${tag.icon}"></i>
                <span>${tag.label}</span>
            </button>
        `).join('');

        return `
            ${renderPillDropdown('positive', 'Positif', 'fa-plus-circle', positiveTags, '#10b981')}
            ${renderPillDropdown('negative', 'Négatif', 'fa-minus-circle', negativeTags, '#ef4444')}
            ${neutralBtnsHTML}
        `;
    },

    /**
     * Render just the dropdown buttons for the header
     * @returns {string} HTML string
     */
    renderTagDropdowns() {
        const positiveTags = this.tags.filter(t => t.category === 'positive');
        const negativeTags = this.tags.filter(t => t.category === 'negative');

        const renderDropdown = (category, label, icon, tags, color) => {
            const optionsHTML = tags.map(tag => `
                <button class="journal-dropdown-option" data-tag-id="${tag.id}" style="--tag-color: ${tag.color}">
                    <i class="fas ${tag.icon}"></i>
                    <span>${tag.label}</span>
                </button>
            `).join('');

            return `
                <div class="journal-tag-dropdown" data-category="${category}">
                    <button class="journal-dropdown-trigger" style="--dropdown-color: ${color}">
                        <i class="fas ${icon}"></i>
                        <span>${label}</span>
                        <i class="fas fa-chevron-down journal-dropdown-arrow"></i>
                    </button>
                    <div class="journal-dropdown-menu">
                        ${optionsHTML}
                    </div>
                </div>
            `;
        };

        return `
            ${renderDropdown('positive', 'Positif', 'fa-plus-circle', positiveTags, '#10b981')}
            ${renderDropdown('negative', 'Négatif', 'fa-minus-circle', negativeTags, '#ef4444')}
        `;
    }
};
