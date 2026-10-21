export type GameMode = 'individual' | 'team'

export interface Team {
  name: string
  /** All members including the registering player (first entry). 2–5 total. */
  members: string[]
}

export interface Player {
  id: string
  name: string
  mode: GameMode
  team: Team | null
  coins: number
  registeredAt: string
}

export interface RegistrationInput {
  name: string
  mode: GameMode
  teamName: string
  /** Additional members, excluding the registering player. */
  teammates: string[]
}

/* ---------- Rules ---------- */

export type RulesetId = 'normal' | 'short'

export interface Ruleset {
  id: RulesetId
  label: string
  startingWallet: number
  lotCount: number
  bidIncrement: number
  bidSeconds: number
  solutionSeconds: number
  /** Minimum distinct acquired technologies a solution uses (any number above it is allowed). Older saved runs snapshot 2 or 3. */
  solutionTechCount: number
  pitch: boolean
  /** Technology IDs auctioned, in order. Length === lotCount. Drawn per run by matchRuleset (src/game/draw.ts). */
  lots: string[]
  /** Optional: the one lot that opens at half its starting bid this run ("Bargain lot"). Absent on most runs. */
  wildcardTechId?: string
  /** Seconds a lot is shown before bidding opens. Counted down by the engine, not by players. */
  introSeconds: number
  /** Seconds the result of a decided lot stays on screen before the next lot opens. */
  nextLotSeconds: number
  /** Drawn lots that are off the run's twist ("Wildcard" lots). Absent on sessions saved before schema v5. */
  offThemeTechIds?: string[]
}

/* ---------- Catalogue ---------- */

/** Technology families. Each technology carries one or more; they drive the icon and the twist deltas. */
export type Tag = 'energy' | 'labour' | 'nav' | 'compute' | 'comms' | 'life' | 'bio' | 'medical' | 'sensing' | 'materials' | 'shelter' | 'fabrication' | 'mobility'

export const TAGS: Tag[] = ['energy', 'labour', 'nav', 'compute', 'comms', 'life', 'bio', 'medical', 'sensing', 'materials', 'shelter', 'fabrication', 'mobility']

export type TechIcon = 'electricity' | 'battery' | 'robotics' | 'gps' | 'ai' | 'comms' | 'life' | 'shelter'

export interface Technology {
  id: string
  name: string
  era: string
  category: string
  summary: string
  capabilities: string[]
  applications: string[]
  strengths: string[]
  limitations: string[]
  icon: TechIcon
  tags: Tag[]
  startingBid: number
  /** 0–1 general usefulness. ChronoBot's only valuation input; public to every player. */
  utility: number
}

/* ---------- Match & auction ---------- */

/** Side letters in seating order. A match has 2..12 sides, A first. */
export const SIDE_IDS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'] as const
export type SideId = string
export type UnitKind = 'individual' | 'team' | 'bot'

export type MatchType = 'ivi' | 'tvt' | 'ivt' | 'ivbot' | 'tvbot' | 'multi'

export interface GameUnit {
  id: SideId
  kind: UnitKind
  name: string
  members: string[]
  /** Humans control their own bids; the bot is driven by the engine. */
  controller: 'human' | 'bot'
  /** Event server: Game ID of the registration playing this side (admin-paired matches). */
  gameId?: string
  ranked: boolean
  wallet: { initial: number; balance: number }
  portfolio: string[]
}

export type LotStatus = 'pending' | 'open' | 'sold' | 'unsold'
/** Within an open lot: `intro` (shown, bidding closed), `open` (bidding), `decided` (result shown; status is sold or unsold). */
export type LotPhase = 'intro' | 'open' | 'decided'

export interface Lot {
  techId: string
  status: LotStatus
  phase: LotPhase
  bid: number | null
  leader: SideId | null
  passed: SideId[]
  bidCount: number
  remainingMs: number
  running: boolean
  /** Time since the lot opened or the last accepted bid; drives ChronoBot's reaction delay. */
  quietMs: number
}

export type AuctionEventType =
  | 'session_created'
  | 'auction_started'
  | 'lot_opened'
  | 'bid_accepted'
  | 'bid_rejected'
  | 'pass'
  | 'sold'
  | 'unsold'
  | 'purchase'
  | 'auction_complete'

export interface AuctionEvent {
  seq: number
  sessionId: string
  at: string
  type: AuctionEventType
  techId: string | null
  sideId: SideId | null
  amount: number | null
  note: string
  wallet?: { before: number; after: number }
  portfolioAfter?: string[]
  /** Prototype checksum chained to the previous event (FNV-1a). Detects accidental edits; not tamper-proof. */
  hash?: string
}

export type SessionStatus = 'ready' | 'live' | 'complete'

export interface Session {
  sessionId: string
  gameId: string
  runId: string
  matchType: MatchType
  rules: Ruleset
  status: SessionStatus
  sides: Record<SideId, GameUnit>
  lots: Lot[]
  current: number
  events: AuctionEvent[]
  createdAt: string
  /** Local device that ran the auction. Absent on sessions saved before stage 3. */
  stationId?: string
}

/* ---------- Mission & solution ---------- */

