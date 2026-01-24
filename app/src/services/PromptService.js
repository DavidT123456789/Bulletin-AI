import { appState } from '../state/State.js';
import { DEFAULT_IA_CONFIG, DEFAULT_PROMPT_TEMPLATES } from '../config/Config.js';
import { Utils } from '../utils/Utils.js';
import { DOM } from '../utils/DOM.js';
import { StatsService } from './StatsService.js';
import { JournalManager } from '../managers/JournalManager.js';

export const PromptService = {
    /**
     * Placeholder utilisé pour anonymiser le prénom dans les prompts
     * @constant {string}
     */
    PRENOM_PLACEHOLDER: '[PRÉNOM]',

    getAllPrompts(studentData, overrideConfig = null) {
        const { nom, prenom, statuses, periods, currentPeriod, negativeInstructions } = studentData;

        // Simplifié: utiliser MonStyle si personnalisation activée, sinon Générique
        // Simplifié: utiliser MonStyle si personnalisation activée, sinon Générique
        // [FIX] Toujours vérifier 'MonStyle' car c'est là que sont sauvegardés les réglages "Style IA" de l'utilisateur
        // Si l'utilisateur a modifié le style, il s'attend à ce qu'il soit appliqué partout
        const usePersonalization = appState.useSubjectPersonalization;
        let iaConfig;

        if (overrideConfig) {
            iaConfig = overrideConfig;
        } else {
            // Priorité : 
            // 1. 'MonStyle' si présent (c'est le "Custom Profile" de l'utilisateur)
            // 2. 'Générique' édité dans appState
            // 3. Default config
            const customStyle = appState.subjects?.['MonStyle']?.iaConfig;
            const genericStyle = appState.subjects?.['Générique']?.iaConfig;

            iaConfig = customStyle || genericStyle || DEFAULT_PROMPT_TEMPLATES["Générique"].iaConfig;
        }

        // Anonymisation RGPD : on utilise [PRÉNOM] au lieu du vrai prénom
        // Le genre est détecté pour permettre l'accord grammatical correct
        const gender = Utils.detectGender(prenom);
        // When gender unknown, favor impersonal constructions
        const genderLabel = gender === 'féminin' ? 'féminin'
            : gender === 'masculin' ? 'masculin'
                : 'non déterminé - nommer une seule fois puis utiliser des tournures impersonnelles (ex: "Sa participation...", "Il convient de...")';

        const promptParts = [];

        // Introduction du prompt (avec discipline si renseignée)
        const disciplineContext = iaConfig.discipline
            ? ` en ${iaConfig.discipline}`
            : '';
        promptParts.push(`Rédige l'appréciation de l'élève ${this.PRENOM_PLACEHOLDER}${disciplineContext} pour le '${Utils.getPeriodLabel(currentPeriod, true)}'.`);

        // Instruction critique sur la cohérence note/appréciation (placée au début pour plus d'impact)
        promptParts.push(`L’appréciation doit être cohérente avec le niveau de réussite suggéré par la moyenne, tout en tenant compte du contexte fourni sur l’élève.`);


        const styleParts = [];

        const toneMap = {
            1: 'très encourageant et positif',
            2: 'bienveillant et constructif',
            3: null, // Mode libre: l'IA adapte selon le contexte
            4: 'exigeant mais constructif',
            5: 'strict et formel'
        };
        const toneInstruction = toneMap[iaConfig.tone];
        if (toneInstruction) {
            styleParts.push(`Adopte un ton ${toneInstruction}.`);
        }

        const voiceInstruction = {
            'je': 'Utilise impérativement la première personne du singulier ("Je", "J\'observe", "mon avis").',
            'nous': 'Utilise impérativement la première personne du pluriel ("Nous", "Nous notons", "notre avis") ou une forme impersonnelle institutionnelle.',
        }[iaConfig.voice];

        if (voiceInstruction) {
            styleParts.push(voiceInstruction);
        }

        if (iaConfig.length) {
            styleParts.push(`Rédige une appréciation d'environ ${iaConfig.length} mots.`);
        }
        styleParts.push(`Ne mentionne pas les notes chiffrées (moyennes) dans le texte.`);
        styleParts.push(`Génère l'appréciation directement, sans titre ni préambule.`);

        if (iaConfig.styleInstructions && iaConfig.enableStyleInstructions !== false) {
            styleParts.push(`Note : ${iaConfig.styleInstructions}`);
        }

        promptParts.push('--- INSTRUCTIONS DE STYLE ---\n' + styleParts.join('\n'));



        // Anonymisation : on n'envoie PAS le nom de famille, seulement les notes
        // On n'envoie que les périodes jusqu'à la période à évaluer (incluse)
        const allPeriods = Utils.getPeriods();
        const currentPeriodIndex = allPeriods.indexOf(currentPeriod);
        const relevantPeriods = allPeriods.slice(0, currentPeriodIndex + 1);
        // [FIX] N'inclure l'appréciation que pour les périodes PRÉCÉDENTES
        // L'appréciation de la période courante ne doit PAS être incluse pour éviter
        // que l'IA ne s'inspire de l'ancienne appréciation lors d'une régénération
        let periodsInfo = relevantPeriods.map(p => {
            const d = periods[p] || {};
            const g = typeof d.grade === 'number' ? d.grade.toFixed(1).replace('.', ',') + '/20' : 'N/A';
            const evalCount = typeof d.evaluationCount === 'number' ? ` (${d.evaluationCount} éval.)` : '';
            // Pour la période courante, on n'inclut pas l'appréciation existante
            const isCurrentPeriod = p === currentPeriod;
            // [FIX] Use brackets for instruction, quotes only for actual appreciation text
            const appText = isCurrentPeriod ? '[à générer]' : `"${d.appreciation || 'N/A'}"`;
            return `${p} : Moy ${g}${evalCount}, App ${appText}`;
        }).join('\n');

        // Use StatsService for evolution analysis
        // [FIX] Filter evolutions to only include those ENDING at or before currentPeriod
        // For S1/T1 (first period), there should be NO evolution to display
        const allEvolutions = StatsService.analyserEvolution(periods);
        const filteredEvolutions = allEvolutions.filter(e => {
            // Evolution format: "T1-T2" or "S1-S2" - extract target period
            const targetPeriod = e.periode.split('-')[1];
            const targetIndex = allPeriods.indexOf(targetPeriod);
            // Only include if target period index <= current period index
            return targetIndex >= 0 && targetIndex <= currentPeriodIndex;
        });
        const evolutionText = this._formatEvolutions(filteredEvolutions);

        // Anonymisation : on n'envoie plus le nom complet, seulement les données scolaires
        // On n'inclut la ligne Statuts que si l'élève a des statuts
        const statusLine = (statuses && statuses.length > 0) ? `\nStatuts : ${statuses.join(', ')}` : '';

        // NOUVEAU: Utiliser le contexte de la période courante avec fallback sur negativeInstructions (legacy)
        const periodContext = periods?.[currentPeriod]?.context;
        const contextToUse = periodContext ?? negativeInstructions;
        const specificInfoLine = contextToUse ? `\nContexte : "${contextToUse}"` : '';

        // === JOURNAL DE BORD: Synthesis for prompt ===
        // Injects tag counts and recent notes to enrich AI context
        const studentId = studentData.id;
        const journalSynthesis = studentId ? JournalManager.synthesizeForPrompt(studentId, currentPeriod) : '';
        const journalLine = journalSynthesis ? `\n\nObservations du professeur : ${journalSynthesis}` : '';

        promptParts.push(`--- DONNÉES DE L'ÉLÈVE ---\nÉlève : ${this.PRENOM_PLACEHOLDER} (${genderLabel})${statusLine}${specificInfoLine}${journalLine}\nPériode à évaluer : ${currentPeriod}\n\nPériodes :\n${periodsInfo}\n\n${evolutionText}`);

        // Instruction finale simple (déplacée dans les instructions de style)
        // promptParts.push(`Génère l'appréciation directement, sans titre ni préambule.`);

        const appreciationPrompt = promptParts.join('\n\n');

        // [FIX] Use period-specific appreciation for analysis prompts
        // The appreciation to analyze should be from the current period, not a legacy global field
        const currentPeriodAppreciation = periods?.[currentPeriod]?.appreciation || '';

        // Build periods info for analysis - use stored appreciation per period
        let periodsInfoForAnalysis = relevantPeriods.map(p => {
            const d = periods[p] || {};
            const g = typeof d.grade === 'number' ? d.grade.toFixed(1).replace('.', ',') + '/20' : 'N/A';
            const evalCount = typeof d.evaluationCount === 'number' ? ` (${d.evaluationCount} éval.)` : '';
            return `${p} : Moy ${g}${evalCount}, App "${d.appreciation || 'N/A'}"`;
        }).join('\n');

        // Analysis prompts - use the current period's appreciation as reference
        // Enriched with student context for more accurate insights

        // Build condensed student context for analysis
        const analysisContextParts = [];

        // Add statuses if present
        if (statuses && statuses.length > 0) {
            analysisContextParts.push(`Statuts : ${statuses.join(', ')}`);
        }

        // Add period context if present
        const periodContextForAnalysis = periods?.[currentPeriod]?.context;
        if (periodContextForAnalysis) {
            analysisContextParts.push(`Contexte : "${periodContextForAnalysis}"`);
        }

        // Add journal synthesis for richer insights
        const journalSynthesisForAnalysis = studentId ? JournalManager.synthesizeForPrompt(studentId, currentPeriod) : '';
        if (journalSynthesisForAnalysis) {
            analysisContextParts.push(`Observations : ${journalSynthesisForAnalysis}`);
        }

        const analysisContext = analysisContextParts.length > 0
            ? '\n' + analysisContextParts.join('\n')
            : '';

        const swPrompt = `Analyse pour la période '${currentPeriod}'. Liste 2-3 points forts puis 2-3 points faibles.
Format : "### Points Forts" puis "### Points Faibles". Pas d'intro ni conclusion.

Données de l'élève :
${periodsInfoForAnalysis}
${evolutionText}${analysisContext}

Appréciation de référence : "${currentPeriodAppreciation || 'N/A'}"`;

        const nsPrompt = `Suggère 3 pistes d'amélioration concrètes. Liste numérotée, bref et direct. Pas d'intro ni conclusion.

Données de l'élève :
${periodsInfoForAnalysis}
${evolutionText}${analysisContext}

Appréciation de référence : "${currentPeriodAppreciation || 'N/A'}"`;

        return { appreciation: appreciationPrompt, sw: swPrompt, ns: nsPrompt };
    },

    /**
     * Generates a refinement prompt for appreciation modifications
     * @param {string} type - Type of refinement (concise, detailed, encouraging, polish, variations, formal, context)
     * @param {string} original - The original text to refine
     * @param {Object} options - Optional configuration
     * @param {string} options.context - Additional context to integrate
     * @returns {string} The formatted prompt for AI
     */
    getRefinementPrompt(type, original, options = {}) {
        const ctx = options.context || options || (DOM.refinementContext ? DOM.refinementContext.value.trim() : '');
        // Handle legacy call signature: getRefinementPrompt(type, original, contextString)
        const contextStr = typeof ctx === 'string' ? ctx : '';

        const wordCount = Utils.countWords(original);
        // Strict instruction: raw text only, no formatting, no commentary
        const base = 'IMPORTANT: Réponds uniquement avec le texte brut. Aucune introduction, aucun commentaire, aucun formatage.';
        let instruction = '';

        switch (type) {
            case 'polish':
                // Same length, improved style
                instruction = `Peaufine cette appréciation : corrige fautes, améliore fluidité, ton pro. Garde sens et longueur.\n\n${original}\n\n${base}`;
                break;
            case 'variations':
                // Same length, different wording
                instruction = `Reformule cette appréciation différemment (vocabulaire, structure), même sens, environ ${wordCount} mots.\n\n${original}\n\n${base}`;
                break;
            case 'detailed':
                // +20% - Symmetric with concise (-20%)
                instruction = `Développe les points de cette appréciation, environ ${Math.round(wordCount * 1.20)} mots. N'invente pas de faits.\n\n${original}\n\n${base}`;
                break;
            case 'concise':
                // -20% reduction
                instruction = `Rends cette appréciation plus concise, environ ${Math.round(wordCount * 0.80)} mots. Garde l'essentiel.\n\n${original}\n\n${base}`;
                break;
            case 'encouraging':
                // Same length, warmer tone
                instruction = `Reformule cette appréciation avec un ton plus encourageant et positif, environ ${wordCount} mots.\n\n${original}\n\n${base}`;
                break;
            case 'default':
            default:
                instruction = `Reformule cette appréciation.\n\n${original}\n\n${base}`;
        }
        return instruction;
    },

    /**
     * Formate les données d'évolution en texte concis et lisible pour l'IA
     * Remplace le JSON brut coûteux en tokens
     * @param {Array} evolutions - Tableau issu de StatsService.analyserEvolution
     * @returns {string} - Texte formaté (ex: "Évolution T1->T2: +1.5 pts")
     * @private
     */
    _formatEvolutions(evolutions) {
        if (!evolutions || evolutions.length === 0) return '';

        // Mapping des types d'évolution vers des descriptions textuelles
        const descriptions = {
            'very-positive': 'Progression notable',
            'positive': 'Progression',
            'stable': 'Stable',
            'negative': 'Baisse',
            'very-negative': 'Baisse prononcée'
        };

        const lines = evolutions.map(e => {
            const periodeStr = e.periode.replace('-', '->');
            const sign = e.valeur > 0 ? '+' : '';
            const desc = descriptions[e.type] || 'Stable';
            return `Évolution ${periodeStr} : ${desc} (${sign}${e.valeur} pts)`;
        });

        return lines.join('\n');
    }
};

