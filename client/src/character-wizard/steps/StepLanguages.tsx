import { listLanguages } from '@data'

interface Props {
  chosen: string[]
  onChange: (chosen: string[]) => void
}

const CHOICE_COUNT = 2

/** #16: every character knows Common (not shown as a pick — it's always
 * known) plus 2 chosen from the SRD's Standard Languages table. Rare
 * languages (Druidic, Thieves' Cant, etc.) come from specific class
 * features, not this creation-time choice, so they're excluded from the
 * picker entirely rather than shown disabled. */
export function StepLanguages({ chosen, onChange }: Props) {
  const options = listLanguages().filter((l) => l.standard && !l.alwaysKnown)

  function toggle(id: string) {
    if (chosen.includes(id)) {
      onChange(chosen.filter((l) => l !== id))
    } else if (chosen.length < CHOICE_COUNT) {
      onChange([...chosen, id])
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="pixel-title text-lg">Languages</h2>

      <p className="text-sm">Every character knows Common.</p>

      <div className="flex flex-col gap-2">
        <p className="pixel-label">
          Choose {CHOICE_COUNT} more ({chosen.length}/{CHOICE_COUNT} selected)
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {options.map((lang) => {
            const selected = chosen.includes(lang.id)
            return (
              <button
                key={lang.id}
                type="button"
                disabled={!selected && chosen.length >= CHOICE_COUNT}
                onClick={() => toggle(lang.id)}
                className={`pixel-btn ${selected ? '' : 'pixel-btn-secondary'}`}
              >
                {lang.name}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
