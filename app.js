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

// --- UI Elements ---
const statusDiv = document.getElementById('status');
const roomInput = document.getElementById('roomid');
const peerCard = document.getElementById('peer-card');
const myVideo = document.getElementById('myvideo');
const peerVideo = document.getElementById('peervideo');
const ytInput = document.getElementById('ytlink');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatMessages = document.getElementById('chat-messages');
const emojiBtns = document.querySelectorAll('.emoji-btn');
const notifyAudio = document.getElementById('notify-audio');
const selfUsernameDiv = document.getElementById('self-username');
const peerUsernameDiv = document.getElementById('peer-username');

// --- Variables ---
let peer, localStream, roomid = '', isInitiator = false, connected = false;
let ytPlayer, isYTReady = false;
let chatRef = null, chatListener = null;
let username = '';
let peerName = 'Friend';
let lastMsgFrom = '';
let msgNotifyTimeout = null;

// --- Prompt for Username ---
function askUsername() {
  let name = window.localStorage.getItem('bb-username');
  if (!name) {
    name = prompt("Enter your display name for chat:", "MovieBuff") || "MovieBuff";
    window.localStorage.setItem('bb-username', name);
  }
  username = name.substring(0, 24);
  selfUsernameDiv.textContent = username;
}
askUsername();

// --- Get user media ---
navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
  localStream = stream;
  if (myVideo) {
    myVideo.srcObject = stream;
    myVideo.muted = true;
    myVideo.play().catch(() => {});
  }
  console.log("Local video stream acquired");
}).catch((err) => {
  setStatus("Camera/Mic access denied");
  console.error("getUserMedia error:", err);
});

function setStatus(msg) {
  statusDiv.textContent = 'Status: ' + msg;
  console.log(msg);
}

// --- Room Logic (robust signaling) ---
function createOrJoin() {
  if (connected) return;
  roomid = roomInput.value.trim();
  if (!roomid) return alert('Enter a Room Name!');
  const roomRef = db.ref('rooms/' + roomid);

  roomRef.once('value', snapshot => {
    if (snapshot.exists()) {
      isInitiator = false;
      joinRoom(roomRef, false);
    } else {
      isInitiator = true;
      roomRef.set({});
      joinRoom(roomRef, true);
    }
    setupChat(roomid);
  });
}

// --- Chat Logic ---
function setupChat(roomid) {
  if (chatListener) chatRef.off('child_added', chatListener);
  chatRef = db.ref('chats/' + roomid);
  chatMessages.innerHTML = '';
  chatListener = chatRef.on('child_added', snapshot => {
    const msg = snapshot.val();
    addChatMessage(msg);
  });
}

// Add message to chat window
function addChatMessage(msg) {
  const div = document.createElement('div');
  div.className = 'message ' + (msg.name === username ? 'you' : 'friend');
  const timeStr = msg.time ? `<span class="message time">${msg.time}</span>` : '';
  div.innerHTML = `<strong>${msg.name}:</strong> ${msg.text} ${timeStr}`;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  // Notifications for messages from others
  if (msg.name !== username) {
    if (document.hidden) {
      document.title = "💬 New message! | BingeBase";
    }
    if (notifyAudio) notifyAudio.play();
    highlightChat();
    if (msg.name !== lastMsgFrom) {
      peerName = msg.name;
      peerUsernameDiv.textContent = peerName;
      lastMsgFrom = msg.name;
    }
  }
}

// Chat form submit
chatForm.addEventListener('submit', function(e) {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text || !chatRef) return;
  const now = new Date();
  const hh = now.getHours().toString().padStart(2,'0');
  const mm = now.getMinutes().toString().padStart(2,'0');
  chatRef.push({
    name: username,
    text: text,
    time: `${hh}:${mm}`
  });
  chatInput.value = '';
});

// --- Emoji bar ---
emojiBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    chatInput.value += btn.textContent;
    chatInput.focus();
  });
});

// Highlight chat on new msg
function highlightChat() {
  chatMessages.style.background = "rgba(250,204,21,0.15)";
  if (msgNotifyTimeout) clearTimeout(msgNotifyTimeout);
  msgNotifyTimeout = setTimeout(() => {
    chatMessages.style.background = "";
    document.title = "BingeBase – Watch Together & Chat";
  }, 1600);
}

