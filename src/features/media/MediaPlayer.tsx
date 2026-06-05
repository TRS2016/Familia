import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import styles from './MediaPlayer.module.css'

// ── Custom audio player ───────────────────────────────────────────────────────

function fmtTime(s: number): string {
  if (!isFinite(s) || s < 0) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

function CustomAudio({ src, autoPlay, onEnded }: {
  src: string
  autoPlay?: boolean
  onEnded?: () => void
}) {
  const ref = useRef<HTMLAudioElement>(null)
  const [playing,  setPlaying]  = useState(false)
  const [current,  setCurrent]  = useState(0)
  const [duration, setDuration] = useState(0)

  function toggle() {
    const el = ref.current
    if (!el) return
    if (el.paused) el.play().catch(() => { /* autoplay bloqué */ })
    else el.pause()
  }

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const el = ref.current
    if (!el || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    el.currentTime = frac * duration
    setCurrent(el.currentTime)
  }

  const pct = duration ? (current / duration) * 100 : 0

  return (
    <div className={styles.audioPlayer}>
      <audio
        ref={ref}
        src={src}
        autoPlay={autoPlay}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={e => setCurrent(e.currentTarget.currentTime)}
        onLoadedMetadata={e => setDuration(e.currentTarget.duration)}
        onCanPlay={e => { if (autoPlay) e.currentTarget.play().catch(() => { /* bloqué */ }) }}
        onEnded={onEnded}
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
      <div className={styles.audioTrack} onClick={seek}>
        <div className={styles.audioFill} style={{ width: `${pct}%` }}>
          <span className={styles.audioThumb} />
        </div>
      </div>
      <span className={styles.audioTime}>{fmtTime(duration)}</span>
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

function YouTubePlayer({ videoId, autoPlay, muted, onEnded }: {
  videoId: string
  autoPlay?: boolean
  muted?: boolean
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
        playerVars: { autoplay: autoPlay ? 1 : 0, rel: 0, playsinline: 1, mute: muted ? 1 : 0 },
        events: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onReady: (e: any) => { if (muted) e.target.mute(); if (autoPlay) e.target.playVideo() },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onStateChange: (e: any) => {
            if (e.data === w.YT.PlayerState.ENDED) onEndedRef.current?.()
          },
        },
      })
    })

    return () => {
      cancelled = true
      try { player?.destroy?.() } catch { /* déjà détruit */ }
    }
  }, [videoId, autoPlay, muted])

  return (
    <div className={styles.iframeWrap}>
      <div ref={hostRef} />
    </div>
  )
}

// ── URL detection ─────────────────────────────────────────────────────────────

type PlayerType = 'youtube' | 'spotify' | 'video' | 'audio' | 'link'

function detectType(url: string, mimeType?: string | null): PlayerType {
  if (/youtube\.com\/watch|youtu\.be\//.test(url)) return 'youtube'
  if (/open\.spotify\.com/.test(url)) return 'spotify'
  if (mimeType?.startsWith('video/') || /\.(mp4|mov|webm|m4v)(\?|#|$)/i.test(url)) return 'video'
  if (mimeType?.startsWith('audio/') || /\.(mp3|wav|m4a|ogg|flac|aac)(\?|#|$)/i.test(url)) return 'audio'
  return 'link'
}

function youtubeId(url: string): string {
  const m = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
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
}

export default function MediaPlayer({ filePath, externalUrl, mimeType, title, onEnded, autoPlay, muted }: Props) {
  const { data: signedUrl, isLoading } = useQuery({
    queryKey: ['media-file-url', filePath],
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from('family-media')
        .createSignedUrl(filePath!, 7200)
      if (error) throw error
      return data.signedUrl
    },
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

  if (filePath && isLoading) {
    return <div className={styles.skeleton}>Chargement du média…</div>
  }

  const url = filePath ? (signedUrl ?? null) : externalUrl
  if (!url) return null

  const type = detectType(url, mimeType)

  if (type === 'youtube') {
    return <YouTubePlayer videoId={youtubeId(url)} autoPlay={autoPlay} muted={muted} onEnded={onEnded} />
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
        key={url}
        src={url}
        controls
        className={styles.video}
        preload="metadata"
        playsInline
        autoPlay={autoPlay}
        muted={muted}
        onCanPlay={handleCanPlay}
        onEnded={onEnded}
      />
    )
  }

  if (type === 'audio') {
    return <CustomAudio key={url} src={url} autoPlay={autoPlay} onEnded={onEnded} />
  }

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={styles.externalLink}>
      Ouvrir ↗
    </a>
  )
}
