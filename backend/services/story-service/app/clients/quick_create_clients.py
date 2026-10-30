"""
OpenRouter calls used only by the Quick Create tools (app/services/quick_create_service.py).

The project modules keep their own clients unchanged; these add what the tools need on top:
- pictures with an aspect ratio and more than one result (POST /images),
- speech from text (POST /audio/speech), and the list of voices each speech model offers.
"""

from __future__ import annotations

import base64
import io
import time
import wave
from typing import Any

import httpx

from app.core.config import settings


class QuickCreateProviderError(Exception):
    """The AI provider could not make the picture or the audio."""


ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"]

# ------------------------------------------------------------------ speech models
# Only these models can be chosen (all checked against OpenRouter's live speech list, output_modalities=speech).
# Voices come from that live list; the voices below are used when it has none for a model. A model without any
# voice is not offered.
#   instructions  the model follows delivery directions (tone, pace, language): sent as `instructions`
#   speed         the model honours `speed` (none of these do; the Speed control is hidden for them)
#   format        what we ask for: Gemini returns only raw PCM (joined into a WAV), MiniMax only mp3
#   language_from_voice  the voice id carries its locale (hi-IN-..., en-US-...): the language comes from the voice
# (openai/gpt-4o-mini-tts-2025-12-15 was offered before; OpenRouter no longer has it: "Model ... does not exist".)
AUDIO_MODELS: dict[str, dict[str, Any]] = {
    "google/gemini-3.8-flash-tts": {
        "name": "Gemini 3.8 Flash TTS",
        "instructions": True,
        "speed": False,
        "format": "pcm",
        "voices": ["Kore", "Puck", "Charon", "Zephyr", "Fenrir", "Leda", "Orus", "Aoede", "Callirrhoe", "Autonoe", "Enceladus", "Iapetus", "Umbriel", "Algieba", "Despina", "Erinome", "Algenib", "Rasalgethi", "Laomedeia", "Achernar", "Alnilam", "Schedar", "Gacrux", "Pulcherrima", "Achird", "Zubenelgenubi", "Vindemiatrix", "Sadachbia", "Sadaltager", "Sulafat"],
    },
    "google/gemini-3.8-flash-lite-tts": {
        "name": "Gemini 3.8 Flash Lite TTS",
        "instructions": True,
        "speed": False,
        "format": "pcm",
        "voices": ["Kore", "Puck", "Charon", "Zephyr", "Fenrir", "Leda", "Orus", "Aoede", "Callirrhoe", "Autonoe", "Enceladus", "Iapetus", "Umbriel", "Algieba", "Despina", "Erinome", "Algenib", "Rasalgethi", "Laomedeia", "Achernar", "Alnilam", "Schedar", "Gacrux", "Pulcherrima", "Achird", "Zubenelgenubi", "Vindemiatrix", "Sadachbia", "Sadaltager", "Sulafat"],
    },
    "microsoft/mai-voice-2.1": {
        "name": "Microsoft MAI-Voice 2.1 (Hindi and Indian English voices)",
        "instructions": False,
        "speed": False,
        "format": "mp3",
        "language_from_voice": True,
        "voices": ["hi-IN-Kavya:MAI-Voice-2.1", "hi-IN-Priya:MAI-Voice-2.1", "hi-IN-Arjun:MAI-Voice-2.1", "hi-IN-Dhruv:MAI-Voice-2.1", "en-IN-Priya:MAI-Voice-2.1", "en-IN-Dhruv:MAI-Voice-2.1", "en-US-Harper:MAI-Voice-2.1", "en-US-Olivia:MAI-Voice-2.1", "en-US-Iris:MAI-Voice-2.1", "en-US-Sage:MAI-Voice-2.1", "en-US-Ethan:MAI-Voice-2.1", "en-US-Grant:MAI-Voice-2.1", "en-US-Jasper:MAI-Voice-2.1", "en-GB-Emily:MAI-Voice-2.1", "en-GB-Harry:MAI-Voice-2.1", "es-MX-Valeria:MAI-Voice-2.1", "es-MX-Alejo:MAI-Voice-2.1", "fr-FR-Soleil:MAI-Voice-2.1", "fr-FR-Marc:MAI-Voice-2.1", "de-DE-Mia:MAI-Voice-2.1", "de-DE-Klaus:MAI-Voice-2.1"],
    },
    "elevenlabs/eleven-v4": {
        "name": "ElevenLabs v4",
        "instructions": False,
        "speed": False,
        "format": "mp3",
        "voices": ["george", "sarah", "adam", "alice", "bella", "bill", "brian", "callum", "charlie", "chris", "daniel", "eric", "harry", "jessica", "laura", "liam", "lily", "matilda", "river", "roger", "will"],
    },
    "elevenlabs/eleven-v3": {
        "name": "ElevenLabs v3",
        "instructions": False,
        "speed": False,
        "format": "mp3",
        "voices": ["george", "sarah", "adam", "alice", "bella", "bill", "brian", "callum", "charlie", "chris", "daniel", "eric", "harry", "jessica", "laura", "liam", "lily", "matilda", "river", "roger", "will"],
    },
    "elevenlabs/eleven-multilingual-v2": {
        "name": "ElevenLabs Multilingual v2",
        "instructions": False,
        "speed": False,
        "format": "mp3",
        "voices": ["george", "sarah", "adam", "alice", "bella", "bill", "brian", "callum", "charlie", "chris", "daniel", "eric", "harry", "jessica", "laura", "liam", "lily", "matilda", "river", "roger", "will"],
    },
    "minimax/speech-2.8-hd": {
        "name": "MiniMax Speech 2.8 HD",
        "instructions": False,
        "speed": False,
        "format": "mp3",
        "voices": ["English_expressive_narrator", "English_CaptivatingStoryteller", "English_radiant_girl", "English_magnetic_voiced_man", "English_CalmWoman", "English_Trustworth_Man", "English_Graceful_Lady", "English_WiseScholar"],
    },
}

