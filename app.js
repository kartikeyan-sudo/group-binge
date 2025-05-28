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
let hasInitializedStream = false;
let roomHostId = null; // Track room host
let peerVideosInitialized = {}; // Track which peer videos have been initialized

// Completely redesigned sync variables
let isSyncingVideo = false;
let ignoreStateChanges = false;
let lastUpdateTime = 0;
let lastKnownVideoTime = 0;
let lastKnownPlayState = false;
const SYNC_COOLDOWN = 10000; // 10 seconds between syncs
const TIME_SYNC_THRESHOLD = 2; // 2 seconds difference to trigger sync
const BUFFER_DURATION = 1000; // 1 second buffer for state changes
let syncLoopBreaker = false; // Flag to break sync loops
let consecutiveSyncAttempts = 0; // Track consecutive sync attempts
const MAX_SYNC_ATTEMPTS = 2; // Max consecutive syncs before breaking the loop
let lastSyncPosition = -1; // Track the last sync position

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
    console.log('DOM content loaded');
    
    // Login/Room creation
    if (createRoomBtn) {
        createRoomBtn.addEventListener('click', function() {
            console.log('Create room button clicked');
            createRoom();
        });
    } else {
        console.error('Create room button not found!');
    }
    
    if (joinRoomBtn) {
        joinRoomBtn.addEventListener('click', function() {
            console.log('Join room button clicked');
            joinRoom();
        });
    } else {
        console.error('Join room button not found!');
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

// Add this function to help with debugging
function logMediaState() {
    debugLog("Media State Debug:");
    
    // Log local stream status
    debugLog(`- Local stream exists: ${localStream !== null}`);
    if (localStream) {
        debugLog(`- Local video tracks: ${localStream.getVideoTracks().length}`);
        debugLog(`- Local audio tracks: ${localStream.getAudioTracks().length}`);
        
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
            debugLog(`- Video track enabled: ${videoTrack.enabled}`);
            debugLog(`- Video track settings: ${JSON.stringify(videoTrack.getSettings())}`);
        }
    }
    
    // Log peer connections
    debugLog(`- Peer connections count: ${Object.keys(peers).length}`);
    Object.keys(peers).forEach(peerId => {
        const peerConnected = peers[peerId] && peers[peerId]._connected;
        debugLog(`  > Peer ${peerId}: ${peerConnected ? 'Connected' : 'Not connected'}`);
    });
    
    // Check video elements
    const videoElements = document.querySelectorAll('video');
    debugLog(`- Video elements on page: ${videoElements.length}`);
    videoElements.forEach((video, i) => {
        const hasSource = video.srcObject !== null;
        debugLog(`  > Video ${i} (${video.id}): Has source: ${hasSource}, Size: ${video.videoWidth}x${video.videoHeight}`);
    });
}

// ----- Room Management -----
function createRoom() {
    console.log('Create room button clicked'); // Debug logging
  
    const name = nameInput.value.trim();
    if (!name) {
        alert('Please enter your name first');
        return;
    }
    
    currentUser.name = name;
    currentRoom = generateRoomId();
    localUserName.innerText = name;
    roomHostId = currentUser.id; // Set creator as host
    
    console.log(`Creating room with ID: ${currentRoom}`);
    
    // Direct approach to set up the room in Firebase
    const roomRef = db.ref(`rooms/${currentRoom}`);
    roomRef.set({
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        createdBy: currentUser.id,
        hostId: currentUser.id,
        activeUsers: { [currentUser.id]: currentUser.name },
        videoState: {
            videoId: '',
            isPlaying: false,
            currentTime: 0,
            timestamp: firebase.database.ServerValue.TIMESTAMP,
            updatedBy: currentUser.id
        }
    })
    .then(() => {
        console.log('Room created successfully in Firebase');
        // Directly show transition to room UI without async operations
        splashScreen.classList.add('hidden');
        mainApp.classList.remove('hidden');
        roomIdDisplay.textContent = currentRoom;
        
        // Initialize media after UI transition
        initializeUserMedia()
            .then(() => {
                // Log media state for debugging
                logMediaState();
                
                // Continue with room setup
                setupFirebaseListeners();
                setTimeout(() => {
                    initializeYouTubePlayer();
                }, 1000);
                
                // Add user to the room
                db.ref(`rooms/${currentRoom}/activeUsers/${currentUser.id}`).set(currentUser.name);
                db.ref(`rooms/${currentRoom}/activeUsers/${currentUser.id}`).onDisconnect().remove();
                
                // Add user data to presence system
                db.ref(`rooms/${currentRoom}/connections/${currentUser.id}`).set({
                    id: currentUser.id,
                    name: currentUser.name,
                    timestamp: firebase.database.ServerValue.TIMESTAMP,
                    isAudioEnabled: currentUser.isAudioEnabled,
                    isVideoEnabled: currentUser.isVideoEnabled
                });
                db.ref(`rooms/${currentRoom}/connections/${currentUser.id}`).onDisconnect().remove();
                
                // Set up UI elements
                setupRoomUI();
            })
            .catch(error => {
                handleMediaError(error);
            });
    })
    .catch(error => {
        console.error('Error creating room:', error);
        alert('Failed to create room. Please try again.');
    });
}

