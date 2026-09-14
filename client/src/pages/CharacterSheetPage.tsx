import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getBackground, getClass, getEquipment, getFeat, getSpecies, getSpell } from '@data'
import type { Ability } from '../character-wizard/types'
import { ABILITIES, ALL_SKILLS } from '../character-wizard/types'
import { parseEquipmentOptions } from '../character-wizard/parsing'
import type { CharacterData } from '../character-wizard/types'
import { CharacterAvatar } from '../CharacterAvatar'
import { renderEmphasis } from '../EmphasisText'
import { useAuth } from '../auth/AuthContext'
import {
  abilityModifier,
  armorClass,
  combinedSpellSlots,
  featuresForLevel,
  finalAbilityScores,
  hitPointsMulticlass,
  martialChoiceOwed,
  proficiencyBonusMulticlass,
  skillBonus,
  spellcastingInfo,
  spellSlots,
  subclassUnlockLevel,
  totalCharacterLevel,
  warlockPactMagic,
} from '../engine/computeSheet'
import { WilburCompanion } from '../WilburCompanion'

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

function formatModifier(mod: number): string {
  return mod >= 0 ? `+${mod}` : `${mod}`
}

/** `featChoice.abilityIncreases` shapes (LevelUpPage.tsx): a 2-element array
 * of the SAME ability means "+2 to one ability"; 2 distinct abilities means
 * "+1 to each" (the ASI feat's two modes); a 1-element array (Grappler) means
 * "+1 to that ability". */
export function formatAbilityIncreases(abilities: Ability[]): string {
  if (abilities.length === 2 && abilities[0] === abilities[1]) {
    return `+2 ${abilities[0]}`
  }
  return abilities.map((a) => `+1 ${a}`).join(', ')
}

/** Spells known/prepared belong to a single class (SRD: determined per class
 * individually). The wizard's top-level `data.spells` is always the
 * original level-1 class's picks; every other class's spells arrive via
 * `levelUps` entries carrying that class's `classId`. Old M5 saves (and
 * `levelUps` entries predating M6) have no `classId` at all — treat those as
 * belonging to the character's first class, same as everywhere else this
 * absent-safe convention is used. */
export function spellsForClass(data: CharacterData, classId: string): { cantrips: string[]; prepared: string[] } {
  const isFirstClass = data.classes[0]?.classId === classId
  const ownLevelUps = (data.levelUps ?? []).filter((lu) => (lu.classId ?? data.classes[0]?.classId) === classId)
  return {
    cantrips: [
      ...(isFirstClass ? data.spells?.cantrips ?? [] : []),
      ...ownLevelUps.flatMap((lu) => lu.spellsAdded?.cantrips ?? []),
    ],
    prepared: [
      ...(isFirstClass ? data.spells?.prepared ?? [] : []),
      ...ownLevelUps.flatMap((lu) => lu.spellsAdded?.prepared ?? []),
    ],
  }
}

/** Every feat chosen at a level-up ASI opportunity (#20) — `levelUps[].featChoice`
 * is correctly persisted today but nothing renders it, so a chosen feat (or
 * the ability increases picked instead of one) silently vanished from the
 * saved sheet. Absent-safe like every other `levelUps` reader; resolves the
 * feat by id through the merged bundled+imported array (`getFeat`), falling
 * back to the raw id if a pack was later removed or hand-edited. */
export interface LevelUpFeat {
  classId: string
  level: number
  featId: string
  featName: string
  benefit?: string
  abilityIncreases?: Ability[]
}

export function levelUpFeats(data: CharacterData): LevelUpFeat[] {
  return (data.levelUps ?? [])
    .filter((lu) => lu.featChoice)
    .map((lu) => {
      const featId = lu.featChoice!.featId
      const feat = getFeat(featId)
      return {
        classId: lu.classId ?? data.classes[0]?.classId ?? '',
        level: lu.level,
        featId,
        featName: feat?.name ?? featId,
        benefit: feat?.benefit,
        abilityIncreases: lu.featChoice!.abilityIncreases,
      }
    })
}

/** Every named feature a class grants from level 1 up to (and including) its
 * current level — featuresForLevel only returns a single level's row, and
 * nothing before this persisted them anywhere on the saved sheet (they were
 * only ever shown transiently during the level-up stepper). */
function allFeaturesForClass(classId: string, level: number, subclassId?: string): string[] {
  const features: string[] = []
  for (let lvl = 1; lvl <= level; lvl++) {
    features.push(...featuresForLevel(classId, lvl, subclassId))
  }
  return features
}

