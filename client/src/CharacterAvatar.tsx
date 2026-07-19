import { useMemo } from 'react'
import { avatarDataUri } from './avatar'

interface Props {
  id: number
  label: string
  size?: number
}

/** M7: deterministic pixel-art avatar for a character, seeded by its stable
 * numeric id (same character -> same avatar, everywhere it's shown). Unlike
 * WilburCompanion (a decorative mascot), this image identifies a specific
 * character, so it gets a real `alt`, not `alt=""`. */
export function CharacterAvatar({ id, label, size = 64 }: Props) {
  const dataUri = useMemo(() => avatarDataUri(String(id)), [id])

  return (
    <div className="pixel-frame p-1" style={{ width: size, height: size }}>
      <img src={dataUri} alt={`${label} avatar`} width={size} height={size} />
    </div>
  )
}
