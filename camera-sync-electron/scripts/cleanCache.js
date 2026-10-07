// scripts/cleanCache.js
// Remove stale GPU cache to avoid "Access is denied" errors.
const fs = require('fs');
const path = require('path');

function deleteFolderRecursive(folderPath) {
  if (fs.existsSync(folderPath)) {
    fs.readdirSync(folderPath).forEach((file) => {
      const curPath = path.join(folderPath, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        deleteFolderRecursive(curPath);
      } else {
        try { fs.unlinkSync(curPath); } catch (_) {}
      }
    });
    try { fs.rmdirSync(folderPath); } catch (_) {}
  }
}

const cacheDir = path.join(
  process.env.APPDATA,
  'Camera Sync',
  'GPUPersistentCache',
  'DawnGraphiteCache'
);

deleteFolderRecursive(cacheDir);
process.exit(0);
