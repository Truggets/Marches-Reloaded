import { getClass, listFeats } from '@data'
import { parseFeatSpellAbilities, parseFeatSpellLists, parseSpellcastingAbility } from '../../engine/computeSheet'
import { renderEmphasis } from '../../EmphasisText'
import { FeatPicker } from '../../FeatPicker'
import { ALL_SKILLS } from '../types'

interface Props {
  hasSkillfulTrait: boolean
  hasVersatileTrait: boolean
  alreadyGrantedSkills: string[]
  bonusSkill: string | null
  onChangeBonusSkill: (skill: string) => void
  originFeatId: string | null
  onChangeOriginFeat: (featId: string) => void
  // Spell list already used by a background-granted feat of the same name
  // (e.g. Sage's "Magic Initiate (Wizard)") — excluded from the choices here
  // per Magic Initiate's "different spell list each time" rule.
  excludeSpellList?: string
  originFeatSpellList: string | null
  onChangeOriginFeatSpellList: (list: string) => void
  originFeatSpellAbility: string | null
  onChangeOriginFeatSpellAbility: (ability: string) => void
}

/** Handles species traits that grant an open-ended bonus choice (currently
 * only Human's Skillful [one skill] and Versatile [one Origin feat]) — these
 * are data-driven off the species' own trait list, not hardcoded to "human",
 * so any future species with the same trait names gets this step for free. */
export function StepSpeciesBonus({
  hasSkillfulTrait,
  hasVersatileTrait,
  alreadyGrantedSkills,
  bonusSkill,
  onChangeBonusSkill,
  originFeatId,
  onChangeOriginFeat,
  excludeSpellList,
  originFeatSpellList,
  onChangeOriginFeatSpellList,
  originFeatSpellAbility,
  onChangeOriginFeatSpellAbility,
}: Props) {
  const originFeats = listFeats('Origin')
  const selectedFeat = originFeatId ? originFeats.find((f) => f.id === originFeatId) : undefined
  const spellLists = selectedFeat ? parseFeatSpellLists(selectedFeat).filter((l) => l !== excludeSpellList) : []
  const spellAbilities = selectedFeat ? parseFeatSpellAbilities(selectedFeat) : []
  // PHB-2024-style Magic Initiate has no free ability choice — its
  // spellcasting ability is whichever the chosen class already uses (see
  // parseSpellcastingAbility's docs). Distinguishing "this feat has no
  // spells" from "this feat's ability is derived, not chosen" by whether
  // spellLists is non-empty while spellAbilities is empty.
  const abilityIsDerivedFromClass = spellLists.length > 0 && spellAbilities.length === 0

  function handleChooseSpellList(list: string) {
    onChangeOriginFeatSpellList(list)
    if (abilityIsDerivedFromClass) {
      const classEntry = getClass(list.toLowerCase())
      const derivedAbility = classEntry && parseSpellcastingAbility(classEntry)
      if (derivedAbility) onChangeOriginFeatSpellAbility(derivedAbility)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="pixel-title text-lg">Species Bonus</h2>

      {hasSkillfulTrait && (
        <div className="flex flex-col gap-2">
          <p className="pixel-label">Skillful: choose 1 bonus skill proficiency</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {ALL_SKILLS.map((skill) => {
              const alreadyGranted = alreadyGrantedSkills.includes(skill)
              const selected = bonusSkill === skill
              return (
                <button
                  key={skill}
                  type="button"
                  disabled={alreadyGranted}
                  onClick={() => onChangeBonusSkill(skill)}
                  className={`pixel-btn ${selected ? '' : 'pixel-btn-secondary'}`}
                  title={alreadyGranted ? 'Already granted by class/background' : undefined}
                >
                  {skill}
                  {alreadyGranted ? ' (granted)' : ''}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {hasVersatileTrait && (
        <div className="flex flex-col gap-2">
          <p className="pixel-label">Versatile: choose 1 Origin feat</p>
          <FeatPicker feats={originFeats} selectedId={originFeatId} onSelect={onChangeOriginFeat} />
          {selectedFeat && <p className="text-sm">{renderEmphasis(selectedFeat.benefit)}</p>}

          {spellLists.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="pixel-label">Choose a spell list</p>
              <div className="flex flex-wrap gap-2">
                {spellLists.map((list) => (
                  <button
                    key={list}
                    type="button"
                    onClick={() => handleChooseSpellList(list)}
                    className={`pixel-btn ${originFeatSpellList === list ? '' : 'pixel-btn-secondary'}`}
                  >
                    {list}
                  </button>
                ))}
              </div>
              {abilityIsDerivedFromClass && originFeatSpellAbility && (
                <p className="text-sm">
                  Spellcasting ability: <span className="font-bold">{originFeatSpellAbility}</span> (matches{' '}
                  {originFeatSpellList}'s own spellcasting ability)
                </p>
              )}
            </div>
          )}

          {spellAbilities.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="pixel-label">Choose a spellcasting ability</p>
              <div className="flex flex-wrap gap-2">
                {spellAbilities.map((ability) => (
                  <button
                    key={ability}
                    type="button"
                    onClick={() => onChangeOriginFeatSpellAbility(ability)}
                    className={`pixel-btn ${originFeatSpellAbility === ability ? '' : 'pixel-btn-secondary'}`}
                  >
                    {ability}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
