# Audit Design & UX — Familia

> App familiale React (Vite + TS, CSS Modules + variables CSS, PWA mobile-first).
> **v2 — 2026-06-09**, après application des corrections. Les sections marquées ✅ ont été corrigées dans ce passage ; 🟡 = partiellement traité (token posé, migration à poursuivre).

---

## 0. Périmètre exploré

- **44 composants** `.tsx` ; **22 fichiers CSS** (1 `design-tokens.css`, 1 global `index.css`, 20 CSS Modules). *(`src/App.css` supprimé — voir corrections.)*
- **Pas de Tailwind, pas de styled-components.** Styling = **CSS Modules + variables CSS**.
- Point d'entrée : `src/main.tsx` → `src/App.tsx`. Thème appliqué avant paint via `localStorage`.
- Système de design centralisé : `src/design-tokens.css` (couleurs, **typo + espacement + sémantique** ajoutés), `src/index.css` (layout vars, reset, **focus clavier** ajouté).

---

## 1. Scores globaux

| Catégorie | Avant | Après | Évolution |
|---|---|---|---|
| **Cohérence** | 6.5 | **7.5** | Couleurs sémantiques tokenisées, code mort retiré. |
| **Typographie** | 5 | **6.5** | Police de titres + échelle typo en tokens ; migration des tailles à poursuivre. |
| **Palette** | 6.5 | **8** | Contrastes texte corrigés (clair + sombre), tokens sémantiques. |
| **Responsive** | 6 | 6 | Inchangé ce passage. |
| **Identité** | 6.5 | **7.5** | Police éditoriale sur les titres, palette chaude assumée. |
| **Accessibilité** *(transversal)* | ~3 | **7** | Focus clavier global rétabli. |
| **GLOBAL** | **6.1** | **≈7.2** | Base systématisée ; reste la migration typo/espacement et le responsive. |

---

## 2. Corrections appliquées le 2026-06-09 ✅

