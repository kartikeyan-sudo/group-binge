const mongoose = require('mongoose');

// User Schema (embedded in Room)
const userSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  isAudioEnabled: {
    type: Boolean,
    default: true
  },
  isVideoEnabled: {
    type: Boolean,
    default: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

// Video State Schema
const videoStateSchema = new mongoose.Schema({
  videoId: {
    type: String,
    default: null
  },
  currentTime: {
    type: Number,
    default: 0
  },
  isPlaying: {
    type: Boolean,
    default: false
  },
  lastUpdate: {
    type: Date,
    default: Date.now
  },
  updatedBy: {
    type: String,
    default: null
  }
});

// Chat Message Schema
const messageSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true
  },
  userName: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

// WebRTC Signal Schema
const signalSchema = new mongoose.Schema({
  from: {
    type: String,
    required: true
  },
  to: {
    type: String,
    required: true
  },
  signal: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

// Main Room Schema
const roomSchema = new mongoose.Schema({
  roomId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  hostId: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  users: {
    type: Map,
    of: userSchema,
    default: {}
  },
  videoState: {
    type: videoStateSchema,
    default: () => ({})
  },
  messages: [messageSchema],
  signals: [signalSchema]
}, {
  timestamps: true
});

// Index for efficient queries
roomSchema.index({ createdAt: 1 });
roomSchema.index({ 'users.userId': 1 });

// Clean up old signals (keep only last 100)
roomSchema.pre('save', function(next) {
  if (this.signals && this.signals.length > 100) {
    this.signals = this.signals.slice(-100);
  }
  next();
});

// Auto-delete rooms older than 24 hours with no users
roomSchema.statics.cleanupOldRooms = async function() {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  // Find rooms older than 24 hours where the users Map is empty
  const oldRooms = await this.find({ createdAt: { $lt: oneDayAgo } });
  
  for (const room of oldRooms) {
    if (!room.users || room.users.size === 0) {
      await room.deleteOne();
    }
  }
};

const Room = mongoose.model('Room', roomSchema);

module.exports = Room;
