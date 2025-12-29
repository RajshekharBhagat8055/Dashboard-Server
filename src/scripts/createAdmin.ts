import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User';

// Load environment variables
dotenv.config();

// Default admin credentials
const DEFAULT_ADMIN = {
  username: 'admin',
  password: 'admin123',
  email: 'admin@balatro.com',
  role: 'admin' as const
};

async function createAdmin() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI as string);
    console.log('✅ Connected to MongoDB');

    // Check if admin already exists
    const existingAdmin = await User.findOne({
      $or: [
        { username: DEFAULT_ADMIN.username },
        { role: 'admin' }
      ]
    });

    if (existingAdmin) {
      console.log('❌ Admin user already exists:');
      console.log(`   Username: ${existingAdmin.username}`);
      console.log(`   Role: ${existingAdmin.role}`);
      console.log(`   Unique ID: ${existingAdmin.uniqueId}`);
      console.log('   Use this account to login or update credentials if needed.');
      return;
    }

    // Create new admin user
    const adminUser = new User({
      username: DEFAULT_ADMIN.username,
      password: DEFAULT_ADMIN.password,
      email: DEFAULT_ADMIN.email,
      role: DEFAULT_ADMIN.role,
      uniqueId: (User as any).generateUniqueId(DEFAULT_ADMIN.role),
      // createdBy is not required for admin users
      isActive: true,
      isOnline: false,
      status: 'active',
      commissionRate: 0, // Admin doesn't earn commission
      totalCommissionEarned: 0,
      totalSubordinates: 0
    });

    // Hash the password
    await adminUser.hashPassword();

    // Save the admin user
    await adminUser.save();

    // Now set self-reference for createdBy (optional for admin)
    adminUser.createdBy = adminUser._id;
    await adminUser.save();

    console.log('🎉 Admin user created successfully!');
    console.log('📋 Admin Credentials:');
    console.log(`   Username: ${DEFAULT_ADMIN.username}`);
    console.log(`   Password: ${DEFAULT_ADMIN.password}`);
    console.log(`   Email: ${DEFAULT_ADMIN.email}`);
    console.log(`   Role: ${DEFAULT_ADMIN.role}`);
    console.log(`   Unique ID: ${adminUser.uniqueId}`);
    console.log('');
    console.log('⚠️  IMPORTANT: Change the default password after first login!');
    console.log('🔗 You can now login at: http://localhost:5173/login');

  } catch (error) {
    console.error('❌ Error creating admin user:', error);
    process.exit(1);
  } finally {
    // Close database connection
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
}

// Handle script execution
if (require.main === module) {
  createAdmin()
    .then(() => {
      console.log('✅ Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
}

export default createAdmin;