// This function is called when the "Join Room" button is clicked
function joinRoom() {
    console.log('Join room button clicked'); // Debug logging
    
    const name = nameInput.value.trim();
    const roomId = roomInput.value.trim();
    if (!name || !roomId) {
        alert('Please enter both your name and the room ID');
        return;
    }
    
    currentUser.name = name;
    currentRoom = roomId;
    localUserName.innerText = name;
    
    console.log(`Joining room: ${roomId}`);
    
    // Check if room exists
    db.ref(`rooms/${currentRoom}`).once('value')
        .then(snapshot => {
            if (!snapshot.exists()) {
                alert('Room not found. Please check the Room ID and try again.');
                return;
            }
            
            // Get host ID
            if (snapshot.val().hostId) {
                roomHostId = snapshot.val().hostId;
            }
            
            // Directly show transition to room UI without async operations
            splashScreen.classList.add('hidden');
            mainApp.classList.remove('hidden');
            roomIdDisplay.textContent = currentRoom;
            
            // Initialize media after UI transition
            initializeUserMedia()
                .then(() => {
                    // Log media state for debugging
                    logMediaState();
                    
                    // Continue with room setup
                    setupFirebaseListeners();
                    setTimeout(() => {
                        initializeYouTubePlayer();
                    }, 1000);
                    
                    // Add user to the room
                    db.ref(`rooms/${currentRoom}/activeUsers/${currentUser.id}`).set(currentUser.name);
                    db.ref(`rooms/${currentRoom}/activeUsers/${currentUser.id}`).onDisconnect().remove();
                    
                    // Add user data to presence system
                    db.ref(`rooms/${currentRoom}/connections/${currentUser.id}`).set({
                        id: currentUser.id,
                        name: currentUser.name,
                        timestamp: firebase.database.ServerValue.TIMESTAMP,
                        isAudioEnabled: currentUser.isAudioEnabled,
                        isVideoEnabled: currentUser.isVideoEnabled
                    });
                    db.ref(`rooms/${currentRoom}/connections/${currentUser.id}`).onDisconnect().remove();
                    
                    // Set up UI elements
                    setupRoomUI();
                    
                    // Request sync for newly joining user
                    setTimeout(() => {
                        forceSyncWithRemote();
                    }, 2000);
                })
                .catch(error => {
                    handleMediaError(error);
                });
        })
        .catch(error => {
            console.error('Error checking room:', error);
            alert('Failed to join room. Please try again.');
        });
}

// Helper functions for room creation/joining
function setupRoomUI() {
    // Add sync button to the interface
    const videoControls = document.querySelector('.video-controls');
    if (videoControls && !document.getElementById('syncBtn')) {
        const syncBtn = document.createElement('button');
        syncBtn.id = 'syncBtn';
        syncBtn.innerHTML = '<i class="fas fa-sync"></i> Force Sync';
        syncBtn.addEventListener('click', forceSyncWithRemote);
        videoControls.appendChild(syncBtn);
    }
    
    // If we're host, add a "Sync All" button
    if (currentUser.id === roomHostId && videoControls && !document.getElementById('syncAllBtn')) {
        const syncAllBtn = document.createElement('button');
        syncAllBtn.id = 'syncAllBtn';
        syncAllBtn.innerHTML = '<i class="fas fa-broadcast-tower"></i> Sync Everyone';
        syncAllBtn.style.backgroundColor = '#f0b323'; // Gold color for host button
        syncAllBtn.addEventListener('click', syncEveryone);
        videoControls.appendChild(syncAllBtn);
    }
    
    showNotification('Successfully joined the room!', 'success');
}

function handleMediaError(error) {
    console.error('Media error:', error);
    
    if (confirm('Failed to access camera/microphone. Would you like to join without video/audio?')) {
        // Create an empty stream as a fallback
        localStream = new MediaStream();
        hasInitializedStream = true;
        
        // Set initial states
        currentUser.isAudioEnabled = false;
        currentUser.isVideoEnabled = false;
        
        // Update UI to show muted state
        toggleAudioBtn.innerHTML = '<i class="fas fa-microphone-slash"></i>';
        toggleVideoBtn.innerHTML = '<i class="fas fa-video-slash"></i>';
        toggleAudioBtn.classList.add('muted');
        toggleVideoBtn.classList.add('muted');
        
        // Continue with room setup
        setupFirebaseListeners();
        setTimeout(initializeYouTubePlayer, 1000);
        
        // Add user data
        db.ref(`rooms/${currentRoom}/activeUsers/${currentUser.id}`).set(currentUser.name);
        db.ref(`rooms/${currentRoom}/activeUsers/${currentUser.id}`).onDisconnect().remove();
        
        db.ref(`rooms/${currentRoom}/connections/${currentUser.id}`).set({
            id: currentUser.id,
            name: currentUser.name,
            timestamp: firebase.database.ServerValue.TIMESTAMP,
            isAudioEnabled: false,
            isVideoEnabled: false
        });
        db.ref(`rooms/${currentRoom}/connections/${currentUser.id}`).onDisconnect().remove();
        
        // Set up UI elements
        setupRoomUI();
    }
}

