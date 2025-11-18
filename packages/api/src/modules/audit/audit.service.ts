import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../services/prisma.service';
import { RedisService } from '../../services/redis.service';

export enum AuditAction {
  // Authentication
  USER_REGISTER = 'USER_REGISTER',
  USER_LOGIN = 'USER_LOGIN',
  USER_LOGOUT = 'USER_LOGOUT',
  PASSWORD_RESET = 'PASSWORD_RESET',
  TWO_FACTOR_ENABLED = 'TWO_FACTOR_ENABLED',
  TWO_FACTOR_DISABLED = 'TWO_FACTOR_DISABLED',

  // License Management
  LICENSE_CREATE = 'LICENSE_CREATE',
  LICENSE_ACTIVATE = 'LICENSE_ACTIVATE',
  LICENSE_DEACTIVATE = 'LICENSE_DEACTIVATE',
  LICENSE_VERIFY = 'LICENSE_VERIFY',
  LICENSE_REVOKE = 'LICENSE_REVOKE',
  LICENSE_TRANSFER = 'LICENSE_TRANSFER',
  LICENSE_EXTEND = 'LICENSE_EXTEND',

  // User Management
  USER_UPDATE = 'USER_UPDATE',
  USER_DELETE = 'USER_DELETE',
  USER_ROLE_CHANGE = 'USER_ROLE_CHANGE',
  USER_BAN = 'USER_BAN',
  USER_UNBAN = 'USER_UNBAN',

  // Security Events
  SUSPICIOUS_LOGIN = 'SUSPICIOUS_LOGIN',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INVALID_LICENSE_KEY = 'INVALID_LICENSE_KEY',
  UNAUTHORIZED_ACCESS = 'UNAUTHORIZED_ACCESS',

  // Administrative
  SETTINGS_UPDATE = 'SETTINGS_UPDATE',
  WEBHOOK_CREATE = 'WEBHOOK_CREATE',
  WEBHOOK_DELETE = 'WEBHOOK_DELETE',
  DATA_EXPORT = 'DATA_EXPORT',
  DATA_IMPORT = 'DATA_IMPORT',
}

export enum AuditSeverity {
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  CRITICAL = 'CRITICAL',
}

interface AuditLogEntry {
  action: AuditAction;
  severity: AuditSeverity;
  userId?: string;
  targetId?: string;
  targetType?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
  timestamp?: Date;
}

