// RSP MediBill — Desktop Application Main Process
const { app, BrowserWindow, Menu, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const net = require('net');
const { spawn } = require('child_process');

let mainWindow = null;
let serverProcess = null;
let currentServerUrl = null;
const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';

// In-memory ring buffer for recent server logs (for diagnostic reporting)
const recentLogs = [];
function logMessage(msg) {
  const line = '[' + new Date().toISOString() + '] ' + msg;
  console.log(line);
  recentLogs.push(line);
  if (recentLogs.length > 80) recentLogs.shift();
  try {
    const logDir = app.getPath('userData');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(path.join(logDir, 'server.log'), line + '\n');
  } catch (_) {}
}

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close((err) => {
        if (err) reject(err);
        else resolve(port);
      });
    });
    srv.on('error', reject);
  });
}

function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const req = http.get(url, (res) => {
        // Drain data to free socket
        res.on('data', () => {});
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 500) {
            logMessage('Internal server responded with status: ' + res.statusCode);
            resolve();
          } else {
            logMessage('Internal server responded with HTTP ' + res.statusCode + ', retrying...');
            if (Date.now() - start > timeoutMs) {
              reject(new Error('Internal server responded with status ' + res.statusCode + ' after timeout'));
            } else {
              setTimeout(check, 300);
            }
          }
        });
      });
      req.on('error', (err) => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error('Timeout waiting for internal server (' + url + '): ' + err.message));
        } else {
          setTimeout(check, 300);
        }
      });
    };
    check();
  });
}

async function startProductionServer() {
  if (serverProcess && !serverProcess.killed && currentServerUrl) {
    return currentServerUrl;
  }

  const port = await getFreePort();

  const candidates = [
    path.join(process.resourcesPath, 'app', '.output', 'server', 'index.mjs'),
    path.join(process.resourcesPath, 'app.asar.unpacked', '.output', 'server', 'index.mjs'),
    path.join(process.resourcesPath, '.output', 'server', 'index.mjs'),
    path.join(__dirname, '..', '.output', 'server', 'index.mjs'),
    path.join(app.getAppPath(), '.output', 'server', 'index.mjs'),
  ];

  const serverScript = candidates.find((p) => {
    try { return fs.existsSync(p); } catch { return false; }
  });

  if (!serverScript) {
    throw new Error('Production server script not found in candidates: ' + candidates.join(', '));
  }

  logMessage('Starting embedded server on 127.0.0.1:' + port + ' using ' + serverScript);

  // Pass --experimental-websocket so Node 20 runtime in Electron enables native WebSocket for Supabase
  const nodeArgs = ['--experimental-websocket', serverScript];

  serverProcess = spawn(process.execPath, nodeArgs, {
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      NITRO_PORT: String(port),
      NITRO_HOST: '127.0.0.1',
      NODE_ENV: 'production',
      ELECTRON_RUN_AS_NODE: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  serverProcess.stdout.on('data', (d) => {
    logMessage('[Server stdout] ' + d.toString().trim());
  });

  serverProcess.stderr.on('data', (d) => {
    logMessage('[Server stderr] ' + d.toString().trim());
  });

  serverProcess.on('exit', (code, sig) => {
    logMessage('Server process exited with code ' + code + ' sig ' + sig);
    serverProcess = null;
    currentServerUrl = null;
  });

  const appUrl = 'http://127.0.0.1:' + port;
  await waitForServer(appUrl);
  currentServerUrl = appUrl;
  logMessage('Embedded server ready and verified at ' + appUrl);
  return appUrl;
}

function stopProductionServer() {
  if (serverProcess && serverProcess.pid) {
    logMessage('Stopping server process (PID ' + serverProcess.pid + ')...');
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(serverProcess.pid), '/T', '/F']);
      } else {
        serverProcess.kill('SIGTERM');
      }
    } catch (e) {
      logMessage('Error killing server process: ' + e.message);
    }
    serverProcess = null;
    currentServerUrl = null;
  }
}

