// ----- Firebase Config -----
// Replace below with your Firebase project settings:
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT_ID.firebaseio.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
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

// --- Variables ---
let peer, localStream, roomid = '', isInitiator = false, connected = false;
let ytPlayer, isYTReady = false;

// --- Get user media ---
navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
  localStream = stream;
  myVideo.srcObject = stream;
}).catch(() => {
  setStatus("Camera/Mic access denied");
});

function setStatus(msg) {
  statusDiv.textContent = 'Status: ' + msg;
}

// --- Room Logic ---
function createOrJoin() {
  if (connected) return;
  roomid = roomInput.value.trim();
  if (!roomid) return alert('Enter a Room ID!');
  const roomRef = db.ref('rooms/' + roomid);

  roomRef.once('value', snapshot => {
    if (snapshot.exists()) {
      isInitiator = false;
      joinRoom(roomRef);
    } else {
      isInitiator = true;
      roomRef.set({});
      joinRoom(roomRef);
    }
  });
}

function joinRoom(roomRef) {
  setStatus('Joined room: ' + roomid);
  peer = new SimplePeer({
    initiator: isInitiator,
    stream: localStream,
    trickle: false,
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
      ]
    }
  });

  peer.on('signal', data => {
    roomRef.push({ from: isInitiator ? 'offer' : 'answer', data });
  });

  roomRef.on('child_added', snapshot => {
    const val = snapshot.val();
    if ((isInitiator && val.from === 'answer') || (!isInitiator && val.from === 'offer')) {
      peer.signal(val.data);
    }
  });

  peer.on('connect', () => {
    setStatus('P2P Connected!');
    connected = true;
    peerCard.style.display = '';
  });
  peer.on('stream', stream => {
    peerVideo.srcObject = stream;
    peerCard.style.display = '';
  });

  peer.on('close', () => {
    setStatus('Peer disconnected.');
    peerCard.style.display = 'none';
  });

  peer.on('error', err => {
    setStatus('Connection error: ' + err.message);
  });

  // YouTube sync
  peer.on('data', data => {
    let msg = {};
    try { msg = JSON.parse(data.toString()); } catch (e) { return; }
    if (msg.type === 'yt') loadYT(msg.videoId);
    if (msg.type === 'yt-control' && isYTReady) {
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

function onYouTubeIframeAPIReady() {
  ytPlayer = new YT.Player('ytplayer', {
    height: '315', width: '560', videoId: '',
    playerVars: { 'rel': 0, 'modestbranding': 1, 'color': 'white' },
    events: {
      'onReady': () => { isYTReady = true; },
      'onStateChange': onYTState
    }
  });
}

function setYT() {
  let url = ytInput.value.trim();
  let videoId = parseYT(url);
  if (!videoId) return alert('Invalid YouTube Link!');
  loadYT(videoId);
  if (peer && peer.connected) peer.send(JSON.stringify({type: 'yt', videoId}));
}

function parseYT(url) {
  let match = url.match(/(?:youtu\.be\/|youtube\.com.*(?:v=|\/embed\/|\/shorts\/))([\w-]{11})/);
  return match ? match[1] : null;
}

function loadYT(videoId) {
  if (isYTReady) ytPlayer.loadVideoById(videoId);
  else {
    let intv = setInterval(() => {
      if (isYTReady) {
        ytPlayer.loadVideoById(videoId);
        clearInterval(intv);
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
    lastActionTime = now;
  }
  if (event.data === 1 || event.data === 2) {
    try {
      let time = ytPlayer.getCurrentTime();
      peer.send(JSON.stringify({type: 'yt-control', action: 'seek', time}));
    } catch (e) {}
  }
}