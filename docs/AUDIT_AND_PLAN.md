# STRIDE — Audit & Product Plan

Oct 13, 2026 · Minhajul Islam (Rootcode)

> Copy of the living doc at <https://claude.ai/code/artifact/5bfcfd68-b44a-4765-9faa-220f202dfaee>. The doc is the source of truth; update this file when it changes.

STRIDE looks like a finished Strava clone but is still a prototype underneath: privacy leaks, security holes, broken account deletion, made-up heart-rate data and a web-only recorder would all fail real users. The plan: fix the critical issues in 2 weeks, rebuild the foundation over 6, wrap the web app as an Android/iOS app with Capacitor for reliable recording, then stop copying Strava and become the athlete community for Bangladesh.

## Scorecard

The breadth and polish are excellent; everything a real user can't see is weak. I read all ~17,000 lines of app code, ran the API and tested the bugs below against the live server.

| Area | Grade | Why |
| --- | --- | --- |
| Feature breadth | A− | 34 screens: recording, segments, routes, clubs, challenges, fitness, sensors, GPX |
| Visual polish | B+ | Native-feeling mobile UI, dark mode, motion; but copies Strava's look, desktop is a phone frame |
| GPS accuracy | B | Fixed this week: 2-minute stop now +0.3% distance (was +8%), recorder no longer freezes |
| Privacy | F | Logged-out visitors can download any athlete's full tracks, home start point included |
| Security | D | Cross-site request forgery (CSRF) exposure in production, no rate limits, anyone can grant themselves Premium |
| Data integrity | D | Account deletion fails, duplicate kudos, gear and goal maths wrong |
| Honesty of data | D | Invented heart-rate curves, fake effort scores, fake member counts, fake Report button |
| Architecture | D+ | One page with in-memory navigation, no URLs, full GPS tracks loaded for every feed card |
| Recording reliability | D | Browser stops GPS when the phone locks; an unsaved ride lives only in memory |
| Code health | C | Types clean now, but lint rules mostly off, 16 tests, ~20 unused packages |
| Business readiness | F | No real payments, email, moderation, terms or privacy policy |

## Fix first: blockers for real users

These 24 issues must be fixed before anyone outside the team signs up; most take hours, not days. Items marked *verified* were reproduced against the running server.

> **Status, 13 October 2026: all 24 are fixed.**
>
> - Each fix is checked by an API test in `tests/api.test.ts`. The tests run on every push in GitHub Actions (`.github/workflows/ci.yml`).
> - #8: there is no payment system yet. Instead, everything is free during the beta, and the server decides access in one place (`src/server/entitlement.ts`).
> - #22: training load now uses heart rate when a sensor recorded it. Otherwise it uses the athlete's effort rating, or an estimate for the sport, and the app labels which one it used.
> - The privacy policy and terms of service are drafted in `docs/legal/` and are waiting for review by a lawyer.

