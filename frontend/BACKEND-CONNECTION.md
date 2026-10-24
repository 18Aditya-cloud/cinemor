> **Security update (Oct 2026):** see `SECURITY-FIXES.md` in the project root for what changed (email
> verification, fixes for the problems listed below, and the deploy checklist). Most items in "Problems" below
> are now fixed.

# Connecting the frontend to the Cinemor backend

This frontend talks to the backend in `cinemor-main/backend` (FastAPI, "story-service").
Every page was tested against that backend running on a real PostgreSQL database:
sign up → invite → accept → Team Leader → projects → log out, 52 end-to-end checks, all passing.

- Leave `VITE_API_URL` **empty** and the site runs on its own demo data, the same as the hosted preview.
- Set `VITE_API_URL=http://localhost:8000` and every page uses the real backend.
  Nothing else changes, and no page code is different between the two modes.

---

## 1. Do I need a database?

**For the frontend alone: no.** In demo mode it needs nothing at all.

**For the backend: yes, it cannot start without one.** `DATABASE_URL` is a required setting, and every
account, project and client is stored there. The backend uses **PostgreSQL**, and its tables are created
by the Alembic migrations in `backend/services/story-service/alembic/`.

You can set the database up now or later. Until you do, just keep `VITE_API_URL` empty and keep using
demo mode. Any PostgreSQL will work:
- **On your computer:** install PostgreSQL 14+ and create an empty database called `cinemor`.
- **Online:** your Supabase project already includes a PostgreSQL database. Use its connection string
  from Supabase > Project Settings > Database, written as `postgresql+psycopg://...`.

A brand-new, empty database was checked: `alembic upgrade head` creates all 18 tables from nothing.

---

## 2. Run the backend (once the database exists)

From `backend/services/story-service`:

```bash
pip install -r requirements.txt
pip install cryptography          # needed for RS256 login tokens, but missing from requirements.txt (see Problems)
```

Create `backend/services/story-service/.env`. Use the `.env.example` from the backend zip; the old one in
the repository is out of date and the backend will not start from it. Values you must fill in:

| Setting | What to put |
|---|---|
| `DATABASE_URL` | `postgresql+psycopg://postgres:YOUR_PASSWORD@localhost:5432/cinemor` |
| `JWT_PRIVATE_KEY_B64`, `JWT_PUBLIC_KEY_B64` | Generate them with the command below |
| `DUMMY_PASSWORD_HASH` | Generate it with the command below |
| `SMTP_USERNAME`, `SMTP_PASSWORD`, `EMAIL_FROM` | A Gmail address and a Gmail **App Password** (Google Account > Security > App passwords; needs 2-step verification). Invitation and reset emails are sent this way |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Your Supabase project (only "Sign in with Google" uses them) |
| `OPENROUTER_API_KEY`, `RESEND_API_KEY` | Required to start. Any text works until you use story writing; Resend is not used at all |

Generate the keys (works on Windows too, no openssl needed):

```bash
python -c "from cryptography.hazmat.primitives.asymmetric import rsa; from cryptography.hazmat.primitives import serialization as s; import base64; k=rsa.generate_private_key(public_exponent=65537,key_size=2048); print('JWT_PRIVATE_KEY_B64='+base64.b64encode(k.private_bytes(s.Encoding.PEM,s.PrivateFormat.PKCS8,s.NoEncryption())).decode()); print('JWT_PUBLIC_KEY_B64='+base64.b64encode(k.public_key().public_bytes(s.Encoding.PEM,s.PublicFormat.SubjectPublicKeyInfo)).decode())"
python -c "import secrets; from pwdlib import PasswordHash; print('DUMMY_PASSWORD_HASH=' + PasswordHash.recommended().hash(secrets.token_urlsafe(32)))"
```

Create the tables, then start the server:

```bash
# in backend/services/story-service
alembic upgrade head

# in backend/
py -3.10 -m uvicorn main:app --reload        # or: python -m uvicorn main:app --reload
```

Open http://localhost:8000/health; it should say `"status": "ok"`.

## 3. Run the frontend

```bash
cp .env.example .env          # then set VITE_API_URL=http://localhost:8000
npm install
npm run dev
```

Open **http://localhost:5173**. Use `localhost`, **not** `127.0.0.1`: the login cookie comes from
`localhost:8000`, and on `127.0.0.1` a page reload logs you out (this was tested).

---

## 4. What is connected

| Area | Pages | Backend |
|---|---|---|
| Sign up, log in, log out | Sign up (Individual / Organization), Log in, account menu | `/api/auth/register/*`, `/login`, `/refresh`, `/logout`, `/me` |
| Stay signed in | Every page, after a reload | Refresh cookie → `/api/auth/refresh` |
| Forgot / reset password | Forgot password, the emailed `/reset-password` link | `/api/auth/forgot-password`, `/reset-password` |
| Google sign-in | Google buttons, `/auth/callback`, `/choose-account` | Supabase → `/api/auth/oauth/supabase`, `/account-type` |
| Invitations | Invitations page, the emailed `/accept-invitation` link | `.../employees/invite`, `/api/auth/invitations/accept` |
| Organization profile | Settings (name, business type, address) | `/api/organizations/{id}/profile` |
| Password and sessions | Settings (change password, log out of all devices) | `.../profile/password`, `/api/auth/logout-all` |
| Tools | Tools page | `/api/organizations/{id}/tools` |
| Job roles and permissions | Job Roles page (with features and tools) | `/api/auth/organizations/{id}/job-roles`, `/job-role-features` |
| Employees | Employees page and its Update window | `.../employees`, `.../capacity`, `.../job-roles`, `.../responsibilities` |
| Team Leaders, Reviewers | Both pages, including the "Remove as ..." buttons | `.../employees` and `.../responsibilities` |
| Clients | Clients page | `/api/organizations/{id}/clients` |
| Projects | Projects page (cards and table) | `/api/organizations/{id}/projects` |
| Overview | Counts, getting-started steps | The lists above |
| Team Leader dashboard | Dashboard, My Projects, a project (team, status), Team | `/api/team-leaders/{id}/...` |

