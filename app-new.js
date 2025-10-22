// ----- Configuration -----
// Configuration is loaded from ClientConfig (see config/client-config.js)
// This ensures all API endpoints are centralized and use environment-aware URLs
const API_URL = ClientConfig.API_URL;
const SOCKET_URL = ClientConfig.SOCKET_URL;
let socket = null;

// Debug mode for troubleshooting
const DEBUG = ClientConfig.DEBUG;

console.log('⚙️ Configuration loaded:');
console.log('   API_URL:', API_URL);
console.log('   SOCKET_URL:', SOCKET_URL);
console.log('   DEBUG:', DEBUG);

function debugLog(...args) {
  if (DEBUG) console.log(...args);
}

// ----- Global Variables -----
let currentUser = {
    id: generateUserId(),
    name: '',
    isAudioEnabled: true,
    isVideoEnabled: true
};

let currentRoom = null;
let youtubePlayer = null;
let localStream = null;
let peers = {};
let userConnections = {};
let userCount = 1;
let hasInitializedStream = false;
let roomHostId = null;
let peerVideosInitialized = {};

// Sync variables
let isSyncingVideo = false;
let ignoreStateChanges = false;
let lastUpdateTime = 0;
let lastKnownVideoTime = 0;
let lastKnownPlayState = false;
const SYNC_COOLDOWN = ClientConfig.SYNC_COOLDOWN;
const TIME_SYNC_THRESHOLD = ClientConfig.TIME_SYNC_THRESHOLD;
const BUFFER_DURATION = ClientConfig.BUFFER_DURATION;
let syncLoopBreaker = false;
let consecutiveSyncAttempts = 0;
const MAX_SYNC_ATTEMPTS = ClientConfig.MAX_SYNC_ATTEMPTS;
let lastSyncPosition = -1;

// DOM Elements
const splashScreen = document.getElementById('splashScreen');
const mainApp = document.getElementById('mainApp');
const nameInput = document.getElementById('nameInput');
const roomInput = document.getElementById('roomInput');
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const roomIdDisplay = document.getElementById('roomIdDisplay');
const copyRoomIdBtn = document.getElementById('copyRoomId');
const userCountDisplay = document.getElementById('userCountDisplay');
let localVideo = document.getElementById('localVideo');
let toggleAudioBtn = document.getElementById('toggleAudioBtn');
let toggleVideoBtn = document.getElementById('toggleVideoBtn');
const videoIdInput = document.getElementById('videoIdInput');
const loadVideoBtn = document.getElementById('loadVideoBtn');
const playBtn = document.getElementById('playBtn');
const pauseBtn = document.getElementById('pauseBtn');
const seekBar = document.getElementById('seekBar');
const currentTimeDisplay = document.getElementById('currentTime');
const totalTimeDisplay = document.getElementById('totalTime');
const messageInput = document.getElementById('messageInput');
const sendMessageBtn = document.getElementById('sendMessageBtn');
const chatMessages = document.getElementById('chatMessages');
const peersContainer = document.getElementById('peersContainer');
const leaveRoomBtn = document.getElementById('leaveRoomBtn');
const localUserName = document.getElementById('localUserName');

// ----- Initialize Socket.IO -----
function initializeSocket() {
    socket = io(SOCKET_URL);
    
    socket.on('connect', () => {
        debugLog('Connected to server');
    });
    
    socket.on('user-joined', ({ userId, userName }) => {
        debugLog(`User joined: ${userName}`);
        showNotification(`${userName} joined the room`, 'info');
        updateUserCount();
    });
    
    socket.on('user-left', ({ userId }) => {
        debugLog(`User left: ${userId}`);
        removePeerConnection(userId);
        updateUserCount();
    });
    
    socket.on('video-state-updated', (videoState) => {
        if (videoState.updatedBy !== currentUser.id) {
            handleVideoStateUpdate(videoState);
        }
    });
    
    socket.on('new-message', (message) => {
        displayMessage(message);
    });
    
    socket.on('webrtc-signal', ({ from, signal }) => {
        handleWebRTCSignal(from, signal);
    });
}

// ----- Event Listeners -----
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM content loaded');
    
    // Initialize Socket.IO
    initializeSocket();
    
    // Login/Room creation
    if (createRoomBtn) {
        createRoomBtn.addEventListener('click', createRoom);
    }
    
    if (joinRoomBtn) {
        joinRoomBtn.addEventListener('click', joinRoom);
    }
    
    nameInput.addEventListener('input', validateInputs);
    roomInput.addEventListener('input', validateInputs);
    
    // Room Actions
    copyRoomIdBtn.addEventListener('click', copyRoomId);
    leaveRoomBtn.addEventListener('click', leaveRoom);
    
    // Video Controls
    loadVideoBtn.addEventListener('click', loadVideo);
    playBtn.addEventListener('click', playVideo);
    pauseBtn.addEventListener('click', pauseVideo);
    seekBar.addEventListener('input', handleSeek);
    toggleAudioBtn.addEventListener('click', toggleAudio);
    toggleVideoBtn.addEventListener('click', toggleVideo);
    
    // Chat
    sendMessageBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', e => {
        if (e.key === 'Enter') sendMessage();
    });

    validateInputs();
});

