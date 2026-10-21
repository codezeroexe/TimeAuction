/**
 * Hero visual: an orbital dial that reads as both a star chart and a clock face across eras.
 * Built as stacked SVG layers so each moving ring is rotated as a whole element by the compositor
 * (no per-frame layout or SVG repaint). Era labels stay still so they are always readable.
 */
const ERAS = [
  { year: '1880', angle: -150 },
  { year: '1960', angle: -92 },
  { year: '1990', angle: -40 },
  { year: '2010', angle: 14 },
  { year: '2040', angle: 72 },
]

const C = 300
const polar = (r: number, deg: number) => {
  const a = (deg * Math.PI) / 180
  return [C + r * Math.cos(a), C + r * Math.sin(a)] as const
}
const arc = (r: number, from: number, to: number) => {
  const [x1, y1] = polar(r, from)
  const [x2, y2] = polar(r, to)
  return `M ${x1} ${y1} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2} ${y2}`
}

const layer = 'absolute inset-0 h-full w-full overflow-visible'

export default function Chronometer({ className = '' }: { className?: string }) {
  const ticks = Array.from({ length: 120 }, (_, i) => i)
  const fine = Array.from({ length: 72 }, (_, i) => i)
  const [nowX, nowY] = polar(232, 14)

  return (
    <div className={`chrono relative aspect-square ${className}`} aria-hidden="true">
      {/* Static frame: rings, era markers, the highlighted Space-Age-to-now span */}
      <svg viewBox="0 0 600 600" className={layer}>
        <defs>
          <radialGradient id="planet" cx="0.36" cy="0.32" r="0.8">
            <stop offset="0" stopColor="var(--l-planet-a)" />
            <stop offset="0.55" stopColor="var(--l-planet-b)" />
            <stop offset="1" stopColor="var(--l-bg)" />
          </radialGradient>
          <radialGradient id="halo">
            <stop offset="0.6" stopColor="var(--l-galaxy)" stopOpacity="0.18" />
            <stop offset="1" stopColor="var(--l-galaxy)" stopOpacity="0" />
          </radialGradient>
        </defs>

        <g fill="none" stroke="var(--l-line)">
          <circle cx={C} cy={C} r="290" strokeDasharray="1 5" />
          <circle cx={C} cy={C} r="270" />
          <circle cx={C} cy={C} r="232" stroke="var(--l-line-strong)" />
        </g>

        {/* Cardinal registration marks on the outer frame */}
        <g stroke="var(--l-line-strong)" strokeWidth="1">
          {[0, 90, 180, 270].map((d) => {
            const [x1, y1] = polar(284, d)
            const [x2, y2] = polar(298, d)
            return <line key={d} x1={x1} y1={y1} x2={x2} y2={y2} />
          })}
        </g>

        <path d={arc(232, -150, 14)} fill="none" stroke="var(--l-accent)" strokeWidth="2" />

        {ERAS.map(({ year, angle }) => {
          const [dx, dy] = polar(232, angle)
          const [lx, ly] = polar(204, angle)
          return (
            <g key={year}>
              <circle cx={dx} cy={dy} r="3.2" fill="var(--l-bg)" stroke="var(--l-accent)" strokeWidth="1.2" />
              <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fill="var(--l-faint)" fontSize="12" letterSpacing="2" fontFamily="var(--font-sans)">
                {year}
              </text>
            </g>
          )
        })}

        {/* Dashed hand that follows the pointer (--ang is set on .chrono by the page) */}
        <g className="phand">
          <line x1={C} y1={C} x2={C} y2="44" stroke="var(--l-cyan)" strokeOpacity="0.55" strokeDasharray="3 6" />
          <circle cx={C} cy="38" r="4.5" fill="var(--l-cyan)" />
        </g>

        <circle cx={nowX} cy={nowY} r="6" fill="var(--l-accent)" />
        <circle cx={nowX} cy={nowY} r="11" fill="none" stroke="var(--l-accent)" strokeOpacity="0.4">
          <animate attributeName="r" values="9;17;9" dur="3s" repeatCount="indefinite" />
          <animate attributeName="stroke-opacity" values=".5;0;.5" dur="3s" repeatCount="indefinite" />
        </circle>

        <circle cx={C} cy={C} r="120" fill="url(#halo)" />
        <circle cx={C} cy={C} r="86" fill="url(#planet)" />
        <ellipse cx={C} cy={C} rx="150" ry="42" fill="none" stroke="var(--l-line-strong)" transform={`rotate(-22 ${C} ${C})`} />
        <ellipse cx={C} cy={C} rx="112" ry="30" fill="none" stroke="var(--l-line)" strokeDasharray="2 5" transform={`rotate(28 ${C} ${C})`} />
        {/* Settlement beacon on the planet */}
        <g transform="translate(272 276)">
          <circle r="2.6" fill="#fff" />
          <circle r="3" fill="none" stroke="#fff">
            <animate attributeName="r" values="3;13" dur="2.4s" repeatCount="indefinite" />
            <animate attributeName="stroke-opacity" values=".8;0" dur="2.4s" repeatCount="indefinite" />
          </circle>
        </g>
      </svg>

      {/* Primary ring: the timeline tick ring, one full turn every 5 s */}
      <svg viewBox="0 0 600 600" className={`${layer} chrono-primary`}>
        <defs>
          <linearGradient id="sweep" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="var(--l-cyan)" stopOpacity="0" />
            <stop offset="1" stopColor="var(--l-cyan)" stopOpacity="0.9" />
          </linearGradient>
        </defs>
        <g stroke="var(--l-line-strong)">
          {ticks.map((i) => {
            const major = i % 10 === 0
            const [x1, y1] = polar(270, i * 3)
            const [x2, y2] = polar(major ? 252 : 262, i * 3)
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={major ? 1.2 : 0.7} />
          })}
        </g>
        {/* Leading marker with a fading trail, so the direction of travel reads at a glance */}
        {Array.from({ length: 10 }, (_, i) => (
          <path key={i} d={arc(270, -64 + i * 6, -58 + i * 6)} fill="none" stroke="var(--l-cyan)" strokeOpacity={0.06 + i * 0.07} strokeWidth="2" />
        ))}
        <path d={`M ${polar(278, 0).join(' ')} L ${polar(270, 3).join(' ')} L ${polar(262, 0).join(' ')} L ${polar(270, -3).join(' ')} Z`} fill="var(--l-cyan)" transform={`rotate(-4 ${C} ${C})`} />
      </svg>

      {/* Secondary ring, counter-rotating slowly */}
      <svg viewBox="0 0 600 600" className={`${layer} chrono-secondary`}>
        <circle cx={C} cy={C} r="180" fill="none" stroke="var(--l-line-strong)" strokeDasharray="1 6" />
        {[0, 120, 240].map((d) => {
          const [x, y] = polar(180, d)
          return <circle key={d} cx={x} cy={y} r="2.4" fill="var(--l-accent)" />
        })}
      </svg>

      {/* Inner fine-tick ring */}
      <svg viewBox="0 0 600 600" className={`${layer} chrono-inner`}>
        <circle cx={C} cy={C} r="130" fill="none" stroke="var(--l-line)" />
        <g stroke="var(--l-line-strong)" strokeWidth="0.7">
          {fine.map((i) => {
            const [x1, y1] = polar(130, i * 5)
            const [x2, y2] = polar(i % 6 === 0 ? 122 : 126, i * 5)
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />
          })}
        </g>
      </svg>

      {/* Satellites on the two tilted orbits. Each orbit is a circle squashed into an ellipse;
          the satellite counter-rotates and un-squashes so it stays round. Pure transforms. */}
      <Orbit tilt={-22} squash={42 / 150} radius={150} size={14} period="chrono-orbit-a" />
      <Orbit tilt={28} squash={30 / 112} radius={112} size={8} period="chrono-orbit-b" />
    </div>
  )
}

function Orbit({ tilt, squash, radius, size, period }: { tilt: number; squash: number; radius: number; size: number; period: string }) {
  const pct = (v: number) => `${(v / 600) * 100}%`
  return (
    <div className="absolute inset-0" style={{ transform: `rotate(${tilt}deg) scaleY(${squash})` }}>
      <div className={`chrono-orbit absolute inset-0 ${period}`}>
        <div className="absolute" style={{ left: pct(C + radius - size / 2), top: pct(C - size / 2), width: pct(size), height: pct(size) }}>
          <div className={`chrono-orbit-body h-full w-full ${period}`} style={{ ['--squash' as string]: 1 / squash }}>
            <span className="block h-full w-full rounded-full bg-(--l-planet-a) shadow-[0_0_0_1px_var(--l-bg)]" />
          </div>
        </div>
      </div>
    </div>
  )
}