# PCM from the speech API: 16-bit mono at 24 kHz
PCM_RATE = 24000

_voice_cache: dict[str, Any] = {"at": 0.0, "voices": {}}


def _headers(json_body: bool = True) -> dict[str, str]:
    headers = {"Authorization": f"Bearer {settings.OPENROUTER_API_KEY}", "X-Title": "Cinemor"}
    if json_body:
        headers["Content-Type"] = "application/json"
    return headers


def _base() -> str:
    return settings.OPENROUTER_BASE_URL.rstrip("/")


def _error_text(response: httpx.Response) -> str:
    try:
        data = response.json()
        error = data.get("error") if isinstance(data, dict) else None
        if isinstance(error, dict) and error.get("message"):
            return str(error["message"])[:500]
        if isinstance(error, str):
            return error[:500]
    except ValueError:
        pass
    return (response.text or "Unknown provider error.")[:500]


# ------------------------------------------------------------------ pictures
async def generate_images(
    *, model_id: str, prompt: str, aspect_ratio: str, count: int, references: list[str] | None = None
) -> list[tuple[bytes, str]]:
    """
    Make up to `count` pictures. Returns [(bytes, media type)]; a provider may return fewer than asked.
    `references`: pictures (data URLs) the result should follow (the same face, clothes, place or style).
    """
    payload = {
        "model": model_id,
        "prompt": prompt,
        "aspect_ratio": aspect_ratio,
        "resolution": "1K",
        "output_format": "png",
        "n": count,
    }
    if references:
        payload["input_references"] = [{"type": "image_url", "image_url": {"url": url}} for url in references]
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(240.0, connect=20.0)) as client:
            response = await client.post(f"{_base()}/images", headers=_headers(), json=payload)
    except httpx.TimeoutException as exc:
        raise QuickCreateProviderError("The image model took too long. Please try again.") from exc
    except httpx.RequestError as exc:
        raise QuickCreateProviderError("Could not reach the image model.") from exc
    if response.is_error:
        raise QuickCreateProviderError(f"The image model failed: {_error_text(response)}")
    try:
        items = response.json()["data"]
        out = []
        for item in items:
            data = base64.b64decode(item["b64_json"], validate=True)
            if data:
                out.append((data, item.get("media_type") or "image/png"))
    except (ValueError, KeyError, TypeError) as exc:
        raise QuickCreateProviderError("The image model sent back something that is not an image.") from exc
    if not out:
        raise QuickCreateProviderError("The image model sent back no image.")
    return out


# ------------------------------------------------------------------ speech
async def audio_models() -> list[dict[str, Any]]:
    """The speech models that can be chosen, each with its voices (live list, cached for an hour)."""
    now = time.monotonic()
    if now - _voice_cache["at"] > 3600:
        live: dict[str, list[str]] = {}
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(20.0, connect=10.0)) as client:
                response = await client.get(f"{_base()}/models", params={"output_modalities": "speech"}, headers=_headers(False))
            if not response.is_error:
                for model in response.json().get("data", []) or []:
                    voices = model.get("supported_voices") or []
                    names = [v if isinstance(v, str) else (v.get("id") or v.get("name")) for v in voices]
                    live[model.get("id")] = [n for n in names if isinstance(n, str) and n]
        except (httpx.HTTPError, ValueError):
            live = {}
        _voice_cache.update(at=now, voices=live)
    out = []
    for model_id, info in AUDIO_MODELS.items():
        voices = _voice_cache["voices"].get(model_id) or info["voices"]
        if voices:
            out.append({
                "id": model_id,
                "name": info["name"],
                "voices": voices,
                "instructions": info["instructions"],
                "speed": info["speed"],
                "language_from_voice": bool(info.get("language_from_voice")),
            })
    return out


def _wav(pcm: bytes) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(PCM_RATE)
        w.writeframes(pcm)
    return buffer.getvalue()


async def speak(*, model_id: str, text: str, voice: str, instructions: str = "", speed: float = 1.0) -> tuple[bytes, str]:
    """One piece of speech. Returns (bytes, "mp3" | "pcm")."""
    info = AUDIO_MODELS[model_id]
    payload: dict[str, Any] = {"model": model_id, "input": text, "voice": voice, "response_format": info["format"]}
    if info["instructions"] and instructions:
        payload["instructions"] = instructions
    if info["speed"] and speed != 1.0:
        payload["speed"] = speed
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(180.0, connect=20.0)) as client:
            response = await client.post(f"{_base()}/audio/speech", headers=_headers(), json=payload)
    except httpx.TimeoutException as exc:
        raise QuickCreateProviderError("The voice model took too long. Please try again.") from exc
    except httpx.RequestError as exc:
        raise QuickCreateProviderError("Could not reach the voice model.") from exc
    if response.is_error:
        raise QuickCreateProviderError(f"The voice model failed: {_error_text(response)}")
    if not response.content:
        raise QuickCreateProviderError("The voice model sent back no audio.")
    kind = "pcm" if "pcm" in (response.headers.get("content-type") or "") or info["format"] == "pcm" else "mp3"
    return response.content, kind


def join_pcm(parts: list[bytes]) -> bytes:
    """Pieces of raw speech -> one WAV file."""
    return _wav(b"".join(parts))