import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Search, Plus, Check, PartyPopper } from 'lucide-react'
import styles from './JukeboxGuestPage.module.css'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_KEY  = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string
const NAME_KEY = 'familia-guest-name'

interface Track { id: string; title: string; by: string | null }
interface QueueLine { title: string; by: string | null }

export default function JukeboxGuestPage() {
  const { token } = useParams<{ token: string }>()
  const [tracks, setTracks] = useState<Track[] | null>(null)
  const [queue, setQueue]   = useState<QueueLine[]>([])
  const [error, setError]   = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [name, setName]     = useState(() => localStorage.getItem(NAME_KEY) ?? '')
  const [search, setSearch] = useState('')
  const [justAdded, setJustAdded] = useState<Set<string>>(new Set())
  const [sending, setSending] = useState<string | null>(null)

  const base = `${SUPABASE_URL}/functions/v1/jukebox`

  async function load() {
    try {
      const r = await fetch(`${base}?token=${token}`, { headers: { apikey: SUPABASE_KEY } })
      const data = await r.json() as { tracks?: Track[]; queue?: QueueLine[]; error?: string }
      if (data.error) setError(data.error)
      else { setTracks(data.tracks ?? []); setQueue(data.queue ?? []) }
    } catch {
      setError('Impossible de charger la soirée')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!token) { setLoading(false); setError('Lien manquant'); return }
    load()
    const t = setInterval(load, 8000) // rafraîchit la file régulièrement
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  async function request(track: Track) {
    if (sending) return
    localStorage.setItem(NAME_KEY, name.trim())
    setSending(track.id)
    try {
      const r = await fetch(base, {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, media_file_id: track.id, guest_name: name.trim() }),
      })
      const data = await r.json() as { ok?: boolean; error?: string }
      if (data.ok) {
        setJustAdded(prev => new Set(prev).add(track.id))
        load()
      }
    } finally {
      setSending(null)
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (tracks ?? []).filter(t => !q || t.title.toLowerCase().includes(q))
  }, [tracks, search])

  if (loading) return <div className={styles.page}><p className={styles.msg}>Chargement…</p></div>
  if (error) {
    return (
      <div className={styles.page}>
        <p className={styles.bigEmoji}>🔗</p>
        <p className={styles.msg}>Lien invalide ou expiré.</p>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}><PartyPopper size={20} strokeWidth={2.5} /> Demande ta musique</h1>
        <p className={styles.sub}>Choisis un morceau, il rejoint la file de la soirée.</p>
      </header>

      <input
        className={styles.nameInput}
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Ton prénom (pour qu'on sache qui demande)"
        aria-label="Ton prénom"
        maxLength={40}
      />

      {queue.length > 0 && (
        <div className={styles.queueBox}>
          <div className={styles.queueHead}>À suivre · {queue.length}</div>
          <ol className={styles.queueList}>
            {queue.slice(0, 5).map((q, i) => (
              <li key={i}>{q.title}{q.by ? <span className={styles.queueBy}> · {q.by}</span> : null}</li>
            ))}
            {queue.length > 5 && <li className={styles.queueMore}>+{queue.length - 5} autres…</li>}
          </ol>
        </div>
      )}

      <div className={styles.searchWrap}>
        <Search size={15} strokeWidth={2} className={styles.searchIcon} />
        <input
          type="search"
          className={styles.searchInput}
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher un morceau…"
          aria-label="Rechercher un morceau"
        />
      </div>

      {filtered.length === 0 ? (
        <p className={styles.msg}>Aucun morceau.</p>
      ) : (
        <ul className={styles.trackList}>
          {filtered.map(track => {
            const added = justAdded.has(track.id)
            return (
              <li key={track.id} className={styles.track}>
                <div className={styles.trackBody}>
                  <span className={styles.trackTitle}>{track.title}</span>
                  {track.by && <span className={styles.trackBy}>{track.by}</span>}
                </div>
                <button
                  className={[styles.addBtn, added ? styles.addBtnDone : ''].join(' ')}
                  onClick={() => request(track)}
                  disabled={sending === track.id}
                  aria-label={`Demander ${track.title}`}
                >
                  {added
                    ? <Check size={16} strokeWidth={3} />
                    : <Plus size={16} strokeWidth={2.5} />}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <p className={styles.footer}>Familia · file de soirée · le lien expire bientôt</p>
    </div>
  )
}
