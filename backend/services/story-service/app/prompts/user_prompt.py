from app.schemas.story_request import StoryRequest


def build_user_prompt(request: StoryRequest) -> str:
    """
    Build the user-specific prompt from the validated StoryRequest.

    This prompt contains the requirements for the specific story.
    Permanent generation rules remain in system_prompt.py.
    """

    sections: list[str] = []

    # ---------------------------------------------------------
    # MAIN STORY REQUIREMENT
    # ---------------------------------------------------------

    sections.append(
        "STORY IDEA / REQUIREMENT:\n"
        f"{request.prompt}"
    )

    # ---------------------------------------------------------
    # LANGUAGE
    # ---------------------------------------------------------

    sections.append(
        "LANGUAGE:\n"
        f"{request.language}"
    )

    # ---------------------------------------------------------
    # CREATIVE DIRECTION
    # ---------------------------------------------------------

    if request.genre:
        sections.append(
            "GENRE:\n"
            + "\n".join(
                f"- {genre}"
                for genre in request.genre
            )
        )

    if request.style:
        sections.append(
            "STYLE:\n"
            + "\n".join(
                f"- {style}"
                for style in request.style
            )
        )

    if request.tone:
        sections.append(
            "TONE:\n"
            + "\n".join(
                f"- {tone}"
                for tone in request.tone
            )
        )

    # ---------------------------------------------------------
    # NARRATOR STYLE
    #
    # Uses getattr so the backend does not break if this field
    # has not yet been added to StoryRequest.
    # ---------------------------------------------------------

    narrator_style = getattr(
        request,
        "narrator_style",
        None,
    )

    if narrator_style:
        sections.append(
            "NARRATOR STYLE:\n"
            f"{narrator_style}"
        )


    # ---------------------------------------------------------
    # NARRATIVE POINT OF VIEW
    # ---------------------------------------------------------

    pov_instructions = {
        "first_person": (
            "Write in first person using I, me, my, and we where "
            "appropriate. Narration should reflect the narrator's "
            "own experiences and knowledge."
        ),
        "second_person": (
            "Write in second person using you and your. Address the "
            "reader as the central participant in the story."
        ),
        "third_person_limited": (
            "Write in third-person limited POV. Use he, she, they, "
            "or character names. Keep narration focused on the "
            "thoughts, feelings, and knowledge of one focal character "
            "at a time."
        ),
        "third_person_omniscient": (
            "Write in third-person omniscient POV. The narrator may "
            "access the thoughts, feelings, and knowledge of multiple "
            "characters while maintaining coherent narration."
        ),
    }

    point_of_view = getattr(
        request,
        "point_of_view",
        "third_person_limited",
    )

    sections.append(
        "NARRATIVE POINT OF VIEW:\n"
        f"Selected POV: {point_of_view}\n"
        f"{pov_instructions.get(point_of_view, pov_instructions['third_person_limited'])}"
    )

    # ---------------------------------------------------------
    # STORY FORMAT
    # ---------------------------------------------------------

    format_instructions = {
        "prose_narrative": (
            "Write in prose/narrative format using paragraphs, "
            "descriptions, narration, and natural dialogue."
        ),
        "script_screenplay": (
            "Write in script/screenplay format. Use scene headings "
            "where appropriate, character names before dialogue, "
            "and concise action descriptions. Do not use camera "
            "directions unless explicitly requested."
        ),
        "pure_dialogue": (
            "Write the story entirely through character dialogue. "
            "Avoid conventional narration and descriptive paragraphs. "
            "Use character names to identify speakers when needed."
        ),
        "epistolary_dialogue": (
            "Write the story through dialogue-based communications "
            "such as letters, messages, emails, or written exchanges. "
            "Make the communication format clear and consistent."
        ),
        "epistolary": (
            "Write in epistolary format using story-bearing documents "
            "such as letters, diary entries, emails, messages, or "
            "other written records."
        ),
    }

    story_format = getattr(
        request,
        "story_format",
        "prose_narrative",
    )

    sections.append(
        "STORY FORMAT:\n"
        f"Selected format: {story_format}\n"
        f"{format_instructions.get(story_format, format_instructions['prose_narrative'])}"
    )


    # ---------------------------------------------------------
    # LENGTH
    # ---------------------------------------------------------

    sections.append(
        "TARGET WORD COUNT:\n"
        f"{request.word_count} words"
    )

    # ---------------------------------------------------------
    # TARGET AUDIENCE
    # ---------------------------------------------------------

    if request.target_audience:
        sections.append(
            "TARGET AUDIENCE:\n"
            f"{request.target_audience}"
        )

    # ---------------------------------------------------------
    # EDUCATIONAL REQUIREMENTS
    # ---------------------------------------------------------

    if request.subject:
        sections.append(
            "SUBJECT:\n"
            f"{request.subject}"
        )

    if request.educational_objective:
        sections.append(
            "EDUCATIONAL OBJECTIVE:\n"
            f"{request.educational_objective}"
        )

    if request.grade_level:
        sections.append(
            "GRADE / EDUCATION LEVEL:\n"
            f"{request.grade_level}"
        )

    if request.learning_points:
        sections.append(
            "LEARNING POINTS:\n"
            + "\n".join(
                f"- {point}"
                for point in request.learning_points
            )
        )

    # ---------------------------------------------------------
    # SETTING
    # ---------------------------------------------------------

    if request.setting:
        sections.append(
            "SETTING:\n"
            f"{request.setting}"
        )

    # ---------------------------------------------------------
    # CHARACTERS
    # ---------------------------------------------------------

    if request.characters:

        character_sections: list[str] = []

        for character in request.characters:
            character_sections.append(
                f"Name: {character.name}\n"
                f"Role: {character.role}\n"
                f"Details: {character.details}"
            )

        sections.append(
            "FIXED CHARACTERS:\n"
            + "\n\n".join(character_sections)
        )

    # ---------------------------------------------------------
    # ADDITIONAL DETAILS
    # ---------------------------------------------------------

    if request.additional_details:
        sections.append(
            "ADDITIONAL CREATIVE REQUIREMENTS:\n"
            f"{request.additional_details}"
        )

    # ---------------------------------------------------------
    # FINAL INSTRUCTION
    # ---------------------------------------------------------

    sections.append(
        "FINAL INSTRUCTION:\n"
        "Follow all requirements above exactly. "
        "The central story idea, provided characters, setting, "
        "and important constraints must remain consistent "
        "throughout the story."
    )

    return "\n\n".join(sections)


