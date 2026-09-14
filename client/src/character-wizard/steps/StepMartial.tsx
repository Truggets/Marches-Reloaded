import { useState } from 'react'
import { getClass, getSpellsByClass, listFeats } from '@data'
import {
  fightingStyleAlternateCantripClass,
  fightingStyleUnlockLevel,
  weaponMasteryCount,
  weaponMasteryPool,
} from '../../engine/computeSheet'
import { renderEmphasis } from '../../EmphasisText'
import { ContentPicker } from '../../ContentPicker'

interface Props {
  classId: string
  level: number
  fightingStyleFeatId: string | null
  onChangeFightingStyleFeatId: (featId: string) => void
  // #26: absent/undefined on the creation-time wizard step (Paladin/Ranger
  // never reach their level-2 Fighting Style unlock at creation, so the
  // alternative can never apply there — see the file-level note below).
  // Present (even if empty) on the level-up flow, where it can.
  fightingStyleAlternateCantrips?: string[]
  onChangeFightingStyleAlternateCantrips?: (ids: string[]) => void
  weaponMasteryIds: string[]
  onChangeWeaponMasteryIds: (ids: string[]) => void
  // #26: suppresses the Fighting Style section even when the class/level
  // would otherwise show it — the level-up stepper only wants this section
  // rendered exactly at the unlock level, not on every later level once it's
  // already been chosen (unlike creation, where the step is only ever
  // rendered once, this component can be re-mounted many times across a
  // single level-up session).
  hideFightingStyle?: boolean
  // #26: weapon ids in `weaponMasteryIds` that were already committed at an
  // EARLIER level this session (or in a prior session) and can't be
  // toggled off here — without this, a level-up session that grows Weapon
  // Mastery at level 4 would let the player click an already-locked-in
  // level-1 pick and silently drop it.
  lockedWeaponMasteryIds?: string[]
}

/** #3/#26: Fighting Style feat (or, for Paladin/Ranger, the Blessed
 * Warrior/Druidic Warrior cantrip alternative) + Weapon Mastery weapon picks
 * for a martial class, at the level(s) each unlocks or grows (Fighter: both
 * at 1, mastery grows again at 4/10; Barbarian: Weapon Mastery only, grows
 * at 4/10; Rogue: Weapon Mastery only, flat; Paladin/Ranger: Weapon Mastery
 * at 1, Fighting Style at 2).
 *
 * Shared by three call sites: the creation wizard (CreateCharacterPage.tsx,
 * `onChangeFightingStyleAlternateCantrips` omitted since the cantrip
 * alternative can never be reachable at creation — Paladin/Ranger's Fighting
 * Style doesn't unlock until level 2), the level-up stepper (LevelUpPage.tsx,
 * for a level-up session that crosses an unlock/growth level), and the
 * retroactive picker (MartialChoicePage.tsx, for a class already past one of
 * those levels with the field left unset from before #26 existed).
 *
 * `weaponMasteryIds` is always the character's FULL current list (not just
 * new picks) — the cap check (`weaponMasteryCount(classId, level)`) is
 * against the total, so passing the existing ids in lets a level-up session
 * naturally offer only the newly-opened slots.
 *
 * Out of scope entirely (see docs/planning/issue-3-plan.md): Fighter's
 * "replace the Fighting Style feat each level" and every class's "change a
 * weapon mastery choice on Long Rest" — this only ever handles new choices.
 */
