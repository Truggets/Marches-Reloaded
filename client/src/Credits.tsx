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
    </p>
  )
}