function renderDiagnosticErrorHtml(errorMessage) {
  const logDir = app.getPath('userData');
  const logFile = path.join(logDir, 'server.log');
  const escapedLogs = recentLogs.slice(-25).map(l => l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')).join('\n');
  const escapedErr = (errorMessage || 'Unknown startup error').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>RSP MediBill — Startup Diagnostic</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 2rem; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; box-sizing: border-box; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; max-width: 720px; width: 100%; padding: 2rem; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); }
    h1 { font-size: 1.5rem; color: #ef4444; margin: 0 0 1rem; display: flex; align-items: center; gap: 0.5rem; }
    p { color: #94a3b8; font-size: 0.95rem; line-height: 1.5; margin: 0 0 1.25rem; }
    .log-box { background: #090d16; border: 1px solid #1e293b; border-radius: 8px; padding: 1rem; font-family: monospace; font-size: 0.8rem; color: #cbd5e1; white-space: pre-wrap; word-break: break-all; max-height: 240px; overflow-y: auto; margin-bottom: 1.5rem; }
    .actions { display: flex; gap: 0.75rem; flex-wrap: wrap; }
    button { background: #2563eb; color: #fff; border: none; padding: 0.65rem 1.25rem; border-radius: 6px; font-weight: 500; cursor: pointer; transition: background 0.15s; font-size: 0.9rem; }
    button:hover { background: #1d4ed8; }
    button.secondary { background: #334155; color: #f1f5f9; }
    button.secondary:hover { background: #475569; }
  </style>
</head>
<body>
  <div class="card">
    <h1>⚠️ Application Startup Notice</h1>
    <p>RSP MediBill was unable to start its embedded local application service. Below are the diagnostic details:</p>
    <p style="color: #fca5a5; font-weight: 600;">${escapedErr}</p>
    <div class="log-box">${escapedLogs || 'No logs recorded.'}</div>
    <div class="actions">
      <button onclick="window.electronAPI.retryStartup()">Retry Starting App</button>
      <button class="secondary" onclick="window.electronAPI.openLogFolder()">Open Log File</button>
      <button class="secondary" onclick="window.electronAPI.closeWindow()">Exit</button>
    </div>
  </div>
</body>
</html>`;
}

async function loadAppIntoWindow() {
  let targetUrl = 'http://localhost:5173';

  if (!isDev) {
    try {
      targetUrl = await startProductionServer();
    } catch (err) {
      logMessage('FATAL: Could not start production server: ' + err.stack);
      const html = renderDiagnosticErrorHtml(err.message);
      await mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
      return;
    }
  }

  logMessage('Loading application URL into BrowserWindow: ' + targetUrl);
  try {
    await mainWindow.loadURL(targetUrl);
  } catch (err) {
    logMessage('Error loading URL: ' + err.message);
  }
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 820,
    minWidth: 1024,
    minHeight: 680,
    title: 'RSP MediBill',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
    backgroundColor: '#ffffff',
    show: false,
    autoHideMenuBar: false,
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    logMessage('webContents did-fail-load: [' + errorCode + '] ' + errorDescription + ' on ' + validatedURL);
  });

  mainWindow.webContents.on('render-process-gone', (event, details) => {
    logMessage('Renderer process gone: ' + JSON.stringify(details));
  });

  await loadAppIntoWindow();

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle external links safely
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function buildMenu() {
  const template = [
    {
      label: 'RSP MediBill',
      submenu: [
        { label: 'About RSP MediBill', role: 'about' },
        { type: 'separator' },
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: () => { if (mainWindow) mainWindow.reload(); },
        },
        {
          label: 'Force Reload',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => { if (mainWindow) mainWindow.webContents.reloadIgnoringCache(); },
        },
        {
          label: 'Toggle Developer Tools',
          accelerator: 'F12',
          click: () => { if (mainWindow) mainWindow.webContents.toggleDevTools(); },
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => app.quit(),
        },
      ],
    },
    {
      label: 'Billing',
      submenu: [
        {
          label: 'Print Receipt / Invoice',
          accelerator: 'CmdOrCtrl+P',
          click: () => { if (mainWindow) mainWindow.webContents.print(); },
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'resetZoom', accelerator: 'CmdOrCtrl+0' },
        { role: 'zoomIn', accelerator: 'CmdOrCtrl+=' },
        { role: 'zoomOut', accelerator: 'CmdOrCtrl+-' },
        { type: 'separator' },
        { role: 'togglefullscreen', accelerator: 'F11' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'View Diagnostic Logs',
          click: () => {
            const logFile = path.join(app.getPath('userData'), 'server.log');
            if (fs.existsSync(logFile)) shell.showItemInFolder(logFile);
          },
        },
        {
          label: 'Documentation & Support',
          click: () => shell.openExternal('https://rspsoftwares.com'),
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// IPC Handlers
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});
ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  }
});
ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});
ipcMain.on('retry-startup', async () => {
  logMessage('Retrying startup requested by renderer...');
  stopProductionServer();
  if (mainWindow) await loadAppIntoWindow();
});
ipcMain.on('open-log-folder', () => {
  const logFile = path.join(app.getPath('userData'), 'server.log');
  if (fs.existsSync(logFile)) {
    shell.showItemInFolder(logFile);
  } else {
    shell.openPath(app.getPath('userData'));
  }
});

app.whenReady().then(async () => {
  buildMenu();
  await createWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on('will-quit', () => {
  stopProductionServer();
});

app.on('window-all-closed', () => {
  stopProductionServer();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
