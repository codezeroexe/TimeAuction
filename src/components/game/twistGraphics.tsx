import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { cssVar, type Body } from './twistArt/shared.ts'
import { BATCH_1 } from './twistArt/batch1.tsx'
import { BATCH_2 } from './twistArt/batch2.tsx'
import { BATCH_3 } from './twistArt/batch3.tsx'
import { BATCH_4 } from './twistArt/batch4.tsx'
import { BATCH_5 } from './twistArt/batch5.tsx'
import TechIcon from './TechIcon.tsx'
import { Tag } from './bits.tsx'
import { calm, countUp } from '../ui/motion.ts'
import { SFX } from '../ui/sfx.ts'
import { TECHNOLOGIES } from '../../data/technologies.ts'
import { netShift, twistStrength, valuesForRun, type Twist } from '../../data/scenario.ts'

/** Bespoke graphics for every timeline twist (five here, the rest in ./twistArt); a twist without art gets the generic gauge. viewBox 0 0 120 200. Styling lives under `.tg` in index.css. */

const START_MS = 400
const COUNT_MS = 2600

function Water({ uid }: { uid: string }) {
  return (
    <>
      <defs>
        <clipPath id={`${uid}-clip`}>
          <rect x="12" y="10" width="96" height="180" />
        </clipPath>
      </defs>
      <rect className="frame" x="12" y="10" width="96" height="180" />
      <g clipPath={`url(#${uid}-clip)`}>
        <rect className="water" x="12" y="12" width="96" height="178" />
      </g>
      {[0, 1, 2, 3, 4].map((i) => (
        <line key={i} className="tick" x1="12" x2={i % 2 ? 26 : 34} y1={10 + i * 45} y2={10 + i * 45} />
      ))}
    </>
  )
}

const FLARES = [
  [38, 14, 66, 20, 92, 40],
  [38, 24, 70, 30, 100, 54],
  [36, 34, 68, 44, 98, 66],
] as const

function Superstorm() {
  return (
    <>
      <circle className="sun" cx="20" cy="24" r="14" />
      {FLARES.map(([a, b, c, d, e, f], i) => (
        <path key={i} className="flare" pathLength={1} style={cssVar(i)} d={`M${a} ${b}Q${c + 6} ${d - 14} ${e} ${f}`} />
      ))}
      {Array.from({ length: 24 }, (_, i) => {
        const x = 27 + (i % 4) * 20
        const y = 78 + Math.floor(i / 4) * 19
        return (
          <g key={i} style={cssVar(i)}>
            <rect className="sat" x={x} y={y} width="6" height="6" rx="1" />
            <path className="sx" d={`M${x + 1} ${y + 1}l4 4M${x + 5} ${y + 1}l-4 4`} />
          </g>
        )
      })}
    </>
  )
}

/** Symbol, bar fill (share left), and the tail of a jagged crack path that starts at x = 50 + i * 14. */
const TILES = [
  { sym: 'Li', pct: 8, tail: 'l6 12-8 10 9 12-5 10' },
  { sym: 'Co', pct: 15, tail: 'l5 10-7 12 8 10-4 10' },
  { sym: 'Nd', pct: 12, tail: 'l6 11-9 11 8 12-4 9' },
]

function Metals() {
  return (
    <>
      {TILES.map(({ sym, pct, tail }, i) => (
        <g key={sym} transform={`translate(0 ${12 + i * 62})`} style={cssVar(i)}>
          <rect className="tile" x="10" y="0" width="100" height="52" rx="3" />
          <text className="t" x="18" y="16">
            {sym}
          </text>
          <rect className="mb" x="18" y="26" width="84" height="14" rx="2" style={{ '--to': pct / 100 } as CSSProperties} />
          <path className="crack" pathLength={1} d={`M${50 + i * 14} 8${tail}`} />
        </g>
      ))}
    </>
  )
}

function Crew() {
  return (
    <>
      {Array.from({ length: 12 }, (_, i) => {
        const cx = 24 + (i % 3) * 36
        const y = 14 + Math.floor(i / 3) * 44
        const lost = i % 2 === 0
        return (
          <g key={i} className={`pp${lost ? ' lost' : ''}`} style={cssVar(i)}>
            <g className="g">
              <circle cx={cx} cy={y + 6} r="6" />
              <rect x={cx - 8} y={y + 15} width="16" height="15" rx="5" />
            </g>
            <rect className="ring" x={cx - 13} y={y - 3} width="26" height="36" rx="6" />
            <line className="strike" x1={cx - 13} y1={y + 33} x2={cx + 13} y2={y - 3} />
          </g>
        )
      })}
    </>
  )
}

function Silence() {
  return (
    <>
      <circle className="earth" cx="50" cy="28" r="18" />
      <path d="M38 22q8-6 14 0t6 8M40 36q6 2 10-2" fill="none" stroke="var(--color-surface)" strokeWidth="2" strokeLinecap="round" opacity=".7" />
      <line className="sig" x1="50" y1="52" x2="50" y2="150" />
      <circle className="mars" cx="50" cy="168" r="14" />
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} className="sb" style={cssVar(i)} x={80 + i * 9} y={180 - (10 + i * 8)} width="5" height={10 + i * 8} rx="1" />
      ))}
    </>
  )
}

