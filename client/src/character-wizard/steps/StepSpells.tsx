import { getSpellsByClass } from '@data'

interface Props {
  className: string
  cantripCount: number
  preparedCount: number
  cantrips: string[]
  prepared: string[]
  onChangeCantrips: (ids: string[]) => void
  onChangePrepared: (ids: string[]) => void
  // #5: spellbook classes (Wizard) first pick a spellbook, then prepare from it.
  spellbookCount?: number
  spellbook?: string[]
  onChangeSpellbook?: (ids: string[]) => void
  // Spell ids already chosen elsewhere (e.g. by a second StepSpells block on
  // the same character — a class caster who also has a background-granted
  // spell feat from the same spell list) — hidden here so the same spell
  // can't be picked twice for no mechanical benefit.
  excludeIds?: string[]
  // Overrides the default "Spells" heading — needed when two StepSpells
  // blocks render on the same step (class spells + feat-granted spells) so
  // the player can tell them apart.
  heading?: string
}

export function StepSpells({
  className,
  cantripCount,
  preparedCount,
  cantrips,
  prepared,
  onChangeCantrips,
  onChangePrepared,
  spellbookCount,
  spellbook = [],
  onChangeSpellbook,
  excludeIds = [],
  heading = 'Spells',
}: Props) {
  const spells = getSpellsByClass(className)
  const cantripOptions = spells.filter((s) => s.level === 0 && !excludeIds.includes(s.id))
  // At character level 1 the highest available spell slot is 1st level, so
  // only 1st-level spells are choosable here regardless of the class's
  // full spell list (which spans all 9 levels).
  const leveledOptions = spells.filter((s) => s.level === 1 && !excludeIds.includes(s.id))

  function toggleCantrip(id: string) {
    if (cantrips.includes(id)) {
      onChangeCantrips(cantrips.filter((s) => s !== id))
    } else if (cantrips.length < cantripCount) {
      onChangeCantrips([...cantrips, id])
    }
  }

  const hasSpellbook = spellbookCount !== undefined && onChangeSpellbook !== undefined
  const preparedOptions = hasSpellbook ? leveledOptions.filter((s) => spellbook.includes(s.id)) : leveledOptions

  function toggleSpellbook(id: string) {
    if (!onChangeSpellbook || spellbookCount === undefined) return
    if (spellbook.includes(id)) {
      onChangeSpellbook(spellbook.filter((s) => s !== id))
    } else if (spellbook.length < spellbookCount) {
      onChangeSpellbook([...spellbook, id])
    }
  }

  function togglePrepared(id: string) {
    if (prepared.includes(id)) {
      onChangePrepared(prepared.filter((s) => s !== id))
    } else if (prepared.length < preparedCount) {
      onChangePrepared([...prepared, id])
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="pixel-title text-lg">{heading}</h2>

      <div className="flex flex-col gap-2">
        <p className="pixel-label">
          Cantrips: choose {cantripCount} ({cantrips.length}/{cantripCount})
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {cantripOptions.map((spell) => {
            const selected = cantrips.includes(spell.id)
            return (
              <button
                key={spell.id}
                type="button"
                disabled={!selected && cantrips.length >= cantripCount}
                onClick={() => toggleCantrip(spell.id)}
                className={`pixel-btn ${selected ? '' : 'pixel-btn-secondary'}`}
              >
                {spell.name}
              </button>
            )
          })}
        </div>
      </div>

      {hasSpellbook && (
        <div className="flex flex-col gap-2">
          <p className="pixel-label">
            Spellbook: choose {spellbookCount} ({spellbook.length}/{spellbookCount})
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {leveledOptions.map((spell) => {
              const selected = spellbook.includes(spell.id)
              return (
                <button
                  key={spell.id}
                  type="button"
                  disabled={!selected && spellbook.length >= (spellbookCount ?? 0)}
                  onClick={() => toggleSpellbook(spell.id)}
                  className={`pixel-btn ${selected ? '' : 'pixel-btn-secondary'}`}
                >
                  {spell.name}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <p className="pixel-label">
          Prepared{hasSpellbook ? ' (from your spellbook)' : '/Known'}: choose {preparedCount} ({prepared.length}/{preparedCount})
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {preparedOptions.map((spell) => {
            const selected = prepared.includes(spell.id)
            return (
              <button
                key={spell.id}
                type="button"
                disabled={!selected && prepared.length >= preparedCount}
                onClick={() => togglePrepared(spell.id)}
                className={`pixel-btn ${selected ? '' : 'pixel-btn-secondary'}`}
              >
                {spell.name}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
