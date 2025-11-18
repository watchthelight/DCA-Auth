/**
 * Base Error Classes
 *
 * Custom error classes with correlation IDs, status codes,
 * and structured error information.
 */

import { getCorrelationId } from '../logging/middleware/correlation.js';

/**
 * Base error class for all application errors
 */
export abstract class BaseError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly correlationId?: string;
  public readonly timestamp: Date;
  public readonly details?: Record<string, any>;

  constructor(
    message: string,
    code: string,
    statusCode: number,
    isOperational: boolean = true,
    details?: Record<string, any>
  ) {
    super(message);

    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.correlationId = getCorrelationId();
    this.timestamp = new Date();
    this.details = details;

    // Capture stack trace
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Convert error to JSON representation
   */
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      correlationId: this.correlationId,
      timestamp: this.timestamp,
      details: this.details,
      ...(process.env.NODE_ENV === 'development' && { stack: this.stack }),
    };
  }

  /**
   * Convert to HTTP response format
   */
  toResponse(): Record<string, any> {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details && { details: this.details }),
        ...(this.correlationId && { correlationId: this.correlationId }),
      },
    };
  }
}

/**
 * Validation error for invalid input data
 */
export class ValidationError extends BaseError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'VALIDATION_ERROR', 400, true, details);
  }
}

/**
 * Authentication error for failed authentication
 */
export class AuthenticationError extends BaseError {
  constructor(message: string = 'Authentication failed') {
    super(message, 'AUTHENTICATION_ERROR', 401, true);
  }
}

/**
 * Authorization error for insufficient permissions
 */
export class AuthorizationError extends BaseError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 'AUTHORIZATION_ERROR', 403, true);
  }
}

/**
 * Not found error for missing resources
 */
export class NotFoundError extends BaseError {
  constructor(resource: string, id?: string | number) {
    const message = id
      ? `${resource} with ID ${id} not found`
      : `${resource} not found`;
    super(message, 'NOT_FOUND', 404, true, { resource, id });
  }
}

/**
 * Conflict error for resource conflicts
 */
export class ConflictError extends BaseError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'CONFLICT', 409, true, details);
  }
}

/**
 * Rate limit error for too many requests
 */
export class RateLimitError extends BaseError {
  public readonly retryAfter: number;

  constructor(retryAfter: number, message: string = 'Rate limit exceeded') {
    super(message, 'RATE_LIMIT_EXCEEDED', 429, true, { retryAfter });
    this.retryAfter = retryAfter;
  }
}

/**
 * Internal server error for unexpected errors
 */
export class InternalError extends BaseError {
  constructor(message: string = 'Internal server error', details?: Record<string, any>) {
    super(message, 'INTERNAL_ERROR', 500, false, details);
  }
}

/**
 * Service unavailable error
 */
export class ServiceUnavailableError extends BaseError {
  constructor(message: string = 'Service temporarily unavailable', retryAfter?: number) {
    super(
      message,
      'SERVICE_UNAVAILABLE',
      503,
      true,
      retryAfter ? { retryAfter } : undefined
    );
  }
}

/**
 * Bad gateway error for upstream service errors
 */
export class BadGatewayError extends BaseError {
  constructor(message: string = 'Bad gateway', service?: string) {
    super(
      message,
      'BAD_GATEWAY',
      502,
      true,
      service ? { service } : undefined
    );
  }
}

/**
 * Timeout error for operation timeouts
 */
export class TimeoutError extends BaseError {
  constructor(operation: string, timeout: number) {
    super(
      `Operation '${operation}' timed out after ${timeout}ms`,
      'TIMEOUT',
      504,
      true,
      { operation, timeout }
    );
  }
}

/**
 * Business logic error for domain-specific errors
 */
export class BusinessError extends BaseError {
  constructor(message: string, code: string, details?: Record<string, any>) {
    super(message, code, 422, true, details);
  }
}

/**
 * Integration error for third-party service failures
 */
export class IntegrationError extends BaseError {
  public readonly service: string;

  constructor(service: string, message: string, details?: Record<string, any>) {
    super(
      `${service} integration error: ${message}`,
      'INTEGRATION_ERROR',
      502,
      true,
      { service, ...details }
    );
    this.service = service;
  }
}

/**
 * Database error for database-related issues
 */
export class DatabaseError extends BaseError {
  public readonly query?: string;

  constructor(message: string, query?: string, details?: Record<string, any>) {
    super(
      message,
      'DATABASE_ERROR',
      500,
      false,
      { query, ...details }
    );
    this.query = query;
  }
}

/**
 * Configuration error for missing or invalid configuration
 */
export class ConfigurationError extends BaseError {
  constructor(message: string, config?: string) {
    super(
      message,
      'CONFIGURATION_ERROR',
      500,
      false,
      config ? { config } : undefined
    );
  }
}