// ----- Firebase Config -----
const firebaseConfig = {
  apiKey: "AIzaSyAuPkckM3g-LczCpXzbRKTf506dSA0VQuE",
  authDomain: "bingebase-c9caf.firebaseapp.com",
  databaseURL: "https://bingebase-c9caf-default-rtdb.firebaseio.com/",
  projectId: "bingebase-c9caf",
  storageBucket: "bingebase-c9caf.appspot.com",
  messagingSenderId: "634535708109",
  appId: "1:634535708109:web:77a69f32874bb8f4083084",
  measurementId: "G-V27LVY4HRH"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

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
let isSyncingVideo = false;
let hasInitializedStream = false;

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
const localVideo = document.getElementById('localVideo');
const toggleAudioBtn = document.getElementById('toggleAudioBtn');
const toggleVideoBtn = document.getElementById('toggleVideoBtn');
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

// ----- Event Listeners -----
document.addEventListener('DOMContentLoaded', () => {
    // Login/Room creation
    createRoomBtn.addEventListener('click', createRoom);
    joinRoomBtn.addEventListener('click', joinRoom);
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

    // Initial validation
    validateInputs();
});

// ----- Utility Functions -----
function generateUserId() {
    return 'user_' + Math.random().toString(36).substr(2, 9);
}

function generateRoomId() {
    // Generate a unique room ID with Avengers theme
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
    
    // If it's already a video ID (11 characters)
    if (url.length === 11 && /^[a-zA-Z0-9_-]{11}$/.test(url)) {
        return url;
    }
    
    // Try to extract from URL
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    
    return (match && match[2].length === 11) ? match[2] : null;
}

function validateInputs() {
    const name = nameInput.value.trim();
    const roomId = roomInput.value.trim();
    
    // For creating a room, only name is required
    createRoomBtn.disabled = !name;
    
    // For joining a room, both name and room ID are required
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
function createRoom() {
    const name = nameInput.value.trim();
    if (!name) return;
    
    currentUser.name = name;
    currentRoom = generateRoomId();
    localUserName.innerText = name;
    initializeRoom(true);
}

function joinRoom() {
    const name = nameInput.value.trim();
    const roomId = roomInput.value.trim();
    if (!name || !roomId) return;
    
    currentUser.name = name;
    currentRoom = roomId;
    localUserName.innerText = name;
    initializeRoom(false);
}

function initializeRoom(isCreator) {
    // Set up the room in Firebase
    const roomRef = db.ref(`rooms/${currentRoom}`);
    
    if (isCreator) {
        // Create room with initial state
        roomRef.set({
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            createdBy: currentUser.id,
            activeUsers: { [currentUser.id]: currentUser.name },
            videoState: {
                videoId: '',
                isPlaying: false,
                currentTime: 0,
                lastUpdated: firebase.database.ServerValue.TIMESTAMP
            }
        }).then(() => {
            enterRoom();
        }).catch(error => {
            showNotification('Error creating room: ' + error.message, 'error');
        });
    } else {
        // Check if room exists
        roomRef.once('value', snapshot => {
            if (snapshot.exists()) {
                enterRoom();
            } else {
                showNotification('Room not found. Check the Room ID and try again.', 'error');
            }
        });
    }
}

function enterRoom() {
    // Initialize user media (camera/mic)
    initializeUserMedia()
        .then(() => {
            // Show main app, hide splash screen
            splashScreen.classList.add('hidden');
            mainApp.classList.remove('hidden');
            roomIdDisplay.textContent = currentRoom;
            
            // Set up Firebase listeners
            setupFirebaseListeners();
            
            // Initialize YouTube player
            initializeYouTubePlayer();
            
            // Announce user joined
            const userRef = db.ref(`rooms/${currentRoom}/activeUsers/${currentUser.id}`);
            userRef.set(currentUser.name);
            userRef.onDisconnect().remove();
            
            // Add user data to presence system
            const connectionRef = db.ref(`rooms/${currentRoom}/connections/${currentUser.id}`);
            connectionRef.set({
                id: currentUser.id,
                name: currentUser.name,
                timestamp: firebase.database.ServerValue.TIMESTAMP,
                isAudioEnabled: currentUser.isAudioEnabled,
                isVideoEnabled: currentUser.isVideoEnabled
            });
            connectionRef.onDisconnect().remove();
            
            showNotification('Successfully joined the room!', 'success');
        })
        .catch(error => {
            showNotification('Error accessing camera/microphone: ' + error.message, 'error');
            console.error('Media error:', error);
        });
}

function setupFirebaseListeners() {
    // Watch for user changes (join/leave)
    db.ref(`rooms/${currentRoom}/activeUsers`).on('value', snapshot => {
        const users = snapshot.val() || {};
        userCount = Object.keys(users).length;
        userCountDisplay.textContent = userCount;
        
        // If we're the only user left, clean up any peer connections
        if (userCount === 1) {
            Object.keys(peers).forEach(peerId => {
                if (peers[peerId]) {
                    peers[peerId].destroy();
                    delete peers[peerId];
                }
            });
        }
    });
    
    // Watch for user connections (for WebRTC)
    db.ref(`rooms/${currentRoom}/connections`).on('child_added', snapshot => {
        const userData = snapshot.val();
        if (userData.id !== currentUser.id) {
            // New user connected, initiate peer connection
            createPeerConnection(userData);
        }
    });
    
    db.ref(`rooms/${currentRoom}/connections`).on('child_removed', snapshot => {
        const userData = snapshot.val();
        if (userData && userData.id) {
            // User disconnected, clean up their peer connection
            removePeerConnection(userData.id);
        }
    });
    
    // Watch for user connection updates (audio/video states)
    db.ref(`rooms/${currentRoom}/connections`).on('child_changed', snapshot => {
        const userData = snapshot.val();
        if (userData.id !== currentUser.id) {
            // Update the audio/video state in the UI
            updatePeerMediaState(userData);
        }
    });
    
    // Watch for video state changes (play/pause/seek)
    db.ref(`rooms/${currentRoom}/videoState`).on('value', snapshot => {
        const videoState = snapshot.val();
        if (!videoState) return;
        
        // Don't react to our own update
        if (isSyncingVideo) {
            isSyncingVideo = false;
            return;
        }
        
        // Apply the new state to our player
        if (youtubePlayer && youtubePlayer.getPlayerState !== undefined) {
            if (videoState.videoId && videoState.videoId !== youtubePlayer.getVideoData().video_id) {
                youtubePlayer.loadVideoById(videoState.videoId);
            }
            
            // Sync play state
            if (videoState.isPlaying && youtubePlayer.getPlayerState() !== YT.PlayerState.PLAYING) {
                youtubePlayer.playVideo();
            } else if (!videoState.isPlaying && youtubePlayer.getPlayerState() === YT.PlayerState.PLAYING) {
                youtubePlayer.pauseVideo();
            }
            
            // Sync position (only if difference is significant)
            const currentTime = youtubePlayer.getCurrentTime();
            const timeDiff = Math.abs(currentTime - videoState.currentTime);
            if (timeDiff > 2) {
                youtubePlayer.seekTo(videoState.currentTime, true);
            }
            
            // Update seekbar
            updateSeekBar();
        }
    });
    
    // Watch for chat messages
    db.ref(`rooms/${currentRoom}/messages`).on('child_added', snapshot => {
        const message = snapshot.val();
        displayMessage(message);
    });
    
    // Watch for WebRTC signaling messages
    db.ref(`rooms/${currentRoom}/signals/${currentUser.id}`).on('child_added', snapshot => {
        const signal = snapshot.val();
        if (signal.type === 'offer') {
            handleOfferSignal(signal);
        } else if (signal.type === 'answer') {
            handleAnswerSignal(signal);
        } else if (signal.type === 'ice-candidate') {
            handleIceCandidateSignal(signal);
        }
        
        // Remove the signal once processed
        snapshot.ref.remove();
    });
}

function copyRoomId() {
    navigator.clipboard.writeText(currentRoom)
        .then(() => {
            showNotification('Room ID copied to clipboard', 'success');
        })
        .catch(err => {
            console.error('Could not copy text: ', err);
            showNotification('Failed to copy Room ID', 'error');
        });
}

function leaveRoom() {
    // Stop all media tracks
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    
    // Destroy all peer connections
    Object.values(peers).forEach(peer => {
        if (peer) peer.destroy();
    });
    
    // Remove from Firebase
    db.ref(`rooms/${currentRoom}/activeUsers/${currentUser.id}`).remove();
    db.ref(`rooms/${currentRoom}/connections/${currentUser.id}`).remove();
    
    // Clear all Firebase listeners
    db.ref(`rooms/${currentRoom}/activeUsers`).off();
    db.ref(`rooms/${currentRoom}/connections`).off();
    db.ref(`rooms/${currentRoom}/videoState`).off();
    db.ref(`rooms/${currentRoom}/messages`).off();
    db.ref(`rooms/${currentRoom}/signals/${currentUser.id}`).off();
    
    // Reset global variables
    peers = {};
    userConnections = {};
    currentRoom = null;
    
    // Reset UI
    mainApp.classList.add('hidden');
    splashScreen.classList.remove('hidden');
    chatMessages.innerHTML = '<div class="welcome-message"><p>Welcome to the Avengers Watch Party! Share the Room ID to invite teammates.</p></div>';
    peersContainer.innerHTML = `
        <div class="video-container local-video-container">
            <video id="localVideo" autoplay muted playsinline></video>
            <div class="video-overlay">
                <span class="user-name" id="localUserName">You</span>
                <div class="video-controls">
                    <button id="toggleAudioBtn" class="control-btn"><i class="fas fa-microphone"></i></button>
                    <button id="toggleVideoBtn" class="control-btn"><i class="fas fa-video"></i></button>
                </div>
            </div>
        </div>
    `;
    
    // Update local video reference (it was re-created)
    localVideo = document.getElementById('localVideo');
    toggleAudioBtn = document.getElementById('toggleAudioBtn');
    toggleVideoBtn = document.getElementById('toggleVideoBtn');
    
    // Re-add the event listeners
    toggleAudioBtn.addEventListener('click', toggleAudio);
    toggleVideoBtn.addEventListener('click', toggleVideo);
    
    showNotification('You have left the room', 'info');
}

// ----- Media Handling -----
async function initializeUserMedia() {
    try {
        // Request camera and microphone access
        localStream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                width: { ideal: 640 },
                height: { ideal: 480 },
                facingMode: "user"
            }, 
            audio: true
        });
        
        // Display local video
        localVideo.srcObject = localStream;
        hasInitializedStream = true;
        
        // Set initial states
        currentUser.isAudioEnabled = true;
        currentUser.isVideoEnabled = true;
        
        return true;
    } catch (error) {
        console.error("Error getting user media:", error);
        throw error;
    }
}

