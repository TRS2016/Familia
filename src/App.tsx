import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import LoginPage from './auth/LoginPage'
import AuthCallback from './auth/AuthCallback'
import RequireAuth from './auth/RequireAuth'
import RequireMember from './auth/RequireMember'
import OnboardingPage from './pages/OnboardingPage'
import HomePage from './pages/HomePage'

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
        ],
      },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
