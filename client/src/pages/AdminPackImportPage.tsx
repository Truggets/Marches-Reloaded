import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { initPacks } from '@data'
import { useAuth } from '../auth/AuthContext'
import { WilburCompanion } from '../WilburCompanion'

async function extractErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string; error?: string }
    return body.message ?? body.error ?? `Request failed (${res.status})`
  } catch {
    return `Request failed (${res.status})`
  }
}

/**
 * Admin-only content-pack import page (M2b, Phase 1). Delivery path for the
 * vault content: it lives on Truman's desktop, not on the VPS, so pasting
 * the raw vault-shaped JSON here and importing it is how content actually
 * reaches a running instance — see docs/planning/m2b-execution-plan.md.
 * Same admin-gating pattern as AdminEditJsonPage (client-side check is
 * cosmetic; the real authorization is server-side, requireRole("admin") on
 * POST /api/admin/packs/import).
 */
export function AdminPackImportPage() {
  const { user } = useAuth()

  const [packId, setPackId] = useState('phb-2024')
  const [packName, setPackName] = useState("Player's Handbook (2024)")
  const [featsText, setFeatsText] = useState('')
  const [backgroundsText, setBackgroundsText] = useState('')
  const [speciesText, setSpeciesText] = useState('')
  const [equipmentText, setEquipmentText] = useState('')
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{
    featCount?: number
    backgroundCount?: number
    speciesCount?: number
    equipmentCount?: number
  } | null>(null)

  async function handleImport() {
    setError(null)
    setResult(null)

    if (!featsText.trim() && !backgroundsText.trim() && !speciesText.trim() && !equipmentText.trim()) {
      setError('Paste at least one of Feats, Backgrounds, Species, or Equipment JSON before importing.')
      return
    }

    let feats: unknown
    if (featsText.trim()) {
      try {
        feats = JSON.parse(featsText)
      } catch {
        setError('Feats JSON is not valid — fix the syntax error and try again.')
        return
      }
    }

    let backgrounds: unknown
    if (backgroundsText.trim()) {
      try {
        backgrounds = JSON.parse(backgroundsText)
      } catch {
        setError('Backgrounds JSON is not valid — fix the syntax error and try again.')
        return
      }
    }

    let species: unknown
    if (speciesText.trim()) {
      try {
        species = JSON.parse(speciesText)
      } catch {
        setError('Species JSON is not valid — fix the syntax error and try again.')
        return
      }
    }

    let equipment: unknown
    if (equipmentText.trim()) {
      try {
        equipment = JSON.parse(equipmentText)
      } catch {
        setError('Equipment JSON is not valid — fix the syntax error and try again.')
        return
      }
    }

    setImporting(true)
    try {
      const res = await fetch('/api/admin/packs/import', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packId, packName, feats, backgrounds, species, equipment }),
      })
      if (!res.ok) throw new Error(await extractErrorMessage(res))
      const body = (await res.json()) as {
        featCount?: number
        backgroundCount?: number
        speciesCount?: number
        equipmentCount?: number
      }
      await initPacks() // so the admin's own freshly-imported pack shows up without a manual refresh
      setResult({
        featCount: body.featCount,
        backgroundCount: body.backgroundCount,
        speciesCount: body.speciesCount,
        equipmentCount: body.equipmentCount,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import pack')
    } finally {
      setImporting(false)
    }
  }

  if (!user?.isAdmin) {
    return <Navigate to="/characters" replace />
  }

  return (
    <div className="flex min-h-screen flex-col items-center gap-6 px-4 py-10">
      <h1 className="pixel-title text-2xl">Import Content Pack</h1>

      <Link to="/characters" className="pixel-link text-sm">
        &larr; My Characters
      </Link>

      <div className="pixel-panel flex w-full max-w-3xl flex-col gap-3">
        <p className="text-sm text-[var(--color-danger)]">
          Admin-only. Content imported here is stored on this instance only — never
          shipped or bundled with the app. Paste the vault-shaped feats JSON (the
          {' {feats: [...]} '}
          document, not an individual feat), the vault-shaped backgrounds JSON
          (the {' {backgrounds: [...]} '}
          document), the vault-shaped species JSON (the {' {species: [...]} '}
          document), and/or the vault-shaped equipment JSON (the
          {' {weapons: [...], armor: [...], adventuring_gear: [...]} '}
          document) below — each is independently optional, but at least one is
          required.
        </p>

        <label className="flex flex-col gap-1">
          <span className="pixel-label text-xs">Pack ID</span>
          <input
            value={packId}
            onChange={(e) => setPackId(e.target.value)}
            className="pixel-input"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="pixel-label text-xs">Pack Name</span>
          <input
            value={packName}
            onChange={(e) => setPackName(e.target.value)}
            className="pixel-input"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="pixel-label text-xs">Feats JSON</span>
          <textarea
            value={featsText}
            onChange={(e) => setFeatsText(e.target.value)}
            spellCheck={false}
            placeholder='{"feats": [...]}'
            className="pixel-input h-[24rem] w-full font-mono text-xs"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="pixel-label text-xs">Backgrounds JSON</span>
          <textarea
            value={backgroundsText}
            onChange={(e) => setBackgroundsText(e.target.value)}
            spellCheck={false}
            placeholder='{"backgrounds": [...]}'
            className="pixel-input h-[24rem] w-full font-mono text-xs"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="pixel-label text-xs">Species JSON</span>
          <textarea
            value={speciesText}
            onChange={(e) => setSpeciesText(e.target.value)}
            spellCheck={false}
            placeholder='{"species": [...]}'
            className="pixel-input h-[24rem] w-full font-mono text-xs"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="pixel-label text-xs">Equipment JSON</span>
          <textarea
            value={equipmentText}
            onChange={(e) => setEquipmentText(e.target.value)}
            spellCheck={false}
            placeholder='{"weapons": [...], "armor": [...], "adventuring_gear": [...]}'
            className="pixel-input h-[24rem] w-full font-mono text-xs"
          />
        </label>

        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
        {result && (
          <p className="text-sm text-[var(--color-success,green)]">
            Imported{' '}
            {[
              result.featCount !== undefined ? `${result.featCount} feats` : null,
              result.backgroundCount !== undefined ? `${result.backgroundCount} backgrounds` : null,
              result.speciesCount !== undefined ? `${result.speciesCount} species` : null,
              result.equipmentCount !== undefined ? `${result.equipmentCount} equipment` : null,
            ]
              .filter(Boolean)
              .join(', ')}{' '}
            into pack "{packId}".
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void handleImport()}
            disabled={
              importing ||
              (!featsText.trim() && !backgroundsText.trim() && !speciesText.trim() && !equipmentText.trim())
            }
            className="pixel-btn"
          >
            {importing ? 'Importing…' : 'Import'}
          </button>
        </div>
      </div>

      <WilburCompanion />
    </div>
  )
}
