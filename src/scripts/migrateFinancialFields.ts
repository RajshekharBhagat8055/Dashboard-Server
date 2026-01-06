import mongoose from 'mongoose';
import GameSession from '../models/game.model';
import { connectDB } from '../config/connectDB';

const migrateFinancialFields = async () => {
  try {
    // Set default MongoDB URI if not provided
    if (!process.env.MONGODB_URI) {
      process.env.MONGODB_URI = 'mongodb://localhost:27017/balatro_admin';
    }
    await connectDB();

    console.log('Starting migration of financial fields...');

    // First, let's see what documents we have
    const totalDocs = await GameSession.countDocuments();
    console.log(`Total documents in database: ${totalDocs}`);

    // Check a sample document to see current structure
    const sampleDoc = await GameSession.findOne().lean();
    console.log('Sample document structure:', Object.keys(sampleDoc || {}));

    // Update ALL documents to ensure they have financial fields
    // We'll set reasonable defaults for existing sessions
    const result = await GameSession.updateMany(
      {}, // Update ALL documents
      {
        $set: {
          starting_money: 1000,  // Default starting money for existing sessions
          money_claimed: 0,      // Default money claimed
          session_net_profit: 1000, // Default profit (starting - claimed)
          money_spent: 0,
          money_earned: 0,
          money_transactions_breakdown: {
            spent_on: {
              joker: 0,
              consumable: 0,
              booster: 0,
              voucher: 0,
              reroll: 0
            },
            earned_from: {
              joker: 0,
              consumable: 0,
              card: 0,
              round_victory: 0
            },
            items_purchased: {
              jokers: [],
              consumables: [],
              boosters: [],
              vouchers: []
            },
            items_sold: {
              jokers: [],
              consumables: [],
              cards: []
            }
          }
        }
      },
      { upsert: false } // Don't create new documents
    );

    console.log(`✅ Migration completed!`);
    console.log(`Modified ${result.modifiedCount} documents`);
    console.log(`Matched ${result.matchedCount} documents`);

    // Calculate totals after migration
    const machinesAggregation = await GameSession.aggregate([
      {
        $group: {
          _id: '$machine_id',
          total_starting_money: { $sum: '$starting_money' },
          total_money_claimed: { $sum: '$money_claimed' },
          total_session_net_profit: { $sum: '$session_net_profit' },
          total_sessions: { $sum: 1 }
        }
      }
    ]);

    console.log('Machine aggregation results:');
    machinesAggregation.forEach(machine => {
      console.log(`Machine ${machine._id}:`);
      console.log(`  Sessions: ${machine.total_sessions}`);
      console.log(`  Total Starting Money: $${machine.total_starting_money}`);
      console.log(`  Total Money Claimed: $${machine.total_money_claimed}`);
      console.log(`  Total Net Profit: $${machine.total_session_net_profit}`);
      console.log('');
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Error during migration:', error);
    process.exit(1);
  }
};

migrateFinancialFields();
