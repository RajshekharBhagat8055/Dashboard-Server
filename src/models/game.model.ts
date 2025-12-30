import mongoose, { Document, Schema, Model } from "mongoose";

export interface IGameSession extends Document {
  // Core session identification
  session_id: number;
  machine_id: string;

  // Session timing
  start_time: number;
  end_time: number;
  time_spent_seconds: number;

  // Money tracking
  starting_money: number;
  current_money: number;
  money_spent: number;

  // Round-by-round data (comprehensive tracking)
  rounds: any[];
  rounds_completed: number;

  // Purchases and sales
  purchases: any[];
  sales: any[];

  // Hand progression
  hand_levels: Map<string, number>;
  max_hand_level: number;

  // Joker data
  joker_levels: Map<string, number>;
  joker_abilities_used: any[];
  joker_purchased: any[];
  joker_sold: any[];

  // Ante/blind progression
  ante_progression: any[];
  max_ante_reached: number;

  // Scoring
  max_score: number;
  final_score: number;
  average_score_per_round: number;

  // Card actions
  cards_played: any[];
  cards_discarded: any[];
  cards_purchased: any[];
  cards_sold: any[];

  // Consumables
  tarots_used: any[];
  planets_used: any[];
  boosters_opened: any[];

  // Run metadata
  run_number: number;
  outcome: 'incomplete' | 'in_progress' | 'victory' | 'defeat';

  // Play statistics
  total_hands_played: number;
  total_discards_used: number;

  // Sync metadata
  synced_at: Date;

  // Client info (optional)
  client_version: string;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;

  // Virtual
  duration_minutes: number;

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
  duration_minutes: string;
}

// Stats interface for getStats static method
export interface GameStats {
  _id: string;
  count: number;
  avg_score: number;
  max_score: number;
  avg_ante: number;
}

const GameSessionSchema = new Schema({
  // Core session identification
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

  // Session timing
  start_time: {
    type: Number,
    required: true
  },
  end_time: {
    type: Number,
    default: 0
  },
  time_spent_seconds: {
    type: Number,
    default: 0
  },

  // Money tracking
  starting_money: {
    type: Number,
    default: 0
  },
  current_money: {
    type: Number,
    default: 0
  },
  money_spent: {
    type: Number,
    default: 0
  },

  // Round-by-round data (comprehensive tracking)
  rounds: {
    type: Array,
    default: []
  },
  rounds_completed: {
    type: Number,
    default: 0
  },

  // Purchases and sales
  purchases: {
    type: Array,
    default: []
  },
  sales: {
    type: Array,
    default: []
  },

  // Hand progression
  hand_levels: {
    type: Map,
    of: Number,
    default: {}
  },
  max_hand_level: {
    type: Number,
    default: 0
  },

  // Joker data
  joker_levels: {
    type: Map,
    of: Number,
    default: {}
  },
  joker_abilities_used: {
    type: Array,
    default: []
  },
  joker_purchased: {
    type: Array,
    default: []
  },
  joker_sold: {
    type: Array,
    default: []
  },

  // Ante/blind progression
  ante_progression: {
    type: Array,
    default: []
  },
  max_ante_reached: {
    type: Number,
    default: 1
  },

  // Scoring
  max_score: {
    type: Number,
    default: 0
  },
  final_score: {
    type: Number,
    default: 0
  },
  average_score_per_round: {
    type: Number,
    default: 0
  },

  // Card actions
  cards_played: {
    type: Array,
    default: []
  },
  cards_discarded: {
    type: Array,
    default: []
  },
  cards_purchased: {
    type: Array,
    default: []
  },
  cards_sold: {
    type: Array,
    default: []
  },

  // Consumables
  tarots_used: {
    type: Array,
    default: []
  },
  planets_used: {
    type: Array,
    default: []
  },
  boosters_opened: {
    type: Array,
    default: []
  },

  // Run metadata
  run_number: {
    type: Number,
    default: 0,
    index: true
  },
  outcome: {
    type: String,
    default: "incomplete",
    enum: ["incomplete", "in_progress", "victory", "defeat"]
  },

  // Play statistics
  total_hands_played: {
    type: Number,
    default: 0
  },
  total_discards_used: {
    type: Number,
    default: 0
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

// Virtual for session duration (computed field)
GameSessionSchema.virtual('duration_minutes').get(function(this: IGameSession): number {
  if (this.time_spent_seconds > 0) {
    return Number((this.time_spent_seconds / 60).toFixed(2));
  }
  return 0;
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
    duration_minutes: (this as any).duration_minutes?.toString() || '0'
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

// Indexes for efficient queries
GameSessionSchema.index({ machine_id: 1, start_time: -1 });
GameSessionSchema.index({ outcome: 1 });
GameSessionSchema.index({ synced_at: -1 });

// Virtual for session duration (computed field)
GameSessionSchema.virtual('duration_minutes').get(function() {
  if (this.time_spent_seconds > 0) {
    return (this.time_spent_seconds / 60).toFixed(2);
  }
  return 0;
});

// Method to get session summary
GameSessionSchema.methods.getSummary = function() {
  return {
    session_id: this.session_id,
    machine_id: this.machine_id,
    run_number: this.run_number,
    outcome: this.outcome,
    final_score: this.final_score,
    max_ante: this.max_ante_reached,
    rounds: this.rounds_completed,
    duration_minutes: this.duration_minutes
  };
};

// Static method to get statistics
GameSessionSchema.statics.getStats = async function(machineId = null) {
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
