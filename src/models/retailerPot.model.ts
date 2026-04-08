import mongoose, { Document, Schema } from 'mongoose';

export interface IRetailerPot extends Document {
    retailer_id: mongoose.Types.ObjectId;
    date: string;           // "YYYY-MM-DD"
    pot_balance: number;    // Current balance, never below 0
    total_collected: number;
    total_paid_out: number;
    created_at: Date;
    updated_at: Date;
}

const retailerPotSchema = new Schema<IRetailerPot>(
    {
        retailer_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        date: { type: String, required: true, index: true },
        pot_balance: { type: Number, default: 0, min: 0 },
        total_collected: { type: Number, default: 0 },
        total_paid_out: { type: Number, default: 0 },
    },
    { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

// One document per retailer per day
retailerPotSchema.index({ retailer_id: 1, date: 1 }, { unique: true });

const RetailerPot = mongoose.model<IRetailerPot>('RetailerPot', retailerPotSchema);

export default RetailerPot;
