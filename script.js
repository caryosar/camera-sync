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
        
        // Video recording properties
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.isRecording = false;
        this.recordingStartTime = null;
        this.recordingTimer = null;
        this.recordedVideos = [];
        
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
        
        // Recording buttons
        this.startRecordingBtn = document.getElementById('start-recording-btn');
        this.stopRecordingBtn = document.getElementById('stop-recording-btn');
        
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
        
        // Recording controls
        this.startRecordingBtn.addEventListener('click', () => this.startRecording());
        this.stopRecordingBtn.addEventListener('click', () => this.stopRecording());
        
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

    // ... (keep all existing methods and add these new video recording methods)

    startRecording() {
        if (!this.stream) {
            this.updateCameraStatus('No camera stream available for recording');
            return;
        }

        try {
            // Create MediaRecorder with the camera stream
            this.mediaRecorder = new MediaRecorder(this.stream, {
                mimeType: 'video/webm;codecs=vp9'
            });

            this.recordedChunks = [];
            this.recordingStartTime = Date.now();

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.recordedChunks.push(event.data);
                }
            };

            this.mediaRecorder.onstop = () => {
                this.saveRecording();
            };

            // Send recording command to all connected devices
            this.connections.forEach((conn) => {
                if (conn.open) {
                    conn.send({ type: 'START_RECORDING', timestamp: Date.now() });
                }
            });

            // Start recording
            this.mediaRecorder.start(1000); // Collect data every second
            this.isRecording = true;

            // Update UI
            this.startRecordingBtn.classList.add('hidden');
            this.stopRecordingBtn.classList.remove('hidden');
            this.updateCameraStatus('Recording started...');
            this.updateDebugMessage('Recording in progress...');

            // Start recording timer
            this.startRecordingTimer();

        } catch (error) {
            this.updateCameraStatus(`Recording failed: ${error.message}`);
        }
    }

    stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            // Send stop command to all connected devices
            this.connections.forEach((conn) => {
                if (conn.open) {
                    conn.send({ type: 'STOP_RECORDING', timestamp: Date.now() });
                }
            });

            this.mediaRecorder.stop();
            this.isRecording = false;

            // Update UI
            this.startRecordingBtn.classList.remove('hidden');
            this.stopRecordingBtn.classList.add('hidden');
            this.stopRecordingTimer();
            
            this.updateCameraStatus('Recording stopped');
            this.updateDebugMessage('Processing recording...');
        }
    }

    startRecordingTimer() {
        const startTime = this.recordingStartTime;
        
        this.recordingTimer = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const seconds = Math.floor(elapsed / 1000);
            const minutes = Math.floor(seconds / 60);
            const displaySeconds = seconds % 60;
            
            const timeString = `${minutes.toString().padStart(2, '0')}:${displaySeconds.toString().padStart(2, '0')}`;
            
            // Update recording status on receiver screens
            const recordingStatus = document.querySelector('.recording-status');
            if (recordingStatus && !recordingStatus.classList.contains('hidden')) {
                const timeElement = recordingStatus.querySelector('.recording-time');
                if (timeElement) {
                    timeElement.textContent = timeString;
                }
            }
            
            this.updateCameraStatus(`Recording: ${timeString}`);
        }, 1000);
    }

    stopRecordingTimer() {
        if (this.recordingTimer) {
            clearInterval(this.recordingTimer);
            this.recordingTimer = null;
        }
        
        // Hide recording status on receiver
        const recordingStatus = document.querySelector('.recording-status');
        if (recordingStatus) {
            recordingStatus.classList.add('hidden');
        }
    }

    saveRecording() {
        if (this.recordedChunks.length === 0) {
            this.updateCameraStatus('No recording data to save');
            return;
        }

        const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
        const duration = Math.round((Date.now() - this.recordingStartTime) / 1000);
        const timestamp = Date.now();
        
        // Create object URL for the video
        const videoURL = URL.createObjectURL(blob);
        
        const videoData = {
            blob: blob,
            url: videoURL,
            timestamp: timestamp,
            duration: duration,
            filename: `camera_sync_video_${timestamp}.webm`
        };
        
        this.recordedVideos.push(videoData);
        this.addVideoToGallery(videoData);
        
        this.updateCameraStatus(`Video recorded (${duration}s)!`);
        this.updateDebugMessage(`Video ${this.recordedVideos.length} saved to gallery`);
    }

    createVideoGallery(screenType) {
        const screen = screenType === 'controller' ? this.controllerScreen : this.receiverScreen;
        
        // Remove existing video gallery if any
        const existingVideoGallery = screen.querySelector('.video-gallery');
        if (existingVideoGallery) {
            existingVideoGallery.remove();
        }
        
        const videoGalleryContainer = document.createElement('div');
        videoGalleryContainer.className = 'video-gallery';
        videoGalleryContainer.innerHTML = `
            <div class="video-gallery-header">
                <h3>Videos Recorded: <span class="video-count">0</span></h3>
                <button class="btn blue download-all-videos-btn" disabled>Download All Videos</button>
                <button class="btn red clear-all-videos-btn" disabled>Clear All Videos</button>
            </div>
            <div class="video-grid"></div>
        `;
        
        screen.appendChild(videoGalleryContainer);
        
        // Add event listeners for video gallery buttons
        const downloadAllVideosBtn = videoGalleryContainer.querySelector('.download-all-videos-btn');
        const clearAllVideosBtn = videoGalleryContainer.querySelector('.clear-all-videos-btn');
        
        downloadAllVideosBtn.addEventListener('click', () => this.downloadAllVideos());
        clearAllVideosBtn.addEventListener('click', () => this.clearAllVideos());
    }

    addVideoToGallery(videoData) {
        const currentScreen = this.isController ? this.controllerScreen : this.receiverScreen;
        const videoGrid = currentScreen.querySelector('.video-grid');
        const videoCount = currentScreen.querySelector('.video-count');
        const downloadAllVideosBtn = currentScreen.querySelector('.download-all-videos-btn');
        const clearAllVideosBtn = currentScreen.querySelector('.clear-all-videos-btn');
        
        // Create video thumbnail
        const videoDiv = document.createElement('div');
        videoDiv.className = 'gallery-video';
        videoDiv.innerHTML = `
            <video src="${videoData.url}" controls muted></video>
            <div class="video-info">
                Video ${this.recordedVideos.length}<br>
                Duration: <span class="video-duration">${videoData.duration}s</span>
            </div>
        `;
        
        videoGrid.appendChild(videoDiv);
        
        // Update counter and enable buttons
        videoCount.textContent = this.recordedVideos.length;
        downloadAllVideosBtn.disabled = false;
        clearAllVideosBtn.disabled = false;
    }

    async downloadAllVideos() {
        if (this.recordedVideos.length === 0) {
            alert('No videos to download');
            return;
        }

        this.updateDebugMessage('Creating video ZIP file...');
        const progressDiv = this.createProgressIndicator();

        try {
            const zip = new JSZip();

            // Add each video to the ZIP
            for (let i = 0; i < this.recordedVideos.length; i++) {
                const video = this.recordedVideos[i];
                
                const progress = Math.round(((i + 1) / this.recordedVideos.length) * 70);
                this.updateProgress(progressDiv, progress, `Adding video ${i + 1}/${this.recordedVideos.length}...`);
                
                zip.file(video.filename, video.blob);
            }

            // Generate ZIP
            this.updateProgress(progressDiv, 85, 'Generating video ZIP...');
            const zipBlob = await zip.generateAsync({ 
                type: 'blob',
                compression: 'DEFLATE',
                compressionOptions: { level: 1 } // Light compression for videos
            });

            // Download
            this.updateProgress(progressDiv, 95, 'Preparing download...');
            const url = URL.createObjectURL(zipBlob);
            const link = document.createElement('a');
            
            const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
            const deviceType = this.isController ? 'controller' : 'receiver';
            link.href = url;
            link.download = `camera_sync_videos_${deviceType}_${timestamp}.zip`;
            link.style.display = 'none';
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            this.updateProgress(progressDiv, 100, 'Video download complete!');
            
            setTimeout(() => {
                this.removeProgressIndicator(progressDiv);
                this.updateDebugMessage(`ZIP with ${this.recordedVideos.length} videos downloaded!`);
            }, 1500);

        } catch (error) {
            console.error('Video ZIP creation failed:', error);
            this.removeProgressIndicator(progressDiv);
            this.updateDebugMessage('Video ZIP failed - downloading individually...');
            this.fallbackVideoDownload();
        }
    }

    fallbackVideoDownload() {
        this.recordedVideos.forEach((video, index) => {
            setTimeout(() => {
                const link = document.createElement('a');
                link.href = video.url;
                link.download = video.filename;
                link.style.display = 'none';
                
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }, index * 500);
        });
    }

    clearAllVideos() {
        if (confirm(`Clear all ${this.recordedVideos.length} videos? This cannot be undone.`)) {
            // Clean up object URLs
            this.recordedVideos.forEach(video => {
                URL.revokeObjectURL(video.url);
            });
            
            this.recordedVideos = [];
            
            const currentScreen = this.isController ? this.controllerScreen : this.receiverScreen;
            const videoGrid = currentScreen.querySelector('.video-grid');
            const videoCount = currentScreen.querySelector('.video-count');
            const downloadAllVideosBtn = currentScreen.querySelector('.download-all-videos-btn');
            const clearAllVideosBtn = currentScreen.querySelector('.clear-all-videos-btn');
            
            videoGrid.innerHTML = '';
            videoCount.textContent = '0';
            downloadAllVideosBtn.disabled = true;
            clearAllVideosBtn.disabled = true;
            
            this.updateDebugMessage('All videos cleared');
        }
    }

    // Update the handleIncomingConnection method to handle recording commands
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
                this.startRecordingReceiver();
            } else if (data.type === 'STOP_RECORDING') {
                this.stopRecordingReceiver();
            }
        });

        conn.on('close', () => {
            this.connections.delete(conn.peer);
            this.updateConnectedCount(this.connections.size);
        });
    }

    startRecordingReceiver() {
        if (!this.stream) {
            this.updateCameraStatus('No camera stream for recording');
            return;
        }

        try {
            this.mediaRecorder = new MediaRecorder(this.stream, {
                mimeType: 'video/webm;codecs=vp9'
            });

            this.recordedChunks = [];
            this.recordingStartTime = Date.now();

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.recordedChunks.push(event.data);
                }
            };

            this.mediaRecorder.onstop = () => {
                this.saveRecording();
            };

            this.mediaRecorder.start(1000);
            this.isRecording = true;

            // Show recording indicator
            const recordingStatus = this.receiverScreen.querySelector('.recording-status');
            if (recordingStatus) {
                recordingStatus.classList.remove('hidden');
            }

            this.startRecordingTimer();
            this.updateCameraStatus('Recording started by controller');
            this.updateDebugMessage('Recording in progress...');

        } catch (error) {
            this.updateCameraStatus(`Recording failed: ${error.message}`);
        }
    }

    stopRecordingReceiver() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;
            this.stopRecordingTimer();
            
            this.updateCameraStatus('Recording stopped by controller');
            this.updateDebugMessage('Processing recording...');
        }
    }

    // Update becomeController and connectToController to create video galleries
    async becomeController() {
        this.isController = true;
        this.showScreen(this.controllerScreen);
        
        if (this.stream) {
            this.controllerPreview.srcObject = this.stream;
        }
        
        this.createPhotoGallery('controller');
        this.createVideoGallery('controller');
        this.startHosting();
    }

    connectToController(controllerId) {
        this.hasJoinedSession = true;
        this.showScreen(this.receiverScreen);
        
        if (this.stream) {
            this.receiverPreview.srcObject = this.stream;
            this.updateCameraStatus('Camera ready for photos and videos');
        }
        
        this.createPhotoGallery('receiver');
        this.createVideoGallery('receiver');
        this.updateDebugMessage(`Connecting to: ${controllerId.substring(0, 8)}...`);
        
        // ... rest of the connection logic remains the same
    }

    // Update stopHosting and backToHome to clear videos
    stopHosting() {
        this.isController = false;
        
        // Stop any ongoing recording
        if (this.isRecording) {
            this.stopRecording();
        }
        
        this.connections.forEach((conn) => {
            conn.close();
        });
        this.connections.clear();
        
        this.updateConnectedCount(0);
        this.updateDebugMessage('Ready to connect');
        this.showScreen(this.homeScreen);
        
        // Clear photos and videos
        this.capturedPhotos = [];
        this.clearVideoMemory();
    }

    backToHome() {
        this.hasJoinedSession = false;
        this.isConnected = false;
        
        // Stop any ongoing recording
        if (this.isRecording) {
            this.stopRecordingReceiver();
        }
        
        this.updateDebugMessage('Ready to connect');
        this.showScreen(this.homeScreen);
        
        // Clear photos and videos
        this.capturedPhotos = [];
        this.clearVideoMemory();
    }

    clearVideoMemory() {
        // Clean up video object URLs to free memory
        this.recordedVideos.forEach(video => {
            URL.revokeObjectURL(video.url);
        });
        this.recordedVideos = [];
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new CameraSyncApp();
});