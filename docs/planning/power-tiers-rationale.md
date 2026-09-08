# Power Tier Rationale (Track D curation)

Curated opinion, not derived fact — see `docs/planning/power-bones-plan.md` for why this
data can't be verified by `verify-pack.js` the way the rest of the pack is. Tiers are
1 (weak/situational) to 5 (clearly top-tier / strong in most builds), scored against the
17 SRD 2024 feats currently in `data/feats.json`. **Everything below needs Truman's
spot-check before it's treated as load-bearing** — this is one curator's synthesis of
community tier lists plus system-mastery judgment, and the demon-bone section in
particular is opinion about "broken," which is inherently arguable.

## Sources consulted

- Blog of Holding, "D&D PHB 2024 – Ranking of all Origin Feats" (blogofholding.com)
- Nat 1 Gaming, "The D&D Feats, Fighting Styles, and Epic Boons Tier List" (nat1gaming.com)
- RPGBOT, "State of the 2024 DnD Character Optimization Meta" and the Fighting Style
  Feats guide (rpgbot.net)
- TheGamer, "All Epic Boons In The 2024 D&D Player Handbook, Ranked" and "Make These Epic
  Boons Your First Pick For Your High Level DnD Rogue"
- EN World forum threads: "Epic Boons Ranking," "Is Grappler feat mandatory/broken for
  monks?"
- General D&D 2024 system knowledge (spell/slot math, action economy, class features)
  used to sanity-check or override community consensus where noted below.

Community tier lists disagree on exact placement more than they disagree on relative
ordering — I weighted the *ordering* (is X clearly better than Y) more heavily than any
single site's letter grade, then mapped that ordering onto the 1-5 scale myself.

## Per-feat rationale

**Origin feats**

- **Alert — 3.** Initiative proficiency (scales with level) plus an ally-swap is a
  reliable go-first tool; sources rank it just behind Magic Initiate among origin feats.
  Note: the 2024 version dropped the old "can't be surprised" clause, which is why it
  isn't higher — it's good tempo, not a hard counter to anything.
- **Magic Initiate — 4.** Repeatable, near-universally recommended across sources
  (Blog of Holding, Nat 1 Gaming both rate it top-tier). Two cantrips + an always-prepared
  1st-level spell (Cleric list gets Guidance + Healing Word, a genuinely strong pull for
  any class) is a lot of value for one feat slot, and it's repeatable across lists.
- **Savage Attacker — 1.** Community consensus is uniformly low (D-tier at Blog of
  Holding): roughly +2 average damage, once per turn, that doesn't scale and gets
  diluted further once a character has multiple attacks. Agree with the consensus.
- **Skilled — 2.** D-tier per Blog of Holding — three skill/tool proficiencies are
  useful if a build is genuinely skill-starved, but backgrounds/species/subclasses cover
  most of that need for free, so it rarely competes with an actual mechanical feat.
  Not a 1 because "repeatable, fills a real gap for MAD/skill-monkey builds" keeps it
  above Savage Attacker.

**General feats**

- **Ability Score Improvement — 3.** Never actively bad — capping a primary stat at 20
  (or spreading +1/+1) is foundational math every build wants eventually — but sources
  note it routinely loses the *choice* at a given level to a build-defining feat
  (Polearm Master, Sentinel, etc. — not in this SRD set, but the same logic applies to
  future non-SRD imports). Rated as a solid, always-applicable 3 rather than higher,
  since "reliably good baseline" is exactly what the middle of the scale should mean.
- **Grappler — 3.** Wildly build-dependent, which is the real story here. RPGBOT and
  EN World both describe it as a big upgrade over its 2014 version and "insanely strong"
  on a Monk (advantage on unarmed strikes into a grapple lock), but explicitly weak on
  Barbarians (Reckless Attack already grants the advantage this feat would add). I scored
  the *general* case (any Strength/Dexterity 13+ melee character) at 3; the Monk-specific
  spike is called out below as a demon-bone candidate rather than baked into this number,
  per the plan doc's design (`power-tiers.json` = individual tier, combo table = separate
  concern).

**Fighting Style feats** (the 2024 "retrain your fighting style as a feat" variants)

- **Archery — 3.** +2 to ranged attack rolls is a straightforward, large accuracy boost
  for a dedicated ranged build — build-defining within its niche, dead weight outside it.
- **Defense — 2.** +1 AC while armored is the "safe, boring, always-on" pick every
  source agrees on. Real but modest; AC scales slowly in 5e so a flat +1 matters less at
  higher levels.
- **Great Weapon Fighting — 2.** RPGBOT: "feels great and does less than you think" —
  rerolling 1s/2s is roughly +1 average damage per damage die, smaller than the fantasy
  suggests. Still strictly positive, hence not a 1.
- **Two-Weapon Fighting — 2.** Solid for a *dedicated* dual-wielder but taxes an already
  contested bonus-action economy (Nick property elsewhere reduces this, but Nick isn't
  guaranteed on a given weapon). Situational rather than broadly strong.

**Epic Boons** (Level 19+, so their "power" is judged in an end-game, already-strong
context — a 3 here is not the same as a 3 at level 4)

