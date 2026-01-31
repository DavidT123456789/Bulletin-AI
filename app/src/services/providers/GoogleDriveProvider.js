/**
 * @fileoverview Google Drive provider for cloud sync.
 * Uses Google Drive API with AppData folder (hidden from user).
 * 
 * @module services/providers/GoogleDriveProvider
 */

// Google API configuration
const GOOGLE_CLIENT_ID = '685675322524-qgc51t16ebv68ljcoi5re8mhfmkh1094.apps.googleusercontent.com';
const GOOGLE_API_KEY = ''; // Optional: for additional API calls
const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/drive.appdata';
const SYNC_FILENAME = 'bulletin-ai-sync.json';

/** @type {boolean} Enable debug logs (set to false for production) */
const DEBUG = false;

/**
 * Google Drive sync provider.
 * Stores data in the hidden AppData folder (only this app can access).
 */
export const GoogleDriveProvider = {
    name: 'google',
    displayName: 'Google Drive',
    icon: 'fab fa-google-drive',

    /** @type {Object|null} Google token */
    _token: null,

    /** @type {string|null} File ID of the sync file */
    _fileId: null,

    // =========================================================================
    // AUTHENTICATION
    // =========================================================================

    /**
     * Check if Google API script is loaded.
     * @private
     */
    _ensureGapiLoaded() {
        return new Promise((resolve, reject) => {
            if (window.google?.accounts?.oauth2) {
                resolve();
                return;
            }

            // Load Google Identity Services
            const script = document.createElement('script');
            script.src = 'https://accounts.google.com/gsi/client';
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Failed to load Google API'));
            document.head.appendChild(script);
        });
    },

    /**
     * Load the GAPI client library for Drive API.
     * @private
     */
    async _loadGapiClient() {
        return new Promise((resolve, reject) => {
            if (window.gapi?.client?.drive) {
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = 'https://apis.google.com/js/api.js';
            script.onload = () => {
                window.gapi.load('client', async () => {
                    try {
                        await window.gapi.client.init({
                            apiKey: GOOGLE_API_KEY,
                            discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
                        });
                        resolve();
                    } catch (e) {
                        reject(e);
                    }
                });
            };
            script.onerror = () => reject(new Error('Failed to load GAPI'));
            document.head.appendChild(script);
        });
    },

    /**
     * Authorize with Google.
     * @param {Object} options - { silent: boolean, forcePrompt: boolean }
     * @returns {Promise<boolean>} Success
     */
    async authorize(options = {}) {
        try {
            await this._ensureGapiLoaded();
            await this._loadGapiClient();

            // Check for saved token
            const savedToken = localStorage.getItem('bulletin_google_token');
            if (savedToken) {
                try {
                    this._token = JSON.parse(savedToken);
                    // Validate token - still valid
                    if (this._token.expiry && Date.now() < this._token.expiry) {
                        window.gapi.client.setToken({ access_token: this._token.access_token });
                        return true;
                    }
                    // Token expired - mark for reconnection but don't try OAuth refresh

                    this._needsReconnect = true;
                    if (options.silent) {
                        // In silent mode, just fail - don't trigger OAuth popup
                        return false;
                    }
                } catch (e) {
                    localStorage.removeItem('bulletin_google_token');
                }
            }

            // If silent mode, never try to open OAuth popup (will be blocked by browser)
            if (options.silent) {
                return false;
            }

            // Request new authorization (or refresh expired token)
            // Use 'none' prompt first to try silent refresh, fallback to 'consent' if needed
            return new Promise((resolve) => {
                const tokenClient = window.google.accounts.oauth2.initTokenClient({
                    client_id: GOOGLE_CLIENT_ID,
                    scope: GOOGLE_SCOPES,
                    callback: (tokenResponse) => {
                        if (tokenResponse.error) {
                            // If silent refresh failed and we had a saved token, try with consent
                            if (options.silent && savedToken && tokenResponse.error === 'interaction_required') {

                                // Mark that reconnection is needed
                                this._needsReconnect = true;
                            } else {
                                console.error('[GoogleDrive] Auth error:', tokenResponse.error);
                            }
                            resolve(false);
                            return;
                        }

                        this._token = {
                            access_token: tokenResponse.access_token,
                            expiry: Date.now() + (tokenResponse.expires_in * 1000)
                        };

                        localStorage.setItem('bulletin_google_token', JSON.stringify(this._token));
                        window.gapi.client.setToken({ access_token: this._token.access_token });
                        this._needsReconnect = false;
                        resolve(true);
                    },
                    error_callback: (error) => {
                        // Called when user closes popup OR access is denied

                        resolve(false);
                    },
                });

                // If we have an expired token, try silent refresh first
                // Otherwise, or if forcePrompt, ask for consent
                const prompt = (savedToken && options.silent) ? 'none' : 'consent';
                tokenClient.requestAccessToken({ prompt });
            });

        } catch (error) {
            console.error('[GoogleDrive] Authorization failed:', error);
            return false;
        }
    },

    /**
     * Check if reconnection is needed (token expired).
     * @returns {boolean}
     */
    needsReconnect() {
        return this._needsReconnect === true;
    },

    /**
     * Check if currently connected.
     * @returns {boolean}
     */
    isConnected() {
        return this._token !== null && Date.now() < (this._token.expiry || 0);
    },

    /**
     * Disconnect and clear tokens.
     */
    async disconnect() {
        if (this._token?.access_token) {
            google.accounts.oauth2.revoke(this._token.access_token);
        }
        this._token = null;
        this._fileId = null;
        localStorage.removeItem('bulletin_google_token');
    },

    // =========================================================================
    // FILE OPERATIONS
    // =========================================================================

    /**
     * Find or create the sync file in AppData.
     * @private
     */
    async _ensureFile() {
        if (this._fileId) return this._fileId;

        try {
            // Search for existing file
            const response = await window.gapi.client.drive.files.list({
                spaces: 'appDataFolder',
                q: `name='${SYNC_FILENAME}'`,
                fields: 'files(id, name, modifiedTime)',
                pageSize: 1
            });

            if (response.result.files?.length > 0) {
                this._fileId = response.result.files[0].id;
                return this._fileId;
            }

            // Create new file
            const createResponse = await window.gapi.client.drive.files.create({
                resource: {
                    name: SYNC_FILENAME,
                    parents: ['appDataFolder']
                },
                fields: 'id'
            });

            this._fileId = createResponse.result.id;
            return this._fileId;

        } catch (error) {
            console.error('[GoogleDrive] File operation failed:', error);
            throw error;
        }
    },

    /**
     * Read sync data from Google Drive.
     * @returns {Promise<Object|null>}
     */
    async read() {
        try {
            const fileId = await this._ensureFile();

            const response = await window.gapi.client.drive.files.get({
                fileId: fileId,
                alt: 'media'
            });

            if (response.body) {
                return JSON.parse(response.body);
            }
            return null;

        } catch (error) {
            if (error.status === 404) {
                return null; // File doesn't exist yet
            }
            console.error('[GoogleDrive] Read failed:', error);
            throw error;
        }
    },

    /**
     * Write sync data to Google Drive.
     * @param {Object} data - Data to write
     */
    async write(data) {
        try {
            const fileId = await this._ensureFile();
            const content = JSON.stringify(data, null, 2);

            // Use multipart upload
            const boundary = '-------bulletin_sync_boundary';
            const metadata = {
                name: SYNC_FILENAME,
                mimeType: 'application/json'
            };

            const body = [
                `--${boundary}`,
                'Content-Type: application/json; charset=UTF-8',
                '',
                JSON.stringify(metadata),
                `--${boundary}`,
                'Content-Type: application/json',
                '',
                content,
                `--${boundary}--`
            ].join('\r\n');

            await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${this._token.access_token}`,
                    'Content-Type': `multipart/related; boundary=${boundary}`
                },
                body: body
            });

        } catch (error) {
            console.error('[GoogleDrive] Write failed:', error);
            throw error;
        }
    },

    /**
     * Get metadata of the sync file.
     * @returns {Promise<{lastModified: string, size: number}|null>}
     */
    async getMetadata() {
        try {
            const fileId = await this._ensureFile();

            const response = await window.gapi.client.drive.files.get({
                fileId: fileId,
                fields: 'modifiedTime, size'
            });

            return {
                lastModified: response.result.modifiedTime,
                size: parseInt(response.result.size) || 0
            };

        } catch (error) {
            console.error('[GoogleDrive] Metadata fetch failed:', error);
            return null;
        }
    }
};
