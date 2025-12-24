---
description: Prépare une release (backup + version + changelog) sans déployer
---

# Workflow: Prepare Release

Prépare une nouvelle version pour tests internes, sans déployer en production.

// turbo-all

## Étapes

### 1. Backup de la version actuelle
Exécuter le script `backup-version.bat` pour sauvegarder l'état actuel dans `Save/`.

### 2. Incrémenter la version
Dans `app/src/config/constants.js`, mettre à jour `APP_VERSION`:
- **Patch** (0.1.X): Bug fixes
- **Minor** (0.X.0): Nouvelles fonctionnalités
- **Major** (X.0.0): Changements majeurs

Synchroniser aussi dans `app/package.json`.

### 3. Mettre à jour le CHANGELOG
Ajouter une section dans `CHANGELOG.md`:
```markdown
## [X.X.X] - YYYY-MM-DD

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

### 5. Test local
Lancer l'app en local pour tester avant déploiement.

## ⚠️ Ce workflow NE déploie PAS
Utilise `/deploy` quand les tests internes sont validés.
