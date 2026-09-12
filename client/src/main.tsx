import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { initPacks } from '@data'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './ErrorBoundary'
import { AuthProvider } from './auth/AuthContext'
import { RequireAuth } from './auth/RequireAuth'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { CharacterListPage } from './pages/CharacterListPage'
import { CreateCharacterPage } from './pages/CreateCharacterPage'
import { CharacterSheetPage } from './pages/CharacterSheetPage'
import { LevelUpPage } from './pages/LevelUpPage'
import { CombatSandboxPage } from './pages/CombatSandboxPage'
import { PartyViewPage } from './pages/PartyViewPage'
import { AdminEditJsonPage } from './pages/AdminEditJsonPage'
import { AdminPackImportPage } from './pages/AdminPackImportPage'
import { NotFoundPage } from './pages/NotFoundPage'

// M2b: merge any admin-imported content packs in before the app renders, so
// every synchronous @data call (listFeats, getFeat, etc.) sees complete data
// on its very first render — no loading states scattered through the
// wizard. Degrades gracefully (see initPacks) rather than blocking on
// failure, so this is a fast, bounded wait, not a real risk of hanging.
void initPacks().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <BrowserRouter>
          <AuthProvider>
            <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route
              path="/"
              element={
                <RequireAuth>
                  <App />
                </RequireAuth>
              }
            />
            <Route
              path="/characters"
              element={
                <RequireAuth>
                  <CharacterListPage />
                </RequireAuth>
              }
            />
            <Route
              path="/characters/new"
              element={
                <RequireAuth>
                  <CreateCharacterPage />
                </RequireAuth>
              }
            />
            <Route
              path="/characters/:id"
              element={
                <RequireAuth>
                  <CharacterSheetPage />
                </RequireAuth>
              }
            />
            <Route
              path="/characters/:id/level-up"
              element={
                <RequireAuth>
                  <LevelUpPage />
                </RequireAuth>
              }
            />
            <Route
              path="/characters/:id/sandbox"
              element={
                <RequireAuth>
                  <CombatSandboxPage />
                </RequireAuth>
              }
            />
            <Route
              path="/characters/:id/edit-json"
              element={
                <RequireAuth>
                  <AdminEditJsonPage />
                </RequireAuth>
              }
            />
            <Route
              path="/admin/packs/import"
              element={
                <RequireAuth>
                  <AdminPackImportPage />
                </RequireAuth>
              }
            />
            <Route
              path="/party"
              element={
                <RequireAuth>
                  <PartyViewPage />
                </RequireAuth>
              }
            />
            <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </ErrorBoundary>
    </StrictMode>,
  )
})
