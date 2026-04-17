class CameraSyncApp {
    constructor() {
        this.isController = false;
        this.hasJoinedSession = false;
        this.connectedPeers = 0;
        this.isConnected = false;
        
        this.stream = null;
        this.ws = null;
        this.server = null;
        
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
        // For demo purposes, we'll use WebSocket
        // In production, you'd use a proper WebSocket server
        this.updateDebugMessage('Starting hosting...');
        
        // Simulate server startup
        setTimeout(() => {
            this.updateDebugMessage('Ready for connections on WebSocket');
            this.startWebSocketServer();
        }, 1000);
    }

    startWebSocketServer() {
        // This is a simplified version - you'd need a real WebSocket server
        // For now, we'll simulate it
        this.updateDebugMessage('WebSocket server ready (simulated)');
    }

    showIPModal() {
        this.ipModal.classList.remove('hidden');
    }

    async joinSession() {
        const ip = this.ipInput.value || 'localhost';
        this.hideIPModal();
        this.hasJoinedSession = true;
        this.showScreen(this.receiverScreen);
        
        if (this.stream) {
            this.receiverPreview.srcObject = this.stream;
        }
        
        this.connectToHost(ip);
    }

    connectToHost(ip) {
        this.updateDebugMessage(`Connecting to ${ip}...`);
        
        // Simulate WebSocket connection
        setTimeout(() => {
            this.isConnected = true;
            this.updateDebugMessage('Connected!');
            this.reconnectBtn.classList.add('hidden');
            
            // Simulate receiving trigger
            this.simulateConnection();
        }, 1500);
    }

    simulateConnection() {
        // This simulates the WebSocket connection and message handling
        // In a real implementation, you'd have actual WebSocket code here
        this.updateDebugMessage('Connected to host - waiting for triggers');
    }

    triggerCameras() {
        this.updateDebugMessage('Trigger sent to all devices!');
        this.capturePhoto();
        
        // In real implementation, send WebSocket message to all connected clients
        // this.broadcastMessage('TAKE_PHOTO');
    }

    capturePhoto() {
        if (!this.stream) {
            this.updateCameraStatus('No camera stream available');
            return;
        }

        const canvas = this.captureCanvas;
        const video = this.isController ? this.controllerPreview : this.receiverPreview;
        
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);
        
        // Convert to blob and download
        canvas.toBlob((blob) => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `photo_${Date.now()}.jpg`;
            a.click();
            URL.revokeObjectURL(url);
        }, 'image/jpeg', 0.8);
        
        this.updateCameraStatus('Photo captured and downloaded!');
    }

    stopHosting() {
        this.isController = false;
        this.updateConnectedCount(0);
        this.updateDebugMessage('Stopped hosting');
        this.showScreen(this.homeScreen);
        
        if (this.controllerPreview.srcObject) {
            this.controllerPreview.srcObject = null;
        }
    }

    reconnect() {
        const ip = this.ipInput.value || 'localhost';
        this.connectToHost(ip);
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