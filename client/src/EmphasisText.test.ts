import { describe, expect, it } from 'vitest'
import { renderEmphasis } from './EmphasisText'

// renderEmphasis returns React elements (createElement objects), not DOM —
// no jsdom needed, just inspect .type/.props like the rest of this repo's
// pure-function tests do.
function textOf(nodes: unknown): string {
  return (nodes as { props?: { children?: unknown } }[])
    .map((n) => (typeof n === 'string' ? n : String((n.props as { children?: unknown })?.children ?? '')))
    .join('')
}

describe('renderEmphasis', () => {
  it('renders **bold** as a <strong> element', () => {
    const nodes = renderEmphasis('You gain **two Cantrips** of your choice.') as { type?: unknown }[]
    const strongNode = nodes.find((n) => n.type === 'strong')
    expect(strongNode).toBeDefined()
    expect(textOf([strongNode])).toBe('two Cantrips')
  })

  it('renders _italic_ as an <em> element', () => {
    const nodes = renderEmphasis('_Two Cantrips._ You learn spells.') as { type?: unknown }[]
    const emNode = nodes.find((n) => n.type === 'em')
    expect(emNode).toBeDefined()
    expect(textOf([emNode])).toBe('Two Cantrips.')
  })

  it('passes plain text through unchanged', () => {
    expect(textOf(renderEmphasis('No markup here at all.'))).toBe('No markup here at all.')
  })

  it('handles multiple emphasis runs in one string', () => {
    const nodes = renderEmphasis('**A** and **B** and _C_') as { type?: unknown }[]
    const strongCount = nodes.filter((n) => n.type === 'strong').length
    const emCount = nodes.filter((n) => n.type === 'em').length
    expect(strongCount).toBe(2)
    expect(emCount).toBe(1)
  })
})
