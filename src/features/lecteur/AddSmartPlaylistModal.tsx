import { useState } from 'react'
import type { FormEvent } from 'react'
import SlideUpModal from '../../components/SlideUpModal'
import { memberColor } from '../../lib/constants'
import { applyLecteurFilters, useAddLecteurPlaylist } from './useLecteur'
import type { LecteurSmartFilters, MediaFile, MediaFileKind } from './useLecteur'
import { KIND_META } from './lecteur.utils'
import styles from './LecteurPage.module.css'

// Création d'une smart liste (filtres dynamiques + aperçu du résultat).
export default function AddSmartPlaylistModal({ files, members, onClose }: {
  files: MediaFile[]
  members: { id: string; display_name: string }[]
  onClose: () => void
}) {
  const addPlaylist = useAddLecteurPlaylist()
  const [name,    setName]    = useState('')
  const [filters, setFilters] = useState<LecteurSmartFilters>({})

  const allTags = (() => {
    const set = new Set<string>()
    for (const f of files) for (const t of (f.tags ?? [])) set.add(t)
    return [...set].sort()
  })()

  const preview = applyLecteurFilters(files, filters)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    await addPlaylist.mutateAsync({ name, type: 'smart', smart_filters: filters })
    onClose()
  }

  return (
    <SlideUpModal title="Smart liste" onClose={onClose}>
      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.fieldGroup}>
          <label htmlFor="sp-name" className={styles.fieldLabel}>Nom</label>
          <input id="sp-name" type="text" value={name} autoFocus required
            onChange={e => setName(e.target.value)}
            className={styles.input} placeholder="Musique, Vidéos maison…" />
        </div>

        <div className={styles.smartSection}>
          <div className={styles.smartRow}>
            <span className={styles.smartLabel}>Type</span>
            <div className={styles.smartPills}>
              <button type="button"
                className={[styles.smartPill, !filters.kind ? styles.smartPillActive : ''].join(' ')}
                onClick={() => setFilters(f => ({ ...f, kind: undefined }))}>Tous</button>
              {(['audio', 'vidéo', 'lien'] as MediaFileKind[]).map(k => (
                <button key={k} type="button"
                  className={[styles.smartPill, filters.kind === k ? styles.smartPillActive : ''].join(' ')}
                  onClick={() => setFilters(f => ({ ...f, kind: f.kind === k ? undefined : k }))}>
                  {KIND_META[k].emoji} {KIND_META[k].label}
                </button>
              ))}
            </div>
          </div>

          {members.length > 1 && (
            <div className={styles.smartRow}>
              <span className={styles.smartLabel}>Membre</span>
              <div className={styles.smartPills}>
                <button type="button"
                  className={[styles.smartPill, !filters.member_id ? styles.smartPillActive : ''].join(' ')}
                  onClick={() => setFilters(f => ({ ...f, member_id: undefined }))}>Tous</button>
                {members.map((m, i) => (
                  <button key={m.id} type="button"
                    className={[styles.smartPill, filters.member_id === m.id ? styles.smartPillActive : ''].join(' ')}
                    style={filters.member_id === m.id ? { borderColor: memberColor(i), color: memberColor(i) } : {}}
                    onClick={() => setFilters(f => ({ ...f, member_id: f.member_id === m.id ? undefined : m.id }))}>
                    {m.display_name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {allTags.length > 0 && (
            <div className={styles.smartRow}>
              <span className={styles.smartLabel}>Tag</span>
              <div className={styles.smartPills}>
                <button type="button"
                  className={[styles.smartPill, !filters.tag ? styles.smartPillActive : ''].join(' ')}
                  onClick={() => setFilters(f => ({ ...f, tag: undefined }))}>Tous</button>
                {allTags.map(t => (
                  <button key={t} type="button"
                    className={[styles.smartPill, filters.tag === t ? styles.smartPillActive : ''].join(' ')}
                    onClick={() => setFilters(f => ({ ...f, tag: f.tag === t ? undefined : t }))}>
                    #{t}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className={styles.smartRow}>
            <span className={styles.smartLabel}>Favoris</span>
            <div className={styles.smartPills}>
              <button type="button"
                className={[styles.smartPill, filters.favorite ? styles.smartPillActive : ''].join(' ')}
                onClick={() => setFilters(f => ({ ...f, favorite: f.favorite ? undefined : true }))}>
                ★ Favoris uniquement
              </button>
            </div>
          </div>

          <div className={styles.smartRow}>
            <span className={styles.smartLabel}>Ordre</span>
            <div className={styles.smartPills}>
              {([
                { value: undefined,   label: 'Récent'       },
                { value: 'az',        label: 'A → Z'        },
                { value: 'oldest',    label: 'Plus anciens' },
              ] as { value: LecteurSmartFilters['sort']; label: string }[]).map(opt => (
                <button key={opt.label} type="button"
                  className={[styles.smartPill, filters.sort === opt.value ? styles.smartPillActive : ''].join(' ')}
                  onClick={() => setFilters(f => ({ ...f, sort: opt.value }))}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className={styles.smartPreviewLabel}>
          Résultat : {preview.length} fichier{preview.length !== 1 ? 's' : ''}
        </div>

        <button type="submit" className={styles.submitBtn} disabled={addPlaylist.isPending || !name.trim()}>
          {addPlaylist.isPending ? 'Création…' : 'Créer la smart liste'}
        </button>
      </form>
    </SlideUpModal>
  )
}
