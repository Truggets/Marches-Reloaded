import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getClass } from '@data'
import { renderEmphasis } from '../EmphasisText'
import type { CharacterData } from '../character-wizard/types'
import { subclassUnlockLevel } from '../engine/computeSheet'

interface CharacterRecord {
  id: number
  ownerId: number
  name: string
  packId: string
  data: CharacterData
  createdAt: string
  updatedAt: string
}

async function extractErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string; error?: string }
    return body.message ?? body.error ?? `Request failed (${res.status})`
  } catch {
    return `Request failed (${res.status})`
  }
}

/** Retroactive subclass-choice page for a class that's already at or above
 * its subclass-unlock level with no subclass chosen — the normal level-up
 * stepper (LevelUpPage.tsx) only offers this choice at the moment a level-up
 * session crosses the unlock level, so it can't reach characters that were
 * already past it before this feature shipped. No level/HP/feat/spell
 * changes here, just the one field. */
export function SubclassChoicePage() {
  const { id, classId } = useParams<{ id: string; classId: string }>()
  const navigate = useNavigate()

  const [character, setCharacter] = useState<CharacterRecord | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch(`/api/characters/${id}`, { method: 'GET', credentials: 'include' })
      if (!res.ok) {
        throw new Error(await extractErrorMessage(res))
      }
      const body = (await res.json()) as { character: CharacterRecord }
      setCharacter(body.character)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load character')
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
        <p className="pixel-title text-lg text-[var(--color-danger)]">{error}</p>
        <Link to={id ? `/characters/${id}` : '/characters'} className="pixel-link text-sm">
          &larr; Back
        </Link>
      </div>
    )
  }

  if (!character || !classId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2">
        <p className="italic">Loading…</p>
      </div>
    )
  }

  const entry = character.data.classes.find((c) => c.classId === classId)
  const classEntry = getClass(classId)
  if (!entry || !classEntry) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
        <p className="pixel-title text-lg text-[var(--color-danger)]">Unknown class: {classId}</p>
        <Link to={`/characters/${id}`} className="pixel-link text-sm">
          &larr; Back
        </Link>
      </div>
    )
  }

  if (classEntry.subclasses.length === 0 || entry.subclassId || entry.level < subclassUnlockLevel(classId)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
        <p className="pixel-title text-lg">
          {classEntry.subclasses.length === 0
            ? 'This class has no subclasses available.'
            : entry.subclassId
              ? 'Subclass already chosen.'
              : 'Not eligible for a subclass yet.'}
        </p>
        <Link to={`/characters/${id}`} className="pixel-link text-sm">
          &larr; Back to Character Sheet
        </Link>
      </div>
    )
  }

  const unlockLevel = subclassUnlockLevel(classId)

  async function confirm() {
    if (!selectedId || !character || !classId) return
    setSaving(true)
    setError(null)
    try {
      const updatedData: CharacterData = {
        ...character.data,
        classes: character.data.classes.map((c) => (c.classId === classId ? { ...c, subclassId: selectedId } : c)),
      }
      const res = await fetch(`/api/characters/${id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: character.name, data: updatedData }),
      })
      if (!res.ok) {
        throw new Error(await extractErrorMessage(res))
      }
      navigate(`/characters/${id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save character')
      setSaving(false)
    }
  }

  return (
    <div className="sheet-page flex min-h-screen flex-col items-center gap-6 px-4 py-10">
      <div className="no-print flex w-full max-w-3xl items-center justify-between gap-3">
        <Link to={`/characters/${id}`} className="pixel-link text-sm">
          &larr; Back to Character Sheet
        </Link>
      </div>
      <div className="pixel-panel flex w-full max-w-3xl flex-col gap-6">
        <h1 className="pixel-title text-xl">Choose a Subclass: {classEntry.name}</h1>
        <p className="text-sm">
          {character.name} is level {entry.level} {classEntry.name}.
        </p>

        <div className="flex flex-col gap-2">
          {classEntry.subclasses.map((sc) => {
            const selected = selectedId === sc.id
            const unlockFeatures = sc.features.filter((f) => f.level === unlockLevel)
            return (
              <button
                key={sc.id}
                type="button"
                className={`pixel-panel !p-3 text-left ${selected ? 'ring-2 ring-[var(--color-arcane)]' : ''}`}
                onClick={() => setSelectedId(sc.id)}
              >
                <p className="pixel-label">{sc.name}</p>
                {sc.flavorLine && <p className="text-sm italic">{sc.flavorLine}</p>}
                {unlockFeatures.map((f) => (
                  <p key={f.name} className="text-sm mt-1">
                    <span className="font-bold">{f.name}.</span> {renderEmphasis(f.description)}
                  </p>
                ))}
              </button>
            )
          })}
        </div>

        {saving && <p className="text-sm italic">Saving…</p>}
        <button type="button" className="pixel-btn w-fit" disabled={!selectedId || saving} onClick={confirm}>
          Confirm Subclass
        </button>
      </div>
    </div>
  )
}
