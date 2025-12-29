import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IUser extends Document {
  // Basic Information
  username: string;
  password: string;
  email?: string;

  // Role and Hierarchy
  role: 'admin' | 'super_distributor' | 'distributor' | 'retailer' | 'user';
  uniqueId: string; // SD001, D001, R001, U001 format
  parentId?: mongoose.Types.ObjectId; // Reference to parent user
  createdBy: mongoose.Types.ObjectId; // Who created this user

  // Financial Data
  creditBalance: number; // Main credit balance (points)
  playPoints: number; // Points used for playing games
  winPoints: number; // Points won from games
  claimPoints: number; // Points claimed/withdrawn
  endPoints: number; // Final points after game session

  // Status and Activity
  isActive: boolean;
  isOnline: boolean;
  isBanned: boolean;
  status: 'active' | 'banned' | 'suspended' | 'inactive';
  lastLogin?: Date;
  lastActivity?: Date;

  // Commission System
  commissionRate: number; // Percentage (0-100)
  totalCommissionEarned: number;

  // Hierarchy Management
  totalSubordinates: number; // Count of direct children

  // Timestamps
  createdAt: Date;
  updatedAt: Date;

  // Methods
  comparePassword(candidatePassword: string): Promise<boolean>;
  hashPassword(): Promise<void>;
}

// Pre-save middleware to hash password
const userSchema = new Schema<IUser>({
  // Basic Information
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 50
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },

  // Role and Hierarchy
  role: {
    type: String,
    enum: ['admin', 'super_distributor', 'distributor', 'retailer', 'user'],
    required: true
  },
  uniqueId: {
    type: String,
    required: true,
    unique: true,
    uppercase: true
  },
  parentId: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: function(this: IUser) {
      // Admin users can be self-created, so createdBy is not required for them
      return this.role !== 'admin';
    }
  },

  // Financial Data
  creditBalance: {
    type: Number,
    default: 0,
    min: 0
  },
  playPoints: {
    type: Number,
    default: 0,
    min: 0
  },
  winPoints: {
    type: Number,
    default: 0,
    min: 0
  },
  claimPoints: {
    type: Number,
    default: 0,
    min: 0
  },
  endPoints: {
    type: Number,
    default: 0,
    min: 0
  },

  // Status and Activity
  isActive: {
    type: Boolean,
    default: true
  },
  isOnline: {
    type: Boolean,
    default: false
  },
  isBanned: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: ['active', 'banned', 'suspended', 'inactive'],
    default: 'active'
  },
  lastLogin: {
    type: Date
  },
  lastActivity: {
    type: Date
  },

  // Commission System
  commissionRate: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  totalCommissionEarned: {
    type: Number,
    default: 0,
    min: 0
  },

  // Hierarchy Management
  totalSubordinates: {
    type: Number,
    default: 0,
    min: 0
  }
}, {
  timestamps: true
});

// Additional indexes for performance (username and uniqueId are already indexed via unique: true)
userSchema.index({ role: 1 });
userSchema.index({ parentId: 1 });
userSchema.index({ createdBy: 1 });
userSchema.index({ isOnline: 1 });
userSchema.index({ status: 1 });

// Method to hash password before saving
userSchema.methods.hashPassword = async function(): Promise<void> {
  if (!this.password) return;

  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
};

// Instance method to compare password
userSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

// Static method to generate uniqueId based on role
userSchema.statics.generateUniqueId = function(role: string): string {
  const prefixes = {
    admin: 'ADM',
    super_distributor: 'SD',
    distributor: 'D',
    retailer: 'R',
    user: 'U'
  };

  const prefix = prefixes[role as keyof typeof prefixes] || 'U';

  // Generate a random 3-digit number
  const randomNum = Math.floor(Math.random() * 900) + 100;

  return `${prefix}${randomNum}`;
};

// Virtual for full name (if we add firstName/lastName later)
// userSchema.virtual('fullName').get(function() {
//   return `${this.firstName} ${this.lastName}`;
// });

const User = mongoose.model<IUser>('User', userSchema);

export default User;
