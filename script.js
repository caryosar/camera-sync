class CameraSyncApp {
    constructor() {
        this.isController = false;
        this.hasJoinedSession = false;
        this.connectedPeers = 0;
        this.isConnected = false;
        
        this.stream = null;
        this.peer = null;
        this.connections = new Map(); // Store peer connections
        this.myPeerId = null;
        
        this.initializeElements();
        this.attachEventListeners();
        this.initializePeerJS();
        this.requestCameraPermission();
    }

    initializeElements() {
        // Screens
        this.homeScreen = document.getElementById('home-screen');
        this.controllerScreen = document.getElementById('controller-screen');
        this.receiverScreen = document.getElementById('receiver-screen');
        this.ipModal = document.getElementById('ip-modal');
        
        // Status elements
        this.connectedCount = document.getElementById('connected-count');
        this.debugMessage = document.getElementById('debug-message');
        this.cameraStatus = document.getElementById('camera-status');
        
        // Video elements
        this.controllerPreview = document.getElementById('controller-preview');
        this.receiverPreview = document.getElementById('receiver-preview');
        this.captureCanvas = document.getElementById('capture-canvas');
        
        // Buttons
        this.beControllerBtn = document.getElementById('be-controller-btn');
        this.joinSessionBtn = document.getElementById('join-session-btn');
        this.triggerCamerasBtn = document.getElementById('trigger-cameras-btn');
        this.stopHostingBtn = document.getElementById('stop-hosting-btn');
        this.reconnectBtn = document.getElementById('reconnect-btn');
        this.backHomeBtn = document.getElementById('back-home-btn');
        this.connectBtn = document.getElementById('connect-btn');
        this.cancelBtn = document.getElementById('cancel-btn');
        
        // Input
        this.ipInput = document.getElementById('ip-input');
    }

    attachEventListeners() {
        this.beControllerBtn.addEventListener('click', () => this.becomeController());
        this.joinSessionBtn.addEventListener('click', () => this.showIPModal());
        this.triggerCamerasBtn.addEventListener('click', () => this.triggerCameras());
        this.stopHostingBtn.addEventListener('click', () => this.stopHosting());
        this.reconnectBtn.addEventListener('click', () => this.reconnect());
        this.backHomeBtn.addEventListener('click', () => this.backToHome());
        this.connectBtn.addEventListener('click', () => this.joinSession());
        this.cancelBtn.addEventListener('click', () => this.hideIPModal());
    }

    initializePeerJS() {
        // Using PeerJS for WebRTC communication
        this.peer = new Peer({
            host: 'peerjs-server.herokuapp.com',
            port: 443,
            secure: true,
            debug: 2
        });

        this.peer.on('open', (id) => {
            this.myPeerId = id;
            this.updateDebugMessage(`Ready - Your ID: ${id.substring(0, 8)}...`);
        });

        this.peer.on('connection', (conn) => {
            this.handleIncomingConnection(conn);
        });

        this.peer.on('error', (err) => {
            this.updateDebugMessage(`Peer error: ${err.message}`);
        });
    }

    handleIncomingConnection(conn) {
        this.connections.set(conn.peer, conn);
        
        conn.on('open', () => {
            this.updateConnectedCount(this.connections.size);
            this.updateDebugMessage(`Device connected: ${conn.peer.substring(0, 8)}...`);
        });

        conn.on('data', (data) => {
            if (data.type === 'TAKE_PHOTO') {
                this.capturePhoto();
                this.updateDebugMessage('Photo triggered by controller!');
            }
        });

        conn.on('close', () => {
            this.connections.delete(conn.peer);
            this.updateConnectedCount(this.connections.size);
        });
    }

    async requestCameraPermission() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ 
                video: { 
                    facingMode: 'environment',
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                }, 
                audio: false 
            });
            this.updateCameraStatus('Camera ready');
        } catch (error) {
            this.updateCameraStatus(`Camera error: ${error.message}`);
        }
    }

    showScreen(screen) {
        [this.homeScreen, this.controllerScreen, this.receiverScreen].forEach(s => s.classList.add('hidden'));
        screen.classList.remove('hidden');
    }

    showIPModal() {
        // Change the modal to ask for Controller ID instead of IP
        const modalTitle = this.ipModal.querySelector('h3');
        modalTitle.textContent = 'Enter Controller ID';
        this.ipInput.placeholder = 'Controller Peer ID';
        this.ipModal.classList.remove('hidden');
    }

    hideIPModal() {
        this.ipModal.classList.add('hidden');
    }

    updateDebugMessage(message) {
        this.debugMessage.textContent = message;
    }

    updateCameraStatus(status) {
        this.cameraStatus.textContent = `Camera Status: ${status}`;
    }

    updateConnectedCount(count) {
        this.connectedPeers = count;
        this.connectedCount.textContent = count;
        this.triggerCamerasBtn.disabled = count === 0;
    }

    async becomeController() {
        this.isController = true;
        this.showScreen(this.controllerScreen);
        
        if (this.stream) {
            this.controllerPreview.srcObject = this.stream;
        }
        
        this.startHosting();
    }

    startHosting() {
        this.updateDebugMessage('Waiting for peer connections...');
        this.displayControllerInfo();
    }

    displayControllerInfo() {
        const existingInfo = this.controllerScreen.querySelector('.connection-info');
        if (existingInfo) {
            existingInfo.remove();
        }
        
        const info = document.createElement('div');
        info.className = 'connection-info';
        info.innerHTML = `
            <div style="background: #e3f2fd; padding: 15px; margin: 10px 0; border-radius: 8px;">
                <strong>Your Controller ID:</strong><br>
                <code style="font-size: 18px; background: #fff; padding: 5px; border-radius: 4px;">${this.myPeerId || 'Loading...'}</code><br>
                <small>Share this ID with other devices to connect</small>
            </div>
        `;
        this.controllerScreen.insertBefore(info, this.triggerCamerasBtn);
    }

    async joinSession() {
        const controllerId = this.ipInput.value.trim();
        if (!controllerId) {
            alert('Please enter a Controller ID');
            return;
        }
        
        this.hideIPModal();
        this.hasJoinedSession = true;
        this.showScreen(this.receiverScreen);
        
        if (this.stream) {
            this.receiverPreview.srcObject = this.stream;
        }
        
        this.connectToController(controllerId);
    }

    connectToController(controllerId) {
        this.updateDebugMessage(`Connecting to controller: ${controllerId.substring(0, 8)}...`);
        
        const conn = this.peer.connect(controllerId);
        
        conn.on('open', () => {
            this.isConnected = true;
            this.updateDebugMessage('Connected to controller!');
            this.reconnectBtn.classList.add('hidden');
        });

        conn.on('data', (data) => {
            if (data.type === 'TAKE_PHOTO') {
                this.capturePhoto();
                this.updateDebugMessage('Photo triggered by controller!');
            }
        });

        conn.on('close', () => {
            this.isConnected = false;
            this.updateDebugMessage('Disconnected from controller');
            this.reconnectBtn.classList.remove('hidden');
        });

        conn.on('error', (err) => {
            this.updateDebugMessage(`Connection failed: ${err.message}`);
            this.reconnectBtn.classList.remove('hidden');
        });
    }

    triggerCameras() {
        this.updateDebugMessage('Triggering all connected cameras!');
        
        // Send trigger to all connected devices
        this.connections.forEach((conn) => {
            if (conn.open) {
                conn.send({ type: 'TAKE_PHOTO', timestamp: Date.now() });
            }
        });
        
        // Take photo on controller too
        this.capturePhoto();
        
        this.updateDebugMessage(`Trigger sent to ${this.connections.size} devices!`);
    }

    async capturePhoto() {
        if (!this.stream) {
            this.updateCameraStatus('No camera stream available');
            return;
        }

        const canvas = this.captureCanvas;
        const video = this.isController ? this.controllerPreview : this.receiverPreview;
        
        if (video.videoWidth === 0 || video.videoHeight === 0) {
            this.updateCameraStatus('Video not ready yet');
            return;
        }
        
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);
        
        // Convert to blob and save automatically
        canvas.toBlob(async (blob) => {
            try {
                // Try to use the File System Access API for automatic saving
                if ('showSaveFilePicker' in window) {
                    const fileHandle = await window.showSaveFilePicker({
                        suggestedName: `camera_sync_${Date.now()}.jpg`,
                        types: [{
                            description: 'JPEG images',
                            accept: { 'image/jpeg': ['.jpg', '.jpeg'] }
                        }]
                    });
                    const writable = await fileHandle.createWritable();
                    await writable.write(blob);
                    await writable.close();
                    this.updateCameraStatus('Photo saved automatically!');
                } else {
                    // Fallback: Force download (will go to Downloads folder)
                    this.forceDownload(blob);
                }
            } catch (error) {
                // User cancelled or error occurred, fallback to download
                this.forceDownload(blob);
            }
        }, 'image/jpeg', 0.9);
    }

    forceDownload(blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `camera_sync_${Date.now()}.jpg`;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        this.updateCameraStatus('Photo downloaded to Photos app!');
    }

    stopHosting() {
        this.isController = false;
        
        // Close all connections
        this.connections.forEach((conn) => {
            conn.close();
        });
        this.connections.clear();
        
        this.updateConnectedCount(0);
        this.updateDebugMessage('Stopped hosting');
        this.showScreen(this.homeScreen);
        
        if (this.controllerPreview.srcObject) {
            this.controllerPreview.srcObject = null;
        }
        
        const info = this.controllerScreen.querySelector('.connection-info');
        if (info) {
            info.remove();
        }
    }

    reconnect() {
        const controllerId = this.ipInput.value.trim();
        if (controllerId) {
            this.connectToController(controllerId);
        } else {
            this.showIPModal();
        }
    }

    backToHome() {
        this.hasJoinedSession = false;
        this.isConnected = false;
        this.updateDebugMessage('Disconnected from host');
        this.showScreen(this.homeScreen);
        
        if (this.receiverPreview.srcObject) {
            this.receiverPreview.srcObject = null;
        }
    }
}

// Initialize the app when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new CameraSyncApp();
});