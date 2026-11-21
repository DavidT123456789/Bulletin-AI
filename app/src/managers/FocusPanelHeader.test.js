import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { appState, userSettings } from '../state/State.js';
import { FocusPanelHeader } from './FocusPanelHeader.js';

describe('FocusPanelHeader — Layout Offset Sync & Identity Rendering', () => {
    let originalInnerWidth;

    beforeEach(() => {
        originalInnerWidth = window.innerWidth;
        Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true, writable: true });

        appState.currentPeriod = 'S2';
        appState.currentClassId = 'class-group';
        userSettings.academic = {
            ...(userSettings.academic || {}),
            currentClassId: 'class-group',
            classes: [
                { id: 'class-group', name: 'Groupe Maths' }
            ]
        };

        document.body.innerHTML = `
            <div id="focusPanel" class="focus-panel">
                <div class="focus-header" style="margin-top: 8px;">
                    <div class="focus-header-toolbar"></div>
                    <div class="focus-header-identity">
                        <div class="focus-header-left">
                            <div id="focusAvatarContainer"></div>
                        </div>
                        <div id="focusHeaderContent" class="focus-header-content">
                            <div class="focus-header-read">
                                <h2 id="focusStudentName" class="focus-student-name" role="button" tabindex="0"></h2>
                                <div id="focusStatusBadges" class="focus-status-badges"></div>
                            </div>
                            <div class="focus-header-edit"></div>
                        </div>
                    </div>
                </div>
                <div class="focus-pages-container">
                    <div class="focus-main-page">
                        <div class="focus-content">
                            <div id="focusContextStatusBadges"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });

    afterEach(() => {
        Object.defineProperty(window, 'innerWidth', { value: originalInnerWidth, configurable: true, writable: true });
        vi.restoreAllMocks();
    });

    describe('syncHeaderOffset()', () => {
        it('sets --focus-header-offset from header height, top margin and desktop gap', () => {
            const panel = document.getElementById('focusPanel');
            const header = panel.querySelector('.focus-header');
            Object.defineProperty(header, 'offsetHeight', { value: 138, configurable: true });

            FocusPanelHeader.syncHeaderOffset();

            // 138 (height) + 8 (margin-top) + 14 (desktop gap) = 160px
            expect(panel.style.getPropertyValue('--focus-header-offset')).toBe('160px');
        });

        it('uses the compact 12px mobile gap when viewport width <= 600px', () => {
            Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true, writable: true });
            const panel = document.getElementById('focusPanel');
            const header = panel.querySelector('.focus-header');
            Object.defineProperty(header, 'offsetHeight', { value: 114, configurable: true });

            FocusPanelHeader.syncHeaderOffset();

            // 114 + 8 + 12 = 134px
            expect(panel.style.getPropertyValue('--focus-header-offset')).toBe('134px');
        });

        it('does not overwrite --focus-header-offset while header is scrolled or editing', () => {
            const panel = document.getElementById('focusPanel');
            const header = panel.querySelector('.focus-header');
            panel.style.setProperty('--focus-header-offset', '154px');
            Object.defineProperty(header, 'offsetHeight', { value: 52, configurable: true });

            header.classList.add('scrolled');
            FocusPanelHeader.syncHeaderOffset();
            expect(panel.style.getPropertyValue('--focus-header-offset')).toBe('154px');

            header.classList.remove('scrolled');
            header.classList.add('editing');
            FocusPanelHeader.syncHeaderOffset();
            expect(panel.style.getPropertyValue('--focus-header-offset')).toBe('154px');
        });

        it('safely preserves CSS fallback when DOM is missing or header height is 0', () => {
            const panel = document.getElementById('focusPanel');
            const header = panel.querySelector('.focus-header');
            Object.defineProperty(header, 'offsetHeight', { value: 0, configurable: true });

            FocusPanelHeader.syncHeaderOffset();
            expect(panel.style.getPropertyValue('--focus-header-offset')).toBe('');

            document.body.innerHTML = '';
            expect(() => FocusPanelHeader.syncHeaderOffset()).not.toThrow();
        });
    });

    describe('updateHeaderName() & renderStatusBadges()', () => {
        it('renders long compound names with inline origin class pill and syncs header offset', () => {
            const syncSpy = vi.spyOn(FocusPanelHeader, 'syncHeaderOffset');

            FocusPanelHeader.updateHeaderName({
                id: 's-1',
                nom: 'Raynaud Fernandez',
                prenom: 'Paulin',
                studentData: { classe: '3e2', statuses: ['Nouveau S2'] }
            });

            expect(document.querySelector('.focus-name-nom')?.textContent).toBe('RAYNAUD FERNANDEZ');
            expect(document.querySelector('.focus-prenom-text')?.textContent).toBe('Paulin');
            expect(document.querySelector('.focus-name-prenom .focus-origin-class-badge')?.textContent).toContain('Classe 3ᵉ2');
            expect(syncSpy).toHaveBeenCalledTimes(1);

            // Clearing origin class removes the pill cleanly
            FocusPanelHeader.updateHeaderName({
                id: 's-2',
                nom: 'Durand',
                prenom: 'Sophie',
                studentData: { statuses: [] }
            });
            expect(document.querySelector('.focus-origin-class-badge')).toBeNull();
        });

        it('splits movement badges into #focusStatusBadges and academic badges into context, then syncs offset', () => {
            const syncSpy = vi.spyOn(FocusPanelHeader, 'syncHeaderOffset');

            FocusPanelHeader.renderStatusBadges(['Nouveau S2', 'PAP']);

            expect(document.getElementById('focusStatusBadges')?.textContent).toContain('Nouveau S2');
            expect(document.getElementById('focusContextStatusBadges')?.textContent).toContain('PAP');
            expect(syncSpy).toHaveBeenCalledTimes(1);
        });
    });
});
