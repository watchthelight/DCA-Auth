/**
 * Logging Module Public Exports
 *
 * Provides access to the logging system and all related utilities.
 */

// Main logger
export {
  Logger,
  logger,
  error,
  warn,
  info,
  http,
  debug,
  verbose,
  silly,
  audit,
  securityAudit,
  performance,
  query,
  access,
} from './logger.js';

// Transports
export { consoleTransport } from './transports/console.transport.js';
export { fileTransport } from './transports/file.transport.js';
export { errorTransport } from './transports/error.transport.js';
export { auditTransport, AuditEventType } from './transports/audit.transport.js';

// Formatters
export { jsonFormatter, structuredJsonFormatter, compactJsonFormatter } from './formatters/json.formatter.js';
export { prettyFormatter, simplePrettyFormatter, devFormatter } from './formatters/pretty.formatter.js';
export { errorFormatter, detailedErrorFormatter } from './formatters/error.formatter.js';

// Middleware
export {
  correlationMiddleware,
  getCorrelationId,
  setCorrelationContext,
  getCorrelationContext,
  getCorrelationContextValue,
  runWithCorrelation,
  runWithCorrelationAsync,
  WithCorrelation,
  createCorrelationContext,
  type CorrelationContext,
} from './middleware/correlation.js';

export {
  devRequestLogger,
  prodRequestLogger,
  detailedRequestLogger,
  errorLogger,
  createRequestLogger,
  type RequestLoggerOptions,
} from './middleware/request.logger.js';

// Utilities
export {
  sanitizeLogData,
  createSanitizer,
  sanitizeUrl,
  sanitizeHeaders,
  maskSensitiveString,
} from './utils/sanitizer.js';