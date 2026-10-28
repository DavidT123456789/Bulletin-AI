/**
 * @fileoverview Gestionnaire de stockage local (LocalStorage, IndexedDB) et de synchronisation Cloud.
 * 
 * Contrat de cycle de vie et rôles des clés LocalStorage utilisées pour la synchronisation :
 * 
 * 1. bulletin_sync_provider :
 *    - Rôle : Identifiant du fournisseur Cloud actif (ex: 'google', 'dropbox').
 *    - Cycle de vie : Configuré à la connexion, persisté, supprimé lors d'une déconnexion/factory reset.
 * 
 * 2. bulletin_last_sync :
 *    - Rôle : Horodatage (timestamp MS) de la dernière action de synchronisation réussie (Push/Pull).
 *    - Cycle de vie : Mis à jour après chaque forceUpload ou forceDownload. Supprimé lors d'un factory reset.
 * 
 * 3. bulletin_last_modified :
 *    - Rôle : Horodatage (timestamp MS) de la dernière modification locale effectuée par l'utilisateur.
 *    - Cycle de vie : Mis à jour lors de modifications de données (via saveAppState). Alignée avec bulletin_last_sync après synchro.
 * 
 * 4. bulletin_last_sync_hash :
 *    - Rôle : Empreinte de données (hash JSON) de la configuration (hors clés de navigation/UI) + des élèves au moment de la synchro.
 *    - Cycle de vie : Permet la détection de retour à l'état initial (modify -> cancel -> back to "À jour").
 * 
 * 5. bulletin_device_id :
 *    - Rôle : Identifiant unique de l'appareil généré au premier démarrage.
 *    - Cycle de vie : Persisté indéfiniment pour la résolution de conflits de synchro, supprimé au factory reset.
 * 
 * 6. bulletin_restore_pending :
 *    - Rôle : Flag d'annulation de restauration en cours de validité (durée max 1h).
 *    - Cycle de vie : Temporaire, supprimé dès confirmation de restauration réussie.
 * 
 * @module managers/StorageManager
 */

import { appState, userSettings, runtimeState } from '../state/State.js';
import { CONFIG, APP_VERSION, DEFAULT_PROMPT_TEMPLATES, DEFAULT_IA_CONFIG, DEFAULT_EVOLUTION_THRESHOLDS, DEFAULT_PRIVACY_SETTINGS, DEFAULT_SEATING_STATUS_DOTS } from '../config/Config.js';
import { API_KEY_PROVIDER_IDS } from '../config/providers.js';
import { DBService } from '../services/DBService.js';
import { Utils } from '../utils/Utils.js';
import { bus, EVENTS } from '../core/EventBus.js';
import { ClassManager } from './ClassManager.js';

let UI;
let App;

/** @const {string[]} Clés de paramètres correspondant aux clés API des fournisseurs Cloud */
const API_KEY_SETTINGS_KEYS = API_KEY_PROVIDER_IDS.map(id => `${id}ApiKey`);

/** @const {string[]} Clés de navigation, d'interface et d'exécution locale à ignorer lors du calcul du hash de données */
const UI_AND_NAV_KEYS = [
    'theme',
    'accentColor',
    'isAppreciationFullView',
    'activeView',
    'seatingStatusDots',
    'currentClassId',
    'currentPeriod',
    'currentSubject',
    'currentInputMode',
    'activeStatFilter',
    'apiKeyStatus',
    'validatedApiKeys',
    'ollamaBaseUrl',
    'ollamaInstalledModels',
    'ollamaEnabled'
];

