// M7: deterministic 8-bit pixel-art avatars, generated locally (no network
// call, no ongoing cost) via DiceBear's "Pixel Art" style (CC0 1.0). Kept as
// a pure function, separate from the React component, so it's unit-testable
// like the rest of the rules engine.
import { createAvatar } from '@dicebear/core'
import * as pixelArt from '@dicebear/pixel-art'

export function avatarDataUri(seed: string): string {
  return createAvatar(pixelArt, { seed }).toDataUri()
}
