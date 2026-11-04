import { appState } from '../state/State.js';
import { DEFAULT_IA_CONFIG, DEFAULT_PROMPT_TEMPLATES } from '../config/Config.js';
import {
    resolveStudentStatus,
    GDPR_SENSITIVE_STATUS_PATTERN,
    DEFAULT_GDPR_SENSITIVE_PROMPT_INSTRUCTION
} from '../config/academicConstants.js';
import { Utils } from '../utils/Utils.js';
import { StatsService } from './StatsService.js';
import { LEVELS, detectLevelFromName } from '../utils/LevelDetector.js';
import { JournalManager } from '../managers/JournalManager.js';

export const PromptService = {
    /**
     * Préfixe de version des empreintes de prompt : les empreintes d'un format antérieur
     * ne sont pas comparables et ne doivent pas déclencher d'alerte « Mettre à jour ».
     * @constant {string}
     */
    PROMPT_HASH_PREFIX: 'v3:',
    /**
     * Placeholder utilisé pour anonymiser le prénom dans les prompts
     * @constant {string}
     */
    PRENOM_PLACEHOLDER: '[PRÉNOM]',

    /**
     * Placeholder utilisé pour anonymiser le nom de famille dans les textes libres
     * @constant {string}
     */
    NOM_PLACEHOLDER: '[NOM]',

    /**
     * Cache pour les statistiques de classe calculées
     * @type {Map<string, string>}
     */
    _classStatsCache: new Map(),

    /**
     * Construit un motif regex insensible à la casse et aux accents pour un jeton nominal.
     * @param {string} token
     * @returns {string}
     * @private
     */
    _buildAccentInsensitivePattern(token) {
        const charMap = {
            a: '[aàáâãäåāăą]',
            c: '[cçćĉċč]',
            e: '[eèéêëēĕėęě]',
            i: '[iìíîïĩīĭįı]',
            n: '[nñńņň]',
            o: '[oòóôõöøōŏő]',
            u: '[uùúûüũūŭůűų]',
            y: '[yýÿŷ]'
        };
        const normalized = token.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        let pattern = '';
        for (let i = 0; i < normalized.length; i++) {
            const ch = normalized[i];
            const lower = ch.toLowerCase();
            if (charMap[lower]) {
                pattern += charMap[lower];
            } else if (/[\s-]/.test(ch)) {
                pattern += '[\\s-]+';
            } else {
                pattern += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            }
        }
        return pattern;
    },

    /**
     * Supprime ou pseudonymise toute occurrence du prénom et du nom de l'élève dans un texte libre.
     * Le nom de famille est systématiquement masqué ; le prénom est masqué lorsque l'anonymisation est active.
     * @param {string} text - Texte libre (appréciation passée, observation, note du journal, contexte)
     * @param {Object} [identity] - Identité de l'élève ({ prenom, nom })
     * @param {Object} [options] - Options ({ anonymizePrenom })
     * @returns {string} Texte nettoyé
     */
    scrubStudentIdentity(text, identity = {}, options = {}) {
        if (!text || typeof text !== 'string') return text || '';

        const isAnonymous = options.anonymizePrenom ?? (appState.anonymizeData ?? true);
        const prenom = typeof identity?.prenom === 'string' ? identity.prenom.trim() : '';
        const nom = typeof identity?.nom === 'string' ? identity.nom.trim() : '';

        let result = text;

        const replaceToken = (input, rawToken, replacement) => {
            if (!rawToken || rawToken.length < 2) return input;
            const pattern = this._buildAccentInsensitivePattern(rawToken);
            const regex = new RegExp(`(?<![\\p{L}\\p{N}_])${pattern}(?![\\p{L}\\p{N}_])`, 'giu');
            return input.replace(regex, replacement);
        };

        // 1. Combinaisons "Prénom Nom" et "Nom Prénom"
        if (prenom.length >= 2 && nom.length >= 2) {
            const fullNameReplacement = isAnonymous ? this.PRENOM_PLACEHOLDER : prenom;
            const pPattern = this._buildAccentInsensitivePattern(prenom);
            const nPattern = this._buildAccentInsensitivePattern(nom);
            const fullForward = new RegExp(`(?<![\\p{L}\\p{N}_])${pPattern}[\\s-]+${nPattern}(?![\\p{L}\\p{N}_])`, 'giu');
            const fullBackward = new RegExp(`(?<![\\p{L}\\p{N}_])${nPattern}[\\s-]+${pPattern}(?![\\p{L}\\p{N}_])`, 'giu');
            result = result.replace(fullForward, fullNameReplacement).replace(fullBackward, fullNameReplacement);
        }

        // 2. Nom de famille (toujours masqué, même si anonymizeData === false)
        if (nom.length >= 2) {
            result = replaceToken(result, nom, this.NOM_PLACEHOLDER);
            const nomParts = nom.split(/[\s-]+/).filter(part => part.length >= 2);
            if (nomParts.length > 1) {
                for (const part of nomParts) {
                    result = replaceToken(result, part, this.NOM_PLACEHOLDER);
                }
            }
        }

        // 3. Prénom (masqué lorsque anonymizeData est actif)
        if (isAnonymous && prenom.length >= 2) {
            result = replaceToken(result, prenom, this.PRENOM_PLACEHOLDER);
            const prenomParts = prenom.split(/[\s-]+/).filter(part => part.length >= 2);
            if (prenomParts.length > 1) {
                for (const part of prenomParts) {
                    result = replaceToken(result, part, this.PRENOM_PLACEHOLDER);
                }
            }
        }

        return result;
    },

    /**
     * Alias de scrubStudentIdentity pour l'anonymisation de textes libres.
     * @param {string} text
     * @param {Object} [identity]
     * @param {Object} [options]
     * @returns {string}
     */
    anonymizeFreeText(text, identity = {}, options = {}) {
        return this.scrubStudentIdentity(text, identity, options);
    },

    /**
     * Réinjecte le vrai prénom à la place du placeholder [PRÉNOM] et nettoie tout [NOM] résiduel.
     * @param {string} text
     * @param {string} prenom
     * @returns {string}
     */
    deanonymizeText(text, prenom) {
        if (!text || typeof text !== 'string') return text;
        let result = text;
        if (prenom) {
            result = result.replace(/\[pr[eéèêëėẻẽ]nom\]/gi, prenom);
        }
        result = result.replace(/\s*\[nom\]/gi, '');
        return result;
    },

    /**
     * Traduit localement les statuts élèves (notamment les statuts médico-scolaires relevant
     * de l'Art. 9 RGPD : PAP, PPRE, ULIS, PAI, Geva-Sco, AESH) en consignes pédagogiques
     * bienveillantes et neutres, sans jamais transmettre l'acronyme médical brut aux API externes.
     * @param {string[]} statuses - Liste des statuts de l'élève
     * @param {string} [currentPeriod] - Période évaluée
     * @returns {string} Consignes pédagogiques neutralisées
     */
    getStatusInstructions(statuses, currentPeriod = appState.currentPeriod) {
        if (!Array.isArray(statuses) || statuses.length === 0) return '';

        const activeStatuses = typeof Utils.getActiveStatuses === 'function'
            ? Utils.getActiveStatuses(statuses, currentPeriod)
            : statuses;

        if (!Array.isArray(activeStatuses) || activeStatuses.length === 0) return '';

        const instructions = [];
        const seen = new Set();

        const addInstruction = (text) => {
            if (text && !seen.has(text)) {
                seen.add(text);
                instructions.push(text);
            }
        };

        for (const rawStatus of activeStatuses) {
            const trimmed = String(rawStatus || '').trim();
            if (!trimmed) continue;
            const lower = trimmed.toLowerCase();

            const statusMeta = resolveStudentStatus(trimmed);
            if (statusMeta) {
                const instruction = typeof statusMeta.formatPromptInstruction === 'function'
                    ? statusMeta.formatPromptInstruction(trimmed)
                    : statusMeta.promptInstruction;
                addInstruction(instruction);
            } else if (GDPR_SENSITIVE_STATUS_PATTERN.test(lower)) {
                addInstruction(DEFAULT_GDPR_SENSITIVE_PROMPT_INSTRUCTION);
            } else {
                addInstruction(`Contexte pédagogique : ${trimmed}.`);
            }
        }

        return instructions.join(' ');
    },

    /**
     * Extrait la synthèse du journal de bord pour le prompt (via JournalManager ou depuis studentData.journal).
     * @param {Object} studentData
     * @param {string} currentPeriod
     * @returns {string}
     * @private
     */
    _extractJournalSynthesis(studentData, currentPeriod) {
        const studentId = studentData?.id;
        const fromManager = studentId ? JournalManager.synthesizeForPrompt(studentId, currentPeriod) : '';
        if (fromManager) return fromManager;

        if (!Array.isArray(studentData?.journal) || studentData.journal.length === 0) {
            return '';
        }

        const periodEntries = studentData.journal.filter(
            e => e && (!e.period || e.period === currentPeriod)
        );
        if (periodEntries.length === 0) return '';

        const notes = periodEntries
            .filter(e => typeof e.note === 'string' && e.note.trim().length > 0)
            .slice(-3)
            .map(e => `"${e.note.trim()}"`)
            .join(' | ');

        return notes ? `Notes: ${notes}` : '';
    },

    /**
     * Résout le profil de style IA actif (surcharge explicite, MonStyle ou Générique).
     * @param {Object|null} [overrideConfig=null] - Configuration imposée (ex: laboratoire de style)
     * @returns {Object} Configuration IA effective
     * @private
     */
    _resolveIaConfig(overrideConfig = null) {
        if (overrideConfig) return overrideConfig;

        // Simplifié: utiliser MonStyle si personnalisation activée, sinon Générique
        // [FIX] Toujours vérifier 'MonStyle' car c'est là que sont sauvegardés les réglages "Style IA" de l'utilisateur
        // Si l'utilisateur a modifié le style, il s'attend à ce qu'il soit appliqué partout
        if (!appState.useSubjectPersonalization) {
            return appState.subjects?.['Générique']?.iaConfig || DEFAULT_PROMPT_TEMPLATES["Générique"]?.iaConfig || DEFAULT_IA_CONFIG;
        }

        // Priorité : 
        // 1. 'MonStyle' si présent (c'est le "Custom Profile" de l'utilisateur)
        // 2. 'Générique' édité dans appState
        // 3. Default config
        const customStyle = appState.subjects?.['MonStyle']?.iaConfig;
        const genericStyle = appState.subjects?.['Générique']?.iaConfig;

        return customStyle || genericStyle || DEFAULT_PROMPT_TEMPLATES["Générique"].iaConfig;
    },

    /**
     * Extrait les réglages de style qui modifient réellement le prompt
     * (ton désactivé et consignes personnalisées désactivées ou vides exclus).
     * Source unique des réglages de style injectés dans le prompt.
     * @param {Object} [iaConfig={}] - Configuration IA effective
     * @returns {{tone: number|null, voice: string, length: number|null, styleInstructions: string, discipline: string}}
     * @private
     */
    _getEffectiveStyle(iaConfig = {}) {
        const isToneActive = iaConfig.enableTone ?? (iaConfig.tone !== 3 && iaConfig.tone !== undefined);
        const hasStyleInstructions = !!iaConfig.styleInstructions && iaConfig.enableStyleInstructions !== false;
        return {
            tone: isToneActive ? (iaConfig.tone ?? 3) : null,
            voice: iaConfig.voice || '',
            length: iaConfig.length || null,
            styleInstructions: hasStyleInstructions ? iaConfig.styleInstructions : '',
            discipline: iaConfig.discipline || ''
        };
    },

    /**
     * Convertit une moyenne saisie (nombre ou chaîne « 12,5 ») en nombre.
     * @param {number|string|null|undefined} raw - Moyenne brute
     * @returns {number} Moyenne numérique, ou NaN si absente ou invalide
     * @private
     */
    _parseGrade(raw) {
        return typeof raw === 'number' ? raw : parseFloat(String(raw ?? '').replace(',', '.'));
    },

    getAllPrompts(studentData, overrideConfig = null, excludeClassStats = false) {
        const { nom, prenom, statuses, periods, currentPeriod } = studentData;
        const allPeriods = Utils.getPeriods();
        const currentPeriodIndex = allPeriods.indexOf(currentPeriod);
        const relevantPeriods = allPeriods.slice(0, currentPeriodIndex + 1);

        // GESTION DE LA CONFIDENTIALITÉ
        // Si anonymisation désactivée, on utilise le prénom mais JAMAIS le nom de famille
        // [FIX] Utiliser appState.anonymizeData (proxy plat) au lieu de appState.privacy.anonymizeData
        const isAnonymous = appState.anonymizeData ?? true;
        const studentIdentity = { prenom, nom };

        // Détection de l'absence totale de données scolaires
        // On vérifie les notes sur TOUTES les périodes (données objectives, jamais auto-générées)
        // mais PAS les appréciations passées (pourraient être nos propres constats d'absence)
        const hasGrades = relevantPeriods.some(p => {
            const d = periods?.[p] || {};
            const raw = d.grade;
            const val = this._parseGrade(raw);
            return !isNaN(val);
        });

        const rawPeriodContext = periods?.[currentPeriod]?.context;
        const periodContext = rawPeriodContext
            ? this.scrubStudentIdentity(rawPeriodContext, studentIdentity, { anonymizePrenom: isAnonymous })
            : '';
        const rawJournalSynthesis = this._extractJournalSynthesis(studentData, currentPeriod);
        const journalSynthesis = rawJournalSynthesis
            ? this.scrubStudentIdentity(rawJournalSynthesis, studentIdentity, { anonymizePrenom: isAnonymous })
            : '';
        const hasContext = !!(periodContext?.trim() || journalSynthesis?.trim());

        const hasNoData = !hasGrades && !hasContext;
        const currentGradeRaw = periods?.[currentPeriod]?.grade;
        const currentGradeVal = this._parseGrade(currentGradeRaw);
        const hasCurrentGrade = !isNaN(currentGradeVal);

        const iaConfig = this._resolveIaConfig(overrideConfig);

        // Anonymisation RGPD : on utilise [PRÉNOM] au lieu du vrai prénom
        // Le genre est détecté pour permettre l'accord grammatical correct
        const gender = Utils.detectGender(prenom);
        // When gender unknown, favor impersonal constructions
        const genderLabel = gender === 'féminin' ? 'féminin'
            : gender === 'masculin' ? 'masculin'
                : 'non déterminé - privilégier des tournures impersonnelles (ex: "Sa participation...", "Il convient de...")';

        const studentIdentifier = isAnonymous ? this.PRENOM_PLACEHOLDER : prenom;
        const isNeutralVoice = iaConfig.voice === 'neutre';
        const systemParts = [];

        // Introduction du prompt (avec discipline si renseignée)
        const disciplineContext = iaConfig.discipline
            ? ` en ${iaConfig.discipline}`
            : '';
        const role = disciplineContext
            ? `Tu es un enseignant${disciplineContext}.`
            : `Tu es un enseignant ou conseiller d'éducation.`;
        const studentTarget = isNeutralVoice ? "d'un élève" : `de l'élève ${studentIdentifier}`;
        const periodLabel = Utils.getPeriodLabel(currentPeriod, true);
        const periodDisplay = periodLabel && periodLabel !== currentPeriod
            ? `${periodLabel} (${currentPeriod})`
            : `'${periodLabel || currentPeriod}'`;
        systemParts.push(`${role} Rédige l'appréciation ${studentTarget} pour le ${periodDisplay}.`);

        const isYearEnd = currentPeriodIndex === allPeriods.length - 1;
        const temporalite = isYearEnd
            ? "Bilan de fin d'année (bilan de la période et, si les données le permettent, de l'année ; ouverture possible si elle est naturelle, le bilan restant prioritaire)."
            : "Bilan intermédiaire (analyse de la période écoulée).";

        systemParts.push(`Cadre d'évaluation : ${temporalite}`);

        // Use StatsService for evolution analysis
        // [FIX] Filter evolutions to only include those ENDING at or before currentPeriod
        // For S1/T1 (first period), there should be NO evolution to display
        const allEvolutions = StatsService.analyserEvolution(periods) || [];
        const filteredEvolutions = allEvolutions.filter(e => {
            const targetPeriod = e.periode.split('-')[1];
            const targetIndex = allPeriods.indexOf(targetPeriod);
            return targetIndex >= 0 && targetIndex <= currentPeriodIndex;
        });
        const evolutionText = this._formatEvolutions(filteredEvolutions);

        // Instruction critique sur la cohérence note/appréciation (placée au début pour plus d'impact)
        if (!hasNoData) {
            const evolutionClause = filteredEvolutions.length > 0 ? ' et son évolution' : '';
            const missingCurrentGradeNote = hasCurrentGrade
                ? ''
                : " Si la période courante n'a pas de moyenne, le signaler factuellement sans inventer de résultats.";
            systemParts.push(`L'appréciation doit être cohérente avec le niveau de réussite suggéré par la moyenne${evolutionClause}, tout en tenant compte du contexte fourni sur l'élève.${missingCurrentGradeNote}`);
        }

        const hasPastAppreciations = relevantPeriods.some(p => { const app = periods?.[p]?.appreciation?.trim(); return p !== currentPeriod && !!app && app !== 'N/A'; });
        const styleParts = [
            `Appuie-toi uniquement sur les données fournies : n'invente ni attitude, ni participation, ni méthode de travail qui n'y figurent pas.`,
            ...(hasPastAppreciations && !hasNoData ? [`Utilise les appréciations des périodes précédentes comme repères de continuité : ne les recopie pas et ne les paraphrase pas.`] : []),
            `Écris dans un style naturel, précis et varié, sans formules scolaires toutes faites ni éloge excessif.`
        ];

        const toneMap = {
            1: 'très encourageant et positif',
            2: 'bienveillant et constructif',
            3: 'neutre, factuel et mesuré',
            4: 'exigeant mais constructif',
            5: 'strict et formel'
        };
        const effectiveStyle = this._getEffectiveStyle(iaConfig);
        if (toneMap[effectiveStyle.tone]) {
            styleParts.push(`Adopte un ton ${toneMap[effectiveStyle.tone]}.`);
        }

        const voiceInstruction = {
            'je': 'Rédige à la première personne du singulier, sans commencer chaque phrase par « je ».',
            'nous': 'Rédige à la première personne du pluriel (« nous »), au nom de l\'équipe pédagogique.',
            'neutre': 'Rédige dans un style impersonnel et factuel, sans prénom ni pronom désignant l\'élève ou l\'enseignant (les tournures impersonnelles comme « il convient de » restent possibles).'
        }[iaConfig.voice];

        if (voiceInstruction) {
            styleParts.push(voiceInstruction);
        }
        if (!isNeutralVoice && !hasNoData) {
            styleParts.push(`Ne t'adresse pas directement à l'élève (ni « tu » ni « vous ») et cite son prénom une fois au maximum.`);
        }

        if (effectiveStyle.length && !hasNoData) {
            styleParts.push(`Longueur visée : environ ${effectiveStyle.length} mots. Le naturel prime sur le décompte : reste plus bref si les données sont succinctes.`);
        }
        if (!hasNoData) {
            styleParts.push(`Ne cite ni les moyennes ni les statistiques de classe, et ne compare pas explicitement l'élève à la classe : sers-t'en uniquement pour ajuster ton degré d'exigence ou d'encouragement.`);
        }
        styleParts.push(`Réponds uniquement avec le texte de l'appréciation, sans titre, préambule ni guillemets.`);

        if (effectiveStyle.styleInstructions) {
            styleParts.push(`Consigne de l'enseignant (prioritaire) : ${effectiveStyle.styleInstructions}`);
        }

        if (hasNoData) {
            styleParts.push(
                `Attention : Cet élève n'a aucune donnée d'évaluation (note, appréciation passée ou observation). Rédige uniquement un constat factuel, bienveillant et très court d'absence de données (pour cette période, ou pour l'année si les périodes précédentes indiquent également une absence totale de données), en une seule phrase simple (maximum 25 mots), sans inventer de travail ou de réussite, et sans projection sur l'avenir.`
            );
        }

        systemParts.push('--- INSTRUCTIONS DE STYLE ---\n' + styleParts.map(s => '- ' + s).join('\n'));

        // Anonymisation : on n'envoie PAS le nom de famille, seulement les notes
        // On n'envoie que les périodes jusqu'à la période à évaluer (incluse)
        // [FIX] N'inclure l'appréciation que pour les périodes PRÉCÉDENTES
        // L'appréciation de la période courante ne doit PAS être incluse pour éviter
        // que l'IA ne s'inspire de l'ancienne appréciation lors d'une régénération
        const classId = studentData.classId || appState.currentClassId || null;
        const periodRows = relevantPeriods.map(p => {
            const d = periods[p] || {};
            const gradeRaw = d.grade;
            const gradeVal = this._parseGrade(gradeRaw);
            const g = !isNaN(gradeVal) ? gradeVal.toFixed(1).replace('.', ',') + '/20' : 'N/A';
            const evalCount = typeof d.evaluationCount === 'number' ? ` (${d.evaluationCount} éval.)` : '';
            const classStatsStr = excludeClassStats ? '' : this._getClassStatsString(classId, p);
            const scrubbedApp = d.appreciation
                ? this.scrubStudentIdentity(d.appreciation.trim(), studentIdentity, { anonymizePrenom: isAnonymous })
                : '';
            const prefix = `${p} : Moy ${g}${evalCount}${classStatsStr}, Appréciation : `;
            const storedAppText = `"${scrubbedApp || 'N/A'}"`;
            return {
                forGeneration: `${prefix}${p === currentPeriod ? '[à générer]' : storedAppText}`,
                forAnalysis: `${prefix}${storedAppText}`,
                scrubbedApp
            };
        });
        const periodsInfo = periodRows.map(r => r.forGeneration).join('\n');
        const periodsInfoForAnalysis = periodRows.map(r => r.forAnalysis).join('\n');
        const rawCurrentApp = periods?.[currentPeriod]?.appreciation?.trim();
        const currentPeriodAppreciation = periodRows.length > 0
            ? periodRows[periodRows.length - 1].scrubbedApp
            : (rawCurrentApp ? this.scrubStudentIdentity(rawCurrentApp, studentIdentity, { anonymizePrenom: isAnonymous }) : '');

        // Neutralisation RGPD Art. 9 : on traduit localement les statuts en consignes pédagogiques neutres
        const statusInstructions = this.getStatusInstructions(statuses, currentPeriod);
        const statusLine = statusInstructions ? `\nConsignes d'accompagnement : ${statusInstructions}` : '';

        const specificInfoLine = periodContext ? `\nContexte : "${periodContext}"` : '';

        // === JOURNAL DE BORD: Synthesis for prompt ===
        // Injects tag counts and recent notes to enrich AI context
        const journalLine = journalSynthesis ? `\n\nObservations du professeur : ${journalSynthesis}` : '';

        // Note: Le nom de famille n'est JAMAIS envoyé, même si l'anonymisation est désactivée.
        // Seul le prénom est partagé si l'utilisateur le permet.
        // En mode neutre, on ne mentionne aucun identifiant personnel.

        // Si on envoie le vrai prénom, on laisse l'IA déduire le genre (sauf si neutre/indéterminé)
        // Si anonyme ([PRÉNOM]) ou neutre, on DOIT fournir le genre pour l'accord grammatical.
        const isGenderUnknown = gender !== 'masculin' && gender !== 'féminin';
        const showGender = isAnonymous || isNeutralVoice || isGenderUnknown;
        const genderSuffix = showGender ? ` (${genderLabel})` : '';

        // En mode neutre: "Genre : féminin" au lieu de "Élève : Élève (féminin)"
        const studentLine = isNeutralVoice
            ? `Genre : ${genderLabel}`
            : `Élève : ${studentIdentifier}${genderSuffix}`;

        // --- CONTEXTE SCOLAIRE & DONNÉES DE L'ÉLÈVE ---
        const classLines = [];
        const currentClass = appState.classes?.find(c => c.id === appState.currentClassId);
        if (currentClass) {
            let classLevel = currentClass.level || detectLevelFromName(currentClass.name);
            if (classLevel === '3eme') classLevel = 'college';
            const levelMeta = LEVELS[classLevel] || LEVELS.generique;

            classLines.push(`Classe : ${currentClass.name}`);
            if (classLevel && classLevel !== 'generique') {
                classLines.push(`Niveau : ${levelMeta.label}`);
            }
        }
        const classPrefix = classLines.length > 0 ? classLines.join('\n') + '\n' : '';
        const appreciationUser = `--- DONNÉES DE L'ÉLÈVE ---\n${classPrefix}${studentLine}${statusLine}${specificInfoLine}${journalLine}\nPériode à évaluer : ${currentPeriod}\n\nPériodes :\n${periodsInfo}\n\n${evolutionText}`;

        // Le prompt complet (aperçu, copie) est strictement la concaténation de ce qui est envoyé à l'API
        const appreciationSystem = systemParts.join('\n\n');
        const appreciationPrompt = `${appreciationSystem}\n\n${appreciationUser}`;

        // Analysis prompts - use the current period's appreciation as reference
        // Enriched with student context for more accurate insights

        // Build condensed student context for analysis
        const analysisContextParts = [];

        // Add neutralized status instructions if present
        if (statusInstructions) {
            analysisContextParts.push(`Consignes d'accompagnement : ${statusInstructions}`);
        }

        // Add scrubbed period context if present
        if (periodContext) {
            analysisContextParts.push(`Contexte : "${periodContext}"`);
        }

        // Add scrubbed journal synthesis for richer insights
        if (journalSynthesis) {
            analysisContextParts.push(`Observations : ${journalSynthesis}`);
        }

        const analysisContext = analysisContextParts.length > 0
            ? '\n' + analysisContextParts.join('\n')
            : '';

        const analysisUser = `Données de l'élève :
${periodsInfoForAnalysis}
${evolutionText}${analysisContext}

Appréciation de référence : "${currentPeriodAppreciation || 'N/A'}"`;

        const swSystem = `Tu es un enseignant analysant les performances d'un élève pour en extraire des forces et des faiblesses.
Rédige une analyse pour la période '${currentPeriod}'. Liste exactement 2-3 points forts puis 2-3 points faibles.
Format obligatoire à respecter STRICTEMENT :
### Points Forts
• [Point fort 1]
• [Point fort 2]

### Points Faibles
• [Point faible 1]
• [Point faible 2]

Ne rédige aucun préambule, aucune introduction ni conclusion. Réponds directement avec les titres et les points.`;

        const swUser = analysisUser;
        const swPrompt = `${swSystem}\n\n${swUser}`;

        const nsSystem = `Tu es un enseignant formulant des pistes d'amélioration concrètes pour un élève.
Suggère exactement 3 pistes d'amélioration concrètes pour la période '${currentPeriod}'.
Format obligatoire : liste numérotée (1., 2., 3.). Rédige de manière brève, concise et directe.
Ne rédige aucun préambule, aucune introduction ni conclusion. Réponds directement avec la liste.`;

        const nsUser = analysisUser;
        const nsPrompt = `${nsSystem}\n\n${nsUser}`;

        return {
            appreciation: appreciationPrompt,
            sw: swPrompt,
            ns: nsPrompt,
            appreciationSystem,
            appreciationUser,
            swSystem,
            swUser,
            nsSystem,
            nsUser
        };
    },

    /**
     * Generates a refinement prompt for appreciation modifications
     * @param {string} type - Type of refinement (concise, detailed, encouraging, polish, variations, formal, context)
     * @param {string} original - The original text to refine
     * @param {Object|string} [options={}] - Optional configuration ({ prenom, nom, studentData, context }) or legacy context string
     * @returns {string} The formatted prompt for AI
     */
    getRefinementPrompt(type, original, options = {}) {
        const isOptionsObject = options && typeof options === 'object';
        const isAnonymous = appState.anonymizeData ?? true;
        const explicitPrenom = isOptionsObject ? (options.prenom || options.studentData?.prenom || '') : '';
        const explicitNom = isOptionsObject ? (options.nom || options.studentData?.nom || '') : '';

        let sanitizedOriginal = original || '';

        if (explicitPrenom || explicitNom) {
            const identity = { prenom: explicitPrenom, nom: explicitNom };
            sanitizedOriginal = this.scrubStudentIdentity(sanitizedOriginal, identity, { anonymizePrenom: isAnonymous });
        } else if (Array.isArray(appState.generatedResults) && appState.generatedResults.length > 0) {
            for (const r of appState.generatedResults) {
                const p = r?.prenom || r?.studentData?.prenom || '';
                const n = r?.nom || r?.studentData?.nom || '';
                if (p || n) {
                    sanitizedOriginal = this.scrubStudentIdentity(sanitizedOriginal, { prenom: p, nom: n }, { anonymizePrenom: isAnonymous });
                }
            }
        }

        // Raw text only, keeping the grammatical person chosen by the teacher (je / nous / impersonnel)
        const base = 'Conserve la personne grammaticale du texte d\'origine (je, nous ou tournure impersonnelle). Réponds uniquement avec le texte brut, sans introduction, commentaire, formatage ni guillemets.';
        let instruction = '';

        switch (type) {
            case 'polish':
                // Same length, improved style
                instruction = `Peaufine cette appréciation scolaire : corrige les fautes et les contradictions, améliore la fluidité et le naturel. Garde le sens et une longueur similaire.\n\n---\n${sanitizedOriginal}\n---\n\n${base}`;
                break;
            case 'variations':
                // Same length, different wording
                instruction = `Reformule cette appréciation différemment (vocabulaire, structure), avec le même sens et une longueur similaire.\n\n---\n${sanitizedOriginal}\n---\n\n${base}`;
                break;
            case 'detailed':
                // Slightly longer, symmetric with concise
                instruction = `Développe les points de cette appréciation un peu plus en détail, sans inventer de faits.\n\n---\n${sanitizedOriginal}\n---\n\n${base}`;
                break;
            case 'concise':
                // Shorter, essentials only
                instruction = `Rends cette appréciation plus concise en allant à l'essentiel, sans perdre le sens.\n\n---\n${sanitizedOriginal}\n---\n\n${base}`;
                break;
            case 'encouraging':
                // Same length, warmer tone
                instruction = `Reformule cette appréciation avec un ton plus encourageant et positif, sans changer les faits et avec une longueur similaire.\n\n---\n${sanitizedOriginal}\n---\n\n${base}`;
                break;
            case 'default':
            default:
                instruction = `Reformule cette appréciation.\n\n---\n${sanitizedOriginal}\n---\n\n${base}`;
        }
        return instruction;
    },

    /**
     * Calcule la moyenne, le min et le max de la classe pour une période donnée.
     * @param {string} classId - ID de la classe
     * @param {string} period - Période (ex: T1, T2)
     * @returns {string} Chaîne formatée (ex: " [Classe: Moy 12,5, Min 8,0, Max 18,5]") ou vide
     * @private
     */
    _getClassStatsString(classId, period) {
        try {
            if (!appState.generatedResults || !Array.isArray(appState.generatedResults)) return '';
            
            // Si pas de classId défini, on prend les élèves n'ayant pas de classId (mode legacy)
            const classStudents = appState.generatedResults.filter(r => 
                (!classId && !r.classId) || (classId && r.classId === classId)
            );

            if (classStudents.length < 3) return ''; // Seuil de représentativité

            // Générer une clé de cache basée sur la signature des notes de la classe
            const cacheKey = `${classId || 'default'}_${period}_` + classStudents
                .map(r => r.studentData?.periods?.[period]?.grade ?? '')
                .join(',');

            if (PromptService._classStatsCache.has(cacheKey)) {
                return PromptService._classStatsCache.get(cacheKey);
            }

            const grades = classStudents
                .map(r => PromptService._parseGrade(r.studentData?.periods?.[period]?.grade))
                .filter(g => !isNaN(g));

            if (grades.length < 3) {
                PromptService._classStatsCache.set(cacheKey, '');
                return ''; // Au moins 3 notes pour calculer des stats
            }

            const sum = grades.reduce((acc, g) => acc + g, 0);
            const avg = sum / grades.length;
            const min = Math.min(...grades);
            const max = Math.max(...grades);

            const result = ` [Classe : Moy ${avg.toFixed(1).replace('.', ',')}, Min ${min.toFixed(1).replace('.', ',')}, Max ${max.toFixed(1).replace('.', ',')}]`;
            PromptService._classStatsCache.set(cacheKey, result);
            return result;
        } catch (e) {
            console.warn('[PromptService] Erreur lors du calcul des statistiques de classe:', e);
            return '';
        }
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
            const periodeStr = e.periode.replace('-', ' -> ');
            const sign = e.valeur > 0 ? '+' : '';
            const desc = descriptions[e.type] || 'Stable';
            const formattedVal = String(e.valeur).replace('.', ',');
            const unit = Math.abs(e.valeur) < 2 ? 'pt' : 'pts';
            return `Évolution ${periodeStr} : ${desc} (${sign}${formattedVal} ${unit})`;
        });

        return lines.join('\n');
    },

    /**
     * Génère l'empreinte du dossier pédagogique de l'élève pour la période évaluée (statut « À rafraîchir »).
     * Seule une évolution des données de l'élève l'invalide : prénom, moyennes et nombre d'évaluations,
     * appréciations des périodes précédentes, contexte de la période, statuts actifs et journal de bord.
     * Les réglages globaux (style, seuils d'évolution, anonymisation, classe) en sont volontairement exclus :
     * ils s'appliquent aux prochaines générations sans remettre en cause les appréciations déjà validées.
     * @param {Object} studentData - Données de l'élève (comme dans getAllPrompts)
     * @returns {string|null} Empreinte préfixée par PROMPT_HASH_PREFIX (simple djb2 hash)
     */
    getPromptHash(studentData) {
        try {
            const { prenom, statuses, periods, currentPeriod } = studentData;
            const allPeriods = Utils.getPeriods();
            const relevantPeriods = allPeriods.slice(0, allPeriods.indexOf(currentPeriod) + 1);
            const source = JSON.stringify({
                prenom: (prenom || '').trim(),
                currentPeriod,
                periods: relevantPeriods.map(p => {
                    const d = periods?.[p] || {};
                    const text = p === currentPeriod ? d.context : d.appreciation;
                    return [this._parseGrade(d.grade), d.evaluationCount ?? null, (text || '').trim()];
                }),
                statuses: Utils.getActiveStatuses(Array.isArray(statuses) ? statuses : [], currentPeriod).sort(),
                journal: this._extractJournalSynthesis(studentData, currentPeriod)
            });

            // Simple djb2 hash algorithm - fast and good distribution
            let hash = 5381;
            for (let i = 0; i < source.length; i++) {
                hash = ((hash << 5) + hash) + source.charCodeAt(i);
                hash = hash & hash; // Convert to 32bit integer
            }

            return `${this.PROMPT_HASH_PREFIX}${hash.toString(16)}`;
        } catch (e) {
            console.warn('[PromptService] Failed to generate prompt hash:', e);
            return null;
        }
    }
};
