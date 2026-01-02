import mongoose, { Document, Schema } from 'mongoose';

// Action types for comprehensive logging
export type LogAction =
    // User Management
    | 'CREATE_USER' | 'UPDATE_USER' | 'DELETE_USER' | 'BAN_USER' | 'UNBAN_USER'
    // Authentication
    | 'LOGIN' | 'LOGOUT' | 'FAILED_LOGIN' | 'PASSWORD_CHANGE'
    // Financial Operations
    | 'CREDIT_TRANSFER' | 'CREDIT_ADJUSTMENT' | 'COMMISSION_PAYOUT'
    // Game Operations
    | 'GAME_START' | 'GAME_END' | 'BET_PLACED' | 'GAME_WIN' | 'GAME_LOSS'
    // Administrative
    | 'SYSTEM_CONFIG_CHANGE' | 'BULK_OPERATION'
    // Other
    | 'PROFILE_UPDATE' | 'SETTINGS_CHANGE';

// Details interface for different action types
export interface LogDetails {
    // User management details
    targetUserId?: string;
    targetUsername?: string;
    changes?: Record<string, any>;
    oldValues?: Record<string, any>;
    newValues?: Record<string, any>;

    // Financial details
    amount?: number;
    balanceBefore?: number;
    balanceAfter?: number;
    transferType?: 'credit' | 'debit';

    // Game details
    gameSessionId?: string;
    betAmount?: number;
    winAmount?: number;
    gameType?: string;

    // Authentication details
    loginMethod?: string;
    deviceInfo?: string;

    // Error details
    error?: string;
    errorCode?: string;

    // Generic details
    description?: string;
    metadata?: Record<string, any>;
}

export interface ILog extends Document {
    userId: mongoose.Types.ObjectId; // Reference to User who performed action
    action: LogAction;
    details: LogDetails;
    ipAddress?: string;
    userAgent?: string;
    status: 'SUCCESS' | 'FAILED';
    resourceId?: string; // Optional ID of affected resource
    createdAt: Date;
    updatedAt: Date;
}

// Log Schema Definition
const logSchema = new Schema<ILog>({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    action: {
        type: String,
        enum: [
            // User Management
            'CREATE_USER', 'UPDATE_USER', 'DELETE_USER', 'BAN_USER', 'UNBAN_USER',
            // Authentication
            'LOGIN', 'LOGOUT', 'FAILED_LOGIN', 'PASSWORD_CHANGE',
            // Financial Operations
            'CREDIT_TRANSFER', 'CREDIT_ADJUSTMENT', 'COMMISSION_PAYOUT',
            // Game Operations
            'GAME_START', 'GAME_END', 'BET_PLACED', 'GAME_WIN', 'GAME_LOSS',
            // Administrative
            'SYSTEM_CONFIG_CHANGE', 'BULK_OPERATION',
            // Other
            'PROFILE_UPDATE', 'SETTINGS_CHANGE'
        ],
        required: true
    },
    details: {
        type: Schema.Types.Mixed, // Allows flexible object structure
        default: {}
    },
    ipAddress: {
        type: String,
        trim: true
    },
    userAgent: {
        type: String,
        trim: true
    },
    status: {
        type: String,
        enum: ['SUCCESS', 'FAILED'],
        default: 'SUCCESS'
    },
    resourceId: {
        type: String,
        trim: true
    }
}, {
    timestamps: true // Automatically adds createdAt and updatedAt
});

// Indexes for performance
logSchema.index({ userId: 1, createdAt: -1 }); // User's logs by date
logSchema.index({ action: 1, createdAt: -1 }); // Actions by date
logSchema.index({ resourceId: 1, createdAt: -1 }); // Resource changes by date
logSchema.index({ createdAt: -1 }); // Most recent logs

const Log = mongoose.model<ILog>('Log', logSchema);

export default Log;
