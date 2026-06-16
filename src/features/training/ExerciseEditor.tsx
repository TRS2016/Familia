import { useState, useRef, useEffect } from 'react'
import { Video, Camera, Images, Link as LinkIcon, Plus, X, ChevronUp, ChevronDown } from 'lucide-react'
import SlideUpModal from '../../components/SlideUpModal'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../components/useToast'
import { useUploadMediaFile } from '../lecteur/useLecteur'
import { exerciseHasVideo } from './training'
import type { TrainingMode, Exercise } from './training'
import styles from './TrainingPage.module.css'

// ── Éditeur d'exercices (un par round/série) + vidéos ───────────────────────────

export default function ExerciseEditor({ mode, rounds, sets, exercises, onChange }: {
  mode: TrainingMode
  rounds: number
  sets: number
  exercises: Exercise[]
  onChange: (list: Exercise[]) => void
}) {
  const seriesBased = mode === 'tabata' || mode === 'intervals'
  const perMinute   = mode === 'emom'
  const fixedSlots  = seriesBased || perMinute
  const [videoIdx, setVideoIdx] = useState<number | null>(null)
  const [freeInput, setFreeInput] = useState('')

  function setEx(i: number, patch: Partial<Exercise>) {
    const next = exercises.slice()
    while (next.length <= i) next.push({ name: '' })
    next[i] = { ...next[i], ...patch }
    onChange(next)
  }
  function removeEx(i: number) {
    onChange(exercises.filter((_, j) => j !== i))
  }
  function moveEx(i: number, dir: -1 | 1) {
    const j = i + dir
    if (j < 0 || j >= exercises.length) return
    const next = exercises.slice()
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  function addFree() {
    const t = freeInput.trim()
    if (!t) return
    onChange([...exercises, { name: t }])
    setFreeInput('')
  }

  const count = seriesBased ? Math.max(1, sets) : perMinute ? Math.max(1, rounds) : exercises.length
  const hint = seriesBased ? 'un par série' : perMinute ? 'un par minute' : 'défilent à l\'effort'
  const slotTag = (i: number) => seriesBased ? `S${i + 1}` : perMinute ? `M${i + 1}` : `${i + 1}`

  return (
    <div className={styles.subCard}>
      <span className={styles.cfgSectionLabel}>
        Exercices <span className={styles.cfgSectionHint}>· {hint}</span>
      </span>

      <ul className={styles.exList}>
        {Array.from({ length: count }).map((_, i) => {
          const ex = exercises[i] ?? { name: '' }
          return (
            <li key={i} className={styles.exItem}>
              <span className={styles.exIdx}>{slotTag(i)}</span>
              <input
                className={styles.exNameInput}
                value={ex.name}
                onChange={e => setEx(i, { name: e.target.value })}
                placeholder={seriesBased ? `Exercice série ${i + 1}` : perMinute ? `Exercice min ${i + 1}` : 'Exercice…'}
              />
              <button
                type="button"
                className={[styles.exVideoBtn, exerciseHasVideo(ex) ? styles.exVideoBtnSet : ''].join(' ')}
                onClick={() => setVideoIdx(i)}
                aria-label="Vidéo de démo"
                title="Vidéo de démo"
              >
                <Video size={15} strokeWidth={2} />
              </button>
              {!fixedSlots && count > 1 && (
                <span className={styles.exMove}>
                  <button type="button" className={styles.exMoveBtn} onClick={() => moveEx(i, -1)} disabled={i === 0} aria-label="Monter">
                    <ChevronUp size={13} strokeWidth={2.5} />
                  </button>
                  <button type="button" className={styles.exMoveBtn} onClick={() => moveEx(i, 1)} disabled={i === count - 1} aria-label="Descendre">
                    <ChevronDown size={13} strokeWidth={2.5} />
                  </button>
                </span>
              )}
              {!fixedSlots && (
                <button type="button" className={styles.exRemove} onClick={() => removeEx(i)} aria-label="Retirer">
                  <X size={14} strokeWidth={2.5} />
                </button>
              )}
            </li>
          )
        })}
      </ul>

      {!fixedSlots && (
        <div className={styles.exAddRow}>
          <input
            className={styles.exInput}
            value={freeInput}
            onChange={e => setFreeInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addFree() } }}
            placeholder="Ajouter un exercice…"
          />
          <button type="button" className={styles.exAddBtn} onClick={addFree} aria-label="Ajouter">
            <Plus size={18} strokeWidth={2.5} />
          </button>
        </div>
      )}

      {videoIdx !== null && (
        <VideoSheet
          exercise={exercises[videoIdx] ?? { name: '' }}
          onClose={() => setVideoIdx(null)}
          onSave={patch => { setEx(videoIdx, patch); setVideoIdx(null) }}
        />
      )}
    </div>
  )
}

