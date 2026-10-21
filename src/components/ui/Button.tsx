import { useRef, useState, type ButtonHTMLAttributes, type MouseEvent } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-solid'

const VARIANTS: Record<Variant, string> = {
  primary: 'btn-primary bg-ink text-paper hover:bg-ink-soft disabled:bg-line disabled:text-muted',
  secondary: 'border border-line-strong bg-transparent text-accent hover:border-accent hover:bg-accent-soft disabled:text-muted',
  ghost: 'btn-ghost text-ink-soft hover:text-ink hover:bg-ink/5 disabled:text-muted disabled:hover:bg-transparent',
  danger: 'btn-danger border border-danger bg-transparent text-danger hover:bg-danger-soft',
  'danger-solid': 'btn-danger bg-danger text-white hover:bg-danger/90 disabled:bg-line disabled:text-muted',
}

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> & {
  variant?: Variant
  /** When the handler returns a promise, the button stays disabled until it settles, so one click is one request. */
  onClick?: (e: MouseEvent<HTMLButtonElement>) => unknown
}

export default function Button({ variant = 'primary', className = '', type = 'button', onClick, disabled, children, ...props }: Props) {
  const [busy, setBusy] = useState(false)
  // Also guards clicks that land before the disabled state has rendered.
  const inFlight = useRef(false)
  return (
    <button
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      onClick={(e) => {
        if (inFlight.current) return
        const r = onClick?.(e)
        if (r instanceof Promise) {
          inFlight.current = true
          setBusy(true)
          r.finally(() => {
            inFlight.current = false
            setBusy(false)
          })
        }
      }}
      className={`btn inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold disabled:cursor-not-allowed ${busy ? 'cursor-progress' : ''} ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

/** Trailing arrow that nudges right when its button is hovered. */
export const Arrow = () => (
  <span className="ar" aria-hidden="true">
    →
  </span>
)
