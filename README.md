# Arbitrage Sports Betting Engine

A sports arbitrage ("surebet") scanning engine for East-African bookmakers.
It polls bookmaker odds feeds, recognizes the same fixture across books,
detects markets where the best available odds sum to an implied probability
below 100%, computes the exact stake split that locks in the margin, and
pushes alerts to Telegram.

```
┌──────────┐  ┌─────────┐
│SportyBet │  │ Helabet │   ... adapters (one per book)
└────┬─────┘  └────┬────┘
     └─────────────┘
                 ▼
            NormalizedEvent[] (common model)
                      ▼
          EventMatcher (Betradar id / fuzzy)
                      ▼
        ArbitrageService (Σ 1/odds < 1 ?)
                      ▼
      StakeCalculator (stake_i ∝ 1/odds_i)
                      ▼
     Telegram alert + data/arbs.jsonl log
```

## Status

Active books are **SportyBet TZ** and **Helabet TZ** — the user's own betting
platforms. They're also a good arb pair: SportyBet is Betradar-priced and
Helabet (1xBet) prices independently, so they disagree more than two
Betradar books would.

| Bookmaker | Status | Feed |
|---|---|---|
| SportyBet TZ | ✅ active | `sportybet.com/api/tz/factsCenter/pcUpcomingEvents` — exposes Betradar ids |
| Helabet TZ | ✅ active | `helabet.co.tz/service-api/LineFeed/Get1x2_VZip` (1xBet platform). The 406s were a `count` floor, not auth — `count` must be ≥ ~10. Independent pricing (not Betradar). Matched by fuzzy name + kickoff since 1xBet exposes no Betradar id. Coverage broadened from the ~50-event top feed to ~300 by pulling the busiest leagues via `?champs=<id>` (league ids from `GetChampsZip`). |

Parked (adapters removed, easily restorable from git history): **Betika**
(`api.betika.com/v1/uo/matches`, Betradar-fed) and **betPawa TZ** (fully
independent pricing — best arb source if re-added; GET
`/api/sportsbook/v3/events/lists/by-queries?q=<json>` with header
`x-pawa-brand: betpawa-tanzania`). **Betway** was investigated but uses a
SignalR real-time hub that couldn't be captured headlessly.

Markets covered: **1X2**, **Over/Under (per line)**, **Both Teams To Score**,
**Draw No Bet**, **Asian Handicap (half-lines)**.

## Productivity stats

`npm run stats` (in `engine/`) prints a productivity report:
- **Near-miss scan** — one live scan bucketed by how close each tradable
  cross-book market is to an arb (best-of implied %). With efficient books
  you rarely catch a live arb at the instant you scan; the share of markets
  near 100–101% is the real signal for how often arbs will fire.
- **Arb log summary** — counts, avg/max profit %, and market breakdown of
  every arb the running engine has recorded to `data/arbs.jsonl`.

**Productivity trend (dashboard).** The engine writes one `ScanStat` row per
scan (matched fixtures, tradable markets, tightest implied %, arb count,
markets-under-101/102/103) to SQLite. `GET /api/stats/history?hours=N` serves
that series, and the dashboard charts the **tightest implied %** over time
against the 100% arb line — so you can watch the books drift toward (and dip
below) a surebet, with green dots marking scans that found arbs. Leave the
engine running and the trend builds itself.

## Quick start

**Engine (scanner + HTTP API):**

```bash
cd engine
npm install
cp .env.example .env        # fill in Telegram creds (optional) + DATABASE_URL (preset)
npm run prisma:migrate      # create the SQLite bet-log database (first run only)
npm run scan:once           # single test cycle, prints to console
npm run build && npm start  # run the daemon + API on http://localhost:5001
# (or `npm run dev` for ts-node without a build step)
```

**Dashboard (web UI):**

```bash
cd dashboard
npm install
npm run dev                 # http://localhost:5000  (talks to the engine API)
```

