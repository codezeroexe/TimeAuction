import type { Body } from './shared.ts'
import { cssVar } from './shared.ts'

/** Twist art, batch 3. Styles: batch3.css. */

/** Fuel tank (fill drains to 12%) with a rocket flame that shrinks. */
const FuelFamine: Body = ({ uid }) => (
  <>
    <defs>
      <clipPath id={`${uid}-ff`}>
        <rect x="32" y="22" width="56" height="116" rx="6" />
      </clipPath>
    </defs>
    <rect className="ff-tank" x="30" y="20" width="60" height="120" rx="8" />
    <g clipPath={`url(#${uid}-ff)`}>
      <rect className="ff-fill" x="32" y="22" width="56" height="116" />
    </g>
    {[0.25, 0.5, 0.75].map((f) => (
      <line key={f} className="ff-tick" x1="30" x2="40" y1={138 - 116 * f} y2={138 - 116 * f} />
    ))}
    <line className="ff-mark" x1="22" x2="98" y1={138 - 116 * 0.12} y2={138 - 116 * 0.12} />
    <rect className="ff-noz" x="48" y="140" width="24" height="8" rx="2" />
    <path className="ff-flame" d="M50 150L70 150Q66 176 60 192Q54 176 50 150Z" />
  </>
)

/** Cargo hold of 10 crates; 5 are crossed out and fade. */
const BudgetCut: Body = () => (
  <>
    <rect className="bc-hold" x="10" y="40" width="100" height="120" rx="4" />
    {Array.from({ length: 10 }, (_, i) => {
      const c = i % 5
      const r = Math.floor(i / 5)
      const x = 18 + c * 18
      const y = 56 + r * 48
      const cut = (r + c) % 2 === 0
      return (
        <g key={i} className={`bc-cr${cut ? ' bc-cut' : ''}`} style={cssVar(i)}>
          <g className="bc-box">
            <rect x={x} y={y} width="14" height="34" rx="2" />
            <line x1={x} x2={x + 14} y1={y + 10} y2={y + 10} />
          </g>
          <line className="bc-x" x1={x - 2} y1={y + 36} x2={x + 16} y2={y - 2} />
        </g>
      )
    })}
  </>
)

/** Mars horizon, one dome and flag; a second flag lands and a dashed border appears. */
const SecondColony: Body = () => (
  <>
    <path className="sc-ground" d="M8 150Q60 128 112 150L112 192L8 192Z" />
    <path className="sc-dome" d="M24 144A14 14 0 0 1 52 144Z" />
    <line className="sc-pole" x1="38" y1="130" x2="38" y2="100" />
    <path className="sc-flag sc-f1" d="M38 100L56 106L38 112Z" />
    <line className="sc-border" x1="64" y1="52" x2="64" y2="180" />
    <g className="sc-land">
      <line className="sc-pole2" x1="90" y1="140" x2="90" y2="100" />
      <path className="sc-flag sc-f2" d="M90 100L108 106L90 112Z" />
    </g>
  </>
)

/** Annular sector path for the dome: ring r (0 inner) and sector s of 5 across the half disc. */
function panel(r: number, s: number) {
  const cx = 60
  const cy = 150
  const r0 = 12 + r * 9
  const r1 = r0 + 9
  const a0 = Math.PI - (s * Math.PI) / 5
  const a1 = Math.PI - ((s + 1) * Math.PI) / 5
  const p = (rad: number, a: number) => `${(cx + rad * Math.cos(a)).toFixed(1)} ${(cy - rad * Math.sin(a)).toFixed(1)}`
  return `M${p(r0, a0)}L${p(r1, a0)}A${r1} ${r1} 0 0 1 ${p(r1, a1)}L${p(r0, a1)}A${r0} ${r0} 0 0 0 ${p(r0, a0)}Z`
}

/** Dome of 20 panels; a meteor hits and 13 crack and fall, 7 stay. */
const MeteorStrike: Body = () => (
  <>
    <line className="ms-base" x1="8" y1="152" x2="112" y2="152" />
    {Array.from({ length: 20 }, (_, i) => {
      const r = Math.floor(i / 5)
      const s = i % 5
      const gone = !(s === 0 || (s === 4 && r < 3))
      return (
        <g key={i}>
          {gone && <path className="ms-ghost" style={cssVar(s)} d={panel(r, s)} />}
          <path className={`ms-p${gone ? ' ms-gone' : ''}`} style={cssVar(s)} d={panel(r, s)} />
        </g>
      )
    })}
    <path className="ms-streak" pathLength={1} d="M104 12L66 98" />
    <circle className="ms-rock" cx="66" cy="98" r="5" />
  </>
)

/** 10 system panels with status lights; 4 flip from cyan to red. */
const Sabotage: Body = () => (
  <>
    {Array.from({ length: 10 }, (_, i) => {
      const x = 12 + (i % 2) * 52
      const y = 12 + Math.floor(i / 2) * 36
      const bad = [1, 4, 6, 9].includes(i)
      return (
        <g key={i} className={`sb-p${bad ? ' sb-bad' : ''}`} style={cssVar(i)}>
          <rect className="sb-box" x={x} y={y} width="44" height="28" rx="3" />
          <line className="sb-line" x1={x + 8} x2={x + 26} y1={y + 10} y2={y + 10} />
          <line className="sb-line" x1={x + 8} x2={x + 20} y1={y + 18} y2={y + 18} />
          <circle className="sb-led" cx={x + 35} cy={y + 14} r="5" />
        </g>
      )
    })}
  </>
)

export const BATCH_3: Record<string, Body> = {
  'fuel-famine': FuelFamine,
  'budget-cut': BudgetCut,
  'second-colony-rivalry': SecondColony,
  'meteor-strike': MeteorStrike,
  sabotage: Sabotage,
}