### Not connected yet, because the backend doesn't have it

These work in demo mode. With the backend connected, the page hides the button or shows "not available yet".

- **Individual dashboard** (projects, clients). This backend has no `/api/individual/...` routes (the
  `individual_routes.py` you showed earlier is not in this zip). With the backend, an individual really signs up and
  logs in, but their projects and clients are still saved **in the browser**. When those routes arrive, only
  `src/dashboard/individual/individualApi.js` changes; its top comment lists every route and field.
- **Recent activity** on the Overview: no endpoint.
- **Deleting a job role, cancelling an invitation**: no endpoints.
- **Production stages** (Story → ... → Video) on project cards: the backend only has a status (not started,
  ongoing, completed, aborted), so the cards show that instead.
- **Client name for a Team Leader**: the backend sends only `client_id`, so it shows "-".
- **Changing the password inside the app** for individuals and employees: the backend only has this for an
  organization admin. Their Settings page instead has "Email me a reset link" (the backend's forgot-password email).

### In the backend, but no page yet (ignored for now, as you asked)

- `GET /models`, `POST /stories/generate` (story writing): `src/services/storyApi.js` already matches both,
  ready for the Studio page.
- Editing or deleting a tool, and searching employees.

---

## 5. Problems found in the backend

Only **#1** was changed in the backend (it was required: the frontend cannot fix it). The rest are reported, not changed.

1. **FIXED: logging out didn't delete the login cookie.** `POST /api/auth/logout` set the "delete cookie" header on
   one response object but returned a different, new `Response(204)`, so the browser kept the dead refresh token.
   On the next visit the backend saw a used token, reported "Refresh token reuse detected", and **logged that
   person out on every device**. Fixed in `app/api/routes/auth_routes.py` (see the backend zip).
2. **Password hashes are sent to the browser.** `register/organization`, `register/individual`, `login`,
   `refresh`, `invitations/accept`, `team-leaders`, `reviewers` and `employees/search` return the whole user row,
   including `password_hash`, and login and refresh also return `refresh_session.token_hash`. The frontend never uses
   them, but anyone can see them in the browser's Network tab. Fix: return only safe fields (like `/api/auth/me`
   already does) or add `response_model`s.
3. **A private key is inside the project zip:** `backend/services/story-service/jwt_private.pem`. Anyone with the
   zip can sign login tokens if that key is used anywhere. The code reads `JWT_PRIVATE_KEY_B64` from `.env`, so the
   `.pem` files aren't needed: delete them from the repo and generate new keys.
4. **`cryptography` is missing from `requirements.txt`.** Login tokens use RS256, which PyJWT can't do without it,
   so on a fresh computer login fails. Fix: add `cryptography` (or write `PyJWT[crypto]`).
5. **The backend `.env.example` is out of date.** It has `JWT_PRIVATE_KEY_PATH` (the code needs `JWT_*_B64`) and
   lacks `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SMTP_*`, `FRONTEND_URL` and `DUMMY_PASSWORD_HASH`, so the backend won't
   start from it. A corrected one is in the backend zip.
6. **If an invitation email fails, that email is stuck for 7 days.** The invitation is saved first; if SMTP then
   fails, the admin sees an error, but trying again says "A pending invitation already exists", and there is no
   resend or cancel endpoint. Fix: save only after the email is sent, or add resend/cancel.
7. **The invitation link is hard-coded** to `http://localhost:5173/accept-invitation` (`auth_routes.py`, invite
   route). The reset-password link correctly uses `FRONTEND_URL`. This works locally but breaks once deployed.
8. **The invite response includes the invitation token** (its comment says "Temporary Testing Response"). Remove it
   before going live.
9. **`/stories/generate` has no login check.** Anyone who finds the address can spend your OpenRouter credits.
10. **`GET /api/team-leaders/{id}/projects/{id}/members` crashes** (500: `TeamLeaderDashboardRepository` has no
    `get_project_members`). The frontend avoids it and reads the members from the project instead.
11. **A Team Leader who still leads projects can be removed as Team Leader.** Their projects keep them as Team
    Leader, but they can no longer open the Team Leader dashboard (403), so nobody can manage those projects until the
    organization edits each one and picks a new Team Leader. The same applies to reviewers on projects. Consider
    refusing it (409 "reassign their projects first").
12. **CORS allows only `localhost:5173` / `localhost:3000`** (`backend/main.py`). Add your real domain when you
    deploy, and set `REFRESH_COOKIE_SECURE=True` with HTTPS.

Also worth knowing (this is correct behaviour, and the frontend now handles it): changing the password ends every
session, including the current one, so the Settings page now logs you out and the Log in page explains why.
