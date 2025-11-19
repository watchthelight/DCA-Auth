export class DCAAuthError extends Error {
  public code: string;
  public details?: any;
  public statusCode?: number;

  constructor(message: string, code: string = 'UNKNOWN_ERROR', details?: any, statusCode?: number) {
    super(message);
    this.name = 'DCAAuthError';
    this.code = code;
    this.details = details;
    this.statusCode = statusCode;

    // Maintains proper stack trace for where error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DCAAuthError);
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
      statusCode: this.statusCode,
      stack: this.stack,
    };
  }
}

export class AuthenticationError extends DCAAuthError {
  constructor(message: string = 'Authentication failed', details?: any) {
    super(message, 'AUTHENTICATION_ERROR', details, 401);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends DCAAuthError {
  constructor(message: string = 'Insufficient permissions', details?: any) {
    super(message, 'AUTHORIZATION_ERROR', details, 403);
    this.name = 'AuthorizationError';
  }
}

export class ValidationError extends DCAAuthError {
  public fields?: Record<string, string[]>;

  constructor(message: string = 'Validation failed', fields?: Record<string, string[]>) {
    super(message, 'VALIDATION_ERROR', fields, 400);
    this.name = 'ValidationError';
    this.fields = fields;
  }
}

export class NotFoundError extends DCAAuthError {
  constructor(resource: string, id?: string) {
    const message = id ? `${resource} with id ${id} not found` : `${resource} not found`;
    super(message, 'NOT_FOUND', { resource, id }, 404);
    this.name = 'NotFoundError';
  }
}

export class RateLimitError extends DCAAuthError {
  public retryAfter: number;

  constructor(message: string = 'Rate limit exceeded', retryAfter: number = 60) {
    super(message, 'RATE_LIMIT_EXCEEDED', { retryAfter }, 429);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

export class NetworkError extends DCAAuthError {
  constructor(message: string = 'Network error occurred', details?: any) {
    super(message, 'NETWORK_ERROR', details);
    this.name = 'NetworkError';
  }
}

export class TimeoutError extends NetworkError {
  constructor(timeout: number) {
    super(`Request timed out after ${timeout}ms`, { timeout });
    this.name = 'TimeoutError';
    this.code = 'TIMEOUT_ERROR';
  }
}

export class LicenseError extends DCAAuthError {
  constructor(message: string, code: string = 'LICENSE_ERROR', details?: any) {
    super(message, code, details);
    this.name = 'LicenseError';
  }
}

export class LicenseExpiredError extends LicenseError {
  constructor(licenseKey: string, expiredAt?: string) {
    super(
      `License ${licenseKey} has expired`,
      'LICENSE_EXPIRED',
      { licenseKey, expiredAt }
    );
    this.name = 'LicenseExpiredError';
  }
}

export class LicenseActivationError extends LicenseError {
  constructor(message: string, licenseKey: string, reason?: string) {
    super(
      message,
      'LICENSE_ACTIVATION_ERROR',
      { licenseKey, reason }
    );
    this.name = 'LicenseActivationError';
  }
}

export class MaxActivationsError extends LicenseActivationError {
  constructor(licenseKey: string, maxActivations: number, currentActivations: number) {
    super(
      `License ${licenseKey} has reached maximum activations (${currentActivations}/${maxActivations})`,
      licenseKey,
      'max_activations_reached'
    );
    this.details = { maxActivations, currentActivations };
    this.name = 'MaxActivationsError';
  }
}

export class WebSocketError extends DCAAuthError {
  constructor(message: string = 'WebSocket error', details?: any) {
    super(message, 'WEBSOCKET_ERROR', details);
    this.name = 'WebSocketError';
  }
}

export class ConfigurationError extends DCAAuthError {
  constructor(message: string, field?: string) {
    super(message, 'CONFIGURATION_ERROR', { field });
    this.name = 'ConfigurationError';
  }
}

export class StorageError extends DCAAuthError {
  constructor(message: string = 'Storage operation failed', operation?: string) {
    super(message, 'STORAGE_ERROR', { operation });
    this.name = 'StorageError';
  }
}

export class CryptoError extends DCAAuthError {
  constructor(message: string = 'Cryptographic operation failed', operation?: string) {
    super(message, 'CRYPTO_ERROR', { operation });
    this.name = 'CryptoError';
  }
}

/**
 * Error handler utility
 */
export class ErrorHandler {
  private static handlers: Map<string, (error: DCAAuthError) => void> = new Map();

  /**
   * Register an error handler for a specific error code
   */
  static register(code: string, handler: (error: DCAAuthError) => void): void {
    this.handlers.set(code, handler);
  }

  /**
   * Handle an error
   */
  static handle(error: any): void {
    if (error instanceof DCAAuthError) {
      const handler = this.handlers.get(error.code);
      if (handler) {
        handler(error);
        return;
      }
    }

    // Default handling
    console.error('Unhandled DCA-Auth Error:', error);
  }

  /**
   * Clear all handlers
   */
  static clear(): void {
    this.handlers.clear();
  }

  /**
   * Check if error is retryable
   */
  static isRetryable(error: any): boolean {
    if (error instanceof NetworkError || error instanceof TimeoutError) {
      return true;
    }

    if (error instanceof DCAAuthError) {
      return [429, 502, 503, 504].includes(error.statusCode || 0);
    }

    return false;
  }

  /**
   * Extract user-friendly message from error
   */
  static getUserMessage(error: any): string {
    if (error instanceof DCAAuthError) {
      switch (error.code) {
        case 'AUTHENTICATION_ERROR':
          return 'Please check your credentials and try again.';
        case 'AUTHORIZATION_ERROR':
          return 'You do not have permission to perform this action.';
        case 'VALIDATION_ERROR':
          return 'Please check your input and try again.';
        case 'NOT_FOUND':
          return 'The requested resource was not found.';
        case 'RATE_LIMIT_EXCEEDED':
          return `Too many requests. Please try again in ${(error as RateLimitError).retryAfter} seconds.`;
        case 'NETWORK_ERROR':
          return 'Network connection failed. Please check your internet connection.';
        case 'LICENSE_EXPIRED':
          return 'Your license has expired. Please renew to continue.';
        case 'LICENSE_ACTIVATION_ERROR':
          return 'Failed to activate license. Please try again or contact support.';
        default:
          return error.message || 'An unexpected error occurred.';
      }
    }

    return 'An unexpected error occurred. Please try again later.';
  }
}