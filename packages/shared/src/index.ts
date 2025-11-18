/**
 * DCA-Auth Shared Types and Utilities
 *
 * This package contains shared TypeScript types, constants, and utility functions
 * that are used across all DCA-Auth packages (API, Bot, Frontend).
 */

// Database exports
export { prisma } from './database/client.js';
export {
  checkDatabaseHealth,
  isDatabaseConnected,
  measureDatabaseLatency,
} from './database/health.js';
export type { HealthCheckResult } from './database/health.js';

// Configuration exports
export { env } from './config/env.js';
export type { Env } from './config/env.js';

// Placeholder types (will be expanded in later prompts)
export type LicenseKey = {
  id: string;
  key: string;
  userId: string;
  expiresAt: Date | null;
};

/**
 * Utility function for logging
 * @param message - Message to log
 */
export function logInfo(message: string): void {
  console.log(`[INFO] ${message}`);
}
