const { app, BrowserWindow, protocol, net, shell } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// A secure, local origin is essential: chess engine workers cannot run reliably from file://.
protocol.registerSchemesAsPrivileged([{
  scheme: 'knightfall',
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true }
}]);

const isDev = !app.isPackaged;
const origin = 'knightfall://app';

app.whenReady().then(() => {
  if (!isDev) {
    const dist = path.resolve(__dirname, '../dist');
    protocol.handle('knightfall', (request) => {
      const url = new URL(request.url);
      if (url.hostname !== 'app') return new Response('Not found', { status: 404 });
      let relative;
      try { relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html'; }
      catch { return new Response('Bad request', { status: 400 }); }
      const target = path.resolve(dist, relative);
      if (target !== dist && !target.startsWith(dist + path.sep))
        return new Response('Forbidden', { status: 403 });
      return net.fetch(pathToFileURL(target).toString());
    });
  }

  const win = new BrowserWindow({
    title: 'Knightfall', width: 1400, height: 940, minWidth: 820, minHeight: 620,
    backgroundColor: '#0c1512', autoHideMenuBar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (isDev ? !url.startsWith('http://127.0.0.1:5173/') : !url.startsWith(origin + '/')) event.preventDefault();
  });
  if (isDev) win.loadURL('http://127.0.0.1:5173/');
  else win.loadURL(origin + '/index.html');
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) app.relaunch(), app.exit(0);
});
