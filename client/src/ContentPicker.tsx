import { useState } from 'react'
import { listLoadedPacks } from '@data'

interface Props<T extends { id: string; name: string; pack: string }> {
  items: T[]
  selectedId: string | null
  onSelect: (id: string) => void
  searchPlaceholder?: string
}

/** Groups content by pack (collapsible per pack — bundled SRD pack starts
 * expanded since it's small and primary, any imported pack starts
 * collapsed), with a name-search filter. Same-named content from different
 * packs (e.g. two "Magic Initiate"s, one SRD one imported) intentionally
 * coexist as separate entries here — no supersession, see
 * docs/planning/m2b-phase1-feats-plan.md §5. */
export function ContentPicker<T extends { id: string; name: string; pack: string }>({
  items,
  selectedId,
  onSelect,
  searchPlaceholder = 'Search by name…',
}: Props<T>) {
  const [search, setSearch] = useState('')
  const packs = listLoadedPacks()

  const filtered = search.trim()
    ? items.filter((f) => f.name.toLowerCase().includes(search.trim().toLowerCase()))
    : items

  return (
    <div className="flex flex-col gap-3">
      {items.length > 8 && (
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={searchPlaceholder}
          className="pixel-input text-sm"
        />
      )}
      {packs.map((pack, i) => {
        const packItems = filtered.filter((f) => f.pack === pack.id)
        if (packItems.length === 0) return null
        return (
          <details key={pack.id} open={i === 0 || !!search.trim()} className="pixel-panel !p-2">
            <summary className="pixel-label cursor-pointer text-xs">
              {pack.name} ({packItems.length})
            </summary>
            <div className="mt-2 flex flex-wrap gap-2">
              {packItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect(item.id)}
                  className={`pixel-btn ${selectedId === item.id ? '' : 'pixel-btn-secondary'}`}
                >
                  {item.name}
                </button>
              ))}
            </div>
          </details>
        )
      })}
    </div>
  )
}
