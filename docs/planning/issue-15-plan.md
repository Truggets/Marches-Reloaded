# Plan: Issue #15 — Versatile-species Magic Initiate has no spell-list/spell picker

## Goal
When a Versatile-trait species (currently Human) picks Magic Initiate as its free Origin
feat, the player must choose a spell list (Cleric/Druid/Wizard) and a spellcasting ability
(Int/Wis/Cha) — Magic Initiate's own benefit text requires both — and then pick the actual
cantrips/spell from that list, the same as the existing background-granted-feat spell flow
from #2.

## SRD text (confirmed via `data/feats.json`, id `magic-initiate`)
> Two Cantrips. You learn two cantrips of your choice from the Cleric, Druid, or Wizard
> spell list. Intelligence, Wisdom, or Charisma is your spellcasting ability for this
> feat's spells (choose when you select this feat).
> Level 1 Spell. Choose a level 1 spell from the same list...
> Repeatable. You can take this feat more than once, but you must choose a different
> spell list each time.

So Magic Initiate grants **two independent choices** (spell list, spellcasting ability) in
addition to the spells themselves — not just a list, as I'd first assumed.

## Design (per `advisor()` review)

### Data model — deliberately NOT unifying with #2's `originFeatSpells`
Advisor's stronger suggestion was a single `featSpells: {source, spellList, ability, ...}[]`
array to avoid two near-duplicate fields. I'm not taking that here: `originFeatSpells` is
already live on real saved characters (background-granted Magic Initiate), and unifying it
would mean either a data migration or a legacy-read fallback path, which is more surface
area than this issue's scope (a Versatile-species picker) justifies. Instead:

- New fields, additive and independent of `originFeatSpells`, so the two Magic Initiate
  grants (background + Versatile) can coexist on one character without schema conflict:
  - `originFeatSpellList?: string` — spell list chosen for the Versatile-granted feat.
  - `originFeatSpellAbility?: string` — spellcasting ability chosen for it.
  - `versatileFeatSpells?: { cantrips: string[]; prepared: string[] }`
- **Known gap, scoped out, filed as follow-up (#17):** `originFeatSpells` (background path,
  #2) has no recorded spellcasting ability either — it silently has nowhere to store the
  Int/Wis/Cha choice Magic Initiate requires. Real bug, but it's in already-shipped code
  outside this issue's stated scope (Versatile picker). Filing rather than fixing here to
  avoid re-touching #2's live path as a drive-by.

### Collision rule
Magic Initiate's own text: "you must choose a different spell list each time" if taken
repeatedly. So if the background already grants Magic Initiate (`backgroundFeatSpellList`
returns a list) and the player also picks Magic Initiate for Versatile, the Versatile list
picker excludes whichever list the background already used.

### Parsing (data-driven, throws on unparseable — matches `parseUnarmoredDefenseAbility` /
`parseSpellcastingAbility` convention)
New helpers in `computeSheet.ts`:
- `parseFeatSpellLists(feat: FeatEntry): string[]` — matches
  `/from the ([^.]+) spell list/i` in `benefit`, splits `"Cleric, Druid, or Wizard"` into
  `['Cleric', 'Druid', 'Wizard']`. Returns `[]` for a feat with no such text (not every Origin
  feat grants spells). Throws only if the sentence structure changes unexpectedly (can't
  split into class names) — a genuinely absent match (non-spell feat) is not an error.
- `parseFeatSpellAbilities(feat: FeatEntry): Ability[]` — matches
  `/(\w+(?:, \w+)*(?:,? or \w+)?) is your spellcasting ability for this feat/i`, validates
  each captured word against `ABILITIES`, throws if a capture doesn't resolve. Returns `[]`
  for a non-spell feat.

### UI — `StepSpeciesBonus.tsx`
When `selectedFeat` is spell-granting (`parseFeatSpellLists(selectedFeat).length > 0`):
- Render a spell-list button row (options minus whatever the background already used),
  calling a new `onChangeOriginFeatSpellList` prop.
- Render an ability button row (Int/Wis/Cha per the feat's parsed options), calling a new
  `onChangeOriginFeatSpellAbility` prop.
- Switching `originFeatId` away from a spell-granting feat clears both selections and any
  already-picked `versatileFeatSpells` (via the existing `onChangeOriginFeat` handler in
  the parent) — otherwise a stale list/ability/spells survive into `handleSave` for a feat
  the character no longer has.

### UI — `CreateCharacterPage.tsx`
- `hasVersatileFeatSpells = originFeatId spell-granting && originFeatSpellList chosen`
- `'spells'` step gate becomes `isCaster || hasFeatSpells || hasVersatileFeatSpells`.
- `canAdvance()` for `'spells'` adds the Versatile block's count check when applicable.
- Render up to a third `StepSpells` block (class / background-feat / Versatile-feat), each
  cross-excluding the union of the other two via `excludeIds`.
- `onChangeOriginFeat`: when the newly picked feat isn't spell-granting, clear
  `originFeatSpellList`, `originFeatSpellAbility`, `versatileFeatSpells`.

### `CharacterSheetPage.tsx`
Render the Versatile-granted feat's cantrips/prepared (with its list + ability) the same
way `originFeatSpells` already renders, next to the Species section (since it's
species-trait-granted, not background-granted).

## Tests (`computeSheet.test.ts`)
- `parseFeatSpellLists` on Magic Initiate returns `['Cleric', 'Druid', 'Wizard']`.
- `parseFeatSpellLists` on a non-spell Origin feat (e.g. Alert) returns `[]`.
- `parseFeatSpellAbilities` on Magic Initiate returns `['Intelligence', 'Wisdom', 'Charisma']`.

## Verification
Live-test locally: Human character → Versatile → Magic Initiate → pick "Druid" + "Wisdom" →
spells step shows a third block, pick 2 cantrips + 1 prepared → save → sheet shows the
Versatile block separately from any class spells. Also test the collision rule with a Sage
background (Magic Initiate (Wizard)) + Versatile Magic Initiate: Wizard is excluded from the
Versatile list picker. Also test switching Versatile choice away from Magic Initiate clears
stale picks before save.
