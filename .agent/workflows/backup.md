---
description: Sauvegarde la version actuelle vers le dossier Save
---

# Workflow: Backup Version

Ce workflow crÃ©e une sauvegarde de la version actuelle dans le dossier `Save/`.

// turbo-all

## âš ï¸ IMPORTANT - RÃ©pertoire de travail

**TOUJOURS exÃ©cuter les commandes depuis `Antigravity Access/` (PAS depuis `Bulletin-AI/`).**

Le dossier `Save/` est au mÃªme niveau que `Bulletin-AI/`, pas Ã  l'intÃ©rieur.

Structure correcte :

```
Antigravity Access/
â”œâ”€â”€ Bulletin-AI/      â† Code source (repo git)
â”‚   â””â”€â”€ app/
â”œâ”€â”€ Save/             â† Backups (EN DEHORS du repo)
â”‚   â”œâ”€â”€ v0.1.0-2026-01-07_21h02/
â”‚   â””â”€â”€ ...
â””â”€â”€ .agent/
```

## Format du nom de dossier

**OBLIGATOIRE**: Le format DOIT inclure l'heure pour permettre plusieurs backups par jour :

```
vX.X.X-YYYY-MM-DD_HHhMM
```

Exemple : `v0.1.0-2026-01-08_09h55`

## Ã‰tapes

### 1. DÃ©terminer la version et crÃ©er le dossier

// turbo
Lire la version dans `Bulletin-AI/app/package.json` et crÃ©er le dossier de backup avec l'heure actuelle.

**Commande PowerShell (depuis Antigravity Access/) :**

```powershell
$version = (Get-Content "Bulletin-AI/app/package.json" | ConvertFrom-Json).version
$timestamp = Get-Date -Format "yyyy-MM-dd_HH\hmm"
$backupDir = "Save/v$version-$timestamp"
New-Item -ItemType Directory -Path $backupDir -Force
```

### 2. Copier les fichiers

// turbo
Copier tous les fichiers essentiels vers le dossier de backup.

**Commande PowerShell :**

```powershell
Copy-Item -Path "Bulletin-AI/app/src" -Destination $backupDir -Recurse -Force
Copy-Item -Path "Bulletin-AI/app/public" -Destination $backupDir -Recurse -Force
Copy-Item -Path "Bulletin-AI/app/index.html" -Destination $backupDir -Force
Copy-Item -Path "Bulletin-AI/app/app.html" -Destination $backupDir -Force
Copy-Item -Path "Bulletin-AI/app/package.json" -Destination $backupDir -Force
if (Test-Path "Bulletin-AI/CHANGELOG.md") { Copy-Item "Bulletin-AI/CHANGELOG.md" -Destination $backupDir -Force }
if (Test-Path "Bulletin-AI/README.md") { Copy-Item "Bulletin-AI/README.md" -Destination $backupDir -Force }
```

### 3. Confirmer le backup

// turbo
VÃ©rifier que les fichiers ont Ã©tÃ© copiÃ©s et afficher le rÃ©sumÃ©.

```powershell
$count = (Get-ChildItem -Path $backupDir -Recurse | Measure-Object).Count
Write-Host "âœ… Backup crÃ©Ã©: $backupDir ($count fichiers)"
```

## Fichiers Ã  sauvegarder

- `Bulletin-AI/app/src/` - Code source
- `Bulletin-AI/app/public/` - Assets
- `Bulletin-AI/app/index.html` et `app/app.html`
- `Bulletin-AI/app/package.json` et configs
- `Bulletin-AI/CHANGELOG.md`, `README.md`

## Fichiers Ã  exclure

- `node_modules/`
- `dist/`, `dist_test/`
- `*.log`
- `.git/`