function VideoSheet({ exercise, onClose, onSave }: {
  exercise: Exercise
  onClose: () => void
  onSave: (patch: Partial<Exercise>) => void
}) {
  const upload = useUploadMediaFile()
  const [url, setUrl] = useState(exercise.videoUrl ?? '')
  const [path, setPath] = useState(exercise.videoPath)
  const [mime, setMime] = useState(exercise.videoMime)
  const galleryRef = useRef<HTMLInputElement>(null)
  const cameraRef  = useRef<HTMLInputElement>(null)
  // Uploads réalisés pendant cette ouverture : si la fiche est fermée sans
  // enregistrer (ou si un upload en remplace un autre), on les retire du Storage
  // pour ne pas laisser d'objets orphelins. Ces chemins ne sont jamais référencés
  // par un preset persisté tant que « Enregistrer » n'a pas été cliqué → suppression sûre.
  const sessionUploadsRef = useRef<string[]>([])
  const committedRef = useRef(false)

  const { showToast } = useToast()
  async function handleFile(file: File) {
    // Plafond Supabase free-tier : 50 Mo/fichier. On garde une marge.
    if (file.size > 50 * 1024 * 1024) {
      showToast({
        type: 'error',
        message: `Vidéo trop lourde (${Math.round(file.size / 1024 / 1024)} Mo). Max 50 Mo — utilise un clip plus court ou un lien YouTube.`,
      })
      return
    }
    try {
      const res = await upload.mutateAsync(file)
      sessionUploadsRef.current.push(res.path)
      setPath(res.path)
      setMime(res.mimeType || file.type || 'video/mp4')
      setUrl('')
    } catch { /* toast géré par le hook */ }
  }

  function handleSave() {
    const finalPath = url.trim() ? undefined : path
    // Retire les uploads de cette session qui ne sont pas la valeur retenue.
    const toRemove = sessionUploadsRef.current.filter(p => p !== finalPath)
    if (toRemove.length) supabase.storage.from('family-media').remove(toRemove).catch(() => { /* best effort */ })
    committedRef.current = true
    onSave(url.trim()
      ? { videoUrl: url.trim(), videoPath: undefined, videoMime: undefined }
      : { videoUrl: undefined, videoPath: path, videoMime: mime })
  }

  // Fermeture sans enregistrer : tous les uploads de session sont orphelins.
  useEffect(() => () => {
    if (!committedRef.current && sessionUploadsRef.current.length) {
      supabase.storage.from('family-media').remove(sessionUploadsRef.current).catch(() => { /* best effort */ })
    }
  }, [])

  return (
    <SlideUpModal title={`Vidéo — ${exercise.name || 'exercice'}`} onClose={onClose}>
      <div className={styles.videoSheet}>
        <label className={styles.cfgSectionLabel}>Lien (YouTube, Vimeo…)</label>
        <div className={styles.exAddRow}>
          <input
            className={styles.exInput}
            type="url"
            value={url}
            onChange={e => { setUrl(e.target.value); if (e.target.value) setPath(undefined) }}
            placeholder="https://youtube.com/watch?v=…"
          />
        </div>

        <div className={styles.videoOr}>ou {upload.isPending ? '· upload…' : path ? '· fichier ✓' : ''}</div>

        <div className={styles.videoUploadRow}>
          <button
            type="button"
            className={styles.videoUploadBtn}
            onClick={() => galleryRef.current?.click()}
            disabled={upload.isPending}
          >
            <Images size={15} strokeWidth={2} /> Galerie
          </button>
          <button
            type="button"
            className={styles.videoUploadBtn}
            onClick={() => cameraRef.current?.click()}
            disabled={upload.isPending}
          >
            <Camera size={15} strokeWidth={2} /> Caméra
          </button>
        </div>
        <input
          ref={galleryRef}
          type="file"
          accept="video/*"
          style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }}
        />
        <input
          ref={cameraRef}
          type="file"
          accept="video/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }}
        />

        {(url || path) && (
          <button
            type="button"
            className={styles.videoRemove}
            onClick={() => { setUrl(''); setPath(undefined); setMime(undefined) }}
          >
            <LinkIcon size={13} strokeWidth={2} /> Retirer la vidéo
          </button>
        )}

        <button type="button" className={styles.startBtn} onClick={handleSave}>
          Enregistrer
        </button>
      </div>
    </SlideUpModal>
  )
}
