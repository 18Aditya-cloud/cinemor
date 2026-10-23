from typing import Any

import httpx

from app.core.config import settings
from app.core.exceptions import LLMProviderError


class OpenRouterClient:
    """
    Client for communicating with OpenRouter's chat completion API.

    This class is responsible only for external API communication.
    Prompt construction, model selection, and story business logic
    remain outside this client.
    """

    def __init__(self) -> None:
        self.base_url = settings.OPENROUTER_BASE_URL.rstrip("/")
        self.api_key = settings.OPENROUTER_API_KEY

        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:5173",
            "X-Title": "Cinemor",
        }

    async def generate(
        self,
        model_id: str,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.7,
    ) -> str:
        """
        Send a chat completion request to OpenRouter.

        Args:
            model_id:
                Registered OpenRouter model ID.

            system_prompt:
                System-level instructions.

            user_prompt:
                User/story-specific instructions.

            temperature:
                Generation randomness.

        Returns:
            Generated model content.

        Raises:
            LLMProviderError:
                When OpenRouter cannot be reached, returns an error,
                or returns an unexpected response.
        """

        endpoint = f"{self.base_url}/chat/completions"

        payload: dict[str, Any] = {
            "model": model_id,
            "messages": [
                {
                    "role": "system",
                    "content": system_prompt,
                },
                {
                    "role": "user",
                    "content": user_prompt,
                },
            ],
            "temperature": temperature,
        }

        timeout = httpx.Timeout(
            timeout=120.0,
            connect=20.0,
        )

        try:
            async with httpx.AsyncClient(
                timeout=timeout,
            ) as client:

                response = await client.post(
                    endpoint,
                    headers=self.headers,
                    json=payload,
                )

        except httpx.TimeoutException as exc:
            raise LLMProviderError(
                "The AI model request timed out."
            ) from exc

        except httpx.RequestError as exc:
            raise LLMProviderError(
                "Unable to connect to the AI model provider."
            ) from exc

        # -----------------------------------------------------
        # HTTP errors
        # -----------------------------------------------------

        if response.is_error:
            detail = self._extract_error_message(
                response
            )

            raise LLMProviderError(
                f"AI model provider returned "
                f"HTTP {response.status_code}: {detail}"
            )

        # -----------------------------------------------------
        # Parse response
        # -----------------------------------------------------

        try:
            data = response.json()

        except ValueError as exc:
            raise LLMProviderError(
                "The AI model provider returned invalid JSON."
            ) from exc

        # -----------------------------------------------------
        # Extract generated content
        # -----------------------------------------------------

        try:
            content = data["choices"][0]["message"]["content"]

        except (
            KeyError,
            IndexError,
            TypeError,
        ) as exc:
            raise LLMProviderError(
                "The AI model provider returned an unexpected "
                "response."
            ) from exc

        if not isinstance(content, str) or not content.strip():
            raise LLMProviderError(
                "The AI model provider returned empty content."
            )

        return content.strip()

    @staticmethod
    def _extract_error_message(
        response: httpx.Response,
    ) -> str:
        """
        Extract a useful error message from an OpenRouter response.
        """

        try:
            data = response.json()

        except ValueError:
            return (
                response.text[:500]
                or "Unknown provider error."
            )

        if isinstance(data, dict):

            error = data.get("error")

            if isinstance(error, dict):

                message = error.get("message")

                if isinstance(message, str) and message:
                    return message

            if isinstance(error, str) and error:
                return error

        return "Unknown provider error."