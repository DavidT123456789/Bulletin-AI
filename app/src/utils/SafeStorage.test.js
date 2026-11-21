import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SafeStorage, STORAGE_KEYS } from './SafeStorage.js';

describe('SafeStorage', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        localStorage.clear();
        sessionStorage.clear();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('exposes frozen STORAGE_KEYS registry with expected core keys', () => {
        expect(Object.isFrozen(STORAGE_KEYS)).toBe(true);
        expect(STORAGE_KEYS.APP_STATE).toBe('appreciationGeneratorState_v6.2');
        expect(STORAGE_KEYS.SYNC_PROVIDER).toBe('bulletin_sync_provider');
        expect(STORAGE_KEYS.THEME).toBe('bulletin_theme');
    });

    it('performs nominal get, set, and remove operations', () => {
        expect(SafeStorage.get('missing_key')).toBeNull();
        expect(SafeStorage.get('missing_key', 'default')).toBe('default');

        expect(SafeStorage.set('test_key', 'hello')).toBe(true);
        expect(SafeStorage.get('test_key')).toBe('hello');

        expect(SafeStorage.remove('test_key')).toBe(true);
        expect(SafeStorage.get('test_key')).toBeNull();
    });

    it('handles getJSON and setJSON nominally and on corrupt/empty payloads', () => {
        expect(SafeStorage.getJSON('missing_json', { ok: false })).toEqual({ ok: false });

        expect(SafeStorage.setJSON('obj_key', { count: 3, list: ['a'] })).toBe(true);
        expect(SafeStorage.getJSON('obj_key')).toEqual({ count: 3, list: ['a'] });

        localStorage.setItem('bad_json', '{not-valid-json');
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect(SafeStorage.getJSON('bad_json', 'fallback')).toBe('fallback');
        expect(localStorage.getItem('bad_json')).toBe('{not-valid-json');

        expect(SafeStorage.getJSON('bad_json', null, { removeOnCorrupt: true })).toBeNull();
        expect(localStorage.getItem('bad_json')).toBeNull();
        expect(warnSpy).toHaveBeenCalled();
    });

    it('recovers gracefully when localStorage throws QuotaExceededError or SecurityError', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.stubGlobal('localStorage', {
            getItem: vi.fn(() => { throw new DOMException('Blocked', 'SecurityError'); }),
            setItem: vi.fn(() => { throw new DOMException('Quota exceeded', 'QuotaExceededError'); }),
            removeItem: vi.fn(() => { throw new DOMException('Blocked', 'SecurityError'); })
        });

        expect(SafeStorage.get('k', 'safe_default')).toBe('safe_default');
        expect(SafeStorage.set('k', 'val')).toBe(false);
        expect(SafeStorage.remove('k')).toBe(false);
        expect(SafeStorage.setJSON('k', { a: 1 })).toBe(false);
        expect(warnSpy).toHaveBeenCalled();
    });

    it('recovers gracefully when accessing window.localStorage getter itself throws', () => {
        const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
        Object.defineProperty(globalThis, 'localStorage', {
            configurable: true,
            get() {
                throw new DOMException('Access denied', 'SecurityError');
            }
        });

        try {
            expect(SafeStorage.get('k', 'fallback')).toBe('fallback');
            expect(SafeStorage.set('k', 'val')).toBe(false);
            expect(SafeStorage.remove('k')).toBe(false);
            expect(SafeStorage.removeMatching({ prefixes: ['bulletin'], explicitKeys: ['k'] })).toBe(0);
        } finally {
            if (originalDescriptor) {
                Object.defineProperty(globalThis, 'localStorage', originalDescriptor);
            }
        }
    });

    it('returns false in setJSON on unserializable circular structures', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const circular = {};
        circular.self = circular;
        expect(SafeStorage.setJSON('circ', circular)).toBe(false);
        expect(warnSpy).toHaveBeenCalled();
    });

    it('removeMatching removes keys matching prefixes, substrings, and explicitKeys safely', () => {
        localStorage.setItem('bulletin_theme', 'dark');
        localStorage.setItem('appreciationGeneratorState_v6.2', '{}');
        localStorage.setItem('myGeneratorBackup', '{}');
        localStorage.setItem('labPreviewTab', 'prompt');
        localStorage.setItem('unrelated_key', 'keep');

        const removedCount = SafeStorage.removeMatching({
            prefixes: ['bulletin', 'appState', 'appreciation'],
            contains: ['Generator'],
            explicitKeys: ['labPreviewTab']
        });

        expect(removedCount).toBe(4);
        expect(localStorage.getItem('bulletin_theme')).toBeNull();
        expect(localStorage.getItem('appreciationGeneratorState_v6.2')).toBeNull();
        expect(localStorage.getItem('myGeneratorBackup')).toBeNull();
        expect(localStorage.getItem('labPreviewTab')).toBeNull();
        expect(localStorage.getItem('unrelated_key')).toBe('keep');
    });

    it('removeMatching works even on minimal test stubs lacking length and key()', () => {
        const store = { k1: '1', k2: '2' };
        vi.stubGlobal('localStorage', {
            getItem: vi.fn(k => store[k] ?? null),
            setItem: vi.fn((k, v) => { store[k] = v; }),
            removeItem: vi.fn(k => { delete store[k]; })
        });

        const removed = SafeStorage.removeMatching({
            prefixes: ['bulletin'],
            explicitKeys: ['k1']
        });

        expect(removed).toBe(1);
        expect(store.k1).toBeUndefined();
        expect(store.k2).toBe('2');
    });

    describe('sessionStorage helpers', () => {
        it('performs nominal getSession, setSession, removeSession, getSessionJSON and setSessionJSON', () => {
            expect(SafeStorage.getSession('missing')).toBeNull();
            expect(SafeStorage.getSession('missing', 'fallback')).toBe('fallback');

            expect(SafeStorage.setSession('s_key', 'tok')).toBe(true);
            expect(SafeStorage.getSession('s_key')).toBe('tok');
            expect(SafeStorage.get('s_key')).toBeNull();

            expect(SafeStorage.setSessionJSON('s_json', { access_token: 'abc', expiry: 123 })).toBe(true);
            expect(SafeStorage.getSessionJSON('s_json')).toEqual({ access_token: 'abc', expiry: 123 });

            expect(SafeStorage.removeSession('s_key')).toBe(true);
            expect(SafeStorage.getSession('s_key')).toBeNull();
        });

        it('handles corrupt JSON and removeOnCorrupt on sessionStorage', () => {
            sessionStorage.setItem('bad_s_json', '{corrupt');
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            expect(SafeStorage.getSessionJSON('bad_s_json', 'fallback')).toBe('fallback');
            expect(sessionStorage.getItem('bad_s_json')).toBe('{corrupt');

            expect(SafeStorage.getSessionJSON('bad_s_json', null, { removeOnCorrupt: true })).toBeNull();
            expect(sessionStorage.getItem('bad_s_json')).toBeNull();
            expect(warnSpy).toHaveBeenCalled();
        });

        it('recovers gracefully when sessionStorage throws SecurityError/QuotaExceededError or getter throws', () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            vi.stubGlobal('sessionStorage', {
                getItem: vi.fn(() => { throw new DOMException('Blocked', 'SecurityError'); }),
                setItem: vi.fn(() => { throw new DOMException('Quota exceeded', 'QuotaExceededError'); }),
                removeItem: vi.fn(() => { throw new DOMException('Blocked', 'SecurityError'); })
            });

            expect(SafeStorage.getSession('k', 'safe')).toBe('safe');
            expect(SafeStorage.setSession('k', 'v')).toBe(false);
            expect(SafeStorage.removeSession('k')).toBe(false);
            expect(SafeStorage.setSessionJSON('k', { a: 1 })).toBe(false);
            expect(warnSpy).toHaveBeenCalled();

            const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
            Object.defineProperty(globalThis, 'sessionStorage', {
                configurable: true,
                get() {
                    throw new DOMException('Denied', 'SecurityError');
                }
            });
            try {
                expect(SafeStorage.getSession('k', 'fallback')).toBe('fallback');
                expect(SafeStorage.setSession('k', 'v')).toBe(false);
                expect(SafeStorage.removeSession('k')).toBe(false);
            } finally {
                if (originalDescriptor) {
                    Object.defineProperty(globalThis, 'sessionStorage', originalDescriptor);
                }
            }
        });
    });
});
