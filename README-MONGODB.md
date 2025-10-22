# Group Binge - MongoDB Version

A synchronized video watching application with MongoDB backend, replacing Firebase.

## 📦 What's Included

### Backend Files:
- **`server.js`** - Express server with Socket.IO and MongoDB integration
- **`models/Room.js`** - Mongoose schema for rooms, users, video state, messages
- **`package.json`** - Node.js dependencies

### Frontend Files:
- **`app-new.js`** - Updated JavaScript using MongoDB API instead of Firebase
- **`index.html`** - HTML with Socket.IO instead of Firebase scripts
- **`styles.css`** - Original styling (unchanged)

## 🚀 Setup Instructions

### 1. Install MongoDB

**Option A: MongoDB Atlas (Cloud - Recommended)**
1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a free account
3. Create a new cluster
4. Get your connection string (looks like: `mongodb+srv://username:password@cluster.mongodb.net/group-binge`)

**Option B: Local MongoDB**
1. Download and install [MongoDB Community Server](https://www.mongodb.com/try/download/community)
2. Start MongoDB service
3. Use connection string: `mongodb://localhost:27017/group-binge`

### 2. Configure Environment Variables

Create a `.env` file in the project root:

```bash
MONGODB_URI=your_mongodb_connection_string_here
PORT=3000
```

Or copy from example:
```bash
cp .env.example .env
```

Then edit `.env` and add your MongoDB connection string.

### 3. Install Dependencies

```bash
npm install
```

### 4. Start the Server

**Development mode (with auto-restart):**
```bash
npm run dev
```

**Production mode:**
```bash
npm start
```

The server will start on `http://localhost:3000`

### 5. Open the Application

Open your browser and navigate to:
```
http://localhost:3000
```

## 📊 MongoDB Schema

### Room Collection
```javascript
{
  roomId: String,           // Unique room identifier
  hostId: String,          // User ID of room creator
  createdAt: Date,         // Room creation timestamp
  users: Map<String, {     // Active users in room
    userId: String,
    name: String,
    isAudioEnabled: Boolean,
    isVideoEnabled: Boolean,
    timestamp: Date
  }>,
  videoState: {            // Current video state
    videoId: String,
    currentTime: Number,
    isPlaying: Boolean,
    lastUpdate: Date,
    updatedBy: String
  },
  messages: [{             // Chat messages
    userId: String,
    userName: String,
    message: String,
    timestamp: Date
  }],
  signals: [{              // WebRTC signaling data
    from: String,
    to: String,
    signal: Mixed,
    timestamp: Date
  }]
}
```

## 🔄 Migration from Firebase

The following changes were made:

1. **Removed Firebase SDK** → Added Socket.IO for real-time communication
2. **Firebase Realtime Database** → MongoDB with Mongoose ODM
3. **Firebase listeners** → Socket.IO events + REST API
4. **`app.js`** → `app-new.js` with MongoDB API calls
5. **Database structure** → MongoDB collections with proper schema

## 🌟 Features

- ✅ Real-time video synchronization
- ✅ WebRTC peer-to-peer video chat
- ✅ Group chat
- ✅ Room creation and joining
- ✅ Audio/video controls
- ✅ Automatic room cleanup
- ✅ MongoDB persistence

## 🛠️ API Endpoints

- `POST /api/rooms` - Create a new room
- `GET /api/rooms/:roomId` - Get room details
- `POST /api/rooms/:roomId/join` - Join a room
- `POST /api/rooms/:roomId/leave` - Leave a room
- `POST /api/rooms/:roomId/video-state` - Update video state
- `POST /api/rooms/:roomId/messages` - Send chat message
- `GET /api/rooms/:roomId/messages` - Get chat messages
- `POST /api/rooms/:roomId/signal` - WebRTC signaling
- `GET /api/health` - Health check

## 🔒 Security Notes

- Make sure to keep your `.env` file private
- Never commit your MongoDB connection string to version control
- Use MongoDB Atlas IP whitelist for production
- Consider adding authentication for production use

## 📝 Notes

- Old `app.js` with Firebase is kept for reference
- Rooms with no users are automatically deleted after 24 hours
- Only the last 100 messages per room are kept
- Only the last 100 WebRTC signals per room are kept

## 🐛 Troubleshooting

**Cannot connect to MongoDB:**
- Check your connection string in `.env`
- Ensure MongoDB service is running (local)
- Check IP whitelist settings (Atlas)

**Socket.IO connection errors:**
- Make sure server is running
- Check CORS settings in `server.js`
- Update `API_URL` in `app-new.js` if using different port

**Video won't sync:**
- Check browser console for errors
- Ensure all users are connected to the same room
- Try refreshing the page

## 📦 Dependencies

### Backend
- `express` - Web server
- `mongoose` - MongoDB ODM
- `socket.io` - Real-time communication
- `cors` - Cross-origin resource sharing
- `dotenv` - Environment variables

### Frontend
- Socket.IO client (CDN)
- YouTube IFrame API (CDN)
- SimplePeer for WebRTC (CDN)

## 🎯 Usage

1. Enter your name and click "Create Room"
2. Share the Room ID with friends
3. Friends enter their names and the Room ID, then click "Join Room"
4. Load a YouTube video using the video ID or URL
5. Enjoy synchronized video watching!

---

Made with ❤️ - Migrated from Firebase to MongoDB
