import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { format, addDays, startOfWeek, subDays } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Plus, Check, Undo2, Pencil, Trash2 } from 'lucide-react'
import Spinner from '../../components/Spinner'
import EmptyState from '../../components/EmptyState'
import SlideUpModal from '../../components/SlideUpModal'
import { useMember } from '../../auth/useMember'
import { memberColor } from '../../lib/constants'
import {
  useChores, useChoreAssignments, useRecentChoreLogs, useHouseholdMembers,
  useAddChore, useEditChore, useDeleteChore,
  useMaterializeAssignments, useLogChore, useUndoChoreLog, useToggleStep,
} from './useChores'
import type { Chore, ChoreAssignment } from './useChores'
import { useChoresRealtime } from './useChoresRealtime'
import { isApplicable, dueMemberFor, weekDates } from './chores.utils'
import { categoryOf } from './categories'
import ChoreForm from './ChoreForm'
import ProgressionTab from './ProgressionTab'
import RewardsTab from './RewardsTab'
import { useRecipes } from '../recipes/useRecipes'
import type { Recipe } from '../recipes/useRecipes'
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
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }))
  const days = useMemo(() => weekDates(weekStart), [weekStart])
  const from = days[0], to = days[6]

  const { data: assignments = [] } = useChoreAssignments(from, to)
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
  const toggleStep = useToggleStep()
  const { data: recipes = [] } = useRecipes()
  const recipeById = useMemo(() => new Map(recipes.map(r => [r.id, r])), [recipes])

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

  function markDone(assignmentId: string, chore: Chore, assignedMemberId: string | null) {
    const memberId = assignedMemberId ?? currentMember?.id
    if (!memberId) return
    logChore.mutate({ chore_id: chore.id, assignment_id: assignmentId, member_id: memberId, done_on: effectiveDay })
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link to="/" className={styles.backLink} aria-label="Accueil"><ChevronLeft size={24} /></Link>
        <h1 className={styles.pageTitle}>Tâches</h1>
        <div className={styles.headerActions}>
          {tab === 'todo' && (
            <button className={styles.statsBtn} onClick={() => setAdHocOpen(true)}>
              <Plus size={15} /> Tâche faite
            </button>
          )}
          {tab === 'catalog' && (
            <button className={styles.statsBtn} onClick={() => { setEditing(null); setFormOpen(true) }}>
              <Plus size={15} /> Tâche
            </button>
          )}
        </div>
      </header>

      <div className={styles.tabs}>
        <button className={[styles.tab, tab === 'todo' ? styles.tabActive : ''].join(' ')} onClick={() => setTab('todo')}>À faire</button>
        <button className={[styles.tab, tab === 'progress' ? styles.tabActive : ''].join(' ')} onClick={() => setTab('progress')}>Progression</button>
        <button className={[styles.tab, tab === 'rewards' ? styles.tabActive : ''].join(' ')} onClick={() => setTab('rewards')}>Récompenses</button>
        <button className={[styles.tab, tab === 'catalog' ? styles.tabActive : ''].join(' ')} onClick={() => setTab('catalog')}>Catalogue</button>
      </div>

      {isLoading ? <Spinner /> : tab === 'progress' ? (
        <ProgressionTab members={members} chores={chores} logs={logs} />
      ) : tab === 'rewards' ? (
        <RewardsTab members={members} currentMemberId={currentMember?.id ?? null} />
      ) : tab === 'todo' ? (
        <>
          {/* Sélecteur de semaine + jours */}
          <div className={styles.weekNav}>
            <button onClick={() => setWeekStart(s => subDays(s, 7))} aria-label="Semaine précédente"><ChevronLeft size={20} /></button>
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
            <button onClick={() => setWeekStart(s => addDays(s, 7))} aria-label="Semaine suivante"><ChevronRight size={20} /></button>
          </div>

          {dayAssignments.length === 0 ? (
            <EmptyState emoji="🧹" title="Rien de prévu ce jour" description="Crée des tâches dans le Catalogue ou déclare une tâche faite." />
          ) : (
            <ul className={styles.list}>
              {dayAssignments.map(a => {
                const chore = choreById.get(a.chore_id)!
                const logId = logByAssignment.get(a.id)
                const done = a.status === 'done' || !!logId
                const assignee = a.member_id ? members.find(m => m.id === a.member_id) : null
                const color = a.member_id ? memberColorById.get(a.member_id) : 'var(--accent)'
                const hasDetail = !!chore.instructions || chore.steps.length > 0
                const stepsTotal = chore.steps.length
                const stepsDone = a.steps_done.filter(i => i < stepsTotal).length
                return (
                  <li key={a.id} className={[styles.row, done ? styles.rowDone : ''].join(' ')}>
                    <button className={styles.rowOpen} onClick={() => setDetailId(a.id)}>
                      <span className={styles.rowEmoji} style={{ background: (chore.color ?? categoryOf(chore.category).color) + '22' }}>{chore.emoji}</span>
                      <div className={styles.rowMain}>
                        <span className={styles.rowName}>{chore.name}</span>
                        <span className={styles.rowMeta}>
                          {assignee && <span className={styles.assignee} style={{ color }}>{assignee.display_name}</span>}
                          <span className={styles.points}>+{chore.points} pts</span>
                          {stepsTotal > 0 && <span className={styles.rotBadge}>{stepsDone}/{stepsTotal} étapes</span>}
                          {hasDetail && stepsTotal === 0 && <span className={styles.rotBadge}>consignes</span>}
                        </span>
                      </div>
                    </button>
                    {done ? (
                      <button className={styles.undoBtn} disabled={!logId || logId.startsWith('opt-')} onClick={() => logId && !logId.startsWith('opt-') && undoLog.mutate(logId)} aria-label="Annuler">
                        <Undo2 size={16} />
                      </button>
                    ) : (
                      <button className={styles.doneBtn} onClick={() => markDone(a.id, chore, a.member_id)} aria-label="Marquer fait">
                        <Check size={18} />
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </>
      ) : (
        // ── Catalogue ──────────────────────────────────────────────────────────
        chores.length === 0 ? (
          <EmptyState emoji="✨" title="Aucune tâche" description="Crée ta première tâche familiale." />
        ) : (
          <ul className={styles.list}>
            {chores.map(chore => {
              const cat = categoryOf(chore.category)
              const rot = chore.rotation_member_ids && chore.rotation_member_ids.length > 0
              return (
                <li key={chore.id} className={styles.row}>
                  <span className={styles.rowEmoji} style={{ background: (chore.color ?? cat.color) + '22' }}>{chore.emoji}</span>
                  <div className={styles.rowMain}>
                    <span className={styles.rowName}>{chore.name}</span>
                    <span className={styles.rowMeta}>
                      <span>{cat.label}</span>
                      <span className={styles.points}>+{chore.points} pts</span>
                      {rot && <span className={styles.rotBadge}>rotation</span>}
                    </span>
                  </div>
                  <button className={styles.iconBtn} onClick={() => { setEditing(chore); setFormOpen(true) }} aria-label="Modifier"><Pencil size={16} /></button>
                  <button className={styles.iconBtn} onClick={() => { if (confirm(`Supprimer « ${chore.name} » ? Les points déjà gagnés sont conservés.`)) deleteChore.mutate(chore.id) }} aria-label="Supprimer"><Trash2 size={16} /></button>
                </li>
              )
            })}
          </ul>
        )
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
        const a = dayAssignments.find(x => x.id === detailId)
        const chore = a ? choreById.get(a.chore_id) : undefined
        if (!a || !chore) return null
        const logId = logByAssignment.get(a.id)
        const done = a.status === 'done' || !!logId
        return (
          <TaskDetailSheet
            chore={chore} assignment={a} done={done}
            linkedRecipe={chore.recipe_id ? recipeById.get(chore.recipe_id) ?? null : null}
            onOpenRecipe={(r) => setRecipeView(r)}
            onToggleStep={(stepsDone) => toggleStep.mutate({ assignmentId: a.id, stepsDone })}
            onMarkDone={() => { markDone(a.id, chore, a.member_id); setDetailId(null) }}
            onUndo={() => { if (logId && !logId.startsWith('opt-')) undoLog.mutate(logId); setDetailId(null) }}
            onClose={() => setDetailId(null)}
          />
        )
      })()}

      {recipeView && (
        <RecipeDetailModal recipe={recipeView} showCooked={false} onClose={() => setRecipeView(null)} />
      )}

      {adHocOpen && (
        <AdHocModal
          chores={chores}
          members={members}
          defaultMemberId={currentMember?.id ?? null}
          onClose={() => setAdHocOpen(false)}
          onSubmit={(input) => { logChore.mutate(input); setAdHocOpen(false) }}
        />
      )}
    </div>
  )
}

// ── Fiche de détail d'une tâche (consignes + étapes partagées) ────────────────

interface DetailProps {
  chore: Chore
  assignment: ChoreAssignment
  done: boolean
  linkedRecipe?: Recipe | null
  onOpenRecipe?: (r: Recipe) => void
  onToggleStep: (stepsDone: number[]) => void
  onMarkDone: () => void
  onUndo: () => void
  onClose: () => void
}

function TaskDetailSheet({ chore, assignment, done, linkedRecipe, onOpenRecipe, onToggleStep, onMarkDone, onUndo, onClose }: DetailProps) {
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
        <span className={styles.points}>+{chore.points} pts</span>

        {linkedRecipe && onOpenRecipe && (
          <button type="button" className={styles.recipeLinkBtn} onClick={() => onOpenRecipe(linkedRecipe)}>
            📖 Voir la recette — {linkedRecipe.title}
          </button>
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

        {done
          ? <button className={styles.deleteBtn} onClick={onUndo}>Annuler « fait »</button>
          : <button className={styles.submitBtn} onClick={onMarkDone}>Marquer fait</button>}
      </div>
    </SlideUpModal>
  )
}

// ── Modale « Tâche faite » (déclaratif à la volée) ────────────────────────────

interface AdHocProps {
  chores: Chore[]
  members: { id: string; display_name: string }[]
  defaultMemberId: string | null
  onClose: () => void
  onSubmit: (input: { chore_id: string | null; assignment_id: null; member_id: string; done_on: string; label: string | null; points: number | null }) => void
}

function AdHocModal({ chores, members, defaultMemberId, onClose, onSubmit }: AdHocProps) {
  const [choreId, setChoreId] = useState<string | null>(chores[0]?.id ?? null)
  const [label, setLabel] = useState('')
  const [points, setPoints] = useState(10)
  const [memberId, setMemberId] = useState<string | null>(defaultMemberId)
  const useFree = choreId === '__free__'

  function submit() {
    if (!memberId) return
    if (useFree && !label.trim()) return
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
