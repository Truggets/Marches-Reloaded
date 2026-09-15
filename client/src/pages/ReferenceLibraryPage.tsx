import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { listHazards, listMagicItems } from '@data'
import { renderEmphasis } from '../EmphasisText'
import { WilburCompanion } from '../WilburCompanion'

/**
 * #22 display-only reference library: hazards/conditions and magic items
 * imported via the admin pack importer. Read-only for every authenticated
 * user — no mechanical integration, purely informational (see
 * docs/planning/issue-22-and-subclass-import-plan.md's "small win first"
 * scoping). Empty until an admin imports a hazards/magic-items pack, since
 * both categories are 100% import-only (data/index.ts).
 */
export function ReferenceLibraryPage() {
  const [query, setQuery] = useState('')

  // listHazards()/listMagicItems() return a fresh array each call, so these
  // stay memoized on mount only (not on every render) rather than as a
  // useMemo dependency, which would never hit its cache.
  const hazards = useMemo(() => listHazards(), [])
  const magicItems = useMemo(() => listMagicItems(), [])

  const filteredHazards = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return hazards
    return hazards.filter((h) => h.name.toLowerCase().includes(q) || h.category?.toLowerCase().includes(q))
  }, [hazards, query])

  const filteredMagicItems = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return magicItems
    return magicItems.filter((m) => m.name.toLowerCase().includes(q) || m.category?.toLowerCase().includes(q))
  }, [magicItems, query])

  const isEmpty = hazards.length === 0 && magicItems.length === 0

  return (
    <div className="flex min-h-screen flex-col items-center gap-6 px-4 py-10">
      <h1 className="pixel-title text-2xl">Reference Library</h1>

      <Link to="/characters" className="pixel-link text-sm">
        &larr; My Characters
      </Link>

      <p className="max-w-2xl text-center text-sm text-[var(--color-shadow)]/70">
        Hazards, conditions, and magic items imported on this instance — reference only,
        not wired into character sheets or the combat sandbox.
      </p>

      {isEmpty ? (
        <p className="italic text-[var(--color-shadow)]/70">
          Nothing imported yet — an admin needs to import a hazards or magic items pack first.
        </p>
      ) : (
        <>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or category…"
            className="pixel-input w-full max-w-md"
          />

          <div className="flex w-full max-w-3xl flex-col gap-8">
            <section className="flex flex-col gap-3">
              <h2 className="pixel-title text-lg">Hazards &amp; Conditions</h2>
              {hazards.length === 0 && (
                <p className="italic text-[var(--color-shadow)]/70">Nothing imported yet.</p>
              )}
              {hazards.length > 0 && filteredHazards.length === 0 && (
                <p className="italic text-[var(--color-shadow)]/70">No matches.</p>
              )}
              {filteredHazards.map((h) => (
                <div key={h.id} className="pixel-panel flex flex-col gap-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="pixel-title text-sm">{h.name}</p>
                    {h.category && <p className="text-xs italic text-[var(--color-shadow)]/70">{h.category}</p>}
                  </div>
                  <p className="whitespace-pre-line text-sm">{renderEmphasis(h.description)}</p>
                  <p className="text-xs italic text-[var(--color-shadow)]/70">{h.source.book}</p>
                </div>
              ))}
            </section>

            <section className="flex flex-col gap-3">
              <h2 className="pixel-title text-lg">Magic Items</h2>
              {magicItems.length === 0 && (
                <p className="italic text-[var(--color-shadow)]/70">Nothing imported yet.</p>
              )}
              {magicItems.length > 0 && filteredMagicItems.length === 0 && (
                <p className="italic text-[var(--color-shadow)]/70">No matches.</p>
              )}
              {filteredMagicItems.map((m) => (
                <div key={m.id} className="pixel-panel flex flex-col gap-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="pixel-title text-sm">{m.name}</p>
                    <p className="text-xs italic text-[var(--color-shadow)]/70">
                      {[m.category, m.rarity, m.attunement ? `Attunement: ${m.attunement}` : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <p className="whitespace-pre-line text-sm">{renderEmphasis(m.description)}</p>
                  <p className="text-xs italic text-[var(--color-shadow)]/70">{m.source.book}</p>
                </div>
              ))}
            </section>
          </div>
        </>
      )}

      <WilburCompanion />
    </div>
  )
}
