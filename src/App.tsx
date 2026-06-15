import { lazy, Suspense } from 'react'
import { createBrowserRouter, RouterProvider, Outlet, useLocation } from 'react-router-dom'
import LoginPage from './auth/LoginPage'
import AuthCallback from './auth/AuthCallback'
import RequireAuth from './auth/RequireAuth'
import RequireMember from './auth/RequireMember'
import LoadingPage from './components/LoadingPage'
import { OfflineBanner } from './components/OfflineBanner'
import BottomNav from './components/BottomNav'

const OnboardingPage  = lazy(() => import('./pages/OnboardingPage'))
const HomePage        = lazy(() => import('./pages/HomePage'))
const GroceriesPage   = lazy(() => import('./features/groceries/GroceriesPage'))
const SavedListsPage  = lazy(() => import('./features/groceries/SavedListsPage'))
const CatalogPage     = lazy(() => import('./features/groceries/CatalogPage'))
const CalendarPage    = lazy(() => import('./features/calendar/CalendarPage'))
const SettingsPage    = lazy(() => import('./pages/SettingsPage'))
const KakeboPage      = lazy(() => import('./features/kakebo/KakeboPage'))
const HabitsPage      = lazy(() => import('./features/habits/HabitsPage'))
const MediaPage       = lazy(() => import('./features/media/MediaPage'))
const LecteurPage     = lazy(() => import('./features/lecteur/LecteurPage'))
const MomentsPage     = lazy(() => import('./features/moments/MomentsPage'))
const TrainingPage    = lazy(() => import('./features/training/TrainingPage'))
const VelovPage       = lazy(() => import('./features/velov/VelovPage'))
const SharedListPage  = lazy(() => import('./pages/SharedListPage'))
const JukeboxGuestPage = lazy(() => import('./pages/JukeboxGuestPage'))

function Lazy({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<LoadingPage />}>{children}</Suspense>
}

function AnimatedLayout() {
  const { key } = useLocation()
  return (
    <>
      <div key={key} className="page-enter app-content">
        <Outlet />
      </div>
      <BottomNav />
    </>
  )
}

const router = createBrowserRouter([
  { path: '/login',        element: <LoginPage /> },
  { path: '/auth/callback', element: <AuthCallback /> },
  { path: '/share/:token',  element: <Lazy><SharedListPage /></Lazy> },
  { path: '/soiree/:token', element: <Lazy><JukeboxGuestPage /></Lazy> },
  {
    element: <RequireAuth />,
    children: [
      { path: '/onboarding', element: <Lazy><OnboardingPage /></Lazy> },
      {
        element: <RequireMember />,
        children: [
          {
            element: <AnimatedLayout />,
            children: [
              { path: '/',                   element: <Lazy><HomePage /></Lazy>      },
              { path: '/groceries',          element: <Lazy><GroceriesPage /></Lazy> },
              { path: '/groceries/saved',    element: <Lazy><SavedListsPage /></Lazy>},
              { path: '/groceries/catalog',  element: <Lazy><CatalogPage /></Lazy>   },
              { path: '/calendar',           element: <Lazy><CalendarPage /></Lazy>  },
              { path: '/settings',           element: <Lazy><SettingsPage /></Lazy>  },
              { path: '/kakebo',             element: <Lazy><KakeboPage /></Lazy>    },
              { path: '/habits',             element: <Lazy><HabitsPage /></Lazy>    },
              { path: '/media',              element: <Lazy><MediaPage /></Lazy>     },
              { path: '/lecteur',            element: <Lazy><LecteurPage /></Lazy>   },
              { path: '/moments',            element: <Lazy><MomentsPage /></Lazy>   },
              { path: '/training',           element: <Lazy><TrainingPage /></Lazy>  },
              { path: '/velov',              element: <Lazy><VelovPage /></Lazy>     },
            ],
          },
        ],
      },
    ],
  },
])

export default function App() {
  return (
    <>
      <OfflineBanner />
      <RouterProvider router={router} />
    </>
  )
}
