/**
 * Redis Client Singleton
 *
 * Provides singleton instances for Redis operations including
 * main client, subscriber, and publisher for pub/sub.
 */

import { Redis } from 'ioredis';
import type { Redis as RedisClient } from 'ioredis';

import { redisConfig } from '../config/redis.js';
import { logger } from '../logging/logger.js';

let redisClient: RedisClient | null = null;
let redisSubscriber: RedisClient | null = null;
let redisPublisher: RedisClient | null = null;

/**
 * Get or create the main Redis client
 */
export function getRedisClient(): RedisClient {
  if (!redisClient) {
    redisClient = new Redis({
      host: redisConfig.host,
      port: redisConfig.port,
      password: redisConfig.password,
      db: redisConfig.db,
      keyPrefix: redisConfig.keyPrefix,
      retryStrategy: (times: number) => {
        if (times > redisConfig.maxRetries) {
          logger.error('Redis connection failed after max retries');
          return null;
        }
        const delay = Math.min(times * redisConfig.retryDelay, 5000);
        logger.info(`Retrying Redis connection in ${delay}ms...`);
        return delay;
      },
      enableOfflineQueue: redisConfig.enableOfflineQueue,
      lazyConnect: true,
    });

    redisClient.on('error', (error) => {
      logger.error('Redis client error:', error);
    });

    redisClient.on('connect', () => {
      logger.info('Redis client connected');
    });

    redisClient.on('ready', () => {
      logger.info('Redis client ready');
    });

    redisClient.on('close', () => {
      logger.warn('Redis client connection closed');
    });

    redisClient.on('reconnecting', () => {
      logger.info('Redis client reconnecting...');
    });
  }

  return redisClient as RedisClient;
}

/**
 * Get or create a subscriber client for pub/sub
 */
export function getSubscriber(): RedisClient {
  if (!redisSubscriber) {
    redisSubscriber = getRedisClient().duplicate();
    redisSubscriber.on('error', (error) => {
      logger.error('Redis subscriber error:', error);
    });
  }
  return redisSubscriber as RedisClient;
}

/**
 * Get or create a publisher client for pub/sub
 */
export function getPublisher(): RedisClient {
  if (!redisPublisher) {
    redisPublisher = getRedisClient().duplicate();
    redisPublisher.on('error', (error) => {
      logger.error('Redis publisher error:', error);
    });
  }
  return redisPublisher as RedisClient;
}

/**
 * Connect all Redis clients
 */
export async function connectRedis(): Promise<void> {
  try {
    await getRedisClient().connect();
    logger.info('Redis connection established');
  } catch (error) {
    logger.error('Failed to connect to Redis:', error);
    throw error;
  }
}

/**
 * Disconnect all Redis clients gracefully
 */
export async function disconnectRedis(): Promise<void> {
  const clients = [redisClient, redisSubscriber, redisPublisher].filter(Boolean);
  await Promise.all(clients.map((client) => client!.quit()));
  redisClient = null;
  redisSubscriber = null;
  redisPublisher = null;
  logger.info('Redis connections closed');
}

/**
 * Check if Redis is connected
 */
export function isRedisConnected(): boolean {
  return redisClient?.status === 'ready';
}