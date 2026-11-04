# 📝 Bulletin AI

> **L'assistant numérique des enseignants**

[![Version](https://img.shields.io/badge/version-0.1.1_Beta-blue.svg)](./CHANGELOG.md)
[![License](https://img.shields.io/badge/license-CC%20BY--NC--SA%204.0-orange.svg)](./LICENSE.txt)
[![Demo](https://img.shields.io/badge/🚀_Démo_Live-bulletin--ai.pages.dev-00d4aa.svg)](https://bulletin-ai.pages.dev/app.html)

## 🌐 Accès rapide

| 🎯 Application | 📄 Landing Page |
|:-------------:|:---------------:|
| **[Lancer l'application →](https://bulletin-ai.pages.dev/app.html)** | [Découvrir le projet](https://bulletin-ai.pages.dev/) |

## 🎯 Description

Bulletin AI est une application web qui utilise l'Intelligence Artificielle pour aider les enseignants à gérer leurs fins de trimestre. L'application génère des appréciations personnalisées, propose un plan de classe interactif par glisser-déposer, et offre un journal de bord pour suivre chaque élève au fil du temps.

## ✨ Fonctionnalités

- 🤖 **Génération IA multi-moteurs** — Compatible **Albert API** (IA souveraine Gouv.fr / DINUM via ProConnect), Google Gemini, Groq Cloud, Mistral AI, OpenAI, Claude, OpenRouter et **Ollama** (100 % hors-ligne)
- 🛡️ **Pseudonymisation RGPD à la volée** — Masquage par défaut des prénoms (`[PRÉNOM]`), exclusion systématique des noms de famille et des photos, et traduction locale des statuts médico-scolaires (`PAI`, `PAP`, `ULIS`, `PPRE`, `AESH`) en consignes pédagogiques neutres
- 📊 **Import en masse** — Copier-coller depuis Pronote/Excel ou import de fichiers PDF/CSV
- 🎨 **Personnalisation par matière** — Ton, longueur, voix, vocabulaire spécifique
- 🗺️ **Plan de classe & Trombinoscope** — Disposition interactive (cours & îlots d'activité), découpe locale de trombinoscope PDF Pronote, export PDF
- 📈 **Statistiques & Synthèse du conseil** — Moyennes, évolutions, filtres interactifs et bilan global de classe
- 🎙️ **Dictée vocale** — Reconnaissance vocale pour le contexte et les appréciations
- 🌙 **Mode sombre** — Thème clair/sombre adaptatif
- 💾 **Architecture Local-First** — Données stockées exclusivement dans le navigateur (`IndexedDB` & `LocalStorage`), sans serveur tiers
- ☁️ **Synchronisation cloud optionnelle** — Sauvegarde manuelle vers votre propre Google Drive (clés API isolées)

## 🚀 Installation

### Prérequis

- [Node.js](https://nodejs.org/) v18+
- npm (inclus avec Node.js)

### Étapes

```bash
# 1. Cloner ou télécharger le projet
git clone https://github.com/DavidT123456789/Bulletin-AI.git
cd Bulletin-AI/app

# 2. Installer les dépendances
npm install

# 3. Lancer le serveur de développement
npm run dev

# 4. Ouvrir dans le navigateur
# http://localhost:4000
```

## 📦 Scripts disponibles

| Commande | Description |
|----------|-------------|
| `npm run dev` | Lance le serveur de développement Vite |
| `npm run build` | Génère le build de production |
| `npm run preview` | Prévisualise le build de production |
| `npm run test` | Lance les tests unitaires (Vitest) |
| `npm run test:ui` | Lance les tests avec interface graphique |
| `npm run test:coverage` | Génère le rapport de couverture |

## 📁 Structure du projet

```
📂 Bulletin-AI/
├── 📂 app/           # Application (code source, assets, config)
│   ├── index.html    # Landing page (site vitrine)
│   ├── app.html      # Application principale
│   ├── functions/    # Relais Cloudflare Pages sans état (CORS Albert API)
│   └── src/          # Code source JS/CSS
├── 📂 .github/       # GitHub Actions (deploy automatique)
└── README.md
```

## 🔑 Configuration API (Modèle BYOK — Clés personnelles)

Chaque enseignant utilise sa propre clé personnelle (stockée uniquement dans son navigateur) :

1. **Albert API — IA souveraine Gouv.fr (recommandé, 100 % gratuit 🇫🇷)** :
   - Se connecter via **ProConnect** (adresse académique) sur [albert.playground.etalab.gouv.fr](https://albert.playground.etalab.gouv.fr)
   - Générer une clé API personnelle (`sk-...`) et la coller dans l'application

2. **Google Gemini (gratuit sans carte bancaire)** : Créer une clé sur [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)

3. **Groq Cloud (gratuit sans carte bancaire)** : Créer une clé sur [console.groq.com/keys](https://console.groq.com/keys)

4. **Mistral AI / OpenAI / Anthropic / OpenRouter** : Fournisseurs spécialisés en mode *pay-as-you-go*

5. **Ollama (100 % local & hors-ligne)** : Installer [Ollama](https://ollama.com/) sur votre poste pour une exécution sans aucun appel réseau externe

## ⌨️ Raccourcis clavier

| Raccourci | Action |
|-----------|--------|
| `Ctrl + Entrée` | Générer l'appréciation |
| `Ctrl + F` | Rechercher un élève |
| `Escape` | Fermer la modale active |
| `←` / `→` | Navigation entre élèves (dans le panneau Focus) |

## 🧪 Tests

```bash
# Lancer tous les tests
npm run test

# Lancer les tests en mode watch
npm run test -- --watch

# Voir la couverture
npm run test:coverage
```

## 🔒 Confidentialité, RGPD & Indépendance

- ✅ **Zéro base de données serveur** : Toutes les classes, notes et photos restent dans le navigateur de l'enseignant (`IndexedDB` / `LocalStorage`).
- ✅ **Pseudonymisation avant envoi IA** : Les noms de famille et photos ne sont jamais transmis ; les prénoms sont remplacés par `[PRÉNOM]` par défaut et réinjectés localement au retour ; les acronymes relevant de l'Art. 9 du RGPD (`PAI`, `PAP`, `ULIS`, `PPRE`, `AESH`, `Geva-Sco`) sont convertis localement en consignes pédagogiques neutres.
- ✅ **Clés API personnelles (BYOK)** : Vos clés (notamment ProConnect / Albert API) ne sont jamais partagées ni mutualisées.
- ✅ **Outil gratuit & indépendant** : Application développée bénévolement, sans compte, sans pistage ni publicité. Les dons libres sur [Ko-fi](https://ko-fi.com/profassistant) soutiennent exclusivement le développement de l'interface et son hébergement.

## 📄 Licence

CC BY-NC-SA 4.0 — Voir [LICENSE.txt](./LICENSE.txt)

---

Développé pour les enseignants par **David Trafial**
