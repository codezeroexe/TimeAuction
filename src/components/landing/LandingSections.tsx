import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import Logo from '../ui/Logo.tsx'
import { Arrow } from '../ui/Button.tsx'
import { toast } from '../ui/toast.tsx'
import { calm } from '../ui/motion.ts'
import { SFX } from '../ui/sfx.ts'
import { RULES_PREVIEW } from '../../data/howToPlay.ts'
import { RuleIcon, type RuleIconName } from '../game/RuleIcon.tsx'
import { MISSIONS, DEFAULT_MISSION_ID } from '../../data/scenario.ts'
import { RUBRIC } from '../../game/scoring.ts'
import { rankRows, type LeaderRow } from '../../game/leaderboard.ts'
import { useGame } from '../../state/GameContext.tsx'
import { navigate } from '../../state/useRoute.ts'
import { tickerItems } from './ticker.ts'

const order = (i: number) => ({ ['--i' as string]: i })
const YEARS = ['1880', '1960', '1990', '2010', '2040']
const RULE_ICONS: Record<(typeof RULES_PREVIEW)[number]['title'], RuleIconName> = {
  Register: 'register',
  Bid: 'bid',
  Adapt: 'adapt',
  Engineer: 'engineer',
  Compete: 'compete',
}

export const Wordmark = ({ className = '' }: { className?: string }) => (
  <span className={`font-display leading-none tracking-[0.02em] ${className}`}>
    Time<em className="text-(--l-accent)">Auction</em>
  </span>
)

/** Slim bar that slides in once the hero has scrolled away. */
export function StickyBar({ onStart, label }: { onStart: () => void; label: string }) {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const on = () => setShow(scrollY > 520)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  return (
    <div className={`snav ${show ? 'show' : ''}`} inert={!show || undefined}>
      <a href="#" className="flex items-center gap-2.5" aria-label="TimeAuction home" onClick={(e) => { if (location.hash === '' || location.hash === '#') { e.preventDefault(); scrollTo({ top: 0, behavior: calm() ? 'auto' : 'smooth' }) } }}>
        <Logo size={30} ink="var(--l-fg)" accent="var(--l-accent)" />
        <Wordmark className="hidden text-[23px] sm:block" />
      </a>
      <span className="flex-1" />
      <button type="button" onClick={onStart} className="cta inline-flex items-center gap-2 rounded-full bg-(--l-cta-bg) px-5 py-2.5 text-[13px] font-semibold whitespace-nowrap text-(--l-cta-fg) hover:bg-(--l-cta-hover)">
        {label} <Arrow />
      </button>
    </div>
  )
}

/** "Already registered?" Game ID form. Failure shows inline. */
export function ResumeForm() {
  const { resume, mode } = useGame()
  const remote = mode === 'remote'
  const [value, setValue] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const v = value.trim().toUpperCase()
    if (busy) return
    if (!v) return setErr(remote ? 'Enter the resume code from the event team.' : 'Enter your Game ID first.')
    setBusy(true)
    resume(v)
      .then((r) => {
        if (r.ok) {
          setErr('')
          toast(remote ? 'Welcome back.' : `Welcome back. Resuming ${v}`, 'success')
          navigate('lobby')
        } else {
          setErr(r.message)
          SFX.err()
        }
      })
      .finally(() => setBusy(false))
  }
  return (
    <form className="resume" onSubmit={submit}>
      <label htmlFor="resume-gid">Already registered?</label>
      <input
        id="resume-gid"
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          setErr('')
        }}
        placeholder={remote ? 'Resume code from the event team' : 'Your Game ID'}
        autoComplete="off"
        spellCheck={false}
        aria-invalid={!!err}
        aria-describedby={err ? 'resume-gid-err' : undefined}
      />
      <button type="submit" disabled={busy} className="cta rounded-full border border-(--l-line-strong) px-5 py-2.5 text-[13px] font-semibold hover:border-(--l-fg) disabled:opacity-50">
        {busy ? 'Checking…' : 'Continue'}
      </button>
      {err && (
        <p id="resume-gid-err" role="alert" className="w-full text-sm text-(--l-fg)">
          {err}
        </p>
      )}
    </form>
  )
}

/** Live activity, derived from real event data only. Renders nothing when there is none. */
export function Ticker() {
  const { event, leaderboard, mode } = useGame()
  const items = useMemo(() => tickerItems(event, leaderboard, mode === 'local'), [event, leaderboard, mode])
  if (!items.length) return null
  const track = items.map((t, i) => (
    <span key={i}>
      {i === 0 && <i />}
      {t}
    </span>
  ))
  return (
    <div className="ticker" role="region" aria-label="Live event activity">
      <div>
        <div className="contents">{track}</div>
        <div className="contents" aria-hidden="true">{track}</div>
      </div>
    </div>
  )
}

