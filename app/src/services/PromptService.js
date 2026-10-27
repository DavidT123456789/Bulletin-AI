import { appState } from '../state/State.js';
import { DEFAULT_IA_CONFIG, DEFAULT_PROMPT_TEMPLATES } from '../config/Config.js';
import { Utils } from '../utils/Utils.js';
import { DOM } from '../utils/DOM.js';
import { StatsService } from './StatsService.js';
import { LEVELS, detectLevelFromName } from '../utils/LevelDetector.js';
import { JournalManager } from '../managers/JournalManager.js';

export const PromptService = {
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

            if (lower === 'pap' || lower.startsWith('pap ')) {
                addInstruction("Valoriser les progrès réalisés au regard des aménagements pédagogiques mis en place, avec un ton bienveillant, sans jamais mentionner de dispositif administratif ou médical.");
            } else if (lower === 'ppre' || lower.startsWith('ppre ')) {
                addInstruction("Encourager les efforts sur les compétences fondamentales ciblées et donner des conseils méthodologiques accessibles, sans mentionner de programme d'accompagnement.");
            } else if (lower === 'ulis' || lower.startsWith('ulis ')) {
                addInstruction("Évaluer les acquis par rapport aux objectifs personnalisés de l'élève en valorisant son implication et ses progrès, sans jamais mentionner de dispositif d'inclusion scolaire ou de handicap.");
            } else if (lower === 'pai' || lower.startsWith('pai ')) {
                addInstruction("Tenir compte avec bienveillance du rythme de l'élève sans jamais faire allusion à sa santé ou à un protocole médical.");
            } else if (lower === 'geva-sco' || lower === 'gevasco' || lower.startsWith('geva') || lower === 'mdph' || lower === 'pps') {
                addInstruction("Valoriser les progrès et l'investissement de l'élève au regard de son parcours adapté, sans jamais mentionner de dossier médico-scolaire ou administratif.");
            } else if (lower === 'aesh' || lower.startsWith('aesh ')) {
                addInstruction("Mettre en avant l'autonomie progressive et les réussites de l'élève, sans mentionner d'accompagnement humain en classe.");
            } else if (lower.startsWith('nouveau')) {
                addInstruction(`Tenir compte de l'arrivée récente de l'élève en cours d'année (${trimmed}) et valoriser son adaptation.`);
            } else if (lower.startsWith('départ') || lower.startsWith('depart')) {
                addInstruction(`Tenir compte du départ de l'élève (${trimmed}) en dressant un bilan factuel et bienveillant de sa présence.`);
            } else if (lower.startsWith('délégué') || lower.startsWith('delegue')) {
                addInstruction(`Prendre en compte l'engagement citoyen de l'élève (${trimmed}) si pertinent.`);
            } else if (/\b(pap|ppre|ulis|pai|geva[-\s]?sco|aesh|pps|mdph|segpa|dys\w*|tdah|tsa|handicap)\b/i.test(lower)) {
                addInstruction("Adapter le propos avec bienveillance aux aménagements pédagogiques de l'élève, sans jamais mentionner de dispositif médical ou administratif.");
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
            const val = typeof raw === 'number' ? raw : parseFloat(String(raw || '').replace(',', '.'));
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

        // Simplifié: utiliser MonStyle si personnalisation activée, sinon Générique
        // [FIX] Toujours vérifier 'MonStyle' car c'est là que sont sauvegardés les réglages "Style IA" de l'utilisateur
        // Si l'utilisateur a modifié le style, il s'attend à ce qu'il soit appliqué partout
        const usePersonalization = appState.useSubjectPersonalization;
        let iaConfig;

        if (overrideConfig) {
            iaConfig = overrideConfig;
        } else if (!usePersonalization) {
            iaConfig = appState.subjects?.['Générique']?.iaConfig || DEFAULT_PROMPT_TEMPLATES["Générique"]?.iaConfig || DEFAULT_IA_CONFIG;
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

        const studentIdentifier = isAnonymous ? this.PRENOM_PLACEHOLDER : prenom;
        const isNeutralVoice = iaConfig.voice === 'neutre';
        const promptParts = [];

        // Introduction du prompt (avec discipline si renseignée)
        const disciplineContext = iaConfig.discipline
            ? ` en ${iaConfig.discipline}`
            : '';
        if (isNeutralVoice) {
            promptParts.push(`Rédige l'appréciation d'un élève${disciplineContext} pour le '${Utils.getPeriodLabel(currentPeriod, true)}'.`);
        } else {
            promptParts.push(`Rédige l'appréciation de l'élève ${studentIdentifier}${disciplineContext} pour le '${Utils.getPeriodLabel(currentPeriod, true)}'.`);
        }

        const isYearEnd = currentPeriodIndex === allPeriods.length - 1;
        const temporalite = isYearEnd
            ? "Bilan de fin d'année (analyse de la période et bilan annuel global ; une ouverture vers la suite peut être proposée lorsqu'elle est naturelle)."
            : "Bilan intermédiaire (analyse de la période écoulée).";

        promptParts.push(`Cadre d'évaluation : ${temporalite}`);

        // Instruction critique sur la cohérence note/appréciation (placée au début pour plus d'impact)
        if (!hasNoData) {
            promptParts.push(`L'appréciation doit être cohérente avec le niveau de réussite suggéré par la moyenne, tout en tenant compte du contexte fourni sur l'élève. Si la période courante n'a pas de moyenne, le signaler factuellement sans inventer de résultats.`);
        }


        const styleParts = [];

        const toneMap = {
            1: 'très encourageant et positif',
            2: 'bienveillant et constructif',
            3: 'neutre, factuel et mesuré',
            4: 'exigeant mais constructif',
            5: 'strict et formel'
        };
        const isToneActive = iaConfig.enableTone ?? (iaConfig.tone !== 3 && iaConfig.tone !== undefined);
        const selectedTone = iaConfig.tone ?? 3;
        if (isToneActive && toneMap[selectedTone]) {
            styleParts.push(`Adopte un ton ${toneMap[selectedTone]}.`);
        }

        const voiceInstruction = {
            'je': 'Utilise impérativement la première personne du singulier ("Je", "J\'observe", "mon avis").',
            'nous': 'Utilise impérativement la première personne du pluriel ("Nous", "Nous notons", "notre avis") ou une forme impersonnelle institutionnelle.',
            'neutre': 'Rédige de manière administrative, factuelle et concise (maximum 3 phrases) :\n' +
                      '- AUCUN PRÉNOM.\n' +
                      '- AUCUN PRONOM PERSONNEL : Interdiction totale d\'utiliser "Je", "Nous", "Vous", "Il" ou "Elle".\n' +
                      '- PAS DE DÉBUT EN "L\'ÉLÈVE" : Ne commence jamais une phrase par "L\'élève" pour éviter la monotonie.\n' +
                      '- STYLE : Utilise exclusivement des sujets inanimés (ex: "Le travail", "Les résultats", "L\'attitude") ou des formes impersonnelles (ex: "Il est nécessaire de", "On note").',
        }[iaConfig.voice];

        if (voiceInstruction) {
            styleParts.push(voiceInstruction);
        }

        if (iaConfig.length && !hasNoData) {
            styleParts.push(`Rédige une appréciation d'environ ${iaConfig.length} mots.`);
        }
        styleParts.push(`Ne mentionne pas les notes chiffrées (moyennes) dans le texte.`);
        styleParts.push(`Ne mentionne PAS les valeurs chiffrées de la classe (moyenne, min, max de classe) dans le texte. Utilise-les uniquement comme contexte pour situer le niveau de l'élève par rapport au groupe de façon bienveillante et adapter ton niveau d'exigence ou d'encouragement.`);
        styleParts.push(`Génère l'appréciation directement, sans titre, sans préambule et sans guillemets.`);

        if (iaConfig.styleInstructions && iaConfig.enableStyleInstructions !== false) {
            styleParts.push(`Note : ${iaConfig.styleInstructions}`);
        }

        if (hasNoData) {
            styleParts.push(
                `Attention : Cet élève n'a aucune donnée d'évaluation (note, appréciation passée ou observation). Rédige uniquement un constat factuel, bienveillant et très court d'absence de données (pour cette période, ou pour l'année si les périodes précédentes indiquent également une absence totale de données), en une seule phrase simple (maximum 25 mots), sans inventer de travail ou de réussite, et sans projection sur l'avenir.`
            );
        }

        promptParts.push('--- INSTRUCTIONS DE STYLE ---\n' + styleParts.map(s => '- ' + s).join('\n'));

        // Anonymisation : on n'envoie PAS le nom de famille, seulement les notes
        // On n'envoie que les périodes jusqu'à la période à évaluer (incluse)
        // [FIX] N'inclure l'appréciation que pour les périodes PRÉCÉDENTES
        // L'appréciation de la période courante ne doit PAS être incluse pour éviter
        // que l'IA ne s'inspire de l'ancienne appréciation lors d'une régénération
        const classId = studentData.classId || appState.currentClassId || null;
        let periodsInfo = relevantPeriods.map(p => {
            const d = periods[p] || {};
            const gradeRaw = d.grade;
            const gradeVal = typeof gradeRaw === 'number' ? gradeRaw : parseFloat(String(gradeRaw || '').replace(',', '.'));
            const g = !isNaN(gradeVal) ? gradeVal.toFixed(1).replace('.', ',') + '/20' : 'N/A';
            const evalCount = typeof d.evaluationCount === 'number' ? ` (${d.evaluationCount} éval.)` : '';
            const classStatsStr = excludeClassStats ? '' : this._getClassStatsString(classId, p);
            // Pour la période courante, on n'inclut pas l'appréciation existante
            const isCurrentPeriod = p === currentPeriod;
            const scrubbedApp = d.appreciation
                ? this.scrubStudentIdentity(d.appreciation.trim(), studentIdentity, { anonymizePrenom: isAnonymous })
                : '';
            // [FIX] Use brackets for instruction, quotes only for actual appreciation text
            const appText = isCurrentPeriod ? '[à générer]' : `"${scrubbedApp || 'N/A'}"`;
            return `${p} : Moy ${g}${evalCount}${classStatsStr}, App ${appText}`;
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

        // Si on envoie le vrai prénom, on laisse l'IA déduire le genre (sauf si indéterminé)
        // Si anonyme ([PRÉNOM]) ou neutre, on DOIT fournir le genre pour l'accord grammatical.
        const showGender = isAnonymous || isNeutralVoice || gender === 'indéterminé';
        const genderSuffix = showGender ? ` (${genderLabel})` : '';

        // En mode neutre: "Genre : féminin" au lieu de "Élève : Élève (féminin)"
        const studentLine = isNeutralVoice
            ? `Genre : ${genderLabel}`
            : `Élève : ${studentIdentifier}${genderSuffix}`;

        // --- CONTEXTE SCOLAIRE ---
        const currentClass = appState.classes?.find(c => c.id === appState.currentClassId);
        if (currentClass) {
            let classLevel = currentClass.level || detectLevelFromName(currentClass.name);
            if (classLevel === '3eme') classLevel = 'college';
            const levelMeta = LEVELS[classLevel] || LEVELS.generique;
            
            let contextText = `--- CONTEXTE SCOLAIRE ---\nClasse : ${currentClass.name}`;
            if (classLevel && classLevel !== 'generique') {
                contextText += `\nNiveau : ${levelMeta.label}`;
            }
            promptParts.push(contextText);
        }

        promptParts.push(`--- DONNÉES DE L'ÉLÈVE ---\n${studentLine}${statusLine}${specificInfoLine}${journalLine}\nPériode à évaluer : ${currentPeriod}\n\nPériodes :\n${periodsInfo}\n\n${evolutionText}`);

        const appreciationPrompt = promptParts.join('\n\n');

        // Build System Prompt for appreciation
        const systemParts = [];
        if (isNeutralVoice) {
            systemParts.push(`Tu es un enseignant ou conseiller d'éducation${disciplineContext}. Ton rôle est de rédiger l'appréciation scolaire d'un élève pour le '${Utils.getPeriodLabel(currentPeriod, true)}'.`);
        } else {
            systemParts.push(`Tu es un enseignant ou conseiller d'éducation${disciplineContext}. Ton rôle est de rédiger l'appréciation scolaire de l'élève ${studentIdentifier} pour le '${Utils.getPeriodLabel(currentPeriod, true)}'.`);
        }
        systemParts.push(`Cadre d'évaluation : ${temporalite}`);
        if (!hasNoData) {
            systemParts.push(`L'appréciation doit être cohérente avec le niveau de réussite suggéré par la moyenne, tout en tenant compte du contexte fourni sur l'élève. Si la période courante n'a pas de moyenne, le signaler factuellement sans inventer de résultats.`);
        }

        const systemStyleParts = [...styleParts];
        // Blacklist of school clichés
        systemStyleParts.push(
            `RÈGLES D'EXCLUSION STRICTES (ÉVITER LES CLICHÉS SCÉENAIRES) :\n` +
            `- N'utilise JAMAIS de formulations scolaires vides ou passives telles que : 'élève sérieux', 'peut mieux faire', 'continuer ainsi', 'poursuivre ses efforts', 'doit persévérer', 'travail régulier', 'résultats satisfaisants' (sans autre précision).\n` +
            `- À la place, privilégie des descriptions comportementales ou méthodologiques concrètes et actives (ex: 'fait preuve d'investissement', 'assimile bien les notions', 'exprime des pistes précises d'amélioration', 's'implique dans les activités collectives').`
        );
        systemParts.push('--- INSTRUCTIONS DE STYLE ---\n' + systemStyleParts.map(s => '- ' + s).join('\n'));
        const appreciationSystem = systemParts.join('\n\n');
        // Build User Prompt for appreciation
        const userParts = [];
        if (currentClass) {
            let classLevel = currentClass.level || detectLevelFromName(currentClass.name);
            if (classLevel === '3eme') classLevel = 'college';
            const levelMeta = LEVELS[classLevel] || LEVELS.generique;
            
            let contextText = `--- CONTEXTE SCOLAIRE ---\nClasse : ${currentClass.name}`;
            if (classLevel && classLevel !== 'generique') {
                contextText += `\nNiveau : ${levelMeta.label}`;
            }
            userParts.push(contextText);
        }
        userParts.push(`--- DONNÉES DE L'ÉLÈVE ---\n${studentLine}${statusLine}${specificInfoLine}${journalLine}\nPériode à évaluer : ${currentPeriod}\n\nPériodes :\n${periodsInfo}\n\n${evolutionText}`);
        const appreciationUser = userParts.join('\n\n');

        // [FIX] Use period-specific appreciation for analysis prompts
        // The appreciation to analyze should be from the current period, not a legacy global field
        const rawCurrentPeriodAppreciation = periods?.[currentPeriod]?.appreciation || '';
        const currentPeriodAppreciation = rawCurrentPeriodAppreciation
            ? this.scrubStudentIdentity(rawCurrentPeriodAppreciation.trim(), studentIdentity, { anonymizePrenom: isAnonymous })
            : '';

        // Build periods info for analysis - use stored appreciation per period
        let periodsInfoForAnalysis = relevantPeriods.map(p => {
            const d = periods[p] || {};
            const gradeRaw = d.grade;
            const gradeVal = typeof gradeRaw === 'number' ? gradeRaw : parseFloat(String(gradeRaw || '').replace(',', '.'));
            const g = !isNaN(gradeVal) ? gradeVal.toFixed(1).replace('.', ',') + '/20' : 'N/A';
            const evalCount = typeof d.evaluationCount === 'number' ? ` (${d.evaluationCount} éval.)` : '';
            const classStatsStr = excludeClassStats ? '' : this._getClassStatsString(classId, p);
            const scrubbedApp = d.appreciation
                ? this.scrubStudentIdentity(d.appreciation.trim(), studentIdentity, { anonymizePrenom: isAnonymous })
                : '';
            return `${p} : Moy ${g}${evalCount}${classStatsStr}, App "${scrubbedApp || 'N/A'}"`;
        }).join('\n');

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

        const swUser = `Données de l'élève :
${periodsInfoForAnalysis}
${evolutionText}${analysisContext}

Appréciation de référence : "${currentPeriodAppreciation || 'N/A'}"`;

        const swPrompt = `${swSystem}\n\n${swUser}`;

        const nsSystem = `Tu es un enseignant formulant des pistes d'amélioration concrètes pour un élève.
Suggère exactement 3 pistes d'amélioration concrètes pour la période '${currentPeriod}'.
Format obligatoire : liste numérotée (1., 2., 3.). Rédige de manière brève, concise et directe.
Ne rédige aucun préambule, aucune introduction ni conclusion. Réponds directement avec la liste.`;

        const nsUser = `Données de l'élève :
${periodsInfoForAnalysis}
${evolutionText}${analysisContext}

Appréciation de référence : "${currentPeriodAppreciation || 'N/A'}"`;

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
        const ctx = (isOptionsObject ? options.context : options) || (DOM.refinementContext ? DOM.refinementContext.value.trim() : '');
        // Handle legacy call signature: getRefinementPrompt(type, original, contextString)
        const contextStr = typeof ctx === 'string' ? ctx : '';

        const isAnonymous = appState.anonymizeData ?? true;
        const explicitPrenom = isOptionsObject ? (options.prenom || options.studentData?.prenom || '') : '';
        const explicitNom = isOptionsObject ? (options.nom || options.studentData?.nom || '') : '';

        let sanitizedOriginal = original || '';
        let sanitizedContext = contextStr;

        if (explicitPrenom || explicitNom) {
            const identity = { prenom: explicitPrenom, nom: explicitNom };
            sanitizedOriginal = this.scrubStudentIdentity(sanitizedOriginal, identity, { anonymizePrenom: isAnonymous });
            if (sanitizedContext) {
                sanitizedContext = this.scrubStudentIdentity(sanitizedContext, identity, { anonymizePrenom: isAnonymous });
            }
        } else if (Array.isArray(appState.generatedResults) && appState.generatedResults.length > 0) {
            for (const r of appState.generatedResults) {
                const p = r?.prenom || r?.studentData?.prenom || '';
                const n = r?.nom || r?.studentData?.nom || '';
                if (p || n) {
                    sanitizedOriginal = this.scrubStudentIdentity(sanitizedOriginal, { prenom: p, nom: n }, { anonymizePrenom: isAnonymous });
                    if (sanitizedContext) {
                        sanitizedContext = this.scrubStudentIdentity(sanitizedContext, { prenom: p, nom: n }, { anonymizePrenom: isAnonymous });
                    }
                }
            }
        }

        const wordCount = Utils.countWords(original);
        // Strict instruction: raw text only, no formatting, no commentary
        const base = 'IMPORTANT: Réponds uniquement avec le texte brut. Aucune introduction, aucun commentaire, aucun formatage. Ne mets PAS de guillemets autour de la réponse.';
        let instruction = '';

        switch (type) {
            case 'polish':
                // Same length, improved style
                instruction = `Peaufine cette appréciation scolaire : corrige fautes et contradictions, améliore cohérence, fluidité et naturel. Garde le sens, nombre de mots proche.\n\n---\n${sanitizedOriginal}\n---\n\n${base}`;
                break;
            case 'variations':
                // Same length, different wording
                instruction = `Reformule cette appréciation différemment (vocabulaire, structure), même sens, environ ${wordCount} mots.\n\n---\n${sanitizedOriginal}\n---\n\n${base}`;
                break;
            case 'detailed':
                // +20% - Symmetric with concise (-20%)
                instruction = `Développe les points de cette appréciation, environ ${Math.round(wordCount * 1.20)} mots. N'invente pas de faits.\n\n---\n${sanitizedOriginal}\n---\n\n${base}`;
                break;
            case 'concise':
                // -20% reduction
                instruction = `Rends cette appréciation plus concise, environ ${Math.round(wordCount * 0.80)} mots. Garde l'essentiel.\n\n---\n${sanitizedOriginal}\n---\n\n${base}`;
                break;
            case 'encouraging':
                // Same length, warmer tone
                instruction = `Reformule cette appréciation avec un ton plus encourageant et positif, environ ${wordCount} mots.\n\n---\n${sanitizedOriginal}\n---\n\n${base}`;
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
                .map(r => {
                    const gradeRaw = r.studentData?.periods?.[period]?.grade;
                    if (gradeRaw === undefined || gradeRaw === null || gradeRaw === '') return NaN;
                    return typeof gradeRaw === 'number' ? gradeRaw : parseFloat(String(gradeRaw).replace(',', '.'));
                })
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
            const periodeStr = e.periode.replace('-', '->');
            const sign = e.valeur > 0 ? '+' : '';
            const desc = descriptions[e.type] || 'Stable';
            return `Évolution ${periodeStr} : ${desc} (${sign}${e.valeur} pts)`;
        });

        return lines.join('\n');
    },

    /**
     * Génère un hash du prompt d'appréciation pour détecter les changements
     * Utilisé pour le dirty state: si le hash change, les données ont changé
     * @param {Object} studentData - Données de l'élève (comme dans getAllPrompts)
     * @returns {string} Hash du prompt (simple djb2 hash)
     */
    getPromptHash(studentData) {
        try {
            const prompts = this.getAllPrompts(studentData, null, true);
            const promptText = prompts.appreciation;

            // Simple djb2 hash algorithm - fast and good distribution
            let hash = 5381;
            for (let i = 0; i < promptText.length; i++) {
                hash = ((hash << 5) + hash) + promptText.charCodeAt(i);
                hash = hash & hash; // Convert to 32bit integer
            }

            return hash.toString(16);
        } catch (e) {
            console.warn('[PromptService] Failed to generate prompt hash:', e);
            return null;
        }
    }
};
