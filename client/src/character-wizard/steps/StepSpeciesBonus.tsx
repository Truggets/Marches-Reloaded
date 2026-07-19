import { listFeats } from '@data'
import { ALL_SKILLS } from '../types'

interface Props {
  hasSkillfulTrait: boolean
  hasVersatileTrait: boolean
  alreadyGrantedSkills: string[]
  bonusSkill: string | null
  onChangeBonusSkill: (skill: string) => void
  originFeatId: string | null
  onChangeOriginFeat: (featId: string) => void
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
}: Props) {
  const originFeats = listFeats('Origin')
  const selectedFeat = originFeatId ? originFeats.find((f) => f.id === originFeatId) : undefined

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
          {selectedFeat && <p className="text-sm">{selectedFeat.benefit}</p>}
        </div>
      )}
    </div>
  )
}
