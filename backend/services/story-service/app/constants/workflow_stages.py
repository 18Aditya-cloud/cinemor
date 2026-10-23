"""
The stages of an organization project, in the order the work moves through them.

    Story ──approve──► Storyboard ──approve──► Characters ┐
                                                Locations  ┘ (open together)
                      both approved ──► Sketches ──approve──► Animation

A stage opens only when every stage in its `requires` list is approved.

Who may WORK on a stage:
    a project member (is_reviewer = False) whose job role has one of the
    stage's `features` (OrganizationJobRoleFeature.feature_key).

Who may REVIEW a stage:
    a project member (is_reviewer = True) whose job role has one of the
    stage's `features`.

To change which job-role feature opens which module, change `features` here.
The feature keys are the ones in app/constants/cinemor_features.py.
"""

from __future__ import annotations


WORKFLOW_STAGES: list[dict] = [
    {
        "key": "story",
        "label": "Story",
        "requires": [],
        "features": ["story_creation"],
    },
    {
        "key": "storyboard",
        "label": "Storyboard",
        "requires": ["story"],
        "features": ["storyboard_creation"],
    },
    {
        "key": "characters",
        "label": "Characters",
        "requires": ["storyboard"],
        "features": ["character_creation"],
    },
    {
        "key": "locations",
        "label": "Locations",
        "requires": ["storyboard"],
        "features": ["scene_creation"],
    },
    {
        "key": "sketches",
        "label": "Sketches",
        "requires": ["characters", "locations"],
        "features": ["shot_creation"],
    },
    {
        "key": "animation",
        "label": "AI Animation",
        "requires": ["sketches"],
        "features": ["video_generation"],
    },
]

STAGES_BY_KEY: dict[str, dict] = {
    stage["key"]: stage for stage in WORKFLOW_STAGES
}

STAGE_KEYS: list[str] = [stage["key"] for stage in WORKFLOW_STAGES]


def stages_for_features(feature_keys: set[str] | list[str]) -> list[str]:
    """The stage keys a job role with these features may work on (or review)."""

    keys = set(feature_keys or [])
    return [
        stage["key"]
        for stage in WORKFLOW_STAGES
        if keys.intersection(stage["features"])
    ]


def downstream_of(stage_key: str) -> list[str]:
    """Every stage that depends (directly or not) on this one, in workflow order."""

    found: set[str] = set()
    changed = True
    while changed:
        changed = False
        for stage in WORKFLOW_STAGES:
            if stage["key"] in found:
                continue
            if stage_key in stage["requires"] or found.intersection(stage["requires"]):
                found.add(stage["key"])
                changed = True
    return [key for key in STAGE_KEYS if key in found]


# Status of a stage, as stored (project_workflow_stages.status).
# A stage without a stored row is "open" when its requirements are approved,
# and "locked" when they are not ("locked" is never stored).
STATUS_OPEN = "open"
STATUS_IN_REVIEW = "in_review"
STATUS_CHANGES_REQUESTED = "changes_requested"
STATUS_APPROVED = "approved"
STATUS_LOCKED = "locked"

# Status of a submission (project_stage_submissions.status).
SUBMISSION_PENDING = "pending"
SUBMISSION_APPROVED = "approved"
SUBMISSION_CHANGES_REQUESTED = "changes_requested"
SUBMISSION_WITHDRAWN = "withdrawn"
SUBMISSION_CANCELLED = "cancelled"
