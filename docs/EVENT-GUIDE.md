# TimeAuction — Engineering Across Time

Competition web app. React + TypeScript + Vite + Tailwind CSS v4, plus a zero-dependency Node event server.
Runs in two modes, chosen automatically when the page loads:

- **Event-server mode** (live events, up to about 35 stations): one machine runs the event server; every station opens its address.
  Matches have 2 to 12 players each.
  The server is the authority for bids, wallets, ownership, submissions, scores and leaderboard publication.
- **Single-device mode** (no server reachable): the browser holds the event in `localStorage` (`timeauction:game`, schema v6).
  Nothing is shared with other devices.

```
npm install

# Live event: build, then serve the app and the API on port 8787 (prints the LAN address and the superadmin password)
npm run event                 # stations open http://<host-ip>:8787
$env:TIMEAUCTION_ADMIN_PIN="482913"; npm run event   # PowerShell: choose the superadmin password yourself
set TIMEAUCTION_ADMIN_PIN=482913&& npm run event      # Command Prompt
TIMEAUCTION_ADMIN_PIN=482913 npm run event            # macOS / Linux

# Development
npm run server                # event server only (port 8787)
npm run dev                   # http://localhost:5173, proxies /api to the event server when it is running

npm test                      # engine, scoring, leaderboard, integrity, storage, event server concurrency
npm run loadtest              # 34 simulated stations (2 rooms of 12, 1 of 6, 2 of 2) play complete auctions against a real server
npm run seed:match -- 12      # dev: register N players (default 12) on a running server and pair them; prints the session ID
npm run build                 # type-check + production build
```

Event data is written atomically to `event-data/event.json` (plus `claims.json`, `admin-pin`, `server-secret` and `judges.json`). Back it up from
Admin → Integrity & recovery. If the file is unreadable the server refuses to start rather than overwrite it.

## Running on Windows (host PC)
- Install Node.js 22.18 or newer (24 LTS recommended) from nodejs.org.
- Double-click `start-event.bat`. It installs dependencies the first time, asks for the superadmin password / PIN (or generates one),
  builds the app and starts the server. Keep the window open for the whole event; closing it stops the server.
- The first time, Windows Defender Firewall asks whether Node.js may accept connections: allow it on **Private**
  networks (or ask IT to allow inbound TCP 8787). Without this, the station PCs cannot connect.
- Stations open the `http://<host-ip>:8787` address printed in the window, in Edge or Chrome.
- Turn off sleep on the host PC (Settings > System > Power) and pause Windows Update for the day.

## Flow
Register → match setup → auction → summary/log → Timeline Twist → Future Mission → solution (Submit & Lock)
→ scoring (judge) → verification → publication → leaderboard → feedback. Replays get a new, unranked Run ID.

Timeline Twist: one of 30 twists is drawn per run, deterministically from the Run ID (`twistForRun` in `src/data/scenario.ts`), with a strength of mild, normal or severe (`twistStrength`). The twist shows illustrative per-technology values. They do not affect the bot, but each technology a team selects adds or subtracts `round(delta / 10)` points (-5 to +5) automatically. Final score = judges' rubric total (0-100) plus these tool points, so it is not out of 100; the leaderboard ranks by it. Replays draw a new twist.

Technologies: the pool has 50 (`src/data/technologies.ts`). Each match draws its own lots, seeded by the Run ID (`lotsForRun` in `src/game/draw.ts`), so every side in a match sees the same lots in the same order. The run's twist is drawn first; most lots are technologies that move under it (a change of 10% or more, helpful or harmful). The rest are off-theme **Wildcard** lots: 1 for up to 6 lots, 1–2 up to 12, 2–3 above. Wildcards are labelled only “Wildcard”, never with a reason, so the twist stays hidden until after the auction. About one run in five also has a **Bargain lot** that opens at half its starting bid.

Lots per match (standard ruleset; the short ruleset is in brackets):

