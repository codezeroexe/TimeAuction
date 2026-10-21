import { useEffect, useRef, useState, type RefObject } from 'react'
import Starfield, { type StarfieldHandle } from '../components/landing/Starfield.tsx'
import Chronometer from '../components/landing/Chronometer.tsx'
import HowToPlayDialog from '../components/landing/HowToPlayDialog.tsx'
import { HowSection, MissionSection, ResumeForm, ScoreSection, StickyBar, Ticker, Wordmark } from '../components/landing/LandingSections.tsx'
import { DEFAULT_MISSION_ID, MISSIONS } from '../data/scenario.ts'
import { navigate } from '../state/useRoute.ts'
import { useGame } from '../state/GameContext.tsx'
import { calm, lowPower } from '../components/ui/motion.ts'
import { SFX } from '../components/ui/sfx.ts'
import { Arrow } from '../components/ui/Button.tsx'
import { PALETTE_EVENT } from '../components/ui/Palette.tsx'
import Logo from '../components/ui/Logo.tsx'

type Theme = 'dark' | 'light'
const THEME_KEY = 'timeauction:landing-theme'

function readTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

const reducedMotion = calm

/** Pointer parallax on fine pointers only; writes CSS variables at most once per frame. The dial hand turns toward the pointer by the shortest way round. */
function useParallax(ref: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = ref.current
    if (!el || reducedMotion() || lowPower() || !matchMedia('(pointer: fine)').matches) return
    const chrono = el.querySelector<HTMLElement>('.chrono')
    let ang = 104
    let frame = 0
    const move = (e: PointerEvent) => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        el.style.setProperty('--px', ((e.clientX / innerWidth) * 2 - 1).toFixed(3))
        el.style.setProperty('--py', ((e.clientY / innerHeight) * 2 - 1).toFixed(3))
        if (chrono) {
          const b = chrono.getBoundingClientRect()
          const target = (Math.atan2(e.clientY - (b.top + b.height / 2), e.clientX - (b.left + b.width / 2)) * 180) / Math.PI + 90
          ang += ((((target - ang) % 360) + 540) % 360) - 180
          chrono.style.setProperty('--ang', `${ang}deg`)
        }
      })
    }
    window.addEventListener('pointermove', move, { passive: true })
    return () => {
      window.removeEventListener('pointermove', move)
      cancelAnimationFrame(frame)
    }
  }, [ref])
}

/** Reveals [data-reveal] children as they scroll into view. Content stays visible if this never runs. */
function useReveal(ref: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = ref.current
    if (!el || reducedMotion() || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          e.target.classList.add('is-in')
          io.unobserve(e.target)
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    )
    el.querySelectorAll('[data-reveal]').forEach((n) => io.observe(n))
    el.classList.add('reveal-armed')
    return () => io.disconnect()
  }, [ref])
}

const scrollToId = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: calm() ? 'auto' : 'smooth', block: 'start' })
const order = (i: number) => ({ ['--i' as string]: i })

