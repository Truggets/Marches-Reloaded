import { useAuth } from './auth/AuthContext'

function App() {
  const { user, logout } = useAuth()

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2">
      <h1 className="text-4xl font-bold">Marches Reload</h1>
      <p className="text-gray-500">Character builder — under construction</p>
      {user && (
        <div className="mt-4 flex flex-col items-center gap-2">
          <p className="text-sm text-gray-500">
            Logged in as <span className="font-medium text-gray-900">{user.username}</span>
          </p>
          <button
            type="button"
            onClick={() => void logout()}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Log out
          </button>
        </div>
      )}
    </div>
  )
}

export default App
