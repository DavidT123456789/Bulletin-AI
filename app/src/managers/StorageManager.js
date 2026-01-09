import { appState, userSettings, runtimeState } from '../state/State.js';
import { CONFIG, APP_VERSION, DEFAULT_PROMPT_TEMPLATES, DEFAULT_IA_CONFIG, DEFAULT_EVOLUTION_THRESHOLDS } from '../config/Config.js';
import { DBService } from '../services/DBService.js';
import { Utils } from '../utils/Utils.js';

let UI;
let App;

export const StorageManager = {
    init(ui, app) {
        UI = ui;
        App = app;
    },

    async loadAppState() {
        try {
            const savedState = localStorage.getItem(CONFIG.LS_APP_STATE_KEY);
            if (savedState) {
                const parsedState = JSON.parse(savedState);

                if (parsedState.settings) {
                    // Charger les settings dans les nouvelles structures
                    const settings = parsedState.settings;

                    // UI Settings
                    if (settings.theme !== undefined) userSettings.ui.theme = settings.theme;
                    if (settings.isAppreciationFullView !== undefined) userSettings.ui.isAppreciationFullView = settings.isAppreciationFullView;

                    // Academic Settings
                    if (settings.periodSystem !== undefined) userSettings.academic.periodSystem = settings.periodSystem;
                    if (settings.useSubjectPersonalization !== undefined) userSettings.academic.useSubjectPersonalization = settings.useSubjectPersonalization;
                    if (settings.evolutionThresholds !== undefined) userSettings.academic.evolutionThresholds = settings.evolutionThresholds;
                    if (settings.subjects !== undefined) userSettings.academic.subjects = settings.subjects;
                    // Multi-class support
                    if (settings.classes !== undefined) userSettings.academic.classes = settings.classes;
                    if (settings.currentClassId !== undefined) userSettings.academic.currentClassId = settings.currentClassId;

                    // Journal threshold
                    if (settings.journalThreshold !== undefined) userSettings.academic.journalThreshold = settings.journalThreshold;

                    // API Settings
                    if (settings.currentAIModel !== undefined) userSettings.api.currentAIModel = settings.currentAIModel;
                    if (settings.enableApiFallback !== undefined) userSettings.api.enableApiFallback = settings.enableApiFallback;
                    if (settings.openaiApiKey !== undefined) userSettings.api.openaiApiKey = settings.openaiApiKey;
                    if (settings.googleApiKey !== undefined) userSettings.api.googleApiKey = settings.googleApiKey;
                    if (settings.openrouterApiKey !== undefined) userSettings.api.openrouterApiKey = settings.openrouterApiKey;
                    if (settings.anthropicApiKey !== undefined) userSettings.api.anthropicApiKey = settings.anthropicApiKey;
                    if (settings.mistralApiKey !== undefined) userSettings.api.mistralApiKey = settings.mistralApiKey;
                    if (settings.apiKeyStatus !== undefined) runtimeState.apiStatus = settings.apiKeyStatus;
                    if (settings.validatedApiKeys !== undefined) runtimeState.validatedApiKeys = settings.validatedApiKeys;

                    // Ollama Settings
                    if (settings.ollamaEnabled !== undefined) userSettings.api.ollamaEnabled = settings.ollamaEnabled;
                    if (settings.ollamaBaseUrl !== undefined) userSettings.api.ollamaBaseUrl = settings.ollamaBaseUrl;
                    if (settings.ollamaInstalledModels !== undefined) userSettings.api.ollamaInstalledModels = settings.ollamaInstalledModels;

                    // Import Settings
                    if (settings.massImportFormats !== undefined) userSettings.import.massImportFormats = settings.massImportFormats;

                    // Navigation State
                    if (settings.currentPeriod !== undefined) runtimeState.navigation.currentPeriod = settings.currentPeriod;
                    if (settings.currentSubject !== undefined) runtimeState.navigation.currentSubject = settings.currentSubject;

                    if (settings.currentInputMode !== undefined) runtimeState.navigation.currentInputMode = settings.currentInputMode;
                    if (settings.activeStatFilter !== undefined) runtimeState.navigation.activeStatFilter = settings.activeStatFilter;

                    // Data Settings
                    if (settings.refinementEdits !== undefined) runtimeState.data.refinementEdits = settings.refinementEdits;

                    // Fallback thème si non défini - always default to light
                    if (!userSettings.ui.theme) {
                        userSettings.ui.theme = 'light';
                    }
                }

                // MIGRATION: LocalStorage -> IndexedDB
                if (parsedState.generatedResults && parsedState.generatedResults.length > 0) {
                    let migratedResults = this.migrateData(parsedState.generatedResults);
                    migratedResults = Utils.deduplicateResults(migratedResults);
                    await DBService.putAll('generatedResults', migratedResults);
                    runtimeState.data.generatedResults = migratedResults;

                    delete parsedState.generatedResults;
                    localStorage.setItem(CONFIG.LS_APP_STATE_KEY, JSON.stringify(parsedState));
                }


            } else {
                userSettings.academic.subjects = JSON.parse(JSON.stringify(DEFAULT_PROMPT_TEMPLATES));
                userSettings.ui.theme = 'light'; // Always default to light for new users
            }

            const dbResults = await DBService.getAll('generatedResults');
            if (dbResults && dbResults.length > 0) {
                runtimeState.data.generatedResults = dbResults;
                runtimeState.data.generatedResults = this.migrateData(runtimeState.data.generatedResults);
                // Dédupliquer pour éviter les cartes en double
                const originalCount = runtimeState.data.generatedResults.length;
                runtimeState.data.generatedResults = Utils.deduplicateResults(runtimeState.data.generatedResults);

                // Si des doublons ont été supprimés, sauvegarder les données nettoyées dans IndexedDB
                if (runtimeState.data.generatedResults.length < originalCount) {

                    await DBService.clear('generatedResults');
                    await DBService.putAll('generatedResults', runtimeState.data.generatedResults);
                }
            } else if (!runtimeState.data.generatedResults || runtimeState.data.generatedResults.length === 0) {
                runtimeState.data.generatedResults = [];
            }

            // CORRECTIF: Initialiser filteredResults au démarrage
            const currentClassId = userSettings.academic.currentClassId;
            if (currentClassId) {
                runtimeState.data.filteredResults = runtimeState.data.generatedResults.filter(
                    r => r.classId === currentClassId
                );
            } else {
                // Pas de classe sélectionnée: afficher tous les résultats sans classId
                runtimeState.data.filteredResults = runtimeState.data.generatedResults.filter(
                    r => !r.classId
                );
            }

        } catch (e) {
            console.error("Erreur chargement données (StorageManager):", e);
            if (UI) UI.showNotification("Erreur au chargement des données.", 'error');
        }


        this._ensureDefaultState();
        this._ensureConfigUpgrades();

        this.saveAppState();
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
        if (!runtimeState.data.refinementEdits) {
            runtimeState.data.refinementEdits = {};
        }

        if (!subjects[runtimeState.navigation.currentSubject]) {
            runtimeState.navigation.currentSubject = 'MonStyle';
        }

        // Migration de modèles obsolètes vers la version stable actuelle
        if (userSettings.api.currentAIModel === 'gemini-1.5-flash' || userSettings.api.currentAIModel === 'gemini-1.5-flash-001') {
            userSettings.api.currentAIModel = 'gemini-2.0-flash';
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
            if (sd.negativeInstructions === undefined) sd.negativeInstructions = '';
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
                // Don't force migrationNeeded for runtime property unless strictly necessary
            }

            return result;
        });
        if (migrationNeeded && UI) UI.showNotification("Données mises à jour vers le nouveau format.", 'info');
        return migratedResults;
    },

    async saveAppState() {
        // Sauvegarde simplifiée utilisant les nouvelles structures
        const settings = {
            // Paramètres utilisateur (structure complète aplatie)
            theme: userSettings.ui.theme,
            isAppreciationFullView: userSettings.ui.isAppreciationFullView,

            // Configuration académique
            useSubjectPersonalization: userSettings.academic.useSubjectPersonalization,
            periodSystem: userSettings.academic.periodSystem,
            subjects: userSettings.academic.subjects,
            evolutionThresholds: userSettings.academic.evolutionThresholds,
            // Multi-class support
            classes: userSettings.academic.classes || [],
            currentClassId: userSettings.academic.currentClassId || null,

            // Configuration API
            currentAIModel: userSettings.api.currentAIModel,
            enableApiFallback: userSettings.api.enableApiFallback,
            openaiApiKey: userSettings.api.openaiApiKey,
            googleApiKey: userSettings.api.googleApiKey,
            openrouterApiKey: userSettings.api.openrouterApiKey,
            anthropicApiKey: userSettings.api.anthropicApiKey,
            mistralApiKey: userSettings.api.mistralApiKey,
            apiKeyStatus: runtimeState.apiStatus || {},
            validatedApiKeys: runtimeState.validatedApiKeys || {},

            // Ollama Settings
            ollamaEnabled: userSettings.api.ollamaEnabled,
            ollamaBaseUrl: userSettings.api.ollamaBaseUrl,
            ollamaInstalledModels: userSettings.api.ollamaInstalledModels,

            // Configuration import
            massImportFormats: userSettings.import.massImportFormats,

            // État de navigation (persisté)
            currentPeriod: runtimeState.navigation.currentPeriod,
            currentSubject: runtimeState.navigation.currentSubject,

            currentInputMode: runtimeState.navigation.currentInputMode,
            activeStatFilter: runtimeState.navigation.activeStatFilter,

            // Données de travail persistées
            refinementEdits: runtimeState.data.refinementEdits,

            // Journal threshold
            journalThreshold: userSettings.academic.journalThreshold,
        };

        const lsData = { version: APP_VERSION, settings: settings };
        localStorage.setItem(CONFIG.LS_APP_STATE_KEY, JSON.stringify(lsData));

        if (runtimeState.data.generatedResults) {
            await DBService.putAll('generatedResults', runtimeState.data.generatedResults);
        }

    },

    /**
     * Reset settings only (API keys, subjects, themes).
     * Preserves user data (classes, students, appreciations).
     */
    resetAllSettings() {
        UI.showCustomConfirm("Réinitialiser les paramètres (matières, clés API, thème) ?\n\nVos classes et élèves seront conservés.", async () => {

            // Verrouiller l'interface pour éviter les conflits
            const saveBtn = document.getElementById('saveSettingsBtn');
            const cancelBtn = document.getElementById('cancelSettingsBtn');
            const closeBtn = document.getElementById('closeSettingsModalBtn');
            if (saveBtn) saveBtn.disabled = true;
            if (cancelBtn) cancelBtn.disabled = true;
            if (closeBtn) closeBtn.disabled = true;

            try {


                Object.assign(appState, {
                    useSubjectPersonalization: true,
                    periodSystem: 'trimestres',
                    subjects: JSON.parse(JSON.stringify(DEFAULT_PROMPT_TEMPLATES)),
                    evolutionThresholds: { ...DEFAULT_EVOLUTION_THRESHOLDS },
                    massImportFormats: { trimestres: {}, semestres: {} },
                    currentSubject: 'MonStyle',
                    currentAIModel: 'gemini-2.0-flash',
                });

                appState.openaiApiKey = '';
                appState.googleApiKey = '';
                appState.openrouterApiKey = '';
                appState.anthropicApiKey = '';
                appState.mistralApiKey = '';



                await this.saveAppState();

                UI.updatePeriodSystemUI();
                UI.updateSettingsPromptFields();
                UI.updateSettingsFields();
                UI.renderSettingsLists();
                UI.showNotification('Paramètres réinitialisés (données conservées).', 'success');
            } catch (e) {
                UI.showNotification('Erreur lors de la réinitialisation.', 'error');
                console.error(e);
            } finally {
                // Déverrouiller l'interface
                if (saveBtn) saveBtn.disabled = false;
                if (cancelBtn) cancelBtn.disabled = false;
                if (closeBtn) closeBtn.disabled = false;
            }
        });
    },

    /**
     * Factory reset - Erases EVERYTHING.
     * Classes, students, appreciations, settings - all gone.
     */
    async factoryReset() {
        UI.showCustomConfirm("⚠️ SUPPRIMER TOUTES LES DONNÉES ?\n\nCette action est IRRÉVERSIBLE.\nClasses, élèves, appréciations, paramètres - tout sera effacé.", async () => {
            // Verrouiller définitivement l'interface (rechargement à venir)
            const saveBtn = document.getElementById('saveSettingsBtn');
            const cancelBtn = document.getElementById('cancelSettingsBtn');
            const closeBtn = document.getElementById('closeSettingsModalBtn');
            const modalFunctions = document.querySelectorAll('.settings-modal button, .settings-modal input, .settings-modal select');

            if (saveBtn) saveBtn.disabled = true;
            if (cancelBtn) cancelBtn.disabled = true;
            if (closeBtn) closeBtn.disabled = true;
            modalFunctions.forEach(el => el.disabled = true);

            try {
                // Clear IndexedDB
                await DBService.clear('generatedResults');

                // Clear the main app state (contains classes, settings, etc.)
                localStorage.removeItem(CONFIG.LS_APP_STATE_KEY);

                // Clear all bulletin/app related keys
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

                // Also remove sync-related keys
                localStorage.removeItem('bulletin_device_id');
                localStorage.removeItem('bulletin_sync_provider');
                localStorage.removeItem('bulletin_sync_auto');
                localStorage.removeItem('bulletin_last_sync');
                localStorage.removeItem('bulletin_google_token');
                localStorage.removeItem('bulletin_dropbox_token');

                UI.showNotification('Toutes les données ont été supprimées. Rechargement...', 'success');

                // Reload to fresh state
                setTimeout(() => {
                    window.location.reload();
                }, 1500);

            } catch (error) {
                console.error('Factory reset error:', error);
                UI.showNotification('Erreur lors de la réinitialisation: ' + error.message, 'error');

                // Déverrouiller en cas d'erreur
                if (saveBtn) saveBtn.disabled = false;
                if (cancelBtn) cancelBtn.disabled = false;
                if (closeBtn) closeBtn.disabled = false;
                modalFunctions.forEach(el => el.disabled = false);
            }
        });
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
            settings: {
                theme: appState.theme,
                useSubjectPersonalization: appState.useSubjectPersonalization,
                periodSystem: appState.periodSystem,
                subjects: appState.subjects,
                evolutionThresholds: appState.evolutionThresholds,
                massImportFormats: appState.massImportFormats,
                currentAIModel: appState.currentAIModel,
                refinementEdits: appState.refinementEdits
            },
            // Classes
            classes: userSettings.academic.classes || [],
            currentClassId: userSettings.academic.currentClassId,
            // Student data with per-item timestamps
            generatedResults: (appState.generatedResults || []).map(result => ({
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
            theme: appState.theme,
            useSubjectPersonalization: appState.useSubjectPersonalization,
            periodSystem: appState.periodSystem, subjects: appState.subjects,
            evolutionThresholds: appState.evolutionThresholds,
            massImportFormats: appState.massImportFormats, currentAIModel: appState.currentAIModel
        };
        this._downloadFile(JSON.stringify(settingsToExport, null, 2), `bulletin-ai_settings_${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
        UI.showNotification('Paramètres exportés avec succès !', 'success');
    },

    /**
     * Import a backup file with merge support.
     * @param {string} fileContent - JSON content
     * @param {Object} options - { mergeData: boolean }
     */
    async importBackup(fileContent, options = { mergeData: true }) {
        try {
            const backup = JSON.parse(fileContent);

            if (!backup._meta && !backup.appVersion && !backup.settings) {
                throw new Error('Format de fichier invalide.');
            }

            const stats = { imported: 0, updated: 0, skipped: 0 };
            const settings = backup.settings || backup;

            // Import settings
            if (settings.subjects) {
                Object.assign(appState, {
                    theme: settings.theme || appState.theme,
                    useSubjectPersonalization: settings.useSubjectPersonalization ?? true,
                    periodSystem: settings.periodSystem || appState.periodSystem,
                    subjects: settings.subjects,
                    evolutionThresholds: settings.evolutionThresholds || appState.evolutionThresholds,
                    massImportFormats: settings.massImportFormats || { trimestres: {}, semestres: {} },
                    currentAIModel: settings.currentAIModel || appState.currentAIModel,
                    refinementEdits: settings.refinementEdits || {}
                });
            }

            // Import classes if present
            if (backup.classes && Array.isArray(backup.classes)) {
                const existingIds = new Set((userSettings.academic.classes || []).map(c => c.id));
                backup.classes.forEach(importedClass => {
                    if (!existingIds.has(importedClass.id)) {
                        userSettings.academic.classes.push(importedClass);
                    }
                });
            }

            // Import student data
            const importedResults = backup.generatedResults || [];
            if (importedResults.length > 0) {
                const existingResults = appState.generatedResults || [];

                if (options.mergeData) {
                    const existingMap = new Map(existingResults.map(r => [r.id, r]));

                    importedResults.forEach(imported => {
                        const existing = existingMap.get(imported.id);
                        if (!existing) {
                            existingResults.push({
                                ...imported,
                                _lastModified: imported._lastModified || Date.now()
                            });
                            stats.imported++;
                        } else {
                            const importedTime = imported._lastModified || 0;
                            const existingTime = existing._lastModified || 0;

                            if (importedTime > existingTime) {
                                Object.assign(existing, imported);
                                stats.updated++;
                            } else {
                                stats.skipped++;
                            }
                        }
                    });

                    runtimeState.data.generatedResults = existingResults;
                } else {
                    runtimeState.data.generatedResults = importedResults;
                    stats.imported = importedResults.length;
                }
            }

            await this.saveAppState();
            if (App && App.updateUIOnLoad) App.updateUIOnLoad();

            const message = options.mergeData
                ? `Importé: ${stats.imported} nouveaux, ${stats.updated} mis à jour, ${stats.skipped} ignorés.`
                : `Restauré: ${stats.imported} élèves.`;

            UI.showNotification(message, 'success');
            return { success: true, stats };

        } catch (error) {
            console.error('Erreur import backup:', error);
            UI.showNotification(`Erreur: ${error.message}`, 'error');
            return { success: false, message: error.message };
        }
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
                    useSubjectPersonalization: settings.useSubjectPersonalization ?? true,
                    periodSystem: settings.periodSystem || appState.periodSystem, subjects: settings.subjects,
                    evolutionThresholds: settings.evolutionThresholds || appState.evolutionThresholds,
                    massImportFormats: settings.massImportFormats || { trimestres: {}, semestres: {} },
                    currentAIModel: settings.currentAIModel || appState.currentAIModel,
                    refinementEdits: settings.refinementEdits || {}
                });
                if (appState.wordCountLimit) {
                    delete appState.wordCountLimit;
                }
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
