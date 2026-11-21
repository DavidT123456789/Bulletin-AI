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
 * Résout `localStorage` ou `sessionStorage` sans lever d'exception si l'accès est bloqué.
 * @param {'localStorage'|'sessionStorage'} [area='localStorage']
 * @returns {Storage|null}
 */
function resolveStorageArea(area = 'localStorage') {
    try {
        return typeof globalThis !== 'undefined' && globalThis[area]
            ? globalThis[area]
            : null;
    } catch {
        return null;
    }
}

/**
 * Résout `localStorage` sans lever d'exception si l'accès est bloqué.
 * @returns {Storage|null}
 */
function resolveStorage() {
    return resolveStorageArea('localStorage');
}

function getFromArea(area, key, fallback = null) {
    const storage = resolveStorageArea(area);
    if (!storage) return fallback;
    try {
        const value = storage.getItem(key);
        return value !== null && value !== undefined ? value : fallback;
    } catch (error) {
        console.warn(`[SafeStorage] Échec lecture ${area} (${key}):`, error);
        return fallback;
    }
}

function setInArea(area, key, value) {
    const storage = resolveStorageArea(area);
    if (!storage) return false;
    try {
        storage.setItem(key, String(value));
        return true;
    } catch (error) {
        console.warn(`[SafeStorage] Échec écriture ${area} (${key}):`, error);
        return false;
    }
}

function removeFromArea(area, key) {
    const storage = resolveStorageArea(area);
    if (!storage) return false;
    try {
        storage.removeItem(key);
        return true;
    } catch (error) {
        console.warn(`[SafeStorage] Échec suppression ${area} (${key}):`, error);
        return false;
    }
}

function getJSONFromArea(area, key, fallback = null, { removeOnCorrupt = false } = {}) {
    const raw = getFromArea(area, key, null);
    if (raw === null || raw === '') return fallback;
    try {
        return JSON.parse(raw);
    } catch (error) {
        console.warn(`[SafeStorage] JSON corrompu pour ${key}:`, error);
        if (removeOnCorrupt) {
            removeFromArea(area, key);
        }
        return fallback;
    }
}

function setJSONInArea(area, key, value) {
    try {
        return setInArea(area, key, JSON.stringify(value));
    } catch (error) {
        console.warn(`[SafeStorage] Échec sérialisation JSON (${key}):`, error);
        return false;
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
        return getFromArea('localStorage', key, fallback);
    },

    /**
     * Écrit une valeur chaîne dans `localStorage`.
     * @param {string} key
     * @param {*} value
     * @returns {boolean} `true` si l'écriture a réussi
     */
    set(key, value) {
        return setInArea('localStorage', key, value);
    },

    /**
     * Supprime une clé de `localStorage`.
     * @param {string} key
     * @returns {boolean}
     */
    remove(key) {
        return removeFromArea('localStorage', key);
    },

    /**
     * Lit et parse une valeur JSON depuis `localStorage`.
     * @param {string} key
     * @param {*} [fallback=null]
     * @param {{ removeOnCorrupt?: boolean }} [options]
     * @returns {*}
     */
    getJSON(key, fallback = null, options = {}) {
        return getJSONFromArea('localStorage', key, fallback, options);
    },

    /**
     * Sérialise et écrit une valeur JSON dans `localStorage`.
     * @param {string} key
     * @param {*} value
     * @returns {boolean}
     */
    setJSON(key, value) {
        return setJSONInArea('localStorage', key, value);
    },

    /**
     * Lit une valeur chaîne depuis `sessionStorage`.
     * @param {string} key
     * @param {*} [fallback=null]
     * @returns {string|*}
     */
    getSession(key, fallback = null) {
        return getFromArea('sessionStorage', key, fallback);
    },

    /**
     * Écrit une valeur chaîne dans `sessionStorage`.
     * @param {string} key
     * @param {*} value
     * @returns {boolean} `true` si l'écriture a réussi
     */
    setSession(key, value) {
        return setInArea('sessionStorage', key, value);
    },

    /**
     * Supprime une clé de `sessionStorage`.
     * @param {string} key
     * @returns {boolean}
     */
    removeSession(key) {
        return removeFromArea('sessionStorage', key);
    },

    /**
     * Lit et parse une valeur JSON depuis `sessionStorage`.
     * @param {string} key
     * @param {*} [fallback=null]
     * @param {{ removeOnCorrupt?: boolean }} [options]
     * @returns {*}
     */
    getSessionJSON(key, fallback = null, options = {}) {
        return getJSONFromArea('sessionStorage', key, fallback, options);
    },

    /**
     * Sérialise et écrit une valeur JSON dans `sessionStorage`.
     * @param {string} key
     * @param {*} value
     * @returns {boolean}
     */
    setSessionJSON(key, value) {
        return setJSONInArea('sessionStorage', key, value);
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
