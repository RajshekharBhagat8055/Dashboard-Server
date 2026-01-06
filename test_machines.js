const axios = require('axios');

async function testMachines() {
  try {
    // First login
    const loginResponse = await axios.post('http://localhost:3000/api/auth/login', {
      username: 'super_distributor',
      password: 'super123'
    });

    const token = loginResponse.data.data.token;
    console.log('Login successful, token:', token);

    // Now get machines
    const machinesResponse = await axios.get('http://localhost:3000/api/games/machines', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    console.log('Machines response:');
    console.log(JSON.stringify(machinesResponse.data, null, 2));

  } catch (error) {
    console.error('Error:', error.response ? error.response.data : error.message);
  }
}

testMachines();
