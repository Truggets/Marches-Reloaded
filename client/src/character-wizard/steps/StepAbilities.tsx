import { useEffect, useState } from 'react'
import { rollSixAbilityScores } from '../dice'
import { ABILITIES, type Ability, type AbilityScoresData } from '../types'

interface Props {
  backgroundAbilities: string[]
  value: AbilityScoresData | null
  onChange: (data: AbilityScoresData) => void
}

type RollMode = 'roll' | 'manual'

export function StepAbilities({ backgroundAbilities, value, onChange }: Props) {
  const [mode, setMode] = useState<RollMode | null>(value ? 'manual' : null)
  const [rolls, setRolls] = useState<[number, number, number, number, number, number]>(
    value?.rolls ?? [10, 10, 10, 10, 10, 10],
  )
  const [rollsSet, setRollsSet] = useState(!!value)
  // assignment holds, per ability, the INDEX into rolls[] that's assigned to
  // it (not the value) so duplicate roll values don't collide.
  const [assignment, setAssignment] = useState<Partial<Record<Ability, number>>>(() => {
    if (!value) return {}
    const out: Partial<Record<Ability, number>> = {}
    for (const ability of ABILITIES) {
      const idx = value.rolls.findIndex(
        (_, i) => value.assignment[ability] === value.rolls[i] && !Object.values(out).includes(i),
      )
      if (idx !== -1) out[ability] = idx
    }
    return out
  })
  const [increaseMode, setIncreaseMode] = useState<'plusTwo' | 'plusOneAll' | null>(
    value ? (value.backgroundIncrease.plusOne && value.backgroundIncrease.plusOne.length === 3 ? 'plusOneAll' : 'plusTwo') : null,
  )
  const [plusTwoAbility, setPlusTwoAbility] = useState<string | null>(
    value?.backgroundIncrease.plusTwo ?? null,
  )
  const [plusOneAbility, setPlusOneAbility] = useState<string | null>(
    value && value.backgroundIncrease.plusOne && value.backgroundIncrease.plusOne.length === 1
      ? value.backgroundIncrease.plusOne[0]
      : null,
  )

  const allAssigned = ABILITIES.every((a) => assignment[a] !== undefined)
  const usedIndexes = new Set(Object.values(assignment))

  function handleRoll() {
    setRolls(rollSixAbilityScores())
    setRollsSet(true)
    setAssignment({})
  }

  function handleManualChange(index: number, raw: string) {
    const n = Math.max(3, Math.min(18, parseInt(raw, 10) || 3))
    const next = [...rolls] as typeof rolls
    next[index] = n
    setRolls(next)
    setRollsSet(true)
  }

  function assign(ability: Ability, idxRaw: string) {
    const idx = idxRaw === '' ? undefined : parseInt(idxRaw, 10)
    setAssignment((prev) => {
      const next = { ...prev }
      if (idx === undefined) {
        delete next[ability]
      } else {
        next[ability] = idx
      }
      return next
    })
  }

  // Push a complete AbilityScoresData up to the parent whenever everything
  // needed is set. Background-increase fields are optional at this point;
  // the parent only needs a valid object once assignment is complete, and
  // we still push increase updates afterward.
  useEffect(() => {
    if (!allAssigned) return
    const finalAssignment = {} as Record<Ability, number>
    for (const ability of ABILITIES) {
      finalAssignment[ability] = rolls[assignment[ability]!]
    }

    const backgroundIncrease: AbilityScoresData['backgroundIncrease'] = {}
    if (increaseMode === 'plusTwo' && plusTwoAbility && plusOneAbility) {
      backgroundIncrease.plusTwo = plusTwoAbility
      backgroundIncrease.plusOne = [plusOneAbility]
    } else if (increaseMode === 'plusOneAll' && backgroundAbilities.length === 3) {
      backgroundIncrease.plusOne = [...backgroundAbilities]
    }

    onChange({ rolls, assignment: finalAssignment, backgroundIncrease })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allAssigned, rolls, assignment, increaseMode, plusTwoAbility, plusOneAbility, backgroundAbilities])

  function scoreFor(ability: Ability): number {
    const idx = assignment[ability]
    let base = idx === undefined ? 0 : rolls[idx]
    if (increaseMode === 'plusTwo') {
      if (ability === plusTwoAbility) base = Math.min(20, base + 2)
      if (ability === plusOneAbility) base = Math.min(20, base + 1)
    } else if (increaseMode === 'plusOneAll' && backgroundAbilities.includes(ability)) {
      base = Math.min(20, base + 1)
    }
    return base
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="pixel-title text-lg">Ability Scores</h2>

      {!mode && (
        <div className="flex gap-3">
          <button type="button" className="pixel-btn" onClick={() => setMode('roll')}>
            Roll for me
          </button>
          <button type="button" className="pixel-btn pixel-btn-secondary" onClick={() => setMode('manual')}>
            Enter my own roll
          </button>
        </div>
      )}

      {mode === 'roll' && (
        <div className="flex flex-col gap-3">
          <button type="button" className="pixel-btn" onClick={handleRoll}>
            {rollsSet ? 'Reroll' : 'Roll 4d6 drop lowest x6'}
          </button>
          {rollsSet && (
            <p className="font-mono text-sm">Rolls: {rolls.join(', ')}</p>
          )}
        </div>
      )}

      {mode === 'manual' && (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {rolls.map((r, i) => (
            <label key={i} className="flex flex-col gap-1">
              <span className="pixel-label">Roll {i + 1}</span>
              <input
                type="number"
                min={3}
                max={18}
                value={r}
                onChange={(e) => handleManualChange(i, e.target.value)}
                className="pixel-input"
              />
            </label>
          ))}
        </div>
      )}

      {mode && rollsSet && (
        <div className="flex flex-col gap-3">
          <h3 className="pixel-label">Assign scores to abilities</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {ABILITIES.map((ability) => (
              <label key={ability} className="flex flex-col gap-1">
                <span className="pixel-label">{ability}</span>
                <select
                  className="pixel-input"
                  value={assignment[ability] ?? ''}
                  onChange={(e) => assign(ability, e.target.value)}
                >
                  <option value="">-- select --</option>
                  {rolls.map((r, i) =>
                    !usedIndexes.has(i) || assignment[ability] === i ? (
                      <option key={i} value={i}>
                        {r}
                      </option>
                    ) : null,
                  )}
                </select>
              </label>
            ))}
          </div>
        </div>
      )}

      {mode && allAssigned && backgroundAbilities.length === 3 && (
        <div className="flex flex-col gap-3">
          <h3 className="pixel-label">Background Ability Increase</h3>
          <p className="text-sm">
            Your background lists: {backgroundAbilities.join(', ')}. Increase one by 2 and a
            different one by 1, or increase all three by 1.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              className={`pixel-btn ${increaseMode === 'plusTwo' ? '' : 'pixel-btn-secondary'}`}
              onClick={() => setIncreaseMode('plusTwo')}
            >
              +2 / +1 split
            </button>
            <button
              type="button"
              className={`pixel-btn ${increaseMode === 'plusOneAll' ? '' : 'pixel-btn-secondary'}`}
              onClick={() => setIncreaseMode('plusOneAll')}
            >
              +1 to all three
            </button>
          </div>

          {increaseMode === 'plusTwo' && (
            <div className="flex gap-4">
              <label className="flex flex-col gap-1">
                <span className="pixel-label">+2 to</span>
                <select
                  className="pixel-input"
                  value={plusTwoAbility ?? ''}
                  onChange={(e) => setPlusTwoAbility(e.target.value || null)}
                >
                  <option value="">-- select --</option>
                  {backgroundAbilities.map((a) => (
                    <option key={a} value={a} disabled={a === plusOneAbility}>
                      {a}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="pixel-label">+1 to</span>
                <select
                  className="pixel-input"
                  value={plusOneAbility ?? ''}
                  onChange={(e) => setPlusOneAbility(e.target.value || null)}
                >
                  <option value="">-- select --</option>
                  {backgroundAbilities.map((a) => (
                    <option key={a} value={a} disabled={a === plusTwoAbility}>
                      {a}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 text-sm sm:grid-cols-6">
            {ABILITIES.map((a) => (
              <div key={a} className="pixel-frame p-2 text-center">
                <div className="pixel-label">{a.slice(0, 3)}</div>
                <div className="font-mono">{scoreFor(a)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
