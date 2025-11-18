/**
 * Error Module Exports
 *
 * Provides custom error classes and error handling utilities.
 */

// Export all error classes
export * from './base.error.js';

// Import for convenience functions
import { BaseError } from './base.error.js';
import { logger } from '../logging/logger.js';

/**
 * Check if an error is operational (expected)
 */
export function isOperationalError(error: Error): boolean {
  if (error instanceof BaseError) {
    return error.isOperational;
  }
  return false;
}

/**
 * Check if an error is a trusted error (our custom error)
 */
export function isTrustedError(error: Error): boolean {
  return error instanceof BaseError;
}

/**
 * Normalize any error to BaseError
 */
export function normalizeError(error: unknown): BaseError {
  // Already a BaseError
  if (error instanceof BaseError) {
    return error;
  }

  // Standard Error
  if (error instanceof Error) {
    return new InternalError(error.message, {
      originalError: error.name,
      stack: error.stack,
    });
  }

  // String error
  if (typeof error === 'string') {
    return new InternalError(error);
  }

  // Object error
  if (error && typeof error === 'object') {
    const err = error as any;
    return new InternalError(
      err.message || 'An error occurred',
      {
        ...err,
      }
    );
  }

  // Unknown error
  return new InternalError('An unknown error occurred');
}

/**
 * Error handler for Express
 */
export function errorHandler(
  err: Error,
  _req: any,
  res: any,
  _next: any
): void {
  // Normalize the error
  const error = normalizeError(err);

  // Log the error
  if (error.isOperational) {
    logger.warn('Operational error', { error: error.toJSON() });
  } else {
    logger.error('Unexpected error', err, { error: error.toJSON() });
  }

  // Send response if not already sent
  if (!res.headersSent) {
    res.status(error.statusCode).json(error.toResponse());
  }
}

/**
 * Async error wrapper for Express routes
 */
export function asyncHandler(
  fn: (req: any, res: any, next: any) => Promise<any>
) {
  return (req: any, res: any, next: any) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Create an error from HTTP status code
 */
export function createHttpError(
  statusCode: number,
  message?: string,
  details?: Record<string, any>
): BaseError {
  switch (statusCode) {
    case 400:
      return new ValidationError(message || 'Bad request', details);
    case 401:
      return new AuthenticationError(message);
    case 403:
      return new AuthorizationError(message);
    case 404:
      return new NotFoundError(message || 'Resource', details?.id);
    case 409:
      return new ConflictError(message || 'Resource conflict', details);
    case 429:
      return new RateLimitError(details?.retryAfter || 60, message);
    case 500:
      return new InternalError(message, details);
    case 502:
      return new BadGatewayError(message, details?.service);
    case 503:
      return new ServiceUnavailableError(message, details?.retryAfter);
    case 504:
      return new TimeoutError(
        details?.operation || 'Operation',
        details?.timeout || 30000
      );
    default:
      return new InternalError(message || `HTTP ${statusCode} error`, details);
  }
}

/**
 * Extract error details for logging
 */
export function extractErrorDetails(error: unknown): Record<string, any> {
  if (error instanceof BaseError) {
    return error.toJSON();
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...(error as any),
    };
  }

  if (typeof error === 'object' && error !== null) {
    return { ...error };
  }

  return {
    error: String(error),
  };
}

/**
 * Handle unhandled rejections
 */
export function handleUnhandledRejection(reason: unknown, promise: Promise<any>): void {
  logger.error('Unhandled rejection', reason as Error, {
    type: 'unhandledRejection',
    promise: String(promise),
    reason: extractErrorDetails(reason),
  });
}

/**
 * Handle uncaught exceptions
 */
export function handleUncaughtException(error: Error): void {
  logger.error('Uncaught exception', error, {
    type: 'uncaughtException',
    error: extractErrorDetails(error),
  });

  // Give logger time to write
  setTimeout(() => {
    process.exit(1);
  }, 1000);
}

/**
 * Setup global error handlers
 */
export function setupGlobalErrorHandlers(): void {
  process.on('unhandledRejection', handleUnhandledRejection);
  process.on('uncaughtException', handleUncaughtException);

  // Graceful shutdown on SIGTERM
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    process.exit(0);
  });

  // Graceful shutdown on SIGINT
  process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully');
    process.exit(0);
  });
}

// Import error classes for convenience function
import {
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  InternalError,
  ServiceUnavailableError,
  BadGatewayError,
  TimeoutError,
} from './base.error.js';