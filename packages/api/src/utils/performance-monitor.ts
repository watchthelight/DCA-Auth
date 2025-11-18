import { Injectable, Logger } from '@nestjs/common';
import * as prometheus from 'prom-client';
import * as os from 'os';

@Injectable()
export class PerformanceMonitor {
  private readonly logger = new Logger(PerformanceMonitor.name);
  private readonly registry: prometheus.Registry;
  private readonly metrics: Map<string, prometheus.Metric> = new Map();

  constructor() {
    this.registry = new prometheus.Registry();
    this.setupMetrics();
    this.startCollecting();
  }

  private setupMetrics() {
    // HTTP metrics
    this.metrics.set('http_requests_total', new prometheus.Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'path', 'status'],
      registers: [this.registry],
    }));

    this.metrics.set('http_request_duration_seconds', new prometheus.Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'path', 'status'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
      registers: [this.registry],
    }));

    // Database metrics
    this.metrics.set('db_query_duration_seconds', new prometheus.Histogram({
      name: 'db_query_duration_seconds',
      help: 'Database query duration in seconds',
      labelNames: ['operation', 'table'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
      registers: [this.registry],
    }));

    this.metrics.set('db_connection_pool_size', new prometheus.Gauge({
      name: 'db_connection_pool_size',
      help: 'Database connection pool size',
      labelNames: ['state'],
      registers: [this.registry],
    }));

    // Cache metrics
    this.metrics.set('cache_hits_total', new prometheus.Counter({
      name: 'cache_hits_total',
      help: 'Total number of cache hits',
      labelNames: ['cache_type'],
      registers: [this.registry],
    }));

    this.metrics.set('cache_misses_total', new prometheus.Counter({
      name: 'cache_misses_total',
      help: 'Total number of cache misses',
      labelNames: ['cache_type'],
      registers: [this.registry],
    }));

    this.metrics.set('cache_evictions_total', new prometheus.Counter({
      name: 'cache_evictions_total',
      help: 'Total number of cache evictions',
      labelNames: ['cache_type', 'reason'],
      registers: [this.registry],
    }));

    // Business metrics
    this.metrics.set('licenses_created_total', new prometheus.Counter({
      name: 'licenses_created_total',
      help: 'Total number of licenses created',
      labelNames: ['type'],
      registers: [this.registry],
    }));

    this.metrics.set('license_activations_total', new prometheus.Counter({
      name: 'license_activations_total',
      help: 'Total number of license activations',
      labelNames: ['type', 'status'],
      registers: [this.registry],
    }));

    this.metrics.set('license_verifications_total', new prometheus.Counter({
      name: 'license_verifications_total',
      help: 'Total number of license verifications',
      labelNames: ['result'],
      registers: [this.registry],
    }));

    // System metrics
    this.metrics.set('nodejs_memory_usage_bytes', new prometheus.Gauge({
      name: 'nodejs_memory_usage_bytes',
      help: 'Node.js memory usage',
      labelNames: ['type'],
      registers: [this.registry],
    }));

    this.metrics.set('nodejs_cpu_usage_percentage', new prometheus.Gauge({
      name: 'nodejs_cpu_usage_percentage',
      help: 'Node.js CPU usage percentage',
      registers: [this.registry],
    }));

    this.metrics.set('nodejs_event_loop_lag_seconds', new prometheus.Gauge({
      name: 'nodejs_event_loop_lag_seconds',
      help: 'Node.js event loop lag in seconds',
      registers: [this.registry],
    }));

    // Discord bot metrics
    this.metrics.set('discord_bot_guilds_total', new prometheus.Gauge({
      name: 'discord_bot_guilds_total',
      help: 'Total number of Discord guilds',
      registers: [this.registry],
    }));

    this.metrics.set('discord_bot_commands_executed_total', new prometheus.Counter({
      name: 'discord_bot_commands_executed_total',
      help: 'Total number of Discord commands executed',
      labelNames: ['command', 'status'],
      registers: [this.registry],
    }));

    this.metrics.set('discord_api_latency_seconds', new prometheus.Gauge({
      name: 'discord_api_latency_seconds',
      help: 'Discord API latency in seconds',
      registers: [this.registry],
    }));

    // Default metrics (CPU, memory, etc.)
    prometheus.collectDefaultMetrics({ register: this.registry });
  }

  private startCollecting() {
    // Collect system metrics every 10 seconds
    setInterval(() => {
      this.collectSystemMetrics();
      this.collectEventLoopLag();
    }, 10000);
  }

  private collectSystemMetrics() {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    (this.metrics.get('nodejs_memory_usage_bytes') as prometheus.Gauge)
      .labels('rss').set(memoryUsage.rss);
    (this.metrics.get('nodejs_memory_usage_bytes') as prometheus.Gauge)
      .labels('heapTotal').set(memoryUsage.heapTotal);
    (this.metrics.get('nodejs_memory_usage_bytes') as prometheus.Gauge)
      .labels('heapUsed').set(memoryUsage.heapUsed);
    (this.metrics.get('nodejs_memory_usage_bytes') as prometheus.Gauge)
      .labels('external').set(memoryUsage.external);

    // Calculate CPU percentage
    const cpuPercent = (cpuUsage.user + cpuUsage.system) / 1000000 / os.cpus().length;
    (this.metrics.get('nodejs_cpu_usage_percentage') as prometheus.Gauge)
      .set(cpuPercent);
  }

  private collectEventLoopLag() {
    const start = process.hrtime();
    setImmediate(() => {
      const delta = process.hrtime(start);
      const lagSeconds = delta[0] + delta[1] / 1e9;
      (this.metrics.get('nodejs_event_loop_lag_seconds') as prometheus.Gauge)
        .set(lagSeconds);
    });
  }

  // Public methods for recording metrics
  recordHttpRequest(method: string, path: string, status: number, duration: number) {
    (this.metrics.get('http_requests_total') as prometheus.Counter)
      .labels(method, path, status.toString()).inc();
    (this.metrics.get('http_request_duration_seconds') as prometheus.Histogram)
      .labels(method, path, status.toString()).observe(duration / 1000);
  }

  recordDatabaseQuery(operation: string, table: string, duration: number) {
    (this.metrics.get('db_query_duration_seconds') as prometheus.Histogram)
      .labels(operation, table).observe(duration / 1000);
  }

  recordCacheHit(cacheType: string) {
    (this.metrics.get('cache_hits_total') as prometheus.Counter)
      .labels(cacheType).inc();
  }

  recordCacheMiss(cacheType: string) {
    (this.metrics.get('cache_misses_total') as prometheus.Counter)
      .labels(cacheType).inc();
  }

  recordLicenseCreation(type: string) {
    (this.metrics.get('licenses_created_total') as prometheus.Counter)
      .labels(type).inc();
  }

  recordLicenseActivation(type: string, status: 'success' | 'failure') {
    (this.metrics.get('license_activations_total') as prometheus.Counter)
      .labels(type, status).inc();
  }

  recordLicenseVerification(result: 'valid' | 'invalid') {
    (this.metrics.get('license_verifications_total') as prometheus.Counter)
      .labels(result).inc();
  }

  recordDiscordCommand(command: string, status: 'success' | 'failure') {
    (this.metrics.get('discord_bot_commands_executed_total') as prometheus.Counter)
      .labels(command, status).inc();
  }

  setDiscordGuildCount(count: number) {
    (this.metrics.get('discord_bot_guilds_total') as prometheus.Gauge).set(count);
  }

  setDiscordApiLatency(latency: number) {
    (this.metrics.get('discord_api_latency_seconds') as prometheus.Gauge).set(latency);
  }

  getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  getContentType(): string {
    return this.registry.contentType;
  }
}

