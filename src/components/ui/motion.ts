import type { Route } from '../../state/useRoute.ts'

/** Pure DOM motion helpers shared by routing, pointer effects and screens. Safe to import in Node (no window access at import). */

export const calm = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
export const fine = () => typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches
/** Few cores or little memory: drop the decorative layers that cost the most. */
export const lowPower = () => {
  const n = navigator as Navigator & { deviceMemory?: number }
  return (n.hardwareConcurrency ?? 8) <= 2 || (n.deviceMemory ?? 8) <= 2
}

/** Counts a number up with an ease-out; reduced motion writes the final text at once. */
export function countUp(el: HTMLElement | null, to: number, ms: number, suffix = '', from = 0) {
  if (!el) return
  if (calm()) {
    el.textContent = Math.round(to) + suffix
    return
  }
  const t0 = performance.now()
  const f = (t: number) => {
    const k = Math.min(1, (t - t0) / ms)
    el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))) + suffix
    if (k < 1) requestAnimationFrame(f)
  }
  requestAnimationFrame(f)
}

/* ---------- screen transitions: a wall of characters covers the old screen and uncovers the new one ---------- */

export type Kind = 'rain' | 'rise' | 'wipe' | 'blinds' | 'iris' | 'shutter' | 'checker' | 'tear' | 'tiles' | 'type' | 'radar' | 'curtain'
type Order = (i: number, r: number, C: number, R: number, n: number[], o: { i: number; r: number }) => number

/** Every destination orders the cells differently, so each page arrives its own way. */
export const ORDER: Record<Kind, Order> = {
  rain: (i, r, _C, R, n) => n[i] * 0.45 + (r / R) * 0.55,
  rise: (i, r, _C, R, n) => n[i] * 0.45 + (1 - r / R) * 0.55,
  wipe: (i, r, C, R) => (i / C) * 0.8 + (r / R) * 0.2,
  blinds: (i, r, _C, R) => ((i % 9) / 9) * 0.7 + (r / R) * 0.3,
  iris: (i, r, C, R, _n, o) => Math.min(1, Math.hypot((i - o.i) / C, ((r - o.r) / R) * 0.6) / 0.9),
  shutter: (_i, r, _C, R) => 1 - Math.abs(r - R / 2) / (R / 2),
  checker: (i, r) => (((i >> 1) + (r >> 1)) % 2) * 0.5 + Math.random() * 0.3,
  tear: (i, r, C, _R, n) => n[C + (r >> 1)] * 0.8 + (i / C) * 0.2,
  tiles: (i, r, C, R, n) => n[C + R + (((i >> 2) * 31 + Math.floor(r / 3) * 17) % 97)],
  type: (i, r, C, R) => (r + i / C) / R,
  radar: (i, r, C, R) => (Math.atan2(r - R / 2, (i - C / 2) * 0.6) + Math.PI) / 6.2832,
  curtain: (i, _r, C) => 1 - Math.abs(i - C / 2) / (C / 2),
}

export const TR: Record<Route, Kind> = {
  landing: 'rain', register: 'wipe', lobby: 'blinds', match: 'iris', auction: 'shutter', summary: 'checker', log: 'checker',
  twist: 'tear', mission: 'tear', solution: 'tiles', results: 'rise', feedback: 'rise', leaderboard: 'type', replay: 'type',
  admin: 'radar', score: 'radar', present: 'shutter', idle: 'rain', rules: 'curtain',
}

const GLYPHS = '·✦+*·.·✧'.split('')
const CW = 22
const CH = 28
const D = 300

let origin = { x: 0, y: 0 }
let originSet = false
let busy = false
let canvas: HTMLCanvasElement | null = null

