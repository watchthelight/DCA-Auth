"""
DCA-Auth Python SDK

Official Python SDK for DCA-Auth License Management System.
"""

from .client import DCAAuthClient
from .exceptions import (
    DCAAuthError,
    AuthenticationError,
    AuthorizationError,
    ValidationError,
    NotFoundError,
    RateLimitError,
    NetworkError,
    LicenseError,
    LicenseExpiredError,
    MaxActivationsError,
)
from .models import (
    User,
    License,
    LicenseType,
    LicenseStatus,
    Product,
    Activation,
    Webhook,
    AuditLog,
    TwoFactorSetup,
)
from .managers import (
    LicenseManager,
    AuthManager,
    UserManager,
    WebhookManager,
    RealtimeClient,
)

__version__ = "1.0.0"
__author__ = "DCA-Auth"
__all__ = [
    "DCAAuthClient",
    "DCAAuthError",
    "AuthenticationError",
    "AuthorizationError",
    "ValidationError",
    "NotFoundError",
    "RateLimitError",
    "NetworkError",
    "LicenseError",
    "LicenseExpiredError",
    "MaxActivationsError",
    "User",
    "License",
    "LicenseType",
    "LicenseStatus",
    "Product",
    "Activation",
    "Webhook",
    "AuditLog",
    "TwoFactorSetup",
    "LicenseManager",
    "AuthManager",
    "UserManager",
    "WebhookManager",
    "RealtimeClient",
]