/**
 * Performance tracking decorator
 */
export function TrackPerformance(operation: string = 'unknown') {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const start = Date.now();
      const logger = new Logger(`${target.constructor.name}.${propertyKey}`);

      try {
        const result = await originalMethod.apply(this, args);
        const duration = Date.now() - start;

        if (duration > 1000) {
          logger.warn(`Slow operation '${operation}' took ${duration}ms`);
        }

        return result;
      } catch (error) {
        const duration = Date.now() - start;
        logger.error(`Operation '${operation}' failed after ${duration}ms`, error);
        throw error;
      }
    };

    return descriptor;
  };
}

/**
 * Memory leak detector
 */
export class MemoryLeakDetector {
  private readonly logger = new Logger(MemoryLeakDetector.name);
  private readonly snapshots: Array<{ time: Date; memory: NodeJS.MemoryUsage }> = [];
  private readonly maxSnapshots = 100;
  private readonly threshold = 100 * 1024 * 1024; // 100MB

  start() {
    setInterval(() => {
      this.checkMemory();
    }, 60000); // Check every minute
  }

  private checkMemory() {
    const memory = process.memoryUsage();
    this.snapshots.push({ time: new Date(), memory });

    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }

    if (this.snapshots.length >= 10) {
      const trend = this.calculateTrend();

      if (trend > this.threshold) {
        this.logger.warn(`Potential memory leak detected. Heap growth: ${(trend / 1024 / 1024).toFixed(2)}MB over last 10 minutes`);

        // Force garbage collection if available
        if (global.gc) {
          global.gc();
          this.logger.info('Forced garbage collection');
        }
      }
    }
  }

  private calculateTrend(): number {
    if (this.snapshots.length < 2) return 0;

    const first = this.snapshots[0].memory.heapUsed;
    const last = this.snapshots[this.snapshots.length - 1].memory.heapUsed;

    return last - first;
  }
}