function toggleAudio() {
    if (!hasInitializedStream) return;
    
    currentUser.isAudioEnabled = !currentUser.isAudioEnabled;
    
    // Update local audio tracks
    localStream.getAudioTracks().forEach(track => {
        track.enabled = currentUser.isAudioEnabled;
    });
    
    // Update UI
    toggleAudioBtn.innerHTML = currentUser.isAudioEnabled ? 
        '<i class="fas fa-microphone"></i>' : 
        '<i class="fas fa-microphone-slash"></i>';
    
    toggleAudioBtn.classList.toggle('muted', !currentUser.isAudioEnabled);
    
    // Update Firebase
    db.ref(`rooms/${currentRoom}/connections/${currentUser.id}`).update({
        isAudioEnabled: currentUser.isAudioEnabled
    });
    
    showNotification(`Microphone ${currentUser.isAudioEnabled ? 'unmuted' : 'muted'}`, 'info', 2000);
}

function toggleVideo() {
    if (!hasInitializedStream) return;
    
    currentUser.isVideoEnabled = !currentUser.isVideoEnabled;
    
    // Update local video tracks
    localStream.getVideoTracks().forEach(track => {
        track.enabled = currentUser.isVideoEnabled;
    });
    
    // Update UI
    toggleVideoBtn.innerHTML = currentUser.isVideoEnabled ? 
        '<i class="fas fa-video"></i>' : 
        '<i class="fas fa-video-slash"></i>';
    
    toggleVideoBtn.classList.toggle('muted', !currentUser.isVideoEnabled);
    
    // Update Firebase
    db.ref(`rooms/${currentRoom}/connections/${currentUser.id}`).update({
        isVideoEnabled: currentUser.isVideoEnabled
    });
    
    showNotification(`Camera ${currentUser.isVideoEnabled ? 'turned on' : 'turned off'}`, 'info', 2000);
}

