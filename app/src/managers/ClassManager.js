/**
 * @fileoverview Manager pour la gestion des classes (multi-classes support)
 * Permet de créer, modifier, supprimer et switch entre plusieurs classes.
 * 
 * @module managers/ClassManager
 */

import { appState, userSettings } from '../state/State.js';
import { DBService } from '../services/DBService.js';

let UI;
let StorageManager;

/**
 * Génère un UUID v4 simple
 * @returns {string} UUID unique
 */
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * ID par défaut pour le mode legacy (sans classe explicite)
 */
const DEFAULT_CLASS_ID = '__default__';

export const ClassManager = {
    /**
     * Initialise le ClassManager avec les dépendances
     * @param {Object} ui - Instance UIManager
     * @param {Object} storage - Instance StorageManager
     */
    init(ui, storage) {
        UI = ui;
        StorageManager = storage;
    },

    /**
     * Crée une nouvelle classe
     * @param {string} name - Nom de la classe (ex: "CM2 A")
     * @param {string} [year] - Année scolaire (ex: "2024-2025")
     * @param {string} [subject] - Matière par défaut
     * @returns {Object} La classe créée
     */
    createClass(name, year = null, subject = null) {
        if (!name || !name.trim()) {
            throw new Error('Le nom de la classe est requis');
        }

        const now = Date.now();
        const currentYear = year || this._getCurrentSchoolYear();

        const newClass = {
            id: generateUUID(),
            name: name.trim(),
            year: currentYear,
            subject: subject || appState.currentSubject || 'Français',
            createdAt: now,
            updatedAt: now
        };

        // Ajouter la classe au state
        if (!userSettings.academic.classes) {
            userSettings.academic.classes = [];
        }
        userSettings.academic.classes.push(newClass);

        // Sauvegarder localement
        StorageManager?.saveAppState();

        // Synchroniser vers le cloud
        this._triggerCloudSync();

        // Notifier
        UI?.showNotification(`Classe "${newClass.name}" créée !`, 'success');

        return newClass;
    },

    /**
     * Met à jour une classe existante
     * @param {string} classId - ID de la classe
     * @param {Object} updates - Propriétés à mettre à jour
     * @returns {Object|null} La classe mise à jour ou null
     */
    updateClass(classId, updates) {
        const classes = userSettings.academic.classes || [];
        const classIndex = classes.findIndex(c => c.id === classId);

        if (classIndex === -1) {
            console.warn(`[ClassManager] Classe non trouvée: ${classId}`);
            return null;
        }

        // Mettre à jour
        const classToUpdate = classes[classIndex];
        Object.assign(classToUpdate, updates, { updatedAt: Date.now() });

        // Sauvegarder localement
        StorageManager?.saveAppState();

        // Synchroniser vers le cloud
        this._triggerCloudSync();

        return classToUpdate;
    },

    /**
     * Supprime une classe et ses données associées
     * @param {string} classId - ID de la classe
     * @param {boolean} [deleteData=true] - Supprimer aussi les données des élèves
     * @returns {boolean} Succès de la suppression
     */
    async deleteClass(classId, deleteData = true) {
        const classes = userSettings.academic.classes || [];
        const classIndex = classes.findIndex(c => c.id === classId);

        if (classIndex === -1) {
            console.warn(`[ClassManager] Classe non trouvée: ${classId}`);
            return false;
        }

        const deletedClass = classes[classIndex];

        // Supprimer les données des élèves si demandé
        if (deleteData) {
            await this._deleteClassData(classId);
        }

        // Supprimer la classe du state
        classes.splice(classIndex, 1);

        // Si la classe supprimée était la classe courante, switch to another
        if (appState.currentClassId === classId) {
            const nextClass = classes[0] || null;
            appState.currentClassId = nextClass?.id || null;
            userSettings.academic.currentClassId = nextClass?.id || null;

            // CRITICAL: Si plus aucune classe, vider les résultats filtrés
            if (!nextClass) {
                appState.filteredResults = [];
            }
        }

        // Sauvegarder localement
        StorageManager?.saveAppState();

        // Synchroniser immédiatement vers le cloud pour propager la suppression
        this._triggerCloudSync();

        UI?.showNotification(`Classe "${deletedClass.name}" supprimée`, 'success');
        return true;
    },

    /**
     * Trigger cloud sync if connected (non-blocking)
     * @deprecated Now using explicit Save/Load paradigm - this method is kept for backward compatibility but does nothing
     * @private
     */
    _triggerCloudSync() {
        // DEPRECATED: With Save/Load paradigm, sync is explicit
        // User must manually save to cloud via Settings > Cloud > Sauvegarder
        if (DEBUG) console.log('[ClassManager] Auto-sync disabled - using Save/Load paradigm');
    },

    /**
     * Change la classe courante
     * @param {string} classId - ID de la nouvelle classe courante
     * @param {boolean} [refreshUI=true] - Rafraîchir l'interface
     */
    async switchClass(classId) {
        const classes = userSettings.academic.classes || [];
        const targetClass = classes.find(c => c.id === classId);

        if (!targetClass && classId !== null) {
            console.warn(`[ClassManager] Classe non trouvée: ${classId}`);
            return;
        }

        // Mettre à jour le state
        userSettings.academic.currentClassId = classId;

        // Filtrer les résultats pour cette classe
        await this._filterResultsByClass(classId);

        // Sauvegarder
        StorageManager?.saveAppState();
        // Le header affiche déjà la classe active, pas besoin de notification
    },

    /**
     * Récupère toutes les classes
     * @returns {Array} Liste des classes
     */
    getAllClasses() {
        return userSettings.academic.classes || [];
    },

    /**
     * Réordonne les classes selon un nouvel ordre
     * @param {string[]} orderedIds - IDs des classes dans le nouvel ordre
     */
    reorderClasses(orderedIds) {
        const classes = userSettings.academic.classes || [];
        const reordered = orderedIds
            .map(id => classes.find(c => c.id === id))
            .filter(Boolean);

        // Préserver les classes non incluses (edge case safety)
        const remaining = classes.filter(c => !orderedIds.includes(c.id));
        userSettings.academic.classes = [...reordered, ...remaining];

        StorageManager?.saveAppState();
        this._triggerCloudSync();
    },

    /**
     * Récupère la classe courante
     * @returns {Object|null} Classe courante ou null
     */
    getCurrentClass() {
        const classId = appState.currentClassId;
        if (!classId) return null;
        return this.getAllClasses().find(c => c.id === classId) || null;
    },

    /**
     * Récupère une classe par son ID
     * @param {string} classId - ID de la classe
     * @returns {Object|null} La classe ou null
     */
    getClassById(classId) {
        return this.getAllClasses().find(c => c.id === classId) || null;
    },

    /**
     * Récupère les élèves/résultats d'une classe
     * @param {string} [classId] - ID de la classe (ou courante si non spécifié)
     * @returns {Array} Résultats filtrés par classe
     */
    async getClassStudents(classId = null) {
        // Utiliser directement userSettings pour cohérence avec switchClass
        const targetClassId = classId || userSettings.academic.currentClassId;
        const allResults = await DBService.getAll('generatedResults') || [];

        if (!targetClassId) {
            // Mode legacy: retourner tous les résultats sans classId
            return allResults.filter(r => !r.classId);
        }

        return allResults.filter(r => r.classId === targetClassId);
    },

    /**
     * Migre les données existantes vers une classe par défaut
     * Appelé lors de la première utilisation multi-classes
     */
    async migrateToMultiClass() {
        const classes = userSettings.academic.classes || [];

        // Si déjà des classes, ne pas migrer
        if (classes.length > 0) {
            return false;
        }

        // Créer la classe par défaut
        const defaultClass = this.createClass('Ma Classe');

        // Migrer tous les résultats existants vers cette classe
        const allResults = await DBService.getAll('generatedResults') || [];
        const resultsWithoutClass = allResults.filter(r => !r.classId);

        if (resultsWithoutClass.length > 0) {
            for (const result of resultsWithoutClass) {
                result.classId = defaultClass.id;
            }
            await DBService.putAll('generatedResults', allResults);

        }

        // Définir comme classe courante
        userSettings.academic.currentClassId = defaultClass.id;
        StorageManager?.saveAppState();

        return true;
    },

    /**
     * Exporte les données d'une classe en JSON
     * @param {string} classId - ID de la classe
     * @returns {Object} Données exportables
     */
    async exportClass(classId) {
        const targetClass = this.getClassById(classId);
        if (!targetClass) return null;

        const students = await this.getClassStudents(classId);

        return {
            version: '1.0',
            exportedAt: new Date().toISOString(),
            class: targetClass,
            students: students
        };
    },

    /**
     * Importe une classe depuis des données JSON
     * @param {Object} data - Données importées
     * @returns {Object} La classe importée
     */
    async importClass(data) {
        if (!data || !data.class) {
            throw new Error('Format de données invalide');
        }

        // Créer la classe avec un nouvel ID
        const importedClass = this.createClass(
            data.class.name + ' (importée)',
            data.class.year,
            data.class.subject
        );

        // Importer les étudiants avec le nouvel ID de classe
        if (data.students && data.students.length > 0) {
            const studentsToImport = data.students.map(s => ({
                ...s,
                id: generateUUID(), // Nouvel ID pour éviter les conflits
                classId: importedClass.id
            }));
            await DBService.putAll('generatedResults', studentsToImport);
        }

        return importedClass;
    },

    // ============================================
    // Méthodes privées
    // ============================================

    /**
     * Calcule l'année scolaire courante
     * @private
     */
    _getCurrentSchoolYear() {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth(); // 0-indexed

        // Si après août, c'est l'année X-X+1, sinon X-1-X
        if (month >= 8) { // Septembre+
            return `${year}-${year + 1}`;
        }
        return `${year - 1}-${year}`;
    },

    /**
     * Supprime les données d'une classe
     * @private
     */
    async _deleteClassData(classId) {
        // FIX: Backup before delete for rollback capability
        const allResults = await DBService.getAll('generatedResults') || [];
        const studentsToDelete = allResults.filter(r => r.classId === classId);
        const resultsToKeep = allResults.filter(r => r.classId !== classId);
        const deletedCount = studentsToDelete.length;

        // Record tombstones for sync BEFORE deletion (prevents re-import from cloud)
        const { runtimeState } = await import('../state/State.js');
        if (!runtimeState.data.deletedItems) {
            runtimeState.data.deletedItems = { students: [], classes: [] };
        }
        const now = Date.now();
        studentsToDelete.forEach(student => {
            runtimeState.data.deletedItems.students.push({
                id: student.id,
                classId: classId,
                deletedAt: now
            });
        });

        try {
            // putAll handles clear internally - single atomic operation
            await DBService.putAll('generatedResults', resultsToKeep);

            // CRITICAL: Synchroniser la mémoire pour éviter les données orphelines
            appState.generatedResults = resultsToKeep;

            // Recalculer filteredResults selon la classe courante
            const currentClassId = userSettings.academic.currentClassId;
            if (currentClassId && currentClassId !== classId) {
                appState.filteredResults = resultsToKeep.filter(r => r.classId === currentClassId);
            } else {
                appState.filteredResults = [];
            }


        } catch (error) {
            console.error('[ClassManager] _deleteClassData failed, data may be corrupted:', error);
            // Attempt recovery - try to restore from backup
            try {
                await DBService.putAll('generatedResults', allResults);

            } catch (recoveryError) {
                console.error('[ClassManager] Recovery FAILED - data may be lost:', recoveryError);
            }
            throw error;
        }
    },


    /**
 * Filtre les résultats par classe et met à jour le state
 * Utilise les données en mémoire (appState.generatedResults) plutôt que de
 * recharger depuis IndexedDB pour préserver les modifications non-sauvegardées
 * @private
 */
    async _filterResultsByClass(classId) {
        // Utiliser les données en mémoire, pas IndexedDB
        // Cela préserve les suppressions et modifications en cours
        const allResults = appState.generatedResults || [];

        if (!classId) {
            // Pas de filtre, garder tous les résultats
            appState.filteredResults = [...allResults];
        } else {
            // Filtrer par classId
            appState.filteredResults = allResults.filter(r => r.classId === classId);
        }
    }
};
