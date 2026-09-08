import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getBackground, getClass, getFeat, getSpecies, getSpell, listFeats } from '@data'
import { StepClass } from '../character-wizard/steps/StepClass'
import { StepOrigin } from '../character-wizard/steps/StepOrigin'
import { StepAbilities } from '../character-wizard/steps/StepAbilities'
import { StepSkills } from '../character-wizard/steps/StepSkills'
import { StepSpeciesBonus } from '../character-wizard/steps/StepSpeciesBonus'
import { StepEquipment } from '../character-wizard/steps/StepEquipment'
import { StepSpells } from '../character-wizard/steps/StepSpells'
import { StepName } from '../character-wizard/steps/StepName'
import { getCasterCounts } from '../character-wizard/parsing'
import { parseFeatSpellLists } from '../engine/computeSheet'
import type { AbilityScoresData, CharacterData } from '../character-wizard/types'
import { WilburCompanion } from '../WilburCompanion'
import { WilburTip } from '../WilburTip'
import type { ClassEntry, BackgroundEntry, SpeciesEntry } from '@data/schema'

/** Background.feat is a display string like "Magic Initiate (Wizard)" — the
 * parenthetical is a player sub-choice, not part of the feat's own name in
 * feats.json — so strip it before matching against the feat data. */
function findFeatByBackgroundFeatText(featText: string) {
  const bareName = featText.replace(/\s*\(.*\)\s*$/, '').trim()
  return listFeats().find((f) => f.name === bareName)
}

/** If the background's fixed feat is Magic Initiate, returns the spell list
 * class name from its parenthetical (e.g. "Wizard"); undefined otherwise.
 * Magic Initiate is currently the only Origin feat in the pack that grants
 * spells — this is a targeted check, not a generic "does this feat grant
 * spells" data field (that would need a data-pack schema change; not
 * warranted for one feat). See docs/planning/issue-2-plan.md. */
function backgroundFeatSpellList(featText: string | undefined): string | undefined {
  if (!featText) return undefined
  if (findFeatByBackgroundFeatText(featText)?.id !== 'magic-initiate') return undefined
  return featText.match(/\(([^)]+)\)/)?.[1]
}

/** Basic building advice per wizard step, computed from whatever's already
 * selected — deliberately simple/static rather than deep per-trait content,
 * since the goal is quick orientation, not a full strategy guide. Where the
 * player has just picked a specific feat/spell, describe THAT one (its real
 * benefit/description text) rather than only naming it, so they know what it
 * actually does. */
function wilburTipFor(
  step: string,
  classEntry: ClassEntry | undefined,
  speciesEntry: SpeciesEntry | undefined,
  backgroundEntry: BackgroundEntry | undefined,
  hasSkillfulTrait: boolean,
  hasVersatileTrait: boolean,
  isCaster: boolean,
  originFeatId: string | null,
  lastSpellId: string | null,
): string {
  switch (step) {
    case 'class':
      return classEntry
        ? `${classEntry.name}'s primary ability is ${classEntry.primaryAbility}. Consider giving it your highest score.`
        : 'Every class has a primary ability that matters most for attacks, saves, or spellcasting — pick one that fits how you want to play.'
    case 'origin': {
      const parts: string[] = []
      if (speciesEntry) {
        parts.push(`${speciesEntry.name} grants: ${speciesEntry.traits.map((t) => t.name).join(', ')}.`)
      }
      if (backgroundEntry) {
        const skillText = (backgroundEntry.skillProficiencies ?? []).join(' and ')
        const featText = backgroundEntry.feat ? `, plus the ${backgroundEntry.feat} feat` : ''
        parts.push(`${backgroundEntry.name} grants proficiency in ${skillText}${featText}.`)
        const feat = backgroundEntry.feat ? findFeatByBackgroundFeatText(backgroundEntry.feat) : undefined
        if (feat) parts.push(feat.benefit)
      }
      return parts.length > 0
        ? parts.join(' ')
        : 'Species shapes traits like Darkvision or bonus feats; Background grants free skill proficiencies and sometimes a bonus feat.'
    }
    case 'abilities':
      return classEntry
        ? `Since you're playing a ${classEntry.name}, aim to put your highest roll into ${classEntry.primaryAbility}.`
        : 'Assign your highest scores to whichever abilities matter most for your class.'
    case 'skills':
      return 'Skills marked "(bg)" are already granted by your background — choosing a different skill here means broader coverage instead of a wasted pick.'
    case 'speciesBonus': {
      const feat = originFeatId ? getFeat(originFeatId) : undefined
      if (feat) return `${feat.name}: ${feat.benefit}`
      return hasSkillfulTrait && hasVersatileTrait
        ? 'Skillful lets you pick any one skill; Versatile lets you pick any Origin feat. Skilled is a solid all-purpose feat pick if you\'re unsure.'
        : hasSkillfulTrait
          ? 'Pick a skill you don\'t already have for the broadest coverage.'
          : 'Skilled is a solid all-purpose Origin feat pick if you\'re unsure — it grants proficiency in any 3 skills or tools.'
    }
    case 'equipment':
      return 'Option A gets you fighting-ready gear immediately; Option B trades that for gold to buy exactly what you want later.'
    case 'spells': {
      const spell = lastSpellId ? getSpell(lastSpellId) : undefined
      if (spell) return `${spell.name} (Level ${spell.level}): ${spell.description}`
      return isCaster && classEntry
        ? `${classEntry.name} casters benefit from a mix of damage, utility, and defensive spells — try not to pick only one type.`
        : 'Pick a mix of damage, utility, and defensive spells rather than all one type.'
    }
    case 'name':
      return "Give your character a name that fits their species and background!"
    default:
      return "Let's build your character!"
  }
}

