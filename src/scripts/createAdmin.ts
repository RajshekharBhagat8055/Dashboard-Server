import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User';

// Load environment variables
dotenv.config();

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);

  // Show help
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
🎯 Balatro Admin User Creator

Usage: npm run create-admin [options]

Options:
  --username, -u     Username for the admin user (required)
  --password, -p     Password for the admin user (required)
  --email, -e        Email for the admin user (optional)
  --role, -r         Role of the user (default: admin)
                     Available: admin, super_distributor, distributor, retailer, user
  --credit, -c       Initial credit balance (default: 0)
  --commission, -co  Commission rate in percentage (default: 0)

Examples:
  npm run create-admin --username admin --password mypass123 --email admin@example.com
  npm run create-admin -u superadmin -p pass123 -r super_distributor -c 1000 -co 5
  npm run create-admin --help

Note: If creating a non-admin user, make sure the creator has appropriate permissions.
`);
    process.exit(0);
  }

  const parsedArgs: any = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--username':
      case '-u':
        parsedArgs.username = nextArg;
        i++; // Skip next arg
        break;
      case '--password':
      case '-p':
        parsedArgs.password = nextArg;
        i++; // Skip next arg
        break;
      case '--email':
      case '-e':
        parsedArgs.email = nextArg;
        i++; // Skip next arg
        break;
      case '--role':
      case '-r':
        parsedArgs.role = nextArg;
        i++; // Skip next arg
        break;
      case '--credit':
      case '-c':
        parsedArgs.creditBalance = parseFloat(nextArg) || 0;
        i++; // Skip next arg
        break;
      case '--commission':
      case '-co':
        parsedArgs.commissionRate = parseFloat(nextArg) || 0;
        i++; // Skip next arg
        break;
    }
  }

  return parsedArgs;
}

// Validate arguments
function validateArgs(args: any) {
  if (!args.username) {
    console.error('❌ Error: Username is required. Use --username or -u');
    process.exit(1);
  }

  if (!args.password) {
    console.error('❌ Error: Password is required. Use --password or -p');
    process.exit(1);
  }

  const validRoles = ['admin', 'super_distributor', 'distributor', 'retailer', 'user'];
  if (args.role && !validRoles.includes(args.role)) {
    console.error(`❌ Error: Invalid role. Must be one of: ${validRoles.join(', ')}`);
    process.exit(1);
  }

  if (args.commissionRate !== undefined && (args.commissionRate < 0 || args.commissionRate > 100)) {
    console.error('❌ Error: Commission rate must be between 0 and 100');
    process.exit(1);
  }

  if (args.creditBalance !== undefined && args.creditBalance < 0) {
    console.error('❌ Error: Credit balance cannot be negative');
    process.exit(1);
  }

  return {
    username: args.username,
    password: args.password,
    email: args.email || `${args.username}@balatro.com`,
    role: args.role || 'admin',
    creditBalance: args.creditBalance || 0,
    commissionRate: args.commissionRate || 0
  };
}


async function createAdmin(userData: any) {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI as string);
    console.log('✅ Connected to MongoDB');

    // Check if user already exists
    const existingUser = await User.findOne({
      username: userData.username
    });

    if (existingUser) {
      console.log('ℹ️  User already exists:');
      console.log(`   Username: ${existingUser.username}`);
      console.log(`   Role: ${existingUser.role}`);
      console.log(`   Unique ID: ${existingUser.uniqueId}`);
      console.log(`   Email: ${existingUser.email}`);
    } else {
      // Create user
      const newUser = new User({
        username: userData.username,
        password: userData.password,
        email: userData.email,
        role: userData.role,
        uniqueId: (User as any).generateUniqueId(userData.role),
        creditBalance: userData.creditBalance,
        isActive: true,
        isOnline: false,
        status: 'active',
        commissionRate: userData.commissionRate,
        totalCommissionEarned: 0,
        totalSubordinates: 0
      });

      await newUser.hashPassword();
      await newUser.save();

      // For admin users, set createdBy to self. For others, this would be set by the creator
      if (userData.role === 'admin') {
        newUser.createdBy = newUser._id;
        await newUser.save();
      }

      console.log('🎉 User created successfully!');
      console.log(`   Username: ${newUser.username}`);
      console.log(`   Role: ${newUser.role}`);
      console.log(`   Unique ID: ${newUser.uniqueId}`);
      console.log(`   Email: ${newUser.email}`);
      console.log(`   Credit Balance: ${newUser.creditBalance}`);
      console.log(`   Commission Rate: ${newUser.commissionRate}%`);
    }
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
  try {
    const rawArgs = parseArgs();
    const userData = validateArgs(rawArgs);

    console.log('🚀 Creating user with the following details:');
    console.log(`   Username: ${userData.username}`);
    console.log(`   Email: ${userData.email}`);
    console.log(`   Role: ${userData.role}`);
    console.log(`   Credit Balance: ${userData.creditBalance}`);
    console.log(`   Commission Rate: ${userData.commissionRate}%`);
    console.log('');

    createAdmin(userData)
      .then(() => {
        console.log('✅ Script completed successfully');
        process.exit(0);
      })
      .catch((error) => {
        console.error('❌ Script failed:', error);
        process.exit(1);
      });
  } catch (error) {
    console.error('❌ Argument parsing failed:', error);
    process.exit(1);
  }
}

export default createAdmin;
