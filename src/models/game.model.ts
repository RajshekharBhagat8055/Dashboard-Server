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

// Round interface for individual rounds within runs
export interface RoundData {
  round_number: number;
  ante: number;
  blind_name: string;
  blind_type: string;
  start_time: string;
  end_time: string;
  starting_money: number;
  ending_money: number;
  score_earned: number;
  target_score: number;
  hands_played: number;
  discards_used: number;
  money_earned: number;
  rerolls_count: number;
  rerolls_spent: number;
  poker_hands: Map<string, number>;
  purchases: any[];
  sales: any[];
  cards_played: any[];
  cards_discarded: any[];
  consumables_used: any[];
  boosters_opened: any[];
  joker_abilities: any[];
  completed: boolean;
  victory: boolean;
}

// Run interface for individual runs within sessions
export interface RunData {
  run_number: number;
  start_time: string;
  end_time: string;
  ante_reached: number;
  final_score: number;
  rounds_completed: number;
  outcome: "win" | "loss" | "cash_out" | "abandoned";
  rounds: RoundData[];
}

// Main game session interface
export interface IGameSession extends Document {
  // Session identification
  session_id: number;
  machine_id: string;
  run_number: number;
  schema_version: number; // v1 = flat rounds[], v2 = nested runs[].rounds[]

  // Timing (human-readable format: "2024-12-25 14:30:56")
  start_time: string;
  end_time: string;
  time_spent_readable: string; // e.g., "7m 13s"

  // Money tracking
  money_deposited: number; // Total money deposited by player (machine receives)
  starting_money: number; // Initial in-game credits (same as money_deposited in pay-to-play)
  current_money: number;
  current_balance: number; // Alias with clearer meaning; mirror of current_money for backward compatibility
  money_spent: number;
  money_earned: number;
  money_claimed: number; // Amount actually claimed via cashout (machine pays out)
  session_net_profit: number; // Machine profit: money_deposited - money_claimed
  money_transactions_breakdown: MoneyTransactionsBreakdown;

  // Multi-run tracking with nested rounds (SCHEMA v2)
  runs: RunData[];
  total_runs: number;
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
  isLegacySchema(): boolean;
  getAllRounds(): RoundData[];
  getRoundsForRun(runNumber: number): RoundData[];
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
  schema_version: {
    type: Number,
    default: 2  // v1 = flat rounds[], v2 = nested runs[].rounds[]
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
  // Alias with clearer meaning; mirror of current_money for backward compatibility
  current_balance: {
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

  // Multi-run tracking with nested rounds (SCHEMA v2)
  runs: [{
    run_number: { type: Number, required: true },
    start_time: { type: String, required: true },
    end_time: { type: String, required: true },
    ante_reached: { type: Number, default: 1 },
    final_score: { type: Number, default: 0 },
    rounds_completed: { type: Number, default: 0 },
    outcome: {
      type: String,
      enum: ["win", "loss", "cash_out", "abandoned"],
      required: true
    },

    // Nested rounds array for this specific run
    rounds: [{
      round_number: { type: Number, required: true },
      ante: { type: Number, required: true },
      blind_name: String,
      blind_type: String,
      start_time: String,
      end_time: String,
      starting_money: { type: Number, default: 0 },
      ending_money: { type: Number, default: 0 },
      score_earned: { type: Number, default: 0 },
      target_score: { type: Number, default: 0 },
      hands_played: { type: Number, default: 0 },
      discards_used: { type: Number, default: 0 },
      money_earned: { type: Number, default: 0 },
      rerolls_count: { type: Number, default: 0 },
      rerolls_spent: { type: Number, default: 0 },
      poker_hands: { type: Map, of: Number, default: {} },
      purchases: { type: Array, default: [] },
      sales: { type: Array, default: [] },
      cards_played: { type: Array, default: [] },
      cards_discarded: { type: Array, default: [] },
      consumables_used: { type: Array, default: [] },
      boosters_opened: { type: Array, default: [] },
      joker_abilities: { type: Array, default: [] },
      completed: { type: Boolean, default: false },
      victory: { type: Boolean, default: false }
    }]
  }],
  total_runs: {
    type: Number,
    default: 0
  },
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

// Backward compatibility helper methods for schema v1 vs v2
GameSessionSchema.methods.isLegacySchema = function(this: IGameSession): boolean {
  // Old schema (v1): schema_version < 2 or runs without nested rounds
  return this.schema_version < 2 ||
         (this.runs && this.runs.length > 0 && !this.runs[0].rounds);
};

GameSessionSchema.methods.getAllRounds = function(this: IGameSession): RoundData[] {
  // New schema (v2): flatten rounds from all runs
  if (this.runs && this.runs.length > 0 && this.runs[0].rounds) {
    return this.runs.flatMap(run => run.rounds || []);
  }
  // For backward compatibility, check if there's a legacy rounds field
  // This would be added dynamically for old data
  return (this as any).rounds || [];
};

GameSessionSchema.methods.getRoundsForRun = function(this: IGameSession, runNumber: number): RoundData[] {
  if (this.runs && this.runs.length > 0) {
    const run = this.runs.find(r => r.run_number === runNumber);
    return run?.rounds || [];
  }
  return [];
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
