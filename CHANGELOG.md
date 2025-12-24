# Changelog

Toutes les modifications notables de ce projet sont documentées dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/),
et ce projet adhère au [Versionnement Sémantique](https://semver.org/lang/fr/).

## [4.3.0] - 2025-12-05

### Ajouté
- 🔒 **Content Security Policy (CSP)** pour renforcer la sécurité
- 📚 **Documentation JSDoc** dans `UIManager.js` avec types et descriptions
- 🧪 **Tests unitaires** pour `UIManager.js` (15+ tests)
- ⌨️ **Raccourcis clavier globaux** : `Ctrl+G` (générer), `Ctrl+S` (sauvegarder), `Escape` (fermer)
- 📄 **README.md** avec instructions d'installation et documentation
- 📋 **CHANGELOG.md** pour suivre l'historique des versions

### Amélioré
- ♿ **Contrastes WCAG** : meilleure lisibilité du texte secondaire (ratio 4.5:1+)
- 🎨 **Accessibilité** : focus visible amélioré, skip link fonctionnel

### Corrigé
- 🐛 Correction de la reconnaissance vocale (duplication de mots)
- 🐛 Correction de l'affichage responsive de la sidebar sur mobile
- 🐛 Correction des boutons de navigation dans les modales

---

## [4.2.0] - 2025-12-04

### Ajouté
- 🔄 Notification de rafraîchissement dans le Laboratoire d'Aperçu
- 📊 Analyse de classe par IA
- 🎯 Personnalisation désactivable (utilise les paramètres par défaut)

### Amélioré
- 🎨 Interface des paramètres par matière
- 📱 Responsive design sur tablettes

### Corrigé
- 🐛 Correction de l'initialisation du compteur de mots
- 🐛 Correction des modèles API (gemini-1.5-flash → gemini-2.0-flash)

---

## [4.1.0] - 2025-12-03

### Ajouté
- 🎙️ Reconnaissance vocale pour la dictée du contexte
- 📥 Import/Export des paramètres (JSON)
- ⭐ Favoris dans l'historique des suggestions

### Amélioré
- 🧹 Nettoyage des fichiers `.bak.renamed`
- 📝 Consolidation du CSS (suppression de `style.css` obsolète)

---

## [4.0.0] - 2025-12-01

### Ajouté
- 🏗️ **Refactorisation ES6** complète de l'application
- 📦 Migration vers **Vite** pour le bundling
- 🧪 Configuration **Vitest** pour les tests unitaires
- 🎨 Architecture CSS modulaire (8 fichiers)

### Changements majeurs
- Passage de scripts inline à modules ES6
- Nouveau système de state management centralisé
- Séparation managers/components/services/utils

---

## [3.x] - Versions antérieures

Versions initiales de l'application avec architecture legacy.
Non documentées dans ce changelog.