export function StepMartial({
  classId,
  level,
  fightingStyleFeatId,
  onChangeFightingStyleFeatId,
  fightingStyleAlternateCantrips,
  onChangeFightingStyleAlternateCantrips,
  weaponMasteryIds,
  onChangeWeaponMasteryIds,
  hideFightingStyle,
  lockedWeaponMasteryIds,
}: Props) {
  const fightingStyleUnlocksAt = fightingStyleUnlockLevel(classId)
  const showFightingStyle = !hideFightingStyle && fightingStyleUnlocksAt !== undefined && level >= fightingStyleUnlocksAt

  const alternateCantripClassId = fightingStyleAlternateCantripClass(classId)
  const supportsAlternate =
    alternateCantripClassId !== undefined && onChangeFightingStyleAlternateCantrips !== undefined
  // Local, not derived from `(fightingStyleAlternateCantrips ?? []).length > 0`
  // — a length-0 alternate-cantrips array is indistinguishable from "hasn't
  // chosen the alternative yet" as the player is still picking their first
  // cantrip, which would otherwise snap the toggle back to "feat" mode
  // mid-pick. Bug caught during the original #3 build; StepMartial.test
  // covers the underlying toggle logic isn't reachable at creation, so this
  // is exercised by the level-up/retroactive call sites.
  const [usingAlternate, setUsingAlternate] = useState(
    !!fightingStyleAlternateCantrips && fightingStyleAlternateCantrips.length > 0,
  )

  const masteryCount = weaponMasteryCount(classId, level)
  const weaponPool = masteryCount !== undefined ? weaponMasteryPool(classId) : []
  const fightingStyleFeats = listFeats('Fighting Style')
  const selectedFightingStyleFeat = fightingStyleFeatId
    ? fightingStyleFeats.find((f) => f.id === fightingStyleFeatId)
    : undefined
  const alternateCantripOptions =
    supportsAlternate && alternateCantripClassId
      ? getSpellsByClass(getClass(alternateCantripClassId)?.name ?? alternateCantripClassId).filter(
          (s) => s.level === 0,
        )
      : []

  function toggleWeapon(id: string) {
    if (lockedWeaponMasteryIds?.includes(id)) return
    if (weaponMasteryIds.includes(id)) {
      onChangeWeaponMasteryIds(weaponMasteryIds.filter((w) => w !== id))
    } else if (masteryCount !== undefined && weaponMasteryIds.length < masteryCount) {
      onChangeWeaponMasteryIds([...weaponMasteryIds, id])
    }
  }

  function toggleAlternateCantrip(id: string) {
    if (!onChangeFightingStyleAlternateCantrips) return
    const current = fightingStyleAlternateCantrips ?? []
    if (current.includes(id)) {
      onChangeFightingStyleAlternateCantrips(current.filter((s) => s !== id))
    } else if (current.length < 2) {
      onChangeFightingStyleAlternateCantrips([...current, id])
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="pixel-title text-lg">Martial Training</h2>

      {showFightingStyle && supportsAlternate && (
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-1">
            <input
              type="radio"
              checked={!usingAlternate}
              onChange={() => {
                setUsingAlternate(false)
                onChangeFightingStyleAlternateCantrips?.([])
              }}
            />
            Fighting Style feat
          </label>
          <label className="flex items-center gap-1">
            <input
              type="radio"
              checked={usingAlternate}
              onChange={() => {
                setUsingAlternate(true)
                // '' clears the feat picker's selection (ContentPicker takes
                // a plain string, not string|null) — every consumer must
                // treat this as "unset," the same as `null`, not as a real
                // feat id. PR #30 review caught a real bug where two
                // consumers gated "done" on `!== null` (true for '') while
                // committing on truthiness (false for '') — Continue/Confirm
                // enabled with nothing saved. Fixed at both call sites to use
                // truthiness consistently; flagging here so a future new
                // consumer doesn't reintroduce the same mismatch.
                onChangeFightingStyleFeatId('')
              }}
            />
            Cantrips instead
          </label>
        </div>
      )}

      {showFightingStyle && (!supportsAlternate || !usingAlternate) && (
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

      {showFightingStyle && supportsAlternate && usingAlternate && (
        <div className="flex flex-col gap-2">
          <p className="pixel-label">
            Cantrips: choose 2 ({(fightingStyleAlternateCantrips ?? []).length}/2)
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {alternateCantripOptions.map((spell) => {
              const selected = (fightingStyleAlternateCantrips ?? []).includes(spell.id)
              return (
                <button
                  key={spell.id}
                  type="button"
                  disabled={!selected && (fightingStyleAlternateCantrips ?? []).length >= 2}
                  onClick={() => toggleAlternateCantrip(spell.id)}
                  className={`pixel-btn ${selected ? '' : 'pixel-btn-secondary'}`}
                >
                  {spell.name}
                </button>
              )
            })}
          </div>
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
              const locked = lockedWeaponMasteryIds?.includes(weapon.id) ?? false
              return (
                <button
                  key={weapon.id}
                  type="button"
                  disabled={locked || (!selected && weaponMasteryIds.length >= masteryCount)}
                  onClick={() => toggleWeapon(weapon.id)}
                  className={`pixel-btn ${selected ? '' : 'pixel-btn-secondary'}`}
                >
                  {weapon.name}
                  {weapon.mastery ? ` (${weapon.mastery})` : ''}
                  {locked ? ' ✓' : ''}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
