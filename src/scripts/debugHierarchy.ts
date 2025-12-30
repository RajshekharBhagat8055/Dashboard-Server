import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User';
import { connectDB } from '../config/connectDB';

// Load environment variables
dotenv.config();

// Debug script to check hierarchy
async function debugHierarchy() {
  try {
    await connectDB();

    console.log('\n🔍 Checking Hierarchy Relationships...\n');

    // Find all users and show their relationships
    const allUsers = await User.find({}).select('username role createdBy _id').sort({ createdAt: 1 }).lean();

    console.log('📋 All Users:');
    for (const user of allUsers) {
      const creator = user.createdBy ? await User.findById(user.createdBy).select('username role').lean() : null;
      console.log(`${user.username} (${user.role}) - created by: ${creator ? `${creator.username} (${creator.role})` : 'self'}`);
    }

    console.log('\n🎯 Specific Hierarchy Check:');

    // Find tirth (super distributor)
    const tirth = await User.findOne({ username: 'tirth' }).lean();
    if (tirth) {
      console.log(`\nFound tirth: ${tirth._id} (${tirth.role})`);

      // Find users created by tirth
      const tirthCreated = await User.find({ createdBy: tirth._id }).select('username role').lean();
      console.log(`Users created by tirth: ${tirthCreated.map(u => `${u.username} (${u.role})`).join(', ')}`);

      // Find yash if exists
      const yash = await User.findOne({ username: 'yash' }).lean();
      if (yash) {
        console.log(`\nFound yash: ${yash._id} (${yash.role}) - created by: ${yash.createdBy}`);

        // Check if yash was created by tirth
        const yashCreator = yash.createdBy ? await User.findById(yash.createdBy).select('username role').lean() : null;
        console.log(`Yash created by: ${yashCreator ? `${yashCreator.username} (${yashCreator.role})` : 'unknown'}`);

        // Find users created by yash
        const yashCreated = await User.find({ createdBy: yash._id }).select('username role').lean();
        console.log(`Users created by yash: ${yashCreated.map(u => `${u.username} (${u.role})`).join(', ')}`);

        // Check all users created by yash
        const allYashUsers = await User.find({ createdBy: yash._id }).select('username role').lean();
        console.log(`All users created by yash: ${allYashUsers.map(u => u.username).join(', ')}`);

        // Test the actual service method
        console.log('\n🧪 Testing getUsersUnderSuperDistributor service method...');
        const { UserService } = await import('../services/user.services');
        const tirthUsers = await UserService.getUsersUnderSuperDistributor(tirth._id.toString());
        console.log(`Users tirth should see: ${tirthUsers.map(u => u.username).join(', ')}`);

        // Test the distributor method
        console.log('\n🧪 Testing getUsersUnderDistributor service method...');
        const yashUsers = await UserService.getUsersUnderDistributor(yash._id.toString());
        console.log(`Users yash should see: ${yashUsers.map(u => u.username).join(', ')}`);
      } else {
        console.log('\n❌ yash not found in database!');
      }
    } else {
      console.log('\n❌ tirth not found in database!');
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run debug if called directly
debugHierarchy();
