
export const DOM = {};

// Mode développement pour warnings détaillés
const IS_DEV = typeof import.meta !== 'undefined' && import.meta.env?.DEV;

/**
 * Éléments DOM critiques qui doivent exister pour le fonctionnement de l'app.
 * Une erreur sera loggée si ces éléments sont manquants.
 */
const CRITICAL_ELEMENTS = [
    'resultsDiv',
    'settingsModal',
    'nomInput',
    'prenomInput',
    'generateAppreciationBtn',
    'massData',
    'aiModelSelect'
];

/**
 * Compteur d'éléments manquants pour le rapport final
 */
let missingElementsCount = 0;

/**
 * Helper pour récupérer un élément DOM avec null-check défensif.
 * @param {string} selector - Sélecteur CSS ou ID (sans #)
 * @param {string} propName - Nom de la propriété dans DOM
 * @param {boolean} isById - true pour getElementById, false pour querySelector
 * @returns {Element|null}
 */
function safeGetElement(selector, propName, isById = true) {
    const element = isById
        ? document.getElementById(selector)
        : document.querySelector(selector);

    if (!element) {
        missingElementsCount++;
        const isCritical = CRITICAL_ELEMENTS.includes(propName);

        if (isCritical) {
            console.error(`[DOM] ❌ Élément CRITIQUE manquant: ${propName} (${isById ? '#' : ''}${selector})`);
        } else if (IS_DEV) {
            console.warn(`[DOM] ⚠️ Élément manquant: ${propName} (${isById ? '#' : ''}${selector})`);
        }
    }

    return element;
}

