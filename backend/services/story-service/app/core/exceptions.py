from fastapi import HTTPException, status


class StoryGenerationError(Exception):
    """
    Raised when story generation fails.
    """

    def __init__(
        self,
        message: str = "Story generation failed.",
    ) -> None:
        self.message = message
        super().__init__(message)


class ModelNotAvailableError(Exception):
    """
    Raised when the requested AI model is not available
    in Cinemor's model registry.
    """

    def __init__(
        self,
        message: str = "The selected AI model is not available.",
    ) -> None:
        self.message = message
        super().__init__(message)


class LLMProviderError(Exception):
    """
    Raised when communication with the external LLM provider
    fails.
    """

    def __init__(
        self,
        message: str = "The AI model provider request failed.",
    ) -> None:
        self.message = message
        super().__init__(message)


def story_generation_http_exception(
    message: str,
) -> HTTPException:
    """
    Convert a story-generation failure into an HTTP response.
    """

    return HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail=message,
    )