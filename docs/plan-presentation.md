# Plan: presentation screen + host console (show stages)

Status: draft, awaiting go-ahead.

Goal: the host PC runs two tabs. Tab 1 `#/present` goes to the projector: no buttons, cursor hidden, driven only by server state, walking through Welcome → Teams → Matchups → Auction → Twist → Results. Tab 2 is the host console (`#/admin/show` plus a ShowBar on every admin section) with every control. Players see their own stations; the host controls everything.

## Facts (file:line)
- Projector today: `src/screens/Auctioneer.tsx` (judge sign-in `:39`, grid `:73-113`, focus with Start/Pause `:141`, Next `:159`, local 200 ms tick `:26-37`).
- Routes `src/state/useRoute.ts:6-9`; `auctioneer` also in `motion.ts:50-54`, `motion.test.ts:5`, `GameShell.tsx:30`, `Palette.tsx:64`, `AdminShell.tsx:50`, `Admin.tsx:149,225`, `server/seed-match.ts:94`.
- Live SSE flag only for auctioneer: `GameContext.tsx:248` → `remote.ts:142` → `host.ts:237`.
- `runFor` accepts only `setClockRunning | advanceLot` (`GameContext.tsx:49`).
- Participant payloads spread `...ev` (`host.ts:195`): new event-level fields reach players.
- `pairMatch` calls `createMatch` then `proceedToAuction` at once (`host.ts:305-306`); players are not blocked from `proceedToAuction`.
- Start during intro skips it (`auction.ts:165`, test `auction.test.ts:318`) — keep.
- summary → twist via `continueToMission`, any station (`actions.ts:207`); all stations of a match share the host's run.
- Each match has its own twist (`twistForRun(runId)`); no event-wide twist.
- Known leak: twist is computable from `runId` (client has `scenario.ts`); lots/wildcards hint it too.
- One round per player (`waitingParticipants`, `event.ts:65-75`).
- Schema v5 (`types.ts:309`, `event.ts:19`, `storage.ts:29-41`; tests `storage.test.ts:14,21,23`, `host.test.ts:724`).
- Results already gated by `publishScore`.
- LAN address only printed (`server/index.ts:300-305`); `/api/hello` returns eventId/eventName (`:223`).

## Decisions
1. Routes: `#/present` (projector), `#/present/preview` (console thumbnail), host console `#/admin/show` + ShowBar on all admin sections. `#/auctioneer` maps to `present`.
2. Presentation auth = judge session; both tabs share the cookie. Cross-tab: login/logout write `localStorage['timeauction:auth']`, RemoteProvider listens to `storage` and bumps `authEpoch`. Not signed in → existing LoginGate.
3. Persisted `EventState.show = { stage, focus }`, stages `welcome|teams|matchups|auction|twist|results`; schema v5 → v6 with default.
4. Several rooms: host picks focus; no focus → grid if >1 live, big view if exactly 1. No auto-rotate.
5. Held start: `pairMatch{hold?}` creates the match `ready`; judge `proceedToAuction` starts it. Players blocked from `proceedToAuction` (403). API default `hold:false`; console checkbox default on.
6. Twist gate per match: server-paired runs get `twistHeld`; `continueToMission` refused until judge `revealTwist` (sets `twistRevealedAt`, phase summary → twist). Single-device and old data unchanged.
7. Look: light paper theme, existing auction components, `.present { zoom: var(--present-zoom, 1.25) }`, fixed `h-svh overflow-hidden`, stage transitions via `play()`: welcome `rain`, teams `blinds`, matchups `iris`, auction `shutter`, twist `tear`, results `rise`.
8. Console preview: iframe `#/present/preview` at 1920×1080 scaled 0.3; preview uses the 1 s stream and no sound.

## Batch 1: engine + schema (pure)
- `types.ts`: `ShowStage`, `SHOW_STAGES`, `ShowState`; `EventState.version: 6`, `show`; `Run.twistHeld?`, `Run.twistRevealedAt?`.
- `event.ts`: `emptyEvent` v6 + default show; `setShow(ev, patch)` (validates stage/focus, no audit); `rooms(ev)` → `{ room, gameId, run, session }[]` of non-cancelled sessions by `createdAt`.
- `actions.ts`: `MatchConfig.holdTwist?` → `twistHeld`; `setShow` (ADMIN_ACTIONS); `revealTwist` (RUN_ACTIONS; requires complete session; idempotent; summary → twist); `continueToMission` refused while held: "Watch the main screen: the host reveals the Timeline Twist for everyone."
- `storage.ts`: accept v3–v6, default `show`.
- Tests: setShow/rooms; holdTwist + revealTwist + gate; storage v5 → v6 (v7 corrupt); host.test version 6.

