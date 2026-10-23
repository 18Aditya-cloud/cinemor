# Cinemor AI – frontend

React + Vite landing page. Only two runtime dependencies (`react`, `react-dom`); every
animation (particles, 3D logo, letter morph, carousel) is custom code, so there are no
animation libraries to break or update.

## Run it

Needs Node 20.19 or newer.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production files go to dist/
```

## Where each part lives

| # | What you asked for | File |
|---|---|---|
| 1 | Your logo | `src/assets/images/cinemor-logo.png` (used by `Logo.jsx` and the particles) |
| 2 | Hero styled like the eclipse image | `src/sections/Hero.jsx` (text), `HeroBackground.jsx` (looping video), `HeroGlow.jsx` (drawn fallback) |
| 3 | "Create your story" button | `src/components/Create.jsx` (look: `GlowButton.jsx`) |
| 4 | Fixed navbar, logo + name left, Login right | `src/components/Navbar.jsx`, `Logo.jsx`, `Login.jsx` (the button; it links to the Log in / Sign up pages) |
| 5 | Lively buttons | `GlowButton.jsx` (Create) and `Login.module.css` (Log in) |
| 6 | Large empty card that grows on scroll | `src/sections/ShowcaseCard.jsx` |
| 7 | Large cards sliding sideways, centre sharp, sides blurred, arrow buttons, "Try now" pill | `src/sections/StoryCarousel.jsx`, `src/components/PillButton.jsx` |
| 8 | Particles float at the sides, unite into the logo, disperse | `src/particles/engine.js`, `ParticleField.jsx`, scroll section `sections/LogoStage.jsx` |
| 9 | Logo rotating above a rising hand; drag it in 3D | `src/sections/LogoStage.jsx` (hand + lines), `src/particles/engine.js` (spin, drag, momentum) |
| 10 | Flame video + PROMPT → CREATE → COLLAB | `src/sections/PromptFlame.jsx`, `MorphText.jsx` |
| 11 | Questions section | `src/sections/Faq.jsx` |

Page order is in `src/App.jsx`.

## Change the text

All visible copy is in `src/data/content.js`. The brand name and contact email are in
`src/config/site.js`. Search for `TODO` to find placeholders: FAQ answers 2-4, the
support email, and the story card titles.

## Pages and routes

| Address | Page | File |
|---|---|---|
| `/` | Landing page | `src/pages/HomePage.jsx` |
| `/login` | Log in | `src/pages/AuthPage.jsx` + `LoginForm.jsx` |
| `/signup` | Sign up (Individual / Organization first) | `src/pages/AuthPage.jsx` + `SignupForm.jsx` |
| `/choose-account` | Asked **once**, to a brand-new person who used Google before registering | `src/pages/ChooseAccountPage.jsx` |
| `/forgot-password` | Asks for the email and nothing else; then "Check your email" | `src/pages/ForgotPasswordPage.jsx` |
| `/reset-password?token=...` | Where the emailed link leads: new password + confirm | `src/pages/ResetPasswordPage.jsx` |
| `/app` | Studio for **individual** accounts: a placeholder for your real app | `src/pages/StudioPage.jsx` |
| `/organization` and `/organization/...` | The **organization dashboard** (10 pages, see below) | `src/dashboard/` |

The routes come from a tiny built-in router (`src/router/router.jsx`), so there is nothing extra to install.
**Your server must send `index.html` for `/login`, `/signup`, `/choose-account`, `/forgot-password`, `/reset-password`, `/app` and everything under `/organization`** (otherwise reloading those pages gives a
404). For example: Nginx `try_files $uri /index.html;`, Express `app.get('*', (req, res) => res.sendFile('index.html'))`
(after your `/api` routes), Flask/Django: a catch-all route that returns `index.html`. `npm run dev` already does this.
If the built site lives under a sub-path (e.g. `/static/`), build with `VITE_BASE=/static/`.

## Log in and Sign up

Its own look, separate from the rest of the site: no navbar at all (`isAuthPath()` in `router/router.jsx`
turns it off — see `Shell()` in `App.jsx`), a still photo of a planet's horizon against a violet galaxy behind
it instead of the eclipse video (`AuthBackdrop.jsx`, replacing `HeroBackground` just for these two pages —
same layer order, same z-index, so the particle canvas still drifts over it the same way), and the card
itself (`AuthCard`) is glass: translucent, blurred (`backdrop-filter`), with the Cinemor mark in a small tile
centred above the Log in / Sign up switch, where the navbar's logo used to be. The heading font changed from
the site's serif display face to the same bold sans everything else already uses (`--cm-font-body`), which
suits the glass look better — see `.title` in `AuthPage.module.css`.

*A broken-mirror photo-shard scene once sat beside the card on a wide screen — a dense, gapless mosaic of
triangular shards (CSS `clip-path`) around the Cinemor logo glowing in the middle, drifting with the cursor.
It is not used any more, but its files are still in the project, unused: `src/components/auth/AuthShards.jsx`,
`shardMesh.js` and `.module.css`, and the photos in `src/assets/images/auth-shards/`.*

*There used to be a one-time splash screen too — two hands (one human, one a machine's) reaching for a
spinning logo while a loading bar filled — shown once per tab before any page rendered. It is not used any
more either; `src/components/SplashScreen.jsx` and its neighbours are still in the project, unused. To bring
it back, `App.jsx`'s `<Shell />` just needs `<SplashScreen />` rendered alongside it again, the way it once
was — see the git history of `App.jsx`.*

- **Log in:** email, password, "Sign in with Google". Under the password field a guide opens while you
  type. It lists 5 rules (8+ characters, uppercase, lowercase, number, special character), ticks each one
  as it is met, fills a strength bar, and turns fully green when all are met. On Log in the guide is only
  guidance and never blocks a login (an existing account may have an older, weaker password).
- **Sign up:** first choose **Individual** or **Organization** (sent to the backend as `accountType`),
  then email ("Work email" for organizations), password (same guide, but here every rule is **required**),
  confirm password (live match check), and "Sign up with Google".
- Change the rules in `src/auth/passwordRules.js`, and all the text in `AUTH` in `src/data/content.js`.
- After success the user goes to `/app`. "Create your story" and the cards' "Try now" open Sign up (or the
  studio if already signed in).

### What your backend needs to provide

All calls are made from `src/services/api.js`, with cookies (`credentials: 'include'`). In demo mode
(no `VITE_API_URL`) none of them are made.

| Call | Send | Answer |
|---|---|---|
| `POST /api/auth/login` | `{ email, password }` | `200 { user }`; `401` for wrong details |
| `POST /api/auth/signup` | `{ accountType, email, password }` | `200/201 { user }`; `409` if the email already has an account |
| `GET /api/auth/me` | (cookie) | `200 { user }` or `{ user: null }`; keeps people signed in after a refresh |
| `POST /api/auth/logout` | (cookie) | `200` |
| `GET /api/auth/google?intent=login\|signup&type=individual\|organization` | (browser redirect) | see below |

`user` is `{ email, accountType: 'individual' | 'organization' }`. Error answers may include `{ message }`, which
is shown to the visitor.

**Enforce the password rules on the server too.** The browser check is only a convenience.

### Forgot and reset password

**The flow.** On Log in, "Forgot password?" opens `/forgot-password`, which asks only for the email. The page then says
"Check your email" (it never says whether the address has an account) and offers "Send it again", which waits 30 seconds between
sends. **Your server sends the email.** Its link must open the site at `/reset-password?token=THE_TOKEN`, where the person
types a new password and confirms it (the same password guide as Sign up, and every rule is required).

| Call | Send | Answer |
|---|---|---|
| `POST /api/auth/forgot-password` | `{ email }` | `200 {}` **whether or not the email has an account** (so nobody can find out who is registered). `429 { message }` if asked too often |
| `POST /api/auth/reset-password/verify` | `{ token }` | `200 { email }` (a masked address like `ja***@gmail.com`; you may leave it out) or `400/404/410` for a wrong, expired or used token |
| `POST /api/auth/reset-password` | `{ token, password }` | `200 {}`. `400/404/410` for a bad or used token, `422 { message }` if the password is too weak or too common |

Things to keep in mind on the server:

- **The verify call must not use up the token.** The page calls it when it opens (and in development React calls it twice). Only
  `POST /api/auth/reset-password` may consume the token; after it succeeds the token must stop working.
- **Check the token and the password rules again on the final call.** The browser's checks are only a convenience.
- Make the token **long, random, single use, and short-lived**, and use only URL-safe characters (letters, digits, `-`, `_`, `.`, `~`; no `+`).
  Store only a hash of it. Invalidate the person's other sessions when the password changes.
- The confirmation password is never sent; only `token` and `password`.
- The page tells the difference between a bad link (`400/404/410` -> "This link can't be used") and a server problem (`5xx` or offline ->
  "We couldn't check your link" with "Try again").
- The texts, the "30 minutes" shown on "Check your email" and the 30-second resend wait are in `RECOVERY` in `src/data/content.js`.
  The 30 minutes is only what the page says; your server decides the real lifetime.

**Demo mode** (no `VITE_API_URL`): nothing is sent. On "Check your email" a demo box has a link that opens
`/reset-password?token=demo`, as if the emailed link was clicked. In demo mode the token `demo` is a good link, and any other token
(for example `/reset-password?token=expired`) or no token shows "This link can't be used".

### Google sign-in (and the "first time only" question)

The Google button sends the browser to `GET /api/auth/google?intent=login|signup[&type=...]`. Your server does the
standard OAuth redirect to Google and, when Google sends the person back with a verified email, looks that email up
in **your database**. The frontend cannot know this; only your server can. So:

| Who | What your server does | What the visitor sees |
|---|---|---|
| Already registered (any way: email + password or Google) | sets the session cookie, redirects to `/app` | straight into the studio, **no question** |
| New, clicked **Sign up with Google** (the type was chosen first, so `type` is in the address) | creates the account with that `type`, sets the cookie, redirects to `/app` | straight into the studio |
| New, clicked **Sign in with Google** on the Log in page (no `type`) | creates **nothing yet**. Remembers the verified Google identity for a few minutes (in the session) and redirects to `/choose-account` | the "Individual or Organization?" page, **once** |

On `/choose-account` the page calls `GET /api/auth/google/pending` to show which Google account is being set up, and
when the visitor presses Continue it calls `POST /api/auth/google/complete { accountType }`. Your server then creates
the account from the identity it already verified, sets the session cookie and answers `{ user }`. From then on that
person is "already registered", so they are never asked again.

Rules to keep on the server: **never trust an email sent by the browser** (the page sends only `accountType`), check
that `accountType` is `individual` or `organization`, and decide what to do when a Google email matches an existing
email + password account (usually: link them, or ask them to log in normally).

You need a Google Cloud OAuth client for this; no Google script is loaded in the browser.

**Demo mode** (no `VITE_API_URL`): a pretend database remembers the demo Google account (`demo.user@gmail.com`), also
across reloads (browser storage). The first "Sign in with Google" asks the question; later ones do not. To see the
first-time question again, run `localStorage.removeItem('cm-demo-accounts')` in the browser console.

## Added to match the backend (cinemor-main)

These were in the backend but not in this frontend, so they were built here, in demo mode (the same demo database
as the rest of the dashboard, `dashboard/api/organizationApi.js`; each function also lists the endpoint it will call
once connected — those paths are this frontend's own and still need mapping to the backend's real ones):

- **Accepting an invitation** (`/accept-invitation?token=...`, `pages/AcceptInvitationPage.jsx`): the page the
  link in the invitation email opens. It asks only for a password and its confirmation, and sends
  `POST /api/auth/invitations/accept { token, password, confirm_password }`, exactly the backend's own endpoint. The
  backend already knows the email, organization, job role and Team Leader / Reviewer status from the invitation,
  saves the password against that email, and signs them in. Afterwards they log in with that email and password.
  The backend builds the link itself (`/accept-invitation?token=...`); it has no endpoint to look an invitation up
  first, so a used or expired link is only reported once the password is submitted. In demo mode, the Invitations
  page has an **Open invite link** button for each pending invitation, the page also names the invited email, and the
  demo log in checks the password chosen there.
- **Team Leader dashboard** (`/team-leader/...`, `dashboard/teamLeader/`): Dashboard (six counts and the latest
  projects), My Projects (filter by status), one project (start, complete or abort it; add an employee in one of
  their job roles, or a reviewer; remove people), and Team (everyone, with active projects against their limit).
  Only an employee whom the organization has marked as Team Leader gets in: they land here after logging in with
  their own email and password (see `auth/homeFor.js`); every other employee lands on the studio, and is sent there
  if they open `/team-leader`. If the organization switches Team Leader off, the dashboard closes for them too.
- **Project statuses** now follow the backend's four: not started, ongoing, completed, aborted (`lifecycle` in the
  demo data). A new project starts as not started; its Team Leader moves it on. The organization's own Projects
  page still filters by Ongoing / Delivered, and shows Not started / Aborted in its Status column.
- **Employees**: search, a Projects column (current against the limit), and **Edit** for the project limit and
  the job roles (an employee can now hold more than one).
- **Clients**: Delete (refused, with the reason, while the client still has projects).
- **Projects**: Edit and Delete, in both the cards and the table.
- **Settings**: Log out of all devices.
- **Story writing API** (`services/storyApi.js`): matches the backend's real `/models` and `/stories/generate`
  exactly. The Studio page (`/app`) does not use it yet; its design is still to be decided.

## The organization dashboard

Organization accounts open the dashboard after signing in or signing up (individual accounts open `/app`). It is
dark-theme only, and every label, heading, placeholder, empty-state text and error message comes from your 17
reference screenshots. Signed-out visitors are sent to Log in; individual accounts are sent to `/app`.

| Menu item | Address | File (in `src/dashboard/pages/`) |
|---|---|---|
| Overview | `/organization` | `OverviewPage.jsx` chooses between `OverviewHome.jsx` (the current one) and `OverviewClassic.jsx` (the earlier one), see the switch below |
| All Projects | `/organization/projects` | `ProjectsPage.jsx` (projects as cards or as a table, with search and a status filter; `ProjectCard.jsx`; the Create Project window) |
| Employees | `/organization/employees` | `EmployeesPage.jsx` (Team Leader / Reviewer switches) |
| Team Leaders | `/organization/team-leaders` | `TeamLeadersPage.jsx` (uses `RoleListPage.jsx`) |
| Reviewers | `/organization/reviewers` | `ReviewersPage.jsx` (uses `RoleListPage.jsx`) |
| Job Roles | `/organization/job-roles` | `JobRolesPage.jsx`: the roles **and** what each may use, in one table (its window is `JobRoleModal.jsx`, also used to edit; the table, cells and details are in `permissions/`). The old address `/organization/permissions` goes here |
| Clients | `/organization/clients` | `ClientsPage.jsx` (create and update) |
| Invitations | `/organization/invitations` | `InvitationsPage.jsx` (Invite Employee window) |
| Tools | `/organization/tools` | `ToolsPage.jsx` |
| Settings (in the admin menu, top right) | `/organization/settings` | `SettingsPage.jsx`: organization details (name, business type, address) and changing the account password. Opened from the admin menu in the top bar; not in the sidebar. The old `/organization/profile` address goes to the Overview |

The frame (sidebar, top bar with the theme toggle and the user menu, phone drawer) is `DashboardLayout.jsx`, `Sidebar.jsx`
and `Topbar.jsx`. The menu list is `NAV` in `Sidebar.jsx`, and the address of each page is `PAGES` in
`DashboardApp.jsx`. The reusable pieces (buttons, modal, dropdown, table, cards, toasts) are in `src/dashboard/ui/`.

**The sidebar** is a slim, floating icon rail by default — every item still has its full name for a screen reader or
the browser's find-in-page (an explicit `aria-label`, since the visible label is hidden), and hovering or focusing an
icon shows it in a small tooltip. "Expand sidebar" (at the bottom) switches to the earlier, wider menu with the
labels shown at all times; the choice is remembered (`cm-sidebar-collapsed` in the browser), and starts as the icon
rail the first time. The rail is intentionally the **same dark colours in both themes** (its own fixed set of the
dark theme's colours, defined once at the top of `Sidebar.module.css`), so it stays a constant, recognisable strip
regardless of whether the person has switched the rest of the dashboard to light — this is deliberate and is not a
bug if you notice the sidebar not changing with the theme toggle. On phones the menu is always the wide, labelled
version, opened as a drawer, regardless of that choice. Two things worth knowing if you touch `Sidebar.module.css`:
an anchor (`<a>`) needs its own explicit `color` (browsers otherwise give links their own default colour, which wins
over anything merely inherited from an ancestor); and a scrolling box (`overflow-y: auto`) always clips sideways too,
even when `overflow-x` is set to `visible`, which is why the rail's tooltip is positioned by `Sidebar.jsx` itself,
as a sibling of the menu rather than a child of it.

**The Overview ("home") and Projects as cards.** The Overview shows the welcome with a small turning logo, four numbers (each a link:
Ongoing projects, Invitations, Employees, Clients), a **"Get started" checklist** while the workspace is being set up, and **Recent
activity**. The checklist has five steps (add a tool, create a job role, invite your team, add a client, create the first project);
it works out what is done from the lists it loads, says what a step needs first ("Needs a client first"), and each button opens the
right page **with its create window already open**. When all five are done, or when the person presses "Hide" (remembered in
`cm-getting-started-hidden`), it becomes "Quick actions". All Projects shows each project as a card with its status, client, Team
Leader and a six-segment progress bar; above them are a search box, All / Ongoing / Delivered tabs with counts, and a **Cards /
Table** switch (remembered in `cm-projects-view`).

- **To undo this redesign** change two words in `src/data/content.js`, in `DASHBOARD`: `overview: 'classic'` brings back the earlier
  Overview (big turning logo and three link cards), and `projectsView: 'table'` makes All Projects open as the table for anyone who
  has not chosen a view. Nothing else needs to change.
- `?new=1` on a page address (for example `/organization/projects?new=1`) opens that page's create window and then removes the
  `?new=1` from the address (`hooks/useOpenFromQuery.js`). The Overview's buttons use it.
- The Overview loads **seven lists** (projects, invitations, employees, clients, job roles, tools, activity), each on its own. If one
  is refused or missing, only its own number says "-" and the rest of the page works. If you would rather make one call, add an
  overview endpoint later and change `loadOverview` in `pages/OverviewHome.jsx`.

| What the backend adds | Shape |
|---|---|
| `GET /api/organization/activity` | `[ { id, type, text, at } ]`, newest first. `type` is `project`, `client`, `tool`, `role`, `invitation` or `employee` (it only picks the icon). `text` is a finished sentence such as `Project "Neon" was created`. `at` is an ISO date string or a number of milliseconds. A `404` just shows "Recent activity is not available yet." |
| Projects: `stage` | `story`, `storyboard`, `characters`, `scenes`, `shots` or `video` (the order is in `src/dashboard/projectStages.js`). A project without one is shown at the first stage |
| Projects: `status`, `createdAt` | `status` is `ongoing` or `delivered` (a delivered project shows a full green bar); `createdAt` is a date shown on the card |

In demo mode the activity list is written by the demo actions themselves, and each ongoing card has a **"Next stage (demo)"** button
(it becomes "Mark delivered (demo)" at the last stage) so the progress bar can be seen moving. Those buttons do not appear once a
backend is connected.

**Job Roles and their permissions (one page).** Each job role has a row: S.No., Job Role ID, Name, Description, and then one
column for every **Cinemor feature** and for every **organization tool**. A ticked box means the role is allowed to use it, an
empty one means it is not (there is no in-between). Clicking a box changes it and **saves straight away** ("All changes saved"
shows by the table). Clicking a role's name opens Role Details (beside the table on wide screens, sliding in from the right on
narrower ones): the same checkboxes, the employees who have the role, and Edit Role / Delete Role.

- **Cinemor features** are a fixed list of nine, in this order: Story Creation, Storyboard Creation, Character Creation, Scene
  Creation, Shot Creation, Video Generation, Image Generation, Character Animation, Voice Generation. Their ids and labels are in
  `src/dashboard/permissionsModel.js` (what the backend sees) and `pages/permissions/features.js` (labels, icons, colours).
- **Organization tools** are the tools added on the **Tools page**. Add a tool there and it appears here as a new column and as a
  new chip in the Create / Edit window; every existing role starts with **no access** to it. Nothing needs to be set up twice.
- **Create Job Role / Edit Job Role** is one window: name, description, a "Cinemor Features" card and an "Organization Tools" card
  (each shows "N selected"). A new role starts with nothing allowed.
- A role that employees or pending invitations still use cannot be deleted.

| Call | Send | Answer |
|---|---|---|
| `GET /api/organization/job-roles` | | list of `{ id, name, description, features, tools }` |
| `POST /api/organization/job-roles` | `{ name, description, features, tools }` | the new job role |
| `PUT /api/organization/job-roles/:id` | `{ name, description, features, tools }` | the updated job role |
| `PUT /api/organization/job-roles/:id/permissions` | `{ features, tools }` (a click on a box) | the saved `{ features, tools }` |
| `DELETE /api/organization/job-roles/:id` | | `200`; `409 { message }` if employees or invitations still use it |

`features` is the list of **allowed** feature ids (`storyCreation`, `storyboardCreation`, `characterCreation`, `sceneCreation`,
`shotCreation`, `videoGeneration`, `imageGeneration`, `characterAnimation`, `voiceGeneration`) and `tools` is the list of allowed
**tool ids** (the ids from `GET /api/organization/tools`). Anything not in a list is not allowed. Saves for one role are sent one
after another in the order clicked, so the last click always wins; if a save fails the message is shown and the table reloads
from the server. **These are only settings.** Your server must enforce them (check the employee's job role on every request),
because the browser cannot. In demo mode, "Add sample roles (demo)" (shown while there are no job roles) adds six example roles.

**Settings** (`SettingsPage.jsx`, opened from the admin menu) has two independent cards, each with its own save button:

- **Organization Information**: name (required), business type and an official address, plus a static "Active" pill.
  "Save Changes" calls `PUT /api/organization` with `{ name, businessType, address }`, shows a toast, adds an entry to
  Recent Activity, and calls `WorkspaceContext`'s `refresh()` so the welcome heading and the top bar pick up a new
  organization name immediately, with no reload.
- **Change Password**: a new password and a confirmation, with the same live requirements guide used on Sign up and
  Reset password — but a **stricter 12-character minimum** here (`ACCOUNT_PASSWORD_RULES` in `src/auth/passwordRules.js`,
  next to the 8-character `PASSWORD_RULES` those other pages still use). "Update Password" calls `PUT /api/auth/password`
  with `{ newPassword }` only (never the confirmation), and clears both fields once it succeeds. The reference design
  for this page had no "current password" field, so neither does this; if your backend wants one (or wants to require a
  recent sign-in) before changing a signed-in administrator's password, add it to that one function in `services/api.js`.

`PasswordChecklist` (the requirements guide) and its `checkPassword()` helper both take an optional `rules` array now
(defaulting to the sign-up list), specifically so this page could use the stricter list without changing how it looks
on Sign up, Reset password or a forgotten-password link.

**Light and dark theme.** The top bar has a button that shows the current theme ("Dark" or "Light") and switches to the
other. The choice is remembered in the browser (`cm-theme`), dark is the default, and the colours fade briefly when it
changes. It applies to the dashboard only: the landing page and the Log in / Sign up pages stay dark. All the dashboard's
colours are in `src/dashboard/theme.css`, in a dark block and a light block; to restyle a theme, change only the values
there. Every colour a component uses comes from those variables (`--d-...` and the site's `--cm-...`), so new dashboard
components should use them too instead of fixed colours. `ThemeContext.jsx` applies the choice by putting
`data-theme="light"` or `"dark"` on the `<html>` element while the dashboard is open (and removing it when you leave), which
is also why windows, dropdowns and toasts (drawn outside the page frame) follow the theme.

**The turning 3D logo** on Overview is `src/dashboard/ui/Logo3D.jsx` (with `Logo3D.module.css`). It is the flat logo stacked
40 times, each copy a little further back, so it has real thickness and looks solid from the side as it turns. Size,
thickness and speed are at the top of the CSS file (`--size`, `--depth`, and the `turn` animation, 18s per turn). It
stops turning while scrolled out of view, stays still (but angled) with "reduce motion", and uses half the layers on
phones. The darker copies of the logo it uses for shading are made from `cinemor-logo.png`: if you replace the
logo, run `python3 tools/logo-3d/make_tones.py` to remake them.

**"Welcome back, Your Organization" and the profile name.** Every place that shows a name (the heading, the top bar,
the avatar initials) gets it from `src/dashboard/WorkspaceContext.jsx`. Today it shows "Your Organization". When your
backend has a profile step, return `{ "profile": { "name": "Aarush" } }` from `GET /api/organization` and the whole
dashboard switches to "Welcome back, Aarush" from the next visit, with no other change. The organization name
(`organization.name`) is used for the sidebar card, and as the fallback while there is no profile name.

### What your backend needs to provide for the dashboard

Calls are in `src/dashboard/api/organizationApi.js` (the same file documents each shape). All send cookies.

| Call | Send | Answer |
|---|---|---|
| `GET /api/organization` | | `{ organization: { name }, profile: { name } }` |
| `PUT /api/organization` | `{ name, businessType, address }` | the updated `{ organization }` (Settings page) |
| `GET /api/organization/projects` | | list of `{ id, title, description, clientId, clientName, teamLeaderId, teamLeaderEmail, status }` |
| `POST /api/organization/projects` | `{ title, description, clientId, teamLeaderId }` | the new project |
| `GET /api/organization/clients` | | list of `{ id, name, email, phone, ongoingProjects, deliveredProjects }` |
| `POST /api/organization/clients` | `{ name, email, phone }` | the new client |
| `PUT /api/organization/clients/:id` | `{ name, email, phone }` | the updated client |
| `GET /api/organization/job-roles` | | list of `{ id, name, description }` |
| `POST /api/organization/job-roles` | `{ name, description }` | the new job role |
| `GET /api/organization/invitations` | | list of `{ id, email, jobRoleId, jobRoleName, maxProjects, sentAt, status }` |
| `POST /api/organization/invitations` | `{ email, jobRoleId, maxProjects }` (`maxProjects` is a number, or `null`) | the new invitation; `409` if already invited |
| `DELETE /api/organization/invitations/:id` | | `200` |
| `GET /api/organization/employees` | | list of `{ id, email, jobRoleId, jobRoleName, maxProjects, teamLeader, reviewer }` |
| `PATCH /api/organization/employees/:id` | `{ teamLeader }` or `{ reviewer }` | the updated employee |
| `GET /api/organization/tools` | | list of `{ id, name, description, url }` |
| `POST /api/organization/tools` | `{ name, description, url }` | the new tool |
| `PUT /api/auth/password` | `{ newPassword }` | `200 {}` (Settings page, changing the signed-in administrator's own password) |

Lists are plain JSON arrays and ids are numbers (the pages show them as `#3`). To show the amber message bar with
a Retry button (as in the All Projects screenshot), answer `403 { "message": "Only organization administrators can perform this action." }`.
Any error's `message` is shown to the user. **Check the administrator role on the server**; the browser cannot enforce it.

