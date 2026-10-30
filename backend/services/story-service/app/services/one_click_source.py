"""
One-click generation from ANY content: what the uploaded material is, and the video script made from it.

    read_file(name, data)      text from a TXT / MD / DOCX / PDF / PPTX file, or a picture (JPG / PNG / WEBP).
                               Pictures, and PDFs without a text layer (scans), are read by a vision model.
    detect(text, prompt)       which kind of video fits the material: a story film, an explainer, a promo,
                               a tutorial, a documentary or a visual poem (one AI call; a simple guess if it fails)
    write_script(...)          the material rewritten as a short video script in that format: scenes, what is
                               seen, and the narrator's or characters' lines, so the storyboard module can plan it

The rest of the film (storyboard, characters, places, sketches, clips) is the normal one-click run
(app/services/one_click_service.py).
"""

from __future__ import annotations

import base64
import json
import re
import zipfile
from io import BytesIO
from typing import Any
from xml.etree import ElementTree

import httpx

from app.core.config import settings
from app.core.exceptions import LLMProviderError
from app.core.image_safety import inspect_image
from app.llm.model_registry import get_all_models
from app.services.story_document_service import StoryDocumentService

# a model that reads pictures (page photos, scans, slides as images)
VISION_MODEL = "google/gemini-2.5-flash"

MAX_FILE_BYTES = 15 * 1024 * 1024
MAX_TEXT = 60000  # characters kept from one source
MAX_SCAN_PAGES = 8  # pages of a scanned PDF read with the vision model

FILE_KINDS = {
    ".txt": "text",
    ".md": "text",
    ".docx": "document",
    ".pdf": "pdf",
    ".pptx": "slides",
    ".jpg": "image",
    ".jpeg": "image",
    ".png": "image",
    ".webp": "image",
}

# ---------------------------------------------------------------- formats
# label: shown to the person. guide: how the script is written. look: added to every sketch.
FORMATS: dict[str, dict[str, str]] = {
    "story": {
        "label": "Story film",
        "about": "Characters, a plot and dialogue",
        "guide": (
            "a short narrative film: a few memorable characters, a clear beginning, middle and end, vivid visual "
            "moments, and short lines of dialogue the characters say on screen"
        ),
        "look": "A frame from an animated film, cinematic composition.",
    },
    "explainer": {
        "label": "Explainer",
        "about": "Teaches a topic step by step",
        "guide": (
            "an educational explainer video: a friendly narrator explains the topic step by step, from the basic idea "
            "to the key concepts, laws or facts, one idea per scene, with a real-life example and a short recap at the "
            "end. Keep every fact correct and taken from the material; simplify, never invent. Each scene shows a clear "
            "visual metaphor or a simple diagram-like illustration of its idea"
        ),
        "look": "A clean, colourful explainer-video illustration that shows the idea visually, simple diagram-like shapes, no written text.",
    },
    "promo": {
        "label": "Promo / Ad",
        "about": "Shows off a product, place or event",
        "guide": (
            "a punchy promotional video: a hook in the first scene, the problem or desire, the product or offer as the "
            "answer with its key benefits shown in action, and a confident closing call to action. A voice-over "
            "narrator speaks in short, energetic lines"
        ),
        "look": "A polished commercial frame, premium product-video lighting, clean background.",
    },
    "tutorial": {
        "label": "Tutorial / How-to",
        "about": "Steps to follow, in order",
        "guide": (
            "a step-by-step how-to video: what you need, then each step in order (one step per scene) with a clear "
            "close-up of the action, a tip or a common mistake where it helps, and the finished result at the end. "
            "A calm narrator says each step"
        ),
        "look": "A clear how-to frame, close-up of hands and objects doing the step, bright even light.",
    },
    "documentary": {
        "label": "Documentary / Summary",
        "about": "Reports, slides, news or history",
        "guide": (
            "a short documentary or summary video: an opening that sets the context, the main points or findings one "
            "per scene with a strong visual for each, and a closing takeaway. A measured narrator voice-over carries it"
        ),
        "look": "A documentary-style cinematic frame, real-world setting, natural light.",
    },
    "poem": {
        "label": "Visual poem",
        "about": "Mood and imagery, read aloud",
        "guide": (
            "a visual poem: the lines are read aloud by a narrator (keep the original words when the material is a "
            "poem), and each scene is a striking, symbolic image that carries the mood of its lines"
        ),
        "look": "A dreamy, painterly, symbolic frame with expressive colour and light.",
    },
}
FORMAT_KEYS = ["auto", *FORMATS.keys()]


