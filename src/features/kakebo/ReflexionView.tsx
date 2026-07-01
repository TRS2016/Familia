import { fmtEur, catColor } from './kakebo.utils'
import type { KakeboCategory } from './useKakebo'
import styles from './KakeboPage.module.css'

export default function ReflexionView({
  epargneReelle, objectifEpargne, solde, categories, totalByCategory,
}: {
  epargneReelle: number; objectifEpargne: number; solde: number
  categories: KakeboCategory[]
  totalByCategory: Record<string, number>
}) {
  const questions = [
    'Combien d\'argent ai-je en ce moment ?',
    'Combien d\'argent voudrais-je épargner ?',
    'Combien d\'argent ai-je dépensé ?',
    'Comment puis-je améliorer mes dépenses ?',
  ]
  const qColors = ['var(--accent)', 'var(--positive)', 'var(--accent)', 'var(--chart-violet)']
  const positif = solde >= 0

  return (
    <div className={styles.scrollArea}>
      <div className={styles.quoteCard}>
        <span className={styles.quoteGlyph}>"</span>
        <p className={styles.quoteText}>
          Le Kakebo est un journal de bord financier qui vous invite à réfléchir consciemment à votre rapport à l'argent.
        </p>
        <p className={styles.quoteAuthor}>— HANI MOTOKO · 1904</p>
      </div>

      <p className={styles.sectionLabel}>Les 4 questions du mois</p>

      {questions.map((q, i) => (
        <div key={i} className={styles.questionCard} style={{ borderLeftColor: qColors[i] }}>
          <div className={styles.questionTop}>
            <span className={styles.questionNum} style={{ color: qColors[i] }}>{i + 1}</span>
            <p className={styles.questionText}>{q}</p>
          </div>
          {i === 0 && <p className={styles.questionAnswer} style={{ color: positif ? '#5B9E8F' : '#E07B54' }}>{fmtEur(epargneReelle)} €</p>}
          {i === 1 && <p className={styles.questionAnswer}>{fmtEur(objectifEpargne)} €</p>}
          {i === 2 && (
            <div className={styles.questionCats}>
              {categories.map(cat => (
                <div key={cat.id} className={styles.questionCatRow}>
                  <span className={styles.catDot} style={{ background: catColor(cat) }} />
                  <span className={styles.questionCatName}>{cat.name}</span>
                  <span className={styles.questionCatVal}>{fmtEur(totalByCategory[cat.id] ?? 0)} €</span>
                </div>
              ))}
            </div>
          )}
          {i === 3 && (
            <p className={styles.questionAnswer} style={{ color: 'var(--text-sub)', fontSize: 12 }}>
              {positif
                ? `Bravo — vous avez épargné ${fmtEur(solde)} € de plus que votre objectif.`
                : `Vous dépassez votre objectif de ${fmtEur(Math.abs(solde))} €. Quelles dépenses pourriez-vous réduire ?`
              }
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
