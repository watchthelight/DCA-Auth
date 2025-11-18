/**
 * Correlation ID Middleware
 *
 * Generates and propagates correlation IDs through the request lifecycle
 * for distributed tracing and log correlation.
 */

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { createNamespace, getNamespace, Namespace } from 'cls-hooked';
import { logger } from '../logger.js';

// Create or get the correlation namespace
const NAMESPACE_NAME = 'correlation';
let namespace: Namespace;

try {
  namespace = createNamespace(NAMESPACE_NAME);
} catch {
  namespace = getNamespace(NAMESPACE_NAME)!;
}

export interface CorrelationContext {
  correlationId: string;
  userId?: string;
  sessionId?: string;
  requestPath?: string;
  requestMethod?: string;
  userAgent?: string;
  ipAddress?: string;
}

/**
 * Express middleware for correlation ID management
 */
export function correlationMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  namespace.run(() => {
    // Extract or generate correlation ID
    const correlationId = extractCorrelationId(req) || uuidv4();

    // Set in namespace for async context propagation
    namespace.set('correlationId', correlationId);
    namespace.set('requestPath', req.path);
    namespace.set('requestMethod', req.method);
    namespace.set('ipAddress', getClientIp(req));
    namespace.set('userAgent', req.get('user-agent'));

    // Add to response headers
    res.setHeader('X-Correlation-ID', correlationId);

    // Add to request object
    (req as any).correlationId = correlationId;

    // Add to logger context
    logger.setContext('correlationId', correlationId);
    logger.setContext('requestPath', req.path);
    logger.setContext('requestMethod', req.method);

    // Log request start
    logger.debug(`Request started: ${req.method} ${req.path}`, {
      correlationId,
      method: req.method,
      path: req.path,
      query: req.query,
      ip: getClientIp(req),
      userAgent: req.get('user-agent'),
    });

    // Clean up context after response
    res.on('finish', () => {
      logger.debug(`Request completed: ${req.method} ${req.path}`, {
        correlationId,
        statusCode: res.statusCode,
        responseTime: (res as any).responseTime,
      });

      // Clear logger context for this request
      logger.clearContext();
    });

    next();
  });
}

/**
 * Extract correlation ID from various sources
 */
function extractCorrelationId(req: Request): string | null {
  // Check headers (in order of preference)
  const headers = [
    'x-correlation-id',
    'x-request-id',
    'x-trace-id',
    'x-amzn-trace-id',
    'x-b3-traceid',
  ];

  for (const header of headers) {
    const value = req.get(header);
    if (value) {
      return value.split('-')[0]; // Handle AWS trace format
    }
  }

  // Check query parameters
  if (req.query.correlationId && typeof req.query.correlationId === 'string') {
    return req.query.correlationId;
  }

  return null;
}

/**
 * Get client IP address from request
 */
function getClientIp(req: Request): string {
  // Check X-Forwarded-For header
  const forwarded = req.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  // Check X-Real-IP header
  const realIp = req.get('x-real-ip');
  if (realIp) {
    return realIp;
  }

  // Fall back to socket address
  return req.socket.remoteAddress || 'unknown';
}

/**
 * Get current correlation ID from async context
 */
export function getCorrelationId(): string | undefined {
  if (namespace && namespace.active) {
    return namespace.get('correlationId');
  }
  return undefined;
}

/**
 * Set a value in the correlation context
 */
export function setCorrelationContext(key: string, value: any): void {
  if (namespace && namespace.active) {
    namespace.set(key, value);
    logger.setContext(key, value);
  }
}

/**
 * Get a value from the correlation context
 */
export function getCorrelationContextValue(key: string): any {
  if (namespace && namespace.active) {
    return namespace.get(key);
  }
  return undefined;
}

/**
 * Get the full correlation context
 */
export function getCorrelationContext(): CorrelationContext {
  if (namespace && namespace.active) {
    return {
      correlationId: namespace.get('correlationId'),
      userId: namespace.get('userId'),
      sessionId: namespace.get('sessionId'),
      requestPath: namespace.get('requestPath'),
      requestMethod: namespace.get('requestMethod'),
      userAgent: namespace.get('userAgent'),
      ipAddress: namespace.get('ipAddress'),
    };
  }

  return {
    correlationId: 'unknown',
  };
}

/**
 * Run a function within a correlation context
 */
export function runWithCorrelation<T>(
  correlationId: string,
  fn: () => T
): T {
  return namespace.runAndReturn(() => {
    namespace.set('correlationId', correlationId);
    logger.setContext('correlationId', correlationId);
    return fn();
  });
}

/**
 * Run an async function within a correlation context
 */
export async function runWithCorrelationAsync<T>(
  correlationId: string,
  fn: () => Promise<T>
): Promise<T> {
  return namespace.runAndReturn(async () => {
    namespace.set('correlationId', correlationId);
    logger.setContext('correlationId', correlationId);
    return await fn();
  });
}

/**
 * Decorator for adding correlation context to class methods
 */
export function WithCorrelation(_target: any, _propertyKey: string, descriptor: PropertyDescriptor): void {
  const originalMethod = descriptor.value;

  descriptor.value = function (...args: any[]) {
    const correlationId = getCorrelationId() || uuidv4();

    if (namespace && namespace.active) {
      return originalMethod.apply(this, args);
    }

    return runWithCorrelation(correlationId, () => {
      return originalMethod.apply(this, args);
    });
  };
}

/**
 * Create a correlation context for non-HTTP operations
 */
export function createCorrelationContext(
  context?: Partial<CorrelationContext>
): string {
  const correlationId = context?.correlationId || uuidv4();

  namespace.run(() => {
    namespace.set('correlationId', correlationId);

    if (context) {
      Object.entries(context).forEach(([key, value]) => {
        namespace.set(key, value);
      });
    }

    logger.setContext('correlationId', correlationId);
  });

  return correlationId;
}