// ----- YouTube Player -----
function initializeYouTubePlayer() {
    youtubePlayer = new YT.Player('youtubePlayer', {
        height: '100%',
        width: '100%',
        playerVars: {
            'playsinline': 1,
            'controls': 0,
            'disablekb': 1,
            'rel': 0
        },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange,
            'onError': onPlayerError
        }
    });
}

function onPlayerReady(event) {
    // Check if there's already a video loaded in the room
    db.ref(`rooms/${currentRoom}/videoState`).once('value', snapshot => {
        const videoState = snapshot.val();
        if (videoState && videoState.videoId) {
            // Load the existing video
            youtubePlayer.loadVideoById(videoState.videoId, videoState.currentTime);
            
            // Match play/pause state
            if (videoState.isPlaying) {
                youtubePlayer.playVideo();
            } else {
                youtubePlayer.pauseVideo();
            }
            
            // Update the video ID input field
            videoIdInput.value = videoState.videoId;
        }
    });
    
    // Start seeking bar update interval
    setInterval(updateSeekBar, 1000);
}

function onPlayerStateChange(event) {
    // Triggered when video state changes (play, pause, etc.)
    if (event.data === YT.PlayerState.PLAYING) {
        updateVideoState(true, youtubePlayer.getCurrentTime());
    } else if (event.data === YT.PlayerState.PAUSED) {
        updateVideoState(false, youtubePlayer.getCurrentTime());
    }
}

