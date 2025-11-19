"""
DCA-Auth Exceptions

Custom exception classes for the DCA-Auth SDK.
"""

from typing import Optional, Dict, Any


class DCAAuthError(Exception):
    """Base exception for DCA-Auth SDK errors."""

    def __init__(
        self,
        message: str,
        code: str = "UNKNOWN_ERROR",
        details: Optional[Dict[str, Any]] = None,
        status_code: Optional[int] = None
    ):
        super().__init__(message)
        self.message = message
        self.code = code
        self.details = details or {}
        self.status_code = status_code

    def __str__(self) -> str:
        return f"{self.__class__.__name__}: {self.message} (Code: {self.code})"

    def __repr__(self) -> str:
        return f"{self.__class__.__name__}(message='{self.message}', code='{self.code}', status_code={self.status_code})"


class AuthenticationError(DCAAuthError):
    """Raised when authentication fails."""

    def __init__(self, message: str = "Authentication failed", details: Optional[Dict[str, Any]] = None):
        super().__init__(message, "AUTHENTICATION_ERROR", details, 401)


class AuthorizationError(DCAAuthError):
    """Raised when user lacks required permissions."""

    def __init__(self, message: str = "Insufficient permissions", details: Optional[Dict[str, Any]] = None):
        super().__init__(message, "AUTHORIZATION_ERROR", details, 403)


class ValidationError(DCAAuthError):
    """Raised when request validation fails."""

    def __init__(
        self,
        message: str = "Validation failed",
        fields: Optional[Dict[str, list]] = None
    ):
        super().__init__(message, "VALIDATION_ERROR", {"fields": fields}, 400)
        self.fields = fields or {}


class NotFoundError(DCAAuthError):
    """Raised when a requested resource is not found."""

    def __init__(self, resource: str, resource_id: Optional[str] = None):
        message = f"{resource} not found"
        if resource_id:
            message = f"{resource} with id {resource_id} not found"

        super().__init__(
            message,
            "NOT_FOUND",
            {"resource": resource, "id": resource_id},
            404
        )


class ConflictError(DCAAuthError):
    """Raised when there's a conflict with the current state."""

    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(message, "CONFLICT", details, 409)


class RateLimitError(DCAAuthError):
    """Raised when rate limit is exceeded."""

    def __init__(
        self,
        message: str = "Rate limit exceeded",
        retry_after: Optional[int] = None
    ):
        super().__init__(
            message,
            "RATE_LIMIT_EXCEEDED",
            {"retry_after": retry_after},
            429
        )
        self.retry_after = retry_after


class NetworkError(DCAAuthError):
    """Raised when a network error occurs."""

    def __init__(self, message: str = "Network error occurred", details: Optional[Dict[str, Any]] = None):
        super().__init__(message, "NETWORK_ERROR", details)


class TimeoutError(NetworkError):
    """Raised when a request times out."""

    def __init__(self, timeout: int):
        super().__init__(
            f"Request timed out after {timeout} seconds",
            {"timeout": timeout}
        )
        self.code = "TIMEOUT_ERROR"


class ServerError(DCAAuthError):
    """Raised when server returns a 5xx error."""

    def __init__(self, message: str = "Server error occurred", status_code: int = 500):
        super().__init__(message, "SERVER_ERROR", None, status_code)


class LicenseError(DCAAuthError):
    """Base class for license-related errors."""

    def __init__(
        self,
        message: str,
        code: str = "LICENSE_ERROR",
        details: Optional[Dict[str, Any]] = None
    ):
        super().__init__(message, code, details)


class LicenseExpiredError(LicenseError):
    """Raised when a license has expired."""

    def __init__(self, license_key: str, expired_at: Optional[str] = None):
        super().__init__(
            f"License {license_key} has expired",
            "LICENSE_EXPIRED",
            {"license_key": license_key, "expired_at": expired_at}
        )


class LicenseNotFoundError(LicenseError):
    """Raised when a license is not found."""

    def __init__(self, license_key: str):
        super().__init__(
            f"License {license_key} not found",
            "LICENSE_NOT_FOUND",
            {"license_key": license_key}
        )


class LicenseInactiveError(LicenseError):
    """Raised when a license is inactive."""

    def __init__(self, license_key: str, status: str):
        super().__init__(
            f"License {license_key} is {status}",
            "LICENSE_INACTIVE",
            {"license_key": license_key, "status": status}
        )


