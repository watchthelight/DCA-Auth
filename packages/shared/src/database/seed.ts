/**
 * Database Seed Functions
 *
 * Provides functions to populate the database with initial/test data
 * for development and testing purposes.
 */

import { prisma } from './client.js';

/**
 * Seeds initial system health check data
 */
export async function seedSystemHealth(): Promise<void> {
  console.log('Seeding system health data...');

  await prisma.systemHealth.create({
    data: {
      status: 'initialized',
    },
  });

  console.log('✓ System health data seeded');
}

/**
 * Clears all data from the database (use with caution!)
 */
export async function clearDatabase(): Promise<void> {
  console.warn('⚠️  Clearing all database data...');

  await prisma.systemHealth.deleteMany();

  console.log('✓ Database cleared');
}

/**
 * Main seed function - orchestrates all seeding operations
 */
export async function seed(): Promise<void> {
  console.log('🌱 Starting database seed...');

  try {
    await seedSystemHealth();

    console.log('✅ Database seeding completed successfully!');
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    throw error;
  }
}
