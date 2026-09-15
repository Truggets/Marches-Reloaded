import { describe, expect, it } from 'vitest'
import { truncateAtWordBoundary } from './WilburTip'

describe('truncateAtWordBoundary', () => {
  it('returns the text unchanged when it fits within maxLength', () => {
    expect(truncateAtWordBoundary('short text', 120)).toBe('short text')
  })

  it('cuts at the last word boundary, never mid-word', () => {
    // Truman's real report: "...pick one that fits how you wan…" cut
    // mid-"want" with the old raw slice(0, 120). Reproduce with a shorter
    // budget for a fast, exact test.
    const text = 'pick one that fits how you want to play'
    const result = truncateAtWordBoundary(text, 30)
    expect(result).toBe('pick one that fits how you…')
    expect(result.endsWith('wan…')).toBe(false)
  })

  it('ends with an ellipsis, not the raw cut character', () => {
    // Asserts the exact output, not just endsWith('…') — a raw mid-word
    // slice with an appended ellipsis would also pass an endsWith-only
    // check (PR #37 review), which wouldn't actually guard the
    // word-boundary logic this test is meant to cover.
    const result = truncateAtWordBoundary('one two three four five', 10)
    expect(result).toBe('one two…')
  })

  it('treats a newline as a word boundary too, not just a literal space', () => {
    const result = truncateAtWordBoundary('one two\nthree four', 10)
    expect(result).toBe('one two…')
  })

  it('falls back to a hard cut for a single word longer than maxLength', () => {
    const text = 'supercalifragilisticexpialidocious'
    const result = truncateAtWordBoundary(text, 10)
    expect(result).toBe('supercalif…')
  })

  it('does not include trailing whitespace before the ellipsis', () => {
    const result = truncateAtWordBoundary('one two three', 8)
    expect(result).not.toMatch(/\s…$/)
  })
})
