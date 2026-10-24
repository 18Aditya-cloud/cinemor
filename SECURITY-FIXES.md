# Cinemor — Security Fixes & Verification Report

Date: 2026-10-24
Scope: backend `story-service` (FastAPI). All fixes were applied to a running
instance, then re-tested with live requests. 20/20 automated checks pass.

How it was tested: a local PostgreSQL 16 database, the real migrations
(`alembic upgrade head`), freshly generated JWT keys, and **mocked** Supabase /
OpenRouter / SMTP so no real credits or emails were used. Each issue was first
reproduced on the original code, then confirmed fixed after the change.

---

## Critical — fixed & verified

### #1 Account takeover on Google (OAuth) accounts
- Before: OAuth users were created with `password_hash = DUMMY_PASSWORD_HASH`,
  whose plaintext (`cinemor-dummy-password`) is published in the docs. Logging
  in with that password returned **200** and a valid session.
- Fix: OAuth users now get a hash of a random 32-byte secret
  (`auth_service.login_with_supabase`). No shared/guessable value can log in.
- Verified: dummy-password login on an OAuth account now returns **401**.
- **Action for you:** regenerate `DUMMY_PASSWORD_HASH` to a fresh random value,
  and update any existing OAuth rows whose hash equals the old dummy hash.

### #2 Password hashes returned to the browser
- Before: register / login / refresh / oauth / account-type / invitations and
  the team-leader, reviewer & employee-search lists returned raw ORM rows,
  exposing `password_hash` and refresh `token_hash`.
- Fix: new `app/api/safe.py` serializers; all those endpoints now return only
  safe fields. Refresh session objects are never returned.
- Verified: `password_hash`, `token_hash`, `$argon2` no longer appear in any
  auth response; login still returns a working `access_token`.

### #3 Unauthenticated story / storyboard generation (credit burn)
- Before: `POST /stories/generate` and `POST /storyboards/generate` had no auth;
  the call reached the LLM provider.
- Fix: both now require a valid access token (`CurrentUser`).
- Verified: unauthenticated call now returns **401**.

### #4 Supabase Postgres exposed over the Data API  *(config — you must apply)*
- If your database is the Supabase Postgres, its public REST API can expose
  every table unless Row Level Security is on.
- Provided: `sql/enable_rls_supabase.sql` — run it in the Supabase SQL Editor
  after migrations. It enables + forces RLS on all public tables and revokes
  anon/authenticated privileges. Cinemor's backend (service role) is unaffected.

### #5 DEBUG on by default
- Fix: `DEBUG` now defaults to **False**; `.env.example` says False. Interactive
  docs / OpenAPI are served only when DEBUG is true.
- Verified: with DEBUG=False, `/docs` and `/openapi.json` return **404**,
  `/health` still **200**; with DEBUG=True, `/docs` returns **200**.

---

## High — fixed & verified

### #6 No rate limits / unbounded generation
- Fix: per-IP rate limiting (`app/core/rate_limit.py`) on login, register,
  oauth, forgot/reset, invite-accept, and the generate endpoints. Video jobs now
  reject models outside `OPENROUTER_VIDEO_MODELS`, and only one active job is
  allowed per story.
- Verified: 11th rapid login from one IP returns **429**; an off-allowlist video
  model raises "Unsupported video model".
- **Still recommended:** a per-user daily generation quota; move rate-limit state
  to Redis if you run more than one worker.

### #7 Video assemble — no ownership check + path leak
- Fix: `assemble_story_video` now runs the ownership check; `output_path`
  (server filesystem path) removed from the response.
- Verified: user B assembling user A's story now returns **404**; no path in body.

### #8 Admin password change without current password
- Fix: `ChangePasswordRequest` now requires `current_password`, verified before
  the change.
- Verified: missing field → **422**, wrong current password → **403**.

### #9 Password reset didn't end existing sessions
- Fix: `reset_password` now revokes all refresh sessions.
- Verified: old refresh token → **401** after reset; new password logs in.

### #10 Invite token leaked in response + hard-coded localhost link
- Fix: raw invitation token removed from the response; the link now uses
  `FRONTEND_URL`.
- Verified: invite response (201) contains no token.

### #11 Production cookie / CORS / proxy config
- Fix: `REFRESH_COOKIE_SECURE` defaults **True**; CORS origins read from
  `CORS_ALLOW_ORIGINS` (never `*` with credentials).
