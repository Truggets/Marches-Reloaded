import { parseEquipmentOptions } from '../parsing'

interface Props {
  startingEquipment: string
  chosen: string | null
  onChange: (letter: string) => void
}

export function StepEquipment({ startingEquipment, chosen, onChange }: Props) {
  const options = parseEquipmentOptions(startingEquipment)

  return (
    <div className="flex flex-col gap-4">
      <h2 className="pixel-title text-lg">Starting Equipment</h2>
      <div className="flex flex-col gap-3">
        {options.map((opt) => (
          <label
            key={opt.letter}
            className={`pixel-panel flex cursor-pointer items-start gap-3 !p-4 ${
              chosen === opt.letter ? 'outline outline-3 outline-[var(--color-arcane)]' : ''
            }`}
          >
            <input
              type="radio"
              name="equipment"
              checked={chosen === opt.letter}
              onChange={() => onChange(opt.letter)}
              className="mt-1"
            />
            <span>
              <span className="pixel-label">Option {opt.letter}</span>
              <br />
              <span className="text-sm">{opt.text}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}
