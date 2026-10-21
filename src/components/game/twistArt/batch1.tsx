import type { CSSProperties } from 'react'
import { cssVar, type Body } from './shared.ts'

/** Twist art, batch 1. Styles: batch1.css. */

/** Sun with 10 rays behind 4 dust bands: 9 rays fade, 1 (10%) stays. */
function DustWinter() {
  return (
    <>
      <circle className="dw-sun" cx="60" cy="50" r="14" />
      {Array.from({ length: 10 }, (_, i) => (
        <line key={i} className={i === 0 ? 'dw-ray' : 'dw-ray dw-off'} style={cssVar(i)} x1="60" y1="70" x2="60" y2="86" transform={`rotate(${i * 36} 60 50)`} />
      ))}
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} className="dw-band" style={{ ...cssVar(i), '--dx': `${i % 2 ? 40 : -40}px` } as CSSProperties} x="8" y={102 + i * 22} width="104" height="14" rx="7" />
      ))}
    </>
  )
}

/** 10 crew: the first 4 keep working, the other 6 move into a dashed isolation ward. */
function PandemicAboard() {
  return (
    <>
      <rect className="pa-ward" x="14" y="112" width="92" height="76" rx="4" />
      {Array.from({ length: 10 }, (_, i) => {
        const cx = 20 + (i % 5) * 20
        const y = 22 + Math.floor(i / 5) * 40
        const sick = i >= 4
        const k = i - 4
        const dx = sick ? 34 + (k % 3) * 26 - cx : 0
        const dy = sick ? 124 + Math.floor(k / 3) * 34 - y : 0
        return (
          <g key={i} className={sick ? 'pa-p pa-sick' : 'pa-p'} style={{ ...cssVar(k), '--dx': `${dx}px`, '--dy': `${dy}px` } as CSSProperties}>
            <circle cx={cx} cy={y + 5} r="5" />
            <rect x={cx - 6} y={y + 12} width="12" height="14" rx="4" />
          </g>
        )
      })}
    </>
  )
}

/** Dome with atom and 5 licence cards; BANNED stamps over the dome and voids every card. */
function ReactorBan() {
  return (
    <>
      <path className="rb-dome" d="M20 120A40 40 0 0 1 100 120Z" />
      <rect className="rb-base" x="14" y="120" width="92" height="10" />
      <g className="rb-atom">
        {[0, 60, 120].map((r) => (
          <ellipse key={r} cx="60" cy="104" rx="15" ry="5.5" transform={`rotate(${r} 60 104)`} />
        ))}
        <circle className="rb-nuc" cx="60" cy="104" r="3" />
      </g>
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i} className="rb-card" style={cssVar(i)}>
          <rect x={14 + i * 19} y="150" width="16" height="28" rx="2" />
          <path d={`M${17 + i * 19} 157h10M${17 + i * 19} 163h10`} />
          <line className="rb-void" x1={14 + i * 19} y1="178" x2={30 + i * 19} y2="150" />
        </g>
      ))}
      <g transform="rotate(-10 60 104)">
        <g className="rb-stamp">
          <rect x="8" y="93" width="104" height="22" rx="2" />
          <text className="t" x="60" y="108" textAnchor="middle">
            BANNED
          </text>
        </g>
      </g>
    </>
  )
}

/** 4x5 soil cells: 19 turn red-hatched, 1 stays safe. */
const SAFE_CELL = 13
function RegolithToxic() {
  return (
    <>
      <line className="rt-top" x1="8" y1="14" x2="112" y2="14" />
      {Array.from({ length: 20 }, (_, i) => {
        const x = 13 + (i % 4) * 24
        const y = 20 + Math.floor(i / 4) * 29
        const safe = i === SAFE_CELL
        return (
          <g key={i} className={safe ? 'rt-c rt-safe' : 'rt-c'} style={cssVar((i * 7) % 20)}>
            <rect x={x} y={y} width="22" height="26" rx="2" />
            {!safe && <path className="rt-h" d={`M${x + 3} ${y + 23}L${x + 19} ${y + 3}M${x + 3} ${y + 11}L${x + 11} ${y + 3}M${x + 11} ${y + 23}L${x + 19} ${y + 11}`} />}
          </g>
        )
      })}
    </>
  )
}

/** Earth–Mars orbits; the cyan launch window slides past the rocket and the 26 month ticks empty. */
function LaunchWindowMissed() {
  return (
    <>
      <circle className="lw-orbit" cx="60" cy="72" r="24" />
      <circle className="lw-orbit" cx="60" cy="72" r="46" />
      <circle className="lw-sun" cx="60" cy="72" r="5" />
      <circle className="lw-mars" cx="26" cy="46" r="5" />
      <path className="lw-arc" d="M71.9 116.4A46 46 0 0 1 48.1 116.4" />
      <circle className="lw-earth" cx="60" cy="96" r="5" />
      <path className="lw-rocket" d="M60 112L56 102h8ZM58 99h4v3h-4Z" />
      {Array.from({ length: 26 }, (_, i) => (
        <line key={i} className="lw-m" style={cssVar(25 - i)} x1={13 + i * 3.7} y1="150" x2={13 + i * 3.7} y2="172" />
      ))}
    </>
  )
}

export const BATCH_1: Record<string, Body> = {
  'dust-winter': DustWinter,
  'pandemic-aboard': PandemicAboard,
  'reactor-ban': ReactorBan,
  'regolith-toxic': RegolithToxic,
  'launch-window-missed': LaunchWindowMissed,
}