// ----- Utility Functions -----
function generateUserId() {
    return 'user_' + Math.random().toString(36).substr(2, 9);
}

function generateRoomId() {
    const prefixes = ['avengers', 'stark', 'shield', 'thor', 'hulk', 'widow', 'hawkeye', 'marvel'];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const randomDigits = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
    return `${prefix}_${randomDigits}`;
}

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    seconds = Math.floor(seconds % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function extractYoutubeId(url) {
    if (!url) return null;
    
    if (url.length === 11 && /^[a-zA-Z0-9_-]{11}$/.test(url)) {
        return url;
    }
    
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    
    return (match && match[2].length === 11) ? match[2] : null;
}

function validateInputs() {
    const name = nameInput.value.trim();
    const roomId = roomInput.value.trim();
    
    createRoomBtn.disabled = !name;
    joinRoomBtn.disabled = !name || !roomId;
}

function showNotification(message, type = 'info', duration = 3000) {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerText = message;
    
    const container = document.getElementById('notificationContainer');
    container.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-in-out forwards';
        setTimeout(() => {
            container.removeChild(notification);
        }, 300);
    }, duration);
}

// ----- Room Management -----
async function createRoom() {
    console.log('🎬 createRoom function called');
    const name = nameInput.value.trim();
    console.log('👤 Name entered:', name);
    
    if (!name) {
        alert('Please enter your name first');
        return;
    }
    
    currentUser.name = name;
    currentRoom = generateRoomId();
    localUserName.innerText = name;
    roomHostId = currentUser.id;
    
    console.log('🏠 Creating room:', currentRoom);
    console.log('🔗 API URL:', API_URL);
    
    try {
        console.log('📡 Sending POST request to create room...');
        const response = await fetch(`${API_URL}/rooms`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                roomId: currentRoom,
                hostId: currentUser.id,
                userName: currentUser.name
            })
        });
        
        console.log('📥 Response received:', response.status);
        const data = await response.json();
        console.log('📊 Response data:', data);
        
        if (data.success) {
            console.log('✅ Room created successfully');
            splashScreen.classList.add('hidden');
            mainApp.classList.remove('hidden');
            roomIdDisplay.textContent = currentRoom;
            
            // Join socket room
            socket.emit('join-room', { roomId: currentRoom, userId: currentUser.id });
            
            await initializeUserMedia();
            setupRoomUI();
            setTimeout(initializeYouTubePlayer, 1000);
            updateUserCount();
        } else {
            console.error('❌ Failed to create room:', data.error);
            alert('Failed to create room: ' + data.error);
        }
    } catch (error) {
        console.error('💥 Error creating room:', error);
        alert('Failed to create room. Is the server running?\n\nError: ' + error.message);
    }
}

