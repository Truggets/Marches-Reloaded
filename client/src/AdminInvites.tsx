import { useEffect, useState } from 'react'

interface Invite {
  code: string
  createdAt: string
  usedAt: string | null
  usedByUsername: string | null
}

async function extractErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string; error?: string }
    return body.message ?? body.error ?? `Request failed (${res.status})`
  } catch {
    return `Request failed (${res.status})`
  }
}

export function AdminInvites() {
  const [invites, setInvites] = useState<Invite[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [justGenerated, setJustGenerated] = useState<string | null>(null)

  async function loadInvites() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/invites', { credentials: 'include' })
      if (!res.ok) throw new Error(await extractErrorMessage(res))
      const data = (await res.json()) as { invites: Invite[] }
      setInvites(data.invites)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadInvites()
  }, [])

  async function handleGenerate() {
    setGenerating(true)
    setError(null)
    setJustGenerated(null)
    try {
      const res = await fetch('/api/admin/invites', {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) throw new Error(await extractErrorMessage(res))
      const data = (await res.json()) as { code: string }
      setJustGenerated(data.code)
      await loadInvites()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setGenerating(false)
    }
  }

  const unused = invites.filter((i) => !i.usedAt)

  return (
    <div className="pixel-panel mt-2 flex w-80 flex-col gap-3">
      <span className="pixel-label">Invite codes</span>

      <button type="button" onClick={() => void handleGenerate()} disabled={generating} className="pixel-btn">
        {generating ? 'Generating…' : 'Generate invite code'}
      </button>

      {justGenerated && (
        <p className="text-center text-lg font-semibold tracking-wide">{justGenerated}</p>
      )}

      {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}

      <div className="flex flex-col gap-1 text-sm">
        {loading ? (
          <p className="italic text-[var(--color-shadow)]/70">Loading…</p>
        ) : unused.length === 0 ? (
          <p className="italic text-[var(--color-shadow)]/70">No unused codes.</p>
        ) : (
          <>
            <span className="pixel-label">Unused</span>
            {unused.map((invite) => (
              <p key={invite.code} className="font-mono">
                {invite.code}
              </p>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
