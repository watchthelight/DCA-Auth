/**
 * File Transport Configuration
 *
 * Configures Winston file transport with daily rotation,
 * compression, and size limits.
 */

import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { config } from '../../config/index.js';
import { structuredJsonFormatter } from '../formatters/json.formatter.js';
import path from 'path';

/**
 * Create rotating file transport for general logs
 */
export function fileTransport(): DailyRotateFile {
  const logDir = config.app.logging.directory || 'logs';

  return new DailyRotateFile({
    level: config.app.logging.level,
    filename: path.join(logDir, 'application-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: config.app.logging.maxSize || '100m',
    maxFiles: config.app.logging.maxFiles || 14,
    format: structuredJsonFormatter(),
    handleExceptions: false,
    handleRejections: false,
  });
}

/**
 * Create rotating file transport for combined logs
 */
export function combinedFileTransport(): DailyRotateFile {
  const logDir = config.app.logging.directory || 'logs';

  return new DailyRotateFile({
    level: 'info',
    filename: path.join(logDir, 'combined-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '100m',
    maxFiles: '7d',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    ),
  });
}

/**
 * Create file transport for performance logs
 */
export function performanceFileTransport(): DailyRotateFile {
  const logDir = config.app.logging.directory || 'logs';

  return new DailyRotateFile({
    level: 'info',
    filename: path.join(logDir, 'performance-%DATE%.log'),
    datePattern: 'YYYY-MM-DD-HH',
    zippedArchive: true,
    maxSize: '50m',
    maxFiles: '3d',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json(),
      winston.format.printf((info) => {
        // Only log performance entries
        if (info.performance) {
          return JSON.stringify(info);
        }
        return '';
      })
    ),
  });
}

/**
 * Create file transport for debug logs (development only)
 */
export function debugFileTransport(): winston.transports.FileTransportInstance {
  const logDir = config.app.logging.directory || 'logs';

  return new winston.transports.File({
    level: 'debug',
    filename: path.join(logDir, 'debug.log'),
    maxsize: 10485760, // 10MB
    maxFiles: 3,
    tailable: true,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.printf(({ timestamp, level, message, ...metadata }) => {
        return `[${timestamp}] ${level}: ${message} ${
          Object.keys(metadata).length ? JSON.stringify(metadata) : ''
        }`;
      })
    ),
  });
}

/**
 * Create transport for slow query logs
 */
export function slowQueryTransport(): DailyRotateFile {
  const logDir = config.app.logging.directory || 'logs';

  return new DailyRotateFile({
    level: 'warn',
    filename: path.join(logDir, 'slow-queries-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '7d',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json(),
      winston.format.printf((info) => {
        // Only log slow query entries
        if (info.slowQuery) {
          return JSON.stringify({
            timestamp: info.timestamp,
            query: info.query,
            duration: info.duration,
            params: info.params,
            correlationId: info.correlationId,
          });
        }
        return '';
      })
    ),
  });
}