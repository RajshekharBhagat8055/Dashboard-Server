import mongoose, { Document, Schema, Model } from "mongoose";

// Item interfaces for purchases and sales
export interface PurchasedItem {
  name: string;
  cost: number;
  timestamp: string;
  rarity?: string | number; // Accept both String ("Common") or Number (1)
  edition?: string;
  item_type?: string;
}

export interface SoldItem {
  name: string;
  sale_price: number;
  timestamp: string;
  rarity?: string | number; // Accept both String ("Common") or Number (1)
  edition?: string;
  item_type?: string;
  rank?: string;
  suit?: string;
  enhancement?: string;
}

// Money transactions breakdown interface
export interface MoneyTransactionsBreakdown {
  spent_on: {
    joker: number;
    consumable: number;
    booster: number;
    voucher: number;
    reroll: number;
  };
  earned_from: {
    joker: number;
    consumable: number;
    round_win: number;
  };
  items_purchased: {
    jokers: PurchasedItem[];
    consumables: PurchasedItem[];
    boosters: PurchasedItem[];
    vouchers: PurchasedItem[];
  };
  items_sold: {
    jokers: SoldItem[];
    consumables: SoldItem[];
  };
}

// Main game session interface
export interface IGameSession extends Document {
  // Session identification
  session_id: number;
  machine_id: string;
  run_number: number;

  // Timing (human-readable format: "2024-12-25 14:30:56")
  start_time: string;
  end_time: string;
  time_spent_readable: string; // e.g., "7m 13s"

  // Money tracking
  money_deposited: number; // Total money deposited by player (machine receives)
  starting_money: number; // Initial in-game credits (same as money_deposited in pay-to-play)
  current_money: number;
  money_spent: number;
  money_earned: number;
  money_claimed: number; // Amount actually claimed via cashout (machine pays out)
  session_net_profit: number; // Machine profit: money_deposited - money_claimed
  money_transactions_breakdown: MoneyTransactionsBreakdown;

  // Round-by-round data
  rounds: any[]; // Simplified to just array
  rounds_completed: number;

  // Performance metrics
  max_ante_reached: number;
  final_score: number;
  total_hands_played: number;

  // Session outcome
  outcome: 'incomplete' | 'win' | 'loss' | 'cash_out' | 'abandoned' | 'new_run';

  // Sync metadata
  synced_at: Date;

  // Client info (optional)
  client_version: string;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;

  // Virtual
  duration_display: string;

  // Methods
  getSummary(): GameSessionSummary;
}

// Static methods interface
export interface IGameSessionModel extends Model<IGameSession> {
  getStats(machineId?: string | null): Promise<GameStats[]>;
}

// Summary interface for getSummary method
export interface GameSessionSummary {
  session_id: number;
  machine_id: string;
  run_number: number;
  outcome: string;
  final_score: number;
  max_ante: number;
  rounds: number;
  duration: string;
  machine_profit: number;
}

// Stats interface for getStats static method
export interface GameStats {
  _id: string;
  count: number;
  avg_score: number;
  max_score: number;
  avg_ante: number;
}

