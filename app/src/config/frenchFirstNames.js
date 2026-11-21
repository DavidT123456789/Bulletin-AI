/**
 * @fileoverview Listes module-level de prénoms courants (cohortes collégiens / lycéens en France)
 * et terminaisons conservatrices pour la détection locale du genre grammatical (`Utils.detectGender`).
 *
 * Toutes les entrées sont normalisées (minuscules ASCII, sans accents ni doublons)
 * et strictement disjointes entre `EPICENE_FIRST_NAMES`, `FEMININ_FIRST_NAMES` et `MASCULIN_FIRST_NAMES`.
 * @module config/frenchFirstNames
 */

/**
 * Prénoms épicènes (mixtes en France) — prioritaires pour éviter tout mégenrage.
 * @type {ReadonlySet<string>}
 */
export const EPICENE_FIRST_NAMES = new Set([
    'alex', 'alix', 'andrea', 'ange', 'ariel', 'billie', 'cameron', 'camille',
    'charlie', 'claude', 'dominique', 'eden', 'kim', 'lois', 'lou', 'louison',
    'mahe', 'noa', 'nour', 'sacha', 'sam', 'sasha', 'swann', 'yael'
]);

/**
 * Prénoms féminins courants (cohortes INSEE collégiens / lycéens + classiques et diversité des classes françaises).
 * @type {ReadonlySet<string>}
 */
