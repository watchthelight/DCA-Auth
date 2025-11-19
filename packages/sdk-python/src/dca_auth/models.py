"""
DCA-Auth Data Models

Pydantic models for API data structures.
"""

from datetime import datetime
from enum import Enum
from typing import Optional, List, Dict, Any, Union
from pydantic import BaseModel, Field, EmailStr, validator


class LicenseType(str, Enum):
    """License type enumeration."""
    TRIAL = "TRIAL"
    STANDARD = "STANDARD"
    PREMIUM = "PREMIUM"
    ENTERPRISE = "ENTERPRISE"


class LicenseStatus(str, Enum):
    """License status enumeration."""
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"
    EXPIRED = "EXPIRED"
    SUSPENDED = "SUSPENDED"
    REVOKED = "REVOKED"


class UserRole(str, Enum):
    """User role enumeration."""
    USER = "USER"
    ADMIN = "ADMIN"
    MODERATOR = "MODERATOR"
    DEVELOPER = "DEVELOPER"


class WebhookEvent(str, Enum):
    """Webhook event types."""
    LICENSE_CREATED = "license.created"
    LICENSE_ACTIVATED = "license.activated"
    LICENSE_DEACTIVATED = "license.deactivated"
    LICENSE_EXPIRED = "license.expired"
    LICENSE_REVOKED = "license.revoked"
    USER_REGISTERED = "user.registered"
    USER_LOGIN = "user.login"
    USER_ROLE_CHANGED = "user.role_changed"
    ACTIVATION_LIMIT_REACHED = "activation.limit_reached"
    SUSPICIOUS_ACTIVITY = "security.suspicious_activity"


class BaseResponse(BaseModel):
    """Base response model."""
    class Config:
        populate_by_name = True
        use_enum_values = True
        json_encoders = {
            datetime: lambda v: v.isoformat() if v else None
        }


class User(BaseResponse):
    """User model."""
    id: str
    email: EmailStr
    username: str
    discord_id: Optional[str] = Field(None, alias="discordId")
    email_verified: bool = Field(False, alias="emailVerified")
    two_factor_enabled: bool = Field(False, alias="twoFactorEnabled")
    roles: List[UserRole] = Field(default_factory=list)
    created_at: datetime = Field(..., alias="createdAt")
    updated_at: datetime = Field(..., alias="updatedAt")
    metadata: Optional[Dict[str, Any]] = None

    @validator("roles", pre=True)
    def parse_roles(cls, v):
        if isinstance(v, list):
            return [UserRole(role) if isinstance(role, str) else role for role in v]
        return v


class Product(BaseResponse):
    """Product model."""
    id: str
    name: str
    description: Optional[str] = None
    price: float
    features: List[str] = Field(default_factory=list)
    metadata: Optional[Dict[str, Any]] = None
    created_at: datetime = Field(..., alias="createdAt")
    updated_at: datetime = Field(..., alias="updatedAt")


class Activation(BaseResponse):
    """License activation model."""
    id: str
    license_id: str = Field(..., alias="licenseId")
    hardware_id: str = Field(..., alias="hardwareId")
    device_name: Optional[str] = Field(None, alias="deviceName")
    ip_address: Optional[str] = Field(None, alias="ipAddress")
    activated_at: datetime = Field(..., alias="activatedAt")
    last_seen_at: datetime = Field(..., alias="lastSeenAt")
    metadata: Optional[Dict[str, Any]] = None


class License(BaseResponse):
    """License model."""
    id: str
    key: str
    type: LicenseType
    status: LicenseStatus
    user_id: str = Field(..., alias="userId")
    product_id: str = Field(..., alias="productId")
    max_activations: int = Field(1, alias="maxActivations")
    current_activations: int = Field(0, alias="currentActivations")
    expires_at: Optional[datetime] = Field(None, alias="expiresAt")
    created_at: datetime = Field(..., alias="createdAt")
    updated_at: datetime = Field(..., alias="updatedAt")
    metadata: Optional[Dict[str, Any]] = None

    # Related models (populated when included)
    user: Optional[User] = None
    product: Optional[Product] = None
    activations: Optional[List[Activation]] = None

    @property
    def is_active(self) -> bool:
        """Check if license is active."""
        if self.status != LicenseStatus.ACTIVE:
            return False
        if self.expires_at and self.expires_at < datetime.now():
            return False
        return True

    @property
    def remaining_activations(self) -> int:
        """Get remaining activations."""
        return max(0, self.max_activations - self.current_activations)

    @property
    def is_expired(self) -> bool:
        """Check if license is expired."""
        return self.expires_at is not None and self.expires_at < datetime.now()


class CreateLicenseRequest(BaseModel):
    """Request model for creating a license."""
    type: LicenseType
    user_id: str = Field(..., alias="userId")
    product_id: str = Field(..., alias="productId")
    max_activations: int = Field(1, alias="maxActivations", ge=1, le=1000)
    expires_in_days: Optional[int] = Field(None, alias="expiresInDays", ge=1)
    metadata: Optional[Dict[str, Any]] = None


class ActivateLicenseRequest(BaseModel):
    """Request model for activating a license."""
    key: str
    hardware_id: str = Field(..., alias="hardwareId")
    device_name: Optional[str] = Field(None, alias="deviceName")
    ip_address: Optional[str] = Field(None, alias="ipAddress")
    metadata: Optional[Dict[str, Any]] = None


