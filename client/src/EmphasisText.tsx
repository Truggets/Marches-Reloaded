// Minimal markdown-emphasis renderer for SRD/content-pack prose. The bundled
// SRD text and (more heavily) imported content packs use **bold** and
// _italic_/*italic* markers to highlight key terms, but nothing else here
// ever renders markdown — no links, lists, code blocks, or tables — so a
// full markdown library would be a lot of surface area for two token types.
// See issue #18.
import { Fragment } from 'react'

// Matches **bold**, __bold__, *italic*, or _italic_ — checks the doubled
// marker first in each pair so "**x**" isn't misread as "*" + "*x*" + "*".
const EMPHASIS_PATTERN = /(\*\*.+?\*\*|__.+?__|\*.+?\*|_.+?_)/g

/** Parses a plain string containing markdown emphasis markers into React
 * nodes. Plain strings (no markers) pass through unchanged as a single
 * text node — this is safe to wrap around any existing plain-text render
 * site. */
export function renderEmphasis(text: string): React.ReactNode {
  const parts = text.split(EMPHASIS_PATTERN)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('__') && part.endsWith('__')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={i}>{part.slice(1, -1)}</em>
    }
    if (part.startsWith('_') && part.endsWith('_')) {
      return <em key={i}>{part.slice(1, -1)}</em>
    }
    return <Fragment key={i}>{part}</Fragment>
  })
}

/** Convenience component form of renderEmphasis for use directly in JSX. */
export function EmphasisText({ text }: { text: string }) {
  return <>{renderEmphasis(text)}</>
}
