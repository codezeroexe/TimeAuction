import { useEffect, useImperativeHandle, useMemo, useRef, type Ref, type RefObject } from 'react'
import { calm, lowPower } from '../ui/motion.ts'

/** Deterministic PRNG so the sky is identical on every render and reload. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const W = 1600
const H = 1000

export interface StarfieldHandle {
  /** Warp the sky for about a second, then call cb (also right away when motion is reduced or the device is weak). */
  launch: (cb: () => void) => void
}

/** Interactive sky: constellation lines to stars near the pointer, a shooting streak on click, a warp on launch. */
function useSky(canvas: RefObject<HTMLCanvasElement | null>, ref: Ref<StarfieldHandle> | undefined) {
  const api = useRef<StarfieldHandle['launch']>((cb) => cb())
  useImperativeHandle(ref, () => ({ launch: (cb) => api.current(cb) }), [])
  useEffect(() => {
    const c = canvas.current
    const x = c?.getContext('2d')
    if (!c || !x || calm() || lowPower()) return
    const rand = mulberry32(777)
    const S = Array.from({ length: 200 }, () => ({ x: rand(), y: rand(), z: 0.25 + rand() * 0.75 }))
    let W = 0
    let H = 0
    let mx = -999
    let my = -999
    let warp = 0
    let t0 = 0
    let done: (() => void) | null = null
    let frame = 0
    let safety = 0
    let color = '#a3c6ef'
    let n = 0
    const shots: { x: number; y: number; n: number }[] = []
    const fit = () => {
      const d = Math.min(devicePixelRatio || 1, 1.5)
      W = c.clientWidth
      H = c.clientHeight
      c.width = W * d
      c.height = H * d
      x.setTransform(d, 0, 0, d, 0, 0)
    }
    fit()
    const kick = () => {
      if (!frame) frame = requestAnimationFrame(draw)
    }
    const move = (e: PointerEvent) => {
      mx = e.clientX
      my = e.clientY
      kick()
    }
    const down = (e: PointerEvent) => {
      if ((e.target as Element).closest('a, button, input, dialog')) return
      shots.push({ x: e.clientX, y: e.clientY, n: 0 })
      kick()
    }
    const finish = () => {
      const d = done
      done = null
      d?.()
    }
    function draw(t: number) {
      frame = 0
      if (document.hidden) return
      if (c!.clientWidth !== W || c!.clientHeight !== H) fit()
      if (n++ % 30 === 0) color = getComputedStyle(c!).getPropertyValue('--l-accent').trim() || color
      const k = warp ? Math.min(1, (t - t0) / 1100) : 0
      const v = k * k * 46
      x!.clearRect(0, 0, W, H)
      const near: number[][] = []
      for (const s of S) {
        let X = s.x * W
        let Y = s.y * H
        if (warp) {
          Y = (Y + v * s.z * 18 + (t - t0) * 0.05 * s.z) % H
          x!.globalAlpha = 0.35 + s.z * 0.65
          x!.fillStyle = '#fff'
          x!.fillRect(X, Y - v * s.z, s.z > 0.8 ? 2 : 1, Math.max(2, v * s.z))
        } else if (Math.hypot(X - mx, Y - my) < 150) near.push([X, Y])
      }
      if (near.length) {
        x!.strokeStyle = color
        x!.fillStyle = color
        x!.lineWidth = 1
        near.sort((a, b) => Math.atan2(a[1] - my, a[0] - mx) - Math.atan2(b[1] - my, b[0] - mx))
        near.forEach((p, i) => {
          const d = Math.hypot(p[0] - mx, p[1] - my)
          const q = near[(i + 1) % near.length]
          x!.globalAlpha = (1 - d / 150) * 0.5
          x!.beginPath()
          x!.moveTo(mx, my)
          x!.lineTo(p[0], p[1])
          x!.stroke()
          if (near.length > 2) {
            x!.globalAlpha = (1 - d / 150) * 0.7
            x!.beginPath()
            x!.moveTo(p[0], p[1])
            x!.lineTo(q[0], q[1])
            x!.stroke()
          }
          x!.globalAlpha = 1 - d / 150
          x!.fillRect(p[0] - 1, p[1] - 1, 3, 3)
        })
      }
      for (let i = shots.length - 1; i >= 0; i--) {
        const h = shots[i]
        h.n++
        const hx = h.x - h.n * 11
        const hy = h.y + h.n * 6
        const g = x!.createLinearGradient(hx, hy, hx + 90, hy - 49)
        g.addColorStop(0, color)
        g.addColorStop(1, 'transparent')
        x!.globalAlpha = Math.max(0, 1 - h.n / 46)
        x!.strokeStyle = g
        x!.lineWidth = 2
        x!.beginPath()
        x!.moveTo(hx, hy)
        x!.lineTo(hx + 90, hy - 49)
        x!.stroke()
        if (h.n > 46) shots.splice(i, 1)
      }
      x!.globalAlpha = 1
      if (warp && k >= 1) finish()
      if (warp || shots.length || near.length) frame = requestAnimationFrame(draw)
    }
    api.current = (cb) => {
      warp = 1
      t0 = performance.now()
      done = cb
      kick()
      clearTimeout(safety)
      safety = window.setTimeout(finish, 1400)
    }
    window.addEventListener('pointermove', move, { passive: true })
    window.addEventListener('pointerdown', down)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerdown', down)
      cancelAnimationFrame(frame)
      clearTimeout(safety)
      done = null
      api.current = (cb) => cb()
    }
  }, [canvas])
}