/** Sticky dial on the left turns to the step nearest the middle of the viewport. */
export function HowSection() {
  const [active, setActive] = useState(0)
  const list = useRef<HTMLOListElement>(null)
  useEffect(() => {
    let frame = 0
    const on = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const items = list.current?.children
        if (!items) return
        const mid = innerHeight * 0.5
        let best = 0
        let bd = Infinity
        for (let i = 0; i < items.length; i++) {
          const b = items[i].getBoundingClientRect()
          const d = Math.abs(b.top + b.height / 2 - mid)
          if (d < bd) {
            bd = d
            best = i
          }
        }
        setActive(best)
      })
    }
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => {
      window.removeEventListener('scroll', on)
      cancelAnimationFrame(frame)
    }
  }, [])
  const go = (i: number) => list.current?.children[i]?.scrollIntoView({ behavior: calm() ? 'auto' : 'smooth', block: 'center' })
  return (
    <section id="how" aria-labelledby="how-title" className="ls">
      <h2 id="how-title" data-reveal className="dh">Five phases along one timeline</h2>
      <div className="how">
        <div className="hd" aria-hidden="true">
          <svg viewBox="-110 -110 220 220" fill="none">
            <circle r="100" stroke="var(--l-line-strong)" />
            <circle r="84" stroke="var(--l-line)" strokeDasharray="1 6" />
            {RULES_PREVIEW.map((r, i) => {
              const a = (i * 72 * Math.PI) / 180
              return (
                <g key={r.title}>
                  <g transform={`rotate(${i * 72})`}>
                    <line y1="-100" y2="-88" stroke="var(--l-accent)" strokeWidth="2" />
                  </g>
                  <text x={Math.sin(a) * 66} y={-Math.cos(a) * 66 + 4} textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--l-muted)" fontFamily="var(--font-sans)">
                    {YEARS[i]}
                  </text>
                </g>
              )
            })}
            <g className="hh" style={{ transform: `rotate(${active * 72}deg)` }}>
              <line y2="-92" stroke="var(--l-cyan)" strokeWidth="3" strokeLinecap="round" />
              <circle cy="-100" r="6" fill="var(--l-cyan)" />
            </g>
            <circle r="5" fill="var(--l-fg)" />
          </svg>
          <p className="mt-3.5 font-mono text-[13px] tracking-[0.1em] text-(--l-cyan) uppercase">
            {YEARS[active]} · {RULES_PREVIEW[active].title}
          </p>
        </div>
        <ol ref={list} className="hs">
          {RULES_PREVIEW.map((r, i) => (
            <li
              key={r.title}
              className={i === active ? 'on' : ''}
              aria-current={i === active ? 'step' : undefined}
              tabIndex={0}
              onClick={() => go(i)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  go(i)
                }
              }}
            >
              <span className="yr">{YEARS[i]}</span>
              <div>
                <RuleIcon name={RULE_ICONS[r.title]} className="mb-3 size-10 text-(--l-accent)" />
                <h3>{r.title}</h3>
                <p>{r.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

/** Mission plus a sealed twist: the twist is never named before the auction ends. */
export function MissionSection() {
  const m = MISSIONS[DEFAULT_MISSION_ID]
  return (
    <section id="mission" aria-label="Future Mission and Timeline Twist" className="ls">
      <div className="grid gap-5 md:grid-cols-2">
        <article className="lpn" data-reveal>
          <span className="lbl-l">Future Mission</span>
          <h3 className="dh3">{m.objective}</h3>
          <ul>
            {m.constraints.slice(0, 3).map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </article>
        <article className="lpn seal" data-reveal style={order(1)}>
          <span className="lbl-l">Timeline Twist</span>
          <h3 className="dh3">Sealed until your auction ends.</h3>
          <div className="red" aria-hidden="true">
            <i style={{ width: '92%' }} />
            <i style={{ width: '78%' }} />
            <i style={{ width: '85%' }} />
            <i style={{ width: '54%' }} />
          </div>
          <p>Every run faces one timeline twist, drawn at random, and its strength is drawn too. It changes what your technologies are worth, after you have already paid for them.</p>
        </article>
      </div>
    </section>
  )
}

/** Rubric bars grow when revealed; the top three come from real published scores and are hidden when there are none. */
export function ScoreSection() {
  const { leaderboard, event } = useGame()
  const top = useMemo(() => rankRows(leaderboard).slice(0, 3), [leaderboard])
  return (
    <section id="score" aria-labelledby="score-title" className="ls">
      <h2 id="score-title" data-reveal className="dh">Scored out of 100 by judges</h2>
      <div className={`mt-8 grid gap-10 ${top.length ? 'md:grid-cols-[1.2fr_0.8fr]' : ''}`}>
        <div data-reveal>
          {RUBRIC.map((c) => (
            <div className="rb" key={c.id}>
              <span>{c.label}</span>
              <b className="font-mono">{c.max}</b>
              <div>
                <i style={{ width: `${(c.max / 20) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
        {top.length > 0 && <TopThree rows={top} locked={event.settings.leaderboardLocked} />}
      </div>
    </section>
  )
}

function TopThree({ rows, locked }: { rows: (Omit<LeaderRow, 'rank'> & { rank: number })[]; locked: boolean }) {
  return (
    <div className="lpn" data-reveal style={order(1)}>
      <span className="lbl-l">Leaderboard · {locked ? 'final' : 'provisional'}</span>
      <ol className="mt-2">
        {rows.map((r) => (
          <li key={r.submissionId} className="flex items-baseline justify-between gap-4 border-b border-(--l-line) py-3 last:border-0">
            <span className="min-w-0 truncate">
              <span className="mr-3 font-mono text-(--l-faint)">{String(r.rank).padStart(2, '0')}</span>
              <b className="font-semibold">{r.unitName}</b>
            </span>
            <b className="font-mono text-(--l-accent)">{r.total}</b>
          </li>
        ))}
      </ol>
      <a href="#/leaderboard" className="cta mt-4 inline-flex items-center gap-2 rounded-full border border-(--l-line-strong) px-4 py-2 text-[13px] font-semibold hover:border-(--l-fg)">
        Full leaderboard <Arrow />
      </a>
    </div>
  )
}
