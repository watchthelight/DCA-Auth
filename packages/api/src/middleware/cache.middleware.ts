import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { RedisService } from '../services/redis.service';
import * as crypto from 'crypto';

@Injectable()
export class CacheMiddleware implements NestMiddleware {
  constructor(private readonly redisService: RedisService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Skip caching for certain paths
    const skipPaths = ['/api/health', '/api/auth', '/metrics'];
    if (skipPaths.some(path => req.path.startsWith(path))) {
      return next();
    }

    // Generate cache key based on URL and query params
    const cacheKey = this.generateCacheKey(req);

    try {
      // Check if cached response exists
      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        const data = JSON.parse(cached);
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('X-Cache-Key', cacheKey);
        return res.json(data);
      }
    } catch (error) {
      // If cache fails, continue without caching
      console.error('Cache middleware error:', error);
    }

    // Store original send function
    const originalSend = res.send;
    let responseSent = false;

    // Override send function to cache response
    res.send = function (data: any) {
      if (!responseSent && res.statusCode === 200) {
        responseSent = true;

        // Cache successful responses
        try {
          const ttl = CacheMiddleware.getCacheTTL(req.path);
          if (ttl > 0) {
            redisService.setex(cacheKey, ttl, data).catch(err => {
              console.error('Failed to cache response:', err);
            });
          }
        } catch (error) {
          console.error('Cache save error:', error);
        }

        res.setHeader('X-Cache', 'MISS');
        res.setHeader('X-Cache-Key', cacheKey);
      }

      return originalSend.call(this, data);
    };

    next();
  }

  private generateCacheKey(req: Request): string {
    const userId = req['user']?.id || 'anonymous';
    const hash = crypto
      .createHash('sha256')
      .update(`${req.path}:${JSON.stringify(req.query)}:${userId}`)
      .digest('hex');
    return `cache:api:${hash}`;
  }

  private static getCacheTTL(path: string): number {
    // Define TTL based on endpoint
    const ttlMap = {
      '/api/products': 3600, // 1 hour
      '/api/licenses': 300, // 5 minutes
      '/api/users': 600, // 10 minutes
      '/api/stats': 60, // 1 minute
    };

    for (const [pattern, ttl] of Object.entries(ttlMap)) {
      if (path.startsWith(pattern)) {
        return ttl;
      }
    }

    return 60; // Default 1 minute
  }
}

@Injectable()
export class CacheInvalidationService {
  constructor(private readonly redisService: RedisService) {}

  async invalidatePattern(pattern: string): Promise<void> {
    try {
      const keys = await this.redisService.keys(`cache:api:*${pattern}*`);
      if (keys.length > 0) {
        await Promise.all(keys.map(key => this.redisService.del(key)));
      }
    } catch (error) {
      console.error('Cache invalidation error:', error);
    }
  }

  async invalidateUser(userId: string): Promise<void> {
    await this.invalidatePattern(userId);
  }

  async invalidateAll(): Promise<void> {
    try {
      const keys = await this.redisService.keys('cache:api:*');
      if (keys.length > 0) {
        await Promise.all(keys.map(key => this.redisService.del(key)));
      }
    } catch (error) {
      console.error('Cache clear error:', error);
    }
  }
}