| # | Type | Problem | Where | Fix |
| --- | --- | --- | --- | --- |
| 1 | Privacy | Heatmap returns every public track to logged-out visitors, ignoring privacy zones (*verified*: 34 tracks with exact start point) | `athletes.ts` heatmap | Owner-only endpoint; clip zones; require login |
| 2 | Privacy | Private ("Only you") activities still appear on public segment leaderboards | segment matching on save | Exclude non-public efforts from boards |
| 3 | Privacy | Followers-only activities shown to non-followers in club feeds and the Clubs feed | `clubs.ts`, `feed.ts` | Check the follow relation per activity |
| 4 | Privacy | Height, weight and sex visible on every profile, even logged out (*verified*) | `getAthlete` | Return them to the owner only |
| 5 | Privacy | Save screen always defaults to "Everyone", ignoring the user's default visibility | `save-activity.tsx` | Pre-select the saved default |
| 6 | Privacy | Any logged-in user can download another athlete's full GPX | `exportGpx` | Owner-only export |
| 7 | Security | Production cookies use `SameSite=None`, and the API parses any body as JSON: cross-site forgery possible | `session.ts`, router | `SameSite=Lax`, require `application/json`, check `Origin` |
| 8 | Security | Anyone can turn on Premium with one API call, no payment | `premiumAction` | Real billing with server-verified receipts |
| 9 | Security | Any user can create events in any club | `createEvent` | Owner/admin check |
| 10 | Security | Premium features are hidden only in the browser; the APIs are open | training log, fitness | Enforce on the server |
| 11 | Security | No rate limits on login, signup, comments or reset | router | Per-IP and per-account limits |
| 12 | Security | 500 errors return raw Prisma messages and server paths (*verified*) | router `catch` | Generic message + request id; log details |
| 13 | Security | Session tokens stored in plain text; logout ends every device | `session.ts`, `auth.ts` | Store a hash; log out one session |
| 14 | Data | Account deletion fails on foreign keys after logging the user out (*verified*); a legal problem under GDPR | schema, `deleteAccount` | Cascades/anonymise, in one transaction |
| 15 | Data | Kudos can be duplicated; the feed's kudos button never updates, so a second tap removes it | schema, `cards.tsx` | Unique (activity, athlete); fix the infinite-query cache update |
| 16 | Data | Follow, member and star counters updated outside transactions; double taps cause 500s | handlers | Transactions + idempotent endpoints |
| 17 | Data | Challenge completion is never saved, so no badges are ever earned | analytics | Evaluate on activity save |
| 18 | Data | Time goals are 60× off (hours vs minutes); goals mix km and miles | `me.ts`, profile, feed | One unit model end to end |
| 19 | Data | Manual entry labels miles but saves kilometres | `manual.tsx` | Convert input by the athlete's units |
| 20 | Data | Gear mileage never drops when an activity is deleted or re-assigned; gear can't be retired | `activities.ts`, `gear.tsx` | Derive mileage from activities; add Retire |
| 21 | Honesty | Activities without a strap show an invented heart-rate chart | `analysis` endpoint | Show HR only when recorded |
| 22 | Honesty | Relative Effort assumes 150 bpm for everyone, so Fitness charts are built on made-up load | `createActivity` | Heart-rate load when HR exists, otherwise pace + perceived effort, labelled |
| 23 | Reliability | A recording and its unsaved draft live only in memory; a killed tab loses the ride | `recorder.ts` | Write points to IndexedDB every few seconds; retry uploads |
| 24 | Honesty | "Report" only shows a toast; club member and challenge counts in the seed are invented | `sheets.tsx`, seed | Real reports queue; real counts |

## Engineering foundation

The biggest structural fixes are real URLs, a native recorder and moving heavy work out of the request path. Everything else here is standard hardening.

