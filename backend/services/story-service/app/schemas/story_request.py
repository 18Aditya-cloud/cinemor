from pydantic import BaseModel, Field, field_validator


class CharacterInput(BaseModel):
    """
    Character information supplied by the user.
    """

    name: str = Field(
        ...,
        min_length=1,
        max_length=100,
    )

    role: str = Field(
        ...,
        min_length=1,
        max_length=100,
    )

    details: str = Field(
        ...,
        min_length=1,
        max_length=2000,
    )


class StoryRequest(BaseModel):
    """
    Request received by the Story Generation API.

    Most creative fields are optional because Cinemor's frontend
    will dynamically display fields according to the selected
    genre and other options.
    """

    # ---------------------------------------------------------
    # AI MODEL
    # ---------------------------------------------------------

    model: str = Field(
        ...,
        min_length=1,
        description="ID of the AI model selected from Cinemor's dropdown.",
    )

    # ---------------------------------------------------------
    # BASIC STORY INPUT
    # ---------------------------------------------------------

    prompt: str = Field(
        ...,
        min_length=1,
        max_length=10000,
        description="Main idea or instructions for the story.",
    )

    language: str = Field(
        default="English",
        min_length=1,
        max_length=50,
    )

    # ---------------------------------------------------------
    # CREATIVE CONTROLS
    # ---------------------------------------------------------

    genre: list[str] = Field(
        default_factory=list,
    )

    style: list[str] = Field(
        default_factory=list,
    )

    tone: list[str] = Field(
        default_factory=list,
    )


    point_of_view: str = Field(
        default="third_person_limited",
        description=(
            "Narrative POV: first_person, second_person, "
            "third_person_limited, or third_person_omniscient."
        ),
    )

    story_format: str = Field(
        default="prose_narrative",
        description="The format in which the story should be written.",
    )


    # ---------------------------------------------------------
    # LENGTH
    # ---------------------------------------------------------

    word_count: int = Field(
        default=1500,
        ge=100,
        le=10000,
    )

    # ---------------------------------------------------------
    # AUDIENCE
    # ---------------------------------------------------------

    target_audience: str | None = Field(
        default=None,
        max_length=200,
    )

    # ---------------------------------------------------------
    # EDUCATIONAL FIELDS
    #
    # These remain optional because the frontend should only
    # show them when the user selects an educational genre.
    # ---------------------------------------------------------

    subject: str | None = Field(
        default=None,
        max_length=200,
    )

    educational_objective: str | None = Field(
        default=None,
        max_length=2000,
    )

    grade_level: str | None = Field(
        default=None,
        max_length=100,
    )

    learning_points: list[str] = Field(
        default_factory=list,
    )

    # ---------------------------------------------------------
    # STORY WORLD
    # ---------------------------------------------------------

    setting: str | None = Field(
        default=None,
        max_length=2000,
    )

    characters: list[CharacterInput] = Field(
        default_factory=list,
    )

    # ---------------------------------------------------------
    # ADDITIONAL INSTRUCTIONS
    # ---------------------------------------------------------

    additional_details: str | None = Field(
        default=None,
        max_length=5000,
    )


    @field_validator("point_of_view")
    @classmethod
    def validate_point_of_view(cls, value: str) -> str:
        allowed = {
            "first_person",
            "second_person",
            "third_person_limited",
            "third_person_omniscient",
        }

        if value not in allowed:
            raise ValueError(
                f"point_of_view must be one of: {', '.join(sorted(allowed))}"
            )

        return value

    @field_validator("story_format")
    @classmethod
    def validate_story_format(cls, value: str) -> str:
        allowed = {
            "prose_narrative",
            "script_screenplay",
            "pure_dialogue",
            "epistolary_dialogue",
            "epistolary",
        }

        if value not in allowed:
            raise ValueError(
                f"story_format must be one of: {', '.join(sorted(allowed))}"
            )

        return value


    # ---------------------------------------------------------
    # VALIDATION
    # ---------------------------------------------------------

    @field_validator(
        "genre",
        "style",
        "tone",
        "learning_points",
        mode="before",
    )
    @classmethod
    def clean_list_values(cls, value):
        """
        Remove empty values and surrounding whitespace from
        list-based inputs.
        """

        if value is None:
            return []

        if not isinstance(value, list):
            return value

        return [
            item.strip()
            for item in value
            if isinstance(item, str) and item.strip()
        ]

    @field_validator(
        "language",
        "prompt",
        "target_audience",
        "subject",
        "educational_objective",
        "grade_level",
        "setting",
        "additional_details",
        mode="before",
    )
    @classmethod
    def clean_string_values(cls, value):
        """
        Normalize optional string inputs.
        """

        if value is None:
            return None

        if not isinstance(value, str):
            return value

        cleaned = value.strip()

        return cleaned if cleaned else None