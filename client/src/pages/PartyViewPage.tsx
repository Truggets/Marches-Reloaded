import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { getBackground, getClass, getSpecies } from '@data'
import type { CharacterData } from '../character-wizard/types'
import { CharacterAvatar } from '../CharacterAvatar'
import { useAuth } from '../auth/AuthContext'
import { WilburCompanion } from '../WilburCompanion'

interface PartyCharacter {
  id: number
  ownerUsername: string
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

/** Admin/DM-only read-only view of every character across every account.
 * Client-side gating here is cosmetic (hides the page from non-admins); the
 * real authorization is server-side on GET /api/admin/characters. */
export function PartyViewPage() {
  const { user } = useAuth()
  const [characters, setCharacters] = useState<PartyCharacter[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/admin/characters', { credentials: 'include' })
        if (!res.ok) throw new Error(await extractErrorMessage(res))
        const body = (await res.json()) as { characters: PartyCharacter[] }
        if (!cancelled) setCharacters(body.characters)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load party')
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  if (!user?.isAdmin) {
    return <Navigate to="/characters" replace />
  }

  return (
    <div className="flex min-h-screen flex-col items-center gap-6 px-4 py-10">
      <h1 className="pixel-title text-2xl">Party</h1>

      <Link to="/characters" className="pixel-link text-sm">
        &larr; My Characters
      </Link>

      {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}

      {characters === null && !error && <p className="italic">Loading…</p>}

      {characters !== null && characters.length === 0 && (
        <p className="italic text-[var(--color-shadow)]/70">No characters exist yet.</p>
      )}

      <div className="flex w-full max-w-2xl flex-col gap-4">
        {characters?.map((c) => {
          const species = getSpecies(c.data.speciesId)
          const background = getBackground(c.data.backgroundId)
          const classNames = c.data.classes
            .map((entry) => `${getClass(entry.classId)?.name ?? entry.classId} ${entry.level}`)
            .join(' / ')

          return (
            <div
              key={c.id}
              className="pixel-panel flex flex-wrap items-center justify-between gap-4"
            >
              <div className="flex min-w-0 items-center gap-3">
                <CharacterAvatar id={c.id} label={c.name} size={48} />
                <div className="min-w-0">
                  <Link to={`/characters/${c.id}`} className="pixel-link">
                    <p className="pixel-title text-sm">{c.name}</p>
                  </Link>
                  <p className="text-sm">
                    {species?.name ?? c.data.speciesId} {background?.name ?? c.data.backgroundId} —{' '}
                    {classNames}
                  </p>
                  <p className="text-xs italic text-[var(--color-shadow)]/70">
                    Played by {c.ownerUsername}
                  </p>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <WilburCompanion />
    </div>
  )
}
