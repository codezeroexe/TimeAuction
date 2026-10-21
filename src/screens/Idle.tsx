import { useEffect, useState } from 'react'
import Starfield from '../components/landing/Starfield.tsx'
import ShootingStars from '../components/landing/ShootingStars.tsx'
import { calm } from '../components/ui/motion.ts'
import { navigate } from '../state/useRoute.ts'
import './idle.css'

const YEARS = ['1880', '1920', '1960', '1990', '2010', '2040', '2080']
const YEARS_B = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']
const COINS = Array.from({ length: 14 }, (_, i) => ({
  x: `${(i * 37 + 6) % 96}vw`,
  s: `${3.2 + ((i * 13) % 7) * 0.7}vh`,
  d: `${16 + ((i * 7) % 11)}s`,
  delay: `${-((i * 5) % 17)}s`,
  dx: `${((i % 5) - 2) * 4}vw`,
  r: `${(i % 2 ? 1 : -1) * (90 + i * 20)}deg`,
}))

function Ring({ items, className, r }: { items: string[]; className: string; r: number }) {
  return (
    <svg className={`idle-ring ${className}`} viewBox="-500 -500 1000 1000" aria-hidden="true">
      <circle r={r} fill="none" stroke="var(--l-line-strong)" strokeWidth="1.5" />
      <circle r={r - 26} fill="none" stroke="var(--l-line)" strokeDasharray="2 9" />
      {items.map((y, i) => {
        const a = (i / items.length) * 360
        return (
          <g key={y} transform={`rotate(${a}) translate(0 ${-r})`}>
            <circle r="6" fill="var(--l-accent)" />
            <g transform={`rotate(${-a})`}><text y="-24" textAnchor="middle">{y}</text></g>
          </g>
        )
      })}
    </svg>
  )
}

/** Attract screen: any key or click leaves to the landing page. */
export default function Idle() {
  const [leaving, setLeaving] = useState(false)
  const [still, setStill] = useState(false)

  useEffect(() => {
    let timer = 0
    let out = 0
    const wake = () => {
      setStill(false)
      clearTimeout(timer)
      timer = window.setTimeout(() => setStill(true), 2000)
    }
    const go = () => {
      if (out) return
      setLeaving(true)
      out = window.setTimeout(() => navigate('landing'), calm() ? 0 : 400)
    }
    const key = (e: KeyboardEvent) => {
      // Modifiers and browser keys (fullscreen, reload) must not leave the attract screen.
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || ['Control', 'Shift', 'Alt', 'Meta', 'F5', 'F11', 'Escape'].includes(e.key)) return
      go()
    }
    wake()
    window.addEventListener('keydown', key)
    window.addEventListener('pointerdown', go)
    window.addEventListener('mousemove', wake)
    return () => {
      clearTimeout(timer)
      clearTimeout(out)
      window.removeEventListener('keydown', key)
      window.removeEventListener('pointerdown', go)
      window.removeEventListener('mousemove', wake)
    }
  }, [])

  return (
    <div role="region" aria-label="TimeAuction attract screen" className={`landing idle${still ? ' idle-hide-cursor' : ''}${leaving ? ' idle-leave' : ''}`}>
      <Starfield />
      <ShootingStars className="idle-shots" />
      <div className="idle-coins" aria-hidden="true">
        {COINS.map((c, i) => (
          <i key={i} className="idle-coin" style={{ '--x': c.x, '--s': c.s, '--d': c.d, '--delay': c.delay, '--dx': c.dx, '--r': c.r } as React.CSSProperties}>CC</i>
        ))}
      </div>
      <div aria-hidden="true">
        <Ring items={YEARS} className="" r={440} />
        <Ring items={YEARS_B} className="idle-ring-b" r={440} />
      </div>
      <div className="idle-center">
        <div>
          <p className="idle-eyebrow">Engineering Across Time</p>
          <span className="idle-title font-display leading-none tracking-[0.02em]"><span className="idle-shine">Time<em>Auction</em></span></span>
          <div className="idle-tag" aria-live="off">
            <span>Bid across <em>eras.</em></span>
            <span>Survive the <em>Timeline Twist.</em></span>
            <span>Engineer the <em>future.</em></span>
          </div>
          <p className="idle-prompt">Press any key to start</p>
        </div>
      </div>
    </div>
  )
}
