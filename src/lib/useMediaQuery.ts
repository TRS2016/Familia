import { useSyncExternalStore } from 'react'

/**
 * S'abonne à une media query CSS depuis React.
 *
 * useSyncExternalStore plutôt que useState + useEffect : pas de rendu
 * intermédiaire à la mauvaise valeur, donc pas de flash de mise en page
 * quand le composant choisit sa disposition selon la largeur.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    cb => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', cb)
      return () => mql.removeEventListener('change', cb)
    },
    () => window.matchMedia(query).matches,
    () => false, // SSR / pré-rendu : on part du cas mobile
  )
}

/** Écran large : la page dispose d'au moins deux colonnes utiles. */
export const MQ_WIDE = '(min-width: 1024px)'

/** Mode « navigation sidebar » — doit rester aligné sur DESKTOP-NAV (src/index.css). */
export const MQ_DESKTOP_NAV = '(min-width: 768px) and (pointer: fine), (min-width: 1024px)'

export const useIsWide = () => useMediaQuery(MQ_WIDE)
