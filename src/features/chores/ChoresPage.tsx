import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { format, addDays, startOfWeek, subDays, differenceInCalendarDays } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Plus, Check, Undo2, Pencil, Trash2, SkipForward, Camera, Copy, Sparkles, X, Heart, Users } from 'lucide-react'
import Spinner from '../../components/Spinner'
import EmptyState from '../../components/EmptyState'
import SlideUpModal from '../../components/SlideUpModal'
import { useToast } from '../../components/useToast'
import { useMember } from '../../auth/useMember'
import { memberColor } from '../../lib/constants'
import { useBoolPref } from '../../lib/usePrefs'
import {
  useChores, useChoreAssignments, useRecentChoreLogs, useHouseholdMembers,
  useAddChore, useEditChore, useDeleteChore,
  useMaterializeAssignments, useLogChore, useUndoChoreLog, useToggleStep,
  useSetAssignmentStatus, useReorderChores, useAddChoreProof, useChoreProofUrl,
  useClaimAssignment,
} from './useChores'
import type { Chore, ChoreAssignment, ChoreLog, NewChoreInput } from './useChores'
import { supabase } from '../../lib/supabase'
import { useChoresRealtime } from './useChoresRealtime'
import { isApplicable, dueMemberFor, weekDates } from './chores.utils'
import {
  useThanks, useSendThanks, useThanksCelebration,
  useDislikes, useToggleDislike, useFeedback, useAddFeedback, feedbackTendency,
} from './useEquilibre'
import type { FeedbackVerdict } from './useEquilibre'
import { categoryOf, CHORE_CATEGORIES, CHORE_SUGGESTIONS } from './categories'
import ChoreForm from './ChoreForm'
import ProgressionTab from './ProgressionTab'
import RewardsTab from './RewardsTab'
import { useRecipes, mealMeta, MEAL_TYPES } from '../recipes/useRecipes'
import type { Recipe } from '../recipes/useRecipes'
import { useMealPlanWeek, weekStartISO } from '../recipes/useMealPlan'
import RecipeDetailModal from '../recipes/RecipeDetailModal'
import styles from './ChoresPage.module.css'

type Tab = 'todo' | 'progress' | 'rewards' | 'catalog'