const GameSessionSchema = new mongoose.Schema<IGameSession>({
  // Session identification
  session_id: {
    type: Number,
    required: true,
    unique: true,
    index: true
  },
  machine_id: {
    type: String,
    required: true,
    default: "arcade_001",
    index: true
  },
  run_number: {
    type: Number,
    default: 0,
    index: true
  },

  // Timing (human-readable format: "2024-12-25 14:30:56")
  start_time: {
    type: String,
    required: true
  },
  end_time: {
    type: String,
    default: ""
  },
  time_spent_readable: {
    type: String,
    default: ""  // e.g., "7m 13s"
  },

  // Money tracking
  money_deposited: {
    type: Number,
    default: 0  // Total money deposited by player (machine receives)
  },
  starting_money: {
    type: Number,
    default: 0  // Initial in-game credits (same as money_deposited in pay-to-play)
  },
  current_money: {
    type: Number,
    default: 0
  },
  money_spent: {
    type: Number,
    default: 0
  },
  money_earned: {
    type: Number,
    default: 0
  },
  money_claimed: {
    type: Number,
    default: 0  // Amount actually claimed via cashout (machine pays out)
  },
  session_net_profit: {
    type: Number,
    default: 0  // Machine profit: money_deposited - money_claimed
  },
  money_transactions_breakdown: {
    spent_on: {
      joker: { type: Number, default: 0 },
      consumable: { type: Number, default: 0 },
      booster: { type: Number, default: 0 },
      voucher: { type: Number, default: 0 },
      reroll: { type: Number, default: 0 }
    },
    earned_from: {
      joker: { type: Number, default: 0 },
      consumable: { type: Number, default: 0 },
      round_win: { type: Number, default: 0 }
    },
    items_purchased: {
      jokers: [{
        name: String,
        cost: Number,
        rarity: mongoose.Schema.Types.Mixed,  // Accept both String ("Common") or Number (1)
        edition: String,
        timestamp: String
      }],
      consumables: [{
        name: String,
        cost: Number,
        item_type: String,
        timestamp: String
      }],
      boosters: [{
        name: String,
        cost: Number,
        timestamp: String
      }],
      vouchers: [{
        name: String,
        cost: Number,
        timestamp: String
      }]
    },
    items_sold: {
      jokers: [{
        name: String,
        sale_price: Number,
        rarity: mongoose.Schema.Types.Mixed,  // Accept both String ("Common") or Number (1)
        edition: String,
        timestamp: String
      }],
      consumables: [{
        name: String,
        sale_price: Number,
        item_type: String,
        timestamp: String
      }]
    }
  },

  // Round-by-round data
  rounds: [{
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }],
  rounds_completed: {
    type: Number,
    default: 0
  },

  // Performance metrics
  max_ante_reached: {
    type: Number,
    default: 1
  },
  final_score: {
    type: Number,
    default: 0
  },
  total_hands_played: {
    type: Number,
    default: 0
  },

  // Session outcome
  outcome: {
    type: String,
    default: "incomplete",
    enum: ["incomplete", "win", "loss", "cash_out", "abandoned", "new_run"]
  },

  // Sync metadata
  synced_at: {
    type: Date,
    default: Date.now
  },

  // Client info (optional)
  client_version: {
    type: String,
    default: "1.0.0"
  }
}, {
  timestamps: true,  // Adds createdAt and updatedAt
  collection: 'game_sessions'
});

// Indexes for efficient queries
GameSessionSchema.index({ machine_id: 1, start_time: -1 });
GameSessionSchema.index({ outcome: 1 });
GameSessionSchema.index({ synced_at: -1 });

// Virtual for session duration (computed field)
// Note: time_spent_readable is a string like "7m 13s", not seconds
GameSessionSchema.virtual('duration_display').get(function(this: IGameSession): string {
  return this.time_spent_readable || "0m 0s";
});

// Method to get session summary
GameSessionSchema.methods.getSummary = function(this: IGameSession): GameSessionSummary {
  return {
    session_id: this.session_id,
    machine_id: this.machine_id,
    run_number: this.run_number,
    outcome: this.outcome,
    final_score: this.final_score,
    max_ante: this.max_ante_reached,
    rounds: this.rounds_completed,
    duration: this.time_spent_readable,
    machine_profit: this.session_net_profit
  };
};

// Static method to get statistics
GameSessionSchema.statics.getStats = async function(machineId: string | null = null): Promise<GameStats[]> {
  const match = machineId ? { machine_id: machineId } : {};

  return await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$outcome',
        count: { $sum: 1 },
        avg_score: { $avg: '$final_score' },
        max_score: { $max: '$final_score' },
        avg_ante: { $avg: '$max_ante_reached' }
      }
    }
  ]);
};

// Create and export the model with proper typing
const GameSession: IGameSessionModel = mongoose.model<IGameSession, IGameSessionModel>('GameSession', GameSessionSchema);

export default GameSession;