class LicenseActivationError(LicenseError):
    """Raised when license activation fails."""

    def __init__(
        self,
        message: str,
        license_key: str,
        reason: Optional[str] = None
    ):
        super().__init__(
            message,
            "LICENSE_ACTIVATION_ERROR",
            {"license_key": license_key, "reason": reason}
        )


class MaxActivationsError(LicenseActivationError):
    """Raised when maximum activations limit is reached."""

    def __init__(
        self,
        license_key: str,
        max_activations: int,
        current_activations: int
    ):
        super().__init__(
            f"License {license_key} has reached maximum activations ({current_activations}/{max_activations})",
            license_key,
            "max_activations_reached"
        )
        self.details.update({
            "max_activations": max_activations,
            "current_activations": current_activations
        })


class WebSocketError(DCAAuthError):
    """Raised when WebSocket operation fails."""

    def __init__(self, message: str = "WebSocket error", details: Optional[Dict[str, Any]] = None):
        super().__init__(message, "WEBSOCKET_ERROR", details)


class ConfigurationError(DCAAuthError):
    """Raised when there's a configuration issue."""

    def __init__(self, message: str, field: Optional[str] = None):
        super().__init__(
            message,
            "CONFIGURATION_ERROR",
            {"field": field} if field else None
        )


class StorageError(DCAAuthError):
    """Raised when storage operation fails."""

    def __init__(self, message: str = "Storage operation failed", operation: Optional[str] = None):
        super().__init__(
            message,
            "STORAGE_ERROR",
            {"operation": operation} if operation else None
        )


class CryptoError(DCAAuthError):
    """Raised when cryptographic operation fails."""

    def __init__(self, message: str = "Cryptographic operation failed", operation: Optional[str] = None):
        super().__init__(
            message,
            "CRYPTO_ERROR",
            {"operation": operation} if operation else None
        )


class WebhookError(DCAAuthError):
    """Raised when webhook operation fails."""

    def __init__(self, message: str, webhook_id: Optional[str] = None):
        super().__init__(
            message,
            "WEBHOOK_ERROR",
            {"webhook_id": webhook_id} if webhook_id else None
        )


class TwoFactorError(DCAAuthError):
    """Raised when two-factor authentication fails."""

    def __init__(self, message: str = "Two-factor authentication failed"):
        super().__init__(message, "TWO_FACTOR_ERROR")


class ImportExportError(DCAAuthError):
    """Raised when import/export operation fails."""

    def __init__(self, message: str, operation: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message,
            f"{operation.upper()}_ERROR",
            details
        )


def handle_api_error(response) -> DCAAuthError:
    """
    Convert API error response to appropriate exception.

    Args:
        response: The error response from the API

    Returns:
        Appropriate DCAAuthError subclass
    """
    try:
        error_data = response.json()
    except:
        error_data = {"message": response.text or "Unknown error"}

    status_code = response.status_code
    message = error_data.get("message", "Unknown error")
    code = error_data.get("code", "UNKNOWN_ERROR")
    details = error_data.get("details", {})

    # Map status codes to exceptions
    if status_code == 400:
        if code == "VALIDATION_ERROR":
            return ValidationError(message, details.get("fields"))
        return DCAAuthError(message, code, details, status_code)

    elif status_code == 401:
        return AuthenticationError(message, details)

    elif status_code == 403:
        return AuthorizationError(message, details)

    elif status_code == 404:
        resource = details.get("resource", "Resource")
        resource_id = details.get("id")
        return NotFoundError(resource, resource_id)

    elif status_code == 409:
        return ConflictError(message, details)

    elif status_code == 429:
        retry_after = response.headers.get("Retry-After")
        if retry_after:
            try:
                retry_after = int(retry_after)
            except:
                retry_after = None
        return RateLimitError(message, retry_after)

    elif status_code >= 500:
        return ServerError(message, status_code)

    # License-specific errors
    if code.startswith("LICENSE_"):
        if code == "LICENSE_EXPIRED":
            return LicenseExpiredError(
                details.get("license_key", "unknown"),
                details.get("expired_at")
            )
        elif code == "LICENSE_NOT_FOUND":
            return LicenseNotFoundError(details.get("license_key", "unknown"))
        elif code == "MAX_ACTIVATIONS_REACHED":
            return MaxActivationsError(
                details.get("license_key", "unknown"),
                details.get("max_activations", 0),
                details.get("current_activations", 0)
            )
        else:
            return LicenseError(message, code, details)

    # Default error
    return DCAAuthError(message, code, details, status_code)