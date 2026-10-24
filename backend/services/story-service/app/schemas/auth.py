from __future__ import annotations

from datetime import datetime

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    field_validator,
    model_validator,
)


# ============================================================
# Common Validation
# ============================================================

def normalize_email(value: str | EmailStr) -> str:
    normalized = str(value).strip().lower()

    if not normalized:
        raise ValueError("Email cannot be empty.")

    return normalized


def validate_password_strength(value: str) -> str:
    if len(value) < 12:
        raise ValueError(
            "Password must contain at least 12 characters."
        )

    if len(value) > 128:
        raise ValueError(
            "Password must not exceed 128 characters."
        )

    if not any(c.islower() for c in value):
        raise ValueError(
            "Password must contain at least one lowercase letter."
        )

    if not any(c.isupper() for c in value):
        raise ValueError(
            "Password must contain at least one uppercase letter."
        )

    if not any(c.isdigit() for c in value):
        raise ValueError(
            "Password must contain at least one number."
        )

    if not any(not c.isalnum() for c in value):
        raise ValueError(
            "Password must contain at least one special character."
        )

    return value


def validate_password_confirmation(
    password: str,
    confirm_password: str,
) -> None:
    if password != confirm_password:
        raise ValueError(
            "Password and confirm password do not match."
        )


# ============================================================
# Individual Signup
# ============================================================

class IndividualRegisterRequest(BaseModel):

    model_config = ConfigDict(
        str_strip_whitespace=True,
        extra="forbid",
    )

    email: EmailStr

    password: str = Field(
        min_length=12,
        max_length=128,
    )

    confirm_password: str = Field(
        min_length=12,
        max_length=128,
    )

    @field_validator("email")
    @classmethod
    def normalize_email_field(
        cls,
        value: EmailStr,
    ) -> str:
        return normalize_email(value)

    @field_validator("password")
    @classmethod
    def validate_password_field(
        cls,
        value: str,
    ) -> str:
        return validate_password_strength(value)

    @model_validator(mode="after")
    def validate_password_confirmation(
        self,
    ) -> "IndividualRegisterRequest":

        validate_password_confirmation(
            self.password,
            self.confirm_password,
        )

        return self


# ============================================================
# Organization Signup
# ============================================================

class OrganizationRegisterRequest(BaseModel):

    model_config = ConfigDict(
        str_strip_whitespace=True,
        extra="forbid",
    )

    email: EmailStr

    password: str = Field(
        min_length=12,
        max_length=128,
    )

    confirm_password: str = Field(
        min_length=12,
        max_length=128,
    )

    @field_validator("email")
    @classmethod
    def normalize_email_field(
        cls,
        value: EmailStr,
    ) -> str:
        return normalize_email(value)

    @field_validator("password")
    @classmethod
    def validate_password_field(
        cls,
        value: str,
    ) -> str:
        return validate_password_strength(value)

    @model_validator(mode="after")
    def validate_password_confirmation(
        self,
    ) -> "OrganizationRegisterRequest":

        validate_password_confirmation(
            self.password,
            self.confirm_password,
        )

        return self


# ============================================================
# Login
# ============================================================

class LoginRequest(BaseModel):

    model_config = ConfigDict(
        str_strip_whitespace=True,
        extra="forbid",
    )

    email: EmailStr

    password: str = Field(
        min_length=1,
        max_length=128,
    )

    @field_validator("email")
    @classmethod
    def normalize_login_email(
        cls,
        value: EmailStr,
    ) -> str:
        return normalize_email(value)


# ============================================================
# Supabase OAuth
# ============================================================

class SupabaseOAuthRequest(BaseModel):
    """
    Request received from the frontend after a successful
    Supabase Google OAuth login.

    The Supabase access token is verified by the Cinemor
    backend before a Cinemor session is created.
    """

    model_config = ConfigDict(
        str_strip_whitespace=True,
        extra="forbid",
    )

    access_token: str = Field(
        min_length=1,
        max_length=8192,
    )


# ============================================================
# Account Type Selection
# ============================================================