function setupFirebaseListeners() {
    debugLog('Setting up Firebase listeners');
    
    // Watch for room host changes
    db.ref(`rooms/${currentRoom}/hostId`).on('value', snapshot => {
        if (snapshot.exists()) {
            roomHostId = snapshot.val();
            debugLog(`Host ID updated: ${roomHostId}`);
            
            // If I'm the host and don't have the host button yet, add it
            if (roomHostId === currentUser.id) {
                const videoControls = document.querySelector('.video-controls');
                if (videoControls && !document.getElementById('syncAllBtn')) {
                    debugLog('Adding host sync button');
                    const syncAllBtn = document.createElement('button');
                    syncAllBtn.id = 'syncAllBtn';
                    syncAllBtn.innerHTML = '<i class="fas fa-broadcast-tower"></i> Sync Everyone';
                    syncAllBtn.style.backgroundColor = '#f0b323'; // Gold color for host button
                    syncAllBtn.addEventListener('click', syncEveryone);
                    videoControls.appendChild(syncAllBtn);
                }
            }
        }
    });
    
    // Watch for user changes (join/leave)
    db.ref(`rooms/${currentRoom}/activeUsers`).on('value', snapshot => {
        const users = snapshot.val() || {};
        userCount = Object.keys(users).length;
        debugLog(`User count updated: ${userCount}`);
        userCountDisplay.textContent = userCount;
        
        // If we're the only user left, clean up any peer connections
        if (userCount === 1) {
            debugLog('Last user in room, cleaning up peer connections');
            Object.keys(peers).forEach(peerId => {
                if (peers[peerId]) {
                    peers[peerId].destroy();
                    delete peers[peerId];
                }
            });
        }
        
        // If the host left and we've been here longest, become the new host
        if (!users[roomHostId] && userCount > 0) {
            debugLog('Host left, finding new host');
            // Find the user with the earliest connection
            db.ref(`rooms/${currentRoom}/connections`).orderByChild('timestamp').limitToFirst(1).once('value', snapshot => {
                if (snapshot.exists()) {
                    const firstUser = Object.keys(snapshot.val())[0];
                    if (firstUser === currentUser.id) {
                        // We're now the host
                        debugLog('I am the new host');
                        db.ref(`rooms/${currentRoom}/hostId`).set(currentUser.id);
                        showNotification('You are now the room host', 'info');
                    }
                }
            });
        }
    });
    
    // Watch for user connections (for WebRTC)
    db.ref(`rooms/${currentRoom}/connections`).on('child_added', snapshot => {
        const userData = snapshot.val();
        if (userData && userData.id !== currentUser.id) {
            debugLog(`New connection detected: ${userData.name}`);
            // New user connected, initiate peer connection
            createPeerConnection(userData);
        }
    });
    
    db.ref(`rooms/${currentRoom}/connections`).on('child_removed', snapshot => {
        const userData = snapshot.val();
        if (userData && userData.id) {
            debugLog(`Connection removed: ${userData.name || userData.id}`);
            // User disconnected, clean up their peer connection
            removePeerConnection(userData.id);
        }
    });
    
    // Watch for user connection updates (audio/video states)
    db.ref(`rooms/${currentRoom}/connections`).on('child_changed', snapshot => {
        const userData = snapshot.val();
        if (userData && userData.id !== currentUser.id) {
            debugLog(`Connection updated: ${userData.name}`);
            // Update the audio/video state in the UI
            updatePeerMediaState(userData);
        }
    });
    
    // Watch for video state changes (play/pause/seek)
    db.ref(`rooms/${currentRoom}/videoState`).on('value', snapshot => {
        const videoState = snapshot.val();
        if (!videoState) return;
        
        // Ignore if this is our own update
        if (videoState.updatedBy === currentUser.id) {
            debugLog('Ignoring my own video state update');
            return;
        }
        
        // Don't process updates while syncing or in cooldown
        if (isSyncingVideo) {
            debugLog('Ignoring state change while syncing');
            return;
        }
        
        // Don't process too many updates in rapid succession
        const now = Date.now();
        if (now - lastUpdateTime < BUFFER_DURATION) {
            debugLog('Ignoring update - too soon after previous update');
            return;
        }
        
        // Special handling for sync signals from host
        if (videoState.syncSignal) {
            debugLog('Received sync signal from host');
            handleHostSync(videoState);
            return;
        }
        
        // Handle regular video state updates
        debugLog(`Received video state: playing=${videoState.isPlaying}, time=${videoState.currentTime.toFixed(2)}`);
        handleVideoStateUpdate(videoState);
    });
    
    // Watch for special sync commands
    db.ref(`rooms/${currentRoom}/syncCommand`).on('value', snapshot => {
        if (!snapshot.exists()) return;
        
        const command = snapshot.val();
        
        // Only process if the command is not from us and is fresh (within 5 seconds)
        if (command.from !== currentUser.id && Date.now() - command.timestamp < 5000) {
            if (command.type === 'requestSync' && currentUser.id === roomHostId) {
                // We're the host and someone wants us to sync them
                debugLog(`Received sync request from: ${command.from}`);
                syncSpecificUser(command.from);
            } else if (command.type === 'syncAll' && command.from === roomHostId) {
                // The host is commanding everyone to sync
                debugLog('Received sync all command from host');
                forceSyncWithRemote();
            }
        }
    });
    
    // Watch for direct user syncs
    const userSyncRef = db.ref(`rooms/${currentRoom}/users/${currentUser.id}/directSync`);
    userSyncRef.on('value', snapshot => {
        if (!snapshot.exists()) return;
        
        const syncData = snapshot.val();
        // Only process if fresh (within 5 seconds)
        if (Date.now() - syncData.timestamp < 5000 && syncData.from === roomHostId) {
            debugLog('Received direct sync from host');
            
            // Apply the sync immediately
            if (youtubePlayer && youtubePlayer.seekTo) {
                isSyncingVideo = true;
                youtubePlayer.seekTo(syncData.currentTime);
                
                if (syncData.isPlaying) {
                    youtubePlayer.playVideo();
                } else {
                    youtubePlayer.pauseVideo();
                }
                
                lastKnownVideoTime = syncData.currentTime;
                lastKnownPlayState = syncData.isPlaying;
                
                setTimeout(() => { 
                    isSyncingVideo = false;
                }, 1000);
                
                showNotification('Synchronized with host', 'success');
            }
            
            // Remove the processed sync
            snapshot.ref.remove();
        }
    });
    
    // Watch for chat messages
    db.ref(`rooms/${currentRoom}/messages`).on('child_added', snapshot => {
        const message = snapshot.val();
        displayMessage(message);
    });
    
    // Watch for WebRTC signaling messages
    const signalsRef = db.ref(`rooms/${currentRoom}/signals/${currentUser.id}`);
    signalsRef.on('child_added', snapshot => {
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
    debugLog('Leaving room');
    
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
    db.ref(`rooms/${currentRoom}/syncCommand`).off();
    db.ref(`rooms/${currentRoom}/hostId`).off();
    db.ref(`rooms/${currentRoom}/users/${currentUser.id}/directSync`).off();
    
    // Reset global variables
    peers = {};
    userConnections = {};
    peerVideosInitialized = {};
    currentRoom = null;
    roomHostId = null;
    isSyncingVideo = false;
    ignoreStateChanges = false;
    syncLoopBreaker = false;
    consecutiveSyncAttempts = 0;
    
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
        try {
            // Try high quality first
            localStream = await navigator.mediaDevices.getUserMedia({ 
                video: { 
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    facingMode: "user"
                }, 
                audio: true
            });
        } catch (highQualityError) {
            debugLog('Failed to get high quality video, trying lower quality');
            try {
                // Fall back to lower quality
                localStream = await navigator.mediaDevices.getUserMedia({ 
                    video: { 
                        width: { ideal: 320 },
                        height: { ideal: 240 }
                    }, 
                    audio: true
                });
            } catch (lowQualityError) {
                debugLog('Failed to get lower quality video, trying audio only');
                try {
                    // Last resort - audio only
                    localStream = await navigator.mediaDevices.getUserMedia({ 
                        video: false, 
                        audio: true
                    });
                    
                    // Update video state since we only have audio
                    currentUser.isVideoEnabled = false;
                } catch (audioOnlyError) {
                    throw highQualityError; // Throw the original error
                }
            }
        }
        
        debugLog('User media access granted');
        
        // Display local video
        localVideo.srcObject = localStream;
        hasInitializedStream = true;
        
        // Set initial states based on what tracks we actually got
        currentUser.isAudioEnabled = localStream.getAudioTracks().length > 0;
        currentUser.isVideoEnabled = localStream.getVideoTracks().length > 0;
        
        // Update UI to reflect actual state
        if (!currentUser.isVideoEnabled) {
            toggleVideoBtn.innerHTML = '<i class="fas fa-video-slash"></i>';
            toggleVideoBtn.classList.add('muted');
        }
        
        return true;
    } catch (error) {
        debugLog("Error getting user media:", error);
        throw error;
    }
}

function toggleAudio() {
    if (!hasInitializedStream) return;
    
    currentUser.isAudioEnabled = !currentUser.isAudioEnabled;
    
    // Update local audio tracks if they exist
    const audioTracks = localStream.getAudioTracks();
    if (audioTracks.length > 0) {
        audioTracks.forEach(track => {
            track.enabled = currentUser.isAudioEnabled;
        });
    }
    
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
    
    // Update local video tracks if they exist
    const videoTracks = localStream.getVideoTracks();
    if (videoTracks.length > 0) {
        videoTracks.forEach(track => {
            track.enabled = currentUser.isVideoEnabled;
        });
    }
    
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
    
    // Check if there's already a video loaded in the room
    db.ref(`rooms/${currentRoom}/videoState`).once('value', snapshot => {
        const videoState = snapshot.val();
        if (videoState && videoState.videoId) {
            debugLog(`Loading existing video: ${videoState.videoId} at time ${videoState.currentTime}`);
            
            // Calculate adjusted time based on elapsed time since update
            let adjustedTime = videoState.currentTime;
            if (videoState.isPlaying && videoState.timestamp) {
                const secondsSinceUpdate = (Date.now() - videoState.timestamp) / 1000;
                adjustedTime += secondsSinceUpdate;
            }
            
            // Set flag to prevent update loops
            isSyncingVideo = true;
            
            // Load the existing video - use cueVideoById for more reliable loading
            youtubePlayer.cueVideoById({
                videoId: videoState.videoId,
                startSeconds: adjustedTime
            });
            
            // Update the video ID input field
            videoIdInput.value = videoState.videoId;
            
            // Apply play/pause state after video loads
            setTimeout(() => {
                // Make sure we're at the right position
                youtubePlayer.seekTo(adjustedTime, true);
                
                if (videoState.isPlaying) {
                    youtubePlayer.playVideo();
                } else {
                    youtubePlayer.pauseVideo();
                }
                
                // Update local state tracking
                lastKnownVideoTime = adjustedTime;
                lastKnownPlayState = videoState.isPlaying;
                lastUpdateTime = Date.now();
                
                // Show notification
                showNotification('Video synchronized with room', 'success');
                
                // Reset syncing flag after a delay
                setTimeout(() => {
                    isSyncingVideo = false;
                }, 2000);
            }, 1000);
        }
    });
    
    // Start seeking bar update interval - this doesn't trigger syncs, just updates UI
    setInterval(updateSeekBar, 1000);
    
    // Set up periodic sync check that's less aggressive (every 20 seconds)
    setInterval(() => {
        if (!youtubePlayer || !youtubePlayer.getCurrentTime || isSyncingVideo || syncLoopBreaker) return;
        
        // Only do lightweight sync verification
        verifySync();
    }, 20000);
}

// Verify if we need to sync but don't actively sync
function verifySync() {
    try {
        db.ref(`rooms/${currentRoom}/videoState`).once('value', snapshot => {
            const remoteState = snapshot.val();
            if (!remoteState || !youtubePlayer) return;
            
            // Get local state
            const localTime = youtubePlayer.getCurrentTime();
            const localIsPlaying = youtubePlayer.getPlayerState() === YT.PlayerState.PLAYING;
            
            // Calculate time difference accounting for elapsed time
            let adjustedRemoteTime = remoteState.currentTime;
            if (remoteState.isPlaying) {
                const secondsSinceUpdate = (Date.now() - remoteState.timestamp) / 1000;
                adjustedRemoteTime += secondsSinceUpdate;
            }
            
            const timeDiff = Math.abs(localTime - adjustedRemoteTime);
            
            // If we're significantly out of sync, notify the user
            if ((remoteState.isPlaying !== localIsPlaying) || (timeDiff > TIME_SYNC_THRESHOLD * 4)) {
                debugLog(`Out of sync detected: time diff=${timeDiff.toFixed(2)}s, play state=${localIsPlaying} vs ${remoteState.isPlaying}`);
                showNotification('Video out of sync. Click "Force Sync" to synchronize with the room.', 'info', 4000);
            }
        });
    } catch (err) {
        debugLog('Error in sync verification:', err);
    }
}

// Handle video state updates from Firebase
function handleVideoStateUpdate(videoState) {
    // If we're currently syncing, ignore this update
    if (isSyncingVideo) return;
    
    // Check if this is the same position we recently synced to
    if (Math.abs(videoState.currentTime - lastSyncPosition) < 1 && 
        Date.now() - lastUpdateTime < 10000) {
        consecutiveSyncAttempts++;
        debugLog(`Detected potential sync loop, attempt ${consecutiveSyncAttempts}`);
        
        // If we detect a sync loop, break out of it
        if (consecutiveSyncAttempts >= MAX_SYNC_ATTEMPTS) {
            debugLog('Breaking sync loop');
            syncLoopBreaker = true;
            
            // Reset after a while
            setTimeout(() => {
                syncLoopBreaker = false;
                consecutiveSyncAttempts = 0;
            }, 30000);
            
            return;
        }
    } else {
        consecutiveSyncAttempts = 0;
    }
    
    // Record this sync attempt
    lastUpdateTime = Date.now();
    lastSyncPosition = videoState.currentTime;
    
    // If video ID is different, load the new video
    if (youtubePlayer.getVideoData && youtubePlayer.getVideoData().video_id !== videoState.videoId) {
        loadSpecificVideo(videoState.videoId, videoState.currentTime, videoState.isPlaying);
        return;
    }
    
    // Calculate adjusted time based on elapsed time since update
    let adjustedTime = videoState.currentTime;
    if (videoState.isPlaying && videoState.timestamp) {
        const secondsSinceUpdate = (Date.now() - videoState.timestamp) / 1000;
        adjustedTime += secondsSinceUpdate;
    }
    
    // Set syncing flag
    isSyncingVideo = true;
    
    debugLog(`Syncing to video state: time=${adjustedTime.toFixed(2)}, playing=${videoState.isPlaying}`);
    
    // Get local state
    const localTime = youtubePlayer.getCurrentTime();
    const timeDiff = Math.abs(localTime - adjustedTime);
    
    // First handle time synchronization if needed
    if (timeDiff > TIME_SYNC_THRESHOLD) {
        youtubePlayer.seekTo(adjustedTime, true);
        
        // After seeking, handle play state after a delay
        setTimeout(() => {
            syncPlayState(videoState.isPlaying);
            
            // Reset syncing flag after a delay
            setTimeout(() => {
                isSyncingVideo = false;
            }, 1000);
        }, 500);
    } else {
        // Just sync play state if time is close enough
        syncPlayState(videoState.isPlaying);
        
        // Reset syncing flag faster for minor syncs
        setTimeout(() => {
            isSyncingVideo = false;
        }, 500);
    }
}

// Sync play/pause state
function syncPlayState(shouldPlay) {
    try {
        const playerState = youtubePlayer.getPlayerState();
        
        if (shouldPlay && playerState !== YT.PlayerState.PLAYING) {
            youtubePlayer.playVideo();
        } else if (!shouldPlay && playerState === YT.PlayerState.PLAYING) {
            youtubePlayer.pauseVideo();
        }
        
        // Update local state tracking
        lastKnownPlayState = shouldPlay;
    } catch (err) {
        debugLog('Error syncing play state:', err);
    }
}

// Special handling for host sync signals
function handleHostSync(syncState) {
    // This is a high-priority sync from the host
    debugLog('Processing host sync signal');
    
    // Reset any sync loop protection
    syncLoopBreaker = false;
    consecutiveSyncAttempts = 0;
    
    // Force a sync using the most direct method
    forceSyncWithReload(syncState);
}

// Handle player state changes from YouTube
function onPlayerStateChange(event) {
    // Ignore if we're currently syncing
    if (isSyncingVideo) {
        debugLog('Ignoring state change during sync');
        return;
    }
    
    // Don't update if we recently received an update
    if (Date.now() - lastUpdateTime < BUFFER_DURATION) {
        debugLog('Ignoring state change during buffer period');
        return;
    }
    
    switch (event.data) {
        case YT.PlayerState.PLAYING:
            debugLog('Local player state: PLAYING');
            lastKnownPlayState = true;
            lastKnownVideoTime = youtubePlayer.getCurrentTime();
            pushVideoState(true, lastKnownVideoTime);
            break;
            
        case YT.PlayerState.PAUSED:
            debugLog('Local player state: PAUSED');
            lastKnownPlayState = false;
            lastKnownVideoTime = youtubePlayer.getCurrentTime();
            pushVideoState(false, lastKnownVideoTime);
            break;
            
        case YT.PlayerState.ENDED:
            debugLog('Local player state: ENDED');
            lastKnownPlayState = false;
            lastKnownVideoTime = 0;
            pushVideoState(false, 0);
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
    
    // Reset sync loop tracking
    syncLoopBreaker = false;
    consecutiveSyncAttempts = 0;
    
    // Set flags to prevent update loops
    isSyncingVideo = true;
    
    // Load the video in YouTube player
    youtubePlayer.loadVideoById(videoId);
    youtubePlayer.pauseVideo(); // Start paused to allow sync
    
    // Update Firebase with new video
    db.ref(`rooms/${currentRoom}/videoState`).update({
        videoId: videoId,
        isPlaying: false,
        currentTime: 0,
        timestamp: firebase.database.ServerValue.TIMESTAMP,
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
        
        // Update local state tracking
        lastKnownVideoTime = 0;
        lastKnownPlayState = false;
        lastUpdateTime = Date.now();
        
        // Reset syncing flag after a delay
        setTimeout(() => {
            isSyncingVideo = false;
        }, 2000);
    }).catch(error => {
        showNotification('Error loading video', 'error');
        debugLog('Error updating video state:', error);
        isSyncingVideo = false;
    });
}

// Load a specific video (for syncing with remote)
function loadSpecificVideo(videoId, startTime = 0, autoplay = false) {
    // Reset sync loop tracking
    syncLoopBreaker = false;
    consecutiveSyncAttempts = 0;
    
    // Set flags to prevent update loops
    isSyncingVideo = true;
    
    debugLog(`Loading video: ${videoId} at ${startTime.toFixed(2)}, playing=${autoplay}`);
    
    // Update the input field
    videoIdInput.value = videoId;
    
    // First cue the video (more reliable loading)
    youtubePlayer.cueVideoById({
        videoId: videoId,
        startSeconds: startTime
    });
    
    // Set play state after a short delay to ensure video loads properly
    setTimeout(() => {
        // Make sure we're at the right position
        youtubePlayer.seekTo(startTime, true);
        
        if (autoplay) {
            youtubePlayer.playVideo();
        } else {
            youtubePlayer.pauseVideo();
        }
        
        // Update local tracking
        lastKnownVideoTime = startTime;
        lastKnownPlayState = autoplay;
        lastUpdateTime = Date.now();
        
        // Reset syncing flag after another delay
        setTimeout(() => {
            isSyncingVideo = false;
        }, 1000);
        
        showNotification('Video synchronized', 'info');
    }, 1000);
}

// Force reload and sync (for breaking loops)
function forceSyncWithReload(remoteState) {
    // Fetch current video state if not provided
    if (!remoteState) {
        db.ref(`rooms/${currentRoom}/videoState`).once('value', snapshot => {
            const state = snapshot.val();
            if (state) {
                performForcedSync(state);
            }
        });
        return;
    }
    
    performForcedSync(remoteState);
}

// Actual implementation of forced sync
function performForcedSync(remoteState) {
    debugLog('Performing forced sync');
    showNotification('Synchronizing with room...', 'info');
    
    // Set flags
    isSyncingVideo = true;
    
    // Reset sync loop tracking
    syncLoopBreaker = false;
    consecutiveSyncAttempts = 0;
    
    // Get current video ID
    const videoId = remoteState.videoId;
    
    // Calculate adjusted current time
    let adjustedTime = remoteState.currentTime;
    if (remoteState.isPlaying && remoteState.timestamp) {
        const secondsSinceUpdate = (Date.now() - remoteState.timestamp) / 1000;
        adjustedTime += secondsSinceUpdate;
    }
    
    // Use cueVideoById first for more reliable loading
    youtubePlayer.cueVideoById({
        videoId: videoId,
        startSeconds: adjustedTime
    });
    
    // Update the input field
    videoIdInput.value = videoId;
    
    // Set playback state after a delay to ensure video loads
    setTimeout(() => {
        // Make sure we're at the right position
        youtubePlayer.seekTo(adjustedTime, true);
        
        if (remoteState.isPlaying) {
            youtubePlayer.playVideo();
        } else {
            youtubePlayer.pauseVideo();
        }
        
        // Update local tracking
        lastKnownVideoTime = adjustedTime;
        lastKnownPlayState = remoteState.isPlaying;
        lastUpdateTime = Date.now();
        lastSyncPosition = adjustedTime;
        
        showNotification('Synchronized with room', 'success');
        
        // Reset syncing flag after a delay
        setTimeout(() => {
            isSyncingVideo = false;
        }, 1000);
    }, 1000);
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
    
    // Set syncing flag to prevent update loops
    isSyncingVideo = true;
    
    // Reset sync loop tracking
    syncLoopBreaker = false;
    consecutiveSyncAttempts = 0;
    
    // Perform the seek
    youtubePlayer.seekTo(newTime, true);
    
    // Update local tracking
    lastKnownVideoTime = newTime;
    
    // Wait a bit to update Firebase
    setTimeout(() => {
        const isPlaying = youtubePlayer.getPlayerState() === YT.PlayerState.PLAYING;
        pushVideoState(isPlaying, newTime);
        
        // Reset syncing flag
        setTimeout(() => {
            isSyncingVideo = false;
        }, 500);
    }, 200);
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

// Push video state to Firebase
function pushVideoState(isPlaying, currentTime) {
    if (!currentRoom) return;
    
    lastUpdateTime = Date.now();
    
    debugLog(`Pushing state: playing=${isPlaying}, time=${currentTime.toFixed(2)}`);
    
    // Update Firebase with current state
    db.ref(`rooms/${currentRoom}/videoState`).update({
        isPlaying: isPlaying,
        currentTime: currentTime,
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        updatedBy: currentUser.id
    }).catch(err => {
        debugLog('Error updating video state:', err);
    });
}

// Force sync button implementation (user-triggered)
function forceSyncWithRemote() {
    // If we're the host, use our local state as the source of truth
    if (currentUser.id === roomHostId) {
        const localTime = youtubePlayer.getCurrentTime();
        const isPlaying = youtubePlayer.getPlayerState() === YT.PlayerState.PLAYING;
        
        showNotification('You are the host, using local playback state as reference', 'info');
        
        // Update Firebase with a special sync flag
        db.ref(`rooms/${currentRoom}/videoState`).update({
            isPlaying: isPlaying,
            currentTime: localTime,
            timestamp: firebase.database.ServerValue.TIMESTAMP,
            updatedBy: currentUser.id,
            syncSignal: true  // Special flag to indicate this is a sync command
        });
        
        return;
    }
    
    // If we're not the host, request a sync from Firebase
    showNotification('Requesting sync from room...', 'info');
    
    // Reset sync loop tracking
    syncLoopBreaker = false;
    consecutiveSyncAttempts = 0;
    
    // Use the more reliable full sync method
    forceSyncWithReload();
    
    // Also request a sync from the host
    if (roomHostId) {
        db.ref(`rooms/${currentRoom}/syncCommand`).set({
            type: 'requestSync',
            from: currentUser.id,
            timestamp: Date.now()
        });
    }
}

// Host function: sync everyone in the room
function syncEveryone() {
    if (currentUser.id !== roomHostId) {
        debugLog('Only the host can sync everyone');
        return;
    }
    
    showNotification('Syncing everyone to your playback position...', 'success');
    
    const localTime = youtubePlayer.getCurrentTime();
    const isPlaying = youtubePlayer.getPlayerState() === YT.PlayerState.PLAYING;
    
    // Update video state with a sync signal
    db.ref(`rooms/${currentRoom}/videoState`).update({
        isPlaying: isPlaying,
        currentTime: localTime,
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        updatedBy: currentUser.id,
        syncSignal: true
    });
    
    // Also send a sync command
    db.ref(`rooms/${currentRoom}/syncCommand`).set({
        type: 'syncAll',
        from: currentUser.id,
        timestamp: Date.now()
    });
}

// Host function: sync a specific user
function syncSpecificUser(userId) {
    if (currentUser.id !== roomHostId) return;
    
    debugLog(`Syncing user ${userId} to my position`);
    
    const localTime = youtubePlayer.getCurrentTime();
    const isPlaying = youtubePlayer.getPlayerState() === YT.PlayerState.PLAYING;
    
    // Send a direct sync signal to the user
    db.ref(`rooms/${currentRoom}/users/${userId}/directSync`).set({
        isPlaying: isPlaying,
        currentTime: localTime,
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        from: currentUser.id
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
    
    // Check if localStream has valid tracks before using it
    const hasValidTracks = localStream && 
                         (localStream.getVideoTracks().length > 0 || 
                          localStream.getAudioTracks().length > 0);
    
    // Create a new peer connection with explicit configuration
    const peer = new SimplePeer({
        initiator: currentUser.id > peerId, // Deterministic initiator based on ID comparison
        trickle: true, // Enable trickle ICE for better connectivity
        stream: hasValidTracks ? localStream : null, // Only pass stream if it has tracks
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
                },
                { // Add backup TURN server
                    urls: 'turn:openrelay.metered.ca:80',
                    username: 'openrelayproject',
                    credential: 'openrelayproject'
                }
            ]
        }
    });
    
    // Store the peer connection
    peers[peerId] = peer;
    userConnections[peerId] = userData;
    
    // Create video container in advance
    createPeerVideoContainer(peerId, userData.name);
    
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
        
        // Update the peer's video element with the stream
        updatePeerStream(peerId, userData.name, stream);
    });
    
    // Handle connection close
    peer.on('close', () => {
        removePeerConnection(peerId);
    });
    
    // Handle errors with improved reconnection logic
    peer.on('error', err => {
        debugLog(`WebRTC error with peer ${userData.name}:`, err);
        showNotification(`Connection error with ${userData.name}`, 'error');
        
        // Show reconnecting indicator in the UI
        const peerVideoContainer = document.getElementById(`peer-${peerId}`);
        if (peerVideoContainer) {
            const reconnectingIndicator = document.createElement('div');
            reconnectingIndicator.className = 'reconnecting-indicator';
            reconnectingIndicator.innerText = 'Reconnecting...';
            reconnectingIndicator.style.position = 'absolute';
            reconnectingIndicator.style.bottom = '40px';
            reconnectingIndicator.style.left = '50%';
            reconnectingIndicator.style.transform = 'translateX(-50%)';
            reconnectingIndicator.style.background = 'rgba(255, 69, 85, 0.7)';
            reconnectingIndicator.style.padding = '3px 8px';
            reconnectingIndicator.style.borderRadius = '3px';
            
            // Remove existing indicator if present
            const existingIndicator = peerVideoContainer.querySelector('.reconnecting-indicator');
            if (existingIndicator) existingIndicator.remove();
            
            peerVideoContainer.appendChild(reconnectingIndicator);
        }
        
        // Attempt reconnection after a delay with exponential backoff
        let reconnectAttempts = 0;
        const maxReconnectAttempts = 5;
        
        function attemptReconnect() {
            if (reconnectAttempts >= maxReconnectAttempts || !userConnections[peerId]) return;
            
            reconnectAttempts++;
            const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000); // Exponential backoff with 30s max
            
            setTimeout(() => {
                debugLog(`Attempting to reconnect with ${userData.name} (attempt ${reconnectAttempts})`);
                removePeerConnection(peerId);
                createPeerConnection(userData);
            }, delay);
        }
        
        attemptReconnect();
    });
    
    // Debug connection state
    peer.on('connect', () => {
        debugLog(`Connected to peer ${userData.name}`);
        showNotification(`Connected to ${userData.name}`, 'success', 2000);
    });
}