class SourceError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _text_model() -> str:
    models = get_all_models()
    if not models:
        raise SourceError("No AI model is available right now.", 503)
    return models[0].id


def _clean(text: str) -> str:
    lines = [" ".join(line.split()) for line in (text or "").splitlines()]
    out = "\n".join(lines)
    out = re.sub(r"\n{3,}", "\n\n", out).strip()
    return out[:MAX_TEXT]


def _title_of(name: str) -> str:
    base = (name or "").rsplit("/", 1)[-1].rsplit(".", 1)[0]
    base = re.sub(r"[_\-]+", " ", base).strip()
    return (base[:1].upper() + base[1:])[:200] if base else "My material"


# ---------------------------------------------------------------- reading files
def _pptx_text(data: bytes) -> tuple[str, int]:
    """Every slide's text (and its speaker notes), in slide order."""
    try:
        archive = zipfile.ZipFile(BytesIO(data))
    except zipfile.BadZipFile as exc:
        raise SourceError("This PowerPoint file could not be opened.") from exc
    names = archive.namelist()
    slide_no = lambda n: int(re.search(r"(\d+)\.xml$", n).group(1))  # noqa: E731
    slides = sorted((n for n in names if re.fullmatch(r"ppt/slides/slide\d+\.xml", n)), key=slide_no)
    notes = {slide_no(n): n for n in names if re.fullmatch(r"ppt/notesSlides/notesSlide\d+\.xml", n)}
    ns = "{http://schemas.openxmlformats.org/drawingml/2006/main}"

    def texts(name: str) -> list[str]:
        root = ElementTree.fromstring(archive.read(name))
        out = []
        for para in root.iter(f"{ns}p"):
            line = "".join(t.text or "" for t in para.iter(f"{ns}t")).strip()
            if line:
                out.append(line)
        return out

    parts = []
    for i, name in enumerate(slides, start=1):
        body = texts(name)
        note = [t for t in texts(notes[slide_no(name)]) if not t.isdigit()] if slide_no(name) in notes else []
        block = [f"Slide {i}:"] + body + ([f"Notes: {' '.join(note)}"] if note else [])
        parts.append("\n".join(block))
    return "\n\n".join(parts), len(slides)


def _pdf_page_images(data: bytes, limit: int = MAX_SCAN_PAGES) -> list[tuple[bytes, str]]:
    """The pictures inside a scanned PDF's first pages (a scan is one picture per page)."""
    from pypdf import PdfReader

    out: list[tuple[bytes, str]] = []
    reader = PdfReader(BytesIO(data))
    for page in reader.pages[:limit]:
        try:
            images = list(page.images)
        except Exception:  # noqa: BLE001 - an unreadable page is skipped
            continue
        if not images:
            continue
        biggest = max(images, key=lambda im: len(im.data))
        try:
            mime, _ = inspect_image(biggest.data)
        except ValueError:
            # not PNG / JPEG / WEBP as stored: re-encode it as PNG
            try:
                buffer = BytesIO()
                biggest.image.convert("RGB").save(buffer, "PNG")
                out.append((buffer.getvalue(), "image/png"))
            except Exception:  # noqa: BLE001
                continue
            continue
        out.append((biggest.data, mime))
    return out


