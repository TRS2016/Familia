import { useState } from 'react'
import type { FormEvent } from 'react'
import { Check, Plus } from 'lucide-react'
import SlideUpModal from '../../components/SlideUpModal'
import { supabase } from '../../lib/supabase'
import { decodeHtml } from '../../lib/youtube'
import type { YtResult } from '../../lib/youtube'
import styles from './LecteurPage.module.css'

const YT_ENV = {
  url: import.meta.env.VITE_SUPABASE_URL as string,
  key: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
}

// Recherche YouTube côté membre (la clé API reste dans l'Edge Function yt-search).
export default function YouTubeSearchModal({ onClose, onAdd }: {
  onClose: () => void
  onAdd: (r: YtResult) => void
}) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<YtResult[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [added, setAdded] = useState<Set<string>>(new Set())

  async function run(e?: FormEvent) {
    e?.preventDefault()
    const query = q.trim()
    if (!query) return
    setLoading(true); setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch(`${YT_ENV.url}/functions/v1/yt-search?q=${encodeURIComponent(query)}`, {
        headers: { apikey: YT_ENV.key, Authorization: `Bearer ${session?.access_token ?? ''}` },
      })
      const data = await r.json() as { results?: YtResult[]; error?: string }
      if (data.error) setError(data.error)
      else setResults((data.results ?? []).map(x => ({ ...x, title: decodeHtml(x.title) })))
    } catch {
      setError('Recherche indisponible')
    } finally {
      setLoading(false)
    }
  }

  return (
    <SlideUpModal title="Rechercher sur YouTube" onClose={onClose}>
      <form onSubmit={run} className={styles.ytSearchForm}>
        <input
          className={styles.input}
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Titre, artiste…"
          aria-label="Recherche YouTube"
          autoFocus
        />
        <button type="submit" className={styles.ytSearchBtn} disabled={loading || !q.trim()}>
          {loading ? '…' : 'Chercher'}
        </button>
      </form>
      {error && <p className={styles.ytError}>{error}</p>}
      {results && results.length === 0 && !loading && <p className={styles.jukeboxHint}>Aucun résultat.</p>}
      <ul className={styles.ytResults}>
        {(results ?? []).map(r => {
          const done = added.has(r.videoId)
          return (
            <li key={r.videoId} className={styles.ytItem}>
              {r.thumbnail && <img src={r.thumbnail} alt="" className={styles.ytThumb} loading="lazy" />}
              <div className={styles.ytItemBody}>
                <div className={styles.ytItemTitle}>{r.title}</div>
                <div className={styles.ytItemChannel}>{r.channel}</div>
              </div>
              <button
                className={[styles.addBtn2, done ? styles.addBtn2Done : ''].join(' ')}
                onClick={() => { onAdd(r); setAdded(p => new Set(p).add(r.videoId)) }}
                disabled={done}
                aria-label={`Ajouter ${r.title} à la bibliothèque`}
              >
                {done ? <Check size={16} strokeWidth={3} /> : <Plus size={16} strokeWidth={2.5} />}
              </button>
            </li>
          )
        })}
      </ul>
    </SlideUpModal>
  )
}