async function joinRoom() {
    const name = nameInput.value.trim();
    const roomId = roomInput.value.trim();
    if (!name || !roomId) {
        alert('Please enter both your name and the room ID');
        return;
    }
    
    currentUser.name = name;
    currentRoom = roomId;
    localUserName.innerText = name;
    
    try {
        // Check if room exists
        const checkResponse = await fetch(`${API_URL}/rooms/${currentRoom}`);
        const checkData = await checkResponse.json();
        
        if (!checkData.success) {
            alert('Room not found. Please check the Room ID and try again.');
            return;
        }
        
        roomHostId = checkData.room.hostId;
        
        // Join the room
        const joinResponse = await fetch(`${API_URL}/rooms/${currentRoom}/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: currentUser.id,
                userName: currentUser.name
            })
        });
        
        const joinData = await joinResponse.json();
        
        if (joinData.success) {
            splashScreen.classList.add('hidden');
            mainApp.classList.remove('hidden');
            roomIdDisplay.textContent = currentRoom;
            
            // Join socket room
            socket.emit('join-room', { roomId: currentRoom, userId: currentUser.id });
            
            await initializeUserMedia();
            setupRoomUI();
            setTimeout(initializeYouTubePlayer, 1000);
            updateUserCount();
            
            // Load current video state
            const videoState = joinData.room.videoState;
            if (videoState && videoState.videoId && youtubePlayer) {
                setTimeout(() => {
                    youtubePlayer.loadVideoById(videoState.videoId, videoState.currentTime);
                    if (videoState.isPlaying) {
                        youtubePlayer.playVideo();
                    }
                }, 2000);
            }
        }
    } catch (error) {
        console.error('Error joining room:', error);
        alert('Failed to join room. Please try again.');
    }
}

function setupRoomUI() {
    showNotification('Successfully joined the room!', 'success');
}

function copyRoomId() {
    navigator.clipboard.writeText(currentRoom)
        .then(() => showNotification('Room ID copied to clipboard', 'success'))
        .catch(err => {
            debugLog('Could not copy text: ', err);
            showNotification('Failed to copy Room ID', 'error');
        });
}

async function leaveRoom() {
    debugLog('Leaving room');
    
    // Stop all media tracks
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    
    // Destroy all peer connections
    Object.values(peers).forEach(peer => {
        if (peer) peer.destroy();
    });
    
    // Leave socket room
    socket.emit('leave-room', { roomId: currentRoom, userId: currentUser.id });
    
    // Remove from MongoDB
    try {
        await fetch(`${API_URL}/rooms/${currentRoom}/leave`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id })
        });
    } catch (error) {
        console.error('Error leaving room:', error);
    }
    
    // Reset state
    peers = {};
    userConnections = {};
    peerVideosInitialized = {};
    currentRoom = null;
    roomHostId = null;
    isSyncingVideo = false;
    
    // Reset UI
    mainApp.classList.add('hidden');
    splashScreen.classList.remove('hidden');
    chatMessages.innerHTML = '<div class="welcome-message"><p>Welcome to the Avengers Watch Party! Share the Room ID to invite teammates.</p></div>';
    
    showNotification('You have left the room', 'info');
}

async function updateUserCount() {
    if (!currentRoom) return;
    
    try {
        const response = await fetch(`${API_URL}/rooms/${currentRoom}`);
        const data = await response.json();
        
        if (data.success) {
            userCount = data.room.users.size || Object.keys(data.room.users).length || 1;
            userCountDisplay.textContent = userCount;
        }
    } catch (error) {
        console.error('Error updating user count:', error);
    }
}

// ----- Media Handling -----
async function initializeUserMedia() {
    try {
        debugLog('Requesting user media access');
        localStream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                width: { ideal: 640 },
                height: { ideal: 480 },
                facingMode: "user"
            }, 
            audio: true
        });
        
        debugLog('User media access granted');
        localVideo.srcObject = localStream;
        hasInitializedStream = true;
        currentUser.isAudioEnabled = true;
        currentUser.isVideoEnabled = true;
        
        return true;
    } catch (error) {
        debugLog("Error getting user media:", error);
        if (confirm('Failed to access camera/microphone. Join without video/audio?')) {
            localStream = new MediaStream();
            hasInitializedStream = true;
            currentUser.isAudioEnabled = false;
            currentUser.isVideoEnabled = false;
            return true;
        }
        throw error;
    }
}

function toggleAudio() {
    if (!hasInitializedStream) return;
    
    currentUser.isAudioEnabled = !currentUser.isAudioEnabled;
    localStream.getAudioTracks().forEach(track => {
        track.enabled = currentUser.isAudioEnabled;
    });
    
    toggleAudioBtn.innerHTML = currentUser.isAudioEnabled ? 
        '<i class="fas fa-microphone"></i>' : 
        '<i class="fas fa-microphone-slash"></i>';
    toggleAudioBtn.classList.toggle('muted', !currentUser.isAudioEnabled);
    
    showNotification(`Microphone ${currentUser.isAudioEnabled ? 'unmuted' : 'muted'}`, 'info', 2000);
}

function toggleVideo() {
    if (!hasInitializedStream) return;
    
    currentUser.isVideoEnabled = !currentUser.isVideoEnabled;
    localStream.getVideoTracks().forEach(track => {
        track.enabled = currentUser.isVideoEnabled;
    });
    
    toggleVideoBtn.innerHTML = currentUser.isVideoEnabled ? 
        '<i class="fas fa-video"></i>' : 
        '<i class="fas fa-video-slash"></i>';
    toggleVideoBtn.classList.toggle('muted', !currentUser.isVideoEnabled);
    
    showNotification(`Camera ${currentUser.isVideoEnabled ? 'turned on' : 'turned off'}`, 'info', 2000);
}

// ----- YouTube Player -----
function initializeYouTubePlayer() {
    debugLog('Initializing YouTube player');
    youtubePlayer = new YT.Player('youtubePlayer', {
        height: '100%',
        width: '100%',
        playerVars: {
            'playsinline': 1,
            'controls': 0,
            'disablekb': 1,
            'rel': 0,
            'modestbranding': 1,
            'origin': window.location.origin,
            'enablejsapi': 1
        },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange,
            'onError': onPlayerError
        }
    });
}

function onPlayerReady(event) {
    debugLog('YouTube player ready');
    setInterval(updateSeekBar, 100);
}

function onPlayerStateChange(event) {
    if (ignoreStateChanges || isSyncingVideo) return;
    
    const isPlaying = event.data === YT.PlayerState.PLAYING;
    const currentTime = youtubePlayer.getCurrentTime();
    
    updateVideoState(currentTime, isPlaying);
}

function onPlayerError(event) {
    debugLog('YouTube player error:', event.data);
    showNotification('Error loading video', 'error');
}

function loadVideo() {
    const videoInput = videoIdInput.value.trim();
    if (!videoInput) {
        alert('Please enter a YouTube video URL or ID');
        return;
    }
    
    const videoId = extractYoutubeId(videoInput);
    if (!videoId) {
        alert('Invalid YouTube URL or video ID');
        return;
    }
    
    if (youtubePlayer && youtubePlayer.loadVideoById) {
        youtubePlayer.loadVideoById(videoId);
        updateVideoState(0, false, videoId);
        showNotification('Video loaded successfully', 'success');
    }
}

function playVideo() {
    if (youtubePlayer && youtubePlayer.playVideo) {
        youtubePlayer.playVideo();
    }
}

function pauseVideo() {
    if (youtubePlayer && youtubePlayer.pauseVideo) {
        youtubePlayer.pauseVideo();
    }
}

function handleSeek() {
    if (!youtubePlayer) return;
    
    const duration = youtubePlayer.getDuration();
    const seekTime = (seekBar.value / 100) * duration;
    
    youtubePlayer.seekTo(seekTime);
    updateVideoState(seekTime, youtubePlayer.getPlayerState() === YT.PlayerState.PLAYING);
}

async function updateVideoState(currentTime, isPlaying, videoId = null) {
    if (!currentRoom) return;
    
    try {
        await fetch(`${API_URL}/rooms/${currentRoom}/video-state`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                videoId: videoId || (youtubePlayer ? youtubePlayer.getVideoData().video_id : null),
                currentTime,
                isPlaying,
                updatedBy: currentUser.id
            })
        });
    } catch (error) {
        console.error('Error updating video state:', error);
    }
}

function handleVideoStateUpdate(videoState) {
    if (!youtubePlayer || isSyncingVideo) return;
    
    const currentTime = youtubePlayer.getCurrentTime();
    const timeDiff = Math.abs(currentTime - videoState.currentTime);
    
    if (timeDiff > TIME_SYNC_THRESHOLD) {
        isSyncingVideo = true;
        youtubePlayer.seekTo(videoState.currentTime);
        setTimeout(() => { isSyncingVideo = false; }, 1000);
    }
    
    if (videoState.isPlaying && youtubePlayer.getPlayerState() !== YT.PlayerState.PLAYING) {
        youtubePlayer.playVideo();
    } else if (!videoState.isPlaying && youtubePlayer.getPlayerState() === YT.PlayerState.PLAYING) {
        youtubePlayer.pauseVideo();
    }
}

function updateSeekBar() {
    if (!youtubePlayer || !youtubePlayer.getDuration) return;
    
    const duration = youtubePlayer.getDuration();
    const currentTime = youtubePlayer.getCurrentTime();
    
    if (duration > 0) {
        seekBar.value = (currentTime / duration) * 100;
        currentTimeDisplay.textContent = formatTime(currentTime);
        totalTimeDisplay.textContent = formatTime(duration);
    }
}

// ----- Chat -----
async function sendMessage() {
    const message = messageInput.value.trim();
    if (!message || !currentRoom) return;
    
    try {
        await fetch(`${API_URL}/rooms/${currentRoom}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: currentUser.id,
                userName: currentUser.name,
                message
            })
        });
        
        messageInput.value = '';
    } catch (error) {
        console.error('Error sending message:', error);
        showNotification('Failed to send message', 'error');
    }
}

function displayMessage(message) {
    const messageElement = document.createElement('div');
    messageElement.className = 'chat-message';
    
    const isOwnMessage = message.userId === currentUser.id;
    if (isOwnMessage) {
        messageElement.classList.add('own-message');
    }
    
    const time = new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    messageElement.innerHTML = `
        <strong>${message.userName}</strong>
        <span class="timestamp">${time}</span>
        <p>${message.message}</p>
    `;
    
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ----- WebRTC Placeholder Functions -----
function createPeerConnection(userData) {
    // Implement WebRTC peer connection creation
    debugLog('Creating peer connection for:', userData.name);
}

function removePeerConnection(userId) {
    if (peers[userId]) {
        peers[userId].destroy();
        delete peers[userId];
    }
    debugLog('Removed peer connection for:', userId);
}

function handleWebRTCSignal(from, signal) {
    debugLog('Received WebRTC signal from:', from);
    // Implement WebRTC signaling
}
