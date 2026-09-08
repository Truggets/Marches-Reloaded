import { listFeats } from '@data'
import { parseFeatSpellAbilities, parseFeatSpellLists } from '../../engine/computeSheet'
import { renderEmphasis } from '../../EmphasisText'
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
          <div className="flex flex-wrap gap-2">
            {originFeats.map((feat) => (
              <button
                key={feat.id}
                type="button"
                onClick={() => onChangeOriginFeat(feat.id)}
                className={`pixel-btn ${originFeatId === feat.id ? '' : 'pixel-btn-secondary'}`}
              >
                {feat.name}
              </button>
            ))}
          </div>
          {selectedFeat && <p className="text-sm">{renderEmphasis(selectedFeat.benefit)}</p>}

          {spellLists.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="pixel-label">Choose a spell list</p>
              <div className="flex flex-wrap gap-2">
                {spellLists.map((list) => (
                  <button
                    key={list}
                    type="button"
                    onClick={() => onChangeOriginFeatSpellList(list)}
                    className={`pixel-btn ${originFeatSpellList === list ? '' : 'pixel-btn-secondary'}`}
                  >
                    {list}
                  </button>
                ))}
              </div>
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
