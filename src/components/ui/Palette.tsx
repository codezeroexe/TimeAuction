import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useGame } from '../../state/GameContext.tsx'
import { navigate, routeForRun, type Route } from '../../state/useRoute.ts'
import { isOn, subscribe, toggle } from './sfx.ts'

interface Item {
  id: string
  label: string
  hint: string
  run: () => void
}

export const PALETTE_EVENT = 'timeauction:palette'

/** Command palette: jump between screens or flip sound. Opens on Ctrl+K (Cmd+K on a Mac) or the rail button. */
export default function Palette() {
  const { state, mode, isAdmin } = useGame()
  const host = mode === 'local' || isAdmin
  const sound = useSyncExternalStore(subscribe, isOn)
  const [open, setOpen] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const opener = useRef<Element | null>(null)

  useEffect(() => {
    const show = () => {
      if (dialog.current?.open) return
      opener.current = document.activeElement
      setOpen(true)
    }
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        if (dialog.current?.open) dialog.current.close()
        else show()
      }
    }
    window.addEventListener('keydown', key)
    window.addEventListener(PALETTE_EVENT, show)
    return () => {
      window.removeEventListener('keydown', key)
      window.removeEventListener(PALETTE_EVENT, show)
    }
  }, [])

  useEffect(() => {
    const d = dialog.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  const close = () => {
    setOpen(false)
    if (opener.current instanceof HTMLElement) opener.current.focus()
  }
  const items = useMemo<Item[]>(() => {
    const go = (label: string, route: Route): Item => ({ id: route, label, hint: '↵', run: () => navigate(route) })
    return [
      go('Home', 'landing'),
      // A remote station registers once; single-device mode can register more participants.
      ...(mode === 'local' || !state.player ? [go('Register', 'register')] : []),
      go('Lobby', 'lobby'),
      go('Rules', 'rules'),
      go('Leaderboard', 'leaderboard'),
      go('Idle screen', 'idle'),
      // Always listed: the admin page asks for judge sign-in, and it is the only way in now the landing footer is gone.
      go('Event administration', 'admin'),
      ...(host ? [go('Presentation screen', 'present')] : []),
      ...(state.run ? [go('Go to current stage', routeForRun(state.run))] : []),
      { id: 'sound', label: sound ? 'Sound: turn off' : 'Sound: turn on', hint: sound ? 'on' : 'off', run: () => void toggle() },
    ]
  }, [state.run, state.player, sound, host, mode])

  return (
    <dialog ref={dialog} aria-label="Command palette" onClose={() => open && close()} onClick={(e) => e.target === dialog.current && close()} className="pal">
      {open && <Body items={items} close={close} />}
    </dialog>
  )
}

function Body({ items, close }: { items: Item[]; close: () => void }) {
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const shown = items.filter((i) => i.label.toLowerCase().includes(q.trim().toLowerCase()))
  const at = Math.min(idx, Math.max(0, shown.length - 1))
  const pick = (i: Item | undefined) => {
    if (!i) return
    close()
    i.run()
  }
  return (
    <>
      <input
        autoFocus
        role="combobox"
        aria-expanded="true"
        aria-controls="palette-list"
        aria-activedescendant={shown[at] ? `palette-${shown[at].id}` : undefined}
        aria-label="Jump to"
        placeholder="Jump to…"
        autoComplete="off"
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setIdx(0)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            if (shown.length) setIdx((at + (e.key === 'ArrowDown' ? 1 : shown.length - 1)) % shown.length)
          } else if (e.key === 'Enter') {
            e.preventDefault()
            pick(shown[at])
          }
        }}
      />
      <ul id="palette-list" role="listbox" aria-label="Destinations">
        {shown.map((i, n) => (
          <li key={i.id} id={`palette-${i.id}`} role="option" aria-selected={n === at} onClick={() => pick(i)} onMouseMove={() => setIdx(n)}>
            <span>{i.label}</span>
            <span>{i.hint}</span>
          </li>
        ))}
        {!shown.length && <li role="presentation" className="empty">No match</li>}
      </ul>
    </>
  )
}