export const StorageManager = {
    TAB_SYNC_CHANNEL_NAME: 'bulletin_ai_state_sync',
    _tabId: `tab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    _broadcastChannel: null,
    _boundOnStorageEvent: null,
    _isReloadingFromTabSync: false,
    _lastSavedTimestamp: 0,
    _savePromise: null,
    _saveQueue: Promise.resolve(),
    _lastSaveHash: null,
    _lastResultsSaveHash: null,
    _lastClassesSaveHash: null,
    _lastDataHash: null,
    _isFirstLoadSave: false,

    init(ui, app) {
        UI = ui;
        App = app;
        this._savePromise = null;
        this._saveQueue = Promise.resolve();
        this._lastSaveHash = null;
        this._lastResultsSaveHash = null;
        this._lastClassesSaveHash = null;
        this._lastDataHash = null;
        this._isReloadingFromTabSync = false;
        this._initTabSync();
        try {
            Promise.resolve(DBService.open?.()).catch(() => {});
        } catch (_) {}
    },

    /**
     * Initialise la synchronisation inter-onglets via BroadcastChannel
     * avec repli sur window.addEventListener('storage').
     */
    _initTabSync() {
        this.closeTabSync();

        if (typeof BroadcastChannel !== 'undefined') {
            try {
                const channel = new BroadcastChannel(this.TAB_SYNC_CHANNEL_NAME);
                channel.onmessage = (event) => {
                    this._handleTabSyncMessage(event?.data);
                };
                if (typeof channel.unref === 'function') {
                    channel.unref();
                }
                this._broadcastChannel = channel;
            } catch (_) {
                this._broadcastChannel = null;
            }
        }

        if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
            this._boundOnStorageEvent = (event) => this._handleStorageEvent(event);
            window.addEventListener('storage', this._boundOnStorageEvent);
        }
    },

    /**
     * Ferme proprement le canal BroadcastChannel et retire l'écouteur storage.
     */
    closeTabSync() {
        if (this._broadcastChannel) {
            try {
                this._broadcastChannel.onmessage = null;
                this._broadcastChannel.close();
            } catch (_) { /* ignore */ }
            this._broadcastChannel = null;
        }
        if (this._boundOnStorageEvent && typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
            window.removeEventListener('storage', this._boundOnStorageEvent);
            this._boundOnStorageEvent = null;
        }
    },

    /**
     * Traite une notification de mise à jour d'état reçue d'un autre onglet.
     * @param {Object} data
     */
    async _handleTabSyncMessage(data) {
        if (!data || data.type !== 'STATE_UPDATED') return;
        const senderTabId = data.sourceTabId || data.tabId || null;
        if (senderTabId && senderTabId === this._tabId) return;
        if (this._isReloadingFromTabSync) return;
        if (data.saveHash && this._lastSaveHash && data.saveHash === this._lastSaveHash) return;
        if (data.timestamp && this._lastSavedTimestamp && data.timestamp < this._lastSavedTimestamp) return;

        this._isReloadingFromTabSync = true;
        try {
            if (data.timestamp) {
                this._lastSavedTimestamp = data.timestamp;
            }
            await this.loadAppState({ checkPendingRestore: false, fromTabSync: true });
            if (App?.updateUIOnLoad) {
                App.updateUIOnLoad();
            }
            window.SyncService?.refreshLocalIndicator?.();
            bus.emit(EVENTS.TAB_SYNC_RECEIVED, {
                type: 'STATE_UPDATED',
                timestamp: data.timestamp || Date.now(),
                sourceTabId: senderTabId,
                tabId: senderTabId,
                deviceId: data.deviceId || null,
                dataHash: data.dataHash || null
            });
        } finally {
            this._isReloadingFromTabSync = false;
        }
    },

    /**
     * Fallback via l'événement DOM 'storage' lorsque BroadcastChannel est indisponible.
     * @param {StorageEvent} event
     */
    async _handleStorageEvent(event) {
        if (!event || event.key !== CONFIG.LS_APP_STATE_KEY || !event.newValue) return;
        if (this._isReloadingFromTabSync) return;

        try {
            const parsed = JSON.parse(event.newValue);
            const remoteUpdatedAt = parsed?.updatedAt || 0;
            if (remoteUpdatedAt && this._lastSavedTimestamp && remoteUpdatedAt <= this._lastSavedTimestamp) {
                return;
            }
            const resultsSaveHash = this._computeResultsSaveHash(runtimeState.data.generatedResults);
            const candidateSaveHash = `${this._hashString(event.newValue)}:${resultsSaveHash}`;
            if (this._lastSaveHash && candidateSaveHash === this._lastSaveHash) {
                return;
            }

            await this._handleTabSyncMessage({
                type: 'STATE_UPDATED',
                timestamp: remoteUpdatedAt || Date.now(),
                sourceTabId: parsed?.sourceTabId || 'storage_event',
                deviceId: parsed?.deviceId || null,
                saveHash: candidateSaveHash
            });
        } catch (_) {
            /* ignore malformed storage payload */
        }
    },

    _safeLocalStorageSet(key, value, { notifyOnQuota = false } = {}) {
        try {
            localStorage.setItem(key, value);
            return true;
        } catch (error) {
            console.warn(`[StorageManager] Échec écriture localStorage (${key}):`, error);
            if (notifyOnQuota && UI?.showNotification) {
                UI.showNotification(
                    'Espace de stockage local saturé. Les données élèves restent sauvegardées dans IndexedDB.',
                    'warning'
                );
            }
            return false;
        }
    },

    _ensureStudentId(student) {
        if (student && typeof student.id === 'string' && student.id.trim() !== '') {
            return student;
        }
        return {
            ...student,
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 11)
        };
    },

    _isValidLocalOllamaUrl(url) {
        if (typeof url !== 'string' || !url.trim()) return false;
        return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/.*)?$/i.test(url.trim());
    },

    _hashString(str) {
        let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
        for (let i = 0, ch; i < str.length; i++) {
            ch = str.charCodeAt(i);
            h1 = Math.imul(h1 ^ ch, 2654435761);
            h2 = Math.imul(h2 ^ ch, 1597334677);
        }
        h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
        h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
        h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
        h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
        return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
    },

    /**
     * Applique un objet settings (issu de localStorage ou d'IndexedDB appData)
     * sur userSettings et runtimeState.
     * @private
     * @param {Object} settings
     * @param {Object} [options]
     * @param {boolean} [options.skipNavigation=false] - Conserver la navigation propre à l'onglet
     *   (classe active, vue, période, matière, mode de saisie, filtre) lors d'une synchro inter-onglets
     */
    _applyLoadedSettings(settings, { skipNavigation = false } = {}) {
        if (!settings || typeof settings !== 'object') return;

        // UI Settings
        if (settings.theme !== undefined) userSettings.ui.theme = settings.theme;
        if (settings.accentColor !== undefined) userSettings.ui.accentColor = settings.accentColor;
        if (settings.isAppreciationFullView !== undefined) userSettings.ui.isAppreciationFullView = settings.isAppreciationFullView;
        if (settings.seatingStatusDots !== undefined && settings.seatingStatusDots && typeof settings.seatingStatusDots === 'object') {
            userSettings.ui.seatingStatusDots = {
                ...DEFAULT_SEATING_STATUS_DOTS,
                ...settings.seatingStatusDots
            };
        }

        // Academic Settings
        if (settings.periodSystem !== undefined) userSettings.academic.periodSystem = settings.periodSystem;
        if (settings.useSubjectPersonalization !== undefined) userSettings.academic.useSubjectPersonalization = settings.useSubjectPersonalization;
        if (settings.evolutionThresholds !== undefined) userSettings.academic.evolutionThresholds = settings.evolutionThresholds;
        if (settings.subjects !== undefined) userSettings.academic.subjects = settings.subjects;
        // Multi-class support
        if (settings.classes !== undefined) userSettings.academic.classes = settings.classes;
        if (settings.classesCustomOrder !== undefined) userSettings.academic.classesCustomOrder = Boolean(settings.classesCustomOrder);
        if (settings.classesSortDirection === 'asc' || settings.classesSortDirection === 'desc') {
            userSettings.academic.classesSortDirection = settings.classesSortDirection;
        }
        if (settings.seatingGrid !== undefined) userSettings.academic.seatingGrid = settings.seatingGrid;
        if (settings.seatingActivityGrid !== undefined) userSettings.academic.seatingActivityGrid = settings.seatingActivityGrid;

        // Journal threshold
        if (settings.journalThreshold !== undefined) userSettings.academic.journalThreshold = settings.journalThreshold;

        if (settings.currentAIModel !== undefined) {
            let model = settings.currentAIModel;
            if (model === 'groq-llama-3.3-70b') model = 'groq-gpt-oss-120b';
            else if (model === 'groq-llama-3.1-8b' || model === 'groq-gemma-2-9b') model = 'groq-gpt-oss-20b';
            userSettings.api.currentAIModel = model;
        }
        if (settings.enableApiFallback !== undefined) userSettings.api.enableApiFallback = settings.enableApiFallback;
        if (settings.openaiApiKey !== undefined) userSettings.api.openaiApiKey = settings.openaiApiKey;
        if (settings.googleApiKey !== undefined) userSettings.api.googleApiKey = settings.googleApiKey;
        if (settings.groqApiKey !== undefined) userSettings.api.groqApiKey = settings.groqApiKey;
        if (settings.openrouterApiKey !== undefined) userSettings.api.openrouterApiKey = settings.openrouterApiKey;
        if (settings.anthropicApiKey !== undefined) userSettings.api.anthropicApiKey = settings.anthropicApiKey;
        if (settings.mistralApiKey !== undefined) userSettings.api.mistralApiKey = settings.mistralApiKey;
        if (settings.apiKeyStatus !== undefined) runtimeState.apiStatus = settings.apiKeyStatus;
        if (settings.validatedApiKeys !== undefined) runtimeState.validatedApiKeys = settings.validatedApiKeys;

        // Ollama Settings (restricted to local loopback addresses)
        if (settings.ollamaEnabled !== undefined) userSettings.api.ollamaEnabled = settings.ollamaEnabled;
        if (this._isValidLocalOllamaUrl(settings.ollamaBaseUrl)) userSettings.api.ollamaBaseUrl = settings.ollamaBaseUrl.trim();
        if (settings.ollamaInstalledModels !== undefined) userSettings.api.ollamaInstalledModels = settings.ollamaInstalledModels;

        // Import Settings
        if (settings.massImportFormats !== undefined) userSettings.import.massImportFormats = settings.massImportFormats;

        // Privacy Settings
        if (settings.privacy !== undefined) userSettings.privacy = settings.privacy;
        if (settings.anonymizeData !== undefined && !settings.privacy) userSettings.privacy = { anonymizeData: settings.anonymizeData };

        // Navigation State (propre à chaque onglet : ignorée lors d'une synchro inter-onglets)
        if (!skipNavigation) {
            if (settings.currentClassId !== undefined) userSettings.academic.currentClassId = settings.currentClassId;
            if (settings.activeView !== undefined) userSettings.ui.activeView = settings.activeView;
            if (settings.currentPeriod !== undefined) runtimeState.navigation.currentPeriod = settings.currentPeriod;
            if (settings.currentSubject !== undefined) runtimeState.navigation.currentSubject = settings.currentSubject;
            if (settings.currentInputMode !== undefined) runtimeState.navigation.currentInputMode = settings.currentInputMode;
            if (settings.activeStatFilter !== undefined) runtimeState.navigation.activeStatFilter = settings.activeStatFilter;
        }

        // Data Settings
        if (settings.deletedItems !== undefined && settings.deletedItems && typeof settings.deletedItems === 'object') {
            runtimeState.data.deletedItems = {
                students: Array.isArray(settings.deletedItems.students) ? settings.deletedItems.students : [],
                classes: Array.isArray(settings.deletedItems.classes) ? settings.deletedItems.classes : []
            };
        }

        // Fallback thème si non défini - respecte bulletin_theme ou 'light' par défaut
        if (!userSettings.ui.theme) {
            userSettings.ui.theme = localStorage.getItem('bulletin_theme') || 'light';
        }
    },

    async loadAppState({ checkPendingRestore = true, fromTabSync = false } = {}) {
        let loadFailed = false;
        try {
            try {
                const lastSyncHash = localStorage.getItem('bulletin_last_sync_hash');
                if (lastSyncHash && (lastSyncHash.length > 64 || lastSyncHash.startsWith('{'))) {
                    this._safeLocalStorageSet('bulletin_last_sync_hash', this._hashString(lastSyncHash));
                }
            } catch (e) {
                console.warn('[StorageManager] Failed to migrate old sync hash:', e);
                localStorage.removeItem('bulletin_last_sync_hash');
            }

            const savedState = localStorage.getItem(CONFIG.LS_APP_STATE_KEY);
            let hasLoadedSettingsFromLS = false;
            if (savedState) {
                const parsedState = JSON.parse(savedState);

                if (parsedState.settings) {
                    this._applyLoadedSettings(parsedState.settings, { skipNavigation: fromTabSync });
                    hasLoadedSettingsFromLS = true;
                }

                // MIGRATION: LocalStorage -> IndexedDB
                if (parsedState.generatedResults && parsedState.generatedResults.length > 0) {
                    let migratedResults = this.migrateData(parsedState.generatedResults);
                    migratedResults = Utils.deduplicateResults(migratedResults);
                    await DBService.putAll('generatedResults', migratedResults);
                    runtimeState.data.generatedResults = migratedResults;

                    delete parsedState.generatedResults;
                    this._safeLocalStorageSet(CONFIG.LS_APP_STATE_KEY, JSON.stringify(parsedState));
                }
            } else {
                userSettings.academic.subjects = JSON.parse(JSON.stringify(DEFAULT_PROMPT_TEMPLATES));
                userSettings.ui.theme = localStorage.getItem('bulletin_theme') || 'light';
            }

            // 1. Chargement des élèves depuis le store 'generatedResults' (toujours en premier)
            const dbResults = await DBService.getAll('generatedResults');
            if (dbResults && dbResults.length > 0) {
                runtimeState.data.generatedResults = dbResults;
                runtimeState.data.generatedResults = this.migrateData(runtimeState.data.generatedResults);
                const originalCount = runtimeState.data.generatedResults.length;
                runtimeState.data.generatedResults = Utils.deduplicateResults(runtimeState.data.generatedResults);

                if (runtimeState.data.generatedResults.length < originalCount) {
                    if (typeof DBService.replaceAll === 'function') {
                        await DBService.replaceAll('generatedResults', runtimeState.data.generatedResults);
                    } else {
                        await DBService.clear('generatedResults');
                        await DBService.putAll('generatedResults', runtimeState.data.generatedResults);
                    }
                } else if (this._lastMigrationChanged) {
                    await DBService.putAll('generatedResults', runtimeState.data.generatedResults);
                }
            } else if (!runtimeState.data.generatedResults || runtimeState.data.generatedResults.length === 0) {
                runtimeState.data.generatedResults = [];
            }

            // 2. Chargement / Migration transparente v2 des stores 'classes' et 'appData'
            try {
                if (!hasLoadedSettingsFromLS && typeof DBService.get === 'function') {
                    const dbSettingsRecord = await DBService.get('appData', 'userSettings');
                    if (dbSettingsRecord?.value && typeof dbSettingsRecord.value === 'object') {
                        this._applyLoadedSettings(dbSettingsRecord.value.settings || dbSettingsRecord.value, { skipNavigation: fromTabSync });
                    }
                }

                if (typeof DBService.get === 'function') {
                    const dbDeletedRecord = await DBService.get('appData', 'deletedItems');
                    if (dbDeletedRecord?.value && typeof dbDeletedRecord.value === 'object') {
                        const hasLocalDeleted = (runtimeState.data?.deletedItems?.students?.length || 0) > 0 ||
                            (runtimeState.data?.deletedItems?.classes?.length || 0) > 0;
                        if (fromTabSync || !hasLocalDeleted) {
                            runtimeState.data.deletedItems = {
                                students: Array.isArray(dbDeletedRecord.value.students) ? dbDeletedRecord.value.students : [],
                                classes: Array.isArray(dbDeletedRecord.value.classes) ? dbDeletedRecord.value.classes : []
                            };
                        }
                    }
                }

                if (typeof DBService.getAll === 'function') {
                    const dbClasses = await DBService.getAll('classes');
                    const validDbClasses = Array.isArray(dbClasses)
                        ? dbClasses.filter(c => c && typeof c.id === 'string' && typeof c.name === 'string')
                        : [];
                    if (validDbClasses.length > 0 && (fromTabSync || !userSettings.academic.classes || userSettings.academic.classes.length === 0)) {
                        userSettings.academic.classes = validDbClasses;
                    } else if (!fromTabSync && userSettings.academic.classes?.length > 0 && validDbClasses.length === 0 && typeof DBService.replaceAll === 'function') {
                        // Migration ascendante transparente v1 -> v2 : persiste les classes existantes dans le store 'classes'
                        await DBService.replaceAll('classes', userSettings.academic.classes);
                        this._lastClassesSaveHash = this._hashString(JSON.stringify(userSettings.academic.classes));
                    }
                }
            } catch (_) {
                /* tolérance aux mocks partiels de DBService dans certains tests */
            }

            // Purge detection: classes or previous sync student count exist, but IndexedDB was evicted
            const classes = userSettings.academic.classes || [];
            const hasClasses = classes.length > 0;
            const hasNoStudents = runtimeState.data.generatedResults.length === 0;
            const hadSyncBefore = !!localStorage.getItem('bulletin_sync_provider');
            const lastSyncStudents = parseInt(localStorage.getItem('bulletin_last_sync_students') || '0', 10);

            if (hasNoStudents && ((hasClasses && hadSyncBefore) || lastSyncStudents > 0)) {
                runtimeState._dataPurgeDetected = true;
                setTimeout(() => {
                    UI?.showNotification(
                        'Données élèves manquantes — Ouvrez le menu puis « Restaurer depuis le Cloud »',
                        'warning',
                        8000
                    );
                }, 1500);
            } else {
                runtimeState._dataPurgeDetected = false;
            }

            this._ensureValidActiveClass();
            this._updateFilteredResultsForCurrentClass();

        } catch (e) {
            loadFailed = true;
            console.error("Erreur chargement données (StorageManager):", e);
            if (UI) UI.showNotification("Erreur au chargement des données.", 'error');
        }

        this._ensureDefaultState();
        this._ensureConfigUpgrades();

        if (!loadFailed) {
            if (fromTabSync) {
                const settings = this._buildSettingsSnapshot();
                const stringifiedSettings = JSON.stringify({ version: APP_VERSION, settings });
                const resultsSaveHash = this._computeResultsSaveHash(runtimeState.data.generatedResults);
                this._lastResultsSaveHash = resultsSaveHash;
                this._lastClassesSaveHash = this._hashString(JSON.stringify(userSettings.academic.classes || []));
                this._lastDataHash = this.computeCurrentDataHash();
                this._lastSaveHash = `${this._hashString(stringifiedSettings)}:${resultsSaveHash}`;
            } else {
                this._isFirstLoadSave = true;
                await this.saveAppState();
            }
            bus.emit(EVENTS.STATE_LOADED, {
                fromTabSync,
                studentCount: (runtimeState.data.generatedResults || []).length,
                classCount: (userSettings.academic.classes || []).length
            });
        }

        this._requestPersistentStorage();
        if (checkPendingRestore && !fromTabSync) {
            this._checkPendingRestore();
        }
    },

    async _requestPersistentStorage() {
        if (!navigator.storage?.persist) return;
        try {
            const alreadyPersisted = await navigator.storage.persisted();
            if (alreadyPersisted) return;
            await navigator.storage.persist();
        } catch { /* non-critical */ }
    },

    /**
     * Garantit que la classe active existe toujours (classe physique ou virtuelle reconstituée).
     * À appeler une fois `classes` ET `generatedResults` à jour (les classes virtuelles dérivent des élèves).
     * - Conserve la classe active si elle existe (sauf démo quand `preferRealClass` et qu'une vraie classe existe).
     * - Sinon, sélectionne la première classe réelle, à défaut la première classe de la liste.
     * @private
     * @param {Object} [options]
     * @param {boolean} [options.preferRealClass=false] - Quitter la « Classe exemple » au profit d'une vraie classe (après import)
     */
    _ensureValidActiveClass({ preferRealClass = false } = {}) {
        const classes = ClassManager.getAllClasses();
        const currentId = userSettings.academic.currentClassId;
        const realClass = classes.find(c => !ClassManager.isDemoClass(c.id));
        const currentExists = Boolean(ClassManager.getClassById(currentId));
        const leaveDemo = preferRealClass && Boolean(realClass) && ClassManager.isDemoClass(currentId);

        const nextId = currentExists && !leaveDemo
            ? currentId
            : ((realClass || classes[0])?.id ?? null);
        userSettings.academic.currentClassId = nextId;
        appState.currentClassId = nextId;
    },

    /**
     * Met à jour `runtimeState.data.filteredResults` en fonction de la classe active courante.
     * @private
     */
    _updateFilteredResultsForCurrentClass() {
        runtimeState.data.filteredResults = ClassManager.getStudentsForClass(
            userSettings.academic.currentClassId,
            runtimeState.data.generatedResults || []
        );
    },

    async savePreRestoreSnapshot() {
        try {
            const results = runtimeState.data.generatedResults || [];
            if (results.length === 0) return;

            const snapshot = {
                key: 'pre_restore_backup',
                createdAt: Date.now(),
                settings: this.getExportableSettings(),
                classes: userSettings.academic.classes || [],
                deletedItems: runtimeState.data?.deletedItems || { students: [], classes: [] },
                generatedResults: results
            };
            await DBService.put('appData', snapshot);
            this._safeLocalStorageSet('bulletin_restore_pending', Date.now().toString());
        } catch { /* best-effort */ }
    },

    async getPreRestoreSnapshot() {
        try {
            const backup = await DBService.get('appData', 'pre_restore_backup');
            if (backup && backup.generatedResults && backup.generatedResults.length > 0) {
                // Expire après 24h
                if (Date.now() - (backup.createdAt || 0) > 86400000) {
                    await this.clearPreRestoreSnapshot();
                    return null;
                }
                return backup;
            }
            return null;
        } catch {
            return null;
        }
    },

    async clearPreRestoreSnapshot() {
        try {
            await DBService.delete('appData', 'pre_restore_backup');
            localStorage.removeItem('bulletin_restore_pending');
        } catch { /* best-effort */ }
    },

    async restorePreRestoreSnapshot() {
        const backup = await this.getPreRestoreSnapshot();
        if (!backup) return false;
        const res = await this.importBackup(JSON.stringify(backup), { mergeData: false, silent: true, skipSnapshot: true });
        if (res?.success) {
            await this.clearPreRestoreSnapshot();
            return true;
        }
        return false;
    },

    async _checkPendingRestore() {
        const flag = localStorage.getItem('bulletin_restore_pending');
        if (!flag) return;
        localStorage.removeItem('bulletin_restore_pending');

        const elapsed = Date.now() - parseInt(flag);
        if (elapsed > 3600000) return;

        try {
            const backup = await DBService.get('appData', 'pre_restore_backup');
            if (!backup?.generatedResults?.length) return;

            const count = backup.generatedResults.length;
            setTimeout(() => {
                if (UI?.showUndoNotification) {
                    UI.showUndoNotification(
                        `${count} élève${count > 1 ? 's' : ''} synchronisé${count > 1 ? 's' : ''} depuis le Cloud`,
                        async () => {
                            const restored = await this.restorePreRestoreSnapshot();
                            if (restored) {
                                UI?.showNotification('État précédent restauré.', 'success');
                                const { RestoreTransitionManager } = await import('./RestoreTransitionManager.js');
                                RestoreTransitionManager.rehydrateAndTransition({
                                    title: 'Restauration de la copie',
                                    successTitle: 'État précédent restauré.',
                                    subtitle: 'Restauration de votre état antérieur...',
                                    count
                                }).catch(() => {});
                            }
                        },
                        {
                            title: 'Restauration réussie',
                            duration: 7000,
                            type: 'success'
                        }
                    );
                }
            }, 800);
        } catch { /* snapshot unavailable */ }
    },

    _ensureDefaultState() {
        const subjects = userSettings.academic.subjects;
        if (!subjects || typeof subjects !== 'object') {
            userSettings.academic.subjects = {};
        }
        for (const subjectName in DEFAULT_PROMPT_TEMPLATES) {
            if (!userSettings.academic.subjects[subjectName]) {
                userSettings.academic.subjects[subjectName] = JSON.parse(JSON.stringify(DEFAULT_PROMPT_TEMPLATES[subjectName]));
            }
        }
    },

    _ensureConfigUpgrades() {
        const subjects = userSettings.academic.subjects;
        for (const subjectName in subjects) {
            if (!subjects[subjectName].iaConfig) {
                subjects[subjectName].iaConfig = JSON.parse(JSON.stringify(DEFAULT_IA_CONFIG));
            } else {
                const config = subjects[subjectName].iaConfig;
                if (config.instructions) {
                    config.styleInstructions = config.instructions;
                    delete config.instructions;
                }
                const lengthMap = { 1: 20, 2: 35, 3: 60, 4: 80, 5: 100 };
                if (typeof config.length === 'number' && config.length <= 5) {
                    config.length = lengthMap[config.length] || 60;
                }

                for (const configKey in DEFAULT_IA_CONFIG) {
                    if (config[configKey] === undefined) {
                        config[configKey] = JSON.parse(JSON.stringify(DEFAULT_IA_CONFIG[configKey]));
                    }
                }

            }


        }

        // Nettoyer les anciennes propriétés obsolètes
        if (!userSettings.import.massImportFormats) {
            userSettings.import.massImportFormats = { trimestres: {}, semestres: {} };
        }

        if (!subjects[runtimeState.navigation.currentSubject]) {
            runtimeState.navigation.currentSubject = 'MonStyle';
        }

        const validPeriods = userSettings.academic.periodSystem === 'semestres' ? ['S1', 'S2'] : ['T1', 'T2', 'T3'];
        if (!validPeriods.includes(runtimeState.navigation.currentPeriod)) {
            runtimeState.navigation.currentPeriod = validPeriods[0];
        }

        // Migration de modèles obsolètes vers la version stable actuelle
        const deprecatedGeminiFlash = [
            'gemini-1.5-flash', 'gemini-1.5-flash-001', 
            'gemini-2.0-flash-lite', 'gemini-2.5-flash', 'gemini-3.1-flash', 'gemini-3-flash-preview', 
            'gemini-3.1-flash-lite-preview', 'gemini-3.5-flash'
        ];
        if (deprecatedGeminiFlash.includes(userSettings.api.currentAIModel)) {
            userSettings.api.currentAIModel = 'gemini-3.6-flash';
        }
        // Migration Claude legacy
        if (['anthropic-claude-sonnet-4.5', 'anthropic-claude-sonnet-4.6', 'claude-sonnet-4.6'].includes(userSettings.api.currentAIModel)) {
            userSettings.api.currentAIModel = 'anthropic-claude-sonnet-5';
        }
        if (['anthropic-claude-opus-4.5', 'anthropic-claude-opus-4.6'].includes(userSettings.api.currentAIModel)) {
            userSettings.api.currentAIModel = 'anthropic-claude-opus-5';
        }
        // Migration Devstral free (déprécié 27 jan 2026)
        if (userSettings.api.currentAIModel === 'devstral-free') {
            userSettings.api.currentAIModel = 'llama-3.3-70b-free';
        }
        // Migration anciens Gemini Pro vers 3.1 Pro
        if (['gemini-3-pro', 'gemini-2.5-pro'].includes(userSettings.api.currentAIModel)) {
            userSettings.api.currentAIModel = 'gemini-3.1-pro-preview';
        }
        // Migration anciens Ollama
        if (['ollama-qwen3:8b', 'ollama-qwen3:4b'].includes(userSettings.api.currentAIModel)) {
            userSettings.api.currentAIModel = 'ollama-qwen2.5:7b';
        }
        if (['ollama-gemma3:4b'].includes(userSettings.api.currentAIModel)) {
            userSettings.api.currentAIModel = 'ollama-gemma2:9b';
        }
        if (userSettings.api.currentAIModel === 'ollama-mistral') {
            userSettings.api.currentAIModel = 'ollama-mistral:7b';
        }
        // Migration OpenAI legacy (GPT-4o retiré fév 2026)
        if (['openai-gpt-4o', 'openai-gpt-3.5-turbo', 'openai-gpt-4-turbo'].includes(userSettings.api.currentAIModel)) {
            userSettings.api.currentAIModel = 'openai-o3-mini';
        }
    },





    migrateData(results) {
        if (!Array.isArray(results)) return [];
        let migrationNeeded = false;
        const migratedResults = results.map(result => {
            const sd = result.studentData || {};
            if (sd.moyT1 !== undefined || sd.appT1 !== undefined || !sd.periods) {
                migrationNeeded = true;
                sd.periods = {
                    'T1': { grade: sd.moyT1 ?? null, appreciation: sd.appT1 ?? '' },
                    'T2': { grade: sd.moyT2 ?? null, appreciation: sd.appT2 ?? '' },
                    'T3': { grade: sd.moyT3 ?? null, appreciation: '' }
                };
                delete sd.moyT1; delete sd.appT1; delete sd.moyT2; delete sd.appT2; delete sd.moyT3;
            }

            if (sd.quarterMode) { sd.currentPeriod = sd.quarterMode; delete sd.quarterMode; }
            if (result.strengthsWeaknesses === undefined) result.strengthsWeaknesses = null;
            if (result.nextSteps === undefined) result.nextSteps = null;
            if (result.tokenUsage === undefined || result.tokenUsage === null || !result.tokenUsage.appreciation) result.tokenUsage = { appreciation: result.tokenUsage || null, sw: null, ns: null };
            // Migration: negativeInstructions → periods[].context
            if (sd.negativeInstructions) {
                const hasAnyPeriodContext = Object.values(sd.periods || {}).some(p => p?.context);
                if (!hasAnyPeriodContext) {
                    const targetPeriod = sd.currentPeriod || Object.keys(sd.periods || {})[0];
                    if (targetPeriod && sd.periods?.[targetPeriod]) {
                        sd.periods[targetPeriod].context = sd.negativeInstructions;
                        migrationNeeded = true;
                    }
                }
            }
            delete sd.negativeInstructions;
            if (sd.prompts === undefined) { sd.prompts = { appreciation: sd.promptUsed || null, sw: null, ns: null }; delete sd.promptUsed; }
            if (result.copied === undefined) result.copied = false;

            if (sd.statut !== undefined) {
                migrationNeeded = true;
                sd.statuses = sd.statut ? [sd.statut] : [];
                delete sd.statut;
            } else if (sd.statuses === undefined) {
                sd.statuses = [];
            }

            if (sd.generationMode) {
                delete sd.generationMode;
                migrationNeeded = true;
            }

            if (result.wasGenerated === undefined) {
                // Heuristic: If there is an appreciation and it's not pending, assume it was generated
                result.wasGenerated = !!(result.appreciation && result.appreciation.trim());
            }

            // MIGRATION: historyState → historyPerPeriod (period-scoped history)
            // CRITICAL: Only use generationPeriod (immutable) — never sd.currentPeriod
            // because currentPeriod changes as the user navigates, causing S1 history
            // to be incorrectly assigned to S2.
            if (result.historyState?.versions?.length > 0) {
                if (!result.historyPerPeriod) result.historyPerPeriod = {};
                const historyPeriod = result.generationPeriod;
                if (historyPeriod && !result.historyPerPeriod[historyPeriod]) {
                    result.historyPerPeriod[historyPeriod] = result.historyState;
                }
                result.historyState = null;
                migrationNeeded = true;
            }

            // MIGRATION: Clean orphaned historyPerPeriod entries
            // If a period has history but no appreciation, it's orphaned — reset it.
            // NOTE: We do NOT exempt generationPeriod because it was contaminated
            // by the original bug (S1 data written with generationPeriod='S2').
            if (result.historyPerPeriod) {
                for (const [period, state] of Object.entries(result.historyPerPeriod)) {
                    const hasAppreciation = sd.periods?.[period]?.appreciation?.trim();
                    if (!hasAppreciation && state?.versions?.length > 0) {
                        result.historyPerPeriod[period] = { versions: [], currentIndex: -1 };
                        migrationNeeded = true;
                    }
                }
            }

            return result;
        });
        this._lastMigrationChanged = migrationNeeded;
        if (migrationNeeded && UI) UI.showNotification("Données mises à jour vers le nouveau format.", 'info');
        return migratedResults;
    },

    /**
     * Construit un snapshot complet des préférences de l'utilisateur et de l'état de navigation.
     * @private
     * @returns {Object} Un objet contenant tous les réglages structurés
     */
    _buildSettingsSnapshot() {
        return {
            theme: userSettings.ui.theme,
            accentColor: userSettings.ui.accentColor || 'blue',
            isAppreciationFullView: userSettings.ui.isAppreciationFullView,
            activeView: userSettings.ui.activeView || 'list',
            seatingStatusDots: userSettings.ui.seatingStatusDots || { ...DEFAULT_SEATING_STATUS_DOTS },

            useSubjectPersonalization: userSettings.academic.useSubjectPersonalization,
            periodSystem: userSettings.academic.periodSystem,
            subjects: userSettings.academic.subjects,
            evolutionThresholds: userSettings.academic.evolutionThresholds,
            classes: userSettings.academic.classes || [],
            currentClassId: userSettings.academic.currentClassId || null,
            classesCustomOrder: Boolean(userSettings.academic.classesCustomOrder),
            classesSortDirection: userSettings.academic.classesSortDirection || 'asc',
            seatingGrid: userSettings.academic.seatingGrid || null,
            seatingActivityGrid: userSettings.academic.seatingActivityGrid || null,

            currentAIModel: userSettings.api.currentAIModel,
            enableApiFallback: userSettings.api.enableApiFallback,
            openaiApiKey: userSettings.api.openaiApiKey,
            googleApiKey: userSettings.api.googleApiKey,
            groqApiKey: userSettings.api.groqApiKey,
            openrouterApiKey: userSettings.api.openrouterApiKey,
            anthropicApiKey: userSettings.api.anthropicApiKey,
            mistralApiKey: userSettings.api.mistralApiKey,
            apiKeyStatus: runtimeState.apiStatus || {},
            validatedApiKeys: runtimeState.validatedApiKeys || {},

            ollamaEnabled: userSettings.api.ollamaEnabled,
            ollamaBaseUrl: userSettings.api.ollamaBaseUrl,
            ollamaInstalledModels: userSettings.api.ollamaInstalledModels,

            massImportFormats: userSettings.import.massImportFormats,

            privacy: userSettings.privacy,

            currentPeriod: runtimeState.navigation.currentPeriod,
            currentSubject: runtimeState.navigation.currentSubject,

            currentInputMode: runtimeState.navigation.currentInputMode,
            activeStatFilter: runtimeState.navigation.activeStatFilter,

            deletedItems: runtimeState.data?.deletedItems || { students: [], classes: [] },

            journalThreshold: userSettings.academic.journalThreshold,
        };
    },

    /**
     * Génère une empreinte légère d'une photo élève afin d'éviter de sérialiser
     * plusieurs mégaoctets de chaînes base64 lors des calculs de hash.
     * @private
     * @param {Object|null|undefined} photo
     * @returns {Object|null}
     */
    _getPhotoFingerprint(photo) {
        if (!photo || typeof photo !== 'object') return photo ?? null;
        const data = typeof photo.data === 'string' ? photo.data : '';
        const mid = data.length >> 1;
        return {
            source: photo.source || null,
            uploadedAt: photo.uploadedAt || null,
            dataRef: data ? `${data.length}:${data.slice(0, 32)}:${data.slice(mid, mid + 32)}:${data.slice(-32)}` : null
        };
    },

    /**
     * Calcule un hash rapide de generatedResults pour détecter si une écriture IndexedDB est nécessaire.
     * @private
     * @param {Array<Object>} results
     * @returns {string}
     */
    _computeResultsSaveHash(results) {
        if (!Array.isArray(results) || results.length === 0) return 'empty';
        const lightResults = results.map(r => {
            if (!r?.studentPhoto?.data) return r;
            return {
                ...r,
                studentPhoto: this._getPhotoFingerprint(r.studentPhoto)
            };
        });
        return this._hashString(JSON.stringify(lightResults));
    },

    computeCurrentDataHash() {
        const settings = this._buildSettingsSnapshot();
        const dataSettings = { ...settings };
        UI_AND_NAV_KEYS.forEach(k => delete dataSettings[k]);

        // Exclure les horodatages transitoires des classes
        if (Array.isArray(dataSettings.classes)) {
            dataSettings.classes = dataSettings.classes.map(c => {
                const { seatingUpdatedAt, seatingValidatedAt, seatingActivityUpdatedAt, seatingActivityValidatedAt, ...rest } = c;
                return rest;
            });
        }

        // Exclure le verrouillage transitoire de seatingGrid (géré individuellement par classe via seatingLocked)
        if (dataSettings.seatingGrid) {
            const { locked, ...gridRest } = dataSettings.seatingGrid;
            dataSettings.seatingGrid = gridRest;
        }
        if (dataSettings.seatingActivityGrid) {
            const { locked, ...actGridRest } = dataSettings.seatingActivityGrid;
            dataSettings.seatingActivityGrid = actGridRest;
        }

        // Nettoyer generatedResults pour exclure les horodatages transitoires (_lastModified), états UI éphémères et base64 lourds
        const cleanResults = (runtimeState.data.generatedResults || []).map(r => {
            const clean = { ...r };
            delete clean._lastModified;
            delete clean.copied;
            delete clean.isPending;
            delete clean.errorMessage;
            delete clean.errorPeriod;
            delete clean.historyPerPeriod;
            delete clean.historyState;
            if (clean.studentPhoto?.data) {
                clean.studentPhoto = this._getPhotoFingerprint(clean.studentPhoto);
            }
            if (clean.studentData?.periods) {
                const cleanPeriods = {};
                for (const [p, pData] of Object.entries(clean.studentData.periods)) {
                    if (pData) {
                        const { _lastModified, ...pRest } = pData;
                        cleanPeriods[p] = pRest;
                    }
                }
                clean.studentData = { ...clean.studentData, periods: cleanPeriods };
            }
            return clean;
        });

        const rawData = JSON.stringify(dataSettings) + JSON.stringify(cleanResults);
        return this._hashString(rawData);
    },

    /**
     * Retourne un snapshot des paramètres utilisateur expurgé des états de navigation transitoires,
     * de la configuration matérielle locale (Ollama), des classes et des tombstones (transportés à la
     * racine des exports via `classes` et `deletedItems`). Les clés API sont exclues par défaut
     * (exports JSON) mais peuvent être incluses pour la synchronisation Cloud privée.
     * @param {Object} [options]
     * @param {boolean} [options.includeApiKeys=false] - Inclure les clés API dans le snapshot
     * @returns {Object} Paramètres expurgés
     */
    getExportableSettings({ includeApiKeys = false } = {}) {
        const settings = this._buildSettingsSnapshot();
        const keysToRemove = [
            'apiKeyStatus',
            'validatedApiKeys',
            'ollamaEnabled',
            'ollamaBaseUrl',
            'ollamaInstalledModels',
            'classes',
            'deletedItems',
            'currentClassId',
            'currentPeriod',
            'currentSubject',
            'currentInputMode',
            'activeStatFilter'
        ];
        if (!includeApiKeys) {
            keysToRemove.push(...API_KEY_SETTINGS_KEYS);
        }
        keysToRemove.forEach(k => delete settings[k]);
        return settings;
    },

    async saveAppState() {
        const prevQueue = this._saveQueue || Promise.resolve();
        const nextSave = prevQueue
            .catch(() => {})
            .then(() => this._doSaveAppState());
        this._savePromise = nextSave;
        this._saveQueue = nextSave;
        try {
            await nextSave;
        } finally {
            if (this._savePromise === nextSave) {
                this._savePromise = null;
            }
        }
    },

    async _doSaveAppState() {
        if (this._lastSaveHash === null) {
            this._lastResultsSaveHash = null;
            this._lastClassesSaveHash = null;
        }

        const settings = this._buildSettingsSnapshot();
        const lsData = { version: APP_VERSION, settings: settings };
        const stringifiedSettings = JSON.stringify(lsData);
        const resultsSaveHash = this._computeResultsSaveHash(runtimeState.data.generatedResults);
        const classesList = Array.isArray(userSettings.academic.classes) ? userSettings.academic.classes : [];
        const classesSaveHash = this._hashString(JSON.stringify(classesList));
        const currentHash = `${this._hashString(stringifiedSettings)}:${resultsSaveHash}`;

        // Optimization: prevent writing to disk if state hasn't changed at all
        if (this._lastSaveHash === currentHash) {
            this._isFirstLoadSave = false;
            return;
        }

        const resultsChanged = this._lastResultsSaveHash !== resultsSaveHash;
        const classesChanged = this._lastClassesSaveHash !== classesSaveHash;

        // Use computeCurrentDataHash to check only structural/data settings changes
        const currentDataHash = this.computeCurrentDataHash();
        const lastSyncHash = localStorage.getItem('bulletin_last_sync_hash');

        const isFirstLoad = this._isFirstLoadSave;
        const prevDataHash = this._lastDataHash;
        if (!isFirstLoad) {
            const hasChangedSinceLastSave = (prevDataHash && prevDataHash !== currentDataHash) ||
                (!prevDataHash && lastSyncHash && lastSyncHash !== currentDataHash);
            if (lastSyncHash && currentDataHash === lastSyncHash) {
                // If we reverted back to the exact cloud version, clear local changes
                const lastSync = parseInt(localStorage.getItem('bulletin_last_sync') || '0');
                this._safeLocalStorageSet('bulletin_last_modified', lastSync.toString());
            } else if (hasChangedSinceLastSave) {
                // If data has changed since our last save, update modified timestamp
                this._safeLocalStorageSet('bulletin_last_modified', Date.now().toString());
            }
            this._lastDataHash = currentDataHash;
            if (hasChangedSinceLastSave || (lastSyncHash && currentDataHash === lastSyncHash)) {
                window.SyncService?.refreshLocalIndicator?.();
            }
        } else {
            this._lastDataHash = currentDataHash;
            // On first load, initialize sync hash ONLY if missing and no data purge was detected
            const lastSync = parseInt(localStorage.getItem('bulletin_last_sync') || '0');
            const lastMod = parseInt(localStorage.getItem('bulletin_last_modified') || '0');
            if (!lastSyncHash && !runtimeState._dataPurgeDetected && lastSync > 0 && lastMod <= lastSync) {
                this._safeLocalStorageSet('bulletin_last_sync_hash', currentDataHash);
            }
        }
        this._isFirstLoadSave = false;

        const lsSaved = this._safeLocalStorageSet(CONFIG.LS_APP_STATE_KEY, stringifiedSettings, { notifyOnQuota: true });

        let idbSaved = true;
        if (!isFirstLoad && resultsChanged && runtimeState.data.generatedResults) {
            try {
                await DBService.putAll('generatedResults', runtimeState.data.generatedResults);
                this._lastResultsSaveHash = resultsSaveHash;
            } catch (error) {
                idbSaved = false;
                console.error('[StorageManager] Échec écriture IndexedDB:', error);
            }
        } else {
            this._lastResultsSaveHash = resultsSaveHash;
        }

        // Persistance v2 des stores 'classes' et 'appData' ('userSettings', 'deletedItems')
        if (!isFirstLoad) {
            try {
                if (classesChanged && typeof DBService.replaceAll === 'function') {
                    await DBService.replaceAll('classes', classesList);
                    this._lastClassesSaveHash = classesSaveHash;
                }
                if (typeof DBService.put === 'function') {
                    const nowTs = Date.now();
                    await DBService.put('appData', { key: 'userSettings', value: settings, updatedAt: nowTs });
                    await DBService.put('appData', {
                        key: 'deletedItems',
                        value: runtimeState.data?.deletedItems || { students: [], classes: [] },
                        updatedAt: nowTs
                    });
                }
            } catch (_) {
                /* tolérance aux mocks partiels de DBService dans certains tests */
            }
        } else {
            this._lastClassesSaveHash = classesSaveHash;
        }

        if (lsSaved && idbSaved) {
            const now = Date.now();
            this._lastSaveHash = currentHash;
            this._lastSavedTimestamp = now;

            if (!isFirstLoad && !this._isReloadingFromTabSync) {
                const syncPayload = {
                    type: 'STATE_UPDATED',
                    timestamp: now,
                    dataHash: currentDataHash,
                    saveHash: currentHash,
                    deviceId: this.getDeviceId(),
                    sourceTabId: this._tabId
                };
                bus.emit(EVENTS.STATE_SAVED, syncPayload);
                try {
                    this._broadcastChannel?.postMessage(syncPayload);
                } catch (_) { /* ignore closed channel */ }
            }
        }

    },

    /**
     * Reset settings with granular choices via showChoicesModal.
     * Preserves user data (classes, students, appreciations).
     */
    async resetAllSettings() {
        const { ModalUI: ModalUIManager } = await import('./ModalUIManager.js');

        const apiKeyCount = API_KEY_SETTINGS_KEYS.filter(k => Boolean(appState[k])).length;

        const subjectCount = appState.subjects ? Object.keys(appState.subjects).length : 0;

        const choices = [
            {
                id: 'apiKeys',
                label: 'Clés API',
                sublabel: apiKeyCount > 0
                    ? `Efface les ${apiKeyCount} clé${apiKeyCount > 1 ? 's' : ''} configurée${apiKeyCount > 1 ? 's' : ''} (Google, OpenAI…).`
                    : 'Aucune clé configurée.',
                checked: false,
                disabled: apiKeyCount === 0
            },
            {
                id: 'subjects',
                label: 'Matières & prompts',
                sublabel: subjectCount > 0
                    ? `Restaure les ${subjectCount} matière${subjectCount > 1 ? 's' : ''} par défaut (styles de rédaction, modèles de prompt).`
                    : 'Configuration par défaut.',
                checked: true,
                disabled: false
            },
            {
                id: 'thresholds',
                label: 'Seuils d\'évolution',
                sublabel: 'Remet les seuils progression/régression aux valeurs par défaut.',
                checked: true,
                disabled: false
            },
            {
                id: 'preferences',
                label: 'Préférences visuelles',
                sublabel: 'Remet le thème, le modèle IA et le système de périodes par défaut.',
                checked: false,
                disabled: false
            }
        ];

        const { confirmed, values } = await ModalUIManager.showChoicesModal(
            'Réinitialiser les paramètres',
            'Choisissez les paramètres à restaurer par défaut. <strong>Vos classes et élèves seront conservés.</strong>',
            choices,
            {
                confirmText: 'Réinitialiser',
                cancelText: 'Annuler',
                isDanger: true,
                iconClass: 'solar:restart-circle-bold'
            }
        );

        if (!confirmed) return;

        const resetApiKeys = values.apiKeys;
        const resetSubjects = values.subjects;
        const resetThresholds = values.thresholds;
        const resetPreferences = values.preferences;

        if (!resetApiKeys && !resetSubjects && !resetThresholds && !resetPreferences) return;

        const closeBtn = document.getElementById('closeSettingsModalBtn');
        if (closeBtn) closeBtn.disabled = true;

        try {
            const parts = [];

            if (resetApiKeys) {
                API_KEY_SETTINGS_KEYS.forEach(k => {
                    const provider = k.replace('ApiKey', '');
                    userSettings.api[k] = '';
                    appState[k] = '';
                    if (runtimeState.validatedApiKeys) runtimeState.validatedApiKeys[provider] = false;
                    if (appState.validatedApiKeys) appState.validatedApiKeys[provider] = false;
                    if (runtimeState.apiStatus) runtimeState.apiStatus[provider] = null;
                    if (appState.apiKeyStatus) appState.apiKeyStatus[provider] = null;
                    if (runtimeState.apiKeyErrorDetails) delete runtimeState.apiKeyErrorDetails[provider];
                    if (appState.apiKeyErrorDetails) delete appState.apiKeyErrorDetails[provider];
                });
                parts.push('clés API');
            }

            if (resetSubjects) {
                appState.subjects = JSON.parse(JSON.stringify(DEFAULT_PROMPT_TEMPLATES));
                appState.useSubjectPersonalization = true;
                appState.currentSubject = 'MonStyle';
                appState.massImportFormats = { trimestres: {}, semestres: {} };
                appState.privacy = { ...DEFAULT_PRIVACY_SETTINGS };
                parts.push('matières');
            }

            if (resetThresholds) {
                appState.evolutionThresholds = { ...DEFAULT_EVOLUTION_THRESHOLDS };
                parts.push('seuils');
            }

            if (resetPreferences) {
                appState.periodSystem = 'trimestres';
                appState.currentAIModel = 'gemini-3.6-flash';
                appState.seatingStatusDots = { ...DEFAULT_SEATING_STATUS_DOTS };
                parts.push('préférences');
            }

            await this.saveAppState();

            UI.updatePeriodSystemUI();
            UI.updateSettingsPromptFields();
            UI.updateSettingsFields();
            UI.renderSettingsLists();
            if (App?.updateUIOnLoad) App.updateUIOnLoad();
            UI.showNotification(`Réinitialisé : ${parts.join(', ')} (données conservées).`, 'success');
        } catch (e) {
            UI.showNotification('Erreur lors de la réinitialisation.', 'error');
        } finally {
            if (closeBtn) closeBtn.disabled = false;
        }
    },

    /**
     * Factory reset — Erases EVERYTHING.
     * Uses Hard Confirm modal (user must type SUPPRIMER).
     */
    async factoryReset() {
        const { ModalUI: ModalUIManager } = await import('./ModalUIManager.js');

        const studentCount = appState.generatedResults?.length || 0;
        const classCount = appState.classes?.length || 0;

        const confirmed = await ModalUIManager.showHardConfirmModal({
            title: 'Remise à zéro totale',
            message: `
                <p>Cette action est <strong>irréversible</strong> et supprimera :</p>
                <ul style="margin: 12px 0 12px 20px; line-height: 1.8; color: var(--text-primary);">
                    <li><strong>${classCount}</strong> classe${classCount > 1 ? 's' : ''}</li>
                    <li><strong>${studentCount}</strong> élève${studentCount > 1 ? 's' : ''} et leurs appréciations</li>
                    <li>Tous les paramètres, clés API et prompts</li>
                    <li>La synchronisation cloud</li>
                </ul>
                <p>L'application sera rechargée à son état initial.</p>
            `,
            confirmWord: 'SUPPRIMER',
            confirmText: 'Tout supprimer',
            cancelText: 'Annuler'
        });

        if (!confirmed) return;

        const closeBtn = document.getElementById('closeSettingsModalBtn');
        const modalFunctions = document.querySelectorAll('.settings-modal button, .settings-modal input, .settings-modal select');

        if (closeBtn) closeBtn.disabled = true;
        modalFunctions.forEach(el => el.disabled = true);

        try {
            await DBService.clear('generatedResults');
            try {
                await DBService.clear?.('classes');
                await DBService.clear?.('appData');
            } catch (_) { /* ignore if mocked */ }
            localStorage.removeItem(CONFIG.LS_APP_STATE_KEY);

            const keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && (
                    key.startsWith('bulletin') ||
                    key.startsWith('appState') ||
                    key.startsWith('appreciation') ||
                    key.includes('Generator')
                )) {
                    keysToRemove.push(key);
                }
            }
            keysToRemove.forEach(key => localStorage.removeItem(key));

            localStorage.removeItem('bulletin_device_id');
            localStorage.removeItem('bulletin_sync_provider');
            localStorage.removeItem('bulletin_sync_auto');
            localStorage.removeItem('bulletin_last_sync');
            localStorage.removeItem('bulletin_google_token');
            localStorage.removeItem('bulletin_dropbox_token');

            UI.showNotification('Toutes les données ont été supprimées. Rechargement...', 'success');

            const { RestoreTransitionManager } = await import('./RestoreTransitionManager.js');
            await RestoreTransitionManager.performReloadTransition({
                title: 'Réinitialisation',
                subtitle: 'Remise à zéro de l\'application...'
            });

        } catch (error) {
            UI.showNotification('Erreur lors de la réinitialisation: ' + error.message, 'error');

            if (closeBtn) closeBtn.disabled = false;
            modalFunctions.forEach(el => el.disabled = false);
        }
    },

    parseBackupFile(fileContent) {
        const backup = JSON.parse(fileContent);
        if (!backup._meta && !backup.appVersion && !backup.settings) {
            throw new Error('Format de fichier invalide.');
        }

        const settings = backup.settings || backup;
        const results = backup.generatedResults || [];
        const classes = backup.classes || [];
        const journalCount = results.reduce((n, r) => n + (r.journal?.length || 0), 0);
        const photoCount = results.filter(r => r.studentPhoto?.data).length;

        const apiKeyCount = API_KEY_SETTINGS_KEYS.filter(k => Boolean(settings[k])).length;
        const hasApiKeys = apiKeyCount > 0;
        const subjectCount = settings.subjects ? Object.keys(settings.subjects).length : 0;

        return {
            raw: backup,
            meta: backup._meta || {},
            categories: {
                settings: { available: !!settings.subjects, count: subjectCount, label: 'Paramètres', description: 'Matières, thème, seuils, modèle IA' },
                classes: { available: classes.length > 0, count: classes.length, label: 'Classes', description: 'Structure des classes et listes d\'élèves' },
                students: { available: results.length > 0, count: results.length, label: 'Données élèves', description: `Notes, appréciations, statuts, contexte${photoCount > 0 ? `, ${photoCount} photo${photoCount > 1 ? 's' : ''}` : ''}` },
                journal: { available: journalCount > 0, count: journalCount, label: 'Journal de bord', description: 'Observations et notes de suivi', parent: 'students' },
                apiKeys: { available: hasApiKeys, count: apiKeyCount, label: 'Clés API', description: 'Clés d\'accès aux services IA' }
            }
        };
    },

    exportToJson() {
        const dataToExport = {
            // Sync metadata for future cloud sync
            _meta: {
                exportType: 'full_backup',
                appVersion: APP_VERSION,
                exportedAt: new Date().toISOString(),
                exportedAtTimestamp: Date.now(),
                deviceId: this.getDeviceId()
            },
            settings: this.getExportableSettings(),
            // Classes & Tombstones
            classes: userSettings.academic.classes || [],
            deletedItems: runtimeState.data?.deletedItems || { students: [], classes: [] },
            // Student data with per-item timestamps
            generatedResults: (runtimeState.data.generatedResults || []).map(result => ({
                ...result,
                _lastModified: result._lastModified || Date.now()
            }))
        };
        const count = dataToExport.generatedResults.length;
        this._downloadFile(JSON.stringify(dataToExport, null, 2), `bulletin-ai_backup_${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
        UI.showNotification(`Sauvegarde exportée (${count} élève${count > 1 ? 's' : ''}).`, 'success');
    },

    /**
     * Get or create a unique device ID for sync conflict resolution.
     * @returns {string} Unique device identifier
     */
    getDeviceId() {
        let deviceId = localStorage.getItem('bulletin_device_id');
        if (!deviceId) {
            deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            localStorage.setItem('bulletin_device_id', deviceId);
        }
        return deviceId;
    },

    exportSettings() {
        const settingsToExport = {
            appVersion: APP_VERSION,
            _meta: {
                exportType: 'settings_only',
                exportedAt: new Date().toISOString()
            },
            settings: this.getExportableSettings()
        };
        this._downloadFile(JSON.stringify(settingsToExport, null, 2), `bulletin-ai_settings_${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
        UI.showNotification('Paramètres exportés avec succès !', 'success');
    },

    /**
     * Persiste la liste complète des résultats élèves dans IndexedDB.
     * @private
     * @param {Array<Object>} results
     */
    async _persistGeneratedResults(results) {
        if (typeof DBService.replaceAll === 'function') {
            await DBService.replaceAll('generatedResults', results);
        } else {
            await DBService.clear('generatedResults');
            await DBService.putAll('generatedResults', results);
        }
    },

    /**
     * Consolide les tombstones (deletedItems) locaux et entrants (racine ou fallback legacy settings.deletedItems).
     * @private
     * @param {Object} incomingData - Payload entrant (backup JSON ou données Cloud)
     * @param {Object} [options]
     * @param {boolean} [options.applyToState=true] - Mettre à jour runtimeState.data.deletedItems
     * @returns {{ deletedStudentsMap: Map<string, Object>, deletedClassesMap: Map<string, Object> }}
     */
    _consolidateTombstones(incomingData, { applyToState = true } = {}) {
        const localDeletedStudents = Array.isArray(runtimeState.data?.deletedItems?.students)
            ? runtimeState.data.deletedItems.students
            : [];
        const incomingDeletedStudents = Array.isArray(incomingData?.deletedItems?.students)
            ? incomingData.deletedItems.students
            : (Array.isArray(incomingData?.settings?.deletedItems?.students) ? incomingData.settings.deletedItems.students : []);
        const deletedStudentsMap = new Map();
        [...localDeletedStudents, ...incomingDeletedStudents].forEach(item => {
            if (!item?.id) return;
            const existing = deletedStudentsMap.get(item.id);
            if (!existing || (item.deletedAt || 0) > (existing.deletedAt || 0)) {
                deletedStudentsMap.set(item.id, item);
            }
        });

        const localDeletedClasses = Array.isArray(runtimeState.data?.deletedItems?.classes)
            ? runtimeState.data.deletedItems.classes
            : [];
        const incomingDeletedClasses = Array.isArray(incomingData?.deletedItems?.classes)
            ? incomingData.deletedItems.classes
            : (Array.isArray(incomingData?.settings?.deletedItems?.classes) ? incomingData.settings.deletedItems.classes : []);
        const deletedClassesMap = new Map();
        [...localDeletedClasses, ...incomingDeletedClasses].forEach(item => {
            if (!item?.id) return;
            const existing = deletedClassesMap.get(item.id);
            if (!existing || (item.deletedAt || 0) > (existing.deletedAt || 0)) {
                deletedClassesMap.set(item.id, item);
            }
        });

        if (applyToState && runtimeState.data) {
            runtimeState.data.deletedItems = {
                students: Array.from(deletedStudentsMap.values()),
                classes: Array.from(deletedClassesMap.values())
            };
        }

        return { deletedStudentsMap, deletedClassesMap };
    },

    /**
     * Fusionne la liste des classes entrantes avec les classes locales :
     * - Filtre selon les tombstones `deletedClassesMap`
     * - Écarte la « Classe exemple » locale d'accueil uniquement si l'appareil local ne contient
     *   que cette classe d'exemple par défaut et que les données entrantes apportent d'autres classes
     * - Fusionne les horodatages de plan de classe et les synthèses IA `analyses[period]` par `timestamp`
     * @private
     * @param {Array<Object>} incomingClasses
     * @param {Map<string, Object>} deletedClassesMap
     * @returns {{ addedClasses: number, evictedDemoClassIds: Set<string> }}
     */
    _mergeClassesList(incomingClasses, deletedClassesMap) {
        const currentLocalClasses = userSettings.academic.classes || [];
        const safeIncoming = Array.isArray(incomingClasses) ? incomingClasses : [];
        const incomingClassIds = new Set(safeIncoming.map(c => c?.id).filter(Boolean));
        const localHasOnlyDemo = currentLocalClasses.length > 0 && currentLocalClasses.every(c => ClassManager.isDemoClass(c.id));
        const evictedDemoClassIds = new Set();

        if (localHasOnlyDemo && incomingClassIds.size > 0) {
            currentLocalClasses.forEach(c => {
                if (c?.id && ClassManager.isDemoClass(c.id) && !incomingClassIds.has(c.id)) {
                    evictedDemoClassIds.add(c.id);
                }
            });
        }

        const localClasses = currentLocalClasses.filter(lClass => {
            if (!lClass?.id || evictedDemoClassIds.has(lClass.id)) return false;
            const tombstone = deletedClassesMap.get(lClass.id);
            if (!tombstone) return true;
            const localTime = lClass.updatedAt || lClass.createdAt || 0;
            return localTime > (tombstone.deletedAt || 0);
        });

        const localClassIds = new Set(localClasses.map(c => c.id));
        let addedClasses = 0;

        safeIncoming.forEach(rClass => {
            if (!rClass?.id) return;
            const tombstone = deletedClassesMap.get(rClass.id);
            const remoteClassTime = rClass.updatedAt || rClass.createdAt || 0;
            if (tombstone && (tombstone.deletedAt || Infinity) >= remoteClassTime) {
                return;
            }
            if (!localClassIds.has(rClass.id)) {
                localClasses.push(rClass);
                localClassIds.add(rClass.id);
                addedClasses++;
            } else {
                const localC = localClasses.find(c => c.id === rClass.id);
                if (!localC) return;

                if (rClass.seatingUpdatedAt && (!localC.seatingUpdatedAt || rClass.seatingUpdatedAt > localC.seatingUpdatedAt)) {
                    localC.seatingUpdatedAt = rClass.seatingUpdatedAt;
                    if (rClass.seatingLocked !== undefined) localC.seatingLocked = rClass.seatingLocked;
                    if (rClass.seatingSpecialLayout !== undefined) localC.seatingSpecialLayout = rClass.seatingSpecialLayout;
                }
                if (rClass.seatingActivityUpdatedAt && (!localC.seatingActivityUpdatedAt || rClass.seatingActivityUpdatedAt > localC.seatingActivityUpdatedAt)) {
                    localC.seatingActivityUpdatedAt = rClass.seatingActivityUpdatedAt;
                    if (rClass.seatingActivityLocked !== undefined) localC.seatingActivityLocked = rClass.seatingActivityLocked;
                    if (rClass.seatingActivitySpecialLayout !== undefined) localC.seatingActivitySpecialLayout = rClass.seatingActivitySpecialLayout;
                }
                if (rClass.analyses && typeof rClass.analyses === 'object') {
                    if (!localC.analyses || typeof localC.analyses !== 'object') {
                        localC.analyses = {};
                    }
                    for (const [period, rAnalysis] of Object.entries(rClass.analyses)) {
                        if (!rAnalysis || typeof rAnalysis !== 'object') continue;
                        const lAnalysis = localC.analyses[period];
                        if (!lAnalysis || (rAnalysis.timestamp || 0) > (lAnalysis.timestamp || 0)) {
                            localC.analyses[period] = { ...rAnalysis };
                        }
                    }
                }
            }
        });

        userSettings.academic.classes = localClasses;
        return { addedClasses, evictedDemoClassIds };
    },

    /**
     * Fusion granulaire non-destructive des dossiers élèves (utilisée par `mergeRemoteData` et `importBackup({ mergeData: true })`).
     * @private
     * @param {Array<Object>} incomingResults
     * @param {Object} [options]
     * @param {Map<string, Object>} [options.deletedStudentsMap]
     * @param {Map<string, Object>} [options.deletedClassesMap]
     * @param {Set<string>} [options.evictedDemoClassIds]
     * @param {Array<Object>} [options.incomingClasses]
     * @returns {Promise<{ addedStudents: number, updatedStudents: number, skippedStudents: number, addedJournalEntries: number }>}
     */
    async _mergeStudentRecords(
        incomingResults,
        {
            deletedStudentsMap = new Map(),
            deletedClassesMap = new Map(),
            evictedDemoClassIds = new Set(),
            incomingClasses = []
        } = {}
    ) {
        let addedStudents = 0;
        let updatedStudents = 0;
        let skippedStudents = 0;
        let addedJournalEntries = 0;

        const localResults = (runtimeState.data.generatedResults || []).filter(localStudent => {
            if (localStudent.classId && evictedDemoClassIds.has(localStudent.classId)) return false;
            const studentTombstone = deletedStudentsMap.get(localStudent.id);
            const classTombstone = localStudent.classId ? deletedClassesMap.get(localStudent.classId) : null;
            const localTime = localStudent._lastModified || (localStudent.timestamp ? new Date(localStudent.timestamp).getTime() : 0) || 0;
            if (studentTombstone && (studentTombstone.deletedAt || Infinity) >= localTime) return false;
            if (classTombstone && (classTombstone.deletedAt || Infinity) >= localTime) return false;
            return true;
        });

        const safeIncoming = Array.isArray(incomingResults) ? incomingResults : [];
        const localMap = new Map(localResults.map(r => [r.id, r]));

        safeIncoming.forEach(rawRemoteStudent => {
            const remoteStudent = this._ensureStudentId(rawRemoteStudent);
            const studentTombstone = deletedStudentsMap.get(remoteStudent.id);
            const classTombstone = remoteStudent.classId ? deletedClassesMap.get(remoteStudent.classId) : null;
            const remoteTime = remoteStudent._lastModified || (remoteStudent.timestamp ? new Date(remoteStudent.timestamp).getTime() : 0) || 0;
            if (studentTombstone && (studentTombstone.deletedAt || Infinity) >= remoteTime) {
                return;
            }
            if (classTombstone && (classTombstone.deletedAt || Infinity) >= remoteTime) {
                return;
            }

            const localStudent = localMap.get(remoteStudent.id);

            if (!localStudent) {
                localResults.push({
                    ...remoteStudent,
                    _lastModified: remoteStudent._lastModified || Date.now()
                });
                addedStudents++;
            } else {
                let hasStudentUpdates = false;
                const localTime = localStudent._lastModified || (localStudent.timestamp ? new Date(localStudent.timestamp).getTime() : 0) || 0;
                const isRemoteRecordNewer = remoteTime > localTime;

                // Champs de fiche : complétés si absents en local, remplacés si la fiche entrante est plus récente
                const adoptField = (target, source, field) => {
                    if (!source[field]) return;
                    if (target[field] && (!isRemoteRecordNewer || Utils.isEqual(target[field], source[field]))) return;
                    target[field] = source[field];
                    hasStudentUpdates = true;
                };
                ['nom', 'prenom', 'classe', 'classId', 'strengthsWeaknesses', 'nextSteps'].forEach(field => adoptField(localStudent, remoteStudent, field));
                if (remoteStudent.wasGenerated && !localStudent.wasGenerated) {
                    localStudent.wasGenerated = true;
                    hasStudentUpdates = true;
                }
                if (remoteStudent.studentData) {
                    if (!localStudent.studentData) localStudent.studentData = {};
                    ['nom', 'prenom', 'classe'].forEach(field => adoptField(localStudent.studentData, remoteStudent.studentData, field));
                }

                // Adopte l'historique de la période et rafraîchit le cache racine `appreciation` (même règle que Utils.setPeriodAppreciation)
                const adoptRemotePeriodExtras = (period, appreciation) => {
                    if (remoteStudent.historyPerPeriod?.[period]) {
                        if (!localStudent.historyPerPeriod) localStudent.historyPerPeriod = {};
                        localStudent.historyPerPeriod[period] = remoteStudent.historyPerPeriod[period];
                    }
                    if (appreciation && localStudent.studentData?.currentPeriod === period) {
                        localStudent.appreciation = appreciation;
                    }
                };

                // A. Fusion additive du Journal de bord (aucune note perdue)
                const localJournal = Array.isArray(localStudent.journal) ? localStudent.journal : [];
                const remoteJournal = Array.isArray(remoteStudent.journal) ? remoteStudent.journal : [];

                if (remoteJournal.length > 0) {
                    const localEntryKeys = new Set(localJournal.map(e => e.id || `${e.date}_${(e.note || '').slice(0, 20)}`));
                    remoteJournal.forEach(remoteEntry => {
                        const entryKey = remoteEntry.id || `${remoteEntry.date}_${(remoteEntry.note || '').slice(0, 20)}`;
                        if (!localEntryKeys.has(entryKey)) {
                            localJournal.push(remoteEntry);
                            localEntryKeys.add(entryKey);
                            addedJournalEntries++;
                            hasStudentUpdates = true;
                        } else {
                            const localEntry = localJournal.find(e => (e.id && e.id === remoteEntry.id) || `${e.date}_${(e.note || '').slice(0, 20)}` === entryKey);
                            if (localEntry && remoteEntry._lastModified && (!localEntry._lastModified || remoteEntry._lastModified > localEntry._lastModified)) {
                                Object.assign(localEntry, remoteEntry);
                                hasStudentUpdates = true;
                            }
                        }
                    });
                    localJournal.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
                    localStudent.journal = localJournal;
                }

                // B. Fusion des photos d'élèves
                if (remoteStudent.studentPhoto?.data) {
                    const localPhotoTime = localStudent.studentPhoto?.uploadedAt ? new Date(localStudent.studentPhoto.uploadedAt).getTime() : 0;
                    const remotePhotoTime = remoteStudent.studentPhoto.uploadedAt ? new Date(remoteStudent.studentPhoto.uploadedAt).getTime() : 0;
                    if (!localStudent.studentPhoto?.data || remotePhotoTime > localPhotoTime) {
                        localStudent.studentPhoto = remoteStudent.studentPhoto;
                        hasStudentUpdates = true;
                    }
                }

                // C. Fusion des périodes (notes, appréciations, contexte et historique de période)
                if (remoteStudent.studentData?.periods) {
                    if (!localStudent.studentData) localStudent.studentData = {};
                    if (!localStudent.studentData.periods) localStudent.studentData.periods = {};

                    const localPeriods = localStudent.studentData.periods;
                    const remotePeriods = remoteStudent.studentData.periods;

                    for (const period of Object.keys(remotePeriods)) {
                        const rPeriodData = remotePeriods[period];
                        const lPeriodData = localPeriods[period];

                        if (!lPeriodData) {
                            localPeriods[period] = { ...rPeriodData };
                            adoptRemotePeriodExtras(period, rPeriodData?.appreciation);
                            hasStudentUpdates = true;
                        } else {
                            const hasPeriodTimestamps = Boolean(rPeriodData._lastModified || lPeriodData._lastModified);
                            const rTime = hasPeriodTimestamps ? (rPeriodData._lastModified || 0) : remoteTime;
                            const lTime = hasPeriodTimestamps ? (lPeriodData._lastModified || 0) : localTime;

                            const rApp = (rPeriodData.appreciation || '').trim();
                            const lApp = (lPeriodData.appreciation || '').trim();

                            if (rApp && (!lApp || rTime > lTime)) {
                                lPeriodData.appreciation = rPeriodData.appreciation;
                                lPeriodData._lastModified = rPeriodData._lastModified || rTime || Date.now();
                                adoptRemotePeriodExtras(period, rPeriodData.appreciation);
                                hasStudentUpdates = true;
                            }

                            if (rPeriodData.grade !== undefined && rPeriodData.grade !== null) {
                                if (lPeriodData.grade === undefined || lPeriodData.grade === null || rTime > lTime) {
                                    lPeriodData.grade = rPeriodData.grade;
                                    hasStudentUpdates = true;
                                }
                            }

                            if (rPeriodData.context && (!lPeriodData.context || rTime > lTime)) {
                                lPeriodData.context = rPeriodData.context;
                                hasStudentUpdates = true;
                            }
                        }
                    }
                }

                // D. Fusion des statuts (tags)
                const lStatuses = Array.isArray(localStudent.studentData?.statuses) ? localStudent.studentData.statuses : [];
                const rStatuses = Array.isArray(remoteStudent.studentData?.statuses) ? remoteStudent.studentData.statuses : [];
                if (rStatuses.length > 0) {
                    const combined = Array.from(new Set([...lStatuses, ...rStatuses]));
                    if (combined.length !== lStatuses.length) {
                        if (!localStudent.studentData) localStudent.studentData = {};
                        localStudent.studentData.statuses = combined;
                        hasStudentUpdates = true;
                    }
                }

                // E. Fusion du placement du plan de classe (seatingPosition & seatingActivityPosition)
                if (remoteStudent.seatingPosition) {
                    const localClasses = userSettings.academic.classes || [];
                    const rClass = Array.isArray(incomingClasses) ? incomingClasses.find(c => c.id === remoteStudent.classId) : null;
                    const lClass = localClasses.find(c => c.id === localStudent.classId);
                    const isRemoteSeatingNewer = rClass?.seatingUpdatedAt && (!lClass?.seatingUpdatedAt || rClass.seatingUpdatedAt >= lClass.seatingUpdatedAt);
                    if (!localStudent.seatingPosition || isRemoteSeatingNewer) {
                        const lPos = localStudent.seatingPosition;
                        const rPos = remoteStudent.seatingPosition;
                        if (!lPos || lPos.row !== rPos.row || lPos.col !== rPos.col || (lPos.pinned || false) !== (rPos.pinned || false)) {
                            localStudent.seatingPosition = { ...rPos };
                            hasStudentUpdates = true;
                        }
                    }
                }
                if (remoteStudent.seatingActivityPosition) {
                    const localClasses = userSettings.academic.classes || [];
                    const rClass = Array.isArray(incomingClasses) ? incomingClasses.find(c => c.id === remoteStudent.classId) : null;
                    const lClass = localClasses.find(c => c.id === localStudent.classId);
                    const isRemoteActNewer = rClass?.seatingActivityUpdatedAt && (!lClass?.seatingActivityUpdatedAt || rClass.seatingActivityUpdatedAt >= lClass.seatingActivityUpdatedAt);
                    if (!localStudent.seatingActivityPosition || isRemoteActNewer) {
                        const lPos = localStudent.seatingActivityPosition;
                        const rPos = remoteStudent.seatingActivityPosition;
                        if (!lPos || lPos.row !== rPos.row || lPos.col !== rPos.col || (lPos.pinned || false) !== (rPos.pinned || false) || (lPos.order ?? 0) !== (rPos.order ?? 0)) {
                            localStudent.seatingActivityPosition = { ...rPos };
                            hasStudentUpdates = true;
                        }
                    }
                }

                if (hasStudentUpdates) {
                    localStudent._lastModified = Date.now();
                    updatedStudents++;
                } else {
                    skippedStudents++;
                }
            }
        });

        let cleanResults = this.migrateData(localResults);
        cleanResults = Utils.deduplicateResults(cleanResults);
        runtimeState.data.generatedResults = cleanResults;
        await this._persistGeneratedResults(cleanResults);

        return { addedStudents, updatedStudents, skippedStudents, addedJournalEntries };
    },

    /**
     * Import a backup file with merge support.
     * @param {string} fileContent - JSON content
     * @param {Object} options - { mergeData: boolean }
     */
    async importBackup(fileContent, options = { mergeData: true, categories: null, silent: false }) {
        try {
            const backup = JSON.parse(fileContent);

            if (!backup._meta && !backup.appVersion && !backup.settings) {
                throw new Error('Format de fichier invalide.');
            }

            if (!options.skipSnapshot) {
                await this.savePreRestoreSnapshot();
            }

            const stats = { imported: 0, updated: 0, skipped: 0, settingsImported: false, classesAdded: 0, apiKeysImported: 0, journalEntries: 0 };
            const settings = backup.settings || backup;
            const cats = options.categories;
            const shouldImport = (cat) => !cats || cats[cat] === true;

            // Consolidate or restore tombstones (deletedItems)
            let deletedStudentsMap = new Map();
            let deletedClassesMap = new Map();
            if (options.mergeData) {
                ({ deletedStudentsMap, deletedClassesMap } = this._consolidateTombstones(backup));
            } else if (runtimeState.data && (shouldImport('classes') || shouldImport('students'))) {
                const incomingDeleted = backup.deletedItems || backup.settings?.deletedItems;
                runtimeState.data.deletedItems = {
                    students: Array.isArray(incomingDeleted?.students) ? incomingDeleted.students : [],
                    classes: Array.isArray(incomingDeleted?.classes) ? incomingDeleted.classes : []
                };
            }

            // Import settings
            if (shouldImport('settings') && settings.subjects) {
                Object.assign(appState, {
                    theme: settings.theme || appState.theme,
                    accentColor: settings.accentColor || appState.accentColor || 'blue',
                    useSubjectPersonalization: settings.useSubjectPersonalization ?? true,
                    periodSystem: settings.periodSystem || appState.periodSystem,
                    currentPeriod: settings.currentPeriod || appState.currentPeriod,
                    subjects: settings.subjects,
                    evolutionThresholds: settings.evolutionThresholds || appState.evolutionThresholds,
                    massImportFormats: settings.massImportFormats || { trimestres: {}, semestres: {} },
                    currentAIModel: settings.currentAIModel || appState.currentAIModel,
                    enableApiFallback: settings.enableApiFallback ?? appState.enableApiFallback,
                    privacy: settings.privacy || appState.privacy || { ...DEFAULT_PRIVACY_SETTINGS },
                    seatingGrid: settings.seatingGrid || appState.seatingGrid,
                    seatingActivityGrid: settings.seatingActivityGrid || appState.seatingActivityGrid,
                    journalThreshold: settings.journalThreshold ?? appState.journalThreshold,
                    activeView: settings.activeView || backup.activeView || appState.activeView || 'list'
                });
                userSettings.api.currentAIModel = appState.currentAIModel;
                userSettings.api.enableApiFallback = appState.enableApiFallback;
                stats.settingsImported = true;
            }

            // Import API keys (only when explicitly selected; never overwrite an existing key by default or with empty)
            const shouldImportApiKeys = Boolean(cats?.apiKeys === true || options.includeApiKeys === true);
            if (shouldImportApiKeys && settings) {
                API_KEY_SETTINGS_KEYS.forEach(k => {
                    const importedKey = typeof settings[k] === 'string' ? settings[k].trim() : '';
                    if (importedKey) {
                        this._applyImportedApiKey(k, importedKey);
                        stats.apiKeysImported++;
                    }
                });
            }

            // Never overwrite ollamaBaseUrl by default; if explicitly requested, restrict to local loopback
            if (options.importOllamaConfig === true && this._isValidLocalOllamaUrl(settings?.ollamaBaseUrl)) {
                userSettings.api.ollamaBaseUrl = settings.ollamaBaseUrl.trim();
                appState.ollamaBaseUrl = settings.ollamaBaseUrl.trim();
            }

            // Import classes if present
            let evictedDemoClassIds = new Set();
            if (shouldImport('classes') && (Array.isArray(backup.classes) || (options.mergeData && deletedClassesMap.size > 0))) {
                if (options.mergeData) {
                    const mergeClassRes = this._mergeClassesList(backup.classes || [], deletedClassesMap);
                    stats.classesAdded = mergeClassRes.addedClasses;
                    evictedDemoClassIds = mergeClassRes.evictedDemoClassIds;
                } else if (Array.isArray(backup.classes)) {
                    userSettings.academic.classes = backup.classes;
                    if (settings?.classesCustomOrder !== undefined) {
                        userSettings.academic.classesCustomOrder = Boolean(settings.classesCustomOrder);
                    }
                    if (settings?.classesSortDirection === 'asc' || settings?.classesSortDirection === 'desc') {
                        userSettings.academic.classesSortDirection = settings.classesSortDirection;
                    }
                    stats.classesAdded = backup.classes.length;
                }
            }

            // Import student data
            if (shouldImport('students')) {
                const includeJournal = !cats || cats.journal !== false;
                const stripJournal = !includeJournal;
                const importedResults = (backup.generatedResults || []).map(r => {
                    const withId = this._ensureStudentId(r);
                    if (stripJournal) {
                        const { journal, ...rest } = withId;
                        return rest;
                    }
                    return withId;
                });

                if (includeJournal) {
                    stats.journalEntries = importedResults.reduce((n, r) => n + (r.journal?.length || 0), 0);
                }

                if (options.mergeData) {
                    const hasLocalOrIncoming = importedResults.length > 0 ||
                        (runtimeState.data.generatedResults?.length || 0) > 0 ||
                        deletedStudentsMap.size > 0 ||
                        deletedClassesMap.size > 0;
                    if (hasLocalOrIncoming) {
                        const mergeRes = await this._mergeStudentRecords(importedResults, {
                            deletedStudentsMap,
                            deletedClassesMap,
                            evictedDemoClassIds,
                            incomingClasses: backup.classes || []
                        });
                        stats.imported = mergeRes.addedStudents;
                        stats.updated = mergeRes.updatedStudents;
                        stats.skipped = mergeRes.skippedStudents;
                    }
                } else if (importedResults.length > 0) {
                    const newResults = importedResults.map(r => ({
                        ...r,
                        _lastModified: r._lastModified || Date.now()
                    }));
                    let cleanResults = this.migrateData(newResults);
                    cleanResults = Utils.deduplicateResults(cleanResults);
                    runtimeState.data.generatedResults = cleanResults;
                    await this._persistGeneratedResults(cleanResults);
                    stats.imported = cleanResults.length;
                } else {
                    runtimeState.data.generatedResults = [];
                    await DBService.clear('generatedResults');
                }
            } else if (evictedDemoClassIds.size > 0) {
                // Classes importées sans les élèves : retirer quand même les élèves fictifs de la « Classe exemple » écartée
                await this._mergeStudentRecords([], { evictedDemoClassIds });
            }

            if (runtimeState.data.generatedResults?.length > 0) {
                runtimeState._dataPurgeDetected = false;
            }
            this._ensureValidActiveClass({ preferRealClass: true });
            this._updateFilteredResultsForCurrentClass();
            this._ensureDefaultState();
            this._ensureConfigUpgrades();
            await this.saveAppState();
            if (App && App.updateUIOnLoad) App.updateUIOnLoad();

            if (!options.silent) {
                const message = options.mergeData
                    ? `Importé: ${stats.imported} nouveaux, ${stats.updated} mis à jour, ${stats.skipped} ignorés.`
                    : `Restauré: ${stats.imported} élèves.`;
                UI.showNotification(message, 'success');
            }
            return { success: true, stats };

        } catch (error) {
            console.error('Erreur import backup:', error);
            UI.showNotification(`Erreur: ${error.message}`, 'error');
            return { success: false, message: error.message };
        }
    },

    /**
     * Applique une clé API importée ou fusionnée en réinitialisant son statut de validation local si elle change.
     * @private
     * @param {string} keyName - Nom de la propriété (ex: 'googleApiKey')
     * @param {string} newKey - Nouvelle clé non vide
     */
    _applyImportedApiKey(keyName, newKey) {
        const provider = keyName.replace('ApiKey', '');
        const currentKey = userSettings.api[keyName] || appState[keyName] || '';
        if (currentKey !== newKey) {
            if (runtimeState.validatedApiKeys) runtimeState.validatedApiKeys[provider] = false;
            if (appState.validatedApiKeys) appState.validatedApiKeys[provider] = false;
            if (runtimeState.apiStatus) runtimeState.apiStatus[provider] = null;
            if (appState.apiKeyStatus) appState.apiKeyStatus[provider] = null;
            if (runtimeState.apiKeyErrorDetails) delete runtimeState.apiKeyErrorDetails[provider];
            if (appState.apiKeyErrorDetails) delete appState.apiKeyErrorDetails[provider];
        }
        userSettings.api[keyName] = newKey;
        appState[keyName] = newKey;
    },

    /**
     * Fusion intelligente non-destructive entre les données locales et distantes.
     * Conserve les ajouts locaux (nouveaux élèves, modifications récentes)
     * tout en intégrant les ajouts et modifications du Cloud (nouveaux élèves, entrées de journal).
     * @param {Object} remoteData - Données distantes lues depuis le Cloud
     * @returns {Promise<{success: boolean, stats: Object}>}
     */
    async mergeRemoteData(remoteData) {
        if (!remoteData || typeof remoteData !== 'object') {
            throw new Error('Données distantes invalides pour la fusion');
        }

        await this.savePreRestoreSnapshot();

        const stats = {
            addedStudents: 0,
            updatedStudents: 0,
            addedJournalEntries: 0,
            addedClasses: 0
        };

        const { deletedStudentsMap, deletedClassesMap } = this._consolidateTombstones(remoteData);

        // 0. Fusion non-destructive des clés API et préférences IA distantes
        if (remoteData.settings && typeof remoteData.settings === 'object') {
            const rSettings = remoteData.settings;
            API_KEY_SETTINGS_KEYS.forEach(k => {
                const remoteKey = typeof rSettings[k] === 'string' ? rSettings[k].trim() : '';
                const localKey = (userSettings.api[k] || appState[k] || '').trim();
                const provider = k.replace('ApiKey', '');
                const localStatus = runtimeState.apiStatus?.[provider] ?? appState.apiKeyStatus?.[provider];
                if (remoteKey && (!localKey || localStatus === 'invalid')) {
                    this._applyImportedApiKey(k, remoteKey);
                }
            });
            const localModel = userSettings.api.currentAIModel || appState.currentAIModel;
            if (rSettings.currentAIModel && !rSettings.currentAIModel.startsWith('ollama') && !localModel) {
                userSettings.api.currentAIModel = rSettings.currentAIModel;
                appState.currentAIModel = rSettings.currentAIModel;
            }
            if (rSettings.enableApiFallback !== undefined && userSettings.api.enableApiFallback === undefined) {
                userSettings.api.enableApiFallback = rSettings.enableApiFallback;
                appState.enableApiFallback = rSettings.enableApiFallback;
            }
        }

        // 1. Fusion des classes (union par ID, filtrée par tombstones, synthèses IA & plan de classe)
        let evictedDemoClassIds = new Set();
        if (Array.isArray(remoteData.classes) || deletedClassesMap.size > 0) {
            const mergeClassRes = this._mergeClassesList(remoteData.classes || [], deletedClassesMap);
            stats.addedClasses = mergeClassRes.addedClasses;
            evictedDemoClassIds = mergeClassRes.evictedDemoClassIds;
        }

        // 2. Fusion granulaire des élèves (generatedResults) avec filtrage des tombstones
        const mergeStudentRes = await this._mergeStudentRecords(remoteData.generatedResults || [], {
            deletedStudentsMap,
            deletedClassesMap,
            evictedDemoClassIds,
            incomingClasses: remoteData.classes || []
        });
        stats.addedStudents = mergeStudentRes.addedStudents;
        stats.updatedStudents = mergeStudentRes.updatedStudents;
        stats.addedJournalEntries = mergeStudentRes.addedJournalEntries;

        // 3. Mettre à jour la classe active et les filtres d'affichage (après fusion des élèves : classes virtuelles)
        this._ensureValidActiveClass({ preferRealClass: true });
        this._updateFilteredResultsForCurrentClass();

        // 4. Sauvegarde de l'état
        if (runtimeState.data.generatedResults?.length > 0) {
            runtimeState._dataPurgeDetected = false;
        }
        await this.saveAppState();
        if (App?.updateUIOnLoad) App.updateUIOnLoad();

        return { success: true, stats };
    },

    importSettings(fileContent) {
        try {
            const importedData = JSON.parse(fileContent);

            // Redirect full backups to importBackup
            if (importedData._meta?.exportType === 'full_backup' || importedData.generatedResults) {
                return this.importBackup(fileContent, { mergeData: true });
            }

            const settings = importedData.settings || importedData;
            if (settings.subjects) {
                Object.assign(appState, {
                    theme: settings.theme || appState.theme,
                    accentColor: settings.accentColor || appState.accentColor || 'blue',
                    useSubjectPersonalization: settings.useSubjectPersonalization ?? true,
                    periodSystem: settings.periodSystem || appState.periodSystem,
                    currentPeriod: settings.currentPeriod || appState.currentPeriod,
                    subjects: settings.subjects,
                    evolutionThresholds: settings.evolutionThresholds || appState.evolutionThresholds,
                    massImportFormats: settings.massImportFormats || { trimestres: {}, semestres: {} },
                    currentAIModel: settings.currentAIModel || appState.currentAIModel,
                    enableApiFallback: settings.enableApiFallback ?? appState.enableApiFallback,
                    privacy: settings.privacy || appState.privacy || { ...DEFAULT_PRIVACY_SETTINGS },
                    seatingGrid: settings.seatingGrid || appState.seatingGrid,
                    seatingActivityGrid: settings.seatingActivityGrid || appState.seatingActivityGrid
                });
                if (appState.wordCountLimit) {
                    delete appState.wordCountLimit;
                }
                this._ensureConfigUpgrades();
                this.saveAppState();
                App.updateUIOnLoad();
                UI.showNotification('Paramètres importés avec succès !', 'success');
            } else throw new Error('Fichier de paramètres invalide.');
        } catch (error) {
            console.error('Erreur importation paramètres:', error);
            UI.showNotification(`Erreur importation : ${error.message}`, 'error');
        }
    },

    _downloadFile(content, fileName, contentType) {
        const blob = new Blob([content], { type: contentType });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
    }
};
