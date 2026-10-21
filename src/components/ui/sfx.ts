/** Synthesised sound effects. Off until switched on; the choice is kept in localStorage 'timeauction:sound'. No audio assets. */

const KEY = 'timeauction:sound'
const read = () => {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

let on = read()
/** Set by the host console's preview frame: same browser setting, but that frame must stay silent. */
let muted = false
export const silence = () => {
  muted = true
}
let ac: AudioContext | null = null
let master: GainNode
const listeners = new Set<() => void>()

const ctx = () => {
  if (!ac) {
    if (!navigator.userActivation?.hasBeenActive) return null
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    ac = new AC()
    master = ac.createGain()
    master.gain.value = 0.5
    master.connect(ac.destination)
  }
  if (ac.state === 'suspended') void ac.resume()
  return ac
}

const tone = (f: number, d = 0.08, type: OscillatorType = 'square', v = 0.07, to = 0, delay = 0) => {
  if (!on || muted) return
  const a = ctx()
  if (!a) return
  const t = a.currentTime + delay
  const o = a.createOscillator()
  const g = a.createGain()
  o.type = type
  o.frequency.setValueAtTime(f, t)
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + d)
  g.gain.setValueAtTime(v, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + d)
  o.connect(g).connect(master)
  o.start(t)
  o.stop(t + d + 0.03)
}

const noise = (d: number, f0: number, f1: number, v = 0.1) => {
  if (!on || muted) return
  const a = ctx()
  if (!a) return
  const t = a.currentTime
  const n = Math.floor(a.sampleRate * d)
  const b = a.createBuffer(1, n, a.sampleRate)
  const ch = b.getChannelData(0)
  for (let i = 0; i < n; i++) ch[i] = Math.random() * 2 - 1
  const src = a.createBufferSource()
  const fl = a.createBiquadFilter()
  const g = a.createGain()
  src.buffer = b
  fl.type = 'bandpass'
  fl.Q.value = 1.4
  fl.frequency.setValueAtTime(f0, t)
  fl.frequency.exponentialRampToValueAtTime(f1, t + d)
  g.gain.setValueAtTime(v, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + d)
  src.connect(fl).connect(g).connect(master)
  src.start(t)
}

/** Each transition has its own sweep: [noise from Hz, noise to Hz, tone from, tone to]. */
const NAV: Record<string, number[]> = {
  rain: [6000, 400, 440, 110], wipe: [800, 4000, 220, 440], blinds: [3000, 3000, 330, 330], iris: [300, 3500, 110, 660],
  shutter: [2600, 180, 330, 82], checker: [1500, 2500, 262, 392], tear: [900, 110, 196, 65], tiles: [4000, 1200, 523, 523],
  rise: [400, 6000, 165, 660], type: [5000, 5000, 880, 880], radar: [600, 2400, 147, 294], curtain: [2000, 500, 392, 196],
}

export const isOn = () => on
export const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => void listeners.delete(l)
}
export function toggle(v?: boolean) {
  on = v ?? !on
  try {
    localStorage.setItem(KEY, on ? '1' : '0')
  } catch {
    /* preference just won't persist */
  }
  listeners.forEach((l) => l())
  if (on) {
    tone(660, 0.07)
    tone(990, 0.11, 'square', 0.07, 0, 0.08)
  }
  return on
}

export const SFX = {
  hover: () => tone(2400, 0.012, 'sine', 0.014),
  sec: () => tone(880, 0.03, 'sine', 0.03),
  nav: (k: string) => {
    const m = NAV[k] ?? NAV.rain
    noise(0.6, m[0], m[1], 0.09)
    tone(m[2], 0.3, 'sawtooth', 0.035, m[3])
  },
  bid: () => {
    tone(523, 0.07)
    tone(784, 0.13, 'square', 0.07, 0, 0.07)
  },
  alarm: (l: number) => {
    const f = 1320 + (8 - l) * 70
    tone(f, 0.09, 'square', 0.08)
    tone(f, 0.09, 'square', 0.08, 0, 0.15)
  },
  ok: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.11, 'triangle', 0.07, 0, i * 0.07)),
  err: () => tone(140, 0.22, 'sawtooth', 0.09, 90),
  lock: () => {
    tone(80, 0.4, 'sine', 0.2, 40)
    noise(0.25, 800, 100, 0.12)
    ;[392, 523, 784].forEach((f, i) => tone(f, 0.26, 'triangle', 0.05, 0, 0.16 + i * 0.05))
  },
  alert: () => [0, 0.18, 0.36].forEach((d) => tone(440, 0.14, 'sawtooth', 0.08, 220, d)),
}
