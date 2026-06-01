import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import styles from './MediaPlayer.module.css'

// ── URL detection ─────────────────────────────────────────────────────────────

type PlayerType = 'youtube' | 'spotify' | 'video' | 'audio' | 'link'

function detectType(url: string, mimeType?: string | null): PlayerType {
  if (/youtube\.com\/watch|youtu\.be\//.test(url)) return 'youtube'
  if (/open\.spotify\.com/.test(url)) return 'spotify'
  if (mimeType?.startsWith('video/') || /\.(mp4|mov|webm|m4v)(\?|#|$)/i.test(url)) return 'video'
  if (mimeType?.startsWith('audio/') || /\.(mp3|wav|m4a|ogg|flac|aac)(\?|#|$)/i.test(url)) return 'audio'
  return 'link'
}

function youtubeEmbedUrl(url: string): string {
  const m = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  return `https://www.youtube.com/embed/${m?.[1] ?? ''}?autoplay=1&rel=0`
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
}

export default function MediaPlayer({ filePath, externalUrl, mimeType, title, onEnded, autoPlay }: Props) {
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
      const p = el.play()
      if (p && typeof p.catch === 'function') p.catch(() => { /* autoplay bloqué */ })
    }
  }, [autoPlay])

  if (filePath && isLoading) {
    return <div className={styles.skeleton}>Chargement du média…</div>
  }

  const url = filePath ? (signedUrl ?? null) : externalUrl
  if (!url) return null

  const type = detectType(url, mimeType)

  if (type === 'youtube') {
    return (
      <div className={styles.iframeWrap}>
        <iframe
          src={youtubeEmbedUrl(url)}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
          allowFullScreen
          className={styles.iframe}
        />
      </div>
    )
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
        onCanPlay={handleCanPlay}
        onEnded={onEnded}
      />
    )
  }

  if (type === 'audio') {
    return (
      <audio
        key={url}
        src={url}
        controls
        className={styles.audio}
        preload="metadata"
        autoPlay={autoPlay}
        onCanPlay={handleCanPlay}
        onEnded={onEnded}
      />
    )
  }

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={styles.externalLink}>
      Ouvrir ↗
    </a>
  )
}