export function CharacterSheetPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const [character, setCharacter] = useState<CharacterRecord | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [forbidden, setForbidden] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    setNotFound(false)
    setForbidden(false)
    try {
      const res = await fetch(`/api/characters/${id}`, {
        method: 'GET',
        credentials: 'include',
      })
      if (res.status === 404) {
        setNotFound(true)
        return
      }
      if (res.status === 403) {
        setForbidden(true)
        return
      }
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

  function handleDownloadJson() {
    if (!character) return
    const payload = { name: character.name, data: character.data }
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${character.name.replace(/[^a-z0-9_-]+/gi, '_') || 'character'}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  if (notFound) {
    return (
      <ErrorScreen message="Character not found." />
    )
  }

  if (forbidden) {
    return (
      <ErrorScreen message="You don't have permission to view this character." />
    )
  }

  if (error) {
    return <ErrorScreen message={error} />
  }

  if (!character) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2">
        <p className="italic">Loading…</p>
      </div>
    )
  }

  const data = character.data
  const speciesEntry = getSpecies(data.speciesId)
  const backgroundEntry = getBackground(data.backgroundId)
  // classes[0] is always the original level-1 class — equipment and armor
  // proficiency come from it only (multiclassing grants no new equipment).
  const primaryClass = data.classes[0]
  const classEntry = getClass(primaryClass.classId)
  const level = totalCharacterLevel(data.classes)

  const scores = finalAbilityScores(data)
  const profBonus = classEntry ? proficiencyBonusMulticlass(data.classes) : 0
  const conMod = abilityModifier(scores.Constitution)
  const hp = classEntry ? hitPointsMulticlass(data.classes, conMod, data.speciesId) : undefined
  const ac = classEntry
    ? armorClass(data.classes, data.equipmentChoice, scores)
    : undefined
  // Combined full/half-caster slots (M6) plus Warlock Pact Magic as a wholly
  // separate pool — never folded together (see engine/computeSheet.ts).
  const combinedSlots = combinedSpellSlots(data.classes)
  const pactSlots = warlockPactMagic(data.classes)
  const levelUpFeatChoices = levelUpFeats(data)
  const totalCantripsKnown = data.classes.reduce(
    (sum, c) => sum + (spellSlots(c.classId, c.level)?.cantrips ?? 0),
    0,
  )

  const equipmentOptions = classEntry ? parseEquipmentOptions(classEntry.startingEquipment) : []
  const chosenEquipment = equipmentOptions.find((o) => o.letter === data.equipmentChoice)

  const classLine = data.classes
    .map((entry) => {
      const className = getClass(entry.classId)?.name ?? entry.classId
      const subclassName = entry.subclassId
        ? getClass(entry.classId)?.subclasses.find((s) => s.id === entry.subclassId)?.name
        : undefined
      return `${className} ${entry.level}${subclassName ? ` (${subclassName})` : ''}`
    })
    .join(' / ')
  const headerLine = [speciesEntry?.name ?? data.speciesId, backgroundEntry?.name ?? data.backgroundId, classLine].join(
    ' ',
  )

  return (
    <div className="sheet-page flex min-h-screen flex-col items-center gap-6 px-4 py-10">
      <div className="no-print flex w-full max-w-4xl items-center justify-between gap-3">
        <Link to="/characters" className="pixel-link text-sm">
          &larr; My Characters
        </Link>
        <div className="flex gap-3">
          {/* Level Up mutates this character — only the owner sees it. An
              admin viewing via the party view gets a read-only sheet. */}
          {level < 10 && user?.id === character.ownerId && (
            <Link to={`/characters/${id}/level-up`} className="pixel-btn">
              Level Up
            </Link>
          )}
          {/* M11: caster-only combat scratch space (docs/planning/m11-sandbox-v0-plan.md).
              Shown for any viewer, same as Print/Download — it's a read-only-ish
              exploration tool, not a mutation of the saved character. */}
          <Link to={`/characters/${id}/sandbox`} className="pixel-btn pixel-btn-secondary">
            Combat Sandbox
          </Link>
          <button type="button" className="pixel-btn pixel-btn-secondary" onClick={() => window.print()}>
            Print
          </button>
          <button type="button" className="pixel-btn" onClick={handleDownloadJson}>
            Download JSON
          </button>
          {/* Admin/QA tool — see docs/planning/issue-14-plan.md. Shown for any
              character, not just the admin's own, matching what the server's
              canAccess() already permits. */}
          {user?.isAdmin && (
            <Link to={`/characters/${id}/edit-json`} className="pixel-btn pixel-btn-secondary">
              Edit JSON
            </Link>
          )}
        </div>
      </div>

      <div className="pixel-panel flex w-full max-w-4xl flex-col gap-6">
        <header className="flex items-center gap-4">
          <CharacterAvatar id={character.id} label={character.name} size={96} />
          <div>
            <h1 className="pixel-title text-2xl">{character.name}</h1>
            <p className="text-sm text-[var(--color-shadow)]/80">{headerLine}</p>
          </div>
        </header>

        {/* Ability scores */}
        <section>
          <h2 className="pixel-title text-base mb-2">Ability Scores</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
            {ABILITIES.map((ability) => {
              const score = scores[ability]
              const mod = abilityModifier(score)
              return (
                <div key={ability} className="pixel-panel !p-2 text-center">
                  <p className="pixel-label text-[0.55rem] break-words">{ability}</p>
                  <p className="text-lg font-bold">
                    {score} ({formatModifier(mod)})
                  </p>
                </div>
              )
            })}
          </div>
        </section>

        {/* Core stats */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatBox label="Proficiency Bonus" value={formatModifier(profBonus)} />
          <StatBox label="Hit Points" value={hp !== undefined ? String(hp) : '—'} />
          <StatBox label="Armor Class" value={ac !== undefined ? String(ac) : '—'} />
          <StatBox label="Level" value={String(level)} />
        </section>

        {/* Saving throws */}
        <section>
          <h2 className="pixel-title text-base mb-2">Saving Throws</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
            {ABILITIES.map((ability) => {
              const proficient = classEntry?.savingThrowProficiencies.includes(ability as Ability) ?? false
              const mod = abilityModifier(scores[ability]) + (proficient ? profBonus : 0)
              return (
                <div
                  key={ability}
                  className={`pixel-panel !p-2 text-center text-sm ${
                    proficient ? 'outline outline-2 outline-[var(--color-arcane)]' : ''
                  }`}
                >
                  <p className="pixel-label text-[0.55rem] break-words">{ability}</p>
                  <p>{formatModifier(mod)}</p>
                </div>
              )
            })}
          </div>
        </section>

        {/* Skills */}
        <section>
          <h2 className="pixel-title text-base mb-2">Skills</h2>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 md:grid-cols-3">
            {ALL_SKILLS.map((skill) => {
              const proficient = data.skillProficiencies.includes(skill)
              const bonus = skillBonus(skill, scores, data.skillProficiencies, profBonus)
              return (
                <div
                  key={skill}
                  className={`flex items-center justify-between border-b border-[var(--color-shadow)]/20 py-1 text-sm ${
                    proficient ? 'font-bold text-[var(--color-arcane)]' : ''
                  }`}
                >
                  <span>
                    {proficient ? '● ' : '○ '}
                    {skill}
                  </span>
                  <span>{formatModifier(bonus)}</span>
                </div>
              )
            })}
          </div>
        </section>

        {/* Class Features */}
        <section>
          <h2 className="pixel-title text-base mb-2">Class Features</h2>
          <div className="flex flex-col gap-3">
            {data.classes.map((c) => {
              // Guard against an orphaned/invalid subclassId (e.g. hand-edited
              // via the admin JSON editor, or a future pack re-import renaming
              // ids) — the engine deliberately throws on an unknown id
              // (data-gap contract), so the sheet must never pass one through
              // unvalidated or a single bad id would white-screen the whole
              // page via the root ErrorBoundary.
              const hasKnownSubclass = !!c.subclassId && getClass(c.classId)?.subclasses.some((s) => s.id === c.subclassId)
              const validSubclassId = hasKnownSubclass ? c.subclassId : undefined
              const classHasSubclasses = (getClass(c.classId)?.subclasses.length ?? 0) > 0
              const features = allFeaturesForClass(c.classId, c.level, validSubclassId)
              // Choosing a subclass mutates this character — only the owner
              // sees the link, same as Level Up.
              const needsSubclassChoice =
                classHasSubclasses &&
                !validSubclassId &&
                c.level >= subclassUnlockLevel(c.classId) &&
                user?.id === character.ownerId
              // #26: same "owed but never prompted" gap as subclass above —
              // a class already past its Fighting Style unlock level (or a
              // Weapon Mastery growth level) before #26 shipped, or leveled
              // up via a session that advanced a DIFFERENT class, never got
              // asked.
              const owed = martialChoiceOwed(c)
              const needsMartialChoice = (owed.fightingStyle || owed.masteryCount > 0) && user?.id === character.ownerId
              if (features.length === 0 && !needsSubclassChoice && !needsMartialChoice) return null
              return (
                <div key={c.classId}>
                  <div className="flex items-center justify-between">
                    <p className="pixel-label">{getClass(c.classId)?.name ?? c.classId}</p>
                    <div className="flex gap-2">
                      {needsSubclassChoice && (
                        <Link
                          to={`/characters/${id}/choose-subclass/${c.classId}`}
                          className="pixel-btn pixel-btn-secondary !py-1 !px-2 text-xs"
                        >
                          Choose Subclass
                        </Link>
                      )}
                      {needsMartialChoice && (
                        <Link
                          to={`/characters/${id}/choose-martial/${c.classId}`}
                          className="pixel-btn pixel-btn-secondary !py-1 !px-2 text-xs"
                        >
                          Martial Training
                        </Link>
                      )}
                    </div>
                  </div>
                  {c.subclassId && !hasKnownSubclass && (
                    <p className="text-sm italic text-[var(--color-danger)]">
                      Unknown subclass ({c.subclassId}) — content pack may have changed.
                    </p>
                  )}
                  {features.length > 0 && (
                    <ul className="text-sm list-disc list-inside">
                      {features.map((f, i) => (
                        <li key={`${f}-${i}`}>{f}</li>
                      ))}
                    </ul>
                  )}
                  {/* #3: Fighting Style + Weapon Mastery choices, if any. */}
                  {c.fightingStyleFeatId && (
                    <p className="text-sm">
                      <span className="font-bold">Fighting Style:</span>{' '}
                      {getFeat(c.fightingStyleFeatId)?.name ?? c.fightingStyleFeatId}
                    </p>
                  )}
                  {c.fightingStyleAlternateCantrips && c.fightingStyleAlternateCantrips.length > 0 && (
                    <p className="text-sm">
                      <span className="font-bold">Fighting Style (cantrips):</span>{' '}
                      {c.fightingStyleAlternateCantrips.map((id) => getSpell(id)?.name ?? id).join(', ')}
                    </p>
                  )}
                  {c.weaponMasteryIds && c.weaponMasteryIds.length > 0 && (
                    <p className="text-sm">
                      <span className="font-bold">Weapon Mastery:</span>{' '}
                      {c.weaponMasteryIds
                        .map((id) => {
                          const weapon = getEquipment(id)
                          return weapon ? `${weapon.name} (${weapon.mastery})` : id
                        })
                        .join(', ')}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        {/* Level-Up Feats & Ability Increases (#20) — levelUps[].featChoice was
            already correctly persisted, just never rendered anywhere. */}
        {levelUpFeatChoices.length > 0 && (
          <section>
            <h2 className="pixel-title text-base mb-2">Feats &amp; Ability Increases</h2>
            <div className="flex flex-col gap-2">
              {levelUpFeatChoices.map((lu) => (
                <div key={`${lu.classId}-${lu.level}`} className="text-sm">
                  <span className="font-bold">
                    {getClass(lu.classId)?.name ?? lu.classId} {lu.level}:
                  </span>{' '}
                  {lu.featName}
                  {lu.abilityIncreases && lu.abilityIncreases.length > 0 && (
                    <> ({formatAbilityIncreases(lu.abilityIncreases)})</>
                  )}
                  {lu.benefit && <span className="block italic">{renderEmphasis(lu.benefit)}</span>}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Spellcasting */}
        {(combinedSlots || pactSlots) && (
          <section>
            <h2 className="pixel-title text-base mb-2">Spellcasting</h2>
            <p className="text-sm mb-2">
              Cantrips known: {totalCantripsKnown}
              {combinedSlots && Object.keys(combinedSlots).length > 0 && (
                <>
                  {' — '}
                  Slots:{' '}
                  {Object.entries(combinedSlots)
                    .map(([lvl, count]) => `L${lvl}: ${count}`)
                    .join(', ')}
                </>
              )}
            </p>
            {pactSlots && (
              <p className="text-sm mb-2">
                Pact Magic (Warlock, separate pool): {pactSlots.cantrips} cantrips —{' '}
                {Object.entries(pactSlots.slotsByLevel)
                  .map(([lvl, count]) => `L${lvl}: ${count}`)
                  .join(', ')}
              </p>
            )}

            {/* Per-class spell lists — SRD: spells prepared/known are
                determined per class individually, so each caster class gets
                its own list rather than one merged pool. */}
            <div className="flex flex-col gap-4">
              {data.classes
                .filter((c) => spellSlots(c.classId, c.level) !== undefined)
                .map((c) => {
                  const { cantrips, prepared } = spellsForClass(data, c.classId)
                  if (cantrips.length === 0 && prepared.length === 0) return null
                  const casting = spellcastingInfo(c.classId, data.classes, scores)
                  return (
                    <div key={c.classId} className="flex flex-col gap-2">
                      {casting && (
                        <p className="text-sm">
                          {getClass(c.classId)?.name ?? c.classId} Spell Attack{' '}
                          <span className="font-bold">
                            {casting.attackBonus >= 0 ? '+' : ''}
                            {casting.attackBonus}
                          </span>
                          {' · '}
                          Spell Save DC <span className="font-bold">{casting.saveDC}</span>
                        </p>
                      )}
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                          <p className="pixel-label">{getClass(c.classId)?.name ?? c.classId} Cantrips</p>
                          <ul className="text-sm list-disc list-inside">
                            {cantrips.map((id) => (
                              <li key={id}>{getSpell(id)?.name ?? id}</li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <p className="pixel-label">{getClass(c.classId)?.name ?? c.classId} Prepared Spells</p>
                          <ul className="flex flex-col gap-2 text-sm">
                            {prepared.map((id) => {
                              const spell = getSpell(id)
                              return (
                                <li key={id}>
                                  <p>
                                    <span className="font-bold">{spell?.name ?? id}</span>
                                    {spell && <span className="text-xs italic"> (Level {spell.level})</span>}
                                  </p>
                                  {spell && <p className="text-xs">{renderEmphasis(spell.description)}</p>}
                                </li>
                              )
                            })}
                          </ul>
                        </div>
                      </div>
                    </div>
                  )
                })}
            </div>
          </section>
        )}

        {/* Species */}
        <section>
          <h2 className="pixel-title text-base mb-2">Species: {speciesEntry?.name ?? data.speciesId}</h2>
          <div className="flex flex-col gap-2">
            {speciesEntry?.traits.map((trait) => (
              <div key={trait.name} className="text-sm">
                <span className="font-bold">{trait.name}.</span> {renderEmphasis(trait.description)}
              </div>
            ))}
            {data.originFeatId && (
              <div className="text-sm">
                <span className="font-bold">Feat:</span> {getFeat(data.originFeatId)?.name ?? data.originFeatId}
                {data.originFeatSpellList && ` (${data.originFeatSpellList})`}
                {data.originFeatSpellAbility && ` — ${data.originFeatSpellAbility}`}
              </div>
            )}
            {data.versatileFeatSpells && (
              <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <p className="pixel-label">Cantrips</p>
                  <ul className="text-sm list-disc list-inside">
                    {data.versatileFeatSpells.cantrips.map((id) => (
                      <li key={id}>{getSpell(id)?.name ?? id}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="pixel-label">Spell</p>
                  <ul className="text-sm list-disc list-inside">
                    {data.versatileFeatSpells.prepared.map((id) => (
                      <li key={id}>{getSpell(id)?.name ?? id}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Background */}
        <section>
          <h2 className="pixel-title text-base mb-2">
            Background: {backgroundEntry?.name ?? data.backgroundId}
          </h2>
          {backgroundEntry?.feat && (
            <p className="text-sm">
              <span className="font-bold">Feat:</span> {backgroundEntry.feat}
              {data.backgroundFeatSpellAbility && ` — ${data.backgroundFeatSpellAbility}`}
            </p>
          )}
          {backgroundEntry?.toolProficiency && (
            <p className="text-sm">
              <span className="font-bold">Tool Proficiency:</span> {backgroundEntry.toolProficiency}
            </p>
          )}
          {data.originFeatSpells && (
            <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="pixel-label">Cantrips</p>
                <ul className="text-sm list-disc list-inside">
                  {data.originFeatSpells.cantrips.map((id) => (
                    <li key={id}>{getSpell(id)?.name ?? id}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="pixel-label">Spell</p>
                <ul className="text-sm list-disc list-inside">
                  {data.originFeatSpells.prepared.map((id) => (
                    <li key={id}>{getSpell(id)?.name ?? id}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </section>

        {/* Equipment */}
        <section>
          <h2 className="pixel-title text-base mb-2">Equipment</h2>
          <p className="text-sm">
            {chosenEquipment
              ? `Option ${chosenEquipment.letter}: ${chosenEquipment.text}`
              : `Option ${data.equipmentChoice}`}
          </p>
        </section>
      </div>

      <div className="no-print">
        <WilburCompanion />
      </div>
    </div>
  )
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="pixel-panel !p-3 text-center">
      <p className="pixel-label">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  )
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
      <p className="pixel-title text-lg text-[var(--color-danger)]">{message}</p>
      <Link to="/characters" className="pixel-link text-sm">
        &larr; Back to My Characters
      </Link>
    </div>
  )
}
