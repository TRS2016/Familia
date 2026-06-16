import { Check } from 'lucide-react'
import { formatPrice } from './groceries.utils'
import styles from './GroceriesPage.module.css'

// Barre sticky de bas de page : en mode magasin, panier + budget + « Terminer » ;
// en mode liste, le total estimé restant.
export default function ShoppingBudgetBar({
  shoppingMode, hasAnyPrice, totalInCart, totalLeft,
  budget, setBudget, budgetNum, overBudget, budgetProgress,
  editingBudget, setEditingBudget, saveBudget, clearBudget,
  checkedCount, onFinish,
}: {
  shoppingMode: boolean
  hasAnyPrice: boolean
  totalInCart: number
  totalLeft: number
  budget: string
  setBudget: (v: string) => void
  budgetNum: number | null
  overBudget: boolean
  budgetProgress: number | null
  editingBudget: boolean
  setEditingBudget: (v: boolean) => void
  saveBudget: () => void
  clearBudget: () => void
  checkedCount: number
  onFinish: () => void
}) {
  return (
    <div className={[styles.totalBar, shoppingMode ? styles.totalBarShopping : ''].join(' ')}>
      {shoppingMode ? (
        <div className={styles.shoppingBarInner}>
          {hasAnyPrice && (
            <>
              <div className={styles.shoppingBarTop}>
                <div className={styles.shoppingCartBlock}>
                  <span className={styles.shoppingCartLabel}>Panier</span>
                  <span className={styles.shoppingCartAmount}>{formatPrice(totalInCart)}</span>
                </div>
                {budgetNum ? (
                  <div className={[styles.shoppingBudgetBlock, overBudget ? styles.overBudget : ''].join(' ')}>
                    <span className={styles.shoppingBudgetLabel}>Budget</span>
                    <span className={styles.shoppingBudgetAmount}>{formatPrice(budgetNum)}</span>
                  </div>
                ) : totalLeft > 0 ? (
                  <span className={styles.shoppingRemainder}>≈ {formatPrice(totalLeft)} restant</span>
                ) : null}
              </div>
              {budgetProgress !== null && (
                <div className={styles.budgetTrack}>
                  <div
                    className={styles.budgetFill}
                    style={{ width: `${budgetProgress * 100}%`, background: overBudget ? 'var(--danger)' : 'var(--positive)' }}
                  />
                </div>
              )}
              <div className={styles.budgetEditRow}>
                {editingBudget ? (
                  <form onSubmit={e => { e.preventDefault(); saveBudget() }} className={styles.budgetForm}>
                    <input
                      type="text" inputMode="decimal" value={budget}
                      onChange={e => setBudget(e.target.value)}
                      placeholder="Budget en €" aria-label="Budget en euros" className={styles.budgetInput} autoFocus
                    />
                    <button type="submit" className={styles.budgetSaveBtn}>OK</button>
                    {budget && (
                      <button type="button" className={styles.budgetClearBtn} onClick={clearBudget}>Supprimer</button>
                    )}
                  </form>
                ) : (
                  <button className={styles.budgetEditBtn} onClick={() => setEditingBudget(true)}>
                    {budget ? `Budget : ${formatPrice(parseFloat(budget.replace(',', '.')))}  ✎` : '+ Définir un budget'}
                  </button>
                )}
              </div>
            </>
          )}
          <button
            className={styles.finishShoppingBtn}
            onClick={onFinish}
            disabled={checkedCount === 0}
          >
            <Check size={16} strokeWidth={2.5} />
            Terminer les courses{checkedCount > 0 ? ` · ${checkedCount}` : ''}
          </button>
        </div>
      ) : (
        <>
          <span className={styles.totalLabel}>Total estimé</span>
          <span className={styles.totalAmount}>{formatPrice(totalLeft)}</span>
        </>
      )}
    </div>
  )
}
