---
description: Prépare et lance le déploiement vers GitHub Pages
---

# Workflow: Deploy

Ce workflow prépare le déploiement et guide l'utilisateur pour pousser vers GitHub.

## Prérequis
- Les modifications sont terminées et testées
- L'application fonctionne correctement sur localhost

## Étapes

### 1. Vérifier que l'app fonctionne
// turbo
Lancer `npm run build` dans `app/` pour s'assurer que le build passe.

### 2. Mettre à jour le CHANGELOG
Ajouter une entrée dans `CHANGELOG.md` avec les modifications faites.

### 3. Notifier l'utilisateur
Demander à l'utilisateur de:
1. Ouvrir **GitHub Desktop**
2. Sélectionner le repository "bulletin-ai" (ou équivalent)
3. Vérifier les changements dans l'onglet "Changes"
4. Écrire un message de commit (ex: "v0.1.3 - Amélioration UI")
5. Cliquer sur **Commit to main**
6. Cliquer sur **Push origin**

### 4. Confirmer le déploiement
Une fois poussé, GitHub Actions se déclenche automatiquement:
- Build avec Vite
- Déploiement sur GitHub Pages
- L'app est live en ~2-3 minutes

## Commandes utiles
```bash
# Build local pour test
cd app && npm run build

# Preview du build
cd app && npm run preview
```
