import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { mediaFileUrlKey, signMediaFileUrl } from '../media/MediaPlayer'
import { isLocalAudio } from './lecteur.utils'
import type { QueueItem } from './useLecteurQueue'

// Moteur audio du jukebox avec fondu enchaîné (crossfade) — FICHIERS AUDIO LOCAUX
// uniquement. Deux <audio> dont on anime le `.volume` (pas de Web Audio : évite
// le silence lié au CORS sur les URLs signées). Persiste à travers l'avancement
// de la file (pas de `key` qui le remonterait) pour ne pas couper le fondu.
//
// Hors de ce moteur (vidéo, YouTube/Spotify, crossfade OFF), le JukeboxPane
// garde le MediaPlayer classique en coupure franche.

function useSignedUrl(filePath: string | null | undefined): string | null {
  const { data } = useQuery({
    queryKey: mediaFileUrlKey(filePath ?? ''),
    queryFn: () => signMediaFileUrl(filePath!),
    enabled: !!filePath,
    staleTime: 90 * 60 * 1000,
    gcTime: 120 * 60 * 1000,
  })
  return data ?? null
}

export default function JukeboxAudioEngine({ current, next, volume, crossfadeSec, onEnded }: {
  current: QueueItem
  next: QueueItem | null
  volume: number
  crossfadeSec: number
  onEnded: (id: string) => void
}) {
  const aRef = useRef<HTMLAudioElement>(null)
  const bRef = useRef<HTMLAudioElement>(null)
  const activeRef    = useRef<0 | 1>(0)            // élément qui joue la piste courante
  const playingIdRef = useRef<string | null>(null) // id de la piste en cours (réconciliation)
  const fadingRef    = useRef(false)
  const rafRef       = useRef<number | null>(null)
  const volumeRef    = useRef(volume)
  useEffect(() => { volumeRef.current = volume }, [volume])

  const el = (i: 0 | 1) => (i === 0 ? aRef.current : bRef.current)

  const nextAudio = isLocalAudio(next?.media_file ?? null)
  const curUrl  = useSignedUrl(current.media_file?.file_path)
  const nextUrl = useSignedUrl(nextAudio ? next!.media_file!.file_path : null)
  // Réfs à jour pour les handlers (écrites en effet, pas pendant le rendu).
  const nextRef = useRef<{ id: string; url: string | null } | null>(null)
  useEffect(() => {
    nextRef.current = next && nextAudio ? { id: next.id, url: nextUrl } : null
  }, [next, nextAudio, nextUrl])
  const cfRef = useRef(crossfadeSec)
  useEffect(() => { cfRef.current = crossfadeSec }, [crossfadeSec])

  function cancelRamp() {
    if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    fadingRef.current = false
  }

  // Démarre / réconcilie la piste courante. No-op si on la joue déjà (cas d'un
  // avancement provoqué par notre propre crossfade).
  useEffect(() => {
    if (playingIdRef.current === current.id) return
    if (!curUrl) return
    cancelRamp()
    const a = activeRef.current
    const active = el(a)
    const idle = el((a === 0 ? 1 : 0))
    if (idle) { try { idle.pause() } catch { /* ignore */ } }
    if (!active) return
    active.src = curUrl
    active.volume = Math.min(1, Math.max(0, volumeRef.current))
    active.currentTime = 0
    active.play().catch(() => { /* autoplay bloqué */ })
    playingIdRef.current = current.id
  }, [current.id, curUrl])

  // Applique le volume (hors fondu, où la rampe pilote les volumes).
  useEffect(() => {
    if (fadingRef.current) return
    const active = el(activeRef.current)
    if (active) active.volume = Math.min(1, Math.max(0, volume))
  }, [volume])

  useEffect(() => () => { cancelRamp() }, [])

  function startCrossfade(outgoingId: string) {
    const nx = nextRef.current
    if (!nx?.url) return
    const outIdx = activeRef.current
    const inIdx: 0 | 1 = outIdx === 0 ? 1 : 0
    const outgoing = el(outIdx)
    const incoming = el(inIdx)
    if (!outgoing || !incoming) return

    fadingRef.current = true
    incoming.src = nx.url
    incoming.currentTime = 0
    incoming.volume = 0
    incoming.play().catch(() => { /* bloqué */ })
    // L'élément entrant devient l'actif tout de suite (réconciliation à l'avance).
    activeRef.current = inIdx
    playingIdRef.current = nx.id

    const target = Math.min(1, Math.max(0, volumeRef.current))
    const dur = Math.max(0.4, Math.min(cfRef.current, (outgoing.duration || cfRef.current) - outgoing.currentTime))
    const t0 = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / (dur * 1000))
      outgoing.volume = target * (1 - p)
      incoming.volume = target * p
      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        rafRef.current = null
        fadingRef.current = false
        try { outgoing.pause() } catch { /* ignore */ }
        onEnded(outgoingId) // avance la file ; current deviendra la piste entrante (no-op à l'effet)
      }
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  function handleTimeUpdate(idx: 0 | 1) {
    if (fadingRef.current || idx !== activeRef.current) return
    const active = el(idx)
    if (!active || !isFinite(active.duration) || active.duration <= 0) return
    const remaining = active.duration - active.currentTime
    if (active.currentTime > 1 && remaining <= cfRef.current && nextRef.current?.url) {
      startCrossfade(playingIdRef.current ?? current.id)
    }
  }

  function handleEnded(idx: 0 | 1) {
    // Fin naturelle sans crossfade (pas de suivant audio local) : avance la file.
    if (fadingRef.current || idx !== activeRef.current) return
    const id = playingIdRef.current
    if (id) onEnded(id)
  }

  return (
    <div style={{ display: 'none' }} aria-hidden="true">
      <audio ref={aRef} preload="auto" crossOrigin="anonymous"
        onTimeUpdate={() => handleTimeUpdate(0)} onEnded={() => handleEnded(0)} />
      <audio ref={bRef} preload="auto" crossOrigin="anonymous"
        onTimeUpdate={() => handleTimeUpdate(1)} onEnded={() => handleEnded(1)} />
    </div>
  )
}
