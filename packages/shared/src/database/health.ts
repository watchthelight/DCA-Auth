/**
 * Database Health Check Utilities
 *
 * Provides functions to check database connectivity and health status.
 * Used by health check endpoints and monitoring systems.
 */

import { prisma } from './client.js';

export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy';
  database: {
    connected: boolean;
    latency: number;
  };
  timestamp: Date;
  error?: string;
}

/**
 * Performs a database health check
 *
 * @returns Health check result with connection status and latency
 */
export async function checkDatabaseHealth(): Promise<HealthCheckResult> {
  const startTime = Date.now();

  try {
    // Test database connection with a simple query
    await prisma.$queryRaw`SELECT 1`;

    const latency = Date.now() - startTime;

    return {
      status: 'healthy',
      database: {
        connected: true,
        latency,
      },
      timestamp: new Date(),
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      database: {
        connected: false,
        latency: Date.now() - startTime,
      },
      timestamp: new Date(),
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Checks if database is connected and accessible
 *
 * @returns True if database is accessible, false otherwise
 */
export async function isDatabaseConnected(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

/**
 * Measures database query latency
 *
 * @returns Latency in milliseconds
 */
export async function measureDatabaseLatency(): Promise<number> {
  const startTime = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Date.now() - startTime;
  } catch {
    return -1;
  }
}
