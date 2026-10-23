from dataclasses import dataclass


@dataclass(frozen=True)
class ModelDefinition:
    """
    Defines an AI model that Cinemor allows users to select.
    """

    id: str
    name: str
    provider: str
    description: str
    enabled: bool = True


# ============================================================
# Cinemor Supported Models
# ============================================================

MODEL_REGISTRY: tuple[ModelDefinition, ...] = (
    ModelDefinition(
        id="qwen/qwen3-30b-a3b",
        name="Qwen 3 30B",
        provider="Qwen",
        description="General-purpose language model suitable for story generation.",
    ),
    ModelDefinition(
        id="google/gemini-2.5-flash",
        name="Gemini 2.5 Flash",
        provider="Google",
        description="Fast multimodal-capable model suitable for creative generation.",
    ),
    ModelDefinition(
        id="openai/gpt-4o-mini",
        name="GPT-4o Mini",
        provider="OpenAI",
        description="Fast and cost-efficient model suitable for general story generation.",
    ),
)


# ============================================================
# Registry Helpers
# ============================================================

def get_all_models() -> list[ModelDefinition]:
    """
    Return all enabled models available for user selection.
    """

    return [
        model
        for model in MODEL_REGISTRY
        if model.enabled
    ]


def get_model(model_id: str) -> ModelDefinition | None:
    """
    Find a model by its exact registered ID.

    Users cannot introduce arbitrary model IDs.
    """

    for model in MODEL_REGISTRY:
        if model.id == model_id and model.enabled:
            return model

    return None


def is_model_supported(model_id: str) -> bool:
    """
    Check whether a model is registered and enabled.
    """

    return get_model(model_id) is not None