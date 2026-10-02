const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('cameraSyncDesktop', { isDesktop: true, platform: process.platform });
