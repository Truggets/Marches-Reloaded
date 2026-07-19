import { useState } from 'react'
import { useAuth } from './auth/AuthContext'
import { WilburCompanion } from './WilburCompanion'
import { AdminInvites } from './AdminInvites'

function ChangePasswordForm({ onDone }: { onDone: () => void }) {
  const { changePassword } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await changePassword(currentPassword, newPassword)
      setSuccess(true)
      setCurrentPassword('')
      setNewPassword('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    }
  }

  if (success) {
    return (
      <div className="pixel-panel mt-2 flex flex-col items-center gap-2 text-sm">
        <p className="text-[var(--color-arcane)]">Password changed.</p>
        <button type="button" onClick={onDone} className="pixel-link text-sm">
          Close
        </button>
      </div>
    )
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="pixel-panel mt-2 flex w-72 flex-col gap-3"
    >
      <label className="flex flex-col gap-1">
        <span className="pixel-label">Current password</span>
        <input
          type="password"
          required
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className="pixel-input"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="pixel-label">New password</span>
        <input
          type="password"
          required
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="pixel-input"
        />
      </label>
      {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" className="pixel-btn">
          Save
        </button>
        <button type="button" onClick={onDone} className="pixel-btn pixel-btn-secondary">
          Cancel
        </button>
      </div>
    </form>
  )
}

function App() {
  const { user, logout } = useAuth()
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [showInvites, setShowInvites] = useState(false)

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4">
      <h1 className="pixel-title text-3xl">Marches Reloaded</h1>
      <p className="italic text-[var(--color-shadow)]/70">Character builder — under construction</p>
      {user && (
        <div className="mt-4 flex flex-col items-center gap-3">
          <p className="text-sm">
            Logged in as <span className="font-semibold">{user.username}</span>
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowChangePassword((v) => !v)}
              className="pixel-btn pixel-btn-secondary"
            >
              Change password
            </button>
            <button type="button" onClick={() => void logout()} className="pixel-btn pixel-btn-secondary">
              Log out
            </button>
            {user.isAdmin && (
              <button
                type="button"
                onClick={() => setShowInvites((v) => !v)}
                className="pixel-btn pixel-btn-secondary"
              >
                Invite codes
              </button>
            )}
          </div>
          {showChangePassword && (
            <ChangePasswordForm onDone={() => setShowChangePassword(false)} />
          )}
          {showInvites && user.isAdmin && <AdminInvites />}
        </div>
      )}
      <WilburCompanion />
    </div>
  )
}

export default App
