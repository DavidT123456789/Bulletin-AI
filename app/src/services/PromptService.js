import { appState } from '../state/State.js';
import { DEFAULT_IA_CONFIG, DEFAULT_PROMPT_TEMPLATES } from '../config/Config.js';
import {
    resolveStudentStatus,
    resolveSensitiveStatusEntries,
    GDPR_SENSITIVE_TERMS_SOURCE,
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
     * Placeholder utilisé pour anonymiser le nom/prénom d'un camarade cité dans les textes libres
     * @constant {string}
     */
    CLASSMATE_PLACEHOLDER: '[CAMARADE]',

    /**
     * Placeholder utilisé pour neutraliser une mention médico-scolaire (Art. 9 RGPD) dans les textes libres
     * @constant {string}
     */
    SENSITIVE_PLACEHOLDER: '[AMÉNAGEMENT]',

    /**
     * Particules courtes exclues du découpage individuel des noms composés (ex: "DE LA ROCHE")
     * afin d'éviter de corrompre les articles et prépositions françaises.
     * @constant {Set<string>}
     */
    NAME_PARTICLES: new Set([
        'de', 'du', 'la', 'le', 'les', 'des', 'd', 'l', 'au', 'aux', 'en', 'et', 'el', 'al', 'da', 'di', 'del'
    ]),

    /**
     * Mots français courants fréquents en début de phrase dans une appréciation
     * (protégés en début de phrase contre les faux positifs sur les noms de camarades).
     * @constant {Set<string>}
     */
    SENTENCE_START_COMMON_WORDS: new Set([
        'bon', 'bonne', 'petit', 'petite', 'fort', 'forte', 'grand', 'grande',
        'clair', 'claire', 'juste', 'constance', 'patience', 'prudence',
        'calme', 'sage', 'bien', 'aime', 'libre', 'vif', 'doux', 'franc', 'ferme', 'jeune'
    ]),

    /**
     * Sigles scolaires ou usuels à 2 lettres exclus du masquage d'initiales "P.N."
     * @constant {Set<string>}
     */
    IGNORED_INITIALISMS: new Set(['DM', 'DS', 'TP', 'TD', 'NB', 'PS', 'CV', 'JC', 'PP', 'AP']),

    /**
     * Prénoms à h aspiré (pas d'élision de/que -> d'/qu')
     * @constant {Set<string>}
     */
    ASPIRATED_H_PRENOMS: new Set(['harry', 'harold', 'harvey', 'harley', 'hayden', 'hans', 'heidi', 'hao']),

    /**
     * Cache pour les statistiques de classe calculées
     * @type {Map<string, string>}
     */
    _classStatsCache: new Map(),

    /**
     * Normalise une chaîne de nom (sans accents, minuscules, trim) pour comparaisons et clés.
     * @param {string} value
     * @returns {string}
     * @private
     */
    _normalizeNameKey(value) {
        if (typeof value !== 'string') return '';
        return value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    },

    /**
     * Découpe un nom ou prénom composé en jetons significatifs (>= 2 lettres, hors particules).
     * @param {string} name
     * @returns {string[]}
     * @private
     */
    _splitNameParts(name) {
        if (typeof name !== 'string' || !name.trim()) return [];
        return name
            .trim()
            .split(/[\s'’-]+/)
            .map(p => p.trim())
            .filter(part => part.length >= 2 && !this.NAME_PARTICLES.has(this._normalizeNameKey(part)));
    },

    /**
     * Construit un motif regex insensible aux accents pour un jeton nominal.
     * En mode `requireInitialUppercase`, la première lettre doit être majuscule (regex compilée sans flag `i`).
     * En mode `expandCaseClasses`, toutes les lettres incluent minuscule et majuscule (pour usage en regex sans flag `i`).
     * @param {string} token
     * @param {{ requireInitialUppercase?: boolean, expandCaseClasses?: boolean }} [options]
     * @returns {string}
     * @private
     */
    _buildAccentInsensitivePattern(token, { requireInitialUppercase = false, expandCaseClasses = false } = {}) {
        const charMap = {
            a: 'aàáâãäåāăą',
            c: 'cçćĉċč',
            e: 'eèéêëēĕėęě',
            i: 'iìíîïĩīĭįı',
            n: 'nñńņň',
            o: 'oòóôõöøōŏő',
            u: 'uùúûüũūŭůűų',
            y: 'yýÿŷ'
        };
        const useExplicitCase = requireInitialUppercase || expandCaseClasses;
        const normalized = token.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        let pattern = '';
        for (let i = 0; i < normalized.length; i++) {
            const ch = normalized[i];
            const lower = ch.toLowerCase();
            if (charMap[lower]) {
                const chars = charMap[lower];
                if (requireInitialUppercase && i === 0) {
                    pattern += `[${chars.toUpperCase()}]`;
                } else if (useExplicitCase) {
                    pattern += `[${chars}${chars.toUpperCase()}]`;
                } else {
                    pattern += `[${chars}]`;
                }
            } else if (/[\s'’-]/.test(ch)) {
                pattern += "[\\s'’-]+";
            } else if (useExplicitCase && lower !== ch.toUpperCase()) {
                const escLower = lower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const escUpper = ch.toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                pattern += (requireInitialUppercase && i === 0) ? escUpper : `[${escLower}${escUpper}]`;
            } else {
                pattern += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            }
        }
        return pattern;
    },

    /**
     * Construit le motif regex de l'initiale d'un prénom ou nom (supporte les formes composées ex: "J.-L.").
     * @param {string} name
     * @param {{ uppercaseOnly?: boolean, allowCompound?: boolean }} [options]
     * @returns {string}
     * @private
     */
    _buildInitialPattern(name, { uppercaseOnly = false, allowCompound = false } = {}) {
        if (typeof name !== 'string' || !name.trim()) return '';
        const trimmed = name.trim();
        const firstChar = trimmed[0];
        if (!/\p{L}/u.test(firstChar)) return '';
        const firstPattern = this._buildAccentInsensitivePattern(firstChar, { requireInitialUppercase: uppercaseOnly });

        if (allowCompound) {
            const parts = this._splitNameParts(trimmed);
            if (parts.length >= 2 && /\p{L}/u.test(parts[0][0]) && /\p{L}/u.test(parts[1][0])) {
                const p1 = this._buildAccentInsensitivePattern(parts[0][0], { requireInitialUppercase: uppercaseOnly });
                const p2 = this._buildAccentInsensitivePattern(parts[1][0], { requireInitialUppercase: uppercaseOnly });
                return `(?:${p1}\\.?\\s*-?\\s*${p2}|${firstPattern})`;
            }
        }
        return firstPattern;
    },

    /**
     * Résout la liste des camarades de la même classe (hors élève cible) pour le masquage [CAMARADE].
     * @param {Object} [identity={}] - Identité de l'élève cible ({ id, prenom, nom })
     * @param {string|null} [classId=null] - Identifiant de classe (physique ou virtual_*)
     * @param {Array<{id?: string, prenom?: string, nom?: string}>|null} [explicitClassmates=null]
     * @returns {Array<{prenom: string, nom: string}>}
     * @private
     */
    _resolveClassmates(identity = {}, classId = null, explicitClassmates = null) {
        const source = Array.isArray(explicitClassmates)
            ? explicitClassmates
            : (Array.isArray(appState.generatedResults) ? appState.generatedResults : []);

        if (source.length === 0) return [];

        const targetId = identity?.id ?? null;
        const targetPrenomNorm = this._normalizeNameKey(identity?.prenom);
        const targetNomNorm = this._normalizeNameKey(identity?.nom);
        const isVirtualClass = typeof classId === 'string' && classId.startsWith('virtual_');
        const virtualNorm = isVirtualClass ? classId.slice('virtual_'.length) : '';

        const classmates = [];
        const seen = new Set();

        for (const item of source) {
            if (!item || typeof item !== 'object') continue;

            if (!Array.isArray(explicitClassmates)) {
                const itemClassId = item.classId || item.studentData?.classId || null;
                if (isVirtualClass) {
                    const rawOrigin = String(item.studentData?.classe || item.classe || item.originClass || '').trim();
                    const itemNorm = typeof Utils.normalizeClassName === 'function'
                        ? Utils.normalizeClassName(rawOrigin)
                        : rawOrigin.toLowerCase().replace(/\s+/g, '');
                    if (!itemNorm || itemNorm !== virtualNorm) continue;
                } else if (classId) {
                    if (itemClassId !== classId) continue;
                } else if (itemClassId) {
                    continue;
                }
            }

            const cId = item.id ?? item.studentData?.id ?? null;
            const cPrenom = String(item.prenom ?? item.studentData?.prenom ?? '').trim();
            const cNom = String(item.nom ?? item.studentData?.nom ?? '').trim();
            if (!cPrenom && !cNom) continue;

            if (targetId && cId && cId === targetId) continue;
            const cPrenomNorm = this._normalizeNameKey(cPrenom);
            const cNomNorm = this._normalizeNameKey(cNom);
            if ((targetPrenomNorm || targetNomNorm) && cPrenomNorm === targetPrenomNorm && cNomNorm === targetNomNorm) {
                continue;
            }

            const dedupKey = `${cPrenomNorm}|${cNomNorm}`;
            if (seen.has(dedupKey)) continue;
            seen.add(dedupKey);
            classmates.push({ prenom: cPrenom, nom: cNom });
        }

        return classmates;
    },

    /**
     * Neutralise les termes médico-scolaires et données de santé (Art. 9 RGPD) dans un texte libre.
     * @param {string} text
     * @returns {string}
     */
    scrubSensitiveText(text) {
        if (!text || typeof text !== 'string') return text || '';
        const regex = new RegExp(
            `(?<![\\p{L}\\p{N}_\\[])${GDPR_SENSITIVE_TERMS_SOURCE}(?![\\p{L}\\p{N}_\\]])`,
            'giu'
        );
        return text.replace(regex, this.SENSITIVE_PLACEHOLDER);
    },

    /**
     * Supprime ou pseudonymise toute occurrence du prénom/nom/initiales de l'élève cible,
     * des camarades de classe ([CAMARADE]) et des mentions médico-scolaires Art. 9 ([AMÉNAGEMENT]).
     * Le nom de famille est systématiquement masqué ; le prénom cible est masqué lorsque l'anonymisation est active.
     * @param {string} text - Texte libre (appréciation passée, observation, note du journal, contexte, synthèse)
     * @param {Object} [identity] - Identité de l'élève cible ({ id, prenom, nom, classId })
     * @param {Object} [options] - Options ({ anonymizePrenom, classId, studentId, classmates, classmatePlaceholder, scrubSensitive })
     * @returns {string} Texte nettoyé
     */
    scrubStudentIdentity(text, identity = {}, options = {}) {
        if (!text || typeof text !== 'string') return text || '';

        const isAnonymous = options.anonymizePrenom ?? (appState.anonymizeData ?? true);
        const shouldScrubSensitive = options.scrubSensitive ?? true;
        const classmatePlaceholder = options.classmatePlaceholder || this.CLASSMATE_PLACEHOLDER;
        const prenom = typeof identity?.prenom === 'string' ? identity.prenom.trim() : '';
        const nom = typeof identity?.nom === 'string' ? identity.nom.trim() : '';

        const resolvedClassId = options.classId !== undefined
            ? options.classId
            : (identity?.classId ?? appState.currentClassId ?? null);
        const classmates = options.classmates === false
            ? []
            : this._resolveClassmates(
                { id: options.studentId ?? identity?.id ?? null, prenom, nom },
                resolvedClassId,
                Array.isArray(options.classmates) ? options.classmates : null
            );

        let result = text;

        const replaceToken = (input, rawToken, replacement) => {
            if (!rawToken || rawToken.length < 2) return input;
            const pattern = this._buildAccentInsensitivePattern(rawToken);
            const regex = new RegExp(`(?<![\\p{L}\\p{N}_\\[])${pattern}(?![\\p{L}\\p{N}_\\]])`, 'giu');
            return input.replace(regex, replacement);
        };

        const replaceCompoundForms = (input, rawPrenom, rawNom, replacement) => {
            if (rawPrenom.length < 2 || rawNom.length < 2) return input;
            let out = input;
            const pPattern = this._buildAccentInsensitivePattern(rawPrenom);
            const nPattern = this._buildAccentInsensitivePattern(rawNom);

            // "Prénom Nom" et "Nom Prénom"
            const fullForward = new RegExp(`(?<![\\p{L}\\p{N}_\\[])${pPattern}[\\s-]+${nPattern}(?![\\p{L}\\p{N}_\\]])`, 'giu');
            const fullBackward = new RegExp(`(?<![\\p{L}\\p{N}_\\[])${nPattern}[\\s-]+${pPattern}(?![\\p{L}\\p{N}_\\]])`, 'giu');
            out = out.replace(fullForward, replacement).replace(fullBackward, replacement);

            // "Prénom N." (avec point) et "Prénom N" (majuscule stricte hors A/Y)
            const nInitAny = this._buildInitialPattern(rawNom);
            if (nInitAny) {
                const prenomInitDotted = new RegExp(`(?<![\\p{L}\\p{N}_\\[])${pPattern}[\\s-]+${nInitAny}\\.(?![\\p{L}\\p{N}_])`, 'giu');
                out = out.replace(prenomInitDotted, replacement);

                const nFirstNorm = this._normalizeNameKey(rawNom)[0]?.toUpperCase() || '';
                if (nFirstNorm && nFirstNorm !== 'A' && nFirstNorm !== 'Y') {
                    const pAnyCase = this._buildAccentInsensitivePattern(rawPrenom, { expandCaseClasses: true });
                    const nInitUpper = this._buildInitialPattern(rawNom, { uppercaseOnly: true });
                    const prenomInitUpper = new RegExp(`(?<![\\p{L}\\p{N}_\\[])${pAnyCase}[\\s-]+${nInitUpper}(?![\\p{L}\\p{N}_.])`, 'gu');
                    out = out.replace(prenomInitUpper, replacement);
                }
            }

            // "P. Nom" (ou "J.-L. Nom")
            const pInitDotted = this._buildInitialPattern(rawPrenom, { allowCompound: true });
            if (pInitDotted) {
                const initNom = new RegExp(`(?<![\\p{L}\\p{N}_\\[])${pInitDotted}\\.\\s*${nPattern}(?![\\p{L}\\p{N}_\\]])`, 'giu');
                out = out.replace(initNom, replacement);
            }

            return out;
        };

        // 1. Formes composées & initiales de l'élève cible ("Prénom Nom", "Nom Prénom", "Prénom N.", "P. Nom", "P.N.")
        if (prenom.length >= 2 && nom.length >= 2) {
            const fullNameReplacement = isAnonymous ? this.PRENOM_PLACEHOLDER : prenom;
            result = replaceCompoundForms(result, prenom, nom, fullNameReplacement);

            if (isAnonymous) {
                const pFirstNorm = this._normalizeNameKey(prenom)[0]?.toUpperCase() || '';
                const nFirstNorm = this._normalizeNameKey(nom)[0]?.toUpperCase() || '';
                const pairCode = `${pFirstNorm}${nFirstNorm}`;
                if (pFirstNorm && nFirstNorm && !this.IGNORED_INITIALISMS.has(pairCode)) {
                    const pInitUpper = this._buildInitialPattern(prenom, { uppercaseOnly: true });
                    const nInitUpper = this._buildInitialPattern(nom, { uppercaseOnly: true });
                    const dottedPair = new RegExp(`(?<![\\p{L}\\p{N}_.\\[])${pInitUpper}\\.\\s*${nInitUpper}\\.(?![\\p{L}\\p{N}_])`, 'gu');
                    result = result.replace(dottedPair, this.PRENOM_PLACEHOLDER);
                }
            }
        }

        // 2. Formes composées des camarades (AVANT les jetons isolés cible pour bien gérer fratries et homonymes)
        for (const mate of classmates) {
            result = replaceCompoundForms(result, mate.prenom, mate.nom, classmatePlaceholder);
        }

        // 3. Nom de famille cible (toujours masqué, même si anonymizeData === false ; particules courtes exclues)
        if (nom.length >= 2) {
            if (this.NAME_PARTICLES.has(this._normalizeNameKey(nom))) {
                const upperNom = nom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').toUpperCase();
                result = result.replace(new RegExp(`(?<![\\p{L}\\p{N}_\\[])${upperNom}(?![\\p{L}\\p{N}_\\]])`, 'gu'), this.NOM_PLACEHOLDER);
            } else {
                result = replaceToken(result, nom, this.NOM_PLACEHOLDER);
                if (/[\s'’-]+/.test(nom)) {
                    for (const part of this._splitNameParts(nom)) {
                        result = replaceToken(result, part, this.NOM_PLACEHOLDER);
                    }
                }
            }
        }

        // 4. Prénom cible (masqué lorsque anonymizeData est actif ; particules courtes exclues)
        if (isAnonymous && prenom.length >= 2) {
            result = replaceToken(result, prenom, this.PRENOM_PLACEHOLDER);
            if (/[\s'’-]+/.test(prenom)) {
                for (const part of this._splitNameParts(prenom)) {
                    result = replaceToken(result, part, this.PRENOM_PLACEHOLDER);
                }
            }
        }

        // 5. Jetons isolés des camarades (majuscule initiale obligatoire + garde mots courants en début de phrase)
        if (classmates.length > 0) {
            const protectedTargetTokens = new Set(
                [prenom, nom, ...this._splitNameParts(prenom), ...this._splitNameParts(nom)]
                    .map(t => this._normalizeNameKey(t))
                    .filter(Boolean)
            );
            const mateTokenMap = new Map();
            for (const mate of classmates) {
                const candidates = [
                    mate.prenom,
                    mate.nom,
                    ...this._splitNameParts(mate.prenom),
                    ...this._splitNameParts(mate.nom)
                ];
                for (const rawTok of candidates) {
                    const tok = typeof rawTok === 'string' ? rawTok.trim() : '';
                    if (tok.length < 2) continue;
                    const norm = this._normalizeNameKey(tok);
                    if (!norm || this.NAME_PARTICLES.has(norm) || protectedTargetTokens.has(norm)) continue;
                    if (!mateTokenMap.has(norm)) {
                        mateTokenMap.set(norm, tok);
                    }
                }
            }

            const sortedMateTokens = Array.from(mateTokenMap.values()).sort((a, b) => b.length - a.length);
            for (const tok of sortedMateTokens) {
                const capPattern = this._buildAccentInsensitivePattern(tok, { requireInitialUppercase: true });
                const regex = new RegExp(`(?<![\\p{L}\\p{N}_\\[])${capPattern}(?![\\p{L}\\p{N}_\\]])`, 'gu');
                result = result.replace(regex, (match, offset, fullStr) => {
                    const lowerMatch = match.toLowerCase();
                    if (this.SENTENCE_START_COMMON_WORDS.has(lowerMatch)) {
                        const before = fullStr.slice(0, offset);
                        if (/(?:^|[.!?\n«"]\s*)$/.test(before)) {
                            return match;
                        }
                    }
                    return classmatePlaceholder;
                });
            }
        }

        // 6. Mentions médico-scolaires / santé (Art. 9 RGPD) en texte libre
        if (shouldScrubSensitive) {
            result = this.scrubSensitiveText(result);
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
     * Détermine si un prénom français déclenche l'élision (voyelle initiale, y + consonne ou h muet).
     * @param {string} prenom
     * @returns {boolean}
     * @private
     */
    _needsFrenchElision(prenom) {
        const trimmed = typeof prenom === 'string' ? prenom.trim() : '';
        if (!trimmed) return false;
        const lower = trimmed.toLowerCase();
        const first = lower[0];

        if (/^[aàáâãäåeèéêëiìíîïoòóôõöœuùúûüæ]/u.test(first)) {
            return true;
        }
        if (first === 'y') {
            return lower.length > 1 && !/^[aàáâãäåeèéêëiìíîïoòóôõöœuùúûüæy]/u.test(lower[1]);
        }
        if (first === 'h') {
            const baseFirstWord = lower.split(/[\s-]+/)[0].normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            if (this.ASPIRATED_H_PRENOMS.has(baseFirstWord)) return false;
            return lower.length > 1 && /^[aàáâãäåeèéêëiìíîïoòóôõöœuùúûüæy]/u.test(lower[1]);
        }
        return false;
    },

    /**
     * Réinjecte le vrai prénom à la place du placeholder [PRÉNOM] (avec élision française de/que/lorsque/puisque/quoique)
     * et nettoie tout [NOM] résiduel.
     * @param {string} text
     * @param {string} prenom
     * @returns {string}
     */
    deanonymizeText(text, prenom) {
        if (!text || typeof text !== 'string') return text;
        let result = text;
        const cleanPrenom = typeof prenom === 'string' ? prenom.trim() : '';
        if (cleanPrenom) {
            if (this._needsFrenchElision(cleanPrenom)) {
                result = result.replace(
                    /(?<![\p{L}\p{N}_'’])(de|que|lorsque|puisque|quoique)\s+\[pr[eéèêëėẻẽ]nom\]/giu,
                    (_, prefix) => `${prefix.slice(0, -1)}'${cleanPrenom}`
                );
            }
            result = result.replace(/\[pr[eéèêëėẻẽ]nom\]/gi, cleanPrenom);
        }
        result = result
            .replace(/\s*\[nom\]/gi, '')
            .replace(/(?<![\p{L}\p{N}_])(des|les|ses|ces|certains|certaines|quelques)\s+\[camarade\]/giu, '$1 camarades')
            .replace(/(?<![\p{L}\p{N}_])(un|une|le|la|son|sa|ce|cet|cette)\s+\[camarade\]/giu, '$1 camarade')
            .replace(/\[camarade\]/gi, 'un camarade')
            .replace(/(?<![\p{L}\p{N}_])(des|les|ses|ces)\s+\[am[eéèê]nagement\]/giu, '$1 aménagements')
            .replace(/(?<![\p{L}\p{N}_])(un|cet|son|ce)\s+\[am[eéèê]nagement\]/giu, '$1 accompagnement')
            .replace(/(?<![\p{L}\p{N}_])(l|d)(['’])\s*\[am[eéèê]nagement\]/giu, '$1$2accompagnement')
            .replace(/\[am[eéèê]nagement\]/gi, 'un accompagnement adapté');
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

        const addSensitiveInstructionsFor = (rawStatus) => {
            const sensitiveEntries = resolveSensitiveStatusEntries(rawStatus);
            if (sensitiveEntries.length > 0) {
                for (const entry of sensitiveEntries) {
                    addInstruction(entry.promptInstruction);
                }
            } else {
                addInstruction(DEFAULT_GDPR_SENSITIVE_PROMPT_INSTRUCTION);
            }
        };

        for (const rawStatus of activeStatuses) {
            const trimmed = String(rawStatus || '').trim();
            if (!trimmed) continue;

            const statusMeta = resolveStudentStatus(trimmed);
            if (statusMeta) {
                const instruction = typeof statusMeta.formatPromptInstruction === 'function'
                    ? statusMeta.formatPromptInstruction(trimmed)
                    : statusMeta.promptInstruction;
                addInstruction(instruction);

                if (!statusMeta.isGdprSensitive && GDPR_SENSITIVE_STATUS_PATTERN.test(trimmed)) {
                    addSensitiveInstructionsFor(trimmed);
                }
            } else if (GDPR_SENSITIVE_STATUS_PATTERN.test(trimmed)) {
                addSensitiveInstructionsFor(trimmed);
            } else {
                addInstruction(`Contexte pédagogique : ${trimmed}.`);
            }
        }

        return instructions.join(' ');
    },

    /**
     * Nettoie légèrement la sortie texte d'un LLM : retire uniquement un éventuel préfixe parasite
     * (type « Appréciation : », « Voici l'appréciation : ») et les guillemets englobants équilibrés,
     * sans jamais altérer la ponctuation interne.
     * @param {string} text
     * @returns {string}
     */
    sanitizeAppreciationOutput(text) {
        if (!text || typeof text !== 'string') return text || '';
        let cleaned = text.trim();

        cleaned = cleaned.replace(
            /^(?:\*\*)?(?:voici\s+(?:(?:l['’]appr[eé]ciation|la\s+synth[eè]se)(?:\s+(?:scolaire|globale|propos[eé]e|r[eé]vis[eé]e|sugg[eé]r[eé]e|finale)){0,2}|une\s+proposition(?:\s+(?:d['’]appr[eé]ciation|de\s+synth[eè]se))?)|(?:appr[eé]ciation|synth[eè]se)(?:\s+(?:scolaire|globale|propos[eé]e|r[eé]vis[eé]e|sugg[eé]r[eé]e|finale)){0,2}|proposition(?:\s+(?:d['’]appr[eé]ciation|de\s+synth[eè]se))?)(?:\*\*)?\s*:\s*/i,
            ''
        ).trim();

        const quotePairs = [
            ['"', '"'],
            ['«', '»'],
            ['“', '”']
        ];
        for (let pass = 0; pass < 2; pass++) {
            let stripped = false;
            for (const [open, close] of quotePairs) {
                if (cleaned.length >= 2 && cleaned.startsWith(open) && cleaned.endsWith(close)) {
                    const inner = cleaned.slice(1, -1);
                    if (!inner.includes(close)) {
                        cleaned = inner.trim();
                        stripped = true;
                        break;
                    }
                }
            }
            if (!stripped) break;
        }

        return cleaned;
    },

    /**
     * Traduit une cible en mots en gabarit combiné (mots + nombre de phrases + paragraphe unique)
     * plus fiable sur les petits et moyens modèles (7B-24B).
     * @param {number} wordCount
     * @returns {string}
     * @private
     */
    _formatLengthInstruction(wordCount) {
        let sentenceRange = '2 à 3 phrases';
        if (wordCount <= 25) {
            sentenceRange = '1 à 2 phrases courtes';
        } else if (wordCount <= 45) {
            sentenceRange = '2 phrases';
        } else if (wordCount > 70) {
            sentenceRange = '3 à 4 phrases';
        }
        return `environ ${wordCount} mots (${sentenceRange}, en un seul paragraphe)`;
    },

    /**
     * Extrait la synthèse du journal de bord pour le prompt (via JournalManager ou depuis studentData.journal).
     * @param {Object} studentData
     * @param {string} currentPeriod
     * @returns {string}
     * @private
     */
    _extractJournalSynthesis(studentData, currentPeriod) {
        if (!studentData) return '';

        const resolvedClassId = studentData.classId
            || (studentData.id ? appState.generatedResults?.find(s => s.id === studentData.id)?.classId : null)
            || null;
        if (JournalManager.isIncludedInAI?.(resolvedClassId) === false) {
            return '';
        }

        const fromManager = JournalManager.synthesizeForPrompt(studentData, currentPeriod);
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
     * Retourne la limite maximale de caractères active (Pronote / ÉcoleDirecte / LSU), ou null si désactivée.
     * Source unique de vérité pour l'ensemble de l'interface et des prompts.
     * @param {Object|null} [overrideConfig=null]
     * @returns {number|null}
     */
    getActiveMaxChars(overrideConfig = null) {
        const iaConfig = this._resolveIaConfig(overrideConfig);
        return typeof Utils.normalizeMaxChars === 'function'
            ? Utils.normalizeMaxChars(iaConfig?.maxChars)
            : null;
    },

    /**
     * Calcule le budget effectif en caractères envoyé au LLM en tenant compte d'un éventuel prénom plus long
     * que le placeholder `[PRÉNOM]` lors de la désanonymisation locale.
     * @param {number} maxChars
     * @param {{ prenom?: string, isAnonymous?: boolean }} [options={}]
     * @returns {number}
     * @private
     */
    _computeEffectiveCharBudget(maxChars, { prenom = '', isAnonymous = false } = {}) {
        const cleanPrenom = typeof prenom === 'string' ? prenom.trim() : '';
        const prenomDelta = (isAnonymous && cleanPrenom)
            ? Math.max(0, cleanPrenom.length - this.PRENOM_PLACEHOLDER.length)
            : 0;
        return Math.max(40, maxChars - prenomDelta);
    },

    /**
     * Traduit un budget de caractères en plafond indicatif de mots avec marge de sécurité (~14 %)
     * afin d'éviter les consignes contradictoires sur les modèles 7B–24B.
     * @param {number} charBudget
     * @returns {number}
     * @private
     */
    _computeSafeWordCap(charBudget) {
        return Utils.computeSafeWordCap(charBudget);
    },

    /**
     * Extrait les réglages de style qui modifient réellement le prompt
     * (ton désactivé et consignes personnalisées désactivées ou vides exclus).
     * Source unique des réglages de style injectés dans le prompt.
     * @param {Object} [iaConfig={}] - Configuration IA effective
     * @returns {{tone: number|null, voice: string, length: number|null, maxChars: number|null, styleInstructions: string, discipline: string}}
     * @private
     */
    _getEffectiveStyle(iaConfig = {}) {
        const isToneActive = iaConfig.enableTone ?? (iaConfig.tone !== 3 && iaConfig.tone !== undefined);
        const hasStyleInstructions = !!iaConfig.styleInstructions && iaConfig.enableStyleInstructions !== false;
        const maxChars = typeof Utils.normalizeMaxChars === 'function'
            ? Utils.normalizeMaxChars(iaConfig.maxChars)
            : null;
        return {
            tone: isToneActive ? (iaConfig.tone ?? 3) : null,
            voice: iaConfig.voice || '',
            length: iaConfig.length || null,
            maxChars,
            styleInstructions: hasStyleInstructions ? iaConfig.styleInstructions : '',
            discipline: iaConfig.discipline || ''
        };
    },

    /**
     * Convertit une moyenne saisie (nombre ou chaîne « 12,5 ») en nombre via StatsService.
     * @param {number|string|null|undefined} raw - Moyenne brute
     * @returns {number} Moyenne numérique, ou NaN si absente ou invalide
     * @private
     */
    _parseGrade(raw) {
        return StatsService.parseGrade(raw);
    },

    /**
     * Extrait une amorce courte (3–5 mots) d'une appréciation brute AVANT désanonymisation,
     * en remplaçant aussi le prénom réel par [PRÉNOM] par sécurité RGPD (même si anonymisation désactivée).
     * @param {string} rawText - Sortie nettoyée du LLM
     * @param {string} [prenom=''] - Prénom réel de l'élève à masquer si présent
     * @param {number} [maxWords=5] - Nombre maximal de mots conservés
     * @returns {string} Amorce normalisée ou chaîne vide si trop courte
     */
    extractOpeningSnippet(rawText, prenom = '', maxWords = 5) {
        if (typeof rawText !== 'string') return '';
        let cleaned = rawText.replace(/\s+/g, ' ').trim();
        if (!cleaned) return '';

        const cleanPrenom = typeof prenom === 'string' ? prenom.trim() : '';
        if (cleanPrenom.length >= 2) {
            const escapedPrenom = cleanPrenom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const boundaryRegex = new RegExp(`(?<![\\p{L}\\p{N}_])${escapedPrenom}(?![\\p{L}\\p{N}_])`, 'giu');
            cleaned = cleaned.replace(boundaryRegex, this.PRENOM_PLACEHOLDER);
        }

        // Prendre le début de la première phrase uniquement
        const firstSentence = cleaned.split(/[.!?](?:\s|$)/)[0].trim();
        const words = firstSentence.split(/\s+/).filter(Boolean).slice(0, maxWords);
        if (words.length < 2) return '';

        return words.join(' ').replace(/[,;:«»"']+$/g, '').trim();
    },

    /**
     * Ajoute une amorce récente dans une fenêtre glissante dédupliquée (utilisée en génération par lot).
     * @param {string[]} recentOpenings - Fenêtre mutable des amorces récentes
     * @param {string} snippet - Amorce extraite
     * @param {number} [maxSize=5] - Taille maximale de la fenêtre
     */
    pushOpeningSnippet(recentOpenings, snippet, maxSize = 5) {
        if (!Array.isArray(recentOpenings) || typeof snippet !== 'string') return;
        const normalized = snippet.trim();
        if (!normalized) return;
        const lower = normalized.toLowerCase();
        const existingIdx = recentOpenings.findIndex(s => s.toLowerCase() === lower);
        if (existingIdx !== -1) recentOpenings.splice(existingIdx, 1);
        recentOpenings.push(normalized);
        while (recentOpenings.length > maxSize) {
            recentOpenings.shift();
        }
    },

    getAllPrompts(studentData, overrideConfig = null, excludeClassStats = false, runtimeOptions = null) {
        const { nom, prenom, statuses, periods, currentPeriod } = studentData;
        const allPeriods = Utils.getPeriods();
        const currentPeriodIndex = allPeriods.indexOf(currentPeriod);
        const relevantPeriods = allPeriods.slice(0, currentPeriodIndex + 1);

        // GESTION DE LA CONFIDENTIALITÉ
        // Si anonymisation désactivée, on utilise le prénom mais JAMAIS le nom de famille
        // [FIX] Utiliser appState.anonymizeData (proxy plat) au lieu de appState.privacy.anonymizeData
        const isAnonymous = appState.anonymizeData ?? true;
        const classId = studentData.classId || appState.currentClassId || null;
        const studentIdentity = { id: studentData.id ?? null, prenom, nom, classId };
        const classmates = this._resolveClassmates(studentIdentity, classId);
        const scrubOptions = {
            anonymizePrenom: isAnonymous,
            classId,
            studentId: studentIdentity.id,
            classmates,
            scrubSensitive: true
        };

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
            ? this.scrubStudentIdentity(rawPeriodContext, studentIdentity, scrubOptions)
            : '';
        const rawJournalSynthesis = this._extractJournalSynthesis(studentData, currentPeriod);
        const journalSynthesis = rawJournalSynthesis
            ? this.scrubStudentIdentity(rawJournalSynthesis, studentIdentity, scrubOptions)
            : '';
        const hasContext = !!(periodContext?.trim() || journalSynthesis?.trim());

        const hasNoData = !hasGrades && !hasContext;
        const currentPeriodData = periods?.[currentPeriod] || {};
        const currentGradeRaw = currentPeriodData.grade;
        const currentGradeVal = this._parseGrade(currentGradeRaw);
        const hasCurrentGrade = !isNaN(currentGradeVal);
        const currentEvalCount = typeof currentPeriodData.evaluationCount === 'number'
            ? currentPeriodData.evaluationCount
            : null;

        const iaConfig = this._resolveIaConfig(overrideConfig);

        // Pré-calcul des lignes de périodes pour connaître précisément la présence de statistiques de classe
        // [FIX] N'inclure l'appréciation que pour les périodes PRÉCÉDENTES en génération
        // afin d'éviter que l'IA ne s'inspire de l'ancienne appréciation lors d'une régénération
        const periodRows = relevantPeriods.map(p => {
            const d = periods?.[p] || {};
            const gradeRaw = d.grade;
            const gradeVal = this._parseGrade(gradeRaw);
            const g = !isNaN(gradeVal) ? gradeVal.toFixed(1).replace('.', ',') + '/20' : 'Non renseignée';
            const evalCount = typeof d.evaluationCount === 'number' ? ` (${d.evaluationCount} éval.)` : '';
            const classStatsStr = excludeClassStats ? '' : this._getClassStatsString(classId, p);
            const classComparisonStr = excludeClassStats ? '' : this._getClassComparisonString(classId, p, gradeVal);
            const scrubbedApp = d.appreciation
                ? this.scrubStudentIdentity(d.appreciation.trim(), studentIdentity, scrubOptions)
                : '';
            const prefixForGeneration = `${p} : Moy ${g}${evalCount}${classStatsStr}, Appréciation : `;
            const prefixForAnalysis = `${p} : Moy ${g}${evalCount}${classStatsStr}${classComparisonStr}, Appréciation : `;
            const storedAppText = `"${scrubbedApp || 'N/A'}"`;
            return {
                forGeneration: `${prefixForGeneration}${p === currentPeriod ? '[à générer]' : storedAppText}`,
                forAnalysis: `${prefixForAnalysis}${storedAppText}`,
                hasClassStats: Boolean(classStatsStr),
                scrubbedApp
            };
        });
        const hasAnyClassStats = periodRows.some(r => r.hasClassStats);

        const activeStatuses = Array.isArray(statuses) && statuses.length > 0
            ? (typeof Utils.getActiveStatuses === 'function' ? Utils.getActiveStatuses(statuses, currentPeriod) : statuses)
            : [];
        const hasAccompanimentStatus = activeStatuses.some(raw => {
            const trimmed = String(raw || '').trim();
            if (!trimmed) return false;
            const meta = resolveStudentStatus(trimmed);
            return Boolean(meta?.isGdprSensitive || GDPR_SENSITIVE_STATUS_PATTERN.test(trimmed));
        });

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

        // Instruction critique sur la cohérence note/appréciation et les cas limites (placée en tête)
        if (!hasNoData) {
            const coherenceNotes = [];
            if (hasGrades) {
                const evolutionClause = filteredEvolutions.length > 0 ? ' et son évolution' : '';
                const missingCurrentGradeNote = hasCurrentGrade
                    ? ''
                    : " Si la période courante n'a pas de moyenne, le signaler factuellement sans inventer de résultats.";
                coherenceNotes.push(
                    `L'appréciation doit être cohérente avec le niveau de réussite suggéré par la moyenne${evolutionClause}, tout en tenant compte du contexte fourni sur l'élève.${missingCurrentGradeNote}`
                );
                if (hasCurrentGrade) {
                    if (currentEvalCount === 1) {
                        coherenceNotes.push("La moyenne de la période repose sur une seule évaluation : nuance le constat sans généraliser.");
                    }
                    if (currentGradeVal >= 18) {
                        coherenceNotes.push("Les résultats sont excellents : valorise cette maîtrise avec sobriété sans inventer d'axe d'amélioration artificiel si aucune fragilité n'est signalée.");
                    } else if (currentGradeVal < 6) {
                        coherenceNotes.push("Les résultats sont très fragiles : reste factuel, professionnel et constructif avec une piste de remédiation simple, sans formulation décourageante.");
                    }
                }
            } else {
                coherenceNotes.push("Aucune moyenne chiffrée n'est disponible : appuie-toi uniquement sur le contexte et les observations fournis, sans inventer ni suggérer de niveau chiffré.");
            }
            systemParts.push(coherenceNotes.join(' '));
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
            if (effectiveStyle.tone >= 4 && hasAccompanimentStatus) {
                styleParts.push(`En présence de consignes d'accompagnement pour cet élève, maintiens l'exigence sur le travail tout en préservant une formulation respectueuse et constructive.`);
            }
        }

        const voiceInstruction = {
            'je': 'Rédige à la première personne du singulier, sans commencer chaque phrase par « je ».',
            'nous': 'Rédige à la première personne du pluriel (« nous »), au nom de l\'équipe pédagogique.',
            'neutre': 'Rédige dans un style impersonnel et factuel, sans prénom ni pronom désignant l\'élève ou l\'enseignant (les tournures impersonnelles comme « il convient de » restent possibles).'
        }[iaConfig.voice] || 'Rédige à la troisième personne dans un style de bulletin scolaire naturel, sans utiliser « je » ni « nous ».';

        styleParts.push(voiceInstruction);

        if (!isNeutralVoice && !hasNoData) {
            styleParts.push(`Ne t'adresse pas directement à l'élève (ni « tu » ni « vous ») et cite son prénom une fois au maximum.`);
        }

        const effectiveCharBudget = effectiveStyle.maxChars
            ? this._computeEffectiveCharBudget(effectiveStyle.maxChars, { prenom, isAnonymous })
            : null;

        if (!hasNoData) {
            if (effectiveCharBudget) {
                const safeWordCap = this._computeSafeWordCap(effectiveCharBudget);
                const effectiveWordTarget = effectiveStyle.length
                    ? Math.min(effectiveStyle.length, safeWordCap)
                    : safeWordCap;
                styleParts.push(
                    `Longueur visée : ${this._formatLengthInstruction(effectiveWordTarget)}, sans jamais dépasser ${effectiveCharBudget} caractères (espaces compris). Le naturel prime sur le décompte : reste plus bref si les données sont succinctes.`
                );
            } else if (effectiveStyle.length) {
                styleParts.push(`Longueur visée : ${this._formatLengthInstruction(effectiveStyle.length)}. Le naturel prime sur le décompte : reste plus bref si les données sont succinctes.`);
            }
        }
        if (!hasNoData && hasGrades) {
            if (hasAnyClassStats) {
                styleParts.push(`Ne cite ni les moyennes ni les statistiques de classe, et ne compare pas explicitement l'élève à la classe : sers-t'en uniquement pour ajuster ton degré d'exigence ou d'encouragement.`);
            } else {
                styleParts.push(`Ne cite pas les moyennes chiffrées dans l'appréciation : traduis le niveau de réussite en termes qualitatifs.`);
            }
        }
        styleParts.push(`Rédige en français courant sans écriture inclusive (ni point médian) et sans sigles de période (« T1 », « T2 », « T3 », « S1 », « S2 »).`);
        styleParts.push(`Réponds uniquement avec le texte de l'appréciation en un seul paragraphe, sans titre, préambule, liste à puces ni guillemets.`);

        if (effectiveStyle.styleInstructions) {
            styleParts.push(`Consigne de l'enseignant (prioritaire) : ${effectiveStyle.styleInstructions}`);
        }

        const recentOpenings = Array.isArray(runtimeOptions?.recentOpenings)
            ? runtimeOptions.recentOpenings.filter(s => typeof s === 'string' && s.trim().length > 0).slice(-5)
            : [];
        if (!hasNoData && recentOpenings.length > 0) {
            const formattedOpenings = recentOpenings.map(s => `« ${s.trim()} »`).join(', ');
            styleParts.push(
                `Varie l'amorce de ta première phrase : évite de commencer comme les appréciations récentes de la classe (${formattedOpenings}).`
            );
        }

        if (hasNoData) {
            styleParts.push(
                `Attention : Cet élève n'a aucune donnée d'évaluation (note, appréciation passée ou observation). Rédige uniquement un constat factuel, bienveillant et très court d'absence de données (pour cette période, ou pour l'année si les périodes précédentes indiquent également une absence totale de données), en une seule phrase simple (maximum 25 mots), sans inventer de travail ou de réussite, et sans projection sur l'avenir.`
            );
            if (effectiveCharBudget) {
                styleParts.push(`Respecte impérativement un plafond maximal de ${effectiveCharBudget} caractères (espaces compris).`);
            }
        }

        systemParts.push('--- INSTRUCTIONS DE STYLE ---\n' + styleParts.map(s => '- ' + s).join('\n'));

        const periodsInfo = periodRows.map(r => r.forGeneration).join('\n');
        let periodsInfoForAnalysis = periodRows.map(r => r.forAnalysis).join('\n');
        if (!periodsInfoForAnalysis && periods?.[currentPeriod]) {
            const d = periods?.[currentPeriod] || {};
            const gradeVal = this._parseGrade(d.grade);
            const g = !isNaN(gradeVal) ? gradeVal.toFixed(1).replace('.', ',') + '/20' : 'Non renseignée';
            const evalCount = typeof d.evaluationCount === 'number' ? ` (${d.evaluationCount} éval.)` : '';
            const classStatsStr = excludeClassStats ? '' : this._getClassStatsString(classId, currentPeriod);
            const classComparisonStr = excludeClassStats ? '' : this._getClassComparisonString(classId, currentPeriod, gradeVal);
            const scrubbedApp = d.appreciation
                ? this.scrubStudentIdentity(d.appreciation.trim(), studentIdentity, scrubOptions)
                : '';
            periodsInfoForAnalysis = `${currentPeriod} : Moy ${g}${evalCount}${classStatsStr}${classComparisonStr}, Appréciation : "${scrubbedApp || 'N/A'}"`;
        }
        const rawCurrentApp = periods?.[currentPeriod]?.appreciation?.trim();
        const currentPeriodAppreciation = periodRows.length > 0
            ? periodRows[periodRows.length - 1].scrubbedApp
            : (rawCurrentApp ? this.scrubStudentIdentity(rawCurrentApp, studentIdentity, scrubOptions) : '');

        // Neutralisation RGPD Art. 9 : on traduit localement les statuts en consignes pédagogiques neutres
        const statusInstructions = this.getStatusInstructions(statuses, currentPeriod);
        const statusLine = statusInstructions ? `\nConsignes d'accompagnement : ${statusInstructions}` : '';

        const specificInfoLine = periodContext ? `\nContexte : "${periodContext}"` : '';

        // === JOURNAL DE BORD: Synthesis for prompt ===
        // Injects tag counts and recent notes to enrich AI context (strip redundant leading "Observations:" prefix)
        const formattedJournalSynthesis = journalSynthesis
            ? journalSynthesis.replace(/^Observations\s*:\s*/i, '').trim()
            : '';
        const journalLine = formattedJournalSynthesis ? `\n\nObservations du professeur : ${formattedJournalSynthesis}` : '';

        // Note: Le nom de famille n'est JAMAIS envoyé, même si l'anonymisation est désactivée.
        // Seul le prénom est partagé si l'utilisateur le permet.
        // En mode neutre, on ne mentionne aucun identifiant personnel.

        // Si on envoie le vrai prénom (anonymizeData === false && voice !== 'neutre'),
        // on laisse le LLM déduire le genre sauf pour les prénoms véritablement épicènes.
        // Si anonyme ([PRÉNOM]) ou voix neutre, on fournit toujours le genre pour l'accord grammatical.
        const isEpicene = typeof Utils.isEpiceneFirstName === 'function' && Utils.isEpiceneFirstName(prenom);
        const showGender = isAnonymous || isNeutralVoice || isEpicene;
        const genderSuffix = showGender ? ` (${genderLabel})` : '';

        // En mode neutre: "Genre : féminin" au lieu de "Élève : Élève (féminin)"
        const studentLine = isNeutralVoice
            ? `Genre : ${genderLabel}`
            : `Élève : ${studentIdentifier}${genderSuffix}`;

        // --- CONTEXTE SCOLAIRE & DONNÉES DE L'ÉLÈVE ---
        const classLines = [];
        const currentClass = appState.classes?.find(c => c.id === classId);
        const resolvedClassName = currentClass?.name
            || (typeof classId === 'string' && classId.startsWith('virtual_') ? Utils.getCurrentClassName(classId) : '');
        if (resolvedClassName) {
            let classLevel = currentClass?.level || detectLevelFromName(resolvedClassName);
            if (classLevel === '3eme') classLevel = 'college';
            const levelMeta = LEVELS[classLevel] || LEVELS.generique;

            if (!GDPR_SENSITIVE_STATUS_PATTERN.test(resolvedClassName)) {
                classLines.push(`Classe : ${resolvedClassName}`);
            }
            if (classLevel && classLevel !== 'generique') {
                classLines.push(`Niveau : ${levelMeta.label}`);
            }
        }
        const classPrefix = classLines.length > 0 ? classLines.join('\n') + '\n' : '';
        const evolutionBlock = evolutionText ? `\n\n${evolutionText}` : '';
        const appreciationUser = `--- DONNÉES DE L'ÉLÈVE ---\n${classPrefix}${studentLine}${statusLine}${specificInfoLine}${journalLine}\nPériode à évaluer : ${currentPeriod}\n\nPériodes :\n${periodsInfo}${evolutionBlock}`;

        // Le prompt complet (aperçu, copie) est strictement la concaténation de ce qui est envoyé à l'API
        const appreciationSystem = systemParts.join('\n\n');
        const appreciationPrompt = `${appreciationSystem}\n\n${appreciationUser}`;

        // Prompt unifié d'analyse individuelle (Forces / Points de vigilance / Pistes de progrès)
        const analysisHeaderParts = [...classLines];
        if (iaConfig.discipline) {
            analysisHeaderParts.push(`Matière : ${iaConfig.discipline}`);
        }
        analysisHeaderParts.push(studentLine);
        analysisHeaderParts.push(`Période analysée : ${periodDisplay}`);
        if (statusInstructions) {
            analysisHeaderParts.push(`Consignes d'accompagnement : ${statusInstructions}`);
        }
        if (periodContext) {
            analysisHeaderParts.push(`Contexte : "${periodContext}"`);
        }
        if (formattedJournalSynthesis) {
            analysisHeaderParts.push(`Observations : ${formattedJournalSynthesis}`);
        }

        const isSparseDossier = !currentPeriodAppreciation && !periodContext && !journalSynthesis;
        const sparseDossierHint = isSparseDossier
            ? `\nNote sur les données : dossier succinct sans appréciation ni observation textuelle ; limite-toi strictement aux constats chiffrés disponibles sans broder, ou laisse une liste vide.`
            : '';

        const analysisUser = `--- CONTEXTE DU BILAN ---
${analysisHeaderParts.join('\n')}

--- RÉSULTATS ET ÉVOLUTION ---
${periodsInfoForAnalysis || 'Aucune donnée chiffrée disponible.'}${evolutionText ? `\n${evolutionText}` : ''}

Appréciation de référence : "${currentPeriodAppreciation || 'N/A'}"${sparseDossierHint}`;

        const analysisSystemTarget = isNeutralVoice ? "d'un élève" : `de l'élève ${studentIdentifier}`;
        const analysisSystem = `Tu es un enseignant${disciplineContext} réalisant le bilan analytique individuel ${analysisSystemTarget} pour le ${periodDisplay}, en vue d'un échange avec l'élève, ses parents et le professeur principal.

Réponds UNIQUEMENT par un objet JSON valide (sans bloc markdown ni texte autour) respectant strictement ce schéma :
{
  "strengths": ["Point fort 1"],
  "vigilances": ["Point de vigilance 1"],
  "nextSteps": ["Piste de progrès 1"]
}

RÈGLES STRICTES DE FIABILITÉ :
1. Ancrage factuel : appuie-toi UNIQUEMENT sur les données fournies (notes, écarts élève/classe pré-calculés, évolutions, appréciation, contexte, observations). N'invente jamais un comportement, une compétence ou un travail absents du dossier.
2. Cohérence arithmétique : respecte strictement le signe de « Écart élève/classe » (positif = au-dessus, négatif = en dessous) et le sens des évolutions.
3. Cardinalité adaptative (0 à 3 items maximum par liste) : aucun remplissage générique si le dossier est succinct. S'il n'y a aucune fragilité objective, renvoie "vigilances": [].
4. Lien causal et valeur ajoutée : chaque item de "nextSteps" doit proposer un levier concret et réaliste (méthode de travail, entraînement ciblé ou défi d'approfondissement si "vigilances" est vide), sans jamais paraphraser un point fort ou un point de vigilance par une formule vague (« Maintenir les efforts », « Continuer ainsi »). Si le dossier est trop succinct, laisse "nextSteps": [].
5. Formulation : phrases courtes et claires (~15 mots max par puce) en français courant à la 3e personne (sans « tu », « vous », sans citer de note brute ni de sigle « T1 », « T2 », « T3 », « S1 », « S2 »). Conserve tel quel tout éventuel marqueur anonyme (${this.PRENOM_PLACEHOLDER}).`;

        const analysisPrompt = `${analysisSystem}\n\n${analysisUser}`;

        return {
            appreciation: appreciationPrompt,
            analysis: analysisPrompt,
            appreciationSystem,
            appreciationUser,
            analysisSystem,
            analysisUser
        };
    },

    /**
     * Génère les prompts structurés (`systemPrompt`, `userPrompt` et concaténation `prompt`)
     * pour le raffinement d'une appréciation existante.
     * @param {string} type - Type de raffinement (`concise`, `encouraging`, `demanding`, `polish`, `default`)
     * @param {string} original - Texte d'origine à retravailler
     * @param {Object} [options={}] - Identité locale pour le scrubbing RGPD et l'accord de genre
     * @returns {{ systemPrompt: string, userPrompt: string, prompt: string }}
     */
    getRefinementPrompts(type, original, options = {}) {
        const isOptionsObject = options && typeof options === 'object';
        const isAnonymous = appState.anonymizeData ?? true;
        const explicitId = isOptionsObject ? (options.id || options.studentId || options.studentData?.id || null) : null;
        const explicitClassId = isOptionsObject
            ? (options.classId ?? options.studentData?.classId ?? appState.currentClassId ?? null)
            : (appState.currentClassId ?? null);
        const explicitPrenom = isOptionsObject ? (options.prenom || options.studentData?.prenom || '') : '';
        const explicitNom = isOptionsObject ? (options.nom || options.studentData?.nom || '') : '';
        const explicitClassmates = isOptionsObject ? options.classmates : undefined;

        const identity = { id: explicitId, prenom: explicitPrenom, nom: explicitNom, classId: explicitClassId };
        const sanitizedOriginal = this.scrubStudentIdentity(original || '', identity, {
            anonymizePrenom: isAnonymous,
            studentId: explicitId,
            classId: explicitClassId,
            ...(explicitClassmates !== undefined ? { classmates: explicitClassmates } : {}),
            scrubSensitive: true
        }).replace(/\s*\[nom\]/gi, '');

        const gender = explicitPrenom ? Utils.detectGender(explicitPrenom) : null;
        const effectiveStyle = this._getEffectiveStyle(this._resolveIaConfig());
        const maxChars = effectiveStyle.maxChars;
        const charBudget = maxChars
            ? this._computeEffectiveCharBudget(maxChars, { prenom: explicitPrenom, isAnonymous })
            : null;

        const rules = [
            ...(gender === 'féminin' || gender === 'masculin'
                ? [`Genre de l'élève : ${gender} (pour les accords grammaticaux).`]
                : []),
            `Conserve la personne grammaticale du texte d'origine (je, nous, troisième personne ou tournure impersonnelle).`,
            `N'invente aucun fait, résultat ou compétence absents du texte.`,
            `Ne t'adresse pas directement à l'élève (ni « tu » ni « vous »).`,
            `Rédige en français courant, en un seul paragraphe, sans écriture inclusive (ni point médian) et sans sigles de période (« T1 », « T2 », « T3 », « S1 », « S2 »).`,
            ...(charBudget
                ? [`Respecte impérativement un plafond maximal de ${charBudget} caractères (espaces compris).`]
                : []),
            ...(effectiveStyle.styleInstructions
                ? [`Consigne de l'enseignant : ${effectiveStyle.styleInstructions}`]
                : []),
            `Réponds uniquement avec le texte brut révisé, sans titre, préambule, commentaire, formatage ni guillemets.`
        ];

        const systemPrompt = `Tu es un enseignant qui retravaille une appréciation de bulletin scolaire français.\n\n--- RÈGLES ---\n${rules.map(r => `- ${r}`).join('\n')}`;

        let taskInstruction = '';
        switch (type) {
            case 'concise': {
                const originalChars = Utils.countCharacters(original || '');
                if (maxChars && charBudget && originalChars > maxChars) {
                    const targetWords = this._computeSafeWordCap(charBudget);
                    taskInstruction = `Raccourcis cette appréciation scolaire pour qu'elle reste impérativement sous ${charBudget} caractères espaces compris (vise environ ${targetWords} mots maximum) : supprime les redondances et allège les tournures tout en conservant l'ensemble des idées (bilan, attitude, conseil).`;
                } else {
                    const wordCount = Utils.countWords(sanitizedOriginal);
                    const targetClause = wordCount >= 16
                        ? `vise environ ${Math.max(12, Math.round(wordCount * 0.75))} mots, soit environ 25 % plus courte`
                        : 'environ 25 % plus courte';
                    taskInstruction = `Rends cette appréciation scolaire plus concise (${targetClause}) : supprime les redondances et allège les tournures tout en conservant l'ensemble des idées (bilan, attitude, conseil).`;
                }
                break;
            }
            case 'encouraging':
                taskInstruction = `Reformule cette appréciation scolaire avec un ton plus bienveillant, valorisant et constructif : mets en valeur les acquis ou les efforts et formule les points à travailler comme des leviers de progression, sans masquer les difficultés réelles ni tomber dans l'éloge excessif. Garde une longueur similaire.`;
                break;
            case 'demanding':
                taskInstruction = `Reformule cette appréciation scolaire avec un ton plus ferme, direct et exigeant : souligne clairement les attentes, les manques ou les points de rigueur à renforcer, sans complaisance ni détour, tout en restant factuel, professionnel et constructif. Garde une longueur similaire.`;
                break;
            case 'polish':
                taskInstruction = `Peaufine cette appréciation scolaire : corrige les éventuelles fautes, maladresses ou répétitions et fluidifie la syntaxe dans un style de bulletin naturel et professionnel, en restant fidèle au sens et à la longueur du texte d'origine (si le texte est sous forme de notes brèves, rédige-le en phrases complètes).`;
                break;
            case 'default':
            default:
                taskInstruction = `Reformule cette appréciation scolaire de manière fluide et naturelle.`;
        }

        const userPrompt = `${taskInstruction}\n\n---\n${sanitizedOriginal}\n---`;
        return {
            systemPrompt,
            userPrompt,
            prompt: `${systemPrompt}\n\n${userPrompt}`
        };
    },

    /**
     * Generates a refinement prompt for appreciation modifications (concaténation aperçu/copie).
     * @param {string} type - Type of refinement (concise, encouraging, demanding, polish)
     * @param {string} original - The original text to refine
     * @param {Object} [options={}] - Optional local identity for GDPR scrubbing & gender agreement ({ prenom, nom, studentData })
     * @returns {string} The formatted prompt for AI
     */
    getRefinementPrompt(type, original, options = {}) {
        return this.getRefinementPrompts(type, original, options).prompt;
    },

    /**
     * Génère les prompts structurés (`systemPrompt`, `userPrompt` et `prompt`) pour l'affinage
     * de la synthèse globale de classe (Bilan qualitatif).
     * Mutualise le scrubbing RGPD, la discipline et les consignes de style de l'enseignant.
     * @param {'concise'|'encouraging'|'demanding'|'polish'} type - Type de retouche
     * @param {string} original - Texte de synthèse globale à ajuster
     * @param {Object} [options={}] - Options RGPD (`{ classmates, anonymizeData }`)
     * @returns {{ systemPrompt: string, userPrompt: string, prompt: string }|null}
     */
    getClassSynthesisRefinementPrompts(type, original, options = {}) {
        const isAnonymous = options.anonymizeData ?? appState.anonymizeData ?? true;
        const sanitizedOriginal = this.scrubStudentIdentity(
            original || '',
            {},
            {
                anonymizePrenom: isAnonymous,
                ...(Array.isArray(options.classmates) ? { classmates: options.classmates } : {}),
                classmatePlaceholder: '[ÉLÈVE]',
                scrubSensitive: true
            }
        );

        let taskInstruction = null;
        switch (type) {
            case 'concise': {
                const wordCount = Utils.countWords(sanitizedOriginal);
                if (wordCount > 45) {
                    taskInstruction = "Condense cette synthèse globale pour le bulletin de classe en 1 à 2 phrases directes et percutantes (max 35 mots), en conservant l'essentiel de la dynamique collective.";
                } else if (wordCount >= 20) {
                    const targetWords = Math.max(15, Math.round(wordCount * 0.75));
                    taskInstruction = `Condense davantage cette synthèse globale pour le bulletin de classe (vise environ ${targetWords} mots maximum, soit environ 25 % plus courte) : va droit à l'essentiel en conservant la dynamique collective.`;
                } else {
                    taskInstruction = "Rends cette synthèse globale encore plus concise (1 phrase directe et percutante) tout en conservant l'idée principale.";
                }
                break;
            }
            case 'encouraging':
                taskInstruction = "Reformule cette synthèse globale avec un ton plus bienveillant, valorisant et constructif : mets en lumière les progrès, les points d'appui et le potentiel du groupe sans masquer les axes d'amélioration. Garde une longueur similaire.";
                break;
            case 'demanding':
                taskInstruction = "Reformule cette synthèse globale avec un ton plus ferme, direct et exigeant : pointe clairement les attentes collectives, le manque d'engagement ou la rigueur attendue, sans complaisance, tout en restant factuel, professionnel et constructif. Garde une longueur similaire.";
                break;
            case 'polish':
                taskInstruction = "Peaufine cette synthèse globale : corrige les éventuelles fautes, maladresses ou répétitions et fluidifie la syntaxe dans un style naturel et professionnel de conseil de classe, en restant fidèle au sens et à la longueur d'origine.";
                break;
            default:
                return null;
        }

        const hasAnonymizationMarkers = /\[(?:ÉLÈVE|AMÉNAGEMENT|CAMARADE)\]/i.test(sanitizedOriginal);
        const effectiveStyle = this._getEffectiveStyle(this._resolveIaConfig());
        const discipline = effectiveStyle.discipline || (appState.currentSubject !== 'Générique' && appState.currentSubject !== 'MonStyle' ? appState.currentSubject : null);
        const rolePrefix = discipline
            ? `Tu es un enseignant de ${discipline} qui retravaille la synthèse globale de classe pour le bulletin.`
            : `Tu es un conseiller pédagogique expert qui retravaille la synthèse globale de classe pour le bulletin.`;

        const rules = [
            `N'invente aucun fait, résultat ou comportement absents du texte d'origine.`,
            `Ne cite aucun prénom d'élève.`,
            ...(hasAnonymizationMarkers
                ? [`Si le texte contient un marqueur entre crochets ([ÉLÈVE], [AMÉNAGEMENT]), reformule de manière collective et impersonnelle sans jamais conserver de crochets dans ta réponse.`]
                : []),
            `Rédige en français courant, en un seul paragraphe, sans écriture inclusive (ni point médian) et sans sigles de période (« T1 », « T2 », « T3 », « S1 », « S2 »).`,
            ...(effectiveStyle.styleInstructions
                ? [`Consigne de l'enseignant : ${effectiveStyle.styleInstructions}`]
                : []),
            `Réponds uniquement avec le paragraphe révisé en texte brut, sans titre, introduction, commentaire, JSON ni guillemets.`
        ];

        const systemPrompt = `${rolePrefix}\n\n--- RÈGLES ---\n${rules.map(r => `- ${r}`).join('\n')}`;
        const userPrompt = `${taskInstruction}\n\n---\n${sanitizedOriginal}\n---`;
        return {
            systemPrompt,
            userPrompt,
            prompt: `${systemPrompt}\n\n${userPrompt}`
        };
    },

    /**
     * Calcule et met en cache le résumé statistique des notes d'une classe pour une période donnée.
     * @param {string} classId - ID de la classe
     * @param {string} period - Période (ex: T1, T2)
     * @returns {Object|null} Résumé StatsService ou null si < 3 notes
     * @private
     */
    _getClassGradeSummary(classId, period) {
        try {
            if (!appState.generatedResults || !Array.isArray(appState.generatedResults)) return null;

            // Si pas de classId défini, on prend les élèves n'ayant pas de classId (mode legacy)
            const classStudents = appState.generatedResults.filter(r =>
                (!classId && !r.classId) || (classId && r.classId === classId)
            );

            if (classStudents.length < 3) return null; // Seuil de représentativité

            const cacheKey = `${classId || 'default'}_${period}_` + classStudents
                .map(r => r.studentData?.periods?.[period]?.grade ?? '')
                .join(',');

            if (PromptService._classStatsCache.has(cacheKey)) {
                return PromptService._classStatsCache.get(cacheKey);
            }

            const summary = StatsService.summarizeGrades(
                classStudents.map(r => r.studentData?.periods?.[period]?.grade)
            );

            const validSummary = (summary && summary.count >= 3) ? summary : null;
            PromptService._classStatsCache.set(cacheKey, validSummary);
            return validSummary;
        } catch (e) {
            console.warn('[PromptService] Erreur lors du calcul des statistiques de classe:', e);
            return null;
        }
    },

    /**
     * Calcule la moyenne, le min et le max de la classe pour une période donnée.
     * @param {string} classId - ID de la classe
     * @param {string} period - Période (ex: T1, T2)
     * @returns {string} Chaîne formatée (ex: " [Classe : Moy 12,5, Min 8,0, Max 18,5]") ou vide
     * @private
     */
    _getClassStatsString(classId, period) {
        const summary = this._getClassGradeSummary(classId, period);
        if (!summary) return '';
        return ` [Classe : Moy ${summary.average.toFixed(1).replace('.', ',')}, Min ${summary.min.toFixed(1).replace('.', ',')}, Max ${summary.max.toFixed(1).replace('.', ',')}]`;
    },

    /**
     * Calcule l'écart arithmétique signé entre la moyenne de l'élève et celle de la classe.
     * Évite toute inversion de comparaison numérique par l'IA dans l'analyse individuelle.
     * @param {string} classId - ID de la classe
     * @param {string} period - Période évaluée
     * @param {number} studentGradeVal - Note numérique de l'élève
     * @returns {string} Chaîne explicite d'écart ou vide
     * @private
     */
    _getClassComparisonString(classId, period, studentGradeVal) {
        if (isNaN(studentGradeVal)) return '';
        const summary = this._getClassGradeSummary(classId, period);
        if (!summary) return '';

        const delta = Math.round((studentGradeVal - summary.average) * 10) / 10;
        const sign = delta > 0 ? '+' : '';
        const unit = Math.abs(delta) < 2 ? 'pt' : 'pts';
        const deltaFormatted = delta === 0 ? '0,0 pt' : `${sign}${delta.toFixed(1).replace('.', ',')} ${unit}`;
        const position = delta > 0.3
            ? 'au-dessus de la moyenne de classe'
            : (delta < -0.3 ? 'en dessous de la moyenne de classe' : 'dans la moyenne de classe');

        return ` (Écart élève/classe : ${deltaFormatted}, ${position})`;
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
