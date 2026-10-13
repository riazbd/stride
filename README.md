# STRIDE

A full-featured, Strava-style fitness tracking app — running, cycling and training — built as an installable PWA. Record GPS activities, explore segments and routes, join clubs and challenges, follow athletes, give kudos, and watch your fitness evolve.

![STRIDE](public/brand/stride-lockup.svg)

## Highlights

- **Activity recording** — GPS track capture with live stats (pace, speed, heart rate, power, elevation), auto splits, segment matching and a slide-to-save flow. A background-recording state keeps a live session alive while you browse.
- **Accurate stats** — a shared motion model (`src/lib/geo.ts`) rejects GPS teleports, smooths noise and tells stops from slow movement by net displacement, so standing at a light doesn't add distance or moving time. Manual pauses are stored with the track and never bridged.
- **Sensors** — Web Bluetooth heart-rate straps, power meters and speed/cadence sensors; GPX import/export keeps HR, power and pause segments.
- **Feed & social** — activity cards with map previews, kudos, comments, posts with photos, follows, and a notifications inbox with unread badges.
- **Maps & exploration** — MapLibre-based heatmaps, nearby segments with local legends and matched efforts, saved routes, and a full tap-to-build route builder with turn-by-turn cues.
- **Training load & fitness** — rolling fitness/fatigue/form charts, weekly distance, elevation, time-in-heart-rate-zone, training log with weekly summaries, personal records, and trophies.
- **Clubs & challenges** — club feeds with events, club-organizer tools, progress-based challenges (individual, group, private).
- **Gear, profile & settings** — gear mileage tracking, detailed athlete profiles, privacy controls, appearance (light/dark, synced per-account), premium subscription gate with a full paywall flow.
- **PWA** — installable, offline-friendly shell, splash screens, maskable icon, custom brand identity.

## Tech stack

- **Next.js 16** (App Router) + React 19 + TypeScript
- **Tailwind CSS 4** + shadcn/ui-style components, **framer-motion** animations
- **Prisma ORM** on **PostgreSQL**
- **MapLibre GL** maps, **TanStack Query** data layer, **Zustand** state
- Runtime: **Bun** (or Node 20+)

## Status & plan

This started as a Strava clone and is becoming a real product. The full audit, decisions and 26-week roadmap are in [docs/AUDIT_AND_PLAN.md](docs/AUDIT_AND_PLAN.md).

Phase 0 is done: the 24 blockers are fixed, and API tests now cover privacy, security and data integrity. Draft legal texts are in [docs/legal/](docs/legal/) and are waiting for review by a lawyer.

## Getting started

Prerequisites: [Bun](https://bun.sh) (or Node 20+), Git, and [PostgreSQL](https://www.postgresql.org/download/) 14+ installed.

```bash
# 1. install dependencies
bun install

# 2. start a project-local PostgreSQL on localhost:5433 (first run creates
#    the cluster in .pgdata/ and writes DATABASE_URL to .env), then create tables.
#    To use an existing server instead, set DATABASE_URL in .env and skip pg:start.
bun run pg:start
bun run db:push

# 3. seed a realistic demo dataset (athletes, GPS activities on real
#    Dhaka/Berlin/London/Sydney streets, segments, clubs, challenges)
bun run db:seed

# 4. start the dev server
bun run dev
```

Open http://localhost:3000 and sign in with the demo athlete:

| Email | Password |
|---|---|
| `alex@striden.app` | `stridedemo` |

(The seed creates 16 athletes — `nusrat@striden.app`, `tanvir@striden.app`, … all use the same password.)

## Scripts

| Command | What it does |
|---|---|
| `bun run dev` | Dev server on port 3000 |
| `bun run build` / `bun run start` | Production build (standalone output) & serve |
| `bun run lint` | ESLint |
| `bun run test` | GPS accuracy tests, plus the API tests for privacy, security and data integrity (`tests/`). The API tests run only when `TEST_DATABASE_URL` points at a database with "test" in its name; it is created and wiped on every run |
| `bun run pg:start` / `pg:stop` / `pg:status` | Run the project-local PostgreSQL (`.pgdata/`, port 5433) — start it again after a reboot |
| `bun run db:push` | Create/patch the PostgreSQL schema from `prisma/schema.prisma` |
| `bun run db:seed` | Regenerate the demo dataset |
| `bun scripts/brand.py` | Regenerate brand assets (logo, icons, splash art) |

## Project layout

```
src/
  app/            App Router entry, global styles, PWA manifest
  components/app/ Shell + tab bar, cards, charts, map view, brand, UI kit
  screens/        30 feature screens (feed, recording, maps, clubs, …)
  server/         API handlers, auth, seed support
  lib/            nav/recorder/geo/sports/api utilities
  hooks/          React hooks (queries, recorder)
prisma/           Database schema
scripts/          Seed, brand asset generator
public/           Icons, brand art, map styles
```

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | written by `pg:start` | PostgreSQL connection string, e.g. `postgresql://user:pass@localhost:5432/stride` |
| `TEST_DATABASE_URL` | — | Throwaway database for the API tests, e.g. `…/stride_test` (CI sets it) |
| `NEXT_PUBLIC_SITE_URL` | request origin | Base URL used in password-reset links |
| `STRIDE_BETA_UNLOCK` | on | Every feature is free during the beta. Set to `0` once billing exists; then only athletes whose `premium` flag was set by a verified payment get the paid features |
| `ALLOWED_ORIGINS` | — | Extra origins allowed to make write requests with cookies, comma-separated (the Capacitor shell, e.g. `capacitor://localhost`). Everything else cross-site is refused |
| `NEXT_PUBLIC_OSRM_FOOT_URL` | `https://routing.openstreetmap.de/routed-foot` | Route builder walking/running router |
| `NEXT_PUBLIC_OSRM_BIKE_URL` | `https://routing.openstreetmap.de/routed-bike` | Route builder cycling router |

The public routers are fine for development; self-host [osrm-backend](https://github.com/Project-OSRM/osrm-backend) for production traffic.

**Password reset:** "Forgot password?" issues a single-use link valid for 30 minutes. No email service is wired up, so the link is printed to the server console (and, in development, shown in the app).

## Notes

- STRIDE is built by Rootcode and is not affiliated with Strava Inc.
- **Security model:** session and reset tokens are stored as hashes. Cookies are `SameSite=Lax`. Writes must be JSON from our own origin. Sign-in, sign-up, comments and other writes are rate-limited in memory (one process; move this to a shared store before scaling out). A 500 error returns only a request id; the details go to the server log.
- **Recording safety:** an activity being recorded is saved on the phone (IndexedDB) every 5 seconds, so a crashed or closed tab can resume it. Uploads carry a client id, so a retry never creates a duplicate.
- Map data © OpenStreetMap contributors; route geometries in the seed are fetched via OSRM.