export default function ChoresPage() {
  const { data: currentMember } = useMember()
  const { data: chores = [], isLoading } = useChores()
  const { data: members = [] } = useHouseholdMembers()
  const { data: logs = [] } = useRecentChoreLogs()
  useChoresRealtime()

  const [tab, setTab] = useState<Tab>('todo')
  // Vue « À faire » : un jour à la fois ou toute la semaine (préférence locale).
  const [weekView, setWeekView] = useBoolPref('chores-view-week', false)
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }))
  const days = useMemo(() => weekDates(weekStart), [weekStart])
  const from = days[0], to = days[6]

  const { data: assignments = [] } = useChoreAssignments(from, to)

  // Tâches en retard : assignations passées (14 j) toujours « pending ».
  const overdueFrom = format(subDays(new Date(), 14), 'yyyy-MM-dd')
  const overdueTo = format(subDays(new Date(), 1), 'yyyy-MM-dd')
  const { data: pastAssignments = [] } = useChoreAssignments(overdueFrom, overdueTo)
  const materialize = useMaterializeAssignments()
  const logChore = useLogChore()
  const undoLog = useUndoChoreLog()
  const addChore = useAddChore()
  const editChore = useEditChore()
  const deleteChore = useDeleteChore()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Chore | null>(null)
  const [adHocOpen, setAdHocOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [recipeView, setRecipeView] = useState<Recipe | null>(null)
  const [recipePickerOpen, setRecipePickerOpen] = useState(false)
  const [pickDone, setPickDone] = useState<{ a: ChoreAssignment; chore: Chore; doneOn: string } | null>(null)
  // Confirmations : suppression catalogue, validation groupée, abandon des retards.
  const [confirmDelete, setConfirmDelete] = useState<Chore | null>(null)
  const [confirmBulk, setConfirmBulk] = useState<ChoreAssignment[] | null>(null)
  const [confirmSkipAll, setConfirmSkipAll] = useState(false)
  const { showToast } = useToast()
  const toggleStep = useToggleStep()
  const setStatus = useSetAssignmentStatus()
  const reorderChores = useReorderChores()
  const claimAssignment = useClaimAssignment()
  const { data: recipes = [] } = useRecipes()
  const recipeById = useMemo(() => new Map(recipes.map(r => [r.id, r])), [recipes])

  // ── Équilibre du foyer : mercis, tâches détestées, pénibilité ────────────────
  const { data: thanks = [] } = useThanks()
  const sendThanks = useSendThanks()
  useThanksCelebration(currentMember?.id ?? null)
  const { data: dislikes = [] } = useDislikes()
  const toggleDislike = useToggleDislike()
  const { data: feedbacks = [] } = useFeedback()
  const addFeedback = useAddFeedback()
  // Après un pointage : mood optionnel (« C'était comment ? ») puis célébration.
  const [feedbackFor, setFeedbackFor] = useState<{ choreId: string; logId: string; memberId: string; choreName: string } | null>(null)

  const dislikersByChore = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const d of dislikes) {
      if (!m.has(d.chore_id)) m.set(d.chore_id, new Set())
      m.get(d.chore_id)!.add(d.member_id)
    }
    return m
  }, [dislikes])

  // Le bonus « détestée » s'applique si quelqu'un d'AUTRE la déteste et pas soi.
  // Sans assigné connu, on l'affiche dès qu'au moins un membre la déteste.
  function dislikeHint(choreId: string, doerId: string | null): boolean {
    const set = dislikersByChore.get(choreId)
    if (!set || set.size === 0) return false
    if (doerId === null) return true
    return !set.has(doerId) && [...set].some(id => id !== doerId)
  }

  // Prénoms de ceux qui détestent la tâche (hors exécutant) pour la chip dorée.
  function dislikerNames(choreId: string, exceptId: string | null): string {
    const set = dislikersByChore.get(choreId) ?? new Set<string>()
    return members.filter(m => m.id !== exceptId && set.has(m.id)).map(m => m.display_name).join(', ')
  }

  const myThanksByLog = useMemo(() => {
    const me = currentMember?.id
    const s = new Set<string>()
    if (!me) return s
    for (const t of thanks) if (t.from_member === me && t.log_id) s.add(t.log_id)
    return s
  }, [thanks, currentMember?.id])

  // « Fait récemment par l'autre » : ses pointages des 7 derniers jours (y
  // compris les tâches déclarées à la volée), à remercier d'un tap.
  const recentByOther = useMemo(() => {
    const me = currentMember?.id
    if (!me) return []
    const cutoff = format(subDays(new Date(), 7), 'yyyy-MM-dd')
    return logs
      .filter(l => l.member_id !== me && l.done_on >= cutoff && !l.id.startsWith('opt-'))
      .slice(0, 5)
  }, [logs, currentMember?.id])

  // Tâches les plus déclarées récemment : raccourcis en tête de la modale
  // « Déclarer une tâche faite » (évite de dérouler tout le catalogue).
  const frequentChoreIds = useMemo(() => {
    const counts = new Map<string, number>()
    for (const l of logs) if (l.chore_id) counts.set(l.chore_id, (counts.get(l.chore_id) ?? 0) + 1)
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([id]) => id)
  }, [logs])

  const memberColorById = useMemo(() => {
    const m = new Map<string, string>()
    members.forEach((mem, i) => m.set(mem.id, memberColor(i)))
    return m
  }, [members])

  // ── Matérialisation de la rotation sur la semaine visible (idempotent) ───────
  // On ne crée pas d'assignations rétroactives : seules les dates ≥ aujourd'hui
  // sont matérialisées (sinon consulter une semaine passée fabriquerait des
  // tâches « jamais faites » a posteriori).
  const todayMat = format(new Date(), 'yyyy-MM-dd')
  useEffect(() => {
    if (chores.length === 0) return
    const existing = new Set(assignments.map(a => `${a.chore_id}|${a.date}`))
    const missing: { chore_id: string; member_id: string | null; date: string }[] = []
    for (const chore of chores) {
      if (chore.frequency === 'none') continue
      for (const date of days) {
        if (date < todayMat) continue
        if (!isApplicable(chore, date)) continue
        if (existing.has(`${chore.id}|${date}`)) continue
        missing.push({ chore_id: chore.id, member_id: dueMemberFor(chore, date), date })
      }
    }
    if (missing.length > 0) materialize.mutate(missing)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chores, assignments, from, to])

  const choreById = useMemo(() => new Map(chores.map(c => [c.id, c])), [chores])
  const logByAssignment = useMemo(() => {
    const m = new Map<string, string>() // assignment_id -> log_id
    for (const l of logs) if (l.assignment_id) m.set(l.assignment_id, l.id)
    return m
  }, [logs])
  const logObjByAssignment = useMemo(() => {
    const m = new Map<string, ChoreLog>()
    for (const l of logs) if (l.assignment_id) m.set(l.assignment_id, l)
    return m
  }, [logs])

  const overdue = useMemo(
    () => pastAssignments
      .filter(a => a.status === 'pending' && choreById.has(a.chore_id) && !logByAssignment.has(a.id))
      .sort((a, b) => a.date < b.date ? -1 : 1),
    [pastAssignments, choreById, logByAssignment],
  )

  const today = format(new Date(), 'yyyy-MM-dd')
  const [selectedDay, setSelectedDay] = useState(today)
  // Jour effectif borné à la semaine affichée (dérivé en rendu, pas en effet).
  const effectiveDay = days.includes(selectedDay) ? selectedDay : (days.includes(today) ? today : days[0])

  const dayAssignments = useMemo(
    () => assignments
      .filter(a => a.date === effectiveDay)
      .filter(a => choreById.has(a.chore_id))
      .sort((a, b) => (choreById.get(a.chore_id)?.name ?? '').localeCompare(choreById.get(b.chore_id)?.name ?? '')),
    [assignments, effectiveDay, choreById],
  )

  // Points encore à prendre sur la semaine affichée (récap vue Semaine).
  // Seuls les jours restants comptent : « à venir » exclut les jours écoulés.
  const weekPendingPoints = useMemo(
    () => assignments.reduce((sum, a) => {
      if (a.date < today) return sum
      if (a.status !== 'pending' || logByAssignment.has(a.id)) return sum
      return sum + (choreById.get(a.chore_id)?.points ?? 0)
    }, 0),
    [assignments, choreById, logByAssignment, today],
  )

  // Le mood n'est demandé que parcimonieusement : une tâche qu'on n'a jamais
  // évaluée, ou une grosse tâche. Sinon le pointage ne coûte qu'un tap.
  function shouldAskMood(choreId: string, memberId: string, points: number): boolean {
    if (points >= BIG_TASK_POINTS) return true
    return !feedbacks.some(f => f.chore_id === choreId && f.member_id === memberId)
  }

  function markDone(assignmentId: string | null, chore: Chore, memberId: string, doneOn: string = effectiveDay) {
    logChore.mutate(
      { chore_id: chore.id, assignment_id: assignmentId, member_id: memberId, done_on: doneOn },
      {
        // Notifie seulement une fois le pointage confirmé (pas de fausse annonce
        // si la RPC échoue hors-ligne).
        onSuccess: (logId) => {
          if (chore.points >= BIG_TASK_POINTS) {
            const who = members.find(m => m.id === memberId)?.display_name ?? 'Quelqu\'un'
            void supabase.functions.invoke('notify-household', {
              body: { title: `${chore.emoji} Tâche faite`, body: `${who} a fait « ${chore.name} » (+${chore.points} pts)`, module: 'chores' },
            })
          }
          // Célébration = toast (rien à fermer). Le mood reste une modale mais
          // n'apparaît plus à chaque pointage.
          showToast({
            type: 'success',
            message: chore.points >= BIG_TASK_POINTS
              ? `🏅 Grosse tâche — +${chore.points} pts`
              : `Bien joué — +${chore.points} pts`,
          })
          if (memberId === currentMember?.id && shouldAskMood(chore.id, memberId, chore.points)) {
            setFeedbackFor({ choreId: chore.id, logId, memberId, choreName: chore.name })
          }
        },
      },
    )
  }

  // Tâche assignée → crédite l'assigné. Tâche libre → crédite le membre courant
  // (on tape « fait » parce qu'on vient de la faire) ; la fiche de détail offre
  // « Marquer fait par… » pour le cas où c'est quelqu'un d'autre.
  function requestDone(a: ChoreAssignment, chore: Chore, doneOn: string = effectiveDay) {
    const doer = a.member_id ?? currentMember?.id
    if (doer) markDone(a.id, chore, doer, doneOn)
  }

  // Ligne de tâche (partagée entre la vue jour et la vue semaine).
  function renderAssignmentRow(a: ChoreAssignment) {
    const chore = choreById.get(a.chore_id)!
    const logId = logByAssignment.get(a.id)
    const done = a.status === 'done' || !!logId
    const skipped = a.status === 'skipped'
    const assignee = a.member_id ? members.find(m => m.id === a.member_id) : null
    const color = a.member_id ? memberColorById.get(a.member_id) : 'var(--accent)'
    const free = !a.member_id && !done && !skipped
    const hasDetail = !!chore.instructions || chore.steps.length > 0
    const stepsTotal = chore.steps.length
    const stepsDone = a.steps_done.filter(i => i < stepsTotal).length
    const bonus = !done && !skipped && dislikeHint(chore.id, a.member_id)
    // Deux informations en clair (qui + points) ; le reste en pictos discrets.
    return (
      <SwipeRow
        key={a.id}
        className={[styles.row, done ? styles.rowDone : '', skipped ? styles.rowSkipped : '', free ? styles.rowFree : ''].join(' ')}
        onSwipe={!done && !skipped ? () => requestDone(a, chore, a.date) : undefined}
      >
        <button className={styles.rowOpen} onClick={() => setDetailId(a.id)}>
          <span className={styles.rowEmoji} style={{ background: (chore.color ?? categoryOf(chore.category).color) + '22' }}>{chore.emoji}</span>
          <div className={styles.rowMain}>
            <span className={styles.rowName}>{chore.name}</span>
            <span className={styles.rowMeta}>
              {skipped && <span className={styles.rotBadge}>passée</span>}
              {assignee
                ? <span className={styles.assignee} style={{ color }}>{assignee.display_name}</span>
                : free && <span className={styles.chipFree}>Libre</span>}
              <span className={styles.points}>+{chore.points} pts</span>
              <span className={styles.metaIcons}>
                {chore.mental_load && <span title="Charge mentale" aria-label="Charge mentale">🧠</span>}
                {bonus && (
                  <span title={`Détestée par ${dislikerNames(chore.id, a.member_id)} · bonus +50 %`}
                    aria-label={`Détestée par ${dislikerNames(chore.id, a.member_id)}, bonus de 50 %`}>💛</span>
                )}
                {stepsTotal > 0 && <span className={styles.stepsMini}>{stepsDone}/{stepsTotal}</span>}
                {hasDetail && stepsTotal === 0 && <span title="Consignes" aria-label="Consignes">📄</span>}
              </span>
            </span>
          </div>
        </button>
        {free && currentMember && (
          <button
            className={styles.claimBtn}
            onClick={() => claimAssignment.mutate({ assignmentId: a.id, memberId: currentMember.id })}
            disabled={claimAssignment.isPending}
          >
            Je prends
          </button>
        )}
        {done && (() => {
          // Merci : sur une tâche faite par l'autre, une fois par personne.
          const log = logObjByAssignment.get(a.id)
          const me = currentMember?.id
          if (!log || log.id.startsWith('opt-') || !me || log.member_id === me) return null
          const thanked = myThanksByLog.has(log.id)
          return (
            <button
              className={[styles.thanksBtn, thanked ? styles.thanksBtnOn : ''].join(' ')}
              disabled={thanked || sendThanks.isPending}
              onClick={() => sendThanks.mutate({ logId: log.id, fromMember: me, toMember: log.member_id, label: chore.name })}
              aria-label={thanked ? 'Merci déjà envoyé' : 'Dire merci'}
              title={thanked ? 'Merci déjà envoyé' : 'Dire merci'}
            >
              <Heart size={16} fill={thanked ? 'currentColor' : 'none'} />
            </button>
          )
        })()}
        {done ? (
          <button className={styles.undoBtn} disabled={!logId || logId.startsWith('opt-')} onClick={() => logId && !logId.startsWith('opt-') && undoLog.mutate(logId)} aria-label="Annuler">
            <Undo2 size={16} />
          </button>
        ) : skipped ? (
          <button className={styles.undoBtn} onClick={() => setStatus.mutate({ assignmentId: a.id, status: 'pending' })} aria-label="Reprendre">
            <Undo2 size={16} />
          </button>
        ) : (
          <button className={styles.doneBtn} onClick={() => requestDone(a, chore, a.date)} aria-label="Marquer fait">
            <Check size={18} />
          </button>
        )}
      </SwipeRow>
    )
  }

  // Suggestions de tâches courantes pas encore présentes dans le catalogue.
  const suggestions = useMemo(() => {
    const have = new Set(chores.map(c => c.name.trim().toLowerCase()))
    return CHORE_SUGGESTIONS.filter(s => !have.has(s.name.trim().toLowerCase()))
  }, [chores])

  // Ajoute une tâche courante en un tap (défauts raisonnables, à affiner ensuite).
  function addSuggestion(s: typeof CHORE_SUGGESTIONS[number]) {
    addChore.mutate({
      name: s.name, emoji: s.emoji, color: null, category: s.category, points: s.points,
      frequency: 'none', frequency_days: null, start_date: null,
      rotation_member_ids: null, rotation_period: 'week', default_member_id: null,
      instructions: null, steps: [], recipe_id: null, mental_load: s.mental_load ?? false,
    })
  }

  // Duplique une tâche existante du catalogue (copie modifiable).
  function duplicateChore(chore: Chore) {
    addChore.mutate({
      name: `${chore.name} (copie)`, emoji: chore.emoji, color: chore.color, category: chore.category,
      points: chore.points, frequency: chore.frequency, frequency_days: chore.frequency_days,
      start_date: chore.start_date, rotation_member_ids: chore.rotation_member_ids,
      rotation_period: chore.rotation_period, default_member_id: chore.default_member_id,
      instructions: chore.instructions, steps: chore.steps, recipe_id: chore.recipe_id,
      mental_load: chore.mental_load,
    })
  }

  // Catalogue groupé par catégorie, dans l'ordre fixe du référentiel (handoff).
  const catalogGroups = useMemo(() => {
    return CHORE_CATEGORIES
      .map(cat => ({ cat, items: chores.filter(c => categoryOf(c.category).value === cat.value) }))
      .filter(g => g.items.length > 0)
  }, [chores])

  // Déplace une tâche AU SEIN de sa catégorie ; l'ordre global persisté est
  // recomposé groupe par groupe (ordre des catégories, puis ordre interne).
  function moveChoreInCategory(chore: Chore, dir: -1 | 1) {
    const flat: string[] = []
    for (const g of catalogGroups) {
      const ids = g.items.map(c => c.id)
      const i = ids.indexOf(chore.id)
      if (i >= 0) {
        const j = i + dir
        if (j < 0 || j >= ids.length) return
        ;[ids[i], ids[j]] = [ids[j], ids[i]]
      }
      flat.push(...ids)
    }
    reorderChores.mutate(flat)
  }

  const FREQ_SHORT: Record<string, string> = { daily: 'Quotidien', weekly: 'Hebdo', monthly: 'Mensuel', none: 'Ponctuel' }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link to="/" className={styles.backLink} aria-label="Accueil"><ChevronLeft size={24} /></Link>
        <h1 className={styles.pageTitle}>Tâches</h1>
        {/* Une seule action par onglet : créer une tâche au Catalogue, la bascule
            d'affichage sur « À faire » (déclarer une tâche faite = le FAB). */}
        {tab === 'catalog' && (
          <div className={styles.headerActions}>
            <button className={styles.statsBtn} onClick={() => { setEditing(null); setFormOpen(true) }}>
              <Plus size={15} /> Nouvelle tâche
            </button>
          </div>
        )}
        {tab === 'todo' && (
          <div className={styles.viewToggle} role="group" aria-label="Affichage">
            <button className={[styles.segBtn, !weekView ? styles.segActive : ''].join(' ')}
              aria-pressed={!weekView} onClick={() => setWeekView(false)}>Jour</button>
            <button className={[styles.segBtn, weekView ? styles.segActive : ''].join(' ')}
              aria-pressed={weekView} onClick={() => setWeekView(true)}>Semaine</button>
          </div>
        )}
      </header>

      <div className={styles.tabs}>
        <button className={[styles.tab, tab === 'todo' ? styles.tabActive : ''].join(' ')} onClick={() => setTab('todo')}>À faire</button>
        <button className={[styles.tab, tab === 'progress' ? styles.tabActive : ''].join(' ')} onClick={() => setTab('progress')}>Progression</button>
        <button className={[styles.tab, tab === 'rewards' ? styles.tabActive : ''].join(' ')} onClick={() => setTab('rewards')}>Récompenses</button>
        <button className={[styles.tab, tab === 'catalog' ? styles.tabActive : ''].join(' ')} onClick={() => setTab('catalog')}>Catalogue</button>
      </div>

      {isLoading ? <Spinner /> : tab === 'progress' ? (
        <ProgressionTab members={members} chores={chores} logs={logs} currentMemberId={currentMember?.id ?? null} />
      ) : tab === 'rewards' ? (
        <RewardsTab members={members} currentMemberId={currentMember?.id ?? null} />
      ) : tab === 'todo' ? (
        <>
          {/* Tâches en retard — ton factuel, jamais de rouge (handoff). */}
          {overdue.length > 0 && (
            <section className={styles.overdueBlock}>
              <h2 className={styles.overdueTitle}>
                <span>⏳ En retard ({overdue.length})</span>
                {overdue.length >= 3 && (
                  <button className={styles.sectionAction} onClick={() => setConfirmSkipAll(true)}>Tout passer</button>
                )}
              </h2>
              <ul className={styles.list}>
                {overdue.map(a => {
                  const chore = choreById.get(a.chore_id)!
                  const assignee = a.member_id ? members.find(m => m.id === a.member_id) : null
                  const color = a.member_id ? memberColorById.get(a.member_id) : 'var(--accent)'
                  const lateDays = Math.max(1, differenceInCalendarDays(new Date(), new Date(a.date + 'T12:00')))
                  return (
                    <li key={a.id} className={[styles.row, styles.rowOverdue].join(' ')}>
                      {/* Ouvrable comme n'importe quelle tâche : consignes et
                          étapes restent accessibles même en retard. */}
                      <button className={styles.rowOpen} onClick={() => setDetailId(a.id)}>
                        <span className={styles.rowEmoji} style={{ background: (chore.color ?? categoryOf(chore.category).color) + '22' }}>{chore.emoji}</span>
                        <div className={styles.rowMain}>
                          <span className={styles.rowName}>{chore.name}</span>
                          <span className={styles.rowMeta}>
                            <span className={styles.overdueSince}>En retard depuis {lateDays} j</span>
                            {assignee && <span className={styles.assignee} style={{ color }}>{assignee.display_name}</span>}
                            <span className={styles.points}>+{chore.points} pts</span>
                          </span>
                        </div>
                      </button>
                      <button
                        className={styles.undoBtn}
                        onClick={() => setStatus.mutate({ assignmentId: a.id, status: 'skipped' })}
                        aria-label="Passer cette tâche"
                        title="Passer (personne ne la fera)"
                      >
                        <X size={16} />
                      </button>
                      <button className={styles.doneBtn} onClick={() => requestDone(a, chore, today)} aria-label="Marquer fait">
                        <Check size={18} />
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {/* Sélecteur de semaine + jours */}
          <div className={styles.weekNav}>
            <button onClick={() => setWeekStart(s => subDays(s, 7))} aria-label="Semaine précédente"><ChevronLeft size={20} /></button>
            {weekView ? (
              <span className={styles.weekLabel}>
                Semaine du {format(new Date(from + 'T12:00'), 'd MMM', { locale: fr })} au {format(new Date(to + 'T12:00'), 'd MMM', { locale: fr })}
              </span>
            ) : (
              <div className={styles.weekStrip}>
                {days.map(d => {
                  const dt = new Date(d + 'T12:00')
                  const active = d === effectiveDay
                  return (
                    <button key={d} className={[styles.dayBtn, active ? styles.dayBtnActive : '', d === today ? styles.dayToday : ''].join(' ')}
                      onClick={() => setSelectedDay(d)}>
                      <span className={styles.dayName}>{format(dt, 'EEEEE', { locale: fr })}</span>
                      <span className={styles.dayNum}>{format(dt, 'd')}</span>
                    </button>
                  )
                })}
              </div>
            )}
            <button onClick={() => setWeekStart(s => addDays(s, 7))} aria-label="Semaine suivante"><ChevronRight size={20} /></button>
          </div>

          {weekView ? (
            // ── Vue semaine : toutes les tâches, groupées par jour ──────────────
            (() => {
              const sections = days.map(d => {
                const dt = new Date(d + 'T12:00')
                const list = assignments
                  .filter(a => a.date === d && choreById.has(a.chore_id))
                  .sort((a, b) => (choreById.get(a.chore_id)?.name ?? '').localeCompare(choreById.get(b.chore_id)?.name ?? ''))
                if (list.length === 0) return null
                const active = list.filter(a => a.status !== 'skipped')
                const doneCount = active.filter(a => a.status === 'done' || logByAssignment.has(a.id)).length
                return (
                  <section key={d} className={styles.weekDaySection}>
                    <h3 className={[styles.weekDayTitle, d === today ? styles.weekDayToday : ''].join(' ')}>
                      <span>{format(dt, 'EEEE d MMMM', { locale: fr })}{d === today ? ' · aujourd\'hui' : ''}</span>
                      {active.length > 0 && (
                        <span className={styles.weekDayCount}>
                          {doneCount === active.length ? '✓ ' : ''}{doneCount}/{active.length}
                        </span>
                      )}
                    </h3>
                    <ul className={styles.list}>{list.map(renderAssignmentRow)}</ul>
                  </section>
                )
              }).filter(Boolean)
              return sections.length === 0 ? (
                <EmptyState emoji="🧹" title="Rien de prévu cette semaine" description="Crée des tâches dans le Catalogue ou déclare une tâche faite." />
              ) : (
                <div className={styles.weekList}>
                  {weekPendingPoints > 0 && (
                    <p className={styles.weekRecap}>⚡ {weekPendingPoints} pts à venir cette semaine</p>
                  )}
                  {sections}
                </div>
              )
            })()
          ) : dayAssignments.length === 0 ? (
            <EmptyState emoji="🧹" title="Rien de prévu ce jour" description="Crée des tâches dans le Catalogue ou déclare une tâche faite." />
          ) : (
            // ── Vue jour : tâches du jour + tâches libres en section dédiée ────
            (() => {
              const freeList = dayAssignments.filter(a => !a.member_id && a.status === 'pending' && !logByAssignment.has(a.id))
              const freeIds = new Set(freeList.map(a => a.id))
              const mainList = dayAssignments.filter(a => !freeIds.has(a.id))
              const dt = new Date(effectiveDay + 'T12:00')
              return (
                <div className={styles.weekList}>
                  <section className={styles.weekDaySection}>
                    <h3 className={[styles.weekDayTitle, effectiveDay === today ? styles.weekDayToday : ''].join(' ')}>
                      <span>{format(dt, 'EEEE d', { locale: fr })} — tâches du jour</span>
                      {(() => {
                        const pending = mainList.filter(a => a.status === 'pending' && !logByAssignment.has(a.id))
                        if (pending.length < 2) return null
                        return (
                          <button className={styles.sectionAction} onClick={() => setConfirmBulk(pending)}>
                            Tout valider ({pending.length})
                          </button>
                        )
                      })()}
                    </h3>
                    {mainList.length === 0 ? (
                      <p className={styles.sectionEmpty}>Rien d'assigné ce jour.</p>
                    ) : (
                      <ul className={styles.list}>{mainList.map(renderAssignmentRow)}</ul>
                    )}
                  </section>
                  {freeList.length > 0 && (
                    <section className={styles.weekDaySection}>
                      <h3 className={styles.weekDayTitle}><span>Tâches libres</span></h3>
                      <p className={styles.sectionHint}>Premier arrivé, premier servi</p>
                      <ul className={styles.list}>{freeList.map(renderAssignmentRow)}</ul>
                    </section>
                  )}
                </div>
              )
            })()
          )}

          {/* Fait récemment par l'autre : reconnaissance en un tap. */}
          {recentByOther.length > 0 && currentMember && (
            <section className={styles.recentBlock}>
              <h2 className={styles.recentTitle}>💛 Fait récemment par {members.find(m => m.id !== currentMember.id)?.display_name ?? 'l\'autre'}</h2>
              <ul className={styles.list}>
                {recentByOther.map(l => {
                  const chore = l.chore_id ? choreById.get(l.chore_id) : undefined
                  const label = chore?.name ?? l.label ?? 'Tâche'
                  const thanked = myThanksByLog.has(l.id)
                  return (
                    <li key={l.id} className={styles.recentRow}>
                      <span className={styles.recentEmoji}>{chore?.emoji ?? '✨'}</span>
                      <div className={styles.rowMain}>
                        <span className={styles.recentName}>{label}</span>
                        <span className={styles.rowMeta}>
                          <span>{format(new Date(l.done_on + 'T12:00'), 'EEE d MMM', { locale: fr })}</span>
                          {l.points_awarded > 0 && <span className={styles.points}>+{l.points_awarded} pts</span>}
                        </span>
                      </div>
                      <button
                        className={[styles.merciPill, thanked ? styles.merciPillOn : ''].join(' ')}
                        disabled={thanked || sendThanks.isPending}
                        onClick={() => sendThanks.mutate({ logId: l.id, fromMember: currentMember.id, toMember: l.member_id, label })}
                      >
                        {thanked ? 'Merci envoyé 💛' : 'Merci'}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {/* FAB : déclarer une tâche faite (hors planning). */}
          <div className={styles.fabSpacer} aria-hidden="true" />
          <button className={styles.fab} onClick={() => setAdHocOpen(true)} aria-label="Déclarer une tâche faite">
            <Plus size={26} strokeWidth={2.5} />
          </button>
        </>
      ) : (
        // ── Catalogue (groupé par catégorie, ordre fixe — handoff) ─────────────
        chores.length === 0 ? (
          <EmptyState emoji="✨" title="Aucune tâche" description="Crée ta première tâche familiale." />
        ) : (
          <>
            <p className={styles.catalogHint}>
              Réordonnez avec les flèches. 🤍 marque une tâche que vous détestez : celui qui la fait à votre place gagne un bonus.
            </p>
            {catalogGroups.map(({ cat, items }) => (
              <section key={cat.value} className={styles.catGroup}>
                <h3 className={styles.catGroupTitle}>{cat.label}</h3>
                <ul className={styles.list}>
                  {items.map((chore, i) => {
                    const rot = chore.rotation_member_ids && chore.rotation_member_ids.length > 0
                    const fixedTo = !rot && chore.default_member_id
                      ? members.find(m => m.id === chore.default_member_id)?.display_name : null
                    const dislikers = dislikersByChore.get(chore.id) ?? new Set<string>()
                    const me = currentMember?.id
                    const iDislike = !!me && dislikers.has(me)
                    const otherDislikers = members.filter(m => m.id !== me && dislikers.has(m.id))
                    const otherName = members.length === 2
                      ? members.find(m => m.id !== me)?.display_name ?? 'l\'autre' : 'les autres'
                    const tendency = feedbackTendency(feedbacks, chore.id)
                    return (
                      <li key={chore.id} className={styles.catCard}>
                        <div className={styles.catCardTop}>
                          <span className={styles.rowEmoji} style={{ background: (chore.color ?? cat.color) + '22' }}>{chore.emoji}</span>
                          <div className={styles.rowMain}>
                            <span className={styles.rowName}>{chore.name}</span>
                            <span className={styles.rowMeta}>
                              <span className={styles.chipCatMini}>{FREQ_SHORT[chore.frequency]}</span>
                              <span className={styles.chipCatMini}>{rot ? 'Rotation' : fixedTo ? `Fixe · ${fixedTo}` : 'Libre'}</span>
                              {chore.mental_load && <span className={styles.chipPlan}>Charge mentale</span>}
                              {otherDislikers.length > 0 && (
                                <span className={styles.chipBonus}>💛 détestée par {otherDislikers.map(m => m.display_name).join(', ')}</span>
                              )}
                              <span className={styles.points}>+{chore.points} pts</span>
                            </span>
                            {tendency && (
                              <span className={styles.tendencyHint}>
                                {tendency === 'harder'
                                  ? 'Souvent plus pénible que prévu — augmenter les points ?'
                                  : 'Souvent plus facile que prévu — baisser les points ?'}
                              </span>
                            )}
                          </div>
                          {items.length > 1 && (
                            <span className={styles.moveCol}>
                              <button className={styles.iconBtn} onClick={() => moveChoreInCategory(chore, -1)} disabled={i === 0} aria-label="Monter"><ChevronUp size={15} /></button>
                              <button className={styles.iconBtn} onClick={() => moveChoreInCategory(chore, 1)} disabled={i === items.length - 1} aria-label="Descendre"><ChevronDown size={15} /></button>
                            </span>
                          )}
                          {me && (
                            <button
                              className={[styles.iconBtn, iDislike ? styles.iconBtnOn : ''].join(' ')}
                              onClick={() => toggleDislike.mutate({ choreId: chore.id, memberId: me, disliked: iDislike })}
                              aria-pressed={iDislike}
                              aria-label={iDislike ? 'Tu détestes cette tâche' : 'Marquer « je déteste cette tâche »'}
                              title={iDislike
                                ? `Tu détestes cette tâche — bonus pour ${otherName}`
                                : 'Marquer « je déteste cette tâche »'}
                            >
                              {iDislike ? '💔' : '🤍'}
                            </button>
                          )}
                          <button className={styles.iconBtn} onClick={() => { setEditing(chore); setFormOpen(true) }} aria-label="Modifier"><Pencil size={16} /></button>
                          <button className={styles.iconBtn} onClick={() => duplicateChore(chore)} aria-label="Dupliquer"><Copy size={16} /></button>
                          <button className={styles.iconBtn} onClick={() => setConfirmDelete(chore)} aria-label="Supprimer"><Trash2 size={16} /></button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </>
        )
      )}

      {tab === 'catalog' && suggestions.length > 0 && (
        <section className={styles.suggestBlock}>
          <h2 className={styles.suggestTitle}><Sparkles size={15} /> Suggestions</h2>
          <p className={styles.suggestHint}>Ajoute une tâche courante en un tap, puis affine-la si besoin.</p>
          <div className={styles.suggestChips}>
            {suggestions.map(s => (
              <button key={s.name} className={styles.suggestChip} onClick={() => addSuggestion(s)} disabled={addChore.isPending}>
                <span>{s.emoji}</span> {s.name} <span className={styles.suggestPts}>+{s.points}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {formOpen && (
        <ChoreForm
          members={members}
          initial={editing ?? undefined}
          onClose={() => setFormOpen(false)}
          onSubmit={(input) => {
            if (editing) editChore.mutate({ id: editing.id, ...input })
            else addChore.mutate(input)
          }}
        />
      )}

      {detailId && (() => {
        // La fiche s'ouvre depuis les deux vues ET depuis le bloc « en retard »,
        // dont les assignations sont hors de la fenêtre de la semaine affichée.
        const a = assignments.find(x => x.id === detailId) ?? pastAssignments.find(x => x.id === detailId)
        const chore = a ? choreById.get(a.chore_id) : undefined
        if (!a || !chore) return null
        const logId = logByAssignment.get(a.id)
        const done = a.status === 'done' || !!logId
        return (
          <TaskDetailSheet
            chore={chore} assignment={a} done={done}
            log={logObjByAssignment.get(a.id) ?? null}
            recipes={recipes}
            linkedRecipe={chore.recipe_id ? recipeById.get(chore.recipe_id) ?? null : null}
            onOpenRecipe={(r) => setRecipeView(r)}
            onBrowseRecipes={() => setRecipePickerOpen(true)}
            onToggleStep={(stepsDone) => toggleStep.mutate({ assignmentId: a.id, stepsDone })}
            canPickDoer={members.length > 1}
            onMarkDone={() => { setDetailId(null); requestDone(a, chore, a.date) }}
            onMarkDoneBy={() => { setDetailId(null); setPickDone({ a, chore, doneOn: a.date }) }}
            onSkip={() => { setStatus.mutate({ assignmentId: a.id, status: 'skipped' }); setDetailId(null) }}
            onResume={() => { setStatus.mutate({ assignmentId: a.id, status: 'pending' }); setDetailId(null) }}
            onUndo={() => { if (logId && !logId.startsWith('opt-')) undoLog.mutate(logId); setDetailId(null) }}
            onClose={() => setDetailId(null)}
          />
        )
      })()}

      {recipePickerOpen && (
        <RecipePickerSheet
          recipes={recipes}
          onPick={(r) => { setRecipePickerOpen(false); setRecipeView(r) }}
          onClose={() => setRecipePickerOpen(false)}
        />
      )}

      {recipeView && (
        <RecipeDetailModal recipe={recipeView} showCooked={false} onClose={() => setRecipeView(null)} />
      )}

      {pickDone && (
        <SlideUpModal title="Qui a fait cette tâche ?" onClose={() => setPickDone(null)}>
          <div className={styles.pickList}>
            {members.map(m => (
              <button key={m.id} className={styles.pickBtn}
                onClick={() => { markDone(pickDone.a.id, pickDone.chore, m.id, pickDone.doneOn); setPickDone(null) }}>
                {m.display_name}
              </button>
            ))}
          </div>
        </SlideUpModal>
      )}

      {adHocOpen && (
        <AdHocModal
          chores={chores}
          frequentChoreIds={frequentChoreIds}
          members={members}
          defaultMemberId={currentMember?.id ?? null}
          onClose={() => setAdHocOpen(false)}
          onSubmit={async (input) => {
            setAdHocOpen(false)
            // Si la tâche déclarée a une assignation ce jour-là, on la rattache :
            // l'occurrence passe « fait » et log_chore (idempotent sur
            // assignment_id) empêche un double crédit si elle était déjà pointée.
            let assignmentId: string | null = null
            if (input.chore_id) {
              const { data } = await supabase
                .from('chore_assignments')
                .select('id')
                .eq('chore_id', input.chore_id)
                .eq('date', input.done_on)
                .maybeSingle()
              assignmentId = (data as { id: string } | null)?.id ?? null
            }
            logChore.mutate({ ...input, assignment_id: assignmentId })
          }}
          onSaveAsChore={(input) => addChore.mutate(input)}
        />
      )}

      {feedbackFor && (
        <MoodModal
          choreName={feedbackFor.choreName}
          onPick={(verdict) => {
            addFeedback.mutate({ choreId: feedbackFor.choreId, logId: feedbackFor.logId, memberId: feedbackFor.memberId, verdict })
            setFeedbackFor(null)
          }}
          onClose={() => setFeedbackFor(null)}
        />
      )}

      {confirmDelete && (
        <ConfirmSheet
          title={`Supprimer « ${confirmDelete.name} » ?`}
          body="Les points déjà gagnés sont conservés. Les occurrences à venir disparaissent."
          confirmLabel="Supprimer"
          danger
          onConfirm={() => { deleteChore.mutate(confirmDelete.id); setConfirmDelete(null) }}
          onClose={() => setConfirmDelete(null)}
        />
      )}

      {confirmBulk && (
        <ConfirmSheet
          title={`Valider ${confirmBulk.length} tâches ?`}
          body={`${confirmBulk.reduce((s, a) => s + (choreById.get(a.chore_id)?.points ?? 0), 0)} pts seront crédités d'un coup.`}
          confirmLabel="Tout valider"
          onConfirm={() => {
            for (const a of confirmBulk) {
              const chore = choreById.get(a.chore_id)
              const doer = a.member_id ?? currentMember?.id
              if (chore && doer) {
                logChore.mutate({ chore_id: chore.id, assignment_id: a.id, member_id: doer, done_on: a.date })
              }
            }
            showToast({ type: 'success', message: `${confirmBulk.length} tâches validées` })
            setConfirmBulk(null)
          }}
          onClose={() => setConfirmBulk(null)}
        />
      )}

      {confirmSkipAll && (
        <ConfirmSheet
          title={`Passer les ${overdue.length} tâches en retard ?`}
          body="Elles sortent de la liste sans rapporter de points. Rien n'est supprimé."
          confirmLabel="Tout passer"
          onConfirm={() => {
            for (const a of overdue) setStatus.mutate({ assignmentId: a.id, status: 'skipped' })
            setConfirmSkipAll(false)
          }}
          onClose={() => setConfirmSkipAll(false)}
        />
      )}
    </div>
  )
}

// Au-delà de ce seuil de points, on prévient le foyer qu'une grosse tâche est faite.
const BIG_TASK_POINTS = 20

// ── Ligne balayable : glisser vers la droite = marquer fait ───────────────────
// L'axe est verrouillé au premier mouvement significatif : un geste vertical
// reste un scroll normal, et un simple tap continue d'atteindre les boutons
// internes (aucune capture tant que l'axe n'est pas horizontal).

const SWIPE_TRIGGER = 72

function SwipeRow({ className, onSwipe, children }: { className: string; onSwipe?: () => void; children: ReactNode }) {
  const [dx, setDx] = useState(0)
  const start = useRef<{ x: number; y: number; axis: 'none' | 'x' | 'y' } | null>(null)

  const end = useCallback((fire: boolean) => {
    if (fire && onSwipe) onSwipe()
    start.current = null
    setDx(0)
  }, [onSwipe])

  function onPointerDown(e: ReactPointerEvent<HTMLLIElement>) {
    if (!onSwipe || e.pointerType === 'mouse') return
    start.current = { x: e.clientX, y: e.clientY, axis: 'none' }
  }
  function onPointerMove(e: ReactPointerEvent<HTMLLIElement>) {
    const s = start.current
    if (!s) return
    const ox = e.clientX - s.x, oy = e.clientY - s.y
    if (s.axis === 'none') {
      if (Math.abs(ox) < 10 && Math.abs(oy) < 10) return
      s.axis = Math.abs(ox) > Math.abs(oy) ? 'x' : 'y'
      if (s.axis === 'x') e.currentTarget.setPointerCapture(e.pointerId)
    }
    if (s.axis !== 'x') return
    setDx(Math.max(0, Math.min(ox, SWIPE_TRIGGER + 24)))
  }
  function onPointerUp() {
    end(start.current?.axis === 'x' && dx >= SWIPE_TRIGGER)
  }

  return (
    <li
      className={[className, dx > 0 ? styles.rowSwiping : ''].join(' ')}
      style={dx > 0 ? { transform: `translateX(${dx}px)` } : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => end(false)}
    >
      {dx > 0 && (
        <span className={[styles.swipeHint, dx >= SWIPE_TRIGGER ? styles.swipeHintArmed : ''].join(' ')} aria-hidden="true">
          <Check size={18} strokeWidth={3} />
        </span>
      )}
      {children}
    </li>
  )
}

// ── Après un pointage : mood optionnel (la célébration est passée en toast) ───
// Une seule étape, et seulement quand la réponse apporte quelque chose
// (première fois sur cette tâche, ou grosse tâche) — voir shouldAskMood.

function MoodModal({ choreName, onPick, onClose }: { choreName: string; onPick: (v: FeedbackVerdict) => void; onClose: () => void }) {
  return (
    <SlideUpModal title="C'était comment ?" onClose={onClose}>
      <div className={styles.pickList}>
        <p className={styles.hint} style={{ margin: 0 }}>« {choreName} » — ta réponse aide à garder des points justes. Optionnel, sans effet sur les points déjà gagnés.</p>
        <button className={styles.pickBtn} onClick={() => onPick('easier')}>😌 Plus facile que prévu</button>
        <button className={styles.pickBtn} onClick={() => onPick('as_expected')}>🙂 Comme prévu</button>
        <button className={styles.pickBtn} onClick={() => onPick('harder')}>😤 Plus pénible que prévu</button>
        <button className={styles.skipBtn} onClick={onClose}>Passer</button>
      </div>
    </SlideUpModal>
  )
}

// ── Confirmation générique (remplace les confirm() natifs) ───────────────────

function ConfirmSheet({ title, body, confirmLabel, danger, onConfirm, onClose }: {
  title: string
  body: string
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <SlideUpModal title={title} onClose={onClose}>
      <div className={styles.pickList}>
        <p className={styles.hint} style={{ margin: 0 }}>{body}</p>
        <button
          className={danger ? styles.deleteBtn : styles.submitBtn}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
        <button className={styles.skipBtn} onClick={onClose}>Annuler</button>
      </div>
    </SlideUpModal>
  )
}

// ── Recettes liées à une tâche de cuisine ────────────────────────────────────
// Pour une tâche de cuisine : suggère la recette prévue ce jour-là (planning
// repas) et permet d'en parcourir une autre depuis le carnet. Le choix est
// par occurrence (on n'écrit pas recipe_id sur le modèle de tâche).

function CuisineRecipeSection({ assignment, recipes, linkedRecipeId, onOpenRecipe, onBrowseRecipes }: {
  assignment: ChoreAssignment
  recipes: Recipe[]
  linkedRecipeId: string | null
  onOpenRecipe: (r: Recipe) => void
  onBrowseRecipes: () => void
}) {
  const weekStart = weekStartISO(new Date(assignment.date + 'T12:00'))
  const { data: planEntries = [] } = useMealPlanWeek(weekStart)
  const recipeById = useMemo(() => new Map(recipes.map(r => [r.id, r])), [recipes])

  // Recettes prévues ce jour (hors celle déjà liée au modèle, déjà affichée).
  const plannedToday = useMemo(() => {
    const seen = new Set<string>(linkedRecipeId ? [linkedRecipeId] : [])
    const out: Recipe[] = []
    for (const e of planEntries) {
      if (e.date !== assignment.date || seen.has(e.recipe_id)) continue
      const r = recipeById.get(e.recipe_id)
      if (r) { seen.add(e.recipe_id); out.push(r) }
    }
    return out
  }, [planEntries, assignment.date, recipeById, linkedRecipeId])

  return (
    <div className={styles.detailBlock}>
      {plannedToday.map(r => (
        <button key={r.id} type="button" className={styles.recipeLinkBtn} onClick={() => onOpenRecipe(r)}>
          🍽️ Prévu ce jour — {r.title}
        </button>
      ))}
      <button type="button" className={styles.recipePickBtn} onClick={onBrowseRecipes} disabled={recipes.length === 0}>
        📖 {recipes.length === 0 ? 'Aucune recette dans le carnet' : 'Choisir une recette du carnet'}
      </button>
    </div>
  )
}

// ── Sélecteur de recette (depuis une tâche de cuisine) ────────────────────────

function RecipePickerSheet({ recipes, onPick, onClose }: {
  recipes: Recipe[]
  onPick: (r: Recipe) => void
  onClose: () => void
}) {
  const groups = MEAL_TYPES
    .map(t => ({ meta: mealMeta(t), items: recipes.filter(r => r.meal_type === t) }))
    .filter(g => g.items.length > 0)

  return (
    <SlideUpModal title="Choisir une recette" onClose={onClose}>
      <div className={styles.pickList}>
        {groups.map(({ meta, items }) => (
          <div key={meta.label} className={styles.detailBlock}>
            <span className={styles.label}>{meta.emoji} {meta.label}</span>
            {items.map(r => (
              <button key={r.id} className={styles.pickBtn} onClick={() => onPick(r)}>
                {r.title}
                <span className={styles.points} style={{ marginLeft: 'auto' }}>+{r.points} pts</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </SlideUpModal>
  )
}

// ── Fiche de détail d'une tâche (consignes + étapes partagées) ────────────────

interface DetailProps {
  chore: Chore
  assignment: ChoreAssignment
  done: boolean
  log?: ChoreLog | null
  recipes?: Recipe[]
  linkedRecipe?: Recipe | null
  onOpenRecipe?: (r: Recipe) => void
  onBrowseRecipes?: () => void
  canPickDoer?: boolean
  onToggleStep: (stepsDone: number[]) => void
  onMarkDone: () => void
  onMarkDoneBy?: () => void
  onSkip: () => void
  onResume: () => void
  onUndo: () => void
  onClose: () => void
}

function TaskDetailSheet({ chore, assignment, done, log, recipes = [], linkedRecipe, canPickDoer, onOpenRecipe, onBrowseRecipes, onToggleStep, onMarkDone, onMarkDoneBy, onSkip, onResume, onUndo, onClose }: DetailProps) {
  const addProof = useAddChoreProof()
  const { data: proofUrl } = useChoreProofUrl(log?.photo_path ?? null)
  // Bonus « tâche détestée » crédité sur ce pointage (visible dans le détail).
  const realLogId = log && !log.id.startsWith('opt-') ? log.id : null
  const { data: dislikeBonus = 0 } = useQuery({
    queryKey: ['chore-dislike-bonus', realLogId],
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase
        .from('point_events')
        .select('points')
        .eq('ref_type', 'dislike_bonus')
        .eq('ref_id', realLogId!)
      if (error) throw error
      return ((data ?? []) as { points: number }[]).reduce((s, e) => s + e.points, 0)
    },
    enabled: done && !!realLogId,
  })
  const proofInputRef = useRef<HTMLInputElement>(null)
  const doneSet = new Set(assignment.steps_done)
  function toggle(i: number) {
    const next = new Set(doneSet)
    if (next.has(i)) next.delete(i); else next.add(i)
    onToggleStep([...next].sort((a, b) => a - b))
  }
  const completed = chore.steps.filter((_, i) => doneSet.has(i)).length

  return (
    <SlideUpModal title={`${chore.emoji} ${chore.name}`} onClose={onClose}>
      <div className={styles.detail}>
        <span className={styles.points}>
          +{chore.points} pts
          {chore.mental_load && <span className={styles.rotBadge} style={{ marginLeft: 8 }}>🧠 charge mentale</span>}
        </span>
        {done && dislikeBonus > 0 && (
          <span className={styles.tendencyHint}>😖→😌 +{dislikeBonus} pts de bonus : tâche détestée par l'autre, faite quand même. Chapeau.</span>
        )}

        {linkedRecipe && onOpenRecipe && (
          <button type="button" className={styles.recipeLinkBtn} onClick={() => onOpenRecipe(linkedRecipe)}>
            📖 Voir la recette — {linkedRecipe.title}
          </button>
        )}

        {categoryOf(chore.category).value === 'cuisine' && onOpenRecipe && onBrowseRecipes && (
          <CuisineRecipeSection
            assignment={assignment}
            recipes={recipes}
            linkedRecipeId={chore.recipe_id}
            onOpenRecipe={onOpenRecipe}
            onBrowseRecipes={onBrowseRecipes}
          />
        )}

        {chore.instructions && (
          <div className={styles.detailBlock}>
            <span className={styles.label}>Consignes</span>
            <p className={styles.instructions}>{chore.instructions}</p>
          </div>
        )}

        {chore.steps.length > 0 && (
          <div className={styles.detailBlock}>
            <span className={styles.label}>Étapes · {completed}/{chore.steps.length}</span>
            <ul className={styles.stepList}>
              {chore.steps.map((s, i) => (
                <li key={i}>
                  <button type="button" className={[styles.stepItem, doneSet.has(i) ? styles.stepItemDone : ''].join(' ')} onClick={() => toggle(i)}>
                    <span className={styles.stepCheck}>{doneSet.has(i) ? <Check size={14} /> : i + 1}</span>
                    <span className={styles.stepText}>{s}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {done && log && !log.id.startsWith('opt-') && (
          <div className={styles.detailBlock}>
            <span className={styles.label}>Preuve photo</span>
            {proofUrl ? (
              <img src={proofUrl} className={styles.proofImg} alt="Preuve de la tâche réalisée" />
            ) : (
              <>
                <button type="button" className={styles.skipBtn} onClick={() => proofInputRef.current?.click()} disabled={addProof.isPending}>
                  <Camera size={15} /> {addProof.isPending ? 'Envoi…' : 'Ajouter une preuve'}
                </button>
                <input
                  ref={proofInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) addProof.mutate({ logId: log.id, file: f }); if (e.target) e.target.value = '' }}
                />
              </>
            )}
          </div>
        )}

        {done ? (
          <button className={styles.deleteBtn} onClick={onUndo}>Annuler « fait »</button>
        ) : assignment.status === 'skipped' ? (
          <button className={styles.submitBtn} onClick={onResume}>Reprendre la tâche</button>
        ) : (
          <>
            <button className={styles.submitBtn} onClick={onMarkDone}>Marquer fait</button>
            {/* Chemin explicite pour créditer quelqu'un d'autre : le tap rapide
                sur ✓ crédite toujours la personne connectée. */}
            {!assignment.member_id && canPickDoer && onMarkDoneBy && (
              <button className={styles.skipBtn} onClick={onMarkDoneBy}>
                <Users size={15} /> Marquer fait par…
              </button>
            )}
            <button className={styles.skipBtn} onClick={onSkip}>
              <SkipForward size={15} /> Passer aujourd'hui
            </button>
          </>
        )}
      </div>
    </SlideUpModal>
  )
}

// ── Modale « Tâche faite » (déclaratif à la volée) ────────────────────────────

interface AdHocProps {
  chores: Chore[]
  frequentChoreIds: string[]
  members: { id: string; display_name: string }[]
  defaultMemberId: string | null
  onClose: () => void
  onSubmit: (input: { chore_id: string | null; assignment_id: null; member_id: string; done_on: string; label: string | null; points: number | null }) => void
  onSaveAsChore: (input: NewChoreInput) => void
}

function AdHocModal({ chores, frequentChoreIds, members, defaultMemberId, onClose, onSubmit, onSaveAsChore }: AdHocProps) {
  const frequent = frequentChoreIds
    .map(id => chores.find(c => c.id === id))
    .filter((c): c is Chore => !!c)
  // Catalogue vide → saisie libre d'office (sinon useFree resterait false alors
  // que le select affiche « Autre » : on validerait un log fantôme sans libellé).
  const [choreId, setChoreId] = useState<string | null>(chores[0]?.id ?? '__free__')
  const [label, setLabel] = useState('')
  const [points, setPoints] = useState(10)
  const [memberId, setMemberId] = useState<string | null>(defaultMemberId)
  const [saveTemplate, setSaveTemplate] = useState(false)
  const useFree = choreId === '__free__'

  function submit() {
    if (!memberId) return
    if (useFree && !label.trim()) return
    if (useFree && saveTemplate) {
      onSaveAsChore({
        name: label.trim(), emoji: '✨', color: null, category: 'autre', points,
        frequency: 'none', frequency_days: null, start_date: null,
        rotation_member_ids: null, rotation_period: 'week', default_member_id: null,
        instructions: null, steps: [], recipe_id: null, mental_load: false,
      })
    }
    onSubmit({
      chore_id: useFree ? null : choreId,
      assignment_id: null,
      member_id: memberId,
      done_on: format(new Date(), 'yyyy-MM-dd'),
      label: useFree ? label.trim() : null,
      points: useFree ? points : null,
    })
  }

  return (
    <SlideUpModal title="Déclarer une tâche faite" onClose={onClose}>
      <div className={styles.form}>
        {frequent.length > 0 && (
          <div className={styles.field}>
            <span className={styles.label}>Les plus fréquentes</span>
            <div className={styles.chipRow}>
              {frequent.map(c => (
                <button type="button" key={c.id}
                  className={[styles.chip, choreId === c.id ? styles.chipActive : ''].join(' ')}
                  onClick={() => setChoreId(c.id)}>
                  {c.emoji} {c.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <label className={styles.field}>
          <span className={styles.label}>Tâche</span>
          <select className={styles.input} value={choreId ?? '__free__'} onChange={e => setChoreId(e.target.value)}>
            {chores.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.name} (+{c.points})</option>)}
            <option value="__free__">✏️ Autre (saisie libre)</option>
          </select>
        </label>
        {useFree && (
          <>
            <label className={styles.field}>
              <span className={styles.label}>Quoi ?</span>
              <input className={styles.input} value={label} onChange={e => setLabel(e.target.value)} placeholder="Ex. Réparé le vélo" autoFocus />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Points</span>
              <input className={styles.input} type="number" min={0} max={100} value={points}
                onChange={e => setPoints(Math.max(0, Math.min(100, Number(e.target.value) || 0)))} />
            </label>
            <label className={styles.checkRow}>
              <input type="checkbox" checked={saveTemplate} onChange={e => setSaveTemplate(e.target.checked)} />
              <span>Enregistrer aussi dans le catalogue (tâche à la demande)</span>
            </label>
          </>
        )}
        <div className={styles.field}>
          <span className={styles.label}>Par qui</span>
          <div className={styles.chipRow}>
            {members.map(m => (
              <button type="button" key={m.id}
                className={[styles.chip, memberId === m.id ? styles.chipActive : ''].join(' ')}
                onClick={() => setMemberId(m.id)}>{m.display_name}</button>
            ))}
          </div>
        </div>
        <button className={styles.submitBtn} onClick={submit}>Valider</button>
      </div>
    </SlideUpModal>
  )
}
