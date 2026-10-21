import { useEffect } from 'react'
import { calm, fine, lowPower } from './motion.ts'
import { SFX, isOn } from './sfx.ts'

/** One passive pointer layer: panel glow, magnetic buttons, press ripple. Does nothing on touch, reduced motion or weak devices. */
export default function Pointer() {
  useEffect(() => {
    if (!fine() || calm() || lowPower()) return
    let btn: HTMLElement | null = null
    const clearBtn = () => {
      btn?.style.removeProperty('--tx')
      btn?.style.removeProperty('--ty')
    }
    const move = (e: PointerEvent) => {
      const t = e.target
      if (!(t instanceof Element)) return
      const pn = t.closest<HTMLElement>('.pn')
      if (pn) {
        const b = pn.getBoundingClientRect()
        pn.style.setProperty('--mx', e.clientX - b.left + 'px')
        pn.style.setProperty('--my', e.clientY - b.top + 'px')
      }
      const next = t.closest<HTMLElement>('.btn')
      if (next !== btn) {
        clearBtn()
        btn = next
      }
      if (btn) {
        const b = btn.getBoundingClientRect()
        btn.style.setProperty('--tx', ((e.clientX - b.left - b.width / 2) * 0.15).toFixed(1) + 'px')
        btn.style.setProperty('--ty', ((e.clientY - b.top - b.height / 2) * 0.25).toFixed(1) + 'px')
      }
    }
    const down = (e: PointerEvent) => {
      const p = document.createElement('div')
      p.className = 'rip'
      p.setAttribute('aria-hidden', 'true')
      p.style.left = e.clientX + 'px'
      p.style.top = e.clientY + 'px'
      document.body.append(p)
      setTimeout(() => p.remove(), 700)
    }
    let hv = 0
    const over = (e: PointerEvent) => {
      if (isOn() && e.target instanceof Element && e.target.closest('a, button') && performance.now() - hv > 60) {
        hv = performance.now()
        SFX.hover()
      }
    }
    window.addEventListener('pointermove', move, { passive: true })
    window.addEventListener('pointerdown', down, { passive: true })
    window.addEventListener('pointerover', over, { passive: true })
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('pointerover', over)
      clearBtn()
    }
  }, [])
  return null
}
