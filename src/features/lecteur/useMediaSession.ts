import { useEffect } from 'react'
import { youtubeThumb } from '../../lib/youtube'
import type { MediaFile } from './useLecteur'

/**
 * Contrôles natifs (écran verrouillé, casque BT, centre de contrôle).
 *
 * `playbackState` n'est volontairement PAS forcé : les éléments <audio>/<video>
 * le mettent à jour eux-mêmes sur play/pause, et le forcer écrasait l'état réel
 * (une lecture en pause s'affichait « en cours »). Play/pause et seek restent
 * gérés nativement ; les embeds YouTube/Spotify gèrent les leurs.
 */
export function useMediaSession({ file, index, total, onPrev, onNext, onStop }: {
  file: MediaFile | null
  index: number
  total: number
  onPrev: (() => void) | null
  onNext: (() => void) | null
  onStop: () => void
}) {
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    const ms = navigator.mediaSession

    if (!file) {
      ms.metadata = null
      ms.playbackState = 'none'
      return
    }

    // Artwork de l'écran verrouillé : vignette YouTube si disponible.
    const thumb = youtubeThumb(file.external_url)
    ms.metadata = new MediaMetadata({
      title:  file.title,
      artist: file.member?.display_name ?? 'Familia',
      album:  total > 1 ? `Familia · ${index + 1}/${total}` : 'Familia · Lecteur',
      artwork: thumb ? [{ src: thumb, sizes: '320x180', type: 'image/jpeg' }] : [],
    })
    ms.setActionHandler('previoustrack', onPrev)
    ms.setActionHandler('nexttrack', onNext)
    ms.setActionHandler('stop', onStop)

    return () => {
      ms.setActionHandler('previoustrack', null)
      ms.setActionHandler('nexttrack', null)
      ms.setActionHandler('stop', null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, index, total, !onPrev, !onNext])
}
