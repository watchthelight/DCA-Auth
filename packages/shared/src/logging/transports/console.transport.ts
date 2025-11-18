/**
 * Console Transport Configuration
 *
 * Configures Winston console transport for stdout/stderr output.
 * Uses pretty formatting in development and JSON in production.
 */

import winston from 'winston';
import { config } from '../../config/index.js';
import { prettyFormatter, devFormatter } from '../formatters/pretty.formatter.js';
import { compactJsonFormatter } from '../formatters/json.formatter.js';

/**
 * Create console transport with environment-specific formatting
 */
export function consoleTransport(): winston.transports.ConsoleTransportInstance {
  const isDevelopment = config.app.environment === 'development';
  const isVerbose = config.app.logging.level === 'debug' || config.app.logging.level === 'trace';

  let format: winston.Logform.Format;

  if (isDevelopment) {
    // Use pretty formatting in development
    format = isVerbose ? devFormatter() : prettyFormatter();
  } else {
    // Use JSON formatting in production
    format = compactJsonFormatter();
  }

  return new winston.transports.Console({
    level: config.app.logging.level,
    handleExceptions: true,
    handleRejections: true,
    format,
    stderrLevels: ['error'],
  });
}

/**
 * Create a console transport for structured logging
 */
export function structuredConsoleTransport(): winston.transports.ConsoleTransportInstance {
  return new winston.transports.Console({
    level: config.app.logging.level,
    handleExceptions: true,
    handleRejections: true,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json()
    ),
  });
}

/**
 * Create a console transport for minimal output
 */
export function minimalConsoleTransport(): winston.transports.ConsoleTransportInstance {
  return new winston.transports.Console({
    level: 'warn', // Only warnings and errors
    format: winston.format.combine(
      winston.format.timestamp({ format: 'HH:mm:ss' }),
      winston.format.printf(({ timestamp, level, message }) =>
        `[${timestamp}] ${level}: ${message}`
      )
    ),
  });
}