# Final Cinemor

Our Cinemor frontend, connected to the Cinemor backend.

```
final-cinemor/
  frontend/   our frontend (React + Vite), connected to the backend
  backend/    the backend from cinemor-main (2 small fixes, listed below)
```

## Run it

**1. Backend** (Python 3.10+). Connecting your database is up to you; nothing about it was changed.

```bash
cd backend/services/story-service
pip install -r requirements.txt
# .env: your DATABASE_URL, OPENROUTER_API_KEY, SUPABASE_*, JWT keys, SMTP ... (see .env.example)
alembic upgrade head
cd ../..
uvicorn main:app --reload        # http://localhost:8000
```

**2. Frontend** (Node 20.19+)

```bash
cd frontend
npm install
npm run dev                       # open http://localhost:5173 (use localhost, not 127.0.0.1)
```

`frontend/.env` already points at `http://localhost:8000`. For another server, change `VITE_API_URL`.
If `VITE_API_URL` is left empty, the frontend runs on its own in demo mode (that is only for previews).

## What is connected

Everything in the individual creator's dashboard now uses the backend's `/api/individual/...` routes:

| Part | Backend routes |
|---|---|
| Clients | `/clients` (list, create, edit, delete) |
| Projects | `/projects` (list, create, edit, delete, status: Pending / Active / Completed / Aborted) |
| Story: write with AI | `/projects/{id}/stories/generate` (with the Creative Direction) |
| Story: chat changes | `/stories/{id}/ai-edit`, then `/stories/previews/{id}/accept` |
| Story: import | `/projects/{id}/stories/upload` (TXT, DOCX) |
| Story Editor | `PATCH /stories/{id}` (save), AI Edit preview with Accept / Discard, `/versions`, `/versions/{id}/restore` |
| Storyboard | `POST /storyboard` (make with AI), `/storyboard/details`, `/storyboard/upload`, `/storyboard/export`, `/storyboard/template` |
| Character Studio | `/characters`, `/characters/{id}/profile`, `/master-image`, `/master-image/upload`, `/master-image/preview`, `/master-image/download` |
| Environment Studio | `/locations`, `/locations/{id}/profile`, `/master-image` (+ upload, preview, download) |
| Sketch Studio | `/scenes`, `/scenes/{id}/sketches/auto`, `/sketches`, `/sketches/{id}/preview`, `/download` |
| AI Animation (new) | `/video-generation`, `/video-generation/{job}`, `/video-generation/latest`, `/video-clips`, `/video-clips/{id}/download`, `/video-generation/{job}/assemble`, `/download` |
| One-click workshop | story generate / upload / AI edit (the draft is a story of the project) |

Sign up, log in, Google sign-in, sessions and the organization / Team Leader dashboards were already connected.

**Demo messages removed**: the "Demo..." notes under the storyboard, character, environment and sketch images are gone.

## AI Animation (new page)

Project → Layer by layer → **AI Animation** (`/dashboard/projects/{id}/animation/{storyId}`):

- choose the video model, and **Every scene** or **Chosen scenes** (tick them in the list), then **Make the clips**;
- while the server works: the line of light runs round the player, the Cinemor mark beats in the middle, and each scene shows its progress (checked every 4 seconds);
- every scene card shows its sketch, its state (No clip yet / Making the clip / Clip ready / Clip failed) and plays its clip;
- the film is joined automatically when every scene has a clip; **Join the clips again** after remaking a scene; **Download film**.

## Changes made to the backend (only what was necessary)

1. `app/api/routes/individual_routes.py`: the job-status route is now `.../video-generation/{job_id:int}`.
   Before, it was declared before `.../video-generation/latest` and caught "latest" as a job id, so `/latest` always
   failed with 422. Now `/latest` works (the AI Animation page uses it to show the newest job after a reload).
2. `requirements.txt`: added `python-multipart` (needed for every file upload), `moviepy` and `Pillow`
   (the backend imports them for video; without moviepy the server does not start).

Nothing else in the backend was changed. The `storage/` folders are empty here (they held your generated images and
videos): keep your own `storage/` folders when you copy this backend over yours.

## Latest changes

- **Confidence** is no longer shown on the storyboard's scenes.
- **Times**: story versions are saved in UTC without a timezone; the frontend now reads them as UTC, so a story
  made now says "just now" (it said "6 h ago" in India). Fixed in `individualBackend.js`.