Without Telegram credentials the engine logs the alerts it *would* send —
useful for dry-running. Every alerted arb is also appended to
`engine/data/arbs.jsonl`, and bets you log from the dashboard persist to
`engine/data/arb.db` (SQLite).

## Dashboard (Phase 2)

A Next.js console at `localhost:5000` that consumes the engine's API:

- **Status bar** — per-book health (event counts / down), matched-fixture
  count, last-scan age, and a manual **Scan now** button.
- **P&L cards** — realized profit, ROI on settled bets, open-bet count and
  capital outstanding.
- **Live arbitrage** — auto-refreshing (10s) cards per arb: profit %, teams,
  league, kickoff, each leg's book/outcome/odds/stake, and a **Log this
  bet** button. Suspicious arbs (>12%) are flagged.
- **Bet log & P&L** — every logged bet; settle an open bet by clicking the
  outcome that won (realized P&L is computed from actual odds/stakes) or
  Void it. Lets you track *real* results, including legs that got limited.

The engine exposes: `GET /api/status`, `GET /api/arbs`, `GET /api/scan`,
`GET/POST /api/bets`, `GET /api/bets/summary`, `PATCH /api/bets/:id/settle`,
`DELETE /api/bets/:id`.

## How the math works

For an n-outcome market, take the best odds per outcome across all books.
If `S = Σ 1/odds_i < 1` the market is an arb. Staking
`stake_i = total · (1/odds_i)/S` returns `total/S` no matter the result —
a guaranteed profit of `(1/S − 1) · 100%`. Stakes are rounded to
bookie-friendly amounts and the alert reports the **worst-case** profit
after rounding.

An arb above ~12% is flagged ⚠️ suspicious — in practice that's almost
always a mismatched fixture or a stale/erroneous price, not free money.

**Market-specific notes.** Asian Handicap is restricted to **half lines**
(…-1.5, -0.5, 0.5, 1.5…) so a result can never push or half-void — the
stake split stays a true lock. **Draw No Bet** is included as a no-loss bet
rather than a strict arb: a draw refunds both stakes (break-even), and any
decisive result pays the computed profit. The dashboard and Telegram alert
flag DNB with that caveat. Double Chance is intentionally *excluded* — its
outcomes overlap, so it isn't a clean mutually-exclusive set to arb.

## Realistic expectations

- Typical arbs pay **1–4% per cycle**. Daily profit = bankroll × turnover,
  not software magic: e.g. ~20k–50k TZS/day implies cycling roughly a
  1–3M TZS bankroll through a few arbs every day.
- **Odds move fast.** An arb that survives 10 minutes is rare. Place the
  leg at the softer book first.
- **Bookmakers limit winners.** Sustained arbing gets accounts stake-capped
  or closed ("gubbed"). Round stakes (the engine does this), avoid only
  betting palpable errors, and spread across books/accounts you control.
- Scraping bookmaker endpoints sits against most books' ToS. Endpoints
  change without notice — expect adapter maintenance.

## Roadmap

- **Phase 1 ✅** — scanner core, SportyBet + Betika + Helabet, Telegram alerts.
- **Phase 2 ✅** — engine HTTP API + Next.js dashboard: live arb table, bet
  logging, settlement, bankroll & P&L (Prisma on SQLite; one-line swap to
  Postgres later).
- **Phase 3 ✅** — broadened Helabet coverage (~50 → ~300 events via
  per-league `?champs=` fetch) and added **Draw No Bet** + **Asian Handicap
  (half-lines)**. Matched fixtures roughly tripled (~16 → ~45), and each now
  carries ~5 extra DNB/AH comparison points on top of 1X2/OU/BTTS.
- **Phase 4 (in progress)** — added **betPawa TZ** as a 4th, fully
  independent-pricing book (1X2). Matched fixtures jumped to ~300+ with many
  3- and 4-book overlaps — the most arb-favorable surface yet. Still open:
  per-event fetch to get betPawa's OU/BTTS/handicap markets, European
  handicap (3-way) & first-half markets, middles / positive-EV mode, latency
  optimization, and account/stake management to avoid limiting..