// Create container for peer video
function createPeerVideoContainer(peerId, peerName) {
    // Check if container already exists
    if (document.getElementById(`peer-${peerId}`)) return;
    
    debugLog(`Creating video container for peer ${peerName}`);
    
    // Create a new video container
    const peerVideoContainer = document.createElement('div');
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
    
    // If this is the host, add a visual indicator
    if (peerId === roomHostId) {
        const hostBadge = document.createElement('div');
        hostBadge.className = 'host-badge';
        hostBadge.innerHTML = '<i class="fas fa-crown"></i> Host';
        hostBadge.style.position = 'absolute';
        hostBadge.style.top = '5px';
        hostBadge.style.right = '5px';
        hostBadge.style.background = 'rgba(240, 179, 35, 0.8)';
        hostBadge.style.color = '#fff';
        hostBadge.style.padding = '2px 6px';
        hostBadge.style.borderRadius = '3px';
        hostBadge.style.fontSize = '0.7rem';
        peerVideoContainer.appendChild(hostBadge);
    }
    
    // Add a loading indicator
    const loadingIndicator = document.createElement('div');
    loadingIndicator.className = 'video-loading';
    loadingIndicator.innerHTML = '<div class="spinner"></div>';
    loadingIndicator.style.position = 'absolute';
    loadingIndicator.style.top = '0';
    loadingIndicator.style.left = '0';
    loadingIndicator.style.width = '100%';
    loadingIndicator.style.height = '100%';
    loadingIndicator.style.display = 'flex';
    loadingIndicator.style.alignItems = 'center';
    loadingIndicator.style.justifyContent = 'center';
    loadingIndicator.style.background = 'rgba(13, 37, 63, 0.7)';
    loadingIndicator.style.zIndex = '1';
    peerVideoContainer.appendChild(loadingIndicator);
    
    return peerVideoContainer;
}

