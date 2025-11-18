/**
 * Main Logger Configuration
 *
 * Central logger instance using Winston with multiple transports,
 * context management, and specialized logging methods.
 */

import winston from 'winston';
import { config } from '../config/index.js';
import { consoleTransport } from './transports/console.transport.js';
import { fileTransport } from './transports/file.transport.js';
import { errorTransport } from './transports/error.transport.js';
import { auditTransport } from './transports/audit.transport.js';
import { AuditEventType } from './transports/audit.transport.js';
import { sanitizeLogData } from './utils/sanitizer.js';

export class Logger {
  private winston: winston.Logger;
  private context: Map<string, any> = new Map();
  private static instance: Logger;

  constructor() {
    this.winston = winston.createLogger({
      level: config.app.logging.level,
      levels: winston.config.npm.levels,
      format: this.getDefaultFormat(),
      transports: this.getTransports(),
      exitOnError: false,
      silent: process.env.NODE_ENV === 'test',
    });

    // Handle uncaught exceptions and rejections
    if (config.app.environment !== 'test') {
      this.winston.exceptions.handle(
        new winston.transports.File({
          filename: `${config.app.logging.directory}/exceptions.log`,
        })
      );

      this.winston.rejections.handle(
        new winston.transports.File({
          filename: `${config.app.logging.directory}/rejections.log`,
        })
      );
    }
  }

