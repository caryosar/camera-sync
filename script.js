class CameraSyncApp {
    constructor() {
        this.isController = false;
        this.hasJoinedSession = false;
        this.connectedPeers = 0;
        this.isConnected = false;
        this.maxConnectedDevices = Infinity;
        this.heartbeatIntervalMs = 10000;
        this.connectionTimeoutMs = 30000;
        
        this.stream = null;
        this.peer = null;
        this.connections = new Map();
        this.connectionTimes = new Map(); // Track connection timestamps per connection key
        this.connectionLastSeen = new Map();
        this.myPeerId = null;
        this.qrScanning = false;
        this.capturedPhotos = []; // Store captured photos
        this.devicesTableRefreshInterval = null; // Interval for updating table
        this.connectionHeartbeatInterval = null;
        this.activeControllerConnection = null;
        this.qrStream = null;
        this.qrScanAnimationFrameId = null;
        this.qrUsesMainStream = false;
        this.isPeerReady = false;
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.currentRecordingStart = null;
        this.currentRecordingMimeType = '';
        this.currentRecordingSourceLabel = '';
        this.discardNextRecording = false;
        this.capturedVideos = []; // Store recorded video clips
        this.recordingSyncLeadTimeMs = 800;
        this.photoSyncLeadTimeMs = 800;
        this.pendingRecordingStartTimeoutId = null;
        this.pendingRecordingStopTimeoutId = null;
        const networkConfig = this.resolveNetworkConfig();
        this.peerServerHost = networkConfig.peerServerHost;
        this.peerServerPort = networkConfig.peerServerPort;
        this.peerServerPath = networkConfig.peerServerPath;
        this.peerServerSecure = networkConfig.peerServerSecure;
        this.turnServerHost = networkConfig.turnServerHost;
        this.turnServerPort = networkConfig.turnServerPort;
        this.turnUsername = 'camera';
        this.turnCredential = 'sync';
        
        // Device health tracking (controller only)
        this.deviceHealth = new Map(); // connectionKey -> health state
        this.commandTracker = new Map(); // commandId -> { connectionKey, type, sentAt, ackAt, status, reason }
        this.nextCommandId = 1;
        this.healthDashboardRefreshInterval = null;
        this.connectedHealthy = 0; // Count of devices with last ack success
        this.missedStartAcks = 0;
        this.missedStopAcks = 0;
        this.ackTimeoutMs = 3000;
        
        this.initializeElements();
        this.attachEventListeners();
        this.updateCameraStatus('Camera will be requested when you start Controller or Receiver mode');
        this.updateEnvironmentWarnings();
        
        setTimeout(() => {
            this.initializePeerJS();
        }, 1000);
    }

    resolveNetworkConfig() {
        const defaults = {
            peerServerHost: '10.77.77.1',
            peerServerPort: 9000,
            peerServerPath: '/peerjs',
            peerServerSecure: false,
            turnServerHost: '10.77.77.1',
            turnServerPort: 3478
        };

        try {
            const params = new URLSearchParams(window.location.search);
            const storedPeerHost = window.localStorage.getItem('cameraSyncPeerHost') || '';
            const storedTurnHost = window.localStorage.getItem('cameraSyncTurnHost') || '';
            const storedPeerPort = window.localStorage.getItem('cameraSyncPeerPort') || '';
            const storedPeerPath = window.localStorage.getItem('cameraSyncPeerPath') || '';
            const storedPeerSecure = window.localStorage.getItem('cameraSyncPeerSecure') || '';
            const storedTurnPort = window.localStorage.getItem('cameraSyncTurnPort') || '';

            const pageHost = window.location && window.location.hostname ? window.location.hostname : '';
            const pageIsSecure = window.location && window.location.protocol === 'https:';
            const pagePort = window.location && window.location.port ? Number(window.location.port) : 0;
            const fallbackHost = pageHost && pageHost !== 'localhost' && pageHost !== '127.0.0.1'
                ? pageHost
                : defaults.peerServerHost;

            const peerServerHost = params.get('peerHost') || params.get('gatewayHost') || storedPeerHost || fallbackHost;
            const securePagePeerPort = pagePort || 443;
            const peerServerSecure = (params.get('peerSecure') || storedPeerSecure || '').toLowerCase() === 'true'
                ? true
                : (params.get('peerSecure') || storedPeerSecure || '').toLowerCase() === 'false'
                    ? false
                    : pageIsSecure;
            const peerServerPort = Number(
                params.get('peerPort')
                || storedPeerPort
                || (peerServerSecure ? securePagePeerPort : defaults.peerServerPort)
            ) || (peerServerSecure ? securePagePeerPort : defaults.peerServerPort);
            
            // When on HTTPS with same host, use reverse proxy path '/' (proxy is at /peerjs/ and forwards to /peerjs/)
            // Otherwise use direct PeerJS path '/peerjs'
            let peerServerPath = params.get('peerPath') || storedPeerPath;
            if (!peerServerPath) {
                if (pageIsSecure && peerServerHost === pageHost) {
                    peerServerPath = '/';
                } else {
                    peerServerPath = defaults.peerServerPath;
                }
            }
            
            const turnServerHost = params.get('turnHost') || storedTurnHost || peerServerHost;

            return {
                peerServerHost,
                peerServerPort,
                peerServerPath,
                peerServerSecure,
                turnServerHost,
                turnServerPort: Number(params.get('turnPort') || storedTurnPort || defaults.turnServerPort) || defaults.turnServerPort
            };
        } catch (error) {
            return defaults;
        }
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
        this.cameraPolicyWarning = document.getElementById('camera-policy-warning');
        
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
        
        // Connected devices table elements
        this.devicesTableBody = document.getElementById('devices-table-body');
        
        // Health dashboard elements
        this.healthDashboard = document.getElementById('health-dashboard');
        this.healthSummary = document.getElementById('health-summary');
        this.deviceHealthBody = document.getElementById('device-health-body');
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

        if (controllerId.startsWith('local-')) {
            alert('This controller ID is not reachable. Ensure the controller is online and connected to PeerJS.');
            return;
        }
        
        this.hideManualInput();
        this.connectToController(controllerId);
    }

    updateEnvironmentWarnings() {
        if (!this.cameraPolicyWarning) {
            return;
        }

        if (this.isVSCodeEmbeddedBrowser()) {
            this.cameraPolicyWarning.textContent = 'VS Code embedded browser may not surface camera permission prompts reliably. Use the external browser for camera capture.';
            this.cameraPolicyWarning.classList.remove('hidden');
            return;
        }

        if (!window.isSecureContext) {
            this.cameraPolicyWarning.textContent = 'Camera access requires https:// or http://localhost.';
            this.cameraPolicyWarning.classList.remove('hidden');
            return;
        }

        if (window.top !== window.self) {
            this.cameraPolicyWarning.textContent = 'This app is embedded. If camera is blocked, open it directly in a browser tab or allow camera on the iframe.';
            this.cameraPolicyWarning.classList.remove('hidden');
            return;
        }

        this.cameraPolicyWarning.textContent = '';
        this.cameraPolicyWarning.classList.add('hidden');
    }

    showCameraPolicyWarning(message) {
        if (!this.cameraPolicyWarning) {
            return;
        }

        this.cameraPolicyWarning.textContent = message;
        this.cameraPolicyWarning.classList.remove('hidden');
    }

    clearCameraPolicyWarning() {
        if (!this.cameraPolicyWarning) {
            return;
        }

        this.updateEnvironmentWarnings();
    }

    isVSCodeEmbeddedBrowser() {
        const userAgent = (navigator.userAgent || '').toLowerCase();
        return userAgent.includes('vscode') || userAgent.includes('electron');
    }

    resolveMaxDevices() {
        // No maximum device limit
        return Infinity;
    }

    getConnectionKey(conn) {
        if (conn.connectionId) {
            return conn.connectionId;
        }

        return `${conn.peer}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    }

    getOpenConnections() {
        const open = [];
        this.connections.forEach((conn, connectionKey) => {
            if (conn && conn.open) {
                open.push({ connectionKey, conn });
            }
        });
        return open;
    }

    getOpenConnectionCount() {
        return this.getOpenConnections().length;
    }

    removeConnection(connectionKey) {
        this.connections.delete(connectionKey);
        this.connectionTimes.delete(connectionKey);
        this.connectionLastSeen.delete(connectionKey);
        this.updateConnectedCount(this.getOpenConnectionCount());
        this.updateDevicesTable();
    }

    stopHealthDashboard() {
        if (this.healthDashboardRefreshInterval) {
            clearInterval(this.healthDashboardRefreshInterval);
            this.healthDashboardRefreshInterval = null;
        }
    }

    startHealthDashboard() {
        this.stopHealthDashboard();
        
        // Refresh health dashboard every 500ms for real-time updates
        this.healthDashboardRefreshInterval = setInterval(() => {
            this.updateHealthDashboard();
        }, 500);
    }

    getDeviceHealthState(connectionKey) {
        if (!this.deviceHealth.has(connectionKey)) {
            this.deviceHealth.set(connectionKey, {
                connectionKey,
                peerId: '',
                state: 'joining', // joining, connected, healthy, unhealthy
                lastPing: 0,
                lastPingAt: Date.now(),
                lastSeen: Date.now(),
                lastCommandId: null,
                lastCommandType: null,
                lastAckStatus: null,
                lastAckLatency: 0,
                lastError: '',
                commandCount: 0,
                ackSuccessCount: 0,
                ackFailCount: 0
            });
        }
        return this.deviceHealth.get(connectionKey);
    }

    recordPing(connectionKey, latency) {
        const health = this.getDeviceHealthState(connectionKey);
        health.lastPing = latency;
        health.lastPingAt = Date.now();
        health.lastSeen = Date.now();
    }

    recordCommandSent(connectionKey, commandId, commandType) {
        const health = this.getDeviceHealthState(connectionKey);
        health.lastCommandId = commandId;
        health.lastCommandType = commandType;
        health.commandCount++;
    }

    recordAck(connectionKey, commandId, status, reason, latency) {
        const health = this.getDeviceHealthState(connectionKey);
        health.lastAckStatus = status;
        health.lastAckLatency = latency;
        health.lastError = reason || '';
        health.lastSeen = Date.now();
        
        if (status === 'ok') {
            health.ackSuccessCount++;
            health.state = 'healthy';
        } else {
            health.ackFailCount++;
            health.state = 'unhealthy';
        }
    }

    updateHealthDashboard() {
        if (!this.isController || !this.healthDashboard) {
            return;
        }

        // Calculate KPIs
        this.connectedHealthy = 0;
        this.missedStartAcks = 0;
        this.missedStopAcks = 0;
        let totalAcks = 0;
        let successAcks = 0;
        let medianLatency = 0;
        const latencies = [];

        this.deviceHealth.forEach((health) => {
            if (health.state === 'healthy') {
                this.connectedHealthy++;
            }
            if (health.lastCommandType === 'START_RECORDING' && health.lastAckStatus === 'fail') {
                this.missedStartAcks++;
            }
            if (health.lastCommandType === 'STOP_RECORDING' && health.lastAckStatus === 'fail') {
                this.missedStopAcks++;
            }
            totalAcks += health.ackSuccessCount + health.ackFailCount;
            successAcks += health.ackSuccessCount;
            if (health.lastAckLatency > 0) {
                latencies.push(health.lastAckLatency);
            }
        });

        if (latencies.length > 0) {
            latencies.sort((a, b) => a - b);
            medianLatency = latencies[Math.floor(latencies.length / 2)];
        }

        const ackSuccessRate = totalAcks > 0 ? Math.round((successAcks / totalAcks) * 100) : 0;

        // Update summary
        const openCount = this.getOpenConnectionCount();
        this.healthSummary.innerHTML = `
            <strong>Connected:</strong> ${openCount} | 
            <strong>Healthy:</strong> ${this.connectedHealthy} | 
            <strong>Ack Success Rate:</strong> ${ackSuccessRate}% | 
            <strong>Median Latency:</strong> ${medianLatency}ms | 
            <strong>Missed Starts:</strong> ${this.missedStartAcks} | 
            <strong>Missed Stops:</strong> ${this.missedStopAcks}
        `;

        // Update device rows
        this.deviceHealthBody.innerHTML = '';

        if (this.deviceHealth.size === 0) {
            this.deviceHealthBody.innerHTML = '<tr class="empty-state"><td colspan="8">No devices connected yet</td></tr>';
            return;
        }

        this.deviceHealth.forEach((health) => {
            const row = document.createElement('tr');
            const stateBadge = health.state === 'healthy' ? '✓' : health.state === 'unhealthy' ? '✗' : '○';
            const ackRate = (health.ackSuccessCount + health.ackFailCount) > 0 
                ? `${Math.round((health.ackSuccessCount / (health.ackSuccessCount + health.ackFailCount)) * 100)}%`
                : 'N/A';
            
            const lastErr = health.lastError ? health.lastError.substring(0, 25) : 'none';
            
            row.innerHTML = `
                <td>${health.peerId.substring(0, 12)}...</td>
                <td>${stateBadge} ${health.state}</td>
                <td>${health.lastPing}ms</td>
                <td>${health.lastCommandType || '-'}</td>
                <td>${health.lastAckStatus || '-'}</td>
                <td>${health.lastAckLatency}ms</td>
                <td>${ackRate}</td>
                <td>${lastErr}</td>
            `;
            this.deviceHealthBody.appendChild(row);
        });
    }

    stopConnectionHeartbeat() {
        if (this.connectionHeartbeatInterval) {
            clearInterval(this.connectionHeartbeatInterval);
            this.connectionHeartbeatInterval = null;
        }
    }

    startConnectionHeartbeat() {
        this.stopConnectionHeartbeat();

        this.connectionHeartbeatInterval = setInterval(() => {
            const now = Date.now();
            this.connections.forEach((conn, connectionKey) => {
                if (!conn || !conn.open) {
                    this.removeConnection(connectionKey);
                    return;
                }

                const lastSeen = this.connectionLastSeen.get(connectionKey) || now;
                if (now - lastSeen > this.connectionTimeoutMs) {
                    conn.close();
                    this.removeConnection(connectionKey);
                    return;
                }

                try {
                    conn.send({ type: 'PING', timestamp: now, _device_health_ping: true });
                } catch (error) {
                    const health = this.getDeviceHealthState(connectionKey);
                    health.state = 'unhealthy';
                    health.lastError = 'Heartbeat send failed';
                    conn.close();
                    this.removeConnection(connectionKey);
                }
            });
        }, this.heartbeatIntervalMs);
    }

    canAcceptConnection(conn) {
        // Always accept connections, no limit
        return true;
    }

    initializePeerJS() {
        const peerProtocol = this.peerServerSecure ? 'https' : 'http';
        this.updateDebugMessage(`Initializing gateway laptop connection at ${peerProtocol}://${this.peerServerHost}:${this.peerServerPort}${this.peerServerPath}...`);
        
        try {
            this.peer = new Peer({
                host: this.peerServerHost,
                port: this.peerServerPort,
                path: this.peerServerPath,
                secure: this.peerServerSecure,
                config: {
                    iceServers: [
                        { urls: `stun:${this.peerServerHost}:${this.turnServerPort}` },
                        {
                            urls: `turn:${this.peerServerHost}:${this.turnServerPort}`,
                            username: this.turnUsername,
                            credential: this.turnCredential
                        }
                    ]
                },
                debug: 1
            });

            this.peer.on('open', (id) => {
                this.myPeerId = id;
                this.isPeerReady = true;
                this.updateDebugMessage(`Connected through gateway laptop. ID: ${id.substring(0, 8)}...`);
                
                if (this.isController) {
                    this.generateQRCode();
                }
            });

            this.peer.on('connection', (conn) => {
                this.handleIncomingConnection(conn);
            });

            this.peer.on('disconnected', () => {
                this.isPeerReady = false;
                this.updateDebugMessage('Signaling connection lost. Retrying...');
                this.peer.reconnect();
            });

            this.peer.on('close', () => {
                this.isPeerReady = false;
            });

            this.peer.on('error', (err) => {
                this.isPeerReady = false;
                this.updateDebugMessage(`Connection error: ${err.type}`);
                this.fallbackToManualConnection();
            });

        } catch (error) {
            this.isPeerReady = false;
            this.updateDebugMessage(`Error: ${error.message}`);
            this.fallbackToManualConnection();
        }
    }

    fallbackToManualConnection() {
        this.myPeerId = null;
        this.updateDebugMessage('Peer signaling unavailable. Check the gateway laptop server and reload.');
    }

    handleIncomingConnection(conn) {
        if (!this.isController) {
            conn.close();
            return;
        }

        if (!this.canAcceptConnection(conn)) {
            return;
        }

        const connectionKey = this.getConnectionKey(conn);
        this.connections.set(connectionKey, conn);
        this.connectionLastSeen.set(connectionKey, Date.now());
        
        // Initialize device health state
        const health = this.getDeviceHealthState(connectionKey);
        health.peerId = conn.peer;
        health.state = 'joining';

        conn.on('open', () => {
            const connectedAt = Date.now();
            this.connectionTimes.set(connectionKey, connectedAt);
            this.connectionLastSeen.set(connectionKey, connectedAt);
            
            // Update device health
            const health = this.getDeviceHealthState(connectionKey);
            health.state = 'connected';
            
            this.updateConnectedCount(this.getOpenConnectionCount());
            this.updateDebugMessage(`Device connected: ${conn.peer.substring(0, 8)}... (${this.getOpenConnectionCount()}/${this.maxConnectedDevices})`);
            this.updateDevicesTable();
        });

        conn.on('data', (data) => {
            this.connectionLastSeen.set(connectionKey, Date.now());
            const health = this.getDeviceHealthState(connectionKey);
            health.lastSeen = Date.now();

            if (!data || !data.type) {
                return;
            }

            if (data.type === 'PONG') {
                if (data.timestamp) {
                    const latency = Date.now() - data.timestamp;
                    this.recordPing(connectionKey, latency);
                }
                return;
            }
            
            if (data.type === 'HELLO') {
                return;
            }

            if (data.type === 'TAKE_PHOTO_AT') {
                const triggerAt = Number(data.triggerAt);
                this.scheduleTimedAction(() => {
                    this.capturePhoto();
                }, triggerAt, 'pendingPhotoTimeoutId');
                this.updateDebugMessage('Photo trigger received.');
                return;
            }

            if (data.type === 'TAKE_PHOTO') {
                this.capturePhoto();
                this.updateDebugMessage('Photo triggered!');
                return;
            }

            if (data.type === 'START_RECORDING_ACK') {
                const commandId = data.commandId;
                if (this.commandTracker.has(commandId)) {
                    const cmd = this.commandTracker.get(commandId);
                    cmd.ackAt = Date.now();
                    cmd.status = data.status || 'ok';
                    cmd.reason = data.reason || '';
                    const latency = cmd.ackAt - cmd.sentAt;
                    this.recordAck(connectionKey, commandId, cmd.status, cmd.reason, latency);
                    
                    if (cmd.status !== 'ok') {
                        this.missedStartAcks++;
                    }
                }
                return;
            }
            
            if (data.type === 'STOP_RECORDING_ACK') {
                const commandId = data.commandId;
                if (this.commandTracker.has(commandId)) {
                    const cmd = this.commandTracker.get(commandId);
                    cmd.ackAt = Date.now();
                    cmd.status = data.status || 'ok';
                    cmd.reason = data.reason || '';
                    const latency = cmd.ackAt - cmd.sentAt;
                    this.recordAck(connectionKey, commandId, cmd.status, cmd.reason, latency);
                    
                    if (cmd.status !== 'ok') {
                        this.missedStopAcks++;
                    }
                }
                return;
            }
        });

        conn.on('error', (err) => {
            const health = this.getDeviceHealthState(connectionKey);
            health.lastError = err ? err.message : 'Connection error';
            health.state = 'unhealthy';
            this.removeConnection(connectionKey);
        });

        conn.on('close', () => {
            this.deviceHealth.delete(connectionKey);
            this.removeConnection(connectionKey);
        });
    }

    async requestCameraPermission() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            const guidance = 'Browser does not support camera capture on this page.';
            this.showCameraPolicyWarning(guidance);
            this.updateCameraStatus(guidance);
            this.updateDebugMessage(guidance);
            return false;
        }

        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ 
                video: { 
                    facingMode: 'environment',
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }, 
                audio: false 
            });
            this.clearCameraPolicyWarning();
            this.updateCameraStatus('Camera ready');
            return true;
        } catch (error) {
            try {
                // Desktop browsers may reject rear-camera preference even when a camera is available.
                this.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
                this.clearCameraPolicyWarning();
                this.updateCameraStatus('Camera ready');
                return true;
            } catch (fallbackError) {
                const guidance = this.getCameraPermissionGuidance(fallbackError);
                this.showCameraPolicyWarning(guidance);
                this.updateCameraStatus(guidance);
                this.updateDebugMessage(guidance);
                return false;
            }
        }
    }

    getCameraPermissionGuidance(error) {
        const message = (error && error.message ? error.message : '').toLowerCase();
        const name = error && error.name ? error.name : 'UnknownError';
        const policyBlocked = message.includes('permissions policy') || message.includes('not allowed in this document');

        if (this.isVSCodeEmbeddedBrowser()) {
            return 'Camera permission is unreliable in the VS Code embedded browser. Open this page in your external browser to grant camera access.';
        }

        if (policyBlocked) {
            if (window.top !== window.self) {
                return 'Camera blocked by document policy. Open this app directly in a browser tab or allow camera on the embedding iframe.';
            }

            return 'Camera blocked by Permissions-Policy on this origin. Allow camera for this page in server/browser policy.';
        }

        if (name === 'NotAllowedError' || name === 'SecurityError') {
            return 'Camera permission denied. Allow camera in browser site settings, then try again.';
        }

        if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
            return 'No camera detected on this device.';
        }

        if (name === 'NotReadableError' || name === 'TrackStartError') {
            return 'Camera is busy in another app. Close other camera apps and retry.';
        }

        return `Camera error (${name}): ${error && error.message ? error.message : 'Unknown camera error'}`;
    }

    async ensureCameraReady() {
        if (this.stream) {
            return true;
        }

        return this.requestCameraPermission();
    }

    async startQRScanner() {
        this.hideJoinModal();

        const scannerStream = await this.requestQRScannerStream();
        if (!scannerStream) {
            return;
        }

        this.qrVideo.srcObject = scannerStream;
        this.qrScannerModal.classList.remove('hidden');
        this.qrScanning = true;
        this.updateDebugMessage('QR Scanner active - point at QR code');

        try {
            await this.qrVideo.play();
        } catch (error) {
            this.updateDebugMessage('Could not start QR preview video. Tap camera permission and try again.');
            this.stopQRScanner();
            return;
        }

        this.scanQRCode();
    }

    async requestQRScannerStream() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            this.updateDebugMessage('Browser does not support camera capture for QR scanning.');
            return null;
        }

        const hasLiveMainCamera = this.stream && this.stream.getVideoTracks().some((track) => track.readyState === 'live');
        if (hasLiveMainCamera) {
            this.qrUsesMainStream = true;
            this.qrStream = this.stream;
            return this.qrStream;
        }

        if (this.qrStream) {
            this.qrUsesMainStream = false;
            return this.qrStream;
        }

        const preferredConstraints = {
            video: {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: false
        };

        try {
            this.qrStream = await navigator.mediaDevices.getUserMedia(preferredConstraints);
            this.qrUsesMainStream = false;
            return this.qrStream;
        } catch (error) {
            try {
                // Desktop browsers may not satisfy environment-facing preference.
                this.qrStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
                this.qrUsesMainStream = false;
                return this.qrStream;
            } catch (fallbackError) {
                this.updateDebugMessage('QR scanner camera unavailable. Check camera permissions and policy settings.');
                return null;
            }
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
            
            if (typeof jsQR !== 'undefined') {
                const code = jsQR(imageData.data, imageData.width, imageData.height);
                
                if (code) {
                    this.handleQRCodeDetected(code.data);
                    return;
                }
            }
        }
        
        this.qrScanAnimationFrameId = requestAnimationFrame(() => this.scanQRCode());
    }

    handleQRCodeDetected(data) {
        try {
            const qrData = JSON.parse(data);
            if (qrData.type === 'camera_sync_controller' && qrData.peerId) {
                this.stopQRScannerAndConnect(qrData.peerId);
                return;
            }
        } catch (error) {
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

        if (this.qrScanAnimationFrameId) {
            cancelAnimationFrame(this.qrScanAnimationFrameId);
            this.qrScanAnimationFrameId = null;
        }

        this.qrVideo.srcObject = null;

        if (this.qrStream) {
            if (!this.qrUsesMainStream) {
                this.qrStream.getTracks().forEach((track) => track.stop());
            }
            this.qrStream = null;
        }

        this.qrUsesMainStream = false;

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
        this.connectedCount.textContent = `${count}/${this.maxConnectedDevices}`;
        this.triggerCamerasBtn.disabled = count === 0;
    }

    clearPendingRecordingTimers() {
        if (this.pendingRecordingStartTimeoutId) {
            clearTimeout(this.pendingRecordingStartTimeoutId);
            this.pendingRecordingStartTimeoutId = null;
        }

        if (this.pendingRecordingStopTimeoutId) {
            clearTimeout(this.pendingRecordingStopTimeoutId);
            this.pendingRecordingStopTimeoutId = null;
        }
    }

    clearPendingPhotoTimer() {
        if (this.pendingPhotoTimeoutId) {
            clearTimeout(this.pendingPhotoTimeoutId);
            this.pendingPhotoTimeoutId = null;
        }
    }

    scheduleRecordingAction(action, triggerAt, timeoutProp) {
        this.scheduleTimedAction(action, triggerAt, timeoutProp);
    }

    scheduleTimedAction(action, triggerAt, timeoutProp) {
        if (!triggerAt || !Number.isFinite(triggerAt)) {
            action();
            return;
        }

        const delay = Math.max(0, triggerAt - Date.now());
        if (this[timeoutProp]) {
            clearTimeout(this[timeoutProp]);
            this[timeoutProp] = null;
        }

        if (delay === 0) {
            action();
            return;
        }

        this[timeoutProp] = setTimeout(() => {
            this[timeoutProp] = null;
            action();
        }, delay);
    }

    broadcastRecordingMessage(type, payload = {}) {
        const openConnections = this.getOpenConnections();

        openConnections.forEach(({ conn, connectionKey }) => {
            try {
                conn.send({
                    type,
                    timestamp: Date.now(),
                    ...payload
                });
            } catch (error) {
                conn.close();
                this.removeConnection(connectionKey);
            }
        });

        return openConnections.length;
    }

    formatConnectedTime(timestamp) {
        const now = Date.now();
        const elapsedMs = now - timestamp;
        const elapsedSecs = Math.floor(elapsedMs / 1000);
        
        if (elapsedSecs < 60) {
            return `${elapsedSecs} sec`;
        }
        
        const elapsedMins = Math.floor(elapsedSecs / 60);
        const remainingSecs = elapsedSecs % 60;
        
        if (elapsedMins < 60) {
            return `${elapsedMins} min ${remainingSecs} sec`;
        }
        
        const elapsedHours = Math.floor(elapsedMins / 60);
        const remainingMins = elapsedMins % 60;
        
        return `${elapsedHours} hr ${remainingMins} min`;
    }

    updateDevicesTable() {
        // Clear existing rows
        this.devicesTableBody.innerHTML = '';

        const openConnections = this.getOpenConnections();

        if (openConnections.length === 0) {
            this.devicesTableBody.innerHTML = '<tr class="empty-state"><td colspan="3">No devices connected</td></tr>';
            return;
        }

        // Build rows for each connected device
        openConnections.forEach(({ conn, connectionKey }) => {
            const connectionTime = this.connectionTimes.get(connectionKey);
            const timeConnectedStr = connectionTime ? this.formatConnectedTime(connectionTime) : 'Unknown';
            
            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="device-id">${conn.peer.substring(0, 12)}...</td>
                <td class="device-status">Connected</td>
                <td class="device-time">${timeConnectedStr}</td>
            `;
            this.devicesTableBody.appendChild(row);
        });
    }

    async becomeController() {
        const cameraReady = await this.ensureCameraReady();
        if (!cameraReady) {
            return;
        }

        this.isController = true;
        this.showScreen(this.controllerScreen);
        
        if (this.stream) {
            this.controllerPreview.srcObject = this.stream;
        }
        
        this.updateDevicesTable(); // Initialize the table display
        this.createPhotoGallery('controller');
        this.startHosting();
    }

    startHosting() {
        this.updateDebugMessage(`Starting controller (capacity ${this.maxConnectedDevices})...`);
        
        // Start periodic table refresh every second to update time durations
        this.devicesTableRefreshInterval = setInterval(() => {
            this.updateDevicesTable();
        }, 1000);

        this.startConnectionHeartbeat();
        this.startHealthDashboard();
        this.updateHealthDashboard();
        
        if (this.myPeerId && this.isPeerReady) {
            this.generateQRCode();
        } else {
            this.updateDebugMessage('Waiting for signaling connection before sharing controller ID...');
        }
    }

    createPhotoGallery(screenType) {
        const screen = screenType === 'controller' ? this.controllerScreen : this.receiverScreen;
        
        // Remove existing gallery if any
        const existingGallery = screen.querySelector('.photo-gallery');
        if (existingGallery) {
            existingGallery.remove();
        }
        
        const galleryContainer = document.createElement('div');
        galleryContainer.className = 'photo-gallery';
        galleryContainer.innerHTML = `
            <div class="gallery-header">
                <h3>Media Captured: <span class="photo-count">0</span></h3>
                <button class="btn orange record-video-btn">Start Recording</button>
                <button class="btn red stop-recording-btn" disabled>Stop Recording</button>
                <button class="btn blue download-all-btn" disabled>Download All Media</button>
                <button class="btn red clear-all-btn" disabled>Clear All</button>
            </div>
            <div class="gallery-grid"></div>
        `;
        
        screen.appendChild(galleryContainer);
        
        // Add event listeners for gallery buttons
        const recordVideoBtn = galleryContainer.querySelector('.record-video-btn');
        const stopRecordingBtn = galleryContainer.querySelector('.stop-recording-btn');
        const downloadAllBtn = galleryContainer.querySelector('.download-all-btn');
        const clearAllBtn = galleryContainer.querySelector('.clear-all-btn');

        recordVideoBtn.addEventListener('click', () => this.startVideoRecording());
        stopRecordingBtn.addEventListener('click', () => this.stopVideoRecording());
        
        downloadAllBtn.addEventListener('click', () => this.downloadAllPhotos());
        clearAllBtn.addEventListener('click', () => this.clearAllPhotos());
    }

    getTotalCapturedMediaCount() {
        return this.capturedPhotos.length + this.capturedVideos.length;
    }

    getCurrentGalleryElements() {
        const currentScreen = this.isController ? this.controllerScreen : this.receiverScreen;
        return {
            currentScreen,
            galleryGrid: currentScreen.querySelector('.gallery-grid'),
            photoCount: currentScreen.querySelector('.photo-count'),
            downloadAllBtn: currentScreen.querySelector('.download-all-btn'),
            clearAllBtn: currentScreen.querySelector('.clear-all-btn'),
            recordVideoBtn: currentScreen.querySelector('.record-video-btn'),
            stopRecordingBtn: currentScreen.querySelector('.stop-recording-btn')
        };
    }

    updateGalleryHeaderState() {
        const { photoCount, downloadAllBtn, clearAllBtn } = this.getCurrentGalleryElements();
        const totalMedia = this.getTotalCapturedMediaCount();

        if (photoCount) {
            photoCount.textContent = totalMedia;
        }

        if (downloadAllBtn) {
            downloadAllBtn.disabled = totalMedia === 0;
        }

        if (clearAllBtn) {
            clearAllBtn.disabled = totalMedia === 0;
        }
    }

    updateRecordingButtons() {
        const { recordVideoBtn, stopRecordingBtn } = this.getCurrentGalleryElements();
        const isRecording = !!this.mediaRecorder && this.mediaRecorder.state === 'recording';

        if (recordVideoBtn) {
            recordVideoBtn.disabled = isRecording;
        }

        if (stopRecordingBtn) {
            stopRecordingBtn.disabled = !isRecording;
        }
    }

    getSupportedRecordingMimeType() {
        const preferredTypes = [
            'video/webm;codecs=vp9,opus',
            'video/webm;codecs=vp8,opus',
            'video/webm',
            'video/mp4'
        ];

        for (const type of preferredTypes) {
            if (MediaRecorder.isTypeSupported(type)) {
                return type;
            }
        }

        return '';
    }

    async startVideoRecording(options = {}) {
        const {
            fromRemote = false,
            triggerAt = null,
            sourceLabel = null
        } = options;

        this.currentRecordingSourceLabel = sourceLabel || '';

        if (this.isController && !fromRemote) {
            const syncedTriggerAt = triggerAt || (Date.now() + this.recordingSyncLeadTimeMs);
            const commandId = this.generateCommandId();
            
            const openConnections = this.getOpenConnections();
            openConnections.forEach(({ conn, connectionKey }) => {
                try {
                    conn.send({
                        type: 'START_RECORDING',
                        commandId,
                        timestamp: Date.now(),
                        triggerAt: syncedTriggerAt
                    });
                    this.recordCommandSent(connectionKey, commandId, 'START_RECORDING');
                    this.commandTracker.set(commandId, {
                        connectionKey,
                        type: 'START_RECORDING',
                        sentAt: Date.now(),
                        ackAt: null,
                        status: null,
                        reason: null
                    });
                } catch (error) {
                    conn.close();
                    this.removeConnection(connectionKey);
                }
            });
            
            // Setup timeout to mark missed acks
            setTimeout(() => {
                if (this.commandTracker.has(commandId)) {
                    const cmd = this.commandTracker.get(commandId);
                    if (!cmd.status) {
                        cmd.status = 'timeout';
                        cmd.reason = 'No ACK within ' + this.ackTimeoutMs + 'ms';
                        const health = this.getDeviceHealthState(cmd.connectionKey);
                        health.lastAckStatus = 'timeout';
                        health.lastError = cmd.reason;
                        health.state = 'unhealthy';
                        this.missedStartAcks++;
                    }
                }
            }, this.ackTimeoutMs);

            this.scheduleRecordingAction(() => {
                this.startVideoRecording({ fromRemote: true, sourceLabel: 'Controller Video' });
            }, syncedTriggerAt, 'pendingRecordingStartTimeoutId');

            this.updateDebugMessage(`Starting synced recording on ${openConnections.length + 1} devices...`);
            return;
        }

        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            this.updateDebugMessage('Recording already in progress.');
            return;
        }

        const cameraReady = await this.ensureCameraReady();
        if (!cameraReady || !this.stream) {
            this.updateDebugMessage('Cannot start recording without camera access.');
            return;
        }

        if (typeof MediaRecorder === 'undefined') {
            this.updateDebugMessage('This browser does not support video recording.');
            return;
        }

        const mimeType = this.getSupportedRecordingMimeType();
        this.currentRecordingMimeType = mimeType;

        try {
            const recorderOptions = mimeType ? { mimeType } : undefined;
            this.mediaRecorder = new MediaRecorder(this.stream, recorderOptions);
        } catch (error) {
            this.mediaRecorder = null;
            this.currentRecordingMimeType = '';
            this.currentRecordingSourceLabel = '';
            this.updateDebugMessage(`Could not start recorder: ${error.message}`);
            return;
        }

        this.recordedChunks = [];
        this.currentRecordingStart = Date.now();

        this.mediaRecorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
                this.recordedChunks.push(event.data);
            }
        };

        this.mediaRecorder.onstop = () => {
            this.finalizeVideoRecording();
        };

        this.mediaRecorder.onerror = (event) => {
            const errorMessage = event && event.error ? event.error.message : 'Unknown recording error';
            this.updateDebugMessage(`Recording error: ${errorMessage}`);
            this.mediaRecorder = null;
            this.recordedChunks = [];
            this.currentRecordingStart = null;
            this.currentRecordingMimeType = '';
            this.currentRecordingSourceLabel = '';
            this.updateRecordingButtons();
        };

        this.mediaRecorder.start(250);
        this.updateRecordingButtons();
        this.updateDebugMessage('Recording started. Tap Stop Recording to save clip.');
        this.updateCameraStatus('Recording video...');
    }

    stopVideoRecording(saveClip = true, options = {}) {
        const {
            fromRemote = false,
            triggerAt = null
        } = options;

        if (this.isController && !fromRemote) {
            const syncedTriggerAt = triggerAt || (Date.now() + this.recordingSyncLeadTimeMs);
            const commandId = this.generateCommandId();
            
            const openConnections = this.getOpenConnections();
            openConnections.forEach(({ conn, connectionKey }) => {
                try {
                    conn.send({
                        type: 'STOP_RECORDING',
                        commandId,
                        timestamp: Date.now(),
                        triggerAt: syncedTriggerAt,
                        saveClip
                    });
                    this.recordCommandSent(connectionKey, commandId, 'STOP_RECORDING');
                    this.commandTracker.set(commandId, {
                        connectionKey,
                        type: 'STOP_RECORDING',
                        sentAt: Date.now(),
                        ackAt: null,
                        status: null,
                        reason: null
                    });
                } catch (error) {
                    conn.close();
                    this.removeConnection(connectionKey);
                }
            });
            
            // Setup timeout to mark missed acks
            setTimeout(() => {
                if (this.commandTracker.has(commandId)) {
                    const cmd = this.commandTracker.get(commandId);
                    if (!cmd.status) {
                        cmd.status = 'timeout';
                        cmd.reason = 'No ACK within ' + this.ackTimeoutMs + 'ms';
                        const health = this.getDeviceHealthState(cmd.connectionKey);
                        health.lastAckStatus = 'timeout';
                        health.lastError = cmd.reason;
                        health.state = 'unhealthy';
                        this.missedStopAcks++;
                    }
                }
            }, this.ackTimeoutMs);

            this.scheduleRecordingAction(() => {
                this.stopVideoRecording(saveClip, { fromRemote: true });
            }, syncedTriggerAt, 'pendingRecordingStopTimeoutId');

            this.updateDebugMessage(`Stopping synced recording on ${openConnections.length + 1} devices...`);
            return;
        }

        if (!this.mediaRecorder || this.mediaRecorder.state !== 'recording') {
            this.updateDebugMessage('No active recording to stop.');
            return;
        }

        if (!saveClip) {
            this.discardNextRecording = true;
        }

        this.mediaRecorder.stop();
        this.updateDebugMessage('Stopping recording...');
    }

    finalizeVideoRecording() {
        const startedAt = this.currentRecordingStart || Date.now();
        const durationMs = Math.max(0, Date.now() - startedAt);
        const blobType = this.currentRecordingMimeType || 'video/webm';

        this.mediaRecorder = null;
        this.currentRecordingStart = null;
        this.currentRecordingMimeType = '';
        const sourceLabel = this.currentRecordingSourceLabel;
        this.currentRecordingSourceLabel = '';
        this.updateRecordingButtons();

        if (this.discardNextRecording) {
            this.discardNextRecording = false;
            this.recordedChunks = [];
            this.updateDebugMessage('Recording discarded.');
            return;
        }

        if (this.recordedChunks.length === 0) {
            this.updateDebugMessage('Recording saved with no data. Try recording again.');
            this.recordedChunks = [];
            return;
        }

        const videoBlob = new Blob(this.recordedChunks, { type: blobType });
        this.recordedChunks = [];

        const timestamp = Date.now();
        const extension = blobType.includes('mp4') ? 'mp4' : 'webm';
        const filename = `camera_sync_video_${timestamp}.${extension}`;
        const objectUrl = URL.createObjectURL(videoBlob);

        this.capturedVideos.push({
            blob: videoBlob,
            timestamp,
            durationMs,
            filename,
            objectUrl
        });

        this.addVideoToGallery(objectUrl, durationMs, {
            sourceLabel: sourceLabel || (this.isController ? 'Controller Video' : 'Local Video')
        });
        this.updateCameraStatus(`Video captured (${Math.max(1, Math.round(durationMs / 1000))} sec)`);
        this.updateDebugMessage('Video clip saved.');
    }

    generateQRCode() {
        if (!this.myPeerId || !this.isPeerReady) {
            this.updateDebugMessage('Cannot generate QR yet. Peer signaling is not ready.');
            return;
        }

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
            
            // Insert before photo gallery
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
                </div>
            `;
            const photoGallery = this.controllerScreen.querySelector('.photo-gallery');
            this.controllerScreen.insertBefore(qrContainer, photoGallery);
            this.updateDebugMessage('Ready - share the ID above');
        }
    }

    connectToController(controllerId) {
        this.hasJoinedSession = true;
        this.showScreen(this.receiverScreen);

        this.ensureCameraReady().then((cameraReady) => {
            if (cameraReady && this.stream) {
                this.receiverPreview.srcObject = this.stream;
                this.updateCameraStatus('Camera ready for photos');
            }
        });
        
        this.createPhotoGallery('receiver');
        this.updateDebugMessage(`Connecting to: ${controllerId.substring(0, 8)}...`);

        if (this.activeControllerConnection) {
            this.activeControllerConnection.close();
            this.activeControllerConnection = null;
        }

        if (!this.peer || !this.peer.open || !this.isPeerReady) {
            this.isConnected = false;
            this.updateDebugMessage('Local peer signaling is not ready. Wait a moment and retry connection.');
            this.reconnectBtn.classList.remove('hidden');
            return;
        }
        
        if (this.peer && this.peer.open) {
            const conn = this.peer.connect(controllerId, {
                reliable: true,
                serialization: 'json'
            });
            this.activeControllerConnection = conn;
            
            conn.on('open', () => {
                this.isConnected = true;
                this.updateDebugMessage('Connected to controller!');
                this.reconnectBtn.classList.add('hidden');
                conn.send({ type: 'HELLO', timestamp: Date.now() });
            });

            conn.on('data', (data) => {
                if (!data || !data.type) {
                    return;
                }

                if (data.type === 'SESSION_FULL') {
                    this.isConnected = false;
                    this.updateDebugMessage(data.message || 'Controller is full');
                    this.reconnectBtn.classList.remove('hidden');
                    return;
                }

                if (data.type === 'PING') {
                    conn.send({ type: 'PONG', timestamp: Date.now() });
                    return;
                }

                if (data.type === 'TAKE_PHOTO_AT') {
                    const triggerAt = Number(data.triggerAt);
                    this.scheduleTimedAction(() => {
                        this.capturePhoto();
                    }, triggerAt, 'pendingPhotoTimeoutId');
                    this.updateDebugMessage('Photo trigger received from controller.');
                    return;
                }

                if (data.type === 'TAKE_PHOTO') {
                    this.capturePhoto();
                    this.updateDebugMessage('Photo triggered by controller!');
                    return;
                }

                if (data.type === 'START_RECORDING') {
                    const triggerAt = Number(data.triggerAt);
                    const commandId = data.commandId;
                    
                    this.scheduleRecordingAction(() => {
                        this.startVideoRecording({
                            fromRemote: true,
                            sourceLabel: 'Synced Video'
                        }).then(() => {
                            // Send ACK on success
                            if (this.activeControllerConnection && this.activeControllerConnection.open) {
                                this.activeControllerConnection.send({
                                    type: 'START_RECORDING_ACK',
                                    commandId,
                                    status: 'ok',
                                    timestamp: Date.now()
                                });
                            }
                        }).catch((err) => {
                            // Send ACK with failure reason
                            if (this.activeControllerConnection && this.activeControllerConnection.open) {
                                this.activeControllerConnection.send({
                                    type: 'START_RECORDING_ACK',
                                    commandId,
                                    status: 'fail',
                                    reason: err ? err.message : 'Recording start failed',
                                    timestamp: Date.now()
                                });
                            }
                        });
                    }, triggerAt, 'pendingRecordingStartTimeoutId');
                    this.updateDebugMessage('Synced recording start received.');
                    return;
                }

                if (data.type === 'STOP_RECORDING') {
                    const triggerAt = Number(data.triggerAt);
                    const saveClip = data.saveClip !== false;
                    const commandId = data.commandId;
                    
                    this.scheduleRecordingAction(() => {
                        this.stopVideoRecording(saveClip, { fromRemote: true });
                        // Send ACK on success
                        if (this.activeControllerConnection && this.activeControllerConnection.open) {
                            this.activeControllerConnection.send({
                                type: 'STOP_RECORDING_ACK',
                                commandId,
                                status: 'ok',
                                timestamp: Date.now()
                            });
                        }
                    }, triggerAt, 'pendingRecordingStopTimeoutId');
                    this.updateDebugMessage('Synced recording stop received.');
                    return;
                }
            });

            conn.on('close', () => {
                this.isConnected = false;
                if (this.activeControllerConnection === conn) {
                    this.activeControllerConnection = null;
                }
                this.updateDebugMessage('Disconnected from controller');
                this.reconnectBtn.classList.remove('hidden');
            });

            conn.on('error', (err) => {
                if (this.activeControllerConnection === conn) {
                    this.activeControllerConnection = null;
                }
                this.isConnected = false;
                if (err && err.type === 'peer-unavailable') {
                    this.updateDebugMessage('Controller unavailable. Verify controller is online and sharing a current ID/QR code.');
                } else {
                    this.updateDebugMessage(`Connection failed: ${err.message}`);
                }
                this.reconnectBtn.classList.remove('hidden');
            });
        } else {
            this.isConnected = false;
            this.updateDebugMessage('Cannot connect: local signaling is offline.');
            this.reconnectBtn.classList.remove('hidden');
        }
    }

    triggerCameras() {
        const openConnections = this.getOpenConnections();
        const triggerAt = Date.now() + this.photoSyncLeadTimeMs;

        this.updateDebugMessage('Triggering all cameras...');

        openConnections.forEach(({ conn, connectionKey }) => {
            try {
                conn.send({
                    type: 'TAKE_PHOTO_AT',
                    timestamp: Date.now(),
                    triggerAt
                });
            } catch (error) {
                conn.close();
                this.removeConnection(connectionKey);
            }
        });

        this.scheduleTimedAction(() => {
            this.capturePhoto();
        }, triggerAt, 'pendingPhotoTimeoutId');

        this.updateDebugMessage(`Photo trigger scheduled for ${openConnections.length + 1} devices!`);
    }
    
    generateCommandId() {
        return ++this.nextCommandId;
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
            filename: `camera_sync_${timestamp}.jpg`
        });

        this.addPhotoToGallery(dataURL, timestamp, {
            sourceLabel: this.isController ? 'Controller' : 'Local'
        });
        this.updateCameraStatus(`Photo ${this.capturedPhotos.length} captured!`);
    }

    addPhotoToGallery(dataURL, timestamp, options = {}) {
        const { galleryGrid } = this.getCurrentGalleryElements();
        if (!galleryGrid) {
            return;
        }

        const sourceLabel = options.sourceLabel || 'Photo';
        const mediaIndex = this.getTotalCapturedMediaCount();
        
        // Create thumbnail
        const photoDiv = document.createElement('div');
        photoDiv.className = 'gallery-photo';
        photoDiv.innerHTML = `
            <img src="${dataURL}" alt="Photo ${mediaIndex}">
            <div class="photo-info">${sourceLabel} ${mediaIndex}</div>
        `;
        
        galleryGrid.appendChild(photoDiv);
        this.updateGalleryHeaderState();
    }

    addVideoToGallery(videoUrl, durationMs, options = {}) {
        const { galleryGrid } = this.getCurrentGalleryElements();
        if (!galleryGrid) {
            return;
        }

        const sourceLabel = options.sourceLabel || 'Video';
        const mediaIndex = this.getTotalCapturedMediaCount();
        const durationSecs = Math.max(1, Math.round(durationMs / 1000));

        const videoDiv = document.createElement('div');
        videoDiv.className = 'gallery-photo';
        videoDiv.innerHTML = `
            <video src="${videoUrl}" controls preload="metadata" muted playsinline></video>
            <div class="photo-info">${sourceLabel} ${mediaIndex} (${durationSecs}s)</div>
        `;

        galleryGrid.appendChild(videoDiv);
        this.updateGalleryHeaderState();
    }

