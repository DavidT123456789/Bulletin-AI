/**
 * @fileoverview Dropbox provider for cloud sync.
 * Uses Dropbox API with app folder.
 * 
 * @module services/providers/DropboxProvider
 */

// Dropbox API configuration
// NOTE: Replace with your app's App Key from Dropbox App Console
const DROPBOX_APP_KEY = 'YOUR_DROPBOX_APP_KEY';
const SYNC_FILENAME = '/bulletin-ai-sync.json';

/**
 * Dropbox sync provider.
 * Stores data in the app's folder.
 */
export const DropboxProvider = {
    name: 'dropbox',
    displayName: 'Dropbox',
    icon: 'logos:dropbox',

    /** @type {string|null} Access token */
    _token: null,

    // =========================================================================
    // AUTHENTICATION
    // =========================================================================

    /**
     * Generate code verifier for PKCE.
     * @private
     */
    _generateCodeVerifier() {
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        return btoa(String.fromCharCode(...array))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    },

    /**
     * Generate code challenge from verifier.
     * @private
     */
    async _generateCodeChallenge(verifier) {
        const encoder = new TextEncoder();
        const data = encoder.encode(verifier);
        const hash = await crypto.subtle.digest('SHA-256', data);
        return btoa(String.fromCharCode(...new Uint8Array(hash)))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    },

    /**
     * Authorize with Dropbox using PKCE flow.
     * @param {Object} options - { silent: boolean }
     * @returns {Promise<boolean>}
     */
    async authorize(options = {}) {
        try {
            // Check for saved token
            const savedToken = localStorage.getItem('bulletin_dropbox_token');
            if (savedToken) {
                this._token = savedToken;
                // Validate token with a simple API call
                try {
                    await this._apiCall('/users/get_current_account', null);
                    return true;
                } catch (e) {
                    localStorage.removeItem('bulletin_dropbox_token');
                    this._token = null;
                }
            }

            if (options.silent) {
                return false;
            }

            // Start PKCE OAuth flow
            const codeVerifier = this._generateCodeVerifier();
            const codeChallenge = await this._generateCodeChallenge(codeVerifier);
            const state = crypto.randomUUID();

            // Store state for callback verification
            sessionStorage.setItem('dropbox_oauth_state', state);
            sessionStorage.setItem('dropbox_code_verifier', codeVerifier);

            // Build authorization URL
            const authUrl = new URL('https://www.dropbox.com/oauth2/authorize');
            authUrl.searchParams.set('client_id', DROPBOX_APP_KEY);
            authUrl.searchParams.set('response_type', 'code');
            authUrl.searchParams.set('code_challenge', codeChallenge);
            authUrl.searchParams.set('code_challenge_method', 'S256');
            authUrl.searchParams.set('token_access_type', 'offline');
            authUrl.searchParams.set('state', state);
            authUrl.searchParams.set('redirect_uri', window.location.origin + '/dropbox-callback.html');

            // Open popup for authorization
            return new Promise((resolve) => {
                const popup = window.open(authUrl.toString(), 'dropbox_auth', 'width=600,height=700');

                const checkClosed = setInterval(() => {
                    if (popup?.closed) {
                        clearInterval(checkClosed);
                        // Check if token was saved by callback
                        const token = localStorage.getItem('bulletin_dropbox_token');
                        if (token) {
                            this._token = token;
                            resolve(true);
                        } else {
                            resolve(false);
                        }
                    }
                }, 500);

                // Also listen for message from popup
                window.addEventListener('message', async (event) => {
                    if (event.origin !== window.location.origin) return;
                    if (event.data?.type !== 'dropbox_auth_callback') return;

                    const { code, state: returnedState } = event.data;
                    const savedState = sessionStorage.getItem('dropbox_oauth_state');

                    if (returnedState !== savedState) {
                        console.error('[Dropbox] State mismatch');
                        resolve(false);
                        return;
                    }

                    // Exchange code for token
                    try {
                        const storedVerifier = sessionStorage.getItem('dropbox_code_verifier');
                        const tokenResponse = await fetch('https://api.dropboxapi.com/oauth2/token', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                            body: new URLSearchParams({
                                code: code,
                                grant_type: 'authorization_code',
                                client_id: DROPBOX_APP_KEY,
                                code_verifier: storedVerifier,
                                redirect_uri: window.location.origin + '/dropbox-callback.html'
                            })
                        });

                        const tokenData = await tokenResponse.json();
                        if (tokenData.access_token) {
                            this._token = tokenData.access_token;
                            localStorage.setItem('bulletin_dropbox_token', this._token);
                            resolve(true);
                        } else {
                            resolve(false);
                        }
                    } catch (e) {
                        console.error('[Dropbox] Token exchange failed:', e);
                        resolve(false);
                    }
                }, { once: true });
            });

        } catch (error) {
            console.error('[Dropbox] Authorization failed:', error);
            return false;
        }
    },

    /**
     * Check if connected.
     */
    isConnected() {
        return this._token !== null;
    },

    /**
     * Disconnect and clear token.
     */
    async disconnect() {
        if (this._token) {
            try {
                await this._apiCall('/auth/token/revoke', null);
            } catch (e) {
                // Ignore revoke errors
            }
        }
        this._token = null;
        localStorage.removeItem('bulletin_dropbox_token');
    },

    // =========================================================================
    // FILE OPERATIONS
    // =========================================================================

    /**
     * Make an API call to Dropbox.
     * @private
     */
    async _apiCall(endpoint, body, options = {}) {
        const isContent = endpoint.startsWith('/files/');
        const baseUrl = isContent
            ? 'https://content.dropboxapi.com/2'
            : 'https://api.dropboxapi.com/2';

        const headers = {
            'Authorization': `Bearer ${this._token}`,
        };

        if (options.downloadContent) {
            headers['Dropbox-API-Arg'] = JSON.stringify(body);
        } else if (body !== null) {
            headers['Content-Type'] = 'application/json';
        }

        const response = await fetch(baseUrl + endpoint, {
            method: 'POST',
            headers,
            body: options.downloadContent ? undefined : (body ? JSON.stringify(body) : undefined)
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error_summary || `Dropbox API error: ${response.status}`);
        }

        if (options.downloadContent) {
            return response.text();
        }

        return response.json();
    },

    /**
     * Read sync data from Dropbox.
     * @returns {Promise<Object|null>}
     */
    async read() {
        try {
            const content = await this._apiCall('/files/download', { path: SYNC_FILENAME }, { downloadContent: true });
            return JSON.parse(content);
        } catch (error) {
            if (error.message.includes('path/not_found')) {
                return null;
            }
            console.error('[Dropbox] Read failed:', error);
            throw error;
        }
    },

    /**
     * Write sync data to Dropbox.
     * @param {Object} data
     */
    async write(data) {
        const content = JSON.stringify(data, null, 2);

        const response = await fetch('https://content.dropboxapi.com/2/files/upload', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this._token}`,
                'Content-Type': 'application/octet-stream',
                'Dropbox-API-Arg': JSON.stringify({
                    path: SYNC_FILENAME,
                    mode: 'overwrite',
                    autorename: false,
                    mute: true
                })
            },
            body: content
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error_summary || 'Upload failed');
        }
    },

    /**
     * Get file metadata.
     * @returns {Promise<{lastModified: string, size: number}|null>}
     */
    async getMetadata() {
        try {
            const result = await this._apiCall('/files/get_metadata', { path: SYNC_FILENAME });
            return {
                lastModified: result.server_modified,
                size: result.size
            };
        } catch (error) {
            if (error.message.includes('path/not_found')) {
                return null;
            }
            throw error;
        }
    }
};
