import { Navigate, Outlet } from 'react-router-dom'
import { useMember } from './useMember'
import LoadingPage from '../components/LoadingPage'

export default function RequireMember() {
  const { data: member, isPending } = useMember()

  // isPending = no data yet, regardless of fetchStatus (covers the pending/idle
  // gap in TanStack Query v5 where isLoading would be false but data is still undefined).
  // Background refetches don't set isPending — they serve stale data while revalidating.
  if (isPending) return <LoadingPage />
  if (!member) return <Navigate to="/onboarding" replace />
  return <Outlet />
}
