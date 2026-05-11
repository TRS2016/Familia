# Familia — Application familiale

## Contexte
App de gestion familiale pour usage personnel (2-4 membres). Prototype HTML React monolithique existant (`Familia_v6.html`, ~2100 lignes) à migrer vers une vraie app web déployable et partagée entre membres de la famille.

## Stack cible
- **Frontend** : Vite + React + TypeScript
- **Backend** : Supabase (Postgres + Auth magic-link + Realtime + Storage)
- **State serveur** : TanStack Query
- **Déploiement** : Vercel (PWA installable, mode hors-ligne via service worker)
- **Style** : conserver l'esthétique du prototype (Nunito, accent `#E07B54`, fond `#F7F2EA`, mode sombre `#1A1510`)

## Périmètre V1 (à livrer en priorité)
**Liste de courses partagée** + **calendrier partagé** uniquement. Les autres écrans (Kakebo, Habitudes, Média) restent en attente tant que la V1 n'est pas utilisée en condition réelle par la famille pendant 2-3 semaines.

## Foyer unique
Pas de multi-foyer. Un seul `household_id` hardcodé. Auth = magic-link email uniquement, pas d'OAuth ni de mots de passe.

---

## Règles de délégation aux autres agents

Pour optimiser les coûts en tokens Claude, certaines tâches sont déléguées à des CLI externes via l'outil Bash. **Tu (Claude) restes l'orchestrateur ; tu ne fais jamais tourner opencode/copilot en pensant qu'ils sont toi.**

### Délègue à OpenCode (`opencode run "..."`) pour :
- Scaffolding initial (création de projets Vite, init de fichiers de config)
- Boilerplate répétitif (composants UI simples, types TS depuis un schéma SQL)
- Édits mécaniques sur plusieurs fichiers similaires (renommages, refactor d'imports)
- Génération de fixtures, seeds, mocks
- Tâches bien spécifiées avec critère de succès vérifiable

### Délègue à GitHub Copilot CLI (`copilot --allow-all-tools -p "..."`) pour :
- Commandes shell, git, devops
- Queries SQL ad-hoc
- Scripts utilitaires courts (< 30 lignes)
- Questions ponctuelles sur des outils CLI

### Garde pour toi (Claude) :
- Architecture, schéma de base de données, choix techniques
- Logique métier non-triviale (sync temps réel, optimistic updates, résolution de conflits)
- Debugging d'erreurs complexes ou inter-couches
- **Revue du code produit par les autres agents** (ne saute jamais cette étape)
- Tout ce qui touche à l'UX fine ou aux animations
- Migration du HTML existant (les composants ont des subtilités à préserver)

### Workflow de délégation type
1. Vérifie que la tâche est suffisamment scoped (sinon, découpe-la d'abord toi-même)
2. Formule un prompt auto-suffisant pour l'agent :
   - Chemins absolus des fichiers à créer/modifier
   - Contraintes techniques (stack, conventions du projet, version des libs)
   - Format de sortie attendu
   - Liste explicite des fichiers à **NE PAS** toucher
3. Exécute `opencode run "..."` ou `copilot --allow-all-tools -p "..."` via Bash
4. Lis (Read) uniquement les 2-3 fichiers-clés produits, pas tout le diff
5. Valide la cohérence avec le reste du projet
6. Corrige toi-même les détails plutôt que de redéléguer un fix mineur

### Seuil de rentabilité
**Ne délègue pas une tâche < 50 lignes de code à produire.** En dessous, l'overhead d'orchestration (formuler le prompt + lire le retour + valider) coûte plus en tokens que ce que ça économise. Fais-le directement.

### Pièges connus
- **OpenCode non-interactif** peut hanger sur des prompts de permission. Utiliser uniquement avec un agent `autoaccept` préconfiguré (voir `SETUP.md`).
- **Modèle local 8B** = OK pour du scaffolding pur, médiocre pour de la vraie logique React. Privilégier un modèle OpenRouter gratuit (Gemini Flash, DeepSeek) configuré dans OpenCode.
- **Copilot premium requests** sont quotaées mensuellement, ne pas le cramer sur des broutilles.

---

## Conventions de code
- TypeScript strict (`"strict": true` dans `tsconfig.json`)
- Composants fonctionnels + hooks uniquement
- Pas de styled-components ni de CSS-in-JS lourd ; CSS Modules ou Tailwind
- Une feature = un dossier : `src/features/groceries/`, `src/features/calendar/`
- Hooks de données dans `src/features/<f>/hooks/use<X>.ts`
- État serveur = Supabase + TanStack Query (pas de Redux, pas de Zustand pour V1)
- Composants UI réutilisables dans `src/components/ui/`

## Hors scope V1 (ne pas faire spontanément)
- Tests automatisés (overkill pour usage perso V1, on en ajoutera si la base de code grossit)
- CI/CD complexe (Vercel suffit, déploiement auto sur push main)
- React Native / app stores
- i18n
- Mode hors-ligne complet (cache TanStack Query suffit pour V1)
