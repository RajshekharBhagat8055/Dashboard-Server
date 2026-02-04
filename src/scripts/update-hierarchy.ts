import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User';

// Load environment variables
dotenv.config();

/**
 * Migration script to populate hierarchy fields for existing users
 * Run this once to update all existing users with proper hierarchy chain
 */

async function updateUserHierarchy() {
    try {
        console.log('Starting hierarchy update...');

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
        console.log('Connected to MongoDB');

        // Get all users ordered by creation date (oldest first)
        const allUsers = await User.find({}).sort({ createdAt: 1 }).lean();
        console.log(`Found ${allUsers.length} users to process`);

        let updated = 0;

        for (const user of allUsers) {
            const updates: any = {};
            let needsUpdate = false;

            // Skip admin users - they don't need hierarchy
            if (user.role === 'admin') {
                continue;
            }

            // Process based on role
            if (user.role === 'super_distributor') {
                // Super distributors don't need hierarchy fields
                // But we can check if they mistakenly have any
                if (user.superDistributorId || user.distributorId || user.retailerId) {
                    updates.superDistributorId = null;
                    updates.distributorId = null;
                    updates.retailerId = null;
                    needsUpdate = true;
                }
            } else if (user.role === 'distributor') {
                // Distributors need superDistributorId
                if (!user.superDistributorId && user.createdBy) {
                    // Find the creator
                    const creator = await User.findById(user.createdBy);
                    if (creator) {
                        if (creator.role === 'super_distributor') {
                            // Created by SD directly
                            updates.superDistributorId = creator._id;
                            needsUpdate = true;
                        } else if (creator.role === 'admin') {
                            // Created by admin - we can't automatically determine the SD
                            console.log(`⚠️  Distributor ${user.username} created by admin - needs manual SD assignment`);
                        }
                    }
                }
            } else if (user.role === 'retailer') {
                // Retailers need superDistributorId and distributorId
                if ((!user.superDistributorId || !user.distributorId) && user.createdBy) {
                    const creator = await User.findById(user.createdBy);
                    if (creator) {
                        if (creator.role === 'distributor') {
                            // Created by distributor
                            if (creator.superDistributorId) {
                                updates.superDistributorId = creator.superDistributorId;
                                updates.distributorId = creator._id;
                                needsUpdate = true;
                            } else {
                                console.log(`⚠️  Retailer ${user.username}'s distributor doesn't have SD set`);
                            }
                        } else if (creator.role === 'super_distributor') {
                            // Created by SD directly (unusual but possible)
                            updates.superDistributorId = creator._id;
                            console.log(`⚠️  Retailer ${user.username} created directly by SD - needs manual distributor assignment`);
                        } else if (creator.role === 'admin') {
                            console.log(`⚠️  Retailer ${user.username} created by admin - needs manual hierarchy assignment`);
                        }
                    }
                }
            } else if (user.role === 'user') {
                // Users need superDistributorId, distributorId, and retailerId
                if ((!user.superDistributorId || !user.distributorId || !user.retailerId) && user.createdBy) {
                    const creator = await User.findById(user.createdBy);
                    if (creator) {
                        if (creator.role === 'retailer') {
                            // Created by retailer
                            if (creator.superDistributorId && creator.distributorId) {
                                updates.superDistributorId = creator.superDistributorId;
                                updates.distributorId = creator.distributorId;
                                updates.retailerId = creator._id;
                                needsUpdate = true;
                            } else {
                                console.log(`⚠️  User ${user.username}'s retailer doesn't have complete hierarchy`);
                            }
                        } else if (creator.role === 'distributor') {
                            // Created by distributor directly (unusual)
                            if (creator.superDistributorId) {
                                updates.superDistributorId = creator.superDistributorId;
                                updates.distributorId = creator._id;
                                console.log(`⚠️  User ${user.username} created directly by distributor - needs manual retailer assignment`);
                            }
                        } else {
                            console.log(`⚠️  User ${user.username} created by ${creator.role} - needs manual hierarchy assignment`);
                        }
                    }
                }
            }

            // Apply updates if needed
            if (needsUpdate) {
                await User.findByIdAndUpdate(user._id, updates);
                updated++;
                console.log(`✓ Updated ${user.username} (${user.role}) with hierarchy:`, updates);
            }
        }

        console.log(`\n✅ Migration complete! Updated ${updated} users.`);

        // Show summary
        const stats = {
            total: allUsers.length,
            updated,
            byRole: {
                superDistributors: await User.countDocuments({ role: 'super_distributor' }),
                distributors: await User.countDocuments({ role: 'distributor', superDistributorId: { $exists: true } }),
                retailers: await User.countDocuments({ role: 'retailer', distributorId: { $exists: true } }),
                users: await User.countDocuments({ role: 'user', retailerId: { $exists: true } })
            }
        };

        console.log('\n📊 Hierarchy Status:');
        console.log(`Total Users: ${stats.total}`);
        console.log(`Super Distributors: ${stats.byRole.superDistributors}`);
        console.log(`Distributors (with SD): ${stats.byRole.distributors}`);
        console.log(`Retailers (with hierarchy): ${stats.byRole.retailers}`);
        console.log(`Users (with complete hierarchy): ${stats.byRole.users}`);

        await mongoose.disconnect();
        console.log('\nDisconnected from MongoDB');

    } catch (error) {
        console.error('Error updating hierarchy:', error);
        process.exit(1);
    }
}

// Run the migration
updateUserHierarchy().then(() => {
    console.log('Script completed');
    process.exit(0);
}).catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
});
