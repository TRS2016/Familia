---
description: Délègue une tâche d'implémentation à OpenCode (modèles gratuits) pour économiser des tokens Claude
---

Délègue cette tâche à OpenCode via le mode non-interactif.

**Tâche à déléguer** : $ARGUMENTS

## Avant d'exécuter

1. **Évalue la taille** : la tâche doit produire ≥ 50 lignes de code. Sinon, fais-la toi-même directement.

2. **Reformule** la tâche en un prompt auto-suffisant qui inclut :
   - Les chemins absolus de fichiers à créer/modifier
   - La stack et les conventions du projet (TypeScript strict, React fonctionnel, etc.)
   - Le format de sortie attendu
   - La liste explicite des fichiers à **NE PAS** toucher
   - Un critère de succès vérifiable (ex: "le fichier doit exporter un composant `GroceryList` par défaut")

## Exécution

```bash
opencode run "<ton prompt reformulé en une seule ligne>"
```

Si le prompt est long, utilise un heredoc :

```bash
opencode run "$(cat <<'EOF'
<prompt multiligne ici>
EOF
)"
```

## Après exécution

1. Lis (Read) **au maximum 3 fichiers** principaux parmi ceux produits
2. Vérifie : existence, non-vide, conformité aux conventions du projet
3. Résume au format suivant (3 puces max) :
   - **Créé/modifié** : liste des chemins
   - **Statut** : ✅ OK / ⚠️ avec réserves / ❌ échec
   - **Prochaine étape** : ce que je dois faire maintenant
