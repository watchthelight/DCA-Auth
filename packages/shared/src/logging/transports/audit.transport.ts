/**
 * Audit Transport Configuration
 *
 * Dedicated transport for audit logging of security events,
 * administrative actions, and compliance tracking.
 */

import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { config } from '../../config/index.js';
import path from 'path';

/**
 * Audit event types
 */
export enum AuditEventType {
  // Authentication events
  USER_LOGIN = 'USER_LOGIN',
  USER_LOGOUT = 'USER_LOGOUT',
  USER_LOGIN_FAILED = 'USER_LOGIN_FAILED',
  USER_PASSWORD_RESET = 'USER_PASSWORD_RESET',
  USER_PASSWORD_CHANGED = 'USER_PASSWORD_CHANGED',
  USER_2FA_ENABLED = 'USER_2FA_ENABLED',
  USER_2FA_DISABLED = 'USER_2FA_DISABLED',

  // Authorization events
  PERMISSION_GRANTED = 'PERMISSION_GRANTED',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  ROLE_ASSIGNED = 'ROLE_ASSIGNED',
  ROLE_REVOKED = 'ROLE_REVOKED',

  // License events
  LICENSE_CREATED = 'LICENSE_CREATED',
  LICENSE_ACTIVATED = 'LICENSE_ACTIVATED',
  LICENSE_DEACTIVATED = 'LICENSE_DEACTIVATED',
  LICENSE_REVOKED = 'LICENSE_REVOKED',
  LICENSE_TRANSFERRED = 'LICENSE_TRANSFERRED',
  LICENSE_EXPIRED = 'LICENSE_EXPIRED',

  // Data events
  DATA_ACCESSED = 'DATA_ACCESSED',
  DATA_CREATED = 'DATA_CREATED',
  DATA_UPDATED = 'DATA_UPDATED',
  DATA_DELETED = 'DATA_DELETED',
  DATA_EXPORTED = 'DATA_EXPORTED',
  DATA_IMPORTED = 'DATA_IMPORTED',

  // Administrative events
  ADMIN_ACTION = 'ADMIN_ACTION',
  CONFIG_CHANGED = 'CONFIG_CHANGED',
  SYSTEM_SHUTDOWN = 'SYSTEM_SHUTDOWN',
  SYSTEM_STARTUP = 'SYSTEM_STARTUP',
  BACKUP_CREATED = 'BACKUP_CREATED',
  BACKUP_RESTORED = 'BACKUP_RESTORED',

  // Security events
  SECURITY_ALERT = 'SECURITY_ALERT',
  INTRUSION_DETECTED = 'INTRUSION_DETECTED',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',
}

/**
 * Create rotating file transport for audit logs
 */
export function auditTransport(): DailyRotateFile {
  const logDir = config.app.logging.directory || 'logs';

  return new DailyRotateFile({
    level: 'info',
    filename: path.join(logDir, 'audit-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '100m',
    maxFiles: '90d', // Keep audit logs for compliance (90 days)
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json(),
      winston.format.printf((info) => {
        // Only log audit entries
        if (info.audit) {
          return JSON.stringify({
            timestamp: info.timestamp,
            event: info.event,
            userId: info.userId,
            userEmail: info.userEmail,
            ipAddress: info.ipAddress,
            userAgent: info.userAgent,
            correlationId: info.correlationId,
            sessionId: info.sessionId,
            resource: info.resource,
            action: info.action,
            result: info.result,
            metadata: info.metadata,
            changes: info.changes,
          });
        }
        return '';
      })
    ),
  });
}

/**
 * Create transport for security audit logs
 */
export function securityAuditTransport(): DailyRotateFile {
  const logDir = config.app.logging.directory || 'logs';

  return new DailyRotateFile({
    level: 'warn',
    filename: path.join(logDir, 'security-audit-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '50m',
    maxFiles: '365d', // Keep security logs for 1 year
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json(),
      winston.format.printf((info) => {
        // Only log security audit entries
        if (info.audit && info.security) {
          return JSON.stringify({
            timestamp: info.timestamp,
            severity: info.severity || 'medium',
            event: info.event,
            threat: info.threat,
            userId: info.userId,
            ipAddress: info.ipAddress,
            geoLocation: info.geoLocation,
            deviceInfo: info.deviceInfo,
            action: info.action,
            blocked: info.blocked,
            metadata: info.metadata,
          });
        }
        return '';
      })
    ),
  });
}

/**
 * Create transport for compliance audit logs
 */
export function complianceAuditTransport(): DailyRotateFile {
  const logDir = config.app.logging.directory || 'logs';

  return new DailyRotateFile({
    level: 'info',
    filename: path.join(logDir, 'compliance-%DATE%.log'),
    datePattern: 'YYYY-MM',
    zippedArchive: true,
    maxSize: '200m',
    maxFiles: '7y', // Keep compliance logs for 7 years
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json(),
      winston.format.printf((info) => {
        // Only log compliance entries
        if (info.audit && info.compliance) {
          return JSON.stringify({
            timestamp: info.timestamp,
            event: info.event,
            regulation: info.regulation, // GDPR, CCPA, etc.
            userId: info.userId,
            dataType: info.dataType,
            purpose: info.purpose,
            lawfulBasis: info.lawfulBasis,
            consent: info.consent,
            retention: info.retention,
            metadata: info.metadata,
          });
        }
        return '';
      })
    ),
  });
}

/**
 * Create transport for access logs
 */
export function accessLogTransport(): DailyRotateFile {
  const logDir = config.app.logging.directory || 'logs';

  return new DailyRotateFile({
    level: 'info',
    filename: path.join(logDir, 'access-%DATE%.log'),
    datePattern: 'YYYY-MM-DD-HH',
    zippedArchive: true,
    maxSize: '100m',
    maxFiles: '7d',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json(),
      winston.format.printf((info) => {
        // Only log access entries
        if (info.access) {
          return JSON.stringify({
            timestamp: info.timestamp,
            method: info.method,
            path: info.path,
            statusCode: info.statusCode,
            userId: info.userId,
            ipAddress: info.ipAddress,
            userAgent: info.userAgent,
            responseTime: info.responseTime,
            correlationId: info.correlationId,
          });
        }
        return '';
      })
    ),
  });
}