| Players | Lots | Bid clock |
|---|---|---|
| 2 | 5 (3) | 10 s (8 s) |
| 4 | 8 (6) | 10 s (8 s) |
| 6 | 11 (8) | 10 s (8 s) |
| 8 | 14 (10) | 8 s |
| 12 | 20 (14) | 8 s |

A solution uses at least one of the side's acquired technologies (any number above that), 1–3 characteristics and at least 40 words (about 60 suggested; longer is accepted), written within 5 minutes in a timed session.

The standard count is `clamp(round(1.5 × players) + 2, 5, 20)`; the short count is `clamp(players + 2, 3, 14)`, with 3 for two players. From 7 players the clock is 8 seconds per bid. In matches of 3+ sides, each side may win at most `ceil(lots ÷ players) + 1` technologies. An auction for 12 players is estimated at about 20 minutes (not yet timed at a live event).

Every side starts with 200 ChronoCoins per technology in the match's auction (at least 1,000: 1,000 for 2 players, 1,600 for 4, 4,000 for 12), and each bid rises by 20.
Event administration lives at `#/admin` (link in every footer); in event-server mode it asks for a sign-in. The event lead signs in as
`admin` with the PIN printed by the server, adds judges under Event settings > Judge accounts, and each judge then signs in with
their own name and password. Scoring and admin actions are recorded under the signed-in name.