async downloadAllPhotos() {
    const mediaItems = [
        ...this.capturedPhotos.map((photo) => ({
            type: 'photo',
            filename: photo.filename,
            dataURL: photo.dataURL
        })),
        ...this.capturedVideos.map((video) => ({
            type: 'video',
            filename: video.filename,
            blob: video.blob
        }))
    ];

    if (mediaItems.length === 0) {
        alert('No media to download');
        return;
    }
    
    // Create progress indicator
    const progressDiv = this.createProgressIndicator();
    
    try {
        const zip = new JSZip();
        
        // Process media with progress updates
        for (let i = 0; i < mediaItems.length; i++) {
            const mediaItem = mediaItems[i];
            
            // Update progress
            const progress = Math.round(((i + 1) / mediaItems.length) * 50); // 50% for adding files
            this.updateProgress(progressDiv, progress, `Adding item ${i + 1}/${mediaItems.length}...`);
            
            let blob;
            if (mediaItem.type === 'photo') {
                const response = await fetch(mediaItem.dataURL);
                blob = await response.blob();
            } else {
                blob = mediaItem.blob;
            }
            
            // Add to ZIP
            zip.file(mediaItem.filename, blob);
        }
        
        // Generate ZIP with progress
        this.updateProgress(progressDiv, 75, 'Generating ZIP file...');
        
        const zipBlob = await zip.generateAsync({ 
            type: 'blob',
            compression: 'DEFLATE',
            compressionOptions: { level: 6 }
        });
        
        // Download ZIP
        this.updateProgress(progressDiv, 90, 'Preparing download...');
        
        const url = URL.createObjectURL(zipBlob);
        const link = document.createElement('a');
        
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        const deviceType = this.isController ? 'controller' : 'receiver';
        link.href = url;
        link.download = `camera_sync_${deviceType}_${timestamp}.zip`;
        link.style.display = 'none';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        URL.revokeObjectURL(url);
        
        // Complete
        this.updateProgress(progressDiv, 100, 'Download complete!');
        
        setTimeout(() => {
            this.removeProgressIndicator(progressDiv);
            this.updateDebugMessage(`ZIP file with ${mediaItems.length} media files downloaded!`);
            this.updateCameraStatus('All media downloaded as ZIP file!');
        }, 1500);
        
    } catch (error) {
        console.error('ZIP creation failed:', error);
        this.removeProgressIndicator(progressDiv);
        this.updateDebugMessage('ZIP creation failed - trying individual downloads...');
        this.fallbackDownload();
    }
}

