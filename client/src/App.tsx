import { useState } from 'react'
import { useAuth } from './auth/AuthContext'

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
      <div className="mt-2 flex flex-col items-center gap-2 text-sm">
        <p className="text-green-700">Password changed.</p>
        <button
          type="button"
          onClick={onDone}
          className="text-gray-500 underline hover:text-gray-700"
        >
          Close
        </button>
      </div>
    )
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="mt-2 flex w-64 flex-col gap-2 rounded border border-gray-200 p-3"
    >
      <label className="flex flex-col gap-1 text-sm">
        Current password
        <input
          type="password"
          required
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className="rounded border border-gray-300 px-2 py-1"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        New password
        <input
          type="password"
          required
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="rounded border border-gray-300 px-2 py-1"
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

function App() {
  const { user, logout } = useAuth()
  const [showChangePassword, setShowChangePassword] = useState(false)

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2">
      <h1 className="text-4xl font-bold">Marches Reloaded</h1>
      <p className="text-gray-500">Character builder — under construction</p>
      {user && (
        <div className="mt-4 flex flex-col items-center gap-2">
          <p className="text-sm text-gray-500">
            Logged in as <span className="font-medium text-gray-900">{user.username}</span>
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowChangePassword((v) => !v)}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Change password
            </button>
            <button
              type="button"
              onClick={() => void logout()}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Log out
            </button>
          </div>
          {showChangePassword && (
            <ChangePasswordForm onDone={() => setShowChangePassword(false)} />
          )}
        </div>
      )}
    </div>
  )
}

export default App
