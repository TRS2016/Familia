import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// Apply saved theme before first paint to avoid flash
const savedTheme = localStorage.getItem('familia-theme')
if (savedTheme === 'dark' || savedTheme === 'light') {
  document.documentElement.setAttribute('data-theme', savedTheme)
}
import { QueryClient } from '@tanstack/react-query'
import type { Query } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { AuthProvider } from './auth/AuthProvider'
import ErrorBoundary from './components/ErrorBoundary'
import { ToastProvider } from './components/Toast'
import { UpdatePrompt } from './components/UpdatePrompt'
import App from './App'
import './design-tokens.css'
import './index.css'

// Après un déploiement, l'ancien index.html (servi par le service worker) peut
// référencer des chunks JS hashés désormais supprimés → l'import() dynamique échoue.
// Vite émet alors `vite:preloadError` : on recharge la page une seule fois pour
// récupérer le nouvel index.html (garde anti-boucle via sessionStorage).
window.addEventListener('vite:preloadError', () => {
  if (!navigator.onLine) return // hors-ligne : inutile de recharger, on garde l'app en cache
  if (sessionStorage.getItem('familia-chunk-reloaded')) return
  sessionStorage.setItem('familia-chunk-reloaded', '1')
  window.location.reload()
})
window.addEventListener('load', () => {
  // Le chargement a réussi : on réarme la garde pour le prochain déploiement.
  sessionStorage.removeItem('familia-chunk-reloaded')
})

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 24, // 24h — données lisibles hors-ligne
      staleTime: 1000 * 60 * 2,     // 2min — revalidation silencieuse en fond
    },
    mutations: {
      networkMode: 'offlineFirst', // mutations mises en pause si hors-ligne, rejouées à la reconnexion
    },
  },
})

const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: 'familia-qc',
})

// Ce que l'on persiste dans localStorage. Sans filtre, TOUT le cache y était
// réécrit de façon synchrone à chaque mutation : sur plusieurs années de
// données, on s'approche du quota (~5 Mo, échec silencieux qui vide le mode
// hors-ligne) et chaque écriture bloque le thread principal.
//
// Sont exclues les URL signées : elles expirent en 30 min à 2 h, les restaurer
// ne sert donc à rien, et ce sont les entrées les plus volumineuses du cache
// (une par photo). Les préfixes ci-dessous sont ceux réellement utilisés.
const EPHEMERAL_KEY_PREFIXES = [
  'media-file-url', 'chore-proof-url', 'moment-photo-url', 'moment-photo-urls',
]

const persistOptions = {
  persister,
  buster: 'v4', // v3 -> v4 : le format persisté change (cache filtré)
  maxAge: 1000 * 60 * 60 * 24,
  dehydrateOptions: {
    shouldDehydrateQuery: (query: Query) => {
      if (query.state.status !== 'success') return false
      const head = query.queryKey[0]
      if (typeof head === 'string' && EPHEMERAL_KEY_PREFIXES.some(p => head.startsWith(p))) {
        return false
      }
      return true
    },
  },
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
          <UpdatePrompt />
        </ToastProvider>
      </PersistQueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
)
