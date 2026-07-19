import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getBackground, getClass, getSpecies } from '@data'
import type { CharacterData } from '../character-wizard/types'
import { CharacterAvatar } from '../CharacterAvatar'
import { WilburCompanion } from '../WilburCompanion'

interface CharacterSummary {
  id: number
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

export function CharacterListPage() {
  const [characters, setCharacters] = useState<CharacterSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [renamingId, setRenamingId] = useState<number | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [savingRename, setSavingRename] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/characters', {
        method: 'GET',
        credentials: 'include',
      })
      if (!res.ok) {
        throw new Error(await extractErrorMessage(res))
      }
      const body = (await res.json()) as { characters: CharacterSummary[] }
      setCharacters(body.characters)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load characters')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function startRename(c: CharacterSummary) {
    setRenamingId(c.id)
    setRenameValue(c.name)
  }

  async function handleRename(c: CharacterSummary) {
    const name = renameValue.trim()
    if (!name) return
    setSavingRename(true)
    setError(null)
    try {
      // The PUT endpoint has no partial-patch mode — it requires the full
      // `data` object and overwrites it wholesale, so a rename must resend
      // the character's existing data verbatim, not just the new name.
      const res = await fetch(`/api/characters/${c.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, data: c.data }),
      })
      if (!res.ok) {
        throw new Error(await extractErrorMessage(res))
      }
      setRenamingId(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename character')
    } finally {
      setSavingRename(false)
    }
  }

  async function handleDelete(id: number) {
    setDeletingId(id)
    setError(null)
    try {
      const res = await fetch(`/api/characters/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok && res.status !== 204) {
        throw new Error(await extractErrorMessage(res))
      }
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete character')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center gap-6 px-4 py-10">
      <h1 className="pixel-title text-2xl">My Characters</h1>

      <div className="flex gap-3">
        <Link to="/" className="pixel-link text-sm">
          &larr; Home
        </Link>
        <Link to="/characters/new" className="pixel-btn">
          New Character
        </Link>
      </div>

      {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}

      {characters === null && !error && <p className="italic">Loading…</p>}

      {characters !== null && characters.length === 0 && (
        <p className="italic text-[var(--color-shadow)]/70">
          No characters yet — start with "New Character" above.
        </p>
      )}

      <div className="flex w-full max-w-2xl flex-col gap-4">
        {characters?.map((c) => {
          const species = getSpecies(c.data.speciesId)
          const background = getBackground(c.data.backgroundId)
          const classNames = c.data.classes
            .map((entry) => `${getClass(entry.classId)?.name ?? entry.classId} ${entry.level}`)
            .join(' / ')

          const isRenaming = renamingId === c.id

          return (
            <div key={c.id} className="pixel-panel flex flex-wrap items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <CharacterAvatar id={c.id} label={c.name} size={48} />
                <div className="min-w-0">
                  {isRenaming ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        className="pixel-input"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => void handleRename(c)}
                        disabled={savingRename || !renameValue.trim()}
                        className="pixel-btn"
                      >
                        {savingRename ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setRenamingId(null)}
                        disabled={savingRename}
                        className="pixel-btn pixel-btn-secondary"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <Link to={`/characters/${c.id}`} className="pixel-link">
                      <p className="pixel-title text-sm">{c.name}</p>
                    </Link>
                  )}
                  <p className="text-sm">
                    {species?.name ?? c.data.speciesId} {background?.name ?? c.data.backgroundId} —{' '}
                    {classNames}
                  </p>
                </div>
              </div>
              {!isRenaming && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => startRename(c)}
                    className="pixel-btn pixel-btn-secondary"
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(c.id)}
                    disabled={deletingId === c.id}
                    className="pixel-btn pixel-btn-secondary"
                  >
                    {deletingId === c.id ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <WilburCompanion />
    </div>
  )
}
