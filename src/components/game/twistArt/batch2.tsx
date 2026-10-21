import type { Body } from './shared.ts'
import { cssVar } from './shared.ts'

/** Twist art, batch 2. Styles: batch2.css. */

/** Seismograph: calm trace with 12 blips fades under a dense jagged trace drawn over it. */
function QuakeSwarm() {
  const calm = Array.from({ length: 12 }, (_, i) => `L${14 + i * 8} 70l2 ${i % 2 ? 7 : -7}l2 ${i % 2 ? -7 : 7}`).join('')
  const dense = Array.from({ length: 45 }, (_, i) => {
    const amp = 8 + ((i * 37) % 7) * 6
    return `L${14 + i * 2.1} ${70 + (i % 2 ? amp : -amp)}`
  }).join('')
  return (
    <>
      <rect className="qs-frame" x="12" y="20" width="96" height="100" />
      <line className="qs-base" x1="12" y1="70" x2="108" y2="70" />
      <path className="qs-calm" d={`M12 70${calm}L108 70`} />
      <path className="qs-dense" pathLength={1} d={`M12 70${dense}L108 70`} />
      <path className="qs-ground" d="M10 150H44l6 5 8-6 6 6 6-5H110" />
      <path className="qs-crack" pathLength={1} d="M56 149l-4 14 8 8-5 12 6 8" />
    </>
  )
}

/** Dome with a crack, bubbles leaving it, and a 0-25 gauge (21 -> 15). */
function OxygenLeak() {
  return (
    <>
      <path className="ol-dome" d="M12 150A38 70 0 0 1 88 150Z" />
      <rect className="ol-base" x="8" y="150" width="84" height="12" />
      <path className="ol-crack" d="M70 98l-5 9 7 6-6 10" />
      {[0, 1, 2, 3, 4].map((i) => (
        <circle key={i} className="ol-b" style={cssVar(i)} cx={72 + (i % 2) * 6} cy="98" r={2 + (i % 3)} />
      ))}
      <rect className="ol-track" x="98" y="20" width="10" height="160" />
      <rect className="ol-fill" x="98" y="20" width="10" height="160" />
      {[0, 5, 10, 15, 20, 25].map((v) => (
        <line key={v} className="ol-tick" x1="94" x2="98" y1={180 - v * 6.4} y2={180 - v * 6.4} />
      ))}
    </>
  )
}

const TRACES = [58, 70, 82, 94, 106, 118, 130, 142]

/** Robot head whose circuit traces go dark one by one, then a RECALLED tag. */
function AiRecall() {
  return (
    <>
      <line className="ai-ant" x1="60" y1="24" x2="60" y2="38" />
      <circle className="ai-lit ai-tip" style={cssVar(8)} cx="60" cy="20" r="4" />
      <rect className="ai-head" x="32" y="38" width="56" height="62" rx="8" />
      <circle className="ai-lit" style={cssVar(9)} cx="48" cy="62" r="6" />
      <circle className="ai-lit" style={cssVar(9)} cx="72" cy="62" r="6" />
      <path className="ai-mouth" d="M46 84H74" />
      {TRACES.slice(0, 4).map((y, i) => (
        <path key={y} className="ai-lit ai-tr" style={cssVar(i * 2)} d={`M32 ${y - 14}H22l-6 6V${y - 8}`} />
      ))}
      {TRACES.slice(0, 4).map((y, i) => (
        <path key={y} className="ai-lit ai-tr" style={cssVar(i * 2 + 1)} d={`M88 ${y - 14}H98l6 6V${y - 8}`} />
      ))}
      <g className="ai-tag">
        <rect x="22" y="130" width="76" height="26" rx="3" />
        <text className="t" x="60" y="147" textAnchor="middle">
          RECALLED
        </text>
      </g>
    </>
  )
}

const person = (cx: number, y: number) => (
  <>
    <circle cx={cx} cy={y + 5} r="4" />
    <rect x={cx - 5} y={y + 11} width="10" height="14" rx="3" />
  </>
)

/** 12 bunks holding 12 settlers; 12 more arrive and overflow outside. */
function PopulationBoom() {
  return (
    <>
      <rect className="pb-wall" x="10" y="8" width="58" height="184" />
      {Array.from({ length: 12 }, (_, i) => {
        const x = 12 + (i % 3) * 19
        const y = 14 + Math.floor(i / 3) * 44
        return (
          <g key={i}>
            <rect className="pb-slot" x={x} y={y} width="17" height="38" rx="2" />
            <g className="pb-old">{person(x + 8.5, y + 6)}</g>
          </g>
        )
      })}
      {Array.from({ length: 12 }, (_, i) => (
        <g key={i} className="pb-new" style={cssVar(i)}>
          {person(81 + (i % 2) * 19, 14 + Math.floor(i / 2) * 30)}
        </g>
      ))}
    </>
  )
}

const tY = (v: number) => 24 - (v / 140) * 136

/** Thermometer (0 to -140, mercury -60 -> -120) next to a frosting window. */
function ColdSnap() {
  return (
    <>
      <rect className="cs-tube" x="28" y="24" width="12" height="136" rx="6" />
      <rect className="cs-hg" x="31" y="24" width="6" height="136" />
      <circle className="cs-bulb" cx="34" cy="172" r="12" />
      {[0, -20, -40, -60, -80, -100, -120, -140].map((v) => (
        <line key={v} className={v % 60 ? 'cs-tick' : 'cs-tick cs-big'} x1="44" x2={v % 60 ? 50 : 56} y1={tY(v)} y2={tY(v)} />
      ))}
      <rect className="cs-pane" x="66" y="40" width="42" height="110" />
      <path className="cs-mull" d="M87 40V150M66 95H108" />
      <path className="cs-frost" pathLength={1} style={cssVar(0)} d="M66 40l10 8-2 10 8 6M66 150l10-8-2-10 8-6M108 40l-10 8 2 10-8 6M108 150l-10-8 2-10-8-6M66 95l12 2 4-6M108 95l-12 2-4-6" />
      <path className="cs-frost" pathLength={1} style={cssVar(1)} d="M87 40l-2 12 7 6M87 150l-2-12 7-6M87 95l4 10-3 8" />
    </>
  )
}

export const BATCH_2: Record<string, Body> = {
  'quake-swarm': QuakeSwarm,
  'oxygen-leak': OxygenLeak,
  'ai-recall': AiRecall,
  'population-boom': PopulationBoom,
  'cold-snap': ColdSnap,
}
