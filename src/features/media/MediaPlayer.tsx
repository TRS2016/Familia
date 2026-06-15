/* eslint-disable react-refresh/only-export-components --
   Helpers partagés (clés/URL signées/canAutoAdvance) volontairement co-localisés
   avec le composant et importés par le Lecteur. Impact limité au fast-refresh dev. */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, ExternalLink, Volume2, VolumeX } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import styles from './MediaPlayer.module.css'

// URL signée d'un fichier du bucket privé family-media. Exporté pour permettre
// le préchargement (ex. piste suivante de la file d'attente du Lecteur).
export const mediaFileUrlKey = (filePath: string) => ['media-file-url', filePath] as const
export const MEDIA_FILE_URL_TTL = 7200
export async function signMediaFileUrl(filePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('family-media')
    .createSignedUrl(filePath, MEDIA_FILE_URL_TTL)
  if (error) throw error
  return data.signedUrl
}

// ── Custom audio player ───────────────────────────────────────────────────────

function fmtTime(s: number): string {
  if (!isFinite(s) || s < 0) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

// ── Reprise de lecture (position mémorisée par média) ──────────────────────────
const RESUME_STORAGE_KEY = 'familia-lecteur-resume'

function getResumeMap(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(RESUME_STORAGE_KEY) ?? '{}') }
  catch { return {} }
}
function saveResume(key: string, pos: number) {
  const m = getResumeMap()
  m[key] = Math.floor(pos)
  try { localStorage.setItem(RESUME_STORAGE_KEY, JSON.stringify(m)) } catch { /* quota */ }
}
function clearResume(key: string) {
  const m = getResumeMap()
  if (!(key in m)) return
  delete m[key]
  try { localStorage.setItem(RESUME_STORAGE_KEY, JSON.stringify(m)) } catch { /* ignore */ }
}
// Ne restaure que si l'on est « au milieu » (évite de reprendre tout au début/fin).
function resumePosition(key: string | null | undefined, duration: number): number | null {
  if (!key || !isFinite(duration) || duration < 60) return null
  const saved = getResumeMap()[key]
  if (saved != null && saved > 10 && saved < duration - 15) return saved
  return null
}

