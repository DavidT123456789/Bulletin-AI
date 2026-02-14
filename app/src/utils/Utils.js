
import { appState } from '../state/State.js';
import { MODEL_SHORT_NAMES } from '../config/models.js';

/**
 * @typedef {Object} StudentPeriodData
 * @property {number|null} grade - Note de l'élève (0-20)
 * @property {string} appreciation - Appréciation textuelle
 */

/**
 * @typedef {Object} StudentData
 * @property {string} nom - Nom de famille
 * @property {string} prenom - Prénom
 * @property {string[]} statuses - Statuts (Nouveau, Départ, PPRE, etc.)
 * @property {Object.<string, StudentPeriodData>} periods - Données par période
 * @property {string} currentPeriod - Période actuelle (T1, T2, T3 ou S1, S2)
 */

/**
 * @typedef {Object} Evolution
 * @property {string} periode - Format "T1-T2" ou "S1-S2"
 * @property {string} type - "positive", "negative", "stable", "very-positive", "very-negative"
 * @property {number} delta - Différence de note
 */

export const Utils = {
    /**
     * Retourne les informations de classe et de label pour un badge de statut
     * @param {string} status - Le statut brut (ex: "ULIS", "Nouveau T1")
     * @returns {{className: string, label: string}} Informations pour le rendu
     */
    getStatusBadgeInfo(status) {
        let badgeClass = 'tag-badge'; // Default gray
        const lowerTag = (status || '').toLowerCase();

        if (lowerTag.includes('ppre') || lowerTag.includes('pai') || lowerTag.includes('pap') || lowerTag.includes('ulis') || lowerTag.includes('segpa')) {
            badgeClass += ' tag-warning'; // Yellow
        } else if (lowerTag.includes('nouveau')) {
            badgeClass += ' tag-info'; // Blue
        } else if (lowerTag.includes('départ')) {
            badgeClass += ' tag-danger'; // Red
        }

        return { className: badgeClass, label: status };
    },

    /**
     * Formate un label avec deux-points selon la typographie française
     * @param {string} label - Le label (ex: "T1", "Moyenne")
     * @param {string|number} value - La valeur à afficher
     * @returns {string} Le label formaté avec espace avant et après les deux-points
     */
    formatLabel(label, value) {
        return `${label} : ${value}`;
    },

    /**
     * Valide un champ de saisie (nom, prénom, ou nom de matière)
     * @param {HTMLInputElement} input - L'élément input à valider
     * @returns {boolean} true si valide
     */
    validateInput(input) {
        const value = input.value.trim(); const errEl = document.getElementById(input.id + 'Error');
        let isValid = true, msg = '';
        if (input.id === 'nom' || input.id === 'prenom') {
            if (value.length === 0) { isValid = false; msg = 'Champ requis'; }
            else if (!/^[a-zA-ZÀ-ÿ\s\-']+$/.test(value)) { isValid = false; msg = 'Caractères invalides'; }
        } else if (input.id === 'addSubjectInput' || input.id === 'newSubjectNameInput') {
            if (value.length === 0) { isValid = false; msg = 'Champ requis'; }
            else if (Object.keys(appState.subjects).some(k => k.toLowerCase() === value.toLowerCase())) { isValid = false; msg = 'Matière existante'; }
        }
        input.classList.toggle('input-error', !isValid);
        if (errEl) { errEl.textContent = isValid ? '' : `⚠️ ${msg}`; errEl.style.display = isValid ? 'none' : 'block'; }
        return isValid;
    },

    /**
     * Valide un champ de note (0-20)
     * @param {HTMLInputElement} input - L'élément input contenant la note
     * @returns {boolean} true si valide ou vide
     */
    validateGrade(input) {
        const valueStr = input.value.trim().replace(',', '.'); const errEl = document.getElementById(input.id + 'Error');
        if (valueStr === '') { input.classList.remove('input-error'); if (errEl) errEl.style.display = 'none'; return true; }
        const value = parseFloat(valueStr);
        const isValid = !isNaN(value) && value >= 0 && value <= 20;
        input.classList.toggle('input-error', !isValid);
        if (errEl) { errEl.textContent = isValid ? '' : '⚠️ Note entre 0 et 20'; errEl.style.display = isValid ? 'none' : 'block'; }
        return isValid;
    },

    /**
     * Compte le nombre de mots dans un texte
     * @param {string} text - Le texte à analyser
     * @returns {number} Nombre de mots
     */
    countWords(text) { return typeof text !== 'string' ? 0 : text.trim().split(/\s+/).filter(Boolean).length; },

    /**
     * Compte le nombre de caractères dans un texte (espaces inclus, sans espaces de début/fin)
     * @param {string} text - Le texte à analyser
     * @returns {number} Nombre de caractères
     */
    countCharacters(text) { return typeof text !== 'string' ? 0 : text.trim().length; },

    /**
     * Retourne un élément aléatoire d'un tableau
     * @template T
     * @param {T[]} array - Le tableau source
     * @returns {T|''} Un élément aléatoire ou chaîne vide
     */
    getRandomElement(array) { return !array || array.length === 0 ? '' : array[Math.floor(Math.random() * array.length)]; },

    /**
     * Vérifie si une valeur est une note valide (0-20)
     * @param {string|number} str - La valeur à tester
     * @returns {boolean} true si c'est un nombre entre 0 et 20
     */
    isNumeric(str) {
        if (typeof str !== 'string' && typeof str !== 'number') return false;
        const num = parseFloat(String(str).replace(',', '.'));
        return !isNaN(num) && num >= 0 && num <= 20;
    },

    /**
     * Parse le nombre d'évaluations depuis une valeur d'import
     * @param {string} value - La valeur brute (ex: "6", "12")
     * @returns {number|null} Nombre d'évaluations (0-50) ou null si invalide
     * @private
     */
    _parseEvaluationCount(value) {
        if (!value || typeof value !== 'string') return null;
        const num = parseInt(value.trim(), 10);
        return (!isNaN(num) && num >= 0 && num <= 50) ? num : null;
    },

    /**
     * Crée une fonction debounced qui retarde l'exécution
     * @param {Function} func - La fonction à exécuter
     * @param {number} wait - Délai en millisecondes
     * @returns {Function} La fonction debounced
     */
    debounce(func, wait) { let timeout; return (...args) => { clearTimeout(timeout); timeout = setTimeout(() => func(...args), wait); }; },

    /**
     * Parse une ligne de données import en objet StudentData
     * @param {string[]} lineValues - Valeurs de la ligne splitée
     * @param {Object.<string, number>} formatMap - Mapping colonne → index
     * @param {string} currentPeriod - Période actuelle
     * @returns {StudentData|null} Données élève ou null si invalide
     */
    parseStudentLine(lineValues, formatMap, currentPeriod) {
        const mappedData = {};
        for (const [key, index] of Object.entries(formatMap)) mappedData[key] = lineValues[index] || '';
        const { nom, prenom } = this.parseNomPrenom(mappedData['NOM_PRENOM'] || '');
        if (!nom && !prenom) return null;
        const studentData = { nom, prenom, statuses: mappedData['STATUT'] ? [mappedData['STATUT']] : [], periods: {}, currentPeriod };
        this.getPeriods().forEach(p => {
            const gradeStr = (mappedData[`MOY_${p}`] || '').replace(',', '.');
            const periodContext = mappedData[`CTX_${p}`] || '';
            // Parse evaluation count (DEV_T1, DEV_S1, etc.)
            const evalCountStr = mappedData[`DEV_${p}`] || '';
            const evalCount = this._parseEvaluationCount(evalCountStr);
            studentData.periods[p] = {
                grade: this.isNumeric(gradeStr) ? parseFloat(gradeStr) : null,
                appreciation: mappedData[`APP_${p}`] || '',
                context: periodContext,
                evaluationCount: evalCount
            };
        });
        // Fallback: INSTRUCTIONS (global) → periods[currentPeriod].context
        const globalContext = mappedData['INSTRUCTIONS']?.trim();
        if (globalContext && !studentData.periods[currentPeriod]?.context) {
            studentData.periods[currentPeriod].context = globalContext;
        }
        return studentData;
    },

    /**
     * Parse un nom complet en nom/prénom séparés
     * @param {string} fullName - Nom complet (ex: "MARTIN Lucas" ou "Lucas Martin")
     * @returns {{nom: string, prenom: string}} Objet avec nom et prénom
     */
    parseNomPrenom(fullName) {
        const words = fullName.trim().split(/\s+/).filter(Boolean);
        if (words.length === 0) return { nom: '', prenom: '' };

        let lastCapIndex = -1;
        for (let i = 0; i < words.length; i++) {
            if (words[i] === words[i].toUpperCase() && /[A-ZÀ-Ÿ]/.test(words[i])) {
                lastCapIndex = i;
            } else {
                break;
            }
        }

        if (lastCapIndex > -1) {
            const nom = words.slice(0, lastCapIndex + 1).join(' ');
            const prenom = words.slice(lastCapIndex + 1).join(' ');
            if (!prenom && words.length > 1) {
                return { nom: words.slice(0, -1).join(' '), prenom: words.slice(-1).join(' ') };
            }
            return { nom, prenom };
        }

        if (words.length === 1) return { nom: words[0], prenom: '' };
        const nom = words.pop();
        const prenom = words.join(' ');
        return { nom, prenom };
    },

    /**
     * Normalise un nom pour comparaison (minuscule, tirets)
     * @param {string} nom - Nom de famille
     * @param {string} prenom - Prénom
     * @returns {string} Clé normalisée (ex: "martin-lucas")
     */
    normalizeName(nom, prenom) {
        return `${nom || ''} ${prenom || ''}`.trim().toLowerCase().replace(/\s+/g, '-');
    },

    /**
     * Déduplique une liste de résultats élèves.
     * Fusionne les entrées d'un même élève en gardant les appréciations les plus récentes
     * pour chaque période.
     * @param {Array} results - Liste des résultats à dédupliquer
     * @returns {Array} Liste dédupliquée avec données fusionnées
     */
    deduplicateResults(results) {
        if (!Array.isArray(results) || results.length === 0) return results;

        const studentMap = new Map();
        let mergeCount = 0;

        // Trier par timestamp croissant pour que les plus récents écrasent les anciens
        const sorted = [...results].sort((a, b) => {
            const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
            const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
            return timeA - timeB;
        });

        for (const result of sorted) {
            // IMPORTANT: Include classId in key to preserve homonyms across different classes
            // "Jean DUPONT" in ClasseA and "Jean DUPONT" in ClasseB are DIFFERENT students
            const classId = result.classId || 'no-class';
            const key = `${classId}::${this.normalizeName(result.nom, result.prenom)}`;

            if (!studentMap.has(key)) {
                // Premier résultat pour cet élève - on le copie
                studentMap.set(key, JSON.parse(JSON.stringify(result)));
            } else {
                // Fusionner avec l'existant
                mergeCount++;
                const existing = studentMap.get(key);

                // Fusionner les périodes en gardant la plus récente appreciation
                if (result.studentData?.periods) {
                    for (const [period, periodData] of Object.entries(result.studentData.periods)) {
                        if (periodData.appreciation && periodData.appreciation.trim()) {
                            existing.studentData.periods[period] = {
                                ...existing.studentData.periods[period],
                                ...periodData
                            };
                        } else if (periodData.grade !== null && periodData.grade !== undefined) {
                            // Garder la note même sans appréciation
                            if (!existing.studentData.periods[period]) {
                                existing.studentData.periods[period] = { grade: null, appreciation: '' };
                            }
                            existing.studentData.periods[period].grade = periodData.grade;
                        }
                    }
                }

                // Prendre l'appréciation la plus récente comme principale
                if (result.appreciation && result.appreciation.trim()) {
                    existing.appreciation = result.appreciation;
                    existing.timestamp = result.timestamp;
                    existing.studentData.currentPeriod = result.studentData?.currentPeriod || existing.studentData.currentPeriod;
                }

                // Fusionner les statuts (sans doublons)
                if (result.studentData?.statuses) {
                    const existingStatuses = new Set(existing.studentData.statuses || []);
                    result.studentData.statuses.forEach(s => existingStatuses.add(s));
                    existing.studentData.statuses = [...existingStatuses];
                }

                // Conserver classId si présent
                if (result.classId) {
                    existing.classId = result.classId;
                }
            }
        }

        return Array.from(studentMap.values());
    },

    /**
     * Supprime le balisage markdown pour obtenir du texte brut sans astérisques
     * @param {string} text - Texte avec markdown
     * @returns {string} Texte brut
     */
    stripMarkdown(text) {
        if (typeof text !== 'string') return text;
        let res = text
            .replace(/\*\*(.*?)\*\*/g, '$1') // Gras **
            .replace(/__(.*?)__/g, '$1')     // Gras __
            .replace(/\*(.*?)\*/g, '$1')     // Italique *
            .replace(/_(.*?)_/g, '$1')       // Italique _
            .replace(/###\s*(.*)/g, '$1')    // Titres H3
            .replace(/##\s*(.*)/g, '$1')     // Titres H2
            .replace(/^[\*\-]\s+/gm, '• ');  // Listes à puces (remplacer par puce standard ou vide)

        // Remove HTML tags
        res = res.replace(/<[^>]*>/g, '');

        return res;
    },

    /**
     * Convertit le markdown simple en HTML
     * @param {string} text - Texte avec markdown
     * @returns {string} HTML formaté
     */
    cleanMarkdown(text) {
        if (typeof text !== 'string') return text;
        // Correction typographique française : ajouter un espace avant les deux-points si absent
        // Gère : Mot:, **Mot**:, (mot):, "mot":
        let result = text
            .replace(/([a-zA-Z0-9À-ÿ\*\)\]\"\'\»]):([A-ZÀ-Ÿ0-9])/g, '$1 : $2')   // Mot:Maj, (mot):Maj, Mot:Chiffre etc.
            .replace(/([a-zA-Z0-9À-ÿ\*\)\]\"\'\»]):\s+/g, '$1 : ');            // Mot: suivi d'espace
        // Markdown → HTML
        return result.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>').replace(/###\s*(.*)/g, '<h4>$1</h4>');
    },

    /**
     * Décode les entités HTML
     * @param {string} text - Texte encodé
     * @returns {string} Texte décodé
     */
    decodeHtmlEntities(text) { if (typeof text !== 'string') return text; const ta = document.createElement('textarea'); ta.innerHTML = text; return ta.value; },

    /**
     * Traduit un message d'erreur API en français
     * @param {string} msg - Message d'erreur original
     * @returns {string} Message traduit
     */
    translateErrorMessage(msg) {
        if (typeof msg !== 'string') return String(msg);

        // Messages déjà en français (générés par le système de fallback)
        if (msg.includes('Quota atteint')) return msg;
        if (msg.includes('Modèle indisponible')) return msg;
        if (msg.includes('Échec après') && msg.includes('modèle')) return msg;

        // Traductions des messages d'erreur API en anglais
        if (msg.includes('Failed to fetch')) return "Connexion impossible. Vérifiez votre réseau.";
        if (msg.includes('timed out') || msg.includes('expired')) return "Délai dépassé. Réessayez.";
        if (msg.includes('401')) return "Clé API invalide.";
        if (msg.includes('402') && msg.includes('more credits')) return "Crédits API épuisés.";
        if (msg.includes('503') || msg.toLowerCase().includes('overloaded')) return "Service IA surchargé. Patientez.";

        // Erreur quota simple (fallback si pas géré par callAIWithFallback)
        if (msg.includes('quota') || msg.includes('429')) return "Quota atteint. Réessayez dans ~60s.";

        return msg;
    },

    /**
     * Retourne la liste des périodes selon le système actuel
     * @returns {string[]} ['T1', 'T2', 'T3'] ou ['S1', 'S2']
     */
    getPeriods() { return appState.periodSystem === 'trimestres' ? ['T1', 'T2', 'T3'] : ['S1', 'S2']; },

    /**
     * Met à jour l'appréciation d'une période avec timestamp automatique.
     * Centralise la logique pour garantir un timestamp cohérent pour la sync.
     * @param {Object} result - L'objet résultat de l'élève
     * @param {string} period - La période (T1, T2, T3, S1, S2)
     * @param {string} appreciation - Le nouveau texte d'appréciation
     * @param {Object} [options] - Options supplémentaires
     * @param {boolean} [options.updateRootLevel=true] - Met aussi à jour result.appreciation
     * @param {boolean} [options.updateResultTimestamp=true] - Met à jour result._lastModified
     */
    setPeriodAppreciation(result, period, appreciation, options = {}) {
        const { updateRootLevel = true, updateResultTimestamp = true } = options;
        const now = Date.now();

        // Assurer que la structure existe
        if (!result.studentData) result.studentData = {};
        if (!result.studentData.periods) result.studentData.periods = {};
        if (!result.studentData.periods[period]) {
            result.studentData.periods[period] = { grade: null, appreciation: '' };
        }

        // Mettre à jour l'appréciation et le timestamp de la période
        result.studentData.periods[period].appreciation = appreciation;
        result.studentData.periods[period]._lastModified = now;

        // Mettre à jour l'appréciation au niveau racine (cache pour période courante)
        if (updateRootLevel && result.studentData.currentPeriod === period) {
            result.appreciation = appreciation;
        }

        // Mettre à jour le timestamp global du résultat
        if (updateResultTimestamp) {
            result._lastModified = now;
        }

        return now;
    },

    /**
     * Formate le libellé d'une période
     * @param {string} pKey - Clé de période (T1, S2, etc.)
     * @param {boolean} [long=false] - Format long ("Trimestre 1") ou court ("T1")
     * @returns {string} Libellé formaté
     */
    getPeriodLabel(pKey, long = false) {
        const prefix = appState.periodSystem === 'trimestres' ? (long ? "Trimestre" : "T") : (long ? "Semestre" : "S");
        const separator = long ? " " : "";
        return `${prefix}${separator}${pKey.slice(1)}`;
    },

    /**
     * Trouve l'évolution pertinente pour la période actuelle
     * @param {Evolution[]} evolutions - Liste des évolutions
     * @param {string} currentPeriod - Période actuelle
     * @returns {Evolution|null} L'évolution ou null
     */
    getRelevantEvolution(evolutions, currentPeriod) {
        if (!evolutions || !currentPeriod) return null;
        const periods = this.getPeriods(), index = periods.indexOf(currentPeriod);
        if (index < 1) return null;
        return evolutions.find(e => e.periode === `${periods[index - 1]}-${currentPeriod}`) || null;
    },

    /**
     * Détecte le genre probable d'un prénom français
     * @param {string} prenom - Le prénom à analyser
     * @returns {'masculin'|'féminin'|'neutre'} Le genre détecté
     */
    detectGender(prenom) {
        if (!prenom || typeof prenom !== 'string') return 'neutre';

        const normalized = prenom.trim().toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // Retire les accents

        // Prénoms féminins courants (liste non exhaustive mais couvre 95%+ des cas)
        const femininNames = new Set([
            'marie', 'jeanne', 'marguerite', 'anne', 'catherine', 'francoise', 'louise',
            'madeleine', 'germaine', 'suzanne', 'henriette', 'yvonne', 'therese', 'marcelle',
            'paulette', 'andree', 'simone', 'denise', 'renee', 'georgette', 'raymonde',
            'alice', 'berthe', 'lucie', 'helene', 'eugenie', 'amelie', 'augustine',
            'nathalie', 'isabelle', 'sylvie', 'christine', 'martine', 'francine', 'nicole',
            'patricia', 'valerie', 'veronique', 'sandrine', 'stephanie', 'sophie', 'celine',
            'caroline', 'virginie', 'audrey', 'aurelie', 'emilie', 'julie', 'marine',
            'lea', 'manon', 'chloe', 'camille', 'clara', 'emma', 'ines', 'jade', 'lola',
            'louise', 'luna', 'mia', 'rose', 'sarah', 'zoe', 'anna', 'eva', 'lena', 'nina',
            'charlotte', 'juliette', 'alice', 'agathe', 'adele', 'victoire', 'clemence',
            'mathilde', 'margot', 'pauline', 'elise', 'ambre', 'jeanne', 'gabrielle',
            'eleonore', 'apolline', 'capucine', 'romane', 'elena', 'olivia', 'iris',
            'lily', 'lou', 'lina', 'yasmine', 'salome', 'constance', 'valentine', 'heloise',
            'florine', 'marine', 'oceane', 'maeva', 'anais', 'melanie', 'elodie', 'laetitia',
            'delphine', 'severine', 'corinne', 'fabienne', 'laurence', 'beatrice', 'brigitte',
            'chantal', 'colette', 'danielle', 'elisabeth', 'florence', 'genevieve', 'jacqueline',
            'josette', 'monique', 'nadine', 'odette', 'pascale', 'pierrette', 'rosine',
            'solange', 'viviane', 'yvette', 'ginette', 'huguette', 'josiane', 'liliane',
            'lucienne', 'mauricette', 'micheline', 'odile', 'rolande', 'claudine', 'gisele',
            'lydie', 'maryse', 'muriel', 'noelle', 'roselyne', 'annie', 'chloé', 'léa'
        ]);

        // Prénoms masculins courants
        const masculinNames = new Set([
            'jean', 'pierre', 'louis', 'joseph', 'andre', 'henri', 'rene', 'paul', 'marcel',
            'jacques', 'francois', 'roger', 'raymond', 'emile', 'charles', 'albert', 'georges',
            'robert', 'lucien', 'leon', 'maurice', 'gaston', 'eugene', 'auguste', 'fernand',
            'antoine', 'bernard', 'claude', 'michel', 'alain', 'daniel', 'patrick', 'philippe',
            'christian', 'eric', 'laurent', 'stephane', 'thierry', 'vincent', 'bruno', 'olivier',
            'pascal', 'frederic', 'didier', 'christophe', 'nicolas', 'julien', 'david', 'thomas',
            'alexandre', 'antoine', 'kevin', 'jeremy', 'sebastien', 'maxime', 'lucas', 'hugo',
            'leo', 'nathan', 'louis', 'gabriel', 'raphael', 'arthur', 'jules', 'adam', 'paul',
            'noel', 'victor', 'theo', 'ethan', 'noah', 'liam', 'aaron', 'clement', 'mathis',
            'enzo', 'tom', 'matteo', 'matheo', 'timéo', 'gabin', 'martin', 'valentin', 'mael',
            'romain', 'axel', 'evan', 'nolan', 'logan', 'simon', 'eliott', 'baptiste', 'alex',
            'antonin', 'adrien', 'bastien', 'samuel', 'thibault', 'quentin', 'florian', 'guillaume',
            'benjamin', 'remi', 'arnaud', 'yann', 'fabien', 'cedric', 'loic', 'sylvain',
            'jerome', 'emmanuel', 'yves', 'serge', 'gerard', 'gilles', 'joel', 'dominique',
            'marc', 'guy', 'denis', 'herve', 'joel', 'norbert', 'gilbert', 'edmond', 'edouard'
        ]);

        // Prénoms épicènes (utilisés pour les deux genres)
        const epiceneNames = new Set([
            'camille', 'dominique', 'claude', 'alex', 'sacha', 'eden', 'charlie', 'lou', 'noa', 'andrea'
        ]);

        // Vérification directe
        if (epiceneNames.has(normalized)) return 'neutre';
        if (femininNames.has(normalized)) return 'féminin';
        if (masculinNames.has(normalized)) return 'masculin';

        // Heuristiques basées sur les terminaisons (français)
        const femininEndings = ['ine', 'ette', 'elle', 'enne', 'anne', 'ane', 'ie', 'ee', 'a', 'ise'];
        const masculinEndings = ['ien', 'ard', 'aud', 'ault', 'ert', 'ois', 'ais', 'ric', 'ric', 'in'];

        for (const ending of femininEndings) {
            if (normalized.endsWith(ending)) return 'féminin';
        }
        for (const ending of masculinEndings) {
            if (normalized.endsWith(ending)) return 'masculin';
        }

        // Par défaut, neutre (on utilisera "cet élève")
        return 'neutre';
    },

    /**
     * Génère le HTML pour le skeleton de l'appréciation (Source unique de vérité)
     * @param {boolean} [compact=false] - Version liste (true) ou version carte/focus (false)
     * @returns {string} HTML string
     */
    /**
     * Génère le HTML pour le skeleton de l'appréciation (Source unique de vérité)
     * @param {boolean} [compact=false] - Ajoute la classe 'compact' pour la vue liste
     * @param {string} [label='Génération...'] - Texte du badge
     * @param {boolean} [pending=false] - Si true, style "En attente" (gris/horloge) au lieu de "Actif" (bleu/spinner)
     * @returns {string} HTML string
     */
    getSkeletonHTML(compact = false, label = 'Génération...', pending = false) {
        const compactClass = compact ? ' compact' : '';
        const badgeClass = pending ? 'pending' : 'active';
        const iconName = pending ? 'solar:clock-circle-bold' : 'solar:spinner-bold-duotone';
        const spinClass = pending ? '' : 'rotate-icon';

        // HTML minifié pour éviter les nœuds de texte (whitespace) qui causent des espacements
        return `<div class="appreciation-skeleton${compactClass}"><div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div><span class="generating-badge ${badgeClass}"><iconify-icon icon="${iconName}" class="${spinClass}"></iconify-icon> ${label}</span></div>`;
    },

    /**
     * Détermine la classe CSS associée à une note, alignée sur l'histogramme.
     * @param {number} grade - La note (0-20)
     * @returns {string} Classe CSS ('grade-range-0-4', 'grade-range-4-8', etc.)
     */
    getGradeClass(grade) {
        if (typeof grade !== 'number' || isNaN(grade)) return '';
        if (grade < 4) return 'grade-range-0-4';
        if (grade < 8) return 'grade-range-4-8';
        if (grade < 12) return 'grade-range-8-12';
        if (grade < 16) return 'grade-range-12-16';
        return 'grade-range-16-20';
    },

    /**
     * Determine le type d'évolution dynamiquement en fonction des seuils actuels.
     * @param {number} diff - Valeur de l'évolution
     * @returns {string} 'positive', 'negative', 'stable', etc.
     */
    getEvolutionType(diff) {
        if (diff === null || isNaN(diff)) return 'stable';
        const t = appState.evolutionThresholds;

        if (diff >= t.veryPositive) return 'very-positive';
        if (diff >= t.positive) return 'positive';

        if (diff <= t.veryNegative) return 'very-negative';
        if (diff <= t.negative) return 'negative';

        return 'stable';
    },

    /**
     * Retourne les informations sur le mode de génération (icône, tooltip).
     * @param {Object} result - Résultat de l'élève
     * @returns {{icon: string, tooltip: string}}
     */
    getGenerationModeInfo(result) {
        const sd = result.studentData || {};
        const modelKey = sd.currentAIModel || appState.currentAIModel;
        // Utiliser le nom court s'il existe, sinon la clé brute
        const modelName = MODEL_SHORT_NAMES[modelKey] || modelKey;

        // Construire le tooltip selon les données disponibles
        const parts = [modelName];

        // Ajouter les tokens seulement s'ils sont disponibles et > 0
        const tokens = result.tokenUsage?.appreciation?.total_tokens;
        if (tokens && tokens > 0) {
            parts.push(`${tokens} tokens`);
        }

        // Ajouter le temps seulement s'il est disponible et > 0
        // Note: generationTimeMs est toujours mesuré côté client, indépendamment des tokens API
        const timeMs = result.tokenUsage?.generationTimeMs;
        if (timeMs && timeMs > 0) {
            const timeStr = timeMs >= 1000
                ? `${(timeMs / 1000).toFixed(1)}s`
                : `${timeMs}ms`;
            parts.push(timeStr);
        }

        // Fallback si aucune métadonnée disponible
        const tip = parts.length > 1 ? parts.join(' • ') : `${modelName} • Généré par IA`;

        return { icon: '✨', tooltip: tip };
    },

    /**
     * Crée une copie profonde d'un objet
     * @param {any} obj - L'objet à copier
     * @returns {any} La copie
     */
    deepClone(obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        if (Array.isArray(obj)) return obj.map(item => this.deepClone(item));

        const clone = {};
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                clone[key] = this.deepClone(obj[key]);
            }
        }
        return clone;
    },

    /**
     * Compare deux objets pour vérifier l'égalité profonde
     * @param {any} obj1 - Premier objet
     * @param {any} obj2 - Second objet
     * @returns {boolean} true si égaux
     */
    isEqual(obj1, obj2) {
        if (obj1 === obj2) return true;
        if (obj1 === null || obj2 === null) return false;
        if (typeof obj1 !== 'object' || typeof obj2 !== 'object') return false;

        if (Array.isArray(obj1) !== Array.isArray(obj2)) return false;

        const keys1 = Object.keys(obj1);
        const keys2 = Object.keys(obj2);

        if (keys1.length !== keys2.length) return false;

        for (const key of keys1) {
            if (!keys2.includes(key)) return false;
            if (!this.isEqual(obj1[key], obj2[key])) return false;
        }

        return true;
    },

    /**
     * Échappe les caractères spéciaux HTML pour prévenir les injections XSS
     * @param {string} text - Texte à échapper
     * @returns {string} Texte échappé
     */
    escapeHtml(text) {
        if (!text) return text;
        return String(text)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
};