**Demo mode** (no `VITE_API_URL`): everything above runs on a demo database in the browser's storage, so what you create
survives a reload. The Invitations page shows an extra "Accept (demo)" button (pretend the invited person accepted), so
the Employees, Team Leaders and Reviewers pages can be seen with people in them; with a backend connected that button is
not shown. Demo storage keys: `cm-demo-org` (dashboard data), `cm-demo-session` (who is signed in),
`cm-demo-accounts` (which type each demo email signed up as), `cm-sidebar-collapsed`, `cm-theme`, `cm-projects-view`, `cm-getting-started-hidden`. Clear them in the browser console
with `localStorage.clear()` to start over. In demo mode, logging in with an email that signed up as an Organization opens
the dashboard; any other email opens the individual studio.

## The hero background video

Behind the hero is a 10-second seamless loop of your eclipse image (`src/assets/video/hero-bg-1080.mp4`,
plus a smaller `hero-bg-720.mp4` for phones/tablets and a poster picture). It is your image cleaned up
and enlarged, with gentle motion added: the glow breathes, light travels round the arch, a glint
slides along the horizon, the reflection ripples, and stars and dust drift.

- It is a layer under the particle canvas, so the floating particles drift over it.
- It plays only while on (or near) the screen, stays a still picture with "reduce motion", and if it
  cannot play, the drawn glow (`HeroGlow.jsx`) is shown instead.
