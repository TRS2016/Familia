import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './useAuth'
import LoadingPage from '../components/LoadingPage'

export default function RequireAuth() {
  const { session, loading } = useAuth()

  if (loading) return <LoadingPage />
  if (!session) return <Navigate to="/login" replace />
  return <Outlet />
}
