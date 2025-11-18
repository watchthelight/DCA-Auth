/**
 * JSON Log Formatter
 *
 * Formats log entries as JSON for structured logging in production.
 * Includes metadata, timestamps, and sanitization.
 */

import winston from 'winston';
import { sanitizeLogData } from '../utils/sanitizer.js';

export function jsonFormatter(): winston.Logform.Format {
  return winston.format.combine(
    // Add timestamp
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss.SSS',
    }),

    // Add error stack traces
    winston.format.errors({ stack: true }),

    // Sanitize sensitive data
    winston.format.printf((info) => {
      const sanitized = sanitizeLogData(info);
      return JSON.stringify(sanitized);
    })
  );
}

/**
 * Create a structured JSON formatter with additional metadata
 */
export function structuredJsonFormatter(): winston.Logform.Format {
  return winston.format.combine(
    // Add timestamp
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss.SSS',
    }),

    // Add error information
    winston.format.errors({ stack: true }),

    // Add additional metadata
    winston.format.metadata({
      fillExcept: ['message', 'level', 'timestamp', 'label'],
    }),

    // Format as JSON
    winston.format.json({
      replacer: (key: string, value: any) => {
        // Sanitize sensitive keys
        const sensitiveKeys = ['password', 'token', 'secret', 'key', 'authorization'];
        if (sensitiveKeys.some(k => key.toLowerCase().includes(k))) {
          return '[REDACTED]';
        }
        return value;
      },
    })
  );
}

/**
 * Create a compact JSON formatter for high-volume logging
 */
export function compactJsonFormatter(): winston.Logform.Format {
  return winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.json({
      space: 0,
      replacer: (key: string, value: any) => {
        // Remove null and undefined values to save space
        if (value === null || value === undefined) {
          return undefined;
        }
        // Sanitize sensitive data
        const sensitiveKeys = ['password', 'token', 'secret', 'key'];
        if (sensitiveKeys.some(k => key.toLowerCase().includes(k))) {
          return '[REDACTED]';
        }
        return value;
      },
    })
  );
}