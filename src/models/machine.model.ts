import mongoose, { Document, Schema } from 'mongoose';

export interface IMachine extends Document {
    retailer_id: mongoose.Types.ObjectId;
    device_public_id?: string;
    api_key_hash: string;
    label?: string;
    platform?: string;
    is_active: boolean;
    last_heartbeat?: Date;
    revoked_at?: Date;
    created_at: Date;
}

const machineSchema = new Schema<IMachine>({
    retailer_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    device_public_id: { type: String },
    api_key_hash: { type: String, required: true, unique: true },
    label: { type: String },
    platform: { type: String },
    is_active: { type: Boolean, default: true },
    last_heartbeat: { type: Date },
    revoked_at: { type: Date },
    created_at: { type: Date, default: Date.now }
});

machineSchema.index({ retailer_id: 1, is_active: 1 });
machineSchema.index({ device_public_id: 1, retailer_id: 1 });

const Machine = mongoose.model<IMachine>('Machine', machineSchema);
export default Machine;
