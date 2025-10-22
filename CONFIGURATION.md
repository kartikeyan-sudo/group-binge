# Configuration System Documentation

## 📁 Configuration Structure

This application uses a **centralized configuration system** to manage all database URLs, API endpoints, and environment settings.

```
project/
├── .env                          # Environment variables (NEVER commit to git!)
├── .env.example                  # Template for .env (safe to commit)
├── config/
│   ├── config.js                 # Backend configuration (Node.js)
│   └── client-config.js          # Frontend configuration (Browser)
├── server.js                     # Backend server (uses config.js)
└── app-new.js                    # Frontend app (uses client-config.js)
```

---

## 🔐 Environment Variables (.env file)

### Purpose
The `.env` file stores **sensitive information** like database URLs and API keys. This file is **automatically excluded from git** via `.gitignore`.

### Location
```
.env (in project root)
```

### Current Variables

```bash
# MongoDB Database URL
MONGODB_URI=mongodb://localhost:27017/group-binge

# Server Configuration
PORT=3000
HOST=localhost

# CORS Settings
CORS_ORIGIN=*

# Environment
NODE_ENV=development

# Debug Mode
DEBUG=true
```

### How to Set Your MongoDB URL

#### Option 1: Local MongoDB
```bash
MONGODB_URI=mongodb://localhost:27017/group-binge
```

#### Option 2: MongoDB Atlas (Cloud - Recommended)
```bash
MONGODB_URI=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/group-binge?retryWrites=true&w=majority
```

**Steps to get MongoDB Atlas URL:**
1. Go to https://www.mongodb.com/cloud/atlas
2. Sign up (FREE)
3. Create a cluster (M0 Free tier)
4. Create database user
5. Whitelist IP (0.0.0.0/0 for all)
6. Click "Connect" → "Connect your application"
7. Copy connection string
8. Replace `<password>` with your actual password

---

## ⚙️ Backend Configuration (config/config.js)

### Purpose
Centralizes all backend configuration by loading from `.env` and providing defaults.

### How It Works
```javascript
const config = require('./config/config');

// Access MongoDB URI
config.mongodb.uri  // Gets from process.env.MONGODB_URI

// Access server port
config.server.port  // Gets from process.env.PORT or defaults to 3000
```

### Configuration Object
```javascript
{
  mongodb: {
    uri: process.env.MONGODB_URI,
    options: { useNewUrlParser: true, useUnifiedTopology: true }
  },
  server: {
    port: process.env.PORT || 3000,
    host: process.env.HOST || 'localhost'
  },
  cors: {
    origin: process.env.CORS_ORIGIN || "*"
  },
  env: process.env.NODE_ENV || 'development',
  debug: process.env.DEBUG === 'true'
}
```

### Files Using This Config
- ✅ `server.js` - Main backend server
- ✅ `models/Room.js` - MongoDB schema (indirect via mongoose connection)

---

## 🌐 Frontend Configuration (config/client-config.js)

### Purpose
Provides client-side configuration for API endpoints and Socket.IO connections.

### How It Works
The configuration **automatically detects** if you're running locally or on a deployed server:

```javascript
// Automatically uses correct URL
API_URL: localhost → 'http://localhost:3000/api'
API_URL: production → 'https://yourdomain.com/api'
```

### Configuration Object
```javascript
{
  API_URL: 'http://localhost:3000/api',      // REST API endpoint
  SOCKET_URL: 'http://localhost:3000',       // Socket.IO endpoint
  DEBUG: true,                                // Debug logging
  SYNC_COOLDOWN: 10000,                      // Video sync settings
  TIME_SYNC_THRESHOLD: 2,
  BUFFER_DURATION: 1000,
  MAX_SYNC_ATTEMPTS: 2
}
```

### Files Using This Config
- ✅ `app-new.js` - Main frontend application
- ✅ Loaded via `<script>` in `index.html`

---

## 🔄 Configuration Flow

### Backend Flow
```
.env file
    ↓
config/config.js (loads .env via dotenv)
    ↓
server.js (imports config)
    ↓
MongoDB connection established
```

### Frontend Flow
```
config/client-config.js (defines API URLs)
    ↓
Loaded in index.html via <script>
    ↓
app-new.js (uses ClientConfig global)
    ↓
API calls and Socket.IO connection
```

---

## 🛡️ Security Best Practices

### ✅ DO:
- ✅ Keep `.env` file private
- ✅ Use `.env.example` as a template (safe to commit)
- ✅ Add `.env` to `.gitignore` (already done)
- ✅ Use environment variables for sensitive data
- ✅ Use different `.env` files for dev/staging/production

### ❌ DON'T:
- ❌ Commit `.env` to git
- ❌ Share your MongoDB password
- ❌ Hardcode database URLs in code
- ❌ Use production credentials in development

---

## 📝 How to Use This System

### For Development:

1. **Copy the example file:**
   ```bash
   # Already created for you!
   ```

2. **Edit `.env` with your MongoDB URL:**
   ```bash
   MONGODB_URI=your_mongodb_connection_string_here
   ```

3. **Server automatically loads it:**
   ```bash
   npm start
   ```

### For Production:

1. **Set environment variables on your hosting platform:**
   - Heroku: Settings → Config Vars
   - Vercel: Settings → Environment Variables
   - AWS: Systems Manager → Parameter Store
   - Docker: `docker run -e MONGODB_URI=...`

2. **The config system automatically uses them**

---

## 🔍 Troubleshooting

### Problem: "Cannot connect to MongoDB"
**Solution:** Check your `MONGODB_URI` in `.env`
```bash
# Make sure it's set correctly
cat .env
# or
type .env  # Windows
```

### Problem: "Module not found: config/config.js"
**Solution:** Ensure the config folder exists and file is created
```bash
# Check if file exists
ls config/config.js
# or
dir config\config.js  # Windows
```

### Problem: Frontend can't connect to API
**Solution:** Check `ClientConfig.API_URL` in browser console
```javascript
// Open browser console and type:
console.log(ClientConfig.API_URL);
```

---

## 📊 Configuration Summary

| Config File | Used By | Purpose | Contains Secrets? |
|------------|---------|---------|------------------|
| `.env` | Backend | Environment variables | ✅ YES (MongoDB URL) |
| `.env.example` | Template | Example for developers | ❌ NO |
| `config/config.js` | Backend | Server configuration | ❌ NO (reads from .env) |
| `config/client-config.js` | Frontend | API endpoints | ❌ NO (public URLs) |

---

## 🎯 Key Takeaways

1. **All MongoDB connection info is in `.env`** - ONE place to update
2. **Backend uses `config/config.js`** - Loads from `.env`
3. **Frontend uses `config/client-config.js`** - Auto-detects URLs
4. **`.env` is NEVER committed to git** - Protected by `.gitignore`
5. **All files reference the config** - No hardcoded URLs

---

✅ **Your MongoDB URL is now centrally managed and secure!**
