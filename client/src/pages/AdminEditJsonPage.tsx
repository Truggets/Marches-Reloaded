import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import type { CharacterData } from '../character-wizard/types'
import { useAuth } from '../auth/AuthContext'
import { WilburCompanion } from '../WilburCompanion'

interface CharacterRecord {
  id: number
  ownerId: number
  name: string
  data: CharacterData
}

async function extractErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string; error?: string }
    return body.message ?? body.error ?? `Request failed (${res.status})`
  } catch {
    return `Request failed (${res.status})`
  }
}

/**
 * Admin/QA-only raw-JSON character editor (issue #14). Lets an admin set or
 * override any field of a character's data directly, skipping the
 * multi-step creation wizard entirely — for fast bug reproduction, not
 * player-facing use.
 *
 * This is a thin client over endpoints that already support it unchanged:
 * `PUT /api/characters/:id` already accepts an arbitrary `data` object with
 * no game-rules validation (server-side rules validation is deliberately
 * absent — the rules engine is strictly client-side, see CLAUDE.md), and
 * `canAccess()` already grants an admin session access to any character,
 * not just their own. See docs/planning/issue-14-plan.md.
 *
 * Client-side gating here is cosmetic (hides the page from non-admins); the
 * real authorization is server-side on GET/PUT /api/characters/:id, same
 * pattern as PartyViewPage.
 */
export function AdminEditJsonPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [text, setText] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [forbidden, setForbidden] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`/api/characters/${id}`, { credentials: 'include' })
        if (res.status === 404) {
          if (!cancelled) setNotFound(true)
          return
        }
        if (res.status === 403) {
          if (!cancelled) setForbidden(true)
          return
        }
        if (!res.ok) throw new Error(await extractErrorMessage(res))
        const body = (await res.json()) as { character: CharacterRecord }
        if (!cancelled) {
          setText(JSON.stringify({ name: body.character.name, data: body.character.data }, null, 2))
          setLoaded(true)
        }
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load character')
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [id])

  async function handleSave() {
    setSaveError(null)

    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      setSaveError('Not valid JSON — fix the syntax error and try again.')
      return
    }

    // Mirror the server's own two checks (characters.js) so a malformed
    // blob produces a friendly inline message instead of an opaque 400.
    // Nothing beyond this is validated — bypassing game-rules validation is
    // the entire point of this tool.
    const { name, data } = (parsed ?? {}) as { name?: unknown; data?: unknown }
    if (typeof name !== 'string' || !name.trim()) {
      setSaveError('"name" is required and must be a non-empty string.')
      return
    }
    if (data === undefined || data === null || typeof data !== 'object') {
      setSaveError('"data" is required and must be an object.')
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/characters/${id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, data }),
      })
      if (!res.ok) throw new Error(await extractErrorMessage(res))
      navigate(`/characters/${id}`)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save character')
    } finally {
      setSaving(false)
    }
  }

  if (!user?.isAdmin) {
    return <Navigate to="/characters" replace />
  }

  if (notFound) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2">
        <p>Character not found.</p>
        <Link to="/characters" className="pixel-link text-sm">
          &larr; My Characters
        </Link>
      </div>
    )
  }

  if (forbidden) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2">
        <p>You don't have permission to edit this character.</p>
        <Link to="/characters" className="pixel-link text-sm">
          &larr; My Characters
        </Link>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center gap-6 px-4 py-10">
      <h1 className="pixel-title text-2xl">Edit JSON</h1>

      <Link to={`/characters/${id}`} className="pixel-link text-sm">
        &larr; Back to character
      </Link>

      <div className="pixel-panel flex w-full max-w-3xl flex-col gap-3">
        <p className="text-sm text-[var(--color-danger)]">
          Admin/QA tool — bypasses all validation. You can save data that crashes the
          character sheet (the rules engine throws on invalid data by design; the page's
          error boundary will catch it). Not for player use.
        </p>

        {loadError && <p className="text-sm text-[var(--color-danger)]">{loadError}</p>}
        {!loaded && !loadError && <p className="italic">Loading…</p>}

        {loaded && (
          <>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
              className="pixel-input h-[32rem] w-full font-mono text-xs"
            />
            {saveError && <p className="text-sm text-[var(--color-danger)]">{saveError}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => void handleSave()} disabled={saving} className="pixel-btn">
                {saving ? 'Saving…' : 'Save'}
              </button>
              <Link to={`/characters/${id}`} className="pixel-btn pixel-btn-secondary">
                Cancel
              </Link>
            </div>
          </>
        )}
      </div>

      <WilburCompanion />
    </div>
  )
}
