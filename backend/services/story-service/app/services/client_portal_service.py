"""
The client portal (models in app/models/client_portal.py, routes in app/api/routes/client_portal_routes.py).

Organization side
    invite(...)               the admin invites one of the organization's clients (email with a link)
    cancel_invitation(...)    a pending invitation is cancelled
    remove_access(...)        the client's login no longer sees this organization's projects
    portal_statuses(...)      not_invited | invited | joined, for the Clients page

Public (the link in the email)
    invitation_info(token)    who invited whom (the page shows it before the password is chosen)
    accept(token, password)   a new login is made (or an existing client login is linked)

Client side (only the client's own projects, and only work the studio has approved)
    projects(user)            every project of every client this login is linked to
    project_detail(user, id)  stories with their steps, the approved story, storyboard, cast, sketches, film
    comments / add_comment    the conversation with the project's Team Leader
    decide_film(...)          approve the finished film of a story, or ask for changes
    check_media(...)          may this login see this file of the project (used by the media proxy)

Team side
    team_comments / team_reply   the project's Team Leader reads and answers the client
"""

from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.constants.workflow_stages import STATUS_APPROVED, STATUS_LOCKED
from app.core.config import settings
from app.core.security import (
    create_access_token,
    generate_refresh_token,
    get_refresh_token_expiry,
    hash_password,
    hash_refresh_token,
    is_expired,
    utc_now,
)
from app.models.client import Client
from app.models.client_portal import ClientAccount, ClientComment, ClientInvitation, ClientStoryDecision
from app.models.employee_workflow import EmployeeNotification, ProjectWorkflowStage
from app.models.organization import Organization
from app.models.project import Project
from app.models.scene_sketch import SceneSketch
from app.models.scenes import Scene
from app.models.character_master_image import CharacterMasterImage
from app.models.location_master_image import LocationMasterImage
from app.models.story import Story
from app.models.story_board import StoryBoard
from app.models.user import AccountType, User
from app.models.video_generation_job import VideoGenerationJob
from app.repositories.auth_repository import AuthRepository
from app.services.email_service import _send_email
from app.services.employee_workflow_service import EmployeeWorkflowService

INVITATION_DAYS = 7

# what the client sees: five steps, made of the studio's six stages
CLIENT_STEPS = [
    {"key": "story", "label": "Story", "stages": ["story"]},
    {"key": "storyboard", "label": "Storyboard", "stages": ["storyboard"]},
    {"key": "cast", "label": "Characters & places", "stages": ["characters", "locations"]},
    {"key": "sketches", "label": "Sketches", "stages": ["sketches"]},
    {"key": "film", "label": "Film", "stages": ["animation"]},
]
READY_WORDS = {
    "story": "Story ready",
    "storyboard": "Storyboard ready",
    "characters": "Characters ready",
    "locations": "Places ready",
    "sketches": "Sketches ready",
    "animation": "Film ready",
}


class ClientPortalError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def person_name(user: User | None) -> str:
    if user is None:
        return "Someone"
    return (user.display_name or "").strip() or user.email.split("@")[0]


def _iso(value):
    return value.isoformat() if value is not None else None


