import { useEffect } from 'react'

// Garde l'écran allumé tant que `active` est vrai (réacquiert le verrou au retour
// au premier plan). No-op si l'API Wake Lock n'est pas supportée ou refusée.
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let sentinel: any = null
    let released = false
    const request = async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const nav = navigator as any
        if (nav.wakeLock?.request) sentinel = await nav.wakeLock.request('screen')
      } catch { /* non supporté ou refusé */ }
    }
    const onVis = () => { if (document.visibilityState === 'visible' && !released) request() }
    request()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      released = true
      document.removeEventListener('visibilitychange', onVis)
      try { sentinel?.release?.() } catch { /* déjà relâché */ }
    }
  }, [active])
}
