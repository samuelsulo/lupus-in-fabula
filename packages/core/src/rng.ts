/** Mulberry32: a small deterministic PRNG. Returns the value and the next state. */
export function nextRandom(state: number): { value: number; state: number } {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, state: next };
}

/** Fisher-Yates shuffle. Returns a new array and the next RNG state. */
export function shuffle<T>(items: readonly T[], state: number): { items: T[]; state: number } {
  const result = [...items];
  let rng = state;
  for (let i = result.length - 1; i > 0; i--) {
    const r = nextRandom(rng);
    rng = r.state;
    const j = Math.floor(r.value * (i + 1));
    [result[i], result[j]] = [result[j] as T, result[i] as T];
  }
  return { items: result, state: rng };
}