async def read_images(images: list[tuple[bytes, str]]) -> str:
    """Text in pictures (page photos, scans), or, for a picture without text, a description of it."""
    content: list[dict[str, Any]] = [
        {
            "type": "text",
            "text": (
                "Read these pictures for a video maker. If a picture has text (a book page, notes, slides, a poster), "
                "write out all of its text exactly, in its own language, keeping headings and the order of the page. "
                "If a picture has little or no text (a photo, a drawing, a product), describe in detail what it shows. "
                "Answer with the text or description only."
            ),
        }
    ]
    for data, mime in images:
        content.append({"type": "image_url", "image_url": {"url": f"data:{mime};base64,{base64.b64encode(data).decode('ascii')}"}})
    payload = {"model": VISION_MODEL, "messages": [{"role": "user", "content": content}], "temperature": 0.1}
    headers = {"Authorization": f"Bearer {settings.OPENROUTER_API_KEY}", "Content-Type": "application/json", "X-Title": "Cinemor"}
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(180.0, connect=20.0)) as client:
            response = await client.post(f"{settings.OPENROUTER_BASE_URL.rstrip('/')}/chat/completions", headers=headers, json=payload)
    except httpx.HTTPError as exc:
        raise SourceError("The pictures could not be read right now. Please try again.", 502) from exc
    if response.is_error:
        raise SourceError("The pictures could not be read right now. Please try again.", 502)
    try:
        text = response.json()["choices"][0]["message"]["content"]
    except (ValueError, KeyError, IndexError, TypeError) as exc:
        raise SourceError("The pictures could not be read.", 502) from exc
    if isinstance(text, list):  # some providers send parts
        text = " ".join(p.get("text", "") for p in text if isinstance(p, dict))
    return _clean(str(text or ""))


async def read_file(name: str, data: bytes) -> dict[str, Any]:
    """{title, kind, text, words, pages, note}: the readable content of one uploaded file."""
    ext = "." + name.rsplit(".", 1)[-1].lower() if "." in (name or "") else ""
    if ext == ".ppt":
        raise SourceError("Old PowerPoint (.ppt) files can't be read. Save it as .pptx (or PDF) and upload that.")
    if ext == ".doc":
        raise SourceError("Old Word (.doc) files can't be read. Save it as .docx (or PDF) and upload that.")
    kind = FILE_KINDS.get(ext)
    if kind is None:
        raise SourceError("Upload a PDF, Word (.docx), PowerPoint (.pptx), text file, or a picture (JPG, PNG, WEBP).")
    if not data:
        raise SourceError("This file is empty.")
    if len(data) > MAX_FILE_BYTES:
        raise SourceError("This file is too large (15 MB at most).", 413)

    pages = None
    note = ""
    if kind == "image":
        try:
            mime, _ = inspect_image(data)
        except ValueError as exc:
            raise SourceError(str(exc)) from exc
        text = await read_images([(data, mime)])
        note = "Read from the picture"
    elif kind == "slides":
        text, pages = _pptx_text(data)
        text = _clean(text)
    elif kind == "pdf":
        try:
            text = _clean(StoryDocumentService._extract_pdf(data))
            from pypdf import PdfReader

            pages = len(PdfReader(BytesIO(data)).pages)
        except Exception as exc:  # noqa: BLE001
            raise SourceError("This PDF could not be opened.") from exc
        if len(text.split()) < 25:  # a scan: no text layer, read its pages as pictures
            scans = _pdf_page_images(data)
            if not scans:
                raise SourceError("No text was found in this PDF.")
            text = await read_images(scans)
            note = f"Read from {len(scans)} scanned {'page' if len(scans) == 1 else 'pages'}"
    elif kind == "document":
        try:
            text = _clean(StoryDocumentService._extract_docx(data))
        except Exception as exc:  # noqa: BLE001
            raise SourceError("This Word file could not be opened.") from exc
    else:
        text = _clean(StoryDocumentService._extract_txt(data))

    if not text.strip():
        raise SourceError("No readable content was found in this file.")
    return {"title": _title_of(name), "kind": kind, "text": text, "words": len(text.split()), "pages": pages, "note": note}


# ---------------------------------------------------------------- what kind of video
DETECT_SYSTEM = (
    "You decide what kind of short video best presents some material. Choose exactly one format:\n"
    "story = fiction, a story, a script with characters and plot\n"
    "explainer = study material, a chapter, notes, a concept, science, maths, history lesson, anything to teach\n"
    "promo = a product, service, brand, place, event or offer to advertise\n"
    "tutorial = instructions, a recipe, a process, steps to follow\n"
    "documentary = a report, article, news, case study, presentation slides, biography, data to summarise\n"
    "poem = a poem, lyrics, quotes or mood writing\n"
    'Answer with JSON only: {"format": "...", "title": "a short title for the video", "reason": "one short sentence"}'
)


