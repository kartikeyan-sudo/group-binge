# Quick Setup Guide

## Step 1: Create .env file
Copy the `.env.example` file and create a new `.env` file:

```
MONGODB_URI=mongodb://localhost:27017/group-binge
PORT=3000
```

**For MongoDB Atlas (cloud):**
Replace the MONGODB_URI with your Atlas connection string:
```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/group-binge?retryWrites=true&w=majority
```

## Step 2: Install dependencies
```bash
npm install
```

## Step 3: Start the server
```bash
npm start
```

Or for development with auto-restart:
```bash
npm run dev
```

## Step 4: Access the app
Open your browser to: http://localhost:3000

---

## MongoDB Connection Options

### Option 1: Local MongoDB
1. Install MongoDB Community Server from https://www.mongodb.com/try/download/community
2. Start MongoDB service
3. Use: `MONGODB_URI=mongodb://localhost:27017/group-binge`

### Option 2: MongoDB Atlas (Free Cloud)
1. Sign up at https://www.mongodb.com/cloud/atlas
2. Create a free cluster (M0)
3. Get your connection string from "Connect" button
4. Whitelist your IP address (0.0.0.0/0 for all IPs in development)
5. Use the connection string in .env

---

## Files Created

✅ `server.js` - Express + Socket.IO + MongoDB server
✅ `models/Room.js` - MongoDB schema
✅ `app-new.js` - Updated frontend code (MongoDB API)
✅ `package.json` - Dependencies
✅ `.env.example` - Environment template
✅ `README-MONGODB.md` - Full documentation

## Changes Made

🔴 Removed: Firebase SDK and all Firebase code
🟢 Added: MongoDB + Mongoose + Socket.IO
🟡 Updated: `index.html` to use Socket.IO instead of Firebase
🟡 Updated: Created `app-new.js` with MongoDB API calls

The old `app.js` with Firebase code is kept for reference.
