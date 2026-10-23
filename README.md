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
  (Job Roles page): Story Creation, Storyboard Creation, Character Creation, Scene Creation (Locations),
  Shot Creation (Sketches), Video Generation or Character Animation (AI Animation). One employee can have several
  roles on a project. The mapping is in `backend/services/story-service/app/constants/workflow_stages.py`.
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
