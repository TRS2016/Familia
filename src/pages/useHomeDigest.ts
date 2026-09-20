import { useMemo, useState, useEffect } from 'react'
import { format, subDays, addDays } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  useChores, useChoreAssignments, useRecentChoreLogs,
  type Chore, type ChoreAssignment,
} from '../features/chores/useChores'
import { useMealPlanWeek, weekStartISO } from '../features/recipes/useMealPlan'
import { useRecipes, mealMeta, type Ingredient, type Recipe } from '../features/recipes/useRecipes'
import { useGroceries, type Grocery } from '../features/groceries/useGroceries'
import { useKakeboCategories, useKakeboEntries, type KakeboCategory, type KakeboEntry } from '../features/kakebo/useKakebo'
import { isSpendType } from '../features/kakebo/kakebo.utils'
import { capitalize } from '../lib/utils'

/* ── Ce que le digest sait dire ─────────────────────────────────────────────
 *
 * Un seul flux, classé par urgence réelle et non par feature d'origine. Les
 * quatre domaines du foyer (tâches, repas, courses, budget) sont déjà reliés
 * en base ; le digest est l'endroit où ces liens deviennent visibles :
 *
 *   - une recette planifiée sous 48h dont les ingrédients manquent en courses ;
 *   - une catégorie de budget qui approche de son enveloppe mensuelle ;
 *   - le dîner du soir non planifié alors que la journée avance.
 */

export type DigestKind =
  | 'chore-overdue'
  | 'chore-today'
  | 'meal-missing'
  | 'ingredients-missing'
  | 'budget-tight'

export type DigestAction =
  | { type: 'chore-done'; assignmentId: string; choreId: string; points: number }
  | { type: 'add-ingredients'; ingredients: Ingredient[] }

export interface DigestItem {
  id: string
  kind: DigestKind
  /** Croissant : 0 est le plus urgent. Trié puis tronqué à MAX_ITEMS. */
  priority: number
  emoji: string
  label: string
  meta: string
  /** Action réalisable sans quitter l'accueil. */
  action?: DigestAction
  /** Lien de repli, et destination de la ligne quand il n'y a pas d'action. */
  to: string
  actionLabel?: string
}

export interface GroceryDial {
  count: number
  total: number
  hasPrices: boolean
  /** Enseigne la plus représentée dans la liste en cours, si elle existe. */
  topStore: string | null
}

export interface BudgetDial {
  income: number
  expenses: number
  left: number
  /** Catégorie la plus proche de son enveloppe (ratio le plus haut). */
  tightest: { name: string; spent: number; budget: number; ratio: number } | null
}

export interface ChoresDial {
  todayTotal: number
  todayDone: number
  overdue: number
}

export interface HomeDigest {
  items: DigestItem[]
  /** Points d'attention réels non affichés, faute de place dans le bandeau. */
  hiddenCount: number
  groceries: GroceryDial
  budget: BudgetDial
  chores: ChoresDial
  isLoading: boolean
}

/** Au-delà, le bandeau cesse d'être un coup d'œil et redevient une liste. */
const MAX_ITEMS = 5

/* Plafond de lignes « tâches » dans le bandeau.
 *
 * Sans lui, six tâches en retard raflent les cinq places et le foyer ne voit
 * jamais qu'une enveloppe est dépassée ou qu'il manque des ingrédients pour le
 * dîner de demain. Le bandeau redeviendrait une liste de tâches, c'est-à-dire
 * l'écran Tâches en moins bien. Les tâches gardent la priorité, mais laissent
 * deux places aux autres domaines. */
const MAX_CHORE_ITEMS = 3

/** Heure à partir de laquelle un dîner non planifié devient un sujet. */
const DINNER_ALERT_HOUR = 16

/** Part de l'enveloppe consommée à partir de laquelle on alerte. */
const BUDGET_TIGHT_RATIO = 0.8

/** Fenêtre de remontée des ingrédients manquants. */
const INGREDIENT_LOOKAHEAD_DAYS = 2

function norm(s: string) {
  return s.trim().toLowerCase()
}

