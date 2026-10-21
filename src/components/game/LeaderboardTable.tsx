import { useState } from 'react'
import { rankRows, type LeaderRow, type MatchCategory } from '../../game/leaderboard.ts'
import { matchTypeLabel, Tag } from './bits.tsx'
import { useGame } from '../../state/GameContext.tsx'

const FILTERS: { id: MatchCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'All matches' },
  { id: 'individual', label: 'Individual' },
  { id: 'team', label: 'Team' },
  { id: 'mixed', label: 'Mixed' },
]

/** Rows come from the authority (the event server, or this device in single-device mode); they are only displayed here. */
/** `plain` (projector): no filters, sort toggle or podium, so the screen holds no controls. */
export default function LeaderboardTable({ rows: all, currentGameId, plain = false }: { rows: Omit<LeaderRow, 'rank'>[]; currentGameId: string | null; plain?: boolean }) {
  const [filter, setFilter] = useState<MatchCategory | 'all'>('all')
  const [dir, setDir] = useState<'desc' | 'asc'>('desc')
  const { mode } = useGame()
  const rows = rankRows(all.filter((r) => filter === 'all' || r.category === filter), dir)
  const mine = rankRows(all).filter((r) => r.gameId === currentGameId)
  const top = plain ? [] : rankRows(all).slice(0, 3)

  if (all.length === 0) {
    return (
      <div className="border-y border-line py-14 text-center">
        <p className="font-display text-3xl">No published results yet</p>
        <p className="mx-auto mt-3 max-w-lg text-[15px] leading-relaxed text-ink-soft">
          A result appears here once a ranked first-run solution has been submitted and locked, scored on all six
          criteria, verified, and published by the event administrator. ChronoBot and replay runs are never ranked.
        </p>
      </div>
    )
  }

  return (
    <div>
      {top.length > 0 && (
        <ol className="grid gap-4 md:grid-cols-3 md:items-end" aria-label="Top ranked">
          {top.map((r, i) => (
            <li key={r.submissionId} className={`pn ${i === 0 ? 'md:order-2 md:pb-11' : i === 1 ? 'md:order-1' : 'md:order-3'}`}>
              <p className="text-sm text-muted">Rank {r.rank}</p>
              <p className="mt-1 truncate text-lg font-semibold">{r.unitName}</p>
              <p className="mt-2 font-display text-4xl tabular-nums">
                {r.total}
              </p>
              <p className="mt-1 text-xs text-muted">{r.rubric} rubric {r.tools < 0 ? '−' : '+'} {Math.abs(r.tools)} tools</p>
            </li>
          ))}
        </ol>
      )}

      {mine.length > 0 && (
        <p className="mt-6 text-[15px]" role="status">
          Your result:{' '}
          {mine.map((m) => (
            <strong key={m.submissionId} className="font-semibold">
              {m.unitName} · rank {m.rank} of {all.length} · {m.total} ({m.rubric} rubric {m.tools < 0 ? '−' : '+'} {Math.abs(m.tools)} tools)
            </strong>
          ))}
        </p>
      )}

      {!plain && (
        <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
          <div role="group" aria-label="Filter by match type" className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={filter === f.id}
                onClick={() => setFilter(f.id)}
                className="chipbtn"
              >
                {f.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setDir((d) => (d === 'desc' ? 'asc' : 'desc'))} className="text-sm text-ink-soft underline decoration-line-strong underline-offset-4 hover:text-ink">
            Sort by score: {dir === 'desc' ? 'highest first' : 'lowest first'}
          </button>

        </div>
      )}

      {/* Phones: one row per result, rank and score on the same line, details beneath. */}
      <ol className="mt-4 divide-y divide-line border-y border-line sm:hidden" aria-label="Results">
        {rows.length === 0 && <li className="py-8 text-center text-sm text-muted">No published results in this category.</li>}
        {rows.map((r) => {
          const isMine = r.gameId === currentGameId
          return (
            <li key={r.submissionId} className={`grid grid-cols-[2.25rem_1fr_auto] items-baseline gap-x-3 py-3.5 ${isMine ? 'bg-accent-soft/60' : ''}`}>
              <span className="text-lg font-semibold tabular-nums">{r.rank}</span>
              <span className="min-w-0">
                <span className="block truncate font-medium">{r.unitName}</span>
                <span className="mt-0.5 block text-xs text-muted">
                  {r.gameMode} · {r.matchType === 'ivt' && r.gameMode === 'Team' ? 'Team vs Individual' : matchTypeLabel(r.matchType, r.sideCount)}
                  {isMine && <span className="text-accent"> · your registration</span>}
                </span>
              </span>
              <span className="text-right">
                <span className="block text-lg font-semibold tabular-nums">{r.total}</span>
                <span className="mt-0.5 block">{r.final ? <Tag tone="success">FINAL</Tag> : <Tag>PROVISIONAL</Tag>}</span>
              </span>
            </li>
          )
        })}
      </ol>

      <div className="mt-4 hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[640px] border-y border-line text-left text-sm">
          <thead className="text-muted">
            <tr>
              <th className="lbl border-b border-line-strong p-3 font-normal">Rank</th>
              <th className="lbl border-b border-line-strong p-3 font-normal">Player / team</th>
              <th className="lbl border-b border-line-strong p-3 font-normal">Game mode</th>
              <th className="lbl border-b border-line-strong p-3 font-normal">Match type</th>
              <th className="lbl border-b border-line-strong p-3 text-right font-normal" aria-sort={dir === 'desc' ? 'descending' : 'ascending'}>
                Final score
              </th>
              <th className="lbl border-b border-line-strong p-3 font-normal">Run status</th>
            </tr>
          </thead>
          <tbody key={`${filter}-${dir}`}>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="border-b border-line p-3 py-8 text-center text-muted">
                  No published results in this category.
                </td>
              </tr>
            )}
            {rows.map((r, i) => {
              const isMine = r.gameId === currentGameId
              return (
                <tr
                  key={r.submissionId}
                  style={{ '--i': i } as React.CSSProperties}
                  className={`lb-row ${isMine ? 'me bg-accent-soft shadow-[inset_3px_0_0_var(--color-accent)]' : 'hover:bg-accent-soft'}`}
                >
                  <td className="border-b border-line p-3 py-4 font-semibold tabular-nums">{r.rank}</td>
                  <td className="border-b border-line p-3 py-4">
                    {r.unitName}
                    {isMine && <span className="ml-2 text-xs text-accent">your registration</span>}
                  </td>
                  <td className="border-b border-line p-3 py-4">{r.gameMode}</td>
                  <td className="border-b border-line p-3 py-4 text-ink-soft">{r.matchType === 'ivt' && r.gameMode === 'Team' ? 'Team vs Individual' : matchTypeLabel(r.matchType, r.sideCount)}</td>
                  <td className="border-b border-line p-3 py-4 text-right font-semibold tabular-nums">
                    <span className="inline-flex items-center gap-3">
                      <span className="sb" aria-hidden="true">
                        <i style={{ width: `${Math.max(0, Math.min(100, r.total))}%` }} />
                      </span>
                      {r.total}
                      <span className="font-sans text-xs font-normal text-muted">{r.rubric} {r.tools < 0 ? '−' : '+'} {Math.abs(r.tools)}</span>
                    </span>
                  </td>
                  <td className="border-b border-line p-3 py-4">{r.final ? <Tag tone="success">FINAL</Tag> : <Tag>PROVISIONAL</Tag>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted">
        Equal scores share a rank and the next rank is skipped. Ranks reflect the selected filter.{' '}
        {mode === 'remote' ? 'Results come from the event server and update live.' : 'Local results only; not synchronized to any server.'}
      </p>
    </div>
  )
}
