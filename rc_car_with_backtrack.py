#!/usr/bin/env python3
"""
rc_car_with_backtrack.py
Single-file Flask server:
 - RC motor controls (GPIO)
 - rpicam stream started externally (or use your existing pipeline)
 - Web UI + camera embed (improved with modern design)
 - Backtracking path memory: record actions and durations, replay to return
Run as root: sudo python3 rc_car_with_backtrack.py
"""

from flask import Flask, render_template_string, request, jsonify
import RPi.GPIO as GPIO
import threading, time, subprocess, atexit

# -------------------------------
# GPIO setup (BCM pins)
# -------------------------------
GPIO.setmode(GPIO.BCM)

M1_IN1 = 17
M1_IN2 = 27
M2_IN1 = 22
M2_IN2 = 23

# Ensure pins are set
for p in (M1_IN1, M1_IN2, M2_IN1, M2_IN2):
    GPIO.setup(p, GPIO.OUT)
    GPIO.output(p, GPIO.LOW)

# Movement primitives
movement_lock = threading.Lock()
manual_enabled = True  # disabled during replay

def stop():
    with movement_lock:
        GPIO.output(M1_IN1, 0); GPIO.output(M1_IN2, 0)
        GPIO.output(M2_IN1, 0); GPIO.output(M2_IN2, 0)

def forward():
    with movement_lock:
        GPIO.output(M1_IN1, 1); GPIO.output(M1_IN2, 0)
        GPIO.output(M2_IN1, 1); GPIO.output(M2_IN2, 0)

def backward():
    with movement_lock:
        GPIO.output(M1_IN1, 0); GPIO.output(M1_IN2, 1)
        GPIO.output(M2_IN1, 0); GPIO.output(M2_IN2, 1)

def left():
    with movement_lock:
        GPIO.output(M1_IN1, 0); GPIO.output(M1_IN2, 1)
        GPIO.output(M2_IN1, 1); GPIO.output(M2_IN2, 0)

def right():
    with movement_lock:
        GPIO.output(M1_IN1, 1); GPIO.output(M1_IN2, 0)
        GPIO.output(M2_IN1, 0); GPIO.output(M2_IN2, 1)

# -------------------------------
# Simple camera pipeline launcher (keeps using your existing rpicam pipeline)
# You can still run rpicam-vid/gst pipeline externally. We do NOT auto-launch here.
# If you want to auto-start camera+gstreamer please let me know.
# -------------------------------

# -------------------------------
# Backtrack (recording) data structures
# -------------------------------
recording = False
path_lock = threading.Lock()
path = []  # list of dicts: {"action": "forward", "duration": 0.5, "speed": 70}
current_action = "stop"
action_start_time = None
action_start_speed = 70

# If you used speed earlier add PWM handling. This minimal example stores speed but doesn't use it to modulate GPIO.
# Keep current speed value to record
current_speed = 70

# Converts action to its inverse for backtrack
inverse_action = {
    "forward": "backward",
    "backward": "forward",
    "left": "right",
    "right": "left",
    "stop": "stop"
}

# Replay control
replaying = False
replay_lock = threading.Lock()

# -------------------------------
# Helpers: recording management
# -------------------------------
def _close_previous_action():
    global action_start_time, path, current_action, action_start_speed
    with path_lock:
        if recording and action_start_time is not None and current_action is not None:
            dur = time.time() - action_start_time
            # only store meaningful actions (non-zero and not "stop")
            entry = {"action": current_action, "duration": round(dur, 3), "speed": action_start_speed}
            path.append(entry)
            # reset
            action_start_time = time.time()
            # keep current_action unchanged until new one set by caller

def start_recording():
    global recording, path, action_start_time, action_start_speed
    with path_lock:
        recording = True
        path = []
        action_start_time = time.time()
        action_start_speed = current_speed