- **Action for you:** set `CORS_ALLOW_ORIGINS` and `FRONTEND_URL` to your real
  domain; run uvicorn behind your proxy with `--proxy-headers`
  `--forwarded-allow-ips` so client IPs (and rate limiting) are correct.

---

## Medium — fixed & verified

- **#13 Account-lock DoS:** per-IP login rate limit added (the per-account
  lockout remains, but brute-force from one IP is throttled first).
- **#14 Unbounded story upload:** `upload_project_story` now caps uploads at
  10 MB (413 over the limit).
- **#15 Weak password on invite-accept:** now requires the full strength rules
  (min 12 chars, upper/lower/digit/special).
  Verified: an 8-char password → **422**.
- **#16 Account enumeration on forgot-password:** email-send failures no longer
  return 500 or change the response; the message is always generic.
  Verified: unknown vs known email both return identical **200**.

### #12 Pre-registration / unverified-email hijack  *(documented, not fully fixed)*
Email ownership is still not verified, so someone could register with an email
they don't own and later collide with the real owner's Google sign-in. Proper
fix is an email-verification flow (send a verify link on signup; block login or
OAuth-merge until verified). This is a feature, not a one-line change — plan it
for the week after launch. Mitigation today: the OAuth account can no longer be
logged into by password (#1), which removes the worst version of this.

---

## Low — fixed

- Debug `print()` statements removed (`individual_routes`, `config`).
- `requirements.txt`: `PyJWT[crypto]` (RS256 needs it) and `Pillow>=13.0.0`
  (pip-audit found 71 CVEs in Pillow 11.3.0 — all fixed in 13.0.0).
- `website_url` on org tools now must be http(s) (blocks `javascript:` / `data:`).
- `.env.example` rewritten to match the real settings with secure defaults.

### #17 Local file storage + in-process video jobs  *(infra, not a code bug)*
Uploads/renders are saved to local disk and jobs run in-process, so a redeploy on
Render/Railway-style hosting loses files and interrupts jobs. For production, move
media to S3 / Supabase Storage and run generation on a worker/queue. No code
change shipped; decide based on your host.

---

## Dependency audit
- Backend (`pip-audit`): 71 CVEs, all in Pillow 11.3.0 → pinned `Pillow>=13.0.0`.
- Frontend: only `react`, `react-dom`, `vite`, `@vitejs/plugin-react`; no code
  changes were made to the frontend. Run `npm audit` in your own environment to
  confirm (the audit endpoint was not reachable from the test sandbox).

## Files changed
```
backend/main.py                                   CORS from env
app/main.py                                       docs gated by DEBUG
app/core/config.py                                DEBUG/cookie defaults, CORS, prints removed
app/core/rate_limit.py            (new)           per-IP limiter
app/api/safe.py                   (new)           safe serializers
app/api/routes/auth_routes.py                     #2 sanitize, #10 token, rate limits
app/api/routes/story_routes.py                    #3 auth, rate limit
app/api/routes/storyboard_routes.py               #3 auth, rate limit
app/api/routes/individual_routes.py               #7 assemble, #14 upload cap, 404 fix, print removed
app/api/routes/organization_dashboard_routes.py   #2 lists, #8 current password
app/services/auth_service.py                      #1 OAuth hash, #9 reset, #15, #16
app/services/organization_dashboard_service.py    #8 verify current password
app/services/video_generation_service.py          #6 model allowlist + single active job
app/schemas/auth.py                               #15 min length 12
app/schemas/organization_profile.py               #8 current_password field
app/schemas/organization_tool.py                  url scheme validation
requirements.txt                                  PyJWT[crypto], Pillow>=13
.env.example                                      corrected, secure defaults
sql/enable_rls_supabase.sql       (new)           #4 Supabase RLS
```

## Pre-deploy checklist (config, do before going live)
- [ ] Fresh `.env`: new JWT keys, new random `DUMMY_PASSWORD_HASH`, strong DB password.
- [ ] `DEBUG=False`, `REFRESH_COOKIE_SECURE=True`.
- [ ] `CORS_ALLOW_ORIGINS` and `FRONTEND_URL` = your real domain.
- [ ] Run `sql/enable_rls_supabase.sql` if the DB is Supabase.
- [ ] Set an OpenRouter spending limit (cheapest safety net).
- [ ] uvicorn behind your proxy with `--proxy-headers --forwarded-allow-ips`.
- [ ] Frontend and backend on same site/parent domain so the refresh cookie is sent.
- [ ] Database backups on; add error monitoring (e.g. Sentry).