// --- Peer/WebRTC Logic with robust Firebase signaling ---
function joinRoom(roomRef, initiator) {
  setStatus('Joined room: ' + roomid);
  if (!localStream) {
    setStatus('Waiting for camera/mic...');
    console.warn("No localStream yet!");
    return;
  }
  peer = new SimplePeer({
    initiator: initiator,
    stream: localStream,
    trickle: false,
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
      ]
    }
  });

  let hasSignaledOffer = false;
  let hasSignaledAnswer = false;
  let offerSub = null, answerSub = null;

  peer.on('signal', data => {
    if (initiator && !hasSignaledOffer) {
      roomRef.child('offer').set(data);
      hasSignaledOffer = true;
      console.log("Set Firebase offer:", data);
    } else if (!initiator && !hasSignaledAnswer) {
      roomRef.child('answer').set(data);
      hasSignaledAnswer = true;
      console.log("Set Firebase answer:", data);
    }
  });

  if (initiator) {
    answerSub = roomRef.child('answer').on('value', snapshot => {
      const answer = snapshot.val();
      if (answer && !peer.destroyed) {
        try {
          peer.signal(answer);
          console.log("Received answer from Firebase:", answer);
        } catch (err) {
          console.error("Error applying answer:", err);
        }
      }
    });
  } else {
    offerSub = roomRef.child('offer').on('value', snapshot => {
      const offer = snapshot.val();
      if (offer && !peer.destroyed) {
        try {
          peer.signal(offer);
          console.log("Received offer from Firebase:", offer);
        } catch (err) {
          console.error("Error applying offer:", err);
        }
      }
    });
  }

  peer.on('connect', () => {
    setStatus('P2P Connected!');
    connected = true;
    if (peerCard) peerCard.style.display = '';
    console.log("P2P connection established.");
  });

  peer.on('stream', stream => {
    console.log("Peer video stream received", stream);
    if (peerVideo) {
      peerVideo.srcObject = stream;
      peerVideo.play().catch(()=>{});
      peerCard.style.display = '';
    } else {
      alert("peerVideo element missing!");
    }
  });

  peer.on('close', () => {
    setStatus('Peer disconnected.');
    if (peerCard) peerCard.style.display = 'none';
    console.warn('Peer connection closed');
    // Optionally clean up the room for rejoining
    roomRef.child('offer').remove();
    roomRef.child('answer').remove();
    if (offerSub) roomRef.child('offer').off('value', offerSub);
    if (answerSub) roomRef.child('answer').off('value', answerSub);
  });

  peer.on('error', err => {
    setStatus('Connection error: ' + err.message);
    console.error('PeerJS error:', err);
  });

  // YouTube sync
  peer.on('data', data => {
    let msg = {};
    try { msg = JSON.parse(data.toString()); } catch (e) { return; }
    if (msg.type === 'yt') {
      console.log("Received YT sync:", msg.videoId);
      loadYT(msg.videoId);
    }
    if (msg.type === 'yt-control' && isYTReady) {
      console.log("Received YT control:", msg);
      if (msg.action === 'play') ytPlayer.playVideo();
      if (msg.action === 'pause') ytPlayer.pauseVideo();
      if (msg.action === 'seek') ytPlayer.seekTo(msg.time, true);
    }
  });
}

// --- YOUTUBE PLAYER SYNC ---
// Load YouTube IFrame API
let tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
document.body.appendChild(tag);

// Important: This function must be global
window.onYouTubeIframeAPIReady = function() {
  ytPlayer = new YT.Player('ytplayer', {
    height: '315', width: '560', videoId: '',
    playerVars: { 'rel': 0, 'modestbranding': 1, 'color': 'white' },
    events: {
      'onReady': () => { isYTReady = true; console.log("YT Player ready"); },
      'onStateChange': onYTState
    }
  });
};

function setYT() {
  let url = ytInput.value.trim();
  let videoId = parseYT(url);
  if (!videoId) {
    alert('Invalid YouTube Link!');
    console.warn('YT parse failed for url:', url);
    return;
  }
  loadYT(videoId);
  if (peer && peer.connected) {
    peer.send(JSON.stringify({type: 'yt', videoId}));
    console.log("Sent YT sync:", videoId);
  }
}

// Robust YouTube ID extraction
function parseYT(url) {
  // Handles many YT URL forms (watch?v=, youtu.be/, embed/, shorts/, etc)
  const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(shorts\/)|(watch\?))\??v?=?([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[8] && match[8].length === 11) ? match[8] : null;
}

function loadYT(videoId) {
  if (isYTReady && ytPlayer && ytPlayer.loadVideoById) {
    ytPlayer.loadVideoById(videoId);
    console.log("Loaded YT video:", videoId);
  } else {
    let intv = setInterval(() => {
      if (isYTReady && ytPlayer && ytPlayer.loadVideoById) {
        ytPlayer.loadVideoById(videoId);
        clearInterval(intv);
        console.log("Loaded YT video after ready:", videoId);
      }
    }, 300);
  }
}

// Sync control (play/pause/seek)
let lastActionTime = 0;
function onYTState(event) {
  if (!peer || !peer.connected) return;
  let action = event.data === 1 ? 'play' : event.data === 2 ? 'pause' : null;
  if (action) {
    let now = Date.now();
    if (now - lastActionTime < 500) return;
    peer.send(JSON.stringify({type: 'yt-control', action}));
    console.log("Sent YT control:", action);
    lastActionTime = now;
  }
  if (event.data === 1 || event.data === 2) {
    try {
      let time = ytPlayer.getCurrentTime();
      peer.send(JSON.stringify({type: 'yt-control', action: 'seek', time}));
      console.log("Sent YT seek:", time);
    } catch (e) {
      console.error("YT seek error:", e);
    }
  }
}

// --- Restore username if page reloads
window.addEventListener('focus', () => {
  if (document.title.indexOf("New message") !== -1) {
    document.title = "BingeBase – Watch Together & Chat";
  }
});