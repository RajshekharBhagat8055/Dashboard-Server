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

// Default super distributor credentials
const DEFAULT_SUPER_DISTRIBUTOR = {
  username: 'super_distributor',
  password: 'super123',
  email: 'super@balatro.com',
  role: 'super_distributor' as const
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
      console.log('ℹ️  Admin user already exists:');
      console.log(`   Username: ${existingAdmin.username}`);
      console.log(`   Role: ${existingAdmin.role}`);
      console.log(`   Unique ID: ${existingAdmin.uniqueId}`);
    } else {
      // Create admin user
      const adminUser = new User({
        username: DEFAULT_ADMIN.username,
        password: DEFAULT_ADMIN.password,
        email: DEFAULT_ADMIN.email,
        role: DEFAULT_ADMIN.role,
        uniqueId: (User as any).generateUniqueId(DEFAULT_ADMIN.role),
        isActive: true,
        isOnline: false,
        status: 'active',
        commissionRate: 0,
        totalCommissionEarned: 0,
        totalSubordinates: 0
      });

      await adminUser.hashPassword();
      await adminUser.save();
      adminUser.createdBy = adminUser._id;
      await adminUser.save();

      console.log('🎉 Admin user created successfully!');
    }

    // Check if super distributor already exists
    const existingSuperDistributor = await User.findOne({
      username: DEFAULT_SUPER_DISTRIBUTOR.username
    });

    if (existingSuperDistributor) {
      console.log('ℹ️  Super Distributor user already exists:');
      console.log(`   Username: ${existingSuperDistributor.username}`);
      console.log(`   Role: ${existingSuperDistributor.role}`);
      console.log(`   Unique ID: ${existingSuperDistributor.uniqueId}`);
    } else {
      // Create super distributor user
      const superDistributorUser = new User({
        username: DEFAULT_SUPER_DISTRIBUTOR.username,
        password: DEFAULT_SUPER_DISTRIBUTOR.password,
        email: DEFAULT_SUPER_DISTRIBUTOR.email,
        role: DEFAULT_SUPER_DISTRIBUTOR.role,
        uniqueId: (User as any).generateUniqueId(DEFAULT_SUPER_DISTRIBUTOR.role),
        createdBy: existingAdmin ? existingAdmin._id : undefined,
        isActive: true,
        isOnline: false,
        status: 'active',
        commissionRate: 5, // 5% commission
        totalCommissionEarned: 0,
        totalSubordinates: 0
      });

      await superDistributorUser.hashPassword();
      await superDistributorUser.save();

      console.log('🎉 Super Distributor user created successfully!');
    }

    console.log('');
    console.log('📋 Available Test Accounts:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`👑 Admin:`);
    console.log(`   Username: ${DEFAULT_ADMIN.username}`);
    console.log(`   Password: ${DEFAULT_ADMIN.password}`);
    console.log(`   Email: ${DEFAULT_ADMIN.email}`);
    console.log('');
    console.log(`🏢 Super Distributor:`);
    console.log(`   Username: ${DEFAULT_SUPER_DISTRIBUTOR.username}`);
    console.log(`   Password: ${DEFAULT_SUPER_DISTRIBUTOR.password}`);
    console.log(`   Email: ${DEFAULT_SUPER_DISTRIBUTOR.email}`);
    console.log('');
    console.log('⚠️  IMPORTANT: Change default passwords after testing!');
    console.log('🔗 Frontend: http://localhost:5173/login');
    console.log('🔗 API Docs: Check Postman for endpoints');
    return;

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
