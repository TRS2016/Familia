import { useState } from 'react'
import { X } from 'lucide-react'
import styles from './LecteurPage.module.css'

// Saisie de tags libres (Entrée ou virgule pour valider, Backspace pour retirer).
export default function TagInput({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const [input, setInput] = useState('')

  function add(raw: string) {
    const t = raw.trim().toLowerCase().replace(/^#+/, '')
    if (t && !tags.includes(t)) onChange([...tags, t])
    setInput('')
  }

  return (
    <div>
      {tags.length > 0 && (
        <div className={styles.tagEditChips}>
          {tags.map(t => (
            <span key={t} className={styles.tagEditChip}>
              #{t}
              <button type="button" onClick={() => onChange(tags.filter(x => x !== t))} aria-label={`Retirer ${t}`}>
                <X size={11} strokeWidth={2.5} />
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        type="text"
        className={styles.input}
        value={input}
        aria-label="Ajouter un tag"
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(input) }
          else if (e.key === 'Backspace' && !input && tags.length) onChange(tags.slice(0, -1))
        }}
        onBlur={() => { if (input.trim()) add(input) }}
        placeholder="chill, workout, enfants… (Entrée pour valider)"
      />
    </div>
  )
}