class VerifyLicenseRequest(BaseModel):
    """Request model for verifying a license."""
    key: str
    hardware_id: str = Field(..., alias="hardwareId")


class DeactivateLicenseRequest(BaseModel):
    """Request model for deactivating a license."""
    key: str
    hardware_id: str = Field(..., alias="hardwareId")


class VerificationResult(BaseResponse):
    """License verification result."""
    valid: bool
    license: Optional[License] = None
    activation: Optional[Activation] = None
    error: Optional[str] = None


class LoginRequest(BaseModel):
    """Login request model."""
    email: EmailStr
    password: str
    two_factor_code: Optional[str] = Field(None, alias="twoFactorCode")


class RegisterRequest(BaseModel):
    """Registration request model."""
    email: EmailStr
    password: str = Field(..., min_length=8)
    username: str = Field(..., min_length=3, max_length=50)

    @validator("password")
    def validate_password(cls, v):
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        if not any(c.isupper() for c in v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not any(c.islower() for c in v):
            raise ValueError("Password must contain at least one lowercase letter")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one number")
        return v


class TokenPair(BaseResponse):
    """JWT token pair."""
    access_token: str = Field(..., alias="accessToken")
    refresh_token: str = Field(..., alias="refreshToken")


class LoginResponse(BaseResponse):
    """Login response model."""
    user: User
    access_token: str = Field(..., alias="accessToken")
    refresh_token: str = Field(..., alias="refreshToken")


class Webhook(BaseResponse):
    """Webhook model."""
    id: str
    url: str
    events: List[WebhookEvent]
    active: bool = True
    secret: Optional[str] = None
    headers: Optional[Dict[str, str]] = None
    max_retries: int = Field(3, alias="maxRetries")
    retry_delay_ms: int = Field(1000, alias="retryDelayMs")
    created_at: datetime = Field(..., alias="createdAt")
    updated_at: datetime = Field(..., alias="updatedAt")


class CreateWebhookRequest(BaseModel):
    """Request model for creating a webhook."""
    url: str
    events: List[WebhookEvent]
    secret: Optional[str] = None
    headers: Optional[Dict[str, str]] = None


class WebhookDelivery(BaseResponse):
    """Webhook delivery record."""
    id: str
    webhook_id: str = Field(..., alias="webhookId")
    event: WebhookEvent
    payload: Dict[str, Any]
    status_code: int = Field(..., alias="statusCode")
    success: bool
    error: Optional[str] = None
    attempt: int
    delivered_at: datetime = Field(..., alias="deliveredAt")


class AuditLog(BaseResponse):
    """Audit log entry."""
    id: str
    action: str
    severity: str
    user_id: Optional[str] = Field(None, alias="userId")
    target_id: Optional[str] = Field(None, alias="targetId")
    target_type: Optional[str] = Field(None, alias="targetType")
    ip_address: Optional[str] = Field(None, alias="ipAddress")
    user_agent: Optional[str] = Field(None, alias="userAgent")
    metadata: Optional[Dict[str, Any]] = None
    timestamp: datetime


class TwoFactorSetup(BaseResponse):
    """Two-factor authentication setup response."""
    secret: str
    qr_code: str = Field(..., alias="qrCode")
    backup_codes: List[str] = Field(..., alias="backupCodes")


class Analytics(BaseResponse):
    """Analytics data."""
    licenses: Dict[str, Union[int, float]]
    users: Dict[str, Union[int, float]]
    activations: Dict[str, Union[int, float]]
    revenue: Optional[Dict[str, float]] = None


class PaginationParams(BaseModel):
    """Pagination parameters."""
    page: int = Field(1, ge=1)
    limit: int = Field(10, ge=1, le=100)
    sort: Optional[str] = None
    order: Optional[str] = Field("desc", regex="^(asc|desc)$")


class SearchParams(PaginationParams):
    """Search parameters extending pagination."""
    search: Optional[str] = None
    filters: Optional[Dict[str, Any]] = None


class PaginatedResponse(BaseResponse):
    """Paginated response wrapper."""
    data: List[Any]
    total: int
    page: int
    page_size: int = Field(..., alias="pageSize")
    total_pages: int = Field(..., alias="totalPages")

    @property
    def has_next(self) -> bool:
        """Check if there's a next page."""
        return self.page < self.total_pages

    @property
    def has_previous(self) -> bool:
        """Check if there's a previous page."""
        return self.page > 1


class BatchOperation(BaseModel):
    """Batch operation request."""
    items: List[Any]
    operation: str = Field(..., regex="^(create|update|delete)$")
    options: Optional[Dict[str, Any]] = None


class BatchResult(BaseResponse):
    """Batch operation result."""
    successful: List[Any]
    failed: List[Dict[str, Any]]
    total: int
    success_count: int = Field(..., alias="successCount")
    failure_count: int = Field(..., alias="failureCount")


class ErrorResponse(BaseResponse):
    """Error response model."""
    status_code: int = Field(..., alias="statusCode")
    message: str
    error: Optional[str] = None
    details: Optional[Dict[str, Any]] = None
    timestamp: datetime
    path: Optional[str] = None