function onPlayerError(event) {
    const errorMessages = {
        2: "Invalid YouTube video ID",
        5: "HTML5 player error",
        100: "Video not found or removed",
        101: "Video owner doesn't allow embedding",
        150: "Video owner doesn't allow embedding"
    };
    
    const errorMessage = errorMessages[event.data] || "Unknown YouTube error";
    showNotification(`YouTube Error: ${errorMessage}`, 'error');
}

function loadVideo() {
    const videoUrl = videoIdInput.value.trim();
    const videoId = extractYoutubeId(videoUrl);
    
    if (!videoId) {
        showNotification('Please enter a valid YouTube URL or video ID', 'error');
        return;
    }
    
    // Load the video in YouTube player
    youtubePlayer.loadVideoById(videoId);
    youtubePlayer.pauseVideo(); // Start paused to allow sync
    
    // Update Firebase with new video
    isSyncingVideo = true;
    db.ref(`rooms/${currentRoom}/videoState`).update({
        videoId: videoId,
        isPlaying: false,
        currentTime: 0,
        lastUpdated: firebase.database.ServerValue.TIMESTAMP
    });
    
    showNotification('Video loaded successfully', 'success');
}

function playVideo() {
    if (!youtubePlayer || !youtubePlayer.playVideo) return;
    youtubePlayer.playVideo();
}

function pauseVideo() {
    if (!youtubePlayer || !youtubePlayer.pauseVideo) return;
    youtubePlayer.pauseVideo();
}

function handleSeek() {
    if (!youtubePlayer || !youtubePlayer.getDuration) return;
    
    const seekValue = parseFloat(seekBar.value);
    const duration = youtubePlayer.getDuration();
    const newTime = (duration * seekValue) / 100;
    
    youtubePlayer.seekTo(newTime, true);
    
    // Update Firebase
    updateVideoState(youtubePlayer.getPlayerState() === YT.PlayerState.PLAYING, newTime);
}

