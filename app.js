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

// Debug mode for troubleshooting
const DEBUG = true;

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
let isSyncingVideo = false;
let hasInitializedStream = false;

// New sync control variables with modified values for better performance
let lastSyncTime = 0; // Track when we last performed a sync
let ignoreNextStateChange = false; // Flag to ignore state changes caused by our own sync
const SYNC_COOLDOWN = 8000; // Minimum time between syncs (increased to 8 seconds)
const TIME_SYNC_THRESHOLD = 3; // Only sync if time difference is greater than this (seconds) - reduced from 50 to 3

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
            
            // Wait a bit before initializing YouTube player to ensure DOM is ready
            setTimeout(() => {
                initializeYouTubePlayer();
            }, 1000);
            
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
            
            // Add sync button to the interface
            const videoControls = document.querySelector('.video-controls');
            if (videoControls && !document.getElementById('syncBtn')) {
                const syncBtn = document.createElement('button');
                syncBtn.id = 'syncBtn';
                syncBtn.innerHTML = '<i class="fas fa-sync"></i> Force Sync';
                syncBtn.addEventListener('click', forceSyncWithRemote);
                videoControls.appendChild(syncBtn);
            }
            
            showNotification('Successfully joined the room!', 'success');
        })
        .catch(error => {
            showNotification('Error accessing camera/microphone: ' + error.message, 'error');
            debugLog('Media error:', error);
            
            // Allow joining without camera/mic
            if (confirm('Failed to access camera/microphone. Would you like to join without video/audio?')) {
                // Create an empty stream as a fallback
                localStream = new MediaStream();
                
                // Show main app, hide splash screen
                splashScreen.classList.add('hidden');
                mainApp.classList.remove('hidden');
                roomIdDisplay.textContent = currentRoom;
                
                // Set up Firebase listeners
                setupFirebaseListeners();
                
                setTimeout(() => {
                    initializeYouTubePlayer();
                }, 1000);
                
                // Set initial states
                currentUser.isAudioEnabled = false;
                currentUser.isVideoEnabled = false;
                hasInitializedStream = true;
                
                // Update UI to show muted state
                toggleAudioBtn.innerHTML = '<i class="fas fa-microphone-slash"></i>';
                toggleVideoBtn.innerHTML = '<i class="fas fa-video-slash"></i>';
                toggleAudioBtn.classList.add('muted');
                toggleVideoBtn.classList.add('muted');
                
                // Add user to the room
                const userRef = db.ref(`rooms/${currentRoom}/activeUsers/${currentUser.id}`);
                userRef.set(currentUser.name);
                userRef.onDisconnect().remove();
                
                const connectionRef = db.ref(`rooms/${currentRoom}/connections/${currentUser.id}`);
                connectionRef.set({
                    id: currentUser.id,
                    name: currentUser.name,
                    timestamp: firebase.database.ServerValue.TIMESTAMP,
                    isAudioEnabled: false,
                    isVideoEnabled: false
                });
                connectionRef.onDisconnect().remove();
                
                showNotification('Joined without camera/microphone', 'info');
            }
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
        if (userData && userData.id !== currentUser.id) {
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
        if (userData && userData.id !== currentUser.id) {
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
            return;
        }
        
        // Avoid excessive syncs
        const now = Date.now();
        if (now - lastSyncTime < SYNC_COOLDOWN) {
            debugLog('Ignoring video state update during cooldown period');
            return;
        }
        
        // Apply the new state to our player
        if (youtubePlayer && youtubePlayer.getPlayerState !== undefined) {
            // If this update was from us, ignore it
            if (videoState.updatedBy === currentUser.id) {
                debugLog('Ignoring state update from self');
                return;
            }
            
            debugLog('Received video state update from Firebase:', videoState);
            
            // Check if we should apply this update
            const currentTime = youtubePlayer.getCurrentTime();
            const timeDiff = Math.abs(currentTime - videoState.currentTime);
            
            if (timeDiff > TIME_SYNC_THRESHOLD) {
                debugLog(`Time significantly different (${timeDiff.toFixed(2)}s), syncing to remote`);
                ignoreNextStateChange = true;
                youtubePlayer.seekTo(videoState.currentTime, true);
            }
            
            // Sync play state
            if (videoState.isPlaying && youtubePlayer.getPlayerState() !== YT.PlayerState.PLAYING) {
                debugLog('Remote is playing, but we are not - playing video');
                ignoreNextStateChange = true;
                youtubePlayer.playVideo();
            } else if (!videoState.isPlaying && youtubePlayer.getPlayerState() === YT.PlayerState.PLAYING) {
                debugLog('Remote is paused, but we are playing - pausing video');
                ignoreNextStateChange = true;
                youtubePlayer.pauseVideo();
            }
            
            lastSyncTime = now;
            
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
            debugLog('Could not copy text: ', err);
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
        debugLog('Requesting user media access');
        // Request camera and microphone access
        localStream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                width: { ideal: 640 },
                height: { ideal: 480 },
                facingMode: "user"
            }, 
            audio: true
        });
        
        debugLog('User media access granted');
        
        // Display local video
        localVideo.srcObject = localStream;
        hasInitializedStream = true;
        
        // Set initial states
        currentUser.isAudioEnabled = true;
        currentUser.isVideoEnabled = true;
        
        return true;
    } catch (error) {
        debugLog("Error getting user media:", error);
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
            'origin': window.location.origin
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
    
    // Check if there's already a video loaded in the room
    db.ref(`rooms/${currentRoom}/videoState`).once('value', snapshot => {
        const videoState = snapshot.val();
        if (videoState && videoState.videoId) {
            debugLog(`Loading existing video: ${videoState.videoId} at time ${videoState.currentTime}`);
            
            // Load the existing video
            ignoreNextStateChange = true;
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
    
    // Start seeking bar update interval - this doesn't trigger syncs, just updates UI
    setInterval(updateSeekBar, 1000);
    
    // Add a single consolidated sync checker with rate limiting
    setInterval(checkForSyncNeeded, 3000);
}

// IMPROVED: Enhanced sync check function to better handle synchronization issues
function checkForSyncNeeded() {
    // Don't check if we're already syncing or if not enough time has passed
    const now = Date.now();
    if (isSyncingVideo || now - lastSyncTime < SYNC_COOLDOWN) return;
    
    try {
        db.ref(`rooms/${currentRoom}/videoState`).once('value', snapshot => {
            const remoteState = snapshot.val();
            if (!remoteState || !youtubePlayer || !youtubePlayer.getCurrentTime) return;
            
            // Don't sync if this update was from us
            if (remoteState.updatedBy === currentUser.id && now - remoteState.lastUpdated < 10000) {
                return;
            }
            
            const localTime = youtubePlayer.getCurrentTime();
            const localIsPlaying = youtubePlayer.getPlayerState() === YT.PlayerState.PLAYING;
            const timeDiff = Math.abs(localTime - remoteState.currentTime);
            
            let needsSync = false;
            let syncReason = '';
            
            // Check if we need to sync playback state (playing/paused)
            if (remoteState.isPlaying !== localIsPlaying) {
                needsSync = true;
                syncReason = `Play state mismatch: Remote=${remoteState.isPlaying}, Local=${localIsPlaying}`;
            }
            
            // Only sync time if difference is significant
            else if (timeDiff > TIME_SYNC_THRESHOLD) {
                const duration = youtubePlayer.getDuration();
                
                // Prevent sync loops by checking if we're in a reasonable playback position
                if (localTime > 0 && localTime < duration && 
                    remoteState.currentTime > 0 && remoteState.currentTime < duration) {
                    needsSync = true;
                    syncReason = `Time difference: ${timeDiff.toFixed(2)}s (Local: ${localTime.toFixed(2)}, Remote: ${remoteState.currentTime.toFixed(2)})`;
                }
            }
            
            if (needsSync) {
                debugLog(`Sync needed: ${syncReason}`);
                performSync(remoteState);
            }
        });
    } catch (err) {
        debugLog('Error in sync check:', err);
    }
}

// IMPROVED: Enhanced sync function to prevent race conditions and cascading updates
function performSync(remoteState) {
    lastSyncTime = Date.now();
    isSyncingVideo = true;
    ignoreNextStateChange = true;
    
    // First sync the time if needed
    const timeDiff = Math.abs(youtubePlayer.getCurrentTime() - remoteState.currentTime);
    if (timeDiff > TIME_SYNC_THRESHOLD) {
        youtubePlayer.seekTo(remoteState.currentTime, true);
    }
    
    // Then sync the play state
    if (remoteState.isPlaying && youtubePlayer.getPlayerState() !== YT.PlayerState.PLAYING) {
        youtubePlayer.playVideo();
    } else if (!remoteState.isPlaying && youtubePlayer.getPlayerState() === YT.PlayerState.PLAYING) {
        youtubePlayer.pauseVideo();
    }
    
    // Reset sync flags after a longer delay to ensure state changes have completed
    setTimeout(() => {
        isSyncingVideo = false;
    }, 1500);
    
    // Reset ignoreNextStateChange after even longer to catch any delayed events
    setTimeout(() => {
        ignoreNextStateChange = false;
    }, 2000);
}

function onPlayerStateChange(event) {
    // Don't process if this state change was triggered by our own sync
    if (ignoreNextStateChange) {
        debugLog('Ignoring state change caused by sync');
        ignoreNextStateChange = false;
        return;
    }
    
    // Don't update if a sync was performed too recently
    const now = Date.now();
    if (now - lastSyncTime < SYNC_COOLDOWN) {
        debugLog('Ignoring state change during sync cooldown period');
        return;
    }
    
    switch (event.data) {
        case YT.PlayerState.PLAYING:
            debugLog('Player state change: PLAYING');
            updateVideoState(true, youtubePlayer.getCurrentTime());
            break;
        case YT.PlayerState.PAUSED:
            debugLog('Player state change: PAUSED');
            updateVideoState(false, youtubePlayer.getCurrentTime());
            break;
        case YT.PlayerState.ENDED:
            debugLog('Player state change: ENDED');
            updateVideoState(false, 0);
            break;
        case YT.PlayerState.BUFFERING:
            debugLog('Player state change: BUFFERING');
            // Don't update state during buffering
            break;
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
    debugLog('YouTube player error:', event.data, errorMessage);
}

function loadVideo() {
    const videoUrl = videoIdInput.value.trim();
    const videoId = extractYoutubeId(videoUrl);
    
    if (!videoId) {
        showNotification('Please enter a valid YouTube URL or video ID', 'error');
        return;
    }
    
    // Show loading notification
    showNotification('Loading video...', 'info', 2000);
    
    // Set flags to prevent sync loops
    ignoreNextStateChange = true;
    lastSyncTime = Date.now();
    
    // Load the video in YouTube player
    youtubePlayer.loadVideoById(videoId);
    youtubePlayer.pauseVideo(); // Start paused to allow sync
    
    // Update Firebase with new video
    isSyncingVideo = true;
    db.ref(`rooms/${currentRoom}/videoState`).update({
        videoId: videoId,
        isPlaying: false,
        currentTime: 0,
        lastUpdated: firebase.database.ServerValue.TIMESTAMP,
        updatedBy: currentUser.id
    }).then(() => {
        showNotification('Video loaded successfully', 'success');
        
        // Broadcast a chat message about the new video
        const message = {
            sender: 'System',
            senderId: 'system',
            text: `${currentUser.name} has loaded a new video`,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        };
        db.ref(`rooms/${currentRoom}/messages`).push(message);
    }).catch(error => {
        showNotification('Error loading video', 'error');
        debugLog('Error updating video state:', error);
    });
    
    // Reset sync flags after a delay
    setTimeout(() => {
        isSyncingVideo = false;
        ignoreNextStateChange = false;
    }, 2000); // Extended from 1000 to 2000ms to allow for YouTube API delays
}

function playVideo() {
    if (!youtubePlayer || !youtubePlayer.playVideo) return;
    
    ignoreNextStateChange = true;
    lastSyncTime = Date.now();
    youtubePlayer.playVideo();
}

function pauseVideo() {
    if (!youtubePlayer || !youtubePlayer.pauseVideo) return;
    
    ignoreNextStateChange = true;
    lastSyncTime = Date.now();
    youtubePlayer.pauseVideo();
}

function handleSeek() {
    if (!youtubePlayer || !youtubePlayer.getDuration) return;
    
    const seekValue = parseFloat(seekBar.value);
    const duration = youtubePlayer.getDuration();
    const newTime = (duration * seekValue) / 100;
    
    // Set flags to prevent echo effects
    ignoreNextStateChange = true;
    lastSyncTime = Date.now();
    
    // Perform the seek
    youtubePlayer.seekTo(newTime, true);
    
    // Wait a bit to update Firebase to make sure the seekTo has completed
    setTimeout(() => {
        updateVideoState(youtubePlayer.getPlayerState() === YT.PlayerState.PLAYING, newTime);
    }, 300); // Increased from 200 to 300ms for better stability
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
        debugLog("Error updating seek bar:", error);
    }
}

function updateVideoState(isPlaying, currentTime) {
    if (!currentRoom) return;
    
    // Update with a timestamp so clients can determine which update is newest
    lastSyncTime = Date.now();
    isSyncingVideo = true;
    
    debugLog(`Updating video state: playing=${isPlaying}, time=${currentTime.toFixed(2)}`);
    
    // Update Firebase with current state
    db.ref(`rooms/${currentRoom}/videoState`).update({
        isPlaying: isPlaying,
        currentTime: currentTime,
        lastUpdated: firebase.database.ServerValue.TIMESTAMP,
        updatedBy: currentUser.id  // Track who made this update
    }).catch(err => {
        debugLog('Error updating video state:', err);
    });
    
    // Reset the sync flag after a delay
    setTimeout(() => {
        isSyncingVideo = false;
    }, 1500); // Increased from 1000 to 1500ms for better stability
}

// Force sync button implementation
function forceSyncWithRemote() {
    db.ref(`rooms/${currentRoom}/videoState`).once('value', snapshot => {
        const remoteState = snapshot.val();
        if (!remoteState) return;
        
        debugLog('Manual sync requested');
        showNotification('Synchronizing with room...', 'info');
        
        performSync(remoteState);
        showNotification('Synchronized with room', 'success', 2000);
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
    
    debugLog(`Creating connection with peer: ${userData.name} (${peerId})`);
    
    // Create a new peer connection with explicit configuration
    const peer = new SimplePeer({
        initiator: currentUser.id > peerId, // Deterministic initiator based on ID comparison
        trickle: true, // Enable trickle ICE for better connectivity
        stream: localStream,
        config: { // Explicit STUN/TURN server configuration
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:stun3.l.google.com:19302' },
                { urls: 'stun:stun4.l.google.com:19302' },
                { // Add TURN server for more reliable connections
                    urls: 'turn:numb.viagenie.ca',
                    username: 'webrtc@live.com',
                    credential: 'muazkh'
                }
            ]
        }
    });
    
    // Store the peer connection
    peers[peerId] = peer;
    userConnections[peerId] = userData;
    
    // Handle signals (WebRTC negotiation)
    peer.on('signal', signal => {
        // More granular signal handling
        let signalType = 'ice-candidate';
        if (signal.type === 'offer' || signal.type === 'answer') {
            signalType = signal.type;
        } else if (signal.sdp) {
            signalType = 'offer';
        }
        
        debugLog(`Sending ${signalType} signal to peer ${userData.name}`);
        
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
        debugLog(`Received stream from peer ${userData.name}`, stream);
        
        // Added a delay to ensure DOM is ready
        setTimeout(() => {
            // Create video element for the peer
            addPeerVideo(peerId, userData.name, stream);
            updatePeerMediaState(userData);
        }, 500);
    });
    
    // Handle connection close
    peer.on('close', () => {
        removePeerConnection(peerId);
    });
    
    // Handle errors
    peer.on('error', err => {
        debugLog(`WebRTC error with peer ${userData.name}:`, err);
        showNotification(`Connection error with ${userData.name}`, 'error');
        
        // Attempt reconnection after a delay
        setTimeout(() => {
            if (userConnections[peerId]) {
                debugLog(`Attempting to reconnect with ${userData.name}`);
                removePeerConnection(peerId);
                createPeerConnection(userData);
            }
        }, 5000);
    });
    
    // Debug connection state
    peer.on('connect', () => {
        debugLog(`Connected to peer ${userData.name}`);
        showNotification(`Connected to ${userData.name}`, 'success', 2000);
    });
}

// Better signal handling
function handleOfferSignal(signal) {
    const peerId = signal.from;
    
    // Get peer data from connections or fetch it
    let peerData = userConnections[peerId];
    
    if (!peerData) {
        // Try to fetch peer data from Firebase
        db.ref(`rooms/${currentRoom}/connections/${peerId}`).once('value', snapshot => {
            peerData = snapshot.val();
            
            if (peerData) {
                userConnections[peerId] = peerData;
                if (!peers[peerId]) {
                    createPeerConnection(peerData);
                }
                peers[peerId].signal(signal.data);
            } else {
                debugLog(`Received offer from unknown peer: ${peerId}`);
            }
        });
        return;
    }
    
    if (!peers[peerId]) {
        // Create new peer connection if it doesn't exist yet
        createPeerConnection(peerData);
    }
    
    // Apply the offer signal
    debugLog(`Processing offer signal from peer ${peerId}`);
    peers[peerId].signal(signal.data);
}

function handleAnswerSignal(signal) {
    const peerId = signal.from;
    
    if (!peers[peerId]) {
        debugLog(`Received answer from unknown peer: ${peerId}`);
        return;
    }
    
    // Apply the answer signal
    debugLog(`Processing answer signal from peer ${peerId}`);
    peers[peerId].signal(signal.data);
}

function handleIceCandidateSignal(signal) {
    const peerId = signal.from;
    
    if (!peers[peerId]) {
        debugLog(`Received ICE candidate from unknown peer: ${peerId}`);
        return;
    }
    
    // Apply the ICE candidate signal
    debugLog(`Processing ICE candidate from peer ${peerId}`);
    peers[peerId].signal(signal.data);
}

// Improved video element creation
function addPeerVideo(peerId, peerName, stream) {
    // Check if the peer video already exists
    let peerVideoContainer = document.getElementById(`peer-${peerId}`);
    
    if (!peerVideoContainer) {
        debugLog(`Creating new video element for peer ${peerName}`);
        
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
        
        // Audio/video state indicators
        const audioState = document.createElement('div');
        audioState.className = 'audio-state';
        audioState.innerHTML = '<i class="fas fa-microphone"></i>';
        
        const videoState = document.createElement('div');
        videoState.className = 'video-state';
        videoState.innerHTML = '<i class="fas fa-video"></i>';
        
        // Add the elements to the DOM
        overlay.appendChild(nameSpan);
        overlay.appendChild(audioState);
        overlay.appendChild(videoState);
        peerVideoContainer.appendChild(peerVideo);
        peerVideoContainer.appendChild(overlay);
        peersContainer.appendChild(peerVideoContainer);
        
        // Set the stream with play handling
        try {
            peerVideo.srcObject = stream;
            let playPromise = peerVideo.play();
            
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    debugLog('Error auto-playing video:', error);
                    // Add play button or auto-retry
                    peerVideo.muted = true;
                    peerVideo.play().catch(e => debugLog("Still can't play video:", e));
                });
            }
        } catch (err) {
            debugLog(`Error setting stream for peer ${peerName}:`, err);
        }
    } else {
        // Just update the stream for existing video
        const peerVideo = document.getElementById(`video-${peerId}`);
        if (peerVideo) {
            debugLog(`Updating stream for existing peer ${peerName}`);
            peerVideo.srcObject = stream;
        }
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
    
    debugLog(`Removed peer: ${peerId}`);
}
