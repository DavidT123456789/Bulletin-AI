/**
 * Service gérant l'interaction avec IndexedDB pour le stockage persistant volumineux.
 * Schéma BulletinAssistantDB v2 :
 * - 'generatedResults' ({ keyPath: 'id' }, index 'by_classId' sur 'classId') : fiches élèves
 * - 'classes' ({ keyPath: 'id' }) : métadonnées de classes, plans de classe et synthèses
 * - 'appData' ({ keyPath: 'key' }) : 'userSettings', 'deletedItems', 'pre_restore_backup'
 */
export const DBService = {
    dbName: 'BulletinAssistantDB',
    version: 2,
    db: null,

    /**
     * Ouvre la connexion à la base de données.
     * Crée ou migre le schéma en version 2 de façon transparente et non-destructive.
     * @returns {Promise<IDBDatabase>} La connexion BDD
     */
    async open() {
        if (this.db) {
            if (this.db.version === this.version) {
                return this.db;
            }
            this.close();
        }

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                const transaction = event.target.transaction;

                // 1. Store 'generatedResults' (fiches élèves + index 'by_classId')
                let resultsStore;
                if (!db.objectStoreNames.contains('generatedResults')) {
                    resultsStore = db.createObjectStore('generatedResults', { keyPath: 'id' });
                } else if (transaction) {
                    resultsStore = transaction.objectStore('generatedResults');
                }
                if (resultsStore && !resultsStore.indexNames.contains('by_classId')) {
                    resultsStore.createIndex('by_classId', 'classId', { unique: false });
                }

                // 2. Store 'classes' (métadonnées de classes, plans de classe, synthèses) — v2
                if (!db.objectStoreNames.contains('classes')) {
                    db.createObjectStore('classes', { keyPath: 'id' });
                }

                // 3. Store 'appData' ('userSettings', 'deletedItems', 'pre_restore_backup')
                if (!db.objectStoreNames.contains('appData')) {
                    db.createObjectStore('appData', { keyPath: 'key' });
                }
            };

            request.onsuccess = (event) => {
                const db = event.target.result;
                db.onversionchange = () => {
                    db.close();
                    if (this.db === db) {
                        this.db = null;
                    }
                };
                this.db = db;
                resolve(this.db);
            };

            request.onerror = (event) => {
                console.error("Erreur ouverture IndexedDB:", event.target.error);
                reject(event.target.error);
            };
        });
    },

    /**
     * Ferme proprement la connexion active à IndexedDB.
     */
    close() {
        if (this.db) {
            try {
                this.db.close();
            } catch (_) { /* ignore */ }
            this.db = null;
        }
    },

    /**
     * Récupère un objet d'un store.
     * @param {string} storeName 
     * @param {string} key 
     */
    async get(storeName, key) {
        await this.open();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(key);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Récupère tous les objets d'un store.
     * @param {string} storeName 
     */
    async getAll(storeName) {
        await this.open();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Récupère tous les objets d'un store correspondant à une clé d'index.
     * @param {string} storeName
     * @param {string} indexName
     * @param {*} key
     * @returns {Promise<Array<Object>>}
     */
    async getByIndex(storeName, indexName, key) {
        await this.open();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const index = store.index(indexName);
            const request = index.getAll(key);

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Sauvegarde un objet dans un store.
     * @param {string} storeName 
     * @param {Object} value 
     */
    async put(storeName, value) {
        await this.open();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(value);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Sauvegarde plusieurs objets dans un store (transaction unique).
     * Utilise un upsert non-destructif : insère ou met à jour chaque item
     * sans vider le store au préalable. Pour les suppressions, utiliser
     * delete() ou clear() explicitement.
     * @param {string} storeName 
     * @param {Array<Object>} items 
     */
    async putAll(storeName, items) {
        await this.open();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);

            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);

            items.forEach(item => store.put(item));
        });
    },

    /**
     * Remplace atomiquement tout le contenu d'un store (clear + put de tous les items)
     * dans une unique transaction readwrite. En cas d'erreur sur un item, la transaction
     * entière est annulée (rollback automatique IndexedDB).
     * @param {string} storeName
     * @param {Array<Object>} items
     */
    async replaceAll(storeName, items = []) {
        await this.open();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);

            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error || new Error('Transaction aborted'));

            try {
                store.clear();
                items.forEach(item => store.put(item));
            } catch (err) {
                try {
                    transaction.abort();
                } catch (_) { /* transaction déjà annulée */ }
                reject(err);
            }
        });
    },

    /**
     * Exécute atomiquement dans UNE SEULE transaction readwrite sur ['generatedResults', 'classes', 'appData']
     * les mises à jour et suppressions d'élèves, de classes et de paramètres.
     * En cas d'erreur sur un item, la transaction entière est annulée (rollback automatique IndexedDB).
     * @param {Object} payload
     * @param {Array<Object>} [payload.studentsToPut=[]]
     * @param {Array<string>} [payload.studentIdsToDelete=[]]
     * @param {Array<Object>} [payload.classesToPut=[]]
     * @param {Array<string>} [payload.classIdsToDelete=[]]
     * @param {Object|null} [payload.settingsSnapshot=null]
     * @param {Object|null} [payload.deletedItems=null]
     */
    async saveAtomicSnapshot({
        studentsToPut = [],
        studentIdsToDelete = [],
        classesToPut = [],
        classIdsToDelete = [],
        settingsSnapshot = null,
        deletedItems = null
    } = {}) {
        await this.open();
        return new Promise((resolve, reject) => {
            const storeNames = ['generatedResults', 'classes', 'appData'].filter(name =>
                this.db.objectStoreNames.contains(name)
            );
            const transaction = this.db.transaction(storeNames, 'readwrite');

            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error || new Error('Transaction aborted'));

            try {
                if (storeNames.includes('generatedResults')) {
                    const studentsStore = transaction.objectStore('generatedResults');
                    studentIdsToDelete.forEach(id => studentsStore.delete(id));
                    studentsToPut.forEach(student => studentsStore.put(student));
                }

                if (storeNames.includes('classes')) {
                    const classesStore = transaction.objectStore('classes');
                    classIdsToDelete.forEach(id => classesStore.delete(id));
                    classesToPut.forEach(cls => classesStore.put(cls));
                }

                if (storeNames.includes('appData')) {
                    const appDataStore = transaction.objectStore('appData');
                    const now = Date.now();
                    if (settingsSnapshot !== null && settingsSnapshot !== undefined) {
                        appDataStore.put({
                            key: 'userSettings',
                            value: settingsSnapshot,
                            updatedAt: now
                        });
                    }
                    if (deletedItems !== null && deletedItems !== undefined) {
                        appDataStore.put({
                            key: 'deletedItems',
                            value: deletedItems,
                            updatedAt: now
                        });
                    }
                }
            } catch (err) {
                try {
                    transaction.abort();
                } catch (_) { /* transaction déjà annulée */ }
                reject(err);
            }
        });
    },

    /**
     * Remplace atomiquement les stores 'generatedResults', 'classes' et 'appData'
     * dans une unique transaction readwrite (clear + put avec rollback automatique en cas d'erreur).
     * @param {Object} payload
     * @param {Array<Object>|null} [payload.students=null]
     * @param {Array<Object>|null} [payload.classes=null]
     * @param {Object|null} [payload.settingsSnapshot=null]
     * @param {Object|null} [payload.deletedItems=null]
     */
    async replaceAllAtomic({
        students = null,
        classes = null,
        settingsSnapshot = null,
        deletedItems = null
    } = {}) {
        await this.open();
        return new Promise((resolve, reject) => {
            const storeNames = ['generatedResults', 'classes', 'appData'].filter(name =>
                this.db.objectStoreNames.contains(name)
            );
            const transaction = this.db.transaction(storeNames, 'readwrite');

            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error || new Error('Transaction aborted'));

            try {
                if (Array.isArray(students) && storeNames.includes('generatedResults')) {
                    const studentsStore = transaction.objectStore('generatedResults');
                    studentsStore.clear();
                    students.forEach(student => studentsStore.put(student));
                }

                if (Array.isArray(classes) && storeNames.includes('classes')) {
                    const classesStore = transaction.objectStore('classes');
                    classesStore.clear();
                    classes.forEach(cls => classesStore.put(cls));
                }

                if (storeNames.includes('appData')) {
                    const appDataStore = transaction.objectStore('appData');
                    const now = Date.now();
                    if (settingsSnapshot !== null && settingsSnapshot !== undefined) {
                        appDataStore.put({
                            key: 'userSettings',
                            value: settingsSnapshot,
                            updatedAt: now
                        });
                    }
                    if (deletedItems !== null && deletedItems !== undefined) {
                        appDataStore.put({
                            key: 'deletedItems',
                            value: deletedItems,
                            updatedAt: now
                        });
                    }
                }
            } catch (err) {
                try {
                    transaction.abort();
                } catch (_) { /* transaction déjà annulée */ }
                reject(err);
            }
        });
    },

    /**
     * Supprime un enregistrement d'un store par sa clé.
     * @param {string} storeName 
     * @param {string} key 
     */
    async delete(storeName, key) {
        await this.open();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(key);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Vide un store.
     * @param {string} storeName 
     */
    async clear(storeName) {
        await this.open();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
};
