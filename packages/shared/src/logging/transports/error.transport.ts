/**
 * Error Transport Configuration
 *
 * Dedicated transport for error logging with enhanced error details,
 * stack traces, and error tracking integration.
 */

import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { config } from '../../config/index.js';
import { errorFormatter, detailedErrorFormatter } from '../formatters/error.formatter.js';
import path from 'path';

/**
 * Create rotating file transport for error logs
 */
export function errorTransport(): DailyRotateFile {
  const logDir = config.app.logging.directory || 'logs';

  return new DailyRotateFile({
    level: 'error',
    filename: path.join(logDir, 'error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '50m',
    maxFiles: '30d', // Keep error logs longer
    format: errorFormatter(),
    handleExceptions: true,
    handleRejections: true,
  });
}

/**
 * Create detailed error transport for development
 */
export function detailedErrorTransport(): winston.transports.FileTransportInstance {
  const logDir = config.app.logging.directory || 'logs';

  return new winston.transports.File({
    level: 'error',
    filename: path.join(logDir, 'error-detailed.log'),
    maxsize: 52428800, // 50MB
    maxFiles: 5,
    format: detailedErrorFormatter(),
    handleExceptions: true,
    handleRejections: true,
  });
}

/**
 * Create transport for unhandled exceptions
 */
export function exceptionTransport(): winston.transports.FileTransportInstance {
  const logDir = config.app.logging.directory || 'logs';

  return new winston.transports.File({
    filename: path.join(logDir, 'exceptions.log'),
    maxsize: 10485760, // 10MB
    maxFiles: 3,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json()
    ),
  });
}

/**
 * Create transport for unhandled promise rejections
 */
export function rejectionTransport(): winston.transports.FileTransportInstance {
  const logDir = config.app.logging.directory || 'logs';

  return new winston.transports.File({
    filename: path.join(logDir, 'rejections.log'),
    maxsize: 10485760, // 10MB
    maxFiles: 3,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json()
    ),
  });
}

/**
 * Create transport for critical errors (immediate notification)
 */
export function criticalErrorTransport(): winston.transports.FileTransportInstance {
  const logDir = config.app.logging.directory || 'logs';

  return new winston.transports.File({
    level: 'error',
    filename: path.join(logDir, 'critical.log'),
    maxsize: 5242880, // 5MB
    maxFiles: 10,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.printf((info) => {
        // Only log critical errors
        if (info.level === 'error' && info.critical) {
          return JSON.stringify({
            timestamp: info.timestamp,
            message: info.message,
            error: info.error,
            stack: info.stack,
            correlationId: info.correlationId,
            userId: info.userId,
            metadata: info.metadata,
          });
        }
        return '';
      })
    ),
  });
}