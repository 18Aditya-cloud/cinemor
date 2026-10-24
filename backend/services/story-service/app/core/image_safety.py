"""
Safe inspection of images that come from users or AI providers.

Pillow picks a decoder from the file's magic bytes, not from its name, so a
file called "photo.png" can really be a TIFF, JPEG 2000, EPS (which runs
Ghostscript), PDF, GIF and so on. Most of Pillow's published vulnerabilities
live in those decoders. Cinemor only ever accepts PNG, JPEG and WEBP, so only
those three decoders are allowed to run on untrusted bytes.

Also refused:
- animated images (APNG / animated WEBP): the multi-frame code paths carry
  their own vulnerabilities and Cinemor never needs animation;
- decompression bombs: huge pixel counts are an error, not just a warning.

Pillow is held below 12 because moviepy (film assembly) requires it; see
requirements.txt. This module keeps that version safe for Cinemor's use.
"""

from __future__ import annotations

import warnings
from io import BytesIO

from PIL import Image

# ~40 megapixels (for example 6300 x 6300) is far above any image Cinemor
# handles; anything larger is treated as a decompression bomb.
Image.MAX_IMAGE_PIXELS = 40_000_000

ALLOWED_FORMATS: dict[str, tuple[str, str]] = {
    "PNG": ("image/png", ".png"),
    "JPEG": ("image/jpeg", ".jpg"),
    "WEBP": ("image/webp", ".webp"),
}


def open_trusted_format(source):
    """Image.open limited to the allowed decoders. Use as a context manager."""
    return Image.open(source, formats=list(ALLOWED_FORMATS))


def inspect_image(image_bytes: bytes) -> tuple[str, str]:
    """
    Check untrusted image bytes and return (mime_type, extension).

    Raises ValueError for anything that is not a single-frame PNG, JPEG or
    WEBP of sane size, without ever running another decoder.
    """
    if not image_bytes:
        raise ValueError("The image is empty.")

    animated = False
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)

            with open_trusted_format(BytesIO(image_bytes)) as image:
                image_format = image.format
                animated = bool(getattr(image, "is_animated", False)) or getattr(image, "n_frames", 1) != 1
                if not animated:
                    image.verify()

    except Exception as exc:  # noqa: BLE001 - any decoder error means "not a valid image"
        raise ValueError("Not a valid PNG, JPEG or WEBP image.") from exc

    if animated:
        raise ValueError("Animated images are not supported.")

    if image_format not in ALLOWED_FORMATS:
        raise ValueError(f"Unsupported image format: {image_format}")

    return ALLOWED_FORMATS[image_format]
