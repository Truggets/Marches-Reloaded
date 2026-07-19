import { parseSkillChoice } from '../parsing'

interface Props {
  classSkillProficiencies: string
  backgroundSkills: string[]
  chosen: string[]
  onChange: (chosen: string[]) => void
}

export function StepSkills({ classSkillProficiencies, backgroundSkills, chosen, onChange }: Props) {
  const { count, options } = parseSkillChoice(classSkillProficiencies)

  function toggle(skill: string) {
    if (chosen.includes(skill)) {
      onChange(chosen.filter((s) => s !== skill))
    } else if (chosen.length < count) {
      onChange([...chosen, skill])
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="pixel-title text-lg">Skills</h2>

      <div className="flex flex-col gap-2">
        <p className="pixel-label">
          Class: choose {count} ({chosen.length}/{count} selected)
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {options.map((skill) => {
            const isBackgroundGranted = backgroundSkills.includes(skill)
            const selected = chosen.includes(skill)
            return (
              <button
                key={skill}
                type="button"
                disabled={!selected && chosen.length >= count}
                onClick={() => toggle(skill)}
                className={`pixel-btn ${selected ? '' : 'pixel-btn-secondary'}`}
                title={isBackgroundGranted ? 'Also granted by background' : undefined}
              >
                {skill}
                {isBackgroundGranted ? ' (bg)' : ''}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="pixel-label">Background: granted automatically</p>
        <p className="text-sm">{backgroundSkills.join(', ') || 'None'}</p>
      </div>
    </div>
  )
}
