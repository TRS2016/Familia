import { useRealtimeInvalidation } from '../../lib/useRealtimeInvalidation'
import { MOMENTS_KEY } from './useMoments'

export function useMomentsRealtime() {
  useRealtimeInvalidation('moments-changes', [
    { table: 'moments', keys: [MOMENTS_KEY] },
    { table: 'moment_reactions', keys: [MOMENTS_KEY] },
    { table: 'moment_photos', keys: [MOMENTS_KEY] },
    {
      table: 'moment_comments',
      keysFromPayload: (payload) => {
        const momentId = (payload.new as { moment_id?: string })?.moment_id
          ?? (payload.old as { moment_id?: string })?.moment_id
        return momentId ? [['moment-comments', momentId]] : []
      },
    },
  ])
}