/** Generic fallback: a vertical gauge that drains or fills from metric.from to metric.value. */
function Gauge({ from, to }: { from: number; to: number }) {
  return (
    <>
      <rect className="frame" x="12" y="10" width="96" height="180" />
      <rect className="track" x="34" y="26" width="52" height="150" rx="3" />
      <rect className="gauge" x="34" y="26" width="52" height="150" rx="3" style={{ '--from': from, '--to': to } as CSSProperties} />
      {[0, 1, 2, 3, 4].map((i) => (
        <line key={i} className="tick" x1="12" x2={i % 2 ? 22 : 30} y1={26 + i * 37.5} y2={26 + i * 37.5} />
      ))}
    </>
  )
}

const BODIES: Record<string, Body> = {
  'water-crisis': Water,
  'solar-superstorm': Superstorm,
  'metal-shortage': Metals,
  'crew-shortage': Crew,
  'earth-silence': Silence,
  ...BATCH_1,
  ...BATCH_2,
  ...BATCH_3,
  ...BATCH_4,
  ...BATCH_5,
}

/** Position of x on the gauge: the range always includes 0, and never has zero width. */
function fraction(x: number, lo: number, hi: number) {
  const a = Math.min(0, lo)
  const b = Math.max(0, hi, a + 1)
  return (x - a) / (b - a)
}

const sign = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n) + '%'
const tone = (n: number) => (n > 0 ? 'success' : n < 0 ? 'danger' : 'neutral') as 'success' | 'danger' | 'neutral'

/** Illustrative figure: the graphic animates once, then a counter runs from metric.from to metric.value. */
export function TwistGraphic({ twist }: { twist: Twist }) {
  const uid = useId().replace(/:/g, '')
  // React owns the end state, so a re-render or remount never drops it.
  const [go, setGo] = useState(false)
  const num = useRef<HTMLDivElement>(null)
  const { from, value, unit, label } = twist.metric
  const Body = BODIES[twist.id] ?? Gauge
  const lo = Math.min(from, value)
  const hi = Math.max(from, value)

  useEffect(() => {
    SFX.alert()
    const play = () => {
      setGo(true)
      countUp(num.current, value, COUNT_MS, unit, from)
    }
    if (calm()) {
      play()
      return
    }
    const t = setTimeout(play, START_MS)
    return () => clearTimeout(t)
  }, [from, value, unit])

  return (
    <figure className="m-0 w-full max-w-[200px] justify-self-center text-center">
      <svg viewBox="0 0 120 200" className={go ? 'tg go' : 'tg'} role="img" aria-label={`${twist.caption} ${from}${unit} falling to ${value}${unit} ${label}`}>
        <Body uid={uid} from={fraction(from, lo, hi)} to={fraction(value, lo, hi)} />
      </svg>
      <div ref={num} className="mt-2.5 font-mono text-[26px] text-danger tabular-nums" aria-hidden="true">
        {from}
        {unit}
      </div>
      <div className="lbl">{label}</div>
      <figcaption className="mt-2 text-sm text-muted">{twist.caption}</figcaption>
    </figure>
  )
}

/** Per-technology effect of a twist for this run, for the technologies auctioned in the match (`techIds`, lot order). `owned` rows are highlighted; the net line is hidden when nothing is owned. */
export function TwistValues({ twist, runId, techIds, owned, ownTag = 'Yours' }: { twist: Twist; runId: string; techIds: string[]; owned: string[]; ownTag?: string }) {
  const values = valuesForRun(twist, runId)
  const net = netShift(twist, owned, twistStrength(runId))
  return (
    <div className="@container mt-3 overflow-hidden rounded-[10px] border border-line bg-surface">
      <ul className="divide-y divide-line">
        {TECHNOLOGIES.filter((t) => techIds.includes(t.id)).sort((a, b) => techIds.indexOf(a.id) - techIds.indexOf(b.id)).map((t) => {
          const v = values[t.id]
          const mine = owned.includes(t.id)
          return (
            <li
              key={t.id}
              className={`grid gap-x-3 gap-y-0.5 px-4 py-2 @sm:grid-cols-[minmax(110px,1fr)_64px_minmax(0,1.8fr)] @sm:items-center @sm:gap-x-3 ${mine ? 'bg-accent-soft shadow-[inset_3px_0_0_var(--color-accent)]' : ''}`}
            >
              <div className="flex flex-wrap items-center gap-2 text-[15px] font-semibold">
                <TechIcon name={t.icon} className="h-4 w-4 text-accent" />
                {t.name}
                {mine && <Tag tone="accent">{ownTag}</Tag>}
              </div>
              <span className="justify-self-start">
                <Tag tone={v ? tone(v.delta) : 'neutral'}>{v ? sign(v.delta) : '—'}</Tag>
              </span>
              <p title={v?.reason} className="line-clamp-2 text-sm leading-snug text-ink-soft">{v?.reason}</p>
            </li>
          )
        })}
      </ul>
      {owned.length > 0 && (
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-line-strong bg-paper px-4 py-2.5">
          <b className={`font-mono text-[15px] font-medium ${net > 0 ? 'text-success' : net < 0 ? 'text-danger' : 'text-muted'}`}>
            Twist shift: net {sign(net)} across your technologies
          </b>
          <span className="text-[13px] text-muted">Illustrative, not scored</span>
        </div>
      )}
    </div>
  )
}