export type Characteristic = 'sustainable' | 'scalable' | 'autonomous' | 'adaptable' | 'efficient'

export interface SolutionDraft {
  techIds: string[]
  characteristics: Characteristic[]
  text: string
}

export interface Submission {
  submissionId: string
  gameId: string
  runId: string
  sessionId: string
  sideId: SideId
  unitName: string
  ranked: boolean
  purchasedTechIds: string[]
  selectedTechIds: string[]
  characteristics: Characteristic[]
  twistId: string
  missionId: string
  text: string
  wordCount: number
  submittedAt: string
  status: 'locked'
  /** Locked automatically when the solution time ran out; the draft is taken as it was, without the usual checks. */
  auto?: true
}

export interface SolutionState {
  startedAt: string
  /** Epoch ms; null when the session is untimed. A deadline (not a countdown) so refreshing cannot buy time. */
  deadline: number | null
  draft: SolutionDraft
  submission: Submission | null
  /** Administrator reopenings of a locked submission, oldest first. */
  reopened?: { at: string; by: string; reason: string; previous: Submission }[]
}

export type RunPhase = 'setup' | 'auction' | 'summary' | 'twist' | 'mission' | 'solution'

export interface Run {
  runId: string
  gameId: string
  number: number
  /** First run counts; replays are unranked by default. */
  ranked: boolean
  twistId: string
  missionId: string
  timed: boolean
  createdAt: string
  phase: RunPhase
  session: Session | null
  solutions: Partial<Record<SideId, SolutionState>>
  /** Set when an administrator cancels an unfinished run. */
  cancelled?: { at: string; by: string; reason: string }
  /** Server-paired match: continuing past the auction summary waits for the host's reveal (`revealTwist`). */
  twistHeld?: boolean
  /** When the host revealed the Timeline Twist for a held run. */
  twistRevealedAt?: string
}

/** One registered participant's view: what the participant screens read. */
export interface GameState {
  version: 2
  gameId: string | null
  player: Player | null
  run: Run | null
  pastRuns: Run[]
}

/* ---------- Event (multi-participant, persisted) ---------- */

export interface Participant {
  gameId: string
  player: Player
  run: Run | null
  pastRuns: Run[]
  /** Set when a judge returns this player to the lobby after a clear; counts as their lobby time instead of registeredAt. */
  lobbyAt?: string
  /** Set when a judge hides this player from the lobby and projector; a later lobbyAt (Return to lobby) shows them again. */
  lobbyHiddenAt?: string
}

export type CriterionId = 'relevance' | 'combination' | 'twist' | 'sustainability' | 'scalability' | 'explanation'

export interface CriterionEntry {
  score: number | null
  note: string
}

export type ScoreStatus = 'awaiting' | 'in_scoring' | 'scored' | 'verified' | 'published'

export interface ScoreCorrection {
  at: string
  by: string
  reason: string
  criterion: CriterionId
  previous: number
  corrected: number
}

export interface ScoreRecord {
  submissionId: string
  gameId: string
  runId: string
  sessionId: string
  sideId: SideId
  status: ScoreStatus
  entries: Record<CriterionId, CriterionEntry>
  queuedAt: string
  queuedBy: string
  draftSavedAt?: string
  scoredAt?: string
  scoredBy?: string
  verifiedAt?: string
  verifiedBy?: string
  publishedAt?: string
  publishedBy?: string
  corrections: ScoreCorrection[]
}

export interface Feedback {
  feedbackId: string
  gameId: string
  runId: string
  overall: number
  auctionClarity: number
  missionDifficulty: number
  comment: string
  submittedAt: string
}

export interface AuditEntry {
  seq: number
  at: string
  actor: string
  action: string
  target: string
  reason: string
}

export interface EventSettings {
  eventName: string
  /** Free-text role label of whoever operates the admin screens. Not authentication. */
  operator: string
  defaultRuleset: RulesetId
  defaultTimed: boolean
  leaderboardLocked: boolean
  leaderboardLockedAt?: string
}

/** Projector stages, in running order. */
export const SHOW_STAGES = ['welcome', 'rules', 'join', 'teams', 'matchups', 'auction', 'twist', 'results'] as const
export type ShowStage = (typeof SHOW_STAGES)[number]

/** What the projector shows. `focus` is a room's session ID; null = grid when several rooms are live. */
export interface ShowState {
  stage: ShowStage
  focus: string | null
  /** Absent means DEFAULT_DISPLAY (saves from before the fit load unchanged). */
  display?: ShowDisplay
  /** ISO time of the last lobby clear. Older registrations and rooms are hidden from the lobby and projector (records are kept). */
  lobbySince?: string
}

/** Projector fit: zoom (percent of the base zoom) and edge insets (percent of the screen) for low-res or cropping projectors. */
export interface ShowDisplay { scale: number; top: number; right: number; bottom: number; left: number; guides: boolean }

export interface EventState {
  version: 6
  eventId: string
  stationId: string
  createdAt: string
  settings: EventSettings
  participants: Participant[]
  activeGameId: string | null
  scores: Record<string, ScoreRecord>
  feedback: Feedback[]
  audit: AuditEntry[]
  show: ShowState
}
