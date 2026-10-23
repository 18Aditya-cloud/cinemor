from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.membership import (
    OrganizationMembership,
    OrganizationRole,
)

from app.repositories.organization_tool_repository import (
    OrganizationToolRepository,
)


class OrganizationToolService:

    def __init__(self, db: Session) -> None:
        self.db = db
        self.repository = OrganizationToolRepository(db)

    # ========================================================
    # Authorization
    # ========================================================

    def _require_admin(
        self,
        *,
        actor_user_id: int,
        organization_id: int,
    ) -> OrganizationMembership:

        membership = self.db.scalar(
            select(OrganizationMembership).where(
                OrganizationMembership.user_id
                == actor_user_id,
                OrganizationMembership.organization_id
                == organization_id,
                OrganizationMembership.is_active.is_(True),
            )
        )

        if membership is None:
            raise PermissionError(
                "You are not a member of this organization."
            )

        if membership.role != OrganizationRole.ADMIN:
            raise PermissionError(
                "Only organization administrators "
                "can manage organization tools."
            )

        return membership

    # ========================================================
    # Serialize
    # ========================================================

    @staticmethod
    def _serialize(tool):

        return {
            "id": tool.id,
            "organization_id": tool.organization_id,
            "name": tool.name,
            "description": tool.description,
            "website_url": tool.website_url,
            "is_active": tool.is_active,
        }

    # ========================================================
    # List
    # ========================================================

    def get_tools(
        self,
        *,
        actor_user_id: int,
        organization_id: int,
    ):

        self._require_admin(
            actor_user_id=actor_user_id,
            organization_id=organization_id,
        )

        tools = self.repository.get_tools(
            organization_id=organization_id,
        )

        return [
            self._serialize(tool)
            for tool in tools
        ]

    # ========================================================
    # Create
    # ========================================================

    def create_tool(
        self,
        *,
        actor_user_id: int,
        organization_id: int,
        name: str,
        description: str,
        website_url: str | None,
    ):

        self._require_admin(
            actor_user_id=actor_user_id,
            organization_id=organization_id,
        )

        clean_name = name.strip()

        if not clean_name:
            raise ValueError(
                "Tool name is required."
            )

        clean_description = description.strip()

        if not clean_description:
            raise ValueError(
                "Tool description is required."
            )

        existing = self.repository.get_tool_by_name(
            organization_id=organization_id,
            name=clean_name,
        )

        if existing is not None:
            raise ValueError(
                "This tool already exists."
            )

        clean_website_url = (
            website_url.strip()
            if website_url
            else None
        )

        try:

            tool = self.repository.create_tool(
                organization_id=organization_id,
                name=clean_name,
                description=clean_description,
                website_url=clean_website_url,
            )

            self.db.commit()

            return self._serialize(tool)

        except IntegrityError as exc:

            self.db.rollback()

            raise ValueError(
                "This tool already exists."
            ) from exc

    # ========================================================
    # Update
    # ========================================================

    def update_tool(
        self,
        *,
        actor_user_id: int,
        organization_id: int,
        tool_id: int,
        name: str,
        description: str,
        website_url: str | None,
    ):

        self._require_admin(
            actor_user_id=actor_user_id,
            organization_id=organization_id,
        )

        tool = self.repository.get_tool(
            organization_id=organization_id,
            tool_id=tool_id,
        )

        if tool is None:
            raise ValueError(
                "Tool not found."
            )

        clean_name = name.strip()

        if not clean_name:
            raise ValueError(
                "Tool name is required."
            )

        clean_description = description.strip()

        if not clean_description:
            raise ValueError(
                "Tool description is required."
            )

        duplicate = self.repository.get_tool_by_name(
            organization_id=organization_id,
            name=clean_name,
        )

        if (
            duplicate is not None
            and duplicate.id != tool.id
        ):
            raise ValueError(
                "Another tool with this name "
                "already exists."
            )

        clean_website_url = (
            website_url.strip()
            if website_url
            else None
        )

        try:

            tool = self.repository.update_tool(
                tool=tool,
                name=clean_name,
                description=clean_description,
                website_url=clean_website_url,
            )

            self.db.commit()

            return self._serialize(tool)

        except IntegrityError as exc:

            self.db.rollback()

            raise ValueError(
                "Unable to update this tool."
            ) from exc

    # ========================================================
    # Delete
    # ========================================================

    def delete_tool(
        self,
        *,
        actor_user_id: int,
        organization_id: int,
        tool_id: int,
    ):

        self._require_admin(
            actor_user_id=actor_user_id,
            organization_id=organization_id,
        )

        tool = self.repository.get_tool(
            organization_id=organization_id,
            tool_id=tool_id,
        )

        if tool is None:
            raise ValueError(
                "Tool not found."
            )

        self.repository.delete_tool(
            tool=tool,
        )

        self.db.commit()

        return {
            "message": "Tool deleted successfully.",
        }