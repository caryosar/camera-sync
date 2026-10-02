const { app, BrowserWindow, session, shell } = require('electron');
const path = require('path');
const { startServer, stopServer } = require('./server');
if (require('electron-squirrel-startup')) app.quit();
let mainWindow;
const TRUSTED = new Set(['127.0.0.1','localhost']);
async function createWindow() {
  const info = await startServer();
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    let ok=false; try { const u=new URL(details.requestingUrl||wc.getURL()); ok=permission==='media' && TRUSTED.has(u.hostname) && u.port==='8443'; } catch {}
    callback(ok);
  });
  ses.setPermissionCheckHandler((_wc, permission, origin) => { try { const u=new URL(origin); return permission==='media'&&TRUSTED.has(u.hostname)&&u.port==='8443'; } catch { return false; } });
  mainWindow = new BrowserWindow({width:1100,height:850,minWidth:760,minHeight:600,show:false,
    webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,sandbox:true,nodeIntegration:false,webSecurity:true,allowRunningInsecureContent:false}});
  mainWindow.removeMenu();
  mainWindow.webContents.on('will-navigate',(e,url)=>{if(url!==info.localUrl&&url!==info.localUrl+'/')e.preventDefault();});
  mainWindow.webContents.setWindowOpenHandler(({url})=>{if(/^https:\/\//i.test(url))shell.openExternal(url);return{action:'deny'};});
  await mainWindow.loadURL(info.localUrl); mainWindow.once('ready-to-show',()=>mainWindow.show());
}
app.on(
    'certificate-error',
    (event, _wc, url, _error, _cert, callback) => {
        try {
            const u = new URL(url);

            const trusted =
                (u.hostname === '127.0.0.1' ||
                 u.hostname === 'localhost') &&
                u.port === '8443';

            if (trusted) {
                event.preventDefault();
                callback(trusted);
                return;
            }
        } catch {}

        callback(false);
    }
);

app.whenReady().then(createWindow).catch(e=>{console.error(e);app.quit();});
app.on('window-all-closed',()=>{stopServer();if(process.platform!=='darwin')app.quit();});
app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});
