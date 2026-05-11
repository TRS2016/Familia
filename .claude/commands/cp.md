---
description: Pose une question rapide à GitHub Copilot CLI (shell, git, SQL, scripts courts)
---

Délègue à Copilot CLI : $ARGUMENTS

## Quand utiliser cette commande
- Trouver la bonne commande shell/git
- Générer un script utilitaire court (< 30 lignes)
- Écrire une query SQL ad-hoc
- Question ponctuelle sur un outil CLI (Docker, ffmpeg, jq, etc.)

## Quand NE PAS l'utiliser
- Implémentation de code applicatif → utilise `/oc` (OpenCode) ou fais-le toi-même
- Décisions d'architecture → fais-le toi-même
- Tâches > 30 lignes → utilise `/oc`

## Exécution

```bash
copilot -p "$ARGUMENTS"
```

## Après exécution

- Si la réponse fait ≤ 5 lignes : transmets telle quelle à l'utilisateur
- Si elle est plus longue : résume en 1-2 phrases ce qu'elle dit, puis cite uniquement la commande/snippet clé
- Si Copilot propose une commande destructive (`rm -rf`, `DROP TABLE`, force push…), **n'exécute pas** sans valider explicitement avec l'utilisateur
