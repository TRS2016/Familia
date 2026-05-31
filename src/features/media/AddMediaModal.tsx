import type { FormEvent } from 'react'
import { memberColor } from '../../lib/constants'
import SlideUpModal from '../../components/SlideUpModal'
import { useAddMediaItem } from './useMedia'
import type { MediaType } from './useMedia'
import { TYPE_META } from './MediaRow'
import styles from './MediaPage.module.css'

const TYPES: MediaType[] = ['film', 'série', 'livre', 'jeu']

type Draft = {
  title: string
  type: MediaType
  member_id: string | null
  author_director: string
  release_year: string
  genre: string
  external_url: string
}

const EMPTY_DRAFT: Draft = {
  title: '', type: 'film', member_id: null,
  author_director: '', release_year: '', genre: '', external_url: '',
}

export function AddMediaForm({
  draft,
  setDraft,
  members,
  onClose,
}: {
  draft: Draft
  setDraft: React.Dispatch<React.SetStateAction<Draft>>
  members: { id: string; display_name: string }[]
  onClose: () => void
}) {
  const addItem = useAddMediaItem()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!draft.title.trim()) return
    const year = draft.release_year ? parseInt(draft.release_year, 10) : null
    try {
      await addItem.mutateAsync({
        title:           draft.title,
        type:            draft.type,
        member_id:       draft.member_id,
        author_director: draft.author_director.trim() || null,
        release_year:    year && !isNaN(year) ? year : null,
        genre:           draft.genre.trim() || null,
        external_url:    draft.external_url.trim() || null,
      })
      setDraft(() => EMPTY_DRAFT)
      onClose()
    } catch { /* onError handles toast */ }
  }

  return (
    <SlideUpModal title="Ajouter un élément" onClose={onClose}>
      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.fieldGroup}>
          <label htmlFor="m-title" className={styles.fieldLabel}>Titre</label>
          <input
            id="m-title" type="text" value={draft.title} autoFocus required
            onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
            className={styles.input} placeholder="Dune, Atomic Habits…"
          />
        </div>

        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>Type</label>
          <div className={styles.typePills}>
            {TYPES.map(t => (
              <button
                key={t} type="button"
                className={[styles.typePill, draft.type === t ? styles.typePillActive : ''].join(' ')}
                style={draft.type === t ? { borderColor: 'var(--accent)', background: 'rgba(224,123,84,0.1)', color: 'var(--accent)' } : {}}
                onClick={() => setDraft(d => ({ ...d, type: t }))}
              >
                {TYPE_META[t].emoji} {TYPE_META[t].label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.fieldGroup}>
          <label htmlFor="m-author" className={styles.fieldLabel}>
            Auteur / Réalisateur <span className={styles.optional}>optionnel</span>
          </label>
          <input
            id="m-author" type="text" value={draft.author_director}
            onChange={e => setDraft(d => ({ ...d, author_director: e.target.value }))}
            className={styles.input} placeholder="Denis Villeneuve…"
          />
        </div>

        <div className={styles.fieldRow}>
          <div className={styles.fieldGroup}>
            <label htmlFor="m-year" className={styles.fieldLabel}>
              Année <span className={styles.optional}>optionnel</span>
            </label>
            <input
              id="m-year" type="number" value={draft.release_year} min={1800} max={2100}
              onChange={e => setDraft(d => ({ ...d, release_year: e.target.value }))}
              className={styles.input} placeholder="2024"
            />
          </div>
          <div className={styles.fieldGroup}>
            <label htmlFor="m-genre" className={styles.fieldLabel}>
              Genre <span className={styles.optional}>optionnel</span>
            </label>
            <input
              id="m-genre" type="text" value={draft.genre}
              onChange={e => setDraft(d => ({ ...d, genre: e.target.value }))}
              className={styles.input} placeholder="SF, Romance…"
            />
          </div>
        </div>

        <div className={styles.fieldGroup}>
          <label htmlFor="m-url" className={styles.fieldLabel}>
            Où regarder <span className={styles.optional}>Netflix, YouTube, lien…</span>
          </label>
          <input
            id="m-url" type="url" value={draft.external_url}
            onChange={e => setDraft(d => ({ ...d, external_url: e.target.value }))}
            className={styles.input} placeholder="https://…"
          />
        </div>

        {members.length > 1 && (
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Suggéré par</label>
            <div className={styles.memberPills}>
              {members.map((m, i) => {
                const isActive = draft.member_id === m.id
                const color    = memberColor(i)
                return (
                  <button
                    key={m.id} type="button"
                    className={[styles.memberPill, isActive ? styles.memberPillActive : ''].join(' ')}
                    style={isActive ? { borderColor: color, background: `${color}1A`, color } : {}}
                    onClick={() => setDraft(d => ({ ...d, member_id: m.id }))}
                  >
                    {m.display_name}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <button
          type="submit" className={styles.submitBtn}
          disabled={addItem.isPending || !draft.title.trim()}
        >
          {addItem.isPending ? 'Ajout…' : 'Ajouter'}
        </button>
      </form>
    </SlideUpModal>
  )
}

export { EMPTY_DRAFT }
export type { Draft as AddMediaDraft }