export const FEMININ_FIRST_NAMES = new Set([
    'abigail', 'adelaide', 'adele', 'adeline', 'agathe', 'agnes', 'aicha', 'aida',
    'aissata', 'aissatou', 'alba', 'albane', 'alexandra', 'alexia', 'alia', 'alice',
    'alicia', 'alienor', 'alina', 'aline', 'alison', 'aliya', 'aliyah', 'alma',
    'alya', 'alyssa', 'alyssia', 'amandine', 'amaya', 'ambre', 'amel', 'amelia',
    'amelie', 'amina', 'aminata', 'amira', 'ana', 'anabele', 'anabelle', 'anae',
    'anaelle', 'anais', 'anastasia', 'angelina', 'angeline', 'angelique', 'anissa',
    'ann', 'anna', 'annabelle', 'anne', 'annie', 'anouk', 'apolline', 'aria',
    'ariane', 'arya', 'asma', 'asmaa', 'assia', 'assya', 'astrid', 'athena',
    'athenais', 'aube', 'aude', 'audrey', 'augustine', 'aurelia', 'aurelie', 'aurore',
    'ava', 'awa', 'axelle', 'aya', 'aylin', 'barbara', 'beatrice', 'berenice',
    'bertille', 'binta', 'blanche', 'blandine', 'brigitte', 'calie', 'calista',
    'candice', 'capucine', 'carla', 'carmen', 'caroline', 'cassandre', 'cassie',
    'catherine', 'cecile', 'celeste', 'celestine', 'celia', 'celina', 'celine',
    'cerise', 'chaima', 'chaimae', 'charlene', 'charline', 'charlotte', 'chiara',
    'chloe', 'christelle', 'christine', 'cindy', 'claire', 'clara', 'clarisse',
    'clea', 'clelia', 'clemence', 'clementine', 'cleo', 'clothilde', 'clotilde',
    'colette', 'coline', 'colombe', 'constance', 'coralie', 'coraline', 'cyrielle',
    'dalia', 'daphne', 'deborah', 'delphine', 'diane', 'diariatou', 'dina', 'dounia',
    'eileen', 'elea', 'eleanor', 'eleana', 'elena', 'eleonore', 'elia', 'eliana',
    'elina', 'eline', 'elisa', 'elisabeth', 'elise', 'elizabeth', 'ella', 'elodie',
    'eloise', 'elsa', 'elya', 'elyna', 'emeline', 'emilie', 'emily', 'emma',
    'emmanuelle', 'emmy', 'emy', 'ena', 'enola', 'enora', 'enya', 'erin',
    'estelle', 'esther', 'eugenie', 'eulalie', 'eva', 'eve', 'evelyne', 'fanny',
    'farah', 'fatima', 'fatimata', 'fatou', 'fatoumata', 'faustine', 'fiona',
    'flavie', 'fleur', 'flore', 'florence', 'floriane', 'florine', 'francoise',
    'gabriela', 'gabriella', 'gabrielle', 'gaelle', 'garance', 'genevieve', 'giulia',
    'grace', 'gwenaelle', 'gwendoline', 'hadja', 'hafsa', 'hajar', 'halima', 'hana',
    'hanae', 'hannah', 'hawa', 'helena', 'helene', 'heloise', 'hermine', 'hind',
    'hortense', 'houda', 'ilana', 'ilona', 'ilyana', 'imane', 'imen', 'imene',
    'inaya', 'ines', 'iness', 'ingrid', 'irina', 'iris', 'isabelle', 'isaure',
    'israa', 'jade', 'janna', 'jannah', 'jasmine', 'jeanne', 'jenna', 'jennifer',
    'jessica', 'jihane', 'joanna', 'johanna', 'josephine', 'joy', 'joyce', 'judith',
    'julia', 'juliane', 'julie', 'juliette', 'justine', 'kahina', 'kamilia', 'karima',
    'karine', 'katia', 'kayla', 'keira', 'kelia', 'kelly', 'kelya', 'kendra',
    'kenza', 'khadija', 'khadijatou', 'khloe', 'kiara', 'kloe', 'laetitia', 'laila',
    'lana', 'lara', 'laura', 'laure', 'laurence', 'laurene', 'laurine', 'layla',
    'lea', 'leana', 'leane', 'leanna', 'leila', 'leina', 'lena', 'lenna', 'leona',
    'leonie', 'leontine', 'leslie', 'leyla', 'lia', 'liana', 'lila', 'lilas',
    'lilia', 'liliane', 'lilou', 'lily', 'lilya', 'lina', 'linda', 'line',
    'linnea', 'lisa', 'lise', 'lison', 'livia', 'liya', 'loane', 'loanne', 'lola',
    'lorena', 'lorine', 'louna', 'louane', 'louanne', 'louisa', 'louise', 'lucia',
    'lucie', 'lucile', 'lucille', 'ludivine', 'luna', 'lyana', 'lydia', 'lydie',
    'lylia', 'lylou', 'lyna', 'madeleine', 'madison', 'mae', 'maela', 'maelle',
    'maely', 'maelya', 'maelyne', 'maelys', 'maelyss', 'maeva', 'magali', 'mahault',
    'maia', 'mailys', 'maina', 'maissa', 'maiwen', 'maiwenn', 'malak', 'manel',
    'manelle', 'manon', 'margaux', 'margo', 'margot', 'marguerite', 'maria', 'mariam',
    'mariama', 'mariame', 'marianne', 'marie', 'marilou', 'marina', 'marine', 'marion',
    'marjorie', 'marlene', 'marthe', 'martine', 'marwa', 'maryam', 'marylou', 'mathilda',
    'mathilde', 'maud', 'maude', 'maya', 'maylis', 'mayssa', 'melanie', 'melia',
    'melina', 'meline', 'melissa', 'melodie', 'melody', 'melusine', 'meriem', 'meryem',
    'mia', 'michele', 'mila', 'milla', 'mina', 'miriam', 'mona', 'morgane',
    'mounia', 'muriel', 'murielle', 'mya', 'myriam', 'nada', 'nadia', 'nadine',
    'naelle', 'naima', 'nina', 'naomi', 'naomie', 'nathalie', 'nawal', 'nawel',
    'naya', 'neila', 'nella', 'nelly', 'nesrine', 'neylla', 'nicole', 'ninon',
    'nisrine', 'noelie', 'noelle', 'noemi', 'noemie', 'nola', 'nolwenn', 'nora',
    'norah', 'noura', 'oceane', 'octavie', 'odile', 'olivia', 'olympe', 'ombeline',
    'ophelie', 'oriane', 'orlane', 'ornella', 'oumaima', 'paloma', 'pamela', 'paola',
    'pascale', 'patricia', 'paula', 'pauline', 'penelope', 'perrine', 'philippine',
    'pia', 'prisca', 'priscille', 'priscilla', 'rachel', 'rachelle', 'rahma', 'rania',
    'raphaelle', 'rawane', 'rebecca', 'rim', 'rima', 'rita', 'romane', 'romie',
    'romy', 'rosa', 'rosalie', 'rose', 'roxane', 'roxanne', 'roya', 'ruth',
    'sabrina', 'safa', 'safaa', 'safia', 'safiya', 'sakina', 'salimata', 'salma',
    'salome', 'samia', 'samira', 'sana', 'sanaa', 'sandra', 'sandrine', 'sara',
    'sarah', 'selena', 'selene', 'selin', 'selma', 'seraphine', 'serena', 'severine',
    'shaima', 'shana', 'shanna', 'shannon', 'sharon', 'shayma', 'sheryl', 'shirin',
    'sibylle', 'sidonie', 'sienna', 'siham', 'siloee', 'simone', 'sirine', 'sixtine',
    'sloane', 'sofia', 'soizic', 'solene', 'solenne', 'soline', 'sonia', 'sophia',
    'sophie', 'soraya', 'souad', 'soukaina', 'soumaya', 'stella', 'stephanie', 'suzanne',
    'suzie', 'sybille', 'sylvie', 'talia', 'tamara', 'tania', 'tanya', 'tasnim',
    'tasnime', 'tatiana', 'tess', 'tessa', 'thais', 'thalia', 'thea', 'thelma',
    'therese', 'tia', 'tiana', 'tiffany', 'tiphaine', 'valentine', 'valentina', 'valeria',
    'valerie', 'vanessa', 'veronique', 'victoire', 'victoria', 'violaine', 'violette',
    'virginie', 'viviane', 'wafa', 'wendy', 'wiam', 'wissal', 'yamina', 'yasmin',
    'yasmina', 'yasmine', 'yona', 'yousra', 'yuna', 'zahra', 'zainab', 'zara',
    'zeinab', 'zelie', 'zineb', 'zoe', 'zoee', 'zohra'
]);

