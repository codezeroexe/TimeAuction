import { useEffect, useRef, useState, type FormEvent } from 'react'
import GameShell from '../components/ui/GameShell.tsx'
import Button, { Arrow } from '../components/ui/Button.tsx'
import type { GameMode } from '../game/types.ts'
import { NAME_MAX, TEAM_MAX } from '../game/rules.ts'
import { hasErrors, validateRegistration } from '../game/validation.ts'
import { useGame } from '../state/GameContext.tsx'
import { navigate } from '../state/useRoute.ts'

const input =
  'block w-full rounded-[10px] border bg-paper/70 px-3.5 py-2.5 text-[15px] text-ink placeholder:text-muted/70 focus:border-accent focus:bg-accent-soft focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'
const floating =
  'peer block w-full rounded-[10px] border bg-paper/70 px-3.5 pt-6 pb-2 text-[15px] text-ink placeholder:text-muted/70 focus:border-accent focus:bg-accent-soft focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'
const floatLabel = 'pointer-events-none absolute left-3.5 top-2 lbl peer-focus:text-accent'
const border = (err?: string) => (err ? 'border-danger' : 'border-line-strong')

function FieldError({ id, msg }: { id: string; msg?: string }) {
  if (!msg) return null
  return (
    <p id={id} className="mt-1.5 text-sm text-danger">
      {msg}
    </p>
  )
}