function updateSeekBar() {
    if (!youtubePlayer || !youtubePlayer.getCurrentTime || !youtubePlayer.getDuration) return;
    
    try {
        const currentTime = youtubePlayer.getCurrentTime() || 0;
        const duration = youtubePlayer.getDuration() || 0;
        
        if (duration > 0) {
            const percentage = (currentTime / duration) * 100;
            seekBar.value = percentage;
            
            currentTimeDisplay.textContent = formatTime(currentTime);
            totalTimeDisplay.textContent = formatTime(duration);
        }
    } catch (error) {
        console.error("Error updating seek bar:", error);
    }
}

function updateVideoState(isPlaying, currentTime) {
    if (!currentRoom) return;
    
    // Prevent recursive updates
    isSyncingVideo = true;
    
    // Update Firebase with current state
    db.ref(`rooms/${currentRoom}/videoState`).update({
        isPlaying: isPlaying,
        currentTime: currentTime,
        lastUpdated: firebase.database.ServerValue.TIMESTAMP
    });
}

// ----- Chat Functions -----
function sendMessage() {
    const messageText = messageInput.value.trim();
    if (!messageText) return;
    
    // Create message object
    const message = {
        sender: currentUser.name,
        senderId: currentUser.id,
        text: messageText,
        timestamp: firebase.database.ServerValue.TIMESTAMP
    };
    
    // Add to Firebase
    db.ref(`rooms/${currentRoom}/messages`).push(message);
    
    // Clear input field
    messageInput.value = '';
}

