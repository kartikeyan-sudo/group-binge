// ADDED: Add this code to the enterRoom function
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
            
            // ADDED: Wait a bit before initializing YouTube player to ensure DOM is ready
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
            
            // ADDED: Add sync button to the interface
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
            console.error('Media error:', error);
            
            // ADDED: Allow joining without camera/mic
            if (confirm('Failed to access camera/microphone. Would you like to join without video/audio?')) {
                // Create an empty stream as a fallback
                localStream = new MediaStream();
                
                // Show main app, hide splash screen
                splashScreen.classList.add('hidden');
                mainApp.classList.remove('hidden');
                roomIdDisplay.textContent = currentRoom;
                
                // Set up Firebase listeners
                setupFirebaseListeners();
                initializeYouTubePlayer();
                
                // Set initial states
                currentUser.isAudioEnabled = false;
                currentUser.isVideoEnabled = false;
                
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
