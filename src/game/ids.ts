/** Random hex. getRandomValues works on plain-HTTP LAN pages, where crypto.randomUUID is undefined. */
export const randomHex = (bytes = 16) => Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join('')

/** Short, human-readable unique IDs, e.g. SES-4F1A9C2E. */
export const makeId = (prefix: string) => `${prefix}-${randomHex(4).toUpperCase()}`

/** Deterministic 32-bit string hash. Server and browser must agree, so never change the arithmetic. */
export function hashString(s: string): number {
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return h
}

/** Seeded PRNG (mulberry32): the same seed gives the same sequence of floats in [0, 1). */
export function seeded(seed: string): () => number {
  let a = hashString(seed)
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
