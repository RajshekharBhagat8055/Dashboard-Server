import mongoose, { Document, Schema } from 'mongoose';

export interface IEnrollmentCode extends Document {
    code: string;
    retailer_id: mongoose.Types.ObjectId;
    created_by?: mongoose.Types.ObjectId;
    quota_remaining: number;
    used_count: number;
    expires_at: Date;
    created_at: Date;
}

const enrollmentCodeSchema = new Schema<IEnrollmentCode>({
    code: { type: String, required: true, unique: true, uppercase: true },
    retailer_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    created_by: { type: Schema.Types.ObjectId, ref: 'User' },
    quota_remaining: { type: Number, default: 1 },
    used_count: { type: Number, default: 0 },
    expires_at: { type: Date, required: true },
    created_at: { type: Date, default: Date.now }
});

enrollmentCodeSchema.index({ code: 1 }, { unique: true });
enrollmentCodeSchema.index({ retailer_id: 1 });
enrollmentCodeSchema.index({ expires_at: 1 });

const EnrollmentCode = mongoose.model<IEnrollmentCode>('EnrollmentCode', enrollmentCodeSchema);
export default EnrollmentCode;
