
import base64

import httpx

from app.core.config import settings


IMAGE_MODELS = {
    "qwen/qwen-image-2.1-turbo": "Qwen Image 2.1 Turbo",
    "qwen/qwen-image-2.1-pro": "Qwen Image 2.1 Pro",
    "black-forest-labs/flux.2-pro": "FLUX.2 Pro",
    "black-forest-labs/flux.2-flex": "FLUX.2 Flex",
    "black-forest-labs/flux.2-max": "FLUX.2 Max",
    "openai/gpt-image-2.5-flare": "GPT Image 2.5 Flare",
    "openai/gpt-image-2.5-sunburst": "GPT Image 2.5 Sunburst",
}

DEFAULT_IMAGE_MODEL = "qwen/qwen-image-2.1-turbo"


class OpenRouterImageClient:
    """Generate images through OpenRouter's image-generation API."""

    def __init__(self) -> None:
        self.base_url = settings.OPENROUTER_BASE_URL.rstrip("/")
        self.api_key = settings.OPENROUTER_API_KEY

        if not self.api_key:
            raise RuntimeError("OPENROUTER_API_KEY is not configured.")

    async def generate_image(
        self,
        *,
        model_id: str,
        prompt: str,
        resolution: str = "1K",
        output_format: str = "png",
        input_references: list[str] | None = None,
    ) -> tuple[bytes, str]:
        if model_id not in IMAGE_MODELS:
            raise ValueError(
                f"Unsupported image model: {model_id}. "
                f"Choose one of: {', '.join(IMAGE_MODELS.keys())}"
            )

        if not prompt.strip():
            raise ValueError("Image prompt cannot be empty.")

        if resolution not in {"1K", "2K", "4K"}:
            raise ValueError(
                "Unsupported resolution. Choose 1K, 2K, or 4K."
            )

        if output_format not in {"png", "jpeg", "webp"}:
            raise ValueError(
                "Unsupported output format. Choose png, jpeg, or webp."
            )

        url = f"{self.base_url}/images"

        payload = {
            "model": model_id,
            "prompt": prompt,
            "resolution": resolution,
            "output_format": output_format,
            "n": 1,
        }

        if input_references:
            if len(input_references) > 16:
                raise ValueError(
                    "A maximum of 16 input references is allowed."
                )

            payload["input_references"] = [
                {
                    "type": "image_url",
                    "image_url": {"url": reference},
                }
                for reference in input_references
            ]

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        timeout = httpx.Timeout(180.0, connect=20.0)

        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(
                    url,
                    headers=headers,
                    json=payload,
                )
        except httpx.TimeoutException as exc:
            raise RuntimeError(
                "OpenRouter image generation timed out."
            ) from exc
        except httpx.RequestError as exc:
            raise RuntimeError(
                f"Could not connect to OpenRouter: {exc}"
            ) from exc

        if response.is_error:
            raise RuntimeError(
                "OpenRouter image generation failed "
                f"(HTTP {response.status_code}): "
                f"{response.text[:2000]}"
            )

        try:
            result = response.json()
            image_result = result["data"][0]
            image_data = image_result["b64_json"]

            image_bytes = base64.b64decode(
                image_data,
                validate=True,
            )
        except (
            ValueError,
            KeyError,
            IndexError,
            TypeError,
        ) as exc:
            raise RuntimeError(
                "OpenRouter returned an invalid or unsupported "
                "image response. Check the selected model's "
                "documented response format."
            ) from exc

        if not image_bytes:
            raise RuntimeError("OpenRouter returned an empty image.")

        media_type = image_result.get("media_type")

        if not media_type:
            media_type = {
                "png": "image/png",
                "jpeg": "image/jpeg",
                "webp": "image/webp",
            }[output_format]

        if media_type not in {
            "image/png",
            "image/jpeg",
            "image/webp",
        }:
            raise RuntimeError(
                f"Unexpected image media type: {media_type}"
            )

        return image_bytes, media_type
