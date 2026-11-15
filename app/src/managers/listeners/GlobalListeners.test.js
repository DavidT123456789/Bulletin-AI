/**
 * @fileoverview Tests ciblés pour GlobalListeners (préservation de l'Assistant d'import suspendu)
 * @module managers/listeners/GlobalListeners.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GlobalListeners } from './GlobalListeners.js';
import { UI } from '../UIManager.js';
import { DOM } from '../../utils/DOM.js';
import * as LazyManagers from '../../utils/LazyManagers.js';

describe('GlobalListeners._handleActionLink — reprise de l’Assistant d’import suspendu', () => {
    let closeModalSpy;
    let withLazySpy;
    let originalHelpModal;

    beforeEach(() => {
        originalHelpModal = DOM.helpModal;
        document.body.innerHTML = `
            <div id="importWizardModal" class="modal"></div>
            <div id="helpModal" class="modal modal-visible">
                <button type="button" id="faqOpenImportBtn" data-action="open-import-wizard">Ouvrir l'Assistant d'import</button>
            </div>
        `;
        DOM.helpModal = document.getElementById('helpModal');

        closeModalSpy = vi.spyOn(UI, 'closeModal').mockImplementation(() => {});
        withLazySpy = vi.spyOn(LazyManagers, 'withLazyManager').mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        DOM.helpModal = originalHelpModal;
        document.body.innerHTML = '';
    });

    it('ferme uniquement le Guide sans réinitialiser l’Assistant d’import déjà suspendu', () => {
        document.getElementById('importWizardModal').classList.add('modal-suspended');

        GlobalListeners._handleActionLink(document.getElementById('faqOpenImportBtn'));

        expect(closeModalSpy).toHaveBeenCalledWith(DOM.helpModal);
        expect(withLazySpy).not.toHaveBeenCalled();
    });

    it('ouvre normalement l’Assistant d’import lorsqu’il n’est pas suspendu', () => {
        GlobalListeners._handleActionLink(document.getElementById('faqOpenImportBtn'));

        expect(withLazySpy).toHaveBeenCalledTimes(1);
        expect(closeModalSpy).not.toHaveBeenCalled();
    });
});
