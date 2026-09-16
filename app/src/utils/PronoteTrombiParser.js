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

        // Ignorer les initiales isolées affichées en grand dans les boîtes sans photo (ex: "ET" de taille 42pt)
        if (/^[A-Z]{1,3}$/.test(str) && ((item.height || 10) >= 18 || (item.transform?.[0] || 10) >= 18)) {
            continue;
        }

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

    const colWidth = viewport.width / (columns.length || 4);
    const rawStudents = [];

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

        // Éliminer les initiales orphelines de remplacement (ex: "ET") situées dans la boîte photo au-dessus du nom
        const filteredEntries = groupedEntries.filter((entry, idx, arr) => {
            const text = entry.textParts.join(' ').trim();
            return !(/^[A-Z]{1,3}$/.test(text) && idx < arr.length - 1);
        });

        filteredEntries.forEach((entry, rowIndex) => {
            const rawFullName = entry.textParts.join(' ');
            const { nom, prenom } = splitStudentFullName(rawFullName);
            rawStudents.push({
                pageIndex,
                colIndex,
                rowIndex,
                rawFullName,
                nom,
                prenom,
                colCenterX: col.centerX,
                textY: entry.y
            });
        });
    });

    // Passe 1 : Associer chaque élève ayant une photo réelle à son rectangle dans imageRects
    const usedRects = new Set();
    const studentsWithMatches = rawStudents.map(student => {
        let matchedRect = null;
        if (imageRects && imageRects.length > 0) {
            let bestRect = null;
            let bestDy = Infinity;

            for (const rect of imageRects) {
                if (usedRects.has(rect)) continue;
                const dx = Math.abs(rect.cx - student.colCenterX);
                const dy = student.textY - (rect.y + rect.height);
                const maxDx = colWidth * 0.4;
                const minDy = -20 * (viewport.scale || 1);
                const maxDy = Math.max(60 * (viewport.scale || 1), colWidth * 0.5);

                if (dx < maxDx && dy >= minDy && dy <= maxDy) {
                    if (Math.abs(dy) < Math.abs(bestDy)) {
                        bestRect = rect;
                        bestDy = dy;
                    }
                }
            }

            if (bestRect) {
                usedRects.add(bestRect);
                matchedRect = bestRect;
            }
        }

        return {
            ...student,
            matchedRect
        };
    });

    // Passe 2 : Calibration de la géométrie type à partir des photos réelles détectées sur la page
    const matchedStudents = studentsWithMatches.filter(s => s.matchedRect !== null);
    const median = arr => {
        if (!arr || arr.length === 0) return 0;
        const sorted = [...arr].sort((a, b) => a - b);
        return sorted[Math.floor(sorted.length / 2)];
    };

    let typicalWidth = 0;
    let typicalHeight = 0;
    let typicalRadius = 0;
    let typicalDeltaY = 0;
    let typicalGapY = 0;

    if (matchedStudents.length > 0) {
        typicalWidth = median(matchedStudents.map(s => s.matchedRect.width));
        typicalHeight = median(matchedStudents.map(s => s.matchedRect.height));
        typicalRadius = median(matchedStudents.map(s => s.matchedRect.r));
        typicalDeltaY = median(matchedStudents.map(s => s.textY - s.matchedRect.cy));
        typicalGapY = median(matchedStudents.map(s => s.textY - (s.matchedRect.y + s.matchedRect.height)));
    }

    // Passe 3 : Calcul du cadrage pour chaque élève (nominal ou alignement contextuel précis)
    const students = studentsWithMatches.map(student => {
        let cx, cy, r, photoBounds;

        if (student.matchedRect) {
            // Cadrage extrait du flux PDF : centré sur le visage (rehaussement calibré de 2.5%
            // avec rayon calibré à 94% pour un diamètre élargi de 4px sans déborder en haut)
            cx = student.matchedRect.cx;
            cy = student.matchedRect.cy - Math.round(student.matchedRect.height * 0.025);
            r = Math.round(student.matchedRect.r * 0.94);
            photoBounds = {
                x: student.matchedRect.x,
                y: student.matchedRect.y,
                width: student.matchedRect.width,
                height: student.matchedRect.height
            };
        } else {
            // Élève sans photo (ex: carré gris avec initiales "ET")
            // Priorité 1 : Aligner sur les photos des camarades situés sur la même ligne
            const sameRowMatches = matchedStudents.filter(s =>
                s.rowIndex === student.rowIndex || Math.abs(s.textY - student.textY) < 35 * (viewport.scale || 1)
            );

            if (sameRowMatches.length > 0) {
                const rowCy = median(sameRowMatches.map(s => s.matchedRect.cy));
                const rowY = median(sameRowMatches.map(s => s.matchedRect.y));
                const rowH = median(sameRowMatches.map(s => s.matchedRect.height));
                const rowW = median(sameRowMatches.map(s => s.matchedRect.width));
                const rowR = median(sameRowMatches.map(s => s.matchedRect.r));

                cx = student.colCenterX;
                cy = rowCy - Math.round(rowH * 0.025);
                r = Math.round(rowR * 0.94);
                photoBounds = {
                    x: student.colCenterX - (rowW / 2),
                    y: rowY,
                    width: rowW,
                    height: rowH
                };
            } else if (matchedStudents.length > 0) {
                // Priorité 2 : Utiliser les dimensions calibrées sur l'ensemble de la page
                const photoTop = student.textY - typicalGapY - typicalHeight;
                cx = student.colCenterX;
                cy = student.textY - typicalDeltaY - Math.round(typicalHeight * 0.025);
                r = Math.round(typicalRadius * 0.94);
                photoBounds = {
                    x: student.colCenterX - (typicalWidth / 2),
                    y: photoTop,
                    width: typicalWidth,
                    height: typicalHeight
                };
            } else {
                // Priorité 3 : Fallback sécurisé en cas d'absence totale de photo sur la page
                // On borne la hauteur au pas entre les lignes pour ne jamais déborder sur l'élève du dessus
                const uniqueYs = [...new Set(studentsWithMatches.map(s => s.textY))].sort((a, b) => a - b);
                let rowPitch = 0;
                if (uniqueYs.length > 1) {
                    const pitches = [];
                    for (let i = 1; i < uniqueYs.length; i++) {
                        const diff = uniqueYs[i] - uniqueYs[i - 1];
                        if (diff > 30 * (viewport.scale || 1)) pitches.push(diff);
                    }
                    if (pitches.length > 0) rowPitch = median(pitches);
                }

                const maxH = rowPitch > 0 ? (rowPitch - 20 * (viewport.scale || 1)) : colWidth * 0.66;
                const photoWidth = Math.max(30 * (viewport.scale || 1), Math.min(colWidth * 0.66, maxH));
                const photoHeight = photoWidth;
                const gapY = 8 * (viewport.scale || 1);

                const photoBottom = student.textY - gapY;
                const photoTop = photoBottom - photoHeight;
                const photoLeft = student.colCenterX - (photoWidth / 2);

                cx = student.colCenterX;
                cy = photoTop + (photoHeight / 2) - Math.round(photoHeight * 0.025);
                r = Math.round((photoWidth / 2) * 0.94);
                photoBounds = {
                    x: photoLeft,
                    y: photoTop,
                    width: photoWidth,
                    height: photoHeight
                };
            }
        }

        return {
            pageIndex: student.pageIndex,
            colIndex: student.colIndex,
            rowIndex: student.rowIndex,
            rawFullName: student.rawFullName,
            nom: student.nom,
            prenom: student.prenom,
            colCenterX: student.colCenterX,
            textY: student.textY,
            photoBounds,
            zone: {
                cx,
                cy,
                r
            }
        };
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
        const pdfjs = await loadPdfJs().catch(() => null);
        const transformOp = pdfjs?.OPS?.transform ?? 12;
        const paintImageOp = pdfjs?.OPS?.paintImageXObject ?? 85;
        const paintJpegOp = pdfjs?.OPS?.paintJpegXObject ?? 82;
        const paintMaskOp = pdfjs?.OPS?.paintImageMaskXObject ?? 83;

        const ops = await page.getOperatorList();
        const rects = [];
        for (let i = 0; i < ops.fnArray.length; i++) {
            const fn = ops.fnArray[i];
            // 85 = paintImageXObject, 82 = paintJpegXObject, 83 = paintImageMaskXObject
            if (fn === paintImageOp || fn === paintJpegOp || fn === paintMaskOp || fn === 85 || fn === 82 || fn === 83) {
                for (let j = i - 1; j >= Math.max(0, i - 10); j--) {
                    if (ops.fnArray[j] === transformOp || ops.fnArray[j] === 12 || ops.fnArray[j] === 13) {
                        const matrix = ops.argsArray[j];
                        if (Array.isArray(matrix) && matrix.length === 6) {
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
