import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/useAuth'

export default function HomePage() {
  const { session } = useAuth()

  // Guaranteed non-null by RequireAuth, but TypeScript doesn't know that.
  if (!session) return null

  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  return (
    <div>
      <h1>Familia</h1>
      <p>✅ Connecté en tant que {session.user.email}</p>
      <p>ID utilisateur : {session.user.id}</p>
      <p>Aucun membre associé pour le moment.</p>
      <button onClick={handleSignOut}>Se déconnecter</button>
    </div>
  )
}