export default function Registration() {
  const { state, mode: storage, register } = useGame()
  const [serverErr, setServerErr] = useState('')
  const [name, setName] = useState('')
  const [mode, setMode] = useState<GameMode>('individual')
  const [teamName, setTeamName] = useState('')
  const [teammates, setTeammates] = useState<string[]>([''])
  const [submitted, setSubmitted] = useState(false)
  const summaryRef = useRef<HTMLDivElement>(null)

  // A participant is already active on this device; switch participant from the lobby to register another.
  useEffect(() => {
    if (state.player) navigate('lobby')
  }, [state.player])

  const errors = validateRegistration({ name, mode, teamName, teammates })
  const shown = submitted ? errors : {}
  const errorCount =
    ['name', 'teamName', 'teammates'].filter((k) => k in errors).length + Object.keys(errors.teammate ?? {}).length

  const [busy, setBusy] = useState(false)
  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setSubmitted(true)
    if (hasErrors(errors)) {
      requestAnimationFrame(() => summaryRef.current?.focus())
      return
    }
    setBusy(true)
    register({ name, mode, teamName, teammates })
      .then((r) => setServerErr(r.ok ? '' : r.message))
      .finally(() => setBusy(false))
  }

  const setMate = (i: number, v: string) => setTeammates((t) => t.map((m, j) => (j === i ? v : m)))

  return (
    <GameShell>
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] lg:gap-20">
        <div className="lg:sticky lg:top-8 lg:self-start">
          <button
            type="button"
            onClick={() => navigate('landing')}
            className="text-sm text-muted transition-colors hover:text-ink"
          >
            &larr; Back to home
          </button>
          <h1 className="mt-10 font-display text-5xl leading-[1.02] sm:text-6xl">Register for your mission</h1>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-ink-soft">
            Enter alone or assemble a team of up to {TEAM_MAX}. Every entrant begins with{' '}
            <strong className="font-semibold text-ink">ChronoCoins</strong> to spend in the technology auction. The amount is set
            when you are matched: the more players, the more technologies and the more coins.
          </p>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-muted">
            {storage === 'remote'
              ? 'Your registration is recorded by this event’s server and kept in this browser. To continue on another station, ask the event team for a resume code.'
              : 'No event server is connected, so your registration is saved in this browser only. There is no account and nothing is sent anywhere.'}
          </p>

          <IdCard name={name} mode={mode} teamName={teamName} remote={storage === 'remote'} />

          <Resume />
        </div>

        <form noValidate onSubmit={onSubmit} className="max-w-xl" aria-describedby={submitted && errorCount ? 'err-summary' : undefined}>
          {submitted && errorCount > 0 && (
            <div
              ref={summaryRef}
              id="err-summary"
              tabIndex={-1}
              role="alert"
              className="mb-8 rounded-md border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger focus:outline-none"
            >
              Please fix {errorCount === 1 ? 'one issue' : `${errorCount} issues`} before continuing.
            </div>
          )}

          <div className="relative">
            <input
              id="player-name"
              className={`${floating} ${border(shown.name)}`}
              value={name}
              maxLength={NAME_MAX}
              autoComplete="nickname"
              placeholder="e.g. Ada Lovelace"
              onChange={(e) => setName(e.target.value)}
              aria-invalid={!!shown.name}
              aria-describedby={shown.name ? 'player-name-err' : undefined}
            />
            <label htmlFor="player-name" className={floatLabel}>
              Player name
            </label>
            <FieldError id="player-name-err" msg={shown.name} />
          </div>

          <fieldset className="mt-8">
            <legend className="text-sm font-medium">Game mode</legend>
            <div className="seg mt-2">
              {(['individual', 'team'] as const).map((m) => (
                <label key={m} className="seg-o capitalize" data-on={mode === m}>
                  <input type="radio" name="mode" value={m} checked={mode === m} onChange={() => setMode(m)} className="sr-only" />
                  {m}
                </label>
              ))}
            </div>
            <p className="mt-2 text-sm text-muted">
              {mode === 'individual'
                ? 'You compete alone and make every bid yourself.'
                : 'Your team shares one balance and one set of technologies.'}
            </p>
          </fieldset>

          {mode === 'team' && (
            <div className="mt-8 border-t border-line pt-8">
              <div className="relative">
                <input
                  id="team-name"
                  className={`${floating} ${border(shown.teamName)}`}
                  value={teamName}
                  maxLength={NAME_MAX}
                  placeholder="e.g. Orbital Dynamics"
                  onChange={(e) => setTeamName(e.target.value)}
                  aria-invalid={!!shown.teamName}
                  aria-describedby={shown.teamName ? 'team-name-err' : undefined}
                />
                <label htmlFor="team-name" className={floatLabel}>
                  Team name
                </label>
                <FieldError id="team-name-err" msg={shown.teamName} />
              </div>

              <fieldset className="mt-8" aria-describedby="members-hint">
                <div className="flex items-baseline justify-between">
                  <legend className="text-sm font-medium">Team members</legend>
                  <span id="members-hint" className="text-sm text-muted tabular-nums">
                    {teammates.length + 1} of {TEAM_MAX} · minimum 2
                  </span>
                </div>

                <ol className="mt-3 divide-y divide-line border-y border-line">
                  <li className="flex items-center gap-3 py-3">
                    <span className="w-6 text-sm text-muted tabular-nums">1</span>
                    <span className={`flex-1 text-[15px] ${name.trim() ? 'text-ink' : 'text-muted'}`}>
                      {name.trim() || 'You (player name above)'}
                    </span>
                    <span className="text-xs tracking-wide text-muted uppercase">Captain</span>
                  </li>
                  {teammates.map((m, i) => {
                    const err = shown.teammate?.[i]
                    const id = `member-${i + 2}`
                    return (
                      <li key={i} className="py-3">
                        <div className="flex items-center gap-3">
                          <label htmlFor={id} className="w-6 text-sm text-muted tabular-nums">
                            <span className="sr-only">Member </span>
                            {i + 2}
                          </label>
                          <input
                            id={id}
                            className={`${input} ${border(err)}`}
                            value={m}
                            maxLength={NAME_MAX}
                            placeholder="Member name"
                            onChange={(e) => setMate(i, e.target.value)}
                            aria-invalid={!!err}
                            aria-describedby={err ? `${id}-err` : undefined}
                          />
                          <Button
                            variant="ghost"
                            className="px-3"
                            disabled={teammates.length <= 1}
                            onClick={() => setTeammates((t) => t.filter((_, j) => j !== i))}
                            aria-label={`Remove member ${i + 2}`}
                          >
                            Remove
                          </Button>
                        </div>
                        <div className="pl-9">
                          <FieldError id={`${id}-err`} msg={err} />
                        </div>
                      </li>
                    )
                  })}
                </ol>
                <FieldError id="members-err" msg={shown.teammates} />
                <Button
                  variant="secondary"
                  className="mt-4"
                  disabled={teammates.length + 1 >= TEAM_MAX}
                  onClick={() => setTeammates((t) => [...t, ''])}
                >
                  + Add member
                </Button>
              </fieldset>
            </div>
          )}

          <div className="mt-10 flex flex-col gap-4 border-t border-line pt-8 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted">
              Starting balance:{' '}
              <span className="font-semibold text-ink">set by the match size</span>
            </p>
            <Button type="submit" className="px-7 py-3 tracking-wide" disabled={busy}>
              {busy ? 'Registering…' : <>Register and continue <Arrow /></>}
            </Button>
          </div>
          {serverErr && <p role="alert" className="mt-3 text-sm text-danger">{serverErr}</p>}
        </form>
      </div>
    </GameShell>
  )
}

