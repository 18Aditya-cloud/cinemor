from app.prompts.system_prompt import (
    OUTLINE_SYSTEM_PROMPT,
    SYSTEM_PROMPT,
)
from app.prompts.user_prompt import (
    build_outline_user_prompt,
    build_story_from_outline_prompt,
    build_user_prompt,
)
from app.schemas.story_request import StoryRequest


def build_story_prompts(
    request: StoryRequest,
) -> tuple[str, str]:
    """
    Build the system and user prompts for final story generation.
    """

    user_prompt = build_user_prompt(
        request
    )

    return SYSTEM_PROMPT, user_prompt


def build_outline_prompts(
    request: StoryRequest,
) -> tuple[str, str]:
    """
    Build the system and user prompts for narrative planning.
    """

    user_prompt = build_outline_user_prompt(
        request
    )

    return (
        OUTLINE_SYSTEM_PROMPT,
        user_prompt,
    )


def build_story_from_outline_prompts(
    request: StoryRequest,
    outline: dict,
) -> tuple[str, str]:
    """
    Build the prompts for final story generation using the
    previously generated narrative outline.
    """

    user_prompt = build_story_from_outline_prompt(
        request,
        outline,
    )

    return (
        SYSTEM_PROMPT,
        user_prompt,
    )
