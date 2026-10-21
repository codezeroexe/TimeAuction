import type { AuctionEvent } from './types.ts'

/** FNV-1a 32-bit. Fast and synchronous; detects accidental edits, offers no protection against deliberate tampering. */
export function fnv1a(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

export const GENESIS = '00000000'

export function eventHash(e: Omit<AuctionEvent, 'hash'>, prev: string): string {
  return fnv1a(
    [prev, e.seq, e.sessionId, e.at, e.type, e.techId, e.sideId, e.amount, e.note, e.wallet?.before, e.wallet?.after, e.portfolioAfter?.join(',')].join('|'),
  )
}