## Batch 2: server
- `pairMatch{hold?}` (holdTwist always for server pairs; skip proceed when hold; reply "Match ready. Start it from the host console.").
- Players: `proceedToAuction` → 403 "The host starts the auction."; `revealTwist` judge-only.
- Console logs for reveal, stage changes, start auction.
- `lanUrls(port)`; `/api/hello` adds `join`. `remote.ts`: `pairMatch(…, hold)`, `hello()`.
- Tests: setShow 403/ok + payload; held pair stays ready, player proceed 403, judge starts with full intro; twist gate (player continue fails, player reveal 403, judge reveal moves both stations); `/api/hello` join.

## Batch 3: state + routing
- `present` route replaces `auctioneer`; alias in `parse()`; motion/GameShell/Palette renames.
- `GameContext`: live flag for `present` (not preview) and `admin/show`; `runFor` adds `proceedToAuction | revealTwist`; `pairMatch(…, hold)`; `setShow`; cross-tab auth listener.
- `App.tsx`: present route renders only the screen + Credit strips (no Palette/Toaster/Pointer).

## Batch 4: presentation (no controls)
- `src/screens/present/Presentation.tsx`: remote only; LoginGate; 200 ms tickFor; stage transition via `play`.
- `src/screens/present/stages.tsx` (no buttons/onClick):
  - Welcome: event name huge, 3–5 how-to-play steps, "Join at {LAN URL}", live registered counter.
  - Teams: grid of all participants (5 columns, staggered enter).
  - Matchups: Room cards with side names, Held/Live/Finished chip, waiting count.
  - Auction: Grid/Focus moved from Auctioneer, controls removed, `Activity` dropped; focus = show.focus → single live room → grid.
  - Twist: sealed state with pulsing ring; after reveal title, strength, headline, TwistGraphic, winners/losers by value delta with buyer names, per-side net shift.
  - Results: podium 3-2-1 then LeaderboardTable; "Judges are scoring. Results soon." when none published.
- CSS `.present` zoom knob + `cursor: none`. Delete `Auctioneer.tsx`.

## Batch 5: host console
- AdminShell: "Show control" section first; "Presentation (open in new window)" link; ShowBar under header.
- `src/screens/admin/Show.tsx`: ShowBar stepper (Back/Next, Ctrl+→ / Ctrl+←, ignored in inputs); ShowSection with preview iframe, rooms table (Start auction / Start now / Pause / Resume / Next technology / Reveal twist / Show on projector, inline errors, offline count), Start all held, "N matches waiting for twist reveal" badge, Clear focus.
- Matchmaking: "Hold until I start it from Show control" (default on); live-match link → Show on projector.

## Batch 6: participant gating + docs
- Summary: held twist → "Watch the main screen…" panel; auto-navigate to twist when reveal arrives while mounted.
- Lobby: ready session → "You're in a match with {names}. Watch the main screen: the host starts the auction."
- MatchSetup: remote `ready` → lobby.
- README: presentation + show control flow (Win+P Extend, F11, shared sign-in, held start, twist gate, shortcuts), schema v6, fix stale v4 mentions, honest limit on twist secrecy. seed-match → `#/present`.

Each batch passes `npm run build && npm run lint && npm test` (no loadtest).

## Risks
- Twist not truly secret (computable from runId); gate only synchronises the reveal.
- Forgotten reveal leaves players on Summary (console badge mitigates).
- Three admin streams (console, projector, preview) each get the full event; watch host CPU.
- 12 bidders + big clock may overflow at zoom 1.25; tune on the real projector.
- Old `#/auctioneer/SES-…` links lose the session parameter.

## Open questions (default in brackets)
1. Twist reveal gate always on for server matches? [yes, no setting]
2. New matches wait for "Start auction"? [hold by default in console]
3. Auto-rotate rooms on projector? [no, host focus + grid]
4. Projector theme? [light paper]
5. Fix twist secrecy properly now? [no, document as honest limit]
