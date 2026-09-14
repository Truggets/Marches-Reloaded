import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getClass } from '@data'
import { StepMartial } from '../character-wizard/steps/StepMartial'
import type { CharacterData } from '../character-wizard/types'
import { martialChoiceOwed } from '../engine/computeSheet'

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

/** #26: retroactive Fighting Style / Weapon Mastery picker for a class
 * that's already at or above an unlock/growth level with the choice left
 * unset — mirrors SubclassChoicePage.tsx's role for subclasses. The normal
 * level-up stepper (LevelUpPage.tsx) only offers these choices at the
 * moment a level-up session crosses the relevant level, so it can't reach
 * characters that were already past it before #26 shipped (or a fresh
 * multiclass level-up session that only advances a DIFFERENT class). No
 * level/HP/feat/spell changes here, just these fields — reuses StepMartial,
 * same component the wizard and LevelUpPage use. */
export function MartialChoicePage() {
  const { id, classId } = useParams<{ id: string; classId: string }>()
  const navigate = useNavigate()

  const [character, setCharacter] = useState<CharacterRecord | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [fightingStyleFeatId, setFightingStyleFeatId] = useState<string | null>(null)
  const [fightingStyleAlternateCantrips, setFightingStyleAlternateCantrips] = useState<string[]>([])
  const [newWeaponMasteryIds, setNewWeaponMasteryIds] = useState<string[]>([])

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

  const existingWeaponMasteryIds = entry.weaponMasteryIds ?? []
  const owed = martialChoiceOwed(entry)
  const fightingStyleOwed = owed.fightingStyle
  const masteryOwed = owed.masteryCount

  if (!fightingStyleOwed && masteryOwed <= 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
        <p className="pixel-title text-lg">Nothing owed for {classEntry.name} right now.</p>
        <Link to={`/characters/${id}`} className="pixel-link text-sm">
          &larr; Back to Character Sheet
        </Link>
      </div>
    )
  }

  const combinedWeaponMasteryIds = [...existingWeaponMasteryIds, ...newWeaponMasteryIds]
  // Truthy, not `!== null` — see StepMartial.tsx's '' sentinel note (PR #30 review).
  const fightingStyleDone =
    !fightingStyleOwed || !!fightingStyleFeatId || fightingStyleAlternateCantrips.length === 2
  const masteryDone = masteryOwed <= 0 || newWeaponMasteryIds.length >= masteryOwed
  const canConfirm = fightingStyleDone && masteryDone

  async function confirm() {
    if (!canConfirm || !character || !classId) return
    setSaving(true)
    setError(null)
    try {
      const updatedData: CharacterData = {
        ...character.data,
        classes: character.data.classes.map((c) => {
          if (c.classId !== classId) return c
          return {
            ...c,
            ...(fightingStyleOwed && fightingStyleAlternateCantrips.length === 2
              ? { fightingStyleAlternateCantrips }
              : {}),
            ...(fightingStyleOwed && fightingStyleAlternateCantrips.length !== 2 && fightingStyleFeatId
              ? { fightingStyleFeatId }
              : {}),
            ...(masteryOwed > 0 ? { weaponMasteryIds: combinedWeaponMasteryIds } : {}),
          }
        }),
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
        <h1 className="pixel-title text-xl">Martial Training: {classEntry.name}</h1>
        <p className="text-sm">
          {character.name} is level {entry.level} {classEntry.name}.
        </p>

        <StepMartial
          classId={classId}
          level={entry.level}
          fightingStyleFeatId={fightingStyleFeatId}
          onChangeFightingStyleFeatId={setFightingStyleFeatId}
          fightingStyleAlternateCantrips={fightingStyleAlternateCantrips}
          onChangeFightingStyleAlternateCantrips={setFightingStyleAlternateCantrips}
          weaponMasteryIds={combinedWeaponMasteryIds}
          onChangeWeaponMasteryIds={(ids) =>
            setNewWeaponMasteryIds(ids.filter((wid) => !existingWeaponMasteryIds.includes(wid)))
          }
          lockedWeaponMasteryIds={existingWeaponMasteryIds}
          hideFightingStyle={!fightingStyleOwed}
        />

        {saving && <p className="text-sm italic">Saving…</p>}
        <button type="button" className="pixel-btn w-fit" disabled={!canConfirm || saving} onClick={confirm}>
          Confirm
        </button>
      </div>
    </div>
  )
}
