import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './useAuth'

export default function AuthCallback() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    // The Supabase SDK automatically exchanges the PKCE code in the URL
    // and fires onAuthStateChange, which updates the session in AuthProvider.
    if (!loading && session) {
      navigate('/', { replace: true })
    }
  }, [session, loading, navigate])

  if (!loading && !session) {
    return (
      <div>
        <p style={{ color: 'red' }}>
          Échec de connexion. Le lien est peut-être expiré.
        </p>
        <a href="/login">Retour au login</a>
      </div>
    )
  }

  return <p>Connexion en cours...</p>
}
