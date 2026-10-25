from typing import Any
from urllib.parse import urljoin

import httpx

from app.core.config import settings


class OpenRouterVideoError(Exception):
    """Raised when OpenRouter video generation fails."""


class OpenRouterVideoClient:
    def __init__(self) -> None:
        self.base_url = settings.OPENROUTER_BASE_URL.rstrip("/")
        self.api_key = settings.OPENROUTER_API_KEY

        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        self.timeout = httpx.Timeout(
            timeout=120.0,
            connect=20.0,
        )

    async def list_models(self) -> list[dict[str, Any]]:
        """Return the currently available OpenRouter video models."""
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.get(
                f"{self.base_url}/videos/models",
                headers=self.headers,
            )

        if response.is_error:
            raise OpenRouterVideoError(
                f"Unable to list video models: {response.text[:1000]}"
            )

        data = response.json().get("data", [])
        return data if isinstance(data, list) else []

    async def get_model(self, model_id: str) -> dict[str, Any]:
        """Find a model in the live video-model catalog."""
        models = await self.list_models()

        for model in models:
            if model.get("id") == model_id:
                return model

        raise OpenRouterVideoError(
            f"Model '{model_id}' is not present in the OpenRouter "
            "video-model catalog. Check its exact ID and availability."
        )

    async def submit_video(
        self,
        *,
        model: str,
        prompt: str,
        duration: int | None = None,
        aspect_ratio: str | None = "16:9",
        resolution: str | None = "480p", #default
        generate_audio: bool | None = False,
        frame_images: list[dict[str, Any]] | None = None,
        input_references: list[dict[str, Any]] | None = None,
        seed: int | None = None,
    ) -> dict[str, Any]:
        """
        Submit a video generation job.

        Model-specific parameters are checked against OpenRouter's
        live catalog before submission.
        """
        if not model or not prompt.strip():
            raise ValueError("Both model and prompt are required.")

        model_info = await self.get_model(model)

        payload: dict[str, Any] = {
            "model": model,
            "prompt": prompt.strip(),
        }

        if duration is not None:
            supported = model_info.get("supported_durations")
            if supported and duration not in supported:
                raise OpenRouterVideoError(
                    f"Duration {duration}s is not supported by {model}. "
                    f"Supported durations: {supported}"
                )
            payload["duration"] = duration

        if aspect_ratio:
            supported = model_info.get("supported_aspect_ratios")
            if supported and aspect_ratio not in supported:
                raise OpenRouterVideoError(
                    f"Aspect ratio {aspect_ratio} is not supported by "
                    f"{model}. Supported ratios: {supported}"
                )
            payload["aspect_ratio"] = aspect_ratio

        if resolution:
            supported = model_info.get("supported_resolutions")
            if supported and resolution not in supported:
                raise OpenRouterVideoError(
                    f"Resolution {resolution} is not supported by "
                    f"{model}. Supported resolutions: {supported}"
                )
            payload["resolution"] = resolution

        if generate_audio is not None:
            payload["generate_audio"] = generate_audio

        if frame_images:
            supported_frames = model_info.get("supported_frame_images") or []
            for frame in frame_images:
                frame_type = frame.get("frame_type")
                if frame_type not in supported_frames:
                    raise OpenRouterVideoError(
                        f"Frame type '{frame_type}' is not supported by "
                        f"{model}. Supported frame types: {supported_frames}"
                    )
            payload["frame_images"] = frame_images

        if input_references:
            payload["input_references"] = input_references

        if seed is not None:
            if model_info.get("seed") is False:
                raise OpenRouterVideoError(
                    f"Model '{model}' does not support seed."
                )
            payload["seed"] = seed

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                f"{self.base_url}/videos",
                headers=self.headers,
                json=payload,
            )

        if response.is_error:
            raise OpenRouterVideoError(
                f"Video submission failed ({response.status_code}): "
                f"{response.text[:2000]}"
            )

        result = response.json()

        if not result.get("id") or not result.get("polling_url"):
            raise OpenRouterVideoError(
                f"Unexpected submission response: {result}"
            )

        return result

    async def get_job(self, job_id: str) -> dict[str, Any]:
        """Fetch the current status of a video generation job."""
        if not job_id:
            raise ValueError("Job ID is required.")

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.get(
                f"{self.base_url}/videos/{job_id}",
                headers=self.headers,
            )

        if response.is_error:
            raise OpenRouterVideoError(
                f"Unable to fetch video job ({response.status_code}): "
                f"{response.text[:1000]}"
            )

        return response.json()

    async def poll_job(
        self,
        job_id: str,
        *,
        interval_seconds: int = 10,
        max_wait_seconds: int = 1800,
    ) -> dict[str, Any]:
        """Poll until the job completes or reaches a terminal state."""
        import asyncio
        import time

        terminal_states = {
            "completed",
            "failed",
            "cancelled",
            "expired",
        }

        deadline = time.monotonic() + max_wait_seconds

        while time.monotonic() < deadline:
            job = await self.get_job(job_id)
            status = job.get("status")

            if status in terminal_states:
                if status != "completed":
                    raise OpenRouterVideoError(
                        f"Video job ended with status '{status}': "
                        f"{job.get('error', 'No error details provided.')}"
                    )
                return job

            await asyncio.sleep(interval_seconds)

        raise TimeoutError(
            f"Video job '{job_id}' did not finish within "
            f"{max_wait_seconds} seconds. Its job ID is preserved "
            "so generation can be checked again later."
        )

    async def download_video(
        self,
        job: dict[str, Any],
        output_path: str,
        *,
        index: int = 0,
    ) -> str:
        """Download the completed video's bytes to a local file."""
        import asyncio
        from pathlib import Path

        if job.get("status") != "completed":
            raise OpenRouterVideoError(
                "Cannot download a video before its job is completed."
            )

        if index < 0:
            raise ValueError("Video output index cannot be negative.")

        urls = job.get("unsigned_urls") or []

        if index < len(urls):
            download_url = urls[index]
        else:
            download_url = (
                f"{self.base_url}/videos/{job['id']}/content"
                f"?index={index}"
            )

        # Do not follow arbitrary URLs with the API key. OpenRouter's
        # content endpoint and its documented URLs are the expected hosts.
        expected_host = "openrouter.ai"
        from urllib.parse import urlparse

        parsed = urlparse(download_url)
        if parsed.scheme != "https" or parsed.hostname != expected_host:
            raise OpenRouterVideoError(
                "Unexpected video download host. Refusing to send "
                "the OpenRouter API key to an untrusted URL."
            )

        destination = Path(output_path)
        await asyncio.to_thread(
            destination.parent.mkdir,
            parents=True,
            exist_ok=True,
        )

        async with httpx.AsyncClient(
            timeout=self.timeout,
            follow_redirects=False,
        ) as client:
            async with client.stream(
                "GET",
                download_url,
                headers={"Authorization": f"Bearer {self.api_key}"},
            ) as response:
                if response.is_error:
                    body = await response.aread()
                    raise OpenRouterVideoError(
                        f"Video download failed ({response.status_code}): "
                        f"{body[:1000].decode('utf-8', errors='replace')}"
                    )

                with destination.open("wb") as output:
                    async for chunk in response.aiter_bytes():
                        output.write(chunk)

        return str(destination)