function CustomAudio({ src, autoPlay, loop, playbackRate, resumeKey, onEnded, onProgress, volume }: {
  src: string
  autoPlay?: boolean
  loop?: boolean
  playbackRate?: number
  resumeKey?: string | null
  onEnded?: () => void
  onProgress?: (current: number, duration: number) => void
  volume?: number
}) {
  const ref = useRef<HTMLAudioElement>(null)
  const [playing,  setPlaying]  = useState(false)
  const [current,  setCurrent]  = useState(0)
  const [duration, setDuration] = useState(0)
  const [muted,    setMuted]    = useState(false)
  const lastSavedRef = useRef(0)

  // Applique la vitesse de lecture (et la ré-applique si elle change).
  useEffect(() => {
    if (ref.current && playbackRate) ref.current.playbackRate = playbackRate
  }, [playbackRate])

  // Volume contrôlé en externe (slider du dock + fondu de sortie du minuteur).
  useEffect(() => {
    if (ref.current && volume != null) ref.current.volume = Math.min(1, Math.max(0, volume))
  }, [volume])

  function toggle() {
    const el = ref.current
    if (!el) return
    if (el.paused) el.play().catch(() => { /* autoplay bloqué */ })
    else el.pause()
  }

  function toggleMute() {
    const el = ref.current
    if (!el) return
    el.muted = !el.muted
    setMuted(el.muted)
  }

  // Alimente le scrubber de l'écran verrouillé (MediaSession position state).
  function syncPositionState() {
    if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return
    const el = ref.current
    if (!el || !isFinite(el.duration) || el.duration <= 0) return
    try {
      navigator.mediaSession.setPositionState({
        duration: el.duration,
        position: Math.min(el.currentTime, el.duration),
        playbackRate: el.playbackRate || 1,
      })
    } catch { /* valeurs invalides ignorées */ }
  }

  // Handler « seekto » natif (glissement du scrubber sur l'écran verrouillé).
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    const ms = navigator.mediaSession
    try {
      ms.setActionHandler('seekto', (d: MediaSessionActionDetails) => {
        const el = ref.current
        if (!el || d.seekTime == null) return
        el.currentTime = d.seekTime
        setCurrent(d.seekTime)
        syncPositionState()
      })
    } catch { /* action non supportée */ }
    return () => { try { ms.setActionHandler('seekto', null) } catch { /* ignore */ } }
  }, [])

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const el = ref.current
    if (!el || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    el.currentTime = frac * duration
    setCurrent(el.currentTime)
  }

  function seekKey(e: React.KeyboardEvent<HTMLDivElement>) {
    const el = ref.current
    if (!el || !duration) return
    let next: number | null = null
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp')   next = Math.min(duration, el.currentTime + 5)
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = Math.max(0, el.currentTime - 5)
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End')  next = duration
    if (next === null) return
    e.preventDefault()
    el.currentTime = next
    setCurrent(next)
  }

  const pct = duration ? (current / duration) * 100 : 0

  return (
    <div className={styles.audioPlayer}>
      <audio
        ref={ref}
        src={src}
        autoPlay={autoPlay}
        loop={loop}
        preload="metadata"
        onPlay={() => {
          setPlaying(true)
          if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'
          syncPositionState()
        }}
        onPause={() => {
          setPlaying(false)
          if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'
        }}
        onTimeUpdate={e => {
          const t = e.currentTarget.currentTime
          setCurrent(t)
          onProgress?.(t, e.currentTarget.duration)
          if (resumeKey && Math.abs(t - lastSavedRef.current) >= 5) {
            lastSavedRef.current = t
            saveResume(resumeKey, t)
          }
        }}
        onLoadedMetadata={e => {
          const el = e.currentTarget
          setDuration(el.duration)
          onProgress?.(el.currentTime, el.duration)
          if (playbackRate) el.playbackRate = playbackRate
          const pos = resumePosition(resumeKey, el.duration)
          if (pos != null) { el.currentTime = pos; setCurrent(pos); lastSavedRef.current = pos }
          syncPositionState()
        }}
        onCanPlay={e => { if (autoPlay) e.currentTarget.play().catch(() => { /* bloqué */ }) }}
        onEnded={() => { if (resumeKey) clearResume(resumeKey); onEnded?.() }}
      />
      <button
        className={styles.audioPlayBtn}
        onClick={toggle}
        aria-label={playing ? 'Pause' : 'Lecture'}
      >
        {playing
          ? <Pause size={18} strokeWidth={2.5} fill="currentColor" />
          : <Play size={18} strokeWidth={2.5} fill="currentColor" />}
      </button>
      <span className={styles.audioTime}>{fmtTime(current)}</span>
      <div
        className={styles.audioTrack}
        onClick={seek}
        onKeyDown={seekKey}
        role="slider"
        tabIndex={0}
        aria-label="Position de lecture"
        aria-valuemin={0}
        aria-valuemax={Math.floor(duration)}
        aria-valuenow={Math.floor(current)}
        aria-valuetext={`${fmtTime(current)} sur ${fmtTime(duration)}`}
      >
        <div className={styles.audioFill} style={{ width: `${pct}%` }}>
          <span className={styles.audioThumb} />
        </div>
      </div>
      <span className={styles.audioTime}>{fmtTime(duration)}</span>
      <button
        className={styles.audioMuteBtn}
        onClick={toggleMute}
        aria-label={muted ? 'Réactiver le son' : 'Couper le son'}
        aria-pressed={muted}
      >
        {muted
          ? <VolumeX size={17} strokeWidth={2.5} />
          : <Volume2 size={17} strokeWidth={2.5} />}
      </button>
    </div>
  )
}

// ── YouTube IFrame API loader (chargé une seule fois) ─────────────────────────

let ytApiPromise: Promise<void> | null = null

function loadYouTubeApi(): Promise<void> {
  if (ytApiPromise) return ytApiPromise
  ytApiPromise = new Promise<void>(resolve => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    if (w.YT && w.YT.Player) { resolve(); return }
    const prev = w.onYouTubeIframeAPIReady
    w.onYouTubeIframeAPIReady = () => { prev?.(); resolve() }
    if (!document.getElementById('yt-iframe-api')) {
      const tag = document.createElement('script')
      tag.id  = 'yt-iframe-api'
      tag.src = 'https://www.youtube.com/iframe_api'
      document.head.appendChild(tag)
    }
  })
  return ytApiPromise
}

