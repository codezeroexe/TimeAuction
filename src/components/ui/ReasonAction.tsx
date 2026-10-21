import { useId, useState } from 'react'
import Button from './Button.tsx'
import type { ActionResult } from '../../state/GameContext.tsx'

/**
 * A consequential action that needs a written reason. Opens inline (no modal), shows the consequence,
 * and only reports success after the action actually returned ok.
 */
export default function ReasonAction({
  label,
  confirmLabel,
  consequence,
  onConfirm,
  variant = 'secondary',
  danger = false,
}: {
  label: string
  confirmLabel: string
  consequence: string
  onConfirm: (reason: string) => Promise<ActionResult>
  variant?: 'secondary' | 'ghost'
  danger?: boolean
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [result, setResult] = useState<ActionResult | null>(null)

  if (!open)
    return (
      <div>
        <Button variant={variant} onClick={() => setOpen(true)} className={danger ? 'text-danger hover:bg-danger-soft' : ''}>
          {label}
        </Button>
        {result?.ok && <p className="mt-2 text-sm text-success" role="status">{result.message}</p>}
      </div>
    )

  return (
    <div className="rounded-md border border-line-strong bg-surface p-4">
      <p className="text-sm text-ink-soft">{consequence}</p>
      <label htmlFor={id} className="mt-3 block text-sm font-medium">
        Reason <span className="font-normal text-muted">(required, recorded in the audit log)</span>
      </label>
      <textarea id={id} rows={2} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} className="mt-1.5 block w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none" />
      {result && !result.ok && <p className="mt-2 text-sm text-danger" role="alert">{result.message}</p>}
      <div className="mt-3 flex gap-2">
        <Button
          variant={danger ? 'danger' : 'primary'}
          disabled={reason.trim().length < 5}
          onClick={async () => {
            const r = await onConfirm(reason)
            setResult(r)
            if (r.ok) {
              setOpen(false)
              setReason('')
            }
          }}
        >
          {confirmLabel}
        </Button>
        <Button variant="ghost" onClick={() => { setOpen(false); setResult(null) }}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
