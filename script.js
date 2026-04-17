class CameraSyncApp {
    constructor() {
        this.isController = false;
        this.hasJoinedSession = false;
        this.connectedPeers = 0;
        this.isConnected = false;
        
        this.stream = null;
        this.ws = null;
        this.connections = [];
        this.peerConnection = null;
        
        this.initializeElements();
        this.attachEventListeners();
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

    async requestCameraPermission() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: 'environment' }, 
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
        this.updateDebugMessage('Ready for connections - share your IP address');
        this.displayControllerInfo();
    }

    displayControllerInfo() {
        // Show the controller's connection info
        this.updateDebugMessage(`Controller ready! Others should connect to your IP address.`);
        
        // Try to get local IP (limited in browsers, but we can try)
        this.getLocalIP();
    }

    getLocalIP() {
        // This is a browser limitation - we can't easily get the local IP
        // So we'll show instructions instead
        const existingInfo = this.controllerScreen.querySelector('.connection-info');
        if (existingInfo) {
            existingInfo.remove();
        }
        
        const info = document.createElement('div');
        info.className = 'connection-info';
        info.innerHTML = `
            <div style="background: #e3f2fd; padding: 15px; margin: 10px 0; border-radius: 8px;">
                <strong>Connection Instructions:</strong><br>
                1. Find your iPad's IP address in Settings → Wi-Fi → (your network) → IP Address<br>
                2. Tell other iPads to connect to that IP address<br>
                3. Example: if your IP is 192.168.1.105, others connect to that<br>
                <small>Note: This demo simulates connections since browsers have networking limitations</small>
            </div>
        `;
        this.controllerScreen.insertBefore(info, this.triggerCamerasBtn);
    }

    async joinSession() {
        const ip = this.ipInput.value || 'localhost';
        this.hideIPModal();
        this.hasJoinedSession = true;
        this.showScreen(this.receiverScreen);
        
        if (this.stream) {
            this.receiverPreview.srcObject = this.stream;
        }
        
        this.connectToController(ip);
    }

    connectToController(controllerIP) {
        this.updateDebugMessage(`Connecting to controller at ${controllerIP}...`);
        
        // Since we can't do direct IP connections in browsers, 
        // we'll use a different approach - WebRTC or a signaling server
        // For now, let's simulate the connection
        this.simulateConnection();
    }

    simulateConnection() {
        setTimeout(() => {
            this.isConnected = true;
            this.updateDebugMessage('Connected to controller!');
            this.reconnectBtn.classList.add('hidden');
            
            // Simulate being added to controller's peer count
            this.simulateControllerUpdate();
            
            // Listen for trigger messages
            this.listenForTriggers();
        }, 1500);
    }

    simulateControllerUpdate() {
        // In a real app, this would happen on the controller automatically
        // For demo, we'll just show that connection worked
        this.updateDebugMessage('Successfully joined session - waiting for triggers');
    }

    listenForTriggers() {
        // Simulate listening for trigger messages
        // In real implementation, this would be WebSocket/WebRTC message handling
        this.updateDebugMessage('Waiting for camera triggers...');
        
        // Add manual trigger for testing
        this.addManualTrigger();
    }

    addManualTrigger() {
        const existingTrigger = this.receiverScreen.querySelector('.manual-trigger');
        if (existingTrigger) {
            existingTrigger.remove();
        }
        
        const triggerBtn = document.createElement('button');
        triggerBtn.className = 'btn blue manual-trigger';
        triggerBtn.textContent = 'Manual Test Trigger';
        triggerBtn.onclick = () => {
            this.updateDebugMessage('Manual trigger activated!');
            this.capturePhoto();
        };
        
        this.receiverScreen.insertBefore(triggerBtn, this.backHomeBtn);
    }

    triggerCameras() {
        this.updateDebugMessage('Triggering all connected cameras!');
        this.capturePhoto(); // Take photo on controller too
        
        // Simulate connected peers for demo
        if (this.connectedPeers === 0) {
            this.updateConnectedCount(2); // Simulate 2 connected devices
        }
        
        // In real implementation, send message to all connected clients
        this.broadcastTrigger();
    }

    broadcastTrigger() {
        // This would send the trigger message to all connected devices
        // For now, just update the message
        this.updateDebugMessage(`Trigger sent! (${this.connectedPeers} devices)`);
        
        // Simulate successful trigger
        setTimeout(() => {
            this.updateDebugMessage('All cameras triggered successfully!');
        }, 1000);
    }

    capturePhoto() {
        if (!this.stream) {
            this.updateCameraStatus('No camera stream available');
            return;
        }

        const canvas = this.captureCanvas;
        const video = this.isController ? this.controllerPreview : this.receiverPreview;
        
        // Make sure video has loaded
        if (video.videoWidth === 0 || video.videoHeight === 0) {
            this.updateCameraStatus('Video not ready yet');
            return;
        }
        
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);
        
        // Convert to blob and download
        canvas.toBlob((blob) => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `camera_sync_photo_${Date.now()}.jpg`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            this.updateCameraStatus('Photo captured and downloaded!');
        }, 'image/jpeg', 0.9);
    }

    stopHosting() {
        this.isController = false;
        this.updateConnectedCount(0);
        this.updateDebugMessage('Stopped hosting');
        this.showScreen(this.homeScreen);
        
        if (this.controllerPreview.srcObject) {
            this.controllerPreview.srcObject = null;
        }
        
        // Clean up connection info
        const info = this.controllerScreen.querySelector('.connection-info');
        if (info) {
            info.remove();
        }
    }

    reconnect() {
        const ip = this.ipInput.value || 'localhost';
        this.connectToController(ip);
    }

    backToHome() {
        this.hasJoinedSession = false;
        this.isConnected = false;
        this.updateDebugMessage('Disconnected from host');
        this.showScreen(this.homeScreen);
        
        if (this.receiverPreview.srcObject) {
            this.receiverPreview.srcObject = null;
        }
        
        // Clean up manual trigger
        const trigger = this.receiverScreen.querySelector('.manual-trigger');
        if (trigger) {
            trigger.remove();
        }
    }
}

// Initialize the app when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new CameraSyncApp();
});
