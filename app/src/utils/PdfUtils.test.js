/**
 * @fileoverview Tests unitaires pour PdfUtils (détection et garde PDF)
 * @module utils/PdfUtils.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetPage = vi.fn();
const mockGetDocument = vi.fn(() => ({
    promise: Promise.resolve({
        numPages: 1,
        getPage: mockGetPage
    })
}));

vi.mock('pdfjs-dist', () => ({
    GlobalWorkerOptions: { workerSrc: '' },
    getDocument: mockGetDocument
}));

import { isPdf, extractTextFromPdf } from './PdfUtils.js';

describe('PdfUtils', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetPage.mockResolvedValue({
            getTextContent: vi.fn().mockResolvedValue({
                items: [{ str: 'DUPONT Jean', transform: [1, 0, 0, 1, 10, 100], height: 10, width: 60 }]
            })
        });
    });

    describe('isPdf()', () => {
        it('accepte MIME application/pdf, extension .pdf sans type MIME et casse majuscule', () => {
            expect(isPdf({ type: 'application/pdf', name: 'bilan.pdf' })).toBe(true);
            expect(isPdf({ type: '', name: 'bilan.pdf' })).toBe(true);
            expect(isPdf({ type: 'application/octet-stream', name: 'RELEVE.PDF' })).toBe(true);
        });

        it('rejette les fichiers non-PDF et les valeurs nulles/incomplètes', () => {
            expect(isPdf({ type: 'text/csv', name: 'notes.csv' })).toBe(false);
            expect(isPdf({ type: '', name: 'classe.xlsx' })).toBe(false);
            expect(isPdf({ type: '' })).toBe(false);
            expect(isPdf(null)).toBe(false);
            expect(isPdf(undefined)).toBe(false);
        });
    });

    describe('extractTextFromPdf()', () => {
        it('extrait le texte d’un fichier .pdf même lorsque file.type est vide', async () => {
            const file = {
                name: 'bilan.pdf',
                type: '',
                arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8))
            };

            const text = await extractTextFromPdf(file);

            expect(mockGetDocument).toHaveBeenCalledTimes(1);
            expect(text).toContain('DUPONT Jean');
        });

        it('lève une erreur explicite si le fichier n’est pas un PDF', async () => {
            await expect(extractTextFromPdf(null)).rejects.toThrow('Le fichier doit être un PDF');
            await expect(extractTextFromPdf({ name: 'notes.csv', type: 'text/csv' })).rejects.toThrow('Le fichier doit être un PDF');
        });
    });
});
