# SETUP — Configuration Claude Code + OpenCode + Copilot pour Familia

## Structure à mettre en place

À la racine de ton projet Familia (une fois créé) :

```
familia/
├── CLAUDE.md                          ← contexte projet + règles de délégation
├── .claude/
│   ├── commands/
│   │   ├── oc.md                      ← slash command : /oc <tâche>
│   │   └── cp.md                      ← slash command : /cp <question>
│   └── agents/
│       └── cheap-worker.md            ← subagent auto-délégateur (model: haiku)
└── (le reste du projet : src/, package.json, etc.)
```

Copie les 4 fichiers tels qu'ils sont, en respectant les chemins exacts.

## Trois mécanismes complémentaires installés

| Mécanisme | Fichier | Déclenchement | Coût Claude |
|---|---|---|---|
| **Règles globales** | `CLAUDE.md` | Lu à chaque session, Claude décide quand déléguer | Tokens Opus/Sonnet (toi) |
| **Slash command `/oc`** | `.claude/commands/oc.md` | Tu tapes `/oc <tâche>` manuellement | Tokens du modèle actif |
| **Slash command `/cp`** | `.claude/commands/cp.md` | Tu tapes `/cp <question>` manuellement | Tokens du modèle actif |
| **Subagent `cheap-worker`** | `.claude/agents/cheap-worker.md` | Claude délègue automatiquement | Tokens **Haiku** (~10× moins cher) |

Les trois cohabitent sans conflit. Le subagent est le plus économique parce qu'il utilise Haiku pour l'orchestration, et opencode (gratuit) pour l'exécution.

---

## ⚠️ Configuration OpenCode à faire AVANT utilisation

OpenCode en mode non-interactif a un bug connu : il hang sur les prompts de permission. Il faut configurer un agent "autoaccept" dédié.

### 1. Créer un agent autoaccept

Crée le fichier `~/.config/opencode/agents/autoaccept.md` :

```markdown
---
description: Agent non-interactif qui accepte toutes les permissions pour exécution scriptée depuis Claude Code
mode: subagent
permissions:
  write: allow
  read: allow
  bash: allow
  webfetch: ask
---

Tu es un exécutant non-interactif. Tu reçois une spécification précise et tu la réalises sans poser de questions.

Règles :
- Ne demande jamais de clarification : si la spec est ambiguë, fais le choix le plus sensé et documente-le en commentaire dans le code.
- Ne touche aucun fichier hors de ceux mentionnés dans la spec.
- Termine ton tour dès que les critères de succès sont atteints.
```

### 2. Configurer le modèle utilisé

Choisis ton modèle dans `~/.config/opencode/opencode.json` ou via `opencode auth login`. Recommandations par ordre de préférence pour usage avec ce setup :

1. **OpenRouter Gemini 2.5 Flash gratuit** (`google/gemini-2.5-flash-lite` via OpenRouter) — meilleur rapport qualité/gratuité
2. **OpenRouter DeepSeek V3 gratuit** — solide en code
3. **Ollama Qwen2.5-Coder 7B local** — totalement offline mais qualité variable
4. **Ollama Llama 3.1 8B local** — fallback ultime, OK pour scaffolding pur

### 3. Tester en ligne de commande

Avant d'essayer depuis Claude Code, valide qu'opencode marche en standalone :

```bash
cd /tmp && mkdir test-oc && cd test-oc
opencode run --agent autoaccept "Crée un fichier hello.ts qui exporte une fonction greet(name: string) retournant 'Hello, <name>!'"
cat hello.ts
```

Si ça crée le fichier sans hanger, tout est bon.

---

## Configuration GitHub Copilot CLI

Beaucoup plus simple. Une fois `gh` installé et toi authentifié :

```bash
gh extension install github/gh-copilot   # si pas déjà fait
# ou la nouvelle CLI standalone :
npm install -g @githubnext/github-copilot-cli
```

Puis teste :
```bash
copilot -p "How do I list all files larger than 100MB in a git repo?"
```

---

## Tester le setup complet

Une fois le projet Familia créé et les 4 fichiers en place, lance Claude Code dans le dossier :

```bash
cd familia && claude
```

Demande ensuite quelque chose qui déclenche naturellement la délégation, par exemple :

> Crée les types TypeScript pour le schéma Supabase suivant : table `groceries` (id uuid, name text, price numeric, checked boolean, household_id uuid, created_at timestamptz, created_by uuid), table `events` (id uuid, title text, date date, time time, member_id uuid, location text, household_id uuid). Génère aussi 10 fixtures de chaque pour les seeds.

Claude devrait normalement détecter que c'est un cas typique de délégation (boilerplate volumineux, bien spécifié) et invoquer `cheap-worker` automatiquement. Tu verras quelque chose comme `> Using cheap-worker subagent` dans le terminal.

S'il ne le fait pas spontanément, tu peux le forcer :

> Use the cheap-worker subagent to generate the TypeScript types and fixtures for the groceries and events tables.

---

## Vérifier que ça économise vraiment des tokens

Lance `/cost` dans Claude Code à intervalles réguliers pour comparer ta consommation Claude avec et sans délégation activée. Tu devrais voir une baisse significative sur les sessions impliquant beaucoup de scaffolding et de boilerplate. Sur les sessions de pure réflexion architecturale, l'économie sera nulle (ce qui est normal).

---

## Quand désactiver / contourner

- **Tâche urgente, pas le temps de tester la délégation** : ignore les rules, demande directement à Claude. CLAUDE.md ne te force la main, il guide.
- **OpenCode hang malgré la config autoaccept** : `Ctrl+C`, dis-le moi dans la conversation, on désactivera temporairement la délégation OpenCode et on gardera juste Copilot.
- **Tu veux faire 100% en Claude sur une session** : ouvre Claude Code avec `claude --no-config` ou supprime temporairement `.claude/agents/cheap-worker.md`.
