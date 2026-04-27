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
        this.capturedPhotos = [];
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.isRecording = false;
        this.recordingStartTime = null;
        this.recordingTimer = null;
        
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    init() {
        console.log('Initializing app...');
        this.initializeElements();
        this.attachEventListeners();
        this.requestCameraPermission();
        setTimeout(() => this.initializePeerJS(), 2000);
    }

    initializeElements() {
        console.log('Getting DOM elements...');
        const elements = {
            homeScreen: 'home-screen',
            controllerScreen: 'controller-screen', 
            receiverScreen: 'receiver-screen',
            joinModal: 'join-modal',
            qrScannerModal: 'qr-scanner-modal',
            idInputModal: 'id-input-modal',
            connectedCount: 'connected-count',
            debugMessage: 'debug-message',
            cameraStatus: 'camera-status',
            controllerPreview: 'controller-preview',
            receiverPreview: 'receiver-preview',
            captureCanvas: 'capture-canvas',
            qrVideo: 'qr-video',
            qrCanvas: 'qr-canvas',
            beControllerBtn: 'be-controller-btn',
            joinSessionBtn: 'join-session-btn',
            triggerCamerasBtn: 'trigger-cameras-btn',
            stopHostingBtn: 'stop-hosting-btn',
            reconnectBtn: 'reconnect-btn',
            backHomeBtn: 'back-home-btn',
            scanQRBtn: 'scan-qr-btn',
            manualIdBtn: 'manual-id-btn',
            cancelJoinBtn: 'cancel-join-btn',
            cancelScanBtn: 'cancel-scan-btn',
            controllerIdInput: 'controller-id-input',
            connectManualBtn: 'connect-manual-btn',
            cancelManualBtn: 'cancel-manual-btn',
            qrStatus: 'qr-status'
        };

        for (const [key, id] of Object.entries(elements)) {
            this[key] = document.getElementById(id);
            if (!this[key]) console.error(`Element not found: ${id}`);
        }
    }

    attachEventListeners() {
        if (this.beControllerBtn) this.beControllerBtn.addEventListener('click', () => this.becomeController());
        if (this.joinSessionBtn) this.joinSessionBtn.addEventListener('click', () => this.showJoinModal());
        if (this.triggerCamerasBtn) this.triggerCamerasBtn.addEventListener('click', () => this.triggerCameras());
        if (this.stopHostingBtn) this.stopHostingBtn.addEventListener('click', () => this.stopHosting());
        if (this.reconnectBtn) this.reconnectBtn.addEventListener('click', () => this.showJoinModal());
        if (this.backHomeBtn) this.backHomeBtn.addEventListener('click', () => this.backToHome());
        if (this.scanQRBtn) this.scanQRBtn.addEventListener('click', () => this.startQRScanner());
        if (this.manualIdBtn) this.manualIdBtn.addEventListener('click', () => this.showManualInput());
        if (this.cancelJoinBtn) this.cancelJoinBtn.addEventListener('click', () => this.hideJoinModal());
        if (this.cancelScanBtn) this.cancelScanBtn.addEventListener('click', () => this.cancelQRScanner());
        if (this.connectManualBtn) this.connectManualBtn.addEventListener('click', () => this.connectManually());
        if (this.cancelManualBtn) this.cancelManualBtn.addEventListener('click', () => this.hideManualInput());
    }

    async requestCameraPermission() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 }}, 
                audio: false 
            });
            this.updateCameraStatus('Camera ready');
        } catch (error) {
            this.updateCameraStatus(`Camera error: ${error.message}`);
        }
    }

    initializePeerJS() {
        this.updateDebugMessage('Initializing connection...');
        try {
            if (typeof Peer === 'undefined') {
                this.fallbackToManualConnection();
                return;
            }
            this.peer = new Peer();
            this.peer.on('open', (id) => {
                this.myPeerId = id;
                this.updateDebugMessage(`Connected! ID: ${id.substring(0, 8)}...`);
                if (this.isController) this.generateQRCode();
            });
            this.peer.on('connection', (conn) => this.handleIncomingConnection(conn));
            this.peer.on('error', (err) => {
                this.updateDebugMessage(`Connection error: ${err.type}`);
                this.fallbackToManualConnection();
            });
        } catch (error) {
            this.fallbackToManualConnection();
        }
    }

    fallbackToManualConnection() {
        this.myPeerId = 'fallback-' + Math.random().toString(36).substr(2, 9);
        this.updateDebugMessage('Using offline mode - manual connection only');
        if (this.isController) this.generateQRCode();
    }

    handleIncomingConnection(conn) {
        this.connections.set(conn.peer, conn);
        conn.on('open', () => {
            this.updateConnectedCount(this.connections.size);
            this.updateDebugMessage(`Device connected: ${conn.peer.substring(0, 8)}...`);
        });
        conn.on('data', (data) => this.handleReceivedData(data));
        conn.on('close', () => {
            this.connections.delete(conn.peer);
            this.updateConnectedCount(this.connections.size);
        });
    }

    showJoinModal() { if (this.joinModal) this.joinModal.classList.remove('hidden'); }
    hideJoinModal() { if (this.joinModal) this.joinModal.classList.add('hidden'); }
    showManualInput() { this.hideJoinModal(); if (this.idInputModal) this.idInputModal.classList.remove('hidden'); }
    hideManualInput() { if (this.idInputModal) this.idInputModal.classList.add('hidden'); }

    connectManually() {
        if (!this.controllerIdInput) return;
        const controllerId = this.controllerIdInput.value.trim();
        if (!controllerId) return alert('Please enter a Controller ID');
        this.hideManualInput();
        this.connectToController(controllerId);
    }

    startQRScanner() {
        this.hideJoinModal();
        if (!this.stream) {
            alert('Camera not available. Please check permissions.');
            this.showJoinModal();
            return;
        }
        if (this.qrVideo && this.qrScannerModal) {
            this.qrVideo.srcObject = this.stream;
            this.qrScannerModal.classList.remove('hidden');
            this.qrScanning = true;
        }
    }

    cancelQRScanner() { this.stopQRScanner(); this.showJoinModal(); }
    
    stopQRScanner() {
        this.qrScanning = false;
        if (this.qrVideo) this.qrVideo.srcObject = null;
        if (this.qrScannerModal) this.qrScannerModal.classList.add('hidden');
    }

    showScreen(screen) {
        [this.homeScreen, this.controllerScreen, this.receiverScreen].forEach(s => {
            if (s) s.classList.add('hidden');
        });
        if (screen) screen.classList.remove('hidden');
    }

    updateDebugMessage(message) {
        if (this.debugMessage) this.debugMessage.textContent = message;
    }

    updateCameraStatus(status) {
        if (this.cameraStatus) this.cameraStatus.textContent = `Camera Status: ${status}`;
    }

    updateConnectedCount(count) {
        this.connectedPeers = count;
        if (this.connectedCount) this.connectedCount.textContent = count;
        if (this.triggerCamerasBtn) this.triggerCamerasBtn.disabled = count === 0;
    }

    async becomeController() {
        this.isController = true;
        this.showScreen(this.controllerScreen);
        if (this.stream && this.controllerPreview) {
            this.controllerPreview.srcObject = this.stream;
        } else {
            await this.requestCameraPermission();
            if (this.stream && this.controllerPreview) this.controllerPreview.srcObject = this.stream;
        }
        this.createPhotoGallery('controller');
        this.startHosting();
    }

    startHosting() {
        this.updateDebugMessage('Starting controller...');
        if (this.myPeerId) this.generateQRCode();
        else this.updateDebugMessage('Waiting for connection...');
    }

    generateQRCode() {
        this.updateDebugMessage('Creating connection code...');
        const existingQR = this.controllerScreen?.querySelector('.qr-code-container');
        if (existingQR) existingQR.remove();
        
        const qrContainer = document.createElement('div');
        qrContainer.className = 'qr-code-container';
        const qrCanvas = generateQRCode(this.myPeerId, 200);
        
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
            </div>`;
        
        qrContainer.appendChild(qrCanvas);
        const insertBefore = this.controllerScreen?.querySelector('.photo-gallery') || this.controllerScreen?.querySelector('#trigger-cameras-btn');
        if (insertBefore && this.controllerScreen) {
            this.controllerScreen.insertBefore(qrContainer, insertBefore);
            this.updateDebugMessage('QR Code ready - waiting for connections');
        }
    }

    connectToController(controllerId) {
        this.hasJoinedSession = true;
        this.showScreen(this.receiverScreen);
        if (this.stream && this.receiverPreview) {
            this.receiverPreview.srcObject = this.stream;
            this.updateCameraStatus('Camera ready for photos');
        }
        this.createPhotoGallery('receiver');
        this.updateDebugMessage(`Connecting to: ${controllerId.substring(0, 8)}...`);
        
        if (this.peer && this.peer.open) {
            const conn = this.peer.connect(controllerId);
            conn.on('open', () => {
                this.isConnected = true;
                this.updateDebugMessage('Connected to controller!');
                if (this.reconnectBtn) this.reconnectBtn.classList.add('hidden');
            });
            conn.on('data', (data) => this.handleReceivedData(data));
            conn.on('close', () => {
                this.isConnected = false;
                this.updateDebugMessage('Disconnected from controller');
                if (this.reconnectBtn) this.reconnectBtn.classList.remove('hidden');
            });
            conn.on('error', (err) => {
                this.updateDebugMessage(`Connection failed: ${err.message}`);
                if (this.reconnectBtn) this.reconnectBtn.classList.remove('hidden');
            });
        } else {
            setTimeout(() => {
                this.isConnected = true;
                this.updateDebugMessage('Connected (demo mode)!');
            }, 1000);
        }
    }

    handleReceivedData(data) {
        if (data.type === 'TAKE_PHOTO') {
            this.capturePhoto();
            this.updateDebugMessage('Photo triggered by controller!');
        } else if (data.type === 'START_RECORDING') {
            this.startVideoRecording();
            this.updateDebugMessage('Video recording started by controller!');
        } else if (data.type === 'STOP_RECORDING') {
            this.stopVideoRecording();
            this.updateDebugMessage('Video recording stopped by controller!');
        }
    }

    createPhotoGallery(screenType) {
        const screen = screenType === 'controller' ? this.controllerScreen : this.receiverScreen;
        if (!screen) return;
        
        const existingGallery = screen.querySelector('.photo-gallery');
        if (existingGallery) existingGallery.remove();
        
        const galleryContainer = document.createElement('div');
        galleryContainer.className = 'photo-gallery';
        galleryContainer.innerHTML = `
            <div class="gallery-header">
                <h3>Media Captured: <span class="media-count">0</span></h3>
                <div class="recording-controls">
                    <button class="btn red start-recording-btn">Start Recording</button>
                    <button class="btn gray stop-recording-btn" disabled>Stop Recording</button>
                    <span class="recording-timer">00:00</span>
                </div>
                <div class="download-controls">
                    <button class="btn blue download-all-btn" disabled>Download All as ZIP</button>
                    <button class="btn red clear-all-btn" disabled>Clear All</button>
                </div>
            </div>
            <div class="gallery-grid"></div>`;
        
        screen.appendChild(galleryContainer);
        
        const downloadBtn = galleryContainer.querySelector('.download-all-btn');
        const clearBtn = galleryContainer.querySelector('.clear-all-btn');
        const startRecBtn = galleryContainer.querySelector('.start-recording-btn');
        const stopRecBtn = galleryContainer.querySelector('.stop-recording-btn');
        
        if (downloadBtn) downloadBtn.addEventListener('click', () => this.downloadAllMedia());
        if (clearBtn) clearBtn.addEventListener('click', () => this.clearAllMedia());
        if (startRecBtn) startRecBtn.addEventListener('click', () => this.startVideoRecording());
        if (stopRecBtn) stopRecBtn.addEventListener('click', () => this.stopVideoRecording());
    }

    triggerCameras() {
        this.updateDebugMessage('Triggering all cameras!');
        this.connections.forEach((conn) => {
            if (conn.open) conn.send({ type: 'TAKE_PHOTO', timestamp: Date.now() });
        });
        this.capturePhoto();
        this.updateDebugMessage(`Photos triggered on ${this.connections.size + 1} devices!`);
    }

    async capturePhoto() {
        if (!this.stream) return this.updateCameraStatus('No camera available');
        const canvas = this.captureCanvas;
        const video = this.isController ? this.controllerPreview : this.receiverPreview;
        
        if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
            this.updateCameraStatus('Video not ready - restoring...');
            if (this.stream && video) {
                video.srcObject = this.stream;
                setTimeout(() => this.capturePhoto(), 1000);
            }
            return;
        }
        
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);
        
        const dataURL = canvas.toDataURL('image/jpeg', 0.95);
        const timestamp = Date.now();
        
        this.capturedPhotos.push({
            dataURL: dataURL,
            timestamp: timestamp,
            filename: `camera_sync_photo_${timestamp}.jpg`,
            type: 'photo'
        });
        
        this.addPhotoToGallery(dataURL, timestamp);
        const photoCount = this.capturedPhotos.filter(item => item.type === 'photo').length;
        this.updateCameraStatus(`Photo ${photoCount} captured!`);
    }

    addPhotoToGallery(dataURL, timestamp) {
        const currentScreen = this.isController ? this.controllerScreen : this.receiverScreen;
        if (!currentScreen) return;
        
        const galleryGrid = currentScreen.querySelector('.gallery-grid');
        const mediaCount = currentScreen.querySelector('.media-count');
        const downloadAllBtn = currentScreen.querySelector('.download-all-btn');
        const clearAllBtn = currentScreen.querySelector('.clear-all-btn');
        
        if (galleryGrid) {
            const photoDiv = document.createElement('div');
            photoDiv.className = 'gallery-photo';
            photoDiv.innerHTML = `
                <img src="${dataURL}" alt="Photo">
                <div class="photo-info">Photo ${this.capturedPhotos.filter(item => item.type === 'photo').length}</div>`;
            galleryGrid.appendChild(photoDiv);
        }
        
        if (mediaCount) mediaCount.textContent = this.capturedPhotos.length;
        if (downloadAllBtn) downloadAllBtn.disabled = false;
        if (clearAllBtn) clearAllBtn.disabled = false;
    }

    async startVideoRecording() {
        if (!this.stream) return this.updateCameraStatus('No camera available for recording');
        try {
            this.mediaRecorder = new MediaRecorder(this.stream, { mimeType: 'video/webm' });
            this.recordedChunks = [];
            this.isRecording = true;
            this.recordingStartTime = Date.now();

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) this.recordedChunks.push(event.data);
            };
            this.mediaRecorder.onstop = () => this.processRecordedVideo();
            this.mediaRecorder.start(1000);
            this.updateRecordingUI(true);
            this.startRecordingTimer();

            if (this.isController) {
                this.connections.forEach((conn) => {
                    if (conn.open) conn.send({ type: 'START_RECORDING', timestamp: Date.now() });
                });
            }

            this.updateCameraStatus('Recording video...');
            this.updateDebugMessage('Video recording started');
        } catch (error) {
            this.updateCameraStatus(`Recording failed: ${error.message}`);
        }
    }

    stopVideoRecording() {
        if (!this.isRecording || !this.mediaRecorder) return;
        this.mediaRecorder.stop();
        this.isRecording = false;
        this.updateRecordingUI(false);
        this.stopRecordingTimer();

        if (this.isController) {
            this.connections.forEach((conn) => {
                if (conn.open) conn.send({ type: 'STOP_RECORDING', timestamp: Date.now() });
            });
        }

        this.updateCameraStatus('Processing video...');
        this.updateDebugMessage('Video recording stopped');
    }

    processRecordedVideo() {
        const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
        const timestamp = Date.now();
        const duration = Math.round((timestamp - this.recordingStartTime) / 1000);

        this.capturedPhotos.push({
            blob: blob,
            timestamp: timestamp,
            filename: `camera_sync_video_${timestamp}.webm`,
            type: 'video',
            duration: duration
        });

        this.addVideoToGallery(blob, timestamp, duration);
        this.updateCameraStatus(`Video recorded! Duration: ${duration}s`);
        this.recordedChunks = [];
    }

    addVideoToGallery(blob, timestamp, duration) {
        const currentScreen = this.isController ? this.controllerScreen : this.receiverScreen;
        if (!currentScreen) return;
        
        const galleryGrid = currentScreen.querySelector('.gallery-grid');
        const mediaCount = currentScreen.querySelector('.media-count');
        const downloadAllBtn = currentScreen.querySelector('.download-all-btn');
        const clearAllBtn = currentScreen.querySelector('.clear-all-btn');

        if (galleryGrid) {
            const videoURL = URL.createObjectURL(blob);
            const mediaDiv = document.createElement('div');
            mediaDiv.className = 'gallery-media video-media';
            mediaDiv.innerHTML = `
                <video src="${videoURL}" muted></video>
                <div class="media-overlay"><span class="play-icon">▶</span></div>
                <div class="media-info">Video ${duration}s</div>`;

            const video = mediaDiv.querySelector('video');
            const overlay = mediaDiv.querySelector('.media-overlay');
            
            mediaDiv.addEventListener('click', () => {
                if (video.paused) {
                    video.play();
                    overlay.style.opacity = '0';
                } else {
                    video.pause();
                    overlay.style.opacity = '1';
                }
            });

            video.addEventListener('ended', () => overlay.style.opacity = '1');
            galleryGrid.appendChild(mediaDiv);
        }

        if (mediaCount) mediaCount.textContent = this.capturedPhotos.length;
        if (downloadAllBtn) downloadAllBtn.disabled = false;
        if (clearAllBtn) clearAllBtn.disabled = false;
    }

    updateRecordingUI(isRecording) {
        const currentScreen = this.isController ? this.controllerScreen : this.receiverScreen;
        const startBtn = currentScreen?.querySelector('.start-recording-btn');
        const stopBtn = currentScreen?.querySelector('.stop-recording-btn');
        const timer = currentScreen?.querySelector('.recording-timer');

        if (startBtn) {
            startBtn.disabled = isRecording;
            startBtn.textContent = isRecording ? 'Recording...' : 'Start Recording';
        }
        if (stopBtn) stopBtn.disabled = !isRecording;
        if (timer) {
            timer.style.color = isRecording ? '#FF3B30' : '#666';
            timer.style.fontWeight = isRecording ? 'bold' : 'normal';
        }
    }

    startRecordingTimer() {
        this.recordingTimer = setInterval(() => {
            if (this.recordingStartTime) {
                const elapsed = Math.floor((Date.now() - this.recordingStartTime) / 1000);
                const minutes = Math.floor(elapsed / 60);
                const seconds = elapsed % 60;
                const currentScreen = this.isController ? this.controllerScreen : this.receiverScreen;
                const timer = currentScreen?.querySelector('.recording-timer');
                if (timer) timer.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }
        }, 1000);
    }

    stopRecordingTimer() {
        if (this.recordingTimer) {
            clearInterval(this.recordingTimer);
            this.recordingTimer = null;
        }
    }

    async downloadAllMedia() {
        if (this.capturedPhotos.length === 0) return alert('No media to download');
        if (this.isRecording) {
            this.stopVideoRecording();
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        const progressDiv = this.createProgressIndicator();
        try {
            const zip = new JSZip();
            for (let i = 0; i < this.capturedPhotos.length; i++) {
                const media = this.capturedPhotos[i];
                const progress = Math.round(((i + 1) / this.capturedPhotos.length) * 50);
                const mediaType = media.type === 'video' ? 'video' : 'photo';
                this.updateProgress(progressDiv, progress, `Adding ${mediaType} ${i + 1}/${this.capturedPhotos.length}...`);
                
                let blob = media.type === 'video' ? media.blob : await fetch(media.dataURL).then(r => r.blob());
                zip.file(media.filename, blob);
            }
            
            this.updateProgress(progressDiv, 75, 'Generating ZIP file...');
            const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 }});
            this.updateProgress(progressDiv, 90, 'Preparing download...');
            
            const url = URL.createObjectURL(zipBlob);
            const link = document.createElement('a');
            const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
            const deviceType = this.isController ? 'controller' : 'receiver';
            const photoCount = this.capturedPhotos.filter(item => item.type === 'photo').length;
            const videoCount = this.capturedPhotos.filter(item => item.type === 'video').length;
            
            link.href = url;
            link.download = `camera_sync_${deviceType}_${photoCount}photos_${videoCount}videos_${timestamp}.zip`;
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            
            this.updateProgress(progressDiv, 100, 'Download complete!');
            setTimeout(() => {
                this.removeProgressIndicator(progressDiv);
                this.updateDebugMessage(`ZIP file with ${photoCount} photos and ${videoCount} videos downloaded!`);
                this.updateCameraStatus('All media downloaded as ZIP file!');
            }, 1500);
        } catch (error) {
            this.removeProgressIndicator(progressDiv);
            this.updateDebugMessage('ZIP creation failed');
            this.updateCameraStatus('Download failed - please try again');
        }
    }

    clearAllMedia() {
        const photoCount = this.capturedPhotos.filter(item => item.type === 'photo').length;
        const videoCount = this.capturedPhotos.filter(item => item.type === 'video').length;
        
        if (confirm(`Clear all ${photoCount} photos and ${videoCount} videos? This cannot be undone.`)) {
            if (this.isRecording) this.stopVideoRecording();
            this.capturedPhotos.forEach(media => {
                if (media.type === 'video' && media.blob) URL.revokeObjectURL(URL.createObjectURL(media.blob));
            });
            this.capturedPhotos = [];
            
            const currentScreen = this.isController ? this.controllerScreen : this.receiverScreen;
            const galleryGrid = currentScreen?.querySelector('.gallery-grid');
            const mediaCount = currentScreen?.querySelector('.media-count');
            const downloadAllBtn = currentScreen?.querySelector('.download-all-btn');
            const clearAllBtn = currentScreen?.querySelector('.clear-all-btn');
            
            if (galleryGrid) galleryGrid.innerHTML = '';
            if (mediaCount) mediaCount.textContent = '0';
            if (downloadAllBtn) downloadAllBtn.disabled = true;
            if (clearAllBtn) clearAllBtn.disabled = true;
            
            this.updateDebugMessage('All media cleared');
            this.updateCameraStatus('Ready for new photos and videos');
        }
    }

    createProgressIndicator() {
        const progressDiv = document.createElement('div');
        progressDiv.className = 'download-progress';
        progressDiv.innerHTML = `
            <div class="progress-content">
                <h4>Creating ZIP File</h4>
                <div class="progress-bar"><div class="progress-fill" style="width: 0%"></div></div>
                <p class="progress-text">Starting...</p>
            </div>`;
        document.body.appendChild(progressDiv);
        return progressDiv;
    }

    updateProgress(progressDiv, percentage, text) {
        progressDiv.querySelector('.progress-fill').style.width = `${percentage}%`;
        progressDiv.querySelector('.progress-text').textContent = text;
    }

    removeProgressIndicator(progressDiv) {
        if (progressDiv && progressDiv.parentNode) document.body.removeChild(progressDiv);
    }

    stopHosting() {
        this.isController = false;
        this.connections.forEach((conn) => conn.close());
        this.connections.clear();
        this.updateConnectedCount(0);
        this.updateDebugMessage('Ready to connect');
        this.showScreen(this.homeScreen);
        this.capturedPhotos = [];
        const qrContainer = this.controllerScreen?.querySelector('.qr-code-container');
        if (qrContainer) qrContainer.remove();
    }

    backToHome() {
        this.hasJoinedSession = false;
        this.isConnected = false;
        this.updateDebugMessage('Ready to connect');
        this.showScreen(this.homeScreen);
        this.capturedPhotos = [];
    }
}

// Initialize the app
new CameraSyncApp();