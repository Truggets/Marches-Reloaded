import { listFeats } from '@data'
import { fightingStyleUnlockLevel, weaponMasteryCount, weaponMasteryPool } from '../../engine/computeSheet'
import { renderEmphasis } from '../../EmphasisText'
import { ContentPicker } from '../../ContentPicker'

interface Props {
  classId: string
  level: number
  fightingStyleFeatId: string | null
  onChangeFightingStyleFeatId: (featId: string) => void
  weaponMasteryIds: string[]
  onChangeWeaponMasteryIds: (ids: string[]) => void
}

/** #3: Fighting Style feat + Weapon Mastery weapon picks for a martial class,
 * at the level each unlocks (Fighter: both at 1; Barbarian/Rogue: Weapon
 * Mastery only; Paladin/Ranger: Weapon Mastery at 1 here, Fighting Style at
 * 2 via level-up — level-up wiring, including Paladin/Ranger's Fighting
 * Style prompt and Fighter/Barbarian's later mastery-count increases, is a
 * tracked follow-up (see docs/planning/issue-3-plan.md), not built yet).
 *
 * Deliberately doesn't render Paladin's Blessed Warrior / Ranger's Druidic
 * Warrior (a cantrip-learning alternative to picking a Fighting Style feat)
 * — at creation-time (level 1) neither class has reached its Fighting Style
 * unlock level (2) yet, so that choice can never actually appear here; it
 * belongs in the level-up follow-up alongside the rest of their Fighting
 * Style prompt.
 *
 * Out of scope entirely (see the plan doc): Fighter's "replace the Fighting
 * Style feat each level" and every class's "change a weapon mastery choice
 * on Long Rest" — this only ever handles an initial choice.
 */
export function StepMartial({
  classId,
  level,
  fightingStyleFeatId,
  onChangeFightingStyleFeatId,
  weaponMasteryIds,
  onChangeWeaponMasteryIds,
}: Props) {
  const fightingStyleUnlocksAt = fightingStyleUnlockLevel(classId)
  const showFightingStyle = fightingStyleUnlocksAt !== undefined && level >= fightingStyleUnlocksAt

  const masteryCount = weaponMasteryCount(classId, level)
  const weaponPool = masteryCount !== undefined ? weaponMasteryPool(classId) : []
  const fightingStyleFeats = listFeats('Fighting Style')
  const selectedFightingStyleFeat = fightingStyleFeatId
    ? fightingStyleFeats.find((f) => f.id === fightingStyleFeatId)
    : undefined

  function toggleWeapon(id: string) {
    if (weaponMasteryIds.includes(id)) {
      onChangeWeaponMasteryIds(weaponMasteryIds.filter((w) => w !== id))
    } else if (masteryCount !== undefined && weaponMasteryIds.length < masteryCount) {
      onChangeWeaponMasteryIds([...weaponMasteryIds, id])
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="pixel-title text-lg">Martial Training</h2>

      {showFightingStyle && (
        <div className="flex flex-col gap-3">
          <p className="pixel-label">Fighting Style: choose 1 feat</p>
          <ContentPicker
            items={fightingStyleFeats}
            selectedId={fightingStyleFeatId}
            onSelect={onChangeFightingStyleFeatId}
            searchPlaceholder="Search Fighting Style feats…"
          />
          {selectedFightingStyleFeat && (
            <p className="text-sm">{renderEmphasis(selectedFightingStyleFeat.benefit)}</p>
          )}
        </div>
      )}

      {masteryCount !== undefined && (
        <div className="flex flex-col gap-2">
          <p className="pixel-label">
            Weapon Mastery: choose {masteryCount} ({weaponMasteryIds.length}/{masteryCount})
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {weaponPool.map((weapon) => {
              const selected = weaponMasteryIds.includes(weapon.id)
              return (
                <button
                  key={weapon.id}
                  type="button"
                  disabled={!selected && weaponMasteryIds.length >= masteryCount}
                  onClick={() => toggleWeapon(weapon.id)}
                  className={`pixel-btn ${selected ? '' : 'pixel-btn-secondary'}`}
                >
                  {weapon.name}
                  {weapon.mastery ? ` (${weapon.mastery})` : ''}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
