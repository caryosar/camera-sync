const express = require('express');
const https = require('https');
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

function generateCertificate() {
    const attrs = [
        {
            name: 'commonName',
            value: 'Camera Sync Local'
        }
    ];

    const pems = selfsigned.generate(attrs, {
        algorithm: 'sha256',
        keySize: 2048,
        days: 365
    });

    return {
        key: pems.private,
        cert: pems.cert
    };
}

async function startServer() {
    if (server) {
        return server.cameraSyncInfo;
    }

    const tls = generateCertificate();

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
        res.setHeader(
            'Permissions-Policy',
            'camera=(self), microphone=()'
        );

        res.setHeader(
            'Cache-Control',
            'no-store'
        );

        next();
    });

    app.get('/vendor/jszip.min.js', (req, res) => {
        res.sendFile(
            require.resolve('jszip/dist/jszip.min.js')
        );
    });

    app.get('/vendor/peerjs.min.js', (req, res) => {
        res.sendFile(
            require.resolve('peerjs/dist/peerjs.min.js')
        );
    });

    app.get('/qr', async (req, res) => {
        const value = String(req.query.data || '');

        if (!value || value.length > 256) {
            return res.status(400).end();
        }

        const svg = await QRCode.toString(value, {
            type: 'svg',
            errorCorrectionLevel: 'M'
        });

        res.type('svg');
        res.send(svg);
    });

    app.get('/health', (req, res) => {
        res.json({
            status: 'ok',
            service: 'camera-sync'
        });
    });

    app.use(
        express.static(
            path.join(__dirname, 'public'),
            {
                index: 'index.html',
                maxAge: 0
            }
        )
    );

    server = https.createServer(
        {
            key: tls.key,
            cert: tls.cert
        },
        app
    );

    app.use(
        '/peerjs',
        ExpressPeerServer(server, {
            path: '/',
            proxied: true,
            allow_discovery: false
        })
    );

    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(8443, '0.0.0.0', resolve);
    });

    const host = lanAddresses()[0] || '127.0.0.1';

    server.cameraSyncInfo = {
        localUrl: 'https://127.0.0.1:8443',
        lanUrl: `https://${host}:8443`
    };

    console.log(
        'Camera Sync listening:',
        server.cameraSyncInfo
    );

    return server.cameraSyncInfo;
}

function stopServer() {
    if (server) {
        server.close();
        server = null;
    }
}

module.exports = {
    startServer,
    stopServer
};