interface AuditSearchFilters {
  userId?: string;
  action?: AuditAction;
  severity?: AuditSeverity;
  targetId?: string;
  startDate?: Date;
  endDate?: Date;
  ipAddress?: string;
  limit?: number;
  offset?: number;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  private readonly auditBuffer: AuditLogEntry[] = [];
  private readonly flushInterval = 5000; // 5 seconds
  private readonly maxBufferSize = 100;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    this.startFlushTimer();
  }

  async log(entry: AuditLogEntry): Promise<void> {
    // Add timestamp if not provided
    if (!entry.timestamp) {
      entry.timestamp = new Date();
    }

    // Determine severity if not provided
    if (!entry.severity) {
      entry.severity = this.determineSeverity(entry.action);
    }

    // Add to buffer for batch processing
    this.auditBuffer.push(entry);

    // Log critical events immediately
    if (entry.severity === AuditSeverity.CRITICAL) {
      await this.flush();
      this.notifyCriticalEvent(entry);
    }

    // Flush if buffer is full
    if (this.auditBuffer.length >= this.maxBufferSize) {
      await this.flush();
    }

    // Also store in Redis for real-time monitoring
    await this.storeInRedis(entry);
  }

  private determineSeverity(action: AuditAction): AuditSeverity {
    const criticalActions = [
      AuditAction.USER_BAN,
      AuditAction.UNAUTHORIZED_ACCESS,
      AuditAction.SUSPICIOUS_LOGIN,
    ];

    const warningActions = [
      AuditAction.RATE_LIMIT_EXCEEDED,
      AuditAction.INVALID_LICENSE_KEY,
      AuditAction.LICENSE_REVOKE,
    ];

    const errorActions = [
      AuditAction.USER_DELETE,
      AuditAction.DATA_IMPORT,
    ];

    if (criticalActions.includes(action)) return AuditSeverity.CRITICAL;
    if (warningActions.includes(action)) return AuditSeverity.WARNING;
    if (errorActions.includes(action)) return AuditSeverity.ERROR;

    return AuditSeverity.INFO;
  }

  private startFlushTimer() {
    setInterval(() => {
      if (this.auditBuffer.length > 0) {
        this.flush().catch(err => {
          this.logger.error('Failed to flush audit logs', err);
        });
      }
    }, this.flushInterval);
  }

  private async flush(): Promise<void> {
    if (this.auditBuffer.length === 0) return;

    const entries = [...this.auditBuffer];
    this.auditBuffer.length = 0;

    try {
      await this.prisma.auditLog.createMany({
        data: entries.map(entry => ({
          action: entry.action,
          severity: entry.severity,
          userId: entry.userId,
          targetId: entry.targetId,
          targetType: entry.targetType,
          ipAddress: entry.ipAddress,
          userAgent: entry.userAgent,
          metadata: entry.metadata || {},
          timestamp: entry.timestamp || new Date(),
        })),
      });

      this.logger.debug(`Flushed ${entries.length} audit log entries`);
    } catch (error) {
      this.logger.error('Failed to flush audit logs to database', error);

      // Re-add failed entries to buffer
      this.auditBuffer.unshift(...entries);
    }
  }

  private async storeInRedis(entry: AuditLogEntry): Promise<void> {
    try {
      const key = `audit:${entry.action}:${Date.now()}`;
      await this.redis.setex(
        key,
        86400, // 24 hours
        JSON.stringify(entry),
      );

      // Update counters
      await this.redis.incr(`audit:count:${entry.action}`);
      await this.redis.incr(`audit:count:${entry.severity}`);

      if (entry.userId) {
        await this.redis.incr(`audit:user:${entry.userId}:${entry.action}`);
      }
    } catch (error) {
      this.logger.error('Failed to store audit log in Redis', error);
    }
  }

  private notifyCriticalEvent(entry: AuditLogEntry) {
    // Send notification for critical events
    this.logger.warn(`CRITICAL AUDIT EVENT: ${entry.action}`, {
      userId: entry.userId,
      targetId: entry.targetId,
      ipAddress: entry.ipAddress,
      metadata: entry.metadata,
    });

    // Could also send email, Slack, Discord notification, etc.
  }

  async search(filters: AuditSearchFilters): Promise<any> {
    const where: any = {};

    if (filters.userId) {
      where.userId = filters.userId;
    }

    if (filters.action) {
      where.action = filters.action;
    }

    if (filters.severity) {
      where.severity = filters.severity;
    }

    if (filters.targetId) {
      where.targetId = filters.targetId;
    }

    if (filters.ipAddress) {
      where.ipAddress = filters.ipAddress;
    }

    if (filters.startDate || filters.endDate) {
      where.timestamp = {};
      if (filters.startDate) {
        where.timestamp.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.timestamp.lte = filters.endDate;
      }
    }

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: filters.limit || 100,
        skip: filters.offset || 0,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              username: true,
            },
          },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      logs,
      total,
      page: Math.floor((filters.offset || 0) / (filters.limit || 100)) + 1,
      pageSize: filters.limit || 100,
    };
  }

  async getStatistics(userId?: string): Promise<any> {
    const where = userId ? { userId } : {};

    const [
      totalLogs,
      bySeverity,
      byAction,
      recentCritical,
    ] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.groupBy({
        by: ['severity'],
        where,
        _count: true,
      }),
      this.prisma.auditLog.groupBy({
        by: ['action'],
        where,
        _count: true,
        orderBy: { _count: { action: 'desc' } },
        take: 10,
      }),
      this.prisma.auditLog.findMany({
        where: {
          ...where,
          severity: AuditSeverity.CRITICAL,
        },
        orderBy: { timestamp: 'desc' },
        take: 5,
      }),
    ]);

    // Get from Redis for real-time stats
    const realtimeStats = await this.getRealtimeStats();

    return {
      total: totalLogs,
      bySeverity: bySeverity.reduce((acc, item) => {
        acc[item.severity] = item._count;
        return acc;
      }, {}),
      topActions: byAction.map(item => ({
        action: item.action,
        count: item._count,
      })),
      recentCritical,
      realtime: realtimeStats,
    };
  }

  private async getRealtimeStats(): Promise<any> {
    const keys = await this.redis.keys('audit:count:*');
    const stats = {};

    for (const key of keys) {
      const value = await this.redis.get(key);
      const keyParts = key.split(':');
      const statName = keyParts[keyParts.length - 1];
      stats[statName] = parseInt(value || '0');
    }

    return stats;
  }

  async getUserActivity(userId: string, days: number = 30): Promise<any> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const logs = await this.prisma.auditLog.findMany({
      where: {
        userId,
        timestamp: { gte: startDate },
      },
      orderBy: { timestamp: 'desc' },
    });

    // Group by day
    const byDay = logs.reduce((acc, log) => {
      const day = log.timestamp.toISOString().split('T')[0];
      if (!acc[day]) {
        acc[day] = [];
      }
      acc[day].push(log);
      return acc;
    }, {});

    return {
      total: logs.length,
      byDay: Object.entries(byDay).map(([date, logs]) => ({
        date,
        count: (logs as any[]).length,
        actions: (logs as any[]).map(log => log.action),
      })),
    };
  }

  async cleanup(olderThanDays: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    // Keep critical logs for longer
    const result = await this.prisma.auditLog.deleteMany({
      where: {
        timestamp: { lt: cutoffDate },
        severity: { not: AuditSeverity.CRITICAL },
      },
    });

    this.logger.log(`Cleaned up ${result.count} old audit logs`);
    return result.count;
  }
}