class AccountTypeRequest(BaseModel):
    """
    Select the account type during Cinemor onboarding.

    Supported values:
        - individual
        - organization
    """

    model_config = ConfigDict(
        str_strip_whitespace=True,
        extra="forbid",
    )

    account_type: str = Field(
        min_length=1,
        max_length=50,
    )

    @field_validator("account_type")
    @classmethod
    def validate_account_type(
        cls,
        value: str,
    ) -> str:

        normalized = value.strip().lower()

        if normalized not in {
            "individual",
            "organization",
        }:
            raise ValueError(
                "Account type must be either "
                "'individual' or 'organization'."
            )

        return normalized


# ============================================================
# Organization Job Role
# ============================================================

class JobRoleCreateRequest(BaseModel):
    """
    Organization administrator creates a production/job role.

    A job role can be configured with:

        - One or more organization tools
        - One or more Cinemor features

    Examples:
        Animator
        Character Designer
        Writer
        Storyboard Artist
        3D Artist
        Video Editor
    """

    model_config = ConfigDict(
        str_strip_whitespace=True,
        extra="forbid",
    )

    name: str = Field(
        min_length=2,
        max_length=150,
    )

    description: str | None = Field(
        default=None,
        max_length=1000,
    )

    # --------------------------------------------------------
    # Organization Tools
    # --------------------------------------------------------
    # IDs of tools selected by the organization administrator.
    #
    # Example:
    #
    # tool_ids: [1, 4, 7]
    #
    # A role can use multiple tools.
    # --------------------------------------------------------

    tool_ids: list[int] = Field(
        default_factory=list,
    )

    # --------------------------------------------------------
    # Cinemor Features
    # --------------------------------------------------------
    # Feature keys are NOT organization-created.
    #
    # They come from the hardcoded list of features
    # provided by Cinemor.
    #
    # Example:
    #
    # feature_keys:
    # [
    #     "story_creation",
    #     "storyboard_creation",
    #     "character_creation",
    # ]
    # --------------------------------------------------------

    feature_keys: list[str] = Field(
        default_factory=list,
    )


class JobRoleResponse(BaseModel):
    """
    Safe API representation of an organization job role.
    """

    id: int
    organization_id: int
    name: str
    description: str | None
    created_at: datetime

    # Tools assigned to this job role.
    tool_ids: list[int] = Field(
        default_factory=list,
    )

    # Cinemor features assigned to this job role.
    feature_keys: list[str] = Field(
        default_factory=list,
    )

    model_config = ConfigDict(
        from_attributes=True,
    )

# ============================================================
# Employee Invitation
# ============================================================

class EmployeeInvitationRequest(BaseModel):
    """
    Organization administrator invites an employee.

    The invitation initializes:

        - email
        - job role
        - system role
        - maximum concurrent projects

    Reviewer and team leader are assigned later after
    the employee joins the organization.
    """

    model_config = ConfigDict(
        str_strip_whitespace=True,
        extra="forbid",
    )

    email: EmailStr

    job_role_id: int = Field(
        gt=0,
    )

    system_role: str = Field(
        default="employee",
        min_length=1,
        max_length=50,
    )

    max_concurrent_projects: int | None = Field(
        default=None,
        gt=0,
        le=100,
    )

    @field_validator("email")
    @classmethod
    def normalize_invitation_email(
        cls,
        value: EmailStr,
    ) -> str:
        return normalize_email(value)

    @field_validator("system_role")
    @classmethod
    def normalize_system_role(
        cls,
        value: str,
    ) -> str:

        normalized = value.strip().lower()

        if normalized != "employee":
            raise ValueError(
                "Employee invitations can only create "
                "employee memberships."
            )

        return normalized


# ============================================================
# Accept Employee Invitation
# ============================================================

class AcceptEmployeeInvitationRequest(BaseModel):
    """
    Employee accepts an invitation and sets their password.

    The employee does not provide:
    - email
    - organization
    - job role
    - system role
    - project limit

    Those values come from the invitation.
    """

    model_config = ConfigDict(
        str_strip_whitespace=True,
        extra="forbid",
    )

    token: str = Field(
        min_length=32,
        max_length=512,
    )

    password: str = Field(
        min_length=12,
        max_length=128,
    )

    confirm_password: str = Field(
        min_length=12,
        max_length=128,
    )

    @model_validator(mode="after")
    def validate_passwords(self):
        if self.password != self.confirm_password:
            raise ValueError(
                "Passwords do not match."
            )

        return self


# ============================================================
# Refresh Token
# ============================================================

