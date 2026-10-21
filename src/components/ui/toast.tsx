import { useEffect, useState } from 'react'

/** Tiny notification queue for real events (connection changes, published scores). Never for routine feedback. */

type Tone = 'neutral' | 'success' | 'danger'
interface Toast {
  id: number
  message: string
  tone: Tone
  leaving?: boolean
}

let toasts: Toast[] = []
let next = 1
const listeners = new Set<(t: Toast[]) => void>()
const emit = () => listeners.forEach((l) => l(toasts))

export function toast(message: string, tone: Tone = 'neutral') {
  const id = next++
  toasts = [...toasts.filter((t) => t.message !== message), { id, message, tone }].slice(-3)
  emit()
  // Fade for the last 400 ms of the 5 s lifetime.
  setTimeout(() => {
    toasts = toasts.map((t) => (t.id === id ? { ...t, leaving: true } : t))
    emit()
  }, 4600)
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id)
    emit()
  }, 5000)
}

const TONE: Record<Tone, string> = {
  neutral: 'border-l-accent text-ink',
  success: 'border-l-success text-success',
  danger: 'border-l-danger text-danger',
}

export function Toaster() {
  const [list, setList] = useState(toasts)
  useEffect(() => {
    listeners.add(setList)
    return () => void listeners.delete(setList)
  }, [])
  return (
    <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 bottom-[62px] z-50 md:bottom-0 flex flex-col items-center gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-end sm:px-6">
      {list.map((t) => (
        <p key={t.id} className={`toast-up pointer-events-auto max-w-sm rounded-[10px] border border-l-[3px] border-line-strong bg-surface px-4 py-3 text-sm shadow-[0_12px_30px_-16px_rgb(14_26_51/.45)] ${TONE[t.tone]} ${t.leaving ? 'toast-out' : ''}`}>
          {t.message}
        </p>
      ))}
    </div>
  )
}

/** Copy and confirm. navigator.clipboard is missing on plain-HTTP LAN pages, so fall back to a hidden textarea. */
export function copyText(text: string, label: string) {
  const fallback = () => {
    const t = document.createElement('textarea')
    t.value = text
    t.style.cssText = 'position:fixed;opacity:0'
    document.body.append(t)
    t.select()
    const ok = document.execCommand('copy')
    t.remove()
    toast(ok ? `${label} copied: ${text}` : `Copy failed. ${label}: ${text}`, ok ? 'neutral' : 'danger')
  }
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => toast(`${label} copied: ${text}`), fallback)
  else fallback()
}