| Problem today | What it breaks | Replace with |
| --- | --- | --- |
| Whole app is one client page; navigation lives in memory | No shareable activity links, no deep links or SEO; refresh loses your place; "Share" copies the homepage | Next.js routes per screen (`/activities/[id]`, `/athletes/[id]`, `/clubs/[slug]`), server-rendered public pages with preview images |
| Recording runs in the browser | iPhone and most Androids stop GPS when the screen locks; no Web Bluetooth on iPhone | The same web app wrapped with Capacitor for Android/iOS, using native background-location and Bluetooth plugins; one codebase |
| Feed loads every full GPS track to draw small thumbnails | Slow feed, heavy memory use, caches lost on restart | Save a simplified line and bounding box with each activity |
| No indexes on hot queries; free-text strings for sport and visibility | Slow queries as data grows; typos stored as data | Indexes, Postgres enums, PostGIS for start points and segments |
| Each save scans every segment and rewrites every rank | Saves slow down linearly; leaderboards show one athlete many times | Spatial lookup; leaderboard = best effort per athlete; ranks computed on read |
| Matching, notifications and ranks run inside the request | Slow saves, nothing can be retried | Background job queue on Postgres (pg-boss) |
| No input validation; `zod` installed but unused | Bad data in, odd 500s | A `zod` schema per endpoint, shared with the client |
| Days and weeks grouped in UTC | A 5 AM run in Dhaka lands on yesterday | Store the activity's local date; bucket in the athlete's time zone |
| Esri map tiles used without a licence; MapLibre installed but unused | Legal risk at launch | MapLibre with licensed vector tiles (MapTiler or self-hosted Protomaps) |
| km/miles converted ad hoc in 20+ places | At least 6 unit bugs found | One units module, SI on the server, unit tests |
| No file storage | No photos or avatars possible | S3-compatible storage (Cloudflare R2) + image resizing |
| Home-grown auth with no email | No verification, no real reset emails, no Google/Apple sign-in | Transactional email (Resend or SES) + social sign-in |
| No monitoring | Errors go unseen | Sentry, structured logs, uptime checks |
| 16 tests; lint rules almost all switched off | Regressions ship silently | Re-enable React hooks rules, API tests on a test database, Playwright end-to-end, CI on every push |
| Desktop is a 430 px phone frame; zoom disabled; scrollbars hidden | Poor desktop analysis; fails accessibility basics | Responsive layout, pinch-zoom allowed, touch-scrubbable charts |
| English only, US date formats | Misses the home market | `next-intl` (already installed) with English + Bangla |
| ~20 unused packages, 35 unused UI components, dead Tailwind config, sandbox paths in `brand.py` | Bigger installs, confusion | Delete them |

## Feature critique

Nothing needs throwing away, but only 2 of 16 features are finished as they stand. The rest look complete on screen and are hollow or wrong underneath.

| Feature | Verdict | Good today | Wrong or missing |
| --- | --- | --- | --- |
| Recording | Rework | Clean UI; accurate since this week's fixes; pause, laps, sensors | Dies on screen lock; no crash recovery, audio cues, route following, workouts or treadmill mode |
| Activity page | Fix | Splits, playback, elevation/pace/power charts, grade-adjusted pace | No photos or share link; mile splits computed wrongly in the browser; can't edit or delete comments |
| Feed | Fix | Infinite scroll, posts, suggestions | Kudos button bug; text-only posts; no mute; group runs not merged into one card |
| Segments | Rework | Matching works on real streets | One athlete fills many leaderboard rows; no filters (age, sex, this year); users can't create segments; no cheat detection (car speeds) |
| Routes | Rework | Real road snapping, now by foot or bike | Elevation always 0; no GPX export; can't follow a route while recording |
| Clubs | Rework | Join, feed, members, events, RSVP | No event creation screen or admin tools; owner can leave and orphan the club; private clubs unused; no club posts |
| Challenges | Rebuild | Join and live progress | Hard-coded to October; completion never saved; no leaderboard; no club or sponsor challenges |
| Fitness & training load | Rework | Correct 42/7-day model | Built on invented effort scores; UTC day bug; Stats "Relative effort" chart is really distance |
| Goals | Fix | Weekly, monthly, yearly | Unit bugs; time goals 60× off |
| Gear | Fix | Per-gear mileage | Can't retire; mileage drifts; no "replace your shoes" alert |
| Sensors | Keep | Heart rate, speed/cadence, power over Bluetooth | Chrome on Android/desktop only; wheel speed not used indoors |
| Profile & follows | Fix | Clean profile, stats, follows | No photos, private profiles, follow approval (promised in Privacy), blocking or muting |
| Notifications | Fix | In-app inbox, unread badge | No push or email; taps open lists, not the item |
| Search | Keep | Athletes, clubs, segments | No debounce or paging |
| Premium | Rebuild | Polished paywall | Fake purchase; USD only; gating client-side |
| Account & settings | Fix | Units, theme, privacy zones, password | Deletion broken; no data export, email change or notification settings |

## Product direction: stop being a clone

Recommendation: don't fight Strava globally. Become the training and community app for athletes in Bangladesh, then South Asia, where Strava is generic and foreign. The seed data already points there: BDCyclists, Dhaka Runners, Hatirjheel, Gulshan Lake.