### Presentation and show control (event-server mode)
- **Projector** at `#/present` (judge sign-in). The host sets the stage: Welcome (the player landing's sky and wordmark), Rules, How to join (LAN address and live registration count), Teams, Matchups, Auction, Twist, Results. The screen
  has no buttons or links and hides the cursor. Auctions show one room big when it is the only live one or when the host picks it
  (**Show on projector**), and as a grid when several are live. Old `#/auctioneer/…` links open the same room.
- **Host console**: Admin → **Show control**, and the Projector bar on every admin page. Back / Next or Ctrl+← / Ctrl+→ change the stage
  (ignored while typing). The room list has Start auction, Pause / Resume, Next technology, Reveal twist and Show on projector. The
  preview at the top is a silent live copy of the projector. Controls are logged on the server console.
- **Set up the projector** on the Windows host PC: open `#/present` in its own window (Admin → Presentation (open in new window)),
  press Win+P and choose Extend, drag the window to the projector and press F11. Sign in on the projector window once; it shares
  the sign-in of the console tab.
- **Held start**: matches made in Matchmaking wait ("Hold until I start it from Show control", on by default) until you press Start
  auction. Untick it to start at once.
- **Twist gate**: a server-paired match stops at the auction summary ("Watch the main screen") until you press Reveal twist, so every station
  moves to the Timeline Twist together. The console shows how many matches are waiting for a reveal.
- A browser signed in as a judge cannot bid; use a separate browser for playing.

Matches in event-server mode are paired by the event team, not by players. One match runs at a time: Matchmaking refuses a new pairing until the current auction has finished. Each player registers, then waits in the lobby
(“Waiting for matchmaking”). A judge opens Admin → **Matchmaking**, selects two waiting players and
presses **Start match**. The match is held until the auction is started from Show control (see above). A match has 2 to 12 players: select that many waiting players and press **Start match**. Each extra
player's station joins its own side automatically (Side B, C, … in the order selected). Each station can then act only for its own side.

Lot pacing is run by the event server, not by players. Each lot first shows its technology for 10 s (“Bidding opens in N s”);
bidding then runs on the bid clock. When a lot is decided it stays on screen for 6 s (“Next technology in N s”) and the next lot
opens by itself. After the last lot the summary opens. Players cannot start, pause or advance lots and cannot bid during the
intro; Show control can skip the intro, pause any countdown, or skip the result pause.
If a station disconnects (refresh, closed tab, lost network), the match keeps going without it; its row shows
"Disconnected" on every station and on the projector until it reconnects. Reopening the same browser tab rejoins the same side.
Players cannot create, discard or replay matches in event-server mode; a judge can cancel a run to put its players back in the queue.
Single-device mode is unchanged in its rules: one browser, one device, both sides at the controls. It keeps the Start, Pause and
Next technology buttons, since there is no host console; the intro and result pause still count down by themselves.

## Structure
- `src/game/` pure, tested logic: `actions.ts` (the single reducer used by both modes), `auction.ts` (engine,
  hash-chained event log), `bot.ts`, `rules.ts`, `scoring.ts`, `event.ts`, `leaderboard.ts`, `integrity.ts`
- `server/` `host.ts` (authoritative state, idempotent requests, side claims, clock, per-subscriber views),
  `index.ts` (HTTP + Server-Sent Events + static files), tests and the load test
- `src/state/` the two providers (local / remote), storage with corruption detection, hash routes
- `src/screens/` participant screens; `src/screens/admin/` administration and the scoring panel

## Honest limits
- Judges have accounts (name + password) and sessions; the event lead is the built-in `admin` user with the server PIN as its
  password. The server runs plain HTTP, so on a shared LAN a password or session cookie can be sniffed. Sign-in is rate-limited
  per IP address and per username+address (5 failures, then a 30-second lockout); the host PC itself (localhost) is never locked out, so sign in there if the lead is ever locked out. Sessions are held in memory: a server restart signs
  everyone out (idle 8 h, 12 h absolute). `event-data/judges.json` stores salted scrypt hashes; if it is corrupt the server
  refuses to start, so move it aside to start with no judges. Single-device mode has no accounts. A Game ID is not a credential:
  registering gives the browser a station key (signed with `event-data/server-secret`, kept in `localStorage`), and the server
  only serves or acts on a registration for the key's owner (and its own side of a match). To move a registration to another
  PC a judge issues a one-time resume code (Admin, Registrations; valid 10 minutes, lost on restart). Registrations per station
  address are unlimited by default, since event PCs are shared (`TIMEAUCTION_REGS_PER_IP=N` caps them; the host PC is exempt).
  A station whose match is over releases its player when it drops to the idle screen, so the next player can register. The key lives in the browser, so anyone
  with that browser profile is that player. Redeeming a resume code, or "Not you? Leave this station" in the lobby, retires every
  earlier key for that registration (`event-data/keys.json`; if it is unreadable the server refuses to start). The key travels in
  the event-stream URL because EventSource cannot set headers; on plain HTTP that is no more exposed than the POST body.
- Matchmates see each other's names, bids, purchases and whether each side submitted, never solutions or drafts. Published totals are
  public on the leaderboard. Judge notes reach only the side they were written for; judge names reach no player. Acknowledging the
  twist from either station advances the shared phase (no screen follows it).
- A refused pass is not cached, so a retry of the same request ID is judged afresh and can apply if it becomes legal later.
- One server process, one JSON file; saves are coalesced every 200 ms, so a hard crash can lose the last fraction of a second.
  Every 5 minutes `event-data/backups/` gets a timestamped copy of `event.json` (last 12 kept, about an hour). To recover
  from a damaged file, stop the server, copy the newest backup over `event-data/event.json`, and start again; up to
  5 minutes of play since that backup is lost.
- Matches have 2 to 12 players. There is no computer opponent: ChronoBot is retired, though runs saved from earlier events still load and show.
  A 12-player auction is estimated at about 20 minutes, so fewer rounds fit a single event slot.
- Saved data is schema v6 (`localStorage` and `event-data/event.json`). v3 to v5 saves load and are upgraded in place (v6 adds the
  projector's stage and focus, with defaults); corruption detection is unchanged.
- Players' streams carry no twist, no Run ID and no unopened lot before the reveal, so reading the page source or network
  traffic does not show them. Lots already auctioned (and Wildcard lots) still hint at the theme by design, and in theory the
  32-bit Run ID could be brute-forced offline from the lots seen so far.
- The projector zoom (`--present-zoom`, 1.25 in `src/index.css`) is not yet tuned on a real 1080p projector; a 12-side auction may need it lowered.
- Checksums detect accidental edits, not tampering. Pitch is not implemented.
- If the server is down when a page loads, that page starts in single-device mode; reload once the server is back.
