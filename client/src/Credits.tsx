import { getManifest } from '@data'

export function Credits() {
  const manifest = getManifest()
  return (
    <p className="mt-6 max-w-md text-center text-xs text-[var(--color-shadow)]/60">
      {manifest.name} content is licensed under {manifest.license}.{' '}
      <a
        href="https://creativecommons.org/licenses/by/4.0/legalcode"
        target="_blank"
        rel="noreferrer"
        className="pixel-link"
      >
        View license
      </a>
      <br />
      Character avatars generated with{' '}
      <a href="https://www.dicebear.com" target="_blank" rel="noreferrer" className="pixel-link">
        DiceBear
      </a>{' '}
      "Pixel Art" style, licensed{' '}
      <a
        href="https://creativecommons.org/publicdomain/zero/1.0/"
        target="_blank"
        rel="noreferrer"
        className="pixel-link"
      >
        CC0 1.0
      </a>
      .
    </p>
  )
}
