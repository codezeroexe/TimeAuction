import { useEffect, useRef } from 'react'
import { calm } from '../ui/motion.ts'

/** Looping shooting stars on one canvas; stops while the tab is hidden. */
function useShots(ref: React.RefObject<HTMLCanvasElement | null>) {
  useEffect(() => {
    const c = ref.current
    const x = c?.getContext('2d')
    if (!c || !x || calm()) return
    type Shot = { x: number; y: number; vx: number; vy: number; len: number; life: number; age: number; hue: number }
    const shots: Shot[] = []
    let W = 0
    let H = 0
    let frame = 0
    let next = 0
    const fit = () => {
      const d = Math.min(devicePixelRatio || 1, 1.5)
      W = c.clientWidth
      H = c.clientHeight
      c.width = W * d
      c.height = H * d
      x.setTransform(d, 0, 0, d, 0, 0)
    }
    fit()
    const spawn = () => {
      const a = (Math.random() * 70 + 10) * (Math.PI / 180) * (Math.random() < 0.5 ? 1 : -1) + (Math.random() < 0.5 ? 0 : Math.PI)
      const speed = (0.6 + Math.random() * 1.4) * H * 0.0011
      shots.push({
        x: Math.random() * W, y: Math.random() * H * 0.8,
        vx: Math.cos(a) * speed * 1000, vy: Math.abs(Math.sin(a)) * speed * 1000,
        len: H * (0.08 + Math.random() * 0.22), life: 0.6 + Math.random() * 0.9, age: 0, hue: 200 + Math.random() * 40,
      })
    }
    let last = 0
    const draw = (t: number) => {
      frame = requestAnimationFrame(draw)
      const dt = Math.min(0.05, (t - last) / 1000)
      last = t
      if (t > next) {
        spawn()
        next = t + 350 + Math.random() * 900
      }
      x.clearRect(0, 0, W, H)
      x.lineCap = 'round'
      for (let i = shots.length - 1; i >= 0; i--) {
        const s = shots[i]
        s.age += dt
        s.x += s.vx * dt
        s.y += s.vy * dt
        const k = s.age / s.life
        if (k >= 1) { shots.splice(i, 1); continue }
        const m = Math.hypot(s.vx, s.vy)
        const tx = s.x - (s.vx / m) * s.len
        const ty = s.y - (s.vy / m) * s.len
        const a = Math.sin(Math.PI * k)
        const g = x.createLinearGradient(s.x, s.y, tx, ty)
        g.addColorStop(0, `hsla(${s.hue} 90% 92% / ${a})`)
        g.addColorStop(1, `hsla(${s.hue} 90% 70% / 0)`)
        x.strokeStyle = g
        x.lineWidth = 2.2
        x.beginPath()
        x.moveTo(s.x, s.y)
        x.lineTo(tx, ty)
        x.stroke()
        x.fillStyle = `hsla(${s.hue} 100% 96% / ${a})`
        x.shadowColor = `hsl(${s.hue} 100% 75%)`
        x.shadowBlur = 14
        x.beginPath()
        x.arc(s.x, s.y, 2.6, 0, 6.2832)
        x.fill()
        x.shadowBlur = 0
      }
    }
    const vis = () => {
      cancelAnimationFrame(frame)
      if (!document.hidden) { last = performance.now(); frame = requestAnimationFrame(draw) }
    }
    vis()
    document.addEventListener('visibilitychange', vis)
    window.addEventListener('resize', fit)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('visibilitychange', vis)
      window.removeEventListener('resize', fit)
    }
  }, [ref])
}


/** Full-size canvas of shooting stars. Off under reduced motion. */
export default function ShootingStars({ className = '' }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useShots(ref)
  return <canvas ref={ref} className={className} aria-hidden="true" />
}
