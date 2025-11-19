"""
DCA-Auth Python Client

Main client class for interacting with the DCA-Auth API.
"""

import logging
import time
from typing import Optional, Dict, Any, Callable, Union
from urllib.parse import urljoin

import requests
from requests.adapters import HTTPAdapter
from requests.packages.urllib3.util.retry import Retry

from .exceptions import (
    DCAAuthError,
    AuthenticationError,
    RateLimitError,
    NetworkError,
)
from .managers import (
    LicenseManager,
    AuthManager,
    UserManager,
    WebhookManager,
    RealtimeClient,
)
from .storage import Storage, MemoryStorage
from .utils import EventEmitter

logger = logging.getLogger(__name__)


class DCAAuthClient(EventEmitter):
    """
    Main client for interacting with DCA-Auth API.

    Example:
        >>> client = DCAAuthClient(api_url="https://api.dca-auth.com", api_key="your-api-key")
        >>>
        >>> # Verify a license
        >>> result = client.licenses.verify(key="XXXX-XXXX-XXXX-XXXX", hardware_id="MACHINE-ID")
        >>> if result.valid:
        >>>     print("License is valid!")
    """

    def __init__(
        self,
        api_url: Optional[str] = None,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,  # Alias for api_url
        access_token: Optional[str] = None,
        refresh_token: Optional[str] = None,
        timeout: int = 30,
        retries: int = 3,
        retry_delay: float = 1.0,
        verify_ssl: bool = True,
        debug: bool = False,
        storage: Optional[Storage] = None,
        auto_refresh_token: bool = True,
        ws_url: Optional[str] = None,
        headers: Optional[Dict[str, str]] = None,
        session: Optional[requests.Session] = None,
    ):
        """
        Initialize the DCA-Auth client.

        Args:
            api_url: The base URL for the API
            api_key: API key for authentication
            base_url: Alias for api_url
            access_token: JWT access token
            refresh_token: JWT refresh token
            timeout: Request timeout in seconds
            retries: Number of retry attempts
            retry_delay: Delay between retries in seconds
            verify_ssl: Whether to verify SSL certificates
            debug: Enable debug logging
            storage: Storage implementation for tokens
            auto_refresh_token: Automatically refresh expired tokens
            ws_url: WebSocket URL for real-time updates
            headers: Additional headers to include in requests
            session: Custom requests session
        """
        super().__init__()

        # Configuration
        self.api_url = api_url or base_url or "https://api.dca-auth.com"
        if not self.api_url.endswith("/"):
            self.api_url += "/"

        self.api_key = api_key
        self.timeout = timeout
        self.retries = retries
        self.retry_delay = retry_delay
        self.verify_ssl = verify_ssl
        self.debug = debug
        self.auto_refresh_token = auto_refresh_token
        self.ws_url = ws_url or self.api_url.replace("http", "ws")

        # Storage
        self.storage = storage or MemoryStorage()
        if access_token:
            self.storage.set("access_token", access_token)
        if refresh_token:
            self.storage.set("refresh_token", refresh_token)

        # Session setup
        self.session = session or requests.Session()
        self.session.verify = verify_ssl

        # Add retry strategy
        retry_strategy = Retry(
            total=retries,
            backoff_factor=retry_delay,
            status_forcelist=[429, 500, 502, 503, 504],
            method_whitelist=["HEAD", "GET", "PUT", "DELETE", "OPTIONS", "TRACE"],
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        self.session.mount("http://", adapter)
        self.session.mount("https://", adapter)

        # Default headers
        self.session.headers.update({
            "Content-Type": "application/json",
            "User-Agent": f"DCA-Auth-Python-SDK/1.0.0",
            "X-SDK-Version": "1.0.0",
            "X-SDK-Language": "Python",
        })

        if headers:
            self.session.headers.update(headers)

        # Setup request hooks
        self._setup_request_hooks()

        # Initialize managers
        self.licenses = LicenseManager(self)
        self.auth = AuthManager(self)
        self.users = UserManager(self)
        self.webhooks = WebhookManager(self)
        self.realtime = RealtimeClient(self)

        # Setup event forwarding
        self._setup_event_forwarding()

        # Enable debug logging if requested
        if debug:
            logging.basicConfig(level=logging.DEBUG)

    def _setup_request_hooks(self):
        """Setup request/response hooks for authentication and error handling."""

        # Store original request method
        self._original_request = self.session.request

        def request_wrapper(*args, **kwargs):
            # Add authentication
            headers = kwargs.get("headers", {})

            # Add API key if available
            if self.api_key:
                headers["X-API-Key"] = self.api_key

            # Add JWT token if available
            access_token = self.storage.get("access_token")
            if access_token and "Authorization" not in headers:
                headers["Authorization"] = f"Bearer {access_token}"

            kwargs["headers"] = headers

            # Add timeout if not specified
            if "timeout" not in kwargs:
                kwargs["timeout"] = self.timeout

            # Make request
            response = self._make_request_with_retry(*args, **kwargs)

            return response

        self.session.request = request_wrapper

    def _make_request_with_retry(self, *args, **kwargs):
        """Make request with retry logic and error handling."""
        last_exception = None

        for attempt in range(self.retries + 1):
            try:
                if self.debug:
                    logger.debug(f"Request attempt {attempt + 1}: {args[0]} {args[1]}")

                response = self._original_request(*args, **kwargs)

                # Handle rate limiting
                if response.status_code == 429:
                    retry_after = int(response.headers.get("Retry-After", 60))
                    self.emit("rate_limit", {"retry_after": retry_after})

                    if attempt < self.retries:
                        time.sleep(retry_after)
                        continue
                    else:
                        raise RateLimitError(
                            "Rate limit exceeded",
                            retry_after=retry_after
                        )

                # Handle authentication errors
                if response.status_code == 401:
                    if self.auto_refresh_token and attempt == 0:
                        # Try to refresh token
                        if self._refresh_access_token():
                            # Retry with new token
                            access_token = self.storage.get("access_token")
                            kwargs["headers"]["Authorization"] = f"Bearer {access_token}"
                            continue

                    raise AuthenticationError("Authentication failed")

                # Check for errors
                response.raise_for_status()

                return response

            except requests.exceptions.ConnectionError as e:
                last_exception = NetworkError(f"Connection error: {e}")
                if attempt < self.retries:
                    time.sleep(self.retry_delay * (2 ** attempt))
                    continue

            except requests.exceptions.Timeout as e:
                last_exception = NetworkError(f"Request timeout: {e}")
                if attempt < self.retries:
                    time.sleep(self.retry_delay * (2 ** attempt))
                    continue

            except requests.exceptions.RequestException as e:
                last_exception = DCAAuthError(f"Request failed: {e}")
                if attempt < self.retries:
                    time.sleep(self.retry_delay * (2 ** attempt))
                    continue

        if last_exception:
            raise last_exception

        raise DCAAuthError("Request failed after all retries")

    def _refresh_access_token(self) -> bool:
        """
        Attempt to refresh the access token.

        Returns:
            bool: True if successful, False otherwise
        """
        refresh_token = self.storage.get("refresh_token")
        if not refresh_token:
            return False

        try:
            response = self.post("/api/auth/refresh", json={
                "refreshToken": refresh_token
            }, _skip_auth=True)

            if response.status_code == 200:
                data = response.json()
                self.storage.set("access_token", data["accessToken"])
                self.storage.set("refresh_token", data["refreshToken"])
                self.emit("auth:refresh", data)
                return True

        except Exception as e:
            logger.error(f"Failed to refresh token: {e}")

        return False

    def _setup_event_forwarding(self):
        """Setup event forwarding from managers."""
        # Forward events from managers to client
        for manager in [self.licenses, self.auth, self.users, self.webhooks]:
            manager.on("*", lambda event, data: self.emit(event, data))

    def request(
        self,
        method: str,
        endpoint: str,
        **kwargs
    ) -> requests.Response:
        """
        Make a request to the API.

        Args:
            method: HTTP method (GET, POST, etc.)
            endpoint: API endpoint path
            **kwargs: Additional request arguments

        Returns:
            Response object
        """
        url = urljoin(self.api_url, endpoint.lstrip("/"))

        # Handle _skip_auth flag
        skip_auth = kwargs.pop("_skip_auth", False)
        if skip_auth:
            kwargs.setdefault("headers", {})
            kwargs["headers"].pop("Authorization", None)

        return self.session.request(method, url, **kwargs)

    def get(self, endpoint: str, **kwargs) -> requests.Response:
        """Make a GET request."""
        return self.request("GET", endpoint, **kwargs)

    def post(self, endpoint: str, **kwargs) -> requests.Response:
        """Make a POST request."""
        return self.request("POST", endpoint, **kwargs)

    def put(self, endpoint: str, **kwargs) -> requests.Response:
        """Make a PUT request."""
        return self.request("PUT", endpoint, **kwargs)

    def patch(self, endpoint: str, **kwargs) -> requests.Response:
        """Make a PATCH request."""
        return self.request("PATCH", endpoint, **kwargs)

    def delete(self, endpoint: str, **kwargs) -> requests.Response:
        """Make a DELETE request."""
        return self.request("DELETE", endpoint, **kwargs)

    def set_tokens(
        self,
        access_token: str,
        refresh_token: Optional[str] = None
    ) -> None:
        """
        Set authentication tokens.

        Args:
            access_token: JWT access token
            refresh_token: JWT refresh token (optional)
        """
        self.storage.set("access_token", access_token)
        if refresh_token:
            self.storage.set("refresh_token", refresh_token)
        self.emit("auth:tokens", {
            "access_token": access_token,
            "refresh_token": refresh_token
        })

    def clear_tokens(self) -> None:
        """Clear all authentication tokens."""
        self.storage.remove("access_token")
        self.storage.remove("refresh_token")
        self.emit("auth:clear", None)

    def get_access_token(self) -> Optional[str]:
        """Get the current access token."""
        return self.storage.get("access_token")

    def is_authenticated(self) -> bool:
        """Check if the client is authenticated."""
        return self.get_access_token() is not None

    def connect_realtime(self) -> None:
        """Connect to WebSocket for real-time updates."""
        access_token = self.get_access_token()
        if access_token:
            self.realtime.set_auth(access_token)
        self.realtime.connect()

    def disconnect_realtime(self) -> None:
        """Disconnect from WebSocket."""
        self.realtime.disconnect()

    def close(self) -> None:
        """Close the client and clean up resources."""
        self.disconnect_realtime()
        self.session.close()
        self.storage.clear()
        self.remove_all_listeners()

    def __enter__(self):
        """Context manager entry."""
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        self.close()

    def __repr__(self) -> str:
        """String representation."""
        return f"<DCAAuthClient(api_url='{self.api_url}')>"