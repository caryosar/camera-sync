const express = require('express');
const http = require('http');
const os = require('os');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const selfsigned = require('selfsigned');
const QRCode = require('qrcode');
const { ExpressPeerServer } = require('peer');

let server = null;

function lanAddresses() {
    const addresses = [];
    for (const iface of Object.values(os.networkInterfaces())) {
        for (const item of iface || []) {
            if (
                item.family === 'IPv4' &&
                !item.internal &&
                !item.address.startsWith('169.254.')
            ) {
                addresses.push(item.address);
            }
        }
    }
    return [...new Set(addresses)];
}

async function startServer() {
    if (server) {
        return server.cameraSyncInfo;
    }

    const app = express();
    app.disable('x-powered-by');
    app.use(
        helmet({
            crossOriginEmbedderPolicy: false,
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    scriptSrc: ["'self'"],
                    styleSrc: ["'self'"],
                    imgSrc: ["'self'", 'data:', 'blob:'],
                    mediaSrc: ["'self'", 'blob:'],
                    connectSrc: ["'self'", 'wss:'],
                    objectSrc: ["'none'"],
                    frameAncestors: ["'none'"]
                }
            }
        })
    );
    app.use(
        rateLimit({
            windowMs: 60 * 1000,
            limit: 300,
            standardHeaders: true,
            legacyHeaders: false
        })
    );
    app.use((req, res, next) => {
        res.setHeader('Permissions-Policy', 'camera=(self), microphone=()');
        res.setHeader('Cache-Control', 'no-store');
        next();
    });
    app.get('/vendor/jszip.min.js', (req, res) => {
        res.sendFile(require.resolve('jszip/dist/jszip.min.js'));
    });
    app.get('/vendor/peerjs.min.js', (req, res) => {
        res.sendFile(require.resolve('peerjs/dist/peerjs.min.js'));
    });
    app.get('/vendor/qrcode.min.js', (req, res) => {
        // Serve the browser‑ready minified bundle
        res.sendFile(require.resolve('qrcode/build/qrcode.min.js'));
    });
    app.get('/qr', async (req, res) => {
        const value = String(req.query.data || '');
        if (!value || value.length > 256) {
            return res.status(400).end();
        }
        const svg = await QRCode.toString(value, { type: 'svg', errorCorrectionLevel: 'M' });
        res.type('svg');
        res.send(svg);
    });
    app.get('/health', (req, res) => {
        res.json({ status: 'ok', service: 'camera-sync' });
    });
    app.use(
        express.static(path.join(__dirname, 'public'), { index: 'index.html', maxAge: 0 })
    );
    // Create an HTTP server (no TLS) for local development
    server = http.createServer(app);
    // Endpoint to expose LAN URL for clients
    app.get('/lan', (req, res) => {
        if (server && server.cameraSyncInfo) {
            // Return both the primary LAN URL and a list of all LAN URLs
            const allUrls = server.cameraSyncInfo.lanUrls || [];
            res.json({ lanUrl: server.cameraSyncInfo.lanUrl, lanUrls: allUrls });
        } else {
            res.json({ lanUrl: '', lanUrls: [] });
        }
    });
    app.use(
        '/peerjs',
        ExpressPeerServer(server, { path: '/', proxied: true, allow_discovery: false })
    );
    // Use PORT env var if set, otherwise let OS assign a free port
    const requestedPort = process.env.PORT ? parseInt(process.env.PORT, 10) : 0;
    // Listen on the requested port (or 0 for any free port)
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(requestedPort, '0.0.0.0', resolve);
    });
    // After listening, retrieve the actual bound port (important when using 0)
    const boundPort = server.address().port;
    const allAddrs = lanAddresses();
    const host = allAddrs[0] || '127.0.0.1';
    // Build URLs that reflect the actual listening port
    server.cameraSyncInfo = {
        localUrl: `http://127.0.0.1:${boundPort}`,
        lanUrl: `http://${host}:${boundPort}`,
        lanUrls: allAddrs.map(ip => `http://${ip}:${boundPort}`)
    };
    console.log('Camera Sync listening:', server.cameraSyncInfo);
    return server.cameraSyncInfo;
}

function stopServer() {
    if (server) {
        server.close();
        server = null;
    }
}

module.exports = { startServer, stopServer };