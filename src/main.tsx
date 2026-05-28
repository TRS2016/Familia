import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// Apply saved theme before first paint to avoid flash
const savedTheme = localStorage.getItem('familia-theme')
if (savedTheme === 'dark' || savedTheme === 'light') {
  document.documentElement.setAttribute('data-theme', savedTheme)
}
import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { AuthProvider } from './auth/AuthProvider'
import ErrorBoundary from './components/ErrorBoundary'
import { ToastProvider } from './components/Toast'
import { UpdatePrompt } from './components/UpdatePrompt'
import App from './App'
import './design-tokens.css'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 24, // 24h — données lisibles hors-ligne
      staleTime: 1000 * 60 * 2,     // 2min — revalidation silencieuse en fond
    },
  },
})

const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: 'familia-qc',
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <PersistQueryClientProvider client={queryClient} persistOptions={{ persister }}>
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
