import { useState } from 'react'
import { renderEmphasis } from './EmphasisText'

interface Props {
  tip: string
  // #19: "AC 12 → 16"-style mechanical deltas for the choice just made.
  // Rendered as their own line, outside `tip`'s truncation budget — folding
  // these into `tip` would let them push real advice text behind "Show
  // more" (or past it entirely) once both together cross PREVIEW_LENGTH.
  stats?: string[]
}

// Long benefit/description text (e.g. Magic Initiate's full feat text) would
// otherwise push the wizard's Next button down the page every time it's
// shown — truncate by default and let the player expand it.
const PREVIEW_LENGTH = 120

/** Inline building-advice bubble shown during character creation. Deliberately
 * NOT the fixed-position WilburCompanion — that one is purely decorative and
 * hidden below 640px (it was overlapping real content), but this tip is real
 * content, so it renders in normal document flow and stays visible at every
 * width. */
export function WilburTip({ tip, stats }: Props) {
  const [expanded, setExpanded] = useState(false)
  const isLong = tip.length > PREVIEW_LENGTH
  const displayText = expanded || !isLong ? tip : `${tip.slice(0, PREVIEW_LENGTH).trimEnd()}…`

  return (
    <div className="pixel-panel !p-3 flex items-start gap-3">
      <img
        src="/wilbur-pixel.png"
        alt=""
        aria-hidden="true"
        className="h-10 w-10 shrink-0"
        style={{ imageRendering: 'pixelated' }}
      />
      <div className="flex-1">
        {stats && stats.length > 0 && (
          <p className="text-sm font-bold">{stats.join(' · ')}</p>
        )}
        <p className="text-sm">
          <span className="pixel-label">Wilbur says:</span> {renderEmphasis(displayText)}
        </p>
        {isLong && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="pixel-link text-xs mt-1"
          >
            {expanded ? 'Show less' : 'Show more'}
          </button>
        )}
      </div>
    </div>
  )
}
