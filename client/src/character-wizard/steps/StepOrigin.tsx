import { listSpecies, listBackgrounds } from '@data'

interface Props {
  speciesId: string | null
  backgroundId: string | null
  onSelectSpecies: (id: string) => void
  onSelectBackground: (id: string) => void
}

export function StepOrigin({ speciesId, backgroundId, onSelectSpecies, onSelectBackground }: Props) {
  const species = listSpecies()
  const backgrounds = listBackgrounds()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h2 className="pixel-title text-lg">Choose a Species</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {species.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelectSpecies(s.id)}
              className={`pixel-btn ${speciesId === s.id ? '' : 'pixel-btn-secondary'}`}
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="pixel-title text-lg">Choose a Background</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {backgrounds.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => onSelectBackground(b.id)}
              className={`pixel-btn ${backgroundId === b.id ? '' : 'pixel-btn-secondary'}`}
            >
              {b.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
