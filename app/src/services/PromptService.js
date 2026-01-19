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
        const genderLabel = gender === 'féminin' ? 'féminin' : gender === 'masculin' ? 'masculin' : 'non spécifié';

        const promptParts = [];

        // Introduction du prompt (simplifié sans nom de matière)
        promptParts.push(`Rédige l'appréciation de l'élève ${this.PRENOM_PLACEHOLDER} pour le '${Utils.getPeriodLabel(currentPeriod, true)}'.`);


        const styleParts = [];

        const toneMap = {
            1: 'très encourageant et positif',
            2: 'encourageant et bienveillant',
            3: 'équilibré, factuel et neutre',
            4: 'strict mais juste',
            5: 'très strict et formel'
        };
        styleParts.push(`Adopte un ton ${toneMap[iaConfig.tone] || toneMap[3]}.`);

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

        if (iaConfig.styleInstructions) {
            styleParts.push(`Respecte ces habitudes de rédaction : "${iaConfig.styleInstructions}"`);
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
            const g = typeof d.grade === 'number' ? d.grade.toFixed(1).replace('.', ',') : 'N/A';
            const evalCount = typeof d.evaluationCount === 'number' ? ` (${d.evaluationCount} éval.)` : '';
            // Pour la période courante, on n'inclut pas l'appréciation existante
            const isCurrentPeriod = p === currentPeriod;
            const appText = isCurrentPeriod ? 'À générer' : (d.appreciation || 'N/A');
            return `Période ${p} -> Moy : ${g}${evalCount}, App : "${appText}"`;
        }).join('\n');

        // Use StatsService for evolution analysis
        const evolutions = StatsService.analyserEvolution(periods);
        const evolutionText = this._formatEvolutions(evolutions);

        // Anonymisation : on n'envoie plus le nom complet, seulement les données scolaires
        // On n'inclut la ligne Statuts que si l'élève a des statuts
        const statusLine = (statuses && statuses.length > 0) ? `\nStatuts : ${statuses.join(', ')}` : '';

        // NOUVEAU: Utiliser le contexte de la période courante avec fallback sur negativeInstructions (legacy)
        const periodContext = periods?.[currentPeriod]?.context;
        const contextToUse = periodContext ?? negativeInstructions;
        const specificInfoLine = contextToUse ? `\n"${contextToUse}"` : '';

        // === JOURNAL DE BORD: Synthesis for prompt ===
        // Injects tag counts and recent notes to enrich AI context
        const studentId = studentData.id;
        const journalSynthesis = studentId ? JournalManager.synthesizeForPrompt(studentId, currentPeriod) : '';
        const journalLine = journalSynthesis ? `\n\nObservations du professeur : ${journalSynthesis}` : '';

        promptParts.push(`--- DONNÉES DE L'ÉLÈVE ---\nÉlève : ${this.PRENOM_PLACEHOLDER} (élève ${genderLabel})${statusLine}${specificInfoLine}${journalLine}\nPériode à évaluer : ${currentPeriod}\n\nHistorique :\n${periodsInfo}\n\n${evolutionText}`);

        // Instruction finale simple (déplacée dans les instructions de style)
        // promptParts.push(`Génère l'appréciation directement, sans titre ni préambule.`);

        const appreciationPrompt = promptParts.join('\n\n');

        // [FIX] Use period-specific appreciation for analysis prompts
        // The appreciation to analyze should be from the current period, not a legacy global field
        const currentPeriodAppreciation = periods?.[currentPeriod]?.appreciation || '';

        // Build periods info for analysis - use stored appreciation per period
        let periodsInfoForAnalysis = relevantPeriods.map(p => {
            const d = periods[p] || {};
            const g = typeof d.grade === 'number' ? d.grade.toFixed(1).replace('.', ',') : 'N/A';
            const evalCount = typeof d.evaluationCount === 'number' ? ` (${d.evaluationCount} éval.)` : '';
            return `Période ${p} -> Moy : ${g}${evalCount}, App : "${d.appreciation || 'N/A'}"`;
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

    getRefinementPrompt(type, original, context = null) {
        const ctx = context || (DOM.refinementContext ? DOM.refinementContext.value.trim() : '');
        const wordCount = Utils.countWords(original);
        const base = 'Sans "performance". Texte seul.';
        let instruction = '';

        switch (type) {
            case 'polish':
                instruction = `Peaufine : corrige fautes, améliore fluidité, ton pro. Garde sens et faits. ${base}\n\n"${original}"`;
                break;
            case 'variations':
                instruction = `Reformule différemment, même sens, ~${wordCount} mots. ${base}\n\n"${original}"`;
                break;
            case 'context':
                instruction = `Intègre ce contexte : "${ctx}". Vise ~${Math.round(wordCount * 1.1)} mots. ${base}\n\n"${original}"`;
                break;
            case 'detailed':
                instruction = `Développe les points, ~${Math.round(wordCount * 1.15)} mots, sans nouvelles infos. ${base}\n\n"${original}"`;
                break;
            case 'concise':
                instruction = `Plus concis, ~${Math.round(wordCount * 0.85)} mots, garde l'essentiel. ${base}\n\n"${original}"`;
                break;
            case 'encouraging':
                instruction = `Plus encourageant et positif, ~${wordCount} mots. ${base}\n\n"${original}"`;
                break;
            case 'formal':
                instruction = `Plus formel et soutenu, ~${wordCount} mots. ${base}\n\n"${original}"`;
                break;
            case 'default':
            default:
                instruction = `Reformule. ${base}\n\n"${original}"`;
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