def _guess(text: str) -> str:
    t = text.lower()
    if re.search(r"\b(step \d|ingredients|how to|instructions)\b", t):
        return "tutorial"
    if re.search(r"\b(chapter|definition|theorem|law of|formula|equation|exercise|lesson)\b", t):
        return "explainer"
    if re.search(r"\b(buy|offer|discount|our product|order now|launch)\b", t):
        return "promo"
    if re.search(r"slide \d+:", t):
        return "documentary"
    return "story"


async def detect(text: str, prompt: str = "", model_id: str | None = None) -> dict[str, str]:
    """{format, title, reason}: the format that fits the material (and the person's note)."""
    from app.clients.openrouter_client import OpenRouterClient

    sample = (text or "")[:6000]
    user = (f"The person's note: {prompt}\n\n" if prompt else "") + (f"Material:\n{sample}" if sample else "(no material, only the note)")
    try:
        raw = await OpenRouterClient().generate(model_id=model_id or _text_model(), system_prompt=DETECT_SYSTEM, user_prompt=user, temperature=0)
        match = re.search(r"\{.*\}", raw or "", re.S)
        data = json.loads(match.group(0)) if match else {}
    except (LLMProviderError, ValueError, SourceError):
        data = {}
    fmt = str(data.get("format") or "").strip().lower()
    if fmt not in FORMATS:
        fmt = _guess(f"{prompt}\n{text}")
    title = str(data.get("title") or "").strip().strip('"')[:200]
    return {"format": fmt, "label": FORMATS[fmt]["label"], "title": title, "reason": str(data.get("reason") or "").strip()[:300]}


# ---------------------------------------------------------------- the video script
SCRIPT_SYSTEM = """You turn material into the script of ONE short video. Write {guide}.

Rules:
- Language: write everything people say in {language}{script_hint}. Scene descriptions may be in the same language.
- Length: about {words} words in total, in {scenes} scenes at most. For long material keep only the most important points.
- Write it as a story document the storyboard team can split into scenes: one paragraph per scene. Start each paragraph
  with what is seen (place, people or objects, action), then the spoken lines on their own lines, written as
  Name: "line"  (use Narrator: "line" for a voice-over).
- Every scene must be something a camera can show. Never ask for written text, captions or labels on screen.
- Keep names, numbers and facts from the material exactly. Do not add facts that are not in the material.
- Follow the person's note when there is one; it wins over these defaults.

Answer with JSON only: {{"title": "the video's title", "script": "the whole script"}}"""

SCRIPT_HINTS = {
    "Hindi": " (Devanagari script)",
    "Hinglish": " (Hindi mixed with everyday English words, in the Latin alphabet)",
}


async def write_script(
    *, fmt: str, material: str, prompt: str, language: str, words: int, scenes: int, style: str, model_id: str
) -> dict[str, str]:
    """{title, content}: the material (or the idea alone) as a video script in this format."""
    from app.clients.openrouter_client import OpenRouterClient

    info = FORMATS.get(fmt) or FORMATS["story"]
    system = SCRIPT_SYSTEM.format(guide=info["guide"], language=language, script_hint=SCRIPT_HINTS.get(language, ""), words=words, scenes=scenes)
    user = []
    if prompt:
        user.append(f"The person's note: {prompt}")
    user.append(f"Visual style of the video: {style}.")
    user.append(f"Material:\n{material[:MAX_TEXT]}" if material else "There is no material: make the video from the note alone.")
    try:
        raw = await OpenRouterClient().generate(model_id=model_id, system_prompt=system, user_prompt="\n\n".join(user), temperature=0.6)
    except LLMProviderError as exc:
        raise SourceError(f"The script could not be written: {exc}", 502) from exc
    match = re.search(r"\{.*\}", raw or "", re.S)
    try:
        data = json.loads(match.group(0)) if match else {}
    except ValueError:
        data = {}
    script = str(data.get("script") or "").strip() or (raw or "").strip()
    if not script or script.startswith("{"):
        raise SourceError("The script could not be written. Please try again.", 502)
    title = str(data.get("title") or "").strip().strip('"')[:300] or "My video"
    return {"title": title, "content": script}