// Update peer stream
function updatePeerStream(peerId, peerName, stream) {
    // Get or create the container
    let peerVideoContainer = document.getElementById(`peer-${peerId}`);
    if (!peerVideoContainer) {
        peerVideoContainer = createPeerVideoContainer(peerId, peerName);
    }
    
    // Find the video element
    const peerVideo = document.getElementById(`video-${peerId}`);
    if (!peerVideo) {
        debugLog(`Error: video element for peer ${peerName} not found!`);
        return;
    }
    
    // Check if stream has video tracks
    const hasVideoTracks = stream && stream.getVideoTracks().length > 0;
    
    // Set the stream
    try {
        debugLog(`Setting stream for peer ${peerName}`);
        
        // Handle null or empty stream
        if (!stream) {
            debugLog(`No stream available for peer ${peerName}`);
            peerVideo.style.backgroundColor = "#1a2235";
            
            // Add a camera-off icon
            const noVideoIndicator = document.createElement('div');
            noVideoIndicator.innerHTML = '<i class="fas fa-video-slash"></i>';
            noVideoIndicator.className = 'no-video-indicator';
            noVideoIndicator.style.position = 'absolute';
            noVideoIndicator.style.top = '50%';
            noVideoIndicator.style.left = '50%';
            noVideoIndicator.style.transform = 'translate(-50%, -50%)';
            noVideoIndicator.style.fontSize = '2rem';
            noVideoIndicator.style.color = 'rgba(255,255,255,0.5)';
            
            // Remove any existing indicator first
            const existingIndicator = peerVideoContainer.querySelector('.no-video-indicator');
            if (existingIndicator) {
                existingIndicator.remove();
            }
            
            peerVideoContainer.appendChild(noVideoIndicator);
            
            // Hide loading indicator
            const loadingIndicator = peerVideoContainer.querySelector('.video-loading');
            if (loadingIndicator) {
                loadingIndicator.style.display = 'none';
            }
            
            return;
        }
        
        peerVideo.srcObject = stream;
        
        // Add placeholder background if no video tracks
        if (!hasVideoTracks) {
            peerVideo.style.backgroundColor = "#1a2235";
            
            // Add a camera-off icon
            const noVideoIndicator = document.createElement('div');
            noVideoIndicator.innerHTML = '<i class="fas fa-video-slash"></i>';
            noVideoIndicator.className = 'no-video-indicator';
            noVideoIndicator.style.position = 'absolute';
            noVideoIndicator.style.top = '50%';
            noVideoIndicator.style.left = '50%';
            noVideoIndicator.style.transform = 'translate(-50%, -50%)';
            noVideoIndicator.style.fontSize = '2rem';
            noVideoIndicator.style.color = 'rgba(255,255,255,0.5)';
            
            // Remove any existing indicator first
            const existingIndicator = peerVideoContainer.querySelector('.no-video-indicator');
            if (existingIndicator) {
                existingIndicator.remove();
            }
            
            peerVideoContainer.appendChild(noVideoIndicator);
        } else {
            // Remove any no-video indicators if we have video tracks
            const existingIndicator = peerVideoContainer.querySelector('.no-video-indicator');
            if (existingIndicator) {
                existingIndicator.remove();
            }
        }
        
        // Attempt to play the video
        const playPromise = peerVideo.play();
        if (playPromise !== undefined) {
            playPromise
                .then(() => {
                    debugLog(`Successfully playing video for ${peerName}`);
                    
                    // Hide loading indicator
                    const loadingIndicator = peerVideoContainer.querySelector('.video-loading');
                    if (loadingIndicator) {
                        loadingIndicator.style.display = 'none';
                    }
                    
                    // Mark this peer as initialized
                    peerVideosInitialized[peerId] = true;
                })
                .catch(error => {
                    debugLog(`Error playing video for ${peerName}:`, error);
                    
                    // Try with muted attribute as a fallback
                    peerVideo.muted = true;
                    peerVideo.play()
                        .then(() => {
                            debugLog(`Playing muted video for ${peerName} as fallback`);
                            
                            // Hide loading indicator
                            const loadingIndicator = peerVideoContainer.querySelector('.video-loading');
                            if (loadingIndicator) {
                                loadingIndicator.style.display = 'none';
                            }
                            
                            // Mark this peer as initialized
                            peerVideosInitialized[peerId] = true;
                        })
                        .catch(e => {
                            debugLog(`Still can't play video for ${peerName}:`, e);
                            showNotification(`Error displaying ${peerName}'s video`, 'error');
                            
                            // Hide loading indicator even if there's an error
                            const loadingIndicator = peerVideoContainer.querySelector('.video-loading');
                            if (loadingIndicator) {
                                loadingIndicator.style.display = 'none';
                            }
                        });
                });
        } else {
            // No play promise available, just hide loading
            const loadingIndicator = peerVideoContainer.querySelector('.video-loading');
            if (loadingIndicator) {
                loadingIndicator.style.display = 'none';
            }
            
            // Mark this peer as initialized
            peerVideosInitialized[peerId] = true;
        }
        
        // Update the state indicators
        updatePeerMediaState(userConnections[peerId]);
    } catch (err) {
        debugLog(`Error setting stream for peer ${peerName}:`, err);
        
        // Hide loading indicator even if there's an error
        const loadingIndicator = peerVideoContainer.querySelector('.video-loading');
        if (loadingIndicator) {
            loadingIndicator.style.display = 'none';
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
        if (!overlay) return;
        
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
        
        // If video is disabled, ensure the no-video indicator is shown
        if (!userData.isVideoEnabled) {
            if (!peerVideoContainer.querySelector('.no-video-indicator')) {
                const noVideoIndicator = document.createElement('div');
                noVideoIndicator.innerHTML = '<i class="fas fa-video-slash"></i>';
                noVideoIndicator.className = 'no-video-indicator';
                noVideoIndicator.style.position = 'absolute';
                noVideoIndicator.style.top = '50%';
                noVideoIndicator.style.left = '50%';
                noVideoIndicator.style.transform = 'translate(-50%, -50%)';
                noVideoIndicator.style.fontSize = '2rem';
                noVideoIndicator.style.color = 'rgba(255,255,255,0.5)';
                peerVideoContainer.appendChild(noVideoIndicator);
            }
        } else {
            // If video is enabled, remove the indicator if it exists
            const indicator = peerVideoContainer.querySelector('.no-video-indicator');
            if (indicator) {
                indicator.remove();
            }
        }
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
    
    // Remove from initialized peers
    if (peerVideosInitialized[peerId]) {
        delete peerVideosInitialized[peerId];
    }
    
    // Remove video element
    const peerVideoContainer = document.getElementById(`peer-${peerId}`);
    if (peerVideoContainer && peerVideoContainer.parentNode) {
        peerVideoContainer.parentNode.removeChild(peerVideoContainer);
    }
    
    debugLog(`Removed peer: ${peerId}`);
}

// WebRTC signal handling functions
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
                
                if (peers[peerId]) {
                    peers[peerId].signal(signal.data);
                }
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
    if (peers[peerId]) {
        peers[peerId].signal(signal.data);
    }
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

// Add styles for spinner animation to the document
document.head.insertAdjacentHTML('beforeend', `
<style>
@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}
.spinner {
    border: 3px solid rgba(255, 255, 255, 0.3);
    border-radius: 50%;
    border-top: 3px solid var(--accent-color);
    width: 30px;
    height: 30px;
    animation: spin 1s linear infinite;
}
</style>
`);

// Log user information for debugging
debugLog(`App initialized for user: ${currentUser.id}`);
debugLog(`Current date/time: ${new Date().toISOString()}`);

// If running on https, check for service worker support
if (location.protocol === 'https:' && 'serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        navigator.serviceWorker.register('/sw.js').then(function(registration) {
            debugLog('ServiceWorker registration successful');
        }, function(err) {
            debugLog('ServiceWorker registration failed: ', err);
        });
    });
}