**Four pillars**

1. **Local first.** Bangla interface, Taka pricing paid through bKash or Nagad, a low-data mode for budget Android phones.
2. **Clubs and races at the centre.** Real tools for club organisers (events with routes, attendance, dues) and a race hub (registration, results, official race-course segments).
3. **Safety and conditions.** Live tracking that family can follow on night rides and early runs; air quality and heat on the record screen, with advice when it's unsafe to push.
4. **Honest analytics.** Only measured data, clearly explained; never an invented number.

**Brand.** Today the app wears Strava's orange (#FC4C02) and its vocabulary: KOM/CR, Local Legends, Relative Effort, Fitness & Freshness. That invites trademark trouble and leaves you without an identity of your own. Keep the Route-S mark, choose your own colour, and rename the signature features. Run a trademark search on "STRIDE" before spending on the brand; it is a common name.

**How it makes money**

| Stream | Who pays | Notes |
| --- | --- | --- |
| Premium | Athletes | Free during the beta; later monthly or yearly in Taka via bKash/Nagad; deeper analysis, training plans, full leaderboards |
| Club Pro | Clubs | Organiser tools: event management, member dues, branded club page |
| Race hub | Race organisers | A fee per registration, plus results and photo services |
| Sponsored challenges | Brands | Sportswear, drinks and banks sponsor monthly challenges with real rewards |

## New features

The must-haves make it trustworthy; the differentiators are why someone in Dhaka picks it over Strava. Phase numbers match the roadmap below.

| Feature | Why it matters | Group | Phase |
| --- | --- | --- | --- |
| Crash-safe native recorder (background GPS, Bluetooth sensors) | The core promise: a ride is never lost | Must-have | 2 |
| Offline recording with later sync | Signal drops on highways and in buildings | Must-have | 2 |
| Photos on activities and posts; profile pictures | The single most social thing an activity can carry | Must-have | 1 |
| Share cards (map + stats image) and public activity links | Growth runs through Facebook, Instagram and WhatsApp | Must-have | 1 |
| Push and email notifications | Kudos and comments only matter if people see them | Must-have | 1–2 |
| Report, block, mute, private profiles, follow approval | Basic safety before strangers meet | Must-have | 1 |
| Working data export and account deletion | Legal requirement (GDPR) and user trust | Must-have | 0–1 |
| Watch imports: .FIT/.TCX files, Garmin and COROS, Health Connect / Apple Health | Serious athletes record on watches, not phones | Must-have | 3 |
| Audio cues in English and Bangla | Runners don't look at screens | Must-have | 2 |
| Follow a route with turn alerts; GPX export | Makes the route builder useful | Must-have | 3 |
| Live tracking for family, with an alert if you stop too long | Night rides, women running at dawn: a real local need | Differentiator | 4 |
| Air quality and heat on the record screen, with pacing advice | Dhaka's AQI and heat change what a safe session is | Differentiator | 4 |
| Race hub: calendar, registration, results, official course segments | Owns race day, a recurring local moment | Differentiator | 4 |
| Club organiser suite: events with route and meeting map, attendance, dues via bKash | Clubs bring their members with them | Differentiator | 3–4 |
| Bangla interface, Taka pricing, low-data mode | Fits the market Strava ignores | Differentiator | 4 |
| Training plans (first 5K, half marathon, first 100 km ride), adapting to what you log | Turns tracking into coaching; a reason to pay | Differentiator | 5 |
| Monthly challenges on a schedule, with badges and club challenges | Retention engine; currently hard-coded to October | Engagement | 3 |
| "Ran with" grouping of shared activities | Social proof of clubs at work | Engagement | 3 |
| Segment filters and user-created segments, with cheat detection | Keeps competition fair and fresh | Engagement | 3 |
| Streaks, milestones and a year-in-review | Shareable moments that bring people back | Engagement | 5 |

## Roadmap

About 26 weeks to a Dhaka launch, with a gate between each phase. The estimates assume one full-time developer working with Claude; the app phase is short because it stays one web codebase wrapped with Capacitor.