- **Delete a chat**: every story chat (Story page, and the Chats panel) has a delete button. It asks first, in the
  list. Deleting a chat deletes its story (all versions) and what was made from it; deleting the open chat starts a
  new one. Uses the existing `DELETE /stories/{id}`.
- **Edit a dialogue line**: on the storyboard's Scenes & dialogue tab, every line has an Edit button (Save line /
  Cancel; Esc cancels, Ctrl/Cmd + Enter saves). The backend had no way to change a line, so one route was added:
  `PATCH /api/individual/projects/{id}/stories/{story_id}/storyboard/scenes/{scene_index}/dialogues/{dialogue_index}`
  with `{ "text": "..." }` (scenes and lines counted from 0, as in `storyboard_data`). It updates the line in all three
  places it is kept: the storyboard (`story_board.storyboard_data`, what the page and Export show), the scene
  (`scenes.scene_data`, what AI Animation reads) and the line's row (`dialogues`). New files:
  `app/services/storyboard_dialogue_service.py`, `app/schemas/storyboard_dialogue.py`; the route is in
  `individual_routes.py`. In the employee dashboard it belongs to the Storyboard stage. No database change.

## Project dates (organization projects)

- The organization admin sets each project's **start date** and **deadline** when creating it (both required).
- **Title**: fixed once the project is created (the backend refuses a different title).
- **Start date**: can be changed only while the project is "Not started"; once the Team Leader starts it, it is
  fixed (the backend refuses a change). **Deadline**: the admin can move it earlier or later at any time (never
  before the start date). The Team Leader only sees the dates.
- Cards, the projects table and the Team Leader's pages show both dates; a project that is not completed or aborted
  and is past its deadline shows **"Delayed by N days"**.
- Database: two new nullable columns on `projects` (`start_date`, `deadline`): run `alembic upgrade f1a2b3c4d5e6`
  (after `e3f7a9c1d2b4`), or `sql/project_dates.sql` without Alembic.
- **Client**: fixed once the project is created, like the title (the backend refuses a different client).

## Recent activity (organization Overview)

- Every change to organization data is written to the new `organization_activities` table automatically, at the
  moment it is saved (`app/services/activity_log.py`, switched on in `app/main.py`). Nothing in the routes has to
  log by hand, and a change that fails is not logged.
- Logged: projects (created, deadline / start date, Team Leader, description, started / completed / aborted,
  deleted), project teams, clients, job roles, tools, invitations (sent, accepted, cancelled), employees (job
  roles, what they review, Team Leader, Reviewer, project limit, deactivated) and approved workflow stages, with
  who did it (Admin / Team Leader / Reviewer / Employee).
- `GET /api/organizations/{id}/activity?limit=&before_id=&kind=` (admins only, newest first).
- Overview → Recent activity shows the latest 8, grouped by day; **View all** opens `/organization/activity`
  (filters and "Show older activity").
- Database: run `alembic upgrade a7c3e9d1b5f2` (after `f1a2b3c4d5e6`), or `sql/organization_activities.sql`.

## Team: several job roles per employee, and project limits

