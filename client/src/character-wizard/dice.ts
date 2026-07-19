// 4d6-drop-lowest ability score rolling using the Web Crypto API, per the
// product decision to avoid Math.random for dice rolls.

function rollD6(): number {
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  return (buf[0] % 6) + 1
}

/** Rolls 4d6, drops the lowest, returns the sum of the remaining 3. */
export function rollAbilityScore(): number {
  const rolls = [rollD6(), rollD6(), rollD6(), rollD6()].sort((a, b) => a - b)
  return rolls[1] + rolls[2] + rolls[3]
}

/** Rolls six ability scores (one full set) via 4d6-drop-lowest each. */
export function rollSixAbilityScores(): [number, number, number, number, number, number] {
  return [
    rollAbilityScore(),
    rollAbilityScore(),
    rollAbilityScore(),
    rollAbilityScore(),
    rollAbilityScore(),
    rollAbilityScore(),
  ]
}