createProgressIndicator() {
    const progressDiv = document.createElement('div');
    progressDiv.className = 'download-progress';
    progressDiv.innerHTML = `
        <div class="progress-content">
            <h4>Creating ZIP File</h4>
            <div class="progress-bar">
                <div class="progress-fill" style="width: 0%"></div>
            </div>
            <p class="progress-text">Starting...</p>
        </div>
    `;
    
    document.body.appendChild(progressDiv);
    return progressDiv;
}

updateProgress(progressDiv, percentage, text) {
    const fill = progressDiv.querySelector('.progress-fill');
    const textEl = progressDiv.querySelector('.progress-text');
    
    fill.style.width = `${percentage}%`;
    textEl.textContent = text;
}

removeProgressIndicator(progressDiv) {
    if (progressDiv && progressDiv.parentNode) {
        document.body.removeChild(progressDiv);
    }
}

fallbackDownload() {
    const mediaItems = [
        ...this.capturedPhotos.map((photo) => ({
            filename: photo.filename,
            href: photo.dataURL
        })),
        ...this.capturedVideos.map((video) => ({
            filename: video.filename,
            href: video.objectUrl
        }))
    ];

    mediaItems.forEach((item, index) => {
        setTimeout(() => {
            const link = document.createElement('a');
            link.href = item.href;
            link.download = item.filename;
            link.style.display = 'none';
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            if (index === mediaItems.length - 1) {
                this.updateDebugMessage(`Fallback: ${mediaItems.length} media files downloaded individually`);
            }
        }, index * 200);
    });
}

    clearAllPhotos() {
        const totalMedia = this.getTotalCapturedMediaCount();

        if (confirm(`Clear all ${totalMedia} media files? This cannot be undone.`)) {
            if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
                this.stopVideoRecording(false);
            }

            this.capturedPhotos = [];
            this.capturedVideos.forEach((video) => {
                if (video.objectUrl) {
                    URL.revokeObjectURL(video.objectUrl);
                }
            });
            this.capturedVideos = [];
            
            const { galleryGrid } = this.getCurrentGalleryElements();
            
            if (galleryGrid) {
                galleryGrid.innerHTML = '';
            }

            this.updateGalleryHeaderState();
            this.updateRecordingButtons();
            
            this.updateDebugMessage('All media cleared');
            this.updateCameraStatus('Ready for new captures');
        }
    }

    stopHosting() {
        this.isController = false;
        
        // Clear the table refresh interval
        if (this.devicesTableRefreshInterval) {
            clearInterval(this.devicesTableRefreshInterval);
            this.devicesTableRefreshInterval = null;
        }
        
        this.stopHealthDashboard();
        this.deviceHealth.clear();
        this.commandTracker.clear();

        this.stopConnectionHeartbeat();
        
        this.connections.forEach((conn) => {
            conn.close();
        });
        this.connections.clear();
        this.connectionTimes.clear();
        this.connectionLastSeen.clear();
        
        this.updateConnectedCount(0);
        this.updateDebugMessage('Ready to connect');
        this.showScreen(this.homeScreen);
        
        // Clear photos when stopping
        this.capturedPhotos = [];
        this.capturedVideos.forEach((video) => {
            if (video.objectUrl) {
                URL.revokeObjectURL(video.objectUrl);
            }
        });
        this.capturedVideos = [];

        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            this.stopVideoRecording(false);
        }

        this.clearPendingRecordingTimers();
    }

    backToHome() {
        this.hasJoinedSession = false;
        this.isConnected = false;

        if (this.activeControllerConnection) {
            this.activeControllerConnection.close();
            this.activeControllerConnection = null;
        }

        this.updateDebugMessage('Ready to connect');
        this.showScreen(this.homeScreen);
        
        // Clear photos when going home
        this.capturedPhotos = [];
        this.capturedVideos.forEach((video) => {
            if (video.objectUrl) {
                URL.revokeObjectURL(video.objectUrl);
            }
        });
        this.capturedVideos = [];

        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            this.stopVideoRecording(false);
        }

        this.clearPendingRecordingTimers();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new CameraSyncApp();
});