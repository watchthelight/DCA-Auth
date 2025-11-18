/**
 * Error Log Formatter
 *
 * Specialized formatter for error logging with stack trace parsing
 * and error metadata extraction.
 */

import winston from 'winston';
import * as stackTrace from 'stack-trace';

interface ErrorInfo {
  name: string;
  message: string;
  code?: string;
  statusCode?: number;
  stack?: string;
  cause?: Error;
  details?: Record<string, any>;
  correlationId?: string;
  timestamp?: Date;
}

/**
 * Parse error stack trace to extract useful information
 */
function parseStackTrace(stack: string): Array<{
  file: string;
  line: number;
  column: number;
  function: string;
}> {
  try {
    const trace = stackTrace.parse({ stack } as any);
    return trace.slice(0, 10).map(frame => ({
      file: frame.getFileName() || 'unknown',
      line: frame.getLineNumber() || 0,
      column: frame.getColumnNumber() || 0,
      function: frame.getFunctionName() || 'anonymous',
    }));
  } catch {
    return [];
  }
}

/**
 * Extract error information from various error types
 */
function extractErrorInfo(error: any): ErrorInfo {
  if (!error) {
    return {
      name: 'UnknownError',
      message: 'An unknown error occurred',
    };
  }

  // Handle Error objects
  if (error instanceof Error) {
    const info: ErrorInfo = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };

    // Extract additional properties
    if ('code' in error) info.code = String(error.code);
    if ('statusCode' in error) info.statusCode = Number(error.statusCode);
    if ('cause' in error) info.cause = error.cause as Error;
    if ('details' in error) info.details = error.details as Record<string, any>;
    if ('correlationId' in error) info.correlationId = String(error.correlationId);
    if ('timestamp' in error) info.timestamp = error.timestamp as Date;

    return info;
  }

  // Handle string errors
  if (typeof error === 'string') {
    return {
      name: 'StringError',
      message: error,
    };
  }

  // Handle object errors
  if (typeof error === 'object') {
    return {
      name: error.name || 'ObjectError',
      message: error.message || JSON.stringify(error),
      ...error,
    };
  }

  // Default
  return {
    name: 'UnknownError',
    message: String(error),
  };
}

/**
 * Error formatter for structured error logging
 */
export function errorFormatter(): winston.Logform.Format {
  return winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss.SSS',
    }),
    winston.format.errors({ stack: true }),
    winston.format.printf((info) => {
      const { timestamp, level, message, error, ...metadata } = info;

      // Extract error information
      const errorInfo = error ? extractErrorInfo(error) : null;

      // Build log entry
      const logEntry: Record<string, any> = {
        timestamp,
        level,
        message,
        ...metadata,
      };

      // Add error details
      if (errorInfo) {
        logEntry.error = {
          name: errorInfo.name,
          message: errorInfo.message,
          code: errorInfo.code,
          statusCode: errorInfo.statusCode,
        };

        // Add parsed stack trace
        if (errorInfo.stack) {
          logEntry.error.stack = errorInfo.stack;
          logEntry.error.frames = parseStackTrace(errorInfo.stack);
        }

        // Add cause chain
        if (errorInfo.cause) {
          const causes: ErrorInfo[] = [];
          let currentCause = errorInfo.cause;
          let depth = 0;
          while (currentCause && depth < 5) {
            causes.push(extractErrorInfo(currentCause));
            currentCause = (currentCause as any).cause;
            depth++;
          }
          if (causes.length > 0) {
            logEntry.error.causes = causes;
          }
        }

        // Add error details
        if (errorInfo.details) {
          logEntry.error.details = errorInfo.details;
        }
      }

      return JSON.stringify(logEntry);
    })
  );
}

/**
 * Create a detailed error formatter for development
 */
export function detailedErrorFormatter(): winston.Logform.Format {
  return winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.printf((info) => {
      const { timestamp, level, message, stack, error, ...metadata } = info;

      let output = `[${timestamp}] ${level}: ${message}`;

      // Add correlation ID
      if (metadata.correlationId) {
        output += ` [${metadata.correlationId}]`;
      }

      // Add error details
      if (error || stack) {
        const errorInfo = error ? extractErrorInfo(error) : null;

        output += '\nError Details:';
        if (errorInfo) {
          output += `\n  Name: ${errorInfo.name}`;
          output += `\n  Message: ${errorInfo.message}`;
          if (errorInfo.code) output += `\n  Code: ${errorInfo.code}`;
          if (errorInfo.statusCode) output += `\n  Status: ${errorInfo.statusCode}`;
        }

        // Add stack trace
        if (stack || errorInfo?.stack) {
          output += '\nStack Trace:';
          const stackStr = String(stack || errorInfo?.stack || '');
          const stackLines = stackStr.split('\n');
          stackLines.forEach((line: string) => {
            output += '\n  ' + line;
          });
        }

        // Add parsed frames
        if (errorInfo?.stack) {
          const frames = parseStackTrace(errorInfo.stack);
          if (frames.length > 0) {
            output += '\nParsed Frames:';
            frames.forEach((frame, index) => {
              output += `\n  ${index + 1}. ${frame.function} at ${frame.file}:${frame.line}:${frame.column}`;
            });
          }
        }
      }

      // Add metadata
      const metaKeys = Object.keys(metadata).filter(k => k !== 'correlationId');
      if (metaKeys.length > 0) {
        output += '\nMetadata:';
        metaKeys.forEach(key => {
          const value = typeof metadata[key] === 'object'
            ? JSON.stringify(metadata[key], null, 2)
            : metadata[key];
          output += `\n  ${key}: ${value}`;
        });
      }

      return output;
    })
  );
}