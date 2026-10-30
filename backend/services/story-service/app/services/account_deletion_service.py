"""
Deleting an account for good: an individual creator's, or an organization's (by its administrator).

    individual    the user, their clients, projects, stories and everything made from them (storyboards,
                  characters, locations, sketches, clips, films), their Quick Create library, and the files.
    organization  the above for the administrator, and the whole organization: its projects (with the AI work of
                  each project), clients, job roles, tools, invitations, activity. The accounts of its team members
                  and client-portal users are deleted too, unless they still belong to another organization
                  (or are someone's own individual or organization account).

Employees, Team Leaders and clients cannot delete their account here; their organization removes them.

The person proves it is them with their password, or with a 6-digit code emailed to them (for people who sign in
with Google and have no password). The code is not stored anywhere: it is an HMAC of the account and a 15-minute
window, made with the server's secret key, so it stops working after 30 minutes, after the password changes, and
once the account is gone.

Rows are deleted with SQL deletes, so the database's ON DELETE CASCADE rules take everything hanging off them; stored
files are removed after the database commit (best effort).
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import shutil
import time
from pathlib import Path

from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import verify_password_with_dummy_hash
from app.models.character_master_image import CharacterMasterImage
from app.models.client import Client
from app.models.client_portal import ClientAccount
from app.models.employee import Employee
from app.models.employee_workflow import OrganizationProjectWorkspace
from app.models.individual_project import IndividualProject
from app.models.location_master_image import LocationMasterImage
from app.models.membership import OrganizationMembership, OrganizationRole
from app.models.organization import Organization
from app.models.project import Project
from app.models.quick_creation import QuickCreation
from app.models.scene_sketch import SceneSketch
from app.models.scene_video_clip import SceneVideoClip
from app.models.scenes import Scene
from app.models.story import Story
from app.models.story_board import StoryBoard
from app.models.user import AccountType, User
from app.models.video_generation_job import VideoGenerationJob
from app.services.character_master_image_storage import CharacterMasterImageStorage
from app.services.email_service import send_email_background
from app.services.location_master_image_storage import LocationMasterImageStorage
from app.services.quick_create_service import STORAGE as QUICK_STORAGE
from app.services.scene_sketch_storage import SceneSketchStorage
from app.services.scene_video_storage import SceneVideoStorage

logger = logging.getLogger(__name__)

CONFIRM_WORD = "DELETE"
CODE_WINDOW = 15 * 60  # seconds; a code is good for this window and the one before it
STORAGE_ROOT = Path(__file__).resolve().parents[2] / "storage"


class AccountDeletionError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _value(v):
    return getattr(v, "value", v)


class AccountDeletionService:
    def __init__(self, db: Session):
        self.db = db

    # ============================================================ who may delete, and what goes
    def _organizations_of(self, user: User) -> list[Organization]:
        """The organizations this person administers (deleting the account deletes them)."""
        rows = (
            self.db.query(Organization)
            .join(OrganizationMembership, OrganizationMembership.organization_id == Organization.id)
            .filter(OrganizationMembership.user_id == user.id, OrganizationMembership.role == OrganizationRole.ADMIN)
            .all()
        )
        return rows

    def kind_of(self, user: User) -> str:
        kind = _value(user.account_type)
        if kind == AccountType.INDIVIDUAL.value:
            return "individual"
        if kind == AccountType.ORGANIZATION.value and self._organizations_of(user):
            return "organization"
        if kind == AccountType.CLIENT.value:
            raise AccountDeletionError("Client accounts are managed by the studio that invited you. Ask them to remove your access.", 403)
        raise AccountDeletionError("Team accounts are managed by your organization. Ask your organization administrator to remove you.", 403)

    def _other_people(self, user: User, org_ids: list[int]) -> list[User]:
        """Team members and client-portal users of these organizations whose accounts go with them."""
        if not org_ids:
            return []
        member_ids = {uid for (uid,) in self.db.query(OrganizationMembership.user_id).filter(OrganizationMembership.organization_id.in_(org_ids)).all()}
        member_ids |= {uid for (uid,) in self.db.query(Employee.user_id).filter(Employee.organization_id.in_(org_ids)).all()}
        client_ids = [cid for (cid,) in self.db.query(Client.id).filter(Client.organization_id.in_(org_ids)).all()]
        if client_ids:
            member_ids |= {uid for (uid,) in self.db.query(ClientAccount.user_id).filter(ClientAccount.client_id.in_(client_ids)).all()}
        member_ids.discard(user.id)
        out = []
        for person in self.db.query(User).filter(User.id.in_(member_ids)).all() if member_ids else []:
            if _value(person.account_type) == AccountType.INDIVIDUAL.value:
                continue  # a creator's own account: only their access to this organization ends
            elsewhere = (
                self.db.query(func.count(OrganizationMembership.id))
                .filter(OrganizationMembership.user_id == person.id, OrganizationMembership.organization_id.notin_(org_ids))
                .scalar()
            )
            other_clients = (
                self.db.query(func.count(ClientAccount.id))
                .join(Client, Client.id == ClientAccount.client_id)
                .filter(ClientAccount.user_id == person.id, Client.organization_id.notin_(org_ids))
                .scalar()
            )
            if not elsewhere and not other_clients:
                out.append(person)
        return out

    def summary(self, user: User) -> dict:
        """What deleting this account would delete, to show before it is done."""
        kind = self.kind_of(user)
        orgs = self._organizations_of(user) if kind == "organization" else []
        org_ids = [o.id for o in orgs]
        projects = self.db.query(func.count(IndividualProject.id)).filter(IndividualProject.individual_user_id == user.id).scalar()
        stories = (
            self.db.query(func.count(Story.id))
            .join(IndividualProject, IndividualProject.id == Story.individual_project_id)
            .filter(IndividualProject.individual_user_id == user.id)
            .scalar()
        )
        library = self.db.query(func.count(QuickCreation.id)).filter(QuickCreation.user_id == user.id).scalar()
        out = {
            "kind": kind,
            "email": user.email,
            "confirm_word": CONFIRM_WORD,
            "projects": projects,
            "stories": stories,
            "library_items": library,
        }
        if orgs:
            people = self._other_people(user, org_ids)
            out["organization"] = {
                "name": orgs[0].name or "Your organization",
                "projects": self.db.query(func.count(Project.id)).filter(Project.organization_id.in_(org_ids)).scalar(),
                "clients": self.db.query(func.count(Client.id)).filter(Client.organization_id.in_(org_ids)).scalar(),
                "members": self.db.query(func.count(Employee.id)).filter(Employee.organization_id.in_(org_ids)).scalar(),
                "accounts_deleted": len(people),
            }
        return out

    # ============================================================ proving it is them
    @staticmethod
    def _code(user: User, window: int) -> str:
        key = (settings.JWT_PRIVATE_KEY or "").encode("utf-8")
        message = f"account-delete:{user.id}:{user.email}:{user.password_hash}:{window}".encode("utf-8")
        number = int.from_bytes(hmac.new(key, message, hashlib.sha256).digest()[:8], "big") % 1_000_000
        return f"{number:06d}"

    def send_code(self, user: User) -> None:
        self.kind_of(user)
        code = self._code(user, int(time.time() // CODE_WINDOW))
        send_email_background(
            to_email=user.email,
            subject="Your Cinemor account deletion code",
            body=(
                f"Someone (hopefully you) asked to delete the Cinemor account {user.email}.\n\n"
                f"Your confirmation code is: {code}\n\n"
                "It works for 15 minutes. If you did not ask for this, ignore this email and consider changing your "
                "password; nothing will be deleted without this code."
            ),
        )

    def _verify(self, user: User, *, password: str | None, code: str | None) -> None:
        if password:
            if verify_password_with_dummy_hash(password, user.password_hash):
                return
            raise AccountDeletionError("That password is not right.", 403)
        if code:
            clean = "".join(ch for ch in code if ch.isdigit())
            now = int(time.time() // CODE_WINDOW)
            if any(hmac.compare_digest(clean, self._code(user, w)) for w in (now, now - 1)):
                return
            raise AccountDeletionError("That code is not right or has expired. Ask for a new one.", 403)
        raise AccountDeletionError("Enter your password, or the code we emailed you.", 422)

    # ============================================================ deleting
    def _files_of_projects(self, project_ids: list[int]) -> tuple[list[tuple[Path, str]], list[str], list[Path]]:
        """Stored files of these individual projects: (root, key) pairs, film paths, and folders."""
        if not project_ids:
            return [], [], []
        story_ids = [sid for (sid,) in self.db.query(Story.id).filter(Story.individual_project_id.in_(project_ids)).all()]
        board_ids = [bid for (bid,) in self.db.query(StoryBoard.id).filter(StoryBoard.story_id.in_(story_ids)).all()] if story_ids else []
        files: list[tuple[Path, str]] = []
        if board_ids:
            files += [(CharacterMasterImageStorage().storage_dir, k) for (k,) in self.db.query(CharacterMasterImage.storage_key).filter(CharacterMasterImage.story_board_id.in_(board_ids)).all()]
            files += [(LocationMasterImageStorage().storage_dir, k) for (k,) in self.db.query(LocationMasterImage.storage_key).filter(LocationMasterImage.story_board_id.in_(board_ids)).all()]
            scene_ids = [sid for (sid,) in self.db.query(Scene.id).filter(Scene.story_board_id.in_(board_ids)).all()]
            if scene_ids:
                files += [(SceneSketchStorage().storage_dir, k) for (k,) in self.db.query(SceneSketch.storage_key).filter(SceneSketch.scene_id.in_(scene_ids)).all()]
                files += [(SceneVideoStorage().storage_dir, k) for (k,) in self.db.query(SceneVideoClip.storage_key).filter(SceneVideoClip.scene_id.in_(scene_ids)).all()]
        films = [k for (k,) in self.db.query(VideoGenerationJob.output_storage_key).filter(VideoGenerationJob.story_id.in_(story_ids)).all()] if story_ids else []
        video_root = SceneVideoStorage().storage_dir
        folders = [video_root / f"project_{pid}" for pid in project_ids]
        return [(r, k) for r, k in files if k], [f for f in films if f], folders

    def delete(self, user: User, *, confirm: str, password: str | None = None, code: str | None = None) -> dict:
        kind = self.kind_of(user)
        if (confirm or "").strip() != CONFIRM_WORD:
            raise AccountDeletionError(f"Type {CONFIRM_WORD} to confirm.", 422)
        self._verify(user, password=password, code=code)

        orgs = self._organizations_of(user) if kind == "organization" else []
        org_ids = [o.id for o in orgs]
        org_name = orgs[0].name if orgs else None
        people = self._other_people(user, org_ids)
        user_ids = [user.id] + [p.id for p in people]
        notify = [(p.email, _value(p.account_type)) for p in people]
        owner_email = user.email

        # the individual projects that go: the people's own, and the hidden AI work of each organization project
        project_ids = {pid for (pid,) in self.db.query(IndividualProject.id).filter(IndividualProject.individual_user_id.in_(user_ids)).all()}
        if org_ids:
            project_ids |= {
                pid
                for (pid,) in self.db.query(OrganizationProjectWorkspace.individual_project_id)
                .join(Project, Project.id == OrganizationProjectWorkspace.project_id)
                .filter(Project.organization_id.in_(org_ids))
                .all()
            }
        project_ids = sorted(project_ids)
        running = (
            self.db.query(func.count(VideoGenerationJob.id))
            .join(Story, Story.id == VideoGenerationJob.story_id)
            .filter(Story.individual_project_id.in_(project_ids), VideoGenerationJob.status.in_(("queued", "planning", "generating", "assembling")))
            .scalar()
            if project_ids
            else 0
        )
        if running:
            raise AccountDeletionError("A film is being made right now. Wait until it has finished, then delete the account.", 409)

        files, films, folders = self._files_of_projects(project_ids)
        quick = [
            k
            for row in self.db.query(QuickCreation.storage_key, QuickCreation.source_key).filter(QuickCreation.user_id.in_(user_ids)).all()
            for k in row
            if k
        ]

        try:
            if project_ids:
                self.db.query(IndividualProject).filter(IndividualProject.id.in_(project_ids)).delete(synchronize_session=False)
            if org_ids:
                # rows that point at the organization's job roles or clients without ON DELETE CASCADE go first,
                # so the cascade from the organization never meets a row it may not remove
                params = {"org_ids": org_ids}
                for sql in (
                    "DELETE FROM employee_invitations WHERE organization_id = ANY(:org_ids)",
                    "DELETE FROM employees WHERE organization_id = ANY(:org_ids)",
                    "DELETE FROM projects WHERE organization_id = ANY(:org_ids)",
                ):
                    self.db.execute(text(sql), params)
                self.db.query(Organization).filter(Organization.id.in_(org_ids)).delete(synchronize_session=False)
            self.db.query(User).filter(User.id.in_(user_ids)).delete(synchronize_session=False)
            self.db.commit()
        except Exception:
            self.db.rollback()
            logger.exception("Account deletion failed for user %s", user.id)
            raise AccountDeletionError("The account could not be deleted. Nothing was changed; please try again.", 500) from None

        # files, after the database (best effort)
        for root, key in files:
            _remove(root, key)
        for key in films:
            _remove(STORAGE_ROOT, key)
        for folder in folders:
            _remove_folder(folder)
        for key in quick:
            _remove(QUICK_STORAGE, key)

        send_email_background(
            to_email=owner_email,
            subject="Your Cinemor account has been deleted",
            body=(
                f"The Cinemor account {owner_email} has been deleted"
                + (f", together with the organization “{org_name}”" if org_name else "")
                + ", as you asked.\n\nYour projects, stories and everything made from them have been removed. "
                "We are sorry to see you go. You can create a new account at any time."
            ),
        )
        for email, account_kind in notify:
            send_email_background(
                to_email=email,
                subject="Your Cinemor access has ended",
                body=(
                    f"“{org_name or 'Your organization'}” has closed its Cinemor workspace, so your "
                    + ("client portal access" if account_kind == AccountType.CLIENT.value else "team account")
                    + f" ({email}) has been deleted.\n\nIf you think this is a mistake, please contact them."
                ),
            )
        return {"deleted": True, "accounts": len(user_ids), "organization": org_name}


def _remove(root: Path, key: str | None) -> None:
    """Delete a stored file, only inside its storage folder."""
    if not key:
        return
    try:
        root = root.resolve()
        path = Path(key) if Path(key).is_absolute() else root / key
        path = path.resolve()
        if (root in path.parents or STORAGE_ROOT.resolve() in path.parents) and path.is_file():
            path.unlink()
    except OSError:
        pass


def _remove_folder(folder: Path) -> None:
    try:
        root = STORAGE_ROOT.resolve()
        folder = folder.resolve()
        if root in folder.parents and folder.is_dir():
            shutil.rmtree(folder, ignore_errors=True)
    except OSError:
        pass