import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getClass, getSpellsByClass, listClasses, listFeats } from '@data'
import { renderEmphasis } from '../EmphasisText'
import { ContentPicker } from '../ContentPicker'
import { StepMartial } from '../character-wizard/steps/StepMartial'
import type { Ability, CharacterClassEntry, CharacterData, LevelUpEntry } from '../character-wizard/types'
import { ABILITIES } from '../character-wizard/types'
import {
  abilityModifier,
  canMulticlassInto,
  featuresForLevel,
  finalAbilityScores,
  hitPointsMulticlass,
  isAsiLevel,
  martialChoiceOwed,
  parseFeatAbilityIncrease,
  spellSlots,
  subclassUnlockLevel,
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
/** "A or B" for 2 items, "A, B, or C" for 3+ — plain `.join(' or ')` reads as
 * "Strength or Constitution or Charisma" once a fixed-list feat (#24) has 3
 * or 4 allowed abilities, which most of the PHB-2024 pack's half-feats do. */
function formatAbilityList(abilities: string[]): string {
  if (abilities.length <= 2) return abilities.join(' or ')
  return `${abilities.slice(0, -1).join(', ')}, or ${abilities.at(-1)}`
}

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
  const [fixedListAbility, setFixedListAbility] = useState<Ability | ''>('')
  const [cantripPicks, setCantripPicks] = useState<string[]>([])
  const [preparedPicks, setPreparedPicks] = useState<string[]>([])
  // In-progress pick for the current level's subclass-choice section, if any
  // — reset every level like the other per-level choices.
  const [chosenSubclassId, setChosenSubclassId] = useState<string | null>(null)
  // The subclass finalized this session (set once, in confirmLevel, at the
  // unlock level — survives resetLevelChoices so it carries through to the
  // Phase 3 save even though later levels reset chosenSubclassId).
  const [committedSubclassId, setCommittedSubclassId] = useState<string | null>(null)

  // #26: same per-level in-progress / committed split as the subclass state
  // above, for the Fighting Style + Weapon Mastery choices a martial class
  // can owe at a level-up (Fighter/Barbarian's Weapon Mastery grows again at
  // 4/10; Paladin/Ranger's Fighting Style unlocks at 2). Fighting Style is
  // chosen at most once per class ever, same shape as subclass — a single
  // committed value that survives resetLevelChoices. Weapon Mastery can grow
  // at MULTIPLE levels within one stepper session (e.g. leveling Fighter
  // 1->10 in one sitting crosses both growth levels), so its committed value
  // is a running array, appended to (not replaced) each time a mastery step
  // is confirmed.
  const [chosenFightingStyleFeatId, setChosenFightingStyleFeatId] = useState<string | null>(null)
  const [chosenFightingStyleAlternateCantrips, setChosenFightingStyleAlternateCantrips] = useState<string[]>([])
  const [committedFightingStyleFeatId, setCommittedFightingStyleFeatId] = useState<string | null>(null)
  const [committedFightingStyleAlternateCantrips, setCommittedFightingStyleAlternateCantrips] = useState<
    string[] | null
  >(null)
  // This level's NEW weapon-mastery picks only (not the running total —
  // that's `runningWeaponMasteryIds`, derived below from `existingEntry` +
  // `committedWeaponMasteryIds`).
  const [chosenMasteryPicks, setChosenMasteryPicks] = useState<string[]>([])
  const [committedWeaponMasteryIds, setCommittedWeaponMasteryIds] = useState<string[] | null>(null)

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
    setFixedListAbility('')
    setCantripPicks([])
    setPreparedPicks([])
    setChosenSubclassId(null)
    setChosenFightingStyleFeatId(null)
    setChosenFightingStyleAlternateCantrips([])
    setChosenMasteryPicks([])
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
    const finalClasses = withClassLevel(data.classes, classId, targetLevel).map((c) => {
      if (c.classId !== classId) return c
      return {
        ...c,
        ...(committedSubclassId ? { subclassId: committedSubclassId } : {}),
        ...(committedFightingStyleFeatId ? { fightingStyleFeatId: committedFightingStyleFeatId } : {}),
        ...(committedFightingStyleAlternateCantrips
          ? { fightingStyleAlternateCantrips: committedFightingStyleAlternateCantrips }
          : {}),
        ...(committedWeaponMasteryIds ? { weaponMasteryIds: committedWeaponMasteryIds } : {}),
      }
    })
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
  const classHasSubclasses = classEntry.subclasses.length > 0
  const needsSubclassChoice =
    classHasSubclasses && !existingEntry?.subclassId && level === subclassUnlockLevel(classId)
  const activeSubclassId = chosenSubclassId ?? existingEntry?.subclassId ?? committedSubclassId ?? undefined
  const features = featuresForLevel(classId, level, activeSubclassId)

  // #26: martial (Fighting Style / Weapon Mastery) choices this level might
  // owe, via the shared `martialChoiceOwed` helper (same one MartialChoicePage
  // and CharacterSheetPage use) — built from a synthetic "as of just before
  // this level's picks" class entry: `level` is the STEPPER's current level
  // (not `existingEntry.level`, which lags behind mid-session), and the
  // fighting-style/mastery fields fold in whatever this session has already
  // committed at an earlier level, not just what's saved on the server.
  const runningWeaponMasteryIds = committedWeaponMasteryIds ?? existingEntry?.weaponMasteryIds ?? []
  const owed = martialChoiceOwed({
    classId,
    level,
    fightingStyleFeatId: committedFightingStyleFeatId ?? existingEntry?.fightingStyleFeatId,
    fightingStyleAlternateCantrips: committedFightingStyleAlternateCantrips ?? existingEntry?.fightingStyleAlternateCantrips,
    weaponMasteryIds: runningWeaponMasteryIds,
  })
  const needsFightingStyleChoice = owed.fightingStyle
  const needsMasteryChoice = owed.masteryCount > 0
  const needsMartialChoice = needsFightingStyleChoice || needsMasteryChoice
  const asiLevel = isAsiLevel(classId, level)
  const selectedFeat = selectedFeatId ? listFeats(['General', 'General / Racial']).find((f) => f.id === selectedFeatId) : undefined
  // #24: derived from the selected feat's own prose (any pack), not two
  // hardcoded bundled ids — otherwise every General feat offered by an
  // imported pack silently drops its own ability increase. Guarded: an
  // admin-imported feat's benefit text is only identity-checked at import
  // time for feats literally matching known shapes, not exhaustively for
  // every possible malformed sentence — one bad feat must degrade to "no
  // ability increase for this pick" here, not crash the whole stepper.
  let abilityIncreaseSpec: ReturnType<typeof parseFeatAbilityIncrease> | undefined
  if (selectedFeat) {
    try {
      abilityIncreaseSpec = parseFeatAbilityIncrease(selectedFeat)
    } catch (err) {
      console.warn(`Feat "${selectedFeat.name}" (${selectedFeat.id}): couldn't parse its ability increase`, err)
    }
  }
  const isAsiFeatSelected = abilityIncreaseSpec?.mode === 'free-choice'
  const isFixedListFeatSelected = abilityIncreaseSpec?.mode === 'fixed-list'
  const fixedListAbilities = abilityIncreaseSpec?.mode === 'fixed-list' ? abilityIncreaseSpec.abilities : []

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

  const fixedListValid =
    fixedListAbility !== '' &&
    fixedListAbilities.includes(fixedListAbility as Ability) &&
    scoresSoFar[fixedListAbility as Ability] + 1 <= 20

  const featStepDone =
    !asiLevel ||
    (selectedFeatId !== null &&
      (!isAsiFeatSelected || asiValid) &&
      (!isFixedListFeatSelected || fixedListValid))
  const spellStepDone =
    (cantripDelta <= 0 || cantripPicks.length === cantripDelta) &&
    (preparedDelta <= 0 || preparedPicks.length === preparedDelta)
  const subclassStepDone = !needsSubclassChoice || chosenSubclassId !== null
  const fightingStyleStepDone =
    !needsFightingStyleChoice ||
    chosenFightingStyleFeatId !== null ||
    chosenFightingStyleAlternateCantrips.length === 2
  const masteryStepDone = !needsMasteryChoice || chosenMasteryPicks.length >= owed.masteryCount
  const canContinue = featStepDone && spellStepDone && subclassStepDone && fightingStyleStepDone && masteryStepDone

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
    if (needsSubclassChoice && chosenSubclassId) {
      setCommittedSubclassId(chosenSubclassId)
    }
    if (needsFightingStyleChoice) {
      if (chosenFightingStyleAlternateCantrips.length === 2) {
        setCommittedFightingStyleAlternateCantrips(chosenFightingStyleAlternateCantrips)
      } else if (chosenFightingStyleFeatId) {
        setCommittedFightingStyleFeatId(chosenFightingStyleFeatId)
      }
    }
    if (chosenMasteryPicks.length > 0) {
      setCommittedWeaponMasteryIds([...runningWeaponMasteryIds, ...chosenMasteryPicks])
    }
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
    } else if (isFixedListFeatSelected) {
      abilityIncreases = [fixedListAbility as Ability]
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

      {needsSubclassChoice && (
        <section className="flex flex-col gap-3">
          <h2 className="pixel-title text-base">Choose a Subclass</h2>
          <div className="flex flex-col gap-2">
            {classEntry.subclasses.map((sc) => {
              const selected = chosenSubclassId === sc.id
              const unlockFeatures = sc.features.filter((f) => f.level === level)
              return (
                <button
                  key={sc.id}
                  type="button"
                  className={`pixel-panel !p-3 text-left ${selected ? 'ring-2 ring-[var(--color-arcane)]' : ''}`}
                  onClick={() => setChosenSubclassId(sc.id)}
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
        </section>
      )}

      {needsMartialChoice && (
        <StepMartial
          classId={classId}
          level={level}
          fightingStyleFeatId={chosenFightingStyleFeatId}
          onChangeFightingStyleFeatId={setChosenFightingStyleFeatId}
          fightingStyleAlternateCantrips={chosenFightingStyleAlternateCantrips}
          onChangeFightingStyleAlternateCantrips={setChosenFightingStyleAlternateCantrips}
          weaponMasteryIds={[...runningWeaponMasteryIds, ...chosenMasteryPicks]}
          onChangeWeaponMasteryIds={(ids) =>
            setChosenMasteryPicks(ids.filter((wid) => !runningWeaponMasteryIds.includes(wid)))
          }
          lockedWeaponMasteryIds={runningWeaponMasteryIds}
          hideFightingStyle={!needsFightingStyleChoice}
        />
      )}

      {asiLevel && (
        <section className="flex flex-col gap-3">
          <h2 className="pixel-title text-base">Choose a General Feat</h2>
          <ContentPicker
            items={listFeats(['General', 'General / Racial'])}
            selectedId={selectedFeatId}
            onSelect={(id) => {
              setSelectedFeatId(id)
              // A fixed-list feat's allowed abilities are feat-specific
              // (#24) — switching from e.g. Chef (Con/Wis) to Great Weapon
              // Master (Strength only) must not let a stale, now-illegal
              // pick from the previous feat silently survive and validate.
              setFixedListAbility('')
              setAsiAbilityOne('')
              setAsiAbilityTwo('')
            }}
            searchPlaceholder="Search feats by name…"
          />
          {selectedFeat && <p className="text-sm">{renderEmphasis(selectedFeat.benefit)}</p>}

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

          {isFixedListFeatSelected && (
            <div className="pixel-panel !p-3 flex flex-col gap-2">
              <p className="pixel-label">Ability Score Increase ({formatAbilityList(fixedListAbilities)})</p>
              <select
                className="pixel-input"
                value={fixedListAbility}
                onChange={(e) => setFixedListAbility(e.target.value as Ability)}
              >
                <option value="">Choose ability</option>
                {fixedListAbilities.map((a) => {
                  const disabled = scoresSoFar[a] + 1 > 20
                  return (
                    <option key={a} value={a} disabled={disabled}>
                      {a} ({scoresSoFar[a]}){disabled ? ' — at cap' : ''}
                    </option>
                  )
                })}
              </select>
              {!fixedListValid && <p className="text-sm text-[var(--color-danger)]">Choose a valid ability score (max 20).</p>}
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