def stop_recording():
    global recording, action_start_time
    with path_lock:
        if recording and action_start_time is not None:
            dur = time.time() - action_start_time
            entry = {"action": current_action, "duration": round(dur, 3), "speed": action_start_speed}
            path.append(entry)
        recording = False
        action_start_time = None

def record_action_change(new_action):
    """Call this whenever we change the current_action (including stop)."""
    global current_action, action_start_time, action_start_speed
    # Close previous action and start new
    with path_lock:
        if recording:
            if action_start_time is None:
                action_start_time = time.time()
                action_start_speed = current_speed
            else:
                dur = time.time() - action_start_time
                entry = {"action": current_action, "duration": round(dur, 3), "speed": action_start_speed}
                path.append(entry)
                # start new
                action_start_time = time.time()
                action_start_speed = current_speed
    current_action = new_action

# -------------------------------
# Replay logic (runs on a background thread)
# -------------------------------
def replay_path():
    global replaying, manual_enabled, current_action
    with replay_lock:
        if replaying:
            return False
        replaying = True
    # block manual control
    manual_enabled = False
    print(">>> Replay started, manual controls disabled.")
    try:
        # snapshot path
        with path_lock:
            path_snapshot = list(path)
        # reverse order and invert actions
        for entry in reversed(path_snapshot):
            act = entry.get("action", "stop")
            dur = float(entry.get("duration", 0))
            # skip zero durations
            if dur <= 0:
                continue
            inv = inverse_action.get(act, "stop")
            # execute inverted action
            if inv == "forward":
                forward()
            elif inv == "backward":
                backward()
            elif inv == "left":
                left()
            elif inv == "right":
                right()
            else:
                stop()
            current_action = inv
            # hold for the same duration
            t0 = time.time()
            while time.time() - t0 < dur:
                time.sleep(0.01)
                # optionally could watch sensors here and abort on obstacle
            # stop briefly between steps
            stop()
            current_action = "stop"
            time.sleep(0.05)
        print(">>> Replay finished.")
    except Exception as e:
        print("Replay error:", e)
    finally:
        manual_enabled = True
        with replay_lock:
            replaying = False
    return True

# -------------------------------
# Flask app + UI (improved modern design)
# -------------------------------
app = Flask(__name__)

