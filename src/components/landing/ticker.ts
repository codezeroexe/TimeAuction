import { runsOf } from '../../game/records.ts'
import { RUBRIC_MAX } from '../../game/scoring.ts'
import type { AuctionEvent, EventState } from '../../game/types.ts'
import { TECHNOLOGIES } from '../../data/technologies.ts'

/**
 * Real activity only, nothing invented. Empty array means no ticker.
 * Local mode reads the whole event. Remote mode only holds this device's own records, so it shows just the server's leaderboard top score.
 */
export function tickerItems(ev: EventState, leaderboard: { total: number }[], local: boolean): string[] {
  const out: string[] = []
  const top = Math.max(...leaderboard.map((r) => r.total))
  const topItem = leaderboard.length ? `Top score · ${top} / ${RUBRIC_MAX}` : null
  if (!local) return topItem ? [topItem] : out
  const n = ev.participants.length
  if (n > 0) out.push(`${n} ${n === 1 ? 'participant' : 'participants'} registered`)

  const runs = ev.participants.flatMap(runsOf)
  const live = runs.filter((r) => !r.cancelled && r.session?.status === 'live').length
  if (live > 0) out.push(`${live} ${live === 1 ? 'auction' : 'auctions'} live`)

  let latest: { e: AuctionEvent; unit: string } | null = null
  for (const r of runs) {
    const s = r.session
    if (!s) continue
    for (const e of s.events) {
      if (e.type === 'sold' && e.sideId && e.techId && e.amount !== null && (!latest || e.at > latest.e.at)) latest = { e, unit: s.sides[e.sideId].name }
    }
  }
  if (latest) {
    const tech = TECHNOLOGIES.find((t) => t.id === latest!.e.techId)?.name ?? latest.e.techId
    out.push(`Latest sale · ${tech} · ${latest.e.amount} CC · ${latest.unit}`)
  }

  if (topItem) out.push(topItem)
  return out
}
