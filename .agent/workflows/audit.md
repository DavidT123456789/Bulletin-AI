---
description: Audit proactif du code pour détecter et corriger les patterns problématiques récurrents
---

# 🔍 Audit Proactif de Qualité

Ce workflow doit être exécuté régulièrement (après ajout de fonctionnalité, avant commit majeur) pour prévenir les bugs récurrents.

## 1. Audit Data Freshness (Données Stale)

Rechercher tous les `openModal` et vérifier qu'un refresh est appelé :

```bash
# Lister tous les appels openModal
grep -rn "openModal" app/src --include="*.js" | grep -v test
```

**Checklist :**

- [ ] Chaque `openModal` appelle une fonction de refresh/init des données
- [ ] Chaque panneau/modal a un listener sur les événements globaux (`periodChanged`, `classChanged`, etc.)
- [ ] Les selects/dropdowns sont re-populés à l'ouverture, pas seulement au mount

---

## 2. Audit Sync État ↔ UI

Rechercher les états globaux et vérifier leur propagation :

```bash
# Lister les changements d'état global
grep -rn "appState\." app/src --include="*.js" | grep "=" | head -50
```

**Checklist :**

- [ ] Chaque modification de `appState.currentPeriod` dispatch un événement
- [ ] Chaque modification de `appState.currentClassId` dispatch un événement
- [ ] Les composants ouverts écoutent ces événements et se rafraîchissent

---

## 3. Audit Listeners Orphelins

Vérifier que les listeners sont attachés au bon moment :

```bash
# Listeners sur éléments dynamiques
grep -rn "addEventListener" app/src --include="*.js" | grep -v test
```

**Checklist :**

- [ ] Pas de listener sur élément qui sera recréé (utiliser event delegation)
- [ ] Listeners dans `setup()` appelés après création du DOM
- [ ] Utilisation de `{ once: true }` quand approprié

---

## 4. Audit Cohérence Période

Vérifier que `currentPeriod` est utilisé partout de manière cohérente :

```bash
# Vérifier les hardcoded periods
grep -rn "'T1'\|'T2'\|'T3'\|'S1'\|'S2'" app/src --include="*.js" | grep -v "test\|config\|default"
```

**Checklist :**

- [ ] Pas de période hardcodée dans la logique métier
- [ ] Toujours utiliser `appState.currentPeriod` ou le passer en paramètre
- [ ] Les données de démo sont synchronisées avec la période sélectionnée

---

## 5. Audit Prompts IA

Vérifier la cohérence des prompts générés :

```bash
# Analyser PromptService
cat app/src/services/PromptService.js | head -150
```

**Checklist :**

- [ ] Données incluses cohérentes avec la période actuelle
- [ ] Pas de données futures (évolution T1→T2 quand on génère pour T1)
- [ ] Format clair pour l'IA (guillemets pour citations, crochets pour instructions)

---

## 6. Actions Correctives Standards

### Pour Data Freshness

```javascript
// À l'ouverture d'un modal
UI.openModal(modal);
ManagerX.refreshData(); // TOUJOURS appeler après openModal
```

### Pour Sync État

```javascript
// Dans le setter d'état global
appState.currentPeriod = value;
document.dispatchEvent(new CustomEvent('periodChanged', { detail: { period: value } }));
```

### Pour Listeners

```javascript
// Event delegation au lieu de listener direct
container.addEventListener('click', (e) => {
    if (e.target.matches('.dynamic-button')) {
        // handle
    }
});
```

---

## 7. Exécution Rapide

// turbo-all

```bash
# Scan rapide des patterns problématiques
grep -rn "openModal" app/src/managers --include="*.js" | grep -v "test\|refresh\|init\|update" | head -20
```

Si des résultats apparaissent, vérifier manuellement que chaque ouverture de modal a bien un refresh associé.

---

## 📋 Résumé des Événements Globaux

| Événement | Quand dispatché | Qui doit écouter |
|-----------|-----------------|------------------|
| `periodChanged` | `UI.setPeriod()` | Modals ouverts, Focus Panel |
| `classChanged` | Changement de classe | Tous les composants affichant des données classe |
| `studentDataChanged` | Modification élève | Liste, Focus Panel, Modals |
| `settingsChanged` | Sauvegarde paramètres | Composants utilisant iaConfig |