- To use the drawn glow on purpose (lighter, no video), set `background: 'glow'` in `HERO` in
  `src/data/content.js`.
- Its dark edges are exactly the page colour (`#05030c`), so it melts into the page. If you change
  the page background colour, re-render it (see below).
- `tools/hero-video/` has the renderer and encode script, if you want to change the loop length,
  the motion, or the size. `python3 render.py 0 240 1920`, then `sh encode.sh`.

## The hand scene

When you scroll to the logo section, a hand swings up from below (turning as it comes), the
particles gather into the Cinemor logo above its palm, and the logo turns slowly by itself. You
can still grab and rotate it. Three short lines sit around it; when you scroll on, the hand
sinks away and the lines fade with it.

- The three lines are `HAND_SCENE` in `src/data/content.js`.
- The hand is `src/assets/images/hand.webp` (760 × 795 px), cut out of a reference photo, with a soft
  fade at the wrist baked into its alpha channel (there is no CSS mask for this — a new hand photo needs
  the same fade if it is swapped in). The previous hand is still in the project, unused, as
  `hand-previous.webp`. Make sure you have the right to use whatever photo goes here.
- **Swapping in a different hand photo:** cut it out with a transparent background, keep its natural
  proportions (do not force-crop it to match some other photo's aspect ratio, since that can cut into the
  fingers), then update three things together so it still looks anchored correctly: `aspect-ratio` and both
  `transform-origin` rules in `LogoStage.module.css` (the origin's x-percentage is roughly where the wrist
  meets the bottom edge of the image), and the `width`/`height` attributes on the `<img>` in `LogoStage.jsx`.
