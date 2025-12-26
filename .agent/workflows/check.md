---
description: Vérifie que l'application fonctionne correctement (build + dev server)
---
# Workflow: Check

Vérifie que l'application compile et fonctionne correctement.

## Étapes

### 1. Vérifier le build de production
// turbo
```bash
cd app && npm run build
```

Si le build échoue, analyser l'erreur et la corriger.

### 2. Lancer le serveur de développement
// turbo
```bash
cd app && npm run dev
```

### 3. Vérifier visuellement
Ouvrir http://localhost:4000 et vérifier :
- La landing page charge correctement
- L'application (app.html) fonctionne
- Pas d'erreurs dans la console navigateur

### 4. Rapport
Confirmer que tout fonctionne ou lister les problèmes à corriger.