function displayMessage(message) {
    const isCurrentUser = message.senderId === currentUser.id;
    
    const messageElement = document.createElement('div');
    messageElement.className = `message ${isCurrentUser ? 'outgoing' : 'incoming'}`;
    
    if (!isCurrentUser) {
        const senderElement = document.createElement('div');
        senderElement.className = 'sender';
        senderElement.textContent = message.sender;
        messageElement.appendChild(senderElement);
    }
    
    const contentElement = document.createElement('div');
    contentElement.className = 'content';
    contentElement.textContent = message.text;
    messageElement.appendChild(contentElement);
    
    // Add timestamp as data attribute
    messageElement.dataset.timestamp = message.timestamp;
    
    chatMessages.appendChild(messageElement);
    
    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ----- WebRTC Peer Connection -----
function createPeerConnection(userData) {
    const peerId = userData.id;
    
    // Check if we already have a connection with this peer
    if (peers[peerId]) return;
    
    console.log(`Creating connection with peer: ${userData.name} (${peerId})`);
    
    // Create a new peer connection
    const peer = new SimplePeer({
        initiator: currentUser.id > peerId, // Deterministic initiator based on ID comparison
        trickle: false,
        stream: localStream
    });
    
    // Store the peer connection
    peers[peerId] = peer;
    userConnections[peerId] = userData;
    
    // Handle signals (WebRTC negotiation)
    peer.on('signal', signal => {
        const signalType = signal.type || (signal.sdp ? 'offer' : 'ice-candidate');
        
        // Send signal to Firebase
        db.ref(`rooms/${currentRoom}/signals/${peerId}`).push({
            from: currentUser.id,
            type: signalType,
            data: signal,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });
    });
    
    // Handle incoming stream
    peer.on('stream', stream => {
        // Create video element for the peer
        addPeerVideo(peerId, userData.name, stream);
        updatePeerMediaState(userData);
    });
    
    // Handle connection close
    peer.on('close', () => {
        removePeerConnection(peerId);
    });
    
    // Handle errors
    peer.on('error', err => {
        console.error(`WebRTC error with peer ${userData.name}:`, err);
        showNotification(`Connection error with ${userData.name}`, 'error');
    });
}

function handleOfferSignal(signal) {
    const peerId = signal.from;
    const peerData = userConnections[peerId];
    
    if (!peerData) {
        console.error(`Received offer from unknown peer: ${peerId}`);
        return;
    }
    
    if (!peers[peerId]) {
        // Create new peer connection if it doesn't exist yet
        createPeerConnection(peerData);
    }
    
    // Apply the offer signal
    peers[peerId].signal(signal.data);
}

function handleAnswerSignal(signal) {
    const peerId = signal.from;
    
    if (!peers[peerId]) {
        console.error(`Received answer from unknown peer: ${peerId}`);
        return;
    }
    
    // Apply the answer signal
    peers[peerId].signal(signal.data);
}

function handleIceCandidateSignal(signal) {
    const peerId = signal.from;
    
    if (!peers[peerId]) {
        console.error(`Received ICE candidate from unknown peer: ${peerId}`);
        return;
    }
    
    // Apply the ICE candidate signal
    peers[peerId].signal(signal.data);
}

function addPeerVideo(peerId, peerName, stream) {
    // Check if the peer video already exists
    let peerVideoContainer = document.getElementById(`peer-${peerId}`);
    
    if (!peerVideoContainer) {
        // Create a new video container
        peerVideoContainer = document.createElement('div');
        peerVideoContainer.className = 'video-container';
        peerVideoContainer.id = `peer-${peerId}`;
        
        // Create the video element
        const peerVideo = document.createElement('video');
        peerVideo.autoplay = true;
        peerVideo.playsinline = true;
        peerVideo.id = `video-${peerId}`;
        
        // Create overlay with name and controls
        const overlay = document.createElement('div');
        overlay.className = 'video-overlay';
        
        const nameSpan = document.createElement('span');
        nameSpan.className = 'user-name';
        nameSpan.textContent = peerName;
        
        // Add the elements to the DOM
        overlay.appendChild(nameSpan);
        peerVideoContainer.appendChild(peerVideo);
        peerVideoContainer.appendChild(overlay);
        peersContainer.appendChild(peerVideoContainer);
        
        // Set the stream
        peerVideo.srcObject = stream;
    } else {
        // Just update the stream for existing video
        const peerVideo = document.getElementById(`video-${peerId}`);
        peerVideo.srcObject = stream;
    }
}

function updatePeerMediaState(userData) {
    if (!userData) return;
    
    const peerId = userData.id;
    const peerVideoContainer = document.getElementById(`peer-${peerId}`);
    
    if (peerVideoContainer) {
        // Check if the overlay contains audio/video indicators
        let overlay = peerVideoContainer.querySelector('.video-overlay');
        let audioIcon = overlay.querySelector('.audio-state');
        let videoIcon = overlay.querySelector('.video-state');
        
        // Create icons if they don't exist
        if (!audioIcon) {
            audioIcon = document.createElement('div');
            audioIcon.className = 'audio-state';
            overlay.appendChild(audioIcon);
        }
        
        if (!videoIcon) {
            videoIcon = document.createElement('div');
            videoIcon.className = 'video-state';
            overlay.appendChild(videoIcon);
        }
        
        // Update icons based on state
        audioIcon.innerHTML = userData.isAudioEnabled ? 
            '<i class="fas fa-microphone"></i>' : 
            '<i class="fas fa-microphone-slash"></i>';
        
        videoIcon.innerHTML = userData.isVideoEnabled ? 
            '<i class="fas fa-video"></i>' : 
            '<i class="fas fa-video-slash"></i>';
        
        // Add muted class if needed
        audioIcon.classList.toggle('muted', !userData.isAudioEnabled);
        videoIcon.classList.toggle('muted', !userData.isVideoEnabled);
    }
}

function removePeerConnection(peerId) {
    // Destroy and remove the peer connection
    if (peers[peerId]) {
        peers[peerId].destroy();
        delete peers[peerId];
    }
    
    // Remove from connections list
    if (userConnections[peerId]) {
        delete userConnections[peerId];
    }
    
    // Remove video element
    const peerVideoContainer = document.getElementById(`peer-${peerId}`);
    if (peerVideoContainer) {
        peersContainer.removeChild(peerVideoContainer);
    }
    
    console.log(`Removed peer: ${peerId}`);
}
