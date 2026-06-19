import mongoose, { Document, Schema, Types } from 'mongoose';

export type TicketStatus = 'result_pending' | 'win' | 'loss' | 'cancelled';

export interface ITicketItem {
  label: string;
  amount: number;
  seriesKey: string;
  seriesLetter: string;
}

export type GameType = '2d' | '3d';

export interface ITicket extends Document {
  userId: Types.ObjectId;
  username: string;
  gameId: string;
  serialNumber: number;
  barcode: string;
  drawTime: string;
  drawDate: string;
  couponTime: string;
  totalPoint: number;
  status: TicketStatus;
  claimed: boolean;
  winPoint: number;
  items: ITicketItem[];
  gameType: GameType;
  createdAt: Date;
  updatedAt: Date;
}

const ticketItemSchema = new Schema<ITicketItem>(
  {
    label: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    seriesKey: { type: String, required: true },
    seriesLetter: { type: String, required: true }
  },
  { _id: false }
);

const ticketSchema = new Schema<ITicket>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    username: { type: String, required: true },
    gameId: { type: String, required: true, index: true },
    serialNumber: { type: Number, required: true, index: true },
    barcode: { type: String, required: true, index: true },
    drawTime: { type: String, required: true },
    drawDate: { type: String, required: true },
    couponTime: { type: String, required: true },
    totalPoint: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ['result_pending', 'win', 'loss', 'cancelled'],
      default: 'result_pending'
    },
    claimed: { type: Boolean, default: false },
    winPoint: { type: Number, default: 0, min: 0 },
    items: { type: [ticketItemSchema], required: true },
    gameType: { type: String, enum: ['2d', '3d'], default: '2d' }
  },
  { timestamps: true }
);

ticketSchema.index({ userId: 1, createdAt: -1 });
ticketSchema.index({ drawDate: 1, status: 1 });

/**
 * Tickets live in the game DB (e.g. MahalaxmiDB); admin users live in MahalaxmiAdmin.
 * MongoDB $lookup cannot join across databases, so reports aggregate tickets here and merge User in app code.
 */
export function getTicketsDbConnection(): mongoose.Connection {
  const main = mongoose.connection;
  const ticketsDb =
    process.env.TICKETS_DB_NAME && process.env.TICKETS_DB_NAME !== process.env.DB_NAME
      ? process.env.TICKETS_DB_NAME
      : null;

  if (!ticketsDb) {
    return main;
  }

  if (!main.readyState) {
    throw new Error('MongoDB must be connected before accessing tickets DB');
  }

  return main.useDb(ticketsDb, { useCache: true });
}

export function getTicketModel(): mongoose.Model<ITicket> {
  const conn = getTicketsDbConnection();
  return (conn.models.Ticket as mongoose.Model<ITicket>) || conn.model<ITicket>('Ticket', ticketSchema);
}
