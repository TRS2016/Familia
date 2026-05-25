# Familia

Application de gestion familiale partagée (courses, calendrier, budget, habitudes, médias) pour 2 à 4 membres d'un même foyer.

## Stack

- **Vite 8** + **React 19** + **TypeScript strict**
- **Supabase** : Postgres, Auth magic-link, Realtime, Storage
- **TanStack Query v5** : état serveur et cache
- **React Router v7**
- **CSS Modules** (pas de Tailwind ni de CSS-in-JS)
- **Vercel** : déploiement et hébergement
- **PWA** : vite-plugin-pwa, installable sur mobile et desktop

## Features

- Auth par magic-link email (pas de mot de passe)
- Liste de courses partagée avec sync temps réel, drag & drop, mode shopping, listes sauvegardées, catalogue personnel
- Calendrier partagé : récurrence, 4 vues (mois / semaine / jour / agenda), export iCal
- Budget Kakebo : entrées/dépenses par catégorie, bilan mensuel, export CSV
- Suivi d'habitudes : progression sur 4 semaines, streak
- Suivi de médias : films, séries, livres, jeux — notation, statut, tri configurable
- PWA installable (manifest + service worker, mise à jour à la demande)

## Architecture

```
src/
├── lib/           # Supabase client, config (HOUSEHOLD_ID), types générés, hooks utilitaires
├── auth/          # AuthProvider, RequireAuth, RequireMember, LoginPage, AuthCallback
├── pages/         # Pages transversales : HomePage, OnboardingPage, SettingsPage
├── features/
│   ├── groceries/ # Liste de courses + listes sauvegardées + catalogue
│   ├── calendar/  # Calendrier partagé
│   ├── kakebo/    # Budget
│   ├── habits/    # Habitudes
│   └── media/     # Médias
└── components/    # UI réutilisable : Modal, Toast, UpdatePrompt, Spinner, EmptyState…
```

Chaque dossier `features/*` contient ses propres composants, hooks de données et CSS Modules. Les hooks qui touchent Supabase vivent dans `use<X>.ts` à côté des composants qui les consomment.

## Setup local

1. `npm install`
2. Copier `.env.example` en `.env.local` et renseigner les trois variables :
   ```
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=<anon-key>
   VITE_HOUSEHOLD_ID=<uuid-du-foyer>
   ```
3. `npm run dev`

Le foyer (`household`) doit exister dans Supabase et au moins un `member` doit y être associé. Sans ça, l'app renvoie vers l'onboarding.

## Scripts disponibles

| Commande | Usage |
|---|---|
| `npm run dev` | Serveur de développement |
| `npm run build` | Build de production (TypeScript + Vite) |
| `npm run preview` | Prévisualisation du build prod — utile pour tester la PWA |
| `npx supabase gen types typescript --project-id <id> --schema public > src/lib/database.types.ts` | Régénérer les types depuis le schéma Supabase |

## Déploiement

Déploiement automatique sur Vercel à chaque push sur `master`. Les trois variables d'environnement (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_HOUSEHOLD_ID`) sont configurées dans les settings du projet Vercel.

## Base de données

Tables principales : `households`, `members`, `groceries`, `grocery_lists`, `grocery_list_items`, `grocery_catalog`, `events`, `habits`, `habit_logs`, `kakebo_entries`, `kakebo_categories`, `monthly_budget`, `media_items`.

RLS (Row Level Security) activée sur toutes les tables — les politiques filtrent par `household_id`. Realtime activé sur `groceries` et `events` pour la synchronisation entre membres.

Le schéma complet est consultable dans le dashboard Supabase (Table Editor ou SQL Editor).

## Multi-foyer

Non. L'app gère un seul foyer, identifié par `VITE_HOUSEHOLD_ID`. Décision intentionnelle pour un usage perso : pas d'UI de sélection de foyer, pas de logique multi-tenant. Si le besoin évolue, ce sera une refonte, pas un ajout.

## Documentation interne

- **`CLAUDE.md`** — contexte projet, stack cible, règles de délégation aux sous-agents IA (OpenCode, Copilot)
- **`SETUP.md`** — configuration de l'environnement de dev Claude Code + OpenCode + Copilot CLI
- **`STATE.md`** — snapshot d'avancement généré à la demande, non versionné (dans `.gitignore`)

## Licence

Projet personnel, non distribué. Pas de licence formelle.
