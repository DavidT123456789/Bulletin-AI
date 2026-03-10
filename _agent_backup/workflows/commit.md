---
description: Génère un commit intelligent et pousse les changements en une seule étape validée.
---

# Workflow: Fast Commit & Push

Ce workflow groupe toutes les étapes d'analyse en mode "turbo" (sans validation) et combine toutes les actions d'écriture (add, commit, push) en une seule commande finale pour minimiser les clics.

## 1. Analyse Silencieuse (Turbo)

// turbo
Récupère le statut et les fichiers modifiés pour préparer le message.

```bash
git status
git diff --stat
```

## 2. Génération du Message

Analyse les changements et propose un message de commit suivant la convention :
`<type>(<scope>): <description>`

Types : `feat`, `fix`, `style`, `refactor`, `docs`, `chore`.

## 3. Exécution Unique (One-Click)

Combine l'ajout, le commit et le push en une seule commande pour ne demander qu'une seule validation à l'utilisateur.

Le message de commit DOIT être une simple chaîne sans retours à la ligne complexes pour éviter les erreurs de syntaxe dans la commande combinée.

```bash
git add -A; git commit -m "<TITRE DU COMMIT>" -m "<DESCRIPTION DETAILLEE>"; git push
```

## 4. Confirmation

Confirme simplement que tout est à jour.
