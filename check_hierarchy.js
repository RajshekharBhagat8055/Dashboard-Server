const mongoose = require('mongoose');
const User = require('./dist/models/User').default;

async function checkUsers() {
  try {
    await mongoose.connect('mongodb://localhost:27017/balatro');

    const users = await User.find({
      username: { $in: ['admin_sd_1_u_1', 'admin_sd_1_d_1_r_1', 'admin_sd_1_d_1_u_1', 'admin_sd_1_d_1_r_1_u_1'] }
    }).select('username _id createdBy role').lean();

    console.log('Users in database:');
    users.forEach(user => {
      console.log(`${user.username}: ID=${user._id}, createdBy=${user.createdBy}, role=${user.role}`);
    });

    // Also check if there are distributor and super distributor users
    const hierarchyUsers = await User.find({
      role: { $in: ['super_distributor', 'distributor'] },
      username: { $regex: /^admin/ }
    }).select('username _id createdBy role').lean();

    console.log('\nHierarchy users:');
    hierarchyUsers.forEach(user => {
      console.log(`${user.username}: ID=${user._id}, createdBy=${user.createdBy}, role=${user.role}`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

checkUsers();
