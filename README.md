# 📝 Bulletin AI

> **L'assistant numérique des enseignants**

[![Version](https://img.shields.io/badge/version-0.1.0_Beta-blue.svg)](./CHANGELOG.md)
[![License](https://img.shields.io/badge/license-CC%20BY--NC--SA%204.0-orange.svg)](./LICENSE.txt)
[![Demo](https://img.shields.io/badge/🚀_Démo_Live-bulletin--ai.pages.dev-00d4aa.svg)](https://bulletin-ai.pages.dev/app.html)

## 🌐 Accès rapide

| 🎯 Application | 📄 Landing Page |
|:-------------:|:---------------:|
| **[Lancer l'application →](https://bulletin-ai.pages.dev/app.html)** | [Découvrir le projet](https://bulletin-ai.pages.dev/) |

## 🎯 Description

Bulletin AI est une application web qui utilise l'Intelligence Artificielle pour aider les enseignants à gérer leurs fins de trimestre. L'application génère des appréciations personnalisées, propose un plan de classe interactif par glisser-déposer, et offre un journal de bord pour suivre chaque élève au fil du temps.

## ✨ Fonctionnalités

- 🤖 **Génération IA** — Support multi-provider (Mistral AI, Google Gemini, OpenRouter, Ollama)
- 📊 **Import en masse** — Copier-coller depuis Excel/Google Sheets ou import de fichiers
- 🎨 **Personnalisation par matière** — Ton, longueur, voix, vocabulaire spécifique
- 🗺️ **Plan de classe** — Disposition interactive par glisser-déposer, export PDF
- 📈 **Statistiques** — Moyennes, évolutions, filtres interactifs
- 🎙️ **Dictée vocale** — Reconnaissance vocale pour le contexte et les appréciations
- 🌙 **Mode sombre** — Thème clair/sombre adaptatif
- 💾 **Stockage local** — Données sauvegardées dans le navigateur (RGPD conforme)
- ☁️ **Synchronisation cloud** — Sync optionnel via Google Drive (multi-appareils)

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
│   └── src/          # Code source JS/CSS
├── 📂 .github/       # GitHub Actions (deploy automatique)
└── README.md
```

## 🔑 Configuration API

L'application nécessite une clé API pour fonctionner :

1. **Mistral AI (recommandé, gratuit 🇫🇷)** :
   - Créer un compte sur [console.mistral.ai](https://console.mistral.ai/api-keys/)
   - Générer une clé API (1 milliard de tokens/mois gratuits)
   - La coller dans les paramètres de l'application

2. **Google Gemini** (gratuit) : Créer une clé sur [aistudio.google.com](https://aistudio.google.com/app/apikey)

3. **OpenRouter** : Créer une clé sur [openrouter.ai](https://openrouter.ai/)

4. **Ollama** (100% hors ligne) : Installer [Ollama](https://ollama.com/) et configurer l'URL locale

## ⌨️ Raccourcis clavier

| Raccourci | Action |
|-----------|--------|
| `Ctrl + G` | Générer l'appréciation |
| `Ctrl + S` | Sauvegarder les paramètres (dans la modale) |
| `Escape` | Fermer la modale active |
| `←` / `→` | Navigation entre élèves (dans une modale) |

## 🧪 Tests

```bash
# Lancer tous les tests
npm run test

# Lancer les tests en mode watch
npm run test -- --watch

# Voir la couverture
npm run test:coverage
```

## 🔒 Confidentialité

- ✅ Données stockées **localement** dans le navigateur
- ✅ Clés API jamais partagées
- ✅ Communication directe avec les APIs (pas de serveur intermédiaire)
- ✅ Conforme RGPD

## 📄 Licence

CC BY-NC-SA 4.0 — Voir [LICENSE.txt](./LICENSE.txt)

---

Développé pour les enseignants par **David Trafial**