export function initDOM() {
    missingElementsCount = 0; // Reset le compteur à chaque init

    DOM.appLayout = document.querySelector('.app-layout');
    DOM.appVersionDisplay = document.getElementById('appVersionDisplay');
    DOM.darkModeToggle = document.getElementById('darkModeToggle');
    DOM.settingsButton = document.getElementById('settingsButton');
    DOM.helpButton = document.getElementById('helpButton');
    DOM.mainPeriodSelector = document.getElementById('mainPeriodSelector');
    DOM.headerMenuBtn = document.getElementById('headerMenuBtn');
    DOM.headerMenuDropdown = document.getElementById('headerMenuDropdown');
    // Class selector elements
    DOM.headerClassChip = document.getElementById('headerClassChip');
    DOM.headerClassName = document.getElementById('headerClassName');
    DOM.headerStudentCount = document.getElementById('headerStudentCount');
    DOM.classDropdown = document.getElementById('classDropdown');
    DOM.classDropdownList = document.getElementById('classDropdownList');
    DOM.addNewClassBtn = document.getElementById('addNewClassBtn');
    DOM.manageClassesBtn = document.getElementById('manageClassesBtn');
    // Generation Dashboard
    DOM.headerGenDashboard = document.getElementById('headerGenDashboard');
    DOM.dashModelLabel = document.getElementById('dashModelLabel');
    DOM.dashModelName = document.getElementById('dashModelName');
    DOM.dashValidated = document.getElementById('dashValidated');
    DOM.dashValidatedCount = document.getElementById('dashValidatedCount');
    DOM.dashErrors = document.getElementById('dashErrors');
    DOM.dashErrorCount = document.getElementById('dashErrorCount');
    DOM.dashPending = document.getElementById('dashPending');
    DOM.dashPendingCount = document.getElementById('dashPendingCount');
    DOM.dashGenerating = document.getElementById('dashGenerating');
    DOM.dashProgressFill = document.getElementById('dashProgressFill');
    DOM.dashProgressText = document.getElementById('dashProgressText');
    DOM.dashCancelBtn = document.getElementById('dashCancelBtn');

    DOM.inputSection = document.getElementById('inputSection');
    DOM.massImportTab = document.getElementById('massImportTab');
    DOM.singleStudentTab = document.getElementById('singleStudentTab');
    DOM.massImportSection = document.getElementById('massImportSection');
    DOM.singleStudentFormDiv = document.getElementById('singleStudentFormDiv');
    DOM.actualSingleStudentForm = document.getElementById('actualSingleStudentForm');
    DOM.massData = document.getElementById('massData');
    DOM.massImportPreview = document.getElementById('massImportPreview');
    // Old progress area removed - now using headerGenerationStatus chip
    DOM.importGenerateBtn = document.getElementById('importGenerateBtn');
    DOM.clearImportBtn = document.getElementById('clearImportBtn');
    DOM.loadSampleDataLink = document.getElementById('loadSampleDataLink');
    DOM.dropZone = document.getElementById('dropZone');
    DOM.importFileBtn = document.getElementById('importFileBtn');
    DOM.nomInput = document.getElementById('nom');
    DOM.prenomInput = document.getElementById('prenom');
    DOM.nomError = document.getElementById('nomError');
    DOM.prenomError = document.getElementById('prenomError');
    DOM.singleStudentPeriodInputs = document.getElementById('singleStudentPeriodInputs');


    // Option G: Période courante + Accordéon Historique
    DOM.currentPeriodLabel = document.getElementById('currentPeriodLabel');
    DOM.currentPeriodGrade = document.getElementById('currentPeriodGrade');
    DOM.contextPeriodLabel = document.getElementById('contextPeriodLabel');
    DOM.historyAccordion = document.getElementById('historyAccordion');
    DOM.historyToggle = document.getElementById('historyToggle');
    DOM.historyContent = document.getElementById('historyContent');

    DOM.generationButtonsGroup = document.querySelector('.generation-buttons-group');
    DOM.generateAppreciationBtn = document.getElementById('generateAppreciationBtn');
    DOM.generateAndNextBtn = document.getElementById('generateAndNextBtn');
    DOM.resetFormBtn = document.getElementById('resetFormBtn');
    DOM.cancelEditBtn = document.getElementById('cancelEditBtn');
    DOM.statsHeader = document.getElementById('statsHeader');
    DOM.statsContainer = document.getElementById('statsContainer');
    DOM.outputHeader = document.getElementById('outputHeader');
    DOM.resultsDiv = document.getElementById('outputList');
    DOM.searchInput = document.getElementById('searchInput');
    DOM.avgWordsChip = document.getElementById('avgWordsChip');
    DOM.classEvolutionCard = document.getElementById('evolutionCard');
    DOM.classEvolutionAverageStat = document.getElementById('classEvolutionAverageStat');
    DOM.classEvolutionProgressStat = document.getElementById('classEvolutionProgressStat');
    DOM.classEvolutionStableStat = document.getElementById('classEvolutionStableStat');
    DOM.classEvolutionRegressionStat = document.getElementById('classEvolutionRegressionStat');
    DOM.currentAvgGradeOutput = document.getElementById('currentAvgGradeOutput');
    DOM.previousAvgGradeOutput = document.getElementById('previousAvgGradeOutput');
    DOM.minAvgGradeOutput = document.getElementById('minAvgGradeOutput');
    DOM.maxAvgGradeOutput = document.getElementById('maxAvgGradeOutput');
    DOM.clearAllResultsBtn = document.getElementById('clearAllResultsBtn-shortcut');
    DOM.copyAllBtn = document.getElementById('copyAllBtn-shortcut');
    DOM.regenerateAllBtn = document.getElementById('regenerateAllBtn');
    DOM.regenerateErrorsBtn = document.getElementById('regenerateErrorsBtn-shortcut');
    // retryErrorsFloatingBtn removed - headerRetryErrorsBtn is the single source of truth
    DOM.exportJsonBtn = document.getElementById('exportJsonBtn');
    DOM.exportCsvBtn = document.getElementById('exportCsvBtn');
    DOM.exportPdfBtn = document.getElementById('exportPdfBtn');
    DOM.sortSelect = document.getElementById('sortSelect');
    DOM.fileInput = document.getElementById('fileInput');
    DOM.settingsModal = document.getElementById('appSettingsModal');
    DOM.settingsModal = document.getElementById('appSettingsModal');
    DOM.personalizationModal = document.getElementById('personalizationModal');
    DOM.personalizationBtn = document.getElementById('personalizationBtn');
    DOM.closePersonalizationModalBtn = document.getElementById('closePersonalizationModalBtn');
    DOM.cancelPersonalizationBtn = document.getElementById('cancelPersonalizationBtn');
    DOM.savePersonalizationBtn = document.getElementById('savePersonalizationBtn');
    DOM.closeSettingsModalBtn = document.getElementById('closeSettingsModalBtn');
    DOM.periodSystemRadios = document.querySelectorAll('input[name="periodSystemRadio"]');
    DOM.settingsEvolutionThresholdPositive = document.getElementById('evolutionThresholdPositive');
    DOM.settingsEvolutionThresholdNegative = document.getElementById('evolutionThresholdNegative');
    DOM.suggestionsList = document.getElementById('suggestionsList');
    DOM.resetAllSettingsBtn = document.getElementById('resetAllSettingsBtn');
    DOM.saveSettingsBtn = document.getElementById('saveSettingsBtn');
    DOM.cancelSettingsBtn = document.getElementById('cancelSettingsBtn');
    DOM.personalizationToggle = document.getElementById('personalizationToggle');
    DOM.enableApiFallbackToggle = document.getElementById('enableApiFallbackToggle');
    DOM.advancedTabContent = document.getElementById('advancedTabContent');
    DOM.aiModelSelect = document.getElementById('aiModelSelect');
    DOM.openaiApiKey = document.getElementById('openaiApiKey');
    DOM.openaiApiKeyGroup = document.getElementById('openaiApiKeyGroup');
    DOM.openaiApiKeyError = document.getElementById('openaiApiKeyError');
    DOM.openaiApiKeyValidationIcon = document.getElementById('openaiApiKeyValidationIcon');
    DOM.validateOpenaiApiKeyBtn = document.getElementById('validateOpenaiApiKeyBtn');
    DOM.googleApiKey = document.getElementById('googleApiKey');
    DOM.googleApiKeyGroup = document.getElementById('googleApiKeyGroup');
    DOM.googleApiKeyError = document.getElementById('googleApiKeyError');
    DOM.googleApiKeyHint = document.getElementById('googleApiKeyHint');
    DOM.googleApiKeyValidationIcon = document.getElementById('googleApiKeyValidationIcon');
    DOM.validateGoogleApiKeyBtn = document.getElementById('validateGoogleApiKeyBtn');
    DOM.openrouterApiKey = document.getElementById('openrouterApiKey');
    DOM.openrouterApiKeyGroup = document.getElementById('openrouterApiKeyGroup');
    DOM.openrouterApiKeyError = document.getElementById('openrouterApiKeyError');
    DOM.openrouterApiKeyValidationIcon = document.getElementById('openrouterApiKeyValidationIcon');
    DOM.validateOpenrouterApiKeyBtn = document.getElementById('validateOpenrouterApiKeyBtn');
    // Anthropic (Claude)
    DOM.anthropicApiKey = document.getElementById('anthropicApiKey');
    DOM.anthropicApiKeyGroup = document.getElementById('anthropicApiKeyGroup');
    DOM.anthropicApiKeyError = document.getElementById('anthropicApiKeyError');
    DOM.anthropicApiKeyValidationIcon = document.getElementById('anthropicApiKeyValidationIcon');
    DOM.validateAnthropicApiKeyBtn = document.getElementById('validateAnthropicApiKeyBtn');
    // Mistral (API directe)
    DOM.mistralApiKey = document.getElementById('mistralApiKey');
    DOM.mistralApiKeyGroup = document.getElementById('mistralApiKeyGroup');
    DOM.mistralApiKeyError = document.getElementById('mistralApiKeyError');
    DOM.mistralApiKeyValidationIcon = document.getElementById('mistralApiKeyValidationIcon');
    DOM.validateMistralApiKeyBtn = document.getElementById('validateMistralApiKeyBtn');
    // Ollama (IA locale)
    DOM.ollamaEnabledToggle = document.getElementById('ollamaEnabledToggle');
    DOM.ollamaBaseUrl = document.getElementById('ollamaBaseUrl');
    DOM.validateOllamaBtn = document.getElementById('validateOllamaBtn');
    DOM.ollamaValidationIcon = document.getElementById('ollamaValidationIcon');
    DOM.ollamaError = document.getElementById('ollamaError');
    DOM.ollamaModelsInfo = document.getElementById('ollamaModelsInfo');
    DOM.ollamaModelsText = document.getElementById('ollamaModelsText');
    DOM.ollamaApiStatus = document.getElementById('ollamaApiStatus');
    DOM.sessionTokens = document.getElementById('sessionTokens');
    DOM.testAllConnectionsBtn = document.getElementById('testAllConnectionsBtn');
    DOM.activeModelName = document.getElementById('activeModelName');
    DOM.studentDetailsModal = document.getElementById('studentDetailsModal');
    DOM.studentDetailsModalTitle = document.getElementById('studentDetailsModalTitle');
    DOM.closeStudentDetailsModalBtn = document.getElementById('closeStudentDetailsModalBtn');
    DOM.nextStudentBtn = document.getElementById('nextStudentBtn');
    DOM.prevStudentBtn = document.getElementById('prevStudentBtn');
    DOM.modalStudentPosition = document.getElementById('modalStudentPosition');
    DOM.detailsPeriodsContainer = document.getElementById('details-periods-container');
    DOM.technicalDetailsAccordion = document.getElementById('technicalDetailsAccordion');
    DOM.detailsAppreciationPrompt = document.getElementById('detailsAppreciationPrompt');
    DOM.detailsSWPrompt = document.getElementById('detailsSWPrompt');
    DOM.detailsNSPrompt = document.getElementById('detailsNSPrompt');
    DOM.detailsTokenUsageSection = document.getElementById('detailsTokenUsageSection');
    DOM.detailsTokenUsageContent = document.getElementById('detailsTokenUsageContent');
    DOM.strengthsWeaknessesSection = document.getElementById('strengthsWeaknessesSection');
    DOM.strengthsWeaknessesContent = document.getElementById('strengthsWeaknessesContent');
    DOM.nextStepsSection = document.getElementById('nextStepsSection');
    DOM.nextStepsList = document.getElementById('nextStepsList');
    DOM.closeDetailsModalBtn = document.getElementById('closeDetailsModalBtn');
    DOM.refinementModal = document.getElementById('refinementModal');
    DOM.closeRefinementModalBtn = document.getElementById('closeRefinementModalBtn');
    DOM.refinementModalTitle = document.getElementById('refinementModalTitle');
    DOM.originalAppreciationText = document.getElementById('originalAppreciationText');
    DOM.suggestedAppreciationText = document.getElementById('suggestedAppreciationText');
    DOM.originalWordCount = document.getElementById('originalWordCount');
    DOM.suggestedWordCount = document.getElementById('suggestedWordCount');
    DOM.refineStyleOptions = document.getElementById('refineStyleOptions');
    DOM.swapRefinementBtn = document.getElementById('swapRefinementBtn');
    DOM.cancelRefinementBtn = document.getElementById('cancelRefinementBtn');
    DOM.applyRefinedAppreciationBtn = document.getElementById('applyRefinedAppreciationBtn');
    DOM.resetRefinementBtn = document.getElementById('resetRefinementBtn');
    DOM.closeRefinementFooterBtn = document.getElementById('closeRefinementFooterBtn');
    DOM.prevRefinementStudentBtn = document.getElementById('prevRefinementStudentBtn');
    DOM.nextRefinementStudentBtn = document.getElementById('nextRefinementStudentBtn');
    DOM.refinementContext = document.getElementById('refinementContext');
    DOM.refineWithContextBtn = document.getElementById('refineWithContextBtn');
    DOM.refinementErrorActions = document.getElementById('refinement-error-actions');
    DOM.helpModal = document.getElementById('helpModal');
    DOM.closeHelpModalBtn = document.getElementById('closeHelpModalBtn');
    DOM.closeHelpModalFooterBtn = document.getElementById('closeHelpModalFooterBtn');
    DOM.linkGithub = document.getElementById('linkGithub');
    DOM.linkKofi = document.getElementById('linkKofi');
    DOM.linkFeedback = document.getElementById('linkFeedback');
    DOM.linkLicense = document.getElementById('linkLicense');
    DOM.closeClassAnalysisFooterBtn = document.getElementById('closeClassAnalysisFooterBtn');
    DOM.helpGoToSettingsBtn = document.getElementById('helpGoToSettingsBtn');
    DOM.helpFormatSelector = document.getElementById('helpFormatSelector');
    DOM.relaunchWelcomeGuideBtn = document.getElementById('relaunchWelcomeGuideBtn');
    DOM.loadingOverlay = document.getElementById('loadingOverlay');
    DOM.loadingText = document.getElementById('loadingText');
    DOM.pwaInstallBanner = document.getElementById('pwaInstallBanner');
    DOM.pwaInstallSeparator = document.getElementById('pwaInstallSeparator');
    DOM.installPwaBtn = document.getElementById('installPwaBtn');
    DOM.pwaInstallBtn = document.getElementById('pwaInstallBtn');
    DOM.pwaLaterBtn = document.getElementById('pwaLaterBtn');
    DOM.pwaDismissBtn = document.getElementById('pwaDismissBtn');
    DOM.emptyStateCard = document.getElementById('empty-state-card');
    DOM.noResultsMessage = document.getElementById('noResultsMessage');
    DOM.importSettingsBtn = document.getElementById('importSettingsBtn');
    DOM.exportSettingsBtn = document.getElementById('exportSettingsBtn');
    DOM.exportFullBackupBtn = document.getElementById('exportFullBackupBtn');
    DOM.importFullBackupBtn = document.getElementById('importFullBackupBtn');
    DOM.importBackupInput = document.getElementById('importBackupInput');
    // Cloud sync elements
    DOM.cloudSeparator = document.getElementById('cloudSeparator');
    DOM.connectGoogleBtn = document.getElementById('connectGoogleBtn');
    DOM.disconnectGoogleBtn = document.getElementById('disconnectGoogleBtn');
    DOM.connectDropboxBtn = document.getElementById('connectDropboxBtn');
    DOM.googleSyncStatus = document.getElementById('googleSyncStatus');
    DOM.googleSyncEmail = document.getElementById('googleSyncEmail');
    DOM.dropboxSyncStatus = document.getElementById('dropboxSyncStatus');
    DOM.syncStatusBar = document.getElementById('syncStatusBar');
    DOM.syncRgpdWarning = document.getElementById('syncRgpdWarning');
    // Cloud sync header indicator
    DOM.cloudSyncIndicator = document.getElementById('cloudSyncIndicator');
    DOM.welcomeModal = document.getElementById('welcomeModal');
    DOM.closeWelcomeModalBtn = document.getElementById('closeWelcomeModalBtn');
    DOM.welcomeNextStepInfo = document.getElementById('welcome-next-step-info');
    DOM.welcomePrevBtn = document.getElementById('welcomePrevBtn');
    DOM.welcomeNextBtn = document.getElementById('welcomeNextBtn');
    DOM.welcomeLoadSampleBtn = document.getElementById('welcomeLoadSampleBtn');
    DOM.welcomeFinishBtn = document.getElementById('welcomeFinishBtn');
    DOM.welcomeFinishAndHideBtn = document.getElementById('welcomeFinishAndHideBtn');
    DOM.welcomeFinishOptions = document.getElementById('welcome-finish-options');
    DOM.welcomeDots = document.getElementById('welcome-dots');
    DOM.welcomeApiKeyInput = document.getElementById('welcomeApiKeyInput');
    DOM.welcomeValidateApiKeyBtn = document.getElementById('welcomeValidateApiKeyBtn');
    DOM.welcomeApiKeyError = document.getElementById('welcomeApiKeyError');
    DOM.welcomeSkipApiKeyBtn = document.getElementById('welcomeSkipApiKeyBtn');
    DOM.actionsIrreversiblesContainer = document.getElementById('actions-irreversibles-container');
    DOM.backToTopBtn = document.getElementById('backToTopBtn');
    DOM.analyzeClassBtn = document.getElementById('analyzeClassBtn');
    DOM.classAnalysisModal = document.getElementById('classAnalysisModal');
    DOM.classAnalysisModalTitle = document.getElementById('classAnalysisModalTitle');
    DOM.closeClassAnalysisModalBtn = document.getElementById('closeClassAnalysisModalBtn');
    DOM.classAnalysisEditableText = document.getElementById('classAnalysisEditableText');
    DOM.classAnalysisWordCount = document.getElementById('classAnalysisWordCount');
    DOM.classAnalysisOptions = document.getElementById('classAnalysisOptions');
    DOM.classAnalysisSourceStatsContainer = document.getElementById('classAnalysisSourceStatsContainer');
    DOM.classAnalysisStatsList = document.getElementById('classAnalysisStatsList');
    DOM.classAnalysisActions = document.getElementById('classAnalysisActions');
    DOM.copyClassAnalysisBtn = document.getElementById('copyClassAnalysisBtn');
    DOM.copyAnalysisBtn = document.getElementById('copyAnalysisBtn');
    DOM.actionsBtnToggle = document.getElementById('actionsBtnToggle');
    DOM.actionsDropdown = document.querySelector('.actions-dropdown');
    DOM.actionsDropdownContent = document.querySelector('.actions-dropdown-content');
    DOM.iaStyleHeader = document.getElementById('iaStyleHeader');
    DOM.iaStyleInstructions = document.getElementById('iaStyleInstructions');
    DOM.iaStyleInstructionsToggle = document.getElementById('iaStyleInstructionsToggle');
    DOM.iaDiscipline = document.getElementById('iaDiscipline');
    DOM.iaLengthSlider = document.getElementById('iaLengthSlider');
    DOM.iaLengthSliderValue = document.getElementById('iaLengthSliderValue');
    DOM.iaToneSlider = document.getElementById('iaToneSlider');
    DOM.genericSubjectInfo = document.getElementById('genericSubjectInfo');
    DOM.previewStudentSelect = document.getElementById('previewStudentSelect');
    DOM.refreshPreviewBtn = document.getElementById('refreshPreviewBtn');
    DOM.settingsPreviewResult = document.getElementById('settingsPreviewResult');
    DOM.settingsPreviewPrompt = document.getElementById('settingsPreviewPrompt');
    DOM.settingsPreviewStudentData = document.getElementById('settingsPreviewStudentData');
    DOM.settingsPreviewWordCount = document.getElementById('settingsPreviewWordCount');
    DOM.settingsPreviewTokenCount = document.getElementById('settingsPreviewTokenCount');
    DOM.previewMetaContainer = document.getElementById('previewMetaContainer');
    DOM.iaLengthSliderValue = document.getElementById('iaLengthSliderValue');


    DOM.previewStatus = document.getElementById('previewStatus');
    DOM.settingsPrivacyAnonymizeToggle = document.getElementById('settingsPrivacyAnonymizeToggle');

    DOM.personalizationToggle = document.getElementById('personalizationToggle');
    DOM.subjectCustomizationPanel = document.getElementById('subject-customization-panel');
    DOM.massImportApiKeyWarning = document.getElementById('massImportApiKeyWarning');
    DOM.loadStudentSelect = document.getElementById('loadStudentSelect');
    DOM.brickDropdown = document.getElementById('brickDropdown');
    DOM.brickDropdownRefinement = document.getElementById('brickDropdownRefinement');
    DOM.activeFilterInfo = document.getElementById('activeFilterInfo');
    // massImportErrorActions removed - errors now shown in headerGenerationStatus chip
    DOM.importPreviewModal = document.getElementById('importPreviewModal');
    DOM.importPreviewModalTitle = document.getElementById('importPreviewModalTitle');
    DOM.closeImportPreviewModalBtn = document.getElementById('closeImportPreviewModalBtn');
    DOM.importSummaryText = document.getElementById('import-summary-text');
    DOM.importSavedFormatInfo = document.getElementById('importSavedFormatInfo');
    DOM.importStrategyContainer = document.getElementById('import-strategy-container');
    DOM.strategyMergeRadio = document.getElementById('strategyMerge');
    DOM.strategyReplaceRadio = document.getElementById('strategyReplace');
    DOM.importPreviewContainer = document.getElementById('import-preview-container');
    DOM.importPreviewGrid = document.querySelector('.import-preview-grid');
    DOM.importPreviewReplaceWarning = document.getElementById('import-preview-replace-warning');
    DOM.newStudentsList = document.getElementById('new-students-list');
    DOM.updatedStudentsList = document.getElementById('updated-students-list');
    DOM.departedStudentsList = document.getElementById('departed-students-list');
    DOM.newCount = document.getElementById('new-count');
    DOM.updatedCount = document.getElementById('updated-count');
    DOM.departedCount = document.getElementById('departed-count');
    DOM.mappingHeaders = document.getElementById('mappingHeaders');
    DOM.mappingPreviewData = document.getElementById('mappingPreviewData');
    DOM.separatorSelect = document.getElementById('separatorSelect');
    DOM.customSeparatorInput = document.getElementById('customSeparatorInput');
    DOM.saveMappingCheckbox = document.getElementById('saveMappingCheckbox');
    DOM.cancelImportPreviewBtn = document.getElementById('cancelImportPreviewBtn');
    DOM.confirmImportPreviewBtn = null; // Deprecated - import only mode now
    DOM.importOnlyBtn = document.getElementById('importOnlyBtn');
    DOM.generateAllPendingBtn = document.getElementById('generateAllPendingBtn');
    DOM.pendingCountBadge = document.getElementById('pendingCountBadge');
    DOM.updateDirtyBtn = document.getElementById('updateDirtyBtn');
    DOM.dirtyCountBadge = document.getElementById('dirtyCountBadge');
    DOM.singleStudentActions = document.getElementById('singleStudentActions');

    DOM.inputPanelsWrapper = document.querySelector('.input-panels-wrapper');
    DOM.massImportActions = document.getElementById('massImportActions');

    // Rapport final (en développement uniquement)

}
