import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getBackground, getClass, getSpecies } from '@data'
import type { CharacterData } from '../character-wizard/types'
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

          return (
            <div key={c.id} className="pixel-panel flex items-center justify-between gap-4">
              <div>
                <Link to={`/characters/${c.id}`} className="pixel-link">
                  <p className="pixel-title text-sm">{c.name}</p>
                </Link>
                <p className="text-sm">
                  {species?.name ?? c.data.speciesId} {background?.name ?? c.data.backgroundId} —{' '}
                  {classNames}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleDelete(c.id)}
                disabled={deletingId === c.id}
                className="pixel-btn pixel-btn-secondary"
              >
                {deletingId === c.id ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          )
        })}
      </div>

      <WilburCompanion />
    </div>
  )
}
