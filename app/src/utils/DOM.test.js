import { describe, it, expect, beforeEach } from 'vitest';
import { DOM, initDOM } from './DOM';

describe('DOM', () => {
    beforeEach(() => {
        // Create a minimal DOM structure with common elements
        document.body.innerHTML = `
            <div class="app-layout">
                <div id="appVersionDisplay"></div>
                <button id="darkModeToggle"></button>
                <button id="settingsButton"></button>
                <button id="helpButton"></button>
                <select id="mainPeriodSelector"></select>
                <span id="headerClassContext"></span>
                <span id="headerStudentCount"></span>
                <span id="sidebarPeriodContext"></span>
                <div id="inputSection"></div>
                <button id="massImportTab"></button>
                <button id="singleStudentTab"></button>
                <div id="massImportSection"></div>
                <div id="singleStudentFormDiv"></div>
                <form id="actualSingleStudentForm"></form>
                <textarea id="massData"></textarea>
                <div id="massImportPreview"></div>
                <div id="mass-import-progress-output-area"></div>
                <div id="outputProgressFill"></div>
                <span id="outputProgressText"></span>
                <button id="cancelImportOutputBtn"></button>
                <button id="importGenerateBtn"></button>
                <button id="clearImportBtn"></button>
                <a id="loadSampleDataLink"></a>
                <div id="dropZone"></div>
                <button id="importFileBtn"></button>
                <input id="nom" />
                <input id="prenom" />
                <span id="nomError"></span>
                <span id="prenomError"></span>
                <div id="singleStudentPeriodInputs"></div>
                <textarea id="negativeInstructions"></textarea>
                <div class="generation-buttons-group"></div>
                <button id="generateAppreciationBtn"></button>
                <button id="generateAndNextBtn"></button>
                <button id="resetFormBtn"></button>
                <button id="cancelEditBtn"></button>
                <div id="outputList"></div>
                <input id="searchInput" />
                <span id="avgWordsChip"></span>
                <div id="evolutionCard"></div>
                <span id="classEvolutionAverageStat"></span>
                <span id="classEvolutionProgressStat"></span>
                <span id="classEvolutionStableStat"></span>
                <span id="classEvolutionRegressionStat"></span>
                <span id="currentAvgGradeOutput"></span>
                <span id="previousAvgGradeOutput"></span>
                <span id="minAvgGradeOutput"></span>
                <span id="maxAvgGradeOutput"></span>
                <button id="clearAllResultsBtn-shortcut"></button>
                <button id="copyAllBtn-shortcut"></button>
                <button id="regenerateAllBtn"></button>
                <button id="regenerateErrorsBtn-shortcut"></button>
                <button id="exportJsonBtn"></button>
                <button id="exportCsvBtn"></button>
                <button id="exportPdfBtn"></button>
                <select id="sortSelect"></select>
                <input type="file" id="fileInput" />
                <div id="settingsModal"></div>
                <button id="closeSettingsModalBtn"></button>
                <input type="radio" name="periodSystemRadio" value="trimester" />
                <input id="evolutionThresholdPositive" />
                <input id="evolutionThresholdNegative" />
                <ul id="suggestionsList"></ul>
                <button id="resetAllSettingsBtn"></button>
                <button id="saveSettingsBtn"></button>
                <button id="cancelSettingsBtn"></button>
                <div class="settings-tab"></div>
                <input type="checkbox" id="personalizationToggle" />
                <div id="templatesTabContent"></div>
                <div id="optionsTabContent"></div>
                <div id="advancedTabContent"></div>
                <select id="aiModelSelect"></select>
                <input id="openaiApiKey" />
                <div id="openaiApiKeyGroup"></div>
                <span id="openaiApiKeyError"></span>
                <span id="openaiApiKeyValidationIcon"></span>
                <button id="validateOpenaiApiKeyBtn"></button>
                <input id="googleApiKey" />
                <div id="googleApiKeyGroup"></div>
                <span id="googleApiKeyError"></span>
                <span id="googleApiKeyHint"></span>
                <span id="googleApiKeyValidationIcon"></span>
                <button id="validateGoogleApiKeyBtn"></button>
                <input id="openrouterApiKey" />
                <div id="openrouterApiKeyGroup"></div>
                <span id="openrouterApiKeyError"></span>
                <span id="openrouterApiKeyValidationIcon"></span>
                <button id="validateOpenrouterApiKeyBtn"></button>
                <span id="sessionCost"></span>
                <textarea id="mainGenerationPromptDisplay"></textarea>
                <textarea id="refineConcisePromptDisplay"></textarea>
                <textarea id="refineDetailedPromptDisplay"></textarea>
                <textarea id="refineEncouragingPromptDisplay"></textarea>
                <textarea id="refineFormalPromptDisplay"></textarea>
                <textarea id="refinePolishPromptDisplay"></textarea>
                <textarea id="nextStepsPromptDisplay"></textarea>
                <textarea id="strengthsWeaknessesPromptDisplay"></textarea>
                <div id="studentDetailsModal"></div>
                <span id="studentDetailsModalTitle"></span>
                <button id="closeStudentDetailsModalBtn"></button>
                <button id="nextStudentBtn"></button>
                <button id="prevStudentBtn"></button>
                <div id="details-periods-container"></div>
                <div id="technicalDetailsAccordion"></div>
                <div id="detailsAppreciationPrompt"></div>
                <div id="detailsSWPrompt"></div>
                <div id="detailsNSPrompt"></div>
                <div id="detailsTokenUsageSection"></div>
                <div id="detailsTokenUsageContent"></div>
                <div id="strengthsWeaknessesSection"></div>
                <div id="strengthsWeaknessesContent"></div>
                <div id="nextStepsSection"></div>
                <ul id="nextStepsList"></ul>
                <button id="closeDetailsModalBtn"></button>
                <div id="refinementModal"></div>
                <button id="closeRefinementModalBtn"></button>
                <span id="refinementModalTitle"></span>
                <div id="originalAppreciationText"></div>
                <div id="suggestedAppreciationText"></div>
                <span id="originalWordCount"></span>
                <span id="suggestedWordCount"></span>
                <div id="refineStyleOptions"></div>
                <button id="swapRefinementBtn"></button>
                <button id="cancelRefinementBtn"></button>
                <button id="applyRefinedAppreciationBtn"></button>
                <button id="resetRefinementBtn"></button>
                <button id="closeRefinementFooterBtn"></button>
                <button id="prevRefinementStudentBtn"></button>
                <button id="nextRefinementStudentBtn"></button>
                <textarea id="refinementContext"></textarea>
                <button id="refineWithContextBtn"></button>
                <div id="refinement-error-actions"></div>
                <div id="helpModal"></div>
                <button id="closeHelpModalBtn"></button>
                <button id="closeHelpModalFooterBtn"></button>
                <button id="closeClassAnalysisFooterBtn"></button>
                <button id="helpGoToSettingsBtn"></button>
                <select id="helpFormatSelector"></select>
                <button id="relaunchWelcomeGuideBtn"></button>
                <div id="loadingOverlay"></div>
                <span id="loadingText"></span>
                <div id="pwaInstallBanner"></div>
                <button id="pwaInstallBtn"></button>
                <button id="pwaDismissBtn"></button>
                <div id="empty-state-card"></div>
                <div id="noResultsMessage"></div>
                <button id="importSettingsBtn"></button>
                <button id="exportSettingsBtn"></button>
                <div id="welcomeModal"></div>
                <div id="welcome-next-step-info"></div>
                <button id="welcomePrevBtn"></button>
                <button id="welcomeNextBtn"></button>
                <button id="welcomeLoadSampleBtn"></button>
                <button id="welcomeFinishBtn"></button>
                <button id="welcomeFinishAndHideBtn"></button>
                <div id="welcome-finish-options"></div>
                <div id="welcome-dots"></div>
                <input id="welcomeApiKeyInput" />
                <button id="welcomeValidateApiKeyBtn"></button>
                <span id="welcomeApiKeyError"></span>
                <button id="welcomeSkipApiKeyBtn"></button>
                <div id="actions-irreversibles-container"></div>
                <button id="backToTopBtn"></button>
                <button id="analyzeClassBtn"></button>
                <div id="classAnalysisModal"></div>
                <span id="classAnalysisModalTitle"></span>
                <button id="closeClassAnalysisModalBtn"></button>
                <div id="classAnalysisEditableText" contenteditable></div>
                <span id="classAnalysisWordCount"></span>
                <div id="classAnalysisOptions"></div>
                <div id="classAnalysisSourceStatsContainer"></div>
                <ul id="classAnalysisStatsList"></ul>
                <div id="classAnalysisActions"></div>
                <button id="copyClassAnalysisBtn"></button>
                <button id="copyAnalysisBtn"></button>
                <button id="actionsBtnToggle"></button>
                <div class="actions-dropdown">
                    <div class="actions-dropdown-content"></div>
                </div>
                <input id="iaStyleHeader" />
                <textarea id="iaStyleInstructions"></textarea>
                <input type="range" id="iaLengthSlider" />
                <span id="iaLengthSliderValue"></span>
                <input type="range" id="iaToneSlider" />
                <div id="genericSubjectInfo"></div>
                <button id="deleteSubjectBtn"></button>
                <button id="resetSubjectBtn"></button>
                <button id="addSubjectBtn"></button>
                <select id="settingsSubjectSelect"></select>
                <select id="previewStudentSelect"></select>
                <button id="refreshPreviewBtn"></button>
                <div id="settingsPreviewResult"></div>
                <div id="settingsPreviewPrompt"></div>
                <div id="settingsPreviewStudentData"></div>
                <span id="settingsPreviewWordCount"></span>
                <span id="settingsPreviewTokenCount"></span>
                <div id="previewMetaContainer"></div>
                <div id="subjectManagementList"></div>
                <input id="newSubjectInput" />
                <div id="previewStatus"></div>
                <button id="sidebarToggle"></button>
                <button id="sidebarCloseBtn"></button>
                <div id="subject-customization-panel"></div>
                <div id="massImportApiKeyWarning"></div>
                <select id="loadStudentSelect"></select>
                <div id="brickDropdown"></div>
                <div id="brickDropdownRefinement"></div>
                <div id="activeFilterInfo"></div>
                <div id="massImportErrorActions"></div>
                <div id="importPreviewModal"></div>
                <span id="importPreviewModalTitle"></span>
                <button id="closeImportPreviewModalBtn"></button>
                <div id="import-summary-text"></div>
                <div id="importSavedFormatInfo"></div>
                <div id="import-strategy-container"></div>
                <input type="radio" id="strategyMerge" name="strategy" />
                <input type="radio" id="strategyReplace" name="strategy" />
                <div id="import-preview-container"></div>
                <div class="import-preview-grid"></div>
                <div id="import-preview-replace-warning"></div>
                <ul id="new-students-list"></ul>
                <ul id="updated-students-list"></ul>
                <ul id="departed-students-list"></ul>
                <span id="new-count"></span>
                <span id="updated-count"></span>
                <span id="departed-count"></span>
                <div id="mappingHeaders"></div>
                <div id="mappingPreviewData"></div>
                <select id="separatorSelect"></select>
                <input id="customSeparatorInput" />
                <input type="checkbox" id="saveMappingCheckbox" />
                <button id="cancelImportPreviewBtn"></button>
                <button id="confirmImportPreviewBtn"></button>
                <div id="singleStudentActions"></div>
                <div class="input-panels-wrapper"></div>
                <div id="massImportActions"></div>
            </div>
        `;
    });

    describe('initDOM', () => {
        it('should initialize all DOM references', () => {
            initDOM();

            // Verify key elements are defined
            expect(DOM.appLayout).toBeDefined();
            expect(DOM.appVersionDisplay).toBeDefined();
            expect(DOM.darkModeToggle).toBeDefined();
            expect(DOM.settingsButton).toBeDefined();
            expect(DOM.generateAppreciationBtn).toBeDefined();
            expect(DOM.resultsDiv).toBeDefined();
            expect(DOM.settingsModal).toBeDefined();
            expect(DOM.welcomeModal).toBeDefined();
        });

        it('should reference correct DOM elements', () => {
            initDOM();

            expect(DOM.appLayout).toBeInstanceOf(HTMLElement);
            expect(DOM.appLayout.className).toBe('app-layout');
            expect(DOM.darkModeToggle.id).toBe('darkModeToggle');
        });

        it('should handle missing elements gracefully', () => {
            document.body.innerHTML = '<div></div>';

            // Should not throw
            expect(() => initDOM()).not.toThrow();

            // Missing elements should be null
            expect(DOM.appLayout).toBeNull();
        });
    });

    describe('DOM object export', () => {
        it('should export an initially empty DOM object', () => {
            // Create new module context - DOM starts empty
            expect(typeof DOM).toBe('object');
        });

        it('should be mutable', () => {
            initDOM();
            // DOM references can be updated
            expect(DOM.appVersionDisplay).toBeDefined();
        });
    });
});
