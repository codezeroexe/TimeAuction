import type { Body } from './shared.ts'
import { cssVar } from './shared.ts'

/** Twist art, batch 5. Styles: batch5.css. */

/** Ten manuals; 8 go blank, books 2 and 7 stay. */
function LostKnowledge() {
  return (
    <>
      <line className="lk-shelf" x1="8" y1="140" x2="112" y2="140" />
      {Array.from({ length: 10 }, (_, i) => {
        const x = 11 + i * 10
        const h = 64 + ((i * 7) % 5) * 6
        const keep = i === 2 || i === 7
        return (
          <g key={i} className={keep ? 'lk-b' : 'lk-b lk-lost'} style={cssVar(i)}>
            <rect className="lk-bk" x={x} y={139 - h} width="8" height={h} rx="1" />
            <path className="lk-ln" d={`M${x + 4} ${139 - h + 8}v${h - 30}M${x + 1.5} ${139 - 12}h5`} />
          </g>
        )
      })}
    </>
  )
}

/** Bone cross-section with 30 density dots; 9 fade (30%). */
function LowGravityHealth() {
  return (
    <>
      <ellipse className="lg-bone" cx="60" cy="100" rx="46" ry="62" />
      <ellipse className="lg-core" cx="60" cy="100" rx="38" ry="54" />
      {Array.from({ length: 30 }, (_, i) => {
        const r = Math.sqrt((i + 0.5) / 30)
        const a = i * 2.39996
        const lost = i % 10 === 1 || i % 10 === 4 || i % 10 === 8
        return (
          <circle
            key={i}
            className={lost ? 'lg-d lg-lost' : 'lg-d'}
            style={cssVar(i)}
            cx={60 + 30 * r * Math.cos(a)}
            cy={100 + 46 * r * Math.sin(a)}
            r="3.5"
          />
        )
      })}
    </>
  )
}

/** Habitat with 12 residents; a ship docks and 40 more arrive (52 dots, 4 x 13). */
function RefugeeShip() {
  return (
    <>
      <rect className="rs-hab" x="40" y="14" width="70" height="172" rx="4" />
      {Array.from({ length: 52 }, (_, i) => (
        <circle
          key={i}
          className={i < 12 ? 'rs-p' : 'rs-p rs-new'}
          style={cssVar(Math.max(0, i - 12))}
          cx={52 + (i % 4) * 16}
          cy={26 + Math.floor(i / 4) * 12.5}
          r="4"
        />
      ))}
      <g className="rs-ship">
        <path className="rs-hull" d="M9 100l18-9h8v18h-8z" />
        <path className="rs-dmg" d="M16 96l4 5-4 4" />
        <line className="rs-dock" x1="35" y1="100" x2="40" y2="100" />
      </g>
    </>
  )
}

/** Station, tether, ground; the tether snaps, the lower part falls, capacity bar drops to 10%. */
function SkyElevatorCollapse() {
  return (
    <>
      <rect className="se-stn" x="22" y="12" width="36" height="12" rx="2" />
      <line className="se-up" x1="40" y1="24" x2="40" y2="84" />
      {[0, 1, 2, 3].map((i) => (
        <line key={i} className="se-seg" style={cssVar(i)} x1="40" y1={92 + i * 20} x2="40" y2={108 + i * 20} />
      ))}
      <path className="se-snap" d="M34 83l6 5-6 4 6 4" />
      <line className="se-gnd" x1="8" y1="184" x2="72" y2="184" />
      <rect className="se-track" x="88" y="30" width="18" height="140" rx="2" />
      <rect className="se-fill" x="88" y="30" width="18" height="140" rx="2" />
    </>
  )
}

const STARS = [
  [34, 78],
  [44, 118],
  [30, 104],
  [48, 92],
  [38, 132],
  [52, 70],
  [26, 118],
] as const

/** 24 h dial; the dark sector sweeps from half to full and stars come out. */
function LongNight() {
  return (
    <>
      <circle className="ln-day" cx="60" cy="100" r="44" />
      <circle className="ln-dark" cx="60" cy="100" r="22" pathLength={24} transform="rotate(-90 60 100)" />
      {STARS.map(([x, y], i) => (
        <path key={i} className="ln-star" style={cssVar(i)} d={`M${x - 2.5} ${y}h5M${x} ${y - 2.5}v5`} />
      ))}
      <circle className="ln-rim" cx="60" cy="100" r="44" />
      {Array.from({ length: 24 }, (_, i) => {
        const a = (i * Math.PI) / 12
        const r2 = i % 6 === 0 ? 54 : 49
        return <line key={i} className="ln-tk" x1={60 + 45 * Math.sin(a)} y1={100 - 45 * Math.cos(a)} x2={60 + r2 * Math.sin(a)} y2={100 - r2 * Math.cos(a)} />
      })}
    </>
  )
}

export const BATCH_5: Record<string, Body> = {
  'lost-knowledge': LostKnowledge,
  'low-gravity-health': LowGravityHealth,
  'refugee-ship': RefugeeShip,
  'sky-elevator-collapse': SkyElevatorCollapse,
  'long-night': LongNight,
}
