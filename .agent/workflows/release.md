---
description: Workflow complet de release (backup + version + deploy)
---

# Workflow: Release

Workflow complet pour publier une nouvelle version de l'application.

// turbo-all

## Étapes

### 1. Backup de la version actuelle
Exécuter le workflow `/backup` pour sauvegarder l'état actuel.

### 2. Mettre à jour la version
Dans `app/package.json`, incrémenter la version:
- **Patch** (0.1.X): Bug fixes, petites améliorations
- **Minor** (0.X.0): Nouvelles fonctionnalités
- **Major** (X.0.0): Changements majeurs/breaking

### 3. Mettre à jour le CHANGELOG
Ajouter une section dans `CHANGELOG.md`:
```markdown
## [vX.X.X] - YYYY-MM-DD
### Ajouté
- Feature 1
### Modifié
- Change 1
### Corrigé
- Fix 1
```

### 4. Build de vérification
```bash
cd app && npm run build
```

### 5. Déploiement
Exécuter le workflow `/deploy` pour pousser vers GitHub.

### 6. Confirmation
Vérifier que:
- GitHub Actions a réussi
- L'app est accessible sur GitHub Pages
- Les nouvelles fonctionnalités sont visibles

## Checklist Release
- [ ] Backup créé
- [ ] Version incrémentée
- [ ] CHANGELOG mis à jour
- [ ] Build réussi
- [ ] Poussé sur GitHub
- [ ] GitHub Pages déployé