- Spin speed, logo size/position, and when the hand rises and leaves are in `SETTINGS`
  (`spin`, `logo`, `hand`) at the top of `src/particles/engine.js`.
- The hand's entrance (how far it swings and turns) is the `.hand` transform in
  `src/sections/LogoStage.module.css`.

## Smooth scrolling

`src/hooks/useSmoothScroll.js` gives the mouse wheel inertia (the page glides to a stop). It is
one line in `src/App.jsx`. To change the feel, edit `SPEED` at the top of that file (lower =
floatier, higher = snappier). Remove the `useSmoothScroll()` line to go back to normal scrolling.
Touch, keyboard and scrollbar dragging stay native, and it switches itself off for people who
have "reduce motion" turned on.

Performance notes: only cheap properties (position, scale, opacity) are animated, the hero
glow is drawn once, the video pauses when off screen, and the particle engine skips particles
that are not visible.

## Card pictures

Each card shows a placeholder picture. To use a real video or image, add `video: '/videos/x.mp4'`
or `image: '/images/x.jpg'` to that story in `src/data/content.js` (put the files in `public/`).
Pictures are shown at 16:9. The "Try now" button calls `onTry` in `src/App.jsx`.

## Add the product video later

In `src/data/content.js`, set `SHOWCASE.videoSrc` (and optionally `poster`). The empty card
turns into a video player. Put the file in `public/videos/` and use `'/videos/name.mp4'`.

