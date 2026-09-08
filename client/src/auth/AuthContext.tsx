import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { initPacks } from '@data'

export interface User {
  id: number
  username: string
  isAdmin: boolean
}

interface AuthContextValue {
  user: User | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  register: (
    username: string,
    password: string,
    inviteCode: string,
  ) => Promise<void>
  logout: () => Promise<void>
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

interface UserResponse {
  user: User
}

async function extractErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string; error?: string }
    return body.message ?? body.error ?? `Request failed (${res.status})`
  } catch {
    return `Request failed (${res.status})`
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function loadSession() {
      try {
        const res = await fetch('/api/auth/me', {
          method: 'GET',
          credentials: 'include',
        })
        if (res.ok) {
          const data = (await res.json()) as UserResponse
          if (!cancelled) setUser(data.user)
        } else {
          if (!cancelled) setUser(null)
        }
      } catch {
        if (!cancelled) setUser(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadSession()

    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, password }),
    })
    if (!res.ok) {
      throw new Error(await extractErrorMessage(res))
    }
    const data = (await res.json()) as UserResponse
    // main.tsx's initPacks() call runs once, before the router mounts —
    // for a visitor who wasn't already holding a valid session cookie,
    // that fetch 401s (GET /api/packs is auth-gated) and is swallowed as
    // "SRD-only for now." Re-run it now that we actually have a session,
    // so pages mounted after this (character wizard, level-up) see any
    // imported content instead of staying SRD-only for the whole session.
    await initPacks()
    setUser(data.user)
  }, [])

  const register = useCallback(
    async (username: string, password: string, inviteCode: string) => {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password, inviteCode }),
      })
      if (!res.ok) {
        throw new Error(await extractErrorMessage(res))
      }
      const data = (await res.json()) as UserResponse
      await initPacks() // same reasoning as login() above
      setUser(data.user)
    },
    [],
  )

  const logout = useCallback(async () => {
    const res = await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    })
    if (!res.ok && res.status !== 204) {
      throw new Error(await extractErrorMessage(res))
    }
    setUser(null)
  }, [])

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      if (!res.ok) {
        throw new Error(await extractErrorMessage(res))
      }
    },
    [],
  )

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, logout, changePassword }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}