function YouTubePlayer({ videoId, autoPlay, muted, loop, onEnded }: {
  videoId: string
  autoPlay?: boolean
  muted?: boolean
  loop?: boolean
  onEnded?: () => void
}) {
  const hostRef    = useRef<HTMLDivElement>(null)
  const onEndedRef = useRef(onEnded)

  useEffect(() => { onEndedRef.current = onEnded }, [onEnded])

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let player: any = null

    loadYouTubeApi().then(() => {
      if (cancelled || !hostRef.current) return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any
      player = new w.YT.Player(hostRef.current, {
        videoId,
        playerVars: {
          autoplay: autoPlay ? 1 : 0, rel: 0, playsinline: 1, mute: muted ? 1 : 0,
          // loop YouTube nécessite playlist = même id
          loop: loop ? 1 : 0, ...(loop ? { playlist: videoId } : {}),
        },
        events: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onReady: (e: any) => {
            if (muted) e.target.mute()
            if (autoPlay) e.target.playVideo()
            // Garantit que l'iframe peut passer en plein écran natif (Android/PC)
            try {
              const f = e.target.getIframe?.()
              f?.setAttribute('allowfullscreen', '')
              f?.setAttribute('allow', 'autoplay; fullscreen; encrypted-media; picture-in-picture')
            } catch { /* ignore */ }
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onStateChange: (e: any) => {
            if (e.data === w.YT.PlayerState.ENDED) {
              if (loop) { e.target.seekTo(0); e.target.playVideo() } // relance (fiable même si playlist échoue)
              else onEndedRef.current?.()
            }
          },
        },
      })
    })

    return () => {
      cancelled = true
      try { player?.destroy?.() } catch { /* déjà détruit */ }
    }
  }, [videoId, autoPlay, muted, loop])

  return (
    <div className={styles.iframeWrap}>
      <div ref={hostRef} />
    </div>
  )
}

// ── URL detection ─────────────────────────────────────────────────────────────

// La file de soirée ne s'enchaîne toute seule que si le média émet `onEnded` :
// fichiers uploadés, YouTube (IFrame API) et fichiers distants audio/vidéo.
// Spotify (iframe opaque) et les simples liens demandent un skip manuel.
export function canAutoAdvance(
  filePath: string | null | undefined,
  externalUrl: string | null | undefined,
  mimeType?: string | null,
): boolean {
  if (filePath) return true
  if (!externalUrl) return false
  const t = detectType(externalUrl, mimeType)
  return t === 'youtube' || t === 'video' || t === 'audio'
}

type PlayerType = 'youtube' | 'spotify' | 'video' | 'audio' | 'link'