async function extractErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string; error?: string }
    return body.message ?? body.error ?? `Request failed (${res.status})`
  } catch {
    return `Request failed (${res.status})`
  }
}

export function CreateCharacterPage() {
  const navigate = useNavigate()

  const [classId, setClassId] = useState<string | null>(null)
  const [speciesId, setSpeciesId] = useState<string | null>(null)
  const [backgroundId, setBackgroundId] = useState<string | null>(null)
  const [abilityScores, setAbilityScores] = useState<AbilityScoresData | null>(null)
  const [skillsChosen, setSkillsChosen] = useState<string[]>([])
  const [bonusSkill, setBonusSkill] = useState<string | null>(null)
  const [originFeatId, setOriginFeatId] = useState<string | null>(null)
  const [equipmentChoice, setEquipmentChoice] = useState<string | null>(null)
  const [spellCantrips, setSpellCantrips] = useState<string[]>([])
  const [spellPrepared, setSpellPrepared] = useState<string[]>([])
  const [featSpellCantrips, setFeatSpellCantrips] = useState<string[]>([])
  const [featSpellPrepared, setFeatSpellPrepared] = useState<string[]>([])
  const [originFeatSpellList, setOriginFeatSpellList] = useState<string | null>(null)
  const [originFeatSpellAbility, setOriginFeatSpellAbility] = useState<string | null>(null)
  const [versatileSpellCantrips, setVersatileSpellCantrips] = useState<string[]>([])
  const [versatileSpellPrepared, setVersatileSpellPrepared] = useState<string[]>([])
  const [lastSpellId, setLastSpellId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const classEntry = classId ? getClass(classId) : undefined
  const speciesEntry = speciesId ? getSpecies(speciesId) : undefined
  const backgroundEntry = backgroundId ? getBackground(backgroundId) : undefined
  const casterCounts = classEntry ? getCasterCounts(classEntry) : null
  const isCaster = casterCounts !== null
  const featSpellList = backgroundFeatSpellList(backgroundEntry?.feat)
  const hasFeatSpells = !!featSpellList
  const hasSkillfulTrait = !!speciesEntry?.traits.some((t) => t.name === 'Skillful')
  const hasVersatileTrait = !!speciesEntry?.traits.some((t) => t.name === 'Versatile')
  const hasSpeciesBonusStep = hasSkillfulTrait || hasVersatileTrait
  const originFeat = originFeatId ? getFeat(originFeatId) : undefined
  const grantsVersatileSpells = originFeat ? parseFeatSpellLists(originFeat).length > 0 : false

  const steps = useMemo(
    () =>
      (['class', 'origin', 'abilities', 'skills', 'speciesBonus', 'equipment', 'spells', 'name'] as const).filter(
        (s) =>
          (s !== 'spells' || isCaster || hasFeatSpells || grantsVersatileSpells) &&
          (s !== 'speciesBonus' || hasSpeciesBonusStep),
      ),
    [isCaster, hasFeatSpells, grantsVersatileSpells, hasSpeciesBonusStep],
  )
  const [stepIndex, setStepIndex] = useState(0)
  const step = steps[stepIndex]

  function canAdvance(): boolean {
    switch (step) {
      case 'class':
        return !!classId
      case 'origin':
        return !!speciesId && !!backgroundId
      case 'abilities': {
        if (!abilityScores) return false
        const requiredAbilities = backgroundEntry?.abilityScores ?? []
        if (requiredAbilities.length !== 3) return true
        const inc = abilityScores.backgroundIncrease
        const hasPlusTwoSplit = !!inc.plusTwo && !!inc.plusOne && inc.plusOne.length === 1
        const hasPlusOneAll = !!inc.plusOne && inc.plusOne.length === 3
        return hasPlusTwoSplit || hasPlusOneAll
      }
      case 'skills': {
        if (!classEntry) return false
        const count = skillsChosen.length
        return count > 0 && count === parseInt(classEntry.skillProficiencies.match(/Choose\s+(?:any\s+)?(\d+)/i)?.[1] ?? '0', 10)
      }
      case 'speciesBonus':
        return (
          (!hasSkillfulTrait || !!bonusSkill) &&
          (!hasVersatileTrait || !!originFeatId) &&
          (!grantsVersatileSpells || (!!originFeatSpellList && !!originFeatSpellAbility))
        )
      case 'equipment':
        return !!equipmentChoice
      case 'spells': {
        const casterDone = !casterCounts || (spellCantrips.length === casterCounts.cantrips && spellPrepared.length === casterCounts.preparedOrKnown)
        const featDone = !hasFeatSpells || (featSpellCantrips.length === 2 && featSpellPrepared.length === 1)
        const versatileDone = !grantsVersatileSpells || (versatileSpellCantrips.length === 2 && versatileSpellPrepared.length === 1)
        return casterDone && featDone && versatileDone
      }
      case 'name':
        return name.trim().length > 0
      default:
        return false
    }
  }

  // Switching the Versatile-granted Origin feat invalidates any previously
  // chosen spell list/ability/spells for it (a new feat may not grant spells
  // at all, or may offer a different set of lists) — clear them so stale
  // picks don't survive into handleSave for a feat the character no longer
  // has. See docs/planning/issue-15-plan.md.
  function handleChangeOriginFeat(featId: string) {
    setOriginFeatId(featId)
    setOriginFeatSpellList(null)
    setOriginFeatSpellAbility(null)
    setVersatileSpellCantrips([])
    setVersatileSpellPrepared([])
  }

  function goNext() {
    if (stepIndex < steps.length - 1) {
      setStepIndex(stepIndex + 1)
    } else {
      void handleSave()
    }
  }

  function goBack() {
    if (stepIndex > 0) {
      setStepIndex(stepIndex - 1)
    } else {
      navigate('/characters')
    }
  }

  async function handleSave() {
    if (!classId || !speciesId || !backgroundId || !abilityScores || !equipmentChoice) return
    setSaving(true)
    setError(null)

    const data: CharacterData = {
      speciesId,
      backgroundId,
      classes: [{ classId, level: 1 }],
      abilityScores,
      skillProficiencies: Array.from(
        new Set([...skillsChosen, ...(backgroundEntry?.skillProficiencies ?? []), ...(bonusSkill ? [bonusSkill] : [])]),
      ),
      equipmentChoice,
      ...(isCaster ? { spells: { cantrips: spellCantrips, prepared: spellPrepared } } : {}),
      ...(originFeatId ? { originFeatId } : {}),
      ...(hasFeatSpells ? { originFeatSpells: { cantrips: featSpellCantrips, prepared: featSpellPrepared } } : {}),
      ...(grantsVersatileSpells && originFeatSpellList ? { originFeatSpellList } : {}),
      ...(grantsVersatileSpells && originFeatSpellAbility ? { originFeatSpellAbility } : {}),
      ...(grantsVersatileSpells
        ? { versatileFeatSpells: { cantrips: versatileSpellCantrips, prepared: versatileSpellPrepared } }
        : {}),
    }

    try {
      const res = await fetch('/api/characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: name.trim(), data }),
      })
      if (!res.ok) {
        throw new Error(await extractErrorMessage(res))
      }
      navigate('/characters', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save character')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center gap-6 px-4 py-10">
      <h1 className="pixel-title text-2xl">New Character</h1>
      <p className="pixel-label">
        Step {stepIndex + 1} of {steps.length}
      </p>

      <div className="w-full max-w-2xl">
        <WilburTip
          tip={wilburTipFor(
            step,
            classEntry,
            speciesEntry,
            backgroundEntry,
            hasSkillfulTrait,
            hasVersatileTrait,
            isCaster,
            originFeatId,
            lastSpellId,
          )}
        />
      </div>

      <div className="pixel-panel flex w-full max-w-2xl flex-col gap-6">
        {step === 'class' && <StepClass classId={classId} onSelect={setClassId} />}

        {step === 'origin' && (
          <StepOrigin
            speciesId={speciesId}
            backgroundId={backgroundId}
            onSelectSpecies={setSpeciesId}
            onSelectBackground={setBackgroundId}
          />
        )}

        {step === 'abilities' && (
          <StepAbilities
            backgroundAbilities={backgroundEntry?.abilityScores ?? []}
            value={abilityScores}
            onChange={setAbilityScores}
          />
        )}

        {step === 'skills' && classEntry && (
          <StepSkills
            classSkillProficiencies={classEntry.skillProficiencies}
            backgroundSkills={backgroundEntry?.skillProficiencies ?? []}
            chosen={skillsChosen}
            onChange={setSkillsChosen}
          />
        )}

        {step === 'speciesBonus' && (
          <StepSpeciesBonus
            hasSkillfulTrait={hasSkillfulTrait}
            hasVersatileTrait={hasVersatileTrait}
            alreadyGrantedSkills={[...skillsChosen, ...(backgroundEntry?.skillProficiencies ?? [])]}
            bonusSkill={bonusSkill}
            onChangeBonusSkill={setBonusSkill}
            originFeatId={originFeatId}
            onChangeOriginFeat={handleChangeOriginFeat}
            excludeSpellList={featSpellList}
            originFeatSpellList={originFeatSpellList}
            onChangeOriginFeatSpellList={(list) => {
              setOriginFeatSpellList(list)
              setVersatileSpellCantrips([])
              setVersatileSpellPrepared([])
            }}
            originFeatSpellAbility={originFeatSpellAbility}
            onChangeOriginFeatSpellAbility={setOriginFeatSpellAbility}
          />
        )}

        {step === 'equipment' && classEntry && (
          <StepEquipment
            startingEquipment={classEntry.startingEquipment}
            chosen={equipmentChoice}
            onChange={setEquipmentChoice}
          />
        )}

        {step === 'spells' && (
          <div className="flex flex-col gap-8">
            {classEntry && casterCounts && (
              <StepSpells
                className={classEntry.name}
                heading={featSpellList ? `${classEntry.name} Spells` : 'Spells'}
                cantripCount={casterCounts.cantrips}
                preparedCount={casterCounts.preparedOrKnown}
                cantrips={spellCantrips}
                prepared={spellPrepared}
                excludeIds={[...featSpellCantrips, ...featSpellPrepared, ...versatileSpellCantrips, ...versatileSpellPrepared]}
                onChangeCantrips={(ids) => {
                  const added = ids.find((id) => !spellCantrips.includes(id))
                  if (added) setLastSpellId(added)
                  setSpellCantrips(ids)
                }}
                onChangePrepared={(ids) => {
                  const added = ids.find((id) => !spellPrepared.includes(id))
                  if (added) setLastSpellId(added)
                  setSpellPrepared(ids)
                }}
              />
            )}
            {featSpellList && (
              <StepSpells
                className={featSpellList}
                heading={`${backgroundEntry?.feat ?? 'Magic Initiate'} Spells`}
                cantripCount={2}
                preparedCount={1}
                cantrips={featSpellCantrips}
                prepared={featSpellPrepared}
                excludeIds={[...spellCantrips, ...spellPrepared, ...versatileSpellCantrips, ...versatileSpellPrepared]}
                onChangeCantrips={(ids) => {
                  const added = ids.find((id) => !featSpellCantrips.includes(id))
                  if (added) setLastSpellId(added)
                  setFeatSpellCantrips(ids)
                }}
                onChangePrepared={(ids) => {
                  const added = ids.find((id) => !featSpellPrepared.includes(id))
                  if (added) setLastSpellId(added)
                  setFeatSpellPrepared(ids)
                }}
              />
            )}
            {grantsVersatileSpells && originFeatSpellList && (
              <StepSpells
                className={originFeatSpellList}
                heading={`${originFeat?.name ?? 'Magic Initiate'} Spells (Versatile)`}
                cantripCount={2}
                preparedCount={1}
                cantrips={versatileSpellCantrips}
                prepared={versatileSpellPrepared}
                excludeIds={[...spellCantrips, ...spellPrepared, ...featSpellCantrips, ...featSpellPrepared]}
                onChangeCantrips={(ids) => {
                  const added = ids.find((id) => !versatileSpellCantrips.includes(id))
                  if (added) setLastSpellId(added)
                  setVersatileSpellCantrips(ids)
                }}
                onChangePrepared={(ids) => {
                  const added = ids.find((id) => !versatileSpellPrepared.includes(id))
                  if (added) setLastSpellId(added)
                  setVersatileSpellPrepared(ids)
                }}
              />
            )}
          </div>
        )}

        {step === 'name' && <StepName name={name} onChange={setName} />}

        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}

        <div className="flex justify-between">
          <button
            type="button"
            onClick={goBack}
            disabled={saving}
            className="pixel-btn pixel-btn-secondary"
          >
            {stepIndex === 0 ? 'Cancel' : 'Back'}
          </button>
          <button type="button" onClick={goNext} disabled={!canAdvance() || saving} className="pixel-btn">
            {stepIndex === steps.length - 1 ? (saving ? 'Saving…' : 'Save Character') : 'Next'}
          </button>
        </div>
      </div>

      <WilburCompanion />
    </div>
  )
}
