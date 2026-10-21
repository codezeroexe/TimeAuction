import { useEffect, useRef } from 'react'
import { HOW_TO_PLAY } from '../../data/howToPlay.ts'

interface Props {
  open: boolean
  onClose: () => void
  onStart: () => void
}

/** Native <dialog> gives focus trapping, Escape-to-close and inert background for free. */
export default function HowToPlayDialog({ open, onClose, onStart }: Props) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby="htp-title"
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-auto max-h-[min(86vh,820px)] w-[min(680px,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-(--l-line-strong) bg-(--l-panel) p-0 text-(--l-fg) shadow-2xl"
    >
      <div className="px-6 pt-6 pb-2 sm:px-10 sm:pt-9">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h2 id="htp-title" className="font-display text-4xl leading-tight sm:text-5xl">
              One timeline. A drawn set of technologies. Three choices.
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 shrink-0 rounded-md p-2 text-(--l-muted) transition-colors hover:text-(--l-fg)"
            aria-label="Close how to play"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      <ol className="px-6 sm:px-10">
        {HOW_TO_PLAY.map((step, i) => (
          <li
            key={step.heading}
            className="grid grid-cols-[2.5rem_1fr] gap-x-3 border-t border-(--l-line) py-5 first:border-t-0"
          >
            <span className="pt-0.5 font-display text-xl text-(--l-accent) tabular-nums">
              {String(i + 1).padStart(2, '0')}
            </span>
            <div>
              <h3 className="text-base font-semibold">{step.heading}</h3>
              <p className="mt-1 text-[15px] leading-relaxed text-(--l-muted)">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="flex flex-col-reverse gap-3 border-t border-(--l-line) px-6 py-5 sm:flex-row sm:justify-end sm:px-10">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-(--l-line-strong) px-5 py-2.5 text-sm font-medium tracking-wide transition-colors hover:border-(--l-fg)"
        >
          Close
        </button>
        <button
          type="button"
          onClick={onStart}
          className="rounded-md bg-(--l-cta-bg) px-5 py-2.5 text-sm font-semibold tracking-[0.12em] text-(--l-cta-fg) uppercase transition-colors hover:bg-(--l-cta-hover)"
        >
          Start your mission
        </button>
      </div>
    </dialog>
  )
}
