/**
 * Prisma Seed Script Runner
 *
 * This script is executed when running `npm run db:seed`
 * It populates the database with initial development data.
 */

import { prisma } from '../src/database/client.js';
import { seed } from '../src/database/seed.js';

async function main(): Promise<void> {
  await seed();
}

main()
  .catch((error) => {
    console.error('Seed script failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
