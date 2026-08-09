import { useEffect, useRef } from 'react'
import MediaPlayer from '../media/MediaPlayer'
import JukeboxAudioEngine from './JukeboxAudioEngine'
import { supabase } from '../../lib/supabase'
import { HOUSEHOLD_ID } from '../../lib/config'
import { isLocalAudio } from './lecteur.utils'
import {
  useAddToQueue, useLecteurPlayedHistory, useMarkQueuePlayed, type QueueItem,
} from './useLecteurQueue'
import { useLecteurPlaylistItems, bumpPlayCount } from './useLecteur'
import styles from './LecteurPage.module.css'

export interface DjSettings {
  volume: number
  crossfade: boolean
  crossfadeSec: number
  autoFill: boolean
  fillPlaylistId: string | null
}

/**
 * Porte l'audio du mode DJ, le now-playing partagé et l'anti-silence.
 *
 * Rendu au niveau de LecteurPage, PAS dans JukeboxPane : cet onglet est monté
 * conditionnellement, si bien que passer sur la Bibliothèque démontait le
 * lecteur — la musique s'arrêtait et le morceau reprenait au début au retour.
 * Le composant ne rend rien de visible quand l'onglet Soirée n'est pas affiché.
 */
export default function DjPlayer({ current, next, settings }: {
  current: QueueItem | null
  next: QueueItem | null
  settings: DjSettings
}) {
  const markPlayed = useMarkQueuePlayed()
  const addToQueue = useAddToQueue()
  const { data: played = [] } = useLecteurPlayedHistory()
  const { data: fillItems = [] } = useLecteurPlaylistItems(
    settings.autoFill ? settings.fillPlaylistId : null,
  )

  const currentId = current?.id ?? null
  const useEngine = settings.crossfade && isLocalAudio(current?.media_file ?? null)

  // ── Now-playing partagé : l'edge jukebox le sert aux invités ───────────────
  useEffect(() => {
    if (!current) {
      void supabase.from('lecteur_now_playing').delete().eq('household_id', HOUSEHOLD_ID)
      return
    }
    void supabase.from('lecteur_now_playing').upsert({
      household_id:  HOUSEHOLD_ID,
      queue_item_id: current.id,
      title:         current.media_file?.title ?? 'Morceau',
      requested_by:  current.added_by_member?.display_name ?? current.guest_name ?? null,
      // updated_at est posé par un trigger serveur : l'horloge d'un appareil
      // déréglé faussait l'anti-stale de 6 h côté edge.
    } as never, { onConflict: 'household_id' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId])

  useEffect(() => (
    () => { void supabase.from('lecteur_now_playing').delete().eq('household_id', HOUSEHOLD_ID) }
  ), [])

  // ── Compteur d'écoutes : une fois par item de file ─────────────────────────
  // (l'item de file est joué une seule fois ; compter au montage inflatait le
  // compteur à chaque aller-retour d'onglet).
  const countedRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    const fileId = current?.media_file?.id
    if (!current || !fileId) return
    if (countedRef.current.has(current.id)) return
    countedRef.current.add(current.id)
    bumpPlayCount(fileId)
  }, [current])

  // ── Anti-silence : enchaîne une playlist quand la file se vide ─────────────
  // Les refs évitent que l'effet se relance à chaque refetch (fillItems/played
  // changent d'identité en permanence).
  const fillingRef = useRef(false)
  const fillItemsRef = useRef(fillItems)
  const playedRef = useRef(played)
  const addRef = useRef(addToQueue)
  useEffect(() => { fillItemsRef.current = fillItems }, [fillItems])
  useEffect(() => { playedRef.current = played }, [played])
  useEffect(() => { addRef.current = addToQueue }, [addToQueue])

  const queueEmpty = current === null
  useEffect(() => {
    if (!settings.autoFill || !settings.fillPlaylistId || !queueEmpty) return
    if (fillingRef.current) return
    const items = fillItemsRef.current
    if (items.length === 0) return
    // Évite de répéter ce qui vient de passer (sauf si toute la playlist est jouée).
    const playedIds = new Set(playedRef.current.map(p => p.media_file_id))
    const fresh = items.filter(it => !playedIds.has(it.media_file_id))
    const pool = fresh.length ? fresh : items
    const pick = pool[Math.floor(Math.random() * pool.length)]
    if (!pick) return
    fillingRef.current = true
    addRef.current.mutate({ mediaFileId: pick.media_file_id, silent: true }, {
      onSettled: () => { fillingRef.current = false },
    })
  }, [settings.autoFill, settings.fillPlaylistId, queueEmpty, fillItems])

  if (!current?.media_file) return null

  return (
    // Rendu en tête de page, hors des onglets : le lecteur suit le DJ où qu'il
    // navigue, et il voit toujours ce qui passe.
    <div className={styles.djDock}>
      <div className={styles.djDockHead}>
        <span className={styles.djDockBadge}>DJ</span>
        <span className={styles.djDockTitle}>{current.media_file.title}</span>
      </div>
      <div className={styles.playerWrap}>
      {useEngine ? (
        <JukeboxAudioEngine
          current={current}
          next={next}
          volume={settings.volume}
          crossfadeSec={settings.crossfadeSec}
          onEnded={(id) => markPlayed.mutate(id)}
        />
      ) : (
        <MediaPlayer
          key={current.id}
          filePath={current.media_file.file_path}
          externalUrl={current.media_file.external_url}
          mimeType={current.media_file.mime_type}
          title={current.media_file.title}
          autoPlay
          volume={settings.volume}
          onEnded={() => markPlayed.mutate(current.id)}
        />
      )}
      </div>
    </div>
  )
}