const markSvg = (ink: string, accent: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-36 -36 72 72" fill="none"><g transform="rotate(-24)"><path d="M-30 0A30 10 0 0 1 30 0" stroke="${ink}" stroke-width="4.5" stroke-linecap="round"/></g><circle r="15.5" fill="${accent}"/><path d="M-9 -9a13 13 0 0 1 14 -3" stroke="#fff" stroke-opacity=".55" stroke-width="2.5" stroke-linecap="round"/><g transform="rotate(-24)"><path d="M-30 0A30 10 0 0 0 30 0" stroke="${ink}" stroke-width="4.5" stroke-linecap="round"/><circle cx="30" r="4.5" fill="${ink}"/></g></svg>`

/** Covers the screen, calls swap() at the midpoint, then uncovers. Reduced motion or an overlapping transition swaps at once. */
/** Returns true when a transition actually plays, false when it swapped instantly. */
export function play(kind: Kind, swap: () => void, hot = false): boolean {
  if (typeof document === 'undefined' || calm() || busy) return swap(), false
  if (!canvas) {
    window.addEventListener('pointerdown', (e) => { origin = { x: e.clientX, y: e.clientY }; originSet = true }, true)
    canvas = document.createElement('canvas')
    canvas.id = 'fx'
    canvas.setAttribute('aria-hidden', 'true')
    canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:95;pointer-events:none;display:none'
    document.body.append(canvas)
  }
  const c = canvas
  const x = c.getContext('2d')
  if (!x) return swap(), false
  busy = true
  const d = Math.min(devicePixelRatio || 1, 1.5)
  const W = innerWidth
  const H = innerHeight
  c.width = W * d
  c.height = H * d
  x.setTransform(d, 0, 0, d, 0, 0)
  c.style.display = 'block'
  const C = Math.ceil(W / CW)
  const R = Math.ceil(H / CH)
  const n = Array.from({ length: C + R + 100 }, Math.random)
  const o = originSet ? { i: origin.x / CW, r: origin.y / CH } : { i: C / 2, r: R / 2 }
  const f = ORDER[kind] ?? ORDER.rain
  const th = new Float32Array(C * R)
  const g = new Uint8Array(C * R)
  for (let r = 0; r < R; r++)
    for (let i = 0; i < C; i++) {
      th[r * C + i] = Math.min(0.999, Math.max(0, f(i, r, C, R, n, o)))
      g[r * C + i] = Math.floor(Math.random() * GLYPHS.length)
    }
  const cs = getComputedStyle(document.documentElement)
  const v = (name: string) => cs.getPropertyValue(name).trim()
  const ink = v('--color-ink')
  const bg = v('--color-paper')
  const body = v(hot ? '--color-danger' : '--color-accent')
  const head = hot ? body : ink
  let t0 = 0
  let swapped = false
  const doSwap = () => {
    if (swapped) return
    swapped = true
    swap()
  }
  const finish = () => {
    c.style.display = 'none'
    busy = false
  }
  x.font = '600 18px Consolas, "Cascadia Mono", ui-monospace, Menlo, monospace'
  x.textBaseline = 'top'
  const mimg = new Image()
  mimg.src = 'data:image/svg+xml,' + encodeURIComponent(markSvg(ink, body))
  // A hidden tab pauses animation frames; never let that strand the navigation.
  setTimeout(doSwap, D + 150)
  setTimeout(finish, D * 2 + 300)
  const step = (t: number) => {
    if (!t0) t0 = t
    const e = t - t0
    const out = e >= D
    const k = ((out ? e - D : e) / D) * 1.16
    if (out) doSwap()
    x.clearRect(0, 0, W, H)
    for (let m = 0; m < th.length; m++) {
      const dlt = k - th[m]
      if (!(out ? dlt < 0 : dlt >= 0)) continue
      const X = (m % C) * CW
      const Y = Math.floor(m / C) * CH
      const edge = Math.abs(dlt) < 0.09
      x.globalAlpha = 1
      x.fillStyle = bg
      x.fillRect(X, Y, CW + 1, CH + 1)
      x.globalAlpha = edge ? 1 : 0.32
      x.fillStyle = edge ? head : body
      x.fillText(GLYPHS[edge ? Math.floor(Math.random() * GLYPHS.length) : g[m]], X + 3, Y + 4)
    }
    const la = Math.max(0, 1 - Math.abs(e - D) / (D * 0.75))
    if (la > 0 && mimg.complete && mimg.naturalWidth) {
      x.globalAlpha = la
      x.fillStyle = bg
      x.beginPath()
      x.arc(W / 2, H / 2, 78, 0, 6.2832)
      x.fill()
      x.drawImage(mimg, W / 2 - 56, H / 2 - 56, 112, 112)
    }
    x.globalAlpha = 1
    if (e < D * 2) requestAnimationFrame(step)
    else finish()
  }
  requestAnimationFrame(step)
  return true
}
