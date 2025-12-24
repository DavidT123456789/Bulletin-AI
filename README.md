# 📝 Bulletin AI

> **Assistant intelligent pour la rédaction d'appréciations scolaires**

[![Version](https://img.shields.io/badge/version-0.1.0_Beta-blue.svg)](./CHANGELOG.md)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

## 🎯 Description

Bulletin AI est une application web qui utilise l'Intelligence Artificielle pour aider les enseignants à rédiger des appréciations uniques et personnalisées pour leurs élèves. L'application supporte l'import en masse, la personnalisation par matière, et génère des textes adaptés au profil de chaque élève.

## ✨ Fonctionnalités

- 🤖 **Génération IA** — Support multi-provider (Google Gemini, OpenAI, OpenRouter)
- 📊 **Import en masse** — Copier-coller depuis Excel/Google Sheets ou import de fichiers
- 🎨 **Personnalisation par matière** — Ton, longueur, voix, vocabulaire spécifique
- 📈 **Statistiques** — Moyennes, évolutions, filtres interactifs
- 🎙️ **Dictée vocale** — Reconnaissance vocale pour le contexte
- 🌙 **Mode sombre** — Thème clair/sombre adaptatif
- 💾 **Stockage local** — Données sauvegardées dans le navigateur (RGPD conforme)

## 🚀 Installation

### Prérequis

- [Node.js](https://nodejs.org/) v18+ 
- npm (inclus avec Node.js)

### Étapes

```bash
# 1. Cloner ou télécharger le projet
cd "Bulletin AI"

# 2. Installer les dépendances
npm install

# 3. Lancer le serveur de développement
npm run dev

# 4. Ouvrir dans le navigateur
# http://localhost:5173
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
📂 Bulletin AI/
│
├── 📂 app/            # Application (Logiciel)
│   ├── src/           # Code source JS/CSS principal
│   ├── public/        # Assets statiques de l'app
│   ├── index.html     # Point d'entrée de l'app
│   └── vite.config.js # Configuration de build
│
├── 📂 landing/        # Site Vitrine (Présentation)
│   ├── index.html     # Page d'accueil
│   └── assets/        # Images du site
│
├── start.bat          # Script de lancement (Démarrage serveur)
├── launcher.vbs       # Lanceur silencieux (pour raccourci)
└── README.md          # Documentation globale
```

## 🔑 Configuration API

L'application nécessite une clé API pour fonctionner :

1. **Google Gemini (recommandé, gratuit)** :
   - Aller sur [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
   - Créer une clé API
   - La coller dans les paramètres de l'application

2. **OpenAI** (payant) : Créer une clé sur [platform.openai.com](https://platform.openai.com/api-keys)

3. **OpenRouter** : Créer une clé sur [openrouter.ai](https://openrouter.ai/)

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

MIT — Voir [LICENSE](./LICENSE)

---

Développé pour les enseignants par **David Trafial**
