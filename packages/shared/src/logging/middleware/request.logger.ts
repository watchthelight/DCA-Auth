/**
 * Request Logger Middleware
 *
 * Logs HTTP requests and responses with performance metrics,
 * status codes, and relevant metadata.
 */

import { Request, Response, NextFunction } from 'express';
import morgan from 'morgan';
import { logger } from '../logger.js';
import { sanitizeUrl, sanitizeHeaders } from '../utils/sanitizer.js';
import { getCorrelationId } from './correlation.js';

/**
 * Custom Morgan token definitions
 */
function setupMorganTokens(): void {
  // Correlation ID token
  morgan.token('correlation-id', (req: Request) => {
    return (req as any).correlationId || getCorrelationId() || 'unknown';
  });

  // User ID token
  morgan.token('user-id', (req: Request) => {
    return (req as any).user?.id || (req as any).userId || 'anonymous';
  });

  // Response time in milliseconds
  morgan.token('response-time-ms', (_req: Request, res: Response) => {
    return String((res as any).responseTime || 0);
  });

  // Request body (sanitized)
  morgan.token('body', (req: Request) => {
    if (req.body && Object.keys(req.body).length > 0) {
      const sanitized = sanitizeLogData(req.body, { maxDepth: 2 });
      return JSON.stringify(sanitized);
    }
    return '-';
  });

  // Error message
  morgan.token('error', (req: Request) => {
    return (req as any).error?.message || '-';
  });
}

// Setup tokens on module load
setupMorganTokens();

/**
 * Development request logger with colored output
 */
export function devRequestLogger() {
  return morgan(
    ':method :url :status :response-time ms - :res[content-length] [:correlation-id]',
    {
      stream: {
        write: (message: string) => {
          logger.http(message.trim());
        },
      },
      skip: (req: Request) => {
        // Skip health check endpoints
        return req.path === '/health' || req.path === '/metrics';
      },
    }
  );
}

/**
 * Production request logger with structured JSON output
 */
export function prodRequestLogger() {
  return morgan(
    (tokens: any, req: Request, res: Response) => {
      const logData = {
        timestamp: new Date().toISOString(),
        correlationId: tokens['correlation-id'](req, res),
        method: tokens.method(req, res),
        url: sanitizeUrl(tokens.url(req, res)),
        status: parseInt(tokens.status(req, res), 10),
        responseTime: parseFloat(tokens['response-time'](req, res)),
        contentLength: tokens.res(req, res, 'content-length') || 0,
        userAgent: tokens['user-agent'](req),
        referrer: tokens.referrer(req),
        userId: tokens['user-id'](req, res),
        ip: tokens['remote-addr'](req),
      };

      return JSON.stringify(logData);
    },
    {
      stream: {
        write: (message: string) => {
          try {
            const data = JSON.parse(message);
            logger.access(
              data.method,
              data.url,
              data.status,
              data.responseTime,
              data
            );
          } catch {
            logger.http(message.trim());
          }
        },
      },
      skip: (req: Request) => {
        // Skip health check endpoints
        return req.path === '/health' || req.path === '/metrics';
      },
    }
  );
}

/**
 * Detailed request/response logger middleware
 */
export function detailedRequestLogger() {
  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const correlationId = (req as any).correlationId || getCorrelationId();

    // Capture original send method
    const originalSend = res.send;
    // let responseBody: any; // Currently unused but may be needed for response logging

    // Override send to capture response body
    (res as any).send = function (body: any) {
      // responseBody = body; // Can be used if needed
      (res as any).responseTime = Date.now() - startTime;
      return originalSend.call(this, body);
    };

    // Log request
    logger.debug('Incoming request', {
      correlationId,
      method: req.method,
      path: req.path,
      query: req.query,
      headers: sanitizeHeaders(req.headers),
      body: req.body ? sanitizeLogData(req.body) : undefined,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    // Log response
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const level = res.statusCode >= 400 ? 'warn' : 'debug';

      logger[level]('Request completed', {
        correlationId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        statusMessage: res.statusMessage,
        duration,
        contentLength: res.get('content-length'),
        responseHeaders: sanitizeHeaders(res.getHeaders()),
      });

      // Log performance warning for slow requests
      if (duration > 1000) {
        logger.warn('Slow request detected', {
          correlationId,
          method: req.method,
          path: req.path,
          duration,
          threshold: 1000,
        });
      }
    });

    // Log errors
    res.on('error', (error) => {
      logger.error('Response error', error, {
        correlationId,
        method: req.method,
        path: req.path,
      });
    });

    next();
  };
}

/**
 * Error logging middleware
 */
export function errorLogger() {
  return (err: any, req: Request, _res: Response, next: NextFunction) => {
    const correlationId = (req as any).correlationId || getCorrelationId();

    logger.error('Request error', err, {
      correlationId,
      method: req.method,
      path: req.path,
      query: req.query,
      body: req.body ? sanitizeLogData(req.body) : undefined,
      userId: (req as any).user?.id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    // Add error to request for other middleware
    (req as any).error = err;

    next(err);
  };
}

/**
 * Create custom request logger with options
 */
export interface RequestLoggerOptions {
  level?: 'debug' | 'info' | 'http';
  includeBody?: boolean;
  includeHeaders?: boolean;
  skipPaths?: string[];
  skipHealthChecks?: boolean;
  maxBodyLength?: number;
}

export function createRequestLogger(options: RequestLoggerOptions = {}) {
  const {
    level = 'http',
    includeBody = false,
    includeHeaders = false,
    skipPaths = [],
    skipHealthChecks = true,
    maxBodyLength = 1000,
  } = options;

  const healthPaths = ['/health', '/healthz', '/ready', '/metrics'];
  const pathsToSkip = skipHealthChecks
    ? [...skipPaths, ...healthPaths]
    : skipPaths;

  return (req: Request, res: Response, next: NextFunction) => {
    // Skip specified paths
    if (pathsToSkip.includes(req.path)) {
      return next();
    }

    const startTime = Date.now();
    const correlationId = (req as any).correlationId || getCorrelationId();

    // Build log data
    const logData: Record<string, any> = {
      correlationId,
      method: req.method,
      path: req.path,
      query: req.query,
      ip: req.ip,
    };

    if (includeHeaders) {
      logData.headers = sanitizeHeaders(req.headers);
    }

    if (includeBody && req.body) {
      const bodyStr = JSON.stringify(req.body);
      logData.body = bodyStr.length > maxBodyLength
        ? bodyStr.substring(0, maxBodyLength) + '...'
        : sanitizeLogData(req.body);
    }

    // Log request
    logger[level](`${req.method} ${req.path}`, logData);

    // Log response
    res.on('finish', () => {
      const duration = Date.now() - startTime;

      logger[level](`${req.method} ${req.path} ${res.statusCode} ${duration}ms`, {
        correlationId,
        statusCode: res.statusCode,
        duration,
      });
    });

    next();
  };
}

// Helper function for sanitizing log data
function sanitizeLogData(data: any, _options?: any): any {
  // This should import from sanitizer.ts but to avoid circular dependency
  // we'll do basic sanitization here
  if (!data) return data;

  const sensitiveKeys = ['password', 'token', 'secret', 'key', 'authorization'];

  if (typeof data === 'object') {
    const sanitized: any = Array.isArray(data) ? [] : {};

    for (const [key, value] of Object.entries(data)) {
      if (sensitiveKeys.some(k => key.toLowerCase().includes(k))) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  return data;
}