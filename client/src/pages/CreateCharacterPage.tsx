import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getBackground, getClass, getFeat, getSpecies, getSpell, listFeats } from '@data'
import { StepClass } from '../character-wizard/steps/StepClass'
import { StepOrigin } from '../character-wizard/steps/StepOrigin'
import { StepAbilities } from '../character-wizard/steps/StepAbilities'
import { StepSkills } from '../character-wizard/steps/StepSkills'
import { StepSpeciesBonus } from '../character-wizard/steps/StepSpeciesBonus'
import { StepMartial } from '../character-wizard/steps/StepMartial'
import { StepEquipment } from '../character-wizard/steps/StepEquipment'
import { StepSpells } from '../character-wizard/steps/StepSpells'
import { StepName } from '../character-wizard/steps/StepName'
import { getCasterCounts } from '../character-wizard/parsing'
import {
  diffQuickStats,
  featAbilityDerivedFromChosenClass,
  fightingStyleUnlockLevel,
  parseFeatSpellAbilities,
  parseFeatSpellLists,
  parseSpellcastingAbility,
  quickStats,
  weaponMasteryCount,
} from '../engine/computeSheet'
import type { Ability, AbilityScoresData, CharacterData } from '../character-wizard/types'
import { WilburCompanion } from '../WilburCompanion'
import { WilburTip } from '../WilburTip'
import type { ClassEntry, BackgroundEntry, SpeciesEntry } from '@data/schema'

/** Background.feat is a display string like "Magic Initiate (Wizard)" — the
 * parenthetical is a player sub-choice, not part of the feat's own name in
 * feats.json — so strip it before matching against the feat data. Resolves
 * within the background's own pack first (imported packs are namespaced, so
 * a bare-name match across all packs could otherwise silently resolve to a
 * same-named feat from a different pack), falling back to any pack only if
 * that misses. */
function findFeatByBackgroundFeatText(featText: string, backgroundPack: string | undefined) {
  const bareName = featText.replace(/\s*\(.*\)\s*$/, '').trim()
  const candidates = listFeats().filter((f) => f.name === bareName)
  return candidates.find((f) => f.pack === backgroundPack) ?? candidates[0]
}

/** If the background's fixed feat is Magic Initiate, returns the spell list
 * class name from its parenthetical (e.g. "Wizard"); undefined otherwise.
 * Magic Initiate is currently the only Origin feat in the pack that grants
 * spells — this is a targeted check, not a generic "does this feat grant
 * spells" data field (that would need a data-pack schema change; not
 * warranted for one feat). Checks the feat's name rather than a hardcoded
 * bundled id so this still works for an imported pack's own Magic Initiate.
 * See docs/planning/issue-2-plan.md. */
function backgroundFeatSpellList(featText: string | undefined, backgroundPack: string | undefined): string | undefined {
  if (!featText) return undefined
  if (findFeatByBackgroundFeatText(featText, backgroundPack)?.name !== 'Magic Initiate') return undefined
  return featText.match(/\(([^)]+)\)/)?.[1]
}

/** #17: what spellcasting ability (if any) a background-granted Magic
 * Initiate uses — either freely chosen (SRD's Int/Wis/Cha) or auto-derived
 * from the fixed class named in the background's own feat text (PHB-2024's
 * "ability matches the chosen class" variant, detected via
 * `featAbilityDerivedFromChosenClass`'s positive text match — not inferred
 * from `parseFeatSpellAbilities` returning [], which could misclassify a
 * differently-phrased free-choice feat as derived). If derivation is
 * signaled but the named class isn't one `getClass` can resolve (e.g. a
 * class only an unimported pack would provide), falls back to the standard
 * three-ability free-choice picker rather than silently blocking the wizard
 * with no ability picker and no explanation. Takes the already-resolved
 * feat (rather than re-resolving it via `listFeats()` internally) so it's
 * testable with a literal fixture, independent of whether any content pack
 * happens to be merged in at runtime. */
