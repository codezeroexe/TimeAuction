import { useState, type ReactNode } from 'react'
import Button from '../../components/ui/Button.tsx'
import { useGame } from '../../state/GameContext.tsx'
import { hrefFor } from '../../state/useRoute.ts'
import Logo from '../../components/ui/Logo.tsx'
import { useEnterClass } from '../../components/ui/useEnterClass.ts'
import ShowBar from './ShowBar.tsx'

export const SECTIONS = [
  { id: 'show', label: 'Show control' },
  { id: 'overview', label: 'Overview' },
  { id: 'registrations', label: 'Registrations' },
  { id: 'matchmaking', label: 'Matchmaking' },
  { id: 'runs', label: 'Runs & auctions' },
  { id: 'submissions', label: 'Submissions' },
  { id: 'scoring', label: 'Scoring queue' },
  { id: 'leaderboard', label: 'Leaderboard' },
  { id: 'integrity', label: 'Integrity & recovery' },
  { id: 'settings', label: 'Event settings' },
  { id: 'audit', label: 'Audit log' },
] as const
export type SectionId = (typeof SECTIONS)[number]['id']

/** Administration frame: visibly separate from the participant interface, same light design language. */
export default function AdminShell({ section, children }: { section: SectionId | null; children: ReactNode }) {
  const { event, updateSettings, isAdmin, mode, lockAdmin, judge } = useGame()
  const live = mode === 'remote' && isAdmin
  const main = useEnterClass<HTMLElement>()
  return (
    <div className="page-shell bg-paper text-ink selection:bg-accent/15">
      <header className="border-b border-ink bg-ink text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-3.5 sm:px-8">
          <p className="flex items-center gap-3">
            <Logo size={30} ink="#fff" accent="#fff" />
            <span className="font-display text-xl tracking-[0.22em]">TIMEAUCTION</span>
            <span className="text-sm text-white/70">Event administration</span>
          </p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            {mode === 'local' ? (
              <label className="flex items-center gap-2">
                <span className="text-white/70">Operator label</span>
                <input
                  value={event.settings.operator}
                  onChange={(e) => updateSettings({ operator: e.target.value.slice(0, 40) })}
                  placeholder="e.g. Judge 1"
                  aria-describedby="operator-note"
                  className="w-36 rounded border border-white/25 bg-white/10 px-2.5 py-1 text-white placeholder:text-white/45 focus:border-white focus:outline-none"
                />
              </label>
            ) : (
              isAdmin && <span className="text-white/70">Signed in as {judge}</span>
            )}
            <a href={hrefFor('present')} target="_blank" rel="noopener" className="text-white/80 underline-offset-4 hover:text-white hover:underline">
              Presentation (open in new window)
            </a>
            <a href="#/lobby" className="text-white/80 underline-offset-4 hover:text-white hover:underline">
              Participant view
            </a>
            {mode === 'remote' && isAdmin && (
              <button type="button" onClick={lockAdmin} className="text-white/80 underline-offset-4 hover:text-white hover:underline">
                Sign out
              </button>
            )}
          </div>
        </div>
        <p id="operator-note" className="mx-auto max-w-7xl px-5 pb-2.5 text-xs text-white/55 sm:px-8">
          {mode === 'remote'
            ? 'The event server only accepts administrator actions from a signed-in judge. Every action is recorded under the signed-in name.'
            : 'The label is recorded against scoring and admin actions. It is not a login and provides no security on a single device.'}
        </p>
      </header>

      {live && <ShowBar />}

      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-8 sm:px-8 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-12 lg:py-10">
        <nav aria-label="Administration sections" className="-mx-5 overflow-x-auto px-5 lg:mx-0 lg:px-0">
          <ul className="flex gap-1 border-b border-line lg:flex-col lg:border-b-0 lg:border-l">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={hrefFor('admin', s.id)}
                  aria-current={section === s.id ? 'page' : undefined}
                  className={`-mb-px block border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors lg:-ml-px lg:mb-0 lg:border-b-0 lg:border-l-2 lg:px-4 ${
                    section === s.id ? 'border-ink font-semibold text-ink' : 'border-transparent text-muted hover:text-ink'
                  }`}
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <main ref={main} className="min-w-0">{isAdmin ? children : <LoginGate />}</main>
      </div>
    </div>
  )
}

export function SectionTitle({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-8">
      <h1 className="font-display text-4xl leading-tight sm:text-5xl">{title}</h1>
      {children && <div className="mt-3 max-w-3xl text-[15px] leading-relaxed text-ink-soft">{children}</div>}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="border-y border-line py-10 text-center text-[15px] text-muted">{children}</p>
}

/** Event-server mode: administrator data and actions need a judge account (or the event lead's "admin" login). */
export function LoginGate() {
  const { unlockAdmin, sessionExpired } = useGame()
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const message = err || (sessionExpired ? 'Your session ended (expired or revoked). Sign in again.' : '')
  return (
    <form
      className="max-w-md"
      onSubmit={(e) => {
        e.preventDefault()
        if (!name.trim() || !password) return setErr('Enter your name and password.')
        setBusy(true)
        return unlockAdmin(name.trim(), password).then((r) => {
          setBusy(false)
          setErr(r.ok ? '' : r.message)
          if (r.ok) setPassword('')
        })
      }}
    >
      <SectionTitle title="Judge sign-in">
        Registrations, submissions, scoring and the audit log are only shared with signed-in judges. Sign in with the name and password the event lead gave you.
      </SectionTitle>
      <label htmlFor="judge-name" className="text-sm font-medium">
        Name
      </label>
      <input
        id="judge-name"
        type="text"
        autoComplete="username"
        value={name}
        onChange={(e) => {
          setName(e.target.value)
          setErr('')
        }}
        aria-invalid={!!message}
        className="mt-2 block w-full min-w-0 rounded-md border border-line-strong bg-surface px-3.5 py-2.5 text-[15px] focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none aria-invalid:border-danger"
      />
      <label htmlFor="judge-password" className="mt-4 block text-sm font-medium">
        Password
      </label>
      <div className="mt-2 flex gap-2">
        <input
          id="judge-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value)
            setErr('')
          }}
          aria-invalid={!!message}
          aria-describedby={message ? 'judge-login-err' : undefined}
          className="block w-full min-w-0 rounded-md border border-line-strong bg-surface px-3.5 py-2.5 text-[15px] focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none aria-invalid:border-danger"
        />
        <Button type="submit" onClick={undefined} disabled={busy}>
          Sign in
        </Button>
      </div>
      {message && (
        <p id="judge-login-err" role="alert" className="mt-2 text-sm text-danger">
          {message}
        </p>
      )}
      <p className="mt-6 text-sm text-muted">Your session lasts until you sign out, 8 hours of inactivity, or 12 hours in total. A server restart signs everyone out.</p>
    </form>
  )
}