export default function Landing() {
  const { state } = useGame()
  const [theme, setTheme] = useState<Theme>(readTheme)
  const [howOpen, setHowOpen] = useState(false)
  const [lite] = useState(lowPower)
  const root = useRef<HTMLDivElement>(null)
  const sky = useRef<StarfieldHandle>(null)
  useParallax(root)
  useReveal(root)

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    try {
      localStorage.setItem(THEME_KEY, next)
    } catch {
      /* preference just won't persist */
    }
  }

  const go = () => navigate(state.player ? 'lobby' : 'register')
  const start = () => {
    SFX.nav('rain')
    if (sky.current) sky.current.launch(go)
    else go()
  }
  const startLabel = state.player ? 'Continue Your Mission' : 'Start Your Mission'
  const mission = MISSIONS[DEFAULT_MISSION_ID]
  const link =
    'hidden rounded-full px-3.5 py-2 text-[14.5px] font-medium text-(--l-muted) transition-colors hover:bg-(--l-line) hover:text-(--l-fg) md:inline-block'

  return (
    <div ref={root} className="landing relative isolate min-h-svh overflow-clip" data-theme={theme} data-lite={lite || undefined}>
      <Starfield ref={sky} />
      <StickyBar onStart={start} label={startLabel} />

      <header className="relative z-20">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <a href="#" className="flex min-w-0 items-center gap-3.5" aria-label="TimeAuction, Engineering Across Time">
            <Logo size={48} ink="var(--l-fg)" accent="var(--l-accent)" />
            <span className="min-w-0">
              <Wordmark className="block text-[30px] sm:text-[34px]" />
              <small className="mt-1 hidden text-[11px] font-medium tracking-[0.2em] text-(--l-muted) uppercase sm:block">Engineering Across Time</small>
            </span>
          </a>
          <nav aria-label="On this page" className="flex items-center gap-1 sm:gap-2">
            <button type="button" className={link} onClick={() => scrollToId('how')}>
              How it works
            </button>
            <button type="button" className={link} onClick={() => scrollToId('tech')}>
              Technologies
            </button>
            <button type="button" className={link} onClick={() => scrollToId('score')}>
              Scoring
            </button>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
              className="grid h-10 w-10 place-items-center rounded-full text-(--l-muted) transition-colors hover:bg-(--l-line) hover:text-(--l-fg)"
            >
              {theme === 'dark' ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                  <circle cx="12" cy="12" r="4.2" />
                  <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" strokeLinecap="round" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                  <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" strokeLinejoin="round" />
                </svg>
              )}
            </button>
            <button type="button" className="lkbd hidden sm:block" aria-label="Open command palette" onClick={() => window.dispatchEvent(new Event(PALETTE_EVENT))}>
              Ctrl K
            </button>
          </nav>
        </div>
      </header>

      <main className="relative z-10 pb-24">
        <section className="hero5 relative mx-auto grid max-w-7xl items-center gap-6 px-5 pt-6 pb-16 sm:px-8 md:pt-10 lg:grid-cols-[1.1fr_1fr] lg:gap-4 lg:pb-24">
          <div className="parallax-copy relative z-[2] max-w-2xl">
            <h1 className="enter font-display text-[clamp(2.75rem,7.2vw,6rem)] leading-[0.95] tracking-[-0.01em] text-balance" style={order(2)}>
              The Future Is Yours <em className="text-(--l-accent)">to Engineer.</em>
            </h1>
            <p className="enter mt-7 max-w-xl text-base leading-relaxed text-(--l-muted) sm:text-lg" style={order(3)}>
              Bid for a drawn set of breakthrough technologies, survive a Timeline Twist, and take on the {mission.title} mission.{' '}
              Your ChronoCoins depend on the match size. One live auction.
            </p>
            <div className="enter mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center" style={order(4)}>
              <button
                type="button"
                onClick={start}
                className="cta inline-flex items-center justify-center gap-3 rounded-full bg-(--l-cta-bg) px-5 py-4 text-[13px] font-semibold tracking-[0.12em] whitespace-nowrap text-(--l-cta-fg) uppercase hover:bg-(--l-cta-hover) sm:px-7 sm:tracking-[0.18em]"
              >
                {startLabel}
                <Arrow />
              </button>
              <a
                href="#/leaderboard"
                className="cta rounded-full border border-(--l-line-strong) px-5 py-4 text-center text-[13px] font-semibold tracking-[0.12em] uppercase hover:border-(--l-fg) sm:px-7 sm:tracking-[0.18em]"
              >
                Leaderboard
              </a>
              <button
                type="button"
                onClick={() => setHowOpen(true)}
                className="cta rounded-full border border-(--l-line-strong) px-5 py-4 text-[13px] font-semibold tracking-[0.12em] uppercase hover:border-(--l-fg) sm:px-7 sm:tracking-[0.18em]"
              >
                How to Play
              </button>
            </div>
            <div className="enter" style={order(5)}>
              <ResumeForm />
            </div>
          </div>

          <div className="hero-dial parallax-dial relative mx-auto w-full max-w-[min(560px,86vw)] lg:max-w-none">
            <Chronometer className="enter-dial w-full" />
          </div>
        </section>

        <Ticker />
        <HowSection />
        <MissionSection />
        <ScoreSection />
      </main>

      <HowToPlayDialog
        open={howOpen}
        onClose={() => setHowOpen(false)}
        onStart={() => {
          setHowOpen(false)
          start()
        }}
      />
    </div>
  )
}
