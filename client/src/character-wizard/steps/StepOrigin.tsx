import { listSpecies, listBackgrounds } from '@data'
import { ContentPicker } from '../../ContentPicker'

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
        <ContentPicker
          items={species}
          selectedId={speciesId}
          onSelect={onSelectSpecies}
          searchPlaceholder="Search species by name…"
        />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="pixel-title text-lg">Choose a Background</h2>
        <ContentPicker
          items={backgrounds}
          selectedId={backgroundId}
          onSelect={onSelectBackground}
          searchPlaceholder="Search backgrounds by name…"
        />
      </div>
    </div>
  )
}