def build_outline_user_prompt(
    request: StoryRequest,
) -> str:
    """
    Build the user prompt for the narrative-outline pass.

    The same story requirements are used, but the model is asked
    to plan the narrative rather than write the final story.
    """

    base_prompt = build_user_prompt(request)

    return (
        base_prompt
        + "\n\n"
        + "OUTLINE TASK:\n"
        "Create the chronological narrative outline for this "
        "story before the final prose is generated.\n\n"
        "Create distinct events with meaningful progression. "
        "Do not repeat events. "
        "The outline must cover the complete story from beginning "
        "to ending."
    )


def build_story_from_outline_prompt(
    request: StoryRequest,
    outline: dict,
) -> str:
    """
    Build the final story prompt using the generated narrative
    outline as the story's structural guide.
    """

    base_prompt = build_user_prompt(request)

    events = outline.get("events", [])

    outline_lines: list[str] = []

    for event in events:

        if not isinstance(event, dict):
            continue

        number = event.get("number")
        title = event.get("title")
        description = event.get("description")

        outline_lines.append(
            f"EVENT {number}: {title}\n"
            f"{description}"
        )

    narrative_outline = "\n\n".join(
        outline_lines
    )

    return (
        base_prompt
        + "\n\n"
        + "============================================================\n"
        + "APPROVED NARRATIVE OUTLINE\n"
        + "============================================================\n\n"
        + narrative_outline
        + "\n\n"
        + "============================================================\n"
        + "FINAL STORY INSTRUCTION\n"
        + "============================================================\n\n"
        + "Write the complete story using the narrative outline above "
        + "as the structural backbone.\n\n"
        + "IMPORTANT:\n"
        + "- Follow the events in chronological order.\n"
        + "- Do not repeat an event.\n"
        + "- Do not repeat paragraphs or dialogue.\n"
        + "- Do not restart the story midway.\n"
        + "- Do not return to an already completed event without a "
        + "clear narrative reason.\n"
        + "- Expand the outline with meaningful narration, dialogue, "
        + "description, emotion, and character development.\n"
        + "- Do not mechanically copy the outline.\n"
        + "- Do not add unrelated major plotlines.\n"
        + "- End after the final narrative event.\n"
        + "- Never use repetition to reach the requested word count.\n\n"
        + "Return only the final JSON structure required by the "
        + "system instructions."
    )