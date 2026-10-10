# MeetQueue — build plan

The repo started as a 10-file Next.js landing-page stub (`frontend/`). It is replaced by a
small, real scheduling product: hosts publish availability and meeting types, invitees book
timezone-aware slots, and the database itself guarantees a host can never be double-booked.

## Shape

```
apps/web       Next.js (App Router) UI, deployed to Netlify
apps/api       Fastify + Prisma REST API, deployed to Render (free web service)
packages/core  Pure TypeScript shared by both: slot engine, ICS builder, zod schemas
```

The browser only talks to its own origin. `apps/web` rewrites `/api/*` to the API, so session
cookies are first-party (`SameSite=Lax`, `HttpOnly`) and Google's OAuth redirect lands on the
public site. Render's free tier sleeps, so the web client retries idempotent requests through
502/503/504s and shows a "waking server…" banner after ~2.5 s.

## Data model (Postgres via Prisma)

| Table                 | Notes                                                                 |
| --------------------- | --------------------------------------------------------------------- |
| `users`               | host account, IANA timezone, public `username`, `is_demo` flag        |
| `sessions`            | SHA-256 of a random cookie token, expiry                              |
| `availability_rules`  | weekday + start/end minute in the host's timezone (several per day)  |
| `meeting_types`       | duration, buffer before/after, min notice, booking horizon, interval |
| `bookings`            | `starts_at/ends_at` plus `blocked_start/blocked_end` (= buffers)     |
| `calendar_connections`| provider (`google`/`mock`), AES-256-GCM encrypted OAuth tokens        |
| `email_logs`          | every notification sent/logged, manage-link tokens redacted          |

**Double-booking guard** — a raw-SQL migration adds

```sql
EXCLUDE USING gist (host_id WITH =, tstzrange(blocked_start, blocked_end, '[)') WITH &&)
WHERE (status = 'CONFIRMED')
```

so two confirmed bookings (including their buffers) for the same host can never overlap, even
under concurrent requests. The API pre-checks the slot for a friendly error, then relies on the
constraint (`23P01` → HTTP 409) for correctness. An integration test fires parallel bookings at
one slot and asserts exactly one wins.

## Slot engine (`packages/core`)

Inputs: weekly rules in the host's zone, meeting-type settings, busy intervals (existing bookings'
blocked ranges + external calendar free/busy), the requested range, and `now`. For each host-local
date it builds availability windows with Luxon (DST-safe), steps by the slot interval, and keeps
starts whose meeting fits the window, respects min notice / horizon, and whose buffered range
doesn't overlap anything busy. Slots are returned as UTC instants and grouped by date in the
invitee's timezone. Booking creation re-runs the same check for the single requested start.

## Integrations (provider pattern, chosen by env)

- **Calendar**: `CALENDAR_PROVIDER=google|mock` (auto: `google` when OAuth creds exist). Google
  uses raw OAuth 2.0 + Calendar REST (free/busy, insert/patch/delete events with
  `sendUpdates=all`). The mock provider simulates consent and returns synthetic event ids, so the
  whole flow runs without keys. The shared demo account is always on the mock provider.
- **Email**: `EMAIL_PROVIDER=smtp|console`. SMTP (nodemailer) works with any free SMTP relay;
  locally docker-compose runs Mailpit so you can read the real messages. ICS (`METHOD:REQUEST` /
  `CANCEL`) is attached whenever Google didn't already send an invite, and is always downloadable
  from the confirmation and manage pages.

## Booking lifecycle

`POST /public/.../bookings` → confirmed booking + one-time manage token (only its hash is stored)
→ calendar event (best effort) → emails. `/manage/<token>` lets the invitee download the ICS,
reschedule (same row is updated, so the exclusion constraint still applies; ICS `SEQUENCE` is
bumped) or cancel (frees the slot, sends `METHOD:CANCEL`). Hosts can cancel from the dashboard.

## Demo

`POST /auth/demo` signs into a seeded host (`/demo`). Demo data self-heals on every demo login
(meeting types restored, upcoming bookings topped up) and can be reset from the dashboard.

## Quality

- TypeScript strict everywhere; zod validation at every API boundary.
- Vitest unit tests (slot engine, ICS, schemas, crypto, Google client with mocked fetch) and
  integration tests against real Postgres (booking flow, concurrency, auth).
- Playwright smoke test: try demo → book on the public page → cancel via manage link.
- GitHub Actions: install, lint, typecheck, unit+integration tests, e2e, docker build.
- `docker compose up` runs Postgres, Mailpit, API and web with seeded data.

## Out of scope for the MVP (tracked as tech debt)

Email verification / password reset, date-specific overrides, team scheduling, distributed rate
limiting (current limiter is in-memory, fine for one Render instance), webhook-based calendar sync.
