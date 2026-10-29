/**
 * @fileoverview Student Photo Manager - Gestion des photos d'élèves
 * @module managers/StudentPhotoManager
 */

import { appState } from '../state/State.js';
import { StorageManager } from './StorageManager.js';
import { StudentDataManager } from './StudentDataManager.js';
import { Utils } from '../utils/Utils.js';

/**
 * Gestion des photos d'élèves
 * @namespace StudentPhotoManager
 */
export const StudentPhotoManager = {
    /** Maximum file size in bytes (500KB) */
    MAX_FILE_SIZE: 500 * 1024,

    /** Target dimensions for compression */
    TARGET_SIZE: 200,

    /** JPEG quality for compression */
    JPEG_QUALITY: 0.85,

    /**
     * Upload and compress a photo for a student
     * @param {string} studentId - Student result ID
     * @param {File} file - Image file to upload
     * @returns {Promise<boolean>} Success status
     */
    async uploadPhoto(studentId, file) {
        if (!file || !studentId) return false;

        // Validate file type
        if (!file.type.startsWith('image/')) {
            console.warn('[StudentPhotoManager] Invalid file type:', file.type);
            return false;
        }

        try {
            // Compress and convert to base64
            const base64 = await this._compressImage(file);

            // Find and update student result
            const result = appState.generatedResults.find(r => r.id === studentId);
            if (!result) {
                console.warn('[StudentPhotoManager] Student not found:', studentId);
                return false;
            }

            // Store photo data
            result.studentPhoto = {
                data: base64,
                source: 'manual',
                uploadedAt: new Date().toISOString()
            };

            // CRITICAL: Update timestamp for sync persistence
            result._lastModified = Date.now();

            // Synchronize filteredResults if present
            StudentDataManager.syncFilteredStudent(studentId, result);

            // Persist to storage
            await StorageManager.saveAppState();

            return true;
        } catch (error) {
            console.error('[StudentPhotoManager] Upload failed:', error);
            return false;
        }
    },

    /**
     * Remove photo from a student
     * @param {string} studentId - Student result ID
     * @returns {Promise<boolean>} Success status
     */
    async removePhoto(studentId) {
        const result = appState.generatedResults.find(r => r.id === studentId);
        if (!result) return false;

        result.studentPhoto = null;
        // CRITICAL: Update timestamp for sync persistence
        result._lastModified = Date.now();

        // Synchronize filteredResults if present
        StudentDataManager.syncFilteredStudent(studentId, result);

        await StorageManager.saveAppState();
        return true;
    },

    /**
     * Generate avatar HTML for a student
     * @param {Object} result - Student result object
     * @param {'sm'|'md'|'lg'} size - Avatar size
     * @param {boolean} isSelected - Whether the student is selected
     * @returns {string} HTML string
     */
    getAvatarHTML(result, size = 'sm', isSelected = false) {
        if (!result) return '';

        const initials = this.getInitialsFromName(result.nom, result.prenom);
        const sizeClass = `student-avatar--${size}`;
        const selectedClass = isSelected ? 'is-selected' : '';

        const checkmarkHTML = `
            <div class="avatar-selection-overlay">
                <iconify-icon icon="ph:check"></iconify-icon>
            </div>
        `;

        // Check if student has a photo
        const photo = result.studentPhoto || result.studentData?.photo;
        if (typeof photo?.data === 'string' && /^data:image\/(?:jpeg|jpg|png|webp|gif);base64,[A-Za-z0-9+/=\s]+$/i.test(photo.data)) {
            return `
                <div class="student-avatar ${sizeClass} ${selectedClass}" data-student-id="${Utils.escapeHtml(String(result.id || ''))}">
                    <img src="${photo.data}" alt="${Utils.escapeHtml(result.prenom || '')} ${Utils.escapeHtml(result.nom || '')}" class="student-avatar__img" loading="lazy">
                    ${checkmarkHTML}
                </div>
            `;
        }

        // Fallback to initials
        return `
            <div class="student-avatar ${sizeClass} ${selectedClass}" data-student-id="${Utils.escapeHtml(String(result.id || ''))}">
                <span class="student-avatar__initials">${Utils.escapeHtml(initials)}</span>
                ${checkmarkHTML}
            </div>
        `;
    },

    /**
     * Extract initials from name
     * @param {string} nom - Last name
     * @param {string} prenom - First name
     * @returns {string} Two-letter initials
     */
    getInitialsFromName(nom, prenom) {
        const first = (prenom && prenom[0]) ? prenom[0].toUpperCase() : '';
        const last = (nom && nom[0]) ? nom[0].toUpperCase() : '';
        return first + last || '??';
    },

    /**
     * Compress an image file
     * @param {File} file - Image file
     * @returns {Promise<string>} Base64 data URL
     * @private
     */
    async _compressImage(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const reader = new FileReader();

            reader.onload = (e) => {
                img.src = e.target.result;
            };

            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                // Calculate new dimensions (square crop from center)
                const size = Math.min(img.width, img.height);
                const sx = (img.width - size) / 2;
                const sy = (img.height - size) / 2;

                canvas.width = this.TARGET_SIZE;
                canvas.height = this.TARGET_SIZE;
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';

                // Draw cropped and resized
                ctx.drawImage(img, sx, sy, size, size, 0, 0, this.TARGET_SIZE, this.TARGET_SIZE);

                // Convert to base64
                const base64 = canvas.toDataURL('image/jpeg', this.JPEG_QUALITY);
                resolve(base64);
            };

            img.onerror = () => reject(new Error('Failed to load image'));
            reader.onerror = () => reject(new Error('Failed to read file'));

            reader.readAsDataURL(file);
        });
    },

    /**
     * Bulk assign photos from a trombinoscope extraction
     * @param {Array<{studentId: string, photoData: string}>} assignments - Photo assignments
     * @returns {Promise<number>} Number of photos assigned
     */
    async bulkAssignPhotos(assignments) {
        if (!Array.isArray(assignments) || assignments.length === 0) return 0;

        let count = 0;
        for (const { studentId, photoData } of assignments) {
            const result = appState.generatedResults.find(r => r.id === studentId);
            if (result && photoData) {
                result.studentPhoto = {
                    data: photoData,
                    source: 'trombinoscope',
                    uploadedAt: new Date().toISOString()
                };
                // CRITICAL: Update timestamp for sync persistence
                result._lastModified = Date.now();

                // Synchronize filteredResults if present
                StudentDataManager.syncFilteredStudent(studentId, result);

                count++;
            }
        }

        if (count > 0) {
            await StorageManager.saveAppState();
        }

        return count;
    }
};
