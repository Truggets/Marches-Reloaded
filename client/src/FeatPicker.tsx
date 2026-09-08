import { useState } from 'react'
import { listLoadedPacks } from '@data'
import type { FeatEntry } from '@data/schema'

interface Props {
  feats: FeatEntry[]
  selectedId: string | null
  onSelect: (featId: string) => void
}

/** Groups feats by pack (collapsible per pack — bundled SRD pack starts
 * expanded since it's small and primary, any imported pack starts
 * collapsed), with a name-search filter. Same-named feats from different
 * packs (e.g. two "Magic Initiate"s, one SRD one imported) intentionally
 * coexist as separate entries here — no supersession, see
 * docs/planning/m2b-phase1-feats-plan.md §5. */
export function FeatPicker({ feats, selectedId, onSelect }: Props) {
  const [search, setSearch] = useState('')
  const packs = listLoadedPacks()

  const filtered = search.trim()
    ? feats.filter((f) => f.name.toLowerCase().includes(search.trim().toLowerCase()))
    : feats

  return (
    <div className="flex flex-col gap-3">
      {feats.length > 8 && (
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search feats by name…"
          className="pixel-input text-sm"
        />
      )}
      {packs.map((pack, i) => {
        const packFeats = filtered.filter((f) => f.pack === pack.id)
        if (packFeats.length === 0) return null
        return (
          <details key={pack.id} open={i === 0 || !!search.trim()} className="pixel-panel !p-2">
            <summary className="pixel-label cursor-pointer text-xs">
              {pack.name} ({packFeats.length})
            </summary>
            <div className="mt-2 flex flex-wrap gap-2">
              {packFeats.map((feat) => (
                <button
                  key={feat.id}
                  type="button"
                  onClick={() => onSelect(feat.id)}
                  className={`pixel-btn ${selectedId === feat.id ? '' : 'pixel-btn-secondary'}`}
                >
                  {feat.name}
                </button>
              ))}
            </div>
          </details>
        )
      })}
    </div>
  )
}
