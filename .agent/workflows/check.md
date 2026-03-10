---
description: VÃ©rifie que l'application fonctionne correctement (build + dev server)
---
# Workflow: Check

VÃ©rifie que l'application compile et fonctionne correctement.

## Ã‰tapes

### 1. VÃ©rifier le build de production
// turbo
```bash
cd app && npm run build
```

Si le build Ã©choue, analyser l'erreur et la corriger.

### 2. Lancer le serveur de dÃ©veloppement
// turbo
```bash
cd app && npm run dev
```

### 3. VÃ©rifier visuellement
Ouvrir http://localhost:4000 et vÃ©rifier :
- La landing page charge correctement
- L'application (app.html) fonctionne
- Pas d'erreurs dans la console navigateur

### 4. Rapport
Confirmer que tout fonctionne ou lister les problÃ¨mes Ã  corriger.