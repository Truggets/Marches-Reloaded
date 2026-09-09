import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getClass, getSpell, listMonsters } from '@data'
import type { MonsterEntry } from '@data/schema'
import type { CharacterData } from '../character-wizard/types'
import { spellsForClass } from './CharacterSheetPage'
import { renderEmphasis } from '../EmphasisText'
import {
  abilityModifier,
  armorClass,
  finalAbilityScores,
  hitPointsMulticlass,
  spellcastingInfo,
} from '../engine/computeSheet'
import { resolveMonsterAttack, resolveSpellAttack } from '../engine/sandbox'
import type { AttackResult } from '../engine/sandbox'

interface CharacterRecord {
  id: number
  ownerId: number
  name: string
  packId: string
  data: CharacterData
  createdAt: string
  updatedAt: string
}

async function extractErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string; error?: string }
    return body.message ?? body.error ?? `Request failed (${res.status})`
  } catch {
    return `Request failed (${res.status})`
  }
}

/** One battle-log entry — either the player's spell attack or the monster's
 * counterattack, rendered generically since both resolve to an AttackResult
 * (the monster's result also carries `actionName`). */
interface LogEntry {
  id: number
  side: 'player' | 'monster'
  label: string
  result: AttackResult
  fallbackText?: string
}

/** A monster added to the battle, tracked purely in local component state —
 * per the plan, this is a non-persistent scratch space: HP here is never
 * sent to the server and never saved on the character record. */
interface BattleMonster {
  key: number
  monster: MonsterEntry
  currentHp: number
}

/** Very small "flat modifier only" damage-average parser, used solely to
 * decrement a monster's tracked HP. Per the task's explicit simplification
 * menu, this is the "reasonable simplification" v0 option: rather than
 * rolling real dice, this takes the SRD-standard rounded-down average of the
 * dice portion (e.g. 1d10 -> floor(10+1)/2) = 5) plus the flat modifier added
 * ONCE, and — matching the task's explicit warning not to double a flat "+2"
 * alongside the dice — doubles only the dice COUNT before averaging on a
 * critical hit (e.g. 1d10 crit -> 2d10 -> floor(2*11/2) = 11), never the flat
 * modifier. This is an approximation (a real roll varies around the
 * average); it exists only to keep the tracked HP counter moving in the
 * sandbox, and the raw damage string is always shown alongside it in the log
 * so the player can hand-verify or track exact HP themselves. */
function estimateDamage(damage: string, critical: boolean): number {
  // e.g. "1d10 Fire", "1d6 + 2 Piercing", "2d8 Slashing"
  const diceMatch = damage.match(/(\d+)d(\d+)/)
  const flatMatch = damage.match(/([+-]\s*\d+)(?!d)/)
  let diceAverage = 0
  if (diceMatch) {
    const count = parseInt(diceMatch[1], 10) * (critical ? 2 : 1)
    const sides = parseInt(diceMatch[2], 10)
    diceAverage = Math.floor((count * (sides + 1)) / 2)
  }
  const flat = flatMatch ? parseInt(flatMatch[1].replace(/\s+/g, ''), 10) : 0
  return Math.max(0, diceAverage + flat)
}

