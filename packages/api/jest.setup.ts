import { PrismaClient } from '@prisma/client';
import { DeepMockProxy, mockDeep, mockReset } from 'jest-mock-extended';

// Mock Prisma Client
jest.mock('@dca-auth/shared/prisma', () => ({
  __esModule: true,
  prisma: mockDeep<PrismaClient>(),
}));

// Mock Redis
jest.mock('ioredis', () => {
  const Redis = jest.requireActual('ioredis-mock');
  return Redis;
});

// Environment variables for testing
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

// Global test utilities
global.beforeEach(() => {
  jest.clearAllMocks();
});

// Increase test timeout for CI/CD environments
jest.setTimeout(30000);