import { Link } from 'react-router-dom'
import { ListChecks, ShoppingCart, Wallet } from 'lucide-react'
import { fmtEur } from '../features/kakebo/kakebo.utils'
import type { ChoresDial, GroceryDial, BudgetDial } from './useHomeDigest'
import styles from './HomeDials.module.css'

interface Props {
  chores: ChoresDial
  groceries: GroceryDial
  budget: BudgetDial
  /** Objectif d'épargne mensuel du foyer, pour la jauge Budget. */
  savingGoal: number | null
}

function Ring({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? done / total : 0
  const r = 18
  const c = 2 * Math.PI * r
  return (
    <svg className={styles.ring} viewBox="0 0 44 44" role="img" aria-label={`${done} sur ${total} faites`}>
      <circle cx="22" cy="22" r={r} className={styles.ringTrack} />
      <circle
        cx="22" cy="22" r={r}
        className={styles.ringFill}
        strokeDasharray={`${c * pct} ${c}`}
        /* Départ à midi plutôt qu'à 3h. */
        transform="rotate(-90 22 22)"
      />
      <text x="22" y="22" className={styles.ringText}>{total > 0 ? `${done}/${total}` : '—'}</text>
    </svg>
  )
}

/**
 * Les trois compteurs du foyer. Volontairement peu de chiffres : un par tuile,
 * plus une ligne de contexte qui dit ce que le chiffre implique.
 *
 * Courses et Budget se répondent : le total estimé de la liste n'a de sens
 * qu'en regard de ce qui reste à dépenser dans le mois.
 */
export default function HomeDials({ chores, groceries, budget, savingGoal }: Props) {
  const goalPct = savingGoal && savingGoal > 0
    ? Math.max(0, Math.min(1, budget.left / savingGoal))
    : null

  return (
    <div className={styles.dials}>

      {/* ── Tâches ── */}
      <Link to="/chores" className={styles.dial}>
        <div className={styles.dialHead}>
          <ListChecks size={14} strokeWidth={2.5} aria-hidden="true" />
          <span>Tâches</span>
        </div>
        <Ring done={chores.todayDone} total={chores.todayTotal} />
        <p className={styles.dialSub}>
          {chores.overdue > 0
            ? <span className={styles.warn}>{chores.overdue} en retard</span>
            : chores.todayTotal === 0
            ? 'rien de prévu'
            : chores.todayDone >= chores.todayTotal
            ? 'journée bouclée'
            : `${chores.todayTotal - chores.todayDone} à faire`}
        </p>
      </Link>

      {/* ── Courses ── */}
      <Link to="/groceries" className={styles.dial}>
        <div className={styles.dialHead}>
          <ShoppingCart size={14} strokeWidth={2.5} aria-hidden="true" />
          <span>Courses</span>
        </div>
        <p className={styles.dialValue}>
          {groceries.count}
          <span className={styles.dialUnit}>article{groceries.count > 1 ? 's' : ''}</span>
        </p>
        <p className={styles.dialSub}>
          {groceries.count === 0
            ? 'liste vide'
            : groceries.hasPrices
            ? <>~{fmtEur(groceries.total)} €{groceries.topStore ? ` · ${groceries.topStore}` : ''}</>
            : groceries.topStore ?? 'sans prix estimé'}
        </p>
      </Link>

      {/* ── Budget ── */}
      <Link to="/kakebo" className={[styles.dial, styles.dialWide].join(' ')}>
        <div className={styles.dialHead}>
          <Wallet size={14} strokeWidth={2.5} aria-hidden="true" />
          <span>Budget du mois</span>
        </div>
        <p className={[styles.dialValue, budget.left < 0 ? styles.negative : ''].join(' ')}>
          {budget.left >= 0 ? '+' : ''}{fmtEur(budget.left)}
          <span className={styles.dialUnit}>€ restants</span>
        </p>

        {goalPct !== null && (
          <div className={styles.track} aria-hidden="true">
            <div
              className={styles.fill}
              style={{
                width: `${goalPct * 100}%`,
                background: budget.left >= (savingGoal ?? 0) ? 'var(--positive)' : 'var(--accent)',
              }}
            />
          </div>
        )}

        <p className={styles.dialSub}>
          {budget.tightest
            ? budget.tightest.ratio >= 1
              ? <span className={styles.warn}>
                  {budget.tightest.name} dépassé de {fmtEur(budget.tightest.spent - budget.tightest.budget)} €
                </span>
              : <>
                  {budget.tightest.name} {Math.round(budget.tightest.ratio * 100)} %
                  {' · '}{fmtEur(budget.tightest.budget - budget.tightest.spent)} € dispo
                </>
            : savingGoal
            ? `objectif ${fmtEur(savingGoal)} €`
            : 'aucune enveloppe définie'}
        </p>
      </Link>

    </div>
  )
}
