const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const socketIO = require('socket.io');
const Room = require('./models/Room');
const config = require('./config/config');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: config.cors
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.')); // Serve static files from current directory

// MongoDB Connection
const MONGODB_URI = config.mongodb.uri;

mongoose.connect(MONGODB_URI, config.mongodb.options)
.then(() => {
  console.log('✅ Connected to MongoDB');
  // Run cleanup on startup
  Room.cleanupOldRooms();
})
.catch(err => console.error('❌ MongoDB connection error:', err));

// Store socket connections by user ID
const userSockets = new Map();

// Socket.IO for real-time communication
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Join room
  socket.on('join-room', async ({ roomId, userId }) => {
    socket.join(roomId);
    userSockets.set(userId, socket.id);
    console.log(`User ${userId} joined room ${roomId}`);
    
    // Notify others in the room
    socket.to(roomId).emit('user-joined', { userId });
  });

  // Leave room
  socket.on('leave-room', ({ roomId, userId }) => {
    socket.leave(roomId);
    userSockets.delete(userId);
    socket.to(roomId).emit('user-left', { userId });
  });

  // Video state updates
  socket.on('video-state-change', ({ roomId, videoState }) => {
    socket.to(roomId).emit('video-state-updated', videoState);
  });

  // Chat messages
  socket.on('chat-message', ({ roomId, message }) => {
    socket.to(roomId).emit('new-message', message);
  });

  // WebRTC signaling
  socket.on('webrtc-signal', ({ roomId, signal, to }) => {
    const targetSocketId = userSockets.get(to);
    if (targetSocketId) {
      io.to(targetSocketId).emit('webrtc-signal', signal);
    }
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    // Find and remove user from userSockets
    for (const [userId, socketId] of userSockets.entries()) {
      if (socketId === socket.id) {
        userSockets.delete(userId);
        break;
      }
    }
  });
});

// API Routes

// Create a new room
app.post('/api/rooms', async (req, res) => {
  try {
    const { roomId, hostId, userName } = req.body;
    
    const room = new Room({
      roomId,
      hostId,
      users: new Map([[hostId, {
        userId: hostId,
        name: userName,
        isAudioEnabled: true,
        isVideoEnabled: true,
        timestamp: new Date()
      }]]),
      videoState: {
        videoId: null,
        currentTime: 0,
        isPlaying: false,
        lastUpdate: new Date(),
        updatedBy: null
      }
    });

    await room.save();
    res.status(201).json({ success: true, room });
  } catch (error) {
    console.error('Error creating room:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get room details
app.get('/api/rooms/:roomId', async (req, res) => {
  try {
    const room = await Room.findOne({ roomId: req.params.roomId });
    if (!room) {
      return res.status(404).json({ success: false, error: 'Room not found' });
    }
    res.json({ success: true, room });
  } catch (error) {
    console.error('Error getting room:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Join existing room
app.post('/api/rooms/:roomId/join', async (req, res) => {
  try {
    const { userId, userName } = req.body;
    const room = await Room.findOne({ roomId: req.params.roomId });
    
    if (!room) {
      return res.status(404).json({ success: false, error: 'Room not found' });
    }

    room.users.set(userId, {
      userId,
      name: userName,
      isAudioEnabled: true,
      isVideoEnabled: true,
      timestamp: new Date()
    });

    await room.save();
    
    // Notify other users via Socket.IO
    io.to(req.params.roomId).emit('user-joined', { userId, userName });
    
    res.json({ success: true, room });
  } catch (error) {
    console.error('Error joining room:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Leave room
app.post('/api/rooms/:roomId/leave', async (req, res) => {
  try {
    const { userId } = req.body;
    const room = await Room.findOne({ roomId: req.params.roomId });
    
    if (!room) {
      return res.status(404).json({ success: false, error: 'Room not found' });
    }

    room.users.delete(userId);
    
    // If room is empty, delete it
    if (room.users.size === 0) {
      await Room.deleteOne({ roomId: req.params.roomId });
    } else {
      await room.save();
    }
    
    // Notify other users
    io.to(req.params.roomId).emit('user-left', { userId });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error leaving room:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update video state
app.post('/api/rooms/:roomId/video-state', async (req, res) => {
  try {
    const { videoId, currentTime, isPlaying, updatedBy } = req.body;
    const room = await Room.findOne({ roomId: req.params.roomId });
    
    if (!room) {
      return res.status(404).json({ success: false, error: 'Room not found' });
    }

    room.videoState = {
      videoId,
      currentTime,
      isPlaying,
      lastUpdate: new Date(),
      updatedBy
    };

    await room.save();
    
    // Notify other users
    io.to(req.params.roomId).emit('video-state-updated', room.videoState);
    
    res.json({ success: true, videoState: room.videoState });
  } catch (error) {
    console.error('Error updating video state:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Send chat message
app.post('/api/rooms/:roomId/messages', async (req, res) => {
  try {
    const { userId, userName, message } = req.body;
    const room = await Room.findOne({ roomId: req.params.roomId });
    
    if (!room) {
      return res.status(404).json({ success: false, error: 'Room not found' });
    }

    const newMessage = {
      userId,
      userName,
      message,
      timestamp: new Date()
    };

    room.messages.push(newMessage);
    
    // Keep only last 100 messages
    if (room.messages.length > 100) {
      room.messages = room.messages.slice(-100);
    }

    await room.save();
    
    // Notify other users
    io.to(req.params.roomId).emit('new-message', newMessage);
    
    res.json({ success: true, message: newMessage });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get chat messages
app.get('/api/rooms/:roomId/messages', async (req, res) => {
  try {
    const room = await Room.findOne({ roomId: req.params.roomId });
    if (!room) {
      return res.status(404).json({ success: false, error: 'Room not found' });
    }
    res.json({ success: true, messages: room.messages });
  } catch (error) {
    console.error('Error getting messages:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// WebRTC signaling
app.post('/api/rooms/:roomId/signal', async (req, res) => {
  try {
    const { from, to, signal } = req.body;
    const room = await Room.findOne({ roomId: req.params.roomId });
    
    if (!room) {
      return res.status(404).json({ success: false, error: 'Room not found' });
    }

    room.signals.push({
      from,
      to,
      signal,
      timestamp: new Date()
    });

    await room.save();
    
    // Send via Socket.IO for real-time delivery
    const targetSocketId = userSockets.get(to);
    if (targetSocketId) {
      io.to(targetSocketId).emit('webrtc-signal', { from, signal });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error sending signal:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', mongodb: mongoose.connection.readyState === 1 });
});

const PORT = config.server.port;

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 MongoDB: ${MONGODB_URI}`);
  console.log(`🌍 Environment: ${config.env}`);
});

// Cleanup old rooms every hour
setInterval(() => {
  Room.cleanupOldRooms();
}, 60 * 60 * 1000);
