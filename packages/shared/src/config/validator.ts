/**
 * Configuration Validation Utilities
 *
 * Provides utilities for validating configuration values
 * and generating validation reports.
 */

import { z } from 'zod';
import chalk from 'chalk';
import { Config } from './types.js';

export class ConfigValidator {
  private errors: Array<{ path: string; message: string }> = [];
  private warnings: Array<{ path: string; message: string }> = [];

  /**
   * Validate a configuration object against a schema
   */
  validate<T>(schema: z.ZodSchema<T>, data: unknown): T | null {
    const result = schema.safeParse(data);

    if (!result.success) {
      this.processZodError(result.error);
      return null;
    }

    return result.data;
  }

  /**
   * Process Zod validation errors
   */
  private processZodError(error: z.ZodError): void {
    const formatted = error.format();
    this.extractErrors(formatted, '');
  }

  /**
   * Extract errors from formatted Zod error
   */
  private extractErrors(obj: any, path: string): void {
    if (obj._errors && obj._errors.length > 0) {
      obj._errors.forEach((error: string) => {
        this.errors.push({ path: path || 'root', message: error });
      });
    }

    for (const key in obj) {
      if (key !== '_errors' && typeof obj[key] === 'object') {
        const newPath = path ? `${path}.${key}` : key;
        this.extractErrors(obj[key], newPath);
      }
    }
  }

  /**
   * Add a custom validation error
   */
  addError(path: string, message: string): void {
    this.errors.push({ path, message });
  }

  /**
   * Add a custom validation warning
   */
  addWarning(path: string, message: string): void {
    this.warnings.push({ path, message });
  }

  /**
   * Check if validation has errors
   */
  hasErrors(): boolean {
    return this.errors.length > 0;
  }

  /**
   * Check if validation has warnings
   */
  hasWarnings(): boolean {
    return this.warnings.length > 0;
  }

  /**
   * Get all errors
   */
  getErrors(): Array<{ path: string; message: string }> {
    return [...this.errors];
  }

  /**
   * Get all warnings
   */
  getWarnings(): Array<{ path: string; message: string }> {
    return [...this.warnings];
  }

  /**
   * Clear all errors and warnings
   */
  clear(): void {
    this.errors = [];
    this.warnings = [];
  }

  /**
   * Format errors for console output
   */
  formatErrors(): string {
    if (this.errors.length === 0) {
      return '';
    }

    const lines: string[] = [chalk.red.bold('Configuration Errors:')];

    this.errors.forEach((error) => {
      lines.push(`  ${chalk.yellow(error.path)}: ${error.message}`);
    });

    return lines.join('\n');
  }

  /**
   * Format warnings for console output
   */
  formatWarnings(): string {
    if (this.warnings.length === 0) {
      return '';
    }

    const lines: string[] = [chalk.yellow.bold('Configuration Warnings:')];

    this.warnings.forEach((warning) => {
      lines.push(`  ${chalk.cyan(warning.path)}: ${warning.message}`);
    });

    return lines.join('\n');
  }

  /**
   * Generate a validation report
   */
  generateReport(): string {
    const lines: string[] = [];

    if (this.hasErrors() || this.hasWarnings()) {
      lines.push(chalk.bold('Configuration Validation Report'));
      lines.push('=' .repeat(50));
    }

    if (this.hasErrors()) {
      lines.push(this.formatErrors());
      lines.push('');
    }

    if (this.hasWarnings()) {
      lines.push(this.formatWarnings());
      lines.push('');
    }

    if (!this.hasErrors() && !this.hasWarnings()) {
      lines.push(chalk.green('✓ Configuration is valid'));
    }

    return lines.join('\n');
  }
}

/**
 * Validate production configuration requirements
 */
export function validateProductionConfig(config: Partial<Config>): ConfigValidator {
  const validator = new ConfigValidator();

  // Check required production settings
  if (!config.auth?.jwt?.accessSecret || config.auth.jwt.accessSecret.length < 32) {
    validator.addError('auth.jwt.accessSecret', 'JWT secret must be at least 32 characters in production');
  }

  if (!config.auth?.session?.secret || config.auth.session.secret.length < 32) {
    validator.addError('auth.session.secret', 'Session secret must be at least 32 characters in production');
  }

  if (!config.database?.url || config.database.url.includes('localhost')) {
    validator.addWarning('database.url', 'Database should not use localhost in production');
  }

  if (!config.redis?.password) {
    validator.addWarning('redis.password', 'Redis should have a password in production');
  }

  if (config.auth?.session?.secure === false) {
    validator.addError('auth.session.secure', 'Session cookies must be secure in production');
  }

  if (!config.app?.server?.trustProxy) {
    validator.addWarning('app.server.trustProxy', 'Consider enabling trustProxy when behind a reverse proxy');
  }

  if (config.api?.cors?.origins?.includes('*')) {
    validator.addError('api.cors.origins', 'CORS should not allow all origins in production');
  }

  if (config.app?.logging?.level === 'debug' || config.app?.logging?.level === 'trace') {
    validator.addWarning('app.logging.level', 'Consider using info or higher log level in production');
  }

  return validator;
}

/**
 * Check for deprecated configuration options
 */
export function checkDeprecatedOptions(_config: Partial<Config>): ConfigValidator {
  const validator = new ConfigValidator();

  // Add deprecation checks here as needed
  // Example:
  // if ('oldOption' in _config) {
  //   validator.addWarning('oldOption', 'This option is deprecated and will be removed in v2.0');
  // }

  return validator;
}

/**
 * Validate configuration completeness
 */
export function validateCompleteness(config: Partial<Config>): ConfigValidator {
  const validator = new ConfigValidator();

  // Check for required configurations
  if (!config.discord?.bot?.token) {
    validator.addError('discord.bot.token', 'Discord bot token is required');
  }

  if (!config.discord?.oauth?.clientSecret) {
    validator.addError('discord.oauth.clientSecret', 'Discord OAuth client secret is required');
  }

  if (!config.database?.url) {
    validator.addError('database.url', 'Database URL is required');
  }

  if (!config.redis?.host) {
    validator.addError('redis.host', 'Redis host is required');
  }

  return validator;
}

// Export a default validator instance
export const configValidator = new ConfigValidator();