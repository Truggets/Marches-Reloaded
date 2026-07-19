import { listClasses } from '@data'

interface Props {
  classId: string | null
  onSelect: (classId: string) => void
}

export function StepClass({ classId, onSelect }: Props) {
  const classes = listClasses()

  return (
    <div className="flex flex-col gap-4">
      <h2 className="pixel-title text-lg">Choose a Class</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {classes.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c.id)}
            className={`pixel-btn ${classId === c.id ? '' : 'pixel-btn-secondary'}`}
          >
            {c.name}
          </button>
        ))}
      </div>
    </div>
  )
}
