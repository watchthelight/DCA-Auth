/**
 * DCA-Auth Shared Types and Utilities
 *
 * This package contains shared TypeScript types, constants, and utility functions
 * that are used across all DCA-Auth packages (API, Bot, Frontend).
 */

/**
 * Placeholder type definition
 */
export type LicenseKey = {
  id: string;
  key: string;
  userId: string;
  expiresAt: Date | null;
};

/**
 * Placeholder utility function
 * @param message - Message to log
 */
export function logInfo(message: string): void {
  console.log(`[INFO] ${message}`);
}

export {};
