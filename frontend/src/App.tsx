import { Navigate, Route, Routes } from 'react-router-dom'
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { ErrorBoundary } from './components/ErrorBoundary'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'
import { SimulationPage } from './pages/SimulationPage'
import { SettingsPage } from './pages/SettingsPage'

function RequireAuth({ children }: { children: ReactNode }) {
  const user = localStorage.getItem('sim-user-nim')
  if (!user) return <Navigate to="/" replace />
  return children
}

function App() {
  useEffect(() => {
    const savedTheme = (localStorage.getItem('theme') as 'dark' | 'light') ?? 'dark'
    document.documentElement.setAttribute('data-theme', savedTheme)
  }, [])
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route
          path="/dashboard"
          element={(
            <RequireAuth>
              <DashboardPage />
            </RequireAuth>
          )}
        />
        <Route
          path="/simulation"
          element={(
            <RequireAuth>
              <SimulationPage />
            </RequireAuth>
          )}
        />
        <Route
          path="/settings"
          element={(
            <RequireAuth>
              <SettingsPage />
            </RequireAuth>
          )}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ErrorBoundary>
  )
}

export default App
