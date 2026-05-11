import { Navigate, Outlet } from 'react-router-dom'
import { useMember } from './useMember'

export default function RequireMember() {
  const { data: member, isLoading } = useMember()

  // isLoading = true only on first fetch (no cached data yet).
  // Background refetches keep isLoading false and serve stale data — intentional.
  if (isLoading) return <p>Chargement...</p>
  if (!member) return <Navigate to="/onboarding" replace />
  return <Outlet />
}
