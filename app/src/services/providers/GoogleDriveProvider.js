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
    icon: 'logos:google-drive',

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

            const timeout = setTimeout(() => reject(new Error('Google API load timeout')), 8000);

            // Load Google Identity Services
            const script = document.createElement('script');
            script.src = 'https://accounts.google.com/gsi/client';
            script.onload = () => { clearTimeout(timeout); resolve(); };
            script.onerror = () => { clearTimeout(timeout); reject(new Error('Failed to load Google API')); };
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

            const timeout = setTimeout(() => reject(new Error('GAPI client load timeout')), 8000);

            const script = document.createElement('script');
            script.src = 'https://apis.google.com/js/api.js';
            script.onload = () => {
                window.gapi.load('client', async () => {
                    try {
                        await window.gapi.client.init({
                            apiKey: GOOGLE_API_KEY,
                            discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
                        });
                        clearTimeout(timeout);
                        resolve();
                    } catch (e) {
                        clearTimeout(timeout);
                        reject(e);
                    }
                });
            };
            script.onerror = () => { clearTimeout(timeout); reject(new Error('Failed to load GAPI')); };
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
                        this.getUserInfo().catch(() => {});
                        resolve(true);
                    },
                    error_callback: (error) => {
                        // Called when user closes popup OR access is denied

                        resolve(false);
                    },
                });

                // If forcePrompt is requested, ask for consent; if silent, use 'none'; otherwise '' avoids re-prompting consent
                const prompt = options.forcePrompt ? 'consent' : (options.silent ? 'none' : '');
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
     * Check if currently connected with a valid token.
     * Includes a 60-second safety buffer before expiry.
     * @returns {boolean}
     */
    isConnected() {
        if (!this._token) {
            const savedToken = localStorage.getItem('bulletin_google_token');
            if (savedToken) {
                try {
                    this._token = JSON.parse(savedToken);
                } catch {
                    return false;
                }
            }
        }
        return this._token !== null && (Date.now() + 60000) < (this._token.expiry || 0);
    },

    /**
     * Get user info (display name, email, photo) for the connected Google account.
     * Uses cached profile in localStorage if available, or fetches from Drive API about endpoint.
     * @returns {Promise<{displayName: string, email: string, photo: string}|null>}
     */
    async getUserInfo() {
        if (!this.isConnected()) {
            return null;
        }

        const cached = localStorage.getItem('bulletin_google_user');
        if (cached) {
            try {
                return JSON.parse(cached);
            } catch {
                localStorage.removeItem('bulletin_google_user');
            }
        }

        try {
            const token = this._token?.access_token;
            if (!token) return null;

            const res = await fetch('https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress,photoLink)', {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });

            if (res.ok) {
                const data = await res.json();
                if (data?.user) {
                    const info = {
                        displayName: data.user.displayName || '',
                        email: data.user.emailAddress || '',
                        photo: data.user.photoLink || ''
                    };
                    localStorage.setItem('bulletin_google_user', JSON.stringify(info));
                    return info;
                }
            }
        } catch (e) {
            console.warn('[GoogleDrive] Could not fetch user profile:', e);
        }

        return null;
    },

    /**
     * Disconnect and clear tokens.
     */
    async disconnect() {
        if (this._token?.access_token && typeof google !== 'undefined' && google?.accounts?.oauth2?.revoke) {
            google.accounts.oauth2.revoke(this._token.access_token);
        }
        this._token = null;
        this._fileId = null;
        localStorage.removeItem('bulletin_google_token');
        localStorage.removeItem('bulletin_google_user');
    },

    // =========================================================================
    // ERROR HANDLING & HELPERS
    // =========================================================================

    /**
     * Normalize and handle Google API errors (especially auth expiration).
     * @private
     * @param {*} error - Error caught from gapi or fetch
     * @param {string} [defaultMsg='Erreur Google Drive'] - Default message
     * @returns {Error} Normalized error with .status and .isAuthError
     */
    _handleApiError(error, defaultMsg = 'Erreur Google Drive') {
        const status = error?.status || error?.result?.error?.code;
        const statusText = error?.result?.error?.status;
        const rawMsg = error?.result?.error?.message || error?.message;

        const isAuthError = status === 401 ||
                            status === 403 ||
                            statusText === 'UNAUTHENTICATED' ||
                            (typeof rawMsg === 'string' && (
                                rawMsg.includes('invalid authentication credentials') ||
                                rawMsg.includes('Invalid Credentials') ||
                                rawMsg.includes('auth')
                            ));

        if (isAuthError) {
            this._needsReconnect = true;
            this._token = null;
            localStorage.removeItem('bulletin_google_token');
            localStorage.removeItem('bulletin_google_user');
        }

        const message = rawMsg || (isAuthError ? 'Session Google Drive expirée. Veuillez vous reconnecter.' : defaultMsg);
        const err = error instanceof Error ? error : new Error(message);
        err.message = message;
        err.status = status;
        err.isAuthError = isAuthError;
        return err;
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
            // Search for existing file - sort by modifiedTime desc to ALWAYS get the newest file
            const response = await window.gapi.client.drive.files.list({
                spaces: 'appDataFolder',
                q: `name='${SYNC_FILENAME}' and trashed = false`,
                fields: 'files(id, name, modifiedTime)',
                orderBy: 'modifiedTime desc',
                pageSize: 10
            });

            const files = response.result.files || [];
            if (files.length > 0) {
                this._fileId = files[0].id;

                // Clean up any stale duplicate files if multiple exist in AppData
                if (files.length > 1) {
                    for (let i = 1; i < files.length; i++) {
                        try {
                            await window.gapi.client.drive.files.delete({ fileId: files[i].id });
                        } catch { /* best-effort cleanup */ }
                    }
                }

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
            throw this._handleApiError(error, 'Impossible d\'accéder au fichier sur Google Drive');
        }
    },

    /**
     * Read sync data from Google Drive.
     * @returns {Promise<Object|null>}
     */
    async read() {
        try {
            // Invalidate cached fileId to ensure we always pick the newest file from Drive
            this._fileId = null;
            const fileId = await this._ensureFile();

            const response = await window.gapi.client.drive.files.get({
                fileId: fileId,
                alt: 'media'
            });

            if (response.result && typeof response.result === 'object') {
                return response.result;
            }
            if (response.body) {
                return typeof response.body === 'string' ? JSON.parse(response.body) : response.body;
            }
            return null;

        } catch (error) {
            if (error?.status === 404) {
                return null; // File doesn't exist yet
            }
            console.error('[GoogleDrive] Read failed:', error);
            throw this._handleApiError(error, 'Impossible de lire les données sur Google Drive');
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

            const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${this._token?.access_token}`,
                    'Content-Type': `multipart/related; boundary=${boundary}`
                },
                body: body
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const err = new Error(errorData?.error?.message || `Erreur Google Drive: HTTP ${response.status}`);
                err.status = response.status;
                throw err;
            }

        } catch (error) {
            console.error('[GoogleDrive] Write failed:', error);
            throw this._handleApiError(error, 'Impossible d\'enregistrer les données sur Google Drive');
        }
    },

    /**
     * Get metadata of the sync file.
     * @returns {Promise<{lastModified: string, size: number}|null>}
     */
    async getMetadata() {
        try {
            this._fileId = null;
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
            const err = this._handleApiError(error);
            if (err.isAuthError) {
                throw err;
            }
            return null;
        }
    }
};
