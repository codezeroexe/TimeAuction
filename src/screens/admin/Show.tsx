import { useEffect, useMemo, useRef, useState } from 'react'
import ReasonAction from '../../components/ui/ReasonAction.tsx'
import Button from '../../components/ui/Button.tsx'
import { matchLabel } from '../../components/game/bits.tsx'
import { currentLot, isLastLot, sidesOf } from '../../game/auction.ts'
import { DEFAULT_DISPLAY, DISPLAY_LIMITS, displayOf, lobbyParticipants, rooms } from '../../game/event.ts'
import type { ShowDisplay } from '../../game/types.ts'
import { getTech } from '../../data/technologies.ts'
import { useGame } from '../../state/GameContext.tsx'
import { roomNumber, STAGE_LABELS } from '../present/show.ts'
import { Empty, SectionTitle } from './AdminShell.tsx'

type Act = Parameters<ReturnType<typeof useGame>['runFor']>[1]
type Row = ReturnType<typeof rooms>[number]

const STATUS_TEXT = { ready: 'Held', live: 'Live', complete: 'Finished' } as const

/** Host console for the projector: a live preview, every room with its controls, and the twist reveals still waiting. */
export default function ShowSection() {
  const { event, mode, runFor, setShow, offlineOf, clearLobby, hideFromLobby, online } = useGame()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [note, setNote] = useState('')

  if (mode !== 'remote')
    return (
      <>
        <SectionTitle title="Show control" />
        <Empty>The projector needs the event server.</Empty>
      </>
    )

  const all = rooms(event)
  const held = all.filter((r) => r.session.status === 'ready')
  const awaiting = all.filter((r) => r.session.status === 'complete' && r.run.twistHeld && !r.run.twistRevealedAt)
  // Finished rooms drop off once nothing is left to do here (twist revealed or never held); numbering still counts them.
  const shown = all.filter((r) => r.session.status !== 'complete' || awaiting.includes(r))
  const focus = event.show.focus

  const act = (r: Row, a: Act) =>
    runFor(r.gameId, a).then((res) => {
      setErrors((e) => ({ ...e, [r.session.sessionId]: res.ok ? '' : res.message }))
      return res
    })
  const focusRoom = (sessionId: string | null) =>
    setShow({ focus: sessionId }).then((res) => {
      setNote(res.ok ? '' : res.message)
    })
  const startHeld = async () => {
    let started = 0
    for (const r of held) if ((await act(r, { type: 'proceedToAuction' })).ok) started++
    setNote(`Started ${started} of ${held.length} held ${held.length === 1 ? 'match' : 'matches'}.`)
  }

  return (
    <>
      <SectionTitle title="Show control">
        The projector follows the stage in the bar above. Show a room big from the list below, or leave the focus clear so one live room fills the screen and several live rooms
        share a grid. Every clock, bid and twist reveal is still checked by the event server.
      </SectionTitle>
      <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <section aria-labelledby="preview-title" className="min-w-0">
          <h2 id="preview-title" className="lbl">
            Projector now · {STAGE_LABELS[event.show.stage]}
          </h2>
          <Preview />
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">{event.show.lobbySince ? `Lobby last cleared ${new Date(event.show.lobbySince).toLocaleTimeString()}.` : 'Lobby not cleared yet.'} The Teams slide lists connected players only.</p>
            <ReasonAction
              label="Clear lobby"
              confirmLabel="Clear lobby"
              danger
              consequence="Hides everyone currently waiting and every finished room from the lobby and projector. Records, scores and the leaderboard are kept."
              onConfirm={(reason) => clearLobby(reason)}
            />
          </div>
          <TeamsList people={lobbyParticipants(event).filter((p) => !online || online.includes(p.gameId))} onHide={(id) => hideFromLobby(id).then((r) => setNote(r.ok ? '' : r.message))} />
          <ProjectorFit />
        </section>
        <section aria-labelledby="rooms-title" className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="rooms-title" className="lbl">
              Rooms ({shown.length})
            </h2>
            <div className="flex flex-wrap items-center gap-3">
              {awaiting.length > 0 && <span className="chip chip-hot">{awaiting.length} waiting for twist reveal</span>}
              {focus && (
                <Button variant="ghost" onClick={() => focusRoom(null)}>
                  Clear focus
                </Button>
              )}
              {held.length > 0 && <Button onClick={startHeld}>Start all held ({held.length})</Button>}
            </div>
          </div>
          {note && (
            <p role="status" className="mt-3 text-sm text-ink-soft">
              {note}
            </p>
          )}
          {shown.length === 0 ? (
            <div className="mt-4">
              <Empty>{all.length ? 'No match in progress. Finished rooms are in the Scoring queue and Leaderboard.' : 'No matches yet. Pair waiting players on Matchmaking.'}</Empty>
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-line border-y border-line">
              {shown.map((r) => (
                <RoomRow
                  key={r.session.sessionId}
                  room={r}
                  n={roomNumber(all, r.session.sessionId)}
                  focused={focus === r.session.sessionId}
                  offline={offlineOf(r.session.sessionId).length}
                  error={errors[r.session.sessionId] ?? ''}
                  act={act}
                  focusRoom={focusRoom}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}

/** The projector's own screen, scaled down to the container's width. Same URL with `#/present/preview`: silent, and it reads the same live state. */
function Preview() {
  const src = useMemo(() => new URL('#/present/preview', window.location.href).href, [])
  const box = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.3)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const fit = () => setScale(el.clientWidth / 1920)
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div className="mt-3 w-full max-w-[576px]">
      <div ref={box} className="relative aspect-video overflow-hidden rounded-[10px] border border-line-strong bg-paper">
        <iframe
          src={src}
          aria-hidden="true"
          tabIndex={-1}
          className="pointer-events-none absolute top-0 left-0 h-[1080px] w-[1920px] origin-top-left border-0"
          style={{ transform: `scale(${scale})` }}
        />
      </div>
      <p className="mt-2 text-sm text-muted">Live copy of the projector without sound. Open the projector in its own window for the room.</p>
    </div>
  )
}

const FIT_SLIDERS = [
  ['scale', 'Zoom', DISPLAY_LIMITS.scale, 5],
  ['top', 'Top edge', DISPLAY_LIMITS.inset, 1],
  ['right', 'Right edge', DISPLAY_LIMITS.inset, 1],
  ['bottom', 'Bottom edge', DISPLAY_LIMITS.inset, 1],
  ['left', 'Left edge', DISPLAY_LIMITS.inset, 1],
] as const

/** Zoom and edge insets for the venue's projector. Sliders keep a local draft and save on release. */
function ProjectorFit() {
  const { event, setShow } = useGame()
  const saved = displayOf(event.show)
  const [draft, setDraft] = useState<ShowDisplay | null>(null)
  const latest = useRef<ShowDisplay | null>(null)
  const [msg, setMsg] = useState('')
  const d = draft ?? saved
  // Keep the draft until the saved fit catches up (pushes arrive up to 1 s later), so quick keypresses build on each other.
  const commit = (next: ShowDisplay) =>
    setShow({ display: next }).then((r) => {
      latest.current = null
      if (!r.ok) setDraft(null)
      setMsg(r.ok ? '' : r.message)
    })
  useEffect(() => {
    if (draft && JSON.stringify(draft) === JSON.stringify(saved)) setDraft(null)
  }, [draft, saved])
  const change = (next: ShowDisplay) => {
    latest.current = next
    setDraft(next)
  }
  const end = () => {
    if (latest.current) void commit(latest.current)
  }
  return (
    <div className="mt-6 max-w-[576px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="lbl">Projector fit</h3>
        <div className="flex items-center gap-2">
          <button type="button" className="chipbtn" aria-pressed={saved.guides} onClick={() => void commit({ ...saved, guides: !saved.guides })}>
            Guides
          </button>
          <button type="button" className="chipbtn" onClick={() => void commit({ ...DEFAULT_DISPLAY, guides: saved.guides })}>
            Reset
          </button>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-[8rem_minmax(0,1fr)_3.5rem] items-center gap-x-4 gap-y-2 text-sm">
        {FIT_SLIDERS.map(([k, label, [min, max], step]) => (
          <label key={k} className="contents">
            <span>{label}</span>
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={d[k]}
              className="w-full accent-accent"
              onChange={(e) => change({ ...d, [k]: Number(e.target.value) })}
              onPointerUp={end}
              onKeyUp={end}
              onBlur={end}
            />
            <span className="text-right font-mono tabular-nums">{d[k]}%</span>
          </label>
        ))}
      </div>
      {msg && (
        <p role="status" className="mt-2 text-sm text-danger">
          {msg}
        </p>
      )}
      <p className="mt-2 text-sm text-muted">
        Turn on Guides, then look at the wall: the red line is the screen edge, so where it is missing the projector crops. Raise that edge until the dashed line shows. Lower the
        zoom if text or cards do not fit. The preview above is drawn at 1080p.
      </p>
    </div>
  )
}

function RoomRow({
  room: r,
  n,
  focused,
  offline,
  error,
  act,
  focusRoom,
}: {
  room: Row
  n: number
  focused: boolean
  offline: number
  error: string
  act: (r: Row, a: Act) => Promise<{ ok: boolean; message: string }>
  focusRoom: (sessionId: string | null) => Promise<void>
}) {
  const s = r.session
  const lot = currentLot(s)
  const phase = lot.status === 'open' ? lot.phase : 'decided'
  const awaiting = s.status === 'complete' && !!r.run.twistHeld && !r.run.twistRevealedAt
  return (
    <li className="py-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">Room {n}</span>
            <span className="chip">{STATUS_TEXT[s.status]}</span>
            {focused && <span className="chip chip-wal">On projector</span>}
            {offline > 0 && <span className="text-sm text-danger">{offline} disconnected</span>}
          </p>
          <p className="mt-1 text-sm text-muted">
            {sidesOf(s).map((id) => s.sides[id].name).join(', ')} · {matchLabel(s)} · <span className="font-mono text-[13px]">{s.sessionId}</span>
          </p>
          {s.status === 'live' && (
            <p className="mt-1 text-sm">
              {getTech(lot.techId).name} · Lot {s.current + 1} / {s.lots.length} · clock {lot.running ? 'running' : 'paused'}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {s.status === 'ready' && <Button onClick={() => act(r, { type: 'proceedToAuction' })}>Start auction</Button>}
          {s.status === 'live' &&
            (lot.running ? (
              <Button variant="secondary" onClick={() => act(r, { type: 'setClockRunning', running: false })}>
                Pause
              </Button>
            ) : (
              <Button onClick={() => act(r, { type: 'setClockRunning', running: true })}>{phase === 'intro' ? 'Start now' : 'Resume'}</Button>
            ))}
          {s.status === 'live' && lot.status !== 'open' && (
            <Button variant="secondary" onClick={() => act(r, { type: 'advanceLot' })}>
              {isLastLot(s) ? 'Finish auction' : 'Next technology'}
            </Button>
          )}
          {awaiting && <Button onClick={() => act(r, { type: 'revealTwist' })}>Reveal twist</Button>}
          <Button variant="secondary" disabled={focused} onClick={() => focusRoom(s.sessionId)}>
            {focused ? 'Showing' : 'Show on projector'}
          </Button>
        </div>
      </div>
      {error && (
        <p role="status" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </li>
  )
}

/** Who the projector's Teams slide lists right now, each with Hide for a stale or abandoned registration. */
function TeamsList({ people, onHide }: { people: ReturnType<typeof lobbyParticipants>; onHide: (gameId: string) => unknown }) {
  return (
    <div className="mt-4">
      <h3 className="lbl">On the Teams slide ({people.length})</h3>
      {people.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Nobody: the slide says the lobby is empty.</p>
      ) : (
        <ul className="mt-2 divide-y divide-line border-y border-line">
          {people.map((p) => (
            <li key={p.gameId} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0 truncate text-sm">
                <span className="font-medium">{p.player.team?.name ?? p.player.name}</span>
                <span className="text-muted"> · {p.player.mode === 'team' ? `team of ${p.player.team!.members.length}` : 'individual'} · {p.gameId}</span>
              </span>
              <Button variant="ghost" onClick={() => void onHide(p.gameId)}>
                Hide
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
