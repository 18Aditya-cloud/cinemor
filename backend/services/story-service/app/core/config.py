import base64

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


# ============================================================
# Paths
# ============================================================

# config.py is located at:
# story-service/app/core/config.py
#
# We need the .env located at:
# story-service/.env

CORE_DIR = Path(__file__).resolve().parent
APP_DIR = CORE_DIR.parent
STORY_SERVICE_DIR = APP_DIR.parent

ENV_FILE = STORY_SERVICE_DIR / ".env"

# ============================================================
# Settings
# ============================================================

class Settings(BaseSettings):
    """
    Application configuration for the Cinemor Story Service.
    """

    # ---------------------------------------------------------
    # Application
    # ---------------------------------------------------------

    APP_NAME: str = "Cinemor Story Service"

    APP_VERSION: str = "1.0.0"

    DEBUG: bool = False


    # ---------------------------------------------------------
    # Database
    # ---------------------------------------------------------

    DATABASE_URL: str


    # ---------------------------------------------------------
    # OpenRouter
    # ---------------------------------------------------------

    OPENROUTER_API_KEY: str

    OPENROUTER_BASE_URL: str = (
        "https://openrouter.ai/api/v1"
    )

    # ---------------------------------------------------------
    # OpenRouter Video Generation
    # ---------------------------------------------------------

    OPENROUTER_VIDEO_DEFAULT_MODEL: str = "heygen/heygen-video-1"

    OPENROUTER_VIDEO_MODELS: list[str] = [
        "heygen/heygen-video-1",
        "x-ai/grok-imagine-video-1.5-lite",
        "black-forest-labs/flux-video-edit",
        "minimax/hailuo-3-max",
        "alibaba/wan-3.0-prime",
        "kwaivgi/kling-v3.0-std",
    ]

    # ---------------------------------------------------------
    # Supabase
    # ---------------------------------------------------------

    # Supabase is used for Google OAuth authentication.

    SUPABASE_URL: str

    SUPABASE_ANON_KEY: str


    # ---------------------------------------------------------
    # JWT
    # ---------------------------------------------------------

    JWT_PRIVATE_KEY_B64: str = Field(
        min_length=100,
    )

    JWT_PUBLIC_KEY_B64: str = Field(
        min_length=100,
    )

    JWT_ALGORITHM: str = "RS256"

    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15

    REFRESH_TOKEN_EXPIRE_DAYS: int = 7


    # ---------------------------------------------------------
    # Authentication Security
    # ---------------------------------------------------------

    MAX_LOGIN_ATTEMPTS: int = 5

    LOGIN_LOCKOUT_MINUTES: int = 15


    # ---------------------------------------------------------
    # Refresh Token Cookie
    # ---------------------------------------------------------

    REFRESH_COOKIE_NAME: str = (
        "cinemor_refresh_token"
    )

    REFRESH_COOKIE_SECURE: bool = True

    REFRESH_COOKIE_HTTP_ONLY: bool = True

    REFRESH_COOKIE_SAME_SITE: str = "lax"

    REFRESH_COOKIE_PATH: str = "/api/auth"


    # ---------------------------------------------------------
    # Organization / Email
    # ---------------------------------------------------------

    ORGANIZATION_CODE_LENGTH: int = 12

    # Which service sends email: "smtp" (e.g. Gmail with an App Password,
    # fine for internal testing) or "resend" (recommended for production).
    EMAIL_PROVIDER: str = "smtp"

    # Sender shown to recipients. Must be an address the provider allows.
    EMAIL_FROM: str = "onboarding@resend.dev"

    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""

    RESEND_API_KEY: str = ""
    RESEND_API_URL: str = "https://api.resend.com/emails"

    # How long an email-verification link stays valid.
    EMAIL_VERIFICATION_EXPIRE_HOURS: int = 24

    FRONTEND_URL: str = "http://localhost:5173"

    # Comma-separated list of allowed CORS origins for production, e.g.
    # "https://app.cinemor.com,https://cinemor.com". Falls back to local dev.
    CORS_ALLOW_ORIGINS: str = (
        "http://localhost:5173,http://127.0.0.1:5173,"
        "http://localhost:3000,http://127.0.0.1:3000"
    )

    # Number of reverse proxies in front of the app (Render alone: 1;
    # Cloudflare + Render: 2; none / local: 0). Used to read the real client
    # IP for rate limiting from the right end of X-Forwarded-For.
    TRUSTED_PROXY_HOPS: int = 0

    @property
    def cors_origins(self) -> list[str]:
        return [
            origin.strip()
            for origin in self.CORS_ALLOW_ORIGINS.split(",")
            if origin.strip()
        ]


    # ---------------------------------------------------------
    # Password Security
    # ---------------------------------------------------------

    DUMMY_PASSWORD_HASH: str = Field(
        min_length=50,
    )


    # ---------------------------------------------------------
    # Pydantic Settings
    # ---------------------------------------------------------

    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


    # ---------------------------------------------------------
    # Decoded JWT Private Key
    # ---------------------------------------------------------

    @property
    def JWT_PRIVATE_KEY(self) -> str:
        """
        Return the decoded RSA private key in PEM format.
        """

        return base64.b64decode(
            self.JWT_PRIVATE_KEY_B64
        ).decode("utf-8")


    # ---------------------------------------------------------
    # Decoded JWT Public Key
    # ---------------------------------------------------------

    @property
    def JWT_PUBLIC_KEY(self) -> str:
        """
        Return the decoded RSA public key in PEM format.
        """

        return base64.b64decode(
            self.JWT_PUBLIC_KEY_B64
        ).decode("utf-8")


# ============================================================
# Settings Factory
# ============================================================

@lru_cache
def get_settings() -> Settings:
    return Settings()


# ============================================================
# Settings Instance
# ============================================================

settings = get_settings()