# Modern, improved HTML UI with better styling, layout, and user experience
HTML = """<!doctype html>
<html><head>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>RC Car Controller</title>
<style>
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%);
  color: #f1f5f9;
  min-height: 100vh;
  padding: 20px;
  display: flex;
  justify-content: center;
  align-items: center;
}

.container {
  max-width: 1200px;
  width: 100%;
  background: rgba(30, 41, 59, 0.8);
  backdrop-filter: blur(10px);
  border-radius: 20px;
  padding: 30px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

h2 {
  text-align: center;
  margin-bottom: 25px;
  font-size: 2em;
  background: linear-gradient(135deg, #60a5fa, #a78bfa);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  text-shadow: 0 0 30px rgba(96, 165, 250, 0.3);
}

/* Camera Feed Styling */
#video-container {
  position: relative;
  margin-bottom: 30px;
  border-radius: 15px;
  overflow: hidden;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
}

#video {
  width: 100%;
  max-width: 960px;
  display: block;
  border: 3px solid #334155;
  border-radius: 15px;
}

/* Main Controls Section */
.controls-section {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 30px;
  margin-bottom: 30px;
}

@media (max-width: 768px) {
  .controls-section {
    grid-template-columns: 1fr;
  }
}

/* Movement Controls - D-Pad Style */
.movement-controls {
  background: rgba(51, 65, 85, 0.5);
  border-radius: 15px;
  padding: 20px;
  box-shadow: 0 5px 20px rgba(0, 0, 0, 0.3);
}

.movement-controls h3 {
  text-align: center;
  margin-bottom: 20px;
  color: #94a3b8;
  font-size: 1.2em;
}

.dpad {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  max-width: 300px;
  margin: 0 auto;
}

.dpad .btn {
  min-height: 80px;
  font-size: 1.1em;
  font-weight: 600;
}

.dpad .btn:nth-child(1) { grid-column: 2; }
.dpad .btn:nth-child(2) { grid-column: 1; }
.dpad .btn:nth-child(3) { grid-column: 2; }
.dpad .btn:nth-child(4) { grid-column: 3; grid-row: 2; }
.dpad .btn:nth-child(5) { grid-column: 2; }

/* Recording Controls */
.recording-controls {
  background: rgba(51, 65, 85, 0.5);
  border-radius: 15px;
  padding: 20px;
  box-shadow: 0 5px 20px rgba(0, 0, 0, 0.3);
}

.recording-controls h3 {
  text-align: center;
  margin-bottom: 20px;
  color: #94a3b8;
  font-size: 1.2em;
}

.rec-buttons {
  display: grid;
  gap: 12px;
}

/* Button Styles */
.btn {
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  color: #fff;
  padding: 15px 24px;
  border-radius: 12px;
  border: none;
  cursor: pointer;
  font-size: 1em;
  font-weight: 600;
  transition: all 0.3s ease;
  box-shadow: 0 4px 15px rgba(59, 130, 246, 0.3);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 25px rgba(59, 130, 246, 0.5);
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
}

.btn:active {
  transform: translateY(0);
  box-shadow: 0 2px 10px rgba(59, 130, 246, 0.4);
}

.btn.stop-btn {
  background: linear-gradient(135deg, #ef4444, #dc2626);
  box-shadow: 0 4px 15px rgba(239, 68, 68, 0.3);
}

.btn.stop-btn:hover {
  background: linear-gradient(135deg, #dc2626, #b91c1c);
  box-shadow: 0 6px 25px rgba(239, 68, 68, 0.5);
}

.btn.record-btn {
  background: linear-gradient(135deg, #10b981, #059669);
  box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3);
}

.btn.record-btn:hover {
  background: linear-gradient(135deg, #059669, #047857);
  box-shadow: 0 6px 25px rgba(16, 185, 129, 0.5);
}

.btn.stop-record-btn {
  background: linear-gradient(135deg, #f59e0b, #d97706);
  box-shadow: 0 4px 15px rgba(245, 158, 11, 0.3);
}

.btn.stop-record-btn:hover {
  background: linear-gradient(135deg, #d97706, #b45309);
  box-shadow: 0 6px 25px rgba(245, 158, 11, 0.5);
}

.btn.replay-btn {
  background: linear-gradient(135deg, #8b5cf6, #7c3aed);
  box-shadow: 0 4px 15px rgba(139, 92, 246, 0.3);
}

.btn.replay-btn:hover {
  background: linear-gradient(135deg, #7c3aed, #6d28d9);
  box-shadow: 0 6px 25px rgba(139, 92, 246, 0.5);
}

.btn.clear-btn {
  background: linear-gradient(135deg, #64748b, #475569);
  box-shadow: 0 4px 15px rgba(100, 116, 139, 0.3);
}

.btn.clear-btn:hover {
  background: linear-gradient(135deg, #475569, #334155);
  box-shadow: 0 6px 25px rgba(100, 116, 139, 0.5);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

/* Status Panel */
.status-panel {
  background: rgba(51, 65, 85, 0.5);
  border-radius: 15px;
  padding: 20px;
  box-shadow: 0 5px 20px rgba(0, 0, 0, 0.3);
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 15px;
}

.status-item {
  background: rgba(30, 41, 59, 0.6);
  padding: 15px;
  border-radius: 10px;
  text-align: center;
  border: 1px solid rgba(148, 163, 184, 0.2);
}

.status-label {
  color: #94a3b8;
  font-size: 0.9em;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 8px;
}

.status-value {
  font-size: 1.4em;
  font-weight: 700;
}

.status-value.on {
  color: #10b981;
  text-shadow: 0 0 10px rgba(16, 185, 129, 0.5);
}

.status-value.off {
  color: #64748b;
}

.rec-indicator {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #ef4444;
  margin-right: 8px;
  animation: pulse 1.5s ease-in-out infinite;
  box-shadow: 0 0 10px rgba(239, 68, 68, 0.8);
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.rec-indicator.inactive {
  background: #475569;
  animation: none;
  box-shadow: none;
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .container {
    padding: 20px;
  }
  
  h2 {
    font-size: 1.5em;
  }
  
  .dpad .btn {
    min-height: 60px;
    font-size: 0.9em;
  }
  
  .status-grid {
    grid-template-columns: 1fr;
  }
}

/* Loading animation */
.loading {
  opacity: 0.6;
  pointer-events: none;
}
</style>
</head><body>
<div class="container">
  <h2>🚗 RC Car Controller</h2>

  <!-- Camera Feed -->
  <div id="video-container">
    <img id="video" src="http://192.168.1.1:8554/" alt="Camera Feed">
  </div>

  <!-- Main Controls -->
  <div class="controls-section">
    <!-- Movement Controls -->
    <div class="movement-controls">
      <h3>Movement Controls</h3>
      <div class="dpad">
        <button class="btn" onclick="cmd('forward')">↑ Forward</button>
        <button class="btn" onclick="cmd('left')">← Left</button>
        <button class="btn stop-btn" onclick="cmd('stop')">■ Stop</button>
        <button class="btn" onclick="cmd('right')">Right →</button>
        <button class="btn" onclick="cmd('backward')">↓ Backward</button>
      </div>
    </div>

    <!-- Recording Controls -->
    <div class="recording-controls">
      <h3>Path Recording</h3>
      <div class="rec-buttons">
        <button class="btn record-btn" onclick="startRecord()">● Start Recording</button>
        <button class="btn stop-record-btn" onclick="stopRecord()">■ Stop Recording</button>
        <button class="btn replay-btn" onclick="replay()">⟲ Replay Path</button>
        <button class="btn clear-btn" onclick="clearPath()">⌫ Clear Path</button>
      </div>
    </div>
  </div>

  <!-- Status Panel -->
  <div class="status-panel">
    <div class="status-grid">
      <div class="status-item">
        <div class="status-label">Recording Status</div>
        <div class="status-value" id="recStatus">
          <span class="rec-indicator inactive"></span>OFF
        </div>
      </div>
      <div class="status-item">
        <div class="status-label">Path Steps</div>
        <div class="status-value" id="pathLen">0</div>
      </div>
      <div class="status-item">
        <div class="status-label">Replay Status</div>
        <div class="status-value" id="replayStatus">OFF</div>
      </div>
    </div>
  </div>
</div>

<script>
let curAction = 'stop';
let isProcessing = false;

function cmd(action) {
  if (isProcessing) return;
  isProcessing = true;
  
  fetch('/api/command', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({command: action})
  })
  .then(response => response.json())
  .then(data => {
    curAction = action;
    setTimeout(() => fetchStatus(), 200);
  })
  .catch(err => console.error('Command error:', err))
  .finally(() => {
    setTimeout(() => { isProcessing = false; }, 300);
  });
}

function startRecord() {
  fetch('/api/record/start', {method: 'POST'})
    .then(() => fetchStatus())
    .catch(err => console.error('Start record error:', err));
}

function stopRecord() {
  fetch('/api/record/stop', {method: 'POST'})
    .then(() => fetchStatus())
    .catch(err => console.error('Stop record error:', err));
}

function replay() {
  fetch('/api/record/replay', {method: 'POST'})
    .then(() => fetchStatus())
    .catch(err => console.error('Replay error:', err));
}

function clearPath() {
  if (confirm('Clear all recorded path data?')) {
    fetch('/api/record/clear', {method: 'POST'})
      .then(() => fetchStatus())
      .catch(err => console.error('Clear error:', err));
  }
}

function fetchStatus() {
  fetch('/api/record/status')
    .then(r => r.json())
    .then(j => {
      // Recording status
      const recStatus = document.getElementById('recStatus');
      const indicator = recStatus.querySelector('.rec-indicator');
      if (j.recording) {
        recStatus.innerHTML = '<span class="rec-indicator"></span>ON';
        recStatus.classList.add('on');
        recStatus.classList.remove('off');
      } else {
        recStatus.innerHTML = '<span class="rec-indicator inactive"></span>OFF';
        recStatus.classList.add('off');
        recStatus.classList.remove('on');
      }
      
      // Path length
      document.getElementById('pathLen').textContent = j.path_length || 0;
      
      // Replay status
      const replayStatus = document.getElementById('replayStatus');
      if (j.replaying) {
        replayStatus.textContent = 'ACTIVE';
        replayStatus.classList.add('on');
        replayStatus.classList.remove('off');
      } else {
        replayStatus.textContent = 'OFF';
        replayStatus.classList.add('off');
        replayStatus.classList.remove('on');
      }
    })
    .catch(e => console.error('Status fetch error:', e));
}

// Auto-refresh status
setInterval(fetchStatus, 800);

// Initial status fetch
fetchStatus();
</script>

</body></html>
"""