- On a project, the Team Leader can add an employee with **one or more of their job roles** at once (tick boxes),
  and later change them (**Edit roles** on the team member's row). Only the job roles the organization gave the
  employee can be chosen. Backend: `PUT /api/team-leaders/{tl}/projects/{id}/employees/{user_id}/job-roles`
  `{ job_role_ids: [...] }` (reviewer assignments are not touched).
- **Project limit** (`max_concurrent_projects`): a project counts while it is *Not started* or *Ongoing*, whether
  the person leads it or works / reviews on it (one project counts once). Before, employees were counted only once a
  project had started, so they could be put on any number of not-started projects.
- A Team Leader at their limit is not offered in the Team Leader list when creating a project (the backend refuses
  it too); an employee at their limit is not offered to Team Leaders.

## Several stories per project

- A project can have several stories, written by the same or different Story Writers. Every story goes through
  the six stages on its own: when a story is approved, ITS Storyboard opens (then its Characters + Locations,
  Sketches, AI Animation). The project page lists the stories, each with its own stages and buttons.
- Submit / reopen name the story (`story_id`). Reviewers see only the newest submission of each story's stage.
- The project page (employee and Team Leader "My Work") is sorted around what the person has to do:
  **Ready for you** (stages they can work on, changes asked of them, work waiting for their review, each with its
  buttons), then **All stories** (one line per story: its six stages as a bar, where it stands now; opening a line
  shows every stage with Open / View, Submit, Take back, Approve / Ask for changes, Reopen). Filters (Needs you, In
  review, Changes asked, Finished) and "Needs me first" sorting. Who works on each stage and the reviews are on the
  side. Frontend only (`EmployeeProjectPage.jsx`, `Employee.module.css`).
- Database: `project_workflow_stages.story_id` (existing rows are given their story): run
  `alembic upgrade b8d4f0e2c6a3` (after `a7c3e9d1b5f2`), or `sql/per_story_workflow.sql`.

## Submit for review: only real, changed work

- A stage can be sent for review only when it has work in it: a written story, a storyboard, a character or location
  profile or image, a sketch, a clip. After a reviewer asks for changes, the same work cannot be sent again: it has to
  be changed first (changing it and changing it back counts as unchanged). After "Take back" the same work can be sent.
- The Submit window asks first (`GET /api/employee/projects/{id}/stages/{stage}/submit-check?story_id=`) and shows the
  reason in red, with Submit turned off; the backend checks again on Submit.
- How: every submission saves a fingerprint of the stage's work (`app/services/stage_content.py`).
  Database: `project_stage_submissions.content_fingerprint`: run `alembic upgrade c5e9a3f7d2b1` (after
  `b8d4f0e2c6a3`), or `sql/submission_content_fingerprint.sql`.
- Opening a story (a reviewer's View) shows its newest version in full, also when it was saved in the Story Editor or
  on another device; the older versions stay above it in the chat.
- Refusals and failures ("Your role on this project does not include the Story...") show in red; done messages stay
  green.

## Deleting work

- **A whole story (organization projects)**: only the project's Team Leader, from the project page (open the story,
  Delete story; it asks first). Its versions, storyboard, characters, locations, sketches, clips, film and reviews go
  with it; the other stories stay. Employees get "Only the project's Team Leader can delete a story", and the story
  chats show no Delete in organization projects. Backend: `DELETE /api/employee/projects/{id}/work/stories/{story_id}`
  (handled in `employee_routes.py` / `EmployeeWorkflowService.delete_story`).
- **Storyboard, images, sketches, clips, film** (individual creators and employees, every one asks first):
  Storyboard page: Delete (the storyboard and everything made from it; the story stays). Character / Environment
  Studio: the bin on the image (the generated or the uploaded one). Sketch Studio: the bin on a sketch. AI Animation:
  the bin on a scene's clip, and Delete film (the clips stay and can be joined again). New routes, all under
  `/api/individual/projects/{id}/stories/{story_id}/`: `DELETE storyboard`,
  `DELETE characters/{id}/master-image?image_type=canonical|user_upload`, the same for `locations/{id}`,
  `DELETE scenes/{scene}/sketches/{sketch}`, `DELETE video-clips/{clip}`, `DELETE video-generation/{job}`
  (new file `app/api/routes/content_delete_routes.py`, added in `app/main.py`). In organization projects they go
  through the work API, so the person's role and the stage are checked (an approved stage cannot be changed).
  Stored files of what is deleted are removed too. No database change.

## Client portal (new)

- **Invite** (organization admin, Clients page, new "Client Portal" column): Invite sends an email with a link
  (7 days). The row then shows Invited (Resend, Cancel); once the client has joined, Joined (Remove access).
- **Join** (`/client-invitation?token=...`): a new client chooses a password and lands in the portal. A client who
  already has a Cinemor client login (another studio invited them) only confirms, and the projects are added to it.
  An email that already belongs to a studio account (admin, employee, creator) cannot be a client login.
- **The portal** (`/client/...`, client logins only): Overview (counts, Ready for you, your projects, latest updates,
  your Team Leader), My Projects, one project (story tabs, the film to watch with Approve film / Ask for changes,
  where each story stands, the approved story text, storyboard with sketches, characters and places, messages with
  the Team Leader), Downloads (the films), Messages, Settings. Only work the studio has approved is shown; the
  files are read only.
- **Team Leader**: the project page has a Client panel (on the portal or not, the client's film decisions, the
  messages, a box to reply). The Team Leader gets a notification when the client writes or decides.
- Backend: new files `app/models/client_portal.py`, `app/services/client_portal_service.py`,
  `app/api/routes/client_portal_routes.py` (added in `app/main.py`); `users.account_type` gets the value `client`
  and `users.display_name` is new. Database: `alembic upgrade d7e1f3a5c9b2` (after `c5e9a3f7d2b1`), or
  `sql/client_portal.sql`.

## Settings on every dashboard

- Organization, Team Leader (`/team-leader/settings`), Employee (`/employee/settings`), Individual and Client
  (`/client/settings`): Full Name (shown to others instead of the email's first part) and Change Password (needs the
  current one; "Forgot it? Email me a reset link" sends the usual reset email). Changing the password ends every
  session, so you log in again. Backend: `PATCH /api/auth/me`, `PATCH /api/auth/me/password`.
- The sidebar brand reads "cinemor ai" (no dot) everywhere.

## Smaller changes

- Admin, Create / Edit Project: the start date can be today or later (an unchanged earlier date of an existing project
  is kept). Client lists (admin and individual) show the client's email after the name.
- Log in: no password-strength guide (Sign up still has it).
- Team Leader, project team: a reviewer can be added for several job roles at once (tick boxes); each person has one
  row (Employee and / or Reviewer, with "Works on" and "Reviews"); Edit roles changes both in one window.

## Employee dashboard (new)

Employees now land on `/employee` (Team Leaders still land on `/team-leader`, with **My Work** in their menu).
Pages: Overview (Up next, your work in review, your projects), My Projects, each project's workflow, Reviews, Tools.

Every organization project moves through six stages, each opening only when the ones before it are approved:

```
Story ──approve──► Storyboard ──approve──► Characters ┐
                                            Locations  ┘ (open together)
                  both approved ──► Sketches ──approve──► AI Animation
```

- An employee works on a stage when one of their roles on the project has that stage's Cinemor Feature
  (Job Roles page). There are exactly six features, one per stage: Story Creation, Storyboard Creation, Character
  Creation, Location Creation, Sketch Creation, AI Animation (backend keys: story_creation, storyboard_creation,
  character_creation, scene_creation, shot_creation, video_generation; the old Image Generation, Character Animation
  and Voice Generation were removed). One employee can have several roles on a project. The list is in
  `app/constants/cinemor_features.py`, the stage mapping in `app/constants/workflow_stages.py`.
- **Submit for review**: the employee chooses the reviewer; only reviewers of that stage on the project are offered.
  Nobody reviews their own work. The reviewer approves or asks for changes (with a comment). The project's Team
  Leader can also answer, but only if they are a reviewer of that stage.
- An approved stage is locked; only the Team Leader can reopen it, and the stages after it lock again until it is
  approved again (their work is kept).
- Approving a stage notifies the people who work on the stages it opens.
- The work happens on the same Story / Storyboard / Character / Environment / Sketch / AI Animation pages as the
  individual dashboard, with a stage bar on top.

### Backend for it

New files only (no existing table, column or route changed):
`app/constants/workflow_stages.py`, `app/models/employee_workflow.py`, `app/schemas/employee_workflow.py`,
`app/services/employee_workflow_service.py`, `app/services/employee_work_proxy.py`,
`app/api/routes/employee_routes.py` (routes under `/api/employee`), and the migration
`alembic/versions/e3f7a9c1d2b4_add_employee_workflow.py` (4 new tables). Two existing files got one import each:
`app/main.py` (the router) and `app/models/__init__.py` (the models).

Create the tables once:
```bash
cd backend/services/story-service
alembic upgrade e3f7a9c1d2b4
```
(Its `down_revision` is `b92a7bf9e1ae`, the scene video tables. If `alembic heads` shows another head for your
database, put that one there. Without Alembic, run `backend/services/story-service/sql/employee_workflow.sql`.)

Organization projects had no place for a story, storyboard or video. Each one now gets a hidden individual project
(its workspace) the first time it is opened, and `/api/employee/projects/{id}/work/...` runs the existing
`/api/individual/...` AI code on it after checking the person's role and the stage.

## Kept in the browser (the backend has no place for these)

Per signed-in user, in localStorage: a story's chat messages (the stories and every version are on the server; on
another device the chat is rebuilt from the versions), how a project is being built (Layer by layer / One-click),
which image is the main one (generated or uploaded), and which sketch is a scene's main one.

## Worth knowing (backend, not changed)

- `POST /api/auth/register/...` and `/api/auth/login` return the user's `password_hash` in the response. It should be
  removed from those responses.
- Profiles (character / place) cannot be edited by hand through the API, so their details are read-only in the
  studios; change them with the customisation box and regenerate.
- Sketches cannot be deleted through the API, so the delete button is hidden.
