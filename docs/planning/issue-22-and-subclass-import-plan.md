# Plan: importing everything left in the vault (subclasses, monsters, hazards, magic items)

Combined research pass across all 4 remaining vault content categories, per Truman's request —
one plan doc, reviewed before any building starts, so we can decide together what's genuinely
parallelizable vs. sequential. **Nothing here has been built yet.**

## Summary verdict up front
**Subclasses are the next spells** — data-only, same import pipeline shape, ready to scope and
build now. **Monsters/hazards/magic items are NOT the next spells** — the vault data itself is
under-structured for what the app's schema needs (see below), on top of #22's already-known "no
bestiary UI/inventory system exists yet" gap. Recommend: build subclass import next (its own PR,
like #33), and treat monsters/hazards/magic items as a real feature-design pass, not a data-pipe
PR — scoped separately, likely not "just build it tonight" scale.

## 1. Subclasses — 77 entries across 4 files (48 + 8 + 6 + 15)
Files: `Core-Rulebook-Subclasses.json`, `Tashas-Cauldron-Subclasses.json`,
`Xanathars-Guide-Subclasses.json`, `subclasses-setting-v1.json`. Shape (consistent across all 4):
`{ subclasses: [{ name, class, source, category, mechanics_first: [...], lore_and_flavor }] }` —
each `mechanics_first` bullet is one feature, prefixed `"**<Feature Name> (Level N):**"`. Same
general shape as the spell/monster vault files this session already has a parsing pattern for.

**The real architecture question, not present for feats/backgrounds/species/equipment/spells:**
`Subclass` isn't a top-level content-pack category — it's nested inside `ClassEntry.subclasses[]`
(`data/schema.ts`), and `classes.json` itself isn't one of the 5 importable categories. Every
existing M2b importer assumes "new top-level array, merged in at read time" (`listSpells()` etc.);
subclasses need a different shape: import them as their own top-level array (each entry carries
its `classId`), then **merge into the right bundled class's `subclasses[]` at read time** —
`getClass(id)` (or a new accessor) would need to return bundled subclasses + any imported ones
whose `classId` matches. Every current call site that reads `classEntry.subclasses` directly
(`LevelUpPage.tsx`, `SubclassChoicePage.tsx`, `CharacterSheetPage.tsx`, `featuresForLevel`) would
need to go through that merged view instead of the raw bundled array — a real, contained change,
not just "add a `subclasses` field to `ContentPack`."

**Otherwise this is exactly like #33**: `parseSubclassEntry` splits `mechanics_first` bullets into
`Feature[]` (each `{level, name, description}`, parsed from the `"**Name (Level N):**"` prefix —
same style of prose-parsing this session has done all night), `flavorLine` from
`lore_and_flavor`, id namespaced per pack. Estimate: similar size to #33's PR.

## 2. Monsters — 35 entries across 4 files (10 + 10 + 7 + 8)
Files: `Core-Redesigned-Monsters.json`, `Core-and-Expansion-Giants-and-Undead.json`,
`Legendary-Icons-and-Arch-Fiends.json` (top-level key is `legendary_monsters`, not `monsters` —
inconsistent with the other 3), `Planar-and-Setting-Monsters.json`.

**This is NOT just "needs a bestiary UI" (#22's original framing) — the vault DATA is
under-structured for the sandbox's needs.** Spot-checked a real entry (Goblin): the vault gives
free-text `mechanics_first` bullets like `"**Scimitar (Action):** *Melee Weapon Attack:* +4 to
hit... Hit: 5 (1d6 + 2) slashing damage."` — the app's `MonsterEntry` schema needs a structured
`actions: [{name, attackBonus: "+4", damage: "1d6 + 2 Slashing"}]` for `resolveMonsterAttack` to
work at all, meaning every action bullet needs its own regex parse (attack-bonus number,
dice/type split) — doable, but real per-entry work, not a straight field copy. **Worse: NO sampled entry has an ability-score line at all** — checked a CR 1/4 Goblin and a CR
12 Death Giant Reaper (Giants-and-Undead file), neither lists Str/Dex/Con/Int/Wis/Cha anywhere in
`mechanics_first`, only named saving-throw bonuses ("Con +6, Wis +7, Cha +7") which aren't the
same thing (a save bonus mixes ability mod + proficiency, not reverse-engineerable to a clean
ability score). `MonsterEntry.abilityScores` is required by the schema, and without it Topple's
Con save (#28) couldn't be computed for an imported monster at all. This looks like a genuine
data gap in the vault source, not something this app's parser can work around — would need
either sourcing ability scores from elsewhere or accepting imported monsters can't use
ability-based sandbox mechanics. Also: `Legendary-Icons-and-Arch-Fiends.json`'s first entry
("Aspect of Tiamat") doesn't even have a `mechanics_first` field — that file's shape isn't
fully consistent with the other 3 monster files either, needs its own look before assuming one
parser handles all 4.

## 3. Hazards/Conditions — 22 entries, 1 file
`Core-and-Expansion-Rules-Hazards.json`, top-level key `rules_hazards_conditions`. Shape:
`{name, source, category, mechanics_first, lore_and_flavor}` — same shape as subclasses/monsters.
**No `ContentPack` category exists for this at all** (not feats, not a condition/status-effect
concept the schema has any notion of). Some of these (Blinded, Prone, etc.) are core SRD
conditions the sandbox's #28 work just hand-coded logic for directly (`monsterAttackMode`,
`attackModeAgainst`) rather than reading from data — importing "Blinded" as a data entry
wouldn't automatically make the sandbox apply Blinded's rules; that's the same "data vs. feature"
gap as monsters. A display-only reference/glossary page is easy; anything mechanical needs
per-condition engine work like #28 did for Prone.

## 4. Magic Items — 8 entries, 1 file
`Magic-Items-and-Artifacts.json`, top-level key `items`. Shape adds `rarity`/`attunement` on top
of the same `mechanics_first`/`lore_and_flavor` pattern. **No inventory/equipment-slot system
exists anywhere in the app** — characters currently have zero notion of "items owned" beyond the
one starting-equipment letter choice. A magic item entry with nowhere to attach to a character is
purely a reference/glossary entry, same ceiling as hazards.

## Recommended split / parallel-work breakdown
- **Sequential, buildable now**: subclass import (own PR — data + a real but contained schema/
  accessor change, same rigor as every PR tonight: build → Opus review → merge).
- **Needs a real design pass before any code**, likely NOT parallelizable with subclass import
  since it touches the same `data/index.ts`/`ContentPack` surface: monsters (blocked on the
  ability-score data question above, plus the bestiary-UI gap #22 already named), hazards
  (blocked on "what would importing a condition as data even DO" — display-only vs. mechanical),
  magic items (blocked on "there's no inventory system to attach it to").
- Hazards and magic items, if scoped as **display-only reference/glossary pages** (not mechanical
  integration), are much smaller and could genuinely run in parallel with each other once
  someone signs off on that reduced scope — but that's a scope decision for Truman, not something
  to assume.

## Open questions for Truman
1. Subclass import: build it next, same PR-per-feature cadence as tonight?
2. Monsters: worth digging into whether ability scores exist somewhere in the vault data we
   haven't checked yet (a different file, a nested field), before writing this off as blocked?
3. Hazards/magic items: display-only reference pages (small, real, buildable soon) vs. full
   mechanical integration (large, needs its own design pass, not a "tonight" scope)?