export function useHomeDigest(currentMemberId: string | null): HomeDigest {
  const today = format(new Date(), 'yyyy-MM-dd')
  // L'heure compte : le seuil « dîner non planifié » doit basculer sans qu'on
  // recharge la page. Un tick toutes les 5 min suffit, et sert de dépendance
  // stable au useMemo ci-dessous (qui sinon se réinvaliderait à chaque rendu).
  const [tick, setTick] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [])
  const now = new Date(tick)

  // Toutes ces données sont déjà en cache si la feature correspondante a été
  // visitée : on réutilise les hooks des features plutôt que de redéclarer des
  // requêtes propres à l'accueil.
  const { data: chores = [], isLoading: choresLoading } = useChores()
  const { data: assignments = [] } = useChoreAssignments(format(subDays(now, 14), 'yyyy-MM-dd'), today)
  const { data: logs = [] } = useRecentChoreLogs()
  // Deux semaines : un samedi, l'horizon à 48h tombe sur la semaine suivante,
  // et les ingrédients du lundi passeraient à la trappe.
  const { data: thisWeekMeals = [] } = useMealPlanWeek(weekStartISO(now))
  const { data: nextWeekMeals = [] } = useMealPlanWeek(weekStartISO(addDays(now, 7)))
  const { data: recipes = [] } = useRecipes()
  const { query: groceriesQuery } = useGroceries()
  const { data: categories = [] } = useKakeboCategories()
  const { data: kakeboEntries = [] } = useKakeboEntries(now.getFullYear(), now.getMonth() + 1)

  const groceries = useMemo(() => groceriesQuery.data ?? [], [groceriesQuery.data])
  const mealPlan = useMemo(() => [...thisWeekMeals, ...nextWeekMeals], [thisWeekMeals, nextWeekMeals])

  return useMemo(() => {
    const now = new Date(tick)
    const choreById = new Map(chores.map(c => [c.id, c]))
    const recipeById = new Map(recipes.map(r => [r.id, r]))

    // Une assignation compte comme faite si son statut le dit ou si un log la
    // référence (le log peut précéder la mise à jour du statut).
    const loggedAssignments = new Set(
      logs.map(l => l.assignment_id).filter((id): id is string => !!id),
    )
    const isDone = (a: ChoreAssignment) =>
      a.status === 'done' || loggedAssignments.has(a.id)
    const isOpen = (a: ChoreAssignment) =>
      a.status === 'pending' && !loggedAssignments.has(a.id) && choreById.has(a.chore_id)

    const items: DigestItem[] = []

    // ── 1. Tâches en retard ────────────────────────────────────────────────
    const overdue = assignments
      .filter(a => a.date < today && isOpen(a))
      .sort((a, b) => a.date.localeCompare(b.date))

    for (const a of overdue) {
      const chore = choreById.get(a.chore_id) as Chore
      const lateDays = Math.max(
        1,
        Math.round((new Date(today).getTime() - new Date(a.date).getTime()) / 86_400_000),
      )
      items.push({
        id: `overdue-${a.id}`,
        kind: 'chore-overdue',
        // Même priorité pour toutes : le tri final étant stable, elles
        // conservent l'ordre du plus ancien au plus récent fixé ci-dessus.
        priority: 0,
        emoji: chore.emoji,
        label: chore.name,
        meta: `en retard de ${lateDays} j`,
        to: '/chores',
        actionLabel: 'Fait',
        action: currentMemberId
          ? { type: 'chore-done', assignmentId: a.id, choreId: chore.id, points: chore.points }
          : undefined,
      })
    }

    // ── 2. Tâches du jour encore ouvertes ──────────────────────────────────
    const todayAssignments = assignments.filter(a => a.date === today)
    const todayOpen = todayAssignments.filter(isOpen)

    for (const a of todayOpen) {
      const chore = choreById.get(a.chore_id) as Chore
      items.push({
        id: `today-${a.id}`,
        kind: 'chore-today',
        priority: 1,
        emoji: chore.emoji,
        label: chore.name,
        meta: chore.mental_load ? 'aujourd\'hui · charge mentale' : 'aujourd\'hui',
        to: '/chores',
        actionLabel: 'Fait',
        action: currentMemberId
          ? { type: 'chore-done', assignmentId: a.id, choreId: chore.id, points: chore.points }
          : undefined,
      })
    }

    // ── 3. Dîner du soir non planifié ──────────────────────────────────────
    const dinnerPlanned = mealPlan.some(m => m.date === today && m.meal_type === 'diner')
    if (!dinnerPlanned && now.getHours() >= DINNER_ALERT_HOUR) {
      items.push({
        id: 'meal-dinner',
        kind: 'meal-missing',
        priority: 2,
        emoji: '🍽️',
        label: 'Dîner non planifié',
        meta: `il est ${format(now, 'HH:mm')}`,
        to: '/recipes',
      })
    }

    // ── 4. Ingrédients manquants d'une recette proche ──────────────────────
    // Même logique de rapprochement que useAddRecipeToGroceries : on compare
    // sur le nom normalisé, en ignorant les articles déjà cochés.
    const pending = new Set(
      groceries.filter(g => !g.checked).map(g => norm(g.name)),
    )
    const horizon = format(addDays(now, INGREDIENT_LOOKAHEAD_DAYS), 'yyyy-MM-dd')
    const upcomingMeals = mealPlan
      .filter(m => m.date >= today && m.date <= horizon)
      .sort((a, b) => a.date.localeCompare(b.date))

    for (const meal of upcomingMeals) {
      const recipe = recipeById.get(meal.recipe_id) as Recipe | undefined
      if (!recipe) continue
      const missing = (recipe.ingredients ?? []).filter(
        i => i.name.trim() && !pending.has(norm(i.name)),
      )
      if (missing.length === 0) continue

      const when = meal.date === today
        ? 'ce soir'
        : capitalize(format(new Date(meal.date + 'T12:00'), 'EEEE', { locale: fr }))
      items.push({
        id: `ingredients-${meal.id}`,
        kind: 'ingredients-missing',
        priority: 3,
        emoji: mealMeta(meal.meal_type).emoji,
        label: `${recipe.title} · ${when}`,
        meta: `${missing.length} ingrédient${missing.length > 1 ? 's' : ''} manquant${missing.length > 1 ? 's' : ''}`,
        to: '/recipes',
        actionLabel: 'Aux courses',
        action: { type: 'add-ingredients', ingredients: missing },
      })
    }

    // ── 5. Enveloppe de budget tendue ──────────────────────────────────────
    const spentByCategory = new Map<string, number>()
    for (const e of kakeboEntries as KakeboEntry[]) {
      if (e.member_id !== null) continue // budget du foyer uniquement
      if (!e.category_id || !isSpendType(e.category?.type)) continue
      spentByCategory.set(e.category_id, (spentByCategory.get(e.category_id) ?? 0) + Number(e.amount))
    }

    const budgeted = (categories as KakeboCategory[])
      .filter(c => c.monthly_budget != null && c.monthly_budget > 0 && isSpendType(c.type))
      .map(c => {
        const spent = spentByCategory.get(c.id) ?? 0
        return { cat: c, spent, budget: c.monthly_budget!, ratio: spent / c.monthly_budget! }
      })
      .sort((a, b) => b.ratio - a.ratio)

    const tightest = budgeted[0] ?? null
    if (tightest && tightest.ratio >= BUDGET_TIGHT_RATIO) {
      const left = tightest.budget - tightest.spent
      items.push({
        id: `budget-${tightest.cat.id}`,
        kind: 'budget-tight',
        priority: 4,
        emoji: left < 0 ? '🚨' : '💸',
        label: tightest.cat.name,
        meta: left < 0
          ? `enveloppe dépassée de ${Math.round(-left)} €`
          : `${Math.round(tightest.ratio * 100)} % · ${Math.round(left)} € restants`,
        to: '/kakebo',
      })
    }

    // ── Cadrans ────────────────────────────────────────────────────────────
    const unchecked = groceries.filter((g: Grocery) => !g.checked)
    const storeCounts = new Map<string, number>()
    for (const g of unchecked) {
      if (g.store) storeCounts.set(g.store, (storeCounts.get(g.store) ?? 0) + 1)
    }
    const topStore = [...storeCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

    const income = (kakeboEntries as KakeboEntry[])
      .filter(e => e.member_id === null && e.category?.type === 'income')
      .reduce((s, e) => s + Number(e.amount), 0)
    const expenses = (kakeboEntries as KakeboEntry[])
      .filter(e => e.member_id === null && isSpendType(e.category?.type))
      .reduce((s, e) => s + Number(e.amount), 0)

    // Les tâches sont plafonnées avant la troncature générale pour que les
    // trois autres domaines gardent toujours une place.
    const sorted = items.sort((a, b) => a.priority - b.priority)
    const isChore = (i: DigestItem) =>
      i.kind === 'chore-overdue' || i.kind === 'chore-today'
    const choreItems = sorted.filter(isChore).slice(0, MAX_CHORE_ITEMS)
    const otherItems = sorted.filter(i => !isChore(i))

    const shown = [...choreItems, ...otherItems].slice(0, MAX_ITEMS)

    return {
      items: shown,
      hiddenCount: items.length - shown.length,
      groceries: {
        count: unchecked.length,
        total: unchecked.reduce((s, g) => s + (g.price ?? 0), 0),
        hasPrices: unchecked.some(g => g.price !== null),
        topStore,
      },
      budget: {
        income,
        expenses,
        left: income - expenses,
        tightest: tightest
          ? { name: tightest.cat.name, spent: tightest.spent, budget: tightest.budget, ratio: tightest.ratio }
          : null,
      },
      chores: {
        todayTotal: todayAssignments.filter(a => a.status !== 'skipped').length,
        todayDone: todayAssignments.filter(isDone).length,
        overdue: overdue.length,
      },
      isLoading: choresLoading,
    }
  }, [
    chores, assignments, logs, mealPlan, recipes, groceries,
    categories, kakeboEntries, today, tick, currentMemberId, choresLoading,
  ])
}
