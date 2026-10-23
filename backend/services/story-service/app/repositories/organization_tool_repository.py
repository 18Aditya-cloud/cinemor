from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.organization_tool import OrganizationTool


class OrganizationToolRepository:

    def __init__(self, db: Session) -> None:
        self.db = db

    # ========================================================
    # Get all tools
    # ========================================================

    def get_tools(
        self,
        *,
        organization_id: int,
    ) -> list[OrganizationTool]:

        statement = (
            select(OrganizationTool)
            .where(
                OrganizationTool.organization_id
                == organization_id,
                OrganizationTool.is_active.is_(True),
            )
            .order_by(
                OrganizationTool.name.asc(),
            )
        )

        return list(
            self.db.scalars(statement).all()
        )

    # ========================================================
    # Get single tool
    # ========================================================

    def get_tool(
        self,
        *,
        organization_id: int,
        tool_id: int,
    ) -> OrganizationTool | None:

        return self.db.scalar(
            select(OrganizationTool).where(
                OrganizationTool.id == tool_id,
                OrganizationTool.organization_id
                == organization_id,
            )
        )

    # ========================================================
    # Find duplicate
    # ========================================================

    def get_tool_by_name(
        self,
        *,
        organization_id: int,
        name: str,
    ) -> OrganizationTool | None:

        return self.db.scalar(
            select(OrganizationTool).where(
                OrganizationTool.organization_id
                == organization_id,
                OrganizationTool.name == name,
            )
        )

    # ========================================================
    # Create
    # ========================================================

    def create_tool(
        self,
        *,
        organization_id: int,
        name: str,
        description: str,
        website_url: str | None,
    ) -> OrganizationTool:

        tool = OrganizationTool(
            organization_id=organization_id,
            name=name,
            description=description,
            website_url=website_url,
        )

        self.db.add(tool)
        self.db.flush()

        return tool

    # ========================================================
    # Update
    # ========================================================

    def update_tool(
        self,
        *,
        tool: OrganizationTool,
        name: str,
        description: str,
        website_url: str | None,
    ) -> OrganizationTool:

        tool.name = name
        tool.description = description
        tool.website_url = website_url

        self.db.flush()

        return tool

    # ========================================================
    # Delete
    # ========================================================

    def delete_tool(
        self,
        *,
        tool: OrganizationTool,
    ) -> None:

        tool.is_active = False
        self.db.flush()