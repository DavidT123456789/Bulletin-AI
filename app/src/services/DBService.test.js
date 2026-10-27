import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
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

describe('DBService (T-01 — Caractérisation IndexedDB & Intégrité des suppressions)', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        localStorage.clear();
        StorageManager._lastSaveHash = null;
        StorageManager._saveQueue = Promise.resolve();

        await DBService.open();
        await DBService.clear('generatedResults');

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
});