function detectType(url: string, mimeType?: string | null): PlayerType {
  if (/(?:youtube\.com|youtube-nocookie\.com|youtu\.be)/i.test(url) && youtubeId(url)) return 'youtube'
  if (/open\.spotify\.com/.test(url)) return 'spotify'
  if (mimeType?.startsWith('video/') || /\.(mp4|mov|webm|m4v)(\?|#|$)/i.test(url)) return 'video'
  if (mimeType?.startsWith('audio/') || /\.(mp3|wav|m4a|ogg|flac|aac)(\?|#|$)/i.test(url)) return 'audio'
  return 'link'
}

// Extrait l'ID 11 caractères de toutes les formes courantes :
// watch?v=, youtu.be/, /shorts/, /embed/, /live/, /v/ (+ sous-domaines m./www.)
function youtubeId(url: string): string {
  const m = url.match(/(?:v=|vi=|youtu\.be\/|\/shorts\/|\/embed\/|\/live\/|\/v\/)([a-zA-Z0-9_-]{11})/)
  return m?.[1] ?? ''
}

function spotifyEmbedUrl(url: string): string {
  return url.replace(/https?:\/\/open\.spotify\.com\//, 'https://open.spotify.com/embed/')
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  filePath?: string | null
  externalUrl?: string | null
  mimeType?: string | null
  title: string
  onEnded?: () => void
  autoPlay?: boolean
  muted?: boolean
  loop?: boolean
  playbackRate?: number
  resumeKey?: string | null
  /** Progression (audio/vidéo uniquement) pour un mini-affichage externe. */
  onProgress?: (current: number, duration: number) => void
  /** Volume 0..1 contrôlé en externe (audio uniquement). */
  volume?: number
}

export default function MediaPlayer({ filePath, externalUrl, mimeType, title, onEnded, autoPlay, muted, loop, playbackRate, resumeKey, onProgress, volume }: Props) {
  const { data: signedUrl, isLoading } = useQuery({
    queryKey: mediaFileUrlKey(filePath ?? ''),
    queryFn: () => signMediaFileUrl(filePath!),
    enabled: !!filePath,
    staleTime: 90 * 60 * 1000,
    gcTime:   120 * 60 * 1000,
  })

  // Forcer la lecture dès que la piste est prête — l'attribut autoPlay seul
  // échoue souvent quand l'URL signée se charge en asynchrone (perte du
  // contexte d'activation lors du remount entre deux pistes).
  const handleCanPlay = useCallback((e: React.SyntheticEvent<HTMLMediaElement>) => {
    if (autoPlay) {
      const el = e.currentTarget
      if (muted) el.muted = true // garantit le muet avant lecture (React met l'attribut tardivement)
      const p = el.play()
      if (p && typeof p.catch === 'function') p.catch(() => { /* autoplay bloqué */ })
    }
  }, [autoPlay, muted])

  // Vidéo : ref + sauvegarde de position pour la reprise.
  const videoRef = useRef<HTMLVideoElement>(null)
  const lastVideoSaveRef = useRef(0)
  useEffect(() => {
    if (videoRef.current && playbackRate) videoRef.current.playbackRate = playbackRate
  }, [playbackRate])

  if (filePath && isLoading) {
    return <div className={styles.skeleton}>Chargement du média…</div>
  }

  const url = filePath ? (signedUrl ?? null) : externalUrl
  if (!url) return null

  const type = detectType(url, mimeType)

  if (type === 'youtube') {
    return <YouTubePlayer videoId={youtubeId(url)} autoPlay={autoPlay} muted={muted} loop={loop} onEnded={onEnded} />
  }

  if (type === 'spotify') {
    return (
      <div className={styles.spotifyWrap}>
        <iframe
          src={spotifyEmbedUrl(url)}
          title={title}
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          loading="lazy"
          className={styles.spotifyFrame}
        />
      </div>
    )
  }

  if (type === 'video') {
    return (
      <video
        ref={videoRef}
        key={url}
        src={url}
        controls
        className={styles.video}
        preload="metadata"
        playsInline
        autoPlay={autoPlay}
        muted={muted}
        loop={loop}
        onCanPlay={e => { handleCanPlay(e); if (playbackRate) e.currentTarget.playbackRate = playbackRate }}
        onLoadedMetadata={e => {
          const el = e.currentTarget
          if (playbackRate) el.playbackRate = playbackRate
          const pos = resumePosition(resumeKey, el.duration)
          if (pos != null) { el.currentTime = pos; lastVideoSaveRef.current = pos }
        }}
        onTimeUpdate={e => {
          const t = e.currentTarget.currentTime
          onProgress?.(t, e.currentTarget.duration)
          if (resumeKey && Math.abs(t - lastVideoSaveRef.current) >= 5) {
            lastVideoSaveRef.current = t
            saveResume(resumeKey, t)
          }
        }}
        onEnded={() => { if (resumeKey) clearResume(resumeKey); onEnded?.() }}
      />
    )
  }

  if (type === 'audio') {
    return <CustomAudio key={url} src={url} autoPlay={autoPlay} loop={loop} playbackRate={playbackRate} resumeKey={resumeKey} onEnded={onEnded} onProgress={onProgress} volume={volume} />
  }

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={styles.externalLink}>
      <ExternalLink size={16} strokeWidth={2.5} aria-hidden="true" />
      Ouvrir
    </a>
  )
}
