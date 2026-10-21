import { useGame } from '../../state/GameContext.tsx'
import { useRoute, type Route } from '../../state/useRoute.ts'
import Logo from './Logo.tsx'
import { PALETTE_EVENT } from './Palette.tsx'

const STAGES = [
  { label: 'Register', year: '1880', href: '#/register' },
  { label: 'Bid', year: '1960', href: '#/auction' },
  { label: 'Adapt', year: '1990', href: '#/twist' },
  { label: 'Build', year: '2010', href: '#/solution' },
  { label: 'Rank', year: '2040', href: '#/leaderboard' },
]

/** Index into STAGES for each screen. Routes not listed sit outside the run (-1). */
const STAGE_OF: Partial<Record<Route, number>> = {
  register: 0,
  lobby: 1, match: 1, auction: 1, summary: 1, log: 1,
  twist: 2, mission: 2,
  solution: 3, results: 3, feedback: 3,
  leaderboard: 4,
}

/** Desktop: vertical rail. Mobile: bottom bar. Shows where the participant stands in the run. */
export default function Rail() {
  const { state } = useGame()
  const { route } = useRoute()
  const current = STAGE_OF[route] ?? -1
  return (
    <nav
      aria-label="Mission stages"
      className="fixed inset-x-0 bottom-0 z-40 flex h-[62px] flex-row items-center border-t border-line bg-paper/90 backdrop-blur md:sticky md:inset-x-auto md:bottom-auto md:top-0 md:h-auto md:max-h-svh md:w-[84px] md:flex-col md:items-center md:self-stretch md:border-t-0 md:border-r md:bg-paper/80 md:py-6"
    >
      <a
        href={state.player ? '#/lobby' : '#'}
        aria-label={state.player ? 'TimeAuction mission lobby' : 'TimeAuction home'}
        className="rl-logo hidden md:mb-4 md:grid"
      >
        <Logo size={50} />
      </a>
      <div className="relative flex flex-1 flex-col">
        <span aria-hidden="true" className="absolute top-3.5 bottom-3.5 left-1/2 hidden w-px -translate-x-1/2 bg-line md:block" />
        <ol className="flex flex-1 flex-row justify-around md:flex-col md:justify-start md:gap-7">
          {STAGES.map((s, i) => (
            <Node key={s.label} stage={s} reached={i <= current} here={i === current} />
          ))}
        </ol>
      </div>
      <div className="hidden flex-col items-center gap-3 md:mt-auto md:flex">
        <a href="#/rules" className="font-mono text-[11px] tracking-[0.1em] text-muted uppercase hover:text-ink">
          Rules
        </a>
        <button type="button" className="kbd" aria-label="Open command palette" onClick={() => window.dispatchEvent(new Event(PALETTE_EVENT))}>
          Ctrl K
        </button>
      </div>
    </nav>
  )
}

function Node({ stage, reached, here }: { stage: (typeof STAGES)[number]; reached: boolean; here: boolean }) {
  const body = (
    <>
      <i
        aria-hidden="true"
        className={`hidden h-[11px] w-[11px] rotate-45 border transition-[scale,background-color,border-color] duration-300 group-hover:scale-[1.3] group-hover:border-accent md:block ${
          here ? 'border-accent bg-accent shadow-[0_0_0_4px_var(--color-accent-soft)]' : reached ? 'border-accent bg-paper' : 'border-line-strong bg-paper'
        }`}
      />
      <span className="hidden font-mono text-[10.5px] text-muted md:inline">{stage.year}</span>
      <span className={`text-[12px] ${here ? 'font-semibold text-ink' : reached ? 'text-ink-soft' : 'text-muted'}`}>{stage.label}</span>
    </>
  )
  return (
    <li className="max-md:h-full">
      {reached ? (
        <a href={stage.href} aria-label={`${stage.label}, ${stage.year}`} aria-current={here ? 'step' : undefined} className="group relative flex flex-col items-center gap-1 md:bg-paper md:py-1 before:absolute before:inset-x-[22%] before:top-0 before:h-[3px] before:origin-center before:scale-x-0 before:rounded-b-[3px] before:bg-accent before:transition-transform before:duration-300 aria-[current=step]:before:scale-x-100 max-md:h-full max-md:justify-center max-md:px-3 md:gap-1.5 md:before:hidden">
          {body}
        </a>
      ) : (
        <span aria-disabled="true" className="relative flex flex-col md:bg-paper md:py-1 items-center gap-1 max-md:h-full max-md:justify-center max-md:px-3 md:gap-1.5">
          {body}
        </span>
      )}
    </li>
  )
}
