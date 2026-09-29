/**
 * Ensure Mongo indexes used by admin report / game-history queries.
 *
 * Run: npx ts-node src/scripts/ensureReportIndexes.ts
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

async function ensureIndex(
  collection: mongoose.mongo.Collection,
  key: Record<string, 1 | -1>,
  name: string,
): Promise<void> {
  const existing = await collection.indexes();
  if (existing.some((idx) => idx.name === name)) {
    console.log(`  ✓ ${name} already exists`);
    return;
  }
  console.log(`  + creating ${name} ${JSON.stringify(key)}`);
  await collection.createIndex(key, { name, background: true });
  console.log(`  ✓ ${name} created`);
}

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI required');

  const skillDbName = process.env.SKILL_GAME_DB_NAME || process.env.DB_NAME || 'SkillGameDB';
  const adminDbName = process.env.DB_NAME || process.env.ADMIN_DB_NAME || 'ArkaAdmin';

  await mongoose.connect(uri);
  console.log('Connected\n');

  const skillDb = mongoose.connection.useDb(skillDbName, { useCache: true });
  const tickets = skillDb.collection('tickets');
  const results = skillDb.collection('results');
  const transactions = skillDb.collection('transactions');

  console.log(`SkillGameDB (${skillDbName})`);
  await ensureIndex(tickets, { drawDate: 1, createdAt: -1 }, 'drawDate_1_createdAt_-1');
  await ensureIndex(tickets, { userId: 1, drawDate: 1, createdAt: -1 }, 'userId_1_drawDate_1_createdAt_-1');
  await ensureIndex(tickets, { username: 1, createdAt: -1 }, 'username_1_createdAt_-1');
  await ensureIndex(results, { isPublished: 1, timeSlot: -1 }, 'isPublished_1_timeSlot_-1');
  await ensureIndex(results, { date: 1, time: 1 }, 'date_1_time_1');
  await ensureIndex(transactions, { createdAt: -1 }, 'createdAt_-1');

  const arkaDb = mongoose.connection.useDb(adminDbName, { useCache: true });
  const users = arkaDb.collection('users');
  console.log(`\nAdmin DB (${adminDbName})`);
  await ensureIndex(users, { role: 1 }, 'role_1');
  await ensureIndex(users, { distributorId: 1 }, 'distributorId_1');
  await ensureIndex(users, { superDistributorId: 1 }, 'superDistributorId_1');
  await ensureIndex(users, { retailerId: 1 }, 'retailerId_1');

  await mongoose.disconnect();
  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
