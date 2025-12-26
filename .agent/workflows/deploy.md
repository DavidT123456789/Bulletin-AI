---
description: Guide pour déployer sur GitHub Pages
---
# Workflow: Deploy

Guide pas-à-pas pour déployer l'application sur GitHub Pages.

## Pré-requis
- Toutes les modifications commitées localement
- Build vérifié avec `/check`

## Étapes

### 1. Backup préventif
Lancer `/backup` pour sauvegarder la version actuelle.

### 2. Commit dans GitHub Desktop
1. Ouvrir GitHub Desktop
2. Vérifier les fichiers modifiés
3. Écrire un message de commit descriptif
4. Cliquer "Commit to main"

### 3. Push vers GitHub
Cliquer "Push origin" dans GitHub Desktop.

### 4. Vérifier le déploiement
1. Aller sur GitHub.com > Actions
2. Attendre que le workflow "Deploy" soit complété (✓ vert)
3. Vérifier le site : https://davidt123456789.github.io/Bulletin-AI/

### 5. Confirmation
Tester la version en ligne pour confirmer que tout fonctionne.
