import type { CSSProperties } from 'react'
import { cssVar, type Body } from './shared.ts'

/** Twist art, batch 4. Styles: batch4.css. */

/** corporate-takeover: five blueprint sections, four get locked (c), one stays open (20% modifiable). */
function Takeover() {
  return (
    <>
      {Array.from({ length: 5 }, (_, i) => {
        const y = 12 + i * 36
        const locked = i < 4
        return (
          <g key={i} className={locked ? 'ct-s ct-lk' : 'ct-s'} style={cssVar(i)}>
            <rect className="ct-r" x="12" y={y} width="96" height="32" rx="2" />
            <path className="ct-l" d={`M20 ${y + 9}h24M20 ${y + 16}h16M20 ${y + 23}h22M76 ${y + 9}h24M84 ${y + 16}h16M78 ${y + 23}h22`} />
            {locked && (
              <g className="ct-k">
                <path className="ct-sh" d={`M54 ${y + 15}v-4a6 6 0 0 1 12 0v4`} />
                <rect className="ct-b" x="50" y={y + 15} width="20" height="14" rx="2" />
                <text className="t ct-c" x="60" y={y + 26} textAnchor="middle">
                  ©
                </text>
              </g>
            )}
          </g>
        )
      })}
    </>
  )
}

/** cyberattack: 12 nodes; red spreads link by link from node 0. */
const CY_NODES: [number, number][] = [
  [60, 18], [28, 42], [92, 42], [18, 78], [58, 70], [100, 78],
  [36, 112], [80, 112], [18, 146], [58, 140], [100, 146], [60, 180],
]
const CY_EDGES: [number, number][] = [
  [0, 1], [0, 2], [0, 4], [1, 3], [1, 4], [2, 4], [2, 5], [3, 6], [4, 6], [4, 7], [5, 7],
  [6, 8], [6, 9], [7, 9], [7, 10], [8, 9], [9, 10], [8, 11], [9, 11], [10, 11],
]
const CY_ORDER = [0, 1, 2, 4, 3, 5, 6, 7, 8, 9, 10, 11]
const cyRank = (n: number) => CY_ORDER.indexOf(n)

function Cyber() {
  return (
    <>
      {CY_EDGES.map(([a, b]) => (
        <line key={`${a}-${b}`} className="cy-e" style={cssVar(Math.max(cyRank(a), cyRank(b)))} x1={CY_NODES[a][0]} y1={CY_NODES[a][1]} x2={CY_NODES[b][0]} y2={CY_NODES[b][1]} />
      ))}
      {CY_NODES.map(([x, y], n) => (
        <circle key={n} className="cy-n" style={cssVar(cyRank(n))} cx={x} cy={y} r="7" />
      ))}
    </>
  )
}

/** crop-blight: 12 stalks (4 x 3); spots show, then each wilts and falls. */
function Blight() {
  return (
    <>
      {Array.from({ length: 12 }, (_, i) => {
        const x = 21 + (i % 4) * 26
        const y = 60 + Math.floor(i / 4) * 50
        const dir = i % 4 < 2 ? 1 : -1
        return (
          <g key={i} transform={`translate(${x} ${y})`}>
            <line className="cb-g" x1="-10" x2="10" y1="0" y2="0" />
            <g className="cb-p" style={{ ...cssVar(i), '--rot': `${dir * 70}deg` } as CSSProperties}>
              <path className="cb-s" d="M0 0V-28M0 -10q-7-2-9-9M0 -16q7-2 9-9" />
              <ellipse className="cb-h" cx="0" cy="-31" rx="3.5" ry="4" />
              <circle className="cb-x" cx="0" cy="-8" r="2" />
              <circle className="cb-x" cx="0" cy="-20" r="2" />
              <circle className="cb-x" cx="-7" cy="-17" r="1.6" />
            </g>
          </g>
        )
      })}
    </>
  )
}

/** ice-runs-dry: dashed outline = mapped deposit; the cyan ice scales to 30% of its area (sqrt .3 linear). */
const ICE = 'M60 14C88 12 110 36 106 70C114 100 104 150 80 176C60 192 30 186 20 160C8 130 16 90 14 60C16 34 34 16 60 14Z'

function Ice() {
  return (
    <>
      <path className="ir-o" d={ICE} />
      <path className="ir-i" d={ICE} />
    </>
  )
}

/** power-grid-cascade: 4 x 5 bulbs, failure snakes along the wires; the last 3 stay lit (15%). */
const PG_X = [20, 47, 73, 100]
const PG_Y = [20, 59, 98, 137, 176]
const pgRank = (c: number, r: number) => r * 4 + (r % 2 ? 3 - c : c)

function Grid() {
  const wires: { k: string; x1: number; y1: number; x2: number; y2: number; rank: number }[] = []
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 4; c++) {
      if (c < 3) wires.push({ k: `h${c}${r}`, x1: PG_X[c], y1: PG_Y[r], x2: PG_X[c + 1], y2: PG_Y[r], rank: Math.max(pgRank(c, r), pgRank(c + 1, r)) })
      if (r < 4) wires.push({ k: `v${c}${r}`, x1: PG_X[c], y1: PG_Y[r], x2: PG_X[c], y2: PG_Y[r + 1], rank: Math.max(pgRank(c, r), pgRank(c, r + 1)) })
    }
  return (
    <>
      {wires.map(({ k, rank, ...l }) => (
        <line key={k} className={rank >= 17 ? 'pg-w' : 'pg-w pg-d'} style={cssVar(rank)} {...l} />
      ))}
      {PG_Y.flatMap((y, r) =>
        PG_X.map((x, c) => {
          const rank = pgRank(c, r)
          return <circle key={`${c}${r}`} className={rank >= 17 ? 'pg-b' : 'pg-b pg-d'} style={cssVar(rank)} cx={x} cy={y} r="7" />
        }),
      )}
    </>
  )
}

export const BATCH_4: Record<string, Body> = {
  'corporate-takeover': Takeover,
  cyberattack: Cyber,
  'crop-blight': Blight,
  'ice-runs-dry': Ice,
  'power-grid-cascade': Grid,
}