/**
 * Three depth layers (far, mid, near). Each drifts slowly at its own speed and shifts with the pointer
 * by its depth factor, which gives parallax without moving a single star individually.
 */
export default function Starfield({ ref }: { ref?: Ref<StarfieldHandle> }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useSky(canvas, ref)
  const { far, mid, bright } = useMemo(() => {
    const rand = mulberry32(20260)
    const stars = Array.from({ length: 340 }, () => {
      const size = rand()
      return {
        x: rand() * W,
        y: rand() * H,
        r: size < 0.85 ? 0.35 + size * 0.6 : 0.9 + size * 0.7,
        o: 0.18 + rand() * 0.62,
      }
    })
    // Kept right of the headline so spikes never cross text.
    const bright = Array.from({ length: 9 }, () => ({ x: 950 + rand() * 650, y: rand() * H * 0.9, s: 3 + rand() * 4 }))
    return { far: stars.filter((st) => st.r < 0.75), mid: stars.filter((st) => st.r >= 0.75), bright }
  }, [])

  const svg = 'absolute inset-0 h-full w-full'
  return (
    <>
    <canvas ref={canvas} className="pointer-events-none fixed inset-0 z-[1] h-full w-full" aria-hidden="true" />
    <div className="starfield pointer-events-none absolute -inset-[3%]" aria-hidden="true">
      <div className="nebula nebula-a" />
      <div className="nebula nebula-b" />

      <div className="star-layer star-far">
        <svg className={svg} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice">
          <defs>
            <radialGradient id="galaxy">
              <stop offset="0" stopColor="var(--l-galaxy)" stopOpacity="0.55" />
              <stop offset="0.35" stopColor="var(--l-galaxy)" stopOpacity="0.16" />
              <stop offset="1" stopColor="var(--l-galaxy)" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="band">
              <stop offset="0" stopColor="var(--l-galaxy)" stopOpacity="0.1" />
              <stop offset="1" stopColor="var(--l-galaxy)" stopOpacity="0" />
            </radialGradient>
          </defs>
          <ellipse cx="820" cy="460" rx="1050" ry="140" fill="url(#band)" transform="rotate(-18 820 460)" />
          <ellipse cx="240" cy="190" rx="90" ry="26" fill="url(#galaxy)" transform="rotate(-28 240 190)" />
          <ellipse cx="1390" cy="820" rx="70" ry="18" fill="url(#galaxy)" transform="rotate(16 1390 820)" />
          <ellipse cx="560" cy="860" rx="40" ry="12" fill="url(#galaxy)" transform="rotate(-8 560 860)" />
          <g fill="var(--l-star)">
            {far.map((st, i) => (
              <circle key={i} cx={st.x} cy={st.y} r={st.r} opacity={st.o} />
            ))}
          </g>
        </svg>
      </div>

      <div className="star-layer star-mid">
        <svg className={svg} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice">
          <g fill="none" stroke="var(--l-line)" strokeWidth="1">
            <ellipse cx="1180" cy="430" rx="760" ry="250" transform="rotate(-14 1180 430)" />
            <ellipse cx="1180" cy="430" rx="980" ry="340" transform="rotate(-14 1180 430)" strokeDasharray="2 7" />
          </g>
          <g fill="var(--l-star)">
            {mid.map((st, i) => (
              <circle key={i} cx={st.x} cy={st.y} r={st.r} opacity={st.o} />
            ))}
          </g>
        </svg>
      </div>

      <div className="star-layer star-near">
        <svg className={svg} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice">
          {/* A few brighter stars with static diffraction spikes */}
          <g stroke="var(--l-star)" strokeLinecap="round">
            {bright.map((b, i) => (
              <g key={i} opacity="0.75">
                <line x1={b.x - b.s} y1={b.y} x2={b.x + b.s} y2={b.y} strokeWidth="0.6" />
                <line x1={b.x} y1={b.y - b.s} x2={b.x} y2={b.y + b.s} strokeWidth="0.6" />
                <circle cx={b.x} cy={b.y} r="1.3" fill="var(--l-star)" stroke="none" />
              </g>
            ))}
          </g>
        </svg>
      </div>
    </div>
    </>
  )
}