- **Boon of Combat Prowess — 4.** TheGamer/EN World both flag this as effectively S-tier
  for single-big-attack characters (Rogues especially — turning a miss into a guaranteed
  hit protects the entire turn's Sneak Attack). Strong for any martial, exceptional for
  Rogues specifically — see demon-bone note below.
- **Boon of Dimensional Travel — 3.** Rated A-tier broadly (TheGamer) for the free
  post-action 30 ft teleport — strong mobility/repositioning, not an outright damage or
  survivability spike, so scored a notch below Combat Prowess/Fate.
  and Fate.
- **Boon of Fate — 4.** Consistently cited as the best or near-best boon (S-tier,
  TheGamer/EN World): ±2d4 applied to *any* d20 test (yours or an ally's, or an enemy's
  save) within 60 ft is extremely swingy and usable both offensively and defensively.
  Limited to once per short/long rest, which is the only thing keeping it off a 5.
- **Boon of Irresistible Offense — 2.** Called out by multiple sources as the closest
  thing to a trap option among the boons — ignoring resistance to physical damage
  and a crit-only bonus matter far less at the level range these boons unlock (most
  high-CR threats aren't leaning on physical resistance, and level 19+ characters already
  have overwhelming damage output).
- **Boon of Spell Recall — 3.** Solid, steady resource-return for full casters (1-in-4
  chance to not expend a level 1-4 slot on cast) — meaningfully stretches spellcasting
  endurance in a long day, but it's a statistical smoothing effect rather than a spike.
- **Boon of the Night Spirit — 3.** On-demand Invisible (bonus action) plus broad damage
  resistance whenever in dim light/darkness is strong for a skirmisher, and combines
  dangerously with existing darkness-based tricks (see demon-bone note below) — scored a
  baseline 3 with the spike flagged separately, same treatment as Grappler.
- **Boon of Truesight — 2.** Reliable defensive/utility answer to invisibility and
  illusions, but purely informational — it doesn't add damage, survivability, or action
  economy on its own, so it sits below the boons that directly swing combat outcomes.

## Proposed demon-bone (broken combo) starting entries

**These are opinion, not verified balance rulings — needs Truman's review before use in
the actual demon-bone table.** I'm flagging my confidence on each individually; none of
these are inventions to hit a target count — I cut a fourth candidate (see note at the
end) because I wasn't confident enough in it.

1. **Grappler (feat) + Monk class, unarmed-strike build.** Grappler lets you combine the
   Attack action's Damage and Grapple options on an unarmed strike once per turn, and
   grants Advantage on attacks against whatever you're currently grappling. A Monk
   attacks with unarmed strikes constantly (Martial Arts extra attack, Flurry of Blows),
   so this turns into a self-sustaining advantage loop — grapple on hit, get advantage on
   every subsequent unarmed strike against the same target, repeat. An EN World thread
   ("Is Grappler feat mandatory/broken for monks?") describes the community reaction as
   "stupidly powerful," with some players calling it functionally mandatory once tried,
   and separately flags it as "gamebreakingly overpowered" when layered with
   battlefield-control effects that lock a grappled target in an area of ongoing damage.
   **Confidence: high** — this is a well-documented, frequently-discussed interaction,
   not a one-off take.

2. **Boon of Combat Prowess + Rogue class (Sneak Attack).** At Level 19+ a Rogue's whole
   turn typically rides on landing one attack for Sneak Attack damage. Combat Prowess
   lets you convert that attack's miss into a hit once per round — for a class whose
   entire damage model is "one attack, once," this removes the class's single point of
   failure. TheGamer's epic-boon-for-rogues piece explicitly rates it S-tier for exactly
   this reason (guaranteed Sneak Attack every round if you'd have hit at all absent
   disadvantage). **Confidence: high** — directly sourced, and the mechanical interaction
   (single-attack class + guaranteed-hit boon) is unambiguous.

3. **Boon of the Night Spirit + Devil's Sight (Warlock invocation / Hexblade-adjacent
   sight-in-darkness features) + a Darkness effect.** This is an extension of the
   well-known "Darklock" trick from 2014 5e: a caster with Devil's Sight can see through
   magical darkness that blinds everyone else, so casting Darkness on/around themselves
   makes them effectively unhittable while they fight at full effectiveness. The Night
   Spirit boon adds two things on top of that base trick: a bonus-action, at-will
   Invisible condition usable in *any* dim light or darkness (not just magical Darkness),
   and resistance to all damage except Psychic and Radiant while there — stacking
   "can't be seen" with "most damage that does land is halved." The core Devil's
   Sight + Darkness half of this combo is old, widely-known, and frequently flagged by
   DMs as needing a table ruling; the Night Spirit boon is new to the 2024 SRD and I have
   not found a source explicitly discussing this specific pairing, so the "how much worse
   does the boon make an already-known trick" part is my own extrapolation, not a
   community-sourced claim. **Confidence: medium** — the base combo is well-established;
   the boon making it worse is my inference, not something I found stated outright.

**Cut for low confidence:** I considered proposing Two-Weapon Fighting (feat) + the Nick
weapon-mastery property + off-hand-attack stacking as a fourth entry, since several
sources call the fighting style strong specifically with Nick-property weapons. I'm not
confident this rises to "broken" rather than just "efficient, working as designed" — it
didn't come up in any source as an exploit or balance concern, just as a synergy note —
so I left it out rather than padding the list to reach four entries.
