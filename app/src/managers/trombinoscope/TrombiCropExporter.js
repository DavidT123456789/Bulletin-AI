/**
 * @fileoverview TrombiCropExporter — Aperçus live/Étape 3, découpe finale JPEG asynchrone et persistance de l'import
 * Extrait de TrombinoscopeManager.js (Lot 12 — Découpage God Object #2)
 * @module managers/trombinoscope/TrombiCropExporter
 */

import { appState } from '../../state/State.js';
import { StudentPhotoManager } from '../StudentPhotoManager.js';
import { UI } from '../UIManager.js';
import { ClassManager } from '../ClassManager.js';
import { Utils } from '../../utils/Utils.js';
import { StudentDataManager } from '../StudentDataManager.js';
import { StorageManager } from '../StorageManager.js';
import { ClassUIManager } from '../ClassUIManager.js';
import { AppreciationsManager } from '../AppreciationsManager.js';
import { ListViewManager } from '../ListViewManager.js';
import { FocusPanelManager } from '../FocusPanelManager.js';

export const TrombiCropExporter = {
    async updateLivePreviews(manager) {
        const canvases = document.querySelectorAll('.live-preview-canvas');
        if (canvases.length === 0) return;

        // Use in-memory PDF canvas if available, or cached image
        let img = manager._parsedPdfData?.pages[manager._currentPageIndex]?.canvas;
        if (!img) {
            if (!manager._cachedImage) {
                try {
                    manager._cachedImage = await manager._loadImage(manager._imageSrc);
                } catch {
                    return;
                }
            }
            img = manager._cachedImage;
        }

        canvases.forEach(canvas => {
            const zoneId = parseInt(canvas.dataset.zoneId);
            const zone = manager._zones.find(z => z.id === zoneId);
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            // Canvas buffer is 80x80, displayed at 40x40 CSS for HiDPI sharpness
            const size = 80;

            ctx.clearRect(0, 0, size, size);

            if (!zone) return;

            // Draw cropped zone using zone radius or global radius
            const { cx, cy } = zone;
            const r = zone.r || manager._globalRadius;
            const diameter = r * 2;
            const sx = Math.max(0, cx - r);
            const sy = Math.max(0, cy - r);
            const sw = Math.min(diameter, manager._imageNaturalWidth - sx);
            const sh = Math.min(diameter, manager._imageNaturalHeight - sy);

            // Draw full image - CSS handles circular shape and border
            ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size);
        });
    },

    initStep3(manager) {
        const container = document.getElementById('trombiPreviewGrid');
        if (!container) return;

        if (manager._parsedPdfData?.pages?.[manager._currentPageIndex]) {
            manager._parsedPdfData.pages[manager._currentPageIndex].zones = manager._zones.map(z => ({ ...z }));
        }

        const targetInfo = manager._getTargetClassInfo();

        let students = [...(targetInfo.existingClassStudents || appState.filteredResults || [])];
        if (manager._parsedPdfData && manager._parsedPdfData.students) {
            for (const pdfStudent of manager._parsedPdfData.students) {
                if (!students.some(s => s.id === pdfStudent.id || Utils.normalizeName(s.nom, s.prenom) === Utils.normalizeName(pdfStudent.nom, pdfStudent.prenom))) {
                    students.push({
                        id: pdfStudent.id,
                        nom: pdfStudent.nom,
                        prenom: pdfStudent.prenom,
                        classe: pdfStudent.classe || pdfStudent.originClass || ''
                    });
                }
            }
        }

        let assignedItems;
        if (manager._parsedPdfData && manager._parsedPdfData.numPages > 1) {
            assignedItems = manager._parsedPdfData.pages.flatMap((p, idx) =>
                (p.zones || []).filter(z => z.studentId).map(z => ({ zone: z, pageIndex: idx }))
            );
        } else {
            assignedItems = manager._zones.filter(z => z.studentId).map(z => ({ zone: z, pageIndex: 0 }));
        }

        const confirmInfo = document.getElementById('trombiConfirmInfo');
        const confirmBtn = document.getElementById('trombiConfirmBtn');
        const reassuranceBanner = document.getElementById('trombiReassuranceBanner');

        if (assignedItems.length === 0) {
            confirmInfo?.replaceChildren();
            if (confirmBtn) {
                confirmBtn.disabled = true;
                confirmBtn.innerHTML = '<iconify-icon icon="ph:check-bold"></iconify-icon> Importer les photos';
            }
            if (reassuranceBanner) {
                reassuranceBanner.style.display = 'none';
                reassuranceBanner.replaceChildren();
            }
            container.innerHTML = `
                <div class="empty-state">
                    <iconify-icon icon="solar:danger-circle-linear"></iconify-icon>
                    <p>Aucune photo assignée. Retournez à l'étape précédente.</p>
                </div>
            `;
            return;
        }

        const assignedCount = assignedItems.length;
        const totalStudents = students.length;

        let newAssignedCount = 0;
        let existingAssignedCount = 0;
        if (targetInfo.isUpdate) {
            for (const item of assignedItems) {
                const isNew = targetInfo.newStudents.some(ns =>
                    ns.id === item.zone.studentId ||
                    (item.zone.studentId && manager._parsedPdfData?.students?.find(ps => ps.id === item.zone.studentId && Utils.normalizeName(ps.nom, ps.prenom) === Utils.normalizeName(ns.nom, ns.prenom)))
                );
                if (isNew) newAssignedCount++;
                else existingAssignedCount++;
            }
        }

        if (!targetInfo.isUpdate || newAssignedCount === 0) {
            manager._updateExistingPhotos = true;
        } else if (typeof manager._updateExistingPhotos !== 'boolean') {
            manager._updateExistingPhotos = false;
        }

        if (reassuranceBanner) {
            if (targetInfo.isUpdate) {
                reassuranceBanner.style.display = 'block';
                if (newAssignedCount > 0) {
                    reassuranceBanner.innerHTML = `
                        <div class="trombi-reassurance-banner">
                            <div class="trombi-reassurance-left">
                                <div class="trombi-reassurance-icon">
                                    <iconify-icon icon="solar:shield-check-bold"></iconify-icon>
                                </div>
                                <div class="trombi-reassurance-text">
                                    <strong>Données pédagogiques protégées</strong> • Notes, appréciations et journaux sont strictement conservés (${existingAssignedCount} élève${existingAssignedCount > 1 ? 's' : ''}).
                                </div>
                            </div>
                            <div class="trombi-reassurance-toggle-group">
                                <label class="trombi-reassurance-toggle-label" for="trombiUpdateExistingToggle">
                                    Actualiser aussi les photos existantes (${existingAssignedCount})
                                </label>
                                <label class="toggle-switch small">
                                    <input type="checkbox" id="trombiUpdateExistingToggle" ${manager._updateExistingPhotos ? 'checked' : ''}>
                                    <span class="slider"></span>
                                </label>
                            </div>
                        </div>
                    `;
                } else {
                    reassuranceBanner.innerHTML = `
                        <div class="trombi-reassurance-banner">
                            <div class="trombi-reassurance-left">
                                <div class="trombi-reassurance-icon">
                                    <iconify-icon icon="solar:shield-check-bold"></iconify-icon>
                                </div>
                                <div class="trombi-reassurance-text">
                                    <strong>Données pédagogiques protégées</strong> • Seules les photos seront actualisées. Notes et appréciations conservées.
                                </div>
                            </div>
                        </div>
                    `;
                }
            } else {
                reassuranceBanner.style.display = 'none';
                reassuranceBanner.replaceChildren();
            }
        }

        const updateFooterAndDimming = () => {
            const updateExisting = manager._updateExistingPhotos;
            const realPhotoCount = assignedItems.filter(item => !item.zone.isPlaceholder).length;

            const existingCards = container.querySelectorAll('.preview-item.is-existing-student');
            existingCards.forEach(card => {
                card.classList.toggle('is-dimmed', !updateExisting && newAssignedCount > 0);
            });

            if (confirmInfo) {
                if (targetInfo.isUpdate && newAssignedCount > 0) {
                    if (!updateExisting) {
                        const newLabel = newAssignedCount > 1 ? 'nouveaux élèves à ajouter' : 'nouvel élève à ajouter';
                        confirmInfo.innerHTML = `<strong>${newAssignedCount}</strong> ${newLabel} • ${existingAssignedCount} élève${existingAssignedCount > 1 ? 's' : ''} existant${existingAssignedCount > 1 ? 's' : ''} inchangé${existingAssignedCount > 1 ? 's' : ''}`;
                    } else {
                        confirmInfo.innerHTML = `<strong>${assignedCount}</strong> élèves prêts • <span class="trombi-stat-badge is-new">+${newAssignedCount} nouveau${newAssignedCount > 1 ? 'x' : ''}</span> • ${existingAssignedCount} déjà inscrit${existingAssignedCount > 1 ? 's' : ''}`;
                    }
                } else if (totalStudents > assignedCount) {
                    confirmInfo.innerHTML = `<strong>${assignedCount}</strong> / ${totalStudents} élèves prêts pour l'import`;
                } else {
                    confirmInfo.innerHTML = `<strong>${assignedCount}</strong> élève${assignedCount > 1 ? 's' : ''} prêt${assignedCount > 1 ? 's' : ''} pour l'import`;
                }
            }

            if (confirmBtn) {
                confirmBtn.disabled = false;
                if (targetInfo.isUpdate) {
                    if (newAssignedCount > 0) {
                        if (!updateExisting) {
                            const newStudentObj = targetInfo.newStudents[0];
                            const studentLabel = (newAssignedCount === 1 && newStudentObj)
                                ? `Ajouter ${Utils.formatStudentName(newStudentObj.nom, newStudentObj.prenom)}`
                                : `Ajouter ${newAssignedCount > 1 ? `les ${newAssignedCount} nouveaux élèves` : `le nouvel élève`}`;
                            confirmBtn.innerHTML = `<iconify-icon icon="ph:user-plus-bold"></iconify-icon> ${studentLabel}`;
                        } else {
                            confirmBtn.innerHTML = `<iconify-icon icon="ph:check-bold"></iconify-icon> Importer (${newAssignedCount} nouveau${newAssignedCount > 1 ? 'x' : ''}${realPhotoCount > 0 ? `, ${realPhotoCount} photo${realPhotoCount > 1 ? 's' : ''}` : ''})`;
                        }
                    } else {
                        confirmBtn.innerHTML = `<iconify-icon icon="ph:check-bold"></iconify-icon> Mettre à jour ${realPhotoCount > 1 ? `les ${realPhotoCount} photos` : 'la photo'}`;
                    }
                } else {
                    const photoLabel = realPhotoCount > 1 ? `${realPhotoCount} photos` : (realPhotoCount === 1 ? 'la photo' : `${assignedCount} élève${assignedCount > 1 ? 's' : ''}`);
                    confirmBtn.innerHTML = `<iconify-icon icon="ph:check-bold"></iconify-icon> Importer ${photoLabel}`;
                }
            }
        };

        const toggleInput = reassuranceBanner?.querySelector('#trombiUpdateExistingToggle');
        toggleInput?.addEventListener('change', (e) => {
            manager._updateExistingPhotos = e.target.checked;
            updateFooterAndDimming();
        });

        container.innerHTML = '<div class="preview-list"></div>';
        const list = container.querySelector('.preview-list');

        for (const item of assignedItems) {
            const student = students.find(s => s.id === item.zone.studentId) || (manager._parsedPdfData?.students?.find(s => s.id === item.zone.studentId));
            if (!student) continue;

            const isNew = targetInfo.isUpdate && targetInfo.newStudents.some(ns =>
                ns.id === student.id || Utils.normalizeName(ns.nom, ns.prenom) === Utils.normalizeName(student.nom, student.prenom)
            );

            const isDimmed = targetInfo.isUpdate && !isNew && !manager._updateExistingPhotos && newAssignedCount > 0;
            const previewItem = document.createElement('div');
            previewItem.className = `preview-item ${isNew ? 'is-new-student' : 'is-existing-student'} ${isDimmed ? 'is-dimmed' : ''}`;

            const badgeHtml = isNew
                ? `<span class="trombi-preview-badge is-new"><iconify-icon icon="solar:user-plus-rounded-bold"></iconify-icon> Nouveau</span>`
                : '';

            previewItem.innerHTML = `
                <div class="preview-canvas-wrapper">
                    ${item.zone.isPlaceholder ? `<div class="student-avatar preview-canvas">${StudentPhotoManager.getInitialsFromName(student.nom, student.prenom)}</div>` : '<canvas class="preview-canvas" width="160" height="160"></canvas>'}
                    ${badgeHtml}
                </div>
                <span class="preview-student-name">${Utils.formatStudentName(student.nom, student.prenom, true)}</span>
            `;
            list.appendChild(previewItem);

            if (!item.zone.isPlaceholder) {
                manager._drawPreview(previewItem.querySelector('canvas'), item.zone, item.pageIndex);
            }
        }

        FocusPanelManager.bindScrollAffordances(list);
        updateFooterAndDimming();
    },

    async drawPreview(manager, canvas, zone, pageIndex = 0) {
        if (!canvas) return;
        const ctx = canvas.getContext?.('2d');
        if (!ctx) return;
        const targetSize = canvas.width;
        const r = zone.r || manager._globalRadius;
        const diameter = r * 2;
        const { cx, cy } = zone;

        if (manager._parsedPdfData && manager._parsedPdfData.pages[pageIndex]?.canvas) {
            const page = manager._parsedPdfData.pages[pageIndex];
            const sx = Math.max(0, cx - r);
            const sy = Math.max(0, cy - r);
            const sw = Math.min(diameter, page.width - sx);
            const sh = Math.min(diameter, page.height - sy);

            ctx.clearRect(0, 0, targetSize, targetSize);
            ctx.drawImage(page.canvas, sx, sy, sw, sh, 0, 0, targetSize, targetSize);
            return;
        }

        try {
            const img = await manager._loadImage(manager._imageSrc);
            const sx = Math.max(0, cx - r);
            const sy = Math.max(0, cy - r);
            const sw = Math.min(diameter, manager._imageNaturalWidth - sx);
            const sh = Math.min(diameter, manager._imageNaturalHeight - sy);

            ctx.clearRect(0, 0, targetSize, targetSize);
            ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetSize, targetSize);
        } catch {
            // Silently fail preview
        }
    },

    async confirmImport(manager) {
        return manager._handleImport();
    },

    async handleImport(manager) {
        if (manager._zones.length === 0 && (!manager._parsedPdfData || manager._parsedPdfData.pages.every(p => !p.zones || p.zones.length === 0))) {
            UI.showNotification('Aucune zone définie', 'warning');
            return;
        }

        if (manager._parsedPdfData && manager._parsedPdfData.pages[manager._currentPageIndex]) {
            manager._parsedPdfData.pages[manager._currentPageIndex].zones = manager._zones.map(z => ({ ...z }));
        }

        let assignedItems;
        if (manager._parsedPdfData && manager._parsedPdfData.numPages > 1) {
            assignedItems = manager._parsedPdfData.pages.flatMap((p, idx) =>
                (p.zones || []).filter(z => z.studentId).map(z => ({ zone: z, pageIndex: idx }))
            );
        } else {
            assignedItems = manager._zones.filter(z => z.studentId).map(z => ({ zone: z, pageIndex: 0 }));
        }

        if (assignedItems.length === 0) {
            UI.showNotification('Aucune photo à importer', 'warning');
            return;
        }

        const confirmBtn = typeof document !== 'undefined' ? document.getElementById('trombiConfirmBtn') : null;
        UI?.showInlineSpinner?.(confirmBtn, 'Importation...');

        try {
            let targetClass = null;
            let newStudentsAddedCount = 0;
            let initialTargetInfo = null;
            const newlyAddedStudentIds = new Set();

            if (manager._parsedPdfData) {
                initialTargetInfo = manager._getTargetClassInfo();
                targetClass = initialTargetInfo.targetClass;

                if (!targetClass) {
                    targetClass = ClassManager.createClass(initialTargetInfo.targetName, manager._parsedPdfData.schoolYear);
                } else if (initialTargetInfo.shouldRename) {
                    ClassManager.updateClass?.(targetClass.id, {
                        name: initialTargetInfo.targetName,
                        year: manager._parsedPdfData.schoolYear || targetClass.year
                    });
                }
                await ClassManager.switchClass(targetClass.id);

                for (const item of assignedItems) {
                    item.originalStudentId = item.zone.studentId;
                    let existing = appState.generatedResults.find(r => r.id === item.zone.studentId);
                    if (!existing && manager._parsedPdfData.students) {
                        const pdfStudent = manager._parsedPdfData.students.find(s => s.id === item.zone.studentId);
                        if (pdfStudent) {
                            existing = appState.generatedResults.find(r =>
                                r.classId === targetClass.id &&
                                Utils.normalizeName(r.nom, r.prenom) === Utils.normalizeName(pdfStudent.nom, pdfStudent.prenom)
                            );
                            if (existing) {
                                item.zone.studentId = existing.id;
                            } else {
                                const periods = Utils.getPeriods();
                                const currentPeriod = appState.currentPeriod || periods[0];
                                const isLaterPeriodUpdate = Boolean(initialTargetInfo?.isUpdate) && periods.indexOf(currentPeriod) > 0;
                                const newStudentResult = StudentDataManager.createPendingResult({
                                    nom: pdfStudent.nom,
                                    prenom: pdfStudent.prenom,
                                    classe: pdfStudent.classe || pdfStudent.originClass || '',
                                    statuses: isLaterPeriodUpdate ? [`Nouveau ${currentPeriod}`] : [],
                                    periods: {}
                                });
                                newStudentResult.classId = targetClass.id;
                                appState.generatedResults.push(newStudentResult);
                                item.zone.studentId = newStudentResult.id;
                                newlyAddedStudentIds.add(newStudentResult.id);
                                newStudentsAddedCount++;
                            }
                        }
                    }
                }
            }

            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext ? canvas.getContext('2d') : null;
            const targetSize = StudentPhotoManager.TARGET_SIZE;
            const jpegQuality = StudentPhotoManager.JPEG_QUALITY;
            canvas.width = targetSize;
            canvas.height = targetSize;
            if (ctx) {
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
            }

            const assignments = [];

            if (manager._parsedPdfData) {
                const shouldUpdateExisting = !initialTargetInfo.isUpdate
                    || (manager._updateExistingPhotos ?? initialTargetInfo.newStudents.length === 0);

                for (const item of assignedItems) {
                    const { studentId, cx, cy } = item.zone;

                    if (!newlyAddedStudentIds.has(studentId) && !shouldUpdateExisting) continue;

                    const page = manager._parsedPdfData.pages[item.pageIndex];
                    if (!page || !page.canvas) continue;
                    if (item.zone.isPlaceholder) {
                        const existingStudent = appState.generatedResults.find(r => r.id === studentId);
                        if (existingStudent?.studentPhoto) {
                            existingStudent.studentPhoto = null;
                            existingStudent._lastModified = Date.now();
                            StudentDataManager.syncFilteredStudent(studentId, existingStudent);
                        }
                        continue;
                    }
                    const r = item.zone.r || manager._globalRadius;
                    const diameter = r * 2;
                    const sx = Math.max(0, cx - r);
                    const sy = Math.max(0, cy - r);
                    const sw = Math.min(diameter, page.width - sx);
                    const sh = Math.min(diameter, page.height - sy);

                    let photoData;
                    if (ctx && (typeof canvas.toDataURL === 'function' || typeof canvas.toBlob === 'function')) {
                        ctx.clearRect(0, 0, targetSize, targetSize);
                        ctx.drawImage(page.canvas, sx, sy, sw, sh, 0, 0, targetSize, targetSize);
                        photoData = await manager._canvasToDataUrlAsync(canvas, jpegQuality);
                    } else {
                        const matchedPdfStudent = manager._parsedPdfData.students?.find(s => s.id === item.originalStudentId);
                        photoData = matchedPdfStudent?.photoData || 'data:image/jpeg;base64,mock';
                    }
                    assignments.push({ studentId, photoData });
                }
            } else {
                const sampleFallbackById = new Map(manager._getSampleFallbackStudents().map(s => [s.id, s]));
                let materializedSampleStudents = false;
                for (const item of assignedItems) {
                    const sampleStudent = sampleFallbackById.get(item.zone.studentId);
                    if (sampleStudent && !appState.generatedResults?.some(r => r.id === item.zone.studentId)) {
                        if (!targetClass) {
                            targetClass = (appState.currentClassId && ClassManager.getClass?.(appState.currentClassId))
                                || ClassManager.createClass?.('Classe Démo');
                            if (targetClass && appState.currentClassId !== targetClass.id) {
                                await ClassManager.switchClass?.(targetClass.id);
                            }
                        }
                        const newStudentResult = StudentDataManager.createPendingResult({
                            nom: sampleStudent.nom,
                            prenom: sampleStudent.prenom,
                            classe: targetClass?.name || '',
                            statuses: [],
                            periods: {}
                        });
                        if (targetClass?.id) newStudentResult.classId = targetClass.id;
                        appState.generatedResults.push(newStudentResult);
                        item.zone.studentId = newStudentResult.id;
                        newlyAddedStudentIds.add(newStudentResult.id);
                        materializedSampleStudents = true;
                    }
                }

                const img = await manager._loadImage(manager._imageSrc);
                for (const item of assignedItems) {
                    const { studentId, cx, cy } = item.zone;
                    const r = item.zone.r || manager._globalRadius;
                    const diameter = r * 2;
                    const sx = Math.max(0, cx - r);
                    const sy = Math.max(0, cy - r);
                    const sw = Math.min(diameter, manager._imageNaturalWidth - sx);
                    const sh = Math.min(diameter, manager._imageNaturalHeight - sy);

                    let photoData;
                    if (ctx && (typeof canvas.toDataURL === 'function' || typeof canvas.toBlob === 'function')) {
                        ctx.clearRect(0, 0, targetSize, targetSize);
                        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetSize, targetSize);
                        photoData = await manager._canvasToDataUrlAsync(canvas, jpegQuality);
                    } else {
                        photoData = 'data:image/jpeg;base64,mock';
                    }
                    assignments.push({ studentId, photoData });
                }

                if (materializedSampleStudents) {
                    await StorageManager.saveAppState?.();
                    if (targetClass) {
                        await ClassManager._filterResultsByClass?.(targetClass.id);
                    }
                }
            }

            const count = await StudentPhotoManager.bulkAssignPhotos(assignments);

            if (manager._parsedPdfData) {
                await StorageManager.saveAppState();
                if (targetClass) {
                    await ClassManager._filterResultsByClass(targetClass.id);
                }
            }

            ListViewManager?.prepareImportReveal?.({
                newIds: newlyAddedStudentIds,
                photoIds: assignments.map(a => a.studentId)
            });

            if (manager._parsedPdfData && targetClass) {
                window.dispatchEvent(new CustomEvent('classChanged', { detail: { classId: targetClass.id } }));
            }

            ClassUIManager?.updateHeaderDisplay?.();
            ClassUIManager?.renderClassList?.();
            ClassUIManager?.pulseHeaderChip?.();
            AppreciationsManager?.renderResults?.();
            UI?.updateStats?.();
            UI?.updateControlButtons?.();
            UI?.updateAIButtonsState?.();

            manager.close();

            const wasUpdate = initialTargetInfo?.isUpdate ?? false;
            if (wasUpdate && newStudentsAddedCount > 0) {
                const shouldUpdateExisting = manager._updateExistingPhotos ?? false;
                const addedLabel = newStudentsAddedCount > 1
                    ? `${newStudentsAddedCount} nouveaux élèves ajoutés`
                    : `${newStudentsAddedCount} nouvel élève ajouté`;
                const notifText = (shouldUpdateExisting && count > newStudentsAddedCount)
                    ? `${addedLabel}, ${count} photos importées • Données conservées`
                    : `${addedLabel} • Photos existantes et données conservées`;
                UI.showNotification(notifText, 'success');
                window.dispatchEvent(new CustomEvent('studentsUpdated'));
            } else if (count > 0) {
                UI.showNotification(`${count} photos importées avec succès`, 'success');
                window.dispatchEvent(new CustomEvent('studentsUpdated'));
            } else if (manager._parsedPdfData) {
                window.dispatchEvent(new CustomEvent('studentsUpdated'));
            }
        } catch (error) {
            console.error('Photo extraction failed:', error);
            UI.showNotification('Erreur lors de l\'extraction', 'error');
        } finally {
            UI?.hideInlineSpinner?.(confirmBtn);
        }
    }
};