## Connect the backend

The frontend is already wired to the Cinemor backend (`backend/` in cinemor-main, FastAPI). Step-by-step setup,
what is and isn't connected yet, and known backend problems: **`BACKEND-CONNECTION.md`**.

In short:

1. Start the backend on `http://localhost:8000` (it needs PostgreSQL; see BACKEND-CONNECTION.md).
2. Copy `.env.example` to `.env` and set `VITE_API_URL=http://localhost:8000`.
   Leave it empty and the site runs in demo mode (no network calls; this is what the hosted preview uses).
3. `npm install`, then `npm run dev`, and open **http://localhost:5173** (use `localhost`, not `127.0.0.1`,
   so the login cookie works).

Where the calls live: `src/services/api.js` (log in, sign up, Google, passwords, sessions) and
`src/dashboard/api/organizationBackend.js` (the organization and Team Leader dashboards). The pages never change;
each API function answers from the backend when `VITE_API_URL` is set and from the demo database when it isn't.

**In production** either:
- serve `dist/` from your backend (Express `static`, Django/Flask static folder, Nginx), and
  if it lives under a sub-path such as `/static/`, build with `VITE_BASE=/static/`; or
- host the frontend separately and add its address to the backend's CORS list (`backend/main.py`), and set the
  refresh cookie to `REFRESH_COOKIE_SECURE=True` with HTTPS.

### Why it won't clash with your backend
- Styles use CSS Modules (class names are unique per component), CSS variables all start
  with `--cm-`, and the base resets have zero specificity and apply only inside `.cm-scope`.
- The login dialog renders into `document.body` inside its own `.cm-scope`, so it is styled
  correctly even if your app mounts elsewhere.

## Tuning the particles

Every number is in `SETTINGS` at the top of `src/particles/engine.js` (how many particles,
how sparse the sides are, how long the logo holds, drag feel). The scroll length of the
logo moment is the `height` in `src/sections/LogoStage.module.css`.
The engine reduces the particle count on its own if a device is slow, and it respects the
"reduce motion" system setting.

## Notes
- Fonts (Instrument Serif, Manrope) load from Google Fonts in `index.html`.
- The flame video is provided as `.webm` and `.mp4` (a 12-second seamless loop).
