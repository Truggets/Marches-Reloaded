interface Props {
  name: string
  onChange: (name: string) => void
}

export function StepName({ name, onChange }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="pixel-title text-lg">Name Your Character</h2>
      <label className="flex flex-col gap-1">
        <span className="pixel-label">Character name</span>
        <input
          type="text"
          value={name}
          onChange={(e) => onChange(e.target.value)}
          className="pixel-input"
          required
        />
      </label>
    </div>
  )
}
