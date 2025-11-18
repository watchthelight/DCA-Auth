/**
 * Database Seed Functions
 *
 * Provides functions to populate the database with initial/test data
 * for development and testing purposes.
 */

import { hash } from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from './client.js';
import { logger } from '../logging/logger.js';

// Seed data constants
const SALT_ROUNDS = 10;
const DEFAULT_PASSWORD = 'DemoPassword123!';

/**
 * Create demo users
 */
async function seedUsers() {
  logger.info('Seeding users...');

  // Hash the default password
  const passwordHash = await hash(DEFAULT_PASSWORD, SALT_ROUNDS);

  // Create super admin user
  const superAdmin = await prisma.user.upsert({
    where: { discordId: '123456789012345678' },
    update: {},
    create: {
      id: uuidv4(),
      discordId: '123456789012345678',
      username: 'superadmin',
      discriminator: '0001',
      email: 'admin@dcaauth.local',
      avatarHash: 'default_avatar',
      status: 'ACTIVE',
      roles: ['SUPER_ADMIN'],
      isEmailVerified: true,
      passwordHash,
      emailVerifiedAt: new Date(),
      lastLoginAt: new Date(),
      metadata: {
        source: 'seed',
        environment: 'development',
      },
      preferences: {
        theme: 'dark',
        notifications: true,
      },
      profile: {
        create: {
          globalName: 'Super Admin',
          bio: 'System administrator with full access',
          timezone: 'America/New_York',
          language: 'en',
          emailNotifications: true,
          discordNotifications: true,
          licenseExpireNotifications: true,
        },
      },
    },
  });

  // Create admin, moderator, premium and regular users
  const admin = await prisma.user.upsert({
    where: { discordId: '234567890123456789' },
    update: {},
    create: {
      id: uuidv4(),
      discordId: '234567890123456789',
      username: 'admin',
      discriminator: '0002',
      email: 'admin2@dcaauth.local',
      avatarHash: 'admin_avatar',
      status: 'ACTIVE',
      roles: ['ADMIN'],
      isEmailVerified: true,
      passwordHash,
      emailVerifiedAt: new Date(),
      lastLoginAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      metadata: {
        source: 'seed',
        environment: 'development',
      },
      profile: {
        create: {
          globalName: 'Administrator',
          bio: 'System administrator',
          timezone: 'America/Los_Angeles',
          language: 'en',
          emailNotifications: true,
          discordNotifications: true,
          licenseExpireNotifications: true,
        },
      },
    },
  });

  logger.info('Users seeded successfully');
  return {
    superAdmin,
    admin,
  };
}

/**
 * Create demo sessions
 */
async function seedSessions(users: any) {
  logger.info('Seeding sessions...');

  const sessions = [];

  // Create active sessions for active users
  for (const user of [users.superAdmin, users.admin]) {
    const session = await prisma.session.create({
      data: {
        id: uuidv4(),
        userId: user.id,
        refreshToken: `refresh_${user.username}_${uuidv4()}`,
        accessTokenHash: `hash_${user.username}_${uuidv4()}`,
        tokenFamily: uuidv4(),
        status: 'ACTIVE',
        deviceName: 'Chrome on Windows',
        deviceType: 'desktop',
        deviceInfo: {
          browser: 'Chrome',
          browserVersion: '120.0',
          os: 'Windows',
          osVersion: '11',
        },
        ipAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0',
        location: 'New York, US',
        fingerprint: `fp_${user.username}_desktop`,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
        lastActivityAt: new Date(),
      },
    });
    sessions.push(session);
  }

  logger.info('Sessions seeded successfully');
  return sessions;
}

/**
 * Create demo audit logs
 */
async function seedAuditLogs(users: any) {
  logger.info('Seeding audit logs...');

  const auditLogs = [];
  const now = Date.now();

  // Login success logs
  for (const user of [users.superAdmin, users.admin]) {
    const log = await prisma.auditLog.create({
      data: {
        id: uuidv4(),
        userId: user.id,
        action: 'LOGIN_SUCCESS',
        category: 'authentication',
        entityType: 'user',
        entityId: user.id,
        details: {
          method: 'password',
          provider: 'local',
          deviceType: 'desktop',
        },
        ipAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0',
        serviceName: 'api',
        environment: 'development',
        createdAt: new Date(now - Math.random() * 7 * 24 * 60 * 60 * 1000),
      },
    });
    auditLogs.push(log);
  }

  logger.info('Audit logs seeded successfully');
  return auditLogs;
}

/**
 * Seeds initial system health check data
 */
export async function seedSystemHealth(): Promise<void> {
  logger.info('Seeding system health records...');

  const healthRecords = [];
  const components = ['database', 'redis', 'discord', 'api'];
  const statuses = ['healthy', 'healthy', 'healthy', 'degraded'];

  for (let i = 0; i < components.length; i++) {
    const record = await prisma.systemHealth.create({
      data: {
        id: uuidv4(),
        component: components[i],
        status: statuses[i],
        message: statuses[i] === 'healthy'
          ? `${components[i]} is operating normally`
          : `${components[i]} experiencing minor issues`,
        responseTime: Math.floor(Math.random() * 100) + 10,
        details: {
          version: '1.0.0',
          uptime: Math.floor(Math.random() * 86400),
          lastCheck: new Date(),
        },
      },
    });
    healthRecords.push(record);
  }

  logger.info('System health records seeded successfully');
  return healthRecords;
}

/**
 * Clears all data from the database (use with caution!)
 */
export async function clearDatabase(): Promise<void> {
  logger.warn('Clearing all database data...');

  await prisma.systemHealth.deleteMany();
  await prisma.securityEvent.deleteMany();
  await prisma.loginAttempt.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.session.deleteMany();
  await prisma.userProfile.deleteMany();
  await prisma.user.deleteMany();

  logger.info('Database cleared');
}

/**
 * Main seed function - orchestrates all seeding operations
 */
export async function seed(): Promise<void> {
  logger.info('Starting database seed...');

  try {
    // Clear existing data
    await clearDatabase();

    // Seed data
    const users = await seedUsers();
    const sessions = await seedSessions(users);
    const auditLogs = await seedAuditLogs(users);
    await seedSystemHealth();

    // Summary
    logger.info('\nSeed Summary:');
    logger.info(`   - Users: ${Object.values(users).length}`);
    logger.info(`   - Sessions: ${sessions.length}`);
    logger.info(`   - Audit Logs: ${auditLogs.length}`);
    logger.info(`   - System Health: 4 components`);

    logger.info('\nDatabase seeding completed successfully!');
    logger.info('\nTest Credentials:');
    logger.info('   Email: admin@dcaauth.local');
    logger.info('   Password: DemoPassword123!');
  } catch (error) {
    logger.error('Error seeding database:', error);
    throw error;
  }
}
