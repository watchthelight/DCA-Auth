/**
 * Prisma Client Singleton
 *
 * Implements a singleton pattern for the Prisma client to prevent
 * multiple instances in development with hot reloading.
 */

import { PrismaClient } from '@prisma/client';

import { env } from '../config/env.js';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

/**
 * Creates a new Prisma client instance with appropriate logging configuration
 */
const prismaClientSingleton = (): PrismaClient => {
  return new PrismaClient({
    log: env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    datasources: {
      db: {
        url: env.DATABASE_URL,
      },
    },
  });
};

/**
 * Singleton Prisma client instance
 * In development, this is attached to globalThis to survive hot reloads
 */
export const prisma = globalThis.prisma ?? prismaClientSingleton();

if (env.NODE_ENV !== 'production') {
  globalThis.prisma = prisma;
}

/**
 * Graceful shutdown handler
 * Ensures database connections are properly closed before process exit
 */
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

export default prisma;
