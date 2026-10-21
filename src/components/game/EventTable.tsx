import { cc, SideBadge } from './bits.tsx'
import { clock, EVENT_LABELS } from './events.ts'
import { getTech } from '../../data/technologies.ts'
import type { AuctionEvent, Session } from '../../game/types.ts'

/** Read-only rendering of an append-only auction log. Nothing here can alter an event. */
export default function EventTable({ session: s, events = s.events, className = 'mt-8' }: { session: Session; events?: AuctionEvent[]; className?: string }) {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full min-w-[960px] border-y border-line text-left text-sm">
        <thead className="text-muted">
          <tr className="border-b border-line">
            {['#', 'Time', 'Event', 'Technology', 'Bidder', 'Amount', 'Wallet change', 'Detail', 'Checksum'].map((h) => (
              <th key={h} className="py-2.5 pr-4 font-normal whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {events.map((e) => (
            <tr key={e.seq} className={e.type === 'purchase' ? 'bg-accent-soft/50' : undefined}>
              <td className="py-2.5 pr-4 text-muted tabular-nums">{e.seq}</td>
              <td className="py-2.5 pr-4 whitespace-nowrap text-muted tabular-nums">
                <time dateTime={e.at}>{clock(e.at)}</time>
              </td>
              <td className={`py-2.5 pr-4 whitespace-nowrap ${e.type === 'bid_rejected' ? 'text-danger' : ''}`}>{EVENT_LABELS[e.type]}</td>
              <td className="py-2.5 pr-4 whitespace-nowrap">{e.techId ? getTech(e.techId).name : '—'}</td>
              <td className="py-2.5 pr-4 whitespace-nowrap">
                {e.sideId ? (
                  <span className="inline-flex items-center gap-2">
                    <SideBadge side={e.sideId} />
                    {s.sides[e.sideId].name}
                  </span>
                ) : (
                  '—'
                )}
              </td>
              <td className="py-2.5 pr-4 whitespace-nowrap tabular-nums">{e.amount !== null ? cc(e.amount) : '—'}</td>
              <td className="py-2.5 pr-4 whitespace-nowrap tabular-nums">
                {e.wallet ? `${cc(e.wallet.before)} → ${cc(e.wallet.after)}` : '—'}
              </td>
              <td className="py-2.5 pr-4 text-ink-soft">{e.note}</td>
              <td className="py-2.5"><span className="hash">{e.hash ? <b>{e.hash}</b> : '—'}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
