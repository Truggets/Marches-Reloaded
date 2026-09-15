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

/** Truncates `text` to at most `maxLength` characters at the last word
 * boundary at or before that cutoff (never mid-word — a raw
 * `text.slice(0, maxLength)` produced things like "...pick one that fits how
 * you wan…", cut off mid-"want", reported live by Truman). Falls back to a
 * hard character cut only if there's no whitespace at all within the first
 * `maxLength` characters (a single implausibly long "word") — better than
 * returning nothing. */
export function truncateAtWordBoundary(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  const slice = text.slice(0, maxLength)
  // Any whitespace, not just a literal space — a newline is the only
  // separator within budget for a small slice of curated content-pack
  // prose (PR #37 review), and `\s` still finds it.
  const lastSpaceMatch = [...slice.matchAll(/\s/g)].pop()
  const lastSpace = lastSpaceMatch ? lastSpaceMatch.index! : -1
  // `> 0`, not `>= 0` — a whitespace character at index 0 (a leading space
  // before one unbroken token) would otherwise cut to an empty string and
  // return a bare "…". Falling through to the hard cut instead is the
  // documented fallback, not a bug (PR #37 review confirmed this is the
  // deliberate choice).
  const cut = lastSpace > 0 ? slice.slice(0, lastSpace) : slice
  return `${cut.trimEnd()}…`
}

/** Inline building-advice bubble shown during character creation. Deliberately
 * NOT the fixed-position WilburCompanion — that one is purely decorative and
 * hidden below 640px (it was overlapping real content), but this tip is real
 * content, so it renders in normal document flow and stays visible at every
 * width. */
export function WilburTip({ tip, stats }: Props) {
  const [expanded, setExpanded] = useState(false)
  const isLong = tip.length > PREVIEW_LENGTH
  const displayText = expanded || !isLong ? tip : truncateAtWordBoundary(tip, PREVIEW_LENGTH)

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
