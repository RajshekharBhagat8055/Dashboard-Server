import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User';

// Load environment variables
dotenv.config();

/**
 * Check current hierarchy state in database
 */

async function checkHierarchy() {
    try {
        console.log('Checking hierarchy status...\n');

        // Connect to MongoDB
        const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
        const dbName = process.env.DB_NAME || 'ArkaAdmin';

        // Append database name to URI
        let mongoUri = uri;
        if (uri.endsWith('/')) {
            mongoUri = `${uri}${dbName}`;
        } else {
            mongoUri = `${uri}/${dbName}`;
        }

        console.log(`Connecting to database: ${dbName}`);
        await mongoose.connect(mongoUri);
        console.log('✓ Connected to MongoDB\n');

        // Get all users
        const allUsers = await User.find({})
            .select('username role uniqueId superDistributorId distributorId retailerId createdBy')
            .sort({ role: 1, createdAt: 1 })
            .populate('superDistributorId', 'username uniqueId')
            .populate('distributorId', 'username uniqueId')
            .populate('retailerId', 'username uniqueId')
            .populate('createdBy', 'username uniqueId')
            .lean();

        console.log('='.repeat(80));
        console.log('HIERARCHY STATUS REPORT');
        console.log('='.repeat(80));

        // Group by role
        const byRole = {
            admin: allUsers.filter(u => u.role === 'admin'),
            super_distributor: allUsers.filter(u => u.role === 'super_distributor'),
            distributor: allUsers.filter(u => u.role === 'distributor'),
            retailer: allUsers.filter(u => u.role === 'retailer'),
            user: allUsers.filter(u => u.role === 'user')
        };

        // Display each role
        for (const [role, users] of Object.entries(byRole)) {
            if (users.length === 0) continue;

            console.log(`\n${'='.repeat(80)}`);
            console.log(`${role.toUpperCase().replace('_', ' ')}S (${users.length})`);
            console.log('='.repeat(80));

            for (const user of users) {
                console.log(`\n${user.username} (${user.uniqueId})`);
                console.log(`  Created By: ${(user.createdBy as any)?.username || 'N/A'}`);

                if (role !== 'admin') {
                    const sdExists = !!(user.superDistributorId as any)?._id;
                    const distExists = !!(user.distributorId as any)?._id;
                    const retailerExists = !!(user.retailerId as any)?._id;

                    console.log(`  Hierarchy:`);
                    console.log(`    Super Distributor: ${sdExists ? `✓ ${(user.superDistributorId as any)?.username} (${(user.superDistributorId as any)?.uniqueId})` : '✗ NOT SET'}`);

                    if (role === 'retailer' || role === 'user') {
                        console.log(`    Distributor: ${distExists ? `✓ ${(user.distributorId as any)?.username} (${(user.distributorId as any)?.uniqueId})` : '✗ NOT SET'}`);
                    }

                    if (role === 'user') {
                        console.log(`    Retailer: ${retailerExists ? `✓ ${(user.retailerId as any)?.username} (${(user.retailerId as any)?.uniqueId})` : '✗ NOT SET'}`);
                    }

                    // Check if hierarchy is complete
                    let hierarchyComplete = false;
                    if (role === 'super_distributor') hierarchyComplete = true;
                    else if (role === 'distributor') hierarchyComplete = sdExists;
                    else if (role === 'retailer') hierarchyComplete = sdExists && distExists;
                    else if (role === 'user') hierarchyComplete = sdExists && distExists && retailerExists;

                    if (!hierarchyComplete) {
                        console.log(`  ⚠️  INCOMPLETE HIERARCHY - This user needs to be recreated!`);
                    }
                }
            }
        }

        // Summary
        console.log('\n' + '='.repeat(80));
        console.log('SUMMARY');
        console.log('='.repeat(80));

        const incomplete = {
            distributors: byRole.distributor.filter(u => !(u.superDistributorId as any)?._id).length,
            retailers: byRole.retailer.filter(u => !(u.superDistributorId as any)?._id || !(u.distributorId as any)?._id).length,
            users: byRole.user.filter(u => !(u.superDistributorId as any)?._id || !(u.distributorId as any)?._id || !(u.retailerId as any)?._id).length
        };

        console.log(`Total Users: ${allUsers.length}`);
        console.log(`Incomplete Hierarchies: ${incomplete.distributors + incomplete.retailers + incomplete.users}`);
        if (incomplete.distributors) console.log(`  - Distributors: ${incomplete.distributors}`);
        if (incomplete.retailers) console.log(`  - Retailers: ${incomplete.retailers}`);
        if (incomplete.users) console.log(`  - Users: ${incomplete.users}`);

        if (incomplete.distributors + incomplete.retailers + incomplete.users > 0) {
            console.log('\n⚠️  WARNING: Some users have incomplete hierarchies!');
            console.log('Solutions:');
            console.log('  1. Delete and recreate these users through the UI');
            console.log('  2. Run: npm run update-hierarchy (to auto-populate)');
        } else {
            console.log('\n✅ All hierarchies are complete!');
        }

        await mongoose.disconnect();
        console.log('\n✓ Disconnected from MongoDB\n');

    } catch (error) {
        console.error('Error checking hierarchy:', error);
        process.exit(1);
    }
}

// Run the check
checkHierarchy().then(() => {
    process.exit(0);
}).catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
});
