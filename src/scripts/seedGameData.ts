import mongoose from 'mongoose';
import GameSession from '../models/game.model';
import { connectDB } from '../config/connectDB';

const seedGameData = async () => {
  try {
    // Set default MongoDB URI if not provided
    if (!process.env.MONGODB_URI) {
      process.env.MONGODB_URI = 'mongodb://localhost:27017/balatro_admin';
    }
    await connectDB();

    // Clear existing data
    await GameSession.deleteMany({});

    // Create sample game sessions with the new schema
    const sampleSessions = [
      {
        session_id: 1001,
        machine_id: "arcade_001",
        run_number: 1,
        start_time: "2025-01-06 10:00:00",
        end_time: "2025-01-06 10:15:30",
        time_spent_readable: "15m 30s",
        starting_money: 1000,
        current_money: 500,
        money_spent: 300,
        money_earned: 200,
        money_claimed: 800,
        session_net_profit: 200, // 1000 - 800
        outcome: "win",
        max_ante_reached: 8,
        final_score: 15000,
        total_hands_played: 45,
        rounds_completed: 6,
        money_transactions_breakdown: {
          spent_on: { joker: 150, consumable: 100, booster: 50, voucher: 0, reroll: 0 },
          earned_from: { joker: 50, consumable: 100, card: 50, round_victory: 0 },
          items_purchased: {
            jokers: [{ name: "Joker", cost: 150, timestamp: "2025-01-06 10:05:00" }],
            consumables: [],
            boosters: [],
            vouchers: []
          },
          items_sold: {
            jokers: [],
            consumables: [],
            cards: []
          }
        },
        rounds: [
          { round_number: 1, score: 1000 },
          { round_number: 2, score: 2500 },
          { round_number: 3, score: 4000 }
        ]
      },
      {
        session_id: 1002,
        machine_id: "arcade_001",
        run_number: 2,
        start_time: "2025-01-06 11:00:00",
        end_time: "2025-01-06 11:10:15",
        time_spent_readable: "10m 15s",
        starting_money: 1000,
        current_money: 200,
        money_spent: 500,
        money_earned: 100,
        money_claimed: 300,
        session_net_profit: 700, // 1000 - 300
        outcome: "loss",
        max_ante_reached: 4,
        final_score: 5000,
        total_hands_played: 25,
        rounds_completed: 3,
        money_transactions_breakdown: {
          spent_on: { joker: 300, consumable: 150, booster: 50, voucher: 0, reroll: 0 },
          earned_from: { joker: 50, consumable: 50, card: 0, round_victory: 0 },
          items_purchased: {
            jokers: [{ name: "Another Joker", cost: 300, timestamp: "2025-01-06 11:02:00" }],
            consumables: [],
            boosters: [],
            vouchers: []
          },
          items_sold: {
            jokers: [],
            consumables: [],
            cards: []
          }
        },
        rounds: [
          { round_number: 1, score: 800 },
          { round_number: 2, score: 1200 },
          { round_number: 3, score: 2000 }
        ]
      },
      {
        session_id: 1003,
        machine_id: "arcade_002",
        run_number: 1,
        start_time: "2025-01-06 12:00:00",
        end_time: "2025-01-06 12:08:45",
        time_spent_readable: "8m 45s",
        starting_money: 1500,
        current_money: 800,
        money_spent: 400,
        money_earned: 300,
        money_claimed: 1200,
        session_net_profit: 300, // 1500 - 1200
        outcome: "cash_out",
        max_ante_reached: 6,
        final_score: 8000,
        total_hands_played: 30,
        rounds_completed: 4,
        money_transactions_breakdown: {
          spent_on: { joker: 200, consumable: 100, booster: 100, voucher: 0, reroll: 0 },
          earned_from: { joker: 100, consumable: 150, card: 50, round_victory: 0 },
          items_purchased: {
            jokers: [],
            consumables: [{ name: "Tarot Card", cost: 100, type: "tarot", timestamp: "2025-01-06 12:03:00" }],
            boosters: [],
            vouchers: []
          },
          items_sold: {
            jokers: [],
            consumables: [],
            cards: []
          }
        },
        rounds: [
          { round_number: 1, score: 1500 },
          { round_number: 2, score: 2200 }
        ]
      }
    ];

    await GameSession.insertMany(sampleSessions);
    console.log('✅ Sample game data seeded successfully!');
    console.log(`Created ${sampleSessions.length} game sessions`);

    // Calculate totals for verification
    const totalStartingMoney = sampleSessions.reduce((sum, s) => sum + s.starting_money, 0);
    const totalMoneyClaimed = sampleSessions.reduce((sum, s) => sum + s.money_claimed, 0);
    const totalNetProfit = sampleSessions.reduce((sum, s) => sum + s.session_net_profit, 0);

    console.log(`Total Starting Money: $${totalStartingMoney}`);
    console.log(`Total Money Claimed: $${totalMoneyClaimed}`);
    console.log(`Total Net Profit: $${totalNetProfit}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding game data:', error);
    process.exit(1);
  }
};

seedGameData();
