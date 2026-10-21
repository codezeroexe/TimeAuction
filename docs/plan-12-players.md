# Plan: 2 → up to 12 sides per match, bigger tool pool, 15–20 scenarios

Status: Implemented (batches 1–5). Deviations from the plan are listed at the end.

## 1. Where "exactly two sides" lives today
- Types: `src/game/types.ts:66` `SideId = 'A'|'B'`; `:68` match types `ivi|tvt|ivt|ivbot|tvbot`; `:54` TechIcon (5 icons); `EventState.version: 3`.
- Engine: `src/game/auction.ts:10-11` `SIDES`, `other()`; `:58` `sides:{A,B}`; `:75` bot-vs-bot guard; `:84` log note; `:177` settleIfDecided; `:224` bot.
- Bot: `src/game/bot.ts:18,29`, `botLimit` budget share `:20-25` assumes 2 sides.
- Rules: `src/game/rules.ts:14-37` fixed lot lists (5 normal, 3 short), `solutionTechCount` 3/2.
- `summary.ts:34`, `integrity.ts:53,59,73`, `records.ts:23`, `leaderboard.ts:8-14` (category from match type), `event.ts:68` (`waitingParticipants` only checks `sides.B`), `actions.ts:128-160` (`createMatch` A=self, B=opponent).
- Server: `server/host.ts:32` `pairMatch{a,b}`; `:164` claimsFor; `:184` paired lookup; `:266-306` pairing + joinSession hard-wired to B; `:323`, `:328` claim guards.
- Client: `src/state/GameContext.tsx:320` mySide.
- Screens: Auction (single rival), Auctioneer ("A vs B"), Summary, Twist (A's portfolio), Mission, Solution, Results, Lobby, MatchSetup, Leaderboard, admin/Admin, admin/AdminRecords; components bits.tsx, GameShell, auction.tsx chart, LeaderboardTable.
- Tests/loadtest: auction.test.ts, host.test.ts, loadtest.ts (A/B play, 5×2 + 15 bot mix).

## 2. Model for N sides (2..12)
- `SideId = string`, letters A..L, `SIDE_IDS`, helper `sidesOf(session)`. Delete `SIDES`/`other()`. Existing A/B data stays valid.
- New match type `multi` for 3+ sides; leaderboard category derived from units (all individual / all team / mixed).
- `createSession(sides: UnitSpec[])` 2..12, at most one bot.
- Claims already per side: `pairMatch{ gameIds: string[]; bot: boolean }`. First id hosts (Side A); every other side stores its `gameId`; `joinSession` finds the side by caller gameId; claim guard = "this client owns some other side".
- Admin multi-selects 2..12 waiting players, or 1 + ChronoBot. No bot fill in big rooms.
- Single-device hot-seat stays at 2 sides.

## 3. Tool pool and lots per match
50 technologies (5 existing ids kept), each with `tags` and 8 shared icons (one per tag family):

| Tech | Era | Tags |
|---|---|---|
| Electricity | 1880s | energy |
| Battery Storage | 1990s | energy |
| Robotics | 1960s | labour |
| GPS | 1970s–90s | nav |
| Artificial Intelligence | 2010s | compute |
| Steam Engine | 1710s–1800s | energy, labour |
| Solar Photovoltaics | 1950s | energy |
| Nuclear Fission Reactor | 1950s | energy |
| Telegraph | 1840s | comms |
| Radio | 1900s | comms |
| Satellite Relay | 1960s | comms, nav |
| Internet | 1990s | comms, compute |
| Transistor / Microchip | 1950s–70s | compute |
| Refrigeration | 1870s | life |
| Water Purification | 1900s | life |
| Hydroponics | 1930s | bio, life |
| Antibiotics | 1940s | bio, medical |
| Vaccines | 1790s–1950s | bio, medical |
| X-ray Imaging | 1890s | medical, sensing |
| Telescope | 1600s | sensing, nav |
| Compass | 1000s | nav |
| Printing Press | 1440s | comms |
| Steel (Bessemer) | 1850s | materials |
| Concrete / Regolith Masonry | Roman–1900s | materials, shelter |
| 3D Printing | 1980s | fabrication, materials |
| Wheeled Rovers | ancient–1900s | mobility |
| Rocketry | 1940s–60s | mobility |
| Haber-Bosch Fertiliser | 1910s | bio, life |
| Lever & Pulley Cranes | ancient | labour, shelter |
| Windmill / Wind Turbine | 1100s–1980s | energy |
| Fuel Cell | 1960s | energy, life |
| Electrolysis (water splitting) | 1800s | life, energy |
| Laser | 1960s | sensing, fabrication |
| Radar / Lidar | 1940s–70s | sensing, nav |
| Fibre Optics | 1970s | comms |
| Lithography / Microfabrication | 1960s | compute, fabrication |
| Spacesuit (pressure suit) | 1930s–60s | shelter, life |
| Inflatable Habitat | 1960s–2010s | shelter |
| Insulation / Aerogel | 1930s | shelter, materials |
| Mass Spectrometer | 1910s | sensing, medical |
| Genetic Engineering (CRISPR) | 1970s–2010s | bio, medical |
| Composting / Bioreactor | 1900s | bio, life |
| Drone (autonomous flyer) | 2000s | mobility, sensing |
| Electric Motor | 1830s | labour, mobility |
| Atomic Clock | 1950s | nav, sensing |
| Blockchain Ledger | 2000s | compute |
| Weather Forecasting | 1920s | sensing, compute |
| Recycling / Smelting | 1800s | materials, fabrication |
| Telemedicine | 1990s | medical, comms |
| Exoskeleton | 2000s | labour, medical |

50 technologies in total. With 5–20 lots drawn per match, two matches share the exact same lot set almost never (C(50,20) ≈ 4.7 × 10¹³; even C(50,5) ≈ 2.1 million for 2-side matches).

Lots per match: `lotCount(n) = clamp(round(1.5·n) + 2, 5, 20)` (about 1.7 lots per side). Short ruleset: `clamp(n + 2, 3, 14)`.

| Sides | Lots | Auction time (approx.) |
|---|---|---|
| 2 | 5 (as today) | 3.5 min |
| 4 | 8 | 6 min |
| 6 | 11 | 9 min |
| 8 | 14 | 13 min |
| 12 | 20 | 20 min |

Lots drawn per run by a seeded shuffle of the runId (same hash as `twistForRun`), guaranteeing at least one energy and one life tech. Stored in the run, never re-derived. Solution needs 2 techs when 3+ sides.

## 4. Scenarios
Read "scenarios" as timeline twists (one mission kept). 30 twists. Values use tag deltas plus optional per-tech overrides instead of a 30×50 hand table; the 5 current twists keep their exact values as overrides.

1 water-crisis · 2 solar-superstorm · 3 metal-shortage · 4 crew-shortage · 5 earth-silence (existing) · 6 dust-winter (sunlight −90% for months) · 7 pandemic-aboard · 8 reactor-ban · 9 regolith-toxic (perchlorate soil) · 10 launch-window-missed (no resupply 26 months) · 11 quake-swarm · 12 gps-blackout · 13 ai-recall · 14 population-boom · 15 cold-snap (−120 °C nights) · 16 fuel-famine · 17 budget-cut (half cargo mass) · 18 second-colony-rivalry.

Extra twists (30 in total):
19 meteor-strike (impact wrecks the main habitat) · 20 sabotage (a rogue crew member corrupts systems) · 21 corporate-takeover (all patents locked, licensed tech only) · 22 cyberattack (every networked system compromised) · 23 crop-blight (a fungus destroys all plants) · 24 ice-runs-dry (the ice deposit is smaller than mapped) · 25 power-grid-cascade (one fault takes down every circuit) · 26 lost-knowledge (manuals and databases erased) · 27 low-gravity-health (bone and muscle loss hits the crew) · 28 refugee-ship (a damaged ship arrives with 40 extra people) · 29 sky-elevator-collapse (heavy-lift supply lost) · 30 long-night (an orbital shift doubles winter length).

Note: twist 12 (gps-blackout) overlaps solar-superstorm; replace it with one of 19–30 if preferred.

## 4b. Extra randomness per run (all seeded from runId, stored in the run)
- Lots: drawn from 50 techs (see §3).
- Lot order: shuffled after the draw, so the strongest tech is not always early.
- Twist: one of 30.
- Optional twist strength: mild / severe (deltas ×0.6 or ×1.3, rounded, kept within −50..50). Shown on the Twist screen.
- Optional "wildcard lot": with 20% chance, one lot opens at half its starting bid. Announced on the auctioneer screen.
- Fairness guard: every side sees the same lots and twist, so luck is shared, never per player.

## 5. Economy and rules
- 1,000 ChronoCoins per side regardless of n; bid increment stays 20.
- Pass is final per lot; lot closes when all but the leader pass, or on the clock.
- No ties: bid must equal the next valid bid; server serialises, first wins.
- Optional portfolio cap: at most `ceil(lots/n) + 1` wins per side.
- Bot budget share `balance / max(1, ceil(lotsLeft·2/n))` (same as today for n=2).
- Integrity: loop over all sides; check 2 ≤ sides ≤ 12, ≤1 bot, distinct gameIds, lots count. Informational collusion note when a lot sells at start price with most sides passing instantly.

## 6. UI (1080p, desktop only)
- Auction: your panel + compact bidder table (name, wallet, items won, Leading / In / Passed).
- Auctioneer: left 60% lot, bid, leader, clock; right 40% bidder table, "Lot k / L".
- Summary/Results: grid of side cards. Twist shows your own side's portfolio. Lobby: "You are Side X in an n-side match".
- Admin matchmaking: multi-select, ChronoBot toggle only with 1 player, "Start match (n)" enabled for 2..12.

## 7. Server load
~13 subscribers per 12-side room; each accepted bid pushes ~13 payloads. Payload grows with the log (~90 KB per session worst case) — measure before optimising. Loadtest mix: 2 rooms × 12 + 1 room × 6 + some vs-bot rooms; target 0 issues and p95 bid ack under 300 ms.

## 8. Saved data
Bump schema v3 → v4. v3 data is already valid v4 (A/B ids fit), so migrate by changing the version number; corruption detection unchanged; server still refuses unreadable files.

## 9. Batches (each passes `npm run build && npm run lint && npm test`)
1. Engine generalised to N sides; 2-side behaviour identical. Tests: 4-side lot closes when 3 pass, clock sale to leader, rejects 13 sides / 2 bots, bot limit unchanged for n=2.
2. Data: 50 techs with tags, 30 twists with tag deltas, `lotCount`, `lotsForRun`. Tests: every tech valued under every twist, deltas in −50..50, deterministic lots without duplicates.
3. Server + state: `pairMatch{gameIds,bot}`, join by gameId, claims, mySide, v4 migration. Tests: pair 5 players, each controls only its own side, busy player not re-paired, v3 file loads, corrupt file refused.
4. UI: auction bidder table, auctioneer projector layout, summary/results grid, admin multi-select. Manual check at 1920×1080 with 12 stations.
5. Loadtest + docs.

## Risks
- 12-side auction ≈ 20 min; fewer rounds fit the event.
- Some sides may win 0–1 techs (mitigated by cap and 2-tech rule).
- Writing 45 techs + 25 twists is the slow part; split content into its own batch if needed.
- Payload size unmeasured; projector readability with 12 rows untested.

## Open questions (recommended default in brackets)
1. Lot formula `clamp(round(1.5n)+2, 5, 20)` and 8 s clock when n ≥ 7? [yes]
2. "Scenarios" = twists only, or also varied missions? [18 twists, 1 mission]
3. Portfolio cap `ceil(lots/n)+1`? [yes]
4. Techs required in solution for 3+ sides? [2]
5. ChronoBot in big matches? [only vs a single player]

## 10. Deviations (as built)
- Short ruleset: 3 lots for 2 sides, otherwise `clamp(sides + 2, 3, 14)` (as planned; the 2-side case is pinned to 3).
- ChronoBot only in 2-side matches (one player against the bot); no bot fill in bigger rooms.
- Bidder table only for 3+ sides.
- Summary ordering by wallet / published score.