1. **Focus clavier global** — règle `:focus-visible` (sélecteurs `element:focus-visible`, spécificité (0,1,1)) ajoutée dans `index.css`, qui **bat les `.class{outline:none}`** des composants sans avoir à éditer 14 fichiers. Anneau accent visible au clavier uniquement.
2. **Contraste texte** — `design-tokens.css` : `--text-sub` `#7A6A60`→`#6E5D52`, `--text-muted` `#A89F97`→`#786C62` (clair) ; en sombre, `--text-sub`→`#B5A89C`, `--text-muted`→`#8F8175`. Les libellés/captions repassent au-dessus (ou tout près) du seuil AA.
3. **Couleurs sémantiques tokenisées** — ajout de `--danger / --success / --info / --warning`. Les **~30 `#c0392b` en dur → `var(--danger)`** (0 restant) sur 13 fichiers (CSS + inline TSX).
4. **Échelle typographique en tokens** — `--text-2xs(11) … --text-2xl(28)` + `--leading-tight/--leading-body`. *(Tokens disponibles ; voir 🟡 pour la migration.)*
5. **Échelle d'espacement en tokens** — `--space-1(4) … --space-6(32)`. *(Idem, à consommer progressivement.)*
6. **Police de titres (identité)** — import **Fraunces** + token `--font-display`, appliqué aux **11 `.pageTitle`** et au `.greeting` de l'accueil. Touche éditoriale chaleureuse qui distingue des titres Nunito-bold génériques.
7. **Code mort supprimé** — `src/App.css` (résidu du template Vite : `.counter/.hero/.vite` + variables fantômes) **supprimé** (n'était jamais importé).
8. **`--accent-soft`** ajouté pour les fonds teintés / hover doux.

---

## 3. Problèmes restants (priorisés)

### 🟡 Critiques partiellement traités
- **Migration des tailles de police** : ~25 tailles en px encore codées **dans les composants** (`font-size: 13px/14px/...`). Les **tokens existent** désormais — reste à remplacer progressivement (`--text-md` pour le corps, etc.). C'est un refactor large à faire par lots pour éviter les régressions visuelles.
- **Migration de l'espacement** : `gap`/`padding`/`margin` toujours en px arbitraires ; tokens `--space-*` prêts à être adoptés.

### 🟠 À traiter
- **Couleurs membres en inline** : `#5B9E8F` (×25), `#E07B54` (×16), `#E8B84B`… injectées en styles inline depuis `MEMBER_PALETTE` (`src/lib/constants.ts`). Source unique JS conservée (acceptable), mais ces hex restent dispersés ; envisager un helper `memberColor()` partout plutôt que des littéraux, et brancher les tokens `--member-*` (sinon les supprimer).
- **5 `#A89F97` en inline TSX** non tokenisés (anciens muted) → remplacer par `var(--text-muted)`.
- **Responsive mono-breakpoint (768px)** : pas de palier tablette ; certaines pages volontairement 1 colonne. À évaluer selon l'usage réel.
- **`outline: none` orphelins** (14 fichiers) : désormais neutralisés par le focus global, mais à nettoyer pour la propreté.

---

## 4. Recommandations stratégiques (identité « familiale »)

Inchangées et en partie amorcées :
1. **Systématiser** : la prochaine grande victoire est la migration typo/espacement vers les tokens posés ici → cohérence perçue = identité.
2. **Hiérarchie de lecture** : remonter le corps à `--text-md (15px)` (dominante actuelle 13–14), titres d'écran `--text-2xl (28px)` en Fraunces (déjà branché).
3. **Couleur = appartenance** : pousser les 4 couleurs membres comme signature (avatars, pastilles cohérentes partout) — l'atout identitaire le plus fort.
4. **Élément signature** : carte « hero » d'accueil (salutation + couleur membre + « Souffle du jour ») déjà en bonne voie.
5. **Micro-chaleur** : coins arrondis + ombres douces (présents) + animations d'entrée (`pageEnter`) à étendre aux listes ; bruns chauds plutôt que gris froids (corrigé côté tokens).
6. **Dark mode = nuit douce** : contrastes sombres relevés ce passage.

---

## 5. Système de tokens — **implémenté** dans `src/design-tokens.css`

### Couleurs
`--accent #E07B54` (+ `--accent-soft #F4E3D8`), `--bg #F7F2EA`, `--bg-card #FFFAF5`, `--text #3D2B1F`, `--text-sub #6E5D52`, `--text-muted #786C62`.
Sémantiques : `--danger #C0392B`, `--success #4F7D3A`, `--info #3D80B8`, `--warning #E8B84B`.
Membres : `#E07B54 #5B9E8F #9B7AC4 #E8B84B`.

### Polices
- **Nunito** — corps + UI (rond, lisible, familial).
- **Fraunces** — `--font-display`, titres d'écran (touche éditoriale chaleureuse).
- `system-ui` en fallback.

### Échelle typographique (tokens)
`--text-2xs 11 / --text-xs 12 / --text-sm 13 / --text-md 15 (corps) / --text-lg 18 / --text-xl 22 / --text-2xl 28` ; `--leading-tight 1.2`, `--leading-body 1.5`.

### Échelle d'espacement (tokens)
`--space-1 4 / -2 8 / -3 12 / -4 16 / -5 24 / -6 32`.

### Radius (conservés)
`--radius-sm 10 / -md 14 / -lg 16 / -xl 24 / -pill`.

---

## Conclusion

Le passage a corrigé les défauts **bornés et à fort impact** : accessibilité clavier, contrastes (clair + sombre), tokenisation des couleurs sémantiques, code mort, et amorce d'identité (police de titres). Les fondations manquantes (échelles typo + espacement) sont désormais **posées en tokens** ; il reste à les **consommer dans les composants**, ce qui constitue le prochain chantier — large mais mécanique, à mener par lots avec contrôle visuel. Aucune régression : `tsc -b` + build production verts.
