import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="pixel-title text-2xl">Page not found</h1>
      <p className="text-sm text-[var(--color-shadow)]/70">
        There's nothing at this address.
      </p>
      <Link to="/" className="pixel-btn">
        Back to Home
      </Link>
    </div>
  )
}