class ClientPortalService:
    def __init__(self, db: Session):
        self.db = db
        self.workflow = EmployeeWorkflowService(db)

    # ================================================================ organization side
    def _org_client(self, organization_id: int, client_id: int) -> Client:
        client = self.db.get(Client, client_id)
        if client is None or client.organization_id != organization_id:
            raise ClientPortalError("Client not found.", 404)
        return client

    def _pending(self, client_id: int) -> ClientInvitation | None:
        now = utc_now()
        rows = (
            self.db.query(ClientInvitation)
            .filter(ClientInvitation.client_id == client_id, ClientInvitation.accepted_at.is_(None), ClientInvitation.revoked_at.is_(None))
            .order_by(ClientInvitation.id.desc())
            .all()
        )
        return next((r for r in rows if not is_expired(r.expires_at)), None) if rows else None

    def _joined(self, client_id: int) -> ClientAccount | None:
        return self.db.query(ClientAccount).filter(ClientAccount.client_id == client_id).order_by(ClientAccount.id.asc()).first()

    def portal_statuses(self, organization_id: int) -> list[dict]:
        out = []
        for client in self.db.query(Client).filter(Client.organization_id == organization_id).all():
            account = self._joined(client.id)
            pending = self._pending(client.id)
            if account is not None:
                login = self.db.get(User, account.user_id)
                out.append({"client_id": client.id, "status": "joined", "joined_at": _iso(account.created_at), "login_email": login.email if login else None})
            elif pending is not None:
                out.append({"client_id": client.id, "status": "invited", "invited_at": _iso(pending.created_at), "expires_at": _iso(pending.expires_at), "email": pending.email})
            else:
                out.append({"client_id": client.id, "status": "not_invited"})
        return out

    def invite(self, organization_id: int, client_id: int, admin: User) -> dict:
        client = self._org_client(organization_id, client_id)
        email = (client.email or "").strip().lower()
        if not email:
            raise ClientPortalError("This client has no email. Add one on the Clients page first.", 422)
        if self._joined(client.id) is not None:
            raise ClientPortalError(f"{client.name} already has access to the client portal.", 409)
        existing = AuthRepository(self.db).get_user_by_email(email)
        if existing is not None and existing.account_type != AccountType.CLIENT:
            raise ClientPortalError(
                f"{email} already has a Cinemor account of another kind (a creator, an organization or an employee). "
                "Use another email for this client.",
                409,
            )
        # a new invitation replaces the pending one (this is "Resend" too)
        now = utc_now()
        self.db.query(ClientInvitation).filter(
            ClientInvitation.client_id == client.id, ClientInvitation.accepted_at.is_(None), ClientInvitation.revoked_at.is_(None)
        ).update({ClientInvitation.revoked_at: now}, synchronize_session=False)
        raw_token = generate_refresh_token()
        invitation = ClientInvitation(
            organization_id=organization_id,
            client_id=client.id,
            email=email,
            token_hash=hash_refresh_token(raw_token),
            invited_by_user_id=admin.id,
            expires_at=now + timedelta(days=INVITATION_DAYS),
        )
        self.db.add(invitation)
        self.db.commit()
        organization = self.db.get(Organization, organization_id)
        studio = (organization.name if organization else None) or "Your studio"
        link = f"{settings.FRONTEND_URL.rstrip('/')}/client-invitation?token={raw_token}"
        _send_email(
            to_email=email,
            subject=f"{studio} invited you to follow your projects on Cinemor",
            body=f"""
Hello {client.name},

{studio} invited you to the Cinemor client portal. There you can follow your projects,
watch the films, see the storyboards and talk to your Team Leader.

Open this link to choose your password (it works for {INVITATION_DAYS} days):

{link}

If you did not expect this email, you can ignore it.
""",
        )
        return {"client_id": client.id, "status": "invited", "invited_at": _iso(invitation.created_at), "expires_at": _iso(invitation.expires_at), "email": email}

    def cancel_invitation(self, organization_id: int, client_id: int) -> None:
        client = self._org_client(organization_id, client_id)
        changed = self.db.query(ClientInvitation).filter(
            ClientInvitation.client_id == client.id, ClientInvitation.accepted_at.is_(None), ClientInvitation.revoked_at.is_(None)
        ).update({ClientInvitation.revoked_at: utc_now()}, synchronize_session=False)
        if not changed:
            raise ClientPortalError("There is no pending invitation for this client.", 404)
        self.db.commit()

    def remove_access(self, organization_id: int, client_id: int) -> None:
        client = self._org_client(organization_id, client_id)
        removed = self.db.query(ClientAccount).filter(ClientAccount.client_id == client.id).delete(synchronize_session=False)
        self.db.query(ClientInvitation).filter(
            ClientInvitation.client_id == client.id, ClientInvitation.accepted_at.is_(None), ClientInvitation.revoked_at.is_(None)
        ).update({ClientInvitation.revoked_at: utc_now()}, synchronize_session=False)
        if not removed:
            raise ClientPortalError("This client has no access to remove.", 404)
        self.db.commit()

    # ================================================================ the link in the email
    def _invitation(self, token: str) -> ClientInvitation:
        if not token or not token.strip():
            raise ClientPortalError("The invitation link is not complete.", 400)
        invitation = self.db.query(ClientInvitation).filter(ClientInvitation.token_hash == hash_refresh_token(token.strip())).first()
        if invitation is None:
            raise ClientPortalError("This invitation link is not valid. Ask the studio to send a new one.", 404)
        if invitation.accepted_at is not None:
            raise ClientPortalError("This invitation was already used. Log in with your email and password.", 410)
        if invitation.revoked_at is not None:
            raise ClientPortalError("This invitation was cancelled. Ask the studio to send a new one.", 410)
        if is_expired(invitation.expires_at):
            raise ClientPortalError("This invitation has expired. Ask the studio to send a new one.", 410)
        return invitation

    def invitation_info(self, token: str) -> dict:
        invitation = self._invitation(token)
        client = self.db.get(Client, invitation.client_id)
        organization = self.db.get(Organization, invitation.organization_id)
        existing = AuthRepository(self.db).get_user_by_email(invitation.email)
        return {
            "email": invitation.email,
            "client_name": client.name if client else "",
            "organization_name": (organization.name if organization else None) or "A studio",
            "has_account": existing is not None and existing.account_type == AccountType.CLIENT,
        }

    def accept(self, token: str, password: str | None, confirm_password: str | None) -> dict:
        invitation = self._invitation(token)
        repo = AuthRepository(self.db)
        existing = repo.get_user_by_email(invitation.email)
        now = utc_now()
        if existing is not None:
            if existing.account_type != AccountType.CLIENT:
                raise ClientPortalError("This email already has a Cinemor account of another kind. Ask the studio to use another email.", 409)
            # an existing client login: the studio's projects are added to it; the person logs in as usual
            if not self.db.query(ClientAccount).filter(ClientAccount.user_id == existing.id, ClientAccount.client_id == invitation.client_id).first():
                self.db.add(ClientAccount(user_id=existing.id, client_id=invitation.client_id))
            invitation.accepted_at = now
            self.db.commit()
            return {"linked": True, "email": existing.email}

        if not password or len(password) < 12:
            raise ClientPortalError("Choose a password of at least 12 characters.", 422)
        if len(password) > 128:
            raise ClientPortalError("The password must not be longer than 128 characters.", 422)
        if password != (confirm_password or ""):
            raise ClientPortalError("The two passwords do not match.", 422)
        client = self.db.get(Client, invitation.client_id)
        user = repo.create_user(email=invitation.email, password_hash=hash_password(password))
        user.account_type = AccountType.CLIENT
        user.display_name = (client.name if client else None) or None
        self.db.flush()
        self.db.add(ClientAccount(user_id=user.id, client_id=invitation.client_id))
        invitation.accepted_at = now
        refresh_token = generate_refresh_token()
        repo.create_refresh_session(user_id=user.id, token_hash=hash_refresh_token(refresh_token), expires_at=get_refresh_token_expiry())
        self.db.commit()
        access_token = create_access_token(user_id=user.id, role=None, organization_id=None)
        return {"linked": False, "access_token": access_token, "refresh_token": refresh_token, "token_type": "bearer"}

    # ================================================================ client side: which projects
    def _client_ids(self, user: User) -> list[int]:
        return [row.client_id for row in self.db.query(ClientAccount).filter(ClientAccount.user_id == user.id).all()]

    def _require_client(self, user: User) -> list[int]:
        ids = self._client_ids(user)
        if not ids:
            raise ClientPortalError("This account is not a client of any studio.", 403)
        return ids

    def _project(self, user: User, project_id: int) -> Project:
        ids = self._require_client(user)
        project = self.db.get(Project, project_id)
        if project is None or project.client_id not in ids:
            raise ClientPortalError("Project not found.", 404)
        return project

    def _project_rows(self, project_id: int) -> dict:
        return {
            (row.story_id, row.stage): row
            for row in self.db.query(ProjectWorkflowStage).filter(ProjectWorkflowStage.project_id == project_id).all()
        }

    def _decision(self, project_id: int, story_id: int) -> ClientStoryDecision | None:
        return (
            self.db.query(ClientStoryDecision)
            .filter(ClientStoryDecision.project_id == project_id, ClientStoryDecision.story_id == story_id)
            .first()
        )

    def _film_job(self, story_id: int) -> VideoGenerationJob | None:
        return (
            self.db.query(VideoGenerationJob)
            .filter(VideoGenerationJob.story_id == story_id, VideoGenerationJob.output_storage_key.isnot(None))
            .order_by(VideoGenerationJob.id.desc())
            .first()
        )

    def _story_view(self, project: Project, story: Story, rows: dict) -> dict:
        states = self.workflow.story_states(story.id, rows)
        steps = []
        for step in CLIENT_STEPS:
            st = [states[k] for k in step["stages"]]
            done = all(s == STATUS_APPROVED for s in st)
            started = any(s != STATUS_LOCKED for s in st)
            approved_at = max((rows[(story.id, k)].approved_at for k in step["stages"] if (story.id, k) in rows and rows[(story.id, k)].approved_at), default=None) if done else None
            steps.append({"key": step["key"], "label": step["label"], "status": "done" if done else "working" if started else "waiting", "done_at": _iso(approved_at)})
        film = self._film_state(project, story, rows, states)
        if film["state"] == "waiting_for_you":
            steps[-1]["status"] = "for_you"
        elif film["state"] == "changes_asked":
            steps[-1]["status"] = "changes_asked"
        return {"id": story.id, "title": story.title, "steps": steps, "done_count": sum(1 for s in steps if s["status"] in ("done", "for_you", "changes_asked")), "film": film}

    def _film_state(self, project: Project, story: Story, rows: dict, states: dict) -> dict:
        if states.get("animation") != STATUS_APPROVED:
            return {"state": "not_ready"}
        job = self._film_job(story.id)
        if job is None:
            return {"state": "not_ready"}
        approved_at = rows[(story.id, "animation")].approved_at if (story.id, "animation") in rows else None
        decision = self._decision(project.id, story.id)
        out = {"job_id": job.id, "ready_at": _iso(approved_at)}
        if decision is not None and (approved_at is None or decision.decided_at >= approved_at):
            out.update({"state": "approved" if decision.decision == "approved" else "changes_asked", "comment": decision.comment, "decided_at": _iso(decision.decided_at)})
        else:
            out["state"] = "waiting_for_you"
        return out

    def _leader(self, project: Project) -> dict | None:
        leader = self.db.get(User, project.team_leader_id) if project.team_leader_id else None
        return {"name": person_name(leader), "email": leader.email} if leader else None

    def _lifecycle(self, project: Project) -> dict:
        status = project.status.value if hasattr(project.status, "value") else str(project.status)
        delayed = 0
        if project.deadline and status in ("pending", "started") and project.deadline < date.today():
            delayed = (date.today() - project.deadline).days
        return {"status": status, "delayed_days": delayed}

    def _summary(self, project: Project) -> dict:
        organization = self.db.get(Organization, project.organization_id)
        rows = self._project_rows(project.id)
        stories = [self._story_view(project, s, rows) for s in self.workflow._stories(project)]
        steps_total = max(1, len(stories) * len(CLIENT_STEPS))
        done = sum(s["done_count"] for s in stories)
        return {
            "id": project.id,
            "title": project.title,
            "description": project.description,
            "studio": (organization.name if organization else None) or "Studio",
            "team_leader": self._leader(project),
            "start_date": _iso(project.start_date),
            "deadline": _iso(project.deadline),
            **self._lifecycle(project),
            "story_count": len(stories),
            "progress": round(done * 100 / steps_total) if stories else 0,
            "stories": stories,
            "waiting_for_you": sum(1 for s in stories if s["film"]["state"] == "waiting_for_you"),
        }

    def projects(self, user: User) -> list[dict]:
        ids = self._require_client(user)
        projects = (
            self.db.query(Project)
            .filter(Project.client_id.in_(ids))
            .order_by(Project.created_at.desc())
            .all()
        )
        return [self._summary(p) for p in projects]

    def overview(self, user: User) -> dict:
        projects = self.projects(user)
        updates = []
        for p in projects:
            titles = {s["id"]: s["title"] for s in p["stories"]}
            for row in self.db.query(ProjectWorkflowStage).filter(
                ProjectWorkflowStage.project_id == p["id"], ProjectWorkflowStage.status == STATUS_APPROVED, ProjectWorkflowStage.approved_at.isnot(None)
            ):
                if row.story_id in titles:
                    updates.append({"kind": "ready", "stage": row.stage, "text": READY_WORDS.get(row.stage, "Ready"), "story": titles[row.story_id], "project_id": p["id"], "project": p["title"], "at": _iso(row.approved_at)})
            for c in self.db.query(ClientComment).filter(ClientComment.project_id == p["id"], ClientComment.author_side == "team"):
                updates.append({"kind": "reply", "text": f"{person_name(c.author)} replied", "story": c.story.title if c.story else None, "project_id": p["id"], "project": p["title"], "at": _iso(c.created_at)})
        updates.sort(key=lambda u: u["at"] or "", reverse=True)
        ready = []
        for p in projects:
            for s in p["stories"]:
                if s["film"]["state"] == "waiting_for_you":
                    ready.append({"kind": "film", "project_id": p["id"], "project": p["title"], "story_id": s["id"], "story": s["title"], "job_id": s["film"]["job_id"], "at": s["film"].get("ready_at")})
        recent = (utc_now() - timedelta(days=14)).isoformat()
        for u in updates:
            if u["kind"] == "ready" and u["stage"] == "storyboard" and (u["at"] or "") >= recent:
                story = next((s for p in projects if p["id"] == u["project_id"] for s in p["stories"] if s["title"] == u["story"]), None)
                if story:
                    ready.append({"kind": "storyboard", "project_id": u["project_id"], "project": u["project"], "story_id": story["id"], "story": u["story"], "at": u["at"]})
        deadlines = sorted(p["deadline"] for p in projects if p["deadline"] and p["status"] in ("pending", "started"))
        return {
            "name": person_name(user),
            "projects": projects,
            "counts": {
                "ongoing": sum(1 for p in projects if p["status"] in ("pending", "started")),
                "completed": sum(1 for p in projects if p["status"] == "completed"),
                "ready": len(ready),
            },
            "next_deadline": deadlines[0] if deadlines else None,
            "ready": ready[:6],
            "updates": updates[:12],
        }

    # ================================================================ client side: one project
    def project_detail(self, user: User, project_id: int) -> dict:
        project = self._project(user, project_id)
        summary = self._summary(project)
        rows = self._project_rows(project.id)
        stories = {s.id: s for s in self.workflow._stories(project)}
        for view in summary["stories"]:
            story = stories[view["id"]]
            states = self.workflow.story_states(story.id, rows)
            view["content"] = story.content if states["story"] == STATUS_APPROVED else None
            board = self.db.query(StoryBoard).filter(StoryBoard.story_id == story.id).order_by(StoryBoard.id.desc()).first()
            data = (board.storyboard_data or {}) if board else {}
            if states["storyboard"] == STATUS_APPROVED and board is not None:
                view["scenes"] = [
                    {
                        "no": i + 1,
                        "title": sc.get("title") or f"Scene {i + 1}",
                        "summary": sc.get("summary") or sc.get("visual_description") or "",
                        "place": (sc.get("location") or {}).get("name") if isinstance(sc.get("location"), dict) else sc.get("location"),
                        "characters": [c.get("name") for c in (sc.get("characters_present") or []) if isinstance(c, dict) and c.get("name")],
                    }
                    for i, sc in enumerate(data.get("scenes") or [])
                ]
            else:
                view["scenes"] = None
            view["characters"] = self._cast(board, data.get("characters") or [], CharacterMasterImage, "character_json_id", "character_id") if states["characters"] == STATUS_APPROVED and board else None
            view["places"] = self._cast(board, data.get("locations") or [], LocationMasterImage, "location_json_id", "location_id") if states["locations"] == STATUS_APPROVED and board else None
            view["sketches"] = self._sketches(board) if states["sketches"] == STATUS_APPROVED and board else None
        summary["comments"] = self.comments(user, project_id)
        return summary

    def _cast(self, board: StoryBoard, items: list, image_model, json_field: str, id_key: str) -> list[dict]:
        images = self.db.query(image_model).filter(image_model.story_board_id == board.id).all()
        out = []
        for item in items:
            if not isinstance(item, dict):
                continue
            item_id = item.get(id_key)
            mine = [i for i in images if getattr(i, json_field) == item_id and (i.storage_key or i.image_url)]
            kinds = {i.image_type for i in mine}
            # the studio's own upload is the main image when there is one, otherwise the generated one
            image = "user_upload" if "user_upload" in kinds else "canonical" if "canonical" in kinds else None
            out.append({"id": item_id, "name": item.get("name") or "", "role": item.get("role") or item.get("type") or "", "image": image})
        return out

    def _sketches(self, board: StoryBoard) -> list[dict]:
        scenes = self.db.query(Scene).filter(Scene.story_board_id == board.id).order_by(Scene.scene_json_id.asc(), Scene.id.asc()).all()
        out = []
        for i, sc in enumerate(scenes):
            sketch = (
                self.db.query(SceneSketch)
                .filter(SceneSketch.scene_id == sc.id, SceneSketch.status == "generated")
                .order_by(SceneSketch.id.desc())
                .first()
            )
            out.append({"no": i + 1, "scene_id": sc.id, "title": sc.title, "sketch_id": sketch.id if sketch else None})
        return out

    # ================================================================ comments
    def _comment_dict(self, c: ClientComment) -> dict:
        return {
            "id": c.id,
            "side": c.author_side,
            "author": person_name(c.author),
            "story_id": c.story_id,
            "story": c.story.title if c.story else None,
            "body": c.body,
            "at": _iso(c.created_at),
        }

    def comments(self, user: User, project_id: int) -> list[dict]:
        self._project(user, project_id)
        return [self._comment_dict(c) for c in self.db.query(ClientComment).filter(ClientComment.project_id == project_id).order_by(ClientComment.id.asc()).all()]

    def _story_in(self, project: Project, story_id: int | None) -> Story | None:
        if story_id is None:
            return None
        story = next((s for s in self.workflow._stories(project) if s.id == story_id), None)
        if story is None:
            raise ClientPortalError("That story is not part of this project.", 404)
        return story

    def _tell_leader(self, project: Project, message: str) -> None:
        if project.team_leader_id:
            self.db.add(EmployeeNotification(user_id=project.team_leader_id, project_id=project.id, stage=None, kind="client", message=message))

    def add_comment(self, user: User, project_id: int, body: str, story_id: int | None) -> dict:
        project = self._project(user, project_id)
        text = (body or "").strip()
        if not text:
            raise ClientPortalError("Write a comment first.", 422)
        story = self._story_in(project, story_id)
        comment = ClientComment(project_id=project.id, story_id=story.id if story else None, author_user_id=user.id, author_side="client", body=text[:4000])
        self.db.add(comment)
        self._tell_leader(project, f"{person_name(user)} (client) wrote on “{project.title}”{f' about “{story.title}”' if story else ''}: “{text[:160]}”")
        self.db.commit()
        self.db.refresh(comment)
        return self._comment_dict(comment)

    def decide_film(self, user: User, project_id: int, story_id: int, decision: str, comment: str | None) -> dict:
        project = self._project(user, project_id)
        story = self._story_in(project, story_id)
        rows = self._project_rows(project.id)
        states = self.workflow.story_states(story.id, rows)
        film = self._film_state(project, story, rows, states)
        if film["state"] == "not_ready":
            raise ClientPortalError("The film of this story is not ready yet.", 409)
        if decision not in ("approve", "changes"):
            raise ClientPortalError("Choose approve or changes.", 422)
        text = (comment or "").strip()
        if decision == "changes" and not text:
            raise ClientPortalError("Say what should change.", 422)
        row = self._decision(project.id, story.id)
        if row is None:
            row = ClientStoryDecision(project_id=project.id, story_id=story.id, decision="")
            self.db.add(row)
        row.decision = "approved" if decision == "approve" else "changes_requested"
        row.comment = text or None
        row.decided_by_user_id = user.id
        row.decided_at = utc_now()
        line = f"Approved the film of “{story.title}”." if decision == "approve" else f"Asked for changes to the film of “{story.title}”: {text}"
        if decision == "approve" and text:
            line += f" {text}"
        self.db.add(ClientComment(project_id=project.id, story_id=story.id, author_user_id=user.id, author_side="client", body=line[:4000]))
        self._tell_leader(project, f"{person_name(user)} (client) {'approved' if decision == 'approve' else 'asked for changes to'} the film of “{story.title}” ({project.title}).")
        self.db.commit()
        return self.project_detail(user, project_id)

    # ================================================================ media (images, sketches, the film)
    def check_media(self, user: User, project_id: int, method: str, subpath: str):
        """The project and its workspace, when this client may GET this file (only approved work)."""
        project = self._project(user, project_id)
        if method not in ("GET", "HEAD"):
            raise ClientPortalError("Clients can only look at the work.", 403)
        stage, story_id = self.workflow.stage_of_path(subpath)
        if stage is None or story_id is None:
            raise ClientPortalError("Not available.", 404)
        self._story_in(project, story_id)
        states = self.workflow.story_states(story_id, self._project_rows(project.id))
        if states.get(stage) != STATUS_APPROVED:
            raise ClientPortalError("This part is not ready yet.", 404)
        workspace = self.workflow.get_workspace(project.id)
        if workspace is None:
            raise ClientPortalError("Not available.", 404)
        return project, workspace

    # ================================================================ team side
    def _leader_project(self, user: User, project_id: int) -> Project:
        project = self.db.get(Project, project_id)
        if project is None or project.team_leader_id != user.id:
            raise ClientPortalError("Only the project's Team Leader talks to the client.", 403)
        return project

    def team_comments(self, user: User, project_id: int) -> dict:
        project = self._leader_project(user, project_id)
        client = self.db.get(Client, project.client_id) if project.client_id else None
        joined = self._joined(client.id) is not None if client else False
        decisions = {d.story_id: d for d in self.db.query(ClientStoryDecision).filter(ClientStoryDecision.project_id == project.id)}
        return {
            "client": {"name": client.name if client else "", "email": client.email if client else "", "on_portal": joined},
            "comments": [self._comment_dict(c) for c in self.db.query(ClientComment).filter(ClientComment.project_id == project.id).order_by(ClientComment.id.asc())],
            "decisions": [
                {"story_id": d.story_id, "decision": d.decision, "comment": d.comment, "at": _iso(d.decided_at)} for d in decisions.values()
            ],
        }

    def team_reply(self, user: User, project_id: int, body: str, story_id: int | None) -> dict:
        project = self._leader_project(user, project_id)
        text = (body or "").strip()
        if not text:
            raise ClientPortalError("Write a reply first.", 422)
        story = self._story_in(project, story_id)
        comment = ClientComment(project_id=project.id, story_id=story.id if story else None, author_user_id=user.id, author_side="team", body=text[:4000])
        self.db.add(comment)
        self.db.commit()
        self.db.refresh(comment)
        return self._comment_dict(comment)

