/**
 * Redis Health Check Utilities
 *
 * Provides health monitoring for Redis connections and performance metrics.
 */

import { getRedisClient, isRedisConnected } from './client.js';
import { logger } from '../utils/logger.js';

export interface RedisHealthResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  connected: boolean;
  latency: number;
  info?: {
    version: string;
    mode: string;
    uptime: number;
    connectedClients: number;
    usedMemory: string;
    usedMemoryPeak: string;
  };
  error?: string;
  timestamp: Date;
}

export class RedisHealth {
  private client = getRedisClient();

  /**
   * Perform comprehensive Redis health check
   */
  async check(): Promise<RedisHealthResult> {
    const startTime = Date.now();
    const result: RedisHealthResult = {
      status: 'unhealthy',
      connected: false,
      latency: -1,
      timestamp: new Date(),
    };

    try {
      // Check connection status
      result.connected = isRedisConnected();

      if (!result.connected) {
        result.error = 'Redis not connected';
        return result;
      }

      // Ping test for latency
      await this.client.ping();
      result.latency = Date.now() - startTime;

      // Get Redis info
      const info = await this.getRedisInfo();
      if (info) {
        result.info = info;
      }

      // Determine health status based on metrics
      if (result.latency < 10) {
        result.status = 'healthy';
      } else if (result.latency < 50) {
        result.status = 'degraded';
      } else {
        result.status = 'unhealthy';
      }

      logger.debug(`Redis health check: ${result.status} (${result.latency}ms)`);
    } catch (error) {
      result.error = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Redis health check failed:', error);
    }

    return result;
  }

  /**
   * Get Redis server information
   */
  private async getRedisInfo(): Promise<RedisHealthResult['info'] | undefined> {
    try {
      const infoStr = await this.client.info();
      const info: Record<string, string> = {};

      // Parse Redis INFO output
      infoStr.split('\n').forEach((line) => {
        if (line && !line.startsWith('#')) {
          const [key, value] = line.split(':');
          if (key && value) {
            info[key.trim()] = value.trim();
          }
        }
      });

      return {
        version: info.redis_version || 'unknown',
        mode: info.redis_mode || 'standalone',
        uptime: parseInt(info.uptime_in_seconds || '0', 10),
        connectedClients: parseInt(info.connected_clients || '0', 10),
        usedMemory: info.used_memory_human || '0',
        usedMemoryPeak: info.used_memory_peak_human || '0',
      };
    } catch (error) {
      logger.error('Failed to get Redis info:', error);
      return undefined;
    }
  }

  /**
   * Test Redis read/write operations
   */
  async testReadWrite(): Promise<boolean> {
    const testKey = 'health:test:' + Date.now();
    const testValue = 'test-value-' + Math.random();

    try {
      // Test write
      await this.client.setex(testKey, 5, testValue);

      // Test read
      const retrieved = await this.client.get(testKey);

      // Cleanup
      await this.client.del(testKey);

      return retrieved === testValue;
    } catch (error) {
      logger.error('Redis read/write test failed:', error);
      return false;
    }
  }

  /**
   * Check Redis memory usage
   */
  async checkMemoryUsage(): Promise<{
    used: number;
    peak: number;
    percentage: number;
  } | null> {
    try {
      const info = await this.client.info('memory');
      const lines = info.split('\n');
      const memory: Record<string, string> = {};

      lines.forEach((line) => {
        if (line && !line.startsWith('#')) {
          const [key, value] = line.split(':');
          if (key && value) {
            memory[key.trim()] = value.trim();
          }
        }
      });

      const used = parseInt(memory.used_memory || '0', 10);
      const peak = parseInt(memory.used_memory_peak || '0', 10);
      const maxMemory = parseInt(memory.maxmemory || '0', 10);

      return {
        used,
        peak,
        percentage: maxMemory > 0 ? (used / maxMemory) * 100 : 0,
      };
    } catch (error) {
      logger.error('Failed to check memory usage:', error);
      return null;
    }
  }

  /**
   * Check Redis replication status (if applicable)
   */
  async checkReplication(): Promise<{
    role: 'master' | 'slave';
    connectedSlaves?: number;
    masterLinkStatus?: string;
  } | null> {
    try {
      const info = await this.client.info('replication');
      const lines = info.split('\n');
      const replication: Record<string, string> = {};

      lines.forEach((line) => {
        if (line && !line.startsWith('#')) {
          const [key, value] = line.split(':');
          if (key && value) {
            replication[key.trim()] = value.trim();
          }
        }
      });

      return {
        role: replication.role as 'master' | 'slave',
        connectedSlaves: parseInt(replication.connected_slaves || '0', 10),
        masterLinkStatus: replication.master_link_status,
      };
    } catch (error) {
      logger.error('Failed to check replication:', error);
      return null;
    }
  }

  /**
   * Monitor Redis performance over time
   */
  async monitor(durationMs: number = 5000, intervalMs: number = 1000): Promise<{
    avgLatency: number;
    maxLatency: number;
    minLatency: number;
    samples: number;
  }> {
    const latencies: number[] = [];
    const endTime = Date.now() + durationMs;

    while (Date.now() < endTime) {
      const start = Date.now();
      try {
        await this.client.ping();
        latencies.push(Date.now() - start);
      } catch {
        latencies.push(-1);
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    const validLatencies = latencies.filter((l) => l >= 0);

    return {
      avgLatency: validLatencies.length
        ? validLatencies.reduce((a, b) => a + b, 0) / validLatencies.length
        : -1,
      maxLatency: validLatencies.length ? Math.max(...validLatencies) : -1,
      minLatency: validLatencies.length ? Math.min(...validLatencies) : -1,
      samples: validLatencies.length,
    };
  }
}

// Export default health checker instance
export const redisHealth = new RedisHealth();

// Export convenience function for quick health checks
export async function checkRedisHealth(): Promise<RedisHealthResult> {
  return redisHealth.check();
}