| Phase | Weeks | Work | Gate to leave the phase |
| --- | --- | --- | --- |
| 0 · Fix critical issues | 1–2 | Privacy leaks, CSRF, Premium bypass, account deletion, kudos, units, invented data; recordings saved to the phone as they happen | All 24 blockers closed, privacy tests running in CI |
| 1 · Rebuild the foundation | 3–8 | Real URLs and share links, photos, email, push, job queue, indexes, PostGIS; validation, rate limits, monitoring, licensed maps, CI with end-to-end tests | Public activity links work; errors and latency on a dashboard |
| 2 · Android/iOS app (Capacitor) | 9–12 | Capacitor shell: background GPS, Bluetooth sensors, offline sync, audio cues; same web codebase and GPS engine, only the GPS and Bluetooth plugins are native | ≥ 99.5% of test recordings saved, distance within ±1% on measured courses |
| 3 · Finish the core | 13–20 | Fair leaderboards, user segments, cheat checks, route following, GPX export; club organiser tools, scheduled challenges with badges, watch file import | Every feature in the critique rated Keep |
| 4 · Launch in Dhaka | 21–26 | Bangla interface, Taka pricing via bKash and Nagad, low-data mode; live safety tracking, air quality and heat, race hub, 2–3 pilot clubs | Day-30 retention ≥ 25% among pilot club members |
| 5 · Grow and earn | 27 onward | Training plans, sponsored challenges, Club Pro and race-hub fees; Garmin and COROS sync, year-in-review, expansion across South Asia | — |

Phases run back to back: a phase starts only when the previous gate is met, so a slip moves everything after it. Phase 0 can start today.

## Success metrics

The first two decide whether athletes trust the app; the rest decide whether it grows. Targets are proposals for the Dhaka beta.

| Metric | Target | Why |
| --- | --- | --- |
| Recordings that save with no data loss | ≥ 99.5% | One lost long run loses that athlete |
| Distance error on measured courses (track, certified routes) | Median within ±1% | The number athletes argue about |
| Privacy incidents | 0 | One leak of a home location ends trust |
| New users recording within 7 days | ≥ 50% | Activation |
| Weekly recorders ÷ monthly actives | ≥ 40% | Habit |
| Day-30 retention | ≥ 25% | Product fit |
| Activities getting a kudos or comment within 24 h | ≥ 70% | The social loop works |
| Sign-ups that come through a club or race | ≥ 30% | Validates the club-led strategy |
| Monthly actives on Premium | 3–5% | Business viability |
| API response time, 95th percentile | < 300 ms | Feels instant on mobile data |

## Decisions made

All eight decisions were taken on Oct 13, 2026; the plan above already reflects them.

| Decision | Choice | What it means |
| --- | --- | --- |
| Platform | Web + Capacitor app | One Next.js codebase; Android/iOS shells add background GPS and Bluetooth plugins; the app phase shrinks to about 4 weeks |
| Market | Bangladesh first | Bangla UI, Taka pricing, local clubs and races, air quality, heat and safety; South Asia later |
| Brand | Keep STRIDE, own look | Trademark check on the name; a new primary colour; rename KOM/CR, Local Legends, Relative Effort, Fitness & Freshness |
| Payments | Free beta, billing later | Phase 0 removes the fake purchase; bKash/Nagad billing once Rootcode's merchant account is ready |
| Hosting | Own VPS (roothost, ISPConfig) | Node app run by PM2 or systemd behind ISPConfig's web server as a reverse proxy with Let's Encrypt; PostgreSQL installed beside it (ISPConfig does not manage Postgres); nightly off-server database backups; photos on disk at first |
| Team | Solo with Claude | Roadmap timings assume one developer |
| Pilot | Keep options open | Clubs, a race or your own network: whichever is easiest when the beta is ready |
| Legal | Draft in Phase 0 | Privacy policy and terms written alongside the privacy fixes, reviewed before the beta |
