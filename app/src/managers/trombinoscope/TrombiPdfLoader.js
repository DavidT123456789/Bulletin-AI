/**
 * @fileoverview TrombiPdfLoader — Chargement de fichiers Images/PDF, conversion canvas/Blob URL et navigation multi-pages
 * Extrait de TrombinoscopeManager.js (Lot 12 — Découpage God Object #2)
 * @module managers/trombinoscope/TrombiPdfLoader
 */

import { UI } from '../UIManager.js';
import { ClassManager } from '../ClassManager.js';
import { Utils } from '../../utils/Utils.js';
import { parsePronoteTrombiPdf } from '../../utils/PronoteTrombiParser.js';

export const TrombiPdfLoader = {
    async loadFile(manager, file) {
        const fileName = (file.name || '').toLowerCase();
        if (file.type === 'application/pdf' || fileName.endsWith('.pdf')) {
            manager._loadPdf(file);
            return;
        }

        const isTextOrTable = file.type === 'text/csv' ||
            file.type === 'text/plain' ||
            file.type === 'text/tab-separated-values' ||
            /\.(csv|txt|tsv)$/i.test(fileName);

        if (isTextOrTable) {
            manager._removeImage();
            const shouldSwitch = await UI.showCustomConfirm(
                'Ce fichier contient des données texte ou tabulaires sans photos. Souhaitez-vous l\'ouvrir dans l\'assistant Liste & Notes ?',
                null,
                null,
                {
                    title: 'Fichier liste détecté',
                    confirmText: 'Ouvrir dans Liste & Notes',
                    cancelText: 'Annuler',
                    isDanger: false
                }
            );
            if (shouldSwitch) {
                manager.close();
                const { ImportWizardManager } = await import('../ImportWizardManager.js');
                ImportWizardManager.open();
                ImportWizardManager._handleFile(file);
            }
            return;
        }

        const isImage = (file.type && file.type.startsWith('image/')) ||
            /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(fileName);

        if (!isImage) {
            manager._removeImage();
            UI.showNotification('Format de fichier non supporté (attendu : PDF ou image)', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = e => {
            manager._loadImageFromUrl(e.target.result);
        };
        reader.onerror = () => {
            manager._removeImage();
            UI.showNotification('Erreur lors de la lecture du fichier', 'error');
        };
        reader.readAsDataURL(file);
    },

    async canvasToImageUrl(manager, canvas, quality = 0.9) {
        if (!canvas) return '';
        const isJsdom = typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '');
        const hasNativeOrMockToBlob = typeof canvas.toBlob === 'function' &&
            (!isJsdom || Object.prototype.hasOwnProperty.call(canvas, 'toBlob'));

        if (hasNativeOrMockToBlob && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
            const blob = await new Promise(resolve => {
                try {
                    canvas.toBlob(resolve, 'image/jpeg', quality);
                } catch (_) {
                    resolve(null);
                }
            });
            if (blob) {
                const objectUrl = URL.createObjectURL(blob);
                if (!manager._objectUrls) manager._objectUrls = new Set();
                manager._objectUrls.add(objectUrl);
                return objectUrl;
            }
        }
        return typeof canvas.toDataURL === 'function' ? canvas.toDataURL('image/jpeg', quality) : '';
    },

    async canvasToDataUrlAsync(_manager, canvas, quality = 0.85) {
        if (!canvas) return '';
        const isJsdom = typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '');
        const hasNativeOrMockToBlob = typeof canvas.toBlob === 'function' &&
            (!isJsdom || Object.prototype.hasOwnProperty.call(canvas, 'toBlob'));

        if (hasNativeOrMockToBlob && typeof FileReader !== 'undefined') {
            const blob = await new Promise(resolve => {
                try {
                    canvas.toBlob(resolve, 'image/jpeg', quality);
                } catch (_) {
                    resolve(null);
                }
            });
            if (blob) {
                const dataUrl = await new Promise(resolve => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : '');
                    reader.onerror = () => resolve('');
                    reader.readAsDataURL(blob);
                });
                if (dataUrl) return dataUrl;
            }
        }
        return typeof canvas.toDataURL === 'function' ? canvas.toDataURL('image/jpeg', quality) : '';
    },

    async loadPdf(manager, file) {
        const footerInfo = document.getElementById('trombiImageInfo');
        if (footerInfo) {
            footerInfo.innerHTML = '<span style="display:inline-flex;align-items:center;gap:6px;"><iconify-icon icon="line-md:loading-loop"></iconify-icon> Analyse du trombinoscope PDF...</span>';
        }

        try {
            const parsed = await parsePronoteTrombiPdf(file);
            parsed.pages.forEach(page => {
                page.originalZones = page.zones.map(z => ({ ...z }));
            });
            const firstPage = parsed.pages[0];
            if (!firstPage) {
                throw new Error('Aucune page lisible dans le PDF');
            }

            if (parsed.students.length === 0) {
                manager._removeImage();
                const shouldSwitch = await UI.showCustomConfirm(
                    'Aucun élève ni photo n\'a été détecté dans ce document PDF. S\'il s\'agit d\'un relevé de notes ou d\'un bilan de classe, souhaitez-vous l\'ouvrir dans l\'assistant Liste & Notes ?',
                    null,
                    null,
                    {
                        title: 'Aucune photo détectée',
                        confirmText: 'Ouvrir dans Liste & Notes',
                        cancelText: 'Annuler',
                        isDanger: false
                    }
                );
                if (shouldSwitch) {
                    manager.close();
                    const { ImportWizardManager } = await import('../ImportWizardManager.js');
                    ImportWizardManager.open();
                    ImportWizardManager._handleFile(file);
                }
                return;
            }

            manager._parsedPdfData = parsed;
            manager._updateExistingPhotos = null;
            firstPage.imageUrl = firstPage.imageUrl || await manager._canvasToImageUrl(firstPage.canvas, 0.9);
            manager._imageSrc = firstPage.imageUrl;
            manager._imageNaturalWidth = firstPage.width;
            manager._imageNaturalHeight = firstPage.height;
            manager._isNewUpload = true;
            manager._currentPageIndex = 0;

            manager._displayImagePreview();

            if (parsed.className) {
                const classBadge = document.getElementById('trombiClassBadge');
                if (classBadge) {
                    const displayClassName = Utils.formatClassDisplayName ? Utils.formatClassDisplayName(parsed.className) : parsed.className;
                    classBadge.textContent = `${parsed.isGroup ? 'Groupe' : 'Classe'} ${displayClassName}`;
                    classBadge.animate?.([
                        { opacity: 0, transform: 'translateY(6px)', filter: 'blur(3px)' },
                        { opacity: 1, transform: 'translateY(0)', filter: 'blur(0)' }
                    ], { duration: 380, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
                }
            }

            if (footerInfo) {
                const displayClassName = parsed.className ? (Utils.formatClassDisplayName ? Utils.formatClassDisplayName(parsed.className) : parsed.className) : 'Auto';
                const targetInfo = manager._getTargetClassInfo();

                if (targetInfo.isUpdate) {
                    if (targetInfo.newStudents.length > 0) {
                        footerInfo.innerHTML = `${parsed.students.length} élèves détectés • <span class="trombi-stat-badge is-new">+${targetInfo.newStudents.length} nouveau${targetInfo.newStudents.length > 1 ? 'x' : ''}</span>, ${targetInfo.existingStudents.length} déjà inscrit${targetInfo.existingStudents.length > 1 ? 's' : ''}`;
                    } else {
                        footerInfo.innerHTML = `${parsed.students.length} élèves détectés • Tous déjà inscrits <span class="footer-info-dimmed">(mise à jour photos)</span>`;
                    }
                } else {
                    footerInfo.innerHTML = `${parsed.students.length} élèves détectés • ${parsed.isGroup ? 'Groupe' : 'Classe'} ${displayClassName}`;
                }
            }

            const step1PageBar = document.getElementById('trombiStep1PageSelectorBar');
            if (step1PageBar) {
                if (parsed.numPages > 1) {
                    step1PageBar.style.display = 'flex';
                    step1PageBar.innerHTML = parsed.pages.map((p, idx) => {
                        const pageLabel = `Page ${idx + 1} (${p.studentsCount} élève${p.studentsCount > 1 ? 's' : ''})`;
                        return `
                        <button type="button" class="page-tab-btn ${idx === 0 ? 'active' : ''}" data-step1-page="${idx}" aria-label="${pageLabel}" data-tooltip="${pageLabel}">
                            <span>Page ${idx + 1}</span>
                            <span class="page-tab-sep" aria-hidden="true">·</span>
                            <span class="page-tab-count">${p.studentsCount} élève${p.studentsCount > 1 ? 's' : ''}</span>
                        </button>
                    `;
                    }).join('');
                    UI.initTooltips?.(step1PageBar);

                    step1PageBar.querySelectorAll('.page-tab-btn').forEach(btn => {
                        btn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            const targetIdx = parseInt(btn.dataset.step1Page, 10);
                            if (targetIdx !== manager._currentPageIndex) {
                                manager._previewPdfPageInStep1(targetIdx);
                            }
                        });
                    });
                } else {
                    step1PageBar.style.display = 'none';
                    step1PageBar.innerHTML = '';
                }
            }

            const nextBtn = document.getElementById('trombiStep1NextBtn');
            if (nextBtn) {
                nextBtn.disabled = false;
                nextBtn.innerHTML = 'Suivant <iconify-icon class="iconify-inline" icon="ph:arrow-right-bold"></iconify-icon>';
            }
            manager._updateStepperUI();
        } catch (err) {
            console.error('[TrombinoscopeManager] Échec parsing PDF:', err);
            manager._removeImage();
            const shouldSwitch = await UI.showCustomConfirm(
                'Ce document PDF ne correspond pas à un format de trombinoscope avec photos. S\'il s\'agit d\'un relevé de notes ou d\'un bilan de classe, souhaitez-vous l\'ouvrir dans l\'assistant Liste & Notes ?',
                null,
                null,
                {
                    title: 'Format trombinoscope non reconnu',
                    confirmText: 'Ouvrir dans Liste & Notes',
                    cancelText: 'Annuler',
                    isDanger: false
                }
            );
            if (shouldSwitch) {
                manager.close();
                const { ImportWizardManager } = await import('../ImportWizardManager.js');
                ImportWizardManager.open();
                ImportWizardManager._handleFile(file);
            }
        }
    },

    previewPdfPageInStep1(manager, pageIndex) {
        if (!manager._parsedPdfData || !manager._parsedPdfData.pages[pageIndex]) return;
        const isNext = pageIndex > manager._currentPageIndex;
        manager._currentPageIndex = pageIndex;
        const page = manager._parsedPdfData.pages[pageIndex];
        if (!page.imageUrl && page.canvas) {
            page.imageUrl = typeof page.canvas.toDataURL === 'function' ? page.canvas.toDataURL('image/jpeg', 0.9) : '';
        }
        manager._imageSrc = page.imageUrl || '';
        manager._imageNaturalWidth = page.width;
        manager._imageNaturalHeight = page.height;

        const previewImg = document.getElementById('trombiPreviewImg');
        if (previewImg) {
            const animClass = isNext ? 'trombi-page-slide-next' : 'trombi-page-slide-prev';
            previewImg.classList.remove('trombi-page-slide-next', 'trombi-page-slide-prev');
            void previewImg.offsetWidth;
            previewImg.classList.add(animClass);
            previewImg.addEventListener('animationend', () => {
                previewImg.classList.remove(animClass);
            }, { once: true });
            previewImg.src = manager._imageSrc;
        }

        document.querySelectorAll('#trombiStep1PageSelectorBar .page-tab-btn').forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.dataset.step1Page, 10) === pageIndex);
        });
    },

    switchPdfPage(manager, pageIndex) {
        if (!manager._parsedPdfData || !manager._parsedPdfData.pages[pageIndex]) return;
        manager._closeStudentPopover();

        // Sauvegarder les zones de la page actuelle avant de changer
        if (manager._parsedPdfData.pages[manager._currentPageIndex]) {
            manager._parsedPdfData.pages[manager._currentPageIndex].zones = manager._zones.map(z => ({ ...z }));
        }

        const isNext = pageIndex > manager._currentPageIndex;
        manager._currentPageIndex = pageIndex;
        const page = manager._parsedPdfData.pages[pageIndex];

        manager._cachedImage = null; // Invalidate cached preview image for new page
        if (!page.imageUrl && page.canvas) {
            page.imageUrl = typeof page.canvas.toDataURL === 'function' ? page.canvas.toDataURL('image/jpeg', 0.9) : '';
        }
        manager._imageSrc = page.imageUrl || '';
        manager._imageNaturalWidth = page.width;
        manager._imageNaturalHeight = page.height;

        const img = document.getElementById('trombiStep2Image');
        if (img) {
            img.src = manager._imageSrc;
        }

        const contentWrapper = document.querySelector('.trombi-content-wrapper');
        if (contentWrapper) {
            const animClass = isNext ? 'trombi-page-slide-next' : 'trombi-page-slide-prev';
            contentWrapper.classList.remove('trombi-page-slide-next', 'trombi-page-slide-prev');
            void contentWrapper.offsetWidth;
            contentWrapper.classList.add(animClass);
            contentWrapper.addEventListener('animationend', () => {
                contentWrapper.classList.remove(animClass);
            }, { once: true });
        }

        document.querySelectorAll('#trombiPageSelectorBar .page-tab-btn').forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.dataset.pageIndex, 10) === pageIndex);
        });

        manager._zones = page.zones.map(z => ({ ...z }));
        if (manager._zones.length > 0 && manager._zones[0].r) {
            manager._globalRadius = manager._zones[0].r;
        }

        manager._gridCols = 4;
        manager._gridRows = Math.ceil((page.studentsCount || manager._zones.length || 8) / 4);
        manager._syncSlidersToState();

        manager._applyZoom();
        manager._renderAssignmentGrid();
    },

    loadImageFromUrl(manager, url) {
        manager._cachedImage = null; // Clear cache
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            manager._imageSrc = url;
            manager._imageNaturalWidth = img.naturalWidth;
            manager._imageNaturalHeight = img.naturalHeight;
            manager._isNewUpload = true; // Mark as new upload
            manager._displayImagePreview();
            const nextBtn = document.getElementById('trombiStep1NextBtn');
            if (nextBtn) nextBtn.disabled = false;
            manager._updateStepperUI();
        };
        img.onerror = () => {
            manager._removeImage();
            UI.showNotification('Erreur de chargement de l\'image', 'error');
        };
        img.src = url;
    },

    displayImagePreview(manager) {
        const placeholder = document.getElementById('trombiDropPlaceholder');
        const preview = document.getElementById('trombiDropPreview');
        const previewImg = document.getElementById('trombiPreviewImg');
        const dropZone = document.getElementById('trombiDropZone');

        if (!placeholder || !preview || !previewImg) return;

        // Show preview, hide placeholder
        placeholder.style.display = 'none';
        preview.style.display = 'flex';
        previewImg.src = manager._imageSrc;

        // Add loaded state to dropzone for styling
        dropZone?.classList.add('has-image');

        // Display info message in footer
        const footerInfo = document.getElementById('trombiImageInfo');
        if (footerInfo) {
            footerInfo.textContent = `Image chargée (${manager._imageNaturalWidth} × ${manager._imageNaturalHeight} px)`;
        }
    },

    removeImage(manager) {
        manager._imageSrc = null;
        manager._parsedPdfData = null;
        manager._updateExistingPhotos = null;
        manager._currentPageIndex = 0;
        manager._imageNaturalWidth = 0;
        manager._imageNaturalHeight = 0;
        manager._cachedImage = null;

        const placeholder = document.getElementById('trombiDropPlaceholder');
        const preview = document.getElementById('trombiDropPreview');
        const previewImg = document.getElementById('trombiPreviewImg');
        const dropZone = document.getElementById('trombiDropZone');
        const fileInput = document.getElementById('trombiFileInput');
        const footerInfo = document.getElementById('trombiImageInfo');
        const quickBtn = document.getElementById('trombiQuickImportBtn');
        const nextBtn = document.getElementById('trombiStep1NextBtn');

        if (placeholder) placeholder.style.display = '';
        if (preview) preview.style.display = 'none';
        if (previewImg) previewImg.src = '';
        dropZone?.classList.remove('has-image');
        if (fileInput) fileInput.value = '';
        if (footerInfo) footerInfo.textContent = '';
        if (quickBtn) quickBtn.style.display = 'none';
        const step1PageBar = document.getElementById('trombiStep1PageSelectorBar');
        if (step1PageBar) {
            step1PageBar.style.display = 'none';
            step1PageBar.innerHTML = '';
        }
        if (nextBtn) {
            nextBtn.disabled = true;
            nextBtn.innerHTML = 'Suivant <iconify-icon class="iconify-inline" icon="ph:arrow-right-bold"></iconify-icon>';
        }

        const currentClass = ClassManager.getCurrentClass?.();
        const classBadge = document.getElementById('trombiClassBadge');
        if (classBadge) {
            classBadge.textContent = currentClass?.name || 'Nouvelle classe';
        }

        manager._updateStepperUI();
    },

    loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = src;
        });
    }
};
