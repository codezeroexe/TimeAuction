import { STATUS_LABEL, STATUS_ORDER, type SubmissionStatus } from '../../game/scoring.ts'

/** Horizontal step list of the submission workflow; the current step is announced to screen readers. */
export default function StatusTracker({ status, className = '' }: { status: SubmissionStatus; className?: string }) {
  const at = STATUS_ORDER.indexOf(status)
  return (
    <ol className={`grid grid-cols-7 gap-1.5 ${className}`} aria-label={`Status: ${STATUS_LABEL[status]}`}>
      {STATUS_ORDER.map((s, i) => (
        <li key={s} aria-current={i === at ? 'step' : undefined}>
          <span className={`block h-1 rounded-full ${i < at ? 'bg-ink' : i === at ? 'bg-accent' : 'bg-line'}`} />
          <span className={`mt-2 hidden text-[11px] leading-tight tracking-wide md:block ${i === at ? 'font-semibold text-ink' : i < at ? 'text-ink-soft' : 'text-muted'}`}>
            {STATUS_LABEL[s]}
          </span>
        </li>
      ))}
    </ol>
  )
}

export function StatusTag({ status }: { status: SubmissionStatus }) {
  const tone =
    status === 'published' ? 'border-success/30 bg-success/5 text-success' : status === 'draft' ? 'border-line-strong text-muted' : status === 'verified' || status === 'scored' ? 'border-accent/40 bg-accent-soft text-accent' : 'border-line-strong text-ink-soft'
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide whitespace-nowrap ${tone}`}>{STATUS_LABEL[status]}</span>
}
