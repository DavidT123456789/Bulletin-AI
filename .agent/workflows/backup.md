---
description: Sauvegarde la version actuelle vers le dossier Save
---

# Workflow: Backup Version

Ce workflow crée une sauvegarde de la version actuelle dans le dossier `Save/`.

## Étapes

### 1. Déterminer la version actuelle
// turbo
Lire la version dans `app/package.json` pour nommer correctement le backup.

### 2. Exécuter le script de backup
Lancer le script `backup-version.bat` qui:
- Crée un dossier `Save/vX.X.X-YYYY-MM-DD/`
- Copie les fichiers essentiels (`app/src`, `app/public`, configs)
- Exclut `node_modules`, `dist`, fichiers temporaires

### 3. Confirmer le backup
Vérifier que les fichiers ont été copiés correctement.

## Fichiers à sauvegarder
- `app/src/` - Code source
- `app/public/` - Assets
- `app/index.html` et `app/app.html`
- `app/package.json` et configs
- `CHANGELOG.md`, `README.md`

## Fichiers à exclure
- `node_modules/`
- `dist/`, `dist_test/`
- `*.log`
- `.git/`
