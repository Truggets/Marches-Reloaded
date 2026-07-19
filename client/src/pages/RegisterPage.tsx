import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { WilburCompanion } from '../WilburCompanion'

export function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await register(username, password, inviteCode)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4">
      <div className="flex flex-col items-center gap-2">
        <h1 className="pixel-title text-2xl">Marches Reloaded</h1>
        <p className="italic text-[var(--color-shadow)]/70">Create an account</p>
      </div>

      <form onSubmit={handleSubmit} className="pixel-panel flex w-full max-w-sm flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="username" className="pixel-label">
            Username
          </label>
          <input
            id="username"
            name="username"
            type="text"
            autoComplete="username"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="pixel-input"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="password" className="pixel-label">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="pixel-input"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="inviteCode" className="pixel-label">
            Invite code
          </label>
          <input
            id="inviteCode"
            name="inviteCode"
            type="text"
            autoComplete="off"
            required
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            className="pixel-input"
          />
        </div>

        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}

        <button type="submit" disabled={submitting} className="pixel-btn">
          {submitting ? 'Registering…' : 'Register'}
        </button>

        <p className="text-center text-sm">
          Already have an account? <Link to="/login" className="pixel-link">Log in</Link>
        </p>
      </form>

      <WilburCompanion />
    </div>
  )
}
