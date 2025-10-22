// Quick MongoDB Connection Test
// This script tests if your MongoDB Atlas connection is working

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;

console.log('🔍 Testing MongoDB Connection...');
console.log('📊 Connection String:', MONGODB_URI);
console.log('');

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => {
  console.log('✅ SUCCESS! MongoDB Atlas is connected and working!');
  console.log('✅ Database is active and accessible');
  console.log('✅ Your credentials are correct');
  console.log('✅ Network access is properly configured');
  console.log('');
  console.log('🎉 You can now deploy to Railway!');
  
  // Close the connection
  mongoose.connection.close();
  process.exit(0);
})
.catch((error) => {
  console.log('❌ FAILED! Could not connect to MongoDB');
  console.log('');
  console.log('Error Details:');
  console.error(error.message);
  console.log('');
  console.log('Common Issues:');
  console.log('  1. Check if MongoDB URI is correct (includes /group-binge at the end)');
  console.log('  2. Verify your MongoDB Atlas username and password');
  console.log('  3. Check Network Access in MongoDB Atlas (allow 0.0.0.0/0)');
  console.log('  4. Make sure your cluster is active (not paused)');
  
  process.exit(1);
});

// Timeout after 10 seconds
setTimeout(() => {
  console.log('⏱️ Connection timeout - MongoDB is not responding');
  process.exit(1);
}, 10000);
