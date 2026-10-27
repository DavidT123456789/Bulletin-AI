import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DBService } from './DBService.js';
import { appState } from '../state/State.js';
import { StorageManager } from '../managers/StorageManager.js';
import { SingleStudentManager } from '../managers/SingleStudentManager.js';
import { ResultsUIManager } from '../managers/ResultsUIManager.js';

vi.mock('../managers/ListViewManager.js', () => ({
    ListViewManager: {
        render: vi.fn()
    }
}));

vi.mock('../managers/UIManager.js', () => ({
    UI: {
        showNotification: vi.fn(),
        showConfirmModal: vi.fn((_title, _msg, onConfirm) => onConfirm())
    }
}));

describe('DBService (T-01 & Lot 10 — BulletinAssistantDB v2, Migration v1->v2 & Atomicité)', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        localStorage.clear();
        StorageManager._lastSaveHash = null;
        StorageManager._saveQueue = Promise.resolve();

        await DBService.open();
        await DBService.clear('generatedResults');
        await DBService.clear('classes');
        await DBService.clear('appData');

        appState.generatedResults = [];
        appState.filteredResults = [];

        SingleStudentManager.init(
            { updateActionButtonsState: vi.fn(), checkAndShowWelcomeState: vi.fn() },
            {}
        );
        ResultsUIManager.init(
            {},
            {
                showNotification: vi.fn(),
                showConfirmModal: vi.fn((_title, _msg, onConfirm) => onConfirm())
            }
        );
    });

    afterEach(() => {
        StorageManager.closeTabSync?.();
    });

    it('effectue les opérations CRUD nominales (put, get, getAll, putAll, delete, clear)', async () => {
        const s1 = { id: 's1', studentData: { prenom: 'Alice', nom: 'Martin' } };
        const s2 = { id: 's2', studentData: { prenom: 'Bob', nom: 'Dupont' } };

        await DBService.put('generatedResults', s1);
        expect(await DBService.get('generatedResults', 's1')).toEqual(s1);

        await DBService.putAll('generatedResults', [s1, s2]);
        expect(await DBService.getAll('generatedResults')).toHaveLength(2);

        await DBService.delete('generatedResults', 's1');
        expect(await DBService.get('generatedResults', 's1')).toBeUndefined();

        await DBService.clear('generatedResults');
        expect(await DBService.getAll('generatedResults')).toEqual([]);
    });

    it('T-01 (Bug A-02) : supprime effectivement les élèves dans IndexedDB lors de SingleStudentManager.delete et ResultsUIManager.clearAllResults (aucun élève zombie)', async () => {
        const initialStudents = [
            { id: 's1', classId: 'c1', studentData: { prenom: 'Alice', nom: 'Martin' } },
            { id: 's2', classId: 'c1', studentData: { prenom: 'Bob', nom: 'Dupont' } },
            { id: 's3', classId: 'c1', studentData: { prenom: 'Chloé', nom: 'Bernard' } }
        ];

        await DBService.putAll('generatedResults', initialStudents);
        appState.generatedResults = initialStudents.map(s => ({ ...s }));
        appState.filteredResults = initialStudents.map(s => ({ ...s }));

        // 1. Suppression individuelle de s1 via SingleStudentManager.delete
        SingleStudentManager.delete('s1');
        await StorageManager._saveQueue;

        const afterSingleDelete = await DBService.getAll('generatedResults');
        expect(afterSingleDelete.map(s => s.id)).toEqual(['s2', 's3']);

        // 2. Vidage complet via ResultsUIManager.clearAllResults
        ResultsUIManager.clearAllResults();
        await StorageManager._saveQueue;

        const afterClearAll = await DBService.getAll('generatedResults');
        expect(afterClearAll).toEqual([]);
    });

    it('T-01 (Bug A-05) : remplace atomiquement le store via DBService.replaceAll et annule la transaction (rollback) si un item est invalide', async () => {
        const existingStudents = [
            { id: 's1', studentData: { prenom: 'Alice', nom: 'Martin' } },
            { id: 's2', studentData: { prenom: 'Bob', nom: 'Dupont' } }
        ];
        await DBService.putAll('generatedResults', existingStudents);

        // La méthode atomique replaceAll doit exister sur DBService
        expect(typeof DBService.replaceAll).toBe('function');

        // Remplacement nominal dans une transaction unique (clear + put)
        const nextStudents = [
            { id: 's3', studentData: { prenom: 'Chloé', nom: 'Bernard' } }
        ];
        await DBService.replaceAll('generatedResults', nextStudents);
        expect(await DBService.getAll('generatedResults')).toEqual(nextStudents);

        // En cas d'item invalide (sans clé primaire `id`), la transaction entière doit être annulée
        // et les données précédentes ('s3') doivent rester intactes dans IndexedDB
        const corruptedBatch = [
            { id: 's4', studentData: { prenom: 'David', nom: 'Moreau' } },
            { studentData: { prenom: 'SansId', nom: 'Erreur' } } // pas de keyPath 'id'
        ];
        await expect(DBService.replaceAll('generatedResults', corruptedBatch)).rejects.toThrow();

        const preservedAfterRollback = await DBService.getAll('generatedResults');
        expect(preservedAfterRollback).toEqual(nextStudents);
    });

    it('Lot 10 (A-01 / A-06) : expose BulletinAssistantDB v2 avec les stores generatedResults (index by_classId), classes et appData', async () => {
        expect(DBService.version).toBe(2);
        const db = await DBService.open();

        expect(db.version).toBe(2);
        expect(db.objectStoreNames.contains('generatedResults')).toBe(true);
        expect(db.objectStoreNames.contains('classes')).toBe(true);
        expect(db.objectStoreNames.contains('appData')).toBe(true);

        const s1 = { id: 's1', classId: 'class-3A', studentData: { prenom: 'Alice' } };
        const s2 = { id: 's2', classId: 'class-3B', studentData: { prenom: 'Bob' } };
        const s3 = { id: 's3', classId: 'class-3A', studentData: { prenom: 'Chloé' } };
        await DBService.putAll('generatedResults', [s1, s2, s3]);

        const class3AStudents = await DBService.getByIndex('generatedResults', 'by_classId', 'class-3A');
        expect(class3AStudents.map(s => s.id)).toEqual(['s1', 's3']);
    });

    it('Lot 10 (A-01) : effectue une migration ascendante v1 -> v2 transparente en préservant 100 % des élèves et réglages existants', async () => {
        DBService.close();

        // Supprimer la base courante pour recréer une base v1 authentique
        await new Promise((resolve, reject) => {
            const delReq = indexedDB.deleteDatabase(DBService.dbName);
            delReq.onsuccess = () => resolve();
            delReq.onerror = () => reject(delReq.error);
        });

        // 1. Créer et peupler une base en version 1 (sans store 'classes' ni index 'by_classId')
        const legacyStudents = [
            { id: 'legacy-1', classId: 'c-v1', studentData: { prenom: 'Lucas', nom: 'V1' } },
            { id: 'legacy-2', classId: 'c-v1', studentData: { prenom: 'Emma', nom: 'V1' } }
        ];
        const legacySettings = { key: 'userSettings', value: { ui: { theme: 'light' } } };

        await new Promise((resolve, reject) => {
            const req = indexedDB.open(DBService.dbName, 1);
            req.onupgradeneeded = (event) => {
                const db = event.target.result;
                db.createObjectStore('generatedResults', { keyPath: 'id' });
                db.createObjectStore('appData', { keyPath: 'key' });
            };
            req.onsuccess = (event) => {
                const db = event.target.result;
                const tx = db.transaction(['generatedResults', 'appData'], 'readwrite');
                const resStore = tx.objectStore('generatedResults');
                legacyStudents.forEach(s => resStore.put(s));
                tx.objectStore('appData').put(legacySettings);
                tx.oncomplete = () => {
                    db.close();
                    resolve();
                };
                tx.onerror = () => reject(tx.error);
            };
            req.onerror = () => reject(req.error);
        });

        // 2. Ouvrir via DBService (version 2) -> déclenche la migration ascendante v1 -> v2
        const upgradedDb = await DBService.open();
        expect(upgradedDb.version).toBe(2);
        expect(upgradedDb.objectStoreNames.contains('classes')).toBe(true);

        // 3. Vérifier la préservation à 100 % des élèves et réglages v1 + le fonctionnement du nouvel index by_classId
        const migratedStudents = await DBService.getAll('generatedResults');
        expect(migratedStudents).toEqual(legacyStudents);

        const byClass = await DBService.getByIndex('generatedResults', 'by_classId', 'c-v1');
        expect(byClass).toEqual(legacyStudents);

        const migratedSettings = await DBService.get('appData', 'userSettings');
        expect(migratedSettings).toEqual(legacySettings);
    });

    it('Lot 10 : exécute saveAtomicSnapshot et replaceAllAtomic de manière atomique sur plusieurs stores avec rollback complet en cas d\'erreur', async () => {
        const initialStudent = { id: 's-init', classId: 'c-init', studentData: { prenom: 'Initial' } };
        const initialClass = { id: 'c-init', name: '6e Initiale' };

        await DBService.saveAtomicSnapshot({
            studentsToPut: [initialStudent],
            classesToPut: [initialClass],
            settingsSnapshot: { theme: 'dark' }
        });

        expect(await DBService.getAll('generatedResults')).toEqual([initialStudent]);
        expect(await DBService.getAll('classes')).toEqual([initialClass]);
        expect(await DBService.get('appData', 'userSettings')).toMatchObject({ key: 'userSettings', value: { theme: 'dark' } });

        // Tentative de replaceAllAtomic avec une classe invalide (sans 'id') -> rollback sur tous les stores
        await expect(
            DBService.replaceAllAtomic({
                students: [{ id: 's-new', classId: 'c-new' }],
                classes: [{ name: 'Classe Sans ID' }] // Invalide : keyPath 'id' manquant
            })
        ).rejects.toThrow();

        // Les deux stores doivent avoir conservé leur état antérieur grâce au rollback transactionnel
        expect(await DBService.getAll('generatedResults')).toEqual([initialStudent]);
        expect(await DBService.getAll('classes')).toEqual([initialClass]);
    });
});
