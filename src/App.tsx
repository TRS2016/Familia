import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import LoginPage from './auth/LoginPage'
import AuthCallback from './auth/AuthCallback'
import RequireAuth from './auth/RequireAuth'
import RequireMember from './auth/RequireMember'
import OnboardingPage from './pages/OnboardingPage'
import HomePage from './pages/HomePage'
import GroceriesPage from './features/groceries/GroceriesPage'
import CalendarPage from './features/calendar/CalendarPage'
import SettingsPage from './pages/SettingsPage'
import KakeboPage from './features/kakebo/KakeboPage'
import HabitsPage from './features/habits/HabitsPage'

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/auth/callback', element: <AuthCallback /> },
  {
    element: <RequireAuth />,
    children: [
      { path: '/onboarding', element: <OnboardingPage /> },
      {
        element: <RequireMember />,
        children: [
          { path: '/', element: <HomePage /> },
          { path: '/groceries', element: <GroceriesPage /> },
          { path: '/calendar', element: <CalendarPage /> },
          { path: '/settings', element: <SettingsPage /> },
          { path: '/kakebo',   element: <KakeboPage /> },
          { path: '/habits',   element: <HabitsPage /> },
        ],
      },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
