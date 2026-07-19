import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getClass, getSpellsByClass, listClasses, listFeats } from '@data'
import type { Ability, CharacterClassEntry, CharacterData, LevelUpEntry } from '../character-wizard/types'
import { ABILITIES } from '../character-wizard/types'
import {
  abilityModifier,
  canMulticlassInto,
  featuresForLevel,
  finalAbilityScores,
  hitPointsMulticlass,
  isAsiLevel,
  spellSlots,
  totalCharacterLevel,
} from '../engine/computeSheet'

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

/** Replaces (or appends, for a brand-new class) a single class entry's level
 * within a `classes` array — used to build "before this level" / "after this
 * level" snapshots for the multiclass HP formula, without disturbing which
 * entry is `classes[0]` (the original level-1 class, load-bearing for the
 * "max die only once" rule). */
function withClassLevel(classes: CharacterClassEntry[], classId: string, level: number): CharacterClassEntry[] {
  const idx = classes.findIndex((c) => c.classId === classId)
  if (idx === -1) return [...classes, { classId, level }]
  return classes.map((c, i) => (i === idx ? { ...c, level } : c))
}

type AsiMode = 'one-plus-two' | 'two-plus-one'

export function LevelUpPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [character, setCharacter] = useState<CharacterRecord | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Phase 0: which class this level-up session advances — an existing class
  // entry, or a brand-new class taken via multiclassing.
  const [track, setTrack] = useState<{ classId: string; isNewClass: boolean } | null>(null)

  // Target level selection (existing-class path only — a new class always
  // starts at level 1, so this phase is skipped for it).
  const [targetLevel, setTargetLevel] = useState<number | null>(null)

  // Stepper state.
  const [currentLevel, setCurrentLevel] = useState<number | null>(null)
  const [draftLevelUps, setDraftLevelUps] = useState<LevelUpEntry[]>([])

  // Per-level in-progress choices.
  const [selectedFeatId, setSelectedFeatId] = useState<string | null>(null)
  const [asiMode, setAsiMode] = useState<AsiMode>('one-plus-two')
  const [asiAbilityOne, setAsiAbilityOne] = useState<Ability | ''>('')
  const [asiAbilityTwo, setAsiAbilityTwo] = useState<Ability | ''>('')
  const [grapplerAbility, setGrapplerAbility] = useState<Ability | ''>('')
  const [cantripPicks, setCantripPicks] = useState<string[]>([])
  const [preparedPicks, setPreparedPicks] = useState<string[]>([])

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

  function resetLevelChoices() {
    setSelectedFeatId(null)
    setAsiMode('one-plus-two')
    setAsiAbilityOne('')
    setAsiAbilityTwo('')
    setGrapplerAbility('')
    setCantripPicks([])
    setPreparedPicks([])
  }

  if (error) {
    return <ErrorScreen message={error} id={id} />
  }

  if (!character) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2">
        <p className="italic">Loading…</p>
      </div>
    )
  }

  const data = character.data
  const totalLevel = totalCharacterLevel(data.classes)
  const roomLeft = 10 - totalLevel

  // Data-so-far, folding in every draft levelUp entry recorded this session,
  // used to compute "current" ability scores for capping ASI picks and to
  // compute HP deltas against the level the character is actually at.
  const dataSoFar: CharacterData = {
    ...data,
    levelUps: [...(data.levelUps ?? []), ...draftLevelUps],
  }
  const scoresSoFar = finalAbilityScores(dataSoFar)
  const conModSoFar = abilityModifier(scoresSoFar.Constitution)

  // ---- Phase 0: choose which class this session advances ----
  if (track === null) {
    if (roomLeft <= 0) {
      return <ErrorScreen message="This character is already level 10." id={id} />
    }

    const eligibleNewClasses = listClasses().filter(
      (c) => !data.classes.some((entry) => entry.classId === c.id) && canMulticlassInto(data.classes, scoresSoFar, c.id),
    )

    return (
      <PageShell id={id}>
        <h1 className="pixel-title text-xl">Level Up: {character.name}</h1>
        <p className="text-sm">Character level {totalLevel} / 10. Choose which class advances.</p>

        <section className="flex flex-col gap-2">
          <h2 className="pixel-title text-base">Level an existing class</h2>
          <div className="flex flex-wrap gap-2">
            {data.classes.map((entry) => {
              const classEntry = getClass(entry.classId)
              return (
                <button
                  key={entry.classId}
                  type="button"
                  className="pixel-btn pixel-btn-secondary"
                  onClick={() => setTrack({ classId: entry.classId, isNewClass: false })}
                >
                  {classEntry?.name ?? entry.classId} (currently {entry.level})
                </button>
              )
            })}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="pixel-title text-base">Multiclass into a new class</h2>
          {eligibleNewClasses.length === 0 ? (
            <p className="text-sm italic">
              No eligible classes — this character doesn't meet the ability-score prerequisite (13 in the new
              class's primary ability, and in every current class's primary ability) for any class not already
              held.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {eligibleNewClasses.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="pixel-btn pixel-btn-secondary"
                  onClick={() => {
                    resetLevelChoices()
                    setTrack({ classId: c.id, isNewClass: true })
                    setTargetLevel(1)
                    setCurrentLevel(1)
                  }}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </section>
      </PageShell>
    )
  }

  const { classId, isNewClass } = track
  const classEntry = getClass(classId)
  if (!classEntry) {
    return <ErrorScreen message={`Unknown class: ${classId}`} id={id} />
  }
  const existingEntry = data.classes.find((c) => c.classId === classId)
  const currentClassLevel = existingEntry?.level ?? 0
  const maxTargetForClass = currentClassLevel + roomLeft

  // ---- Phase 1: choose target level (existing-class path only) ----
  if (currentLevel === null) {
    return (
      <PageShell id={id}>
        <h1 className="pixel-title text-xl">Level Up: {character.name}</h1>
        <p className="text-sm">
          Currently level {currentClassLevel} {classEntry.name}. Choose a target level to level up to.
        </p>
        <div className="flex flex-col gap-2">
          <label className="pixel-label" htmlFor="target-level">
            Target level (max {maxTargetForClass})
          </label>
          <input
            id="target-level"
            type="number"
            className="pixel-input w-32"
            min={currentClassLevel + 1}
            max={maxTargetForClass}
            value={targetLevel ?? ''}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10)
              setTargetLevel(Number.isFinite(v) ? v : null)
            }}
          />
        </div>
        <div className="flex gap-3">
          <button type="button" className="pixel-btn pixel-btn-secondary w-fit" onClick={() => setTrack(null)}>
            &larr; Choose a different class
          </button>
          <button
            type="button"
            className="pixel-btn w-fit"
            disabled={
              targetLevel === null || targetLevel <= currentClassLevel || targetLevel > maxTargetForClass
            }
            onClick={() => {
              resetLevelChoices()
              setCurrentLevel(currentClassLevel + 1)
            }}
          >
            Begin Leveling
          </button>
        </div>
      </PageShell>
    )
  }

  // ---- Phase 3: stepper finished, show confirm screen ----
  if (targetLevel !== null && currentLevel > targetLevel) {
    const finalClasses = withClassLevel(data.classes, classId, targetLevel)
    const finalHp = hitPointsMulticlass(finalClasses, conModSoFar, data.speciesId)
    return (
      <PageShell id={id}>
        <h1 className="pixel-title text-xl">Level Up: {character.name}</h1>
        <p className="text-sm">
          Ready to save {classEntry.name} level {currentClassLevel} &rarr; {targetLevel}.
        </p>
        <div className="pixel-panel !p-3 text-sm">
          <p className="pixel-label">Summary</p>
          <ul className="list-disc list-inside">
            {draftLevelUps.map((entry) => (
              <li key={entry.level}>
                Level {entry.level}: +{entry.hitPointGain} HP
                {entry.featChoice ? `, feat: ${entry.featChoice.featId}` : ''}
                {entry.spellsAdded &&
                (entry.spellsAdded.cantrips.length > 0 || entry.spellsAdded.prepared.length > 0)
                  ? `, +${entry.spellsAdded.cantrips.length} cantrip(s), +${entry.spellsAdded.prepared.length} prepared spell(s)`
                  : ''}
              </li>
            ))}
          </ul>
          <p className="mt-2">Estimated final HP: {finalHp}</p>
        </div>
        {saving && <p className="text-sm italic">Saving…</p>}
        <button
          type="button"
          className="pixel-btn w-fit"
          disabled={saving}
          onClick={async () => {
            setSaving(true)
            setError(null)
            try {
              const updatedData: CharacterData = {
                ...data,
                classes: finalClasses,
                levelUps: [...(data.levelUps ?? []), ...draftLevelUps],
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
          }}
        >
          Confirm &amp; Save
        </button>
      </PageShell>
    )
  }

  // ---- Phase 2: stepping through a level ----
  const level = currentLevel
  const features = featuresForLevel(classId, level)
  const asiLevel = isAsiLevel(classId, level)
  const selectedFeat = selectedFeatId ? listFeats('General').find((f) => f.id === selectedFeatId) : undefined
  const isAsiFeatSelected = selectedFeatId === 'ability-score-improvement'
  const isGrapplerFeatSelected = selectedFeatId === 'grappler'

  const prevSlots = spellSlots(classId, level - 1)
  const currSlots = spellSlots(classId, level)
  const isCaster = currSlots !== undefined
  const cantripDelta = isCaster ? currSlots!.cantrips - (prevSlots?.cantrips ?? 0) : 0
  const preparedDelta = isCaster
    ? currSlots!.preparedOrKnown - (prevSlots?.preparedOrKnown ?? 0)
    : 0
  const maxSpellLevel = currSlots
    ? Math.max(
        0,
        ...Object.entries(currSlots.slotsByLevel)
          .filter(([, count]) => count > 0)
          .map(([lvl]) => parseInt(lvl, 10)),
      )
    : 0

  // Spells known/prepared so far FOR THIS CLASS specifically — a new class's
  // spell picks are independent of any other class's spell lists (SRD:
  // spells prepared are determined per class individually). Must include
  // spells from EARLIER, already-saved level-up sessions (data.levelUps),
  // not just the original creation-time picks and this session's
  // in-progress draft — otherwise a spell already learned in a prior
  // level-up gets offered (and re-added) again.
  const isFirstClass = data.classes[0]?.classId === classId
  const priorLevelUps = (data.levelUps ?? []).filter(
    (lu) => (lu.classId ?? data.classes[0]?.classId) === classId,
  )
  const knownCantripsSoFar = isNewClass
    ? []
    : [
        ...(isFirstClass ? data.spells?.cantrips ?? [] : []),
        ...priorLevelUps.flatMap((lu) => lu.spellsAdded?.cantrips ?? []),
        ...draftLevelUps.flatMap((e) => e.spellsAdded?.cantrips ?? []),
      ]
  const knownPreparedSoFar = isNewClass
    ? []
    : [
        ...(isFirstClass ? data.spells?.prepared ?? [] : []),
        ...priorLevelUps.flatMap((lu) => lu.spellsAdded?.prepared ?? []),
        ...draftLevelUps.flatMap((e) => e.spellsAdded?.prepared ?? []),
      ]

  const candidateSpells = isCaster ? getSpellsByClass(classEntry.name) : []
  const cantripOptions = candidateSpells.filter(
    (s) => s.level === 0 && !knownCantripsSoFar.includes(s.id),
  )
  const preparedOptions = candidateSpells.filter(
    (s) => s.level >= 1 && s.level <= maxSpellLevel && !knownPreparedSoFar.includes(s.id),
  )

  // Ability-increase validation for the ASI sub-choice.
  const asiValid =
    asiMode === 'one-plus-two'
      ? asiAbilityOne !== '' && scoresSoFar[asiAbilityOne as Ability] + 2 <= 20
      : asiAbilityOne !== '' &&
        asiAbilityTwo !== '' &&
        asiAbilityOne !== asiAbilityTwo &&
        scoresSoFar[asiAbilityOne as Ability] + 1 <= 20 &&
        scoresSoFar[asiAbilityTwo as Ability] + 1 <= 20

  const grapplerValid = grapplerAbility !== '' && scoresSoFar[grapplerAbility as Ability] + 1 <= 20

  const featStepDone =
    !asiLevel ||
    (selectedFeatId !== null &&
      (!isAsiFeatSelected || asiValid) &&
      (!isGrapplerFeatSelected || grapplerValid))
  const spellStepDone =
    (cantripDelta <= 0 || cantripPicks.length === cantripDelta) &&
    (preparedDelta <= 0 || preparedPicks.length === preparedDelta)
  const canContinue = featStepDone && spellStepDone

  function toggleCantripPick(spellId: string) {
    if (cantripPicks.includes(spellId)) {
      setCantripPicks(cantripPicks.filter((s) => s !== spellId))
    } else if (cantripPicks.length < cantripDelta) {
      setCantripPicks([...cantripPicks, spellId])
    }
  }

  function togglePreparedPick(spellId: string) {
    if (preparedPicks.includes(spellId)) {
      setPreparedPicks(preparedPicks.filter((s) => s !== spellId))
    } else if (preparedPicks.length < preparedDelta) {
      setPreparedPicks([...preparedPicks, spellId])
    }
  }

  function confirmLevel() {
    // "Before this level" snapshot: for a brand-new class's very first level,
    // that's simply the character's classes as they stand today (no entry
    // for this class yet) — the HP formula treats that correctly since
    // classes[0] (the max-die class) never changes identity.
    const classesBefore =
      isNewClass && level === 1 ? dataSoFar.classes : withClassLevel(dataSoFar.classes, classId, level - 1)
    const classesAfter = withClassLevel(dataSoFar.classes, classId, level)
    const hpGain =
      hitPointsMulticlass(classesAfter, conModSoFar, data.speciesId) -
      hitPointsMulticlass(classesBefore, conModSoFar, data.speciesId)

    let abilityIncreases: Ability[] | undefined
    if (isAsiFeatSelected) {
      abilityIncreases =
        asiMode === 'one-plus-two'
          ? [asiAbilityOne as Ability, asiAbilityOne as Ability]
          : [asiAbilityOne as Ability, asiAbilityTwo as Ability]
    } else if (isGrapplerFeatSelected) {
      abilityIncreases = [grapplerAbility as Ability]
    }

    const entry: LevelUpEntry = {
      classId,
      level,
      hitPointGain: hpGain,
      ...(asiLevel && selectedFeatId
        ? { featChoice: { featId: selectedFeatId, ...(abilityIncreases ? { abilityIncreases } : {}) } }
        : {}),
      ...(isCaster && (cantripDelta > 0 || preparedDelta > 0)
        ? { spellsAdded: { cantrips: cantripPicks, prepared: preparedPicks } }
        : {}),
    }

    setDraftLevelUps([...draftLevelUps, entry])
    resetLevelChoices()
    setCurrentLevel(level + 1)
  }

  return (
    <PageShell id={id}>
      <h1 className="pixel-title text-xl">Level Up: {character.name}</h1>
      <p className="text-sm">
        Stepping to level {level} of {targetLevel} ({classEntry.name})
      </p>

      {isNewClass && level === 1 && classEntry.multiclassTraitsGranted && (
        <section className="pixel-panel !p-3 text-sm">
          <p className="pixel-label">Multiclass Proficiencies Gained</p>
          <p>{classEntry.multiclassTraitsGranted}</p>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="pixel-title text-base">New Features</h2>
        {features.length > 0 ? (
          <ul className="list-disc list-inside text-sm">
            {features.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm italic">No new named features at this level.</p>
        )}
      </section>

      {asiLevel && (
        <section className="flex flex-col gap-3">
          <h2 className="pixel-title text-base">Choose a General Feat</h2>
          <div className="flex flex-wrap gap-2">
            {listFeats('General').map((feat) => (
              <button
                key={feat.id}
                type="button"
                className={`pixel-btn ${selectedFeatId === feat.id ? '' : 'pixel-btn-secondary'}`}
                onClick={() => setSelectedFeatId(feat.id)}
              >
                {feat.name}
              </button>
            ))}
          </div>
          {selectedFeat && <p className="text-sm">{selectedFeat.benefit}</p>}

          {isAsiFeatSelected && (
            <div className="pixel-panel !p-3 flex flex-col gap-2">
              <p className="pixel-label">Ability Score Increase</p>
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    checked={asiMode === 'one-plus-two'}
                    onChange={() => {
                      setAsiMode('one-plus-two')
                      setAsiAbilityTwo('')
                    }}
                  />
                  +2 to one ability
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    checked={asiMode === 'two-plus-one'}
                    onChange={() => setAsiMode('two-plus-one')}
                  />
                  +1 to two abilities
                </label>
              </div>
              <div className="flex gap-3">
                <select
                  className="pixel-input"
                  value={asiAbilityOne}
                  onChange={(e) => setAsiAbilityOne(e.target.value as Ability)}
                >
                  <option value="">Choose ability{asiMode === 'two-plus-one' ? ' one' : ''}</option>
                  {ABILITIES.map((a) => {
                    const inc = asiMode === 'one-plus-two' ? 2 : 1
                    const disabled = scoresSoFar[a] + inc > 20
                    return (
                      <option key={a} value={a} disabled={disabled}>
                        {a} ({scoresSoFar[a]}){disabled ? ' — at cap' : ''}
                      </option>
                    )
                  })}
                </select>
                {asiMode === 'two-plus-one' && (
                  <select
                    className="pixel-input"
                    value={asiAbilityTwo}
                    onChange={(e) => setAsiAbilityTwo(e.target.value as Ability)}
                  >
                    <option value="">Choose ability two</option>
                    {ABILITIES.map((a) => {
                      const disabled = a === asiAbilityOne || scoresSoFar[a] + 1 > 20
                      return (
                        <option key={a} value={a} disabled={disabled}>
                          {a} ({scoresSoFar[a]}){disabled ? ' — unavailable' : ''}
                        </option>
                      )
                    })}
                  </select>
                )}
              </div>
              {!asiValid && <p className="text-sm text-[var(--color-danger)]">Choose valid ability score(s) (max 20).</p>}
            </div>
          )}

          {isGrapplerFeatSelected && (
            <div className="pixel-panel !p-3 flex flex-col gap-2">
              <p className="pixel-label">Ability Score Increase (Strength or Dexterity)</p>
              <select
                className="pixel-input"
                value={grapplerAbility}
                onChange={(e) => setGrapplerAbility(e.target.value as Ability)}
              >
                <option value="">Choose ability</option>
                {(['Strength', 'Dexterity'] as Ability[]).map((a) => {
                  const disabled = scoresSoFar[a] + 1 > 20
                  return (
                    <option key={a} value={a} disabled={disabled}>
                      {a} ({scoresSoFar[a]}){disabled ? ' — at cap' : ''}
                    </option>
                  )
                })}
              </select>
              {!grapplerValid && <p className="text-sm text-[var(--color-danger)]">Choose a valid ability score (max 20).</p>}
            </div>
          )}
        </section>
      )}

      {isCaster && cantripDelta > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="pixel-title text-base">
            New Cantrips: choose {cantripDelta} ({cantripPicks.length}/{cantripDelta})
          </h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {cantripOptions.map((spell) => {
              const selected = cantripPicks.includes(spell.id)
              return (
                <button
                  key={spell.id}
                  type="button"
                  disabled={!selected && cantripPicks.length >= cantripDelta}
                  onClick={() => toggleCantripPick(spell.id)}
                  className={`pixel-btn ${selected ? '' : 'pixel-btn-secondary'}`}
                >
                  {spell.name}
                </button>
              )
            })}
          </div>
        </section>
      )}

      {isCaster && preparedDelta > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="pixel-title text-base">
            New Prepared/Known Spells: choose {preparedDelta} ({preparedPicks.length}/{preparedDelta})
          </h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {preparedOptions.map((spell) => {
              const selected = preparedPicks.includes(spell.id)
              return (
                <button
                  key={spell.id}
                  type="button"
                  disabled={!selected && preparedPicks.length >= preparedDelta}
                  onClick={() => togglePreparedPick(spell.id)}
                  className={`pixel-btn ${selected ? '' : 'pixel-btn-secondary'}`}
                >
                  {spell.name} (L{spell.level})
                </button>
              )
            })}
          </div>
        </section>
      )}

      <button type="button" className="pixel-btn w-fit" disabled={!canContinue} onClick={confirmLevel}>
        {level === targetLevel ? 'Finish Leveling' : `Continue to Level ${level + 1}`}
      </button>
    </PageShell>
  )
}

function PageShell({ id, children }: { id: string | undefined; children: React.ReactNode }) {
  return (
    <div className="sheet-page flex min-h-screen flex-col items-center gap-6 px-4 py-10">
      <div className="no-print flex w-full max-w-3xl items-center justify-between gap-3">
        <Link to={`/characters/${id}`} className="pixel-link text-sm">
          &larr; Back to Character Sheet
        </Link>
      </div>
      <div className="pixel-panel flex w-full max-w-3xl flex-col gap-6">{children}</div>
    </div>
  )
}

function ErrorScreen({ message, id }: { message: string; id: string | undefined }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
      <p className="pixel-title text-lg text-[var(--color-danger)]">{message}</p>
      <Link to={id ? `/characters/${id}` : '/characters'} className="pixel-link text-sm">
        &larr; Back
      </Link>
    </div>
  )
}
