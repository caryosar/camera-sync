class CameraSyncApp {
    constructor() {
        this.isController = false;
        this.hasJoinedSession = false;
        this.connectedPeers = 0;
        this.isConnected = false;
        
        this.stream = null;
        this.qrStream = null;
        this.peer = null;
        this.connections = new Map();
        this.myPeerId = null;
        this.qrScanning = false;
        
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
        this.qrScannerModal = document.getElementById('qr-scanner-modal');
        
        // Status elements
        this.connectedCount = document.getElementById('connected-count');
        this.debugMessage = document.getElementById('debug-message');
        this.cameraStatus = document.getElementById('camera-status');
        
        // Video elements
        this.controllerPreview = document.getElementById('controller-preview');
        this.receiverPreview = document.getElementById('receiver-preview');
        this.captureCanvas = document.getElementById('capture-canvas');
        this.qrVideo = document.getElementById('qr-video');
        this.qrCanvas = document.getElementById('qr-canvas');
        
        // Buttons
        this.beControllerBtn = document.getElementById('be-controller-btn');
        this.joinSessionBtn = document.getElementById('join-session-btn');
        this.triggerCamerasBtn = document.getElementById('trigger-cameras-btn');
        this.stopHostingBtn = document.getElementById('stop-hosting-btn');
        this.reconnectBtn = document.getElementById('reconnect-btn');
        this.backHomeBtn = document.getElementById('back-home-btn');
        this.cancelScanBtn = document.getElementById('cancel-scan-btn');
        
        // QR elements
        this.qrStatus = document.getElementById('qr-status');
    }

    attachEventListeners() {
        this.beControllerBtn.addEventListener('click', () => this.becomeController());
        this.joinSessionBtn.addEventListener('click', () => this.startQRScanner());
        this.triggerCamerasBtn.addEventListener('click', () => this.triggerCameras());
        this.stopHostingBtn.addEventListener('click', () => this.stopHosting());
        this.reconnectBtn.addEventListener('click', () => this.startQRScanner());
        this.backHomeBtn.addEventListener('click', () => this.backToHome());
        this.cancelScanBtn.addEventListener('click', () => this.stopQRScanner());
    }

    initializePeerJS() {
        this.peer = new Peer({
            host: 'peerjs-server.herokuapp.com',
            port: 443,
            secure: true,
            debug: 1
        });

        this.peer.on('open', (id) => {
            this.myPeerId = id;
            this.updateDebugMessage(`Ready - Peer ID: ${id.substring(0, 8)}...`);
            if (this.isController) {
                this.generateQRCode();
            }
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

    async startQRScanner() {
        try {
            this.qrStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' }
            });
            
            this.qrVideo.srcObject = this.qrStream;
            this.qrScannerModal.classList.remove('hidden');
            this.qrScanning = true;
            
            this.qrVideo.addEventListener('loadedmetadata', () => {
                this.scanQRCode();
            });
        } catch (error) {
            this.updateDebugMessage(`QR Scanner error: ${error.message}`);
        }
    }

    scanQRCode() {
        if (!this.qrScanning) return;
        
        const canvas = this.qrCanvas;
        const video = this.qrVideo;
        
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
            canvas.height = video.videoHeight;
            canvas.width = video.videoWidth;
            
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height);
            
            if (code) {
                this.handleQRCodeDetected(code.data);
                return;
            }
        }
        
        // Continue scanning
        requestAnimationFrame(() => this.scanQRCode());
    }

    handleQRCodeDetected(data) {
        try {
            const qrData = JSON.parse(data);
            if (qrData.type === 'camera_sync_controller' && qrData.peerId) {
                this.stopQRScanner();
                this.connectToController(qrData.peerId);
            }
        } catch (error) {
            this.qrStatus.textContent = 'Invalid QR code - keep scanning...';
        }
    }

    stopQRScanner() {
        this.qrScanning = false;
        if (this.qrStream) {
            this.qrStream.getTracks().forEach(track => track.stop());
            this.qrStream = null;
        }
        this.qrScannerModal.classList.add('hidden');
        this.qrStatus.textContent = 'Position QR code in view';
    }

    showScreen(screen) {
        [this.homeScreen, this.controllerScreen, this.receiverScreen].forEach(s => s.classList.add('hidden'));
        screen.classList.remove('hidden');
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
        this.updateDebugMessage('Starting controller...');
        if (this.myPeerId) {
            this.generateQRCode();
        }
    }

    async generateQRCode() {
        const qrData = {
            type: 'camera_sync_controller',
            peerId: this.myPeerId,
            timestamp: Date.now()
        };
        
        const existingQR = this.controllerScreen.querySelector('.qr-code-container');
        if (existingQR) {
            existingQR.remove();
        }
        
        const qrContainer = document.createElement('div');
        qrContainer.className = 'qr-code-container';
        
        const canvas = document.createElement('canvas');
        
        try {
            await QRCode.toCanvas(canvas, JSON.stringify(qrData), {
                width: 200,
                margin: 2,
                color: {
                    dark: '#000000',
                    light: '#FFFFFF'
                }
            });
            
            qrContainer.innerHTML = `
                <div class="qr-instructions">
                    <strong>Other devices:</strong> Click "Scan QR Code to Join" and point camera at this code
                </div>
            `;
            qrContainer.appendChild(canvas);
            
            this.controllerScreen.insertBefore(qrContainer, this.triggerCamerasBtn);
            this.updateDebugMessage('QR Code ready - waiting for connections');
            
        } catch (error) {
            this.updateDebugMessage(`QR Code error: ${error.message}`);
        }
    }

    connectToController(controllerId) {
        this.hasJoinedSession = true;
        this.showScreen(this.receiverScreen);
        
        if (this.stream) {
            this.receiverPreview.srcObject = this.stream;
        }
        
        this.updateDebugMessage(`Connecting to controller...`);
        
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
        
        this.connections.forEach((conn) => {
            if (conn.open) {
                conn.send({ type: 'TAKE_PHOTO', timestamp: Date.now() });
            }
        });
        
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
        
        canvas.toBlob(async (blob) => {
            try {
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
                    this.updateCameraStatus('Photo saved!');
                } else {
                    this.forceDownload(blob);
                }
            } catch (error) {
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
        this.updateCameraStatus('Photo saved to Photos!');
    }

    stopHosting() {
        this.isController = false;
        
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
        
        const qrContainer = this.controllerScreen.querySelector('.qr-code-container');
        if (qrContainer) {
            qrContainer.remove();
        }
    }

    backToHome() {
        this.hasJoinedSession = false;
        this.isConnected = false;
        this.updateDebugMessage('Ready to connect');
        this.showScreen(this.homeScreen);
        
        if (this.receiverPreview.srcObject) {
            this.receiverPreview.srcObject = null;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new CameraSyncApp();
});