  /**
   * Get singleton instance
   */
  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * Get default format for all transports
   */
  private getDefaultFormat(): winston.Logform.Format {
    return winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.metadata({
        fillExcept: ['message', 'level', 'timestamp', 'label'],
      })
    );
  }

  /**
   * Get transports based on environment
   */
  private getTransports(): winston.transport[] {
    const transports: winston.transport[] = [];

    // Console transport
    if (config.app.environment !== 'production' || config.app.logging.format === 'pretty') {
      transports.push(consoleTransport());
    }

    // File transports (not in test environment)
    if (config.app.environment !== 'test') {
      transports.push(fileTransport());
      transports.push(errorTransport());
      transports.push(auditTransport());
    }

    return transports;
  }

  /**
   * Core logging methods
   */
  error(message: string, error?: Error | unknown, meta?: Record<string, any>): void {
    const errorMeta = this.formatError(error);
    const sanitized = sanitizeLogData({ ...this.getContext(), ...errorMeta, ...meta });
    this.winston.error(message, sanitized);
  }

  warn(message: string, meta?: Record<string, any>): void {
    const sanitized = sanitizeLogData({ ...this.getContext(), ...meta });
    this.winston.warn(message, sanitized);
  }

  info(message: string, meta?: Record<string, any>): void {
    const sanitized = sanitizeLogData({ ...this.getContext(), ...meta });
    this.winston.info(message, sanitized);
  }

  http(message: string, meta?: Record<string, any>): void {
    const sanitized = sanitizeLogData({ ...this.getContext(), ...meta });
    this.winston.http(message, sanitized);
  }

  debug(message: string, meta?: Record<string, any>): void {
    const sanitized = sanitizeLogData({ ...this.getContext(), ...meta });
    this.winston.debug(message, sanitized);
  }

  verbose(message: string, meta?: Record<string, any>): void {
    const sanitized = sanitizeLogData({ ...this.getContext(), ...meta });
    this.winston.verbose(message, sanitized);
  }

  silly(message: string, meta?: Record<string, any>): void {
    const sanitized = sanitizeLogData({ ...this.getContext(), ...meta });
    this.winston.silly(message, sanitized);
  }

  /**
   * Audit logging for security events
   */
  audit(event: AuditEventType | string, meta: Record<string, any>): void {
    const auditData = {
      ...this.getContext(),
      audit: true,
      event,
      timestamp: new Date().toISOString(),
      ...meta,
    };

    // Don't sanitize audit logs completely, but remove passwords
    const sanitized = sanitizeLogData(auditData, {
      sensitiveKeys: ['password', 'token', 'secret'],
      preserveStructure: true,
    });

    this.winston.info(`Audit: ${event}`, sanitized);
  }

  /**
   * Security audit logging
   */
  securityAudit(event: string, severity: 'low' | 'medium' | 'high' | 'critical', meta: Record<string, any>): void {
    const securityData = {
      ...this.getContext(),
      audit: true,
      security: true,
      event,
      severity,
      timestamp: new Date().toISOString(),
      ...meta,
    };

    const level = severity === 'critical' || severity === 'high' ? 'error' : 'warn';
    this.winston[level](`Security: ${event}`, sanitizeLogData(securityData));
  }

  /**
   * Performance logging
   */
  performance(operation: string, duration: number, meta?: Record<string, any>): void {
    const perfData = {
      ...this.getContext(),
      performance: true,
      operation,
      duration,
      durationMs: duration,
      timestamp: new Date().toISOString(),
      ...meta,
    };

    // Log as warning if duration exceeds threshold
    const threshold = meta?.threshold || 1000;
    const level = duration > threshold ? 'warn' : 'info';

    this.winston[level](`Performance: ${operation} took ${duration}ms`, perfData);
  }

  /**
   * Database query logging
   */
  query(sql: string, params: any[], duration: number): void {
    const queryData = {
      ...this.getContext(),
      query: sql,
      params: sanitizeLogData(params),
      duration,
      slowQuery: duration > 100,
    };

    const level = queryData.slowQuery ? 'warn' : 'debug';
    this.winston[level](`Query executed in ${duration}ms`, queryData);
  }

  /**
   * Access logging
   */
  access(method: string, path: string, statusCode: number, responseTime: number, meta?: Record<string, any>): void {
    const accessData = {
      ...this.getContext(),
      access: true,
      method,
      path,
      statusCode,
      responseTime,
      timestamp: new Date().toISOString(),
      ...meta,
    };

    this.winston.http(`${method} ${path} ${statusCode} ${responseTime}ms`, sanitizeLogData(accessData));
  }

  /**
   * Context management
   */
  setContext(key: string, value: any): void {
    this.context.set(key, value);
  }

  getContext(): Record<string, any> {
    const context: Record<string, any> = {};
    this.context.forEach((value, key) => {
      context[key] = value;
    });
    return context;
  }

  clearContext(): void {
    this.context.clear();
  }

  withContext(context: Record<string, any>): Logger {
    Object.entries(context).forEach(([key, value]) => {
      this.setContext(key, value);
    });
    return this;
  }

  /**
   * Create child logger with additional context
   */
  child(context: Record<string, any>): Logger {
    const childLogger = new Logger();
    // Copy parent context
    this.context.forEach((value, key) => {
      childLogger.setContext(key, value);
    });
    // Add child context
    Object.entries(context).forEach(([key, value]) => {
      childLogger.setContext(key, value);
    });
    return childLogger;
  }

  /**
   * Format error objects
   */
  private formatError(error: Error | unknown): Record<string, any> {
    if (!error) return {};

    if (error instanceof Error) {
      return {
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
          code: (error as any).code,
          statusCode: (error as any).statusCode,
          correlationId: (error as any).correlationId,
          details: (error as any).details,
        },
      };
    }

    return { error: String(error) };
  }

  /**
   * Start a timer for performance logging
   */
  startTimer(): () => void {
    const start = Date.now();
    return () => {
      const duration = Date.now() - start;
      return duration;
    };
  }

  /**
   * Measure async operation performance
   */
  async measureAsync<T>(
    operation: string,
    fn: () => Promise<T>,
    meta?: Record<string, any>
  ): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - start;
      this.performance(operation, duration, { ...meta, success: true });
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.performance(operation, duration, { ...meta, success: false });
      throw error;
    }
  }

  /**
   * Measure sync operation performance
   */
  measureSync<T>(
    operation: string,
    fn: () => T,
    meta?: Record<string, any>
  ): T {
    const start = Date.now();
    try {
      const result = fn();
      const duration = Date.now() - start;
      this.performance(operation, duration, { ...meta, success: true });
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.performance(operation, duration, { ...meta, success: false });
      throw error;
    }
  }
}

// Export singleton instance
export const logger = Logger.getInstance();

// Export convenience functions
export const error = logger.error.bind(logger);
export const warn = logger.warn.bind(logger);
export const info = logger.info.bind(logger);
export const http = logger.http.bind(logger);
export const debug = logger.debug.bind(logger);
export const verbose = logger.verbose.bind(logger);
export const silly = logger.silly.bind(logger);
export const audit = logger.audit.bind(logger);
export const securityAudit = logger.securityAudit.bind(logger);
export const performance = logger.performance.bind(logger);
export const query = logger.query.bind(logger);
export const access = logger.access.bind(logger);