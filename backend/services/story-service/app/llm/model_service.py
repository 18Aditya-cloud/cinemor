from app.llm.model_registry import (
    ModelDefinition,
    get_all_models,
    get_model,
)


class ModelService:
    """
    Business logic for Cinemor's AI model selection.

    The frontend only receives models registered in the
    model registry. Arbitrary model IDs are rejected.
    """

    # ---------------------------------------------------------
    # GET AVAILABLE MODELS
    # ---------------------------------------------------------

    def get_available_models(self) -> list[ModelDefinition]:
        """
        Return models that are enabled for user selection.
        """

        return get_all_models()

    # ---------------------------------------------------------
    # GET MODEL
    # ---------------------------------------------------------

    def get_model(
        self,
        model_id: str,
    ) -> ModelDefinition:
        """
        Return a registered model.

        Raises:
            ValueError: If the model is not registered or enabled.
        """

        model = get_model(model_id)

        if model is None:
            raise ValueError(
                f"Unsupported AI model: {model_id}"
            )

        return model

    # ---------------------------------------------------------
    # VALIDATE MODEL
    # ---------------------------------------------------------

    def validate_model(
        self,
        model_id: str,
    ) -> ModelDefinition:
        """
        Validate and return the selected model.

        This method is used by StoryService before sending
        a request to OpenRouter.
        """

        return self.get_model(model_id)