export function resolveBackgroundFeatSpellAbility(
  featSpellList: string | undefined,
  backgroundFeat: { id: string; benefit: string } | undefined,
): {
  backgroundSpellAbilities: Ability[]
  backgroundAbilityIsDerived: boolean
  derivedBackgroundFeatSpellAbility: Ability | undefined
} {
  if (!featSpellList || !backgroundFeat) {
    return { backgroundSpellAbilities: [], backgroundAbilityIsDerived: false, derivedBackgroundFeatSpellAbility: undefined }
  }
  if (featAbilityDerivedFromChosenClass(backgroundFeat)) {
    const derived = parseSpellcastingAbility(getClass(featSpellList.toLowerCase()))
    if (derived) {
      return { backgroundSpellAbilities: [], backgroundAbilityIsDerived: true, derivedBackgroundFeatSpellAbility: derived }
    }
    console.warn(`Feat "${backgroundFeat.id}": derived-ability class "${featSpellList}" not found; falling back to free choice`)
  }
  let backgroundSpellAbilities: Ability[] = []
  try {
    backgroundSpellAbilities = parseFeatSpellAbilities(backgroundFeat)
  } catch (err) {
    console.warn(`Feat "${backgroundFeat.id}": couldn't parse its spellcasting ability`, err)
  }
  if (backgroundSpellAbilities.length === 0) {
    backgroundSpellAbilities = ['Intelligence', 'Wisdom', 'Charisma']
  }
  return { backgroundSpellAbilities, backgroundAbilityIsDerived: false, derivedBackgroundFeatSpellAbility: undefined }
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
        const feat = backgroundEntry.feat
          ? findFeatByBackgroundFeatText(backgroundEntry.feat, backgroundEntry.pack)
          : undefined
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
    case 'martial':
      return classEntry
        ? `${classEntry.name}'s Weapon Mastery lets you use special properties on your chosen weapons — pick ones that match your starting equipment.`
        : 'Weapon Mastery lets you use a special combat property on a limited number of weapon types.'
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

const FLAT_ABILITY_SCORES: AbilityScoresData = {
  rolls: [10, 10, 10, 10, 10, 10],
  assignment: { Strength: 10, Dexterity: 10, Constitution: 10, Intelligence: 10, Wisdom: 10, Charisma: 10 },
  backgroundIncrease: {},
}

/** Minimal provisional `CharacterData` for #19's stat-delta preview —
 * `classId`/`speciesId`/`backgroundId` are always real by the time the
 * Abilities/Skills/Equipment steps render (Class and Origin come first in
 * `steps`), so this only needs to fill defaults for the *current* step's
 * own not-yet-made choice. Not a general partial-CharacterData builder;
 * `handleSave`'s own assembly (spells, origin feats, etc.) stays separate
 * since none of that affects the three stats `quickStats` computes. */
export function provisionalCharacterData(overrides: {
  classId: string
  speciesId: string
  backgroundId: string
  abilityScores: AbilityScoresData
  skillProficiencies?: string[]
  equipmentChoice?: string
}): CharacterData {
  return {
    speciesId: overrides.speciesId,
    backgroundId: overrides.backgroundId,
    classes: [{ classId: overrides.classId, level: 1 }],
    abilityScores: overrides.abilityScores,
    skillProficiencies: overrides.skillProficiencies ?? [],
    equipmentChoice: overrides.equipmentChoice ?? '',
  }
}

/** #19: "Option A: AC 10 → 16"-style delta for whatever the current step's
 * choice actually affects, comparing a flat-10/no-pick baseline against the
 * player's current in-progress selection. Only Abilities/Skills/Equipment
 * make a real before/after comparison — Class and Origin precede any
 * ability-score input (so AC/HP aren't resolvable yet), and Species Bonus/
 * Spells/Name don't affect these three stats at all. */
export function statsDeltaFor(
  step: string,
  classId: string | null,
  speciesId: string | null,
  backgroundId: string | null,
  abilityScores: AbilityScoresData | null,
  skillsChosen: string[],
  backgroundSkills: string[],
  equipmentChoice: string | null,
): string[] {
  if (!classId || !speciesId || !backgroundId || !abilityScores) return []
  const base = { classId, speciesId, backgroundId }

  switch (step) {
    case 'abilities': {
      // Both snapshots carry the real (already-made) equipment choice, not
      // the empty default — otherwise going Back from Equipment to Abilities
      // after picking armor would show an unarmored AC that contradicts the
      // character's actual sheet.
      const before = quickStats(
        provisionalCharacterData({ ...base, abilityScores: FLAT_ABILITY_SCORES, equipmentChoice: equipmentChoice ?? undefined }),
      )
      const after = quickStats(
        provisionalCharacterData({ ...base, abilityScores, equipmentChoice: equipmentChoice ?? undefined }),
      )
      return diffQuickStats(before, after)
    }
    case 'skills': {
      // Both snapshots report bonuses for the SAME skill set (the union) so
      // a just-picked skill (proficient only in "after") still shows a
      // delta — quickStats() only reports a bonus for a skill it's told to,
      // and diffQuickStats() only compares skills present in both.
      const allSkills = Array.from(new Set([...skillsChosen, ...backgroundSkills]))
      const before = quickStats(
        provisionalCharacterData({ ...base, abilityScores, skillProficiencies: backgroundSkills }),
        allSkills,
      )
      const after = quickStats(
        provisionalCharacterData({ ...base, abilityScores, skillProficiencies: allSkills }),
        allSkills,
      )
      return diffQuickStats(before, after)
    }
    case 'equipment': {
      if (!equipmentChoice) return []
      const before = quickStats(provisionalCharacterData({ ...base, abilityScores }))
      const after = quickStats(provisionalCharacterData({ ...base, abilityScores, equipmentChoice }))
      return diffQuickStats(before, after)
    }
    default:
      return []
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
  const [backgroundFeatSpellAbility, setBackgroundFeatSpellAbility] = useState<string | null>(null)
  const [originFeatSpellList, setOriginFeatSpellList] = useState<string | null>(null)
  const [originFeatSpellAbility, setOriginFeatSpellAbility] = useState<string | null>(null)
  const [versatileSpellCantrips, setVersatileSpellCantrips] = useState<string[]>([])
  const [versatileSpellPrepared, setVersatileSpellPrepared] = useState<string[]>([])
  const [fightingStyleFeatId, setFightingStyleFeatId] = useState<string | null>(null)
  const [weaponMasteryIds, setWeaponMasteryIds] = useState<string[]>([])
  const [lastSpellId, setLastSpellId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const classEntry = classId ? getClass(classId) : undefined
  const speciesEntry = speciesId ? getSpecies(speciesId) : undefined
  const backgroundEntry = backgroundId ? getBackground(backgroundId) : undefined
  const casterCounts = classEntry ? getCasterCounts(classEntry) : null
  const isCaster = casterCounts !== null
  const featSpellList = backgroundFeatSpellList(backgroundEntry?.feat, backgroundEntry?.pack)
  const hasFeatSpells = !!featSpellList
  const resolvedBackgroundFeat = backgroundEntry?.feat
    ? findFeatByBackgroundFeatText(backgroundEntry.feat, backgroundEntry.pack)
    : undefined
  const { backgroundSpellAbilities, backgroundAbilityIsDerived, derivedBackgroundFeatSpellAbility } =
    resolveBackgroundFeatSpellAbility(featSpellList, resolvedBackgroundFeat)
  const resolvedBackgroundFeatSpellAbility = backgroundAbilityIsDerived
    ? derivedBackgroundFeatSpellAbility
    : backgroundFeatSpellAbility
  const hasSkillfulTrait = !!speciesEntry?.traits.some((t) => t.name === 'Skillful')
  const hasVersatileTrait = !!speciesEntry?.traits.some((t) => t.name === 'Versatile')
  const hasSpeciesBonusStep = hasSkillfulTrait || hasVersatileTrait
  const originFeat = originFeatId ? getFeat(originFeatId) : undefined
  // Mirrors StepSpeciesBonus's own guarded parseFeatSpellLists call: an
  // admin-imported feat's prose is only identity-checked at import time for
  // feats literally named "Magic Initiate" (see SPELL_GRANTING_FEATS in
  // parse-feats-import.js), not for every feat that merely looks
  // spell-granting — an unguarded call here would crash the whole wizard
  // (not just the speciesBonus step) as soon as such a feat is picked.
  let versatileSpellLists: string[] = []
  if (originFeat) {
    try {
      versatileSpellLists = parseFeatSpellLists(originFeat).filter((l) => l !== featSpellList)
    } catch (err) {
      console.warn(`Feat "${originFeat.name}" (${originFeat.id}): couldn't parse its spell list`, err)
    }
  }
  const grantsVersatileSpells = versatileSpellLists.length > 0
  // #3: shown whenever the class has a Weapon Mastery feature at level 1 —
  // every bundled martial class does, and Fighting Style (Fighter only, at
  // creation; Paladin/Ranger get it later via level-up) is gated separately
  // inside StepMartial itself, so this single check covers the step's
  // presence for all five martial classes.
  const hasMartialStep = !!classId && weaponMasteryCount(classId, 1) !== undefined

  const steps = useMemo(
    () =>
      (
        ['class', 'origin', 'abilities', 'skills', 'speciesBonus', 'martial', 'equipment', 'spells', 'name'] as const
      ).filter(
        (s) =>
          (s !== 'spells' || isCaster || hasFeatSpells || grantsVersatileSpells) &&
          (s !== 'speciesBonus' || hasSpeciesBonusStep) &&
          (s !== 'martial' || hasMartialStep),
      ),
    [isCaster, hasFeatSpells, grantsVersatileSpells, hasSpeciesBonusStep, hasMartialStep],
  )
  const [stepIndex, setStepIndex] = useState(0)
  const step = steps[stepIndex]

  const statsDelta = useMemo(
    () =>
      statsDeltaFor(
        step,
        classId,
        speciesId,
        backgroundId,
        abilityScores,
        skillsChosen,
        backgroundEntry?.skillProficiencies ?? [],
        equipmentChoice,
      ),
    [step, classId, speciesId, backgroundId, abilityScores, skillsChosen, backgroundEntry, equipmentChoice],
  )

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
      case 'martial': {
        if (!classId) return false
        const count = weaponMasteryCount(classId, 1)
        const masteryDone = count === undefined || weaponMasteryIds.length === count
        const unlocksAt = fightingStyleUnlockLevel(classId)
        const fightingStyleDone = unlocksAt === undefined || unlocksAt > 1 || !!fightingStyleFeatId
        return masteryDone && fightingStyleDone
      }
      case 'equipment':
        return !!equipmentChoice
      case 'spells': {
        const casterDone = !casterCounts || (spellCantrips.length === casterCounts.cantrips && spellPrepared.length === casterCounts.preparedOrKnown)
        const featDone =
          !hasFeatSpells ||
          (featSpellCantrips.length === 2 && featSpellPrepared.length === 1 && !!resolvedBackgroundFeatSpellAbility)
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

  // #3: switching class invalidates any Fighting Style feat / Weapon Mastery
  // picks made under the PREVIOUS class — a different class's Weapon Mastery
  // pool can exclude a previously-chosen weapon (e.g. Fighter -> Barbarian
  // drops ranged weapons) or the new class might not have these features at
  // all (e.g. -> Wizard). Clearing here, rather than only hiding the step,
  // stops a stale/rules-illegal pick from silently surviving into handleSave.
  function handleChangeClass(newClassId: string) {
    setClassId(newClassId)
    setFightingStyleFeatId(null)
    setWeaponMasteryIds([])
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
      classes: [
        {
          classId,
          level: 1,
          ...(fightingStyleFeatId ? { fightingStyleFeatId } : {}),
          ...(weaponMasteryIds.length > 0 ? { weaponMasteryIds } : {}),
        },
      ],
      abilityScores,
      skillProficiencies: Array.from(
        new Set([...skillsChosen, ...(backgroundEntry?.skillProficiencies ?? []), ...(bonusSkill ? [bonusSkill] : [])]),
      ),
      equipmentChoice,
      ...(isCaster ? { spells: { cantrips: spellCantrips, prepared: spellPrepared } } : {}),
      ...(originFeatId ? { originFeatId } : {}),
      ...(hasFeatSpells ? { originFeatSpells: { cantrips: featSpellCantrips, prepared: featSpellPrepared } } : {}),
      ...(hasFeatSpells && resolvedBackgroundFeatSpellAbility
        ? { backgroundFeatSpellAbility: resolvedBackgroundFeatSpellAbility }
        : {}),
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
          stats={statsDelta}
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
        {step === 'class' && <StepClass classId={classId} onSelect={handleChangeClass} />}

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

        {step === 'martial' && classId && (
          <StepMartial
            classId={classId}
            level={1}
            fightingStyleFeatId={fightingStyleFeatId}
            onChangeFightingStyleFeatId={setFightingStyleFeatId}
            weaponMasteryIds={weaponMasteryIds}
            onChangeWeaponMasteryIds={setWeaponMasteryIds}
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
            {featSpellList && backgroundAbilityIsDerived && derivedBackgroundFeatSpellAbility && (
              <p className="text-sm">
                Spellcasting ability: <span className="font-bold">{derivedBackgroundFeatSpellAbility}</span> (matches{' '}
                {featSpellList}'s own spellcasting ability)
              </p>
            )}
            {featSpellList && !backgroundAbilityIsDerived && backgroundSpellAbilities.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="pixel-label">Choose a spellcasting ability</p>
                <div className="flex flex-wrap gap-2">
                  {backgroundSpellAbilities.map((ability) => (
                    <button
                      key={ability}
                      type="button"
                      onClick={() => setBackgroundFeatSpellAbility(ability)}
                      className={`pixel-btn ${backgroundFeatSpellAbility === ability ? '' : 'pixel-btn-secondary'}`}
                    >
                      {ability}
                    </button>
                  ))}
                </div>
              </div>
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
