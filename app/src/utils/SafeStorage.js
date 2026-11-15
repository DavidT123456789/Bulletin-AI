/**
 * @fileoverview Wrapper sécurisé et registre centralisé des clés `localStorage`.
 * Protège chaque accès contre QuotaExceededError, SecurityError (navigation privée stricte,
 * contexte sandboxé) et JSON corrompu, tout en résolvant `globalThis.localStorage`
 * dynamiquement pour rester compatible avec les stubs de tests (`vi.stubGlobal`).
 *
 * Note : `public/boot-theme.js` (script pré-paint) et `src/landing/main.js` (chunk isolé)
 * accèdent aux clés `bulletin_theme` / `bulletin_accent` / `bulletin_custom_accent` /
 * `appreciationGeneratorState_v6.2` / `appreciationGeneratorFirstVisit_v8` sous `try/catch`
 * sans importer ce module ; garder ces noms synchronisés en cas d'évolution.
 *
 * @module utils/SafeStorage
 */

/**
 * Registre unique des clés `localStorage` utilisées par l'application.
 */
export const STORAGE_KEYS = Object.freeze({
    APP_STATE: 'appreciationGeneratorState_v6.2',
    LEGACY_APP_STATES: Object.freeze(['bulletin_app_state', 'appreciationGeneratorState']),
    FIRST_VISIT: 'appreciationGeneratorFirstVisit_v8',

    // Thème et apparence
    THEME: 'bulletin_theme',
    ACCENT: 'bulletin_accent',
    CUSTOM_ACCENT: 'bulletin_custom_accent',

    // Synchronisation Cloud & appareil
    SYNC_PROVIDER: 'bulletin_sync_provider',
    SYNC_AUTO: 'bulletin_sync_auto',
    LAST_SYNC: 'bulletin_last_sync',
    LAST_MODIFIED: 'bulletin_last_modified',
    LAST_SYNC_HASH: 'bulletin_last_sync_hash',
    LAST_SYNC_STUDENTS: 'bulletin_last_sync_students',
    LAST_SYNC_CLASSES: 'bulletin_last_sync_classes',
    LAST_SYNC_ROSTER: 'bulletin_last_sync_roster',
    DEVICE_ID: 'bulletin_device_id',
    GOOGLE_TOKEN: 'bulletin_google_token',
    GOOGLE_USER: 'bulletin_google_user',

    // Préférences UI locales
    SHOW_VIRTUAL_CLASSES: 'bulletin_show_virtual_classes',
    SEATING_ORIENTATION: 'bulletin_seating_orientation',
    SUPPORT_MILESTONE: 'bulletin-ai-support-milestone-v1',
    LAB_PREVIEW_TAB: 'labPreviewTab',
    PWA_INSTALL_DISMISSED: 'pwa_install_dismissed'
});

/**
 * Résout `localStorage` sans lever d'exception si l'accès est bloqué.
 * @returns {Storage|null}
 */
function resolveStorage() {
    try {
        return typeof globalThis !== 'undefined' && globalThis.localStorage
            ? globalThis.localStorage
            : null;
    } catch {
        return null;
    }
}

export const SafeStorage = {
    /**
     * Lit une valeur chaîne depuis `localStorage`.
     * @param {string} key
     * @param {*} [fallback=null]
     * @returns {string|*}
     */
    get(key, fallback = null) {
        const storage = resolveStorage();
        if (!storage) return fallback;
        try {
            const value = storage.getItem(key);
            return value !== null && value !== undefined ? value : fallback;
        } catch (error) {
            console.warn(`[SafeStorage] Échec lecture localStorage (${key}):`, error);
            return fallback;
        }
    },

    /**
     * Écrit une valeur chaîne dans `localStorage`.
     * @param {string} key
     * @param {*} value
     * @returns {boolean} `true` si l'écriture a réussi
     */
    set(key, value) {
        const storage = resolveStorage();
        if (!storage) return false;
        try {
            storage.setItem(key, String(value));
            return true;
        } catch (error) {
            console.warn(`[SafeStorage] Échec écriture localStorage (${key}):`, error);
            return false;
        }
    },

    /**
     * Supprime une clé de `localStorage`.
     * @param {string} key
     * @returns {boolean}
     */
    remove(key) {
        const storage = resolveStorage();
        if (!storage) return false;
        try {
            storage.removeItem(key);
            return true;
        } catch (error) {
            console.warn(`[SafeStorage] Échec suppression localStorage (${key}):`, error);
            return false;
        }
    },

    /**
     * Lit et parse une valeur JSON depuis `localStorage`.
     * @param {string} key
     * @param {*} [fallback=null]
     * @param {{ removeOnCorrupt?: boolean }} [options]
     * @returns {*}
     */
    getJSON(key, fallback = null, { removeOnCorrupt = false } = {}) {
        const raw = this.get(key, null);
        if (raw === null || raw === '') return fallback;
        try {
            return JSON.parse(raw);
        } catch (error) {
            console.warn(`[SafeStorage] JSON corrompu pour ${key}:`, error);
            if (removeOnCorrupt) {
                this.remove(key);
            }
            return fallback;
        }
    },

    /**
     * Sérialise et écrit une valeur JSON dans `localStorage`.
     * @param {string} key
     * @param {*} value
     * @returns {boolean}
     */
    setJSON(key, value) {
        try {
            return this.set(key, JSON.stringify(value));
        } catch (error) {
            console.warn(`[SafeStorage] Échec sérialisation JSON (${key}):`, error);
            return false;
        }
    },

    /**
     * Supprime toutes les clés correspondant aux préfixes/sous-chaînes ou à une liste explicite.
     * Utilisé notamment pour la réinitialisation complète (`factoryReset`).
     * @param {string[]} [prefixes=[]]
     * @param {string[]} [explicitKeys=[]]
     * @param {string[]} [contains=[]]
     * @returns {number} Nombre de clés supprimées (ou tentées)
     */
    removeMatching({ prefixes = [], explicitKeys = [], contains = [] } = {}) {
        const storage = resolveStorage();
        if (!storage) return 0;

        const keysToRemove = new Set(explicitKeys);
        try {
            if (typeof storage.length === 'number' && typeof storage.key === 'function') {
                for (let i = 0; i < storage.length; i++) {
                    const key = storage.key(i);
                    if (!key) continue;
                    const matchesPrefix = prefixes.some(p => key.startsWith(p));
                    const matchesContains = contains.some(s => key.includes(s));
                    if (matchesPrefix || matchesContains) {
                        keysToRemove.add(key);
                    }
                }
            }
        } catch (error) {
            console.warn('[SafeStorage] Échec énumération localStorage:', error);
        }

        let removed = 0;
        for (const key of keysToRemove) {
            if (this.remove(key)) removed++;
        }
        return removed;
    }
};
