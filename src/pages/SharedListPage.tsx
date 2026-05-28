import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { MapPin } from 'lucide-react'
import { CATEGORIES, getCategoryEmoji, formatPrice } from '../features/groceries/groceries.utils'
import styles from './SharedListPage.module.css'

interface SharedItem {
  name: string
  quantity: string | null
  price: number | null
  category: string | null
  store: string | null
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_KEY  = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string

const CATEGORY_ORDER = CATEGORIES.map(c => c.key)

export default function SharedListPage() {
  const { token } = useParams<{ token: string }>()
  const [items, setItems] = useState<SharedItem[] | null>(null)
  const [listName, setListName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) { setLoading(false); setError('Token manquant'); return }
    fetch(`${SUPABASE_URL}/functions/v1/share-list-read?token=${token}`, {
      headers: { apikey: SUPABASE_KEY },
    })
      .then(r => r.json() as Promise<{ items?: SharedItem[]; list_name?: string | null; error?: string }>)
      .then(data => {
        if (data.error) setError(data.error)
        else { setItems(data.items ?? []); setListName(data.list_name ?? null) }
      })
      .catch(() => setError('Impossible de charger la liste'))
      .finally(() => setLoading(false))
  }, [token])

  if (loading) {
    return <div className={styles.page}><p className={styles.msg}>Chargement…</p></div>
  }

  if (error) {
    return (
      <div className={styles.page}>
        <p className={styles.errorEmoji}>🔗</p>
        <p className={styles.msg}>Lien invalide ou expiré.</p>
      </div>
    )
  }

  // Group by category following CATEGORY_ORDER, uncategorised last
  const catMap = new Map<string | null, SharedItem[]>()
  for (const item of items ?? []) {
    const k = item.category && CATEGORY_ORDER.includes(item.category as typeof CATEGORIES[number]['key']) ? item.category : null
    if (!catMap.has(k)) catMap.set(k, [])
    catMap.get(k)!.push(item)
  }
  const groups: Array<{ label: string | null; catItems: SharedItem[] }> = []
  for (const key of CATEGORY_ORDER) {
    if (catMap.has(key)) groups.push({ label: key, catItems: catMap.get(key)! })
  }
  if (catMap.has(null)) groups.push({ label: null, catItems: catMap.get(null)! })

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>🛒 {listName ?? 'Liste de courses'}</h1>

      {items?.length === 0 ? (
        <p className={styles.empty}>La liste est vide pour l'instant.</p>
      ) : (
        groups.map(({ label, catItems }) => (
          <div key={label ?? '__none'}>
            {label && (
              <div className={styles.catHeader}>
                {getCategoryEmoji(label)} {label}
              </div>
            )}
            <ul className={styles.list}>
              {catItems.map((item, i) => (
                <li key={i} className={styles.item}>
                  <div className={styles.itemBody}>
                    <span className={styles.itemName}>{item.name}</span>
                    {item.quantity && <span className={styles.itemQty}>×{item.quantity}</span>}
                    {item.store && (
                      <span className={styles.itemStore}>
                        <MapPin size={10} strokeWidth={2.5} />
                        {item.store}
                      </span>
                    )}
                  </div>
                  {item.price !== null && (
                    <span className={styles.itemPrice}>{formatPrice(item.price)}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))
      )}

      <p className={styles.footer}>Partagé via Familia · lecture seule · valable 7 jours</p>
    </div>
  )
}
