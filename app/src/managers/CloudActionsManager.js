/**
 * @fileoverview Orchestrateur unique des actions Cloud explicites (Sauvegarder / Restaurer).
 * Partagé par le menu principal et l'onglet Données des Paramètres afin de garantir
 * des gardes, confirmations, verrous et messages strictement identiques.
 *
 * @module managers/CloudActionsManager
 */

import { UI } from './UIManager.js';
import { StorageManager } from './StorageManager.js';
import { DOM } from '../utils/DOM.js';
import { runtimeState, userSettings } from '../state/State.js';

/** @type {boolean} Verrou global : une seule action Cloud à la fois */
let busy = false;

const noop = () => {};

const plural = (count, word) => `${count} ${word}${count > 1 ? 's' : ''}`;

const errorMessage = (error) => error?.message || error?.result?.error?.message || 'Erreur inconnue';

const loadSyncService = async () => (await import('../services/SyncService.js')).SyncService;

/**
 * @typedef {Object} CloudActionHooks
 * @property {(label: string|null) => void} [onProgress] - Libellé transitoire du bouton déclencheur (null = repos)
 * @property {() => void} [onBeforePrompt] - Appelé avant toute modale ou fin d'action (ex : fermer le menu)
 */

export const CloudActionsManager = {
    /**
     * Indique si une action Cloud est en cours.
     * @returns {boolean}
     */
    isBusy() {
        return busy;
    },

    /**
     * Sauvegarde explicite vers le Cloud.
     * - Données vides : propose la restauration au lieu d'écraser le Cloud.
     * - Cloud plus récent / conflit : modale de résolution adaptée à l'état.
     * - Réduction de données : modale de confirmation.
     * - Cas nominal : sauvegarde directe sans modale.
     * @param {CloudActionHooks} [hooks]
     * @returns {Promise<boolean>} true si les données ont été envoyées
     */
    async save(hooks = {}) {
        if (!navigator.onLine) {
            UI.showNotification('Mode hors-ligne : vos modifications sont enregistrées sur cet appareil.', 'info');
            return false;
        }
        const outcome = await this._exclusive(() => this._save(hooks), hooks);
        if (outcome === 'restore') return this.restore(hooks);
        return outcome === 'saved';
    },

    /**
     * Restauration explicite depuis le Cloud, avec comparatif préalable et annulation possible.
     * @param {CloudActionHooks} [hooks]
     * @returns {Promise<boolean>} true si les données ont été restaurées
     */
    async restore(hooks = {}) {
        if (!navigator.onLine) {
            UI.showNotification('Mode hors-ligne : la restauration Cloud nécessite une connexion Internet.', 'info');
            return false;
        }
        return (await this._exclusive(() => this._restore(hooks), hooks)) === true;
    },

    /**
     * Reconnecte la session Cloud expirée et rafraîchit immédiatement les états (sans fermer le menu).
     * @param {CloudActionHooks} [hooks]
     * @returns {Promise<boolean>} true si reconnecté
     */
    async reconnect(hooks = {}) {
        if (!navigator.onLine) {
            UI.showNotification('Mode hors-ligne : vos modifications sont enregistrées sur cet appareil.', 'info');
            return false;
        }
        return (await this._exclusive(() => this._reconnect(hooks), hooks)) === true;
    },

    /**
     * Rétablit la copie de secours créée avant la dernière restauration.
     * @returns {Promise<boolean>}
     */
    async undoRestore() {
        const restored = await StorageManager.restorePreRestoreSnapshot();
        if (!restored) {
            UI.showNotification('Aucune copie de sécurité disponible.', 'warning');
            return false;
        }
        const { RestoreTransitionManager } = await import('./RestoreTransitionManager.js');
        await RestoreTransitionManager.rehydrateAndTransition();
        UI.showNotification('État précédent restauré.', 'success');
        return true;
    },

    // =========================================================================
    // PRIVATE
    // =========================================================================

    /**
     * Exécute une tâche sous verrou exclusif et remet toujours le bouton au repos.
     * @param {Function} task
     * @param {CloudActionHooks} hooks
     * @returns {Promise<*>} Résultat de la tâche, ou null si une action est déjà en cours
     * @private
     */
    async _exclusive(task, hooks) {
        if (busy) return null;
        busy = true;
        try {
            return await task();
        } finally {
            busy = false;
            (hooks.onProgress || noop)(null);
        }
    },

    /**
     * @param {CloudActionHooks} hooks
     * @returns {Promise<boolean>}
     * @private
     */
    async _reconnect({ onProgress = noop }) {
        try {
            const SyncService = await loadSyncService();
            onProgress('Connexion…');
            const connected = await SyncService.connect(this._providerName(SyncService), { skipStatusCheck: true });
            if (!connected) {
                UI.showNotification('Connexion annulée.', 'warning');
                return false;
            }
            SyncService._updateCloudIndicator?.('connected');
            onProgress(null);
            await SyncService.refreshStatus({ showChecking: true });
            return true;
        } catch (error) {
            UI.showNotification('Erreur de reconnexion : ' + errorMessage(error), 'error');
            return false;
        }
    },

    /**
     * @param {CloudActionHooks} hooks
     * @returns {Promise<'saved'|'restore'|'cancelled'>}
     * @private
     */
    async _save({ onProgress = noop, onBeforePrompt = noop }) {
        try {
            const SyncService = await loadSyncService();
            const studentCount = runtimeState.data.generatedResults?.length || 0;
            const classCount = userSettings.academic.classes?.length || 0;

            if (studentCount === 0) {
                onBeforePrompt();
                return (await this._confirmEmptyDataRestore()) ? 'restore' : 'cancelled';
            }

            if (!(await this._ensureConnected(SyncService, onProgress))) return 'cancelled';

            onProgress('Vérification…');
            let statusResult = await SyncService.refreshStatus();
            if (statusResult === 'expired') {
                if (!(await this._ensureConnected(SyncService, onProgress))) return 'cancelled';
                onProgress('Vérification…');
                statusResult = await SyncService.refreshStatus();
            }
            onProgress(null);
            onBeforePrompt();

            const syncState = SyncService._lastSyncState;
            let mode = 'overwrite';

            if (syncState === 'cloud-changes' || syncState === 'conflict') {
                mode = await UI.showConflictResolutionModal({
                    remoteDate: SyncService.remoteSyncTime,
                    syncState
                });
                if (mode === 'cancel') return 'cancelled';
                if (mode === 'restore') return 'restore';
            } else {
                const remoteStudentCount = SyncService.getLastSyncStudentCount();
                const hasShrinkage = Boolean(remoteStudentCount && studentCount < remoteStudentCount);
                const isAlreadySynced = syncState === 'in-sync' && Boolean(SyncService.lastSyncTime || SyncService.remoteSyncTime);
                if (hasShrinkage || isAlreadySynced) {
                    const confirmed = await UI.showSaveConfirmationModal({
                        localStudentCount: studentCount,
                        localClassCount: classCount,
                        remoteStudentCount,
                        lastSyncTime: SyncService.lastSyncTime || SyncService.remoteSyncTime,
                        providerName: this._providerName(SyncService),
                        isInSync: isAlreadySynced && !hasShrinkage
                    });
                    if (!confirmed) return 'cancelled';
                }
            }

            return await this._executeSave(SyncService, mode === 'merge', onProgress);
        } catch (error) {
            UI.showNotification('Erreur de sauvegarde : ' + errorMessage(error), 'error');
            return 'cancelled';
        }
    },

    /**
     * @param {Object} SyncService
     * @param {boolean} isMerge
     * @param {Function} onProgress
     * @returns {Promise<'saved'>}
     * @private
     */
    async _executeSave(SyncService, isMerge, onProgress) {
        onProgress(isMerge ? 'Fusion…' : 'Envoi…');
        this._setSyncLock(true);
        const progressToast = UI.showNotification(
            isMerge ? 'Fusion et synchronisation avec le Cloud…' : 'Sauvegarde de vos données sur le Cloud…',
            'loading',
            0
        );

        try {
            const result = await this._withAuthRetry(SyncService, () =>
                isMerge ? SyncService.mergeAndSync() : SyncService.saveToCloud()
            );
            progressToast?.dismiss?.();
            UI.showNotification(
                isMerge ? this._formatMergeStats(result?.stats) : 'Vos données sont sécurisées sur le Cloud.',
                'success',
                4000,
                { title: 'Sauvegarde réussie' }
            );
            return 'saved';
        } finally {
            progressToast?.dismiss?.();
            this._setSyncLock(false);
        }
    },

    /**
     * @param {CloudActionHooks} hooks
     * @returns {Promise<boolean>}
     * @private
     */
    async _restore({ onProgress = noop, onBeforePrompt = noop }) {
        try {
            const SyncService = await loadSyncService();
            if (!(await this._ensureConnected(SyncService, onProgress))) return false;

            onProgress('Vérification…');
            const summary = await this._withAuthRetry(SyncService, () => SyncService.getRemoteBackupSummary());
            onProgress(null);
            onBeforePrompt();

            if (!summary?.success) {
                UI.showNotification('Aucune sauvegarde valide trouvée sur le Cloud.', 'warning');
                return false;
            }

            const confirmed = await UI.showRestoreConfirmationModal({
                remoteDate: summary.timestamp,
                remoteStudentCount: summary.studentCount,
                remoteClassCount: summary.classCount,
                localStudentCount: runtimeState.data.generatedResults?.length || 0,
                localClassCount: userSettings.academic.classes?.length || 0,
                localDate: parseInt(localStorage.getItem('bulletin_last_modified') || '0', 10) || null,
                lastSyncTime: SyncService.lastSyncTime || parseInt(localStorage.getItem('bulletin_last_sync') || '0', 10) || null,
                providerName: this._providerName(SyncService),
                syncState: SyncService._lastSyncState || SyncService._computeSyncState()
            });
            if (!confirmed) return false;

            return await this._executeRestore(SyncService, summary, onProgress);
        } catch (error) {
            UI.showNotification('Erreur de restauration : ' + errorMessage(error), 'error');
            return false;
        }
    },

    /**
     * @param {Object} SyncService
     * @param {Object} summary - Résultat de SyncService.getRemoteBackupSummary()
     * @param {Function} onProgress
     * @returns {Promise<boolean>}
     * @private
     */
    async _executeRestore(SyncService, summary, onProgress) {
        const providerLabel = summary.providerLabel || 'le Cloud';
        onProgress('Restauration…');
        this._setSyncLock(true);
        const progressToast = UI.showNotification(`Restauration depuis ${providerLabel}…`, 'loading', 0);

        try {
            const hasSnapshot = await StorageManager.savePreRestoreSnapshot();
            const result = await SyncService.loadFromCloud(summary.remoteData);
            progressToast?.dismiss?.();

            if (!result.success) {
                UI.showNotification('Impossible de charger les données distantes.', 'error');
                return false;
            }

            const { RestoreTransitionManager } = await import('./RestoreTransitionManager.js');
            await RestoreTransitionManager.rehydrateAndTransition();

            const count = result.count ?? summary.studentCount;
            const message = `${plural(count, 'élève')} restauré${count > 1 ? 's' : ''} depuis ${providerLabel}.`;
            if (hasSnapshot) {
                UI.showUndoNotification(message, () => this.undoRestore(), {
                    title: 'Restauration réussie',
                    type: 'success',
                    duration: 8000
                });
            } else {
                UI.showNotification(message, 'success', 5000, { title: 'Restauration réussie' });
            }
            return true;
        } finally {
            progressToast?.dismiss?.();
            this._setSyncLock(false);
        }
    },

    /**
     * Propose la restauration lorsque les données locales sont vides (évite d'écraser le Cloud).
     * @returns {Promise<boolean>} true si l'utilisateur choisit de restaurer
     * @private
     */
    _confirmEmptyDataRestore() {
        const isPurge = runtimeState._dataPurgeDetected;
        return UI.showCustomConfirm(
            isPurge
                ? 'Vos données élèves semblent avoir été <strong>effacées par le navigateur</strong> après une longue inactivité.'
                : 'Vos données locales sont <strong>vides</strong> (0 élève).',
            null, null,
            {
                title: isPurge ? 'Restaurer depuis le Cloud ?' : 'Données locales vides',
                confirmText: 'Restaurer depuis le Cloud',
                cancelText: 'Annuler',
                isDanger: false,
                detailsHtml: `
                    <p>Envoyer des données vides écraserait votre sauvegarde Cloud existante.</p>
                    <p>Nous vous recommandons de <strong>restaurer</strong> vos données depuis le Cloud pour récupérer votre travail.</p>
                `
            }
        );
    },

    /**
     * Garantit une session active : reconnecte (popup OAuth) si la session a expiré.
     * @param {Object} SyncService
     * @param {Function} onProgress
     * @returns {Promise<boolean>}
     * @private
     */
    async _ensureConnected(SyncService, onProgress) {
        if (SyncService.isConnected()) return true;
        onProgress('Connexion…');
        const connected = await SyncService.connect(this._providerName(SyncService));
        onProgress(null);
        if (!connected) UI.showNotification('Connexion annulée.', 'warning');
        return connected;
    },

    /**
     * Rejoue une opération une fois après reconnexion si elle échoue pour cause d'authentification.
     * @param {Object} SyncService
     * @param {Function} operation
     * @returns {Promise<*>}
     * @private
     */
    async _withAuthRetry(SyncService, operation) {
        try {
            return await operation();
        } catch (error) {
            const isAuthError = error?.isAuthError || error?.status === 401 || !SyncService.isConnected();
            if (!isAuthError || !(await SyncService.connect(this._providerName(SyncService)))) throw error;
            return operation();
        }
    },

    /**
     * Verrou visuel non bloquant pendant un transfert Cloud.
     * @param {boolean} active
     * @private
     */
    _setSyncLock(active) {
        DOM.headerMenuBtn?.classList.toggle('cloud-syncing', active);
        document.body.classList.toggle('is-cloud-syncing', active);
        document.querySelector('.main-content-wrapper')?.classList.toggle('is-cloud-syncing', active);
    },

    /**
     * @param {Object} SyncService
     * @returns {string}
     * @private
     */
    _providerName(SyncService) {
        return SyncService.currentProviderName || localStorage.getItem('bulletin_sync_provider') || 'google';
    },

    /**
     * @param {Object} [stats]
     * @returns {string}
     * @private
     */
    _formatMergeStats(stats = {}) {
        const parts = [];
        if (stats.addedStudents > 0) parts.push(`+${plural(stats.addedStudents, 'élève')}`);
        if (stats.addedJournalEntries > 0) parts.push(`+${plural(stats.addedJournalEntries, 'note')} journal`);
        if (stats.addedClasses > 0) parts.push(`+${plural(stats.addedClasses, 'classe')}`);
        return parts.length > 0 ? parts.join(' · ') : 'Données synchronisées';
    }
};
