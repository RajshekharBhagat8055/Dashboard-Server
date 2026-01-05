import mongoose, { Document, Schema, Model } from "mongoose";

// Money transaction interface
export interface MoneyTransaction {
  timestamp: string;
  amount: number;
  type: 'earned' | 'spent' | 'purchase' | 'sale';
  money_before: number;
  reason: string;
  details: {
    item_name?: string;
    item_type?: string;
  };
}

// Card sold detailed interface
export interface CardSoldDetailed {
  card_name: string;
  enhancement?: string;
  edition?: string;
  sale_price: number;
  timestamp: string;
}

// Consumable effect interface
export interface ConsumableEffect {
  consumable_type: 'tarot' | 'planet' | 'spectral';
  consumable_name: string;
  effect_type: 'joker_added' | 'card_enhanced' | 'card_added' | 'buff_applied';
  effect_details: any;
  timestamp: string;
}

// Booster selection interface
export interface BoosterSelection {
  booster_type: string;
  cards_obtained: any[];
  metadata: any;
  selections_made: any;
  timestamp: string;
}

// Ante progression interface
export interface AnteProgressionEntry {
  ante: number;
  blind_name: string;
  blind_type: string;
  round: number;
  timestamp: string;
}

// Card action interface (for actions within rounds)
export interface CardAction {
  action: 'played' | 'discarded';
  card_id: string;
  hand_name: string;
  position: number;
  score_contribution: number;
  timestamp: string;
}

// Round interface
export interface Round {
  ante: number;
  blind_name: string;
  blind_type: string;
  round_number: number;
  start_time: string;
  end_time: string;
  starting_money: number;
  ending_money: number;
  score_earned: number;
  hands_played: number;
  discards_used: number;
  completed: boolean;
  victory: boolean;
  cards_played: CardAction[];
  cards_discarded: CardAction[];
  boosters_opened: any[];
  purchases: any[];
  sales: any[];
  consumables_used: any[];
  joker_abilities: any[];
}

// Main game session interface
export interface IGameSession extends Document {
  // Core session identification
  session_id: number;
  machine_id: string;

  // Session timing (human-readable format: "2024-12-25 14:30:56")
  start_time: string;
  end_time: string;
  time_spent_readable: string; // e.g., "7m 13s", "1h 23m 45s"

  // Money tracking
  starting_money: number;
  current_money: number;
  money_spent: number;
  money_earned: number;
  money_transactions: MoneyTransaction[]; // Detailed log of all money changes with timestamps

  // Arcade business tracking
  initial_credit: number;        // Amount user paid to start playing ($)
  payout_amount: number;         // Amount returned to user at checkout ($)
  arcade_profit: number;         // initial_credit - payout_amount

  // Round-by-round data (comprehensive tracking)
  rounds: Round[];
  rounds_completed: number;

  // Purchases and sales
  purchases: any[];
  sales: any[];

  // Hand progression
  hand_levels: Record<string, number>;
  max_hand_level: number;

  // Joker data
  joker_levels: Record<string, number>;
  joker_abilities_used: any[];
  joker_purchased: any[];
  joker_sold: any[];

  // Ante/blind progression
  ante_progression: AnteProgressionEntry[];
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
  cards_sold_detailed: CardSoldDetailed[]; // Detailed info about sold cards

  // Consumables
  tarots_used: any[];
  planets_used: any[];
  consumable_effects: ConsumableEffect[]; // Detailed effects from consumables
  boosters_opened: any[];
  booster_selections: BoosterSelection[]; // Detailed selections from booster packs

  // Run metadata
  run_number: number;
  outcome: 'incomplete' | 'in_progress' | 'victory' | 'defeat' | 'abandoned';

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

const GameSessionSchema = new Schema<IGameSession>({
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

  // Session timing (human-readable format: "2024-12-25 14:30:56")
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
    default: ""  // e.g., "7m 13s", "1h 23m 45s"
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
  money_earned: {
    type: Number,
    default: 0
  },
  money_transactions: {
    type: [Object],
    default: []  // Detailed log of all money changes with timestamps
  },

  // Arcade business tracking
  initial_credit: {
    type: Number,
    default: 0  // Amount user paid to start playing ($)
  },
  payout_amount: {
    type: Number,
    default: 0  // Amount returned to user at checkout ($)
  },
  arcade_profit: {
    type: Number,
    default: 0  // initial_credit - payout_amount
  },

  // Round-by-round data (comprehensive tracking)
  rounds: {
    type: [Object],
    default: []
  },
  rounds_completed: {
    type: Number,
    default: 0
  },

  // Purchases and sales
  purchases: {
    type: [Object],
    default: []
  },
  sales: {
    type: [Object],
    default: []
  },

  // Hand progression
  hand_levels: {
    type: Object,
    default: {}
  },
  max_hand_level: {
    type: Number,
    default: 0
  },

  // Joker data
  joker_levels: {
    type: Object,
    default: {}
  },
  joker_abilities_used: {
    type: [Object],
    default: []
  },
  joker_purchased: {
    type: [Object],
    default: []
  },
  joker_sold: {
    type: [Object],
    default: []
  },

  // Ante/blind progression
  ante_progression: {
    type: [Object],
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
    type: [Object],
    default: []
  },
  cards_discarded: {
    type: [Object],
    default: []
  },
  cards_purchased: {
    type: [Object],
    default: []
  },
  cards_sold: {
    type: [Object],
    default: []
  },
  cards_sold_detailed: {
    type: [Object],
    default: []  // Detailed info about sold cards (enhancement, edition, sale price, etc.)
  },

  // Consumables
  tarots_used: {
    type: [Object],
    default: []
  },
  planets_used: {
    type: [Object],
    default: []
  },
  consumable_effects: {
    type: [Object],
    default: []  // Detailed effects from consumables (added jokers, cards, buffs)
  },
  boosters_opened: {
    type: [Object],
    default: []
  },
  booster_selections: {
    type: [Object],
    default: []  // Detailed selections from booster packs
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
    enum: ["incomplete", "in_progress", "victory", "defeat", "abandoned"]
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
  if (this.time_spent_readable) {
    // Parse readable time format like "7m 13s" or "1h 23m 45s"
    const timeMatch = this.time_spent_readable.match(/(\d+)h\s*(\d+)m\s*(\d+)s|(\d+)m\s*(\d+)s|(\d+)s/);
    if (timeMatch) {
      let hours = 0, minutes = 0, seconds = 0;

      if (timeMatch[1] && timeMatch[2] && timeMatch[3]) {
        // Format: "1h 23m 45s"
        hours = parseInt(timeMatch[1]);
        minutes = parseInt(timeMatch[2]);
        seconds = parseInt(timeMatch[3]);
      } else if (timeMatch[4] && timeMatch[5]) {
        // Format: "7m 13s"
        minutes = parseInt(timeMatch[4]);
        seconds = parseInt(timeMatch[5]);
      } else if (timeMatch[6]) {
        // Format: "45s"
        seconds = parseInt(timeMatch[6]);
      }

      const totalMinutes = hours * 60 + minutes + seconds / 60;
      return Number(totalMinutes.toFixed(2));
    }
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

// Create and export the model with proper typing
const GameSession: IGameSessionModel = mongoose.model<IGameSession, IGameSessionModel>('GameSession', GameSessionSchema);

export default GameSession;