# -------------------------------
# API endpoints (control kept as before, but check manual_enabled)
# -------------------------------
@app.route("/")
def index():
    return render_template_string(HTML)

@app.route("/api/command", methods=["POST"])
def api_command():
    global current_action, current_speed, action_start_time, action_start_speed
    data = request.get_json() or {}
    cmd = data.get("command","stop")
    # if we're replaying, reject manual commands
    if replaying:
        return jsonify({"status":"error","reason":"replay_in_progress"}), 409
    # apply command
    if cmd == "forward":
        forward()
    elif cmd == "backward":
        backward()
    elif cmd == "left":
        left()
    elif cmd == "right":
        right()
    else:
        stop()
    # recording: handle action change timing
    # update recorded path
    record_action_change(cmd)
    return jsonify({"status":"ok","action":cmd})

# -------------------------------
# Recording endpoints
# -------------------------------
@app.route("/api/record/start", methods=["POST"])
def api_record_start():
    start_recording()
    return jsonify({"status":"recording_started"})

@app.route("/api/record/stop", methods=["POST"])
def api_record_stop():
    stop_recording()
    return jsonify({"status":"recording_stopped","path_length":len(path)})

@app.route("/api/record/clear", methods=["POST"])
def api_record_clear():
    global path
    with path_lock:
        path = []
    return jsonify({"status":"path_cleared"})

@app.route("/api/record/replay", methods=["POST"])
def api_record_replay():
    global replaying
    with replay_lock:
        if replaying:
            return jsonify({"status":"already_replaying"}), 409
        # start replay in background thread
        th = threading.Thread(target=replay_path, daemon=True)
        th.start()
        return jsonify({"status":"replay_started"})

@app.route("/api/record/status", methods=["GET"])
def api_record_status():
    return jsonify({
        "recording": recording,
        "path_length": len(path),
        "replaying": replaying
    })

# -------------------------------
# Clean shutdown
# -------------------------------
def cleanup():
    try:
        stop()
    except Exception:
        pass
    GPIO.cleanup()
    print("GPIO cleaned up")

atexit.register(cleanup)

# -------------------------------
# Run server
# -------------------------------
if __name__ == "__main__":
    try:
        print("Starting RC car server with backtrack memory.")
        print("Open UI at http://<pi-ip>:8080")
        from waitress import serve
        # Use waitress for stability; if not installed, fallback to Flask dev server
        try:
            serve(app, host="0.0.0.0", port=8080)
        except Exception:
            app.run(host="0.0.0.0", port=8080, debug=False)
    except KeyboardInterrupt:
        pass
    finally:
        cleanup()
