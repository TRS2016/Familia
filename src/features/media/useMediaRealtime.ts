import { useRealtimeInvalidation } from '../../lib/useRealtimeInvalidation'
import { MEDIA_KEY, MEDIA_RATINGS_KEY } from './useMedia'

export function useMediaRealtime() {
  useRealtimeInvalidation('media-changes', [
    { table: 'media_items', keys: [MEDIA_KEY] },
    { table: 'media_ratings', keys: [MEDIA_RATINGS_KEY] },
  ])
}
