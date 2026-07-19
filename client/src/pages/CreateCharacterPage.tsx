import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getBackground, getClass, getSpecies } from '@data'
import { StepClass } from '../character-wizard/steps/StepClass'
import { StepOrigin } from '../character-wizard/steps/StepOrigin'
import { StepAbilities } from '../character-wizard/steps/StepAbilities'
import { StepSkills } from '../character-wizard/steps/StepSkills'
import { StepSpeciesBonus } from '../character-wizard/steps/StepSpeciesBonus'
import { StepEquipment } from '../character-wizard/steps/StepEquipment'
import { StepSpells } from '../character-wizard/steps/StepSpells'
import { StepName } from '../character-wizard/steps/StepName'
import { getCasterCounts } from '../character-wizard/parsing'
import type { AbilityScoresData, CharacterData } from '../character-wizard/types'
import { WilburCompanion } from '../WilburCompanion'

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
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const classEntry = classId ? getClass(classId) : undefined
  const speciesEntry = speciesId ? getSpecies(speciesId) : undefined
  const backgroundEntry = backgroundId ? getBackground(backgroundId) : undefined
  const casterCounts = classEntry ? getCasterCounts(classEntry) : null
  const isCaster = casterCounts !== null
  const hasSkillfulTrait = !!speciesEntry?.traits.some((t) => t.name === 'Skillful')
  const hasVersatileTrait = !!speciesEntry?.traits.some((t) => t.name === 'Versatile')
  const hasSpeciesBonusStep = hasSkillfulTrait || hasVersatileTrait

  const steps = useMemo(
    () =>
      (['class', 'origin', 'abilities', 'skills', 'speciesBonus', 'equipment', 'spells', 'name'] as const).filter(
        (s) => (s !== 'spells' || isCaster) && (s !== 'speciesBonus' || hasSpeciesBonusStep),
      ),
    [isCaster, hasSpeciesBonusStep],
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
        return (!hasSkillfulTrait || !!bonusSkill) && (!hasVersatileTrait || !!originFeatId)
      case 'equipment':
        return !!equipmentChoice
      case 'spells':
        if (!casterCounts) return true
        return spellCantrips.length === casterCounts.cantrips && spellPrepared.length === casterCounts.preparedOrKnown
      case 'name':
        return name.trim().length > 0
      default:
        return false
    }
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
            onChangeOriginFeat={setOriginFeatId}
          />
        )}

        {step === 'equipment' && classEntry && (
          <StepEquipment
            startingEquipment={classEntry.startingEquipment}
            chosen={equipmentChoice}
            onChange={setEquipmentChoice}
          />
        )}

        {step === 'spells' && classEntry && casterCounts && (
          <StepSpells
            className={classEntry.name}
            cantripCount={casterCounts.cantrips}
            preparedCount={casterCounts.preparedOrKnown}
            cantrips={spellCantrips}
            prepared={spellPrepared}
            onChangeCantrips={setSpellCantrips}
            onChangePrepared={setSpellPrepared}
          />
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