/**
 * Prénoms masculins courants (cohortes INSEE collégiens / lycéens + classiques et diversité des classes françaises).
 * @type {ReadonlySet<string>}
 */
export const MASCULIN_FIRST_NAMES = new Set([
    'aaron', 'abdallah', 'abdel', 'abdelkrim', 'abderrahmane', 'abdoul', 'abdoulaye',
    'abel', 'aboubacar', 'achille', 'adam', 'adama', 'adame', 'adel', 'adem',
    'adrien', 'ahmed', 'aidan', 'aiden', 'aimen', 'akram', 'alain', 'alan',
    'alban', 'albert', 'albin', 'alec', 'alejandro', 'alessandro', 'alessio', 'alexander',
    'alexandre', 'alexi', 'alexis', 'ali', 'alixandre', 'allan', 'alois', 'alpha',
    'amadou', 'amael', 'amar', 'amaury', 'ambroise', 'amine', 'amir', 'amjad',
    'anas', 'anass', 'anatole', 'andre', 'andreas', 'andrew', 'andy', 'angel',
    'angelo', 'anis', 'anthony', 'antoine', 'anton', 'antonin', 'antonio', 'ariles',
    'armand', 'armel', 'arnaud', 'arno', 'aron', 'arsene', 'arthur', 'arthus',
    'aubin', 'aubry', 'auguste', 'augustin', 'aurel', 'aurelien', 'axel', 'aydan',
    'ayden', 'ayman', 'aymane', 'aymen', 'aymeric', 'ayoub', 'aziz', 'badr',
    'badredine', 'bakary', 'balthazar', 'baptiste', 'barnabe', 'barthelemy', 'basile',
    'bastian', 'bastien', 'baudouin', 'ben', 'benjamin', 'benoit', 'bernard', 'bilal',
    'bilel', 'blaise', 'boris', 'boubacar', 'brahim', 'brandon', 'brian', 'brice',
    'bruno', 'bryan', 'caleb', 'calixte', 'carl', 'carlos', 'cedric', 'celestin',
    'celian', 'cesar', 'chakib', 'charles', 'charly', 'cheikh', 'chris', 'christian',
    'christophe', 'christopher', 'clement', 'colin', 'come', 'conrad', 'constant',
    'constantin', 'corentin', 'cyprien', 'cyril', 'cyrille', 'damien', 'dan', 'daniel',
    'danny', 'dany', 'dario', 'darius', 'david', 'demba', 'denis', 'devon',
    'diego', 'dimitri', 'diogo', 'djibril', 'donovan', 'dorian', 'driss', 'dylan',
    'edgar', 'edgard', 'edmond', 'edouard', 'edward', 'elhadj', 'eli', 'elias',
    'elie', 'elijah', 'elio', 'eliot', 'eliott', 'elliot', 'elliott', 'eloi',
    'elouan', 'elouann', 'elyas', 'elyes', 'emile', 'emilien', 'emilio', 'emmanuel',
    'emrys', 'enzo', 'eric', 'erwan', 'erwann', 'esteban', 'ethan', 'ethann',
    'etienne', 'eugene', 'evan', 'evann', 'ewan', 'ewen', 'ewenn', 'eythan',
    'ezekiel', 'ezio', 'ezra', 'fabien', 'fabio', 'fabrice', 'fadi', 'farhad',
    'fares', 'farid', 'felix', 'ferdinand', 'fernand', 'flavio', 'flavien', 'florent',
    'florentin', 'florian', 'fode', 'fouad', 'franck', 'francois', 'frederic',
    'gabin', 'gabriel', 'gael', 'gaetan', 'gaspar', 'gaspard', 'gaston', 'gauthier',
    'gautier', 'geoffrey', 'geoffroy', 'georges', 'gerald', 'gerard', 'germain',
    'ghislain', 'gianni', 'gilbert', 'gilles', 'giovanni', 'gregoire', 'gregory',
    'guilhem', 'guillaume', 'gustave', 'guy', 'gwenael', 'habib', 'hadrien', 'hakim',
    'hamza', 'harold', 'haroun', 'harouna', 'harry', 'hassan', 'hatim', 'hayden',
    'hector', 'hedi', 'helio', 'henri', 'henry', 'herve', 'hicham', 'hippolyte',
    'honore', 'hubert', 'hugo', 'hugues', 'ian', 'ibrahim', 'ibrahima',
    'idris', 'idriss', 'idrissa', 'igor', 'ilan', 'ilann', 'ilhan', 'ilian',
    'ilias', 'ilies', 'illyes', 'ilyan', 'ilyas', 'ilyes', 'imad', 'imran',
    'imrane', 'isaac', 'isaiah', 'isaie', 'ismael', 'ismail', 'issa', 'issam',
    'ivan', 'iyad', 'iyed', 'jacek', 'jack', 'jacob', 'jacques', 'jad',
    'jaden', 'james', 'jason', 'jassem', 'jawad', 'jawed', 'jayden', 'jean',
    'jeremie', 'jeremy', 'jerome', 'jibril', 'jimmy', 'joachim', 'joao', 'joel',
    'joey', 'joffrey', 'johan', 'johann', 'john', 'jonah', 'jonas', 'jonathan',
    'jordan', 'jordy', 'joris', 'jose', 'joseph', 'joshua', 'josselin', 'jude',
    'jules', 'julian', 'julien', 'justin', 'kael', 'kaelan', 'kais', 'kaiss',
    'kamal', 'kamel', 'kamil', 'karam', 'karim', 'kassim', 'kayden', 'kays',
    'kelian', 'kellyan', 'kelvin', 'kelyan', 'kenan', 'kenny', 'kenzi', 'kenzo',
    'kenzy', 'kevin', 'khalid', 'khalil', 'kieran', 'kilian', 'killian', 'kilyan',
    'kyle', 'kylian', 'kyliann', 'kyllian', 'lamine', 'landry', 'lassana', 'laurent',
    'lazare', 'leandre', 'leandro', 'lenny', 'leny', 'leo', 'leon', 'leonard',
    'leonardo', 'leopold', 'levi', 'lewis', 'liam', 'lilian', 'lino', 'lionel',
    'lio', 'lisandro', 'livio', 'liyam', 'loan', 'loann', 'logan', 'lohan',
    'lohann', 'loic', 'loick', 'lorenzo', 'lorik', 'loris', 'louca', 'loucas',
    'louis', 'louka', 'loukas', 'loup', 'luan', 'luc', 'luca', 'lucas',
    'lucien', 'ludovic', 'luis', 'luka', 'lukas', 'lyam', 'lyes', 'lysandre',
    'maceo', 'madiba', 'mael', 'maelan', 'mahdi', 'mahmoud', 'malcolm', 'malek',
    'malik', 'malo', 'mamadou', 'mamadouba', 'manuel', 'marc', 'marceau', 'marcel',
    'marco', 'marcus', 'marin', 'mario', 'marius', 'mark', 'marlon', 'marouan',
    'marouane', 'martin', 'marvin', 'marwan', 'marwane', 'mateo', 'matheis', 'matheo',
    'mathias', 'mathieu', 'mathis', 'mathys', 'matias', 'matis', 'matteo', 'matthias',
    'matthieu', 'matthis', 'matthys', 'mattia', 'matys', 'maurice', 'max', 'maxence',
    'maxime', 'maximilien', 'maylon', 'mayron', 'mehdi', 'melchior', 'melvin', 'melvyn',
    'merlin', 'michel', 'mickael', 'miguel', 'mika', 'mikael', 'milan', 'milann', 'milo',
    'moamed', 'modibo', 'mohamed', 'mohammed', 'moise', 'morgan', 'mouad', 'mouhamadou',
    'mouhamed', 'moussa', 'mustapha', 'nabil', 'nacer', 'nadir', 'nael', 'nahel',
    'nahil', 'naim', 'nassim', 'natan', 'nathan', 'nathanael', 'natheo', 'nattan',
    'nawfel', 'neil', 'nelson', 'neo', 'niam', 'nicolas', 'niels', 'nikola',
    'nils', 'nino', 'noah', 'noam', 'noan', 'noe', 'noel', 'noham',
    'nohan', 'nolan', 'nolann', 'nolhan', 'norbert', 'noureddine', 'octave', 'octavio',
    'olivier', 'omar', 'oscar', 'oskar', 'othman', 'othmane', 'oumar', 'ousmane',
    'owen', 'pablo', 'paco', 'pacome', 'paolo', 'pascal', 'patrice', 'patrick',
    'paul', 'paulin', 'pedro', 'peter', 'phileas', 'philemon', 'philippe', 'pierre',
    'pierrick', 'pol', 'quentin', 'rachid', 'rafael', 'rahim', 'rami', 'ramy',
    'raphael', 'rayan', 'rayane', 'rayen', 'raymond', 'reda', 'redouane', 'regis',
    'remi', 'remy', 'renaud', 'rene', 'reuben', 'riad', 'richard', 'riyad',
    'robert', 'robin', 'rodolphe', 'rodrigue', 'roger', 'rohan', 'roland', 'romain',
    'roman', 'romaric', 'romeo', 'ronan', 'ruben', 'rudy', 'ryan', 'ryad',
    'saad', 'sabri', 'sadio', 'said', 'salim', 'salomon', 'samba', 'sami',
    'samir', 'samuel', 'samy', 'sandro', 'santiago', 'saul', 'scott', 'sean',
    'sebastien', 'sekou', 'selim', 'serge', 'seth', 'sidney', 'silas', 'simeon',
    'simon', 'soan', 'soann', 'sofian', 'sofiane', 'sohan', 'sohann', 'solal',
    'soren', 'soufiane', 'souleyman', 'souleymane', 'stan', 'stanislas', 'stephan',
    'stephane', 'steve', 'steven', 'sulayman', 'sullyvan', 'sven', 'swan', 'sylvain',
    'taha', 'taim', 'tancrede', 'tanguy', 'tao', 'tarek', 'tariq',
    'teddy', 'teo', 'terence', 'theo', 'theodore', 'theophile', 'theotime', 'thiago',
    'thibaud', 'thibault', 'thibaut', 'thierry', 'thimeo', 'thomas', 'tiago', 'tidiane',
    'tim', 'timeo', 'timote', 'timothe', 'timothee', 'timothy', 'tino', 'titouan',
    'tobias', 'tom', 'tomas', 'tommy', 'tony', 'tristan', 'tyler', 'tymeo',
    'tyron', 'ugo', 'ulysse', 'vadim', 'valentin', 'valentino', 'vasco', 'victor',
    'victorien', 'vincent', 'virgile', 'vivien', 'vladimir', 'wael', 'walid', 'warren',
    'wassim', 'wendell', 'wesley', 'wilfried', 'william', 'willy', 'wilson', 'wissem',
    'yacin', 'yacine', 'yacoub', 'yahya', 'yan', 'yanis', 'yann', 'yannick',
    'yannis', 'yassin', 'yassine', 'yassir', 'yazid', 'ylan', 'ylann', 'yoan',
    'yoann', 'yohan', 'yohann', 'yoni', 'youcef', 'younes', 'youness', 'younous',
    'youssef', 'youssouf', 'yusuf', 'yvan', 'yves', 'zacharia', 'zacharie', 'zachary',
    'zack', 'zackary', 'zakaria', 'zakariya', 'zakary', 'zayd', 'ziad', 'zinedine',
    'ziyad', 'zyad'
]);

/**
 * Terminaisons féminines conservatrices (évite volontairement -a, -ane, -ine, -ie, -ee
 * qui mégenrent de nombreux prénoms masculins comme Louka, Rayane, Amine, Zacharie, Timothée).
 * @type {readonly string[]}
 */
export const FEMININ_ENDINGS = Object.freeze([
    'ette', 'elle', 'enne', 'line', 'tine', 'phine', 'anne', 'aelle', 'euse'
]);

/**
 * Terminaisons masculines conservatrices (évite volontairement -in qui mégenre Erin, Aylin, Selin, Yasmin).
 * @type {readonly string[]}
 */
export const MASCULIN_ENDINGS = Object.freeze([
    'ien', 'ard', 'aud', 'ault', 'ert', 'ois', 'ric'
]);
