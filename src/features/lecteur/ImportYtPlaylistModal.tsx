import { useState } from 'react'
import type { FormEvent } from 'react'
import SlideUpModal from '../../components/SlideUpModal'
import Spinner from '../../components/Spinner'
import { useImportYtPlaylist, parseYtPlaylistId } from './useLecteur'
import styles from './LecteurPage.module.css'

/** Import d'une playlist YouTube entière (URL ou id) en liste de lecture. */
export default function ImportYtPlaylistModal({ onClose }: { onClose: () => void }) {
  const importPl = useImportYtPlaylist()
  const [val, setVal] = useState('')
  const [err, setErr] = useState<string | null>(null)

  function submit(e: FormEvent) {
    e.preventDefault()
    const id = parseYtPlaylistId(val)
    if (!id) { setErr('Colle une URL de playlist YouTube (avec ?list=…) ou son id.'); return }
    setErr(null)
    importPl.mutate(id, { onSuccess: onClose })
  }

  return (
    <SlideUpModal title="Importer une playlist YouTube" onClose={onClose}>
      <form onSubmit={submit} className={styles.ytSearchForm}>
        <input
          className={styles.input}
          value={val}
          onChange={e => setVal(e.target.value)}
          placeholder="https://youtube.com/playlist?list=…"
          aria-label="URL de la playlist YouTube"
          autoFocus
        />
        <button type="submit" className={styles.ytSearchBtn} disabled={importPl.isPending || !val.trim()}>
          {importPl.isPending ? <Spinner size={14} /> : 'Importer'}
        </button>
      </form>
      {err && <p className={styles.ytError}>{err}</p>}
      <p className={styles.jukeboxHint}>
        Chaque vidéo devient un morceau de la bibliothèque (les vidéos déjà présentes sont réutilisées). Playlists publiques ou non répertoriées uniquement, 200 morceaux max.
      </p>
    </SlideUpModal>
  )
}
