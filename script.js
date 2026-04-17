class CameraSyncApp {
    constructor() {
        this.isController = false;
        this.hasJoinedSession = false;
        this.connectedPeers = 0;
        this.isConnected = false;
        
        this.stream = null;
        this.peer = null;
        this.connections = new Map();
        this.myPeerId = null;
        this.qrScanning = false;
        
        this.initializeElements();
        this.attachEventListeners();
        this.requestCameraPermission();
        
        setTimeout(() => {
            this.initializePeerJS();
        }, 1000);
    }

    initializeElements() {
        // Screens
        this.homeScreen = document.getElementById('home-screen');
        this.controllerScreen = document.getElementById('controller-screen');
        this.receiverScreen = document.getElementById('receiver-screen');
        this.joinModal = document.getElementById('join-modal');
        this.qrScannerModal = document.getElementById('qr-scanner-modal');
        this.idInputModal = document.getElementById('id-input-modal');
        
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
        
        // Join modal buttons
        this.scanQRBtn = document.getElementById('scan-qr-btn');
        this.manualIdBtn = document.getElementById('manual-id-btn');
        this.cancelJoinBtn = document.getElementById('cancel-join-btn');
        
        // QR scanner buttons
        this.cancelScanBtn = document.getElementById('cancel-scan-btn');
        
        // Manual input elements
        this.controllerIdInput = document.getElementById('controller-id-input');
        this.connectManualBtn = document.getElementById('connect-manual-btn');
        this.cancelManualBtn = document.getElementById('cancel-manual-btn');
        
        // QR elements
        this.qrStatus = document.getElementById('qr-status');
    }

    attachEventListeners() {
        this.beControllerBtn.addEventListener('click', () => this.becomeController());
        this.joinSessionBtn.addEventListener('click', () => this.showJoinModal());
        this.triggerCamerasBtn.addEventListener('click', () => this.triggerCameras());
        this.stopHostingBtn.addEventListener('click', () => this.stopHosting());
        this.reconnectBtn.addEventListener('click', () => this.showJoinModal());
        this.backHomeBtn.addEventListener('click', () => this.backToHome());
        
        // Join modal
        this.scanQRBtn.addEventListener('click', () => this.startQRScanner());
        this.manualIdBtn.addEventListener('click', () => this.showManualInput());
        this.cancelJoinBtn.addEventListener('click', () => this.hideJoinModal());
        
        // QR scanner
        this.cancelScanBtn.addEventListener('click', () => this.cancelQRScanner());
        
        // Manual input
        this.connectManualBtn.addEventListener('click', () => this.connectManually());
        this.cancelManualBtn.addEventListener('click', () => this.hideManualInput());
    }

    showJoinModal() {
        this.joinModal.classList.remove('hidden');
    }

    hideJoinModal() {
        this.joinModal.classList.add('hidden');
    }

    showManualInput() {
        this.hideJoinModal();
        this.idInputModal.classList.remove('hidden');
    }

    hideManualInput() {
        this.idInputModal.classList.add('hidden');
    }

    connectManually() {
        const controllerId = this.controllerIdInput.value.trim();
        if (!controllerId) {
            alert('Please enter a Controller ID');
            return;
        }
        
        this.hideManualInput();
        this.connectToController(controllerId);
    }

    initializePeerJS() {
        this.updateDebugMessage('Initializing connection...');
        
        try {
            this.peer = new Peer({
                debug: 1
            });

            this.peer.on('open', (id) => {
                this.myPeerId = id;
                this.updateDebugMessage(`Connected! ID: ${id.substring(0, 8)}...`);
                
                if (this.isController) {
                    this.generateQRCode();
                }
            });

            this.peer.on('connection', (conn) => {
                this.handleIncomingConnection(conn);
            });

            this.peer.on('error', (err) => {
                this.updateDebugMessage(`Connection error: ${err.type}`);
                this.fallbackToManualConnection();
            });

        } catch (error) {
            this.updateDebugMessage(`Error: ${error.message}`);
            this.fallbackToManualConnection();
        }
    }

    fallbackToManualConnection() {
        this.myPeerId = 'local-' + Math.random().toString(36).substr(2, 9);
        
        if (this.isController) {
            this.generateQRCode();
        }
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
                this.updateDebugMessage('Photo triggered!');
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
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }, 
                audio: false 
            });
            this.updateCameraStatus('Camera ready');
        } catch (error) {
            this.updateCameraStatus(`Camera error: ${error.message}`);
        }
    }

    startQRScanner() {
        this.hideJoinModal();
        
        // Use the existing camera stream for QR scanning
        if (!this.stream) {
            this.updateDebugMessage('Camera not available for QR scanning');
            return;
        }
        
        // Set the main camera stream to the QR video element
        this.qrVideo.srcObject = this.stream;
        this.qrScannerModal.classList.remove('hidden');
        this.qrScanning = true;
        this.updateDebugMessage('QR Scanner active - point at QR code');
        
        // Start scanning once video is loaded
        this.qrVideo.addEventListener('loadedmetadata', () => {
            this.scanQRCode();
        }, { once: true });
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
            
            if (typeof jsQR !== 'undefined') {
                const code = jsQR(imageData.data, imageData.width, imageData.height);
                
                if (code) {
                    this.handleQRCodeDetected(code.data);
                    return;
                }
            }
        }
        
        requestAnimationFrame(() => this.scanQRCode());
    }

    handleQRCodeDetected(data) {
        try {
            // Try to parse as JSON first
            const qrData = JSON.parse(data);
            if (qrData.type === 'camera_sync_controller' && qrData.peerId) {
                this.stopQRScannerAndConnect(qrData.peerId);
                return;
            }
        } catch (error) {
            // If not JSON, treat as plain text ID
            if (data && data.length > 5) {
                this.stopQRScannerAndConnect(data);
                return;
            }
        }
        
        this.qrStatus.textContent = 'Invalid QR code - keep scanning...';
    }

    stopQRScannerAndConnect(controllerId) {
        this.updateDebugMessage('QR Code detected! Connecting...');
        this.stopQRScanner();
        this.connectToController(controllerId);
    }

    stopQRScanner() {
        this.qrScanning = false;
        
        // Don't stop the main stream, just remove it from QR video
        this.qrVideo.srcObject = null;
        this.qrScannerModal.classList.add('hidden');
        this.qrStatus.textContent = 'Position QR code in view';
    }

    cancelQRScanner() {
        this.stopQRScanner();
        this.showJoinModal();
    }

    showScreen(screen) {
        [this.homeScreen, this.controllerScreen, this.receiverScreen].forEach(s => s.classList.add('hidden'));
        screen.classList.remove('hidden');
    }

    updateDebugMessage(message) {
        console.log('Debug:', message);
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
        } else {
            this.updateDebugMessage('Waiting for connection...');
        }
    }

    generateQRCode() {
        this.updateDebugMessage('Creating connection code...');
        
        const existingQR = this.controllerScreen.querySelector('.qr-code-container');
        if (existingQR) {
            existingQR.remove();
        }
        
        const qrContainer = document.createElement('div');
        qrContainer.className = 'qr-code-container';
        
        try {
            const qr = qrcode(0, 'M');
            qr.addData(this.myPeerId);
            qr.make();
            
            const qrHTML = qr.createImgTag(4, 8);
            
            qrContainer.innerHTML = `
                <div class="qr-instructions">
                    <strong>Connection Options:</strong><br>
                    1. Other devices can scan this QR code, OR<br>
                    2. Share this ID manually: <br>
                    <input type="text" value="${this.myPeerId}" readonly 
                           style="width: 100%; padding: 8px; margin: 8px 0; font-family: monospace; 
                                  background: #f0f0f0; border: 1px solid #ccc; border-radius: 4px;"
                           onclick="this.select()">
                    <small>Tap ID above to copy</small>
                </div>
                ${qrHTML}
            `;
            
            this.controllerScreen.insertBefore(qrContainer, this.triggerCamerasBtn);
            this.updateDebugMessage('QR Code ready - waiting for connections');
            
        } catch (error) {
            qrContainer.innerHTML = `
                <div class="qr-instructions">
                    <strong>QR Code failed - use manual connection</strong><br>
                    Share this ID: <br>
                    <input type="text" value="${this.myPeerId}" readonly 
                           style="width: 100%; padding: 10px; margin: 10px 0; font-family: monospace; 
                                  background: #f0f0f0; border: 1px solid #ccc; border-radius: 4px; font-size: 16px;"
                           onclick="this.select()">
                    <small>Tap to select and copy</small>
                </div>
            `;
            this.controllerScreen.insertBefore(qrContainer, this.triggerCamerasBtn);
            this.updateDebugMessage('Ready - share the ID above');
        }
    }

    connectToController(controllerId) {
        this.hasJoinedSession = true;
        this.showScreen(this.receiverScreen);
        
        // Set the main camera stream to receiver preview immediately
        if (this.stream) {
            this.receiverPreview.srcObject = this.stream;
            this.updateCameraStatus('Camera ready for photos');
            this.updateDebugMessage('Camera restored to receiver preview');
        }
        
        this.updateDebugMessage(`Connecting to: ${controllerId.substring(0, 8)}...`);
        
        if (this.peer && this.peer.open) {
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
        } else {
            setTimeout(() => {
                this.isConnected = true;
                this.updateDebugMessage('Connected (demo mode)!');
            }, 1000);
        }
    }

    triggerCameras() {
        this.updateDebugMessage('Triggering all cameras!');
        
        this.connections.forEach((conn) => {
            if (conn.open) {
                conn.send({ type: 'TAKE_PHOTO', timestamp: Date.now() });
            }
        });
        
        this.capturePhoto();
        this.updateDebugMessage(`Photos triggered on ${this.connections.size + 1} devices!`);
    }

    async capturePhoto() {
        if (!this.stream) {
            this.updateCameraStatus('No camera available');
            return;
        }

        const canvas = this.captureCanvas;
        const video = this.isController ? this.controllerPreview : this.receiverPreview;
        
        if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
            this.updateCameraStatus('Video not ready - restoring...');
            
            // Try to restore the video stream
            if (this.stream) {
                video.srcObject = this.stream;
                setTimeout(() => this.capturePhoto(), 1000);
            }
            return;
        }
        
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);
        
        // Create download link that automatically triggers
        canvas.toBlob((blob) => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `camera_sync_${Date.now()}.jpg`;
            a.style.display = 'none';
            
            // Add to DOM and trigger click
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            // Clean up
            URL.revokeObjectURL(url);
            this.updateCameraStatus('Photo saved automatically!');
        }, 'image/jpeg', 0.95);
    }

    stopHosting() {
        this.isController = false;
        
        this.connections.forEach((conn) => {
            conn.close();
        });
        this.connections.clear();
        
        this.updateConnectedCount(0);
        this.updateDebugMessage('Ready to connect');
        this.showScreen(this.homeScreen);
        
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
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new CameraSyncApp();
});