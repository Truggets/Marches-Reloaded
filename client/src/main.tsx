import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './auth/AuthContext'
import { RequireAuth } from './auth/RequireAuth'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { CharacterListPage } from './pages/CharacterListPage'
import { CreateCharacterPage } from './pages/CreateCharacterPage'
import { CharacterSheetPage } from './pages/CharacterSheetPage'
import { LevelUpPage } from './pages/LevelUpPage'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
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
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
