---
description: Audit proactif du code pour dÃ©tecter et corriger les patterns problÃ©matiques rÃ©currents
---

# Audit Proactif du Code

// turbo-all

## Scan automatique

1. Scan `console.log` actifs (hors version banner) :

```powershell
Select-String -Path "src/**/*.js" -Pattern "console\.log" -Recurse | Where-Object { $_ -notmatch "//\s*console" }
```

1. Scan TODO/FIXME/HACK :

```powershell
Select-String -Path "src/**/*.js" -Pattern "TODO|FIXME|HACK" -Recurse
```

1. Scan `debugger` :

```powershell
Select-String -Path "src/**/*.js" -Pattern "debugger" -Recurse
```

1. Scan code commentÃ© (lignes `// code`) :

```powershell
Select-String -Path "src/**/*.js" -Pattern "^\s*//\s*(console|return|if|const|let|this|DOM)" -Recurse
```

1. Scan `var` declarations :

```powershell
Select-String -Path "src/**/*.js" -Pattern "^\s*var\s+" -Recurse
```

1. Scan empty catch blocks :

```powershell
Select-String -Path "src/**/*.js" -Pattern "catch\s*\(\s*\w*\s*\)\s*\{\s*\}" -Recurse
```

1. Scan hardcoded hex colors in CSS (outside variables.css) :

```powershell
Get-ChildItem -Recurse -Filter "*.css" -Path "src/css" -Exclude "variables.css" | Select-String -Pattern "#[0-9a-fA-F]{3,8}[;\s]"
```

1. Scan deprecated markers :

```powershell
Select-String -Path "src/**/*.js" -Pattern "deprecated" -CaseSensitive:$false -Recurse
```

1. Top 15 largest JS files :

```powershell
Get-ChildItem -Recurse -Filter "*.js" -Path "src" | Select-Object @{Name="Lines";Expression={(Get-Content $_.FullName | Measure-Object -Line).Lines}}, Name | Sort-Object Lines -Descending | Select-Object -First 15
```

1. Top 15 largest CSS files :

```powershell
Get-ChildItem -Recurse -Filter "*.css" -Path "src/css" | Select-Object @{Name="Lines";Expression={(Get-Content $_.FullName | Measure-Object -Line).Lines}}, Name | Sort-Object Lines -Descending | Select-Object -First 15
```

## Rapport

Compiler les rÃ©sultats dans un walkthrough.md avec :

- Score global (A/B/C/D)
- Tableau des points forts (âœ…)
- Tableau des points d'attention (âš ï¸) avec fichiers et lignes
- RÃ©sumÃ© actionnable