class RefreshTokenRequest(BaseModel):

    model_config = ConfigDict(
        extra="forbid",
    )

    refresh_token: str | None = Field(
        default=None,
        min_length=1,
    )


# ============================================================
# User Response
# ============================================================

class AuthUserResponse(BaseModel):

    model_config = ConfigDict(
        from_attributes=True,
    )

    id: int
    email: EmailStr
    is_active: bool
    is_email_verified: bool


# ============================================================
# Organization Response
# ============================================================

class OrganizationResponse(BaseModel):

    model_config = ConfigDict(
        from_attributes=True,
    )

    id: int
    name: str | None
    business_type: str | None
    official_address: str | None
    is_active: bool


# ============================================================
# Job Role Response
# ============================================================

class OrganizationJobRoleResponse(BaseModel):

    model_config = ConfigDict(
        from_attributes=True,
    )

    id: int
    organization_id: int
    name: str
    description: str | None

    default_max_concurrent_projects: int | None

    is_active: bool

    # --------------------------------------------------------
    # Organization Tools assigned to this role
    # --------------------------------------------------------

    tool_ids: list[int] = Field(
        default_factory=list,
    )

    # --------------------------------------------------------
    # Cinemor features assigned to this role
    # --------------------------------------------------------

    feature_keys: list[str] = Field(
        default_factory=list,
    )

class JobRoleUpdateRequest(BaseModel):
    model_config = ConfigDict(
        str_strip_whitespace=True,
        extra="forbid",
    )

    name: str = Field(
        min_length=2,
        max_length=150,
    )

    description: str | None = Field(
        default=None,
        max_length=1000,
    )

    tool_ids: list[int] = Field(
        default_factory=list,
    )

    feature_keys: list[str] = Field(
        default_factory=list,
    )

class ForgotPasswordRequest(BaseModel):
    model_config = ConfigDict(
        str_strip_whitespace=True,
        extra="forbid",
    )

    email: EmailStr


class VerifyEmailRequest(BaseModel):
    """The token from the confirmation link emailed at sign-up."""

    model_config = ConfigDict(
        str_strip_whitespace=True,
        extra="forbid",
    )

    token: str = Field(
        min_length=32,
        max_length=128,
    )


class ResendVerificationRequest(BaseModel):
    model_config = ConfigDict(
        str_strip_whitespace=True,
        extra="forbid",
    )

    email: EmailStr


class ResetPasswordRequest(BaseModel):
    model_config = ConfigDict(
        str_strip_whitespace=True,
        extra="forbid",
    )

    token: str = Field(
        min_length=32,
        max_length=128,
    )

    new_password: str = Field(
        min_length=12,
        max_length=128,
    )

    confirm_password: str = Field(
        min_length=12,
        max_length=128,
    )

# ============================================================
# Membership Response
# ============================================================

class MembershipResponse(BaseModel):

    model_config = ConfigDict(
        from_attributes=True,
    )

    organization_id: int
    role: str
    job_role_id: int | None
    max_concurrent_projects: int | None
    is_active: bool
    reviewer_id: int | None
    team_leader_id: int | None


# ============================================================
# Token Response
# ============================================================

class TokenResponse(BaseModel):

    access_token: str
    token_type: str = "bearer"
    expires_in: int


# ============================================================
# Registration Responses
# ============================================================

class IndividualRegisterResponse(BaseModel):

    user: AuthUserResponse
    tokens: TokenResponse


class OrganizationRegisterResponse(BaseModel):

    user: AuthUserResponse
    organization: OrganizationResponse
    membership: MembershipResponse
    tokens: TokenResponse


# ============================================================
# Invitation Response
# ============================================================

class EmployeeInvitationResponse(BaseModel):

    id: int
    organization_id: int
    email: EmailStr
    job_role_id: int
    system_role: str
    max_concurrent_projects: int | None
    expires_at: str
    is_accepted: bool


class AcceptEmployeeInvitationResponse(BaseModel):

    user: AuthUserResponse
    organization: OrganizationResponse
    membership: MembershipResponse
    tokens: TokenResponse


# ============================================================
# Login Response
# ============================================================

class LoginResponse(BaseModel):

    user: AuthUserResponse
    memberships: list[MembershipResponse]
    tokens: TokenResponse


# ============================================================
# Current User
# ============================================================

class CurrentUserResponse(BaseModel):

    user: AuthUserResponse
    memberships: list[MembershipResponse]