/** Live preview of the operative card as the form is filled in. Decorative; the Game ID is issued on registration. */
function IdCard({ name, mode, teamName, remote }: { name: string; mode: GameMode; teamName: string; remote: boolean }) {
  return (
    <div className="mt-10 hidden sm:block" aria-hidden="true">
      <div className="lbl mb-3">Operative card · live preview</div>
      <div className="idc">
        <div className="flex items-start justify-between">
          <span className="chipx" />
          <span className="lbl">TimeAuction · ID</span>
        </div>
        <div>
          <div className="lbl">{mode === 'team' ? `TEAM · ${teamName.trim().toUpperCase() || '—'}` : 'INDIVIDUAL'}</div>
          <div className="nm mt-2">{name.trim().toUpperCase() || 'YOUR NAME'}</div>
        </div>
        <div>
          <div className="barcode" />
          <div className="mt-2.5 flex justify-between font-mono text-[13px]">
            <span className="text-muted">{remote ? 'Linked to this station on registration' : 'Game ID issued on registration'}</span>
            <span className="text-accent">Match size</span>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Resume an existing registration; with an event server, also take Side B of a match created on another station. */
function Resume() {
  const { event, mode, resume } = useGame()
  if (mode === 'local' && event.participants.length === 0) return null
  return (
    <div className="mt-12 max-w-md space-y-8 border-t border-line pt-8">
      <IdForm
        id="resume-id"
        label={mode === 'remote' ? 'Moving to this station? Enter the resume code from the event team' : 'Already registered here? Resume with your Game ID'}
        placeholder={mode === 'remote' ? 'e.g. 3F9A12C0B7D4' : 'GAME-…'}
        action="Resume"
        onSubmit={(v) => resume(v)}
      />
    </div>
  )
}

function IdForm({ id, label, placeholder, action, onSubmit }: { id: string; label: string; placeholder: string; action: string; onSubmit: (v: string) => Promise<{ ok: boolean; message: string }> }) {
  const [value, setValue] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const v = value.trim().toUpperCase()
        if (!v || busy) return setErr(v ? '' : 'Enter the ID first.')
        setBusy(true)
        onSubmit(v)
          .then((r) => setErr(r.ok ? '' : r.message))
          .finally(() => setBusy(false))
      }}
    >
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className="mt-2 flex gap-2">
        <input
          id={id}
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setErr('')
          }}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={!!err}
          aria-describedby={err ? `${id}-err` : undefined}
          className="block w-full min-w-0 rounded-md border border-line-strong bg-surface px-3.5 py-2.5 font-mono text-[14px] uppercase placeholder:normal-case focus:border-accent focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent aria-invalid:border-danger"
        />
        <Button type="submit" variant="secondary" disabled={busy} className="shrink-0">
          {busy ? 'Checking…' : action}
        </Button>
      </div>
      {err && (
        <p id={`${id}-err`} role="alert" className="mt-1.5 text-sm text-danger">
          {err}
        </p>
      )}
    </form>
  )
}
