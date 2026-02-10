/**
 * Service gérant l'interaction avec IndexedDB pour le stockage persistant volumineux.
 * Enveloppe l'API IndexedDB native dans des Promesses.
 */
export const DBService = {
    dbName: 'BulletinAssistantDB',
    version: 1,
    db: null,

    /**
     * Ouvre la connexion à la base de données.
     * Crée le schéma si nécessaire.
     * @returns {Promise<IDBDatabase>} La connexion BDD
     */
    async open() {
        if (this.db) return this.db;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                // Store pour les résultats générés
                if (!db.objectStoreNames.contains('generatedResults')) {
                    db.createObjectStore('generatedResults', { keyPath: 'id' });
                }
                // Store pour l'historique des instructions (clé unique auto-générée ou simple)
                // Ici on stocke tout l'historique comme un seul objet ou liste d'objets ?
                // Vu l'usage actuel (array json), stockons-le sous une clé unique dans un store 'appData'
                if (!db.objectStoreNames.contains('appData')) {
                    db.createObjectStore('appData', { keyPath: 'key' });
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
            };

            request.onerror = (event) => {
                console.error("Erreur ouverture IndexedDB:", event.target.error);
                reject(event.target.error);
            };
        });
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
