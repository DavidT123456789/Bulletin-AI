---
description: GÃ©nÃ¨re un commit intelligent et pousse les changements en une seule Ã©tape validÃ©e.
---

# Workflow: Fast Commit & Push

Ce workflow groupe toutes les Ã©tapes d'analyse en mode "turbo" (sans validation) et combine toutes les actions d'Ã©criture (add, commit, push) en une seule commande finale pour minimiser les clics.

## 1. Analyse Silencieuse (Turbo)

// turbo
RÃ©cupÃ¨re le statut et les fichiers modifiÃ©s pour prÃ©parer le message.

```bash
git status
git diff --stat
```

## 2. GÃ©nÃ©ration du Message

Analyse les changements et propose un message de commit suivant la convention :
`<type>(<scope>): <description>`

Types : `feat`, `fix`, `style`, `refactor`, `docs`, `chore`.

## 3. ExÃ©cution Unique (One-Click)

Combine l'ajout, le commit et le push en une seule commande pour ne demander qu'une seule validation Ã  l'utilisateur.

Le message de commit DOIT Ãªtre une simple chaÃ®ne sans retours Ã  la ligne complexes pour Ã©viter les erreurs de syntaxe dans la commande combinÃ©e.

```bash
git add -A; git commit -m "<TITRE DU COMMIT>" -m "<DESCRIPTION DETAILLEE>"; git push
```

## 4. Confirmation

Confirme simplement que tout est Ã  jour.