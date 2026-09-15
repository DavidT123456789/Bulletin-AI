/**
 * @fileoverview Parser spécialisé pour les trombinoscopes PDF (Pronote / Onde)
 * Extraction 100% locale déterministe : géométrie, noms multi-lignes, photos et métadonnées.
 * @module utils/PronoteTrombiParser
 */

import { loadPdfJs } from './PdfUtils.js';

/**
 * Normalise les espaces typographiques (insécables, etc.)
 * @param {string} str 
 * @returns {string}
 */
export function normalizeText(str) {
    if (!str) return '';
    return str.replace(/[\u00A0\u2007\u202F]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Détecte si une ligne appartient au header/footer à exclure
 * @param {string} text 
 * @returns {boolean}
 */
export function isHeaderOrFooterText(text) {
    const lower = text.toLowerCase();
    return (
        lower.includes('trombinoscope de la classe') ||
        lower.includes('professeur principal') ||
        lower.includes('année scolaire') ||
        lower.includes('trombinoscope édité') ||
        lower.includes('page ') ||
        lower.includes('collège') ||
        lower.includes('lycée') ||
        lower.includes('école') ||
        /^\d+\s+élèves?$/i.test(text.trim())
    );
}

/**
 * Sépare un nom complet d'élève en { nom, prenom }
 * Règle Pronote : le nom de famille est en MAJUSCULES, le prénom a une casse mixte (Ex: "AUBERT Noe", "DE OLIVEIRA FERREIRA Bianca")
 * @param {string} fullStr 
 * @returns {{ nom: string, prenom: string }}
 */
export function splitStudentFullName(fullStr) {
    const cleaned = normalizeText(fullStr);
    if (!cleaned) return { nom: '', prenom: '' };

    const words = cleaned.split(' ').filter(Boolean);
    if (words.length === 1) {
        return { nom: words[0].toUpperCase(), prenom: '' };
    }

    const uppercaseWords = [];
    const mixedcaseWords = [];

    for (const word of words) {
        // Un mot avec au moins une lettre minuscule est considéré comme un prénom (ex: "Noe", "Éloïse", "Jean-Baptiste")
        const hasLower = /[a-zàâäéèêëïîôùûüç]/.test(word);
        const hasUpper = /[A-ZÀ-ÿ]/.test(word);

        if (hasLower) {
            mixedcaseWords.push(word);
        } else if (hasUpper) {
            uppercaseWords.push(word);
        } else {
            // Ponctuation pure ou tirets
            uppercaseWords.push(word);
        }
    }

    // Cas nominal : mots majuscules = nom, mots mixtes = prénom
    if (uppercaseWords.length > 0 && mixedcaseWords.length > 0) {
        return {
            nom: uppercaseWords.join(' '),
            prenom: mixedcaseWords.join(' ')
        };
    }

    // Fallback si tout est en majuscule ou tout en minuscule :
    // On considère le dernier mot comme le prénom et les précédents comme le nom
    const lastWord = words[words.length - 1];
    const initialWords = words.slice(0, words.length - 1);

    return {
        nom: initialWords.join(' ').toUpperCase(),
        prenom: lastWord
    };
}

/**
 * Extrait les métadonnées depuis le texte de la première page
 * @param {string} pageText 
 * @returns {{ className: string, totalStudents: number, schoolName: string, schoolYear: string }}
 */
export function extractTrombiMetadata(pageText) {
    const result = {
        className: '',
        totalStudents: 0,
        schoolName: '',
        schoolYear: ''
    };

    if (!pageText) return result;

    // Détection de la classe : "Trombinoscope de la classe 5 1" ou "Trombinoscope de la classe 6ème B"
    const classMatch = pageText.match(/Trombinoscope\s+de\s+la\s+classe\s+([^\n\r\t]+)/i);
    if (classMatch) {
        let rawClass = classMatch[1].trim();
        // Nettoyer si suivi du nombre d'élèves ou du professeur
        rawClass = rawClass.split(/\d+\s+élèves/i)[0];
        rawClass = rawClass.split(/Professeur/i)[0];
        result.className = normalizeText(rawClass);
    }

    // Détection du nombre total d'élèves : "28 élèves"
    const countMatch = pageText.match(/(\d+)\s+élèves/i);
    if (countMatch) {
        result.totalStudents = parseInt(countMatch[1], 10);
    }

    // Établissement (ex: "Collège Jean Monnet - Epernay")
    const schoolMatch = pageText.match(/(Collège[^\n\r\t]+|Lycée[^\n\r\t]+|École[^\n\r\t]+)/i);
    if (schoolMatch) {
        let rawSchool = schoolMatch[1].split(/Année\s+scolaire/i)[0];
        result.schoolName = normalizeText(rawSchool);
    }

    // Année scolaire (ex: "Année scolaire 2026-2027")
    const yearMatch = pageText.match(/Année\s+scolaire\s+([0-9]{4}-[0-9]{4})/i);
    if (yearMatch) {
        result.schoolYear = yearMatch[1].trim();
    }

    return result;
}

/**
 * Regroupe et extrait les élèves d'une page avec coordonnées géométriques
 * @param {Array<Object>} textItems - Items de getTextContent()
 * @param {Object} viewport - Viewport PDF.js
 * @param {number} pageIndex - Index de la page (0-based)
 * @returns {Array<Object>} Élèves détectés avec géométrie
 */
export function extractStudentsFromTextItems(textItems, viewport, pageIndex = 0, imageRects = []) {
    const validItems = [];

    for (const item of textItems) {
        const str = normalizeText(item.str);
        if (!str || isHeaderOrFooterText(str)) continue;

        // Conversion en coordonnées canvas (0,0 en haut à gauche)
        const [canvasX, canvasY] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
        const width = (item.width || str.length * 6) * viewport.scale;
        const height = (item.height || 10) * viewport.scale;

        // Filtrer les zones extrêmes (trop haut = header, trop bas = footer)
        if (canvasY < viewport.height * 0.10 || canvasY > viewport.height * 0.94) {
            continue;
        }

        validItems.push({
            str,
            x: canvasX,
            y: canvasY,
            width,
            height,
            centerX: canvasX + width / 2
        });
    }

    if (validItems.length === 0) return [];

    // Détection des colonnes par clustering horizontal (typiquement 4 colonnes régulières)
    const sortedByX = [...validItems].sort((a, b) => a.centerX - b.centerX);
    const columns = [];
    const colThreshold = viewport.width * 0.12;

    for (const item of sortedByX) {
        let matchedCol = columns.find(col => Math.abs(col.centerX - item.centerX) < colThreshold);
        if (!matchedCol) {
            matchedCol = { centerX: item.centerX, items: [] };
            columns.push(matchedCol);
        }
        matchedCol.items.push(item);
        matchedCol.centerX = matchedCol.items.reduce((sum, i) => sum + i.centerX, 0) / matchedCol.items.length;
    }

    // Trier les colonnes de gauche à droite
    columns.sort((a, b) => a.centerX - b.centerX);

    const students = [];
    const colWidth = viewport.width / (columns.length || 4);

    // Dans chaque colonne, trier les items verticalement (du haut vers le bas)
    columns.forEach((col, colIndex) => {
        col.items.sort((a, b) => a.y - b.y);

        const verticalLineThreshold = 30 * (viewport.scale || 1);
        const groupedEntries = [];
        let currentEntry = null;

        for (const item of col.items) {
            if (!currentEntry) {
                currentEntry = {
                    textParts: [item.str],
                    x: item.x,
                    y: item.y,
                    width: item.width,
                    height: item.height,
                    centerX: item.centerX,
                    bottomY: item.y + item.height
                };
            } else {
                const dy = item.y - currentEntry.bottomY;
                if (dy >= -5 && dy < verticalLineThreshold) {
                    currentEntry.textParts.push(item.str);
                    currentEntry.width = Math.max(currentEntry.width, item.width);
                    currentEntry.bottomY = item.y + item.height;
                } else {
                    groupedEntries.push(currentEntry);
                    currentEntry = {
                        textParts: [item.str],
                        x: item.x,
                        y: item.y,
                        width: item.width,
                        height: item.height,
                        centerX: item.centerX,
                        bottomY: item.y + item.height
                    };
                }
            }
        }

        if (currentEntry) {
            groupedEntries.push(currentEntry);
        }

        groupedEntries.forEach((entry, rowIndex) => {
            const rawFullName = entry.textParts.join(' ');
            const { nom, prenom } = splitStudentFullName(rawFullName);

            // 1. Chercher l'image correspondante extraite du flux PDF (précision au pixel près)
            let matchedRect = null;
            if (imageRects && imageRects.length > 0) {
                matchedRect = imageRects.find(rect => {
                    const dx = Math.abs(rect.cx - col.centerX);
                    const dy = entry.y - (rect.y + rect.height);
                    return dx < colWidth * 0.4 && dy >= -15 && dy < colWidth * 0.6;
                });
            }

            let cx, cy, r, photoBounds;
            if (matchedRect) {
                // Cadrage extrait du flux PDF : centré géométriquement sur la photo
                // avec micro-abaissement de 5.5% pour cadrer idéalement le regard et compenser le buste
                cx = matchedRect.cx;
                cy = matchedRect.cy + Math.round(matchedRect.height * 0.055);
                // Rayon calibré à 92% de la demi-boîte : correspond précisément à 20% sur la réglette de taille
                r = Math.round(matchedRect.r * 0.92);
                photoBounds = {
                    x: matchedRect.x,
                    y: matchedRect.y,
                    width: matchedRect.width,
                    height: matchedRect.height
                };
            } else {
                // Fallback géométrique corrigé (Pronote utilise des photos carrées ~96x96pt)
                const photoWidth = colWidth * 0.66;
                const photoHeight = photoWidth;
                const gapY = 16 * (viewport.scale || 1);

                const photoBottom = entry.y - gapY;
                const photoTop = photoBottom - photoHeight;
                const photoLeft = col.centerX - (photoWidth / 2);

                cx = col.centerX;
                cy = photoTop + (photoHeight / 2) + Math.round(photoHeight * 0.055);
                r = Math.round((photoWidth / 2) * 0.92);
                photoBounds = {
                    x: photoLeft,
                    y: photoTop,
                    width: photoWidth,
                    height: photoHeight
                };
            }

            students.push({
                pageIndex,
                colIndex,
                rowIndex,
                rawFullName,
                nom,
                prenom,
                colCenterX: col.centerX,
                textY: entry.y,
                photoBounds,
                zone: {
                    cx,
                    cy,
                    r
                }
            });
        });
    });

    // Trier les élèves dans l'ordre de lecture naturel : ligne par ligne (rowIndex, puis colIndex)
    students.sort((a, b) => {
        const rowDiff = a.rowIndex - b.rowIndex;
        if (rowDiff !== 0) return rowDiff;
        return a.colIndex - b.colIndex;
    });

    return students;
}

/**
 * Extrait les rectangles des images peintes dans la page PDF via son operatorList
 * @param {Object} page - Page PDF.js
 * @param {Object} viewport - Viewport PDF.js
 * @returns {Promise<Array<Object>>} Rectangles d'images [{ x, y, width, height, cx, cy, r }]
 */
export async function extractImageRectsFromPage(page, viewport) {
    if (!page || typeof page.getOperatorList !== 'function') return [];
    try {
        const ops = await page.getOperatorList();
        const rects = [];
        for (let i = 0; i < ops.fnArray.length; i++) {
            const fn = ops.fnArray[i];
            // 85 = paintImageXObject, 82 = paintJpegXObject, 83 = paintImageMaskXObject
            if (fn === 85 || fn === 82 || fn === 83) {
                for (let j = i - 1; j >= Math.max(0, i - 10); j--) {
                    if (ops.fnArray[j] === 13) { // 13 = transform
                        const matrix = ops.argsArray[j];
                        const [vx, vy] = viewport.convertToViewportPoint(matrix[4], matrix[5] + matrix[3]);
                        const [vx2, vy2] = viewport.convertToViewportPoint(matrix[4] + matrix[0], matrix[5]);
                        const width = vx2 - vx;
                        const height = vy2 - vy;
                        if (width > 40 && height > 40 && width < viewport.width * 0.6 && height < viewport.height * 0.6) {
                            rects.push({
                                x: vx,
                                y: vy,
                                width,
                                height,
                                cx: vx + width / 2,
                                cy: vy + height / 2,
                                r: Math.min(width, height) / 2
                            });
                        }
                        break;
                    }
                }
            }
        }
        return rects;
    } catch {
        return [];
    }
}

/**
 * Découpe une vignette photo carrée depuis le canvas
 * @param {HTMLCanvasElement} pageCanvas 
 * @param {{ cx: number, cy: number, r: number }} zone 
 * @param {number} targetSize - Taille de sortie (défaut 200px)
 * @returns {string} Base64 JPEG data URL
 */
export function cropStudentPhoto(pageCanvas, zone, targetSize = 200) {
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = targetSize;
    cropCanvas.height = targetSize;
    const ctx = cropCanvas.getContext('2d');

    const { cx, cy, r } = zone;
    const diameter = r * 2;

    const sx = Math.max(0, cx - r);
    const sy = Math.max(0, cy - r);
    const sw = Math.min(diameter, pageCanvas.width - sx);
    const sh = Math.min(diameter, pageCanvas.height - sy);

    ctx.drawImage(pageCanvas, sx, sy, sw, sh, 0, 0, targetSize, targetSize);
    return cropCanvas.toDataURL('image/jpeg', 0.85);
}

/**
 * Parser principal de fichier trombinoscope PDF
 * @param {File|ArrayBuffer} fileOrBuffer 
 * @param {Object} options 
 * @returns {Promise<Object>} Résultat structuré du trombinoscope
 */
export async function parsePronoteTrombiPdf(fileOrBuffer, options = {}) {
    const scale = options.scale || 2.0; // HiDPI
    const pdfjs = await loadPdfJs();

    let arrayBuffer;
    if (fileOrBuffer instanceof ArrayBuffer) {
        arrayBuffer = fileOrBuffer;
    } else if (fileOrBuffer && typeof fileOrBuffer.arrayBuffer === 'function') {
        arrayBuffer = await fileOrBuffer.arrayBuffer();
    } else {
        throw new Error('Données de fichier invalides');
    }

    const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;

    let metadata = { className: '', totalStudents: 0, schoolName: '', schoolYear: '' };
    const allStudents = [];
    const pages = [];
    let globalIdCounter = 1;

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const pageIndex = pageNum - 1;
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale });

        // Rendu canvas de la page
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');

        await page.render({ canvasContext: ctx, viewport }).promise;

        // Extraction de texte et des images exactes
        const textContent = await page.getTextContent();
        const imageRects = await extractImageRectsFromPage(page, viewport);

        // Récupérer les métadonnées depuis la page 1
        if (pageNum === 1) {
            const rawPageText = textContent.items.map(item => item.str).join(' ');
            metadata = extractTrombiMetadata(rawPageText);
        }

        // Extraction géométrique des élèves avec alignement exact sur les images
        const pageStudents = extractStudentsFromTextItems(textContent.items, viewport, pageIndex, imageRects);

        // Découper la photo pour chaque élève
        const pageZones = [];
        for (const student of pageStudents) {
            student.id = `trombi-student-${globalIdCounter++}`;
            student.photoData = cropStudentPhoto(canvas, student.zone);
            student.zone.id = globalIdCounter;
            student.zone.studentId = student.id;

            allStudents.push(student);
            pageZones.push(student.zone);
        }

        pages.push({
            pageIndex,
            pageNum,
            width: viewport.width,
            height: viewport.height,
            canvas,
            zones: pageZones,
            studentsCount: pageStudents.length
        });
    }

    return {
        isPronoteTrombi: true,
        className: metadata.className || 'Classe',
        totalStudentsCount: metadata.totalStudents || allStudents.length,
        detectedStudentsCount: allStudents.length,
        schoolName: metadata.schoolName,
        schoolYear: metadata.schoolYear,
        numPages: pdf.numPages,
        students: allStudents,
        pages
    };
}
