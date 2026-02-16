/**
 * @fileoverview Student Photo Manager - Gestion des photos d'élèves
 * @module managers/StudentPhotoManager
 */

import { appState } from '../state/State.js';
import { StorageManager } from './StorageManager.js';

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
        const color = this.getColorFromName(result.nom, result.prenom);
        const sizeClass = `student-avatar--${size}`;
        const selectedClass = isSelected ? 'is-selected' : '';

        const checkmarkHTML = `
            <div class="avatar-selection-overlay">
                <iconify-icon icon="solar:check-circle-linear"></iconify-icon>
            </div>
        `;

        // Check if student has a photo
        const photo = result.studentPhoto;
        if (photo?.data) {
            return `
                <div class="student-avatar ${sizeClass} ${selectedClass}" data-student-id="${result.id}">
                    <img src="${photo.data}" alt="${result.prenom} ${result.nom}" class="student-avatar__img" loading="lazy">
                    ${checkmarkHTML}
                </div>
            `;
        }

        // Fallback to initials
        return `
            <div class="student-avatar ${sizeClass} ${selectedClass}" data-student-id="${result.id}" style="background-color: ${color}">
                <span class="student-avatar__initials">${initials}</span>
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
     * Generate a consistent color based on the student's name
     * Uses a simple hash to pick from a curated palette
     * @param {string} nom - Last name
     * @param {string} prenom - First name
     * @returns {string} HSL color string
     */
    getColorFromName(nom, prenom) {
        const palette = [
            'hsl(210, 70%, 55%)',  // Blue
            'hsl(340, 65%, 55%)',  // Pink
            'hsl(160, 60%, 45%)',  // Teal
            'hsl(280, 55%, 55%)',  // Purple
            'hsl(25, 80%, 55%)',   // Orange
            'hsl(45, 85%, 50%)',   // Gold
            'hsl(190, 70%, 45%)',  // Cyan
            'hsl(0, 65%, 55%)',    // Red
            'hsl(130, 50%, 45%)',  // Green
            'hsl(260, 50%, 60%)',  // Lavender
        ];

        // Simple hash from name
        const str = `${prenom || ''}${nom || ''}`.toLowerCase();
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }

        const index = Math.abs(hash) % palette.length;
        return palette[index];
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
                count++;
            }
        }

        if (count > 0) {
            await StorageManager.saveAppState();
        }

        return count;
    }
};
