/**
 * Environment Variable Loader
 *
 * Loads configuration from environment variables and .env files
 * with support for multiple environments and variable expansion.
 */

import * as dotenv from 'dotenv';
import * as dotenvExpand from 'dotenv-expand';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { logger } from '../../utils/logger.js';

export class EnvLoader {
  private environment: string;
  private loadedFiles: string[] = [];

  constructor(environment?: string) {
    this.environment = environment || process.env.NODE_ENV || 'development';
  }

  /**
   * Load environment files in order of precedence
   */
  load(): void {
    const rootDir = process.cwd();
    const envFiles = this.getEnvFiles(rootDir);

    for (const envFile of envFiles) {
      if (existsSync(envFile)) {
        const result = dotenv.config({ path: envFile });
        if (result.error) {
          logger.warn(`Failed to load ${envFile}:`, result.error);
        } else {
          dotenvExpand.expand(result);
          this.loadedFiles.push(envFile);
          logger.debug(`Loaded environment file: ${envFile}`);
        }
      }
    }

    if (this.loadedFiles.length === 0) {
      logger.warn('No environment files found');
    }
  }

  /**
   * Get list of environment files to load in order
   */
  private getEnvFiles(rootDir: string): string[] {
    const files: string[] = [];

    // Load files in order of precedence (least to most specific)
    // 1. Default .env file
    files.push(resolve(rootDir, '.env'));

    // 2. Environment-specific file (e.g., .env.development)
    if (this.environment !== 'production') {
      files.push(resolve(rootDir, `.env.${this.environment}`));
    }

    // 3. Local overrides (not committed to git)
    files.push(resolve(rootDir, '.env.local'));

    // 4. Environment-specific local overrides
    if (this.environment !== 'production') {
      files.push(resolve(rootDir, `.env.${this.environment}.local`));
    }

    return files;
  }

  /**
   * Get a specific environment variable with optional default
   */
  get(key: string, defaultValue?: string): string | undefined {
    return process.env[key] || defaultValue;
  }

  /**
   * Get multiple environment variables by prefix
   */
  getByPrefix(prefix: string): Record<string, string> {
    const result: Record<string, string> = {};

    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith(prefix) && value !== undefined) {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Check if an environment variable exists
   */
  has(key: string): boolean {
    return key in process.env;
  }

  /**
   * Get all environment variables
   */
  getAll(): NodeJS.ProcessEnv {
    return { ...process.env };
  }

  /**
   * Get list of loaded environment files
   */
  getLoadedFiles(): string[] {
    return [...this.loadedFiles];
  }

  /**
   * Validate required environment variables
   */
  validateRequired(required: string[]): void {
    const missing: string[] = [];

    for (const key of required) {
      if (!this.has(key)) {
        missing.push(key);
      }
    }

    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
  }

  /**
   * Parse environment variable as boolean
   */
  getBoolean(key: string, defaultValue: boolean = false): boolean {
    const value = this.get(key);
    if (value === undefined) {
      return defaultValue;
    }
    return value.toLowerCase() === 'true' || value === '1';
  }

  /**
   * Parse environment variable as number
   */
  getNumber(key: string, defaultValue?: number): number | undefined {
    const value = this.get(key);
    if (value === undefined) {
      return defaultValue;
    }
    const parsed = Number(value);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  /**
   * Parse environment variable as array (comma-separated)
   */
  getArray(key: string, defaultValue: string[] = []): string[] {
    const value = this.get(key);
    if (!value) {
      return defaultValue;
    }
    return value.split(',').map(item => item.trim()).filter(Boolean);
  }

  /**
   * Parse environment variable as JSON
   */
  getJson<T>(key: string, defaultValue?: T): T | undefined {
    const value = this.get(key);
    if (!value) {
      return defaultValue;
    }
    try {
      return JSON.parse(value) as T;
    } catch {
      logger.warn(`Failed to parse JSON from ${key}`);
      return defaultValue;
    }
  }

  /**
   * Get current environment
   */
  getEnvironment(): string {
    return this.environment;
  }

  /**
   * Check if running in production
   */
  isProduction(): boolean {
    return this.environment === 'production';
  }

  /**
   * Check if running in development
   */
  isDevelopment(): boolean {
    return this.environment === 'development';
  }

  /**
   * Check if running in test
   */
  isTest(): boolean {
    return this.environment === 'test';
  }
}

// Export singleton instance
export const envLoader = new EnvLoader();