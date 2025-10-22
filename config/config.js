// Configuration file for environment variables
// This ensures all MongoDB and server configurations are centralized

require('dotenv').config();

module.exports = {
  // MongoDB Configuration
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/group-binge',
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true
    }
  },
  
  // Server Configuration
  server: {
    port: process.env.PORT || 3000,
    host: process.env.HOST || 'localhost'
  },
  
  // CORS Configuration
  cors: {
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST"]
  },
  
  // Environment
  env: process.env.NODE_ENV || 'development',
  
  // Debug mode
  debug: process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development'
};
