import { describe, expect, it } from 'vitest'
import { avatarDataUri } from './avatar'

describe('avatarDataUri', () => {
  it('is deterministic: the same seed always produces the same avatar', () => {
    expect(avatarDataUri('42')).toBe(avatarDataUri('42'))
  })

  it('gives different seeds visibly different avatars', () => {
    expect(avatarDataUri('1')).not.toBe(avatarDataUri('2'))
  })
})
