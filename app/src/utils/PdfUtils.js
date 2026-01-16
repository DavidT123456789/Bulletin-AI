/**
 * @fileoverview Utilitaires pour l'extraction de texte depuis des fichiers PDF
 * Utilise pdfjs-dist avec lazy loading pour minimiser l'impact sur le bundle
 * @module utils/PdfUtils
 */

let pdfjsLib = null;

/**
 * Charge la bibliothèque PDF.js de manière lazy
 * @returns {Promise<Object>} La bibliothèque pdfjs-dist
 */
async function loadPdfJs() {
    if (pdfjsLib) return pdfjsLib;

    // Import dynamique pour lazy loading
    const pdfjs = await import('pdfjs-dist');

    // Configure le worker
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.mjs',
        import.meta.url
    ).toString();

    pdfjsLib = pdfjs;
    return pdfjsLib;
}

/**
 * Extrait le texte d'un fichier PDF
 * 
 * @param {File} file - Le fichier PDF à traiter
 * @returns {Promise<string>} Le texte extrait du PDF
 * @throws {Error} Si le fichier n'est pas un PDF ou si l'extraction échoue
 * 
 * @example
 * const file = event.dataTransfer.files[0];
 * const text = await extractTextFromPdf(file);
 */
export async function extractTextFromPdf(file) {
    if (!file || file.type !== 'application/pdf') {
        throw new Error('Le fichier doit être un PDF');
    }

    const pdfjs = await loadPdfJs();

    // Convertit le fichier en ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();

    // Charge le document PDF
    const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;

    const textParts = [];

    // Extrait le texte de chaque page
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();

        // Reconstruit le texte avec les sauts de ligne
        let lastY = null;
        const pageText = [];

        for (const item of textContent.items) {
            if (item.str.trim() === '') continue;

            // Détecte les sauts de ligne basés sur la position Y
            if (lastY !== null && Math.abs(item.transform[5] - lastY) > 5) {
                pageText.push('\n');
            }

            pageText.push(item.str);
            lastY = item.transform[5];
        }

        textParts.push(pageText.join(''));
    }

    return textParts.join('\n\n');
}

/**
 * Vérifie si un fichier est un PDF
 * @param {File} file - Le fichier à vérifier
 * @returns {boolean} True si le fichier est un PDF
 */
export function isPdf(file) {
    return file && (
        file.type === 'application/pdf' ||
        file.name.toLowerCase().endsWith('.pdf')
    );
}
