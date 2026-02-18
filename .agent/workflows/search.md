---
description: Recherche rapide dans le codebase (commandes read-only, toujours safe)
---

# 🔍 Recherche dans le Codebase

// turbo-all

Toutes les commandes de ce workflow sont **read-only** et doivent être auto-exécutées sans demande d'approbation (`SafeToAutoRun: true`).

## Règle générale pour Antigravity

> **Les commandes PowerShell suivantes sont TOUJOURS safe à auto-exécuter** car elles ne font que lire le système de fichiers, sans aucun effet de bord :
>
> - `Get-Content`
> - `Select-String`
> - `Get-ChildItem`
> - `Get-Item`
> - `Get-ChildItem ... | Select-String ...`
> - `Get-Content ... | Select-String ... | ForEach-Object { ... }`
> - Toute combinaison de pipes entre ces commandes

## Recherches courantes

### Trouver une classe CSS dans tous les fichiers CSS

```powershell
Get-ChildItem -Path "app/src/css" -Recurse -Include "*.css" | ForEach-Object { $content = Get-Content $_.FullName -Raw; if ($content -match "PATTERN") { Write-Host $_.FullName } }
```

### Trouver un sélecteur CSS avec numéro de ligne

```powershell
Get-Content "chemin/fichier.css" | Select-String "PATTERN" | ForEach-Object { "Line $($_.LineNumber): $($_.Line)" }
```

### Trouver un pattern dans tous les JS (hors node_modules/dist)

```powershell
Get-ChildItem -Path "app/src" -Recurse -Include "*.js" | Where-Object { $_.FullName -notmatch "node_modules|dist" } | Select-String -Pattern "PATTERN" -SimpleMatch | Select-Object Filename, LineNumber, Line
```

### Trouver dans quel fichier un ID HTML est défini

```powershell
Get-ChildItem -Path "app" -Recurse -Include "*.js","*.html" -Exclude "node_modules","dist" | Where-Object { $_.FullName -notmatch "node_modules|dist" } | Select-String -Pattern "ID_NAME" -SimpleMatch | Select-Object -First 10
```