export function CombatSandboxPage() {
  const { id } = useParams<{ id: string }>()
  const [character, setCharacter] = useState<CharacterRecord | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [forbidden, setForbidden] = useState(false)

  const [battleMonsters, setBattleMonsters] = useState<BattleMonster[]>([])
  const [selectedMonsterKey, setSelectedMonsterKey] = useState<number | null>(null)
  const [selectedSpellId, setSelectedSpellId] = useState<string | null>(null)
  const [playerHp, setPlayerHp] = useState<number | null>(null)
  const [log, setLog] = useState<LogEntry[]>([])
  const nextKeyRef = useRef(0)
  const nextLogIdRef = useRef(0)

  const load = useCallback(async () => {
    setError(null)
    setNotFound(false)
    setForbidden(false)
    try {
      const res = await fetch(`/api/characters/${id}`, {
        method: 'GET',
        credentials: 'include',
      })
      if (res.status === 404) {
        setNotFound(true)
        return
      }
      if (res.status === 403) {
        setForbidden(true)
        return
      }
      if (!res.ok) {
        throw new Error(await extractErrorMessage(res))
      }
      const body = (await res.json()) as { character: CharacterRecord }
      setCharacter(body.character)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load character')
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  if (notFound) return <ErrorScreen message="Character not found." />
  if (forbidden) return <ErrorScreen message="You don't have permission to view this character." />
  if (error) return <ErrorScreen message={error} />
  if (!character) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2">
        <p className="italic">Loading…</p>
      </div>
    )
  }

  const data = character.data
  const scores = finalAbilityScores(data)
  const conMod = abilityModifier(scores.Constitution)

  // hitPointsMulticlass/armorClass both iterate EVERY class in data.classes
  // (not just classes[0]) and throw on any class whose id isn't in the
  // loaded pack (reachable via the admin Edit JSON tool) — validate all of
  // them up front, not just the first, or a multiclass character with a bad
  // *secondary* classId would crash here before ever reaching the
  // caster/cantrip guard below.
  const allClassesValid = data.classes.every((c) => getClass(c.classId))
  if (!allClassesValid) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
        <p className="pixel-title text-lg text-center max-w-md">
          This character has invalid class data and can't be loaded into the sandbox.
        </p>
        <Link to={`/characters/${id}`} className="pixel-link text-sm">
          &larr; Character Sheet
        </Link>
      </div>
    )
  }
  const maxHp = hitPointsMulticlass(data.classes, conMod, data.speciesId)
  const playerAc = armorClass(data.classes, data.equipmentChoice, scores)

  // Every class that actually casts AND has at least one cantrip (not just
  // the first spellcasting-shaped class found) — a naive "first match" would
  // wrongly report "no spells" for a Paladin/Ranger-first multiclass whose
  // real cantrip caster is a later class (both are half-casters with zero
  // base cantrips), and would silently use the WRONG ability score/attack
  // bonus for a dual-cantrip-caster build (e.g. Cleric 1/Wizard 4 — the
  // first-match approach would show only Cleric cantrips computed off
  // Wisdom, hiding Wizard's Fire Bolt entirely and getting the modifier
  // wrong for whatever it did show). Each cantrip is tagged with its OWN
  // class's attack bonus, computed and used correctly regardless of which
  // class actually granted it.
  const casterClasses = data.classes
    .map((c) => ({
      classId: c.classId,
      casting: spellcastingInfo(c.classId, data.classes, scores),
      cantripIds: spellsForClass(data, c.classId).cantrips,
    }))
    .filter((c) => c.casting !== undefined && c.cantripIds.length > 0)

  const cantripToClass = new Map<string, { classId: string; attackBonus: number }>()
  for (const c of casterClasses) {
    for (const cid of c.cantripIds) {
      if (!cantripToClass.has(cid)) {
        cantripToClass.set(cid, { classId: c.classId, attackBonus: c.casting!.attackBonus })
      }
    }
  }
  const cantripIds = [...cantripToClass.keys()]

  if (cantripIds.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
        <p className="pixel-title text-lg text-center max-w-md">
          This character has no spells to attack with — the sandbox is caster-only for now.
        </p>
        <Link to={`/characters/${id}`} className="pixel-link text-sm">
          &larr; Character Sheet
        </Link>
      </div>
    )
  }

  const effectivePlayerHp = playerHp ?? maxHp ?? 0
  const selectedMonster = battleMonsters.find((m) => m.key === selectedMonsterKey) ?? null

  function pushLog(entry: Omit<LogEntry, 'id'>) {
    const id = nextLogIdRef.current++
    setLog((prev) => [{ id, ...entry }, ...prev])
  }

  function addMonster(monster: MonsterEntry) {
    const key = nextKeyRef.current++
    setBattleMonsters((prev) => [...prev, { key, monster, currentHp: monster.hp }])
    setSelectedMonsterKey(key)
  }

  function handleAttack() {
    const spellCaster = selectedSpellId ? cantripToClass.get(selectedSpellId) : undefined
    if (!selectedSpellId || !selectedMonster || !spellCaster) return
    const result = resolveSpellAttack(selectedSpellId, spellCaster.attackBonus, selectedMonster.monster.ac)
    const spell = getSpell(selectedSpellId)
    let fallbackText: string | undefined
    if (result.hit) {
      if (result.damage) {
        const dmg = estimateDamage(result.damage, result.critical)
        setBattleMonsters((prev) =>
          prev.map((m) => (m.key === selectedMonster.key ? { ...m, currentHp: Math.max(0, m.currentHp - dmg) } : m)),
        )
      } else {
        fallbackText = spell?.description
      }
    }
    pushLog({
      side: 'player',
      label: `${spell?.name ?? selectedSpellId} vs ${selectedMonster.monster.name}`,
      result,
      fallbackText,
    })
  }

  function handleMonsterAttack() {
    if (!selectedMonster) return
    const result = resolveMonsterAttack(selectedMonster.monster, playerAc)
    if (!result) {
      pushLog({
        side: 'monster',
        label: `${selectedMonster.monster.name} has no basic attack`,
        result: { roll: 0, hit: false, critical: false },
      })
      return
    }
    if (result.hit && result.damage) {
      const dmg = estimateDamage(result.damage, result.critical)
      setPlayerHp((prev) => Math.max(0, (prev ?? maxHp ?? 0) - dmg))
    }
    pushLog({
      side: 'monster',
      label: `${selectedMonster.monster.name} — ${result.actionName}`,
      result,
    })
  }

  return (
    <div className="flex min-h-screen flex-col items-center gap-6 px-4 py-10">
      <div className="flex w-full max-w-4xl items-center justify-between gap-3">
        <Link to={`/characters/${id}`} className="pixel-link text-sm">
          &larr; Character Sheet
        </Link>
      </div>

      <div className="pixel-panel flex w-full max-w-4xl flex-col gap-6">
        <h1 className="pixel-title text-2xl">Combat Sandbox — {character.name}</h1>
        <p className="text-xs text-[var(--color-shadow)]/70">
          Scratch space only — nothing here is saved. HP shown is an approximation: damage dice are averaged
          (standard 5e rounding), doubled only for a critical hit, with any flat modifier added once (never
          doubled). Use the raw damage string in the log to hand-track exact HP if you want precision.
        </p>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* You */}
          <section className="pixel-panel !p-3 flex flex-col gap-2">
            <h2 className="pixel-title text-base">You</h2>
            <p className="text-sm">
              HP: <span className="font-bold">{effectivePlayerHp}</span> / {maxHp ?? '—'}
            </p>
            <p className="text-sm">
              AC: <span className="font-bold">{playerAc}</span>
            </p>
            {selectedSpellId && cantripToClass.get(selectedSpellId) && (
              <p className="text-sm">
                {getClass(cantripToClass.get(selectedSpellId)!.classId)?.name} Spell Attack{' '}
                <span className="font-bold">
                  {cantripToClass.get(selectedSpellId)!.attackBonus >= 0 ? '+' : ''}
                  {cantripToClass.get(selectedSpellId)!.attackBonus}
                </span>
              </p>
            )}

            <p className="pixel-label mt-2">Cantrip</p>
            <div className="flex flex-wrap gap-2">
              {cantripIds.map((cid) => {
                const spell = getSpell(cid)
                return (
                  <button
                    key={cid}
                    type="button"
                    className={`pixel-btn ${selectedSpellId === cid ? '' : 'pixel-btn-secondary'}`}
                    onClick={() => setSelectedSpellId(cid)}
                  >
                    {spell?.name ?? cid}
                  </button>
                )
              })}
            </div>
            {selectedSpellId && (
              <p className="text-xs mt-1">{renderEmphasis(getSpell(selectedSpellId)?.description ?? '')}</p>
            )}
          </section>

          {/* Monster */}
          <section className="pixel-panel !p-3 flex flex-col gap-2">
            <h2 className="pixel-title text-base">Monster</h2>
            {selectedMonster ? (
              <>
                <p className="text-sm font-bold">{selectedMonster.monster.name}</p>
                <p className="text-sm">
                  HP: <span className="font-bold">{selectedMonster.currentHp}</span> / {selectedMonster.monster.hp}
                </p>
                <p className="text-sm">
                  AC: <span className="font-bold">{selectedMonster.monster.ac}</span>
                </p>
              </>
            ) : (
              <p className="text-sm italic">No monster selected.</p>
            )}

            {battleMonsters.length > 1 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {battleMonsters.map((bm) => (
                  <button
                    key={bm.key}
                    type="button"
                    className={`pixel-btn ${selectedMonsterKey === bm.key ? '' : 'pixel-btn-secondary'}`}
                    onClick={() => setSelectedMonsterKey(bm.key)}
                  >
                    {bm.monster.name} ({bm.currentHp}/{bm.monster.hp})
                  </button>
                ))}
              </div>
            )}

            <p className="pixel-label mt-2">Add Monster</p>
            <div className="flex flex-wrap gap-2">
              {listMonsters().map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className="pixel-btn pixel-btn-secondary"
                  onClick={() => addMonster(m)}
                >
                  {m.name} (CR {m.cr})
                </button>
              ))}
            </div>
          </section>
        </div>

        {/* Actions */}
        <section className="flex gap-3">
          <button
            type="button"
            className="pixel-btn"
            disabled={!selectedSpellId || !selectedMonster}
            onClick={handleAttack}
          >
            Attack
          </button>
          <button type="button" className="pixel-btn pixel-btn-secondary" disabled={!selectedMonster} onClick={handleMonsterAttack}>
            Monster Attacks
          </button>
        </section>

        {/* Log */}
        <section>
          <h2 className="pixel-title text-base mb-2">Turn Log</h2>
          {log.length === 0 ? (
            <p className="text-sm italic">No attacks yet.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {log.map((entry) => (
                <li key={entry.id} className="border-b border-[var(--color-shadow)]/20 pb-2">
                  <span className="font-bold">{entry.side === 'player' ? 'You' : 'Monster'}:</span> {entry.label} —
                  rolled {entry.result.roll} —{' '}
                  {entry.result.hit ? (entry.result.critical ? 'Critical Hit!' : 'Hit') : 'Miss'}
                  {entry.result.hit && entry.result.damage && <> — {entry.result.damage}</>}
                  {entry.fallbackText && (
                    <p className="text-xs italic mt-1">
                      No curated damage for this spell — read/roll it yourself: {entry.fallbackText}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
      <p className="pixel-title text-lg text-[var(--color-danger)]">{message}</p>
      <Link to="/characters" className="pixel-link text-sm">
        &larr; Back to My Characters
      </Link>
    </div>
  )
}
