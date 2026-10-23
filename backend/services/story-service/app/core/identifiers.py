from __future__ import annotations

import secrets
import string


# ============================================================
# Organization Code Configuration
# ============================================================

ORGANIZATION_CODE_PREFIX = "CIN"

ORGANIZATION_CODE_ALPHABET = (
    string.ascii_uppercase
    + string.digits
)

# Characters that are easy to confuse visually are excluded.
ORGANIZATION_CODE_ALPHABET = (
    ORGANIZATION_CODE_ALPHABET
    .replace("0", "")
    .replace("O", "")
    .replace("1", "")
    .replace("I", "")
)


def generate_organization_code(
    length: int = 12,
) -> str:
    """
    Generate a cryptographically secure organization code.

    Example:

        CIN-X7K4M9Q2P8RT

    The random portion is generated using Python's `secrets`
    module rather than the normal `random` module.
    """

    if length < 8:
        raise ValueError(
            "Organization code length must be at least 8."
        )

    random_part = "".join(
        secrets.choice(
            ORGANIZATION_CODE_ALPHABET
        )
        for _ in range(length)
    )

    return (
        f"{ORGANIZATION_CODE_PREFIX}-"
        f"{random_part}"
    )