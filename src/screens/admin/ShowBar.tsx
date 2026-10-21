import { useEffect, useState } from 'react'
import { rooms } from '../../game/event.ts'
import { SHOW_STAGES, type ShowStage } from '../../game/types.ts'
import { useGame } from '../../state/GameContext.tsx'
import { roomNumber, STAGE_LABELS, stepStage } from '../present/show.ts'

/** Projector controls on every admin page: the stage the projector shows, and Ctrl+← / Ctrl+→ to step (ignored while typing). Event server only. */
export default function ShowBar() {
  const { event, setShow } = useGame()
  const [msg, setMsg] = useState('')
  const stage = event.show.stage
  const focus = event.show.focus
  const all = rooms(event)
  const n = focus ? roomNumber(all, focus) : 0

  const go = (next: ShowStage) => {
    if (next === stage) return Promise.resolve()
    return setShow({ stage: next }).then((r) => setMsg(r.ok ? '' : r.message))
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
      const t = e.target
      if (t instanceof HTMLElement && (t.isContentEditable || t.closest('input, textarea, select'))) return
      e.preventDefault()
      void setShow({ stage: stepStage(stage, e.key === 'ArrowRight' ? 1 : -1) }).then((r) => setMsg(r.ok ? '' : r.message))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [stage, setShow])

  const focusText = n ? `Room ${n} in focus` : focus ? 'The focused room is no longer on the event' : 'No room in focus: one live room shows big, several show as a grid'

  return (
    <div className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3 sm:px-8">
        <p className="lbl">Projector</p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="chipbtn disabled:opacity-40" disabled={stage === SHOW_STAGES[0]} onClick={() => go(stepStage(stage, -1))}>
            ‹ Back
          </button>
          <ol aria-label="Projector stage" className="flex flex-wrap gap-1.5">
            {SHOW_STAGES.map((s) => (
              <li key={s}>
                <button type="button" className="chipbtn" aria-pressed={s === stage} aria-current={s === stage ? 'step' : undefined} onClick={() => go(s)}>
                  {STAGE_LABELS[s]}
                </button>
              </li>
            ))}
          </ol>
          <button type="button" className="chipbtn disabled:opacity-40" disabled={stage === SHOW_STAGES[SHOW_STAGES.length - 1]} onClick={() => go(stepStage(stage, 1))}>
            Next ›
          </button>
        </div>
        <p className="text-sm text-muted">{focusText}</p>
        {event.show.display?.guides && <span className="chip chip-hot">Safe-area guides on</span>}
        <p role="status" aria-live="polite" className="text-sm text-danger">
          {msg}
        </p>
      </div>
    </div>
  )
}
