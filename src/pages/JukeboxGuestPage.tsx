import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { Search, Plus, Check, PartyPopper, Music, ListMusic, Link as LinkIcon, ChevronsUp } from 'lucide-react'
import { decodeHtml } from '../lib/youtube'
import type { YtResult } from '../lib/youtube'
import styles from './JukeboxGuestPage.module.css'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_KEY  = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string
const NAME_KEY = 'familia-guest-name'

interface Track { id: string; title: string; by: string | null }
interface QueueLine { id: string; votes: number; title: string; by: string | null }
interface NowPlaying { id: string | null; title: string; by: string | null }

// Empreinte locale stable du votant invité (dédup côté serveur).
function guestVoterKey(): string {
  let k = localStorage.getItem('familia-guest-id')
  if (!k) { k = crypto.randomUUID(); localStorage.setItem('familia-guest-id', k) }
  return k
}

type Mode = 'search' | 'library'

export default function JukeboxGuestPage() {
  const { token } = useParams<{ token: string }>()
  const base = `${SUPABASE_URL}/functions/v1/jukebox`
  const searchBase = `${SUPABASE_URL}/functions/v1/yt-search`

  const [tracks, setTracks] = useState<Track[] | null>(null)
  const [queue, setQueue]   = useState<QueueLine[]>([])
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null)
  const [error, setError]   = useState<string | null>(token ? null : 'Lien manquant')
  const [loading, setLoading] = useState(!!token)
  const [name, setName]     = useState(() => localStorage.getItem(NAME_KEY) ?? '')

  const [mode, setMode]     = useState<Mode>('search')
  const [q, setQ]           = useState('')
  const [ytResults, setYtResults] = useState<YtResult[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchErr, setSearchErr] = useState<string | null>(null)
  const [showUrl, setShowUrl] = useState(false)
  const [urlVal, setUrlVal]   = useState('')

  const [justAdded, setJustAdded] = useState<Set<string>>(new Set())
  // Titre demandé pour chaque clé : sert à savoir quand le morceau a quitté la
  // file, donc quand le bouton « ajouté ✓ » doit redevenir disponible.
  const addedTitlesRef = useRef<Map<string, string>>(new Map())
  const [sending, setSending]     = useState<string | null>(null)
  const [voterKey] = useState(guestVoterKey)
  const [info, setInfo] = useState<string | null>(null)
  const [votedIds, setVotedIds] = useState<Set<string>>(new Set())
  const [voting, setVoting]     = useState<string | null>(null)

  async function vote(itemId: string) {
    if (voting || votedIds.has(itemId)) return
    setVoting(itemId)
    // Optimiste : marque voté tout de suite (le serveur dédoublonne de toute façon).
    setVotedIds(prev => new Set(prev).add(itemId))
    try {
      const r = await fetch(base, {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action: 'vote', queue_item_id: itemId, voter_key: voterKey }),
      })
      const data = await r.json() as { ok?: boolean }
      if (data.ok) loadState()
    } finally {
      setVoting(null)
    }
  }

  async function loadState() {
    try {
      const r = await fetch(`${base}?token=${token}`, { headers: { apikey: SUPABASE_KEY } })
      const data = await r.json() as { tracks?: Track[]; queue?: QueueLine[]; now?: NowPlaying | null; error?: string }
      if (data.error) setError(data.error)
      else {
        setTracks(data.tracks ?? [])
        setQueue(data.queue ?? [])
        setNowPlaying(data.now ?? null)
        // Un morceau qui a quitté la file (joué, retiré, refusé) redevient
        // demandable : sans ça, le bouton restait coché toute la soirée.
        const live = new Set((data.queue ?? []).map(qu => qu.title))
        setJustAdded(prev => {
          if (prev.size === 0) return prev
          const next = new Set(
            [...prev].filter(k => {
              const title = addedTitlesRef.current.get(k)
              return !title || live.has(title)
            }),
          )
          return next.size === prev.size ? prev : next
        })
      }
    } catch {
      setError('Impossible de charger la soirée')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!token) return
    // loadState est async : ses setState surviennent après await (polling), pas
    // de cascade de rendu synchrone.
    loadState()
    const t = setInterval(loadState, 8000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  // POST générique d'ajout à la file. `key` sert au feedback visuel "ajouté".
  async function add(key: string, payload: Record<string, unknown>, title?: string) {
    if (sending) return
    localStorage.setItem(NAME_KEY, name.trim())
    setSending(key)
    try {
      const r = await fetch(base, {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, guest_name: name.trim(), ...payload }),
      })
      const data = await r.json() as { ok?: boolean; pending?: boolean; error?: string }
      if (data.ok) {
        if (title) addedTitlesRef.current.set(key, title)
        setJustAdded(prev => new Set(prev).add(key))
        setInfo(data.pending
          ? 'Demande envoyée — en attente de validation du DJ 👌'
          : 'Ajouté à la file 🎉')
        loadState()
      } else if (data.error) {
        setSearchErr(data.error)
      }
    } finally {
      setSending(null)
    }
  }

  async function runSearch(e?: FormEvent) {
    e?.preventDefault()
    const query = q.trim()
    if (!query) return
    setSearching(true); setSearchErr(null)
    try {
      const r = await fetch(`${searchBase}?token=${token}&q=${encodeURIComponent(query)}`, {
        headers: { apikey: SUPABASE_KEY },
      })
      const data = await r.json() as { results?: YtResult[]; error?: string }
      if (data.error) setSearchErr(data.error)
      else setYtResults((data.results ?? []).map(x => ({ ...x, title: decodeHtml(x.title) })))
    } catch {
      setSearchErr('Recherche indisponible')
    } finally {
      setSearching(false)
    }
  }

  // La file renvoyée contient le morceau en cours de lecture (pas encore
  // « joué ») : on le retire de la liste « À suivre » quand il est identifié.
  const upcoming = useMemo(
    () => nowPlaying?.id ? queue.filter(qu => qu.id !== nowPlaying.id) : queue,
    [queue, nowPlaying],
  )

  const libFiltered = useMemo(() => {
    const term = q.trim().toLowerCase()
    return (tracks ?? []).filter(t => !term || t.title.toLowerCase().includes(term))
  }, [tracks, q])

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
        <p className={styles.sub}>Cherche un morceau, il rejoint la file de la soirée.</p>
      </header>

      <input
        className={styles.nameInput}
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Ton prénom (pour qu'on sache qui demande)"
        aria-label="Ton prénom"
        maxLength={40}
      />

      {nowPlaying && (
        <div className={styles.nowBox}>
          <span className={styles.nowIcon} aria-hidden="true">🎶</span>
          <span className={styles.nowText}>
            <span className={styles.nowLabel}>En cours</span>
            <span className={styles.nowTitle}>{nowPlaying.title}</span>
            {nowPlaying.by && <span className={styles.nowBy}>demandé par {nowPlaying.by}</span>}
          </span>
        </div>
      )}

      {upcoming.length > 0 && (
        <div className={styles.queueBox}>
          <div className={styles.queueHead}>À suivre · {upcoming.length}</div>
          <ol className={styles.queueList}>
            {upcoming.slice(0, 8).map(qu => (
              <li key={qu.id} className={styles.queueLine}>
                <span className={styles.queueLineText}>
                  {qu.title}{qu.by ? <span className={styles.queueBy}> · {qu.by}</span> : null}
                </span>
                <button
                  className={[styles.voteBtn, votedIds.has(qu.id) ? styles.voteBtnDone : ''].join(' ')}
                  onClick={() => vote(qu.id)}
                  disabled={voting === qu.id || votedIds.has(qu.id)}
                  aria-label={`Voter pour ${qu.title}`}
                >
                  <ChevronsUp size={14} strokeWidth={2.5} />
                  {qu.votes > 0 && <span className={styles.voteNum}>{qu.votes}</span>}
                </button>
              </li>
            ))}
            {upcoming.length > 8 && <li className={styles.queueMore}>+{upcoming.length - 8} autres…</li>}
          </ol>
        </div>
      )}

      {/* Sélecteur de source */}
      <div className={styles.modeRow}>
        <button
          className={[styles.modeBtn, mode === 'search' ? styles.modeBtnActive : ''].join(' ')}
          onClick={() => setMode('search')}
        >
          <Music size={15} strokeWidth={2.5} /> YouTube
        </button>
        <button
          className={[styles.modeBtn, mode === 'library' ? styles.modeBtnActive : ''].join(' ')}
          onClick={() => setMode('library')}
        >
          <ListMusic size={15} strokeWidth={2.5} /> Bibliothèque
        </button>
      </div>

      {/* Barre de recherche (commune : YouTube ou filtre bibliothèque) */}
      <form
        onSubmit={mode === 'search' ? runSearch : (e => e.preventDefault())}
        className={styles.searchWrap}
      >
        <Search size={15} strokeWidth={2} className={styles.searchIcon} />
        <input
          type="search"
          className={styles.searchInput}
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder={mode === 'search' ? 'Rechercher sur YouTube…' : 'Filtrer la bibliothèque…'}
          aria-label="Rechercher"
        />
        {mode === 'search' && (
          <button type="submit" className={styles.goBtn} disabled={searching || !q.trim()}>
            {searching ? '…' : 'OK'}
          </button>
        )}
      </form>

      {searchErr && <p className={styles.errLine}>{searchErr}</p>}
      {info && <p className={styles.infoLine}>{info}</p>}

      {/* Résultats */}
      {mode === 'search' ? (
        <ul className={styles.trackList}>
          {(ytResults ?? []).map(r => {
            const added = justAdded.has(r.videoId)
            return (
              <li key={r.videoId} className={styles.track}>
                {r.thumbnail && <img src={r.thumbnail} alt="" className={styles.ytThumb} loading="lazy" />}
                <div className={styles.trackBody}>
                  <span className={styles.trackTitle}>{r.title}</span>
                  <span className={styles.trackBy}>{r.channel}</span>
                </div>
                <button
                  className={[styles.addBtn, added ? styles.addBtnDone : ''].join(' ')}
                  onClick={() => add(r.videoId, { external_url: `https://youtu.be/${r.videoId}`, title: r.title }, r.title)}
                  disabled={sending === r.videoId || added}
                  aria-label={`Demander ${r.title}`}
                >
                  {added ? <Check size={16} strokeWidth={3} /> : <Plus size={16} strokeWidth={2.5} />}
                </button>
              </li>
            )
          })}
          {ytResults && ytResults.length === 0 && !searching && <p className={styles.msg}>Aucun résultat.</p>}
          {!ytResults && !searching && <p className={styles.msg}>Tape un titre puis « OK ».</p>}
        </ul>
      ) : (
        <ul className={styles.trackList}>
          {libFiltered.map(track => {
            const added = justAdded.has(track.id)
            return (
              <li key={track.id} className={styles.track}>
                <div className={styles.trackBody}>
                  <span className={styles.trackTitle}>{track.title}</span>
                  {track.by && <span className={styles.trackBy}>{track.by}</span>}
                </div>
                <button
                  className={[styles.addBtn, added ? styles.addBtnDone : ''].join(' ')}
                  onClick={() => add(track.id, { media_file_id: track.id }, track.title)}
                  disabled={sending === track.id || added}
                  aria-label={`Demander ${track.title}`}
                >
                  {added ? <Check size={16} strokeWidth={3} /> : <Plus size={16} strokeWidth={2.5} />}
                </button>
              </li>
            )
          })}
          {libFiltered.length === 0 && <p className={styles.msg}>Aucun morceau dans la bibliothèque.</p>}
        </ul>
      )}

      {/* Coller un lien (option) */}
      <button className={styles.urlToggle} onClick={() => setShowUrl(v => !v)}>
        <LinkIcon size={13} strokeWidth={2.5} /> {showUrl ? 'Masquer' : 'Coller un lien YouTube / Spotify'}
      </button>
      {showUrl && (
        <form
          className={styles.urlForm}
          onSubmit={e => { e.preventDefault(); if (urlVal.trim()) { add(urlVal.trim(), { external_url: urlVal.trim() }); setUrlVal('') } }}
        >
          <input
            className={styles.searchInput}
            value={urlVal}
            onChange={e => setUrlVal(e.target.value)}
            placeholder="https://youtu.be/… ou open.spotify.com/…"
            aria-label="Coller un lien"
          />
          <button type="submit" className={styles.goBtn} disabled={!urlVal.trim()}>Ajouter</button>
        </form>
      )}

      <p className={styles.footer}>Familia · file de soirée · le lien expire bientôt</p>
    </div>
  )
}
