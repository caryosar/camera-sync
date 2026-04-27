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
        
        this.initializeElements();
        this.attachEventListeners();
        this.requestCameraPermission();
        setTimeout(() => this.initializePeerJS(), 1000);
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
        this.scanQRBtn = document.getElementById('scan-qr-btn');
        this.manualIdBtn = document.getElementById('manual-id-btn');
        this.cancelJoinBtn = document.getElementById('cancel-join-btn');
        this.cancelScanBtn = document.getElementById('cancel-scan-btn');
        this.controllerIdInput = document.getElementById('controller-id-input');
        this.connectManualBtn = document.getElementById('connect-manual-btn');
        this.cancelManualBtn = document.getElementById('cancel-manual-btn');
        this.qrStatus = document.getElementById('qr-status');
    }

    attachEventListeners() {
        this.beControllerBtn.addEventListener('click', () => this.becomeController());
        this.joinSessionBtn.addEventListener('click', () => this.showJoinModal());
        this.triggerCamerasBtn.addEventListener('click', () => this.triggerCameras());
        this.stopHostingBtn.addEventListener('click', () => this.stopHosting());
        this.reconnectBtn.addEventListener('click', () => this.showJoinModal());
        this.backHomeBtn.addEventListener('click', () => this.backToHome());
        this.scanQRBtn.addEventListener('click', () => this.startQRScanner());
        this.manualIdBtn.addEventListener('click', () => this.showManualInput());
        this.cancelJoinBtn.addEventListener('click', () => this.hideJoinModal());
        this.cancelScanBtn.addEventListener('click', () => this.cancelQRScanner());
        this.connectManualBtn.addEventListener('click', () => this.connectManually());
        this.cancelManualBtn.addEventListener('click', () => this.hideManualInput());
    }

    showJoinModal() { 
        console.log('Showing join modal');
        this.joinModal.classList.remove('hidden'); 
    }
    
    hideJoinModal() { 
        console.log('Hiding join modal');
        this.joinModal.classList.add('hidden'); 
    }
    
    showManualInput() { 
        console.log('Showing manual input');
        this.hideJoinModal(); 
        this.idInputModal.classList.remove('hidden'); 
    }
    
    hideManualInput() { 
        console.log('Hiding manual input');
        this.idInputModal.classList.add('hidden'); 
    }

    connectManually() {
        console.log('Connect manually clicked');
        const controllerId = this.controllerIdInput.value.trim();
        if (!controllerId) return alert('Please enter a Controller ID');
        this.hideManualInput();
        this.connectToController(controllerId);
    }

    initializePeerJS() {
        this.updateDebugMessage('Initializing connection...');
        try {
            this.peer = new Peer({ debug: 1 });
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
            this.updateDebugMessage(`Error: ${error.message}`);
            this.fallbackToManualConnection();
        }
    }

    fallbackToManualConnection() {
        this.myPeerId = 'local-' + Math.random().toString(36).substr(2, 9);
        if (this.isController) this.generateQRCode();
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
            } else if (data.type === 'START_RECORDING') {
                this.startVideoRecording();
                this.updateDebugMessage('Video recording started by controller!');
            } else if (data.type === 'STOP_RECORDING') {
                this.stopVideoRecording();
                this.updateDebugMessage('Video recording stopped by controller!');
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
            console.log('Camera stream obtained:', this.stream);
        } catch (error) {
            console.error('Camera error:', error);
            this.updateCameraStatus(`Camera error: ${error.message}`);
        }
    }

    startQRScanner() {
        console.log('Starting QR scanner');
        this.hideJoinModal();
        if (!this.stream) {
            console.error('No camera stream available');
            return this.updateDebugMessage('Camera not available for QR scanning');
        }
        this.qrVideo.srcObject = this.stream;
        this.qrScannerModal.classList.remove('hidden');
        this.qrScanning = true;
        this.updateDebugMessage('QR Scanner active - point at QR code');
        this.qrVideo.addEventListener('loadedmetadata', () => this.scanQRCode(), { once: true });
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
                if (code) return this.handleQRCodeDetected(code.data);
            }
        }
        requestAnimationFrame(() => this.scanQRCode());
    }

    handleQRCodeDetected(data) {
        try {
            const qrData = JSON.parse(data);
            if (qrData.type === 'camera_sync_controller' && qrData.peerId) {
                return this.stopQRScannerAndConnect(qrData.peerId);
            }
        } catch (error) {
            if (data && data.length > 5) return this.stopQRScannerAndConnect(data);
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
        this.qrVideo.srcObject = null;
        this.qrScannerModal.classList.add('hidden');
        this.qrStatus.textContent = 'Position QR code in view';
    }

    cancelQRScanner() { 
        console.log('Canceling QR scanner');
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
        console.log('Camera status:', status);
        this.cameraStatus.textContent = `Camera Status: ${status}`; 
    }

    updateConnectedCount(count) {
        this.connectedPeers = count;
        this.connectedCount.textContent = count;
        this.triggerCamerasBtn.disabled = count === 0;
    }

    async becomeController() {
        console.log('Becoming controller, stream available:', !!this.stream);
        this.isController = true;
        this.showScreen(this.controllerScreen);
        
        if (this.stream) {
            console.log('Setting controller preview stream');
            this.controllerPreview.srcObject = this.stream;
        } else {
            console.error('No stream available for controller preview');
            // Try to get camera again
            await this.requestCameraPermission();
            if (this.stream) {
                this.controllerPreview.srcObject = this.stream;
            }
        }
        
        this.createPhotoGallery('controller');
        this.startHosting();
    }

    startHosting() {
        this.updateDebugMessage('Starting controller...');
        if (this.myPeerId) this.generateQRCode();
        else this.updateDebugMessage('Waiting for connection...');
    }

    createPhotoGallery(screenType) {
        const screen = screenType === 'controller' ? this.controllerScreen : this.receiverScreen;
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
        
        galleryContainer.querySelector('.download-all-btn').addEventListener('click', () => this.downloadAllMedia());
        galleryContainer.querySelector('.clear-all-btn').addEventListener('click', () => this.clearAllMedia());
        galleryContainer.querySelector('.start-recording-btn').addEventListener('click', () => this.startVideoRecording());
        galleryContainer.querySelector('.stop-recording-btn').addEventListener('click', () => this.stopVideoRecording());
    }

    generateQRCode() {
        this.updateDebugMessage('Creating connection code...');
        const existingQR = this.controllerScreen.querySelector('.qr-code-container');
        if (existingQR) existingQR.remove();
        
        const qrContainer = document.createElement('div');
        qrContainer.className = 'qr-code-container';
        
        try {
            const qr = qrcode(0, 'M');
            qr.addData(this.myPeerId);
            qr.make();
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
                </div>${qr.createImgTag(4, 8)}`;
            
            const photoGallery = this.controllerScreen.querySelector('.photo-gallery');
            this.controllerScreen.insertBefore(qrContainer, photoGallery);
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
                </div>`;
            const photoGallery = this.controllerScreen.querySelector('.photo-gallery');
            this.controllerScreen.insertBefore(qrContainer, photoGallery);
            this.updateDebugMessage('Ready - share the ID above');
        }
    }

    connectToController(controllerId) {
        console.log('Connecting to controller:', controllerId);
        this.hasJoinedSession = true;
        this.showScreen(this.receiverScreen);
        
        if (this.stream) {
            console.log('Setting receiver preview stream');
            this.receiverPreview.srcObject = this.stream;
            this.updateCameraStatus('Camera ready for photos');
        } else {
            console.error('No stream available for receiver preview');
        }
        
        this.createPhotoGallery('receiver');
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
                } else if (data.type === 'START_RECORDING') {
                    this.startVideoRecording();
                    this.updateDebugMessage('Video recording started by controller!');
                } else if (data.type === 'STOP_RECORDING') {
                    this.stopVideoRecording();
                    this.updateDebugMessage('Video recording stopped by controller!');
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
        const galleryGrid = currentScreen.querySelector('.gallery-grid');
        const mediaCount = currentScreen.querySelector('.media-count');
        const downloadAllBtn = currentScreen.querySelector('.download-all-btn');
        const clearAllBtn = currentScreen.querySelector('.clear-all-btn');
        
        const photoDiv = document.createElement('div');
        photoDiv.className = 'gallery-photo';
        photoDiv.innerHTML = `
            <img src="${dataURL}" alt="Photo ${this.capturedPhotos.length}">
            <div class="photo-info">Photo ${this.capturedPhotos.filter(item => item.type === 'photo').length}</div>`;
        
        galleryGrid.appendChild(photoDiv);
        mediaCount.textContent = this.capturedPhotos.length;
        downloadAllBtn.disabled = false;
        clearAllBtn.disabled = false;
    }

    async startVideoRecording() {
        if (!this.stream) return this.updateCameraStatus('No camera available for recording');
        try {
            this.mediaRecorder = new MediaRecorder(this.stream, { mimeType: 'video/webm;codecs=vp9' });
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
            console.error('Recording start failed:', error);
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
        const galleryGrid = currentScreen.querySelector('.gallery-grid');
        const mediaCount = currentScreen.querySelector('.media-count');
        const downloadAllBtn = currentScreen.querySelector('.download-all-btn');
        const clearAllBtn = currentScreen.querySelector('.clear-all-btn');

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
        mediaCount.textContent = this.capturedPhotos.length;
        downloadAllBtn.disabled = false;
        clearAllBtn.disabled = false;
    }

    updateRecordingUI(isRecording) {
        const currentScreen = this.isController ? this.controllerScreen : this.receiverScreen;
        const startBtn = currentScreen.querySelector('.start-recording-btn');
        const stopBtn = currentScreen.querySelector('.stop-recording-btn');
        const timer = currentScreen.querySelector('.recording-timer');

        if (isRecording) {
            startBtn.disabled = true;
            startBtn.textContent = 'Recording...';
            stopBtn.disabled = false;
            timer.style.color = '#FF3B30';
            timer.style.fontWeight = 'bold';
        } else {
            startBtn.disabled = false;
            startBtn.textContent = 'Start Recording';
            stopBtn.disabled = true;
            timer.style.color = '#666';
            timer.style.fontWeight = 'normal';
        }
    }

    startRecordingTimer() {
        this.recordingTimer = setInterval(() => {
            if (this.recordingStartTime) {
                const elapsed = Math.floor((Date.now() - this.recordingStartTime) / 1000);
                const minutes = Math.floor(elapsed / 60);
                const seconds = elapsed % 60;
                const currentScreen = this.isController ? this.controllerScreen : this.receiverScreen;
                const timer = currentScreen.querySelector('.recording-timer');
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
            console.error('ZIP creation failed:', error);
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
            const galleryGrid = currentScreen.querySelector('.gallery-grid');
            const mediaCount = currentScreen.querySelector('.media-count');
            const downloadAllBtn = currentScreen.querySelector('.download-all-btn');
            const clearAllBtn = currentScreen.querySelector('.clear-all-btn');
            
            galleryGrid.innerHTML = '';
            mediaCount.textContent = '0';
            downloadAllBtn.disabled = true;
            clearAllBtn.disabled = true;
            
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
        progressDiv.querySelector('.progress-fill').style.width = `