import { useRealtimeInvalidation } from '../../lib/useRealtimeInvalidation'
import { MEDIA_FILES_KEY, LECTEUR_PL_KEY, lecteurPlItemsKey } from './useLecteur'
import { LECTEUR_QUEUE_KEY, LECTEUR_HISTORY_KEY, LECTEUR_PENDING_KEY } from './useLecteurQueue'

export function useLecteurRealtime() {
  useRealtimeInvalidation('lecteur-changes', [
    { table: 'media_files', keys: [MEDIA_FILES_KEY] },
    { table: 'lecteur_queue', keys: [LECTEUR_QUEUE_KEY, LECTEUR_HISTORY_KEY, LECTEUR_PENDING_KEY] },
    { table: 'playlists', keys: [LECTEUR_PL_KEY] },
    {
      table: 'playlist_items',
      keysFromPayload: (payload) => {
        const playlistId = (payload.new as { playlist_id?: string })?.playlist_id
          ?? (payload.old as { playlist_id?: string })?.playlist_id
        return playlistId ? [lecteurPlItemsKey(playlistId)] : []
      },
    },
  ])
}
